"""Unit tests for bin/rest/maps_plus/tile_proxy.py - stdlib unittest only.
Run via: ./run_tests.sh  (PYTHONPATH=tests:bin)

Covers pure functions and handler orchestration without a Splunk install.
The tests/splunk/rest.py stub shadows splunk.rest so TileProxyHandler
imports cleanly with `PYTHONPATH=tests:bin`.
"""

import io
import json
import socket
import threading
import unittest
from unittest import mock
from urllib.error import HTTPError, URLError

from rest.maps_plus import tile_proxy as tp
from splunk.rest import BaseRestHandler  # stub from tests/splunk/rest.py


SEED = list(tp._FALLBACK_ALLOWED_DOMAINS)


def _fake_getaddrinfo(ip):
    """Return a getaddrinfo-shaped result list for a single IPv4 address."""
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]


# ---------------------------------------------------------------------------
# 1. _resolve_tile
# ---------------------------------------------------------------------------

class TestResolveTile(unittest.TestCase):

    def test_osm_standard(self):
        result = tp._resolve_tile(
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png", 10, 500, 300)
        self.assertEqual(result,
                         "https://tile.openstreetmap.org/10/500/300.png")

    def test_cartodb_subdomain_default(self):
        result = tp._resolve_tile(
            "https://{s}.basemaps.cartocdn.com/light/{z}/{x}/{y}.png",
            5, 10, 20)
        self.assertEqual(
            result, "https://a.basemaps.cartocdn.com/light/5/10/20.png")

    def test_gbif_retina_default_is_1_not_empty(self):
        """A-02 / Pitfall 5: default {r} must be '1' so @{r}x.png is valid."""
        result = tp._resolve_tile(
            "https://tile.gbif.org/3031/omt/{z}/{x}/{y}@{r}x.png?gbif-geyser",
            3, 4, 5)
        self.assertNotIn("@x.png", result)
        self.assertIn("@1x.png", result)
        self.assertEqual(
            result,
            "https://tile.gbif.org/3031/omt/3/4/5@1x.png?gbif-geyser")

    def test_esri_yx_order_literal_no_swap(self):
        """A-07: server must NOT auto-swap {x} and {y}. Esri template uses
        /{z}/{y}/{x}; with z=2, x=1, y=3 the path ends /2/3/1 because {y}
        is literally replaced with 3 and {x} with 1."""
        result = tp._resolve_tile(
            "https://server.arcgisonline.com/ArcGIS/rest/services/"
            "World_Imagery/MapServer/tile/{z}/{y}/{x}",
            2, 1, 3)
        self.assertTrue(result.endswith("/2/3/1"), result)

    def test_rejects_injection_in_z(self):
        with self.assertRaises(ValueError):
            tp._resolve_tile("https://a/{z}/{x}/{y}", "1\n2", 0, 0)

    def test_rejects_injection_in_x(self):
        with self.assertRaises(ValueError):
            tp._resolve_tile("https://a/{z}/{x}/{y}", 0, "1 OR 1=1", 0)

    def test_rejects_injection_in_y(self):
        with self.assertRaises(ValueError):
            tp._resolve_tile("https://a/{z}/{x}/{y}", 0, 0, "../../../etc")

    def test_rejects_negative_zxy(self):
        with self.assertRaises(ValueError):
            tp._resolve_tile("https://a/{z}/{x}/{y}", -1, 0, 0)

    def test_rejects_non_integer_zxy(self):
        with self.assertRaises(ValueError):
            tp._resolve_tile("https://a/{z}/{x}/{y}", "abc", 0, 0)

    def test_explicit_r_override(self):
        result = tp._resolve_tile(
            "https://tile.gbif.org/omt/{z}/{x}/{y}@{r}x.png",
            3, 4, 5, r="2")
        self.assertIn("@2x.png", result)


# ---------------------------------------------------------------------------
# 2. _host_allowed
# ---------------------------------------------------------------------------

class TestHostAllowed(unittest.TestCase):

    def test_exact_match(self):
        self.assertTrue(tp._host_allowed(
            "tile.openstreetmap.org", ["tile.openstreetmap.org"]))

    def test_exact_non_match(self):
        self.assertFalse(tp._host_allowed(
            "evil.com", ["tile.openstreetmap.org"]))

    def test_wildcard_matches_subdomain(self):
        self.assertTrue(tp._host_allowed(
            "a.basemaps.cartocdn.com", ["*.basemaps.cartocdn.com"]))

    def test_wildcard_matches_bare_domain(self):
        self.assertTrue(tp._host_allowed(
            "basemaps.cartocdn.com", ["*.basemaps.cartocdn.com"]))

    def test_wildcard_not_fooled_by_suffix(self):
        """Classic suffix-attack: evil.basemaps.cartocdn.com.attacker.com
        must NOT match *.basemaps.cartocdn.com."""
        self.assertFalse(tp._host_allowed(
            "evil.basemaps.cartocdn.com.attacker.com",
            ["*.basemaps.cartocdn.com"]))

    def test_empty_allowlist_denies_all(self):
        """D-02: empty list = deny-all."""
        self.assertFalse(tp._host_allowed("tile.openstreetmap.org", []))
        self.assertFalse(tp._host_allowed("anything.example", None))

    def test_case_insensitive(self):
        self.assertTrue(tp._host_allowed(
            "TILE.OpenStreetMap.ORG", ["tile.openstreetmap.org"]))


# ---------------------------------------------------------------------------
# 3. _validate_url
# ---------------------------------------------------------------------------

class TestValidateUrl(unittest.TestCase):

    def test_http_scheme_rejected(self):
        ok, err = tp._validate_url(
            "http://tile.openstreetmap.org/1/1/1.png", SEED)
        self.assertFalse(ok)
        self.assertEqual(err, "scheme_not_https")

    def test_disallowed_host_rejected(self):
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("8.8.8.8")):
            ok, err = tp._validate_url("https://evil.example.com/x", SEED)
        self.assertFalse(ok)
        self.assertEqual(err, "host_not_allowed")

    def test_injection_at_rejected(self):
        ok, err = tp._validate_url(
            "https://tile.openstreetmap.org/@internal/foo", SEED)
        self.assertFalse(ok)
        self.assertEqual(err, "invalid_chars")

    def test_injection_dotdot_rejected(self):
        ok, err = tp._validate_url(
            "https://tile.openstreetmap.org/../../../etc/passwd", SEED)
        self.assertFalse(ok)
        self.assertEqual(err, "invalid_chars")

    def test_private_ip_rejected_even_on_allowlisted_host(self):
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("127.0.0.1")):
            ok, err = tp._validate_url(
                "https://tile.openstreetmap.org/1/1/1.png", SEED)
        self.assertFalse(ok)
        self.assertEqual(err, "private_ip_blocked")

    def test_aws_metadata_ip_rejected(self):
        with mock.patch.object(
                tp.socket, "getaddrinfo",
                return_value=_fake_getaddrinfo("169.254.169.254")):
            ok, err = tp._validate_url(
                "https://tile.openstreetmap.org/1/1/1.png", SEED)
        self.assertFalse(ok)
        self.assertEqual(err, "private_ip_blocked")

    def test_rfc1918_private_rejected(self):
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("10.0.0.5")):
            ok, err = tp._validate_url(
                "https://tile.openstreetmap.org/1/1/1.png", SEED)
        self.assertFalse(ok)
        self.assertEqual(err, "private_ip_blocked")

    def test_valid_public_host(self):
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("8.8.8.8")):
            ok, err = tp._validate_url(
                "https://tile.openstreetmap.org/1/1/1.png", SEED)
        self.assertTrue(ok)
        self.assertIsNone(err)

    def test_dns_failure(self):
        with mock.patch.object(
                tp.socket, "getaddrinfo",
                side_effect=socket.gaierror("dns fail")):
            ok, err = tp._validate_url(
                "https://tile.openstreetmap.org/1/1/1.png", SEED)
        self.assertFalse(ok)
        self.assertEqual(err, "dns_failed")


# ---------------------------------------------------------------------------
# 4. LRUCache
# ---------------------------------------------------------------------------

class TestLRUCache(unittest.TestCase):

    def test_get_miss_returns_none(self):
        c = tp.LRUCache(maxsize=8)
        self.assertIsNone(c.get("missing"))

    def test_eviction_oldest_when_over_maxsize(self):
        c = tp.LRUCache(maxsize=2)
        c.set("a", b"1")
        c.set("b", b"2")
        c.set("c", b"3")
        self.assertIsNone(c.get("a"))
        self.assertEqual(c.get("b"), b"2")
        self.assertEqual(c.get("c"), b"3")

    def test_get_refreshes_lru_order(self):
        c = tp.LRUCache(maxsize=2)
        c.set("a", b"1")
        c.set("b", b"2")
        # touch 'a' so 'b' becomes the oldest
        self.assertEqual(c.get("a"), b"1")
        c.set("c", b"3")
        self.assertIsNone(c.get("b"))
        self.assertEqual(c.get("a"), b"1")
        self.assertEqual(c.get("c"), b"3")

    def test_set_overwrites_and_refreshes(self):
        c = tp.LRUCache(maxsize=2)
        c.set("a", b"1")
        c.set("b", b"2")
        c.set("a", b"9")  # update + move to end
        c.set("c", b"3")  # now 'b' is oldest and should evict
        self.assertIsNone(c.get("b"))
        self.assertEqual(c.get("a"), b"9")
        self.assertEqual(c.get("c"), b"3")

    def test_thread_safety_smoke(self):
        c = tp.LRUCache(maxsize=64)
        errors = []

        def worker(prefix):
            try:
                for i in range(100):
                    k = "%s-%d" % (prefix, i % 32)
                    c.set(k, b"v")
                    c.get(k)
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=worker, args=("t%d" % i,))
                   for i in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])
        self.assertLessEqual(len(c), 64)

    def test_rejects_zero_maxsize(self):
        with self.assertRaises(ValueError):
            tp.LRUCache(maxsize=0)


# ---------------------------------------------------------------------------
# 5. _make_cache_key
# ---------------------------------------------------------------------------

class TestMakeCacheKey(unittest.TestCase):

    def test_key_is_64_hex_chars(self):
        """A-11: full SHA-256 digest, no truncation."""
        key = tp._make_cache_key("https://x.example.com/a/b?c=1")
        self.assertEqual(len(key), 64)
        int(key, 16)  # parses as hex

    def test_case_normalized_host(self):
        a = tp._make_cache_key("https://Tile.OpenStreetMap.ORG/1/2/3.png")
        b = tp._make_cache_key("https://tile.openstreetmap.org/1/2/3.png")
        self.assertEqual(a, b)

    def test_different_paths_produce_different_keys(self):
        a = tp._make_cache_key("https://tile.openstreetmap.org/1/2/3.png")
        b = tp._make_cache_key("https://tile.openstreetmap.org/1/2/4.png")
        self.assertNotEqual(a, b)


# ---------------------------------------------------------------------------
# 6. _fetch_tile
# ---------------------------------------------------------------------------

class _FakeResp(object):
    """Minimal context-manager mock of an HTTPResponse."""

    def __init__(self, body, headers=None):
        self._body = body
        self.headers = headers or {}

    def read(self, n=None):
        if n is not None:
            out = self._body[:n]
            self._body = self._body[n:]
            return out
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestFetchTile(unittest.TestCase):

    def test_oversize_raises(self):
        body = b"x" * (tp.MAX_TILE_BYTES + 1)
        resp = _FakeResp(body, {"content-type": "image/png"})
        with mock.patch.object(tp._opener, "open", return_value=resp):
            with self.assertRaises(ValueError) as ctx:
                tp._fetch_tile("https://tile.openstreetmap.org/1/1/1.png")
        self.assertEqual(str(ctx.exception), "upstream_response_too_large")

    def test_forwards_content_type_and_cache_control(self):
        resp = _FakeResp(b"PNGDATA", {
            "content-type": "image/webp",
            "cache-control": "max-age=600",
        })
        with mock.patch.object(tp._opener, "open", return_value=resp):
            data, ct, cc = tp._fetch_tile(
                "https://tiles.stadiamaps.com/foo/1/1/1.png")
        self.assertEqual(data, b"PNGDATA")
        self.assertEqual(ct, "image/webp")
        self.assertEqual(cc, "max-age=600")

    def test_default_cache_control_when_upstream_omits(self):
        resp = _FakeResp(b"PNGDATA", {"content-type": "image/png"})
        with mock.patch.object(tp._opener, "open", return_value=resp):
            _, _, cc = tp._fetch_tile("https://tile.openstreetmap.org/1/1/1.png")
        self.assertEqual(cc, tp.DEFAULT_CACHE_CONTROL)

    def test_default_content_type_when_upstream_omits(self):
        resp = _FakeResp(b"BYTES", {})
        with mock.patch.object(tp._opener, "open", return_value=resp):
            _, ct, _ = tp._fetch_tile("https://tile.openstreetmap.org/1/1/1.png")
        self.assertEqual(ct, "application/octet-stream")


# ---------------------------------------------------------------------------
# 7. TileProxyHandler.handle_GET
# ---------------------------------------------------------------------------

def _make_handler(args=None, settings=None):
    """Build a TileProxyHandler around the stub BaseRestHandler, injecting
    args and an override _load_settings result."""
    h = tp.TileProxyHandler.__new__(tp.TileProxyHandler)
    # BaseRestHandler.__init__ sets self.args + self.response
    BaseRestHandler.__init__(h)
    if args is not None:
        h.args = dict(args)
    if settings is not None:
        # Force settings cache
        tp._reset_settings_cache()
        tp._settings_cache = settings
    return h


class TestHandleGetOrchestration(unittest.TestCase):

    def setUp(self):
        tp._reset_settings_cache()
        tp._reset_memory_cache()

    def tearDown(self):
        tp._reset_settings_cache()
        tp._reset_memory_cache()

    def test_disabled_returns_503(self):
        """A-09: enabled=false -> 503 proxy_disabled."""
        h = _make_handler(args={"url": "x"}, settings={"enabled": False})
        h.handle_GET()
        self.assertEqual(h.response.status, 503)
        body = json.loads(h.response.body.decode("utf-8"))
        self.assertEqual(body, {"error": "proxy_disabled"})

    def test_missing_url_returns_400(self):
        h = _make_handler(args={}, settings={"enabled": True,
                                             "allowed_domains": SEED})
        h.handle_GET()
        self.assertEqual(h.response.status, 400)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "missing_param_url"})

    def test_missing_zxy_returns_400(self):
        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png"},
            settings={"enabled": True, "allowed_domains": SEED})
        h.handle_GET()
        self.assertEqual(h.response.status, 400)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "missing_param_zxy"})

    def test_invalid_params_returns_400(self):
        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "-1", "x": "0", "y": "0"},
            settings={"enabled": True, "allowed_domains": SEED})
        h.handle_GET()
        self.assertEqual(h.response.status, 400)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "invalid_params"})

    def test_http_scheme_rejected_returns_400(self):
        h = _make_handler(
            args={"url": "http://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "1", "x": "1", "y": "1"},
            settings={"enabled": True, "allowed_domains": SEED})
        h.handle_GET()
        self.assertEqual(h.response.status, 400)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "scheme_not_https"})

    def test_cache_hit_sets_hit_header(self):
        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "1", "x": "1", "y": "1"},
            settings={"enabled": True, "allowed_domains": SEED,
                      "upstream_timeout_seconds": 10,
                      "cache_max_memory": 16})
        # Pre-populate cache
        resolved = tp._resolve_tile(
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png", 1, 1, 1)
        key = tp._make_cache_key(resolved)
        tp._get_memory_cache().set(
            key, (b"CACHEDPNG", "image/png", "max-age=7200"))
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("8.8.8.8")):
            h.handle_GET()
        self.assertEqual(h.response.status, 200)
        self.assertEqual(h.response.body, b"CACHEDPNG")
        self.assertEqual(h.response.headers.get("x-maps-plus-cache"), "hit")
        self.assertEqual(h.response.headers.get("content-type"), "image/png")

    def test_full_flow_with_mocked_upstream(self):
        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "2", "x": "2", "y": "2"},
            settings={"enabled": True, "allowed_domains": SEED,
                      "upstream_timeout_seconds": 10,
                      "cache_max_memory": 16})
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("8.8.8.8")):
            with mock.patch.object(
                    tp, "_fetch_tile",
                    return_value=(b"PNGBYTES", "image/png", "max-age=60")):
                h.handle_GET()
        self.assertEqual(h.response.status, 200)
        self.assertEqual(h.response.body, b"PNGBYTES")
        self.assertEqual(h.response.headers.get("x-maps-plus-cache"), "miss")
        self.assertEqual(h.response.headers.get("content-type"), "image/png")
        self.assertEqual(h.response.headers.get("cache-control"), "max-age=60")

    def test_upstream_http_error_returns_502(self):
        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "2", "x": "2", "y": "2"},
            settings={"enabled": True, "allowed_domains": SEED,
                      "upstream_timeout_seconds": 10,
                      "cache_max_memory": 16})
        err = HTTPError("https://x/", 403, "Forbidden", {}, io.BytesIO(b""))
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("8.8.8.8")):
            with mock.patch.object(tp, "_fetch_tile", side_effect=err):
                h.handle_GET()
        self.assertEqual(h.response.status, 502)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "upstream_error"})

    def test_upstream_timeout_returns_504(self):
        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "2", "x": "2", "y": "2"},
            settings={"enabled": True, "allowed_domains": SEED,
                      "upstream_timeout_seconds": 10,
                      "cache_max_memory": 16})
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("8.8.8.8")):
            with mock.patch.object(tp, "_fetch_tile",
                                   side_effect=socket.timeout("slow")):
                h.handle_GET()
        self.assertEqual(h.response.status, 504)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "upstream_timeout"})

    def test_upstream_oversize_returns_502(self):
        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "2", "x": "2", "y": "2"},
            settings={"enabled": True, "allowed_domains": SEED,
                      "upstream_timeout_seconds": 10,
                      "cache_max_memory": 16})
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("8.8.8.8")):
            with mock.patch.object(
                    tp, "_fetch_tile",
                    side_effect=ValueError("upstream_response_too_large")):
                h.handle_GET()
        self.assertEqual(h.response.status, 502)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "upstream_oversize"})


if __name__ == "__main__":
    unittest.main()
