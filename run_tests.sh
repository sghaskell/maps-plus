#!/usr/bin/env sh
# Runs the unittest suite without a Splunk install.
# PYTHONPATH order matters: tests/ must come BEFORE bin/ so
# tests/splunk/rest.py shadows any real splunk.rest import.
set -eu
cd "$(dirname "$0")"

# Pick the best available python3 interpreter. On Linux/macOS/Splunk, `python3`
# is canonical. On Windows Git Bash, `python3` often points to the MS Store
# shim; `python` (Python 3.x) or `py -3` is usable.
if command -v python3 >/dev/null 2>&1 && python3 -c "import sys; sys.exit(0 if sys.version_info[0]==3 else 1)" >/dev/null 2>&1; then
    PY=python3
elif command -v python >/dev/null 2>&1 && python -c "import sys; sys.exit(0 if sys.version_info[0]==3 else 1)" >/dev/null 2>&1; then
    PY=python
elif command -v py >/dev/null 2>&1; then
    PY="py -3"
else
    echo "ERROR: no python3 interpreter found on PATH" >&2
    exit 1
fi

PYTHONPATH=tests:bin $PY -m unittest discover -s tests -p 'test_*.py' -v
