"""Screenshot the dashboard in three states: empty inputs, both filled."""
import os, sys, urllib.parse as _u
from pathlib import Path
from playwright.sync_api import sync_playwright

PASS = os.environ.get("SPLUNK_PASSWORD")
if not PASS:
    print("Set SPLUNK_PASSWORD env var", file=sys.stderr); sys.exit(2)

OUT = Path(__file__).parent / "airgap_test_results"
OUT.mkdir(exist_ok=True)

TILE_URL = "http://localhost/styles/basic-preview/{z}/{x}/{y}.png"
STYLE_URL = "http://localhost/styles/fiord.nginx.json"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_context(viewport={"width": 1600, "height": 1400}).new_page()
    page.goto("http://localhost:8000/en-US/account/login", wait_until="networkidle")
    page.fill('input[name="username"]', "admin")
    page.fill('input[name="password"]', PASS)
    try: page.click('input[type="submit"]', timeout=2000)
    except: page.click('text=Sign In', timeout=5000)
    page.wait_for_load_state("networkidle", timeout=30000)
    page.wait_for_timeout(1500)

    print("State 1: empty inputs")
    page.goto("http://localhost:8000/en-US/app/leaflet_maps_app/airgapped_tile_test", wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(3000)
    page.screenshot(path=str(OUT / "state1_empty.png"), full_page=True)

    print("State 2: both inputs set via URL params")
    url = (
        "http://localhost:8000/en-US/app/leaflet_maps_app/airgapped_tile_test"
        f"?form.tile_url={_u.quote(TILE_URL, safe=':/')}"
        f"&form.style_url={_u.quote(STYLE_URL, safe=':/')}"
    )
    page.goto(url, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(10000)
    page.screenshot(path=str(OUT / "state2_configured.png"), full_page=True)

    browser.close()
    print("done")
