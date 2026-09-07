"""Walks the behaviours the brief fixes, against a running app."""
import json, urllib.request, urllib.error, uuid, sys, threading

BASE = "http://localhost:4173/api"
PW = "deku-demo-pw-2026"
passed, failed = [], []


def call(method, path, token=None, body=None, key=None, raw=False):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", "Bearer " + token)
    if key:
        req.add_header("idempotency-key", key)
    try:
        with urllib.request.urlopen(req) as r:
            payload = r.read().decode()
            return r.status, (payload if raw else json.loads(payload))
    except urllib.error.HTTPError as e:
        payload = e.read().decode()
        if raw:
            return e.code, payload
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, payload


def login(email):
    st, b = call("POST", "/auth/login", body={"email": email, "password": PW})
    assert st == 200, (email, st, b)
    return b["access_token"]


def check(name, cond, detail=""):
    (passed if cond else failed).append(name)
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  <- " + str(detail)[:400]))


T = {r: login(f"{r}@example.com") for r in
     ["plant", "analyst", "quality", "claims", "signer", "signer2", "auditor"]}

# --- Identity ---------------------------------------------------------------
st, me = call("GET", "/auth/me", T["signer2"])
check("auth/me carries email, roles and sites",
      me["email"] == "signer2@example.com" and me["roles"] == ["certificate_signer"]
      and me["sites"] == ["SITE-PILOT"], me)
st, b = call("GET", "/auth/me")
check("an authenticated route needs a session", st == 401, b)
st, b = call("POST", "/auth/login", body={"email": "plant@example.com", "password": "wrong"})
check("a wrong password is refused", st == 401, b)

# --- Units and flooring -----------------------------------------------------
st, b = call("POST", "/batches", T["plant"], key=str(uuid.uuid4()), body={
    "collector": "COL-ALDER", "site": "SITE-DEMO", "category": "post_consumer",
    "gross_g": 32345, "tare_g": 20000, "net_g": 12345, "moisture_bp": 5000,
    "moisture_method": "ISO 15512", "device": "WB-DEMO-01", "received_on": "2026-04-01",
    "composition": {"polymer": "PA6", "fraction_bp": 9000, "basis": "sampled"},
    "contamination": {"non_nylon_bp": 500},
    "custody": [{"kind": k, "date": "2026-04-01", "party": "x"} for k in
                ["collection_site", "collector", "transport", "arrival", "weighing", "acceptance"]],
})
check("dry mass floors 12345 g at 5000 bp to 6172", st == 201 and b.get("dry_mass_g") == 6172, b)
check("a created batch answers the reference it took", bool(b.get("reference")), b)

st, b = call("POST", "/batches", T["plant"], key=str(uuid.uuid4()), body={
    "collector": "COL-ALDER", "site": "SITE-DEMO", "gross_g": 1, "tare_g": 0, "net_g": 1,
    "moisture_bp": 0, "device": "WB-DEMO-01", "received_on": "2026-04-01", "custody": []})
check("category is required at intake with no default", st == 400 and b["error"] == "category_required", b)

st, b = call("POST", "/batches", T["plant"], key=str(uuid.uuid4()), body={
    "collector": "COL-ALDER", "site": "SITE-DEMO", "category": "post_consumer",
    "gross_g": 100, "tare_g": 0, "net_g": 100.5, "moisture_bp": 0,
    "device": "WB-DEMO-01", "received_on": "2026-04-01", "custody": []})
check("no figure crosses the wire as a decimal", st == 400 and b["error"] == "non_integer_figure", b)

st, b = call("POST", "/balance-periods/BP-DEMO-N6-2026H1/allocations", T["claims"],
             key=str(uuid.uuid4()),
             body={"lot": "LOT-N6-0001", "category": "post_consumer", "mass_g": 10, "content_bp": 9000})
check("no route accepts a claim percentage from a person",
      st == 400 and b["error"] == "computed_figure_refused", b)
st, b = call("POST", "/runs/RUN-D-0003/close", T["plant"], key=str(uuid.uuid4()),
             body={"losses_g": 999})
check("no route accepts a loss figure from a caller",
      st == 400 and b["error"] == "computed_figure_refused", b)

# --- Idempotency ------------------------------------------------------------
k = str(uuid.uuid4())
body = {"type": "press", "email": "someone@example.com", "name": "A Reporter"}
st1, b1 = call("POST", "/enquiries", body=body, key=k)
st2, b2 = call("POST", "/enquiries", body=body, key=k)
check("the same key with the same body returns the original result",
      st1 == 201 and b1 == b2, (b1, b2))
st3, b3 = call("POST", "/enquiries", body={**body, "name": "Another"}, key=k)
check("the same key with a different body answers 409 idempotency_key_reuse",
      st3 == 409 and b3["error"] == "idempotency_key_reuse", b3)
st4, b4 = call("POST", "/enquiries", body=body)
check("a write with no key at all is refused",
      st4 == 400 and b4["error"] == "idempotency_key_required", b4)

# --- The category rule ------------------------------------------------------
bad = None
for role in ["plant", "quality", "claims", "signer", "analyst", "auditor"]:
    st, b = call("PATCH", "/batches/BATCH-1001", T[role], body={"category": "pre_consumer"})
    if not (st in (403, 409) and b.get("error") in
            ("category_immutable_after_acceptance", "auditor_writes_nothing")):
        bad = (role, st, b)
        break
check("a batch category cannot be changed after acceptance by any role", bad is None, bad)

# --- Claimability against the approval in force -----------------------------
st, b3 = call("GET", "/batches/BATCH-1003", T["plant"])
check("BATCH-1003 is non-claimable: collector_approval_lapsed",
      b3["claimable"] is False and b3["claimable_reason"] == "collector_approval_lapsed", b3)
check("BATCH-1003 reads back under the name in force on its receipt date",
      b3["collector_name"] == "Brine Textile Recovery", b3["collector_name"])
st, b4 = call("GET", "/batches/BATCH-1004", T["plant"])
check("BATCH-1004 is claimable and flagged lapsed_calibration",
      b4["claimable"] is True and "lapsed_calibration" in b4["flags"], b4)
check("BATCH-1004 carries the measured fraction beside the declared one",
      b4["composition"].get("measured_fraction_bp") == 9100
      and b4["composition"].get("fraction_bp") == 9900, b4["composition"])
st, b5 = call("GET", "/batches/BATCH-1005", T["plant"])
check("BATCH-1005 names the missing custody kind transport",
      b5["claimable_reason"] == "custody_link_missing" and b5["missing_custody_kind"] == "transport", b5)
st, b1001 = call("GET", "/batches/BATCH-1001", T["plant"])
check("BATCH-1001 is 450000 g dry and claimable",
      b1001["dry_mass_g"] == 450000 and b1001["claimable"] is True, b1001)

st, b = call("POST", "/batches/BATCH-1005/custody", T["plant"], key=str(uuid.uuid4()),
             body={"kind": "transport", "party": "Haulier", "arrived_on": "2026-06-01"})
check("a late custody document makes the batch claimable from the date it arrived",
      st == 201 and b["claimable"] is True and b["claimable_from"] == "2026-06-01", b)

# --- Genealogy --------------------------------------------------------------
st, g = call("GET", "/lots/LOT-N6-0001/genealogy", T["auditor"])
n1001 = [n for n in g["nodes"] if n["reference"] == "BATCH-1001"]
check("BATCH-1001 appears exactly once at 450000 g",
      len(n1001) == 1 and n1001[0]["mass_g"] == 450000, n1001)
check("the graph carries flagged at the top level", g["flagged"] is True, g["flagged"])
check("the graph carries a text_equivalent nested list",
      g["text_equivalent"]["reference"] == "LOT-N6-0001" and len(g["text_equivalent"]["children"]) > 0)
check("every node carries kind, mass, category split and flags",
      all(set(["kind", "reference", "mass_g", "category_split", "flags"]) <= set(n) for n in g["nodes"]))
check("every edge carries from, to and mass", all(set(e) == {"from", "to", "mass_g"} for e in g["edges"]))
st, b = call("GET", "/lots/LOT-N6-0001/genealogy?page=1", T["auditor"])
check("a complete set refuses a page parameter with 400",
      st == 400 and b["error"] == "pagination_refused", b)
st, imp = call("GET", "/batches/BATCH-1001/impact", T["auditor"])
check("the reverse traversal names lots, certificates and recipients completely",
      imp["complete"] and any(l["lot"] == "LOT-N6-0001" for l in imp["lots"]), imp)

# --- Runs -------------------------------------------------------------------
st, b = call("POST", "/runs/RUN-D-0001/close", T["plant"], key=str(uuid.uuid4()), body={})
check("a closed run refuses a second close and records the attempt",
      st == 409 and b["error"] == "run_already_closed", b)
st, b = call("POST", "/runs/RUN-D-0001/consumptions", T["plant"], key=str(uuid.uuid4()),
             body={"input_kind": "batch", "input_ref": "BATCH-1001", "mass_g": 1})
check("a closed run refuses every write", st == 409, b)
st, r = call("GET", "/runs/RUN-D-0001", T["plant"])
check("RUN-D-0001 is inside tolerance at 165 C and 3 bar, losing 120000 g",
      r["within_tolerance"] is True and r["losses_g"] == 120000, r["within_tolerance"])
st, r2 = call("GET", "/runs/RUN-D-0002", T["plant"])
check("RUN-D-0002 at 172 C is outside its recipe tolerance", r2["within_tolerance"] is False)
check("a run returns the recipe version and the set points achieved",
      r["recipe_version"] == "RCP-DISS-2" and r["actual_set_points"]["temperature_c"] == 165, r)

# --- Yield ------------------------------------------------------------------
st, y = call("GET", "/lots/LOT-N6-0001/yield", T["claims"])
check("a yield figure answers for the claims manager", st == 200 and "yield_bp" in y, y)

# --- The four separations ---------------------------------------------------
st, b = call("POST", "/lots/LOT-N6-0001/disposition", T["plant"], key=str(uuid.uuid4()),
             body={"disposition": "released"})
check("a plant operator may not set a lot disposition", st == 403, b)
st, b = call("POST", "/lots/LOT-N6-0001/disposition", T["analyst"], key=str(uuid.uuid4()),
             body={"disposition": "released"})
check("a laboratory analyst may not set a lot disposition", st == 403, b)
st, b = call("POST", "/collectors/COL-ALDER/approvals", T["plant"], key=str(uuid.uuid4()),
             body={"state": "approved", "valid_from": "2027-01-01", "valid_to": "2027-12-31"})
check("a plant operator may not approve a collector", st == 403, b)
st, b = call("POST", "/carbon-methods", T["claims"], key=str(uuid.uuid4()),
             body={"id": "CM-PA6", "standard": "x", "functional_unit": "y",
                   "boundary": "z", "allocation_basis": "mass", "reviewer": "r"})
check("a claims manager may not alter a carbon method", st == 403, b)
st, b = call("POST", "/balance-periods/BP-PILOT-N6-2026H1/close", T["quality"],
             key=str(uuid.uuid4()), body={})
check("a quality manager may not close a balance period", st == 403, b)
st, b = call("POST", "/lots/LOT-N6-0002/disposition", T["quality"], key=str(uuid.uuid4()),
             body={"disposition": "released"})
check("a disposition is refused while a deviation touching the lot is open",
      st == 409 and b["error"] == "deviation_open", b)

# --- The auditor writes nothing ---------------------------------------------
writes = [
    ("POST", "/batches", {"collector": "COL-ALDER", "site": "SITE-DEMO", "category": "post_consumer",
                          "gross_g": 1, "tare_g": 0, "net_g": 1, "moisture_bp": 0,
                          "received_on": "2026-04-01", "custody": []}),
    ("POST", "/runs", {"run_type": "dissolution", "site": "SITE-DEMO", "equipment": "e",
                       "recipe_version": "RCP-DISS-2", "operator": "o",
                       "started_at": "2026-04-01T00:00:00Z"}),
    ("POST", "/test-results", {"lot": "LOT-N6-0001", "property": "moisture", "method": "ISO 15512",
                               "value": "0.05", "unit": "percent"}),
    ("POST", "/deviations", {"detail": "x", "runs": [], "lots": []}),
    ("POST", "/balance-periods/BP-DEMO-N6-2026H1/allocations",
     {"lot": "LOT-N6-0001", "category": "pre_consumer", "mass_g": 1}),
    ("POST", "/certificates", {"lot": "LOT-N6-0001", "recipient": "CUS-HELIOS", "password": PW}),
    ("POST", "/lots/LOT-N6-0001/disposition", {"disposition": "released"}),
]
aud_bad = None
for m, p, bd in writes:
    st, b = call(m, p, T["auditor"], key=str(uuid.uuid4()), body=bd)
    if st not in (401, 403):
        aud_bad = (p, st, b)
        break
check("an auditor writes no operational record, at any route", aud_bad is None, aud_bad)
st, b = call("POST", "/exports", T["auditor"], key=str(uuid.uuid4()), body={"sites": ["SITE-DEMO"]})
check("an auditor exports, and the export carries its digests and anchors",
      st == 201 and b["reference"].startswith("EXP-") and len(b["anchor_references"]) > 0, b)
st, q = call("GET", "/record/queries/exports_by_auditor?auditor=auditor@example.com", T["auditor"])
check("exports_by_auditor lists the auditor's exports", len(q) >= 1, q)

# --- Overrides --------------------------------------------------------------
st, b = call("POST", "/overrides", T["quality"], key=str(uuid.uuid4()),
             body={"separation": "analyst_not_dispositioner", "reason": "too short",
                   "lot": "LOT-N6-0001", "authorised_by": "quality@example.com"})
check("an override reason under forty characters is refused",
      st == 400 and b["error"] == "reason_too_short", b)
st, b = call("POST", "/overrides/OVR-0001/review", T["quality"], key=str(uuid.uuid4()), body={})
check("a review is refused for the authoriser",
      st == 403 and b["error"] == "authoriser_may_not_review", b)
st, b = call("POST", "/overrides/OVR-0001/review", T["plant"], key=str(uuid.uuid4()), body={})
check("a review is refused for anybody but a quality or claims manager", st == 403, b)

# --- The claims manager allocates and is refused -----------------------------
st, b = call("POST", "/balance-periods/BP-DEMO-N6-2026H1/allocations", T["claims"],
             key=str(uuid.uuid4()),
             body={"lot": "LOT-N6-0001", "category": "post_consumer", "mass_g": 400000})
check("an allocation larger than the available credits is refused with both masses",
      st == 409 and b["available_g"] == 360000 and b["requested_g"] == 400000
      and b["detail"] == "This allocation is refused. Available: 360000 g. Requested: 400000 g.", b)
st, per_before = call("GET", "/balance-periods/BP-DEMO-N6-2026H1", T["claims"])
check("the figures on the screen are unchanged by a refusal",
      per_before["post_consumer"]["credits_available_g"] == 360000, per_before["post_consumer"])
st, b = call("POST", "/balance-periods/BP-DEMO-N6-2026H1/allocations", T["claims"],
             key=str(uuid.uuid4()),
             body={"lot": "LOT-N6-0001", "category": "post_consumer", "mass_g": 360000})
check("allocating 360000 g leaves content_bp of 9000 on a lot of 400000 g",
      st == 201 and b["lot_content_bp"] == 9000, b)
st, b = call("POST", "/balance-periods/BP-DEMO-N6-2026H1/allocations", T["claims"],
             key=str(uuid.uuid4()),
             body={"lot": "LOT-N6-0001", "category": "post_consumer", "mass_g": 1})
check("a further post-consumer allocation against the period is refused",
      st == 409 and b["available_g"] == 0, b)

# --- Certificates: the eight conditions -------------------------------------
st, prev = call("POST", "/certificates/preview", T["signer"],
                body={"lot": "LOT-N6-0001", "recipient": "CUS-HELIOS"})
check("the preview carries the derived content_bp of 9000 with its claim type",
      prev["content_bp"] == 9000 and prev["claim_type"] == "mass_balance", prev["content_bp"])
check("a preview carries exactly eight conditions", len(prev["conditions"]) == 8, len(prev["conditions"]))
check("each condition carries condition, satisfied and blocking_reference",
      all(set(["condition", "satisfied", "blocking_reference"]) <= set(c) for c in prev["conditions"]))
blocked = [c for c in prev["conditions"] if not c["satisfied"]]
check("the unreviewed override on LOT-N6-0001 blocks and names its record",
      any(c["condition"] == "no_unreviewed_override" and c["blocking_reference"] == "OVR-0001"
          for c in blocked), blocked)

st, b = call("POST", "/certificates", T["signer2"], key=str(uuid.uuid4()),
             body={"lot": "LOT-N6-0001", "recipient": "CUS-HELIOS", "password": PW})
check("signer2 is refused a certificate on a SITE-DEMO lot",
      st == 409 and any(c["condition"] == "signer_holds_scope" and not c["satisfied"]
                        for c in b.get("conditions", [])), b)
st, b = call("POST", "/certificates", T["signer"], key=str(uuid.uuid4()),
             body={"lot": "LOT-N6-0001", "recipient": "CUS-HELIOS"})
check("signing re-authenticates: a session alone is not a signing credential",
      st == 400 and b["error"] == "reauthentication_required", b)
st, b = call("POST", "/certificates", T["signer"], key=str(uuid.uuid4()),
             body={"lot": "LOT-N6-0001", "recipient": "CUS-HELIOS", "password": "not-the-password"})
check("a wrong password at the moment of signing is refused", st == 401, b)
st, b = call("POST", "/certificates", T["claims"], key=str(uuid.uuid4()),
             body={"lot": "LOT-N6-0001", "recipient": "CUS-HELIOS", "password": PW})
check("a claims manager may not sign a certificate", st == 403, b)

st, b = call("POST", "/overrides/OVR-0001/review", T["claims"], key=str(uuid.uuid4()), body={})
check("a review by somebody other than the authoriser clears the condition",
      st == 200 and b["reviewed"] is True, b)
st, prev2 = call("POST", "/certificates/preview", T["signer"],
                 body={"lot": "LOT-N6-0001", "recipient": "CUS-HELIOS"})
check("the override condition is now satisfied",
      all(c["satisfied"] for c in prev2["conditions"] if c["condition"] == "no_unreviewed_override"))
st, ovr = call("GET", "/overrides", T["auditor"])
check("a reviewed override removes nothing and stays on the lot",
      any(o["reference"] == "OVR-0001" and o["reviewed"] and o["permanent"] for o in ovr), ovr)

# --- Carbon -----------------------------------------------------------------
st, cb = call("GET", "/lots/LOT-N6-0001/carbon", T["quality"])
check("a carbon value never appears without boundary, method version and uncertainty",
      cb["value_mg_per_kg"] == 4260000 and cb["boundary"] == "cradle-to-gate"
      and cb["method_version"] == "CM-PA6 v2" and cb["uncertainty_bp"] == 1200, cb)
check("the seven breakdown lines sum to the value",
      len(cb["breakdown"]) == 7 and sum(l["mg_per_kg"] for l in cb["breakdown"]) == cb["value_mg_per_kg"])
check("primary_share_bp 6500 above the 5000 threshold is not default-led",
      cb["primary_share_bp"] == 6500 and cb["default_led"] is False, cb["default_led"])
check("the two energy figures are returned together",
      cb["energy_location_mg_per_kg"] == 1850000 and cb["energy_market_mg_per_kg"] == 620000)
check("EAC-2026-0007 leaves unmatched_kwh of 50000",
      cb["metered_kwh"] == 300000 and cb["retired_kwh"] == 250000 and cb["unmatched_kwh"] == 50000, cb)
check("the comparator names material, dataset, year and region",
      cb["comparator"]["material"] == "virgin PA6" and cb["comparator"]["dataset_year"] == 2025)
check("a lower figure is described as lower than its comparator by name",
      cb["comparator_relation"] == "lower_than_comparator")
st, b = call("POST", "/energy-instruments/EAC-2025-0031/retire", T["claims"], key=str(uuid.uuid4()),
             body={"period": "BP-DEMO-N6-2026H1"})
reasons = [r["reason"] for r in b.get("refusals", [])]
check("EAC-2025-0031 is refused on both counts",
      st == 409 and "instrument_not_retired" in reasons and "vintage_does_not_match" in reasons, b)

# --- Byproducts -------------------------------------------------------------
st, bp = call("GET", "/outputs/OUT-U-0002/byproduct-share", T["quality"])
check("OUT-U-0002 carries 526 basis points of the run's claim and emissions",
      bp["share_bp"] == 526 and bp["total_output_mass_g"] == 760000, bp)

# --- Conversion factors -----------------------------------------------------
st, b = call("POST", "/conversion-factors", T["claims"], key=str(uuid.uuid4()),
             body={"site": "SITE-DEMO", "factor_bp": 8500, "derived_from": "2026-04-01",
                   "derived_to": "2026-06-30", "derived_in_g": 1000000, "derived_out_g": 800000})
check("a factor disagreeing with its own window is refused",
      st == 409 and b["error"] == "factor_does_not_reconcile", b)
st, cfs = call("GET", "/conversion-factors", T["claims"])
check("CF-PILOT-1 is provisional with no window at all",
      any(f["reference"] == "CF-PILOT-1" and f["provisional"] and f["derived_in_g"] == 0
          for f in cfs), cfs)

# --- Blending ---------------------------------------------------------------
st, b = call("POST", "/lots/LOT-N6-0001/blend", T["quality"], key=str(uuid.uuid4()),
             body={"with": "LOT-N6-0003"})
check("blending 400000 at 9000 with 200000 at 7500 yields 600000 at 8500",
      st == 201 and b["mass_g"] == 600000 and b["content_bp"] == 8500, b)
check("the blend names both sites and takes the weaker provisional flag",
      sorted(b["sites_named"]) == ["SITE-DEMO", "SITE-PILOT"] and b["provisional_factor"] is True, b)

# --- Two allocations racing -------------------------------------------------
st, _ = call("POST", "/balance-periods/BP-DEMO-N6-2026H1/allocations", T["claims"],
             key=str(uuid.uuid4()), body={"lot": "LOT-N6-0002", "category": "pre_consumer",
                                          "mass_g": 236000})
results = []
def race():
    r = call("POST", "/balance-periods/BP-DEMO-N6-2026H1/allocations", T["claims"],
             key=str(uuid.uuid4()), body={"lot": "LOT-N6-0002", "category": "pre_consumer",
                                          "mass_g": 100000})
    results.append(r[0])
ts = [threading.Thread(target=race) for _ in range(2)]
[t.start() for t in ts]
[t.join() for t in ts]
check("two allocations racing produce exactly one 201 and exactly one 409",
      sorted(results) == [201, 409], results)
st, per = call("GET", "/balance-periods/BP-DEMO-N6-2026H1", T["claims"])
check("the sum of attached credits never exceeds the available credits",
      per["pre_consumer"]["credits_available_g"] >= 0
      and per["post_consumer"]["credits_available_g"] >= 0, per["pre_consumer"])
check("the two categories are never netted",
      per["post_consumer"]["credits_in_g"] == 360000
      and per["pre_consumer"]["credits_in_g"] == 336000, per)
check("a transfer lands as an inbound credit naming its origin, never fresh",
      any(i["origin_site"] == "SITE-PILOT" and i["fresh_credit"] is False
          for i in per["inbound_credits"]), per["inbound_credits"])
check("non_claimable_input_g is 190000 and the counts sit together",
      per["non_claimable_input_g"] == 190000 and per["open_finding_count"] == 1, per)
check("every figure on the balance carries a derivation",
      "derivation" in per["post_consumer"] and "movements_in" in per["post_consumer"]["derivation"])

# --- Closed period ----------------------------------------------------------
st, b = call("POST", "/balance-periods/BP-DEMO-N6-2025H2/allocations", T["claims"],
             key=str(uuid.uuid4()),
             body={"lot": "LOT-N6-0001", "category": "post_consumer", "mass_g": 1})
check("a closed period refuses every further write",
      st == 409 and b["error"] == "period_closed", b)
st, b = call("POST", "/balance-periods/BP-DEMO-N6-2025H2/close", T["claims"],
             key=str(uuid.uuid4()), body={})
check("a closed period refuses to reopen", st == 409, b)
st, periods = call("GET", "/balance-periods", T["claims"])
closed = [p for p in periods if p["id"] == "BP-DEMO-N6-2025H2"][0]
check("the closed period reports closed_on and its cut_off",
      closed["closed_on"] == "2026-01-15" and closed["cut_off"] == "2026-01-10", closed)

# --- The record -------------------------------------------------------------
st, b = call("DELETE", "/record/1", T["quality"])
check("the record refuses a deletion", st == 405, b)
st, b = call("PATCH", "/record/1", T["quality"], body={"act": "x"})
check("the record refuses an edit", st == 405, b)
st, chain = call("GET", "/record/check", T["auditor"])
check("the digest chain verifies", chain["holds"] is True, chain)
check("the first entry's prev_digest is sixty-four zeroes", chain["first_prev_digest"] == "0" * 64)
st, entries = call("GET", "/record", T["auditor"])
check("every entry carries seq, digest and prev_digest",
      all(set(["seq", "digest", "prev_digest"]) <= set(e) for e in entries))
check("a refusal is recorded as well as a success",
      any(e["outcome"] == "refused" for e in entries))

# --- Retention --------------------------------------------------------------
sign_seq = next(e["seq"] for e in entries
                if e["act"] == "certificate_signed" and e["object_ref"] == "CERT-PILOT-000001")
st, ret = call("GET", f"/record/{sign_seq}/retention", T["auditor"])
check("retain_until is the longest of the three, computed",
      ret["retain_until"] == max(x for x in [ret["scheme_until"], ret["statutory_until"],
                                             ret["referenced_until"]] if x)
      and ret["scheme_months"] == 120 and ret["statutory_months"] == 84, ret)
check("the seeded legal hold stands on the signing of CERT-PILOT-000001",
      ret["legal_hold"] is True, ret)
st, b = call("POST", f"/record/{sign_seq}/expire", T["quality"], key=str(uuid.uuid4()), body={})
check("a record under hold refuses deletion",
      st == 409 and b["error"] == "legal_hold_stands", b)

# --- Inbound ----------------------------------------------------------------
st, inb = call("GET", "/inbound", T["plant"])
check("each inbound record keeps its payload verbatim",
      all("payload_verbatim" in r for r in inb) and len(inb) >= 3, len(inb))
st, rec = call("GET", "/reconciliation", T["plant"])
ages = {a["source"]: a["age_hours"] for a in rec["integration_ages"]}
check("customer_reporting reads null rather than zero", ages["customer_reporting"] is None, ages)
check("a source that has sent reports an age in hours",
      isinstance(ages["weighbridge"], int) and ages["weighbridge"] > 0, ages)
check("the reconciliation answers six figures",
      all(k in rec for k in ["mass_balance_residual_g", "credit_margin_g",
                             "consumptions_on_open_runs", "batches_with_broken_custody",
                             "certificates_with_superseded_figures", "integration_ages"]), list(rec))
st, b = call("POST", "/inbound/customer_reporting", key=str(uuid.uuid4()),
             body={"received_at": "2026-09-01T00:00:00Z",
                   "payload": {"handover": "CERT-PILOT-000002", "filed": True}})
check("an inbound record answers the reference it took",
      st == 201 and b["reference"].startswith("INB-"), b)
st, inb2 = call("GET", "/inbound", T["plant"])
kept = [r for r in inb2 if r["reference"] == b["reference"]][0]
check("the payload is stored as the bytes that arrived",
      json.loads(kept["payload_verbatim"])["handover"] == "CERT-PILOT-000002", kept)

# --- The nine record queries ------------------------------------------------
NINE = ["lots_from_batch", "certificates_on_period", "certificates_under_method_version",
        "lots_released_under_unreviewed_override", "allocations_in_final_fortnight",
        "refused_allocations", "collector_declaration_departures", "acts_by_person",
        "exports_by_auditor"]
q_bad = None
for n in NINE:
    st, b = call("GET", f"/record/queries/{n}", T["auditor"])
    if st != 200 or not isinstance(b, list):
        q_bad = (n, st, b)
        break
    stp, bp2 = call("GET", f"/record/queries/{n}?limit=1", T["auditor"])
    if stp != 400:
        q_bad = (n + " refuses a limit", stp, bp2)
        break
check("the nine record queries each answer a complete set and refuse a page", q_bad is None, q_bad)
st, rf = call("GET", "/record/queries/refused_allocations", T["auditor"])
check("a refused allocation is recorded with the margin at the instant",
      len(rf) >= 1 and rf[0]["available_g"] is not None, rf[:1])
st, dep = call("GET", "/record/queries/collector_declaration_departures", T["auditor"])
check("the 800 bp departure stands as a finding on COL-CINDER",
      any(d["collector"] == "COL-CINDER" and d["departure_bp"] == 800 for d in dep), dep)

# --- Public routes ----------------------------------------------------------
st, stats = call("GET", "/statistics")
check("every published figure carries a source, a year and a geography",
      len(stats) == 3 and all(s["source"] and s["year"] and s["geography"] for s in stats), stats)
st, pos = call("GET", "/positions")
check("one open position, and the count is the collection's length", len(pos) == 1, pos)
st, news = call("GET", "/news")
check("three news items with a real taxonomy",
      len(news) == 3 and {n["tag"] for n in news} == {"funding", "partnership", "technical"}, news)
check("an item in another language says so", any(n["language"] == "fr" for n in news))
st, sites = call("GET", "/sites")
check("three sites, each with its confidence and certification state",
      len(sites) == 3 and all(s["confidence"] and s["certification_state"] for s in sites), sites)
st, cap = call("GET", "/sites/SITE-COMM/capacity")
check("SITE-COMM reports -1000000 uncommitted, in public, with its confidence",
      cap["uncommitted_kg"] == -1000000 and cap["confidence"] == "planned"
      and cap["basis"] == "8000 hours per year, 0.90 availability, 0.80 yield", cap)
st, b = call("GET", "/verify/CERT-PILOT-000001")
check("the public verification answer carries exactly the ten fields",
      set(b) == {"found", "number", "state", "issued_on", "withdrawn_on", "withdrawal_reason",
                 "site", "grade", "claim_type", "recipient_name"}, set(b))
check("it states the withdrawal, its date and its reason",
      b["state"] == "withdrawn" and b["withdrawn_on"] == "2026-04-18"
      and b["withdrawal_reason"] == "A collector category was corrected after acceptance", b)
st, b = call("GET", "/verify/CERT-DEMO-999999")
check("an unknown number returns 200 with found false", st == 200 and b["found"] is False, b)
st, en = call("POST", "/enquiries", key=str(uuid.uuid4()),
              body={"type": "waste_supply", "email": "collector@example.com", "organisation": "New Co"})
check("a waste-supply enquiry answers its destination and response time",
      en["destination"] == "feedstock@example.com" and en["response_days"] == 3
      and en["reference"].startswith("ENQ-"), en)

# --- Contracts --------------------------------------------------------------
st, proj = call("GET", "/contracts/CON-VANTA-1/projection", T["claims"])
check("a contract on a planned site flags undismissibly",
      proj["planned_site_flag"] is True and proj["flag_dismissible"] is False, proj)
check("a contract carries its shortfall consequence",
      proj["shortfall_consequence"] == "a make-good volume in the following period", proj)
check("a projection reports delivered, running content, floor and required remaining",
      all(k in proj for k in ["delivered_kg", "running_content_bp", "floor_bp",
                              "required_remaining_bp", "state"]), list(proj))

# --- Specifications ---------------------------------------------------------
st, spec = call("GET", "/specifications/SPEC-N6/versions/3")
check("the specification names its virgin reference with source and date",
      spec["virgin_reference"]["reference"] == "virgin PA6 at relative viscosity 2.42"
      and spec["virgin_reference"]["dated"] == "2025-11-30", spec["virgin_reference"])
check("four specification rows with their bases", len(spec["rows"]) == 4, spec["rows"])
st, spec2 = call("GET", "/specifications/SPEC-N6/versions/2")
check("a superseded specification version stays readable", st == 200 and spec2["superseded"] is True)
st, cm1 = call("GET", "/carbon-methods/CM-PA6/versions/1", T["quality"])
check("a superseded carbon method version stays readable", st == 200 and cm1["superseded"] is True)
st, cus = call("GET", "/customers/CUS-VANTA", T["quality"])
check("a customer carries its held version, application, industry and conformance",
      cus["holds_specification_version"] == "SPEC-N6 v2" and cus["industry"] == "automotive"
      and len(cus["conformance"]) == 1, cus)

# --- Parties ----------------------------------------------------------------
st, pv = call("GET", "/parties/COL-BRINE/versions", T["quality"])
check("the party history returns both names by date",
      len(pv) == 2 and pv[0]["name"] == "Brine Textile Recovery"
      and pv[1]["name"] == "Brine Circular Materials", pv)

# --- Collectors -------------------------------------------------------------
st, cols = call("GET", "/collectors", T["quality"])
cinder = [c for c in cols if c["reference"] == "COL-CINDER"][0]
check("a conditional approval names its condition and closing date",
      cinder["approval_periods"][0]["state"] == "conditional"
      and cinder["approval_periods"][0]["condition"] == "Sampling plan for coated streams to be agreed"
      and cinder["approval_periods"][0]["condition_closes_on"] == "2026-10-31", cinder["approval_periods"])
check("a collector carries its findings list", len(cinder["findings"]) == 1, cinder["findings"])

# --- Test results -----------------------------------------------------------
st, b = call("POST", "/test-results", T["analyst"], key=str(uuid.uuid4()),
             body={"lot": "LOT-N6-0001", "property": "moisture", "value": "0.05", "unit": "percent"})
check("a result with no method is refused", st == 400 and b["error"] == "method_required", b)
st, b = call("POST", "/test-results", T["analyst"], key=str(uuid.uuid4()),
             body={"lot": "LOT-N6-0001", "property": "moisture", "method": "ASTM D6980",
                   "value": "0.05", "unit": "percent", "uncertainty_bp": 100})
check("a method mismatch is kept as evidence and never reaches a disposition",
      st == 201 and b["method_mismatch"] is True and b["usable_for_release"] is False, b)

# --- Document and replay ----------------------------------------------------
st, doc1 = call("GET", "/certificates/CERT-PILOT-000002/document", raw=True)
st, doc2 = call("GET", "/certificates/CERT-PILOT-000002/document", raw=True)
check("an issued document is byte-stable across two reads", doc1 == doc2 and len(doc1) > 500)
check("the document survives as plain text with the claim type before the percentage",
      doc1.index("Claim type") < doc1.index("Recycled content")
      and "mass_balance" in doc1 and "PERMITTED STATEMENT" in doc1)
check("no yield figure appears in the certificate document",
      "yield" not in doc1.lower() and "Yield" not in doc1)
st, dw = call("GET", "/certificates/CERT-PILOT-000001/document", raw=True)
check("a withdrawn certificate says withdrawn before it shows any figure",
      dw.index("WITHDRAWN") < dw.index("Recycled content"), dw[:200])
st, rp = call("GET", "/certificates/CERT-PILOT-000002/replay", T["auditor"])
check("a replay answers issued, recomputed, agrees and its input versions",
      all(k in rp for k in ["issued", "recomputed", "agrees", "differing_input", "input_versions"])
      and len(rp["input_versions"]) >= 3, rp)

print()
print(f"{len(passed)} passed, {len(failed)} failed")
if failed:
    print("FAILED:")
    for f in failed:
        print("  -", f)
sys.exit(1 if failed else 0)
