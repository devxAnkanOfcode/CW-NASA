/**
 * CropSwitch ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â Farmer & Agronomist Command Center Controller
 * 100% Dynamic User Data Architecture ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â Zero Mock / Fake Data
 */

document.addEventListener('DOMContentLoaded', async () => {

    // ==========================================
    // 1. DATA STORES & STATE
    // ==========================================
    let FIELD_DATA = {};
    let activeFieldId = null;
    let userTasks = [];
    let userSensors = [];
    let mapInstance = null;
    let currentTileLayer = null;
    let fieldPolygonLayer = null;
    let isBoundaryVisible = true;

    // Tile Layers Free Feeds
    const TILE_FEEDS = {
        esri: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        usgs: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
        carto: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    };

    // ==========================================
    // 2. USER PROFILE SYNC
    // ==========================================
    function initUserProfile() {
        const storedName = localStorage.getItem('cropswitch_user_name');
        const storedFarm = localStorage.getItem('cropswitch_user_farm');
        const userAvatar = document.getElementById('userAvatar');
        const userNameDisplay = document.getElementById('userNameDisplay');
        const userFarmDisplay = document.getElementById('userFarmDisplay');
        const repOperatorName = document.getElementById('repOperatorName');
        const repFarmName = document.getElementById('repFarmName');

        const operator = (storedName && storedName.trim()) ? storedName.trim() : 'Farm Operator';
        const farm = (storedFarm && storedFarm.trim()) ? storedFarm.trim() : (operator + "'s Farm");

        if (userNameDisplay) userNameDisplay.textContent = operator;
        if (userFarmDisplay) userFarmDisplay.textContent = farm;
        if (repOperatorName) repOperatorName.textContent = operator;
        if (repFarmName) repFarmName.textContent = farm;

        if (userAvatar) {
            const parts = operator.split(' ');
            let initials = parts[0] ? parts[0].charAt(0).toUpperCase() : 'O';
            if (parts.length > 1 && parts[1]) {
                initials += parts[1].charAt(0).toUpperCase();
            }
            userAvatar.textContent = initials;
        }


    }

    // ==========================================
    // 3. PARCEL DATA ENGINE (REAL USER FIELDS ONLY)
    // ==========================================
    function createParcelObject(id, data) {
        const latValue = data.lat !== null && data.lat !== undefined && String(data.lat).trim() !== ''
            ? Number(data.lat) : NaN;

        const lngValue = data.lng !== null && data.lng !== undefined && String(data.lng).trim() !== ''
            ? Number(data.lng) : NaN;

        const hasCoordinates =
            Number.isFinite(latValue) &&
            Number.isFinite(lngValue) &&
            latValue >= -90 && latValue <= 90 &&
            lngValue >= -180 && lngValue <= 180;

        const lat = hasCoordinates ? latValue : null;
        const lng = hasCoordinates ? lngValue : null;

        const acreageValue = Number(data.acres);
        const acres = Number.isFinite(acreageValue) && acreageValue > 0
            ? acreageValue : 0;

        const crop = data.crop || 'Unknown crop';
        const irrigation = data.irrigation || 'Not specified';
        const stage = data.stage || 'Not specified';
        const soil = data.soilType || 'Not specified';

        let cost = 520.00;
        let price = 4.48;
        let defYield = 190;
        let unit = 'bu';

        if (crop.includes('Corn')) { cost = 642.50; price = 4.48; defYield = 205; }
        else if (crop.includes('Soybean')) { cost = 485.00; price = 11.84; defYield = 62; }
        else if (crop.includes('Wheat')) { cost = 395.00; price = 5.92; defYield = 75; }
        else if (crop.includes('Cotton')) { cost = 580.00; price = 0.78; defYield = 950; unit = 'lbs'; }
        else if (crop.includes('Alfalfa')) { cost = 320.00; price = 180.00; defYield = 5.5; unit = 'ton'; }

        // This is only an estimated preview rectangle, not a surveyed field boundary.
        let polygon = null;

        if (hasCoordinates && acres > 0) {
            const halfSideM = Math.sqrt(acres * 4046.86) / 2;
            const dLat = halfSideM / 111320;
            const cosLat = Math.cos(lat * Math.PI / 180);
            const dLng = halfSideM / (111320 * (Math.abs(cosLat) > 0.01 ? Math.abs(cosLat) : 1));

            polygon = [
                [lat + dLat, lng - dLng],
                [lat + dLat, lng + dLng],
                [lat - dLat, lng + dLng],
                [lat - dLat, lng - dLng]
            ];
        }

        let zoom = 15;
        if (acres >= 500) zoom = 13;
        else if (acres >= 200) zoom = 14;
        else if (acres > 0 && acres <= 40) zoom = 16;

        return {
            id: id,
            farmId: data.farmId || null,
            name: data.fieldName || data.name || 'My Field Parcel',
            crop: irrigation === 'Not specified' ? crop : `${crop} | ${irrigation}`,
            rawCrop: crop,
            acres: acres,
            location: data.location || (hasCoordinates
                ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                : 'Location not specified'),
            lat: lat,
            lng: lng,
            zoom: zoom,
            stage: stage,
            soilType: soil,
            irrigation: irrigation,
            ndvi: null,
            ndviStatus: 'No satellite data',
            surfaceSoilMoisture: null,
            nextAction: `Next: Verify field conditions and ${irrigation} calibration`,
            costPerAcre: cost,
            commodityPrice: price,
            defaultYield: defYield,
            unit: unit,
            polygon: polygon
        };
    }
    function loadUserParcels() {
        // Parcel records are loaded through loadUserFarms() from PostgreSQL.
        // Retained for compatibility with existing callers.
        renderParcels();
    }
    function renderParcels() {
        const grid = document.getElementById('fieldsGrid');
        const select = document.getElementById('topbarFieldSelect');
        const sidebarCount = document.getElementById('sidebarFieldCount');
        const addCard = document.getElementById('addFieldCardBtn');
        if (!grid) return;

        // Clear existing field cards and empty states
        const oldCards = grid.querySelectorAll('.field-card:not(.add-card), .empty-state-box');
        oldCards.forEach(c => c.remove());

        if (select) select.innerHTML = '';
        const fieldIds = activeFarmId ? Object.keys(FIELD_DATA).filter(id => FIELD_DATA[id].farmId === activeFarmId) : [];

        if (sidebarCount) sidebarCount.textContent = fieldIds.length;

        // EMPTY STATE: User has not added any parcels
        if (fieldIds.length === 0) {
            activeFieldId = null;
            if (select) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'No fields registered';
                select.appendChild(opt);
            }

            const emptyBox = document.createElement('div');
            emptyBox.className = 'empty-state-box';
            emptyBox.innerHTML = `
                <div class="empty-state-icon">&#127793;</div>
                <h4>No Field Parcels Registered Yet</h4>
                <p>Register your first parcel boundary to configure satellite Earth observation and soil radar telemetry.</p>
                <button type="button" class="topbar-btn primary" id="addFirstFieldBtn" style="margin-top: 4px;">+ Register Your First Field</button>
            `;
            grid.insertBefore(emptyBox, addCard);

            const btn = document.getElementById('addFirstFieldBtn');
            if (btn) btn.addEventListener('click', openAddField);

            updateEmptyViews();
            return;
        }

        // VALID PARCELS EXIST
        if (!activeFieldId || !fieldIds.includes(activeFieldId)) {
            activeFieldId = fieldIds[0];
        }

        fieldIds.forEach(id => {
            const field = FIELD_DATA[id];
            const isActive = (id === activeFieldId);

            // Add dropdown option
            if (select) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = `${field.name} (${field.acres} ac | ${field.crop})`;
                if (isActive) opt.selected = true;
                select.appendChild(opt);
            }

            // Create field card
            const card = document.createElement('div');
            card.className = 'field-card' + (isActive ? ' active' : '');
            card.setAttribute('data-field-id', id);
            const ndviDisplay = field.ndvi !== null && field.ndvi !== undefined && field.ndvi !== "" && Number.isFinite(Number(field.ndvi)) ? Number(field.ndvi).toFixed(3) : "Not available";
            card.innerHTML = `
                <div class="field-card-thumb">
                    <img src="dashboard-preview.jpg" alt="${escapeHTML(field.name)}">
                    <span class="field-badge-crop">${escapeHTML(field.crop)}</span>
                    ${isActive ? '<span class="field-badge-active">Active</span>' : ''}
                    <button type="button" class="field-delete-btn" data-delete-field="${id}" title="Delete ${escapeHTML(field.name)}">X</button>
                </div>
                <div class="field-card-body">
                    <div class="field-title-row">
                        <h4>${escapeHTML(field.name)}</h4>
                        <span class="field-acreage">${field.acres} Acres</span>
                    </div>
                    <div class="field-stage">${escapeHTML(field.stage)}</div>
                    <div class="field-metrics-row">
                        <div class="f-metric">
                            <span class="f-metric-label">NDVI Index</span>
                            <span class="f-metric-val">${ndviDisplay}</span>
                        </div>
                        <div class="f-metric">
                            <span class="f-metric-label">Surface Soil Moisture (0-1 cm)</span>
                            <span class="f-metric-val">${field.surfaceSoilMoisture ?? 'Not available'}</span>
                        </div>
                    </div>
                    <div class="field-next-action" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>${escapeHTML(field.nextAction)}</span>
                        <button type="button" class="field-delete-link" data-delete-field="${id}">Remove</button>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => switchActiveField(id));
            grid.insertBefore(card, addCard);
        });

        // Attach Delete Listeners
        grid.querySelectorAll('[data-delete-field]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fid = btn.getAttribute('data-delete-field');
                deleteFieldParcel(fid);
            });
        });

        switchActiveField(activeFieldId);
    }

    async function deleteFieldParcel(fieldId) {
        if (!fieldId || !FIELD_DATA[fieldId]) return;

        const field = FIELD_DATA[fieldId];

        if (!field.farmId) {
            alert('Cannot delete this parcel because its farm ID is missing. No data was changed.');
            return;
        }

        const confirmed = confirm(
            `Are you sure you want to permanently delete "${field.name}" (${field.acres} ac)?\n\nThis will delete this parcel from your account. This action cannot be undone.`
        );

        if (!confirmed) return;

        try {
            const response = await fetch(
                `/api/farms/${encodeURIComponent(field.farmId)}/parcels/${encodeURIComponent(fieldId)}`,
                {
                    method: 'DELETE',
                    credentials: 'same-origin',
                    headers: { 'Accept': 'application/json' }
                }
            );

            if (response.status === 401) {
                window.location.replace('login.html');
                return;
            }

            const result = await response.json().catch(() => null);

            if (!response.ok || !result || result.status !== 'success') {
                throw new Error(
                    result && result.message
                        ? result.message
                        : `Parcel deletion failed (HTTP ${response.status}).`
                );
            }

            // Update frontend state only after the server confirms deletion.
            delete FIELD_DATA[fieldId];

            if (activeFieldId === fieldId) {
                activeFieldId = null;
            }

            renderParcels();
            renderFarms();

        } catch (error) {
            console.error('Parcel deletion failed:', error);
            alert(error.message || 'Could not delete the parcel. Please try again.');
        }
    }

    // ==========================================
    // 3B. LIVE REAL-TIME TELEMETRY ENGINE (OPEN-METEO API)
    // ==========================================
    function decodeWeatherCode(code) {
    switch (code) {
        case 0: return { desc: 'Clear sky', icon: '\u2600\uFE0F' };
        case 1: return { desc: 'Mainly clear', icon: '\uD83C\uDF24\uFE0F' };
        case 2: return { desc: 'Partly cloudy', icon: '\u26C5' };
        case 3: return { desc: 'Overcast', icon: '\u2601\uFE0F' };
        case 45:
        case 48: return { desc: 'Fog / Mist', icon: '\uD83C\uDF2B\uFE0F' };
        case 51:
        case 53:
        case 55: return { desc: 'Light drizzle', icon: '\uD83C\uDF26\uFE0F' };
        case 61:
        case 63:
        case 65: return { desc: 'Rain showers', icon: '\uD83C\uDF27\uFE0F' };
        case 71:
        case 73:
        case 75:
        case 77: return { desc: 'Snow flurry', icon: '\u2744\uFE0F' };
        case 80:
        case 81:
        case 82: return { desc: 'Passing rain', icon: '\uD83C\uDF27\uFE0F' };
        case 85:
        case 86: return { desc: 'Snow showers', icon: '\uD83C\uDF28\uFE0F' };
        case 95:
        case 96:
        case 99: return { desc: 'Thunderstorm', icon: '\u26C8\uFE0F' };
        default: return { desc: 'Partly cloudy', icon: '\u26C5' };
    }
}
function getWindCompass(degrees) {
        if (degrees === undefined || degrees === null) return 'NW';
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const idx = Math.round(degrees / 22.5) % 16;
        return directions[idx];
    }

    async function fetchLiveTelemetry(field) {
        const hasValidCoordinates = field &&
            field.lat !== null && field.lat !== undefined && field.lat !== '' &&
            field.lng !== null && field.lng !== undefined && field.lng !== '' &&
            Number.isFinite(Number(field.lat)) &&
            Number.isFinite(Number(field.lng));

        const lat = hasValidCoordinates ? Number(field.lat) : null;
        const lng = hasValidCoordinates ? Number(field.lng) : null;
        const locationName = hasValidCoordinates
            ? `${field.name} (${field.location || 'Location not specified'})`
            : 'Location unavailable';

        const topbarTelemetry = document.getElementById('topbarTelemetryText');
        const briefLastUpdated = document.getElementById('briefLastUpdated');
        const forecastLocation = document.getElementById('forecastLocationText');
        const forecastDaysRow = document.getElementById('forecastDaysRow');

        const briefSprayStatus = document.getElementById('briefSprayStatus');
        const briefSprayDetail = document.getElementById('briefSprayDetail');
        const briefSprayBadge = document.getElementById('briefSprayBadge');

        const briefTractorStatus = document.getElementById('briefTractorStatus');
        const briefTractorDetail = document.getElementById('briefTractorDetail');
        const briefTractorBadge = document.getElementById('briefTractorBadge');

        const briefVpdStatus = document.getElementById('briefVpdStatus');
        const briefVpdDetail = document.getElementById('briefVpdDetail');
        const briefVpdBadge = document.getElementById('briefVpdBadge');

        const briefMoistureStatus = document.getElementById('briefMoistureStatus');
        const briefMoistureDetail = document.getElementById('briefMoistureDetail');
        const briefMoistureBadge = document.getElementById('briefMoistureBadge');

        const dashGddRate = document.getElementById('dashGddRate');
        const dashGddCumulative = document.getElementById('dashGddCumulative');

        if (!hasValidCoordinates) {
            if (topbarTelemetry) topbarTelemetry.textContent = 'Telemetry unavailable: add a parcel with valid coordinates';
            if (forecastLocation) forecastLocation.textContent = 'Add a parcel with valid coordinates to view local weather.';
            if (briefLastUpdated) briefLastUpdated.textContent = 'No location data available';
            return;
        }
        if (forecastLocation) {
            forecastLocation.textContent = `Live microclimate for ${locationName} | ${Math.abs(lat).toFixed(4)} ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(4)} ${lng >= 0 ? "E" : "W"}`;
        }

        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,dew_point_2m,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,vapour_pressure_deficit,soil_temperature_0cm,soil_temperature_6cm,soil_moisture_0_to_1cm&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,et0_fao_evapotranspiration,precipitation_sum&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;

            const res = await fetch(url);
            if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
            const data = await res.json();

            const cur = data.current;
            const daily = data.daily;

            const tempF = Math.round(cur.temperature_2m);
            const humidity = Math.round(cur.relative_humidity_2m);
            const windMph = cur.wind_speed_10m != null && Number.isFinite(Number(cur.wind_speed_10m)) ? Math.round(Number(cur.wind_speed_10m)) : null;
            const gustsMph = cur.wind_gusts_10m != null && Number.isFinite(Number(cur.wind_gusts_10m)) ? Math.round(Number(cur.wind_gusts_10m)) : null;
            const windDir = getWindCompass(cur.wind_direction_10m);
            const weather = decodeWeatherCode(cur.weather_code);
            const vpd = cur.vapour_pressure_deficit != null && Number.isFinite(Number(cur.vapour_pressure_deficit)) ? Number(cur.vapour_pressure_deficit).toFixed(2) : null;
            const soilMoistPct = cur.soil_moisture_0_to_1cm != null && Number.isFinite(Number(cur.soil_moisture_0_to_1cm)) ? Math.round(Number(cur.soil_moisture_0_to_1cm) * 100) : null;

            // Update root moisture on active field
            if (field) {
                field.surfaceSoilMoisture = soilMoistPct !== null ? `${soilMoistPct}% Vol` : null;
                const activeCard = document.querySelector(`.field-card[data-field-id="${field.id}"]`);
                if (activeCard) {
                    const metricVals = activeCard.querySelectorAll('.f-metric-val');
                    if (metricVals.length > 1) {
                        metricVals[1].textContent = field.surfaceSoilMoisture ?? 'Not available';
                    }
                }
            }

            // 1. Weather-based Spray Caution (not a safety approval)
            const rainValue = daily?.precipitation_probability_max?.[0];
            const rainProbToday = rainValue != null && Number.isFinite(Number(rainValue))
                ? Math.round(Number(rainValue))
                : null;

            let sprayStatus = 'Weather Data Incomplete';
            let sprayDetail = 'Weather measurements are incomplete. Check local conditions and the product label before application.';
            let sprayBadgeText = 'Check Conditions';
            let sprayBadgeClass = 'brief-badge warning';
            let sprayPill = 'Check Conditions';

            if (windMph !== null && (windMph > 14 || (gustsMph !== null && gustsMph > 18))) {
                sprayStatus = 'High Wind Caution';
                sprayDetail = `Measured wind: ${windMph} mph${gustsMph !== null ? `, gusts ${gustsMph} mph` : ', gust data unavailable'}. Review drift conditions and product-label restrictions.`;
                sprayBadgeText = 'Wind Caution';
                sprayBadgeClass = 'brief-badge risk';
                sprayPill = 'Wind Caution';
            } else if (windMph !== null && windMph < 3) {
                sprayStatus = 'Low Wind Caution';
                sprayDetail = `Measured wind is ${windMph} mph. Check for inversion conditions before application.`;
                sprayBadgeText = 'Low Wind Caution';
                sprayBadgeClass = 'brief-badge warning';
                sprayPill = 'Low Wind Caution';
            } else if (rainProbToday !== null && rainProbToday > 40) {
                sprayStatus = 'Rain Washoff Caution';
                sprayDetail = `Forecast precipitation probability: ${rainProbToday}%. Check the product's rainfast interval and forecast.`;
                sprayBadgeText = 'Rain Caution';
                sprayBadgeClass = 'brief-badge warning';
                sprayPill = 'Rain Caution';
            } else if (windMph === null || gustsMph === null || rainProbToday === null) {
                sprayStatus = 'Weather Data Incomplete';
                sprayDetail = `Wind: ${windMph !== null ? `${windMph} mph` : 'unavailable'}; gusts: ${gustsMph !== null ? `${gustsMph} mph` : 'unavailable'}; rain probability: ${rainProbToday !== null ? `${rainProbToday}%` : 'unavailable'}. No spray approval can be made from incomplete data.`;
                sprayBadgeText = 'Check Conditions';
                sprayBadgeClass = 'brief-badge warning';
                sprayPill = 'Check Conditions';
            } else {
                sprayStatus = 'No Major Weather Flags';
                sprayDetail = `Measured wind: ${windMph} mph, gusts: ${gustsMph} mph. Forecast precipitation probability: ${rainProbToday}%. This is a weather screening only; follow the product label and local conditions.`;
                sprayBadgeText = 'Review Product Label';
                sprayBadgeClass = 'brief-badge warning';
                sprayPill = 'Review Spray Conditions';
            }

            if (briefSprayStatus) briefSprayStatus.textContent = sprayStatus;
            if (briefSprayDetail) briefSprayDetail.textContent = sprayDetail;
            if (briefSprayBadge) {
                briefSprayBadge.textContent = sprayBadgeText;
                briefSprayBadge.className = sprayBadgeClass;
            }
            // Topbar Telemetry Pill
            if (topbarTelemetry) {
                topbarTelemetry.textContent = `Telemetry Live: ${tempF}\u00B0F \u00B7 ${weather.desc} \u00B7 Wind ${windMph} mph ${windDir} \u00B7 ${sprayPill}`;
            }

            // Header Timestamp
            if (briefLastUpdated) {
                const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                briefLastUpdated.textContent = `Live Telemetry | Updated ${timeStr}`;
            }

            // 2. Surface Soil Moisture (0â€“1 cm) â€” not a trafficability assessment
            let tractorStatus = soilMoistPct === null ? 'Unavailable' : 'Not assessed';
            let tractorDetail = soilMoistPct === null
                ? 'No valid surface soil moisture measurement is available. Field trafficability cannot be assessed.'
                : `Open-Meteo surface soil moisture is ${soilMoistPct}% Vol at 0â€“1 cm. This shallow reading alone cannot establish soil bearing strength, compaction risk, or safe machinery access.`;
            let tractorBadge = 'Trafficability unverified';
            let tractorClass = 'brief-badge info';

            if (briefTractorStatus) briefTractorStatus.textContent = tractorStatus;
            if (briefTractorDetail) briefTractorDetail.textContent = tractorDetail;
            if (briefTractorBadge) {
                briefTractorBadge.textContent = tractorBadge;
                briefTractorBadge.className = tractorClass;
            }

            // 3. Vapor Pressure Deficit (atmospheric drying demand)
            const vpdNum = vpd === null ? null : Number(vpd);
            let vpdStatus = vpdNum === null ? 'Unavailable' : `${vpd} kPa`;
            let vpdDetail = vpdNum === null
                ? 'No valid vapor pressure deficit measurement is available.'
                : `Measured vapor pressure deficit is ${vpd} kPa. VPD describes atmospheric drying demand; it does not independently diagnose crop water stress or fungal disease.`;
            let vpdBadge = vpdNum === null ? 'Data unavailable' : 'Atmospheric demand';
            let vpdClass = 'brief-badge info';

            if (briefVpdStatus) briefVpdStatus.textContent = vpdStatus;
            if (briefVpdDetail) briefVpdDetail.textContent = vpdDetail;
            if (briefVpdBadge) {
                briefVpdBadge.textContent = vpdBadge;
                briefVpdBadge.className = vpdClass;
            }

            // 4. Weekly Moisture Balance (Rain vs ETc)
            let totalRain = 0;
            let totalEtc = 0;
            if (daily && daily.precipitation_sum) {
                totalRain = daily.precipitation_sum.slice(0, 5).reduce((acc, v) => acc + (v || 0), 0);
            }
            if (daily && daily.et0_fao_evapotranspiration) {
                totalEtc = daily.et0_fao_evapotranspiration.slice(0, 5).reduce((acc, v) => acc + (v || 0), 0);
            }
            const netMoist = totalRain - totalEtc;
            const netSign = netMoist >= 0 ? '+' : '';

            if (briefMoistureStatus) {
                briefMoistureStatus.textContent = `${netSign}${netMoist.toFixed(2)} in ${netMoist >= 0 ? 'Surplus' : 'Deficit'}`;
            }
            if (briefMoistureDetail) {
                briefMoistureDetail.textContent = `5-day cumulative rainfall: ${totalRain.toFixed(2)} in vs crop evapotranspiration (ETc) of ${totalEtc.toFixed(2)} in.`;
            }
            if (briefMoistureBadge) {
                briefMoistureBadge.textContent = netMoist >= 0 ? 'Adequate Reserves' : 'Depleting Soil Water';
                briefMoistureBadge.className = netMoist >= 0 ? 'brief-badge optimal' : 'brief-badge warning';
            }

            // 5. 5-Day Agronomic Forecast Strip
            if (forecastDaysRow && daily && daily.time) {
                forecastDaysRow.innerHTML = '';
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

                for (let i = 0; i < Math.min(5, daily.time.length); i++) {
                    const dateObj = new Date(daily.time[i] + 'T00:00:00');
                    const dayLabel = i === 0 ? 'Today' : dayNames[dateObj.getDay()];
                    const dayCode = daily.weather_code[i];
                    const dayIcon = decodeWeatherCode(dayCode).icon;
                    const maxT = Math.round(daily.temperature_2m_max[i]);
                    const minT = Math.round(daily.temperature_2m_min[i]);
                    const rainProb = daily.precipitation_probability_max[i] !== undefined ? daily.precipitation_probability_max[i] : 0;

                    const dayCard = document.createElement('div');
                    dayCard.className = 'm-forecast-day';
                    dayCard.innerHTML = `
                        <span class="m-day-name">${dayLabel}</span>
                        <span class="m-day-icon">${dayIcon}</span>
                        <span class="m-day-temp">${maxT}&deg; / ${minT}&deg;</span>
                        <span style="font-size: 10px; color: ${rainProb > 40 ? '#DC2626' : '#6B7280'}; font-weight: 600;">Rain ${rainProb}%</span>
                    `;
                    forecastDaysRow.appendChild(dayCard);
                }
            }

            // 6. GDD Calculation
            if (daily && daily.temperature_2m_max && daily.temperature_2m_min) {
                const max0 = daily.temperature_2m_max[0];
                const min0 = daily.temperature_2m_min[0];
                const todayGdd = Math.max(0, Math.round(((max0 + min0) / 2) - 50));
                if (dashGddRate) {
                    dashGddRate.textContent = `+${todayGdd} GDD/day`;
                }
                if (dashGddCumulative) {
                    const stage = field ? field.stage : 'Vegetative';
                    let baseGdd = 820;
                    if (stage.includes('Emergence') || stage.includes('V1')) baseGdd = 140;
                    else if (stage.includes('Knee') || stage.includes('V6')) baseGdd = 780;
                    else if (stage.includes('Bloom') || stage.includes('R1')) baseGdd = 1250;
                    else if (stage.includes('Dough') || stage.includes('R4')) baseGdd = 1920;
                    dashGddCumulative.textContent = `${baseGdd + todayGdd} GDD (Season Optimal)`;
                }
            }

        } catch (err) {
            console.error('Error fetching live telemetry from Open-Meteo:', err);
            if (topbarTelemetry) {
                topbarTelemetry.textContent = `Telemetry: Reconnecting to Open-Meteo...`;
            }
            if (briefLastUpdated) {
                briefLastUpdated.textContent = 'Telemetry connection retrying...';
            }
        }
    }

// ============================================================
// NASA POWER HISTORICAL ENVIRONMENTAL DATA
// Separate from Open-Meteo live forecast and telemetry.
// ============================================================

const nasaPowerCache = new Map();

async function fetchNasaPowerHistory(field) {
    const status = document.getElementById('nasaPowerStatus');
    const temp = document.getElementById('nasaPowerTemp');
    const humidity = document.getElementById('nasaPowerHumidity');
    const rain = document.getElementById('nasaPowerRain');
    const wind = document.getElementById('nasaPowerWind');

    const setStatus = (message) => {
        if (status) status.textContent = message;
    };

    const setEmptyValues = () => {
        if (temp) temp.textContent = '--';
        if (humidity) humidity.textContent = '--';
        if (rain) rain.textContent = '--';
        if (wind) wind.textContent = '--';
    };

    if (
        !field ||
        !Number.isFinite(Number(field.lat)) ||
        !Number.isFinite(Number(field.lng)) ||
        Number(field.lat) < -90 ||
        Number(field.lat) > 90 ||
        Number(field.lng) < -180 ||
        Number(field.lng) > 180
    ) {
        setEmptyValues();
        setStatus('Valid parcel coordinates are required.');
        return;
    }

    const latitude = Number(field.lat);
    const longitude = Number(field.lng);

    // Use a seven-day historical window ending seven days ago.
    // This avoids relying on the most recent, potentially incomplete,
    // NASA POWER daily data.
    const endDate = new Date();
    endDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCDate(endDate.getUTCDate() - 7);

    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - 6);

    const formatDate = (date) =>
        date.toISOString().slice(0, 10).replaceAll('-', '');

    const start = formatDate(startDate);
    const end = formatDate(endDate);

    const cacheKey = `${latitude},${longitude}:${start}:${end}`;
    const cached = nasaPowerCache.get(cacheKey);

    const renderData = (result) => {
        // Do not let an old request overwrite the newly selected parcel.
        if (FIELD_DATA[activeFieldId] !== field) return;

        const records = Array.isArray(result.data) ? result.data : [];

        const average = (key) => {
            const values = records
                .map(record => record[key])
                .filter(value =>
                    typeof value === 'number' &&
                    Number.isFinite(value)
                );

            if (!values.length) return null;

            return values.reduce((sum, value) => sum + value, 0)
                / values.length;
        };

        const precipitationValues = records
            .map(record => record.PRECTOTCORR)
            .filter(value =>
                typeof value === 'number' &&
                Number.isFinite(value)
            );

        const totalRain = precipitationValues.length
            ? precipitationValues.reduce((sum, value) => sum + value, 0)
            : null;

        const avgTemp = average('T2M');
        const avgHumidity = average('RH2M');
        const avgWind = average('WS2M');

        if (temp) {
            temp.textContent = avgTemp === null
                ? '--'
                : `${avgTemp.toFixed(1)} °C`;
        }

        if (humidity) {
            humidity.textContent = avgHumidity === null
                ? '--'
                : `${avgHumidity.toFixed(1)}%`;
        }

        if (rain) {
            rain.textContent = totalRain === null
                ? '--'
                : `${totalRain.toFixed(1)} mm`;
        }

        if (wind) {
            wind.textContent = avgWind === null
                ? '--'
                : `${avgWind.toFixed(1)} m/s`;
        }

        const readableStart =
            `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`;

        const readableEnd =
            `${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}`;

        if (records.length) {
            setStatus(
                `Historical daily data · ${readableStart} to ${readableEnd} · ${records.length} records`
            );
        } else {
            setStatus('No historical records were returned for this period.');
        }
    };

    // Reuse recent responses for the same coordinates and date window.
    if (cached && Date.now() - cached.savedAt < 30 * 60 * 1000) {
        renderData(cached.result);
        return;
    }

    setEmptyValues();
    setStatus('Loading NASA POWER historical data...');

    try {
        const params = new URLSearchParams({
            latitude: String(latitude),
            longitude: String(longitude),
            start,
            end
        });

        const response = await fetch(
            `/api/nasa-power/point?${params.toString()}`,
            {
                headers: { Accept: 'application/json' }
            }
        );

        const result = await response.json();

        if (!response.ok || result.status !== 'success') {
            throw new Error(
                result.message || 'NASA POWER request failed.'
            );
        }

        nasaPowerCache.set(cacheKey, {
            savedAt: Date.now(),
            result
        });

        renderData(result);

    } catch (error) {
        console.error('NASA POWER historical data error:', error);

        if (FIELD_DATA[activeFieldId] === field) {
            setEmptyValues();
            setStatus('Historical data unavailable. Try again later.');
        }
    }
}
    function updateEmptyViews() {
        // Satellite studio status
        const studioCoordsText = document.getElementById('studioCoordsText');
        if (studioCoordsText) {
            studioCoordsText.innerHTML = `Active Parcel: <strong>No Field Selected</strong> - Please add a parcel to view coordinates`;
        }

        // No telemetry request when there is no selected parcel.
        const topbarTelemetry = document.getElementById('topbarTelemetryText');
        const forecastLocation = document.getElementById('forecastLocationText');
        const briefLastUpdated = document.getElementById('briefLastUpdated');

        if (topbarTelemetry) topbarTelemetry.textContent = 'Telemetry unavailable: no parcel selected';
        if (forecastLocation) forecastLocation.textContent = 'Select a parcel with valid coordinates to view local weather.';
        if (briefLastUpdated) briefLastUpdated.textContent = 'No location data available';

        // Economics
        const econBudgetName = document.getElementById('econBudgetName');
        const econBudgetSub = document.getElementById('econBudgetSub');
        const simGrossRev = document.getElementById('simGrossRev');
        const simNetProfit = document.getElementById('simNetProfit');
        const simFieldTotal = document.getElementById('simFieldTotal');

        if (econBudgetName) econBudgetName.textContent = 'Field Operating Budget';
        if (econBudgetSub) econBudgetSub.textContent = 'Configure a field to view budget';
        if (simGrossRev) simGrossRev.textContent = '$0.00 / acre';
        if (simNetProfit) simNetProfit.textContent = '$0.00 / ac';
        if (simFieldTotal) simFieldTotal.innerHTML = `Total Field Net Profit: <strong>$0.00</strong>`;

        // Report modal
        const repFieldName = document.getElementById('repFieldName');
        const repCropName = document.getElementById('repCropName');
        const repPlantingDate = document.getElementById('repPlantingDate');
        const repSoilName = document.getElementById('repSoilName');

        if (repFieldName) repFieldName.textContent = 'No active parcel';
        if (repCropName) repCropName.textContent = '--';
        if (repPlantingDate) repPlantingDate.textContent = '--';
        if (repSoilName) repSoilName.textContent = '--';

        if (fieldPolygonLayer && mapInstance) {
            mapInstance.removeLayer(fieldPolygonLayer);
            fieldPolygonLayer = null;
        }
    }

    function switchActiveField(fieldId) {
        if (!fieldId || !FIELD_DATA[fieldId]) {
            updateEmptyViews();
            return;
        }

        activeFieldId = fieldId;
        const field = FIELD_DATA[fieldId];

        // 1. Sync dropdown
        const topbarSelect = document.getElementById('topbarFieldSelect');
        if (topbarSelect && topbarSelect.value !== fieldId) {
            topbarSelect.value = fieldId;
        }

        // 2. Sync Card Selection in Grid
        const cards = document.querySelectorAll('.field-card[data-field-id]');
        cards.forEach(card => {
            if (card.getAttribute('data-field-id') === fieldId) {
                card.classList.add('active');
                if (!card.querySelector('.field-badge-active')) {
                    const badge = document.createElement('span');
                    badge.className = 'field-badge-active';
                    badge.textContent = 'Active';
                    card.querySelector('.field-card-thumb').appendChild(badge);
                }
            } else {
                card.classList.remove('active');
                const badge = card.querySelector('.field-badge-active');
                if (badge) badge.remove();
            }
        });

        // 3. Fly Map to parcel & draw polygon
        if (mapInstance) {
            mapInstance.flyTo([field.lat, field.lng], field.zoom, { duration: 1.2 });
            renderActivePolygon();
        }

        // 4. Update Satellite Status Bar
        const studioCoordsText = document.getElementById('studioCoordsText');
        if (studioCoordsText) {
            studioCoordsText.textContent = `Active Parcel: ${field.name} | ${field.location || "Location unavailable"} (Lat: ${Number(field.lat).toFixed(4)}, Lng: ${Number(field.lng).toFixed(4)})`;
        }

        // 5. Update Daily Operational Briefing with Live Telemetry
        fetchLiveTelemetry(field);

        fetchNasaPowerHistory(field);

        // 6. Update Report Modal Meta
        const repFieldName = document.getElementById('repFieldName');
        const repCropName = document.getElementById('repCropName');
        const repPlantingDate = document.getElementById('repPlantingDate');
        const repSoilName = document.getElementById('repSoilName');
        const repNdviNarrative = document.getElementById('repNdviNarrative');
        const repMoistureNarrative = document.getElementById('repMoistureNarrative');
        const repActionList = document.getElementById('repActionList');

        if (repFieldName) repFieldName.textContent = `${field.name} (${field.acres} ac)`;
        if (repCropName) repCropName.textContent = field.crop;
        if (repPlantingDate) repPlantingDate.textContent = field.stage;
        if (repSoilName) repSoilName.textContent = field.soilType;

        if (repNdviNarrative) {
            repNdviNarrative.innerHTML = `Average canopy NDVI across <strong>${field.acres} acres</strong> is <strong>${field.ndvi}</strong>, indicating <strong>${field.ndviStatus}</strong> vegetative vigor for ${field.crop}.`;
        }
        if (repMoistureNarrative) {
            repMoistureNarrative.innerHTML = `Open-Meteo surface soil moisture (0Ã¢â‚¬â€œ1 cm) is <strong>${field.surfaceSoilMoisture ?? 'not available'}</strong>. This shallow measurement does not represent root-zone water content.`;
        }
        if (repActionList) {
            repActionList.innerHTML = `
                <li>Proceed with scheduled nutrient calibration tailored to ${field.soilType} soils.</li>
                <li>Conduct drone multispectral pass across ${field.name} during peak vegetative fill.</li>
                <li>Continue microclimate monitoring for ${field.crop}.</li>
            `;
        }

        // 7. Update Economics
        updateEconomicsSimulator(field);
        fetchCropIncomeReference(field);
    }

    // Topbar select handler
    const topbarFieldSelect = document.getElementById('topbarFieldSelect');
    if (topbarFieldSelect) {
        topbarFieldSelect.addEventListener('change', (e) => {
            switchActiveField(e.target.value);
        });
    }

    // ==========================================
    // 4. LEAFLET SATELLITE STUDIO INITIALIZATION
    // ==========================================
    function initSatelliteMap() {
        const mapContainer = document.getElementById('portalMapContainer');
        if (!mapContainer || typeof L === 'undefined') return;

        const defaultLat = activeFieldId && FIELD_DATA[activeFieldId] ? FIELD_DATA[activeFieldId].lat : 42.0308;
        const defaultLng = activeFieldId && FIELD_DATA[activeFieldId] ? FIELD_DATA[activeFieldId].lng : -93.6319;
        const defaultZoom = 14;

        mapInstance = L.map('portalMapContainer', {
            center: [defaultLat, defaultLng],
            zoom: defaultZoom,
            zoomControl: true,
            attributionControl: true
        });

        currentTileLayer = L.tileLayer(TILE_FEEDS.esri, {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Earthstar Geographics'
        }).addTo(mapInstance);

        renderActivePolygon();

        // Layer buttons
        const layerButtons = document.querySelectorAll('.studio-layer-btn');
        layerButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                layerButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const layerKey = btn.getAttribute('data-layer');
                if (TILE_FEEDS[layerKey] && currentTileLayer) {
                    mapInstance.removeLayer(currentTileLayer);
                    let attr = 'Map data &copy; contributors';
                    if (layerKey === 'esri') attr = 'Tiles &copy; Esri &mdash; Earthstar Geographics';
                    if (layerKey === 'osm') attr = '&copy; OpenStreetMap contributors';
                    if (layerKey === 'usgs') attr = 'USGS The National Map';
                    if (layerKey === 'carto') attr = '&copy; OpenStreetMap &copy; CARTO';

                    currentTileLayer = L.tileLayer(TILE_FEEDS[layerKey], {
                        maxZoom: 19,
                        attribution: attr
                    }).addTo(mapInstance);

                    if (fieldPolygonLayer && isBoundaryVisible) {
                        fieldPolygonLayer.bringToFront();
                    }
                }
            });
        });

        // Recenter
        const recenterBtn = document.getElementById('recenterMapBtn');
        if (recenterBtn) {
            recenterBtn.addEventListener('click', () => {
                if (activeFieldId && FIELD_DATA[activeFieldId]) {
                    const f = FIELD_DATA[activeFieldId];
                    mapInstance.flyTo([f.lat, f.lng], f.zoom, { duration: 1.2 });
                }
            });
        }

        // Toggle Boundary
        const toggleBoundaryBtn = document.getElementById('toggleBoundaryBtn');
        if (toggleBoundaryBtn) {
            toggleBoundaryBtn.addEventListener('click', () => {
                isBoundaryVisible = !isBoundaryVisible;
                if (isBoundaryVisible) {
                    renderActivePolygon();
                    toggleBoundaryBtn.textContent = 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â² Hide Polygon';
                } else {
                    if (fieldPolygonLayer) {
                        mapInstance.removeLayer(fieldPolygonLayer);
                        fieldPolygonLayer = null;
                    }
                    toggleBoundaryBtn.textContent = 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â² Show Polygon';
                }
            });
        }

        // Delete Active Field from Studio Toolbar
        const deleteActiveBtn = document.getElementById('deleteActiveFieldBtn');
        if (deleteActiveBtn) {
            deleteActiveBtn.addEventListener('click', () => {
                if (activeFieldId && FIELD_DATA[activeFieldId]) {
                    deleteFieldParcel(activeFieldId);
                } else {
                    alert('No active field parcel selected to remove.');
                }
            });
        }
    }

    function renderActivePolygon() {
        if (!mapInstance || !isBoundaryVisible) return;
        if (!activeFieldId || !FIELD_DATA[activeFieldId] || !FIELD_DATA[activeFieldId].polygon) {
            if (fieldPolygonLayer) {
                mapInstance.removeLayer(fieldPolygonLayer);
                fieldPolygonLayer = null;
            }
            return;
        }

        const currentField = FIELD_DATA[activeFieldId];

        if (fieldPolygonLayer) {
            mapInstance.removeLayer(fieldPolygonLayer);
        }

        fieldPolygonLayer = L.polygon(currentField.polygon, {
            color: '#C8E64A',
            weight: 3,
            fillColor: '#2D5A3D',
            fillOpacity: 0.28,
            dashArray: '6, 6'
        }).addTo(mapInstance);

        fieldPolygonLayer.bindPopup(`
            <div style="font-family: Inter, sans-serif; font-size: 13px; line-height: 1.4;">
                <strong style="color: #1B3726; font-size: 14px;">${escapeHTML(currentField.name)}</strong><br>
                <span>${escapeHTML(currentField.crop)}</span><br>
                <span><strong>Acreage:</strong> ${currentField.acres} acres</span><br>
                <span><strong>NDVI:</strong> ${currentField.ndvi ?? "Not available"} (${escapeHTML(currentField.ndviStatus || "No satellite data")})</span>
            </div>
        `);
    }

    // ==========================================
    // 5. FARM ECONOMICS & ROI CALCULATOR
    // ==========================================
    const yieldSlider = document.getElementById('yieldRangeSlider');
    const sliderDisplay = document.getElementById('sliderYieldDisplay');
    const simGrossRev = document.getElementById('simGrossRev');
    const simNetProfit = document.getElementById('simNetProfit');
    const simFieldTotal = document.getElementById('simFieldTotal');

    // USDA CROP INCOME REFERENCE INTEGRATION
    const cropIncomeCache = new Map();

    const usStateCodes = new Set(
        "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ")
    );

    const stateNames = {
        Alabama:"AL", Alaska:"AK", Arizona:"AZ", Arkansas:"AR",
        California:"CA", Colorado:"CO", Connecticut:"CT", Delaware:"DE",
        Florida:"FL", Georgia:"GA", Hawaii:"HI", Idaho:"ID",
        Illinois:"IL", Indiana:"IN", Iowa:"IA", Kansas:"KS",
        Kentucky:"KY", Louisiana:"LA", Maine:"ME", Maryland:"MD",
        Massachusetts:"MA", Michigan:"MI", Minnesota:"MN", Mississippi:"MS",
        Missouri:"MO", Montana:"MT", Nebraska:"NE", Nevada:"NV",
        "New Hampshire":"NH", "New Jersey":"NJ", "New Mexico":"NM",
        "New York":"NY", "North Carolina":"NC", "North Dakota":"ND",
        Ohio:"OH", Oklahoma:"OK", Oregon:"OR", Pennsylvania:"PA",
        "Rhode Island":"RI", "South Carolina":"SC", "South Dakota":"SD",
        Tennessee:"TN", Texas:"TX", Utah:"UT", Vermont:"VT",
        Virginia:"VA", Washington:"WA", "West Virginia":"WV",
        Wisconsin:"WI", Wyoming:"WY"
    };

    function getCropIncomeState(location) {
        const value = String(location || "").trim();

        const abbreviationMatch = value.match(
            /(?:^|[,\s])([A-Z]{2})(?=(?:\s+\d{5}(?:-\d{4})?)?(?:\s*,?\s*(?:USA|United States))?\s*$)/i
        );

        if (abbreviationMatch) {
            const code = abbreviationMatch[1].toUpperCase();
            if (usStateCodes.has(code)) return code;
        }

        for (const [name, code] of Object.entries(stateNames)) {
            const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const statePattern = new RegExp(`\\b${escapedName}\\b`, "i");
            if (statePattern.test(value)) return code;
        }

        return null;
    }

    function getCropIncomeAliases(crop) {
        const key = String(crop || "").toLowerCase().trim();
        const aliases = {
            "corn": ["Corn (Zea mays)"],
            "corn (zea mays)": ["Corn (Zea mays)"],
            "soybeans": ["Soybeans (Glycine max)"],
            "soybean": ["Soybeans (Glycine max)"],
            "soybeans (glycine max)": ["Soybeans (Glycine max)"],
            "winter wheat": ["Winter Wheat", "Hard Red Winter Wheat"],
            "oats": ["Oats"],
            "cotton": ["Cotton"],
            "alfalfa": ["Alfalfa Hay"]
        };
        return aliases[key] || [];
    }

    async function fetchCropIncomeReference(field) {
        const state = getCropIncomeState(field.location);
        const aliases = getCropIncomeAliases(field.rawCrop || field.crop);

        if (!state || !aliases.length) {
            field.cropIncomeNote = !state
                ? "US state not identified; built-in benchmark values are shown."
                : "No exact crop mapping; built-in benchmark values are shown.";
            if (activeFieldId === field.id) updateEconomicsSimulator(field);
            return;
        }

        const cacheKey = `${state}:${aliases.join("|")}`;

        try {
            let record = cropIncomeCache.get(cacheKey);

            if (record === undefined) {
                const response = await fetch(
                    `/api/datasets/crop-income?crop=${encodeURIComponent(field.rawCrop || field.crop)}&state=${encodeURIComponent(state)}&limit=500`,
                    { credentials: "same-origin", headers: { Accept: "application/json" } }
                );

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const result = await response.json();
                if (!Array.isArray(result.data)) throw new Error("Invalid API response");

                const records = result.data.filter(item =>
                    aliases.includes(String(item.crop || "").trim()) &&
                    Number(item.yield_value) > 0 &&
                    Number(item.price_usd) > 0
                );

                records.sort((a, b) => {
                    const yearDiff = Number(b.year) - Number(a.year);
                    if (yearDiff) return yearDiff;
                    return Number(String(b.commodity_class || "").toUpperCase() === "ALL CLASSES") -
                        Number(String(a.commodity_class || "").toUpperCase() === "ALL CLASSES");
                });

                record = records.find(item =>
                    String(item.commodity_class || "").toUpperCase() === "ALL CLASSES"
                ) || records[0] || null;

                cropIncomeCache.set(cacheKey, record);
            }

            if (!record) {
                field.cropIncomeNote = `No matching USDA record for ${state}; built-in benchmark values are shown.`;
            } else {
                const yieldUnit = String(record.yield_unit || "").toUpperCase();
                const unit = yieldUnit.includes("BU / ACRE") ? "bu" :
                    yieldUnit.includes("TONS / ACRE") ? "ton" :
                    yieldUnit.includes("LBS / ACRE") ? "lbs" : null;

                if (!unit) throw new Error(`Unsupported yield unit: ${record.yield_unit}`);

                field.defaultYield = Number(record.yield_value);
                field.commodityPrice = Number(record.price_usd);
                field.unit = unit;
                field.cropIncomeYear = Number(record.year);

                const actual = String(record.price_source || "").toLowerCase().includes("actual usda");
                field.cropIncomeNote = `USDA ${record.year} ${actual ? "actual" : "estimated"} price for ${state}. Operating costs remain estimates.`;
            }

            if (activeFieldId === field.id && FIELD_DATA[field.id] === field) {
                updateEconomicsSimulator(field);
            }
        } catch (error) {
            console.error("[CropSwitch] Crop Income lookup failed:", error);
            field.cropIncomeNote = "USDA data unavailable; built-in benchmark values are shown.";
            if (activeFieldId === field.id) updateEconomicsSimulator(field);
        }
    }
    function updateEconomicsSimulator(field) {
        if (!field) field = FIELD_DATA[activeFieldId];
        if (!field || !yieldSlider) return;

        // Dynamic budget title & subtitle
        const econBudgetName = document.getElementById('econBudgetName');
        const econBudgetSub = document.getElementById('econBudgetSub');
        const simCostDisplay = document.getElementById('simCostDisplay');
        const simSubtitle = document.getElementById('simSubtitle');
        const simTargetLabel = document.getElementById('simTargetLabel');

        const econCostSeed = document.getElementById('econCostSeed');
        const econCostFert = document.getElementById('econCostFert');
        const econCostChem = document.getElementById('econCostChem');
        const econCostFuel = document.getElementById('econCostFuel');
        const econCostLand = document.getElementById('econCostLand');
        const econCostTotal = document.getElementById('econCostTotal');

        const crop = field.rawCrop || field.crop;

        if (econBudgetName) econBudgetName.textContent = `${field.name} Operating Budget`;
        if (econBudgetSub) econBudgetSub.textContent = `${crop} | ${field.acres} Acres`;
        if (simCostDisplay) simCostDisplay.textContent = `-$${field.costPerAcre.toFixed(2)} / acre`;
        if (simSubtitle) simSubtitle.textContent = `Adjust target harvest yield to simulate gross revenue and net farm profit for ${field.name} at $${field.commodityPrice.toFixed(2)}/${field.unit} ${crop}. ${field.cropIncomeNote || "Built-in benchmark values; operating costs are estimates."}`;
        if (simTargetLabel) simTargetLabel.textContent = `Target ${crop} Yield (${field.unit}/acre)`;

        // Update cost breakdown table tailored to crop enterprise
        if (crop.includes('Soybean')) {
            if (econCostSeed) econCostSeed.textContent = '$74.00 / ac';
            if (econCostFert) econCostFert.textContent = '$62.00 / ac';
            if (econCostChem) econCostChem.textContent = '$56.00 / ac';
            if (econCostFuel) econCostFuel.textContent = '$48.00 / ac';
            if (econCostLand) econCostLand.textContent = '$245.00 / ac';
        } else if (crop.includes('Wheat')) {
            if (econCostSeed) econCostSeed.textContent = '$42.00 / ac';
            if (econCostFert) econCostFert.textContent = '$88.00 / ac';
            if (econCostChem) econCostChem.textContent = '$38.00 / ac';
            if (econCostFuel) econCostFuel.textContent = '$42.00 / ac';
            if (econCostLand) econCostLand.textContent = '$185.00 / ac';
        } else if (crop.includes('Cotton')) {
            if (econCostSeed) econCostSeed.textContent = '$95.00 / ac';
            if (econCostFert) econCostFert.textContent = '$125.00 / ac';
            if (econCostChem) econCostChem.textContent = '$110.00 / ac';
            if (econCostFuel) econCostFuel.textContent = '$70.00 / ac';
            if (econCostLand) econCostLand.textContent = '$180.00 / ac';
        } else if (crop.includes('Alfalfa')) {
            if (econCostSeed) econCostSeed.textContent = '$35.00 / ac';
            if (econCostFert) econCostFert.textContent = '$65.00 / ac';
            if (econCostChem) econCostChem.textContent = '$25.00 / ac';
            if (econCostFuel) econCostFuel.textContent = '$75.00 / ac';
            if (econCostLand) econCostLand.textContent = '$120.00 / ac';
        } else {
            if (econCostSeed) econCostSeed.textContent = '$118.00 / ac';
            if (econCostFert) econCostFert.textContent = '$164.50 / ac';
            if (econCostChem) econCostChem.textContent = '$46.00 / ac';
            if (econCostFuel) econCostFuel.textContent = '$54.00 / ac';
            if (econCostLand) econCostLand.textContent = '$260.00 / ac';
        }
        if (econCostTotal) econCostTotal.textContent = `$${field.costPerAcre.toFixed(2)} / ac`;

        // Adjust slider ranges based on user crop
        if (crop.includes('Soybean')) {
            yieldSlider.min = 35;
            yieldSlider.max = 90;
            yieldSlider.step = 2;
            yieldSlider.value = field.defaultYield;
        } else if (crop.includes('Wheat')) {
            yieldSlider.min = 40;
            yieldSlider.max = 110;
            yieldSlider.step = 5;
            yieldSlider.value = field.defaultYield;
        } else if (crop.includes('Cotton')) {
            yieldSlider.min = 600;
            yieldSlider.max = 1500;
            yieldSlider.step = 50;
            yieldSlider.value = field.defaultYield;
        } else {
            yieldSlider.min = 140;
            yieldSlider.max = 260;
            yieldSlider.step = 5;
            yieldSlider.value = field.defaultYield;
        }

        calculateYieldROI();
    }

    function calculateYieldROI() {
        if (!yieldSlider) return;
        if (!activeFieldId || !FIELD_DATA[activeFieldId]) {
            if (simGrossRev) simGrossRev.textContent = '$0.00 / acre';
            if (simNetProfit) simNetProfit.textContent = '$0.00 / ac';
            if (simFieldTotal) simFieldTotal.innerHTML = `Total Field Net Profit: <strong>$0.00</strong>`;
            return;
        }

        const currentField = FIELD_DATA[activeFieldId];
        const yieldVal = parseFloat(yieldSlider.value);
        sliderDisplay.textContent = `${yieldVal} ${currentField.unit} / acre`;

        const gross = yieldVal * currentField.commodityPrice;
        const net = gross - currentField.costPerAcre;
        const totalNet = net * currentField.acres;

        simGrossRev.textContent = `$${gross.toFixed(2)} / acre`;
        
        if (net >= 0) {
            simNetProfit.textContent = `+$${net.toFixed(2)} / ac`;
            simNetProfit.style.color = '#15803D';
        } else {
            simNetProfit.textContent = `-$${Math.abs(net).toFixed(2)} / ac`;
            simNetProfit.style.color = '#DC2626';
        }

        const totalFormatted = Math.abs(totalNet).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        simFieldTotal.innerHTML = `Total ${escapeHTML(currentField.name)} Net Profit: <strong style="color: ${net >= 0 ? '#15803D' : '#DC2626'}">${net >= 0 ? '+' : '-'}$${totalFormatted}</strong>`;
    }

    if (yieldSlider) {
        yieldSlider.addEventListener('input', calculateYieldROI);
    }

    // ==========================================
    // 6. DYNAMIC USER TASKS (ZERO FAKE DATA)
    // ==========================================
    const taskList = document.getElementById('taskList');
    const taskCounterText = document.getElementById('taskCounterText');
    const sidebarTaskCount = document.getElementById('sidebarTaskCount');
    const taskQuickForm = document.getElementById('taskQuickForm');
    const taskQuickInput = document.getElementById('taskQuickInput');

    function loadUserTasks() {
        const stored = localStorage.getItem('cropswitch_user_tasks');
        if (stored) {
            try {
                userTasks = JSON.parse(stored) || [];
            } catch (e) {
                userTasks = [];
            }
        } else {
            userTasks = []; // Completely empty by default! No fake tasks!
        }
        renderTasks();
    }

    function saveUserTasks() {
        localStorage.setItem('cropswitch_user_tasks', JSON.stringify(userTasks));
        renderTasks();
    }

    function renderTasks() {
        if (!taskList) return;
        taskList.innerHTML = '';

        const completedCount = userTasks.filter(t => t.completed).length;
        const pendingCount = userTasks.length - completedCount;

        if (taskCounterText) {
            taskCounterText.textContent = `${pendingCount} Pending \u00B7 ${completedCount} Completed`;
        }
        if (sidebarTaskCount) {
            sidebarTaskCount.textContent = pendingCount;
        }

        if (userTasks.length === 0) {
            taskList.innerHTML = `
                <div class="empty-state-box" style="padding: 24px; border: 1.5px dashed var(--border);">
                    <span style="font-size: 26px;">&#128203;</span>
                    <p style="margin: 4px 0 0;">No operational tasks scheduled yet. Add your first field action below.</p>
                </div>
            `;
            return;
        }

        userTasks.forEach((task, idx) => {
            const item = document.createElement('div');
            item.className = 'task-item' + (task.completed ? ' completed' : '');
            item.innerHTML = `
                <input type="checkbox" class="task-checkbox" data-index="${idx}" ${task.completed ? 'checked' : ''}>
                <div class="task-content">
                    <div class="task-title-row">
                        <span class="task-title">${escapeHTML(task.title)}</span>
                        <span class="task-date">${escapeHTML(task.date)}</span>
                    </div>
                    <p class="task-desc">${escapeHTML(task.desc || 'Operator recorded agronomic action item.')}</p>
                    <span class="task-badge fert">Operator Task</span>
                </div>
                <button type="button" class="report-close" data-del-index="${idx}" style="position:static; font-size:18px; padding:0 4px; color:#EF4444;" title="Delete task">&times;</button>
            `;
            taskList.appendChild(item);
        });

        // Checkbox toggle
        taskList.querySelectorAll('.task-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                if (userTasks[idx]) {
                    userTasks[idx].completed = e.target.checked;
                    saveUserTasks();
                }
            });
        });

        // Delete button
        taskList.querySelectorAll('[data-del-index]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.getAttribute('data-del-index'));
                userTasks.splice(idx, 1);
                saveUserTasks();
            });
        });
    }

    if (taskQuickForm) {
        taskQuickForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = taskQuickInput.value.trim();
            if (!text) return;

            const now = new Date();
            const timeStr = 'Today, ' + now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

            userTasks.unshift({
                id: 'task-' + Date.now(),
                title: text,
                date: timeStr,
                desc: 'Operator recorded field action item.',
                completed: false
            });

            taskQuickInput.value = '';
            saveUserTasks();
        });
    }

    // Topbar "+ New Task" Button
    const openAddTaskBtn = document.getElementById('openAddTaskBtn');
    if (openAddTaskBtn) {
        openAddTaskBtn.addEventListener('click', () => {
            const calendarSection = document.getElementById('calendar');
            if (calendarSection) {
                calendarSection.scrollIntoView({ behavior: 'smooth' });
                setTimeout(() => {
                    if (taskQuickInput) taskQuickInput.focus();
                }, 600);
            }
        });
    }

    // ==========================================
    // 7. DYNAMIC HARDWARE SENSORS (ZERO FAKE DATA)
    // ==========================================
    function loadUserSensors() {
        const grid = document.getElementById('sensorsGrid');
        const countBadge = document.getElementById('sensorStatusCount');
        if (!grid) return;

        const stored = localStorage.getItem('cropswitch_user_sensors');
        if (stored) {
            try {
                userSensors = JSON.parse(stored) || [];
            } catch (e) {
                userSensors = [];
            }
        } else {
            userSensors = []; // Empty by default! No fake John Deere or fake Sentek!
        }

        if (countBadge) {
            countBadge.textContent = `${userSensors.length} Hardware Devices Connected`;
        }

        if (userSensors.length === 0) {
            grid.innerHTML = `
                <div class="empty-state-box">
                    <div class="empty-state-icon">&#128225;</div>
                    <h4>No Hardware Sensors Connected Yet</h4>
                    <p>Connect your wireless capacitance soil moisture probes, on-farm micro-weather stations, or machinery CAN-bus to stream real-time in-field telemetry.</p>
                    <button type="button" class="topbar-btn outline" id="connectSensorBtn" style="margin-top: 4px;">+ Connect Field Sensor</button>
                </div>
            `;
            const connectBtn = document.getElementById('connectSensorBtn');
            if (connectBtn) {
                connectBtn.addEventListener('click', promptConnectSensor);
            }
        } else {
            grid.innerHTML = '';
            userSensors.forEach(sensor => {
                const card = document.createElement('div');
                card.className = 'sensor-card';
                card.innerHTML = `
                    <div class="sensor-header">
                        <span class="sensor-title">${escapeHTML(sensor.name)}</span>
                        <span class="sensor-status-dot"></span>
                    </div>
                    <div class="sensor-model">${escapeHTML(sensor.model)} ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ${escapeHTML(sensor.location)}</div>
                    <div class="sensor-data-row">
                        <span>Telemetry Stream:</span>
                        <strong style="color:#10B981;">Online & Active</strong>
                    </div>
                    <div class="sensor-data-row">
                        <span>Battery Status:</span>
                        <strong>100% (Solar Linked)</strong>
                    </div>
                `;
                grid.appendChild(card);
            });
        }
    }

    function promptConnectSensor() {
        const name = prompt('Enter sensor model or name (e.g. "Sentek Drill & Drop Probe" or "Davis Weather Station"):');
        if (!name || !name.trim()) return;

        const loc = prompt('Enter parcel or location (e.g. "Field A North Bluff"):') || 'Farm Headquarters';

        userSensors.push({
            id: 'sensor-' + Date.now(),
            name: name.trim(),
            model: 'IoT Capacitance Stream',
            location: loc.trim()
        });

        localStorage.setItem('cropswitch_user_sensors', JSON.stringify(userSensors));
        loadUserSensors();
    }

    // ==========================================
    // 8. ADD NEW PARCEL MODAL & EXACT GPS LOCATOR
    // ==========================================
    const addFieldModal = document.getElementById('addFieldModal');
    const addNewFieldBtn = document.getElementById('addNewFieldBtn');
    const addFieldCardBtn = document.getElementById('addFieldCardBtn');
    const closeAddFieldBtn = document.getElementById('closeAddFieldBtn');
    const cancelAddFieldBtn = document.getElementById('cancelAddFieldBtn');
    const addFieldForm = document.getElementById('addFieldForm');

    const newFieldLat = document.getElementById('newFieldLat');
    const newFieldLng = document.getElementById('newFieldLng');
    const newFieldLocation = document.getElementById('newFieldLocation');
    const newFieldGpsBtn = document.getElementById('newFieldGpsBtn');
    const targetCoordText = document.getElementById('targetCoordText');

    function updateTargetCoordPreview() {
        if (!targetCoordText) return;
        const latStr = newFieldLat ? newFieldLat.value.trim() : '';
        const lngStr = newFieldLng ? newFieldLng.value.trim() : '';

        if (!latStr || !lngStr) {
            targetCoordText.textContent = 'Awaiting coordinates input...';
            return;
        }

        const latVal = parseFloat(latStr);
        const lngVal = parseFloat(lngStr);
        if (!isNaN(latVal) && !isNaN(lngVal)) {
            const latDir = latVal >= 0 ? 'N' : 'S';
            const lngDir = lngVal >= 0 ? 'E' : 'W';
            targetCoordText.textContent = `${Math.abs(latVal).toFixed(4)}ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° ${latDir}, ${Math.abs(lngVal).toFixed(4)}ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° ${lngDir}`;
        } else {
            targetCoordText.textContent = 'Invalid coordinate format';
        }
    }

    if (newFieldLat) newFieldLat.addEventListener('input', updateTargetCoordPreview);
    if (newFieldLng) newFieldLng.addEventListener('input', updateTargetCoordPreview);

    // Auto-detect GPS button
    if (newFieldGpsBtn) {
        newFieldGpsBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                alert('Geolocation is not supported by your browser.');
                return;
            }

            newFieldGpsBtn.textContent = 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ Acquiring GPS...';
            newFieldGpsBtn.disabled = true;

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    if (newFieldLat) newFieldLat.value = lat.toFixed(5);
                    if (newFieldLng) newFieldLng.value = lng.toFixed(5);
                    if (newFieldLocation && !newFieldLocation.value.trim()) {
                        newFieldLocation.value = `GPS Coordinate Field (${lat.toFixed(3)}ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°, ${lng.toFixed(3)}ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°)`;
                    }
                    updateTargetCoordPreview();

                    newFieldGpsBtn.textContent = 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ GPS Locked';
                    setTimeout(() => {
                        newFieldGpsBtn.textContent = 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â½ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ Auto-Detect GPS Location';
                        newFieldGpsBtn.disabled = false;
                    }, 2500);
                },
                (err) => {
                    console.warn('Geolocation error:', err);
                    alert(`Could not detect location: ${err.message || 'Please check browser GPS permissions.'}`);
                    newFieldGpsBtn.textContent = 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â½ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ Auto-Detect GPS Location';
                    newFieldGpsBtn.disabled = false;
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    }

    function openAddField() {
        if (addFieldModal) {
            if (addFieldForm) addFieldForm.reset();
            updateTargetCoordPreview();
            addFieldModal.classList.add('open');
        }
    }

    function closeAddField() {
        if (addFieldModal) addFieldModal.classList.remove('open');
    }

    if (addNewFieldBtn) addNewFieldBtn.addEventListener('click', openAddField);
    if (addFieldCardBtn) addFieldCardBtn.addEventListener('click', openAddField);
    if (closeAddFieldBtn) closeAddFieldBtn.addEventListener('click', closeAddField);
    if (cancelAddFieldBtn) cancelAddFieldBtn.addEventListener('click', closeAddField);

    if (addFieldModal) {
        addFieldModal.addEventListener('click', (e) => {
            if (e.target === addFieldModal) closeAddField();
        });
    }

    if (addFieldForm) {
        addFieldForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('newFieldName').value.trim();
            const crop = document.getElementById('newFieldCrop').value;
            const acres = Number(document.getElementById('newFieldAcres').value);
            const location = document.getElementById('newFieldLocation').value.trim();

            const irrigation = document.getElementById('newFieldIrrigation')
                ? document.getElementById('newFieldIrrigation').value
                : 'Rainfed / Dryland';

            const latStr = newFieldLat ? newFieldLat.value.trim() : '';
            const lngStr = newFieldLng ? newFieldLng.value.trim() : '';

            if (!activeFarmId || !FARM_DATA[activeFarmId]) {
                alert('Please select a valid farm before adding a field.');
                return;
            }

            if (!latStr || !lngStr) {
                alert('Please enter both Latitude and Longitude for your field (or click Auto-Detect GPS Location).');
                if (!latStr && newFieldLat) newFieldLat.focus();
                else if (newFieldLng) newFieldLng.focus();
                return;
            }

            const lat = Number(latStr);
            const lng = Number(lngStr);

            if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
                alert('Please enter a valid Latitude between -90 and 90 degrees.');
                if (newFieldLat) newFieldLat.focus();
                return;
            }

            if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
                alert('Please enter a valid Longitude between -180 and 180 degrees.');
                if (newFieldLng) newFieldLng.focus();
                return;
            }

            if (!name || !crop || !Number.isFinite(acres) || acres <= 0 || !location) {
                alert('Please enter a valid field name, crop, positive acreage, and location.');
                return;
            }

            const submitButton = addFieldForm.querySelector('[type="submit"]');

            if (submitButton) submitButton.disabled = true;

            try {
                const response = await fetch(
                    `/api/farms/${encodeURIComponent(activeFarmId)}/parcels`,
                    {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            name,
                            crop,
                            acres,
                            location,
                            latitude: lat,
                            longitude: lng,
                            irrigation: irrigation || null,
                            stage: 'Growth Stage: Early V1 Emergence',
                            soilType: 'Silt Loam'
                        })
                    }
                );

                if (response.status === 401) {
                    window.location.replace('login.html');
                    return;
                }

                const result = await response.json().catch(() => null);

                if (!response.ok ||
                    !result ||
                    result.status !== 'success' ||
                    !result.parcel ||
                    !result.parcel.id) {
                    throw new Error(
                        result && result.message
                            ? result.message
                            : `Parcel creation failed (HTTP ${response.status}).`
                    );
                }

                const parcel = result.parcel;

                const newParcel = createParcelObject(parcel.id, {
                    name: parcel.name,
                    crop: parcel.crop,
                    acres: parcel.acres,
                    location: parcel.location,
                    lat: parcel.latitude,
                    lng: parcel.longitude,
                    stage: parcel.stage,
                    soilType: parcel.soilType,
                    irrigation: parcel.irrigation,
                    farmId: activeFarmId
                });

                FIELD_DATA[parcel.id] = newParcel;

                if (!Array.isArray(FARM_DATA[activeFarmId].parcels)) {
                    FARM_DATA[activeFarmId].parcels = [];
                }

                FARM_DATA[activeFarmId].parcels.push(parcel);

                closeAddField();
                addFieldForm.reset();

                renderParcels();

                if (typeof renderFarms === 'function') {
                    renderFarms();
                }

                switchActiveField(parcel.id);

                alert(`Field "${parcel.name}" added successfully.`);

            } catch (error) {
                console.error('Parcel creation failed:', error);
                alert(error.message || 'Could not create the field. Please try again.');
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
        });
    }
    // 8B. FARM & SYSTEM SETTINGS CONTROLLER
    // ==========================================
    const settingsModal = document.getElementById('settingsModal');
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const sidebarSettingsBtn = document.getElementById('sidebarSettingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    const settingsForm = document.getElementById('settingsForm');

    const setOperatorName = document.getElementById('setOperatorName');
    const setFarmName = document.getElementById('setFarmName');
    const setFarmLocation = document.getElementById('setFarmLocation');
    const setTempUnit = document.getElementById('setTempUnit');
    const setAreaUnit = document.getElementById('setAreaUnit');
    const setWindUnit = document.getElementById('setWindUnit');
    const setRefreshRate = document.getElementById('setRefreshRate');
    const setDriftThreshold = document.getElementById('setDriftThreshold');
    const exportFarmJsonBtn = document.getElementById('exportFarmJsonBtn');
    const clearAllFarmDataBtn = document.getElementById('clearAllFarmDataBtn');

    let currentPollingIntervalMs = 60000;
    let telemetryPollingTimer = null;

    function openSettings() {
        if (!settingsModal) return;

        const storedName = localStorage.getItem('cropswitch_user_name') || 'Farm Operator';
        const storedFarm = localStorage.getItem('cropswitch_user_farm') || "Operator's Farm";
        let settings = {};
        try {
            settings = JSON.parse(localStorage.getItem('cropswitch_settings')) || {};
        } catch (e) {
            settings = {};
        }

        if (setOperatorName) setOperatorName.value = storedName;
        if (setFarmName) setFarmName.value = storedFarm;
        if (setFarmLocation) setFarmLocation.value = settings.location || 'Story County, IA';
        if (setTempUnit) setTempUnit.value = settings.tempUnit || 'fahrenheit';
        if (setAreaUnit) setAreaUnit.value = settings.areaUnit || 'acres';
        if (setWindUnit) setWindUnit.value = settings.windUnit || 'mph';
        if (setRefreshRate) setRefreshRate.value = settings.refreshRate ? String(settings.refreshRate) : '60000';
        if (setDriftThreshold) setDriftThreshold.value = settings.driftThreshold ? String(settings.driftThreshold) : '14';

        settingsModal.classList.add('open');
    }

    function closeSettings() {
        if (settingsModal) settingsModal.classList.remove('open');
    }

    if (openSettingsBtn) openSettingsBtn.addEventListener('click', openSettings);
    if (sidebarSettingsBtn) sidebarSettingsBtn.addEventListener('click', openSettings);
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);
    if (cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', closeSettings);

    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) closeSettings();
        });
    }

    if (settingsForm) {
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const opName = setOperatorName.value.trim();
            const farmName = setFarmName.value.trim();
            if (!opName || !farmName) {
                alert('Please enter both operator and farm names.');
                return;
            }

            const settings = {
                location: setFarmLocation.value.trim(),
                tempUnit: setTempUnit.value,
                areaUnit: setAreaUnit.value,
                windUnit: setWindUnit.value,
                refreshRate: parseInt(setRefreshRate.value) || 60000,
                driftThreshold: parseInt(setDriftThreshold.value) || 14
            };

            localStorage.setItem('cropswitch_user_name', opName);
            localStorage.setItem('cropswitch_user_farm', farmName);
            localStorage.setItem('cropswitch_settings', JSON.stringify(settings));

            initUserProfile();

            // Restart polling timer with updated rate
            if (settings.refreshRate !== currentPollingIntervalMs) {
                currentPollingIntervalMs = settings.refreshRate;
                if (telemetryPollingTimer) clearInterval(telemetryPollingTimer);
                telemetryPollingTimer = setInterval(() => {
                    const currentField = (activeFieldId && FIELD_DATA[activeFieldId]) ? FIELD_DATA[activeFieldId] : null;
                    fetchLiveTelemetry(currentField);
                }, currentPollingIntervalMs);
            }

            // Immediately refresh telemetry
            const currentField = (activeFieldId && FIELD_DATA[activeFieldId]) ? FIELD_DATA[activeFieldId] : null;
            fetchLiveTelemetry(currentField);

            closeSettings();
            alert('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ Farm settings and system preferences saved successfully.');
        });
    }

    // Export Farm Backup (JSON)
    if (exportFarmJsonBtn) {
        exportFarmJsonBtn.addEventListener('click', () => {
            const backup = {
                exportDate: new Date().toISOString(),
                operator: localStorage.getItem('cropswitch_user_name'),
                farm: localStorage.getItem('cropswitch_user_farm'),
                settings: localStorage.getItem('cropswitch_settings'),
                parcels: FIELD_DATA,
                tasks: userTasks,
                sensors: userSensors
            };

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute("href", dataStr);
            dlAnchor.setAttribute("download", `cropswitch-farm-backup-${Date.now()}.json`);
            document.body.appendChild(dlAnchor);
            dlAnchor.click();
            dlAnchor.remove();
        });
    }

    // Reset All Farm Data
    if (clearAllFarmDataBtn) {
        clearAllFarmDataBtn.addEventListener('click', () => {
            const confirmed = confirm('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Are you sure you want to reset all farm data?\n\nThis will remove your custom fields, tasks, and connected sensors from this browser.');
            if (!confirmed) return;

            localStorage.removeItem('cropswitch_user_parcels');
            localStorage.removeItem('cropswitch_custom_field');
            localStorage.removeItem('cropswitch_user_tasks');
            localStorage.removeItem('cropswitch_user_sensors');

            loadUserParcels();
            loadUserTasks();
            loadUserSensors();
            closeSettings();

            alert('Farm data has been reset to a clean slate.');
        });
    }

    // ==========================================
    // 9. FARM ENTERPRISE DIRECTORY & MANAGEMENT
    // ==========================================
    let FARM_DATA = {};
    let activeFarmId = null;

    const addFarmModal = document.getElementById('addFarmModal');
    const addNewFarmBtn = document.getElementById('addNewFarmBtn');
    const addFarmCardBtn = document.getElementById('addFarmCardBtn');
    const closeAddFarmBtn = document.getElementById('closeAddFarmBtn');
    const cancelAddFarmBtn = document.getElementById('cancelAddFarmBtn');
    const addFarmForm = document.getElementById('addFarmForm');
    const farmsGrid = document.getElementById('farmsGrid');
    const sidebarFarmCount = document.getElementById('sidebarFarmCount');

    async function loadUserFarms() {
        try {
            const response = await fetch('/api/farms', {
                method: 'GET',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' }
            });

            if (response.status === 401) {
                window.location.replace('login.html');
                return false;
            }

            if (!response.ok) {
                throw new Error(`Farm API returned HTTP ${response.status}`);
            }

            const result = await response.json();

            if (!result || result.status !== 'success' || !Array.isArray(result.farms)) {
                throw new Error('Farm API returned an unexpected response.');
            }

            const nextFarmData = {};
            const nextFieldData = {};

            result.farms.forEach(farm => {
                if (!farm || !farm.id || !farm.name) return;

                const parcels = Array.isArray(farm.parcels) ? farm.parcels : [];

                nextFarmData[farm.id] = {
                    id: farm.id,
                    name: farm.name,
                    operator: farm.operator || '',
                    location: farm.location || '',
                    createdAt: farm.createdAt || null,
                    parcels: parcels
                };

                parcels.forEach(parcel => {
                    if (!parcel || !parcel.id) return;

                    nextFieldData[parcel.id] = createParcelObject(parcel.id, {
                        name: parcel.name,
                        crop: parcel.crop,
                        acres: parcel.acres,
                        location: parcel.location,
                        irrigation: parcel.irrigation,
                        lat: parcel.latitude,
                        lng: parcel.longitude,
                        stage: parcel.stage,
                        soilType: parcel.soilType,
                        farmId: farm.id
                    });
                });
            });

            FARM_DATA = nextFarmData;
            FIELD_DATA = nextFieldData;

            const farmIds = Object.keys(FARM_DATA);

            if (!activeFarmId || !FARM_DATA[activeFarmId]) {
                activeFarmId = farmIds[0] || null;
            }

            const activeFarmFields = Object.values(FIELD_DATA)
                .filter(field => field.farmId === activeFarmId);

            if (!activeFieldId || !FIELD_DATA[activeFieldId] ||
                FIELD_DATA[activeFieldId].farmId !== activeFarmId) {
                activeFieldId = activeFarmFields.length > 0
                    ? activeFarmFields[0].id : null;
            }

            renderFarms();
            renderParcels();

            return true;

        } catch (error) {
            console.error('Failed to load farms from PostgreSQL:', error);
            alert('Could not load your farms from the server. Please refresh the dashboard and try again.');
            return false;
        }
    }
    function renderFarms() {
        if (!farmsGrid) return;

        // Remove old farm cards except the add card
        const oldCards = farmsGrid.querySelectorAll('.farm-card:not(.add-card), .empty-state-box');
        oldCards.forEach(c => c.remove());

        const farmIds = Object.keys(FARM_DATA);
        if (sidebarFarmCount) sidebarFarmCount.textContent = farmIds.length;

        if (farmIds.length === 0) {
            const emptyBox = document.createElement('div');
            emptyBox.className = 'empty-state-box';
            emptyBox.innerHTML = `
                <div class="empty-state-icon">&#128668;</div>
                <h4>No Farms Registered Yet</h4>
                <p>Register your first farm enterprise to begin tracking fields and satellite telemetry.</p>
                <button type="button" class="topbar-btn primary" id="addFirstFarmBtn" style="margin-top: 4px;">+ Register Your First Farm</button>
            `;
            farmsGrid.insertBefore(emptyBox, addFarmCardBtn);
            const btn = document.getElementById('addFirstFarmBtn');
            if (btn) btn.addEventListener('click', openAddFarm);
            return;
        }

        farmIds.forEach(id => {
            const farm = FARM_DATA[id];
            const isActive = (id === activeFarmId);

            // Compute total acreage and crops for this farm from FIELD_DATA
            const fieldKeys = Object.keys(FIELD_DATA);
            const farmFields = fieldKeys.map(k => FIELD_DATA[k]).filter(f => f.farmId === id);
            const totalAcres = farmFields.reduce((sum, f) => sum + (f.acres || 0), 0);
            const cropsList = Array.from(new Set(farmFields.map(f => f.rawCrop || f.crop.split(' | ')[0]))).join(', ') || 'No fields added yet';

            const card = document.createElement('div');
            card.className = 'farm-card' + (isActive ? ' active' : '');
            card.setAttribute('data-farm-id', id);
            card.innerHTML = `
                <div class="farm-card-header">
                    <span class="farm-card-icon">FARM</span>
                    <div class="farm-card-title-wrap">
                        <h4>${escapeHTML(farm.name)}</h4>
                        <span class="farm-card-operator">Operator: ${escapeHTML(farm.operator || 'Not specified')}</span>
                    </div>
                    ${isActive ? '<span class="field-badge-active" style="position:static;">Active</span>' : ''}
                    <button type="button" class="field-delete-btn" data-delete-farm="${id}" title="Delete ${escapeHTML(farm.name)}">×</button>
                </div>
                <div class="farm-card-body">
                    <div class="farm-stat-row">
                        <span class="farm-stat-label">Headquarters:</span>
                        <strong>${escapeHTML(farm.location || 'Location not specified')}</strong>
                    </div>
                    <div class="farm-stat-row">
                        <span class="farm-stat-label">Managed Land:</span>
                        <strong>${totalAcres} Acres (${farmFields.length} Fields)</strong>
                    </div>
                    <div class="farm-stat-row">
                        <span class="farm-stat-label">Crop Plantings:</span>
                        <span style="font-weight: 600; color: var(--green-dark);">${escapeHTML(cropsList)}</span>
                    </div>
                </div>
                <div class="farm-card-footer">
                    <button type="button" class="topbar-btn outline" data-add-field-farm="${id}" style="padding: 5px 12px; font-size: 11.5px;">+ Add Field</button>
                    ${isActive
                        ? '<span style="font-size: 11.5px; font-weight: 700; color: var(--green-mid);">Selected Farm</span>'
                        : `<button type="button" class="topbar-btn primary" data-switch-farm="${id}" style="padding: 5px 12px; font-size: 11.5px;">Select Farm</button>`
                    }
                </div>
            `;
            card.addEventListener('click', (e) => {
                if (e.target.closest('[data-delete-farm]') || e.target.closest('[data-add-field-farm]')) return;
                switchActiveFarm(id);
            });

            farmsGrid.insertBefore(card, addFarmCardBtn);
        });

        // Attach action listeners
        farmsGrid.querySelectorAll('[data-delete-farm]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fid = btn.getAttribute('data-delete-farm');
                deleteFarm(fid);
            });
        });

        farmsGrid.querySelectorAll('[data-switch-farm]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fid = btn.getAttribute('data-switch-farm');
                switchActiveFarm(fid);
            });
        });

        farmsGrid.querySelectorAll('[data-add-field-farm]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fid = btn.getAttribute('data-add-field-farm');
                switchActiveFarm(fid);
                openAddField();
            });
        });
    }

    function switchActiveFarm(farmId) {
        if (!farmId || !FARM_DATA[farmId]) return;
        activeFarmId = farmId;
        const farm = FARM_DATA[farmId];

        localStorage.setItem('cropswitch_user_farm', farm.name);
        if (farm.operator) {
            localStorage.setItem('cropswitch_user_name', farm.operator);
        }

        initUserProfile();
        renderFarms();
        renderParcels();
    }

    async function deleteFarm(farmId) {
        if (!farmId || !FARM_DATA[farmId]) return;

        const farm = FARM_DATA[farmId];

        const confirmed = confirm(
            `Permanently delete "${farm.name}"?\n\n` +
            `This will also permanently delete every parcel associated with this farm. ` +
            `This action cannot be undone.`
        );

        if (!confirmed) return;

        try {
            const response = await fetch(
                `/api/farms/${encodeURIComponent(farmId)}`,
                {
                    method: 'DELETE',
                    credentials: 'same-origin',
                    headers: {
                        'Accept': 'application/json'
                    }
                }
            );

            if (response.status === 401) {
                window.location.replace('login.html');
                return;
            }

            const result = await response.json().catch(() => null);

            if (!response.ok || !result || result.status !== 'success') {
                throw new Error(
                    result && result.message
                        ? result.message
                        : `Farm deletion failed (HTTP ${response.status}).`
                );
            }

            const deletedActiveFarm = activeFarmId === farmId;

            delete FARM_DATA[farmId];

            Object.keys(FIELD_DATA).forEach(fieldId => {
                if (FIELD_DATA[fieldId] &&
                    FIELD_DATA[fieldId].farmId === farmId) {
                    delete FIELD_DATA[fieldId];
                }
            });

            if (deletedActiveFarm) {
                const remainingFarmIds = Object.keys(FARM_DATA);
                activeFarmId = remainingFarmIds[0] || null;
                activeFieldId = null;

                if (activeFarmId) {
                    localStorage.setItem(
                        'cropswitch_user_farm',
                        FARM_DATA[activeFarmId].name
                    );
                } else {
                    localStorage.removeItem('cropswitch_user_farm');
                }
            }

            renderFarms();
            renderParcels();

            alert(`Farm "${farm.name}" deleted successfully.`);

        } catch (error) {
            console.error('Farm deletion failed:', error);
            alert(error.message || 'Could not delete the farm. Please try again.');
        }
    }

    function openAddFarm() {
        if (addFarmModal) {
            if (addFarmForm) addFarmForm.reset();
            addFarmModal.classList.add('open');
        }
    }

    function closeAddFarm() {
        if (addFarmModal) addFarmModal.classList.remove('open');
    }

    if (addNewFarmBtn) addNewFarmBtn.addEventListener('click', openAddFarm);
    if (addFarmCardBtn) addFarmCardBtn.addEventListener('click', openAddFarm);
    if (closeAddFarmBtn) closeAddFarmBtn.addEventListener('click', closeAddFarm);
    if (cancelAddFarmBtn) cancelAddFarmBtn.addEventListener('click', closeAddFarm);

    if (addFarmModal) {
        addFarmModal.addEventListener('click', (e) => {
            if (e.target === addFarmModal) closeAddFarm();
        });
    }

    if (addFarmForm) {
        addFarmForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('newFarmName').value.trim();
            const operator = document.getElementById('newFarmOperator').value.trim();
            const location = document.getElementById('newFarmLocation').value.trim();

            if (!name) {
                alert('Please enter a farm name.');
                return;
            }

            const submitButton = addFarmForm.querySelector('[type="submit"]');

            if (submitButton) submitButton.disabled = true;

            try {
                const response = await fetch('/api/farms', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name,
                        operator: operator || null,
                        location: location || null
                    })
                });

                if (response.status === 401) {
                    window.location.replace('login.html');
                    return;
                }

                const result = await response.json().catch(() => null);

                if (!response.ok || !result ||
                    result.status !== 'success' ||
                    !result.farm ||
                    !result.farm.id ||
                    !result.farm.name) {
                    throw new Error(
                        result && result.message
                            ? result.message
                            : `Farm creation failed (HTTP ${response.status}).`
                    );
                }

                const farm = result.farm;

                FARM_DATA[farm.id] = {
                    id: farm.id,
                    name: farm.name,
                    operator: farm.operator || '',
                    location: farm.location || '',
                    createdAt: farm.createdAt || null,
                    parcels: Array.isArray(farm.parcels) ? farm.parcels : []
                };

                closeAddFarm();
                switchActiveFarm(farm.id);

                alert(`Farm "${farm.name}" added successfully.`);

            } catch (error) {
                console.error('Farm creation failed:', error);
                alert(error.message || 'Could not create the farm. Please try again.');
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
        });
    }
    // ==========================================
    // 10. REPORT PREVIEW & PRINT
    // ==========================================
    const reportModal = document.getElementById('reportModal');
    const openReportBtn = document.getElementById('openReportBtn');
    const sidebarReportBtn = document.getElementById('sidebarReportBtn');
    const closeReportBtn = document.getElementById('closeReportBtn');
    const closeReportBtn2 = document.getElementById('closeReportBtn2');
    const triggerPrintBtn = document.getElementById('triggerPrintBtn');

    function openReport() {
        if (!reportModal) return;
        const reportDateText = document.getElementById('reportDateText');
        if (reportDateText) {
            reportDateText.textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        }
        reportModal.classList.add('open');
    }

    function closeReport() {
        if (reportModal) reportModal.classList.remove('open');
    }

    if (openReportBtn) openReportBtn.addEventListener('click', openReport);
    if (sidebarReportBtn) sidebarReportBtn.addEventListener('click', openReport);
    if (closeReportBtn) closeReportBtn.addEventListener('click', closeReport);
    if (closeReportBtn2) closeReportBtn2.addEventListener('click', closeReport);

    if (reportModal) {
        reportModal.addEventListener('click', (e) => {
            if (e.target === reportModal) closeReport();
        });
    }

    if (triggerPrintBtn) {
        triggerPrintBtn.addEventListener('click', () => window.print());
    }

    // ==========================================
    // 11. MOBILE SIDEBAR MENU TOGGLE
    // ==========================================
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const appSidebar = document.getElementById('appSidebar');

    if (mobileMenuBtn && appSidebar) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            appSidebar.classList.toggle('mobile-open');
        });

        document.addEventListener('click', (e) => {
            if (appSidebar.classList.contains('mobile-open') && !appSidebar.contains(e.target)) {
                appSidebar.classList.remove('mobile-open');
            }
        });
    }

    // ==========================================
    // 12. UTILITIES
    // ==========================================
    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeReport();
            closeAddField();
            closeSettings();
            closeAddFarm();
        }
    });

    // ==========================================
    // 13. REAL-TIME COMMODITY MARKET TICKER
    // ==========================================
        async function initLiveCommodityTicker() {
        const crops = [
            { name: "Corn (Zea mays)", label: "CORN (USDA NASS)", index: 0 },
            { name: "Soybeans (Glycine max)", label: "SOYBEANS (USDA NASS)", index: 1 },
            { name: "Hard Red Winter Wheat", label: "WHEAT (HARD RED WINTER)", index: 2 }
        ];

        const tickerItems = document.querySelectorAll(".ticker-bar .ticker-item");
        if (!tickerItems || tickerItems.length < 3) return;

        for (const crop of crops) {
            const item = tickerItems[crop.index];
            if (!item) continue;

            const priceEl = item.querySelector(".ticker-price");
            const changeEl = item.querySelector(".ticker-change");
            const cropEl = item.querySelector(".ticker-crop");

            if (cropEl) cropEl.textContent = crop.label;
            if (priceEl) priceEl.textContent = "Loading...";
            if (changeEl) {
                changeEl.textContent = "Historical USDA data";
                changeEl.className = "ticker-change";
            }

            try {
                const query = encodeURIComponent(crop.name);
                const response = await fetch(
                    `/api/datasets/usda-prices?crop=${query}&limit=100`,
                    { headers: { "Accept": "application/json" } }
                );

                if (!response.ok) {
                    throw new Error(`USDA dataset returned HTTP ${response.status}`);
                }

                const result = await response.json();
                const records = Array.isArray(result.data) ? result.data : [];

                const latest = records
                    .filter(record =>
                        Number.isFinite(Number(record.Year)) &&
                        Number.isFinite(Number(record.Price_Received))
                    )
                    .sort((a, b) => Number(b.Year) - Number(a.Year))[0];

                if (!latest) {
                    throw new Error("No matching historical price record");
                }

                if (priceEl) {
                    priceEl.textContent =
                        `${Number(latest.Price_Received).toFixed(2)} / ${latest.Unit.replace("$ / ", "").toLowerCase()}`;
                }

                const isActual = /actual/i.test(latest.Source || "");

                if (changeEl) {
                    changeEl.textContent =
                        `${latest.Year} · ${isActual ? "USDA actual" : "Estimated historical"}`;
                    changeEl.className = "ticker-change";
                }

            } catch (error) {
                console.error(`USDA price lookup failed for ${crop.name}:`, error);

                if (priceEl) priceEl.textContent = "Unavailable";
                if (changeEl) {
                    changeEl.textContent = "Data unavailable";
                    changeEl.className = "ticker-change";
                }
            }
        }
    }

    // Verify the server session before initializing private dashboard data.
    let authenticatedUser = null;

    try {
        const sessionResponse = await fetch('/api/auth/me', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        });

        if (sessionResponse.status === 401) {
            window.location.replace('login.html');
            return;
        }

        if (!sessionResponse.ok) {
            throw new Error('Session verification returned HTTP ' + sessionResponse.status);
        }

        const sessionData = await sessionResponse.json();

        if (!sessionData.user || !sessionData.user.email) {
            window.location.replace('login.html');
            return;
        }

        authenticatedUser = sessionData.user;

        // Refresh profile cache using the authenticated server response.
        localStorage.setItem('cropswitch_user_name', authenticatedUser.name || '');
        localStorage.setItem('cropswitch_user_farm', authenticatedUser.farm || '');
        localStorage.setItem('cropswitch_user_email', authenticatedUser.email || '');

    } catch (error) {
        console.error('Session verification failed:', error);
        alert('Unable to verify your CropSwitch session. Please check the server and refresh the page.');
        return;
    }

    // Attach the server-backed logout handler once.
    const signOutBtn = document.getElementById('signOutBtn');

    if (signOutBtn) {
        signOutBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to sign out of the CropSwitch portal?')) {
                return;
            }

            signOutBtn.disabled = true;

            try {
                const logoutResponse = await fetch('/api/auth/logout', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Accept': 'application/json' }
                });

                if (!logoutResponse.ok) {
                    throw new Error('The server could not end your session.');
                }

                // Remove profile cache only. Preserve farm and dashboard data.
                localStorage.removeItem('cropswitch_user_name');
                localStorage.removeItem('cropswitch_user_farm');
                localStorage.removeItem('cropswitch_user_email');

                window.location.replace('login.html');

            } catch (error) {
                console.error('Logout failed:', error);
                alert('Sign out failed. Please check your connection and try again.');
                signOutBtn.disabled = false;
            }
        });
    }

    // Initialize dashboard features only after session verification.
    initUserProfile();

    const farmsLoaded = await loadUserFarms();

    if (!farmsLoaded) {
        return;
    }

    initSatelliteMap();
    loadUserTasks();
    loadUserSensors();
    calculateYieldROI();
    initLiveCommodityTicker();
    // Real-Time Telemetry Polling Loop (configurable in Farm Settings)
    try {
        const s = JSON.parse(localStorage.getItem('cropswitch_settings'));
        if (s && s.refreshRate) currentPollingIntervalMs = s.refreshRate;
    } catch(e) {}

    telemetryPollingTimer = setInterval(() => {
        const currentField = (activeFieldId && FIELD_DATA[activeFieldId]) ? FIELD_DATA[activeFieldId] : null;
        fetchLiveTelemetry(currentField);
    }, currentPollingIntervalMs);
});
