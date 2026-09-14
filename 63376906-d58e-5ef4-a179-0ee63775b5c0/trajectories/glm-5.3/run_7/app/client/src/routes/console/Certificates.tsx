// The certificate wizard: four steps, four addresses, eight conditions each time.
import { useEffect, useState } from 'preact/hooks';
import { api, rawText, fmtDate, ApiError } from '../../lib/api';
import { Loading, Empty, Banner, StateWord, ContentFigure, CarbonFigure } from '../../components/Figures';
import { Link, usePath } from '../../router';
import { SchemeStatusBanner } from '../../components/SchemeStatus';
import type { Me } from '../../lib/api';

type Lot = { reference: string; site: string; grade: string; mass_g: number; disposition: string; claim_type: string; content_bp: number };
type Customer = { reference: string; contact: string; application: string; industry: string };
type Certificate = any;
type Condition = { condition: string; satisfied: boolean; blocking_reference: string | null; statement?: string };

const STEP_PATHS = ['/console/certificates/new/lot', '/console/certificates/new/claim', '/console/certificates/new/recipient', '/console/certificates/new/review'];

export default function Certificates({ user }: { user: Me }) {
  const path = usePath();

  if (path === '/console/certificates/new/lot') return <WizardStep user={user} step={0} />;
  if (path === '/console/certificates/new/claim') return <WizardStep user={user} step={1} />;
  if (path === '/console/certificates/new/recipient') return <WizardStep user={user} step={2} />;
  if (path === '/console/certificates/new/review') return <WizardStep user={user} step={3} />;

  const parts = path.split('/');
  const number = parts.length > 3 && parts[2] === 'certificates' && !parts[3].startsWith('new') ? decodeURIComponent(parts[3]) : null;
  if (number) return <CertificateDetail user={user} number={number} />;

  return <Register user={user} />;
}

function ConditionsList({ conditions }: { conditions: Condition[] }) {
  return (
    <ol class="wizard-conditions">
      {conditions.map((c) => (
        <li key={c.condition}>
          <span class="state">{c.satisfied ? 'satisfied' : 'blocked'}</span>
          <div>
            <p style="margin:0">{c.statement || c.condition}</p>
            {!c.satisfied && c.blocking_reference ? (
              <p class="label" style="margin:0.25rem 0 0">
                Blocking: <Link href={blockingHref(c)} class="mono">{c.blocking_reference}</Link> — the record that would resolve it.
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function blockingHref(c: Condition): string {
  const ref = c.blocking_reference || '';
  if (ref.startsWith('OVR-')) return '/console/record';
  if (ref.startsWith('DEV-')) return '/console/record';
  if (ref.startsWith('BP-')) return '/console/balance/' + ref;
  if (ref.startsWith('LOT-')) return '/console/lots/' + ref;
  if (ref.startsWith('SITE-')) return '/console/collectors';
  return '/console/record';
}

function WizardStep({ user, step }: { user: Me; step: number }) {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [choice, setChoice] = useState(() => {
    try { return { lot: '', recipient: '', ...JSON.parse(window.sessionStorage.getItem('ravel.wizard') || '{}') }; }
    catch { return { lot: '', recipient: '' }; }
  });
  const [preview, setPreview] = useState<any>(null);
  const [document, setDocument] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<any>(null);
  const [password, setPassword] = useState('');
  const [signed, setSigned] = useState<Certificate | null>(null);


  useEffect(() => { api<Lot[]>('/lots').then(setLots).catch(() => setLots([])); }, []);
  useEffect(() => { api<Customer[]>('/customers').then(setCustomers).catch(() => setCustomers([])); }, []);
  useEffect(() => {
    if (choice.lot && choice.recipient) {
      api<any>('/certificates/preview', { method: 'POST', body: { lot: choice.lot, recipient: choice.recipient } })
        .then((p) => { setPreview(p); })
        .catch((e) => setRefusal((e as ApiError).body));
    }
  }, [choice.lot, choice.recipient]);

  const lot = (lots || []).find((l) => l.reference === choice.lot);
  const recipient = (customers || []).find((c) => c.reference === choice.recipient);
  const chosenLot = choice.lot;
  const chosenRecipient = choice.recipient;

  const save = (patch: any) => {
    const next = { lot: patch.lot ?? chosenLot, recipient: patch.recipient ?? chosenRecipient };
    window.sessionStorage.setItem('ravel.wizard', JSON.stringify(next));
    setChoice(next);
    return next;
  };

  const sign = async () => {
    setRefusal(null);
    try {
      const cert = await api<Certificate>('/certificates', {
        method: 'POST',
        body: { lot: chosenLot, recipient: chosenRecipient, password }
      });
      setSigned(cert);
      window.sessionStorage.removeItem('ravel.wizard');
    } catch (e) {
      setRefusal((e as ApiError).body);
    }
  };

  if (signed) {
    return (
      <div class="console-shell">
        <Banner title="Certificate signed">
          <p>Number <span class="mono">{signed.number}</span>. The recipient will file this document with their own regulator. It resolves for ever at <span class="mono">/verify/{signed.number}</span>.</p>
          <p><Link class="button" href={'/console/certificates/' + signed.number}>Open the certificate</Link></p>
        </Banner>
      </div>
    );
  }

  return (
    <div class="console-shell">
      <nav class="label" aria-label="Wizard steps">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ marginRight: '1.25rem', fontWeight: i === step ? 700 : 400 }}>
            {i === step ? <span aria-current="step">Step {i + 1} · {['lot', 'claim', 'recipient', 'review'][i]}</span> : <Link href={STEP_PATHS[i]}>{['lot', 'claim', 'recipient', 'review'][i]}</Link>}
          </span>
        ))}
      </nav>
      <h1>Sign a certificate — step {step + 1} of 4</h1>
      <p class="measure">Each step shows the eight conditions as they stand. None is dismissible from this screen by any control.</p>

      {step === 0 ? (
        <section class="card" style="max-width:44rem">
          <h2>Choose the lot</h2>
          {!lots ? <Loading what="The lots" /> : lots.length === 0 ? <Empty what="lots" /> : (
            <fieldset style="border:none;padding:0">
              <legend class="label">Released lots in your scope</legend>
              {lots.filter((l) => user.sites.includes(l.site)).map((l) => (
                <label key={l.reference} class="field" style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline' }}>
                  <input type="radio" name="lot" checked={chosenLot === l.reference}
                    onChange={() => { const n = save({ lot: l.reference }); setChoice({ lot: n.lot, recipient: n.recipient }); }} />
                  <span><span class="mono">{l.reference}</span> · {l.site} · {l.mass_g.toLocaleString('en-GB')} g · {l.disposition} · <ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} /></span>
                </label>
              ))}
            </fieldset>
          )}
          <p><Link class="button" href={STEP_PATHS[1]} onClick={() => save({})} aria-disabled={!chosenLot}>Next: claim <svg class="arrow" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" focusable="false"><path d="M1 5h11m0 0L8.5 1.5M12 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></Link></p>
        </section>
      ) : null}

      {step === 1 ? (
        <section class="card" style="max-width:44rem">
          <h2>The claim</h2>
          {lot ? (
            <>
              <p>The claim type on this lot is <strong>{lot.claim_type.replace(/_/g, ' ')}</strong> and the content derived from the ledger is <ContentFigure content_bp={lot.content_bp} claim_type={lot.claim_type} />.</p>
              <p>This material is claimed by mass balance. It is not physically segregated.</p>
              <p class="label">You may not state that this material physically contains recycled content.</p>
            </>
          ) : <p class="notice">Choose a lot first at <Link href={STEP_PATHS[0]}>step one</Link>.</p>}
          <p><Link class="button" href={STEP_PATHS[2]}>Next: recipient <svg class="arrow" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" focusable="false"><path d="M1 5h11m0 0L8.5 1.5M12 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></Link></p>
        </section>
      ) : null}

      {step === 2 ? (
        <section class="card" style="max-width:44rem">
          <h2>Choose the recipient</h2>
          {!customers ? <Loading what="The customers" /> : (
            <fieldset style="border:none;padding:0">
              {customers.map((c) => (
                <label key={c.reference} class="field" style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline' }}>
                  <input type="radio" name="recipient" checked={chosenRecipient === c.reference}
                    onChange={() => { const n = save({ recipient: c.reference }); setChoice({ lot: n.lot, recipient: n.recipient }); }} />
                  <span><span class="mono">{c.reference}</span> · {c.application} · {c.industry}</span>
                </label>
              ))}
            </fieldset>
          )}
          <p><Link class="button" href={STEP_PATHS[3]}>Next: review <svg class="arrow" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" focusable="false"><path d="M1 5h11m0 0L8.5 1.5M12 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></Link></p>
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <h2>Review and sign</h2>
          {!preview && chosenLot && chosenRecipient ? <Loading what="The eight conditions are" /> : null}
          {refusal ? <Banner kind="refused" title="Signing is refused"><p>{refusal.message}</p></Banner> : null}
          {preview ? (
            <>
              <h3>The eight conditions</h3>
              <ConditionsList conditions={preview.conditions} />
              <h3 style="margin-top:2rem">The document the recipient will read</h3>
              <div class="certificate-doc">
{[
'RAVEL MATERIALS SAS — RECYCLED CONTENT CERTIFICATE',
'',
'Certificate number: (issued at signing)',
`Claim type: ${lot?.claim_type?.replace(/_/g, ' ')}`,
`Recycled content: ${Math.floor((lot?.content_bp || 0) / 100)} per cent (${lot?.content_bp} basis points)`,
'This material is claimed by mass balance. It is not physically segregated.',
'',
`Lots: ${lot?.reference} — ${lot?.mass_g?.toLocaleString('en-GB')} g`,
`Site: ${lot?.site}`,
`Recipient: ${recipient?.reference} (${recipient?.application})`,
'',
'Permitted statement (in the recipient’s language):',
`Materials containing product manufactured with recycled content may be described as containing ${Math.floor((lot?.content_bp || 0) / 100)}% recycled nylon 6 by mass balance.`,
'',
'Prohibited statement:',
'You may not state that this material physically contains recycled content.',
'',
'The recipient will file this document with their own regulator.',
`Verify this certificate at ravel.example.com/verify/{number}`
].join('\n')}
              </div>
              {user.role === 'certificate_signer' ? (
                <div class="card" style="max-width:34rem;margin-top:1.5rem">
                  <h3>Confirm your identity to sign</h3>
                  <p class="label">Signing re-authenticates. A session alone is not a signing credential; the password travels again with this act.</p>
                  <label class="field">
                    <span class="label">Password</span>
                    <input type="password" autocomplete="current-password" value={password} onInput={(e: any) => setPassword(e.currentTarget.value)} />
                  </label>
                  <button class="button solid" onClick={sign} disabled={!password}>Sign the certificate</button>
                </div>
              ) : (
                <p class="notice">Only a certificate signer signs. You are signed in as {user.role.replace(/_/g, ' ')}.</p>
              )}
            </>
          ) : !refusal ? (
            <p class="notice">Choose a lot at step one and a recipient at step three.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Register({ user }: { user: Me }) {
  const [certs, setCerts] = useState<Certificate[] | null>(null);
  useEffect(() => { api<Certificate[]>('/certificates').then(setCerts).catch(() => setCerts([])); }, []);
  return (
    <div class="console-shell">
      <SchemeStatusBanner />
      <h1>Certificates</h1>
      <p class="measure">An issued artefact is immutable. A re-issue produces a new version at a new address rather than new bytes at the old one.</p>
      <p><Link class="button solid" href="/console/certificates/new/lot">Sign a certificate <svg class="arrow" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" focusable="false"><path d="M1 5h11m0 0L8.5 1.5M12 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></Link></p>
      {!certs ? <Loading what="The certificates" /> : certs.length === 0 ? <Empty what="certificates" /> : (
        <div class="table-scroll">
          <table class="sheet">
            <thead>
              <tr><th scope="col">Number</th><th scope="col">Site</th><th scope="col">State</th><th scope="col" class="num">Content</th><th scope="col">Claim type</th><th scope="col">Recipient</th><th scope="col">Signer</th><th scope="col">Signed</th></tr>
            </thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.number}>
                  <td class="mono"><Link href={'/console/certificates/' + c.number}>{c.number}</Link></td>
                  <td class="mono">{c.site}</td>
                  <td>{c.state === 'withdrawn' ? <><StateWord state="withdrawn" /><span class="label"> withdrawn {fmtDate(c.withdrawn_on)}</span></> : <StateWord state={c.state} />}</td>
                  <td class="num">{c.content_bp} bp</td>
                  <td>{c.claim_type.replace(/_/g, ' ')}</td>
                  <td class="mono">{c.recipient}</td>
                  <td class="mono">{c.signer}</td>
                  <td>{fmtDate(c.signed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CertificateDetail({ user, number }: { user: Me; number: string }) {
  const [cert, setCert] = useState<Certificate | null>(null);
  const [doc, setDoc] = useState<string>('');
  const [replay, setReplay] = useState<any>(null);
  const [withdrawState, setWithdrawState] = useState<'idle' | 'confirming'>('idle');
  const [reason, setReason] = useState('');
  const [withdrawal, setWithdrawal] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    api<Certificate>('/certificates/' + number).then(setCert).catch((e) => setError((e as ApiError).body));
    rawText('/certificates/' + number + '/document').then(setDoc);
    api<any>('/certificates/' + number + '/replay').then(setReplay).catch(() => setReplay(null));
  }, [number]);

  const withdraw = async () => {
    try {
      const r = await api<any>('/certificates/' + number + '/withdraw', { method: 'POST', body: { reason } });
      setWithdrawal(r);
      setWithdrawState('idle');
      const c = await api<Certificate>('/certificates/' + number);
      setCert(c);
    } catch (e) {
      setError((e as ApiError).body);
    }
  };

  if (error && !cert) return <div class="console-shell"><Banner kind="refused" title="Refused"><p>{error.message}</p></Banner></div>;
  if (!cert) return <div class="console-shell"><Loading what="The certificate" /></div>;

  const blocking = (cert.conditions || []).filter((c: any) => !c.satisfied);

  return (
    <div class="console-shell">
      <h1 class="mono" style="font-size:var(--step-h3-size)">
        {cert.state === 'withdrawn' ? <StateWord state="withdrawn" /> : null} {cert.number} <span class="label">version {cert.version}</span>
      </h1>
      {cert.state === 'withdrawn' ? (
        <Banner title="Withdrawn">
          <p>This certificate was withdrawn on {fmtDate(cert.withdrawn_on)}. Reason: {cert.withdrawal_reason}.</p>
        </Banner>
      ) : null}
      {cert.state === 'issued' && blocking.length > 0 ? (
        <Banner title="Conditions as they stood at signing">
          <p>{blocking.length} of the eight conditions did not hold at the moment of signing, and the certificate was not issued from that state.</p>
        </Banner>
      ) : null}

      <section>
        <h2>The claim</h2>
        <ul class="figure-list">
          <li><span class="label">Claim type</span><span class="mono">{cert.claim_type.replace(/_/g, ' ')}</span></li>
          <li><span class="label">Recycled content</span><span class="figures"><ContentFigure content_bp={cert.content_bp} claim_type={cert.claim_type} /></span></li>
          <li><span class="label">Category split</span><span class="mono">{JSON.stringify(cert.category_split)}</span></li>
          <li><span class="label">Provisional factor</span><span>{String(cert.provisional_factor)}</span></li>
          <li><span class="label">Scheme / registration</span><span class="mono">{cert.scheme} / {cert.registration}</span></li>
          <li><span class="label">Balance period</span><span class="mono">{cert.period}</span></li>
        </ul>
      </section>

      <section>
        <h2>Carbon</h2>
        <p><CarbonFigure carbon={cert.carbon} /></p>
        {cert.carbon ? <p class="label">Primary data share {cert.carbon.primary_share_bp} bp. The breakdown is attached to the filed copy rather than inline on a certificate.</p> : <p class="notice">No carbon figure stands behind this certificate.</p>}
      </section>

      <section>
        <h2>Statements</h2>
        <p><span class="label">Permitted</span><br />{cert.permitted_statement}</p>
        <p><span class="label">Prohibited</span><br />{cert.prohibited_statement}</p>
        <p class="mono">Verify this certificate at ravel.example.com/verify/{cert.number}</p>
      </section>

      {replay ? (
        <section>
          <h2>Replay</h2>
          {replay.reproducible === false ? (
            <Banner kind="refused" title="Not reproducible"><p>{replay.reason}</p></Banner>
          ) : (
            <ul class="figure-list">
              <li><span class="label">Issued content</span><span class="figures">{replay.issued.content_bp} bp</span></li>
              <li><span class="label">Recomputed content</span><span class="figures">{replay.recomputed.content_bp} bp</span></li>
              <li><span class="label">Agrees</span><span class="figures">{String(replay.agrees)}</span></li>
              <li><span class="label">Differing input</span><span class="mono">{replay.differing_input ? replay.differing_input.input : 'none'}</span></li>
            </ul>
          )}
          <p class="label">Input versions: {(replay.input_versions || []).map((v: any) => v.reference).join(', ') || 'none'}</p>
        </section>
      ) : null}

      <section>
        <h2>The document</h2>
        <div class="certificate-doc">{doc}</div>
      </section>

      {user.role === 'certificate_signer' && cert.state === 'issued' && user.sites.includes(cert.site) ? (
        <section>
          <h2>Withdraw</h2>
          {withdrawal ? (
            <Banner title="Withdrawal complete">
              <p>Five consequences in one action. Recipients notified: {(withdrawal.notified_recipients || []).join(', ')}. Derived certificates resolved: {(withdrawal.derived_certificates || []).join(', ') || 'none'}.</p>
            </Banner>
          ) : null}
          {withdrawState === 'idle' ? (
            <>
              <p class="label">A withdrawal is one action with five consequences. Before confirming, the screen shows the recipients who will be notified, by name, and the statements that become void.</p>
              <button class="button" onClick={() => setWithdrawState('confirming')}>Begin a withdrawal</button>
            </>
          ) : (
            <div class="card" style="max-width:40rem">
              <h3>Confirm the blast radius</h3>
              <p class="label">Recipients who will be notified, by name</p>
              <ul><li class="mono">{cert.recipient}</li></ul>
              <p class="label">Downstream statements the recipient is now obliged to stop making</p>
              <ul>
                <li>{cert.permitted_statement}</li>
                <li>{cert.prohibited_statement}</li>
              </ul>
              <p class="label">Derived certificates that will be resolved</p>
              <p>Those resting on the same lots, enumerated by the traversal at the moment of withdrawal.</p>
              <label class="field">
                <span class="label">Reason (the only free text on a certificate)</span>
                <textarea value={reason} onInput={(e: any) => setReason(e.currentTarget.value)}></textarea>
              </label>
              <button class="button solid" onClick={withdraw} disabled={reason.trim().length === 0}>Confirm withdrawal</button>
              <button class="button" onClick={() => setWithdrawState('idle')}>Cancel</button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
