import json
import re
import urllib.request
from datetime import datetime, timezone
from html import unescape
from urllib.parse import urljoin

REQUEST_TIMEOUT = 20
MAX_ARTICLES = 30

NEWS_URL = "https://www.nba.com/news"
OUTPUT_FILE = "news.json"
MAX_ARTICLES = 12
TIMEOUT = 30


def clean_text(text):
    if not text:
        return ""
    text = unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    return " ".join(text.split())


def download_page(url):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://www.nba.com/",
        },
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return response.read().decode("utf-8", errors="ignore")


def get_meta_content(html, *property_names):
    wanted = {name.lower() for name in property_names}
    # Handles both property/name before content and content before property/name.
    tag_pattern = re.compile(r"<meta\b[^>]*>", re.IGNORECASE | re.DOTALL)
    attr_pattern = re.compile(r"([\w:-]+)\s*=\s*([\"'])(.*?)\2", re.IGNORECASE | re.DOTALL)
    for tag in tag_pattern.findall(html):
        attrs = {m.group(1).lower(): unescape(m.group(3)) for m in attr_pattern.finditer(tag)}
        key = attrs.get("property") or attrs.get("name")
        if key and key.lower() in wanted and attrs.get("content"):
            return clean_text(attrs["content"])
    return ""


def get_jsonld_image(html):
    scripts = re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.IGNORECASE | re.DOTALL)
    for raw in scripts:
        try:
            data = json.loads(unescape(raw.strip()))
        except Exception:
            continue
        objects = data if isinstance(data, list) else [data]
        for obj in objects:
            if not isinstance(obj, dict):
                continue
            image = obj.get("image")
            if isinstance(image, str) and image.strip():
                return image.strip()
            if isinstance(image, dict) and isinstance(image.get("url"), str):
                return image["url"].strip()
            if isinstance(image, list):
                for item in image:
                    if isinstance(item, str) and item.strip():
                        return item.strip()
                    if isinstance(item, dict) and isinstance(item.get("url"), str):
                        return item["url"].strip()
    return ""


def get_embedded_image(html):
    # Next.js / CMS style JSON often contains an absolute image URL even when og:image is absent.
    patterns = [
        r'"image"\s*:\s*"(https?:\\?/\\?/[^"\\]+)"',
        r'"imageUrl"\s*:\s*"(https?:\\?/\\?/[^"\\]+)"',
        r'"thumbnailUrl"\s*:\s*"(https?:\\?/\\?/[^"\\]+)"',
        r'"url"\s*:\s*"(https?:\\?/\\?/[^"\\]+\.(?:jpg|jpeg|png|webp)(?:\?[^"\\]*)?)"',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            value = match.group(1).replace("\\/", "/")
            if "cdn.nba.com" in value or "nba.com" in value:
                return value
    return ""


def normalize_image_url(image, article_url):
    if not image:
        return ""
    image = unescape(image).strip().replace("\\/", "/")
    if image.startswith("//"):
        image = "https:" + image
    image = urljoin(article_url, image)
    if image.startswith("https://") or image.startswith("http://"):
        return image
    return ""


def extract_article(article_url):
    try:
        print(f"🔎 Lecture : {article_url}")
        html = download_page(article_url)

        title = get_meta_content(html, "og:title", "twitter:title")
        if not title:
            match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
            title = clean_text(match.group(1)) if match else ""
        title = title.replace(" | NBA.com", "").strip()
        if not title:
            return None

        description = get_meta_content(html, "og:description", "twitter:description", "description")
        image = get_meta_content(
            html,
            "og:image",
            "og:image:url",
            "og:image:secure_url",
            "twitter:image",
            "twitter:image:src",
        )
        if not image:
            image = get_jsonld_image(html)
        if not image:
            image = get_embedded_image(html)
        image = normalize_image_url(image, article_url)

        date = get_meta_content(html, "article:published_time", "datePublished")

        article = {
            "title": title,
            "description": description,
            "link": article_url,
            "date": date,
            "source": "NBA.com",
            "image": image,
        }

        print(f"📰 {title}")
        print("🖼️ Image trouvée" if image else "⚠️ Image non trouvée")
        return article
    except Exception as error:
        print(f"⚠️ Article ignoré : {error}")
        return None


def extract_article_links(html):
    links = []
    pattern = re.compile(r'href=["\'](/news/[^"\'?#]+)["\']', re.IGNORECASE)
    for match in pattern.finditer(html):
        link = match.group(1)
        if link == "/news" or link in links:
            continue
        links.append(link)
    return links


def get_news():
    print("🌐 Téléchargement de NBA.com...")
    html = download_page(NEWS_URL)
    links = extract_article_links(html)
    print(f"🔗 {len(links)} liens trouvés.")
    articles = []
    for link in links:
        if len(articles) >= MAX_ARTICLES:
            break
        article = extract_article(urljoin("https://www.nba.com", link))
        if article:
            articles.append(article)
    return articles


def save_news(articles):
    data = {
        "updated": datetime.now(timezone.utc).isoformat(),
        "articles": articles,
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=4)


def main():
    print("🏀 BASKET ZONE — actualités NBA")
    try:
        articles = get_news()
        if not articles:
            print("❌ Aucune actualité récupérée. Conservation de news.json existant.")
            return
        save_news(articles)
        print(f"✅ {len(articles)} articles enregistrés dans {OUTPUT_FILE}")
    except Exception as error:
        print(f"❌ Mise à jour impossible : {error}")


if __name__ == "__main__":
    main()
