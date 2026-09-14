#!/usr/bin/env python3
"""Rename the two open-licence variable fonts to the house's family names.

Fraunces and Inter, both under the SIL Open Font License 1.1, fetched from
Google Fonts as single variable woff2 files and renamed so the @font-face
families are `Cirrus Display` (serif) and `Cirrus Text` (grotesque). If the
renamed files are already present the script keeps them, so a build with no
network still ships its fonts.
"""
import io
import os
import sys
import urllib.request

from fontTools.ttLib import TTFont

SOURCES = {
    # latin subset variable files, weight axis 100..900
    "cirrus-display.woff2": (
        "https://fonts.gstatic.com/s/fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeA.woff2",
        "Cirrus Display", "Fraunces",
    ),
    "cirrus-text.woff2": (
        "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2",
        "Cirrus Text", "Inter",
    ),
}


def main(dest_dir="/app/static/fonts"):
    os.makedirs(dest_dir, exist_ok=True)
    for out_name, (url, family, upstream) in SOURCES.items():
        dest = os.path.join(dest_dir, out_name)
        if os.path.exists(dest):
            # already renamed and committed: keep it, the build stays offline-safe
            try:
                if TTFont(dest)["name"].getDebugName(1) == family:
                    print("font: kept existing", out_name, os.path.getsize(dest), "bytes", flush=True)
                    continue
            except Exception:
                pass
            os.remove(dest)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=30).read()
        f = TTFont(io.BytesIO(data))
        for rec in f["name"].names:
            if rec.nameID in (1, 3, 4, 6, 16):
                s = rec.toUnicode()
                s = s.replace(upstream, family)
                if rec.nameID == 6:
                    s = family.replace(" ", "") + "-Variable"
                rec.string = s.encode(rec.getEncoding()) if False else s
        f.flavor = "woff2"
        f.save(dest)
        print("font:", out_name, os.path.getsize(dest), "bytes", flush=True)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/app/static/fonts")
