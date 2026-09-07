import { api } from '../api.js';
import { Reveal, useAsync, useTitle, Loading, Empty, StateWord } from '../ui.jsx';

const TAXONOMY = ['funding', 'partnership', 'technical', 'recognition'];

const LANGUAGE_NAME = { en: 'English', fr: 'French' };

export default function News() {
  useTitle('News — Coverage, with its outlet and its date', 'Ravel in the press, one event listed once with its coverage, each item carrying its outlet, its date and its language.');
  const news = useAsync(() => api('/news'));

  return (
    <div class="page stack-lg" style="padding-top:3.5rem">
      <Reveal as="section" className="narrow">
        <p class="t-eyebrow">News</p>
        <h1 class="t-h2">Coverage</h1>
        <p class="t-big">
          One event is listed once, with the coverage it received beneath it. Every item carries
          its outlet, its date and its link, and an item in another language says so before you
          click.
        </p>
      </Reveal>

      <Reveal as="section">
        <p class="t-eyebrow">Taxonomy</p>
        <p class="row" style="gap:0.5rem">
          {TAXONOMY.map((t) => <StateWord key={t} word={t} quiet={!(news.data || []).some((n) => n.tag === t)} />)}
        </p>
        <p class="t-small" style="color:var(--muted)">
          Four terms. A taxonomy with one term is not a taxonomy; a term with no item yet is shown
          quietly rather than hidden.
        </p>
      </Reveal>

      <Reveal as="section">
        {news.loading ? <Loading what="the news items" /> : null}
        {news.data && news.data.length === 0 ? (
          <Empty>There is no coverage yet. Nothing has been published.</Empty>
        ) : null}
        {news.data ? (
          <ul class="stack" style="list-style:none;padding:0">
            {news.data.map((n) => (
              <li key={n.reference} class="sheet" style="margin-bottom:1rem">
                <div class="spread">
                  <span class="t-eyebrow" style="margin:0">{n.tag}</span>
                  <span class="mono t-small">{n.date}</span>
                </div>
                <h2 class="t-h4" style="margin-top:0.5rem">{n.title}</h2>
                <p>{n.summary}</p>
                <p class="t-small" style="margin-bottom:0">
                  Coverage: <a href={n.link} rel="noopener">{n.outlet}</a>
                  {n.language !== 'en' ? (
                    <> — <strong>this item is in {LANGUAGE_NAME[n.language] || n.language}</strong></>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </Reveal>
    </div>
  );
}
