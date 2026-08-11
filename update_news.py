
import json
import urllib.request
import urllib.parse
from html.parser import HTMLParser
from datetime import datetime, timezone


NBA_URL = "https://www.nba.com/news"

OUTPUT_FILE = "news.json"

MAX_ARTICLES = 12


# Pages qui ne sont pas des articles classiques.
EXCLUDED_PATHS = {
    "/news",
    "/news/key-dates",
    "/news/schedule",
    "/news/trade-tracker",
}


# Titres génériques que nous voulons éviter.
EXCLUDED_WORDS = {
    "key dates",
    "trade tracker",
    "schedule",
}


class NBAParser(HTMLParser):

    def __init__(self):
        super().__init__()

        self.articles = []

        self.current_link = None

        self.current_text = []


    def handle_starttag(self, tag, attrs):

        if tag != "a":
            return

        attributes = dict(attrs)

        href = attributes.get("href")

        if not href:
            return

        # Seulement les liens d'articles NBA.
        if not href.startswith("/news/"):
            return

        # Nettoyage de l'URL.
        clean_href = href.split("?")[0]
        clean_href = clean_href.split("#")[0]

        # Exclusion des pages spéciales.
        if clean_href in EXCLUDED_PATHS:
            return

        self.current_link = clean_href

        self.current_text = []


    def handle_data(self, data):

        if self.current_link is not None:

            self.current_text.append(data)


    def handle_endtag(self, tag):

        if tag != "a":
            return

        if self.current_link is None:
            return

        title = " ".join(
            " ".join(
                self.current_text
            ).split()
        )

        link = urllib.parse.urljoin(
            NBA_URL,
            self.current_link
        )

        current_link = self.current_link

        self.current_link = None

        self.current_text = []

        # Titre trop court = probablement pas un article.
        if len(title) < 25:
            return

        title_lower = title.lower()

        # Évite les titres génériques.
        for word in EXCLUDED_WORDS:

            if word in title_lower:
                return

        # Évite certaines URL spéciales.
        for path in EXCLUDED_PATHS:

            if current_link == path:
                return

        # Vérification des doublons.
        already_exists = any(
            article["link"] == link
            for article in self.articles
        )

        if already_exists:
            return

        self.articles.append({
            "title": title,
            "description": "",
            "link": link,
            "date": "",
            "source": "NBA.com"
        })


def download_nba_news():

    print("🏀 Connexion à NBA.com...")

    request = urllib.request.Request(
        NBA_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 "
                "(Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 "
                "(KHTML, like Gecko) "
                "Chrome/149.0 Safari/537.36"
            ),
            "Accept": (
                "text/html,"
                "application/xhtml+xml,"
                "application/xml;q=0.9,"
                "*/*;q=0.8"
            ),
            "Accept-Language": (
                "fr-FR,fr;q=0.9,en;q=0.8"
            )
        }
    )

    try:

        with urllib.request.urlopen(
            request,
            timeout=30
        ) as response:

            data = response.read()

            print(
                f"📥 Page NBA reçue : {len(data)} octets"
            )

            if not data:

                raise RuntimeError(
                    "❌ NBA.com a renvoyé une page vide."
                )

            return data

    except Exception as error:

        raise RuntimeError(
            f"❌ Impossible de récupérer NBA.com : {error}"
        )


def parse_news(html_data):

    print(
        "🔎 Recherche des articles NBA..."
    )

    parser = NBAParser()

    parser.feed(
        html_data.decode(
            "utf-8",
            errors="ignore"
        )
    )

    articles = parser.articles

    print(
        f"📋 Articles trouvés : {len(articles)}"
    )

    if not articles:

        raise RuntimeError(
            "❌ Aucun article pertinent trouvé sur NBA.com."
        )

    articles = articles[:MAX_ARTICLES]

    print(
        "📰 Articles sélectionnés :"
    )

    for number, article in enumerate(
        articles,
        start=1
    ):

        print(
            f"{number}. {article['title']}"
        )

        print(
            f"   🔗 {article['link']}"
        )

    return articles


def save_news(articles):

    data = {
        "updated": datetime.now(
            timezone.utc
        ).isoformat(),

        "articles": articles
    }

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            data,
            file,
            ensure_ascii=False,
            indent=4
        )

    print(
        "💾 news.json mis à jour."
    )


def main():

    print(
        "🏀 Basket Zone"
    )

    print(
        "📰 Récupération des actualités NBA..."
    )

    html_data = download_nba_news()

    articles = parse_news(
        html_data
    )

    print(
        f"✅ {len(articles)} actualités pertinentes trouvées."
    )

    save_news(
        articles
    )

    print(
        "🎉 Mise à jour terminée."
    )


if __name__ == "__main__":
    main()


