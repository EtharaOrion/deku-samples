# Cirrus

The public site of a production house in Paris. It shows the work as a numbered index of twelve
entries, shows the roster one name at a time filtered by discipline, and opens a conversation
through one mail address. Behind a private studio, one producer per house adds a talent, attaches
media, orders the index, and publishes a profile to the public roster or holds it unlisted.

This deployment publishes the house **`cirrus`**. The house `meridian` has no public surface here
and exists because its producer uses the same studio.

## Signing in

**Every seeded account uses the password `deku-demo-pw-2026`.** This is benchmark fixture data,
not a secret. It is hashed with Argon2 in the database; the literal below is what to type.

| Email | Password | Role | House | What it can reach |
|---|---|---|---|---|
| `producer@example.com` | `deku-demo-pw-2026` | `producer` | `cirrus` | The studio, and every `cirrus` record. This is the account for the producer journey. |
| `producer.meridian@example.com` | `deku-demo-pw-2026` | `producer` | `meridian` | The studio, and `meridian` records only. It cannot read, edit, publish or preview a single `cirrus` record at any address. |
| `viewer@example.com` | `deku-demo-pw-2026` | `viewer` | none | Everything a visitor can read, and nothing more. It cannot reach any studio route. |

Sign in at **`/studio/login`**. Signup at `/signup` is open and always issues a `viewer` with no
house; neither the role nor the house is ever read from a request body.

No account is needed to read the public site.

## The journeys

1. **The entry cluster.** Open `/`, watch the counter reach `100%` and the veil clear, point at a
   still to read its title beside the pointer, and press it to land on that film.
2. **The numbered index.** Open `/works`, scroll past the opening line, hover an entry to watch its
   colour return over `0.8s`, press it, then move to the next film by ordinal.
3. **The roster.** Open `/talents`, press `PHOTOGRAPHER` in the left margin to filter the set to
   `Camille Ferrand` (arrow keys also advance the set), then open her page to read the works she is
   credited on.
4. **The producer.** Sign in at `/studio/login` as `producer@example.com`, open the palette, type a
   name to filter, choose `New talent`, fill it in, mint a preview token, open the preview, publish,
   and land on the confirmation. The roster then carries the new name and the filter carries
   `STYLIST`.

## What is deliberately unreachable

`Noor Vasquez` and `The Quiet Room` are seeded **unlisted**. They are absent rather than merely
unlinked:

- absent from the roster, the discipline set, the numbered index and the entry cluster;
- `GET /api/talents/noor-vasquez` and `/talents/noor-vasquez` answer a real not-found to a visitor;
- **their generated pixels are unreachable too.** `GET /api/media/{id}` for an unlisted record is
  not found to anyone but that record's own house producer, however the caller obtained the id,
  including by copying the media address out of the studio.

A producer signed in to `meridian` is answered **not found** for a `cirrus` record at every studio
address — reading, editing, attaching media, publishing, unlisting, reordering and minting a token
alike — so the answer never confirms that the record is real.

## Health and routes

`GET /api/health` returns `200` once the roster can be read.

Public: `/`, `/works`, `/works/{slug}`, `/talents`, `/talents/{slug}`, `/about`, `/signup`,
`/studio/login`. `/works` and `/works/` resolve alike, as do `/talents` and `/talents/`.
Producer only: `/studio`, `/studio/talents/new`, `/studio/works/new`, `/studio/items/{id}`,
`/studio/items/{id}/published`, `/preview/{token}`.

The JSON API is under `/api` on the same origin. Bearer auth is required on every `/api/studio/`
endpoint and on nothing else; a token comes from `POST /api/auth/login`.

## Notes

- **No binary asset ships.** Every still is drawn by the app from its media row's stored `seed`, so
  the same record always produces the same image. The grain is one `300px` tile, generated once and
  reused. The share image is generated at `1200 x 630`.
- The two typefaces are open-licence variable fonts, subset and self-hosted: **Fraunces** (display)
  and **Inter** (interface), both under the SIL Open Font License.
- The seed is idempotent: restarting the app does not duplicate rows.
- The app reads `DATABASE_URL`, `APP_PUBLIC_URL` and `APP_PUBLIC_PORT` from the environment.
  It serves on container-internal port `4173`, bound to `0.0.0.0`.
