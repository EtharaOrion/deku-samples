# Cirrus — studio accounts

The studio is at `/studio`. Signup is open but always issues a `viewer` with no house;
a viewer can never reach a studio route. Only the seeded producers below can.

All seeded accounts use the password:

```
deku-demo-pw-2026
```

| Email | Role | House |
|---|---|---|
| `producer@example.com` | producer | `cirrus` (the house this deployment publishes) |
| `producer.meridian@example.com` | producer | `meridian` |
| `viewer@example.com` | viewer | none |

Sign in at `/studio/login` with an email and the password above.

- The `cirrus` producer owns every record of the house `cirrus` and can create,
  edit, attach media and credits to, reorder, preview and publish them.
- The `meridian` producer owns only `meridian` records and is answered "not found"
  for every `cirrus` record, at every studio address.
- `viewer@example.com` is a signed-up reader: it can read exactly what a visitor
  reads and nothing more.
