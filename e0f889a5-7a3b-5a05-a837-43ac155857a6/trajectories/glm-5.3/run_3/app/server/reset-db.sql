-- Dev reset: wipes app-owned rows so the seed can run from scratch.
TRUNCATE order_line_serial, flash_session, device_ownership, device, order_line, orders,
         cart_line, cart, auth_token, firmware, app_release, product_block, inventory_level,
         variant, product, customer, order_sequence, shipping_rate RESTART IDENTITY CASCADE;
