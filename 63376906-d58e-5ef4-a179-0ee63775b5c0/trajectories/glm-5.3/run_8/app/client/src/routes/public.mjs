import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api } from "../lib/api.mjs";
import { setMeta } from "../lib/meta.mjs";
import PublicLayout from "../lib/public-layout.mjs";
import { Reveal, Frame, Eyebrow, Button } from "../lib/ui.mjs";
import Verify from "./verify.mjs";

const PUBLIC_ROUTES = ["/", "/product", "/technology", "/about", "/careers", "/news", "/contact", "/privacy"];

export default function PublicApp({ path, params }) {
  if (path === "/verify/" + (params.number || "")) return h(Verify, { params });
  if (path.startsWith("/verify/")) return h(Verify, { params });
  if (!PUBLIC_ROUTES.includes(path)) {
    return h(PublicLayout, { path }, h(Frame, null, [
      h("h1", { class: "h2" }, "No such page"),
      h("p", null, "The address " + path + " does not exist on this site."),
      h(Button, { href: "/", kind: "primary" }, "Back to the home page"),
    ]));
  }
  return h(PublicLayout, { path }, h(Routed, { path }));
}

function Routed({ path }) {
  switch (path) {
    case "/": return h(Home);
    case "/product": return h(Product);
    case "/technology": return h(Technology);
    case "/about": return h(About);
    case "/careers": return h(Careers);
    case "/news": return h(News);
    case "/contact": return h(Contact);
    case "/privacy": return h(Privacy);
    default: return null;
  }
}

/* --------------------------------------------------------------- HOME */
function Home() {
  return h("article", null, [
    h(Reveal, { as: "section", class: "hero" }, [
      h("div", { class: "frame" }, [
        h(Eyebrow, null, "Ravel"),
        h("h1", { class: "h1" }, "Tomorrow's materials. Made from today's waste."),
        h("p", { class: "lead" }, "Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon."),
        h("div", { class: "cta-row" }, [
          h(Button, { href: "/product" }, [h("span", null, "The material"), h("span", { class: "btn-arrow", "aria-hidden": "true" }, "→")]),
          h(Button, { href: "/technology", kind: "secondary" }, "How it is made"),
        ]),
      ]),
    ]),
    h(Reveal, { as: "section", class: "band" }, h("div", { class: "frame" }, [
      h("h2", { class: "h2" }, "Nylon that goes on and on and on"),
      h("div", { class: "cols" }, [
        h("p", null, "Nylon is a remarkable material: strong, light, dyeable, durable. That durability is exactly why it accumulates. Fibre, fishing net, offcut and airbag all carry the same polymer backbone, and that backbone survives the use we make of it."),
        h("p", null, "Ravel takes that backbone back. Mixed polyamide waste, sorted and weighed and documented, goes through four stages of chemistry and comes out as pellet indistinguishable from the material made from oil."),
      ]),
    ])),
    h(Reveal, { as: "section", class: "band band-alt" }, h("div", { class: "frame" }, [
      h("h2", { class: "h2" }, "The power of green chemistry"),
      h("div", { class: "cols" }, [
        h("p", null, "Dissolution takes the polymer out of the mixture. Depolymerisation takes it back to its monomer. Purification removes what the years put in. Repolymerisation builds it again, to a specification a manufacturer can sign against."),
        h("p", null, "Each stage runs at low temperature and low pressure against a published recipe, and each run is recorded: what went in, what came out, what was lost. Losses reduce the claim, so the arithmetic stays honest."),
      ]),
    ])),
    h(Reveal, { as: "section", class: "band" }, h("div", { class: "frame" }, [
      h("h2", { class: "h2" }, "We're closing the loop"),
      h("div", { class: "cols" }, [
        h("p", null, "A loop is not a slogan; it is a set of records. Waste arrives from named collectors whose approvals are dated periods rather than standing flags. It is weighed, sampled and held under an unbroken chain of custody. It is processed in runs whose inputs and outputs are written down, and it leaves as lots carrying a claim that can be traced to the grams that entered."),
        h("p", null, "The claim, not the pellet, is what a manufacturer buys. The pellet is the same polymer either way. What Ravel sells is the origin, and origin cannot be measured in a pellet — it exists only as a record, so the record is the product."),
      ]),
    ])),
  ]);
}

/* --------------------------------------------------------------- PRODUCT */
function Product() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api("/statistics").then(setStats).catch(() => setStats([])); }, []);
  return h("article", null, [
    hero("Same material. Better origin.", "We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise."),
    section("Two grades", h("div", { class: "cards" }, [
      card("Nylon 6", [
        h("p", null, "Recycled Nylon 6 came, almost entirely, from one source: discarded fishing nets. Nets are a strong single-polymer stream, and they built the first recycling routes — but one source is a narrow foundation for a material industry."),
        h("p", null, "Ravel's Nylon 6 takes mixed polyamide waste: post-consumer textile, industrial offcut, net and carpet, in the proportions our collectors actually hold."),
        claimLine("mass_balance", 90, "Nylon 6", stats),
      ]),
      card("Nylon 6,6", [
        h("p", null, "Nylon 6,6 had no recycling solution at all. Its two-monomer backbone resists the simpler routes, and the material has mostly gone to incineration or landfill at end of life."),
        h("p", null, "Ravel's depolymerisation route recovers both monomers, and the repolymerised material meets the same specification as the incumbent."),
        claimLine("mass_balance", null, "Nylon 6,6", stats),
      ]),
    ])),
    section("Six industries", h("ul", { class: "chips" }, [
      "textiles and apparel", "automotive", "electrical and electronics", "consumer goods", "industrial", "construction",
    ].map((x) => h("li", { key: x }, x)))),
    section("Three things the material does", h("div", { class: "cards" }, [
      card("Nylon in any form", [h("p", null, "Fibre, film, engineering compound and monomer: the output of the route is a building block, and the building block is shaped by the converter rather than by us.")]),
      card("Specification held", [h("p", null, "Every lot is tested against a published specification, by named method, and released only by a person who did not run the test.")]),
      card("Documents a regulator accepts", [h("p", null, "Each lot can carry a certificate that states what the material represents, what it does not, and where the claim came from.")]),
    ])),
    section("Specifications", h("div", { class: "paper" }, [
      h("div", { class: "table-scroll" }, h("table", { class: "table" }, [
        h("thead", null, h("tr", null, ["Property", "Method", "Limit", "Unit", "Basis"].map((c) => h("th", { scope: "col" }, c)))),
        h("tbody", null, [
          ["relative_viscosity", "ISO 307", "2.40", "ratio", "guaranteed"],
          ["moisture", "ISO 15512", "0.10", "percent", "guaranteed"],
          ["yellowness_index", "ASTM E313", "8.0", "index", "typical"],
          ["ash_content", "ISO 3451-1", "0.30", "percent", "informational"],
        ].map((r) => h("tr", { key: r[0] }, [h("th", { scope: "row", class: "mono" }, r[0])].concat(r.slice(1).map((c, i) => h("td", { class: i === 2 ? "mono" : null }, c)))))),
      ])),
      h("p", { class: "quiet" }, "Specification SPEC-N6 version 3, issued 2026-02-01. The virgin-quality comparison names the reference “virgin PA6 at relative viscosity 2.42”, sourced from EcoBase 2025 and dated 2025-11-30."),
    ])),
  ]);
}

function claimLine(type, bp, grade, stats) {
  const txt = bp ? bp + " per cent recycled content" : "recycled content allocated by period";
  return h("p", { class: "claim-line" }, [
    h("span", { class: "state-word" }, txt + " — claimed by "),
    h("span", { class: "mono" }, type.replace(/_/g, " ")),
    h("span", null, ", under scheme RCS-2026. "),
    h("span", { class: "quiet" }, "This material is claimed by mass balance. It is not physically segregated."),
  ]);
}

/* --------------------------------------------------------------- TECHNOLOGY */
function Technology() {
  const steps = [
    ["Dissolution", "Mixed waste goes into solution; contaminants that do not dissolve stay behind. The polymer keeps its chain length."],
    ["Depolymerisation", "The chain is taken back to caprolactam at low temperature and low pressure. This is the step that makes true virgin quality possible."],
    ["Purification", "Dyes, fillers, additives and the residues of a hard life are removed from the monomer stream."],
    ["Repolymerisation", "The monomer is built back into polymer to a published specification, and pelletised."],
  ];
  return h("article", null, [
    hero("Four stages, one record", "From mixed polyamide waste to virgin-quality pellet, with every kilogram accounted for at every stage."),
    section("The four process steps", h("ol", { class: "steps" }, steps.map(([t, d], i) => h("li", { key: t }, [
      h("p", { class: "steps-no mono" }, String(i + 1).padStart(2, "0")),
      h("h3", { class: "h4" }, t),
      h("p", null, d),
    ])))),
    section("Capacity", h("div", { class: "paper" }, [
      h("p", { class: "quiet" }, "Nameplate capacity in tonnes of pellet per year. The year is a calendar year of 8 000 operating hours; the basis is 0.90 availability and 0.80 yield against nameplate."),
      h("div", { class: "table-scroll" }, h("table", { class: "table" }, [
        h("thead", null, h("tr", null, ["Site", "Period", "Capacity (t/yr)", "Confidence"].map((c) => h("th", { scope: "col" }, c)))),
        h("tbody", null, [
          ["Commercial Plant", "2030+", ">25,000", h("span", { class: "state-word" }, "planned")],
          ["Demonstration", "2026", "400", h("span", { class: "state-word" }, "commissioned")],
          ["Pilot", "2026", "40", h("span", { class: "state-word" }, "commissioned")],
        ].map((r) => h("tr", { key: r[0] }, [h("th", { scope: "row" }, r[0]), h("td", null, r[1]), h("td", { class: "mono" }, r[2]), h("td", null, r[3])]))),
      ])),
      h("p", { class: "quiet" }, "A capacity figure never travels without its confidence."),
    ])),
    section("Five attributes", h("div", { class: "cards" }, [
      card("Green chemicals & reagents", [h("p", null, "The route runs on reagents chosen for their environmental profile. Evidence: CM-PA6 version 2, published 2026-01-20 against ISO 14067, functional unit 1 kg of pellet, cradle-to-gate.")]),
      card("Low temperature & pressure", [h("p", null, "Dissolution runs at 165 °C and 3 bar. Evidence: recipe RCP-DISS-2, released with tolerances of 160–170 °C and 2–4 bar, and held by run RUN-D-0001.")]),
      card("Low carbon impact", [h("p", null, "Evidence: LOT-N6-0001 carries 4 260 000 mg CO2e per kg against a virgin PA6 comparator of 4 260 000 + 20% from EcoBase 2025, EU-27, under CM-PA6 v2, uncertainty 1200 basis points.")]),
      card("Drop-in chemistry", [h("p", null, "Repolymerised to the same specification as virgin material; the converter changes nothing.")]),
      card("Traceable origin", [h("p", null, "Every lot's origin is a traversal of recorded consumptions, not a declaration.")]),
    ])),
    section("The plant", h("div", { class: "paper plant-diagram" }, [
      h("h3", { class: "h4" }, "The four stages, drawn from the run types"),
      plantDiagram(),
    ])),
  ]);
}

function plantDiagram() {
  const stages = [
    ["Dissolution", "in: 1 060 000 g", "out: 850 000 g"],
    ["Depolymerisation", "in: 850 000 g", "out: 800 000 g"],
    ["Purification", "in: 800 000 g", "out: 760 000 g"],
    ["Repolymerisation", "in: 720 000 g", "out: 700 000 g"],
  ];
  return h("div", { class: "plant" }, stages.map((s, i) => h("div", { class: "plant-stage", key: s[0] }, [
    h("p", { class: "plant-name" }, s[0]),
    h("p", { class: "plant-io mono" }, [h("span", null, s[1]), h("span", null, s[2])]),
    i < 3 ? h("span", { class: "plant-arrow", "aria-hidden": "true" }, "→") : null,
  ])));
}

/* --------------------------------------------------------------- ABOUT */
function About() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api("/statistics").then(setStats).catch(() => setStats([])); }, []);
  return h("article", null, [
    hero("About Ravel", "A chemical recycling plant, the records behind it, and the people who keep them."),
    section("The hard facts", h("div", { class: "cards" }, (stats || []).map((s) => h("div", { class: "card", key: s.key }, [
      h("p", { class: "stat" }, s.value),
      h("p", { class: "quiet stat-src" }, "Source: " + s.source + ", " + s.year + ", " + s.geography),
    ])).concat(!stats ? [h("p", { class: "loading", role: "status" }, "Loading…")] : []))),
    section("What we hold", h("div", { class: "cols" }, [
      h("p", null, "Ravel operates a pilot and a demonstration line for the chemical recycling of mixed polyamide waste. The company's own record is the product: a lot is only worth what its runs, batches and balances support."),
      h("p", null, "The register is append-only. Corrections are new entries naming what they correct, and a certificate issued years ago is reproducible from the rows written before any later change."),
    ])),
  ]);
}

/* --------------------------------------------------------------- CAREERS */
function Careers() {
  const [positions, setPositions] = useState(null);
  useEffect(() => { api("/positions").then(setPositions).catch(() => setPositions([])); }, []);
  return h("article", null, [
    hero("Careers at Ravel", "Work on a problem that is material, literal and unsolved."),
    section("Why this problem matters", h("div", { class: "cols" }, [
      h("p", null, "Less than 1 per cent of textiles are recycled into new materials. More than 8 per cent of textile waste is incinerated each year in the EU-27, and plastics production emits 1.8 gigatonnes of carbon dioxide equivalent a year. Nylon is a small slice of that and a completely representative one: a high-value material with no honest end of life."),
      h("p", null, "The work is not a slogan and it is not a screen. It is chemistry that runs, records that hold, and a claim a regulator accepts. If that is the kind of problem you like, read on."),
    ])),
    section("Open positions", h("div", null, [
      h("p", { class: "quiet" }, (positions ? positions.length : "…") + (positions && positions.length === 1 ? " open position" : " open positions") + " at Ravel"),
      positions === null ? h("p", { class: "loading", role: "status" }, "Loading…")
        : positions.length === 0 ? h("p", { class: "empty" }, "There are no open positions right now.")
        : h("ul", { class: "pos-list" }, positions.map((p) => h("li", { key: p.title, class: "paper" }, [
            h("h3", { class: "h4" }, p.title),
            h("dl", { class: "pos-dl" }, [
              ["Location", p.location], ["Department", p.department], ["Contract", p.contract_type], ["Closes", p.closes_on],
            ].map(([t, d]) => h(Fragment_, { key: t }, [h("dt", null, t), h("dd", null, d)]))),
          ]))),
    ])),
  ]);
}

function Fragment_({ children }) { return h("span", { class: "pos-pair" }, children); }

/* --------------------------------------------------------------- NEWS */
function News() {
  const [items, setItems] = useState(null);
  useEffect(() => { api("/news").then(setItems).catch(() => setItems([])); }, []);
  const labels = { funding: "Funding", partnership: "Partnership", technical: "Technical", recognition: "Recognition" };
  return h("article", null, [
    hero("News", "Funding, partnership, technical and recognition. Each event appears once, with its coverage."),
    section("News items", (items === null)
      ? h("p", { class: "loading", role: "status" }, "Loading…")
      : items.length === 0 ? h("p", { class: "empty" }, "There are no news items yet.")
      : h("ul", { class: "news-list" }, items.map((n) => h("li", { key: n.title, class: "paper" }, [
          h("p", { class: "eyebrow" }, labels[n.tag] || n.tag),
          h("h3", { class: "h4" }, [n.title, n.language && n.language !== "en" ? h("span", { class: "quiet lang" }, " — in " + langName(n.language)) : null]),
          h("p", { class: "quiet" }, [n.outlet, " · ", h("span", { class: "mono" }, n.date), n.link ? " · coverage" : ""]),
        ])))),
  ]);
}
function langName(l) { return { fr: "French", en: "English", de: "German" }[l] || l; }

/* --------------------------------------------------------------- CONTACT */
function Contact() {
  const [state, setState] = useState({ kind: "idle" });
  const [form, setForm] = useState({ type: "waste_supply", name: "", email: "", message: "", consent: false });
  const types = [
    ["waste_supply", "Waste supply", "feedstock@example.com", "3"],
    ["polymer_purchase", "Polymer purchase", "sales@example.com", "2"],
    ["partnership", "Partnership", "partners@example.com", "5"],
    ["press", "Press", "press@example.com", "1"],
  ];
  async function submit(e) {
    e.preventDefault();
    setState({ kind: "sending" });
    try {
      const r = await api("/enquiries", { method: "POST", body: form, idempotencyKey: "enq-" + Math.random().toString(36).slice(2, 12) });
      setState({ kind: "sent", reference: r.reference, days: r.response_days, destination: r.destination });
    } catch (err) {
      setState({ kind: "failed", error: err.status === 422 ? "Some fields were missing or invalid. Check the form and try again." : "The enquiry could not be sent." });
    }
  }
  return h("article", null, [
    hero("Contact", "Four enquiry types, four destinations, four stated response times."),
    section("Enquiries", h("div", { class: "cols" }, [
      h("table", { class: "table" }, [
        h("thead", null, h("tr", null, ["Enquiry", "Goes to", "Answered within"].map((c) => h("th", { scope: "col" }, c)))),
        h("tbody", null, types.map(([v, label, dest, days]) => h("tr", { key: v }, [h("th", { scope: "row" }, label), h("td", null, dest), h("td", { class: "mono" }, days + " days")]))),
      ]),
      h("form", { class: "form paper", onSubmit: submit, novalidate: true }, [
        h("label", { class: "field" }, [h("span", { class: "lab" }, "Enquiry type"), h("select", { value: form.type, onChange: (e) => setForm(Object.assign({}, form, { type: e.target.value })) }, types.map(([v, l]) => h("option", { value: v }, l)))]),
        h("label", { class: "field" }, [h("span", { class: "lab" }, "Your name"), h("input", { required: true, value: form.name, onInput: (e) => setForm(Object.assign({}, form, { name: e.target.value })) })]),
        h("label", { class: "field" }, [h("span", { class: "lab" }, "Your email"), h("input", { type: "email", required: true, value: form.email, onInput: (e) => setForm(Object.assign({}, form, { email: e.target.value })) })]),
        h("label", { class: "field" }, [h("span", { class: "lab" }, "Message"), h("textarea", { rows: 4, required: true, value: form.message, onInput: (e) => setForm(Object.assign({}, form, { message: e.target.value })) })]),
        h("label", { class: "check" }, [h("input", { type: "checkbox", required: true, checked: form.consent, onChange: (e) => setForm(Object.assign({}, form, { consent: e.target.checked })) }), h("span", null, "I understand who receives this data, what it is used for, how long it is kept and how to have it removed, as stated in the privacy policy.")]),
        h("p", { class: "quiet" }, "We keep an enquiry for 24 months, a waste-supply enquiry for 36 months, a polymer enquiry for 36 months and a press enquiry for 12 months."),
        state.kind === "sent"
          ? h("div", { class: "banner banner-ok", role: "status" }, [
              h("p", { class: "banner-title" }, "Enquiry received"),
              h("p", null, ["Reference ", h("span", { class: "mono" }, state.reference), ". It has gone to ", state.destination, " and you will hear back within ", state.days, state.days === "1" ? " day" : " days", ". A confirmation has been sent to your email address."]),
            ])
          : null,
        state.kind === "failed" ? h("div", { class: "banner banner-refused", role: "alert" }, [
          h("p", { class: "banner-title" }, "Not sent"),
          h("p", null, [state.error, " You can also write to ", h("a", { href: "mailto:feedstock@example.com" }, "feedstock@example.com"), ", which does not depend on this form."]),
        ]) : null,
        h(Button, { type: "submit", disabled: state.kind === "sending" || !form.consent }, state.kind === "sending" ? "Sending…" : "Send enquiry"),
      ]),
    ])),
  ]);
}

/* --------------------------------------------------------------- PRIVACY */
function Privacy() {
  const rows = [
    ["An enquiry", "24 months"],
    ["A waste-supply enquiry", "36 months"],
    ["A polymer enquiry", "36 months"],
    ["A press enquiry", "12 months"],
    ["An account and its acts", "120 months"],
    ["The record", "180 months"],
  ];
  return h("article", { class: "print-page" }, [
    hero("Privacy", "What Ravel collects, why it is kept, for how long, and how to have it removed."),
    section("Controller", h("div", { class: "paper" }, [
      h("p", null, "The controller is Ravel Materials SAS, 14 Rue des Polymères, 69003 Lyon, France."),
      h("p", null, "A rights request goes to privacy@example.com. A disclosure, including a security disclosure, goes to security@example.com."),
    ])),
    section("Purposes and retention", h("table", { class: "table" }, [
      h("thead", null, h("tr", null, ["Purpose", "Retention"].map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", null, rows.map((r) => h("tr", { key: r[0] }, [h("th", { scope: "row" }, r[0]), h("td", { class: "mono" }, r[1])]))),
    ])),
    section("The operational record", h("div", { class: "paper" }, [
      h("p", null, "The operational record names individuals. It is retained under a legal and scheme obligation and it is not erased on request. This is stated plainly: a request to erase the operational record will be refused, because the record is the product."),
      h("p", null, "A former employee's contact detail is erased. The person inside the record is referenced by an identifier, and the identifier resolves to a name through a separate store with its own retention."),
    ])),
    section("Your rights", h("div", { class: "paper" }, [
      h("p", null, "You may ask what is held, ask for a copy, ask for a correction, and ask for erasure where no obligation holds. Write to privacy@example.com and you will receive an answer within thirty days."),
    ])),
  ]);
}

/* helpers */
function hero(h1, lead) {
  return h(Reveal, { as: "section", class: "hero" }, h("div", { class: "frame" }, [
    h("h1", { class: "h1" }, h1),
    h("p", { class: "lead" }, lead),
  ]));
}
function section(title, body) {
  return h(Reveal, { as: "section", class: "band" }, h("div", { class: "frame" }, [
    h("h2", { class: "h2" }, title), body,
  ]));
}
function card(title, body) {
  return h("div", { class: "card" }, [h("h3", { class: "h4" }, title)].concat(body));
}
