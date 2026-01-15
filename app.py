"""
Application Flask pour visualiser le métro parisien en temps réel.
Utilise les données d'Île-de-France Mobilités (IDFM).
"""

import os
import json
import requests
from flask import Flask, render_template, jsonify
from dotenv import load_dotenv
from google.transit import gtfs_realtime_pb2

load_dotenv()

app = Flask(__name__)

# Clé API IDFM (à obtenir sur https://prim.iledefrance-mobilites.fr/)
IDFM_API_KEY = os.getenv('IDFM_API_KEY', '')

# URL de l'API IDFM pour les données temps réel
IDFM_GTFS_RT_URL = "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/line_reports/line_reports"
IDFM_VEHICLE_POSITIONS_URL = "https://prim.iledefrance-mobilites.fr/marketplace/vehicle-positions"

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


def get_realtime_vehicle_positions():
    """Récupère les positions en temps réel des véhicules via l'API IDFM."""
    if not IDFM_API_KEY:
        return {"error": "Clé API IDFM non configurée", "vehicles": []}

    headers = {
        "apiKey": IDFM_API_KEY,
        "Accept": "application/x-protobuf"
    }

    vehicles = []

    try:
        response = requests.get(
            IDFM_VEHICLE_POSITIONS_URL,
            headers=headers,
            timeout=10
        )

        if response.status_code == 200:
            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(response.content)

            for entity in feed.entity:
                if entity.HasField('vehicle'):
                    vehicle = entity.vehicle

                    # Extraire l'ID de la ligne
                    route_id = vehicle.trip.route_id if vehicle.HasField('trip') else ""

                    # Vérifier si c'est une ligne de métro
                    line_number = None
                    for num, idfm_id in METRO_LINE_IDS.items():
                        if idfm_id in route_id or route_id.endswith(num):
                            line_number = num
                            break

                    if line_number and vehicle.HasField('position'):
                        vehicles.append({
                            "id": entity.id,
                            "line": line_number,
                            "color": METRO_COLORS.get(line_number, "#000000"),
                            "lat": vehicle.position.latitude,
                            "lng": vehicle.position.longitude,
                            "bearing": vehicle.position.bearing if vehicle.position.HasField('bearing') else None,
                            "speed": vehicle.position.speed if vehicle.position.HasField('speed') else None,
                            "stop_id": vehicle.stop_id if vehicle.HasField('stop_id') else None,
                            "current_status": vehicle.current_status if vehicle.HasField('current_status') else None
                        })
        else:
            return {"error": f"Erreur API: {response.status_code}", "vehicles": []}

    except requests.exceptions.RequestException as e:
        return {"error": str(e), "vehicles": []}
    except Exception as e:
        return {"error": str(e), "vehicles": []}

    return {"vehicles": vehicles}


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
