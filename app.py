"""
Application Flask pour visualiser le métro parisien en temps réel.
Utilise les données d'Île-de-France Mobilités (IDFM) via l'API SIRI-Lite.
"""

import os
import json
import requests
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Clé API IDFM (à obtenir sur https://prim.iledefrance-mobilites.fr/)
IDFM_API_KEY = os.getenv('IDFM_API_KEY', '')

# URL de l'API SIRI-Lite pour les prochains passages
IDFM_SIRI_LITE_URL = "https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring"

# Temps moyen entre deux stations en secondes
AVERAGE_TRAVEL_TIME = 90

# Couleurs officielles des lignes de métro parisien
METRO_COLORS = {
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

# Identifiants des lignes de métro IDFM
METRO_LINE_IDS = {
    "1": "IDFM:C01371",
    "2": "IDFM:C01372",
    "3": "IDFM:C01373",
    "3bis": "IDFM:C01386",
    "4": "IDFM:C01374",
    "5": "IDFM:C01375",
    "6": "IDFM:C01376",
    "7": "IDFM:C01377",
    "7bis": "IDFM:C01387",
    "8": "IDFM:C01378",
    "9": "IDFM:C01379",
    "10": "IDFM:C01380",
    "11": "IDFM:C01381",
    "12": "IDFM:C01382",
    "13": "IDFM:C01383",
    "14": "IDFM:C01384"
}

# Terminus à surveiller pour chaque ligne (pour minimiser les appels API)
# Format: {line: [(station_id, station_name, lat, lng), ...]}
TERMINUS_STATIONS = {
    "1": [
        ("IDFM:71517", "La Défense", 48.8919, 2.2382),
        ("IDFM:71438", "Nation", 48.8484, 2.3957)  # Château de Vincennes non dans GeoJSON
    ],
    "2": [
        ("IDFM:71541", "Porte Dauphine", 48.8718, 2.2772),
        ("IDFM:71438", "Nation", 48.8484, 2.3957)
    ],
    "3": [
        ("IDFM:71551", "Pont de Levallois", 48.8978, 2.2803),
        ("IDFM:71565", "Gallieni", 48.8649, 2.4157)
    ],
    "3bis": [
        ("IDFM:71564", "Gambetta", 48.8648, 2.3985)
    ],
    "4": [
        ("IDFM:71571", "Porte de Clignancourt", 48.8974, 2.3447),
        ("IDFM:71579", "Mairie de Montrouge", 48.8180, 2.3197)
    ],
    "5": [
        ("IDFM:71581", "Bobigny - Pablo Picasso", 48.9063, 2.4496),
        ("IDFM:71583", "Place d'Italie", 48.8311, 2.3555)
    ],
    "6": [
        ("IDFM:71482", "Charles de Gaulle - Étoile", 48.8738, 2.2950),
        ("IDFM:71438", "Nation", 48.8484, 2.3957)
    ],
    "7": [
        ("IDFM:71602", "La Courneuve - 8 Mai 1945", 48.9199, 2.4103),
        ("IDFM:71601", "Villejuif - Louis Aragon", 48.7877, 2.3681),
        ("IDFM:71603", "Mairie d'Ivry", 48.8114, 2.3842)
    ],
    "7bis": [
        ("IDFM:71564", "Gambetta", 48.8648, 2.3985)
    ],
    "8": [
        ("IDFM:71611", "Balard", 48.8365, 2.2789),
        ("IDFM:71615", "Créteil - Préfecture", 48.7798, 2.4597)
    ],
    "9": [
        ("IDFM:71622", "Pont de Sèvres", 48.8297, 2.2306),
        ("IDFM:71621", "Mairie de Montreuil", 48.8620, 2.4415)
    ],
    "10": [
        ("IDFM:71631", "Boulogne - Pont de Saint-Cloud", 48.8403, 2.2281),
        ("IDFM:71632", "Gare d'Austerlitz", 48.8423, 2.3650)
    ],
    "11": [
        ("IDFM:71432", "Châtelet", 48.8582, 2.3470),
        ("IDFM:71641", "Mairie des Lilas", 48.8800, 2.4160)
    ],
    "12": [
        ("IDFM:71651", "Front Populaire", 48.9068, 2.3655),
        ("IDFM:71652", "Mairie d'Issy", 48.8244, 2.2731)
    ],
    "13": [
        ("IDFM:71661", "Saint-Denis - Université", 48.9458, 2.3625),
        ("IDFM:71662", "Asnières - Gennevilliers", 48.9302, 2.2845),
        ("IDFM:71663", "Châtillon - Montrouge", 48.8107, 2.3015)
    ],
    "14": [
        ("IDFM:71671", "Saint-Ouen", 48.9033, 2.3304),
        ("IDFM:71672", "Olympiades", 48.8272, 2.3670)
    ]
}

# Cache pour les stations (chargé au démarrage)
_stations_cache = None

# Cache pour les données de départs (évite de dépasser la limite API)
_departures_cache = {
    "data": [],
    "timestamp": None
}
CACHE_DURATION_SECONDS = 120  # Rafraîchir toutes les 2 minutes


def get_metro_lines_geojson():
    """Charge les données GeoJSON des lignes de métro."""
    geojson_path = os.path.join(os.path.dirname(__file__), 'data', 'metro_lines.geojson')
    if os.path.exists(geojson_path):
        with open(geojson_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"type": "FeatureCollection", "features": []}


def get_metro_stations_geojson():
    """Charge les données GeoJSON des stations de métro."""
    geojson_path = os.path.join(os.path.dirname(__file__), 'data', 'metro_stations.geojson')
    if os.path.exists(geojson_path):
        with open(geojson_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"type": "FeatureCollection", "features": []}


def get_stations_dict():
    """Retourne un dictionnaire des stations indexé par ID."""
    global _stations_cache
    if _stations_cache is None:
        geojson = get_metro_stations_geojson()
        _stations_cache = {}
        for feature in geojson.get("features", []):
            props = feature.get("properties", {})
            coords = feature.get("geometry", {}).get("coordinates", [0, 0])
            station_id = props.get("id", "")
            _stations_cache[station_id] = {
                "name": props.get("name", ""),
                "lines": props.get("lines", []),
                "lat": coords[1],
                "lng": coords[0]
            }
    return _stations_cache


def convert_idfm_to_stif(idfm_id):
    """
    Convertit un ID IDFM en format STIF pour l'API SIRI-Lite.
    Ex: IDFM:71517 -> STIF:StopArea:SP:71517:
    """
    if idfm_id.startswith("IDFM:"):
        numeric_id = idfm_id.replace("IDFM:", "")
        return f"STIF:StopArea:SP:{numeric_id}:"
    return idfm_id


def fetch_stop_departures(station_id):
    """
    Appelle l'API SIRI-Lite pour récupérer les prochains départs d'une station.
    Retourne une liste de départs avec heure et direction.
    """
    if not IDFM_API_KEY:
        return []

    stif_id = convert_idfm_to_stif(station_id)

    headers = {
        "apiKey": IDFM_API_KEY,
        "Accept": "application/json"
    }

    params = {
        "MonitoringRef": stif_id
    }

    try:
        response = requests.get(
            IDFM_SIRI_LITE_URL,
            headers=headers,
            params=params,
            timeout=10
        )

        if response.status_code == 200:
            data = response.json()
            departures = []

            # Naviguer dans la structure SIRI-Lite
            siri = data.get("Siri", {})
            service_delivery = siri.get("ServiceDelivery", {})
            stop_monitoring = service_delivery.get("StopMonitoringDelivery", [])

            for delivery in stop_monitoring:
                monitored_visits = delivery.get("MonitoredStopVisit", [])
                for visit in monitored_visits:
                    journey = visit.get("MonitoredVehicleJourney", {})

                    # Extraire les informations
                    line_ref = journey.get("LineRef", {}).get("value", "")
                    destination = journey.get("DestinationName", [{}])[0].get("value", "")

                    # Heure de départ attendue
                    call = journey.get("MonitoredCall", {})
                    expected_departure = call.get("ExpectedDepartureTime")
                    aimed_departure = call.get("AimedDepartureTime")

                    departure_time = expected_departure or aimed_departure

                    if departure_time and line_ref:
                        # Trouver le numéro de ligne
                        # Format API: STIF:Line::C01371: vs notre format: IDFM:C01371
                        line_number = None
                        for num, idfm_id in METRO_LINE_IDS.items():
                            # Extraire le code ligne (C01371) de l'ID IDFM
                            line_code = idfm_id.replace("IDFM:", "")
                            if line_code in line_ref:
                                line_number = num
                                break

                        if line_number:
                            departures.append({
                                "line": line_number,
                                "destination": destination,
                                "departure_time": departure_time,
                                "station_id": station_id,
                                "vehicle_ref": journey.get("VehicleRef", {}).get("value", "")
                            })

            return departures
        elif response.status_code == 429:
            print(f"Limite API atteinte (429) pour {station_id}")
            return []
        else:
            print(f"Erreur API SIRI-Lite: {response.status_code} pour {station_id}")
            return []

    except requests.exceptions.Timeout:
        print(f"Timeout API SIRI-Lite pour {station_id}")
        return []
    except Exception as e:
        print(f"Exception API SIRI-Lite: {e}")
        return []


def parse_iso_datetime(iso_string):
    """Parse une date ISO 8601 en datetime."""
    try:
        # Gérer différents formats
        iso_string = iso_string.replace("Z", "+00:00")
        if "." in iso_string:
            # Avec millisecondes
            return datetime.fromisoformat(iso_string)
        else:
            return datetime.fromisoformat(iso_string)
    except Exception:
        return None


def estimate_train_positions(departures, terminus_info):
    """
    Estime les positions des trains basées sur les départs récents.
    Utilise une interpolation linéaire entre les stations.
    """
    vehicles = []
    now = datetime.now().astimezone()
    stations = get_stations_dict()

    for departure in departures:
        departure_time = parse_iso_datetime(departure["departure_time"])
        if not departure_time:
            continue

        # Calculer le temps écoulé depuis le départ (ou temps avant départ si négatif)
        time_diff = (now - departure_time).total_seconds()

        # On s'intéresse aux trains partis il y a moins de 5 minutes
        # ou qui partiront dans moins de 3 minutes
        if time_diff > 300 or time_diff < -180:
            continue

        line = departure["line"]
        station_id = departure["station_id"]
        destination = departure["destination"]

        # Récupérer les coordonnées de la station de départ
        station = stations.get(station_id)
        if not station:
            # Utiliser les coordonnées du terminus
            for tid, tname, tlat, tlng in terminus_info.get(line, []):
                if tid == station_id:
                    station = {"lat": tlat, "lng": tlng, "name": tname}
                    break

        if not station:
            continue

        # Estimer la position
        if time_diff <= 0:
            # Train pas encore parti - position à la station
            est_lat = station["lat"]
            est_lng = station["lng"]
            status = "STOPPED_AT"
        else:
            # Train en route - interpolation simple
            # On estime qu'un train parcourt ~500m par segment de 90 secondes
            # Vitesse moyenne ~20 km/h soit ~0.0056 deg/min latitude
            progress = min(time_diff / AVERAGE_TRAVEL_TIME, 1.0)

            # Direction approximative basée sur la destination
            # (simplification: on déplace légèrement vers le centre de Paris)
            center_lat, center_lng = 48.8566, 2.3522

            direction_lat = (center_lat - station["lat"]) * 0.1
            direction_lng = (center_lng - station["lng"]) * 0.1

            est_lat = station["lat"] + direction_lat * progress
            est_lng = station["lng"] + direction_lng * progress
            status = "IN_TRANSIT"

        # Créer un ID unique pour le véhicule
        vehicle_id = departure.get("vehicle_ref") or f"{line}_{station_id}_{departure_time.isoformat()}"

        # Calculer l'heure d'arrivée estimée au terminus
        # Estimation basée sur le nombre moyen de stations (15 stations par ligne en moyenne)
        # avec 90 secondes par station
        avg_stations_to_terminus = 15
        travel_time_to_terminus = avg_stations_to_terminus * AVERAGE_TRAVEL_TIME
        estimated_arrival = departure_time + timedelta(seconds=travel_time_to_terminus)

        # Nom de la station d'origine
        origin_name = station.get("name", "") if isinstance(station, dict) else ""
        if not origin_name:
            # Chercher dans TERMINUS_STATIONS
            for tid, tname, tlat, tlng in terminus_info.get(line, []):
                if tid == station_id:
                    origin_name = tname
                    break

        vehicles.append({
            "id": vehicle_id,
            "line": line,
            "color": METRO_COLORS.get(line, "#000000"),
            "lat": est_lat,
            "lng": est_lng,
            "bearing": None,
            "speed": 40 if status == "IN_TRANSIT" else 0,
            "stop_id": station_id if status == "STOPPED_AT" else None,
            "current_status": status,
            "destination": destination,
            "origin_station": origin_name,
            "departure_time": departure_time.isoformat(),
            "estimated_arrival": estimated_arrival.strftime("%H:%M")
        })

    return vehicles


def get_realtime_vehicle_positions():
    """
    Récupère les positions en temps réel des véhicules via l'API SIRI-Lite.
    Interroge les terminus de chaque ligne et estime les positions des trains.
    Utilise un cache pour respecter la limite de 1000 requêtes/jour.
    """
    global _departures_cache

    if not IDFM_API_KEY:
        return {"error": "Clé API IDFM non configurée", "vehicles": []}

    now = datetime.now()

    # Vérifier si le cache est encore valide
    cache_valid = (
        _departures_cache["timestamp"] is not None and
        (now - _departures_cache["timestamp"]).total_seconds() < CACHE_DURATION_SECONDS and
        len(_departures_cache["data"]) > 0
    )

    if not cache_valid:
        all_departures = []

        # Interroger chaque terminus
        for line, terminus_list in TERMINUS_STATIONS.items():
            for station_id, station_name, lat, lng in terminus_list:
                departures = fetch_stop_departures(station_id)
                all_departures.extend(departures)

        # Mettre à jour le cache même si vide (pour éviter les requêtes répétées)
        _departures_cache["data"] = all_departures
        _departures_cache["timestamp"] = now

        if not all_departures:
            return {
                "error": "Aucune donnée de départ disponible (limite API atteinte?)",
                "vehicles": [],
                "cache_info": "Données non disponibles, réessayez dans 2 minutes"
            }
    else:
        all_departures = _departures_cache["data"]

    # Estimer les positions avec les données actuelles
    vehicles = estimate_train_positions(all_departures, TERMINUS_STATIONS)

    # Dédupliquer par vehicle_id
    unique_vehicles = {}
    for v in vehicles:
        vid = v["id"]
        if vid not in unique_vehicles:
            unique_vehicles[vid] = v

    cache_age = (now - _departures_cache["timestamp"]).total_seconds() if _departures_cache["timestamp"] else 0

    return {
        "vehicles": list(unique_vehicles.values()),
        "cache_age_seconds": int(cache_age)
    }


def get_line_reports():
    """Récupère les informations sur l'état des lignes."""
    if not IDFM_API_KEY:
        return {"error": "Clé API IDFM non configurée", "reports": []}

    headers = {
        "apiKey": IDFM_API_KEY,
        "Accept": "application/json"
    }

    reports = []

    try:
        for line_name, line_id in METRO_LINE_IDS.items():
            url = f"https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/lines/{line_id}/line_reports"
            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                data = response.json()
                if 'line_reports' in data:
                    for report in data['line_reports']:
                        reports.append({
                            "line": line_name,
                            "color": METRO_COLORS.get(line_name, "#000000"),
                            "status": report.get('status', 'unknown'),
                            "pt_objects": report.get('pt_objects', [])
                        })
    except Exception as e:
        return {"error": str(e), "reports": []}

    return {"reports": reports}


@app.route('/')
def index():
    """Page principale avec la carte."""
    return render_template('index.html',
                         metro_colors=METRO_COLORS,
                         has_api_key=bool(IDFM_API_KEY))


@app.route('/api/lines')
def api_lines():
    """API pour récupérer les tracés des lignes de métro."""
    return jsonify(get_metro_lines_geojson())


@app.route('/api/stations')
def api_stations():
    """API pour récupérer les stations de métro."""
    return jsonify(get_metro_stations_geojson())


@app.route('/api/vehicles')
def api_vehicles():
    """API pour récupérer les positions en temps réel des véhicules."""
    return jsonify(get_realtime_vehicle_positions())


@app.route('/api/colors')
def api_colors():
    """API pour récupérer les couleurs des lignes."""
    return jsonify(METRO_COLORS)


@app.route('/api/status')
def api_status():
    """API pour vérifier le statut de la connexion."""
    return jsonify({
        "api_configured": bool(IDFM_API_KEY),
        "metro_lines": list(METRO_LINE_IDS.keys())
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
