#!/usr/bin/env bash
# Development helper only: drop orders made while checking, so the next order
# placed is VE-2026-0002 again. Never run by the image.
set -u
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM flash_session WHERE device_id IN (SELECT id FROM device WHERE order_id IN (SELECT id FROM "order" WHERE number <> 'VE-2026-0001'));
DELETE FROM device_ownership WHERE device_id IN (SELECT id FROM device WHERE order_id IN (SELECT id FROM "order" WHERE number <> 'VE-2026-0001'));
DELETE FROM device WHERE order_id IN (SELECT id FROM "order" WHERE number <> 'VE-2026-0001');
DELETE FROM idempotency_key;
DELETE FROM order_line WHERE order_id IN (SELECT id FROM "order" WHERE number <> 'VE-2026-0001');
UPDATE cart SET converted_order_id = NULL;
DELETE FROM "order" WHERE number <> 'VE-2026-0001';
UPDATE order_counter SET last_value = 1 WHERE year = 2026;
DELETE FROM cart_line;
DELETE FROM cart;
-- put the seeded stock back
UPDATE inventory_level i SET available = s.available, committed = 0
FROM (VALUES
  ('VELA-A1-GRAPHITE',4),('VELA-A1-SAND',6),('VELA-A1-YELLOW',1),
  ('VELA-CRICKET-GRAPHITE',12),('VELA-CRICKET-YELLOW',0),
  ('VELA-MOUNT-CLAMP',0),('VELA-MOUNT-VESA',0),
  ('VELA-CASE-STD',15),('VELA-CABLE-1M',30),('VELA-CABLE-2M',30)
) AS s(sku, available)
WHERE i.variant_id = (SELECT id FROM variant WHERE sku = s.sku);
SQL
echo "test data reset"
