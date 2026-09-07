# Checklist: Community Calendar Hosting

Source: instruction.md
Sections present: overview, roles, features, flow, uiux, technical, datamodel, frontend, constraints, deployment
Sections absent: buildplan
Items: 236
Unpinned values flagged: 2

## C-OV Overview

- [ ] `C-OV-01` `ui` The event page shows a poster, a date, a place, one registration panel. `src: Overview para 2`
- [ ] `C-OV-02` `ui` The registration panel shows one of registering, host deciding, waiting-list place, or registration closed. `src: Overview para 2`
- [ ] `C-OV-03` `ui` Each event page is painted from the event own key colour. `src: Overview para 2`

## C-RL User roles

- [ ] `C-RL-01` `role` A host creates, publishes, closes or cancels events on a calendar the host owns. `src: User roles table row 1`
- [ ] `C-RL-02` `role` A host reads the full guest list for an event the host owns. `src: User roles table row 1`
- [ ] `C-RL-03` `role` A host checks tickets in for an event the host owns. `src: User roles table row 1`
- [ ] `C-RL-04` `role` A host is denied access to another host calendar, event, guest list or tickets. `src: User roles table row 1`
- [ ] `C-RL-05` `role` A guest registers for a published event, holds a ticket, then cancels the guest own registration. `src: User roles table row 2`
- [ ] `C-RL-06` `role` A guest is denied reading any guest list. `src: User roles table row 2`
- [ ] `C-RL-07` `role` A guest is denied approving or declining a registration. `src: User roles table row 2`
- [ ] `C-RL-08` `role` A guest is denied checking a ticket in. `src: User roles table row 2`
- [ ] `C-RL-09` `role` A guest is denied reading a draft event. `src: User roles table row 2`
- [ ] `C-RL-10` `role` The server rejects a direct API call from a guest session to a host-only endpoint. `src: User roles para 1`
- [ ] `C-RL-11` `role` A rejected unauthorized request leaves the protected state unchanged. `src: User roles para 1`
- [ ] `C-RL-12` `literal` Signup creates an account with the role `guest`. `src: User roles para 2`
- [ ] `C-RL-13` `literal` Every seeded account signs in with the password `deku-demo-pw-2026`. `src: User roles para 2`

## C-CF Core features

- [ ] `C-CF-01` `capability` Login with email plus password returns a bearer token. `src: Core features, Auth para 1`
- [ ] `C-CF-02` `literal` The client sends the token as `Authorization: Bearer <token>`. `src: Core features, Auth para 1`
- [ ] `C-CF-03` `constraint` Passwords are stored hashed. `src: Core features, Auth para 1`
- [ ] `C-CF-04` `capability` Publishing an event requires a title, a category, a city, a start, an end after the start, then a capacity. `src: Core features, Events rule 1`
- [ ] `C-CF-05` `literal` Capacity runs from `1` to `500`. `src: Core features, Events rule 1`
- [ ] `C-CF-06` `capability` A submission missing a required publishing field is stored as `draft`. `src: Core features, Events rule 2`
- [ ] `C-CF-07` `data` Event slugs, calendar slugs plus account handles share one root namespace. `src: Core features, Events rule 2`
- [ ] `C-CF-08` `constraint` A slug matching a reserved path, a category name or an existing slug is rejected as invalid. `src: Core features, Events rule 2`
- [ ] `C-CF-09` `capability` Cancelling an event requires a non-empty cancel reason. `src: Core features, Events rule 3`
- [ ] `C-CF-10` `constraint` Republishing a cancelled event is rejected. `src: Core features, Events rule 3`
- [ ] `C-CF-11` `constraint` Returning a published event to draft is rejected. `src: Core features, Events rule 3`
- [ ] `C-CF-12` `capability` A draft event returns the not-found response to every account other than the owning host. `src: Core features, Events rule 4`
- [ ] `C-CF-13` `data` The confirmed count of an event is the registrations in confirmed or checked in, counted on read. `src: Core features, Registration rule 5`
- [ ] `C-CF-14` `constraint` The confirmed count of an event never exceeds the event capacity. `src: Core features, Registration rule 5`
- [ ] `C-CF-15` `constraint` Two guests registering for the last seat at the same instant produce exactly one confirmed registration. `src: Core features, Registration rule 6`
- [ ] `C-CF-16` `capability` The guest who loses the last seat becomes waitlisted where the waiting list is on. `src: Core features, Registration rule 6`
- [ ] `C-CF-17` `constraint` The last-seat rule holds at the database level rather than in application logic alone. `src: Core features, Registration rule 6`
- [ ] `C-CF-18` `constraint` A rejected registration attempt leaves no partial row. `src: Core features, Registration rule 6`
- [ ] `C-CF-19` `constraint` An account holds at most one registration per event in any status. `src: Core features, Registration rule 7`
- [ ] `C-CF-20` `capability` A repeat registration submission updates the existing registration rather than adding a row. `src: Core features, Registration rule 7`
- [ ] `C-CF-21` `capability` Cancelling a confirmed registration frees the seat in the same request. `src: Core features, Registration rule 8`
- [ ] `C-CF-22` `capability` Freeing a seat promotes waiting-list position `1` to confirmed with a ticket. `src: Core features, Registration rule 8`
- [ ] `C-CF-23` `capability` A registration on an event requiring approval starts as pending approval. `src: Core features, Registration rule 9`
- [ ] `C-CF-24` `capability` The owning host approves a pending registration to confirmed. `src: Core features, Registration rule 9`
- [ ] `C-CF-25` `capability` The owning host approving into a full event produces a waitlisted registration. `src: Core features, Registration rule 9`
- [ ] `C-CF-26` `capability` The owning host declines a pending registration to declined. `src: Core features, Registration rule 9`
- [ ] `C-CF-27` `constraint` A ticket code exists exactly when the registration status is confirmed or checked in. `src: Core features, Registration rule 10`
- [ ] `C-CF-28` `literal` A ticket code is `TKT-` followed by 8 uppercase letters or digits. `src: Core features, Registration rule 10`
- [ ] `C-CF-29` `capability` The owning host checks a ticket in at the ticket code. `src: Core features, Registration rule 11`
- [ ] `C-CF-30` `constraint` A second check-in of one ticket code records one arrival. `src: Core features, Registration rule 11`
- [ ] `C-CF-31` `capability` Every registration outcome reaches the guest over real SMTP. `src: Core features, Mail rule 12`
- [ ] `C-CF-32` `literal` Mail is sent through the environment values `SMTP_HOST` plus `SMTP_PORT`. `src: Core features, Mail rule 12`
- [ ] `C-CF-33` `capability` Cancelling an event mails every guest still holding a place. `src: Core features, Mail rule 13`
- [ ] `C-CF-34` `capability` The cancellation mail body carries the host cancel reason word for word. `src: Core features, Mail rule 13`
- [ ] `C-CF-35` `constraint` A guest cancelling a registration sends no mail. `src: Core features, Mail rule 13`

## C-UF User flow

- [ ] `C-UF-01` `literal` The route `/` serves the landing wall with the category grid. `src: User flow route table row 1`
- [ ] `C-UF-02` `literal` The route `/discover` lists published events with filters. `src: User flow route table row 2`
- [ ] `C-UF-03` `literal` The route `/<category>` serves one of the twelve category pages. `src: User flow route table row 3`
- [ ] `C-UF-04` `literal` The route `/<slug>` resolves an event, a calendar or a profile. `src: User flow route table row 4`
- [ ] `C-UF-05` `literal` The route `/home` lists the signed-in guest own registrations. `src: User flow route table row 8`
- [ ] `C-UF-06` `literal` The route `/calendars` lists the calendars the signed-in host owns. `src: User flow route table row 9`
- [ ] `C-UF-07` `literal` The route `/create` serves the event composer to a host. `src: User flow route table row 10`
- [ ] `C-UF-08` `literal` The route `/event/<slug>/manage/overview` serves one event dashboard to the owning host. `src: User flow route table row 11`
- [ ] `C-UF-09` `literal` The route `/event/<slug>/manage/guests` serves the guest list, the queue plus the door to the owning host. `src: User flow route table row 12`
- [ ] `C-UF-10` `literal` The route `/event/<slug>/manage/registration` serves capacity plus approval settings to the owning host. `src: User flow route table row 13`
- [ ] `C-UF-11` `literal` The route `/t/<ticket-code>` serves one ticket. `src: User flow route table row 14`
- [ ] `C-UF-12` `literal` An unauthenticated visitor at a protected route is redirected to `/login?next=<path>`. `src: User flow, Entry and redirects`
- [ ] `C-UF-13` `literal` Login without a next parameter lands a guest on `/home`. `src: User flow, Entry and redirects`
- [ ] `C-UF-14` `literal` Login without a next parameter lands a host on `/calendars`. `src: User flow, Entry and redirects`
- [ ] `C-UF-15` `capability` An expired token is cleared, then the visitor is sent to the login route with the current path. `src: User flow, Entry and redirects`
- [ ] `C-UF-16` `role` A guest at a manage route receives the not-found page. `src: User flow, Entry and redirects`
- [ ] `C-UF-17` `ui` Every list shows an empty state naming the absence with a way out. `src: User flow, States`
- [ ] `C-UF-18` `ui` A refusal says what happened with what to do next. `src: User flow, States`
- [ ] `C-UF-19` `constraint` No refusal message uses the word `error`. `src: User flow, States`

## C-UX UI and UX notes

- [ ] `C-UX-01` `ui` Titles plus long copy are set in a serif family. `src: UI/UX notes para 2`
- [ ] `C-UX-02` `ui` Controls plus data are set in one interface sans family. `src: UI/UX notes para 2`
- [ ] `C-UX-03` `ui` Every moving element shares one speed on one settling curve. `src: UI/UX notes para 3`
- [ ] `C-UX-04` `ui` No blur is animated anywhere in the product. `src: UI/UX notes para 3`
- [ ] `C-UX-05` `ui` A visitor asking for reduced motion sees final states at once. `src: UI/UX notes para 3`
- [ ] `C-UX-06` `ui` One hue marks failure, one marks success, one marks pending, none of the three appears decoratively. `src: UI/UX notes para 4`
- [ ] `C-UX-07` `ui` An event page arrives already painted from the event key colour. `src: UI/UX notes para 4`
- [ ] `C-UX-08` `ui` The signed-in shell keeps a persistent left rail. `src: UI/UX notes para 5`
- [ ] `C-UX-09` `ui` Registration state is shown as a word in a pill rather than by colour alone. `src: UI/UX notes para 5`
- [ ] `C-UX-10` `ui` Body text meets WCAG AA contrast. `src: UI/UX notes para 6`
- [ ] `C-UX-11` `ui` Every interactive element is reachable by keyboard with a visible focus ring. `src: UI/UX notes para 6`
- [ ] `C-UX-12` `ui` Every icon-only control carries a text name. `src: UI/UX notes para 6`
- [ ] `C-UX-13` `ui` The registration panel becomes a foot bar on a phone. `src: UI/UX notes para 6`

## C-TR Technical requirements

- [ ] `C-TR-01` `contract` The frontend is served as static output behind a preview server on port `4173`. `src: Technical requirements bullet 1`
- [ ] `C-TR-02` `contract` Registration, approval plus check-in are synchronous inside one transaction. `src: Technical requirements bullet 2`
- [ ] `C-TR-03` `literal` The database is PostgreSQL reached at `DATABASE_URL`. `src: Technical requirements bullet 3`
- [ ] `C-TR-04` `literal` Mail is sent to Mailpit using `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` then `SMTP_PASS`. `src: Technical requirements bullet 4`
- [ ] `C-TR-05` `constraint` Mail leaves in the same request that causes the transition. `src: Technical requirements bullet 4`
- [ ] `C-TR-06` `contract` Auth is in-app email plus password with bearer tokens. `src: Technical requirements bullet 5`
- [ ] `C-TR-07` `literal` `GET /api/health` returns `200` once the app is ready. `src: Technical requirements bullet 6`
- [ ] `C-TR-08` `constraint` Every address is read from the environment rather than hardcoded. `src: Technical requirements para 3`
- [ ] `C-TR-09` `contract` The key colour of an event is present in the first document the browser paints. `src: Technical requirements para 5`
- [ ] `C-TR-10` `capability` Discovery filters live in the query string so one address reproduces one list. `src: Technical requirements, Search para`
- [ ] `C-TR-11` `literal` `GET /api/events` accepts `limit` plus `offset` with a default page size of `20`. `src: Technical requirements, Search para`
- [ ] `C-TR-12` `capability` Event ranking is soonest start first with ties broken by slug ascending. `src: Technical requirements, Search para`
- [ ] `C-TR-13` `capability` A request body is validated before anything is written. `src: Technical requirements, Validation para`
- [ ] `C-TR-14` `capability` A rejection names the offending field. `src: Technical requirements, Validation para`
- [ ] `C-TR-15` `literal` Registration plus login accept at most `10` requests per minute per account. `src: Technical requirements, Validation para`
- [ ] `C-TR-16` `capability` A request over the rate limit is rejected as a client error naming the limit. `src: Technical requirements, Validation para`
- [ ] `C-TR-17` `capability` The events list endpoint accepts a free-text term `q` matched against the event title, the event description or the calendar name. `src: Technical requirements, Search para 2`
- [ ] `C-TR-18` `constraint` The free-text term narrows what the category filter plus the city filter already selected. `src: Technical requirements, Search para 2`
- [ ] `C-TR-19` `contract` Every events list response carries the header `X-Total-Count` holding the match count before paging. `src: Technical requirements, Search para 3`
- [ ] `C-TR-20` `contract` Every timestamp crossing the API is RFC 3339 in UTC with a trailing `Z`. `src: Technical requirements, Time para`
- [ ] `C-TR-21` `data` An event stores `time_zone` as an IANA zone name defaulting to `UTC`. `src: Technical requirements, Time para`
- [ ] `C-TR-22` `ui` An event start renders labelled with the zone the event is held in. `src: Technical requirements, Time para`
- [ ] `C-TR-23` `capability` The owning host downloads the guest list of one event as a comma separated file. `src: Technical requirements, Exports para`
- [ ] `C-TR-24` `literal` The comma separated guest list opens with the header line `email,display_name,status,waitlist_position,ticket_code`. `src: Technical requirements, Exports para`
- [ ] `C-TR-25` `role` A guest requesting the comma separated guest list meets the refusal the JSON guest list gives a guest. `src: Technical requirements, Exports para`

## C-DM Data model

- [ ] `C-DM-01` `literal` The password `deku-demo-pw-2026` works at login for every seeded account. `src: Data model para 2`
- [ ] `C-DM-02` `contract` Each seeded account is written into `/app/USER_README.md` beside the password. `src: Data model para 2`
- [ ] `C-DM-03` `data` The `accounts` table holds a unique lowercased email. `src: Data model, accounts para`
- [ ] `C-DM-04` `data` The `accounts` table holds a unique kebab-case handle in the root namespace. `src: Data model, accounts para`
- [ ] `C-DM-05` `data` The `events` table holds `theme_hex` derived once at creation from `cover_seed`. `src: Data model, events para`
- [ ] `C-DM-06` `literal` An event state is one of `draft`, `published`, `registration_closed` or `cancelled`. `src: Data model, events para`
- [ ] `C-DM-07` `literal` A registration status is one of `pending_approval`, `confirmed`, `waitlisted`, `declined`, `cancelled_by_guest`, `cancelled_by_host` or `checked_in`. `src: Data model, registrations para`
- [ ] `C-DM-08` `data` The field `waitlist_position` is 1-based, null unless the status is waitlisted. `src: Data model, registrations para`
- [ ] `C-DM-09` `data` The confirmed count is derived on read rather than stored as a counter. `src: Data model, registrations para`
- [ ] `C-DM-10` `data` The `email_log` table records a row only after the SMTP send has returned. `src: Data model, email_log para`
- [ ] `C-DM-11` `capability` A host edits a published event title, description, location, capacity or times. `src: Data model, Editing para`
- [ ] `C-DM-12` `constraint` Lowering capacity below the current confirmed count is rejected. `src: Data model, Editing para`
- [ ] `C-DM-13` `capability` Moving the time or location of an event with confirmed guests mails every one of those guests. `src: Data model, Editing para`
- [ ] `C-DM-14` `constraint` Waiting-list positions on an event are the integers 1 upward with no gaps. `src: Data model, Invariants list`
- [ ] `C-DM-15` `constraint` A failed registration leaves no row, no held seat, no ticket. `src: Data model, Invariants list`
- [ ] `C-DM-16` `capability` Root-namespace lookup runs reserved paths, then category names, then event slug, then calendar slug, then account handle. `src: Data model, Root-namespace para`
- [ ] `C-DM-17` `literal` The reserved paths are `api`, `app`, `login`, `signup`, `home`, `calendars`, `create`, `discover`, `settings`, `event` plus `t`. `src: Data model, Root-namespace para`
- [ ] `C-DM-18` `literal` The twelve category names are `family`, `books`, `games`, `tech`, `food-and-drink`, `ai`, `running`, `arts-and-culture`, `climate`, `fitness`, `wellness` plus `crypto`. `src: Data model, Root-namespace para`
- [ ] `C-DM-19` `literal` Five accounts are seeded at `host@example.com`, `host2@example.com`, `guest@example.com`, `guest2@example.com` plus `guest3@example.com`. `src: Data model, Seed data para 1`
- [ ] `C-DM-20` `literal` Seven events are seeded, one of them `thursday-night-5k` at capacity `3`. `src: Data model, Seed data table`
- [ ] `C-DM-21` `literal` The seeded event `riverside-track-session` carries capacity `2` with one confirmed registration. `src: Data model, Seed data para 3`
- [ ] `C-DM-22` `literal` The seeded event `thursday-night-5k` leaves exactly one free seat. `src: Data model, Seed data para 3`
- [ ] `C-DM-23` `literal` The seeded event `sunrise-long-run` holds one pending approval registration. `src: Data model, Seed data para 3`
- [ ] `C-DM-24` `literal` The seeded event `autumn-book-swap` carries the cancel reason `The venue lost its lease.` `src: Data model, Seed data para 3`
- [ ] `C-DM-25` `constraint` Seeding is idempotent so restarting the app duplicates no row. `src: Data model, final line`
- [ ] `C-DM-26` `capability` Raising the capacity of an event with people waiting confirms waiting registrations in the same request. `src: Data model, Raising capacity para`
- [ ] `C-DM-27` `constraint` A capacity raise takes waiting registrations in `waitlist_position` order, lowest first. `src: Data model, Raising capacity para`
- [ ] `C-DM-28` `capability` Each registration a capacity raise moves to a seat is issued a `ticket_code`. `src: Data model, Raising capacity para`
- [ ] `C-DM-29` `capability` Each registration a capacity raise moves to a seat is mailed the waiting-list-to-seat subject. `src: Data model, Raising capacity para`
- [ ] `C-DM-30` `constraint` The registrations left waiting after a capacity raise renumber from `1` with no gaps. `src: Data model, Raising capacity para`
- [ ] `C-DM-31` `constraint` A capacity raise on an event with nobody waiting mails nobody. `src: Data model, Raising capacity para`
- [ ] `C-DM-32` `capability` A published event moves to `registration_closed`, then back to `published`. `src: Data model, Closing registration para`
- [ ] `C-DM-33` `constraint` A registration submitted against an event in `registration_closed` is refused as a client error. `src: Data model, Closing registration para`
- [ ] `C-DM-34` `constraint` A registration already held on a closed event keeps the held status plus the `ticket_code`. `src: Data model, Closing registration para`
- [ ] `C-DM-35` `capability` The owning host checks a ticket in on an event sitting in `registration_closed`. `src: Data model, Closing registration para`
- [ ] `C-DM-36` `constraint` Closing or reopening registration mails nobody. `src: Data model, Closing registration para`
- [ ] `C-DM-37` `constraint` The state `registration_closed` is reachable from `published` alone. `src: Data model, Closing registration para`
- [ ] `C-DM-38` `capability` A signed-in account edits the account own display name plus handle. `src: Data model, Handles para`
- [ ] `C-DM-39` `constraint` A new handle matching a reserved path, a category name, an existing handle, a calendar slug or an event slug is refused. `src: Data model, Handles para`
- [ ] `C-DM-40` `constraint` An account keeps the handle held before a refused handle change. `src: Data model, Handles para`
- [ ] `C-DM-41` `capability` A host creates a calendar with a name, a slug, a category, a city plus a public flag. `src: Data model, Handles para`
- [ ] `C-DM-42` `role` A guest is refused calendar creation. `src: Data model, Handles para`
- [ ] `C-DM-43` `constraint` A new calendar slug enters the root namespace under the same rejection rule as an event slug. `src: Data model, Handles para`
- [ ] `C-DM-44` `literal` The seeded event `winter-reading-night` carries the time zone `Europe/Lisbon`. `src: Data model, Seed data table`
- [ ] `C-DM-45` `literal` The seeded event `riverside-winter-time-trial` is stored in `registration_closed`. `src: Data model, Seed data table`

## C-FE Front-end specification

- [ ] `C-FE-01` `ui` Body text, primary buttons plus low-alpha borders use the ink `#151515`. `src: Front-end specification, Palette tokens para 1`
- [ ] `C-FE-02` `ui` A themed event page uses the ink `#000f3a`. `src: Front-end specification, Palette tokens para 3`
- [ ] `C-FE-03` `ui` The brand mark, the private-event badge plus one link hue use `#f31a7c`. `src: Front-end specification, Palette tokens para 4`
- [ ] `C-FE-04` `ui` The event ground is the key colour at 8 percent saturation with 94 percent lightness. `src: Front-end specification, event theme para 1`
- [ ] `C-FE-05` `ui` The themed page ground fades in once over `2000ms`. `src: Front-end specification, event theme para 2`
- [ ] `C-FE-06` `ui` Every cover tile carries a glow layer with a sheen layer over a blurred copy. `src: Front-end specification, event theme para 3`
- [ ] `C-FE-07` `ui` A derived ground failing contrast against the derived ink falls back to paper with ink. `src: Front-end specification, event theme para 5`
- [ ] `C-FE-08` `ui` The landing headline is the one type size that changes with the window. `src: Front-end specification, Type para 3`
- [ ] `C-FE-09` `ui` Cover tiles use the elliptical radius `12.8% / 5.7%`. `src: Front-end specification, Shape para 1`
- [ ] `C-FE-10` `ui` The top bar shows the visitor local time, live, updating once a minute. `src: Front-end specification, Global chrome para 1`
- [ ] `C-FE-11` `ui` The landing adjective rotates through `Delightful`, `Vivid`, `Stellar`, `Lovely`. `src: Front-end specification, Route landing para 2`
- [ ] `C-FE-12` `ui` The words `start here` carry the only gradient touching type in the product. `src: Front-end specification, Route landing para 2`
- [ ] `C-FE-13` `ui` The registration panel shows exactly one of six states. `src: Front-end specification, Route event page para 4`
- [ ] `C-FE-14` `ui` The composer is one screen rather than a wizard. `src: Front-end specification, Route composer para`
- [ ] `C-FE-15` `ui` The not-found page reads `404` with `Page Not Found`. `src: Front-end specification, Route system pages para`
- [ ] `C-FE-16` `ui` A route that never existed answers with the same page as a route the visitor may not see. `src: Front-end specification, Route system pages para`
- [ ] `C-FE-17` `ui` The product ships no image file. `src: Front-end specification, Covers para`
- [ ] `C-FE-18` `ui` A generated cover feeds the theme derivation as a photograph would. `src: Front-end specification, Covers para`
- [ ] `C-FE-19` `ui` Anything tappable measures at least `44px` on any axis. `src: Front-end specification, Responsive matrix para`
- [ ] `C-FE-20` `ui` The focus ring is a `2px` outline drawn so layout never shifts. `src: Front-end specification, Accessibility detail para`
- [ ] `C-FE-21` `ui` The empty state on `/discover` reads `No Events Found`. `src: Front-end specification, Copy deck para 1`
- [ ] `C-FE-22` `ui` A guest arriving after the seats are gone reads the pinned filled-up message. `src: Front-end specification, Copy deck para 2`
- [ ] `C-FE-23` `ui` The signed-in shell covers loading, empty, working, refused plus not permitted. `src: Front-end specification, Authenticated screens para`
- [ ] `C-FE-24` `ui` The discovery filter bar writes each filter value into the query string on change. `src: Front-end specification, Route discover para 1`
- [ ] `C-FE-25` `ui` The discovery page control reads `Showing <n> of <total>`. `src: Front-end specification, Route discover para 2`
- [ ] `C-FE-26` `ui` A discovery card for a closed event carries the closed word in a pill with no seat caption. `src: Front-end specification, Route discover para 2`
- [ ] `C-FE-27` `ui` The category masthead carries the category glyph, the name, the published-event count, the calendar count. `src: Front-end specification, Route category para`
- [ ] `C-FE-28` `ui` A sign-in card carries the brand lockup, the fields, one primary action, one text link. `src: Front-end specification, Route sign in para`
- [ ] `C-FE-29` `ui` The signed-in shell keeps a persistent left rail of `260px` at `1000px` upward. `src: Front-end specification, Authenticated screens, shell para`
- [ ] `C-FE-30` `ui` The rail shows a guest the destinations `Home`, `Discover`, `Settings`. `src: Front-end specification, Authenticated screens, shell para`
- [ ] `C-FE-31` `ui` The route `/home` lists the signed-in guest registrations under an `Upcoming` heading. `src: Front-end specification, Authenticated screens, home para`
- [ ] `C-FE-32` `ui` The calendars route opens a `New Calendar` dialog asking for the name, the slug, the category, the city, the public flag. `src: Front-end specification, Authenticated screens, calendars para`
- [ ] `C-FE-33` `ui` The manage overview screen shows four counters over overline labels. `src: Front-end specification, Authenticated screens, overview para`
- [ ] `C-FE-34` `ui` The guest list toolbar carries an `Export CSV` control. `src: Front-end specification, Authenticated screens, guests para`
- [ ] `C-FE-35` `ui` The guest list table carries a header row naming the guest, the email, the status, the waiting-list position, the ticket code. `src: Front-end specification, Authenticated screens, guests para`
- [ ] `C-FE-36` `ui` The door field action reads `Check In`. `src: Front-end specification, Authenticated screens, guests para`
- [ ] `C-FE-37` `ui` The registration settings screen carries a switch reading `Registration Open`. `src: Front-end specification, Authenticated screens, registration para`
- [ ] `C-FE-38` `ui` The registration settings screen shows a capacity stepper with a caption beneath the control. `src: Front-end specification, Authenticated screens, registration para`
- [ ] `C-FE-39` `ui` The ticket card carries an `Add to Calendar` control. `src: Front-end specification, Authenticated screens, ticket para`
- [ ] `C-FE-40` `ui` The profile screen shows the address a typed handle produces beneath the field. `src: Front-end specification, Authenticated screens, profile para`
- [ ] `C-FE-41` `ui` A dialog traps focus, returns focus to the opening control, closes on the escape key. `src: Front-end specification, Dialogs para`
- [ ] `C-FE-42` `ui` A notice carries the status hue as a `4px` leading edge rather than as a fill. `src: Front-end specification, Dialogs para`
- [ ] `C-FE-43` `ui` A refused field carries an inline sentence beneath the field plus the `shake`. `src: Front-end specification, Dialogs para`
- [ ] `C-FE-44` `ui` Every route paints a skeleton on the `#f2f2f2` ground rather than a spinner. `src: Front-end specification, Loading para`
- [ ] `C-FE-45` `ui` The guest list becomes one card per guest below `484px` keeping the header words as labels. `src: Front-end specification, Responsive matrix para`
- [ ] `C-FE-46` `ui` The closed panel reads `Registration Is Closed` over the pinned closed sentence. `src: Front-end specification, Copy deck para 3`
- [ ] `C-FE-47` `ui` A handle already taken is refused with `That handle is already taken.` `src: Front-end specification, Copy deck para 3`
- [ ] `C-FE-48` `ui` A calendar slug already in the namespace is refused with `That address is already taken.` `src: Front-end specification, Copy deck para 3`

## C-CN Constraints

- [ ] `C-CN-01` `constraint` The app is single tenant with no workspace layer. `src: Constraints bullet 1`
- [ ] `C-CN-02` `constraint` Every event is free with no price, payment or refund. `src: Constraints bullet 2`
- [ ] `C-CN-03` `constraint` There is no emailed sign-in code, no phone sign-in, no third-party sign-in, no passkey. `src: Constraints bullet 3`
- [ ] `C-CN-04` `constraint` There is no recurring series, no reliability signal, no calendar team, no audit log. `src: Constraints bullet 4`
- [ ] `C-CN-05` `constraint` There is no messaging, no inbox, no push notification, no reminder. `src: Constraints bullet 4`
- [ ] `C-CN-06` `constraint` There is no cover-image upload, no object store. `src: Constraints bullet 5`
- [ ] `C-CN-07` `constraint` There is no map pane. `src: Constraints bullet 5`
- [ ] `C-CN-08` `constraint` The product is responsive web only with no native application. `src: Constraints bullet 7`

## C-DC Deployment contract

- [ ] `C-DC-01` `contract` The app is reachable at `APP_PUBLIC_URL`. `src: Deployment contract bullet 1`
- [ ] `C-DC-02` `literal` The port mapping is `${APP_PUBLIC_PORT}:4173`. `src: Deployment contract bullet 1`
- [ ] `C-DC-03` `contract` The HTTP API is served on the same origin under the `/api` prefix. `src: Deployment contract bullet 2`
- [ ] `C-DC-04` `contract` Login credentials are written to `/app/USER_README.md` as plain `Role:`, `Email:`, `Password:` lines outside any table. `src: Deployment contract bullet 5`
- [ ] `C-DC-05` `contract` The directories `.browser_screenshots/` plus `.downloads/` exist empty at the app root. `src: Deployment contract bullet 6`
- [ ] `C-DC-06` `contract` A production build is served behind a static or preview server. `src: Deployment contract bullet 7`
- [ ] `C-DC-07` `contract` The server keeps running after the session ends. `src: Deployment contract bullet 8`
- [ ] `C-DC-08` `contract` The server is not a child of the shell. `src: Deployment contract bullet 8`
- [ ] `C-DC-09` `contract` The server binds `0.0.0.0`. `src: Deployment contract bullet 9`
- [ ] `C-DC-10` `contract` No backing service is downloaded, installed, compiled or started by the app. `src: Deployment contract bullet 10`
- [ ] `C-DC-11` `literal` `POST /api/auth/signup` takes email, password plus name, returning the account with `role` of `guest`. `src: Deployment contract, API shapes row 1`
- [ ] `C-DC-12` `literal` `POST /api/auth/login` returns `access_token`. `src: Deployment contract, API shapes row 2`
- [ ] `C-DC-13` `literal` `GET /api/events` returns an array carrying `confirmed_count`, `remaining` plus `theme_hex`. `src: Deployment contract, API shapes row 5`
- [ ] `C-DC-14` `literal` `POST /api/registrations` takes `event_slug`, returning `status`, `waitlist_position` plus `ticket_code`. `src: Deployment contract, API shapes row 11`
- [ ] `C-DC-15` `contract` A list endpoint returns a JSON array at the top level. `src: Deployment contract, API shapes para 1`
- [ ] `C-DC-16` `role` A request with no bearer token to a protected endpoint is denied. `src: Deployment contract, API shapes para 2`
- [ ] `C-DC-17` `capability` A business-rule violation is rejected as a client error naming the reason. `src: Deployment contract, API shapes para 2`
- [ ] `C-DC-18` `constraint` A business-rule violation is never a server error, never a silent success. `src: Deployment contract, API shapes para 2`
- [ ] `C-DC-19` `constraint` Registration state held in the app own process instead of the database is a contract violation. `src: Deployment contract, No mocks para`
- [ ] `C-DC-20` `constraint` An in-process mail stub standing in for a send is a contract violation. `src: Deployment contract, No mocks para`
- [ ] `C-DC-21` `contract` The endpoint `GET /api/events/{slug}/registrations.csv` returns the guest list to the owning host as `text/csv`. `src: Deployment contract, API shapes row 11`
- [ ] `C-DC-22` `contract` The endpoint `GET /api/tickets/{ticket_code}` returns one registration to every caller presenting a real code. `src: Deployment contract, API shapes row 18`
- [ ] `C-DC-23` `role` A ticket address carrying a code that never existed meets the not-found response. `src: Deployment contract, API shapes para 3`
- [ ] `C-DC-24` `contract` The endpoint `POST /api/calendars` returns the created calendar with `id`, `slug` plus `owner_account_id`. `src: Deployment contract, API shapes row 20`
- [ ] `C-DC-25` `contract` The endpoint `GET /api/accounts/me` returns `id`, `email`, `display_name`, `handle` plus `role`. `src: Deployment contract, API shapes row 21`
- [ ] `C-DC-26` `contract` The endpoint `PATCH /api/accounts/me` carries no account identifier, so no account names another one. `src: Deployment contract, API shapes para 3`
- [ ] `C-DC-27` `contract` Each event in the events list response carries `time_zone`. `src: Deployment contract, API shapes row 5`

## Pinned literals

| Value | What it is | Item | Stated in |
|---|---|---|---|
| `guest` | the role a signup creates | C-RL-12 | User roles para 2 |
| `deku-demo-pw-2026` | seeded password for every account | C-RL-13 | User roles para 2 |
| `Authorization: Bearer <token>` | the auth header the client sends | C-CF-02 | Core features, Auth para 1 |
| `1` | lowest legal event capacity | C-CF-05 | Core features, Events rule 1 |
| `500` | highest legal event capacity | C-CF-05 | Core features, Events rule 1 |
| `TKT-` | ticket code prefix | C-CF-28 | Core features, Registration rule 10 |
| `SMTP_HOST` | mail server host variable | C-CF-32 | Core features, Mail rule 12 |
| `SMTP_PORT` | mail server port variable | C-CF-32 | Core features, Mail rule 12 |
| `/` | landing route | C-UF-01 | User flow route table row 1 |
| `/discover` | discovery route | C-UF-02 | User flow route table row 2 |
| `/<category>` | category page route | C-UF-03 | User flow route table row 3 |
| `/<slug>` | root resolution route | C-UF-04 | User flow route table row 4 |
| `/home` | guest registrations route | C-UF-05 | User flow route table row 8 |
| `/calendars` | host calendars route | C-UF-06 | User flow route table row 9 |
| `/create` | composer route | C-UF-07 | User flow route table row 10 |
| `/event/<slug>/manage/overview` | event dashboard route | C-UF-08 | User flow route table row 11 |
| `/event/<slug>/manage/guests` | guest list route | C-UF-09 | User flow route table row 12 |
| `/event/<slug>/manage/registration` | registration settings route | C-UF-10 | User flow route table row 13 |
| `/t/<ticket-code>` | ticket route | C-UF-11 | User flow route table row 14 |
| `/login?next=<path>` | unauthenticated redirect target | C-UF-12 | User flow, Entry and redirects |
| `DATABASE_URL` | database connection variable | C-TR-03 | Technical requirements bullet 3 |
| `SMTP_USER` | mail server user variable | C-TR-04 | Technical requirements bullet 4 |
| `SMTP_PASS` | mail server password variable | C-TR-04 | Technical requirements bullet 4 |
| `GET /api/health` | health endpoint | C-TR-07 | Technical requirements bullet 6 |
| `200` | ready response code on health | C-TR-07 | Technical requirements bullet 6 |
| `GET /api/events` | event list endpoint | C-TR-11 | Technical requirements, Search para |
| `limit` | page size query parameter | C-TR-11 | Technical requirements, Search para |
| `offset` | page offset query parameter | C-TR-11 | Technical requirements, Search para |
| `20` | default page size | C-TR-11 | Technical requirements, Search para |
| `10` | requests per minute per account | C-TR-15 | Technical requirements, Validation para |
| `draft` | event state | C-DM-06 | Data model, events para |
| `published` | event state | C-DM-06 | Data model, events para |
| `registration_closed` | event state | C-DM-06 | Data model, events para |
| `cancelled` | event state | C-DM-06 | Data model, events para |
| `pending_approval` | registration status | C-DM-07 | Data model, registrations para |
| `confirmed` | registration status | C-DM-07 | Data model, registrations para |
| `waitlisted` | registration status | C-DM-07 | Data model, registrations para |
| `declined` | registration status | C-DM-07 | Data model, registrations para |
| `cancelled_by_guest` | registration status | C-DM-07 | Data model, registrations para |
| `cancelled_by_host` | registration status | C-DM-07 | Data model, registrations para |
| `checked_in` | registration status | C-DM-07 | Data model, registrations para |
| `api` | reserved root path | C-DM-17 | Data model, Root-namespace para |
| `app` | reserved root path | C-DM-17 | Data model, Root-namespace para |
| `login` | reserved root path | C-DM-17 | Data model, Root-namespace para |
| `signup` | reserved root path | C-DM-17 | Data model, Root-namespace para |
| `home` | reserved root path | C-DM-17 | Data model, Root-namespace para |
| `calendars` | reserved root path | C-DM-17 | Data model, Root-namespace para |
| `create` | reserved root path | C-DM-17 | Data model, Root-namespace para |
| `discover` | reserved root path | C-DM-17 | Data model, Root-namespace para |
| `settings` | reserved root path | C-DM-17 | Data model, Root-namespace para |
| `event` | reserved root path | C-DM-17 | Data model, Root-namespace para |
| `t` | reserved root path | C-DM-17 | Data model, Root-namespace para |
| `family` | category name | C-DM-18 | Data model, Root-namespace para |
| `books` | category name | C-DM-18 | Data model, Root-namespace para |
| `games` | category name | C-DM-18 | Data model, Root-namespace para |
| `tech` | category name | C-DM-18 | Data model, Root-namespace para |
| `food-and-drink` | category name | C-DM-18 | Data model, Root-namespace para |
| `ai` | category name | C-DM-18 | Data model, Root-namespace para |
| `running` | category name | C-DM-18 | Data model, Root-namespace para |
| `arts-and-culture` | category name | C-DM-18 | Data model, Root-namespace para |
| `climate` | category name | C-DM-18 | Data model, Root-namespace para |
| `fitness` | category name | C-DM-18 | Data model, Root-namespace para |
| `wellness` | category name | C-DM-18 | Data model, Root-namespace para |
| `crypto` | category name | C-DM-18 | Data model, Root-namespace para |
| `host@example.com` | seeded host account | C-DM-19 | Data model, Seed data para 1 |
| `host2@example.com` | second seeded host account | C-DM-19 | Data model, Seed data para 1 |
| `guest@example.com` | seeded guest account | C-DM-19 | Data model, Seed data para 1 |
| `guest2@example.com` | second seeded guest account | C-DM-19 | Data model, Seed data para 1 |
| `guest3@example.com` | third seeded guest account | C-DM-19 | Data model, Seed data para 1 |
| `thursday-night-5k` | seeded event slug | C-DM-20 | Data model, Seed data table |
| `3` | capacity of the seeded five kilometre event | C-DM-20 | Data model, Seed data table |
| `riverside-track-session` | seeded event slug | C-DM-21 | Data model, Seed data para 3 |
| `2` | capacity of the seeded track session | C-DM-21 | Data model, Seed data para 3 |
| `sunrise-long-run` | seeded event slug | C-DM-23 | Data model, Seed data para 3 |
| `autumn-book-swap` | seeded event slug | C-DM-24 | Data model, Seed data para 3 |
| `The venue lost its lease.` | seeded cancel reason | C-DM-24 | Data model, Seed data para 3 |
| `${APP_PUBLIC_PORT}:4173` | port mapping | C-DC-02 | Deployment contract bullet 1 |
| `POST /api/auth/signup` | signup endpoint | C-DC-11 | Deployment contract, API shapes row 1 |
| `role` | account role field | C-DC-11 | Deployment contract, API shapes row 1 |
| `POST /api/auth/login` | login endpoint | C-DC-12 | Deployment contract, API shapes row 2 |
| `access_token` | login response field | C-DC-12 | Deployment contract, API shapes row 2 |
| `confirmed_count` | event response field | C-DC-13 | Deployment contract, API shapes row 5 |
| `remaining` | event response field | C-DC-13 | Deployment contract, API shapes row 5 |
| `theme_hex` | event response field | C-DC-13 | Deployment contract, API shapes row 5 |
| `POST /api/registrations` | registration endpoint | C-DC-14 | Deployment contract, API shapes row 11 |
| `event_slug` | registration request field | C-DC-14 | Deployment contract, API shapes row 11 |
| `status` | registration response field | C-DC-14 | Deployment contract, API shapes row 11 |
| `waitlist_position` | registration response field | C-DC-14 | Deployment contract, API shapes row 11 |
| `ticket_code` | registration response field | C-DC-14 | Deployment contract, API shapes row 11 |
| `This event just filled up. You are on the waiting list.` | the filled-up message a late guest reads | C-FE-22 | Front-end specification, Copy deck para 2 |
| `email,display_name,status,waitlist_position,ticket_code` | the header line of the exported guest list | C-TR-24 | Technical requirements, Exports para |
| `winter-reading-night` | the seeded reading-night event slug | C-DM-44 | Data model, Seed data table |
| `Europe/Lisbon` | the time zone of the reading-nights events | C-DM-44 | Data model, Seed data table |
| `riverside-winter-time-trial` | the seeded event closed to registration | C-DM-45 | Data model, Seed data table |

### Referenced but not pinned

| What the instruction calls it | Item | Why it matters |
|---|---|---|
| the SMTP user and password values | C-TR-04 | named as environment variables with no literal given |
| the cover seed of each seeded event | C-DM-05 | the theme colour is pinned but the seed producing it is not |

## Coverage ledger

| Section | Obligation-bearing sentences | Items produced |
|---|---|---|
| Overview | 0 | 3 |
| User roles | 1 | 13 |
| Core features | 6 | 35 |
| User flow | 5 | 19 |
| UI and UX notes | 2 | 13 |
| Technical requirements | 10 | 25 |
| Data model | 6 | 45 |
| Front-end specification | 15 | 48 |
| Constraints | 1 | 8 |
| Deployment contract | 10 | 27 |
