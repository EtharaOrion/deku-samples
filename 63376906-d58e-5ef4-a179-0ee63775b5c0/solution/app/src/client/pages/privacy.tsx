import type { JSX } from 'preact';
import { PRIVACY } from '../../shared/copy';
import { LockMark } from '../components/marks';
import { Reveal } from '../components/reveal';

export function PrivacyPage(): JSX.Element {
  return (
    <>
      <section class="section hero">
        <span class="eyebrow eyebrow-accent">Policy</span>
        <Reveal>
          <h1 class="hero__title">{PRIVACY.headline}</h1>
        </Reveal>
        <p class="lede">{PRIVACY.controllerBody(PRIVACY.controller, PRIVACY.postalAddress)}</p>
      </section>

      <section class="section">
        <span class="eyebrow">Controller</span>
        <Reveal>
          <h2>{PRIVACY.controllerHeading}</h2>
        </Reveal>
        <p>{PRIVACY.controllerBody(PRIVACY.controller, PRIVACY.postalAddress)}</p>
      </section>

      <section class="section">
        <span class="eyebrow">Rights</span>
        <Reveal>
          <h2>{PRIVACY.rightsHeading}</h2>
        </Reveal>
        <p>{PRIVACY.rightsBody(PRIVACY.privacyAddress)}</p>
        <p>
          <a href={`mailto:${PRIVACY.privacyAddress}`}>{PRIVACY.privacyAddress}</a>
        </p>
      </section>

      <section class="section">
        <span class="eyebrow">Retention</span>
        <Reveal>
          <h2>{PRIVACY.retentionHeading}</h2>
        </Reveal>
        <div class="scroller">
          <table>
            <caption>Retention in months, by purpose</caption>
            <thead>
              <tr>
                <th scope="col">{PRIVACY.retentionColumns[0]}</th>
                <th scope="col" class="num">
                  {PRIVACY.retentionColumns[1]}
                </th>
              </tr>
            </thead>
            <tbody>
              {PRIVACY.retention.map((row) => (
                <tr key={row.purpose}>
                  <td>{row.purpose}</td>
                  <td class="num">{row.months}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <span class="eyebrow">The record</span>
        <Reveal>
          <h2>{PRIVACY.recordHeading}</h2>
        </Reveal>
        <p>
          <LockMark label="Retained under obligation" />
        </p>
        <p>{PRIVACY.recordBody}</p>
      </section>

      <section class="section">
        <span class="eyebrow">Disclosure</span>
        <Reveal>
          <h2>{PRIVACY.disclosureHeading}</h2>
        </Reveal>
        <p>{PRIVACY.disclosureBody(PRIVACY.disclosureAddress)}</p>
        <p>
          <a href={`mailto:${PRIVACY.disclosureAddress}`}>{PRIVACY.disclosureAddress}</a>
        </p>
      </section>
    </>
  );
}
