import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api.js';
import { useMeta } from '../lib/router.jsx';
import { Reveal, Loading, Word } from '../components/common.jsx';
import { date, words } from '../lib/format.js';

// Public, with no session. The same layout answers a known number and an
// unknown one, and a withdrawal is stated rather than forwarded.
export function Verify({ number }) {
  useMeta(`Ravel — Verify ${number}`,
    'Check the state of a Ravel recycled-content certificate.', { noindex: true });
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    let live = true;
    setState({ loading: true, data: null });
    api(`/verify/${encodeURIComponent(number)}`)
      .then((d) => live && setState({ loading: false, data: d }))
      .catch(() => live && setState({ loading: false, data: null }));
    return () => { live = false; };
  }, [number]);

  const d = state.data;
  return (
    <div class="wrap-narrow stack-loose" style="padding-top:3rem">
      <header>
        <p class="eyebrow">Certificate verification</p>
        <Reveal as="h1" style="word-break:break-word">{number}</Reveal>
      </header>
      <hr class="rule" />

      {state.loading && <Loading what="this certificate" />}

      {!state.loading && d && !d.found && (
        <section class="sheet">
          <p class="label" style="margin:0 0 .5rem">Result</p>
          <p class="t-body-big" style="margin:0 0 1rem">
            <Word>Not found</Word>
          </p>
          <p style="margin:0">
            There is no such certificate. No certificate with the number{' '}
            <span class="mono">{number}</span> has been issued by Ravel.
          </p>
          <p class="note" style="margin:1rem 0 0">
            If you were given this number by a supplier, check it against the document they sent
            you. Certificate numbers are issued in a gapless sequence per site and are never reused.
          </p>
        </section>
      )}

      {!state.loading && d && d.found && (
        <section class="sheet">
          {/* A withdrawn certificate says withdrawn before it shows any figure. */}
          {d.state === 'withdrawn' && (
            <div class="banner" role="status" style="margin-bottom:1.5rem">
              <p class="label" style="margin:0 0 .35rem">State</p>
              <p class="t-body-big" style="margin:0 0 .5rem"><Word>Withdrawn</Word></p>
              <p style="margin:0">
                This certificate was withdrawn on <span class="mono">{date(d.withdrawn_on)}</span>.
                Reason: {d.withdrawal_reason}.
              </p>
              <p class="note" style="margin:.75rem 0 0">
                A withdrawal is a fact about a document. There is no replacement to forward you to;
                if one is issued it takes a number of its own.
              </p>
            </div>
          )}

          <dl style="margin:0">
            <Row label="Number" value={d.number} mono />
            <Row label="State" value={<Word>{words(d.state)}</Word>} />
            <Row label="Issued on" value={date(d.issued_on)} mono />
            {d.withdrawn_on && <Row label="Withdrawn on" value={date(d.withdrawn_on)} mono />}
            {d.withdrawal_reason && <Row label="Withdrawal reason" value={d.withdrawal_reason} />}
            <Row label="Site" value={d.site} mono />
            <Row label="Grade" value={d.grade} mono />
            <Row label="Claim type" value={<Word>{words(d.claim_type)}</Word>} />
            <Row label="Recipient" value={d.recipient_name} />
          </dl>

          <hr class="hairline" />
          <p class="note" style="margin:0">
            This answer states whether the certificate exists and what state it is in. It carries
            no yield, no collector, no genealogy and no carbon breakdown: those belong to the
            producer's own record and to the recipient of the certificate.
          </p>
        </section>
      )}

      {!state.loading && !d && (
        <section class="sheet">
          <p style="margin:0">
            This certificate could not be checked just now. Try again shortly.
          </p>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div class="figure-row" style="grid-template-columns:1fr">
      <dt class="label" style="margin:0">{label}</dt>
      <dd class={mono ? 'mono' : ''} style="margin:0">{value}</dd>
    </div>
  );
}
