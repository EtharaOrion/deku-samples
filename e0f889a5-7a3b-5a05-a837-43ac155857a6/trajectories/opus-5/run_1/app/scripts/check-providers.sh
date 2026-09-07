#!/usr/bin/env bash
# Read the money and the mail back out of the providers themselves, never out
# of this app, because a confirmation the app returns to itself does not count.
set -u
KEY="${1:-customer@example.com}"
KB="$PAYMENTS_API_URL"
H=(-u "$PAYMENTS_ADMIN_USER:$PAYMENTS_ADMIN_PASSWORD"
   -H "X-Killbill-ApiKey: $PAYMENTS_API_KEY"
   -H "X-Killbill-ApiSecret: $PAYMENTS_API_SECRET")

printf '\n== killbill account for externalKey=%s\n' "$KEY"
ACC=$(curl -s "${H[@]}" "$KB/1.0/kb/accounts?externalKey=$KEY" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
    print(d["accountId"])
except Exception:
    print("")
')
if [ -z "$ACC" ]; then
  echo "no account"
  exit 1
fi
echo "accountId $ACC"

printf '\n== invoices on that account\n'
curl -s "${H[@]}" "$KB/1.0/kb/accounts/$ACC/invoices?includeInvoiceComponents=true" | python3 -c '
import json,sys
rows=json.load(sys.stdin)
live=[i for i in rows if i["status"]!="VOID"]
print("invoice count (not void):", len(live))
for i in live:
    print("  amount", i["amount"], i["currency"], i["status"], "items:",
          [(it["description"], it["amount"]) for it in (i.get("items") or [])])
'

printf '\n== mailpit, messages to %s\n' "$KEY"
curl -s "http://${SMTP_HOST}:8025/api/v1/messages?limit=50" | python3 -c '
import json,sys,os
key=os.environ.get("KEY_ADDR")
d=json.load(sys.stdin)
mine=[m for m in d["messages"] if any(t["Address"].lower()==key for t in m["To"])]
print("total in mailbox:", d["total"], "| to this address:", len(mine))
for m in mine:
    print("  subject:", repr(m["Subject"]))
    print("  to:", [t["Address"] for t in m["To"]], "cc:", m.get("Cc"), "bcc:", m.get("Bcc"))
' KEY_ADDR="$KEY"
