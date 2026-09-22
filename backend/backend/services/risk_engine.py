"""
Risk Engine — computes per-asset risk/health scores, and the explainable,
weighted Antarctic Risk Heatmap cells (FR-75…77).

Deliberately NOT a trained model for the heatmap: there is no historical
failure dataset for Indian Antarctic stations, so anything "ML" here would be
fitted to the simulator's own synthetic noise and would be dishonest under
questioning. An explicit weighted sum that a reviewer can interrogate factor
by factor is both defensible and more useful (see 02-ARCHITECTURE.md §3.4).

Two scoring surfaces:
  1. compute_asset_risk() — per-asset 0-100 risk/health score (drives the
     asset card / twin tile colour), from ML failure probability + blast
     radius (dependent count) + active alerts.
  2. compute_risk_cell() — per zone/subsystem composite risk score for the
     Antarctic Risk Heatmap, from five named, weighted, evidenced factors.
"""

from __future__ import annotations

import structlog

logger = structlog.get_logger(__name__)

# ─── Per-asset risk (weights sum to 1.0) ────────────────────────────────────

FAILURE_PROB_WEIGHT = 0.45
DEPENDENCY_WEIGHT = 0.25
ALERT_WEIGHT = 0.30


def _failure_prob_score(failure_prob_pct: float | None) -> float:
    """0-100 risk contribution from the predictive-maintenance model's
    24h failure probability (falls back to 0 until a model exists)."""
    if failure_prob_pct is None:
        return 0.0
    return max(0.0, min(100.0, failure_prob_pct))


def _dependency_score(dependent_count: int) -> float:
    """0-100 risk contribution from how many assets depend on this one.
    More dependents = higher blast radius if it fails."""
    if dependent_count == 0:
        return 0.0
    if dependent_count == 1:
        return 25.0
    if dependent_count == 2:
        return 50.0
    if dependent_count <= 5:
        return 75.0
    return 100.0


def _alert_score(critical_count: int, warning_count: int) -> float:
    """0-100 risk contribution from currently-open alerts. Capped at 100."""
    return min((critical_count * 25) + (warning_count * 10), 100.0)


def compute_asset_risk(
    failure_prob_pct: float | None,
    dependent_count: int,
    active_critical_alerts: int,
    active_warning_alerts: int,
) -> tuple[float, float, str]:
    """
    Compute (risk_score, health_score, risk_level) for one asset.
    risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    """
    failure = _failure_prob_score(failure_prob_pct)
    dep = _dependency_score(dependent_count)
    alerts = _alert_score(active_critical_alerts, active_warning_alerts)

    risk_score = (
        FAILURE_PROB_WEIGHT * failure
        + DEPENDENCY_WEIGHT * dep
        + ALERT_WEIGHT * alerts
    )
    risk_score = round(min(max(risk_score, 0.0), 100.0), 2)
    health_score = round(100.0 - risk_score, 2)

    if risk_score <= 30:
        risk_level = "LOW"
    elif risk_score <= 60:
        risk_level = "MEDIUM"
    elif risk_score <= 80:
        risk_level = "HIGH"
    else:
        risk_level = "CRITICAL"

    logger.debug(
        "risk_engine.asset_computed",
        risk_score=risk_score,
        health_score=health_score,
        risk_level=risk_level,
    )
    return risk_score, health_score, risk_level


# ─── Antarctic Risk Heatmap (FR-75…77) ──────────────────────────────────────

# Weights sum to 1.0; every factor returns {score (0-100), weight, evidence}
# so a cell can always explain itself on click (FR-77) — never just a colour.
RISK_CELL_WEIGHTS = {
    "equipment_failure": 0.30,
    "consumable_endurance": 0.25,
    "weather_severity": 0.15,
    "isolation_proximity": 0.15,
    "medical_capability_gap": 0.15,
}


def compute_risk_cell(
    *,
    equipment_failure_prob_pct: float,
    equipment_evidence: str,
    consumable_endurance_days: float,
    isolation_remaining_days: float,
    consumable_evidence: str,
    weather_severity_score: float,
    weather_evidence: str,
    isolation_evidence: str,
    medical_gap_score: float,
    medical_evidence: str,
) -> dict:
    """
    Compute one Risk Heatmap cell (a station/zone/subsystem combination).

    - equipment_failure_prob_pct: 0-100, from the predictive-maintenance model
      (or a heuristic — running hours/duty cycle/fault history — if no model
      exists yet for the asset).
    - consumable_endurance_days vs isolation_remaining_days: endurance margin
      — if fuel/food runs out *before* the isolation window ends, that's the
      highest-severity input this model has.
    - weather_severity_score: 0-100, from the current/forecast AWS reading
      (wind speed, temperature extremity) — a placeholder heuristic in v1,
      not a numerical weather model.
    - medical_gap_score: 0-100, static per-station capability gap (e.g.
      Maitri has no anaesthesia support — see FR-76).
    """
    margin_days = consumable_endurance_days - isolation_remaining_days
    if margin_days <= 0:
        endurance_score = 100.0
    elif margin_days <= 7:
        endurance_score = 80.0
    elif margin_days <= 30:
        endurance_score = 50.0
    elif margin_days <= 90:
        endurance_score = 20.0
    else:
        endurance_score = 0.0

    if isolation_remaining_days <= 0:
        isolation_score = 0.0
    elif isolation_remaining_days <= 30:
        isolation_score = 90.0
    elif isolation_remaining_days <= 90:
        isolation_score = 60.0
    elif isolation_remaining_days <= 180:
        isolation_score = 30.0
    else:
        isolation_score = 10.0

    factors = [
        {
            "name": "equipment_failure",
            "label": "Equipment failure probability",
            "score": round(max(0.0, min(100.0, equipment_failure_prob_pct)), 1),
            "weight": RISK_CELL_WEIGHTS["equipment_failure"],
            "evidence": equipment_evidence,
        },
        {
            "name": "consumable_endurance",
            "label": "Consumable endurance margin",
            "score": round(endurance_score, 1),
            "weight": RISK_CELL_WEIGHTS["consumable_endurance"],
            "evidence": consumable_evidence
            or f"{consumable_endurance_days:.0f}d endurance vs {isolation_remaining_days:.0f}d isolation remaining",
        },
        {
            "name": "weather_severity",
            "label": "Weather severity forecast",
            "score": round(max(0.0, min(100.0, weather_severity_score)), 1),
            "weight": RISK_CELL_WEIGHTS["weather_severity"],
            "evidence": weather_evidence,
        },
        {
            "name": "isolation_proximity",
            "label": "Isolation-period proximity",
            "score": round(isolation_score, 1),
            "weight": RISK_CELL_WEIGHTS["isolation_proximity"],
            "evidence": isolation_evidence
            or f"{isolation_remaining_days:.0f} days of PNR isolation remaining",
        },
        {
            "name": "medical_capability_gap",
            "label": "Medical capability gap",
            "score": round(max(0.0, min(100.0, medical_gap_score)), 1),
            "weight": RISK_CELL_WEIGHTS["medical_capability_gap"],
            "evidence": medical_evidence,
        },
    ]

    score = round(sum(f["score"] * f["weight"] for f in factors), 2)
    return {"score": score, "factors": factors}
