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
IMG_ROOT  = OUT_DIR / "telegram"
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
def ensure_json_skeleton():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not JSON_PATH.exists():
        with open(JSON_PATH, "w", encoding="utf-8") as f:
            json.dump({"products": [], "categories": []}, f, ensure_ascii=False, indent=2)

def load_catalog():
    ensure_json_skeleton()
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def save_catalog(data):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def product_exists(catalog, pid):
    return any(str(p.get("id")) == str(pid) for p in catalog.get("products", []))

def as_product(pid, title, price, images, text):
    slug = slugify(title) or f"item-{pid}"
    return {
        "id": str(pid),
        "slug": slug,
        "title": title,
        "price": price or 0,
        "images": images,          # относительные пути
        "realPhotos": images[1:],  # дополнительные
        "description": text or "",
        "material": None,
        "colors": [],
        "sizes": [],
        "category": "Новинки"
    }

# ====== ЭКСПОРТ ГРУППЫ ======
async def export_group(client, gid, msgs, catalog) -> bool:
    # отсортируем внутри альбома, чтобы 1-я картинка была главной
    msgs.sort(key=lambda m: m.id)
    base = msgs[0]
    text  = base.message or ""
    title = parse_title(text)
    price = parse_price(text)

    # куда класть картинки
    item_dir = IMG_ROOT / str(gid)
    item_dir.mkdir(parents=True, exist_ok=True)

    images = []
    idx = 1
    for m in msgs:
        if isinstance(m.media, MessageMediaPhoto):
            out_path = item_dir / f"{idx}.jpg"
            await client.download_media(m, file=str(out_path))
            images.append(str(out_path.as_posix()))
            idx += 1

    if not images:
        return False

    prod = as_product(gid, title, price, images, text)
    if not product_exists(catalog, prod["id"]):
        catalog["products"].append(prod)
        # категории по умолчанию, если их ещё нет
        if not catalog.get("categories"):
            catalog["categories"] = [{"id":"new","slug":"new","name":"Новинки"}]
        # сортировка: новые выше
        catalog["products"].sort(key=lambda p: int(p["id"]), reverse=True)
        save_catalog(catalog)  # сохраняем сразу, чтобы не потерять прогресс
        return True
    return False

# ====== MAIN ======
async def main():
    catalog = load_catalog()
    IMG_ROOT.mkdir(parents=True, exist_ok=True)

    async with TelegramClient("tg_session", API_ID, API_HASH) as client:
        print(f"Читаю канал @{CHANNEL} …")
        # Собираем сообщения (новые -> старые), группируя по grouped_id
        # Храним: {gid: {'msgs':[...], 'first_id':min_id}}
        groups: dict[int, dict] = {}

        # Берём небольшой запас сообщений (альбом = несколько msg),
        # затем обрежем до последних N_GROUPS групп.
        LIMIT_MESSAGES = max(200, N_GROUPS * 10)

        i = 0
        async for msg in client.iter_messages(CHANNEL, limit=LIMIT_MESSAGES):
            i += 1
            if msg.grouped_id or isinstance(msg.media, MessageMediaPhoto):
                gid = msg.grouped_id or msg.id
                bucket = groups.setdefault(gid, {"msgs": [], "first_id": msg.id})
                bucket["msgs"].append(msg)
                if msg.id < bucket["first_id"]:
                    bucket["first_id"] = msg.id
            if i % 25 == 0:
                print(f"  просмотрено сообщений: {i}")

        # Сортируем группы по первому id (новые первыми) и берём только N_GROUPS
        ordered = sorted(groups.items(), key=lambda kv: kv[1]["first_id"], reverse=True)
        selected = ordered[:N_GROUPS]
        print(f"Найдено групп/постов: {len(ordered)}; обрабатываю последние {len(selected)}.")

        added = 0
        for n, (gid, data) in enumerate(selected, 1):
            try:
                ok = await export_group(client, gid, data["msgs"], catalog)
                if ok:
                    added += 1
                if n % 5 == 0:
                    print(f"  обработано групп: {n}/{len(selected)} (добавлено {added})")
            except Exception as e:
                print(f"  ⚠️ ошибка на группе {gid}: {e}")

        print(f"Готово. Новых товаров: {added}")
        print(f"JSON: {JSON_PATH.resolve()}")
        print(f"Изображения: {IMG_ROOT.resolve()}")

if __name__ == "__main__":
    asyncio.run(main())
