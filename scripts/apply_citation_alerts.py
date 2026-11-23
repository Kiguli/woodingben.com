#!/usr/bin/env python3
"""Apply Google Scholar "new citation" alert emails to data/scholar.json.

Scholar blocks the scraper from GitHub's runners on most runs, so between
successful scrapes the figures are kept current from the citation-alert
emails Scholar sends ("N new citations to your articles"). Each citing paper
in an email has one or more "Cites: <title>" lines whose edit link carries the
article's Scholar id (citation_for_view=YhOmz1kAAAAJ:<ID>), the same id that
appears in each publication's citation_link here.

Usage:
    python3 scripts/apply_citation_alerts.py alerts.json [--dry-run]

alerts.json is a list of emails, one entry per email:
    [{"message_id": "1a1fc0a958e90264",
      "date": "2026-11-21T02:58:33Z",
      "cites": ["dhFuZR0502QC"]}]
"cites" holds one id per "Cites:" line in the email (repeat an id if two
citing papers in the same email cite the same article).

Bookkeeping lives in data/citation-alerts.json:
  applied_after         emails dated at or before this are already counted
  applied_message_ids   emails applied since then (so re-runs are no-ops)
A successful scrape counts everything up to its fetched_at, so when
scholar.json's fetched_at is newer than applied_after the state resets to it.

Per-paper counts and the "all" citation total go up by one per citation;
"since 2021" goes up too, since every new citation is recent. h-index and
i10-index ("all") are recomputed from the per-paper counts. The "since 2021"
h/i10 need per-year data the emails don't give, so they are left alone
until the next scrape or hand update.
"""

import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHOLAR = ROOT / "data" / "scholar.json"
STATE = ROOT / "data" / "citation-alerts.json"
ID_RE = re.compile(r"citation_for_view=[^:&]+:([\w-]+)")


def ts(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ")


def h_index(counts):
    counts = sorted(counts, reverse=True)
    return sum(1 for i, c in enumerate(counts, 1) if c >= i)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if len(args) != 1:
        sys.exit(__doc__)
    alerts = json.loads(Path(args[0]).read_text(encoding="utf-8"))
    data = json.loads(SCHOLAR.read_text(encoding="utf-8"))
    state = json.loads(STATE.read_text(encoding="utf-8"))

    if ts(data["fetched_at"]) > ts(state["applied_after"]):
        print(f"scrape at {data['fetched_at']} is newer than "
              f"{state['applied_after']}; resetting alert state")
        state = {"applied_after": data["fetched_at"], "applied_message_ids": []}

    by_id = {}
    for p in data["publications"]:
        m = ID_RE.search(p.get("citation_link") or "")
        if m:
            by_id[m.group(1)] = p

    added, unknown, skipped = 0, [], 0
    for a in sorted(alerts, key=lambda a: a["date"]):
        if (ts(a["date"]) <= ts(state["applied_after"])
                or a["message_id"] in state["applied_message_ids"]):
            skipped += 1
            continue
        for cid in a["cites"]:
            p = by_id.get(cid)
            if p is None:
                unknown.append((a["message_id"], cid))
                continue
            p["citations"] = (p.get("citations") or 0) + 1
            added += 1
            print(f"+1  {p['citations']:>3}  {p['title'][:70]}")
        state["applied_message_ids"].append(a["message_id"])

    s = data["stats"]
    counts = [p.get("citations") or 0 for p in data["publications"]]
    s["citations_all"] += added
    s["citations_recent"] += added
    s["h_index_all"] = max(s["h_index_all"], h_index(counts))
    s["i10_index_all"] = max(s["i10_index_all"], sum(c >= 10 for c in counts))

    print(f"applied {added} citations; skipped {skipped} emails already counted")
    for mid, cid in unknown:
        print(f"WARNING: email {mid} cites unknown article id {cid} "
              f"(a paper not yet in scholar.json); not counted")
    print(f"stats now: {s}")
    if dry or not added and not state["applied_message_ids"]:
        return

    SCHOLAR.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                       encoding="utf-8")
    STATE.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    subprocess.run([sys.executable, str(ROOT / "scripts" / "scholar_scrape.py"),
                    "--from-json"], check=True)


if __name__ == "__main__":
    main()
