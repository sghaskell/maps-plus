"""Unit tests for bin/rest/maps_plus/tile_proxy.py - stdlib unittest only.
Run via: ./run_tests.sh  (PYTHONPATH=tests:bin)

Covers pure functions and handler orchestration without a Splunk install.
The tests/splunk/rest.py stub shadows splunk.rest so TileProxyHandler
imports cleanly with `PYTHONPATH=tests:bin`.
"""

import io
import json
import os
import socket
import struct
import tempfile
import threading
import time
import unittest
from unittest import mock
from urllib.error import HTTPError, URLError

import tile_proxy as tp
# BaseRestHandler stub from tests/splunk/rest.py — imported here only to
# confirm it wires correctly on PYTHONPATH before the module under test
# reaches for it, and to back the subclass regression test below.
import splunk.rest


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
    """Build a TileProxyHandler with MockResponse + args populated.

    Post-UAT-4 the handler inherits splunk.rest.BaseRestHandler. The stub
    __init__ in tests/splunk/rest.py assigns self.args = {} and
    self.response = MockResponse() — we override args per-test and call
    handle_GET (or _handle_get_internal) directly. MockResponse duck-types
    setStatus / setHeader / write the same as Splunk's live response object.
    """
    h = tp.TileProxyHandler()
    h.args = dict(args) if args is not None else {}
    if settings is not None:
        tp._reset_settings_cache()
        tp._settings_cache = settings
    return h


def _run_get(h):
    """Run the GET orchestration against the MockResponse on h.response.

    Equivalent to calling h.handle_GET() but skips the defensive try/except
    wrapper so a test-side programming error surfaces as a real traceback
    rather than the sanitized 500 path.
    """
    tp._handle_get_internal(h.response, h.args)


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
        _run_get(h)
        self.assertEqual(h.response.status, 503)
        body = json.loads(h.response.body.decode("utf-8"))
        self.assertEqual(body, {"error": "proxy_disabled"})

    def test_missing_url_returns_400(self):
        h = _make_handler(args={}, settings={"enabled": True,
                                             "allowed_domains": SEED})
        _run_get(h)
        self.assertEqual(h.response.status, 400)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "missing_param_url"})

    def test_missing_zxy_returns_400(self):
        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png"},
            settings={"enabled": True, "allowed_domains": SEED})
        _run_get(h)
        self.assertEqual(h.response.status, 400)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "missing_param_zxy"})

    def test_invalid_params_returns_400(self):
        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "-1", "x": "0", "y": "0"},
            settings={"enabled": True, "allowed_domains": SEED})
        _run_get(h)
        self.assertEqual(h.response.status, 400)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "invalid_params"})

    def test_http_scheme_rejected_returns_400(self):
        h = _make_handler(
            args={"url": "http://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "1", "x": "1", "y": "1"},
            settings={"enabled": True, "allowed_domains": SEED})
        _run_get(h)
        self.assertEqual(h.response.status, 400)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "scheme_not_https"})

    # -- SSRF policy rejections return 403 (not 400) -------------------------
    # Per RFC 9110 §15.5.4, policy-based refusals get 403; 400 is reserved for
    # syntactically-bad requests the client could fix. UAT Test 4/5 (Phase 01)
    # surfaced this status-code mismatch; these tests lock the correct mapping.

    def test_host_not_allowed_returns_403(self):
        h = _make_handler(
            args={"url": "https://evil.example.com/{z}/{x}/{y}.png",
                  "z": "1", "x": "1", "y": "1"},
            settings={"enabled": True, "allowed_domains": SEED})
        _run_get(h)
        self.assertEqual(h.response.status, 403)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "host_not_allowed"})

    def test_private_ip_on_allowlisted_host_returns_403(self):
        """Allowlisted hostname but DNS resolves to a private IP (DNS rebinding
        / internal-network attack). Layer-4 SSRF defense must return 403."""
        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "1", "x": "1", "y": "1"},
            settings={"enabled": True, "allowed_domains": SEED})
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("127.0.0.1")):
            _run_get(h)
        self.assertEqual(h.response.status, 403)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "private_ip_blocked"})

    def test_cloud_metadata_ip_returns_403(self):
        """AWS/GCP metadata IP (169.254.169.254) resolution must return 403,
        not 400 — this is the canonical SSRF target."""
        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "1", "x": "1", "y": "1"},
            settings={"enabled": True, "allowed_domains": SEED})
        with mock.patch.object(
                tp.socket, "getaddrinfo",
                return_value=_fake_getaddrinfo("169.254.169.254")):
            _run_get(h)
        self.assertEqual(h.response.status, 403)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "private_ip_blocked"})

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
            _run_get(h)
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
                _run_get(h)
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
                _run_get(h)
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
                _run_get(h)
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
                _run_get(h)
        self.assertEqual(h.response.status, 502)
        self.assertEqual(json.loads(h.response.body.decode("utf-8")),
                         {"error": "upstream_oversize"})


# ---------------------------------------------------------------------------
# 8. DiskCache — size-capped, atomic-write, LRU-pruned, path-confined on-disk
# cache added in Plan 01-03.
# ---------------------------------------------------------------------------

class TestDiskCache(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache_dir = os.path.join(self.tmp.name, "cache")
        self.cache = tp.DiskCache(self.cache_dir, max_bytes=500 * 1024)

    def tearDown(self):
        self.tmp.cleanup()

    def test_enabled_on_writable_dir(self):
        self.assertTrue(self.cache.enabled)

    def test_disabled_on_permission_error(self):
        """T3-05 / audit A-06: PermissionError on makedirs -> enabled=False;
        get returns None and set is a silent no-op."""
        with mock.patch.object(tp.os, "makedirs",
                               side_effect=PermissionError("ro")):
            cache = tp.DiskCache(
                os.path.join(self.tmp.name, "noperm"), max_bytes=1024)
        self.assertFalse(cache.enabled)
        self.assertIsNone(cache.get("x" * 64))
        # Must not raise
        cache.set("x" * 64, (b"", "image/png", "max-age=60"))

    def test_disabled_on_readonly_fs_erofs(self):
        """T3-05: OSError(errno.EROFS) -> enabled=False (Splunk Cloud path)."""
        err = OSError("read-only filesystem")
        err.errno = tp.errno.EROFS
        with mock.patch.object(tp.os, "makedirs", side_effect=err):
            cache = tp.DiskCache(
                os.path.join(self.tmp.name, "rofs"), max_bytes=1024)
        self.assertFalse(cache.enabled)

    def test_roundtrip_preserves_content_type_and_cache_control(self):
        key = "b" * 64
        self.cache.set(key, (b"HELLO", "image/webp", "max-age=42"))
        got = self.cache.get(key)
        self.assertEqual(got, (b"HELLO", "image/webp", "max-age=42"))

    def test_sharded_path_by_first_two_hex(self):
        key = "abcdef" + "0" * 58
        self.cache.set(key, (b"DATA", "image/png", "max-age=60"))
        expected = os.path.join(self.cache_dir, "ab", key + ".tile")
        self.assertTrue(os.path.exists(expected),
                        "expected sharded file at %s" % expected)

    def test_atomic_write_no_tmp_leftovers(self):
        """T3-02: after several set() calls, no .tmp files remain."""
        for i in range(5):
            k = (hex(i)[2:].rjust(64, "0"))
            self.cache.set(k, (b"x" * 1024, "image/png", "max-age=60"))
        leftovers = []
        for root, _dirs, files in os.walk(self.cache_dir):
            for n in files:
                if n.startswith(".tmp"):
                    leftovers.append(os.path.join(root, n))
        self.assertEqual(leftovers, [])

    def test_get_missing_returns_none(self):
        self.assertIsNone(self.cache.get("deadbeef" * 8))

    def test_corrupt_file_returns_none(self):
        """Corrupt cache file -> get returns None, never raises."""
        key = "c" * 64
        path = self.cache._path_for(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(b"xyz")   # 3 bytes, not our 4-byte magic header
        self.assertIsNone(self.cache.get(key))

    def test_wrong_magic_header_returns_none(self):
        key = "d" * 64
        path = self.cache._path_for(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            # 4-byte wrong magic + valid-looking length fields
            f.write(b"XXXX")
            f.write(struct.pack(">I", 9))
            f.write(b"image/png")
            f.write(struct.pack(">I", 0))
            f.write(b"")
            f.write(b"data")
        self.assertIsNone(self.cache.get(key))

    def test_path_escape_rejected(self):
        """T3-01 / S-10: _assert_within_cache_dir raises ValueError on paths
        outside cache_dir, regardless of how they were constructed."""
        with self.assertRaises(ValueError):
            self.cache._assert_within_cache_dir("/etc/passwd")
        with self.assertRaises(ValueError):
            self.cache._assert_within_cache_dir(
                os.path.join(self.tmp.name, "outside.tile"))

    def test_assert_within_cache_dir_accepts_valid_path(self):
        valid = self.cache._path_for("e" * 64)
        # Does not raise
        self.cache._assert_within_cache_dir(valid)

    def test_lru_prune_removes_oldest_when_over_cap(self):
        """T3-04: prune enforces size cap by mtime LRU."""
        cache = tp.DiskCache(
            os.path.join(self.tmp.name, "prunecache"), max_bytes=300 * 1024)
        for i in range(10):
            k = hex(i)[2:].rjust(64, "0")
            cache.set(k, (b"x" * 100 * 1024, "image/png", "max-age=60"))
            # Ensure mtime differences on filesystems with 1s resolution
            time.sleep(0.01)
        total = 0
        for root, _dirs, files in os.walk(cache.cache_dir):
            for n in files:
                total += os.path.getsize(os.path.join(root, n))
        # Allow slack: prune fires *after* each write, so one in-flight entry
        # may push us slightly above the cap before eviction catches up.
        self.assertLessEqual(total, 400 * 1024,
                             "total=%d exceeded allowance" % total)
        # Earliest-written keys should be gone
        oldest_path = cache._path_for("0" * 64)
        self.assertFalse(os.path.exists(oldest_path))

    def test_touch_on_get_updates_mtime(self):
        key = "f" * 64
        self.cache.set(key, (b"D", "image/png", "max-age=60"))
        path = self.cache._path_for(key)
        old = os.stat(path).st_mtime
        time.sleep(0.05)
        self.cache.get(key)
        new = os.stat(path).st_mtime
        self.assertGreater(new, old)

    def test_content_type_default_when_none(self):
        key = "9" * 64
        self.cache.set(key, (b"D", None, None))
        got = self.cache.get(key)
        self.assertIsNotNone(got)
        _, ct, cc = got
        self.assertEqual(ct, "application/octet-stream")
        self.assertEqual(cc, tp.DEFAULT_CACHE_CONTROL)

    def test_set_when_disabled_is_noop(self):
        with mock.patch.object(tp.os, "makedirs",
                               side_effect=PermissionError("ro")):
            cache = tp.DiskCache(
                os.path.join(self.tmp.name, "disabled"), max_bytes=1024)
        # Neither raises nor writes anything
        cache.set("x" * 64, (b"DATA", "image/png", "max-age=60"))
        self.assertIsNone(cache.get("x" * 64))

    def test_set_rejects_non_bytes_data(self):
        with self.assertRaises(TypeError):
            self.cache.set("a" * 64, ("not-bytes", "image/png", "max-age=60"))


# ---------------------------------------------------------------------------
# 9. DiskCache concurrency — exercises the threading.Lock around
# set + _prune under multi-thread contention.
# ---------------------------------------------------------------------------

class TestDiskCacheConcurrency(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache_dir = os.path.join(self.tmp.name, "cache")

    def tearDown(self):
        self.tmp.cleanup()

    def test_concurrent_set_same_key(self):
        """T3-03: 8 threads racing on the same key — no exceptions; the
        final file is valid (one of the values written)."""
        cache = tp.DiskCache(self.cache_dir, max_bytes=10 * 1024 * 1024)
        key = "x" * 64
        errors = []

        def worker(seed):
            try:
                for _ in range(20):
                    payload = bytes([seed % 256]) * 1024
                    cache.set(key, (payload, "image/png", "max-age=60"))
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=worker, args=(i,))
                   for i in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])
        got = cache.get(key)
        self.assertIsNotNone(got)
        data, ct, cc = got
        # Data must be exactly 1024 bytes of a single byte value
        self.assertEqual(len(data), 1024)
        self.assertEqual(len(set(data)), 1)

    def test_concurrent_set_unique_keys(self):
        """8 threads x 50 unique keys = 400 writes, no exceptions,
        on-disk size stays within cap."""
        cache = tp.DiskCache(self.cache_dir, max_bytes=2 * 1024 * 1024)
        errors = []

        def worker(tid):
            try:
                for i in range(50):
                    k = ("%02x" % tid) + ("%062d" % i)   # 64 hex chars
                    cache.set(k, (b"x" * 2048, "image/png", "max-age=60"))
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=worker, args=(i,))
                   for i in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])
        total = 0
        file_count = 0
        for root, _dirs, files in os.walk(cache.cache_dir):
            for n in files:
                if not n.endswith(".tile"):
                    continue
                file_count += 1
                total += os.path.getsize(os.path.join(root, n))
        # Allow slack: one in-flight item may push us briefly above max.
        self.assertLessEqual(total, 2 * 1024 * 1024 + 8 * 2048)
        self.assertLessEqual(file_count, 400)

    def test_prune_under_contention(self):
        """Concurrent writes with active prune — cache size stays bounded
        and no OSError(file-not-found) leaks out of set()."""
        cache = tp.DiskCache(self.cache_dir, max_bytes=200 * 1024)
        errors = []

        def worker(tid):
            try:
                for i in range(20):
                    k = ("%02x" % tid) + ("%062d" % i)
                    cache.set(k, (b"x" * 10 * 1024,
                                  "image/png", "max-age=60"))
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=worker, args=(i,))
                   for i in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])
        # Final size bounded by max_bytes + a few in-flight items
        total = 0
        for root, _dirs, files in os.walk(cache.cache_dir):
            for n in files:
                if n.endswith(".tile"):
                    total += os.path.getsize(os.path.join(root, n))
        self.assertLessEqual(total, 300 * 1024)


# ---------------------------------------------------------------------------
# 10. TileProxyHandler.handle_GET — two-tier cache integration (memory + disk)
# ---------------------------------------------------------------------------

class TestHandleGetTwoTier(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cache_dir = os.path.join(self.tmp.name, "cache")
        tp._reset_settings_cache()
        tp._reset_memory_cache()
        tp._reset_disk_cache()
        # Inject a real DiskCache pointed at the tmpdir so the handler's
        # _get_disk_cache() returns it regardless of settings.disk_cache_enabled.
        self._injected_disk = tp.DiskCache(self.cache_dir,
                                           max_bytes=10 * 1024 * 1024)
        tp._disk_cache = self._injected_disk

    def tearDown(self):
        tp._reset_settings_cache()
        tp._reset_memory_cache()
        tp._reset_disk_cache()
        self.tmp.cleanup()

    def _resolved_url(self, z=7, x=7, y=7):
        return tp._resolve_tile(
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png", z, x, y)

    def test_disk_hit_promotes_to_memory(self):
        """Pre-populate disk only; call handle_GET; expect disk-hit header
        AND the entry now also lives in the memory cache (L2 -> L1 promote)."""
        resolved = self._resolved_url()
        key = tp._make_cache_key(resolved)
        self._injected_disk.set(
            key, (b"FROM_DISK", "image/png", "max-age=123"))

        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "7", "x": "7", "y": "7"},
            settings={"enabled": True, "allowed_domains": SEED,
                      "upstream_timeout_seconds": 10,
                      "cache_max_memory": 16})
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("8.8.8.8")):
            _run_get(h)

        self.assertEqual(h.response.status, 200)
        self.assertEqual(h.response.body, b"FROM_DISK")
        self.assertEqual(h.response.headers.get("x-maps-plus-cache"),
                         "disk-hit")
        self.assertEqual(h.response.headers.get("content-type"), "image/png")
        self.assertEqual(h.response.headers.get("cache-control"),
                         "max-age=123")

        # Memory should now contain the promoted entry
        mem = tp._get_memory_cache()
        self.assertEqual(mem.get(key),
                         (b"FROM_DISK", "image/png", "max-age=123"))

    def test_miss_writes_both_tiers(self):
        """Cold caches; mock _fetch_tile; after handle_GET, both memory
        and disk contain the key."""
        resolved = self._resolved_url(z=8, x=8, y=8)
        key = tp._make_cache_key(resolved)

        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "8", "x": "8", "y": "8"},
            settings={"enabled": True, "allowed_domains": SEED,
                      "upstream_timeout_seconds": 10,
                      "cache_max_memory": 16})
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("8.8.8.8")):
            with mock.patch.object(
                    tp, "_fetch_tile",
                    return_value=(b"NEWPNG", "image/png", "max-age=77")):
                _run_get(h)

        self.assertEqual(h.response.status, 200)
        self.assertEqual(h.response.body, b"NEWPNG")
        self.assertEqual(h.response.headers.get("x-maps-plus-cache"), "miss")

        mem = tp._get_memory_cache()
        self.assertEqual(mem.get(key), (b"NEWPNG", "image/png", "max-age=77"))
        disk_got = self._injected_disk.get(key)
        self.assertEqual(disk_got, (b"NEWPNG", "image/png", "max-age=77"))

    def test_disk_cache_set_failure_does_not_break_response(self):
        """T3-05 safety net: disk.set raises -> response still succeeds."""
        h = _make_handler(
            args={"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "9", "x": "9", "y": "9"},
            settings={"enabled": True, "allowed_domains": SEED,
                      "upstream_timeout_seconds": 10,
                      "cache_max_memory": 16})
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("8.8.8.8")):
            with mock.patch.object(
                    tp, "_fetch_tile",
                    return_value=(b"BYTES", "image/png", "max-age=5")):
                with mock.patch.object(
                        self._injected_disk, "set",
                        side_effect=RuntimeError("disk boom")):
                    _run_get(h)
        self.assertEqual(h.response.status, 200)
        self.assertEqual(h.response.body, b"BYTES")
        self.assertEqual(h.response.headers.get("x-maps-plus-cache"), "miss")


# ---------------------------------------------------------------------------
# 11. TileProxyHandler framework regression guards (UAT-4 gap-closure).
# Locks in the BaseRestHandler contract so a future refactor cannot silently
# regress binary-response behavior.
# ---------------------------------------------------------------------------

class TestHandlerFrameworkContract(unittest.TestCase):

    def setUp(self):
        tp._reset_settings_cache()
        tp._reset_memory_cache()

    def tearDown(self):
        tp._reset_settings_cache()
        tp._reset_memory_cache()

    def test_subclass_is_base_rest_handler(self):
        """UAT-4 regression guard: the handler MUST inherit from
        splunk.rest.BaseRestHandler so self.response.write() streams raw
        bytes on the HTTP wire unchanged. Inheriting from the persist
        framework re-introduces the JSON-payload corruption documented in
        UAT-3/retry-3."""
        self.assertTrue(issubclass(tp.TileProxyHandler,
                                   splunk.rest.BaseRestHandler))

    def test_response_write_accepts_raw_bytes(self):
        """UAT-4 regression guard: end-to-end handle_GET must pass raw PNG
        bytes (type == bytes) into self.response.write() — not str, not
        latin-1-decoded. If a future change re-introduces the latin-1 hack
        the type check here will fail.
        """
        tp._settings_cache = {"enabled": True,
                              "allowed_domains": SEED,
                              "upstream_timeout_seconds": 10,
                              "cache_max_memory": 16}
        h = tp.TileProxyHandler()
        h.args = {"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "z": "3", "x": "4", "y": "5"}
        captured = []
        real_write = h.response.write

        def spy(data):
            captured.append(data)
            return real_write(data)

        h.response.write = spy
        png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16   # real PNG magic
        with mock.patch.object(tp.socket, "getaddrinfo",
                               return_value=_fake_getaddrinfo("8.8.8.8")):
            with mock.patch.object(
                    tp, "_fetch_tile",
                    return_value=(png_bytes, "image/png", "max-age=60")):
                h.handle_GET()
        self.assertEqual(h.response.status, 200)
        # The body write (last write call) must be raw bytes, identical to
        # what the upstream returned. No str, no latin-1 round-trip.
        self.assertTrue(len(captured) >= 1)
        body_write = captured[-1]
        self.assertIsInstance(body_write, bytes,
                              "response.write() must receive raw bytes "
                              "for binary PNG payloads")
        self.assertEqual(body_write, png_bytes)
        self.assertEqual(h.response.body, png_bytes)

    def test_handle_get_method_exists(self):
        """scripttype=python dispatches GET -> handle_GET. Method absence
        would result in splunkd 404'ing the route."""
        self.assertTrue(hasattr(tp.TileProxyHandler, "handle_GET"))
        self.assertTrue(callable(tp.TileProxyHandler.handle_GET))


if __name__ == "__main__":
    unittest.main()
