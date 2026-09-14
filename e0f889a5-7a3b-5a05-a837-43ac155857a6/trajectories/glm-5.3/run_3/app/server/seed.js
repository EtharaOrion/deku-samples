import bcrypt from 'bcryptjs';
import { q, one } from './db.js';
import { SEED_PASSWORD, seedCustomers, seedProducts, seedDevices, seedOrder1, seedReleases, seedFirmware } from './seed-data.js';

export async function seed() {
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);

  for (const c of seedCustomers) {
    const existing = await one(`SELECT id FROM customer WHERE lower(email)=lower($1)`, [c.email]);
    if (!existing) await q(`INSERT INTO customer (email, name, password_hash) VALUES ($1,$2,$3)`, [c.email, c.name, hash]);
  }

  const pid = {};
  for (const p of seedProducts) {
    const ex = await one(`SELECT id FROM product WHERE handle=$1`, [p.handle]);
    const row = ex || await one(
      `INSERT INTO product (handle,title,subtitle,kind,status,support_until,position) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [p.handle, p.title, p.subtitle, p.kind, p.status, p.support_until, p.position]);
    pid[p.handle] = row.id;
    for (const [i, v] of (p.variants||[]).entries()) {
      const vex = await one(`SELECT id FROM variant WHERE sku=$1`, [v.sku]);
      const vrow = vex || await one(
        `INSERT INTO variant (product_id,sku,title,option_value,price_minor,currency,position,inventory_policy)
         VALUES ($1,$2,$3,$4,$5,'USD',$6,'deny') RETURNING id`,
        [row.id, v.sku, v.option_value, v.option_value, v.price_minor, (i+1)*10]);
      if (v.floor !== undefined) await q(`UPDATE variant SET price_minor=$2 WHERE id=$1`, [vrow.id, v.price_minor]);
      const il = await one(`SELECT variant_id FROM inventory_level WHERE variant_id=$1`, [vrow.id]);
      if (!il) await q(`INSERT INTO inventory_level (variant_id, available, committed) VALUES ($1,$2,0)`, [vrow.id, v.available]);
    }
    for (const b of (p.blocks||[])) {
      const bex = await one(`SELECT id FROM product_block WHERE product_id=$1 AND kind=$2 AND position=$3`, [row.id, b.kind, b.position]);
      if (!bex) await q(`INSERT INTO product_block (product_id,kind,position,payload) VALUES ($1,$2,$3,$4)`, [row.id, b.kind, b.position, JSON.stringify(b.payload)]);
    }
  }

  // Order 1 and its line, device allocation and ownership.
  const cust1 = await one(`SELECT id FROM customer WHERE lower(email)='customer@example.com'`);
  let o1 = await one(`SELECT id FROM orders WHERE number=$1`, [seedOrder1.number]);
  if (!o1) {
    const sub = seedOrder1.unit_price_minor * seedOrder1.quantity;
    const tax = Math.trunc(sub / 10);
    o1 = await one(
      `INSERT INTO orders (number,customer_id,email,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor,currency,status,payment_status,fulfilment_status,shipping_method,shipping_address,access_token_hash,killbill_external_key,killbill_invoice_amount,marketing_consent,placed_at)
       VALUES ($1,$2,$3,$4,0,$5,0,$6,'USD',$7,$8,$9,$10,$11,$12,$13,$14,false,$15) RETURNING id`,
      [seedOrder1.number, cust1.id, seedOrder1.email, sub, tax, sub + tax, seedOrder1.status, seedOrder1.payment_status, seedOrder1.fulfilment_status,
       seedOrder1.shipping_method, JSON.stringify(seedOrder1.address), 'seed-placeholder-not-a-real-access-token', null, null, seedOrder1.placed_at]);
    const vc = await one(`SELECT v.id, p.title FROM variant v JOIN product p ON p.id=v.product_id WHERE v.sku=$1`, [seedOrder1.sku]);
    const ol = await one(`INSERT INTO order_line (order_id,variant_id,title_snapshot,sku_snapshot,option_snapshot,quantity,unit_price_minor,total_minor)
      VALUES ($1,$2,$3,$4,$5,1,$6,$6) RETURNING id`,
      [o1.id, vc.id, vc.title, seedOrder1.sku, 'Graphite', seedOrder1.unit_price_minor]);
    // The serial that shipped with order 1.
    await q(`INSERT INTO order_line_serial (order_line_id, serial) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [ol.id, 'VC2609PVDA7Q']);
    await q(`UPDATE order_sequence SET last_seq=1 WHERE year=2026 AND last_seq<1`);
    if ((await one(`SELECT 1 FROM order_sequence WHERE year=2026`)) === null) await q(`INSERT INTO order_sequence (year,last_seq) VALUES (2026,1)`);
  }

  for (const d of seedDevices) {
    const prod = pid[d.product];
    const varr = await one(`SELECT id FROM variant WHERE sku=$1`, [d.variant]);
    let row = await one(`SELECT id, order_id, nickname FROM device d WHERE upper(serial)=upper($1)`, [d.serial]);
    if (!row) {
      row = await one(
        `INSERT INTO device (serial,product_id,variant_id,status,blocked_reason,firmware_version,firmware_reported_at,nickname,order_id,warranty_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [d.serial, prod, varr.id, d.status, d.blocked_reason||null, d.firmware, d.firmware ? '2026-08-20T10:00:00Z' : null, d.nickname, d.order ? o1.id : null, d.warranty||null]);
    }
    if (d.order === 'VE-2026-0001') await q(`UPDATE device SET order_id=$2 WHERE id=$1`, [row.id, o1.id]);
    const live = await one(`SELECT id FROM device_ownership WHERE device_id=$1 AND released_at IS NULL`, [row.id]);
    if (!live && d.owner) {
      const oc = await one(`SELECT id FROM customer WHERE lower(email)=lower($1)`, [d.owner]);
      await q(`INSERT INTO device_ownership (device_id,customer_id,order_id,method) VALUES ($1,$2,$3,$4)`,
        [row.id, oc.id, d.order ? o1.id : null, d.order ? 'order' : 'manual']);
    }
  }

  for (const r of seedReleases) {
    const ex = await one(`SELECT id FROM app_release WHERE version=$1 OR build=$2`, [r.version, r.build]);
    if (!ex) await q(
      `INSERT INTO app_release (version,build,released_on,channel,artifact_name,size_bytes,sha256,description,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [r.version, r.build, r.released_on, r.channel||'general', r.artifact_name, r.size_bytes, r.sha256, r.description, JSON.stringify(r.notes)]);
  }

  // Shipping rates: one US domestic zone.
  for (const r of [
    ['us-domestic', 'Standard', 'Standard delivery', 0, 5, 7],
    ['us-domestic', 'Express', 'Express delivery', 2500, 2, 2]
  ]) {
    const ex = await one(`SELECT 1 FROM shipping_rate WHERE zone=$1 AND method=$2`, [r[0], r[1]]);
    if (!ex) await q(`INSERT INTO shipping_rate (zone,method,label,price_minor,min_days,max_days) VALUES ($1,$2,$3,$4,$5,$6)`, r);
  }

  for (const f of seedFirmware) {
    const ex = await one(`SELECT id FROM firmware WHERE product_id=$1 AND build=$2`, [pid[f.product], f.build]);
    if (!ex) await q(
      `INSERT INTO firmware (product_id,version,build,min_firmware,min_app_version,channel,size_bytes,sha256,released_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [pid[f.product], f.version, f.build, f.min_firmware, f.min_app_version, f.channel, f.size_bytes, f.sha256, f.released_on]);
  }
}
