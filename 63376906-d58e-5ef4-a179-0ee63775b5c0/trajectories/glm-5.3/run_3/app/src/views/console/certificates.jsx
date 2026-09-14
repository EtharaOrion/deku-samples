import { h } from 'preact';
import { useState } from 'preact/hooks';
import { Meta, useData, Loading, Empty, ContentWithClaim, Banner } from '../../components/ui.jsx';
import { Link } from '../../lib/router.jsx';
import { api, uid } from '../../lib/api.js';
export default function Certificates({ number }) {
  const certs = useData('/certificates');
  const one = useData(`/certificates/${number}`, !!number);
  const replay = useData(`/certificates/${number}/replay`, !!number);
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'Certificates | Ravel console', description: 'Issued certificates, their documents, their replay and their withdrawal.' }),
    h('div', { class: 'spread' }, h('h1', null, 'Certificates'),
      h(Link, { class: 'btn', href: '/console/certificates/new/lot' }, 'Begin a certificate ', h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'))),
    number ? (one.loading ? h(Loading) : one.error ? h(Empty, null, `No certificate numbered ${number}.`) :
      h('div', { class: 'route' },
        h('div', { class: 'spread' }, h('h2', { class: 'mono' }, one.data.number),
          one.data.state === 'withdrawn'
            ? h('p', { class: 'small' }, h('span', { class: 'state' }, 'withdrawn'), ` on ${one.data.withdrawal.withdrawn_on}. Reason: ${one.data.withdrawal.reason}.`)
            : h('p', { class: 'small' }, h('span', { class: 'state' }, one.data.state))),
        h('div', { class: 'figrows' },
          h('div', { class: 'figrow' }, h('span', { class: 'label' }, 'Claim'), h('span', null, h(ContentWithClaim, { content_bp: one.data.content_bp, claim_type: one.data.claim_type }))),
          h('div', { class: 'figrow' }, h('span', { class: 'label' }, 'Recipient'), h('span', null, `${one.data.recipient_name} (${one.data.recipient})`)),
          h('div', { class: 'figrow' }, h('span', { class: 'label' }, 'Site'), h('span', { class: 'mono' }, one.data.site)),
          h('div', { class: 'figrow' }, h('span', { class: 'label' }, 'Signer'), h('span', { class: 'mono' }, one.data.signer)),
          h('div', { class: 'figrow' }, h('span', { class: 'label' }, 'Provisional factor'), h('span', null, one.data.provisional_factor ? h('span', { class: 'flag' }, 'rests on a provisional conversion factor') : 'no'))),
        h('section', null, h('h3', { class: 'label' }, 'The eight conditions as they stood at signing'),
          h('div', { class: 'figrows' }, (one.data.conditions || []).map((c) => h('div', { class: 'figrow', key: c.condition },
            h('span', { class: 'label' }, c.condition.replace(/_/g, ' ')), h('span', null, c.satisfied ? 'satisfied' : `blocked by ${c.blocking_reference}`))))),
        replay.data ? h('section', null, h('h3', { class: 'label' }, 'Replay'),
          h('p', { class: 'small' }, replay.data.reproducible === false
            ? `Not reproducible: ${replay.data.reason}. It is never recomputed under today's rules and presented as the original.`
            : replay.data.agrees ? `Issued at ${replay.data.issued} bp; recomputation from its recorded input versions agrees at ${replay.data.recomputed} bp.`
              : `Issued at ${replay.data.issued} bp; recomputation now reads ${replay.data.recomputed} bp. The input that moved: ${replay.data.differing_input}.`),
          h('p', { class: 'small mono' }, `input versions: ${Object.entries(replay.data.input_versions || {}).map(([k, v]) => `${k}=${v}`).join(' · ')}`)) : null,
        h('section', null, h('h3', { class: 'label' }, 'The document'), h(Document, { number })),
        one.data.state !== 'withdrawn' ? h(Withdraw, { number }) : null))
      : (certs.loading ? h(Loading) : (certs.data || []).length === 0 ? h(Empty, null, 'No certificates have been issued yet.') :
        h('div', { class: 'tablewrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Number'), h('th', null, 'Site'), h('th', null, 'State'), h('th', null, 'Content'), h('th', null, 'Recipient'), h('th', null, 'Signed'))),
          h('tbody', null, certs.data.map((c) => h('tr', { key: c.number },
            h('td', null, h(Link, { class: 'mono underline', href: `/console/certificates/${c.number}` }, c.number)),
            h('td', { class: 'mono' }, c.site),
            h('td', null, h('span', { class: 'state' }, c.state)),
            h('td', null, h(ContentWithClaim, { content_bp: c.content_bp, claim_type: c.claim_type })),
            h('td', null, c.recipient_name),
            h('td', { class: 'mono' }, c.signed_on))))))));
}
function Document({ number }) {
  const [doc, setDoc] = useState(null);
  useState(() => { fetch(`/api/certificates/${number}/document`, { headers: { authorization: `Bearer ${localStorage.getItem('ravel_token')}` } }).then((r) => r.text()).then(setDoc); });
  return h('div', null,
    h('p', { class: 'small' }, 'Byte-stable: two reads of the same certificate version return identical bytes.'),
    h('pre', { class: 'document', id: 'certificate-document' }, doc || 'Loading the document…'),
    doc ? h('button', { class: 'btn no-print', onClick: () => window.print() }, 'Print the document') : null);
}
function Withdraw({ number }) {
  const [stage, setStage] = useState('idle');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState(null);
  const preview = useData(`/certificates/${number}`);
  const submit = async (e) => {
    e.preventDefault();
    const r = await api(`/api/certificates/${number}/withdraw`, { method: 'POST', headers: { 'idempotency-key': uid() }, body: { reason } });
    setResult(r);
    if (r.ok) setStage('done');
  };
  return h('section', null, h('h3', { class: 'label' }, 'Withdrawal'),
    stage === 'idle' ? h('button', { class: 'btn', onClick: () => setStage('confirm') }, 'Begin a withdrawal') : null,
    stage === 'confirm' ? h('form', { onSubmit: submit },
      h(Banner, { title: 'Five consequences of this withdrawal, enumerated before you confirm' },
        h('ol', { class: 'small' },
          h('li', null, 'The state becomes withdrawn, with the reason, the person and the date.'),
          h('li', null, 'The recipient is notified through mail: ', (preview.data?.recipient_name) || 'the recipient', '.'),
          h('li', null, 'Every downstream statement the recipient was permitted to make becomes void:'),
          h('ul', null, (preview.data ? [preview.data.permitted_statement, preview.data.prohibited_statement] : []).map((s, i) => h('li', { key: i, class: 'small' }, s))),
          h('li', null, 'Every certificate derived from this one is identified and resolved.'),
          h('li', null, 'The reverse traversal of the underlying batches runs, so every other certificate touching them is enumerated in the same action.'))),
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'withdraw-reason' }, 'Reason (the only free text on a certificate)'),
        h('textarea', { id: 'withdraw-reason', required: true, rows: 3, value: reason, onChange: (e) => setReason(e.target.value) })),
      h('div', { style: 'display:flex;gap:.75rem' },
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Withdraw this certificate'),
        h('button', { class: 'btn', type: 'button', onClick: () => setStage('idle') }, 'Cancel'))) : null,
    stage === 'done' && result?.ok ? h(Banner, { title: 'Withdrawn' },
      h('p', null, `State ${result.data.state}. Notified by name: ${(result.data.notified_recipients || []).map((r) => r.name).join(', ')}.`),
      h('p', { class: 'small' }, `Statements now void: ${(result.data.void_statements || []).length}. Batches traversed: ${(result.data.batch_traversal || []).join(', ')}. The document stays readable at its address.`)) : null,
    result && !result.ok ? h(Banner, { title: 'The withdrawal was refused' }, h('p', null, result.data?.error)) : null);
}
