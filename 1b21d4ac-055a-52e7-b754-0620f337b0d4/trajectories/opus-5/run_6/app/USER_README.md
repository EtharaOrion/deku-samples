# Cirrus

The public site of a production house in Paris. It shows the work as a numbered index of
twelve entries, shows the roster one name at a time filtered by discipline, and opens a
conversation through one mail address. Behind a private studio, one producer per house
adds a talent, attaches media, orders the index, and publishes a profile to the public
roster or holds it unlisted.

## Signing in

Every seeded account uses the password **`deku-demo-pw-2026`**. This is benchmark fixture
data, not a secret. Sign in at **`/studio/login`**.

| Email | Password | Role | House | What it can do |
|---|---|---|---|---|
| `producer@example.com` | `deku-demo-pw-2026` | `producer` | `cirrus` | The studio for this deployment's own house: create and edit works and talents, attach media and credits, reorder the index, mint preview tokens, publish and unlist |
| `producer.meridian@example.com` | `deku-demo-pw-2026` | `producer` | `meridian` | The studio for the *other* house. It can reach none of `cirrus`'s records at any address; every attempt is answered exactly as a record that does not exist |
| `viewer@example.com` | `deku-demo-pw-2026` | `viewer` | none | Everything a visitor can do and nothing more. It cannot reach a studio route, cannot see anything unlisted, and cannot change a record |

Signup at **`/signup`** is open and always issues a `viewer` with no house, whatever the
request body claims.

## Walking the app

1. **The entry cluster, `/`.** The counter reaches `100%` against real load progress, the
   veil clears, and twenty overlapping stills remain. Point at one to read its title beside
   the pointer; press it to land on that film.
2. **The numbered index, `/works`.** One opening line, then twelve entries running `001` to
   `012`. Each still rests fully desaturated and gives its colour back on hover. Open one
   and move to the next by ordinal; the neighbours wrap `012` back to `001`.
3. **The roster, `/talents`.** One talent fills the window. Press `PHOTOGRAPHER` in the left
   margin, or use the arrow keys, to move through the set; the marker square moves beside
   the active word. `/talents/camille-ferrand` reads the works she is credited on.
4. **The studio.** Sign in as `producer@example.com`, open the palette at `/studio`, type a
   name to filter, choose `New talent`, fill it in, mint a preview token, open the preview,
   then publish and land on the confirmation. The roster then carries the new name and the
   filter carries `STYLIST`.

## The publish and ownership boundary

`Noor Vasquez` and `The Quiet Room` are seeded unlisted. They are absent from the roster,
the discipline set, the index and the entry cluster, absent at their own addresses, and
their generated pixels are not found to anyone but `cirrus`'s own producer, however the
caller obtained the media address out of the studio.

Authorization is enforced server-side on every `/api/studio/` endpoint, reads included.
Hiding a control in the UI is not authorization: a direct API call from a `viewer` session,
or from the producer of the other house, is rejected and the protected record is left
unchanged.

## The API

Served on the same origin under `/api`. `GET /api/health` answers `200` once the roster can
be read. Bearer auth is required on every `/api/studio/` endpoint and on nothing else:
exchange an email and password at `POST /api/auth/login` for a token and send it as
`Authorization: Bearer <token>`.

```
POST /api/auth/signup        {email, password}   the new viewer account and a token
POST /api/auth/login         {email, password}   a bearer token
GET  /api/works                                  the published works in ordinal order
GET  /api/works/{slug}                           one work with media, credits, neighbours
GET  /api/talents            ?discipline         the published talents
GET  /api/talents/{slug}                         one talent with its derived selected work
GET  /api/disciplines                            the derived set, first appearance order
GET  /api/media/{media_id}                       the generated still
GET  /api/preview/{token}                        one unlisted record, its own producer only
GET  /api/studio/items       ?kind               the caller's own house's records
GET  /api/studio/items/{id}
POST /api/studio/items       {kind, slug, title, discipline, variant}
PATCH /api/studio/items/{id}
POST /api/studio/items/{id}/publish   {published}
POST /api/studio/items/{id}/media     {role, seed, width, height, alt}
POST /api/studio/items/{id}/credits   {role, name, talent_id}
POST /api/studio/items/{id}/slug      {slug}
POST /api/studio/works/order          {ordered_ids}
POST /api/studio/preview-tokens       {item_id}
```

## Notes

- No binary ships with this build. Every still is drawn from its media row's stored `seed`,
  so the same record always produces the same image and the page is stable across reloads.
- PostgreSQL is the only place a record lives. `DATABASE_URL`, `APP_PUBLIC_URL` and
  `APP_PUBLIC_PORT` are read from the environment and are never written into the source.
- The schema and the seed are applied by the container at start, once and idempotently:
  restarting adds no rows.
