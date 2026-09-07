# Cirrus

The public site of a production house in Paris, and the private studio behind it.

The app is server-rendered: a Flask backend renders Jinja templates and Alpine.js enhances the
delivered HTML in place. The browser receives a complete document on first paint. PostgreSQL is
the only place a record lives; every pixel on the site is drawn by the app from a stored seed, so
no binary asset ships with this build.

## Signing in

**Every seeded account uses the password `deku-demo-pw-2026`.** This is benchmark fixture data,
not a secret. Sign in at `/studio/login`.

| Address | Password | Role | House | What it can do |
|---|---|---|---|---|
| `producer@example.com` | `deku-demo-pw-2026` | `producer` | `cirrus` | The whole studio, for `cirrus` records only. This is the account to use. |
| `producer.meridian@example.com` | `deku-demo-pw-2026` | `producer` | `meridian` | The same studio, for `meridian` records only. It cannot read, edit, publish or preview a single `cirrus` record at any address. |
| `viewer@example.com` | `deku-demo-pw-2026` | `viewer` | none | Exactly what a visitor can do, and nothing more. Every studio address refuses it. |

Signup at `/signup` is open and always issues a `viewer` with no house; neither the role nor the
house is ever read from a request body.

No account is needed to read the public site.

## The routes

| Route | What it is | Who |
|---|---|---|
| `/` | the entry cluster, a counter to `100%` then twenty stills | public |
| `/works`, `/works/` | the numbered index, twelve entries | public |
| `/works/the-halo` | one film, with its credits and neighbours | public |
| `/talents`, `/talents/` | the roster and its discipline filter | public |
| `/talents/rives` | one talent and the work they are credited on | public |
| `/about` | the house speaking | public |
| `/signup`, `/studio/login` | open signup, and sign in | public |
| `/studio` | the command palette, the producer's entry point | `producer` |
| `/studio/talents/new`, `/studio/works/new` | create a record | `producer` |
| `/studio/items/{id}` | edit one record | `producer` |
| `/studio/items/{id}/published` | the confirmation | `producer` |
| `/preview/{token}` | one unlisted record, through the published components | `producer` |

## A walk through it

1. Open `/` and watch the counter reach `100%` and the veil clear. Point at a still: its title
   appears beside the pointer. Press it to land on that film.
2. Open `/works`. Scroll past the opening line; point at an entry and its colour returns over
   `0.8s`. Press it, then move to the next film by ordinal.
3. Open `/talents` and press `PHOTOGRAPHER` in the left margin. The set becomes `Camille Ferrand`
   and the marker square moves beside the active word. Arrow keys advance the roster.
4. Sign in at `/studio/login` as `producer@example.com`. The palette opens; type a name to filter,
   choose `New talent`, fill it at `/studio/talents/new`, mint a preview token, open the preview,
   publish, and land on the confirmation. The roster now carries the new name and the filter
   carries `STYLIST`.

## What is deliberately absent

`Noor Vasquez` and `The Quiet Room` are seeded **unlisted**. They are absent from the roster, the
discipline set, the index and the entry cluster; their own addresses answer not found; and their
generated pixels are unreachable at `/api/media/{id}` to everyone except the `cirrus` producer,
however the caller came by the identifier. The `meridian` house has no public surface on this
deployment and exists because its producer uses the same studio.

## The API

The HTTP API is served on the same origin under `/api`. `GET /api/health` answers `200` once the
roster can be read. Anything returning a collection returns a JSON array at the top level.

Bearer auth is required on every `/api/studio/` endpoint, reads included, and on nothing else.
Exchange an address and a password at `POST /api/auth/login` for a token, then send it as
`Authorization: Bearer <token>`.

```
curl -s $APP_PUBLIC_URL/api/health
curl -s $APP_PUBLIC_URL/api/works
curl -s $APP_PUBLIC_URL/api/disciplines

TOKEN=$(curl -s -X POST $APP_PUBLIC_URL/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"producer@example.com","password":"deku-demo-pw-2026"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

curl -s $APP_PUBLIC_URL/api/studio/items -H "Authorization: Bearer $TOKEN"
```

A producer asking for a record of a house that is not theirs is answered exactly as a producer
asking for a record that does not exist, so the answer never confirms that the record is real.

## Running it

The image starts from the environment with no manual steps. It reads `DATABASE_URL` for the
backing service and serves on `PORT` (`4173` inside the container), bound to `0.0.0.0`. The schema
and the seed are applied by the container at start, once and idempotently: restarting does not
duplicate a row.

```
docker build -t cirrus /app
docker run --rm -e DATABASE_URL="$DATABASE_URL" -p 4173:4173 cirrus
```

## Substitutions

No binary ships with this build, so two things are stand-ins and are worth naming:

- **The photographs.** Every still is generated per media row from that row's stored `seed` as a
  two-stop gradient with a second gradient over it and a grain tile on top, and every reel is a
  generated motion field drawn each frame. The same record always produces the same image.
- **The typefaces.** The display face is [Fraunces](https://github.com/undercasetype/Fraunces) and
  the interface face is [Inter](https://github.com/rsms/inter), both variable, both under the SIL
  Open Font License 1.1, which permits redistribution. They stand in for the named faces; the
  house's own marks are drawn as inline vector geometry.
