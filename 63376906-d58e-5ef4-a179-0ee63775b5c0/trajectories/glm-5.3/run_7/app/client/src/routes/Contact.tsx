import { useState } from 'preact/hooks';
import { api, ApiError } from '../lib/api';
import { Banner } from '../components/Figures';
import { Reveal } from '../components/Reveal';

const types: [string, string, number][] = [
  ['waste_supply', 'feedstock@example.com', 3],
  ['polymer_purchase', 'sales@example.com', 2],
  ['partnership', 'partners@example.com', 5],
  ['press', 'press@example.com', 1]
];

export default function Contact() {
  const [form, setForm] = useState({ type: 'waste_supply', name: '', email: '', message: '' });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<any>('/enquiries', { method: 'POST', body: form, public: true });
      setResult(r);
    } catch (err) {
      const ae = err as ApiError;
      setError(ae.body?.message || 'The enquiry could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  const chosen = types.find((t) => t[0] === form.type)!;

  return (
    <div>
      <section class="shell hero">
        <Reveal as="h1">Contact</Reveal>
        <Reveal as="p" class="lede">Four enquiry types, four destinations, four stated response times.</Reveal>
      </section>

      <section class="shell section">
        <div class="table-scroll">
          <table class="sheet">
            <caption class="label" style="text-align:left;padding-bottom:0.5rem">Where an enquiry goes</caption>
            <thead><tr><th scope="col">Type</th><th scope="col">Destination</th><th scope="col" class="num">Response time (working days)</th></tr></thead>
            <tbody>
              {types.map(([k, dest, days]) => (
                <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td class="mono">{dest}</td><td class="num">{days}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="shell section">
        <div class="card measure">
          <h2>Send an enquiry</h2>
          <p class="label">Who receives the data: {chosen[1]}. Used to answer this enquiry, kept for the retention stated in the privacy policy, and removable on request at privacy@example.com.</p>
          {result ? (
            <Banner title="Enquiry received">
              <p>Reference <span class="mono">{result.reference}</span>. It has gone to <span class="mono">{result.destination}</span>, who will reply within {result.response_days} working days. {result.deadline ? `The press deadline is ${result.deadline}.` : ''}</p>
              <p>A confirmation has been sent to the address you gave.</p>
            </Banner>
          ) : null}
          {error ? (
            <Banner kind="refused" title="The enquiry could not be sent">
              <p>{error}</p>
              <p>You can check the address and try again, or write directly to <a href="mailto:partners@example.com">partners@example.com</a>, which does not depend on this form working.</p>
            </Banner>
          ) : null}
          <form onSubmit={submit}>
            <label class="field">
              <span class="label">Type of enquiry</span>
              <select value={form.type} onChange={(e: any) => setForm({ ...form, type: e.currentTarget.value })}>
                {types.map(([k]) => <option value={k}>{k.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label class="field">
              <span class="label">Your name</span>
              <input type="text" value={form.name} onChange={(e: any) => setForm({ ...form, name: e.currentTarget.value })} />
            </label>
            <label class="field">
              <span class="label">Your email</span>
              <input type="email" required value={form.email} onChange={(e: any) => setForm({ ...form, email: e.currentTarget.value })} />
            </label>
            <label class="field">
              <span class="label">Message</span>
              <textarea value={form.message} onChange={(e: any) => setForm({ ...form, message: e.currentTarget.value })}></textarea>
            </label>
            <button class="button solid" type="submit" disabled={busy}>{busy ? 'Sending' : 'Send enquiry'} <svg class="arrow" width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" focusable="false"><path d="M1 5h11m0 0L8.5 1.5M12 5 8.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
          </form>
        </div>
      </section>
    </div>
  );
}
