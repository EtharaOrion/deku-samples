import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, randomKey } from "../lib/api.mjs";
import { Loading, Empty, Banner, Ref } from "../lib/ui.mjs";

export function Collectors({ me }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api("/collectors").then(setRows).catch(() => setRows([])); }, []);
  const mayApprove = me.roles.includes("quality_manager");
  return h("div", null, [
    h("h1", { class: "h2" }, "Collectors"),
    h("p", { class: "quiet" }, "An approval is a dated period, so what was true last March has an answer. A grant inside fourteen days of its expiry is reported as expiring."),
    rows === null ? h(Loading) : rows.length === 0 ? h(Empty, "No collectors.") :
    h("div", { class: "cards" }, rows.map((c) => h("div", { class: "card", key: c.reference }, [
      h("h2", { class: "h4" }, [c.name, " ", h(Ref, { value: c.reference })]),
      h("p", { class: "quiet" }, c.country + " · " + c.registration + " · registration expires " + c.registration_expiry),
      h("p", null, "Approval periods"),
      h("ul", { class: "plain" }, c.approval_periods.map((p, i) => h("li", { key: i }, [
        h("span", { class: "state-word" }, p.state),
        " ", p.valid_from, " to ", p.valid_to,
        p.expiring ? h("span", { class: "state-word" }, " · expiring") : null,
        p.condition ? h("span", { class: "quiet" }, " — " + p.condition + ", closes by " + p.condition_closes_on) : null,
      ]))),
      c.findings.length ? h("p", null, [h("span", { class: "state-word" }, "findings open: " + c.findings.filter((f) => f.state === "open").length), " — " + c.findings.map((f) => f.reason).join("; ")]) : null,
      mayApprove ? h("p", { class: "quiet" }, "Add a period at POST /api/collectors/" + c.reference + "/approvals — refused for anybody but a quality manager.") : null,
    ]))),
  ]);
}

export function Sites({ me }) {
  const [rows, setRows] = useState(null);
  const [caps, setCaps] = useState({});
  useEffect(() => {
    api("/sites").then(async (s) => {
      setRows(s);
      const out = {};
      for (const x of s) out[x.reference] = await api("/sites/" + x.reference + "/capacity").catch(() => null);
      setCaps(out);
    });
  }, []);
  return h("div", null, [
    h("h1", { class: "h2" }, "Sites and capacity"),
    rows === null ? h(Loading) :
    h("div", { class: "cards" }, rows.map((s) => {
      const cap = caps[s.reference];
      return h("div", { class: "card", key: s.reference }, [
        h("h2", { class: "h4" }, [s.name, " ", h(Ref, { value: s.reference })]),
        h("p", null, ["Certification: ", s.certification_state]),
        cap ? h("dl", { class: "kv" }, [
          ["Nameplate (kg/yr)", cap.nameplate_kg.toLocaleString("en-GB")],
          ["Contracted (kg/yr)", cap.contracted_kg.toLocaleString("en-GB")],
          ["Uncommitted (kg/yr)", cap.uncommitted_kg.toLocaleString("en-GB")],
          ["Confidence", cap.confidence],
          ["Basis", cap.basis],
          ["Last revised", cap.last_revised],
        ].map(([t, d]) => h("div", { class: "kv-row", key: t }, [h("dt", null, t), h("dd", { class: "mono" }, String(d))]))) : h(Loading),
        cap && cap.confidence === "planned" ? h("p", null, h("span", { class: "state-word" }, "planned — the flag cannot be dismissed")) : null,
      ]);
    })),
  ]);
}

export function Reconciliation() {
  const [r, setR] = useState(null);
  useEffect(() => { api("/reconciliation").then(setR).catch(() => setR(null)); }, []);
  if (!r) return h("div", null, [h("h1", { class: "h2" }, "Reconciliation"), h(Loading)]);
  const rows = [
    ["Mass balance residual (g)", r.mass_balance_residual_g],
    ["Credit margin (g)", r.credit_margin_g],
    ["Consumptions on open runs", r.consumptions_on_open_runs],
    ["Batches with broken custody", r.batches_with_broken_custody],
    ["Certificates with superseded figures", r.certificates_with_superseded_figures],
  ];
  return h("div", null, [
    h("h1", { class: "h2" }, "Reconciliation"),
    h("p", { class: "quiet" }, "Six figures, none a verdict. Read at " + r.read_at + "."),
    h("div", { class: "paper" }, h("table", { class: "table" }, [
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Figure"), h("th", { scope: "col" }, "Value"))),
      h("tbody", null, rows.map(([t, v]) => h("tr", { key: t }, [h("th", { scope: "row" }, t), h("td", { class: "mono" }, (v === null || v === undefined) ? "null" : v.toLocaleString("en-GB"))]))),
    ])),
    h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "Integration ages"),
      h("table", { class: "table" }, [
        h("thead", null, h("tr", null, h("th", { scope: "col" }, "Source"), h("th", { scope: "col" }, "Most recent"), h("th", { scope: "col" }, "Age (hours)"))),
        h("tbody", null, r.integration_ages.map((a) => h("tr", { key: a.source }, [
          h("th", { scope: "row" }, a.source),
          h("td", { class: "mono" }, a.most_recent ? String(a.most_recent).slice(0, 19).replace("T", " ") : "never sent"),
          h("td", { class: "mono" }, a.age_hours === null ? "null" : a.age_hours),
        ]))),
      ]),
      h("p", { class: "quiet" }, "A source that stops sending is detected by that age rather than by an error; a source that has never sent reports null rather than zero."),
    ]),
  ]);
}

export function RecordView({ me }) {
  const [rows, setRows] = useState(null);
  const [check, setCheck] = useState(null);
  const [query, setQuery] = useState("lots_from_batch");
  const [q, setQ] = useState(null);
  useEffect(() => {
    api("/record").then(setRows).catch(() => setRows([]));
    api("/record/check").then(setCheck).catch(() => setCheck(null));
  }, []);
  useEffect(() => { api("/record/queries/" + query).then(setQ).catch(() => setQ(null)); }, [query]);
  const names = ["lots_from_batch","certificates_on_period","certificates_under_method_version","lots_released_under_unreviewed_override","allocations_in_final_fortnight","refused_allocations","collector_declaration_departures","acts_by_person","exports_by_auditor"];
  return h("div", null, [
    h("h1", { class: "h2" }, "The record"),
    check ? h(Banner, { tone: check.holds ? "ok" : "refused", title: check.holds ? "The chain holds" : "The chain breaks" },
      h("p", null, check.holds ? "Every digest verifies against the previous entry's digest, and the sequence has no gap." : "It breaks at position " + check.first_failure.position + ": " + check.first_failure.reason + ".")) : h(Loading),
    h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "The nine questions"),
      h("label", { class: "field" }, [h("span", { class: "lab" }, "Question"), h("select", { value: query, onChange: (e) => setQuery(e.target.value) }, names.map((n) => h("option", { value: n }, n)))]),
      !q ? h(Loading) : h("pre", { class: "json" }, JSON.stringify(q.entries, null, 1)),
      q ? h("p", { class: "quiet" }, "A complete set, never a page. Read at " + q.read_at + ".") : null,
    ]),
    rows === null ? h(Loading) : rows.length === 0 ? h(Empty, "The record is empty.") :
    h("div", { class: "paper table-scroll" }, h("table", { class: "table" }, [
      h("thead", null, h("tr", null, ["Seq", "At", "Act", "Person", "Object", "Digest"].map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", null, rows.map((e) => h("tr", { key: e.seq }, [
        h("th", { scope: "row", class: "mono" }, e.seq),
        h("td", { class: "mono" }, String(e.at).slice(0, 10)),
        h("td", null, [e.act, e.refused ? h("span", { class: "state-word" }, " (refused: " + e.refused + ")") : null]),
        h("td", { class: "mono" }, e.person || "—"),
        h("td", { class: "mono" }, e.object || "—"),
        h("td", { class: "mono" }, e.digest ? e.digest.slice(0, 10) + "…" : "—"),
      ]))),
    ])),
  ]);
}

export function Carbon() {
  const [methods, setMethods] = useState(null);
  const [lots, setLots] = useState(null);
  const [figures, setFigures] = useState({});
  useEffect(() => { api("/carbon-methods").then(setMethods).catch(() => setMethods([])); }, []);
  useEffect(() => {
    api("/lots").then(async (ls) => {
      setLots(ls);
      const out = {};
      for (const l of ls) out[l.reference] = await api("/lots/" + l.reference + "/carbon").catch(() => null);
      setFigures(out);
    }).catch(() => setLots([]));
  }, []);
  return h("div", null, [
    h("h1", { class: "h2" }, "Carbon"),
    h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "Method versions"),
      methods === null ? h(Loading) : methods.length === 0 ? h(Empty, "No carbon methods published.") :
      h("div", { class: "cards" }, methods.map((m) => h("div", { class: "card", key: m.id + m.version }, [
        h("h3", { class: "h4" }, [h(Ref, { value: m.id + " v" + m.version }), m.superseded ? h("span", { class: "state-word" }, " superseded by v" + m.superseded_by) : null]),
        h("p", { class: "quiet" }, m.standard + " · " + m.functional_unit + " · " + m.boundary + " · allocation " + m.allocation_basis),
        h("p", { class: "quiet" }, "Reviewer " + m.reviewer + ", published " + m.published_on + " by " + m.published_by + "."),
        h("p", null, "Emission factors: " + (m.emission_factors || []).map((f) => f.line + " (" + f.source + ", " + f.year + ")").join("; ")),
      ]))),
    ]),
    h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "Figures by lot"),
      lots === null ? h(Loading) : lots.map((l) => {
        const f = figures[l.reference];
        return h("div", { key: l.reference }, [
          h("p", null, [h(Ref, { value: l.reference }), " — ", f ? h("span", null, [
            h("span", { class: "mono" }, f.value_mg_per_kg.toLocaleString("en-GB")), " mg CO2e per kg · boundary " + f.boundary + " · method " + f.method_version + " · uncertainty " + f.uncertainty_bp + " bp",
            f.default_led ? h("span", { class: "state-word" }, " · default-led") : null,
          ]) : h("span", { class: "quiet" }, "no figure")]),
        ]);
      }),
      h("p", { class: "quiet" }, "A carbon value never appears without its boundary, its method version and its uncertainty, and the two energy figures never appear apart."),
    ]),
    h(EnergyPanel),
  ]);
}

function EnergyPanel() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api("/energy-instruments").then(setRows).catch(() => setRows([])); }, []);
  return h("div", { class: "paper" }, [
    h("h2", { class: "h4" }, "Energy instruments"),
    rows === null ? h(Loading) : h("table", { class: "table" }, [
      h("thead", null, h("tr", null, ["Instrument", "kWh", "Vintage", "Region", "State"].map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", null, rows.map((i) => h("tr", { key: i.reference }, [
        h("th", { scope: "row", class: "mono" }, i.reference),
        h("td", { class: "mono" }, i.quantity_kwh.toLocaleString("en-GB")),
        h("td", { class: "mono" }, i.vintage),
        h("td", { class: "mono" }, i.region),
        h("td", null, h("span", { class: "state-word" }, i.state)),
      ]))),
    ]),
  ]);
}

export function Specifications() {
  const [v3, setV3] = useState(null);
  const [v2, setV2] = useState(null);
  const [customers, setCustomers] = useState([]);
  useEffect(() => {
    api("/specifications/SPEC-N6/versions/3").then(setV3).catch(() => setV3(null));
    api("/specifications/SPEC-N6/versions/2").then(setV2).catch(() => setV2(null));
    api("/customers/CUS-HELIOS").then((c) => setCustomers([c])).catch(() => {});
    api("/customers/CUS-VANTA").then((c) => setCustomers((x) => x.concat([c]))).catch(() => {});
  }, []);
  return h("div", null, [
    h("h1", { class: "h2" }, "Specifications"),
    [v3, v2].map((s, i) => s ? h("div", { class: "paper", key: s.version }, [
      h("h2", { class: "h4" }, [h(Ref, { value: s.grade + " v" + s.version }), s.superseded ? h("span", { class: "state-word" }, " superseded") : null]),
      h("p", { class: "quiet" }, "Issued " + s.issued_on + ". Virgin reference: " + s.virgin_reference + ", from " + s.virgin_reference_source + ", dated " + s.virgin_reference_date + "."),
      h("table", { class: "table" }, [
        h("thead", null, h("tr", null, ["Property", "Method", "Limit", "Unit", "Basis"].map((c) => h("th", { scope: "col" }, c)))),
        h("tbody", null, s.rows.map((r) => h("tr", { key: r.property }, [
          h("th", { scope: "row", class: "mono" }, r.property), h("td", null, r.method),
          h("td", { class: "mono" }, r.limit), h("td", null, r.unit), h("td", null, r.basis),
        ]))),
      ]),
    ]) : null),
    h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "Customers"),
      customers.length === 0 ? h(Loading) : h("div", { class: "cards" }, customers.map((c) => c ? h("div", { class: "card", key: c.reference }, [
        h("h3", { class: "h4" }, [c.reference, " · ", h("span", { class: "quiet" }, c.industry)]),
        h("p", null, "Holds " + c.holds_specification_version.grade + " v" + c.holds_specification_version.version + " for " + c.application + "."),
        h("p", { class: "quiet" }, "Conformance: " + c.conformance.map((x) => x.outcome + " (" + x.trials.length + " trials)").join("; ")),
      ]) : null)),
    ]),
  ]);
}

export function Contracts() {
  const [rows, setRows] = useState(null);
  const [projections, setProjections] = useState({});
  useEffect(() => {
    api("/contracts").then(async (cs) => {
      setRows(cs);
      const out = {};
      for (const c of cs) out[c.id] = await api("/contracts/" + c.id + "/projection").catch(() => null);
      setProjections(out);
    }).catch(() => setRows([]));
  }, []);
  return h("div", null, [
    h("h1", { class: "h2" }, "Contracts and the offtake floor"),
    rows === null ? h(Loading) : rows.length === 0 ? h(Empty, "No contracts.") :
    h("div", { class: "cards" }, rows.map((c) => {
      const p = projections[c.id];
      return h("div", { class: "card", key: c.id }, [
        h("h2", { class: "h4" }, [h(Ref, { value: c.id }), " · ", c.recipient]),
        c.planned_site_flag ? h("p", null, h("span", { class: "state-word" }, "planned site — this flag cannot be dismissed")) : null,
        p ? h("dl", { class: "kv" }, [
          ["Delivered (kg)", p.delivered_kg],
          ["Committed (kg)", p.committed_kg],
          ["Running content (bp)", p.running_content_bp],
          ["Floor (bp)", p.floor_bp],
          ["Required remaining (bp)", p.required_remaining_bp === null ? "—" : p.required_remaining_bp],
          ["State", p.state === "unreachable" ? "unreachable since " + p.unreachable_since : p.state],
        ].map(([t, d]) => h("div", { class: "kv-row", key: t }, [h("dt", null, t), h("dd", { class: "mono" }, String(d))]))) : h(Loading),
        h("p", { class: "quiet" }, "Shortfall consequence, stated at signature: " + c.shortfall_consequence + "."),
      ]);
    })),
  ]);
}

export function Change() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api("/change-notices").then(setRows).catch(() => setRows([])); }, []);
  return h("div", null, [
    h("h1", { class: "h2" }, "Change control"),
    rows === null ? h(Loading) : rows.length === 0 ? h(Empty, "No change notices open. A recipe revision that moves temperature or pressure outside the published threshold is a change here before it is released.") :
    h("div", { class: "cards" }, rows.map((n) => h("div", { class: "card", key: n.reference }, [
      h("h2", { class: "h4" }, [h(Ref, { value: n.reference }), " · ", n.state]),
      h("p", null, n.what),
      h("p", { class: "quiet" }, n.detail),
      h("ul", { class: "plain" }, [
        h("li", null, "Specifications affected: " + n.specifications_affected.join(", ")),
        h("li", null, "Customers affected: " + n.customers_affected.join(", ")),
        h("li", null, ["Qualifications affected: " + n.qualifications_affected.join(", "), n.qualifications_affected.length ? h("span", { class: "state-word" }, " — this change may invalidate " + n.qualifications_affected.length + " customer qualification" + (n.qualifications_affected.length === 1 ? "" : "s")) : null]),
        h("li", null, "Notice period: " + n.notice_period_days + " days"),
      ]),
      n.acknowledgements.length ? h("p", { class: "quiet" }, "Acknowledged by: " + n.acknowledgements.map((a) => a.customer + " (" + a.kind + ")").join(", ")) : h("p", { class: "quiet" }, "Release is refused until every customer owed notice has been notified or has waived it."),
    ]))),
  ]);
}

export function BatchImpact({ ref: batchRef }) {
  const [r, setR] = useState(null);
  useEffect(() => { api("/batches/" + batchRef + "/impact").then(setR).catch(() => setR(null)); }, [batchRef]);
  if (!r) return h(Loading);
  return h("div", null, [
    h("h1", { class: "h2" }, ["Impact of ", h(Ref, { value: batchRef })]),
    h("p", { class: "quiet" }, "The complete set: every lot containing any of this batch, every certificate resting on those lots, every recipient. Never paginated."),
    h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "Lots"),
      r.lots.length === 0 ? h(Empty, "No lot contains any of this batch yet.") :
      h("ul", { class: "plain" }, r.lots.map((l) => h("li", { key: l.reference }, [h(Ref, { value: l.reference }), " ", l.mass_from_batch_g.toLocaleString("en-GB"), " g from this batch"]))),
    ]),
    h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "Certificates"),
      r.certificates.length === 0 ? h(Empty, "No certificate rests on these lots.") :
      h("ul", { class: "plain" }, r.certificates.map((c) => h("li", { key: c.number }, [h(Ref, { value: c.number }), " ", c.state === "withdrawn" ? h("span", { class: "state-word" }, "withdrawn") : c.state, " · ", c.recipient_name]))),
    ]),
    h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "Recipients"),
      r.recipients.length === 0 ? h(Empty, "No recipient is affected.") : h("ul", { class: "plain" }, r.recipients.map((x) => h("li", { key: x }, x))),
    ]),
  ]);
}
