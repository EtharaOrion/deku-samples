import { h } from 'preact';
import { Meta, useData, Loading, Empty } from '../../components/ui.jsx';
import { Reveal } from '../../components/reveal.jsx';
export default function Careers() {
  const pos = useData('/positions');
  const count = pos.data ? pos.data.length : null;
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'Careers — why this problem matters | Ravel', description: 'Open positions at Ravel, and why this problem matters.' }),
    h('section', null, h(Reveal, { as: 'h1' }, 'Why this problem matters'),
      h('p', { class: 'body-big' }, 'Less than 1 per cent of textiles are recycled into new materials. More than 8 per cent of textile waste is incinerated each year. Plastics production emits 1.8 gigatonnes of carbon dioxide equivalent a year.'),
      h('p', null, 'Nylon is the polymer that can be closed: returned to its monomer and rebuilt to virgin quality, again and again. The work is unglamorous, exact and mostly arithmetic — the material is indistinguishable from the incumbent, so the whole product is the record of where it came from.')),
    h('section', null,
      h(Reveal, { as: 'h2' }, 'Open positions'),
      h('p', { class: 'label' }, count == null ? 'Loading open positions…' : `${count} open ${count === 1 ? 'position' : 'positions'}`),
      pos.loading ? h(Loading) : (pos.data || []).length === 0 ? h(Empty, null, 'There are no open positions right now.') :
        h('ul', { class: 'grid-2' }, pos.data.map((p) => h('li', { class: 'card', key: p.id },
          h('h4', null, p.title),
          h('p', { class: 'small' }, `${p.location} · ${p.department} · ${p.contract_type}`),
          h('p', { class: 'label' }, `Closes ${p.closes_on}`))))));
}
