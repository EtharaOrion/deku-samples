import { h } from 'preact';
import { useState } from 'preact/hooks';
import { Meta, useData, Loading, Empty, Banner, ContentWithClaim, CarbonWithDeps } from '../../components/ui.jsx';
import { Link, useRouter } from '../../lib/router.jsx';
import { api, uid } from '../../lib/api.js';
const STEPS = [['lot', '1 · Lot'], ['claim', '2 · Claim'], ['recipient', '3 · Recipient'], ['review', '4 · Review']];
const NAMES = { lot_released: 'The lot is released', no_open_deviation: 'No deviation touching the lot is open', no_unreviewed_override: 'No override on the lot is unreviewed', period_closed: 'The bookkeeping period is closed', balance_invariant_holds: 'The balance invariant holds with the allocation applied', carbon_figure_complete: 'The carbon figure exists with all four components', signer_scope_covers_site: 'The signer holds signing scope for this site', signer_did_not_enter_data: 'The signer did not enter the data' };
export default function NewCert({ step }) {
  const [lot, setLot] = useState('');
  const [category, setCategory] = useState('post_consumer');
  const [mass, setMass] = useState(0);
  const [recipient, setRecipient] = useState('');
  const lots = useData('/lots');
  const preview = useData('/certificates/preview', false);
  const [conditions, setConditions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const { nav } = useRouter();
  const runPreview = async (l) => {
    if (!l) return;
    const r = await api('/api/certificates/preview', { method: 'POST', headers: { 'idempotency-key': uid() }, body: { lot: l, recipient: recipient || 'CUS-HELIOS', mass_g: Number(mass) || undefined, category } });
    setConditions(r.ok ? r.data.conditions : null);
  };
  const sign = async (password) => {
    setBusy(true); setResult(null);
    const r = await api('/api/certificates', { method: 'POST', headers: { 'idempotency-key': uid() }, body: { lot, recipient: recipient || 'CUS-HELIOS', password } });
    setBusy(false); setResult(r);
  };
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'New certificate | Ravel console', description: 'Four steps, four addresses, eight conditions checked at each one.' }),
    h('h1', null, 'Issue a certificate'),
    h('p', { class: 'small' }, 'Each step shows the eight conditions as they stand. None is dismissible from this screen by any control.'),
    h('nav', { class: 'steps', 'aria-label': 'Wizard steps' }, STEPS.map(([s, label]) => h(Link, { href: `/console/certificates/new/${s}`, key: s, 'aria-current': s === step ? 'step' : null }, label))),
    Conditions({ conditions, onRun: runPreview, lot }),
    step === 'lot' ? StepLot({ lots, lot, setLot, runPreview }) :
    step === 'claim' ? StepClaim({ category, setCategory, mass, setMass, lot, runPreview }) :
    step === 'recipient' ? StepRecipient({ recipient, setRecipient, lot, runPreview }) :
    step === 'review' ? StepReview({ lot, recipient, lots, conditions, busy, result, sign }) : null);
}
const Conditions = ({ conditions, onRun, lot }) => h('section', null,
  h('h2', { class: 'label' }, 'The eight conditions'),
  lot && !conditions ? h('button', { class: 'btn', onClick: () => onRun(lot) }, 'Read the eight conditions as they stand') : null,
  !lot ? h('p', { class: 'small' }, 'Choose a lot at step one to read the eight conditions.') :
    conditions ? h('ul', null, conditions.map((c) => h('li', { class: 'condition', key: c.condition },
      h('div', { class: 'spread' }, h('span', { class: 'label' }, NAMES[c.condition] || c.condition),
        c.satisfied ? h('span', { class: 'state' }, 'satisfied') : h('span', { class: 'state' }, 'not satisfied')),
      !c.satisfied ? h('p', { class: 'small' }, 'Blocked by ', h(Link, { class: 'underline', href: c.blocking_reference || '/console' }, c.blocking_reference || 'the record'), '. No control on this screen dismisses it.') : null)))
      : h('p', { class: 'loading' }, 'Reading the conditions…'));
function StepLot({ lots, lot, setLot, runPreview }) {
  const cards = (lots.data || []).map((l) => h('li', { key: l.reference, class: 'run-card' },
    h('div', { class: 'spread' }, h(Link, { class: 'mono underline', href: '/console/lots/' + l.reference }, l.reference), h('span', { class: 'state' }, l.disposition)),
    h('p', { class: 'small' }, h(ContentWithClaim, { content_bp: l.content_bp, claim_type: l.claim_type }), ' · ' + l.mass_g.toLocaleString('en-GB') + ' g · ' + l.site),
    (l.flags || []).map((f) => h('p', { class: 'flag', key: f }, f.replace(/_/g, ' '))),
    h('button', { class: 'btn', onClick: () => { setLot(l.reference); runPreview(l.reference); } }, 'Choose this lot ', h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'))));
  return h('section', null,
    h('h2', null, 'Choose the lot'),
    lots.loading ? h(Loading) : h('ul', null, cards),
    lot ? h(Banner, { title: 'Lot chosen' }, h('p', { class: 'mono' }, lot)) : null);
}

const StepClaim = ({ category, setCategory, mass, setMass, lot, runPreview }) => h('section', null, h('h2', null, 'The claim'),
  h('p', { class: 'small' }, 'No route accepts a percentage. The claim is allocated by a claims manager from the ledger; this screen reads what was allocated.'),
  lot ? h('p', { class: 'small mono' }, `lot ${lot}`) : h('p', { class: 'small' }, 'Go back to step one and choose a lot.'),
  h('div', { class: 'field' }, h('label', { class: 'label', for: 'category' }, 'Category'),
    h('select', { id: 'category', value: category, onChange: (e) => setCategory(e.target.value) },
      h('option', { value: 'post_consumer' }, 'post_consumer'),
      h('option', { value: 'pre_consumer' }, 'pre_consumer'))),
  h('div', { class: 'field' }, h('label', { class: 'label', for: 'mass' }, 'Mass to check the invariant against (g)'),
    h('input', { id: 'mass', type: 'number', step: 1, value: mass, onChange: (e) => setMass(e.target.value) })),
  h('button', { class: 'btn', onClick: () => runPreview(lot) }, 'Re-read the conditions'));
const StepRecipient = ({ recipient, setRecipient, lot, runPreview }) => {
  const custs = useData('/customers/CUS-HELIOS');
  return h('section', null, h('h2', null, 'The recipient'),
    h('p', { class: 'small' }, 'The recipient files this document with their own regulator. The permitted and prohibited statements are generated from the claim type, the percentage and the category split, in the recipient\u2019s language.'),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'recipient' }, 'Recipient'),
      h('select', { id: 'recipient', value: recipient, onChange: (e) => { setRecipient(e.target.value); } },
        h('option', { value: '' }, 'Choose a recipient'),
        h('option', { value: 'CUS-HELIOS' }, 'CUS-HELIOS — Helios Fabrics'),
        h('option', { value: 'CUS-VANTA' }, 'CUS-VANTA — Vanta Automotive Textiles'))),
    recipient ? h('p', { class: 'small' }, `Recipient ${recipient} will be notified through mail when the certificate is signed.`) : null,
    h('button', { class: 'btn', onClick: () => runPreview(lot) }, 'Re-read the conditions'));
};
const StepReview = ({ lot, recipient, lots, conditions, busy, result, sign }) => {
  const [password, setPassword] = useState('');
  const chosen = (lots.data || []).find((l) => l.reference === lot);
  return h('section', null, h('h2', null, 'Review and sign'),
    h('p', { class: 'small' }, 'The fourth step renders the document that will be signed. Signing is a separate, deliberate act, re-authenticated with the signer\u2019s password, because a session alone is not a signing credential. The recipient will file the document with a regulator.'),
    !lot ? h('p', { class: 'small' }, 'Choose a lot at step one first.') : h('div', { class: 'route' },
      h(DocumentPreview, { lot: chosen, recipient }),
      conditions ? h('p', { class: 'small' }, 'The eight conditions were decided again at this moment; none is waivable.') : null,
      h('form', { onSubmit: (e) => { e.preventDefault(); sign(password); } },
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'sign-password' }, 'Signer password (re-authentication)'),
          h('input', { id: 'sign-password', type: 'password', required: true, value: password, onChange: (e) => setPassword(e.target.value), autocomplete: 'current-password' })),
        h('button', { class: 'btn btn-primary', type: 'submit', disabled: busy }, busy ? 'Signing…' : 'Sign the certificate ', h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'))),
      result ? result.ok
        ? h(Banner, { title: 'Certificate signed' }, h('p', { class: 'mono' }, result.data.number), h('p', { class: 'small' }, 'The recipient has been notified with the number, the claim type, the percentage and the permitted statement.'))
        : h(Banner, { title: 'Signing was refused' },
            h('p', null, `Condition that failed: ${(result.data?.condition || result.data?.error || '').replace(/_/g, ' ')}.`),
            result.data?.blocking_reference ? h('p', { class: 'small' }, 'The record that would resolve it: ', h(Link, { class: 'underline', href: result.data.blocking_reference }, result.data.blocking_reference)) : null) : null));
};
const DocumentPreview = ({ lot, recipient }) => h('div', null,
  h('h3', { class: 'label' }, 'The document that will be signed'),
  h('pre', { class: 'document' },
    `RAVEL MATERIALS - RECYCLED CONTENT CERTIFICATE\n\n`,
    `Site: ${lot?.site || '—'}\nGrade: ${lot?.grade || 'N6'}\nScheme: RCS-2026\nRegistration: REG-RAVEL-0042\n\n`,
    `LOTS\n  ${lot?.reference || '—'}  ${(lot?.mass_g || 0).toLocaleString('en-GB')} g\n\n`,
    `CLAIM\n  Claim type: ${(lot?.claim_type || '').replace(/_/g, ' ')}\n`,
    `  Recycled content: ${lot?.content_bp != null ? (lot.content_bp / 100).toFixed(2) : '—'} per cent\n\n`,
    `PERMITTED STATEMENT\n  This material is claimed by mass balance. It is not physically segregated.\n\n`,
    `PROHIBITED STATEMENT\n  You may not state that this material physically contains recycled content.\n\n`,
    `Recipient: ${recipient || '—'}\n\n`,
    `Verify this certificate at ravel.example.com/verify/{number}.\n`));
