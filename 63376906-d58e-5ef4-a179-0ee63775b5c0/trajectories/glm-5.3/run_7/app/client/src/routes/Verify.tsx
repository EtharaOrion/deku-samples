import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api';
import { Loading, StateWord } from '../components/Figures';

type VerifyAnswer = {
  found: boolean; number: string; state?: string; issued_on?: string; withdrawn_on?: string | null;
  withdrawal_reason?: string | null; site?: string; grade?: string; claim_type?: string; recipient_name?: string;
};

export default function Verify({ number }: { number: string }) {
  const [answer, setAnswer] = useState<VerifyAnswer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<VerifyAnswer>('/verify/' + encodeURIComponent(number), { public: true })
      .then(setAnswer)
      .catch(() => setFailed(true));
  }, [number]);

  if (failed) {
    return <section class="shell hero"><p class="lede">The verification service did not answer. This page shows nothing further.</p></section>;
  }
  if (!answer) return <section class="shell hero"><Loading what="The verification answer" /></section>;

  return (
    <div>
      <section class="shell hero">
        <h1>Certificate verification</h1>
        <p class="lede">This page is public, needs no account, and carries no yield, no collector, no genealogy and no carbon breakdown.</p>
      </section>

      <section class="shell section">
        <div class="card measure">
          {!answer.found ? (
            <div>
              <p class="label">Result</p>
              <h2>There is no such certificate</h2>
              <p>No certificate carries the number <span class="mono">{answer.number}</span>. This answer is given in the same layout as a found certificate, and the route cannot be used to enumerate the customer list.</p>
            </div>
          ) : (
            <div>
              <p class="label">Result</p>
              <h2>Certificate <span class="mono">{answer.number}</span></h2>
              <p>{answer.state === 'withdrawn' ? <><StateWord state="withdrawn" /> </> : null}<span class="label">state</span> <strong>{answer.state}</strong></p>
              {answer.state === 'withdrawn' ? (
                <BannerWithdrawn withdrawn_on={answer.withdrawn_on} reason={answer.withdrawal_reason} />
              ) : null}
              <ul class="figure-list">
                <li><span class="label">Issued on</span><span class="figures">{answer.issued_on}</span></li>
                <li><span class="label">Site</span><span class="mono">{answer.site}</span></li>
                <li><span class="label">Grade</span><span class="mono">{answer.grade}</span></li>
                <li><span class="label">Claim type</span><span class="mono">{answer.claim_type?.replace(/_/g, ' ')}</span></li>
                <li><span class="label">Recipient</span><span class="mono">{answer.recipient_name}</span></li>
              </ul>
              <p class="label" style="margin-top:1rem">A withdrawn certificate is not forwarded to a replacement. The remedy is a new certificate.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function BannerWithdrawn({ withdrawn_on, reason }: { withdrawn_on: string | null; reason: string | null }) {
  return (
    <div class="banner" role="note">
      <span class="label">Withdrawal</span>
      <p>This certificate was withdrawn on {String(withdrawn_on).slice(0, 10)}. Reason: {reason}.</p>
    </div>
  );
}
