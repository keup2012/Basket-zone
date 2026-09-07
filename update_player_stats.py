import json
import urllib.request
from datetime import datetime, timezone

# ============================================================
# 🏀 BASKET ZONE — STATISTIQUES DES 5 JOUEURS
# ============================================================

PLAYERS = {
    "wembanyama": {
        "name": "Victor Wembanyama",
        "id": "1641705"
    },
    "lebron": {
        "name": "LeBron James",
        "id": "2544"
    },
    "curry": {
        "name": "Stephen Curry",
        "id": "201939"
    },
    "giannis": {
        "name": "Giannis Antetokounmpo",
        "id": "203507"
    },
    "shai": {
        "name": "Shai Gilgeous-Alexander",
        "id": "1628983"
    }
}

# Saison actuelle à préparer.
# La saison 2026-2027 n'ayant pas encore commencé,
# aucune statistique de cette saison ne doit être inventée.
SEASON = "2026-27"

NBA_URL = "https://stats.nba.com/stats/playergamelog"

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nba.com/"
}


def get_player_stats(player_id):
    """
    Récupère les statistiques disponibles pour un joueur.
    Retourne None si aucune statistique de la saison n'est disponible.
    """

    params = (
        f"?PlayerID={player_id}"
        f"&Season={SEASON}"
        f"&SeasonType=Regular%20Season"
        f"&LeagueID=00"
    )

    request = urllib.request.Request(
        NBA_URL + params,
        headers=HEADERS
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))

        result_sets = data.get("resultSets", [])

        if not result_sets:
            return None

        headers = result_sets[0].get("headers", [])
        rows = result_sets[0].get("rowSet", [])

        if not rows:
            return None

        # Recherche des colonnes nécessaires
        try:
            pts_index = headers.index("PTS")
            reb_index = headers.index("REB")
            ast_index = headers.index("AST")
        except ValueError:
            return None

        # Calcul de la moyenne sur les matchs disponibles
        pts_values = []
        reb_values = []
        ast_values = []

        for row in rows:
            if len(row) <= max(pts_index, reb_index, ast_index):
                continue

            try:
                pts_values.append(float(row[pts_index]))
                reb_values.append(float(row[reb_index]))
                ast_values.append(float(row[ast_index]))
            except (TypeError, ValueError):
                continue

        if not pts_values:
            return None

        return {
            "pts": round(sum(pts_values) / len(pts_values), 1),
            "reb": round(sum(reb_values) / len(reb_values), 1),
            "ast": round(sum(ast_values) / len(ast_values), 1)
        }

    except Exception as error:
        print(f"⚠️ Impossible de récupérer les statistiques : {error}")
        return None


def main():
    print("🏀 BASKET ZONE — Mise à jour des statistiques")
    print(f"📅 Saison : {SEASON}")

    players_stats = {}

    for key, player in PLAYERS.items():
        print(f"\n🔎 {player['name']}")

        stats = get_player_stats(player["id"])

        if stats is None:
            print("ℹ️ Aucune statistique disponible pour cette saison.")
            players_stats[key] = {
                "name": player["name"],
                "pts": None,
                "reb": None,
                "ast": None
            }
        else:
            print(
                f"✅ PTS: {stats['pts']} | "
                f"REB: {stats['reb']} | "
                f"AST: {stats['ast']}"
            )

            players_stats[key] = {
                "name": player["name"],
                **stats
            }

    output = {
        "season": SEASON,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "players": players_stats
    }

    with open("player-stats.json", "w", encoding="utf-8") as file:
        json.dump(output, file, ensure_ascii=False, indent=2)

    print("\n✅ player-stats.json a été créé/mis à jour.")
    print("🏀 Mise à jour terminée.")


if __name__ == "__main__":
    main()
