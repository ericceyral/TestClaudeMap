# Métro Paris - Temps Réel

Application web interactive affichant les trajets du métro parisien en temps réel sur une carte Leaflet.

## Fonctionnalités

- Carte interactive avec les 16 lignes du métro parisien
- Positions des trains en temps réel (avec clé API IDFM)
- Affichage des stations avec popup d'informations
- Filtrage par ligne de métro
- Interface responsive (desktop et mobile)
- Mise à jour automatique toutes les 30 secondes

## Prérequis

- Python 3.8+
- Clé API Île-de-France Mobilités (optionnelle, pour les données temps réel)

## Installation

1. Cloner le dépôt :
```bash
git clone <url-du-repo>
cd TestClaudeMap
```

2. Créer un environnement virtuel :
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate  # Windows
```

3. Installer les dépendances :
```bash
pip install -r requirements.txt
```

4. (Optionnel) Configurer la clé API IDFM :
```bash
cp .env.example .env
# Éditer .env et ajouter votre clé API
```

## Obtenir une clé API IDFM

1. Rendez-vous sur [PRIM IDFM](https://prim.iledefrance-mobilites.fr/)
2. Créez un compte
3. Souscrivez à l'API "Vehicle Positions"
4. Copiez votre clé API dans le fichier `.env`

## Lancement

```bash
python app.py
```

L'application sera accessible sur http://localhost:5000

## Structure du projet

```
TestClaudeMap/
├── app.py                 # Application Flask
├── requirements.txt       # Dépendances Python
├── .env.example          # Exemple de configuration
├── .gitignore
├── README.md
├── data/
│   ├── metro_lines.geojson    # Tracés des lignes
│   └── metro_stations.geojson # Stations de métro
├── static/
│   ├── css/
│   │   └── style.css     # Styles CSS responsive
│   └── js/
│       └── metro.js      # Logique JavaScript
└── templates/
    └── index.html        # Page principale
```

## Technologies utilisées

- **Backend** : Flask, Python
- **Frontend** : HTML5, CSS3, JavaScript
- **Cartographie** : Leaflet.js
- **Données** : Île-de-France Mobilités (GTFS-RT)

## Licence

MIT
