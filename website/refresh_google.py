#!/usr/bin/env python3
"""Refresh Google Maps photos + reviews for the DJ Carl marketing site."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMG_DIR = ROOT / "img" / "google"
SCRIPT_JS = ROOT / "script.js"
I18N_JS = ROOT / "i18n.js"
INDEX_HTML = ROOT / "index.html"

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE = Path("/tmp/chrome-djcarl-refresh")
PLACE_URL = (
    "https://www.google.com/maps/place/DJ+Carl/@53.8011982,-68.4348824,17z/"
    "data=!4m6!3m5!1s0x4721b1f503a55a07:0xa41ff7306ba6457c!8m2!3d53.8011982"
    "!4d-68.4348824!16s%2Fg%2F11yvyz299c?hl=fr"
)
PHOTOS_URL = (
    "https://www.google.com/maps/place/DJ+Carl/@53.8011982,-68.4348824,"
    "3a,75y,90t/data=!3m8!1e2!3m6!1sCIABIhCbYsG3Ci10Rc5ZQWkvVqux!2e10!3e12"
    "!4m18!1m8!3m7!1s0x4721b1f503a55a07:0xa41ff7306ba6457c!2sDJ+Carl!8m2"
    "!3d53.8011982!4d-68.4348824!10e5!16s%2Fg%2F11yvyz299c!3m8"
    "!1s0x4721b1f503a55a07:0xa41ff7306ba6457c!8m2!3d53.8011982!4d-68.4348824"
    "!10e5!14m1!1BCgIgAQ!16s%2Fg%2F11yvyz299c?hl=fr"
)

try:
    import websocket  # type: ignore
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "websocket-client", "-q"])
    import websocket  # type: ignore


class CDP:
    def __init__(self, ws_url: str):
        self.ws = websocket.create_connection(ws_url, timeout=30)
        self._id = 0

    def call(self, method: str, params: dict | None = None, timeout: float = 60.0):
        self._id += 1
        msg_id = self._id
        self.ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = self.ws.recv()
            data = json.loads(raw)
            if data.get("id") == msg_id:
                if "error" in data:
                    raise RuntimeError(f"{method}: {data['error']}")
                return data.get("result", {})
        raise TimeoutError(method)

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def start_chrome() -> subprocess.Popen:
    if PROFILE.exists():
        subprocess.run(["rm", "-rf", str(PROFILE)], check=False)
    PROFILE.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(
        [
            CHROME,
            "--remote-debugging-port=9222",
            "--remote-allow-origins=*",
            f"--user-data-dir={PROFILE}",
            "--disable-gpu",
            "--no-first-run",
            "--disable-default-apps",
            "--window-size=1400,2200",
            "--lang=fr-CA",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(30):
        try:
            with urllib.request.urlopen("http://127.0.0.1:9222/json/version", timeout=1) as r:
                if r.status == 200:
                    return proc
        except Exception:
            time.sleep(0.4)
    raise RuntimeError("Chrome CDP failed to start")


def open_page() -> tuple[CDP, str]:
    req = urllib.request.Request(
        "http://127.0.0.1:9222/json/new?about:blank",
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        info = json.loads(r.read().decode())
    return CDP(info["webSocketDebuggerUrl"]), info["id"]


def wait_ready(cdp: CDP, seconds: float = 8.0):
    cdp.call("Page.enable")
    cdp.call("Runtime.enable")
    time.sleep(seconds)


def eval_js(cdp: CDP, expression: str):
    result = cdp.call(
        "Runtime.evaluate",
        {
            "expression": expression,
            "awaitPromise": True,
            "returnByValue": True,
        },
        timeout=90,
    )
    return result.get("result", {}).get("value")


def scrape_reviews(cdp: CDP) -> tuple[str, list[list]]:
    cdp.call("Page.navigate", {"url": PLACE_URL})
    wait_ready(cdp, 10)

    # Accept consent if present
    eval_js(
        cdp,
        """
(() => {
  const buttons = [...document.querySelectorAll('button, [role="button"]')];
  const hit = buttons.find(b => /accepter|accept all|j'accepte|tout accepter/i.test(b.textContent || ''));
  if (hit) hit.click();
  return !!hit;
})()
""",
    )
    time.sleep(2)

    # Click Avis tab
    eval_js(
        cdp,
        """
(() => {
  const tab = document.querySelector('button[aria-label*="Avis"], button[role="tab"][aria-label*="Avis"]')
    || [...document.querySelectorAll('button[role="tab"]')].find(b => /Avis/i.test(b.textContent || ''));
  if (tab) { tab.click(); return tab.getAttribute('aria-label') || tab.textContent; }
  return null;
})()
""",
    )
    time.sleep(3)

    # Scroll reviews pane to load more cards
    for _ in range(14):
        eval_js(
            cdp,
            """
(() => {
  const reviewRoot = document.querySelector('.m6QErb.DxyBCb.kA9KIf.dS8AEfXiXi')
    || document.querySelector('.m6QErb.DxyBCb.kA9KIf.dS8AEf')
    || document.querySelector('.m6QErb.DxyBCb')
    || document.querySelector('.m6QErb')
    || document.querySelector('div[role="main"]')
    || document.scrollingElement;
  if (reviewRoot) {
    reviewRoot.scrollBy?.(0, 1800);
    reviewRoot.scrollTop = (reviewRoot.scrollTop || 0) + 1800;
  }
  // Expand truncated reviews
  document.querySelectorAll('button.w8nwRe, button[aria-label*="Plus"], button[aria-label*="more"]').forEach(b => {
    try { b.click(); } catch (e) {}
  });
  return reviewRoot?.scrollTop || 0;
})()
""",
        )
        time.sleep(1.0)

    data = eval_js(
        cdp,
        """
(() => {
  const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]')
    || document.querySelector('[aria-label*="étoiles"]');
  let rating = '4,9';
  if (ratingEl) {
    const t = (ratingEl.getAttribute('aria-label') || ratingEl.textContent || '').replace('.', ',');
    const m = t.match(/([0-9],[0-9])/);
    if (m) rating = m[1];
  }
  const cards = [...document.querySelectorAll('.jftiEf[aria-label], div[data-review-id]')];
  const seen = new Set();
  const reviews = [];
  for (const card of cards) {
    const author = card.getAttribute('aria-label')
      || card.querySelector('.d4r55')?.textContent?.trim()
      || '';
    if (!author || seen.has(author)) continue;
    const starsLabel = card.querySelector('[role="img"][aria-label*="étoile"], [role="img"][aria-label*="star"]')
      ?.getAttribute('aria-label') || '';
    const starMatch = starsLabel.match(/([0-9])/);
    const stars = starMatch ? Number(starMatch[1]) : 5;
    let text = card.querySelector('.wiI7pd')?.textContent?.trim()
      || card.querySelector('.MyEned')?.textContent?.trim()
      || '';
    text = text.replace(/\\s+/g, ' ').trim();
    if (!text || text.length < 8) continue;
    seen.add(author);
    reviews.push([text, author, stars]);
  }
  return { rating, reviews };
})()
""",
    )
    rating = (data or {}).get("rating") or "4,9"
    reviews = (data or {}).get("reviews") or []
    return rating, reviews


def scrape_photo_hashes(cdp: CDP) -> list[str]:
    """Collect photo hashes newest-first (Les plus récentes), then remaining from Tout."""
    cdp.call("Page.navigate", {"url": PLACE_URL})
    wait_ready(cdp, 10)

    # Accept consent if present
    eval_js(
        cdp,
        """
(() => {
  const buttons = [...document.querySelectorAll('button, [role="button"]')];
  const hit = buttons.find(b => /accepter|accept all|j'accepte|tout accepter/i.test(b.textContent || ''));
  if (hit) hit.click();
  return !!hit;
})()
""",
    )
    time.sleep(1.5)

    # Open photo gallery (prefer "Les plus récentes" chip on place page)
    opened = eval_js(
        cdp,
        """
(() => {
  const byText = (re) => [...document.querySelectorAll('button, a, [role="button"]')]
    .find(b => re.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
  const hit = byText(/plus récentes/i) || byText(/Afficher les photos/i) || byText(/\\bPhotos\\b/i);
  if (hit) { hit.click(); return (hit.textContent || hit.getAttribute('aria-label') || '').trim().slice(0, 60); }
  return null;
})()
""",
    )
    print(f"photos open: {opened}")
    time.sleep(3)

    # Fallback direct photos URL if gallery did not open
    has_grid = eval_js(
        cdp,
        """!!document.querySelector('a[aria-label*="Photo"], [role="tab"]')""",
    )
    if not has_grid:
        cdp.call("Page.navigate", {"url": PHOTOS_URL})
        wait_ready(cdp, 12)

    data = eval_js(
        cdp,
        """
(() => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const hashFrom = (el) => {
    const parts = [el.outerHTML || ''];
    el.querySelectorAll?.('img').forEach(img => {
      parts.push(img.currentSrc || '', img.src || '', img.getAttribute('src') || '');
    });
    parts.push(el.getAttribute?.('style') || '');
    const m = parts.join('\\n').match(/AHRPTW[A-Za-z0-9_-]+/);
    return m ? m[0] : null;
  };
  const collect = () => {
    const out = [];
    const seen = new Set();
    for (const a of document.querySelectorAll('a[aria-label]')) {
      const label = a.getAttribute('aria-label') || '';
      if (/vid[eé]o/i.test(label)) continue;
      if (!/photo/i.test(label)) continue;
      // Skip review author avatars ("Photo de Martin…")
      if (/^Photo\\s+de\\s+/i.test(label)) continue;
      const h = hashFrom(a);
      if (!h || seen.has(h)) continue;
      seen.add(h);
      out.push({ hash: h, label });
    }
    return out;
  };
  const scrollPane = () => {
    const first = document.querySelector('a[aria-label*="Photo"]');
    let p = first && first.parentElement;
    while (p) {
      if ((p.scrollHeight - p.clientHeight) > 80) {
        p.scrollTop += 1400;
        return true;
      }
      p = p.parentElement;
    }
    const root = document.querySelector('.m6QErb') || document.querySelector('[role="main"]') || document.scrollingElement;
    if (root) root.scrollTop = (root.scrollTop || 0) + 1400;
    window.scrollBy(0, 1000);
    return !!root;
  };
  const scrapeTab = async (tabRe) => {
    const tab = [...document.querySelectorAll('[role="tab"], button')]
      .find(t => tabRe.test((t.textContent || '').trim()));
    if (tab) tab.click();
    await sleep(1100);
    // Leave lightbox if open so the grid is scrollable
    const back = [...document.querySelectorAll('button')]
      .find(b => /^\\s*Retour\\s*$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
    if (back) {
      back.click();
      await sleep(700);
      if (tab) tab.click();
      await sleep(700);
    }
    const ordered = [];
    const seen = new Set();
    let stagnant = 0;
    for (let i = 0; i < 40; i++) {
      const before = ordered.length;
      for (const item of collect()) {
        if (seen.has(item.hash)) continue;
        seen.add(item.hash);
        ordered.push(item);
      }
      scrollPane();
      await sleep(550);
      if (ordered.length === before) stagnant += 1;
      else stagnant = 0;
      if (stagnant >= 6) break;
    }
    return ordered;
  };
  return (async () => {
    const recent = await scrapeTab(/plus récentes/i);
    const tout = await scrapeTab(/^Tout$/i);
    const final = [];
    const fseen = new Set();
    for (const item of recent) {
      if (fseen.has(item.hash)) continue;
      fseen.add(item.hash);
      final.push(item.hash);
    }
    for (const item of tout) {
      if (fseen.has(item.hash)) continue;
      fseen.add(item.hash);
      final.push(item.hash);
    }
    return {
      recentCount: recent.length,
      toutCount: tout.length,
      finalCount: final.length,
      recentLabels: recent.map(x => x.label),
      toutLabels: tout.map(x => x.label),
      hashes: final,
    };
  })();
})()
""",
    ) or {}

    recent_n = data.get("recentCount", 0)
    tout_n = data.get("toutCount", 0)
    hashes = data.get("hashes") or []
    print(f"photo scrape recent={recent_n} tout={tout_n} merged={len(hashes)}")
    if data.get("recentLabels"):
        print(" recent:", ", ".join(data["recentLabels"][:12]))
    if data.get("toutLabels"):
        print(" tout:", ", ".join(data["toutLabels"][:16]), "…")

    if len(hashes) < 5:
        html = eval_js(cdp, "document.documentElement.outerHTML") or ""
        hashes = list(dict.fromkeys(re.findall(r"AHRPTW[A-Za-z0-9_-]+", html)))
        print(f"fallback html hashes={len(hashes)}")
    return hashes


def download_photos(hashes: list[str], limit: int = 40) -> int:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    saved: list[bytes] = []
    for h in hashes:
        if len(saved) >= limit:
            break
        candidates = [
            f"https://lh3.googleusercontent.com/gps-cs-s/{h}=w1600-h900-k-no",
            f"https://lh3.googleusercontent.com/gps-cs-s/{h}=s1600",
            f"https://lh3.googleusercontent.com/p/{h}=w1600-h900-k-no",
        ]
        data = b""
        for url in candidates:
            req = urllib.request.Request(url, headers={"User-Agent": ua})
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = resp.read()
                if len(data) >= 8000:
                    break
            except Exception:
                data = b""
        if len(data) < 8000:
            print(f"skip photo {h[:24]}…")
            continue
        digest = hashlib.md5(data).hexdigest()
        if any(hashlib.md5(prev).hexdigest() == digest for prev in saved):
            print(f"skip duplicate {h[:24]}…")
            continue
        saved.append(data)
        print(f"photo {len(saved):02d}: {len(data)} bytes")

    if not saved:
        return 0

    for old in IMG_DIR.glob("*.jpg"):
        old.unlink()
    for i, data in enumerate(saved, start=1):
        (IMG_DIR / f"{i:02d}.jpg").write_bytes(data)
    return len(saved)


def restore_photos_from_live(limit: int = 22) -> int:
    """Emergency recovery from currently published site."""
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    saved = 0
    for i in range(1, limit + 1):
        url = f"https://djcarl.ca/img/google/{i:02d}.jpg"
        dest = IMG_DIR / f"{i:02d}.jpg"
        req = urllib.request.Request(url, headers={"User-Agent": ua})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            if len(data) < 8000:
                break
            dest.write_bytes(data)
            saved += 1
            print(f"restored {i:02d}.jpg ({len(data)} bytes)")
        except Exception:
            break
    return saved


def _js_escape(s: str) -> str:
    return (
        str(s)
        .replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", " ")
        .replace("\r", " ")
    )


def _format_review_items(reviews: list[list]) -> str:
    lines = ["      items: ["]
    for text, author, stars in reviews:
        lines.append(
            f'        ["{_js_escape(text)}", "{_js_escape(author)}", {int(stars)}],'
        )
    lines.append("      ]")
    return "\n".join(lines)


def _existing_en_by_author() -> dict[str, str]:
    """Keep previous English translations when the same author reappears."""
    src = I18N_JS.read_text()
    # Second reviews.items block is English
    matches = list(re.finditer(r"items:\s*\[([\s\S]*?)\]\s*\n\s*\}", src))
    if len(matches) < 2:
        return {}
    block = matches[-1].group(1)
    out: dict[str, str] = {}
    for text, author, _stars in re.findall(
        r'\["((?:\\.|[^"\\])*)",\s*"((?:\\.|[^"\\])*)",\s*(\d+)\]',
        block,
    ):
        author_plain = author.replace('\\"', '"').replace("\\\\", "\\")
        text_plain = text.replace('\\"', '"').replace("\\\\", "\\")
        out[author_plain] = text_plain
    return out


def update_reviews_in_script(reviews: list[list], rating: str) -> None:
    if not reviews:
        raise RuntimeError("No reviews scraped")

    # Keep newest-first order as returned by Maps (already roughly newest).
    reviews = reviews[:10]
    en_by_author = _existing_en_by_author()
    fr_items = reviews
    en_items = []
    for text, author, stars in fr_items:
        en_text = en_by_author.get(author, text)
        en_items.append([en_text, author, stars])
        if author not in en_by_author:
            print(f"EN review missing for {author} — left French as placeholder")

    src = I18N_JS.read_text()
    # Replace each reviews.items block in order: first = fr, second = en
    item_blocks = [_format_review_items(fr_items), _format_review_items(en_items)]
    idx = 0

    def repl_items(_match: re.Match) -> str:
        nonlocal idx
        if idx >= len(item_blocks):
            return _match.group(0)
        replacement = item_blocks[idx]
        idx += 1
        return replacement

    new_src, n = re.subn(
        r"      items:\s*\[[\s\S]*?\]",
        repl_items,
        src,
        count=2,
    )
    if n != 2:
        raise RuntimeError(f"Could not replace reviews.items in i18n.js (found {n})")

    rating_fr = str(rating).replace(".", ",")
    rating_en = str(rating).replace(",", ".")
    score_vals = [f'{rating_fr} ★ sur Google', f'{rating_en} ★ on Google']
    score_idx = 0

    def repl_score(match: re.Match) -> str:
        nonlocal score_idx
        if score_idx >= len(score_vals):
            return match.group(0)
        out = f'{match.group(1)}{score_vals[score_idx]}{match.group(2)}'
        score_idx += 1
        return out

    new_src = re.sub(r'(score:\s*")[^"]*(")', repl_score, new_src, count=2)
    I18N_JS.write_text(new_src)

    html = INDEX_HTML.read_text()
    html2, n2 = re.subn(
        r'(data-i18n="reviews\.score"[^>]*>)[^<]*(</p>)',
        rf"\g<1>{rating_fr} ★ sur Google\2",
        html,
        count=1,
    )
    if n2 == 0:
        html2, n2 = re.subn(
            r'(<p class="google-score"[^>]*>)[^<]*(</p>)',
            rf"\g<1>{rating_fr} ★ sur Google\2",
            html,
            count=1,
        )
    if n2 == 1:
        INDEX_HTML.write_text(html2)

    # bump i18n + script cache
    html3 = INDEX_HTML.read_text()
    stamp = str(int(time.time()) % 10000)
    html3 = re.sub(r'(i18n\.js\?v=)\d+', rf"\g<1>{stamp}", html3, count=1)
    html3 = re.sub(r'(script\.js\?v=)\d+', rf"\g<1>{stamp}", html3, count=1)
    INDEX_HTML.write_text(html3)


def update_photo_markup(count: int) -> None:
    if count < 1:
        raise RuntimeError("No photos downloaded")
    html = INDEX_HTML.read_text()
    alts = [
        "DJ Carl au mixeur",
        "Installation DJ en événement",
        "Soirée DJ Carl",
        "Animation DJ Carl",
        "Événement en soirée",
        "Prestation DJ Carl",
        "Ambiance événementielle",
        "Éclairage et animation",
        "Party DJ Carl",
        "Salle de réception éclairée",
        "Événement DJ Carl",
        "Soirée dansante",
        "Mariage et animation",
        "DJ Carl en prestation",
        "Ambiance de salle",
        "Événement privé",
        "Animation musicale",
        "Invités sur la piste",
        "Setup DJ professionnel",
        "Soirée corporative",
        "Éclairage de scène",
        "Piste de danse DJ Carl",
        "Réception éclairée DJ Carl",
        "Soirée dansante DJ Carl",
        "Animation en salle",
        "Événement DJ Carl en direct",
        "Ambiance festivité",
        "Party privée DJ Carl",
        "Setup extérieur DJ Carl",
        "Mariage en plein air",
        "Soirée sous chapiteau",
        "Invités en réception",
        "DJ Carl live",
        "Ambiance mariage",
    ]
    imgs = []
    for i in range(1, count + 1):
        alt = alts[i - 1] if i - 1 < len(alts) else f"Photo Google DJ Carl {i}"
        cls = ' class="is-active"' if i == 1 else ""
        prio = ' fetchpriority="high"' if i == 1 else ' loading="lazy"'
        imgs.append(
            f'            <img{cls} src="img/google/{i:02d}.jpg" alt="{alt}" width="1600" height="900"{prio}>'
        )
    block = "\n".join(imgs)
    new_html, n = re.subn(
        r'(<div class="photo-show-track">\n)([\s\S]*?)(\n          </div>\n          <button class="photo-show-nav prev")',
        rf"\1{block}\3",
        html,
        count=1,
    )
    if n != 1:
        raise RuntimeError("Could not replace photo markup")
    new_html = re.sub(
        r'(id="photoShowIndex">)[^<]*(</span>)',
        rf"\g<1>1 / {count}\2",
        new_html,
        count=1,
    )
    INDEX_HTML.write_text(new_html)


def main() -> None:
    photos_only = "--photos-only" in sys.argv
    chrome = start_chrome()
    rating, reviews, hashes = "4,9", [], []
    try:
        cdp, _page_id = open_page()
        try:
            if not photos_only:
                print("Scraping reviews…")
                rating, reviews = scrape_reviews(cdp)
                print(f"rating={rating} reviews={len(reviews)}")
                for r in reviews[:10]:
                    print(f" - {r[1]} ({r[2]}★): {r[0][:70]}…")

            print("Scraping photos…")
            hashes = scrape_photo_hashes(cdp)
            print(f"photo hashes={len(hashes)}")
            Path("/tmp/fresh-hashes.txt").write_text("\n".join(hashes) + ("\n" if hashes else ""))
        finally:
            cdp.close()

        if len(hashes) < 8:
            fallback = Path("/tmp/old-hashes.txt")
            if fallback.exists():
                extra = [ln.strip() for ln in fallback.read_text().splitlines() if ln.strip()]
                print(f"merging {len(extra)} fallback hashes")
                for h in extra:
                    if h not in hashes:
                        hashes.append(h)

        # Avoid wiping a good gallery if the scrape only found a handful of hashes
        existing_count = len(list(IMG_DIR.glob("*.jpg")))
        if len(hashes) < max(8, existing_count // 2) and existing_count >= 8:
            print(
                f"Keeping existing {existing_count} photos "
                f"(scrape only returned {len(hashes)} hashes; Google limited view)."
            )
            count = existing_count
        else:
            count = download_photos(hashes, limit=40)
            print(f"downloaded photos={count}")
            if count == 0:
                count = restore_photos_from_live()
                print(f"restored from live site={count}")
            if count > 0:
                update_photo_markup(count)
                # bump styles/script cache lightly so browsers reload gallery
                html = INDEX_HTML.read_text()
                html = re.sub(
                    r'(styles\.css\?v=)\d+',
                    lambda m: m.group(1) + str(int(time.time()) % 10000),
                    html,
                    count=1,
                )
                INDEX_HTML.write_text(html)
        if reviews:
            update_reviews_in_script(reviews, rating)
        elif not photos_only and Path("/tmp/old-hashes.txt").exists():
            print("No reviews scraped (Google limited view). Left existing reviews unchanged.")
        print("Updated index.html + script.js")
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except Exception:
            chrome.kill()


if __name__ == "__main__":
    main()
