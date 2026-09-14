import { h } from 'preact';
import { Meta } from '../../components/ui.jsx';
const ROWS = [['An enquiry', '24 months'], ['A waste-supply enquiry', '36 months'], ['A polymer enquiry', '36 months'], ['A press enquiry', '12 months'], ['An account and its acts', '120 months'], ['The record', '180 months']];
export default function Privacy() {
  return h('div', { class: 'route shell' },
    h(Meta, { title: 'Privacy policy | Ravel', description: 'Ravel Materials SAS is the controller. Retention in months is stated for every purpose.' }),
    h('section', null, h('h1', null, 'Privacy policy'),
      h('p', { class: 'body-big' }, 'Ravel Materials SAS is the controller of the personal data processed on this site.')),
    h('div', { class: 'card' },
      h('dl', { class: 'figrows' },
        h('div', { class: 'figrow' }, h('dt', { class: 'label' }, 'Controller'), h('dd', null, 'Ravel Materials SAS, 14 quai Rambaud, 69002 Lyon, France')),
        h('div', { class: 'figrow' }, h('dt', { class: 'label' }, 'Rights requests'), h('dd', { class: 'mono' }, 'privacy@example.com')),
        h('div', { class: 'figrow' }, h('dt', { class: 'label' }, 'Disclosure address'), h('dd', { class: 'mono' }, 'security@example.com')))),
    h('section', null, h('h2', null, 'Retention, stated in months for every purpose'),
      h('div', { class: 'tablewrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Purpose'), h('th', { class: 'num' }, 'Retention'))),
        h('tbody', null, ROWS.map(([p, m]) => h('tr', { key: p }, h('td', null, p), h('td', { class: 'num' }, m))))))),
    h('section', null, h('h2', null, 'The operational record'),
      h('p', null, 'The operational record names individuals, is retained under a legal and scheme obligation, and is not erased on request. A former employee’s contact detail is erased on request.'),
      h('p', { class: 'small' }, 'An entry reaches the end of its retention by losing its content while keeping its position and its digest, and a record under legal hold refuses deletion. A person inside the record is referenced by an identifier, and the identifier resolves to a name through a separate store with its own retention.')));
}
