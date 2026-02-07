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
let bikeLanesLayer;
let bikeRouteLayer;
let selectedLines = new Set(Object.keys(CONFIG.lineColors));
let updateTimer;
let showBikeLanes = false;
let bikeRouteMode = false;
let bikeRouteStart = null;
let bikeRouteEnd = null;

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
    bikeLanesLayer = L.layerGroup();  // Pas ajouté par défaut
    bikeRouteLayer = L.layerGroup().addTo(map);

    // Charger les données
    loadMetroLines();
    loadMetroStations();
    loadVehiclePositions();

    // Événement de clic sur la carte pour le mode itinéraire vélo
    map.on('click', handleMapClick);

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
                        <div class="popup-info">
                    `;

                    // Station d'origine
                    if (vehicle.origin_station) {
                        popupContent += `
                            <p><i class="fas fa-map-marker-alt" style="color: #4CAF50;"></i> <strong>Départ:</strong> ${vehicle.origin_station}</p>
                        `;
                    }

                    // Destination
                    if (vehicle.destination) {
                        popupContent += `
                            <p><i class="fas fa-flag-checkered" style="color: #F44336;"></i> <strong>Direction:</strong> ${vehicle.destination}</p>
                        `;
                    }

                    // Heure d'arrivée estimée
                    if (vehicle.estimated_arrival) {
                        popupContent += `
                            <p><i class="fas fa-clock" style="color: #2196F3;"></i> <strong>Arrivée estimée:</strong> ${vehicle.estimated_arrival}</p>
                        `;
                    }

                    // Statut
                    const statusText = vehicle.current_status === 'IN_TRANSIT' ? 'En circulation' : 'À l\'arrêt';
                    const statusIcon = vehicle.current_status === 'IN_TRANSIT' ? 'fa-train' : 'fa-pause-circle';
                    popupContent += `
                        <p><i class="fas ${statusIcon}" style="color: #9C27B0;"></i> <strong>Statut:</strong> ${statusText}</p>
                    `;

                    popupContent += `</div>`;

                    marker.bindPopup(popupContent, {
                        className: 'train-popup',
                        maxWidth: 300
                    });
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
 * Charge et affiche les pistes cyclables
 */
async function loadBikeLanes() {
    try {
        const response = await fetch('/api/bike-lanes');
        const data = await response.json();

        bikeLanesLayer.clearLayers();

        if (data.features && data.features.length > 0) {
            L.geoJSON(data, {
                style: {
                    color: '#00CC66',
                    weight: 2,
                    opacity: 0.7
                },
                onEachFeature: (feature, layer) => {
                    const props = feature.properties || {};
                    const name = props.nom_voie || props.name || 'Piste cyclable';
                    const type = props.amenagement || props.highway || 'Non spécifié';
                    layer.bindPopup(`
                        <div class="popup-title"><i class="fas fa-bicycle"></i> ${name}</div>
                        <p>Type: ${type}</p>
                    `);
                }
            }).addTo(bikeLanesLayer);

            console.log(`${data.features.length} pistes cyclables chargées`);
        }
    } catch (error) {
        console.error('Erreur lors du chargement des pistes cyclables:', error);
    }
}

/**
 * Toggle l'affichage des pistes cyclables
 */
function toggleBikeLanes() {
    showBikeLanes = !showBikeLanes;

    if (showBikeLanes) {
        bikeLanesLayer.addTo(map);
        loadBikeLanes();
        document.getElementById('toggle-bike-lanes')?.classList.add('active');
    } else {
        map.removeLayer(bikeLanesLayer);
        document.getElementById('toggle-bike-lanes')?.classList.remove('active');
    }
}

/**
 * Active/désactive le mode itinéraire vélo
 */
function toggleBikeRouteMode() {
    bikeRouteMode = !bikeRouteMode;
    bikeRouteStart = null;
    bikeRouteEnd = null;
    bikeRouteLayer.clearLayers();

    const btn = document.getElementById('toggle-bike-route');
    const info = document.getElementById('bike-route-info');

    if (bikeRouteMode) {
        btn?.classList.add('active');
        if (info) info.textContent = 'Cliquez sur la carte pour définir le point de départ';
        map.getContainer().style.cursor = 'crosshair';
    } else {
        btn?.classList.remove('active');
        if (info) info.textContent = '';
        map.getContainer().style.cursor = '';
    }
}

/**
 * Gère les clics sur la carte pour le mode itinéraire
 */
function handleMapClick(e) {
    if (!bikeRouteMode) return;

    const latlng = e.latlng;

    if (!bikeRouteStart) {
        // Premier clic: définir le point de départ
        bikeRouteStart = latlng;
        bikeRouteLayer.clearLayers();

        const startMarker = L.marker(latlng, {
            icon: L.divIcon({
                className: 'bike-marker start-marker',
                html: '<div style="background: #4CAF50; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).bindPopup('Point de départ');
        startMarker.addTo(bikeRouteLayer);

        document.getElementById('bike-route-info').textContent = 'Cliquez pour définir le point d\'arrivée';

    } else if (!bikeRouteEnd) {
        // Deuxième clic: définir le point d'arrivée et calculer l'itinéraire
        bikeRouteEnd = latlng;

        const endMarker = L.marker(latlng, {
            icon: L.divIcon({
                className: 'bike-marker end-marker',
                html: '<div style="background: #F44336; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).bindPopup('Point d\'arrivée');
        endMarker.addTo(bikeRouteLayer);

        // Calculer l'itinéraire
        calculateBikeRoute();
    }
}

/**
 * Calcule et affiche l'itinéraire vélo
 */
async function calculateBikeRoute() {
    if (!bikeRouteStart || !bikeRouteEnd) return;

    document.getElementById('bike-route-info').textContent = 'Calcul de l\'itinéraire...';

    try {
        const url = `/api/bike-route?start_lat=${bikeRouteStart.lat}&start_lng=${bikeRouteStart.lng}&end_lat=${bikeRouteEnd.lat}&end_lng=${bikeRouteEnd.lng}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            document.getElementById('bike-route-info').textContent = 'Erreur: ' + data.error;
            return;
        }

        // Afficher l'itinéraire
        if (data.route && data.route.features) {
            L.geoJSON(data.route, {
                style: {
                    color: '#2196F3',
                    weight: 5,
                    opacity: 0.8,
                    dashArray: '10, 10'
                }
            }).addTo(bikeRouteLayer);
        }

        // Afficher les informations
        const info = document.getElementById('bike-route-info');
        info.innerHTML = `
            <strong><i class="fas fa-bicycle"></i> Itinéraire vélo</strong><br>
            <i class="fas fa-road"></i> Distance: ${data.distance_km} km<br>
            <i class="fas fa-clock"></i> Durée: ${data.duration_text}
        `;

        // Ajuster la vue
        map.fitBounds([
            [bikeRouteStart.lat, bikeRouteStart.lng],
            [bikeRouteEnd.lat, bikeRouteEnd.lng]
        ], { padding: [50, 50] });

        // Désactiver le mode après le calcul
        bikeRouteMode = false;
        map.getContainer().style.cursor = '';
        document.getElementById('toggle-bike-route')?.classList.remove('active');

    } catch (error) {
        console.error('Erreur calcul itinéraire:', error);
        document.getElementById('bike-route-info').textContent = 'Erreur lors du calcul';
    }
}

/**
 * Efface l'itinéraire vélo
 */
function clearBikeRoute() {
    bikeRouteLayer.clearLayers();
    bikeRouteStart = null;
    bikeRouteEnd = null;
    bikeRouteMode = false;
    map.getContainer().style.cursor = '';
    document.getElementById('toggle-bike-route')?.classList.remove('active');
    document.getElementById('bike-route-info').textContent = '';
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
