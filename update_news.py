
import json
import urllib.request
import urllib.parse
from html.parser import HTMLParser
from datetime import datetime, timezone


NBA_URL = "https://www.nba.com/news"
OUTPUT_FILE = "news.json"
MAX_ARTICLES = 12


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

        if href.startswith("/news/"):

            self.current_link = href
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
            " ".join(self.current_text).split()
        )

        if title:

            link = urllib.parse.urljoin(
                NBA_URL,
                self.current_link
            )

            article = {
                "title": title,
                "description": "",
                "link": link,
                "date": "",
                "source": "NBA.com"
            }

            already_exists = any(
                item["link"] == link
                for item in self.articles
            )

            if not already_exists:
                self.articles.append(article)

        self.current_link = None
        self.current_text = []


def download_nba_news():

    print("🏀 Connexion à NBA.com...")

    request = urllib.request.Request(
        NBA_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 "
                "(Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 "
                "Chrome/149.0 Safari/537.36"
            ),
            "Accept": (
                "text/html,"
                "application/xhtml+xml,"
                "application/xml;q=0.9,"
                "*/*;q=0.8"
            ),
            "Accept-Language": "en-US,en;q=0.9"
        }
    )

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


def parse_news(html_data):

    print("🔎 Analyse de la page NBA.com...")

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
            "❌ Aucun article NBA trouvé sur NBA.com."
        )

    return articles[:MAX_ARTICLES]


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

    print("💾 news.json mis à jour.")


def main():

    print("🏀 Basket Zone")
    print("📰 Récupération des actualités NBA...")

    html_data = download_nba_news()

    articles = parse_news(
        html_data
    )

    print(
        f"✅ {len(articles)} actualités NBA trouvées."
    )

    save_news(articles)

    print("🎉 Mise à jour terminée.")


if __name__ == "__main__":
    main()



