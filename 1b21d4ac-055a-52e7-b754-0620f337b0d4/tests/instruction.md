# Cirrus

Build and deploy a working web application from this brief. There is no starting codebase. When
you are done, a stranger must be able to open the app in a browser, watch the entry counter reach
`100%`, cross to the numbered work index, open a film, and reach the roster and filter it by
discipline, without hitting an error page. A different stranger, with no session, must NOT be able
to reach an unpublished talent, an unpublished film, or the generated pixels of either, by any
means, including by copying the media address out of the studio. And a producer signed in to the
house `meridian` must NOT be able to read, edit, publish or preview a single record belonging to
the house `cirrus`, at any studio address, however they got the identifier.

## Overview

Cirrus is the public site of a production house in Paris that represents directors and
photographers and delivers films for brands, agencies and labels. It does three things: it shows
the work as a numbered index of twelve entries, it shows the roster one name at a time filtered by
discipline, and it opens a conversation through one mail address. Nobody signs up to buy anything,
nobody comments, and there is no search field.

Behind a private studio one producer per house adds a talent, assigns a discipline, attaches a
showreel and stills, orders the works index, and publishes a profile to the public roster or holds
it unlisted. That last action is the whole product.

The genuinely hard part is twofold: an unlisted record must be absent rather than merely unlinked,
its generated pixels included; and one house's producer must be unable to see another house's
records at all.

## User roles

| Role | Can do |
|---|---|
| Visitor (no account) | Read every public route of the served house; open the mail address. **Cannot** reach a studio route, **cannot** read an unlisted record, **cannot** fetch its media |
| `viewer` (signed up) | Everything a visitor can, and nothing more. Belongs to no house. **Cannot** reach a studio route, **cannot** see anything unlisted, **cannot** change a record |
| `producer` (house owner) | All of the above, plus, **inside their own house only**: create and edit works and talents; attach media and credits; reorder the index; mint a preview token; publish and unlist |

Authorization is enforced **server-side on every studio endpoint**, reads included. Hiding a
control in the UI is not authorization: a direct API call from a `viewer` session, or from a
producer of another house, must be rejected by the server, leaving the protected record unchanged.
A producer asking for a record of a house that is not theirs is answered exactly as a producer
asking for a record that does not exist, so the answer never confirms that the record is real.

Signup is open and always issues a `viewer` with no house. Seeded: `producer@example.com` owns
`cirrus`, `producer.meridian@example.com` owns `meridian`, and `viewer@example.com` owns nothing.

## Core features

Auth is email and password, hashed, exchanged at `POST /api/auth/login` for a bearer token sent on
every studio call. Neither `role` nor the house is read from a request body.

### The publish and ownership boundary

1. Public reads answer with published records of the served house only. `Noor Vasquez` and
   `The Quiet Room` are seeded unlisted: absent from the roster, the discipline set, the index and
   the cluster.
2. `GET /api/talents/noor-vasquez` is not found for a visitor. `GET /api/talents/rives` answers.
3. A studio record is created unlisted, `published_at` null. Publishing stamps it; unlisting clears
   it and drops the record from every public read at once. Publishing a record whose poster `alt`
   is empty is refused and nothing changes.
4. Media is generated, never uploaded: a row carries a `seed`, `width`, `height` and an `alt`.
   `GET /api/media/{media_id}` renders it while its record is published, and while that record
   is unlisted it is not found to anyone but that record's own house producer, however the
   caller got the id.
5. `POST /api/studio/preview-tokens` mints one `32` character lowercase hex token for one record,
   good for `15 minutes`. `GET /preview/{token}` renders that record through the published route's
   own components, and is not found for another record or another house.
6. Any `/api/studio/` call carrying a `viewer` token, or no token, is denied, record unchanged.
7. A `producer` of `meridian` naming a `cirrus` record at any studio address is answered not found,
   record unchanged: reading, editing, attaching media, publishing, unlisting, reordering and
   minting a token alike.

### The index and the roster

8. Ordinals derive at read time from the published set in stored order, contiguous from `001`, zero
   padded to three digits. Unlisting the fifth of twelve leaves eleven numbered `001` to `011`.
9. A slug is lowercase kebab, unique per house per kind, assigned once and never changing with the
   title. `POST /api/studio/items/{id}/slug` leaves the old one redirecting forever.
10. The discipline set derives from published talent in first appearance order, never authored:
    publishing `Noor Vasquez` adds `stylist`, unlisting `Camille Ferrand` drops `photographer`.
11. A credit names a role and a name and may point at a talent. A talent's selected work is read
    from credits, never stored on the talent.
## User flow

| Route | Purpose | Auth |
|---|---|---|
| `/` | the entry cluster | public |
| `/works`, `/works/` | the numbered index | public |
| `/works/the-halo` | one film | public |
| `/talents`, `/talents/` | the roster and its filter | public |
| `/talents/rives` | one talent | public |
| `/about` | the house speaking | public |
| `/signup` | open signup | public |
| `/studio/login` | sign in | public |
| `/preview/{token}` | one unlisted record | `producer` |
| `/studio` | the palette | `producer` |
| `/studio/talents/new`, `/studio/works/new` | create | `producer` |
| `/studio/items/{id}` | edit one record | `producer` |
| `/studio/items/{id}/published` | the confirmation | `producer` |

**Entry and redirects.** A visitor asking for `/studio` lands on `/studio/login` and returns there
after signing in. A signed-in `viewer` asking for `/studio` is refused and sees the entry route,
with no studio control drawn for them. Signing out makes `/studio` unreachable at once. An expired
token mid-edit returns to `/studio/login` with nothing half saved. An address matching nothing
answers a real not-found status on the site's own surface, without echoing the path.

**Journeys.** (1) Open `/`, watch the counter reach `100%` and the veil clear, point at a still and
read its title beside the pointer, press it, land on that film. (2) Open `/works`, scroll past the
opening line, point at an entry and watch its colour return over the slow duration, press it, move
to the next film by ordinal. (3) Open `/talents`, press `PHOTOGRAPHER` in the left margin and watch
the set become `Camille Ferrand` with the marker square moving beside the active word, then reach
`/talents/camille-ferrand` and read the works she is credited on. (4) Sign in at `/studio/login` as
`producer@example.com`, open the palette, type a name, choose `New talent`, fill it at
`/studio/talents/new`, mint a preview token, open the preview, publish, land on the confirmation;
the roster now carries the new name and the filter carries `STYLIST`.

**What each surface holds.** `GET /api/works` returns 12 works in ordinal order, `GET /api/talents`
returns 3, `GET /api/disciplines` returns `director` then `photographer`, and
`GET /api/works/{slug}` carries its neighbours, wrapping `012` to `001`. Every cluster still is a
link named by its title then its ordinal; `/works` and `/works/` resolve alike, as do `/talents`
and `/talents/`.

**States.** Every list has an empty state in words and every route a loading state on the counter.
Every media container reserves its space from its stored intrinsic size before its pixels arrive
and clears its placeholder on decode or failure. A rejected form keeps what was typed and names
what was wrong.

## UI/UX notes

The north star: restraint under motion. Every effect takes something away rather than adding it,
and the surface is two warm colours and their states. The register is considered, print-like and
unhurried; a commissioner sees photographs before any interface.

Layout is `top-nav`: a fixed frame of a wordmark, four labels, a centre mark and a corner credit
that never remounts, over a scrolling well carrying the route. The studio is
command-palette-first: one palette is the producer's entry point and every journey starts there.
Density is spacious on the public routes and compact in the palette.

Type is serif throughout for anything the house says: the display face carries the roster name, the
work titles, the opening lines and the closing lockup, while a single grotesque carries every
label, caption and control at one size. Hierarchy comes from position and from the display face,
never from nudging a label up two points, and weight falls as size rises.

Colour is two values, a warm near-black and a warm off-white. Every ground and every piece of text
is one of those two or an opacity state of one of them, and the short list of supporting values
pinned in the front-end specification reaches a visitor only as a gradient or inside a generated
still, never as text. There is no accent, no brand hue, no state colour for success or failure, and
no link colour: a link is distinguished by position and by its hover. Meaning is never carried by
colour alone.

Motion is eased and subtractive. Pointer responses are fast and positional moves are slow with
nothing between; every hover resolves to one opacity change, the index gives a still its colour
back rather than growing it, and the about route arrives out of focus and sharpens against the
wheel. Nothing loops, bounces or scales, and no transition touches a colour. Reduced motion
resolves every scrubbed effect to its end state, so the reader gets the sharp text.

Accessibility is contract: text meets WCAG AA contrast on both grounds, every split label exposes
its whole word as its accessible name, keyboard navigation reaches every control with a focus ring
that is not the hover treatment, the roster advances on arrow keys, and every still carries a
written alternative. Marks that mean nothing are hidden rather than labelled.

Responsive behaviour holds at every viewport between the named widths. There is one real
breakpoint, below which the roster stops being one screen and becomes a scroll, the frame retracts
to give the work its height, and the hover-only affordances get touch equivalents. Exact shades,
sizes, curves and coordinates are pinned below; elsewhere the choice is yours if it holds these
rules.

## Technical requirements

The app is server-rendered: a Flask backend renders Jinja templates, and Alpine.js enhances the
delivered HTML in place. The browser receives a complete document on first paint; there is no
client-side render pass that produces the page. Alpine.js drives the entry counter, the cursor
pair, the discipline filter, the roster's advance, the studio's command palette and the studio's
forms, and what it ships is a production build.

**What the backend owns.** The seven tables and every write to them; the seed, run once and
idempotently; authentication, password hashing and bearer tokens; authorization on every
`/api/studio/` endpoint including reads, and the house scoping that answers a foreign record
exactly as a missing one; the derived values, which are the displayed ordinal, the discipline set,
a talent's selected work and a work's neighbours, computed at read time and never stored; slug
uniqueness per house per kind held at the database rather than in application checks, and the
redirect row a rename leaves; preview token minting, scoping and expiry; the media address and its
published-or-unlisted answer; the JSON API under `/api`, `GET /api/health`, one request line on
stdout, and the Jinja templates that arrive at the browser as a complete document.

**What the front end owns.** The rendered document's behaviour and nothing else: the entry
counter, the cursor pair, the discipline filter, the roster's advance, the command palette, the
studio forms, the smoothed scroll and every scrubbed effect, the route transition, the media layer
and its fallback, and the whole design system pinned below. It reads what the backend already put
in the document or answers over `/api`, and it decides nothing about who may see a record: hiding
a control is presentation, and the server refuses the call regardless of what the page drew.

The libraries above and their own direct dependencies are the whole permitted set. PostgreSQL is
the single backing service standing behind this deployment, so a second datastore, a cache, a
queue, an object store, an identity provider or a mail vendor is out of bounds however convenient
it looks. There is no content service, no image transform host and no video host either: every
pixel and every frame on this site is drawn by the app from a stored seed.

PostgreSQL is already running and `DATABASE_URL` addresses it. The house's own address comes from
`APP_PUBLIC_URL` and the port it answers on from `APP_PUBLIC_PORT`; neither is ever written into
the source.

Sessions are the app's own: an address, a hashed password, a bearer token, and nothing bought in
from a third party. `GET /api/health` answers `200` once the roster can be read, and each request
leaves one line on stdout.

The persistence of the frame is an observable requirement, not a technique. Moving from `/works`
to `/works/the-halo`, and from there to `/talents`, must leave the wordmark, the four labels, the
corner credit and the cursor pair on screen throughout, must not return the pointer marker to its
parked position, and must swap the centre mark to the new route's variant while the frame fades
out and back on the fade duration. Any approach that satisfies those statements is acceptable.

Refusals answer in the client-error range, carry a reason a person can read, and leave the store
exactly as they found it. Anything returning a collection returns it as a JSON array at the top
level.

Public reads may be cached, and publishing or unlisting a record revalidates them. The preview
address is kept out of every shared cache and out of every index. Analytics waits until the route
is interactive, counts page views and nothing else, and a loader that never arrives fails quietly
rather than putting an error screen where the work should be.

## Data model

Seven tables. All timestamps are UTC.

**Every seeded account uses the password `deku-demo-pw-2026`.** It is benchmark fixture data, not
a secret. Hash it as normal; the exact literal must work at login, and it must be written into
`/app/USER_README.md` alongside each account so a grader can sign in.

**`houses`** `id`, `slug` unique, `name`, `tagline_upper`, `tagline_lower`, `street`, `city`,
`district`, `contact_email`, `created_at`. Two seeded rows: `cirrus` and `meridian`. This
deployment publishes `cirrus`; `meridian` has no public surface here and exists because its
producer uses the same studio.

**`accounts`** `id`, `email` unique, `password_hash`, `role` (`producer` or `viewer`), `house_id`
(null for a `viewer`), `created_at`. Three seeded rows: `producer@example.com` in `cirrus`,
`producer.meridian@example.com` in `meridian`, and `viewer@example.com` in no house.

**`items`** `id`, `house_id`, `kind` (`work` or `talent`), `slug`, `title`, `position`,
`discipline` (`director`, `photographer` or `stylist`, talents only), `variant` (`left`, `right`
or `centre`, works only), `published`, `published_at`, `created_at`. A work and a talent are one
shape with two projections: a work carries a position and a variant, a talent carries a
discipline, and nothing else differs. `slug` is unique per `house_id` per `kind`, decided after
lowercasing, so `Rives` and `rives` are the same slug. The ordinal a visitor reads is not stored:
it is the record's place in the published set of its kind, so it is contiguous by construction.

**`media`** `id` (a `32` character lowercase hex token minted at creation, which is what makes the
address unguessable), `item_id`, `role` (`poster`, `reel` or `gallery`), `position`, `seed`,
`width`, `height`, `alt`, `created_at`. `alt` is required and must not be empty on a poster of a
published record. `width` and `height` are the intrinsic size a container reserves before pixels
arrive.

**`credits`** `id`, `item_id` (the work), `position`, `role`, `name`, `talent_item_id` (nullable).
The nullable column is the common case: a credit may name someone the house does not represent. A
talent's selected work is read from this table and is never stored on the talent.

**`preview_tokens`** `id`, `token` (`32` character lowercase hex) unique, `item_id`, `expires_at`,
`created_by`, `created_at`. Scoped to exactly one record, and to that record's house.

**`slug_redirects`** `id`, `house_id`, `kind`, `old_slug`, `item_id`, `created_at`. A row is
written when a producer changes a slug deliberately, and it serves that address permanently.
Unique per `house_id` per `kind` per `old_slug`.

The uniqueness of a slug within a house and a kind must hold under concurrent requests, not merely
in application-level checks: two simultaneous creates carrying the same slug must not both land,
exactly one wins, the other is rejected with a reason, and the loser leaves no partial record.

Derived rather than stored: a work's displayed ordinal, the roster's discipline set, a talent's
selected work, and a work's neighbours.

**Seed data.** In `cirrus`, twelve published works in this order, with their variants: `The Halo`
(`the-halo`, left), `Sonder` (`sonder`, right), `BINARY` (`binary`, centre), `Common Ground`
(`common-ground`, left), `NVE` (`nve`, right), `The Absolute Shelter` (`the-absolute-shelter`,
centre), `MAISON DE LUMIERE` (`maison-de-lumiere`, left), `LORIS` (`loris`, right),
`MDL Serie Extreme` (`mdl-serie-extreme`, centre), `AK` (`ak`, left), `Loris Shoot Studio`
(`loris-shoot-studio`, right) and `The Radiant` (`the-radiant`, centre); plus one unlisted work,
`The Quiet Room` (`the-quiet-room`, left), which carries one poster media row. Three published
talents: `Rives` (`rives`, director), `Halcyon` (`halcyon`, director) and `Camille Ferrand`
(`camille-ferrand`, photographer); plus one unlisted talent, `Noor Vasquez` (`noor-vasquez`,
stylist), which carries one poster media row. `Rives` is credited as Director on `The Halo`,
`Halcyon` as Director on `Sonder`, and `Camille Ferrand` as Photographer on `LORIS`. In
`meridian`, one published talent, `Sable Ito` (`sable-ito`, director), and one published work,
`Foundry` (`foundry`, left). Every published work carries a poster and a reel; every published
talent carries a portrait poster.

Seeding must be idempotent: restarting the app must not duplicate rows.

## Front-end specification

This section is the measured design system. Its values are read back from computed styles and are
requirements rather than preferences. Everything not pinned here is yours.

### The two-colour model

The palette is two values and their derivatives, both declared as custom properties on the root
element.

| Token | Value | Role |
|---|---|---|
| `--color-dark` | `#060403` | the near-black ground: the entry route, the share image and the not-found surface's ink |
| `--color-light` | `#e9eae4` | the warm off-white ground: every route except the entry, and the ink on the dark ground |

**A colour value is authored for a ground, a fill, a gradient stop or a generator input, and never
for text.** Every text rule takes its colour from one of the two tokens by name, or from an opacity
state of one of them, so no rule that sets type carries a value of its own. That is the whole ink
system: on a pale route the type is the dark token, on the dark route the type is the pale token,
and a dimmed label is the same token at a lower opacity rather than a third value.

Neither is a pure value. `#060403` is a near-black warmed toward red and `#e9eae4` is an off-white
warmed toward green. Building this in `#000000` and `#ffffff` produces a site that looks correct
in a screenshot and wrong in a window, because the two pure values have no temperature and these
two are a matched warm pair. On the reference these two resolve as the computed colour of 3,148
and 1,474 elements; the third place value reaches 42.

### The supporting values

Five further colours, each with one job, none of them an accent, and **none of them ever set on
text**.

| Value | Where it belongs |
|---|---|
| `#313236` | the footer overlay gradient, and nowhere else |
| `#dedede` | a gradient stop the still generator draws from, and nowhere a visitor reads text |
| `#676767` | a gradient stop the still generator draws from, and nowhere a visitor reads text |
| `#333333` | a gradient stop the still generator draws from, and nowhere a visitor reads text |
| `#455e53` | a gradient stop the still generator draws from, and nowhere a visitor reads text |

`#455e53` is a desaturated green that was measured on 41 elements of the reference and could not
be placed on any rendered surface. It ships here in exactly one role, as one of the five colours
the still generator draws from, because the work index's colour return is invisible on a field of
greys and this is the value carrying the most saturation. It never carries text and it never
appears as a fill on chrome.

**No colour outside these two tables reaches a visitor, and only the two tokens reach text.**
There is no accent, no brand hue, no success or failure colour, and no link colour.

### Declared colours that must not ship

Four values, `#020420`, `#64748b`, `#00dc82` and `#ffffff`, belong to a framework's own not-found
page on the reference, are declared in a stylesheet loaded by that route alone, and carry the
site's only `prefers-color-scheme` media query. **Ship none of them, and ship no such stylesheet.**
The not-found surface is rebuilt in the two tokens above. A fifth value, `#111111`, was found
written into rendering code as a clear colour and is close to but not equal to the ground: if you
build a rendering layer, its clear colour is the route's own ground, never `#111111`.

### Type

Two families, both variable, both loaded with `swap`.

| Role | Family | Weight axis | Fallback stack |
|---|---|---|---|
| display | a serif | `100 900` | `"Cirrus Display", "Times New Roman", Times, serif` |
| interface | a grotesque | `100 900` | `"Cirrus Text", "Helvetica Neue", Helvetica, Arial, sans-serif` |

The display fallback must be a serif and the interface fallback must not be, because `swap` means
a visitor on a slow connection sees the fallback first and the two roles must stay
distinguishable while they do. The weight axis is a requirement rather than a convenience: the
design uses `100`, `200`, `300`, `400` and `500` across a scale from `9.75px` to `125px`, and five
static weights of two families is ten files where two will do.

Four size tokens are declared on the root element and they cover the interface face only:
`--fontM` `24px`, `--fontS` `12px`, `--fontXS` `10px`, `--fontXXS` `8px`. The display face is set
from a ladder that is not tokenised.

**The interface face is set at one size.** `12px / 500 / 14.4px` carries the top bar, the footer,
every caption, every numeral label and both filter controls, and on the reference it carried 1,232
elements, more than every other combination on the site put together. The measured census, in
descending order of use:

| Size | Weight | Line height | Role |
|---|---|---|---|
| `12px` | `500` | `14.4px` | the interface default |
| `10px` | `400` | `19px` | the widely tracked footer label |
| `18px` | `300` | `21.6px` | the about route's body, the only body-sized text on the site |
| `58px` | `400` | `40.6px` | the closing lockup's large words |
| `40px` | `200` | normal | secondary display |
| `36px` | `100` | `34.56px` | the about opening figure |
| `24.75px` | `100` | `23.76px` | the lockup's small words |
| `9.75px` | `100` | `9.36px` | the lockup's smallest words |
| `24px` | `300` | `25.2px` | a work index caption title |
| `19px` | `500` | `17.1px` | a numeral label |
| `27px` | `400` | `18.9px` | mid display |
| `125px` | `300` | `137.5px` | the roster name |
| `56px` | `300` | `61.6px` | a work detail title |
| `10px` | `500` | `9px` | the smallest label, tightened |

Three facts hold the typography together and all three are requirements. **Line height is a ratio of
`1.2` in the interface face and `1.1` in the display face**, except that the display face sets
below `1` as it gets larger, `0.96` at `36px` and `24.75px` and `9.75px`, and `0.7` at the
lockup's `58px`, which is what lets the small words nest into the gaps beside the large ones
rather than sitting on their own line. **Weight falls as size rises**, `500` at `12px`, `300` at
`18px` and `24px`, `200` at `40px`, `100` at `36px` and below in the lockup. And **no size exists
between `24px` and `36px`**; do not add one.

Tracking, reconstructed from the rendered geometry rather than read from a declaration: capitals
in the interface face are set at `0.04em` at `12px` and `0.08em` at `10px`. The smaller the label,
the more it is tracked; expect to nudge these once you see them set.

Case is a hard rule. **Every interface-face string renders in capitals.** Every display-face
string renders in capitals except the talent name and the work index caption titles, which are
title case. The rule is not capitals for emphasis; it is that the interface face speaks in
capitals and the display face speaks in sentences, and the two exceptions are both content rather
than chrome.

### Layout, depth and the blend layer

Every route is two layers. A **fixed frame** that does not scroll and carries the wordmark, the
navigation, the centre mark, the corner credit and the cursor pair. A **scrolling well** that
holds the route's content and is the only thing that moves under the wheel. The frame is pinned to
the window, not to the document, and the one place it moves is the narrow-width retraction below.

Depth is a ladder of eight values and building to it matters more than the numbers: `50` the
cursor pair, `20` the loading veil and the route transition veil, `12` the navigation, `11` the
wordmark and the corner credit, `10` the fixed frame generally, `9` the footer and its overlay,
`8` the centre mark, and `5` down to `0` for route content in document order. Two values are worth
defending: `50`, which keeps the cursor above the transition veil so the pointer never disappears
mid-navigation, and `8`, which puts the centre mark below the frame but above content, so a roster
name passes in front of the wordmark and behind nothing else.

**The wordmark and both halves of the cursor pair are composited with
`mix-blend-mode: difference`**, not painted in a fixed colour. That is what lets one wordmark sit
legibly over the black entry route and the pale work index with no script switching its colour,
and what makes the pointer marker readable over a photograph. The wordmark is authored once, in
black, and never in two versions. Difference blending forces its own compositing layer, and there
are exactly two such elements on the site, which is the correct number.

Beyond the two colour tokens and the four font tokens, the product declares no custom properties
of its own. Any further registers on the root element belong to a utility engine's transform and
filter plumbing and are not a design system; do not read them as one.

### Iconography

Every mark is inline vector geometry in the markup. There is no icon font, no sprite sheet and no
image-based icon anywhere on the site.

Four centre marks, one per route, all `18` units tall, all sitting at `y = 438` on a `1440 x 900`
window, with the `x` origin moving to compensate for the width so each is optically centred on the
midpoint at `720`: the entry route's is `0 0 41 18` at `[700, 438, 41, 18]`, one path with an
even-odd fill; the work index's is `0 0 14 18` at `[713, 438, 14, 18]`, three paths; the roster's
is `0 0 18 18` at `[711, 438, 18, 18]`, one path, and is a circled letter; the about route's is
`0 0 27 18` at `[707, 438, 27, 18]`, three paths. On the reference all four were filled with the
pale token, which reads on the entry route and disappears on the three pale ones; fill each with
its own route's contrast token instead, as the corner credit fix below does. The about route
carries a second mark, `0 0 27 22` at `[1105, 438, 29, 23]`, on the same line and `398px` to the
right, which belongs to that route's opening block and leaves with it on scroll rather than
belonging to the chrome.

The corner credit is `0 0 60 16` at `[1331, 865, 60, 16]`, four paths, with two outbound arrows of
identical `0 0 7 7` geometry at `[1409, 873, 8, 8]` and `[1401, 889, 8, 8]`. The pair is a hover
state, one arrow resting and one arrived, only ever one visible: on hover the first travels up and
to the right by `(8, -16)` while the second enters from below and left, on the positional
transition below. The credit links out to the design studio's own site and opens in a new context.

The credit is painted in a literal colour rather than blended, which on the reference makes it
invisible against the entry route's ground. **Fix that rather than reproducing it**: blend it as
the wordmark is blended, or give it the route's contrast colour.

The house's own marks are specified here as slots rather than as artwork. Before the artwork
exists, stand in the wordmark with the house name set lowercase in the display face and blended;
the entry centre mark with a horizontal ellipse `41` by `18` stroked at `1.5` units; the work
index mark with three filled rectangles on the `0 0 14 18` geometry; the roster mark with the
circled letter; the about mark with two overlapping circled letters `27` by `18` overall; and the
lockup's mark with the circled letter at `26` by `21`.

Optical centring is a rule, not a rounding: a mark is centred on the window midpoint by its own
rendered width, and the counter recomputes its own horizontal correction as its string widens
from `0%` to `100%`, which on the reference was a `-14.5078px` translation. A static centre drifts
by about half a character.

### Global chrome

**The wordmark** sits top left, set lowercase in the display face, blended, links to `/`, and is
the only route link outside the navigation. It suppresses the cursor square.

**The navigation** is four labels in the interface face at `12px / 500 / 14.4px` in capitals:
`WORKS` targeting `/works`, `TALENTS` targeting `/talents`, `CONTACT` opening a mail composition
to the house address, and `ABOUT` targeting `/about`. **`WORKS` is centred in the window and the
other three are grouped at the right.** It is an asymmetric bar, and building it as four evenly
spaced items is the most common way to get this design wrong. **`CONTACT` is not a route**: it
carries no active state, is never marked by the current route, and does not participate in the
route transition. Building it as a page builds something this product does not have. Above the
breakpoint it opens a mail composition to the house address directly. Below it, where a nav label
handing off to a mail client is unreliable, it opens the contact overlay described below, whose one
action is that same address.

Hover on any navigation item, and on every link on the site: `opacity` from `1` to `0.5`, over
`opacity 0.2s ease-out`, and nothing else. No underline, no colour, no movement.

**The cursor pair** is two elements at depth `50`: a small square that follows the pointer,
blended by difference, and a text label beside it that carries the name of whatever the pointer is
over. When inactive the pair is parked at a translation of `(-999, -999)` rather than hidden, so
it stays composited and does not stutter on first move. It becomes visible on an
opacity transition of `300ms` on `ease` running once and filling backwards, and its resting
opacity is `1`. It follows the pointer with a frame-rate independent lag so it arrives a moment
after the pointer rather than locked to it; interpolate toward the pointer at a coefficient of
about `0.08` per frame at 60 frames per second, normalised against elapsed time, and tune from
there. Any element may carry an opt-out flag that suppresses the square, and one directional
variant offsets the label `150px` above the pointer instead of beside it. **The pair is hidden
entirely on a pointer-coarse device.**

**The footer** is four columns in the interface face at `12px / 500` in capitals: the premises,
`9 PASSAGE BELLEVUE` over `PARIS` with `11` right-aligned in its own column; the two-line tagline
`FOR PICTURE` over `AND ITS MAKERS`; `WORK WITH US` over `PROD@EXAMPLE.COM`, which is a mail
link whose accessible name is the whole address; and `INSTAGRAM` over `LINKEDIN`, right aligned.
Behind it sits a scrim,
`linear-gradient(0deg, #313236 -1.82%, #31323684 43.56%, #eaebe500)`, scaled to `1.5` so its
gradient covers more than its box and never shows a hard edge at its top. The tagline is the one
string that appears in three places, here, in the closing lockup and in the document description;
its two lines run about `11` and `14` characters and the second completes the first as a sentence.

**The counter well** is one component with two jobs: it counts real load progress on the entry
route, and it counts position within the set on the roster at a narrow width. It also carries the
preview route's waiting state. On the reference the roster's narrow variant scrubs its transform
across the scroll.

**The contact overlay** exists in the markup with its items parked `200px` below their resting
position and rises as a stagger with a fade on the positional transition. It is a full-screen panel
with an explicit close control, it is the narrow-width surface behind the `CONTACT` label, and it
carries the house address and nothing else. It was never rendered in the capture, so build it from
that parked state and do not build a contact route.

### Motion

**There are no keyframe animations.** Motion is three things and nothing else: declared transitions
on state change, properties scrubbed against scroll position, and the two runtime transitions on
the cursor pair. Nothing loops. Nothing plays on arrival except by transition. There is no ambient
movement anywhere on this site.

**Eight declared transitions, and there is no ninth.**

| Declaration | What it carries |
|---|---|
| `opacity 0.2s ease-out` | every navigation and link hover |
| `opacity 0.4s` | the route transition fades |
| `transform 0.45s cubic-bezier(.83,.12,.35,.96)` | positional moves |
| `opacity 0.3s` | secondary fades |
| `filter 0.8s cubic-bezier(.2,.65,.47,.96)` | the blur and the colour return |
| `transform 0.8s cubic-bezier(.2,.65,.47,.96)` | the long positional moves |
| `opacity 0.1s` | the fastest fade on the site |
| `opacity` at `300ms` on `ease` | the cursor pair, runtime rather than declared |

**Three curves, no more.** `cubic-bezier(.2,.65,.47,.96)` leaves quickly and arrives slowly with no
overshoot, and is paired with the slow `0.8s` duration on `filter` and `transform`.
`cubic-bezier(.83,.12,.35,.96)` holds, then moves late and settles, and is paired with `0.45s` on
`transform`. And one named path curve belonging to the roster,
`M0,0 C0.244,0.14 0.153,0.707 0.388,0.871 0.572,1 0.723,1 1,1`, which rises slowly for the first
quarter, accelerates hard through the middle and is completely flat from `0.572` onward. That dead
flat tail is why a roster name reads as settling into place rather than sliding into place, and no
standard easing reproduces it.

**Two durations.** A pointer response completes inside `0.45s`. A signature effect takes `0.8s`.
There is no middle duration on this site, and adding one makes the motion read as inconsistent
even though every individual value is plausible.

**The route transition.** On navigation intent the fixed frame, the counter well, the footer and
the outgoing route content all take a state class and fade together on `opacity 0.4s`, not
staggered: three different elements were sampled at the same mid-transition opacity of `0.482`,
which only happens if they share one transition. The incoming content mounts, the centre mark
swaps to the new route's variant, the class comes off and everything fades back on the same
`0.4s`. The cursor pair at depth `50` sits above the veil and does not participate, which is why
the pointer never loses its marker mid-navigation.

**Letter splitting.** The navigation labels, the footer labels and the mail address are addressable
per character, so that each character can be transformed independently: `WORKS` is five elements
and the address is fourteen. On arrival they play as a staggered per-character entrance on the
positional transition with a per-index delay. **The split must be invisible to assistive technology
and to selection**: the accessible name of a split label is the whole word, never its characters.
This is the single most common accessibility failure in this technique.

**What this site does not have**, each of which a builder will add by reflex: no scale on hover, no
shadow ever, no colour transition, no easing with overshoot, no loop, no pulse, no ambient drift,
and no page-load animation except the entry counter.

**A global `transition: all` is not a design decision.** It is a utility engine's default, it was
measured 2,650 times on the reference, and it means every animatable property on every one of
those elements is watched for change. Do not reproduce it: declare the eight transitions above on
their named selectors and nowhere else.

### Scroll

Three surfaces never scroll and the rest do. The entry route does not scroll at any width, and a
scrollbar on it is a defect; the preview route does not scroll; and the roster does not scroll above
the breakpoint, though it scrolls to about `1,688px` below it. Everything else scrolls to the length
of its own content: the work index to `7,330px` at `1440 x 900`, the about route to `2,953px` at
`1440 x 900`, `2,785px` at `1024` and `2,451px` at `390`, and the work detail and the talent detail
to whatever their own media sequence comes to.

Wheel and trackpad input is smoothed, with the scroll position available to the effect system as a
continuous value rather than sampled from native scroll events, and the root element carries a
class while a scroll is in flight so styling can respond without a script touching style.
**Keyboard scrolling, anchor navigation and find-in-page must continue to work and must not be
smoothed into uselessness.** A reduced-motion preference disables the smoothing entirely and
returns native scroll.

**One scroll source feeds every scrubbed property on the site.** Do not let three components each
attach their own listener. Effects register a range and are driven from that one source: the about
route's blur, the footer arrival, the roster's narrow-width sequence and the frame retraction.

**The footer arrival** is the site's only scroll-driven positional move and it happens on both long
routes. As the document approaches its end the footer travels up into place and its scrim fades in,
while the list inside it closes a measured `249.506px` from below its resting position. The
movement occupies roughly the last third of the scroll. It is what makes the bottom of a page feel
arrived at rather than run out.

**The reveal is a wipe, not a fade.** A media container rests at `clip-path: inset(100% 0% 0%)`,
fully clipped away, and is uncovered from its bottom edge upward by driving the top inset to `0%`.
The same element carries a `-123px` horizontal offset, so the wipe and a lateral slide run
together.

### The media layer

Every route puts stills and moving images on screen, and they go through a rendering layer rather
than being laid out as plain images. What that layer must do:

Hold an arbitrary number of quadrilaterals in a plane, each carrying one image, each independently
positioned, scaled and depth-ordered. Play a generated reel into a quadrilateral in place of its
still, switching without a visible reload and without changing the quadrilateral's geometry. Apply
a per-quadrilateral colour transform, at minimum a desaturation drivable from `1` to `0` over
`0.8s`. Apply a per-quadrilateral reveal, the wipe above. Hold a steady frame rate with a dozen
quadrilaterals on screen on a three year old laptop on integrated graphics. And **degrade to plain
composited images when the rendering layer is unavailable**, with the same layout, the same reveals
and the same hover behaviour, losing only the smoothness.

Nothing here requires three dimensions: the measured layout is flat, every transform on a media
element is a two-by-three affine matrix, and no perspective value exists anywhere on the site.

**The fallback is not optional.** A production house's site is opened on locked-down agency laptops
with graphics acceleration disabled by policy more often than anyone building it expects, and the
rendering layer carries smoothness, not content: every work reachable and captioned, every talent
reachable and labelled, every reveal completing, every hover responding.

A reel plays in place of its still, muted, looping, without controls, and only while it is in view.
No reel is prepared until its still is within one window height of the viewport; a reel more than
one window height away is stopped and its buffer released; **never more than two run at once**; and
on the entry cluster, which can show twenty stills, the answer is zero, because the cluster is
stills only. A reduced-motion preference, a save-data hint or a metered connection suppresses reels
entirely and leaves the still. **The still must be visible before its reel is ready and must never
be replaced by a blank frame at any point.** That is the failure mode most likely to survive into
production.

### The routes, block by block

**The entry cluster, `/`.** Ground `#060403`. A percentage counts up at the optical centre in the
display face, reaching `100%`, while a veil covers the cluster and fades out on `opacity 0.4s` as
the count completes. The counter reports real progress against a defined set, the two font files,
the chrome and the cluster's own stills, and does not include reels, which are not fetched at this
point. **A counter that reaches `100%` before the page is ready is worse than no counter.** The
window then holds a loose cluster of roughly twenty stills, overlapping freely at sizes from about
`150px` to about `330px` on the long edge, with no grid and no consistent gutter, dense toward the
centre and thinning toward the edges, leaving the four corners empty and the exact centre clear
for the mark. **Positions are authored, not random**, and the overlap order is stable across
loads; a random scatter reads as a different design. There is no headline, no tagline, no button
and no scroll. Every still is a published work and links to its detail route. Pointing at one
fades it to half and nothing else: it does not lift, scale, brighten or gain a caption in place,
because the caption is the cursor label. This front page does not label its own contents; the
title appears beside your pointer only when you point, which is why every still is also a real
link with a written name and a visible caption on focus in the same position the cursor label
would occupy.

**The work index, `/works`.** Ground `#e9eae4`. An opening screen carrying one line of display
type in title case, sitting with its baseline near the bottom of the window and running nearly the
full width, which arrives out of focus and sharpens once on entry on the slow filter transition.
The line reads `Quiet decisions, made early, are the ones you notice last.` **The rest of that
first screen is empty pale ground and must stay empty**: it is the route's whole opening gesture
and what makes the first entry, arriving on scroll, land.

Then twelve entries down a long page in three widths, carried as data per entry rather than
derived from the index: a `left` variant about `598px` wide flush left from `x = 40`, a `right`
variant about `300px` wide flush right ending at `x = 1400`, and a `centre` variant about `1006px`
wide centred from `x = 219`. Their aspect ratios are about `1.87`, `1.0` and `1.63`. The vertical
gaps are large and the rhythm is authored: a centred full-bleed entry breaks the left-right
alternation, and at one sampled position two entries sit with a screen and a half of empty ground
between them.

Beneath each still, one caption row spanning the still's own width: a small filled square of about
`4px`, then `8px`, then the ordinal in the interface face at the left edge, and the title in the
display face at `24px / 300 / 25.2px` in title case flush with the still's right edge. The gap
between them therefore runs from about `240px` to about `940px` depending on the variant, and that
variance is the design.

**The colour return is the point of the route.** Every still rests fully desaturated and returns to
full colour on hover over `0.8s` on the slow curve. The endpoints are `1` and `0`; the sampled
values of `0.907712` and `0.0229703` on the reference are a probe catching a transition in flight,
not design values. Stills are scaled to `1.015` inside their clip so a reveal never exposes a
sub-pixel edge, and that scale is not animated. In one sentence: a pale page of colourless
photographs that give their colour back one at a time as you move down it.

**The route has no filter controls, no sort, no categories, tags, years or clients, no pagination,
no load-more and no search.** Twelve entries, one order, authored. The filtering on this site lives
on the roster, where a closed set of disciplines earns it.

**The work detail, `/works/{slug}`.** Ground `#e9eae4`. The title in the display face at
`56px / 300 / 61.6px`, the ordinal in the interface face, credits as role and name pairs in the
interface face with a name that matches a published talent linking to that talent's route, a
full-bleed reel, then a vertical sequence of stills in the three width variants above, then next
and previous. Next and previous follow the ordinal, wrap at both ends, and are labelled with the
neighbouring work's title in the display face. There is no breadcrumb and no back-to-index link:
the top bar already carries one.

**The talent roster, `/talents`.** Ground `#e9eae4`. One talent fills the window and the route does
not scroll above the breakpoint. The name is centred in the display face at `125px / 300 / 137.5px`
in title case with its baseline near `y = 250`; the discipline sits centred beneath it at `y = 357`
in the interface face in capitals; the centre mark sits at `[711, 438, 18, 18]`; and the portrait
is centred from `y = 567` at about `246px` wide, revealed by the wipe. **A name that will not fit
the window at `125px` reduces to fit rather than wrapping**, because the label, the mark and the
portrait are all positioned from fixed offsets and none of them will move to accommodate a second
line.

In the left margin, the discipline filter: the first control at `x = 54, y = 443` and the second at
`x = 54, y = 475`, in the interface face in capitals, with a drawn marker square of about `4px` at
`x = 40` level with the active one. That `x = 40` is the same left margin the work index uses for
its flush-left entries: one margin, both routes. The active discipline is at full strength; an
inactive one rests at `0.5` opacity of the ink token rather than in a colour of its own. **This is
the one place on the site where a hover brightens rather than fades**, because the resting state is
already faded.
Selecting a discipline filters the set and does not navigate. **There is no all state**: one
discipline is always active and the first is active on arrival, and there is no empty filter state
to design because a filter cannot exist without a talent behind it.

The set advances by wheel, trackpad or arrow key, one talent at a time, with the frame translating
and the name changing on the roster's own path curve, and the counter well tracking position in the
set. Arrow keys are a first-class input here rather than a fallback, and the current name is
announced on change.

**The talent detail, `/talents/{slug}`.** The name at the same `125px` as the roster, which is what
makes arriving here read as the roster opening rather than as a new page; the discipline in
capitals; the talent's reel; and their selected work, which reuses the work index's entry and
caption components exactly, colour return included, rather than a second smaller card. **Contact is
the house, not the person**: the mail address on this route is the house address, unchanged. No
talent email, no phone, no direct social links. That is what representation means.

**About, `/about`.** Ground `#e9eae4`, and the only route with no media at all, which is what makes
it read as the house speaking rather than showing. Three blocks over a little more than three
screens. First a symmetrical typographic figure, centred, in the display face at
`36px / 100 / 34.56px` in capitals: four lines, then the house name seven times down the middle,
then the same four lines mirrored back. The four lines run about `22`, `29`, `28` and `22`
characters, longest in the middle of the group, which is what gives the figure its taper, and they
read `PICTURES PATIENTLY MADE`, `PRACTISED HANDS, PLAIN PURPOSE`, `PEOPLE WORTH PUTTING FORWARD`
and `PICTURE AND ITS MAKERS`. **The symmetry is the gesture**: setting it as a simple list loses
the whole block. The route's second centre mark sits to the right of this figure and leaves with
it on scroll.

Then the body, two paragraphs in the display face at `18px / 300 / 21.6px`. The first is broken
into seven short lines by authored markup, each its own element, reading `We build, we bend,` /
`we break and rebuild,` / `making things that last` / `while asking what` / `comes next. Cirrus is
a` / `production house working` / `between the settled and the untried.` **Those breaks are
content, not layout**; do not re-wrap them to the container above the breakpoint, and drop them
entirely below it, because seven lines composed for a wide window become fourteen ragged ones on a
phone. The second paragraph is one long line of about `160` characters sitting well below the
first, reading `Founded in Paris, working wider. We support brands, agencies and artists with
picture, from first idea to final delivery: production, casting, studio and post.`

Then the closing lockup, the most typographically elaborate thing on the site and one figure rather
than a heading with subheadings. Three sizes: `CIRRUS`, `PICTURE` and `MAKERS` at `58px / 400 /
40.6px`; `PROD`, `FOR` and `AND` at `24.75px / 100 / 23.76px`; and `ITS` at `9.75px / 100 /
9.36px`. All capitals, a ratio of roughly `2.34` between each step, the house mark set as a
superior after the name, and the small words nested optically into the large ones' negative space
rather than set on their own line. Build it as a positioned composition; it will not survive
reflow.

**The blur is this route's whole mechanism.** Its text arrives blurred and sharpens as it
approaches the middle of the window, driven by scroll position rather than by a timer, and **the
drive is continuous and reversible: scrolling back re-blurs.** That reversibility is what makes the
effect feel attached to the reader's hand rather than played at them, and it is the part a
time-based implementation gets wrong. Where the effect is triggered rather than scrubbed it uses
the slow filter transition. The radius endpoints were never exposed on the reference: start at
about `10px` at the far end and `0` at the near end and tune. What matters more than the radius is
the mapping: full blur when the block is a screen away, zero when its centre reaches the window's
centre. **Below the breakpoint the text arrives sharp and the blur is not scrubbed at all**,
because a phone reader scrolls faster and holds the device closer, and a scrubbed blur at that
speed reads as a rendering fault.

**The preview harness, `/preview/{token}`.** Ground `#e9eae4`, does not scroll, carries the full
chrome. It resolves an unlisted record by its token and renders it through the same route
components as its published counterpart, so what the producer sees is what a visitor will see. **A
preview that uses a simplified renderer is worse than no preview**, because it certifies something
that was never checked. Without a producer session it renders nothing and reveals nothing about
what exists. It carries a persistent, unmissable marker reading `PREVIEW - NOT PUBLISHED` in the
interface face in capitals. Its waiting state reads `Loading preview...` in the display face at the
optical centre, using the same counter component the entry route uses: one loading component, two
routes.

**The studio.** Ground `#e9eae4`. `/studio` opens on a command palette, which is the producer's
entry point and the start of every producer journey: typing filters the house's own records by
title and slug, published beside unlisted, and offers the actions `New talent`, `New work`,
`Reorder index` and `Preview`. Creating a record opens its own address, `/studio/talents/new` or
`/studio/works/new`, rather than a layer over the palette, and editing opens `/studio/items/{id}`.
Publishing lands on `/studio/items/{id}/published`, a full-page confirmation naming the record, its
public address and the discipline or the ordinal it now carries, with one control back to the
palette. The record list is a card grid, one card per record, compact, carrying the title, the
slug, the kind and whether it is live.

**Not found.** Ground the pale token, text the dark token, the full chrome so the route is
recoverable from the top bar without a special link, the entry route's centre mark as the default,
and a single line in the display face in title case at the optical centre reading
`That page is not here.` Nothing
else: no search box, no suggestion list, no sitemap, no illustration. **The requested path is not
echoed back**, which is both charmless and the classic injection surface, and the response carries a
real not-found status rather than a success status with error content.

### What is known, and what is a reconstruction

Two of the routes above were never rendered when the reference was measured, and the honest
boundary is worth stating rather than hiding. What is known about the work detail and the talent
detail is that they exist at their addresses, that they share the persistent chrome, that their
ground is the pale one, and that the reference's moving-image inventory is far larger than the
twelve stills the index needs, so a detail route carries more media per record than the index
shows. Everything else about those two routes here, including the credits, the neighbour
navigation and the selected-work list, is a reconstruction from the index, the link structure and
the shared component vocabulary. Build them as specified; they are consistent with everything that
was measured.

Three further things are inferred rather than measured, and each is marked where it appears: the
cursor's lag coefficient, the blur's radius endpoints, and what the per-character letter-splitting
motion is used for. The entry cluster's own motion was never captured either, because the capture
drove motion by scrolling and that route does not scroll; the reconstruction is that the cluster is
still. The reference also ran a post-processing pass over its rendered scene whose effect is
unrecovered, and the reasonable reading of a site with no colour, no bloom and no visible
distortion is a very slight grain and a vignette. Build it at an intensity you can barely see, and
be prepared to remove it: an invisible pass is cheaper to delete than a visible one is to justify.

### Module and component architecture

Two trees, one of which never unmounts. The persistent tree holds the fixed frame, the wordmark,
the navigation, the centre mark slot, the cursor pair, the corner credit, the footer and its
overlay, the counter well and the contact overlay; it mounts once, before the first route renders,
and survives every navigation. The route tree swaps beneath it and is what carries the transition
state class. **The persistent tree must not be a child of the route outlet in any form**, including
a shared layout that re-renders, or every transition above stops being one object turning a page
and becomes a sequence of separate pages.

Six units are shared by more than one route and each is one module rather than several: the media
tile, which is one component with a width variant and not three components, since the three
variants carry identical hover behaviour and differ only in geometry; the caption row; the reveal
layer; the counter well; the blur block, used by both the about body and the work index opening
line; and the display line. Four naming conventions are worth adopting wholesale, and the opt-out
one most of all: a class any element can carry to suppress the cursor square is a better design
than a list of exceptions held inside the cursor component, and it is why that logic stays small.

The site holds almost no state, and it is enumerable in full: the current route; the active
discipline and the current index on the roster; load progress, once; pointer position and cursor
label; scroll position and the in-flight flag; and whether the contact overlay is open. There is no
visitor session, no preference and no persistence of any kind.

### Responsive behaviour

There is one real breakpoint, at `768px`. Above it is the wide layout; below it is the narrow
layout. A viewport shorter than `500px` is treated as narrow whatever its width, so a phone held in
landscape orientation does not get a wide layout in a short window and break the roster. No
orientation change was captured on the reference, so that rule is a defence rather than a
reproduction. Do not ship a
`prefers-color-scheme` query: the one on the reference belongs to the framework's error page and
leaves with it.

Below the breakpoint: the roster becomes a scroll-driven sequence, one talent per screenful, with
each block moving and fading as it enters and leaves, the portrait uncovered by the wipe as it
arrives, the discipline label crossfading between entries, the counter advancing, and the name
moving at a different rate from its block, which is the one place on this site where two elements
move at different rates against each other. The filter controls collapse into the counter row or
are dropped, since scrolling already traverses the whole set. On the work index and the about
route the wordmark and the navigation retract on scroll and return; build that as a threshold, not
as a continuous scrub, because it was sampled as a single move. The about route's authored line
breaks are dropped and its paragraph wraps normally. The about opening figure keeps its mirror and
reduces in size, because it is the page's identity. The closing lockup stacks to two sizes, keeps
the ratio and abandons the nesting.

The roster's four wide-window elements, the name, the label, the mark and the portrait, must
compose to one screenful. Size the name and the portrait from the window's height as well as its
width rather than reproducing the reference's ladder of six height-keyed queries.

**Every hover-only affordance needs a touch equivalent.** Below the breakpoint the work index's
stills render in full colour rather than waiting for a hover that cannot happen, the entry
cluster's stills carry visible captions rather than relying on the cursor label, and the credit's
arrow is static. The first two matter most: a phone visitor who never sees colour in the work,
because colour is behind a hover they cannot perform, has been shown a colourless portfolio by a
company that shoots in colour.

### Accessibility

This design makes four things hard and each needs solving rather than inheriting. Text split into
characters is announced as a stream of letters unless the whole word carries the accessible name
and the characters are hidden. Difference blending means contrast cannot be guaranteed by choosing
a colour, so it is guaranteed structurally instead: **the wordmark and the cursor label must never
be the only carrier of information**, and the wordmark's destination is duplicated in the top bar.
Hover-only information on the entry cluster is duplicated as real links with names and focus
captions. And a scroll-driven blur is text that is deliberately unreadable, so it must resolve to
sharp under reduced motion.

Naming: every media element carries a meaningful written alternative, a still described by its
title and its ordinal at minimum and a portrait by its name and discipline. The centre mark is
decorative and is hidden from assistive technology with no accessible name, because it has no
meaning a visitor can act on. The wordmark's accessible name is `Cirrus, home`, not the word logo.
The corner credit's is `Site by Aube, opens in a new tab`. A skip link reading `Skip to content` is
the first focusable element and moves focus past the chrome. Every route has exactly one top-level
heading, and on the roster the talent's name is it.

Focus: visible on every interactive element and **not** the `0.5` opacity used for hover. Use an
outline in the dark token on pale grounds and the pale token on the dark ground, offset from the
element.
Focus order follows visual order, so on the roster the filter controls precede the talent. Focus is
never trapped except inside the contact overlay while it is open, and returns to the control that
opened it on close; escape closes it.

The discipline filter is real buttons in the tab order, operable by enter and space, with the
selected state exposed rather than conveyed only by opacity and a small square.

Under a reduced-motion preference: smooth scrolling is off and native scroll returns; the about
blur resolves to sharp, its end state and not its start; the roster's entries appear in place with
no wipe and no drift; **the colour return still applies on hover, over `0.01s`**, because it is a
colour change carrying information rather than a motion, and removing it would tell that visitor
less about the work rather than more; reels do not play and the still remains with a play control;
the cursor pair is hidden; and route transitions cut rather than fade.

Contrast: the dark token on the pale token is the working pair and passes comfortably at every
size used, as does the pale token on the dark ground. An inactive filter resting at `0.5` opacity
must still reach `4.5:1` against its ground; if it does not, raise the resting opacity rather than
reaching for a colour, because there is no third value to reach for. No supporting value carries
text at any size, so no supporting value has a contrast obligation.

### Performance

Budgets, per route, compressed: script `250KB`; two variable font files at `200KB` each, both
preloaded and both subset to the Latin capitals and numerals this site actually uses; the first
still visible under two seconds on a mid-range laptop on a typical broadband connection; the entry
route interactive, counter included, under three seconds on the same; and a steady frame rate with
no dropped frames during any scrubbed effect on a three year old laptop.

**Moving pictures are the whole performance story.** On the reference they were `74.6%` of every
byte transferred, `120,872,010` of `162,123,713` bytes across 1,069 responses, against
`15,317,894` for stills in one modern format, `13,056,869` for script, `10,238,816` for fonts and
`2,321,222` for stills in a second format. Everything else on the site put together is the
remaining quarter. The rules in the media layer above are what hold that down, and the generated
reels obey them exactly as real files would: building the placeholder outside the budget rules
means the budget rules are untested until the day real footage arrives, which is the day it
matters.

Hint the compositor only for what is currently animating, adding the hint when an effect starts and
removing it when it ends. The reference carried 95 permanent hints, 61 on transform, 25 on opacity
and 9 on filter, which is 95 permanent layers on top of the two the blend mode already forces.
Nothing animates a property that triggers layout: every animation on this site is on `transform`,
`opacity`, `filter` or `clip-path`, and that discipline is the reason it performs at all.

Verify the substituted display face at `125px` at weight `300`, which is the roster name and the
most exposed setting on the site: a swap-induced reflow there is `125px` tall.

### Zero-asset substitution

**No binary ships with this build.** Every asset class is a procedural recipe, and the two grounds
and the footer scrim need no substitution at all because they are flat fills and a gradient the
browser draws.

**Stills** are generated per media row from that row's stored `seed`, so the same record always
produces the same still and the page is stable across reloads: fill with a linear gradient between
two of `#313236`, `#676767`, `#333333`, `#455e53` and `#dedede`, chosen by the seed at an angle
derived from the seed; overlay a second gradient at a different angle at low strength so the field
is not a flat ramp; add the grain below; and **draw nothing else**. No text, no dimensions, no
diagonal cross: a placeholder with its own size written across it makes every review about the
placeholder. Generate at the widths the index requires, `598`, `300` and `1006`, at the aspect
ratios above, and reserve space from the stored intrinsic dimensions. Gradients rather than noise
fields, because the colour return is invisible on a grey placeholder and two of those five values
carry real saturation.

**Reels** are a generated looping motion field drawn each frame rather than decoded: take the still
as the base field, displace it slowly along one axis with the phase from elapsed time and the
direction from the seed on a `12` second cycle, vary the overall brightness by a few percent on a
second slower cycle so the loop point is not visible, and draw the grain fresh each frame, which is
what makes it read as film rather than as a moving picture.

**The grain** is a tiling monochrome noise field generated once at build time as a `300px` tile and
reused: fractal noise at a base frequency around `0.9` over four octaves, with all colour removed,
composited at very low strength, enough to break the gradient banding and no more. **One tile,
repeated.** Per-element noise on a page carrying twelve large images is a measurable cost for an
invisible effect.

**The share image** is generated at build time at `1200 x 630`: the `#060403` ground with the
wordmark centred and optically raised by the same correction the marks use, and no photograph,
because the front page has no headline over its photographs and a share card that invents one is
inventing a design.

**Typefaces** are named, not shipped. Substitute any open-licence variable serif with a continuous
weight axis for the display face and any open-licence variable grotesque for the interface face.
Static weights will either cost eight extra files or force the design to abandon the
weight-falls-as-size-rises rule, which is one of the three things holding the type system together.

What the substitutions cost, honestly: the photographs themselves, which are the product, and the
house's own marks. What survives is every layout, every measurement, both colours, the whole motion
vocabulary, the wipe, the colour return, the blur, the block sequence and the type.

### Copy and metadata

Navigation: `WORKS`, `TALENTS`, `CONTACT`, `ABOUT`. Footer: `9 PASSAGE BELLEVUE`, `PARIS`, `11`;
`FOR PICTURE` over `AND ITS MAKERS`; `WORK WITH US` over `PROD@EXAMPLE.COM`; `INSTAGRAM` over
`LINKEDIN`. Roster filter: `DIRECTOR`, `PHOTOGRAPHER`, and `STYLIST` once a stylist is published.
The filter labels and the discipline labels are the same strings from the same derived set; do not
author them twice.

Document metadata on every route: a distinct `title`, `Cirrus` on the entry route, `Cirrus - Works`
on the index, `Cirrus - Talents` on the roster, `Cirrus - About` on about; a description of
`A production house for picture and its makers.`; `og:title` matching the title, `og:description`
matching the description, `og:image` pointing at the generated share image, and `twitter:card` of
`summary_large_image`; and a `viewport` of `width=device-width, initial-scale=1`. The preview route
and the not-found route are not indexable.

## Constraints

Two houses on one deployment, one of them served publicly. No visitor account is needed to read
anything. No comments, likes, shares, view counters, ratings or site search. No contact form: a
production house's enquiries arrive as long emails with attachments and a brief, which is a thing a
form makes worse. No cart, no prices, no payment, no newsletter. No pagination and no load-more on
the work index. No infinite feed anywhere. No chat widget. No second analytics product, and nothing
is written to a visitor's machine except what analytics requires and consent permits. No email is
sent by this build. No external network calls at runtime beyond the one named backing service. No
native app. Do not build the four bundle addresses the reference carried with nothing behind them.
The app must stay responsive with a few hundred records per house and a few thousand media rows.

## Deployment contract

- The app must be reachable at `APP_PUBLIC_URL`. The port mapping is `${APP_PUBLIC_PORT}:4173`,
  `4173` is the container-internal port and `APP_PUBLIC_PORT` is what the outside world uses. Read
  both from the environment; never hardcode either.
- The HTTP API is served on that same origin under the `/api` prefix.
- `GET /api/health` returns `200` once the app is ready.
- The app starts from the environment image with no manual steps.
- Login credentials, or an explicit statement that there are none, are written to
  `/app/USER_README.md`.
- Reserved `.browser_screenshots/` and `.downloads/` directories exist at the app root, empty.
- Serve a production build behind a static or preview server, never a dev server.
- The server must keep running after this session ends and must not be a child of the shell. An
  ordinary background job dies with its shell, and the app will not be running when it is next
  opened.
- Bind `0.0.0.0`, never `127.0.0.1` or `localhost`. A loopback-only listener is unreachable from
  outside the container.
- The backing service named in this brief is already running and reachable at its environment
  variable. Do not download, install, compile or start a copy of it.
- Use only the providers named in this brief. No edge functions.
- No persistent volumes, no fixed container names, no custom networks.

### API shapes

| Endpoint | Request body / query | Returns |
|---|---|---|
| `POST /api/auth/signup` | `{email, password}` | the new `viewer` account and a bearer token |
| `POST /api/auth/login` | `{email, password}` | a bearer token |
| `GET /api/works` | none | a top-level array of the served house's published works in ordinal order |
| `GET /api/works/{slug}` | none | one published work with its media, credits and neighbours |
| `GET /api/talents` | `discipline` | a top-level array of the served house's published talents |
| `GET /api/talents/{slug}` | none | one published talent with its media and derived selected work |
| `GET /api/disciplines` | none | a top-level array of the derived discipline set in first appearance order |
| `GET /api/media/{media_id}` | none | the generated object for a published record |
| `GET /api/preview/{token}` | none | one unlisted record in full, for its own house's producer |
| `GET /api/studio/items` | `kind` | a top-level array of the caller's own house's records |
| `GET /api/studio/items/{id}` | none | one of the caller's own house's records |
| `POST /api/studio/items` | `{kind, slug, title, discipline, variant}` | the created record, unlisted |
| `PATCH /api/studio/items/{id}` | the changed fields | the updated record |
| `POST /api/studio/items/{id}/publish` | `{published}` | the record with `published` and `published_at` |
| `POST /api/studio/items/{id}/media` | `{role, seed, width, height, alt}` | `{media_id, role, width, height}` |
| `POST /api/studio/items/{id}/credits` | `{role, name, talent_id}` | the created credit |
| `POST /api/studio/items/{id}/slug` | `{slug}` | the record at its new slug, the old one redirecting |
| `POST /api/studio/works/order` | `{ordered_ids}` | the house's works in their new order |
| `POST /api/studio/preview-tokens` | `{item_id}` | `{token, expires_at}` |

Bearer auth is required on every `/api/studio/` endpoint and on nothing else. A successful call
returns the named resource or shape. An invalid or unauthorized call is rejected as a client error,
never as a server error and never as a silent success, and the specific code is yours to choose.

### No mocks

The database is the fact. An in-memory dictionary standing in for a table, a JSON file on the app
container's filesystem, or a stubbed client that answers its own calls are each a contract
violation however good the interface looks. PostgreSQL is the only place a record actually lives,
and the app's UI can only reflect what lives there, never substitute for it. The generated pixels
are the one exception and they are not stored at all: a media row carries the seed and the app
draws from it, so two requests for the same media id return the same image.

## Definition of done

A stranger can open the entry route, watch the counter finish, cross to the numbered index, open a
film, reach the roster and switch it from `DIRECTOR` to `PHOTOGRAPHER`. A producer can sign in,
add a talent, preview it before anyone else can see it, and publish it onto the roster, where its
discipline joins the filter. Until they publish it, that talent is absent from the roster, absent
at its own address, and its portrait is unreachable to anyone holding the address. And the producer
of the other house can reach none of it at any address, at any time.
