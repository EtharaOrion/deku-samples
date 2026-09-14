#!/bin/bash
# dev helper: starts the app in the foreground with local service addresses
cd /app
export DATABASE_URL AUTH_ISSUER_URL AUTH_CLIENT_ID AUTH_CLIENT_SECRET SMTP_HOST SMTP_PORT
export PORT=4173
exec node server/index.js
