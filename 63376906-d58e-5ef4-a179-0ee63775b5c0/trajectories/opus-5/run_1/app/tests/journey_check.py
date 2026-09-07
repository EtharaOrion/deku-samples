"""Signing, withdrawal, restatement, suspension and mail, end to end."""
import json, urllib.request, urllib.error, uuid, sys, threading

BASE = "http://localhost:4173/api"
MAILPIT = "http://mailpit:8025/api/v1"
PW = "deku-demo-pw-2026"
passed, failed = [], []


def call(method, path, token=None, body=None, key=None, raw=False, base=BASE):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method)
    if data:
        req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", "Bearer " + token)
    if key:
        req.add_header("idempotency-key", key)
    try:
        with urllib.request.urlopen(req) as r:
            p = r.read().decode()
            return r.status, (p if raw else json.loads(p))
    except urllib.error.HTTPError as e:
        p = e.read().decode()
        if raw:
            return e.code, p
        try:
            return e.code, json.loads(p)
        except Exception:
            return e.code, p


def login(email):
    st, b = call("POST", "/auth/login", body={"email": email, "password": PW})
    assert st == 200, (email, st, b)
    return b["access_token"]


def check(name, cond, detail=""):
    (passed if cond else failed).append(name)
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  <- " + str(detail)[:400]))


def mailpit(path):
    with urllib.request.urlopen(MAILPIT + path) as r:
        return json.loads(r.read().decode())


T = {r: login(f"{r}@example.com") for r in
     ["plant", "analyst", "quality", "claims", "signer", "signer2", "auditor"]}
K = lambda: str(uuid.uuid4())

# Bring LOT-N6-0001 to a signable state: allocate, review the override, close the period.
call("POST", "/balance-periods/BP-DEMO-N6-2026H1/allocations", T["claims"], key=K(),
     body={"lot": "LOT-N6-0001", "category": "post_consumer", "mass_g": 360000})
call("POST", "/overrides/OVR-0001/review", T["claims"], key=K(), body={})

st, b = call("POST", "/balance-periods/BP-DEMO-N6-2026H1/close", T["claims"], key=K(), body={})
check("closing is refused while a lot lacks a disposition or a deviation is open",
      st == 409 and any(x["reason"] in ("lot_lacks_disposition", "deviation_open")
                        for x in b.get("blockers", [])), b)
call("POST", "/deviations/DEV-0001/close", T["quality"], key=K(),
     body={"outcome": "root_cause_found"})
call("POST", "/lots/LOT-N6-0002/disposition", T["quality"], key=K(), body={"disposition": "released"})
st, closed = call("POST", "/balance-periods/BP-DEMO-N6-2026H1/close", T["claims"], key=K(),
                  body={"closed_on": "2026-07-01", "cut_off": "2026-07-10"})
check("the period closes and settles the carry-over", st == 200, closed)
check("with 360000 g in and a limit of 2000 bp, at most 72000 g carries forward",
      closed["carried_forward_g"]["post_consumer_g"] == 0
      and closed["expired_g"]["post_consumer_g"] == 0, closed["carried_forward_g"])

# The worked carry-over case on the pilot period: 200000 in, 50000 still available.
st, pil = call("GET", "/balance-periods/BP-PILOT-N6-2026H1", T["claims"])
check("the pilot period holds 200000 g in and 0 g still available after its transfer",
      pil["post_consumer"]["credits_in_g"] == 200000
      and pil["post_consumer"]["credits_available_g"] == 0, pil["post_consumer"])

# --- Signing ----------------------------------------------------------------
st, prev = call("POST", "/certificates/preview", T["signer"],
                body={"lot": "LOT-N6-0001", "recipient": "CUS-HELIOS"})
check("all eight conditions now hold", all(c["satisfied"] for c in prev["conditions"]),
      [c for c in prev["conditions"] if not c["satisfied"]])
check("the permitted statement is generated from the claim type",
      "mass balance" in prev["permitted_statement"]
      and "not physically segregated" in prev["permitted_statement"], prev["permitted_statement"])
check("the prohibited statement is the mass-balance one",
      prev["prohibited_statement"] ==
      "You may not state that this material physically contains recycled content.",
      prev["prohibited_statement"])

before = len(mailpit("/messages?limit=200")["messages"])
st, cert = call("POST", "/certificates", T["signer"], key=K(),
                body={"lot": "LOT-N6-0001", "recipient": "CUS-HELIOS", "password": PW})
check("the first SITE-DEMO certificate is CERT-DEMO-000001",
      st == 201 and cert["number"] == "CERT-DEMO-000001", cert if st != 201 else cert["number"])
check("the certificate carries every derived field",
      all(k in cert for k in ["number", "version", "site", "lots", "grade", "specification_version",
                              "claim_type", "content_bp", "category_split", "period", "carbon",
                              "primary_share_bp", "scheme", "registration", "test_results",
                              "permitted_statement", "prohibited_statement", "signer", "signed_at",
                              "verification_url", "state", "provisional_factor"]), list(cert))
check("content_bp is 9000 and its claim type sits beside it",
      cert["content_bp"] == 9000 and cert["claim_type"] == "mass_balance", cert["content_bp"])
check("the eight conditions are stored as they stood at signing",
      len(cert["conditions"]) == 8 and all(c["satisfied"] for c in cert["conditions"]))
check("the certificate carries no yield figure", "yield" not in json.dumps(cert).lower())

msgs = mailpit("/messages?limit=200")["messages"]
issued_mail = [m for m in msgs if m["Subject"] == "Certificate CERT-DEMO-000001 issued"]
check("a signature sends one mail with the right subject", len(issued_mail) == 1,
      [m["Subject"] for m in msgs[:5]])
if issued_mail:
    m = issued_mail[0]
    check("it is addressed to exactly one recipient with no copies",
          len(m["To"]) == 1 and m["To"][0]["Address"] == "helios@example.com"
          and not m.get("Cc") and not m.get("Bcc"), m["To"])
    full = mailpit(f"/message/{m['ID']}")
    body_text = full.get("Text", "")
    check("the body carries the number, the claim type, the percentage and the statement",
          "CERT-DEMO-000001" in body_text and "mass_balance" in body_text
          and "9000" in body_text and "mass balance" in body_text, body_text[:200])

# The eight are re-checked at the moment of signing.
st, dev = call("POST", "/deviations", T["quality"], key=K(),
               body={"detail": "A late finding on the purification step.",
                     "runs": ["RUN-R-0001"], "lots": ["LOT-N6-0001"]})
st, b = call("POST", "/certificates", T["signer"], key=K(),
             body={"lot": "LOT-N6-0001", "recipient": "CUS-VANTA", "password": PW})
check("a lot that has since gained an open deviation is refused at signing",
      st == 409 and any(c["condition"] == "no_open_deviation" and not c["satisfied"]
                        for c in b.get("conditions", [])), b)
check("the refusal names the condition that changed",
      any(f["condition"] == "no_open_deviation" for f in b.get("failed_conditions", [])), b)
call("POST", f"/deviations/{dev['reference']}/close", T["quality"], key=K(),
     body={"outcome": "root_cause_found"})

# Two signatures at one site take two consecutive numbers with no gap.
numbers = []
def sign():
    st, b = call("POST", "/certificates", T["signer"], key=K(),
                 body={"lot": "LOT-N6-0001", "recipient": "CUS-VANTA", "password": PW})
    if st == 201:
        numbers.append(b["number"])
ts = [threading.Thread(target=sign) for _ in range(2)]
[t.start() for t in ts]
[t.join() for t in ts]
check("two signatures at one moment take two consecutive numbers with no gap",
      sorted(numbers) == ["CERT-DEMO-000002", "CERT-DEMO-000003"], numbers)

# --- The certificate in the recipient's language ----------------------------
st, fr = call("GET", "/certificates/CERT-DEMO-000002", T["signer"])
check("the statements are in the recipient's language",
      "bilan massique" in fr["permitted_statement"], fr["permitted_statement"][:120])

# --- Withdrawal: one action, five consequences ------------------------------
st, w = call("POST", "/certificates/CERT-PILOT-000002/withdraw", T["signer2"], key=K(),
             body={"reason": "The conversion factor for the pilot was restated."})
check("a withdrawal answers all five consequences",
      st == 200 and all(k in w for k in ["state", "reason", "withdrawn_by", "withdrawn_on",
                                         "notified_recipients", "void_statements",
                                         "derived_certificates", "batch_traversal"]), w)
check("the recipients are named rather than counted",
      w["notified_recipients"][0]["name"] == "Vanta Safety Systems", w["notified_recipients"])
check("the void statements are enumerated", len(w["void_statements"]) >= 1, w["void_statements"])
check("the reverse traversal of the underlying batches runs in the same action",
      isinstance(w["batch_traversal"], list), w["batch_traversal"])
st, v = call("GET", "/verify/CERT-PILOT-000002")
check("the certificate address still resolves and states the withdrawal",
      v["found"] and v["state"] == "withdrawn"
      and v["withdrawal_reason"] == "The conversion factor for the pilot was restated.", v)
msgs = mailpit("/messages?limit=200")["messages"]
wm = [m for m in msgs if m["Subject"] == "Certificate CERT-PILOT-000002 withdrawn"]
check("the recipient is notified through mailpit and the notification is part of the record",
      len(wm) == 1 and wm[0]["To"][0]["Address"] == "vanta@example.com", [m["Subject"] for m in msgs[:5]])
if wm:
    body_text = mailpit(f"/message/{wm[0]['ID']}").get("Text", "")
    check("the withdrawal mail carries the number, the reason and every void statement",
          "CERT-PILOT-000002" in body_text and "restated" in body_text
          and all(v in body_text for v in w["void_statements"]), body_text[:300])

# A withdrawal on a SITE-DEMO certificate runs the traversal over real batches.
st, wd = call("POST", "/certificates/CERT-DEMO-000003/withdraw", T["signer"], key=K(),
              body={"reason": "A collector category was corrected after acceptance."})
check("the traversal enumerates every other certificate touching the same batches",
      st == 200 and len(wd["batch_traversal"]) == 4
      and any(t["batch"] == "BATCH-1001" for t in wd["batch_traversal"]),
      [t["batch"] for t in wd.get("batch_traversal", [])])
touched = {c["number"] for t in wd["batch_traversal"] for c in t["certificates"]}
check("the other certificates resting on those batches are named",
      "CERT-DEMO-000001" in touched, touched)
st, notes = call("GET", "/notifications", T["auditor"])
check("the notification is part of the record",
      any(n["about"] == "CERT-PILOT-000002" and n["kind"] == "certificate_withdrawn" for n in notes))
st, doc = call("GET", "/certificates/CERT-PILOT-000002/document", raw=True)
check("the document stays readable at its address and states the withdrawal",
      "WITHDRAWN" in doc and "restated" in doc, doc[:200])

# --- An issued artefact is immutable ----------------------------------------
st, b2 = call("POST", "/certificates/CERT-PILOT-000002/withdraw", T["signer2"], key=K(),
              body={"reason": "A second withdrawal of the same document."})
check("a withdrawn certificate refuses a second withdrawal",
      st == 409 and b2["error"] == "already_withdrawn", b2)

# --- Restatement -------------------------------------------------------------
st, rst = call("POST", "/balance-periods/BP-PILOT-N6-2026H1/restatements", T["claims"], key=K(),
               body={"reason": "The pilot conversion factor is superseded by a derived one.",
                     "revised_factor_bp": 8000})
check("a restatement enumerates every certificate issued from the period",
      st == 201 and len(rst["certificates"]) == 2, rst.get("certificates"))
check("a factor revision answers content_movements with the figure that moved",
      len(rst["content_movements"]) == 2
      and rst["content_movements"][0]["corrected_content_bp"] != rst["content_movements"][0]["content_bp"],
      rst["content_movements"])
st, r1 = call("POST", f"/restatements/{rst['reference']}/resolutions", T["claims"], key=K(),
              body={"certificate": "CERT-PILOT-000001", "outcome": "unaffected",
                    "reason": "Already withdrawn for a different reason."})
check("a resolution is recorded against one certificate", st == 201, r1)
st, r2 = call("POST", f"/restatements/{rst['reference']}/resolutions", T["claims"], key=K(),
              body={"certificate": "CERT-PILOT-000001", "outcome": "withdrawn", "reason": "again"})
check("a second resolution against the same certificate is refused",
      st == 409 and r2["error"] == "certificate_already_resolved", r2)
st, r3 = call("POST", f"/restatements/{rst['reference']}/resolutions", T["claims"], key=K(),
              body={"certificate": ["A", "B"], "outcome": "unaffected", "reason": "many at once"})
check("no route resolves more than one certificate at a time", st == 400, r3)

# --- A consumption into a closed period opens a restatement ------------------
st, run = call("POST", "/runs", T["plant"], key=K(),
               body={"run_type": "dissolution", "site": "SITE-DEMO", "equipment": "EQ-DISS-1",
                     "recipe_version": "RCP-DISS-2", "operator": "plant@example.com",
                     "started_at": "2026-05-01T06:00:00Z"})
st, b = call("POST", f"/runs/{run['reference']}/consumptions", T["plant"], key=K(),
             body={"input_kind": "batch", "input_ref": "BATCH-1001", "mass_g": 1000,
                   "effective_on": "2026-05-01"})
check("a consumption effective in a closed period is refused and opens a restatement",
      st == 409 and b["error"] == "period_closed" and b["restatement"].startswith("RST-"), b)

# --- A suspension that reaches backwards -------------------------------------
st, sus = call("POST", "/sites/SITE-PILOT/certification", T["quality"], key=K(),
               body={"state": "suspended", "effective_from": "2026-03-01",
                     "reason": "A scheme audit finding on the pilot line."})
check("a suspension enumerates every certificate signed inside its window",
      st == 201 and len(sus["certificates_in_window"]) >= 2, sus.get("certificates_in_window"))
check("each is individually resolvable under the three outcomes",
      all(c["resolutions_available"] == ["reissued", "withdrawn", "unaffected"]
          for c in sus["certificates_in_window"]))
check("issuing stops for the affected site with the suspension named",
      sus["issuing_blocked"] is True and "suspended" in sus["blocking_condition"], sus)
st, prev = call("POST", "/certificates/preview", T["signer2"], body={"lot": "LOT-N6-0003"})
scope = [c for c in prev["conditions"] if c["condition"] == "signer_holds_scope"][0]
check("the suspension is the blocking condition on the issuing surface",
      scope["satisfied"] is False and "suspended" in scope["detail"], scope)
st, lift = call("POST", "/sites/SITE-PILOT/certification", T["quality"], key=K(),
                body={"state": "certified", "effective_from": "2026-09-01"})
check("lifting restores issuing and reinstates no withdrawn certificate",
      lift["issuing_blocked"] is False and "reinstates no withdrawn certificate" in lift["note"], lift)

# --- Change control ----------------------------------------------------------
st, cn = call("POST", "/change-notices", T["quality"], key=K(),
              body={"title": "Dissolution temperature band widened",
                    "detail": "The upper bound moves from 170 C to 175 C.",
                    "parameter": "temperature"})
check("a change notice derives rather than asserts what it affects",
      st == 201 and len(cn["specifications_affected"]) >= 1 and len(cn["customers_affected"]) == 2,
      cn)
check("a qualification-relevant change for an automotive customer blocks rather than warns",
      cn["blocking"] is True and "may invalidate" in cn["blocking_reason"], cn)
st, b = call("POST", f"/change-notices/{cn['reference']}/release", T["quality"], key=K(), body={})
check("a release is refused until every customer owed notice has been notified",
      st == 409 and len(b["customers_owed_notice"]) == 2, b)
for cus in ["CUS-HELIOS", "CUS-VANTA"]:
    call("POST", f"/change-notices/{cn['reference']}/notify", T["quality"], key=K(),
         body={"customer": cus})
msgs = mailpit("/messages?limit=200")["messages"]
check("a change notice mail carries the right subject",
      any(m["Subject"] == f"Change notice {cn['reference']} requires acknowledgement" for m in msgs),
      [m["Subject"] for m in msgs[:5]])
st, b = call("POST", f"/change-notices/{cn['reference']}/release", T["quality"], key=K(), body={})
check("the release lands once every customer has been notified", st == 200, b)

# --- Mail is sent for four acts and nothing else -----------------------------
st, en = call("POST", "/enquiries", key=K(),
              body={"type": "polymer_purchase", "email": "buyer@example.com", "name": "A Buyer"})
msgs = mailpit("/messages?limit=300")["messages"]
subjects = [m["Subject"] for m in msgs]
check("an enquiry sends one mail with the right subject",
      f"Enquiry {en['reference']} received" in subjects, subjects[:5])
allowed = ("Certificate ", "Change notice ", "Enquiry ")
check("nothing else sends mail", all(s.startswith(allowed) for s in subjects),
      [s for s in subjects if not s.startswith(allowed)])

# --- Contract allocation and short supply ------------------------------------
st, al = call("POST", "/contracts/CON-HELIOS-1/allocations", T["claims"], key=K(),
              body={"lot": "LOT-N6-0001", "favoured_over": ["CON-VANTA-1"]})
check("a short-supply allocation records who decided and which contracts went without",
      st == 201 and al["decided_by"] == "claims@example.com"
      and al["favoured_over"] == ["CON-VANTA-1"], al)
st, b = call("POST", "/contracts/CON-VANTA-1/allocations", T["claims"], key=K(),
             body={"lot": "LOT-N6-0001"})
check("a claim already allocated to one contract is refused a second attachment",
      st == 409 and b["error"] == "lot_already_allocated", b)

# --- A yield refuses a collector and a converter ----------------------------
st, b = call("GET", "/lots/LOT-N6-0001/yield", T["signer"])
check("a yield figure refuses a role that is not plant, quality, claims or audit", st == 403, b)

# --- The record still holds ---------------------------------------------------
st, chain = call("GET", "/record/check", T["auditor"])
check("the digest chain still verifies after every act above", chain["holds"] is True, chain)

print()
print(f"{len(passed)} passed, {len(failed)} failed")
if failed:
    print("FAILED:")
    for f in failed:
        print("  -", f)
sys.exit(1 if failed else 0)
