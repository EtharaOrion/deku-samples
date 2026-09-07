"""Container health: the app is ready once the roster can be read."""
import os
import sys
import urllib.request

url = f"http://127.0.0.1:{os.environ.get('PORT', '4173')}/api/health"
try:
    with urllib.request.urlopen(url, timeout=4) as response:
        sys.exit(0 if response.status == 200 else 1)
except Exception:
    sys.exit(1)
