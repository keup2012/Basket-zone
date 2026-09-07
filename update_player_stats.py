```python
import json
import urllib.request
import urllib.parse
import time
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

# ============================================================
# SAISON
# ============================================================

SEASON = "2026-27"

# La saison régulière 2026-27 commence le 20 octobre 2026.
SEASON_START = datetime(
    2026,
    10,
    20,
    tzinfo=timezone.utc
)

NBA_URL = "https://stats.nba.com/stats/playergamelog"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/151.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
    "Connection": "keep-alive"
}


# ============================================================
# VALEURS VIDES
# ============================================================

def empty_stats(player_name):
    return {
        "name": player_name,
        "pts": None,
        "reb": None,
        "ast": None
    }


# ============================================================
# RÉCUPÉRATION DES STATISTIQUES
# ============================================================

def get_player_stats(player_id):
    """
    Récupère les statistiques disponibles pour la saison 2026-27.

    Avant le début de la saison :
    -> aucune requête NBA n'est envoyée
    -> les statistiques restent à None

    Après le début de la saison :
    -> récupération des matchs du joueur
    -> calcul de la moyenne PTS / REB / AST
    """

    now = datetime.now(timezone.utc)

    # --------------------------------------------------------
    # La saison n'a pas encore commencé
    # --------------------------------------------------------

    if now < SEASON_START:
        print(
            "⏳ La saison 2026-27 n'a pas encore commencé."
        )
        return None

    params = urllib.parse.urlencode({
        "PlayerID": player_id,
        "Season": SEASON,
        "SeasonType": "Regular Season",
        "LeagueID": "00"
    })

    url = NBA_URL + "?" + params

    # --------------------------------------------------------
    # Plusieurs tentatives
    # --------------------------------------------------------

    for attempt in range(1, 4):

        print(
            f"🌐 Tentative {attempt}/3..."
        )

        request = urllib.request.Request(
            url,
            headers=HEADERS
        )

        try:

            with urllib.request.urlopen(
                request,
                timeout=60
            ) as response:

                raw_data = response.read()

            if not raw_data:
                raise RuntimeError(
                    "Réponse vide reçue de NBA.com"
                )

            data = json.loads(
                raw_data.decode("utf-8")
            )

            result_sets = data.get(
                "resultSets",
                []
            )

            if not result_sets:
                print(
                    "ℹ️ Aucun résultat retourné."
                )
                return None

            result = result_sets[0]

            headers = result.get(
                "headers",
                []
            )

            rows = result.get(
                "rowSet",
                []
            )

            if not rows:
                print(
                    "ℹ️ Aucun match disponible pour ce joueur."
                )
                return None

            # ------------------------------------------------
            # Recherche des colonnes
            # ------------------------------------------------

            try:

                pts_index = headers.index("PTS")
                reb_index = headers.index("REB")
                ast_index = headers.index("AST")

            except ValueError:

                print(
                    "⚠️ Colonnes PTS/REB/AST introuvables."
                )

                return None

            pts_values = []
            reb_values = []
            ast_values = []

            # ------------------------------------------------
            # Lecture des matchs
            # ------------------------------------------------

            for row in rows:

                if len(row) <= max(
                    pts_index,
                    reb_index,
                    ast_index
                ):
                    continue

                try:

                    pts = float(
                        row[pts_index]
                    )

                    reb = float(
                        row[reb_index]
                    )

                    ast = float(
                        row[ast_index]
                    )

                    pts_values.append(pts)
                    reb_values.append(reb)
                    ast_values.append(ast)

                except (
                    TypeError,
                    ValueError
                ):

                    continue

            if not pts_values:

                print(
                    "ℹ️ Aucun match exploitable."
                )

                return None

            # ------------------------------------------------
            # Moyennes
            # ------------------------------------------------

            return {
                "pts": round(
                    sum(pts_values)
                    / len(pts_values),
                    1
                ),
                "reb": round(
                    sum(reb_values)
                    / len(reb_values),
                    1
                ),
                "ast": round(
                    sum(ast_values)
                    / len(ast_values),
                    1
                )
            }

        except Exception as error:

            print(
                f"⚠️ Erreur tentative {attempt} : "
                f"{error}"
            )

            if attempt < 3:

                print(
                    "⏳ Nouvelle tentative dans 5 secondes..."
                )

                time.sleep(5)

    print(
        "❌ Impossible de récupérer les statistiques "
        "après 3 tentatives."
    )

    return None


# ============================================================
# PROGRAMME PRINCIPAL
# ============================================================

def main():

    print(
        "🏀 BASKET ZONE — Mise à jour "
        "des statistiques"
    )

    print(
        f"📅 Saison : {SEASON}"
    )

    players_stats = {}

    for key, player in PLAYERS.items():

        print(
            f"\n🔎 {player['name']}"
        )

        stats = get_player_stats(
            player["id"]
        )

        if stats is None:

            print(
                "ℹ️ Aucune statistique disponible "
                "pour cette saison."
            )

            players_stats[key] = empty_stats(
                player["name"]
            )

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

    # ========================================================
    # CRÉATION DE player-stats.json
    # ========================================================

    output = {
        "season": SEASON,
        "updated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "players": players_stats
    }

    with open(
        "player-stats.json",
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
        "\n✅ player-stats.json "
        "a été créé/mis à jour."
    )

    print(
        "🏀 Mise à jour terminée."
    )


if __name__ == "__main__":
    main()
```
