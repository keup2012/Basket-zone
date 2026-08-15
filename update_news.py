import json
import urllib.request
from datetime import datetime, timezone


# ============================================================
# CONFIGURATION
# ============================================================

NBA_URL = (
    "https://stats.nba.com/stats/leaguestandings"
    "?LeagueID=00"
    "&Season=2025-26"
    "&SeasonType=Regular%20Season"
)

OUTPUT_FILE = "standings.json"


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
# REQUÊTE NBA
# ============================================================

def download_standings():

    print("🏀 Connexion à NBA Stats...")

    headers = {
        "User-Agent": (
            "Mozilla/5.0 "
            "(Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 "
            "(KHTML, like Gecko) "
            "Chrome/149.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.nba.com/",
        "Origin": "https://www.nba.com"
    }

    request = urllib.request.Request(
        NBA_URL,
        headers=headers
    )

    with urllib.request.urlopen(
        request,
        timeout=30
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

    # Classement par pourcentage de victoire
    east.sort(
        key=lambda team: (
            float(team["percentage"])
        ),
        reverse=True
    )

    west.sort(
        key=lambda team: (
            float(team["percentage"])
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

    output = {

        "season": "2025-2026",

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


if __name__ == "__main__":
    main()
