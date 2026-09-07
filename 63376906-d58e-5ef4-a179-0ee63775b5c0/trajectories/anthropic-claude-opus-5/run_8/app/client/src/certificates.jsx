import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { api, useApi, basisPoints, grams, words } from './api.js';
import {
  CarbonFigure, ContentFigure, DefRow, Empty, Icon, Loading, Refusal, StateWord, Table,
} from './components.jsx';
import { Meta } from './public.jsx';
import { Head, SchemeBanner } from './console.jsx';

const DRAFT = 'ravel.certificate.draft';
const readDraft = () => {
  try { return JSON.parse(sessionStorage.getItem(DRAFT) || '{}'); } catch { return {}; }
};
const writeDraft = (d) => sessionStorage.setItem(DRAFT, JSON.stringify(d));

const STEPS = [
  { key: 'lot', label: '1. Lot', path: '/console/certificates/new/lot' },
  { key: 'claim', label: '2. Claim', path: '/console/certificates/new/claim' },
  { key: 'recipient', label: '3. Recipient', path: '/console/certificates/new/recipient' },
  { key: 'review', label: '4. Review and sign', path: '/console/certificates/new/review' },
];

const CONDITION_WORDS = {
  lot_released: 'The lot is released',
  no_open_deviation: 'No deviation touching it is open',
  no_unreviewed_override: 'No override on it is unreviewed',
  period_closed: 'The bookkeeping period is closed',
  balance_invariant_holds: 'The balance invariant holds with the allocation applied',
  carbon_figure_complete: 'The carbon figure exists with all four components',
  signer_holds_scope: 'The signer holds signing scope for that site on the date of signing',
  signer_did_not_enter_data: 'The signer did not enter its data',
};

function Steps({ current }) {
  return (
    <nav class="wizard-steps" aria-label="Certificate steps">
      {STEPS.map((s) => (
        <a key={s.key} href={s.path} aria-current={s.key === current ? 'step' : undefined}>{s.label}</a>
      ))}
    </nav>
  );
}

// The eight conditions, as eight statements, each either satisfied or naming
// exactly what blocks it. No control on this screen dismisses one.
function Conditions({ conditions }) {
  if (!conditions) return null;
  return (
    <section aria-labelledby="conditions">
      <h2 class="h4" id="conditions">The eight conditions</h2>
      <p class="body-small measure" style="margin-top:0.5rem">
        These are decided on the server, none is waivable, and the same eight are decided
        again at the moment of signing rather than as they stood here.
      </p>
      <div style="margin-top:1rem">
        {conditions.map((c) => (
          <div class="condition-row" key={c.condition}>
            <div>
              <StateWord strong={!c.satisfied}>{c.satisfied ? 'Satisfied' : 'Blocking'}</StateWord>
            </div>
            <div>
              <p class="body-small" style="margin:0 0 0.25rem"><strong>{CONDITION_WORDS[c.condition] || words(c.condition)}</strong></p>
              <p class="body-small" style="margin:0">{c.detail}</p>
            </div>
            <div>
              {!c.satisfied && c.resolve_route && (
                <a class="body-small" href={c.resolve_route}>
                  {c.blocking_reference || 'The record that would resolve it'} <span class="arrow">→</span>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function usePreview(draft) {
  const [state, setState] = useState({ loading: false, data: null, error: null });
  useEffect(() => {
    if (!draft.lot) { setState({ loading: false, data: null, error: null }); return; }
    setState({ loading: true, data: null, error: null });
    api('/certificates/preview', { method: 'POST', body: { lot: draft.lot, recipient: draft.recipient } })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }));
  }, [draft.lot, draft.recipient]);
  return state;
}

export function WizardLot() {
  const lots = useApi('/lots');
  const [draft, setDraft] = useState(readDraft());
  const preview = usePreview(draft);
  const choose = (lot) => { const d = { ...draft, lot }; setDraft(d); writeDraft(d); };
  return (
    <>
      <Meta title="Sign a certificate: the lot — Ravel" description="Choose the lot." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Certificate" title="Choose the lot" />
        <Steps current="lot" />
        {lots.loading && <Loading what="the lots" />}
        {lots.error && <Refusal error={lots.error} title="The lots could not be read" />}
        {lots.data && lots.data.length === 0 && <Empty>No lot has been produced.</Empty>}
        {lots.data && lots.data.length > 0 && (
          <div class="grid grid-3">
            {lots.data.map((l) => (
              <button
                type="button"
                class="card"
                key={l.reference}
                onClick={() => choose(l.reference)}
                aria-pressed={draft.lot === l.reference}
                style={`text-align:left;cursor:pointer;border:${draft.lot === l.reference ? '2px solid currentColor' : '1px solid transparent'}`}
              >
                <p class="mono" style="margin:0 0 0.35rem">{l.reference}</p>
                <p class="label" style="margin:0 0 0.5rem">{l.site} · {l.grade} · {grams(l.mass_g)}</p>
                <p class="body-small" style="margin:0 0 0.5rem">
                  <ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} compact />
                </p>
                <p style="margin:0;display:flex;gap:0.35rem;flex-wrap:wrap">
                  <StateWord>{words(l.disposition)}</StateWord>
                  {draft.lot === l.reference && <StateWord>Chosen</StateWord>}
                </p>
              </button>
            ))}
          </div>
        )}
        {draft.lot && (
          <>
            <hr class="rule" />
            {preview.loading && <Loading what="the conditions" />}
            {preview.error && <Refusal error={preview.error} title="The conditions could not be read" />}
            {preview.data && <Conditions conditions={preview.data.conditions} />}
            <p style="margin-top:2rem">
              <a class="btn btn-primary" href="/console/certificates/new/claim">
                Next: the claim <span class="arrow">→</span>
              </a>
            </p>
          </>
        )}
      </div>
    </>
  );
}

export function WizardClaim() {
  const [draft] = useState(readDraft());
  const preview = usePreview(draft);
  const p = preview.data;
  return (
    <>
      <Meta title="Sign a certificate: the claim — Ravel" description="The claim this certificate will carry." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Certificate" title="The claim" />
        <Steps current="claim" />
        {!draft.lot && <Empty>No lot has been chosen. Start at <a href="/console/certificates/new/lot">the first step</a>.</Empty>}
        {preview.loading && <Loading what="the claim" />}
        {preview.error && <Refusal error={preview.error} title="The claim could not be read" />}
        {p && (
          <>
            <dl class="def">
              <DefRow term="Lot"><a class="mono" href={`/console/lots/${p.lot}`}>{p.lot}</a></DefRow>
              <DefRow term="Site"><span class="mono">{p.site}</span></DefRow>
              <DefRow term="Mass">{grams(p.mass_g)}</DefRow>
              <DefRow term="Recycled content">
                <ContentFigure content_bp={p.content_bp} claim_type={p.claim_type} />
              </DefRow>
              <DefRow term="Category split">
                post-consumer {grams(p.category_split.post_consumer)}, pre-consumer{' '}
                {grams(p.category_split.pre_consumer)}
              </DefRow>
              <DefRow term="Bookkeeping period"><a class="mono" href={`/console/balance/${p.period}`}>{p.period}</a></DefRow>
              <DefRow term="Carbon"><CarbonFigure carbon={p.carbon} /></DefRow>
              <DefRow term="Conversion factor">
                {p.provisional_factor
                  ? <><StateWord strong>Provisional</StateWord> This certificate will say so.</>
                  : 'derived from a stated window'}
              </DefRow>
            </dl>
            <p class="body-small" style="margin-top:1rem">
              Every figure here is computed from the ledger and the versioned methods. No
              control on this screen sets one.
            </p>
            <hr class="rule" />
            <Conditions conditions={p.conditions} />
            <p style="margin-top:2rem">
              <a class="btn btn-primary" href="/console/certificates/new/recipient">
                Next: the recipient <span class="arrow">→</span>
              </a>
            </p>
          </>
        )}
      </div>
    </>
  );
}

export function WizardRecipient() {
  const customers = useApi('/customers');
  const [draft, setDraft] = useState(readDraft());
  const preview = usePreview(draft);
  const choose = (recipient) => { const d = { ...draft, recipient }; setDraft(d); writeDraft(d); };
  return (
    <>
      <Meta title="Sign a certificate: the recipient — Ravel" description="Choose the recipient." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Certificate" title="The recipient" />
        <Steps current="recipient" />
        {!draft.lot && <Empty>No lot has been chosen. Start at <a href="/console/certificates/new/lot">the first step</a>.</Empty>}
        {customers.loading && <Loading what="the customers" />}
        {customers.data && customers.data.length === 0 && <Empty>No customer is registered.</Empty>}
        {customers.data && customers.data.length > 0 && (
          <div class="grid grid-2">
            {customers.data.map((c) => (
              <button
                type="button"
                class="card"
                key={c.reference}
                onClick={() => choose(c.reference)}
                aria-pressed={draft.recipient === c.reference}
                style={`text-align:left;cursor:pointer;border:${draft.recipient === c.reference ? '2px solid currentColor' : '1px solid transparent'}`}
              >
                <p class="mono" style="margin:0 0 0.35rem">{c.reference}</p>
                <p class="h4" style="margin:0 0 0.35rem">{c.name}</p>
                <p class="body-small" style="margin:0">
                  {c.application} · {c.industry} · holds specification version{' '}
                  {c.holds_specification_version} · statements in{' '}
                  {c.language === 'fr' ? 'French' : 'English'}
                </p>
                {draft.recipient === c.reference && (
                  <p style="margin:0.5rem 0 0"><StateWord>Chosen</StateWord></p>
                )}
              </button>
            ))}
          </div>
        )}
        {preview.data && (
          <>
            <hr class="rule" />
            <h2 class="h4">The statements this recipient will read</h2>
            {draft.recipient ? (
              <div class="card" style="margin-top:1rem">
                <p class="eyebrow eyebrow-ink">Permitted</p>
                <p class="body-regular permitted-statement">{preview.data.permitted_statement}</p>
                <p class="eyebrow eyebrow-ink">Prohibited</p>
                <p class="body-regular">{preview.data.prohibited_statement}</p>
              </div>
            ) : (
              <Empty>Choose a recipient above and the statements they will read appear here, in their own language.</Empty>
            )}
            <hr class="rule" />
            {/* Each of the four steps shows the eight conditions as they stand. */}
            <Conditions conditions={preview.data.conditions} />
            <p style="margin-top:2rem">
              <a class="btn btn-primary" href="/console/certificates/new/review">
                Next: review and sign <span class="arrow">→</span>
              </a>
            </p>
          </>
        )}
      </div>
    </>
  );
}

export function WizardReview() {
  const { route } = useLocation();
  const [draft] = useState(readDraft());
  const preview = usePreview(draft);
  const [password, setPassword] = useState('');
  const [state, setState] = useState({ status: 'idle', error: null, result: null });
  const p = preview.data;

  const sign = async (e) => {
    e.preventDefault();
    setState({ status: 'signing', error: null, result: null });
    try {
      const result = await api('/certificates', {
        method: 'POST',
        body: { lot: draft.lot, recipient: draft.recipient, password },
      });
      setState({ status: 'signed', error: null, result });
      sessionStorage.removeItem(DRAFT);
      route(`/console/certificates/${result.number}`);
    } catch (error) {
      setState({ status: 'refused', error, result: null });
    }
  };

  return (
    <>
      <Meta title="Sign a certificate: review — Ravel" description="The exact document that will be signed." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Certificate" title="Review and sign" />
        <Steps current="review" />
        {!draft.lot && <Empty>No lot has been chosen. Start at <a href="/console/certificates/new/lot">the first step</a>.</Empty>}
        {preview.loading && <Loading what="the document" />}
        {preview.error && <Refusal error={preview.error} title="The document could not be prepared" />}
        {p && (
          <>
            <Conditions conditions={p.conditions} />
            <hr class="rule" />
            <h2 class="h4">The exact document that will be signed</h2>
            <p class="body-small measure" style="margin-top:0.5rem">
              The recipient will file this document with a regulator. Read it as they will
              read it, not as a form that generates it.
            </p>
            <div class="doc-preview" tabindex="0" role="region" aria-label="The document that will be signed" style="margin-top:1rem">
{`RAVEL MATERIALS SAS
RECYCLED CONTENT AND CARBON CERTIFICATE

CERTIFICATE
Number: issued from the ${p.site} sequence at the moment of signing
Site: ${p.site}
Scheme: RCS-2026
Producer registration: REG-RAVEL-0042

CLAIM TYPE
${p.claim_type}

RECYCLED CONTENT
${basisPoints(p.content_bp)} (${p.content_bp} basis points), claim type ${p.claim_type}
Post-consumer: ${p.category_split.post_consumer} g
Pre-consumer: ${p.category_split.pre_consumer} g

MATERIAL
Grade: ${p.grade}
Lot ${p.lot}: ${p.mass_g} g
Bookkeeping period: ${p.period}

CARBON
Value: ${p.carbon?.value_mg_per_kg} mg CO2e per kg
Boundary: ${p.carbon?.boundary}
Method version: ${p.carbon?.method_version_label}
Uncertainty: ${p.carbon?.uncertainty_bp} basis points
Primary data share: ${p.carbon?.primary_share_bp} basis points
Comparator: ${p.carbon?.comparator?.material}, ${p.carbon?.comparator?.dataset}, ${p.carbon?.comparator?.dataset_year}, ${p.carbon?.comparator?.region}
The breakdown is attached to this certificate as a separate schedule.
${p.provisional_factor ? '\nThis certificate rests on a provisional conversion factor.\n' : ''}
RECIPIENT
${p.recipient_name || 'no recipient chosen'}

PERMITTED STATEMENT
${p.permitted_statement}

PROHIBITED STATEMENT
${p.prohibited_statement}

VERIFICATION
Verify this certificate at ravel.example.com/verify/{number}.`}
            </div>

            <hr class="rule" />
            <h2 class="h4">Sign</h2>
            <p class="body-small measure">
              Signing is a separate, deliberate act. The recipient will file this document
              with a regulator. Your identity is confirmed at this moment: a session alone is
              not a signing credential, so the signing act carries your password again.
            </p>
            <Refusal error={state.status === 'refused' ? state.error : null} title="Signing was refused" />
            <form onSubmit={sign} class="card stack" style="margin-top:1rem">
              <div>
                <label class="label" for="signing-password">Confirm your password to sign</label>
                <input id="signing-password" type="password" autocomplete="current-password"
                  value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
              </div>
              <div>
                <button class="btn btn-primary" type="submit"
                  disabled={state.status === 'signing' || !p.all_satisfied || !draft.recipient}>
                  {state.status === 'signing' ? 'Signing…' : 'Sign this certificate'} <span class="arrow">→</span>
                </button>
                {!p.all_satisfied && (
                  <p class="body-small" style="margin:0.75rem 0 0">
                    One or more of the eight conditions is unsatisfied, and no control on this
                    screen dismisses it. Resolve the record it names.
                  </p>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </>
  );
}

export function Certificates() {
  const certs = useApi('/certificates');
  return (
    <>
      <Meta title="Certificates — Ravel" description="The certificate register." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Console" title="Certificates">
          <p>An issued certificate is immutable. A withdrawal is never a deletion and the
          document stays readable at its address.</p>
        </Head>
        <p style="margin-bottom:1.5rem">
          <a class="btn btn-primary" href="/console/certificates/new/lot">
            Sign a certificate <span class="arrow">→</span>
          </a>
        </p>
        {certs.loading && <Loading what="the certificate register" />}
        {certs.error && <Refusal error={certs.error} title="The register could not be read" />}
        {certs.data && (
          <Table
            caption="Certificate register"
            columns={[
              { key: 'num', label: 'Number', render: (x) => <a class="mono" href={`/console/certificates/${x.number}`}>{x.number}</a> },
              {
                key: 'state',
                label: 'State',
                render: (x) => (x.state === 'withdrawn'
                  ? <StateWord strong>Withdrawn</StateWord>
                  : <StateWord>{words(x.state)}</StateWord>),
              },
              { key: 'site', label: 'Site', render: (x) => <span class="mono">{x.site}</span> },
              { key: 'recipient', label: 'Recipient', render: (x) => x.recipient_name },
              { key: 'content', label: 'Recycled content', render: (x) => <ContentFigure content_bp={x.content_bp} claim_type={x.claim_type} compact /> },
              { key: 'issued', label: 'Issued on', render: (x) => <span class="mono">{x.issued_on}</span> },
              { key: 'signer', label: 'Signer', render: (x) => x.signer_name },
              {
                key: 'prov',
                label: 'Factor',
                render: (x) => (x.provisional_factor ? <StateWord strong>Provisional</StateWord> : <StateWord>Derived</StateWord>),
              },
            ]}
            rows={certs.data.map((x) => ({ ...x, key: x.number }))}
            empty="No certificate has been signed."
          />
        )}
      </div>
    </>
  );
}

export function CertificateDetail() {
  const { params } = useRoute();
  const number = params.number;
  const [reload, setReload] = useState(0);
  const cert = useApi(`/certificates/${number}`, [number, reload]);
  const preview = useApi(`/certificates/${number}/withdrawal-preview`, [number, reload]);
  const replay = useApi(`/certificates/${number}/replay`, [number, reload]);
  const [doc, setDoc] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState('');
  const [state, setState] = useState({ status: 'idle', error: null, result: null });
  const x = cert.data;

  useEffect(() => {
    fetch(`/api/certificates/${number}/document`).then((r) => r.text()).then(setDoc).catch(() => setDoc(null));
  }, [number, reload]);

  const confirmWithdraw = async (e) => {
    e.preventDefault();
    setState({ status: 'withdrawing', error: null, result: null });
    try {
      const result = await api(`/certificates/${number}/withdraw`, { method: 'POST', body: { reason } });
      setState({ status: 'withdrawn', error: null, result });
      setWithdrawing(false);
      setReload((n) => n + 1);
    } catch (error) {
      setState({ status: 'refused', error, result: null });
    }
  };

  return (
    <>
      <Meta title={`${number} — Ravel`} description="One issued certificate." noindex />
      <div class="page">
        <Head eyebrow="Certificate" title={number} />
        {cert.loading && <Loading what="the certificate" />}
        {cert.error && <Refusal error={cert.error} title="The certificate could not be read" />}
        {x && (
          <>
            {x.state === 'withdrawn' && (
              <div class="banner" style="margin-bottom:1.5rem" role="status">
                <p class="eyebrow eyebrow-ink"><StateWord strong>Withdrawn</StateWord></p>
                <p class="body-small" style="margin:0">
                  This certificate was withdrawn on {x.withdrawal?.withdrawn_on}. Reason:{' '}
                  {x.withdrawal?.reason}. It was withdrawn by{' '}
                  <span class="mono">{x.withdrawal?.withdrawn_by}</span>. The document stays
                  readable at its address.
                </p>
              </div>
            )}
            <dl class="def">
              <DefRow term="State">{words(x.state)}</DefRow>
              <DefRow term="Version">{x.version}</DefRow>
              <DefRow term="Site"><span class="mono">{x.site}</span></DefRow>
              <DefRow term="Lots">
                {x.lots.map((l) => (
                  <span key={l.reference}>
                    <a class="mono" href={`/console/lots/${l.reference}`}>{l.reference}</a> {grams(l.mass_g)}{' '}
                  </span>
                ))}
              </DefRow>
              <DefRow term="Grade"><span class="mono">{x.grade}</span></DefRow>
              <DefRow term="Specification version"><span class="mono">SPEC-{x.grade} v{x.specification_version}</span></DefRow>
              <DefRow term="Recycled content"><ContentFigure content_bp={x.content_bp} claim_type={x.claim_type} /></DefRow>
              <DefRow term="Category split">
                post-consumer {grams(x.category_split.post_consumer)}, pre-consumer{' '}
                {grams(x.category_split.pre_consumer)}
              </DefRow>
              <DefRow term="Period"><a class="mono" href={`/console/balance/${x.period}`}>{x.period}</a></DefRow>
              <DefRow term="Carbon"><CarbonFigure carbon={x.carbon} /></DefRow>
              <DefRow term="Primary data share">{basisPoints(x.primary_share_bp)}</DefRow>
              <DefRow term="Scheme"><span class="mono">{x.scheme}</span> · registration <span class="mono">{x.registration}</span></DefRow>
              <DefRow term="Signer">{x.signer_name} <span class="mono">({x.signer})</span></DefRow>
              <DefRow term="Signed at"><span class="mono">{x.signed_at}</span></DefRow>
              <DefRow term="Recipient">{x.recipient_name}</DefRow>
              <DefRow term="Verification"><a href={`/verify/${x.number}`}>Verify this certificate at ravel.example.com/verify/{x.number}.</a></DefRow>
              <DefRow term="Conversion factor">
                {x.provisional_factor
                  ? <><StateWord strong>Provisional</StateWord> This certificate rests on a provisional conversion factor.</>
                  : 'derived from a stated window'}
              </DefRow>
            </dl>

            <h2 class="h4" style="margin-top:2rem">The statements</h2>
            <div class="card">
              <p class="eyebrow eyebrow-ink">Permitted</p>
              <p class="body-regular permitted-statement">{x.permitted_statement}</p>
              <p class="eyebrow eyebrow-ink">Prohibited</p>
              <p class="body-regular">{x.prohibited_statement}</p>
            </div>

            {x.internal && (
              <>
                <h2 class="h4" style="margin-top:2rem">The internal view</h2>
                {x.internal.deviations.length === 0
                  ? <Empty>No deviation touches the lots behind this certificate.</Empty>
                  : (
                    <Table
                      caption="Deviations touching these lots"
                      columns={[
                        { key: 'ref', label: 'Deviation', render: (d) => <span class="mono">{d.reference}</span> },
                        { key: 'state', label: 'State', render: (d) => <StateWord strong={d.state === 'open'}>{words(d.state)}</StateWord> },
                        { key: 'outcome', label: 'Outcome', render: (d) => (d.outcome ? words(d.outcome) : 'none yet') },
                      ]}
                      rows={x.internal.deviations.map((d) => ({ ...d, key: d.reference }))}
                      empty="No deviation touches these lots."
                    />
                  )}
                <h3 class="h4" style="margin-top:1.5rem">The carbon breakdown behind the figure</h3>
                <Table
                  caption="Carbon breakdown"
                  columns={[
                    { key: 'line', label: 'Line', render: (r) => words(r.line) },
                    { key: 'v', label: 'mg CO₂e/kg', numeric: true, render: (r) => r.mg_per_kg.toLocaleString('en-GB') },
                    { key: 'tag', label: 'Data', render: (r) => <StateWord>{words(r.tag)}</StateWord> },
                  ]}
                  rows={(x.internal.carbon_breakdown || []).map((r) => ({ ...r, key: r.line }))}
                  empty="No breakdown is attached to this figure."
                />
              </>
            )}

            {replay.data && (
              <>
                <h2 class="h4" style="margin-top:2rem">Replay</h2>
                {replay.data.reproducible === false ? (
                  <div class="banner">
                    <p class="eyebrow eyebrow-ink"><StateWord strong>Not reproducible</StateWord></p>
                    <p class="body-small" style="margin:0">{replay.data.reason}</p>
                  </div>
                ) : (
                  <>
                    {/* Agreement and disagreement render at identical weight. */}
                    <p class="body-regular">
                      {replay.data.agrees
                        ? 'The recomputation agrees with what this certificate says.'
                        : `The recomputation differs from what this certificate says, on ${words(replay.data.differing_input?.field)}.`}
                    </p>
                    <Table
                      caption="Replay"
                      columns={[
                        { key: 'field', label: 'Figure', render: (r) => words(r.field) },
                        { key: 'issued', label: 'What the certificate says', numeric: true, render: (r) => String(r.issued) },
                        { key: 'now', label: 'What recomputation says now', numeric: true, render: (r) => String(r.recomputed) },
                      ]}
                      rows={Object.keys(replay.data.issued).map((k) => ({
                        key: k, field: k, issued: replay.data.issued[k], recomputed: replay.data.recomputed[k],
                      }))}
                      empty="Nothing was recomputed."
                    />
                    {replay.data.differing_input && (
                      <p class="body-small" style="margin-top:1rem">
                        The input that moved: <span class="mono">{replay.data.differing_input.input}</span>.
                      </p>
                    )}
                    <h3 class="h4" style="margin-top:1.5rem">Input versions</h3>
                    <dl class="def">
                      {Object.entries(replay.data.input_versions).map(([k, v]) => (
                        <DefRow term={words(k)} key={k}><span class="mono">{v || 'none'}</span></DefRow>
                      ))}
                    </dl>
                  </>
                )}
              </>
            )}

            <h2 class="h4" style="margin-top:2rem">The document</h2>
            {doc === null ? <Loading what="the document" /> : (
              <div class="doc-preview" tabindex="0" role="region" aria-label={`The document for ${number}`}>{doc}</div>
            )}
            <p style="margin-top:1rem">
              <a class="btn" href={`/api/certificates/${number}/document`}>
                Open the plain-text document <span class="arrow">→</span>
              </a>
            </p>

            {x.state !== 'withdrawn' && (
              <>
                <hr class="rule" />
                <h2 class="h4">Withdraw this certificate</h2>
                {!withdrawing && (
                  <p style="margin-top:1rem">
                    <button class="btn" onClick={() => setWithdrawing(true)}>
                      Begin a withdrawal <span class="arrow">→</span>
                    </button>
                  </p>
                )}
                {withdrawing && preview.data && (
                  <>
                    <p class="body-small measure" style="margin-top:1rem">
                      A withdrawal is one action with five consequences. Before you confirm,
                      these are the people who will be notified and the statements that
                      become void — by name, not as a count.
                    </p>
                    <h3 class="h4" style="margin-top:1.5rem">The five consequences</h3>
                    <ol>
                      {preview.data.consequences.map((c) => <li key={c} class="body-small">{c}</li>)}
                    </ol>
                    <h3 class="h4" style="margin-top:1.5rem">Recipients who will be notified</h3>
                    <ul>
                      {preview.data.notified_recipients.map((r) => (
                        <li key={r.reference} class="body-small">
                          {r.name} <span class="mono">({r.email})</span>
                        </li>
                      ))}
                    </ul>
                    <h3 class="h4" style="margin-top:1.5rem">Statements the recipient must stop making</h3>
                    <ul>
                      {preview.data.void_statements.map((s, i) => <li key={i} class="body-small">{s}</li>)}
                    </ul>
                    <h3 class="h4" style="margin-top:1.5rem">Certificates derived from this one</h3>
                    {preview.data.derived_certificates.length === 0
                      ? <Empty>No certificate is derived from this one.</Empty>
                      : <ul>{preview.data.derived_certificates.map((d) => <li key={d.number} class="mono">{d.number}</li>)}</ul>}
                    <h3 class="h4" style="margin-top:1.5rem">
                      <Icon name="arrow" label="The reverse traversal of the underlying batches" />
                    </h3>
                    {preview.data.batch_traversal.length === 0
                      ? <Empty>No batch traversal reaches another certificate.</Empty>
                      : (
                        <ul>
                          {preview.data.batch_traversal.map((t) => (
                            <li key={t.batch} class="body-small">
                              <span class="mono">{t.batch}</span> reaches{' '}
                              {t.certificates.length === 0 ? 'no certificate' : t.certificates.join(', ')}
                              {t.recipients.length > 0 && `, held by ${t.recipients.map((r) => r.name).join(', ')}`}
                            </li>
                          ))}
                        </ul>
                      )}
                    <Refusal error={state.status === 'refused' ? state.error : null} title="The withdrawal was refused" />
                    <form onSubmit={confirmWithdraw} class="card stack" style="margin-top:1.5rem">
                      <div>
                        <label class="label" for="reason">The reason, which is the only free text on a certificate</label>
                        <textarea id="reason" rows="3" required value={reason}
                          onInput={(e) => setReason(e.currentTarget.value)} />
                      </div>
                      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
                        <button class="btn btn-primary" type="submit" disabled={state.status === 'withdrawing' || !reason}>
                          {state.status === 'withdrawing' ? 'Withdrawing…' : 'Confirm the withdrawal'} <span class="arrow">→</span>
                        </button>
                        <button class="btn btn-quiet" type="button" onClick={() => setWithdrawing(false)}>
                          Do not withdraw
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
