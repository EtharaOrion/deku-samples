# Cirrus - how to sign in

The site is open to read: every public route (`/`, `/works`, `/works/{slug}`,
`/talents`, `/talents/{slug}`, `/about`) needs no account.

The studio (`/studio`) is for producers. All seeded accounts use the same
password:

    deku-demo-pw-2026

| Account | Role | House | Sign in at |
|---|---|---|---|
| `producer@example.com` | producer | `cirrus` (the house this deployment publishes) | `/studio/login` |
| `producer.meridian@example.com` | producer | `meridian` (uses the same studio; can read nothing of `cirrus`) | `/studio/login` |
| `viewer@example.com` | viewer | none (reads the site and nothing more) | `/studio/login` |

Open signup at `/signup` always issues a `viewer` with no house.

## What each account can do

- A **visitor** (no account) reads every published route and cannot reach any
  studio route, any unlisted record, or the generated pixels of one.
- A **viewer** can do exactly what a visitor can, and nothing more.
- A **producer** can, inside their own house only, create works and talents,
  attach media and credits, reorder the index, mint a 15-minute preview token,
  publish and unlist. A producer of `meridian` naming a `cirrus` record at any
  studio address is answered not found, exactly as a record that does not
  exist, and the record is left unchanged.

## The studio in one paragraph

Sign in at `/studio/login`, land on the palette, type a name, choose
`New talent` or `New work`, fill the record at its own address, attach a
poster (a written alternative is required before publishing), mint a preview
token and open `/preview/{token}` to see the record exactly as a visitor will,
then publish to land on the confirmation page.
