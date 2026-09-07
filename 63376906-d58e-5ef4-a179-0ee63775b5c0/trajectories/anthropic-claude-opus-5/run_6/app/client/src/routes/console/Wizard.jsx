import { useState, useEffect } from 'preact/hooks';
import { api, getUser } from '../../lib/api.js';
import { Link, navigate, usePath } from '../../lib/router.jsx';
import {
  Loading, Empty, StateWord, Content, CarbonFigure, useAsync, formatInt, Refusal,
} from '../../components/common.jsx';

const STEPS = [
  ['/console/certificates/new/lot', 'Lot'],
  ['/console/certificates/new/claim', 'Claim'],
  ['/console/certificates/new/recipient', 'Recipient'],
  ['/console/certificates/new/review', 'Review and sign'],
];

const CONDITION_TEXT = {
  lot_released: 'The lot is released.',
  no_open_deviation: 'No deviation touching this lot is open.',
  no_unreviewed_override: 'No override on this lot is unreviewed.',
  period_closed: 'The bookkeeping period is closed.',
  balance_invariant_holds: 'The balance invariant holds with the allocation applied.',
  carbon_figure_complete: 'The carbon figure exists with all four of its components.',
  signer_holds_scope: 'The signer holds signing scope for this site on the date of signing.',
  signer_did_not_enter_data: 'The signer did not enter this lot\'s data.',
};

// The wizard's selection survives across the four addresses.
const KEY = 'ravel.wizard';
function readState() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function writeState(next) {
  sessionStorage.setItem(KEY, JSON.stringify(next));
}

export default function Wizard() {
  const path = usePath();
  const [state, setState] = useState(readState);
  const stepIndex = STEPS.findIndex(([p]) => p === path);

  const update = (patch) => {
    const next = { ...state, ...patch };
    setState(next);
    writeState(next);
  };

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <p className="label">New certificate</p>
      <h1 className="t-h3">{STEPS[stepIndex]?.[1] || 'Certificate'}</h1>

      <nav className="wizard-steps" aria-label="Certificate steps" style={{ marginTop: '1.5rem' }}>
        {STEPS.map(([href, label], i) => (
          <Link key={href} href={href} className="wizard-step" aria-current={i === stepIndex ? 'step' : undefined}>
            {i + 1}. {label}
          </Link>
        ))}
      </nav>

      {stepIndex === 0 ? <StepLot state={state} update={update} /> : null}
      {stepIndex === 1 ? <StepClaim state={state} /> : null}
      {stepIndex === 2 ? <StepRecipient state={state} update={update} /> : null}
      {stepIndex === 3 ? <StepReview state={state} /> : null}
    </div>
  );
}

// Each of the four steps shows the eight conditions as they stand.
function Conditions({ lot, recipient }) {
  const [version] = useState(0);
  const preview = useAsync(
    () => (lot ? api.post('/certificates/preview', { lot, recipient: recipient || null }) : Promise.resolve(null)),
    [lot, recipient, version]
  );

  if (!lot) {
    return (
      <div className="banner banner-quiet">
        <div className="banner-title">The eight conditions</div>
        <p className="t-small" style={{ marginBottom: 0 }}>
          Choose a lot to see the eight conditions as they stand for it. None of the eight is waivable,
          and the same eight are decided again on the server at the moment of signing.
        </p>
      </div>
    );
  }
  if (preview.loading) return <Loading what="the eight conditions" />;
  if (preview.error) return <Refusal error={preview.error} title="The conditions could not be read" />;
  if (!preview.data) return null;

  const blocking = preview.data.conditions.filter((c) => !c.satisfied);

  return (
    <section className="section" style={{ paddingTop: '1.5rem' }}>
      <h2 className="t-h4">The eight conditions</h2>
      <p className="t-small" style={{ marginTop: '0.5rem' }}>
        {blocking.length === 0
          ? 'All eight are satisfied as the records stand now. They are decided again at the moment of signing.'
          : `${blocking.length} of the eight ${blocking.length === 1 ? 'is' : 'are'} unsatisfied. No control on this screen dismisses ${blocking.length === 1 ? 'it' : 'them'}.`}
      </p>

      <div style={{ marginTop: '1rem' }}>
        {preview.data.conditions.map((c) => (
          <div className="condition-row" key={c.condition}>
            <div>
              {c.satisfied
                ? <StateWord quiet>Satisfied</StateWord>
                : <StateWord icon="warning">Blocked</StateWord>}
            </div>
            <div>
              <div>{CONDITION_TEXT[c.condition] || c.condition}</div>
              {!c.satisfied ? (
                <>
                  <p className="t-small" style={{ margin: '0.35rem 0 0' }}>{c.detail}</p>
                  {c.blocking_reference ? (
                    <p className="t-small" style={{ margin: '0.35rem 0 0' }}>
                      <ResolveLink reference={c.blocking_reference} condition={c.condition} />
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// a link to the record that would resolve the condition
function ResolveLink({ reference, condition }) {
  let href = null;
  if (/^LOT-/.test(reference)) href = `/console/lots/${reference}`;
  else if (/^OVR-/.test(reference)) href = `/console/lots/${reference}`;
  else if (/^DEV-/.test(reference)) href = '/console/record?object_kind=deviation';
  else if (/^BP-/.test(reference)) href = `/console/balance/${reference}`;
  else if (/^RUN-/.test(reference)) href = `/console/runs/${reference}`;
  if (condition === 'no_unreviewed_override') {
    return (
      <>
        The record that would resolve it: <span className="mono">{reference}</span>. A second person,
        who is not the authoriser, reviews the override on the lot.
      </>
    );
  }
  return (
    <>
      The record that would resolve it:{' '}
      {href ? <Link href={href} className="ref">{reference}</Link> : <span className="mono">{reference}</span>}.
    </>
  );
}

function StepLot({ state, update }) {
  const lots = useAsync(() => api.get('/lots'), []);
  return (
    <>
      <p>Choose the lot this certificate covers. Each step is reachable at its own address.</p>
      {lots.loading ? <Loading what="the lot register" /> : null}
      {lots.error ? <Empty>The lot register could not be read.</Empty> : null}
      {lots.data && lots.data.length === 0 ? <Empty>There are no lots to certify.</Empty> : null}
      {lots.data && lots.data.length ? (
        <div className="stack" style={{ marginTop: '1.5rem' }}>
          {lots.data.map((l) => (
            <label className="card" key={l.reference} style={{ cursor: 'pointer', display: 'block' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <input
                  type="radio"
                  name="lot"
                  value={l.reference}
                  checked={state.lot === l.reference}
                  onChange={() => update({ lot: l.reference })}
                  style={{ width: 'auto', marginTop: '0.3rem' }}
                />
                <div style={{ flex: 1 }}>
                  <div className="mono t-body">{l.reference}</div>
                  <dl className="dl" style={{ marginTop: '0.5rem' }}>
                    <dt>Site</dt><dd className="mono">{l.site}</dd>
                    <dt>Mass</dt><dd className="mono">{formatInt(l.mass_g)} g</dd>
                    <dt>Disposition</dt><dd>{l.disposition}</dd>
                    <dt>Recycled content</dt>
                    <dd><Content contentBp={l.content_bp} claimType={l.claim_type} /></dd>
                  </dl>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {l.open_deviation ? <StateWord icon="warning">Open deviation</StateWord> : null}
                    {l.unreviewed_override_count ? <StateWord icon="warning">Unreviewed override</StateWord> : null}
                    {l.flags.includes('lapsed_calibration') ? <StateWord icon="warning">Lapsed calibration</StateWord> : null}
                  </div>
                </div>
              </div>
            </label>
          ))}
        </div>
      ) : null}

      <Conditions lot={state.lot} recipient={state.recipient} />

      <div style={{ marginTop: '1.5rem' }}>
        <Link href="/console/certificates/new/claim" className="button button-primary">Next: the claim</Link>
      </div>
    </>
  );
}

function StepClaim({ state }) {
  const lot = useAsync(
    () => (state.lot ? api.get(`/lots/${state.lot}`) : Promise.resolve(null)),
    [state.lot]
  );
  const carbon = useAsync(
    () => (state.lot ? api.get(`/lots/${state.lot}/carbon`).catch(() => null) : Promise.resolve(null)),
    [state.lot]
  );

  return (
    <>
      {!state.lot ? (
        <Empty>No lot is chosen. Go back to the first step and choose one.</Empty>
      ) : null}
      {lot.loading ? <Loading what="the claim" /> : null}
      {lot.data ? (
        <div className="grid grid-2" style={{ marginTop: '1rem' }}>
          <div className="card">
            <h2 className="t-h4">The claim</h2>
            <p className="t-small" style={{ marginTop: '0.5rem' }}>
              Every figure here is computed from the ledger. No control on this screen sets a
              percentage, because no route accepts one.
            </p>
            <dl className="dl" style={{ marginTop: '1rem' }}>
              <dt>Lot</dt><dd className="mono">{lot.data.reference}</dd>
              <dt>Mass</dt><dd className="mono">{formatInt(lot.data.mass_g)} g</dd>
              <dt>Credit attached</dt><dd className="mono">{formatInt(lot.data.credit_attached_g)} g</dd>
              <dt>Claim</dt>
              <dd><Content contentBp={lot.data.content_bp} claimType={lot.data.claim_type} /></dd>
            </dl>
            <p className="t-small" style={{ marginTop: '0.75rem', color: 'var(--muted)' }}>{lot.data.derivation}</p>
            {Object.entries(lot.data.category_split || {}).length ? (
              <>
                <p className="label" style={{ marginTop: '1rem' }}>Category split</p>
                <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.3rem 0 0' }}>
                  {Object.entries(lot.data.category_split).map(([k, v]) => (
                    <li key={k} className="mono">{k.replace(/_/g, '-')}: {formatInt(v)} g</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
          <div className="card">
            <h2 className="t-h4">The carbon figure</h2>
            {carbon.loading ? <Loading what="the carbon figure" /> : null}
            {carbon.data ? (
              <div style={{ marginTop: '1rem' }}>
                <CarbonFigure carbon={carbon.data} />
                <p className="label" style={{ marginTop: '1rem' }}>Breakdown</p>
                <div className="table-scroll" style={{ marginTop: '0.5rem' }}>
                  <table>
                    <thead><tr><th scope="col">Line</th><th scope="col" className="num">mg/kg</th><th scope="col">Tag</th></tr></thead>
                    <tbody>
                      {carbon.data.breakdown.map((b) => (
                        <tr key={b.line}>
                          <td>{b.line.replace(/_/g, ' ')}</td>
                          <td className="num">{formatInt(b.mg_per_kg)}</td>
                          <td>{b.tag}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="label" style={{ marginTop: '1rem' }}>Energy, both figures</p>
                <dl className="dl">
                  <dt>Location-based</dt><dd className="mono">{formatInt(carbon.data.energy_location_mg_per_kg)} mg/kg</dd>
                  <dt>Market-based</dt><dd className="mono">{formatInt(carbon.data.energy_market_mg_per_kg)} mg/kg</dd>
                  <dt>Metered</dt><dd className="mono">{formatInt(carbon.data.metered_kwh)} kWh</dd>
                  <dt>Retired</dt><dd className="mono">{formatInt(carbon.data.retired_kwh)} kWh</dd>
                  <dt>Unmatched</dt><dd className="mono">{formatInt(carbon.data.unmatched_kwh)} kWh</dd>
                </dl>
                {carbon.data.default_led ? (
                  <div style={{ marginTop: '0.75rem' }}><StateWord icon="flag">Default-led</StateWord></div>
                ) : null}
              </div>
            ) : null}
            {!carbon.loading && !carbon.data ? (
              <Empty>No carbon figure carrying all four components exists for this lot.</Empty>
            ) : null}
          </div>
        </div>
      ) : null}

      <Conditions lot={state.lot} recipient={state.recipient} />

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
        <Link href="/console/certificates/new/lot" className="button">Back</Link>
        <Link href="/console/certificates/new/recipient" className="button button-primary">Next: the recipient</Link>
      </div>
    </>
  );
}

function StepRecipient({ state, update }) {
  const customers = useAsync(() => api.get('/customers'), []);
  return (
    <>
      <p>Choose the recipient. The permitted statement is generated in their language.</p>
      {customers.loading ? <Loading what="the customers" /> : null}
      {customers.error ? <Empty>The customers could not be read.</Empty> : null}
      {customers.data && customers.data.length ? (
        <div className="stack" style={{ marginTop: '1.5rem' }}>
          {customers.data.map((c) => (
            <label className="card" key={c.reference} style={{ cursor: 'pointer', display: 'block' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <input
                  type="radio"
                  name="recipient"
                  value={c.reference}
                  checked={state.recipient === c.reference}
                  onChange={() => update({ recipient: c.reference })}
                  style={{ width: 'auto', marginTop: '0.3rem' }}
                />
                <div>
                  <div className="t-body">{c.name}</div>
                  <dl className="dl" style={{ marginTop: '0.5rem' }}>
                    <dt>Reference</dt><dd className="mono">{c.reference}</dd>
                    <dt>Holds</dt><dd className="mono">{c.holds_specification_version}</dd>
                    <dt>Application</dt><dd>{c.application}</dd>
                    <dt>Industry</dt><dd>{c.industry}</dd>
                    <dt>Language</dt><dd className="mono">{c.language}</dd>
                  </dl>
                </div>
              </div>
            </label>
          ))}
        </div>
      ) : null}

      <Conditions lot={state.lot} recipient={state.recipient} />

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
        <Link href="/console/certificates/new/claim" className="button">Back</Link>
        <Link href="/console/certificates/new/review" className="button button-primary">Next: review and sign</Link>
      </div>
    </>
  );
}

// The fourth step renders the exact document that will be signed.
function StepReview({ state }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [signed, setSigned] = useState(null);
  const [busy, setBusy] = useState(false);
  const user = getUser();
  const isSigner = (user?.roles || []).includes('certificate_signer');

  const preview = useAsync(
    () => (state.lot ? api.post('/certificates/preview', { lot: state.lot, recipient: state.recipient || null }) : Promise.resolve(null)),
    [state.lot, state.recipient, signed]
  );

  async function sign(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api.post('/certificates', { lot: state.lot, recipient: state.recipient, password });
      setSigned(res);
      setPassword('');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (signed) {
    return (
      <>
        <div className="banner" role="status">
          <div className="banner-title">Certificate signed</div>
          <p className="t-small">
            <span className="mono">{signed.number}</span> has been issued to {signed.recipient_name}. The
            recipient has been notified, and the document is readable at its permanent address.
          </p>
          <p className="t-small" style={{ marginBottom: 0 }}>
            <Link href={`/console/certificates/${signed.number}`}>Open the certificate</Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {!state.lot || !state.recipient ? (
        <Empty>Choose a lot and a recipient in the earlier steps before reviewing the document.</Empty>
      ) : null}

      <Conditions lot={state.lot} recipient={state.recipient} />

      {preview.data?.document_preview ? (
        <section className="section">
          <h2 className="t-h4">The exact document that will be signed</h2>
          <p className="t-small" style={{ marginTop: '0.5rem' }}>
            This is the document itself, including the permitted downstream statement in the
            recipient's language, rather than a form that generates it.
          </p>
          <p className="banner banner-quiet statement" style={{ marginTop: '1rem' }}>
            The recipient will file this document with a regulator.
          </p>
          <pre className="document-body">{preview.data.document_preview}</pre>
        </section>
      ) : null}

      <section className="section">
        <h2 className="t-h4">Sign</h2>
        <p className="t-small" style={{ marginTop: '0.5rem' }}>
          Signing is a separate, deliberate act. Your identity is confirmed at that moment: a session
          alone is not a signing credential, so the signing act carries your password again.
        </p>

        <Refusal error={error} title="Signing was refused" />

        {!isSigner ? (
          <div className="banner banner-quiet">
            <div className="banner-title">You do not hold the signing role</div>
            <p className="t-small" style={{ marginBottom: 0 }}>
              Your roles are {(user?.roles || []).join(', ').replace(/_/g, ' ')}. A certificate is signed by a
              certificate signer whose scope covers the lot's site.
            </p>
          </div>
        ) : (
          <form onSubmit={sign} style={{ marginTop: '1rem', maxWidth: '24rem' }}>
            <label htmlFor="sign-password" className="label">Confirm your password to sign</label>
            <input
              id="sign-password"
              type="password"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="submit"
              className="button button-primary"
              style={{ marginTop: '1rem' }}
              disabled={busy || !password || !state.lot || !state.recipient}
            >
              {busy ? 'Signing…' : 'Sign this certificate'}
            </button>
          </form>
        )}
      </section>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
        <Link href="/console/certificates/new/recipient" className="button">Back</Link>
      </div>
    </>
  );
}
