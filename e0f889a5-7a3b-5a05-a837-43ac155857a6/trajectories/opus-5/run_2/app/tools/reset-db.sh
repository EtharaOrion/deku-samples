#!/bin/bash
# Drop every table this app owns, so the next start re-applies the schema and
# the seed from scratch. This is what grading does by recreating the database.
psql "$DATABASE_URL" -q <<'SQL'
DROP TABLE IF EXISTS flash_session, device_ownership, device, order_line, "order",
  cart_line, cart, product_block, inventory_level, variant, product, customer,
  app_release, firmware, auth_token, order_sequence, delivery_method CASCADE;
SQL
echo "schema dropped"
