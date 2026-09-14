export async function actorName(c, email) {
  if (!email) return null;
  const r = await c.query(`SELECT current_name FROM parties WHERE reference=$1`, [email]);
  return r.rows.length ? r.rows[0].current_name : email;
}
export const floorDivSafe = (a, b) => (b ? Math.floor(a / b) : 0);
