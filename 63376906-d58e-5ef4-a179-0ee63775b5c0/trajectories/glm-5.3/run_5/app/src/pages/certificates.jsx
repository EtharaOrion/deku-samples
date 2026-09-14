import { useEffect, useState } from 'preact/hooks';
import { api, newIdempotencyKey } from '../api.js';
import { Link } from '../router.jsx';
import { Banner, Empty, Loading, Ref, WordState } from '../components/bits.jsx';
import { fmtG, fmtBp, fmtDate, fmtCarbon } from '../format.js';

const CONDITION_LABELS = {
  lot_released: 'The lot is released',
  no_open_deviation: 'No deviation touching the lot is open',
  no_unreviewed_override: 'No override on the lot is unreviewed',
  period_closed: 'The bookkeeping period is closed',
  balance_invariant_holds: 'The balance invariant holds with the allocation applied',
  carbon_figure_complete: 'The carbon figure exists with all four components',
  signer_scope_covers_site: 'The signer holds signing scope for this site on the date of signing',
  signer_signer_did_not_enter_data: 'The signer did not enter the data'
};

function conditionLabel(c) {
  return CONDITION_LABELS[c.condition] || c.condition.replace(/_/g, ' ');
}

export function CertificateList() {
  const [certs, setCerts] = useState(undefined);
  useEffect(() => { api('/api/certificates').then((r) => setCerts(r.ok ? r.data : [])); }, []);
  if (certs === undefined) return <Loading />;
  if (!certs.length) return <Empty>No certificate has been issued.</Empty>;
  return (
    <div>
      <h1>Certificates</h1>
      <p>A certificate is a document readable without this system. A withdrawn certificate says
        withdrawn before it shows any figure.</p>
      <div class="table-wrap sheet">
        <table>
          <thead><tr><th>Number</th><th>State</th><th>Site</th><th>Claim type</th><th class="figure">Content</th><th>Recipient</th></tr></thead>
          <tbody>
            {certs.map((c) => (
              <tr>
                <td><Link href={`/console/certificates/${c.number}`}><Ref>{c.number}</Ref></Link></td>
                <td><WordState state={c.state} /></td>
                <td><Ref>{c.site}</Ref></td>
                <td>{c.claim_type.replace(/_/g, ' ')}</td>
                <td class="figure">{fmtBp(c.content_bp)} ({c.claim_type.replace(/_/g, ' ')})</td>
                <td>{c.recipient_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CertificateDetail({ number, me }) {
  const [cert, setCert] = useState(undefined);
  const [doc, setDoc] = useState(undefined);
  const [replay, setReplay] = useState(undefined);
  useEffect(() => {
    api(`/api/certificates/${number}`).then((r) => setCert(r.ok ? r.data : null));
    fetch(`/api/certificates/${number}/document`).then((r) => r.text()).then(setDoc);
    api(`/api/certificates/${number}/replay`).then((r) => setReplay(r.ok ? r.data : null));
  }, [number]);
  if (cert === undefined) return <Loading />;
  if (cert === null) return <Empty>There is no certificate with that number.</Empty>;
  return (
    <div>
      <h1><Ref>{cert.number}</Ref></h1>
      {cert.state === 'withdrawn' ? (
        <Banner kind="refused" title="Withdrawn">
          This certificate was withdrawn on {fmtDate(cert.withdrawn_on)}. Reason: {cert.withdrawal_reason}.
          The document stays readable at its address and does not redirect to a replacement.
        </Banner>
      ) : null}
      <div class="sheet">
        <h2>The certificate</h2>
        <dl class="kv">
          <dt>State</dt><dd><WordState state={cert.state} /></dd>
          <dt>Site</dt><dd><Ref>{cert.site}</Ref></dd>
          <dt>Lots</dt><dd>{cert.lots.map((l) => <div><Link href={`/console/lots/${l.reference}`}><Ref>{l.reference}</Ref></Link> — {fmtG(l.mass_g)}</div>)}</dd>
          <dt>Grade</dt><dd>{cert.grade} (SPEC-{cert.grade} version {cert.specification_version})</dd>
          <dt>Claim type</dt><dd>{cert.claim_type.replace(/_/g, ' ')}</dd>
          <dt>Recycled content</dt><dd class="figure">{fmtBp(cert.content_bp)} ({cert.claim_type.replace(/_/g, ' ')})</dd>
          <dt>Category split</dt><dd class="figure">post-consumer {fmtG(cert.category_split.post_consumer_g)}, pre-consumer {fmtG(cert.category_split.pre_consumer_g)}</dd>
          <dt>Carbon</dt><dd class="figure">{fmtCarbon(cert.carbon.value_mg_per_kg)}</dd>
          <dt>Carbon boundary</dt><dd>{cert.carbon.boundary}</dd>
          <dt>Carbon method</dt><dd><Ref>{cert.carbon.method} version {cert.carbon.method_version}</Ref></dd>
          <dt>Carbon uncertainty</dt><dd class="figure">{cert.carbon.uncertainty_bp} bp</dd>
          <dt>Provisional factor</dt><dd>{cert.provisional_factor ? <WordState state="provisional_factor" /> : 'No'}</dd>
          <dt>Signer</dt><dd>{cert.signer} on {fmtDate(cert.signed_at)}</dd>
          <dt>Recipient</dt><dd>{cert.recipient_name} (<Ref>{cert.recipient}</Ref>)</dd>
        </dl>
        <Banner>
          This material is claimed by mass balance. It is not physically segregated.
          You may not state that this material physically contains recycled content.
        </Banner>
      </div>

      {replay ? (
        <div class="sheet">
          <h2>Replay</h2>
          {replay.reproducible === false ? (
            <Banner kind="refused" title="Not reproducible">A figure whose inputs can no longer be resolved answers
              reproducible false. Reason: {replay.reason}. It is never recomputed under today's rules and
              presented as the original.</Banner>
          ) : (
            <div>
              <dl class="kv">
                <dt>Issued content</dt><dd class="figure">{replay.issued.content_bp} bp</dd>
                <dt>Recomputed content</dt><dd class="figure">{replay.recomputed.content_bp} bp</dd>
                <dt>Agrees</dt><dd>{replay.agrees ? 'Yes, the figures agree.' : 'No, they differ.'}</dd>
                {replay.differing_input ? (
                  <>
                    <dt>Differing input</dt>
                    <dd>{replay.differing_input.field}: issued {replay.differing_input.issued}, recomputed {replay.differing_input.recomputed} — {replay.differing_input.cause}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          )}
        </div>
      ) : null}

      <div class="sheet">
        <h2>Document</h2>
        {doc === undefined ? <Loading /> : <pre class="cert-doc">{doc}</pre>}
        <p class="small">An issued document is byte-stable: two reads of the same certificate version
          return identical bytes.</p>
      </div>

      {cert.state !== 'withdrawn' && me?.roles?.includes('certificate_signer') ? (
        <p><Link class="btn" href={`/console/certificates/${cert.number}/withdraw`}>Begin a withdrawal</Link></p>
      ) : null}
    </div>
  );
}

// The wizard: four steps, four addresses.
export function WizardStep({ step }) {
  const steps = [
    { n: 1, href: '/console/certificates/new/lot', label: 'Lot' },
    { n: 2, href: '/console/certificates/new/claim', label: 'Claim' },
    { n: 3, href: '/console/certificates/new/recipient', label: 'Recipient' },
    { n: 4, href: '/console/certificates/new/review', label: 'Review and sign' }
  ];
  const [draft, setDraft] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ravel_cert_draft') || '{}'); } catch (e) { return {}; }
  });
  function save(next) {
    const merged = { ...draft, ...next };
    setDraft(merged);
    try { localStorage.setItem('ravel_cert_draft', JSON.stringify(merged)); } catch (e) { /* ignore */ }
  }

  return (
    <div>
      <h1>Issue a certificate</h1>
      <nav class="wizard-steps" aria-label="Certificate steps">
        {steps.map((s) => (
          <Link href={s.href} current={step === s.n ? 'step' : undefined}>{s.n}. {s.label}</Link>
        ))}
      </nav>
      <Banner>
        Signing is a separate, deliberate act with the signer's identity confirmed at that moment. The
        recipient will file this document with their own regulator.
      </Banner>
      {step === 1 ? <StepLot draft={draft} save={save} /> : null}
      {step === 2 ? <StepClaim draft={draft} save={save} /> : null}
      {step === 3 ? <StepRecipient draft={draft} save={save} /> : null}
      {step === 4 ? <StepReview draft={draft} /> : null}
    </div>
  );
}

function ConditionsPanel({ conditions }) {
  if (!conditions) return <Loading>Checking the eight conditions…</Loading>;
  return (
    <div class="sheet">
      <h2>The eight conditions</h2>
      <ul class="conditions">
        {conditions.map((c) => (
          <li data-state={c.satisfied ? 'satisfied' : 'blocked'}>
            <span class="mark">{c.satisfied ? 'Satisfied' : 'Not satisfied'}</span>
            <span>
              <strong>{conditionLabel(c)}.</strong> {c.statement}
              {!c.satisfied && c.blocking_reference ? (
                <> <Link href={resolveHref(c)}>Open <Ref>{c.blocking_reference}</Ref></Link></>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p class="small">None of the eight is waivable, and no control on this screen dismisses one.</p>
    </div>
  );
}

function resolveHref(c) {
  const ref = c.blocking_reference;
  if (!ref) return '#';
  if (ref.startsWith('OVR-')) return '/console/quality';
  if (ref.startsWith('BP-')) return `/console/balance/${ref}`;
  if (ref.startsWith('LOT-')) return `/console/lots/${ref}`;
  if (ref.startsWith('DEV-')) return '/console/quality';
  return '/console';
}

function StepLot({ draft, save }) {
  const [lots, setLots] = useState(undefined);
  const [conditions, setConditions] = useState(undefined);
  const [selected, setSelected] = useState(draft.lot || '');
  useEffect(() => { api('/api/lots').then((r) => setLots(r.ok ? r.data : [])); }, []);
  useEffect(() => {
    if (!selected) { setConditions(null); return; }
    api('/api/certificates/preview', { method: 'POST', body: { lot: selected } }).then((r) => setConditions(r.ok ? r.data : { error: r.data }));
  }, [selected]);
  if (lots === undefined) return <Loading />;
  return (
    <div>
      <div class="sheet">
        <h2>Step one: the lot</h2>
        <label for="wz-lot">Choose the lot this certificate rests on</label>
        <select id="wz-lot" value={selected} onChange={(e) => { setSelected(e.target.value); save({ lot: e.target.value }); }}>
          <option value="">— choose a lot —</option>
          {lots.map((l) => <option value={l.reference}>{l.reference} · {fmtG(l.mass_g)} · {l.disposition} · {fmtBp(l.content_bp)} ({l.claim_type.replace(/_/g, ' ')})</option>)}
        </select>
      </div>
      {conditions?.error ? <Banner kind="refused" title="Preview refused">{conditions.error.message || conditions.error.error}</Banner> : <ConditionsPanel conditions={conditions?.conditions} />}
    </div>
  );
}

function StepClaim({ draft, save }) {
  if (!draft.lot) {
    return <Empty>Choose a lot first. <Link href="/console/certificates/new/lot">Go to step one.</Link></Empty>;
  }
  return (
    <div>
      <div class="sheet">
        <h2>Step two: the claim</h2>
        <p>The claim type and the percentage are both derived. Neither is ever accepted from a person, on
          any route, in any form.</p>
        <dl class="kv">
          <dt>Lot</dt><dd><Ref>{draft.lot}</Ref></dd>
          <dt>Claim type</dt><dd>mass balance</dd>
          <dt>Percentage</dt><dd>Computed from the ledger: credit attached over lot mass, floored.</dd>
        </dl>
        <p><Link class="btn secondary" href="/console/balance">Open the ledger to attach claim first</Link></p>
      </div>
      <PreviewPanel lot={draft.lot} />
    </div>
  );
}

function StepRecipient({ draft, save }) {
  const [customers, setCustomers] = useState(undefined);
  useEffect(() => {
    api('/api/certificates').then(() => { });
    const load = async () => {
      const r = await api('/api/customers');
      setCustomers(r.ok ? r.data : []);
    };
    load();
  }, []);
  if (!draft.lot) {
    return <Empty>Choose a lot first. <Link href="/console/certificates/new/lot">Go to step one.</Link></Empty>;
  }
  return (
    <div>
      <div class="sheet">
        <h2>Step three: the recipient</h2>
        <label for="wz-recipient">Recipient</label>
        <select id="wz-recipient" value={draft.recipient || ''} onChange={(e) => save({ recipient: e.target.value })}>
          <option value="">— choose a recipient —</option>
          {(customers || []).map((c) => <option value={c.reference}>{c.reference} · {c.contact}</option>)}
        </select>
      </div>
      <PreviewPanel lot={draft.lot} />
    </div>
  );
}

function PreviewPanel({ lot }) {
  const [conditions, setConditions] = useState(undefined);
  useEffect(() => {
    api('/api/certificates/preview', { method: 'POST', body: { lot } }).then((r) => setConditions(r.ok ? r.data : { error: r.data }));
  }, [lot]);
  if (conditions?.error) return <Banner kind="refused" title="Preview refused">{conditions.error.message || conditions.error.error}</Banner>;
  return <ConditionsPanel conditions={conditions?.conditions} />;
}

function StepReview({ draft }) {
  const [preview, setPreview] = useState(undefined);
  const [password, setPassword] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState(undefined);
  useEffect(() => {
    if (!draft.lot) return;
    api('/api/certificates/preview', { method: 'POST', body: { lot: draft.lot } }).then((r) => setPreview(r.ok ? r.data : { error: r.data }));
  }, [draft.lot]);
  useEffect(() => {
    if (result?.ok && result.data.number) {
      fetch(`/api/certificates/${result.data.number}/document`).then((r) => r.text()).then(setDoc);
    }
  }, [result]);

  if (!draft.lot) {
    return <Empty>Choose a lot first. <Link href="/console/certificates/new/lot">Go to step one.</Link></Empty>;
  }

  async function sign(e) {
    e.preventDefault();
    setBusy(true);
    const r = await api('/api/certificates', {
      method: 'POST', key: newIdempotencyKey('sign'),
      body: { lot: draft.lot, recipient: draft.recipient, password }
    });
    setBusy(false);
    setResult({ ok: r.ok, data: r.data });
  }

  return (
    <div>
      <div class="sheet">
        <h2>Step four: the exact document</h2>
        <p>The signer signs what the recipient will read. This is the document that will be generated,
          including the permitted downstream statement and its counterpart in the recipient's language.</p>
        {preview?.error ? <Banner kind="refused" title="Preview refused">{preview.error.message || preview.error.error}</Banner> : null}
        {result && !result.ok ? (
          <Banner kind="refused" title="Signing refused">
            {result.data?.message || result.data?.error}. The eight conditions are decided again at the moment
            of signing, against the records as they stand then.
          </Banner>
        ) : null}
        {result?.ok ? (
          <Banner>
            Certificate <Ref>{result.data.number}</Ref> signed. The recipient has been notified through mail
            with the number, the claim type, the percentage and the permitted statement.
          </Banner>
        ) : null}
        {doc ? <pre class="cert-doc">{doc}</pre> : (
          <pre class="cert-doc">RAVEL MATERIALS SAS - RECYCLED CONTENT CERTIFICATE

Certificate number: (issued at signing, from a gapless per-site sequence)
Site: (the lot's site)
Claim type: {draft.lot ? 'mass balance' : ''}
Recycled content: (computed from the ledger at signing)

PERMITTED STATEMENT
This certificate confirms that the material described carries its recycled
content by mass balance. This material is claimed by mass balance. It is not
physically segregated.

PROHIBITED STATEMENT
You may not state that this material physically contains recycled content.</pre>
        )}
        {!result?.ok ? (
          <form onSubmit={sign} style="margin-top:1.25rem">
            <fieldset>
              <legend>Re-authenticate to sign</legend>
              <p class="small">Signing a certificate re-authenticates. The signing act carries the password
                again and a session alone is not a signing credential.</p>
              <div style="max-width:22rem">
                <label for="wz-password">Password</label>
                <input id="wz-password" type="password" value={password} onInput={(e) => setPassword(e.target.value)} required autocomplete="current-password" />
              </div>
              <button class="btn" type="submit" disabled={busy || !draft.recipient}>
                {busy ? 'Signing…' : 'Sign this certificate'} <span class="arrow" aria-hidden="true">→</span>
              </button>
              {!draft.recipient ? <p class="small">A recipient must be chosen at step three before signing.</p> : null}
            </fieldset>
          </form>
        ) : null}
      </div>
      <ConditionsPanel conditions={preview?.conditions} />
    </div>
  );
}

export function Withdraw({ number }) {
  const [cert, setCert] = useState(undefined);
  const [stage, setStage] = useState('confirm');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/api/certificates/${number}`).then((r) => setCert(r.ok ? r.data : null)); }, [number]);
  if (cert === undefined) return <Loading />;
  if (cert === null) return <Empty>There is no certificate with that number.</Empty>;

  async function withdraw(e) {
    e.preventDefault();
    setBusy(true);
    const r = await api(`/api/certificates/${number}/withdraw`, {
      method: 'POST', key: newIdempotencyKey('withdraw'), body: { reason }
    });
    setBusy(false);
    setResult({ ok: r.ok, data: r.data });
    if (r.ok) setStage('done');
  }

  return (
    <div>
      <h1>Withdraw <Ref>{number}</Ref></h1>
      {stage === 'confirm' ? (
        <div class="sheet raised">
          <h2>Before confirming, the blast radius</h2>
          <p>Withdrawal is one action with five consequences. These are the actual enumerated lists, not a
            count of them.</p>
          <h3>Recipients who will be notified</h3>
          <ul><li>{cert.recipient_name} (<Ref>{cert.recipient}</Ref>), at their recorded contact</li></ul>
          <h3>Statements the recipient is now obliged to stop making</h3>
          <ul>
            <li>This material contains {fmtBp(cert.content_bp)} recycled content.</li>
            <li>This material physically contains recycled content.</li>
            <li>This material is physically segregated recycled nylon.</li>
          </ul>
          <h3>Derived certificates</h3>
          <p class="small">Every certificate derived from this one is identified and resolved by the same action.</p>
          <h3>The reverse traversal</h3>
          <p class="small">The reverse traversal of the underlying batches runs so that every other
            certificate touching them is enumerated in the same action.</p>
          <h3>The document</h3>
          <p class="small">A withdrawal is never a deletion: the certificate stays readable at its address and
            states the withdrawal.</p>
          <form onSubmit={withdraw}>
            <label for="wd-reason">Reason (the only free text on a certificate)</label>
            <textarea id="wd-reason" rows="3" required minlength="10" value={reason} onInput={(e) => setReason(e.target.value)} />
            <button class="btn" type="submit" disabled={busy}>{busy ? 'Withdrawing…' : 'Confirm the withdrawal'}</button>
          </form>
        </div>
      ) : (
        <div>
          <Banner kind="refused" title="Withdrawn">
            Certificate {number} is withdrawn. The document still resolves at its address and states the withdrawal.
          </Banner>
          {result?.ok ? (
            <div class="sheet">
              <h2>What happened</h2>
              <dl class="kv">
                <dt>State</dt><dd><WordState state="withdrawn" /></dd>
                <dt>Reason</dt><dd>{result.data.reason}</dd>
                <dt>Withdrawn by</dt><dd>{result.data.withdrawn_by} on {fmtDate(result.data.withdrawn_on)}</dd>
                <dt>Notified</dt><dd>{result.data.notified_recipients.map((r) => `${r.name} (${r.contact})`).join(', ')}</dd>
                <dt>Statements now void</dt><dd><ul>{result.data.void_statements.map((s) => <li>{s}</li>)}</ul></dd>
                <dt>Derived certificates</dt><dd>{result.data.derived_certificates.length ? result.data.derived_certificates.join(', ') : 'None'}</dd>
                <dt>Batch traversal</dt>
                  <dd>{result.data.batch_traversal.certificates.length
                    ? result.data.batch_traversal.certificates.join(', ')
                    : 'No other certificate touches the underlying batches.'}</dd>
              </dl>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
