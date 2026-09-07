# Checklist: Cirrus

Source: instruction.md
Sections present: overview, roles, features, flow, uiux, technical, datamodel, frontend, constraints, deployment
Items: 770
Unpinned values flagged: 3

## C-OV Overview

- [ ] `C-OV-01` `capability` The app serves the public site of a production house in Paris. `src: Overview para 1`
- [ ] `C-OV-02` `capability` The app represents directors, photographers, both as one roster. `src: Overview para 1`
- [ ] `C-OV-03` `capability` The app delivers films for brands, agencies, labels. `src: Overview para 1`
- [ ] `C-OV-04` `capability` The app shows the work as a numbered index of twelve entries. `src: Overview para 1`
- [ ] `C-OV-05` `capability` The app shows the roster one name at a time filtered by discipline. `src: Overview para 1`
- [ ] `C-OV-06` `capability` The app opens a conversation through one mail address. `src: Overview para 1`
- [ ] `C-OV-07` `constraint` The app sells nothing. `src: Overview para 1`
- [ ] `C-OV-08` `constraint` The app carries no visitor comments. `src: Overview para 1`
- [ ] `C-OV-09` `constraint` The app carries no search field. `src: Overview para 1`
- [ ] `C-OV-10` `role` One producer per house adds a talent behind a private studio. `src: Overview para 2`
- [ ] `C-OV-11` `capability` A producer assigns a talent's discipline. `src: Overview para 2`
- [ ] `C-OV-12` `capability` A producer attaches a showreel, stills to a talent. `src: Overview para 2`
- [ ] `C-OV-13` `capability` A producer orders the works index. `src: Overview para 2`
- [ ] `C-OV-14` `capability` A producer publishes a profile to the public roster. `src: Overview para 2`
- [ ] `C-OV-15` `capability` A producer holds a profile unlisted. `src: Overview para 2`
- [ ] `C-OV-16` `constraint` An unlisted record is absent rather than merely unlinked. `src: Overview para 3`
- [ ] `C-OV-17` `constraint` An unlisted record's generated pixels are absent with the record. `src: Overview para 3`
- [ ] `C-OV-18` `constraint` One house's producer cannot see another house's records. `src: Overview para 3`

## C-RL User roles

- [ ] `C-RL-01` `role` A visitor with no account reads every public route of the served house. `src: User roles table row 1`
- [ ] `C-RL-02` `role` A visitor with no account opens the mail address. `src: User roles table row 1`
- [ ] `C-RL-03` `role` A visitor with no account cannot reach a studio route. `src: User roles table row 1`
- [ ] `C-RL-04` `role` A visitor with no account cannot read an unlisted record. `src: User roles table row 1`
- [ ] `C-RL-05` `role` A visitor with no account cannot fetch an unlisted record's media. `src: User roles table row 1`
- [ ] `C-RL-06` `role` A signed up `viewer` account reads only what a visitor reads. `src: User roles table row 2`
- [ ] `C-RL-07` `role` A signed up `viewer` account belongs to no house. `src: User roles table row 2`
- [ ] `C-RL-08` `role` A signed up `viewer` account cannot reach a studio route. `src: User roles table row 2`
- [ ] `C-RL-09` `role` A signed up `viewer` account cannot see anything unlisted. `src: User roles table row 2`
- [ ] `C-RL-10` `role` A signed up `viewer` account cannot change a record. `src: User roles table row 2`
- [ ] `C-RL-11` `role` A `producer` creates a work inside their own house. `src: User roles table row 3`
- [ ] `C-RL-12` `role` A `producer` creates a talent inside their own house. `src: User roles table row 3`
- [ ] `C-RL-13` `role` A `producer` edits a record inside their own house. `src: User roles table row 3`
- [ ] `C-RL-14` `role` A `producer` attaches media to a record inside their own house. `src: User roles table row 3`
- [ ] `C-RL-15` `role` A `producer` attaches credits to a record inside their own house. `src: User roles table row 3`
- [ ] `C-RL-16` `role` A `producer` reorders the index inside their own house. `src: User roles table row 3`
- [ ] `C-RL-17` `role` A `producer` mints a preview token inside their own house. `src: User roles table row 3`
- [ ] `C-RL-18` `role` A `producer` publishes a record inside their own house. `src: User roles table row 3`
- [ ] `C-RL-19` `role` A `producer` unlists a record inside their own house. `src: User roles table row 3`
- [ ] `C-RL-20` `role` The server enforces authorization on every studio endpoint, reads included. `src: User roles para after table`
- [ ] `C-RL-21` `role` A direct API call from a `viewer` session is rejected by the server. `src: User roles para after table`
- [ ] `C-RL-22` `role` A direct API call from a producer of another house is rejected by the server. `src: User roles para after table`
- [ ] `C-RL-23` `constraint` A rejected studio call leaves the protected record unchanged. `src: User roles para after table`
- [ ] `C-RL-24` `constraint` A producer asking for another house's record is answered as for a record that does not exist. `src: User roles para after table`
- [ ] `C-RL-25` `capability` Signup is open to anyone. `src: User roles closing para`
- [ ] `C-RL-26` `role` Signup always issues a `viewer` with no house. `src: User roles closing para`
- [ ] `C-RL-27` `literal` The app seeds an account at `producer@example.com` owning `cirrus`. `src: User roles closing para`
- [ ] `C-RL-28` `literal` The app seeds an account at `producer.meridian@example.com` owning `meridian`. `src: User roles closing para`
- [ ] `C-RL-29` `literal` The app seeds an account at `viewer@example.com` owning nothing. `src: User roles closing para`

## C-CF Core features

- [ ] `C-CF-01` `capability` The app authenticates an account by email plus password. `src: Core features, auth para`
- [ ] `C-CF-02` `constraint` The app stores a password hashed. `src: Core features, auth para`
- [ ] `C-CF-03` `literal` `POST /api/auth/login` returns a bearer token. `src: Core features, auth para`
- [ ] `C-CF-04` `constraint` Every studio call carries a bearer token. `src: Core features, auth para`
- [ ] `C-CF-05` `constraint` The app never reads `role` from a request body. `src: Core features, auth para`
- [ ] `C-CF-06` `constraint` The app never reads the house from a request body. `src: Core features, auth para`
- [ ] `C-CF-07` `capability` Every public read answers with published records only. `src: Core features rule 1`
- [ ] `C-CF-08` `constraint` Every public read answers with records of the served house only. `src: Core features rule 1`
- [ ] `C-CF-09` `literal` The app seeds `Noor Vasquez` unlisted. `src: Core features rule 1`
- [ ] `C-CF-10` `literal` The app seeds `The Quiet Room` unlisted. `src: Core features rule 1`
- [ ] `C-CF-11` `constraint` An unlisted talent appears in no roster response. `src: Core features rule 1`
- [ ] `C-CF-12` `constraint` An unlisted talent's discipline appears in no discipline set. `src: Core features rule 1`
- [ ] `C-CF-13` `constraint` An unlisted work appears in no index response. `src: Core features rule 1`
- [ ] `C-CF-14` `constraint` An unlisted work appears in no entry cluster. `src: Core features rule 1`
- [ ] `C-CF-15` `literal` `GET /api/talents/noor-vasquez` is not found for a visitor. `src: Core features rule 2`
- [ ] `C-CF-16` `literal` `GET /api/talents/rives` answers for a visitor. `src: Core features rule 2`
- [ ] `C-CF-17` `capability` A record created in the studio is created unlisted. `src: Core features rule 3`
- [ ] `C-CF-18` `data` A record created in the studio carries `published_at` null. `src: Core features rule 3`
- [ ] `C-CF-19` `capability` Publishing a record stamps `published_at`. `src: Core features rule 3`
- [ ] `C-CF-20` `capability` Unlisting a record clears `published_at`. `src: Core features rule 3`
- [ ] `C-CF-21` `capability` Unlisting a record drops the record from every public read at once. `src: Core features rule 3`
- [ ] `C-CF-22` `constraint` Publishing a record whose poster `alt` is empty is refused. `src: Core features rule 3`
- [ ] `C-CF-23` `constraint` A refused publish changes nothing. `src: Core features rule 3`
- [ ] `C-CF-24` `constraint` Media is generated, never uploaded. `src: Core features rule 4`
- [ ] `C-CF-25` `data` A media row carries a `seed`. `src: Core features rule 4`
- [ ] `C-CF-26` `data` A media row carries a `width`. `src: Core features rule 4`
- [ ] `C-CF-27` `data` A media row carries a `height`. `src: Core features rule 4`
- [ ] `C-CF-28` `data` A media row carries an `alt`. `src: Core features rule 4`
- [ ] `C-CF-29` `literal` `GET /api/media/{media_id}` renders the object, its record is published. `src: Core features rule 4`
- [ ] `C-CF-30` `constraint` `GET /api/media/{media_id}` is not found to any caller but the record's own house producer for an unlisted record, however the caller got the id. `src: Core features rule 4`
- [ ] `C-CF-31` `literal` `POST /api/studio/preview-tokens` mints one token for one record. `src: Core features rule 5`
- [ ] `C-CF-32` `literal` A preview token is `32` characters of lowercase hex. `src: Core features rule 5`
- [ ] `C-CF-33` `literal` A preview token is good for `15 minutes`. `src: Core features rule 5`
- [ ] `C-CF-34` `literal` `GET /preview/{token}` renders the token's record through the published route's own components. `src: Core features rule 5`
- [ ] `C-CF-35` `constraint` A preview token presented for another record is not found. `src: Core features rule 5`
- [ ] `C-CF-36` `constraint` A preview token presented for another house's record is not found. `src: Core features rule 5`
- [ ] `C-CF-37` `role` An `/api/studio/` call carrying a `viewer` token is denied. `src: Core features rule 6`
- [ ] `C-CF-38` `role` An `/api/studio/` call carrying no token is denied. `src: Core features rule 6`
- [ ] `C-CF-39` `constraint` A denied studio call leaves the record unchanged. `src: Core features rule 6`
- [ ] `C-CF-40` `role` A `producer` of `meridian` reading a `cirrus` record is answered not found. `src: Core features rule 7`
- [ ] `C-CF-41` `role` A `producer` of `meridian` editing a `cirrus` record is answered not found. `src: Core features rule 7`
- [ ] `C-CF-42` `role` A `producer` of `meridian` attaching media to a `cirrus` record is answered not found. `src: Core features rule 7`
- [ ] `C-CF-43` `role` A `producer` of `meridian` publishing a `cirrus` record is answered not found. `src: Core features rule 7`
- [ ] `C-CF-44` `role` A `producer` of `meridian` unlisting a `cirrus` record is answered not found. `src: Core features rule 7`
- [ ] `C-CF-45` `role` A `producer` of `meridian` reordering a `cirrus` record is answered not found. `src: Core features rule 7`
- [ ] `C-CF-46` `role` A `producer` of `meridian` minting a token for a `cirrus` record is answered not found. `src: Core features rule 7`
- [ ] `C-CF-47` `constraint` A cross-house studio call leaves the record unchanged. `src: Core features rule 7`
- [ ] `C-CF-48` `capability` An ordinal is derived at read time from the published set in stored order. `src: Core features rule 8`
- [ ] `C-CF-49` `literal` Ordinals are contiguous from `001`. `src: Core features rule 8`
- [ ] `C-CF-50` `literal` An ordinal is zero padded to three digits. `src: Core features rule 8`
- [ ] `C-CF-51` `literal` Unlisting the fifth of twelve works leaves eleven numbered `001` to `011`. `src: Core features rule 8`
- [ ] `C-CF-52` `data` A slug is lowercase kebab. `src: Core features rule 9`
- [ ] `C-CF-53` `constraint` A slug is unique per house per kind. `src: Core features rule 9`
- [ ] `C-CF-54` `constraint` A slug is assigned once, never changes with the title. `src: Core features rule 9`
- [ ] `C-CF-55` `literal` `POST /api/studio/items/{id}/slug` leaves the old slug redirecting forever. `src: Core features rule 9`
- [ ] `C-CF-56` `capability` The discipline set is derived from published talent in first appearance order. `src: Core features rule 10`
- [ ] `C-CF-57` `constraint` The discipline set is never authored separately. `src: Core features rule 10`
- [ ] `C-CF-58` `literal` Publishing `Noor Vasquez` adds `stylist` to the discipline set. `src: Core features rule 10`
- [ ] `C-CF-59` `literal` Unlisting `Camille Ferrand` drops `photographer` from the discipline set. `src: Core features rule 10`
- [ ] `C-CF-60` `data` A credit names a role, a name. `src: Core features rule 11`
- [ ] `C-CF-61` `data` A credit may point at a talent. `src: Core features rule 11`
- [ ] `C-CF-62` `capability` A talent's selected work is read from credits. `src: Core features rule 11`
- [ ] `C-CF-63` `constraint` A talent's selected work is never stored on the talent. `src: Core features rule 11`

## C-UF User flow

- [ ] `C-UF-01` `literal` The app serves the entry cluster at `/`. `src: User flow route table row 1`
- [ ] `C-UF-02` `literal` The app serves the numbered index at `/works`. `src: User flow route table row 2`
- [ ] `C-UF-03` `literal` The app serves the numbered index at `/works/`. `src: User flow route table row 2`
- [ ] `C-UF-04` `literal` The app serves one film at `/works/the-halo`. `src: User flow route table row 3`
- [ ] `C-UF-05` `literal` The app serves the roster at `/talents`. `src: User flow route table row 4`
- [ ] `C-UF-06` `literal` The app serves the roster at `/talents/`. `src: User flow route table row 4`
- [ ] `C-UF-07` `literal` The app serves one talent at `/talents/rives`. `src: User flow route table row 5`
- [ ] `C-UF-08` `literal` The app serves the house's own page at `/about`. `src: User flow route table row 6`
- [ ] `C-UF-09` `literal` The app serves open signup at `/signup`. `src: User flow route table row 7`
- [ ] `C-UF-10` `literal` The app serves sign in at `/studio/login`. `src: User flow route table row 8`
- [ ] `C-UF-11` `literal` The app serves one unlisted record at `/preview/{token}` to a `producer`. `src: User flow route table row 9`
- [ ] `C-UF-12` `literal` The app serves the command palette at `/studio` to a `producer`. `src: User flow route table row 10`
- [ ] `C-UF-13` `literal` The app serves creation at `/studio/talents/new` to a `producer`. `src: User flow route table row 11`
- [ ] `C-UF-14` `literal` The app serves creation at `/studio/works/new` to a `producer`. `src: User flow route table row 11`
- [ ] `C-UF-15` `literal` The app serves the editor at `/studio/items/{id}` to a `producer`. `src: User flow route table row 12`
- [ ] `C-UF-16` `literal` The app serves the confirmation at `/studio/items/{id}/published` to a `producer`. `src: User flow route table row 13`
- [ ] `C-UF-17` `capability` A visitor asking for `/studio` lands on `/studio/login`. `src: User flow entry and redirects`
- [ ] `C-UF-18` `capability` A producer returns to `/studio` after signing in. `src: User flow entry and redirects`
- [ ] `C-UF-19` `role` A signed-in `viewer` asking for `/studio` is refused, sees the entry route. `src: User flow entry and redirects`
- [ ] `C-UF-20` `constraint` No studio control is drawn for a `viewer`. `src: User flow entry and redirects`
- [ ] `C-UF-21` `capability` Signing out makes `/studio` unreachable at once. `src: User flow entry and redirects`
- [ ] `C-UF-22` `capability` An expired token mid-edit returns to `/studio/login`. `src: User flow entry and redirects`
- [ ] `C-UF-23` `constraint` An expired token mid-edit leaves nothing half saved. `src: User flow entry and redirects`
- [ ] `C-UF-24` `constraint` An address that matches nothing answers with a real not-found status. `src: User flow entry and redirects`
- [ ] `C-UF-25` `capability` An address that matches nothing renders the site's own not-found surface. `src: User flow entry and redirects`
- [ ] `C-UF-26` `constraint` The not-found surface does not echo the requested path back. `src: User flow entry and redirects`
- [ ] `C-UF-27` `literal` `GET /api/works` returns 12 works in ordinal order. `src: User flow, what each surface holds`
- [ ] `C-UF-28` `literal` `GET /api/talents` returns 3 talents. `src: User flow, what each surface holds`
- [ ] `C-UF-29` `literal` `GET /api/disciplines` returns `director` then `photographer`. `src: User flow, what each surface holds`
- [ ] `C-UF-30` `capability` `GET /api/works/{slug}` carries its neighbours by ordinal. `src: User flow, what each surface holds`
- [ ] `C-UF-31` `literal` The neighbour sequence wraps `012` to `001`. `src: User flow, what each surface holds`
- [ ] `C-UF-32` `capability` Every still in the entry cluster is a link named by its title then its ordinal. `src: User flow, what each surface holds`
- [ ] `C-UF-33` `constraint` `/works`, `/works/` resolve to the same surface with no redirect flash. `src: User flow, what each surface holds`
- [ ] `C-UF-34` `constraint` `/talents`, `/talents/` resolve to the same surface with no redirect flash. `src: User flow, what each surface holds`
- [ ] `C-UF-35` `ui` A visitor watches the counter reach `100%`, the veil clear on `/`. `src: User flow journey 1`
- [ ] `C-UF-36` `ui` Pointing at a cluster still shows its title beside the pointer. `src: User flow journey 1`
- [ ] `C-UF-37` `ui` Pressing a cluster still lands on that film. `src: User flow journey 1`
- [ ] `C-UF-38` `ui` Pointing at a work index entry returns its colour over the slow duration. `src: User flow journey 2`
- [ ] `C-UF-39` `ui` A visitor moves from one film to the next by ordinal. `src: User flow journey 2`
- [ ] `C-UF-40` `ui` Pressing `PHOTOGRAPHER` on the roster narrows the set to `Camille Ferrand`. `src: User flow journey 3`
- [ ] `C-UF-41` `ui` The marker square moves beside the active discipline. `src: User flow journey 3`
- [ ] `C-UF-42` `ui` `/talents/camille-ferrand` lists the works she is credited on. `src: User flow journey 3`
- [ ] `C-UF-43` `ui` A producer signs in at `/studio/login` as `producer@example.com`. `src: User flow journey 4`
- [ ] `C-UF-44` `ui` A producer opens the palette, types a name. `src: User flow journey 4`
- [ ] `C-UF-45` `ui` A producer chooses `New talent` then fills the form at `/studio/talents/new`. `src: User flow journey 4`
- [ ] `C-UF-46` `ui` A producer mints a preview token, opens the preview. `src: User flow journey 4`
- [ ] `C-UF-47` `ui` Publishing lands the producer on the confirmation. `src: User flow journey 4`
- [ ] `C-UF-48` `ui` The roster then carries the new name, the filter carries `STYLIST`. `src: User flow journey 4`
- [ ] `C-UF-49` `ui` Every list has an empty state in words. `src: User flow states`
- [ ] `C-UF-50` `ui` Every route has a loading state that uses the counter. `src: User flow states`
- [ ] `C-UF-51` `ui` A media container reserves its space from its stored intrinsic size. `src: User flow states`
- [ ] `C-UF-52` `ui` A media container clears its placeholder on decode or failure. `src: User flow states`
- [ ] `C-UF-53` `ui` A rejected form keeps what was typed, names what was wrong. `src: User flow states`

## C-UX UI and UX notes

- [ ] `C-UX-01` `ui` Every effect takes something away rather than adding something. `src: UI/UX notes para 1`
- [ ] `C-UX-02` `ui` The surface is two warm colours, their states. `src: UI/UX notes para 1`
- [ ] `C-UX-03` `ui` The register is considered, print-like, unhurried. `src: UI/UX notes para 1`
- [ ] `C-UX-04` `ui` A commissioner sees photographs before any interface. `src: UI/UX notes para 1`
- [ ] `C-UX-05` `ui` Layout is `top-nav`. `src: UI/UX notes para 2`
- [ ] `C-UX-06` `ui` The fixed frame carries a wordmark, four labels, a centre mark, a corner credit. `src: UI/UX notes para 2`
- [ ] `C-UX-07` `ui` The fixed frame never remounts. `src: UI/UX notes para 2`
- [ ] `C-UX-08` `ui` A scrolling well carries the route beneath the frame. `src: UI/UX notes para 2`
- [ ] `C-UX-09` `ui` The studio is command-palette-first. `src: UI/UX notes para 2`
- [ ] `C-UX-10` `ui` Every producer journey starts at the palette. `src: UI/UX notes para 2`
- [ ] `C-UX-11` `ui` Density is spacious on the public routes, compact in the palette. `src: UI/UX notes para 2`
- [ ] `C-UX-12` `ui` Type is serif throughout for anything the house says. `src: UI/UX notes para 3`
- [ ] `C-UX-13` `ui` One grotesque carries every label, caption, control at one size. `src: UI/UX notes para 3`
- [ ] `C-UX-14` `ui` Hierarchy comes from position, from the display face. `src: UI/UX notes para 3`
- [ ] `C-UX-15` `ui` Boldness falls as size rises. `src: UI/UX notes para 3`
- [ ] `C-UX-16` `ui` Colour is a warm near-black, a warm off-white, nothing else. `src: UI/UX notes para 4`
- [ ] `C-UX-17` `constraint` There is no accent, no brand hue, no state colour. `src: UI/UX notes para 4`
- [ ] `C-UX-18` `constraint` A link is distinguished by position, by its hover, never by colour. `src: UI/UX notes para 4`
- [ ] `C-UX-19` `constraint` Meaning is never carried by colour alone. `src: UI/UX notes para 4`
- [ ] `C-UX-20` `ui` Motion is eased, subtractive. `src: UI/UX notes para 5`
- [ ] `C-UX-21` `ui` Pointer responses are fast, positional moves are slow with nothing between. `src: UI/UX notes para 5`
- [ ] `C-UX-22` `ui` Every hover resolves to one opacity change. `src: UI/UX notes para 5`
- [ ] `C-UX-23` `ui` The index gives a still its colour back rather than growing the still. `src: UI/UX notes para 5`
- [ ] `C-UX-24` `ui` The about route arrives out of focus, sharpens against the wheel. `src: UI/UX notes para 5`
- [ ] `C-UX-25` `constraint` Nothing loops, bounces or scales. `src: UI/UX notes para 5`
- [ ] `C-UX-26` `constraint` No transition touches a colour. `src: UI/UX notes para 5`
- [ ] `C-UX-27` `ui` Reduced motion resolves every scrubbed effect to its end state. `src: UI/UX notes para 5`
- [ ] `C-UX-28` `ui` Text meets WCAG AA contrast on both grounds. `src: UI/UX notes para 6`
- [ ] `C-UX-29` `ui` Every split label exposes its whole word as its accessible name. `src: UI/UX notes para 6`
- [ ] `C-UX-30` `ui` Keyboard navigation reaches every control with a focus ring that is not the hover treatment. `src: UI/UX notes para 6`
- [ ] `C-UX-31` `ui` The roster advances on arrow keys. `src: UI/UX notes para 6`
- [ ] `C-UX-32` `ui` Every still carries a written alternative. `src: UI/UX notes para 6`
- [ ] `C-UX-33` `ui` Marks that mean nothing are hidden rather than labelled. `src: UI/UX notes para 6`
- [ ] `C-UX-34` `ui` Responsive behaviour holds at every viewport between the named widths. `src: UI/UX notes para 7`
- [ ] `C-UX-35` `ui` There is one real breakpoint. `src: UI/UX notes para 7`
- [ ] `C-UX-36` `ui` Below the breakpoint the roster becomes a scroll rather than one screen. `src: UI/UX notes para 7`
- [ ] `C-UX-37` `ui` Below the breakpoint the frame retracts to give the work its height. `src: UI/UX notes para 7`
- [ ] `C-UX-38` `ui` Below the breakpoint hover-only affordances get touch equivalents. `src: UI/UX notes para 7`

## C-TR Technical requirements

- [ ] `C-TR-01` `contract` The app is server-rendered. `src: Technical requirements para 1`
- [ ] `C-TR-02` `contract` A Flask backend renders Jinja templates. `src: Technical requirements para 1`
- [ ] `C-TR-03` `contract` Alpine.js enhances the delivered HTML in place. `src: Technical requirements para 1`
- [ ] `C-TR-04` `constraint` The browser receives a complete document on first paint. `src: Technical requirements para 1`
- [ ] `C-TR-05` `constraint` There is no client-side render pass that produces the page. `src: Technical requirements para 1`
- [ ] `C-TR-06` `capability` Alpine.js drives the entry counter. `src: Technical requirements para 1`
- [ ] `C-TR-07` `capability` Alpine.js drives the cursor pair. `src: Technical requirements para 1`
- [ ] `C-TR-08` `capability` Alpine.js drives the discipline filter. `src: Technical requirements para 1`
- [ ] `C-TR-09` `capability` Alpine.js drives the roster's advance. `src: Technical requirements para 1`
- [ ] `C-TR-10` `capability` Alpine.js drives the studio's command palette. `src: Technical requirements para 1`
- [ ] `C-TR-11` `capability` Alpine.js drives the studio's forms. `src: Technical requirements para 1`
- [ ] `C-TR-12` `contract` The app serves a production build. `src: Technical requirements para 1`
- [ ] `C-TR-13` `constraint` The app uses only the libraries named in the brief plus their direct dependencies. `src: Technical requirements para 2`
- [ ] `C-TR-14` `constraint` The app introduces no second database, cache, queue, object store, identity provider or mail vendor. `src: Technical requirements para 2`
- [ ] `C-TR-15` `literal` `postgres` is the only backing service available to the app. `src: Technical requirements para 2`
- [ ] `C-TR-16` `constraint` There is no content service, no image transform host, no video host. `src: Technical requirements para 2`
- [ ] `C-TR-17` `constraint` Every pixel, every frame is generated by the app itself. `src: Technical requirements para 2`
- [ ] `C-TR-18` `literal` The app reads `DATABASE_URL` for PostgreSQL. `src: Technical requirements para 3`
- [ ] `C-TR-19` `literal` The app reads `APP_PUBLIC_URL` for its own address. `src: Technical requirements para 3`
- [ ] `C-TR-20` `literal` The app reads `APP_PUBLIC_PORT` for its own port. `src: Technical requirements para 3`
- [ ] `C-TR-21` `constraint` The app never hardcodes a host or a port. `src: Technical requirements para 3`
- [ ] `C-TR-22` `contract` Auth is app-implemented email, password with bearer tokens. `src: Technical requirements para 4`
- [ ] `C-TR-23` `constraint` Passwords are stored hashed. `src: Technical requirements para 4`
- [ ] `C-TR-24` `constraint` There is no external identity provider. `src: Technical requirements para 4`
- [ ] `C-TR-25` `literal` `GET /api/health` returns `200` once the app is ready. `src: Technical requirements para 5`
- [ ] `C-TR-26` `contract` Logs are one line per request on stdout. `src: Technical requirements para 5`
- [ ] `C-TR-27` `capability` Moving between routes leaves the wordmark, the four labels, the corner credit, the cursor pair on screen. `src: Technical requirements para 6`
- [ ] `C-TR-28` `constraint` Navigation does not return the pointer marker to its parked position. `src: Technical requirements para 6`
- [ ] `C-TR-29` `capability` Navigation swaps the centre mark to the new route's variant. `src: Technical requirements para 6`
- [ ] `C-TR-30` `capability` The frame fades out, back on the fade duration during navigation. `src: Technical requirements para 6`
- [ ] `C-TR-31` `constraint` A rejected request answers as a client error with a reason. `src: Technical requirements para 7`
- [ ] `C-TR-32` `constraint` A rejected request changes no state. `src: Technical requirements para 7`
- [ ] `C-TR-33` `contract` A list endpoint answers with a top-level JSON array. `src: Technical requirements para 7`
- [ ] `C-TR-34` `capability` Caching is allowed on public read routes. `src: Technical requirements para 8`
- [ ] `C-TR-35` `capability` Caching is revalidated on publish, on unlist. `src: Technical requirements para 8`
- [ ] `C-TR-36` `constraint` The preview route is never cached by a shared cache. `src: Technical requirements para 8`
- [ ] `C-TR-37` `constraint` The preview route is never indexable. `src: Technical requirements para 8`
- [ ] `C-TR-38` `constraint` Analytics loads only after the route is interactive. `src: Technical requirements para 8`
- [ ] `C-TR-39` `constraint` Analytics observes page views only. `src: Technical requirements para 8`
- [ ] `C-TR-40` `constraint` A blocked analytics loader fails silently rather than rendering an error page. `src: Technical requirements para 8`

## C-DM Data model

- [ ] `C-DM-01` `data` The app holds seven tables. `src: Data model para 1`
- [ ] `C-DM-02` `data` All timestamps are UTC. `src: Data model para 1`
- [ ] `C-DM-03` `literal` Every seeded account uses the password `deku-demo-pw-2026`. `src: Data model, password para`
- [ ] `C-DM-04` `constraint` The seeded password is hashed as normal, the exact literal works at login. `src: Data model, password para`
- [ ] `C-DM-05` `literal` The seeded password is written into `/app/USER_README.md` alongside each account. `src: Data model, password para`
- [ ] `C-DM-06` `data` `houses` carries `id`, `slug` unique, `name`, `tagline_upper`, `tagline_lower`, `street`, `city`, `district`, `contact_email`, `created_at`. `src: Data model, houses`
- [ ] `C-DM-07` `literal` Two houses are seeded, `cirrus`, `meridian`. `src: Data model, houses`
- [ ] `C-DM-08` `literal` The deployment publishes `cirrus`. `src: Data model, houses`
- [ ] `C-DM-09` `constraint` `meridian` has no public surface on the served deployment. `src: Data model, houses`
- [ ] `C-DM-10` `data` `accounts` carries `id`, `email` unique, `password_hash`, `role`, `house_id`, `created_at`. `src: Data model, accounts`
- [ ] `C-DM-11` `data` An account's `role` is `producer` or `viewer`. `src: Data model, accounts`
- [ ] `C-DM-12` `data` A `viewer` account carries a null `house_id`. `src: Data model, accounts`
- [ ] `C-DM-13` `literal` Three accounts are seeded. `src: Data model, accounts`
- [ ] `C-DM-14` `data` `items` carries `id`, `house_id`, `kind`, `slug`, `title`, `position`, `discipline`, `variant`, `published`, `published_at`, `created_at`. `src: Data model, items`
- [ ] `C-DM-15` `data` An item's `kind` is `work` or `talent`. `src: Data model, items`
- [ ] `C-DM-16` `data` A talent's `discipline` is `director`, `photographer` or `stylist`. `src: Data model, items`
- [ ] `C-DM-17` `data` A work's `variant` is `left`, `right` or `centre`. `src: Data model, items`
- [ ] `C-DM-18` `data` A work carries a position, a variant, a talent carries a discipline. `src: Data model, items`
- [ ] `C-DM-19` `constraint` An item's `slug` is unique per `house_id` per `kind`. `src: Data model, items`
- [ ] `C-DM-20` `constraint` Slug uniqueness is decided after lowercasing, so `Rives`, `rives` are the same slug. `src: Data model, items`
- [ ] `C-DM-21` `constraint` A displayed ordinal is not stored. `src: Data model, items`
- [ ] `C-DM-22` `capability` A displayed ordinal is the record's place in the published set of its kind. `src: Data model, items`
- [ ] `C-DM-23` `data` `media` carries `id`, `item_id`, `role`, `position`, `seed`, `width`, `height`, `alt`, `created_at`. `src: Data model, media`
- [ ] `C-DM-24` `literal` A media `id` is a `32` character lowercase hex token minted at creation. `src: Data model, media`
- [ ] `C-DM-25` `constraint` A media id is unguessable, which is what protects the address. `src: Data model, media`
- [ ] `C-DM-26` `data` A media `role` is `poster`, `reel` or `gallery`. `src: Data model, media`
- [ ] `C-DM-27` `constraint` `alt` is required, must not be empty on a poster of a published record. `src: Data model, media`
- [ ] `C-DM-28` `data` `width`, `height` are the intrinsic size a container reserves before pixels arrive. `src: Data model, media`
- [ ] `C-DM-29` `data` `credits` carries `id`, `item_id`, `position`, `role`, `name`, `talent_item_id`. `src: Data model, credits`
- [ ] `C-DM-30` `data` `talent_item_id` is nullable because a credit may name someone the house does not represent. `src: Data model, credits`
- [ ] `C-DM-31` `constraint` A talent's selected work is read from `credits`, never stored on the talent. `src: Data model, credits`
- [ ] `C-DM-32` `data` `preview_tokens` carries `id`, `token` unique, `item_id`, `expires_at`, `created_by`, `created_at`. `src: Data model, preview tokens`
- [ ] `C-DM-33` `literal` A preview `token` is `32` characters of lowercase hex. `src: Data model, preview tokens`
- [ ] `C-DM-34` `constraint` A preview token is scoped to exactly one record, to that record's house. `src: Data model, preview tokens`
- [ ] `C-DM-35` `data` `slug_redirects` carries `id`, `house_id`, `kind`, `old_slug`, `item_id`, `created_at`. `src: Data model, slug redirects`
- [ ] `C-DM-36` `capability` A redirect row is written when a producer changes a slug deliberately. `src: Data model, slug redirects`
- [ ] `C-DM-37` `capability` A redirect row serves its address permanently. `src: Data model, slug redirects`
- [ ] `C-DM-38` `constraint` A redirect is unique per `house_id` per `kind` per `old_slug`. `src: Data model, slug redirects`
- [ ] `C-DM-39` `constraint` Slug uniqueness holds under concurrent requests rather than in application-level checks alone. `src: Data model, concurrency para`
- [ ] `C-DM-40` `constraint` Two simultaneous creates carrying the same slug do not both land. `src: Data model, concurrency para`
- [ ] `C-DM-41` `constraint` Exactly one of two simultaneous same-slug creates wins. `src: Data model, concurrency para`
- [ ] `C-DM-42` `constraint` The loser of a same-slug race is rejected with a reason, leaves no partial record. `src: Data model, concurrency para`
- [ ] `C-DM-43` `capability` A work's displayed ordinal is derived rather than stored. `src: Data model, derived para`
- [ ] `C-DM-44` `capability` The roster's discipline set is derived rather than stored. `src: Data model, derived para`
- [ ] `C-DM-45` `capability` A talent's selected work is derived rather than stored. `src: Data model, derived para`
- [ ] `C-DM-46` `capability` A work's neighbours are derived rather than stored. `src: Data model, derived para`
- [ ] `C-DM-47` `literal` `cirrus` seeds twelve published works. `src: Data model, seed data`
- [ ] `C-DM-48` `literal` `The Halo` is seeded at `the-halo` with the `left` variant. `src: Data model, seed data`
- [ ] `C-DM-49` `literal` `Sonder` is seeded at `sonder` with the `right` variant. `src: Data model, seed data`
- [ ] `C-DM-50` `literal` `BINARY` is seeded at `binary` with the `centre` variant. `src: Data model, seed data`
- [ ] `C-DM-51` `literal` `Common Ground` is seeded at `common-ground` with the `left` variant. `src: Data model, seed data`
- [ ] `C-DM-52` `literal` `NVE` is seeded at `nve` with the `right` variant. `src: Data model, seed data`
- [ ] `C-DM-53` `literal` `The Absolute Shelter` is seeded at `the-absolute-shelter` with the `centre` variant. `src: Data model, seed data`
- [ ] `C-DM-54` `literal` `MAISON DE LUMIERE` is seeded at `maison-de-lumiere` with the `left` variant. `src: Data model, seed data`
- [ ] `C-DM-55` `literal` `LORIS` is seeded at `loris` with the `right` variant. `src: Data model, seed data`
- [ ] `C-DM-56` `literal` `MDL Serie Extreme` is seeded at `mdl-serie-extreme` with the `centre` variant. `src: Data model, seed data`
- [ ] `C-DM-57` `literal` `AK` is seeded at `ak` with the `left` variant. `src: Data model, seed data`
- [ ] `C-DM-58` `literal` `Loris Shoot Studio` is seeded at `loris-shoot-studio` with the `right` variant. `src: Data model, seed data`
- [ ] `C-DM-59` `literal` `The Radiant` is seeded at `the-radiant` with the `centre` variant. `src: Data model, seed data`
- [ ] `C-DM-60` `literal` `The Quiet Room` is seeded unlisted at `the-quiet-room` with the `left` variant. `src: Data model, seed data`
- [ ] `C-DM-61` `literal` `The Quiet Room` carries one poster media row. `src: Data model, seed data`
- [ ] `C-DM-62` `literal` `Rives` is seeded published at `rives` as a `director`. `src: Data model, seed data`
- [ ] `C-DM-63` `literal` `Halcyon` is seeded published at `halcyon` as a `director`. `src: Data model, seed data`
- [ ] `C-DM-64` `literal` `Camille Ferrand` is seeded published at `camille-ferrand` as a `photographer`. `src: Data model, seed data`
- [ ] `C-DM-65` `literal` `Noor Vasquez` is seeded unlisted at `noor-vasquez` as a `stylist`. `src: Data model, seed data`
- [ ] `C-DM-66` `literal` `Noor Vasquez` carries one poster media row. `src: Data model, seed data`
- [ ] `C-DM-67` `literal` `Rives` is credited as Director on `The Halo`. `src: Data model, seed data`
- [ ] `C-DM-68` `literal` `Halcyon` is credited as Director on `Sonder`. `src: Data model, seed data`
- [ ] `C-DM-69` `literal` `Camille Ferrand` is credited as Photographer on `LORIS`. `src: Data model, seed data`
- [ ] `C-DM-70` `literal` `meridian` seeds one published talent, `Sable Ito` at `sable-ito`, a `director`. `src: Data model, seed data`
- [ ] `C-DM-71` `literal` `meridian` seeds one published work, `Foundry` at `foundry`, the `left` variant. `src: Data model, seed data`
- [ ] `C-DM-72` `constraint` Every published work carries a poster, a reel. `src: Data model, seed data`
- [ ] `C-DM-73` `constraint` Every published talent carries a portrait poster. `src: Data model, seed data`
- [ ] `C-DM-74` `constraint` Seeding is idempotent, restarting the app does not duplicate rows. `src: Data model, seeding para`

## C-FE Front-end specification

- [ ] `C-FE-01` `literal` `--color-dark` is `#060403`. `src: Front-end specification, two-colour model`
- [ ] `C-FE-02` `literal` `--color-light` is `#e9eae4`. `src: Front-end specification, two-colour model`
- [ ] `C-FE-03` `ui` `#060403` is the ground of the entry route. `src: Front-end specification, two-colour model`
- [ ] `C-FE-04` `ui` The dark token is the ink for every piece of text on the pale ground. `src: Front-end specification, two-colour model`
- [ ] `C-FE-05` `ui` `#e9eae4` is the ground of every route except the entry. `src: Front-end specification, two-colour model`
- [ ] `C-FE-06` `constraint` The palette is not built in `#000000`, `#ffffff`. `src: Front-end specification, two-colour model`
- [ ] `C-FE-07` `ui` `#060403` is a near-black warmed toward red. `src: Front-end specification, two-colour model`
- [ ] `C-FE-08` `ui` `#e9eae4` is an off-white warmed toward green. `src: Front-end specification, two-colour model`
- [ ] `C-FE-09` `literal` `#313236` belongs to the footer overlay gradient, nowhere else. `src: Front-end specification, supporting values`
- [ ] `C-FE-10` `literal` `#dedede` is a gradient stop the still generator draws from, never a text colour. `src: Front-end specification, supporting values`
- [ ] `C-FE-11` `literal` `#676767` is a gradient stop the still generator draws from, never a text colour. `src: Front-end specification, supporting values`
- [ ] `C-FE-12` `literal` `#333333` is a gradient stop the still generator draws from, never a text colour. `src: Front-end specification, supporting values`
- [ ] `C-FE-13` `literal` `#455e53` is a generator input for the seeded stills only. `src: Front-end specification, supporting values`
- [ ] `C-FE-14` `constraint` `#455e53` never carries text, never appears as a fill on chrome. `src: Front-end specification, supporting values`
- [ ] `C-FE-15` `constraint` No colour outside the two palette tables reaches a visitor. `src: Front-end specification, supporting values`
- [ ] `C-FE-16` `constraint` `#020420` must not ship. `src: Front-end specification, declared colours that must not ship`
- [ ] `C-FE-17` `constraint` `#64748b` must not ship. `src: Front-end specification, declared colours that must not ship`
- [ ] `C-FE-18` `constraint` `#00dc82` must not ship. `src: Front-end specification, declared colours that must not ship`
- [ ] `C-FE-19` `constraint` `#ffffff` must not ship as a framework error colour. `src: Front-end specification, declared colours that must not ship`
- [ ] `C-FE-20` `constraint` No `prefers-color-scheme` stylesheet ships with the build. `src: Front-end specification, declared colours that must not ship`
- [ ] `C-FE-21` `constraint` A rendering layer's clear colour is the route's own ground, never `#111111`. `src: Front-end specification, declared colours that must not ship`
- [ ] `C-FE-22` `ui` The display face is a serif with a `100 900` boldness axis loaded with `swap`. `src: Front-end specification, type`
- [ ] `C-FE-23` `ui` The interface face is a grotesque with a `100 900` boldness axis loaded with `swap`. `src: Front-end specification, type`
- [ ] `C-FE-24` `literal` The display fallback stack is `"Cirrus Display", "Times New Roman", Times, serif`. `src: Front-end specification, type`
- [ ] `C-FE-25` `literal` The interface fallback stack is `"Cirrus Text", "Helvetica Neue", Helvetica, Arial, sans-serif`. `src: Front-end specification, type`
- [ ] `C-FE-26` `constraint` The display fallback is a serif, the interface fallback is not. `src: Front-end specification, type`
- [ ] `C-FE-27` `literal` `--fontM` is `24px`. `src: Front-end specification, type`
- [ ] `C-FE-28` `literal` `--fontS` is `12px`. `src: Front-end specification, type`
- [ ] `C-FE-29` `literal` `--fontXS` is `10px`. `src: Front-end specification, type`
- [ ] `C-FE-30` `literal` `--fontXXS` is `8px`. `src: Front-end specification, type`
- [ ] `C-FE-31` `literal` The interface default is `12px / 500 / 14.4px`. `src: Front-end specification, type`
- [ ] `C-FE-32` `literal` The footer label is `10px / 400 / 19px`. `src: Front-end specification, type census`
- [ ] `C-FE-33` `literal` The about body is `18px / 300 / 21.6px`. `src: Front-end specification, type census`
- [ ] `C-FE-34` `literal` The lockup's large words are `58px / 400 / 40.6px`. `src: Front-end specification, type census`
- [ ] `C-FE-35` `literal` Secondary display is `40px / 200`. `src: Front-end specification, type census`
- [ ] `C-FE-36` `literal` The about opening figure is `36px / 100 / 34.56px`. `src: Front-end specification, type census`
- [ ] `C-FE-37` `literal` The lockup's small words are `24.75px / 100 / 23.76px`. `src: Front-end specification, type census`
- [ ] `C-FE-38` `literal` The lockup's smallest words are `9.75px / 100 / 9.36px`. `src: Front-end specification, type census`
- [ ] `C-FE-39` `literal` A work index caption title is `24px / 300 / 25.2px`. `src: Front-end specification, type census`
- [ ] `C-FE-40` `literal` A numeral label is `19px / 500 / 17.1px`. `src: Front-end specification, type census`
- [ ] `C-FE-41` `literal` Mid display is `27px / 400 / 18.9px`. `src: Front-end specification, type census`
- [ ] `C-FE-42` `literal` The roster name is `125px / 300 / 137.5px`. `src: Front-end specification, type census`
- [ ] `C-FE-43` `literal` A work detail title is `56px / 300 / 61.6px`. `src: Front-end specification, type census`
- [ ] `C-FE-44` `literal` The tightened smallest label is `10px / 500 / 9px`. `src: Front-end specification, type census`
- [ ] `C-FE-45` `ui` Line height is a ratio of `1.2` in the interface face. `src: Front-end specification, type facts`
- [ ] `C-FE-46` `ui` Line height is a ratio of `1.1` in the display face at its larger steps. `src: Front-end specification, type facts`
- [ ] `C-FE-47` `ui` The display face sets below `1` as size grows, `0.96` at `36px`, `24.75px`, `9.75px`. `src: Front-end specification, type facts`
- [ ] `C-FE-48` `ui` The lockup's `58px` step sets at a ratio of `0.7`. `src: Front-end specification, type facts`
- [ ] `C-FE-49` `ui` Boldness falls as size rises across the scale. `src: Front-end specification, type facts`
- [ ] `C-FE-50` `constraint` No size exists between `24px`, `36px`. `src: Front-end specification, type facts`
- [ ] `C-FE-51` `literal` Interface capitals are tracked `0.04em` at `12px`. `src: Front-end specification, type facts`
- [ ] `C-FE-52` `literal` Interface capitals are tracked `0.08em` at `10px`. `src: Front-end specification, type facts`
- [ ] `C-FE-53` `ui` Every interface-face string renders in capitals. `src: Front-end specification, case`
- [ ] `C-FE-54` `ui` Every display-face string renders in capitals except the talent name, the caption titles. `src: Front-end specification, case`
- [ ] `C-FE-55` `ui` The talent name, the work index caption titles are title case. `src: Front-end specification, case`
- [ ] `C-FE-56` `ui` Every route is a fixed frame over a scrolling well. `src: Front-end specification, layout`
- [ ] `C-FE-57` `ui` The fixed frame carries the wordmark, the navigation, the centre mark, the corner credit, the cursor pair. `src: Front-end specification, layout`
- [ ] `C-FE-58` `constraint` The frame is pinned to the window, not to the document. `src: Front-end specification, layout`
- [ ] `C-FE-59` `literal` The cursor pair sits at depth `50`. `src: Front-end specification, depth`
- [ ] `C-FE-60` `literal` The loading veil, the route transition veil sit at depth `20`. `src: Front-end specification, depth`
- [ ] `C-FE-61` `literal` The navigation sits at depth `12`. `src: Front-end specification, depth`
- [ ] `C-FE-62` `literal` The wordmark, the corner credit sit at depth `11`. `src: Front-end specification, depth`
- [ ] `C-FE-63` `literal` The fixed frame generally sits at depth `10`. `src: Front-end specification, depth`
- [ ] `C-FE-64` `literal` The footer, its overlay sit at depth `9`. `src: Front-end specification, depth`
- [ ] `C-FE-65` `literal` The centre mark sits at depth `8`. `src: Front-end specification, depth`
- [ ] `C-FE-66` `ui` Route content sits between depth `5`, depth `0` in document order. `src: Front-end specification, depth`
- [ ] `C-FE-67` `constraint` Depth `50` keeps the cursor above the transition veil. `src: Front-end specification, depth`
- [ ] `C-FE-68` `constraint` Depth `8` puts the centre mark below the frame, above content. `src: Front-end specification, depth`
- [ ] `C-FE-69` `literal` The wordmark, both halves of the cursor pair are composited with `mix-blend-mode: difference`. `src: Front-end specification, blend layer`
- [ ] `C-FE-70` `constraint` The wordmark is authored once in black, never in two versions. `src: Front-end specification, blend layer`
- [ ] `C-FE-71` `constraint` Exactly two elements on the site force a blend compositing layer. `src: Front-end specification, blend layer`
- [ ] `C-FE-72` `constraint` The product declares no custom properties beyond the two colour tokens, the four font tokens. `src: Front-end specification, blend layer`
- [ ] `C-FE-73` `constraint` Every mark is inline vector geometry in the markup. `src: Front-end specification, iconography`
- [ ] `C-FE-74` `constraint` There is no icon font, no sprite sheet, no image-based icon. `src: Front-end specification, iconography`
- [ ] `C-FE-75` `literal` The entry centre mark is `0 0 41 18` at `[700, 438, 41, 18]` with one path, an even-odd fill. `src: Front-end specification, iconography`
- [ ] `C-FE-76` `literal` The work index centre mark is `0 0 14 18` at `[713, 438, 14, 18]` with three paths. `src: Front-end specification, iconography`
- [ ] `C-FE-77` `literal` The roster centre mark is `0 0 18 18` at `[711, 438, 18, 18]` with one path. `src: Front-end specification, iconography`
- [ ] `C-FE-78` `literal` The about centre mark is `0 0 27 18` at `[707, 438, 27, 18]` with three paths. `src: Front-end specification, iconography`
- [ ] `C-FE-79` `ui` Every centre mark is filled with its own route's contrast token. `src: Front-end specification, iconography`
- [ ] `C-FE-80` `literal` Every centre mark is `18` units tall, sits at `y = 438` on a `1440 x 900` window. `src: Front-end specification, iconography`
- [ ] `C-FE-81` `literal` Every centre mark is optically centred on the midpoint at `720`. `src: Front-end specification, iconography`
- [ ] `C-FE-82` `literal` The about route's second mark is `0 0 27 22` at `[1105, 438, 29, 23]`. `src: Front-end specification, iconography`
- [ ] `C-FE-83` `constraint` The about route's second mark belongs to that route's opening block, leaving with the block on scroll. `src: Front-end specification, iconography`
- [ ] `C-FE-84` `literal` The corner credit is `0 0 60 16` at `[1331, 865, 60, 16]` with four paths. `src: Front-end specification, iconography`
- [ ] `C-FE-85` `literal` The credit's arrows are `0 0 7 7` at `[1409, 873, 8, 8]`, `[1401, 889, 8, 8]`. `src: Front-end specification, iconography`
- [ ] `C-FE-86` `ui` Only one of the credit's two arrows is visible at a time. `src: Front-end specification, iconography`
- [ ] `C-FE-87` `literal` On hover the credit's first arrow travels by `(8, -16)`, the second enters from below, left. `src: Front-end specification, iconography`
- [ ] `C-FE-88` `ui` The corner credit links out to the design studio's own site in a new context. `src: Front-end specification, iconography`
- [ ] `C-FE-89` `constraint` The credit is made visible on the entry route rather than reproducing its invisibility. `src: Front-end specification, iconography`
- [ ] `C-FE-90` `ui` The wordmark stands in as the house name set lowercase in the display face, blended. `src: Front-end specification, iconography`
- [ ] `C-FE-91` `ui` The entry centre mark stands in as a horizontal ellipse `41` by `18` stroked at `1.5` units. `src: Front-end specification, iconography`
- [ ] `C-FE-92` `ui` The work index mark stands in as three filled rectangles on the `0 0 14 18` geometry. `src: Front-end specification, iconography`
- [ ] `C-FE-93` `ui` The roster mark stands in as the circled letter. `src: Front-end specification, iconography`
- [ ] `C-FE-94` `ui` The about mark stands in as two overlapping circled letters `27` by `18` overall. `src: Front-end specification, iconography`
- [ ] `C-FE-95` `ui` The lockup's mark stands in as the circled letter at `26` by `21`. `src: Front-end specification, iconography`
- [ ] `C-FE-96` `constraint` A mark is centred by its own rendered width rather than by rounding. `src: Front-end specification, iconography`
- [ ] `C-FE-97` `literal` The counter recomputes a horizontal correction as its string widens, measured at `-14.5078px`. `src: Front-end specification, iconography`
- [ ] `C-FE-98` `ui` The wordmark sits top left, lowercase, in the display face, blended,, links to `/`. `src: Front-end specification, global chrome`
- [ ] `C-FE-99` `constraint` The wordmark suppresses the cursor square. `src: Front-end specification, global chrome`
- [ ] `C-FE-100` `literal` The navigation carries `WORKS` targeting `/works`. `src: Front-end specification, global chrome`
- [ ] `C-FE-101` `literal` The navigation carries `TALENTS` targeting `/talents`. `src: Front-end specification, global chrome`
- [ ] `C-FE-102` `literal` The navigation carries `CONTACT` opening a mail composition to the house address. `src: Front-end specification, global chrome`
- [ ] `C-FE-103` `literal` The navigation carries `ABOUT` targeting `/about`. `src: Front-end specification, global chrome`
- [ ] `C-FE-104` `ui` `WORKS` is centred in the window, the other three are grouped at the right. `src: Front-end specification, global chrome`
- [ ] `C-FE-105` `constraint` The navigation is not four evenly spaced items. `src: Front-end specification, global chrome`
- [ ] `C-FE-106` `constraint` `CONTACT` carries no active state, is never marked by the current route. `src: Front-end specification, global chrome`
- [ ] `C-FE-107` `constraint` `CONTACT` does not participate in the route transition. `src: Front-end specification, global chrome`
- [ ] `C-FE-108` `constraint` `CONTACT` is not built as a route. `src: Front-end specification, global chrome`
- [ ] `C-FE-109` `literal` Hover on any link moves `opacity` from `1` to `0.5` over `opacity 0.2s ease-out`. `src: Front-end specification, global chrome`
- [ ] `C-FE-110` `constraint` A link hover carries no underline, no colour change, no movement. `src: Front-end specification, global chrome`
- [ ] `C-FE-111` `ui` The cursor pair is a blended square plus a text label naming what the pointer is over. `src: Front-end specification, global chrome`
- [ ] `C-FE-112` `literal` The inactive cursor pair is parked at a translation of `(-999, -999)`. `src: Front-end specification, global chrome`
- [ ] `C-FE-113` `constraint` The inactive cursor pair is parked rather than hidden, so the pair stays composited. `src: Front-end specification, global chrome`
- [ ] `C-FE-114` `literal` The cursor pair becomes visible on an opacity transition of `300ms` on `ease`, once, filling backwards. `src: Front-end specification, global chrome`
- [ ] `C-FE-115` `literal` The cursor pair's resting opacity is `1`. `src: Front-end specification, global chrome`
- [ ] `C-FE-116` `literal` The cursor pair interpolates toward the pointer at about `0.08` per frame at 60 frames per second. `src: Front-end specification, global chrome`
- [ ] `C-FE-117` `constraint` The cursor lag is normalised against elapsed time. `src: Front-end specification, global chrome`
- [ ] `C-FE-118` `ui` Any element may carry an opt-out flag that suppresses the cursor square. `src: Front-end specification, global chrome`
- [ ] `C-FE-119` `literal` One directional variant offsets the cursor label `150px` above the pointer. `src: Front-end specification, global chrome`
- [ ] `C-FE-120` `constraint` The cursor pair is hidden entirely on a pointer-coarse device. `src: Front-end specification, global chrome`
- [ ] `C-FE-121` `literal` The footer's first column reads `9 PASSAGE BELLEVUE` over `PARIS` with `11` right-aligned. `src: Front-end specification, global chrome`
- [ ] `C-FE-122` `literal` The footer's second column reads `FOR PICTURE` over `AND ITS MAKERS`. `src: Front-end specification, global chrome`
- [ ] `C-FE-123` `literal` The footer's third column reads `WORK WITH US` over `PROD@EXAMPLE.COM`. `src: Front-end specification, global chrome`
- [ ] `C-FE-124` `literal` The footer's fourth column reads `INSTAGRAM` over `LINKEDIN`, right aligned. `src: Front-end specification, global chrome`
- [ ] `C-FE-125` `ui` The mail address is a link whose accessible name is the whole address. `src: Front-end specification, global chrome`
- [ ] `C-FE-126` `literal` The footer scrim is `linear-gradient(0deg, #313236 -1.82%, #31323684 43.56%, #eaebe500)`. `src: Front-end specification, global chrome`
- [ ] `C-FE-127` `literal` The footer scrim is scaled to `1.5`. `src: Front-end specification, global chrome`
- [ ] `C-FE-128` `constraint` The footer scrim never shows a hard edge at its top. `src: Front-end specification, global chrome`
- [ ] `C-FE-129` `ui` The tagline appears in the footer, the closing lockup, the document description. `src: Front-end specification, global chrome`
- [ ] `C-FE-130` `literal` The tagline's two lines run about `11`, `14` characters. `src: Front-end specification, global chrome`
- [ ] `C-FE-131` `ui` The counter well counts real load progress on the entry route. `src: Front-end specification, global chrome`
- [ ] `C-FE-132` `ui` The counter well counts position within the set on the roster below the breakpoint. `src: Front-end specification, global chrome`
- [ ] `C-FE-133` `ui` The counter well carries the preview route's waiting state. `src: Front-end specification, global chrome`
- [ ] `C-FE-134` `literal` The contact overlay's items are parked `200px` below their resting position. `src: Front-end specification, global chrome`
- [ ] `C-FE-135` `ui` The contact overlay's items rise as a stagger with a fade. `src: Front-end specification, global chrome`
- [ ] `C-FE-136` `ui` The contact overlay is a full-screen panel with an explicit close control. `src: Front-end specification, global chrome`
- [ ] `C-FE-137` `constraint` There are no keyframe animations on the site. `src: Front-end specification, motion`
- [ ] `C-FE-138` `ui` Motion is declared transitions, scrubbed properties, the cursor pair's two runtime transitions. `src: Front-end specification, motion`
- [ ] `C-FE-139` `constraint` Nothing loops, there is no ambient movement. `src: Front-end specification, motion`
- [ ] `C-FE-140` `literal` `opacity 0.2s ease-out` carries every navigation, link hover. `src: Front-end specification, motion`
- [ ] `C-FE-141` `literal` `opacity 0.4s` carries the route transition fades. `src: Front-end specification, motion`
- [ ] `C-FE-142` `literal` `transform 0.45s cubic-bezier(.83,.12,.35,.96)` carries positional moves. `src: Front-end specification, motion`
- [ ] `C-FE-143` `literal` `opacity 0.3s` carries secondary fades. `src: Front-end specification, motion`
- [ ] `C-FE-144` `literal` `filter 0.8s cubic-bezier(.2,.65,.47,.96)` carries the blur, the colour return. `src: Front-end specification, motion`
- [ ] `C-FE-145` `literal` `transform 0.8s cubic-bezier(.2,.65,.47,.96)` carries the long positional moves. `src: Front-end specification, motion`
- [ ] `C-FE-146` `literal` `opacity 0.1s` is the fastest fade on the site. `src: Front-end specification, motion`
- [ ] `C-FE-147` `constraint` There is no ninth declared transition. `src: Front-end specification, motion`
- [ ] `C-FE-148` `literal` `cubic-bezier(.2,.65,.47,.96)` is paired with the `0.8s` duration. `src: Front-end specification, motion`
- [ ] `C-FE-149` `literal` `cubic-bezier(.83,.12,.35,.96)` is paired with the `0.45s` duration. `src: Front-end specification, motion`
- [ ] `C-FE-150` `literal` The roster curve is `M0,0 C0.244,0.14 0.153,0.707 0.388,0.871 0.572,1 0.723,1 1,1`. `src: Front-end specification, motion`
- [ ] `C-FE-151` `ui` The roster curve is flat from `0.572` onward. `src: Front-end specification, motion`
- [ ] `C-FE-152` `constraint` A pointer response completes inside `0.45s`. `src: Front-end specification, motion`
- [ ] `C-FE-153` `constraint` A signature effect takes `0.8s`. `src: Front-end specification, motion`
- [ ] `C-FE-154` `constraint` There is no middle duration between the fast band, `0.8s`. `src: Front-end specification, motion`
- [ ] `C-FE-155` `ui` On navigation the frame, the counter, the footer, the outgoing content fade together. `src: Front-end specification, motion`
- [ ] `C-FE-156` `constraint` The route transition fade is not staggered. `src: Front-end specification, motion`
- [ ] `C-FE-157` `literal` Three elements were sampled mid-transition at the same opacity of `0.482`. `src: Front-end specification, motion`
- [ ] `C-FE-158` `ui` The incoming content mounts, the centre mark swaps before the frame fades back. `src: Front-end specification, motion`
- [ ] `C-FE-159` `constraint` The cursor pair does not participate in the route transition. `src: Front-end specification, motion`
- [ ] `C-FE-160` `ui` Navigation labels, footer labels, the mail address are addressable per character. `src: Front-end specification, motion`
- [ ] `C-FE-161` `literal` `WORKS` is five character elements, the mail address is fourteen. `src: Front-end specification, motion`
- [ ] `C-FE-162` `ui` Split labels play as a staggered per-character entrance with a per-index delay. `src: Front-end specification, motion`
- [ ] `C-FE-163` `constraint` The character split is invisible to assistive technology, to selection. `src: Front-end specification, motion`
- [ ] `C-FE-164` `constraint` There is no scale on hover. `src: Front-end specification, motion`
- [ ] `C-FE-165` `constraint` There is no shadow anywhere. `src: Front-end specification, motion`
- [ ] `C-FE-166` `constraint` There is no colour transition. `src: Front-end specification, motion`
- [ ] `C-FE-167` `constraint` There is no easing with overshoot. `src: Front-end specification, motion`
- [ ] `C-FE-168` `constraint` There is no page-load animation except the entry counter. `src: Front-end specification, motion`
- [ ] `C-FE-169` `constraint` A global `transition: all` is not reproduced. `src: Front-end specification, motion`
- [ ] `C-FE-170` `literal` `transition: all` was measured 2,650 times on the reference. `src: Front-end specification, motion`
- [ ] `C-FE-171` `constraint` The entry route does not scroll at any width. `src: Front-end specification, scroll`
- [ ] `C-FE-172` `ui` The roster does not scroll above the breakpoint. `src: Front-end specification, scroll`
- [ ] `C-FE-173` `literal` The roster scrolls to about `1,688px` below the breakpoint. `src: Front-end specification, scroll`
- [ ] `C-FE-174` `constraint` The preview route does not scroll. `src: Front-end specification, scroll`
- [ ] `C-FE-175` `literal` The work index scrolls to `7,330px` at `1440 x 900`. `src: Front-end specification, scroll`
- [ ] `C-FE-176` `literal` The about route scrolls to `2,953px` at `1440 x 900`. `src: Front-end specification, scroll`
- [ ] `C-FE-177` `literal` The about route scrolls to `2,785px` at `1024`. `src: Front-end specification, scroll`
- [ ] `C-FE-178` `literal` The about route scrolls to `2,451px` at `390`. `src: Front-end specification, scroll`
- [ ] `C-FE-179` `ui` Wheel, trackpad input is smoothed. `src: Front-end specification, scroll`
- [ ] `C-FE-180` `ui` Scroll position is available to the effect system as a continuous value. `src: Front-end specification, scroll`
- [ ] `C-FE-181` `ui` The root element carries a class, a scroll is in flight. `src: Front-end specification, scroll`
- [ ] `C-FE-182` `constraint` Keyboard scrolling, anchor navigation, find-in-page continue to work. `src: Front-end specification, scroll`
- [ ] `C-FE-183` `ui` A reduced-motion preference disables smoothing, returns native scroll. `src: Front-end specification, scroll`
- [ ] `C-FE-184` `constraint` One scroll source feeds every scrubbed property on the site. `src: Front-end specification, scroll`
- [ ] `C-FE-185` `ui` The footer travels up into place as the document approaches its end. `src: Front-end specification, scroll`
- [ ] `C-FE-186` `literal` The footer list closes `249.506px` from below its resting position. `src: Front-end specification, scroll`
- [ ] `C-FE-187` `ui` The footer arrival occupies roughly the last third of the scroll. `src: Front-end specification, scroll`
- [ ] `C-FE-188` `literal` A media container rests at `clip-path: inset(100% 0% 0%)`. `src: Front-end specification, scroll`
- [ ] `C-FE-189` `ui` A media reveal drives the top inset to `0%`, uncovering from the bottom edge upward. `src: Front-end specification, scroll`
- [ ] `C-FE-190` `literal` The revealing element carries a `-123px` horizontal offset. `src: Front-end specification, scroll`
- [ ] `C-FE-191` `capability` The media layer holds arbitrary quadrilaterals, each independently positioned, scaled, depth-ordered. `src: Front-end specification, media layer`
- [ ] `C-FE-192` `capability` The media layer plays a generated reel in place of a still without changing geometry. `src: Front-end specification, media layer`
- [ ] `C-FE-193` `capability` The media layer applies a per-quadrilateral desaturation drivable from `1` to `0` over `0.8s`. `src: Front-end specification, media layer`
- [ ] `C-FE-194` `capability` The media layer applies a per-quadrilateral wipe reveal. `src: Front-end specification, media layer`
- [ ] `C-FE-195` `capability` The media layer holds a steady frame rate with a dozen quadrilaterals on screen. `src: Front-end specification, media layer`
- [ ] `C-FE-196` `capability` The media layer degrades to plain composited images with the same layout, reveals, hover. `src: Front-end specification, media layer`
- [ ] `C-FE-197` `constraint` The measured layout is flat, no perspective value exists anywhere. `src: Front-end specification, media layer`
- [ ] `C-FE-198` `constraint` The site is fully usable with the rendering layer disabled. `src: Front-end specification, media layer`
- [ ] `C-FE-199` `ui` A reel plays muted, looping, without controls,, only, in view. `src: Front-end specification, media layer`
- [ ] `C-FE-200` `constraint` No reel is prepared until its still is within one window height of the viewport. `src: Front-end specification, media layer`
- [ ] `C-FE-201` `constraint` A reel more than one window height away is stopped, its buffer released. `src: Front-end specification, media layer`
- [ ] `C-FE-202` `constraint` Never more than two reels run at once. `src: Front-end specification, media layer`
- [ ] `C-FE-203` `constraint` The entry cluster runs zero reels, is stills only. `src: Front-end specification, media layer`
- [ ] `C-FE-204` `constraint` A reduced-motion preference, a save-data hint or a metered connection suppresses reels. `src: Front-end specification, media layer`
- [ ] `C-FE-205` `constraint` The still is visible before its reel is ready, is never replaced by a blank frame. `src: Front-end specification, media layer`
- [ ] `C-FE-206` `ui` The entry route counts a percentage up at the optical centre in the display face. `src: Front-end specification, routes, entry`
- [ ] `C-FE-207` `literal` The entry counter reaches `100%`. `src: Front-end specification, routes, entry`
- [ ] `C-FE-208` `ui` A veil covers the cluster, loading, fades out on `opacity 0.4s`. `src: Front-end specification, routes, entry`
- [ ] `C-FE-209` `constraint` The counter reports real progress against the fonts, the chrome, the cluster's stills. `src: Front-end specification, routes, entry`
- [ ] `C-FE-210` `constraint` The counter does not include reels. `src: Front-end specification, routes, entry`
- [ ] `C-FE-211` `ui` The cluster holds roughly twenty overlapping stills. `src: Front-end specification, routes, entry`
- [ ] `C-FE-212` `literal` Cluster stills run from about `150px` to about `330px` on the long edge. `src: Front-end specification, routes, entry`
- [ ] `C-FE-213` `ui` The cluster is dense toward the centre, thins toward the edges. `src: Front-end specification, routes, entry`
- [ ] `C-FE-214` `ui` The cluster leaves the four corners empty, the exact centre clear for the mark. `src: Front-end specification, routes, entry`
- [ ] `C-FE-215` `constraint` Cluster positions are authored, not random. `src: Front-end specification, routes, entry`
- [ ] `C-FE-216` `constraint` Cluster overlap order is stable across loads. `src: Front-end specification, routes, entry`
- [ ] `C-FE-217` `constraint` The entry route carries no headline, no tagline, no button, no scroll. `src: Front-end specification, routes, entry`
- [ ] `C-FE-218` `ui` Pointing at a cluster still fades the still to half, doing nothing else. `src: Front-end specification, routes, entry`
- [ ] `C-FE-219` `constraint` A cluster still does not lift, scale, brighten or gain a caption in place. `src: Front-end specification, routes, entry`
- [ ] `C-FE-220` `ui` A cluster still shows a visible caption on focus where the cursor label would sit. `src: Front-end specification, routes, entry`
- [ ] `C-FE-221` `literal` The work index opening line reads `Quiet decisions, made early, are the ones you notice last.` `src: Front-end specification, routes, index`
- [ ] `C-FE-222` `ui` The opening line sits with its baseline near the bottom of the first screen. `src: Front-end specification, routes, index`
- [ ] `C-FE-223` `ui` The opening line arrives out of focus, sharpens once on entry. `src: Front-end specification, routes, index`
- [ ] `C-FE-224` `constraint` The rest of the first screen stays empty pale ground. `src: Front-end specification, routes, index`
- [ ] `C-FE-225` `literal` The `left` entry variant is about `598px` wide flush left from `x = 40`. `src: Front-end specification, routes, index`
- [ ] `C-FE-226` `literal` The `right` entry variant is about `300px` wide flush right ending at `x = 1400`. `src: Front-end specification, routes, index`
- [ ] `C-FE-227` `literal` The `centre` entry variant is about `1006px` wide centred from `x = 219`. `src: Front-end specification, routes, index`
- [ ] `C-FE-228` `literal` The three variants carry aspect ratios of about `1.87`, `1.0`, `1.63`. `src: Front-end specification, routes, index`
- [ ] `C-FE-229` `ui` A variant is carried as data per entry rather than derived from the index. `src: Front-end specification, routes, index`
- [ ] `C-FE-230` `ui` A centred full-bleed entry breaks the left-right alternation. `src: Front-end specification, routes, index`
- [ ] `C-FE-231` `ui` The caption row spans the still's own width. `src: Front-end specification, routes, index`
- [ ] `C-FE-232` `literal` The caption row opens with a filled square of about `4px`, then `8px`, then the ordinal. `src: Front-end specification, routes, index`
- [ ] `C-FE-233` `ui` The caption title sits flush with the still's right edge. `src: Front-end specification, routes, index`
- [ ] `C-FE-234` `literal` The caption gap runs from about `240px` to about `940px` depending on the variant. `src: Front-end specification, routes, index`
- [ ] `C-FE-235` `ui` Every still rests fully desaturated, returns to full colour on hover over `0.8s`. `src: Front-end specification, routes, index`
- [ ] `C-FE-236` `literal` The desaturation endpoints are `1`, `0`. `src: Front-end specification, routes, index`
- [ ] `C-FE-237` `literal` Stills are scaled to `1.015` inside their clip. `src: Front-end specification, routes, index`
- [ ] `C-FE-238` `constraint` The `1.015` scale is not animated. `src: Front-end specification, routes, index`
- [ ] `C-FE-239` `constraint` The work index has no filter controls, sort, categories, tags, years or clients. `src: Front-end specification, routes, index`
- [ ] `C-FE-240` `constraint` The work index has no pagination, no load-more, no search. `src: Front-end specification, routes, index`
- [ ] `C-FE-241` `ui` A work detail carries its title, ordinal, credits, reel, stills, neighbours. `src: Front-end specification, routes, work detail`
- [ ] `C-FE-242` `ui` A credit whose name matches a published talent links to that talent's route. `src: Front-end specification, routes, work detail`
- [ ] `C-FE-243` `ui` Next, previous are labelled with the neighbouring work's title in the display face. `src: Front-end specification, routes, work detail`
- [ ] `C-FE-244` `constraint` A work detail carries no breadcrumb, no back-to-index link. `src: Front-end specification, routes, work detail`
- [ ] `C-FE-245` `ui` One talent fills the roster window, the route does not scroll above the breakpoint. `src: Front-end specification, routes, roster`
- [ ] `C-FE-246` `literal` The roster name's baseline sits near `y = 250`. `src: Front-end specification, routes, roster`
- [ ] `C-FE-247` `literal` The roster discipline label sits centred at `y = 357`. `src: Front-end specification, routes, roster`
- [ ] `C-FE-248` `literal` The roster portrait is centred from `y = 567` at about `246px` wide. `src: Front-end specification, routes, roster`
- [ ] `C-FE-249` `ui` The roster portrait is revealed by the wipe. `src: Front-end specification, routes, roster`
- [ ] `C-FE-250` `constraint` A name that will not fit at `125px` reduces to fit rather than wrapping. `src: Front-end specification, routes, roster`
- [ ] `C-FE-251` `literal` The first filter control sits at `x = 54, y = 443`. `src: Front-end specification, routes, roster`
- [ ] `C-FE-252` `literal` The second filter control sits at `x = 54, y = 475`. `src: Front-end specification, routes, roster`
- [ ] `C-FE-253` `literal` The filter marker square is about `4px` at `x = 40`, level with the active control. `src: Front-end specification, routes, roster`
- [ ] `C-FE-254` `ui` The active discipline is at full strength, an inactive one rests at `0.5` opacity. `src: Front-end specification, routes, roster`
- [ ] `C-FE-255` `ui` Hover on an inactive discipline brightens rather than fades. `src: Front-end specification, routes, roster`
- [ ] `C-FE-256` `constraint` Selecting a discipline filters the set, does not navigate. `src: Front-end specification, routes, roster`
- [ ] `C-FE-257` `constraint` There is no all state, one discipline is always active. `src: Front-end specification, routes, roster`
- [ ] `C-FE-258` `ui` The first discipline is active on arrival. `src: Front-end specification, routes, roster`
- [ ] `C-FE-259` `ui` The set advances by wheel, trackpad or arrow key, one talent at a time. `src: Front-end specification, routes, roster`
- [ ] `C-FE-260` `ui` The name changes on the roster's own path curve. `src: Front-end specification, routes, roster`
- [ ] `C-FE-261` `ui` The current name is announced on change. `src: Front-end specification, routes, roster`
- [ ] `C-FE-262` `ui` A talent detail sets the name at the same `125px` as the roster. `src: Front-end specification, routes, talent detail`
- [ ] `C-FE-263` `ui` A talent's selected work reuses the index's entry, caption components, the colour return. `src: Front-end specification, routes, talent detail`
- [ ] `C-FE-264` `constraint` The mail address on a talent route is the house address, unchanged. `src: Front-end specification, routes, talent detail`
- [ ] `C-FE-265` `constraint` A talent route carries no talent email, no phone, no direct social links. `src: Front-end specification, routes, talent detail`
- [ ] `C-FE-266` `constraint` The about route carries no media at all. `src: Front-end specification, routes, about`
- [ ] `C-FE-267` `ui` The about opening figure is centred, symmetrical, with the house name seven times down the middle. `src: Front-end specification, routes, about`
- [ ] `C-FE-268` `literal` The about figure's four lines are the house's own four statements about itself. `src: Front-end specification, routes, about`
- [ ] `C-FE-269` `literal` The figure's four lines run about `22`, `29`, `28`, `22` characters. `src: Front-end specification, routes, about`
- [ ] `C-FE-270` `constraint` The figure's line order above the centre is reversed below the centre. `src: Front-end specification, routes, about`
- [ ] `C-FE-271` `literal` The about body's first paragraph is seven authored lines beginning `We build, we bend,`. `src: Front-end specification, routes, about`
- [ ] `C-FE-272` `constraint` The first paragraph's breaks are content, are not re-wrapped above the breakpoint. `src: Front-end specification, routes, about`
- [ ] `C-FE-273` `literal` The second paragraph is one line of about `160` characters beginning `Founded in Paris, working wider.` `src: Front-end specification, routes, about`
- [ ] `C-FE-274` `literal` The lockup sets `CIRRUS`, `PICTURE`, `MAKERS` at `58px`. `src: Front-end specification, routes, about`
- [ ] `C-FE-275` `literal` The lockup sets `PROD`, `FOR`, `AND` at `24.75px`. `src: Front-end specification, routes, about`
- [ ] `C-FE-276` `literal` The lockup sets `ITS` at `9.75px`. `src: Front-end specification, routes, about`
- [ ] `C-FE-277` `literal` The lockup's three sizes step at a ratio of roughly `2.34`. `src: Front-end specification, routes, about`
- [ ] `C-FE-278` `constraint` The lockup's small words nest into the large ones' negative space rather than sitting on their own line. `src: Front-end specification, routes, about`
- [ ] `C-FE-279` `ui` The about text arrives blurred, sharpening as the block approaches the middle of the window. `src: Front-end specification, routes, about`
- [ ] `C-FE-280` `constraint` The blur drive is continuous, reversible, so scrolling back re-blurs. `src: Front-end specification, routes, about`
- [ ] `C-FE-281` `literal` The blur starts at about `10px` at the far end, `0` at the near end. `src: Front-end specification, routes, about`
- [ ] `C-FE-282` `ui` Full blur is a screen away, zero blur is at the window's centre. `src: Front-end specification, routes, about`
- [ ] `C-FE-283` `constraint` Below the breakpoint the about text arrives sharp, the blur is not scrubbed. `src: Front-end specification, routes, about`
- [ ] `C-FE-284` `ui` The preview route renders an unlisted record through the published route's own components. `src: Front-end specification, routes, preview`
- [ ] `C-FE-285` `constraint` The preview route renders nothing, reveals nothing without a producer session. `src: Front-end specification, routes, preview`
- [ ] `C-FE-286` `literal` The preview route carries a marker reading `PREVIEW - NOT PUBLISHED`. `src: Front-end specification, routes, preview`
- [ ] `C-FE-287` `literal` The preview waiting state reads `Loading preview...` in the display face at the optical centre. `src: Front-end specification, routes, preview`
- [ ] `C-FE-288` `ui` `/studio` opens on a command palette that filters the house's records by title, slug. `src: Front-end specification, routes, studio`
- [ ] `C-FE-289` `literal` The palette offers `New talent`, `New work`, `Reorder index`, `Preview`. `src: Front-end specification, routes, studio`
- [ ] `C-FE-290` `ui` Creating a record opens its own address rather than a layer over the palette. `src: Front-end specification, routes, studio`
- [ ] `C-FE-291` `ui` Publishing lands on a full-page confirmation naming the record, its public address. `src: Front-end specification, routes, studio`
- [ ] `C-FE-292` `ui` The studio record list is a compact card grid, one card per record. `src: Front-end specification, routes, studio`
- [ ] `C-FE-293` `literal` The not-found route reads `That page is not here.` in the display face at the optical centre. `src: Front-end specification, routes, not found`
- [ ] `C-FE-294` `constraint` The not-found route carries no search box, suggestion list, sitemap or illustration. `src: Front-end specification, routes, not found`
- [ ] `C-FE-295` `ui` The not-found route carries the full chrome, the entry route's centre mark. `src: Front-end specification, routes, not found`
- [ ] `C-FE-296` `contract` The persistent tree mounts once before the first route renders, survives every navigation. `src: Front-end specification, module and component architecture`
- [ ] `C-FE-297` `constraint` The persistent tree is not a child of the route outlet in any form. `src: Front-end specification, module and component architecture`
- [ ] `C-FE-298` `contract` The media tile is one component with a width variant rather than three components. `src: Front-end specification, module and component architecture`
- [ ] `C-FE-299` `contract` Six units are shared by more than one route, each is one module. `src: Front-end specification, module and component architecture`
- [ ] `C-FE-300` `contract` An opt-out class suppresses the cursor square rather than a list of exceptions in the cursor component. `src: Front-end specification, module and component architecture`
- [ ] `C-FE-301` `constraint` The site holds no visitor session, no preference, no persistence. `src: Front-end specification, module and component architecture`
- [ ] `C-FE-302` `literal` There is one real breakpoint, at `768px`. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-303` `literal` A viewport shorter than `500px` is treated as narrow whatever its width. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-304` `ui` Below the breakpoint the roster becomes a scroll-driven sequence, one talent per screenful. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-305` `ui` Below the breakpoint each roster block moves as the block enters, fading as the block leaves. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-306` `ui` Below the breakpoint the discipline label crossfades between entries. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-307` `ui` Below the breakpoint the roster name moves at a different rate from its block. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-308` `ui` Below the breakpoint the filter controls collapse into the counter row or are dropped. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-309` `ui` Below the breakpoint the wordmark, navigation retract on scroll, return. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-310` `constraint` The frame retraction is built as a threshold rather than a continuous scrub. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-311` `ui` Below the breakpoint the about paragraph's authored breaks are dropped. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-312` `ui` Below the breakpoint the about figure keeps its mirror, reduces in size. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-313` `ui` Below the breakpoint the lockup stacks to two sizes, abandons the nesting. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-314` `constraint` The roster's name, portrait are sized from the window's height, its width. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-315` `ui` Below the breakpoint the work index stills render in full colour. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-316` `ui` Below the breakpoint the entry cluster's stills carry visible captions. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-317` `ui` Below the breakpoint the credit's arrow is static. `src: Front-end specification, responsive behaviour`
- [ ] `C-FE-318` `ui` A split label's characters are hidden from assistive technology. `src: Front-end specification, accessibility`
- [ ] `C-FE-319` `constraint` The wordmark, the cursor label are never the only carrier of information. `src: Front-end specification, accessibility`
- [ ] `C-FE-320` `ui` The wordmark's destination is duplicated in the top bar. `src: Front-end specification, accessibility`
- [ ] `C-FE-321` `ui` A still's written alternative names its title, its ordinal at minimum. `src: Front-end specification, accessibility`
- [ ] `C-FE-322` `ui` A portrait's written alternative names its talent, their discipline. `src: Front-end specification, accessibility`
- [ ] `C-FE-323` `constraint` The centre mark is hidden from assistive technology with no accessible name. `src: Front-end specification, accessibility`
- [ ] `C-FE-324` `literal` The wordmark's accessible name is `Cirrus, home`. `src: Front-end specification, accessibility`
- [ ] `C-FE-325` `literal` The corner credit's accessible name is `Site by Aube, opens in a new tab`. `src: Front-end specification, accessibility`
- [ ] `C-FE-326` `literal` A skip link reading `Skip to content` is the first focusable element. `src: Front-end specification, accessibility`
- [ ] `C-FE-327` `ui` Every route has exactly one top-level heading. `src: Front-end specification, accessibility`
- [ ] `C-FE-328` `ui` The talent's name is the roster's top-level heading. `src: Front-end specification, accessibility`
- [ ] `C-FE-329` `constraint` Focus is visible on every interactive element, is not the hover opacity. `src: Front-end specification, accessibility`
- [ ] `C-FE-330` `ui` The focus outline is the dark token on pale grounds, the pale token on the dark ground, offset from the element. `src: Front-end specification, accessibility`
- [ ] `C-FE-331` `ui` Focus order follows visual order, the filter controls precede the talent. `src: Front-end specification, accessibility`
- [ ] `C-FE-332` `constraint` Focus is never trapped except inside an open contact overlay. `src: Front-end specification, accessibility`
- [ ] `C-FE-333` `ui` Escape closes the contact overlay, returning focus to the control that opened the overlay. `src: Front-end specification, accessibility`
- [ ] `C-FE-334` `ui` The discipline filter is real buttons in the tab order, operable by enter, space. `src: Front-end specification, accessibility`
- [ ] `C-FE-335` `ui` The filter's selected state is exposed rather than conveyed only by opacity, a square. `src: Front-end specification, accessibility`
- [ ] `C-FE-336` `ui` Under reduced motion the about blur resolves to sharp. `src: Front-end specification, accessibility`
- [ ] `C-FE-337` `ui` Under reduced motion the roster's entries appear in place with no wipe, no drift. `src: Front-end specification, accessibility`
- [ ] `C-FE-338` `literal` Under reduced motion the colour return still applies on hover over `0.01s`. `src: Front-end specification, accessibility`
- [ ] `C-FE-339` `ui` Under reduced motion reels do not play, the still remains with a play control. `src: Front-end specification, accessibility`
- [ ] `C-FE-340` `ui` Under reduced motion the cursor pair is hidden. `src: Front-end specification, accessibility`
- [ ] `C-FE-341` `ui` Under reduced motion route transitions cut rather than fade. `src: Front-end specification, accessibility`
- [ ] `C-FE-342` `literal` An inactive filter at `0.5` opacity must reach `4.5:1` against its ground. `src: Front-end specification, accessibility`
- [ ] `C-FE-343` `constraint` If the inactive filter fails contrast the resting opacity is raised rather than the colour changed. `src: Front-end specification, accessibility`
- [ ] `C-FE-344` `constraint` No supporting value carries a control label at any size. `src: Front-end specification, accessibility`
- [ ] `C-FE-345` `constraint` No supporting value is ever set on text. `src: Front-end specification, accessibility`
- [ ] `C-FE-346` `literal` Script per route is budgeted at `250KB` compressed. `src: Front-end specification, performance`
- [ ] `C-FE-347` `literal` Two variable font files are budgeted at `200KB` each. `src: Front-end specification, performance`
- [ ] `C-FE-348` `constraint` Both font files are preloaded, subset to Latin capitals, numerals. `src: Front-end specification, performance`
- [ ] `C-FE-349` `literal` The first still is visible under two seconds on a mid-range laptop. `src: Front-end specification, performance`
- [ ] `C-FE-350` `literal` The entry route is interactive under three seconds, counter included. `src: Front-end specification, performance`
- [ ] `C-FE-351` `constraint` No frames are dropped during any scrubbed effect. `src: Front-end specification, performance`
- [ ] `C-FE-352` `literal` Moving pictures were `74.6%` of every byte the reference transferred. `src: Front-end specification, performance`
- [ ] `C-FE-353` `literal` The reference transferred `120,872,010` of `162,123,713` bytes as video. `src: Front-end specification, performance`
- [ ] `C-FE-354` `constraint` The compositor is hinted only for what is currently animating. `src: Front-end specification, performance`
- [ ] `C-FE-355` `constraint` Nothing animates a property that triggers layout. `src: Front-end specification, performance`
- [ ] `C-FE-356` `constraint` Every animation is on `transform`, `opacity`, `filter` or `clip-path`. `src: Front-end specification, performance`
- [ ] `C-FE-357` `ui` The substituted display face is verified at `125px` at the `300` boldness setting. `src: Front-end specification, performance`
- [ ] `C-FE-358` `constraint` No binary ships with the build. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-359` `capability` A still is generated per media row from that row's stored `seed`. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-360` `constraint` The same record always produces the same still. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-361` `literal` A still fills with a linear gradient between two of `#313236`, `#676767`, `#333333`, `#455e53`, `#dedede`. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-362` `ui` A still overlays a second gradient at a different angle at low strength. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-363` `constraint` A still draws no text, no dimensions, no diagonal cross. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-364` `literal` Stills are generated at the widths `598`, `300`, `1006`. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-365` `capability` A reel is a generated looping motion field drawn each frame. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-366` `literal` A reel displaces its base field on a `12` second cycle. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-367` `ui` A reel varies brightness by a few percent on a second slower cycle. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-368` `ui` A reel draws the grain fresh each frame. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-369` `literal` The grain is a `300px` tile of fractal noise at a base frequency around `0.9` over four octaves. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-370` `constraint` The grain has all colour removed, is composited at very low strength. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-371` `constraint` The grain is one tile, repeated, rather than per-element noise. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-372` `literal` The share image is generated at `1200 x 630` on the `#060403` ground with the wordmark centred. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-373` `constraint` The share image carries no photograph. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-374` `constraint` Typefaces are named, not shipped. `src: Front-end specification, zero-asset substitution`
- [ ] `C-FE-375` `literal` The navigation copy is `WORKS`, `TALENTS`, `CONTACT`, `ABOUT`. `src: Front-end specification, copy and metadata`
- [ ] `C-FE-376` `literal` The roster filter copy is `DIRECTOR`, `PHOTOGRAPHER`,, `STYLIST` once a stylist is published. `src: Front-end specification, copy and metadata`
- [ ] `C-FE-377` `constraint` The filter labels, the discipline labels come from the same derived set. `src: Front-end specification, copy and metadata`
- [ ] `C-FE-378` `literal` The entry route's title is `Cirrus`. `src: Front-end specification, copy and metadata`
- [ ] `C-FE-379` `literal` The index's title is `Cirrus - Works`. `src: Front-end specification, copy and metadata`
- [ ] `C-FE-380` `literal` The roster's title is `Cirrus - Talents`. `src: Front-end specification, copy and metadata`
- [ ] `C-FE-381` `literal` The about route's title is `Cirrus - About`. `src: Front-end specification, copy and metadata`
- [ ] `C-FE-382` `literal` The description is `A production house for picture, its makers.` `src: Front-end specification, copy and metadata`
- [ ] `C-FE-383` `literal` `og:title` matches the title, `og:description` matches the description. `src: Front-end specification, copy and metadata`
- [ ] `C-FE-384` `literal` `og:image` names the generated share image. `src: Front-end specification, copy and metadata`
- [ ] `C-FE-385` `literal` `twitter:card` is `summary_large_image`. `src: Front-end specification, copy and metadata`
- [ ] `C-FE-386` `literal` The viewport is `width=device-width, initial-scale=1`. `src: Front-end specification, copy and metadata`
- [ ] `C-FE-387` `constraint` The preview route, the not-found route are not indexable. `src: Front-end specification, copy and metadata`
- [ ] `C-FE-388` `contract` Both detail routes are built as specified though never rendered on the reference. `src: Front-end specification, what is known and what is a reconstruction`
- [ ] `C-FE-389` `contract` The cursor lag, the blur endpoints, the letter-splitting motion are inferred, tuned. `src: Front-end specification, what is known and what is a reconstruction`
- [ ] `C-FE-390` `contract` The entry cluster is built still. `src: Front-end specification, what is known and what is a reconstruction`
- [ ] `C-FE-391` `ui` The post-processing pass is a very slight grain, vignette built at a barely visible intensity. `src: Front-end specification, what is known and what is a reconstruction`

## C-CN Constraints

- [ ] `C-CN-01` `constraint` Two houses live on one deployment, one of them is served publicly. `src: Constraints`
- [ ] `C-CN-02` `constraint` No visitor account is needed to read anything. `src: Constraints`
- [ ] `C-CN-03` `constraint` The app carries no comments. `src: Constraints`
- [ ] `C-CN-04` `constraint` The app carries no likes. `src: Constraints`
- [ ] `C-CN-05` `constraint` The app carries no shares. `src: Constraints`
- [ ] `C-CN-06` `constraint` The app carries no view counters. `src: Constraints`
- [ ] `C-CN-07` `constraint` The app carries no ratings. `src: Constraints`
- [ ] `C-CN-08` `constraint` The app carries no site search. `src: Constraints`
- [ ] `C-CN-09` `constraint` The app carries no contact form. `src: Constraints`
- [ ] `C-CN-10` `constraint` The app carries no cart, no prices, no payment. `src: Constraints`
- [ ] `C-CN-11` `constraint` The app carries no newsletter. `src: Constraints`
- [ ] `C-CN-12` `constraint` The work index carries no pagination, no load-more. `src: Constraints`
- [ ] `C-CN-13` `constraint` The app carries no infinite feed anywhere. `src: Constraints`
- [ ] `C-CN-14` `constraint` The app carries no chat widget. `src: Constraints`
- [ ] `C-CN-15` `constraint` The app carries no second analytics product. `src: Constraints`
- [ ] `C-CN-16` `constraint` Nothing is written to a visitor's machine except what analytics requires, consent permits. `src: Constraints`
- [ ] `C-CN-17` `constraint` No email is sent by the build. `src: Constraints`
- [ ] `C-CN-18` `constraint` There are no external network calls at runtime beyond the one named backing service. `src: Constraints`
- [ ] `C-CN-19` `constraint` There is no native app. `src: Constraints`
- [ ] `C-CN-20` `constraint` The four bundle addresses with nothing behind them are not built. `src: Constraints`
- [ ] `C-CN-21` `constraint` The app stays responsive with a few hundred records per house. `src: Constraints`
- [ ] `C-CN-22` `constraint` The app stays responsive with a few thousand media rows. `src: Constraints`

## C-DC Deployment contract

- [ ] `C-DC-01` `contract` The app must be reachable at `APP_PUBLIC_URL`. `src: Deployment contract bullet 1`
- [ ] `C-DC-02` `literal` The port mapping is `${APP_PUBLIC_PORT}:4173`. `src: Deployment contract bullet 1`
- [ ] `C-DC-03` `literal` `4173` is the container-internal port. `src: Deployment contract bullet 1`
- [ ] `C-DC-04` `constraint` Neither the port nor the URL is hardcoded. `src: Deployment contract bullet 1`
- [ ] `C-DC-05` `contract` The HTTP API is served on that same origin under the `/api` prefix. `src: Deployment contract bullet 2`
- [ ] `C-DC-06` `literal` `GET /api/health` returns `200` once the app is ready. `src: Deployment contract bullet 3`
- [ ] `C-DC-07` `contract` The app starts from the environment image with no manual steps. `src: Deployment contract bullet 4`
- [ ] `C-DC-08` `literal` Login credentials are written to `/app/USER_README.md`. `src: Deployment contract bullet 5`
- [ ] `C-DC-09` `literal` Reserved `.browser_screenshots/`, `.downloads/` directories exist at the app root, empty. `src: Deployment contract bullet 6`
- [ ] `C-DC-10` `contract` The app serves a production build behind a static or preview server, never a dev server. `src: Deployment contract bullet 7`
- [ ] `C-DC-11` `contract` The server keeps running after the session ends, is not a child of the shell. `src: Deployment contract bullet 8`
- [ ] `C-DC-12` `contract` The app binds `0.0.0.0`, never `127.0.0.1` or `localhost`. `src: Deployment contract bullet 9`
- [ ] `C-DC-13` `contract` The named backing service is already running, is not downloaded, installed, compiled or started. `src: Deployment contract bullet 10`
- [ ] `C-DC-14` `constraint` Only the providers named in the brief are used,, there are no edge functions. `src: Deployment contract bullet 11`
- [ ] `C-DC-15` `constraint` There are no persistent volumes, fixed container names or custom networks. `src: Deployment contract bullet 12`
- [ ] `C-DC-16` `literal` `POST /api/auth/signup` returns the new `viewer` account, a bearer token. `src: Deployment contract, API shapes table row 1`
- [ ] `C-DC-17` `literal` `POST /api/auth/login` returns a bearer token. `src: Deployment contract, API shapes table row 2`
- [ ] `C-DC-18` `literal` `GET /api/works` returns a top-level array of published works in ordinal order. `src: Deployment contract, API shapes table row 3`
- [ ] `C-DC-19` `literal` `GET /api/works/{slug}` returns one published work with its media, credits, neighbours. `src: Deployment contract, API shapes table row 4`
- [ ] `C-DC-20` `literal` `GET /api/talents` returns a top-level array of published talents, accepts a `discipline` query. `src: Deployment contract, API shapes table row 5`
- [ ] `C-DC-21` `literal` `GET /api/talents/{slug}` returns one published talent with its media, derived selected work. `src: Deployment contract, API shapes table row 6`
- [ ] `C-DC-22` `literal` `GET /api/disciplines` returns a top-level array of the derived discipline set. `src: Deployment contract, API shapes table row 7`
- [ ] `C-DC-23` `literal` `GET /api/media/{media_id}` returns the generated object for a published record. `src: Deployment contract, API shapes table row 8`
- [ ] `C-DC-24` `literal` `GET /api/preview/{token}` returns one unlisted record in full for its own house's producer. `src: Deployment contract, API shapes table row 9`
- [ ] `C-DC-25` `literal` `GET /api/studio/items` returns a top-level array of the caller's own house's records. `src: Deployment contract, API shapes table row 10`
- [ ] `C-DC-26` `literal` `GET /api/studio/items/{id}` returns one of the caller's own house's records. `src: Deployment contract, API shapes table row 11`
- [ ] `C-DC-27` `literal` `POST /api/studio/items` returns the created record, unlisted. `src: Deployment contract, API shapes table row 12`
- [ ] `C-DC-28` `literal` `PATCH /api/studio/items/{id}` returns the updated record. `src: Deployment contract, API shapes table row 13`
- [ ] `C-DC-29` `literal` `POST /api/studio/items/{id}/publish` returns the record with `published`, `published_at`. `src: Deployment contract, API shapes table row 14`
- [ ] `C-DC-30` `literal` `POST /api/studio/items/{id}/media` returns a `media_id` with its `role`, `width`, `height`. `src: Deployment contract, API shapes table row 15`
- [ ] `C-DC-31` `literal` `POST /api/studio/items/{id}/credits` returns the created credit. `src: Deployment contract, API shapes table row 16`
- [ ] `C-DC-32` `literal` `POST /api/studio/items/{id}/slug` returns the record at its new slug. `src: Deployment contract, API shapes table row 17`
- [ ] `C-DC-33` `literal` `POST /api/studio/works/order` returns the house's works in their new order. `src: Deployment contract, API shapes table row 18`
- [ ] `C-DC-34` `literal` `POST /api/studio/preview-tokens` returns a `token` with an `expires_at`. `src: Deployment contract, API shapes table row 19`
- [ ] `C-DC-35` `constraint` Bearer auth is required on every `/api/studio/` endpoint, on nothing else. `src: Deployment contract, API shapes closing para`
- [ ] `C-DC-36` `constraint` An invalid or unauthorized call is rejected as a client error, never a server error, never a silent success. `src: Deployment contract, API shapes closing para`
- [ ] `C-DC-37` `constraint` PostgreSQL is the only place a record actually lives. `src: Deployment contract, no mocks`
- [ ] `C-DC-38` `constraint` An in-memory dictionary standing in for a table is a contract violation. `src: Deployment contract, no mocks`
- [ ] `C-DC-39` `constraint` A JSON file on the app container's filesystem standing in for a table is a contract violation. `src: Deployment contract, no mocks`
- [ ] `C-DC-40` `constraint` A stubbed client that answers its own calls is a contract violation. `src: Deployment contract, no mocks`
- [ ] `C-DC-41` `constraint` The app's UI can only reflect what lives in PostgreSQL. `src: Deployment contract, no mocks`
- [ ] `C-DC-42` `capability` Two requests for the same media id return the same image. `src: Deployment contract, no mocks`

## Pinned literals

| Value | Why it matters | Item | Where |
|---|---|---|---|
| `producer@example.com` | The app seeds an account at producer@example.com owning cirrus | C-RL-27 | User roles closing para |
| `cirrus` | The app seeds an account at producer@example.com owning cirrus | C-RL-27 | User roles closing para |
| `producer.meridian@example.com` | The app seeds an account at producer.meridian@example.com owning meridian | C-RL-28 | User roles closing para |
| `meridian` | The app seeds an account at producer.meridian@example.com owning meridian | C-RL-28 | User roles closing para |
| `viewer@example.com` | The app seeds an account at viewer@example.com owning nothing | C-RL-29 | User roles closing para |
| `POST /api/auth/login` | POST /api/auth/login returns a bearer token | C-CF-03 | Core features, auth para |
| `Noor Vasquez` | The app seeds Noor Vasquez unlisted | C-CF-09 | Core features rule 1 |
| `The Quiet Room` | The app seeds The Quiet Room unlisted | C-CF-10 | Core features rule 1 |
| `GET /api/talents/noor-vasquez` | GET /api/talents/noor-vasquez is not found for a visitor | C-CF-15 | Core features rule 2 |
| `GET /api/talents/rives` | GET /api/talents/rives answers for a visitor | C-CF-16 | Core features rule 2 |
| `GET /api/media/{media_id}` | GET /api/media/{media_id} renders the object, its record is published | C-CF-29 | Core features rule 4 |
| `POST /api/studio/preview-tokens` | POST /api/studio/preview-tokens mints one token for one record | C-CF-31 | Core features rule 5 |
| `32` | A preview token is 32 characters of lowercase hex | C-CF-32 | Core features rule 5 |
| `15 minutes` | A preview token is good for 15 minutes | C-CF-33 | Core features rule 5 |
| `GET /preview/{token}` | GET /preview/{token} renders the token's record through the published route's own components | C-CF-34 | Core features rule 5 |
| `001` | Ordinals are contiguous from 001 | C-CF-49 | Core features rule 8 |
| `011` | Unlisting the fifth of twelve works leaves eleven numbered 001 to 011 | C-CF-51 | Core features rule 8 |
| `POST /api/studio/items/{id}/slug` | POST /api/studio/items/{id}/slug leaves the old slug redirecting forever | C-CF-55 | Core features rule 9 |
| `stylist` | Publishing Noor Vasquez adds stylist to the discipline set | C-CF-58 | Core features rule 10 |
| `Camille Ferrand` | Unlisting Camille Ferrand drops photographer from the discipline set | C-CF-59 | Core features rule 10 |
| `photographer` | Unlisting Camille Ferrand drops photographer from the discipline set | C-CF-59 | Core features rule 10 |
| `/` | The app serves the entry cluster at / | C-UF-01 | User flow route table row 1 |
| `/works` | The app serves the numbered index at /works | C-UF-02 | User flow route table row 2 |
| `/works/` | The app serves the numbered index at /works/ | C-UF-03 | User flow route table row 2 |
| `/works/the-halo` | The app serves one film at /works/the-halo | C-UF-04 | User flow route table row 3 |
| `/talents` | The app serves the roster at /talents | C-UF-05 | User flow route table row 4 |
| `/talents/` | The app serves the roster at /talents/ | C-UF-06 | User flow route table row 4 |
| `/talents/rives` | The app serves one talent at /talents/rives | C-UF-07 | User flow route table row 5 |
| `/about` | The app serves the house's own page at /about | C-UF-08 | User flow route table row 6 |
| `/signup` | The app serves open signup at /signup | C-UF-09 | User flow route table row 7 |
| `/studio/login` | The app serves sign in at /studio/login | C-UF-10 | User flow route table row 8 |
| `/preview/{token}` | The app serves one unlisted record at /preview/{token} to a producer | C-UF-11 | User flow route table row 9 |
| `producer` | The app serves one unlisted record at /preview/{token} to a producer | C-UF-11 | User flow route table row 9 |
| `/studio` | The app serves the command palette at /studio to a producer | C-UF-12 | User flow route table row 10 |
| `/studio/talents/new` | The app serves creation at /studio/talents/new to a producer | C-UF-13 | User flow route table row 11 |
| `/studio/works/new` | The app serves creation at /studio/works/new to a producer | C-UF-14 | User flow route table row 11 |
| `/studio/items/{id}` | The app serves the editor at /studio/items/{id} to a producer | C-UF-15 | User flow route table row 12 |
| `/studio/items/{id}/published` | The app serves the confirmation at /studio/items/{id}/published to a producer | C-UF-16 | User flow route table row 13 |
| `GET /api/works` | GET /api/works returns 12 works in ordinal order | C-UF-27 | User flow, what each surface holds |
| `GET /api/talents` | GET /api/talents returns 3 talents | C-UF-28 | User flow, what each surface holds |
| `GET /api/disciplines` | GET /api/disciplines returns director then photographer | C-UF-29 | User flow, what each surface holds |
| `director` | GET /api/disciplines returns director then photographer | C-UF-29 | User flow, what each surface holds |
| `012` | The neighbour sequence wraps 012 to 001 | C-UF-31 | User flow, what each surface holds |
| `postgres` | postgres is the only backing service available to the app | C-TR-15 | Technical requirements para 2 |
| `DATABASE_URL` | The app reads DATABASE_URL for PostgreSQL | C-TR-18 | Technical requirements para 3 |
| `APP_PUBLIC_URL` | The app reads APP_PUBLIC_URL for its own address | C-TR-19 | Technical requirements para 3 |
| `APP_PUBLIC_PORT` | The app reads APP_PUBLIC_PORT for its own port | C-TR-20 | Technical requirements para 3 |
| `GET /api/health` | GET /api/health returns 200 once the app is ready | C-TR-25 | Technical requirements para 5 |
| `200` | GET /api/health returns 200 once the app is ready | C-TR-25 | Technical requirements para 5 |
| `deku-demo-pw-2026` | Every seeded account uses the password deku-demo-pw-2026 | C-DM-03 | Data model, password para |
| `/app/USER_README.md` | The seeded password is written into /app/USER_README.md alongside each account | C-DM-05 | Data model, password para |
| `id` | A media id is a 32 character lowercase hex token minted at creation | C-DM-24 | Data model, media |
| `token` | A preview token is 32 characters of lowercase hex | C-DM-33 | Data model, preview tokens |
| `The Halo` | The Halo is seeded at the-halo with the left variant | C-DM-48 | Data model, seed data |
| `the-halo` | The Halo is seeded at the-halo with the left variant | C-DM-48 | Data model, seed data |
| `left` | The Halo is seeded at the-halo with the left variant | C-DM-48 | Data model, seed data |
| `Sonder` | Sonder is seeded at sonder with the right variant | C-DM-49 | Data model, seed data |
| `sonder` | Sonder is seeded at sonder with the right variant | C-DM-49 | Data model, seed data |
| `right` | Sonder is seeded at sonder with the right variant | C-DM-49 | Data model, seed data |
| `BINARY` | BINARY is seeded at binary with the centre variant | C-DM-50 | Data model, seed data |
| `binary` | BINARY is seeded at binary with the centre variant | C-DM-50 | Data model, seed data |
| `centre` | BINARY is seeded at binary with the centre variant | C-DM-50 | Data model, seed data |
| `Common Ground` | Common Ground is seeded at common-ground with the left variant | C-DM-51 | Data model, seed data |
| `common-ground` | Common Ground is seeded at common-ground with the left variant | C-DM-51 | Data model, seed data |
| `NVE` | NVE is seeded at nve with the right variant | C-DM-52 | Data model, seed data |
| `nve` | NVE is seeded at nve with the right variant | C-DM-52 | Data model, seed data |
| `The Absolute Shelter` | The Absolute Shelter is seeded at the-absolute-shelter with the centre variant | C-DM-53 | Data model, seed data |
| `the-absolute-shelter` | The Absolute Shelter is seeded at the-absolute-shelter with the centre variant | C-DM-53 | Data model, seed data |
| `MAISON DE LUMIERE` | MAISON DE LUMIERE is seeded at maison-de-lumiere with the left variant | C-DM-54 | Data model, seed data |
| `maison-de-lumiere` | MAISON DE LUMIERE is seeded at maison-de-lumiere with the left variant | C-DM-54 | Data model, seed data |
| `LORIS` | LORIS is seeded at loris with the right variant | C-DM-55 | Data model, seed data |
| `loris` | LORIS is seeded at loris with the right variant | C-DM-55 | Data model, seed data |
| `MDL Serie Extreme` | MDL Serie Extreme is seeded at mdl-serie-extreme with the centre variant | C-DM-56 | Data model, seed data |
| `mdl-serie-extreme` | MDL Serie Extreme is seeded at mdl-serie-extreme with the centre variant | C-DM-56 | Data model, seed data |
| `AK` | AK is seeded at ak with the left variant | C-DM-57 | Data model, seed data |
| `ak` | AK is seeded at ak with the left variant | C-DM-57 | Data model, seed data |
| `Loris Shoot Studio` | Loris Shoot Studio is seeded at loris-shoot-studio with the right variant | C-DM-58 | Data model, seed data |
| `loris-shoot-studio` | Loris Shoot Studio is seeded at loris-shoot-studio with the right variant | C-DM-58 | Data model, seed data |
| `The Radiant` | The Radiant is seeded at the-radiant with the centre variant | C-DM-59 | Data model, seed data |
| `the-radiant` | The Radiant is seeded at the-radiant with the centre variant | C-DM-59 | Data model, seed data |
| `the-quiet-room` | The Quiet Room is seeded unlisted at the-quiet-room with the left variant | C-DM-60 | Data model, seed data |
| `Rives` | Rives is seeded published at rives as a director | C-DM-62 | Data model, seed data |
| `rives` | Rives is seeded published at rives as a director | C-DM-62 | Data model, seed data |
| `Halcyon` | Halcyon is seeded published at halcyon as a director | C-DM-63 | Data model, seed data |
| `halcyon` | Halcyon is seeded published at halcyon as a director | C-DM-63 | Data model, seed data |
| `camille-ferrand` | Camille Ferrand is seeded published at camille-ferrand as a photographer | C-DM-64 | Data model, seed data |
| `noor-vasquez` | Noor Vasquez is seeded unlisted at noor-vasquez as a stylist | C-DM-65 | Data model, seed data |
| `Sable Ito` | meridian seeds one published talent, Sable Ito at sable-ito, a director | C-DM-70 | Data model, seed data |
| `sable-ito` | meridian seeds one published talent, Sable Ito at sable-ito, a director | C-DM-70 | Data model, seed data |
| `Foundry` | meridian seeds one published work, Foundry at foundry, the left variant | C-DM-71 | Data model, seed data |
| `foundry` | meridian seeds one published work, Foundry at foundry, the left variant | C-DM-71 | Data model, seed data |
| `--color-dark` | --color-dark is #060403 | C-FE-01 | Front-end specification, two-colour model |
| `#060403` | --color-dark is #060403 | C-FE-01 | Front-end specification, two-colour model |
| `--color-light` | --color-light is #e9eae4 | C-FE-02 | Front-end specification, two-colour model |
| `#e9eae4` | --color-light is #e9eae4 | C-FE-02 | Front-end specification, two-colour model |
| `#313236` | #313236 belongs to the footer overlay gradient, nowhere else | C-FE-09 | Front-end specification, supporting values |
| `#dedede` | #dedede is a gradient stop the still generator draws from, never a text colour | C-FE-10 | Front-end specification, supporting values |
| `#676767` | #676767 is a gradient stop the still generator draws from, never a text colour | C-FE-11 | Front-end specification, supporting values |
| `#333333` | #333333 is a gradient stop the still generator draws from, never a text colour | C-FE-12 | Front-end specification, supporting values |
| `#455e53` | #455e53 is a generator input for the seeded stills only | C-FE-13 | Front-end specification, supporting values |
| `"Cirrus Display", "Times New Roman", Times, serif` | The display fallback stack is "Cirrus Display", "Times New Roman", Times, serif | C-FE-24 | Front-end specification, type |
| `"Cirrus Text", "Helvetica Neue", Helvetica, Arial, sans-serif` | The interface fallback stack is "Cirrus Text", "Helvetica Neue", Helvetica, Arial, sans-serif | C-FE-25 | Front-end specification, type |
| `--fontM` | --fontM is 24px | C-FE-27 | Front-end specification, type |
| `24px` | --fontM is 24px | C-FE-27 | Front-end specification, type |
| `--fontS` | --fontS is 12px | C-FE-28 | Front-end specification, type |
| `12px` | --fontS is 12px | C-FE-28 | Front-end specification, type |
| `--fontXS` | --fontXS is 10px | C-FE-29 | Front-end specification, type |
| `10px` | --fontXS is 10px | C-FE-29 | Front-end specification, type |
| `--fontXXS` | --fontXXS is 8px | C-FE-30 | Front-end specification, type |
| `8px` | --fontXXS is 8px | C-FE-30 | Front-end specification, type |
| `12px / 500 / 14.4px` | The interface default is 12px / 500 / 14.4px | C-FE-31 | Front-end specification, type |
| `10px / 400 / 19px` | The footer label is 10px / 400 / 19px | C-FE-32 | Front-end specification, type census |
| `18px / 300 / 21.6px` | The about body is 18px / 300 / 21.6px | C-FE-33 | Front-end specification, type census |
| `58px / 400 / 40.6px` | The lockup's large words are 58px / 400 / 40.6px | C-FE-34 | Front-end specification, type census |
| `40px / 200` | Secondary display is 40px / 200 | C-FE-35 | Front-end specification, type census |
| `36px / 100 / 34.56px` | The about opening figure is 36px / 100 / 34.56px | C-FE-36 | Front-end specification, type census |
| `24.75px / 100 / 23.76px` | The lockup's small words are 24.75px / 100 / 23.76px | C-FE-37 | Front-end specification, type census |
| `9.75px / 100 / 9.36px` | The lockup's smallest words are 9.75px / 100 / 9.36px | C-FE-38 | Front-end specification, type census |
| `24px / 300 / 25.2px` | A work index caption title is 24px / 300 / 25.2px | C-FE-39 | Front-end specification, type census |
| `19px / 500 / 17.1px` | A numeral label is 19px / 500 / 17.1px | C-FE-40 | Front-end specification, type census |
| `27px / 400 / 18.9px` | Mid display is 27px / 400 / 18.9px | C-FE-41 | Front-end specification, type census |
| `125px / 300 / 137.5px` | The roster name is 125px / 300 / 137.5px | C-FE-42 | Front-end specification, type census |
| `56px / 300 / 61.6px` | A work detail title is 56px / 300 / 61.6px | C-FE-43 | Front-end specification, type census |
| `10px / 500 / 9px` | The tightened smallest label is 10px / 500 / 9px | C-FE-44 | Front-end specification, type census |
| `0.04em` | Interface capitals are tracked 0.04em at 12px | C-FE-51 | Front-end specification, type facts |
| `0.08em` | Interface capitals are tracked 0.08em at 10px | C-FE-52 | Front-end specification, type facts |
| `50` | The cursor pair sits at depth 50 | C-FE-59 | Front-end specification, depth |
| `20` | The loading veil, the route transition veil sit at depth 20 | C-FE-60 | Front-end specification, depth |
| `12` | The navigation sits at depth 12 | C-FE-61 | Front-end specification, depth |
| `11` | The wordmark, the corner credit sit at depth 11 | C-FE-62 | Front-end specification, depth |
| `10` | The fixed frame generally sits at depth 10 | C-FE-63 | Front-end specification, depth |
| `9` | The footer, its overlay sit at depth 9 | C-FE-64 | Front-end specification, depth |
| `8` | The centre mark sits at depth 8 | C-FE-65 | Front-end specification, depth |
| `mix-blend-mode: difference` | The wordmark, both halves of the cursor pair are composited with mix-blend-mode: difference | C-FE-69 | Front-end specification, blend layer |
| `0 0 41 18` | The entry centre mark is 0 0 41 18 at [700, 438, 41, 18] with one path, an even-odd fill | C-FE-75 | Front-end specification, iconography |
| `[700, 438, 41, 18]` | The entry centre mark is 0 0 41 18 at [700, 438, 41, 18] with one path, an even-odd fill | C-FE-75 | Front-end specification, iconography |
| `0 0 14 18` | The work index centre mark is 0 0 14 18 at [713, 438, 14, 18] with three paths | C-FE-76 | Front-end specification, iconography |
| `[713, 438, 14, 18]` | The work index centre mark is 0 0 14 18 at [713, 438, 14, 18] with three paths | C-FE-76 | Front-end specification, iconography |
| `0 0 18 18` | The roster centre mark is 0 0 18 18 at [711, 438, 18, 18] with one path | C-FE-77 | Front-end specification, iconography |
| `[711, 438, 18, 18]` | The roster centre mark is 0 0 18 18 at [711, 438, 18, 18] with one path | C-FE-77 | Front-end specification, iconography |
| `0 0 27 18` | The about centre mark is 0 0 27 18 at [707, 438, 27, 18] with three paths | C-FE-78 | Front-end specification, iconography |
| `[707, 438, 27, 18]` | The about centre mark is 0 0 27 18 at [707, 438, 27, 18] with three paths | C-FE-78 | Front-end specification, iconography |
| `18` | Every centre mark is 18 units tall, sits at y = 438 on a 1440 x 900 window | C-FE-80 | Front-end specification, iconography |
| `y = 438` | Every centre mark is 18 units tall, sits at y = 438 on a 1440 x 900 window | C-FE-80 | Front-end specification, iconography |
| `1440 x 900` | Every centre mark is 18 units tall, sits at y = 438 on a 1440 x 900 window | C-FE-80 | Front-end specification, iconography |
| `720` | Every centre mark is optically centred on the midpoint at 720 | C-FE-81 | Front-end specification, iconography |
| `0 0 27 22` | The about route's second mark is 0 0 27 22 at [1105, 438, 29, 23] | C-FE-82 | Front-end specification, iconography |
| `[1105, 438, 29, 23]` | The about route's second mark is 0 0 27 22 at [1105, 438, 29, 23] | C-FE-82 | Front-end specification, iconography |
| `0 0 60 16` | The corner credit is 0 0 60 16 at [1331, 865, 60, 16] with four paths | C-FE-84 | Front-end specification, iconography |
| `[1331, 865, 60, 16]` | The corner credit is 0 0 60 16 at [1331, 865, 60, 16] with four paths | C-FE-84 | Front-end specification, iconography |
| `0 0 7 7` | The credit's arrows are 0 0 7 7 at [1409, 873, 8, 8], [1401, 889, 8, 8] | C-FE-85 | Front-end specification, iconography |
| `[1409, 873, 8, 8]` | The credit's arrows are 0 0 7 7 at [1409, 873, 8, 8], [1401, 889, 8, 8] | C-FE-85 | Front-end specification, iconography |
| `[1401, 889, 8, 8]` | The credit's arrows are 0 0 7 7 at [1409, 873, 8, 8], [1401, 889, 8, 8] | C-FE-85 | Front-end specification, iconography |
| `(8, -16)` | On hover the credit's first arrow travels by (8, -16), the second enters from below, left | C-FE-87 | Front-end specification, iconography |
| `-14.5078px` | The counter recomputes a horizontal correction as its string widens, measured at -14.5078px | C-FE-97 | Front-end specification, iconography |
| `WORKS` | The navigation carries WORKS targeting /works | C-FE-100 | Front-end specification, global chrome |
| `TALENTS` | The navigation carries TALENTS targeting /talents | C-FE-101 | Front-end specification, global chrome |
| `CONTACT` | The navigation carries CONTACT opening a mail composition to the house address | C-FE-102 | Front-end specification, global chrome |
| `ABOUT` | The navigation carries ABOUT targeting /about | C-FE-103 | Front-end specification, global chrome |
| `opacity` | Hover on any link moves opacity from 1 to 0.5 over opacity 0.2s ease-out | C-FE-109 | Front-end specification, global chrome |
| `1` | Hover on any link moves opacity from 1 to 0.5 over opacity 0.2s ease-out | C-FE-109 | Front-end specification, global chrome |
| `0.5` | Hover on any link moves opacity from 1 to 0.5 over opacity 0.2s ease-out | C-FE-109 | Front-end specification, global chrome |
| `opacity 0.2s ease-out` | Hover on any link moves opacity from 1 to 0.5 over opacity 0.2s ease-out | C-FE-109 | Front-end specification, global chrome |
| `(-999, -999)` | The inactive cursor pair is parked at a translation of (-999, -999) | C-FE-112 | Front-end specification, global chrome |
| `300ms` | The cursor pair becomes visible on an opacity transition of 300ms on ease, once, filling backwards | C-FE-114 | Front-end specification, global chrome |
| `ease` | The cursor pair becomes visible on an opacity transition of 300ms on ease, once, filling backwards | C-FE-114 | Front-end specification, global chrome |
| `0.08` | The cursor pair interpolates toward the pointer at about 0.08 per frame at 60 frames per second | C-FE-116 | Front-end specification, global chrome |
| `150px` | One directional variant offsets the cursor label 150px above the pointer | C-FE-119 | Front-end specification, global chrome |
| `9 PASSAGE BELLEVUE` | The footer's first column reads 9 PASSAGE BELLEVUE over PARIS with 11 right-aligned | C-FE-121 | Front-end specification, global chrome |
| `PARIS` | The footer's first column reads 9 PASSAGE BELLEVUE over PARIS with 11 right-aligned | C-FE-121 | Front-end specification, global chrome |
| `FOR PICTURE` | The footer's second column reads FOR PICTURE over AND ITS MAKERS | C-FE-122 | Front-end specification, global chrome |
| `AND ITS MAKERS` | The footer's second column reads FOR PICTURE over AND ITS MAKERS | C-FE-122 | Front-end specification, global chrome |
| `WORK WITH US` | The footer's third column reads WORK WITH US over PROD@EXAMPLE.COM | C-FE-123 | Front-end specification, global chrome |
| `PROD@EXAMPLE.COM` | The footer's third column reads WORK WITH US over PROD@EXAMPLE.COM | C-FE-123 | Front-end specification, global chrome |
| `INSTAGRAM` | The footer's fourth column reads INSTAGRAM over LINKEDIN, right aligned | C-FE-124 | Front-end specification, global chrome |
| `LINKEDIN` | The footer's fourth column reads INSTAGRAM over LINKEDIN, right aligned | C-FE-124 | Front-end specification, global chrome |
| `linear-gradient(0deg, #313236 -1.82%, #31323684 43.56%, #eaebe500)` | The footer scrim is linear-gradient(0deg, #313236 -1.82%, #31323684 43.56%, #eaebe500) | C-FE-126 | Front-end specification, global chrome |
| `1.5` | The footer scrim is scaled to 1.5 | C-FE-127 | Front-end specification, global chrome |
| `14` | The tagline's two lines run about 11, 14 characters | C-FE-130 | Front-end specification, global chrome |
| `200px` | The contact overlay's items are parked 200px below their resting position | C-FE-134 | Front-end specification, global chrome |
| `opacity 0.4s` | opacity 0.4s carries the route transition fades | C-FE-141 | Front-end specification, motion |
| `transform 0.45s cubic-bezier(.83,.12,.35,.96)` | transform 0.45s cubic-bezier(.83,.12,.35,.96) carries positional moves | C-FE-142 | Front-end specification, motion |
| `opacity 0.3s` | opacity 0.3s carries secondary fades | C-FE-143 | Front-end specification, motion |
| `filter 0.8s cubic-bezier(.2,.65,.47,.96)` | filter 0.8s cubic-bezier(.2,.65,.47,.96) carries the blur, the colour return | C-FE-144 | Front-end specification, motion |
| `transform 0.8s cubic-bezier(.2,.65,.47,.96)` | transform 0.8s cubic-bezier(.2,.65,.47,.96) carries the long positional moves | C-FE-145 | Front-end specification, motion |
| `opacity 0.1s` | opacity 0.1s is the fastest fade on the site | C-FE-146 | Front-end specification, motion |
| `cubic-bezier(.2,.65,.47,.96)` | cubic-bezier(.2,.65,.47,.96) is paired with the 0.8s duration | C-FE-148 | Front-end specification, motion |
| `0.8s` | cubic-bezier(.2,.65,.47,.96) is paired with the 0.8s duration | C-FE-148 | Front-end specification, motion |
| `cubic-bezier(.83,.12,.35,.96)` | cubic-bezier(.83,.12,.35,.96) is paired with the 0.45s duration | C-FE-149 | Front-end specification, motion |
| `0.45s` | cubic-bezier(.83,.12,.35,.96) is paired with the 0.45s duration | C-FE-149 | Front-end specification, motion |
| `M0,0 C0.244,0.14 0.153,0.707 0.388,0.871 0.572,1 0.723,1 1,1` | The roster curve is M0,0 C0.244,0.14 0.153,0.707 0.388,0.871 0.572,1 0.723,1 1,1 | C-FE-150 | Front-end specification, motion |
| `0.482` | Three elements were sampled mid-transition at the same opacity of 0.482 | C-FE-157 | Front-end specification, motion |
| `transition: all` | transition: all was measured 2,650 times on the reference | C-FE-170 | Front-end specification, motion |
| `1,688px` | The roster scrolls to about 1,688px below the breakpoint | C-FE-173 | Front-end specification, scroll |
| `7,330px` | The work index scrolls to 7,330px at 1440 x 900 | C-FE-175 | Front-end specification, scroll |
| `2,953px` | The about route scrolls to 2,953px at 1440 x 900 | C-FE-176 | Front-end specification, scroll |
| `2,785px` | The about route scrolls to 2,785px at 1024 | C-FE-177 | Front-end specification, scroll |
| `1024` | The about route scrolls to 2,785px at 1024 | C-FE-177 | Front-end specification, scroll |
| `2,451px` | The about route scrolls to 2,451px at 390 | C-FE-178 | Front-end specification, scroll |
| `390` | The about route scrolls to 2,451px at 390 | C-FE-178 | Front-end specification, scroll |
| `249.506px` | The footer list closes 249.506px from below its resting position | C-FE-186 | Front-end specification, scroll |
| `clip-path: inset(100% 0% 0%)` | A media container rests at clip-path: inset(100% 0% 0%) | C-FE-188 | Front-end specification, scroll |
| `-123px` | The revealing element carries a -123px horizontal offset | C-FE-190 | Front-end specification, scroll |
| `100%` | The entry counter reaches 100% | C-FE-207 | Front-end specification, routes, entry |
| `330px` | Cluster stills run from about 150px to about 330px on the long edge | C-FE-212 | Front-end specification, routes, entry |
| `Quiet decisions, made early, are the ones you notice last.` | The work index opening line reads Quiet decisions, made early, are the ones you notice last | C-FE-221 | Front-end specification, routes, index |
| `598px` | The left entry variant is about 598px wide flush left from x = 40 | C-FE-225 | Front-end specification, routes, index |
| `x = 40` | The left entry variant is about 598px wide flush left from x = 40 | C-FE-225 | Front-end specification, routes, index |
| `300px` | The right entry variant is about 300px wide flush right ending at x = 1400 | C-FE-226 | Front-end specification, routes, index |
| `x = 1400` | The right entry variant is about 300px wide flush right ending at x = 1400 | C-FE-226 | Front-end specification, routes, index |
| `1006px` | The centre entry variant is about 1006px wide centred from x = 219 | C-FE-227 | Front-end specification, routes, index |
| `x = 219` | The centre entry variant is about 1006px wide centred from x = 219 | C-FE-227 | Front-end specification, routes, index |
| `1.87` | The three variants carry aspect ratios of about 1.87, 1.0, 1.63 | C-FE-228 | Front-end specification, routes, index |
| `1.0` | The three variants carry aspect ratios of about 1.87, 1.0, 1.63 | C-FE-228 | Front-end specification, routes, index |
| `1.63` | The three variants carry aspect ratios of about 1.87, 1.0, 1.63 | C-FE-228 | Front-end specification, routes, index |
| `4px` | The caption row opens with a filled square of about 4px, then 8px, then the ordinal | C-FE-232 | Front-end specification, routes, index |
| `240px` | The caption gap runs from about 240px to about 940px depending on the variant | C-FE-234 | Front-end specification, routes, index |
| `940px` | The caption gap runs from about 240px to about 940px depending on the variant | C-FE-234 | Front-end specification, routes, index |
| `0` | The desaturation endpoints are 1, 0 | C-FE-236 | Front-end specification, routes, index |
| `1.015` | Stills are scaled to 1.015 inside their clip | C-FE-237 | Front-end specification, routes, index |
| `y = 250` | The roster name's baseline sits near y = 250 | C-FE-246 | Front-end specification, routes, roster |
| `y = 357` | The roster discipline label sits centred at y = 357 | C-FE-247 | Front-end specification, routes, roster |
| `y = 567` | The roster portrait is centred from y = 567 at about 246px wide | C-FE-248 | Front-end specification, routes, roster |
| `246px` | The roster portrait is centred from y = 567 at about 246px wide | C-FE-248 | Front-end specification, routes, roster |
| `x = 54, y = 443` | The first filter control sits at x = 54, y = 443 | C-FE-251 | Front-end specification, routes, roster |
| `x = 54, y = 475` | The second filter control sits at x = 54, y = 475 | C-FE-252 | Front-end specification, routes, roster |
| `22` | The figure's four lines run about 22, 29, 28, 22 characters | C-FE-269 | Front-end specification, routes, about |
| `29` | The figure's four lines run about 22, 29, 28, 22 characters | C-FE-269 | Front-end specification, routes, about |
| `28` | The figure's four lines run about 22, 29, 28, 22 characters | C-FE-269 | Front-end specification, routes, about |
| `We build, we bend,` | The about body's first paragraph is seven authored lines beginning We build, we bend, | C-FE-271 | Front-end specification, routes, about |
| `160` | The second paragraph is one line of about 160 characters beginning Founded in Paris, working wider | C-FE-273 | Front-end specification, routes, about |
| `Founded in Paris, working wider.` | The second paragraph is one line of about 160 characters beginning Founded in Paris, working wider | C-FE-273 | Front-end specification, routes, about |
| `CIRRUS` | The lockup sets CIRRUS, PICTURE, MAKERS at 58px | C-FE-274 | Front-end specification, routes, about |
| `PICTURE` | The lockup sets CIRRUS, PICTURE, MAKERS at 58px | C-FE-274 | Front-end specification, routes, about |
| `MAKERS` | The lockup sets CIRRUS, PICTURE, MAKERS at 58px | C-FE-274 | Front-end specification, routes, about |
| `58px` | The lockup sets CIRRUS, PICTURE, MAKERS at 58px | C-FE-274 | Front-end specification, routes, about |
| `PROD` | The lockup sets PROD, FOR, AND at 24.75px | C-FE-275 | Front-end specification, routes, about |
| `FOR` | The lockup sets PROD, FOR, AND at 24.75px | C-FE-275 | Front-end specification, routes, about |
| `AND` | The lockup sets PROD, FOR, AND at 24.75px | C-FE-275 | Front-end specification, routes, about |
| `24.75px` | The lockup sets PROD, FOR, AND at 24.75px | C-FE-275 | Front-end specification, routes, about |
| `ITS` | The lockup sets ITS at 9.75px | C-FE-276 | Front-end specification, routes, about |
| `9.75px` | The lockup sets ITS at 9.75px | C-FE-276 | Front-end specification, routes, about |
| `2.34` | The lockup's three sizes step at a ratio of roughly 2.34 | C-FE-277 | Front-end specification, routes, about |
| `PREVIEW - NOT PUBLISHED` | The preview route carries a marker reading PREVIEW - NOT PUBLISHED | C-FE-286 | Front-end specification, routes, preview |
| `Loading preview...` | The preview waiting state reads Loading preview... in the display face at the optical centre | C-FE-287 | Front-end specification, routes, preview |
| `New talent` | The palette offers New talent, New work, Reorder index, Preview | C-FE-289 | Front-end specification, routes, studio |
| `New work` | The palette offers New talent, New work, Reorder index, Preview | C-FE-289 | Front-end specification, routes, studio |
| `Reorder index` | The palette offers New talent, New work, Reorder index, Preview | C-FE-289 | Front-end specification, routes, studio |
| `Preview` | The palette offers New talent, New work, Reorder index, Preview | C-FE-289 | Front-end specification, routes, studio |
| `That page is not here.` | The not-found route reads That page is not here. in the display face at the optical centre | C-FE-293 | Front-end specification, routes, not found |
| `768px` | There is one real breakpoint, at 768px | C-FE-302 | Front-end specification, responsive behaviour |
| `500px` | A viewport shorter than 500px is treated as narrow whatever its width | C-FE-303 | Front-end specification, responsive behaviour |
| `Cirrus, home` | The wordmark's accessible name is Cirrus, home | C-FE-324 | Front-end specification, accessibility |
| `Site by Aube, opens in a new tab` | The corner credit's accessible name is Site by Aube, opens in a new tab | C-FE-325 | Front-end specification, accessibility |
| `Skip to content` | A skip link reading Skip to content is the first focusable element | C-FE-326 | Front-end specification, accessibility |
| `0.01s` | Under reduced motion the colour return still applies on hover over 0.01s | C-FE-338 | Front-end specification, accessibility |
| `4.5:1` | An inactive filter at 0.5 opacity must reach 4.5:1 against its ground | C-FE-342 | Front-end specification, accessibility |
| `250KB` | Script per route is budgeted at 250KB compressed | C-FE-346 | Front-end specification, performance |
| `200KB` | Two variable font files are budgeted at 200KB each | C-FE-347 | Front-end specification, performance |
| `74.6%` | Moving pictures were 74.6% of every byte the reference transferred | C-FE-352 | Front-end specification, performance |
| `120,872,010` | The reference transferred 120,872,010 of 162,123,713 bytes as video | C-FE-353 | Front-end specification, performance |
| `162,123,713` | The reference transferred 120,872,010 of 162,123,713 bytes as video | C-FE-353 | Front-end specification, performance |
| `598` | Stills are generated at the widths 598, 300, 1006 | C-FE-364 | Front-end specification, zero-asset substitution |
| `300` | Stills are generated at the widths 598, 300, 1006 | C-FE-364 | Front-end specification, zero-asset substitution |
| `1006` | Stills are generated at the widths 598, 300, 1006 | C-FE-364 | Front-end specification, zero-asset substitution |
| `0.9` | The grain is a 300px tile of fractal noise at a base frequency around 0.9 over four octaves | C-FE-369 | Front-end specification, zero-asset substitution |
| `1200 x 630` | The share image is generated at 1200 x 630 on the #060403 ground with the wordmark centred | C-FE-372 | Front-end specification, zero-asset substitution |
| `DIRECTOR` | The roster filter copy is DIRECTOR, PHOTOGRAPHER,, STYLIST once a stylist is published | C-FE-376 | Front-end specification, copy and metadata |
| `PHOTOGRAPHER` | The roster filter copy is DIRECTOR, PHOTOGRAPHER,, STYLIST once a stylist is published | C-FE-376 | Front-end specification, copy and metadata |
| `STYLIST` | The roster filter copy is DIRECTOR, PHOTOGRAPHER,, STYLIST once a stylist is published | C-FE-376 | Front-end specification, copy and metadata |
| `Cirrus` | The entry route's title is Cirrus | C-FE-378 | Front-end specification, copy and metadata |
| `Cirrus - Works` | The index's title is Cirrus - Works | C-FE-379 | Front-end specification, copy and metadata |
| `Cirrus - Talents` | The roster's title is Cirrus - Talents | C-FE-380 | Front-end specification, copy and metadata |
| `Cirrus - About` | The about route's title is Cirrus - About | C-FE-381 | Front-end specification, copy and metadata |
| `A production house for picture, its makers.` | The description is A production house for picture, its makers | C-FE-382 | Front-end specification, copy and metadata |
| `og:title` | og:title matches the title, og:description matches the description | C-FE-383 | Front-end specification, copy and metadata |
| `og:description` | og:title matches the title, og:description matches the description | C-FE-383 | Front-end specification, copy and metadata |
| `og:image` | og:image names the generated share image | C-FE-384 | Front-end specification, copy and metadata |
| `twitter:card` | twitter:card is summary_large_image | C-FE-385 | Front-end specification, copy and metadata |
| `summary_large_image` | twitter:card is summary_large_image | C-FE-385 | Front-end specification, copy and metadata |
| `width=device-width, initial-scale=1` | The viewport is width=device-width, initial-scale=1 | C-FE-386 | Front-end specification, copy and metadata |
| `${APP_PUBLIC_PORT}:4173` | The port mapping is ${APP_PUBLIC_PORT}:4173 | C-DC-02 | Deployment contract bullet 1 |
| `4173` | 4173 is the container-internal port | C-DC-03 | Deployment contract bullet 1 |
| `.browser_screenshots/` | Reserved .browser_screenshots/, .downloads/ directories exist at the app root, empty | C-DC-09 | Deployment contract bullet 6 |
| `.downloads/` | Reserved .browser_screenshots/, .downloads/ directories exist at the app root, empty | C-DC-09 | Deployment contract bullet 6 |
| `POST /api/auth/signup` | POST /api/auth/signup returns the new viewer account, a bearer token | C-DC-16 | Deployment contract, API shapes table row 1 |
| `viewer` | POST /api/auth/signup returns the new viewer account, a bearer token | C-DC-16 | Deployment contract, API shapes table row 1 |
| `GET /api/works/{slug}` | GET /api/works/{slug} returns one published work with its media, credits, neighbours | C-DC-19 | Deployment contract, API shapes table row 4 |
| `discipline` | GET /api/talents returns a top-level array of published talents, accepts a discipline query | C-DC-20 | Deployment contract, API shapes table row 5 |
| `GET /api/talents/{slug}` | GET /api/talents/{slug} returns one published talent with its media, derived selected work | C-DC-21 | Deployment contract, API shapes table row 6 |
| `GET /api/preview/{token}` | GET /api/preview/{token} returns one unlisted record in full for its own house's producer | C-DC-24 | Deployment contract, API shapes table row 9 |
| `GET /api/studio/items` | GET /api/studio/items returns a top-level array of the caller's own house's records | C-DC-25 | Deployment contract, API shapes table row 10 |
| `GET /api/studio/items/{id}` | GET /api/studio/items/{id} returns one of the caller's own house's records | C-DC-26 | Deployment contract, API shapes table row 11 |
| `POST /api/studio/items` | POST /api/studio/items returns the created record, unlisted | C-DC-27 | Deployment contract, API shapes table row 12 |
| `PATCH /api/studio/items/{id}` | PATCH /api/studio/items/{id} returns the updated record | C-DC-28 | Deployment contract, API shapes table row 13 |
| `POST /api/studio/items/{id}/publish` | POST /api/studio/items/{id}/publish returns the record with published, published_at | C-DC-29 | Deployment contract, API shapes table row 14 |
| `published` | POST /api/studio/items/{id}/publish returns the record with published, published_at | C-DC-29 | Deployment contract, API shapes table row 14 |
| `published_at` | POST /api/studio/items/{id}/publish returns the record with published, published_at | C-DC-29 | Deployment contract, API shapes table row 14 |
| `POST /api/studio/items/{id}/media` | POST /api/studio/items/{id}/media returns a media_id with its role, width, height | C-DC-30 | Deployment contract, API shapes table row 15 |
| `media_id` | POST /api/studio/items/{id}/media returns a media_id with its role, width, height | C-DC-30 | Deployment contract, API shapes table row 15 |
| `role` | POST /api/studio/items/{id}/media returns a media_id with its role, width, height | C-DC-30 | Deployment contract, API shapes table row 15 |
| `width` | POST /api/studio/items/{id}/media returns a media_id with its role, width, height | C-DC-30 | Deployment contract, API shapes table row 15 |
| `height` | POST /api/studio/items/{id}/media returns a media_id with its role, width, height | C-DC-30 | Deployment contract, API shapes table row 15 |
| `POST /api/studio/items/{id}/credits` | POST /api/studio/items/{id}/credits returns the created credit | C-DC-31 | Deployment contract, API shapes table row 16 |
| `POST /api/studio/works/order` | POST /api/studio/works/order returns the house's works in their new order | C-DC-33 | Deployment contract, API shapes table row 18 |
| `expires_at` | POST /api/studio/preview-tokens returns a token with an expires_at | C-DC-34 | Deployment contract, API shapes table row 19 |
| `PICTURES PATIENTLY MADE` | the about figure's first line | C-FE-268 | Front-end specification, routes, about |
| `PRACTISED HANDS, PLAIN PURPOSE` | the about figure's second line | C-FE-268 | Front-end specification, routes, about |
| `PEOPLE WORTH PUTTING FORWARD` | the about figure's third line | C-FE-268 | Front-end specification, routes, about |
| `PICTURE AND ITS MAKERS` | the about figure's fourth line | C-FE-268 | Front-end specification, routes, about |

### Referenced but not pinned

| What the instruction calls it | Item | Why it matters |
|---|---|---|
| the house's own vector marks | C-FE-92 | specified as slots with their boxes, never as artwork |
| the twelve entry caption titles | C-FE-227 | the ordinals are pinned; the titles are seed data rather than layout |
| the studio credit's destination address | C-FE-101 | named as the design studio's own site with no literal given |

## Coverage ledger

| Section | Obligation-bearing sentences | Items produced |
|---|---|---|
| Overview | 4 | 18 |
| User roles | 5 | 29 |
| Core features | 14 | 63 |
| User flow | 12 | 53 |
| UI and UX notes | 8 | 38 |
| Technical requirements | 15 | 40 |
| Data model | 20 | 74 |
| Front-end specification | 62 | 391 |
| Constraints | 8 | 22 |
| Deployment contract | 20 | 42 |
