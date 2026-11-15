import { Router } from "express";
import argon2 from "argon2";
import { prisma } from "../config/prisma.js";

const router = Router();

const allowedRoles = ["grower", "agronomist", "researcher"];

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function publicUser(user, farmName = "") {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    farm: farmName,
  };
}

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const farmName = typeof req.body?.farm === "string" ? req.body.farm.trim() : "";
    const email = typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    const password = typeof req.body?.password === "string"
      ? req.body.password
      : "";
    const role = typeof req.body?.role === "string"
      ? req.body.role
      : "grower";

    if (name.length < 2 || name.length > 120) {
      return res.status(400).json({ message: "Name must be between 2 and 120 characters." });
    }

    if (farmName.length < 2 || farmName.length > 150) {
      return res.status(400).json({ message: "Farm name must be between 2 and 150 characters." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ message: "Password must be between 8 and 128 characters." });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Select a valid agricultural role." });
    }

    const passwordHash = await argon2.hash(password);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role,
        },
      });

      const farm = await tx.farm.create({
        data: {
          name: farmName,
          userId: user.id,
        },
      });

      return { user, farm };
    });

    await regenerateSession(req);
    req.session.userId = result.user.id;
    await saveSession(req);

    return res.status(201).json({
      message: "Account created successfully.",
      user: publicUser(result.user, result.farm.name),
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    console.error("Registration error:", error.message);

    return res.status(500).json({
      message: "Unable to create the account. Please try again.",
    });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    const password = typeof req.body?.password === "string"
      ? req.body.password
      : "";

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        farms: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      return res.status(401).json({
        message: "Incorrect email or password.",
      });
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);

    return res.status(200).json({
      message: "Login successful.",
      user: publicUser(user, user.farms[0]?.name || ""),
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      message: "Unable to sign in. Please try again.",
    });
  }
});

// CURRENT SESSION
router.get("/me", async (req, res) => {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Not authenticated." });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      include: {
        farms: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });

    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Account no longer exists." });
    }

    return res.status(200).json({
      user: publicUser(user, user.farms[0]?.name || ""),
    });
  } catch (error) {
    console.error("Session lookup error:", error.message);

    return res.status(500).json({
      message: "Unable to verify your session.",
    });
  }
});

// LOGOUT
router.post("/logout", (req, res) => {
  if (!req.session) {
    res.clearCookie("cropswitch.sid", { path: "/" });
    return res.status(200).json({ message: "Logged out." });
  }

  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error.message);
      return res.status(500).json({ message: "Unable to sign out." });
    }

    res.clearCookie("cropswitch.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res.status(200).json({ message: "Logged out successfully." });
  });
});

export default router;

