import { createSignal, Show, For } from 'solid-js';
import { formatUsd, api } from './lib.js';

// Checkout step one: where it goes. Contact and address, an unticked marketing
// consent, and nothing disabled while anything else loads.
export default function WhereItGoes(props) {
  const address = () => props.cart?.shipping_address || {};
  const [values, setValues] = createSignal({
    email: props.cart?.email || '',
    marketing: false,
    name: address().name || '',
    line1: address().line1 || '',
    line2: address().line2 || '',
    city: address().city || '',
    region: address().region || '',
    postalCode: address().postalCode || '',
    country: address().country || 'US',
    phone: address().phone || ''
  });
  const [errors, setErrors] = createSignal({});
  const [saving, setSaving] = createSignal(false);
  const [failure, setFailure] = createSignal('');

  const set = (field) => (event) => {
    const value = event.currentTarget.type === 'checkbox' ? event.currentTarget.checked : event.currentTarget.value;
    setValues((v) => ({ ...v, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFailure('');
    setErrors({});
    const v = values();
    try {
      await api('/api/cart/delivery', {
        method: 'POST',
        body: {
          email: v.email,
          shipping_address: {
            name: v.name,
            line1: v.line1,
            line2: v.line2,
            city: v.city,
            region: v.region,
            postalCode: v.postalCode,
            country: v.country,
            phone: v.phone
          }
        }
      });
      window.location.href = '/checkout/how-it-gets-there';
    } catch (err) {
      setSaving(false);
      if (err.code && err.code.endsWith('_required')) {
        const field = err.code.replace('_required', '');
        setErrors({ [field]: err.message });
      } else {
        setFailure(err.message);
      }
    }
  };

  const fields = [
    { name: 'name', label: 'Name', required: true, autocomplete: 'name' },
    { name: 'line1', label: 'Address', required: true, autocomplete: 'address-line1' },
    { name: 'line2', label: 'Address line 2', required: false, autocomplete: 'address-line2' },
    { name: 'city', label: 'City', required: true, autocomplete: 'address-level2' },
    { name: 'region', label: 'Region', required: false, autocomplete: 'address-level1' },
    { name: 'postalCode', label: 'Postal code', required: true, autocomplete: 'postal-code' }
  ];

  return (
    <form onSubmit={submit} novalidate>
      <Show when={failure()}>
        <div class="notice wrong" role="alert">{failure()}</div>
      </Show>

      <div class="field">
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          inputmode="email"
          autocomplete="email"
          value={values().email}
          onInput={set('email')}
          required
        />
        <p class="hint">The receipt and the order link go here.</p>
        <Show when={errors().email}><p class="err">{errors().email}</p></Show>
      </div>

      <div class="field">
        <label class="consent">
          <input type="checkbox" checked={values().marketing} onChange={set('marketing')} />
          <span>Email me when something I own changes. Nothing else.</span>
        </label>
      </div>

      <For each={fields}>
        {(field) => (
          <div class="field">
            <label for={field.name}>
              {field.label}
              <Show when={field.required}> <span aria-hidden="true">*</span></Show>
            </label>
            <input
              id={field.name}
              type="text"
              autocomplete={field.autocomplete}
              value={values()[field.name]}
              onInput={set(field.name)}
            />
            <Show when={errors()[field.name]}>
              <p class="err">{errors()[field.name]}</p>
            </Show>
          </div>
        )}
      </For>

      <div class="field">
        <label for="country">Country</label>
        <select id="country" value={values().country} onChange={set('country')}>
          <option value="US">United States</option>
          <option value="CA">Canada</option>
          <option value="FI">Finland</option>
          <option value="DE">Germany</option>
          <option value="GB">United Kingdom</option>
        </select>
        <p class="hint">We ship to the United States only for now.</p>
      </div>

      <div class="field">
        <label for="phone">Phone <span class="hint">(optional)</span></label>
        <input id="phone" type="tel" autocomplete="tel" value={values().phone} onInput={set('phone')} />
      </div>

      <button class="btn" type="submit" disabled={saving()}>
        {saving() ? 'Saving' : 'Continue to delivery'}
      </button>
    </form>
  );
}
