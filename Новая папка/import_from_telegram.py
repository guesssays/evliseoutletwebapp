# import_from_telegram.py
import os, re, json, asyncio, copy
from pathlib import Path
from typing import Optional, List, Tuple, Dict
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

# сколько сообщений максимум читать из канала
LIMIT_MESSAGES_HARD = int(os.getenv("TG_LIMIT_MESSAGES", "5000"))

# ====== РЕГЕКСПЫ ДЛЯ ПАРСИНГА ======
PRICE_RE  = re.compile(r"(?:цена|price)\s*[:\-]?\s*([\d\s\.,]+)\s*(?:сум|uzs|₽|руб|rub|$)", re.I)
SIZES_RE  = re.compile(r"(?:размеры|sizes?)\s*[:\-]?\s*([^\n]+)", re.I)
COLORS_RE = re.compile(r"(?:цвета?|colors?)\s*[:\-]?\s*([^\n]+)", re.I)

DASHES = "–—-"
_RANGE_SEP_CLASS = r"[" + re.escape(DASHES + "-") + r"]"
RANGE_NUM_RE = re.compile(rf"^\s*(\d+)\s*{_RANGE_SEP_CLASS}\s*(\d+)\s*$")

# Маппинг "кусочек слова" -> каноническое имя категории
CATEGORY_MAP = {
    "джинс":   "Джинсы",
    "кардиган": "Кардиганы",
    "куртк":   "Куртки",
    "кофт":    "Кофты",
    "свитер":  "Свитеры",
    "свитш":   "Свитшоты",
    "футбол":  "Футболки",
    "штаны":   "Штаны",
    "брюк":    "Брюки",
    "плать":   "Платья",
    "юбк":     "Юбки",
    "рубаш":   "Рубашки",
    "толстов": "Толстовки",
    "худи":    "Худи",
    "зипк":    "Зипки",
    "поло":    "Поло",
    "плащ":    "Плащи",
    # обувь
    "ботин":   "Ботинки",
    "кроссов": "Кроссовки",
    "кеды":    "Кеды",
    "туфл":    "Туфли",
    "сапог":   "Сапоги",
    "сланц":   "Сланцы",
    "шлёп":    "Шлёпанцы",
    "шлеп":    "Шлёпанцы",
    "обув":    "Обувь",
    # аксессуары
    "сумк":    "Сумки",
    "ремень":  "Ремни",
    "кепк":    "Кепки",
    "панам":   "Панамы",
}

FOOTWEAR_KEYS = ("ботин", "кроссов", "кеды", "туфл", "сапог", "сланц", "шлёп", "шлеп", "обув")

# ====== БАЗОВОЕ ДЕРЕВО КАТЕГОРИЙ (как в products.json) ======
BASE_CATEGORIES = [
    {
        "id": "tops",
        "slug": "tops",
        "name": "Верх",
        "children": [
            {"slug": "kurtki",    "name": "Куртки"},
            {"slug": "khudi",     "name": "Худи"},
            {"slug": "svitshoty", "name": "Свитшоты"},
            {"slug": "svitery",   "name": "Свитеры"},
            {"slug": "zipki",     "name": "Зипки"},
            {"slug": "kozhanki",  "name": "Кожанки"},
            {"slug": "kardigany", "name": "Кардиганы"},
            {"slug": "polo",      "name": "Поло"},
            {"slug": "palto",     "name": "Пальто"},
            {"slug": "plashchi",  "name": "Плащи"},
            {"slug": "longslivy", "name": "Лонгсливы"},
            {"slug": "futbolki",  "name": "Футболки"},
        ],
    },
    {
        "id": "bottoms",
        "slug": "bottoms",
        "name": "Низ",
        "children": [
            {"slug": "dzhinsy", "name": "Джинсы"},
            {"slug": "shtany",  "name": "Штаны"},
            {"slug": "bryuki",  "name": "Брюки"},
        ],
    },
    {
        "id": "shoes",
        "slug": "shoes",
        "name": "Обувь",
        "children": [
            {"slug": "kedy",      "name": "Кеды"},
            {"slug": "krossovki", "name": "Кроссовки"},
            {"slug": "botinki",   "name": "Ботинки"},
            {"slug": "tufli",     "name": "Туфли"},
            {"slug": "sapogi",    "name": "Сапоги"},
        ],
    },
    {
        "id": "bags",
        "slug": "bags",
        "name": "Сумки",
        "children": [
            {"slug": "sumki", "name": "Сумки"},
        ],
    },
    {
        "id": "misc",
        "slug": "misc",
        "name": "Другое",
        "children": [],
    },
]


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
    """
    Первая НЕпустая строка, которая не содержит Размеры/Цвета/Цену.
    Обычно это "Штаны Shabby", "Сапоги Woollen" и т.п.
    """
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
    """
    Возвращает ТОЛЬКО название товара без категории.
    "Штаны Shabby"  -> "Shabby"
    "Сапоги Woollen"-> "Woollen"
    "AphexTwin"     -> "AphexTwin" (если нет категории в начале)
    """
    line = first_meaningful_line(text)
    parts = line.split()
    if len(parts) >= 2:
        first = parts[0]
        low_first = first.lower().strip(".,:;!?")
        for key in CATEGORY_MAP.keys():
            if low_first.startswith(key):
                name_only = " ".join(parts[1:]).strip()
                return name_only or line
    return line


def extract_category_from_title(title_line: str) -> Tuple[str, str]:
    """
    title_line — СЫРАЯ первая строка ("Штаны Shabby").
    Возвращает (canonical_category_name, sizeChartType)
    sizeChartType: 'shoes' или 'clothes'
    """
    t = title_line.strip().lower()
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
def empty_catalog() -> dict:
    """
    КАЖДЫЙ ЗАПУСК: начинаем с нуля.
    products = []
    categories = дерево, как в BASE_CATEGORIES.
    """
    return {
        "products": [],
        "categories": copy.deepcopy(BASE_CATEGORIES),
    }


def pretty_json(obj: dict, indent: int = 2) -> str:
    """
    Кастомный форматтер JSON:
    - словари с отступами
    - простые списки (str/int/float/bool/None) В ОДНУ СТРОКУ
    - списки списков (как sizeChart.rows) — по одной строке на подсписок
    - остальные списки (products, categories) — по одному элементу на строку
    """

    def _dump(value, level: int) -> str:
        pad = " " * (indent * level)
        pad_child = " " * (indent * (level + 1))

        # dict
        if isinstance(value, dict):
            if not value:
                return "{}"
            parts = []
            for k, v in value.items():  # порядок ключей сохраняется
                key_str = json.dumps(k, ensure_ascii=False)
                val_str = _dump(v, level + 1)
                parts.append(f"{pad_child}{key_str}: {val_str}")
            inner = ",\n".join(parts)
            return "{\n" + inner + "\n" + pad + "}"

        # list
        if isinstance(value, list):
            if not value:
                return "[]"

            # список "простых" значений — в одну строку
            if all(not isinstance(x, (dict, list)) for x in value):
                elems = ", ".join(json.dumps(x, ensure_ascii=False) for x in value)
                return "[" + elems + "]"

            # список списков простых значений — таблица (например, rows)
            if all(
                isinstance(row, list) and all(not isinstance(x, (dict, list)) for x in row)
                for row in value
            ):
                lines = []
                for row in value:
                    elems = ", ".join(json.dumps(x, ensure_ascii=False) for x in row)
                    lines.append(f"{pad_child}[" + elems + "]")
                return "[\n" + ",\n".join(lines) + "\n" + pad + "]"

            # общий случай: список объектов/сложных структур
            lines = []
            for item in value:
                lines.append(f"{pad_child}" + _dump(item, level + 1))
            return "[\n" + ",\n".join(lines) + "\n" + pad + "]"

        # скаляр
        return json.dumps(value, ensure_ascii=False)

    return _dump(obj, 0)


def save_catalog(data: dict):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    text = pretty_json(data, indent=2)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        f.write(text + "\n")


def unique_slug(base_slug: str, taken: set[str], suffix_seed: str) -> str:
    """
    Делаем уникальный slug внутри текущего запуска.
    Старый products.json НЕ учитываем — он каждый раз перезаписывается.
    """
    if base_slug not in taken:
        taken.add(base_slug)
        return base_slug
    i = 2
    candidate = f"{base_slug}-{i}"
    while candidate in taken:
        i += 1
        candidate = f"{base_slug}-{i}"
    taken.add(candidate)
    return candidate


def default_size_chart(kind: str):
    if kind == "shoes":
        return {
            "type": "shoes",
            "headers": ["EU", "Длина стопы (мм)"],
            "rows": [
                ["40", "250"], ["41", "255"], ["42", "260"],
                ["43", "265"], ["44", "270"], ["45", "280"],
            ],
        }
    return {
        "type": "clothes",
        "headers": [
            "INT", "Грудь (см)", "Рукав (см)",
            "Длина (см)", "Рост (см)", "Вес (кг)",
        ],
        "rows": [
            ["S",  "96–100", "62", "66", "160–170", "50–62"],
            ["M",  "100–104", "64", "68", "168–176", "60–72"],
            ["L",  "104–110", "66", "70", "174–182", "70–86"],
            ["XL", "110–116", "68", "72", "180–188", "84–100"],
        ],
    }


def build_category_indexes(catalog: dict) -> Dict[str, str]:
    """
    Строим индекс: название категории -> slug (categoryId).
    Берём из catalog["categories"][...]["children"][...]
    """
    by_name: Dict[str, str] = {}
    for group in catalog.get("categories", []):
        for child in group.get("children", []):
            name = child.get("name")
            slug = child.get("slug")
            if name and slug:
                by_name[name] = slug
    return by_name


def ensure_category_nested(
    catalog: dict,
    name: str,
    by_name: Dict[str, str],
) -> str:
    """
    Гарантирует, что категория с данным name есть в дереве категорий.
    Возвращает slug (categoryId) этой категории.

    Если категории ещё нет — добавляет её в подходящую группу.
    """
    if name in by_name:
        return by_name[name]

    lname = name.lower()
    # выбор родительской группы
    if any(k in lname for k in ("ботин", "кросс", "кеды", "туфл", "сапог", "сланц", "шлёп", "шлеп", "обув")):
        parent_id = "shoes"
    elif any(k in lname for k in ("джинс", "штаны", "брюк", "юбк", "шорт", "плать")):
        parent_id = "bottoms"
    elif any(k in lname for k in ("сумк", "рюкз")):
        parent_id = "bags"
    elif any(k in lname for k in ("ремн", "кепк", "панам", "аксесс")):
        parent_id = "misc"
    else:
        parent_id = "tops"

    slug = slugify(name)

    # ищем родителя
    parent = None
    for group in catalog.get("categories", []):
        if group.get("id") == parent_id:
            parent = group
            break

    if parent is None:
        parent = {"id": parent_id, "slug": parent_id, "name": parent_id, "children": []}
        catalog["categories"].append(parent)

    parent.setdefault("children", []).append({"slug": slug, "name": name})
    by_name[name] = slug
    return slug


def build_product(
    pid: int,
    title: str,
    price: Optional[int],
    slug: str,
    images: List[str],
    text: str,
    category_name: str,
    category_id: str,
    sizes: List[str],
    colors: List[str],
    size_chart_type: str,
    size_chart_imgs: List[str],
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
        "category": category_name,     # например "Куртки"
        "categoryId": category_id,     # например "kurtki"
        "sizeChartType": size_chart_type,    # 'clothes' | 'shoes'
        "sizeChartImages": size_chart_imgs,  # исходные картинки-таблицы (пока так)
        "sizeChart": default_size_chart(size_chart_type),
    }


# ====== ЭКСПОРТ ОДНОЙ ГРУППЫ ======
async def export_group(
    client,
    gid: int,
    msgs: list,
    catalog: dict,
    used_slugs: set[str],
    cat_name_to_slug: Dict[str, str],
) -> bool:
    # сортируем фото внутри группы
    msgs.sort(key=lambda m: m.id)

    # ИЩЕМ СООБЩЕНИЕ С ПОДПИСЬЮ
    base = None
    for m in msgs:
        if (m.message or "").strip():
            base = m
            break

    # если ни у одного нет текста (на всякий случай) — берём первое
    if base is None:
        base = msgs[0]

    text = base.message or ""

    # сырая первая строка (с категорией)
    raw_title_line = first_meaningful_line(text)
    # чистое название модели без категории
    title = parse_title(text)
    price = parse_price(text)
    sizes = parse_sizes(text)
    colors = parse_colors(text)

    # категория и тип размерной таблицы по СЫРОМУ заголовку
    category_name, chart_type = extract_category_from_title(raw_title_line)
    category_slug = ensure_category_nested(catalog, category_name, cat_name_to_slug)
    category_id = category_slug  # в товаре будет categoryId == slug

    # базовый slug по названию модели
    base_slug = slugify(title) or slugify(raw_title_line) or f"item-{gid}"
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
        gid,
        title,
        price,
        slug,
        images,
        text,
        category_name,
        category_id,
        sizes,
        colors,
        chart_type,
        size_chart_imgs,
    )
    catalog["products"].append(product)
    return True


# ====== MAIN ======
async def main():
    # КАЖДЫЙ ЗАПУСК начинаем с нуля
    catalog = empty_catalog()
    IMG_ROOT.mkdir(parents=True, exist_ok=True)

    used_slugs: set[str] = set()
    cat_name_to_slug = build_category_indexes(catalog)

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

        # сортируем группы от новых к старым
        ordered = sorted(groups.items(), key=lambda kv: kv[1]["first_id"], reverse=True)
        print(f"Найдено групп/постов: {len(ordered)}; обрабатываю все из них.")

        added = 0
        total = len(ordered)
        for n, (gid, data) in enumerate(ordered, 1):
            try:
                ok = await export_group(client, gid, data["msgs"], catalog, used_slugs, cat_name_to_slug)
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
