import { h } from "preact";
import { useState } from "preact/hooks";
import { Reveal, DocMeta, Banner, api } from "../api.jsx";

const types = [
  ["waste_supply", "Waste supply — feedstock@example.com, answered within 3 days"],
  ["polymer_purchase", "Polymer purchase — sales@example.com, answered within 2 days"],
  ["partnership", "Partnership — partners@example.com, answered within 5 days"],
  ["press", "Press — press@example.com, answered within 1 day"],
];

export default function Contact() {
  const [state, setState] = useState({ status: "idle", reference: null, error: null });
  const [form, setForm] = useState({ type: "waste_supply", name: "", email: "", organisation: "", message: "" });

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: "sending", reference: null, error: null });
    try {
      const res = await api("/enquiries", { method: "POST", body: form });
      setState({ status: "sent", reference: res.reference, destination: res.destination, days: res.response_days, error: null });
    } catch (err) {
      setState({ status: "failed", reference: null, error: err });
    }
  };

  return (
    <div>
      <DocMeta
        title="Contact — Ravel"
        description="Four enquiry types, four destinations, four stated response times."
      />
      <section class="container narrow">
        <p class="eyebrow">Contact</p>
        <Reveal as="h1">Write to us</Reveal>
        <p class="body-big">
          Each enquiry type reaches a named destination with a stated response time. Nothing
          here is a generic inbox.
        </p>

        {state.status === "sent" && (
          <Banner>
            <p class="body-regular" style="margin:0">
              Enquiry <span class="mono ref">{state.reference}</span> was received. It has
              gone to <strong>{state.destination}</strong>, and you will hear back within{" "}
              {state.days} {state.days === 1 ? "day" : "days"}. A confirmation has been sent
              to the address you gave.
            </p>
          </Banner>
        )}
        {state.status === "failed" && (
          <Banner refusal>
            <p class="body-regular" style="margin:0">
              The form failed: {String(state.error?.message || "the enquiry could not be recorded")}.
              You can retry, or write directly to the destination for your enquiry type —
              an address that does not depend on this form working is listed beside each type
              below.
            </p>
          </Banner>
        )}

        <form onSubmit={submit} class="card" style="margin-top:1.5rem">
          <div class="field">
            <label for="type">Enquiry type</label>
            <select id="type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {types.map(([v, label]) => <option value={v}>{label}</option>)}
            </select>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="name">Name</label>
              <input id="name" required value={form.name} onInput={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input id="email" type="email" required value={form.email} onInput={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div class="field">
            <label for="organisation">Organisation</label>
            <input id="organisation" value={form.organisation} onInput={(e) => setForm({ ...form, organisation: e.target.value })} />
          </div>
          <div class="field">
            <label for="message">Message</label>
            <textarea id="message" rows="5" required value={form.message} onInput={(e) => setForm({ ...form, message: e.target.value })}></textarea>
          </div>
          <button class="primary" type="submit" disabled={state.status === "sending"}>
            {state.status === "sending" ? "Sending…" : "Send enquiry"}
          </button>
        </form>

        <section class="section">
          <h2>Destinations</h2>
          <div class="tablewrap">
            <table>
              <thead><tr><th>Type</th><th>Destination</th><th class="figure">Response time</th></tr></thead>
              <tbody>
                <tr><td>Waste supply</td><td class="mono ref">feedstock@example.com</td><td class="figure">3 days</td></tr>
                <tr><td>Polymer purchase</td><td class="mono ref">sales@example.com</td><td class="figure">2 days</td></tr>
                <tr><td>Partnership</td><td class="mono ref">partners@example.com</td><td class="figure">5 days</td></tr>
                <tr><td>Press</td><td class="mono ref">press@example.com</td><td class="figure">1 day</td></tr>
              </tbody>
            </table>
          </div>
          <p class="body-small">
            A waste-supply enquiry opens a collector record; a polymer enquiry opens a
            conformance record; a press enquiry carries a deadline.
          </p>
        </section>
      </section>
    </div>
  );
}
