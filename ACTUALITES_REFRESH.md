# Actualités — refresh

- GitHub Actions : mise à jour des actualités toutes les 30 minutes.
- Navigateur : relecture de `news.json` toutes les 30 minutes avec `cache: no-store`.
- Bouton « Actualiser » ajouté avec un cooldown de 5 minutes par navigateur.
- Le bouton est désactivé pendant la requête et ne crée pas de boucle de requêtes.
- En cas d'échec, le message est affiché sans multiplier les tentatives.
- Le refresh manuel ne force pas GitHub Actions à exécuter le scraper : il recharge les données déjà publiées dans `news.json`.
