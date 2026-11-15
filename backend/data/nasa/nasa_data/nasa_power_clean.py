"""
NASA POWER - 50 US states monthly data: QC + cleaning + interpolation.

Usage:
    python nasa_power_clean.py [input.csv] [output_dir]

Input columns : Date (YYYYMM), PRECTOTCORR, RH2M, T2M, WS2M, State
Outputs       : NASA_POWER_50_states_clean.csv   (monthly rows only, 12 per year)
                NASA_POWER_50_states_annual.csv  (NASA's month-13 annual-mean rows)
                NASA_POWER_QC_report.txt
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

VARS = ["PRECTOTCORR", "RH2M", "T2M", "WS2M"]
FILL_VALUES = [-999, -999.0, -99, -9999]          # NASA POWER missing-data flags
RANGES = {                                         # physically plausible limits
    "PRECTOTCORR": (0, 100),   # mm/day
    "RH2M": (0, 100),          # %
    "T2M": (-60, 60),          # deg C
    "WS2M": (0, 50),           # m/s
}
EXPECTED_STATES = 50
LOW_WIND_FLAG = 0.5            # state mean WS2M below this is flagged (not altered)

log = []


def say(msg=""):
    print(msg)
    log.append(str(msg))


def main(src, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(src)
    say(f"Loaded {len(df)} rows from {src.name}")

    # 1. Structure ---------------------------------------------------------
    df["State"] = df["State"].astype(str).str.strip().str.replace("_", " ", regex=False)
    df["Year"] = df["Date"] // 100
    df["Month"] = df["Date"] % 100
    assert df["State"].nunique() == EXPECTED_STATES, "state count != 50"
    say(f"States: {df['State'].nunique()}  | Years: {df['Year'].min()}-{df['Year'].max()}")

    # 2. Duplicates --------------------------------------------------------
    d = df.duplicated(["State", "Date"]).sum()
    df = df.drop_duplicates(["State", "Date"], keep="first")
    say(f"Duplicate State+Date rows removed: {d}")

    # 3. Split month 13 (NASA annual-mean row) from monthly rows ------------
    annual = df[df["Month"] == 13].copy()
    monthly = df[df["Month"].between(1, 12)].copy()
    bad = len(df) - len(annual) - len(monthly)
    say(f"Annual (month=13) rows moved to separate file: {len(annual)}")
    say(f"Rows with invalid month dropped: {bad}")

    # 4. Missing values: fill flags -> NaN, then interpolate ------------------
    for frame in (monthly, annual):
        frame[VARS] = frame[VARS].replace(FILL_VALUES, np.nan)

    # out-of-range -> NaN (so they get interpolated, not silently kept)
    for v, (lo, hi) in RANGES.items():
        n = ((monthly[v] < lo) | (monthly[v] > hi)).sum()
        monthly.loc[(monthly[v] < lo) | (monthly[v] > hi), v] = np.nan
        say(f"{v}: out-of-range values set to NaN: {n}")

    missing_before = int(monthly[VARS].isna().sum().sum())
    monthly = monthly.sort_values(["State", "Date"]).reset_index(drop=True)

    def fill(g):
        g = g.copy()
        # time-ordered linear interpolation inside each state only
        g[VARS] = g[VARS].interpolate(method="linear", limit_area="inside", limit=3)
        # leading/trailing gaps: fall back to that state's same-calendar-month mean
        for v in VARS:
            clim = g.groupby("Month")[v].transform("mean")
            g[v] = g[v].fillna(clim)
        return g

    monthly = pd.concat([fill(g) for _, g in monthly.groupby("State", sort=True)],
                        ignore_index=True)
    missing_after = int(monthly[VARS].isna().sum().sum())
    say(f"Missing values before: {missing_before} | after interpolation: {missing_after}")
    if missing_after:
        raise SystemExit("Unfilled NaNs remain - inspect data.")

    # 5. Completeness ------------------------------------------------------
    cnt = monthly.groupby("State").size()
    say(f"Monthly rows per state: min={cnt.min()} max={cnt.max()} (expected 72)")

    # 6. Outlier scan (state x calendar-month z-score) - flag only ----------
    g = monthly.groupby(["State", "Month"])
    for v in VARS:
        z = (monthly[v] - g[v].transform("mean")) / g[v].transform("std").replace(0, np.nan)
        say(f"{v}: |z|>3 outliers: {int((z.abs() > 3).sum())} (max |z|={z.abs().max():.2f})")

    # 7. Consistency: annual row vs mean of its 12 months -------------------
    chk = (monthly.groupby(["State", "Year"])[VARS].mean().reset_index()
           .merge(annual, on=["State", "Year"], suffixes=("", "_ann")))
    for v in VARS:
        say(f"{v}: max |annual - mean(12 months)| = {(chk[v] - chk[v + '_ann']).abs().max():.3f}")

    # 8. Plausibility flags (NOT altered) -----------------------------------
    ws = monthly.groupby("State")["WS2M"].mean()
    low = ws[ws < LOW_WIND_FLAG].sort_values()
    say(f"\nWARNING - states with very low mean WS2M (< {LOW_WIND_FLAG} m/s), values kept as-is:")
    for s, val in low.items():
        say(f"   {s:15s} {val:.3f}")
    say("   (Likely forest-canopy / grid-point effect in the 2 m wind field; "
        "do not use these for wind-driven models without checking.)")
    zero = monthly[monthly["PRECTOTCORR"] == 0]
    say(f"\nZero-precip months (valid, dry desert months): {len(zero)} "
        f"in {sorted(zero['State'].unique())}")

    # 9. Save ---------------------------------------------------------------
    cols = ["Date", "PRECTOTCORR", "RH2M", "T2M", "WS2M", "State", "Year", "Month"]
    monthly[cols].round(2).to_csv(out_dir / "NASA_POWER_50_states_clean.csv", index=False)
    annual[cols].sort_values(["State", "Date"]).to_csv(
        out_dir / "NASA_POWER_50_states_annual.csv", index=False)
    (out_dir / "NASA_POWER_QC_report.txt").write_text("\n".join(log), encoding="utf-8")
    say(f"\nSaved {len(monthly)} monthly rows + {len(annual)} annual rows to {out_dir}")


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("NASA_POWER_50_states_all.csv")
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(".")
    main(src, out)
