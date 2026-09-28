"""HTTP contract checks that do not require external services."""

import unittest
import asyncio
import gzip
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.config import settings
from backend.database.postgres import get_db
from backend.main import app
from backend.models.tables import Station
from backend.routers.contract_v1 import _series_for
from backend.routers.sync import content_hash
from backend.routers.devices import list_devices


class FakeDatabase:
    async def get(self, model, identifier):
        if model is Station and identifier == "maitri":
            return SimpleNamespace(id=identifier)
        return SimpleNamespace(id=identifier) if identifier == "maitri.generator.01" else None


async def fake_database():
    yield FakeDatabase()


class ContractRoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = fake_database
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        app.dependency_overrides.clear()

    def test_versioned_routes_are_documented(self):
        paths = app.openapi()["paths"]
        expected = {
            "/api/v1/series": "get",
            "/api/v1/readings/latest": "get",
            "/api/v1/readings/manual": "post",
            "/api/v1/assets/{asset_id}/qr.svg": "get",
            "/api/v1/analytics/forecast": "post",
            "/api/v1/analytics/simulate": "post",
            "/api/v1/agent/query": "post",
            "/api/v1/reports/environmental": "get",
            "/api/telemetry/latest": "get",
            "/api/v1/telemetry/ingest": "post",
        }
        for path, method in expected.items():
            self.assertIn(method, paths[path])

    def test_polartwin_gateway_ingest_updates_live_telemetry(self):
        body = {
            "gatewayId": "polar-twin-uno",
            "timestamp": "2026-09-28T00:00:00Z",
            "readings": [
                {"deviceId": "sensor-dht-01", "value": 21.5, "unit": "°C"},
                {"deviceId": "sensor-humidity-01", "value": 48.0, "unit": "%"},
            ],
        }
        with patch.object(settings, "DIGITAL_TWIN_INGEST_KEY", "test-device-key"):
            rejected = self.client.post("/api/v1/telemetry/ingest", json=body)
            accepted = self.client.post(
                "/api/v1/telemetry/ingest",
                json=body,
                headers={"X-Device-Key": "test-device-key"},
            )

        self.assertEqual(rejected.status_code, 401)
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["accepted"], 2)
        latest = self.client.get("/api/telemetry/latest")
        self.assertEqual(latest.status_code, 200)
        devices = {device["deviceId"]: device for device in latest.json()}
        self.assertEqual(devices["sensor-dht-01"]["value"], 21.5)
        self.assertEqual(devices["sensor-humidity-01"]["value"], 48.0)

        legacy = self.client.post(
            "/api/telemetry/ingest",
            json=body,
            headers={"X-Device-Key": "test-device-key"},
        )
        self.assertEqual(legacy.status_code, 200)

    def test_series_keys_preserve_dotted_asset_ids(self):
        asset = SimpleNamespace(
            id="maitri.generator.01", station_id="maitri",
            primary_series="power_kw", primary_unit="kW",
            manifest={"device_id": "dev-01", "series": [
                {"name": "power_kw", "unit": "kW", "critical": True},
                {"name": "fuel_lph", "unit": "L/h"},
            ]},
        )
        keys = [series["key"] for series in _series_for(asset)]
        self.assertEqual(keys, ["maitri.generator.01.power_kw", "maitri.generator.01.fuel_lph"])

    def test_error_envelope_and_node_headers(self):
        response = self.client.get("/api/v1/series")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"]["code"], "AUTH_REQUIRED")
        self.assertIn("request_id", response.json()["error"])
        self.assertEqual(response.headers["X-Node-Id"], settings.NODE_ID)
        self.assertEqual(response.headers["X-Link-State"], settings.LINK_STATE)

    def test_qr_svg_is_real_and_unknown_assets_are_rejected(self):
        headers = {"Authorization": f"Bearer {settings.API_SECRET_KEY}"}
        response = self.client.get("/api/v1/assets/maitri.generator.01/qr.svg", headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertIn("image/svg+xml", response.headers["content-type"])
        self.assertIn(b"<svg", response.content)
        missing = self.client.get("/api/v1/assets/unknown/qr.svg", headers=headers)
        self.assertEqual(missing.status_code, 404)

    def test_environmental_downloads_use_requested_format(self):
        headers = {"Authorization": f"Bearer {settings.API_SECRET_KEY}"}
        content = {
            "range_from": "2026-09-01T00:00:00", "range_to": "2026-09-25T00:00:00",
            "waste_records_total": 1, "backhaul_pending": 1,
            "waste_by_stream": {"plastic": {"mass_kg": 12.0, "volume_l": 8.0, "count": 1}},
        }
        with patch("backend.routers.contract_v1._generate_environmental_report",
                   new=AsyncMock(return_value=("Environmental Report", content, "Summary"))):
            csv_response = self.client.get("/api/v1/reports/environmental?station=maitri&format=csv", headers=headers)
            pdf_response = self.client.get("/api/v1/reports/environmental?station=maitri&format=pdf", headers=headers)
        self.assertEqual(csv_response.status_code, 200)
        self.assertIn("plastic,12.0,8.0,1", csv_response.text)
        self.assertEqual(pdf_response.status_code, 200)
        self.assertTrue(pdf_response.content.startswith(b"%PDF"))

    def test_live_requires_auth_and_accepts_series_subscription(self):
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/api/v1/live"):
                pass
        headers = {"Authorization": f"Bearer {settings.API_SECRET_KEY}"}
        with self.client.websocket_connect("/api/v1/live", headers=headers) as socket:
            socket.send_json({"subscribe": {"series": ["maitri.generator.01.power_kw"]}})
            self.assertEqual(socket.receive_json()["event"], "subscribed")

    def test_sync_batch_checks_hash_and_accepts_gzip(self):
        class SyncDatabase:
            def __init__(self):
                self.rows = []

            async def get(self, model, key):
                return None

            def add(self, row):
                self.rows.append(row)

            async def flush(self):
                pass

        database = SyncDatabase()

        async def override():
            yield database

        app.dependency_overrides[get_db] = override
        try:
            payload = {"action": "alert.ack", "station_id": "maitri"}
            item = {"node_id": "station-1", "seq": 1, "table_name": "audit_event",
                    "row_id": "1", "op": "insert", "payload": payload,
                    "content_hash": content_hash(payload), "priority": 0}
            headers = {"Authorization": f"Bearer {settings.API_SECRET_KEY}", "Content-Encoding": "gzip"}
            response = self.client.post("/api/v1/sync/batch", content=gzip.compress(json.dumps({"items": [item]}).encode()), headers=headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["acked_seqs"], [1])
            self.assertEqual(len(database.rows), 1)
            item["content_hash"] = "0" * 64
            rejected = self.client.post("/api/v1/sync/batch", content=gzip.compress(json.dumps({"items": [item]}).encode()), headers=headers)
            self.assertEqual(rejected.status_code, 422)
        finally:
            app.dependency_overrides[get_db] = fake_database

    def test_devices_list_maps_asset_fields(self):
        asset = SimpleNamespace(id="maitri.generator.01", name="Generator",
                                station_id="maitri", category="power",
                                approved=False, manifest=None, last_seen=None)
        db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(
            scalars=lambda: SimpleNamespace(all=lambda: [asset]))))
        devices = asyncio.run(list_devices(pending=False, db=db))
        self.assertEqual(devices[0].asset_id, asset.id)
        self.assertEqual(devices[0].asset_name, asset.name)
        self.assertFalse(devices[0].approved)

    def test_compare_rejects_invalid_scenario_ids(self):
        headers = {"Authorization": f"Bearer {settings.API_SECRET_KEY}"}
        response = self.client.get("/api/v1/scenarios/compare?ids=maitri", headers=headers)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "VALIDATION_FAILED")


if __name__ == "__main__":
    unittest.main()
