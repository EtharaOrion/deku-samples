import { useEffect, useState } from 'preact/hooks';
import { api, storedSession } from '../api.js';
import { Link, navigate, useMetadata } from '../router.jsx';
import { useFetch } from './console.jsx';
import {
  StateWord, ContentFigure, CarbonFigure, Refusal, Loading, Empty, Mark, formatG, formatBp
} from '../components/primitives.jsx';

/* The wizard keeps its choices in the address bar, so each of the four steps is
   reachable at its own address and a reader who returns to one has not lost
   what they chose. */
function wizardState() {
  const p = new URLSearchParams(location.search);
  return { lot: p.get('lot') || '', recipient: p.get('recipient') || '' };
}
function withState(step, next) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(next)) {
    if (v) p.set(k, v); else p.delete(k);
  }
  const qs = p.toString();
  return `/console/certificates/new/${step}${qs ? `?${qs}` : ''}`;
}

const STEPS = [
  { key: 'lot', title: 'Choose the lot' },
  { key: 'claim', title: 'Read the claim' },
  { key: 'recipient', title: 'Name the recipient' },
  { key: 'review', title: 'Review and sign' }
];

/** Each step shows the eight conditions as eight statements, each either
 *  satisfied or naming exactly what blocks it, with a link to the record that
 *  would resolve it. No condition is dismissible from this screen by any
 *  control: there is no control that would dismiss one. */
function Conditions({ preview }) {
  if (!preview) {
    return (
      <p class="t-small t-muted">
        Choose a lot and a recipient to see the eight conditions as they stand.
      </p>
    );
  }
  return (
    <section class="sheet conditions" aria-labelledby="conditions-head">
      <h2 id="conditions-head" class="t-h4">The eight conditions</h2>
      <p class="t-small t-muted">
        None of the eight is waivable, and the same eight are decided again on the server at the
        moment of signing, against the records as they stand then.
      </p>
      {/* The wizard becomes one condition per row at the narrowest width. */}
      <ol class="condition-list">
        {preview.conditions.map((c, i) => (
          <li key={i} class="condition-row">
            <span class="t-label condition-index">{i + 1}</span>
            <span class="condition-statement">{c.condition}</span>
            <span class="condition-state">
              {c.satisfied
                ? <span class="t-small">satisfied</span>
                : <StateWord word="blocked" />}
            </span>
            <span class="condition-detail t-small">
              {c.detail}
              {!c.satisfied && c.link && (
                <>
                  {' '}
                  <Link href={c.link} class="t-mono condition-link">
                    Open {c.blocking_reference || 'the record'}
                  </Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepNav({ current, state }) {
  return (
    <nav class="wizard-steps" aria-label="Certificate steps">
      <ol>
        {STEPS.map((s, i) => (
          <li key={s.key} class={s.key === current ? 'wizard-step-current' : ''}>
            <Link href={withState(s.key, state)}
              aria-current={s.key === current ? 'step' : undefined}>
              <span class="t-label">Step {i + 1}</span>
              <span>{s.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function CertificateWizard({ step }) {
  useMetadata({
    title: `Issue a certificate — ${STEPS.find((s) => s.key === step)?.title || ''}`,
    description: 'Four steps, each at its own address, each showing the eight conditions as they stand.'
  });
  const [state, setState] = useState(wizardState);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const lots = useFetch('/lots');
  const customers = useFetch('/customers');
  const [refusal, setRefusal] = useState(null);
  const [signed, setSigned] = useState(null);
  const [signing, setSigning] = useState(false);
  const session = storedSession();

  useEffect(() => { setState(wizardState()); }, [step]);

  useEffect(() => {
    if (!state.lot) { setPreview(null); return; }
    let live = true;
    setPreviewing(true);
    api('/certificates/preview', { method: 'POST', body: { lot: state.lot, recipient: state.recipient || null } })
      .then((d) => { if (live) { setPreview(d); setPreviewing(false); } })
      .catch((e) => { if (live) { setRefusal(e.body); setPreviewing(false); } });
    return () => { live = false; };
  }, [state.lot, state.recipient, step]);

  function choose(next) {
    const merged = { ...state, ...next };
    setState(merged);
    history.replaceState({}, '', withState(step, merged));
  }

  async function sign(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSigning(true); setRefusal(null);
    try {
      const r = await api('/certificates', {
        method: 'POST',
        body: { lot: state.lot, recipient: state.recipient, password: form.get('password') }
      });
      setSigned(r);
    } catch (err) {
      setRefusal(err.body);
    } finally {
      setSigning(false);
    }
  }

  if (signed) {
    return (
      <div class="console-route console-wide">
        <header class="console-head">
          <span class="t-eyebrow">Certificate issued</span>
          <h1 class="t-h4 t-mono">{signed.number}</h1>
        </header>
        <div class="result-success">
          <p class="t-label">Signed</p>
          <p>
            {signed.number} has been issued to {signed.recipient_name} and the recipient has
            been notified. The document is readable at its own address and the verification
            page is public.
          </p>
        </div>
        <p>
          <Link href={`/console/certificates/${signed.number}`} class="button button-primary">
            Open the certificate <span class="arrow" aria-hidden="true">→</span>
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div class="console-route console-wide">
      <header class="console-head">
        <span class="t-eyebrow">Issue a certificate</span>
        <h1 class="t-h4">{STEPS.find((s) => s.key === step)?.title}</h1>
      </header>

      <StepNav current={step} state={state} />

      <Refusal refusal={refusal} onDismiss={() => setRefusal(null)} />

      {step === 'lot' && (
        <section class="sheet stack">
          <h2 class="t-h4">Which lot is this certificate for?</h2>
          {lots.loading && <Loading what="the lot register" />}
          {lots.data?.length === 0 && <Empty>No lot is available to certify.</Empty>}
          {lots.data && (
            <ul class="choice-list">
              {lots.data.map((l) => (
                <li key={l.reference}>
                  <label class="choice">
                    <input type="radio" name="lot" value={l.reference}
                      checked={state.lot === l.reference}
                      onChange={() => choose({ lot: l.reference })} />
                    <span>
                      <span class="t-mono">{l.reference}</span>{' '}
                      <span class="t-small t-muted">
                        {l.site} · {formatG(l.mass_g)} g · {l.disposition}
                      </span>
                      <ContentFigure contentBp={l.content_bp} claimType={l.claim_type} compact />
                      {l.flags.map((f) => <StateWord key={f} word={f.replace(/_/g, ' ')} />)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <Link href={withState('claim', state)} class="button button-primary"
            aria-disabled={!state.lot}>
            Continue to the claim <span class="arrow" aria-hidden="true">→</span>
          </Link>
        </section>
      )}

      {step === 'claim' && (
        <section class="sheet stack">
          <h2 class="t-h4">The claim this lot carries</h2>
          {previewing && <Loading what="the claim" />}
          {preview && (
            <>
              <ContentFigure contentBp={preview.content_bp} claimType={preview.claim_type} />
              <dl class="kv kv-wide">
                <div><dt>Site</dt><dd class="t-mono">{preview.site}</dd></div>
                <div><dt>Grade</dt><dd class="t-mono">{preview.grade}</dd></div>
                <div><dt>Period</dt><dd class="t-mono">{preview.period}</dd></div>
                {preview.category_split && (
                  <>
                    <div><dt>Post-consumer</dt><dd class="t-mono">{formatG(preview.category_split.post_consumer)} g</dd></div>
                    <div><dt>Pre-consumer</dt><dd class="t-mono">{formatG(preview.category_split.pre_consumer)} g</dd></div>
                  </>
                )}
              </dl>
              {preview.provisional_factor && (
                <StateWord word="provisional conversion factor"
                  detail="every certificate resting on it says so" />
              )}
              <h3 class="t-h4">Carbon</h3>
              <CarbonFigure carbon={preview.carbon} />
            </>
          )}
          <Link href={withState('recipient', state)} class="button button-primary">
            Continue to the recipient <span class="arrow" aria-hidden="true">→</span>
          </Link>
        </section>
      )}

      {step === 'recipient' && (
        <section class="sheet stack">
          <h2 class="t-h4">Who receives this certificate?</h2>
          {customers.loading && <Loading what="the customers" />}
          {customers.data && (
            <ul class="choice-list">
              {customers.data.map((cu) => (
                <li key={cu.reference}>
                  <label class="choice">
                    <input type="radio" name="recipient" value={cu.reference}
                      checked={state.recipient === cu.reference}
                      onChange={() => choose({ recipient: cu.reference })} />
                    <span>
                      <span class="t-mono">{cu.reference}</span>{' '}
                      <span class="t-small t-muted">
                        {cu.application} · {cu.industry} · statements in{' '}
                        {cu.language === 'fr' ? 'French' : 'English'}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <Link href={withState('review', state)} class="button button-primary"
            aria-disabled={!state.recipient}>
            Continue to the review <span class="arrow" aria-hidden="true">→</span>
          </Link>
        </section>
      )}

      {step === 'review' && (
        <>
          {/* The fourth step renders the exact document that will be signed,
              including the permitted downstream statement and its counterpart
              in the recipient's language, so the signer signs what the recipient
              will read rather than a form that generates it. */}
          <section class="sheet stack">
            <h2 class="t-h4">The document that will be signed</h2>
            {previewing && <Loading what="the document" />}
            {preview && (
              <>
                <div class="document-preview">
                  <p class="t-label">Recipient</p>
                  <p>{preview.recipient_name || preview.recipient || 'not yet chosen'}</p>

                  <p class="t-label">Claim type</p>
                  <p>{preview.claim_type?.replace(/_/g, ' ')}</p>

                  <p class="t-label">Recycled content</p>
                  <ContentFigure contentBp={preview.content_bp} claimType={preview.claim_type} />

                  <p class="t-label">Product carbon footprint</p>
                  <CarbonFigure carbon={preview.carbon} />

                  <p class="t-label">What the recipient may state</p>
                  <p class="statement permitted-statement">{preview.permitted_statement}</p>

                  <p class="t-label">What the recipient may not state</p>
                  <p class="statement prohibited-statement">{preview.prohibited_statement}</p>
                </div>

                <p class="t-small">
                  The recipient will file this document with a regulator. What it says is what
                  they are entitled to say, and nothing on this screen dismisses a condition
                  below.
                </p>
              </>
            )}
          </section>

          <Conditions preview={preview} />

          {preview && (
            <section class="sheet stack">
              <h2 class="t-h4">Sign</h2>
              {preview.can_sign ? (
                <>
                  <p class="t-small">
                    Signing re-authenticates. Your session is not a signing credential, so the
                    act carries your password again.
                  </p>
                  <form class="stack" onSubmit={sign}>
                    <label>
                      <span class="t-label">Your password, {session?.email}</span>
                      <input name="password" type="password" required autocomplete="current-password" />
                    </label>
                    <button type="submit" class="button-primary" disabled={signing}>
                      {signing ? 'Checking and signing' : 'Sign this certificate'}
                    </button>
                  </form>
                </>
              ) : (
                <p class="statement">
                  {preview.blocking.length} of the eight conditions
                  {preview.blocking.length === 1 ? ' is' : ' are'} unsatisfied, so this
                  certificate cannot be signed. Resolve the record each one names above. No
                  control on this screen dismisses a condition.
                </p>
              )}
            </section>
          )}
        </>
      )}

      {step !== 'review' && <Conditions preview={preview} />}
    </div>
  );
}

/* ---------------------------------------------------- the register and one */

export function CertificateList() {
  useMetadata({ title: 'Certificates', description: 'The certificate register.' });
  const certs = useFetch('/certificates');
  const session = storedSession();
  const canSign = (session?.roles || []).includes('certificate_signer');

  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Issued artefacts</span>
        <h1 class="t-h4">Certificates</h1>
        {canSign && (
          <p>
            <Link href="/console/certificates/new/lot" class="button button-primary">
              Issue a certificate <span class="arrow" aria-hidden="true">→</span>
            </Link>
          </p>
        )}
      </header>
      {certs.loading && <Loading what="the certificate register" />}
      {certs.data?.length === 0 && <Empty>No certificate has been issued yet.</Empty>}
      {certs.data && certs.data.length > 0 && (
        <div class="table-scroll">
          <table>
            <caption class="visually-hidden">Certificate register</caption>
            <thead>
              <tr>
                <th scope="col">Number</th><th scope="col">Site</th><th scope="col">Recipient</th>
                <th scope="col">Recycled content</th><th scope="col">Issued</th><th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {certs.data.map((c) => (
                <tr key={c.number}>
                  <td><Link href={`/console/certificates/${c.number}`} class="t-mono">{c.number}</Link></td>
                  <td class="t-mono">{c.site}</td>
                  <td>{c.recipient_name}</td>
                  <td><ContentFigure contentBp={c.content_bp} claimType={c.claim_type} compact /></td>
                  <td class="t-mono">{c.issued_on}</td>
                  <td>
                    {c.state === 'withdrawn'
                      ? <StateWord word="withdrawn" detail={`on ${c.withdrawn_on}`} />
                      : c.state}
                    {c.provisional_factor && <StateWord word="provisional factor" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function CertificateDetail({ number }) {
  useMetadata({ title: `Certificate ${number}`, description: 'One certificate, its conditions at signing, and its withdrawal.' });
  const cert = useFetch(`/certificates/${number}`, [number]);
  const [replay, setReplay] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [plan, setPlan] = useState(null);
  const [refusal, setRefusal] = useState(null);
  const [done, setDone] = useState(null);
  const [document_, setDocument_] = useState(null);
  const session = storedSession();
  const canWithdraw = (session?.roles || []).includes('certificate_signer');

  useEffect(() => {
    api(`/certificates/${number}/replay`).then(setReplay).catch(() => setReplay(null));
    fetch(`/api/certificates/${number}/document`).then((r) => r.text()).then(setDocument_).catch(() => {});
  }, [number]);

  /** Before confirming, the screen lists the recipients who will be notified by
   *  name, not a count, and the downstream statements the recipient is now
   *  obliged to stop making. The plan is assembled from what the certificate
   *  already carries, so nothing is guessed. */
  function planWithdrawal() {
    if (!cert.data) return;
    setPlan({
      recipients: [{ reference: cert.data.recipient, name: cert.data.recipient_name }],
      void_statements: [
        cert.data.permitted_statement,
        `Any restatement of ${cert.data.content_bp} basis points of recycled content sourced from certificate ${number}.`,
        `Any description of material under certificate ${number} as carrying a ${cert.data.claim_type.replace(/_/g, ' ')} claim.`,
        `Any onward declaration to a regulator or a customer that rests on certificate ${number}.`
      ]
    });
  }

  async function confirmWithdrawal(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setWithdrawing(true); setRefusal(null);
    try {
      const r = await api(`/certificates/${number}/withdraw`, {
        method: 'POST', body: { reason: form.get('reason') }
      });
      setDone(r);
      setPlan(null);
      cert.reload();
    } catch (err) {
      setRefusal(err.body);
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div class="console-route console-wide">
      <header class="console-head">
        <span class="t-eyebrow">Certificate</span>
        <h1 class="t-h4 t-mono">{number}</h1>
      </header>

      {cert.loading && <Loading what="this certificate" />}
      {cert.error && <Refusal refusal={cert.error} />}

      {cert.data && (
        <>
          {/* A withdrawn certificate says withdrawn before it shows any figure. */}
          {cert.data.state === 'withdrawn' && (
            <div class="withdrawal-notice sheet">
              <StateWord word="withdrawn" />
              <p class="statement">
                This certificate was withdrawn on {cert.data.withdrawn_on}.
                Reason: {cert.data.withdrawal_reason}.
              </p>
              <p class="t-small t-muted">
                A withdrawal is never a deletion. This document stays readable at its address,
                and the remedy is a new certificate rather than a reinstatement.
              </p>
            </div>
          )}

          <section class="sheet stack">
            <h2 class="t-h4">Claim</h2>
            <ContentFigure contentBp={cert.data.content_bp} claimType={cert.data.claim_type} />
            <dl class="kv kv-wide">
              <div><dt>Version</dt><dd class="t-mono">{cert.data.version}</dd></div>
              <div><dt>Site</dt><dd class="t-mono">{cert.data.site}</dd></div>
              <div><dt>Grade</dt><dd class="t-mono">{cert.data.grade}</dd></div>
              <div><dt>Recipient</dt><dd>{cert.data.recipient_name}</dd></div>
              <div><dt>Period</dt><dd class="t-mono">{cert.data.period}</dd></div>
              <div><dt>Scheme</dt><dd class="t-mono">{cert.data.scheme}</dd></div>
              <div><dt>Registration</dt><dd class="t-mono">{cert.data.registration}</dd></div>
              <div><dt>Signed by</dt><dd>{cert.data.signer_name}</dd></div>
              <div><dt>Issued on</dt><dd class="t-mono">{cert.data.issued_on}</dd></div>
              <div><dt>Verify at</dt><dd><a href={`/verify/${number}`} class="t-mono">/verify/{number}</a></dd></div>
            </dl>
            {cert.data.provisional_factor && (
              <StateWord word="provisional conversion factor" />
            )}
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">Carbon</h2>
            <CarbonFigure carbon={cert.data.carbon} />
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">Statements</h2>
            <p class="t-label">What the recipient may state</p>
            <p class="statement permitted-statement">{cert.data.permitted_statement}</p>
            <p class="t-label">What the recipient may not state</p>
            <p class="statement prohibited-statement">{cert.data.prohibited_statement}</p>
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">The eight conditions, as they stood at signing</h2>
            <p class="t-small t-muted">
              Stored at the moment of signing and never recomputed on read.
            </p>
            <ol class="condition-list">
              {(cert.data.conditions_at_signing || []).map((c, i) => (
                <li key={i} class="condition-row">
                  <span class="t-label condition-index">{i + 1}</span>
                  <span class="condition-statement">{c.condition}</span>
                  <span class="condition-state t-small">
                    {c.satisfied ? 'satisfied' : <StateWord word="blocked" />}
                  </span>
                  <span class="condition-detail t-small">{c.detail || ''}</span>
                </li>
              ))}
            </ol>
          </section>

          {cert.data.deviations?.length > 0 && (
            <section class="sheet stack">
              <h2 class="t-h4">Deviations touching this certificate's lots</h2>
              {cert.data.deviations.map((d) => (
                <p key={d.reference}>
                  <span class="t-mono">{d.reference}</span> — {d.title}
                  {d.state === 'open' && <StateWord word="open deviation" />}
                </p>
              ))}
            </section>
          )}

          {/* The replay result: what a certificate said, what recomputation says
              now, and the input that differs. Agreement and disagreement render
              at identical weight. */}
          {replay && (
            <section class="sheet stack">
              <h2 class="t-h4">Replay</h2>
              {replay.reproducible === false ? (
                <>
                  <StateWord word="not reproducible" />
                  <p class="statement">{replay.reason}</p>
                </>
              ) : (
                <>
                  <div class="table-scroll">
                    <table>
                      <caption class="visually-hidden">What the certificate said and what recomputation says</caption>
                      <thead>
                        <tr><th scope="col">Figure</th><th scope="col" class="num">As issued</th>
                          <th scope="col" class="num">Recomputed now</th></tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Recycled content, basis points</td>
                          <td class="num">{replay.issued.content_bp}</td>
                          <td class="num">{replay.recomputed.content_bp}</td>
                        </tr>
                        <tr>
                          <td>Carbon, mg CO2e per kg</td>
                          <td class="num">{replay.issued.value_mg_per_kg?.toLocaleString('en-GB')}</td>
                          <td class="num">{replay.recomputed.value_mg_per_kg?.toLocaleString('en-GB')}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p class="replay-verdict">
                    {replay.agrees
                      ? 'The recomputation agrees with what was issued.'
                      : 'The recomputation differs from what was issued.'}
                  </p>
                  {replay.differing_input && (
                    <p class="statement">
                      The input that moved: {replay.differing_input.input}. Issued{' '}
                      <span class="t-mono">{replay.differing_input.issued}</span>, recomputed{' '}
                      <span class="t-mono">{replay.differing_input.recomputed}</span>.
                    </p>
                  )}
                  <h3 class="t-h4">The versions it ran against</h3>
                  <dl class="kv kv-wide">
                    {Object.entries(replay.input_versions || {}).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k.replace(/_/g, ' ')}</dt>
                        <dd class="t-mono">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </section>
          )}

          {document_ && (
            <section class="sheet stack">
              <h2 class="t-h4">The document</h2>
              <p class="t-small t-muted">
                Readable without this system, and byte-stable: two reads of this version return
                identical bytes.
              </p>
              <pre class="document-text">{document_}</pre>
            </section>
          )}

          {canWithdraw && cert.data.state !== 'withdrawn' && (
            <section class="sheet stack withdraw-section">
              <h2 class="t-h4">Withdraw this certificate</h2>
              {!plan && !done && (
                <>
                  <p class="t-small">
                    A withdrawal is one action with five consequences. Before you confirm, this
                    screen shows every one of them by name.
                  </p>
                  <button type="button" onClick={planWithdrawal}>Begin a withdrawal</button>
                </>
              )}

              {plan && (
                <div class="withdraw-plan stack">
                  <h3 class="t-h4">What this withdrawal will do</h3>
                  <ol class="consequence-list">
                    <li>
                      The state becomes <strong>withdrawn</strong>, with your reason, your name
                      and today's date.
                    </li>
                    <li>
                      These recipients will be notified, by name:
                      <ul class="named-list">
                        {plan.recipients.map((r) => (
                          <li key={r.reference}>
                            {r.name} <span class="t-mono t-small">({r.reference})</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                    <li>
                      These downstream statements become void, and the recipient is obliged to
                      stop making them:
                      <ul class="named-list">
                        {plan.void_statements.map((s, i) => (
                          <li key={i} class="statement">{s}</li>
                        ))}
                      </ul>
                    </li>
                    <li>
                      Every certificate derived from this one will be identified and resolved.
                    </li>
                    <li>
                      The reverse traversal of the underlying batches will run, so every other
                      certificate touching them is enumerated in the same action.
                    </li>
                  </ol>

                  <form class="stack" onSubmit={confirmWithdrawal}>
                    <label>
                      <span class="t-label">Reason for the withdrawal</span>
                      <textarea name="reason" rows="3" required
                        placeholder="The reason appears on the certificate and in the notification."></textarea>
                    </label>
                    <div class="button-row">
                      <button type="submit" class="button-primary" disabled={withdrawing}>
                        {withdrawing ? 'Withdrawing' : 'Confirm this withdrawal'}
                      </button>
                      <button type="button" onClick={() => setPlan(null)}>Do not withdraw</button>
                    </div>
                  </form>
                </div>
              )}

              <Refusal refusal={refusal} onDismiss={() => setRefusal(null)} />
            </section>
          )}

          {done && (
            <section class="sheet stack">
              <h2 class="t-h4">The withdrawal landed</h2>
              <p class="statement">{done.statement}</p>
              <h3 class="t-h4">Notified, by name</h3>
              <ul class="named-list">
                {done.notified_recipients.map((r) => (
                  <li key={r.reference}>{r.name} <span class="t-mono t-small">{r.contact}</span></li>
                ))}
              </ul>
              <h3 class="t-h4">Statements now void</h3>
              <ul class="named-list">
                {done.void_statements.map((s, i) => <li key={i} class="statement">{s}</li>)}
              </ul>
              <h3 class="t-h4">Certificates derived from this one</h3>
              {done.derived_certificates.length === 0
                ? <Empty>No certificate was derived from this one.</Empty>
                : <ul class="named-list">{done.derived_certificates.map((d) => (
                  <li key={d.number} class="t-mono">{d.number}</li>))}</ul>}
              <h3 class="t-h4">
                <Mark kind="traversal" label="The reverse traversal of the underlying batches" />
              </h3>
              {/* The traversal always runs. An empty result says so in words
                  rather than rendering an empty frame, because "it found
                  nothing" and "it did not run" are different facts. */}
              {done.batch_traversal.length === 0 ? (
                <Empty>
                  The reverse traversal ran and reached no batch: this certificate's lots
                  descend from no recorded consumption, so no other certificate rests on the
                  same feedstock.
                </Empty>
              ) : (
                <ul class="named-list">
                  {done.batch_traversal.map((t) => (
                    <li key={t.batch}>
                      <span class="t-mono">{t.batch}</span> reached lots{' '}
                      <span class="t-mono">{t.lots.join(', ') || 'none'}</span> and certificates{' '}
                      <span class="t-mono">{t.certificates.map((c) => c.number).join(', ') || 'none'}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p class="t-small t-muted">
                The document still resolves at{' '}
                <a href={`/verify/${number}`} class="t-mono">/verify/{number}</a> and states the
                withdrawal.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
