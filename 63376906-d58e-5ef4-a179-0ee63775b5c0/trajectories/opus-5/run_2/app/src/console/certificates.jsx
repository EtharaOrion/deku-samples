import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api.js';
import { useResource, ReadAt } from './shared.jsx';
import { Link, navigate, useMeta } from '../lib/router.jsx';
import {
  Loading, Empty, Word, Refusal, Reveal, Mark, RecycledContent, CarbonFigure, EnergyPanel,
} from '../components/common.jsx';
import { grams, basisPoints, words, date, dateTime, percentFromBp, mgPerKg } from '../lib/format.js';

const DRAFT = 'ravel.cert.draft';
const readDraft = () => {
  try { return JSON.parse(sessionStorage.getItem(DRAFT) || '{}'); } catch { return {}; }
};
const writeDraft = (d) => sessionStorage.setItem(DRAFT, JSON.stringify(d));

const STEPS = [
  ['lot', 'Lot', '/console/certificates/new/lot'],
  ['claim', 'Claim', '/console/certificates/new/claim'],
  ['recipient', 'Recipient', '/console/certificates/new/recipient'],
  ['review', 'Review and sign', '/console/certificates/new/review'],
];

/* Each step shows the eight conditions as they stand. No condition is
   dismissible from this screen by any control. */
function Conditions({ conditions }) {
  if (!conditions) return null;
  return (
    <section class="sheet">
      <h2 class="t-h4">The eight conditions</h2>
      <p class="note">
        None of the eight is waivable, and the same eight are decided again on the server at the
        moment of signing. There is no control on this screen that dismisses one.
      </p>
      {conditions.map((c) => (
        <div key={c.condition} class="condition">
          <div>
            <p class="label" style="margin:0 0 .2rem">{words(c.condition)}</p>
            <Word quiet={c.satisfied}>{c.satisfied ? 'satisfied' : 'not satisfied'}</Word>
          </div>
          <div>
            <p style="margin:0">{c.detail}</p>
            {!c.satisfied && c.blocking_reference && (
              <p class="note" style="margin:.35rem 0 0">
                Resolved by <RecordLink reference={c.blocking_reference} />
              </p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function RecordLink({ reference }) {
  const r = String(reference);
  let href = null;
  if (r.startsWith('OVR-')) href = '/console/record?object=' + r;
  else if (r.startsWith('DEV-')) href = '/console/record?object=' + r;
  else if (r.startsWith('LOT-')) href = `/console/lots/${r}/genealogy`;
  else if (r.startsWith('BP-')) href = `/console/balance/${r}`;
  return href ? <Link href={href} class="mono">{r}</Link> : <span class="mono">{r}</span>;
}

function Steps({ current }) {
  return (
    <nav aria-label="Certificate steps" style="margin-bottom:1.5rem">
      <ol style="list-style:none;display:flex;gap:1rem;flex-wrap:wrap;padding:0;margin:0">
        {STEPS.map(([key, label, href], i) => (
          <li key={key}>
            <Link href={href} class="nav-link"
              aria-current={current === key ? 'step' : undefined}
              style={current === key ? 'color:var(--ink);border-bottom:2px solid var(--ink)' : ''}>
              {i + 1}. {label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function usePreview(lot, recipient) {
  const [state, setState] = useState({ loading: false, data: null, error: null });
  useEffect(() => {
    if (!lot) { setState({ loading: false, data: null, error: null }); return; }
    let live = true;
    setState({ loading: true, data: null, error: null });
    api('/certificates/preview', { method: 'POST', body: { lot, recipient: recipient || undefined } })
      .then((d) => live && setState({ loading: false, data: d, error: null }))
      .catch((e) => live && setState({ loading: false, data: null, error: e }));
    return () => { live = false; };
  }, [lot, recipient]);
  return state;
}

/* ------------------------------------------------------------ step one */
export function WizardLot() {
  useMeta('Ravel — Certificate, choose a lot', 'Step one of four.', { noindex: true });
  const [draft, setDraft] = useState(readDraft());
  const lots = useResource('/lots');
  const preview = usePreview(draft.lot, draft.recipient);

  const choose = (lot) => {
    const next = { ...draft, lot };
    setDraft(next); writeDraft(next);
  };

  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">New certificate</p>
      <Reveal as="h1" class="t-h3">Choose a lot</Reveal>
      <Steps current="lot" />
      {lots.loading && <Loading what="the lots" />}
      {lots.data?.length === 0 && <Empty>There is no lot to certify.</Empty>}
      {lots.data && (
        <div class="scroll-x">
          <table>
            <thead>
              <tr><th>Lot</th><th>Site</th><th class="num">Mass</th><th>Recycled content</th>
                <th>Disposition</th><th></th></tr>
            </thead>
            <tbody>
              {lots.data.map((l) => (
                <tr key={l.reference}>
                  <td class="mono">{l.reference}</td>
                  <td class="mono">{l.site}</td>
                  <td class="num mono">{grams(l.mass_g)}</td>
                  <td><RecycledContent content_bp={l.content_bp} claim_type={l.claim_type} compact /></td>
                  <td><Word quiet={l.disposition === 'released'}>{words(l.disposition)}</Word></td>
                  <td>
                    <button onClick={() => choose(l.reference)}
                      aria-pressed={draft.lot === l.reference}>
                      {draft.lot === l.reference ? 'Chosen' : 'Choose'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {draft.lot && (
        <>
          <p style="margin-top:1rem">
            Chosen: <span class="mono">{draft.lot}</span>.{' '}
            <Link href="/console/certificates/new/claim">Continue to the claim</Link>
          </p>
          {preview.loading && <Loading what="the eight conditions" />}
          <Conditions conditions={preview.data?.conditions} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ step two */
export function WizardClaim() {
  useMeta('Ravel — Certificate, the claim', 'Step two of four.', { noindex: true });
  const draft = readDraft();
  const preview = usePreview(draft.lot, draft.recipient);
  const p = preview.data;
  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">New certificate</p>
      <Reveal as="h1" class="t-h3">The claim</Reveal>
      <Steps current="claim" />
      {!draft.lot && (
        <p class="note">
          No lot has been chosen. <Link href="/console/certificates/new/lot">Choose a lot first</Link>.
        </p>
      )}
      {preview.loading && <Loading what="the claim" />}
      {p && (
        <>
          <section class="sheet">
            <h2 class="t-h4">What this certificate will say</h2>
            <p class="note">
              Every figure here is derived from the ledger. No percentage is entered on this screen
              or on any other.
            </p>
            <dl style="margin:0">
              <Row label="Lot" value={<span class="mono">{p.lot}</span>} />
              <Row label="Site" value={<span class="mono">{p.site}</span>} />
              <Row label="Mass" value={<span class="figure">{grams(p.mass_g)}</span>} />
              <Row label="Recycled content"
                value={<RecycledContent content_bp={p.content_bp} claim_type={p.claim_type} />} />
              <Row label="Post-consumer" value={<span class="figure">{grams(p.category_split.post_consumer)}</span>} />
              <Row label="Pre-consumer" value={<span class="figure">{grams(p.category_split.pre_consumer)}</span>} />
              <Row label="Bookkeeping period" value={<span class="mono">{p.period}</span>} />
              {p.provisional_factor && (
                <Row label="Conversion factor"
                  value={<Word>provisional — this certificate will say so</Word>} />
              )}
            </dl>
          </section>

          {p.carbon && (
            <section class="sheet">
              <h2 class="t-h4">Carbon</h2>
              <CarbonFigure carbon={p.carbon} />
              <hr class="hairline" />
              <div class="scroll-x">
                <table>
                  <caption class="visually-hidden">The carbon breakdown, one line per contribution</caption>
                  <thead><tr><th>Line</th><th class="num">mg CO₂e/kg</th><th>Tag</th></tr></thead>
                  <tbody>
                    {p.carbon.breakdown.map((b) => (
                      <tr key={b.line}>
                        <td>{words(b.line)}</td>
                        <td class="num mono">{Number(b.mg_per_kg).toLocaleString('en-GB')}</td>
                        <td><Word quiet>{words(b.tag)}</Word></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <hr class="hairline" />
              <EnergyPanel carbon={p.carbon} />
            </section>
          )}

          <Conditions conditions={p.conditions} />
          <p><Link href="/console/certificates/new/recipient">Continue to the recipient</Link></p>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- step three */
export function WizardRecipient() {
  useMeta('Ravel — Certificate, the recipient', 'Step three of four.', { noindex: true });
  const [draft, setDraft] = useState(readDraft());
  const customers = useResource('/customers');
  const preview = usePreview(draft.lot, draft.recipient);

  const choose = (recipient) => {
    const next = { ...draft, recipient };
    setDraft(next); writeDraft(next);
  };

  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">New certificate</p>
      <Reveal as="h1" class="t-h3">The recipient</Reveal>
      <Steps current="recipient" />
      {customers.loading && <Loading what="the recipients" />}
      {customers.data?.length === 0 && <Empty>There is no recipient on file.</Empty>}
      {customers.data && (
        <div class="scroll-x">
          <table>
            <thead>
              <tr><th>Recipient</th><th>Application</th><th>Industry</th>
                <th>Holds specification</th><th>Language</th><th></th></tr>
            </thead>
            <tbody>
              {customers.data.map((cu) => (
                <tr key={cu.reference}>
                  <td>{cu.name} <span class="mono note">{cu.reference}</span></td>
                  <td>{cu.application}</td>
                  <td>{cu.industry}</td>
                  <td class="mono">{cu.holds_specification_grade} v{cu.holds_specification_version}</td>
                  <td class="mono">{cu.language}</td>
                  <td>
                    <button onClick={() => choose(cu.reference)} aria-pressed={draft.recipient === cu.reference}>
                      {draft.recipient === cu.reference ? 'Chosen' : 'Choose'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {draft.recipient && (
        <p style="margin-top:1rem">
          Chosen: <span class="mono">{draft.recipient}</span>.{' '}
          <Link href="/console/certificates/new/review">Continue to review and sign</Link>
        </p>
      )}
      <Conditions conditions={preview.data?.conditions} />
    </div>
  );
}

/* ----------------------------------------------------------- step four */
export function WizardReview() {
  useMeta('Ravel — Certificate, review and sign', 'Step four of four.', { noindex: true });
  const draft = readDraft();
  const preview = usePreview(draft.lot, draft.recipient);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const p = preview.data;
  const allHold = p?.conditions?.every((c) => c.satisfied);

  const sign = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api('/certificates', {
        method: 'POST',
        body: { lot: draft.lot, recipient: draft.recipient, password },
      });
      sessionStorage.removeItem(DRAFT);
      navigate(`/console/certificates/${r.number}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">New certificate</p>
      <Reveal as="h1" class="t-h3">Review and sign</Reveal>
      <Steps current="review" />
      {preview.loading && <Loading what="the document" />}
      {!draft.lot && <p class="note">No lot has been chosen.</p>}
      {p && (
        <>
          <Conditions conditions={p.conditions} />

          {/* The fourth step renders the exact document that will be signed. */}
          <section class="sheet">
            <h2 class="t-h4">The document the recipient will read</h2>
            <p class="note">
              This is what will be signed, not a form that generates it. The recipient will file
              this document with their own regulator.
            </p>
            <dl style="margin:0 0 1rem">
              <Row label="Recipient" value={p.recipient_name || p.recipient || 'not chosen'} />
              <Row label="Recycled content"
                value={<RecycledContent content_bp={p.content_bp} claim_type={p.claim_type} />} />
            </dl>
            <div class="permitted-statement">
              <p class="label" style="margin:0 0 .35rem">Permitted statement</p>
              <p>{p.permitted_statement}</p>
              {p.permitted_statement_recipient_language !== p.permitted_statement && (
                <>
                  <p class="label" style="margin:0 0 .35rem">
                    In the recipient's language ({p.language})
                  </p>
                  <p>{p.permitted_statement_recipient_language}</p>
                </>
              )}
              <p class="label" style="margin:1rem 0 .35rem">Prohibited statement</p>
              <p>{p.prohibited_statement}</p>
            </div>
          </section>

          <section class="sheet no-print">
            <h2 class="t-h4">Sign</h2>
            <p>
              Signing is a separate, deliberate act. Your identity is confirmed at this moment: a
              session alone is not a signing credential.
            </p>
            <Refusal error={error} title="This certificate was refused" />
            <form onSubmit={sign}>
              <label class="field" style="max-width:24rem">
                <span class="label">Confirm your password to sign</span>
                <input type="password" autocomplete="current-password" required value={password}
                  onInput={(e) => setPassword(e.target.value)} />
              </label>
              <button type="submit" class="button-primary"
                disabled={busy || !allHold || !draft.recipient}>
                {busy ? 'Signing…' : 'Sign this certificate'}
              </button>
              {!allHold && (
                <p class="note" style="margin:.5rem 0 0">
                  One of the eight conditions is not satisfied. It is named above with a link to
                  the record that would resolve it, and no control here dismisses it.
                </p>
              )}
            </form>
          </section>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------ the register */
export function CertificateList() {
  useMeta('Ravel — Certificates', 'The certificate register.', { noindex: true });
  const certs = useResource('/certificates');
  return (
    <div class="wrap stack" style="padding-top:2rem">
      <div class="spread">
        <div>
          <p class="eyebrow">Issued artefacts</p>
          <Reveal as="h1" class="t-h3">Certificates</Reveal>
        </div>
        <p style="margin:0">
          <Link href="/console/certificates/new/lot" class="button">New certificate</Link>
        </p>
      </div>
      {certs.loading && <Loading what="the certificate register" />}
      {certs.data?.length === 0 && <Empty>No certificate has been issued.</Empty>}
      {certs.data?.length > 0 && (
        <div class="scroll-x">
          <table>
            <thead>
              <tr><th>Number</th><th>State</th><th>Site</th><th>Recipient</th>
                <th>Recycled content</th><th>Signed</th></tr>
            </thead>
            <tbody>
              {certs.data.map((c) => (
                <tr key={`${c.number}-${c.version}`}>
                  <td class="mono"><Link href={`/console/certificates/${c.number}`}>{c.number}</Link></td>
                  {/* A withdrawn certificate says withdrawn before any figure. */}
                  <td><Word quiet={c.state !== 'withdrawn'}>{words(c.state)}</Word></td>
                  <td class="mono">{c.site}</td>
                  <td>{c.recipient_name}</td>
                  <td><RecycledContent content_bp={c.content_bp} claim_type={c.claim_type} compact /></td>
                  <td class="mono">{date(c.signed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- one certificate, and its withdrawal */
export function CertificateDetail({ number }) {
  useMeta(`Ravel — ${number}`, 'One certificate.', { noindex: true });
  const cert = useResource(`/certificates/${number}`);
  const [doc, setDoc] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [radius, setRadius] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState(null);
  const c = cert.data;

  useEffect(() => {
    fetch(`/api/certificates/${number}/document`).then((r) => r.text()).then(setDoc).catch(() => setDoc(null));
  }, [number]);

  // Before confirming, the screen lists the recipients who will be notified by
  // name, and the statements the recipient must stop making.
  const beginWithdrawal = () => {
    setWithdrawing(true);
    setRadius({
      recipients: [{ reference: c.recipient, name: c.recipient_name }],
      void_statements: [
        c.permitted_statement,
        `Any statement that ${c.recipient_name} holds ${c.content_bp} basis points of recycled content under ${words(c.claim_type)} on certificate ${c.number}.`,
        `Any statement resting on the carbon figure of ${c.carbon?.value_mg_per_kg} mg CO₂e per kg carried by certificate ${c.number}.`,
      ],
    });
  };

  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api(`/certificates/${number}/withdraw`, { method: 'POST', body: { reason } });
      setRadius({ ...r, done: true });
      setWithdrawing(false);
      cert.reload();
      fetch(`/api/certificates/${number}/document`).then((x) => x.text()).then(setDoc);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const doReplay = async () => {
    try { setReplay(await api(`/certificates/${number}/replay`)); } catch (e) { setError(e); }
  };

  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">Certificate</p>
      <Reveal as="h1" class="t-h3 mono">{number}</Reveal>
      {cert.loading && <Loading what="this certificate" />}
      {c && (
        <>
          {c.state === 'withdrawn' && c.withdrawal && (
            <div class="banner" role="status">
              <p class="label" style="margin:0 0 .35rem">State</p>
              <p style="margin:0 0 .35rem"><Word>Withdrawn</Word></p>
              <p style="margin:0">
                This certificate was withdrawn on{' '}
                <span class="mono">{date(c.withdrawal.withdrawn_on)}</span>.
                Reason: {c.withdrawal.reason}.
              </p>
            </div>
          )}

          <section class="sheet">
            <dl style="margin:0">
              <Row label="Version" value={<span class="mono">{c.version}</span>} />
              <Row label="Site" value={<span class="mono">{c.site}</span>} />
              <Row label="Recipient" value={`${c.recipient_name} (${c.recipient})`} />
              <Row label="Recycled content"
                value={<RecycledContent content_bp={c.content_bp} claim_type={c.claim_type} />} />
              <Row label="Category split"
                value={<span class="figure">
                  post-consumer {grams(c.category_split.post_consumer)}, pre-consumer {grams(c.category_split.pre_consumer)}
                </span>} />
              <Row label="Period" value={<span class="mono">{c.period}</span>} />
              <Row label="Grade" value={<span class="mono">{c.grade} spec v{c.specification_version}</span>} />
              <Row label="Scheme" value={<span class="mono">{c.scheme} · {c.registration}</span>} />
              <Row label="Signer" value={`${c.signer_name} (${c.signer})`} />
              <Row label="Signed at" value={<span class="mono">{dateTime(c.signed_at)}</span>} />
              {c.provisional_factor && (
                <Row label="Conversion factor" value={<Word>provisional</Word>} />
              )}
              <Row label="Verification"
                value={<a href={`/verify/${c.number}`}>{c.verification_url}</a>} />
            </dl>
          </section>

          <section class="sheet">
            <h2 class="t-h4">Carbon</h2>
            <CarbonFigure carbon={c.carbon} />
          </section>

          {c.deviations?.length > 0 && (
            <section class="sheet">
              <h2 class="t-h4">Deviations touching this lot</h2>
              <p class="note">A deviation travels with every lot it touches.</p>
              <ul>
                {c.deviations.map((d) => (
                  <li key={d.reference}>
                    <span class="mono">{d.reference}</span> <Word quiet={d.state !== 'open'}>{words(d.state)}</Word>
                    {' — '}{d.detail}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section class="sheet">
            <h2 class="t-h4">The eight conditions, as they stood at signing</h2>
            <p class="note">These are stored as they stood and are never recomputed on read.</p>
            {(c.conditions_at_signing || []).map((x) => (
              <div key={x.condition} class="condition">
                <div>
                  <p class="label" style="margin:0 0 .2rem">{words(x.condition)}</p>
                  <Word quiet={x.satisfied}>{x.satisfied ? 'satisfied' : 'not satisfied'}</Word>
                </div>
                <p style="margin:0">{x.detail}</p>
              </div>
            ))}
          </section>

          <section class="sheet">
            <h2 class="t-h4">The document</h2>
            <p class="note">
              Readable without this system, byte-stable, and printable on A4 and US Letter.
            </p>
            {doc === null ? <Loading what="the document" /> : <pre class="document-text">{doc}</pre>}
          </section>

          <section class="sheet no-print">
            <h2 class="t-h4">Replay</h2>
            <p class="note">
              Agreement and disagreement are both ordinary answers.
            </p>
            <button onClick={doReplay}>Replay this certificate</button>
            {replay && (
              <div style="margin-top:1rem">
                {replay.reproducible === false ? (
                  <div class="banner">
                    <p class="label" style="margin:0 0 .35rem">Not reproducible</p>
                    <p style="margin:0">{replay.reason}</p>
                  </div>
                ) : (
                  <>
                    <p style="margin:0 0 .5rem">
                      <Word>{replay.agrees ? 'agrees' : 'differs'}</Word>
                    </p>
                    <div class="scroll-x">
                      <table>
                        <thead><tr><th>Field</th><th>What it said</th><th>What recomputation says</th></tr></thead>
                        <tbody>
                          {Object.keys(replay.issued || {}).map((k) => (
                            <tr key={k}>
                              <td>{words(k)}</td>
                              <td class="mono">{JSON.stringify(replay.issued[k])}</td>
                              <td class="mono">{JSON.stringify(replay.recomputed?.[k])}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {replay.differing_input && (
                      <p class="note" style="margin:.75rem 0 0">
                        The input that differs: <span class="mono">{words(replay.differing_input.field)}</span>.
                      </p>
                    )}
                    <p class="note" style="margin:.5rem 0 0">
                      Input versions:{' '}
                      <span class="mono">{Object.entries(replay.input_versions || {}).map(([k, v]) => `${k}=${v}`).join(', ')}</span>
                    </p>
                  </>
                )}
              </div>
            )}
          </section>

          {/* Withdrawal shows its blast radius before confirming. */}
          {c.state !== 'withdrawn' && (
            <section class="sheet no-print">
              <h2 class="t-h4">Withdraw</h2>
              <Refusal error={error} />
              {!withdrawing && !radius?.done && (
                <button onClick={beginWithdrawal}>Begin a withdrawal</button>
              )}
              {withdrawing && radius && (
                <>
                  <p>Withdrawing this certificate performs five consequences in one action.</p>
                  <ol>
                    <li>The state becomes withdrawn with the reason, the person and the date.</li>
                    <li>The recipient is notified and the notification becomes part of the record.</li>
                    <li>Every downstream statement the recipient was permitted to make is enumerated.</li>
                    <li>Every certificate derived from this one is identified and resolved.</li>
                    <li>The reverse traversal of the underlying batches runs.</li>
                  </ol>
                  <h3 class="t-h4">Who will be notified</h3>
                  <ul>
                    {radius.recipients.map((r) => (
                      <li key={r.reference}>{r.name} <span class="mono note">{r.reference}</span></li>
                    ))}
                  </ul>
                  <h3 class="t-h4">Statements the recipient must stop making</h3>
                  <ul>
                    {radius.void_statements.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                  <form onSubmit={confirm} style="margin-top:1rem">
                    <label class="field">
                      <span class="label">Reason for withdrawal</span>
                      <textarea required rows="3" value={reason}
                        onInput={(e) => setReason(e.target.value)} />
                    </label>
                    <button type="submit" class="button-primary" disabled={busy}>
                      {busy ? 'Withdrawing…' : 'Confirm the withdrawal'}
                    </button>
                    <button type="button" onClick={() => setWithdrawing(false)} style="margin-left:.75rem">
                      Cancel
                    </button>
                  </form>
                </>
              )}
            </section>
          )}

          {radius?.done && (
            <section class="sheet">
              <h2 class="t-h4">The withdrawal landed</h2>
              <p>Notified by name:</p>
              <ul>{radius.notified_recipients.map((r) => (
                <li key={r.reference}>{r.name} at <span class="mono">{r.address}</span></li>
              ))}</ul>
              <p>Statements now void:</p>
              <ul>{radius.void_statements.map((s, i) => <li key={i}>{s}</li>)}</ul>
              <p>Reverse traversal reached batches:</p>
              <p class="mono">{radius.batch_traversal.batches.join(', ') || 'none'}</p>
              <p class="note">
                The certificate address still resolves and states the withdrawal. A withdrawal is
                never a deletion.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div class="figure-row">
      <dt class="label" style="margin:0">{label}</dt>
      <dd style="margin:0;grid-column:span 2">{value}</dd>
    </div>
  );
}
