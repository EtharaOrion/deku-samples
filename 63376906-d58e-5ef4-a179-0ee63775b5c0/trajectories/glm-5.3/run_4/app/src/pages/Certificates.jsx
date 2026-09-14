import { useEffect, useState } from 'preact/hooks';
import { Link, route } from 'preact-router';
import { Loading, Banner, Empty } from '../components/Chrome.jsx';
import { api } from '../api.js';

const CONDITIONS = [
  ['lot_released', 'The lot is released'],
  ['no_open_deviation', 'No deviation touching the lot is open'],
  ['no_unreviewed_override', 'No override on the lot is unreviewed'],
  ['period_closed', 'The bookkeeping period is closed'],
  ['balance_invariant_holds', 'The balance invariant holds with the allocation applied'],
  ['carbon_complete', 'The carbon figure exists with all four components'],
  ['signer_scope', 'The signer holds signing scope for that site on the date of signing'],
  ['signer_did_not_enter_data', 'The signer did not enter the data']
];

function ConditionList({ conditions }) {
  return (
    <ol class="conditions">
      {(conditions || []).map((c) => (
        <li class={'condition' + (c.satisfied ? '' : ' condition-blocked')}>
          <p>{c.label || c.condition}</p>
          <p class="state-word">{c.satisfied ? 'satisfied' : 'unsatisfied'}</p>
          {!c.satisfied && c.blocking_reference && (
            <p><Link href={c.blocking_reference}>Open the record that would resolve this</Link></p>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function Certificates({ user, number, wizard }) {
  const [certs, setCerts] = useState(null);
  const [detail, setDetail] = useState(null);
  const [doc, setDoc] = useState(null);
  const [wizardState, setWizardState] = useState({ lot: '', recipient: 'CUS-HELIOS' });
  const [preview, setPreview] = useState(null);
  const [banner, setBanner] = useState(null);
  const [password, setPassword] = useState('');

  useEffect(() => {
    api('/api/certificates').then((r) => setCerts(r.ok ? r.data : []));
  }, []);

  useEffect(() => {
    setDetail(null); setDoc(null);
    if (number) {
      api('/api/certificates/' + number).then((r) => setDetail(r.ok ? r.data : null));
      fetch('/api/certificates/' + number + '/document').then((r) => r.text()).then(setDoc);
    }
  }, [number]);

  useEffect(() => {
    if (wizard) {
      const stored = sessionStorage.getItem('ravel_wizard_lot');
      if (stored && !wizardState.lot) {
        setWizardState((w) => ({ ...w, lot: stored }));
        return;
      }
    }
  }, [wizard]);

  useEffect(() => {
    if (wizard && wizardState.lot) {
      sessionStorage.setItem('ravel_wizard_lot', wizardState.lot);
      setPreview(null);
      api('/api/certificates/preview', { method: 'POST', body: { lot: wizardState.lot, recipient: wizardState.recipient } })
        .then((r) => setPreview(r.ok ? r.data : null));
    }
  }, [wizard, wizardState.lot, wizardState.recipient]);

  // ---- wizard: four steps, four addresses ----
  if (wizard) {
    const step = wizard;
    return (
      <div>
        <h1 class="reveal">Sign a certificate</h1>
        <nav class="tabs" aria-label="Signing steps">
          <Link class={'tab' + (step === 'lot' ? ' tab-active' : '')} href="/console/certificates/new/lot">1 Lot</Link>
          <Link class={'tab' + (step === 'claim' ? ' tab-active' : '')} href="/console/certificates/new/claim">2 Claim</Link>
          <Link class={'tab' + (step === 'recipient' ? ' tab-active' : '')} href="/console/certificates/new/recipient">3 Recipient</Link>
          <Link class={'tab' + (step === 'review' ? ' tab-active' : '')} href="/console/certificates/new/review">4 Review</Link>
        </nav>

        {banner && <Banner kind="refused">{banner}</Banner>}

        {step === 'lot' && (
          <section>
            <h2>Choose the lot</h2>
            <p class="form">
              <label class="field">
                <span class="field-label">Lot</span>
                <input value={wizardState.lot} onInput={(e) => setWizardState({ ...wizardState, lot: e.target.value })} placeholder="LOT-N6-0001" />
              </label>
            </p>
            {preview && <div class="card"><h3>The eight conditions as they stand</h3><ConditionList conditions={preview.conditions} /></div>}
          </section>
        )}

        {step === 'claim' && (
          <section>
            <h2>The claim</h2>
            <p>The claim type and the percentage travel together: no response carries the percentage without the type beside it.</p>
            <p class="state-word">This material is claimed by mass balance. It is not physically segregated.</p>
            {preview && <div class="card"><h3>The eight conditions as they stand</h3><ConditionList conditions={preview.conditions} /></div>}
          </section>
        )}

        {step === 'recipient' && (
          <section>
            <h2>The recipient</h2>
            <label class="field">
              <span class="field-label">Recipient</span>
              <select value={wizardState.recipient} onChange={(e) => setWizardState({ ...wizardState, recipient: e.target.value })}>
                <option value="CUS-HELIOS">Helios</option>
                <option value="CUS-VANTA">Vanta</option>
              </select>
            </label>
            {preview && <div class="card"><h3>The eight conditions as they stand</h3><ConditionList conditions={preview.conditions} /></div>}
          </section>
        )}

        {step === 'review' && (
          <section>
            <h2>The document you will sign</h2>
            <p>The fourth step renders the exact document that will be signed, including the permitted downstream statement and its counterpart.</p>
            {preview && (
              <>
                <div class="card">
                  <h3>The eight conditions as they stand</h3>
                  <ConditionList conditions={preview.conditions} />
                  {!preview.conditions.every((c) => c.satisfied) && (
                    <p class="state-word">One condition is unsatisfied. No control on this screen dismisses it.</p>
                  )}
                </div>
                <div class="card">
                  <h3>Signing</h3>
                  <p class="stat-meta">Signing is a separate, deliberate act. The recipient will file this document with their regulator.</p>
                  <label class="field">
                    <span class="field-label">Re-enter your password to sign</span>
                    <input type="password" value={password} onInput={(e) => setPassword(e.target.value)} />
                  </label>
                  <button class="btn" type="button" onClick={async () => {
                    const key = 'sign-' + Date.now();
                    const r = await api('/api/certificates', {
                      method: 'POST',
                      headers: { 'Idempotency-Key': key },
                      body: { lot: wizardState.lot, recipient: wizardState.recipient, password }
                    });
                    if (r.ok) {
                      route('/console/certificates/' + r.data.number);
                    } else {
                      const failed = (r.data.conditions || []).find((c) => !c.satisfied);
                      setBanner('Signing was refused: ' + (r.data.error) + (failed ? ' — the condition that blocks it is ' + (failed.label || failed.condition) + '.' : '.'));
                    }
                  }}>Sign</button>
                </div>
              </>
            )}
            {!preview && <Loading>Loading the eight conditions…</Loading>}
          </section>
        )}
      </div>
    );
  }

  // ---- single certificate ----
  if (number) {
    return (
      <div>
        <h1 class="reveal">Certificate {number}</h1>
        {detail && detail.state === 'withdrawn' && (
          <p class="state-word">withdrawn — This certificate was withdrawn on {detail.withdrawn_on}. Reason: {detail.withdrawal_reason}.</p>
        )}
        {detail && (
          <>
            <section class="card">
              <h2>Claim</h2>
              <p>Claim type: <strong>{detail.claim_type}</strong> · Recycled content: <span class="mono">{detail.content_bp} bp</span></p>
              <p>Category split: {Object.entries(detail.category_split || {}).map(([k, v]) => k + ' ' + v).join(', ')}</p>
              <p class="state-word">This material is claimed by mass balance. It is not physically segregated.</p>
              <p class="state-word">You may not state that this material physically contains recycled content.</p>
              {detail.provisional_factor && <p class="state-word">provisional factor — this certificate rests on a provisional conversion factor.</p>}
            </section>
            <section class="card">
              <h2>Carbon</h2>
              <p><span class="figure-value mono">{detail.carbon.value_mg_per_kg} mg CO2e per kg</span></p>
              <p>Boundary {detail.carbon.boundary} · Method <span class="mono">{detail.carbon.method_version}</span> · Uncertainty <span class="mono">{detail.carbon.uncertainty_bp} bp</span></p>
            </section>
            {detail.state !== 'withdrawn' && (
              <section class="card">
                <h2>Withdraw</h2>
                <p>Withdrawal is one action with five consequences: the state becomes withdrawn, the recipient is notified, every statement they were permitted to make is enumerated, derived certificates are resolved, and the reverse traversal of the underlying batches runs.</p>
                <Withdrawal number={number} />
              </section>
            )}
            {detail.state === 'withdrawn' && (
              <section class="card">
                <h2>Withdrawal consequences</h2>
                <p>Notified recipients: {(detail.notified_recipients || []).map((r) => r.name).join(', ')}</p>
                <p>Statements now void:</p>
                <ul>{(detail.void_statements || []).map((s) => <li>{s}</li>)}</ul>
              </section>
            )}
            <section class="card">
              <h2>Document</h2>
              <p class="stat-meta">An issued document is byte-stable: two reads of the same version return identical bytes.</p>
              <pre class="mono doc">{doc}</pre>
            </section>
          </>
        )}
        {!detail && <Loading>Loading the certificate…</Loading>}
      </div>
    );
  }

  // ---- register ----
  return (
    <div>
      <h1 class="reveal">Certificates</h1>
      <p class="lede"><Link class="btn" href="/console/certificates/new/lot">Sign a certificate</Link></p>
      {!certs && <Loading>Loading certificates…</Loading>}
      {certs && certs.length === 0 && <Empty>No certificates have been issued. The SITE-DEMO sequence has issued nothing, so the first certificate signed there is CERT-DEMO-000001.</Empty>}
      {certs && certs.length > 0 && (
        <div class="stack">
          {certs.map((c) => (
            <article class="card">
              <h3 class="mono"><Link href={'/console/certificates/' + c.number}>{c.number}</Link></h3>
              <p>State: <strong>{c.state_word}</strong>{c.state === 'withdrawn' ? ' — withdrawn on ' + c.withdrawn_on : ''}</p>
              <p>Site <span class="mono">{c.site}</span> · Grade <span class="mono">{c.grade}</span> · Claim type <strong>{c.claim_type}</strong> at <span class="mono">{c.content_bp} bp</span></p>
              <p>Recipient: {c.recipient_name}</p>
              <p>Signed by <span class="mono">{c.signer}</span> on <span class="mono">{String(c.signed_at).slice(0, 10)}</span></p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Withdrawal({ number }) {
  const [reason, setReason] = useState('');
  const [state, setState] = useState({ phase: 'idle' });
  return (
    <div>
      <label class="field">
        <span class="field-label">Reason (the only free text on a certificate)</span>
        <input value={reason} onInput={(e) => setReason(e.target.value)} />
      </label>
      {state.phase === 'idle' && (
        <button class="btn" type="button" onClick={async () => {
          const r = await api('/api/certificates/' + number + '/withdraw', {
            method: 'POST',
            headers: { 'Idempotency-Key': 'wd-' + Date.now() },
            body: { reason }
          });
          if (r.ok) setState({ phase: 'done', data: r.data });
          else setState({ phase: 'failed', error: r.data });
        }}>Begin withdrawal</button>
      )}
      {state.phase === 'failed' && <Banner kind="refused">The withdrawal was refused: {state.error.error}</Banner>}
      {state.phase === 'done' && (
        <>
          <p class="state-word">withdrawn</p>
          <h3>Recipients notified, by name</h3>
          <ul>{state.data.notified_recipients.map((r) => <li>{r.name}</li>)}</ul>
          <h3>Statements the recipient is now obliged to stop making</h3>
          <ul>{state.data.void_statements.map((s) => <li>{s}</li>)}</ul>
        </>
      )}
    </div>
  );
}
