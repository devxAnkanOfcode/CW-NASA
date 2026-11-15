# 🌾 CropSwitch — Precision Agriculture & Satellite Telemetry Platform

A modern web application linking real-time NASA Earth observation, high-resolution satellite imagery, and live microclimate telemetry across all 50 U.S. states to empower farmers, agronomists, and land managers with actionable field intelligence.

---

## 🚀 Key Features

- **50 U.S. States Coverage:** Native agronomic data, crop suggestions, and weather coordinate mapping for every state and agricultural county in the U.S.
- **🛰️ Live Satellite Earth Observation:** Interactive Leaflet map with true-color satellite imagery, NDVI vegetative vigor indexing, and SMAP soil moisture layers.
- **🌦️ Real-Time Telemetry:** Integrates directly with Open-Meteo for live field temperature, relative humidity, wind speed, vapor pressure deficit (VPD), UV radiation, and 5-day forecasts.
- **📊 Farmer Command Center (`frontend/dashboard.html`):**
  - **🏡 My Farms & Landholdings:** Multi-farm management and enterprise organization.
  - **🌾 Managed Fields & Boundaries:** Add custom fields with precise GPS coordinates, acreage, crop type, and soil profiles.
  - **🌤️ Daily Operational Briefing:** Live spray window risk, soil compaction / trafficability index, and weekly evapotranspiration (ETc) water balance.
  - **💰 Farm Economics:** Real-time CBOT commodity market ticker, per-acre operating budgets, and interactive yield/profit simulators.
  - **⚙️ Operational Settings:** Configurable agronomic units, automated telemetry polling intervals, and JSON backup export/reset.

---

## 📂 Project Structure

```text
nasa-web-app/
├── frontend/
│   ├── index.html              # Main public landing page & crop planner
│   ├── styles.css              # Landing page styling & responsive layout
│   ├── script.js               # Landing page controller (weather, crops, Leaflet map)
│   ├── dashboard.html          # Farmer Command Center & Observatory
│   ├── dashboard.css           # Command center styling & dark-mode themes
│   ├── dashboard.js            # Dashboard state engine, Leaflet radar, economics
│   ├── login.html              # Farmer & agronomist sign-in / registration
│   ├── login.css               # Authentication portal styles
│   ├── login.js                # Auth controller & session management
│   └── cropswitch-logo.png     # Visual brand assets & screenshots
├── backend/                    # Backend API structure (Node/Express or Python)
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   └── utils/
├── .gitignore
└── README.md
```

---
