import json
import re
import urllib.request
from datetime import datetime, timezone
from html import unescape


# =========================
# CONFIGURATION
# =========================

NEWS_URL = "https://www.nba.com/news"

OUTPUT_FILE = "news.json"

MAX_ARTICLES = 12

TIMEOUT = 30


# =========================
# NETTOYAGE DU TEXTE
# =========================

def clean_text(text):

    if not text:
        return ""

    text = unescape(text)

    # Supprime les balises HTML
    text = re.sub(
        r"<[^>]+>",
        " ",
        text
    )

    # Supprime les espaces inutiles
    return " ".join(
        text.split()
    )


# =========================
# TÉLÉCHARGEMENT D'UNE PAGE
# =========================

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
                "text/html,"
                "application/xhtml+xml,"
                "application/xml;q=0.9,"
                "*/*;q=0.8",

            "Accept-Language":
                "en-US,en;q=0.9",

            "Referer":
                "https://www.nba.com/"

        }

    )

    with urllib.request.urlopen(

        request,

        timeout=TIMEOUT

    ) as response:

        return response.read().decode(

            "utf-8",

            errors="ignore"

        )


# =========================
# EXTRACTION D'UNE META TAG
# =========================

def get_meta_content(html, property_name):

    patterns = [

        # Exemple :
        # <meta property="og:title" content="Titre">

        rf'<meta[^>]+property=["\']'
        rf'{re.escape(property_name)}'
        rf'["\'][^>]+content=["\']'
        rf'([^"\']+)["\']',

        # Exemple :
        # <meta content="Titre" property="og:title">

        rf'<meta[^>]+content=["\']'
        rf'([^"\']+)["\'][^>]+property=["\']'
        rf'{re.escape(property_name)}'
        rf'["\']'

    ]

    for pattern in patterns:

        match = re.search(

            pattern,

            html,

            re.IGNORECASE
            | re.DOTALL

        )

        if match:

            return clean_text(

                match.group(1)

            )

    return ""


# =========================
# EXTRACTION DES DONNÉES
# D'UN ARTICLE
# =========================

def extract_article(article_url):

    try:

        print(
            f"🔎 Lecture : "
            f"{article_url}"
        )

        html = download_page(
            article_url
        )

        # =========================
        # TITRE
        # =========================

        title = get_meta_content(

            html,

            "og:title"

        )

        if not title:

            title_match = re.search(

                r"<title[^>]*>"
                r"(.*?)"
                r"</title>",

                html,

                re.IGNORECASE
                | re.DOTALL

            )

            if title_match:

                title = clean_text(

                    title_match.group(1)

                )

        # Supprime NBA.com à la fin
        title = title.replace(

            " | NBA.com",

            ""

        ).strip()

        if not title:

            print(
                "⚠️ Article ignoré : "
                "titre introuvable"
            )

            return None

        # =========================
        # DESCRIPTION
        # =========================

        description = get_meta_content(

            html,

            "og:description"

        )

        if not description:

            description = get_meta_content(

                html,

                "description"

            )

        # =========================
        # IMAGE
        # =========================

        image = get_meta_content(

            html,

            "og:image"

        )

        if not image:

            image = get_meta_content(

                html,

                "twitter:image"

            )

        # Vérifie que l'image
        # est bien une URL
        if not image.startswith(

            "http"

        ):

            image = ""

        # =========================
        # DATE
        # =========================

        date = get_meta_content(

            html,

            "article:published_time"

        )

        # =========================
        # ARTICLE FINAL
        # =========================

        article = {

            "title":
                title,

            "description":
                description,

            "link":
                article_url,

            "date":
                date,

            "source":
                "NBA.com",

            "image":
                image

        }

        print(
            f"📰 {title}"
        )

        if image:

            print(
                "🖼️ Image trouvée"
            )

        else:

            print(
                "⚠️ Image non trouvée"
            )

        return article

    except Exception as error:

        print(
            f"⚠️ Article ignoré : "
            f"{error}"
        )

        return None


# =========================
# EXTRACTION DES LIENS
# =========================

def extract_article_links(html):

    links = []

    pattern = re.compile(

        r'href=["\']'
        r'(/news/[^"\'?#]+)'
        r'["\']',

        re.IGNORECASE

    )

    for match in pattern.finditer(

        html

    ):

        link = match.group(1)

        # Ignore les liens inutiles
        if link in links:

            continue

        # Ignore la page générale
        if link == "/news":

            continue

        links.append(
            link
        )

    return links


# =========================
# RÉCUPÉRATION DES ARTICLES
# =========================

def get_news():

    print(
        "🌐 Téléchargement de NBA.com..."
    )

    html = download_page(
        NEWS_URL
    )

    links = extract_article_links(
        html
    )

    print(
        f"🔗 {len(links)} liens trouvés."
    )

    articles = []

    for link in links:

        if len(
            articles
        ) >= MAX_ARTICLES:

            break

        article_url = (

            "https://www.nba.com"

            + link

        )

        article = extract_article(

            article_url

        )

        if article:

            articles.append(

                article

            )

    return articles


# =========================
# SAUVEGARDE NEWS.JSON
# =========================

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


# =========================
# PROGRAMME PRINCIPAL
# =========================

def main():

    print(
        ""
    )

    print(
        "🏀 ========================="
    )

    print(
        "🏀 BASKET ZONE"
    )

    print(
        "🏀 ========================="
    )

    print(
        ""
    )

    print(
        "📰 Récupération des "
        "actualités NBA.com..."
    )

    try:

        articles = get_news()

        print(
            ""
        )

        print(
            f"✅ {len(articles)} "
            f"actualités récupérées."
        )

        # Ne remplace pas news.json
        # par un fichier vide
        if len(articles) == 0:

            raise RuntimeError(

                "Aucune actualité trouvée."

            )

        save_news(
            articles
        )

        print(
            ""
        )

        print(
            "💾 news.json mis à jour."
        )

        print(
            "🎉 Terminé avec succès !"
        )

    except Exception as error:

        print(
            ""
        )

        print(
            f"❌ ERREUR : "
            f"{error}"
        )

        raise


# =========================
# LANCEMENT
# =========================

if __name__ == "__main__":

    main()
