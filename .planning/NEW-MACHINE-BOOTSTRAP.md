# New MacBook Bootstrap — Maps+ Dashboard Studio Project

> **Hand this entire file to your new MacBook's Cursor/Claude as the first
> prompt.** It is self-contained and project-aware. Treat every numbered
> step as required unless explicitly marked OPTIONAL. Stop and ask the
> human for help if any verification step fails.

---

## What this project is

`leaflet_maps_app` (a.k.a. **Maps+**) is a Splunk custom visualization that
renders interactive Leaflet maps. It currently has an in-flight feature
branch — `feature/dashboard-studio-tile-proxy-v2` — that adds a Python REST
proxy + JavaScript client integration so that Maps+ can render raster
tiles inside a **Dashboard Studio (DS)** iframe (which has a strict CSP
that blocks direct CDN access).

**Current state of the work** (read `.planning/STATE.md` for full detail):
- Phase 1 (Python REST proxy backend): ✅ complete, secured, 77 unit tests pass, UAT 8/8
- Phase 2 (JS integration + Jest harness + bundle rebuild): ✅ code complete, 20 Jest tests pass, awaiting **human-driven UAT** against a live Splunk+DS instance
- The point of bringing up this new MacBook is to **run that UAT** and then close out Milestone 1.

---

## ⚠️ STEP 0 (DO THIS FIRST, BEFORE ANYTHING ELSE)

**Rotate the leaked GitHub Personal Access Token.**

Background: a PAT was previously embedded in the `github` git remote URL
of this repo (`https://ghp_FQWr********@github.com/sghaskell/maps-plus.git`).
It has been removed from git config on the OLD machine and re-stored in
macOS Keychain, but the token itself **must be rotated** because it has
been visible to AI sessions, terminal recordings, and screen shares.

1. Sign in to https://github.com/settings/tokens (with the `sghaskell` account).
2. Find the token starting `ghp_FQWr...` and **revoke** it.
3. Create a new fine-grained or classic PAT with these scopes only:
   - `repo` (full control of private repositories)
   - `workflow` (if GitHub Actions are used — currently they are not)
   - **No** `admin:org`, **no** `delete_repo`, **no** `gist`.
4. Set expiry to **90 days max**.
5. Copy the new token to your clipboard. You will use it in Step 4.
6. **Do not** paste the new token into chat, source files, or commit messages.

---

## STEP 1 — System prerequisites (one-time, ~10 min)

### 1a. Install Homebrew (if not already installed)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After install, follow the post-install instructions to add `brew` to your PATH (usually appending to `~/.zprofile`).

### 1b. Install Xcode Command Line Tools (required for native npm modules)

```bash
xcode-select --install
```

(If a dialog opens, click Install. If `xcode-select: error: command line tools are already installed` — great, move on.)

### 1c. Install runtime tools via Homebrew

```bash
brew install \
  git \
  node@20 \
  python@3.11 \
  gh

# Link node@20 as the default node binary
brew link --overwrite node@20
```

**Why these specific versions:**
- `node@20` — LTS; matches what the OLD MacBook used (v24.14.0 also works, but 20 LTS is the safe long-term default). The Webpack 5 + Babel 7 build is happy with Node 18+.
- `python@3.11` — Splunk 10 ships with Python 3.9; 3.11 is fine for running the project's `tests/test_tile_proxy.py` standalone (it uses stdlib only). Python 3.9.6 (Apple-provided) also works.
- `gh` — official GitHub CLI; lets you authenticate without ever embedding a token in a remote URL.

### 1d. Install Docker Desktop (required for Splunk container)

1. Download from https://www.docker.com/products/docker-desktop/ (Apple Silicon build).
2. Install, launch, accept the license.
3. In Docker Desktop → Settings → Resources, give it at least **4 CPUs / 4 GB RAM** (Splunk is heavy).
4. Verify:

```bash
docker --version
docker run --rm hello-world
```

### 1e. Verify all tools

Run these and confirm versions are at-or-above the minimums:

```bash
git --version           # >= 2.40
node --version          # >= v20
npm --version           # >= 10
python3 --version       # >= 3.9
docker --version        # >= 24
gh --version            # >= 2.40
```

---

## STEP 2 — Authenticate with GitHub (no embedded tokens)

Choose **ONE** of the two options below. Option A is recommended.

### Option A — `gh auth login` (recommended)

```bash
gh auth login
```

Walk through the interactive prompts:
- GitHub.com
- HTTPS
- Authenticate with a web browser (paste the one-time code)
- Sign in as `sghaskell`

`gh` will store the new PAT (the one you just rotated in Step 0) in macOS
Keychain. Subsequent `git push` to GitHub will use it transparently.

### Option B — SSH keys (alternative)

```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
eval "$(ssh-agent -s)"
ssh-add --apple-use-keychain ~/.ssh/id_ed25519
pbcopy < ~/.ssh/id_ed25519.pub
```

Then add the key at https://github.com/settings/keys.

If you choose Option B, also change the remote URL in Step 3c.

---

## STEP 3 — Clone the repository

### 3a. Pick a location

```bash
mkdir -p ~/Documents/code
cd ~/Documents/code
```

### 3b. Clone

```bash
gh repo clone sghaskell/maps-plus
cd maps-plus
```

(If you skipped `gh auth login` and chose SSH in Step 2 Option B:
`git clone git@github.com:sghaskell/maps-plus.git`)

### 3c. Verify remotes have NO embedded tokens

```bash
git remote -v
```

Expected output (NO `ghp_*` tokens visible):

```
chrisyounger  https://github.com/ChrisYounger/maps-plus.git (fetch)
chrisyounger  https://github.com/ChrisYounger/maps-plus.git (push)
github        https://github.com/sghaskell/maps-plus.git (fetch)
github        https://github.com/sghaskell/maps-plus.git (push)
```

If you see `https://ghp_...@github.com/...` anywhere, **stop** and run:

```bash
git remote set-url github https://github.com/sghaskell/maps-plus.git
git remote set-url --push github https://github.com/sghaskell/maps-plus.git
```

### 3d. Switch to the in-flight feature branch

```bash
git fetch github
git checkout feature/dashboard-studio-tile-proxy-v2
git log --oneline -5
```

The most recent commit should be `6f2f206 docs(02-02): rename 02-UAT.md → 02-UAT-MATRIX.md to free the session filename` (or newer if work has continued).

---

## STEP 4 — Install JS dependencies

**CRITICAL:** Use `--ignore-scripts` to avoid the broken postinstall in
the `sghaskell/leaflet-measure#master` fork (it tries to run `node-sass`
which fails on modern Node). This is documented in the project's `CLAUDE.md`.

```bash
cd appserver/static/visualizations/maps-plus
npm install --ignore-scripts
```

Expected output:
- `added ~1300 packages` (give or take)
- `9 vulnerabilities (4 low, 2 moderate, 3 high)` — these are in transitive
  Webpack/Jest deps; they do **not** affect the shipped Splunk app because
  the bundled `visualization.js` only contains runtime code, not Webpack itself.

---

## STEP 5 — Verify the toolchain works

Run the two test suites that are currently the project's quality gate.

### 5a. JavaScript tests (Jest, ~1 second)

```bash
cd ~/Documents/code/maps-plus/appserver/static/visualizations/maps-plus
npm test
```

**Expected:**
```
Test Suites: 1 passed, 1 total
Tests:       20 passed, 20 total
```

If anything fails: **stop**, screenshot, and ask the human. Phase 02
verification depends on these 20 tests being green.

### 5b. Python tests (stdlib unittest, ~1 second)

```bash
cd ~/Documents/code/maps-plus
bash run_tests.sh
```

**Expected:**
```
Ran 77 tests in 0.9s
OK
```

### 5c. Build verification

```bash
cd ~/Documents/code/maps-plus/appserver/static/visualizations/maps-plus
npm run build
```

**Expected:** Webpack 5 compiles successfully in ~15 seconds with no warnings.
The output `visualization.js` should be approximately 4.6 MB.

If the build modified `visualization.js`, **do not commit** unless `git diff`
shows the change is non-empty (Webpack bundle hashes can shift between
machines; the test of record is whether `npm test` still passes).

---

## STEP 6 — Bring up Splunk in Docker

The OLD MacBook used a container named `splunk-10-dev-3` running
`splunk/splunk:10.2.0`. We will create the equivalent on this machine.

### 6a. Pull the image

```bash
docker pull splunk/splunk:10.2.0
```

### 6b. Pick an admin password

Choose a strong password — minimum 8 chars, you'll use it to log into
Splunk Web. **Do not** put it in source control. Export it for this shell:

```bash
read -s -p "Splunk admin password: " SPLUNK_PASSWORD
echo
export SPLUNK_PASSWORD
```

### 6c. Start the container

```bash
docker run -d \
  --name splunk-10-dev \
  --hostname splunk-10-dev \
  -p 8000:8000 \
  -p 8089:8089 \
  -e "SPLUNK_START_ARGS=--accept-license" \
  -e "SPLUNK_PASSWORD=${SPLUNK_PASSWORD}" \
  splunk/splunk:10.2.0
```

Wait ~60 seconds for Splunk to finish bootstrapping, then check health:

```bash
docker ps --filter name=splunk-10-dev
# STATUS column should say "Up X seconds (healthy)"
```

### 6d. Smoke-test the web UI

Open http://localhost:8000 in your browser. Log in as `admin` with the
password you set in Step 6b.

---

## STEP 7 — Deploy the Maps+ app to Splunk

### 7a. Build the release tarball

```bash
cd ~/Documents/code/maps-plus
bash build_release.sh
```

This produces `leaflet_maps_app_4.6.1.tar.gz` at the repo root.

### 7b. Upload via Splunk UI

1. In the Splunk web UI: **Apps** (top-left gear icon) → **Manage Apps** → **Install app from file**.
2. Choose the tarball you just built.
3. Check "Upgrade app" if a previous version is installed.
4. Click **Upload**.
5. When prompted, restart Splunk.

### 7c. Verify Phase 1 endpoint is alive

```bash
curl -k -u admin:${SPLUNK_PASSWORD} \
  "https://localhost:8089/services/maps_plus/tile/proxy?url=https://tile.openstreetmap.org/{z}/{x}/{y}.png&z=1&x=0&y=0" \
  -o /tmp/test-tile.png

file /tmp/test-tile.png
# Expected: PNG image data, 256 x 256
```

If you get HTML instead of a PNG, check container logs:

```bash
docker logs splunk-10-dev 2>&1 | grep -i maps_plus | tail -20
```

---

## STEP 8 — Read the project state and resume

This is the actual handoff. Read these files in order:

```bash
cd ~/Documents/code/maps-plus

cat .planning/HANDOFF.json
cat .planning/phases/02-maps-plus-js-integration-testing/.continue-here.md
cat .planning/STATE.md
cat .planning/phases/02-maps-plus-js-integration-testing/02-01-SUMMARY.md
cat .planning/phases/02-maps-plus-js-integration-testing/02-02-SUMMARY.md
cat .planning/phases/02-maps-plus-js-integration-testing/02-UAT-MATRIX.md
```

Once you have read those, the next action is:

```
/gsd-verify-work 2
```

This launches the conversational UAT workflow. It will create a fresh
session file at `.planning/phases/02-maps-plus-js-integration-testing/02-UAT.md`
with ~6-8 user-observable tests extracted from the SUMMARYs, and walk
you through each one against the live Splunk+DS instance you just brought
up.

---

## STEP 9 — (OPTIONAL) Install GSD SDK and Cursor skills

The project uses the **Get-Shit-Done** workflow framework. Most workflows
work with file inspection only, but a few are smoother if `gsd-sdk` is on
PATH.

If the GSD project has its own README on the user's GitHub or local
filesystem, follow that. If not, this step is **safe to skip** — the
core `/gsd-verify-work` workflow runs in sequential-inline mode without
the SDK.

---

## Appendix A — Useful one-liners

```bash
# Tail Splunk logs for Maps+ activity
docker logs -f splunk-10-dev 2>&1 | grep -i maps_plus

# Re-deploy after editing src/maps-plus.js (rebuild + redeploy)
cd appserver/static/visualizations/maps-plus && npm run build && cd ../../../.. && bash build_release.sh
# then re-upload the .tgz via Splunk UI

# Run a single Jest test by name
cd appserver/static/visualizations/maps-plus && npx jest -t "encodes the template"

# Stop Splunk container without losing state
docker stop splunk-10-dev

# Start it again
docker start splunk-10-dev

# Wipe and start over (DESTROYS all dashboards/data)
docker rm -f splunk-10-dev && docker run -d ...  (re-run Step 6c)
```

---

## Appendix B — Files NOT to commit

The `.gitignore` already covers most of these, but be aware:

- `appserver/static/visualizations/maps-plus/node_modules/` — gitignored
- `leaflet_maps_app_*.tar.gz` — gitignored (release artifacts)
- `__pycache__/`, `*.pyc` — gitignored
- Any file containing a token, password, or API key — never, ever commit

---

## Appendix C — Sanity checks before resuming work

When the new MacBook's environment is fully set up, this single command
should print all green:

```bash
cd ~/Documents/code/maps-plus && \
  echo "=== branch ===" && git branch --show-current && \
  echo "=== git remotes (no tokens visible) ===" && git remote -v | grep -v ghp_ && \
  echo "=== node ===" && node --version && \
  echo "=== python ===" && python3 --version && \
  echo "=== docker ===" && docker --version && \
  echo "=== splunk container ===" && docker ps --filter name=splunk-10-dev --format "{{.Status}}" && \
  echo "=== JS tests ===" && (cd appserver/static/visualizations/maps-plus && npm test 2>&1 | tail -3) && \
  echo "=== Python tests ===" && bash run_tests.sh 2>&1 | tail -3 && \
  echo "=== READY ==="
```

If you see `=== READY ===` at the end with no failures above it, you're
clear to run `/gsd-verify-work 2` and pick up where the OLD MacBook
left off.

---

*Generated 2026-04-18 during /gsd-pause-work. The corresponding HANDOFF.json
and .continue-here.md were committed in the same WIP commit.*
