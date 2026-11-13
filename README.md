# woodingben.com

The public source of [woodingben.com](https://woodingben.com) — the academic
website of Ben Wooding, Postdoctoral Scholar at the Institute for Software
Integrated Systems, Vanderbilt University.

Static site, no build step: everything served lives in `public/`.
GitHub Pages deploys that directory on every push to `main`.

The publication list on the homepage refreshes itself weekly from Google
Scholar via `.github/workflows/scholar-update.yml`, merged with
`data/publications.json` (the CV) so accepted papers and preprints that Scholar
has not indexed yet still appear. After editing `data/publications.json`, run
`python scripts/scholar_scrape.py --from-json` to re-render the homepage list.
