/**
 * Application de visualisation du métro parisien en temps réel
 * Utilise Leaflet et les données IDFM
 */

// Configuration
const CONFIG = {
    // Centre de Paris
    center: [48.8566, 2.3522],
    defaultZoom: 13,
    minZoom: 11,
    maxZoom: 18,
    // Intervalle de mise à jour (en ms)
    updateInterval: 30000,
    // Couleurs des lignes de métro
    lineColors: {
        "1": "#FFCD00",
        "2": "#003CA6",
        "3": "#837902",
        "3bis": "#6EC4E8",
        "4": "#CF009E",
        "5": "#FF7E2E",
        "6": "#6ECA97",
        "7": "#FA9ABA",
        "7bis": "#6ECA97",
        "8": "#E19BDF",
        "9": "#B6BD00",
        "10": "#C9910D",
        "11": "#704B1C",
        "12": "#007852",
        "13": "#6EC4E8",
        "14": "#62259D"
    }
};

// Variables globales
let map;
let linesLayer;
let stationsLayer;
let vehiclesLayer;
let selectedLines = new Set(Object.keys(CONFIG.lineColors));
let updateTimer;

/**
 * Initialise la carte Leaflet
 */
function initMap() {
    // Créer la carte
    map = L.map('map', {
        center: CONFIG.center,
        zoom: CONFIG.defaultZoom,
        minZoom: CONFIG.minZoom,
        maxZoom: CONFIG.maxZoom,
        zoomControl: true
    });

    // Ajouter le fond de carte (style sombre)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Créer les couches
    linesLayer = L.layerGroup().addTo(map);
    stationsLayer = L.layerGroup().addTo(map);
    vehiclesLayer = L.layerGroup().addTo(map);

    // Charger les données
    loadMetroLines();
    loadMetroStations();
    loadVehiclePositions();

    // Démarrer les mises à jour automatiques
    startAutoUpdate();
}

/**
 * Charge les tracés des lignes de métro
 */
async function loadMetroLines() {
    try {
        const response = await fetch('/api/lines');
        const data = await response.json();

        if (data.features) {
            linesLayer.clearLayers();

            data.features.forEach(feature => {
                const lineNumber = feature.properties.line;
                const color = CONFIG.lineColors[lineNumber] || '#ffffff';

                if (selectedLines.has(lineNumber)) {
                    const line = L.geoJSON(feature, {
                        style: {
                            color: color,
                            weight: 4,
                            opacity: 0.8,
                            lineCap: 'round',
                            lineJoin: 'round'
                        }
                    });

                    line.bindPopup(`
                        <div class="popup-title">
                            <span class="popup-line-badge" style="background-color: ${color}">${lineNumber}</span>
                            Ligne ${lineNumber}
                        </div>
                    `);

                    line.addTo(linesLayer);
                }
            });
        }
    } catch (error) {
        console.error('Erreur lors du chargement des lignes:', error);
    }
}

/**
 * Charge les stations de métro
 */
async function loadMetroStations() {
    try {
        const response = await fetch('/api/stations');
        const data = await response.json();

        if (data.features) {
            stationsLayer.clearLayers();
            let stationCount = 0;

            data.features.forEach(feature => {
                const coords = feature.geometry.coordinates;
                const props = feature.properties;
                const stationLines = props.lines || [];

                // Vérifier si au moins une ligne de la station est sélectionnée
                const isVisible = stationLines.some(line => selectedLines.has(line));

                if (isVisible) {
                    stationCount++;

                    // Créer les badges des lignes
                    const linesBadges = stationLines.map(line => {
                        const color = CONFIG.lineColors[line] || '#ffffff';
                        return `<span class="popup-line-badge" style="background-color: ${color}">${line}</span>`;
                    }).join('');

                    // Créer le marqueur de la station
                    const marker = L.circleMarker([coords[1], coords[0]], {
                        radius: 5,
                        fillColor: '#ffffff',
                        color: '#003CA6',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.9
                    });

                    marker.bindPopup(`
                        <div class="popup-title">${props.name}</div>
                        <div class="popup-lines">${linesBadges}</div>
                    `);

                    marker.addTo(stationsLayer);
                }
            });

            // Mettre à jour le compteur
            document.getElementById('total-stations').textContent = stationCount;
        }
    } catch (error) {
        console.error('Erreur lors du chargement des stations:', error);
    }
}

/**
 * Charge les positions en temps réel des véhicules
 */
async function loadVehiclePositions() {
    try {
        const response = await fetch('/api/vehicles');
        const data = await response.json();

        vehiclesLayer.clearLayers();

        if (data.error) {
            console.warn('API Error:', data.error);
            document.getElementById('total-vehicles').textContent = '0';
            return;
        }

        if (data.vehicles && data.vehicles.length > 0) {
            let vehicleCount = 0;

            data.vehicles.forEach(vehicle => {
                if (selectedLines.has(vehicle.line)) {
                    vehicleCount++;

                    // Créer une icône personnalisée pour le véhicule
                    const vehicleIcon = L.divIcon({
                        className: 'vehicle-marker',
                        html: `<div style="background-color: ${vehicle.color}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 10px; border: 2px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.4);">${vehicle.line}</div>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });

                    const marker = L.marker([vehicle.lat, vehicle.lng], {
                        icon: vehicleIcon,
                        zIndexOffset: 1000
                    });

                    // Popup avec les informations du véhicule
                    let popupContent = `
                        <div class="popup-title">
                            <span class="popup-line-badge" style="background-color: ${vehicle.color}">${vehicle.line}</span>
                            Train - Ligne ${vehicle.line}
                        </div>
                    `;

                    if (vehicle.speed !== null) {
                        popupContent += `<p>Vitesse: ${Math.round(vehicle.speed)} km/h</p>`;
                    }

                    marker.bindPopup(popupContent);
                    marker.addTo(vehiclesLayer);
                }
            });

            document.getElementById('total-vehicles').textContent = vehicleCount;
        } else {
            document.getElementById('total-vehicles').textContent = '0';
        }

        // Mettre à jour l'heure de dernière mise à jour
        updateLastUpdateTime();
    } catch (error) {
        console.error('Erreur lors du chargement des véhicules:', error);
    }
}

/**
 * Met à jour l'affichage de l'heure de dernière mise à jour
 */
function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('fr-FR');
    document.getElementById('last-update').textContent = `Dernière mise à jour: ${timeString}`;
}

/**
 * Démarre les mises à jour automatiques
 */
function startAutoUpdate() {
    if (updateTimer) {
        clearInterval(updateTimer);
    }

    updateTimer = setInterval(() => {
        loadVehiclePositions();
    }, CONFIG.updateInterval);
}

/**
 * Rafraîchit manuellement les données
 */
async function refreshData() {
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn.classList.add('spinning');

    await Promise.all([
        loadMetroLines(),
        loadMetroStations(),
        loadVehiclePositions()
    ]);

    setTimeout(() => {
        refreshBtn.classList.remove('spinning');
    }, 500);
}

/**
 * Gère les changements de sélection des lignes
 */
function handleLineToggle(lineNumber, isChecked) {
    if (isChecked) {
        selectedLines.add(lineNumber);
    } else {
        selectedLines.delete(lineNumber);
    }

    // Recharger les données avec les nouvelles sélections
    loadMetroLines();
    loadMetroStations();
    loadVehiclePositions();
}

/**
 * Sélectionne toutes les lignes
 */
function selectAllLines() {
    selectedLines = new Set(Object.keys(CONFIG.lineColors));

    document.querySelectorAll('.line-checkbox input').forEach(checkbox => {
        checkbox.checked = true;
    });

    loadMetroLines();
    loadMetroStations();
    loadVehiclePositions();
}

/**
 * Désélectionne toutes les lignes
 */
function deselectAllLines() {
    selectedLines.clear();

    document.querySelectorAll('.line-checkbox input').forEach(checkbox => {
        checkbox.checked = false;
    });

    loadMetroLines();
    loadMetroStations();
    loadVehiclePositions();
}

/**
 * Gère le toggle du sidebar
 */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

/**
 * Gère le menu mobile
 */
function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    sidebar.classList.toggle('open');

    if (overlay) {
        overlay.classList.toggle('visible');
    }
}

/**
 * Cache l'indicateur de chargement
 */
function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.add('hidden');
}

/**
 * Initialisation au chargement de la page
 */
document.addEventListener('DOMContentLoaded', () => {
    // Créer l'overlay mobile
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', toggleMobileMenu);
    document.body.appendChild(overlay);

    // Initialiser la carte
    initMap();

    // Cacher le chargement après un délai
    setTimeout(hideLoading, 1500);

    // Event listeners
    document.getElementById('refresh-btn').addEventListener('click', refreshData);
    document.getElementById('toggle-sidebar').addEventListener('click', toggleSidebar);
    document.getElementById('mobile-menu-btn').addEventListener('click', toggleMobileMenu);
    document.getElementById('select-all').addEventListener('click', selectAllLines);
    document.getElementById('deselect-all').addEventListener('click', deselectAllLines);

    // Event listeners pour les checkboxes des lignes
    document.querySelectorAll('.line-checkbox input').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            handleLineToggle(e.target.dataset.line, e.target.checked);
        });
    });
});
