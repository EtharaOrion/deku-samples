#!/bin/sh
# Starts the app in the foreground on 0.0.0.0:4173.
# Every service address is read from the environment.
set -e
cd "$(dirname "$0")"
exec node dist/server.js
