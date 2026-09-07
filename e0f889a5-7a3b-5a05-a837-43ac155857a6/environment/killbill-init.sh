#!/usr/bin/env sh
set -eu

BASE="${PAYMENTS_API_URL:-http://killbill:8080}"
USER="${PAYMENTS_ADMIN_USER:-orbit-admin}"
PASS="${PAYMENTS_ADMIN_PASSWORD:-kb-admin-9c41f7be}"
KEY="${PAYMENTS_API_KEY:-orbit-labs}"
SECRET="${PAYMENTS_API_SECRET:-orbit-labs-secret-9f14c73e}"

fail() {
    echo "killbill-init: $1" >&2
    exit 1
}

i=0
while [ "$i" -lt 180 ]; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
           "$BASE/1.0/healthcheck" 2>/dev/null || echo 000)
    [ "$code" = "200" ] && break
    i=$((i + 1))
    sleep 2
done
[ "$i" -lt 180 ] || fail "never became healthy"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -u "$USER:$PASS" \
       -H 'Content-Type: application/json' -H 'X-Killbill-CreatedBy: init' \
       -d "{\"apiKey\":\"$KEY\",\"apiSecret\":\"$SECRET\"}" \
       "$BASE/1.0/kb/tenants")
case "$code" in
    2*|409) ;;
    401|403) fail "tenant create refused the admin credential (HTTP $code)" ;;
    *) fail "tenant create failed with HTTP $code" ;;
esac

seed_account() {
    name="$1"; key="$2"; email="$3"; currency="$4"; country="$5"
    found=$(curl -s -o /dev/null -w "%{http_code}" -u "$USER:$PASS" \
            -H "X-Killbill-ApiKey: $KEY" -H "X-Killbill-ApiSecret: $SECRET" \
            "$BASE/1.0/kb/accounts?externalKey=$key")
    [ "$found" = "200" ] && return 0
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -u "$USER:$PASS" \
           -H "X-Killbill-ApiKey: $KEY" -H "X-Killbill-ApiSecret: $SECRET" \
           -H 'X-Killbill-CreatedBy: init' -H 'Content-Type: application/json' \
           -d "{\"name\":\"$name\",\"externalKey\":\"$key\",\"email\":\"$email\",\"currency\":\"$currency\",\"country\":\"$country\"}" \
           "$BASE/1.0/kb/accounts")
    case "$code" in
        2*) ;;
        *) fail "account $key create failed with HTTP $code" ;;
    esac
}

seed_account "Amelia Ortega"     "orbit-amelia"    "amelia.ortega@orbit-labs.com"  "EUR" "ES"
seed_account "Acme Partner Ltd"  "orbit-acme"      "accounts@acme-partner.example.com" "EUR" "IE"
seed_account "Northwind Trading" "orbit-northwind" "billing@northwind.example.com"     "USD" "US"

for key in orbit-amelia orbit-acme orbit-northwind; do
    code=$(curl -s -o /dev/null -w "%{http_code}" -u "$USER:$PASS" \
           -H "X-Killbill-ApiKey: $KEY" -H "X-Killbill-ApiSecret: $SECRET" \
           "$BASE/1.0/kb/accounts?externalKey=$key")
    [ "$code" = "200" ] || fail "verification: account $key is absent after seeding (HTTP $code)"
done

echo "killbill-init: tenant and accounts ready"
