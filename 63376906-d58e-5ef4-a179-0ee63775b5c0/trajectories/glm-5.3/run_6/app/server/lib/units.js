export function floorDiv(a, b) {
  if (b === 0) throw new Error('division by zero');
  return Math.floor(a / b);
}

export const dryMass = (net_g, moisture_bp) => floorDiv(net_g * (10000 - moisture_bp), 10000);
export const creditGranted = (dry_mass_g, factor_bp) => floorDiv(dry_mass_g * factor_bp, 10000);
export const contentBp = (credit_attached_g, lot_mass_g) => floorDiv(credit_attached_g * 10000, lot_mass_g);
export const weightedBp = (mass_a, bp_a, mass_b, bp_b) => floorDiv(mass_a * bp_a + mass_b * bp_b, mass_a + mass_b);
export const shareBp = (part, total) => floorDiv(part * 10000, total);

export async function partyNameAt(c, party, onDate) {
  const r = await c.query(
    `SELECT name FROM party_versions WHERE party=$1 AND effective_from <= $2 ORDER BY effective_from DESC, id DESC LIMIT 1`,
    [party, onDate]
  );
  if (r.rows.length) return r.rows[0].name;
  const cur = await c.query(`SELECT current_name FROM parties WHERE reference=$1`, [party]);
  return cur.rows.length ? cur.rows[0].current_name : party;
}

export async function partyHistory(c, party) {
  const r = await c.query(`SELECT name, effective_from FROM party_versions WHERE party=$1 ORDER BY effective_from ASC, id ASC`, [party]);
  return r.rows;
}

export async function actorName(c, email) {
  if (!email) return null;
  const r = await c.query(`SELECT current_name FROM parties WHERE reference=$1`, [email]);
  return r.rows.length ? r.rows[0].current_name : email;
}

export const personRef = (email) => email || 'unknown';

export function isoDate(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export const nowIso = () => new Date().toISOString();
