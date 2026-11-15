import { Router } from "express";

const router = Router();

const NASA_POWER_URL =
  "https://power.larc.nasa.gov/api/temporal/daily/point";

const PARAMETERS = {
  T2M: { name: "Temperature at 2 meters", unit: "°C" },
  RH2M: { name: "Relative humidity at 2 meters", unit: "%" },
  PRECTOTCORR: { name: "Corrected precipitation", unit: "mm/day" },
  WS2M: { name: "Wind speed at 2 meters", unit: "m/s" },
};

function validDate(value) {
  if (!/^\d{8}$/.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

router.get("/point", async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const start = req.query.start;
  const end = req.query.end;

  if (
    req.query.latitude === undefined ||
    req.query.longitude === undefined ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return res.status(400).json({
      status: "error",
      message: "Valid latitude (-90 to 90) and longitude (-180 to 180) are required.",
    });
  }

  if (
    typeof start !== "string" ||
    typeof end !== "string" ||
    !validDate(start) ||
    !validDate(end)
  ) {
    return res.status(400).json({
      status: "error",
      message: "Start and end dates must use YYYYMMDD format and be valid dates.",
    });
  }

  const startDate = new Date(
    Date.UTC(
      Number(start.slice(0, 4)),
      Number(start.slice(4, 6)) - 1,
      Number(start.slice(6, 8))
    )
  );

  const endDate = new Date(
    Date.UTC(
      Number(end.slice(0, 4)),
      Number(end.slice(4, 6)) - 1,
      Number(end.slice(6, 8))
    )
  );

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const days = (endDate - startDate) / 86400000;

  if (startDate > endDate || endDate > today || days > 365) {
    return res.status(400).json({
      status: "error",
      message: "Date range must be chronological, not in the future, and no longer than 366 days.",
    });
  }

  const url = new URL(NASA_POWER_URL);

  url.search = new URLSearchParams({
    parameters: Object.keys(PARAMETERS).join(","),
    community: "AG",
    longitude: String(longitude),
    latitude: String(latitude),
    start,
    end,
    format: "JSON",
  }).toString();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      console.error("NASA POWER HTTP error:", response.status);

      return res.status(502).json({
        status: "error",
        message: "NASA POWER is temporarily unavailable.",
      });
    }

    const result = await response.json();
    const parameters = result?.properties?.parameter;

    if (!parameters || !parameters.T2M) {
      return res.status(502).json({
        status: "error",
        message: "NASA POWER returned an unexpected response.",
      });
    }

    const dates = Object.keys(parameters.T2M).sort();

    const data = dates.map((date) => {
      const record = { date };

      for (const [key, metadata] of Object.entries(PARAMETERS)) {
        const value = parameters[key]?.[date];

        record[key] =
          value === undefined || value === null || Number(value) === -999
            ? null
            : Number(value);
      }

      return record;
    });

    return res.json({
      status: "success",
      source: "NASA POWER",
      coverage: "Global point-based coverage",
      location: {
        latitude,
        longitude,
      },
      community: "AG",
      temporalResolution: "Daily",
      dateRange: { start, end },
      parameters: PARAMETERS,
      returnedRecords: data.length,
      data,
    });
  } catch (error) {
    console.error("NASA POWER request failed:", error.message);

    return res.status(502).json({
      status: "error",
      message:
        error.name === "TimeoutError"
          ? "NASA POWER request timed out. Try again later."
          : "Unable to retrieve NASA POWER data.",
    });
  }
});

export default router;
