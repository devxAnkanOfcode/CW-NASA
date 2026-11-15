"""
crop_price_pipeline.py
----------------------
Crop price CSV (2020-2025) ke validate + gap-fill kore final CSV banay.
Backend theke import kore use korte paro, abar CLI hisebeo cholbe.

CLI:
    python crop_price_pipeline.py crop_prices.csv crop_prices_final.csv

Backend:
    from crop_price_pipeline import load_clean_prices
    df, report = load_clean_prices("crop_prices.csv")

Gap fill-er order (sob fill 'Fill_Method' column e record thake):
  1. Interior gap (majher year missing)  -> linear interpolation
  2. Edge gap (prothom/shesh year missing) -> same USDA_Commodity group-er onno
     crop-er YoY ratio (median) diye estimate; peer na thakle nearest value carry
  3. Text column (Unit/Source/USDA_Commodity) blank -> oi crop-er most common value
"""
from __future__ import annotations

import sys
import numpy as np
import pandas as pd

REQUIRED = ["My_Crop_Name", "USDA_Commodity", "Year", "Price_Received", "Unit", "Source"]
START_YEAR, END_YEAR = 2020, 2025
YOY_ALERT = 0.40  # ek bochore 40% er beshi change hole warning


def _read(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str, keep_default_na=True)
    df.columns = [c.strip() for c in df.columns]
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")
    for c in ["My_Crop_Name", "USDA_Commodity", "Unit", "Source"]:
        df[c] = df[c].astype("string").str.strip().replace("", pd.NA)
    df["Year"] = pd.to_numeric(df["Year"], errors="coerce")
    df["Price_Received"] = pd.to_numeric(df["Price_Received"], errors="coerce")
    df = df.dropna(subset=["My_Crop_Name", "Year"]).copy()
    df["Year"] = df["Year"].astype(int)
    # negative/zero price = invalid, gap hisebe dhora hobe
    df.loc[df["Price_Received"] <= 0, "Price_Received"] = np.nan
    return df.drop_duplicates(subset=["My_Crop_Name", "Year"], keep="last")


def _mode(s: pd.Series):
    s = s.dropna()
    return s.mode().iloc[0] if len(s) else pd.NA


def _build_grid(df: pd.DataFrame, years: list[int]) -> pd.DataFrame:
    """Prottek crop er jonno sob year er row ensure kore (missing row = gap)."""
    meta = df.groupby("My_Crop_Name").agg(
        USDA_Commodity=("USDA_Commodity", _mode),
        Unit=("Unit", _mode),
        Source=("Source", _mode),
    )
    idx = pd.MultiIndex.from_product([meta.index, years], names=["My_Crop_Name", "Year"])
    grid = pd.DataFrame(index=idx).reset_index()
    grid = grid.merge(meta.reset_index(), on="My_Crop_Name", how="left")
    grid = grid.merge(df[["My_Crop_Name", "Year", "Price_Received"]],
                      on=["My_Crop_Name", "Year"], how="left")
    # original row-te thaka text blank gulo o fill hoye jay (mode diye)
    grid["Fill_Method"] = np.where(grid["Price_Received"].isna(), "", "original")
    return grid


def _peer_ratio(grid: pd.DataFrame, commodity, crop, y_from: int, y_to: int):
    """Same commodity group-er onno crop gulor y_from -> y_to median ratio."""
    peers = grid[(grid["USDA_Commodity"] == commodity) & (grid["My_Crop_Name"] != crop)]
    a = peers[peers["Year"] == y_from].set_index("My_Crop_Name")["Price_Received"]
    b = peers[peers["Year"] == y_to].set_index("My_Crop_Name")["Price_Received"]
    r = (b / a).replace([np.inf, -np.inf], np.nan).dropna()
    # sudhu original (non-filled) peer use hobe
    orig = peers[peers["Fill_Method"] == "original"]["My_Crop_Name"].unique()
    r = r[r.index.isin(orig)]
    return float(r.median()) if len(r) else None


def _fill(grid: pd.DataFrame) -> pd.DataFrame:
    grid = grid.sort_values(["My_Crop_Name", "Year"]).reset_index(drop=True)
    for crop, g in grid.groupby("My_Crop_Name", sort=False):
        idx = g.index
        s = g["Price_Received"].copy()
        if s.notna().sum() == 0:
            continue  # kono data nei, estimate kora jabe na -> report e jabe
        # 1) interior linear
        interp = s.interpolate(method="linear", limit_area="inside")
        mask = s.isna() & interp.notna()
        grid.loc[idx[mask.values], "Price_Received"] = interp[mask].round(4).values
        grid.loc[idx[mask.values], "Fill_Method"] = "linear_interpolation"
        s = grid.loc[idx, "Price_Received"]
        # 2) edge gaps: peer ratio, na hole nearest carry
        commodity = g["USDA_Commodity"].iloc[0]
        years = g["Year"].tolist()
        for pos in list(range(len(s))) + list(range(len(s) - 1, -1, -1)):
            if pd.notna(grid.at[idx[pos], "Price_Received"]):
                continue
            for step in (-1, 1):  # age pichone, tarpor samne
                n = pos + step
                if 0 <= n < len(s) and pd.notna(grid.at[idx[n], "Price_Received"]):
                    base = grid.at[idx[n], "Price_Received"]
                    r = _peer_ratio(grid, commodity, crop, years[n], years[pos])
                    if r:
                        grid.at[idx[pos], "Price_Received"] = round(base * r, 4)
                        grid.at[idx[pos], "Fill_Method"] = "peer_group_ratio"
                    else:
                        grid.at[idx[pos], "Price_Received"] = base
                        grid.at[idx[pos], "Fill_Method"] = "nearest_carry"
                    break
    return grid


def _quality_flags(grid: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    grid["Is_Filled"] = grid["Fill_Method"].ne("original")
    # Source text theke actual vs modelled estimate bojha
    src = grid["Source"].fillna("").str.lower()
    grid["Price_Basis"] = np.where(src.str.contains("actual"), "actual",
                          np.where(src.str.contains("factor"), "modelled_estimate", "unknown"))
    grid.loc[grid["Is_Filled"], "Price_Basis"] = "filled_estimate"

    # identical series = duplicate/alias crop
    wide = grid.pivot(index="My_Crop_Name", columns="Year", values="Price_Received")
    dup_groups = [list(g.index) for _, g in wide.groupby(list(wide.columns)) if len(g) > 1]

    # YoY outlier
    grid = grid.sort_values(["My_Crop_Name", "Year"])
    grid["YoY_Change"] = grid.groupby("My_Crop_Name")["Price_Received"].pct_change().round(4)
    alerts = grid[grid["YoY_Change"].abs() > YOY_ALERT][["My_Crop_Name", "Year", "YoY_Change"]]

    # unit mismatch within commodity group (informational)
    units = grid.groupby("USDA_Commodity")["Unit"].nunique()
    mixed_units = units[units > 1].index.tolist()

    report = {
        "rows": int(len(grid)),
        "crops": int(grid["My_Crop_Name"].nunique()),
        "filled_cells": int(grid["Is_Filled"].sum()),
        "fill_methods": grid.loc[grid["Is_Filled"], "Fill_Method"].value_counts().to_dict(),
        "unfillable_crops": grid.loc[grid["Price_Received"].isna(), "My_Crop_Name"].unique().tolist(),
        "duplicate_price_series": dup_groups,
        "yoy_alerts": alerts.to_dict("records"),
        "commodities_with_mixed_units": mixed_units,
    }
    return grid, report


def load_clean_prices(path: str, start: int = START_YEAR, end: int = END_YEAR):
    df = _read(path)
    grid = _build_grid(df, list(range(start, end + 1)))
    grid = _fill(grid)
    grid, report = _quality_flags(grid)
    cols = REQUIRED + ["Price_Basis", "Is_Filled", "Fill_Method", "YoY_Change"]
    out = grid[cols].sort_values(["My_Crop_Name", "Year"]).reset_index(drop=True)
    return out, report


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: python crop_price_pipeline.py <input.csv> <output.csv>")
    final, rep = load_clean_prices(sys.argv[1])
    final.to_csv(sys.argv[2], index=False)
    print(f"Saved: {sys.argv[2]}")
    for k, v in rep.items():
        print(f"{k}: {v}")
