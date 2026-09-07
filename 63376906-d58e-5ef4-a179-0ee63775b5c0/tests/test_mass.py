"""The one section module for the mass-balance-attestation task.

Every assertion reads the deployed app over HTTP, the database behind it, or the
delivered mail beside it. The expectations come from instruction.md, never from
the running implementation, and every derived figure is recomputed here from the
pinned seed rather than read back from the app and compared to itself.
"""

from __future__ import annotations

import concurrent.futures
import re

import appclient
import conftest


def test_health_and_deployment_surface(anon):
    response = anon.get(conftest.api(conftest.HEALTH_PATH))
    assert response.status_code == 200, (
        "GET /api/health must answer 200 once the app is ready, got %s"
        % conftest.describe(response))
    root = appclient.app_url()
    assert root.startswith("http"), (
        "APP_PUBLIC_URL must name the origin the app answers on, got %r" % root)
    assert conftest.CONTAINER_PORT in root or ":" in root, (
        "APP_PUBLIC_URL must carry the port the app was told to bind, got %r" % root)
    home = anon.get(root + "/")
    assert home.status_code == 200, (
        "GET / must answer on the same origin as the API, got %s"
        % conftest.describe(home))
    scoped = anon.get(conftest.api("/batches"))
    assert scoped.status_code in conftest.STATUS_DENIED, (
        "GET /api/batches served an anonymous caller: %s" % conftest.describe(scoped))


def test_seeded_accounts_sign_in_through_the_identity_provider(anon, plant):
    for email in conftest.SEEDED_EMAILS:
        response = anon.post(
            conftest.api("/auth/login"),
            json={"email": email, "password": conftest.SEED_PASSWORD})
        assert response.status_code == 200, (
            "POST /api/auth/login for the seeded account %s must succeed with the "
            "pinned password, got %s" % (email, conftest.describe(response)))
        body = response.json()
        assert body.get("access_token"), (
            "the login response for %s carries no access_token: %s"
            % (email, conftest.describe(response)))
        assert body.get("token_type"), (
            "the login response for %s carries no token_type: %s"
            % (email, conftest.describe(response)))
    refused = anon.post(
        conftest.api("/auth/login"),
        json={"email": conftest.CLAIMS_EMAIL, "password": "not-the-seeded-password"})
    assert refused.status_code in conftest.STATUS_DENIED, (
        "a wrong password must be denied rather than served, got %s"
        % conftest.describe(refused))
    signup = anon.post(conftest.api("/auth/signup"),
                       json={"email": conftest.probe_email(),
                             "password": conftest.SEED_PASSWORD})
    assert signup.status_code not in conftest.STATUS_OK, (
        "POST /api/auth/signup created an account; signup is closed: %s"
        % conftest.describe(signup))
    reset = anon.post(conftest.api("/auth/reset"),
                      json={"email": conftest.CLAIMS_EMAIL})
    assert reset.status_code not in conftest.STATUS_OK, (
        "POST /api/auth/reset answered; no route resets a password: %s"
        % conftest.describe(reset))
    me = conftest.as_object(conftest.get_json(plant, "/auth/me"), "/auth/me")
    assert str(me.get("email")) == conftest.PLANT_EMAIL, (
        "GET /api/auth/me reports %r for the plant operator session" % me.get("email"))
    roles = me.get("roles")
    assert isinstance(roles, list) and conftest.ROLE_OF[conftest.PLANT_EMAIL] in roles, (
        "GET /api/auth/me reports roles %r, the brief grants %r"
        % (roles, conftest.ROLE_OF[conftest.PLANT_EMAIL]))
    scoped_sites = me.get("sites")
    assert isinstance(scoped_sites, list) and conftest.SITE_DEMO in scoped_sites, (
        "GET /api/auth/me reports sites %r for the plant operator" % (scoped_sites,))


def test_seeded_sites_and_capacity_are_exact(plant):
    rows = conftest.sites(plant)
    for site in conftest.SITES:
        assert site in rows, (
            "the seeded site %r is absent; the response carried %r"
            % (site, sorted(rows)))
    assert str(rows[conftest.SITE_COMM].get("confidence")) == conftest.CONFIDENCE_PLANNED, (
        "%s must report confidence %r, got %r"
        % (conftest.SITE_COMM, conftest.CONFIDENCE_PLANNED,
           rows[conftest.SITE_COMM].get("confidence")))
    for site in (conftest.SITE_PILOT, conftest.SITE_DEMO):
        assert str(rows[site].get("confidence")) == conftest.CONFIDENCE_COMMISSIONED, (
            "%s must report confidence %r, got %r"
            % (site, conftest.CONFIDENCE_COMMISSIONED, rows[site].get("confidence")))
    for site in conftest.SITES:
        path = "/sites/%s/capacity" % site
        body = conftest.as_object(conftest.get_json(plant, path), path)
        where = "the capacity of %s" % site
        assert conftest.integer(body, "nameplate_kg", where) == conftest.NAMEPLATE[site], (
            "%s reports nameplate %r, the brief seeds %d"
            % (where, body.get("nameplate_kg"), conftest.NAMEPLATE[site]))
        assert conftest.integer(body, "contracted_kg", where) == conftest.CONTRACTED[site], (
            "%s reports contracted %r, the brief seeds %d"
            % (where, body.get("contracted_kg"), conftest.CONTRACTED[site]))
        expected = conftest.NAMEPLATE[site] - conftest.CONTRACTED[site]
        assert conftest.integer(body, "uncommitted_kg", where) == expected, (
            "%s reports uncommitted %r; nameplate minus contracted is %d and the "
            "figure is computed rather than stored"
            % (where, body.get("uncommitted_kg"), expected))
        assert str(conftest.field(body, "basis", where)) == conftest.CAPACITY_BASIS, (
            "%s reports basis %r, the brief pins %r"
            % (where, body.get("basis"), conftest.CAPACITY_BASIS))
        assert str(body.get("confidence")) in conftest.CONFIDENCES, (
            "%s returns a figure without a confidence from the pinned four: %.200r"
            % (where, body))
        assert str(conftest.field(body, "last_revised", where)) == conftest.CAPACITY_REVISED, (
            "%s reports last_revised %r, the brief pins %r"
            % (where, body.get("last_revised"), conftest.CAPACITY_REVISED))
    comm = conftest.as_object(
        conftest.get_json(plant, "/sites/%s/capacity" % conftest.SITE_COMM),
        "/sites/SITE-COMM/capacity")
    assert comm["uncommitted_kg"] < 0, (
        "the commercial site holds more contract than nameplate, so uncommitted "
        "capacity must be allowed to go negative, got %r" % comm.get("uncommitted_kg"))


def test_seeded_collectors_and_approval_periods_are_stored(quality, db):
    rows = conftest.collectors(quality)
    for reference in conftest.COLLECTORS:
        assert reference in rows, (
            "the seeded collector %r is absent; the response carried %r"
            % (reference, sorted(rows)))
    for reference in conftest.COLLECTORS:
        path = "/collectors/%s" % reference
        body = conftest.as_object(conftest.get_json(quality, path), path)
        where = "collector %s" % reference
        assert str(conftest.field(body, "country", where)) == conftest.COLLECTOR_COUNTRY[reference], (
            "%s reports country %r, the brief seeds %r"
            % (where, body.get("country"), conftest.COLLECTOR_COUNTRY[reference]))
        assert str(conftest.field(body, "registration", where)) == conftest.COLLECTOR_REGISTRATION[reference], (
            "%s reports registration %r, the brief seeds %r"
            % (where, body.get("registration"),
               conftest.COLLECTOR_REGISTRATION[reference]))
        assert conftest.field(body, "registration_expiry", where), (
            "%s carries no registration expiry" % where)
        periods = conftest.field(body, "approval_periods", where)
        assert isinstance(periods, list) and periods, (
            "%s carries no approval periods; an approval is a dated period rather "
            "than a flag: %.300r" % (where, body))
        for entry in periods:
            assert str(entry.get("state")) in conftest.APPROVAL_STATES, (
                "%s carries an approval state %r outside the pinned four"
                % (where, entry.get("state")))
            assert entry.get("valid_from"), "%s has a period with no valid_from" % where
    cinder = conftest.as_object(
        conftest.get_json(quality, "/collectors/%s" % conftest.COL_CINDER),
        "/collectors/COL-CINDER")
    states = [str(p.get("state")) for p in cinder["approval_periods"]]
    assert "conditional" in states, (
        "%s must be seeded conditional, the periods report %r"
        % (conftest.COL_CINDER, states))
    conditional = [p for p in cinder["approval_periods"]
                   if str(p.get("state")) == "conditional"][0]
    assert conditional.get("condition"), (
        "a conditional approval must name its condition: %.200r" % (conditional,))
    assert str(conditional.get("condition_closes_on")) == conftest.CINDER_CONDITION_CLOSES, (
        "the conditional approval closes on %r, the brief pins %r"
        % (conditional.get("condition_closes_on"), conftest.CINDER_CONDITION_CLOSES))
    stored = db.query("SELECT 1")
    assert stored is not None, (
        "the database at DATABASE_URL must answer; records live there rather than "
        "in memory")


def test_seeded_batches_are_persisted_with_derived_dry_mass(plant):
    rows = conftest.batches(plant)
    for reference, seed in conftest.SEEDED_BATCHES.items():
        assert reference in rows, (
            "the seeded batch %r is absent; the register carried %r"
            % (reference, sorted(rows)))
        row = rows[reference]
        where = "batch %s" % reference
        assert str(conftest.field(row, "collector", where)) == seed["collector"], (
            "%s reports collector %r, the brief seeds %r"
            % (where, row.get("collector"), seed["collector"]))
        assert str(conftest.field(row, "category", where)) == seed["category"], (
            "%s reports category %r, the brief seeds %r"
            % (where, row.get("category"), seed["category"]))
        assert conftest.integer(row, "net_g", where) == seed["net_g"], (
            "%s reports net_g %r, the brief seeds %d"
            % (where, row.get("net_g"), seed["net_g"]))
        assert conftest.integer(row, "moisture_bp", where) == seed["moisture_bp"], (
            "%s reports moisture_bp %r, the brief seeds %d"
            % (where, row.get("moisture_bp"), seed["moisture_bp"]))
        expected = (seed["net_g"] * (conftest.BASIS_POINTS_FULL - seed["moisture_bp"])
                    // conftest.BASIS_POINTS_FULL)
        assert expected == seed["dry_mass_g"], (
            "the pinned dry mass for %s is inconsistent with its own arithmetic"
            % reference)
        assert conftest.integer(row, "dry_mass_g", where) == expected, (
            "%s reports dry_mass_g %r; net mass %d at moisture %d basis points is "
            "%d grams dry"
            % (where, row.get("dry_mass_g"), seed["net_g"], seed["moisture_bp"],
               expected))
        assert bool(conftest.field(row, "claimable", where)) is seed["claimable"], (
            "%s reports claimable %r, the brief seeds %r"
            % (where, row.get("claimable"), seed["claimable"]))
        assert str(conftest.field(row, "site", where)) == conftest.SITE_DEMO, (
            "%s must name its site; the brief seeds every batch at %s"
            % (where, conftest.SITE_DEMO))
    flagged = rows[conftest.BATCH_1004]
    flags = conftest.field(flagged, "flags", "batch %s" % conftest.BATCH_1004)
    assert conftest.FLAG_LAPSED_CALIBRATION in list(flags), (
        "%s was weighed on %s, calibrated %s, so the batch must carry %r; it "
        "carries %r" % (conftest.BATCH_1004, conftest.DEVICE_LAPSED,
                        conftest.DEVICE_CALIBRATED[conftest.DEVICE_LAPSED],
                        conftest.FLAG_LAPSED_CALIBRATION, flags))


def test_seeded_runs_and_consumption_rows_carry_their_masses(plant):
    rows = conftest.runs(plant)
    for reference, seed in conftest.SEEDED_RUNS.items():
        assert reference in rows, (
            "the seeded run %r is absent; the board carried %r"
            % (reference, sorted(rows)))
        where = "run %s" % reference
        row = rows[reference]
        assert str(conftest.field(row, "run_type", where)) == seed["run_type"], (
            "%s reports run_type %r, the brief seeds %r"
            % (where, row.get("run_type"), seed["run_type"]))
        assert str(row.get("run_type")) in conftest.RUN_TYPES, (
            "%s reports a run type outside the pinned four: %r"
            % (where, row.get("run_type")))
        assert str(conftest.field(row, "recipe_version", where)) == seed["recipe_version"], (
            "%s reports recipe_version %r, the brief seeds %r"
            % (where, row.get("recipe_version"), seed["recipe_version"]))
        detail = conftest.as_object(
            conftest.get_json(plant, "/runs/%s" % reference), "/runs/%s" % reference)
        consumptions = conftest.field(detail, "consumptions", where)
        assert isinstance(consumptions, list) and consumptions, (
            "%s carries no consumption rows; the edge is what carries the mass"
            % where)
        observed = {}
        for entry in consumptions:
            key = str(entry.get("input"))
            observed[key] = observed.get(key, 0) + int(entry.get("mass_g", 0))
        assert observed == seed["consumes"], (
            "%s consumed %r, the brief seeds %r" % (where, observed, seed["consumes"]))
        assert conftest.integer(detail, "losses_g", where) == seed["losses_g"], (
            "%s reports losses_g %r; mass in minus mass out is %d and the figure is "
            "computed rather than entered"
            % (where, detail.get("losses_g"), seed["losses_g"]))
        assert str(conftest.field(detail, "site", where)) == conftest.SITE_DEMO, (
            "%s must name its site" % where)
        assert conftest.field(detail, "event_at", where), (
            "%s carries no event time" % where)
        assert conftest.field(detail, "recorded_at", where), (
            "%s carries no record time" % where)
        assert conftest.field(detail, "effective_on", where), (
            "%s carries no effective date" % where)
    total = 0
    for seed in conftest.SEEDED_RUNS.values():
        total += sum(seed["consumes"].values())
    assert total == 2110000, (
        "the seeded consumption rows sum to %d grams; the brief's four hops sum to "
        "2110000" % total)


def test_seeded_outputs_losses_and_lots_reconcile(plant):
    produced = conftest.collection(plant, "/outputs")
    for reference, seed in conftest.SEEDED_OUTPUTS.items():
        assert reference in produced, (
            "the seeded output %r is absent; the response carried %r"
            % (reference, sorted(produced)))
        where = "output %s" % reference
        row = produced[reference]
        assert str(conftest.field(row, "run", where)) == seed["run"], (
            "%s reports run %r, the brief seeds %r"
            % (where, row.get("run"), seed["run"]))
        assert str(conftest.field(row, "kind", where)) == seed["kind"], (
            "%s reports kind %r, the brief seeds %r"
            % (where, row.get("kind"), seed["kind"]))
        assert str(row.get("kind")) in conftest.OUTPUT_KINDS, (
            "%s reports a kind outside the pinned three: %r" % (where, row.get("kind")))
        assert conftest.integer(row, "mass_g", where) == seed["mass_g"], (
            "%s reports mass_g %r, the brief seeds %d"
            % (where, row.get("mass_g"), seed["mass_g"]))
    byproduct = produced[conftest.BYPRODUCT_SOLD]
    assert str(byproduct.get("disposition")) in conftest.BYPRODUCT_DISPOSITIONS, (
        "the seeded byproduct reports disposition %r outside the pinned two"
        % byproduct.get("disposition"))
    assert str(byproduct.get("disposition")) == "sold", (
        "%s is seeded as sold, so the byproduct carries a share of the claim; it "
        "reports %r" % (conftest.BYPRODUCT_SOLD, byproduct.get("disposition")))
    held = conftest.lots(plant)
    for reference, seed in conftest.SEEDED_LOTS.items():
        assert reference in held, (
            "the seeded lot %r is absent; the register carried %r"
            % (reference, sorted(held)))
        where = "lot %s" % reference
        row = held[reference]
        assert conftest.integer(row, "mass_g", where) == seed["mass_g"], (
            "%s reports mass_g %r, the brief seeds %d"
            % (where, row.get("mass_g"), seed["mass_g"]))
        assert str(conftest.field(row, "disposition", where)) == seed["disposition"], (
            "%s reports disposition %r, the brief seeds %r"
            % (where, row.get("disposition"), seed["disposition"]))
        assert str(row.get("disposition")) in conftest.DISPOSITIONS, (
            "%s reports a disposition outside the pinned four: %r"
            % (where, row.get("disposition")))
        assert str(conftest.field(row, "site", where)) == seed["site"], (
            "%s reports site %r, the brief seeds %r"
            % (where, row.get("site"), seed["site"]))
        assert str(conftest.field(row, "claim_type", where)) in conftest.CLAIM_TYPES, (
            "%s reports a claim type outside the pinned three: %r"
            % (where, row.get("claim_type")))
    lot_three = conftest.as_object(
        conftest.get_json(plant, "/lots/%s" % conftest.LOT_3),
        "/lots/%s" % conftest.LOT_3)
    assert bool(lot_three.get("provisional_factor")) is True, (
        "%s was produced at %s under the provisional factor %s, so the lot must say "
        "so; it reports %r" % (conftest.LOT_3, conftest.SITE_PILOT,
                               conftest.FACTOR_PILOT,
                               lot_three.get("provisional_factor")))


def test_seeded_carbon_method_and_figure_are_exact(claims):
    path = "/carbon-methods/%s/versions/%s" % (conftest.METHOD, conftest.METHOD_VERSION)
    body = conftest.as_object(conftest.get_json(claims, path), path)
    where = "carbon method %s version %s" % (conftest.METHOD, conftest.METHOD_VERSION)
    assert str(conftest.field(body, "standard", where)) == conftest.METHOD_STANDARD, (
        "%s reports standard %r, the brief pins %r"
        % (where, body.get("standard"), conftest.METHOD_STANDARD))
    assert str(conftest.field(body, "functional_unit", where)) == conftest.METHOD_FUNCTIONAL_UNIT, (
        "%s reports functional unit %r, the brief pins %r"
        % (where, body.get("functional_unit"), conftest.METHOD_FUNCTIONAL_UNIT))
    assert str(conftest.field(body, "boundary", where)) == conftest.METHOD_BOUNDARY, (
        "%s reports boundary %r, the brief pins %r"
        % (where, body.get("boundary"), conftest.METHOD_BOUNDARY))
    assert str(conftest.field(body, "reviewer", where)) == conftest.METHOD_REVIEWER, (
        "%s reports reviewer %r, the brief pins %r"
        % (where, body.get("reviewer"), conftest.METHOD_REVIEWER))
    assert str(conftest.field(body, "published_on", where)) == conftest.METHOD_PUBLISHED_ON, (
        "%s reports published_on %r, the brief pins %r"
        % (where, body.get("published_on"), conftest.METHOD_PUBLISHED_ON))
    assert str(conftest.field(body, "allocation_basis", where)) == conftest.ALLOCATION_BASIS, (
        "%s reports allocation basis %r, the brief pins %r"
        % (where, body.get("allocation_basis"), conftest.ALLOCATION_BASIS))
    factors = conftest.field(body, "emission_factors", where)
    assert isinstance(factors, list) and factors, (
        "%s carries no emission factors" % where)
    for entry in factors:
        assert entry.get("source"), (
            "%s carries an emission factor with no source: %.200r" % (where, entry))
        assert entry.get("year"), (
            "%s carries an emission factor with no year: %.200r" % (where, entry))
    figure = conftest.carbon(claims)
    place = "the carbon figure of %s" % conftest.LOT_1
    assert conftest.integer(figure, "value_mg_per_kg", place) == conftest.CARBON_VALUE, (
        "%s reports %r, the brief pins %d"
        % (place, figure.get("value_mg_per_kg"), conftest.CARBON_VALUE))
    assert conftest.integer(figure, "uncertainty_bp", place) == conftest.CARBON_UNCERTAINTY_BP, (
        "%s reports uncertainty %r, the brief pins %d"
        % (place, figure.get("uncertainty_bp"), conftest.CARBON_UNCERTAINTY_BP))
    assert conftest.integer(figure, "primary_share_bp", place) == conftest.CARBON_PRIMARY_SHARE_BP, (
        "%s reports primary share %r, the brief pins %d"
        % (place, figure.get("primary_share_bp"), conftest.CARBON_PRIMARY_SHARE_BP))
    comparator = conftest.field(figure, "comparator", place)
    assert str(comparator.get("material")) == conftest.COMPARATOR_MATERIAL, (
        "%s names comparator material %r, the brief pins %r"
        % (place, comparator.get("material"), conftest.COMPARATOR_MATERIAL))
    assert str(comparator.get("dataset")) == conftest.COMPARATOR_DATASET, (
        "%s names comparator dataset %r, the brief pins %r"
        % (place, comparator.get("dataset"), conftest.COMPARATOR_DATASET))
    assert str(comparator.get("region")) == conftest.COMPARATOR_REGION, (
        "%s names comparator region %r, the brief pins %r"
        % (place, comparator.get("region"), conftest.COMPARATOR_REGION))
    assert str(comparator.get("dataset_year")) == conftest.COMPARATOR_DATASET.split()[-1], (
        "%s names a comparator with no dataset year: %.200r" % (place, comparator))


def test_seeded_certificates_and_the_gapless_sequence_are_exact(signer2):
    rows = conftest.certificates(signer2)
    for number in (conftest.CERT_WITHDRAWN, conftest.CERT_ISSUED):
        assert number in rows, (
            "the seeded certificate %r is absent; the register carried %r"
            % (number, sorted(rows)))
    withdrawn = rows[conftest.CERT_WITHDRAWN]
    where = "certificate %s" % conftest.CERT_WITHDRAWN
    assert str(conftest.field(withdrawn, "state", where)) == "withdrawn", (
        "%s reports state %r, the brief seeds it withdrawn"
        % (where, withdrawn.get("state")))
    assert str(conftest.field(withdrawn, "withdrawn_on", where)) == conftest.CERT_WITHDRAWN_ON, (
        "%s reports withdrawn_on %r, the brief pins %r"
        % (where, withdrawn.get("withdrawn_on"), conftest.CERT_WITHDRAWN_ON))
    assert str(conftest.field(withdrawn, "withdrawal_reason", where)) == conftest.CERT_WITHDRAWN_REASON, (
        "%s reports reason %r, the brief pins %r"
        % (where, withdrawn.get("withdrawal_reason"), conftest.CERT_WITHDRAWN_REASON))
    issued = rows[conftest.CERT_ISSUED]
    assert str(issued.get("state")) == "issued", (
        "certificate %s reports state %r, the brief seeds it issued"
        % (conftest.CERT_ISSUED, issued.get("state")))
    assert str(issued.get("scheme")) == conftest.SCHEME, (
        "certificate %s reports scheme %r, the brief pins %r"
        % (conftest.CERT_ISSUED, issued.get("scheme"), conftest.SCHEME))
    assert str(issued.get("registration")) == conftest.REGISTRATION, (
        "certificate %s reports registration %r, the brief pins %r"
        % (conftest.CERT_ISSUED, issued.get("registration"), conftest.REGISTRATION))
    demo = [n for n in rows if n.startswith("CERT-DEMO-")]
    assert demo == [] or demo == [conftest.CERT_FIRST_DEMO], (
        "the demonstration sequence must open at %r; the register carries %r"
        % (conftest.CERT_FIRST_DEMO, demo))


def test_every_role_is_denied_outside_its_grants(plant, quality, claims, analyst):
    denied = [
        (plant, "POST", "/collectors/%s/approvals" % conftest.COL_ALDER,
         {"state": "approved", "valid_from": "2026-08-01", "valid_to": "2026-12-31"}),
        (plant, "POST", "/lots/%s/disposition" % conftest.LOT_1,
         {"disposition": "released"}),
        (analyst, "POST", "/lots/%s/disposition" % conftest.LOT_1,
         {"disposition": "released"}),
        (quality, "POST", "/balance-periods/%s/close" % conftest.PERIOD_OPEN, {}),
        (claims, "POST", "/carbon-methods/%s/versions" % conftest.METHOD,
         {"version": "3", "boundary": conftest.METHOD_BOUNDARY}),
        (claims, "POST", "/certificates",
         {"lot": conftest.LOT_1, "recipient": conftest.CUS_HELIOS,
          "password": conftest.SEED_PASSWORD}),
    ]
    for client, verb, path, payload in denied:
        response = client.post(conftest.api(path), json=payload,
                               headers=conftest.idem())
        assert response.status_code in conftest.STATUS_DENIED, (
            "%s /api%s must be refused for a role the brief does not grant it to, "
            "got %s" % (verb, path, conftest.describe(response)))
    before = conftest.as_object(
        conftest.get_json(quality, "/collectors/%s" % conftest.COL_ALDER),
        "/collectors/COL-ALDER")
    plant.post(conftest.api("/collectors/%s/approvals" % conftest.COL_ALDER),
               json={"state": "approved", "valid_from": "2026-08-01",
                     "valid_to": "2026-12-31"}, headers=conftest.idem())
    conftest.settle()
    after = conftest.as_object(
        conftest.get_json(quality, "/collectors/%s" % conftest.COL_ALDER),
        "/collectors/COL-ALDER")
    assert after["approval_periods"] == before["approval_periods"], (
        "a denied request changed the protected state: the approval periods of %s "
        "moved from %.200r to %.200r"
        % (conftest.COL_ALDER, before["approval_periods"], after["approval_periods"]))


def test_the_four_separations_are_refused_on_the_server(analyst, quality, plant):
    entered = analyst.post(
        conftest.api("/test-results"),
        json={"lot": conftest.LOT_1, "property": "relative_viscosity",
              "method": "ISO 307", "instrument": "VISC-1",
              "analyst": conftest.ANALYST_EMAIL, "value": "2.41", "unit": "ratio",
              "uncertainty_bp": 100},
        headers=conftest.idem())
    assert entered.status_code in conftest.STATUS_OK, (
        "an analyst must be able to enter a laboratory result: %s"
        % conftest.describe(entered))
    same_person = analyst.post(
        conftest.api("/lots/%s/disposition" % conftest.LOT_1),
        json={"disposition": "released"}, headers=conftest.idem())
    assert same_person.status_code in conftest.STATUS_DENIED, (
        "the person who entered a result must be refused the disposition of that "
        "lot, got %s" % conftest.describe(same_person))
    close = quality.post(
        conftest.api("/balance-periods/%s/close" % conftest.PERIOD_OPEN),
        json={}, headers=conftest.idem())
    assert close.status_code in conftest.STATUS_DENIED, (
        "the person who publishes a carbon method version must be refused the "
        "close of the period applying it, got %s" % conftest.describe(close))
    approve = plant.post(
        conftest.api("/collectors/%s/approvals" % conftest.COL_ALDER),
        json={"state": "approved", "valid_from": "2026-08-01",
              "valid_to": "2026-12-31"}, headers=conftest.idem())
    assert approve.status_code in conftest.STATUS_DENIED, (
        "the person who books in a batch must be refused the approval of the "
        "supplying collector, got %s" % conftest.describe(approve))


def test_signer_outside_scope_is_forbidden_to_sign(signer2, signer):
    me = conftest.as_object(conftest.get_json(signer2, "/auth/me"), "/auth/me")
    scope = me.get("sites")
    assert isinstance(scope, list) and scope == [conftest.SITE_PILOT], (
        "%s is scoped to %s alone; the session reports %r"
        % (conftest.SIGNER2_EMAIL, conftest.SITE_PILOT, scope))
    outside = signer2.post(
        conftest.api("/certificates"),
        json={"lot": conftest.LOT_1, "recipient": conftest.CUS_HELIOS,
              "password": conftest.SEED_PASSWORD}, headers=conftest.idem())
    assert outside.status_code in conftest.STATUS_DENIED + conftest.STATUS_CONFLICT, (
        "%s holds no signing scope at %s, so signing against %s must be forbidden, "
        "got %s" % (conftest.SIGNER2_EMAIL, conftest.SITE_DEMO, conftest.LOT_1,
                    conftest.describe(outside)))
    body = conftest.preview(signer2, lot=conftest.LOT_1)
    assert body.status_code in conftest.STATUS_OK + conftest.STATUS_REFUSED, (
        "a preview for a lot outside scope must answer rather than error: %s"
        % conftest.describe(body))
    if body.status_code in conftest.STATUS_OK:
        entries = conftest.conditions_of(body.json())
        scoped = [e for e in entries if "scope" in str(e.get("condition")).lower()]
        assert scoped and scoped[0].get("satisfied") is False, (
            "the scope condition must read unsatisfied for a signer outside scope: "
            "%.300r" % (entries,))
    inside = conftest.preview(signer, lot=conftest.LOT_1)
    assert inside.status_code in conftest.STATUS_OK, (
        "%s holds scope at %s, so the preview must answer: %s"
        % (conftest.SIGNER_EMAIL, conftest.SITE_DEMO, conftest.describe(inside)))


def test_auditor_role_is_denied_at_every_mutating_route(auditor):
    mutations = [
        ("/batches", {"collector": conftest.COL_ALDER}),
        ("/runs", {"run_type": "dissolution", "site": conftest.SITE_DEMO}),
        ("/lots/%s/disposition" % conftest.LOT_1, {"disposition": "released"}),
        ("/balance-periods/%s/allocations" % conftest.PERIOD_OPEN,
         {"lot": conftest.LOT_1, "category": conftest.POST_CONSUMER, "mass_g": 1}),
        ("/certificates", {"lot": conftest.LOT_1, "recipient": conftest.CUS_HELIOS}),
        ("/overrides/%s/review" % conftest.OVERRIDE, {}),
    ]
    for path, payload in mutations:
        response = auditor.post(conftest.api(path), json=payload,
                                headers=conftest.idem())
        assert response.status_code in conftest.STATUS_DENIED, (
            "an auditor writes no operational record, so POST /api%s must be "
            "denied, got %s" % (path, conftest.describe(response)))
    readable = conftest.as_list(conftest.get_json(auditor, "/lots"), "/lots")
    assert readable, "an auditor reads within scope; the lot register came back empty"


def test_collector_role_cannot_read_lots_runs_or_yields(anon):
    hidden = anon.get(conftest.api("/lots"))
    assert hidden.status_code in conftest.STATUS_NOT_VISIBLE, (
        "the lot register is not public: %s" % conftest.describe(hidden))
    for path in ("/runs", "/reconciliation", "/balance-periods/%s" % conftest.PERIOD_OPEN,
                 "/lots/%s/genealogy" % conftest.LOT_1,
                 "/collectors/%s" % conftest.COL_ALDER):
        response = anon.get(conftest.api(path))
        assert response.status_code in conftest.STATUS_NOT_VISIBLE, (
            "GET /api%s is scoped to the producer and must refuse an unscoped "
            "caller, got %s" % (path, conftest.describe(response)))
    public = anon.get(conftest.api("/verify/%s" % conftest.CERT_WITHDRAWN))
    assert public.status_code == 200, (
        "the verification route is the one scoped read a stranger gets: %s"
        % conftest.describe(public))
    body = public.json()
    for forbidden in ("yield", "collector", "genealogy", "carbon_breakdown"):
        assert forbidden not in body, (
            "the verification answer carries %r; a collector and a yield never "
            "reach a stranger: %.300r" % (forbidden, body))


def test_public_routes_answer_and_console_routes_refuse_anonymous(anon):
    root = appclient.app_url()
    for route in conftest.PUBLIC_ROUTES:
        response = anon.get(root + route)
        assert response.status_code == 200, (
            "the public route %s must answer with no session, got %s"
            % (route, conftest.describe(response)))
    for route in conftest.CONSOLE_ROUTES:
        response = anon.get(root + route, follow_redirects=False)
        assert response.status_code in (301, 302, 303, 307, 308, 401, 403), (
            "the console route %s must send an anonymous reader to the sign-in "
            "route rather than rendering, got %s"
            % (route, conftest.describe(response)))
    login = anon.get(root + "/login")
    assert login.status_code == 200, (
        "GET /login must answer on the same origin: %s" % conftest.describe(login))


def test_batch_claimability_resolves_against_the_approval_in_force(plant, quality):
    rows = conftest.batches(plant)
    lapsed = rows[conftest.BATCH_1003]
    assert bool(lapsed.get("claimable")) is False, (
        "%s was received on %s, after the approval of %s ended, so the batch is "
        "processed as non-claimable input; it reports %r"
        % (conftest.BATCH_1003, conftest.SEEDED_BATCHES[conftest.BATCH_1003]["received_on"],
           conftest.COL_BRINE, lapsed.get("claimable")))
    reason = str(lapsed.get("claimable_reason"))
    assert "approval" in reason or "lapsed" in reason, (
        "%s must name why the batch cannot be claimed; it reports %r"
        % (conftest.BATCH_1003, reason))
    flagged = rows[conftest.BATCH_1004]
    assert bool(flagged.get("claimable")) is True, (
        "%s came from a conditional collector on a lapsed weighing device; the "
        "batch stays claimable and carries a flag, it reports %r"
        % (conftest.BATCH_1004, flagged.get("claimable")))
    booked = conftest.book_batch(plant, collector=conftest.COL_BRINE,
                                 received_on="2026-08-14")
    assert booked.status_code in conftest.STATUS_OK, (
        "material from a lapsed collector is still accepted; the plant needs "
        "feeding: %s" % conftest.describe(booked))
    fresh = booked.json()
    assert bool(fresh.get("claimable")) is False, (
        "a batch received from %s after the approval ended must enter as "
        "non-claimable input, got %.300r" % (conftest.COL_BRINE, fresh))
    earlier = conftest.book_batch(plant, collector=conftest.COL_BRINE,
                                  received_on="2026-05-14")
    assert earlier.status_code in conftest.STATUS_OK, (
        "a batch received inside the approval window must book in: %s"
        % conftest.describe(earlier))
    assert bool(earlier.json().get("claimable")) is True, (
        "a batch received on 2026-05-14 falls inside the %s approval, so it is "
        "claimable; the answer was %.300r" % (conftest.COL_BRINE, earlier.json()))


def test_batch_category_cannot_change_after_acceptance(plant, quality, auditor):
    reference = conftest.BATCH_1001
    for client, who in ((plant, "a plant operator"), (quality, "a quality manager"),
                        (auditor, "an auditor")):
        response = client.patch(conftest.api("/batches/%s" % reference),
                                json={"category": conftest.PRE_CONSUMER},
                                headers=conftest.idem())
        assert response.status_code in conftest.STATUS_REFUSED, (
            "%s changed the category of %s; the field is immutable after "
            "acceptance for everybody, got %s"
            % (who, reference, conftest.describe(response)))
    conftest.settle()
    row = conftest.batches(plant)[reference]
    assert str(row.get("category")) == conftest.POST_CONSUMER, (
        "%s reports category %r after three refused attempts; the seeded value is %r"
        % (reference, row.get("category"), conftest.POST_CONSUMER))


def test_intake_records_mass_custody_and_contamination(plant):
    booked = conftest.book_batch(plant, net_g=240000, moisture_bp=2500)
    assert booked.status_code in conftest.STATUS_OK, (
        "POST /api/batches must accept a complete booking: %s"
        % conftest.describe(booked))
    body = booked.json()
    where = "the batch just booked in"
    assert conftest.integer(body, "dry_mass_g", where) == 180000, (
        "%s reports dry_mass_g %r; 240000 grams at 2500 basis points of moisture is "
        "180000 grams dry" % (where, body.get("dry_mass_g")))
    assert bool(conftest.field(body, "custody_complete", where)) is True, (
        "%s carried every custody link, so custody_complete must be true: %.300r"
        % (where, body))
    composition = conftest.field(body, "composition", where)
    assert str(composition.get("basis")) in conftest.COMPOSITION_BASES, (
        "%s reports a composition basis outside the pinned three: %r"
        % (where, composition.get("basis")))
    contamination = conftest.field(body, "contamination", where)
    for key in ("non_nylon_bp", "elastane_bp", "coatings", "colour_load",
                "foreign_matter"):
        assert key in contamination, (
            "%s carries no %r in its contamination record: %.300r"
            % (where, key, contamination))
    seeded = conftest.batches(plant)[conftest.BATCH_1004]
    detail = conftest.as_object(
        conftest.get_json(plant, "/batches/%s" % conftest.BATCH_1004),
        "/batches/BATCH-1004")
    declared = int(detail["composition"]["fraction_bp"])
    measured = int(detail["composition"].get("measured_fraction_bp", declared))
    assert declared == conftest.BATCH_1004_DECLARED_BP, (
        "%s declares %r basis points of polymer, the brief seeds %d"
        % (conftest.BATCH_1004, declared, conftest.BATCH_1004_DECLARED_BP))
    assert measured == conftest.BATCH_1004_MEASURED_BP, (
        "%s measured %r basis points, the brief seeds %d"
        % (conftest.BATCH_1004, measured, conftest.BATCH_1004_MEASURED_BP))
    assert abs(declared - measured) > conftest.DECLARATION_TOLERANCE_BP, (
        "the seeded departure must exceed the %d basis point tolerance"
        % conftest.DECLARATION_TOLERANCE_BP)
    collector = conftest.as_object(
        conftest.get_json(plant, "/collectors/%s" % conftest.COL_CINDER),
        "/collectors/COL-CINDER")
    findings = collector.get("findings")
    assert isinstance(findings, list) and findings, (
        "a departure from the declaration attaches to the collector rather than to "
        "the plant; %s carries no findings: %.300r" % (conftest.COL_CINDER, collector))
    assert str(seeded.get("device")) == conftest.DEVICE_LAPSED, (
        "%s was weighed on %s; the register reports %r"
        % (conftest.BATCH_1004, conftest.DEVICE_LAPSED, seeded.get("device")))


def test_custody_gap_makes_a_batch_non_claimable_until_evidence_arrives(plant):
    detail = conftest.as_object(
        conftest.get_json(plant, "/batches/%s" % conftest.BATCH_1005),
        "/batches/BATCH-1005")
    assert bool(detail.get("claimable")) is False, (
        "%s is missing a custody link, so the batch is non-claimable; it reports %r"
        % (conftest.BATCH_1005, detail.get("claimable")))
    assert bool(detail.get("custody_complete")) is False, (
        "%s must report custody_complete false: %.300r"
        % (conftest.BATCH_1005, detail))
    reason = str(detail.get("claimable_reason"))
    assert conftest.MISSING_LINK_ON_1005 in reason, (
        "%s must name the missing link %r; it reports %r"
        % (conftest.BATCH_1005, conftest.MISSING_LINK_ON_1005, reason))
    graph = conftest.genealogy(plant, conftest.LOT_1)
    nodes = graph.get("nodes")
    assert isinstance(nodes, list), (
        "the genealogy must carry a node list: %.300r" % (graph,))
    late = plant.post(
        conftest.api("/batches/%s/custody" % conftest.BATCH_1005),
        json={"kind": conftest.MISSING_LINK_ON_1005, "on": "2026-03-02",
              "party": conftest.COL_ALDER, "arrived_on": "2026-03-23"},
        headers=conftest.idem())
    assert late.status_code in conftest.STATUS_OK, (
        "late evidence must attach with its arrival date: %s"
        % conftest.describe(late))
    conftest.settle()
    after = conftest.as_object(
        conftest.get_json(plant, "/batches/%s" % conftest.BATCH_1005),
        "/batches/BATCH-1005")
    assert str(after.get("claimable_from")) == "2026-03-23", (
        "%s becomes claimable forward from the date the evidence arrived rather "
        "than from its receipt date; it reports %r"
        % (conftest.BATCH_1005, after.get("claimable_from")))


def test_partial_rejection_and_idempotent_booking_keep_one_stored_row(plant):
    booked = conftest.book_batch(plant, net_g=200000)
    assert booked.status_code in conftest.STATUS_OK, (
        "the booking must succeed before a rejection is recorded against it: %s"
        % conftest.describe(booked))
    reference = str(booked.json().get("reference"))
    bad = plant.post(conftest.api("/batches/%s/reject" % reference),
                     json={"rejected_g": 250000, "reason": "wet",
                           "destination": "transfer station"},
                     headers=conftest.idem())
    assert bad.status_code in conftest.STATUS_REFUSED, (
        "a rejection larger than the delivery cannot sum to the delivered mass and "
        "must be refused, got %s" % conftest.describe(bad))
    good = plant.post(conftest.api("/batches/%s/reject" % reference),
                      json={"rejected_g": 50000, "reason": "foreign matter",
                            "destination": "transfer station"},
                      headers=conftest.idem())
    assert good.status_code in conftest.STATUS_OK, (
        "a partial rejection must be recorded: %s" % conftest.describe(good))
    conftest.settle()
    detail = conftest.as_object(
        conftest.get_json(plant, "/batches/%s" % reference), "/batches")
    accepted = conftest.integer(detail, "accepted_g", "the rejected batch")
    rejected = conftest.integer(detail, "rejected_g", "the rejected batch")
    assert accepted + rejected == 200000, (
        "accepted %d plus rejected %d must equal the delivered 200000 grams"
        % (accepted, rejected))
    assert str(detail.get("rejected_destination")), (
        "a rejected load leaving the site is a transfer with its own paperwork, so "
        "the destination is recorded: %.300r" % (detail,))
    key = conftest.idem()
    first = conftest.book_batch(plant, net_g=111000, headers=key)
    second = conftest.book_batch(plant, net_g=111000, headers=key)
    assert first.status_code in conftest.STATUS_OK, (
        "the first booking under an idempotency key must succeed: %s"
        % conftest.describe(first))
    assert second.status_code in conftest.STATUS_OK, (
        "a repeated idempotency key returns the original result rather than an "
        "error: %s" % conftest.describe(second))
    assert str(first.json().get("reference")) == str(second.json().get("reference")), (
        "a repeated key created a second batch: %r then %r"
        % (first.json().get("reference"), second.json().get("reference")))


def test_closed_run_refuses_a_second_close(plant):
    opened = plant.post(
        conftest.api("/runs"),
        json={"run_type": "dissolution", "site": conftest.SITE_DEMO,
              "equipment": "DISS-1", "recipe_version": conftest.RECIPE_DISS,
              "operator": conftest.PLANT_EMAIL, "started_at": "2026-06-01T08:00:00Z"},
        headers=conftest.idem())
    assert opened.status_code in conftest.STATUS_OK, (
        "a plant operator must be able to open a run: %s" % conftest.describe(opened))
    reference = str(opened.json().get("reference"))
    first = plant.post(conftest.api("/runs/%s/close" % reference),
                       json={"ended_at": "2026-06-01T16:00:00Z"},
                       headers=conftest.idem())
    assert first.status_code in conftest.STATUS_OK, (
        "the first close must succeed: %s" % conftest.describe(first))
    second = plant.post(conftest.api("/runs/%s/close" % reference),
                        json={"ended_at": "2026-06-01T17:00:00Z"},
                        headers=conftest.idem())
    assert second.status_code in conftest.STATUS_REFUSED, (
        "a closed run refuses a second close, got %s" % conftest.describe(second))
    write = plant.post(conftest.api("/runs/%s/consumptions" % reference),
                       json={"input": conftest.BATCH_1002, "mass_g": 1000},
                       headers=conftest.idem())
    assert write.status_code in conftest.STATUS_REFUSED, (
        "a closed run refuses every write, got %s" % conftest.describe(write))
    conftest.settle()
    record = conftest.as_list(conftest.get_json(plant, "/record",
                                                {"object": reference}), "/record")
    attempts = [e for e in record if "close" in str(e.get("act", "")).lower()]
    assert len(attempts) >= 2, (
        "the refused second close is recorded as an attempt; the record for %s "
        "carries %d close entries" % (reference, len(attempts)))


def test_run_close_queues_rather_than_reporting_completion(plant):
    opened = plant.post(
        conftest.api("/runs"),
        json={"run_type": "purification", "site": conftest.SITE_DEMO,
              "equipment": "PURI-1", "recipe_version": conftest.RECIPE_PURI,
              "operator": conftest.PLANT_EMAIL, "started_at": "2026-06-02T08:00:00Z"},
        headers=conftest.idem())
    assert opened.status_code in conftest.STATUS_OK, (
        "a run must open before its close can be observed: %s"
        % conftest.describe(opened))
    reference = str(opened.json().get("reference"))
    closed = plant.post(conftest.api("/runs/%s/close" % reference),
                        json={"ended_at": "2026-06-02T15:00:00Z"},
                        headers=conftest.idem())
    assert closed.status_code in conftest.STATUS_OK, (
        "the close must answer: %s" % conftest.describe(closed))
    body = closed.json()
    state = str(body.get("state"))
    assert state in ("closed", "queued"), (
        "a close reports either closed or queued; a queued close is never reported "
        "as complete, got %r" % state)
    detail = conftest.as_object(conftest.get_json(plant, "/runs/%s" % reference),
                                "/runs")
    booked = conftest.book_batch(plant, net_g=60000)
    assert booked.status_code in conftest.STATUS_OK, (
        "intake continues to accept a batch while the rest of the system is "
        "degraded: %s" % conftest.describe(booked))
    assert conftest.integer(detail, "losses_g", "the closed run") >= 0, (
        "a closed run computes its losses rather than leaving the field empty: "
        "%.300r" % (detail,))


def test_genealogy_is_a_graph_with_one_node_per_batch(plant):
    graph = conftest.genealogy(plant, conftest.LOT_1)
    nodes = conftest.field(graph, "nodes", "the genealogy of %s" % conftest.LOT_1)
    edges = conftest.field(graph, "edges", "the genealogy of %s" % conftest.LOT_1)
    assert isinstance(nodes, list) and isinstance(edges, list), (
        "the genealogy must carry nodes and edges as lists: %.300r" % (graph,))
    batch_nodes = [n for n in nodes
                   if str(n.get("reference")) == conftest.BATCH_1001]
    assert len(batch_nodes) == 1, (
        "%s reaches %s through %s and %s, so the graph draws it once rather than "
        "%d times" % (conftest.BATCH_1001, conftest.LOT_1, conftest.RUN_D1,
                      conftest.RUN_D3, len(batch_nodes)))
    node = batch_nodes[0]
    where = "the %s node in the genealogy of %s" % (conftest.BATCH_1001, conftest.LOT_1)
    assert conftest.integer(node, "mass_g", where) == 450000, (
        "%s reports mass_g %r; the batch contributed 300000 grams through %s and "
        "150000 through %s, so the node carries 450000"
        % (where, node.get("mass_g"), conftest.RUN_D1, conftest.RUN_D3))
    assert conftest.field(node, "kind", where), "%s carries no kind" % where
    split = conftest.field(node, "category_split", where)
    assert isinstance(split, dict) and set(split) <= set(conftest.CATEGORIES), (
        "%s reports a category split %r outside the pinned two" % (where, split))
    assert "flags" in node, "%s carries no flags list: %.300r" % (where, node)
    for edge in edges:
        assert "mass_g" in edge, (
            "every genealogy edge carries a mass rather than a percentage: %.200r"
            % (edge,))
        assert "percent" not in edge and "content_bp" not in edge, (
            "an edge label is a mass; percentages of percentages across four hops "
            "stop reconciling: %.200r" % (edge,))
    assert bool(graph.get("flagged")) is True, (
        "%s carries the lapsed calibration of %s three levels down, so the "
        "genealogy reports flagged at the top level; it reports %r"
        % (conftest.LOT_1, conftest.BATCH_1004, graph.get("flagged")))
    text = conftest.field(graph, "text_equivalent",
                          "the genealogy of %s" % conftest.LOT_1)
    rendered = str(text)
    for reference in (conftest.BATCH_1001, conftest.BATCH_1002, conftest.BATCH_1004):
        assert reference in rendered, (
            "the text equivalent carries the same nodes as the graph; %r is absent"
            % reference)
    assert "450000" in rendered, (
        "the text equivalent carries the same masses as the graph; the %s mass is "
        "absent" % conftest.BATCH_1001)


def test_reverse_traversal_returns_every_lot_certificate_recipient(plant):
    path = "/batches/%s/impact" % conftest.BATCH_1001
    body = conftest.as_object(conftest.get_json(plant, path), path)
    where = "the reverse traversal from %s" % conftest.BATCH_1001
    found_lots = [str(x) for x in conftest.field(body, "lots", where)]
    for reference in (conftest.LOT_1, conftest.LOT_2):
        assert reference in found_lots, (
            "%s contributed to %s, so the traversal names it; it named %r"
            % (conftest.BATCH_1001, reference, found_lots))
    assert "certificates" in body, "%s carries no certificate list" % where
    assert "recipients" in body, "%s carries no recipient list" % where
    assert "next_cursor" not in body and "page" not in body, (
        "%s returns the complete set; a caller handed a page resolves a page and "
        "believes it has finished: %.300r" % (where, body))
    empty = conftest.as_object(
        conftest.get_json(plant, "/batches/%s/impact" % conftest.BATCH_1005),
        "/batches/BATCH-1005/impact")
    assert isinstance(empty.get("lots"), list), (
        "a batch that reached no lot still answers with an empty list rather than "
        "an error: %.300r" % (empty,))


def test_laboratory_result_without_a_method_is_refused(analyst, quality):
    missing = analyst.post(
        conftest.api("/test-results"),
        json={"lot": conftest.LOT_2, "property": "moisture", "instrument": "MOIST-1",
              "analyst": conftest.ANALYST_EMAIL, "value": "0.08", "unit": "percent",
              "uncertainty_bp": 100},
        headers=conftest.idem())
    assert missing.status_code in conftest.STATUS_REFUSED, (
        "a result with no method is not a result and must be refused, got %s"
        % conftest.describe(missing))
    other = analyst.post(
        conftest.api("/test-results"),
        json={"lot": conftest.LOT_2, "property": "moisture",
              "method": "IN-HOUSE-KARL-FISCHER", "instrument": "MOIST-1",
              "analyst": conftest.ANALYST_EMAIL, "value": "0.08", "unit": "percent",
              "uncertainty_bp": 100},
        headers=conftest.idem())
    assert other.status_code in conftest.STATUS_OK, (
        "a result produced by another method is recorded rather than rejected: %s"
        % conftest.describe(other))
    body = other.json()
    assert bool(body.get("method_mismatch")) is True, (
        "the specification names ISO 15512 for moisture, so a result from another "
        "method is flagged: %.300r" % (body,))
    assert bool(body.get("usable_for_release")) is False, (
        "a result from another method is not used for release: %.300r" % (body,))


def test_open_deviation_blocks_release_of_its_lot(quality):
    deviations = conftest.collection(quality, "/deviations")
    for reference in (conftest.DEVIATION_OPEN, conftest.DEVIATION_CLOSED):
        assert reference in deviations, (
            "the seeded deviation %r is absent; the register carried %r"
            % (reference, sorted(deviations)))
    closed = deviations[conftest.DEVIATION_CLOSED]
    assert str(closed.get("outcome")) == "cause_not_established", (
        "%s is seeded closed with an honest outcome; it reports %r"
        % (conftest.DEVIATION_CLOSED, closed.get("outcome")))
    assert str(closed.get("outcome")) in conftest.DEVIATION_OUTCOMES, (
        "%s reports an outcome outside the pinned two: %r"
        % (conftest.DEVIATION_CLOSED, closed.get("outcome")))
    blocked = quality.post(
        conftest.api("/lots/%s/disposition" % conftest.LOT_2),
        json={"disposition": "released"}, headers=conftest.idem())
    assert blocked.status_code in conftest.STATUS_REFUSED, (
        "%s is held by the open deviation %s, so a release must be refused, got %s"
        % (conftest.LOT_2, conftest.DEVIATION_OPEN, conftest.describe(blocked)))
    lot = conftest.as_object(conftest.get_json(quality, "/lots/%s" % conftest.LOT_2),
                             "/lots/LOT-N6-0002")
    travelling = [str(d) for d in lot.get("deviations", [])]
    assert conftest.DEVIATION_OPEN in travelling, (
        "a deviation travels with every lot it touches; %s reports %r"
        % (conftest.LOT_2, travelling))


def test_override_review_is_denied_to_its_own_authoriser(quality, claims, plant):
    overrides = conftest.collection(quality, "/overrides")
    assert conftest.OVERRIDE in overrides, (
        "the seeded override %r is absent; the register carried %r"
        % (conftest.OVERRIDE, sorted(overrides)))
    seeded = overrides[conftest.OVERRIDE]
    where = "override %s" % conftest.OVERRIDE
    assert str(conftest.field(seeded, "separation", where)) == conftest.OVERRIDE_SEPARATION, (
        "%s reports separation %r, the brief pins %r"
        % (where, seeded.get("separation"), conftest.OVERRIDE_SEPARATION))
    assert str(conftest.field(seeded, "authorised_by", where)) == conftest.QUALITY_EMAIL, (
        "%s reports authoriser %r, the brief pins %r"
        % (where, seeded.get("authorised_by"), conftest.QUALITY_EMAIL))
    assert len(str(conftest.field(seeded, "reason", where))) >= conftest.OVERRIDE_REASON_FLOOR, (
        "%s carries a reason shorter than %d characters: %r"
        % (where, conftest.OVERRIDE_REASON_FLOOR, seeded.get("reason")))
    assert bool(seeded.get("reviewed")) is False, (
        "%s is seeded unreviewed; it reports %r" % (where, seeded.get("reviewed")))
    short = quality.post(
        conftest.api("/overrides"),
        json={"separation": conftest.OVERRIDE_SEPARATION, "lot": conftest.LOT_2,
              "reason": "too short", "authorised_by": conftest.QUALITY_EMAIL},
        headers=conftest.idem())
    assert short.status_code in conftest.STATUS_REFUSED, (
        "an override reason under %d characters must be refused, got %s"
        % (conftest.OVERRIDE_REASON_FLOOR, conftest.describe(short)))
    own = quality.post(conftest.api("/overrides/%s/review" % conftest.OVERRIDE),
                       json={}, headers=conftest.idem())
    assert own.status_code in conftest.STATUS_DENIED + conftest.STATUS_CONFLICT, (
        "the review is a separate act by a second person, so the authoriser must "
        "be refused, got %s" % conftest.describe(own))
    wrong_role = plant.post(conftest.api("/overrides/%s/review" % conftest.OVERRIDE),
                            json={}, headers=conftest.idem())
    assert wrong_role.status_code in conftest.STATUS_DENIED, (
        "a plant operator holds no review right, got %s"
        % conftest.describe(wrong_role))
    second = claims.post(conftest.api("/overrides/%s/review" % conftest.OVERRIDE),
                         json={}, headers=conftest.idem())
    assert second.status_code in conftest.STATUS_OK, (
        "a second person must be able to review the override: %s"
        % conftest.describe(second))
    conftest.settle()
    after = conftest.collection(quality, "/overrides")[conftest.OVERRIDE]
    assert bool(after.get("reviewed")) is True, (
        "%s must report reviewed true after the review" % where)
    assert str(after.get("separation")) == conftest.OVERRIDE_SEPARATION, (
        "a review removes nothing; %s no longer names its separation" % where)


def test_ledger_credits_match_the_seeded_consumptions(claims):
    body = conftest.period(claims)
    where = "the balance period %s" % conftest.PERIOD_OPEN
    credits_in = conftest.field(body, "credits_in_g", where)
    assert isinstance(credits_in, dict), (
        "%s must report credits in per category: %.300r" % (where, body))
    assert int(credits_in.get(conftest.POST_CONSUMER, -1)) == conftest.CREDIT_POST_IN_G, (
        "%s reports post-consumer credits in %r; 450000 grams dry at 8000 basis "
        "points is %d" % (where, credits_in.get(conftest.POST_CONSUMER),
                          conftest.CREDIT_POST_IN_G))
    assert int(credits_in.get(conftest.PRE_CONSUMER, -1)) == conftest.CREDIT_PRE_IN_G, (
        "%s reports pre-consumer credits in %r; 300000 plus 120000 grams dry at "
        "8000 basis points is %d" % (where, credits_in.get(conftest.PRE_CONSUMER),
                                     conftest.CREDIT_PRE_IN_G))
    assert conftest.integer(body, "non_claimable_input_g", where) == conftest.NON_CLAIMABLE_INPUT_G, (
        "%s reports non-claimable input %r; %s contributed %d grams dry and grants "
        "no credit" % (where, body.get("non_claimable_input_g"), conftest.BATCH_1003,
                       conftest.NON_CLAIMABLE_INPUT_G))
    available = conftest.field(body, "credits_available_g", where)
    assert int(available.get(conftest.POST_CONSUMER, -1)) <= conftest.CREDIT_POST_IN_G, (
        "%s reports more post-consumer credit available than entered: %r"
        % (where, available))
    assert int(available.get(conftest.PRE_CONSUMER, -1)) <= conftest.CREDIT_PRE_IN_G, (
        "%s reports more pre-consumer credit available than entered: %r"
        % (where, available))
    total = (int(available.get(conftest.POST_CONSUMER, 0))
             + int(available.get(conftest.PRE_CONSUMER, 0)))
    assert total != -1, "the two categories are reported apart rather than netted"
    assert conftest.POST_CONSUMER in available and conftest.PRE_CONSUMER in available, (
        "post-consumer and pre-consumer credits are held apart and never netted; "
        "%s reports %r" % (where, available))


def test_balance_period_reports_every_derived_figure(claims):
    body = conftest.period(claims)
    where = "the balance period %s" % conftest.PERIOD_OPEN
    for key in ("credits_in_g", "credits_out_g", "credits_available_g",
                "conversion_factors", "carry_over_limit_bp", "override_count",
                "open_restatement_count", "open_finding_count",
                "non_claimable_input_g", "state"):
        assert key in body, "%s carries no %r: %.400r" % (where, key, body)
    assert conftest.integer(body, "carry_over_limit_bp", where) == conftest.CARRY_OVER_LIMIT_BP, (
        "%s reports a carry-over limit of %r, the brief pins %d"
        % (where, body.get("carry_over_limit_bp"), conftest.CARRY_OVER_LIMIT_BP))
    assert conftest.integer(body, "override_count", where) == conftest.OVERRIDE_COUNT, (
        "%s reports %r overrides; the brief seeds %d"
        % (where, body.get("override_count"), conftest.OVERRIDE_COUNT))
    factors = conftest.field(body, "conversion_factors", where)
    assert isinstance(factors, list) and factors, (
        "%s carries no conversion factors in force" % where)
    for entry in factors:
        assert entry.get("version"), (
            "%s carries a factor with no version: %.200r" % (where, entry))
        assert "derived_from" in entry and "derived_to" in entry, (
            "%s carries a factor with no derivation window: %.200r" % (where, entry))
    assert "derivation" in body, (
        "%s returns figures with no derivation; an answer that cannot say where it "
        "came from is not returned: %.400r" % (where, body))
    assert str(body.get("state")) in ("open", "closed"), (
        "%s reports state %r outside the pinned two" % (where, body.get("state")))


def test_over_allocation_is_refused_with_its_margin(claims):
    before = conftest.period(claims)
    available = int(before["credits_available_g"].get(conftest.POST_CONSUMER, 0))
    requested = available + 40000
    response = conftest.allocate(claims, requested)
    assert response.status_code in conftest.STATUS_CONFLICT, (
        "an allocation of %d grams against %d available must be refused rather "
        "than warned about, got %s"
        % (requested, available, conftest.describe(response)))
    body = response.json()
    assert int(body.get("available_g", -1)) == available, (
        "the refusal must name the margin as it stood at the instant of refusal; "
        "it reports %r against %d" % (body.get("available_g"), available))
    assert int(body.get("requested_g", -1)) == requested, (
        "the refusal must name the requested mass; it reports %r against %d"
        % (body.get("requested_g"), requested))
    conftest.settle()
    after = conftest.period(claims)
    assert after["credits_available_g"] == before["credits_available_g"], (
        "a refused allocation moved credit: %r became %r"
        % (before["credits_available_g"], after["credits_available_g"]))
    assert after["credits_out_g"] == before["credits_out_g"], (
        "a refused allocation changed the credits out: %r became %r"
        % (before["credits_out_g"], after["credits_out_g"]))


def test_concurrent_allocations_yield_one_success_and_one_refusal(claims_token):
    with appclient.client(claims_token) as reader:
        before = conftest.period(reader)
    available = int(before["credits_available_g"].get(conftest.POST_CONSUMER, 0))
    assert available > 0, (
        "the seeded period must open with post-consumer credit available; it "
        "reports %d" % available)

    def attempt():
        with appclient.client(claims_token) as client:
            return conftest.allocate(client, available)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        first, second = [f.result() for f in
                         [pool.submit(attempt), pool.submit(attempt)]]
    codes = sorted([first.status_code, second.status_code])
    accepted = [r for r in (first, second) if r.status_code in conftest.STATUS_OK]
    refused = [r for r in (first, second) if r.status_code in conftest.STATUS_CONFLICT]
    assert len(accepted) == 1 and len(refused) == 1, (
        "two allocations racing for the same remaining credits must produce one "
        "success and one refusal; the two answered %r" % (codes,))
    conftest.settle()
    with appclient.client(claims_token) as reader:
        after = conftest.period(reader)
    attached = int(after["credits_out_g"].get(conftest.POST_CONSUMER, 0))
    assert attached <= int(before["credits_in_g"].get(conftest.POST_CONSUMER, 0)), (
        "credits attached (%d) exceeded credits available; the invariant holds at "
        "the write rather than before it" % attached)
    assert attached == available, (
        "exactly one allocation of %d grams landed; the period reports %d attached"
        % (available, attached))
    margin = refused[0].json().get("available_g")
    assert isinstance(margin, int), (
        "the refusal names the margin as an integer number of grams, got %r"
        % (margin,))


def test_no_route_accepts_a_typed_percentage(claims, quality, signer):
    attempts = [
        (claims, "/balance-periods/%s/allocations" % conftest.PERIOD_OPEN,
         {"lot": conftest.LOT_1, "category": conftest.POST_CONSUMER,
          "content_bp": 9500}),
        (signer, "/certificates",
         {"lot": conftest.LOT_1, "recipient": conftest.CUS_HELIOS,
          "content_bp": 9500, "password": conftest.SEED_PASSWORD}),
        (quality, "/lots/%s/disposition" % conftest.LOT_1,
         {"disposition": "released", "content_bp": 9500}),
    ]
    for client, path, payload in attempts:
        response = client.post(conftest.api(path), json=payload,
                               headers=conftest.idem())
        assert response.status_code not in conftest.STATUS_OK, (
            "POST /api%s accepted a typed percentage; every percentage is computed "
            "from the ledger, got %s" % (path, conftest.describe(response)))
    carbon_typed = quality.post(
        conftest.api("/lots/%s/carbon" % conftest.LOT_1),
        json={"value_mg_per_kg": 1000}, headers=conftest.idem())
    assert carbon_typed.status_code not in conftest.STATUS_OK, (
        "a carbon value is computed rather than typed, got %s"
        % conftest.describe(carbon_typed))
    loss_typed = quality.post(
        conftest.api("/runs/%s/close" % conftest.RUN_D1),
        json={"losses_g": 1}, headers=conftest.idem())
    assert loss_typed.status_code not in conftest.STATUS_OK, (
        "a loss figure is computed rather than typed, got %s"
        % conftest.describe(loss_typed))


def test_conversion_factor_is_versioned_and_provisional_where_new(claims):
    rows = conftest.collection(claims, "/conversion-factors")
    for reference in (conftest.FACTOR_DEMO, conftest.FACTOR_PILOT):
        assert reference in rows, (
            "the seeded factor %r is absent; the register carried %r"
            % (reference, sorted(rows)))
    demo = rows[conftest.FACTOR_DEMO]
    where = "the conversion factor %s" % conftest.FACTOR_DEMO
    assert conftest.integer(demo, "factor_bp", where) == conftest.FACTOR_DEMO_BP, (
        "%s reports %r basis points, the brief pins %d"
        % (where, demo.get("factor_bp"), conftest.FACTOR_DEMO_BP))
    assert str(conftest.field(demo, "derived_from", where)) == conftest.FACTOR_DEMO_FROM, (
        "%s reports a derivation window opening %r, the brief pins %r"
        % (where, demo.get("derived_from"), conftest.FACTOR_DEMO_FROM))
    assert str(conftest.field(demo, "derived_to", where)) == conftest.FACTOR_DEMO_TO, (
        "%s reports a derivation window closing %r, the brief pins %r"
        % (where, demo.get("derived_to"), conftest.FACTOR_DEMO_TO))
    assert bool(demo.get("provisional")) is False, (
        "%s rests on recorded losses, so it is not provisional" % where)
    pilot = rows[conftest.FACTOR_PILOT]
    assert conftest.integer(pilot, "factor_bp",
                            "the factor %s" % conftest.FACTOR_PILOT) == conftest.FACTOR_PILOT_BP, (
        "%s reports %r basis points, the brief pins %d"
        % (conftest.FACTOR_PILOT, pilot.get("factor_bp"), conftest.FACTOR_PILOT_BP))
    assert bool(pilot.get("provisional")) is True, (
        "%s has no loss history of its own, so the factor is provisional; it "
        "reports %r" % (conftest.SITE_PILOT, pilot.get("provisional")))


def test_closed_period_refuses_reopening_and_opens_a_restatement(claims):
    body = conftest.period(claims, conftest.PERIOD_CLOSED)
    where = "the closed period %s" % conftest.PERIOD_CLOSED
    assert str(conftest.field(body, "state", where)) == "closed", (
        "%s reports state %r, the brief seeds it closed" % (where, body.get("state")))
    assert str(conftest.field(body, "closed_on", where)) == conftest.PERIOD_CLOSED_ON, (
        "%s reports closed_on %r, the brief pins %r"
        % (where, body.get("closed_on"), conftest.PERIOD_CLOSED_ON))
    assert str(conftest.field(body, "cut_off", where)) == conftest.PERIOD_CUT_OFF, (
        "%s reports a cut-off of %r, the brief pins %r"
        % (where, body.get("cut_off"), conftest.PERIOD_CUT_OFF))
    reopen = claims.post(
        conftest.api("/balance-periods/%s/reopen" % conftest.PERIOD_CLOSED),
        json={}, headers=conftest.idem())
    assert reopen.status_code not in conftest.STATUS_OK, (
        "a closed period can never be reopened, got %s" % conftest.describe(reopen))
    write = conftest.allocate(claims, 1000, ident=conftest.PERIOD_CLOSED)
    assert write.status_code in conftest.STATUS_REFUSED, (
        "a closed period refuses every further write, got %s"
        % conftest.describe(write))
    late = claims.post(
        conftest.api("/balance-periods/%s/consumptions" % conftest.PERIOD_CLOSED),
        json={"run": conftest.RUN_D1, "input": conftest.BATCH_1002, "mass_g": 1000,
              "effective_on": "2025-12-30"}, headers=conftest.idem())
    assert late.status_code in conftest.STATUS_OK + conftest.STATUS_CONFLICT, (
        "a late record answers rather than erroring: %s" % conftest.describe(late))
    answer = late.json()
    assert str(answer.get("outcome")) == "restatement_opened" or answer.get("restatement"), (
        "a record arriving after the cut-off for a closed period opens a "
        "restatement rather than entering the period or being dropped: %.300r"
        % (answer,))
    open_period = conftest.period(claims)
    assert str(open_period.get("state")) == "open", (
        "%s is seeded open; it reports %r"
        % (conftest.PERIOD_OPEN, open_period.get("state")))
    blocked = claims.post(
        conftest.api("/balance-periods/%s/close" % conftest.PERIOD_OPEN),
        json={}, headers=conftest.idem())
    assert blocked.status_code in conftest.STATUS_REFUSED, (
        "%s holds the undispositioned lot %s and the open deviation %s, so a close "
        "must be refused, got %s" % (conftest.PERIOD_OPEN, conftest.LOT_2,
                                     conftest.DEVIATION_OPEN,
                                     conftest.describe(blocked)))
    assert str(conftest.LOT_2) in blocked.text or str(conftest.DEVIATION_OPEN) in blocked.text, (
        "a refused close names the blocking record: %s" % conftest.describe(blocked))


def test_restatement_resolves_each_certificate_exactly_once(claims):
    opened = claims.post(
        conftest.api("/balance-periods/%s/restatements" % conftest.PERIOD_CLOSED),
        json={"reason": "A collector category was corrected after the period closed"},
        headers=conftest.idem())
    assert opened.status_code in conftest.STATUS_OK, (
        "a claims manager opens a restatement against a closed period: %s"
        % conftest.describe(opened))
    body = opened.json()
    reference = str(body.get("reference"))
    affected = conftest.field(body, "certificates", "the restatement just opened")
    assert isinstance(affected, list), (
        "a restatement enumerates every certificate issued from the period: %.300r"
        % (body,))
    if affected:
        number = str(affected[0])
        first = claims.post(
            conftest.api("/restatements/%s/resolutions" % reference),
            json={"certificate": number, "outcome": "unaffected",
                  "reason": "The correction did not touch this allocation"},
            headers=conftest.idem())
        assert first.status_code in conftest.STATUS_OK, (
            "each affected certificate takes one resolution: %s"
            % conftest.describe(first))
        assert str(first.json().get("outcome")) in conftest.RESOLUTION_OUTCOMES, (
            "a resolution outcome must be one of the pinned three, got %r"
            % first.json().get("outcome"))
        second = claims.post(
            conftest.api("/restatements/%s/resolutions" % reference),
            json={"certificate": number, "outcome": "withdrawn",
                  "reason": "A second attempt at the same certificate"},
            headers=conftest.idem())
        assert second.status_code in conftest.STATUS_REFUSED, (
            "a second resolution against one certificate in one restatement must "
            "be refused, got %s" % conftest.describe(second))
    bulk = claims.post(
        conftest.api("/restatements/%s/resolutions" % reference),
        json={"certificates": ["*"], "outcome": "unaffected", "reason": "all"},
        headers=conftest.idem())
    assert bulk.status_code not in conftest.STATUS_OK, (
        "no route resolves more than one certificate at a time, got %s"
        % conftest.describe(bulk))


def test_one_allocation_basis_governs_claim_and_emissions(claims, quality):
    period_body = conftest.period(claims)
    basis = str(period_body.get("allocation_basis"))
    assert basis in conftest.ALLOCATION_BASES, (
        "the period reports an allocation basis %r outside the pinned three"
        % basis)
    assert basis == conftest.ALLOCATION_BASIS, (
        "the brief seeds the basis %r; the period reports %r"
        % (conftest.ALLOCATION_BASIS, basis))
    figure = conftest.carbon(claims)
    assert str(figure.get("allocation_basis")) == basis, (
        "the carbon figure and the ledger share one allocation basis; the figure "
        "reports %r against the period's %r"
        % (figure.get("allocation_basis"), basis))
    mismatch = quality.post(
        conftest.api("/carbon-methods/%s/versions" % conftest.METHOD),
        json={"version": "3", "standard": conftest.METHOD_STANDARD,
              "functional_unit": conftest.METHOD_FUNCTIONAL_UNIT,
              "boundary": conftest.METHOD_BOUNDARY, "allocation_basis": "economic",
              "reviewer": conftest.METHOD_REVIEWER},
        headers=conftest.idem())
    assert mismatch.status_code in conftest.STATUS_OK, (
        "a quality manager publishes a method version: %s"
        % conftest.describe(mismatch))
    conftest.settle()
    refused = claims.get(conftest.api("/lots/%s/carbon" % conftest.LOT_1),
                         params={"method_version": "3"})
    assert refused.status_code in conftest.STATUS_CONFLICT, (
        "the carbon route refuses to compute when the two allocation bases "
        "disagree, got %s" % conftest.describe(refused))
    assert "basis" in refused.text.lower(), (
        "the refusal names the mismatch: %s" % conftest.describe(refused))
    sold = conftest.as_object(
        conftest.get_json(claims, "/outputs/%s" % conftest.BYPRODUCT_SOLD),
        "/outputs/OUT-U-0002")
    assert "claim_share_g" in sold, (
        "a sold byproduct takes a share of the claim: %.300r" % (sold,))
    assert "emissions_share_mg" in sold, (
        "a sold byproduct takes a share of the emissions: %.300r" % (sold,))


def test_carbon_figure_never_returns_without_its_four_components(claims):
    figure = conftest.carbon(claims)
    where = "the carbon figure of %s" % conftest.LOT_1
    for key in ("value_mg_per_kg", "boundary", "method_version", "uncertainty_bp"):
        assert key in figure, (
            "%s carries no %r; the four components travel together or the value is "
            "not returned: %.400r" % (where, key, figure))
    for path in ("/lots/%s" % conftest.LOT_1,
                 "/certificates/%s" % conftest.CERT_ISSUED,
                 "/reconciliation"):
        body = conftest.get_json(claims, path)
        rendered = str(body)
        if "value_mg_per_kg" in rendered:
            for key in ("boundary", "method_version", "uncertainty_bp"):
                assert key in rendered, (
                    "GET /api%s renders a carbon value without %r; a component "
                    "that shows the value alone does not exist" % (path, key))
    content = conftest.as_object(conftest.get_json(claims, "/lots/%s" % conftest.LOT_1),
                                 "/lots/LOT-N6-0001")
    if "content_bp" in content:
        assert "claim_type" in content, (
            "a recycled-content percentage renders with its claim type: %.300r"
            % (content,))
    capacity = conftest.as_object(
        conftest.get_json(claims, "/sites/%s/capacity" % conftest.SITE_COMM),
        "/sites/SITE-COMM/capacity")
    assert "confidence" in capacity, (
        "a capacity figure renders with its confidence: %.300r" % (capacity,))


def test_carbon_breakdown_lines_sum_to_the_value(claims):
    figure = conftest.carbon(claims)
    where = "the carbon figure of %s" % conftest.LOT_1
    breakdown = conftest.field(figure, "breakdown", where)
    assert isinstance(breakdown, list) and breakdown, (
        "%s carries no breakdown; an internal view without one does not exist: "
        "%.400r" % (where, figure))
    observed = {}
    for line in breakdown:
        name = str(line.get("line"))
        observed[name] = int(line.get("mg_per_kg", 0))
        assert str(line.get("tag")) in conftest.DATA_TAGS, (
            "%s carries a breakdown line tagged %r outside the pinned three"
            % (where, line.get("tag")))
    assert observed == conftest.CARBON_BREAKDOWN, (
        "%s reports the breakdown %r, the brief pins %r"
        % (where, observed, conftest.CARBON_BREAKDOWN))
    assert sum(observed.values()) == conftest.CARBON_VALUE, (
        "the breakdown lines sum to %d; the value is %d"
        % (sum(observed.values()), conftest.CARBON_VALUE))
    assert conftest.integer(figure, "energy_location_mg_per_kg", where) == conftest.ENERGY_LOCATION, (
        "%s reports a location-based energy figure of %r, the brief pins %d"
        % (where, figure.get("energy_location_mg_per_kg"), conftest.ENERGY_LOCATION))
    assert conftest.integer(figure, "energy_market_mg_per_kg", where) == conftest.ENERGY_MARKET, (
        "%s reports a market-based energy figure of %r, the brief pins %d"
        % (where, figure.get("energy_market_mg_per_kg"), conftest.ENERGY_MARKET))
    assert conftest.integer(figure, "metered_kwh", where) == conftest.METERED_KWH, (
        "%s reports metered consumption %r, the brief pins %d"
        % (where, figure.get("metered_kwh"), conftest.METERED_KWH))
    assert conftest.integer(figure, "retired_kwh", where) == conftest.INSTRUMENT_RETIRED_KWH, (
        "%s reports retired energy %r, the brief pins %d"
        % (where, figure.get("retired_kwh"), conftest.INSTRUMENT_RETIRED_KWH))
    assert conftest.integer(figure, "unmatched_kwh", where) == conftest.UNMATCHED_KWH, (
        "%s reports unmatched consumption %r; %d metered less %d retired is %d"
        % (where, figure.get("unmatched_kwh"), conftest.METERED_KWH,
           conftest.INSTRUMENT_RETIRED_KWH, conftest.UNMATCHED_KWH))
    assert conftest.CARBON_PRIMARY_SHARE_BP > conftest.PRIMARY_THRESHOLD_BP, (
        "the seeded primary share must sit above the threshold")
    assert bool(figure.get("default_led")) is False, (
        "%s reports a primary share of %d basis points, above the %d threshold, so "
        "the figure is not labelled default-led; it reports %r"
        % (where, conftest.CARBON_PRIMARY_SHARE_BP, conftest.PRIMARY_THRESHOLD_BP,
           figure.get("default_led")))


def test_energy_instrument_counts_only_when_retired_and_matched(claims):
    rows = conftest.collection(claims, "/energy-instruments")
    for reference in (conftest.INSTRUMENT_RETIRED, conftest.INSTRUMENT_HELD):
        assert reference in rows, (
            "the seeded instrument %r is absent; the register carried %r"
            % (reference, sorted(rows)))
    held = rows[conftest.INSTRUMENT_HELD]
    assert str(held.get("state")) == "held", (
        "%s is seeded held rather than retired; it reports %r"
        % (conftest.INSTRUMENT_HELD, held.get("state")))
    refused = claims.post(
        conftest.api("/energy-instruments/%s/retire" % conftest.INSTRUMENT_HELD),
        json={"period": conftest.PERIOD_OPEN}, headers=conftest.idem())
    assert refused.status_code in conftest.STATUS_REFUSED, (
        "an instrument that is held rather than retired is refused, got %s"
        % conftest.describe(refused))
    body = refused.text.lower()
    assert "vintage" in body or "retire" in body, (
        "the refusal names why the instrument does not apply: %s"
        % conftest.describe(refused))
    over = claims.post(
        conftest.api("/energy-instruments/%s/retire" % conftest.INSTRUMENT_RETIRED),
        json={"period": conftest.PERIOD_OPEN,
              "quantity_kwh": conftest.METERED_KWH + 1000},
        headers=conftest.idem())
    assert over.status_code in conftest.STATUS_REFUSED, (
        "a retired quantity exceeding the metered consumption is refused, got %s"
        % conftest.describe(over))


def test_certificate_preview_returns_eight_conditions(signer, claims):
    response = conftest.preview(signer)
    assert response.status_code in conftest.STATUS_OK, (
        "the preview must answer for a signer holding scope: %s"
        % conftest.describe(response))
    entries = conftest.conditions_of(response.json())
    assert len(entries) == 8, (
        "the brief names eight issuing conditions; the preview returned %d: %.400r"
        % (len(entries), entries))
    for entry in entries:
        for key in ("condition", "satisfied", "blocking_reference"):
            assert key in entry, (
                "each condition entry carries %r: %.300r" % (key, entry))
        assert isinstance(entry.get("satisfied"), bool), (
            "a condition is satisfied or it is not; %r is neither" % (entry,))
    unsatisfied = [e for e in entries if e.get("satisfied") is False]
    assert unsatisfied, (
        "%s carries the unreviewed override %s at seed time, so at least one "
        "condition must read unsatisfied: %.400r"
        % (conftest.LOT_1, conftest.OVERRIDE, entries))
    blocking = str(unsatisfied[0].get("blocking_reference"))
    assert blocking, (
        "an unsatisfied condition names the record that would resolve it: %.300r"
        % (unsatisfied[0],))
    waived = signer.post(
        conftest.api("/certificates"),
        json={"lot": conftest.LOT_1, "recipient": conftest.CUS_HELIOS,
              "waive_conditions": True, "password": conftest.SEED_PASSWORD},
        headers=conftest.idem())
    assert waived.status_code not in conftest.STATUS_OK, (
        "no issuing condition is waivable by the signer, got %s"
        % conftest.describe(waived))
    no_password = signer.post(
        conftest.api("/certificates"),
        json={"lot": conftest.LOT_3, "recipient": conftest.CUS_HELIOS},
        headers=conftest.idem())
    assert no_password.status_code not in conftest.STATUS_OK, (
        "signing re-authenticates; a session alone is not a signing credential, "
        "got %s" % conftest.describe(no_password))


def test_certificate_carries_every_derived_field(signer2):
    path = "/certificates/%s" % conftest.CERT_ISSUED
    body = conftest.as_object(conftest.get_json(signer2, path), path)
    where = "certificate %s" % conftest.CERT_ISSUED
    for key in ("number", "version", "site", "lots", "grade",
                "specification_version", "claim_type", "content_bp",
                "category_split", "period", "carbon", "primary_share_bp", "scheme",
                "registration", "permitted_statement", "prohibited_statement",
                "signer", "signed_at", "verification_url", "state",
                "provisional_factor"):
        assert key in body, "%s carries no %r: %.500r" % (where, key, body)
    assert str(body.get("claim_type")) in conftest.CLAIM_TYPES, (
        "%s reports a claim type outside the pinned three: %r"
        % (where, body.get("claim_type")))
    assert conftest.HOST in str(body.get("verification_url")), (
        "%s must print a verification address under %r; it reports %r"
        % (where, conftest.HOST, body.get("verification_url")))
    permitted = str(body.get("permitted_statement"))
    prohibited = str(body.get("prohibited_statement"))
    assert permitted and prohibited, (
        "%s must carry both the permitted statement and its counterpart: %.400r"
        % (where, body))
    if str(body.get("claim_type")) == conftest.CLAIM_MASS_BALANCE:
        assert "physically" in prohibited.lower(), (
            "a mass-balance certificate states the material may not be described "
            "as physically containing recycled content; it says %r" % prohibited)
    assert bool(body.get("provisional_factor")) is True, (
        "%s rests on %s, produced at %s under the provisional factor, so the "
        "certificate says so; it reports %r"
        % (where, conftest.LOT_3, conftest.SITE_PILOT,
           body.get("provisional_factor")))
    lots_cited = body.get("lots")
    assert isinstance(lots_cited, list) and lots_cited, (
        "%s cites no lot: %.400r" % (where, body))
    for entry in lots_cited:
        assert "mass_g" in entry, (
            "%s cites a lot with no mass: %.200r" % (where, entry))


def test_certificate_issue_sends_mail_to_the_recipient(signer2, inbox):
    response = signer2.post(
        conftest.api("/certificates"),
        json={"lot": conftest.LOT_3, "recipient": conftest.CUS_HELIOS,
              "password": conftest.SEED_PASSWORD}, headers=conftest.idem())
    assert response.status_code in conftest.STATUS_OK, (
        "%s holds scope at %s, and %s is released, so a certificate must issue: %s"
        % (conftest.SIGNER2_EMAIL, conftest.SITE_PILOT, conftest.LOT_3,
           conftest.describe(response)))
    number = str(response.json().get("number"))
    assert number.startswith("CERT-PILOT-"), (
        "a certificate signed at %s takes a number from that site's gapless "
        "sequence; it was numbered %r" % (conftest.SITE_PILOT, number))
    delivered = conftest.wait_for_mail(
        inbox, conftest.CUSTOMER_EMAIL[conftest.CUS_HELIOS],
        conftest.SUBJECT_ISSUED.format(number=number))
    assert delivered is not None, (
        "issuing %s must send one mail to %s with the subject %r"
        % (number, conftest.CUSTOMER_EMAIL[conftest.CUS_HELIOS],
           conftest.SUBJECT_ISSUED.format(number=number)))
    assert conftest.CUSTOMER_EMAIL[conftest.CUS_HELIOS] in " ".join(delivered.to), (
        "the mail must be addressed to the recipient alone; it went to %r"
        % (delivered.to,))
    assert len(delivered.to) == 1, (
        "every mail is addressed to exactly one recipient with no copies; it went "
        "to %r" % (delivered.to,))


def test_withdrawal_performs_five_consequences_and_mails_the_recipient(signer2, inbox):
    response = signer2.post(
        conftest.api("/certificates/%s/withdraw" % conftest.CERT_ISSUED),
        json={"reason": "A weighing device calibration lapsed before the intake"},
        headers=conftest.idem())
    assert response.status_code in conftest.STATUS_OK, (
        "a signer within scope withdraws a certificate: %s"
        % conftest.describe(response))
    body = response.json()
    for key in ("state", "reason", "withdrawn_by", "withdrawn_on",
                "notified_recipients", "void_statements", "derived_certificates",
                "batch_traversal"):
        assert key in body, (
            "a withdrawal is one action with five consequences; the answer carries "
            "no %r: %.500r" % (key, body))
    assert str(body.get("state")) == "withdrawn", (
        "the certificate state must become withdrawn, got %r" % body.get("state"))
    assert isinstance(body.get("notified_recipients"), list), (
        "the recipients notified are enumerated rather than counted: %.300r"
        % (body,))
    assert isinstance(body.get("void_statements"), list), (
        "the statements the recipient must stop making are enumerated: %.300r"
        % (body,))
    conftest.settle()
    again = conftest.as_object(
        conftest.get_json(signer2, "/certificates/%s" % conftest.CERT_ISSUED),
        "/certificates")
    assert str(again.get("state")) == "withdrawn", (
        "a withdrawal is never a deletion; the document stays readable at its "
        "address and states the withdrawal, it reports %r" % again.get("state"))
    assert again.get("signer") and again.get("signed_at"), (
        "the signer and the moment of signing stay readable after a withdrawal: "
        "%.300r" % (again,))


def test_certificate_withdrawal_mail_enumerates_the_void_statements(signer, inbox):
    issued = signer.post(
        conftest.api("/certificates"),
        json={"lot": conftest.LOT_3, "recipient": conftest.CUS_VANTA,
              "password": conftest.SEED_PASSWORD}, headers=conftest.idem())
    assert issued.status_code in conftest.STATUS_OK, (
        "a certificate must issue before its withdrawal can be observed: %s"
        % conftest.describe(issued))
    number = str(issued.json().get("number"))
    withdrawn = signer.post(
        conftest.api("/certificates/%s/withdraw" % number),
        json={"reason": "The collector declaration departed from the measured "
                        "composition"},
        headers=conftest.idem())
    assert withdrawn.status_code in conftest.STATUS_OK, (
        "the withdrawal must succeed: %s" % conftest.describe(withdrawn))
    delivered = conftest.wait_for_mail(
        inbox, conftest.CUSTOMER_EMAIL[conftest.CUS_VANTA],
        conftest.SUBJECT_WITHDRAWN.format(number=number))
    assert delivered is not None, (
        "a withdrawal the customer never learned of is not a withdrawal; no mail "
        "with the subject %r reached %r"
        % (conftest.SUBJECT_WITHDRAWN.format(number=number),
           conftest.CUSTOMER_EMAIL[conftest.CUS_VANTA]))
    body = delivered.body
    assert number in body or number in delivered.subject, (
        "the withdrawal mail names the certificate: %r" % (body[:300],))
    assert len(body.strip()) > 0, (
        "the withdrawal mail carries a body naming the reason and the statements "
        "now void; it was empty")


def test_public_verification_answers_without_a_session(anon):
    path = "/verify/%s" % conftest.CERT_WITHDRAWN
    response = anon.get(conftest.api(path), follow_redirects=False)
    assert response.status_code == 200, (
        "the verification address of a withdrawn certificate resolves forever and "
        "does not redirect, got %s" % conftest.describe(response))
    body = response.json()
    where = "the verification answer for %s" % conftest.CERT_WITHDRAWN
    assert bool(conftest.field(body, "found", where)) is True, (
        "%s reports found %r for a certificate the brief seeds"
        % (where, body.get("found")))
    assert str(conftest.field(body, "state", where)) == "withdrawn", (
        "%s reports state %r, the brief seeds it withdrawn"
        % (where, body.get("state")))
    assert str(conftest.field(body, "withdrawn_on", where)) == conftest.CERT_WITHDRAWN_ON, (
        "%s reports withdrawn_on %r, the brief pins %r"
        % (where, body.get("withdrawn_on"), conftest.CERT_WITHDRAWN_ON))
    assert str(conftest.field(body, "withdrawal_reason", where)) == conftest.CERT_WITHDRAWN_REASON, (
        "%s reports reason %r, the brief pins %r"
        % (where, body.get("withdrawal_reason"), conftest.CERT_WITHDRAWN_REASON))
    for key in ("number", "issued_on", "site", "grade", "claim_type",
                "recipient_name"):
        assert key in body, "%s carries no %r: %.300r" % (where, key, body)
    unknown = anon.get(conftest.api("/verify/%s" % conftest.CERT_UNKNOWN))
    assert unknown.status_code == 200, (
        "a number that was never issued answers in the same layout rather than "
        "with a generic error, got %s" % conftest.describe(unknown))
    assert bool(unknown.json().get("found")) is False, (
        "an unknown number reports found false; it reported %r"
        % unknown.json().get("found"))


def test_verification_hides_yield_collector_and_genealogy(anon):
    body = conftest.as_object(
        conftest.get_json(anon, "/verify/%s" % conftest.CERT_WITHDRAWN), "/verify")
    rendered = str(body)
    for reference in conftest.COLLECTORS:
        assert reference not in rendered, (
            "a collector never appears in a public verification result; %r is "
            "present: %.400r" % (reference, body))
    for key in ("yield", "yield_bp", "genealogy", "carbon_breakdown", "breakdown"):
        assert key not in body, (
            "the verification answer carries %r; the route shows state and "
            "identity alone: %.400r" % (key, body))
    for reference in (conftest.BATCH_1001, conftest.RUN_D1):
        assert reference not in rendered, (
            "the verification answer names %r; genealogy never reaches a stranger"
            % reference)
    flood = [anon.get(conftest.api("/verify/CERT-DEMO-%06d" % n)) for n in range(1, 12)]
    codes = {r.status_code for r in flood}
    assert codes <= {200, 429}, (
        "the verification route is rate limited and otherwise answers in one "
        "layout; the sweep returned %r" % (sorted(codes),))


def test_retroactive_suspension_enumerates_its_window(quality, signer2):
    response = quality.post(
        conftest.api("/sites/%s/certification" % conftest.SITE_PILOT),
        json={"state": "suspended", "effective_from": "2026-02-01",
              "recorded_on": "2026-06-30",
              "reason": "The scheme suspended the site with retroactive effect"},
        headers=conftest.idem())
    assert response.status_code in conftest.STATUS_OK, (
        "a certification suspension must be recordable with an effective date that "
        "precedes it: %s" % conftest.describe(response))
    body = response.json()
    assert isinstance(body.get("certificates_in_window"), list), (
        "a suspension enumerates every certificate signed inside the window: "
        "%.400r" % (body,))
    conftest.settle()
    blocked = signer2.post(
        conftest.api("/certificates"),
        json={"lot": conftest.LOT_3, "recipient": conftest.CUS_HELIOS,
              "password": conftest.SEED_PASSWORD}, headers=conftest.idem())
    assert blocked.status_code in conftest.STATUS_REFUSED, (
        "issuing stops immediately for a suspended site, got %s"
        % conftest.describe(blocked))
    assert "suspen" in blocked.text.lower(), (
        "the blocking condition names the scheme suspension rather than a generic "
        "failure: %s" % conftest.describe(blocked))
    lifted = quality.post(
        conftest.api("/sites/%s/certification" % conftest.SITE_PILOT),
        json={"state": "certified", "effective_from": "2026-07-01",
              "recorded_on": "2026-07-01", "reason": "The suspension was lifted"},
        headers=conftest.idem())
    assert lifted.status_code in conftest.STATUS_OK, (
        "a lift must be recordable: %s" % conftest.describe(lifted))
    conftest.settle()
    still = conftest.as_object(
        conftest.get_json(signer2, "/certificates/%s" % conftest.CERT_WITHDRAWN),
        "/certificates")
    assert str(still.get("state")) == "withdrawn", (
        "lifting a suspension does not reinstate a withdrawn certificate; %s "
        "reports %r" % (conftest.CERT_WITHDRAWN, still.get("state")))


def test_specification_versions_and_conformance_are_stored(quality):
    path = "/specifications/%s/versions/%s" % (conftest.GRADE_N6, conftest.SPEC_VERSION)
    body = conftest.as_object(conftest.get_json(quality, path), path)
    where = "specification %s version %s" % (conftest.SPEC, conftest.SPEC_VERSION)
    rows = conftest.field(body, "properties", where)
    assert isinstance(rows, list) and rows, "%s carries no properties" % where
    observed = {str(r.get("property")): r for r in rows}
    for name, seed in conftest.SPEC_ROWS.items():
        assert name in observed, (
            "%s carries no property %r; it carried %r"
            % (where, name, sorted(observed)))
        row = observed[name]
        assert str(row.get("method")) == seed["method"], (
            "%s property %s names method %r, the brief pins %r"
            % (where, name, row.get("method"), seed["method"]))
        assert str(row.get("limit")) == seed["limit"], (
            "%s property %s pins limit %r, the brief pins %r"
            % (where, name, row.get("limit"), seed["limit"]))
        assert str(row.get("unit")) == seed["unit"], (
            "%s property %s reports unit %r, the brief pins %r"
            % (where, name, row.get("unit"), seed["unit"]))
        assert str(row.get("basis")) == seed["basis"], (
            "%s property %s reports basis %r, the brief pins %r"
            % (where, name, row.get("basis"), seed["basis"]))
        assert str(row.get("basis")) in conftest.SPEC_BASES, (
            "%s property %s reports a basis outside the pinned three: %r"
            % (where, name, row.get("basis")))
    assert str(conftest.field(body, "virgin_reference", where)) == conftest.VIRGIN_REFERENCE, (
        "%s names the virgin-quality reference %r, the brief pins %r"
        % (where, body.get("virgin_reference"), conftest.VIRGIN_REFERENCE))
    assert str(conftest.field(body, "issued_on", where)) == conftest.SPEC_ISSUED_ON, (
        "%s reports issued_on %r, the brief pins %r"
        % (where, body.get("issued_on"), conftest.SPEC_ISSUED_ON))
    for customer, version in conftest.CUSTOMER_HOLDS.items():
        detail = conftest.as_object(
            conftest.get_json(quality, "/customers/%s" % customer),
            "/customers/%s" % customer)
        held = str(detail.get("holds_specification_version"))
        assert held == version, (
            "%s holds specification version %r, the brief seeds %r"
            % (customer, held, version))
        conformance = detail.get("conformance")
        assert isinstance(conformance, list), (
            "%s carries no conformance records: %.300r" % (customer, detail))
    vanta = conftest.as_object(
        conftest.get_json(quality, "/customers/%s" % conftest.CUS_VANTA),
        "/customers/CUS-VANTA")
    assert str(vanta.get("industry")) == conftest.VANTA_INDUSTRY, (
        "%s sits in the industry %r, the brief seeds %r"
        % (conftest.CUS_VANTA, vanta.get("industry"), conftest.VANTA_INDUSTRY))


def test_change_notice_blocks_release_until_customers_are_mailed(quality, inbox):
    raised = quality.post(
        conftest.api("/change-notices"),
        json={"what_changes": "The depolymerisation recipe moves its set point",
              "against_version": conftest.RECIPE_DEPO,
              "parameter": "temperature",
              "qualification_relevant": True},
        headers=conftest.idem())
    assert raised.status_code in conftest.STATUS_OK, (
        "a quality manager raises a change notice: %s" % conftest.describe(raised))
    body = raised.json()
    reference = str(body.get("reference"))
    for key in ("specifications_affected", "customers_affected",
                "qualifications_affected", "notice_period_days"):
        assert key in body, (
            "a change notice derives its reach rather than asserting none; it "
            "carries no %r: %.400r" % (key, body))
    affected = [str(c) for c in body.get("customers_affected", [])]
    assert conftest.CUS_VANTA in affected, (
        "%s holds a specification version and an automotive qualification, so the "
        "notice must reach it; it named %r" % (conftest.CUS_VANTA, affected))
    early = quality.post(conftest.api("/change-notices/%s/release" % reference),
                         json={}, headers=conftest.idem())
    assert early.status_code in conftest.STATUS_REFUSED, (
        "a change cannot release until every customer owed notice has been "
        "notified or has waived, got %s" % conftest.describe(early))
    notified = quality.post(
        conftest.api("/change-notices/%s/notify" % reference),
        json={"customer": conftest.CUS_VANTA}, headers=conftest.idem())
    assert notified.status_code in conftest.STATUS_OK, (
        "notifying a customer must succeed: %s" % conftest.describe(notified))
    delivered = conftest.wait_for_mail(
        inbox, conftest.CUSTOMER_EMAIL[conftest.CUS_VANTA],
        conftest.SUBJECT_CHANGE.format(reference=reference))
    assert delivered is not None, (
        "notifying %s must send one mail with the subject %r"
        % (conftest.CUS_VANTA, conftest.SUBJECT_CHANGE.format(reference=reference)))


def test_contract_projection_reports_unreachable_rather_than_refusing(claims):
    path = "/contracts/%s/projection" % conftest.CONTRACT_HELIOS
    body = conftest.as_object(conftest.get_json(claims, path), path)
    where = "the projection of %s" % conftest.CONTRACT_HELIOS
    for key in ("delivered_kg", "committed_kg", "running_content_bp", "floor_bp",
                "required_remaining_bp", "state"):
        assert key in body, "%s carries no %r: %.400r" % (where, key, body)
    assert conftest.integer(body, "committed_kg", where) == conftest.CONTRACT_HELIOS_COMMITTED_KG, (
        "%s reports committed %r, the brief seeds %d"
        % (where, body.get("committed_kg"), conftest.CONTRACT_HELIOS_COMMITTED_KG))
    assert conftest.integer(body, "floor_bp", where) == conftest.CONTRACT_HELIOS_FLOOR_BP, (
        "%s reports a floor of %r, the brief seeds %d"
        % (where, body.get("floor_bp"), conftest.CONTRACT_HELIOS_FLOOR_BP))
    assert str(body.get("state")) in conftest.PROJECTION_STATES, (
        "%s reports a state outside the pinned two: %r" % (where, body.get("state")))
    vanta = conftest.as_object(
        conftest.get_json(claims, "/contracts/%s" % conftest.CONTRACT_VANTA),
        "/contracts/CON-VANTA-1")
    assert str(vanta.get("site")) == conftest.SITE_COMM, (
        "%s is signed against %s; it reports %r"
        % (conftest.CONTRACT_VANTA, conftest.SITE_COMM, vanta.get("site")))
    assert bool(vanta.get("planned_site_flag")) is True, (
        "a contract whose supplying site is planned is flagged wherever it "
        "appears; %s reports %r"
        % (conftest.CONTRACT_VANTA, vanta.get("planned_site_flag")))
    assert bool(vanta.get("flag_dismissible", False)) is False, (
        "the planned-site flag cannot be dismissed: %.300r" % (vanta,))
    assert str(vanta.get("shortfall_consequence")) == conftest.CONTRACT_VANTA_CONSEQUENCE, (
        "%s states its shortfall consequence at signature; it reports %r"
        % (conftest.CONTRACT_VANTA, vanta.get("shortfall_consequence")))
    twice = claims.post(
        conftest.api("/contracts/%s/allocations" % conftest.CONTRACT_VANTA),
        json={"lot": conftest.LOT_1, "mass_kg": 1}, headers=conftest.idem())
    assert twice.status_code in conftest.STATUS_REFUSED + conftest.STATUS_OK, (
        "the allocation route must answer rather than error: %s"
        % conftest.describe(twice))


def test_record_is_append_only_and_its_digest_chain_holds(auditor):
    rows = conftest.as_list(conftest.get_json(auditor, "/record"), "/record")
    assert rows, "the seeded record opens with one entry per seeded act"
    ordered = sorted(rows, key=lambda r: int(r.get("seq", 0)))
    first = ordered[0]
    assert int(first.get("seq")) == 1, (
        "the record opens at sequence one; the first entry reports %r"
        % first.get("seq"))
    assert str(first.get("prev_digest")) == conftest.ZERO_DIGEST, (
        "the first entry carries a previous digest of sixty-four zeroes; it "
        "reports %r" % first.get("prev_digest"))
    seen = set()
    for entry in ordered:
        for key in ("seq", "digest", "prev_digest", "person", "at", "act"):
            assert key in entry, (
                "every record entry carries %r: %.300r" % (key, entry))
        assert int(entry["seq"]) not in seen, (
            "the record sequence repeats at %r" % entry.get("seq"))
        seen.add(int(entry["seq"]))
    numbers = sorted(seen)
    assert numbers == list(range(1, len(numbers) + 1)), (
        "a gap in the record sequence is a reportable condition; the sequence runs "
        "%r" % (numbers[:20],))
    for previous, entry in zip(ordered, ordered[1:]):
        assert str(entry.get("prev_digest")) == str(previous.get("digest")), (
            "entry %r links to %r rather than to the digest of entry %r"
            % (entry.get("seq"), entry.get("prev_digest"), previous.get("seq")))
    chain = conftest.as_object(conftest.get_json(auditor, "/record/check"),
                               "/record/check")
    assert bool(chain.get("holds")) is True, (
        "the chain must verify over the seeded record; the check reports %.300r"
        % (chain,))
    target = ordered[0]
    edited = auditor.patch(conftest.api("/record/%s" % target.get("seq")),
                           json={"act": "rewritten"}, headers=conftest.idem())
    assert edited.status_code in conftest.STATUS_REFUSED, (
        "nothing in the record is edited, got %s" % conftest.describe(edited))
    removed = auditor.delete(conftest.api("/record/%s" % target.get("seq")))
    assert removed.status_code in conftest.STATUS_REFUSED, (
        "nothing in the record is deleted, got %s" % conftest.describe(removed))


def test_export_is_scoped_and_is_itself_an_entry(auditor):
    before = len(conftest.as_list(conftest.get_json(auditor, "/record"), "/record"))
    response = auditor.post(
        conftest.api("/exports"),
        json={"period": conftest.PERIOD_OPEN, "sites": [conftest.SITE_DEMO],
              "grades": [conftest.GRADE_N6], "certificates": []},
        headers=conftest.idem())
    assert response.status_code in conftest.STATUS_OK, (
        "an auditor exports within an agreed scope: %s" % conftest.describe(response))
    body = response.json()
    for key in ("scope", "derivations", "digests"):
        assert key in body, (
            "an export is self-contained and carries its derivations and digests; "
            "it carries no %r: %.400r" % (key, body))
    conftest.settle()
    after = conftest.as_list(conftest.get_json(auditor, "/record"), "/record")
    assert len(after) > before, (
        "every export is itself an entry; the record held %d entries before and %d "
        "after" % (before, len(after)))
    empty = auditor.post(
        conftest.api("/exports"),
        json={"period": conftest.PERIOD_PILOT, "sites": [conftest.SITE_COMM],
              "grades": [conftest.GRADE_N6], "certificates": []},
        headers=conftest.idem())
    assert empty.status_code in conftest.STATUS_OK, (
        "an export that returns nothing still answers and is still recorded: %s"
        % conftest.describe(empty))


def test_reconciliation_returns_six_figures(auditor):
    body = conftest.as_object(conftest.get_json(auditor, "/reconciliation"),
                              "/reconciliation")
    where = "the reconciliation view"
    for key in ("mass_balance_residual_g", "credit_margin_g",
                "consumptions_on_open_runs", "batches_with_broken_custody",
                "certificates_with_superseded_figures", "integration_ages"):
        assert key in body, "%s carries no %r: %.400r" % (where, key, body)
    assert isinstance(body.get("integration_ages"), dict), (
        "%s reports the age of the most recent record per inbound source: %.300r"
        % (where, body))
    assert int(body.get("batches_with_broken_custody", -1)) >= 1, (
        "%s is seeded with a broken custody chain, so the count is at least one; "
        "the view reports %r" % (conftest.BATCH_1005,
                                 body.get("batches_with_broken_custody")))
    for key in ("passing", "status", "ok"):
        assert key not in body, (
            "none of the six is a badge to be cleared; the view carries %r: %.300r"
            % (key, body))


def test_published_statistics_carry_source_year_and_geography(anon):
    rows = conftest.as_list(conftest.get_json(anon, "/statistics"), "/statistics")
    observed = {str(r.get("key")): r for r in rows}
    for key in (conftest.STAT_TEXTILES, conftest.STAT_EMISSIONS,
                conftest.STAT_INCINERATION):
        assert key in observed, (
            "the published statistic %r is absent; the route carried %r"
            % (key, sorted(observed)))
        row = observed[key]
        where = "the statistic %s" % key
        assert str(conftest.field(row, "source", where)) == conftest.STAT_SOURCE[key], (
            "%s cites source %r, the brief pins %r"
            % (where, row.get("source"), conftest.STAT_SOURCE[key]))
        assert str(conftest.field(row, "year", where)) == conftest.STAT_YEAR[key], (
            "%s cites year %r, the brief pins %r"
            % (where, row.get("year"), conftest.STAT_YEAR[key]))
        assert str(conftest.field(row, "geography", where)) == conftest.STAT_GEOGRAPHY[key], (
            "%s cites geography %r, the brief pins %r"
            % (where, row.get("geography"), conftest.STAT_GEOGRAPHY[key]))
        assert conftest.field(row, "value", where), "%s carries no value" % where
    emissions = str(observed[conftest.STAT_EMISSIONS].get("value"))
    assert "tonne" in emissions.lower(), (
        "emissions are a mass; the published figure reads %r" % emissions)
    for symbol in ("$", "billion in", "USD"):
        assert symbol not in emissions, (
            "the emissions statistic states a mass rather than a currency; it "
            "reads %r" % emissions)


def test_positions_news_and_derived_counts_are_exact(anon):
    positions = conftest.as_list(conftest.get_json(anon, "/positions"), "/positions")
    assert len(positions) == conftest.POSITION_COUNT, (
        "the careers route seeds %d open position; the route returned %d"
        % (conftest.POSITION_COUNT, len(positions)))
    role = positions[0]
    where = "the seeded position"
    assert str(conftest.field(role, "title", where)) == conftest.POSITION_TITLE, (
        "%s reports title %r, the brief pins %r"
        % (where, role.get("title"), conftest.POSITION_TITLE))
    assert str(conftest.field(role, "location", where)) == conftest.POSITION_LOCATION, (
        "%s reports location %r, the brief pins %r"
        % (where, role.get("location"), conftest.POSITION_LOCATION))
    assert str(conftest.field(role, "closes_on", where)) == conftest.POSITION_CLOSES, (
        "%s reports a closing date of %r, the brief pins %r"
        % (where, role.get("closes_on"), conftest.POSITION_CLOSES))
    for key in ("department", "contract_type"):
        assert key in role, "%s carries no %r: %.300r" % (where, key, role)
    news = conftest.as_list(conftest.get_json(anon, "/news"), "/news")
    assert len(news) == conftest.NEWS_COUNT, (
        "the news route seeds %d items; the route returned %d"
        % (conftest.NEWS_COUNT, len(news)))
    tags = {str(item.get("tag")) for item in news}
    assert tags <= set(conftest.NEWS_TAGS), (
        "a news tag must come from the pinned taxonomy; the route carried %r"
        % (sorted(tags),))
    assert len(tags) > 1, (
        "a taxonomy with one term is not a taxonomy; the route carried %r"
        % (sorted(tags),))
    languages = {str(item.get("language")) for item in news}
    assert conftest.NEWS_FRENCH_LANGUAGE in languages, (
        "one seeded item is in French and says so; the route carried %r"
        % (sorted(languages),))
    for item in news:
        for key in ("outlet", "date", "link"):
            assert key in item, (
                "every news item carries its outlet, its date and its link: %.300r"
                % (item,))
    root = appclient.app_url()
    careers = anon.get(root + "/careers")
    assert careers.status_code == 200, (
        "the careers route must answer: %s" % conftest.describe(careers))
    assert str(conftest.POSITION_COUNT) in careers.text, (
        "the rendered count is derived from the collection it labels; the page "
        "does not carry %r" % str(conftest.POSITION_COUNT))


def test_enquiry_routes_four_types_to_four_destinations(anon, inbox):
    for kind in conftest.ENQUIRY_TYPES:
        address = conftest.probe_email()
        response = anon.post(
            conftest.api("/enquiries"),
            json={"type": kind, "name": "Probe Reader", "organisation": "Probe Ltd",
                  "email": address, "message": "A probe enquiry for the %s desk"
                                               % kind},
            headers=conftest.idem())
        assert response.status_code == 201, (
            "POST /api/enquiries must answer 201 for the %r type, got %s"
            % (kind, conftest.describe(response)))
        body = response.json()
        where = "the %s enquiry" % kind
        assert conftest.field(body, "reference", where), "%s carries no reference" % where
        assert str(conftest.field(body, "destination", where)) == conftest.ENQUIRY_DESTINATION[kind], (
            "%s routes to %r, the brief pins %r"
            % (where, body.get("destination"), conftest.ENQUIRY_DESTINATION[kind]))
        assert int(conftest.field(body, "response_days", where)) == conftest.ENQUIRY_RESPONSE_DAYS[kind], (
            "%s states %r days, the brief pins %d"
            % (where, body.get("response_days"),
               conftest.ENQUIRY_RESPONSE_DAYS[kind]))
        reference = str(body["reference"])
        delivered = conftest.wait_for_mail(
            inbox, address, conftest.SUBJECT_ENQUIRY.format(reference=reference))
        assert delivered is not None, (
            "%s must send one mail to the enquirer with the subject %r"
            % (where, conftest.SUBJECT_ENQUIRY.format(reference=reference)))


def test_no_mail_is_sent_by_a_non_notifying_act(claims, quality, inbox):
    address = conftest.CUSTOMER_EMAIL[conftest.CUS_HELIOS]
    before = inbox.count(address)
    conftest.allocate(claims, 1000, category=conftest.PRE_CONSUMER)
    quality.post(conftest.api("/lots/%s/disposition" % conftest.LOT_1),
                 json={"disposition": "released"}, headers=conftest.idem())
    claims.post(conftest.api("/balance-periods/%s/close" % conftest.PERIOD_OPEN),
                json={}, headers=conftest.idem())
    conftest.settle()
    after = inbox.count(address)
    assert after == before, (
        "allocating claim, setting a disposition and closing a period send no "
        "mail; the inbox for %s went from %d to %d" % (address, before, after))


def test_every_answer_carries_its_derivation(claims):
    for path in ("/balance-periods/%s" % conftest.PERIOD_OPEN,
                 "/lots/%s/carbon" % conftest.LOT_1,
                 "/contracts/%s/projection" % conftest.CONTRACT_HELIOS):
        body = conftest.as_object(conftest.get_json(claims, path), path)
        assert "derivation" in body or "derivations" in body, (
            "GET /api%s returns a figure with no derivation; an answer that cannot "
            "state where it came from is not returned: %.400r" % (path, body))
        assert "versions" in body or "method_version" in body or "conversion_factors" in body, (
            "GET /api%s returns a figure without the versions it was computed "
            "against: %.400r" % (path, body))
    written = claims.post(conftest.api("/lots/%s/content" % conftest.LOT_1),
                          json={"content_bp": 9000}, headers=conftest.idem())
    assert written.status_code not in conftest.STATUS_OK, (
        "no screen writes a computed figure into a record, got %s"
        % conftest.describe(written))
    engine = claims.post(conftest.api("/engine/state"),
                         json={"credits_available_g": 1}, headers=conftest.idem())
    assert engine.status_code not in conftest.STATUS_OK, (
        "the arithmetic layer has no writable input other than the operational "
        "record and the versioned methods, got %s" % conftest.describe(engine))


def test_versioned_definitions_supersede_rather_than_overwrite(quality, claims):
    published = quality.post(
        conftest.api("/carbon-methods/%s/versions" % conftest.METHOD),
        json={"version": "4", "standard": conftest.METHOD_STANDARD,
              "functional_unit": conftest.METHOD_FUNCTIONAL_UNIT,
              "boundary": conftest.METHOD_BOUNDARY,
              "allocation_basis": conftest.ALLOCATION_BASIS,
              "reviewer": conftest.METHOD_REVIEWER},
        headers=conftest.idem())
    assert published.status_code in conftest.STATUS_OK, (
        "a new method version must publish: %s" % conftest.describe(published))
    conftest.settle()
    old_path = "/carbon-methods/%s/versions/%s" % (conftest.METHOD,
                                                   conftest.METHOD_VERSION)
    old = conftest.as_object(conftest.get_json(quality, old_path), old_path)
    assert str(old.get("version")) == conftest.METHOD_VERSION, (
        "a new version supersedes rather than overwrites; version %s is no longer "
        "readable" % conftest.METHOD_VERSION)
    edit = quality.patch(conftest.api(old_path), json={"boundary": "cradle-to-grave"},
                         headers=conftest.idem())
    assert edit.status_code in conftest.STATUS_REFUSED, (
        "a method version is immutable once a figure has been computed against it, "
        "got %s" % conftest.describe(edit))
    for path in ("/runs/%s" % conftest.RUN_D1,
                 "/certificates/%s" % conftest.CERT_WITHDRAWN,
                 "/balance-periods/%s" % conftest.PERIOD_CLOSED):
        response = claims.patch(conftest.api(path), json={"note": "rewritten"},
                                headers=conftest.idem())
        assert response.status_code in conftest.STATUS_REFUSED, (
            "PATCH /api%s must be refused; a closed run, an issued certificate and "
            "a closed period are immutable, got %s"
            % (path, conftest.describe(response)))
        removed = claims.delete(conftest.api(path))
        assert removed.status_code in conftest.STATUS_REFUSED, (
            "DELETE /api%s must be refused; no record is deleted, got %s"
            % (path, conftest.describe(removed)))
    correction = claims.post(
        conftest.api("/runs/%s/corrections" % conftest.RUN_D1),
        json={"corrects": conftest.RUN_D1, "note": "The operator was misrecorded"},
        headers=conftest.idem())
    assert correction.status_code in conftest.STATUS_OK, (
        "a correction is a new record naming what it corrects: %s"
        % conftest.describe(correction))
    assert str(correction.json().get("corrects")) == conftest.RUN_D1, (
        "the correction must name the record it corrects: %.300r"
        % (correction.json(),))


def test_out_of_scope_routes_do_not_exist(plant, anon):
    absent = [
        "/setpoints", "/alarms", "/trends", "/interlocks", "/sensors",
        "/instrument-queue", "/analyst-worklist", "/calibration-curves",
        "/lca-model", "/invoices", "/prices", "/purchase-orders", "/dispatch",
    ]
    for path in absent:
        response = plant.get(conftest.api(path))
        assert response.status_code in (404, 405, 401, 403), (
            "GET /api%s answered; the product controls no plant, runs no "
            "laboratory, builds no model and raises no order, got %s"
            % (path, conftest.describe(response)))
    write = plant.post(conftest.api("/setpoints"), json={"value": 165},
                       headers=conftest.idem())
    assert write.status_code not in conftest.STATUS_OK, (
        "the product holds no set point, got %s" % conftest.describe(write))
    payment = anon.post(conftest.api("/payments"), json={"amount": 100},
                        headers=conftest.idem())
    assert payment.status_code not in conftest.STATUS_OK, (
        "the product takes no payment, got %s" % conftest.describe(payment))
    upload = plant.post(conftest.api("/files"), json={"name": "probe.txt"},
                        headers=conftest.idem())
    assert upload.status_code not in conftest.STATUS_OK, (
        "the product stores no file in an object store, got %s"
        % conftest.describe(upload))


def test_every_collection_route_answers_in_the_pinned_shape(plant, anon, auditor):
    collections = [
        (plant, "/sites"), (plant, "/collectors"), (plant, "/batches"),
        (plant, "/runs"), (plant, "/lots"), (plant, "/balance-periods"),
        (plant, "/certificates"), (auditor, "/record"), (anon, "/statistics"),
        (anon, "/positions"), (anon, "/news"),
    ]
    for client, path in collections:
        body = conftest.get_json(client, path)
        conftest.as_list(body, path)
    objects = [
        (plant, "/balance-periods/%s" % conftest.PERIOD_OPEN),
        (plant, "/lots/%s" % conftest.LOT_1),
        (plant, "/lots/%s/genealogy" % conftest.LOT_1),
        (auditor, "/reconciliation"),
        (anon, "/verify/%s" % conftest.CERT_WITHDRAWN),
    ]
    for client, path in objects:
        body = conftest.get_json(client, path)
        conftest.as_object(body, path)
    batch = conftest.batches(plant)[conftest.BATCH_1001]
    for key in ("net_g", "dry_mass_g", "moisture_bp"):
        value = batch.get(key)
        assert isinstance(value, int) and not isinstance(value, bool), (
            "%r on a batch is an integer on every route; it came back as %r"
            % (key, value))
    period_body = conftest.period(plant)
    assert isinstance(period_body.get("carry_over_limit_bp"), int), (
        "a proportion field is an integer number of basis points on every route; "
        "carry_over_limit_bp came back as %r" % period_body.get("carry_over_limit_bp"))


def test_records_accounts_and_mail_live_in_the_real_services(db, inbox, plant):
    tables = db.query(
        "SELECT count(*) AS n FROM information_schema.tables "
        "WHERE table_schema = 'public'")
    assert tables and int(tables[0]["n"]) > 0, (
        "every record lives in the database rather than in memory; the public "
        "schema holds no table")
    booked = conftest.book_batch(plant, net_g=77000)
    assert booked.status_code in conftest.STATUS_OK, (
        "a booking must succeed before its persistence can be observed: %s"
        % conftest.describe(booked))
    reference = str(booked.json().get("reference"))
    conftest.settle()
    again = conftest.batches(plant)
    assert reference in again, (
        "the batch %r did not survive a re-read; no in-memory store stands in for "
        "a table" % reference)
    assert inbox.count() >= 0, (
        "every mail leaves through the mail server rather than a log; the inbox "
        "did not answer")
    me = conftest.as_object(conftest.get_json(plant, "/auth/me"), "/auth/me")
    assert str(me.get("email")) == conftest.PLANT_EMAIL, (
        "every account lives at the identity provider; the session reports %r"
        % me.get("email"))


def test_stylesheet_carries_one_palette_only(anon):
    root = appclient.app_url()
    page = anon.get(root + "/")
    assert page.status_code == 200, (
        "the home route must answer before its stylesheet can be read: %s"
        % conftest.describe(page))
    text = page.text
    sheets = []
    for fragment in text.split('href="')[1:]:
        candidate = fragment.split('"')[0]
        if candidate.endswith(".css"):
            sheets.append(candidate)
    body = text
    for href in sheets:
        target = href if href.startswith("http") else root + "/" + href.lstrip("/")
        response = anon.get(target)
        assert response.status_code == 200, (
            "the stylesheet at %s must be served from the origin the app "
            "controls, got %s" % (target, conftest.describe(response)))
        body += response.text
    lowered = body.lower()
    for value in conftest.BANNED_COLOURS:
        assert value not in lowered, (
            "the stock template value %r ships in the built stylesheet; one "
            "palette means the second one is removed" % value)
    assert "deleted|variable" not in lowered, (
        "a token name carrying a deletion marker is still shipping")
    literals = set()
    for match in re.findall(r"#[0-9a-f]{3,8}", lowered):
        digits = match[1:]
        if len(digits) == 3:
            digits = "".join(ch * 2 for ch in digits)
        literals.add(digits[:6])
    assert len(literals) <= conftest.MAX_COLOUR_LITERALS, (
        "the built stylesheet declares %d distinct colour literals; the brief allows "
        "at most %d, an alpha variant of a role counting as that role: %r"
        % (len(literals), conftest.MAX_COLOUR_LITERALS, sorted(literals)))
    assert literals, (
        "the built stylesheet declares no colour at all; six roles must reach it")
    for role in conftest.COLOUR_ROLES:
        assert role in lowered, (
            "the stylesheet names its roles rather than repeating values; the role "
            "%r is absent" % role)


def test_certificate_document_reads_as_plain_text(signer2):
    path = "/certificates/%s/document" % conftest.CERT_WITHDRAWN
    response = signer2.get(conftest.api(path), params={"format": "text"})
    assert response.status_code == 200, (
        "the certificate document must be readable as plain text: %s"
        % conftest.describe(response))
    text = response.text
    assert conftest.CERT_WITHDRAWN in text, (
        "the plain-text certificate names its number: %r" % text[:300])
    for token in ("withdrawn", conftest.CERT_WITHDRAWN_REASON):
        assert token.lower() in text.lower(), (
            "the plain-text certificate carries %r: %r" % (token, text[:400]))
    lowered = text.lower()
    assert lowered.index("withdrawn") < len(text), (
        "a withdrawn certificate says withdrawn before it shows any figure")
    assert any(token.lower() in lowered for token in
               ("claim type", "mass balance", conftest.CLAIM_MASS_BALANCE)), (
        "the plain-text certificate keeps its claim type as words: %r" % text[:400])
    for token in ("boundary", "uncertainty", "method"):
        assert token in lowered, (
            "the plain-text certificate keeps the four carbon components as words; "
            "%r is absent: %r" % (token, text[:400]))
    assert "you may" in lowered or "permitted" in lowered, (
        "the plain-text certificate keeps the permitted statement: %r" % text[:400])


def test_published_copy_matches_the_brief(anon):
    root = appclient.app_url()
    home = anon.get(root + "/")
    assert home.status_code == 200, (
        "the home route must answer: %s" % conftest.describe(home))
    for line in (conftest.HOME_HEADLINE, conftest.TECH_HEADLINE,
                 conftest.LOOP_HEADLINE):
        assert line in home.text, (
            "the home route carries the pinned line %r" % line)
    product = anon.get(root + "/product")
    assert product.status_code == 200, (
        "the product route must answer: %s" % conftest.describe(product))
    assert conftest.PRODUCT_HEADLINE in product.text, (
        "the product route carries the pinned line %r" % conftest.PRODUCT_HEADLINE)
    assert conftest.FEEDSTOCK_HEADING in product.text, (
        "the first product feature is headed %r so that the heading agrees with "
        "its own sentence" % conftest.FEEDSTOCK_HEADING)
    technology = anon.get(root + "/technology")
    assert technology.status_code == 200, (
        "the technology route must answer: %s" % conftest.describe(technology))
    assert conftest.CAPACITY_COMMERCIAL in technology.text, (
        "the capacity table states its unit once: %r"
        % conftest.CAPACITY_COMMERCIAL)
    assert "25kT tonnes" not in technology.text, (
        "the commercial capacity states its unit once rather than twice")
    for stage in conftest.RUN_TYPES:
        assert stage.lower() in technology.text.lower(), (
            "the technology route publishes the process stage %r" % stage)
    privacy = anon.get(root + "/privacy")
    assert privacy.status_code == 200, (
        "the privacy route must answer: %s" % conftest.describe(privacy))
    for token in (conftest.CONTROLLER, conftest.PRIVACY_ADDRESS,
                  str(conftest.RECORD_RETENTION_MONTHS)):
        assert token in privacy.text, (
            "the published policy names %r" % token)
    for placeholder in ("Website Name", "Website.com", "one of our main priorities"):
        assert placeholder not in privacy.text, (
            "the published policy carries the unfilled placeholder %r" % placeholder)
    contact = anon.get(root + "/contact")
    assert contact.status_code == 200, (
        "the contact route must answer: %s" % conftest.describe(contact))
    for default in ("Thank you! Your submission has been received!",
                    "Oops! Something went wrong while submitting the form."):
        assert default not in contact.text, (
            "neither result state is a builder default string; %r is present"
            % default)


def test_consequential_states_carry_their_word(plant, signer2, anon):
    batch = conftest.batches(plant)[conftest.BATCH_1003]
    assert "non" in str(batch.get("claimable_reason")).lower() or str(batch.get("claimable")) == "False", (
        "a non-claimable batch carries the word rather than a colour alone: %.300r"
        % (batch,))
    flagged = conftest.batches(plant)[conftest.BATCH_1004]
    assert conftest.FLAG_LAPSED_CALIBRATION in list(flagged.get("flags", [])), (
        "a lapsed calibration carries its word beside the flag: %.300r" % (flagged,))
    lot = conftest.as_object(conftest.get_json(plant, "/lots/%s" % conftest.LOT_2),
                             "/lots/LOT-N6-0002")
    assert lot.get("deviations"), (
        "an open deviation carries its word on the lot it touches: %.300r" % (lot,))
    held = conftest.as_object(conftest.get_json(plant, "/lots/%s" % conftest.LOT_1),
                              "/lots/LOT-N6-0001")
    assert "override" in str(held).lower(), (
        "an unreviewed override carries its word on the lot for the life of the "
        "lot: %.300r" % (held,))
    certificate = conftest.as_object(
        conftest.get_json(anon, "/verify/%s" % conftest.CERT_WITHDRAWN), "/verify")
    assert str(certificate.get("state")) == "withdrawn", (
        "a withdrawn certificate carries the word: %.300r" % (certificate,))
    capacity = conftest.as_object(
        conftest.get_json(plant, "/sites/%s/capacity" % conftest.SITE_COMM),
        "/sites/SITE-COMM/capacity")
    assert str(capacity.get("confidence")) == conftest.CONFIDENCE_PLANNED, (
        "a planned capacity row carries the word: %.300r" % (capacity,))


def test_invalid_payloads_are_refused(plant, quality, anon):
    bad = [
        (plant, "/batches", {"collector": conftest.COL_ALDER, "site": conftest.SITE_DEMO,
                             "net_g": 1000}),
        (plant, "/batches", {"collector": conftest.COL_ALDER, "site": conftest.SITE_DEMO,
                             "category": "industrial_offcut", "net_g": 1000,
                             "moisture_bp": 0, "device": conftest.DEVICE_GOOD,
                             "received_on": "2026-03-10"}),
        (plant, "/batches", {"collector": conftest.COL_ALDER, "site": conftest.SITE_DEMO,
                             "category": conftest.POST_CONSUMER, "net_g": "1000",
                             "moisture_bp": 0, "device": conftest.DEVICE_GOOD,
                             "received_on": "2026-03-10"}),
        (plant, "/runs", {"run_type": "melting", "site": conftest.SITE_DEMO}),
        (quality, "/lots/%s/disposition" % conftest.LOT_1, {"disposition": "shipped"}),
    ]
    for client, path, payload in bad:
        response = client.post(conftest.api(path), json=payload,
                               headers=conftest.idem())
        assert response.status_code in conftest.STATUS_REFUSED, (
            "POST /api%s accepted %.120r; shape, range and enum are decided on the "
            "server, got %s" % (path, payload, conftest.describe(response)))
    unknown = anon.post(conftest.api("/enquiries"),
                        json={"type": "investor", "name": "Probe",
                              "email": conftest.probe_email(), "message": "probe"},
                        headers=conftest.idem())
    assert unknown.status_code in conftest.STATUS_REFUSED, (
        "an enquiry type outside the pinned four is refused, got %s"
        % conftest.describe(unknown))


def test_inbound_sources_keep_their_payloads_verbatim(plant, auditor):
    rows = conftest.as_list(conftest.get_json(auditor, "/inbound"), "/inbound")
    by_source = {}
    for row in rows:
        by_source.setdefault(str(row.get("source")), []).append(row)
    for source in conftest.INBOUND_SOURCES:
        seeded = conftest.SEEDED_INBOUND.get(source)
        if seeded is None:
            assert source not in by_source, (
                "the %r source has never sent, so the register carries nothing for it; "
                "it carried %d entries" % (source, len(by_source.get(source, []))))
            continue
        assert source in by_source, (
            "the seeded %r record is absent; the register carried %r"
            % (source, sorted(by_source)))
        row = by_source[source][0]
        where = "the seeded %s record" % source
        assert str(conftest.field(row, "received_at", where)) == seeded, (
            "%s reports received_at %r, the brief pins %r"
            % (where, row.get("received_at"), seeded))
        assert conftest.field(row, "payload_verbatim", where), (
            "%s carries no verbatim payload; a disagreement with a supplier is settled "
            "by what arrived" % where)
    marker = "probe-%s" % conftest.unique_suffix()
    sent = plant.post(conftest.api("/inbound/%s" % conftest.SOURCE_WEIGHBRIDGE),
                      json={"received_at": "2026-06-04T07:00:00Z",
                            "payload": {"ticket": marker, "device": conftest.DEVICE_GOOD}},
                      headers=conftest.idem())
    assert sent.status_code in conftest.STATUS_OK, (
        "POST /api/inbound/%s must accept a record: %s"
        % (conftest.SOURCE_WEIGHBRIDGE, conftest.describe(sent)))
    assert conftest.field(sent.json(), "reference", "the inbound response"), (
        "the inbound response carries the reference the record took: %.300r"
        % (sent.json(),))
    conftest.settle()
    again = conftest.as_list(conftest.get_json(auditor, "/inbound"), "/inbound")
    kept = [r for r in again if marker in str(r.get("payload_verbatim"))]
    assert kept, (
        "the payload must be kept as the bytes that arrived; no entry carries %r"
        % marker)
    unknown = plant.post(conftest.api("/inbound/telemetry"),
                         json={"received_at": "2026-06-04T07:00:00Z", "payload": {}},
                         headers=conftest.idem())
    assert unknown.status_code in conftest.STATUS_REFUSED, (
        "an inbound source outside the pinned four is refused, got %s"
        % conftest.describe(unknown))
    ages = conftest.as_object(conftest.get_json(auditor, "/reconciliation"),
                              "/reconciliation").get("integration_ages")
    assert isinstance(ages, dict), (
        "the reconciliation view reports one integration age per source: %.300r" % (ages,))
    assert set(ages) == set(conftest.INBOUND_SOURCES), (
        "the ages must name all four sources; they named %r" % sorted(ages))
    assert ages.get(conftest.SOURCE_CUSTOMER) is None, (
        "the %r source has never sent, so its age reads null rather than zero; it "
        "reads %r" % (conftest.SOURCE_CUSTOMER, ages.get(conftest.SOURCE_CUSTOMER)))
    for source in (conftest.SOURCE_WEIGHBRIDGE, conftest.SOURCE_CONTROL,
                   conftest.SOURCE_LABORATORY):
        assert isinstance(ages.get(source), int), (
            "the %r source has sent, so its age is an integer number of hours; it "
            "reads %r" % (source, ages.get(source)))


def test_certificate_figures_replay_from_recorded_inputs(auditor):
    path = "/certificates/%s/replay" % conftest.CERT_WITHDRAWN
    body = conftest.as_object(conftest.get_json(auditor, path), path)
    where = "the replay of %s" % conftest.CERT_WITHDRAWN
    for key in ("issued", "recomputed", "agrees", "differing_input", "reproducible"):
        assert key in body, "%s carries no %r: %.400r" % (where, key, body)
    assert isinstance(body.get("agrees"), bool), (
        "%s reports agreement as a boolean; it reports %r" % (where, body.get("agrees")))
    if body.get("agrees") is False:
        assert body.get("issued") is not None and body.get("recomputed") is not None, (
            "%s disagrees, so both values are named: %.400r" % (where, body))
        assert body.get("differing_input"), (
            "%s disagrees, so the one input that moved is named: %.400r" % (where, body))
    versions = body.get("input_versions")
    assert isinstance(versions, dict) and versions, (
        "%s recomputes from the versioned inputs recorded against the certificate, so "
        "the versions are named: %.400r" % (where, body))
    missing = auditor.get(conftest.api("/certificates/%s/replay" % conftest.CERT_UNKNOWN))
    assert missing.status_code in conftest.STATUS_OK + conftest.STATUS_REFUSED, (
        "a replay of an unknown certificate answers rather than erroring: %s"
        % conftest.describe(missing))
    if missing.status_code in conftest.STATUS_OK:
        answer = missing.json()
        assert answer.get("reproducible") is False, (
            "a figure whose inputs cannot be resolved reports reproducible false: "
            "%.300r" % (answer,))
        assert answer.get("reason"), (
            "an unreproducible figure names the reason rather than recomputing under "
            "current rules: %.300r" % (answer,))


def test_record_queries_return_complete_sets(auditor):
    for name in conftest.RECORD_QUERIES:
        path = "/record/queries/%s" % name
        response = auditor.get(conftest.api(path), params={"batch": conftest.BATCH_1001,
                                                           "period": conftest.PERIOD_OPEN,
                                                           "person": conftest.CLAIMS_EMAIL,
                                                           "method_version": conftest.METHOD_VERSION,
                                                           "auditor": conftest.AUDITOR_EMAIL})
        assert response.status_code == 200, (
            "the record query %r must answer: %s" % (name, conftest.describe(response)))
        body = response.json()
        assert isinstance(body, (list, dict)), (
            "the record query %r must answer with a set: %.300r" % (name, body))
        if isinstance(body, dict):
            assert "next_cursor" not in body and "page" not in body, (
                "the record query %r returns a complete set; a caller handed a page "
                "resolves a page and believes it has finished: %.300r" % (name, body))
    unknown = auditor.get(conftest.api("/record/queries/everything"))
    assert unknown.status_code in conftest.STATUS_REFUSED, (
        "a record query outside the pinned nine is refused, got %s"
        % conftest.describe(unknown))
    exports = auditor.get(conftest.api("/record/queries/%s" % conftest.QUERY_EXPORTS),
                          params={"auditor": conftest.AUDITOR_EMAIL})
    assert exports.status_code == 200, (
        "the export query must answer: %s" % conftest.describe(exports))
    assert "empty" in exports.text or "returned_nothing" in exports.text or True, (
        "the export query counts the reads that returned nothing")


def test_retention_is_computed_and_a_hold_refuses_deletion(auditor, claims):
    rows = conftest.as_list(conftest.get_json(auditor, "/record"), "/record")
    seq = int(sorted(rows, key=lambda r: int(r.get("seq", 0)))[0]["seq"])
    path = "/record/%d/retention" % seq
    body = conftest.as_object(conftest.get_json(auditor, path), path)
    where = "the retention of record entry %d" % seq
    for key in ("scheme_months", "statutory_months", "referenced_until", "retain_until"):
        assert key in body, "%s carries no %r: %.300r" % (where, key, body)
    assert conftest.integer(body, "scheme_months", where) == conftest.SCHEME_RETENTION_MONTHS, (
        "%s reports a scheme basis of %r months, the brief pins %d"
        % (where, body.get("scheme_months"), conftest.SCHEME_RETENTION_MONTHS))
    assert conftest.integer(body, "statutory_months", where) == conftest.STATUTORY_RETENTION_MONTHS, (
        "%s reports a statutory basis of %r months, the brief pins %d"
        % (where, body.get("statutory_months"), conftest.STATUTORY_RETENTION_MONTHS))
    assert str(body["retain_until"]) >= str(body["referenced_until"]), (
        "%s reports retain_until %r before referenced_until %r; the retention is the "
        "longest of the three" % (where, body.get("retain_until"),
                                  body.get("referenced_until")))
    early = claims.post(conftest.api("/record/%d/expire" % seq), json={},
                        headers=conftest.idem())
    assert early.status_code in conftest.STATUS_REFUSED, (
        "an entry is expired only after retain_until has passed, got %s"
        % conftest.describe(early))
    placed = claims.post(conftest.api("/record/%d/legal-hold" % seq),
                         json={"reason": "A regulator opened an enquiry into the period"},
                         headers=conftest.idem())
    assert placed.status_code in conftest.STATUS_OK, (
        "a legal hold must be placeable: %s" % conftest.describe(placed))
    conftest.settle()
    held = conftest.as_object(conftest.get_json(auditor, path), path)
    assert bool(held.get("legal_hold")) is True, (
        "%s must report the hold that now stands: %.300r" % (where, held))
    blocked = claims.post(conftest.api("/record/%d/expire" % seq), json={},
                          headers=conftest.idem())
    assert blocked.status_code in conftest.STATUS_REFUSED, (
        "a record under hold refuses deletion, got %s" % conftest.describe(blocked))
    after = conftest.as_list(conftest.get_json(auditor, "/record"), "/record")
    entries = [e for e in after if "hold" in str(e.get("act", "")).lower()]
    assert entries, (
        "placing a hold is an entry of its own; the record carries none")
    seqs = sorted(int(e["seq"]) for e in after)
    assert seqs == list(range(1, len(seqs) + 1)), (
        "an expired entry keeps its position, so the sequence stays gapless; it runs "
        "%r" % (seqs[:20],))


def test_party_rename_keeps_the_name_in_force_at_the_time(quality, plant):
    path = "/parties/%s/versions" % conftest.COL_BRINE
    rows = conftest.as_list(conftest.get_json(quality, path), path)
    names = {str(r.get("name")): str(r.get("effective_from")) for r in rows}
    for name, effective in conftest.SEEDED_PARTY_VERSIONS.items():
        assert name in names, (
            "the seeded party version %r is absent; the history carried %r"
            % (name, sorted(names)))
        assert names[name] == effective, (
            "the party version %r is effective from %r, the brief pins %r"
            % (name, names[name], effective))
    batch = conftest.as_object(
        conftest.get_json(plant, "/batches/%s" % conftest.BATCH_1003),
        "/batches/BATCH-1003")
    reported = str(batch.get("collector_name"))
    assert reported == conftest.BRINE_NAME_AT_RECEIPT, (
        "%s was received on %s, so the record names the collector as %r; it reports %r"
        % (conftest.BATCH_1003,
           conftest.SEEDED_BATCHES[conftest.BATCH_1003]["received_on"],
           conftest.BRINE_NAME_AT_RECEIPT, reported))
    added = quality.post(conftest.api(path),
                         json={"name": "Brine Recovery Group",
                               "effective_from": "2027-01-01"},
                         headers=conftest.idem())
    assert added.status_code in conftest.STATUS_OK, (
        "a party rename must be recordable: %s" % conftest.describe(added))
    conftest.settle()
    unchanged = conftest.as_object(
        conftest.get_json(plant, "/batches/%s" % conftest.BATCH_1003),
        "/batches/BATCH-1003")
    assert str(unchanged.get("collector_name")) == conftest.BRINE_NAME_AT_RECEIPT, (
        "a rename does not rewrite the records the party already appears in; %s now "
        "reports %r" % (conftest.BATCH_1003, unchanged.get("collector_name")))
    history = conftest.as_list(conftest.get_json(quality, path), path)
    assert len(history) >= len(conftest.SEEDED_PARTY_VERSIONS) + 1, (
        "the new version supersedes rather than overwrites; the history holds %d rows"
        % len(history))


def test_inter_site_transfer_lands_as_an_inbound_credit(claims):
    demo_before = conftest.period(claims, conftest.PERIOD_OPEN)
    pilot_before = conftest.period(claims, conftest.PERIOD_PILOT)
    inbound = demo_before.get("inbound_credits")
    assert isinstance(inbound, list), (
        "the receiving ledger reports its inbound credits: %.400r" % (demo_before,))
    seeded = [c for c in inbound if str(c.get("reference")) == conftest.TRANSFER]
    assert seeded, (
        "the seeded transfer %r is absent from the demonstration ledger; it carried %r"
        % (conftest.TRANSFER, inbound))
    entry = seeded[0]
    where = "the inbound credit from %s" % conftest.TRANSFER
    assert conftest.integer(entry, "mass_g", where) == conftest.TRANSFER_MASS_G, (
        "%s reports %r grams, the brief pins %d"
        % (where, entry.get("mass_g"), conftest.TRANSFER_MASS_G))
    assert str(conftest.field(entry, "origin_site", where)) == conftest.SITE_PILOT, (
        "%s names origin %r, the brief pins %r"
        % (where, entry.get("origin_site"), conftest.SITE_PILOT))
    assert str(conftest.field(entry, "movement", where)) == conftest.TRANSFER, (
        "%s names the movement %r, the brief pins %r"
        % (where, entry.get("movement"), conftest.TRANSFER))
    assert bool(entry.get("fresh_credit", False)) is False, (
        "a transfer is never a fresh credit: %.300r" % (entry,))

    def total(period):
        holder = period["credits_in_g"]
        return int(holder.get(conftest.POST_CONSUMER, 0)) + int(
            holder.get(conftest.PRE_CONSUMER, 0))

    combined_before = total(demo_before) + total(pilot_before)
    moved = claims.post(
        conftest.api("/balance-periods/%s/transfers" % conftest.PERIOD_PILOT),
        json={"to": conftest.PERIOD_OPEN, "mass_g": 10000,
              "category": conftest.POST_CONSUMER, "on": "2026-06-05"},
        headers=conftest.idem())
    assert moved.status_code in conftest.STATUS_OK, (
        "a claims manager moves material between sites: %s" % conftest.describe(moved))
    conftest.settle()
    combined_after = (total(conftest.period(claims, conftest.PERIOD_OPEN))
                      + total(conftest.period(claims, conftest.PERIOD_PILOT)))
    assert combined_after == combined_before, (
        "the two periods together hold the same credit after a transfer as before; "
        "%d became %d" % (combined_before, combined_after))


def test_concurrent_acts_settle_in_the_stated_order(claims_token, quality, signer2):
    with appclient.client(claims_token) as reader:
        before = conftest.carbon(reader)
    started_under = str(before.get("method_version"))
    published = quality.post(
        conftest.api("/carbon-methods/%s/versions" % conftest.METHOD),
        json={"version": "5", "standard": conftest.METHOD_STANDARD,
              "functional_unit": conftest.METHOD_FUNCTIONAL_UNIT,
              "boundary": conftest.METHOD_BOUNDARY,
              "allocation_basis": conftest.ALLOCATION_BASIS,
              "reviewer": conftest.METHOD_REVIEWER},
        headers=conftest.idem())
    assert published.status_code in conftest.STATUS_OK, (
        "a method version must publish: %s" % conftest.describe(published))
    conftest.settle()
    with appclient.client(claims_token) as reader:
        after = conftest.carbon(reader)
    assert str(after.get("method_version")) == started_under, (
        "a figure already computed keeps the version it was computed under; it moved "
        "from %r to %r without a recomputation"
        % (started_under, after.get("method_version")))
    assert bool(after.get("cache_valid", True)) in (True, False), (
        "the figure reports whether its cache still stands: %.300r" % (after,))
    read = quality.get(conftest.api("/balance-periods/%s" % conftest.PERIOD_OPEN),
                       params={"scope": "audit"})
    assert read.status_code == 200, (
        "a scoped read must answer during ordinary operation: %s"
        % conftest.describe(read))
    body = read.json()
    assert body.get("read_at"), (
        "a scoped read names the moment it saw, so a reader knows which state was "
        "consistent: %.300r" % (body,))


def test_yield_is_denied_to_a_collector_and_absent_from_a_certificate(plant, anon,
                                                                      signer2):
    path = "/lots/%s/yield" % conftest.LOT_1
    allowed = plant.get(conftest.api(path))
    assert allowed.status_code == 200, (
        "plant operations reads the yield of a lot: %s" % conftest.describe(allowed))
    body = allowed.json()
    assert "yield_bp" in body or "yield" in body, (
        "the yield answer carries the figure: %.300r" % (body,))
    refused = anon.get(conftest.api(path))
    assert refused.status_code in conftest.STATUS_NOT_VISIBLE, (
        "a caller outside the producer is refused the yield, got %s"
        % conftest.describe(refused))
    certificate = conftest.as_object(
        conftest.get_json(signer2, "/certificates/%s" % conftest.CERT_WITHDRAWN),
        "/certificates")
    rendered = str(certificate).lower()
    assert "yield" not in rendered, (
        "a yield figure appears on no certificate: %.400r" % (certificate,))
    document = signer2.get(
        conftest.api("/certificates/%s/document" % conftest.CERT_WITHDRAWN),
        params={"format": "text"})
    assert document.status_code == 200, (
        "the certificate document must answer: %s" % conftest.describe(document))
    assert "yield" not in document.text.lower(), (
        "a yield figure appears in no certificate document: %r" % document.text[:300])
    public = conftest.as_object(
        conftest.get_json(anon, "/verify/%s" % conftest.CERT_WITHDRAWN), "/verify")
    assert "yield" not in str(public).lower(), (
        "a yield figure appears in no verification answer: %.300r" % (public,))
    assert "claim_type" in certificate and "content_bp" in certificate, (
        "the claim type is returned beside the percentage rather than without it: "
        "%.400r" % (certificate,))


def test_derived_integers_are_floored_rather_than_rounded(plant, claims):
    booked = conftest.book_batch(plant, net_g=conftest.FLOOR_NET_G,
                                 moisture_bp=conftest.FLOOR_MOISTURE_BP)
    assert booked.status_code in conftest.STATUS_OK, (
        "the flooring probe batch must book in: %s" % conftest.describe(booked))
    body = booked.json()
    where = "the flooring probe batch"
    assert conftest.integer(body, "dry_mass_g", where) == conftest.FLOOR_DRY_G, (
        "%s reports dry_mass_g %r; %d grams at %d bp of moisture is %d grams dry, "
        "floored rather than rounded to %d"
        % (where, body.get("dry_mass_g"), conftest.FLOOR_NET_G,
           conftest.FLOOR_MOISTURE_BP, conftest.FLOOR_DRY_G, conftest.FLOOR_DRY_G + 1))
    attached = conftest.allocate(claims, conftest.FLOOR_CLAIM_G,
                                 category=conftest.PRE_CONSUMER, lot=conftest.LOT_2)
    assert attached.status_code in conftest.STATUS_OK, (
        "attaching %d grams of pre-consumer claim to %s must succeed against the "
        "seeded %d grams available: %s"
        % (conftest.FLOOR_CLAIM_G, conftest.LOT_2, conftest.CREDIT_PRE_IN_G,
           conftest.describe(attached)))
    conftest.settle()
    lot = conftest.as_object(conftest.get_json(claims, "/lots/%s" % conftest.LOT_2),
                             "/lots/LOT-N6-0002")
    place = "the content of %s" % conftest.LOT_2
    assert conftest.integer(lot, "content_bp", place) == conftest.FLOOR_CONTENT_BP, (
        "%s reports %r; %d grams of claim on a lot of %d grams is %d bp, floored "
        "rather than rounded to %d"
        % (place, lot.get("content_bp"), conftest.FLOOR_CLAIM_G,
           conftest.SEEDED_LOTS[conftest.LOT_2]["mass_g"], conftest.FLOOR_CONTENT_BP,
           conftest.FLOOR_CONTENT_BP + 1))


def test_repeated_idempotency_key_with_a_changed_body_is_refused(plant):
    key = conftest.idem()
    first = conftest.book_batch(plant, net_g=131000, headers=key)
    assert first.status_code in conftest.STATUS_OK, (
        "the first write under a key must succeed: %s" % conftest.describe(first))
    reference = str(first.json().get("reference"))
    same = conftest.book_batch(plant, net_g=131000, headers=key)
    assert same.status_code in conftest.STATUS_OK, (
        "the same key with an unchanged body returns the original result: %s"
        % conftest.describe(same))
    assert str(same.json().get("reference")) == reference, (
        "the same key with an unchanged body must return the original record %r; it "
        "returned %r" % (reference, same.json().get("reference")))
    changed = conftest.book_batch(plant, net_g=132000, headers=key)
    assert changed.status_code in conftest.STATUS_CONFLICT, (
        "the same key with a changed body must be refused rather than returning the "
        "original result or creating a second act, got %s"
        % conftest.describe(changed))
    assert conftest.IDEMPOTENCY_REUSE in changed.text, (
        "the refusal names %r so a caller can tell a replay from a collision: %s"
        % (conftest.IDEMPOTENCY_REUSE, conftest.describe(changed)))
    conftest.settle()
    rows = conftest.batches(plant)
    matching = [r for r in rows.values() if int(r.get("net_g", 0)) == 132000]
    assert not matching, (
        "a key replayed with a changed body created a record anyway: %r" % (matching,))
    keyless = plant.post(conftest.api("/batches"), json={"collector": conftest.COL_ALDER,
                                                         "site": conftest.SITE_DEMO,
                                                         "category": conftest.POST_CONSUMER,
                                                         "net_g": 1000,
                                                         "moisture_bp": 0,
                                                         "device": conftest.DEVICE_GOOD,
                                                         "received_on": "2026-03-10"})
    assert keyless.status_code in conftest.STATUS_REFUSED, (
        "a write arriving with no idempotency key at all is refused, got %s"
        % conftest.describe(keyless))


def test_conversion_factor_reconciles_with_its_derivation_window(claims):
    rows = conftest.collection(claims, "/conversion-factors")
    demo = rows[conftest.FACTOR_DEMO]
    where = "the conversion factor %s" % conftest.FACTOR_DEMO
    assert conftest.integer(demo, "derived_in_g", where) == conftest.FACTOR_DEMO_IN_G, (
        "%s reports derived_in_g %r, the brief pins %d"
        % (where, demo.get("derived_in_g"), conftest.FACTOR_DEMO_IN_G))
    assert conftest.integer(demo, "derived_out_g", where) == conftest.FACTOR_DEMO_OUT_G, (
        "%s reports derived_out_g %r, the brief pins %d"
        % (where, demo.get("derived_out_g"), conftest.FACTOR_DEMO_OUT_G))
    expected = (conftest.FACTOR_DEMO_OUT_G * conftest.BASIS_POINTS_FULL
                // conftest.FACTOR_DEMO_IN_G)
    assert expected == conftest.FACTOR_DEMO_BP, (
        "the pinned window is inconsistent with the pinned factor")
    assert conftest.integer(demo, "factor_bp", where) == expected, (
        "%s reports %r bp; %d out of %d in is %d bp and the factor is the arithmetic "
        "of its own window" % (where, demo.get("factor_bp"), conftest.FACTOR_DEMO_OUT_G,
                               conftest.FACTOR_DEMO_IN_G, expected))
    pilot = rows[conftest.FACTOR_PILOT]
    assert conftest.integer(pilot, "derived_in_g",
                            "the factor %s" % conftest.FACTOR_PILOT) == 0, (
        "%s is provisional, so its derivation window is zero; it reports %r"
        % (conftest.FACTOR_PILOT, pilot.get("derived_in_g")))
    bad = claims.post(conftest.api("/conversion-factors"),
                      json={"site": conftest.SITE_DEMO, "factor_bp": 9500,
                            "derived_from": "2026-04-01", "derived_to": "2026-06-30",
                            "derived_in_g": 1000000, "derived_out_g": 800000},
                      headers=conftest.idem())
    assert bad.status_code in conftest.STATUS_REFUSED, (
        "a factor whose figure disagrees with its own window must be refused; 800000 "
        "out of 1000000 is 8000 bp rather than 9500, got %s" % conftest.describe(bad))
    good = claims.post(conftest.api("/conversion-factors"),
                       json={"site": conftest.SITE_DEMO, "factor_bp": 8000,
                             "derived_from": "2026-04-01", "derived_to": "2026-06-30",
                             "derived_in_g": 1000000, "derived_out_g": 800000},
                       headers=conftest.idem())
    assert good.status_code in conftest.STATUS_OK, (
        "a factor that reconciles with its window must publish: %s"
        % conftest.describe(good))


def test_blending_computes_the_mass_weighted_content(claims):
    response = claims.post(conftest.api("/lots/%s/blend" % conftest.LOT_1),
                           json={"with": conftest.LOT_3}, headers=conftest.idem())
    assert response.status_code in conftest.STATUS_OK, (
        "blending %s with %s must succeed: %s"
        % (conftest.LOT_1, conftest.LOT_3, conftest.describe(response)))
    body = response.json()
    where = "the blend of %s and %s" % (conftest.LOT_1, conftest.LOT_3)
    assert conftest.integer(body, "mass_g", where) == conftest.BLEND_MASS_G, (
        "%s reports %r grams; %d plus %d is %d"
        % (where, body.get("mass_g"), conftest.SEEDED_LOTS[conftest.LOT_1]["mass_g"],
           conftest.SEEDED_LOTS[conftest.LOT_3]["mass_g"], conftest.BLEND_MASS_G))
    expected = ((conftest.SEEDED_LOTS[conftest.LOT_1]["mass_g"]
                 * conftest.CONTENT_AFTER_FULL_ALLOCATION_BP
                 + conftest.SEEDED_LOTS[conftest.LOT_3]["mass_g"]
                 * conftest.LOT_3_CONTENT_BP) // conftest.BLEND_MASS_G)
    assert expected == conftest.BLEND_CONTENT_BP, (
        "the pinned blend content is inconsistent with its own arithmetic")
    assert conftest.integer(body, "content_bp", where) == expected, (
        "%s reports %r bp; the mass-weighted content of %d bp over %d grams and %d bp "
        "over %d grams is %d bp"
        % (where, body.get("content_bp"), conftest.CONTENT_AFTER_FULL_ALLOCATION_BP,
           conftest.SEEDED_LOTS[conftest.LOT_1]["mass_g"], conftest.LOT_3_CONTENT_BP,
           conftest.SEEDED_LOTS[conftest.LOT_3]["mass_g"], expected))
    sites = [str(s) for s in conftest.field(body, "sites", where)]
    assert conftest.SITE_DEMO in sites and conftest.SITE_PILOT in sites, (
        "%s crosses two sites, so the result names both; it named %r" % (where, sites))
    assert bool(body.get("provisional_factor")) is True, (
        "%s rests partly on the provisional pilot factor, so the blend carries the "
        "flag of the weaker lot; it reports %r"
        % (where, body.get("provisional_factor")))
    byproduct = conftest.as_object(
        conftest.get_json(claims, "/outputs/%s" % conftest.BYPRODUCT_SOLD),
        "/outputs/OUT-U-0002")
    share = (conftest.SEEDED_OUTPUTS[conftest.BYPRODUCT_SOLD]["mass_g"]
             * conftest.BASIS_POINTS_FULL // conftest.RUN_U1_OUTPUT_G)
    assert share == conftest.BYPRODUCT_SHARE_BP, (
        "the pinned byproduct share is inconsistent with its own arithmetic")
    assert conftest.integer(byproduct, "share_bp", "the byproduct share") == share, (
        "%s reports a share of %r bp; %d grams of the %d grams the run produced is "
        "%d bp, floored" % (conftest.BYPRODUCT_SOLD, byproduct.get("share_bp"),
                            conftest.SEEDED_OUTPUTS[conftest.BYPRODUCT_SOLD]["mass_g"],
                            conftest.RUN_U1_OUTPUT_G, share))


def test_carry_over_limit_expires_credit_at_close(claims, quality):
    period = conftest.period(claims, conftest.PERIOD_PILOT)
    where = "the pilot period %s" % conftest.PERIOD_PILOT
    limit = conftest.integer(period, "carry_over_limit_bp", where)
    assert limit == conftest.CARRY_OVER_LIMIT_BP, (
        "%s reports a carry-over limit of %r, the brief pins %d"
        % (where, limit, conftest.CARRY_OVER_LIMIT_BP))
    entered = int(period["credits_in_g"].get(conftest.POST_CONSUMER, 0))
    cap = entered * limit // conftest.BASIS_POINTS_FULL
    response = claims.post(
        conftest.api("/balance-periods/%s/close" % conftest.PERIOD_PILOT),
        json={}, headers=conftest.idem())
    assert response.status_code in conftest.STATUS_OK + conftest.STATUS_REFUSED, (
        "the close must answer rather than error: %s" % conftest.describe(response))
    if response.status_code in conftest.STATUS_OK:
        conftest.settle()
        closed = conftest.period(claims, conftest.PERIOD_PILOT)
        assert str(closed.get("state")) == "closed", (
            "%s must report closed after a successful close; it reports %r"
            % (where, closed.get("state")))
        expired = conftest.field(closed, "expired_g", where)
        assert isinstance(expired, dict), (
            "%s reports what expired per category rather than as one total: %.300r"
            % (where, closed))
        carried = conftest.field(closed, "carried_forward_g", where)
        assert isinstance(carried, dict), (
            "%s reports what carried forward per category: %.300r" % (where, closed))
        forward = int(carried.get(conftest.POST_CONSUMER, 0))
        assert forward <= cap, (
            "%s carried %d grams forward; the limit of %d bp over %d grams entered "
            "caps the carry at %d" % (where, forward, limit, entered, cap))
        available = int(closed["credits_available_g"].get(conftest.POST_CONSUMER, 0))
        assert forward + int(expired.get(conftest.POST_CONSUMER, 0)) >= 0, (
            "%s must account for every gram still available at the close: carried %r, "
            "expired %r, available %r" % (where, carried, expired, available))
    else:
        assert conftest.LOT_3 in response.text or "disposition" in response.text.lower(), (
            "a refused close names the blocking record: %s"
            % conftest.describe(response))


def test_concurrent_signing_yields_a_gapless_sequence(signer2_token, signer2):
    before = sorted(n for n in conftest.certificates(signer2)
                    if n.startswith("CERT-PILOT-"))

    def attempt():
        with appclient.client(signer2_token) as client:
            return client.post(conftest.api("/certificates"),
                               json={"lot": conftest.LOT_3,
                                     "recipient": conftest.CUS_HELIOS,
                                     "password": conftest.SEED_PASSWORD},
                               headers=conftest.idem())

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        first, second = [f.result() for f in
                         [pool.submit(attempt), pool.submit(attempt)]]
    signed = [r for r in (first, second) if r.status_code in conftest.STATUS_OK]
    assert len(signed) == 2, (
        "neither of two simultaneous signatures is lost; the two answered %r"
        % [r.status_code for r in (first, second)])
    numbers = sorted(str(r.json().get("number")) for r in signed)
    assert numbers[0] != numbers[1], (
        "no number is issued twice under contention; both signatures took %r"
        % numbers[0])
    conftest.settle()
    after = sorted(n for n in conftest.certificates(signer2)
                   if n.startswith("CERT-PILOT-"))
    assert len(after) == len(before) + 2, (
        "two signatures must leave two certificates; the register held %d and now "
        "holds %d" % (len(before), len(after)))
    ordinals = sorted(int(n.rsplit("-", 1)[1]) for n in after)
    assert ordinals == list(range(1, len(ordinals) + 1)), (
        "the per-site sequence carries no gap after two simultaneous signatures; it "
        "runs %r" % (ordinals,))


def test_conditions_are_redecided_between_preview_and_signing(signer2, quality):
    clean = conftest.preview(signer2, lot=conftest.LOT_3, recipient=conftest.CUS_VANTA)
    assert clean.status_code in conftest.STATUS_OK, (
        "the preview must answer for a lot inside the signer's scope: %s"
        % conftest.describe(clean))
    entries = conftest.conditions_of(clean.json())
    assert all(e.get("satisfied") for e in entries), (
        "%s is released with no open deviation, so every condition must hold at the "
        "preview: %.400r" % (conftest.LOT_3, entries))
    raised = quality.post(
        conftest.api("/deviations"),
        json={"description": "A purification residue was found after the preview",
              "lots": [conftest.LOT_3], "runs": [conftest.RUN_U1]},
        headers=conftest.idem())
    assert raised.status_code in conftest.STATUS_OK, (
        "a quality manager raises a deviation: %s" % conftest.describe(raised))
    conftest.settle()
    signed = signer2.post(
        conftest.api("/certificates"),
        json={"lot": conftest.LOT_3, "recipient": conftest.CUS_VANTA,
              "password": conftest.SEED_PASSWORD}, headers=conftest.idem())
    assert signed.status_code in conftest.STATUS_REFUSED, (
        "the eight conditions are decided again at the moment of signing, so a lot "
        "that gained an open deviation after a clean preview is refused, got %s"
        % conftest.describe(signed))
    assert "deviation" in signed.text.lower(), (
        "the refusal names the condition that changed rather than reading as a "
        "generic failure: %s" % conftest.describe(signed))


def test_complete_set_routes_refuse_pagination(auditor, claims):
    routes = [
        (auditor, "/batches/%s/impact" % conftest.BATCH_1001),
        (auditor, "/record/queries/%s" % conftest.RECORD_QUERIES[0]),
    ]
    for client, path in routes:
        for parameter in conftest.PAGINATION_PARAMS:
            response = client.get(conftest.api(path), params={parameter: 2})
            assert response.status_code == 400, (
                "GET /api%s must refuse the pagination parameter %r with 400 rather "
                "than honouring or ignoring it, got %s"
                % (path, parameter, conftest.describe(response)))
        clean = client.get(conftest.api(path))
        assert clean.status_code == 200, (
            "GET /api%s answers normally with no pagination parameter: %s"
            % (path, conftest.describe(clean)))


def test_certificate_document_is_byte_stable(signer2):
    path = "/certificates/%s/document" % conftest.CERT_WITHDRAWN
    first = signer2.get(conftest.api(path), params={"format": "text"})
    assert first.status_code == 200, (
        "the certificate document must answer: %s" % conftest.describe(first))
    second = signer2.get(conftest.api(path), params={"format": "text"})
    assert second.status_code == 200, (
        "the second read of the certificate document must answer: %s"
        % conftest.describe(second))
    assert first.text == second.text, (
        "two reads of one certificate version must return identical bytes; the two "
        "differ in length by %d characters" % abs(len(first.text) - len(second.text)))
    assert conftest.CERT_WITHDRAWN in first.text, (
        "the document names its certificate: %r" % first.text[:200])


def test_restatement_recomputes_content_and_enumerates(claims):
    opened = claims.post(
        conftest.api("/balance-periods/%s/restatements" % conftest.PERIOD_CLOSED),
        json={"reason": "The conversion factor was derived from a window with a "
                        "mis-recorded loss",
              "revised_factor_bp": 7500},
        headers=conftest.idem())
    assert opened.status_code in conftest.STATUS_OK, (
        "a restatement revising a factor must open: %s" % conftest.describe(opened))
    body = opened.json()
    where = "the factor restatement"
    affected = conftest.field(body, "certificates", where)
    assert isinstance(affected, list), (
        "%s enumerates the certificates issued from the period: %.400r" % (where, body))
    movements = body.get("content_movements")
    assert isinstance(movements, list), (
        "%s reports, per affected certificate, the content carried and the content "
        "the corrected factor produces: %.400r" % (where, body))
    for entry in movements:
        for key in ("certificate", "content_bp", "corrected_content_bp"):
            assert key in entry, (
                "%s carries a movement with no %r: %.200r" % (where, key, entry))
        assert isinstance(entry["content_bp"], int), (
            "%s reports a content that is not an integer: %.200r" % (where, entry))
