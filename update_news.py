

```python
import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime


RSS_URL = "https://www.espn.com/espn/rss/nba/news"

OUTPUT_FILE = "news.json"

MAX_ARTICLES = 12


def clean_text(text):
    if not text:
        return ""

    return " ".join(text.split())


def get_text(element, tag):
    child = element.find(tag)

    if child is None:
        return ""

    return clean_text(child.text)


def download_rss():

    request = urllib.request.Request(
        RSS_URL,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/rss+xml, application/xml, text/xml, */*"
        }
    )

    with urllib.request.urlopen(
        request,
        timeout=30
    ) as response:

        data = response.read()

        print(
            f"📥 Flux RSS reçu : {len(data)} octets"
        )

        if not data:
            raise RuntimeError(
                "❌ Le flux RSS est complètement vide."
            )

        return data


def format_date(date_string):

    if not date_string:
        return ""

    try:

        date = parsedate_to_datetime(
            date_string
        )

        return date.astimezone(
            timezone.utc
        ).isoformat()

    except Exception:

        return date_string


def parse_news(xml_data):

    print(
        f"📦 Taille des données reçues : {len(xml_data)} octets"
    )

    print(
        f"🔎 Début des données : {xml_data[:300]!r}"
    )

    if not xml_data:
        raise RuntimeError(
            "❌ Le flux RSS est complètement vide."
        )

    try:

        root = ET.fromstring(
            xml_data
        )

    except ET.ParseError as error:

        print(
            "❌ Les données reçues ne sont pas un XML valide."
        )

        print(
            f"Erreur XML : {error}"
        )

        raise

    channel = root.find(
        "channel"
    )

    if channel is None:
        print(
            "⚠️ Aucun élément channel trouvé dans le flux RSS."
        )
        return []

    articles = []

    for item in channel.findall(
        "item"
    ):

        title = get_text(
            item,
            "title"
        )

        description = get_text(
            item,
            "description"
        )

        link = get_text(
            item,
            "link"
        )

        date = get_text(
            item,
            "pubDate"
        )

        if not title or not link:
            continue

        articles.append({

            "title": title,

            "description": description,

            "link": link,

            "date": format_date(
                date
            ),

            "source": "ESPN"

        })

    return articles[
        :MAX_ARTICLES
    ]


def save_news(articles):

    data = {

        "updated":
            datetime.now(
                timezone.utc
            ).isoformat(),

        "articles":
            articles

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


def main():

    print(
        "🏀 Basket Zone"
    )

    print(
        "📰 Récupération des actualités NBA..."
    )

    xml_data = download_rss()

    articles = parse_news(
        xml_data
    )

    print(
        f"✅ {len(articles)} actualités trouvées."
    )

    save_news(
        articles
    )

    print(
        "💾 news.json mis à jour."
    )


if __name__ == "__main__":
    main()
```

