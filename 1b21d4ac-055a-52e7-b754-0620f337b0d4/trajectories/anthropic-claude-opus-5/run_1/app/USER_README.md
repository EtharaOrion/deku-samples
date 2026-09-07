# Cirrus

The public site of a production house in Paris. It shows the work as a numbered
index of twelve entries, shows the roster one name at a time filtered by
discipline, and opens a conversation through one mail address. Behind a private
studio, one producer per house adds a talent, attaches media, and publishes a
profile to the public roster or holds it unlisted.

This deployment publishes the house `cirrus`. A second house, `meridian`, has no
public surface here and exists because its producer uses the same studio.

## Signing in

Sign in at **`/studio/login`**. Every seeded account uses the same password.

**Password for all three accounts: `deku-demo-pw-2026`**

| Email | Password | Role | House | What they can reach |
|---|---|---|---|---|
| `producer@example.com` | `deku-demo-pw-2026` | `producer` | `cirrus` | The studio, and every `cirrus` record: create, edit, attach media, reorder, preview, publish, unlist |
| `producer.meridian@example.com` | `deku-demo-pw-2026` | `producer` | `meridian` | The studio, and **only** `meridian` records. Every `cirrus` record answers not found at every studio address |
| `viewer@example.com` | `deku-demo-pw-2026` | `viewer` | none | Every public route, and nothing more. No studio route, nothing unlisted |

Signup at `/signup` is open and always issues a `viewer` with no house.

No account is needed to read anything public.

## Walking the product

**As a visitor.** Open `/`, watch the counter reach `100%` and the veil clear,
point at a still to read its title beside the pointer, and press it to land on
that film. Cross to `/works` for the numbered index, where every still rests
colourless and gives its colour back on hover. Open `/talents`, press
`PHOTOGRAPHER` in the left margin, and the set becomes `Camille Ferrand`; arrow
keys advance the roster.

**As the `cirrus` producer.** Sign in at `/studio/login`, and `/studio` opens on
a command palette. Type to filter the house's records by title or slug, or
choose `New talent`, `New work`, `Reorder index` or `Preview`. Fill the form at
`/studio/talents/new`, give the poster a written alternative, mint a preview
token, open the preview, then publish. You land on a confirmation naming the
record, its public address and the discipline it now carries, and the new name
is on the roster with its discipline in the filter.

## What is unlisted, and what that means

`Noor Vasquez` (a stylist) and `The Quiet Room` are seeded unlisted. An unlisted
record is **absent, not merely unlinked**:

- it is not in the roster, the discipline set, the works index or the entry cluster
- its own address answers a real not-found status
- **its generated pixels are unreachable** at `/api/media/{media_id}`, even to
  someone who copied that address out of the studio, and even to a signed-in
  `viewer` or the other house's producer

Only that record's own house producer can fetch them.

A preview token is 32 lowercase hex characters, is scoped to exactly one record
and its house, and is good for 15 minutes. `/preview/{token}` renders the record
through the published route's own components, carries a `PREVIEW - NOT PUBLISHED`
marker, and is kept out of every shared cache and out of every index. Without a
producer session it renders nothing and reveals nothing about what exists.

## The house boundary

Authorization is enforced server-side on **every** `/api/studio/` endpoint,
reads included. Hiding a control in the page is presentation only; the server
refuses the call regardless of what the page drew.

A producer of `meridian` naming a `cirrus` record at any studio address is
answered exactly as one naming a record that does not exist — a not-found
status, with the record unchanged — so the answer never confirms the record is
real. That holds for reading, editing, attaching media, publishing, unlisting,
reordering and minting a preview token alike.

## The API

Served on the same origin under `/api`. `GET /api/health` returns `200` once the
roster can be read. Anything returning a collection returns it as a JSON array
at the top level.

Bearer auth is required on every `/api/studio/` endpoint and on nothing else.
Exchange an address and password at `POST /api/auth/login` for a token, then
send it as `Authorization: Bearer <token>`.

```
curl -s -X POST http://<host>/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"producer@example.com","password":"deku-demo-pw-2026"}'
```

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /api/health` | none | `200` once ready |
| `POST /api/auth/signup` | none | a new `viewer` and a token |
| `POST /api/auth/login` | none | a bearer token |
| `GET /api/works` | none | the 12 published works in ordinal order |
| `GET /api/works/{slug}` | none | one work with its media, credits and neighbours |
| `GET /api/talents?discipline=` | none | the published talents |
| `GET /api/talents/{slug}` | none | one talent with its derived selected work |
| `GET /api/disciplines` | none | the derived set, in first appearance order |
| `GET /api/media/{media_id}` | conditional | the generated image |
| `GET /api/preview/{token}` | `producer` | one unlisted record, for its own house |
| `GET /api/studio/items?kind=` | `producer` | the caller's own house's records |
| `GET /api/studio/items/{id}` | `producer` | one of them |
| `POST /api/studio/items` | `producer` | the created record, unlisted |
| `PATCH /api/studio/items/{id}` | `producer` | the updated record |
| `POST /api/studio/items/{id}/publish` | `producer` | the record with `published_at` |
| `POST /api/studio/items/{id}/media` | `producer` | the created media row |
| `POST /api/studio/items/{id}/credits` | `producer` | the created credit |
| `POST /api/studio/items/{id}/slug` | `producer` | the record at its new slug |
| `POST /api/studio/works/order` | `producer` | the works in their new order |
| `POST /api/studio/preview-tokens` | `producer` | `{token, expires_at}` |

## Notes worth knowing

- **Nothing is uploaded and no binary ships.** A media row stores a `seed`, a
  `width`, a `height` and an `alt`, and the app draws the image from that seed,
  so the same record always produces the same picture across reloads.
- **Ordinals, the discipline set, a talent's selected work and a work's
  neighbours are derived at read time**, never stored. Unlisting the fifth of
  twelve leaves eleven numbered `001` to `011`, contiguous by construction.
- **A slug is assigned once and never changes with the title.** Changing one
  deliberately at `POST /api/studio/items/{id}/slug` leaves the old address
  redirecting permanently. Uniqueness per house per kind is held by a database
  index, so two simultaneous creates of one slug cannot both land.
- **Publishing a record whose poster `alt` is empty is refused** and nothing
  changes.
- PostgreSQL is the only place a record lives, addressed by `DATABASE_URL`. The
  schema and the seed are applied at container start, once and idempotently:
  restarting does not duplicate rows.
- The typefaces are Fraunces (display) and Inter (interface), both open-licence
  variable fonts under the SIL Open Font License, subset to what this site sets.
