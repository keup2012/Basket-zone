import json
import re
import urllib.request
from datetime import datetime, timezone
from html import unescape


NEWS_URL = "https://www.nba.com/news"

OUTPUT_FILE = "news.json"

MAX_ARTICLES = 12


def clean_text(text):

    if not text:
        return ""

    text = unescape(text)

    text = re.sub(
        r"<[^>]+>",
        " ",
        text
    )

    return " ".join(
        text.split()
    )


def download_page(url):

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent":
                "Mozilla/5.0 "
                "(Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 "
                "(KHTML, like Gecko) "
                "Chrome/120.0 Safari/537.36",

            "Accept":
                "text/html,application/xhtml+xml,"
                "application/xml;q=0.9,*/*;q=0.8",

            "Accept-Language":
                "en-US,en;q=0.9"
        }
    )

    with urllib.request.urlopen(
        request,
        timeout=30
    ) as response:

        return response.read().decode(
            "utf-8",
            errors="ignore"
        )


def get_article_image(url):

    try:

        html = download_page(
            url
        )

        patterns = [

            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',

            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',

            r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',

            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']'

        ]

        for pattern in patterns:

            match = re.search(
                pattern,
                html,
                re.IGNORECASE
            )

            if match:

                image_url = unescape(
                    match.group(1)
                )

                if image_url.startswith(
                    "http"
                ):

                    return image_url

        return ""

    except Exception as error:

        print(
            f"⚠️ Image introuvable : "
            f"{error}"
        )

        return ""


def extract_articles(html):

    articles = []

    pattern = re.compile(

        r'href=["\']'
        r'(/news/[^"\']+)'
        r'["\']'

    )

    links = []

    for match in pattern.finditer(
        html
    ):

        link = match.group(1)

        if link not in links:

            links.append(
                link
            )

    for link in links:

        if len(
            articles
        ) >= MAX_ARTICLES:

            break

        article_url = (
            "https://www.nba.com"
            + link
        )

        try:

            article_html = download_page(
                article_url
            )

            title = ""

            title_patterns = [

                r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',

                r'<title[^>]*>(.*?)</title>'

            ]

            for pattern_title in title_patterns:

                match = re.search(

                    pattern_title,

                    article_html,

                    re.IGNORECASE
                    | re.DOTALL

                )

                if match:

                    title = clean_text(

                        match.group(1)

                    )

                    break

            if not title:

                continue

            title = title.replace(
                " | NBA.com",
                ""
            )

            description = ""

            description_patterns = [

                r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',

                r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']'

            ]

            for pattern_description in description_patterns:

                match = re.search(

                    pattern_description,

                    article_html,

                    re.IGNORECASE
                    | re.DOTALL

                )

                if match:

                    description = clean_text(

                        match.group(1)

                    )

                    break

            image = get_article_image(
                article_url
            )

            articles.append({

                "title":
                    title,

                "description":
                    description,

                "link":
                    article_url,

                "date":
                    "",

                "source":
                    "NBA.com",

                "image":
                    image

            })

            print(
                f"📰 {title}"
            )

            if image:

                print(
                    "🖼️ Image trouvée"
                )

            else:

                print(
                    "⚠️ Aucune image trouvée"
                )

        except Exception as error:

            print(
                f"⚠️ Article ignoré : "
                f"{error}"
            )

    return articles


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

    try:

        html = download_page(
            NEWS_URL
        )

        articles = extract_articles(
            html
        )

        print(
            f"✅ {len(articles)} "
            f"actualités trouvées."
        )

        save_news(
            articles
        )

        print(
            "💾 news.json mis à jour."
        )

    except Exception as error:

        print(
            f"❌ ERREUR : {error}"
        )

        raise


if __name__ == "__main__":

    main()
