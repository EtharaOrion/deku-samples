import { h } from 'preact';
import { useState } from 'preact/hooks';
import { Meta, useData, Loading, Empty, Banner } from '../../components/ui.jsx';
import { api, uid } from '../../lib/api.js';
export default function Intake() {
  const batches = useData('/batches');
  const collectors = useData('/collectors');
  const [form, setForm] = useState({ collector: 'COL-ALDER', site: 'SITE-DEMO', category: '', gross_g: 0, tare_g: 0, net_g: 0, moisture_bp: 0, moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: new Date().toISOString().slice(0, 10) });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value === '' ? '' : (['gross_g','tare_g','net_g','moisture_bp'].includes(k) ? Number(e.target.value) : e.target.value) });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setResult(null);
    const custody = [
      { kind: 'collection_site', date: form.received_on, party: form.collector },
      { kind: 'collector', date: form.received_on, party: form.collector },
      { kind: 'transport', date: form.received_on, party: form.collector },
      { kind: 'arrival', date: form.received_on, party: form.site },
      { kind: 'weighing', date: form.received_on, party: form.site },
      { kind: 'acceptance', date: form.received_on, party: form.site },
    ];
    const body = { ...form, custody };
    const r = await api('/api/batches', { method: 'POST', headers: { 'idempotency-key': uid() }, body });
    setBusy(false);
    setResult({ ok: r.ok, status: r.status, data: r.data });
    if (r.ok) batches.reload?.();
  };
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'Feedstock intake | Ravel console', description: 'Book in a batch with its mass, its moisture and its custody chain.' }),
    h('h1', null, 'Feedstock intake'),
    h('p', { class: 'small' }, 'The category is required at intake, has no default, and can never be changed after acceptance. Every figure is computed on dry mass.'),
    h('form', { onSubmit: submit, style: 'max-width:44rem' },
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'collector' }, 'Collector'),
        h('select', { id: 'collector', value: form.collector, onChange: set('collector') }, (collectors.data || []).map((c) => h('option', { value: c.reference, key: c.reference }, `${c.reference} — ${c.name}`)))),
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'category' }, 'Category (required; no default)'),
        h('select', { id: 'category', required: true, value: form.category, onChange: set('category') },
          h('option', { value: '' }, 'Choose a category'),
          h('option', { value: 'post_consumer' }, 'post_consumer'),
          h('option', { value: 'pre_consumer' }, 'pre_consumer'))),
      h('div', { class: 'grid-3' },
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'gross_g' }, 'Gross (g)'), h('input', { id: 'gross_g', type: 'number', step: 1, required: true, value: form.gross_g, onChange: set('gross_g') })),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'tare_g' }, 'Tare (g)'), h('input', { id: 'tare_g', type: 'number', step: 1, required: true, value: form.tare_g, onChange: set('tare_g') })),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'net_g' }, 'Net (g)'), h('input', { id: 'net_g', type: 'number', step: 1, required: true, value: form.net_g, onChange: set('net_g') }))),
      h('div', { class: 'grid-3' },
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'moisture_bp' }, 'Moisture (basis points)'), h('input', { id: 'moisture_bp', type: 'number', step: 1, required: true, value: form.moisture_bp, onChange: set('moisture_bp') })),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'device' }, 'Weighing device'), h('input', { id: 'device', value: form.device, onChange: set('device') })),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'received_on' }, 'Received on'), h('input', { id: 'received_on', type: 'date', required: true, value: form.received_on, onChange: set('received_on') }))),
      h('button', { class: 'btn btn-primary', type: 'submit', disabled: busy }, busy ? 'Booking in…' : 'Book in the batch ', h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'))),
    result ? result.ok
      ? h(Banner, { title: 'Batch booked in' },
          h('p', null, `Batch ${result.data.reference} took ${result.data.dry_mass_g.toLocaleString('en-GB')} g of dry mass and reads `, result.data.claimable ? h('span', null, 'claimable') : h('span', { class: 'state' }, `non-claimable: ${result.data.claimable_reason}`), '.'))
      : h(Banner, { title: 'The batch was refused' },
          h('p', null, `What was refused: ${result.data?.error}. What would change it: `, result.data?.error === 'category_required' ? 'choose a category — intake has no default.' : 'check the masses reconcile (gross minus tare equals net) and every integer is whole.')) : null,
    h('hr', { class: 'rule' }),
    h('h2', null, 'Batch register'),
    batches.loading ? h(Loading) : (batches.data || []).length === 0 ? h(Empty, null, 'No batches have been booked in yet.') :
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, ['Batch', 'Collector', 'Category', 'Received', 'Net g', 'Dry g', 'Claimable', 'Flags'].map((x) => h('th', { key: x, class: ['Net g', 'Dry g'].includes(x) ? 'num' : null }, x)))),
        h('tbody', null, batches.data.map((b) => h('tr', { key: b.reference },
          h('td', { class: 'mono' }, b.reference),
          h('td', null, b.collector_name),
          h('td', null, b.category.replace(/_/g, ' ')),
          h('td', { class: 'mono' }, b.received_on),
          h('td', { class: 'num' }, b.net_g.toLocaleString('en-GB')),
          h('td', { class: 'num' }, b.dry_mass_g.toLocaleString('en-GB')),
          h('td', null, b.claimable ? h('span', { class: 'state' }, 'claimable') : h('span', { class: 'state' }, `non-claimable — ${String(b.claimable_reason).replace(/[:_]/g, ' ')}`)),
          h('td', null, (b.flags || []).length ? (b.flags.map((f) => h('span', { class: 'flag', key: f }, f.replace(/_/g, ' '), ' '))) : '—')))))));
}
