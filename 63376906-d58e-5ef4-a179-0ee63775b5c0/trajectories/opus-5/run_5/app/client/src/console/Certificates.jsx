import { useState, useEffect } from 'preact/hooks';
import { useApi, useMeta, api, Link, navigate, grams, bp, bpAsPercent, words, dateOf, idempotencyKey, getToken } from '../lib.jsx';
import { Loading, Empty, Word, ContentFigure, CarbonFigure, EnergyPanel, RefusalBanner, IconWarning } from '../components/Bits.jsx';

/* ------------------------------------------------------------ the register */

export function Certificates({ me }) {
  useMeta('Certificates — Ravel console', 'The certificate register.');
  const certs = useApi('/certificates');
  const canSign = (me.roles || []).includes('certificate_signer');
  return (
    <>
      <div style="display:flex;gap:1rem;align-items:baseline;flex-wrap:wrap">
        <h1 class="display-2">Certificates</h1>
        <span class="spacer" />
        {canSign ? (
          <Link href="/console/certificates/new/lot" class="btn btn-primary">
            Sign a certificate <span class="arrow" aria-hidden="true">→</span>
          </Link>
        ) : (
          <span class="note">Signing is carried by a certificate signer. This session does not hold that role.</span>
        )}
      </div>

      {certs.loading ? <Loading what="the certificate register" /> : null}
      {certs.error ? <Empty>The certificate register could not be loaded.</Empty> : null}
      {certs.data && !certs.data.length ? <Empty>No certificate has been signed.</Empty> : null}

      <div class="grid-2" style="margin-top:1.5rem">
        {(certs.data || []).map((c) => (
          <Link key={`${c.number}-${c.version}`} href={`/console/certificates/${c.number}`} class="card card-link">
            {/* A withdrawn certificate says withdrawn before it shows any figure. */}
            {c.state === 'withdrawn' ? (
              <p style="margin:0 0 0.5rem">
                <Word firm>Withdrawn</Word>
              </p>
            ) : null}
            <div class="node-head">
              <span class="mono">{c.number}</span>
              <span class="t-label-small muted">version {c.version}</span>
            </div>
            <p class="t-body-small" style="margin-top:0.5rem">
              {c.site} · grade {c.grade} · {c.recipient_name} · signed {dateOf(c.signed_on)}
            </p>
            <p style="margin-top:0.5rem">
              <ContentFigure content_bp={c.content_bp} claim_type={c.claim_type} compact />
            </p>
            {c.provisional_factor ? <p class="note">This certificate rests on a provisional conversion factor.</p> : null}
            {c.state === 'withdrawn' ? (
              <p class="note">
                This certificate was withdrawn on {dateOf(c.withdrawn_on)}. Reason: {c.withdrawal_reason}.
              </p>
            ) : null}
          </Link>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------ one certificate */

export function CertificateView({ number, me }) {
  useMeta(`${number} — Certificate`, `The certificate record for ${number}.`);
  const cert = useApi(`/certificates/${number}`);
  const [withdrawing, setWithdrawing] = useState(false);
  const canSign = (me.roles || []).includes('certificate_signer');

  if (cert.loading) return <Loading what="the certificate" />;
  if (cert.error) return <Empty>This certificate could not be loaded. {cert.error.message}</Empty>;
  const c = cert.data;

  return (
    <>
      <p class="t-eyebrow">Certificate</p>
      {/* withdrawn is said before any figure */}
      {c.state === 'withdrawn' ? (
        <div class="banner" role="note" style="margin-top:0.5rem">
          <h3>Withdrawn</h3>
          <p>
            This certificate was withdrawn on {dateOf(c.withdrawn_on)}. Reason: {c.withdrawal_reason}.
          </p>
          <p class="note">Withdrawn by {c.withdrawn_by}. A withdrawal is never a deletion and this address resolves forever.</p>
        </div>
      ) : null}
      <h1 class="display-2" style="margin-top:0.375rem">
        <span class="mono">{c.number}</span>
      </h1>
      <p class="t-body-small" style="margin-top:0.5rem">
        version {c.version} · {c.site} · grade {c.grade} · {c.recipient_name} ({c.recipient}) · signed {dateOf(c.signed_on)}{' '}
        by {c.signer_name} · <Word quiet>{words(c.state)}</Word>
      </p>

      <section class="card" style="margin-top:1.5rem">
        <h2>Claim</h2>
        <div style="margin-top:0.75rem">
          <ContentFigure content_bp={c.content_bp} claim_type={c.claim_type} category_split={c.category_split} />
        </div>
        <p class="note" style="margin-top:0.5rem">
          Period <span class="mono">{c.period}</span> · specification version {c.specification_version} · scheme {c.scheme} ·
          registration <span class="mono">{c.registration}</span>
        </p>
        {c.provisional_factor ? <p class="note">This certificate rests on a provisional conversion factor.</p> : null}
      </section>

      <section class="card" style="margin-top:1.25rem">
        <h2>What the recipient may say</h2>
        <p class="permitted-statement t-body-big" style="margin-top:0.5rem">{c.permitted_statement}</p>
        <h2 style="margin-top:1.25rem">What the recipient may not say</h2>
        <p class="prohibited-statement t-body-big" style="margin-top:0.5rem">{c.prohibited_statement}</p>
      </section>

      <section class="card" style="margin-top:1.25rem">
        <h2>Carbon</h2>
        <div style="margin-top:0.75rem">
          <CarbonFigure carbon={c.carbon} />
        </div>
        {c.carbon?.breakdown ? (
          <div class="scroller" style="margin-top:1rem">
            <table>
              <caption class="visually-hidden">The breakdown attached to this certificate</caption>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col" class="num">mg per kg</th>
                  <th scope="col">Tag</th>
                </tr>
              </thead>
              <tbody>
                {c.carbon.breakdown.map((b) => (
                  <tr key={b.line}>
                    <td>{words(b.line)}</td>
                    <td class="num">{Number(b.mg_per_kg).toLocaleString('en-GB')}</td>
                    <td>{words(b.tag)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div style="margin-top:1.25rem">
          <EnergyPanel carbon={c.carbon} />
        </div>
      </section>

      {/* The internal view carries the deviations that travel with the lots. */}
      {(c.deviations || []).length ? (
        <section class="card" style="margin-top:1.25rem">
          <h2>Deviations touching this certificate's lots</h2>
          <ul style="margin-top:0.5rem">
            {c.deviations.map((d) => (
              <li key={d.reference}>
                <span class="mono">{d.reference}</span> — {words(d.state)}
                {d.outcome ? `, ${words(d.outcome)}` : ''} — {d.detail}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(c.overrides || []).length ? (
        <section class="card" style="margin-top:1.25rem">
          <h2>Overrides on this certificate's lots</h2>
          <ul style="margin-top:0.5rem">
            {c.overrides.map((o) => (
              <li key={o.reference}>
                <span class="mono">{o.reference}</span> — {words(o.separation)} —{' '}
                {o.reviewed ? <Word quiet>Reviewed</Word> : <Word firm>Override unreviewed</Word>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section class="card" style="margin-top:1.25rem">
        <h2>The eight conditions, as they stood at the moment of signing</h2>
        <p class="note">These are stored as they stood then and are never recomputed on read.</p>
        <ol style="margin-top:0.75rem">
          {(c.conditions_at_signing || []).map((x) => (
            <li key={x.condition} style="margin-bottom:0.375rem">
              {words(x.condition)} — {x.satisfied ? 'satisfied' : 'not satisfied'}
              {x.blocking_reference ? <span class="mono"> ({x.blocking_reference})</span> : null}
            </li>
          ))}
        </ol>
      </section>

      <Replay number={number} />

      <section class="card" style="margin-top:1.25rem">
        <h2>The document</h2>
        <p class="note">
          The document is readable without this system. Two reads of the same version return identical bytes.
        </p>
        <Document number={number} version={c.version} />
      </section>

      <p style="margin-top:1.5rem;display:flex;gap:0.5rem;flex-wrap:wrap">
        <a class="btn" href={`/verify/${c.number}`}>
          The public verification address <span class="arrow" aria-hidden="true">→</span>
        </a>
        {canSign && c.state !== 'withdrawn' ? (
          <button type="button" class="btn" onClick={() => setWithdrawing(true)}>
            Begin a withdrawal
          </button>
        ) : null}
      </p>

      {withdrawing ? <Withdrawal number={number} onDone={() => { setWithdrawing(false); cert.reload(); }} onCancel={() => setWithdrawing(false)} /> : null}
    </>
  );
}

function Document({ number, version }) {
  const [text, setText] = useState(null);
  useEffect(() => {
    fetch(`/api/certificates/${encodeURIComponent(number)}/document?version=${version}`)
      .then((r) => r.text())
      .then(setText)
      .catch(() => setText(null));
  }, [number, version]);
  if (text === null) return <p class="loading">Loading the document.</p>;
  return <pre class="doc" style="margin-top:0.75rem">{text}</pre>;
}

/* The replay result. Agreement and disagreement render at identical weight. */
function Replay({ number }) {
  const rep = useApi(`/certificates/${number}/replay`);
  if (rep.loading) return <p class="loading">Loading the replay result.</p>;
  if (rep.error) return null;
  const r = rep.data;
  return (
    <section class="card" style="margin-top:1.25rem">
      <h2>Replay</h2>
      {r.reproducible === false ? (
        <>
          <p class="t-body-big" style="margin-top:0.5rem">This figure is not reproducible.</p>
          <p class="note">{r.reason}</p>
        </>
      ) : (
        <>
          <p class="t-body-big" style="margin-top:0.5rem">
            {r.agrees ? 'The recomputation agrees with what was issued.' : 'The recomputation differs from what was issued.'}
          </p>
          <div class="scroller" style="margin-top:1rem">
            <table>
              <caption class="visually-hidden">What the certificate said and what recomputation says now</caption>
              <thead>
                <tr>
                  <th scope="col">Input</th>
                  <th scope="col">Issued</th>
                  <th scope="col">Recomputed</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(r.issued || {}).map((k) => (
                  <tr key={k}>
                    <td>{words(k)}</td>
                    <td class="mono">{String(r.issued[k])}</td>
                    <td class="mono">{String(r.recomputed[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.differing_input ? (
            <p class="note" style="margin-top:0.75rem">
              The one input that moved is {words(r.differing_input.input)}: issued{' '}
              <span class="mono">{String(r.differing_input.issued)}</span>, recomputed{' '}
              <span class="mono">{String(r.differing_input.recomputed)}</span>.
            </p>
          ) : null}
        </>
      )}
      <p class="note" style="margin-top:0.75rem">
        Input versions:{' '}
        {Object.entries(r.input_versions || {})
          .map(([k, v]) => `${words(k)} ${v}`)
          .join(' · ')}
      </p>
    </section>
  );
}

/* Withdrawal lives here. Before confirming, the screen shows the five
   consequences and the actual enumerated lists, not a count of them. */
function Withdrawal({ number, onDone, onCancel }) {
  const pv = useApi(`/certificates/${number}/withdrawal-preview`);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const confirm = async (e) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api(`/certificates/${number}/withdraw`, { method: 'POST', body: { reason }, key: idempotencyKey('wd') });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <section class="card" style="margin-top:1.5rem" aria-labelledby="wd-h">
      <h2 id="wd-h">Withdraw {number}</h2>
      <p class="note">A withdrawal is one action with five consequences. It is never a deletion.</p>
      {pv.loading ? <Loading what="the blast radius" /> : null}
      {pv.data ? (
        <>
          <h3 style="margin-top:1rem">The five consequences</h3>
          <ol style="margin-top:0.5rem">
            {pv.data.consequences.map((x, i) => (
              <li key={i} style="margin-bottom:0.25rem">{x}</li>
            ))}
          </ol>

          <h3 style="margin-top:1.25rem">The recipients who will be notified</h3>
          {pv.data.notified_recipients.length ? (
            <ul style="margin-top:0.5rem">
              {pv.data.notified_recipients.map((r) => (
                <li key={r.reference}>
                  {r.name} <span class="mono">({r.reference}{r.contact ? `, ${r.contact}` : ''})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p class="empty">No recipient is named on this certificate.</p>
          )}

          <h3 style="margin-top:1.25rem">The statements the recipient is now obliged to stop making</h3>
          <ul style="margin-top:0.5rem">
            {pv.data.void_statements.map((s, i) => (
              <li key={i} style="margin-bottom:0.375rem">{s}</li>
            ))}
          </ul>

          <h3 style="margin-top:1.25rem">Certificates derived from this one</h3>
          {(pv.data.derived_certificates || []).length ? (
            <ul style="margin-top:0.5rem">
              {pv.data.derived_certificates.map((d) => (
                <li key={`${d.number}-${d.version}`} class="mono">{d.number} v{d.version} — {words(d.state)}</li>
              ))}
            </ul>
          ) : (
            <p class="empty">No certificate is derived from this one.</p>
          )}

          <h3 style="margin-top:1.25rem">The reverse traversal of the underlying batches</h3>
          <p class="note" style="margin-top:0.5rem">
            Batches: <span class="mono">{(pv.data.batch_traversal?.batches || []).join(', ') || 'none'}</span>
          </p>
          {(pv.data.batch_traversal?.other_certificates_touching_them || []).length ? (
            <ul style="margin-top:0.5rem">
              {pv.data.batch_traversal.other_certificates_touching_them.map((x) => (
                <li key={x.number}>
                  <span class="mono">{x.number}</span> — {x.recipient_name} — {words(x.state)}
                </li>
              ))}
            </ul>
          ) : (
            <p class="empty">No other certificate touches those batches.</p>
          )}

          <form onSubmit={confirm} style="margin-top:1.5rem;max-width:36rem" novalidate>
            <div class="field">
              <label for="wd-reason">Reason for withdrawal</label>
              <textarea id="wd-reason" rows="3" value={reason} onInput={(e) => setReason(e.currentTarget.value)} required />
              <span class="hint">This is the only free text on a certificate, and it is stated on the public verification answer.</span>
            </div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
              <button type="submit" class="btn btn-primary" disabled={pending || !reason.trim()}>
                {pending ? 'Withdrawing' : 'Confirm this withdrawal'} <span class="arrow" aria-hidden="true">→</span>
              </button>
              <button type="button" class="btn" onClick={onCancel}>
                Do not withdraw
              </button>
            </div>
          </form>
          <div aria-live="polite">
            <RefusalBanner error={error} />
          </div>
        </>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------- the wizard */

const STEPS = [
  ['lot', 'Lot', '/console/certificates/new/lot'],
  ['claim', 'Claim', '/console/certificates/new/claim'],
  ['recipient', 'Recipient', '/console/certificates/new/recipient'],
  ['review', 'Review', '/console/certificates/new/review'],
];

const DRAFT_KEY = 'ravel.cert.draft';

function readDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeDraft(d) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* storage may be unavailable */
  }
}

export function Wizard({ step, me }) {
  useMeta(`Sign a certificate — ${words(step)}`, 'Four steps, four addresses, each showing the eight conditions as they stand.');
  const [draft, setDraft] = useState(readDraft);
  const update = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    writeDraft(next);
  };

  const lots = useApi('/lots');
  const customers = useApi('/customers');
  const preview = useApi(draft.lot ? `/certificates/preview-not-a-get` : null);

  // The eight conditions are read on every step, as they stand.
  const [conditions, setConditions] = useState({ loading: false, data: null, error: null });
  useEffect(() => {
    if (!draft.lot) {
      setConditions({ loading: false, data: null, error: null });
      return;
    }
    setConditions({ loading: true, data: null, error: null });
    api('/certificates/preview', { method: 'POST', body: { lot: draft.lot, recipient: draft.recipient || null }, key: idempotencyKey('prev') })
      .then((data) => setConditions({ loading: false, data, error: null }))
      .catch((error) => setConditions({ loading: false, data: null, error }));
  }, [draft.lot, draft.recipient, step]);

  return (
    <>
      <p class="t-eyebrow">Sign a certificate</p>
      <h1 class="display-2" style="margin-top:0.375rem">{STEPS.find(([s]) => s === step)?.[1]}</h1>

      <nav aria-label="Wizard steps" style="margin-top:1rem">
        <ol style="list-style:none;display:flex;gap:0.5rem;flex-wrap:wrap;padding:0;margin:0">
          {STEPS.map(([s, label, href], i) => (
            <li key={s}>
              <Link href={href} class="nav-link" aria-current={step === s ? 'step' : undefined}>
                {i + 1}. {label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      {step === 'lot' ? (
        <StepLot lots={lots} draft={draft} update={update} />
      ) : null}
      {step === 'claim' ? <StepClaim draft={draft} conditions={conditions} /> : null}
      {step === 'recipient' ? <StepRecipient customers={customers} draft={draft} update={update} /> : null}
      {step === 'review' ? <StepReview draft={draft} conditions={conditions} me={me} /> : null}

      <Conditions conditions={conditions} draft={draft} />
    </>
  );
}

// Each step shows the eight conditions as eight statements, each either
// satisfied or naming exactly what blocks it. No control dismisses one.
function Conditions({ conditions, draft }) {
  return (
    <section style="margin-top:2rem" aria-labelledby="cond-h">
      <h2 id="cond-h" class="display-2">The eight conditions</h2>
      <p class="note">
        None of the eight is waivable and the same eight are re-checked on the server at the moment of signing. No control
        on this screen dismisses one.
      </p>
      {!draft.lot ? <p class="empty" style="margin-top:1rem">Choose a lot and the eight conditions will be read against it.</p> : null}
      {conditions.loading ? <Loading what="the eight conditions" /> : null}
      {conditions.error ? <Empty>The eight conditions could not be read. {conditions.error.message}</Empty> : null}
      {conditions.data ? (
        <div style="margin-top:1rem">
          {conditions.data.conditions.map((x) => (
            <div key={x.condition} class={`condition-row ${x.satisfied ? '' : 'unsatisfied'}`}>
              <div class="node-head">
                <Word firm={!x.satisfied} quiet={x.satisfied}>{x.satisfied ? 'Satisfied' : 'Not satisfied'}</Word>
                <span class="t-label">{x.statement}</span>
              </div>
              {!x.satisfied ? (
                <>
                  <p class="t-body-small" style="margin-top:0.5rem">{x.detail}</p>
                  {x.blocking_reference ? (
                    <p class="note" style="margin-top:0.25rem">
                      The record that would resolve it:{' '}
                      <BlockingLink reference={x.blocking_reference} condition={x.condition} />
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BlockingLink({ reference, condition }) {
  let href = null;
  if (/^LOT-/.test(reference)) href = `/console/lots/${reference}`;
  else if (/^BP-/.test(reference)) href = `/console/balance/${reference}`;
  else if (/^OVR-/.test(reference) || /^DEV-/.test(reference)) href = '/console/record';
  else if (/^CERT-/.test(reference)) href = `/console/certificates/${reference}`;
  if (href) {
    return (
      <Link href={href} class="mono">
        {reference}
      </Link>
    );
  }
  return <span class="mono">{reference}</span>;
}

function StepLot({ lots, draft, update }) {
  return (
    <section style="margin-top:1.5rem">
      <h2>Choose a lot</h2>
      {lots.loading ? <Loading what="the lots" /> : null}
      {lots.data && !lots.data.length ? <Empty>No lot is available to certify.</Empty> : null}
      <div class="grid-2" style="margin-top:1rem">
        {(lots.data || []).map((l) => (
          <button
            key={l.reference}
            type="button"
            class="card"
            style={`text-align:left;cursor:pointer;${draft.lot === l.reference ? 'border-color:var(--ink);border-width:2px' : ''}`}
            aria-pressed={draft.lot === l.reference}
            onClick={() => update({ lot: l.reference })}
          >
            <div class="node-head">
              <span class="mono">{l.reference}</span>
              <Word quiet>{words(l.disposition)}</Word>
            </div>
            <p class="t-body-small" style="margin-top:0.5rem">
              {l.site} · grade {l.grade} · {grams(l.mass_g)}
            </p>
            <p style="margin-top:0.5rem">
              <ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} compact />
            </p>
          </button>
        ))}
      </div>
      {draft.lot ? (
        <p style="margin-top:1.25rem">
          <Link href="/console/certificates/new/claim" class="btn btn-primary">
            Continue to the claim <span class="arrow" aria-hidden="true">→</span>
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function StepClaim({ draft, conditions }) {
  const d = conditions.data;
  return (
    <section style="margin-top:1.5rem">
      <h2>The claim</h2>
      {!draft.lot ? (
        <p class="empty">No lot has been chosen. <Link href="/console/certificates/new/lot">Choose one</Link>.</p>
      ) : null}
      {d ? (
        <>
          <div class="card" style="margin-top:1rem">
            <ContentFigure content_bp={d.content_bp} claim_type={d.claim_type} category_split={d.category_split} />
            <p class="note" style="margin-top:0.75rem">
              Every percentage here is computed from the ledger. No control on this wizard accepts one.
            </p>
            {d.provisional_factor ? (
              <p class="note">This claim rests on a provisional conversion factor, and the certificate will say so.</p>
            ) : null}
          </div>
          {d.carbon ? (
            <div class="card" style="margin-top:1.25rem">
              <h3>Carbon</h3>
              <div style="margin-top:0.75rem">
                <CarbonFigure carbon={d.carbon} />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <p style="margin-top:1.25rem">
        <Link href="/console/certificates/new/recipient" class="btn btn-primary">
          Continue to the recipient <span class="arrow" aria-hidden="true">→</span>
        </Link>
      </p>
    </section>
  );
}

function StepRecipient({ customers, draft, update }) {
  return (
    <section style="margin-top:1.5rem">
      <h2>Choose a recipient</h2>
      {customers.loading ? <Loading what="the recipients" /> : null}
      <div class="grid-2" style="margin-top:1rem">
        {(customers.data || []).map((c) => (
          <button
            key={c.reference}
            type="button"
            class="card"
            style={`text-align:left;cursor:pointer;${draft.recipient === c.reference ? 'border-color:var(--ink);border-width:2px' : ''}`}
            aria-pressed={draft.recipient === c.reference}
            onClick={() => update({ recipient: c.reference })}
          >
            <div class="node-head">
              <span class="mono">{c.reference}</span>
              <span class="t-label-small muted">{c.industry}</span>
            </div>
            <p class="t-body-small" style="margin-top:0.5rem">
              {c.name} · {c.contact} · {c.application}
            </p>
            <p class="note">
              Holds {c.holds_specification} v{c.holds_specification_version}. The permitted statement will be generated in{' '}
              {c.language === 'fr' ? 'French' : 'English'}.
            </p>
          </button>
        ))}
      </div>
      {draft.recipient ? (
        <p style="margin-top:1.25rem">
          <Link href="/console/certificates/new/review" class="btn btn-primary">
            Continue to the review <span class="arrow" aria-hidden="true">→</span>
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function StepReview({ draft, conditions, me }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const d = conditions.data;
  const allOk = d ? d.all_satisfied : false;

  const sign = async (e) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const r = await api('/certificates', { method: 'POST', body: { lot: draft.lot, recipient: draft.recipient, password }, key: idempotencyKey('sign') });
      writeDraft({});
      navigate(`/console/certificates/${r.number}`);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <section style="margin-top:1.5rem">
      <h2>The exact document that will be signed</h2>
      <p class="note">
        The recipient will file this document with their own regulator. You are signing what they will read rather than a
        form that generates it.
      </p>
      {!draft.lot || !draft.recipient ? (
        <p class="empty" style="margin-top:1rem">
          A lot and a recipient are both needed. <Link href="/console/certificates/new/lot">Start at the lot</Link>.
        </p>
      ) : null}
      {d ? (
        <>
          <div class="card" style="margin-top:1rem">
            <p class="t-eyebrow">Claim type</p>
            <p class="t-h4">{words(d.claim_type)}</p>
            <p class="t-eyebrow" style="margin-top:1rem">Recycled content</p>
            <ContentFigure content_bp={d.content_bp} claim_type={d.claim_type} category_split={d.category_split} />
            <hr class="rule" />
            <p class="t-eyebrow">What the recipient may say</p>
            <p class="permitted-statement t-body-big">{d.permitted_statement}</p>
            <p class="t-eyebrow" style="margin-top:1rem">What the recipient may not say</p>
            <p class="prohibited-statement t-body-big">{d.prohibited_statement}</p>
            {d.carbon ? (
              <>
                <hr class="rule" />
                <p class="t-eyebrow">Carbon</p>
                <CarbonFigure carbon={d.carbon} />
              </>
            ) : null}
          </div>

          <form onSubmit={sign} style="margin-top:1.5rem;max-width:32rem" novalidate>
            <h3>Confirm your identity</h3>
            <p class="note">
              Signing re-authenticates. A session alone is not a signing credential, so the password is carried again at
              the moment of signing.
            </p>
            <div class="field" style="margin-top:0.75rem">
              <label for="sign-pw">Password for {me.email}</label>
              <input id="sign-pw" type="password" value={password} onInput={(e) => setPassword(e.currentTarget.value)} required autocomplete="current-password" />
            </div>
            <button type="submit" class="btn btn-primary" disabled={pending || !password || !allOk}>
              {pending ? 'Signing' : 'Sign this certificate'} <span class="arrow" aria-hidden="true">→</span>
            </button>
            {!allOk ? (
              <p class="note" style="margin-top:0.5rem">
                One of the eight conditions below is unsatisfied. It is not dismissible from this screen, and the server
                would refuse the signature in any case.
              </p>
            ) : null}
          </form>
          <div aria-live="polite">
            <RefusalBanner error={error} />
          </div>
        </>
      ) : null}
    </section>
  );
}
