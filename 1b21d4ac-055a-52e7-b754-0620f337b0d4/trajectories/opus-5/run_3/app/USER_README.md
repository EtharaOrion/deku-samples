# Cirrus

The public site of a production house in Paris, and the private studio behind it.
Server-rendered Flask and Jinja, enhanced in place by Alpine.js. PostgreSQL is the
only backing service; every pixel on the site is drawn by the app from a stored seed.

## Signing in

Every seeded account uses the same password. This is benchmark fixture data, not a
secret; it is hashed at rest as normal.

**Password for every account below: `deku-demo-pw-2026`**

| Email | Role | House | What it opens |
|---|---|---|---|
| `producer@example.com` | `producer` | `cirrus` | The studio for this deployment's own house: create, edit, preview, publish and unlist |
| `producer.meridian@example.com` | `producer` | `meridian` | The studio for the *other* house. It has no public surface here, and this account can reach no `cirrus` record at any address |
| `viewer@example.com` | `viewer` | none | Exactly what a signed-out visitor can read, and nothing more. No studio route |

Sign in at **`/studio/login`**. Signup at `/signup` is open and always issues a
`viewer` with no house, whatever the request body asks for.

## Walking the site

Public, no account needed:

| Route | What is there |
|---|---|
| `/` | The entry cluster. The counter reaches `100%`, the veil clears, and about twenty stills link to their films |
| `/works`, `/works/` | The numbered index: twelve entries, `001` to `012`. A still gives its colour back on hover |
| `/works/the-halo` | One film, its credits and its neighbours (`012` wraps to `001`) |
| `/talents`, `/talents/` | The roster, one name at a time. Press `PHOTOGRAPHER` in the left margin, or use the arrow keys |
| `/talents/rives` | One talent and the works they are credited on |
| `/about` | The house speaking. Its text sharpens as you scroll and re-blurs as you scroll back |

Producer only:

| Route | What is there |
|---|---|
| `/studio` | The command palette: type to filter this house's records, or choose an action |
| `/studio/talents/new`, `/studio/works/new` | Create a record. It is created unlisted |
| `/studio/items/{id}` | Edit one record; mint a preview token; publish or unlist |
| `/preview/{token}` | One unlisted record, rendered through the published route's own components. Good for 15 minutes |

### The producer's journey, end to end

1. Sign in at `/studio/login` as `producer@example.com`.
2. On the palette, choose **New talent**.
3. Fill in a title, a slug, a discipline, and a written alternative for the poster,
   then **Create record**. The record is unlisted: it is absent from the roster and
   404 at its own address.
4. **Mint a preview token**, then **Open the preview**. Only you can see it.
5. **Publish**. You land on the confirmation, which names the record, its public
   address and the discipline it now carries.
6. `/talents` now carries the new name, and the filter carries its discipline.

## What the boundary guarantees

- An unlisted record is **absent, not merely unlinked**: absent from the roster, the
  discipline set, the index and the entry cluster, 404 at its own address, and its
  generated pixels are 404 at `/api/media/{id}` to everyone but its own house's
  producer — including to anyone who copied the media address out of the studio.
- A producer of `meridian` is answered **404 for every `cirrus` record at every
  studio address** — reading, editing, attaching media, publishing, unlisting,
  reordering and minting a token alike — exactly as for a record that does not
  exist, so the answer never confirms the record is real. Nothing changes.
- Every `/api/studio/` endpoint, **reads included**, is enforced server-side. A
  direct API call from a `viewer` session, or from no session, is refused and the
  record is left as it was. Hiding a control in the UI is not authorization.
- Neither `role` nor the house is ever read from a request body.

## The API

Served on the same origin under `/api`. `GET /api/health` answers `200` once the
roster can be read. Anything returning a collection returns a JSON array at the top
level. Bearer auth is required on every `/api/studio/` endpoint and on nothing else.

```
POST /api/auth/signup            {email, password} -> a viewer account and a token
POST /api/auth/login             {email, password} -> a bearer token
GET  /api/works                  the published works in ordinal order
GET  /api/works/{slug}           one work, with media, credits and neighbours
GET  /api/talents?discipline=    the published talents
GET  /api/talents/{slug}         one talent, with its derived selected work
GET  /api/disciplines            the derived set, in first appearance order
GET  /api/media/{media_id}       the generated still
GET  /api/preview/{token}        one unlisted record, for its own house's producer
GET  /api/studio/items?kind=     the caller's own house's records
GET  /api/studio/items/{id}
POST /api/studio/items           {kind, slug, title, discipline, variant}
PATCH /api/studio/items/{id}
POST /api/studio/items/{id}/publish        {published}
POST /api/studio/items/{id}/media          {role, seed, width, height, alt}
POST /api/studio/items/{id}/credits        {role, name, talent_id}
POST /api/studio/items/{id}/slug           {slug}
POST /api/studio/works/order               {ordered_ids}
POST /api/studio/preview-tokens            {item_id}
```

Example:

```sh
TOKEN=$(curl -s -X POST "$APP_PUBLIC_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"producer@example.com","password":"deku-demo-pw-2026"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

curl -s "$APP_PUBLIC_URL/api/studio/items" -H "Authorization: Bearer $TOKEN"
```

## Running it

The image reads `DATABASE_URL` and `PORT` from the environment at container start
and never hardcodes either. It applies the schema and the seed itself, once and
idempotently, before the workers come up, so restarting duplicates no rows.

```sh
docker build -t cirrus /app
docker run --rm -e DATABASE_URL="$DATABASE_URL" -p 4173:4173 cirrus
```

The app is served in the foreground by gunicorn, bound to `0.0.0.0` on `4173`.

## Notes on the substitutions

No binary ships with this build. Photographs are generated per media row from that
row's stored seed as a gradient field, so the same record always draws the same
still. Reels are a motion field drawn per frame into a canvas from the still. The
typefaces are named rather than shipped: the display role falls back to a serif and
the interface role to a grotesque, which keeps the two roles distinguishable. What
is lost is the photographs themselves and the house's own marks; what survives is
every layout, both colours, the whole motion vocabulary and the type system.
