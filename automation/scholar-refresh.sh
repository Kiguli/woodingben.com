#!/bin/bash
# Refresh the Google Scholar figures on a static GitHub Pages site from a
# residential IP, and push the result so Pages redeploys.
#
# Why this exists: Google Scholar blocks the datacenter IP ranges that GitHub
# Actions (and most cloud schedulers) run on -- in practice roughly two runs in
# three. It does not block home connections. Running the same scraper from
# your own machine on a schedule keeps the figures current; a CI job can stay
# on as a free backup.
#
# Everything is configured through environment variables (set them in the
# launchd plist -- see com.example.scholar-refresh.plist and README.md):
#
#   SITE_REPO_URL  required  https clone URL of the repo that serves the site
#   WORK_DIR       required  where this script keeps its own private clone
#   PYTHON         optional  interpreter that has `requests` and `bs4`
#   GIT            optional  git binary (launchd has a minimal PATH)
#   BRANCH         optional  branch Pages deploys from          [main]
#   SCRAPER        optional  scraper path inside the repo       [scripts/scholar_scrape.py]
#   FILES          optional  files the scraper writes           [data/scholar.json public/index.html]
#   COMMIT_MSG     optional  commit message for a refresh
#
# The script works only in its OWN clone and resets it hard to the remote on
# every run, so it can never pick up, commit or clobber work in progress in
# your normal checkout.
set -euo pipefail

: "${SITE_REPO_URL:?set SITE_REPO_URL}"
: "${WORK_DIR:?set WORK_DIR}"
PYTHON="${PYTHON:-python3}"
GIT="${GIT:-git}"
BRANCH="${BRANCH:-main}"
SCRAPER="${SCRAPER:-scripts/scholar_scrape.py}"
FILES="${FILES:-data/scholar.json public/index.html}"
COMMIT_MSG="${COMMIT_MSG:-chore: Scholar refresh from a residential IP}"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

mkdir -p "$WORK_DIR"
# mkdir is atomic, so it doubles as a lock against an overlapping run.
LOCK="$WORK_DIR/.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  log "another run holds $LOCK; skipping"
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

CLONE="$WORK_DIR/repo"
if [ ! -d "$CLONE/.git" ]; then
  log "cloning $SITE_REPO_URL"
  "$GIT" clone --quiet "$SITE_REPO_URL" "$CLONE"
fi
cd "$CLONE"

attempt() {
  "$GIT" fetch --quiet origin
  "$GIT" checkout --quiet "$BRANCH"
  "$GIT" reset --quiet --hard "origin/$BRANCH"

  # The scraper exits 0 WITHOUT writing when Scholar refuses it, so a refusal
  # shows up below as "no change" rather than as an error.
  "$PYTHON" "$SCRAPER"

  # shellcheck disable=SC2086  # FILES is a deliberate word list
  if "$GIT" diff --quiet -- $FILES; then
    log "no change"
    return 0
  fi
  # shellcheck disable=SC2086
  "$GIT" add -- $FILES
  "$GIT" commit --quiet -m "$COMMIT_MSG"
  "$GIT" push --quiet origin "$BRANCH"
  log "pushed $("$GIT" rev-parse --short HEAD)"
}

# Check push credentials on every run, before scraping, so an expired token is
# reported the day it breaks rather than whenever the figures next change.
if ! "$GIT" push --dry-run --quiet origin "HEAD:refs/heads/$BRANCH" 2>/dev/null \
   && ! "$GIT" push --dry-run --quiet origin "$BRANCH" 2>/dev/null; then
  log "ERROR: cannot authenticate a push to $SITE_REPO_URL"
  exit 1
fi

# If another committer (e.g. the CI job) pushes between our fetch and our push,
# start again from the new remote state rather than rebasing a generated file.
if ! attempt; then
  log "push rejected; retrying from the latest remote state"
  attempt
fi
