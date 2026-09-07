import { useState, useEffect } from 'preact/hooks';
import { api, apiText, storedSession } from '../api.js';
import { Link, navigate } from '../router.jsx';
import { useFetch } from './console.jsx';
import {
  State, Empty, Loading, Refusal, Carbon, Mark, formatInt, formatBp,
} from '../components/ui.jsx';

const STEPS = [
  { key: 'lot', label: 'Lot', path: '/console/certificates/new/lot' },
  { key: 'claim', label: 'Claim', path: '/console/certificates/new/claim' },
  { key: 'recipient', label: 'Recipient', path: '/console/certificates/new/recipient' },
  { key: 'review', label: 'Review and sign', path: '/console/certificates/new/review' },
];

const DRAFT = 'ravel.certificate.draft';
function draft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT) || '{}'); } catch { return {}; }
}
function setDraft(next) {
  sessionStorage.setItem(DRAFT, JSON.stringify({ ...draft(), ...next }));
}

// Each step shows the eight conditions as eight statements. No control on this
// screen dismisses one.
function Conditions({ conditions }) {
  if (!conditions) return <Loading what="the eight conditions" />;
  return (
    <ol class="stack-s" style="margin-top:1rem">
      {conditions.map((c, i) => (
        <li class="condition" key={c.condition}>
          <span class="label" style="margin:0;min-width:2rem">{i + 1}</span>
          <div>
            <p>
              <State word={c.satisfied ? 'satisfied' : 'not satisfied'} strong={!c.satisfied}>
                {c.satisfied ? null : <Mark kind="warning" label="" />}
              </State>{' '}
              <strong>{c.condition.replace(/_/g, ' ')}</strong>
            </p>
            <p class="note" style="margin-top:0.3rem">{c.detail}</p>
            {!c.satisfied && c.blocking_reference ? (
              <p class="note" style="margin-top:0.3rem">
                Blocked by{' '}
                <Link href={recordLink(c.condition, c.blocking_reference)} class="mono">
                  {c.blocking_reference}
                </Link>
                {' '}— the record that would resolve it.
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function recordLink(condition, ref) {
  if (condition === 'no_unreviewed_override') return '/console/record?override=' + ref;
  if (condition === 'no_open_deviation') return '/console/record?deviation=' + ref;
  if (condition === 'period_closed' || condition === 'balance_invariant_holds') {
    return '/console/balance/' + ref;
  }
  if (condition === 'lot_released') return `/console/lots/${ref}/genealogy`;
  if (condition === 'carbon_figure_complete') return `/console/lots/${ref}/genealogy`;
  return '/console/record';
}

function Steps({ current }) {
  return (
    <ol style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:1rem">
      {STEPS.map((s, i) => (
        <li key={s.key}>
          <Link href={s.path} class="mono"
                aria-current={s.key === current ? 'step' : undefined}
                style={s.key === current
                  ? 'text-decoration:none;box-shadow:inset 0 -2px 0 0 var(--ink);padding-bottom:2px'
                  : ''}>
            {i + 1}. {s.label}
          </Link>
        </li>
      ))}
    </ol>
  );
}

function useConditions(lot) {
  const [state, setState] = useState({ loading: !!lot, data: null });
  useEffect(() => {
    if (!lot) { setState({ loading: false, data: null }); return; }
    let live = true;
    setState({ loading: true, data: null });
    api('/certificates/preview', {
      method: 'POST',
      body: { lot, recipient: draft().recipient || null },
    })
      .then((d) => live && setState({ loading: false, data: d }))
      .catch(() => live && setState({ loading: false, data: null }));
    return () => { live = false; };
  }, [lot]);
  return state;
}

function WizardFrame({ step, children }) {
  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">New certificate</p>
        <h1 style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          {STEPS.find((s) => s.key === step).label}
        </h1>
        <Steps current={step} />
        <p class="note measure" style="margin-top:0.75rem">
          Each step is reachable at its own address and each shows the eight conditions as they
          stand. None of the eight is waivable.
        </p>
      </section>
      {children}
    </div>
  );
}

export function WizardLot() {
  const lots = useFetch('/lots');
  const [lot, setLot] = useState(draft().lot || '');
  const cond = useConditions(lot);
  return (
    <WizardFrame step="lot">
      <section class="section">
        <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Choose a lot</h2>
        {lots.loading ? <Loading what="the lot register" /> : null}
        {lots.data && lots.data.length === 0 ? <Empty>There is no lot to certify.</Empty> : null}
        {lots.data ? (
          <ul class="stack" style="margin-top:1rem">
            {lots.data.map((l) => (
              <li class="card stack-s" key={l.reference}>
                <label style="display:flex;gap:0.75rem;align-items:flex-start;cursor:pointer">
                  <input type="radio" name="lot" value={l.reference} checked={lot === l.reference}
                         style="width:auto;margin-top:0.35rem"
                         onChange={() => { setLot(l.reference); setDraft({ lot: l.reference }); }} />
                  <span>
                    <span class="mono">{l.reference}</span>
                    <span class="note" style="display:block;margin-top:0.3rem">
                      {l.site} · {l.grade} · {formatInt(l.mass_g)} g · {l.disposition}
                      {' · '}{l.content_bp} bp ({formatBp(l.content_bp)}),{' '}
                      {l.claim_type.replace(/_/g, ' ')}
                    </span>
                    {l.flags.length ? (
                      <span style="display:block;margin-top:0.35rem">
                        {l.flags.map((f) => <State word={f.replace(/_/g, ' ')} strong key={f} />)}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section class="section">
        <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">The eight conditions</h2>
        {!lot ? <p class="note" style="margin-top:0.75rem">Choose a lot to see how the eight stand.</p> : null}
        {cond.loading ? <Loading what="the eight conditions" /> : null}
        {cond.data ? <Conditions conditions={cond.data.conditions} /> : null}
        {lot ? (
          <p style="margin-top:1.5rem">
            <Link href="/console/certificates/new/claim" class="button">
              Continue to the claim <span class="arrow" aria-hidden="true">→</span>
            </Link>
          </p>
        ) : null}
      </section>
    </WizardFrame>
  );
}

export function WizardClaim() {
  const lot = draft().lot;
  const cond = useConditions(lot);
  const carbon = useFetch(lot ? `/lots/${lot}/carbon` : null, [lot]);
  const d = cond.data;
  return (
    <WizardFrame step="claim">
      <section class="section">
        {!lot ? (
          <Empty>
            No lot is chosen. <Link href="/console/certificates/new/lot">Choose a lot</Link> first.
          </Empty>
        ) : null}
        {d ? (
          <>
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">The claim</h2>
            <dl class="stack-s" style="margin-top:1rem">
              <div class="balance-figure">
                <dt class="label" style="margin:0">Lot</dt>
                <dd class="mono" style="margin:0">{d.lot}</dd>
              </div>
              <div class="balance-figure">
                <dt class="label" style="margin:0">Claim type</dt>
                <dd style="margin:0">{d.claim_type ? d.claim_type.replace(/_/g, ' ') : '—'}</dd>
              </div>
              <div class="balance-figure">
                <dt class="label" style="margin:0">Recycled content</dt>
                <dd class="balance-figure__value" style="margin:0">
                  {d.content_bp} bp — {formatBp(d.content_bp)}, {d.claim_type ? d.claim_type.replace(/_/g, ' ') : ''}
                </dd>
              </div>
              {d.category_split ? (
                <>
                  <div class="balance-figure">
                    <dt class="label" style="margin:0">Post-consumer</dt>
                    <dd class="balance-figure__value" style="margin:0">
                      {formatInt(d.category_split.post_consumer)} g
                    </dd>
                  </div>
                  <div class="balance-figure">
                    <dt class="label" style="margin:0">Pre-consumer</dt>
                    <dd class="balance-figure__value" style="margin:0">
                      {formatInt(d.category_split.pre_consumer)} g
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {d.provisional_factor ? (
              <p style="margin-top:1rem">
                <State word="provisional conversion factor" strong /> This certificate will say so.
              </p>
            ) : null}
            <h3 style="font-size:var(--h4-size);line-height:var(--h4-line);margin-top:2rem">
              The carbon figure
            </h3>
            {carbon.loading ? <Loading what="the carbon figure" /> : null}
            {carbon.data ? (
              <div class="stack-s" style="margin-top:0.75rem">
                <p><Carbon figure={carbon.data} /></p>
                <p class="note">
                  Primary data share {carbon.data.primary_share_bp} bp against a threshold of{' '}
                  {carbon.data.primary_threshold_bp} bp:{' '}
                  {carbon.data.default_led ? 'default-led' : 'not default-led'}.
                </p>
                <p class="note">
                  This figure is {carbon.data.comparator_relation === 'lower_than_comparator'
                    ? 'lower than' : 'not lower than'} {carbon.data.comparator.material} (
                  {carbon.data.comparator.dataset}, {carbon.data.comparator.dataset_year},{' '}
                  {carbon.data.comparator.region}).
                </p>
                <p class="label">Breakdown</p>
                <div class="scroller">
                  <table>
                    <thead>
                      <tr><th scope="col">Line</th><th scope="col" class="num">mg/kg</th>
                          <th scope="col">Tag</th></tr>
                    </thead>
                    <tbody>
                      {carbon.data.breakdown.map((l) => (
                        <tr key={l.line}>
                          <td>{l.line.replace(/_/g, ' ')}</td>
                          <td class="num">{formatInt(l.mg_per_kg)}</td>
                          <td>{l.tag.replace(/_/g, ' ')}</td>
                        </tr>
                      ))}
                      <tr>
                        <td><strong>Total</strong></td>
                        <td class="num"><strong>{formatInt(carbon.data.value_mg_per_kg)}</strong></td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p class="label">Energy, both figures together</p>
                <p class="mono note">
                  location {formatInt(carbon.data.energy_location_mg_per_kg)} mg/kg ·
                  market {formatInt(carbon.data.energy_market_mg_per_kg)} mg/kg
                </p>
                <p class="mono note">
                  metered {formatInt(carbon.data.metered_kwh)} kWh ·
                  retired {formatInt(carbon.data.retired_kwh)} kWh ·
                  unmatched {formatInt(carbon.data.unmatched_kwh)} kWh
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
      <section class="section">
        <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">The eight conditions</h2>
        <Conditions conditions={d ? d.conditions : null} />
        <p style="margin-top:1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap">
          <Link href="/console/certificates/new/lot" class="button button--quiet">Back to the lot</Link>
          <Link href="/console/certificates/new/recipient" class="button">
            Continue to the recipient <span class="arrow" aria-hidden="true">→</span>
          </Link>
        </p>
      </section>
    </WizardFrame>
  );
}

export function WizardRecipient() {
  const customers = useFetch('/customers');
  const lot = draft().lot;
  const [recipient, setRecipient] = useState(draft().recipient || '');
  const cond = useConditions(lot);
  return (
    <WizardFrame step="recipient">
      <section class="section">
        <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Choose a recipient</h2>
        {customers.loading ? <Loading what="the customers" /> : null}
        {customers.data ? (
          <ul class="stack" style="margin-top:1rem">
            {customers.data.map((c) => (
              <li class="card" key={c.reference}>
                <label style="display:flex;gap:0.75rem;align-items:flex-start;cursor:pointer">
                  <input type="radio" name="recipient" checked={recipient === c.reference}
                         style="width:auto;margin-top:0.35rem"
                         onChange={() => { setRecipient(c.reference); setDraft({ recipient: c.reference }); }} />
                  <span>
                    <strong>{c.name}</strong>
                    <span class="note" style="display:block;margin-top:0.3rem">
                      <span class="mono">{c.reference}</span> · {c.industry} · {c.application} ·
                      holds {c.holds_specification_version} · reads in{' '}
                      {c.language === 'fr' ? 'French' : 'English'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section class="section">
        <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">The eight conditions</h2>
        <Conditions conditions={cond.data ? cond.data.conditions : null} />
        <p style="margin-top:1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap">
          <Link href="/console/certificates/new/claim" class="button button--quiet">Back to the claim</Link>
          {recipient ? (
            <Link href="/console/certificates/new/review" class="button">
              Continue to the review <span class="arrow" aria-hidden="true">→</span>
            </Link>
          ) : null}
        </p>
      </section>
    </WizardFrame>
  );
}

export function WizardReview() {
  const { lot, recipient } = draft();
  const [preview, setPreview] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!lot) return;
    api('/certificates/preview', { method: 'POST', body: { lot, recipient } })
      .then(setPreview).catch(() => setPreview(null));
  }, [lot, recipient]);

  const sign = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api('/certificates', {
        method: 'POST',
        body: { lot, recipient, password },
      });
      sessionStorage.removeItem(DRAFT);
      navigate(`/console/certificates/${r.number}`);
    } catch (err) {
      setError(err);
      // The eight are decided again at the moment of signing.
      if (err.body && err.body.conditions) {
        setPreview((p) => ({ ...(p || {}), conditions: err.body.conditions }));
      }
    } finally {
      setBusy(false);
    }
  };

  const blocked = preview ? preview.conditions.filter((c) => !c.satisfied) : [];
  return (
    <WizardFrame step="review">
      <section class="section">
        {!lot || !recipient ? (
          <Empty>
            A lot and a recipient are needed.{' '}
            <Link href="/console/certificates/new/lot">Start at the lot</Link>.
          </Empty>
        ) : null}
        <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">The eight conditions</h2>
        <Conditions conditions={preview ? preview.conditions : null} />
      </section>

      {preview ? (
        <section class="section">
          <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">
            The document that will be signed
          </h2>
          <p class="note" style="margin-top:0.5rem">
            The recipient will file this document with a regulator.
          </p>
          <div class="sheet stack" style="margin-top:1rem">
            <dl class="stack-s">
              <div class="balance-figure">
                <dt class="label" style="margin:0">Lot</dt>
                <dd class="mono" style="margin:0">{preview.lot}</dd>
              </div>
              <div class="balance-figure">
                <dt class="label" style="margin:0">Recipient</dt>
                <dd style="margin:0">{preview.recipient_name}</dd>
              </div>
              <div class="balance-figure">
                <dt class="label" style="margin:0">Claim type</dt>
                <dd style="margin:0">{preview.claim_type ? preview.claim_type.replace(/_/g, ' ') : '—'}</dd>
              </div>
              <div class="balance-figure">
                <dt class="label" style="margin:0">Recycled content</dt>
                <dd class="balance-figure__value" style="margin:0">
                  {preview.content_bp} bp — {formatBp(preview.content_bp)},{' '}
                  {preview.claim_type ? preview.claim_type.replace(/_/g, ' ') : ''}
                </dd>
              </div>
            </dl>
            {preview.carbon ? <p><Carbon figure={preview.carbon} /></p> : null}
            <div class="permitted-statement">
              <p class="label">The permitted statement, as the recipient will read it</p>
              <p class="body-big">{preview.permitted_statement}</p>
            </div>
            <div class="permitted-statement">
              <p class="label">The prohibited statement</p>
              <p class="body-big">{preview.prohibited_statement}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section class="section">
        <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Sign</h2>
        {blocked.length ? (
          <div style="margin-top:1rem">
            <Refusal title={`Signing is blocked by ${blocked.length} condition${blocked.length === 1 ? '' : 's'}.`}>
              {blocked.map((c) => (
                <p key={c.condition}>
                  <strong>{c.condition.replace(/_/g, ' ')}</strong>: {c.detail}
                  {c.blocking_reference ? (
                    <> <Link href={recordLink(c.condition, c.blocking_reference)} class="mono">
                      {c.blocking_reference}
                    </Link></>
                  ) : null}
                </p>
              ))}
              <p class="note">
                None of the eight is waivable, and no control on this screen dismisses one. The
                record named above is what would resolve it.
              </p>
            </Refusal>
          </div>
        ) : (
          <form class="stack" onSubmit={sign} style="margin-top:1rem;max-width:26rem">
            <p class="note">
              Signing re-authenticates. A session alone is not a signing credential.
            </p>
            <label class="field">
              <span>Your password, to sign</span>
              <input type="password" required autocomplete="current-password" value={password}
                     onInput={(e) => setPassword(e.target.value)} />
            </label>
            <p>
              <button class="button" type="submit" disabled={busy}>
                {busy ? 'Signing…' : 'Sign this certificate'}{' '}
                <span class="arrow" aria-hidden="true">→</span>
              </button>
            </p>
          </form>
        )}
        {error ? (
          <div style="margin-top:1rem">
            <Refusal title="The signature was refused.">
              <p>{error.message}</p>
              <p class="note">
                The eight conditions are decided again at the moment of signing, against the
                records as they stand then rather than as they stood at the preview.
              </p>
            </Refusal>
          </div>
        ) : null}
      </section>
    </WizardFrame>
  );
}

export function CertificateList() {
  const certs = useFetch('/certificates');
  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">Console</p>
        <h1 style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          Issued certificates
        </h1>
        <p style="margin-top:1rem">
          <Link href="/console/certificates/new/lot" class="button">
            Begin a certificate <span class="arrow" aria-hidden="true">→</span>
          </Link>
        </p>
      </section>
      <section class="section">
        {certs.loading ? <Loading what="the certificate register" /> : null}
        {certs.data && certs.data.length === 0 ? (
          <Empty>No certificate has been issued yet.</Empty>
        ) : null}
        {certs.data && certs.data.length > 0 ? (
          <div class="scroller">
            <table>
              <caption class="visually-hidden">Every certificate, with its state and claim</caption>
              <thead>
                <tr>
                  <th scope="col">Number</th><th scope="col" class="num">Version</th>
                  <th scope="col">Site</th><th scope="col">Recipient</th>
                  <th scope="col">Claim</th><th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {certs.data.map((c) => (
                  <tr key={c.number + c.version}>
                    <td class="mono">
                      <Link href={`/console/certificates/${c.number}`}>{c.number}</Link>
                    </td>
                    <td class="num">{c.version}</td>
                    <td class="mono">{c.site}</td>
                    <td>{c.recipient_name}</td>
                    <td class="num">
                      {c.content_bp} bp
                      <span class="note" style="display:block">{c.claim_type.replace(/_/g, ' ')}</span>
                    </td>
                    <td>
                      <State word={c.state} strong={c.state === 'withdrawn'}>
                        {c.state === 'withdrawn' ? <Mark kind="warning" label="" /> : null}
                      </State>
                      {c.provisional_factor ? (
                        <span style="display:block;margin-top:0.3rem">
                          <State word="provisional factor" strong />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function CertificateDetail({ number }) {
  const cert = useFetch(`/certificates/${number}`, [number]);
  const [doc, setDoc] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState(null);

  useEffect(() => {
    apiText(`/certificates/${number}/document`).then(setDoc).catch(() => setDoc(null));
  }, [number]);

  const c = cert.data;

  // Before confirming, show the blast radius: the recipients by name and the
  // statements that become void. Not a count of them.
  const beginWithdrawal = async () => {
    setWithdrawing(true);
    const impacts = [];
    try {
      for (const l of (c.lots || [])) {
        const g = await api(`/lots/${l.reference || l}/genealogy`);
        for (const n of g.nodes.filter((x) => x.kind === 'batch')) {
          const imp = await api(`/batches/${n.reference}/impact`);
          impacts.push(imp);
        }
      }
    } catch { /* the enumeration below still shows what is known */ }
    setPreview({
      recipients: [{ reference: c.recipient, name: c.recipient_name }],
      void_statements: [
        c.permitted_statement,
        `This material carries ${c.content_bp} basis points of recycled content under ${c.claim_type}.`,
        `This material is covered by certificate ${c.number} under scheme ${c.scheme}.`,
      ],
      other_certificates: Array.from(new Set(
        impacts.flatMap((i) => i.certificates.map((x) => x.number)).filter((n) => n !== number)
      )),
      other_recipients: Array.from(new Map(
        impacts.flatMap((i) => i.recipients).map((r) => [r.reference, r])
      ).values()),
    });
  };

  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api(`/certificates/${number}/withdraw`, { method: 'POST', body: { reason } });
      setResult(r);
      setWithdrawing(false);
      apiText(`/certificates/${number}/document`).then(setDoc).catch(() => {});
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const doReplay = async () => {
    try { setReplay(await api(`/certificates/${number}/replay`)); }
    catch (e) { setError(e); }
  };

  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">Certificate</p>
        <h1 class="mono" style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          {number}
        </h1>
      </section>

      {cert.loading ? <Loading what="this certificate" /> : null}
      {cert.error ? <Empty>No certificate at this address.</Empty> : null}

      {c ? (
        <>
          <section class="section">
            <p style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
              <State word={c.state} strong={c.state === 'withdrawn'}>
                {c.state === 'withdrawn' ? <Mark kind="warning" label="" /> : null}
              </State>
              {c.provisional_factor ? <State word="provisional factor" strong /> : null}
            </p>
            {c.state === 'withdrawn' ? (
              <p style="margin-top:0.75rem">
                This certificate was withdrawn on {c.withdrawn_on}. Reason: {c.withdrawal_reason}.
              </p>
            ) : null}
            <dl class="stack-s" style="margin-top:1.5rem">
              {[
                ['Version', c.version],
                ['Site', c.site],
                ['Grade', c.grade],
                ['Recipient', c.recipient_name],
                ['Claim type', c.claim_type.replace(/_/g, ' ')],
                ['Recycled content', `${c.content_bp} bp — ${formatBp(c.content_bp)}, ${c.claim_type.replace(/_/g, ' ')}`],
                ['Period', c.period],
                ['Scheme', `${c.scheme}, registration ${c.registration}`],
                ['Signer', `${c.signer_name} (${c.signer})`],
                ['Signed at', c.signed_at],
                ['Specification', `SPEC-${c.grade} version ${c.specification_version}`],
              ].map(([k, v]) => (
                <div class="balance-figure" key={k}>
                  <dt class="label" style="margin:0">{k}</dt>
                  <dd class="balance-figure__value" style="margin:0">{v}</dd>
                </div>
              ))}
            </dl>
            <p style="margin-top:1rem"><Carbon figure={c.carbon} /></p>
            <div class="stack-s" style="margin-top:1.5rem">
              <p class="label">Permitted statement</p>
              <p class="body-big permitted-statement">{c.permitted_statement}</p>
              <p class="label">Prohibited statement</p>
              <p class="body-big permitted-statement">{c.prohibited_statement}</p>
            </div>
            {c.deviations && c.deviations.length ? (
              <div style="margin-top:1.5rem">
                <p class="label">Deviations travelling with this lot</p>
                {c.deviations.map((d) => (
                  <p class="note" key={d.reference}>
                    <span class="mono">{d.reference}</span>{' '}
                    <State word={d.state} strong={d.state === 'open'} />{' '}
                    {d.outcome ? `outcome: ${d.outcome.replace(/_/g, ' ')}` : ''}
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">
              The eight conditions, as they stood at signing
            </h2>
            <p class="note" style="margin-top:0.5rem">
              These are stored as they stood at the moment of signing and are never recomputed on
              read.
            </p>
            <ol class="stack-s" style="margin-top:1rem">
              {(c.conditions || []).map((x) => (
                <li class="condition" key={x.condition}>
                  <State word={x.satisfied ? 'satisfied' : 'not satisfied'} strong={!x.satisfied} />
                  <div>
                    <p><strong>{x.condition.replace(/_/g, ' ')}</strong></p>
                    <p class="note">{x.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Replay</h2>
            <p class="note measure" style="margin-top:0.5rem">
              What this certificate said, what recomputation says now, and the input that differs.
              Agreement and disagreement are both ordinary answers.
            </p>
            <p style="margin-top:1rem">
              <button class="button button--quiet" onClick={doReplay}>Replay from the recorded inputs</button>
            </p>
            {replay ? (
              <div class="stack-s" style="margin-top:1rem">
                {replay.reproducible === false ? (
                  <div class="banner">
                    <p class="banner__title">
                      <State word="not reproducible" strong />
                    </p>
                    <p style="margin-top:0.4rem">{replay.reason}</p>
                  </div>
                ) : (
                  <>
                    <p>
                      <State word={replay.agrees ? 'agrees' : 'differs'} strong />
                    </p>
                    <div class="scroller">
                      <table>
                        <thead>
                          <tr><th scope="col">Figure</th><th scope="col" class="num">Issued</th>
                              <th scope="col" class="num">Recomputed</th></tr>
                        </thead>
                        <tbody>
                          {Object.keys(replay.issued).map((k) => (
                            <tr key={k}>
                              <td>{k.replace(/_/g, ' ')}</td>
                              <td class="num">{String(replay.issued[k])}</td>
                              <td class="num">{String(replay.recomputed[k])}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {replay.differing_input ? (
                      <p>
                        The input that moved: <strong>{replay.differing_input.input}</strong>,
                        issued <span class="mono">{String(replay.differing_input.issued)}</span>,
                        now <span class="mono">{String(replay.differing_input.recomputed)}</span>.
                      </p>
                    ) : null}
                  </>
                )}
                <p class="label">Input versions</p>
                <ul class="stack-s">
                  {replay.input_versions.map((v) => (
                    <li class="note mono" key={v.input}>
                      {v.input}: {v.version} {v.resolved ? '' : '(cannot be resolved)'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {c.state !== 'withdrawn' ? (
            <section class="section">
              <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Withdraw</h2>
              <p class="note measure" style="margin-top:0.5rem">
                A withdrawal is one action with five consequences. It is never a deletion, and the
                document stays readable at its address.
              </p>
              {!withdrawing ? (
                <p style="margin-top:1rem">
                  <button class="button button--quiet" onClick={beginWithdrawal}>
                    Begin a withdrawal
                  </button>
                </p>
              ) : null}
              {withdrawing ? (
                <div class="stack" style="margin-top:1rem">
                  {!preview ? <Loading what="the blast radius" /> : (
                    <div class="sheet stack">
                      <h3 style="font-size:var(--h4-size);line-height:var(--h4-line)">
                        Before you confirm
                      </h3>
                      <div>
                        <p class="label">1. The state becomes withdrawn</p>
                        <p class="note">With the reason, the person and the date.</p>
                      </div>
                      <div>
                        <p class="label">2. These recipients will be notified, by name</p>
                        <ul class="stack-s">
                          {preview.recipients.map((r) => (
                            <li key={r.reference}>{r.name} <span class="note mono">{r.reference}</span></li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p class="label">
                          3. These downstream statements the recipient is now obliged to stop making
                        </p>
                        <ul class="stack-s">
                          {preview.void_statements.map((v, i) => <li key={i}>{v}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p class="label">4. Certificates derived from this one</p>
                        <p class="note">
                          {preview.other_certificates.length === 0
                            ? 'No certificate is derived from this one.'
                            : preview.other_certificates.join(', ')}
                        </p>
                      </div>
                      <div>
                        <p class="label">
                          5. The reverse traversal of the underlying batches
                        </p>
                        {preview.other_recipients.length === 0 ? (
                          <p class="note">No other certificate touches these batches.</p>
                        ) : (
                          <ul class="stack-s">
                            {preview.other_recipients.map((r) => <li key={r.reference}>{r.name}</li>)}
                          </ul>
                        )}
                      </div>
                      <form class="stack" onSubmit={confirm}>
                        <label class="field">
                          <span>Reason for withdrawal</span>
                          <textarea rows="3" required value={reason}
                                    onInput={(e) => setReason(e.target.value)} />
                        </label>
                        <p style="display:flex;gap:0.75rem;flex-wrap:wrap">
                          <button class="button" type="submit" disabled={busy}>
                            {busy ? 'Withdrawing…' : 'Confirm the withdrawal'}
                          </button>
                          <button class="button button--quiet" type="button"
                                  onClick={() => { setWithdrawing(false); setPreview(null); }}>
                            Cancel
                          </button>
                        </p>
                      </form>
                    </div>
                  )}
                </div>
              ) : null}
              {error ? (
                <div style="margin-top:1rem">
                  <Refusal title="The withdrawal was refused.">
                    <p>{error.message}</p>
                  </Refusal>
                </div>
              ) : null}
            </section>
          ) : null}

          {result ? (
            <section class="section">
              <div class="banner" role="status">
                <p class="banner__title">The withdrawal landed, with all five consequences.</p>
                <ul class="stack-s" style="margin-top:0.5rem">
                  <li>State: {result.state}, on {result.withdrawn_on}, by {result.withdrawn_by}.</li>
                  <li>
                    Notified: {result.notified_recipients.map((r) => r.name).join(', ')}.
                  </li>
                  <li>{result.void_statements.length} statements are now void.</li>
                  <li>
                    Derived certificates: {result.derived_certificates.length === 0
                      ? 'none' : result.derived_certificates.map((d) => d.number).join(', ')}.
                  </li>
                  <li>The reverse traversal ran over {result.batch_traversal.length} batches.</li>
                </ul>
              </div>
            </section>
          ) : null}

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">The document</h2>
            <p class="note" style="margin-top:0.5rem">
              Readable without this system. Two reads of the same version return identical bytes.
            </p>
            {doc === null ? <Loading what="the document" /> : (
              <pre class="document-text sheet" style="margin-top:1rem">{doc}</pre>
            )}
            <p style="margin-top:1rem" class="no-print">
              <button class="button button--quiet" onClick={() => window.print()}>
                Print this certificate
              </button>
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
