import { Hono } from 'hono';
import { q } from '../db.js';
import { readAt, refusePagination } from '../lib/http.js';

const pub = new Hono();

pub.get('/sites', async (c) => {
  const r = await q('SELECT * FROM site ORDER BY reference');
  return c.json(r.rows.map((s) => ({
    reference: s.reference, name: s.name, confidence: s.confidence, certification_state: s.certification_state,
    nameplate_kg: Number(s.nameplate_kg), contracted_kg: Number(s.contracted_kg),
    uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg),
    capacity_basis: s.capacity_basis, last_revised: s.last_revised
  })));
});

pub.get('/sites/:reference/capacity', async (c) => {
  const r = await q('SELECT * FROM site WHERE reference = $1', [c.req.param('reference')]);
  if (!r.rows.length) return c.json({ error: 'not_found' }, 404);
  const s = r.rows[0];
  return c.json({
    nameplate_kg: Number(s.nameplate_kg), basis: s.capacity_basis, contracted_kg: Number(s.contracted_kg),
    uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg), confidence: s.confidence, last_revised: s.last_revised
  });
});

pub.get('/statistics', async (c) => {
  refusePagination(c);
  const r = await q('SELECT * FROM statistic ORDER BY key');
  return c.json(r.rows.map((s) => ({ key: s.key, value: s.value, source: s.source, year: s.year, geography: s.geography })));
});

pub.get('/positions', async (c) => {
  refusePagination(c);
  const r = await q('SELECT * FROM position ORDER BY closes_on');
  return c.json(r.rows.map((p) => ({ title: p.title, location: p.location, department: p.department, contract_type: p.contract_type, closes_on: p.closes_on })));
});

pub.get('/news', async (c) => {
  refusePagination(c);
  const r = await q('SELECT * FROM news_item ORDER BY dated DESC');
  return c.json(r.rows.map((n) => ({ title: n.title, tag: n.tag, outlet: n.outlet, dated: n.dated, link: n.link, language: n.language })));
});

pub.get('/claim-register', async (c) => {
  refusePagination(c);
  const r = await q('SELECT * FROM claim_substantiation ORDER BY first_published');
  return c.json(r.rows.map((s) => ({
    claim: s.claim, route: s.route, first_published: s.first_published, evidence: s.evidence,
    method_version: s.method_version, approver: s.approver, review_on: s.review_on, state: s.state
  })));
});

pub.get('/parties/:reference/versions', async (c) => {
  const r = await q('SELECT name, effective_from FROM party_version WHERE reference = $1 ORDER BY effective_from', [c.req.param('reference')]);
  return c.json(r.rows.map((p) => ({ name: p.name, effective_from: p.effective_from })));
});

export default pub;
