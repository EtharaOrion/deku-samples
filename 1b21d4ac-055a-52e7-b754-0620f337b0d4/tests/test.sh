#!/bin/bash

mkdir -p /logs/verifier

cat > /logs/verifier/reward.json <<'EOF'
{"reward": 0.0}
EOF

: "${APP_PUBLIC_URL:?APP_PUBLIC_URL is not set}"
APP_PUBLIC_URL="${APP_PUBLIC_URL%/}"
export APP_PUBLIC_URL

: "${APP_PUBLIC_PORT:=4173}"
export APP_PUBLIC_PORT
APP_LOG=/logs/verifier/app.log
: "${DOCKER_HOST:=tcp://dockerd:2375}"
export DOCKER_HOST
APP_ENV_VARS="APP_PUBLIC_PORT PORT DATABASE_URL DB_URL SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS
  PAYMENTS_API_URL PAYMENTS_API_KEY PAYMENTS_API_SECRET PAYMENTS_ADMIN_USER PAYMENTS_ADMIN_PASSWORD
  EMAIL_INBOX_API_URL"
if curl -s -o /dev/null --max-time 3 "${APP_PUBLIC_URL}/api/health" 2>/dev/null; then
  echo "app already serving at ${APP_PUBLIC_URL}; not starting it" >&2
elif [ -f /app/Dockerfile ] && command -v docker >/dev/null 2>&1 \
     && docker info >/dev/null 2>&1; then
  echo "building /app/Dockerfile on ${DOCKER_HOST} (log: /logs/verifier/app_build.log)" >&2
  if docker build -t deku-app /app >/logs/verifier/app_build.log 2>&1; then
    APP_PUBLIC_URL="http://dockerd:${APP_PUBLIC_PORT}"
    export APP_PUBLIC_URL
    ENV_FLAGS="-e APP_PUBLIC_URL"
    for v in $APP_ENV_VARS; do
      eval "val=\${$v:-}"
      [ -n "$val" ] && ENV_FLAGS="$ENV_FLAGS -e $v"
    done
    docker run -d --name deku-app --network host $ENV_FLAGS deku-app >>"$APP_LOG" 2>&1 \
      || echo "  docker run failed; see ${APP_LOG}" >&2
    trap 'docker logs deku-app >>"$APP_LOG" 2>&1 || true' EXIT
    echo "  app container started; grading ${APP_PUBLIC_URL}" >&2
  else
    echo "  docker build of /app failed; see /logs/verifier/app_build.log" >&2
  fi
elif [ -f /app/run.json ]; then
  echo "starting the app from /app/run.json (log: ${APP_LOG})" >&2
  manifest() { python3 -c 'import json,sys; print(json.load(open("/app/run.json")).get(sys.argv[1]) or "")' "$1"; }
  INSTALL="$(manifest install)"; BUILD="$(manifest build)"; SERVE="$(manifest serve)"
  if [ -n "$INSTALL" ]; then
    (cd /app && sh -c "$INSTALL") >>"$APP_LOG" 2>&1 || echo "  install step failed; see ${APP_LOG}" >&2
  fi
  if [ -n "$BUILD" ]; then
    (cd /app && sh -c "$BUILD") >>"$APP_LOG" 2>&1 || echo "  build step failed; see ${APP_LOG}" >&2
  fi
  if [ -n "$SERVE" ]; then
    (cd /app && setsid sh -c "$SERVE" >>"$APP_LOG" 2>&1 < /dev/null &)
  else
    echo "  /app/run.json has no serve command" >&2
  fi
elif [ -f /app/start.sh ]; then
  echo "starting the app from /app/start.sh (log: ${APP_LOG})" >&2
  (cd /app && setsid bash /app/start.sh >>"$APP_LOG" 2>&1 < /dev/null &)
else
  echo "nothing serves ${APP_PUBLIC_URL} and /app has no Dockerfile (with a daemon), run.json" >&2
  echo "or start.sh to start it" >&2
  echo "the deploy gate below will record the app as not deployed." >&2
fi

DEPLOYED=0.0
HEALTH_CODE=""
for _ in $(seq 1 30); do
  HEALTH_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
                "${APP_PUBLIC_URL}/api/health" 2>/dev/null)
  if [ "$HEALTH_CODE" = "200" ]; then
    DEPLOYED=1.0
    break
  fi
  sleep 5
done

if [ "$DEPLOYED" != "1.0" ] && [ "$HEALTH_CODE" = "404" ]; then
  echo "no /api/health endpoint (404); falling back to GET / for the deploy gate" >&2
  if curl -fsS --max-time 10 "${APP_PUBLIC_URL}/" > /dev/null 2>&1; then
    DEPLOYED=1.0
  fi
elif [ "$DEPLOYED" != "1.0" ]; then
  echo "deploy gate: /api/health last returned '${HEALTH_CODE:-no response}' - the app" >&2
  echo "is reporting itself NOT ready, so this is a deploy failure even if / serves." >&2
fi

if [ "$DEPLOYED" != "1.0" ]; then
  echo "app never became reachable at ${APP_PUBLIC_URL} - scoring 0" >&2
  printf '{"summary": {"reward": 0.0, "invalid": ["deploy_failed"]}}\n' \
    > /logs/verifier/workflows.json
  python3 /tests/score.py --deploy-failed \
    --rubric     /tests/rubric.json \
    --workflows  /tests/workflows.yaml \
    --out        /logs/verifier/final_score.json \
    --reward-out /logs/verifier/reward.json
  exit 0
fi

python3 - >/logs/verifier/pre_browser_counts.json 2>>/logs/verifier/pre_browser_snapshot.err <<'SNAPSHOT' || true
import json, os, sys
sys.path.insert(0, "/tests")
try:
    from capabilities import make_backend
    b = make_backend()
    counts = {}
    names = []
    if hasattr(b, "query"):
        try:
            names = [
                r.get("table_name") if isinstance(r, dict) else r[0]
                for r in b.query(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema='public' AND table_type='BASE TABLE'")
            ]
        except Exception:
            names = []
    if not names:
        names = [t for t in os.environ.get("DEKU_SNAPSHOT_TABLES", "").split(",") if t.strip()]
    for t in names:
        try:
            counts[t.strip()] = b.count(t.strip())
        except Exception:
            pass
    counts["_snapshot_ok"] = True
    json.dump(counts, sys.stdout)
except Exception as exc:
    json.dump({"_snapshot_ok": False,
               "_snapshot_error": f"{exc.__class__.__name__}: {exc}"[:300]},
              sys.stdout)
SNAPSHOT
if [ -s /logs/verifier/pre_browser_snapshot.err ]; then
  echo "  [snapshot] stderr while taking the pre-browser baseline:" >&2
  sed 's/^/    /' /logs/verifier/pre_browser_snapshot.err >&2
fi
if ! grep -q '"_snapshot_ok": *true' /logs/verifier/pre_browser_counts.json 2>/dev/null; then
  echo "  [snapshot] NO pre-browser baseline; seed-count assertions will SKIP" >&2
  echo "             rather than compare against a number nobody measured." >&2
fi

pytest /tests -rA --ctrf /logs/verifier/ctrf.json || true

if [ ! -s /logs/verifier/ctrf.json ]; then
  echo "PYTEST WROTE NO CTRF REPORT - collection failed before running any test." >&2
  echo "The reward below is a harness fault, not an agent score." >&2
  printf '{"error": "ctrf_missing"}\n' > /logs/verifier/ctrf-error.json
fi

INVALID=""
if [ ! -s /logs/verifier/ctrf.json ]; then
  INVALID="ctrf_missing"
else
  grep -q '"tests"[[:space:]]*:[[:space:]]*0[^0-9]' /logs/verifier/ctrf.json \
    && INVALID="no_tests_collected"
  # A skip leaves the pytest denominator, so a snapshot the verifier failed to
  # take would raise the score instead of lowering it. That is a harness fault.
  if [ -z "$INVALID" ] \
     && ! grep -q '"_snapshot_ok": *true' /logs/verifier/pre_browser_counts.json 2>/dev/null \
     && grep -q '"skipped"[[:space:]]*:[[:space:]]*[1-9]' /logs/verifier/ctrf.json; then
    INVALID="snapshot_failed"
  fi
fi

python3 /tests/score.py \
  --pytest    /logs/verifier/ctrf.json \
  --browser   /logs/verifier/browser_results.json \
  --judge     /logs/verifier/judge.json \
  --rubric    /tests/rubric.json \
  --workflows /tests/workflows.yaml \
  --out       /logs/verifier/final_score.json \
  --reward-out /logs/verifier/reward.json \
  --invalid   "$INVALID"

if [ -n "$INVALID" ]; then
  echo "VERIFIER FAULT: $INVALID - this run is not an agent score" >&2
fi

echo "score: $(cat /logs/verifier/reward.json)" >&2

exit 0
