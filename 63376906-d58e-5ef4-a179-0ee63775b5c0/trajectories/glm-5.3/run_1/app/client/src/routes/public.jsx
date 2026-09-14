import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { A } from '../lib/router.jsx';
import { api, fmt } from '../lib/api.js';
import { Reveal, Footer, Word, FigurePair, Loading, Empty, IconArrow } from '../components/chrome.jsx';

const withFooter = (node) => h('div', null, node, h(Footer));

export function Home() {
  return withFooter(
    h('main', null,
      h(Reveal, { as: 'section', class: 'section' },
        h('p', { class: 'label' }, 'Ravel'),
        h('h1', null, 'Tomorrow\u2019s materials. Made from today\u2019s waste.'),
        h('p', { class: 'lede' }, 'Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.'),
        h(A, { href: '/product', class: 'btn' }, 'See the product ', h('span', { class: 'btn-arrow', 'aria-hidden': 'true' }, '\u2192'))
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'Nylon that goes on and on and on'),
        h('p', { class: 'body-big' }, 'Nylon 6 is one of the few polymers that can be returned to its monomer and rebuilt, indefinitely, without loss of quality. Discarded fishing nets, worn apparel and industrial offcuts all reduce to the same caprolactam our industry already runs on.'),
        h('p', { class: 'body-regular' }, 'The material that comes out of our plant is chemically indistinguishable from the material made from oil. What changes is where it came from.')
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'The power of green chemistry'),
        h('p', { class: 'body-big' }, 'Our process runs at low temperature and low pressure, in water, with reagents chosen for their environmental profile rather than their throughput.'),
        h('p', { class: 'body-regular' }, 'Dissolution, depolymerisation, purification and repolymerisation: four stages, each closed and each measured, so the claim on the pellet is a record rather than a promise.')
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'We\u2019re closing the loop'),
        h('p', { class: 'body-big' }, 'Waste in, polymer out, and the loop closes at the point a manufacturer swaps a fossil feedstock for ours without changing a single set point downstream.'),
        h('p', { class: 'body-regular' }, 'We buy mixed polyamide waste from named collectors, record its custody from collection site to weighbridge, and allocate recycled content to every lot by a ledger that never invents a gram. Less than 1 per cent of textiles are recycled into new materials today; that is the number we exist to move.'),
        h('p', { class: 'body-regular' }, 'This material is claimed by mass balance. It is not physically segregated.')
      )
    )
  );
}

export function Product() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api('/statistics').then((r) => setStats(r.data)); }, []);
  const grades = [
    {
      grade: 'Nylon 6', claim: 'Recycled content claimed by mass balance under RCS-2026.',
      limitation: 'Until now, recycled Nylon 6 came almost entirely from one source: discarded fishing nets.',
      note: 'This material is claimed by mass balance. It is not physically segregated.'
    },
    {
      grade: 'Nylon 6,6', claim: 'Recycled content claimed by mass balance under RCS-2026.',
      limitation: 'Nylon 6,6 had no recycling solution at all.',
      note: 'You may not state that this material physically contains recycled content.'
    }
  ];
  const industries = ['Textiles and apparel', 'Automotive', 'Electrical and electronics', 'Consumer goods', 'Industrial', 'Construction'];
  return withFooter(
    h('main', null,
      h(Reveal, { as: 'section', class: 'section' },
        h('h1', null, 'Same material. Better origin.'),
        h('p', { class: 'lede' }, 'We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise.')
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'Two grades'),
        h('div', { class: 'grid cols-2' }, grades.map((g) => h('article', { class: 'sheet' },
          h('h3', null, g.grade),
          h('p', { class: 'label' }, 'Real limitation'),
          h('p', { class: 'body-regular' }, g.limitation),
          h('p', { class: 'label' }, 'Claim'),
          h('p', { class: 'body-regular' }, g.claim),
          h('p', { class: 'body-small' }, g.note)
        )))
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'Six industries'),
        h('ul', { class: 'grid cols-3', style: 'list-style:none;padding:0;margin:0' }, industries.map((i) => h('li', { class: 'card' }, i)))
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'Three things we can do'),
        h('div', { class: 'grid cols-3' },
          h('article', { class: 'sheet' }, h('h3', null, 'Nylon in any form'), h('p', { class: 'body-regular' }, 'Nets, yarns, films, carpets and offcuts all enter the same process, so any polyamide waste stream is a candidate feedstock.')),
          h('article', { class: 'sheet' }, h('h3', null, 'A claim you can file'), h('p', { class: 'body-regular' }, 'Every lot carries a certificate with its recycled content, its carbon figure and the statements its recipient may and may not make.')),
          h('article', { class: 'sheet' }, h('h3', null, 'A drop-in pellet'), h('p', { class: 'body-regular' }, 'The pellet meets the same specification as virgin polymer, so the change happens in procurement and not in the plant.')))
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'Specification'),
        h('p', { class: 'body-regular' }, 'The specification for grade N6, version 3, issued 2026-02-01:'),
        h('div', { class: 'table-wrap' },
          h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Property'), h('th', null, 'Method'), h('th', null, 'Limit'), h('th', null, 'Unit'), h('th', null, 'Basis'))),
            h('tbody', null, [
              ['Relative viscosity', 'ISO 307', '2.40', 'ratio', 'Guaranteed'],
              ['Moisture', 'ISO 15512', '0.10', 'percent', 'Guaranteed'],
              ['Yellowness index', 'ASTM E313', '8.0', 'index', 'Typical'],
              ['Ash content', 'ISO 3451-1', '0.30', 'percent', 'Informational']
            ].map((r) => h('tr', null, h('td', null, r[0]), h('td', { class: 'mono' }, r[1]), h('td', { class: 'mono' }, r[2]), h('td', null, r[3]), h('td', null, r[4])))))),
        h('p', { class: 'body-small' }, 'Virgin-quality comparison: virgin PA6 at relative viscosity 2.42, sourced from EcoBase 2025, dated 2025-11-30.')
      )
    )
  );
}

export function Technology() {
  const [cap, setCap] = useState(null);
  useEffect(() => { api('/sites').then((r) => setCap(r.data)); }, []);
  const steps = [
    ['Dissolution', 'Mixed and contaminated waste is dissolved and the polymer separated from everything that is not polymer.'],
    ['Depolymerisation', 'The dissolved polymer is returned to its monomer, which is the only way to claim virgin quality honestly.'],
    ['Purification', 'The monomer stream is purified to the same standard as monomer from oil.'],
    ['Repolymerisation', 'The purified monomer is polymerised back to pellet, against the same specification as virgin polymer.']
  ];
  const attributes = [
    ['Green chemicals & reagents', 'Reagent selection is documented per recipe version; the claim rests on the recipe record.', true],
    ['Low temperature & pressure', 'Set points are recorded per run against recipe tolerance; RUN-D-0001 ran at 165\u00b0C and 3 bar.', true],
    ['Low carbon impact', 'The figure for LOT-N6-0001 is 4,260,000 mg CO\u2082e/kg, cradle-to-gate, method CM-PA6 v2, uncertainty 1,200 bp \u2014 lower than virgin PA6 from EcoBase 2025 (EU-27).', true],
    ['Closed water circuit', 'Process water is recirculated; effluent lines are metered.', false],
    ['Traceable to batch', 'Every lot carries its genealogy back to the batches that made it.', false]
  ];
  const capacity = [
    ['Pilot (2026)', '40,000 kg per year', 'commissioned'],
    ['Demonstration (2027)', '400,000 kg per year', 'commissioned'],
    ['Commercial Plant (2030+)', '>25,000 tonnes per year', 'planned']
  ];
  return withFooter(
    h('main', null,
      h(Reveal, { as: 'section', class: 'section' },
        h('h1', null, 'Technology'),
        h('p', { class: 'lede' }, 'Four stages, each recorded after the fact. The diagram below is generated from the four run types, so it stays correct when a stage changes.'),
        h('figure', null,
          h('svg', { viewBox: '0 0 640 120', role: 'img', 'aria-label': 'The four process stages with mass in and mass out per stage', style: 'width:100%;height:auto' },
            steps.map((s, i) => h('g', { key: s[0], transform: `translate(${i * 160}, 10)` },
              h('rect', { x: '8', y: '16', width: '120', height: '52', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' }),
              h('text', { x: '68', y: '40', 'text-anchor': 'middle', 'font-size': '11', fill: 'currentColor' }, s[0]),
              h('text', { x: '68', y: '56', 'text-anchor': 'middle', 'font-size': '10', fill: 'currentColor' }, ['300,000 g in', '480,000 g in', '800,000 g in', '720,000 g in'][i]),
              i < 3 ? h('path', { d: 'M128 42h24m-6-5l6 5-6 5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' }) : null)),
            h('text', { x: '8', y: '100', 'font-size': '10', fill: 'currentColor' }, 'Mass in and mass out per stage. Losses reduce the claim.')
          ),
          h('figcaption', { class: 'body-small' }, 'Mass in and mass out per stage: dissolution 600,000 g in, 480,000 g out; depolymerisation 850,000 g in, 800,000 g out; purification 800,000 g in, 760,000 g out; repolymerisation 720,000 g in, 700,000 g out.')
        )
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'The four process steps'),
        h('div', { class: 'grid cols-2' }, steps.map(([t, d]) => h('article', { class: 'sheet' }, h('h3', null, t), h('p', { class: 'body-regular' }, d))))
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'Capacity'),
        h('p', { class: 'body-small' }, 'All figures in kilograms per year. Basis: 8,000 hours per year, 0.90 availability, 0.80 yield. The year is a calendar year of operation.'),
        h('div', { class: 'table-wrap' },
          h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Plant'), h('th', { class: 'num' }, 'Capacity (kg per year)'), h('th', null, 'Confidence'))),
            h('tbody', null, capacity.map((c) => h('tr', null,
              h('td', null, c[0]), h('td', { class: 'num mono' }, c[1]),
              h('td', null, c[2] === 'planned' ? h(Word, { kind: 'note' }, 'planned') : c[2]))))))
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'Five attributes'),
        h('ul', { style: 'list-style:none;padding:0;margin:0', class: 'grid' }, attributes.map(([t, d, isClaim]) => h('li', { class: 'card' },
          h('h3', null, t), h('p', { class: 'body-regular' }, d), isClaim ? h('p', { class: 'label' }, 'Claim \u2014 evidence attached') : null)))
      )
    )
  );
}

export function About() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api('/statistics').then((r) => setStats(r.data)); }, []);
  return withFooter(
    h('main', null,
      h(Reveal, { as: 'section', class: 'section' },
        h('h1', null, 'About Ravel'),
        h('p', { class: 'lede' }, 'Ravel Materials SAS operates chemical recycling that returns mixed polyamide waste to virgin-quality pellet.')
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'The hard facts'),
        !stats ? h(Loading) : h('ul', { style: 'list-style:none;padding:0;margin:0' }, stats.map((s) => h('li', { class: 'sheet' },
          h('p', { class: 'body-big' }, s.value),
          h('p', { class: 'body-small' }, 'Source: ', s.source, ', ', s.year, ', ', s.geography, '.'))))
      )
    )
  );
}

export function Careers() {
  const [positions, setPositions] = useState(null);
  useEffect(() => { api('/positions').then((r) => setPositions(r.data || [])); }, []);
  return withFooter(
    h('main', null,
      h(Reveal, { as: 'section', class: 'section' },
        h('h1', null, 'Careers'),
        h('h2', null, 'Why this problem matters'),
        h('p', { class: 'lede' }, 'Less than 1 per cent of textiles are recycled into new materials. More than 8 per cent of textile waste is incinerated each year in the EU-27, and plastics production emits 1.8 gigatonnes of carbon dioxide equivalent a year. Nylon is a small slice of that and a solvable one: it can be returned to its monomer and rebuilt at virgin quality.'),
        h('p', { class: 'body-regular' }, 'The work is unglamorous and exacting. It is measurement, arithmetic and custody, and the product of it is a claim a regulator accepts.')
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'Open positions'),
        h('p', { class: 'body-regular' }, 'There ', positions === null ? 'are positions loading' : (positions.length === 1 ? 'is 1 open position' : `are ${positions.length} open positions`), '.'),
        positions === null ? h(Loading) : (positions.length === 0 ? h(Empty, null, 'There are no open positions right now.') :
          h('ul', { style: 'list-style:none;padding:0;margin:0' }, positions.map((p) => h('li', { class: 'card' },
            h('h3', null, p.title),
            h('p', { class: 'body-small' }, p.location, ' \u00b7 ', p.department, ' \u00b7 ', p.contract_type, ' \u00b7 closes ', fmt.date(p.closes_on))))))
      )
    )
  );
}

export function News() {
  const [news, setNews] = useState(null);
  useEffect(() => { api('/news').then((r) => setNews(r.data || [])); }, []);
  const body = h('main', null,
    h(Reveal, { as: 'section', class: 'section' },
      h('h1', null, 'News'),
      h('p', { class: 'lede' }, 'One event is listed once with its coverage.'),
      news === null ? h(Loading) : (news.length === 0 ? h(Empty, null, 'There are no news items yet.') :
        h('ul', { style: 'list-style:none;padding:0;margin:0', class: 'grid' }, news.map((n) => h('li', { class: 'card' },
          h('p', { class: 'label' }, n.tag),
          h('h3', null, n.title),
          h('p', { class: 'body-small' },
            h('span', null, n.outlet), ' \u00b7 ', fmt.date(n.date), ' \u00b7 ',
            h('a', { href: n.link }, 'coverage'),
            n.language && n.language !== 'en' ? h('span', null, ' \u00b7 in ', n.language === 'fr' ? 'French' : n.language) : null)))))));
  return withFooter(body);
}

export function Contact() {
  const types = [
    ['waste_supply', 'Waste supply', 'feedstock@example.com', '3 days'],
    ['polymer_purchase', 'Polymer purchase', 'sales@example.com', '2 days'],
    ['partnership', 'Partnership', 'partners@example.com', '5 days'],
    ['press', 'Press', 'press@example.com', '1 day']
  ];
  const [form, setForm] = useState({ type: 'waste_supply', name: '', email: '', message: '' });
  const [state, setState] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    const r = await api('/enquiries', { method: 'POST', body: form });
    setState(r.ok ? { ok: true, data: r.data } : { ok: false, error: r.data?.error });
  };
  return withFooter(
    h('main', null,
      h(Reveal, { as: 'section', class: 'section' },
        h('h1', null, 'Contact'),
        h('p', { class: 'lede' }, 'Four enquiry types, four destinations, four stated response times.'),
        h('div', { class: 'table-wrap' },
          h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Enquiry type'), h('th', null, 'Destination'), h('th', null, 'Response time'))),
            h('tbody', null, types.map((t) => h('tr', null, h('td', null, t[1]), h('td', { class: 'mono' }, t[2]), h('td', null, t[3]))))))
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'Send an enquiry'),
        h('form', { onSubmit: submit, class: 'sheet', novalidate: true },
          h('fieldset', null,
            h('legend', null, 'Enquiry type'),
            h('label', { class: 'label', for: 'type' }, 'Type'),
            h('select', { id: 'type', value: form.type, onChange: (e) => setForm({ ...form, type: e.target.value }) },
              types.map((t) => h('option', { value: t[0] }, t[1])))),
          h('fieldset', null, h('label', { class: 'label', for: 'name' }, 'Name'), h('input', { id: 'name', required: true, value: form.name, onInput: (e) => setForm({ ...form, name: e.target.value }) })),
          h('fieldset', null, h('label', { class: 'label', for: 'email' }, 'Email'), h('input', { id: 'email', type: 'email', required: true, value: form.email, onInput: (e) => setForm({ ...form, email: e.target.value }) })),
          h('fieldset', null, h('label', { class: 'label', for: 'message' }, 'Message'), h('textarea', { id: 'message', rows: 4, value: form.message, onInput: (e) => setForm({ ...form, message: e.target.value }) })),
          h('button', { type: 'submit' }, 'Send enquiry'),
          state === 'sending' ? h('p', { class: 'body-small', role: 'status' }, 'Sending\u2026') : null,
          state && state.ok === true ? h('div', { class: 'banner', role: 'status' },
            h('p', { class: 'label' }, 'Received'),
            h('p', { class: 'body-regular' }, `Your enquiry is ${state.data.reference}. It has gone to ${state.data.destination}, who answer within ${state.data.response_days} days. We have sent you a confirmation mail.`)) : null,
          state && state.ok === false ? h('div', { class: 'banner', role: 'alert' },
            h('p', { class: 'label' }, 'Not sent'),
            h('p', { class: 'body-regular' }, `The form failed: ${state.error}. Check the address and try again, or write to partnerships@example.com, which does not depend on this form working.`)) : null
        ),
        h('p', { class: 'body-small' }, 'Who receives this data: the destination named above. What it is used for: answering your enquiry. How long it is kept: 12 to 36 months by type. How to have it removed: privacy@example.com.')
      )
    )
  );
}

export function Privacy() {
  const rows = [
    ['An enquiry', '24 months', 'Answering your enquiry'],
    ['A waste-supply enquiry', '36 months', 'Assessing and onboarding a collector'],
    ['A polymer enquiry', '36 months', 'Qualifying a customer'],
    ['A press enquiry', '12 months', 'Answering press'],
    ['An account and its acts', '120 months', 'Scheme and statutory obligation'],
    ['The record', '180 months', 'Scheme and statutory obligation']
  ];
  return withFooter(
    h('main', null,
      h(Reveal, { as: 'section', class: 'section' },
        h('h1', null, 'Privacy'),
        h('p', { class: 'lede' }, 'Ravel Materials SAS is the controller. Postal address: 14 Rue de la R\u00e9sorption, 69007 Lyon, France.'),
        h('p', { class: 'body-regular' }, 'A rights request goes to privacy@example.com. A security disclosure goes to security@example.com.'),
        h('p', { class: 'body-regular' }, 'The operational record names individuals. It is retained under a legal and scheme obligation and is not erased on request. A former employee\u2019s contact detail is.')
      ),
      h(Reveal, { as: 'section', class: 'section' },
        h('h2', null, 'Retention by purpose'),
        h('div', { class: 'table-wrap' },
          h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Purpose'), h('th', null, 'Retention'), h('th', null, 'Why'))),
            h('tbody', null, rows.map((r) => h('tr', null, h('td', null, r[0]), h('td', { class: 'mono' }, r[1]), h('td', null, r[2]))))))
      )
    )
  );
}

export function Verify({ params }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/verify/' + encodeURIComponent(params.number)).then((r) => r.json()).then(setData).catch(() => setData({ found: false }));
  }, [params.number]);
  return withFooter(
    h('main', null,
      h('section', { class: 'section' },
        h('p', { class: 'label' }, 'Certificate verification'),
        h('h1', { class: 'mono', style: 'font-size:1.625rem;line-height:1.8125rem' }, params.number),
        !data ? h(Loading) : h('div', { class: 'sheet' },
          data.found === false
            ? h('div', null,
                h('p', { class: 'verify-state' }, 'There is no such certificate.'),
                h('p', { class: 'body-regular' }, 'This number does not resolve to a certificate Ravel issued. Check the number and try again.')
              )
            : h('div', null,
                h('p', { class: 'verify-state' },
                  data.state === 'withdrawn' ? h(Word, { kind: 'withdrawn' }, 'withdrawn') : null, ' ',
                  data.state === 'withdrawn' ? null : h(Word, { kind: 'note' }, data.state)),
                data.state === 'withdrawn' ? h('p', { class: 'body-big' }, `This certificate was withdrawn on ${fmt.date(data.withdrawn_on)}. Reason: ${data.withdrawal_reason}.`) : null,
                h('dl', { class: 'grid cols-2' },
                  h('div', null, h('dt', { class: 'label' }, 'Issued on'), h('dd', { class: 'mono body-regular' }, fmt.date(data.issued_on))),
                  h('div', null, h('dt', { class: 'label' }, 'Site'), h('dd', { class: 'mono body-regular' }, data.site)),
                  h('div', null, h('dt', { class: 'label' }, 'Grade'), h('dd', { class: 'mono body-regular' }, data.grade)),
                  h('div', null, h('dt', { class: 'label' }, 'Recipient'), h('dd', { class: 'body-regular' }, data.recipient_name)),
                  h('div', null, h('dt', { class: 'label' }, 'Claim type'), h('dd', { class: 'body-regular' }, data.claim_type)),
                  h('div', null, h('dt', { class: 'label' }, 'Recycled content'), h('dd', { class: 'body-regular' }, h(FigurePair, { main: data.content_bp, note: data.claim_type })))
                ),
                h('p', { class: 'body-small' }, 'A withdrawn certificate stays readable at its address and is not forwarded to a replacement. Verify this certificate at ravel.example.com/verify/' + data.number + '.')
              ))
      )
    )
  );
}
