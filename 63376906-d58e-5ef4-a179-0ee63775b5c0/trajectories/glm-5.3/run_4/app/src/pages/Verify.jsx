import { useEffect, useState } from 'preact/hooks';
import { TopBar, Footer, Loading } from '../components/Chrome.jsx';
import { api } from '../api.js';

export default function Verify({ number }) {
  const [data, setData] = useState(null);
  useEffect(() => { api('/api/verify/' + number).then((r) => setData(r.data)); }, [number]);

  return (
    <div>
      <TopBar />
      <main>
        <section class="hero">
          <h1 class="reveal">Certificate verification</h1>
          <p class="lede">Certificate <span class="mono">{number}</span></p>
        </section>
        <section>
          {!data && <Loading>Checking the certificate…</Loading>}
          {data && !data.found && (
            <div class="card">
              <h2>No such certificate</h2>
              <p>There is no certificate with the number <span class="mono">{number}</span>. Check the number and try again. This route cannot be used to enumerate the customer list.</p>
            </div>
          )}
          {data && data.found && (
            <div class="card">
              {data.state === 'withdrawn' ? (
                <>
                  <h2>Withdrawn</h2>
                  <p>This certificate was withdrawn on {data.withdrawn_on}. Reason: {data.withdrawal_reason}.</p>
                </>
              ) : (
                <h2>Issued</h2>
              )}
              <p>Number: <span class="mono">{data.number}</span></p>
              <p>State: <strong>{data.state}</strong></p>
              <p>Issued on: <span class="mono">{data.issued_on}</span></p>
              {data.withdrawn_on && <p>Withdrawn on: <span class="mono">{data.withdrawn_on}</span></p>}
              <p>Site: <span class="mono">{data.site}</span></p>
              <p>Grade: <span class="mono">{data.grade}</span></p>
              <p>Claim type: <strong>{data.claim_type}</strong></p>
              <p>Recipient: {data.recipient_name}</p>
              <p class="stat-meta">This answer carries no yield, no collector, no genealogy and no carbon breakdown.</p>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
