import { Router } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const router = Router();

const ROUTE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(ROUTE_DIR, "../data/nasa/nasa_data");

// Only these known files can be accessed through the API.
const DATASETS = {
  "crop-income": {
    file: "crop_income_final (1).csv",
    description: "Crop yield, price and estimated income by US state and year.",
    coverage: "United States",
    source: "Prepared crop income dataset",
  },
  "gpm": {
    file: "GPM_USA_merged.csv",
    description: "Monthly precipitation measurements by US region.",
    coverage: "United States",
    source: "NASA GPM",
  },
  "nasa-power": {
    file: "NASA_POWER_50_states_clean.csv",
    description: "Monthly precipitation, relative humidity, temperature and wind speed.",
    coverage: "United States",
    source: "NASA POWER",
  },
  "smap": {
    file: "smap_clean_final.csv",
    description: "Daily soil moisture data, including observed and gap-filled values.",
    coverage: "United States",
    source: "NASA SMAP",
  },
  "ndvi": {
    file: "usa_ndvi_final.csv",
    description: "Vegetation index observations with quality and fill information.",
    coverage: "United States",
    source: "NASA vegetation data",
  },
  "srtm": {
    file: "usa_srtm_final.csv",
    description: "Elevation observations by US state.",
    coverage: "United States",
    source: "NASA SRTM",
  },
  "usda-nass": {
    file: "USDA_NASS_All_Crops_50states (1).csv",
    description: "Original USDA crop production statistics.",
    coverage: "United States",
    source: "USDA NASS",
  },
  "usda-nass-filled": {
    file: "USDA_NASS_All_Crops_50states_filled (1).csv",
    description: "USDA crop statistics with interpolation metadata.",
    coverage: "United States",
    source: "USDA NASS, prepared dataset",
  },
  "usda-prices": {
    file: "USDA_Price_70Crops_2020_2025.csv",
    description: "Yearly prices received for agricultural commodities.",
    coverage: "United States",
    source: "USDA NASS",
  },
};

// Map query parameters to known CSV columns.
const FILTER_COLUMNS = {
  state: ["state", "State", "region", "state_alpha", "ID"],
  crop: ["crop", "My_Crop_Name", "commodity", "USDA_Commodity"],
  year: ["year", "Year"],
  date: ["date", "Date"],
};

const cache = new Map();

async function loadDataset(datasetId) {
  if (cache.has(datasetId)) {
    return cache.get(datasetId);
  }

  const definition = DATASETS[datasetId];
  const filePath = path.resolve(DATA_DIR, definition.file);

  // Prevent paths outside the dataset directory.
  if (!filePath.startsWith(DATA_DIR + path.sep)) {
    throw new Error("Invalid dataset path.");
  }

  const content = await readFile(filePath, "utf8");

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });

  cache.set(datasetId, records);
  return records;
}

function applyFilters(records, query) {
  return records.filter((record) => {
    for (const [filterName, columns] of Object.entries(FILTER_COLUMNS)) {
      const requested = query[filterName];

      if (typeof requested !== "string" || !requested.trim()) {
        continue;
      }

      const column = columns.find((name) =>
        Object.hasOwn(record, name)
      );

      if (!column) return false;

      const actual = String(record[column] ?? "").toLowerCase();
      const expected = requested.trim().toLowerCase();

      if (filterName === "crop") {
        if (!actual.includes(expected)) return false;
      } else if (actual !== expected) {
        return false;
      }
    }

    return true;
  });
}

// GET /api/datasets
router.get("/", (req, res) => {
  const datasets = Object.entries(DATASETS).map(([id, item]) => ({
    id,
    description: item.description,
    coverage: item.coverage,
    source: item.source,
  }));

  return res.json({
    status: "success",
    geographicCoverage: ["United States"],
    datasets,
  });
});

// GET /api/datasets/state-summary/:state
// Returns the latest state-level NDVI and SMAP observations.
router.get("/state-summary/:state", async (req, res) => {
  try {
    const state = String(req.params.state || "").trim();

    if (!state) {
      return res.status(400).json({
        status: "error",
        message: "A state name is required.",
      });
    }

    const [ndviRecords, smapRecords] = await Promise.all([
      loadDataset("ndvi"),
      loadDataset("smap"),
    ]);

    const ndviMatches = ndviRecords
      .filter((record) =>
        String(record.state || "").toLowerCase() === state.toLowerCase()
      )
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const smapMatches = smapRecords
      .filter((record) =>
        String(record.ID || "").toLowerCase() === state.toLowerCase()
      )
      .sort((a, b) => String(b.Date).localeCompare(String(a.Date)));

    const latestNdvi = ndviMatches[0] || null;
    const latestSmap = smapMatches[0] || null;

    if (!latestNdvi && !latestSmap) {
      return res.status(404).json({
        status: "error",
        message: `No satellite dataset records found for ${state}.`,
      });
    }

    return res.json({
      status: "success",
      state,
      geographicLevel: "State-level reference point",
      disclaimer: "These are historical state-level dataset records, not farm-specific measurements.",
      ndvi: latestNdvi ? {
        value: Number(latestNdvi.ndvi),
        date: latestNdvi.date,
        quality: latestNdvi.quality,
        fillMethod: latestNdvi.fill_method,
        latitude: Number(latestNdvi.lat),
        longitude: Number(latestNdvi.lon),
        source: "Prepared NASA vegetation dataset",
      } : null,
      smap: latestSmap ? {
        value: Number(
          latestSmap.Soil_Moisture !== ""
            ? latestSmap.Soil_Moisture
            : latestSmap.Soil_Moisture_Filled
        ),
        date: latestSmap.Date,
        fillMethod: latestSmap.Fill_Method,
        gapDays: Number(latestSmap.Gap_Days),
        qualityFlag: latestSmap.QC_Flag,
        latitude: Number(latestSmap.Latitude),
        longitude: Number(latestSmap.Longitude),
        source: "NASA SMAP prepared dataset",
      } : null,
    });
  } catch (error) {
    console.error("State satellite summary error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to load state satellite data.",
    });
  }
});
// GET /api/datasets/:datasetId
// Optional filters: state, crop, year, date, limit, offset.
router.get("/:datasetId", async (req, res) => {
  try {
    const { datasetId } = req.params;
    const definition = DATASETS[datasetId];

    if (!definition) {
      return res.status(404).json({
        status: "error",
        message: "Dataset not found.",
      });
    }

    const limit = req.query.limit === undefined
      ? 100
      : Number(req.query.limit);

    const offset = req.query.offset === undefined
      ? 0
      : Number(req.query.offset);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500 ||
      !Number.isInteger(offset) ||
      offset < 0
    ) {
      return res.status(400).json({
        status: "error",
        message: "Limit must be 1–500 and offset must be a non-negative integer.",
      });
    }

    const records = await loadDataset(datasetId);
    const filtered = applyFilters(records, req.query);
    const data = filtered.slice(offset, offset + limit);

    return res.json({
      status: "success",
      dataset: datasetId,
      source: definition.source,
      coverage: definition.coverage,
      totalRecords: filtered.length,
      limit,
      offset,
      returnedRecords: data.length,
      data,
    });
  } catch (error) {
    console.error("Dataset API error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to load this dataset.",
    });
  }
});

export default router;
