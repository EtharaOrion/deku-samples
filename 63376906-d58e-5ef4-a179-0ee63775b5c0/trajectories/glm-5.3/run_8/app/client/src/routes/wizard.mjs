import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, randomKey } from "../lib/api.mjs";
import { Loading, Empty, Banner, Ref } from "../lib/ui.mjs";
import { CarbonCard } from "./console.mjs";

/* The certificate wizard: four steps, four addresses. Each shows the eight
   conditions as they stand. No condition is dismissible from this screen. */

const STEPS = [
  { slug: "lot", title: "The lot" },
  { slug: "claim", title: "The claim" },
  { slug: "recipient", title: "The recipient" },
  { slug: "review", title: "The document" },
];

export function Wizard({ step, me, path }) {
  const [preview, setPreview] = useState(null);
  const [lots, setLots] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [choice, setChoice] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("ravel.wizard") || "{}"); } catch { return {}; }
  });
  const choose = (patch) => {
    const next = Object.assign({}, choice, patch);
    setChoice(next);
    try { sessionStorage.setItem("ravel.wizard", JSON.stringify(next)); } catch {}
  };
  const [doc, setDoc] = useState(null);
  const [pw, setPw] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    api("/lots").then(setLots).catch(() => setLots([]));
  }, []);
  useEffect(() => {
    api("/customers/CUS-HELIOS").then((c) => setCustomers([c])).catch(() => setCustomers([]));
    api("/customers/CUS-VANTA").then((c) => setCustomers((x) => x.concat([c]))).catch(() => {});
  }, []);
  useEffect(() => {
    if (choice.lot) {
      api("/certificates/preview", { method: "POST", body: { lot: choice.lot, recipient: choice.recipient || undefined }, idempotencyKey: randomKey() })
        .then((p) => { setPreview(p); fetchDoc(choice.lot, choice.recipient, setDoc); })
        .catch(() => setPreview(null));
    }
  }, [choice.lot, choice.recipient]);

  const idx = STEPS.findIndex((s) => s.slug === step);
  const current = STEPS[idx] || STEPS[0];

  return h("div", null, [
    h("h1", { class: "h2" }, "Issue a certificate"),
    h("nav", { class: "wiz-nav", "aria-label": "Wizard steps" },
      h("ol", null, STEPS.map((s, i) => h("li", { key: s.slug, class: i === idx ? "is-here" : (i < idx ? "is-done" : null) },
        h("a", { href: "/console/certificates/new/" + s.slug }, String(i + 1) + ". " + s.title))))),
    h("div", { class: "wiz-grid" }, [
      h("section", { class: "paper", "aria-labelledby": "cond" }, [
        h("h2", { class: "h4", id: "cond" }, "The eight conditions"),
        !preview ? h(Loading) : h(Conditions, { conditions: preview.conditions, one: idx === 3 }),
      ]),
      h("section", { class: "paper" }, stepBody(current.slug)),
    ]),
  ]);

  function stepBody(slug) {
    if (slug === "lot") {
      return [
        h("h2", { class: "h4" }, "Choose the lot"),
        !lots ? h(Loading) : lots.length === 0 ? h(Empty, "No lots have been produced.") :
        h("ul", { class: "choice-list" }, lots.map((l) => h("li", { key: l.reference },
          h("label", { class: "choice" }, [
            h("input", { type: "radio", name: "lot", checked: choice.lot === l.reference, onChange: () => choose({ lot: l.reference }) }),
            h("span", null, [
              h("span", { class: "mono" }, l.reference), " · ", l.grade, " · ", l.site, " · ", l.mass_g.toLocaleString("en-GB"), " g · ", l.disposition,
              h("span", { class: "quiet" }, " claim type " + l.claim_type.replace(/_/g, " ") + (l.content_bp !== null ? ", content " + (l.content_bp / 100).toFixed(2) + " per cent" : ", no claim attached")),
            ]),
          ])))),
        h("p", { class: "quiet" }, "A lot carries exactly one claim type, and the claim type never renders without the percentage beside it."),
      ];
    }
    if (slug === "claim") {
      if (!preview) return h(Loading);
      return [
        h("h2", { class: "h4" }, "The claim as the ledger holds it"),
        h("dl", { class: "kv" }, [
          ["Claim type", preview.claim_type.replace(/_/g, " ")],
          ["Recycled content", (preview.content_bp / 100).toFixed(2) + " per cent (" + preview.content_bp + " basis points)"],
          ["Balance period", preview.period || "—"],
        ].map(([t, d]) => h("div", { class: "kv-row", key: t }, [h("dt", null, t), h("dd", { class: "mono" }, d)]))),
        h("p", { class: "quiet" }, "This material is claimed by mass balance. It is not physically segregated. No route accepts a percentage from a person; this one is computed from the ledger."),
        h("p", null, h("a", { href: "/console/balance/" + (preview.period || "") }, "See the balance and its workings")),
      ];
    }
    if (slug === "recipient") {
      return [
        h("h2", { class: "h4" }, "Choose the recipient"),
        !customers || !customers.length ? h(Loading) : h("ul", { class: "choice-list" }, customers.map((c) => h("li", { key: c.reference },
          h("label", { class: "choice" }, [
            h("input", { type: "radio", name: "recipient", checked: choice.recipient === c.reference, onChange: () => choose({ recipient: c.reference }) }),
            h("span", null, [h("span", { class: "mono" }, c.reference), " · ", c.name, h("span", { class: "quiet" }, " holds " + c.holds_specification_version.grade + " v" + c.holds_specification_version.version + " · " + c.industry)]),
          ])))),
        h("p", { class: "quiet" }, "The recipient files this document with their own regulator. The permitted statement is generated from the claim type, the percentage and the category split."),
      ];
    }
    // review
    if (!preview) return h(Loading);
    const allSatisfied = preview.conditions.every((c) => c.satisfied);
    return [
      h("h2", { class: "h4" }, "The exact document that will be signed"),
      doc === null && choice.lot ? (fetchDoc(choice.lot, choice.recipient, setDoc), h("pre", { class: "cert-doc" }, "Rendering…")) : h("pre", { class: "cert-doc" }, doc || "Choose a lot first."),
      h("p", { class: "quiet" }, "Signing is a separate, deliberate act. Confirm your identity below; the screen states plainly that the recipient will file this document with a regulator."),
      result && result.kind === "refused" ? h(Banner, { tone: "refused", title: "Signing refused" }, [
        h("p", null, result.message || "A condition changed between the preview and the signing."),
        result.failing ? h("p", { class: "quiet" }, "The condition that blocks it: " + result.failing.join(", ") + ".") : null,
      ]) : null,
      result && result.kind === "ok" ? h(Banner, { tone: "ok" }, [
        h("p", null, ["Signed. Certificate ", h(Ref, { value: result.number }), "."]),
        h("p", null, h("a", { href: "/console/certificates/" + result.number }, "Open it"), " · ", h("a", { href: "/verify/" + result.number }, "The public address")),
      ]) : null,
      h("form", { class: "form", onSubmit: sign }, [
        h("label", { class: "field" }, [h("span", { class: "lab" }, "Password again"), h("input", { type: "password", value: pw, onInput: (e) => setPw(e.target.value), autocomplete: "current-password" })]),
        h("p", { class: "quiet" }, "A session alone is not a signing credential."),
        h("button", { class: "btn btn-primary", type: "submit", disabled: !allSatisfied || !choice.recipient || !pw }, allSatisfied ? "Sign this certificate" : "Blocked by an unsatisfied condition"),
      ]),
    ];
  }

  function sign(e) {
    e.preventDefault();
    setResult({ kind: "sending" });
    api("/certificates", { method: "POST", body: { lot: choice.lot, recipient: choice.recipient, password: pw }, idempotencyKey: randomKey() })
      .then((r) => setResult({ kind: "ok", number: r.number }))
      .catch((e2) => setResult({ kind: "refused", message: e2.message, failing: (e2.body && e2.body.failing) || null }));
  }
}

function fetchDoc(lot, recipient, set) {
  fetch("/api/certificates/preview-document?lot=" + encodeURIComponent(lot)).then((r) => r.text()).then(set).catch(() => set("The document renders at signing."));
}

export function Conditions({ conditions, one }) {
  return h("ol", { class: "cond-list" + (one ? " cond-one" : "") }, conditions.map((c) => h("li", { key: c.condition, class: "cond " + (c.satisfied ? "is-satisfied" : "is-blocking") }, [
    h("p", { class: "cond-title" }, c.statement),
    h("p", { class: "cond-state state-word" }, c.satisfied ? "satisfied" : "not satisfied: " + c.condition.replace(/_/g, " ")),
    !c.satisfied && c.blocking_reference ? h("p", { class: "cond-remedy quiet" }, [h("span", null, c.remedy || ""), " ", linkFor(c.blocking_reference)]) : null,
  ])));
}

function linkFor(ref) {
  const [kind, id] = ref.split(":");
  const map = {
    lot: ["/console/lots/" + id, "open the lot"],
    deviation: ["/console/runs", "open the deviation"],
    override: ["/console/lots", "open the override"],
    "balance-period": [id === "none" ? "/console/balance" : "/console/balance/" + id, "open the period"],
    run: ["/console/runs/" + id, "open the run"],
    batch: ["/console/batches/" + id, "open the batch"],
    "test-result": ["/console/lots", "open the test result"],
    site: ["/console/sites", "open the site"],
  };
  const m = map[kind];
  return m ? h("a", { href: m[0] }, m[1]) : null;
}

/* ------------------------------------------------- certificate register + detail */
export function CertificateList() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api("/certificates").then(setRows).catch(() => setRows([])); }, []);
  return h("div", null, [
    h("h1", { class: "h2" }, "Certificates"),
    h("p", null, h("a", { class: "btn btn-secondary btn-small", href: "/console/certificates/new/lot" }, "Issue a certificate")),
    rows === null ? h(Loading) : rows.length === 0 ? h(Empty, "No certificates have been issued.") :
    h("div", { class: "paper table-scroll" }, h("table", { class: "table" }, [
      h("thead", null, h("tr", null, ["Number", "State", "Site", "Lot", "Claim type", "Content", "Recipient"].map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", null, rows.map((c) => h("tr", { key: c.number }, [
        h("th", { scope: "row" }, h("a", { href: "/console/certificates/" + c.number }, c.number)),
        h("td", null, c.state === "withdrawn" ? h("span", { class: "state-word" }, "withdrawn") : c.state),
        h("td", null, c.site),
        h("td", { class: "mono" }, (c.lots || []).map((l) => l.reference).join(", ")),
        h("td", null, c.claim_type.replace(/_/g, " ")),
        h("td", { class: "mono" }, (c.content_bp / 100).toFixed(2) + "%"),
        h("td", null, c.recipient_name),
      ]))),
    ])),
  ]);
}

export function CertificateDetail({ number, me }) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState(null);
  const [doc, setDoc] = useState(null);
  const [wd, setWd] = useState(null);
  useEffect(() => {
    api("/certificates/" + number).then(setC).catch(setErr);
    fetch("/api/certificates/" + encodeURIComponent(number) + "/document").then((r) => r.text()).then(setDoc);
  }, [number]);
  if (err) return h(Empty, "No certificate with this number.");
  if (!c) return h(Loading);
  const mayWithdraw = me.roles.includes("certificate_signer") && c.state === "issued";
  return h("div", null, [
    h("h1", { class: "h2" }, [h(Ref, { value: c.number }), c.state === "withdrawn" ? h("span", { class: "state-word" }, " — withdrawn") : null]),
    c.state === "withdrawn" ? h(Banner, { tone: "refused", title: "Withdrawn" }, [
      h("p", null, "This certificate was withdrawn on " + c.withdrawn_on + ". Reason: " + c.withdrawn_reason + "."),
      h("p", { class: "quiet" }, "The document stays readable at its address. A withdrawal is a fact about a document; the remedy is a new certificate."),
    ]) : null,
    h("div", { class: "cols" }, [
      h("dl", { class: "kv" }, [
        ["Site", c.site], ["Grade", c.grade], ["Specification", "SPEC-N6 v" + c.specification_version],
        ["Claim type", c.claim_type.replace(/_/g, " ")],
        ["Recycled content", (c.content_bp / 100).toFixed(2) + " per cent"],
        ["Scheme", c.scheme], ["Registration", c.registration],
        ["Balance period", c.period], ["Signer", c.signer], ["Signed at", String(c.signed_at).slice(0, 10)],
        ["Recipient", c.recipient_name],
        ["Provisional factor", c.provisional_factor ? "yes — every figure resting on it says so" : "no"],
      ].map(([t, d]) => h("div", { class: "kv-row", key: t }, [h("dt", null, t), h("dd", { class: "mono" }, String(d))]))),
      h("div", { class: "paper" }, [
        h("h2", { class: "h4" }, "Statements"),
        h("p", null, ["Permitted: ", h("span", { class: "quiet" }, c.permitted_statement)]),
        h("p", null, ["Prohibited: ", h("span", { class: "quiet" }, c.prohibited_statement)]),
        h("p", { class: "quiet" }, ["Verify this certificate at ravel.example.com/verify/" + c.number + ". ", h("a", { href: "/verify/" + c.number }, "Open the public address")]),
      ]),
    ]),
    c.carbon_detail ? h(CarbonCard, { carbon: Object.assign({ value_mg_per_kg: c.carbon_detail.value_mg_per_kg }, c.carbon_detail) }) : null,
    h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "The document"),
      h("pre", { class: "cert-doc" }, doc || "Loading…"),
    ]),
    h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "The eight conditions as they stood at signing"),
      h(Conditions, { conditions: c.conditions || [], one: true }),
      h("p", { class: "quiet" }, "Stored as they stood, never recomputed on read."),
    ]),
    h("div", { class: "paper" }, [
      h("h2", { class: "h4" }, "Replay"),
      h(Replay, { number }),
    ]),
    mayWithdraw ? h(WithdrawPanel, { number, onDone: () => location.reload() }) : null,
  ]);
}

function Replay({ number }) {
  const [r, setR] = useState(null);
  useEffect(() => { api("/certificates/" + number + "/replay").then(setR).catch(() => setR(null)); }, [number]);
  if (!r) return h("p", { class: "quiet" }, "No replay available.");
  return h("div", null, [
    h("p", null, [r.agrees ? "Agrees." : "Disagrees.", " ", r.reproducible ? "" : "Not reproducible: " + r.reason + "."]),
    r.differing_input ? h("p", null, ["The input that differs: ", h(Ref, { value: r.differing_input.input }), " — issued ", String(r.differing_input.issued), ", recomputed ", String(r.differing_input.recomputed), "."]) : null,
    r.input_versions && r.input_versions.length ? h("ul", { class: "plain" }, r.input_versions.map((v) => h("li", { key: v.input }, [v.input, " ", h(Ref, { value: v.version })]))) : null,
  ]);
}

function WithdrawPanel({ number, onDone }) {
  const [stage, setStage] = useState("idle");
  const [reason, setReason] = useState("");
  const [pw, setPw] = useState("");
  const [preview, setPreview] = useState(null);
  const [contact, setContact] = useState(null);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (stage !== "confirm") return;
    api("/certificates/" + number).then((c) => {
      setPreview(c);
      return api("/customers/" + c.recipient).then((cu) => setContact(cu && cu.contact)).catch(() => {});
    }).catch(() => {});
  }, [stage, number]);
  async function doWithdraw(e) {
    e.preventDefault();
    setResult({ kind: "sending" });
    try {
      const r = await api("/certificates/" + number + "/withdraw", { method: "POST", body: { reason, password: pw }, idempotencyKey: randomKey() });
      setResult({ kind: "ok", r });
      setTimeout(onDone, 1500);
    } catch (e2) {
      setResult({ kind: "refused", message: e2.message });
    }
  }
  return h("div", null, [
    h("h3", { class: "h4" }, "Withdraw this certificate"),
    stage === "idle" ? h("button", { class: "btn btn-secondary", onClick: () => setStage("confirm") }, "Begin a withdrawal") : null,
    stage === "confirm" ? h("div", null, [
      h("p", null, "Before confirming, read the blast radius. The five consequences happen in one action:"),
      h("ol", { class: "plain" }, [
        h("li", null, "The state becomes withdrawn, with the reason, the person and the date."),
        h("li", null, ["The recipient is notified by name: ", preview ? preview.recipient_name : "…", contact ? [" (", h(Ref, { value: contact }), ")"] : null]),
        h("li", null, ["Every downstream statement the recipient was permitted to make becomes void:"]),
        preview ? h("ul", { class: "plain" }, voidStatements(preview).map((s) => h("li", { key: s }, ["“", s, "”"]))) : null,
        h("li", null, "Every certificate derived from this one is identified and resolved."),
        h("li", null, "The reverse traversal of the underlying batches runs, so every other certificate touching them is enumerated in the same action."),
      ]),
      h("form", { class: "form", onSubmit: doWithdraw }, [
        h("label", { class: "field" }, [h("span", { class: "lab" }, "Reason"), h("textarea", { rows: 2, value: reason, onInput: (e) => setReason(e.target.value), required: true })]),
        h("label", { class: "field" }, [h("span", { class: "lab" }, "Password again"), h("input", { type: "password", value: pw, onInput: (e) => setPw(e.target.value), autocomplete: "current-password" })]),
        result && result.kind === "refused" ? h(Banner, { tone: "refused" }, h("p", null, result.message)) : null,
        result && result.kind === "ok" ? h(Banner, { tone: "ok" }, h("p", null, "Withdrawn. The certificate address still resolves and states the withdrawal.")) : null,
        h("div", { class: "cta-row" }, [
          h("button", { class: "btn btn-secondary", type: "button", onClick: () => setStage("idle") }, "Do not withdraw"),
          h("button", { class: "btn btn-primary", type: "submit", disabled: reason.length < 10 || !pw }, "Confirm withdrawal"),
        ]),
      ]),
    ]) : null,
  ]);
}

function voidStatements(c) {
  return [c.permitted_statement, "You may not state that this material physically contains recycled content."];
}
