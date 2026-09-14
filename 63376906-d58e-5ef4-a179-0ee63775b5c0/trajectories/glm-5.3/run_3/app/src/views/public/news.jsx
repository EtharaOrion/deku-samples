import { h } from 'preact';
import { Meta, useData, Loading, Empty } from '../../components/ui.jsx';
import { Reveal } from '../../components/reveal.jsx';
const TAGS = ['funding', 'partnership', 'technical', 'recognition'];
export default function News() {
  const news = useData('/news');
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'News — coverage and releases | Ravel', description: 'News from Ravel, each item carrying its outlet, its date, its link and its language.' }),
    h('section', null, h(Reveal, { as: 'h1' }, 'News'),
      h('p', { class: 'label' }, 'Coverage is filed under a real taxonomy: ' + TAGS.join(', ') + '.')),
    h('section', null,
      news.loading ? h(Loading) : (news.data || []).length === 0 ? h(Empty, null, 'There are no news items yet.') :
        h('ul', null, news.data.map((n) => h('li', { class: 'card', key: n.id, style: 'display:grid;gap:.4rem' },
          h('div', { class: 'spread' },
            h('span', { class: 'state' }, n.tag),
            h('span', { class: 'label' }, n.language === 'en' ? 'English' : `In ${n.language.toUpperCase()} — stated before you click`)),
          h('h4', null, n.title),
          h('p', { class: 'small' }, `${n.outlet} · ${n.published_on}`),
          h('a', { class: 'small underline', href: n.link, lang: n.language }, 'Read the coverage'))))));
}
