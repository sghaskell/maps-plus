"""Offline stub of splunk.rest.BaseRestHandler for unittest.
Tests importing tile_proxy will resolve `import splunk.rest` to THIS module
when tests/ precedes bin/ on PYTHONPATH... actually tests/splunk/ must
shadow the real splunk package. Run tests with PYTHONPATH=tests:bin so
tests/splunk/ wins."""


class MockResponse(object):
    def __init__(self):
        self.headers = {}
        self.status = 200
        self.body = b""

    def setHeader(self, name, value):
        self.headers[name.lower()] = value

    def setStatus(self, code):
        self.status = int(code)

    def write(self, data):
        if isinstance(data, bytes):
            self.body += data
        else:
            self.body += data.encode("utf-8")


class BaseRestHandler(object):
    def __init__(self):
        self.args = {}
        self.response = MockResponse()
