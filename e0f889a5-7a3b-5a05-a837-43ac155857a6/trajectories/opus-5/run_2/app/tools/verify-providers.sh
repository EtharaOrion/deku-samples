#!/bin/bash
# Read the money and the mail back out of the providers themselves, never out of
# the app. The app's own confirmation does not count as evidence.
EMAIL=${1:-customer@example.com}
EXPECT=${2:-415.80}

AUTH=(-u "$PAYMENTS_ADMIN_USER:$PAYMENTS_ADMIN_PASSWORD"
      -H "X-Killbill-ApiKey: $PAYMENTS_API_KEY"
      -H "X-Killbill-ApiSecret: $PAYMENTS_API_SECRET")

echo "=== killbill: account by externalKey ${EMAIL} ==="
ACC=$(curl -s "${AUTH[@]}" "$PAYMENTS_API_URL/1.0/kb/accounts?externalKey=$EMAIL")
echo "$ACC" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    print("accountId:", d["accountId"], "| currency:", d["currency"], "| email:", d["email"])
    open("/tmp/kb_account_id", "w").write(d["accountId"])
except Exception:
    print("NO ACCOUNT")
'

if [ -s /tmp/kb_account_id ]; then
  ID=$(cat /tmp/kb_account_id)
  echo "=== killbill: invoices on that account ==="
  curl -s "${AUTH[@]}" "$PAYMENTS_API_URL/1.0/kb/accounts/$ID/invoices?includeInvoiceComponents=true&withItems=true" \
    | EXPECT="$EXPECT" python3 -c '
import sys, json, os
expect = os.environ["EXPECT"]
inv = json.load(sys.stdin)
print("invoice count:", len(inv))
hits = 0
for i in inv:
    amount = format(i["amount"], ".2f")
    mark = ""
    if amount == expect and i["currency"] == "USD":
        hits += 1
        mark = "  <-- the graded figure"
    print(f'"'"'  #{i["invoiceNumber"]} {amount} {i["currency"]} {i["status"]}{mark}'"'"')
print()
print(f"invoices matching {expect} USD: {hits}")
print("RESULT:", "PASS" if hits == 1 else ("FAIL: none" if hits == 0 else f"FAIL: {hits} duplicates"))
'
fi

echo
echo "=== mailpit: messages to ${EMAIL} ==="
curl -s "http://${SMTP_HOST}:8025/api/v1/messages?limit=50" | EMAIL="$EMAIL" python3 -c '
import sys, json, os
target = os.environ["EMAIL"]
d = json.load(sys.stdin)
msgs = d.get("messages", [])
mine = []
for m in msgs:
    tos = [t.get("Address", "").lower() for t in (m.get("To") or [])]
    if target.lower() in tos:
        mine.append(m)
print("messages in mailbox:", len(msgs), "| addressed to target:", len(mine))
for m in mine:
    cc = m.get("Cc") or []
    bcc = m.get("Bcc") or []
    print(f'"'"'  subject: {m["Subject"]!r} to={[t["Address"] for t in m["To"]]} cc={len(cc)} bcc={len(bcc)}'"'"')
'
