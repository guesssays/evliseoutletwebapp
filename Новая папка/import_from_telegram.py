# import_from_telegram.py
import os, re, json, asyncio
from pathlib import Path
from datetime import datetime
from slugify import slugify
from telethon import TelegramClient
from telethon.tl.types import MessageMediaPhoto

# ====== НАСТРОЙКИ ======
API_ID    = int(os.getenv("TG_API_ID",   "24465524"))
API_HASH  =     os.getenv("TG_API_HASH", "b475725744e93b8d38aaa802b19b7d1e")
CHANNEL   =     os.getenv("TG_CHANNEL",  "evliseoutlet")  # без @

OUT_DIR   = Path("data")
IMG_ROOT  = OUT_DIR / "wearimages"       # <-- складываем сюда
JSON_PATH = OUT_DIR / "products.json"

# сколько последних постов/альбомов тянуть
N_GROUPS  = int(os.getenv("TG_LIMIT_GROUPS", "30"))

# ====== ПАРСИНГ ТЕКСТА ======
PRICE_RE = re.compile(r"(?:цена|price)\s*[:\-]?\s*([\d\s\.,]+)\s*(?:сум|uzs|₽|руб|rub|$)", re.I)

def parse_price(text: str) -> int | None:
    if not text:
        return None
    m = PRICE_RE.search(text)
    if not m:
        return None
    raw = m.group(1)
    norm = (raw.replace(" ", "")
                .replace("\u00A0", "")
                .replace(".", "")
                .replace(",", ""))
    try:
        return int(norm)
    except ValueError:
        return None

def parse_title(text: str) -> str:
    if not text:
        return "Товар"
    for line in text.splitlines():
        s = line.strip()
        if s:
            return s
    return "Товар"

# ====== JSON ======
def empty_catalog():
    return {
        "products": [],
        "categories": [{"id": "new", "slug": "new", "name": "Новинки"}]
    }

def save_catalog(data):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ====== ХЕЛПЕРЫ ======
def unique_slug(base_slug: str, taken: set[str], suffix: str) -> str:
    """
    Возвращает уникальный slug. Если base_slug уже занят,
    пробуем base_slug-<suffix>.
    """
    if base_slug not in taken:
        taken.add(base_slug)
        return base_slug
    candidate = f"{base_slug}-{suffix}"
    taken.add(candidate)
    return candidate

def build_product(pid: int, title: str, price: int | None, slug: str, images: list[str], text: str):
    return {
        "id": str(pid),
        "slug": slug,
        "title": title,
        "price": price or 0,
        "images": images,
        "realPhotos": images[1:],   # все, кроме первой
        "description": text or "",
        "material": "Хлопок/полиэстер",
        "colors": [],
        "sizes": ["S","M","L","XL"],
        "category": "Новинки",
        "sizeChart": {
            "headers": ["INT","Грудь (см)","Рукав (см)","Длина (см)","Рост (см)","Вес (кг)"],
            "rows": [
                ["S","96–100","62","66","160–170","50–62"],
                ["M","100–104","64","68","168–176","60–72"],
                ["L","104–110","66","70","174–182","70–86"],
                ["XL","110–116","68","72","180–188","84–100"]
            ]
        }
    }

# ====== ЭКСПОРТ ОДНОЙ ГРУППЫ ======
async def export_group(client, gid: int, msgs: list, catalog: dict, used_slugs: set[str]) -> bool:
    # упорядочим фото внутри группы и возьмём текст из первого сообщения
    msgs.sort(key=lambda m: m.id)
    base = msgs[0]
    text  = base.message or ""
    title = parse_title(text)
    price = parse_price(text)

    # базовый slug по заголовку
    base_slug = slugify(title) or f"item-{gid}"
    # делаем уникальным (на всякий случай)
    slug = unique_slug(base_slug, used_slugs, str(gid))

    # конечная папка и имена файлов
    item_dir = IMG_ROOT / slug
    item_dir.mkdir(parents=True, exist_ok=True)

    images: list[str] = []
    idx = 1
    for m in msgs:
        if isinstance(m.media, MessageMediaPhoto):
            out_file = item_dir / f"{slug}-{idx}.jpg"
            await client.download_media(m, file=str(out_file))
            # путь в JSON — относительный, как у вас раньше
            images.append(str((Path("data") / "wearimages" / slug / f"{slug}-{idx}.jpg").as_posix()))
            idx += 1

    if not images:
        return False

    product = build_product(gid, title, price, slug, images, text)
    catalog["products"].append(product)
    return True

# ====== MAIN ======
async def main():
    catalog = empty_catalog()           # пересобираем JSON с нуля
    IMG_ROOT.mkdir(parents=True, exist_ok=True)

    # на всякий случай подчистим пустые каталоги внутри wearimages (не удаляем существующие фото)
    used_slugs: set[str] = set()

    async with TelegramClient("tg_session", API_ID, API_HASH) as client:
        print(f"Читаю канал @{CHANNEL} …")

        # собираем группы: ключ = grouped_id (или msg.id для одиночных фото)
        groups: dict[int, dict] = {}
        LIMIT_MESSAGES = max(200, N_GROUPS * 12)  # с запасом

        seen = 0
        async for msg in client.iter_messages(CHANNEL, limit=LIMIT_MESSAGES):
            seen += 1
            if msg.grouped_id or isinstance(msg.media, MessageMediaPhoto):
                gid = msg.grouped_id or msg.id
                bucket = groups.setdefault(gid, {"msgs": [], "first_id": msg.id})
                bucket["msgs"].append(msg)
                if msg.id < bucket["first_id"]:
                    bucket["first_id"] = msg.id
            if seen % 25 == 0:
                print(f"  просмотрено сообщений: {seen}")

        ordered = sorted(groups.items(), key=lambda kv: kv[1]["first_id"], reverse=True)
        selected = ordered[:N_GROUPS]
        print(f"Найдено групп/постов: {len(ordered)}; обрабатываю последние {len(selected)}.")

        added = 0
        for n, (gid, data) in enumerate(selected, 1):
            try:
                ok = await export_group(client, gid, data["msgs"], catalog, used_slugs)
                if ok:
                    added += 1
                if n % 5 == 0:
                    print(f"  обработано групп: {n}/{len(selected)} (добавлено {added})")
            except Exception as e:
                print(f"  ⚠️ ошибка на группе {gid}: {e}")

        # новые — первыми
        catalog["products"].sort(key=lambda p: int(p["id"]), reverse=True)
        save_catalog(catalog)

        print(f"Готово. Новых товаров: {added}")
        print(f"JSON: {JSON_PATH.resolve()}")
        print(f"Изображения: {IMG_ROOT.resolve()}")

if __name__ == "__main__":
    asyncio.run(main())
