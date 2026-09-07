import { useState } from 'preact/hooks';
import { Reveal, Loading, Empty, useAsync } from '../components/common.jsx';

const TYPE_LABELS = {
  waste_supply: 'I have waste to supply',
  polymer_purchase: 'I want to buy polymer',
  partnership: 'Partnership',
  press: 'Press',
};

export default function Contact() {
  const types = useAsync(() => fetch('/api/enquiry-types').then((r) => (r.ok ? r.json() : null)), []);
  const [form, setForm] = useState({ type: 'waste_supply', name: '', email: '', organisation: '', message: '' });
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.currentTarget.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setFailure(null);
    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `enq-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
        },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) setFailure(body);
      else setResult(body);
    } catch (err) {
      setFailure({ message: 'The form could not reach our servers.', network: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="page section" style={{ paddingTop: '4rem' }}>
        <hr className="accent-rule" />
        <Reveal as="h1">Contact</Reveal>
        <Reveal>
          <p className="t-body-big" style={{ maxWidth: '44rem', marginTop: '1.5rem' }}>
            Four kinds of enquiry, four destinations, and a stated response time for each. Choose the
            one that fits and we will tell you where it went.
          </p>
        </Reveal>
      </section>

      <section className="page section">
        <div className="grid grid-2">
          <div>
            <h2 className="t-h4">Where an enquiry goes</h2>
            {types.loading ? <Loading what="the enquiry destinations" /> : null}
            {types.error ? <Empty>The enquiry destinations could not be read.</Empty> : null}
            {types.data ? (
              <div className="table-scroll" style={{ marginTop: '1rem' }}>
                <table>
                  <thead>
                    <tr><th scope="col">Type</th><th scope="col">Destination</th><th scope="col" className="num">Response</th></tr>
                  </thead>
                  <tbody>
                    {types.data.map((t) => (
                      <tr key={t.type}>
                        <td>{TYPE_LABELS[t.type] || t.type}</td>
                        <td className="mono">{t.destination}</td>
                        <td className="num">{t.response_days} working day{t.response_days === 1 ? '' : 's'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="t-small" style={{ marginTop: '1.5rem' }}>
              Ravel Materials SAS is the controller of the data you send. It is used to answer your
              enquiry and for nothing else. An enquiry is kept for 24 months; a waste-supply or a
              polymer enquiry for 36; a press enquiry for 12. To have it removed, write to
              privacy@example.com. The full statement is on our{' '}
              <a href="/privacy">privacy route</a>.
            </p>
          </div>

          <div>
            <h2 className="t-h4">Send an enquiry</h2>

            {result ? (
              <div className="banner" role="status" style={{ marginTop: '1rem' }}>
                <div className="banner-title">Your enquiry was received</div>
                <p className="t-small">
                  We have given it the reference <span className="mono">{result.reference}</span> and sent
                  it to <span className="mono">{result.destination}</span>. Someone will reply within{' '}
                  {result.response_days} working day{result.response_days === 1 ? '' : 's'}.
                  A confirmation carrying the same reference is on its way to the address you gave.
                </p>
                {result.deadline ? (
                  <p className="t-small" style={{ marginBottom: 0 }}>
                    Your press deadline is recorded as <span className="mono">{result.deadline}</span>.
                  </p>
                ) : null}
              </div>
            ) : null}

            {failure ? (
              <div className="banner" role="alert" style={{ marginTop: '1rem' }}>
                <div className="banner-title">Your enquiry was not sent</div>
                <p className="t-small">
                  {failure.network
                    ? 'The form could not reach our servers, so nothing was recorded.'
                    : failure.message || 'The form was refused.'}
                </p>
                <p className="t-small" style={{ marginBottom: 0 }}>
                  You can correct the form and try again. If it keeps failing, write directly to{' '}
                  <span className="mono">contact@example.com</span>, which does not depend on this form
                  working.
                </p>
              </div>
            ) : null}

            <form onSubmit={submit} className="stack" style={{ marginTop: '1rem' }}>
              <div>
                <label htmlFor="enq-type" className="label">Enquiry type</label>
                <select id="enq-type" value={form.type} onInput={set('type')} required>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <option value={v} key={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="enq-name" className="label">Your name</label>
                <input id="enq-name" value={form.name} onInput={set('name')} required autoComplete="name" />
              </div>
              <div>
                <label htmlFor="enq-email" className="label">Your email</label>
                <input id="enq-email" type="email" value={form.email} onInput={set('email')} required autoComplete="email" />
              </div>
              <div>
                <label htmlFor="enq-org" className="label">Organisation (optional)</label>
                <input id="enq-org" value={form.organisation} onInput={set('organisation')} autoComplete="organization" />
              </div>
              <div>
                <label htmlFor="enq-message" className="label">Message</label>
                <textarea id="enq-message" rows="5" value={form.message} onInput={set('message')} required />
              </div>
              <div>
                <button type="submit" className="button button-primary" disabled={busy}>
                  {busy ? 'Sending…' : 'Send enquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
