Vela — how to sign in
=====================

Signup is open. Two accounts are seeded so the ownership boundary is real.
Both use the same password:

    deku-demo-pw-2026

| Email                  | Name        | Who |
|------------------------|-------------|-----|
| `customer@example.com` | Iris Vantaa | The seeded customer. Owns `VC2609PVDA7Q` (Vela Cricket, Graphite) and order `VE-2026-0001`. |
| `customer2@example.com`| Rune Halden | The other seeded customer. Owns `VA2609NRWB2Z` (Vela A1, Sand). |

Sign in at `/sign-in` with the email and the password above.

Guest checkout needs no account: add to the cart, check out, and enter an email
at the first step. The order is then reachable by its access token, and the
invoice is raised in killbill on an account keyed by that email lowercased.

The app is served on port 4173 inside the container; the public port is whatever
`APP_PUBLIC_PORT` maps it to.
