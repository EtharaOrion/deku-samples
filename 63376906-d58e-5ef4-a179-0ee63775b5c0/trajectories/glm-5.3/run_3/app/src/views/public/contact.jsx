import { h } from 'preact';
import { useState } from 'preact/hooks';
import { Meta } from '../../components/ui.jsx';
import { Reveal } from '../../components/reveal.jsx';
import { api, uid } from '../../lib/api.js';
const TYPES = [['waste_supply', 'Waste supply', 'feedstock@example.com · 3 working days'],
  ['polymer_purchase', 'Polymer purchase', 'sales@example.com · 2 working days'],
  ['partnership', 'Partnership', 'partners@example.com · 5 working days'],
  ['press', 'Press', 'press@example.com · 1 working day']];
export default function Contact() {
  const [form, setForm] = useState({ type: 'waste_supply', name: '', email: '', company: '', message: '' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setResult(null);
    const r = await api('/api/enquiries', { method: 'POST', body: form, headers: {} });
    setBusy(false);
    setResult(r.ok ? { ok: true, data: r.data } : { ok: false, error: r.data?.error || 'failed' });
  };
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'Contact — four enquiry types, four destinations | Ravel', description: 'Waste supply, polymer purchase, partnership and press enquiries, each with its own destination and its own stated response time.' }),
    h('section', null, h(Reveal, { as: 'h1' }, 'Contact'),
      h('p', { class: 'body-big' }, 'Four enquiry types, four destinations, four stated response times.')),
    h('div', { class: 'grid-2' },
      h('ul', { class: 'grid-2', style: 'grid-column:1/-1' }, TYPES.map(([v, label, dest]) => h('li', { class: 'card small', key: v },
        h('p', { class: 'label' }, label), h('p', { class: 'mono' }, dest)))),
      h('form', { onSubmit: submit, novalidate: false },
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'type' }, 'Enquiry type'),
          h('select', { id: 'type', value: form.type, onChange: set('type') }, TYPES.map(([v, l]) => h('option', { value: v, key: v }, l)))),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'name' }, 'Name'), h('input', { id: 'name', required: true, value: form.name, onChange: set('name'), autocomplete: 'name' })),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'email' }, 'Email'), h('input', { id: 'email', type: 'email', required: true, value: form.email, onChange: set('email'), autocomplete: 'email' })),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'company' }, 'Company (optional)'), h('input', { id: 'company', value: form.company, onChange: set('company'), autocomplete: 'organization' })),
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'message' }, 'Message'), h('textarea', { id: 'message', required: true, rows: 5, value: form.message, onChange: set('message') })),
        h('button', { class: 'btn btn-primary', type: 'submit', disabled: busy }, busy ? 'Sending…' : 'Send the enquiry ', h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→')),
        h('p', { class: 'small' }, 'The point of collection states who receives the data, what it is used for, how long it is kept and how to have it removed. See the privacy policy.')),
      result ? result.ok
        ? h('div', { class: 'banner', role: 'status' },
            h('p', { class: 'label' }, 'Enquiry received'),
            h('p', null, `Reference ${result.data.reference}. Your enquiry has reached ${result.data.destination}, which answers within ${result.data.response_days} working days.`),
            h('p', { class: 'small' }, 'A confirmation has been sent to the address you gave. If it does not arrive, write to ', h('a', { class: 'underline', href: 'mailto:privacy@example.com' }, 'privacy@example.com'), '.'))
        : h('div', { class: 'banner', role: 'alert' },
            h('p', { class: 'label' }, 'The enquiry did not send'),
            h('p', null, 'What failed: the form could not be delivered, so nothing was recorded and no mail was sent. Check the address and the message and try again.'),
            h('p', { class: 'small' }, 'If the form still refuses, write directly to ', h('a', { class: 'underline', href: 'mailto:partners@example.com' }, 'partners@example.com'), ' — that address does not depend on this form working.')) : null));
}
