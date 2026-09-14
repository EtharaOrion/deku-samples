import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api';
import { Loading, Empty } from '../components/Figures';
import { Reveal } from '../components/Reveal';

type NewsItem = { id: number; title: string; tag: string; outlet: string; published_on: string; link: string; language: string };

export default function News() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  useEffect(() => { api<NewsItem[]>('/news').then(setItems).catch(() => setItems([])); }, []);

  return (
    <div>
      <section class="shell hero">
        <Reveal as="h1">News</Reveal>
        <Reveal as="p" class="lede">One event is listed once with its coverage. An item in another language says so before you click.</Reveal>
      </section>

      <section class="shell section">
        <p class="label">Tags: funding, partnership, technical, recognition</p>
        {!items ? <Loading what="The news" /> : items.length === 0 ? <Empty what="news items" /> : (
          <ul style="list-style:none;padding:0;margin:0">
            {items.map((n) => (
              <Reveal as="li" class="card" key={n.id} style="margin-bottom:1rem">
                <p class="label">{n.tag} · {n.outlet} · {n.published_on}{n.language !== 'en' ? ` · in ${n.language === 'fr' ? 'French' : n.language}` : ''}</p>
                <h3><a href={n.link} rel="noopener noreferrer">{n.title}</a></h3>
                <p class="label">Coverage by {n.outlet}. The event appears once, with this coverage.</p>
              </Reveal>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
