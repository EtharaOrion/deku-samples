#!/bin/sh
# Drops every table so the app re-applies its schema and seed from scratch.
psql "$DATABASE_URL" -q -c 'DROP TABLE IF EXISTS email_log, registrations, events, calendars, accounts CASCADE;' \
  -c 'DROP FUNCTION IF EXISTS registrations_enforce_capacity() CASCADE;'
