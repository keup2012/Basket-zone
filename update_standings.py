import json
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone


# ============================================================
# CONFIGURATION
# ============================================================

NBA_URL = "https://stats.nba.com/stats/leaguestandings"

OUTPUT_FILE = "standings.json"

# Nombre de tentatives en cas de problème de connexion
MAX_RETRIES = 3

# Délai d'attente par tentative
TIMEOUT = 60


# ============================================================
# ÉQUIPES NBA
# ============================================================

EAST_TEAMS = {
    "Atlanta Hawks",
    "Boston Celtics",
    "Brooklyn Nets",
    "Charlotte Hornets",
    "Chicago Bulls",
    "Cleveland Cavaliers",
    "Detroit Pistons",
    "Indiana Pacers",
    "Miami Heat",
    "Milwaukee Bucks",
    "New York Knicks",
    "Orlando Magic",
    "Philadelphia 76ers",
    "Toronto Raptors",
    "Washington Wizards"
}

WEST_TEAMS = {
    "Dallas Mavericks",
    "Denver Nuggets",
    "Golden State Warriors",
    "Houston Rockets",
    "LA Clippers",
    "Los Angeles Lakers",
    "Memphis Grizzlies",
    "Minnesota Timberwolves",
    "New Orleans Pelicans",
    "Oklahoma City Thunder",
    "Phoenix Suns",
    "Portland Trail Blazers",
    "Sacramento Kings",
    "San Antonio Spurs",
    "Utah Jazz"
}


# ============================================================
# SAISON NBA
# ============================================================

def get_current_season():

    now = datetime.now(timezone.utc)

    year = now.year

    # Avant octobre : intersaison précédant la prochaine saison
    if now.month >= 10:
        start_year = year
    else:
        start_year = year - 1

    end_year = start_year + 1

    return f"{start_year}-{str(end_year)[-2:]}"


# ============================================================
# REQUÊTE NBA
# ============================================================

def download_standings():

    season = get_current_season()

    print("🏀 Connexion à NBA Stats...")
    print("📅 Saison demandée :", season)

    params = (
        "?LeagueID=00"
        f"&Season={season}"
        "&SeasonType=Regular%20Season"
    )

    url = NBA_URL + params

    headers = {
        "User-Agent": (
            "Mozilla/5.0 "
            "(Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 "
            "(KHTML, like Gecko) "
            "Chrome/149.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.nba.com/",
        "Origin": "https://www.nba.com",
        "Connection": "keep-alive"
    }

    request = urllib.request.Request(
        url,
        headers=headers,
        method="GET"
    )

    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):

        print(
            f"🔄 Tentative {attempt}/{MAX_RETRIES}..."
        )

        try:

            with urllib.request.urlopen(
                request,
                timeout=TIMEOUT
            ) as response:

                data = response.read()

            print(
                "📥 Données reçues :",
                len(data),
                "octets"
            )

            if not data:

                raise RuntimeError(
                    "NBA Stats a retourné une réponse vide."
                )

            return json.loads(
                data.decode("utf-8")
            )

        except (
            urllib.error.URLError,
            TimeoutError
        ) as error:

            last_error = error

            print(
                "⚠️ Problème de connexion :",
                str(error)
            )

            if attempt < MAX_RETRIES:

                wait_time = attempt * 5

                print(
                    f"⏳ Nouvelle tentative dans {wait_time} secondes..."
                )

                time.sleep(wait_time)

        except json.JSONDecodeError as error:

            raise RuntimeError(
                "NBA Stats a retourné des données "
                "qui ne sont pas du JSON valide."
            ) from error

    raise RuntimeError(
        f"Impossible de récupérer le classement NBA après "
        f"{MAX_RETRIES} tentatives : {last_error}"
    )


# ============================================================
# TRANSFORMATION DES DONNÉES
# ============================================================

def parse_standings(data):

    result_sets = data.get(
        "resultSets",
        []
    )

    if not result_sets:

        raise RuntimeError(
            "Aucun resultSet trouvé dans la réponse NBA."
        )

    standings_set = None

    for result_set in result_sets:

        if (
            result_set.get("name")
            == "Standings"
        ):

            standings_set = result_set
            break

    if standings_set is None:

        raise RuntimeError(
            "Le tableau Standings est absent."
        )

    headers = standings_set.get(
        "headers",
        []
    )

    rows = standings_set.get(
        "rowSet",
        []
    )

    if not headers or not rows:

        raise RuntimeError(
            "Le classement NBA est vide."
        )

    print(
        "📊 Équipes reçues :",
        len(rows)
    )

    standings = []

    for row in rows:

        item = dict(
            zip(
                headers,
                row
            )
        )

        team_name = (
            item.get("TeamName")
            or item.get("TeamCity")
            or "Équipe inconnue"
        )

        wins = item.get(
            "WINS",
            0
        )

        losses = item.get(
            "LOSSES",
            0
        )

        win_pct = item.get(
            "WinPCT",
            0
        )

        standings.append(
            {
                "team": team_name,
                "wins": wins,
                "losses": losses,
                "percentage": win_pct
            }
        )

    return standings


# ============================================================
# CLASSEMENT EST / OUEST
# ============================================================

def create_conferences(standings):

    east = []
    west = []

    for team in standings:

        name = team["team"]

        if name in EAST_TEAMS:

            east.append(team)

        elif name in WEST_TEAMS:

            west.append(team)

        else:

            print(
                "⚠️ Équipe non reconnue :",
                name
            )

    east.sort(
        key=lambda team: float(
            team["percentage"]
        ),
        reverse=True
    )

    west.sort(
        key=lambda team: float(
            team["percentage"]
        ),
        reverse=True
    )

    for index, team in enumerate(
        east,
        start=1
    ):

        team["rank"] = index

    for index, team in enumerate(
        west,
        start=1
    ):

        team["rank"] = index

    return east, west


# ============================================================
# SAUVEGARDE
# ============================================================

def save_json(east, west):

    now = datetime.now(
        timezone.utc
    ).isoformat()

    season = get_current_season()

    output = {

        "season": season,

        "updated": now,

        "east": east,

        "west": west

    }

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            output,
            file,
            ensure_ascii=False,
            indent=2
        )

    print(
        "✅ standings.json mis à jour."
    )

    print(
        "🟢 Est :",
        len(east),
        "équipes"
    )

    print(
        "🔵 Ouest :",
        len(west),
        "équipes"
    )


# ============================================================
# PROGRAMME PRINCIPAL
# ============================================================

def main():

    print(
        "🏀 Mise à jour du classement NBA"
    )

    print(
        "================================"
    )

    now = datetime.now(
        timezone.utc
    )

    # ========================================================
    # INTERSAISON
    # ========================================================

    if now.month < 10:

        print(
            "⏸️ Intersaison NBA : aucun nouveau classement "
            "à télécharger pour le moment."
        )

        if os.path.exists(OUTPUT_FILE):

            print(
                "✅ standings.json existant conservé."
            )

            print(
                "🎉 Workflow terminé sans modification."
            )

            return

        raise RuntimeError(
            "standings.json n'existe pas encore."
        )

    # ========================================================
    # SAISON RÉGULIÈRE
    # ========================================================

    try:

        data = download_standings()

        standings = parse_standings(
            data
        )

        east, west = create_conferences(
            standings
        )

        if len(east) != 15:

            raise RuntimeError(
                "Le classement Est ne contient pas 15 équipes."
            )

        if len(west) != 15:

            raise RuntimeError(
                "Le classement Ouest ne contient pas 15 équipes."
            )

        save_json(
            east,
            west
        )

        print(
            "🎉 Mise à jour terminée."
        )

    except Exception as error:

        print(
            "❌ ERREUR :",
            str(error)
        )

        raise


# ============================================================
# LANCEMENT
# ============================================================

if __name__ == "__main__":
    main()
