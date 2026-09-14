import { h } from 'preact';
import { Meta, useData, Loading, Empty, Banner } from '../../components/ui.jsx';
import { Link } from '../../lib/router.jsx';
export default function Balance({ id }) {
  const periods = useData('/balance-periods');
  const active = id || (periods.data || [])[0]?.id;
  const period = useData(`/balance-periods/${active}`, !!active);
  const lots = useData('/lots');
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'Balance | Ravel console', description: 'Credits in, credits out and credits available per category, with no input control on the screen.' }),
    h('h1', null, 'Balance'),
    h('p', { class: 'small' }, 'There is no input control on this screen. Every figure is derived and every figure links to the records it came from.'),
    periods.loading ? h(Loading) : h('nav', { class: 'steps', 'aria-label': 'Balance periods' }, (periods.data || []).map((p) => h(Link, { href: `/console/balance/${p.id}`, key: p.id, 'aria-current': p.id === active ? 'step' : null }, `${p.id} · ${p.state}`))),
    period.loading ? h(Loading) : !period.data ? h(Empty, null, 'No balance period at this address.') : PeriodView(period.data, lots));
}
const CAT_LABEL = { post_consumer: 'Post-consumer', pre_consumer: 'Pre-consumer' };
function PeriodView(p, lots) {
  return h('div', { class: 'route' },
    p.state === 'closed' ? h(Banner, { title: 'This period is closed' },
      h('p', null, `This period is closed. Corrections require a restatement.`)) : null,
    h('div', { class: 'spread' },
      h('h2', null, p.id),
      h('p', { class: 'small' }, `${p.site} · grade ${p.grade} · ${String(p.period.from).slice(0, 10)} to ${String(p.period.to).slice(0, 10)} · `, h('span', { class: 'state' }, p.state))),
    h('section', null, h('h3', { class: 'label' }, 'Credits by category'),
      h('div', { class: 'figrows' }, ['post_consumer', 'pre_consumer'].map((cat) => {
        const c = p.categories[cat];
        return h('div', { key: cat, class: 'figrow' },
          h('span', { class: 'label' }, CAT_LABEL[cat]),
          h('span', { class: 'mono' }, `in ${c.credits_in_g.toLocaleString('en-GB')} g · out ${c.credits_out_g.toLocaleString('en-GB')} g · available ${c.credits_available_g.toLocaleString('en-GB')} g`));
      })),
      h('p', { class: 'small' }, `Invariant margin shown as a mass, not a state: remaining claimable post-consumer mass is ${p.categories.post_consumer.credits_available_g.toLocaleString('en-GB')} g. Losses reduce the claim.`)),
    h('section', null, h('h3', { class: 'label' }, 'Three counts, none a badge'),
      h('div', { class: 'figrows' },
        h('div', { class: 'figrow' }, h('span', { class: 'label' }, 'Overrides this period'), h('span', { class: 'mono' }, p.override_count.toLocaleString('en-GB'))),
        h('div', { class: 'figrow' }, h('span', { class: 'label' }, 'Open restatements'), h('span', { class: 'mono' }, p.open_restatement_count.toLocaleString('en-GB'))),
        h('div', { class: 'figrow' }, h('span', { class: 'label' }, 'Audit findings past their date'), h('span', { class: 'mono' }, p.open_finding_count.toLocaleString('en-GB')))),
      h('p', { class: 'small' }, `Non-claimable input this period: ${p.non_claimable_input_g.toLocaleString('en-GB')} g.`)),
    h('section', null, h('h3', { class: 'label' }, 'Conversion factors in force'),
      h('ul', null, (p.conversion_factors || []).map((f) => h('li', { class: 'card small', key: f.reference },
        h('div', { class: 'spread' }, h('span', { class: 'mono' }, f.reference, ' ', (f.factor_bp / 100).toFixed(2), '%'), f.provisional ? h('span', { class: 'state' }, 'provisional factor') : null),
        h('p', { class: 'small' }, f.derivation_window.from ? `Derived from ${f.derivation_window.from} to ${f.derivation_window.to}: ${f.derivation_window.out_g.toLocaleString('en-GB')} g out of ${f.derivation_window.in_g.toLocaleString('en-GB')} g in. ${f.derivation.formula}.` : 'Provisional: no window of its own.'))))),
    h('section', null, h('h3', { class: 'label' }, 'Movements'),
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Direction'), h('th', null, 'Category'), h('th', { class: 'num' }, 'Mass g'), h('th', null, 'Kind'), h('th', null, 'Batch / lot'), h('th', null, 'Effective'))),
        h('tbody', null, (p.movements || []).map((m, i) => h('tr', { key: i },
          h('td', null, m.direction), h('td', null, m.category.replace(/_/g, ' ')), h('td', { class: 'num' }, m.mass_g.toLocaleString('en-GB')),
          h('td', null, m.kind.replace(/_/g, ' '), m.origin_site && m.kind === 'transfer_in' ? ` (origin ${m.origin_site}, not a fresh credit)` : ''),
          h('td', { class: 'mono' }, m.batch || m.lot || '—'), h('td', { class: 'mono' }, m.effective_on))))))),
    p.state === 'closed' ? h('section', null, h('h3', { class: 'label' }, 'Carry-over settled at close'),
      h('p', { class: 'small' }, `Closed on ${p.closed_on}, cut-off ${p.cut_off}. Carried forward ${Object.values(p.carried_forward_g || {}).reduce((s, v) => s + v, 0).toLocaleString('en-GB')} g; expired ${Object.values(p.expired_g || {}).reduce((s, v) => s + v, 0).toLocaleString('en-GB')} g.`)) : null);
}
