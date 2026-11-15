"""
USA states elevation (NASA SRTM, SRTMGL3 NC V003, 3 arc second = about 90 m)  -  cleaning
=======================================================================================
Input : usa-states-SRTM-SRTMGL3-NC-003-results.csv   (AppEEARS point sample, state points)
Output: usa_srtm_final.csv            one clean table, no empty cells
        usa_srtm_cleaning_report.csv  one line for each of the 50 states: what was found

IMPORTANT: elevation is a FIXED value (SRTM flew once, in February 2000). There is no time
series, so there is nothing to interpolate or to average over months. A missing state can
NOT be filled with the average of other states, that would be a wrong elevation. So this
script cleans, checks, and REPORTS missing states; it never invents an elevation.

Steps
  1. Load the file and check it (one row per state, coordinates, dates).
  2. Mark bad values as missing (SRTM void value -32768, or empty).
  3. 30% rule: if 30% or more of the states have no elevation, stop (too much is missing).
  4. Find the states that are not in the file at all (SRTM covers only up to 60 N).
  5. Read the NUM layer: it says how the elevation was made
       - SRTM swath count  -> real SRTM radar measurement (1 to 5 passes)
       - ASTER granule count -> SRTM had a void here and it was filled with ASTER data
  6. Check the result and save.

Run:  pip install pandas
      python clean_usa_srtm.py        (put this file and the CSV in the same folder)
"""
import pandas as pd

# ----------------------------------------------------------------- settings
INPUT_FILE = "usa-states-SRTM-SRTMGL3-NC-003-results.csv"
OUTPUT_DIR = "."
MISSING_LIMIT = 0.30       # 30% or more missing -> stop
SRTM_VOID = -32768         # SRTM code for "no data"

DEM = "SRTMGL3_NC_003_SRTMGL3_DEM"
NUM = "SRTMGL3_NUMNC_003_SRTMGL3_NUM"
NUM_TEXT = "SRTMGL3_NUMNC_003_SRTMGL3_NUM_Source_Description"

ALL_STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
    "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
    "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "NewHampshire",
    "NewJersey", "NewMexico", "NewYork", "NorthCarolina", "NorthDakota", "Ohio", "Oklahoma",
    "Oregon", "Pennsylvania", "RhodeIsland", "SouthCarolina", "SouthDakota", "Tennessee",
    "Texas", "Utah", "Vermont", "Virginia", "Washington", "WestVirginia", "Wisconsin", "Wyoming",
]


# ----------------------------------------------------------------- 1. load and check
df = pd.read_csv(INPUT_FILE)
print(f"Loaded {len(df)} rows")

assert not df["ID"].duplicated().any(), "a state appears more than once"
assert df["Latitude"].between(18, 72).all() and df["Longitude"].between(-180, -65).all(), \
    "coordinates are outside the USA"
unknown = set(df["ID"]) - set(ALL_STATES)
assert not unknown, f"unknown state names: {unknown}"

df = df.rename(columns={"ID": "state", "Latitude": "lat", "Longitude": "lon",
                        "Date": "acquisition_date", DEM: "elevation_m"})


# ----------------------------------------------------------------- 2. mark missing
df["is_missing"] = df["elevation_m"].isna() | (df["elevation_m"] == SRTM_VOID)
print(f"Rows with a missing elevation: {df['is_missing'].sum()}")


# ----------------------------------------------------------------- 3 and 4. 30% rule, absent states
absent_states = [s for s in ALL_STATES if s not in set(df["state"])]
missing_states = absent_states + df.loc[df["is_missing"], "state"].tolist()
missing_share = len(missing_states) / len(ALL_STATES)
print(f"States without an elevation: {missing_states}  ({missing_share:.0%})")
assert missing_share < MISSING_LIMIT, "30% or more of the states are missing, check the download"

df = df[~df["is_missing"]].copy()


# ----------------------------------------------------------------- 5. how was each elevation made
df["n_observations"] = df[NUM_TEXT].str.extract(r"(\d+)\D*$")[0].astype(int)
df["elevation_source"] = df[NUM_TEXT].apply(
    lambda text: "ASTER (void filled)" if "ASTER" in text else "SRTM")


# ----------------------------------------------------------------- 6. tidy, check, save
final = df[["state", "lat", "lon", "elevation_m", "elevation_source",
            "n_observations", "acquisition_date"]].sort_values("state").reset_index(drop=True)

final["elevation_m"] = final["elevation_m"].astype(int)       # whole metres

assert final.notna().all().all(), "there are empty cells"
assert final["elevation_m"].between(-90, 6200).all(), "an elevation is outside the USA range"
assert not final["state"].duplicated().any(), "duplicate states"

report = pd.DataFrame({"state": ALL_STATES})
report = report.merge(final[["state", "elevation_m", "elevation_source"]], on="state", how="left")
report["in_final_file"] = report["elevation_m"].notna().map({True: "yes", False: "no"})
report["note"] = "real value kept as it is"
report.loc[report["elevation_source"] == "ASTER (void filled)", "note"] = \
    "SRTM had no data here, value comes from ASTER (still a measured elevation)"
report.loc[report["state"].isin(absent_states), "note"] = \
    "not in the file: outside SRTM coverage (north of 60 N). Not filled on purpose"
report["elevation_m"] = report["elevation_m"].astype("Int64").astype("string").fillna("not available")
report["elevation_source"] = report["elevation_source"].astype("string").fillna("not available")

final.to_csv(f"{OUTPUT_DIR}/usa_srtm_final.csv", index=False)
report.to_csv(f"{OUTPUT_DIR}/usa_srtm_cleaning_report.csv", index=False)

print(f"Saved usa_srtm_final.csv: {len(final)} states")
print(f"  SRTM measured      : {(final['elevation_source'] == 'SRTM').sum()}")
print(f"  ASTER void filled  : {(final['elevation_source'] == 'ASTER (void filled)').sum()}")
print(f"  not available      : {absent_states}")
print("Saved usa_srtm_cleaning_report.csv")
