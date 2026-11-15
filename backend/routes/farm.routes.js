import { Router } from "express";
import { prisma } from "../config/prisma.js";

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireApiAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({
      status: "error",
      message: "Authentication required."
    });
  }

  next();
}

function cleanOptionalString(value, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;

  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) return undefined;

  return cleaned;
}

function handleServerError(res, error, action) {
  console.error(`Farm API ${action} failed:`, error);

  return res.status(500).json({
    status: "error",
    message: "The server could not complete this request."
  });
}

router.use(requireApiAuth);

// GET /api/farms
router.get("/", async (req, res) => {
  try {
    const farms = await prisma.farm.findMany({
      where: { userId: req.session.userId },
      include: {
        parcels: {
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    return res.json({ status: "success", farms });
  } catch (error) {
    return handleServerError(res, error, "list farms");
  }
});

// POST /api/farms
router.post("/", async (req, res) => {
  try {
    const name = cleanOptionalString(req.body?.name, 150);
    const operator = cleanOptionalString(req.body?.operator, 120);
    const location = cleanOptionalString(req.body?.location, 255);

    if (name === undefined || !name) {
      return res.status(400).json({
        status: "error",
        message: "A farm name of 1–150 characters is required."
      });
    }

    if (operator === undefined || location === undefined) {
      return res.status(400).json({
        status: "error",
        message: "Operator or location is too long or invalid."
      });
    }

    const farm = await prisma.farm.create({
      data: {
        name,
        operator,
        location,
        userId: req.session.userId
      },
      include: { parcels: true }
    });

    return res.status(201).json({ status: "success", farm });
  } catch (error) {
    return handleServerError(res, error, "create farm");
  }
});

// DELETE /api/farms/:farmId
router.delete("/:farmId", async (req, res) => {
  try {
    const { farmId } = req.params;

    if (!UUID_REGEX.test(farmId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid farm ID."
      });
    }

    const result = await prisma.farm.deleteMany({
      where: {
        id: farmId,
        userId: req.session.userId
      }
    });

    if (result.count === 0) {
      return res.status(404).json({
        status: "error",
        message: "Farm not found."
      });
    }

    return res.json({ status: "success", message: "Farm deleted." });
  } catch (error) {
    return handleServerError(res, error, "delete farm");
  }
});

// POST /api/farms/:farmId/parcels
router.post("/:farmId/parcels", async (req, res) => {
  try {
    const { farmId } = req.params;

    if (!UUID_REGEX.test(farmId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid farm ID."
      });
    }

    const farm = await prisma.farm.findFirst({
      where: {
        id: farmId,
        userId: req.session.userId
      },
      select: { id: true }
    });

    if (!farm) {
      return res.status(404).json({
        status: "error",
        message: "Farm not found."
      });
    }

    const name = cleanOptionalString(req.body?.name, 150);
    const crop = cleanOptionalString(req.body?.crop, 100);
    const location = cleanOptionalString(req.body?.location, 255);
    const irrigation = cleanOptionalString(req.body?.irrigation, 100);
    const stage = cleanOptionalString(req.body?.stage, 100);
    const soilType = cleanOptionalString(req.body?.soilType, 100);
    const acres = Number(req.body?.acres);

    const latitude = req.body?.latitude === null || req.body?.latitude === undefined || req.body?.latitude === ""
      ? null
      : Number(req.body.latitude);

    const longitude = req.body?.longitude === null || req.body?.longitude === undefined || req.body?.longitude === ""
      ? null
      : Number(req.body.longitude);

    if (name === undefined || !name || crop === undefined || !crop) {
      return res.status(400).json({
        status: "error",
        message: "Parcel name and crop are required."
      });
    }

    if (
      location === undefined ||
      irrigation === undefined ||
      stage === undefined ||
      soilType === undefined
    ) {
      return res.status(400).json({
        status: "error",
        message: "One or more parcel text fields are invalid or too long."
      });
    }

    if (!Number.isFinite(acres) || acres <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Parcel acreage must be a positive number."
      });
    }

    if (
      (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
    ) {
      return res.status(400).json({
        status: "error",
        message: "Parcel coordinates are outside valid latitude/longitude ranges."
      });
    }

    if ((latitude === null) !== (longitude === null)) {
      return res.status(400).json({
        status: "error",
        message: "Provide both coordinates, or leave both empty."
      });
    }

    const parcel = await prisma.parcel.create({
      data: {
        name,
        crop,
        acres,
        location,
        irrigation,
        latitude,
        longitude,
        stage,
        soilType,
        farmId
      }
    });

    return res.status(201).json({ status: "success", parcel });
  } catch (error) {
    return handleServerError(res, error, "create parcel");
  }
});

// DELETE /api/farms/:farmId/parcels/:parcelId
router.delete("/:farmId/parcels/:parcelId", async (req, res) => {
  try {
    const { farmId, parcelId } = req.params;

    if (!UUID_REGEX.test(farmId) || !UUID_REGEX.test(parcelId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid farm or parcel ID."
      });
    }

    const result = await prisma.parcel.deleteMany({
      where: {
        id: parcelId,
        farmId,
        farm: {
          userId: req.session.userId
        }
      }
    });

    if (result.count === 0) {
      return res.status(404).json({
        status: "error",
        message: "Parcel not found."
      });
    }

    return res.json({ status: "success", message: "Parcel deleted." });
  } catch (error) {
    return handleServerError(res, error, "delete parcel");
  }
});

export default router;
