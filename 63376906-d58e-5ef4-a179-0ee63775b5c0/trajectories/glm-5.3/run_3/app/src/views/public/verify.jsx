import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Meta } from '../../components/ui.jsx';
export default function Verify({ number }) {
  const [state, setState] = useState({ loading: true, data: null });
  useEffect(() => {
    let alive = true;
    fetch(`/api/verify/${encodeURIComponent(number)}`).then((r) => r.json()).then((d) => alive && setState({ loading: false, data: d }));
    return () => { alive = false; };
  }, [number]);
  const d = state.data;
  return h('div', { class: 'route shell' },
    h(Meta, { title: `Verify ${number} | Ravel`, description: 'Public verification of a Ravel recycled-content certificate.', noindex: true }),
    h('section', null, h('h1', null, 'Certificate verification'),
      h('p', { class: 'body-big' }, 'This page answers in public, with no account, and only what a market-surveillance authority needs.')),
    state.loading ? h('p', { class: 'loading' }, 'Checking the register…') :
      !d?.found ? h('div', { class: 'notice' },
        h('p', { class: 'label' }, 'Not found'),
        h('p', null, `There is no certificate numbered ${number} in this register. This route cannot be used to enumerate the customer list.`)) :
      h('div', { class: 'card', style: 'display:grid;gap:.8rem' },
        d.state === 'withdrawn' ? h('div', { class: 'banner' },
          h('p', { class: 'label' }, 'Withdrawn'),
          h('p', null, `This certificate was withdrawn on ${d.withdrawn_on}. Reason: ${d.withdrawal_reason}.`),
          h('p', { class: 'small' }, 'No replacement is offered here: a withdrawal is a fact about a document, and the remedy is a new certificate.')) : null,
        h('dl', { class: 'figrows' },
          h('div', { class: 'figrow' }, h('dt', { class: 'label' }, 'Number'), h('dd', { class: 'mono' }, d.number)),
          h('div', { class: 'figrow' }, h('dt', { class: 'label' }, 'State'), h('dd', null, h('span', { class: 'state' }, d.state))),
          h('div', { class: 'figrow' }, h('dt', { class: 'label' }, 'Issued on'), h('dd', { class: 'mono' }, String(d.issued_on).slice(0, 10))),
          h('div', { class: 'figrow' }, h('dt', { class: 'label' }, 'Site'), h('dd', { class: 'mono' }, d.site)),
          h('div', { class: 'figrow' }, h('dt', { class: 'label' }, 'Grade'), h('dd', { class: 'mono' }, d.grade)),
          h('div', { class: 'figrow' }, h('dt', { class: 'label' }, 'Claim type'), h('dd', null, d.claim_type.replace(/_/g, ' '))),
          h('div', { class: 'figrow' }, h('dt', { class: 'label' }, 'Recipient'), h('dd', null, d.recipient_name))),
        h('p', { class: 'small' }, 'This answer carries no yield, no collector, no genealogy and no carbon breakdown.')));
}
