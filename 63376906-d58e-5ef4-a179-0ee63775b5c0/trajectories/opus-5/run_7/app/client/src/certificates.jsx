import { useState, useEffect } from 'preact/hooks';
import { api, holdsRole } from './api.js';
import { Link, navigate, useMeta } from './router.jsx';
import { useResource } from './console.jsx';
import {
  State, Loading, Empty, Refusal, ErrorBanner, ContentFigure, CarbonFigure,
  TableScroll, Derivation, grams, bp, percent, words
} from './components.jsx';

/* ------------------------------------------------------------ register ---- */

export function Certificates() {
  useMeta('Certificates', 'The certificates issued from this system, and their state.');
  const certs = useResource('/certificates');
  const d = certs.data;
  return (
    <>
      <p class="eyebrow">Issued artefacts</p>
      <h1>Certificates</h1>
      <p class="t-big">
        The unit of work is the lot; the unit of value is the certificate. A certificate is
        immutable, and a withdrawal is never a deletion.
      </p>
      {holdsRole('certificate_signer') ? (
        <p>
          <Link href="/console/certificates/new/lot" class="btn">
            Sign a certificate <span class="btn-arrow" aria-hidden="true">→</span>
          </Link>
        </p>
      ) : null}

      {certs.loading ? <Loading what="the certificate register" /> : null}
      {certs.error ? <ErrorBanner error={certs.error} /> : null}
      {d && !d.length ? <Empty>No certificate has been issued.</Empty> : null}
      {d && d.length ? (
        <TableScroll caption="Certificate register">
          <thead>
            <tr>
              <th scope="col">Number</th><th scope="col" class="num">Version</th>
              <th scope="col">State</th><th scope="col">Site</th>
              <th scope="col">Recipient</th>
              <th scope="col">Recycled content</th>
              <th scope="col">Signed</th>
            </tr>
          </thead>
          <tbody>
            {d.map((c) => (
              <tr key={`${c.number}-${c.version}`}>
                <th scope="row" class="mono">
                  <Link href={`/console/certificates/${c.number}`}>{c.number}</Link>
                </th>
                <td class="num">{c.version}</td>
                <td>
                  {/* A withdrawn certificate says withdrawn before it shows any figure. */}
                  {c.state === 'withdrawn'
                    ? <State word="Withdrawn" consequence />
                    : <State word="Issued" />}
                </td>
                <td class="mono">{c.site}</td>
                <td>{c.recipient_name}</td>
                <td><ContentFigure content_bp={c.content_bp} claim_type={c.claim_type} compact /></td>
                <td class="mono t-small">{String(c.signed_at).slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------- the conditions ---- */

const CONDITION_LABELS = {
  lot_released: 'The lot is released',
  no_open_deviation: 'No deviation touching it is open',
  no_unreviewed_override: 'No override on it is unreviewed',
  period_closed: 'The bookkeeping period is closed',
  balance_invariant_holds: 'The balance invariant holds with the allocation applied',
  carbon_figure_complete: 'The carbon figure exists with all four components',
  signer_holds_scope: 'The signer holds signing scope for that site on the date of signing',
  signer_did_not_enter_data: 'The signer did not enter the data'
};

/** Where the record that would resolve a condition lives. */
function resolutionLink(condition, ref) {
  if (!ref) return null;
  if (condition === 'no_unreviewed_override') return `/console/overrides/${ref}`;
  if (condition === 'no_open_deviation') return `/console/deviations/${ref}`;
  if (condition === 'lot_released') return `/console/lots/${ref}`;
  if (condition === 'period_closed' || condition === 'balance_invariant_holds') return `/console/balance/${ref}`;
  if (condition === 'carbon_figure_complete') return null;
  return null;
}

/**
 * Each step shows the eight conditions as eight statements, each either satisfied or
 * naming exactly what blocks it. No condition is dismissible from this screen.
 */
function Conditions({ conditions }) {
  if (!conditions) return null;
  return (
    <section>
      <h2>The eight conditions</h2>
      <p class="t-small muted">
        These are decided on the server and none of them is waivable. They are decided again at the
        moment of signing, against the records as they stand then.
      </p>
      <div class="card">
        {conditions.map((c) => {
          const href = c.satisfied ? null : resolutionLink(c.condition, c.blocking_reference);
          return (
            <div class="condition-row" key={c.condition}>
              <div>
                <span class="t-regular">{CONDITION_LABELS[c.condition] || words(c.condition)}</span>
              </div>
              <div>
                <span class="row" style="gap:0.5rem">
                  {c.satisfied
                    ? <State word="Satisfied" />
                    : <State word="Not satisfied" consequence />}
                </span>
                <p class="t-small" style="margin:0.35rem 0 0">{c.detail}</p>
                {!c.satisfied && c.blocking_reference ? (
                  <p class="t-small mono" style="margin:0.25rem 0 0">
                    {href
                      ? <Link href={href}>{c.blocking_reference}</Link>
                      : c.blocking_reference}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const STEPS = [
  ['lot', 'Lot', '/console/certificates/new/lot'],
  ['claim', 'Claim', '/console/certificates/new/claim'],
  ['recipient', 'Recipient', '/console/certificates/new/recipient'],
  ['review', 'Review and sign', '/console/certificates/new/review']
];

function WizardSteps({ current }) {
  return (
    <nav aria-label="Certificate steps">
      <ol class="wizard-steps">
        {STEPS.map(([key, label, href], i) => (
          <li key={key}>
            <Link href={href} aria-current={current === key ? 'step' : undefined}>
              {i + 1}. {label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* Four steps, four addresses. The choices persist between them. */
const DRAFT_KEY = 'ravel.certificate.draft';
function readDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; }
}
function writeDraft(d) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* private mode */ }
}

function usePreview(lot, recipient) {
  const [state, setState] = useState({ loading: false, data: null, error: null });
  useEffect(() => {
    if (!lot) { setState({ loading: false, data: null, error: null }); return; }
    let live = true;
    setState({ loading: true, data: null, error: null });
    api.post('/certificates/preview', { lot, recipient: recipient || undefined })
      .then((data) => live && setState({ loading: false, data, error: null }))
      .catch((error) => live && setState({ loading: false, data: null, error }));
    return () => { live = false; };
  }, [lot, recipient]);
  return state;
}

export function WizardLot() {
  useMeta('Sign a certificate: the lot', 'Choose the lot a certificate will be signed against.');
  const [draft, setDraft] = useState(readDraft());
  const lots = useResource('/lots');
  const preview = usePreview(draft.lot, draft.recipient);

  function choose(lot) {
    const next = { ...draft, lot };
    setDraft(next); writeDraft(next);
  }

  return (
    <>
      <p class="eyebrow"><Link href="/console/certificates">Certificates</Link> · New</p>
      <h1>Choose the lot</h1>
      <WizardSteps current="lot" />
      {lots.loading ? <Loading what="the lots" /> : null}
      {lots.data ? (
        <TableScroll caption="Lots this certificate could be signed against">
          <thead>
            <tr>
              <th scope="col">Choose</th><th scope="col">Lot</th><th scope="col">Site</th>
              <th scope="col" class="num">Mass</th><th scope="col">Recycled content</th>
              <th scope="col">Disposition</th>
            </tr>
          </thead>
          <tbody>
            {lots.data.map((l) => (
              <tr key={l.reference}>
                <td>
                  <button class={`btn ${draft.lot === l.reference ? '' : 'btn-secondary'}`}
                    onClick={() => choose(l.reference)}>
                    {draft.lot === l.reference ? 'Chosen' : 'Choose'}
                  </button>
                </td>
                <th scope="row" class="mono">{l.reference}</th>
                <td class="mono">{l.site}</td>
                <td class="num">{grams(l.mass_g)}</td>
                <td><ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} compact /></td>
                <td>{words(l.disposition)}</td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      ) : null}

      {preview.loading ? <Loading what="the eight conditions" /> : null}
      {preview.data ? <Conditions conditions={preview.data.conditions} /> : null}

      <p style="margin-top:1.5rem">
        <Link href="/console/certificates/new/claim"
          class={`btn ${draft.lot ? '' : 'btn-secondary'}`}
          aria-disabled={draft.lot ? undefined : 'true'}>
          Next: the claim <span class="btn-arrow" aria-hidden="true">→</span>
        </Link>
      </p>
    </>
  );
}

export function WizardClaim() {
  useMeta('Sign a certificate: the claim', 'The claim this certificate will carry, computed from the ledger.');
  const draft = readDraft();
  const preview = usePreview(draft.lot, draft.recipient);
  const p = preview.data?.preview;
  return (
    <>
      <p class="eyebrow"><Link href="/console/certificates">Certificates</Link> · New</p>
      <h1>The claim</h1>
      <WizardSteps current="claim" />
      {!draft.lot ? (
        <Empty>No lot is chosen yet. <Link href="/console/certificates/new/lot">Choose one first.</Link></Empty>
      ) : null}
      {preview.loading ? <Loading what="the claim" /> : null}
      {preview.error ? <ErrorBanner error={preview.error} /> : null}
      {p ? (
        <>
          <div class="card">
            <p class="eyebrow">Recycled content</p>
            <ContentFigure content_bp={p.content_bp} claim_type={p.claim_type} />
            <p class="t-small muted" style="margin-top:0.5rem">
              Computed from the ledger. No percentage was entered by anybody.
            </p>
          </div>
          <dl class="definition">
            <dt>Lot</dt><dd class="mono">{p.lot}</dd>
            <dt>Site</dt><dd class="mono">{p.site}</dd>
            <dt>Grade</dt><dd class="mono">{p.grade}</dd>
            <dt>Mass</dt><dd class="mono">{grams(p.mass_g)}</dd>
            <dt>Category split</dt>
            <dd class="mono">
              post-consumer {grams(p.category_split?.post_consumer)} ·
              pre-consumer {grams(p.category_split?.pre_consumer)}
            </dd>
            <dt>Conversion factor</dt>
            <dd>
              {p.provisional_factor
                ? <><State word="Provisional" consequence /> — every certificate resting on it says so</>
                : 'Derived from a stated window'}
            </dd>
          </dl>
          {p.carbon ? (
            <>
              <h2>Carbon</h2>
              <div class="card"><CarbonFigure carbon={p.carbon} /></div>
            </>
          ) : null}
        </>
      ) : null}
      {preview.data ? <Conditions conditions={preview.data.conditions} /> : null}
      <p class="row" style="margin-top:1.5rem">
        <Link href="/console/certificates/new/lot" class="btn btn-secondary">Back</Link>
        <Link href="/console/certificates/new/recipient" class="btn">
          Next: the recipient <span class="btn-arrow" aria-hidden="true">→</span>
        </Link>
      </p>
    </>
  );
}

export function WizardRecipient() {
  useMeta('Sign a certificate: the recipient', 'Who will receive and file this certificate.');
  const [draft, setDraft] = useState(readDraft());
  const preview = usePreview(draft.lot, draft.recipient);
  const [customers, setCustomers] = useState([]);
  useEffect(() => {
    Promise.all(['CUS-HELIOS', 'CUS-VANTA'].map((r) => api.get(`/customers/${r}`).catch(() => null)))
      .then((rows) => setCustomers(rows.filter(Boolean)));
  }, []);

  function choose(recipient) {
    const next = { ...draft, recipient };
    setDraft(next); writeDraft(next);
  }

  return (
    <>
      <p class="eyebrow"><Link href="/console/certificates">Certificates</Link> · New</p>
      <h1>The recipient</h1>
      <WizardSteps current="recipient" />
      {!customers.length ? <Loading what="the customers" /> : (
        <div class="grid grid-2">
          {customers.map((c) => (
            <article class={`card${draft.recipient === c.reference ? ' card-flat' : ''}`} key={c.reference}>
              <h3>{c.name}</h3>
              <dl class="definition">
                <dt>Reference</dt><dd class="mono">{c.reference}</dd>
                <dt>Application</dt><dd>{c.application}</dd>
                <dt>Industry</dt><dd>{c.industry}</dd>
                <dt>Holds</dt><dd class="mono">{c.holds_specification_version}</dd>
                <dt>Language</dt><dd>{c.language}</dd>
              </dl>
              <button class={`btn ${draft.recipient === c.reference ? '' : 'btn-secondary'}`}
                onClick={() => choose(c.reference)}>
                {draft.recipient === c.reference ? 'Chosen' : 'Choose this recipient'}
              </button>
            </article>
          ))}
        </div>
      )}
      {preview.data ? <Conditions conditions={preview.data.conditions} /> : null}
      <p class="row" style="margin-top:1.5rem">
        <Link href="/console/certificates/new/claim" class="btn btn-secondary">Back</Link>
        <Link href="/console/certificates/new/review"
          class={`btn ${draft.recipient ? '' : 'btn-secondary'}`}
          aria-disabled={draft.recipient ? undefined : 'true'}>
          Next: review and sign <span class="btn-arrow" aria-hidden="true">→</span>
        </Link>
      </p>
    </>
  );
}

/**
 * The fourth step renders the exact document that will be signed, including the permitted
 * downstream statement and its counterpart in the recipient's language.
 */
export function WizardReview() {
  useMeta('Sign a certificate: review and sign', 'The exact document that will be signed, and the deliberate act of signing it.');
  const draft = readDraft();
  const preview = usePreview(draft.lot, draft.recipient);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const p = preview.data?.preview;
  const conditions = preview.data?.conditions;
  const allSatisfied = preview.data?.all_satisfied;

  async function sign(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.post('/certificates', {
        lot: draft.lot, recipient: draft.recipient, password
      });
      writeDraft({});
      navigate(`/console/certificates/${r.number}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p class="eyebrow"><Link href="/console/certificates">Certificates</Link> · New</p>
      <h1>Review and sign</h1>
      <WizardSteps current="review" />

      {preview.loading ? <Loading what="the document" /> : null}
      {preview.error ? <ErrorBanner error={preview.error} /> : null}

      {p ? (
        <>
          <div class="banner" role="note">
            <p class="banner-title">What signing does</p>
            <p class="t-big">
              The recipient will file this document with a regulator. Sign what they will read.
            </p>
          </div>

          <h2>The document that will be signed</h2>
          <div class="sheet">
            <dl class="definition">
              <dt>Recipient</dt><dd>{p.recipient_name} <span class="mono t-small">({p.recipient})</span></dd>
              <dt>Lot</dt><dd class="mono">{p.lot}</dd>
              <dt>Site</dt><dd class="mono">{p.site}</dd>
              <dt>Grade</dt><dd class="mono">{p.grade}</dd>
              <dt>Claim type</dt><dd>{words(p.claim_type)}</dd>
              <dt>Recycled content</dt>
              <dd><ContentFigure content_bp={p.content_bp} claim_type={p.claim_type} /></dd>
              <dt>Carbon</dt><dd>{p.carbon ? <CarbonFigure carbon={p.carbon} /> : '—'}</dd>
              {p.provisional_factor ? (
                <><dt>Conversion factor</dt><dd><State word="Provisional" consequence /></dd></>
              ) : null}
            </dl>

            <div class="statement-block">
              <h3>Permitted statement</h3>
              <p class="permitted-statement t-big">{p.permitted_statement}</p>
            </div>
            <div class="statement-block">
              <h3>Prohibited statement</h3>
              <p class="prohibited-statement t-big">{p.prohibited_statement}</p>
            </div>
            <div class="statement-block">
              <h3>The same permission in {p.counterpart_language === 'fr' ? 'French' : 'English'}</h3>
              <p class="t-regular">{p.counterpart_statement}</p>
            </div>
          </div>
        </>
      ) : null}

      <Conditions conditions={conditions} />

      {error ? (
        <Refusal title="This certificate was not signed">
          {error.body?.failed_conditions?.length ? (
            <>
              <p>
                A condition that held at the preview does not hold now. The eight are decided again
                at the moment of signing, against the records as they stand then.
              </p>
              <ul>
                {error.body.failed_conditions.map((f) => (
                  <li key={f.condition}>
                    <strong>{CONDITION_LABELS[f.condition] || words(f.condition)}</strong> — {f.detail}
                    {f.blocking_reference ? <> <span class="mono">({f.blocking_reference})</span></> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : error.body?.error === 'reauthentication_failed' || error.body?.error === 'reauthentication_required' ? (
            <p>
              The signing act carries the password again, and a session alone is not a signing
              credential. Nothing was signed.
            </p>
          ) : (
            <p>{error.body?.rule || error.message}</p>
          )}
        </Refusal>
      ) : null}

      {/* Signing is a separate, deliberate act with the signer's identity confirmed. */}
      <form onSubmit={sign} class="card" style="margin-top:2rem">
        <h2 style="margin-top:0">Sign</h2>
        <p>
          Signing confirms your identity again. Enter your password to sign this certificate; a
          session alone is not a signing credential.
        </p>
        <label class="field" style="max-width:24rem">
          <span class="label">Your password</span>
          <input type="password" autocomplete="current-password" required value={password}
            onInput={(e) => setPassword(e.currentTarget.value)} />
        </label>
        <button class="btn" type="submit" disabled={busy || !allSatisfied}>
          {busy ? 'Signing' : 'Sign this certificate'} <span class="btn-arrow" aria-hidden="true">→</span>
        </button>
        {!allSatisfied ? (
          <p class="t-small muted" style="margin-top:0.75rem">
            One of the eight conditions is unsatisfied. No control on this screen dismisses it: the
            record that blocks it has to change.
          </p>
        ) : null}
      </form>
    </>
  );
}

/* ------------------------------------------------------- one certificate ---- */

export function CertificateDetail({ number }) {
  useMeta(`Certificate ${number}`, 'One certificate, its document, its conditions as they stood, and its replay.');
  const cert = useResource(`/certificates/${number}`);
  const [doc, setDoc] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);
  useEffect(() => {
    api.text(`/certificates/${number}/document`).then(setDoc).catch(() => setDoc(null));
  }, [number]);
  const c = cert.data;
  return (
    <>
      <p class="eyebrow"><Link href="/console/certificates">Certificates</Link> · Certificate</p>
      <h1 class="mono">{number}</h1>
      {cert.loading ? <Loading what="this certificate" /> : null}
      {cert.error ? <ErrorBanner error={cert.error} /> : null}
      {c ? (
        <>
          {/* A withdrawn certificate says withdrawn before it shows any figure. */}
          {c.state === 'withdrawn' ? (
            <div class="banner" role="note">
              <p class="banner-title">Withdrawn</p>
              <p class="t-big">
                This certificate was withdrawn on {c.withdrawal?.withdrawn_on}. Reason:{' '}
                {c.withdrawal?.reason}.
              </p>
              <p class="t-small">
                Withdrawn by {c.withdrawal?.withdrawn_by}. A withdrawal is never a deletion and this
                document stays readable at its address.
              </p>
            </div>
          ) : (
            <p><State word="Issued" /></p>
          )}

          <dl class="definition">
            <dt>Version</dt><dd class="num mono">{c.version}</dd>
            <dt>Site</dt><dd class="mono">{c.site}</dd>
            <dt>Recipient</dt><dd>{c.recipient_name} <span class="mono t-small">({c.recipient})</span></dd>
            <dt>Grade</dt><dd class="mono">{c.grade}</dd>
            <dt>Specification</dt><dd class="mono">SPEC-{c.grade} v{c.specification_version}</dd>
            <dt>Claim type</dt><dd>{words(c.claim_type)}</dd>
            <dt>Recycled content</dt>
            <dd><ContentFigure content_bp={c.content_bp} claim_type={c.claim_type} /></dd>
            <dt>Category split</dt>
            <dd class="mono">
              post-consumer {grams(c.category_split?.post_consumer)} ·
              pre-consumer {grams(c.category_split?.pre_consumer)}
            </dd>
            <dt>Lots</dt>
            <dd class="mono">
              {(c.lots || []).map((l) => (
                <span key={l.reference}>
                  <Link href={`/console/lots/${l.reference}`}>{l.reference}</Link> {grams(l.mass_g)}{' '}
                </span>
              ))}
            </dd>
            <dt>Bookkeeping period</dt>
            <dd class="mono"><Link href={`/console/balance/${c.period}`}>{c.period}</Link></dd>
            <dt>Carbon</dt><dd><CarbonFigure carbon={c.carbon} /></dd>
            <dt>Primary share</dt><dd class="mono">{bp(c.primary_share_bp)}</dd>
            <dt>Scheme</dt><dd class="mono">{c.scheme}</dd>
            <dt>Registration</dt><dd class="mono">{c.registration}</dd>
            <dt>Signer</dt><dd>{c.signer_name} <span class="mono t-small">({c.signer})</span></dd>
            <dt>Signed at</dt><dd class="mono">{c.signed_at}</dd>
            <dt>Verification</dt>
            <dd class="mono">
              <Link href={`/verify/${c.number}`}>Verify this certificate at ravel.example.com/verify/{c.number}.</Link>
            </dd>
            <dt>Conversion factor</dt>
            <dd>{c.provisional_factor ? <State word="Provisional" consequence /> : 'Derived'}</dd>
          </dl>

          <div class="statement-block">
            <h2>Permitted statement</h2>
            <p class="permitted-statement t-big">{c.permitted_statement}</p>
          </div>
          <div class="statement-block">
            <h2>Prohibited statement</h2>
            <p class="prohibited-statement t-big">{c.prohibited_statement}</p>
          </div>

          {c.deviations?.length ? (
            <>
              <h2>Deviations touching this certificate's lots</h2>
              <TableScroll caption="Deviations">
                <thead><tr><th scope="col">Deviation</th><th scope="col">State</th><th scope="col">Outcome</th></tr></thead>
                <tbody>
                  {c.deviations.map((d) => (
                    <tr key={d.reference}>
                      <th scope="row" class="mono">{d.reference}</th>
                      <td>{d.state === 'open' ? <State word="Open" consequence /> : 'Closed'}</td>
                      <td>{d.outcome ? words(d.outcome) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            </>
          ) : null}

          <h2>The eight conditions, as they stood at signing</h2>
          <p class="t-small muted">These are stored as they stood and are never recomputed on read.</p>
          <TableScroll caption="Conditions at the moment of signing">
            <thead><tr><th scope="col">Condition</th><th scope="col">State</th><th scope="col">Detail</th></tr></thead>
            <tbody>
              {(c.conditions || []).map((x) => (
                <tr key={x.condition}>
                  <th scope="row">{CONDITION_LABELS[x.condition] || words(x.condition)}</th>
                  <td>{x.satisfied ? 'Satisfied' : <State word="Not satisfied" consequence />}</td>
                  <td class="t-small">{x.detail}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>

          <h2>The document</h2>
          <p class="t-small muted">
            Readable without this system, and byte-stable: two reads of this version return
            identical bytes.
          </p>
          {doc ? <pre class="doc-plain">{doc}</pre> : <Loading what="the document" />}

          <p class="row no-print" style="margin-top:1.5rem">
            <Link href={`/console/certificates/${number}/replay`} class="btn btn-secondary">
              Replay this certificate
            </Link>
            {c.state !== 'withdrawn' && holdsRole('certificate_signer') ? (
              <button class="btn btn-quiet" onClick={() => setWithdrawing(true)}>
                Begin a withdrawal
              </button>
            ) : null}
            <button class="btn btn-quiet" onClick={() => print()}>Print</button>
          </p>

          {withdrawing ? (
            <Withdrawal number={number} certificate={c} onDone={() => { setWithdrawing(false); cert.reload(); }}
              onCancel={() => setWithdrawing(false)} />
          ) : null}
        </>
      ) : null}
    </>
  );
}

/**
 * Before confirming, the screen shows the five consequences and the actual enumerated
 * lists: the recipients who will be notified, by name, and the statements that become
 * void. Not a count of them.
 */
function Withdrawal({ number, certificate, onDone, onCancel }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [impact, setImpact] = useState(null);

  // The blast radius is read before anything is confirmed.
  useEffect(() => {
    const lot = (certificate.lots || [])[0]?.reference;
    if (!lot) return;
    api.get(`/lots/${lot}/genealogy`).then(async (g) => {
      const batches = g.nodes.filter((n) => n.kind === 'batch').map((n) => n.reference);
      const rows = [];
      for (const b of batches) {
        try { rows.push(await api.get(`/batches/${b}/impact`)); } catch { /* keep going */ }
      }
      setImpact(rows);
    }).catch(() => {});
  }, [certificate]);

  const voidStatements = [
    certificate.permitted_statement,
    `That lot ${(certificate.lots || []).map((l) => l.reference).join(', ')} carries a recycled content claim of ${certificate.content_bp} basis points.`,
    `That certificate ${certificate.number} supports a ${certificate.claim_type} claim for ${certificate.recipient_name}.`,
    `That the carbon figure of ${certificate.carbon?.value_mg_per_kg} mg CO2e per kg applies to material supplied under this certificate.`
  ];

  const touched = [];
  for (const row of impact || []) {
    for (const cert of row.certificates || []) {
      if (cert.number !== number && !touched.find((t) => t.number === cert.number)) touched.push(cert);
    }
  }

  async function confirm(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.post(`/certificates/${number}/withdraw`, { reason });
      setResult(r);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <section class="sheet" style="margin-top:2rem">
        <h2>Withdrawn</h2>
        <p class="t-big">
          {result.number} was withdrawn on {result.withdrawn_on}. Reason: {result.reason}.
        </p>
        <h3>Recipients notified</h3>
        <ul>{result.notified_recipients.map((r) => (
          <li key={r.reference}>{r.name} <span class="mono t-small">({r.contact})</span></li>
        ))}</ul>
        <h3>Statements now void</h3>
        <ul>{result.void_statements.map((s, i) => <li key={i}>{s}</li>)}</ul>
        <h3>Certificates derived from this one</h3>
        {!result.derived_certificates.length
          ? <p>None is derived from this certificate.</p>
          : <ul>{result.derived_certificates.map((d) => <li key={d.number} class="mono">{d.number} — {words(d.state)}</li>)}</ul>}
        <h3>The reverse traversal of the underlying batches</h3>
        <ul>{result.batch_traversal.map((b) => (
          <li key={b.batch}>
            <span class="mono">{b.batch}</span> → lots {b.lots.join(', ') || 'none'} → certificates {b.certificates.join(', ') || 'none'}
          </li>
        ))}</ul>
        <p>
          The certificate address still resolves and states the withdrawal:{' '}
          <Link href={`/verify/${number}`} class="mono">/verify/{number}</Link>
        </p>
        <button class="btn" onClick={onDone}>Done</button>
      </section>
    );
  }

  return (
    <section class="sheet" style="margin-top:2rem">
      <h2>Withdraw {number}</h2>
      <p class="t-big">
        A withdrawal is one action with five consequences. Read them before you confirm.
      </p>

      <ol>
        <li>The state becomes withdrawn, with your reason, your name and today's date.</li>
        <li>The recipient is notified, and the notification becomes part of the record.</li>
        <li>Every statement the recipient was permitted to make is enumerated as void.</li>
        <li>Every certificate derived from this one is identified and resolved.</li>
        <li>The reverse traversal of the underlying batches runs, enumerating every other certificate touching them.</li>
      </ol>

      <h3>Who will be notified</h3>
      <ul>
        <li>{certificate.recipient_name} <span class="mono t-small">({certificate.recipient})</span></li>
      </ul>

      <h3>The statements that become void</h3>
      <ul>{voidStatements.map((s, i) => <li key={i}>{s}</li>)}</ul>

      <h3>Other certificates touching the same batches</h3>
      {!impact ? <Loading what="the traversal" /> : !touched.length
        ? <p>No other certificate rests on the same batches.</p>
        : <ul>{touched.map((t) => (
          <li key={t.number}><span class="mono">{t.number}</span> — {t.recipient_name}, {words(t.state)}</li>
        ))}</ul>}

      {error ? <ErrorBanner error={error} /> : null}

      <form onSubmit={confirm} style="margin-top:1.5rem">
        <label class="field">
          <span class="label">Reason for withdrawal</span>
          <textarea rows="3" required value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
          <span class="hint">
            This is the only free text on a certificate, and it is shown at the public verification
            address forever.
          </span>
        </label>
        <p class="row">
          <button class="btn" type="submit" disabled={busy || !reason}>
            {busy ? 'Withdrawing' : 'Confirm the withdrawal'}
          </button>
          <button class="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
        </p>
      </form>
    </section>
  );
}

/** Agreement and disagreement render at identical weight. */
export function Replay({ number }) {
  useMeta(`Replay ${number}`, 'What the certificate said, what recomputation says now, and the input that differs.');
  const replay = useResource(`/certificates/${number}/replay`);
  const d = replay.data;
  return (
    <>
      <p class="eyebrow">
        <Link href={`/console/certificates/${number}`}>Certificate</Link> · Replay
      </p>
      <h1>Replay of <span class="mono">{number}</span></h1>
      {replay.loading ? <Loading what="the replay" /> : null}
      {replay.error ? <ErrorBanner error={replay.error} /> : null}
      {d ? (
        <>
          {d.reproducible === false ? (
            <div class="banner" role="note">
              <p class="banner-title">Not reproducible</p>
              <p class="t-big">{d.reason}</p>
              <p>
                This figure is not recomputed under today's rules and presented as the original.
              </p>
            </div>
          ) : (
            <div class="card">
              <p class="eyebrow">Result</p>
              <p class="t-big">
                {d.agrees
                  ? 'The recomputation agrees with what was issued.'
                  : `The recomputation differs from what was issued, at ${words(d.differing_input?.input)}.`}
              </p>
            </div>
          )}

          {d.issued && d.recomputed ? (
            <TableScroll caption="What it said, and what recomputation says now">
              <thead>
                <tr>
                  <th scope="col">Input</th>
                  <th scope="col">Issued</th>
                  <th scope="col">Recomputed</th>
                  <th scope="col">Agreement</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(d.issued).map((k) => {
                  const same = String(d.issued[k]) === String(d.recomputed[k]);
                  return (
                    <tr key={k}>
                      <th scope="row">{words(k)}</th>
                      <td class="mono">{String(d.issued[k] ?? '—')}</td>
                      <td class="mono">{String(d.recomputed[k] ?? '—')}</td>
                      <td>{same ? 'Agrees' : <State word="Differs" consequence />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableScroll>
          ) : null}

          <h2>Input versions</h2>
          <p class="t-small muted">Every versioned input this recomputation ran against.</p>
          <dl class="definition">
            {Object.entries(d.input_versions || {}).map(([k, v]) => (
              <>
                <dt key={`${k}t`}>{words(k)}</dt>
                <dd key={`${k}d`} class="mono">{String(v)}</dd>
              </>
            ))}
          </dl>
          <p class="t-small muted">{d.note}</p>
        </>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------- supporting records ---- */

export function OverrideDetail({ reference }) {
  useMeta(`Override ${reference}`, 'A broken separation, its authoriser and its review.');
  const overrides = useResource('/overrides');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const o = (overrides.data || []).find((x) => x.reference === reference);

  async function review() {
    setBusy(true); setError(null);
    try {
      await api.post(`/overrides/${reference}/review`, {});
      overrides.reload();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <>
      <p class="eyebrow">The record · Override</p>
      <h1 class="mono">{reference}</h1>
      {overrides.loading ? <Loading what="the override" /> : null}
      {!o && overrides.data ? <Empty>There is no override at this reference.</Empty> : null}
      {o ? (
        <>
          <p><State word={o.reviewed ? 'Reviewed' : 'Unreviewed'} consequence={!o.reviewed} /></p>
          <div class="banner" role="note">
            <p class="banner-title">Permanent</p>
            <p class="t-big">{o.statement}</p>
          </div>
          <dl class="definition">
            <dt>Separation broken</dt><dd>{words(o.separation)}</dd>
            <dt>Lot</dt><dd class="mono"><Link href={`/console/lots/${o.lot}`}>{o.lot}</Link></dd>
            <dt>Reason</dt><dd>{o.reason}</dd>
            <dt>Authorised by</dt><dd>{o.authorised_by}</dd>
            <dt>Reviewed by</dt><dd>{o.reviewed_by || 'not yet reviewed'}</dd>
          </dl>
          {error ? <ErrorBanner error={error} /> : null}
          {!o.reviewed ? (
            <>
              <p>
                This override blocks signing until a second person reviews it. The authoriser cannot
                review their own, and a review removes nothing.
              </p>
              {holdsRole('quality_manager', 'claims_manager') ? (
                <button class="btn" onClick={review} disabled={busy}>
                  {busy ? 'Recording the review' : 'Review this override'}
                </button>
              ) : (
                <p class="t-small muted">
                  A review is recorded by a quality manager or a claims manager, and never by the
                  person who authorised it.
                </p>
              )}
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export function DeviationDetail({ reference }) {
  useMeta(`Deviation ${reference}`, 'A deviation, what it touches and how it closed.');
  const devs = useResource('/deviations');
  const d = (devs.data || []).find((x) => x.reference === reference);
  return (
    <>
      <p class="eyebrow">The record · Deviation</p>
      <h1 class="mono">{reference}</h1>
      {devs.loading ? <Loading what="the deviation" /> : null}
      {!d && devs.data ? <Empty>There is no deviation at this reference.</Empty> : null}
      {d ? (
        <>
          <p>
            {d.state === 'open' ? <State word="Open" consequence /> : <State word="Closed" />}
          </p>
          <dl class="definition">
            <dt>Description</dt><dd>{d.description}</dd>
            <dt>Runs</dt><dd class="mono">{(d.runs || []).join(', ') || '—'}</dd>
            <dt>Lots</dt><dd class="mono">{(d.lots || []).join(', ') || '—'}</dd>
            <dt>Raised by</dt><dd>{d.raised_by} on <span class="mono">{String(d.raised_at).slice(0, 10)}</span></dd>
            <dt>Outcome</dt>
            <dd>{d.outcome ? words(d.outcome) : 'none — this deviation is open'}</dd>
          </dl>
          <p class="t-small muted">
            Both outcomes are honest and neither is hidden: a cause may be found, or it may not be
            established.
          </p>
        </>
      ) : null}
    </>
  );
}

export function Contracts() {
  useMeta('Contracts', 'Delivered, running content, the floor and the average the remaining volume must reach.');
  const contracts = useResource('/contracts');
  const d = contracts.data;
  return (
    <>
      <p class="eyebrow">Commercial</p>
      <h1>Contract projection</h1>
      {contracts.loading ? <Loading what="the contracts" /> : null}
      {contracts.error ? <ErrorBanner error={contracts.error} /> : null}
      {d && !d.length ? <Empty>No contract is recorded.</Empty> : null}
      {d ? d.map((c) => (
        <article class="card" key={c.contract} style="margin-bottom:1.5rem">
          <div class="row-between">
            <h2 class="mono" style="margin:0">{c.contract}</h2>
            <span class="row" style="gap:0.35rem">
              <State word={c.state === 'unreachable' ? 'Unreachable' : 'On track'}
                consequence={c.state === 'unreachable'} />
              {c.planned_site_flag ? <State word="Planned site" consequence /> : null}
            </span>
          </div>
          <p class="t-small muted">{c.recipient} · {c.site} · {c.period}</p>
          {c.planned_site_flag ? (
            <p class="t-small">
              This contract names a site whose confidence is <strong>planned</strong>. This flag
              appears on every response the contract appears in and cannot be dismissed.
            </p>
          ) : null}
          {c.state === 'unreachable' ? (
            <p>
              The floor became unreachable{c.unreachable_on ? ` on ${c.unreachable_on}` : ''}
              {c.unreachable_allocation ? `, at allocation ${c.unreachable_allocation}` : ''}. This
              is reported and never refused.
            </p>
          ) : null}
          <TableScroll caption={`Projection for ${c.contract}`}>
            <thead>
              <tr>
                <th scope="col" class="num">Delivered</th>
                <th scope="col" class="num">Committed</th>
                <th scope="col" class="num">Running content</th>
                <th scope="col" class="num">Floor</th>
                <th scope="col" class="num">Required remaining average</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="num">{Number(c.delivered_kg).toLocaleString('en-GB')} kg</td>
                <td class="num">{Number(c.committed_kg).toLocaleString('en-GB')} kg</td>
                <td class="num">{bp(c.running_content_bp)}</td>
                <td class="num">{bp(c.floor_bp)}</td>
                <td class="num">{bp(c.required_remaining_bp)}</td>
              </tr>
            </tbody>
          </TableScroll>
          <p class="t-small muted" style="margin-top:0.75rem">
            Shortfall consequence, stated at signature: {c.shortfall_consequence}.
          </p>
          {c.allocations?.length ? (
            <TableScroll caption="Allocations, and who decided">
              <thead>
                <tr>
                  <th scope="col">Allocation</th><th scope="col">Lot</th>
                  <th scope="col" class="num">Mass</th><th scope="col">Decided by</th>
                  <th scope="col">Favoured over</th>
                </tr>
              </thead>
              <tbody>
                {c.allocations.map((a) => (
                  <tr key={a.reference}>
                    <th scope="row" class="mono">{a.reference}</th>
                    <td class="mono">{a.lot}</td>
                    <td class="num">{grams(a.mass_g)}</td>
                    <td>{a.decided_by}</td>
                    <td class="mono t-small">{(a.favoured_over || []).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          ) : null}
          <Derivation of={c.derivation} />
        </article>
      )) : null}
    </>
  );
}
