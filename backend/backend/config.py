"""
Backend configuration — loaded from .env via pydantic-settings.
Import `settings` from this module anywhere in the backend.
"""

# pyrefly: ignore [missing-import]
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # PostgreSQL
    POSTGRES_URL: str = "postgresql+asyncpg://himadri:himadri@localhost:5432/himadri"

    # Neo4j
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "himadri"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # MQTT (Mosquitto) — second, standard IoT telemetry ingest path
    # alongside the device agent's HTTP heartbeat (backend/routers/agents.py),
    # for real sensor gateways/hardware to publish directly (topic contract:
    # himadri/{station_id}/{asset_id}/{series_name} — see
    # backend/services/mqtt_ingest.py). Defaults to localhost, same reasoning
    # as POSTGRES_URL/NEO4J_URI/REDIS_URL above (so `uvicorn` run directly on
    # the host still finds a broker exposed via `docker compose up mosquitto`
    # at localhost:1883) — docker-compose.yml overrides MQTT_BROKER_HOST to
    # the `mosquitto` service hostname when the backend itself also runs
    # inside the compose network, exactly like it does for neo4j/postgres.
    MQTT_ENABLED: bool = True
    MQTT_BROKER_HOST: str = "localhost"
    MQTT_BROKER_PORT: int = 1883

    # API Security
    API_SECRET_KEY: str = "changeme_for_hackathon"
    NODE_ID: str = "himadri-local"
    LINK_STATE: str = "unknown"
    HQ_SYNC_URL: str = ""
    SYNC_BYTES_BUDGET: int = 5_000_000

    # MCP server (exposes a curated set of read/report/simulation/analytics
    # endpoints as MCP tools for the natural-language Operations Agent)
    MCP_ENABLED: bool = True

    # Device heartbeat behaviour
    HEARTBEAT_INTERVAL: int = 10
    # 24h default — the demo/static seed (scripts/seed_himadri_demo.py) writes
    # assets once with nothing heartbeating for them afterward, so this needs
    # to comfortably outlast a demo session or the offline-detection
    # background task (backend/main.py) marks every seeded asset offline
    # within minutes. Lower this (e.g. 60) once real per-asset device agents
    # are heartbeating continuously.
    OFFLINE_TIMEOUT_SECONDS: int = 86400

    # Emission factors, kg CO2e per litre (FR-50) — configurable, versioned
    # here as a simple settings value since there's no HQ-editable config
    # table in v1; a demo/report can still cite "source: configurable".
    EMISSION_FACTOR_ATF: float = 2.53
    EMISSION_FACTOR_DIESEL: float = 2.68
    EMISSION_FACTOR_PETROL: float = 2.31

    # Email alerting (Resend HTTP API — no SDK, see backend/services/email_service.py).
    # Empty RESEND_API_KEY means "no-op with a warning log" — a missing key must
    # never break alert escalation itself (FR-60 keeps working with 0 recipients).
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "HIMADRI Alerts <onboarding@resend.dev>"
    # Base URL the escalation email links back to (e.g. /assets/{id}) — point
    # this at the deployed frontend origin outside local dev.
    FRONTEND_BASE_URL: str = "http://localhost:3000"

    # App
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"


settings = Settings()
