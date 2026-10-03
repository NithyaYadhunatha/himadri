"""
generate_dataset.py — synthetic Antarctic-station logistics + machine datasets.

Everything here is SYNTHETIC. The generating equations are physically
motivated (heating demand grows as it gets colder, wind amplifies it,
blizzards confine people indoors and stop vehicle traffic, summer brings a
larger expedition crew), but the numbers are invented — they are NOT
measurements from Maitri or Bharati. The UI labels the resulting model
accordingly.

Outputs (backend/ml/data/):
  synthetic_logistics_daily.csv  one row per station-day: weather, crew,
                                 activity, consumption (fuel/power/food/water),
                                 and fuel/food stock after deliveries.
  synthetic_assets_daily.csv     one row per machine-day: load, temperature,
                                 vibration, fuel flow, health score, and
                                 maintenance / fault flags.

Run:  python generate_dataset.py
"""
from __future__ import annotations

import os
from datetime import date

import numpy as np
import pandas as pd

SEED = 42
START = date(2023, 1, 1)
END = date(2026, 10, 2)  # "yesterday" relative to the demo date
OUT = os.path.join(os.path.dirname(__file__), "data")

STATIONS = {
    # climate mean/amplitude (deg C), winter crew, summer expedition add-on,
    # and the stocks at END (matching the mock inventory the UI ships with)
    "maitri": dict(t_mean=-9.5, t_amp=10.5, crew=25, summer_add=13, wind=24, fuel_end=124_500, food_end=67_950, fuel_cap=156_000, food_cap=80_000),
    "bharati": dict(t_mean=-8.5, t_amp=9.5, crew=24, summer_add=11, wind=26, fuel_end=30_920, food_end=61_570, fuel_cap=42_000, food_cap=72_000),
}

# Machines (ids mirror frontend/src/lib/mockData/mockCommands.ts)
# (id, station, category, rated kW, wear rate)
MACHINES = [
    ("maitri-genset-1", "maitri", "power", 46.0, 0.34),
    ("maitri-genset-2", "maitri", "power", 38.5, 0.30),
    ("maitri-heating-plant", "maitri", "heating", 60.0, 0.26),
    ("maitri-water-plant", "maitri", "water", 12.0, 0.22),
    ("maitri-stp", "maitri", "waste", 5.0, 0.20),
    ("maitri-comms-vsat", "maitri", "comms", 1.2, 0.12),
    ("maitri-mara-radar", "maitri", "instrument", 3.0, 0.14),
    ("maitri-pistenbully-1", "maitri", "vehicle", 0.0, 0.46),
    ("bharati-chp-1", "bharati", "power", 52.0, 0.32),
    ("bharati-chp-2", "bharati", "power", 44.0, 0.30),
    ("bharati-ahu-1", "bharati", "heating", 40.0, 0.24),
    ("bharati-water-plant", "bharati", "water", 14.0, 0.22),
    ("bharati-black-water-tank", "bharati", "waste", 2.0, 0.18),
    ("bharati-comms-vsat", "bharati", "comms", 1.2, 0.12),
    ("bharati-gsi-instrument", "bharati", "instrument", 1.0, 0.10),
    ("bharati-pistenbully-vitesta", "bharati", "vehicle", 0.0, 0.44),
]
CATEGORY_CODE = {"power": 0, "heating": 1, "water": 2, "waste": 3, "comms": 4, "instrument": 5, "vehicle": 6}


def ar1(rng, n, phi, sd):
    out = np.zeros(n)
    for i in range(1, n):
        out[i] = phi * out[i - 1] + rng.normal(0, sd)
    return out


def season_peak(doy):
    """+1 at mid-January (austral summer), -1 at mid-July."""
    return np.cos(2 * np.pi * (doy - 15) / 365.25)


def build_logistics(rng) -> pd.DataFrame:
    days = pd.date_range(START, END, freq="D")
    n = len(days)
    doy = days.dayofyear.to_numpy()
    sp = season_peak(doy)
    frames = []
    for sid, p in STATIONS.items():
        temp = p["t_mean"] + p["t_amp"] * sp + ar1(rng, n, 0.82, 3.2)
        # winds are stronger in winter; lognormal gusts
        wind = p["wind"] * (1.0 - 0.22 * sp) * np.exp(rng.normal(0, 0.42, n))
        wind = np.clip(wind, 2, 130)
        blizzard = ((wind > 62) | (rng.random(n) < 0.012)).astype(int)
        summer_frac = np.clip((sp + 0.25) / 1.25, 0, 1)
        headcount = np.round(p["crew"] + p["summer_add"] * summer_frac ** 1.5 + rng.normal(0, 0.8, n)).astype(int)
        activity = np.clip(0.3 + 0.5 * summer_frac + rng.normal(0, 0.12, n), 0, 1)
        vehicle_h = np.clip((1.6 + 6.5 * summer_frac) * (1 - 0.7 * blizzard) + rng.normal(0, 0.7, n), 0, None)

        hdd = np.clip(16 - temp, 0, None)
        hdd_eff = 40 * np.tanh(hdd / 40)                          # heating demand saturates
        windchill = hdd_eff * np.clip(wind - 20, 0, None) / 55    # wind x cold interaction
        power = 450 + 24 * headcount + 17.5 * hdd_eff + 9 * windchill + 60 * activity + 45 * blizzard  # kWh/day
        power *= np.exp(rng.normal(0, 0.025, n))
        spec = 0.285 + 0.06 * np.exp(-power / 900)                # gensets are less efficient at part load (L/kWh)
        gen_fuel = power * spec
        boiler_fuel = 5.6 * hdd_eff * (1 + wind / 90)
        vehicle_fuel = 9.5 * vehicle_h
        fuel = (gen_fuel + boiler_fuel + vehicle_fuel) * np.exp(rng.normal(0, 0.03, n))

        # rare generator-inefficiency episodes (not predictable from the features)
        for _ in range(7):
            s = int(rng.integers(0, n - 6))
            fuel[s:s + int(rng.integers(3, 6))] *= rng.uniform(1.08, 1.18)

        food = headcount * (2.45 + 0.018 * hdd_eff + 0.35 * activity) * np.exp(rng.normal(0, 0.03, n))
        water = (headcount * (48 + 0.35 * hdd_eff) + 320 * activity + 90) * np.exp(rng.normal(0, 0.035, n))

        # Resupply: whenever a stock falls under ~30% of capacity a ship / convoy
        # run tops it back up to ~92%. The final delivery is trimmed so the
        # series ends on the present-day inventory the UI ships with.
        def stock_series(consumption, cap, end_value):
            stock = np.zeros(n)
            deliv = np.zeros(n)
            level = cap * 0.9
            last = -1
            for i in range(n):
                level -= consumption[i]
                if level < cap * 0.3:
                    deliv[i] = round(cap * 0.92 - level, -2)
                    level += deliv[i]
                    last = i
                stock[i] = level
            adj = end_value - stock[-1]
            if last >= 0:
                deliv[last] += adj
                stock[last:] += adj
            return stock, deliv

        fuel_stock, deliv_fuel = stock_series(fuel, p["fuel_cap"], p["fuel_end"])
        food_stock, deliv_food = stock_series(food, p["food_cap"], p["food_end"])

        frames.append(pd.DataFrame({
            "date": days, "station": sid, "headcount": headcount, "temp_c": temp.round(2),
            "wind_kph": wind.round(1), "blizzard": blizzard, "science_activity": activity.round(3),
            "vehicle_hours": vehicle_h.round(2),
            "power_kwh": power.round(1), "fuel_l": fuel.round(1), "food_kg": food.round(1), "water_l": water.round(0),
            "fuel_delivery_l": deliv_fuel, "food_delivery_kg": deliv_food,
            "fuel_stock_l": fuel_stock.round(0), "food_stock_kg": food_stock.round(0),
        }))
    return pd.concat(frames, ignore_index=True)


def build_assets(rng, logistics: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for mid, sid, cat, kw, wear in MACHINES:
        L = logistics[logistics.station == sid].reset_index(drop=True)
        n = len(L)
        temp_amb = L.temp_c.to_numpy()
        demand = L.power_kwh.to_numpy() / L.power_kwh.mean()
        load = np.clip(55 + 40 * (demand - 1.0) + rng.normal(0, 4, n), 15, 100)
        if cat == "vehicle":
            load = np.clip(L.vehicle_hours.to_numpy() / 9 * 100 + rng.normal(0, 6, n), 0, 100)
        health = np.zeros(n)
        health[0] = rng.uniform(80, 96)
        since = np.zeros(n, dtype=int)
        maint = np.zeros(n, dtype=int)
        fault = np.zeros(n, dtype=int)
        next_maint = int(rng.integers(60, 210))
        for i in range(1, n):
            cold = 1 + 0.025 * max(0, -temp_amb[i] - 5)             # cold starts wear faster
            rate = (wear / 2.2) * (0.45 + load[i] / 100) * cold * (1 + 0.5 * (health[i - 1] < 60))
            health[i] = health[i - 1] - rate + rng.normal(0, 0.18)
            since[i] = since[i - 1] + 1
            if health[i] < 48 and rng.random() < 0.12:                # unplanned fault -> repair
                fault[i], maint[i] = 1, 1
            elif since[i] >= next_maint:                               # planned maintenance
                maint[i] = 1
            if maint[i]:
                health[i] = rng.uniform(90, 98)
                since[i] = 0
                next_maint = int(rng.integers(60, 210))
            health[i] = min(health[i], 99.0)
        h = np.clip(health, 5, 100)
        vib = 1.1 + 0.075 * (100 - h) + 0.012 * load + rng.normal(0, 0.15, n)
        if cat in ("power", "vehicle", "heating"):
            temp = 35 + 0.35 * load + 0.16 * (100 - h) + 0.15 * temp_amb
        else:
            temp = 24 + 0.12 * load + 0.1 * (100 - h) + 0.2 * temp_amb
        temp = temp + rng.normal(0, 0.9, n)
        fuel_lph = np.zeros(n)
        if cat == "power":
            fuel_lph = kw * load / 100 * 0.3 * (1 + 0.004 * (100 - h)) + rng.normal(0, 0.4, n)
        elif cat == "vehicle":
            fuel_lph = 14 * load / 100 * (1 + 0.003 * (100 - h)) + rng.normal(0, 0.3, n)
        elif cat == "heating":
            fuel_lph = 6.5 * (1 + 0.5 * np.clip(16 - temp_amb, 0, 40) / 40) * (1 + 0.003 * (100 - h)) + rng.normal(0, 0.3, n)
        rows.append(pd.DataFrame({
            "date": L.date, "machine_id": mid, "station": sid, "category": cat, "category_code": CATEGORY_CODE[cat],
            "load_pct": load.round(1), "temp_c": temp.round(1), "vibration_mm_s": np.clip(vib, 0.3, None).round(2),
            "fuel_lph": np.clip(fuel_lph, 0, None).round(2), "health": h.round(2),
            "days_since_maintenance": since, "maintenance": maint, "fault": fault,
        }))
    return pd.concat(rows, ignore_index=True)


def main():
    rng = np.random.default_rng(SEED)
    os.makedirs(OUT, exist_ok=True)
    logistics = build_logistics(rng)
    assets = build_assets(rng, logistics)
    logistics.to_csv(os.path.join(OUT, "synthetic_logistics_daily.csv"), index=False)
    assets.to_csv(os.path.join(OUT, "synthetic_assets_daily.csv"), index=False)
    print("logistics rows:", len(logistics), "| asset rows:", len(assets))
    print(logistics.groupby("station")[["fuel_l", "power_kwh", "food_kg", "water_l", "fuel_stock_l"]].agg(["mean", "min", "max"]).round(0).T.to_string())
    print("faults:", int(assets.fault.sum()), "| maintenance events:", int(assets.maintenance.sum()))
    print(assets.groupby("machine_id").health.agg(["mean", "min"]).round(1).to_string())


if __name__ == "__main__":
    main()
