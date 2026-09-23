import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { createElement } from 'preact';
import { render } from 'preact-render-to-string';
import { App } from '../client/app';
import { metaFor } from '../client/meta';
import type {
  CapacityView,
  ClaimView,
  Identity,
  PageState,
  PublicRouteId,
  SpecificationProperty,
  StageFlow,
  VerifyView,
} from '../client/routes';
import { TECHNOLOGY } from '../shared/copy.js';
import { RUN_STAGES } from '../shared/enums.js';
import { dateOnly, todayIso } from './answers/clock.js';
import type { AppEnv } from './auth/guard.js';
import { readSessionToken } from './auth/session.js';
import { ENQUIRY_ROUTING, GRADE_N6, SITE_COMM, SITE_DEMO, SITE_PILOT } from './db/constants.js';
import type { Row } from './db/pool.js';
import {
  all,
  byKey,
  where,
  type CertificateRow,
  type ConsumptionRow,
  type OutputRow,
  type PartyVersionRow,
  type RunRow,
  type SiteRow,
  type SpecificationRow,
} from './db/read.js';

export const SESSION_COOKIE = 'ravel_session';

interface ClaimSubstantiationRow extends Row {
  reference: string;
  claim: string;
  grade: string;
  claim_type: string;
  scheme: string;
  evidence: string;
  recorded_on: string;
}

interface StatisticRow extends Row {
  key: string;
  value: string;
  source: string;
  year: string;
  geography: string;
}

interface PositionRow extends Row {
  reference: string;
  title: string;
  location: string;
  department: string;
  contract_type: string;
  closes_on: string;
  summary: string;
}

interface NewsItemRow extends Row {
  reference: string;
  title: string;
  tag: string;
  outlet: string;
  date: string;
  link: string;
  language: string;
}

interface Assets {
  script: string;
  stylesheets: string[];
}

const FONT_FILES = [
  '/fonts/source-serif-4-latin.woff2',
  '/fonts/public-sans-latin.woff2',
  '/fonts/jetbrains-mono-latin.woff2',
];

const CAPACITY_LINES: readonly { site: string; line: string; statement: string }[] = [
  { site: SITE_PILOT, line: TECHNOLOGY.pilotRow, statement: TECHNOLOGY.pilotCapacity },
  { site: SITE_DEMO, line: TECHNOLOGY.demoRow, statement: TECHNOLOGY.demoCapacity },
  { site: SITE_COMM, line: TECHNOLOGY.commercialRow, statement: TECHNOLOGY.commercialCapacity },
];

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'client');

let assets: Assets | null = null;

function loadAssets(): Assets {
  if (assets) return assets;
  const resolved: Assets = { script: '/assets/index.js', stylesheets: [] };
  try {
    const manifest = JSON.parse(
      readFileSync(join(CLIENT_ROOT, '.vite', 'manifest.json'), 'utf8'),
    ) as Record<string, { file?: string; css?: string[]; isEntry?: boolean }>;
    const sheets = new Set<string>();
    for (const chunk of Object.values(manifest)) {
      for (const sheet of chunk.css ?? []) sheets.add(`/${sheet}`);
      if (!chunk.file) continue;
      if (chunk.file.endsWith('.css')) sheets.add(`/${chunk.file}`);
      if (chunk.isEntry && chunk.file.endsWith('.js')) resolved.script = `/${chunk.file}`;
    }
    resolved.stylesheets = [...sheets];
    assets = resolved;
  } catch (error) {
    console.error('ssr: the client manifest could not be read', error);
  }
  return resolved;
}

function escapeForScript(value: string): string {
  return value.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function documentFor(state: PageState): string {
  const meta = metaFor(state.route);
  const { script, stylesheets } = loadAssets();
  const body = render(createElement(App, { state }));
  const payload = escapeForScript(JSON.stringify(state));

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeAttribute(meta.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(meta.description)}">`,
    meta.noindex ? '<meta name="robots" content="noindex">' : '',
    // Marks the document as arriving before first paint so the page can fade in; only set when
    // scripting runs, so a document without script is never left hidden.
    '<script>document.documentElement.classList.add("page-arriving")</script>',
    ...FONT_FILES.map(
      (href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>`,
    ),
    ...stylesheets.map((href) => `<link rel="stylesheet" href="${href}">`),
    `<link rel="modulepreload" href="${script}">`,
  ]
    .filter(Boolean)
    .join('');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    head,
    '</head>',
    '<body>',
    `<div id="app">${body}</div>`,
    `<script id="page-data" type="application/json">${payload}</script>`,
    `<script type="module" src="${script}"></script>`,
    '</body>',
    '</html>',
  ].join('');
}

async function stageFlows(): Promise<StageFlow[]> {
  const [runs, consumptions, outputs] = await Promise.all([
    all<RunRow>('run'),
    all<ConsumptionRow>('consumption'),
    all<OutputRow>('output'),
  ]);
  const runType = new Map<string, string>(runs.map((run) => [run.reference, run.run_type]));
  const flows = new Map<string, StageFlow>(
    RUN_STAGES.map((stage) => [
      stage.run_type,
      { run_type: stage.run_type, label: stage.label, in_g: 0, out_g: 0, byproduct_g: 0 },
    ]),
  );
  for (const consumption of consumptions) {
    const flow = flows.get(runType.get(consumption.run) ?? '');
    if (flow) flow.in_g += consumption.mass_g;
  }
  for (const output of outputs) {
    const flow = flows.get(runType.get(output.run) ?? '');
    if (!flow) continue;
    if (output.kind === 'byproduct') flow.byproduct_g += output.mass_g;
    else flow.out_g += output.mass_g;
  }
  const ordered: StageFlow[] = [];
  for (const stage of RUN_STAGES) {
    const flow = flows.get(stage.run_type);
    if (flow) ordered.push(flow);
  }
  return ordered;
}

async function capacityRows(): Promise<{ capacity: CapacityView[]; capacity_basis: string }> {
  const sites = await all<SiteRow>('site');
  const bySite = new Map(sites.map((site) => [site.reference, site]));
  const capacity: CapacityView[] = [];
  for (const line of CAPACITY_LINES) {
    const site = bySite.get(line.site);
    if (!site) continue;
    capacity.push({
      site: site.reference,
      line: line.line,
      statement: line.statement,
      nameplate_kg: site.nameplate_kg,
      contracted_kg: site.contracted_kg,
      confidence: site.confidence,
    });
  }
  return { capacity, capacity_basis: sites[0]?.capacity_basis ?? '' };
}

async function publishedContentBp(): Promise<number | null> {
  const certificates = await all<CertificateRow>('certificate', 'number');
  const graded = certificates
    .filter((certificate) => certificate.grade === GRADE_N6)
    .sort((left, right) => left.signed_at.localeCompare(right.signed_at));
  const issued = graded.filter((certificate) => certificate.state === 'issued');
  const chosen = issued[issued.length - 1] ?? graded[graded.length - 1];
  return chosen ? chosen.content_bp : null;
}

async function partyNameAt(party: string, on: string): Promise<string> {
  const versions = await where<PartyVersionRow>('party_version', 'party', party, 'effective_from');
  const inForce = versions.filter((version) => version.effective_from <= on);
  const chosen = inForce[inForce.length - 1] ?? versions[0];
  return chosen?.name ?? party;
}

function unknownCertificate(number: string): VerifyView {
  return {
    found: false,
    number,
    state: null,
    issued_on: null,
    withdrawn_on: null,
    withdrawal_reason: null,
    site: null,
    grade: null,
    claim_type: null,
    recipient_name: null,
  };
}

async function verifyView(number: string): Promise<VerifyView> {
  const certificate = await byKey<CertificateRow>('certificate', 'number', number);
  if (!certificate) return unknownCertificate(number);
  return {
    found: true,
    number: certificate.number,
    state: certificate.state,
    issued_on: dateOnly(certificate.signed_at),
    withdrawn_on: certificate.withdrawn_on,
    withdrawal_reason: certificate.withdrawal_reason,
    site: certificate.site,
    grade: certificate.grade,
    claim_type: certificate.claim_type,
    recipient_name: await partyNameAt(certificate.recipient, todayIso()),
  };
}

async function claimViews(): Promise<ClaimView[]> {
  const [rows, content_bp] = await Promise.all([
    all<ClaimSubstantiationRow>('claim_substantiation'),
    publishedContentBp(),
  ]);
  return rows.map((row) => ({
    reference: row.reference,
    claim: row.claim,
    grade: row.grade,
    claim_type: row.claim_type,
    scheme: row.scheme,
    evidence: row.evidence,
    content_bp: row.grade === GRADE_N6 ? content_bp : null,
  }));
}

async function productState(): Promise<PageState> {
  const [specifications, claims] = await Promise.all([
    all<SpecificationRow>('specification', 'version'),
    claimViews(),
  ]);
  const graded = specifications.filter((row) => row.grade === GRADE_N6);
  const current = graded.find((row) => row.state === 'current') ?? graded[graded.length - 1];
  return {
    route: 'product',
    data: {
      specification: current
        ? {
            grade: current.grade,
            version: current.version,
            issued_on: current.issued_on,
            properties: current.properties as unknown as SpecificationProperty[],
            virgin_reference: current.virgin_reference,
          }
        : null,
      claims,
    },
  };
}

function emptyFor(route: PublicRouteId): PageState {
  switch (route) {
    case 'home':
      return { route: 'home', data: { stages: [] } };
    case 'product':
      return { route: 'product', data: { specification: null, claims: [] } };
    case 'technology':
      return { route: 'technology', data: { stages: [], capacity: [], capacity_basis: '' } };
    case 'about':
      return { route: 'about', data: { statistics: [] } };
    case 'careers':
      return { route: 'careers', data: { positions: [] } };
    case 'news':
      return { route: 'news', data: { items: [] } };
    case 'contact':
      return { route: 'contact', data: { routing: [] } };
    case 'privacy':
      return { route: 'privacy', data: {} };
  }
}

async function stateFor(route: PublicRouteId): Promise<PageState> {
  switch (route) {
    case 'home':
      return { route: 'home', data: { stages: await stageFlows() } };
    case 'product':
      return productState();
    case 'technology': {
      const [stages, capacity] = await Promise.all([stageFlows(), capacityRows()]);
      return { route: 'technology', data: { stages, ...capacity } };
    }
    case 'about':
      return { route: 'about', data: { statistics: await all<StatisticRow>('statistic', 'key') } };
    case 'careers':
      return { route: 'careers', data: { positions: await all<PositionRow>('position') } };
    case 'news':
      return { route: 'news', data: { items: await all<NewsItemRow>('news_item', 'date') } };
    case 'contact':
      return {
        route: 'contact',
        data: {
          routing: Object.entries(ENQUIRY_ROUTING).map(([type, routing]) => ({
            type,
            destination: routing.destination,
            response_days: routing.response_days,
          })),
        },
      };
    case 'privacy':
      return { route: 'privacy', data: {} };
  }
}

function html(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function identityFrom(token: string | undefined): Identity | null {
  if (!token) return null;
  const session = readSessionToken(token);
  if (!session) return null;
  return {
    email: session.email,
    name: session.name,
    roles: [session.role],
    sites: session.sites,
  };
}

export const pageRoutes = new Hono<AppEnv>();

const PUBLIC_PAGES: readonly { path: string; route: PublicRouteId }[] = [
  { path: '/', route: 'home' },
  { path: '/product', route: 'product' },
  { path: '/technology', route: 'technology' },
  { path: '/about', route: 'about' },
  { path: '/careers', route: 'careers' },
  { path: '/news', route: 'news' },
  { path: '/contact', route: 'contact' },
  { path: '/privacy', route: 'privacy' },
];

for (const page of PUBLIC_PAGES) {
  pageRoutes.get(page.path, async () => {
    let state: PageState;
    try {
      state = await stateFor(page.route);
    } catch (error) {
      console.error(`ssr: ${page.path} could not read its data`, error);
      state = emptyFor(page.route);
    }
    return html(documentFor(state));
  });
}

pageRoutes.get('/verify/:number', async (c) => {
  const number = c.req.param('number');
  let answer: VerifyView;
  try {
    answer = await verifyView(number);
  } catch (error) {
    console.error('ssr: /verify could not read the register', error);
    answer = unknownCertificate(number);
  }
  return html(documentFor({ route: 'verify', data: { answer } }));
});

pageRoutes.get('/login', () => html(documentFor({ route: 'login', data: {} })));

function consoleShell(c: Context<AppEnv>): Response {
  const identity = identityFrom(getCookie(c, SESSION_COOKIE));
  if (!identity) return c.redirect('/login', 302);
  return html(documentFor({ route: 'console', data: { identity } }));
}

pageRoutes.get('/console', consoleShell);
pageRoutes.get('/console/*', consoleShell);
