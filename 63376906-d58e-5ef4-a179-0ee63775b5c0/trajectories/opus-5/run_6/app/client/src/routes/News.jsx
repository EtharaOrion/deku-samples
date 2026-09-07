import { Reveal, Loading, Empty, StateWord, useAsync } from '../components/common.jsx';

const TAXONOMY = ['funding', 'partnership', 'technical', 'recognition'];
const LANGUAGES = { en: 'English', fr: 'French' };

export default function News() {
  const news = useAsync(() => fetch('/api/news').then((r) => (r.ok ? r.json() : null)), []);
  return (
    <>
      <section className="page section" style={{ paddingTop: '4rem' }}>
        <hr className="accent-rule" />
        <Reveal as="h1">News</Reveal>
        <Reveal>
          <p className="t-body-big" style={{ maxWidth: '44rem', marginTop: '1.5rem' }}>
            One event appears once, with its coverage. Every item carries its outlet, its date and its
            link, and an item written in another language says so before you click it.
          </p>
        </Reveal>
      </section>

      <section className="page section">
        <p className="label">Tags</p>
        <p className="t-small" style={{ marginTop: '0.5rem' }}>
          {TAXONOMY.join(' · ')}
        </p>

        {news.loading ? <Loading what="the news items" /> : null}
        {news.error ? <Empty>The news items could not be read.</Empty> : null}
        {news.data && news.data.length === 0 ? <Empty>There are no news items yet.</Empty> : null}
        {news.data && news.data.length ? (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: '1.5rem' }}>
            {news.data.map((n) => (
              <li className="card" key={n.reference}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <StateWord quiet>{n.tag}</StateWord>
                  <span className="mono">{n.date}</span>
                  {n.language !== 'en' ? (
                    <StateWord>Written in {LANGUAGES[n.language] || n.language}</StateWord>
                  ) : null}
                </div>
                <h2 className="t-h4" style={{ marginTop: '0.75rem' }}>{n.title}</h2>
                <p className="t-small" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                  Coverage in <strong>{n.outlet}</strong>
                  {n.language !== 'en' ? `, in ${LANGUAGES[n.language] || n.language}` : ''}.
                </p>
                <a href={n.link} rel="noopener noreferrer" className="t-small">
                  Read it at {n.outlet}
                  {n.language !== 'en' ? ` (${LANGUAGES[n.language] || n.language})` : ''}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}
