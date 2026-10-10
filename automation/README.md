# Refreshing Google Scholar figures from your own machine

This site shows citation counts and a publication list scraped from Google
Scholar (`scripts/scholar_scrape.py`). A GitHub Actions job tries this several
times a day, but **Google Scholar blocks the IP ranges GitHub's runners use** —
here, roughly two runs in three. Retrying from the same runner does not help:
the block holds for the whole job. Scholar does not block home connections, so
the reliable fix is to run the same scraper on your own Mac on a schedule.

These two files do that with `launchd`, macOS's built-in scheduler:

| File | What it is |
|---|---|
| `scholar-refresh.sh` | Clones the site repo into a private working directory, runs the scraper, and commits and pushes only if the figures changed. Configured entirely by environment variables, so it needs no editing. |
| `com.example.scholar-refresh.plist` | A template `launchd` agent that runs the script twice a day. Fill in the placeholders. |

The CI job can stay switched on as a free backup.

## What the script does on each run

1. Takes a lock, so two runs can never overlap.
2. Checks it can **push** to the repo before doing anything else — an expired
   token is reported the day it breaks, not whenever the figures next change.
3. Resets its own clone hard to the remote. It never touches your normal
   checkout, so it cannot commit or clobber work in progress.
4. Runs the scraper. If Scholar refuses, the scraper writes nothing and the run
   ends as "no change".
5. Commits and pushes only the files the scraper writes. If someone else pushed
   in the meantime it starts again from the new remote state rather than
   rebasing a generated file.

A push made with your own credentials triggers your Pages deploy as normal.

## Setup

**1. Choose paths outside `~/Documents`, `~/Desktop` and `~/Downloads`.**
macOS privacy protection blocks `launchd` jobs from those folders and the job
fails with `Operation not permitted`. `~/Library/Application Support/` is fine.

```sh
mkdir -p ~/Library/Application\ Support/scholar-refresh
cp scholar-refresh.sh ~/Library/Application\ Support/scholar-refresh/
chmod +x ~/Library/Application\ Support/scholar-refresh/scholar-refresh.sh
```

**2. Find absolute paths for Python and git.** `launchd` does not see your shell
`PATH`. Python must have the scraper's dependencies:

```sh
python3 -c "import requests, bs4" && which python3   # use this path for PYTHON
which git                                            # use this path for GIT
```

**3. Make sure git can push without prompting.** Over HTTPS on a Mac this means
the `osxkeychain` credential helper with your token already stored — if
`git push` works in Terminal without asking for anything, it will work here.

**4. Fill in the plist.** Copy `com.example.scholar-refresh.plist` to
`~/Library/LaunchAgents/com.YOURNAME.scholar-refresh.plist`, replace every
ALL-CAPS placeholder, and set `Label` to match the filename. Check it:

```sh
plutil -lint ~/Library/LaunchAgents/com.YOURNAME.scholar-refresh.plist
```

**5. Load it and run it once now.**

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.YOURNAME.scholar-refresh.plist
launchctl kickstart -k gui/$(id -u)/com.YOURNAME.scholar-refresh
tail -n 20 ~/Library/Logs/scholar-refresh.log
```

A healthy first run clones the repo and ends with either `no change` or
`pushed <commit>`.

## Day to day

```sh
# Recent runs
tail -n 40 ~/Library/Logs/scholar-refresh.log

# Run it now, outside the schedule
launchctl kickstart -k gui/$(id -u)/com.YOURNAME.scholar-refresh

# Is it loaded, and how did the last run exit?
launchctl print gui/$(id -u)/com.YOURNAME.scholar-refresh | grep -E 'state|last exit'

# Remove it
launchctl bootout gui/$(id -u)/com.YOURNAME.scholar-refresh
```

If you edit `scholar-refresh.sh` here, copy it into Application Support again.
The installed copy is deliberately separate, so a change to the repo never
alters the scheduled job without you choosing to.

## Limits

- It runs only while you are logged in. A slot missed while the Mac sleeps runs
  on wake; a slot missed while it is shut down is skipped.
- It relies on Scholar continuing to tolerate residential traffic at two
  requests a day. That has held so far, but Scholar offers no API and can change
  this without notice.
