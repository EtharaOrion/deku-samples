# Cirrus

The public site of a production house in Paris, plus the private studio behind it.
This deployment serves the house `cirrus`. The house `meridian` has no public surface here
and exists because its producer signs into the same studio.

## Signing in

Every seeded account uses the same password. It is benchmark fixture data, not a secret.

| Email | Password | Role | House |
|---|---|---|---|
| `producer@example.com` | `deku-demo-pw-2026` | `producer` | `cirrus` — this deployment's house |
| `producer.meridian@example.com` | `deku-demo-pw-2026` | `producer` | `meridian` — no public surface here |
| `viewer@example.com` | `deku-demo-pw-2026` | `viewer` | none |

Sign in at **`/studio/login`**. Signup at `/signup` is open and always issues a `viewer`
with no house, whatever the request body says.

## Walking the site

**As a stranger, no account needed.** Open `/`, watch the counter reach `100%` and the veil
clear, point at a still to read its title beside the pointer, press it to land on that film.
Cross to `/works` for the numbered index, press an entry to open it, and move to the next
film by ordinal. Open `/talents`, press `PHOTOGRAPHER` in the left margin, and the set
becomes `Camille Ferrand`; open her to read the works she is credited on. `/about` is the
house speaking. `CONTACT` in the top bar opens a mail composition; below `768px` it opens
the contact overlay instead.

**As the `cirrus` producer.** Sign in, land on the command palette at `/studio`. Type to
filter the house's own records by title or slug. Choose `New talent`, fill the form at
`/studio/talents/new`, attach a poster with a written alternative, mint a preview token,
open the preview, then publish and land on the confirmation. The roster then carries the
new name and the filter carries its discipline.

**What is deliberately unreachable.** `Noor Vasquez` and `The Quiet Room` are seeded
unlisted. They are absent from the roster, the index, the discipline set and the entry
cluster; their own addresses answer a real not-found; and their generated pixels at
`/api/media/{id}` are not found to anyone but the `cirrus` producer, however the caller got
the id. The `meridian` producer is answered exactly as if those records did not exist, at
every studio address, so the answer never confirms that they are real.

## Routes

| Route | Purpose | Auth |
|---|---|---|
| `/` | the entry cluster | public |
| `/works`, `/works/` | the numbered index | public |
| `/works/{slug}` | one film | public |
| `/talents`, `/talents/` | the roster and its filter | public |
| `/talents/{slug}` | one talent | public |
| `/about` | the house speaking | public |
| `/signup` | open signup | public |
| `/studio/login` | sign in | public |
| `/preview/{token}` | one unlisted record | `producer`, own house |
| `/studio` | the command palette | `producer` |
| `/studio/talents/new`, `/studio/works/new` | create | `producer` |
| `/studio/items/{id}` | edit one record | `producer` |
| `/studio/items/{id}/published` | the confirmation | `producer` |

## The API

Served on the same origin under `/api`. `GET /api/health` answers `200` once the roster can
be read. Bearer auth is required on every `/api/studio/` endpoint, reads included, and on
nothing else; the token comes from `POST /api/auth/login`.

```
POST /api/auth/signup            {email, password}      the new viewer and a bearer token
POST /api/auth/login             {email, password}      a bearer token
GET  /api/works                                         the published works in ordinal order
GET  /api/works/{slug}                                  one work, with media, credits, neighbours
GET  /api/talents                ?discipline            the published talents
GET  /api/talents/{slug}                                one talent, with its derived selected work
GET  /api/disciplines                                   the derived set, first appearance order
GET  /api/media/{media_id}                              the generated still
GET  /api/preview/{token}                               one unlisted record, for its own producer
GET  /api/studio/items           ?kind                  the caller's own house's records
GET  /api/studio/items/{id}
POST /api/studio/items           {kind, slug, title, discipline, variant}
PATCH /api/studio/items/{id}     the changed fields
POST /api/studio/items/{id}/publish   {published}
POST /api/studio/items/{id}/media     {role, seed, width, height, alt}
POST /api/studio/items/{id}/credits   {role, name, talent_id}
POST /api/studio/items/{id}/slug      {slug}
POST /api/studio/works/order          {ordered_ids}
POST /api/studio/preview-tokens       {item_id}
```

Anything returning a collection returns it as a JSON array at the top level. A refusal
answers in the client-error range, carries a reason a person can read, and leaves the store
exactly as it found it.

## Notes on the build

Server-rendered Flask and Jinja; Alpine.js enhances the delivered HTML in place. PostgreSQL
is the only backing service and the only place a record lives. No binary asset ships: every
still is drawn from its media row's stored `seed`, so two requests for the same media id
return the same image, and the share card at `/share.png` is generated too. The schema and
the seed are applied at container start and are idempotent, so restarting duplicates
nothing. `DATABASE_URL`, `APP_PUBLIC_URL` and the port are read from the environment.
