"""
Email Service — HIMADRI asset-alert escalation notifications.

Restores the old InfraMind email-alert feature, re-adapted to HIMADRI's real
alert model: instead of an IT node "going down" with a revenue-at-risk
dollar figure, this fires when a station asset alert reaches Critical or
Emergency severity and escalates unacked past its timer (FR-60, see
backend/services/alert_engine.py's escalate_due_alerts()).

Sends via Resend's plain HTTP API (no SDK — httpx is already a dependency)
rather than the frontend's old direct Resend-from-Next.js approach, because
the backend is the system that first detects the escalation (FR-60 already
runs on a 5s sweep in backend/main.py's _sweep_commands_and_alerts()) — one
system detects and acts, no cross-system polling/webhook needed.

Fire-and-forget posture: a missing RESEND_API_KEY or a Resend HTTP failure
is logged and swallowed here, never raised, so a broken/unset mailer can
never break alert escalation itself (matches how offline-detection/command
sweep side effects like WS broadcasts already don't block on failure).

Recipients are NOT a user/auth concept — see context/BACKLOG.md's "Boundary
reminder": this backend never learns about users/roles. A
NotificationRecipient is plain operational config (an email address to
notify), closer to AlertRule than to a User — the Clerk+MongoDB user/role
layer lives entirely in the frontend repo and never enters this module.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx
import structlog
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.models.tables import Alert, Asset, NotificationRecipient, Station

logger = structlog.get_logger(__name__)

RESEND_URL = "https://api.resend.com/emails"

_SEVERITY_COLORS = {
    "emergency": "#ff4d5e",
    "critical": "#ff8a3d",
    "warning": "#ffd166",
    "info": "#7dd3fc",
}


def _fmt_time(value: datetime | None) -> str:
    if value is None:
        return "unknown"
    return value.strftime("%Y-%m-%d %H:%M UTC")


def render_alert_email_html(
    *,
    station_name: str,
    asset_name: str,
    severity: str,
    category: str,
    message: str,
    first_seen: datetime | None,
    occurrences: int,
    asset_url: str,
) -> str:
    """Inline-styled, table-based HTML (email clients strip <style> tags).
    HIMADRI-branded ice-blue palette — deliberately not the old
    crimson/IT-outage template this feature is being restored from."""
    color = _SEVERITY_COLORS.get(severity, "#7dd3fc")
    return f"""\
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a1420;padding:32px 0;font-family:Segoe UI,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#0f1e2e;border:1px solid #1c3347;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background-color:#0d2436;padding:20px 28px;border-bottom:2px solid {color};">
            <span style="color:#8ecbe6;font-size:12px;letter-spacing:2px;text-transform:uppercase;">HIMADRI &middot; Antarctic Station Digital Twin</span>
            <div style="color:#ffffff;font-size:18px;font-weight:600;margin-top:6px;">
              Alert Escalated &mdash; {severity.upper()}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#d7e6f0;">
              <tr>
                <td style="padding:6px 0;color:#7fa8c0;width:140px;">Station</td>
                <td style="padding:6px 0;color:#ffffff;font-weight:600;">{station_name}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#7fa8c0;">Asset</td>
                <td style="padding:6px 0;color:#ffffff;font-weight:600;">{asset_name}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#7fa8c0;">Severity</td>
                <td style="padding:6px 0;"><span style="color:{color};font-weight:700;text-transform:uppercase;">{severity}</span></td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#7fa8c0;">Category</td>
                <td style="padding:6px 0;color:#ffffff;">{category}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#7fa8c0;">First seen</td>
                <td style="padding:6px 0;color:#ffffff;">{_fmt_time(first_seen)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#7fa8c0;">Occurrences</td>
                <td style="padding:6px 0;color:#ffffff;">{occurrences}</td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
              <tr>
                <td style="background-color:#0a1c2b;border:1px solid #1c3347;border-radius:6px;padding:14px 16px;color:#e7f2f8;font-size:14px;line-height:1.5;">
                  {message}
                </td>
              </tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;">
              <tr>
                <td style="background-color:#1a8fb0;border-radius:6px;">
                  <a href="{asset_url}" style="display:inline-block;padding:10px 20px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">
                    View in HIMADRI &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 28px;border-top:1px solid #1c3347;color:#5c7d90;font-size:11px;">
            This alert has been open and unacknowledged long enough to escalate to the Station Leader and HQ (FR-60).
            Acknowledge or resolve it in HIMADRI to stop further escalation notices.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
"""


async def _send_email(to_email: str, subject: str, html: str) -> bool:
    """POST to Resend's HTTP API. No-ops (with a warning) if RESEND_API_KEY
    is unset; swallows and logs any transport/API failure. Never raises —
    callers must be able to fire this without risking their own transaction."""
    if not settings.RESEND_API_KEY:
        logger.warning("email.no_api_key", to=to_email, subject=subject)
        return False

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                RESEND_URL,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": settings.EMAIL_FROM,
                    "to": [to_email],
                    "subject": subject,
                    "html": html,
                },
            )
        if resp.status_code >= 400:
            logger.error("email.send_failed", to=to_email, status=resp.status_code, body=resp.text[:500])
            return False
        logger.info("email.sent", to=to_email, subject=subject)
        return True
    except Exception as e:  # noqa: BLE001 — fire-and-forget, never propagate
        logger.error("email.send_error", to=to_email, error=str(e))
        return False


def _asset_url(asset_id: str) -> str:
    return f"{settings.FRONTEND_BASE_URL.rstrip('/')}/assets/{asset_id}"


async def _active_recipients_for_station(db: AsyncSession, station_id: str) -> list[NotificationRecipient]:
    result = await db.execute(
        select(NotificationRecipient).where(
            and_(
                NotificationRecipient.active == True,  # noqa: E712
                or_(NotificationRecipient.station_id.is_(None), NotificationRecipient.station_id == station_id),
            )
        )
    )
    return list(result.scalars().all())


async def notify_alert_escalated(db: AsyncSession, alert: Alert) -> None:
    """Look up active recipients for `alert`'s station (station-matching or
    station-null/fleet-wide) and fire one escalation email to each. Never
    raises — a bad recipient or a Resend outage must not affect the caller's
    already-committed alert-escalation transaction."""
    try:
        recipients = await _active_recipients_for_station(db, alert.station_id)
        if not recipients:
            return

        asset = await db.get(Asset, alert.asset_id)
        station = await db.get(Station, alert.station_id)
        asset_name = asset.name if asset else alert.asset_id
        station_name = station.name if station else alert.station_id

        html = render_alert_email_html(
            station_name=station_name,
            asset_name=asset_name,
            severity=alert.severity,
            category=alert.category,
            message=alert.message,
            first_seen=alert.first_seen,
            occurrences=alert.occurrences,
            asset_url=_asset_url(alert.asset_id),
        )
        subject = f"[HIMADRI] {alert.severity.upper()} escalation — {asset_name}"

        for recipient in recipients:
            await _send_email(recipient.email, subject, html)
    except Exception as e:  # noqa: BLE001 — see module docstring
        logger.error("notification.escalation_dispatch_failed", alert_id=alert.id, error=str(e))


async def notify_escalated_alerts(db: AsyncSession, alerts: list[Alert]) -> None:
    """Fan-out helper for a batch of just-escalated alerts (main.py's sweep
    loop). Each alert is notified independently so one bad recipient/asset
    lookup doesn't block the rest of the batch."""
    for alert in alerts:
        await notify_alert_escalated(db, alert)


async def send_test_email(
    db: AsyncSession,
    *,
    to_email: str | None,
    station_id: str | None,
) -> dict[str, Any]:
    """Fires a realistic sample escalation email so an admin can see the
    format without waiting for a real Critical/Emergency escalation.
    If `to_email` is given, sends only to that address; otherwise sends to
    every active recipient (station-matching or station-null)."""
    sample_station_name = "Maitri"
    sample_asset_name = "Diesel Generator 2"
    if station_id:
        station = await db.get(Station, station_id)
        if station:
            sample_station_name = station.name

    html = render_alert_email_html(
        station_name=sample_station_name,
        asset_name=sample_asset_name,
        severity="critical",
        category="power",
        message=(
            f"{sample_asset_name} load factor exceeded 95% for over 15 minutes "
            "and has not been acknowledged — this is a sample/test notification."
        ),
        first_seen=datetime.utcnow(),
        occurrences=3,
        asset_url=_asset_url("sample-asset"),
    )
    subject = "[HIMADRI] TEST — Critical escalation sample"

    if to_email:
        targets = [to_email]
    else:
        recipients = (
            await _active_recipients_for_station(db, station_id)
            if station_id
            else list((await db.execute(select(NotificationRecipient).where(NotificationRecipient.active == True))).scalars().all())  # noqa: E712
        )
        targets = [r.email for r in recipients]

    sent = 0
    for target in targets:
        if await _send_email(target, subject, html):
            sent += 1

    return {"attempted": len(targets), "sent": sent, "api_key_configured": bool(settings.RESEND_API_KEY)}
