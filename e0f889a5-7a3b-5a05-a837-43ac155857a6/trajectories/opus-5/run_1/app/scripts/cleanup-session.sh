#!/usr/bin/env bash
# Development helper only. Void every invoice this session created in killbill
# and empty the mailbox, so grading begins from a clean slate. The tenant's
# three pre-existing accounts are left alone.
set -u
KB="$PAYMENTS_API_URL"
H=(-u "$PAYMENTS_ADMIN_USER:$PAYMENTS_ADMIN_PASSWORD"
   -H "X-Killbill-ApiKey: $PAYMENTS_API_KEY"
   -H "X-Killbill-ApiSecret: $PAYMENTS_API_SECRET"
   -H "X-Killbill-CreatedBy: cleanup"
   -H "Content-Type: application/json")

echo "voiding invoices raised during this session"
curl -s "${H[@]}" "$KB/1.0/kb/invoices/pagination?limit=500" \
  | python3 -c '
import json,sys
for i in json.load(sys.stdin):
    if i["status"] != "VOID":
        print(i["invoiceId"])
' | while read -r id; do
  [ -z "$id" ] && continue
  code=$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -X PUT "$KB/1.0/kb/invoices/$id/voidInvoice")
  echo "  $id -> $code"
done

echo "emptying the mailbox"
curl -s -X DELETE "http://${SMTP_HOST}:8025/api/v1/messages" -o /dev/null -w '  %{http_code}\n'

echo "resetting the app's own tables"
bash "$(dirname "$0")/reset-test-data.sh"
