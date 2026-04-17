"""Offline stub of splunk.persistconn.application for unittest.

Tests importing tile_proxy will resolve `import splunk.persistconn.application`
to this module when tests/ precedes bin/ on PYTHONPATH. In Splunk runtime the
real class is provided by splunkd's embedded Python environment.

The real PersistentServerConnectionApplication contract (Splunk 9.x):
  - Constructor receives two positional args: command_line, command_arg.
  - Entry point: handle(in_string) -> dict with keys 'payload', 'status',
    'headers' (optional).
  - in_string is a JSON-encoded request dict with keys such as 'method',
    'path_info', 'query' (list of [k, v] pairs), 'headers' (dict),
    'payload' (str|None), 'session' (dict), 'connection' (dict).
"""


class PersistentServerConnectionApplication(object):
    """Minimal stub. Subclasses implement `handle(self, in_string)`."""

    def __init__(self, command_line=None, command_arg=None):
        self.command_line = command_line
        self.command_arg = command_arg

    def handle(self, in_string):
        raise NotImplementedError("subclass must implement handle()")
