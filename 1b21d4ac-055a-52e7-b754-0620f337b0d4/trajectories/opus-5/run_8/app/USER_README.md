# Cirrus

The public site of a production house in Paris, with a private studio behind it.
Server-rendered Flask and Jinja, enhanced in place by Alpine.js, backed by
PostgreSQL. No binary asset ships: every still is drawn by the app from a stored
seed.

## Signing in

**Every seeded account uses the password `deku-demo-pw-2026`.** This is benchmark
fixture data, not a secret.

| Email | Password | Role | House |
|---|---|---|---|
| `producer@example.com` | `deku-demo-pw-2026` | `producer` | `cirrus` (the house served here) |
| `producer.meridian@example.com` | `deku-demo-pw-2026` | `producer` | `meridian` (no public surface here) |
| `viewer@example.com` | `deku-demo-pw-2026` | `viewer` | none |

Sign in at `/studio/login`. Signup at `/signup` is open and always issues a
`viewer` with no house.

No account is needed to read the public site.

## Walking it

1. **The entry cluster, `/`** — the counter climbs to `100%` against real load
   progress, the veil clears, and a cluster of stills appears. Point at one and
   its title appears beside the pointer; press it to land on that film.
2. **The numbered index, `/works`** — twelve entries numbered `001` to `012`.
   Each still rests fully desaturated and returns to colour on hover over `0.8s`.
3. **A film, `/works/the-halo`** — title, ordinal, credits, reel, stills, and
   next/previous which follow the ordinal and wrap `012` back to `001`.
4. **The roster, `/talents`** — one talent fills the window. Press `PHOTOGRAPHER`
   in the left margin to filter to `Camille Ferrand`; arrow keys advance the set.
5. **The studio** — sign in as `producer@example.com`, and the palette at
   `/studio` is the entry point. Type to filter the house's own records, choose
   `New talent`, fill the form, mint a preview token, open the preview, publish,
   and land on the confirmation. The roster then carries the new name and the
   filter carries its discipline.

## What is enforced on the server

Authorization lives on every `/api/studio/` endpoint, reads included. Hiding a
control in the UI is not authorization.

- An **unlisted** record is absent, not merely unlinked: absent from the roster,
  the discipline set, the index and the cluster, not found at its own address,
  and **its generated pixels are not found either**, however the caller got the
  media address out of the studio. `Noor Vasquez` and `The Quiet Room` are
  seeded unlisted.
- A `viewer` token, or no token, is refused at every studio address, and the
  record is left unchanged.
- A producer of `meridian` naming a `cirrus` record at any studio address is
  answered **exactly as if the record did not exist**, so the answer never
  confirms it is real. That holds for reading, editing, attaching media,
  publishing, unlisting, reordering and minting a preview token alike.
- A preview token is 32 lowercase hex characters, good for 15 minutes, scoped to
  one record and to that record's house, and the preview route is kept out of
  every shared cache and out of every index.

Derived at read time and never stored: a work's displayed ordinal, the roster's
discipline set, a talent's selected work, and a work's neighbours. Unlisting the
fifth of twelve leaves eleven numbered `001` to `011`.

Slug uniqueness is held by the database, per house per kind, decided after
lowercasing, so two simultaneous creates carrying the same slug cannot both
land: exactly one wins and the loser leaves no partial record.

## Configuration

Read from the environment at container start; neither is written into the source.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | the PostgreSQL instance, the only backing service |
| `APP_PUBLIC_URL` | the house's own address |
| `APP_PUBLIC_PORT` | the port the outside world uses; it maps onto the container's `4173` |

`GET /api/health` answers `200` once the roster can be read. The schema and the
idempotent seed are applied at container start, so restarting duplicates nothing.

## The API

Public: `GET /api/works`, `/api/works/{slug}`, `/api/talents`,
`/api/talents/{slug}`, `/api/disciplines`, `/api/media/{media_id}`,
`/api/health`. Anything returning a collection returns a JSON array at the top
level.

Auth: `POST /api/auth/signup`, `POST /api/auth/login`. Login exchanges an email
and password for a bearer token, sent on every studio call. Neither `role` nor
the house is ever read from a request body.

Studio, bearer auth required on all of them:
`GET /api/studio/items`, `GET /api/studio/items/{id}`, `POST /api/studio/items`,
`PATCH /api/studio/items/{id}`, `POST /api/studio/items/{id}/publish`,
`POST /api/studio/items/{id}/media`, `POST /api/studio/items/{id}/credits`,
`POST /api/studio/items/{id}/slug`, `POST /api/studio/works/order`,
`POST /api/studio/preview-tokens`, and `GET /api/preview/{token}`.

## Substituted assets

No binary ships with this build. Stills and reels are generated from each media
row's stored `seed`, so the same record always produces the same image; the
grain is one 300px tile; the share image is generated at `1200 x 630`. The two
typefaces are named rather than shipped and fall back to a local serif for the
display face and a local grotesque for the interface face. What this costs is
the photographs themselves and the house's own marks; what survives is every
layout, both colours, the whole motion vocabulary and the type system.
