"""Covers the brief statements not exercised elsewhere: ordinal recontiguity on
unlist, preview expiry, the credits endpoint, reorder and PATCH.

Every record it creates is removed again, so the store is left as it was found.
"""
import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
PW = "deku-demo-pw-2026"
fails = []


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data, timeout=20) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, None


def ck(name, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + name + ("" if cond else f"  -> {detail}"))
    if not cond:
        fails.append(name)


cirrus = call("POST", "/api/auth/login",
              body={"email": "producer@example.com", "password": PW})[1]["token"]
meridian = call("POST", "/api/auth/login",
                body={"email": "producer.meridian@example.com", "password": PW})[1]["token"]

# --- 8: unlisting the fifth of twelve leaves eleven numbered 001 to 011 ------
s, works = call("GET", "/api/works")
ck("twelve published works to begin with", len(works) == 12, len(works))
fifth = works[4]
ck("the fifth is NVE at 005", fifth["slug"] == "nve" and fifth["ordinal_label"] == "005",
   (fifth["slug"], fifth["ordinal_label"]))

s, _ = call("POST", f"/api/studio/items/{fifth['id']}/publish", cirrus, {"published": False})
ck("the fifth unlists", s == 200, s)
s, after = call("GET", "/api/works")
ck("eleven remain", len(after) == 11, len(after))
ck("they are numbered 001 to 011 with no gap",
   [w["ordinal_label"] for w in after] == [f"{i:03d}" for i in range(1, 12)],
   [w["ordinal_label"] for w in after])
ck("the unlisted work is gone from the index",
   all(w["slug"] != "nve" for w in after))
s, _ = call("GET", "/api/works/nve")
ck("its own address is not found while unlisted", s == 404, s)

# neighbours still wrap across the reduced set
s, d = call("GET", "/api/works/" + after[0]["slug"])
ck("001's previous is 011 after the unlist",
   d["prev"]["ordinal_label"] == "011", d["prev"])

# restore it and confirm the index heals
s, _ = call("POST", f"/api/studio/items/{fifth['id']}/publish", cirrus, {"published": True})
s, back = call("GET", "/api/works")
ck("republishing restores twelve numbered 001 to 012",
   len(back) == 12
   and [w["ordinal_label"] for w in back] == [f"{i:03d}" for i in range(1, 13)],
   len(back))
ck("the restored work sits back in its stored position",
   back[4]["slug"] == "nve", back[4]["slug"])

# --- 10: the discipline set reacts to publish and unlist ---------------------
s, items = call("GET", "/api/studio/items", cirrus)
camille = next(i for i in items if i["slug"] == "camille-ferrand")
s, _ = call("POST", f"/api/studio/items/{camille['id']}/publish", cirrus, {"published": False})
s, disc = call("GET", "/api/disciplines")
ck("unlisting Camille Ferrand drops photographer",
   disc == ["director"], disc)
s, _ = call("POST", f"/api/studio/items/{camille['id']}/publish", cirrus, {"published": True})
s, disc = call("GET", "/api/disciplines")
ck("republishing restores director then photographer",
   disc == ["director", "photographer"], disc)

# --- 11: a credit may name someone the house does not represent -------------
s, halo = call("GET", "/api/studio/items", cirrus)
halo_id = next(i for i in halo if i["slug"] == "the-halo")["id"]
s, created = call("POST", f"/api/studio/items/{halo_id}/credits", cirrus,
                  {"role": "Gaffer", "name": "Someone Unrepresented"})
ck("a credit with no talent behind it is created", s == 201, (s, created))
credit_ok = s == 201
s, d = call("GET", "/api/works/the-halo")
gaffer = [c for c in d["credits"] if c["role"] == "Gaffer"]
ck("the unrepresented credit shows a name and no link",
   len(gaffer) == 1 and gaffer[0]["href"] is None, gaffer)
linked = [c for c in d["credits"] if c["name"] == "Rives"]
ck("a credit matching a published talent links to that talent",
   linked and linked[0]["href"] == "/talents/rives", linked)

# a credit pointing at another house's talent is refused
s, mine = call("GET", "/api/studio/items", meridian)
sable = next(i for i in mine if i["slug"] == "sable-ito")["id"]
s, d = call("POST", f"/api/studio/items/{halo_id}/credits", cirrus,
            {"role": "Director", "name": "Sable Ito", "talent_id": sable})
ck("a credit cannot point at another house's talent", s == 422, (s, d))

# a talent's selected work is read from credits, never stored
s, t = call("GET", "/api/talents/rives")
ck("Rives' selected work is derived from the credit on The Halo",
   any(w["slug"] == "the-halo" for w in t["selected_work"]),
   [w["slug"] for w in t["selected_work"]])

# --- reorder changes the ordinals a visitor reads ---------------------------
s, w_items = call("GET", "/api/studio/items?kind=work", cirrus)
original = [i["id"] for i in w_items]
rotated = original[1:] + original[:1]
s, d = call("POST", "/api/studio/works/order", cirrus, {"ordered_ids": rotated})
ck("reorder is accepted", s == 200, s)
s, ordered = call("GET", "/api/works")
ck("the index now opens on the work that was second",
   ordered[0]["slug"] == "sonder", ordered[0]["slug"])
ck("the set is still contiguous after reordering",
   [w["ordinal_label"] for w in ordered] == [f"{i:03d}" for i in range(1, 13)])
s, _ = call("POST", "/api/studio/works/order", cirrus, {"ordered_ids": original})
s, restored = call("GET", "/api/works")
ck("the authored order is restored",
   restored[0]["slug"] == "the-halo" and len(restored) == 12, restored[0]["slug"])

# --- PATCH edits only what it is given --------------------------------------
s, before = call("GET", f"/api/studio/items/{halo_id}", cirrus)
s, patched = call("PATCH", f"/api/studio/items/{halo_id}", cirrus, {"title": "The Halo II"})
ck("PATCH updates the title", s == 200 and patched["title"] == "The Halo II", s)
ck("PATCH leaves the slug alone: a slug is assigned once",
   patched["slug"] == before["slug"], (before["slug"], patched["slug"]))
call("PATCH", f"/api/studio/items/{halo_id}", cirrus, {"title": "The Halo"})
s, d = call("GET", f"/api/studio/items/{halo_id}", cirrus)
ck("the title is restored", d["title"] == "The Halo", d["title"])

# --- 5: a preview token expires ---------------------------------------------
s, items = call("GET", "/api/studio/items", cirrus)
noor = next(i for i in items if i["slug"] == "noor-vasquez")["id"]
s, minted = call("POST", "/api/studio/preview-tokens", cirrus, {"item_id": noor})
tok = minted["token"]
s, _ = call("GET", f"/api/preview/{tok}", cirrus)
ck("a fresh token resolves", s == 200, s)

import subprocess
import os
subprocess.run(["psql", os.environ["DATABASE_URL"], "-q", "-c",
                f"UPDATE preview_tokens SET expires_at = now() - interval '1 minute' "
                f"WHERE token = '{tok}'"], check=True, capture_output=True)
s, _ = call("GET", f"/api/preview/{tok}", cirrus)
ck("an expired token is not found even to its own producer", s == 404, s)

req = urllib.request.Request(BASE + f"/preview/{tok}")
req.add_header("Authorization", "Bearer " + cirrus)
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        code = r.status
except urllib.error.HTTPError as e:
    code = e.code
ck("the expired preview page is a real not-found", code == 404, code)

# --- clean up every row this file created -----------------------------------
subprocess.run(["psql", os.environ["DATABASE_URL"], "-q",
                "-c", "DELETE FROM preview_tokens",
                "-c", "DELETE FROM credits WHERE role = 'Gaffer'"],
               check=True, capture_output=True)
s, d = call("GET", "/api/works/the-halo")
ck("the store is left exactly as it was found",
   len(d["credits"]) == 2 and d["title"] == "The Halo",
   (len(d["credits"]), d["title"]))

print()
print("FAILURES:", fails if fails else "none")
sys.exit(1 if fails else 0)
