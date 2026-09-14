import { h } from 'preact';
import { Meta } from '../../components/ui.jsx';
import { Reveal } from '../../components/reveal.jsx';
import { Link } from '../../lib/router.jsx';

export default function Home() {
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'Ravel — Tomorrow’s materials. Made from today’s waste.', description: 'Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.' }),
    h('section', null,
      h('p', { class: 'label' }, 'Ravel'),
      h(Reveal, { as: 'h1' }, 'Tomorrow’s materials. Made from today’s waste.'),
      h('p', { class: 'body-big' }, h('em', { class: 'emph' }, 'virgin-quality'), ' recycled polymers, starting with ', h('span', { class: 'mark' }, 'nylon'), '.')),
    h('hr', { class: 'rule' }),
    h('section', null,
      h(Reveal, { as: 'h2' }, 'Nylon that goes on and on and on'),
      h('p', null, 'Nylon 6 is a polymer that can be returned to its monomer and rebuilt without losing the properties that made it worth using in the first place. A fishing net that is depolymerised today can be a fishing net again, and then again after that.'),
      h('p', null, 'We take the mixed, contaminated and colour-loaded waste that others cannot use, and return it to virgin-quality pellet with a documented origin and a documented carbon figure.')),
    h('section', null,
      h(Reveal, { as: 'h2' }, 'The power of green chemistry'),
      h('p', null, 'Our process runs at low temperature and low pressure, using green chemicals and reagents, and it is measured against a published carbon method with its boundary and its uncertainty stated beside the figure.'),
      h(Link, { href: '/technology', class: 'btn' }, 'Read the technology ', h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'))),
    h('section', null,
      h(Reveal, { as: 'h2' }, 'We’re closing the loop'),
      h('p', null, 'Waste arrives in batches from named collectors. Every batch is booked in with its mass, its moisture and its custody chain, and every claim that leaves the plant is allocated by arithmetic from a ledger that anybody can walk.'),
      h('p', null, 'The material is deliberately indistinguishable from the incumbent. The buyer is not paying for the pellet. The buyer is paying for origin, and origin cannot be measured in a pellet. It exists only as a record — so we built the record.'),
      h('div', { class: 'grid-3' },
        h('div', { class: 'card' }, h('h4', null, 'Mass balance'), h('p', { class: 'small' }, 'Claims are allocated by mass balance, never asserted as physical segregation.')),
        h('div', { class: 'card' }, h('h4', null, 'Losses reduce the claim'), h('p', { class: 'small' }, 'Material that disappears in processing does not carry its claim forward.')),
        h('div', { class: 'card' }, h('h4', null, 'A public register'), h('p', { class: 'small' }, 'Every certificate is verifiable at a permanent address, with no account and no login.'))),
      h(Link, { href: '/product', class: 'btn btn-primary' }, 'Same material. Better origin. ', h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'))));
}
