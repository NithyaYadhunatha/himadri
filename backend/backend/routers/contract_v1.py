"""Routes from the public v1 contract that do not have a legacy equivalent.

The existing data store keeps telemetry as JSON per asset reading, so the
series endpoints project that data into the contract's series-shaped view.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import BytesIO, StringIO
import csv
import math
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import qrcode
from qrcode.image.svg import SvgPathImage

from backend.database.postgres import get_db
from backend.config import settings
from backend.dependencies import require_bearer
from backend.models.tables import Alert, Asset, Convoy, InventoryItem, Reading, Station, Zone
from backend.schemas.schemas import AssetDetail, DeviceManifest, RunScenarioRequest
from backend.routers.devices import register_device_manifest
from backend.routers.scenarios import run_scenario
from backend.services import audit_engine
from backend.services.report_engine import _generate_environmental_report

router = APIRouter(tags=["v1 contract"], dependencies=[Depends(require_bearer)])


def _series_for(asset: Asset) -> list[dict]:
    manifest = asset.manifest or {}
    declared = manifest.get("series", [])
    if not declared and asset.primary_series:
        declared = [{"name": asset.primary_series, "unit": asset.primary_unit or "", "kind": "gauge"}]
    return [
        {
            "key": f"{asset.id}.{item['name']}",
            "asset_id": asset.id,
            "station_id": asset.station_id,
            "device_id": manifest.get("device_id"),
            "label": item.get("label") or item["name"],
            "unit": item.get("unit", ""),
            "kind": item.get("kind", "gauge"),
            "critical": bool(item.get("critical", False)),
            "stale_after_seconds": item.get("stale_after_seconds"),
        }
        for item in declared if isinstance(item, dict) and item.get("name")
    ]


async def _find_series(db: AsyncSession, key: str) -> tuple[Asset, dict, str]:
    # Asset ids contain dots; resolve against registered assets rather than
    # splitting the key on the first dot.
    assets = (await db.execute(select(Asset))).scalars().all()
    for asset in assets:
        for series in _series_for(asset):
            if series["key"] == key:
                return asset, series, key[len(asset.id) + 1:]
    raise HTTPException(status_code=404, detail="Series not found")


@router.get("/stations/{station_id}/model", operation_id="get_station_model")
async def get_station_model(station_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    station = await db.get(Station, station_id)
    if station is None:
        raise HTTPException(status_code=404, detail="Station not found")
    zones = (await db.execute(select(Zone).where(Zone.station_id == station_id))).scalars().all()
    return {
        "station_id": station.id,
        "model_ref": station.twin_model_ref,
        "zones": [{"id": z.id, "parent_id": z.parent_id, "name": z.name,
                   "kind": z.kind, "floor": z.floor, "restricted": z.restricted,
                   "geometry": z.layout, "provenance": z.provenance} for z in zones],
    }


@router.get("/assets/{asset_id}", operation_id="get_asset_with_live_context")
async def get_asset_with_live_context(asset_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    alerts = (await db.execute(select(Alert).where(Alert.asset_id == asset_id, Alert.state == "open")
              .order_by(Alert.last_seen.desc()))).scalars().all()
    detail = AssetDetail.model_validate(asset).model_dump(mode="json")
    detail["series"] = _series_for(asset)
    detail["open_alerts"] = [
        {"id": a.id, "severity": a.severity, "category": a.category,
         "message": a.message, "series_key": a.series_key, "last_seen": a.last_seen.isoformat()}
        for a in alerts
    ]
    return detail


@router.get("/assets/{asset_id}/qr.svg", operation_id="get_asset_qr_svg")
async def get_asset_qr_svg(asset_id: str, db: AsyncSession = Depends(get_db)) -> Response:
    if not await db.get(Asset, asset_id):
        raise HTTPException(status_code=404, detail="Asset not found")
    qr = qrcode.QRCode(box_size=8, border=4, image_factory=SvgPathImage)
    qr.add_data(asset_id)
    qr.make(fit=True)
    output = BytesIO()
    qr.make_image().save(output)
    return Response(content=output.getvalue(), media_type="image/svg+xml")


@router.get("/series", operation_id="list_series")
async def list_series(
    station: str | None = None, asset: str | None = None, critical: bool | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    query = select(Asset)
    if station:
        query = query.where(Asset.station_id == station)
    if asset:
        query = query.where(Asset.id == asset)
    assets = (await db.execute(query)).scalars().all()
    return [s for a in assets for s in _series_for(a) if critical is None or s["critical"] == critical]


def _naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


@router.get("/series/{key}/readings", operation_id="get_series_readings")
async def get_series_readings(
    key: str, date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    bucket: Literal["auto", "1m", "5m", "1h", "1d"] = "auto",
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    asset, series, name = await _find_series(db, key)
    query = select(Reading).where(Reading.asset_id == asset.id, Reading.values.has_key(name))  # noqa: W601
    # collected_at is a naive-UTC column; a tz-aware bound (e.g. a trailing Z)
    # would raise on comparison, so normalise to naive UTC first.
    if date_from:
        query = query.where(Reading.collected_at >= _naive_utc(date_from))
    if date_to:
        query = query.where(Reading.collected_at <= _naive_utc(date_to))
    readings = (await db.execute(query.order_by(Reading.collected_at.desc()).limit(2000))).scalars().all()
    rows = [{"series_key": key, "ts": r.collected_at, "value": r.values[name],
             "unit": (r.units or {}).get(name) or series["unit"], "source": r.source}
            for r in readings if name in r.values]
    if bucket == "auto":
        return rows
    seconds = {"1m": 60, "5m": 300, "1h": 3600, "1d": 86400}[bucket]
    grouped: dict[int, list[float]] = {}
    for row in rows:
        if isinstance(row["value"], (int, float)):
            slot = int(row["ts"].replace(tzinfo=timezone.utc).timestamp()) // seconds * seconds
            grouped.setdefault(slot, []).append(float(row["value"]))
    return [{"series_key": key, "ts": datetime.fromtimestamp(slot, timezone.utc),
             "value": sum(values) / len(values), "unit": series["unit"], "samples": len(values)}
            for slot, values in sorted(grouped.items(), reverse=True)]


@router.get("/readings/latest", operation_id="get_latest_readings")
async def get_latest_readings(keys: str, db: AsyncSession = Depends(get_db)) -> dict:
    result = {}
    for key in dict.fromkeys(k.strip() for k in keys.split(",") if k.strip()):
        asset, series, name = await _find_series(db, key)
        row = (await db.execute(select(Reading).where(
            Reading.asset_id == asset.id, Reading.values.has_key(name)  # noqa: W601
        ).order_by(Reading.collected_at.desc()).limit(1))).scalar_one_or_none()
        result[key] = ({"series_key": key, "ts": row.collected_at, "value": row.values[name],
                        "unit": (row.units or {}).get(name) or series["unit"], "source": row.source}
                       if row else None)
    return result


class ManualReading(BaseModel):
    series_key: str
    value: float
    ts: datetime | None = None
    entered_by: str = Field(min_length=1)


@router.post("/readings/manual", status_code=status.HTTP_201_CREATED, operation_id="create_manual_reading")
async def create_manual_reading(body: ManualReading, db: AsyncSession = Depends(get_db)) -> dict:
    asset, series, name = await _find_series(db, body.series_key)
    timestamp = body.ts or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    if timestamp > datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Reading timestamp cannot be in the future")
    reading = Reading(asset_id=asset.id, values={name: body.value}, units={name: series["unit"]},
                      source="manual", entered_by=body.entered_by,
                      collected_at=timestamp.replace(tzinfo=None))
    db.add(reading)
    latest = (await db.execute(select(Reading.collected_at).where(
        Reading.asset_id == asset.id, Reading.values.has_key(name)  # noqa: W601
    ).order_by(Reading.collected_at.desc()).limit(1))).scalar_one_or_none()
    if asset.primary_series == name and (latest is None or timestamp.replace(tzinfo=None) >= latest):
        asset.primary_value = body.value
    await db.flush()
    await audit_engine.record(db, user_id=body.entered_by, role=None, station_id=asset.station_id,
                              action="reading.manual", resource=body.series_key,
                              detail={"value": body.value, "ts": timestamp.isoformat()})
    return {"series_key": body.series_key, "ts": reading.collected_at, "value": body.value,
            "unit": series["unit"], "source": "manual"}


@router.post("/devices", status_code=status.HTTP_201_CREATED, operation_id="register_device")
async def register_device(body: DeviceManifest, db: AsyncSession = Depends(get_db)) -> dict:
    return await register_device_manifest(body, db)


class SimulateRequest(BaseModel):
    station: str
    inputs: dict
    horizon_days: int = Field(default=90, ge=1, le=3650)


@router.post("/analytics/simulate", status_code=status.HTTP_201_CREATED, operation_id="simulate_scenario")
async def simulate(body: SimulateRequest, db: AsyncSession = Depends(get_db)) -> dict:
    scenario = await run_scenario(RunScenarioRequest(station_id=body.station, name="What-if simulation",
                                                    inputs=body.inputs, horizon_days=body.horizon_days,
                                                    created_by=None), db)
    return scenario.model_dump(mode="json")


@router.get("/energy/fuel", operation_id="get_energy_fuel")
async def get_energy_fuel(station: str, db: AsyncSession = Depends(get_db)) -> dict:
    if not await db.get(Station, station):
        raise HTTPException(status_code=404, detail="Station not found")
    tanks = (await db.execute(select(InventoryItem).where(
        InventoryItem.station_id == station, InventoryItem.kind == "fuel"))).scalars().all()
    routine_litres = sum(i.quantity for i in tanks if i.unit == "L" and i.reserve_class == "routine")
    return {
        "station_id": station,
        "tanks": [{"id": i.id, "name": i.name, "subtype": i.subtype,
                   "quantity": i.quantity, "unit": i.unit, "capacity": i.capacity,
                   "reserve_class": i.reserve_class, "provenance": i.provenance} for i in tanks],
        "routine_litres": routine_litres,
        "burn_rate_lph": None,
        "endurance_days": None,
    }


@router.get("/energy/summary", operation_id="get_energy_summary")
async def get_energy_summary(station: str, db: AsyncSession = Depends(get_db)) -> dict:
    if not await db.get(Station, station):
        raise HTTPException(status_code=404, detail="Station not found")
    assets = (await db.execute(select(Asset).where(
        Asset.station_id == station, Asset.category.in_(["power", "heating"])
    ))).scalars().all()
    generators = [a for a in assets if a.subtype in ("generator", "chp", "solar", "wind_turbine")
                  and a.primary_series == "power_kw" and a.primary_value is not None]
    generation_kw = sum(a.primary_value for a in generators) if generators else None
    return {"station_id": station, "generation_kw": generation_kw,
            "load_kw": None, "efficiency": None, "waste_heat_recovered_kw": None,
            "source": "latest asset values"}


@router.get("/energy/carbon", operation_id="get_energy_carbon")
async def get_energy_carbon(
    station: str, date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    by: Literal["source", "day", "capita"] = "source", db: AsyncSession = Depends(get_db),
) -> dict:
    station_row = await db.get(Station, station)
    if station_row is None:
        raise HTTPException(status_code=404, detail="Station not found")
    end = date_to or datetime.now(timezone.utc)
    start = date_from or end - timedelta(days=30)
    if start >= end:
        raise HTTPException(status_code=422, detail="from must be before to")
    start_naive = start.replace(tzinfo=None)
    end_naive = end.replace(tzinfo=None)
    assets = (await db.execute(select(Asset).where(Asset.station_id == station))).scalars().all()
    by_asset = {}
    for asset in assets:
        rows = (await db.execute(select(Reading).where(
            Reading.asset_id == asset.id, Reading.values.has_key("fuel_lph"),  # noqa: W601
            Reading.collected_at >= start_naive, Reading.collected_at <= end_naive,
        ).order_by(Reading.collected_at))).scalars().all()
        if len(rows) > 1:
            by_asset[asset.id] = (asset, rows)
    factors = {"atf": settings.EMISSION_FACTOR_ATF, "diesel": settings.EMISSION_FACTOR_DIESEL,
               "petrol": settings.EMISSION_FACTOR_PETROL}
    buckets: dict[str, float] = {}
    covered_hours = 0.0
    for asset, rows in by_asset.values():
        fuel_type = str((asset.spec or {}).get("fuel_type", "diesel")).lower()
        factor = factors.get(fuel_type)
        if factor is None:
            continue
        for earlier, later in zip(rows, rows[1:]):
            hours = (later.collected_at - earlier.collected_at).total_seconds() / 3600
            if hours <= 0 or hours > 1:
                continue
            if (earlier.units or {}).get("fuel_lph") not in ("L/h", "L/hr"):
                continue
            if (later.units or {}).get("fuel_lph") not in ("L/h", "L/hr"):
                continue
            litres = (float(earlier.values["fuel_lph"]) + float(later.values["fuel_lph"])) / 2 * hours
            key = fuel_type if by != "day" else later.collected_at.date().isoformat()
            buckets[key] = buckets.get(key, 0.0) + litres * factor
            covered_hours += hours
    total = sum(buckets.values()) if covered_hours else None
    if by == "capita":
        headcount = station_row.winter_capacity
        buckets = {"per_capita_kgco2e": total / headcount} if total is not None and headcount else {}
    return {"station_id": station, "from": start, "to": end, "by": by,
            "total_kgco2e": total, "breakdown": buckets, "covered_hours": covered_hours,
            "status": "measured" if covered_hours else "insufficient_data"}


class ForecastRequest(BaseModel):
    station: str
    metric: str
    horizon_days: int = Field(ge=1, le=90)


@router.post("/analytics/forecast", operation_id="forecast_series")
async def forecast_series(body: ForecastRequest, db: AsyncSession = Depends(get_db)) -> dict:
    asset, series, name = await _find_series(db, body.metric)
    if asset.station_id != body.station:
        raise HTTPException(status_code=404, detail="Series not found for station")
    rows = (await db.execute(select(Reading).where(
        Reading.asset_id == asset.id, Reading.values.has_key(name)  # noqa: W601
    ).order_by(Reading.collected_at.desc()).limit(100))).scalars().all()
    samples = sorted(((r.collected_at, float(r.values[name])) for r in rows
                      if isinstance(r.values[name], (int, float))), key=lambda x: x[0])
    if len(samples) < 3:
        raise HTTPException(status_code=409, detail="At least three numeric readings are needed for a forecast")
    origin = samples[0][0]
    xs = [(ts - origin).total_seconds() / 86400 for ts, _ in samples]
    ys = [value for _, value in samples]
    xmean = sum(xs) / len(xs)
    ymean = sum(ys) / len(ys)
    denominator = sum((x - xmean) ** 2 for x in xs)
    slope = sum((x - xmean) * (y - ymean) for x, y in zip(xs, ys)) / denominator if denominator else 0.0
    intercept = ymean - slope * xmean
    residual_std = math.sqrt(sum((y - (intercept + slope * x)) ** 2 for x, y in zip(xs, ys)) / max(len(xs) - 2, 1))
    last_day = xs[-1]
    points = []
    for day in range(1, body.horizon_days + 1):
        estimate = intercept + slope * (last_day + day)
        margin = 1.96 * residual_std * math.sqrt(1 + day / max(last_day, 1))
        points.append({"ts": samples[-1][0] + timedelta(days=day), "value": estimate,
                       "ci_lower": estimate - margin, "ci_upper": estimate + margin})
    return {"station": body.station, "metric": body.metric, "unit": series["unit"],
            "method": "linear_trend", "sample_count": len(samples), "series": points}


class AgentQuery(BaseModel):
    station: str
    message: str = Field(min_length=1)
    conversation_id: str | None = None


@router.post("/agent/query", operation_id="query_operations_agent")
async def query_operations_agent(body: AgentQuery, db: AsyncSession = Depends(get_db)) -> dict:
    if not await db.get(Station, body.station):
        raise HTTPException(status_code=404, detail="Station not found")
    question = body.message.lower()
    citations = []
    if any(word in question for word in ("alert", "fault", "risk")):
        alerts = (await db.execute(select(Alert).where(
            Alert.station_id == body.station, Alert.state == "open"
        ).order_by(Alert.last_seen.desc()).limit(5))).scalars().all()
        answer = f"{len(alerts)} recent open alert(s). " + "; ".join(a.message for a in alerts)
        citations = [{"asset_id": a.asset_id, "ts": a.last_seen} for a in alerts]
    elif any(word in question for word in ("fuel", "food", "inventory")):
        items = (await db.execute(select(InventoryItem).where(
            InventoryItem.station_id == body.station
        ))).scalars().all()
        answer = "; ".join(f"{i.name}: {i.quantity:g} {i.unit}" for i in items[:10]) or "No inventory records are available."
    else:
        answer = "I can summarize current alerts and inventory for this station."
    return {"answer": answer, "citations": citations, "suggested_action": None,
            "mode": "fallback", "conversation_id": body.conversation_id}


class UpdateConvoy(BaseModel):
    season: str | None = None
    planned_start: datetime | None = None
    route_ref: str | None = None
    distance_km: float | None = Field(default=None, ge=0)
    medical_officer: str | None = None
    state: Literal["planned", "underway", "returned", "aborted"] | None = None


@router.patch("/convoys/{convoy_id}", operation_id="update_convoy")
async def update_convoy(convoy_id: str, body: UpdateConvoy, db: AsyncSession = Depends(get_db)) -> dict:
    convoy = await db.get(Convoy, convoy_id)
    if convoy is None:
        raise HTTPException(status_code=404, detail="Convoy not found")
    updates = body.model_dump(exclude_unset=True)
    if updates.get("state") == "underway":
        raise HTTPException(status_code=409, detail="Use the departure route for safety checks")
    for key, value in updates.items():
        setattr(convoy, key, value)
    await db.flush()
    await audit_engine.record(db, user_id=None, role=None, station_id=convoy.station_id,
                              action="convoy.update", resource=convoy_id, detail=updates)
    return {"id": convoy.id, "station_id": convoy.station_id, "season": convoy.season,
            "planned_start": convoy.planned_start, "route_ref": convoy.route_ref,
            "distance_km": convoy.distance_km, "medical_officer": convoy.medical_officer,
            "state": convoy.state}


@router.get("/reports/environmental", operation_id="download_environmental_report")
async def download_environmental_report(
    station: str, date_from: datetime | None = Query(default=None, alias="from"),
    date_to: datetime | None = Query(default=None, alias="to"),
    format: Literal["pdf", "csv"] = "pdf", db: AsyncSession = Depends(get_db),
) -> Response:
    if not await db.get(Station, station):
        raise HTTPException(status_code=404, detail="Station not found")
    title, content, _ = await _generate_environmental_report(
        db, station,
        date_from.replace(tzinfo=None) if date_from else None,
        date_to.replace(tzinfo=None) if date_to else None,
    )
    if format == "csv":
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["station_id", "range_from", "range_to", "stream", "mass_kg", "volume_l", "count"])
        for stream, totals in content["waste_by_stream"].items():
            writer.writerow([station, content["range_from"], content["range_to"], stream,
                             totals["mass_kg"], totals["volume_l"], totals["count"]])
        return Response(output.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{station}-environmental.csv"'})

    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    output_bytes = BytesIO()
    pdf = canvas.Canvas(output_bytes, pagesize=A4)
    pdf.setTitle(title)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(48, A4[1] - 54, "HIMADRI Environmental Report")
    pdf.setFont("Helvetica", 10)
    lines = [f"Station: {station}", f"From: {content['range_from']}", f"To: {content['range_to']}",
             f"Waste records: {content['waste_records_total']}",
             f"Backhaul pending: {content['backhaul_pending']}", "Waste by stream:"]
    for stream, totals in content["waste_by_stream"].items():
        lines.append(f"  {stream}: {totals['mass_kg']:.2f} kg, {totals['volume_l']:.2f} L ({totals['count']} records)")
    y = A4[1] - 85
    for line in lines:
        pdf.drawString(48, y, line)
        y -= 17
        if y < 60:
            pdf.showPage()
            pdf.setFont("Helvetica", 10)
            y = A4[1] - 48
    pdf.save()
    return Response(output_bytes.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{station}-environmental.pdf"'})
