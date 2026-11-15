"""
USA states NDVI (MODIS MOD13Q1.061, 250 m, 16-day)  -  cleaning and gap filling
================================================================================
Input : usa-states-NDVI-MOD13Q1-061-results.csv   (AppEEARS point sample, 50 state points)
Output: usa_ndvi_final.csv            one clean table, no empty cells
        usa_ndvi_cleaning_report.csv  one line per state: what was found and what was done

Steps
  1. Load the file and check it (duplicates, coordinates, dates).
  2. Mark bad readings as missing:
       - NDVI = -3000          (MODIS fill value, "pixel not produced")
       - quality "most probably cloudy"
  3. 30% rule: a state with 30% or more missing readings is removed (cleaning),
     because filling that much would mean inventing most of the series.
  4. Fill the remaining gaps, state by state:
       - gap of up to 3 readings in a row, with real values on both sides:
         straight line (linear interpolation)
       - any other gap: average of the same calendar month in the other years
         (marked "average_few_values" when fewer than 3 real values were available,
          so the number is weak; Alaska winter is the main case)
  5. Keep snow/ice readings (the low winter NDVI is real) but flag them.
  6. Check the result and save.

Run:  pip install pandas
      python clean_usa_ndvi.py        (put this file and the CSV in the same folder)
"""
import pandas as pd

# ----------------------------------------------------------------- settings
INPUT_FILE = "usa-states-NDVI-MOD13Q1-061-results.csv"
OUTPUT_DIR = "."
MAX_GAP = 3             # longest gap (in readings) that gets a straight line
MISSING_LIMIT = 0.30    # 30% or more missing -> remove the state

NDVI = "MOD13Q1_061__250m_16_days_NDVI"
QUALITY = "MOD13Q1_061__250m_16_days_VI_Quality_MODLAND_Description"
SNOW = "MOD13Q1_061__250m_16_days_VI_Quality_Possible_snow/ice_Description"
WATER = "MOD13Q1_061__250m_16_days_VI_Quality_Land/Water_Mask_Description"


# ----------------------------------------------------------------- 1. load and check
df = pd.read_csv(INPUT_FILE, parse_dates=["Date"])
print(f"Loaded {len(df)} rows, {df['ID'].nunique()} states, "
      f"{df['Date'].min().date()} to {df['Date'].max().date()}")

assert not df.duplicated(["ID", "Date"]).any(), "duplicate state/date rows"
coords = df.groupby("ID")[["Latitude", "Longitude"]].nunique()
assert (coords == 1).all().all(), "a state has more than one coordinate"
assert df["Latitude"].between(18, 72).all() and df["Longitude"].between(-180, -65).all(), \
    "coordinates are outside the USA"

# keep only the columns we need, with simple names
df = df.rename(columns={"ID": "state", "Latitude": "lat", "Longitude": "lon", "Date": "date",
                        NDVI: "ndvi_raw", QUALITY: "quality", SNOW: "snow_ice", WATER: "water_mask"})
df = df[["state", "lat", "lon", "date", "ndvi_raw", "quality", "snow_ice", "water_mask"]]
df = df.sort_values(["state", "date"]).reset_index(drop=True)


# ----------------------------------------------------------------- 2. mark missing
df["is_missing"] = (df["ndvi_raw"] < -1) | df["quality"].str.contains("cloudy")
df["ndvi"] = df["ndvi_raw"].where(~df["is_missing"])      # NaN where missing
print(f"Missing readings: {df['is_missing'].sum()} "
      f"({df['is_missing'].mean():.1%} of all readings)")


# ----------------------------------------------------------------- 3. the 30% rule
share_missing = df.groupby("state")["is_missing"].mean()
removed_states = share_missing[share_missing >= MISSING_LIMIT].index.tolist()
print("Removed (30% rule):", removed_states if removed_states else "none")
kept = df[~df["state"].isin(removed_states)].copy()


# ----------------------------------------------------------------- 4. fill the gaps
def fill_state(group):
    """Fill the gaps of one state. Returns the group with ndvi filled and fill_method."""
    group = group.copy()
    real = group["ndvi"]                       # real values only (NaN = gap)
    is_gap = real.isna()

    # length of every gap
    gap_id = (is_gap != is_gap.shift()).cumsum()
    gap_length = is_gap.groupby(gap_id).transform("sum")

    # a) short gap with real values on both sides -> straight line
    line = real.interpolate(method="linear", limit_area="inside")
    use_line = is_gap & (gap_length <= MAX_GAP) & line.notna()
    filled = real.copy()
    filled[use_line] = line[use_line]

    # b) every other gap -> average of the same calendar month in the other years
    month = group["date"].dt.month
    month_average = real.groupby(month).transform("mean")
    month_count = real.groupby(month).transform("count")      # real values behind the average
    use_average = filled.isna()
    filled[use_average] = month_average[use_average]
    # (very rare) a month with no real value at all -> average of the whole series
    filled = filled.fillna(real.mean())

    group["ndvi"] = filled.round(4)
    group["fill_method"] = "none"
    group.loc[use_line, "fill_method"] = "interpolation"
    group.loc[use_average, "fill_method"] = "average"
    group.loc[use_average & (month_count < 3), "fill_method"] = "average_few_values"
    return group


pieces = []
for state_name, group in kept.groupby("state"):
    pieces.append(fill_state(group))
kept = pd.concat(pieces)


# ----------------------------------------------------------------- 5. flags and tidy up
kept["snow_ice"] = kept["snow_ice"].str.lower()                 # yes / no
kept["water_mask"] = kept["water_mask"].replace({
    "Land (Nothing else but land)": "land",
    "Ocean coastlines and lake shorelines": "shoreline",
    "Shallow inland water": "inland water",
    "Deep ocean": "deep water"})
final = kept[["state", "lat", "lon", "date", "ndvi", "quality", "snow_ice",
              "water_mask", "fill_method"]].reset_index(drop=True)


# ----------------------------------------------------------------- 6. check
assert final.notna().all().all(), "there are still empty cells"
assert final["ndvi"].between(-1, 1).all(), "NDVI outside -1 to 1"
assert not final.duplicated(["state", "date"]).any(), "duplicate rows"
real_rows = kept["fill_method"] == "none"
assert (kept.loc[real_rows, "ndvi"] == kept.loc[real_rows, "ndvi_raw"].round(4)).all(), \
    "a real value was changed"
filled_rows = final["fill_method"] != "none"
assert (final.loc[filled_rows, "ndvi"] != 0).all(), "a filled value is exactly 0"


# ----------------------------------------------------------------- report
report = df.groupby("state").agg(
    readings=("date", "count"),
    missing=("is_missing", "sum"),
    snow_ice_readings=("snow_ice", lambda s: (s == "Yes").sum()),
)
report["missing_percent"] = (report["missing"] / report["readings"] * 100).round(1)
how = final.groupby("state")["fill_method"].value_counts().unstack(fill_value=0)
report["interpolated"] = how.get("interpolation", 0)
report["averaged"] = how.get("average", 0)
report["averaged_few_values"] = how.get("average_few_values", 0)
cols = ["interpolated", "averaged", "averaged_few_values"]
report[cols] = report[cols].fillna(0).astype(int)
report["action"] = "cleaned and filled"
report.loc[removed_states, "action"] = "removed (30% or more missing)"
report = report.reset_index()

final.to_csv(f"{OUTPUT_DIR}/usa_ndvi_final.csv", index=False, date_format="%Y-%m-%d")
report.to_csv(f"{OUTPUT_DIR}/usa_ndvi_cleaning_report.csv", index=False)

print(f"Saved usa_ndvi_final.csv: {len(final)} rows, {final['state'].nunique()} states")
print(f"  real readings kept as they are : {(final['fill_method'] == 'none').sum()}")
print(f"  filled by interpolation        : {(final['fill_method'] == 'interpolation').sum()}")
print(f"  filled by monthly average      : {(final['fill_method'] == 'average').sum()}")
print(f"  monthly average, few values    : {(final['fill_method'] == 'average_few_values').sum()}  (weak, see fill_method)")
print("Saved usa_ndvi_cleaning_report.csv")
