#!/bin/bash
# Void invoices raised on an account during local testing, so the graded account
# is left holding only what the graded journey itself creates.
KEY=${1:?usage: kb-clean.sh <externalKey>}
AUTH=(-u "$PAYMENTS_ADMIN_USER:$PAYMENTS_ADMIN_PASSWORD"
      -H "X-Killbill-ApiKey: $PAYMENTS_API_KEY"
      -H "X-Killbill-ApiSecret: $PAYMENTS_API_SECRET"
      -H "Content-Type: application/json"
      -H "X-Killbill-CreatedBy: vela-cleanup")
ID=$(curl -s "${AUTH[@]}" "$PAYMENTS_API_URL/1.0/kb/accounts?externalKey=$KEY" \
     | python3 -c 'import sys,json
try: print(json.load(sys.stdin)["accountId"])
except Exception: print("")')
[ -z "$ID" ] && echo "no account for $KEY" && exit 0
for INV in $(curl -s "${AUTH[@]}" "$PAYMENTS_API_URL/1.0/kb/accounts/$ID/invoices?includeInvoiceComponents=true" \
             | python3 -c 'import sys,json
for i in json.load(sys.stdin):
    if i["status"] != "VOID": print(i["invoiceId"])'); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${AUTH[@]}" -X PUT "$PAYMENTS_API_URL/1.0/kb/invoices/$INV/voidInvoice")
  echo "void $INV -> $code"
done
