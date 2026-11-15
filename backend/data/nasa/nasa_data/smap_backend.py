#!/usr/bin/env python3
"""
SMAP SPL3SMP (v009) soil-moisture: cleaning pipeline + REST API backend.

Usage
-----
  # 1) Raw AppEEARS point-sample CSV  ->  analysis-ready CSV
  python smap_backend.py clean --raw usa-SMAP-SPL3SMP-009-results.csv --out smap_clean_final.csv

  # 2) Run the API  (needs: pip install fastapi uvicorn pandas numpy)
  python smap_backend.py serve --data smap_clean_final.csv --port 8000
  # or:  SMAP_DATA=smap_clean_final.csv uvicorn smap_backend:app --port 8000

Units: volumetric soil moisture, m3/m3 (cm3/cm3). Physical range ~0.02-0.65.

Cleaning rules (all reproducible, run again on any new SMAP CSV, e.g. Kharagpur)
-------------------------------------------------------------------------------
 1. -9999 fill value                      -> missing
 2. retrieval_qual_flag bit 2 set         -> missing  (retrieval "not successful",
                                             even when a number is present)
 3. value <= 0.02 or > 0.70               -> missing  (retrieval floor / non-physical)
 4. Calendar completed to every day       -> days SMAP has no file for become missing
 5. Gap filling per location (anomaly method):
      anomaly = observed - day-of-year climatology
      gap <= 7 days   : linear interpolation            -> Fill_Method = interpolated
      gap  > 7 days   : interpolated anomaly decays to 0 (e-fold 15 d) back to
                        climatology                      -> Fill_Method = climatology_blend
      no observation at all: mean of 2 nearest locations -> Fill_Method = neighbor_state
    Observed values are never altered.

Output columns
--------------
 ID, Latitude, Longitude, Date,
 Soil_Moisture         observed, QC-passed (blank where missing)
 Soil_Moisture_Filled  analysis-ready, no gaps
 Fill_Method           observed | interpolated | climatology_blend | neighbor_state
 Gap_Days              length of the gap this day belongs to (0 if observed)
 QC_Flag               original SMAP flag (blank for dates with no SMAP file)
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import numpy as np
import pandas as pd

FILL_VALUE = -9999
SM_MIN, SM_MAX = 0.02, 0.70
SHORT_GAP = 7          # days: linear interpolation up to this length
TAU = 15.0             # days: e-folding of anomaly persistence for long gaps
DEFAULT_DATA = Path(__file__).with_name("smap_clean_final.csv")


# ----------------------------------------------------------------------------
# Cleaning pipeline
# ----------------------------------------------------------------------------
def _detect_columns(raw: pd.DataFrame) -> dict:
    cols = list(raw.columns)

    def pick(pred, prefer=("_AM_", "_PM_")):
        hits = [c for c in cols if pred(c)]
        for p in prefer:
            for c in hits:
                if p in c:
                    return c
        return hits[0] if hits else None

    sm = pick(lambda c: c.endswith("_soil_moisture"))
    flag = pick(lambda c: c.endswith("_retrieval_qual_flag"))
    if sm is None:
        raise ValueError("Soil moisture column (…_soil_moisture) not found in CSV")
    return {"sm": sm, "flag": flag}


def _climatology(sm: np.ndarray, doy: np.ndarray) -> np.ndarray:
    """Day-of-year median of observed values; window widens until enough samples."""
    ok = ~np.isnan(sm)
    d_ok, v_ok = doy[ok], sm[ok]
    clim = np.full(367, np.nan)
    for w in (7, 15, 30, 60):
        for d in range(1, 367):
            if not np.isnan(clim[d]):
                continue
            diff = np.abs(d_ok - d)
            diff = np.minimum(diff, 366 - diff)
            sel = v_ok[diff <= w]
            if sel.size >= 8:
                clim[d] = np.median(sel)
    clim[np.isnan(clim)] = np.median(v_ok)
    return clim


def _fill_series(sm: np.ndarray, doy: np.ndarray):
    n = len(sm)
    t = np.arange(n)
    ok = ~np.isnan(sm)
    clim = _climatology(sm, doy)[doy]
    anom = sm - clim
    obs = t[ok]

    lin = np.interp(t, obs, anom[ok])  # holds ends constant

    pos = np.searchsorted(obs, t)
    left = obs[np.clip(pos - 1, 0, len(obs) - 1)]
    right = obs[np.clip(pos, 0, len(obs) - 1)]
    dist = np.minimum(np.abs(t - left), np.abs(t - right))

    miss = pd.Series(~ok)
    run = (miss != miss.shift()).cumsum()
    gap = np.where(miss, miss.groupby(run).transform("sum"), 0).astype(int)
    edge = (t < obs[0]) | (t > obs[-1])

    long_gap = gap > SHORT_GAP
    w = np.where(long_gap | edge, np.exp(-dist / TAU), 1.0)   # series ends: last anomaly persists, decaying
    filled = np.clip(clim + lin * w, SM_MIN, SM_MAX - 0.05)
    filled = np.where(ok, sm, filled)

    method = np.where(ok, "observed", np.where(long_gap, "climatology_blend", "interpolated"))
    return filled, method, gap


def _haversine(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))


def clean(raw_path: str, out_path: str | None = None) -> pd.DataFrame:
    raw = pd.read_csv(raw_path)
    c = _detect_columns(raw)

    df = pd.DataFrame({
        "ID": raw["ID"],
        "Latitude": raw["Latitude"],
        "Longitude": raw["Longitude"],
        "Date": pd.to_datetime(raw["Date"]),
        "sm": pd.to_numeric(raw[c["sm"]], errors="coerce"),
        "QC_Flag": pd.to_numeric(raw[c["flag"]], errors="coerce") if c["flag"] else np.nan,
    })

    # --- QC -> observed series ------------------------------------------------
    bad = df["sm"].isna() | (df["sm"] <= FILL_VALUE + 1) | (df["sm"] <= SM_MIN) | (df["sm"] > SM_MAX)
    bad |= (df["QC_Flag"].fillna(0).astype(int) & 4) > 0       # bit 2: retrieval not successful
    df["Soil_Moisture"] = df["sm"].where(~bad)
    df = df.drop(columns="sm").drop_duplicates(["ID", "Date"])

    # --- complete calendar ----------------------------------------------------
    cal = pd.date_range(df["Date"].min(), df["Date"].max(), freq="D")
    meta = df.groupby("ID")[["Latitude", "Longitude"]].first()
    doy = cal.dayofyear.values

    parts, empty = [], []
    for loc, g in df.groupby("ID", sort=True):
        g = g.set_index("Date").reindex(cal)
        sm = g["Soil_Moisture"].to_numpy(float)
        if np.isnan(sm).all():
            empty.append(loc)
            filled = method = gap = None
        else:
            filled, method, gap = _fill_series(sm, doy)
        out = pd.DataFrame({
            "ID": loc,
            "Latitude": meta.loc[loc, "Latitude"],
            "Longitude": meta.loc[loc, "Longitude"],
            "Date": cal,
            "Soil_Moisture": sm,
            "Soil_Moisture_Filled": filled if filled is not None else np.nan,
            "Fill_Method": method if method is not None else "neighbor_state",
            "Gap_Days": gap if gap is not None else len(cal),
            "QC_Flag": g["QC_Flag"].to_numpy(),
        })
        parts.append(out)
    res = pd.concat(parts, ignore_index=True)

    # --- locations with zero valid retrievals: borrow from 2 nearest -----------
    donors = [l for l in meta.index if l not in empty]
    for loc in empty:
        d = _haversine(meta.loc[loc, "Latitude"], meta.loc[loc, "Longitude"],
                       meta.loc[donors, "Latitude"].values, meta.loc[donors, "Longitude"].values)
        near = [donors[i] for i in np.argsort(d)[:2]]
        vals = np.mean([res.loc[res.ID == n, "Soil_Moisture_Filled"].to_numpy() for n in near], axis=0)
        res.loc[res.ID == loc, "Soil_Moisture_Filled"] = vals

    for col in ("Soil_Moisture", "Soil_Moisture_Filled"):
        res[col] = res[col].round(4)
    res["QC_Flag"] = res["QC_Flag"].astype("Int64")
    res["Date"] = res["Date"].dt.strftime("%Y-%m-%d")

    if out_path:
        res.to_csv(out_path, index=False)
    return res


# ----------------------------------------------------------------------------
# Data store
# ----------------------------------------------------------------------------
class Store:
    def __init__(self, path: str | os.PathLike):
        df = pd.read_csv(path, parse_dates=["Date"])
        self.df = df
        self.by_id = {k: g.reset_index(drop=True) for k, g in df.groupby("ID")}
        self.locs = (df.groupby("ID")[["Latitude", "Longitude"]].first()
                     .join(df.groupby("ID")["Soil_Moisture"].apply(lambda s: s.notna().mean()).rename("observed_share"))
                     .reset_index())

    def get(self, loc: str) -> pd.DataFrame:
        key = {k.lower(): k for k in self.by_id}.get(loc.lower())
        if key is None:
            raise KeyError(loc)
        return self.by_id[key]


# ----------------------------------------------------------------------------
# API
# ----------------------------------------------------------------------------
def create_app(data_path: str | os.PathLike | None = None):
    from fastapi import FastAPI, HTTPException, Query
    from fastapi.middleware.cors import CORSMiddleware

    store = Store(data_path or os.environ.get("SMAP_DATA", DEFAULT_DATA))
    app = FastAPI(title="SMAP Soil Moisture API", version="1.0")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    def _loc(name: str) -> pd.DataFrame:
        try:
            return store.get(name)
        except KeyError:
            raise HTTPException(404, f"Unknown location '{name}'")

    def _num(x):
        return None if pd.isna(x) else round(float(x), 4)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/meta")
    def meta():
        d = store.df
        return {
            "product": "SMAP L3 SPL3SMP v009 (36 km, AM)",
            "units": "m3/m3",
            "locations": int(store.locs.shape[0]),
            "date_start": d["Date"].min().strftime("%Y-%m-%d"),
            "date_end": d["Date"].max().strftime("%Y-%m-%d"),
            "observed_share": round(float(d["Soil_Moisture"].notna().mean()), 4),
            "fill_methods": d["Fill_Method"].value_counts().to_dict(),
        }

    @app.get("/locations")
    def locations():
        return [{"id": r.ID, "lat": r.Latitude, "lon": r.Longitude, "observed_share": round(r.observed_share, 3)}
                for r in store.locs.itertuples()]

    @app.get("/nearest")
    def nearest(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
        d = _haversine(lat, lon, store.locs["Latitude"].values, store.locs["Longitude"].values)
        i = int(np.argmin(d))
        r = store.locs.iloc[i]
        last = store.get(r.ID).iloc[-1]
        return {"id": r.ID, "lat": r.Latitude, "lon": r.Longitude, "distance_km": round(float(d[i]), 1),
                "latest": {"date": last.Date.strftime("%Y-%m-%d"),
                           "value": _num(last.Soil_Moisture_Filled), "source": last.Fill_Method}}

    @app.get("/soil-moisture/{location}")
    def series(location: str, start: str | None = None, end: str | None = None,
               agg: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
               observed_only: bool = False):
        g = _loc(location)
        if start:
            g = g[g.Date >= pd.Timestamp(start)]
        if end:
            g = g[g.Date <= pd.Timestamp(end)]
        col = "Soil_Moisture" if observed_only else "Soil_Moisture_Filled"
        if agg == "daily":
            rows = [{"date": r.Date.strftime("%Y-%m-%d"), "value": _num(getattr(r, col)),
                     "source": r.Fill_Method, "gap_days": int(r.Gap_Days)} for r in g.itertuples()]
        else:
            rule = "W" if agg == "weekly" else "MS"
            s = g.set_index("Date")[col].resample(rule).mean()
            rows = [{"date": k.strftime("%Y-%m-%d"), "value": _num(v)} for k, v in s.items()]
        return {"location": g["ID"].iloc[0] if len(g) else location, "units": "m3/m3",
                "agg": agg, "count": len(rows), "data": rows}

    @app.get("/soil-moisture/{location}/latest")
    def latest(location: str):
        g = _loc(location)
        last = g.iloc[-1]
        obs = g[g.Soil_Moisture.notna()]
        lo = obs.iloc[-1] if len(obs) else None
        return {
            "location": last.ID, "date": last.Date.strftime("%Y-%m-%d"),
            "value": _num(last.Soil_Moisture_Filled), "source": last.Fill_Method,
            "last_observed": None if lo is None else {
                "date": lo.Date.strftime("%Y-%m-%d"), "value": _num(lo.Soil_Moisture),
                "days_ago": int((last.Date - lo.Date).days)},
        }

    @app.get("/soil-moisture/{location}/summary")
    def summary(location: str):
        g = _loc(location)
        last = g.iloc[-1]
        doy = g.Date.dt.dayofyear.values
        diff = np.minimum(np.abs(doy - last.Date.dayofyear), 366 - np.abs(doy - last.Date.dayofyear))
        season = g.loc[(diff <= 15) & g.Soil_Moisture.notna(), "Soil_Moisture"]
        v = float(last.Soil_Moisture_Filled)
        pct = float((season < v).mean() * 100) if len(season) else None
        status = None if pct is None else ("dry" if pct < 20 else "wet" if pct > 80 else "normal")
        f = g["Soil_Moisture_Filled"]
        return {
            "location": last.ID, "as_of": last.Date.strftime("%Y-%m-%d"), "units": "m3/m3",
            "latest": round(v, 4), "latest_source": last.Fill_Method,
            "mean_7d": _num(f.tail(7).mean()), "mean_30d": _num(f.tail(30).mean()),
            "change_7d": _num(f.iloc[-1] - f.iloc[-8]) if len(f) > 8 else None,
            "seasonal_mean": _num(season.mean()) if len(season) else None,
            "anomaly": _num(v - season.mean()) if len(season) else None,
            "seasonal_percentile": None if pct is None else round(pct, 1),
            "status": status,
            "observed_share": round(float(g.Soil_Moisture.notna().mean()), 3),
        }

    return app


try:  # lets `uvicorn smap_backend:app` work when the data file exists
    app = create_app() if Path(os.environ.get("SMAP_DATA", DEFAULT_DATA)).exists() else None
except ImportError:
    app = None


# ----------------------------------------------------------------------------
if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("clean", help="clean + gap-fill a raw SMAP CSV")
    a.add_argument("--raw", required=True)
    a.add_argument("--out", default="smap_clean_final.csv")
    b = sub.add_parser("serve", help="run the REST API")
    b.add_argument("--data", default=str(DEFAULT_DATA))
    b.add_argument("--host", default="0.0.0.0")
    b.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    if args.cmd == "clean":
        r = clean(args.raw, args.out)
        print(f"{len(r):,} rows, {r.ID.nunique()} locations -> {args.out}")
        print(r.Fill_Method.value_counts().to_string())
    else:
        import uvicorn
        uvicorn.run(create_app(args.data), host=args.host, port=args.port)
