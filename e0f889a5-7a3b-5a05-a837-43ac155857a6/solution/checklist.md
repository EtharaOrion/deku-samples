# Checklist: Vela Electronics Storefront

Source: instruction.md
Sections present: overview, roles, features, flow, uiux, technical, datamodel, frontend, constraints, deployment
Sections absent: buildplan
Items: 440
Unpinned values flagged: 3

## C-OV Overview

- [ ] `C-OV-01` `capability` The app serves a founder letter as the whole of the front page. `src: Overview para 1`
- [ ] `C-OV-02` `capability` The app serves a catalogue of hardware on the same origin as the letter. `src: Overview para 1`
- [ ] `C-OV-03` `capability` The app serves a cart on the same origin as the catalogue. `src: Overview para 1`
- [ ] `C-OV-04` `capability` The app serves a three step checkout. `src: Overview para 1`
- [ ] `C-OV-05` `capability` The app serves the companion desktop application download. `src: Overview para 1`
- [ ] `C-OV-06` `capability` The app serves the whole archive of release notes. `src: Overview para 1`
- [ ] `C-OV-07` `capability` The app serves firmware for each camera. `src: Overview para 1`
- [ ] `C-OV-08` `capability` The app serves a browser page that writes firmware to a camera. `src: Overview para 1`
- [ ] `C-OV-09` `data` The app keeps a serial number as a record in its own right. `src: Overview para 1`
- [ ] `C-OV-10` `constraint` The app holds at most one live owner for a serial number at any moment. `src: Overview para 1`
- [ ] `C-OV-11` `constraint` The app excludes a second seller from the product surface. `src: Constraints`
- [ ] `C-OV-12` `constraint` The app excludes a staff console from the product surface. `src: Constraints`
- [ ] `C-OV-13` `constraint` The app excludes a returns workflow from the product surface. `src: Constraints`

## C-RL User roles

- [ ] `C-RL-01` `role` A signed-out visitor reads the letter. `src: User roles table row 1`
- [ ] `C-RL-02` `role` A signed-out visitor browses the catalogue. `src: User roles table row 1`
- [ ] `C-RL-03` `role` A signed-out visitor holds a cart. `src: User roles table row 1`
- [ ] `C-RL-04` `role` A signed-out visitor completes a checkout as a guest. `src: User roles table row 1`
- [ ] `C-RL-05` `role` A signed-out visitor views one order by an access token. `src: User roles table row 1`
- [ ] `C-RL-06` `role` A signed-out visitor downloads the companion application. `src: User roles table row 1`
- [ ] `C-RL-07` `constraint` A signed-out visitor never lists any order. `src: User roles table row 1`
- [ ] `C-RL-08` `constraint` A signed-out visitor never lists any camera. `src: User roles table row 1`
- [ ] `C-RL-09` `constraint` A signed-out visitor never registers a serial. `src: User roles table row 1`
- [ ] `C-RL-10` `constraint` A signed-out visitor never reads another visitor's cart. `src: User roles table row 1`
- [ ] `C-RL-11` `role` A signed-in customer reads the orders that customer placed. `src: User roles table row 2`
- [ ] `C-RL-12` `role` A signed-in customer registers a serial with no live owner. `src: User roles table row 2`
- [ ] `C-RL-13` `role` A signed-in customer renames a camera that customer owns. `src: User roles table row 2`
- [ ] `C-RL-14` `role` A signed-in customer releases a camera that customer owns. `src: User roles table row 2`
- [ ] `C-RL-15` `constraint` A signed-in customer never reads a camera owned by another customer. `src: User roles table row 2`
- [ ] `C-RL-16` `constraint` A signed-in customer never registers a camera owned by another customer. `src: User roles table row 2`
- [ ] `C-RL-17` `constraint` A signed-in customer never reads another customer's order. `src: User roles table row 2`
- [ ] `C-RL-18` `constraint` The server rejects an unauthorized request rather than serving the request. `src: User roles, authorization paragraph`
- [ ] `C-RL-19` `constraint` The server leaves protected state unchanged after rejecting an unauthorized request. `src: User roles, authorization paragraph`
- [ ] `C-RL-20` `capability` The app offers an open signup route. `src: User roles, signup paragraph`
- [ ] `C-RL-21` `literal` The app signs in `customer@example.com` with the seeded password. `src: User roles, signup paragraph`
- [ ] `C-RL-22` `literal` The app signs in `customer2@example.com` with the seeded password. `src: User roles, signup paragraph`
- [ ] `C-RL-23` `constraint` The app completes a checkout with no account. `src: User roles, signup paragraph`

## C-CF Core features

- [ ] `C-CF-01` `capability` The app exchanges an email with a password for a bearer token. `src: Core features, Auth paragraph`
- [ ] `C-CF-02` `constraint` The app stores a password hashed. `src: Core features, Auth paragraph`
- [ ] `C-CF-03` `constraint` The app rejects a request carrying an expired token. `src: Core features, Auth paragraph`
- [ ] `C-CF-04` `constraint` The app performs no mutation for a request carrying an absent token. `src: Core features, Auth paragraph`
- [ ] `C-CF-05` `constraint` The app rejects a signup for an address already registered. `src: Core features, Auth paragraph`
- [ ] `C-CF-06` `data` The app stores the unit price on a cart line at the moment of the add. `src: Core features rule 1`
- [ ] `C-CF-07` `capability` The app compares a stored cart line price against the variant's current price on every cart read. `src: Core features rule 1`
- [ ] `C-CF-08` `capability` The app renders a notice naming the item whose price differs. `src: Core features rule 1`
- [ ] `C-CF-09` `capability` The app renders the earlier price in the price change notice. `src: Core features rule 1`
- [ ] `C-CF-10` `capability` The app renders the current price in the price change notice. `src: Core features rule 1`
- [ ] `C-CF-11` `constraint` The app never applies a price change to a cart line silently. `src: Core features rule 1`
- [ ] `C-CF-12` `capability` The app re-prices every order line from the current variant price at placement. `src: Core features rule 2`
- [ ] `C-CF-13` `constraint` The app refuses an order whose line price changed since the cart was last shown. `src: Core features rule 2`
- [ ] `C-CF-14` `capability` The app returns the person to a re-priced cart after refusing an order for a price change. `src: Core features rule 2`
- [ ] `C-CF-15` `constraint` The app authorizes the exact integer the final checkout step displayed. `src: Core features rule 2`
- [ ] `C-CF-16` `data` The app lowers `available` for each line at order placement. `src: Core features rule 3`
- [ ] `C-CF-17` `data` The app raises `committed` for each line at order placement. `src: Core features rule 3`
- [ ] `C-CF-18` `constraint` The app allows exactly one of two concurrent checkouts for the last `VELA-A1-YELLOW` to succeed. `src: Core features rule 3`
- [ ] `C-CF-19` `constraint` The app rejects the losing concurrent checkout before any invoice exists. `src: Core features rule 3`
- [ ] `C-CF-20` `constraint` The app never lowers `available` below zero. `src: Core features rule 3`
- [ ] `C-CF-21` `constraint` The app holds the single winner rule under real concurrency rather than in an application-level check alone. `src: Core features rule 3`
- [ ] `C-CF-22` `capability` The app creates one billing account for a confirmed order when none exists for the address. `src: Core features rule 4`
- [ ] `C-CF-23` `capability` The app reuses the existing billing account for a confirmed order when one exists for the address. `src: Core features rule 4`
- [ ] `C-CF-24` `data` The app sets the billing account external key to the order email lowercased. `src: Core features rule 4`
- [ ] `C-CF-25` `data` The app creates one invoice on the billing account for the order total. `src: Core features rule 4`
- [ ] `C-CF-26` `literal` The app records the invoice currency as `USD`. `src: Core features rule 4`
- [ ] `C-CF-27` `capability` The app returns the original order for a repeated idempotency key. `src: Core features rule 4`
- [ ] `C-CF-28` `constraint` The app creates no second billing account for a repeated idempotency key. `src: Core features rule 4`
- [ ] `C-CF-29` `constraint` The app creates no second invoice for a repeated idempotency key. `src: Core features rule 4`
- [ ] `C-CF-30` `capability` The app registers a serial whose device exists with no live owner. `src: Core features rule 5`
- [ ] `C-CF-31` `literal` The app refuses a serial owned by another account with `That camera is registered to someone else.` `src: Core features rule 5`
- [ ] `C-CF-32` `constraint` The app writes no ownership row for a serial owned by another account. `src: Core features rule 5`
- [ ] `C-CF-33` `constraint` The app refuses a serial whose device is blocked. `src: Core features rule 5`
- [ ] `C-CF-34` `capability` The app names a blocked device as blocked in the refusal. `src: Core features rule 5`
- [ ] `C-CF-35` `literal` The app refuses an unknown serial with `We do not recognise that serial number.` `src: Core features rule 5`
- [ ] `C-CF-36` `constraint` The app holds at most one live ownership row per device. `src: Core features rule 6`
- [ ] `C-CF-37` `constraint` The app allows exactly one of two simultaneous registrations of one serial to succeed. `src: Core features rule 6`
- [ ] `C-CF-38` `capability` The app ends an ownership link without granting the link to anyone when ownership is released. `src: Core features rule 6`
- [ ] `C-CF-39` `constraint` The app refuses a flash session whose target image belongs to a different product than the device. `src: Core features rule 7`
- [ ] `C-CF-40` `constraint` The app refuses a flash session whose target minimum firmware is above the version the device reports. `src: Core features rule 7`
- [ ] `C-CF-41` `constraint` The app writes no session row for a refused flash attempt. `src: Core features rule 7`
- [ ] `C-CF-42` `constraint` The app leaves the device firmware version untouched after a refused flash attempt. `src: Core features rule 7`
- [ ] `C-CF-43` `data` The app records the version read back from the device when a flash session completes. `src: Core features rule 8`
- [ ] `C-CF-44` `constraint` The app never records the requested version as the outcome of a flash session. `src: Core features rule 8`
- [ ] `C-CF-45` `constraint` The app leaves the device firmware version unchanged after a failed flash session. `src: Core features rule 8`
- [ ] `C-CF-46` `capability` The app sends exactly one mail for a confirmed order. `src: Core features rule 9`
- [ ] `C-CF-47` `literal` The app sends order mail over SMTP at `SMTP_HOST`. `src: Core features rule 9`
- [ ] `C-CF-48` `literal` The app sends order mail over SMTP at `SMTP_PORT`. `src: Core features rule 9`
- [ ] `C-CF-49` `constraint` The app addresses order mail to the order's email only. `src: Core features rule 9`
- [ ] `C-CF-50` `constraint` The app sets no cc on order mail. `src: Core features rule 9`
- [ ] `C-CF-51` `constraint` The app sets no bcc on order mail. `src: Core features rule 9`
- [ ] `C-CF-52` `literal` The app opens the order mail subject with `Order confirmed:` followed by a space then the order number. `src: Core features rule 9`
- [ ] `C-CF-53` `capability` The app names every line title in the order mail body. `src: Core features rule 9`
- [ ] `C-CF-54` `capability` The app names every line quantity in the order mail body. `src: Core features rule 9`
- [ ] `C-CF-55` `capability` The app formats the order total as US dollars in the order mail body. `src: Core features rule 9`
- [ ] `C-CF-56` `constraint` The app sends no mail for a cart change. `src: Core features rule 9`
- [ ] `C-CF-57` `constraint` The app sends no mail for a device registration. `src: Core features rule 9`
- [ ] `C-CF-58` `constraint` The app sends no mail for a flash session. `src: Core features rule 9`
- [ ] `C-CF-59` `constraint` The app sends no mail for an order that never reaches `confirmed`. `src: Core features rule 9`
- [ ] `C-CF-60` `capability` The app orders the release archive by build number descending. `src: Core features rule 10`
- [ ] `C-CF-61` `constraint` The app never orders the release archive by release date. `src: Core features rule 10`
- [ ] `C-CF-62` `constraint` The app orders two releases sharing one release date deterministically. `src: Core features rule 10`
- [ ] `C-CF-63` `literal` The app reads the billing platform at `PAYMENTS_API_URL`. `src: Core features, billing paragraph`
- [ ] `C-CF-64` `literal` The app authenticates to the billing platform with `PAYMENTS_API_KEY`. `src: Core features, billing paragraph`
- [ ] `C-CF-65` `literal` The app authenticates to the billing platform with `PAYMENTS_API_SECRET`. `src: Core features, billing paragraph`
- [ ] `C-CF-66` `literal` The app authenticates to the billing platform with `PAYMENTS_ADMIN_USER`. `src: Core features, billing paragraph`
- [ ] `C-CF-67` `literal` The app authenticates to the billing platform with `PAYMENTS_ADMIN_PASSWORD`. `src: Core features, billing paragraph`
- [ ] `C-CF-68` `constraint` The app models no card at the billing platform. `src: Core features, billing paragraph`
- [ ] `C-CF-69` `constraint` The app models no decline at the billing platform. `src: Core features, billing paragraph`

## C-UF User flow

- [ ] `C-UF-01` `literal` The app serves the letter at `/`. `src: User flow route table`
- [ ] `C-UF-02` `literal` The app serves the catalogue at `/shop`. `src: User flow route table`
- [ ] `C-UF-03` `literal` The app serves one product at `/shop/<handle>`. `src: User flow route table`
- [ ] `C-UF-04` `literal` The app serves the cart at `/cart`. `src: User flow route table`
- [ ] `C-UF-05` `capability` The app serves the first checkout step at a route of its own. `src: User flow route table`
- [ ] `C-UF-06` `capability` The app serves the second checkout step at a route of its own. `src: User flow route table`
- [ ] `C-UF-07` `literal` The app serves the third checkout step at `/checkout/payment`. `src: User flow route table`
- [ ] `C-UF-08` `literal` The app serves one order by token at `/orders/<number>`. `src: User flow route table`
- [ ] `C-UF-09` `literal` The app serves the download page at `/downloads`. `src: User flow route table`
- [ ] `C-UF-10` `literal` The app serves one release at `/downloads/<version>`. `src: User flow route table`
- [ ] `C-UF-11` `literal` The app serves the browser firmware installer at `/doctor`. `src: User flow route table`
- [ ] `C-UF-12` `literal` The app serves account entry at `/sign-in`. `src: User flow route table`
- [ ] `C-UF-13` `literal` The app serves account creation at `/sign-up`. `src: User flow route table`
- [ ] `C-UF-14` `literal` The app serves the account overview at `/account`. `src: User flow route table`
- [ ] `C-UF-15` `literal` The app serves order history at `/account/orders`. `src: User flow route table`
- [ ] `C-UF-16` `literal` The app serves the camera grid at `/account/cameras`. `src: User flow route table`
- [ ] `C-UF-17` `literal` The app serves one camera at `/account/cameras/<serial>`. `src: User flow route table`
- [ ] `C-UF-18` `constraint` The app lands a signed-out request for an account route on the sign-in route. `src: User flow, entry paragraph`
- [ ] `C-UF-19` `capability` The app carries the intended path through the sign-in route. `src: User flow, entry paragraph`
- [ ] `C-UF-20` `capability` The app returns the person to the intended path after signing in. `src: User flow, entry paragraph`
- [ ] `C-UF-21` `capability` The app lands a sign-in with no intended path on the account overview. `src: User flow, entry paragraph`
- [ ] `C-UF-22` `capability` The app returns the person to the letter after signing out. `src: User flow, entry paragraph`
- [ ] `C-UF-23` `constraint` The app refuses an action whose token expired mid-action. `src: User flow, entry paragraph`
- [ ] `C-UF-24` `constraint` The app leaves state unchanged for an action whose token expired mid-action. `src: User flow, entry paragraph`
- [ ] `C-UF-25` `constraint` The app answers another customer's order number as not found. `src: User flow, entry paragraph`
- [ ] `C-UF-26` `constraint` The app answers another customer's serial as not found. `src: User flow, entry paragraph`
- [ ] `C-UF-27` `literal` The app renders the letter title `the table`. `src: User flow journey 1`
- [ ] `C-UF-28` `literal` The app renders the letter dateline `June 1, 2026`. `src: User flow journey 1`
- [ ] `C-UF-29` `data` The app renders sixteen letter paragraphs. `src: User flow journey 1`
- [ ] `C-UF-30` `literal` The app renders the letter closing line `See you soon.` `src: User flow journey 1`
- [ ] `C-UF-31` `capability` The app reaches the catalogue from the footer link on the letter. `src: User flow journey 1`
- [ ] `C-UF-32` `literal` The app renders a cart subtotal of `$378.00` for one Cricket in Graphite plus one Travel Case. `src: User flow journey 2`
- [ ] `C-UF-33` `literal` The app renders an order tax line of `$37.80` for that cart with standard delivery. `src: User flow journey 3`
- [ ] `C-UF-34` `literal` The app renders an order total of `$415.80` for that cart with standard delivery. `src: User flow journey 3`
- [ ] `C-UF-35` `literal` The app allocates the order number `VE-2026-0002` to the first order placed after seeding. `src: User flow journey 3`
- [ ] `C-UF-36` `literal` The app renders the confirmation `Order VE-2026-0002 is confirmed. We have emailed customer@example.com.` `src: User flow journey 3`
- [ ] `C-UF-37` `literal` The app registers the serial `VA2609KTMHX4` from the camera grid register row. `src: User flow journey 4`
- [ ] `C-UF-38` `literal` The app renders `Not yet connected` on a camera card whose device never reported a version. `src: User flow journey 4`
- [ ] `C-UF-39` `literal` The app renders the empty catalogue state `Nothing is on the table right now.` `src: User flow, states paragraph`
- [ ] `C-UF-40` `literal` The app renders the empty cart state `Your cart is empty.` `src: User flow, states paragraph`
- [ ] `C-UF-41` `literal` The app renders the empty camera state `No cameras registered yet.` `src: User flow, states paragraph`
- [ ] `C-UF-42` `ui` The app reserves the space content will occupy in every loading state. `src: User flow, states paragraph`
- [ ] `C-UF-43` `constraint` The app renders an error as a page or an inline message rather than a blank screen. `src: User flow, states paragraph`

## C-UX UI/UX notes

- [ ] `C-UX-01` `ui` The app presents the letter as the only editorial surface. `src: UI/UX notes para 1`
- [ ] `C-UX-02` `ui` The app presents every surface after the letter as information-dense. `src: UI/UX notes para 1`
- [ ] `C-UX-03` `ui` The app presents every surface after the letter free of ornament. `src: UI/UX notes para 1`
- [ ] `C-UX-04` `ui` The app carries one grotesque family across the whole product. `src: UI/UX notes para 2`
- [ ] `C-UX-05` `ui` The app sets figures in tabular numerals wherever figures stack. `src: UI/UX notes para 2`
- [ ] `C-UX-06` `constraint` The app carries no italic anywhere. `src: UI/UX notes para 2`
- [ ] `C-UX-07` `ui` The app moves every transition at one speed. `src: UI/UX notes para 3`
- [ ] `C-UX-08` `ui` The app renders motion as mechanical rather than as performance. `src: UI/UX notes para 3`
- [ ] `C-UX-09` `ui` The app darkens the front page in exact proportion to scroll position. `src: UI/UX notes para 3`
- [ ] `C-UX-10` `ui` The app reports a firmware write figure that came from the device. `src: UI/UX notes para 3`
- [ ] `C-UX-11` `constraint` The app removes the film under a reduced motion preference. `src: UI/UX notes para 3`
- [ ] `C-UX-12` `constraint` The app keeps the front page darkening under a reduced motion preference. `src: UI/UX notes para 3`
- [ ] `C-UX-13` `constraint` The app never signals a state change by motion alone. `src: UI/UX notes para 3`
- [ ] `C-UX-14` `ui` The app renders the letter on a dark ground. `src: UI/UX notes para 4`
- [ ] `C-UX-15` `ui` The app renders every commerce surface on a light ground. `src: UI/UX notes para 4`
- [ ] `C-UX-16` `constraint` The app shows the one accent at most once per screen. `src: UI/UX notes para 4`
- [ ] `C-UX-17` `constraint` The app never uses the accent as a background for text. `src: UI/UX notes para 4`
- [ ] `C-UX-18` `constraint` The app gives a failure meaning a colour that appears nowhere else. `src: UI/UX notes para 4`
- [ ] `C-UX-19` `constraint` The app states success in words before colouring success. `src: UI/UX notes para 4`
- [ ] `C-UX-20` `ui` The app sets every gap as a multiple of one base unit. `src: Front-end specification, type and layout`
- [ ] `C-UX-21` `ui` The app carries exactly one shadow across the whole product. `src: Front-end specification, type and layout`
- [ ] `C-UX-22` `ui` The app renders a persistent left rail on every surface except the letter. `src: UI/UX notes para 5`
- [ ] `C-UX-23` `ui` The app collapses the rail to one control at a narrow viewport. `src: UI/UX notes para 5`
- [ ] `C-UX-24` `constraint` The app never scrolls sideways at any width. `src: UI/UX notes para 5`
- [ ] `C-UX-25` `contract` The app meets WCAG AA contrast for text against the ground behind the text. `src: UI/UX notes para 6`
- [ ] `C-UX-26` `contract` The app gives every interactive element a visible focus ring. `src: UI/UX notes para 6`
- [ ] `C-UX-27` `contract` The app reaches every control by keyboard navigation in reading order. `src: UI/UX notes para 6`
- [ ] `C-UX-28` `contract` The app labels every icon-only control with text. `src: UI/UX notes para 6`
- [ ] `C-UX-29` `contract` The app never carries meaning by colour alone. `src: UI/UX notes para 6`
- [ ] `C-UX-30` `contract` The app places a skip link as the first focusable element of every page. `src: UI/UX notes para 6`
- [ ] `C-UX-31` `constraint` The app hides the film from assistive technology. `src: Front-end specification, the letter`
- [ ] `C-UX-32` `constraint` The app scrolls the page when a pointer drags on the film. `src: Front-end specification, the letter`

## C-TR Technical requirements

- [ ] `C-TR-01` `contract` The app renders every route as server-rendered markup on first paint. `src: Technical requirements para 1`
- [ ] `C-TR-02` `contract` The app serves the HTTP API on the app origin under the `/api` prefix. `src: Technical requirements para 1`
- [ ] `C-TR-03` `literal` The app reads the datastore connection from `DATABASE_URL`. `src: Technical requirements para 1`
- [ ] `C-TR-04` `literal` The app reads the mail host from `SMTP_HOST`. `src: Technical requirements para 1`
- [ ] `C-TR-05` `literal` The app reads the mail port from `SMTP_PORT`. `src: Technical requirements para 1`
- [ ] `C-TR-06` `literal` The app reads the mail user from `SMTP_USER`. `src: Technical requirements para 1`
- [ ] `C-TR-07` `literal` The app reads the mail password from `SMTP_PASS`. `src: Technical requirements para 1`
- [ ] `C-TR-08` `constraint` The app reads every host from the environment rather than from a hardcoded value. `src: Technical requirements para 1`
- [ ] `C-TR-09` `constraint` The app introduces no second datastore. `src: Technical requirements para 2`
- [ ] `C-TR-10` `constraint` The app introduces no object store. `src: Technical requirements para 2`
- [ ] `C-TR-11` `constraint` The app introduces no external identity provider. `src: Technical requirements para 2`
- [ ] `C-TR-12` `constraint` The app introduces no third party mail vendor. `src: Technical requirements para 2`
- [ ] `C-TR-13` `contract` The app hashes a stored password with a modern password hash. `src: Technical requirements para 3`
- [ ] `C-TR-14` `literal` The app answers `GET /api/health` with `200` once ready. `src: Technical requirements para 3`
- [ ] `C-TR-15` `contract` The app emits one structured log line per request. `src: Technical requirements para 3`
- [ ] `C-TR-16` `data` The app carries a request identifier on every log line. `src: Technical requirements para 3`
- [ ] `C-TR-17` `data` The app carries the same request identifier in every error response body. `src: Technical requirements para 3`
- [ ] `C-TR-18` `constraint` The app holds money as an integer count of minor units in every layer. `src: Technical requirements para 4`
- [ ] `C-TR-19` `constraint` The app holds no floating point money anywhere. `src: Technical requirements para 4`
- [ ] `C-TR-20` `data` The app computes order tax as ten percent of the line subtotal truncated toward zero. `src: Technical requirements para 4`
- [ ] `C-TR-21` `literal` The app computes a tax of `3780` for a subtotal of `37800`. `src: Technical requirements para 4`
- [ ] `C-TR-22` `constraint` The app excludes shipment protection from tax. `src: Technical requirements para 4`
- [ ] `C-TR-23` `constraint` The app holds every timestamp in UTC. `src: Technical requirements para 4`
- [ ] `C-TR-24` `data` The app keeps an order total equal to the line totals plus shipping plus tax minus discount. `src: Technical requirements para 5`
- [ ] `C-TR-25` `data` The app sends the same order total to the billing platform as a decimal. `src: Technical requirements para 5`
- [ ] `C-TR-26` `capability` The app serves a firmware manifest for one product at a time. `src: Technical requirements para 6`
- [ ] `C-TR-27` `constraint` The app never offers a manifest entry outside the general channel to a device that has not opted in. `src: Technical requirements para 6`
- [ ] `C-TR-28` `constraint` The app allows exactly one of two requests racing to write one row to win. `src: Technical requirements, simultaneous requests`
- [ ] `C-TR-29` `literal` The app answers the loser of a race with a `409` conflict response. `src: Technical requirements, simultaneous requests`
- [ ] `C-TR-30` `constraint` The app returns the same order for a replayed idempotency key. `src: Technical requirements, simultaneous requests`
- [ ] `C-TR-31` `literal` The app writes structured logs to `stdout` as one line of JSON per request. `src: Technical requirements, structured logs`
- [ ] `C-TR-32` `literal` The app carries a `request_id` on every structured log line. `src: Technical requirements, structured logs`
- [ ] `C-TR-33` `literal` The app accepts a `page_size` parameter on every list endpoint. `src: Technical requirements, paginated reads`
- [ ] `C-TR-34` `literal` The app defaults `page_size` to `20`. `src: Technical requirements, paginated reads`
- [ ] `C-TR-35` `literal` The app caps `page_size` at `100`. `src: Technical requirements, paginated reads`
- [ ] `C-TR-36` `literal` The app carries `next_cursor` beside the data array on every list response. `src: Technical requirements, paginated reads`
- [ ] `C-TR-37` `literal` The app carries a `has_more` flag on every list response. `src: Technical requirements, paginated reads`
- [ ] `C-TR-38` `constraint` The app pages by an opaque cursor over a stable ordering key rather than by a row offset. `src: Technical requirements, paginated reads`

## C-DM Data model

- [ ] `C-DM-01` `literal` The app accepts the password `deku-demo-pw-2026` at login for every seeded account. `src: Data model, password paragraph`
- [ ] `C-DM-02` `constraint` The app writes the seeded password into `/app/USER_README.md` beside each account. `src: Data model, password paragraph`
- [ ] `C-DM-03` `data` The app stores a customer email uniquely, compared case-insensitively. `src: Data model, customer bullet`
- [ ] `C-DM-04` `data` The app stores a product handle uniquely. `src: Data model, product bullet`
- [ ] `C-DM-05` `data` The app stores a product status drawn from `active` or `discontinued`. `src: Data model, product bullet`
- [ ] `C-DM-06` `data` The app stores a variant SKU uniquely. `src: Data model, variant bullet`
- [ ] `C-DM-07` `data` The app stores a variant price as an integer count of minor units. `src: Data model, variant bullet`
- [ ] `C-DM-08` `constraint` The app never lowers an inventory level below zero under a deny policy. `src: Data model, inventory bullet`
- [ ] `C-DM-09` `data` The app stores a product description as a list of typed blocks. `src: Data model, product block bullet`
- [ ] `C-DM-10` `constraint` The app stores no product description as a blob of markup. `src: Data model, product block bullet`
- [ ] `C-DM-11` `data` The app stores a cart token uniquely as an opaque value. `src: Data model, cart bullet`
- [ ] `C-DM-12` `constraint` The app limits a cart line quantity to the range 1 to 10. `src: Data model, cart line bullet`
- [ ] `C-DM-13` `constraint` The app holds one cart line per cart per variant. `src: Data model, cart line bullet`
- [ ] `C-DM-14` `data` The app allocates an order number in the form `VE-<year>-<four digits>` in sequence. `src: Data model, order bullet`
- [ ] `C-DM-15` `data` The app stores an order status drawn from `pending`, `confirmed` or `cancelled`. `src: Data model, order bullet`
- [ ] `C-DM-16` `data` The app stores an order payment status drawn from `unpaid` or `invoiced`. `src: Data model, order bullet`
- [ ] `C-DM-17` `data` The app stores a snapshot of the line title on an order line. `src: Data model, order line bullet`
- [ ] `C-DM-18` `data` The app stores a snapshot of the line SKU on an order line. `src: Data model, order line bullet`
- [ ] `C-DM-19` `constraint` The app never deletes a variant that an order line references. `src: Data model, order line bullet`
- [ ] `C-DM-20` `data` The app stores a device serial uniquely, compared case-insensitively. `src: Data model, device bullet`
- [ ] `C-DM-21` `data` The app stores a device status drawn from `manufactured`, `sold`, `registered` or `blocked`. `src: Data model, device bullet`
- [ ] `C-DM-22` `constraint` The app holds at most one ownership row per device whose release timestamp is empty. `src: Data model, ownership bullet`
- [ ] `C-DM-23` `data` The app stores an application release build uniquely. `src: Data model, release bullet`
- [ ] `C-DM-24` `literal` The app groups release notes under `Newly Added`, `Improvements`, `Bug Fixes`, `Known Issues` in that order. `src: Data model, release bullet`
- [ ] `C-DM-25` `constraint` The app adds no fifth release note group. `src: Data model, release bullet`
- [ ] `C-DM-26` `data` The app stores a firmware build uniquely per product. `src: Data model, firmware bullet`
- [ ] `C-DM-27` `data` The app stores a flash session state drawn from `started`, `succeeded` or `failed`. `src: Data model, flash session bullet`
- [ ] `C-DM-28` `constraint` The app holds at most one flash session in the started state per device. `src: Data model, flash session bullet`
- [ ] `C-DM-29` `data` The app derives a variant availability state rather than storing the state. `src: Data model, derived paragraph`
- [ ] `C-DM-30` `data` The app derives whether newer firmware exists for a device rather than storing the answer. `src: Data model, derived paragraph`
- [ ] `C-DM-31` `literal` The app seeds the customer `customer@example.com` named Iris Vantaa. `src: Data model, seed data`
- [ ] `C-DM-32` `literal` The app seeds the customer `customer2@example.com` named Rune Halden. `src: Data model, seed data`
- [ ] `C-DM-33` `literal` The app seeds the product `Vela A1` at handle `flagship` with a support date of `2032-06-01`. `src: Data model, seed data`
- [ ] `C-DM-34` `literal` The app seeds the variant `VELA-A1-GRAPHITE` at `89900` minor units with `4` available. `src: Data model, seed data`
- [ ] `C-DM-35` `literal` The app seeds the variant `VELA-A1-SAND` at `89900` minor units with `6` available. `src: Data model, seed data`
- [ ] `C-DM-36` `literal` The app seeds the variant `VELA-A1-YELLOW` at `89900` minor units with `1` available. `src: Data model, seed data`
- [ ] `C-DM-37` `literal` The app seeds the product `Vela Cricket` at handle `compact`. `src: Data model, seed data`
- [ ] `C-DM-38` `literal` The app seeds the variant `VELA-CRICKET-GRAPHITE` at `29900` minor units with `12` available. `src: Data model, seed data`
- [ ] `C-DM-39` `literal` The app seeds the variant `VELA-CRICKET-YELLOW` at `29900` minor units with `0` available. `src: Data model, seed data`
- [ ] `C-DM-40` `literal` The app seeds the product `Monitor Mount` at handle `mount` as discontinued with a support date of `2029-09-01`. `src: Data model, seed data`
- [ ] `C-DM-41` `literal` The app seeds the variant `VELA-CASE-STD` at `7900` minor units with `15` available. `src: Data model, seed data`
- [ ] `C-DM-42` `literal` The app seeds the variant `VELA-CABLE-1M` at `1900` minor units. `src: Data model, seed data`
- [ ] `C-DM-43` `literal` The app seeds the variant `VELA-CABLE-2M` at `2400` minor units. `src: Data model, seed data`
- [ ] `C-DM-44` `literal` The app seeds the protection rung `VELA-PROTECT-2` at `298` minor units for a subtotal from `10000` to `49999`. `src: Data model, seed data`
- [ ] `C-DM-45` `constraint` The app leaves the shipment protection toggle unticked by default. `src: Data model, seed data`
- [ ] `C-DM-46` `literal` The app seeds a `Standard` delivery method at `0` minor units. `src: Data model, seed data`
- [ ] `C-DM-47` `literal` The app seeds an `Express` delivery method at `2500` minor units. `src: Data model, seed data`
- [ ] `C-DM-48` `constraint` The app preselects no delivery method. `src: Data model, seed data`
- [ ] `C-DM-49` `literal` The app seeds the order `VE-2026-0001` for `customer@example.com` at a total of `32890` minor units. `src: Data model, seed data`
- [ ] `C-DM-50` `literal` The app seeds the device `VC2609PVDA7Q` owned by `customer@example.com` reporting firmware `7.0`. `src: Data model, seed data`
- [ ] `C-DM-51` `literal` The app seeds the device `VA2609NRWB2Z` owned by `customer2@example.com`. `src: Data model, seed data`
- [ ] `C-DM-52` `literal` The app seeds the device `VA2609KTMHX4` with no owner. `src: Data model, seed data`
- [ ] `C-DM-53` `literal` The app seeds the device `VC2609WJ3DKT` as blocked. `src: Data model, seed data`
- [ ] `C-DM-54` `data` The app accepts a serial of exactly twelve characters. `src: Data model, serial paragraph`
- [ ] `C-DM-55` `literal` The app draws the last six serial characters from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`. `src: Data model, serial paragraph`
- [ ] `C-DM-56` `constraint` The app refuses a serial of the wrong shape before any lookup happens. `src: Data model, serial paragraph`
- [ ] `C-DM-57` `literal` The app seeds the release `2.0.0` at build `2000` released on `2024-12-11`. `src: Data model, seed data`
- [ ] `C-DM-58` `literal` The app seeds the release artifact `arranger-2.0.0.dmg` at `154876459` bytes. `src: Data model, seed data`
- [ ] `C-DM-59` `literal` The app seeds the release `1.4.4` at build `1440` released on `2024-06-26`. `src: Data model, seed data`
- [ ] `C-DM-60` `literal` The app seeds the release `1.4.3` at build `1430` released on `2024-05-20`. `src: Data model, seed data`
- [ ] `C-DM-61` `literal` The app seeds the release `1.4.2` at build `1420` released on `2024-05-20`. `src: Data model, seed data`
- [ ] `C-DM-62` `literal` The app seeds the digest `9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2` on release `2.0.0`. `src: Data model, seed data`
- [ ] `C-DM-63` `literal` The app seeds Cricket firmware `7.2` at build `720` with a minimum firmware of `6.11`. `src: Data model, seed data`
- [ ] `C-DM-64` `literal` The app seeds Cricket firmware `7.0` at build `700`. `src: Data model, seed data`
- [ ] `C-DM-65` `literal` The app seeds Cricket firmware `6.11` at build `611`. `src: Data model, seed data`
- [ ] `C-DM-66` `literal` The app seeds A1 firmware `2.4` at build `240` with a minimum firmware of `2.0`. `src: Data model, seed data`
- [ ] `C-DM-67` `constraint` The app seeds idempotently so a restart duplicates no row. `src: Data model, seed data`

## C-FE Front-end specification

- [ ] `C-FE-01` `ui` The app renders the letter as one document carrying a two word lowercase title. `src: Front-end specification, the letter`
- [ ] `C-FE-02` `constraint` The app renders no navigation on the letter beyond a wordmark. `src: Front-end specification, the letter`
- [ ] `C-FE-03` `constraint` The app renders no price on the letter. `src: Front-end specification, the letter`
- [ ] `C-FE-04` `constraint` The app renders no form on the letter. `src: Front-end specification, the letter`
- [ ] `C-FE-05` `ui` The app places the film stage behind the writing at the lowest layer. `src: Front-end specification, the letter`
- [ ] `C-FE-06` `ui` The app places a still frame above the film that dissolves once playback can begin. `src: Front-end specification, the letter`
- [ ] `C-FE-07` `ui` The app places a faint animated speckle above the still frame. `src: Front-end specification, the letter`
- [ ] `C-FE-08` `ui` The app darkens the stage from the bottom upward as the reader scrolls. `src: Front-end specification, the letter`
- [ ] `C-FE-09` `ui` The app removes the film entirely once the darkening panel is fully drawn. `src: Front-end specification, the letter`
- [ ] `C-FE-10` `constraint` The app introduces no layer beyond the named stacking set on the letter. `src: Front-end specification, the letter`
- [ ] `C-FE-11` `constraint` The app leaves the darkening at its current value when the reader stops scrolling. `src: Front-end specification, the letter`
- [ ] `C-FE-12` `constraint` The app lifts the darkening in proportion when the reader scrolls back up. `src: Front-end specification, the letter`
- [ ] `C-FE-13` `constraint` The app gives the letter writing a faint shadow at every width. `src: Front-end specification, the letter`
- [ ] `C-FE-14` `ui` The app carries every letter paragraph once in normal flow. `src: Front-end specification, the letter`
- [ ] `C-FE-15` `ui` The app carries every letter paragraph a second time in an inert driven layer. `src: Front-end specification, the letter`
- [ ] `C-FE-16` `constraint` The app hides the driven letter layer from assistive technology. `src: Front-end specification, the letter`
- [ ] `C-FE-17` `constraint` The app never makes the driven layer the only copy of a paragraph. `src: Front-end specification, the letter`
- [ ] `C-FE-18` `ui` The app renders the letter as a narrow column beside the film on a wide viewport. `src: Front-end specification, the letter`
- [ ] `C-FE-19` `ui` The app renders each letter paragraph as a half width block on a narrow viewport. `src: Front-end specification, the letter`
- [ ] `C-FE-20` `ui` The app alternates letter blocks between the two halves on a narrow viewport. `src: Front-end specification, the letter`
- [ ] `C-FE-21` `constraint` The app starts the film only after the still frame has painted. `src: Front-end specification, the letter`
- [ ] `C-FE-22` `constraint` The app plays the film with no sound. `src: Front-end specification, the letter`
- [ ] `C-FE-23` `constraint` The app pauses the film when the document is hidden. `src: Front-end specification, the letter`
- [ ] `C-FE-24` `constraint` The app refuses to start the film under a reduced motion preference. `src: Front-end specification, the letter`
- [ ] `C-FE-25` `constraint` The app keeps the letter readable at every rung of the film fallback ladder. `src: Front-end specification, the letter`
- [ ] `C-FE-26` `ui` The app draws the company name in the footer canvas as the gaps between dots. `src: Front-end specification, the letter`
- [ ] `C-FE-27` `ui` The app brightens footer dots near the pointer with falloff by distance. `src: Front-end specification, the letter`
- [ ] `C-FE-28` `ui` The app decays a brightened footer dot back to rest over about a second. `src: Front-end specification, the letter`
- [ ] `C-FE-29` `constraint` The app stops the footer canvas loop when no dot is above rest with the pointer away. `src: Front-end specification, the letter`
- [ ] `C-FE-30` `constraint` The app renders the footer bottom row alone when a drawing context cannot be acquired. `src: Front-end specification, the letter`
- [ ] `C-FE-31` `literal` The app renders the footer string `All rights reserved`. `src: Front-end specification, the letter`
- [ ] `C-FE-32` `literal` The app renders six footer links opening with `Shop`. `src: Front-end specification, the letter`
- [ ] `C-FE-33` `ui` The app renders a left rail carrying the shop, downloads, installer entries. `src: Front-end specification, the shell`
- [ ] `C-FE-34` `ui` The app adds account entries to the left rail once a customer is signed in. `src: Front-end specification, the shell`
- [ ] `C-FE-35` `contract` The app marks the current rail entry with the current-page state programmatically. `src: Front-end specification, the shell`
- [ ] `C-FE-36` `contract` The app names the cart control accessibly with the item count. `src: Front-end specification, the shell`
- [ ] `C-FE-37` `ui` The app shows the cart badge only above a count of zero. `src: Front-end specification, the shell`
- [ ] `C-FE-38` `literal` The app renders the cart badge as `99+` above ninety-nine. `src: Front-end specification, the shell`
- [ ] `C-FE-39` `ui` The app orders the catalogue grid by editorial position. `src: Front-end specification, the catalogue`
- [ ] `C-FE-40` `constraint` The app offers no search on the catalogue. `src: Front-end specification, the catalogue`
- [ ] `C-FE-41` `constraint` The app offers no filter on the catalogue. `src: Front-end specification, the catalogue`
- [ ] `C-FE-42` `literal` The app renders a lowest price on a card whose variants differ as `From `. `src: Front-end specification, the catalogue`
- [ ] `C-FE-43` `ui` The app renders a product option group as radio controls for five or fewer choices. `src: Front-end specification, the catalogue`
- [ ] `C-FE-44` `ui` The app limits the quantity stepper to the lesser of ten or the available stock. `src: Front-end specification, the catalogue`
- [ ] `C-FE-45` `ui` The app renders product specifications as a table with figures aligned. `src: Front-end specification, the catalogue`
- [ ] `C-FE-46` `capability` The app replaces history when a product option changes the address parameter. `src: Front-end specification, the catalogue`
- [ ] `C-FE-47` `constraint` The app renders the default variant for an address parameter naming an absent variant. `src: Front-end specification, the catalogue`
- [ ] `C-FE-48` `literal` The app renders `Only 4 left` beside an enabled control for `VELA-A1-GRAPHITE` at four available, naming the remaining count at ten or fewer. `src: Front-end specification, the catalogue`
- [ ] `C-FE-49` `literal` The app labels a sold out buy control `Sold out`. `src: Front-end specification, the catalogue`
- [ ] `C-FE-50` `ui` The app renders the discontinued support note naming the support end date. `src: Front-end specification, the catalogue`
- [ ] `C-FE-51` `ui` The app edits a cart quantity in place on the cart route. `src: Front-end specification, the cart`
- [ ] `C-FE-52` `capability` The app reverts an optimistic quantity change after a server rejection. `src: Front-end specification, the cart`
- [ ] `C-FE-53` `ui` The app renders the cart estimate note above the totals. `src: Front-end specification, the cart`
- [ ] `C-FE-54` `ui` The app renders the protection toggle label naming the rung price. `src: Front-end specification, the cart`
- [ ] `C-FE-55` `constraint` The app renders a price change notice above the cart lines as persistent. `src: Front-end specification, the cart`
- [ ] `C-FE-56` `constraint` The app offers no dismissal on a price change notice. `src: Front-end specification, the cart`
- [ ] `C-FE-57` `ui` The app gives each checkout step an address of its own. `src: Front-end specification, the cart`
- [ ] `C-FE-58` `constraint` The app preserves every entered checkout value across a back navigation. `src: Front-end specification, the cart`
- [ ] `C-FE-59` `constraint` The app preserves every entered checkout value across a reload. `src: Front-end specification, the cart`
- [ ] `C-FE-60` `constraint` The app leaves the marketing consent control unticked. `src: Front-end specification, the cart`
- [ ] `C-FE-61` `constraint` The app disables no field during the load of another field. `src: Front-end specification, the cart`
- [ ] `C-FE-62` `literal` The app renders the placing state `Placing your order`. `src: Front-end specification, the cart`
- [ ] `C-FE-63` `ui` The app renders the account offer control on the confirmation route. `src: Front-end specification, the cart`
- [ ] `C-FE-64` `literal` The app opens the download route with `Arranger requires macOS 13.0 or later. Download the app below.` `src: Front-end specification, the archive`
- [ ] `C-FE-65` `literal` The app labels the primary download control `Download Arranger 2.0.0`. `src: Front-end specification, the archive`
- [ ] `C-FE-66` `ui` The app renders the artifact byte size beside the primary download control. `src: Front-end specification, the archive`
- [ ] `C-FE-67` `ui` The app renders the artifact digest beside the primary download control. `src: Front-end specification, the archive`
- [ ] `C-FE-68` `constraint` The app never disables the primary download control. `src: Front-end specification, the archive`
- [ ] `C-FE-69` `literal` The app renders `Arranger is a macOS application.` for a reader on another platform. `src: Front-end specification, the archive`
- [ ] `C-FE-70` `literal` The app labels the firmware download control `Download Vela Cricket Firmware 7.2`. `src: Front-end specification, the archive`
- [ ] `C-FE-71` `literal` The app labels the web install path `Firmware install (web-based)`. `src: Front-end specification, the archive`
- [ ] `C-FE-72` `ui` The app renders the web install warning beside the web install path. `src: Front-end specification, the archive`
- [ ] `C-FE-73` `constraint` The app never renders the web install path as the primary control. `src: Front-end specification, the archive`
- [ ] `C-FE-74` `literal` The app renders each release dateline as `Released on ` followed by the date. `src: Front-end specification, the archive`
- [ ] `C-FE-75` `literal` The app closes each release block with `The Vela team.` `src: Front-end specification, the archive`
- [ ] `C-FE-76` `ui` The app expands only the newest release on arrival at the download route. `src: Front-end specification, the archive`
- [ ] `C-FE-77` `constraint` The app operates the release disclosure with no scripting. `src: Front-end specification, the archive`
- [ ] `C-FE-78` `constraint` The app carries the whole archive in the markup whatever the collapse state. `src: Front-end specification, the archive`
- [ ] `C-FE-79` `ui` The app opens the installer route by stating whether the browser can talk to a device. `src: Front-end specification, the installer`
- [ ] `C-FE-80` `constraint` The app shows no control that cannot work where the device capability is absent. `src: Front-end specification, the installer`
- [ ] `C-FE-81` `ui` The app renders the installer warning body before any connect control. `src: Front-end specification, the installer`
- [ ] `C-FE-82` `literal` The app labels the warning acceptance control `I understand`. `src: Front-end specification, the installer`
- [ ] `C-FE-83` `constraint` The app keeps the connect control unavailable until the warning is accepted. `src: Front-end specification, the installer`
- [ ] `C-FE-84` `constraint` The app never signals unavailability by colour alone. `src: Front-end specification, the installer`
- [ ] `C-FE-85` `ui` The app states the model, the serial, the current version once a camera is identified. `src: Front-end specification, the installer`
- [ ] `C-FE-86` `capability` The app states the reason when refusing an image for a different model. `src: Front-end specification, the installer`
- [ ] `C-FE-87` `literal` The app renders the writing line `Writing, <percent>. Do not unplug your camera.` `src: Front-end specification, the installer`
- [ ] `C-FE-88` `constraint` The app offers no cancel during a firmware write. `src: Front-end specification, the installer`
- [ ] `C-FE-89` `literal` The app closes a completed write with `Done. Your camera is running 7.2.` `src: Front-end specification, the installer`
- [ ] `C-FE-90` `ui` The app ends a failure with the camera gone by reassuring the reader. `src: Front-end specification, the installer`
- [ ] `C-FE-91` `contract` The app carries the installer step through one polite live region. `src: Front-end specification, the installer`
- [ ] `C-FE-92` `constraint` The app repairs a camera registered to another account. `src: Front-end specification, the installer`
- [ ] `C-FE-93` `ui` The app orders the account overview with cameras before orders. `src: Front-end specification, the account`
- [ ] `C-FE-94` `literal` The app renders `Update available` on a camera whose firmware is behind. `src: Front-end specification, the account`
- [ ] `C-FE-95` `ui` The app renders an expired warranty as a neutral state. `src: Front-end specification, the account`
- [ ] `C-FE-96` `ui` The app registers a serial from a row at the top of the camera grid. `src: Front-end specification, the account`
- [ ] `C-FE-97` `constraint` The app stores a serial unformatted whatever grouping the field displays. `src: Front-end specification, the account`
- [ ] `C-FE-98` `constraint` The app never names the other owner when refusing an owned serial. `src: Front-end specification, the account`
- [ ] `C-FE-99` `ui` The app fades a registration confirmation on its own. `src: Front-end specification, the account`
- [ ] `C-FE-100` `constraint` The app never fades a price change notice on its own. `src: Front-end specification, the account`
- [ ] `C-FE-101` `literal` The app labels the release control `Remove from my account`. `src: Front-end specification, the account`
- [ ] `C-FE-102` `ui` The app renders one chip combining order, payment, fulfilment state into a human phrase. `src: Front-end specification, the account`
- [ ] `C-FE-103` `ui` The app renders the serial numbers allocated to each camera line on an order. `src: Front-end specification, the account`
- [ ] `C-FE-104` `constraint` The app writes interface copy with no exclamation mark anywhere. `src: Front-end specification, copy`
- [ ] `C-FE-105` `literal` The app renders the failure message `That did not work.` `src: Front-end specification, copy`
- [ ] `C-FE-106` `literal` The app renders the not found message `That page does not exist.` `src: Front-end specification, copy`
- [ ] `C-FE-107` `constraint` The app fails each account overview block independently. `src: Front-end specification, copy`
- [ ] `C-FE-108` `constraint` The app confirms before every destructive action. `src: Front-end specification, copy`
- [ ] `C-FE-109` `contract` The app closes any overlay on the Escape key. `src: Front-end specification, copy`

## C-CN Constraints

- [ ] `C-CN-01` `constraint` The app trades in one currency only. `src: Constraints`
- [ ] `C-CN-02` `constraint` The app offers no subscription. `src: Constraints`
- [ ] `C-CN-03` `constraint` The app offers no staff console. `src: Constraints`
- [ ] `C-CN-04` `constraint` The app offers no returns workflow. `src: Constraints`
- [ ] `C-CN-05` `constraint` The app offers no third party sign-in. `src: Constraints`
- [ ] `C-CN-06` `constraint` The app offers no password reset by mail. `src: Constraints`
- [ ] `C-CN-07` `constraint` The app offers no file upload. `src: Constraints`
- [ ] `C-CN-08` `constraint` The app offers no search anywhere. `src: Constraints`
- [ ] `C-CN-09` `constraint` The app offers no analytics. `src: Constraints`
- [ ] `C-CN-10` `constraint` The app makes no outbound network call beyond the named backing services. `src: Constraints`
- [ ] `C-CN-11` `constraint` The app stays responsive at 500 orders. `src: Constraints`
- [ ] `C-CN-12` `constraint` The app stays responsive at 2000 devices. `src: Constraints`

## C-DC Deployment contract

- [ ] `C-DC-01` `contract` The app answers at the address held in `APP_PUBLIC_URL`. `src: Deployment contract`
- [ ] `C-DC-02` `contract` The app listens on the container-internal port `4173`. `src: Deployment contract`
- [ ] `C-DC-03` `contract` The app reads the outward port from `APP_PUBLIC_PORT`. `src: Deployment contract`
- [ ] `C-DC-04` `contract` The app serves the HTTP API under the `/api` prefix on the app origin. `src: Deployment contract`
- [ ] `C-DC-05` `contract` The app starts from the environment image with no manual step. `src: Deployment contract`
- [ ] `C-DC-06` `contract` The app writes login credentials to `/app/USER_README.md`. `src: Deployment contract`
- [ ] `C-DC-07` `contract` The app carries an empty `.browser_screenshots/` directory at the app root. `src: Deployment contract`
- [ ] `C-DC-08` `contract` The app carries an empty `.downloads/` directory at the app root. `src: Deployment contract`
- [ ] `C-DC-09` `contract` The app serves a production build behind a static or preview server. `src: Deployment contract`
- [ ] `C-DC-10` `contract` The app keeps the server running after the session ends. `src: Deployment contract`
- [ ] `C-DC-11` `contract` The app runs the server outside the shell process tree. `src: Deployment contract`
- [ ] `C-DC-12` `contract` The app binds `0.0.0.0` rather than a loopback address. `src: Deployment contract`
- [ ] `C-DC-13` `contract` The app starts no copy of a backing service. `src: Deployment contract`
- [ ] `C-DC-14` `contract` The app declares no persistent volume. `src: Deployment contract`
- [ ] `C-DC-15` `contract` The app declares no custom network. `src: Deployment contract`
- [ ] `C-DC-16` `literal` The app exposes `POST /api/auth/login` returning an access token. `src: Deployment contract, API shapes table`
- [ ] `C-DC-17` `literal` The app exposes `POST /api/auth/signup` returning an access token. `src: Deployment contract, API shapes table`
- [ ] `C-DC-18` `literal` The app exposes `GET /api/products` returning a product list. `src: Deployment contract, API shapes table`
- [ ] `C-DC-19` `literal` The app exposes `POST /api/cart/lines` returning the cart. `src: Deployment contract, API shapes table`
- [ ] `C-DC-20` `literal` The app exposes `POST /api/cart/delivery` returning the priced cart. `src: Deployment contract, API shapes table`
- [ ] `C-DC-21` `literal` The app exposes `POST /api/orders` returning the placed order. `src: Deployment contract, API shapes table`
- [ ] `C-DC-22` `literal` The app exposes `GET /api/account/devices` returning the customer's devices. `src: Deployment contract, API shapes table`
- [ ] `C-DC-23` `literal` The app exposes `POST /api/account/devices` returning the registered device. `src: Deployment contract, API shapes table`
- [ ] `C-DC-24` `literal` The app exposes `GET /api/releases` returning releases newest build first. `src: Deployment contract, API shapes table`
- [ ] `C-DC-25` `literal` The app exposes `GET /api/firmware/manifest` returning the manifest entries. `src: Deployment contract, API shapes table`
- [ ] `C-DC-26` `literal` The app exposes `POST /api/flash-sessions` returning a started session. `src: Deployment contract, API shapes table`
- [ ] `C-DC-27` `literal` The app exposes `POST /api/flash-sessions/{id}/complete` returning a succeeded session. `src: Deployment contract, API shapes table`
- [ ] `C-DC-28` `literal` The app reads a repeated submission through the `Idempotency-Key` header. `src: Deployment contract, API shapes table`
- [ ] `C-DC-29` `constraint` The app rejects an invalid call as a client error rather than a server error. `src: Deployment contract, API shapes`
- [ ] `C-DC-30` `constraint` The app never answers an unauthorized call with a silent success. `src: Deployment contract, API shapes`
- [ ] `C-DC-31` `data` The app carries a machine-readable code on every error response. `src: Deployment contract, API shapes`
- [ ] `C-DC-32` `constraint` The app holds every order in the datastore rather than in memory. `src: Deployment contract, no mocks`
- [ ] `C-DC-33` `constraint` The app holds every invoice in the billing platform rather than in a returned object. `src: Deployment contract, no mocks`
- [ ] `C-DC-34` `constraint` The app sends every confirmation mail to the mail server rather than to a log. `src: Deployment contract, no mocks`

## Pinned literals

| Value | What it is | Item | Stated in |
|---|---|---|---|
| `deku-demo-pw-2026` | seeded password for every account | C-DM-01 | Data model, password paragraph |
| `/app/USER_README.md` | credentials file path | C-DC-06 | Deployment contract |
| `customer@example.com` | first seeded customer | C-RL-21 | User roles, signup paragraph |
| `customer2@example.com` | second seeded customer | C-RL-22 | User roles, signup paragraph |
| `USD` | invoice currency at the billing platform | C-CF-26 | Core features rule 4 |
| `That camera is registered to someone else.` | refusal for a serial owned by another account | C-CF-31 | Core features rule 5 |
| `We do not recognise that serial number.` | refusal for an unknown serial | C-CF-35 | Core features rule 5 |
| `SMTP_HOST` | mail host variable | C-CF-47 | Core features rule 9 |
| `SMTP_PORT` | mail port variable | C-CF-48 | Core features rule 9 |
| `Order confirmed:` | order mail subject prefix | C-CF-52 | Core features rule 9 |
| `confirmed` | order status that sends mail | C-CF-59 | Core features rule 9 |
| `PAYMENTS_API_URL` | billing platform base address | C-CF-63 | Core features, billing paragraph |
| `PAYMENTS_API_KEY` | billing platform api key | C-CF-64 | Core features, billing paragraph |
| `PAYMENTS_API_SECRET` | billing platform api secret | C-CF-65 | Core features, billing paragraph |
| `PAYMENTS_ADMIN_USER` | billing platform admin user | C-CF-66 | Core features, billing paragraph |
| `PAYMENTS_ADMIN_PASSWORD` | billing platform admin password | C-CF-67 | Core features, billing paragraph |
| `/` | letter route | C-UF-01 | User flow route table |
| `/shop` | catalogue route | C-UF-02 | User flow route table |
| `/shop/<handle>` | product route | C-UF-03 | User flow route table |
| `/cart` | cart route | C-UF-04 | User flow route table |
| `/checkout/where-it-goes` | first checkout step route | C-UF-05 | User flow route table |
| `/checkout/how-it-gets-there` | second checkout step route | C-UF-06 | User flow route table |
| `/checkout/payment` | third checkout step route | C-UF-07 | User flow route table |
| `/orders/<number>` | guest order route | C-UF-08 | User flow route table |
| `/downloads` | download route | C-UF-09 | User flow route table |
| `/downloads/<version>` | one release route | C-UF-10 | User flow route table |
| `/doctor` | browser firmware installer route | C-UF-11 | User flow route table |
| `/sign-in` | sign-in route | C-UF-12 | User flow route table |
| `/sign-up` | signup route | C-UF-13 | User flow route table |
| `/account` | account overview route | C-UF-14 | User flow route table |
| `/account/orders` | order history route | C-UF-15 | User flow route table |
| `/account/cameras` | camera grid route | C-UF-16 | User flow route table |
| `/account/cameras/<serial>` | one camera route | C-UF-17 | User flow route table |
| `the table` | letter title | C-UF-27 | User flow journey 1 |
| `June 1, 2026` | letter dateline | C-UF-28 | User flow journey 1 |
| `See you soon.` | letter closing line | C-UF-30 | User flow journey 1 |
| `$378.00` | cart subtotal for the seeded journey | C-UF-32 | User flow journey 2 |
| `$37.80` | order tax for the seeded journey | C-UF-33 | User flow journey 3 |
| `$415.80` | order total for the seeded journey | C-UF-34 | User flow journey 3 |
| `VE-2026-0002` | order number of the first order after seeding | C-UF-35 | User flow journey 3 |
| `Order VE-2026-0002 is confirmed. We have emailed customer@example.com.` | confirmation copy | C-UF-36 | User flow journey 3 |
| `VA2609KTMHX4` | unowned seeded serial | C-UF-37 | Data model, seed data |
| `Not yet connected` | camera card firmware state never reported | C-UF-38 | User flow journey 4 |
| `Nothing is on the table right now.` | empty catalogue copy | C-UF-39 | User flow, states paragraph |
| `Your cart is empty.` | empty cart copy | C-UF-40 | User flow, states paragraph |
| `No cameras registered yet.` | empty camera list copy | C-UF-41 | User flow, states paragraph |
| `/api` | API prefix on the app origin | C-DC-04 | Deployment contract |
| `DATABASE_URL` | datastore connection variable | C-TR-03 | Technical requirements para 1 |
| `SMTP_USER` | mail user variable | C-TR-06 | Technical requirements para 1 |
| `SMTP_PASS` | mail password variable | C-TR-07 | Technical requirements para 1 |
| `GET /api/health` | health endpoint | C-TR-14 | Technical requirements para 3 |
| `200` | health response status | C-TR-14 | Technical requirements para 3 |
| `3780` | order tax in minor units for the seeded journey | C-TR-21 | Technical requirements para 4 |
| `409` | conflict response for the loser of a race | C-TR-29 | Technical requirements, simultaneous requests |
| `stdout` | structured log destination | C-TR-31 | Technical requirements, structured logs |
| `request_id` | correlation field on every log line | C-TR-32 | Technical requirements, structured logs |
| `page_size` | page size parameter on a list endpoint | C-TR-33 | Technical requirements, paginated reads |
| `20` | default page size | C-TR-34 | Technical requirements, paginated reads |
| `100` | maximum page size | C-TR-35 | Technical requirements, paginated reads |
| `next_cursor` | cursor metadata on a list response | C-TR-36 | Technical requirements, paginated reads |
| `has_more` | further-page flag on a list response | C-TR-37 | Technical requirements, paginated reads |
| `37800` | order subtotal in minor units for the seeded journey | C-TR-21 | Technical requirements para 4 |
| `active` | product status of a listed product | C-DM-05 | Data model, product bullet |
| `discontinued` | product status of a retired product | C-DM-05 | Data model, product bullet |
| `VE-<year>-<four digits>` | order number form | C-DM-14 | Data model, order bullet |
| `pending` | order status before confirmation | C-DM-15 | Data model, order bullet |
| `cancelled` | order status after cancellation | C-DM-15 | Data model, order bullet |
| `unpaid` | order payment status before invoicing | C-DM-16 | Data model, order bullet |
| `invoiced` | order payment status after invoicing | C-DM-16 | Data model, order bullet |
| `manufactured` | device status before sale | C-DM-21 | Data model, device bullet |
| `sold` | device status after fulfilment | C-DM-21 | Data model, device bullet |
| `registered` | device status after registration | C-DM-21 | Data model, device bullet |
| `blocked` | device status after a block | C-DM-21 | Data model, device bullet |
| `Newly Added` | first release note group | C-DM-24 | Data model, release bullet |
| `Improvements` | second release note group | C-DM-24 | Data model, release bullet |
| `Bug Fixes` | third release note group | C-DM-24 | Data model, release bullet |
| `Known Issues` | fourth release note group | C-DM-24 | Data model, release bullet |
| `started` | flash session state at creation | C-DM-27 | Data model, flash session bullet |
| `succeeded` | flash session state after a read-back | C-DM-27 | Data model, flash session bullet |
| `failed` | flash session state after a failure | C-DM-27 | Data model, flash session bullet |
| `Vela A1` | flagship camera product title | C-DM-33 | Data model, seed data |
| `flagship` | flagship camera handle | C-DM-33 | Data model, seed data |
| `2032-06-01` | flagship support date | C-DM-33 | Data model, seed data |
| `VELA-A1-GRAPHITE` | flagship graphite variant | C-DM-34 | Data model, seed data |
| `89900` | flagship price in minor units | C-DM-34 | Data model, seed data |
| `4` | flagship graphite stock | C-DM-34 | Data model, seed data |
| `VELA-A1-SAND` | flagship sand variant | C-DM-35 | Data model, seed data |
| `6` | flagship sand stock | C-DM-35 | Data model, seed data |
| `VELA-A1-YELLOW` | flagship yellow variant, the last unit | C-CF-18 | Core features rule 3 |
| `1` | flagship yellow stock | C-DM-36 | Data model, seed data |
| `Vela Cricket` | compact camera product title | C-DM-37 | Data model, seed data |
| `compact` | compact camera handle | C-DM-37 | Data model, seed data |
| `VELA-CRICKET-GRAPHITE` | compact graphite variant | C-DM-38 | Data model, seed data |
| `29900` | compact price in minor units | C-DM-38 | Data model, seed data |
| `12` | compact graphite stock | C-DM-38 | Data model, seed data |
| `VELA-CRICKET-YELLOW` | compact yellow variant, sold out | C-DM-39 | Data model, seed data |
| `0` | compact yellow stock | C-DM-39 | Data model, seed data |
| `Monitor Mount` | discontinued accessory title | C-DM-40 | Data model, seed data |
| `mount` | discontinued accessory handle | C-DM-40 | Data model, seed data |
| `2029-09-01` | discontinued accessory support date | C-DM-40 | Data model, seed data |
| `VELA-CASE-STD` | travel case variant | C-DM-41 | Data model, seed data |
| `7900` | travel case price in minor units | C-DM-41 | Data model, seed data |
| `15` | travel case stock | C-DM-41 | Data model, seed data |
| `VELA-CABLE-1M` | short cable variant | C-DM-42 | Data model, seed data |
| `1900` | short cable price in minor units | C-DM-42 | Data model, seed data |
| `VELA-CABLE-2M` | long cable variant | C-DM-43 | Data model, seed data |
| `2400` | long cable price in minor units | C-DM-43 | Data model, seed data |
| `VELA-PROTECT-2` | protection rung for the seeded journey | C-DM-44 | Data model, seed data |
| `298` | protection rung price in minor units | C-DM-44 | Data model, seed data |
| `10000` | lower bound of the protection rung band | C-DM-44 | Data model, seed data |
| `49999` | upper bound of the protection rung band | C-DM-44 | Data model, seed data |
| `Standard` | free delivery method | C-DM-46 | Data model, seed data |
| `Express` | paid delivery method | C-DM-47 | Data model, seed data |
| `2500` | express delivery price in minor units | C-DM-47 | Data model, seed data |
| `VE-2026-0001` | seeded prior order | C-DM-49 | Data model, seed data |
| `32890` | seeded prior order total in minor units | C-DM-49 | Data model, seed data |
| `VC2609PVDA7Q` | seeded camera owned by the first customer | C-DM-50 | Data model, seed data |
| `7.0` | firmware version the seeded owned camera reports | C-DM-50 | Data model, seed data |
| `VA2609NRWB2Z` | seeded camera owned by the second customer | C-DM-51 | Data model, seed data |
| `VC2609WJ3DKT` | seeded blocked camera | C-DM-53 | Data model, seed data |
| `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` | serial character alphabet | C-DM-55 | Data model, serial paragraph |
| `2.0.0` | newest application release | C-DM-57 | Data model, seed data |
| `2000` | newest application release build | C-DM-57 | Data model, seed data |
| `2024-12-11` | newest application release date | C-DM-57 | Data model, seed data |
| `arranger-2.0.0.dmg` | newest application artifact | C-DM-58 | Data model, seed data |
| `154876459` | newest application artifact size in bytes | C-DM-58 | Data model, seed data |
| `1.4.4` | second application release | C-DM-59 | Data model, seed data |
| `1440` | second application release build | C-DM-59 | Data model, seed data |
| `2024-06-26` | second application release date | C-DM-59 | Data model, seed data |
| `1.4.3` | third application release | C-DM-60 | Data model, seed data |
| `1430` | third application release build | C-DM-60 | Data model, seed data |
| `2024-05-20` | shared release date of the third and fourth release | C-DM-60 | Data model, seed data |
| `1.4.2` | fourth application release | C-DM-61 | Data model, seed data |
| `1420` | fourth application release build | C-DM-61 | Data model, seed data |
| `9f2a41c0d83bb6f9127ae5c40d92b8e31f6a7c05d4e8931b2f4d0e6a1c8b39f2` | digest of the newest artifact | C-DM-62 | Data model, seed data |
| `7.2` | newest compact firmware version | C-DM-63 | Data model, seed data |
| `720` | newest compact firmware build | C-DM-63 | Data model, seed data |
| `6.11` | oldest compact firmware version | C-DM-63 | Data model, seed data |
| `700` | second compact firmware build | C-DM-64 | Data model, seed data |
| `611` | oldest compact firmware build | C-DM-65 | Data model, seed data |
| `2.4` | flagship firmware version | C-DM-66 | Data model, seed data |
| `240` | flagship firmware build | C-DM-66 | Data model, seed data |
| `2.0` | minimum firmware for the flagship image | C-DM-66 | Data model, seed data |
| `All rights reserved` | footer string | C-FE-31 | Front-end specification, the letter |
| `Shop` | first footer link | C-FE-32 | Front-end specification, the letter |
| `99+` | cart badge above ninety-nine | C-FE-38 | Front-end specification, the shell |
| `From ` | price prefix on a card whose variants differ | C-FE-42 | Front-end specification, the catalogue |
| `Only 4 left` | low stock line for the flagship graphite variant at four available | C-FE-48 | Front-end specification, the catalogue |
| `Sold out` | buy control label when stock is exhausted | C-FE-49 | Front-end specification, the catalogue |
| `We no longer sell this. We will support it until September 1, 2029.` | discontinued support note | C-FE-50 | Front-end specification, the catalogue |
| `Estimated. We will show the exact amount once we know where it is going.` | cart estimate note | C-FE-53 | Front-end specification, the cart |
| `Protect this shipment against loss, theft and damage for ` | protection toggle label prefix | C-FE-54 | Front-end specification, the cart |
| `Placing your order` | checkout placing state | C-FE-62 | Front-end specification, the cart |
| `Keep track of this order` | account offer control | C-FE-63 | Front-end specification, the cart |
| `Arranger requires macOS 13.0 or later. Download the app below.` | download route requirement line | C-FE-64 | Front-end specification, the archive |
| `Download Arranger 2.0.0` | primary download control label | C-FE-65 | Front-end specification, the archive |
| `Arranger is a macOS application.` | line for a reader on another platform | C-FE-69 | Front-end specification, the archive |
| `Download Vela Cricket Firmware 7.2` | firmware download control label | C-FE-70 | Front-end specification, the archive |
| `Firmware install (web-based)` | web install path label | C-FE-71 | Front-end specification, the archive |
| `Only use this if Arranger cannot see your camera.` | web install warning | C-FE-72 | Front-end specification, the archive |
| `Released on ` | release dateline prefix | C-FE-74 | Front-end specification, the archive |
| `The Vela team.` | release block sign-off | C-FE-75 | Front-end specification, the archive |
| `This replaces the software inside your camera. It takes about ninety seconds. Do not unplug the camera and do not let your computer go to sleep. If you are on a laptop, plug it in.` | installer warning body | C-FE-81 | Front-end specification, the installer |
| `I understand` | warning acceptance control | C-FE-82 | Front-end specification, the installer |
| `Writing, <percent>. Do not unplug your camera.` | write progress line | C-FE-87 | Front-end specification, the installer |
| `Done. Your camera is running 7.2.` | completed write line | C-FE-89 | Front-end specification, the installer |
| `The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine.` | failure with the camera gone | C-FE-90 | Front-end specification, the installer |
| `Update available` | camera card firmware state when behind | C-FE-94 | Front-end specification, the account |
| `Remove from my account` | ownership release control | C-FE-101 | Front-end specification, the account |
| `That did not work.` | credential failure message | C-FE-105 | Front-end specification, copy |
| `That page does not exist.` | not found message | C-FE-106 | Front-end specification, copy |
| `POST /api/auth/login` | login endpoint | C-DC-16 | Deployment contract, API shapes table |
| `POST /api/auth/signup` | signup endpoint | C-DC-17 | Deployment contract, API shapes table |
| `GET /api/products` | catalogue endpoint | C-DC-18 | Deployment contract, API shapes table |
| `POST /api/cart/lines` | cart line endpoint | C-DC-19 | Deployment contract, API shapes table |
| `POST /api/cart/delivery` | cart pricing endpoint | C-DC-20 | Deployment contract, API shapes table |
| `POST /api/orders` | order placement endpoint | C-DC-21 | Deployment contract, API shapes table |
| `GET /api/account/devices` | device collection endpoint | C-DC-22 | Deployment contract, API shapes table |
| `POST /api/account/devices` | device registration endpoint | C-DC-23 | Deployment contract, API shapes table |
| `GET /api/releases` | release collection endpoint | C-DC-24 | Deployment contract, API shapes table |
| `GET /api/firmware/manifest` | firmware manifest endpoint | C-DC-25 | Deployment contract, API shapes table |
| `POST /api/flash-sessions` | flash session creation endpoint | C-DC-26 | Deployment contract, API shapes table |
| `POST /api/flash-sessions/{id}/complete` | flash session completion endpoint | C-DC-27 | Deployment contract, API shapes table |
| `Idempotency-Key` | replay header on order placement | C-DC-28 | Deployment contract, API shapes table |
| `APP_PUBLIC_URL` | public address variable | C-DC-01 | Deployment contract |
| `4173` | container-internal port | C-DC-02 | Deployment contract |
| `APP_PUBLIC_PORT` | outward port variable | C-DC-03 | Deployment contract |
| `.browser_screenshots/` | reserved screenshot directory | C-DC-07 | Deployment contract |
| `.downloads/` | reserved download directory | C-DC-08 | Deployment contract |
| `0.0.0.0` | bind address | C-DC-12 | Deployment contract |

### Referenced but not pinned

| What the instruction calls it | Item | Why it matters |
|---|---|---|
| the token expiry duration | C-CF-03 | named as expiring, with no duration given in the brief |
| the narrow viewport tier | C-UX-23 | named as a tier the builder chooses, with no width given in the brief |
| the base spacing unit | C-UX-20 | named as one unit the builder chooses, with no size given in the brief |

## Coverage ledger

| Section | Obligation-bearing sentences | Items produced |
|---|---|---|
| Overview | 2 | 13 |
| User roles | 1 | 23 |
| Core features | 11 | 69 |
| User flow | 5 | 43 |
| UI/UX notes | 5 | 32 |
| Technical requirements | 3 | 38 |
| Data model | 5 | 67 |
| Front-end specification | 11 | 109 |
| Constraints | 2 | 12 |
| Deployment contract | 10 | 34 |
