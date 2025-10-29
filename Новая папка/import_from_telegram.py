# import_from_telegram.py
import os, re, json, asyncio
from pathlib import Path
from typing import Optional, List, Tuple
from slugify import slugify
from telethon import TelegramClient
from telethon.tl.types import MessageMediaPhoto
from PIL import Image

# ====== НАСТРОЙКИ ======
API_ID    = int(os.getenv("TG_API_ID",   "24465524"))
API_HASH  =     os.getenv("TG_API_HASH", "b475725744e93b8d38aaa802b19b7d1e")
CHANNEL   =     os.getenv("TG_CHANNEL",  "evliseapp")  # без @

OUT_DIR   = Path("data")
IMG_ROOT  = OUT_DIR / "wearimages"
JSON_PATH = OUT_DIR / "products.json"

# сколько сообщений максимум читать из канала.
# ставлю очень большое число, чтобы фактически это было "всё".
# если канал когда-нибудь станет на десятки тысяч постов — уменьшим.
LIMIT_MESSAGES_HARD = int(os.getenv("TG_LIMIT_MESSAGES", "5000"))

# ====== РЕГЕКСПЫ ДЛЯ ПАРСИНГА ======
PRICE_RE  = re.compile(r"(?:цена|price)\s*[:\-]?\s*([\d\s\.,]+)\s*(?:сум|uzs|₽|руб|rub|$)", re.I)
SIZES_RE  = re.compile(r"(?:размеры|sizes?)\s*[:\-]?\s*([^\n]+)", re.I)
COLORS_RE = re.compile(r"(?:цвета?|colors?)\s*[:\-]?\s*([^\n]+)", re.I)

DASHES = "–—-"
_RANGE_SEP_CLASS = r"[" + re.escape(DASHES + "-") + r"]"
RANGE_NUM_RE = re.compile(rf"^\s*(\d+)\s*{_RANGE_SEP_CLASS}\s*(\d+)\s*$")

CATEGORY_MAP = {
    "джинс": "Джинсы",
    "кардиган": "Кардиганы",
    "куртк": "Куртки",
    "кофта": "Кофты",
    "свит": "Свитшоты",
    "футбол": "Футболки",
    "штаны": "Штаны",
    "брюк": "Брюки",
    "плать": "Платья",
    "юбк": "Юбки",
    "рубаш": "Рубашки",
    "толстов": "Толстовки",
    "худи": "Худи",
    # обувь
    "ботин": "Ботинки",
    "кроссов": "Кроссовки",
    "кеды": "Кеды",
    "туфл": "Туфли",
    "сапог": "Сапоги",
    "сланц": "Сланцы",
    "шлёп": "Шлёпанцы",
    "шлеп": "Шлёпанцы",
    "обув": "Обувь",
    # аксессуары
    "сумк": "Сумки",
    "ремень": "Ремни",
    "кепк": "Кепки",
    "панам": "Панамы",
}
FOOTWEAR_KEYS = ("ботин", "кроссов", "кеды", "туфл", "сапог", "сланц", "шлёп", "шлеп", "обув")

# ====== ПАРСИНГ ПОЛЕЙ ======
def parse_price(text: str) -> Optional[int]:
    if not text:
        return None
    m = PRICE_RE.search(text)
    if not m:
        return None
    raw = m.group(1)
    norm = (
        raw.replace(" ", "")
           .replace("\u00A0", "")
           .replace(".", "")
           .replace(",", "")
    )
    try:
        return int(norm)
    except ValueError:
        return None

def first_meaningful_line(text: str) -> str:
    if not text:
        return "Товар"
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if SIZES_RE.search(s) or COLORS_RE.search(s) or PRICE_RE.search(s):
            continue
        return s
    return "Товар"

def parse_title(text: str) -> str:
    return first_meaningful_line(text)

def extract_category_from_title(title: str) -> Tuple[str, str]:
    """
    Возвращает (canonical_category_name, sizeChartType)
    sizeChartType: 'shoes' или 'clothes'
    """
    t = title.strip().lower()
    cat = "Новинки"

    # обувь детектим сразу
    is_shoes = any(k in t for k in FOOTWEAR_KEYS)

    # пытаемся найти знакомое слово категории в тексте
    for key, canon in CATEGORY_MAP.items():
        if key in t:
            cat = canon
            break
    else:
        # fallback: пробуем первое слово
        first_word = re.split(r"[\s,.:;\/|]+", t)[0]
        for key, canon in CATEGORY_MAP.items():
            if first_word.startswith(key):
                cat = canon
                break

    return cat, ("shoes" if is_shoes else "clothes")

def _split_csv_like(s: str) -> List[str]:
    raw = re.split(r"[,/;]| {2,}|\t|\u00A0", s)
    return [x.strip() for x in raw if x and x.strip()]

def parse_sizes(text: str) -> List[str]:
    """
    Берём строку после "Размеры:".
    Может быть "S, M, L, XL" или "36-45".
    """
    m = SIZES_RE.search(text or "")
    if not m:
        return []
    val = m.group(1).strip()

    # Попробовать как "36-45"
    r = RANGE_NUM_RE.match(val)
    if r:
        a, b = int(r.group(1)), int(r.group(2))
        if a <= b and b - a <= 30:
            return [str(i) for i in range(a, b + 1)]

    # Иначе CSV-like список
    out = []
    seen = set()
    for p in _split_csv_like(val):
        fixed = (
            p.replace("ХL", "XL")
             .replace("хl", "XL")
             .upper()
        )
        if fixed not in seen:
            seen.add(fixed)
            out.append(fixed)
    return out

def parse_colors(text: str) -> List[str]:
    m = COLORS_RE.search(text or "")
    if not m:
        return []
    out = []
    seen = set()
    for p in _split_csv_like(m.group(1)):
        p = p.strip().strip(".")
        if not p:
            continue
        norm = p[:1].upper() + p[1:].lower()
        if norm not in seen:
            seen.add(norm)
            out.append(norm)
    return out

# ====== JSON и ХЕЛПЕРЫ ======
def empty_catalog():
    return {
        "products": [],
        "categories": [{"id": "new", "slug": "new", "name": "Новинки"}]
    }

def ensure_category(catalog: dict, name: str):
    slug = slugify(name)
    for c in catalog["categories"]:
        if c["slug"] == slug:
            return
    catalog["categories"].append({"id": slug, "slug": slug, "name": name})

def save_catalog(data):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def unique_slug(base_slug: str, taken: set[str], suffix: str) -> str:
    if base_slug not in taken:
        taken.add(base_slug)
        return base_slug
    candidate = f"{base_slug}-{suffix}"
    taken.add(candidate)
    return candidate

def default_size_chart(kind: str):
    if kind == "shoes":
        return {
            "type": "shoes",
            "headers": ["EU", "Длина стопы (мм)"],
            "rows": [
                ["40","250"],["41","255"],["42","260"],
                ["43","265"],["44","270"],["45","280"]
            ],
        }
    return {
        "type": "clothes",
        "headers": [
            "INT","Грудь (см)","Рукав (см)",
            "Длина (см)","Рост (см)","Вес (кг)"
        ],
        "rows": [
            ["S","96–100","62","66","160–170","50–62"],
            ["M","100–104","64","68","168–176","60–72"],
            ["L","104–110","66","70","174–182","70–86"],
            ["XL","110–116","68","72","180–188","84–100"]
        ],
    }

def build_product(
    pid: int,
    title: str,
    price: Optional[int],
    slug: str,
    images: List[str],
    text: str,
    category_name: str,
    sizes: List[str],
    colors: List[str],
    size_chart_type: str,
    size_chart_imgs: List[str]
):
    return {
        "id": str(pid),
        "slug": slug,
        "title": title,
        "price": price or 0,
        "images": images,
        "realPhotos": images[1:],
        "description": text or "",
        "material": "Хлопок/полиэстер",
        "colors": colors,
        "sizes": sizes,
        "category": category_name,
        "sizeChartType": size_chart_type,    # 'clothes' | 'shoes'
        "sizeChartImages": size_chart_imgs,  # исходные картинки-таблицы (пока так)
        "sizeChart": default_size_chart(size_chart_type),
    }

# ====== ЭКСПОРТ ОДНОЙ ГРУППЫ ======
async def export_group(client, gid: int, msgs: list, catalog: dict, used_slugs: set[str]) -> bool:
    # сортируем фото внутри группы и берём текст из первого сообщения
    msgs.sort(key=lambda m: m.id)
    base = msgs[0]
    text  = base.message or ""
    title = parse_title(text)
    price = parse_price(text)
    sizes = parse_sizes(text)
    colors= parse_colors(text)

    # категория и тип размерной таблицы
    category_name, chart_type = extract_category_from_title(title)
    ensure_category(catalog, category_name)

    # базовый slug по заголовку
    base_slug = slugify(title) or f"item-{gid}"
    slug = unique_slug(base_slug, used_slugs, str(gid))

    # конечная папка и имена файлов
    item_dir = IMG_ROOT / slug
    item_dir.mkdir(parents=True, exist_ok=True)

    images: List[str] = []
    chart_candidates: List[str] = []
    idx = 1
    for m in msgs:
        if isinstance(m.media, MessageMediaPhoto):
            out_file = item_dir / f"{slug}-{idx}.jpg"
            await client.download_media(m, file=str(out_file))
            rel_path = (Path("data") / "wearimages" / slug / f"{slug}-{idx}.jpg").as_posix()
            images.append(rel_path)

            # Эвристика: таблица размеров часто "широкая"
            try:
                with Image.open(out_file) as im:
                    w, h = im.size
                    if w / max(1, h) >= 1.5:
                        chart_candidates.append(rel_path)
            except Exception:
                pass

            idx += 1

    if not images:
        return False

    size_chart_imgs = chart_candidates[-2:] if chart_candidates else []

    product = build_product(
        gid, title, price, slug, images, text,
        category_name, sizes, colors, chart_type, size_chart_imgs
    )
    catalog["products"].append(product)
    return True

# ====== MAIN ======
async def main():
    catalog = empty_catalog()
    IMG_ROOT.mkdir(parents=True, exist_ok=True)

    used_slugs: set[str] = set()

    async with TelegramClient("tg_session", API_ID, API_HASH) as client:
        print(f"Читаю канал @{CHANNEL} …")

        # собираем группы: ключ = grouped_id (альбом), иначе msg.id
        groups: dict[int, dict] = {}

        seen = 0
        async for msg in client.iter_messages(CHANNEL, limit=LIMIT_MESSAGES_HARD):
            seen += 1
            # нас интересуют только сообщения с медиа-фото (альбомы товаров)
            if msg.grouped_id or isinstance(msg.media, MessageMediaPhoto):
                gid = msg.grouped_id or msg.id
                bucket = groups.setdefault(gid, {"msgs": [], "first_id": msg.id})
                bucket["msgs"].append(msg)
                if msg.id < bucket["first_id"]:
                    bucket["first_id"] = msg.id

            if seen % 25 == 0:
                print(f"  просмотрено сообщений: {seen}")

        # сортируем группы по возрастанию или убыванию — нам удобнее от новых к старым
        ordered = sorted(groups.items(), key=lambda kv: kv[1]["first_id"], reverse=True)
        print(f"Найдено групп/постов: {len(ordered)}; обрабатываю все из них.")

        added = 0
        total = len(ordered)
        for n, (gid, data) in enumerate(ordered, 1):
            try:
                ok = await export_group(client, gid, data["msgs"], catalog, used_slugs)
                if ok:
                    added += 1
                if n % 5 == 0:
                    print(f"  обработано групп: {n}/{total} (добавлено {added})")
            except Exception as e:
                print(f"  ⚠️ ошибка на группе {gid}: {e}")

        # новые — первыми
        catalog["products"].sort(key=lambda p: int(p["id"]), reverse=True)
        save_catalog(catalog)

        print(f"Готово. Новых товаров (добавлено в JSON): {added}")
        print(f"JSON: {JSON_PATH.resolve()}")
        print(f"Изображения: {IMG_ROOT.resolve()}")

if __name__ == "__main__":
    asyncio.run(main())
