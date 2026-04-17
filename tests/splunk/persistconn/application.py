"""Offline stub of splunk.persistconn.application for unittest.

Tests importing tile_proxy will resolve `import splunk.persistconn.application`
to this module when tests/ precedes bin/ on PYTHONPATH. In Splunk runtime the
real class is provided by splunkd's embedded Python environment.

The real PersistentServerConnectionApplication contract (Splunk 9.x):
  - splunkd invokes the SUBCLASS as `Subclass(command_line, command_arg)`.
    The subclass __init__ receives these two args, but the base class's
    __init__ takes NO args — forwarding them raises "takes 1 positional
    argument but 3 were given" at first-request time (caught by UAT-2).
  - Entry point: handle(in_string) -> dict with keys 'payload', 'status',
    'headers' (optional).
  - in_string is a JSON-encoded request dict with keys such as 'method',
    'path_info', 'query' (list of [k, v] pairs), 'headers' (dict),
    'payload' (str|None), 'session' (dict), 'connection' (dict).
"""


class PersistentServerConnectionApplication(object):
    """Minimal stub. Subclasses implement `handle(self, in_string)`.

    __init__ takes no args — matches real splunkd behavior.
    """

    def __init__(self):
        pass

    def handle(self, in_string):
        raise NotImplementedError("subclass must implement handle()")
