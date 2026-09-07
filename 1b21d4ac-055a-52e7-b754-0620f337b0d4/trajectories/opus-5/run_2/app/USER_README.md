# Cirrus

The public site of a production house in Paris. It shows the work as a numbered
index of twelve entries, shows the roster one name at a time filtered by
discipline, and opens a conversation through one mail address. Behind a private
studio, one producer per house publishes a profile to the public roster or holds
it unlisted.

This deployment serves the house **`cirrus`**. A second house, `meridian`, has
no public surface here and exists because its producer uses the same studio.

## Signing in

**Every seeded account uses the password `deku-demo-pw-2026`.** This is benchmark
fixture data, not a secret. Sign in at `/studio/login`.

| Email | Password | Role | House | What they can reach |
|---|---|---|---|---|
| `producer@example.com` | `deku-demo-pw-2026` | `producer` | `cirrus` | The studio, and every `cirrus` record |
| `producer.meridian@example.com` | `deku-demo-pw-2026` | `producer` | `meridian` | The studio, and only `meridian`'s two records |
| `viewer@example.com` | `deku-demo-pw-2026` | `viewer` | none | The public site only; the studio refuses them |

Signup at `/signup` is open and always issues a `viewer` with no house. Neither
the role nor the house is ever read from a request body.

## Walking the site

**As a stranger, no account needed.**

1. `/` — the entry cluster. The counter reports real load progress and reaches
   `100%`, then the veil clears onto twenty overlapping stills. Point at one to
   read its title beside the pointer; press it to land on that film.
2. `/works` — the numbered index. Twelve entries in three widths. Each still
   rests fully desaturated and gives its colour back on hover over `0.8s`.
3. `/works/the-halo` — one film, with its credits and its neighbours. Next and
   previous follow the ordinal and wrap `012` back to `001`.
4. `/talents` — the roster, one name filling the window. Press `PHOTOGRAPHER`
   in the left margin: the set becomes `Camille Ferrand` and the marker square
   moves beside the active word. Arrow keys advance the set.
5. `/talents/camille-ferrand` — her route, reading the works she is credited on.
6. `/about` — the house speaking, and the only route with no media.

**As the `cirrus` producer.** Sign in at `/studio/login`, and `/studio` opens on
the command palette, which is the entry point for every producer journey. Typing
filters this house's own records by title and slug. Choose `New talent`, fill it
at `/studio/talents/new`, mint a preview token, open the preview, then publish
and land on the confirmation. The roster then carries the new name and the filter
carries its discipline.

## What is enforced on the server

Authorization is enforced server-side on every `/api/studio/` endpoint, reads
included. Hiding a control in the page is presentation only; the server refuses
the call regardless of what the page drew.

- An unlisted record is **absent**, not merely unlinked: it is missing from the
  roster, the discipline set, the index and the entry cluster, its own address
  answers a real not-found, and **its generated pixels are unreachable** at
  `/api/media/{media_id}` to anyone but its own house's producer, however the
  caller obtained the address.
- `Noor Vasquez` and `The Quiet Room` are seeded unlisted, and are the records
  to test that with.
- A producer of `meridian` naming a `cirrus` record at any studio address is
  answered **exactly as they would be for a record that does not exist**, so the
  answer never confirms the record is real. That holds for reading, editing,
  attaching media, publishing, unlisting, reordering and minting a token alike.
- A preview token is 32 lowercase hex characters, scoped to one record and its
  house, and good for 15 minutes. `/preview/{token}` renders nothing and reveals
  nothing without a producer session of that record's own house.

## Derived rather than stored

The displayed ordinal, the roster's discipline set, a talent's selected work and
a work's neighbours are all computed at read time. Unlisting the fifth of twelve
works leaves eleven numbered `001` to `011`, contiguous by construction.

Slug uniqueness per house per kind is held by a unique index on the database
rather than by an application check, so two simultaneous creates carrying the
same slug cannot both land: exactly one wins, the other is rejected with a
reason, and the loser leaves no partial record.

## Zero-asset build

No binary ships with this build. Every still is generated per media row from that
row's stored `seed`, so the same record always draws the same image; reels are a
generated motion field drawn each frame; the grain is one 300px noise tile
generated at start-up and repeated; and the share image is drawn on request. The
typefaces are named rather than shipped and fall back to locally available
serif and grotesque faces.

## Running it

The app is server-rendered: Flask renders Jinja templates and Alpine.js enhances
the delivered HTML in place. The browser receives a complete document on first
paint.

- It answers on container port `4173`, bound to `0.0.0.0`.
- `DATABASE_URL`, `APP_PUBLIC_URL` and `APP_PUBLIC_PORT` are read from the
  environment at container start and are never written into the source.
- The schema and the seed are applied by the image itself at start-up, and the
  seed is idempotent: restarting never duplicates a row.
- `GET /api/health` answers `200` once the roster can be read.
- Each request leaves one line on stdout.
