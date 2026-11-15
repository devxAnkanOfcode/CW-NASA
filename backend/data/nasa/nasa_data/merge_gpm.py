"""
Merge NASA GPM IMERG monthly precipitation (Giovanni area-averaged) CSVs
for Contiguous US (48 states), Alaska and Hawaii into one tidy CSV.

Usage:
    python merge_gpm.py [input_dir] [output_csv]
"""
import glob
import os
import re
import sys

import pandas as pd

IN_DIR = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/uploads"
OUT_CSV = sys.argv[2] if len(sys.argv) > 2 else "/mnt/user-data/outputs/GPM_USA_merged.csv"

# Bounding box in the filename -> region name
REGIONS = {
    "125W_24N_66W_49N": "Contiguous US (48 states)",
    "178W_51N_130W_72N": "Alaska",
    "161W_18N_155W_23N": "Hawaii",
}
VALUE_COL = "mean_GPM_3IMERGM_07_precipitation"


def read_giovanni(path):
    """Read one Giovanni CSV: metadata header + data table."""
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()

    meta = {}
    start = None
    for i, line in enumerate(lines):
        if line.lower().startswith("time,"):
            start = i
            break
        if ":," in line:
            k, v = line.split(":,", 1)
            meta[k.strip()] = v.strip().strip('"')

    fill = float(meta["Fill Value (%s)" % VALUE_COL])
    df = pd.read_csv(path, skiprows=start, skipinitialspace=True)
    df.columns = [c.strip() for c in df.columns]
    df["time"] = pd.to_datetime(df["time"])
    df[VALUE_COL] = pd.to_numeric(df[VALUE_COL], errors="coerce")
    df.loc[df[VALUE_COL] == fill, VALUE_COL] = float("nan")  # fill value -> NaN
    return df, meta


frames = []
for path in sorted(glob.glob(os.path.join(IN_DIR, "*.csv"))):
    key = next((k for k in REGIONS if k in os.path.basename(path)), None)
    if key is None:
        continue
    df, meta = read_giovanni(path)
    df = df.rename(columns={"time": "date", VALUE_COL: "precip_mm_per_hr"})
    df.insert(0, "region", REGIONS[key])
    df["bbox_requested"] = meta.get("User Bounding Box", "")
    frames.append(df)

if len(frames) != 3:
    sys.exit("Expected 3 region files, found %d" % len(frames))

gpm = pd.concat(frames, ignore_index=True)

# --- Cleaning / QC ---
gpm = gpm.drop_duplicates(subset=["region", "date"]).sort_values(["region", "date"])
gpm["year"] = gpm["date"].dt.year
gpm["month"] = gpm["date"].dt.month
gpm["month_name"] = gpm["date"].dt.strftime("%b")
gpm["days_in_month"] = gpm["date"].dt.days_in_month

# GPM IMERG monthly precipitation is a rate in mm/hr -> convert to mm/month
gpm["precip_mm_per_month"] = (gpm["precip_mm_per_hr"] * 24 * gpm["days_in_month"]).round(2)
gpm["precip_mm_per_hr"] = gpm["precip_mm_per_hr"].round(6)

gpm["date"] = gpm["date"].dt.strftime("%Y-%m-%d")
gpm = gpm[
    ["region", "date", "year", "month", "month_name", "days_in_month",
     "precip_mm_per_hr", "precip_mm_per_month", "bbox_requested"]
].reset_index(drop=True)

# --- Report ---
print("Rows:", len(gpm))
print("Missing values:\n", gpm.isna().sum()[lambda s: s > 0])
print("Rows per region:\n", gpm.groupby("region").size())
print("Date range:", gpm["date"].min(), "->", gpm["date"].max())
print(gpm.groupby("region")["precip_mm_per_month"].describe().round(2))

gpm.to_csv(OUT_CSV, index=False)
print("Saved:", OUT_CSV)
