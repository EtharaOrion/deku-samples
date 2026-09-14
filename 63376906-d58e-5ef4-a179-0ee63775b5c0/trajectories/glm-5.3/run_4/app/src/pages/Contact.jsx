import { useState } from 'preact/hooks';
import { TopBar, Footer, Banner } from '../components/Chrome.jsx';
import { api } from '../api.js';

const TYPES = [
  { value: 'waste_supply', label: 'Waste supply', destination: 'feedstock@example.com', days: 3 },
  { value: 'polymer_purchase', label: 'Polymer purchase', destination: 'sales@example.com', days: 2 },
  { value: 'partnership', label: 'Partnership', destination: 'partners@example.com', days: 5 },
  { value: 'press', label: 'Press', destination: 'press@example.com', days: 1 }
];

export default function Contact() {
  const [form, setForm] = useState({ type: 'waste_supply', name: '', email: '', message: '' });
  const [state, setState] = useState({ phase: 'idle' });
  const cfg = TYPES.find((t) => t.value === form.type) || TYPES[0];

  async function submit(e) {
    e.preventDefault();
    setState({ phase: 'sending' });
    const key = 'enq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const r = await api('/api/enquiries', {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: form
    });
    if (r.ok) {
      setState({ phase: 'sent', reference: r.data.reference, days: r.data.response_days, destination: r.data.destination });
    } else {
      setState({ phase: 'failed', error: (r.data && r.data.error) || 'unknown' });
    }
  }

  return (
    <div>
      <TopBar />
      <main>
        <section class="hero"><h1 class="reveal">Contact</h1></section>
        <section>
          <h2 class="reveal">Four enquiry types</h2>
          <div class="table-wrap">
            <table class="spec">
              <caption>Each type has its own destination address and its own stated response time</caption>
              <thead><tr><th scope="col">Type</th><th scope="col">Destination</th><th scope="col">Response time</th></tr></thead>
              <tbody>
                {TYPES.map((t) => (
                  <tr key={t.value}>
                    <td>{t.label}</td>
                    <td class="mono">{t.destination}</td>
                    <td class="mono">{t.days} working days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 class="reveal">Send an enquiry</h2>
          {state.phase === 'sent' && (
            <Banner kind="ok">
              <p>Your enquiry was received as <span class="mono">{state.reference}</span>. It has gone to <span class="mono">{state.destination}</span>, who will reply within {state.days} working days. A confirmation has been sent to the address you gave.</p>
            </Banner>
          )}
          {state.phase === 'failed' && (
            <Banner kind="refused">
              <p>The enquiry could not be sent ({state.error}). Check the address you entered and try again, or write to <span class="mono">partners@example.com</span>, which does not depend on this form working.</p>
            </Banner>
          )}
          <form class="form" onSubmit={submit}>
            <label class="field">
              <span class="field-label">Type</span>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option value={t.value}>{t.label} — {t.destination}, {t.days} days</option>)}
              </select>
            </label>
            <label class="field">
              <span class="field-label">Your name</span>
              <input value={form.name} onInput={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label class="field">
              <span class="field-label">Your email</span>
              <input type="email" required value={form.email} onInput={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label class="field">
              <span class="field-label">Message</span>
              <textarea rows="4" value={form.message} onInput={(e) => setForm({ ...form, message: e.target.value })}></textarea>
            </label>
            <p class="stat-meta">This form sends your name, email and message to {cfg.destination}. It is kept for the retention stated in the privacy policy and you may ask for it to be removed.</p>
            <button class="btn" type="submit" disabled={state.phase === 'sending'}>{state.phase === 'sending' ? 'Sending…' : 'Send enquiry'}</button>
          </form>
        </section>
      </main>
      <Footer />
    </div>
  );
}
