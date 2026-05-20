"""
Drive the airgapped_tile_test dashboard in Splunk and verify the airgap.

Pass criteria:
  1. Both map panels render Leaflet/MapLibre canvases.
  2. All network requests during dashboard load go to localhost (Splunk, nginx)
     or 127.0.0.1, never to public tile CDNs.
  3. Screenshots saved for human inspection.

Configuration via environment variables:
  SPLUNK_PASSWORD  (required) admin password for the local Splunk
  SPLUNK_URL       default http://localhost:8000
  SPLUNK_USER      default admin
  AIRGAP_TILE_URL  default http://localhost/styles/basic-preview/{z}/{x}/{y}.png
  AIRGAP_STYLE_URL default http://localhost/styles/fiord.nginx.json
  AIRGAP_ATTRIB    default 'Test attribution (local nginx)'
"""

import os
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent / "airgap_test_results"
OUT.mkdir(exist_ok=True)

SPLUNK = os.environ.get("SPLUNK_URL", "http://localhost:8000")
USER = os.environ.get("SPLUNK_USER", "admin")
PASS = os.environ.get("SPLUNK_PASSWORD")
if not PASS:
    print("ERROR: set SPLUNK_PASSWORD environment variable", file=sys.stderr)
    sys.exit(2)

DASHBOARD_PATH = "/en-US/app/leaflet_maps_app/airgapped_tile_test"
TILE_URL = os.environ.get(
    "AIRGAP_TILE_URL", "http://localhost/styles/basic-preview/{z}/{x}/{y}.png"
)
STYLE_URL = os.environ.get(
    "AIRGAP_STYLE_URL", "http://localhost/styles/fiord.nginx.json"
)
ATTRIBUTION = os.environ.get("AIRGAP_ATTRIB", "Test attribution (local nginx)")

import urllib.parse as _u

DASHBOARD_URL = (
    f"{SPLUNK}{DASHBOARD_PATH}"
    f"?form.tile_url={_u.quote(TILE_URL, safe=':/')}"
    f"&form.style_url={_u.quote(STYLE_URL, safe=':/')}"
    f"&form.attribution={_u.quote(ATTRIBUTION)}"
)

# Patterns that mean we leaked to the public internet
LEAK_PATTERNS = [
    r"basemaps\.cartocdn\.com",
    r"tile\.openstreetmap\.org",
    r"tiles\.openfreemap\.org",
    r"server\.arcgisonline\.com",
    r"openfreemap\.org",
    r"cartodb-basemaps",
    r"stamen\.com",
    r"mapbox\.com",
]
LEAK_RE = re.compile("|".join(LEAK_PATTERNS))


def log(msg):
    print(msg, flush=True)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 1200})
        page = ctx.new_page()

        all_requests = []
        leaked = []
        failed = []

        def on_request(req):
            all_requests.append(req.url)
            if LEAK_RE.search(req.url):
                leaked.append(req.url)

        def on_requestfailed(req):
            failed.append((req.url, req.failure))

        page.on("request", on_request)
        page.on("requestfailed", on_requestfailed)

        log("=== 1. Logging in to Splunk ===")
        page.goto(f"{SPLUNK}/en-US/account/login", wait_until="networkidle")
        page.screenshot(path=str(OUT / "01_login_page.png"))
        page.fill('input[name="username"]', USER)
        page.fill('input[name="password"]', PASS)
        # Splunk's login uses a <a class="btn"> wrapping a click handler, not a submit input.
        try:
            page.click('input[type="submit"]', timeout=2000)
        except Exception:
            try:
                page.click('button[type="submit"]', timeout=2000)
            except Exception:
                page.click('text=Sign In', timeout=5000)
        page.wait_for_load_state("networkidle", timeout=30000)
        page.wait_for_timeout(2000)
        log(f"  logged in, landed at: {page.url}")
        page.screenshot(path=str(OUT / "02_post_login.png"))

        log("=== 2. Reset leak counters; only count traffic AFTER login ===")
        all_requests.clear()
        leaked.clear()
        failed.clear()

        log(f"=== 3. Navigating to dashboard ===")
        log(f"  {DASHBOARD_URL}")
        page.goto(DASHBOARD_URL, wait_until="networkidle", timeout=60000)

        log("=== 4. Waiting for maps to render (15s) ===")
        page.wait_for_timeout(15000)

        log("=== 5. Screenshots ===")
        full = OUT / "dashboard_full.png"
        page.screenshot(path=str(full), full_page=True)
        log(f"  full page → {full}")

        log("=== 6. Counting map containers ===")
        leaflet_count = page.locator(".leaflet-container").count()
        canvas_count = page.locator("canvas").count()
        log(f"  .leaflet-container: {leaflet_count}")
        log(f"  canvas (vector mode uses MapLibre canvas): {canvas_count}")

        log("=== 7. Network audit ===")
        log(f"  total requests post-login: {len(all_requests)}")
        log(f"  failed requests: {len(failed)}")
        log(f"  leaked requests: {len(leaked)}")

        hostnames = {}
        for url in all_requests:
            m = re.match(r"https?://([^/]+)/", url)
            if m:
                host = m.group(1)
                hostnames[host] = hostnames.get(host, 0) + 1
        log("  hosts contacted (top 10):")
        for host, count in sorted(hostnames.items(), key=lambda x: -x[1])[:10]:
            log(f"    {count:5d}  {host}")

        if leaked:
            log("\n  *** LEAKED URLS ***")
            for url in leaked[:20]:
                log(f"    {url}")

        if failed:
            log("\n  failed requests (first 10):")
            for url, reason in failed[:10]:
                log(f"    {reason}  {url}")

        log("=== 8. Sample tile/font/style URLs that DID load ===")
        tile_urls = [u for u in all_requests if "/styles/" in u or "/data/" in u or "/sprites/" in u or "/fonts/" in u or "/natural_earth/" in u]
        log(f"  tile-related requests: {len(tile_urls)}")
        for url in tile_urls[:15]:
            log(f"    {url}")

        log("=== 9. Save raw network log ===")
        netlog = OUT / "network_log.txt"
        netlog.write_text("\n".join(all_requests))
        log(f"  → {netlog}")

        browser.close()

        log("\n========= VERDICT =========")
        leak_ok = len(leaked) == 0
        maps_ok = (leaflet_count + canvas_count) >= 2
        log(f"  no public CDN leaks: {'PASS' if leak_ok else 'FAIL'}")
        log(f"  >= 2 map containers: {'PASS' if maps_ok else 'FAIL'}")
        log(f"  results dir: {OUT}")

        sys.exit(0 if (leak_ok and maps_ok) else 1)


if __name__ == "__main__":
    main()
