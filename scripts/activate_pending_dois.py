#!/usr/bin/env python3
"""Flip pending DOIs live once they register with the DOI handle system.

Reads data/pending-dois.json ({bibkey: doi}). For each entry, queries the
DOI handle API; when a DOI is registered (responseCode 1), the entry is
activated: data/publications.json gains the doi field, and the publication's
hostname-labelled fallback link on public/publications/index.html is swapped
for the DOI link, surgically (no full pipeline needed, so this runs safely
in CI where ref.bib is unavailable). Activated keys are removed from the
pending file.

Fail-safe like scholar_scrape.py: network errors leave everything untouched
and exit 0 (stale beats broken). Runs from the repo root or scripts/.

NOTE for the CV side: the matching % VERIFY trackers in ref.bib /
ref_public.bib are flipped manually at the next CV edit — this script only
touches the site.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PENDING = ROOT / "data" / "pending-dois.json"
PUBS_JSON = ROOT / "data" / "publications.json"
PAGE = ROOT / "public" / "publications" / "index.html"


def registered(doi: str) -> bool:
    try:
        with urllib.request.urlopen(
            f"https://doi.org/api/handles/{doi}", timeout=20
        ) as r:
            return json.load(r).get("responseCode") == 1
    except Exception:
        return False


def main() -> int:
    if not PENDING.exists():
        print("[activate_pending_dois] no pending file; nothing to do")
        return 0
    pending = json.loads(PENDING.read_text())
    if not pending:
        print("[activate_pending_dois] pending list empty")
        return 0

    live = {k: d for k, d in pending.items() if registered(d)}
    if not live:
        print(f"[activate_pending_dois] {len(pending)} pending, none registered yet")
        return 0

    pubs = json.loads(PUBS_JSON.read_text())
    page = PAGE.read_text(encoding="utf-8")

    for key, doi in live.items():
        for sec in pubs["sections"]:
            for e in sec["entries"]:
                if e["bibkey"] == key:
                    e["doi"] = doi
        # Replace the fallback link inside this entry's <li> with the DOI link.
        m = re.search(
            rf'(<li class="pub" id="{re.escape(key)}">.*?</li>)', page, re.S
        )
        if m:
            block = m.group(1)
            new_block, n = re.subn(
                r'<a href="https://easychair\.org/[^"]*">[^<]*</a>',
                f'<a href="https://doi.org/{doi}">DOI</a>',
                block,
                count=1,
            )
            if n:
                page = page.replace(block, new_block, 1)
        del pending[key]
        print(f"[activate_pending_dois] ACTIVATED {key} -> https://doi.org/{doi}")

    PUBS_JSON.write_text(json.dumps(pubs, indent=1))
    PAGE.write_text(page, encoding="utf-8")
    PENDING.write_text(json.dumps(pending, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
