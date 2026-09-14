import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, getSession, setSession } from "../lib/api.mjs";
import { Wizard, CertificateList, CertificateDetail } from "./wizard.mjs";
import { Collectors, Sites, Reconciliation, RecordView, Carbon, Specifications, Contracts, Change, BatchImpact } from "./console-extra.mjs";
import { link } from "../router.mjs";

export const STAGES = ["dissolution", "depolymerisation", "purification", "repolymerisation"];

const NAV = [
  ["/console", "Board"],
  ["/console/batches", "Batches"],
  ["/console/runs", "Runs"],
  ["/console/lots", "Lots"],
  ["/console/balance", "Balance"],
  ["/console/certificates", "Certificates"],
  ["/console/carbon", "Carbon"],
  ["/console/specifications", "Specifications"],
  ["/console/contracts", "Contracts"],
  ["/console/change", "Change"],
  ["/console/collectors", "Collectors"],
  ["/console/sites", "Sites"],
  ["/console/reconciliation", "Reconciliation"],
  ["/console/record", "Record"],
];

export default function ConsoleApp({ path, params, navigate }) {
  const [me, setMe] = useState(getSession() ? getSession().me : null);
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    let live = true;
    const s = getSession();
    if (!s) { setBooting(false); return; }
    api("/auth/me").then((m) => { if (live) { setMe(m); const st = getSession(); if (st) { st.me = m; sessionStorage.setItem("ravel.session", JSON.stringify(st)); } } })
      .catch((e) => { if (live && (e.status === 401 || e.status === 403)) { setSession(null); sessionStorage.removeItem("ravel.session"); setMe(null); } })
      .finally(() => live && setBooting(false));
    return () => { live = false; };
  }, []);
  if (booting) return h("div", { class: "page" }, h("main", { class: "frame" }, h("p", { class: "loading", role: "status" }, "Loading…")));
  if (!me) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") window.location.replace("/login");
    return h("p", { class: "loading", role: "status" }, "Redirecting to sign in…");
  }
  return h(ConsoleShell, { path, params, me });
}

function ConsoleShell({ path, params, me }) {
  const parts1 = path.replace(/^\/console\/?/, "").split("/");
  const section = parts1[0] || "";
  let title = "Console";
  let Body = null;
  if (path === "/console") { title = "Run board"; Body = Board; }
  else if (section === "batches") { title = "Batches"; Body = Batches; }
  else if (section === "runs") { title = "Runs"; Body = Runs; }
  else if (section === "lots") { title = "Lots"; Body = Lots; }
  else if (section === "balance") { title = "Balance periods"; Body = Balance; }
  else if (path === "/console/certificates/new/lot") { title = "Issue a certificate — the lot"; Body = WizardStep1; }
  else if (path === "/console/certificates/new/claim") { title = "Issue a certificate — the claim"; Body = WizardStep2; }
  else if (path === "/console/certificates/new/recipient") { title = "Issue a certificate — the recipient"; Body = WizardStep3; }
  else if (path === "/console/certificates/new/review") { title = "Issue a certificate — the document"; Body = WizardStep4; }
  else if (section === "certificates" && parts1[1]) { title = "Certificate"; Body = CertDetail; }
  else if (section === "certificates") { title = "Certificates"; Body = CertificateList; }
  else if (section === "carbon") { title = "Carbon"; Body = CarbonView; }
  else if (section === "specifications") { title = "Specifications"; Body = Specifications; }
  else if (section === "contracts") { title = "Contracts"; Body = Contracts; }
  else if (section === "change") { title = "Change control"; Body = Change; }
  else if (section === "collectors") { title = "Collectors"; Body = CollectorsView; }
  else if (section === "sites") { title = "Sites"; Body = SitesView; }
  else if (section === "reconciliation") { title = "Reconciliation"; Body = Reconciliation; }
  else if (section === "record") { title = "The record"; Body = RecordView; }
  else { title = "No such surface"; Body = NotFound; }
  document.title = title + " — Ravel console";
  return h("div", { class: "page console" }, [
    h("a", { class: "skip", href: "#main" }, "Skip to content"),
    h("header", { class: "topbar console-topbar" }, h("div", { class: "topbar-in" }, [
      h("a", { class: "wordmark", href: "/console", "aria-label": "Ravel console" }, "Ravel"),
      h("nav", { "aria-label": "Console" }, h("ul", { class: "nav console-nav" }, NAV.map(([href, label]) =>
        h("li", { key: href, class: path === href || (href !== "/console" && path.startsWith(href)) ? "is-here" : null },
          h("a", { href }, label))))),
      h("div", { class: "who" }, [
        h("span", { class: "who-email mono" }, me.email),
        h("span", { class: "who-role" }, me.roles.join(", ")),
        h("button", { class: "btn btn-secondary btn-small", onClick: () => { sessionStorage.removeItem("ravel.session"); setSession(null); link("/"); } }, "Sign out"),
      ]),
    ])),
    h("main", { id: "main", class: "frame frame-wide console-main" }, h(Body, { path, params, me })),
  ]);
}

/* ------------------------------------------------------------------ board */
function Board({ me }) {
  const [runs, setRuns] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api("/runs").then(setRuns).catch(setErr); }, []);
  return h("div", null, [
    h("h1", { class: "h2" }, "Run board"),
    h("p", { class: "quiet" }, "One column per process stage, one card per run. A closed run is frozen and writes nothing more."),
    err ? h("div", { class: "banner banner-refused", role: "alert" }, h("p", null, "The run board could not be read.")) : null,
    runs === null && !err ? h("p", { class: "loading", role: "status" }, "Loading…") : null,
    runs ? h("div", { class: "board" }, STAGES.map((stage) => {
      const cards = runs.filter((r) => r.run_type === stage);
      return h("section", { class: "board-col", key: stage, "aria-labelledby": "col-" + stage }, [
        h("h2", { class: "board-col-h", id: "col-" + stage }, stage),
        cards.length === 0 ? h("p", { class: "empty" }, "No runs at this stage.") : null,
        cards.map((r) => h("a", { class: "board-card", key: r.reference, href: "/console/runs/" + r.reference }, [
          h("p", { class: "board-ref mono" }, r.reference),
          h("p", { class: "board-site" }, [r.site, " · ", r.state === "closed" ? "closed" : r.state]),
          r.losses_g !== null && r.losses_g !== undefined ? h("p", { class: "board-mass mono" }, "losses " + r.losses_g.toLocaleString("en-GB") + " g") : null,
          r.flags && r.flags.length ? h("p", { class: "state-word" }, r.flags.join(", ")) : null,
        ])),
      ]);
    })) : null,
  ]);
}

/* ------------------------------------------------------------------ batches */
function Batches({ path, params }) {
  const parts = params && params.rest ? params.rest.replace(/^\//, "").split("/") : [];
  const ref = parts[1];
  if (parts[0] === "batches" && parts[2] === "impact") return h(BatchImpact, { ref: parts[1] });
  if (parts[0] === "batches" && ref) return h(BatchDetail, { batchRef: ref });
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api("/batches").then(setRows).catch(setErr); }, []);
  return h("div", null, [
    h("h1", { class: "h2" }, "Batch register"),
    err ? h("div", { class: "banner banner-refused", role: "alert" }, h("p", null, "The register could not be read.")) : null,
    rows === null && !err ? h("p", { class: "loading", role: "status" }, "Loading…") : null,
    rows && rows.length === 0 ? h("p", { class: "empty" }, "No batches have been booked in.") : null,
    rows && rows.length ? h("div", { class: "paper table-scroll" }, h("table", { class: "table" }, [
      h("thead", null, h("tr", null, ["Reference", "Collector", "Category", "Received", "Net (g)", "Dry (g)", "Claimable"].map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", null, rows.map((b) => h("tr", { key: b.reference }, [
        h("th", { scope: "row" }, h("a", { href: "/console/batches/" + b.reference }, b.reference)),
        h("td", null, b.collector_name),
        h("td", null, b.category.replace("_", " ")),
        h("td", { class: "mono" }, b.received_on),
        h("td", { class: "mono" }, b.net_g.toLocaleString("en-GB")),
        h("td", { class: "mono" }, b.dry_mass_g.toLocaleString("en-GB")),
        h("td", null, b.claimable ? "claimable" : h("span", { class: "state-word" }, "non-claimable: " + b.claimable_reason)),
      ]))),
    ])) : null,
  ]);
}

function BatchDetail({ batchRef }) {
  const [b, setB] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api("/batches/" + batchRef).then(setB).catch(setErr); }, [batchRef]);
  if (err) return h("div", null, [h("h1", { class: "h2" }, "Batch"), h("p", { class: "empty" }, "No batch with this reference.")]);
  if (!b) return h("p", { class: "loading", role: "status" }, "Loading…");
  return h("div", null, [
    h("h1", { class: "h2" }, [h("span", { class: "mono" }, b.reference)]),
    b.claimable ? null : h("div", { class: "banner banner-refused", role: "status" }, [
      h("p", { class: "banner-title" }, "Non-claimable"),
      h("p", null, b.claimable_reason === "collector_approval_lapsed"
        ? "This collector's approval lapsed on " + (b.approval_valid_to || "its end date") + ". Material received after that date is processed but not claimed."
        : "This batch cannot be claimed: " + (b.claimable_reason || "missing evidence") + "."),
    ]),
    b.flags && b.flags.length ? h("div", { class: "banner" }, [h("p", { class: "banner-title" }, "Flags"), h("p", null, b.flags.join(", "))]) : null,
    h("dl", { class: "kv" }, [
      ["Collector", b.collector_name],
      ["Category", b.category.replace("_", " ")],
      ["Received on", b.received_on],
      ["Site", b.site],
      ["Gross (g)", b.gross_g],
      ["Tare (g)", b.tare_g],
      ["Net (g)", b.net_g],
      ["Moisture (bp)", b.moisture_bp],
      ["Dry mass (g)", b.dry_mass_g],
      ["Device", b.device],
    ].map(([t, d]) => h("div", { class: "kv-row", key: t }, [h("dt", null, t), h("dd", { class: "mono" }, String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ","))]))),
    b.composition && b.composition.length ? h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "Composition"),
      h("table", { class: "table" }, [
        h("thead", null, h("tr", null, ["Polymer", "Basis", "Fraction (bp)", "Measured (bp)"].map((c) => h("th", { scope: "col" }, c)))),
        h("tbody", null, b.composition.map((c, i) => h("tr", { key: i }, [
          h("th", { scope: "row" }, c.polymer), h("td", null, c.basis),
          h("td", { class: "mono" }, c.fraction_bp), h("td", { class: "mono" }, c.measured_fraction_bp === undefined ? "—" : c.measured_fraction_bp),
        ]))),
      ]),
    ]) : null,
    b.custody && b.custody.length ? h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "Custody"),
      h("ol", { class: "custody" }, b.custody.map((c, i) => h("li", { key: i }, [h("span", { class: "mono" }, c.kind), " ", c.date, " ", c.party || ""]))),
    ]) : null,
    h("p", null, h("a", { href: "/console/batches/" + b.reference + "/impact" }, "Impact of this batch: every lot, certificate and recipient")),
  ]);
}

/* ------------------------------------------------------------------ runs */
function Runs({ path, params }) {
  const ref = params && params.rest ? params.rest.replace(/^\//, "").split("/")[0] : null;
  if (parts[0] === "runs" && parts[1]) return h(RunDetail, { runRef: parts[1] });
  const [rows, setRows] = useState(null);
  useEffect(() => { api("/runs").then(setRows).catch(() => setRows([])); }, []);
  return h("div", null, [
    h("h1", { class: "h2" }, "Run register"),
    rows === null ? h("p", { class: "loading", role: "status" }, "Loading…")
      : rows.length === 0 ? h("p", { class: "empty" }, "No runs have been opened.")
      : h("div", { class: "paper table-scroll" }, h("table", { class: "table" }, [
          h("thead", null, h("tr", null, ["Reference", "Stage", "Site", "Recipe", "State", "Losses (g)"].map((c) => h("th", { scope: "col" }, c)))),
          h("tbody", null, rows.map((r) => h("tr", { key: r.reference }, [
            h("th", { scope: "row" }, h("a", { href: "/console/runs/" + r.reference }, r.reference)),
            h("td", null, r.run_type), h("td", null, r.site), h("td", { class: "mono" }, r.recipe_version),
            h("td", null, r.state), h("td", { class: "mono" }, r.losses_g === null || r.losses_g === undefined ? "—" : r.losses_g.toLocaleString("en-GB")),
          ]))),
        ])),
  ]);
}

function RunDetail({ runRef }) {
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api("/runs/" + runRef).then(setR).catch(setErr); }, [runRef]);
  if (err) return h("div", null, h("p", { class: "empty" }, "No run with this reference."));
  if (!r) return h("p", { class: "loading", role: "status" }, "Loading…");
  return h("div", null, [
    h("h1", { class: "h2" }, [h("span", { class: "mono" }, r.reference)]),
    r.state === "closed" ? h("div", { class: "banner" }, h("p", null, "This run is closed. A closed run refuses every write.")) : null,
    r.within_tolerance === false ? h("div", { class: "banner banner-refused", role: "status" }, h("p", null, "This run finished outside its recipe tolerance and carries a deviation.")) : null,
    h("div", { class: "cols" }, [
      h("dl", { class: "kv" }, [
        ["Stage", r.run_type], ["Site", r.site], ["Recipe version", r.recipe_version], ["Equipment", r.equipment],
        ["Started", r.started_at], ["Closed", r.closed_at || "—"], ["Losses (g)", r.losses_g === null || r.losses_g === undefined ? "—" : r.losses_g.toLocaleString("en-GB")],
        ["Within tolerance", r.within_tolerance === undefined ? "—" : String(r.within_tolerance)],
].map(([t, d]) => h("div", { class: "kv-row", key: t }, [h("dt", null, t), h("dd", { class: "mono" }, d)]))),
    ]),
    r.consumptions && r.consumptions.length ? h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "Consumptions"),
      h("ul", { class: "plain" }, r.consumptions.map((c) => h("li", { key: c.reference }, [h("span", { class: "mono" }, c.input), " ", c.mass_g.toLocaleString("en-GB"), " g"]))),
    ]) : null,
    r.outputs && r.outputs.length ? h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "Outputs"),
      h("ul", { class: "plain" }, r.outputs.map((o) => h("li", { key: o.reference }, [h("span", { class: "mono" }, o.reference), " ", o.kind, " ", o.mass_g.toLocaleString("en-GB"), " g", o.disposition ? " (" + o.disposition + ")" : ""]))),
    ]) : null,
  ]);
}

/* ------------------------------------------------------------------ lots */
function Lots({ path, params }) {
  const parts = params && params.rest ? params.rest.replace(/^\//, "").split("/") : [];
  if (parts[0] === "lots" && parts[1] && parts[2] === "genealogy") return h(Genealogy, { lotRef: parts[1] });
  if (parts[0] === "lots" && parts[1]) return h(LotDetail, { lotRef: parts[1] });
  const [rows, setRows] = useState(null);
  useEffect(() => { api("/lots").then(setRows).catch(() => setRows([])); }, []);
  return h("div", null, [
    h("h1", { class: "h2" }, "Lot register"),
    rows === null ? h("p", { class: "loading", role: "status" }, "Loading…")
      : rows.length === 0 ? h("p", { class: "empty" }, "No lots have been produced.")
      : h("div", { class: "paper table-scroll" }, h("table", { class: "table" }, [
          h("thead", null, h("tr", null, ["Reference", "Grade", "Site", "Mass (g)", "Disposition", "Claim type"].map((c) => h("th", { scope: "col" }, c)))),
          h("tbody", null, rows.map((l) => h("tr", { key: l.reference }, [
            h("th", { scope: "row" }, h("a", { href: "/console/lots/" + l.reference }, l.reference)),
            h("td", null, l.grade), h("td", null, l.site),
            h("td", { class: "mono" }, l.mass_g.toLocaleString("en-GB")),
            h("td", null, l.disposition),
            h("td", null, l.claim_type ? l.claim_type.replace(/_/g, " ") : "—"),
          ]))),
        ])),
  ]);
}

function LotDetail({ lotRef }) {
  const [l, setL] = useState(null);
  const [carbon, setCarbon] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api("/lots/" + lotRef).then(setL).catch(setErr);
    api("/lots/" + lotRef + "/carbon").then(setCarbon).catch(() => setCarbon(null));
  }, [lotRef]);
  if (err) return h("p", { class: "empty" }, "No lot with this reference.");
  if (!l) return h("p", { class: "loading", role: "status" }, "Loading…");
  return h("div", null, [
    h("h1", { class: "h2" }, [h("span", { class: "mono" }, l.reference)]),
    l.disposition === "quarantined" ? h("div", { class: "banner banner-refused", role: "status" }, h("p", null, "This lot is quarantined.")) : null,
    l.overrides && l.overrides.length ? h("div", { class: "banner banner-refused", role: "status" }, [
      h("p", { class: "banner-title" }, "Unreviewed override"),
      h("p", null, "Separation overridden by " + l.overrides[0].authorised_by + " on " + l.overrides[0].authorised_on + ". This cannot be removed."),
    ]) : null,
    h("div", { class: "cols" }, [
      h("dl", { class: "kv" }, [
        ["Grade", l.grade], ["Site", l.site], ["Mass (g)", l.mass_g.toLocaleString("en-GB")], ["Disposition", l.disposition],
        ["Claim type", l.claim_type ? l.claim_type.replace(/_/g, " ") : "—"],
      ].map(([t, d]) => h("div", { class: "kv-row", key: t }, [h("dt", null, t), h("dd", { class: "mono" }, d)]))),
      carbon && !carbon.error ? h(CarbonCard, { carbon }) : h("p", { class: "quiet" }, "No carbon figure for this lot."),
    ]),
    h("p", null, h("a", { href: "/console/lots/" + l.reference + "/genealogy" }, "Genealogy of this lot: graph and nested list")),
  ]);
}

export function CarbonCard({ carbon }) {
  return h("div", { class: "paper" }, [
    h("h2", { class: "h4" }, "Carbon"),
    h("p", null, [
      h("span", { class: "mono" }, carbon.value_mg_per_kg.toLocaleString("en-GB")), " mg CO2e per kg",
      " · boundary ", carbon.boundary,
      " · method ", h("span", { class: "mono" }, carbon.method_version),
      " · uncertainty ", h("span", { class: "mono" }, carbon.uncertainty_bp), " bp",
    ]),
    h("p", { class: "quiet" }, [
      "Comparator: ", carbon.comparator.material, " from ", carbon.comparator.dataset, " ", carbon.comparator.dataset_year, " (", carbon.comparator.region, ").",
      carbon.comparator && carbon.value_mg_per_kg < carbon.comparator.value_mg_per_kg ? " This figure is lower than " + carbon.comparator.material + "." : "",
    ]),
    carbon.breakdown && carbon.breakdown.length ? h("table", { class: "table" }, [
      h("thead", null, h("tr", null, ["Line", "mg per kg", "Tag"].map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", null, carbon.breakdown.map((b) => h("tr", { key: b.line }, [h("th", { scope: "row", class: "mono" }, b.line), h("td", { class: "mono" }, b.mg_per_kg.toLocaleString("en-GB")), h("td", null, b.tag)]))),
    ]) : null,
    carbon.energy_location_mg_per_kg !== undefined ? h("p", { class: "quiet" }, [
      "Energy: location-based ", h("span", { class: "mono" }, carbon.energy_location_mg_per_kg.toLocaleString("en-GB")),
      " and market-based ", h("span", { class: "mono" }, carbon.energy_market_mg_per_kg.toLocaleString("en-GB")),
      " mg CO2e per kg · metered ", h("span", { class: "mono" }, carbon.metered_kwh), " kWh · retired ", h("span", { class: "mono" }, carbon.retired_kwh), " kWh · unmatched ", h("span", { class: "mono" }, carbon.unmatched_kwh), " kWh",
    ]) : null,
  ]);
}

function Genealogy({ lotRef }) {
  const [g, setG] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api("/lots/" + lotRef + "/genealogy").then(setG).catch(setErr); }, [lotRef]);
  if (err) return h("p", { class: "empty" }, "No genealogy for this reference.");
  if (!g) return h("p", { class: "loading", role: "status" }, "Loading…");
  return h("div", null, [
    h("h1", { class: "h2" }, ["Genealogy of ", h("span", { class: "mono" }, lotRef)]),
    g.flagged ? h("div", { class: "banner banner-refused", role: "status" }, h("p", null, "Something in this graph carries a flag. Each flagged node says which.")) : null,
    h("div", { class: "genealogy-split" }, [
      h("section", { class: "paper", "aria-labelledby": "gg" }, [
        h("h2", { class: "h4", id: "gg" }, "Graph"),
        h("ul", { class: "gnodes" }, g.nodes.map((n) => h("li", { key: n.kind + n.reference, class: "gnode kind-" + n.kind }, [
          h("p", { class: "gnode-ref mono" }, n.reference),
          h("p", { class: "gnode-meta" }, [n.kind, " · ", n.mass_g.toLocaleString("en-GB"), " g"]),
          n.category_split ? h("p", { class: "gnode-split mono" }, Object.entries(n.category_split).filter(([, v]) => v > 0).map(([k, v]) => k.replace(/_/g, " ") + " " + v.toLocaleString("en-GB") + " g").join(" · ")) : null,
          n.flags && n.flags.length ? h("p", { class: "state-word" }, n.flags.join(", ")) : null,
        ]))),
      ]),
      h("section", { class: "paper", "aria-labelledby": "gl" }, [
        h("h2", { class: "h4", id: "gl" }, "The same facts as a nested list"),
        h(ListNode, { node: g.text_equivalent }),
      ]),
    ]),
    h("p", { class: "quiet" }, "Export this genealogy from the record surface; every export is itself an entry."),
  ]);
}

function ListNode({ node }) {
  return h("ul", { class: "glist" }, node.children && node.children.map((c) => h("li", { key: c.reference + c.kind }, [
    h("p", { class: "glist-row" }, [
      h("span", { class: "mono" }, c.reference),
      " ", c.kind,
      " ", h("span", { class: "mono" }, c.mass_g.toLocaleString("en-GB") + " g"),
      c.flags && c.flags.length ? h("span", { class: "state-word" }, " · " + c.flags.join(", ")) : null,
    ]),
    c.children && c.children.length ? h(ListNode, { node: c }) : null,
  ])));
}

/* ------------------------------------------------------------------ balance */
function Balance({ path, params }) {
  const parts = params && params.rest ? params.rest.replace(/^\//, "").split("/") : [];
  if (parts[1]) return h(BalanceDetail, { id: parts[1] });
  const [rows, setRows] = useState(null);
  useEffect(() => { api("/balance-periods").then(setRows).catch(() => setRows([])); }, []);
  return h("div", null, [
    h("h1", { class: "h2" }, "Balance periods"),
    rows === null ? h("p", { class: "loading", role: "status" }, "Loading…")
      : rows.length === 0 ? h("p", { class: "empty" }, "No balance periods.")
      : h("div", { class: "paper table-scroll" }, h("table", { class: "table" }, [
          h("thead", null, h("tr", null, ["Period", "Site", "Grade", "Window", "State"].map((c) => h("th", { scope: "col" }, c)))),
          h("tbody", null, rows.map((p) => h("tr", { key: p.id }, [
            h("th", { scope: "row" }, h("a", { href: "/console/balance/" + p.id }, p.id)),
            h("td", null, p.site), h("td", null, p.grade),
            h("td", { class: "mono" }, p.period_from + " to " + p.period_to),
            h("td", null, p.state === "closed" ? "closed" : p.state),
          ]))),
        ])),
  ]);
}

function BalanceDetail({ id }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState({ lot: "LOT-N6-0001", category: "post_consumer", mass_g: "" });
  const [result, setResult] = useState(null);
  useEffect(() => { api("/balance-periods/" + id).then(setP).catch(setErr); }, [id]);
  async function allocate(e) {
    e.preventDefault();
    setResult({ kind: "sending" });
    try {
      const r = await api("/balance-periods/" + id + "/allocations", { method: "POST", body: { lot: form.lot, category: form.category, mass_g: Number(form.mass_g) }, idempotencyKey: "alloc-" + Math.random().toString(36).slice(2, 12) });
      setResult({ kind: "ok", reference: r.reference });
      const again = await api("/balance-periods/" + id); setP(again);
    } catch (e2) {
      setResult({ kind: "refused", available_g: e2.body && e2.body.available_g, requested_g: e2.body && e2.body.requested_g, message: e2.message });
    }
  }
  if (err) return h("p", { class: "empty" }, "No balance period with this id.");
  if (!p) return h("p", { class: "loading", role: "status" }, "Loading…");
  const cat = (c) => {
    const k = p[c] || {};
    return h("div", { class: "paper cat-card", key: c }, [
      h("h3", { class: "h4" }, c.replace(/_/g, " ")),
      figure("Credits in", k.credits_in_g),
      figure("Credits out", k.credits_out_g),
      figure("Credits available", k.credits_available_g),
    ]);
  };
  return h("div", null, [
    h("h1", { class: "h2" }, [h("span", { class: "mono" }, p.id)]),
    p.state === "closed" ? h("div", { class: "banner" }, h("p", null, "This period is closed. Corrections require a restatement.")) : null,
    h("p", { class: "quiet" }, p.site + " · " + p.grade + " · " + p.period_from + " to " + p.period_to + (p.state === "closed" ? " · closed on " + p.closed_on + ", cut-off " + p.cut_off : "")),
    h("div", { class: "balance-grid" }, [cat("post_consumer"), cat("pre_consumer")]),
    h("div", { class: "cols" }, [
      h("div", { class: "paper" }, [
        h("h2", { class: "h4" }, "Counts"),
        h("ul", { class: "plain" }, [
          h("li", null, "Overrides this period: " + p.override_count),
          h("li", null, "Open restatements: " + p.open_restatement_count),
          h("li", null, "Audit findings past their date: " + p.open_finding_count),
          h("li", null, "Non-claimable input: " + p.non_claimable_input_g.toLocaleString("en-GB") + " g"),
        ]),
      ]),
      h("div", { class: "paper" }, [
        h("h2", { class: "h4" }, "Conversion factors in force"),
        (p.conversion_factors || []).map((f) => h("p", { key: f.reference }, [
          h("span", { class: "mono" }, f.reference), " · ", h("span", { class: "mono" }, f.factor_bp), " bp", f.provisional ? " · provisional" : "", " · window ", f.derived_from, " to ", f.derived_to,
        ])),
        h("p", { class: "quiet" }, "Carry-over limit " + p.carry_over_limit_bp + " bp."),
      ]),
    ]),
    h("section", { class: "paper", "aria-labelledby": "alh" }, [
      h("h2", { class: "h4", id: "alh" }, "Allocate claim to a lot"),
      h("form", { class: "form form-row", onSubmit: allocate }, [
        h("label", { class: "field" }, [h("span", { class: "lab" }, "Lot"), h("select", { value: form.lot, onChange: (e) => setForm(Object.assign({}, form, { lot: e.target.value })) }, ["LOT-N6-0001", "LOT-N6-0002", "LOT-N6-0003"].map((l) => h("option", { value: l }, l)))]),
        h("label", { class: "field" }, [h("span", { class: "lab" }, "Category"), h("select", { value: form.category, onChange: (e) => setForm(Object.assign({}, form, { category: e.target.value })) }, h("option", { value: "post_consumer" }, "post consumer"), h("option", { value: "pre_consumer" }, "pre consumer"))]),
        h("label", { class: "field" }, [h("span", { class: "lab" }, "Mass (g)"), h("input", { type: "number", min: "1", step: "1", value: form.mass_g, onInput: (e) => setForm(Object.assign({}, form, { mass_g: e.target.value })) })]),
        h("button", { class: "btn btn-primary", type: "submit" }, "Allocate"),
      ]),
      result && result.kind === "refused" ? h("div", { class: "banner banner-refused", role: "alert" }, [
        h("p", { class: "banner-title" }, "This allocation is refused."),
        h("p", null, "Available: " + (result.available_g !== undefined ? result.available_g.toLocaleString("en-GB") : "?") + " g. Requested: " + (result.requested_g !== undefined ? result.requested_g.toLocaleString("en-GB") : "?") + " g."),
        h("p", { class: "quiet" }, "The figures on the screen are unchanged. No credit has moved."),
      ]) : null,
      result && result.kind === "ok" ? h("div", { class: "banner" }, h("p", null, ["Allocation recorded as ", h("span", { class: "mono" }, result.reference), "."])) : null,
    ]),
  ]);
}

function figure(label, v) {
  return h("div", { class: "fig" }, [
    h("p", { class: "fig-value" }, [h("span", { class: "mono" }, v === null || v === undefined ? "—" : v.toLocaleString("en-GB")), " g"]),
    h("p", { class: "fig-label" }, label),
  ]);
}

function WizardStep1(p) { return h(Wizard, Object.assign({ step: "lot" }, p)); }
function WizardStep2(p) { return h(Wizard, Object.assign({ step: "claim" }, p)); }
function WizardStep3(p) { return h(Wizard, Object.assign({ step: "recipient" }, p)); }
function WizardStep4(p) { return h(Wizard, Object.assign({ step: "review" }, p)); }
function CertDetail({ params, me }) {
  const segs = params && params.rest ? params.rest.replace(/^\//, "").split("/") : [];
  const num = segs[0] === "certificates" ? segs[1] : segs[0];
  return h(CertificateDetail, { number: num || "", me });
}
function CollectorsView(p) { return h(Collectors, p); }
function SitesView(p) { return h(Sites, p); }
function CarbonView(p) { return h(Carbon, p); }
function NotFound() { return h("div", null, [h("h1", { class: "h2" }, "No such surface"), h("p", { class: "empty" }, "The address does not name a console surface.")]); }
