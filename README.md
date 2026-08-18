# woodingben.com

The public source of [woodingben.com](https://woodingben.com) — the academic
website of Ben Wooding, Postdoctoral Scholar at the Institute for Software
Integrated Systems, Vanderbilt University.

Static site, no build step: everything served lives in `public/`.
GitHub Pages deploys that directory on every push to `main`.

The publication list on the homepage refreshes itself daily from Google
Scholar via `.github/workflows/scholar-update.yml`.
