import { h } from 'preact';
import { Meta, useData, Loading } from '../../components/ui.jsx';
const LABELS = { mass_balance_residual_g: 'Mass balance residual', credit_margin_g: 'Credit margin', consumptions_on_open_runs: 'Consumptions on open runs', batches_with_broken_custody: 'Batches with broken custody', certificates_with_superseded_figures: 'Certificates with superseded figures' };
export default function Reconciliation() {
  const rec = useData('/reconciliation');
  const inbound = useData('/inbound');
  if (rec.loading) return h('div', { class: 'route shell' }, h(Meta, { title: 'Reconciliation | Ravel console', description: 'Six figures, refreshed on a schedule.' }), h(Loading));
  const d = rec.data || {};
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'Reconciliation | Ravel console', description: 'Six figures rather than six verdicts, with the mass balance residual as the headline.' }),
    h('h1', null, 'Reconciliation'),
    h('p', { class: 'small' }, `Six figures, none a badge and none styled as passing. Read at ${String(d.read_at).slice(0, 19).replace('T', ' ')} UTC.`),
    h('section', null, h('h2', { class: 'label' }, 'Figures for this period'),
      h('div', { class: 'figrows' }, Object.entries(LABELS).map(([k, label]) => h('div', { class: 'figrow', key: k },
        h('span', { class: 'label' }, label), h('span', { class: 'mono' }, (d[k] ?? 0).toLocaleString('en-GB'))))),
      h('p', { class: 'small' }, d.derivation?.mass_balance_residual_g + '.')),
    h('section', null, h('h2', { class: 'label' }, 'Inbound integration ages'),
      h('div', { class: 'figrows' }, Object.entries(d.integration_ages || {}).map(([src, age]) => h('div', { class: 'figrow', key: src },
        h('span', { class: 'label' }, src.replace(/_/g, ' ')),
        h('span', { class: 'mono' }, age == null ? 'null — never sent' : `${age.toLocaleString('en-GB')} hours ago`))))),
    h('section', null, h('h2', { class: 'label' }, 'What has arrived, kept verbatim'),
      inbound.loading ? h(Loading) : (inbound.data || []).length === 0 ? h(Empty, null, 'No inbound records have arrived yet.') :
        h('ul', null, (inbound.data || []).map((r) => h('li', { class: 'card small', key: r.reference, style: 'display:grid;gap:.3rem' },
          h('div', { class: 'spread' }, h('span', { class: 'mono' }, r.reference), h('span', { class: 'label' }, r.source.replace(/_/g, ' '))),
          h('p', { class: 'mono' }, String(r.received_at).slice(0, 19).replace('T', ' ')),
          h('pre', { class: 'mono', style: 'white-space:pre-wrap;margin:0;font-size:var(--step-small);line-height:var(--lh-small)' }, JSON.stringify(r.payload_verbatim)))))));
}
