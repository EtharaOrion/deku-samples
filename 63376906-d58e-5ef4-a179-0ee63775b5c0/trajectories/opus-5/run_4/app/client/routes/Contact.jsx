import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { Reveal, useAsync, useTitle, Loading } from '../ui.jsx';

const TYPES = [
  ['waste_supply', 'Waste supply', 'feedstock@example.com', 3],
  ['polymer_purchase', 'Polymer purchase', 'sales@example.com', 2],
  ['partnership', 'Partnership', 'partners@example.com', 5],
  ['press', 'Press', 'press@example.com', 1],
];

export default function Contact() {
  useTitle('Contact — Four enquiry types, four stated response times', 'Write to Ravel about waste supply, polymer purchase, partnership or press. Each type has its own destination and its own stated response time.');
  const [type, setType] = useState('waste_supply');
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const chosen = TYPES.find((t) => t[0] === type);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null); setSent(null);
    const f = new FormData(e.target);
    try {
      const r = await api('/enquiries', {
        body: {
          type: f.get('type'),
          name: f.get('name'),
          email: f.get('email'),
          organisation: f.get('organisation') || null,
          message: f.get('message'),
        },
      });
      setSent(r);
      e.target.reset();
      setType('waste_supply');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="page stack-lg" style="padding-top:3.5rem">
      <Reveal as="section" className="narrow">
        <p class="t-eyebrow">Contact</p>
        <h1 class="t-h2">Four enquiry types</h1>
        <p class="t-big">
          Each type goes to its own address and carries its own stated response time. Choose the
          one that fits and you will be answered inside it.
        </p>
      </Reveal>

      <Reveal as="section">
        <div class="table-scroll">
          <table>
            <caption>Destinations and stated response times.</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Destination</th>
                <th scope="col" class="num">Response</th>
              </tr>
            </thead>
            <tbody>
              {TYPES.map(([k, label, dest, days]) => (
                <tr key={k}>
                  <th scope="row">{label}</th>
                  <td class="mono">{dest}</td>
                  <td class="num">{days} working {days === 1 ? 'day' : 'days'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      <Reveal as="section" className="narrow">
        <h2 class="t-h3">Write to us</h2>

        {sent ? (
          <div class="banner" role="status">
            <p class="t-eyebrow">Received</p>
            <p>
              <strong>Your enquiry was received and given the reference{' '}
              <span class="mono">{sent.reference}</span>.</strong>
            </p>
            <p>
              It has gone to <span class="mono">{sent.destination}</span>. You will be answered
              within <strong>{sent.response_days} working {sent.response_days === 1 ? 'day' : 'days'}</strong>.
              A confirmation carrying the same reference has been sent to the address you gave.
              {sent.deadline ? <> Your press deadline is recorded as <span class="mono">{sent.deadline}</span>.</> : null}
            </p>
          </div>
        ) : null}

        {error ? (
          <div class="banner" role="alert">
            <p class="t-eyebrow">Not sent</p>
            <p>
              <strong>
                {error.body && error.body.message
                  ? error.body.message
                  : 'The enquiry did not reach us. Nothing was recorded.'}
              </strong>
            </p>
            <p>
              You can try again, or write directly to{' '}
              <a href={`mailto:${chosen[2]}`} class="mono">{chosen[2]}</a>, which does not depend
              on this form working. Quote the enquiry type and we will answer inside the stated
              time.
            </p>
          </div>
        ) : null}

        <form onSubmit={submit} class="sheet">
          <div class="field">
            <label class="t-label" for="type">Enquiry type</label>
            <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)} required>
              {TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <p class="t-small" style="margin:0.4rem 0 0;color:var(--muted)">
              Goes to <span class="mono">{chosen[2]}</span>, answered within {chosen[3]} working{' '}
              {chosen[3] === 1 ? 'day' : 'days'}.
            </p>
          </div>
          <div class="field">
            <label class="t-label" for="name">Your name</label>
            <input id="name" name="name" required autocomplete="name" />
          </div>
          <div class="field">
            <label class="t-label" for="email">Your email</label>
            <input id="email" name="email" type="email" required autocomplete="email" />
          </div>
          <div class="field">
            <label class="t-label" for="organisation">Organisation (optional)</label>
            <input id="organisation" name="organisation" autocomplete="organization" />
          </div>
          <div class="field">
            <label class="t-label" for="message">Your enquiry</label>
            <textarea id="message" name="message" rows="5" required></textarea>
          </div>
          <p style="margin-top:1.25rem">
            <button class="btn" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send enquiry'} <span class="btn-arrow" aria-hidden="true">→</span>
            </button>
          </p>
          <p class="t-small" style="color:var(--muted);margin-bottom:0">
            Ravel Materials SAS receives what you write here to answer your enquiry and for no
            other purpose. A general enquiry is kept for 24 months, a waste-supply or polymer
            enquiry for 36 months and a press enquiry for 12 months. To have it removed, write to{' '}
            <a href="mailto:privacy@example.com">privacy@example.com</a>. The full statement is on{' '}
            <a href="/privacy">the privacy route</a>.
          </p>
        </form>
      </Reveal>
    </div>
  );
}
