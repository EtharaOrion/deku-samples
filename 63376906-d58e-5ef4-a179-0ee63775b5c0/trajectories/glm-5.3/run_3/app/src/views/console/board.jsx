import { h } from 'preact';
import { Meta, useData, Loading, Empty } from '../../components/ui.jsx';
import { Link } from '../../lib/router.jsx';
const STAGES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];
export default function Board() {
  const runs = useData('/runs');
  const me = useData('/auth/me');
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'Run board | Ravel console', description: 'One column per process stage and one card per run.' }),
    h('div', { class: 'spread' },
      h('h1', null, 'Run board'),
      me.data ? h('p', { class: 'small' }, `${me.data.name} · ${me.data.roles[0].replace(/_/g, ' ')} · ${me.data.sites.join(', ')}`) : null),
    h('p', { class: 'small' }, 'The console reads the record of what a run did, after the run. It controls no equipment and raises no alarm.'),
    runs.loading ? h(Loading) : (runs.data || []).length === 0 ? h(Empty, null, 'There are no runs recorded yet.') :
      h('div', { class: 'board' }, STAGES.map((stage) => {
        const cards = runs.data.filter((r) => r.run_type === stage);
        return h('section', { class: 'board-column', key: stage, 'aria-label': stage },
          h('h2', { class: 'label' }, stage),
          cards.length === 0 ? h('p', { class: 'small' }, `No ${stage} runs.`) :
            cards.map((r) => h('div', { class: 'run-card', key: r.reference },
              h('div', { class: 'spread' }, h(Link, { class: 'mono underline', href: `/console/record` }, r.reference), h('span', { class: 'state' }, r.state)),
              h('p', { class: 'small' }, `Stage: ${r.run_type}`),
              h('p', { class: 'small mono' }, `in ${(r.consumptions || []).reduce((s, c) => s + c.mass_g, 0).toLocaleString('en-GB')} g · out ${(r.outputs || []).reduce((s, o) => s + o.mass_g, 0).toLocaleString('en-GB')} g · losses ${(r.losses_g ?? 0).toLocaleString('en-GB')} g`),
              r.within_tolerance === false ? h('p', { class: 'flag' }, 'outside tolerance') : null,
              h('p', { class: 'small' }, `Recipe ${r.recipe_version}`))));
      })));
}
