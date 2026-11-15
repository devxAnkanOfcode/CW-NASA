#!/usr/bin/env python3
"""
Fill data gaps in USDA_NASS_All_Crops_50states.csv by interpolation.

Usage:
    python fill_nass_gaps.py [input.csv] [output.csv]

Series key  = crop_id + commodity + class + practice + utilization + unit
              + My_Crop_Name + state_alpha   (one yield time series per state)
Time axis   = year (YEAR_MIN..YEAR_MAX)

Rules
-----
1. Gap = (a) row exists but value is blank / "(D)" (NASS-withheld), or
         (b) the year row is missing entirely *between* two observed years.
2. Interior gaps (between two observed years)  -> linear interpolation.
3. Edge "(D)" rows (before first / after last observed year) -> nearest observed
   value carried over (no linear extrapolation, so yields never run away).
4. Missing year rows at the edges are NOT created (crop likely not reported
   in that state/year; creating them would fabricate rows).
5. A series needs >= MIN_OBS observed values to be filled; otherwise left blank.
6. Genuine observed values (including real 0.0) are never modified.
7. value_t_ha is interpolated with the same rule, only if the series has
   observed t/ha values (boxes, barrels, cherry-basis units have no t/ha).

Two columns are appended so the backend can tell real from filled data:
    is_interpolated : True / False
    fill_method     : original | linear_interpolation | nearest_edge
"""
import sys
import numpy as np
import pandas as pd

IN_PATH = sys.argv[1] if len(sys.argv) > 1 else "USDA_NASS_All_Crops_50states.csv"
OUT_PATH = sys.argv[2] if len(sys.argv) > 2 else "USDA_NASS_All_Crops_50states_filled.csv"

MIN_OBS = 2            # minimum observed years in a series before we fill it
YEAR_MIN, YEAR_MAX = 2020, 2025
DECIMALS = 2

SERIES_KEY = ["crop_id", "commodity", "class", "practice", "utilization",
              "unit", "My_Crop_Name", "state_alpha"]


def fill_series(years, values):
    """years: sorted list[int]; values: np.array with NaN for gaps.
    Returns (filled_values, methods) aligned with years."""
    filled = values.copy()
    methods = np.array(["original"] * len(years), dtype=object)
    obs = ~np.isnan(values)
    if obs.sum() < MIN_OBS:
        methods[~obs] = "unfilled"
        return filled, methods
    oy = np.array(years)[obs]
    ov = values[obs]
    for i, y in enumerate(years):
        if obs[i]:
            continue
        if oy.min() < y < oy.max():
            filled[i] = np.interp(y, oy, ov)
            methods[i] = "linear_interpolation"
        else:
            filled[i] = ov[np.argmin(np.abs(oy - y))]
            methods[i] = "nearest_edge"
    return filled, methods


def main():
    # read everything as text so untouched cells round-trip exactly
    df = pd.read_csv(IN_PATH, dtype=str, keep_default_na=False)
    cols = list(df.columns)
    df["_row"] = np.arange(len(df))
    df["_y"] = df["year"].astype(int)
    df["_v"] = pd.to_numeric(df["value"], errors="coerce")
    df["_t"] = pd.to_numeric(df["value_t_ha"], errors="coerce")
    df["is_interpolated"] = "False"
    df["fill_method"] = "original"

    new_rows = []
    for key, g in df.groupby(SERIES_KEY, sort=False):
        g = g.sort_values("_y")
        present = set(g["_y"])
        obs_years = g.loc[g["_v"].notna(), "_y"]
        if len(obs_years) < MIN_OBS:
            continue
        lo, hi = obs_years.min(), obs_years.max()
        # years to consider: every year in range, existing rows + missing interior ones
        years = [y for y in range(YEAR_MIN, YEAR_MAX + 1) if y in present or lo < y < hi]
        base = g.set_index("_y")
        v = np.array([base.at[y, "_v"] if y in present else np.nan for y in years], float)
        t = np.array([base.at[y, "_t"] if y in present else np.nan for y in years], float)
        fv, mv = fill_series(years, v)
        has_t = (~np.isnan(t)).sum() >= MIN_OBS
        ft = fill_series(years, t)[0] if has_t else t

        template = g.iloc[-1]  # metadata for any newly created row
        for i, y in enumerate(years):
            if mv[i] not in ("linear_interpolation", "nearest_edge"):
                continue
            val = f"{round(fv[i], DECIMALS)}"
            tha = "" if np.isnan(ft[i]) else f"{round(ft[i], 4)}"
            if y in present:
                idx = base.at[y, "_row"]
                df.loc[df["_row"] == idx, ["value", "value_t_ha",
                                           "is_interpolated", "fill_method"]] = \
                    [val, tha, "True", mv[i]]
            else:
                r = template.copy()
                r["year"], r["_y"] = str(y), y
                r["value"], r["value_t_ha"] = val, tha
                r["value_flag"] = ""
                r["load_time"] = ""
                r["is_interpolated"], r["fill_method"] = "True", mv[i]
                new_rows.append(r)

    if new_rows:
        df = pd.concat([df, pd.DataFrame(new_rows)], ignore_index=True)

    out_cols = cols + ["is_interpolated", "fill_method"]
    df[out_cols].to_csv(OUT_PATH, index=False, lineterminator="\r\n")

    filled = df["is_interpolated"] == "True"
    print(f"Rows in: {len(df) - len(new_rows)} | rows out: {len(df)}")
    print(f"Filled cells: {filled.sum()} (new rows added: {len(new_rows)})")
    print(df.loc[filled, "fill_method"].value_counts().to_string())
    remaining = ((df["value"] == "")).sum()
    print(f"Rows still blank in 'value' (series with < {MIN_OBS} observed years): {remaining}")


if __name__ == "__main__":
    main()
