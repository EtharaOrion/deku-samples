# Ravel — sign-in

Signup is closed. The seven seeded accounts are the only accounts, each
authenticates at the identity provider, and every one signs in with the same
password:

    deku-demo-pw-2026

| Email | Role | Sites |
|---|---|---|
| `plant@example.com` | plant operator | `SITE-DEMO`, `SITE-PILOT` |
| `analyst@example.com` | laboratory analyst | `SITE-DEMO`, `SITE-PILOT` |
| `quality@example.com` | quality manager | `SITE-DEMO`, `SITE-PILOT` |
| `claims@example.com` | claims manager | `SITE-DEMO`, `SITE-PILOT` |
| `signer@example.com` | certificate signer | `SITE-DEMO`, `SITE-PILOT` |
| `signer2@example.com` | certificate signer | `SITE-PILOT` |
| `auditor@example.com` | auditor (reads everything, writes nothing) | `SITE-DEMO`, `SITE-PILOT` |

There is no signup, no password reset and no self-service account creation.

The console is at `/console` and everything under it redirects an anonymous
reader to `/login`. The public site needs no account; `/verify/{number}` is
public and rate limited.
