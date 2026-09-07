import { useRoute } from 'preact-iso';
import { api } from '../api.js';
import { useAsync, useTitle, useNoIndex, Loading, StateWord, words } from '../ui.jsx';

export default function Verify() {
  const { params } = useRoute();
  const number = params.number;
  useTitle(
    `Verify ${number} — Ravel`,
    'The public verification answer for a Ravel certificate: its number, its state, its dates, its site, its grade, its claim type and its recipient.'
  );
  // A certificate's recipient is a customer relationship.
  useNoIndex(true);

  const r = useAsync(() => api(`/verify/${encodeURIComponent(number)}`), [number]);

  return (
    <div class="page narrow" style="padding:3.5rem 1.5rem 0">
      <p class="t-eyebrow">Certificate verification</p>
      <h1 class="t-h3" style="word-break:break-word">{number}</h1>

      {r.loading ? <Loading what="the verification answer" /> : null}

      {r.data ? (
        <div class="sheet" style="margin-top:1.5rem">
          {/* The same layout answers a known and an unknown number. */}
          {r.data.found === false ? (
            <>
              <p class="row" style="align-items:center">
                <StateWord word="No such certificate" heavy />
              </p>
              <h2 class="t-h4">There is no certificate with this number.</h2>
              <p>
                Ravel has issued no certificate numbered <span class="mono">{number}</span>. This
                is the same answer for a number that never existed and for a number that was
                mistyped: nothing here tells you which, and nothing here can be used to discover
                which numbers do exist.
              </p>
              <dl class="def" style="margin-top:1.5rem">
                <dt>Number</dt><dd class="mono">{number}</dd>
                <dt>Found</dt><dd>No</dd>
                <dt>State</dt><dd>—</dd>
                <dt>Issued on</dt><dd>—</dd>
                <dt>Withdrawn on</dt><dd>—</dd>
                <dt>Withdrawal reason</dt><dd>—</dd>
                <dt>Site</dt><dd>—</dd>
                <dt>Grade</dt><dd>—</dd>
                <dt>Claim type</dt><dd>—</dd>
                <dt>Recipient</dt><dd>—</dd>
              </dl>
            </>
          ) : (
            <>
              {/* A withdrawn certificate says withdrawn before it shows any figure. */}
              <p class="row" style="align-items:center">
                <StateWord
                  word={r.data.state === 'withdrawn' ? 'Withdrawn' : 'Issued'}
                  heavy={r.data.state === 'withdrawn'}
                />
              </p>
              {r.data.state === 'withdrawn' ? (
                <div class="banner">
                  <p class="t-eyebrow">Withdrawn</p>
                  <p>
                    <strong>
                      This certificate was withdrawn on {r.data.withdrawn_on}. Reason:{' '}
                      {r.data.withdrawal_reason}.
                    </strong>
                  </p>
                  <p style="margin-bottom:0">
                    It is retained and readable at this address and may not be relied upon. A
                    withdrawal is a fact about a document; there is no forwarding to a
                    replacement, and if one exists it is a separate certificate with its own
                    number.
                  </p>
                </div>
              ) : (
                <h2 class="t-h4">This certificate is issued and stands.</h2>
              )}
              <dl class="def" style="margin-top:1.5rem">
                <dt>Number</dt><dd class="mono">{r.data.number}</dd>
                <dt>Found</dt><dd>Yes</dd>
                <dt>State</dt><dd>{words(r.data.state)}</dd>
                <dt>Issued on</dt><dd class="mono">{r.data.issued_on || '—'}</dd>
                <dt>Withdrawn on</dt><dd class="mono">{r.data.withdrawn_on || '—'}</dd>
                <dt>Withdrawal reason</dt><dd>{r.data.withdrawal_reason || '—'}</dd>
                <dt>Site</dt><dd class="mono">{r.data.site}</dd>
                <dt>Grade</dt><dd class="mono">{r.data.grade}</dd>
                <dt>Claim type</dt><dd>{words(r.data.claim_type)}</dd>
                <dt>Recipient</dt><dd>{r.data.recipient_name}</dd>
              </dl>
            </>
          )}
        </div>
      ) : null}

      <p class="t-small" style="margin-top:2rem;color:var(--muted)">
        This answer carries the certificate's number, state, dates, site, grade, claim type and
        recipient name, and nothing else. It carries no yield, no collector, no genealogy and no
        carbon breakdown. It needs no account.
      </p>
    </div>
  );
}
