import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { CONTACT } from '../../shared/copy';
import { ApiError, sendEnquiry } from '../api';
import { Mark } from '../components/marks';
import { Reveal } from '../components/reveal';
import { Banner } from '../components/status';
import type { RoutingView } from '../routes';

interface Sent {
  reference: string;
  destination: string;
  response_days: number;
}

export function ContactPage({ routing }: { routing: RoutingView[] }): JSX.Element {
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const chosen = routing.find((row) => row.type === type) ?? routing[0];
  const fallbackAddress = chosen?.destination ?? '';

  async function submit(event: Event): Promise<void> {
    event.preventDefault();
    setRefusal(null);
    setSent(null);
    if (!type) {
      setRefusal('no enquiry type was chosen');
      return;
    }
    setSending(true);
    try {
      const answer = await sendEnquiry({ type, name, organisation, email, message });
      setSent({
        reference: answer.reference,
        destination: answer.destination,
        response_days: answer.response_days,
      });
      setName('');
      setOrganisation('');
      setEmail('');
      setMessage('');
      setType('');
    } catch (error) {
      setRefusal(error instanceof ApiError ? error.message : String(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <section class="section hero">
        <span class="eyebrow eyebrow-accent">Contact</span>
        <Reveal>
          <h1 class="hero__title">{CONTACT.headline}</h1>
        </Reveal>
        <p class="lede">{CONTACT.intro}</p>
      </section>

      <section class="section">
        <span class="eyebrow">Desks</span>
        <Reveal>
          <h2>{CONTACT.routingHeading}</h2>
        </Reveal>
        <div class="scroller">
          <table>
            <caption>Four enquiry types, four destinations, four stated response times</caption>
            <thead>
              <tr>
                <th scope="col">Enquiry</th>
                <th scope="col">{CONTACT.destinationColumn}</th>
                <th scope="col">{CONTACT.responseColumn}</th>
              </tr>
            </thead>
            <tbody>
              {routing.map((row) => (
                <tr key={row.type}>
                  <td>{CONTACT.typeLabels[row.type] ?? row.type}</td>
                  <td class="mono">
                    <a href={`mailto:${row.destination}`}>{row.destination}</a>
                  </td>
                  <td>{CONTACT.responseDays(row.response_days)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <span class="eyebrow">Enquiry</span>
        <Reveal>
          <h2>{CONTACT.formHeading}</h2>
        </Reveal>

        {sent ? (
          <Banner word="Sent">
            {CONTACT.success(sent.reference, sent.destination, sent.response_days)}
          </Banner>
        ) : null}
        {refusal ? (
          <Banner word={CONTACT.failureWord}>
            {CONTACT.failure(refusal, fallbackAddress)}
          </Banner>
        ) : null}

        <div class="form-column">
          <form class="form" onSubmit={submit} noValidate>
            <div class="field">
              <label class="field__label" for="enquiry-type">
                Type of enquiry
              </label>
              <span class="field__select">
                <select
                  id="enquiry-type"
                  name="type"
                  class={type === '' ? 'field__control field__control--placeholder' : 'field__control'}
                  required
                  value={type}
                  onChange={(event) => setType((event.currentTarget as HTMLSelectElement).value)}
                >
                  <option value="" disabled selected={type === ''}>
                    {CONTACT.typePlaceholder}
                  </option>
                  {routing.map((row) => (
                    <option key={row.type} value={row.type} selected={type === row.type}>
                      {CONTACT.typeLabels[row.type] ?? row.type}
                    </option>
                  ))}
                </select>
                <svg class="field__select-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path d="M3.5 6 8 10.5 12.5 6" />
                </svg>
              </span>
            </div>

            <div class="field">
              <label class="field__label" for="enquiry-name">
                Your name
              </label>
              <input
                id="enquiry-name"
                name="name"
                type="text"
                class="field__control"
                autocomplete="name"
                required
                value={name}
                onInput={(event) => setName((event.currentTarget as HTMLInputElement).value)}
              />
            </div>

            <div class="field">
              <label class="field__label" for="enquiry-organisation">
                Organisation
              </label>
              <input
                id="enquiry-organisation"
                name="organisation"
                type="text"
                class="field__control"
                autocomplete="organization"
                value={organisation}
                onInput={(event) =>
                  setOrganisation((event.currentTarget as HTMLInputElement).value)
                }
              />
            </div>

            <div class="field">
              <label class="field__label" for="enquiry-email">
                Email
              </label>
              <input
                id="enquiry-email"
                name="email"
                type="email"
                class="field__control"
                autocomplete="email"
                required
                value={email}
                onInput={(event) => setEmail((event.currentTarget as HTMLInputElement).value)}
              />
            </div>

            <div class="field">
              <label class="field__label" for="enquiry-message">
                Message
              </label>
              <textarea
                id="enquiry-message"
                name="message"
                class="field__control"
                required
                value={message}
                onInput={(event) =>
                  setMessage((event.currentTarget as HTMLTextAreaElement).value)
                }
              />
            </div>

            <button type="submit" class="submit" disabled={sending}>
              <Mark
                name="arrow"
                labelFirst
                label={sending ? CONTACT.sendingLabel : CONTACT.sendLabel}
              />
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
