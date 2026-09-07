#!/bin/sh
# Stops any node process whose command line matches the given pattern.
pattern="${1:-deku-server}"
for d in /proc/[0-9]*; do
  pid="${d#/proc/}"
  [ "$pid" = "$$" ] && continue
  if tr '\0' ' ' < "$d/cmdline" 2>/dev/null | grep -q "$pattern"; then
    kill "$pid" 2>/dev/null && echo "stopped $pid"
  fi
done
