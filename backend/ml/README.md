# backend/ml — synthetic logistics dataset + forecasting models

Everything here is **synthetic**. The numbers are generated from physically motivated equations
(colder + windier → more heating fuel, blizzards stop vehicles, summer brings a larger crew) and are
not measurements from Maitri or Bharati.

```
python generate_dataset.py   # -> data/synthetic_logistics_daily.csv, data/synthetic_assets_daily.csv
python train_forecast.py     # -> ../../frontend/public/models/forecast-model.json
```

* **Consumption models** (fuel L, power kWh, food kg, water L per day): gradient boosting, compared with
  ridge and a seasonal-naive baseline; the lower hold-out MAE is exported (ridge wins for water).
* **Machine-health model**: one direct multi-horizon GBM (1–21 days, windows with no maintenance).
* Chronological split (train → calibration → test). Calibration only sizes the 80 % intervals; coverage is
  reported on the untouched test window. Not validated against real data.
* The browser evaluates the exported trees in `frontend/src/lib/forecast/engine.ts`
  (`parity` samples in the JSON let you check it matches scikit-learn).
