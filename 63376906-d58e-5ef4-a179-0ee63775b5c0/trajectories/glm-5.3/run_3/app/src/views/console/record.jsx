import { h } from 'preact';
import { Meta, useData, Loading, Empty } from '../../components/ui.jsx';
export default function Record() {
  const entries = useData('/record');
  const check = useData('/record/check');
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'The record | Ravel console', description: 'Every act is an entry with the person, the moment, the site and the object.' }),
    h('div', { class: 'spread' }, h('h1', null, 'The record'),
      check.data ? h('p', { class: 'small' }, check.data.holds ? `Digest chain verifies across ${check.data.entries} entries.` : `Digest chain breaks at ${check.data.first_failure}.`) : null),
    h('p', { class: 'small' }, 'No entry is edited and no entry is removed. A correction is a new entry naming what it corrects.'),
    entries.loading ? h(Loading) : (entries.data || []).length === 0 ? h(Empty, null, 'The record holds no entries yet.') :
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', { class: 'num' }, 'Seq'), h('th', null, 'Kind'), h('th', null, 'Object'), h('th', null, 'By'), h('th', null, 'Site'), h('th', null, 'Summary'), h('th', null, 'Digest'))),
        h('tbody', null, entries.data.map((e) => h('tr', { key: e.seq },
          h('td', { class: 'num' }, e.seq),
          h('td', null, h('span', { class: 'label' }, e.kind.replace(/_/g, ' '))),
          h('td', { class: 'mono' }, e.object_ref || '—'),
          h('td', null, e.actor_name || e.actor),
          h('td', { class: 'mono' }, e.site || '—'),
          h('td', null, e.summary, e.legal_hold ? h('span', { class: 'flag' }, ' legal hold') : null, e.content_deleted_on ? h('span', { class: 'flag' }, ` content deleted under retention ${e.content_deleted_on}`) : null),
          h('td', { class: 'mono' }, e.digest.slice(0, 10), '…')))))));
}
