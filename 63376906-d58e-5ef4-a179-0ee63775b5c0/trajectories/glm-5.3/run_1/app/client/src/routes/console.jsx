import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api, fmt, getToken } from '../lib/api.js';
import { A, navigate } from '../lib/router.jsx';
import { Reveal, Word, FigurePair, Loading, Empty, Banner, IconLock, IconWarn, IconFlag, IconArrow } from '../components/chrome.jsx';

const STAGES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];

// /console and everything under it redirect an anonymous reader to /login.
export function Console({ path }) {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getToken()) { window.location.replace('/login'); return; }
    api('/auth/me').then((r) => {
      if (!r.ok) { window.location.replace('/login'); return; }
      setMe(r.data); setReady(true);
    });
  }, [path]);
  if (!ready) return h('main', null, h(Loading));
  if (path === '/console' || path === '/console/') return h(Board, { me });
  if (path.startsWith('/console/intake')) return h(Intake, { me });
  if (path.startsWith('/console/record')) return h(RecordView, { me, path });
  if (path.startsWith('/console/reconciliation')) return h(Reconciliation, { me });
  if (path.startsWith('/console/certificates/new')) return h(Wizard, { me, path });
  if (path.startsWith('/console/certificates/') && path.endsWith('/withdraw')) return h(Withdraw, { me, path });
  if (path.startsWith('/console/certificates')) return h(Certificates, { me, path });
  if (path.startsWith('/console/balance')) return h(Balance, { me, path });
  if (path.includes('/genealogy')) return h(Genealogy, { me, path });
  return h(Board, { me });
}

function SchemeBanner() {
  const [s, setS] = useState(null);
  useEffect(() => { api('/sites').then((r) => setS(r.data)); }, []);
  if (!s) return null;
  const suspended = s.filter((x) => x.certification_state === 'suspended');
  if (!suspended.length) return null;
  return suspended.map((x) => h('div', { class: 'banner', role: 'alert' },
    h('p', { class: 'label' }, 'Scheme status'),
    h('p', { class: 'body-regular' }, `Certification at ${x.name} (${x.reference}) is suspended. Issuing is stopped for that site and grade. `, h(A, { href: '/console/record' }, 'See the affected certificates.'))));
}

function Board({ me }) {
  const [runs, setRuns] = useState(null);
  useEffect(() => { api('/runs').then((r) => setRuns(r.data)); }, []);
  return h('main', null,
    h(SchemeBanner),
    h('h1', null, 'Board'),
    h('p', { class: 'lede' }, 'One column per process stage and one card per run. The column a card sits in is named in text on the card.'),
    runs === null ? h(Loading) : h('div', { class: 'board' }, STAGES.map((stage) => {
      const cards = (runs || []).filter((r) => r.run_type === stage);
      return h('section', { class: 'board-col', 'aria-label': stage },
        h('h2', { class: 'label' }, stage),
        cards.length === 0 ? h('p', { class: 'body-small' }, `No ${stage} run is open.`) :
          cards.map((r) => h('article', { class: 'card', key: r.reference },
            h('p', { class: 'stage' }, stage),
            h('p', { class: 'mono body-regular' }, h(A, { href: '/console/record' }, r.reference)),
            h('p', { class: 'body-small' }, r.site, ' \u00b7 recipe ', h('span', { class: 'mono' }, r.recipe_version)),
            h('p', { class: 'body-small' }, r.closed ? h(Word, { kind: 'note' }, 'closed') : h(Word, { kind: 'note' }, 'open'),
              ' losses ', h('span', { class: 'mono' }, r.losses_g === null ? '\u2014' : fmt.g(r.losses_g))),
            r.within_tolerance === false ? h('p', { class: 'body-small' }, h(IconWarn, null), ' outside tolerance') : null
          )));
    }))
  );
}

function Intake({ me }) {
  const [batches, setBatches] = useState(null);
  const [cols, setCols] = useState(null);
  const [sites, setSites] = useState(null);
  useEffect(() => {
    api('/batches').then((r) => setBatches(r.data));
    api('/collectors').then((r) => setCols(r.data));
    api('/sites').then((r) => setSites(r.data));
  }, []);
  const [form, setForm] = useState(null);
  const [result, setResult] = useState(null);
  const startForm = () => setForm({
    collector: 'COL-ALDER', site: 'SITE-DEMO', category: '', gross_g: 0, tare_g: 0, net_g: 0,
    moisture_bp: 0, moisture_method: 'ISO 15512', device: 'WB-DEMO-01',
    received_on: new Date().toISOString().slice(0, 10),
    composition: { polymer: 'PA6', fraction_bp: 9500, basis: 'declared' },
    contamination: { non_nylon_bp: 200, elastane_bp: 100, coatings: 'none', colour_load: 'low', foreign_matter: 'low' },
    custody: ['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'].map((k) => ({ kind: k, date: new Date().toISOString().slice(0, 10), party: 'recorded at intake' }))
  });
  const submit = async (e) => {
    e.preventDefault();
    const r = await api('/batches', { method: 'POST', body: form });
    setResult(r);
    if (r.ok) { setForm(null); api('/batches').then((x) => setBatches(x.data)); }
  };
  return h('main', null,
    h('h1', null, 'Intake'),
    h('p', { class: 'lede' }, 'A batch is booked in with its category, its mass as the weighbridge reported it, and its custody. The category has no default and cannot be changed after acceptance.'),
    me?.roles?.includes('plant_operator')
      ? (form ? h('form', { class: 'sheet', onSubmit: submit },
          h('fieldset', null, h('label', { class: 'label', for: 'collector' }, 'Collector'),
            h('select', { id: 'collector', value: form.collector, onChange: (e) => setForm({ ...form, collector: e.target.value }) },
              (cols || []).map((c) => h('option', { value: c.reference }, c.name, ' (', c.reference, ')')))),
          h('fieldset', null, h('label', { class: 'label', for: 'site' }, 'Site'),
            h('select', { id: 'site', value: form.site, onChange: (e) => setForm({ ...form, site: e.target.value }) },
              (sites || []).map((s) => h('option', { value: s.reference }, s.name)))),
          h('fieldset', null, h('label', { class: 'label', for: 'category' }, 'Category (required, no default)'),
            h('select', { id: 'category', required: true, value: form.category, onChange: (e) => setForm({ ...form, category: e.target.value }) },
              h('option', { value: '' }, 'Choose a category'),
              h('option', { value: 'post_consumer' }, 'post_consumer'),
              h('option', { value: 'pre_consumer' }, 'pre_consumer'))),
          ['gross_g', 'tare_g', 'net_g', 'moisture_bp'].map((f) => h('fieldset', { key: f },
            h('label', { class: 'label', for: f }, f),
            h('input', { id: f, type: 'number', step: '1', value: form[f], onInput: (e) => setForm({ ...form, [f]: Number(e.target.value) }) }))),
          h('fieldset', null, h('label', { class: 'label', for: 'received_on' }, 'Received on'),
            h('input', { id: 'received_on', type: 'date', value: form.received_on, onChange: (e) => setForm({ ...form, received_on: e.target.value }) })),
          h('button', { type: 'submit' }, 'Book in batch'),
          h('button', { type: 'button', class: 'linklike', onClick: () => setForm(null) }, 'Cancel'))
        : h('p', { class: 'body-regular' }, 'Booking in a batch is a plant operator act.'))
      : null,
    result && !result.ok ? h(Banner, { title: 'Refused' }, `This batch was not booked in: ${result.data?.error}. `, result.data?.field ? `The field ${result.data.field} was not accepted.` : '') : null,
    result && result.ok ? h(Banner, { title: 'Booked in' }, `The batch is ${result.data.reference}. Dry mass ${fmt.g(result.data.dry_mass_g)}, claimable ${String(result.data.claimable)}.`) : null,
    batches === null ? h(Loading) : (batches.length === 0 ? h(Empty, null, 'No batch has been booked in.') :
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Batch'), h('th', null, 'Collector'), h('th', null, 'Category'), h('th', { class: 'num' }, 'Net'), h('th', { class: 'num' }, 'Dry mass'), h('th', null, 'Claimable'), h('th', null, 'Flags'))),
          h('tbody', null, batches.map((b) => h('tr', { key: b.reference },
            h('td', { class: 'mono' }, b.reference),
            h('td', null, b.collector_name),
            h('td', null, b.category),
            h('td', { class: 'num mono' }, fmt.g(b.net_g)),
            h('td', { class: 'num mono' }, fmt.g(b.dry_mass_g)),
            h('td', null, b.claimable ? h(Word, null, 'claimable') : h(Word, { kind: 'note' }, 'non-claimable'), ' ', b.claimable_reason ? h('span', { class: 'body-small' }, b.claimable_reason.replace('custody_link_missing:', 'custody link missing: ').replace(/_/g, ' ')) : null),
            h('td', null, b.flags.length ? b.flags.map((f) => h(Word, { kind: 'note' }, f.replace(/_/g, ' '))) : '\u2014')
          ))))))
  );
}

function RecordView({ me, path }) {
  const [tab, setTab] = useState('runs');
  const [runs, setRuns] = useState(null);
  const [lots, setLots] = useState(null);
  const [entries, setEntries] = useState(null);
  useEffect(() => {
    api('/runs').then((r) => setRuns(r.data));
    api('/lots').then((r) => setLots(r.data));
    api('/record').then((r) => setEntries(r.data));
  }, []);

  const runsTable = runs === null ? h(Loading)
    : (runs.length === 0 ? h(Empty, null, 'No run has been opened.')
      : h('div', { class: 'table-wrap' }, h('table', null,
          h('thead', null, h('tr', null,
            h('th', null, 'Run'), h('th', null, 'Type'), h('th', null, 'Site'),
            h('th', { class: 'num' }, 'Mass in'), h('th', { class: 'num' }, 'Mass out'),
            h('th', { class: 'num' }, 'Losses'), h('th', null, 'State'), h('th', null, 'Tolerance'))),
          h('tbody', null, runs.map((r) => {
            const massIn = r.inputs.reduce((s, x) => s + x.mass_g, 0);
            const massOut = r.outputs.reduce((s, o) => s + o.mass_g, 0);
            return h('tr', { key: r.reference },
              h('td', { class: 'mono' }, r.reference), h('td', null, r.run_type), h('td', { class: 'mono' }, r.site),
              h('td', { class: 'num mono' }, fmt.g(massIn)), h('td', { class: 'num mono' }, fmt.g(massOut)),
              h('td', { class: 'num mono' }, r.losses_g === null ? '\u2014' : fmt.g(r.losses_g)),
              h('td', null, h(Word, { kind: 'note' }, r.closed ? 'closed' : 'open')),
              h('td', null, r.within_tolerance === false ? h(Word, { kind: 'note' }, 'outside') : 'within'));
          })))));

  const lotsTable = lots === null ? h(Loading)
    : (lots.length === 0 ? h(Empty, null, 'No lot has been produced.')
      : h('div', { class: 'table-wrap' }, h('table', null,
          h('thead', null, h('tr', null,
            h('th', null, 'Lot'), h('th', null, 'Site'), h('th', { class: 'num' }, 'Mass'),
            h('th', null, 'Claim'), h('th', { class: 'num' }, 'Recycled content'), h('th', null, 'Disposition'), h('th', null, ''))),
          h('tbody', null, lots.map((l) => h('tr', { key: l.reference },
            h('td', { class: 'mono' }, l.reference),
            h('td', { class: 'mono' }, l.site),
            h('td', { class: 'num mono' }, fmt.g(l.mass_g)),
            h('td', null, l.claim_type),
            h('td', { class: 'num' }, h(FigurePair, { main: l.content_bp === null ? '\u2014' : l.content_bp, note: l.claim_type })),
            h('td', null, h(Word, { kind: l.disposition === 'released' ? '' : 'note' }, l.disposition)),
            h('td', null, h(A, { href: '/console/lots/' + l.reference + '/genealogy' }, 'genealogy'))))))));

  const recordBlock = entries === null ? h(Loading)
    : (entries.length === 0 ? h(Empty, null, 'The record is empty.')
      : h('div', null,
          h('p', { class: 'body-small' }, entries.length, ' entries. Each digest is computed over the entry\u2019s own content and the previous entry\u2019s digest.'),
          h('div', { class: 'table-wrap' }, h('table', null,
            h('thead', null, h('tr', null, h('th', { class: 'num' }, 'Seq'), h('th', null, 'When'), h('th', null, 'Who'), h('th', null, 'Act'), h('th', null, 'Object'), h('th', null, 'Digest'))),
            h('tbody', null, entries.map((e) => h('tr', { key: e.seq },
              h('td', { class: 'num mono' }, e.seq),
              h('td', { class: 'mono body-small' }, fmt.date(e.recorded_at)),
              h('td', { class: 'body-small' }, e.person || '(system)'),
              h('td', null, e.act.replace(/_/g, ' ')),
              h('td', { class: 'mono body-small' }, e.object || '\u2014'),
              h('td', { class: 'mono body-small' }, e.digest.slice(0, 12) + '\u2026')))))),
          h('p', null, h(A, { href: '/console/reconciliation', class: 'body-small' }, 'Reconciliation view'))));

  return h('main', null,
    h('h1', null, 'The operational record'),
    h('p', { class: 'lede' }, 'What the plant did, after the fact. Every mutating control is absent for an auditor, and every export is itself an entry.'),
    h('nav', { class: 'nav', 'aria-label': 'Record sections' },
      [['runs', 'Runs'], ['lots', 'Lots'], ['record', 'The record']].map(([k, label]) =>
        h('button', { key: k, class: 'linklike', onClick: () => setTab(k), 'aria-current': tab === k ? 'true' : null }, label))),
    tab === 'runs' ? runsTable : null,
    tab === 'lots' ? lotsTable : null,
    tab === 'record' ? recordBlock : null);
}

function Reconciliation({ me }) {
  const [d, setD] = useState(null);
  useEffect(() => { api('/reconciliation').then((r) => setD(r.data)); }, []);
  return h('main', null,
    h('h1', null, 'Reconciliation'),
    h('p', { class: 'lede' }, 'Six figures rather than six verdicts. A screen of numbers expected to be non-zero.'),
    !d ? h(Loading) : h('div', { class: 'grid cols-2' },
      h('div', { class: 'sheet' }, h('h2', null, 'Mass balance residual'), h(FigurePair, { main: d.mass_balance_residual_g, unit: 'g', note: 'total mass consumed minus total mass produced' })),
      h('div', { class: 'sheet' }, h('h2', null, 'Credit margin'), h(FigurePair, { main: d.credit_margin_g, unit: 'g', note: 'fresh credit in minus credit attached to lots' })),
      h('div', { class: 'sheet' }, h('h2', null, 'Consumptions on open runs'), h(FigurePair, { main: d.consumptions_on_open_runs, note: 'runs still writable' })),
      h('div', { class: 'sheet' }, h('h2', null, 'Batches with broken custody'), h(FigurePair, { main: d.batches_with_broken_custody, note: 'missing a custody link' })),
      h('div', { class: 'sheet' }, h('h2', null, 'Certificates with superseded figures'), h(FigurePair, { main: d.certificates_with_superseded_figures, note: 'carrying a figure no longer current' })),
      h('div', { class: 'sheet' }, h('h2', null, 'Integration ages'),
        h('ul', { style: 'list-style:none;padding:0;margin:0' }, Object.entries(d.integration_ages).map(([k, v]) =>
          h('li', { class: 'body-regular' }, k.replace(/_/g, ' '), ': ', h('span', { class: 'mono' }, v === null ? 'null \u2014 never sent' : v + ' hours'))))),
      h('p', { class: 'body-small' }, 'Read at ', h('span', { class: 'mono' }, d.read_at), '.'))
  );
}

function Certificates({ me, path }) {
  const [certs, setCerts] = useState(null);
  const [detail, setDetail] = useState(null);
  const [doc, setDoc] = useState(null);
  useEffect(() => { api('/certificates').then((r) => setCerts(r.data)); }, []);
  const number = path.startsWith('/console/certificates/') ? decodeURIComponent(path.split('/')[3]) : null;
  useEffect(() => {
    if (!number) { setDetail(null); setDoc(null); return; }
    api('/certificates/' + number).then((r) => setDetail(r.data));
    fetch('/api/certificates/' + number + '/document').then((r) => r.text()).then(setDoc);
  }, [number]);
  const canSign = (me?.roles || []).includes('certificate_signer');
  return h('main', null,
    h('h1', null, 'Certificates'),
    h('p', { class: 'lede' }, 'Issued artefacts. A withdrawn certificate says withdrawn before it shows any figure.'),
    canSign ? h('p', null, h(A, { href: '/console/certificates/new/lot', class: 'btn' }, 'Issue a certificate ', h('span', { class: 'btn-arrow' }, '\u2192'))) : null,
    certs === null ? h(Loading) : (certs.length === 0 ? h(Empty, null, 'No certificate has been issued.') :
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Number'), h('th', null, 'Site'), h('th', null, 'Recipient'), h('th', null, 'Claim'), h('th', { class: 'num' }, 'Content'), h('th', null, 'State'))),
        h('tbody', null, certs.map((c) => h('tr', { key: c.number },
          h('td', { class: 'mono' }, h(A, { href: '/console/certificates/' + c.number }, c.number)),
          h('td', { class: 'mono' }, c.site),
          h('td', null, c.recipient),
          h('td', null, c.claim_type),
          h('td', { class: 'num' }, h(FigurePair, { main: c.content_bp, note: c.claim_type })),
          h('td', null, c.state === 'withdrawn' ? h(Word, { kind: 'withdrawn' }, 'withdrawn') : h(Word, null, c.state)))))))),
    detail ? h('section', { class: 'sheet' },
      h('h2', null, detail.number, ' ', detail.state === 'withdrawn' ? h(Word, { kind: 'withdrawn' }, 'withdrawn') : null),
      detail.state === 'withdrawn' ? h(Banner, { title: 'Withdrawn' }, `This certificate was withdrawn on ${fmt.date(detail.withdrawn_on)}. Reason: ${detail.withdrawal_reason}.`) : null,
      h('dl', { class: 'grid cols-2' },
        h('div', null, h('dt', { class: 'label' }, 'Recycled content'), h('dd', null, h(FigurePair, { main: detail.content_bp, note: detail.claim_type }))),
        h('div', null, h('dt', { class: 'label' }, 'Carbon'), h('dd', null, detail.carbon ? h(FigurePair, { main: detail.carbon.value_mg_per_kg, note: `${detail.carbon.boundary}, ${detail.carbon.method_version}, uncertainty ${detail.carbon.uncertainty_bp} bp` }) : '\u2014')),
        h('div', null, h('dt', { class: 'label' }, 'Scheme'), h('dd', { class: 'body-regular' }, detail.scheme, ' \u00b7 ', h('span', { class: 'mono' }, detail.registration))),
        h('div', null, h('dt', { class: 'label' }, 'Period'), h('dd', { class: 'mono body-regular' }, detail.period)),
        h('div', null, h('dt', { class: 'label' }, 'Specification'), h('dd', { class: 'mono body-regular' }, detail.specification, ' v', detail.specification_version)),
        h('div', null, h('dt', { class: 'label' }, 'Provisional factor'), h('dd', null, detail.provisional_factor ? h(Word, { kind: 'note' }, 'provisional factor') : 'no')),
        h('div', null, h('dt', { class: 'label' }, 'Permitted statement'), h('dd', { class: 'body-regular' }, detail.permitted_statement)),
        h('div', null, h('dt', { class: 'label' }, 'Prohibited statement'), h('dd', { class: 'body-regular' }, detail.prohibited_statement))),
      h('p', { class: 'body-small' }, 'The recipient files this document with their own regulator.'),
      doc ? h('div', null, h('h3', null, 'The document'), h('pre', { class: 'doc' }, doc)) : null,
      canSign && detail.state !== 'withdrawn' && (me?.sites || []).includes(detail.site)
        ? h('p', null, h(A, { href: '/console/certificates/' + detail.number + '/withdraw', class: 'btn' }, 'Begin a withdrawal')) : null
    ) : null
  );
}

function Withdraw({ me, path }) {
  const number = decodeURIComponent(path.split('/')[3]);
  const [cert, setCert] = useState(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { api('/certificates/' + number).then((r) => setCert(r.data)); }, [number]);
  const submit = async (e) => {
    e.preventDefault();
    const r = await api('/certificates/' + number + '/withdraw', { method: 'POST', body: { reason } });
    setResult(r);
    if (r.ok) setConfirming(false);
  };
  return h('main', null,
    h('h1', null, 'Withdraw ', h('span', { class: 'mono' }, number)),
    h('p', { class: 'lede' }, 'One action with five consequences. A withdrawal is never a deletion and the document stays readable at its address.'),
    !cert ? h(Loading) : h('div', null,
      h('div', { class: 'sheet' },
        h('h2', null, 'The five consequences'),
        h('ol', { class: 'body-regular' },
          h('li', null, 'The state becomes withdrawn, with the reason, the person and the date.'),
          h('li', null, 'The recipient is notified through mailpit, and the notification is part of the record.'),
          h('li', null, 'Every downstream statement the recipient was permitted to make is enumerated in the notification.'),
          h('li', null, 'Every certificate derived from this one is identified and resolved.'),
          h('li', null, 'The reverse traversal of the underlying batches runs, so every other certificate touching them is enumerated in the same action.')),
        h('h3', null, 'Recipients who will be notified, by name'),
        h('ul', null, h('li', { class: 'body-regular' }, cert.recipient, ' (', cert.recipient, ')')),
        h('h3', null, 'Statements that become void'),
        h('ul', null,
          h('li', { class: 'body-regular' }, cert.permitted_statement),
          h('li', { class: 'body-regular' }, cert.prohibited_statement),
          h('li', { class: 'body-regular' }, `Any claim of ${cert.content_bp} basis points of recycled content under ${cert.scheme}.`))),
      confirming ? h('form', { class: 'sheet', onSubmit: submit },
        h('fieldset', null, h('label', { class: 'label', for: 'reason' }, 'Reason (the only free text on a certificate)'),
          h('textarea', { id: 'reason', rows: 3, required: true, value: reason, onInput: (e) => setReason(e.target.value) })),
        h('button', { type: 'submit' }, 'Confirm withdrawal'),
        h('button', { type: 'button', class: 'linklike', onClick: () => setConfirming(false) }, 'Go back'))
        : h('p', null, h('button', { onClick: () => setConfirming(true) }, 'Continue to confirm'))),
    result && !result.ok ? h(Banner, { title: 'Refused' }, `The withdrawal did not happen: ${result.data?.error}.`) : null,
    result && result.ok ? h(Banner, { title: 'Withdrawn' }, `Certificate ${number} is withdrawn. ${result.data.notified_recipients.length} recipient notified. ${result.data.void_statements.length} statements are now void. The address still resolves and states the withdrawal. `, h(A, { href: '/verify/' + number }, 'See the public page.')) : null
  );
}

function Wizard({ me, path }) {
  const steps = ['/console/certificates/new/lot', '/console/certificates/new/claim', '/console/certificates/new/recipient', '/console/certificates/new/review'];
  const step = steps.indexOf(path);
  // the four steps are four addresses, so the choice travels with the wizard
  const [lot, setLot] = useState(() => localStorage.getItem('ravel_wizard_lot') || 'LOT-N6-0001');
  const [recipient, setRecipient] = useState('CUS-HELIOS');
  const [lots, setLots] = useState(null);
  const [preview, setPreview] = useState(null);
  const [password, setPassword] = useState('');
  const [result, setResult] = useState(null);
  useEffect(() => { api('/lots').then((r) => setLots(r.data)); }, [step]);
  useEffect(() => {
    if (!lot) return;
    localStorage.setItem('ravel_wizard_lot', lot);
    setPreview(null);
    api('/certificates/preview', { method: 'POST', body: { lot, recipient } }).then((r) => setPreview(r.data));
  }, [lot, recipient, step]);
  const sign = async () => {
    const r = await api('/certificates', { method: 'POST', body: { lot, recipient, password } });
    setResult(r);
  };
  const canSign = (me?.roles || []).includes('certificate_signer');
  const conditionLabel = {
    lot_released: 'The lot is released',
    no_open_deviation: 'No deviation touching it is open',
    no_unreviewed_override: 'No override on it is unreviewed',
    period_closed: 'The bookkeeping period is closed',
    balance_invariant_holds: 'The balance invariant holds with the allocation applied',
    carbon_figure_complete: 'The carbon figure exists with all four components',
    signer_scope_covers_site: 'The signer holds signing scope for that site on the date of signing',
    signer_did_not_enter_data: 'The signer did not enter the data'
  };
  return h('main', null,
    h('h1', null, 'Issue a certificate'),
    h('p', { class: 'lede' }, 'Four steps, four addresses. Each step shows the eight conditions as they stand. None of the eight is waivable and no control on this screen dismisses one.'),
    h('nav', { class: 'nav', 'aria-label': 'Wizard steps' }, ['Lot', 'Claim', 'Recipient', 'Review'].map((label, i) =>
      h(A, { href: steps[i], 'aria-current': i === step ? 'step' : null }, `${i + 1}. ${label}`))),
    step === 0 ? h('section', { class: 'sheet' },
      h('h2', null, 'Choose a lot'),
      lots === null ? h(Loading) : h('ul', { style: 'list-style:none;padding:0;margin:0' },
        lots.map((l) => h('li', { key: l.reference, class: 'card' },
          h('label', { class: 'label' },
            h('input', { type: 'radio', name: 'lot', checked: lot === l.reference, onChange: () => setLot(l.reference) }),
            ' ', h('span', { class: 'mono' }, l.reference), ' \u2014 ', l.site, ', ', fmt.g(l.mass_g), ', ', l.disposition,
            l.content_bp !== null ? `, ${l.content_bp} bp (${l.claim_type})` : ', no claim attached'))))
    ) : null,
    step === 1 ? h('section', { class: 'sheet' },
      h('h2', null, 'The claim'),
      preview ? h('div', null,
        h('p', { class: 'body-regular' }, 'Recycled content ', h(FigurePair, { main: preview.content_bp === null ? '\u2014' : preview.content_bp, note: preview.claim_type }), '.'),
        h('p', { class: 'body-regular' }, 'This material is claimed by mass balance. It is not physically segregated.'),
        h('p', { class: 'body-regular' }, 'You may not state that this material physically contains recycled content.')) : h(Loading)
    ) : null,
    step === 2 ? h('section', { class: 'sheet' },
      h('h2', null, 'Choose the recipient'),
      h('label', { class: 'label', for: 'recipient' }, 'Recipient'),
      h('select', { id: 'recipient', value: recipient, onChange: (e) => setRecipient(e.target.value) },
        h('option', { value: 'CUS-HELIOS' }, 'CUS-HELIOS \u2014 Helios Textiles'),
        h('option', { value: 'CUS-VANTA' }, 'CUS-VANTA \u2014 Vanta Automotive')),
      h('p', { class: 'body-regular' }, 'The recipient files this document with their own regulator.')
    ) : null,
    step === 3 ? h('section', { class: 'sheet' },
      h('h2', null, 'Review and sign'),
      h('p', { class: 'body-regular' }, 'Signing is a separate, deliberate act. Your identity is confirmed again at this moment: a session alone is not a signing credential.'),
      preview ? h('ol', { style: 'padding-left:1.25rem' }, preview.conditions.map((c) => h('li', { key: c.condition, class: 'body-regular' },
        c.satisfied ? conditionLabel[c.condition] + ' \u2014 satisfied'
          : h('span', null, conditionLabel[c.condition] + ' \u2014 not satisfied. ', c.blocking_reference ? h(A, { href: c.blocking_reference }, 'See the record that would resolve it.') : null))))
        : h(Loading),
      canSign && preview && preview.all_satisfied ? h('div', null,
        h('fieldset', null, h('label', { class: 'label', for: 'password' }, 'Confirm your password to sign'),
          h('input', { id: 'password', type: 'password', value: password, onInput: (e) => setPassword(e.target.value) })),
        h('button', { onClick: sign }, 'Sign certificate'),
        h('p', { class: 'body-small' }, 'The recipient will file the document with a regulator.')) : null,
      preview && !preview.all_satisfied ? h(Banner, { title: 'One condition is not satisfied' }, 'This certificate cannot be signed. No control on this screen dismisses the condition.') : null,
      result && !result.ok ? h(Banner, { title: 'Refused' }, `The certificate was not signed: ${result.data?.condition || result.data?.error}.`) : null,
      result && result.ok ? h(Banner, { title: 'Signed' }, `Certificate ${result.data.number} is issued. `, h(A, { href: '/console/certificates/' + result.data.number }, 'Open it.')) : null
    ) : null,
    h('section', { class: 'sheet' },
      h('h2', null, 'The eight conditions'),
      preview ? h('div', { class: 'grid' }, preview.conditions.map((c) => h('div', { key: c.condition, class: 'card' },
        h('p', { class: 'body-regular' },
          c.satisfied ? h(Word, null, 'satisfied') : h(Word, { kind: 'note' }, 'not satisfied'), ' ', conditionLabel[c.condition]),
        !c.satisfied && c.blocking_reference ? h('p', { class: 'body-small' }, h(A, { href: c.blocking_reference }, 'See the record that would resolve it')) : null))) : h(Loading))
  );
}

function Balance({ me, path }) {
  const [periods, setPeriods] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [refusal, setRefusal] = useState(null);

  useEffect(() => {
    api('/balance-periods').then((r) => {
      const list = r.data || [];
      setPeriods(list);
      const fromPath = path.split('/')[3];
      if (fromPath) setSelected(fromPath);
      else if (list.length) setSelected((list.find((p) => p.state === 'open') || list[0]).id);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    api('/balance-periods/' + selected).then((r) => setDetail(r.data));
  }, [selected]);

  const categoryCard = (cat) => h('div', { class: 'card', key: cat },
    h('h3', null, cat.replace(/_/g, ' ')),
    h('div', { class: 'grid cols-3' },
      h('div', null, h('p', { class: 'label' }, 'Credits in'), h(FigurePair, { main: detail.credits[cat].credits_in_g, unit: 'g' })),
      h('div', null, h('p', { class: 'label' }, 'Credits out'), h(FigurePair, { main: detail.credits[cat].credits_out_g, unit: 'g' })),
      h('div', null, h('p', { class: 'label' }, 'Credits available'), h(FigurePair, { main: detail.credits[cat].credits_available_g, unit: 'g', note: 'the margin, as a mass' }))));

  const factorTable = detail && detail.conversion_factors && detail.conversion_factors.length
    ? h('div', { class: 'sheet' },
        h('h2', null, 'Conversion factors in force'),
        h('div', { class: 'table-wrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Reference'), h('th', { class: 'num' }, 'Factor (bp)'), h('th', null, 'Derivation window'), h('th', null, ''))),
          h('tbody', null, detail.conversion_factors.map((f) => h('tr', { key: f.reference },
            h('td', { class: 'mono' }, f.reference),
            h('td', { class: 'num mono' }, f.factor_bp),
            h('td', { class: 'body-small' }, f.derivation_window.from
              ? f.derivation_window.from + ' to ' + f.derivation_window.to + ', ' + f.derivation_window.in_g + ' g in, ' + f.derivation_window.out_g + ' g out'
              : 'no window \u2014 provisional'),
            h('td', null, f.provisional ? h(Word, { kind: 'note' }, 'provisional') : null)))))))
    : null;

  const periodNav = periods === null ? null : h('nav', { class: 'nav', 'aria-label': 'Balance periods' },
    periods.map((p) => h('button', { key: p.id, class: 'linklike', onClick: () => setSelected(p.id), 'aria-current': selected === p.id ? 'true' : null },
      h('span', { class: 'mono' }, p.id))));

  const body = detail === null ? h(Loading) : h('div', null,
    h('div', { class: 'sheet' },
      h('h2', null, detail.id, ' ', h(Word, { kind: detail.state === 'closed' ? 'note' : '' }, detail.state)),
      detail.state === 'closed' ? h('p', { class: 'body-regular' }, 'This period is closed. Corrections require a restatement.') : null,
      ['post_consumer', 'pre_consumer'].map(categoryCard),
      h('p', { class: 'body-small' }, 'Non-claimable input ', h('span', { class: 'mono' }, fmt.g(detail.non_claimable_input_g)), '.'),
      h('p', { class: 'body-small' }, 'Derivation: ', detail.credits.post_consumer.derivation, '.'),
      detail.inbound_credits && detail.inbound_credits.length
        ? h('p', { class: 'body-small' }, 'Inbound credits: ',
            detail.inbound_credits.map((i) => i.mass_g + ' g from ' + i.origin_site + ' (' + i.movement + ', fresh credit ' + String(i.fresh_credit) + ')').join('; '), '.')
        : null),
    h('div', { class: 'sheet' },
      h('h2', null, 'Three counts, none a badge to be cleared'),
      h('ul', null,
        h('li', { class: 'body-regular' }, 'Overrides this period: ', h('span', { class: 'mono' }, detail.override_count)),
        h('li', { class: 'body-regular' }, 'Open restatements: ', h('span', { class: 'mono' }, detail.open_restatement_count)),
        h('li', { class: 'body-regular' }, 'Audit findings past their date: ', h('span', { class: 'mono' }, detail.open_finding_count)))),
    factorTable,
    refusal ? h(Banner, { title: 'This allocation is refused' },
      'This allocation is refused. Available: ' + refusal.available_g + ' g. Requested: ' + refusal.requested_g + ' g.') : null,
    h('p', { class: 'body-small' }, 'Losses reduce the claim. Read at ', h('span', { class: 'mono' }, detail.read_at), '.'));

  return h('main', null,
    h('h1', null, 'Balance'),
    h('p', { class: 'lede' }, 'Credits in, credits out and credits available, per category. There is no input control on this screen at all: every figure is derived and every figure links to the records it came from.'),
    periods === null ? h(Loading) : (periods.length === 0 ? h(Empty, null, 'There is no balance period yet.') : h('div', null, periodNav, body)));
}

function Genealogy({ me, path }) {
  const ref = decodeURIComponent(path.split('/')[3]);
  const [g, setG] = useState(null);
  const [mode, setMode] = useState('graph');
  const [exported, setExported] = useState(null);
  useEffect(() => { api('/lots/' + ref + '/genealogy').then((r) => setG(r.data)); }, [ref]);
  const doExport = async () => {
    const r = await api('/exports', { method: 'POST', body: { scope: 'genealogy', lots: [ref] } });
    setExported(r);
  };
  return h('main', null,
    h('h1', null, 'Genealogy of ', h('span', { class: 'mono' }, ref)),
    h('p', { class: 'lede' }, 'A graph and not a tree. A batch reached by several paths appears once with its total mass, and the same facts run backwards.'),
    h('nav', { class: 'nav', 'aria-label': 'Genealogy view' },
      h('button', { class: 'linklike', onClick: () => setMode('graph'), 'aria-current': mode === 'graph' ? 'true' : null }, 'Graph'),
      h('button', { class: 'linklike', onClick: () => setMode('list'), 'aria-current': mode === 'list' ? 'true' : null }, 'Nested list')),
    g === null || g === undefined ? h(Loading) : (!g ? h(Empty, null, 'There is no such lot.') : h('div', null,
      g.flagged ? h(Banner, { title: 'A flag is present in this graph' }, 'Something in this genealogy is flagged. It is visible here without expanding anything.') : null,
      mode === 'graph' ? h('div', { class: 'graph' },
        g.nodes.filter((n) => n.kind === 'batch').map((n) => h('div', { class: 'graph-node', key: n.reference },
          h('p', { class: 'label' }, 'Batch ', h('span', { class: 'mono' }, n.reference)),
          h('p', { class: 'body-regular' }, 'Mass contributed ', h('span', { class: 'mono' }, fmt.g(n.mass_g))),
          h('p', { class: 'body-small' }, 'Category split ', Object.entries(n.category_split).map(([k, v]) => `${k} ${v} g`).join(', ') || '\u2014'),
          n.flags.length ? h('p', null, n.flags.map((f) => h(Word, { kind: 'note' }, f.replace(/_/g, ' ')))) : null)),
        h('h2', null, 'Runs in the chain'),
        g.nodes.filter((n) => n.kind === 'run').map((n) => h('div', { class: 'graph-node', key: n.reference },
          h('p', { class: 'label' }, 'Run ', h('span', { class: 'mono' }, n.reference)),
          h('p', { class: 'body-regular' }, 'Mass ', h('span', { class: 'mono' }, fmt.g(n.mass_g))))),
        h('h2', null, 'Edges'),
        h('ul', { class: 'nested' }, g.edges.map((e, i) => h('li', { key: i, class: 'body-small mono' }, e.from, ' \u2192 ', e.to, ' ', fmt.g(e.mass_g)))))
      : h('div', null,
        h('p', { class: 'label' }, 'The same facts as a nested list'),
        h('ul', { class: 'nested' },
          h('li', null, h('p', { class: 'body-regular' }, 'Lot ', h('span', { class: 'mono' }, g.text_equivalent.lot.reference), ' ', fmt.g(g.text_equivalent.lot.mass_g))),
          g.text_equivalent.batches.map((b) => h('li', { key: b.reference },
            h('p', { class: 'body-regular' }, 'Batch ', h('span', { class: 'mono' }, b.reference), ' ', fmt.g(b.mass_g),
              ' \u00b7 ', Object.entries(b.category_split).map(([k, v]) => `${k} ${v} g`).join(', ')),
            b.flags.length ? h('p', { class: 'body-small' }, 'Flags: ', b.flags.join(', ')) : null)))),
      h('p', null, h('button', { onClick: doExport }, 'Export this genealogy'), ' ', exported ? h('span', { class: 'body-small' }, 'Export ', h('span', { class: 'mono' }, exported.data?.reference), ' recorded as an entry.') : null,
        ' ', h(IconArrow, null), ' ', h(A, { href: '/console/record' }, 'The record'))))
  );
}
