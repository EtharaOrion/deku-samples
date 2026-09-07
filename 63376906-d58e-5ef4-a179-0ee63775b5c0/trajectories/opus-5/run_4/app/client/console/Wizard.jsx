import { useState, useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { api } from '../api.js';
import {
  useAsync, Loading, Empty, StateWord, Icon, grams, words, Refusal,
  ContentFigure, CarbonFigure, EnergyPair,
} from '../ui.jsx';
import SchemeBanner from './SchemeBanner.jsx';

const STEPS = [
  ['lot', 'Lot'],
  ['claim', 'Claim'],
  ['recipient', 'Recipient'],
  ['review', 'Review and sign'],
];

const CONDITION_TITLE = {
  lot_released: 'The lot is released',
  no_open_deviation: 'No deviation touching it is open',
  no_unreviewed_override: 'No override on it is unreviewed',
  period_closed: 'The bookkeeping period is closed',
  balance_invariant_holds: 'The balance invariant holds with the allocation applied',
  carbon_figure_complete: 'The carbon figure exists with all four components',
  signer_holds_scope: 'The signer holds signing scope for that site on the date of signing',
  signer_did_not_enter_data: 'The signer did not enter the data',
};

function read(key, fallback = '') {
  try { return sessionStorage.getItem('ravel.wizard.' + key) || fallback; } catch { return fallback; }
}
function write(key, value) {
  try { value ? sessionStorage.setItem('ravel.wizard.' + key, value) : sessionStorage.removeItem('ravel.wizard.' + key); } catch {}
}

/** The eight conditions, as eight statements, on every step. */
function Conditions({ conditions }) {
  if (!conditions) return null;
  const blocking = conditions.filter((c) => !c.satisfied);
  return (
    <section aria-labelledby="cond" style="margin-top:2rem">
      <h2 id="cond" class="t-h4">The eight conditions</h2>
      <p class="t-small" style="color:var(--muted)">
        None of the eight is waivable, and no control on this screen dismisses one. The same eight
        are decided again on the server at the moment of signing, against the records as they stand
        then rather than as they stand now.
      </p>
      {blocking.length ? (
        <div class="banner" role="alert">
          <p class="t-eyebrow">Blocked</p>
          <p>
            <strong>
              {blocking.length === 1
                ? 'One condition is unsatisfied.'
                : `${blocking.length} conditions are unsatisfied.`}
            </strong>{' '}
            Each says which, and links to the record that would resolve it.
          </p>
          <ol style="margin:0;padding-left:1.25rem">
            {blocking.map((b) => (
              <li key={b.condition}>
                <strong>{CONDITION_TITLE[b.condition] || words(b.condition)}.</strong> {b.detail}
                {b.link ? (
                  <> <a href={b.link}>Open {b.blocking_reference || 'the record'}</a>.</>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p class="banner" style="margin-bottom:1rem">
          <strong>All eight conditions are satisfied as the records stand at this moment.</strong>{' '}
          They will be decided again on the server when the signature is taken.
        </p>
      )}
      <div class="conditions">
        {conditions.map((c) => (
          <div class="condition-row" key={c.condition}>
            <p style="margin:0">
              <strong>{CONDITION_TITLE[c.condition] || words(c.condition)}</strong>
              <span class="t-small mono" style="display:block;color:var(--muted)">{c.condition}</span>
            </p>
            <p style="margin:0">
              {c.detail}
              {!c.satisfied && c.link ? (
                <>
                  {' '}
                  <a href={c.link}>
                    Open {c.blocking_reference || 'the record'} that would resolve it
                  </a>.
                </>
              ) : null}
            </p>
            <p style="margin:0">
              <StateWord
                word={c.satisfied ? 'Satisfied' : 'Blocking'}
                heavy={!c.satisfied}
                icon={!c.satisfied ? <Icon name="warning" label="Blocking" /> : null}
              />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Wizard({ session, params }) {
  const { route } = useLocation();
  const step = params.step;

  const [lot, setLot] = useState(read('lot'));
  const [recipient, setRecipient] = useState(read('recipient'));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState(null);
  const [password, setPassword] = useState('');

  useEffect(() => { write('lot', lot); }, [lot]);
  useEffect(() => { write('recipient', recipient); }, [recipient]);

  const lots = useAsync(() => api('/lots'), []);
  const customers = useAsync(() => api('/customers'), []);
  const preview = useAsync(
    () => (lot ? api('/certificates/preview', { method: 'POST', body: { lot, recipient: recipient || null } }) : Promise.resolve(null)),
    [lot, recipient, step]
  );

  async function sign(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api('/certificates', { body: { lot, recipient, password } });
      setSigned(r);
      setPassword('');
      write('lot', ''); write('recipient', '');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const p = preview.data;
  const cust = (customers.data || []).find((c) => c.reference === recipient);

  if (signed) {
    return (
      <div class="page">
        <div class="console-head">
          <p class="t-eyebrow">Console · Certificates</p>
          <h1 class="t-h3">Signed</h1>
        </div>
        <div class="banner" role="status">
          <p class="t-eyebrow">Issued</p>
          <p>
            <strong>Certificate <span class="mono">{signed.number}</span> was signed and issued to{' '}
            {signed.recipient_name}.</strong>
          </p>
          <p style="margin-bottom:0">
            The recipient has been notified by mail carrying the number, the claim type, the
            percentage and the permitted statement.
          </p>
        </div>
        <p class="row">
          <a class="btn" href={`/console/certificates/${signed.number}`}>Open the certificate</a>
          <a class="btn btn-quiet" href="/console/certificates">The register</a>
        </p>
      </div>
    );
  }

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Certificates · New</p>
        <h1 class="t-h3">Sign a certificate</h1>
        <p class="t-big">
          Four steps, each at its own address, and each showing the eight conditions as they stand.
        </p>
      </div>

      <SchemeBanner />

      <ol class="steps">
        {STEPS.map(([k, label], i) => (
          <li key={k}>
            <a
              class="step"
              href={`/console/certificates/new/${k}`}
              aria-current={step === k ? 'step' : undefined}
            >
              {i + 1}. {label}
            </a>
          </li>
        ))}
      </ol>

      <Refusal error={error} />

      {step === 'lot' ? (
        <section aria-labelledby="s1">
          <h2 id="s1" class="t-h4">Step one — choose the lot</h2>
          {lots.loading ? <Loading what="the lots" /> : null}
          {lots.data && lots.data.length === 0 ? <Empty>No lot has been produced yet.</Empty> : null}
          {lots.data ? (
            <div class="table-scroll">
              <table>
                <caption>Every lot, with the facts that decide whether it can be signed against.</caption>
                <thead>
                  <tr>
                    <th scope="col">Choose</th>
                    <th scope="col">Lot</th>
                    <th scope="col">Site</th>
                    <th scope="col" class="num">Mass</th>
                    <th scope="col">Disposition</th>
                    <th scope="col">Claim</th>
                    <th scope="col">Held by</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.data.map((l) => (
                    <tr key={l.reference}>
                      <td>
                        <label style="display:flex;gap:0.5rem;align-items:center">
                          <input
                            type="radio" name="lot" value={l.reference}
                            checked={lot === l.reference}
                            style="width:auto"
                            onChange={() => setLot(l.reference)}
                          />
                          <span class="visually-hidden">Choose {l.reference}</span>
                        </label>
                      </td>
                      <th scope="row" class="mono">
                        <a href={`/console/lots/${l.reference}`}>{l.reference}</a>
                      </th>
                      <td class="mono">{l.site}</td>
                      <td class="num">{l.mass_g.toLocaleString('en-GB')}</td>
                      <td><StateWord word={words(l.disposition)} heavy={l.disposition !== 'released'} /></td>
                      <td><ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} compact /></td>
                      <td>
                        {l.open_deviation_count ? <StateWord word="Deviation open" heavy /> : null}
                        {l.unreviewed_override_count ? <StateWord word="Override unreviewed" heavy /> : null}
                        {!l.open_deviation_count && !l.unreviewed_override_count ? (
                          <span class="t-small" style="color:var(--muted)">nothing</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p class="row" style="margin-top:1.5rem">
            <a class="btn" href="/console/certificates/new/claim" aria-disabled={!lot}>
              Continue to the claim <span class="btn-arrow" aria-hidden="true">→</span>
            </a>
          </p>
        </section>
      ) : null}

      {step === 'claim' ? (
        <section aria-labelledby="s2">
          <h2 id="s2" class="t-h4">Step two — the claim this lot carries</h2>
          {!lot ? <Empty>No lot is chosen. <a href="/console/certificates/new/lot">Choose one first.</a></Empty> : null}
          {preview.loading ? <Loading what="the claim" /> : null}
          {p ? (
            <dl class="def">
              <dt>Lot</dt><dd class="mono">{p.lot}</dd>
              <dt>Site</dt><dd class="mono">{p.site}</dd>
              <dt>Grade</dt><dd class="mono">{p.grade}</dd>
              <dt>Recycled content</dt>
              <dd><ContentFigure content_bp={p.content_bp} claim_type={p.claim_type} /></dd>
              <dt>Category split</dt>
              <dd class="mono">
                post-consumer {grams(p.category_split.post_consumer)} · pre-consumer {grams(p.category_split.pre_consumer)}
              </dd>
              <dt>Balance period</dt>
              <dd class="mono">{p.period ? <a href={`/console/balance/${p.period}`}>{p.period}</a> : '—'}</dd>
              <dt>Conversion factor</dt>
              <dd>{p.provisional_factor ? <StateWord word="Provisional" heavy /> : <StateWord word="Derived" />}</dd>
              <dt>Carbon</dt>
              <dd><CarbonFigure carbon={p.carbon} /></dd>
              <dt>Energy</dt>
              <dd>
                {p.carbon ? (
                  <EnergyPair
                    location={p.carbon.energy_location_mg_per_kg}
                    market={p.carbon.energy_market_mg_per_kg}
                  />
                ) : '—'}
              </dd>
            </dl>
          ) : null}
          <p class="row" style="margin-top:1.5rem">
            <a class="btn btn-quiet" href="/console/certificates/new/lot">Back</a>
            <a class="btn" href="/console/certificates/new/recipient">
              Continue to the recipient <span class="btn-arrow" aria-hidden="true">→</span>
            </a>
          </p>
        </section>
      ) : null}

      {step === 'recipient' ? (
        <section aria-labelledby="s3">
          <h2 id="s3" class="t-h4">Step three — the recipient</h2>
          {customers.loading ? <Loading what="the customers" /> : null}
          {customers.data ? (
            <div class="table-scroll">
              <table>
                <caption>The recipient files this certificate with their own regulator.</caption>
                <thead>
                  <tr>
                    <th scope="col">Choose</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Holds</th>
                    <th scope="col">Application</th>
                    <th scope="col">Industry</th>
                    <th scope="col">Language</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.data.map((c) => (
                    <tr key={c.reference}>
                      <td>
                        <label style="display:flex;gap:0.5rem;align-items:center">
                          <input
                            type="radio" name="recipient" value={c.reference}
                            checked={recipient === c.reference}
                            style="width:auto"
                            onChange={() => setRecipient(c.reference)}
                          />
                          <span class="visually-hidden">Choose {c.name}</span>
                        </label>
                      </td>
                      <th scope="row">{c.name} <span class="mono t-small">({c.reference})</span></th>
                      <td class="mono">{c.holds_specification_version || '—'}</td>
                      <td>{c.application}</td>
                      <td>{c.industry}</td>
                      <td class="mono">{c.language}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p class="row" style="margin-top:1.5rem">
            <a class="btn btn-quiet" href="/console/certificates/new/claim">Back</a>
            <a class="btn" href="/console/certificates/new/review">
              Continue to review <span class="btn-arrow" aria-hidden="true">→</span>
            </a>
          </p>
        </section>
      ) : null}

      {step === 'review' ? (
        <section aria-labelledby="s4">
          <h2 id="s4" class="t-h4">Step four — the exact document that will be signed</h2>
          {!lot || !recipient ? (
            <Empty>
              A lot and a recipient are both needed.{' '}
              <a href="/console/certificates/new/lot">Start at step one.</a>
            </Empty>
          ) : null}
          {p ? (
            <>
              <p class="banner">
                <strong>
                  {cust ? cust.name : 'The recipient'} will file this document with a regulator.
                </strong>{' '}
                Sign what they will read rather than a form that generates it.
              </p>
              <div class="doc" aria-label="The document that will be signed">
{`RAVEL MATERIALS SAS
RECYCLED CONTENT AND CARBON CERTIFICATE

Site                   ${p.site}
Grade                  ${p.grade}
Scheme                 RCS-2026
Producer registration  REG-RAVEL-0042
Balance period         ${p.period || '—'}
Recipient              ${cust ? cust.name : '—'} (${recipient || '—'})

CLAIM TYPE             ${p.claim_type}
RECYCLED CONTENT       ${(p.content_bp / 100).toFixed(2)} per cent (${p.content_bp} basis points)
  post-consumer        ${p.category_split.post_consumer} g
  pre-consumer         ${p.category_split.pre_consumer} g
${p.provisional_factor ? '  conversion factor    provisional\n' : ''}
CARBON
  value                ${p.carbon ? p.carbon.value_mg_per_kg : '—'} mg CO2e per kg
  boundary             ${p.carbon ? p.carbon.boundary : '—'}
  method version       ${p.carbon ? p.carbon.method_version : '—'}
  uncertainty          ${p.carbon ? p.carbon.uncertainty_bp : '—'} basis points
  primary data share   ${p.carbon ? p.carbon.primary_share_bp : '—'} basis points
  energy, location     ${p.carbon ? p.carbon.energy_location_mg_per_kg : '—'} mg CO2e per kg
  energy, market       ${p.carbon ? p.carbon.energy_market_mg_per_kg : '—'} mg CO2e per kg

PERMITTED STATEMENT
${p.permitted_statement}

PROHIBITED STATEMENT
${p.prohibited_statement}

Verify this certificate at ravel.example.com/verify/{number}.`}
              </div>
              <div class="sheet permitted-statement" style="margin-top:1.5rem">
                <p class="t-eyebrow">The permitted downstream statement</p>
                <p class="t-big">{p.permitted_statement}</p>
              </div>
              <div class="sheet prohibited-statement" style="margin-top:1rem">
                <p class="t-eyebrow">Its counterpart</p>
                <p class="t-big">{p.prohibited_statement}</p>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <Conditions conditions={p ? p.conditions : null} />

      {step === 'review' && p ? (
        <section aria-labelledby="sign" class="sheet" style="margin-top:2.5rem">
          <h2 id="sign" class="t-h4">Sign</h2>
          <p>
            Signing is a separate, deliberate act. It re-authenticates: your session alone is not a
            signing credential. The eight conditions are decided again on the server at this moment,
            and a lot that has since gained an open deviation is refused with the condition named.
          </p>
          <form onSubmit={sign}>
            <div class="field">
              <label class="t-label" for="pw">Confirm your identity — your password</label>
              <input
                id="pw" type="password" autocomplete="current-password" required
                value={password} onInput={(e) => setPassword(e.target.value)}
              />
            </div>
            <p style="margin-top:1.25rem;margin-bottom:0">
              <button class="btn" type="submit" disabled={busy || !p.all_satisfied}>
                {busy ? 'Signing…' : 'Sign this certificate'} <span class="btn-arrow" aria-hidden="true">→</span>
              </button>
            </p>
            {!p.all_satisfied ? (
              <p class="t-small" style="margin-top:0.75rem;color:var(--muted)">
                Signing is unavailable while a condition is unsatisfied. Nothing on this screen
                dismisses a condition; the record above it has to change.
              </p>
            ) : null}
          </form>
        </section>
      ) : null}
    </div>
  );
}
