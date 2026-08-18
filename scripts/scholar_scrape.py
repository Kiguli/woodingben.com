#!/usr/bin/env python3
"""Daily Google Scholar scraper for woodingben.com (static site).

Fetches Ben Wooding's full publication list from his Google Scholar profile
(user=YhOmz1kAAAAJ -- verified: "Ben Wooding, Postdoc @ Vanderbilt University";
the older ID HhpTdG0AAAAJ found in some CV headers now returns 404) and writes:

  data/scholar.json  -- machine-readable data, sorted by year desc
  public/index.html  -- regenerates ONLY the two marker-delimited blocks:
                          <!-- SCHOLAR-STATS:START --> ... <!-- SCHOLAR-STATS:END -->
                            (the three stat chips: Citations / h-index / i10-index)
                          <!-- SCHOLAR-LIST:START --> ... <!-- SCHOLAR-LIST:END -->
                            (the full publication list, link-free table,
                             plus the attribution / full-list note)
                        in the design-system markup from design/notes.md.
                        Every byte outside the markers is preserved. If either
                        marker pair is missing, the homepage is left untouched.

Offline mode: `scholar_scrape.py --from-json` skips the network entirely and
re-renders both index.html blocks from the existing data/scholar.json. The
rendering is a pure function of that JSON, so two consecutive runs produce
byte-identical output.

Fail-safe for CI: on any HTTP block (403/429/CAPTCHA), network error, or a
suspicious parse (empty list, wrong profile name), it logs to stderr and exits
0 WITHOUT touching the existing output files -- stale data beats broken data.
index.html is written atomically (temp file + rename) and is never touched
unless the fetch fully succeeded and both markers are present.

Dependencies: Python 3 stdlib + requests + beautifulsoup4 only.
"""

import html
import json
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

SCHOLAR_ID = "YhOmz1kAAAAJ"
BASE = "https://scholar.google.com"
PROFILE_URL = f"{BASE}/citations?user={SCHOLAR_ID}&hl=en"
PAGESIZE = 100
MAX_PAGES = 10  # hard cap; 10 * 100 publications is far beyond plausible

REPO_ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = REPO_ROOT / "data" / "scholar.json"
INDEX_PATH = REPO_ROOT / "public" / "index.html"

# Exact marker lines in public/index.html delimiting the generated blocks.
STATS_START = "<!-- SCHOLAR-STATS:START -->"
STATS_END = "<!-- SCHOLAR-STATS:END -->"
LIST_START = "<!-- SCHOLAR-LIST:START -->"
LIST_END = "<!-- SCHOLAR-LIST:END -->"

# How many of the most recent publications the homepage list shows.
# None = show the full list (Ben's preference since the list sits at the page end).
LIST_COUNT = None

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Name variants to bold in the authors line of the HTML fragment.
SELF_NAMES = ("B Wooding", "Ben Wooding", "Benjamin Wooding")


def log(msg):
    print(f"[scholar_scrape] {msg}", file=sys.stderr)


def bail(msg):
    """Exit 0 without writing anything -- keep whatever data already exists."""
    log(f"SKIPPED (existing files untouched): {msg}")
    sys.exit(0)


def looks_blocked(resp):
    if resp.status_code in (403, 429, 503):
        return f"HTTP {resp.status_code}"
    lowered = resp.text[:4000].lower()
    for marker in ("gs_captcha", "recaptcha", "unusual traffic",
                   "not a robot", "/sorry/"):
        if marker in lowered:
            return f"CAPTCHA marker '{marker}'"
    return None


def fetch_page(session, cstart):
    url = (f"{BASE}/citations?user={SCHOLAR_ID}&hl=en"
           f"&cstart={cstart}&pagesize={PAGESIZE}")
    try:
        resp = session.get(url, headers=HEADERS, timeout=30)
    except requests.RequestException as exc:
        bail(f"network error fetching cstart={cstart}: {exc}")
    blocked = looks_blocked(resp)
    if blocked:
        bail(f"Scholar is blocking us at cstart={cstart}: {blocked}")
    if resp.status_code != 200:
        bail(f"unexpected HTTP {resp.status_code} at cstart={cstart}")
    return resp.text


def parse_int(text):
    digits = re.sub(r"[^\d]", "", text or "")
    return int(digits) if digits else 0


def parse_rows(soup):
    pubs = []
    for row in soup.select("tr.gsc_a_tr"):
        title_a = row.select_one("a.gsc_a_at")
        if title_a is None:
            continue
        # No separator: Scholar stylizes letters inside some titles (e.g. the
        # PRoTECT acronym caps); a separator would inject spaces mid-word.
        title = " ".join(title_a.get_text().replace("\xa0", " ").split())
        citation_link = urljoin(BASE, title_a.get("href", "")) \
            if title_a.get("href") else None

        gray = row.select("td.gsc_a_t div.gs_gray")
        authors = gray[0].get_text(" ", strip=True) if len(gray) > 0 else ""
        venue = gray[1].get_text(" ", strip=True) if len(gray) > 1 else ""
        venue = re.sub(r"\s+,", ",", venue)  # "… , 2026" -> "…, 2026"
        # Scholar appends ", <year>" to the venue inside span.gs_oph; keep it,
        # it matches the site's existing pub-venue style ("..., 448-458, 2025").

        cited_a = row.select_one("td.gsc_a_c a")
        citations = parse_int(cited_a.get_text(strip=True)) if cited_a else 0
        cluster_link = None
        if cited_a and cited_a.get("href") and citations > 0:
            cluster_link = urljoin(BASE, cited_a["href"])

        year_el = row.select_one("td.gsc_a_y span")
        year_txt = year_el.get_text(strip=True) if year_el else ""
        year = int(year_txt) if year_txt.isdigit() else None

        pubs.append({
            "title": title,
            "authors": authors,
            "venue": venue,
            "year": year,
            "citations": citations,
            "citation_link": citation_link,
            "cluster_link": cluster_link,
        })
    return pubs


def parse_profile(soup):
    name_el = soup.select_one("#gsc_prf_in")
    name = name_el.get_text(" ", strip=True) if name_el else ""
    affil_el = soup.select_one("#gsc_prf_i .gsc_prf_il")
    affiliation = affil_el.get_text(" ", strip=True) if affil_el else ""
    stats = {}
    cells = [td.get_text(strip=True)
             for td in soup.select("#gsc_rsb_st td.gsc_rsb_std")]
    # Table rows: Citations, h-index, i10-index; columns: All, Since 20xx.
    if len(cells) >= 6:
        stats = {
            "citations_all": parse_int(cells[0]),
            "citations_recent": parse_int(cells[1]),
            "h_index_all": parse_int(cells[2]),
            "h_index_recent": parse_int(cells[3]),
            "i10_index_all": parse_int(cells[4]),
            "i10_index_recent": parse_int(cells[5]),
        }
    return name, affiliation, stats


def bold_self(escaped_authors):
    """Wrap Ben's name in <strong> inside an already-HTML-escaped string."""
    out = escaped_authors
    for name in SELF_NAMES:
        out = re.sub(rf"\b{re.escape(html.escape(name))}\b",
                     f"<strong>{html.escape(name)}</strong>", out)
    return out


def build_stats_section(data):
    """Render the stats block (between the SCHOLAR-STATS markers).

    Markup follows design/notes.md: .section / .section-heading, .stat-row +
    .stat-chip for the non-link stat chips. Pure function of the JSON data;
    no timestamp is embedded so unchanged data produces an unchanged file.
    """
    stats = data.get("stats", {})
    lines = [
        '    <section class="section">',
        '      <div class="section-heading">',
        "        <h2>Google Scholar</h2>",
        "      </div>",
        '      <div class="stat-row">',
    ]
    for label, key in (("Citations", "citations_all"),
                       ("h-index", "h_index_all"),
                       ("i10-index", "i10_index_all")):
        value = stats.get(key)
        if value is not None:
            lines.append(f'        <span class="stat-chip">{label}: '
                         f"{value}</span>")
    lines.append("      </div>")
    lines.append("    </section>")
    return "\n".join(lines)


def most_recent(pubs, count=LIST_COUNT):
    """The `count` most recent publications by year (desc), preserving the
    JSON order within a year (sorted() is stable)."""
    ranked = sorted(pubs, key=lambda p: -(p["year"] or 0))
    return ranked[:count]


def build_list_section(data):
    """Render the recent-publications block (between the SCHOLAR-LIST markers).

    A real <table> (Title / Cited by / Year) inside .table-wrap with
    <p class="cell-sub"> author and venue lines, per design/notes.md. The 10
    most recent papers only, with NO hyperlinks inside the table: titles are
    plain text and citation counts are bare numbers. The only links are in the
    note below the table (Scholar profile + full publications page). Pure
    function of the JSON data.
    """
    profile_url = html.escape(data.get("profile_url", PROFILE_URL), quote=True)

    lines = [
        '    <section class="section">',
        '      <div class="section-heading">',
        "        <h2>Publications (Google Scholar)</h2>",
        "      </div>",
        '      <div class="table-wrap">',
        "        <table>",
        "          <thead>",
        "            <tr>",
        "              <th>Title</th>",
        "              <th>Cited&nbsp;by</th>",
        "              <th>Year</th>",
        "            </tr>",
        "          </thead>",
        "          <tbody>",
    ]
    for p in most_recent(data.get("publications", [])):
        lines.append("            <tr>")
        lines.append("              <td>")
        lines.append(f"                {html.escape(p['title'])}")
        if p.get("authors"):
            lines.append(f'                <p class="cell-sub">'
                         f'{bold_self(html.escape(p["authors"]))}</p>')
        if p.get("venue"):
            lines.append(f'                <p class="cell-sub">'
                         f'{html.escape(p["venue"])}</p>')
        lines.append("              </td>")
        citations = p.get("citations") or 0
        lines.append(f"              <td>{citations if citations > 0 else ''}"
                     "</td>")
        year = p.get("year")
        lines.append(f"              <td>{year if year else ''}</td>")
        lines.append("            </tr>")
    lines.append("          </tbody>")
    lines.append("        </table>")
    lines.append("      </div>")
    lines.append(f'      <p class="muted center">Updated daily from '
                 f'<a href="{profile_url}">Google Scholar</a>. '
                 f'See <a href="/publications/">Publications</a> for the '
                 f"full list.</p>")
    lines.append("    </section>")
    return "\n".join(lines)


def splice(text, start_marker, end_marker, block_html):
    """Replace the content between one marker pair. Returns the new text, or
    None if the markers are not found. Everything outside the marker lines is
    preserved byte-for-byte."""
    pattern = re.compile(
        rf"(^[ \t]*{re.escape(start_marker)}[ \t]*\n).*?"
        rf"(^[ \t]*{re.escape(end_marker)})",
        re.DOTALL | re.MULTILINE)
    match = pattern.search(text)
    if not match:
        return None
    return (text[:match.start()] + match.group(1) + block_html + "\n"
            + text[match.end() - len(match.group(2)):])


def update_index(stats_html, list_html):
    """Splice both generated blocks into public/index.html.

    Everything outside the marker lines is preserved byte-for-byte. Returns
    True if the file was rewritten. Never raises on missing markers -- if
    EITHER marker pair is absent, the homepage is left untouched.
    """
    if not INDEX_PATH.exists():
        log(f"WARNING: {INDEX_PATH} not found; homepage left untouched")
        return False
    text = INDEX_PATH.read_text(encoding="utf-8")
    new_text = splice(text, STATS_START, STATS_END, stats_html)
    if new_text is None:
        log("WARNING: SCHOLAR-STATS markers not found in index.html; "
            "homepage left untouched")
        return False
    new_text = splice(new_text, LIST_START, LIST_END, list_html)
    if new_text is None:
        log("WARNING: SCHOLAR-LIST markers not found in index.html; "
            "homepage left untouched")
        return False
    if new_text == text:
        log("index.html Scholar blocks already up to date")
        return False
    tmp = INDEX_PATH.with_suffix(".html.tmp")
    tmp.write_text(new_text, encoding="utf-8")
    tmp.replace(INDEX_PATH)
    return True


def main():
    session = requests.Session()
    all_pubs = []
    profile_name = affiliation = ""
    stats = {}

    for page in range(MAX_PAGES):
        cstart = page * PAGESIZE
        html_text = fetch_page(session, cstart)
        soup = BeautifulSoup(html_text, "html.parser")
        if page == 0:
            profile_name, affiliation, stats = parse_profile(soup)
        page_pubs = parse_rows(soup)
        all_pubs.extend(page_pubs)
        log(f"page cstart={cstart}: {len(page_pubs)} publications")
        if len(page_pubs) < PAGESIZE:
            break
        time.sleep(2.0 + random.uniform(0.5, 2.0))  # polite inter-page delay

    # Sanity checks -- a wrong or empty page must never clobber good data.
    if "wooding" not in profile_name.lower():
        bail(f"profile name sanity check failed (got {profile_name!r})")
    if not all_pubs:
        bail("no publications parsed -- refusing to overwrite existing data")

    # De-duplicate (paranoia against pagination overlap), keep first seen.
    seen, pubs = set(), []
    for p in all_pubs:
        key = (p["title"].lower(), p["year"])
        if key not in seen:
            seen.add(key)
            pubs.append(p)

    pubs.sort(key=lambda p: (-(p["year"] or 0), -p["citations"],
                             p["title"].lower()))

    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data = {
        "scholar_id": SCHOLAR_ID,
        "profile_name": profile_name,
        "affiliation": affiliation,
        "profile_url": PROFILE_URL,
        "fetched_at": fetched_at,
        "stats": stats,
        "publication_count": len(pubs),
        "publications": pubs,
    }

    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Atomic writes: build full content first, then rename into place.
    tmp_json = JSON_PATH.with_suffix(".json.tmp")
    tmp_json.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8")
    tmp_json.replace(JSON_PATH)

    index_updated = update_index(build_stats_section(data),
                                 build_list_section(data))

    log(f"OK: {len(pubs)} publications for {profile_name!r}; "
        f"wrote {JSON_PATH}"
        + (f" and updated {INDEX_PATH}" if index_updated else ""))


def main_from_json():
    """Offline path: re-render index.html from the existing data/scholar.json
    without any network access. Used for testing and manual regeneration."""
    if not JSON_PATH.exists():
        bail(f"{JSON_PATH} not found; nothing to render from")
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    if not data.get("publications"):
        bail("scholar.json has no publications; refusing to render")
    index_updated = update_index(build_stats_section(data),
                                 build_list_section(data))
    log(f"OK (offline): rendered from {JSON_PATH}"
        + (f"; updated {INDEX_PATH}" if index_updated else "; no changes"))


if __name__ == "__main__":
    try:
        if "--from-json" in sys.argv[1:]:
            main_from_json()
        else:
            main()
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 -- CI must stay green on flakiness
        bail(f"unexpected error: {type(exc).__name__}: {exc}")
