# Checklist: Ravel Mass Balance Attestation

Source: instruction.md
Sections present: overview, roles, features, flow, uiux, technical, datamodel, frontend, constraints, deployment
Sections absent: buildplan
Definition of done restates earlier asks and produced no new items.
Items: 1109
Unpinned values flagged: 4

## C-OV Overview

- [ ] `C-OV-01` `capability` Waste arrives in batches from named collectors. `src: Overview para 1`
- [ ] `C-OV-02` `capability` Batches are consumed by timed process runs through four stages. `src: Overview para 1`
- [ ] `C-OV-03` `literal` The four run stages are `dissolution`, `depolymerisation`, `purification`, `repolymerisation`. `src: Overview para 1`
- [ ] `C-OV-04` `capability` Runs produce lots of polymer. `src: Overview para 1`
- [ ] `C-OV-05` `capability` Every lot carries a recycled-content claim. `src: Overview para 1`
- [ ] `C-OV-06` `capability` Every lot carries a carbon claim. `src: Overview para 1`
- [ ] `C-OV-07` `capability` A certificate carries both claims to one customer. `src: Overview para 1`
- [ ] `C-OV-08` `constraint` No claim exists without the chain of records supporting the claim. `src: Overview para 3`
- [ ] `C-OV-09` `constraint` No lot exists without the runs that produced the lot. `src: Overview para 3`
- [ ] `C-OV-10` `constraint` No run exists without the feedstock batches the run consumed. `src: Overview para 3`
- [ ] `C-OV-11` `constraint` No batch exists without a collector. `src: Overview para 3`
- [ ] `C-OV-12` `constraint` No batch exists without a category. `src: Overview para 3`
- [ ] `C-OV-13` `constraint` No carbon figure exists without a method version. `src: Overview para 3`
- [ ] `C-OV-14` `constraint` No carbon figure exists without a boundary. `src: Overview para 3`
- [ ] `C-OV-15` `constraint` No certificate exists without a named signer entitled to sign. `src: Overview para 3`
- [ ] `C-OV-16` `constraint` Losses reduce the claim a material carries forward. `src: Overview para 4`
- [ ] `C-OV-17` `constraint` No recycled-content percentage is accepted from a person on any route. `src: Overview para 4`
- [ ] `C-OV-18` `constraint` The product reads no live sensor. `src: Overview para 5`
- [ ] `C-OV-19` `constraint` The product holds no set point. `src: Overview para 5`
- [ ] `C-OV-20` `constraint` The product raises no alarm. `src: Overview para 5`

## C-RL User roles

- [ ] `C-RL-01` `role` Signup is closed to everybody. `src: User roles para 1`
- [ ] `C-RL-02` `role` Seven seeded accounts are the only accounts. `src: User roles para 1`
- [ ] `C-RL-03` `role` Every seeded account authenticates at the identity provider. `src: User roles para 1`
- [ ] `C-RL-04` `role` A grant is scoped to a site. `src: User roles para 1`
- [ ] `C-RL-05` `role` A grant carries an end date. `src: User roles para 1`
- [ ] `C-RL-06` `role` No grant renews silently. `src: User roles para 1`
- [ ] `C-RL-07` `role` A plant operator books in a batch. `src: User roles, plant operator`
- [ ] `C-RL-08` `role` A plant operator records mass at intake. `src: User roles, plant operator`
- [ ] `C-RL-09` `role` A plant operator records contamination at intake. `src: User roles, plant operator`
- [ ] `C-RL-10` `role` A plant operator records custody at intake. `src: User roles, plant operator`
- [ ] `C-RL-11` `role` A plant operator starts a run. `src: User roles, plant operator`
- [ ] `C-RL-12` `role` A plant operator records a consumption. `src: User roles, plant operator`
- [ ] `C-RL-13` `role` A plant operator records an output. `src: User roles, plant operator`
- [ ] `C-RL-14` `role` A plant operator closes a run. `src: User roles, plant operator`
- [ ] `C-RL-15` `role` A plant operator is denied at the collector-approval route. `src: User roles, plant operator`
- [ ] `C-RL-16` `role` A plant operator is denied at the category-change route. `src: User roles, plant operator`
- [ ] `C-RL-17` `role` A plant operator is denied at the lot-disposition route. `src: User roles, plant operator`
- [ ] `C-RL-18` `role` A laboratory analyst enters a laboratory result against a named method. `src: User roles, laboratory analyst`
- [ ] `C-RL-19` `role` A laboratory analyst is denied at the lot-disposition route. `src: User roles, laboratory analyst`
- [ ] `C-RL-20` `role` A quality manager approves a collector. `src: User roles, quality manager`
- [ ] `C-RL-21` `role` A quality manager suspends a collector. `src: User roles, quality manager`
- [ ] `C-RL-22` `role` A quality manager sets a lot disposition. `src: User roles, quality manager`
- [ ] `C-RL-23` `role` A quality manager raises a deviation. `src: User roles, quality manager`
- [ ] `C-RL-24` `role` A quality manager closes a deviation. `src: User roles, quality manager`
- [ ] `C-RL-25` `role` A quality manager publishes a carbon method version. `src: User roles, quality manager`
- [ ] `C-RL-26` `role` A quality manager is denied dispositioning a lot against a result the same person entered. `src: User roles, quality manager`
- [ ] `C-RL-27` `role` A quality manager is denied at the balance-period close route. `src: User roles, quality manager`
- [ ] `C-RL-28` `role` A claims manager allocates claim to a lot. `src: User roles, claims manager`
- [ ] `C-RL-29` `role` A claims manager closes a balance period. `src: User roles, claims manager`
- [ ] `C-RL-30` `role` A claims manager publishes a conversion factor. `src: User roles, claims manager`
- [ ] `C-RL-31` `role` A claims manager opens a restatement. `src: User roles, claims manager`
- [ ] `C-RL-32` `role` A claims manager reviews an override the same person did not authorise. `src: User roles, claims manager`
- [ ] `C-RL-33` `role` A claims manager is denied at the carbon-method route. `src: User roles, claims manager`
- [ ] `C-RL-34` `role` A claims manager is denied at the certificate-signing route. `src: User roles, claims manager`
- [ ] `C-RL-35` `role` A certificate signer signs a certificate. `src: User roles, certificate signer`
- [ ] `C-RL-36` `role` A certificate signer withdraws a certificate. `src: User roles, certificate signer`
- [ ] `C-RL-37` `role` A certificate signer is denied signing for a site outside their scope. `src: User roles, certificate signer`
- [ ] `C-RL-38` `role` A certificate signer is denied signing against a lot whose data the same person entered. `src: User roles, certificate signer`
- [ ] `C-RL-39` `role` An auditor reads every record inside an agreed scope. `src: User roles, auditor`
- [ ] `C-RL-40` `role` An auditor exports within scope. `src: User roles, auditor`
- [ ] `C-RL-41` `role` An auditor is denied at every mutating route. `src: User roles, auditor`
- [ ] `C-RL-42` `contract` Authorization is decided on the server for every mutating route. `src: User roles, authorization para`
- [ ] `C-RL-43` `contract` A denied request leaves the protected state unchanged. `src: User roles, authorization para`
- [ ] `C-RL-44` `constraint` A role change never retroactively validates an earlier act. `src: User roles, authorization para`
- [ ] `C-RL-45` `role` A collector account sees only its own batches. `src: User roles, scope para`
- [ ] `C-RL-46` `role` A collector account never sees a lot. `src: User roles, scope para`
- [ ] `C-RL-47` `role` A collector account never sees a run. `src: User roles, scope para`
- [ ] `C-RL-48` `role` A collector account never sees a yield figure. `src: User roles, scope para`
- [ ] `C-RL-49` `role` A collector account never sees another collector. `src: User roles, scope para`
- [ ] `C-RL-50` `role` A converter account sees only its own certificates. `src: User roles, scope para`
- [ ] `C-RL-51` `role` A converter account never sees a genealogy. `src: User roles, scope para`
- [ ] `C-RL-52` `literal` The seeded account `plant@example.com` signs in. `src: User roles, plant operator`
- [ ] `C-RL-53` `literal` The seeded account `analyst@example.com` signs in. `src: User roles, laboratory analyst`
- [ ] `C-RL-54` `literal` The seeded account `quality@example.com` signs in. `src: User roles, quality manager`
- [ ] `C-RL-55` `literal` The seeded account `claims@example.com` signs in. `src: User roles, claims manager`
- [ ] `C-RL-56` `literal` The seeded account `signer@example.com` signs in. `src: User roles, certificate signer`
- [ ] `C-RL-57` `literal` The seeded account `signer2@example.com` signs in. `src: User roles, second signer`
- [ ] `C-RL-58` `literal` The seeded account `auditor@example.com` signs in. `src: User roles, auditor`
- [ ] `C-RL-59` `literal` Every seeded account signs in with `deku-demo-pw-2026`. `src: User roles para 1`

## C-CF Core features

- [ ] `C-CF-01` `constraint` Each of the four separations is refused on the server. `src: Core features, separations`
- [ ] `C-CF-02` `constraint` Whoever entered a laboratory result does not disposition that lot. `src: Core features, separations`
- [ ] `C-CF-03` `constraint` Whoever published a carbon method version does not close the period applying that version. `src: Core features, separations`
- [ ] `C-CF-04` `constraint` Whoever signs a certificate did not enter the data behind that certificate. `src: Core features, separations`
- [ ] `C-CF-05` `constraint` Whoever books in a batch does not approve the supplying collector. `src: Core features, separations`
- [ ] `C-CF-06` `capability` An override names the separation broken. `src: Core features, separations`
- [ ] `C-CF-07` `constraint` An override reason is at least forty characters long. `src: Core features, separations`
- [ ] `C-CF-08` `capability` An override names its authoriser. `src: Core features, separations`
- [ ] `C-CF-09` `constraint` An override is permanent. `src: Core features, separations`
- [ ] `C-CF-10` `capability` An override shows on the lot for the life of the lot. `src: Core features, separations`
- [ ] `C-CF-11` `capability` An override is counted on the balance screen. `src: Core features, separations`
- [ ] `C-CF-12` `constraint` An unreviewed override blocks signing. `src: Core features, separations`
- [ ] `C-CF-13` `constraint` An override review is performed by a second person. `src: Core features, separations`
- [ ] `C-CF-14` `capability` A batch resolves claimability against the approval in force on its receipt date. `src: Core features, feedstock`
- [ ] `C-CF-15` `capability` Material from a lapsed collector is processed as non-claimable input. `src: Core features, feedstock`
- [ ] `C-CF-16` `constraint` A batch category is required at intake. `src: Core features, feedstock`
- [ ] `C-CF-17` `constraint` A batch category has no default. `src: Core features, feedstock`
- [ ] `C-CF-18` `constraint` A batch category cannot be changed after acceptance. `src: Core features, feedstock`
- [ ] `C-CF-19` `constraint` Every accounting figure is computed on dry mass. `src: Core features, feedstock`
- [ ] `C-CF-20` `capability` A lapsed calibration flags every lot downstream of the batch. `src: Core features, feedstock`
- [ ] `C-CF-21` `capability` A partial rejection records where the rejected mass went. `src: Core features, feedstock`
- [ ] `C-CF-22` `capability` A batch missing a custody link is non-claimable. `src: Core features, feedstock`
- [ ] `C-CF-23` `capability` Late evidence makes a batch claimable forward from the arrival date. `src: Core features, feedstock`
- [ ] `C-CF-24` `capability` A run consumes many inputs. `src: Core features, runs`
- [ ] `C-CF-25` `capability` A run produces many outputs. `src: Core features, runs`
- [ ] `C-CF-26` `capability` A batch reaches a lot across four hops. `src: Core features, runs`
- [ ] `C-CF-27` `constraint` Losses are computed rather than entered. `src: Core features, runs`
- [ ] `C-CF-28` `constraint` A closed run refuses a second close. `src: Core features, runs`
- [ ] `C-CF-29` `capability` Genealogy is a traversal over the consumption records. `src: Core features, runs`
- [ ] `C-CF-30` `constraint` Genealogy is never a stored summary. `src: Core features, runs`
- [ ] `C-CF-31` `capability` A batch reached by several paths appears once with its total mass. `src: Core features, runs`
- [ ] `C-CF-32` `capability` The genealogy traversal runs backwards from a batch. `src: Core features, runs`
- [ ] `C-CF-33` `capability` Credits enter the ledger when a claimable batch is consumed. `src: Core features, ledger`
- [ ] `C-CF-34` `capability` Credits leave the ledger when a claim is attached to a lot. `src: Core features, ledger`
- [ ] `C-CF-35` `constraint` Credits attached never exceed credits available. `src: Core features, ledger`
- [ ] `C-CF-36` `constraint` An allocation breaching the ledger invariant is refused rather than warned about. `src: Core features, ledger`
- [ ] `C-CF-37` `constraint` Two allocations racing for one remainder produce one success plus one refusal. `src: Core features, ledger`
- [ ] `C-CF-38` `constraint` Post-consumer credits are never netted against pre-consumer credits. `src: Core features, ledger`
- [ ] `C-CF-39` `constraint` Every percentage is computed from the ledger. `src: Core features, ledger`
- [ ] `C-CF-40` `constraint` No carbon value is returned without its boundary. `src: Core features, carbon`
- [ ] `C-CF-41` `constraint` No carbon value is returned without its method version. `src: Core features, carbon`
- [ ] `C-CF-42` `constraint` No carbon value is returned without its uncertainty. `src: Core features, carbon`
- [ ] `C-CF-43` `constraint` No energy figure is returned without the other energy figure. `src: Core features, carbon`
- [ ] `C-CF-44` `capability` A certificate is readable without the system that issued the certificate. `src: Core features, certificates`
- [ ] `C-CF-45` `capability` A certificate is an object at a permanent address. `src: Core features, certificates`
- [ ] `C-CF-46` `capability` A certificate states what the recipient may say. `src: Core features, certificates`
- [ ] `C-CF-47` `capability` A certificate states what the recipient may not say. `src: Core features, certificates`
- [ ] `C-CF-48` `constraint` A permitted statement is generated from the claim type. `src: Core features, certificates`
- [ ] `C-CF-49` `constraint` Eight issuing conditions are decided on the server. `src: Core features, certificates`
- [ ] `C-CF-50` `constraint` No issuing condition is waivable. `src: Core features, certificates`
- [ ] `C-CF-51` `capability` Withdrawal performs five consequences in one action. `src: Core features, certificates`
- [ ] `C-CF-52` `contract` The public verification route needs no session. `src: Core features, certificates`

## C-UF User flow

- [ ] `C-UF-01` `literal` The public route `/` needs no session. `src: User flow para 1`
- [ ] `C-UF-02` `literal` The public route `/product` needs no session. `src: User flow para 1`
- [ ] `C-UF-03` `literal` The public route `/technology` needs no session. `src: User flow para 1`
- [ ] `C-UF-04` `literal` The public route `/about` needs no session. `src: User flow para 1`
- [ ] `C-UF-05` `literal` The public route `/careers` needs no session. `src: User flow para 1`
- [ ] `C-UF-06` `literal` The public route `/news` needs no session. `src: User flow para 1`
- [ ] `C-UF-07` `literal` The public route `/contact` needs no session. `src: User flow para 1`
- [ ] `C-UF-08` `literal` The public route `/privacy` needs no session. `src: User flow para 1`
- [ ] `C-UF-09` `capability` The console opens at `/console` on a board. `src: User flow para 2`
- [ ] `C-UF-10` `capability` The board carries one column per process stage. `src: User flow para 2`
- [ ] `C-UF-11` `capability` The board carries one card per run. `src: User flow para 2`
- [ ] `C-UF-12` `ui` Navigation across the console is a persistent top bar. `src: User flow para 2`
- [ ] `C-UF-13` `capability` An anonymous reader of a console route is redirected to `/login`. `src: User flow para 2`
- [ ] `C-UF-14` `capability` A claims manager reads credits in, credits out, credits available per category. `src: User flow, allocation journey`
- [ ] `C-UF-15` `capability` An over-allocation does not change the ledger. `src: User flow, allocation journey`
- [ ] `C-UF-16` `ui` A refusal names the available mass beside the requested mass. `src: User flow, allocation journey`
- [ ] `C-UF-17` `ui` The figures on the balance surface are unchanged after a refusal. `src: User flow, allocation journey`
- [ ] `C-UF-18` `literal` The wizard step `/console/certificates/new/lot` is reachable at its own address. `src: User flow, signer journey`
- [ ] `C-UF-19` `literal` The wizard step `/console/certificates/new/claim` is reachable at its own address. `src: User flow, signer journey`
- [ ] `C-UF-20` `literal` The wizard step `/console/certificates/new/recipient` is reachable at its own address. `src: User flow, signer journey`
- [ ] `C-UF-21` `literal` The wizard step `/console/certificates/new/review` is reachable at its own address. `src: User flow, signer journey`
- [ ] `C-UF-22` `capability` Every wizard step shows the eight conditions as the conditions stand. `src: User flow, signer journey`
- [ ] `C-UF-23` `ui` A blocking condition names the record that would resolve the block. `src: User flow, signer journey`
- [ ] `C-UF-24` `ui` No control on the wizard dismisses a blocking condition. `src: User flow, signer journey`
- [ ] `C-UF-25` `ui` A withdrawal screen lists the recipients by name before confirmation. `src: User flow, withdrawal journey`
- [ ] `C-UF-26` `ui` A withdrawal screen lists the statements the recipient must stop making. `src: User flow, withdrawal journey`
- [ ] `C-UF-27` `capability` A withdrawn certificate address still resolves after confirmation. `src: User flow, withdrawal journey`
- [ ] `C-UF-28` `capability` A withdrawn certificate address states the withdrawal. `src: User flow, withdrawal journey`
- [ ] `C-UF-29` `capability` The verification address of `CERT-PILOT-000001` opens with no session. `src: User flow, visitor journey`
- [ ] `C-UF-30` `capability` A withdrawn verification page states the withdrawal date. `src: User flow, visitor journey`
- [ ] `C-UF-31` `capability` A withdrawn verification page states the withdrawal reason. `src: User flow, visitor journey`
- [ ] `C-UF-32` `constraint` A withdrawn verification page does not redirect to a replacement. `src: User flow, visitor journey`
- [ ] `C-UF-33` `capability` An unknown certificate number renders the same layout saying no such certificate exists. `src: User flow, visitor journey`
- [ ] `C-UF-34` `capability` An auditor reads a genealogy as a graph. `src: User flow, auditor journey`
- [ ] `C-UF-35` `capability` An auditor reads the same genealogy as a nested list. `src: User flow, auditor journey`
- [ ] `C-UF-36` `ui` Every mutating control is absent from an auditor session. `src: User flow, auditor journey`
- [ ] `C-UF-37` `capability` Every export is an entry in the record. `src: User flow, auditor journey`
- [ ] `C-UF-38` `ui` An empty collection says so in words rather than rendering an empty frame. `src: User flow, states para`
- [ ] `C-UF-39` `ui` A surface waiting on data says the surface is loading. `src: User flow, states para`
- [ ] `C-UF-40` `ui` A refused act renders an inline banner naming what was refused. `src: User flow, states para`
- [ ] `C-UF-41` `ui` A refused act renders an inline banner naming what would change the outcome. `src: User flow, states para`

## C-UX UI and UX notes

- [ ] `C-UX-01` `ui` The register is considered, print-like, unhurried. `src: UI/UX notes para 1`
- [ ] `C-UX-02` `ui` The reader is addressed as an auditor rather than as a shopper. `src: UI/UX notes para 1`
- [ ] `C-UX-03` `ui` The type is serif throughout at a generous measure. `src: UI/UX notes para 1`
- [ ] `C-UX-04` `ui` The grotesk is reserved for labels. `src: UI/UX notes para 1`
- [ ] `C-UX-05` `ui` The monospace is reserved for identifiers plus figures that align down a column. `src: UI/UX notes para 1`
- [ ] `C-UX-06` `ui` Motion is eased with a considered entrance plus exit. `src: UI/UX notes para 2`
- [ ] `C-UX-07` `ui` No motion bounces. `src: UI/UX notes para 2`
- [ ] `C-UX-08` `ui` Headings resolve from a blur as the reader arrives. `src: UI/UX notes para 2`
- [ ] `C-UX-09` `ui` The reveal is one component with one distance plus one duration. `src: UI/UX notes para 2`
- [ ] `C-UX-10` `ui` Text is readable before the reveal animation finishes. `src: UI/UX notes para 2`
- [ ] `C-UX-11` `ui` No number animates as the number changes. `src: UI/UX notes para 2`
- [ ] `C-UX-12` `ui` Every transition is declared per property. `src: UI/UX notes para 2`
- [ ] `C-UX-13` `ui` No state anywhere is signalled green. `src: UI/UX notes para 3`
- [ ] `C-UX-14` `capability` A non-claimable batch carries the word `non-claimable`. `src: UI/UX notes para 3`
- [ ] `C-UX-15` `capability` A lapsed calibration carries its word beside the flag. `src: UI/UX notes para 3`
- [ ] `C-UX-16` `capability` An open deviation carries its word beside the flag. `src: UI/UX notes para 3`
- [ ] `C-UX-17` `capability` An unreviewed override carries its word beside the flag. `src: UI/UX notes para 3`
- [ ] `C-UX-18` `capability` A withdrawn certificate carries the word `withdrawn`. `src: UI/UX notes para 3`
- [ ] `C-UX-19` `capability` A planned capacity row carries the word `planned`. `src: UI/UX notes para 3`
- [ ] `C-UX-20` `ui` A carbon figure lower than its comparator is described as lower than that named comparator. `src: UI/UX notes para 3`
- [ ] `C-UX-21` `ui` Text contrast meets WCAG AA at every size. `src: UI/UX notes para 4`
- [ ] `C-UX-22` `ui` Focus rings are visible. `src: UI/UX notes para 4`
- [ ] `C-UX-23` `ui` The focus treatment differs from the hover treatment. `src: UI/UX notes para 4`
- [ ] `C-UX-24` `ui` Icon-only controls carry labels. `src: UI/UX notes para 4`
- [ ] `C-UX-25` `ui` No text renders below twelve pixels. `src: UI/UX notes para 4`
- [ ] `C-UX-26` `ui` Keyboard navigation reaches every control a pointer reaches. `src: UI/UX notes para 4`
- [ ] `C-UX-27` `ui` The layout is responsive from a narrow phone to a wide desktop. `src: UI/UX notes para 5`
- [ ] `C-UX-28` `ui` One breakpoint system governs every route. `src: UI/UX notes para 5`
- [ ] `C-UX-29` `ui` The genealogy graph earns a wide viewport. `src: UI/UX notes para 5`
- [ ] `C-UX-30` `ui` The genealogy graph reflows to the nested list at the narrow width. `src: UI/UX notes para 5`
- [ ] `C-UX-31` `ui` The balance screen reflows to one figure per row at the narrow width. `src: UI/UX notes para 5`
- [ ] `C-UX-32` `ui` The certificate wizard reflows to one condition per row at the narrow width. `src: UI/UX notes para 5`
- [ ] `C-UX-33` `ui` No document scrolls sideways at any width. `src: UI/UX notes para 5`
- [ ] `C-UX-34` `ui` A wide table scrolls inside its own container. `src: UI/UX notes para 5`

## C-TR Technical requirements

- [ ] `C-TR-01` `contract` The client is a Preact single-page application built with Vite. `src: Technical requirements para 1`
- [ ] `C-TR-02` `contract` The HTTP API is a Hono application on Node 20. `src: Technical requirements para 1`
- [ ] `C-TR-03` `contract` Both halves are served as one production build from one origin. `src: Technical requirements para 1`
- [ ] `C-TR-04` `literal` The database is reached at `DATABASE_URL`. `src: Technical requirements para 2`
- [ ] `C-TR-05` `literal` The identity provider is reached at `AUTH_ISSUER_URL`. `src: Technical requirements para 2`
- [ ] `C-TR-06` `literal` The identity client is named by `AUTH_CLIENT_ID`. `src: Technical requirements para 2`
- [ ] `C-TR-07` `literal` The identity secret is read from `AUTH_CLIENT_SECRET`. `src: Technical requirements para 2`
- [ ] `C-TR-08` `literal` The mail server host is read from `SMTP_HOST`. `src: Technical requirements para 2`
- [ ] `C-TR-09` `literal` The mail server port is read from `SMTP_PORT`. `src: Technical requirements para 2`
- [ ] `C-TR-10` `constraint` Every service address is read from the environment rather than hardcoded. `src: Technical requirements para 2`
- [ ] `C-TR-11` `contract` `GET /api/health` needs no session. `src: Technical requirements para 3`
- [ ] `C-TR-12` `contract` The stack adds nothing beyond the client, the API, the database, the identity provider, the mail server. `src: Technical requirements, architecture`
- [ ] `C-TR-13` `capability` The architecture is four layers. `src: Technical requirements, architecture`
- [ ] `C-TR-14` `constraint` The arithmetic layer has no writable input other than the operational record plus the versioned methods. `src: Technical requirements, architecture`
- [ ] `C-TR-15` `constraint` The dependency direction runs one way from the site to the operational record. `src: Technical requirements, architecture`
- [ ] `C-TR-16` `constraint` No screen writes to the arithmetic layer. `src: Technical requirements, architecture`
- [ ] `C-TR-17` `constraint` No call into the arithmetic layer writes to the operational record. `src: Technical requirements, architecture`
- [ ] `C-TR-18` `constraint` An operational record is writable until closed. `src: Technical requirements, immutability`
- [ ] `C-TR-19` `constraint` An operational record is immutable after closing. `src: Technical requirements, immutability`
- [ ] `C-TR-20` `constraint` A conversion factor is superseded by a new version rather than overwritten. `src: Technical requirements, immutability`
- [ ] `C-TR-21` `constraint` A carbon method is superseded by a new version rather than overwritten. `src: Technical requirements, immutability`
- [ ] `C-TR-22` `constraint` A specification is superseded by a new version rather than overwritten. `src: Technical requirements, immutability`
- [ ] `C-TR-23` `constraint` A recipe is superseded by a new version rather than overwritten. `src: Technical requirements, immutability`
- [ ] `C-TR-24` `constraint` A credit movement is only ever added. `src: Technical requirements, immutability`
- [ ] `C-TR-25` `constraint` A migration changing the meaning of a historical row is not permitted. `src: Technical requirements, migration`
- [ ] `C-TR-26` `contract` Sign-in exchanges the email plus password at the identity provider. `src: Technical requirements, identity`
- [ ] `C-TR-27` `constraint` The app never accepts an identity a caller asserts. `src: Technical requirements, identity`
- [ ] `C-TR-28` `contract` `GET /api/auth/me` returns `email`, `roles`, `sites`. `src: Technical requirements, identity`
- [ ] `C-TR-29` `constraint` A session expires twelve hours after issue. `src: Technical requirements, identity`
- [ ] `C-TR-30` `contract` An authenticated call carries the session as a bearer token. `src: Technical requirements, identity`
- [ ] `C-TR-31` `constraint` Signing a certificate carries the password again. `src: Technical requirements, identity`
- [ ] `C-TR-32` `constraint` A session alone is not a signing credential. `src: Technical requirements, identity`
- [ ] `C-TR-33` `contract` A mass field carries the suffix `_g` in integer grams. `src: Technical requirements, units`
- [ ] `C-TR-34` `contract` A proportion field carries the suffix `_bp` in integer bp. `src: Technical requirements, units`
- [ ] `C-TR-35` `literal` Ten thousand bp is one hundred per cent. `src: Technical requirements, units`
- [ ] `C-TR-36` `contract` A carbon field carries the suffix `_mg_per_kg`. `src: Technical requirements, units`
- [ ] `C-TR-37` `contract` An energy field carries the suffix `_kwh`. `src: Technical requirements, units`
- [ ] `C-TR-38` `contract` A capacity field carries the suffix `_kg`. `src: Technical requirements, units`
- [ ] `C-TR-39` `constraint` No figure crosses the wire as a decimal. `src: Technical requirements, units`
- [ ] `C-TR-40` `data` Dry mass is net mass times ten thousand minus the moisture bp, divided by ten thousand, floored. `src: Technical requirements, units`
- [ ] `C-TR-41` `data` A consumption credit is dry mass consumed times the factor bp, divided by ten thousand, floored. `src: Technical requirements, units`
- [ ] `C-TR-42` `data` Recycled content is credit attached times ten thousand, divided by lot mass, floored. `src: Technical requirements, units`
- [ ] `C-TR-43` `constraint` Every derived figure carries the versions the figure was computed against. `src: Technical requirements, units`
- [ ] `C-TR-44` `contract` `GET /api/sites/{reference}/capacity` returns `nameplate_kg`. `src: Technical requirements, sites`
- [ ] `C-TR-45` `contract` `GET /api/sites/{reference}/capacity` returns `basis`. `src: Technical requirements, sites`
- [ ] `C-TR-46` `contract` `GET /api/sites/{reference}/capacity` returns `contracted_kg`. `src: Technical requirements, sites`
- [ ] `C-TR-47` `data` `uncommitted_kg` is nameplate minus contracted, computed. `src: Technical requirements, sites`
- [ ] `C-TR-48` `data` `uncommitted_kg` is allowed to be negative. `src: Technical requirements, sites`
- [ ] `C-TR-49` `literal` A site confidence is one of `commissioned`, `under_construction`, `consented`, `planned`. `src: Technical requirements, sites`
- [ ] `C-TR-50` `constraint` A capacity figure is never returned without its confidence. `src: Technical requirements, sites`
- [ ] `C-TR-51` `constraint` Every batch names its site. `src: Technical requirements, sites`
- [ ] `C-TR-52` `constraint` Every run names its site. `src: Technical requirements, sites`
- [ ] `C-TR-53` `constraint` Every lot names its site. `src: Technical requirements, sites`
- [ ] `C-TR-54` `constraint` Every certificate names its site. `src: Technical requirements, sites`
- [ ] `C-TR-55` `constraint` Material from one site never carries another site's certificate. `src: Technical requirements, sites`
- [ ] `C-TR-56` `contract` `GET /api/collectors/{reference}` returns the legal entity plus the country. `src: Technical requirements, collectors`
- [ ] `C-TR-57` `contract` `GET /api/collectors/{reference}` returns the waste-carrier registration plus its expiry. `src: Technical requirements, collectors`
- [ ] `C-TR-58` `contract` `GET /api/collectors/{reference}` returns the list of approval periods. `src: Technical requirements, collectors`
- [ ] `C-TR-59` `role` `POST /api/collectors/{reference}/approvals` is refused for anybody but a quality manager. `src: Technical requirements, collectors`
- [ ] `C-TR-60` `literal` An approval state is one of `approved`, `conditional`, `suspended`, `lapsed`. `src: Technical requirements, collectors`
- [ ] `C-TR-61` `capability` A conditional approval names its condition plus its closing date. `src: Technical requirements, collectors`
- [ ] `C-TR-62` `capability` A grant inside fourteen days of expiry is reported as expiring. `src: Technical requirements, collectors`
- [ ] `C-TR-63` `contract` `POST /api/batches` accepts `collector`, `site`, `category`, `net_g`, `moisture_bp`, `device`, `received_on`. `src: Technical requirements, intake`
- [ ] `C-TR-64` `contract` `PATCH /api/batches/{reference}` refuses a category change with status `409`. `src: Technical requirements, intake`
- [ ] `C-TR-65` `contract` A batch response carries `dry_mass_g`. `src: Technical requirements, intake`
- [ ] `C-TR-66` `contract` A batch response carries `claimable`. `src: Technical requirements, intake`
- [ ] `C-TR-67` `contract` A batch response carries `claimable_reason`. `src: Technical requirements, intake`
- [ ] `C-TR-68` `contract` A batch response carries `flags`. `src: Technical requirements, intake`
- [ ] `C-TR-69` `contract` A batch response carries `custody_complete`. `src: Technical requirements, intake`
- [ ] `C-TR-70` `data` A calibration older than twelve months before receipt raises the flag `lapsed_calibration`. `src: Technical requirements, intake`
- [ ] `C-TR-71` `capability` The calibration flag is repeated on every lot the batch reaches. `src: Technical requirements, intake`
- [ ] `C-TR-72` `contract` A composition carries `polymer`, `fraction_bp`, `basis`. `src: Technical requirements, intake`
- [ ] `C-TR-73` `literal` A composition basis is one of `declared`, `sampled`, `assayed`. `src: Technical requirements, intake`
- [ ] `C-TR-74` `contract` Contamination carries `non_nylon_bp`, `elastane_bp`, `coatings`, `colour_load`, `foreign_matter`. `src: Technical requirements, intake`
- [ ] `C-TR-75` `data` A composition departing from the declaration by more than 500 bp raises a finding against the collector. `src: Technical requirements, intake`
- [ ] `C-TR-76` `literal` A custody link kind is one of `collection_site`, `collector`, `transport`, `arrival`, `weighing`, `acceptance`. `src: Technical requirements, intake`
- [ ] `C-TR-77` `capability` A missing custody link is named on the batch. `src: Technical requirements, intake`
- [ ] `C-TR-78` `capability` A missing custody link is named on every run consuming the batch. `src: Technical requirements, intake`
- [ ] `C-TR-79` `capability` A missing custody link is named on every lot downstream. `src: Technical requirements, intake`
- [ ] `C-TR-80` `contract` `POST /api/batches/{reference}/custody` records the date the document arrived. `src: Technical requirements, intake`
- [ ] `C-TR-81` `contract` `POST /api/batches/{reference}/reject` accepts `rejected_g`, `reason`, `destination`. `src: Technical requirements, intake`
- [ ] `C-TR-82` `data` Accepted mass plus rejected mass equals delivered mass. `src: Technical requirements, intake`
- [ ] `C-TR-83` `constraint` A rejection whose parts do not sum to the delivered mass is refused. `src: Technical requirements, intake`
- [ ] `C-TR-84` `contract` Every write carries an `Idempotency-Key` header. `src: Technical requirements, intake`
- [ ] `C-TR-85` `capability` A repeated idempotency key returns the original result. `src: Technical requirements, intake`
- [ ] `C-TR-86` `constraint` A repeated idempotency key creates nothing further. `src: Technical requirements, intake`
- [ ] `C-TR-87` `literal` A run type is one of `dissolution`, `depolymerisation`, `purification`, `repolymerisation`. `src: Technical requirements, runs`
- [ ] `C-TR-88` `contract` `POST /api/runs` accepts `run_type`, `site`, `equipment`, `recipe_version`, `operator`, `started_at`. `src: Technical requirements, runs`
- [ ] `C-TR-89` `contract` `POST /api/runs/{reference}/consumptions` records one input with the mass consumed. `src: Technical requirements, runs`
- [ ] `C-TR-90` `contract` `POST /api/runs/{reference}/outputs` records one output with its mass plus a kind. `src: Technical requirements, runs`
- [ ] `C-TR-91` `literal` An output kind is one of `intermediate`, `lot`, `byproduct`. `src: Technical requirements, runs`
- [ ] `C-TR-92` `literal` A byproduct disposition is one of `sold`, `disposed`. `src: Technical requirements, runs`
- [ ] `C-TR-93` `data` `POST /api/runs/{reference}/close` computes `losses_g` as mass in minus mass out. `src: Technical requirements, runs`
- [ ] `C-TR-94` `contract` `GET /api/runs/{reference}` returns `within_tolerance`. `src: Technical requirements, runs`
- [ ] `C-TR-95` `capability` A run outside its recipe tolerance raises a deviation. `src: Technical requirements, runs`
- [ ] `C-TR-96` `constraint` A closed run refuses every write. `src: Technical requirements, runs`
- [ ] `C-TR-97` `capability` A second close is recorded as an attempt. `src: Technical requirements, runs`
- [ ] `C-TR-98` `capability` A recipe version carries its target values plus tolerances. `src: Technical requirements, runs`
- [ ] `C-TR-99` `capability` A recipe revision moving temperature outside the published threshold becomes a change notice. `src: Technical requirements, runs`
- [ ] `C-TR-100` `contract` `GET /api/lots/{reference}/genealogy` returns `nodes` plus `edges`. `src: Technical requirements, genealogy`
- [ ] `C-TR-101` `contract` A genealogy node carries `kind`, `reference`, `mass_g`, `category_split`, `flags`. `src: Technical requirements, genealogy`
- [ ] `C-TR-102` `contract` A genealogy edge carries `from`, `to`, `mass_g`. `src: Technical requirements, genealogy`
- [ ] `C-TR-103` `data` A batch reachable by several paths appears as exactly one node. `src: Technical requirements, genealogy`
- [ ] `C-TR-104` `data` The single node's mass is the total mass the batch contributed. `src: Technical requirements, genealogy`
- [ ] `C-TR-105` `contract` A genealogy response carries `flagged` at the top level. `src: Technical requirements, genealogy`
- [ ] `C-TR-106` `contract` A genealogy response carries `text_equivalent`. `src: Technical requirements, genealogy`
- [ ] `C-TR-107` `contract` `GET /api/batches/{reference}/impact` returns every lot, certificate, recipient. `src: Technical requirements, genealogy`
- [ ] `C-TR-108` `constraint` The impact traversal is never paginated. `src: Technical requirements, genealogy`
- [ ] `C-TR-109` `contract` The laboratory-result route accepts `property`, `method`, `instrument`, `analyst`, `value`, `unit`, `uncertainty_bp`. `src: Technical requirements, results`
- [ ] `C-TR-110` `constraint` A laboratory result with no method is refused. `src: Technical requirements, results`
- [ ] `C-TR-111` `capability` A result produced by a method other than the specification's is flagged. `src: Technical requirements, results`
- [ ] `C-TR-112` `constraint` A result produced by another method is not used for release. `src: Technical requirements, results`
- [ ] `C-TR-113` `literal` A lot disposition is one of `pending`, `released`, `quarantined`, `rejected`. `src: Technical requirements, results`
- [ ] `C-TR-114` `constraint` A disposition is refused when a deviation touching the lot is open. `src: Technical requirements, results`
- [ ] `C-TR-115` `literal` A deviation outcome is one of `root_cause_found`, `cause_not_established`. `src: Technical requirements, deviations`
- [ ] `C-TR-116` `capability` A deviation travels with every lot the deviation touches. `src: Technical requirements, deviations`
- [ ] `C-TR-117` `capability` A deviation appears on the internal view of a certificate issued against the lot. `src: Technical requirements, deviations`
- [ ] `C-TR-118` `contract` `POST /api/overrides` accepts `separation`, `reason`, `lot`, `authorised_by`. `src: Technical requirements, overrides`
- [ ] `C-TR-119` `constraint` `POST /api/overrides/{reference}/review` is refused for the authoriser. `src: Technical requirements, overrides`
- [ ] `C-TR-120` `constraint` An override review is refused for anybody who is neither a quality manager nor a claims manager. `src: Technical requirements, overrides`
- [ ] `C-TR-121` `capability` A review sets `reviewed` true. `src: Technical requirements, overrides`
- [ ] `C-TR-122` `constraint` A review removes nothing from the record. `src: Technical requirements, overrides`
- [ ] `C-TR-123` `contract` `GET /api/balance-periods/{id}` returns `credits_in_g` per category. `src: Technical requirements, ledger`
- [ ] `C-TR-124` `contract` `GET /api/balance-periods/{id}` returns `credits_out_g` per category. `src: Technical requirements, ledger`
- [ ] `C-TR-125` `contract` `GET /api/balance-periods/{id}` returns `credits_available_g` per category. `src: Technical requirements, ledger`
- [ ] `C-TR-126` `contract` `GET /api/balance-periods/{id}` returns the conversion factors in force with their versions. `src: Technical requirements, ledger`
- [ ] `C-TR-127` `contract` `GET /api/balance-periods/{id}` returns `carry_over_limit_bp`. `src: Technical requirements, ledger`
- [ ] `C-TR-128` `contract` `GET /api/balance-periods/{id}` returns `override_count`. `src: Technical requirements, ledger`
- [ ] `C-TR-129` `contract` `GET /api/balance-periods/{id}` returns `open_restatement_count`. `src: Technical requirements, ledger`
- [ ] `C-TR-130` `contract` `GET /api/balance-periods/{id}` returns `open_finding_count`. `src: Technical requirements, ledger`
- [ ] `C-TR-131` `contract` `GET /api/balance-periods/{id}` returns `non_claimable_input_g`. `src: Technical requirements, ledger`
- [ ] `C-TR-132` `contract` Every balance figure carries a `derivation` naming the records behind the figure. `src: Technical requirements, ledger`
- [ ] `C-TR-133` `contract` `POST /api/balance-periods/{id}/allocations` accepts `lot`, `category`, `mass_g`. `src: Technical requirements, ledger`
- [ ] `C-TR-134` `contract` An over-allocation answers `409` carrying `available_g` plus `requested_g`. `src: Technical requirements, ledger`
- [ ] `C-TR-135` `data` A refused allocation moves no credit. `src: Technical requirements, ledger`
- [ ] `C-TR-136` `data` Two simultaneous allocations against one remainder produce one `201` plus one `409`. `src: Technical requirements, ledger`
- [ ] `C-TR-137` `data` A balance is the sum of its movements rather than a held total. `src: Technical requirements, ledger`
- [ ] `C-TR-138` `constraint` A period close is refused when a lot in the period lacks a disposition. `src: Technical requirements, ledger`
- [ ] `C-TR-139` `constraint` A period close is refused when a deviation touching the period is open. `src: Technical requirements, ledger`
- [ ] `C-TR-140` `capability` A refused close names the blocking record. `src: Technical requirements, ledger`
- [ ] `C-TR-141` `constraint` A closed period refuses every further write. `src: Technical requirements, ledger`
- [ ] `C-TR-142` `constraint` A closed period refuses to reopen. `src: Technical requirements, ledger`
- [ ] `C-TR-143` `capability` A restatement enumerates every certificate issued from the period. `src: Technical requirements, ledger`
- [ ] `C-TR-144` `literal` A resolution outcome is one of `reissued`, `withdrawn`, `unaffected`. `src: Technical requirements, ledger`
- [ ] `C-TR-145` `constraint` Each affected certificate takes exactly one resolution per restatement. `src: Technical requirements, ledger`
- [ ] `C-TR-146` `constraint` A second resolution against one certificate in one restatement is refused. `src: Technical requirements, ledger`
- [ ] `C-TR-147` `constraint` No route resolves more than one certificate at a time. `src: Technical requirements, ledger`
- [ ] `C-TR-148` `constraint` A consumption dated inside a closed period opens a restatement rather than entering the period. `src: Technical requirements, ledger`
- [ ] `C-TR-149` `contract` Every record carries `event_at`, `recorded_at`, `effective_on`. `src: Technical requirements, ledger`
- [ ] `C-TR-150` `data` The period a movement belongs to is decided by `effective_on`. `src: Technical requirements, ledger`
- [ ] `C-TR-151` `constraint` Every timestamp carries its zone. `src: Technical requirements, ledger`
- [ ] `C-TR-152` `data` A blend takes the weaker of the two claim types. `src: Technical requirements, blending`
- [ ] `C-TR-153` `data` A blend across sites names both sites. `src: Technical requirements, blending`
- [ ] `C-TR-154` `data` Non-claimable material in a blend dilutes the computed percentage. `src: Technical requirements, blending`
- [ ] `C-TR-155` `literal` An allocation basis is one of `mass`, `energy`, `economic`. `src: Technical requirements, byproducts`
- [ ] `C-TR-156` `data` A sold byproduct takes a share of the claim. `src: Technical requirements, byproducts`
- [ ] `C-TR-157` `data` A sold byproduct takes a share of the emissions. `src: Technical requirements, byproducts`
- [ ] `C-TR-158` `data` A disposed byproduct reduces the conversion factor. `src: Technical requirements, byproducts`
- [ ] `C-TR-159` `constraint` The carbon route answers `409` naming the mismatch when the two allocation bases disagree. `src: Technical requirements, byproducts`
- [ ] `C-TR-160` `contract` A carbon method version returns the functional unit, the boundary, the allocation basis. `src: Technical requirements, carbon`
- [ ] `C-TR-161` `contract` A carbon method version returns its emission factors with their source plus year. `src: Technical requirements, carbon`
- [ ] `C-TR-162` `contract` A carbon method version returns its reviewer. `src: Technical requirements, carbon`
- [ ] `C-TR-163` `constraint` A method version is immutable once a figure has been computed against the version. `src: Technical requirements, carbon`
- [ ] `C-TR-164` `contract` `GET /api/lots/{reference}/carbon` returns `value_mg_per_kg`. `src: Technical requirements, carbon`
- [ ] `C-TR-165` `contract` `GET /api/lots/{reference}/carbon` returns `boundary`. `src: Technical requirements, carbon`
- [ ] `C-TR-166` `contract` `GET /api/lots/{reference}/carbon` returns `method_version`. `src: Technical requirements, carbon`
- [ ] `C-TR-167` `contract` `GET /api/lots/{reference}/carbon` returns `uncertainty_bp`. `src: Technical requirements, carbon`
- [ ] `C-TR-168` `contract` `GET /api/lots/{reference}/carbon` returns `primary_share_bp`. `src: Technical requirements, carbon`
- [ ] `C-TR-169` `contract` A comparator carries `material`, `dataset`, `dataset_year`, `region`. `src: Technical requirements, carbon`
- [ ] `C-TR-170` `literal` A data tag is one of `primary`, `supplier_specific`, `secondary`. `src: Technical requirements, carbon`
- [ ] `C-TR-171` `data` The breakdown lines sum to the carbon value. `src: Technical requirements, carbon`
- [ ] `C-TR-172` `constraint` No response carries a carbon value without its boundary, method version, uncertainty. `src: Technical requirements, carbon`
- [ ] `C-TR-173` `contract` The carbon response returns `energy_location_mg_per_kg` beside `energy_market_mg_per_kg`. `src: Technical requirements, carbon`
- [ ] `C-TR-174` `contract` The carbon response returns `metered_kwh`, `retired_kwh`, `unmatched_kwh`. `src: Technical requirements, carbon`
- [ ] `C-TR-175` `constraint` An energy instrument that is not retired is refused. `src: Technical requirements, carbon`
- [ ] `C-TR-176` `constraint` An energy instrument whose vintage does not match the consumption is refused. `src: Technical requirements, carbon`
- [ ] `C-TR-177` `constraint` An energy instrument whose region does not match the consumption is refused. `src: Technical requirements, carbon`
- [ ] `C-TR-178` `constraint` A retired quantity exceeding metered consumption is refused. `src: Technical requirements, carbon`
- [ ] `C-TR-179` `capability` A recomputation produces a new figure version alongside the old one. `src: Technical requirements, carbon`
- [ ] `C-TR-180` `capability` A recomputation records a person, a date, a reason. `src: Technical requirements, carbon`
- [ ] `C-TR-181` `capability` A recomputation enumerates every certificate carrying the superseded figure. `src: Technical requirements, carbon`
- [ ] `C-TR-182` `constraint` A recomputation against a closed period is refused unless a restatement is open. `src: Technical requirements, carbon`
- [ ] `C-TR-183` `constraint` No figure is silently recomputed. `src: Technical requirements, carbon`
- [ ] `C-TR-184` `contract` `POST /api/certificates/preview` returns exactly eight condition entries. `src: Technical requirements, certificates`
- [ ] `C-TR-185` `contract` Each condition entry carries `condition`, `satisfied`, `blocking_reference`. `src: Technical requirements, certificates`
- [ ] `C-TR-186` `data` The eight conditions are re-decided on the server at the moment of signing. `src: Technical requirements, certificates`
- [ ] `C-TR-187` `data` A certificate number is issued from a gapless per-site sequence. `src: Technical requirements, certificates`
- [ ] `C-TR-188` `constraint` A certificate number is never reused. `src: Technical requirements, certificates`
- [ ] `C-TR-189` `contract` A certificate carries `number`, `version`, `site`, `lots`, `grade`, `specification_version`. `src: Technical requirements, certificates`
- [ ] `C-TR-190` `contract` A certificate carries `claim_type`, `content_bp`, `category_split`, `period`. `src: Technical requirements, certificates`
- [ ] `C-TR-191` `contract` A certificate carries `carbon`, `primary_share_bp`, `scheme`, `registration`. `src: Technical requirements, certificates`
- [ ] `C-TR-192` `contract` A certificate carries `permitted_statement`, `prohibited_statement`. `src: Technical requirements, certificates`
- [ ] `C-TR-193` `contract` A certificate carries `signer`, `signed_at`, `verification_url`, `state`. `src: Technical requirements, certificates`
- [ ] `C-TR-194` `contract` A certificate carries `provisional_factor`. `src: Technical requirements, certificates`
- [ ] `C-TR-195` `constraint` The only free text on a certificate is a withdrawal reason. `src: Technical requirements, certificates`
- [ ] `C-TR-196` `data` The permitted statement is generated from the claim type, the percentage, the category split. `src: Technical requirements, certificates`
- [ ] `C-TR-197` `literal` A claim type is one of `physically_segregated`, `controlled_blending`, `mass_balance`. `src: Technical requirements, certificates`
- [ ] `C-TR-198` `constraint` Every lot carries exactly one claim type. `src: Technical requirements, certificates`
- [ ] `C-TR-199` `data` A certificate resting on a provisional factor carries `provisional_factor` true. `src: Technical requirements, certificates`
- [ ] `C-TR-200` `capability` A withdrawal sets the state to `withdrawn` with a reason, a person, a date. `src: Technical requirements, certificates`
- [ ] `C-TR-201` `capability` A withdrawal notifies the recipient through the mail server. `src: Technical requirements, certificates`
- [ ] `C-TR-202` `capability` A withdrawal enumerates every statement the recipient must stop making. `src: Technical requirements, certificates`
- [ ] `C-TR-203` `capability` A withdrawal identifies every certificate derived from the withdrawn one. `src: Technical requirements, certificates`
- [ ] `C-TR-204` `capability` A withdrawal runs the reverse traversal of the underlying batches. `src: Technical requirements, certificates`
- [ ] `C-TR-205` `constraint` A withdrawal is never a deletion. `src: Technical requirements, certificates`
- [ ] `C-TR-206` `contract` The verification route returns `found`, `number`, `state`, `issued_on`, `withdrawn_on`. `src: Technical requirements, certificates`
- [ ] `C-TR-207` `contract` The verification route returns `withdrawal_reason`, `site`, `grade`, `claim_type`, `recipient_name`. `src: Technical requirements, certificates`
- [ ] `C-TR-208` `constraint` The verification route returns no yield figure. `src: Technical requirements, certificates`
- [ ] `C-TR-209` `constraint` The verification route returns no collector. `src: Technical requirements, certificates`
- [ ] `C-TR-210` `constraint` The verification route returns no genealogy. `src: Technical requirements, certificates`
- [ ] `C-TR-211` `constraint` The verification route returns no carbon breakdown. `src: Technical requirements, certificates`
- [ ] `C-TR-212` `contract` An unknown number returns `200` with `found` false. `src: Technical requirements, certificates`
- [ ] `C-TR-213` `constraint` The verification route is rate limited. `src: Technical requirements, certificates`
- [ ] `C-TR-214` `capability` A site certification is a dated period. `src: Technical requirements, certification`
- [ ] `C-TR-215` `data` An issuing condition resolves against the certification period in force on the signing date. `src: Technical requirements, certification`
- [ ] `C-TR-216` `capability` A suspension carries an `effective_from` that may precede the recording date. `src: Technical requirements, certification`
- [ ] `C-TR-217` `capability` A suspension enumerates every certificate signed inside the window. `src: Technical requirements, certification`
- [ ] `C-TR-218` `capability` A suspension stops issuing for the affected site plus grade. `src: Technical requirements, certification`
- [ ] `C-TR-219` `constraint` Lifting a suspension does not reinstate a withdrawn certificate. `src: Technical requirements, certification`
- [ ] `C-TR-220` `contract` A specification row carries `property`, `method`, `limit`, `unit`, `basis`. `src: Technical requirements, customers`
- [ ] `C-TR-221` `literal` A specification basis is one of `guaranteed`, `typical`, `informational`. `src: Technical requirements, customers`
- [ ] `C-TR-222` `capability` A guaranteed limit is measured on every lot. `src: Technical requirements, customers`
- [ ] `C-TR-223` `capability` The specification names the reference a virgin-quality comparison is made against. `src: Technical requirements, customers`
- [ ] `C-TR-224` `capability` Issuing a specification version records the version plus the recipient. `src: Technical requirements, customers`
- [ ] `C-TR-225` `contract` `GET /api/customers/{reference}` returns which specification version the customer holds. `src: Technical requirements, customers`
- [ ] `C-TR-226` `contract` `GET /api/customers/{reference}` returns the conformance records. `src: Technical requirements, customers`
- [ ] `C-TR-227` `capability` A change notice derives the specifications affected rather than asserting none. `src: Technical requirements, customers`
- [ ] `C-TR-228` `capability` A change notice derives the customers holding those specifications. `src: Technical requirements, customers`
- [ ] `C-TR-229` `capability` A change notice derives the notice period owed per customer. `src: Technical requirements, customers`
- [ ] `C-TR-230` `constraint` A change release is refused until every customer owed notice has been notified or has waived. `src: Technical requirements, customers`
- [ ] `C-TR-231` `constraint` A qualification-relevant change for an automotive customer blocks rather than warns. `src: Technical requirements, customers`
- [ ] `C-TR-232` `contract` `GET /api/contracts/{id}/projection` returns `delivered_kg`, `committed_kg`, `running_content_bp`. `src: Technical requirements, contracts`
- [ ] `C-TR-233` `contract` `GET /api/contracts/{id}/projection` returns `floor_bp`, `required_remaining_bp`, `state`. `src: Technical requirements, contracts`
- [ ] `C-TR-234` `literal` A projection state is one of `on_track`, `unreachable`. `src: Technical requirements, contracts`
- [ ] `C-TR-235` `capability` An unreachable projection names the date the floor became unreachable. `src: Technical requirements, contracts`
- [ ] `C-TR-236` `constraint` An unreachable floor is reported rather than refused. `src: Technical requirements, contracts`
- [ ] `C-TR-237` `capability` A contract on a planned site is flagged in every response the contract appears in. `src: Technical requirements, contracts`
- [ ] `C-TR-238` `constraint` A claim allocated to one contract cannot be allocated to another. `src: Technical requirements, contracts`
- [ ] `C-TR-239` `capability` Every act is an entry with the person, the moment, the site, the object. `src: Technical requirements, record`
- [ ] `C-TR-240` `data` The eight conditions are stored as the conditions stood at the moment of signing. `src: Technical requirements, record`
- [ ] `C-TR-241` `constraint` The eight conditions are never recomputed on read. `src: Technical requirements, record`
- [ ] `C-TR-242` `capability` A refused allocation is recorded with the margin at the instant. `src: Technical requirements, record`
- [ ] `C-TR-243` `capability` An inbound payload is kept verbatim in the record. `src: Technical requirements, record`
- [ ] `C-TR-244` `contract` `GET /api/record` returns entries carrying `seq`, `digest`, `prev_digest`. `src: Technical requirements, record`
- [ ] `C-TR-245` `data` Each digest is computed over the entry content plus the previous digest. `src: Technical requirements, record`
- [ ] `C-TR-246` `constraint` Every attempt to modify a record entry is refused. `src: Technical requirements, record`
- [ ] `C-TR-247` `constraint` Every attempt to remove a record entry is refused. `src: Technical requirements, record`
- [ ] `C-TR-248` `contract` The record-chain route reports the first position at which the chain fails. `src: Technical requirements, record`
- [ ] `C-TR-249` `contract` `POST /api/exports` records the scope before the read. `src: Technical requirements, record`
- [ ] `C-TR-250` `capability` An export carries its derivations plus its digests. `src: Technical requirements, record`
- [ ] `C-TR-251` `capability` An export returning nothing is recorded. `src: Technical requirements, record`
- [ ] `C-TR-252` `contract` `GET /api/reconciliation` returns the mass balance residual. `src: Technical requirements, reconciliation`
- [ ] `C-TR-253` `contract` `GET /api/reconciliation` returns credits attached against credits available as a margin. `src: Technical requirements, reconciliation`
- [ ] `C-TR-254` `contract` `GET /api/reconciliation` returns consumption rows whose parent run is open. `src: Technical requirements, reconciliation`
- [ ] `C-TR-255` `contract` `GET /api/reconciliation` returns batches with a broken custody chain. `src: Technical requirements, reconciliation`
- [ ] `C-TR-256` `contract` `GET /api/reconciliation` returns certificates whose figures have been superseded. `src: Technical requirements, reconciliation`
- [ ] `C-TR-257` `contract` `GET /api/reconciliation` returns the age of the most recent record per inbound source. `src: Technical requirements, reconciliation`
- [ ] `C-TR-258` `constraint` No reconciliation figure is styled as passing. `src: Technical requirements, reconciliation`
- [ ] `C-TR-259` `contract` `GET /api/statistics` returns `value`, `source`, `year`, `geography` per figure. `src: Technical requirements, published`
- [ ] `C-TR-260` `constraint` A figure that cannot carry a source, a year, a geography is not published. `src: Technical requirements, published`
- [ ] `C-TR-261` `contract` `GET /api/positions` returns a location, a department, a contract type, a closing date per role. `src: Technical requirements, published`
- [ ] `C-TR-262` `data` A rendered count is derived from the collection the count labels. `src: Technical requirements, published`
- [ ] `C-TR-263` `literal` A news tag is one of `funding`, `partnership`, `technical`, `recognition`. `src: Technical requirements, published`
- [ ] `C-TR-264` `contract` `GET /api/news` returns an outlet, a date, a link, a `language` per item. `src: Technical requirements, published`
- [ ] `C-TR-265` `contract` `GET /api/claim-register` returns the claim, the route, the first-published date, the evidence. `src: Technical requirements, published`
- [ ] `C-TR-266` `contract` `GET /api/claim-register` returns the method version, the approver, a review date. `src: Technical requirements, published`
- [ ] `C-TR-267` `capability` A claim whose evidence expires is reported before its review date. `src: Technical requirements, published`
- [ ] `C-TR-268` `capability` A claim that cannot be substantiated is withdrawn as a recorded publishing act. `src: Technical requirements, published`
- [ ] `C-TR-269` `literal` An enquiry type is one of `waste_supply`, `polymer_purchase`, `partnership`, `press`. `src: Technical requirements, enquiries`
- [ ] `C-TR-270` `contract` `POST /api/enquiries` returns `201` carrying `reference`, `destination`, `response_days`. `src: Technical requirements, enquiries`
- [ ] `C-TR-271` `capability` A waste-supply enquiry opens a collector record. `src: Technical requirements, enquiries`
- [ ] `C-TR-272` `capability` A polymer enquiry opens a conformance record. `src: Technical requirements, enquiries`
- [ ] `C-TR-273` `capability` The point of collection states who receives the data. `src: Technical requirements, enquiries`
- [ ] `C-TR-274` `capability` The point of collection states how long the data is kept. `src: Technical requirements, enquiries`
- [ ] `C-TR-275` `constraint` Every mail is addressed to exactly one recipient with no copies. `src: Technical requirements, mail`
- [ ] `C-TR-276` `literal` A certificate issue mail carries the subject `Certificate <number> issued`. `src: Technical requirements, mail`
- [ ] `C-TR-277` `literal` A certificate withdrawal mail carries the subject `Certificate <number> withdrawn`. `src: Technical requirements, mail`
- [ ] `C-TR-278` `literal` A change notice mail carries the subject `Change notice <id> requires acknowledgement`. `src: Technical requirements, mail`
- [ ] `C-TR-279` `literal` An enquiry mail carries the subject `Enquiry <reference> received`. `src: Technical requirements, mail`
- [ ] `C-TR-280` `constraint` Allocating claim sends no mail. `src: Technical requirements, mail`
- [ ] `C-TR-281` `constraint` Closing a period sends no mail. `src: Technical requirements, mail`
- [ ] `C-TR-282` `constraint` Setting a disposition sends no mail. `src: Technical requirements, mail`
- [ ] `C-TR-283` `constraint` Every answer carries its derivation. `src: Technical requirements, engine boundary`
- [ ] `C-TR-284` `constraint` An answer that cannot state its origin is not returned. `src: Technical requirements, engine boundary`
- [ ] `C-TR-285` `capability` Intake continues to accept a batch when the rest of the system is degraded. `src: Technical requirements, failure`
- [ ] `C-TR-286` `capability` A run close against unavailable arithmetic is queued. `src: Technical requirements, failure`
- [ ] `C-TR-287` `constraint` A queued run close is not reported as complete. `src: Technical requirements, failure`
- [ ] `C-TR-288` `constraint` A batch lands together with its weighing or neither lands. `src: Technical requirements, failure`
- [ ] `C-TR-289` `constraint` The product schedules no laboratory sample. `src: Technical requirements, scope`
- [ ] `C-TR-290` `constraint` The product builds no life-cycle model. `src: Technical requirements, scope`
- [ ] `C-TR-291` `constraint` The product issues no invoice. `src: Technical requirements, scope`
- [ ] `C-TR-292` `constraint` The product raises no purchase order. `src: Technical requirements, scope`
- [ ] `C-TR-293` `literal` An inbound source is one of `weighbridge`, `control_system`, `laboratory`, `customer_reporting`. `src: Technical requirements, inbound`
- [ ] `C-TR-294` `contract` `POST /api/inbound/{source}` accepts `received_at` plus `payload`. `src: Technical requirements, inbound`
- [ ] `C-TR-295` `contract` The inbound response carries the `reference` the record took. `src: Technical requirements, inbound`
- [ ] `C-TR-296` `contract` `GET /api/inbound` returns `source`, `received_at`, `payload_verbatim` per entry. `src: Technical requirements, inbound`
- [ ] `C-TR-297` `data` The stored payload is the bytes exactly as received rather than the parsed shape. `src: Technical requirements, inbound`
- [ ] `C-TR-298` `constraint` The app opens no outbound connection to any of the four sources. `src: Technical requirements, inbound`
- [ ] `C-TR-299` `capability` The app reconciles an inbound record against what the operator recorded. `src: Technical requirements, inbound`
- [ ] `C-TR-300` `capability` The app shows a disagreement rather than resolving the disagreement. `src: Technical requirements, inbound`
- [ ] `C-TR-301` `contract` `integration_ages` carries one entry per source with an age in hours. `src: Technical requirements, inbound`
- [ ] `C-TR-302` `data` A source that has never sent reports `null` rather than zero. `src: Technical requirements, inbound`
- [ ] `C-TR-303` `constraint` A collector declaration is never used as a measurement. `src: Technical requirements, inbound`
- [ ] `C-TR-304` `capability` A collector declaration is compared against a sampled composition on a schedule. `src: Technical requirements, inbound`
- [ ] `C-TR-305` `contract` `GET /api/certificates/{number}/replay` returns `issued`, `recomputed`, `agrees`, `differing_input`. `src: Technical requirements, replay`
- [ ] `C-TR-306` `data` A replay recomputes the figures from the versioned inputs recorded against the certificate. `src: Technical requirements, replay`
- [ ] `C-TR-307` `capability` A disagreement names both values. `src: Technical requirements, replay`
- [ ] `C-TR-308` `capability` A disagreement names the one input that moved. `src: Technical requirements, replay`
- [ ] `C-TR-309` `contract` A figure whose inputs cannot be resolved answers `reproducible` false with a `reason`. `src: Technical requirements, replay`
- [ ] `C-TR-310` `constraint` An unresolvable figure is never recomputed under current rules. `src: Technical requirements, replay`
- [ ] `C-TR-311` `data` A version an issued figure rests on is retained for as long as any figure references the version. `src: Technical requirements, replay`
- [ ] `C-TR-312` `contract` `GET /api/record/queries/{name}` answers each of the nine record questions. `src: Technical requirements, record queries`
- [ ] `C-TR-313` `literal` The record query `lots_from_batch` resolves. `src: Technical requirements, record queries`
- [ ] `C-TR-314` `literal` The record query `certificates_on_period` resolves. `src: Technical requirements, record queries`
- [ ] `C-TR-315` `literal` The record query `certificates_under_method_version` resolves. `src: Technical requirements, record queries`
- [ ] `C-TR-316` `literal` The record query `lots_released_under_unreviewed_override` resolves. `src: Technical requirements, record queries`
- [ ] `C-TR-317` `literal` The record query `allocations_in_final_fortnight` resolves. `src: Technical requirements, record queries`
- [ ] `C-TR-318` `literal` The record query `refused_allocations` resolves. `src: Technical requirements, record queries`
- [ ] `C-TR-319` `literal` The record query `collector_declaration_departures` resolves. `src: Technical requirements, record queries`
- [ ] `C-TR-320` `literal` The record query `acts_by_person` resolves. `src: Technical requirements, record queries`
- [ ] `C-TR-321` `literal` The record query `exports_by_auditor` resolves. `src: Technical requirements, record queries`
- [ ] `C-TR-322` `data` Each record query returns a complete set rather than an assembled report. `src: Technical requirements, record queries`
- [ ] `C-TR-323` `data` The export query counts the reads that returned nothing. `src: Technical requirements, record queries`
- [ ] `C-TR-324` `contract` `GET /api/record/{seq}/retention` returns `scheme_months`, `statutory_months`, `referenced_until`, `retain_until`. `src: Technical requirements, retention`
- [ ] `C-TR-325` `data` `retain_until` is the longest of the three periods. `src: Technical requirements, retention`
- [ ] `C-TR-326` `constraint` `retain_until` is computed rather than stored from a typed date. `src: Technical requirements, retention`
- [ ] `C-TR-327` `contract` `POST /api/record/{seq}/legal-hold` places a hold. `src: Technical requirements, retention`
- [ ] `C-TR-328` `capability` Placing a hold is an entry of its own. `src: Technical requirements, retention`
- [ ] `C-TR-329` `capability` Lifting a hold is an entry of its own. `src: Technical requirements, retention`
- [ ] `C-TR-330` `constraint` A record under hold refuses deletion. `src: Technical requirements, retention`
- [ ] `C-TR-331` `constraint` An entry is expired only after `retain_until` has passed. `src: Technical requirements, retention`
- [ ] `C-TR-332` `data` An expired entry keeps its position in the sequence. `src: Technical requirements, retention`
- [ ] `C-TR-333` `data` An expired entry keeps its digest so the chain still holds. `src: Technical requirements, retention`
- [ ] `C-TR-334` `capability` An expired entry states that its content was deleted under retention on a date. `src: Technical requirements, retention`
- [ ] `C-TR-335` `constraint` The fact that a certificate existed is never deleted. `src: Technical requirements, retention`
- [ ] `C-TR-336` `data` A person inside the record is referenced by an identifier rather than by a name. `src: Technical requirements, retention`
- [ ] `C-TR-337` `contract` `POST /api/parties/{reference}/versions` records a new name from an effective date. `src: Technical requirements, parties`
- [ ] `C-TR-338` `constraint` A new party version supersedes the previous version rather than rewriting the version. `src: Technical requirements, parties`
- [ ] `C-TR-339` `data` Every record names the party as the party stood on the date of the act. `src: Technical requirements, parties`
- [ ] `C-TR-340` `data` Every record names the identifier the party held on that date. `src: Technical requirements, parties`
- [ ] `C-TR-341` `contract` `GET /api/parties/{reference}/versions` returns the full name history. `src: Technical requirements, parties`
- [ ] `C-TR-342` `contract` `POST /api/balance-periods/{id}/transfers` moves material between sites. `src: Technical requirements, transfers`
- [ ] `C-TR-343` `data` A transfer lands on the receiving ledger as an inbound credit. `src: Technical requirements, transfers`
- [ ] `C-TR-344` `data` An inbound credit names the originating site. `src: Technical requirements, transfers`
- [ ] `C-TR-345` `data` An inbound credit names the movement the credit came from. `src: Technical requirements, transfers`
- [ ] `C-TR-346` `constraint` A transfer is never a fresh credit. `src: Technical requirements, transfers`
- [ ] `C-TR-347` `data` The total credit across the two periods is unchanged by a transfer. `src: Technical requirements, transfers`
- [ ] `C-TR-348` `data` A computation in flight completes under the method version the computation started with. `src: Technical requirements, races`
- [ ] `C-TR-349` `data` A new method version applies from the next computation onwards. `src: Technical requirements, races`
- [ ] `C-TR-350` `data` A restatement enumeration racing a withdrawal leaves both acts in the record. `src: Technical requirements, races`
- [ ] `C-TR-351` `data` A certificate state reflects the later of two racing acts. `src: Technical requirements, races`
- [ ] `C-TR-352` `data` The earlier of two racing acts stays readable at its own sequence. `src: Technical requirements, races`
- [ ] `C-TR-353` `data` A scoped read during a period close sees one consistent state. `src: Technical requirements, races`
- [ ] `C-TR-354` `capability` A scoped read names the moment the read saw. `src: Technical requirements, races`
- [ ] `C-TR-355` `data` A cached carbon figure is invalid from the moment its emission factor is superseded. `src: Technical requirements, races`
- [ ] `C-TR-356` `constraint` A yield figure appears on no certificate. `src: Technical requirements, yield`
- [ ] `C-TR-357` `constraint` A yield figure appears in no certificate document. `src: Technical requirements, yield`
- [ ] `C-TR-358` `constraint` A yield figure appears in no verification answer. `src: Technical requirements, yield`
- [ ] `C-TR-359` `contract` `GET /api/lots/{reference}/yield` answers for plant operations, quality, claims. `src: Technical requirements, yield`
- [ ] `C-TR-360` `role` `GET /api/lots/{reference}/yield` refuses a collector. `src: Technical requirements, yield`
- [ ] `C-TR-361` `role` `GET /api/lots/{reference}/yield` refuses a converter. `src: Technical requirements, yield`
- [ ] `C-TR-362` `contract` `claim_type` is returned at the same weighting as `content_bp`. `src: Technical requirements, yield`
- [ ] `C-TR-363` `constraint` No response carries a percentage without its claim type beside the percentage. `src: Technical requirements, yield`
- [ ] `C-TR-364` `contract` A short-supply allocation carries `decided_by`. `src: Technical requirements, short supply`
- [ ] `C-TR-365` `contract` A short-supply allocation carries `favoured_over`. `src: Technical requirements, short supply`
- [ ] `C-TR-366` `constraint` A short-supply allocation is never an automatic sort by contract value. `src: Technical requirements, short supply`
- [ ] `C-TR-367` `data` The reverse traversal answers within five seconds over the seeded records. `src: Technical requirements, genealogy bound`
- [ ] `C-TR-368` `capability` An export carries the anchor references of the entries in its scope. `src: Technical requirements, genealogy bound`
- [ ] `C-TR-369` `capability` An export's integrity is establishable after the export has left the system. `src: Technical requirements, genealogy bound`
- [ ] `C-TR-370` `constraint` An export's integrity needs no confirmation from the producer. `src: Technical requirements, genealogy bound`
- [ ] `C-TR-371` `constraint` The console returns no aggregate carbon value without a breakdown behind the value. `src: Technical requirements, aggregate view`
- [ ] `C-TR-372` `capability` A certificate may attach the breakdown rather than carry the breakdown inline. `src: Technical requirements, aggregate view`
- [ ] `C-TR-373` `constraint` Every derived integer is floored rather than rounded. `src: Technical requirements, flooring`
- [ ] `C-TR-374` `constraint` No derived figure is carried at half. `src: Technical requirements, flooring`
- [ ] `C-TR-375` `data` A batch of `12345` grams net at `5000` bp of moisture reports 6172 grams dry. `src: Technical requirements, flooring`
- [ ] `C-TR-376` `data` `200000` grams of claim on a lot of `300000` grams reports 6666 bp of content. `src: Technical requirements, flooring`
- [ ] `C-TR-377` `constraint` A figure falling between two integers takes the lower integer. `src: Technical requirements, flooring`
- [ ] `C-TR-378` `constraint` The flooring rule governs a byproduct share. `src: Technical requirements, flooring`
- [ ] `C-TR-379` `constraint` The flooring rule governs a conversion factor. `src: Technical requirements, flooring`
- [ ] `C-TR-380` `constraint` The flooring rule governs a running weighted content. `src: Technical requirements, flooring`
- [ ] `C-TR-381` `constraint` The flooring rule governs a required remaining average. `src: Technical requirements, flooring`
- [ ] `C-TR-382` `data` An idempotency key is scoped to the route the key was sent to. `src: Technical requirements, idempotency`
- [ ] `C-TR-383` `data` An idempotency key is scoped to the body the key was sent with. `src: Technical requirements, idempotency`
- [ ] `C-TR-384` `contract` One key with an unchanged body returns the original result. `src: Technical requirements, idempotency`
- [ ] `C-TR-385` `contract` One key with a changed body answers `409` naming `idempotency_key_reuse`. `src: Technical requirements, idempotency`
- [ ] `C-TR-386` `constraint` A key replayed with a changed body creates nothing. `src: Technical requirements, idempotency`
- [ ] `C-TR-387` `capability` A key never seen before opens a new act. `src: Technical requirements, idempotency`
- [ ] `C-TR-388` `constraint` A write arriving with no key at all is refused. `src: Technical requirements, idempotency`
- [ ] `C-TR-389` `contract` `POST /api/conversion-factors` accepts `site`, `factor_bp`, `derived_from`, `derived_to`, `derived_in_g`, `derived_out_g`. `src: Technical requirements, factor derivation`
- [ ] `C-TR-390` `data` A factor is refused unless `factor_bp` equals the out mass times ten thousand over the in mass, floored. `src: Technical requirements, factor derivation`
- [ ] `C-TR-391` `capability` A factor is the arithmetic of a stated window rather than a chosen number. `src: Technical requirements, factor derivation`
- [ ] `C-TR-392` `data` A provisional factor carries `derived_in_g` of zero. `src: Technical requirements, factor derivation`
- [ ] `C-TR-393` `capability` A provisional factor declares itself provisional. `src: Technical requirements, factor derivation`
- [ ] `C-TR-394` `capability` Every certificate resting on a provisional factor says so. `src: Technical requirements, factor derivation`
- [ ] `C-TR-395` `data` A blend content is the mass-weighted sum over the combined mass, floored. `src: Technical requirements, blend arithmetic`
- [ ] `C-TR-396` `data` Blending `LOT-N6-0001` with `LOT-N6-0003` yields 600000 grams. `src: Technical requirements, blend arithmetic`
- [ ] `C-TR-397` `data` Blending `LOT-N6-0001` with `LOT-N6-0003` yields 8500 bp of content. `src: Technical requirements, blend arithmetic`
- [ ] `C-TR-398` `capability` A blend across two sites names both sites on the result. `src: Technical requirements, blend arithmetic`
- [ ] `C-TR-399` `data` A blend carries the provisional-factor flag of the weaker of the two lots. `src: Technical requirements, blend arithmetic`
- [ ] `C-TR-400` `data` A sold byproduct share is its mass times ten thousand over the run output mass, floored. `src: Technical requirements, blend arithmetic`
- [ ] `C-TR-401` `data` `OUT-U-0002` carries 526 bp of the claim of `RUN-U-0001`. `src: Technical requirements, blend arithmetic`
- [ ] `C-TR-402` `data` `OUT-U-0002` carries 526 bp of the emissions of `RUN-U-0001`. `src: Technical requirements, blend arithmetic`
- [ ] `C-TR-403` `capability` Closing a period settles the carry-over. `src: Technical requirements, carry-over`
- [ ] `C-TR-404` `data` Credit carries forward only up to the carry-over limit of the credit that entered. `src: Technical requirements, carry-over`
- [ ] `C-TR-405` `contract` A closed period reports `expired_g` per category. `src: Technical requirements, carry-over`
- [ ] `C-TR-406` `constraint` Expiring credit is never absorbed silently. `src: Technical requirements, carry-over`
- [ ] `C-TR-407` `data` A period with 360000 grams in at 2000 bp carries at most 72000 grams forward. `src: Technical requirements, carry-over`
- [ ] `C-TR-408` `data` A period closing with 100000 grams available expires 28000 grams. `src: Technical requirements, carry-over`
- [ ] `C-TR-409` `data` Two signatures at one site at the same moment take two consecutive numbers. `src: Technical requirements, sequence`
- [ ] `C-TR-410` `data` The per-site sequence carries no gap after two simultaneous signatures. `src: Technical requirements, sequence`
- [ ] `C-TR-411` `constraint` No number is issued twice under contention. `src: Technical requirements, sequence`
- [ ] `C-TR-412` `constraint` Neither of two simultaneous signatures is lost. `src: Technical requirements, sequence`
- [ ] `C-TR-413` `data` The eight conditions are decided again at the moment of signing. `src: Technical requirements, condition drift`
- [ ] `C-TR-414` `data` The conditions are decided against the records as the records stand at signing. `src: Technical requirements, condition drift`
- [ ] `C-TR-415` `capability` A lot gaining an open deviation after a clean preview is refused at signing. `src: Technical requirements, condition drift`
- [ ] `C-TR-416` `capability` A refusal at signing names the condition that changed. `src: Technical requirements, condition drift`
- [ ] `C-TR-417` `constraint` The reverse traversal refuses a `page` parameter with `400`. `src: Technical requirements, complete sets`
- [ ] `C-TR-418` `constraint` A restatement enumeration refuses a `limit` parameter with `400`. `src: Technical requirements, complete sets`
- [ ] `C-TR-419` `constraint` A recomputation enumeration refuses an `offset` parameter with `400`. `src: Technical requirements, complete sets`
- [ ] `C-TR-420` `constraint` A record query refuses a `cursor` parameter with `400`. `src: Technical requirements, complete sets`
- [ ] `C-TR-421` `constraint` A pagination parameter is refused rather than ignored. `src: Technical requirements, complete sets`
- [ ] `C-TR-422` `contract` `GET /api/certificates/{number}/document` renders the document as plain text. `src: Technical requirements, document stability`
- [ ] `C-TR-423` `data` Two reads of one certificate version return identical bytes. `src: Technical requirements, document stability`
- [ ] `C-TR-424` `capability` A re-issue produces a new version at a new address. `src: Technical requirements, document stability`
- [ ] `C-TR-425` `constraint` A re-issue never produces new bytes at the old address. `src: Technical requirements, document stability`
- [ ] `C-TR-426` `capability` A restatement revising a factor reports the content each certificate carries. `src: Technical requirements, restatement recompute`
- [ ] `C-TR-427` `capability` A restatement revising a factor reports the content the corrected factor produces. `src: Technical requirements, restatement recompute`
- [ ] `C-TR-428` `capability` A person resolving a certificate sees the figure that moved. `src: Technical requirements, restatement recompute`

## C-DM Data model

- [ ] `C-DM-01` `data` A consumption is a row of its own carrying a mass. `src: Data model, four rules`
- [ ] `C-DM-02` `data` One batch reaches many lots. `src: Data model, four rules`
- [ ] `C-DM-03` `data` One lot descends from many batches. `src: Data model, four rules`
- [ ] `C-DM-04` `data` A collector approval is a dated period rather than a flag. `src: Data model, four rules`
- [ ] `C-DM-05` `data` A credit movement is added rather than altered. `src: Data model, four rules`
- [ ] `C-DM-06` `data` A restatement holds exactly one resolution per affected certificate. `src: Data model, four rules`
- [ ] `C-DM-07` `literal` The site `SITE-PILOT` is seeded with confidence `commissioned`. `src: Data model, sites`
- [ ] `C-DM-08` `literal` The site `SITE-DEMO` is seeded with confidence `commissioned`. `src: Data model, sites`
- [ ] `C-DM-09` `literal` The site `SITE-COMM` is seeded with confidence `planned`. `src: Data model, sites`
- [ ] `C-DM-10` `literal` `SITE-PILOT` is seeded with nameplate `40000` kilograms. `src: Data model, sites`
- [ ] `C-DM-11` `literal` `SITE-DEMO` is seeded with nameplate `400000` kilograms. `src: Data model, sites`
- [ ] `C-DM-12` `literal` `SITE-COMM` is seeded with nameplate `25000000` kilograms. `src: Data model, sites`
- [ ] `C-DM-13` `literal` `SITE-DEMO` is seeded with contracted `320000` kilograms. `src: Data model, sites`
- [ ] `C-DM-14` `literal` `SITE-COMM` is seeded with contracted `26000000` kilograms. `src: Data model, sites`
- [ ] `C-DM-15` `data` `SITE-COMM` reports uncommitted capacity of minus one million kilograms. `src: Data model, sites`
- [ ] `C-DM-16` `literal` The capacity basis reads `8000 hours per year, 0.90 availability, 0.80 yield`. `src: Data model, sites`
- [ ] `C-DM-17` `literal` The capacity revision date is `2026-06-30`. `src: Data model, sites`
- [ ] `C-DM-18` `data` Seven accounts are seeded. `src: Data model, accounts`
- [ ] `C-DM-19` `literal` `plant@example.com` holds the role `plant_operator`. `src: Data model, accounts`
- [ ] `C-DM-20` `literal` `analyst@example.com` holds the role `lab_analyst`. `src: Data model, accounts`
- [ ] `C-DM-21` `literal` `quality@example.com` holds the role `quality_manager`. `src: Data model, accounts`
- [ ] `C-DM-22` `literal` `claims@example.com` holds the role `claims_manager`. `src: Data model, accounts`
- [ ] `C-DM-23` `literal` `signer@example.com` holds the role `certificate_signer`. `src: Data model, accounts`
- [ ] `C-DM-24` `literal` `signer2@example.com` is scoped to `SITE-PILOT` only. `src: Data model, accounts`
- [ ] `C-DM-25` `literal` `auditor@example.com` holds the role `auditor`. `src: Data model, accounts`
- [ ] `C-DM-26` `literal` Every seeded grant ends on `2027-06-30`. `src: Data model, accounts`
- [ ] `C-DM-27` `literal` The collector `COL-ALDER` is seeded in country `PT`. `src: Data model, collectors`
- [ ] `C-DM-28` `literal` The collector `COL-BRINE` is seeded in country `NL`. `src: Data model, collectors`
- [ ] `C-DM-29` `literal` The collector `COL-CINDER` is seeded in country `FR`. `src: Data model, collectors`
- [ ] `C-DM-30` `literal` `COL-ALDER` carries the registration `WCR-PT-4471`. `src: Data model, collectors`
- [ ] `C-DM-31` `literal` `COL-BRINE` carries the registration `WCR-NL-2208`. `src: Data model, collectors`
- [ ] `C-DM-32` `literal` `COL-CINDER` carries the registration `WCR-FR-6613`. `src: Data model, collectors`
- [ ] `C-DM-33` `literal` `COL-ALDER` is approved from `2026-01-01` to `2026-12-31`. `src: Data model, collectors`
- [ ] `C-DM-34` `literal` `COL-BRINE` is approved only to `2026-06-30`. `src: Data model, collectors`
- [ ] `C-DM-35` `literal` `COL-CINDER` is seeded in state `conditional`. `src: Data model, collectors`
- [ ] `C-DM-36` `literal` The `COL-CINDER` condition closes by `2026-10-31`. `src: Data model, collectors`
- [ ] `C-DM-37` `literal` The device `WB-DEMO-01` was calibrated on `2026-05-01`. `src: Data model, devices`
- [ ] `C-DM-38` `literal` The device `WB-DEMO-02` was calibrated on `2025-02-01`. `src: Data model, devices`
- [ ] `C-DM-39` `data` A calibration is valid for twelve months. `src: Data model, devices`
- [ ] `C-DM-40` `literal` `BATCH-1001` is seeded from `COL-ALDER` as `post_consumer`. `src: Data model, batches`
- [ ] `C-DM-41` `literal` `BATCH-1001` carries net mass `500000` grams. `src: Data model, batches`
- [ ] `C-DM-42` `literal` `BATCH-1001` carries moisture `1000` bp. `src: Data model, batches`
- [ ] `C-DM-43` `data` `BATCH-1001` reports dry mass of 450000 grams. `src: Data model, batches`
- [ ] `C-DM-44` `literal` `BATCH-1002` is seeded from `COL-ALDER` as `pre_consumer`. `src: Data model, batches`
- [ ] `C-DM-45` `literal` `BATCH-1002` carries net mass `300000` grams. `src: Data model, batches`
- [ ] `C-DM-46` `literal` `BATCH-1003` is seeded from `COL-BRINE` received on `2026-07-05`. `src: Data model, batches`
- [ ] `C-DM-47` `literal` `BATCH-1003` carries net mass `200000` grams. `src: Data model, batches`
- [ ] `C-DM-48` `data` `BATCH-1003` reports dry mass of 190000 grams. `src: Data model, batches`
- [ ] `C-DM-49` `data` `BATCH-1003` is non-claimable for a lapsed collector approval. `src: Data model, batches`
- [ ] `C-DM-50` `literal` `BATCH-1004` is seeded from `COL-CINDER` on device `WB-DEMO-02`. `src: Data model, batches`
- [ ] `C-DM-51` `literal` `BATCH-1004` carries net mass `120000` grams. `src: Data model, batches`
- [ ] `C-DM-52` `data` `BATCH-1004` is claimable carrying the lapsed-calibration flag. `src: Data model, batches`
- [ ] `C-DM-53` `literal` `BATCH-1005` carries net mass `100000` grams. `src: Data model, batches`
- [ ] `C-DM-54` `data` `BATCH-1005` is non-claimable for a missing transport custody link. `src: Data model, batches`
- [ ] `C-DM-55` `literal` `BATCH-1001` declares polymer `PA6` at `9200` bp on basis `sampled`. `src: Data model, batches`
- [ ] `C-DM-56` `literal` `BATCH-1004` declares `9900` bp against a measured `9100`. `src: Data model, batches`
- [ ] `C-DM-57` `data` The `BATCH-1004` departure of 800 bp stands as a finding on `COL-CINDER`. `src: Data model, batches`
- [ ] `C-DM-58` `literal` `RUN-D-0001` is a `dissolution` run on recipe `RCP-DISS-2`. `src: Data model, runs`
- [ ] `C-DM-59` `literal` `RUN-D-0001` consumes `300000` grams of `BATCH-1001`. `src: Data model, runs`
- [ ] `C-DM-60` `literal` `RUN-D-0001` consumes `300000` grams of `BATCH-1002`. `src: Data model, runs`
- [ ] `C-DM-61` `data` `RUN-D-0001` reports losses of 120000 grams. `src: Data model, runs`
- [ ] `C-DM-62` `literal` `RUN-D-0002` consumes `190000` grams of `BATCH-1003`. `src: Data model, runs`
- [ ] `C-DM-63` `literal` `RUN-D-0002` consumes `120000` grams of `BATCH-1004`. `src: Data model, runs`
- [ ] `C-DM-64` `literal` `RUN-D-0003` consumes `150000` grams of `BATCH-1001`. `src: Data model, runs`
- [ ] `C-DM-65` `literal` `RUN-Y-0001` is a `depolymerisation` run on recipe `RCP-DEPO-4`. `src: Data model, runs`
- [ ] `C-DM-66` `literal` `RUN-U-0001` is a `purification` run on recipe `RCP-PURI-1`. `src: Data model, runs`
- [ ] `C-DM-67` `literal` `RUN-R-0001` is a `repolymerisation` run on recipe `RCP-REPO-3`. `src: Data model, runs`
- [ ] `C-DM-68` `literal` `OUT-D-0001` carries `480000` grams. `src: Data model, outputs`
- [ ] `C-DM-69` `literal` `OUT-D-0002` carries `250000` grams. `src: Data model, outputs`
- [ ] `C-DM-70` `literal` `OUT-D-0003` carries `120000` grams. `src: Data model, outputs`
- [ ] `C-DM-71` `literal` `OUT-Y-0001` carries `800000` grams. `src: Data model, outputs`
- [ ] `C-DM-72` `literal` `OUT-U-0001` carries `720000` grams. `src: Data model, outputs`
- [ ] `C-DM-73` `literal` `OUT-U-0002` is a byproduct of `40000` grams. `src: Data model, outputs`
- [ ] `C-DM-74` `literal` `OUT-U-0002` carries disposition `sold`. `src: Data model, outputs`
- [ ] `C-DM-75` `data` Every seeded run is closed. `src: Data model, runs`
- [ ] `C-DM-76` `data` `RUN-D-0001` recorded temperature inside its recipe tolerance. `src: Data model, runs`
- [ ] `C-DM-77` `data` `BATCH-1001` reaches `LOT-N6-0001` through two dissolution runs. `src: Data model, runs`
- [ ] `C-DM-78` `data` The `BATCH-1001` genealogy node carries 450000 grams once. `src: Data model, runs`
- [ ] `C-DM-79` `literal` `LOT-N6-0001` carries grade `N6` at `400000` grams. `src: Data model, lots`
- [ ] `C-DM-80` `literal` `LOT-N6-0002` carries grade `N6` at `300000` grams. `src: Data model, lots`
- [ ] `C-DM-81` `literal` `LOT-N6-0003` is produced at `SITE-PILOT` at `200000` grams. `src: Data model, lots`
- [ ] `C-DM-82` `data` `LOT-N6-0001` is seeded in disposition `released`. `src: Data model, lots`
- [ ] `C-DM-83` `data` `LOT-N6-0002` is seeded in disposition `quarantined`. `src: Data model, lots`
- [ ] `C-DM-84` `data` `LOT-N6-0001` carries the unreviewed override at seed time. `src: Data model, lots`
- [ ] `C-DM-85` `data` `LOT-N6-0002` is held by an open deviation. `src: Data model, lots`
- [ ] `C-DM-86` `data` `LOT-N6-0003` rests on the provisional conversion factor. `src: Data model, lots`
- [ ] `C-DM-87` `literal` `DEV-0001` is seeded open against `RUN-U-0001`. `src: Data model, deviations`
- [ ] `C-DM-88` `literal` `DEV-0002` is seeded closed with outcome `cause_not_established`. `src: Data model, deviations`
- [ ] `C-DM-89` `literal` `OVR-0001` breaks the separation `analyst_not_dispositioner`. `src: Data model, overrides`
- [ ] `C-DM-90` `literal` `OVR-0001` was authorised on `2026-03-18`. `src: Data model, overrides`
- [ ] `C-DM-91` `data` `OVR-0001` is unreviewed at seed time. `src: Data model, overrides`
- [ ] `C-DM-92` `literal` `CF-DEMO-1` carries factor `8000` bp. `src: Data model, factors`
- [ ] `C-DM-93` `literal` `CF-DEMO-1` derives from `2026-01-01` to `2026-03-31`. `src: Data model, factors`
- [ ] `C-DM-94` `literal` `CF-PILOT-1` carries factor `7500` bp. `src: Data model, factors`
- [ ] `C-DM-95` `data` `CF-PILOT-1` is provisional. `src: Data model, factors`
- [ ] `C-DM-96` `literal` The period `BP-DEMO-N6-2025H2` is seeded closed. `src: Data model, periods`
- [ ] `C-DM-97` `literal` The period `BP-DEMO-N6-2026H1` is seeded open. `src: Data model, periods`
- [ ] `C-DM-98` `literal` The period `BP-PILOT-N6-2026H1` is seeded open. `src: Data model, periods`
- [ ] `C-DM-99` `literal` Every seeded period carries carry-over limit `2000` bp. `src: Data model, periods`
- [ ] `C-DM-100` `literal` `BP-DEMO-N6-2025H2` closed on `2026-01-15`. `src: Data model, periods`
- [ ] `C-DM-101` `literal` `BP-DEMO-N6-2025H2` carries the cut-off `2026-01-10`. `src: Data model, periods`
- [ ] `C-DM-102` `data` `BATCH-1001` grants 360000 grams of post-consumer credit. `src: Data model, ledger`
- [ ] `C-DM-103` `data` `BATCH-1002` grants 240000 grams of pre-consumer credit. `src: Data model, ledger`
- [ ] `C-DM-104` `data` `BATCH-1003` grants no credit. `src: Data model, ledger`
- [ ] `C-DM-105` `data` `BATCH-1004` grants 96000 grams of pre-consumer credit. `src: Data model, ledger`
- [ ] `C-DM-106` `data` `BP-DEMO-N6-2026H1` opens with 360000 grams of post-consumer credit in. `src: Data model, ledger`
- [ ] `C-DM-107` `data` `BP-DEMO-N6-2026H1` opens with 336000 grams of pre-consumer credit in. `src: Data model, ledger`
- [ ] `C-DM-108` `data` `BP-DEMO-N6-2026H1` opens with zero credits out. `src: Data model, ledger`
- [ ] `C-DM-109` `data` `BP-DEMO-N6-2026H1` reports 190000 grams of non-claimable input. `src: Data model, ledger`
- [ ] `C-DM-110` `data` `BP-DEMO-N6-2026H1` reports an override count of one. `src: Data model, ledger`
- [ ] `C-DM-111` `data` `BP-DEMO-N6-2026H1` reports zero open restatements. `src: Data model, ledger`
- [ ] `C-DM-112` `data` Allocating 360000 grams to `LOT-N6-0001` yields 9000 bp of content. `src: Data model, ledger`
- [ ] `C-DM-113` `data` A further post-consumer allocation against the period is refused. `src: Data model, ledger`
- [ ] `C-DM-114` `literal` The carbon method `CM-PA6` is published at version `2`. `src: Data model, carbon`
- [ ] `C-DM-115` `literal` `CM-PA6` is written against `ISO 14067`. `src: Data model, carbon`
- [ ] `C-DM-116` `literal` `CM-PA6` uses the functional unit `1 kg of pellet`. `src: Data model, carbon`
- [ ] `C-DM-117` `literal` `CM-PA6` uses the boundary `cradle-to-gate`. `src: Data model, carbon`
- [ ] `C-DM-118` `literal` `CM-PA6` names the reviewer `Ilse Grootveld`. `src: Data model, carbon`
- [ ] `C-DM-119` `literal` `CM-PA6` was published on `2026-01-20`. `src: Data model, carbon`
- [ ] `C-DM-120` `literal` The `LOT-N6-0001` carbon value is `4260000` milligrams per kilogram. `src: Data model, carbon`
- [ ] `C-DM-121` `literal` The `LOT-N6-0001` uncertainty is `1200` bp. `src: Data model, carbon`
- [ ] `C-DM-122` `literal` The `LOT-N6-0001` primary share is `6500` bp. `src: Data model, carbon`
- [ ] `C-DM-123` `literal` The comparator names the material `virgin PA6`. `src: Data model, carbon`
- [ ] `C-DM-124` `literal` The comparator names the dataset `EcoBase 2025`. `src: Data model, carbon`
- [ ] `C-DM-125` `literal` The comparator names the region `EU-27`. `src: Data model, carbon`
- [ ] `C-DM-126` `literal` The primary-data threshold is `5000` bp. `src: Data model, carbon`
- [ ] `C-DM-127` `literal` The breakdown line `collection_and_transport` is `310000`. `src: Data model, carbon`
- [ ] `C-DM-128` `literal` The breakdown line `process_energy` is `1850000`. `src: Data model, carbon`
- [ ] `C-DM-129` `literal` The breakdown line `reagents` is `1180000`. `src: Data model, carbon`
- [ ] `C-DM-130` `literal` The breakdown line `water_and_effluent` is `240000`. `src: Data model, carbon`
- [ ] `C-DM-131` `literal` The breakdown line `waste_and_residues` is `330000`. `src: Data model, carbon`
- [ ] `C-DM-132` `literal` The breakdown line `outbound_transport` is `410000`. `src: Data model, carbon`
- [ ] `C-DM-133` `literal` The breakdown line `byproduct_credit` is `-60000`. `src: Data model, carbon`
- [ ] `C-DM-134` `data` The seven breakdown lines sum to 4260000. `src: Data model, carbon`
- [ ] `C-DM-135` `literal` The market-based energy figure is `620000` milligrams per kilogram. `src: Data model, carbon`
- [ ] `C-DM-136` `literal` The metered consumption for the period is `300000` kilowatt hours. `src: Data model, carbon`
- [ ] `C-DM-137` `literal` The instrument `EAC-2026-0007` carries `250000` kilowatt hours retired. `src: Data model, carbon`
- [ ] `C-DM-138` `literal` The instrument `EAC-2025-0031` is held rather than retired. `src: Data model, carbon`
- [ ] `C-DM-139` `data` Applying `EAC-2026-0007` leaves 50000 kilowatt hours unmatched. `src: Data model, carbon`
- [ ] `C-DM-140` `data` `EAC-2025-0031` is refused for being held. `src: Data model, carbon`
- [ ] `C-DM-141` `data` `EAC-2025-0031` is refused for a vintage that does not match. `src: Data model, carbon`
- [ ] `C-DM-142` `literal` The specification `SPEC-N6` is current at version `3`. `src: Data model, specifications`
- [ ] `C-DM-143` `literal` `SPEC-N6` was issued on `2026-02-01`. `src: Data model, specifications`
- [ ] `C-DM-144` `literal` The property `relative_viscosity` is guaranteed at `2.40` by method `ISO 307`. `src: Data model, specifications`
- [ ] `C-DM-145` `literal` The property `moisture` is guaranteed at `0.10` by method `ISO 15512`. `src: Data model, specifications`
- [ ] `C-DM-146` `literal` The property `yellowness_index` is typical at `8.0` by method `ASTM E313`. `src: Data model, specifications`
- [ ] `C-DM-147` `literal` The property `ash_content` is informational at `0.30` by method `ISO 3451-1`. `src: Data model, specifications`
- [ ] `C-DM-148` `literal` The virgin-quality reference reads `virgin PA6 at relative viscosity 2.42`. `src: Data model, specifications`
- [ ] `C-DM-149` `literal` The customer `CUS-HELIOS` is reached at `helios@example.com`. `src: Data model, customers`
- [ ] `C-DM-150` `literal` The customer `CUS-VANTA` is reached at `vanta@example.com`. `src: Data model, customers`
- [ ] `C-DM-151` `literal` `CUS-HELIOS` holds `SPEC-N6` version `3`. `src: Data model, customers`
- [ ] `C-DM-152` `literal` `CUS-VANTA` holds `SPEC-N6` version `2`. `src: Data model, customers`
- [ ] `C-DM-153` `literal` `CUS-VANTA` qualifies the application `airbag fabric`. `src: Data model, customers`
- [ ] `C-DM-154` `literal` `CUS-VANTA` sits in the industry `automotive`. `src: Data model, customers`
- [ ] `C-DM-155` `literal` The contract `CON-HELIOS-1` commits `200` kilograms. `src: Data model, contracts`
- [ ] `C-DM-156` `literal` The contract `CON-HELIOS-1` carries floor `5000` bp. `src: Data model, contracts`
- [ ] `C-DM-157` `literal` The contract `CON-VANTA-1` names the site `SITE-COMM`. `src: Data model, contracts`
- [ ] `C-DM-158` `data` `CON-VANTA-1` is flagged for a planned supplying site. `src: Data model, contracts`
- [ ] `C-DM-159` `literal` `CON-VANTA-1` states the shortfall consequence `a make-good volume in the following period`. `src: Data model, contracts`
- [ ] `C-DM-160` `literal` The certificate `CERT-PILOT-000001` is seeded in state `withdrawn`. `src: Data model, certificates`
- [ ] `C-DM-161` `literal` `CERT-PILOT-000001` was withdrawn on `2026-04-18`. `src: Data model, certificates`
- [ ] `C-DM-162` `literal` `CERT-PILOT-000001` names the reason `A collector category was corrected after acceptance`. `src: Data model, certificates`
- [ ] `C-DM-163` `literal` The certificate `CERT-PILOT-000002` is seeded in state `issued`. `src: Data model, certificates`
- [ ] `C-DM-164` `data` The `SITE-DEMO` sequence has issued nothing at seed time. `src: Data model, certificates`
- [ ] `C-DM-165` `literal` The first certificate signed at `SITE-DEMO` is numbered `CERT-DEMO-000001`. `src: Data model, certificates`
- [ ] `C-DM-166` `literal` The certification scheme is `RCS-2026`. `src: Data model, certificates`
- [ ] `C-DM-167` `literal` The producer registration is `REG-RAVEL-0042`. `src: Data model, certificates`
- [ ] `C-DM-168` `literal` The verification address is published under the host `ravel.example.com`. `src: Data model, certificates`
- [ ] `C-DM-169` `data` The record opens at sequence one. `src: Data model, record`
- [ ] `C-DM-170` `data` The first record entry carries a previous digest of sixty-four zeroes. `src: Data model, record`
- [ ] `C-DM-171` `literal` The statistic `textiles_recycled` cites `Textile Flow Monitor` for `2024`. `src: Data model, public site`
- [ ] `C-DM-172` `literal` The statistic `plastics_emissions` cites `Global Materials Emissions Panel` for `2023`. `src: Data model, public site`
- [ ] `C-DM-173` `literal` The statistic `textile_incineration` cites geography `EU-27`. `src: Data model, public site`
- [ ] `C-DM-174` `data` The emissions statistic states a mass rather than a currency. `src: Data model, public site`
- [ ] `C-DM-175` `literal` One open position is seeded as `Process Engineer`. `src: Data model, public site`
- [ ] `C-DM-176` `literal` The seeded position is located in `Lyon, France`. `src: Data model, public site`
- [ ] `C-DM-177` `literal` The seeded position closes on `2026-11-30`. `src: Data model, public site`
- [ ] `C-DM-178` `data` The careers count renders one. `src: Data model, public site`
- [ ] `C-DM-179` `data` Three news items are seeded. `src: Data model, public site`
- [ ] `C-DM-180` `literal` One seeded news item carries language `fr`. `src: Data model, public site`
- [ ] `C-DM-181` `literal` A waste-supply enquiry is routed to `feedstock@example.com`. `src: Data model, public site`
- [ ] `C-DM-182` `literal` A polymer enquiry is routed to `sales@example.com`. `src: Data model, public site`
- [ ] `C-DM-183` `literal` A partnership enquiry is routed to `partners@example.com`. `src: Data model, public site`
- [ ] `C-DM-184` `literal` A press enquiry is routed to `press@example.com`. `src: Data model, public site`
- [ ] `C-DM-185` `literal` A press enquiry states a response time of `1` day. `src: Data model, public site`
- [ ] `C-DM-186` `literal` The published controller is named `Ravel Materials SAS`. `src: Data model, public site`
- [ ] `C-DM-187` `literal` A rights request is addressed to `privacy@example.com`. `src: Data model, public site`
- [ ] `C-DM-188` `literal` The disclosure address is `security@example.com`. `src: Data model, public site`
- [ ] `C-DM-189` `literal` The record retention is stated as `180` months. `src: Data model, public site`
- [ ] `C-DM-190` `data` Every published purpose carries a retention in months. `src: Data model, public site`
- [ ] `C-DM-191` `data` The policy states the operational record is not erased on request. `src: Data model, public site`
- [ ] `C-DM-192` `literal` A `weighbridge` record is seeded at `2026-02-20T06:14:00Z`. `src: Data model, inbound`
- [ ] `C-DM-193` `literal` A `control_system` record is seeded at `2026-03-04T22:41:00Z`. `src: Data model, inbound`
- [ ] `C-DM-194` `literal` A `laboratory` record is seeded at `2026-03-06T09:02:00Z`. `src: Data model, inbound`
- [ ] `C-DM-195` `data` The `customer_reporting` source has never sent. `src: Data model, inbound`
- [ ] `C-DM-196` `data` The `customer_reporting` age reads null rather than zero. `src: Data model, inbound`
- [ ] `C-DM-197` `data` Each seeded inbound record keeps its payload verbatim. `src: Data model, inbound`
- [ ] `C-DM-198` `literal` `COL-BRINE` holds the name `Brine Textile Recovery` from `2026-01-01`. `src: Data model, parties`
- [ ] `C-DM-199` `literal` `COL-BRINE` holds the name `Brine Circular Materials` from `2026-08-01`. `src: Data model, parties`
- [ ] `C-DM-200` `data` `BATCH-1003` reads back under the collector name in force on its receipt date. `src: Data model, parties`
- [ ] `C-DM-201` `literal` The transfer `TRF-0001` moves `50000` grams on `2026-05-12`. `src: Data model, transfers`
- [ ] `C-DM-202` `data` `TRF-0001` lands on the demonstration ledger as inbound credit naming the pilot site. `src: Data model, transfers`
- [ ] `C-DM-203` `data` The two periods together hold the same credit after `TRF-0001` as before. `src: Data model, transfers`
- [ ] `C-DM-204` `literal` The scheme retention basis is `120` months. `src: Data model, retention`
- [ ] `C-DM-205` `literal` The statutory retention basis is `84` months. `src: Data model, retention`
- [ ] `C-DM-206` `data` The referenced-until basis is computed rather than seeded. `src: Data model, retention`
- [ ] `C-DM-207` `literal` The legal hold `HLD-0001` stands on the signing entry of `CERT-PILOT-000001`. `src: Data model, retention`
- [ ] `C-DM-208` `literal` `CF-DEMO-1` carries `derived_in_g` of `1000000`. `src: Data model, factor derivation`
- [ ] `C-DM-209` `literal` `CF-DEMO-1` carries `derived_out_g` of `800000`. `src: Data model, factor derivation`
- [ ] `C-DM-210` `data` The `CF-DEMO-1` window reconciles to 8000 bp exactly. `src: Data model, factor derivation`
- [ ] `C-DM-211` `data` `CF-PILOT-1` carries a zero derivation window. `src: Data model, factor derivation`

## C-FE Front-end specification

- [ ] `C-FE-01` `literal` The reference published `#301f00` as its dark value. `src: Front-end specification, palette`
- [ ] `C-FE-02` `literal` The reference published `#f9f5f1` as its ground value. `src: Front-end specification, palette`
- [ ] `C-FE-03` `literal` The reference published `#2a4b22` as its accent value. `src: Front-end specification, palette`
- [ ] `C-FE-04` `literal` The reference published `#b68ecb` as its editorial value. `src: Front-end specification, palette`
- [ ] `C-FE-05` `literal` The reference published `#898d8f` as its grey value. `src: Front-end specification, palette`
- [ ] `C-FE-06` `constraint` No colour in the product is specified in the brief as a code. `src: Front-end specification, palette`
- [ ] `C-FE-07` `ui` The build chooses every colour value the product renders. `src: Front-end specification, palette`
- [ ] `C-FE-08` `capability` The ink role carries every word the reader reads. `src: Front-end specification, palette`
- [ ] `C-FE-09` `capability` The ink role is the darkest value in the palette. `src: Front-end specification, palette`
- [ ] `C-FE-10` `capability` The ink role clears WCAG AA against the ground at every size the scale carries. `src: Front-end specification, palette`
- [ ] `C-FE-11` `capability` The ink role clears WCAG AAA against the ground at body size. `src: Front-end specification, palette`
- [ ] `C-FE-12` `ui` The ground role reads warm rather than neutral. `src: Front-end specification, palette`
- [ ] `C-FE-13` `constraint` The ground role is never pure white. `src: Front-end specification, palette`
- [ ] `C-FE-14` `capability` The paper role is lighter than the ground. `src: Front-end specification, palette`
- [ ] `C-FE-15` `capability` The paper role is distinguishable from the ground without a border. `src: Front-end specification, palette`
- [ ] `C-FE-16` `capability` The muted role clears WCAG AA against the ground at body size. `src: Front-end specification, palette`
- [ ] `C-FE-17` `ui` The muted role reads as quieter than the ink at a glance. `src: Front-end specification, palette`
- [ ] `C-FE-18` `data` At most eight distinct colour literals appear in the built stylesheet. `src: Front-end specification, palette`
- [ ] `C-FE-19` `data` An alpha variant of a role counts as that role rather than as a new one. `src: Front-end specification, palette`
- [ ] `C-FE-20` `constraint` No seventh colour role exists. `src: Front-end specification, palette`
- [ ] `C-FE-21` `constraint` The accent never signals a state. `src: Front-end specification, palette`
- [ ] `C-FE-22` `constraint` The highlight never signals a state. `src: Front-end specification, palette`
- [ ] `C-FE-23` `constraint` The console uses neither the accent nor the highlight. `src: Front-end specification, palette`
- [ ] `C-FE-24` `literal` The value `#2d62ff` appears nowhere in the built stylesheet. `src: Front-end specification, palette`
- [ ] `C-FE-25` `literal` The value `#dd23bb` appears nowhere in the built stylesheet. `src: Front-end specification, palette`
- [ ] `C-FE-26` `literal` The value `#fcf8d8` appears nowhere in the built stylesheet. `src: Front-end specification, palette`
- [ ] `C-FE-27` `literal` The value `#cef5ca` appears nowhere in the built stylesheet. `src: Front-end specification, palette`
- [ ] `C-FE-28` `literal` The value `#114e0b` appears nowhere in the built stylesheet. `src: Front-end specification, palette`
- [ ] `C-FE-29` `literal` The value `#f8e4e4` appears nowhere in the built stylesheet. `src: Front-end specification, palette`
- [ ] `C-FE-30` `literal` The value `#3b0b0b` appears nowhere in the built stylesheet. `src: Front-end specification, palette`
- [ ] `C-FE-31` `literal` The value `#5e5515` appears nowhere in the built stylesheet. `src: Front-end specification, palette`
- [ ] `C-FE-32` `literal` The value `#0000` appears nowhere in the built stylesheet. `src: Front-end specification, palette`
- [ ] `C-FE-33` `constraint` Every colour that renders comes from a named role. `src: Front-end specification, palette`
- [ ] `C-FE-34` `constraint` No token name contains a deletion marker. `src: Front-end specification, palette`
- [ ] `C-FE-35` `constraint` One value carries one name. `src: Front-end specification, palette`
- [ ] `C-FE-36` `constraint` No second naming scheme describes the same values. `src: Front-end specification, palette`
- [ ] `C-FE-37` `capability` A serif family carries prose plus headings. `src: Front-end specification, typography`
- [ ] `C-FE-38` `capability` A grotesk family carries labels, table headers, the top bar. `src: Front-end specification, typography`
- [ ] `C-FE-39` `constraint` Both families are openly licensed. `src: Front-end specification, typography`
- [ ] `C-FE-40` `constraint` Both families are subset to the characters the site uses. `src: Front-end specification, typography`
- [ ] `C-FE-41` `constraint` Each family is served as one variable file from the app's own origin. `src: Front-end specification, typography`
- [ ] `C-FE-42` `constraint` No trial or evaluation face renders anywhere. `src: Front-end specification, typography`
- [ ] `C-FE-43` `constraint` No undeclared family renders anywhere. `src: Front-end specification, typography`
- [ ] `C-FE-44` `constraint` No element falls back to a generic system face. `src: Front-end specification, typography`
- [ ] `C-FE-45` `capability` A monospace face is reserved for identifiers plus column-aligned figures. `src: Front-end specification, typography`
- [ ] `C-FE-46` `capability` The monospace face carries tabular figures. `src: Front-end specification, typography`
- [ ] `C-FE-47` `capability` The monospace zero is distinguishable from its capital O. `src: Front-end specification, typography`
- [ ] `C-FE-48` `constraint` The type scale is declared once in one scheme. `src: Front-end specification, typography`
- [ ] `C-FE-49` `data` The scale carries eight steps. `src: Front-end specification, typography`
- [ ] `C-FE-50` `literal` The step `h1` is `5rem` over `6rem`. `src: Front-end specification, typography`
- [ ] `C-FE-51` `literal` The step `h2` is `4rem` over `4.5rem`. `src: Front-end specification, typography`
- [ ] `C-FE-52` `literal` The step `h3` is `3rem` over `3.5rem`. `src: Front-end specification, typography`
- [ ] `C-FE-53` `literal` The step `h4` is `1.625rem` over `1.8125rem`. `src: Front-end specification, typography`
- [ ] `C-FE-54` `literal` The step `body-big` is `1.375rem` over `1.8125rem`. `src: Front-end specification, typography`
- [ ] `C-FE-55` `literal` The step `body-regular` is `1.125rem` over `1.5rem`. `src: Front-end specification, typography`
- [ ] `C-FE-56` `literal` The step `body-small` is `1rem` over `1.5rem`. `src: Front-end specification, typography`
- [ ] `C-FE-57` `literal` The step `eyebrow` is `0.875rem` over `1.125rem`. `src: Front-end specification, typography`
- [ ] `C-FE-58` `constraint` The scale carries no ninth step. `src: Front-end specification, typography`
- [ ] `C-FE-59` `data` The display sizes `12.75rem` plus `8.875rem` are absent from the scale. `src: Front-end specification, typography`
- [ ] `C-FE-60` `data` The `eyebrow` step is the floor of the scale. `src: Front-end specification, typography`
- [ ] `C-FE-61` `constraint` No size renders with a second line height. `src: Front-end specification, typography`
- [ ] `C-FE-62` `constraint` No element ships without a line height set. `src: Front-end specification, typography`
- [ ] `C-FE-63` `constraint` No declared scale step goes unused. `src: Front-end specification, typography`
- [ ] `C-FE-64` `ui` One stroke weighting carries the hierarchy with a second on the two largest steps. `src: Front-end specification, typography`
- [ ] `C-FE-65` `capability` Three named radius steps plus a pill are the only radius values. `src: Front-end specification, surface`
- [ ] `C-FE-66` `capability` Five named stacking steps are the only stacking values. `src: Front-end specification, surface`
- [ ] `C-FE-67` `constraint` No element reaches past the last named stacking step. `src: Front-end specification, surface`
- [ ] `C-FE-68` `capability` Two named shadow steps exist, both visible. `src: Front-end specification, surface`
- [ ] `C-FE-69` `capability` A mask fades the top edge of scrolling content by twenty-four pixels. `src: Front-end specification, surface`
- [ ] `C-FE-70` `constraint` No element declares a three-dimensional rendering context for two-dimensional movement. `src: Front-end specification, surface`
- [ ] `C-FE-71` `constraint` No partner mark is recoloured by a filter. `src: Front-end specification, surface`
- [ ] `C-FE-72` `constraint` No institutional mark is recoloured by a filter. `src: Front-end specification, surface`
- [ ] `C-FE-73` `capability` Two named durations plus one named curve govern every transition. `src: Front-end specification, motion`
- [ ] `C-FE-74` `constraint` No element carries a blanket transition across every property. `src: Front-end specification, motion`
- [ ] `C-FE-75` `ui` A heading resolves from a blur plus an opacity together. `src: Front-end specification, motion`
- [ ] `C-FE-76` `capability` A heading is readable before the resolve finishes. `src: Front-end specification, motion`
- [ ] `C-FE-77` `capability` No revealed element stays hidden when the reader never scrolls. `src: Front-end specification, motion`
- [ ] `C-FE-78` `constraint` No animation loops. `src: Front-end specification, motion`
- [ ] `C-FE-79` `constraint` No marquee runs. `src: Front-end specification, motion`
- [ ] `C-FE-80` `constraint` No perpetual rotation runs. `src: Front-end specification, motion`
- [ ] `C-FE-81` `capability` Under reduced motion the reveal resolves immediately. `src: Front-end specification, motion`
- [ ] `C-FE-82` `capability` Under reduced motion nothing is left blurred. `src: Front-end specification, motion`
- [ ] `C-FE-83` `capability` Under reduced motion parallax is removed. `src: Front-end specification, motion`
- [ ] `C-FE-84` `capability` Under reduced motion no media plays without a press. `src: Front-end specification, motion`
- [ ] `C-FE-85` `capability` Under forced colours every state still carries its word. `src: Front-end specification, motion`
- [ ] `C-FE-86` `capability` A print stylesheet exists. `src: Front-end specification, motion`
- [ ] `C-FE-87` `capability` A hover treatment applies only where a pointer is present. `src: Front-end specification, motion`
- [ ] `C-FE-88` `capability` Every interactive element has a hover state. `src: Front-end specification, motion`
- [ ] `C-FE-89` `capability` Every interactive element has an active state. `src: Front-end specification, motion`
- [ ] `C-FE-90` `constraint` One breakpoint system is declared once. `src: Front-end specification, layout`
- [ ] `C-FE-91` `constraint` Each media query is written one way. `src: Front-end specification, layout`
- [ ] `C-FE-92` `capability` Every route holds at the phone, tablet, desktop widths. `src: Front-end specification, layout`
- [ ] `C-FE-93` `capability` The board carries four columns at desktop. `src: Front-end specification, layout`
- [ ] `C-FE-94` `capability` The board carries two columns at tablet. `src: Front-end specification, layout`
- [ ] `C-FE-95` `capability` The board carries one column at phone. `src: Front-end specification, layout`
- [ ] `C-FE-96` `capability` A card names its column in text rather than by position alone. `src: Front-end specification, layout`
- [ ] `C-FE-97` `constraint` A recycled-content percentage renders with its claim type in every component. `src: Front-end specification, three figures`
- [ ] `C-FE-98` `constraint` A carbon figure renders with its boundary, method version, uncertainty in every component. `src: Front-end specification, three figures`
- [ ] `C-FE-99` `constraint` A capacity figure renders with its confidence in every component. `src: Front-end specification, three figures`
- [ ] `C-FE-100` `constraint` A tooltip carries the dependencies or omits the figure. `src: Front-end specification, three figures`
- [ ] `C-FE-101` `constraint` An export header carries the dependencies or omits the figure. `src: Front-end specification, three figures`
- [ ] `C-FE-102` `ui` A compact variant carries the claim type as a word rather than a colour. `src: Front-end specification, three figures`
- [ ] `C-FE-103` `capability` The genealogy view draws a graph rather than a tree. `src: Front-end specification, genealogy`
- [ ] `C-FE-104` `capability` A batch reaching the lot by several paths is drawn once. `src: Front-end specification, genealogy`
- [ ] `C-FE-105` `capability` A genealogy edge carries mass rather than a percentage. `src: Front-end specification, genealogy`
- [ ] `C-FE-106` `capability` A genealogy node shows what the node is. `src: Front-end specification, genealogy`
- [ ] `C-FE-107` `capability` A genealogy node shows its mass. `src: Front-end specification, genealogy`
- [ ] `C-FE-108` `capability` A genealogy node shows its category split. `src: Front-end specification, genealogy`
- [ ] `C-FE-109` `capability` A flag anywhere in the graph is visible from the lot without expanding. `src: Front-end specification, genealogy`
- [ ] `C-FE-110` `capability` The same component runs backwards from a batch. `src: Front-end specification, genealogy`
- [ ] `C-FE-111` `capability` Both directions carry the same facts as a nested list. `src: Front-end specification, genealogy`
- [ ] `C-FE-112` `constraint` The nested list is not a summary. `src: Front-end specification, genealogy`
- [ ] `C-FE-113` `constraint` The balance screen carries no input control. `src: Front-end specification, balance`
- [ ] `C-FE-114` `capability` Every balance figure links to the records behind the figure. `src: Front-end specification, balance`
- [ ] `C-FE-115` `ui` The invariant margin is shown as a mass rather than as a state word. `src: Front-end specification, balance`
- [ ] `C-FE-116` `capability` The override count sits beside the open restatement count. `src: Front-end specification, balance`
- [ ] `C-FE-117` `capability` The audit-finding count sits beside the other two counts. `src: Front-end specification, balance`
- [ ] `C-FE-118` `ui` No balance count is rendered as a badge. `src: Front-end specification, balance`
- [ ] `C-FE-119` `constraint` No balance count renders in the accent. `src: Front-end specification, balance`
- [ ] `C-FE-120` `capability` The wizard has four steps at four addresses. `src: Front-end specification, wizard`
- [ ] `C-FE-121` `capability` Each wizard step shows the eight conditions as eight statements. `src: Front-end specification, wizard`
- [ ] `C-FE-122` `capability` An unsatisfied condition names exactly what blocks the condition. `src: Front-end specification, wizard`
- [ ] `C-FE-123` `capability` An unsatisfied condition links to the record that would resolve the block. `src: Front-end specification, wizard`
- [ ] `C-FE-124` `capability` The fourth step renders the exact document to be signed. `src: Front-end specification, wizard`
- [ ] `C-FE-125` `capability` The rendered document carries the permitted statement. `src: Front-end specification, wizard`
- [ ] `C-FE-126` `capability` The rendered document carries the prohibited statement. `src: Front-end specification, wizard`
- [ ] `C-FE-127` `ui` Signing is a separate deliberate act. `src: Front-end specification, wizard`
- [ ] `C-FE-128` `ui` The signing screen states the recipient will file the document with a regulator. `src: Front-end specification, wizard`
- [ ] `C-FE-129` `capability` The withdrawal screen shows the five consequences. `src: Front-end specification, wizard`
- [ ] `C-FE-130` `capability` The reconciliation view shows six figures. `src: Front-end specification, five surfaces`
- [ ] `C-FE-131` `ui` The reconciliation view shows the mass balance residual as its headline. `src: Front-end specification, five surfaces`
- [ ] `C-FE-132` `capability` The reconciliation view shows the current period against the last three. `src: Front-end specification, five surfaces`
- [ ] `C-FE-133` `capability` The scheme status banner names the effective window of a suspension. `src: Front-end specification, five surfaces`
- [ ] `C-FE-134` `capability` The scheme status banner links to the enumeration of affected certificates. `src: Front-end specification, five surfaces`
- [ ] `C-FE-135` `constraint` The scheme status banner is not dismissible. `src: Front-end specification, five surfaces`
- [ ] `C-FE-136` `capability` The contract projection shows delivered, running content, the floor, the required average. `src: Front-end specification, five surfaces`
- [ ] `C-FE-137` `ui` The unreachable state is a word beside a date rather than a colour. `src: Front-end specification, five surfaces`
- [ ] `C-FE-138` `capability` The energy panel shows the location-based figure beside the market-based figure. `src: Front-end specification, five surfaces`
- [ ] `C-FE-139` `capability` The energy panel lists the retired instruments beneath the two figures. `src: Front-end specification, five surfaces`
- [ ] `C-FE-140` `capability` The energy panel names the unmatched consumption. `src: Front-end specification, five surfaces`
- [ ] `C-FE-141` `capability` The replay result shows what the certificate said beside what recomputation says. `src: Front-end specification, five surfaces`
- [ ] `C-FE-142` `capability` The replay result names the input that differs. `src: Front-end specification, five surfaces`
- [ ] `C-FE-143` `ui` Agreement plus disagreement render at identical visual emphasis on the replay result. `src: Front-end specification, five surfaces`
- [ ] `C-FE-144` `capability` The certificate document is readable as plain text with no styling. `src: Front-end specification, accessibility`
- [ ] `C-FE-145` `capability` The plain-text certificate keeps its claim type. `src: Front-end specification, accessibility`
- [ ] `C-FE-146` `capability` The plain-text certificate keeps its percentage. `src: Front-end specification, accessibility`
- [ ] `C-FE-147` `capability` The plain-text certificate keeps the four carbon components. `src: Front-end specification, accessibility`
- [ ] `C-FE-148` `capability` The plain-text certificate keeps the permitted statement. `src: Front-end specification, accessibility`
- [ ] `C-FE-149` `capability` The certificate prints without a page break inside the permitted statement. `src: Front-end specification, accessibility`
- [ ] `C-FE-150` `capability` The certificate structure is real headings in order. `src: Front-end specification, accessibility`
- [ ] `C-FE-151` `capability` A reader moving by heading reaches the claim type before the percentage. `src: Front-end specification, accessibility`
- [ ] `C-FE-152` `capability` A withdrawn certificate says `withdrawn` before showing any figure. `src: Front-end specification, accessibility`
- [ ] `C-FE-153` `literal` A public route stays under `220000` bytes before first paint. `src: Front-end specification, performance`
- [ ] `C-FE-154` `literal` A console route stays under `320000` bytes before first paint. `src: Front-end specification, performance`
- [ ] `C-FE-155` `literal` A balance route stays under `360000` bytes before first paint. `src: Front-end specification, performance`
- [ ] `C-FE-156` `literal` Fonts stay under `140000` bytes per route. `src: Front-end specification, performance`
- [ ] `C-FE-157` `constraint` No media loads before interaction. `src: Front-end specification, performance`
- [ ] `C-FE-158` `constraint` No route loads a library the route does not use. `src: Front-end specification, performance`
- [ ] `C-FE-159` `capability` A poster frame stands in until somebody presses. `src: Front-end specification, performance`
- [ ] `C-FE-160` `capability` One media rendition is served per viewport. `src: Front-end specification, performance`
- [ ] `C-FE-161` `capability` Every image declares its dimensions. `src: Front-end specification, performance`
- [ ] `C-FE-162` `constraint` No source map ships. `src: Front-end specification, performance`
- [ ] `C-FE-163` `constraint` No general-purpose DOM library ships alongside the framework. `src: Front-end specification, performance`
- [ ] `C-FE-164` `literal` The home route carries the line `Tomorrow's materials. Made from today's waste.` `src: Front-end specification, copy`
- [ ] `C-FE-165` `capability` The home route carries the nylon-endurance headline named in the copy deck. `src: Front-end specification, copy`
- [ ] `C-FE-166` `literal` The home route carries the line `The power of green chemistry`. `src: Front-end specification, copy`
- [ ] `C-FE-167` `literal` The home route carries the line `We're closing the loop`. `src: Front-end specification, copy`
- [ ] `C-FE-168` `capability` The closing-the-loop heading is followed by a written section. `src: Front-end specification, copy`
- [ ] `C-FE-169` `literal` The product route carries the line `Same material. Better origin.` `src: Front-end specification, copy`
- [ ] `C-FE-170` `capability` Each grade names its real limitation before its claim. `src: Front-end specification, copy`
- [ ] `C-FE-171` `capability` Six industries are listed on the product route. `src: Front-end specification, copy`
- [ ] `C-FE-172` `literal` The first product feature is headed `Nylon in any form`. `src: Front-end specification, copy`
- [ ] `C-FE-173` `capability` The specifications section carries the specification rather than a request button. `src: Front-end specification, copy`
- [ ] `C-FE-174` `capability` The recycled-content claim appears beside the grade the claim applies to. `src: Front-end specification, copy`
- [ ] `C-FE-175` `literal` The technology route carries the commercial capacity `>25,000 tonnes per year`. `src: Front-end specification, copy`
- [ ] `C-FE-176` `capability` The capacity table states its unit once. `src: Front-end specification, copy`
- [ ] `C-FE-177` `capability` The pilot row carries a quantity rather than a word. `src: Front-end specification, copy`
- [ ] `C-FE-178` `capability` Each published statistic shows its source beside the figure. `src: Front-end specification, copy`
- [ ] `C-FE-179` `capability` Each published statistic shows its year beside the figure. `src: Front-end specification, copy`
- [ ] `C-FE-180` `capability` Each published statistic shows its geography beside the figure. `src: Front-end specification, copy`
- [ ] `C-FE-181` `literal` The careers route carries the heading about why the problem matters. `src: Front-end specification, copy`
- [ ] `C-FE-182` `capability` One news event is listed once with its coverage. `src: Front-end specification, copy`
- [ ] `C-FE-183` `capability` An item in another language says so before a reader clicks. `src: Front-end specification, copy`
- [ ] `C-FE-184` `capability` The contact route offers four enquiry types with four stated response times. `src: Front-end specification, copy`
- [ ] `C-FE-185` `constraint` Neither enquiry result state is a builder default string. `src: Front-end specification, copy`
- [ ] `C-FE-186` `capability` The enquiry failure state offers an address independent of the form. `src: Front-end specification, copy`
- [ ] `C-FE-187` `capability` Every route carries its own title. `src: Front-end specification, copy`
- [ ] `C-FE-188` `capability` Every route carries its own description. `src: Front-end specification, copy`
- [ ] `C-FE-189` `constraint` The verification route is excluded from indexing. `src: Front-end specification, copy`
- [ ] `C-FE-190` `capability` The product copy states the material is claimed by mass balance rather than physically segregated. `src: Front-end specification, product copy`
- [ ] `C-FE-191` `capability` The product copy states the recipient may not describe the material as physically containing recycled content. `src: Front-end specification, product copy`
- [ ] `C-FE-192` `literal` The product copy carries `Losses reduce the claim.` `src: Front-end specification, product copy`
- [ ] `C-FE-193` `capability` The product copy states a closed period needs a restatement for a correction. `src: Front-end specification, product copy`
- [ ] `C-FE-194` `capability` A refused allocation states the available mass beside the requested mass. `src: Front-end specification, product copy`
- [ ] `C-FE-195` `capability` An override notice states that the override cannot be removed. `src: Front-end specification, product copy`
- [ ] `C-FE-196` `constraint` No photograph of the reference is reproduced. `src: Front-end specification, imagery`
- [ ] `C-FE-197` `constraint` No named individual appears anywhere. `src: Front-end specification, imagery`
- [ ] `C-FE-198` `constraint` No investor, brand partner, outlet or agency is named. `src: Front-end specification, imagery`
- [ ] `C-FE-199` `ui` Pellets are photographed rather than rendered. `src: Front-end specification, imagery`
- [ ] `C-FE-200` `ui` Waste imagery shows mixed contaminated waste rather than sorted offcuts. `src: Front-end specification, imagery`
- [ ] `C-FE-201` `capability` The plant is drawn rather than photographed. `src: Front-end specification, imagery`
- [ ] `C-FE-202` `capability` The plant diagram is generated from the four run types. `src: Front-end specification, imagery`
- [ ] `C-FE-203` `capability` The plant diagram carries mass in beside mass out per stage. `src: Front-end specification, imagery`
- [ ] `C-FE-204` `capability` The plant diagram carries a text equivalent. `src: Front-end specification, imagery`
- [ ] `C-FE-205` `capability` Every interface mark carries a text label beside the mark. `src: Front-end specification, imagery`
- [ ] `C-FE-206` `literal` The declaration `transition: all` appears on no element in the built stylesheet. `src: Front-end specification, motion`

## C-CN Constraints

- [ ] `C-CN-01` `constraint` No route accepts a recycled-content percentage from a caller. `src: Constraints para 1`
- [ ] `C-CN-02` `constraint` No route accepts a carbon value from a caller. `src: Constraints para 1`
- [ ] `C-CN-03` `constraint` No route accepts a loss figure from a caller. `src: Constraints para 1`
- [ ] `C-CN-04` `constraint` A closed run is immutable. `src: Constraints para 2`
- [ ] `C-CN-05` `constraint` A closed balance period is immutable. `src: Constraints para 2`
- [ ] `C-CN-06` `constraint` An issued certificate is immutable. `src: Constraints para 2`
- [ ] `C-CN-07` `constraint` A published method version is immutable. `src: Constraints para 2`
- [ ] `C-CN-08` `constraint` A correction is a new record naming what the record corrects. `src: Constraints para 2`
- [ ] `C-CN-09` `constraint` No record is edited. `src: Constraints para 2`
- [ ] `C-CN-10` `constraint` No record is removed from the sequence. `src: Constraints para 2`
- [ ] `C-CN-11` `constraint` A batch category cannot be changed after acceptance through any route. `src: Constraints para 3`
- [ ] `C-CN-12` `constraint` The product controls no equipment. `src: Constraints para 4`
- [ ] `C-CN-13` `constraint` No mail is sent beyond the four named acts. `src: Constraints para 4`
- [ ] `C-CN-14` `constraint` The product takes no payment. `src: Constraints para 4`
- [ ] `C-CN-15` `constraint` The product stores no file in an object store. `src: Constraints para 4`
- [ ] `C-CN-16` `constraint` No route creates an account. `src: Constraints para 5`
- [ ] `C-CN-17` `constraint` No route resets a password. `src: Constraints para 5`

## C-DC Deployment contract

- [ ] `C-DC-01` `contract` The app is reachable at `APP_PUBLIC_URL`. `src: Deployment contract`
- [ ] `C-DC-02` `literal` The container-internal port is `4173`. `src: Deployment contract`
- [ ] `C-DC-03` `contract` The HTTP API is served on the same origin under the `/api` prefix. `src: Deployment contract`
- [ ] `C-DC-04` `contract` `GET /api/health` returns `200` once the app is ready. `src: Deployment contract`
- [ ] `C-DC-05` `contract` The app starts from the environment image with no manual steps. `src: Deployment contract`
- [ ] `C-DC-06` `contract` Credentials are written to `/app/USER_README.md`. `src: Deployment contract`
- [ ] `C-DC-07` `contract` The reserved directories `.browser_screenshots/` plus `.downloads/` exist empty at the app root. `src: Deployment contract`
- [ ] `C-DC-08` `contract` A production build is served behind a static or preview server. `src: Deployment contract`
- [ ] `C-DC-09` `contract` The server keeps running after the session ends. `src: Deployment contract`
- [ ] `C-DC-10` `contract` The server is not a child of the shell. `src: Deployment contract`
- [ ] `C-DC-11` `contract` The server binds `0.0.0.0`. `src: Deployment contract`
- [ ] `C-DC-12` `constraint` No backing service is downloaded, installed, compiled or started by the app. `src: Deployment contract`
- [ ] `C-DC-13` `constraint` No edge function is used. `src: Deployment contract`
- [ ] `C-DC-14` `constraint` No persistent volume, fixed container name or custom network is declared. `src: Deployment contract`
- [ ] `C-DC-15` `contract` `POST /api/auth/login` returns `access_token`. `src: Deployment contract, API shapes`
- [ ] `C-DC-16` `contract` `POST /api/auth/login` returns `token_type`. `src: Deployment contract, API shapes`
- [ ] `C-DC-17` `contract` `GET /api/sites` lists the three sites with their confidence. `src: Deployment contract, API shapes`
- [ ] `C-DC-18` `contract` `GET /api/collectors` lists collectors with their approval periods. `src: Deployment contract, API shapes`
- [ ] `C-DC-19` `contract` `GET /api/batches` returns the batch register. `src: Deployment contract, API shapes`
- [ ] `C-DC-20` `contract` `GET /api/runs` returns the rows the board renders. `src: Deployment contract, API shapes`
- [ ] `C-DC-21` `contract` `GET /api/lots` returns the lot register. `src: Deployment contract, API shapes`
- [ ] `C-DC-22` `contract` `GET /api/balance-periods` returns the ledger per site, grade, period. `src: Deployment contract, API shapes`
- [ ] `C-DC-23` `contract` `GET /api/certificates` returns the certificate register. `src: Deployment contract, API shapes`
- [ ] `C-DC-24` `contract` `POST /api/enquiries` accepts the public enquiry form. `src: Deployment contract, API shapes`
- [ ] `C-DC-25` `contract` `GET /api/record` returns the append-only record. `src: Deployment contract, API shapes`
- [ ] `C-DC-26` `contract` `GET /api/reconciliation` returns the six figures. `src: Deployment contract, API shapes`
- [ ] `C-DC-27` `contract` `GET /api/statistics` returns the published figures with their sources. `src: Deployment contract, API shapes`
- [ ] `C-DC-28` `contract` `GET /api/positions` returns the open roles. `src: Deployment contract, API shapes`
- [ ] `C-DC-29` `contract` `GET /api/news` returns the news items. `src: Deployment contract, API shapes`
- [ ] `C-DC-30` `contract` Every collection route returns a top-level JSON array. `src: Deployment contract, API shapes`
- [ ] `C-DC-31` `contract` Every single-object route returns one JSON object. `src: Deployment contract, API shapes`
- [ ] `C-DC-32` `contract` A mass field is an integer number of grams on every route. `src: Deployment contract, API shapes`
- [ ] `C-DC-33` `contract` A proportion field is an integer number of bp on every route. `src: Deployment contract, API shapes`
- [ ] `C-DC-34` `constraint` Every record lives in the database rather than in memory. `src: Deployment contract, no mocks`
- [ ] `C-DC-35` `constraint` Every account lives at the identity provider. `src: Deployment contract, no mocks`
- [ ] `C-DC-36` `constraint` Every mail leaves through the mail server rather than a log. `src: Deployment contract, no mocks`
- [ ] `C-DC-37` `constraint` No fixture file stands in for a table. `src: Deployment contract, no mocks`
- [ ] `C-DC-38` `contract` `POST /api/inbound/{source}` records one inbound payload. `src: Deployment contract, API shapes`
- [ ] `C-DC-39` `contract` `GET /api/inbound` returns what has arrived from each source. `src: Deployment contract, API shapes`
- [ ] `C-DC-40` `contract` `GET /api/record/queries/{name}` returns one record answer. `src: Deployment contract, API shapes`
- [ ] `C-DC-41` `contract` `GET /api/parties/{reference}/versions` returns the names a party held. `src: Deployment contract, API shapes`

## Pinned literals

| Value | What the instruction calls it | Item | Where |
|---|---|---|---|
| `dissolution` | The four run stages are `dissolution`, `depolymerisation`, `purification`, `repolymerisation` | `C-OV-03` | Overview para 1 |
| `depolymerisation` | The four run stages are `dissolution`, `depolymerisation`, `purification`, `repolymerisation` | `C-OV-03` | Overview para 1 |
| `purification` | The four run stages are `dissolution`, `depolymerisation`, `purification`, `repolymerisation` | `C-OV-03` | Overview para 1 |
| `repolymerisation` | The four run stages are `dissolution`, `depolymerisation`, `purification`, `repolymerisation` | `C-OV-03` | Overview para 1 |
| `plant@example.com` | The seeded account `plant@example.com` signs in | `C-RL-52` | User roles, plant operator |
| `analyst@example.com` | The seeded account `analyst@example.com` signs in | `C-RL-53` | User roles, laboratory analyst |
| `quality@example.com` | The seeded account `quality@example.com` signs in | `C-RL-54` | User roles, quality manager |
| `claims@example.com` | The seeded account `claims@example.com` signs in | `C-RL-55` | User roles, claims manager |
| `signer@example.com` | The seeded account `signer@example.com` signs in | `C-RL-56` | User roles, certificate signer |
| `signer2@example.com` | The seeded account `signer2@example.com` signs in | `C-RL-57` | User roles, second signer |
| `auditor@example.com` | The seeded account `auditor@example.com` signs in | `C-RL-58` | User roles, auditor |
| `deku-demo-pw-2026` | Every seeded account signs in with `deku-demo-pw-2026` | `C-RL-59` | User roles para 1 |
| `/` | The public route `/` needs no session | `C-UF-01` | User flow para 1 |
| `/product` | The public route `/product` needs no session | `C-UF-02` | User flow para 1 |
| `/technology` | The public route `/technology` needs no session | `C-UF-03` | User flow para 1 |
| `/about` | The public route `/about` needs no session | `C-UF-04` | User flow para 1 |
| `/careers` | The public route `/careers` needs no session | `C-UF-05` | User flow para 1 |
| `/news` | The public route `/news` needs no session | `C-UF-06` | User flow para 1 |
| `/contact` | The public route `/contact` needs no session | `C-UF-07` | User flow para 1 |
| `/privacy` | The public route `/privacy` needs no session | `C-UF-08` | User flow para 1 |
| `/console/certificates/new/lot` | The wizard step `/console/certificates/new/lot` is reachable at its own address | `C-UF-18` | User flow, signer journey |
| `/console/certificates/new/claim` | The wizard step `/console/certificates/new/claim` is reachable at its own address | `C-UF-19` | User flow, signer journey |
| `/console/certificates/new/recipient` | The wizard step `/console/certificates/new/recipient` is reachable at its own address | `C-UF-20` | User flow, signer journey |
| `/console/certificates/new/review` | The wizard step `/console/certificates/new/review` is reachable at its own address | `C-UF-21` | User flow, signer journey |
| `DATABASE_URL` | The database is reached at `DATABASE_URL` | `C-TR-04` | Technical requirements para 2 |
| `AUTH_ISSUER_URL` | The identity provider is reached at `AUTH_ISSUER_URL` | `C-TR-05` | Technical requirements para 2 |
| `AUTH_CLIENT_ID` | The identity client is named by `AUTH_CLIENT_ID` | `C-TR-06` | Technical requirements para 2 |
| `AUTH_CLIENT_SECRET` | The identity secret is read from `AUTH_CLIENT_SECRET` | `C-TR-07` | Technical requirements para 2 |
| `SMTP_HOST` | The mail server host is read from `SMTP_HOST` | `C-TR-08` | Technical requirements para 2 |
| `SMTP_PORT` | The mail server port is read from `SMTP_PORT` | `C-TR-09` | Technical requirements para 2 |
| `commissioned` | A site confidence is one of `commissioned`, `under_construction`, `consented`, `planned` | `C-TR-49` | Technical requirements, sites |
| `under_construction` | A site confidence is one of `commissioned`, `under_construction`, `consented`, `planned` | `C-TR-49` | Technical requirements, sites |
| `consented` | A site confidence is one of `commissioned`, `under_construction`, `consented`, `planned` | `C-TR-49` | Technical requirements, sites |
| `planned` | A site confidence is one of `commissioned`, `under_construction`, `consented`, `planned` | `C-TR-49` | Technical requirements, sites |
| `approved` | An approval state is one of `approved`, `conditional`, `suspended`, `lapsed` | `C-TR-60` | Technical requirements, collectors |
| `conditional` | An approval state is one of `approved`, `conditional`, `suspended`, `lapsed` | `C-TR-60` | Technical requirements, collectors |
| `suspended` | An approval state is one of `approved`, `conditional`, `suspended`, `lapsed` | `C-TR-60` | Technical requirements, collectors |
| `lapsed` | An approval state is one of `approved`, `conditional`, `suspended`, `lapsed` | `C-TR-60` | Technical requirements, collectors |
| `declared` | A composition basis is one of `declared`, `sampled`, `assayed` | `C-TR-73` | Technical requirements, intake |
| `sampled` | A composition basis is one of `declared`, `sampled`, `assayed` | `C-TR-73` | Technical requirements, intake |
| `assayed` | A composition basis is one of `declared`, `sampled`, `assayed` | `C-TR-73` | Technical requirements, intake |
| `collection_site` | A custody link kind is one of `collection_site`, `collector`, `transport`, `arrival`, `weighing`, `acceptance` | `C-TR-76` | Technical requirements, intake |
| `collector` | A custody link kind is one of `collection_site`, `collector`, `transport`, `arrival`, `weighing`, `acceptance` | `C-TR-76` | Technical requirements, intake |
| `transport` | A custody link kind is one of `collection_site`, `collector`, `transport`, `arrival`, `weighing`, `acceptance` | `C-TR-76` | Technical requirements, intake |
| `arrival` | A custody link kind is one of `collection_site`, `collector`, `transport`, `arrival`, `weighing`, `acceptance` | `C-TR-76` | Technical requirements, intake |
| `weighing` | A custody link kind is one of `collection_site`, `collector`, `transport`, `arrival`, `weighing`, `acceptance` | `C-TR-76` | Technical requirements, intake |
| `acceptance` | A custody link kind is one of `collection_site`, `collector`, `transport`, `arrival`, `weighing`, `acceptance` | `C-TR-76` | Technical requirements, intake |
| `intermediate` | An output kind is one of `intermediate`, `lot`, `byproduct` | `C-TR-91` | Technical requirements, runs |
| `lot` | An output kind is one of `intermediate`, `lot`, `byproduct` | `C-TR-91` | Technical requirements, runs |
| `byproduct` | An output kind is one of `intermediate`, `lot`, `byproduct` | `C-TR-91` | Technical requirements, runs |
| `sold` | A byproduct disposition is one of `sold`, `disposed` | `C-TR-92` | Technical requirements, runs |
| `disposed` | A byproduct disposition is one of `sold`, `disposed` | `C-TR-92` | Technical requirements, runs |
| `pending` | A lot disposition is one of `pending`, `released`, `quarantined`, `rejected` | `C-TR-113` | Technical requirements, results |
| `released` | A lot disposition is one of `pending`, `released`, `quarantined`, `rejected` | `C-TR-113` | Technical requirements, results |
| `quarantined` | A lot disposition is one of `pending`, `released`, `quarantined`, `rejected` | `C-TR-113` | Technical requirements, results |
| `rejected` | A lot disposition is one of `pending`, `released`, `quarantined`, `rejected` | `C-TR-113` | Technical requirements, results |
| `root_cause_found` | A deviation outcome is one of `root_cause_found`, `cause_not_established` | `C-TR-115` | Technical requirements, deviations |
| `cause_not_established` | A deviation outcome is one of `root_cause_found`, `cause_not_established` | `C-TR-115` | Technical requirements, deviations |
| `reissued` | A resolution outcome is one of `reissued`, `withdrawn`, `unaffected` | `C-TR-144` | Technical requirements, ledger |
| `withdrawn` | A resolution outcome is one of `reissued`, `withdrawn`, `unaffected` | `C-TR-144` | Technical requirements, ledger |
| `unaffected` | A resolution outcome is one of `reissued`, `withdrawn`, `unaffected` | `C-TR-144` | Technical requirements, ledger |
| `mass` | An allocation basis is one of `mass`, `energy`, `economic` | `C-TR-155` | Technical requirements, byproducts |
| `energy` | An allocation basis is one of `mass`, `energy`, `economic` | `C-TR-155` | Technical requirements, byproducts |
| `economic` | An allocation basis is one of `mass`, `energy`, `economic` | `C-TR-155` | Technical requirements, byproducts |
| `primary` | A data tag is one of `primary`, `supplier_specific`, `secondary` | `C-TR-170` | Technical requirements, carbon |
| `supplier_specific` | A data tag is one of `primary`, `supplier_specific`, `secondary` | `C-TR-170` | Technical requirements, carbon |
| `secondary` | A data tag is one of `primary`, `supplier_specific`, `secondary` | `C-TR-170` | Technical requirements, carbon |
| `physically_segregated` | A claim type is one of `physically_segregated`, `controlled_blending`, `mass_balance` | `C-TR-197` | Technical requirements, certificates |
| `controlled_blending` | A claim type is one of `physically_segregated`, `controlled_blending`, `mass_balance` | `C-TR-197` | Technical requirements, certificates |
| `mass_balance` | A claim type is one of `physically_segregated`, `controlled_blending`, `mass_balance` | `C-TR-197` | Technical requirements, certificates |
| `guaranteed` | A specification basis is one of `guaranteed`, `typical`, `informational` | `C-TR-221` | Technical requirements, customers |
| `typical` | A specification basis is one of `guaranteed`, `typical`, `informational` | `C-TR-221` | Technical requirements, customers |
| `informational` | A specification basis is one of `guaranteed`, `typical`, `informational` | `C-TR-221` | Technical requirements, customers |
| `on_track` | A projection state is one of `on_track`, `unreachable` | `C-TR-234` | Technical requirements, contracts |
| `unreachable` | A projection state is one of `on_track`, `unreachable` | `C-TR-234` | Technical requirements, contracts |
| `funding` | A news tag is one of `funding`, `partnership`, `technical`, `recognition` | `C-TR-263` | Technical requirements, published |
| `partnership` | A news tag is one of `funding`, `partnership`, `technical`, `recognition` | `C-TR-263` | Technical requirements, published |
| `technical` | A news tag is one of `funding`, `partnership`, `technical`, `recognition` | `C-TR-263` | Technical requirements, published |
| `recognition` | A news tag is one of `funding`, `partnership`, `technical`, `recognition` | `C-TR-263` | Technical requirements, published |
| `waste_supply` | An enquiry type is one of `waste_supply`, `polymer_purchase`, `partnership`, `press` | `C-TR-269` | Technical requirements, enquiries |
| `polymer_purchase` | An enquiry type is one of `waste_supply`, `polymer_purchase`, `partnership`, `press` | `C-TR-269` | Technical requirements, enquiries |
| `press` | An enquiry type is one of `waste_supply`, `polymer_purchase`, `partnership`, `press` | `C-TR-269` | Technical requirements, enquiries |
| `Certificate <number> issued` | A certificate issue mail carries the subject `Certificate <number> issued` | `C-TR-276` | Technical requirements, mail |
| `Certificate <number> withdrawn` | A certificate withdrawal mail carries the subject `Certificate <number> withdrawn` | `C-TR-277` | Technical requirements, mail |
| `Change notice <id> requires acknowledgement` | A change notice mail carries the subject `Change notice <id> requires acknowledgement` | `C-TR-278` | Technical requirements, mail |
| `Enquiry <reference> received` | An enquiry mail carries the subject `Enquiry <reference> received` | `C-TR-279` | Technical requirements, mail |
| `weighbridge` | An inbound source is one of `weighbridge`, `control_system`, `laboratory`, `customer_reporting` | `C-TR-293` | Technical requirements, inbound |
| `control_system` | An inbound source is one of `weighbridge`, `control_system`, `laboratory`, `customer_reporting` | `C-TR-293` | Technical requirements, inbound |
| `laboratory` | An inbound source is one of `weighbridge`, `control_system`, `laboratory`, `customer_reporting` | `C-TR-293` | Technical requirements, inbound |
| `customer_reporting` | An inbound source is one of `weighbridge`, `control_system`, `laboratory`, `customer_reporting` | `C-TR-293` | Technical requirements, inbound |
| `lots_from_batch` | The record query `lots_from_batch` resolves | `C-TR-313` | Technical requirements, record queries |
| `certificates_on_period` | The record query `certificates_on_period` resolves | `C-TR-314` | Technical requirements, record queries |
| `certificates_under_method_version` | The record query `certificates_under_method_version` resolves | `C-TR-315` | Technical requirements, record queries |
| `lots_released_under_unreviewed_override` | The record query `lots_released_under_unreviewed_override` resolves | `C-TR-316` | Technical requirements, record queries |
| `allocations_in_final_fortnight` | The record query `allocations_in_final_fortnight` resolves | `C-TR-317` | Technical requirements, record queries |
| `refused_allocations` | The record query `refused_allocations` resolves | `C-TR-318` | Technical requirements, record queries |
| `collector_declaration_departures` | The record query `collector_declaration_departures` resolves | `C-TR-319` | Technical requirements, record queries |
| `acts_by_person` | The record query `acts_by_person` resolves | `C-TR-320` | Technical requirements, record queries |
| `exports_by_auditor` | The record query `exports_by_auditor` resolves | `C-TR-321` | Technical requirements, record queries |
| `SITE-PILOT` | The site `SITE-PILOT` is seeded with confidence `commissioned` | `C-DM-07` | Data model, sites |
| `SITE-DEMO` | The site `SITE-DEMO` is seeded with confidence `commissioned` | `C-DM-08` | Data model, sites |
| `SITE-COMM` | The site `SITE-COMM` is seeded with confidence `planned` | `C-DM-09` | Data model, sites |
| `40000` | `SITE-PILOT` is seeded with nameplate `40000` kilograms | `C-DM-10` | Data model, sites |
| `400000` | `SITE-DEMO` is seeded with nameplate `400000` kilograms | `C-DM-11` | Data model, sites |
| `25000000` | `SITE-COMM` is seeded with nameplate `25000000` kilograms | `C-DM-12` | Data model, sites |
| `320000` | `SITE-DEMO` is seeded with contracted `320000` kilograms | `C-DM-13` | Data model, sites |
| `26000000` | `SITE-COMM` is seeded with contracted `26000000` kilograms | `C-DM-14` | Data model, sites |
| `8000 hours per year, 0.90 availability, 0.80 yield` | The capacity basis reads `8000 hours per year, 0.90 availability, 0.80 yield` | `C-DM-16` | Data model, sites |
| `2026-06-30` | The capacity revision date is `2026-06-30` | `C-DM-17` | Data model, sites |
| `plant_operator` | `plant@example.com` holds the role `plant_operator` | `C-DM-19` | Data model, accounts |
| `lab_analyst` | `analyst@example.com` holds the role `lab_analyst` | `C-DM-20` | Data model, accounts |
| `quality_manager` | `quality@example.com` holds the role `quality_manager` | `C-DM-21` | Data model, accounts |
| `claims_manager` | `claims@example.com` holds the role `claims_manager` | `C-DM-22` | Data model, accounts |
| `certificate_signer` | `signer@example.com` holds the role `certificate_signer` | `C-DM-23` | Data model, accounts |
| `auditor` | `auditor@example.com` holds the role `auditor` | `C-DM-25` | Data model, accounts |
| `2027-06-30` | Every seeded grant ends on `2027-06-30` | `C-DM-26` | Data model, accounts |
| `COL-ALDER` | The collector `COL-ALDER` is seeded in country `PT` | `C-DM-27` | Data model, collectors |
| `PT` | The collector `COL-ALDER` is seeded in country `PT` | `C-DM-27` | Data model, collectors |
| `COL-BRINE` | The collector `COL-BRINE` is seeded in country `NL` | `C-DM-28` | Data model, collectors |
| `NL` | The collector `COL-BRINE` is seeded in country `NL` | `C-DM-28` | Data model, collectors |
| `COL-CINDER` | The collector `COL-CINDER` is seeded in country `FR` | `C-DM-29` | Data model, collectors |
| `FR` | The collector `COL-CINDER` is seeded in country `FR` | `C-DM-29` | Data model, collectors |
| `WCR-PT-4471` | `COL-ALDER` carries the registration `WCR-PT-4471` | `C-DM-30` | Data model, collectors |
| `WCR-NL-2208` | `COL-BRINE` carries the registration `WCR-NL-2208` | `C-DM-31` | Data model, collectors |
| `WCR-FR-6613` | `COL-CINDER` carries the registration `WCR-FR-6613` | `C-DM-32` | Data model, collectors |
| `2026-01-01` | `COL-ALDER` is approved from `2026-01-01` to `2026-12-31` | `C-DM-33` | Data model, collectors |
| `2026-12-31` | `COL-ALDER` is approved from `2026-01-01` to `2026-12-31` | `C-DM-33` | Data model, collectors |
| `2026-10-31` | The `COL-CINDER` condition closes by `2026-10-31` | `C-DM-36` | Data model, collectors |
| `WB-DEMO-01` | The device `WB-DEMO-01` was calibrated on `2026-05-01` | `C-DM-37` | Data model, devices |
| `2026-05-01` | The device `WB-DEMO-01` was calibrated on `2026-05-01` | `C-DM-37` | Data model, devices |
| `WB-DEMO-02` | The device `WB-DEMO-02` was calibrated on `2025-02-01` | `C-DM-38` | Data model, devices |
| `2025-02-01` | The device `WB-DEMO-02` was calibrated on `2025-02-01` | `C-DM-38` | Data model, devices |
| `BATCH-1001` | `BATCH-1001` is seeded from `COL-ALDER` as `post_consumer` | `C-DM-40` | Data model, batches |
| `post_consumer` | `BATCH-1001` is seeded from `COL-ALDER` as `post_consumer` | `C-DM-40` | Data model, batches |
| `500000` | `BATCH-1001` carries net mass `500000` grams | `C-DM-41` | Data model, batches |
| `1000` | `BATCH-1001` carries moisture `1000` bp | `C-DM-42` | Data model, batches |
| `BATCH-1002` | `BATCH-1002` is seeded from `COL-ALDER` as `pre_consumer` | `C-DM-44` | Data model, batches |
| `pre_consumer` | `BATCH-1002` is seeded from `COL-ALDER` as `pre_consumer` | `C-DM-44` | Data model, batches |
| `300000` | `BATCH-1002` carries net mass `300000` grams | `C-DM-45` | Data model, batches |
| `BATCH-1003` | `BATCH-1003` is seeded from `COL-BRINE` received on `2026-07-05` | `C-DM-46` | Data model, batches |
| `2026-07-05` | `BATCH-1003` is seeded from `COL-BRINE` received on `2026-07-05` | `C-DM-46` | Data model, batches |
| `200000` | `BATCH-1003` carries net mass `200000` grams | `C-DM-47` | Data model, batches |
| `BATCH-1004` | `BATCH-1004` is seeded from `COL-CINDER` on device `WB-DEMO-02` | `C-DM-50` | Data model, batches |
| `120000` | `BATCH-1004` carries net mass `120000` grams | `C-DM-51` | Data model, batches |
| `BATCH-1005` | `BATCH-1005` carries net mass `100000` grams | `C-DM-53` | Data model, batches |
| `100000` | `BATCH-1005` carries net mass `100000` grams | `C-DM-53` | Data model, batches |
| `PA6` | `BATCH-1001` declares polymer `PA6` at `9200` bp on basis `sampled` | `C-DM-55` | Data model, batches |
| `9200` | `BATCH-1001` declares polymer `PA6` at `9200` bp on basis `sampled` | `C-DM-55` | Data model, batches |
| `9900` | `BATCH-1004` declares `9900` bp against a measured `9100` | `C-DM-56` | Data model, batches |
| `9100` | `BATCH-1004` declares `9900` bp against a measured `9100` | `C-DM-56` | Data model, batches |
| `RUN-D-0001` | `RUN-D-0001` is a `dissolution` run on recipe `RCP-DISS-2` | `C-DM-58` | Data model, runs |
| `RCP-DISS-2` | `RUN-D-0001` is a `dissolution` run on recipe `RCP-DISS-2` | `C-DM-58` | Data model, runs |
| `RUN-D-0002` | `RUN-D-0002` consumes `190000` grams of `BATCH-1003` | `C-DM-62` | Data model, runs |
| `190000` | `RUN-D-0002` consumes `190000` grams of `BATCH-1003` | `C-DM-62` | Data model, runs |
| `RUN-D-0003` | `RUN-D-0003` consumes `150000` grams of `BATCH-1001` | `C-DM-64` | Data model, runs |
| `150000` | `RUN-D-0003` consumes `150000` grams of `BATCH-1001` | `C-DM-64` | Data model, runs |
| `RUN-Y-0001` | `RUN-Y-0001` is a `depolymerisation` run on recipe `RCP-DEPO-4` | `C-DM-65` | Data model, runs |
| `RCP-DEPO-4` | `RUN-Y-0001` is a `depolymerisation` run on recipe `RCP-DEPO-4` | `C-DM-65` | Data model, runs |
| `RUN-U-0001` | `RUN-U-0001` is a `purification` run on recipe `RCP-PURI-1` | `C-DM-66` | Data model, runs |
| `RCP-PURI-1` | `RUN-U-0001` is a `purification` run on recipe `RCP-PURI-1` | `C-DM-66` | Data model, runs |
| `RUN-R-0001` | `RUN-R-0001` is a `repolymerisation` run on recipe `RCP-REPO-3` | `C-DM-67` | Data model, runs |
| `RCP-REPO-3` | `RUN-R-0001` is a `repolymerisation` run on recipe `RCP-REPO-3` | `C-DM-67` | Data model, runs |
| `OUT-D-0001` | `OUT-D-0001` carries `480000` grams | `C-DM-68` | Data model, outputs |
| `480000` | `OUT-D-0001` carries `480000` grams | `C-DM-68` | Data model, outputs |
| `OUT-D-0002` | `OUT-D-0002` carries `250000` grams | `C-DM-69` | Data model, outputs |
| `250000` | `OUT-D-0002` carries `250000` grams | `C-DM-69` | Data model, outputs |
| `OUT-D-0003` | `OUT-D-0003` carries `120000` grams | `C-DM-70` | Data model, outputs |
| `OUT-Y-0001` | `OUT-Y-0001` carries `800000` grams | `C-DM-71` | Data model, outputs |
| `800000` | `OUT-Y-0001` carries `800000` grams | `C-DM-71` | Data model, outputs |
| `OUT-U-0001` | `OUT-U-0001` carries `720000` grams | `C-DM-72` | Data model, outputs |
| `720000` | `OUT-U-0001` carries `720000` grams | `C-DM-72` | Data model, outputs |
| `OUT-U-0002` | `OUT-U-0002` is a byproduct of `40000` grams | `C-DM-73` | Data model, outputs |
| `LOT-N6-0001` | `LOT-N6-0001` carries grade `N6` at `400000` grams | `C-DM-79` | Data model, lots |
| `N6` | `LOT-N6-0001` carries grade `N6` at `400000` grams | `C-DM-79` | Data model, lots |
| `LOT-N6-0002` | `LOT-N6-0002` carries grade `N6` at `300000` grams | `C-DM-80` | Data model, lots |
| `LOT-N6-0003` | `LOT-N6-0003` is produced at `SITE-PILOT` at `200000` grams | `C-DM-81` | Data model, lots |
| `DEV-0001` | `DEV-0001` is seeded open against `RUN-U-0001` | `C-DM-87` | Data model, deviations |
| `DEV-0002` | `DEV-0002` is seeded closed with outcome `cause_not_established` | `C-DM-88` | Data model, deviations |
| `OVR-0001` | `OVR-0001` breaks the separation `analyst_not_dispositioner` | `C-DM-89` | Data model, overrides |
| `analyst_not_dispositioner` | `OVR-0001` breaks the separation `analyst_not_dispositioner` | `C-DM-89` | Data model, overrides |
| `2026-03-18` | `OVR-0001` was authorised on `2026-03-18` | `C-DM-90` | Data model, overrides |
| `CF-DEMO-1` | `CF-DEMO-1` carries factor `8000` bp | `C-DM-92` | Data model, factors |
| `8000` | `CF-DEMO-1` carries factor `8000` bp | `C-DM-92` | Data model, factors |
| `2026-03-31` | `CF-DEMO-1` derives from `2026-01-01` to `2026-03-31` | `C-DM-93` | Data model, factors |
| `CF-PILOT-1` | `CF-PILOT-1` carries factor `7500` bp | `C-DM-94` | Data model, factors |
| `7500` | `CF-PILOT-1` carries factor `7500` bp | `C-DM-94` | Data model, factors |
| `BP-DEMO-N6-2025H2` | The period `BP-DEMO-N6-2025H2` is seeded closed | `C-DM-96` | Data model, periods |
| `BP-DEMO-N6-2026H1` | The period `BP-DEMO-N6-2026H1` is seeded open | `C-DM-97` | Data model, periods |
| `BP-PILOT-N6-2026H1` | The period `BP-PILOT-N6-2026H1` is seeded open | `C-DM-98` | Data model, periods |
| `2000` | Every seeded period carries carry-over limit `2000` bp | `C-DM-99` | Data model, periods |
| `2026-01-15` | `BP-DEMO-N6-2025H2` closed on `2026-01-15` | `C-DM-100` | Data model, periods |
| `2026-01-10` | `BP-DEMO-N6-2025H2` carries the cut-off `2026-01-10` | `C-DM-101` | Data model, periods |
| `CM-PA6` | The carbon method `CM-PA6` is published at version `2` | `C-DM-114` | Data model, carbon |
| `2` | The carbon method `CM-PA6` is published at version `2` | `C-DM-114` | Data model, carbon |
| `ISO 14067` | `CM-PA6` is written against `ISO 14067` | `C-DM-115` | Data model, carbon |
| `1 kg of pellet` | `CM-PA6` uses the functional unit `1 kg of pellet` | `C-DM-116` | Data model, carbon |
| `cradle-to-gate` | `CM-PA6` uses the boundary `cradle-to-gate` | `C-DM-117` | Data model, carbon |
| `Ilse Grootveld` | `CM-PA6` names the reviewer `Ilse Grootveld` | `C-DM-118` | Data model, carbon |
| `2026-01-20` | `CM-PA6` was published on `2026-01-20` | `C-DM-119` | Data model, carbon |
| `4260000` | The `LOT-N6-0001` carbon value is `4260000` milligrams per kilogram | `C-DM-120` | Data model, carbon |
| `1200` | The `LOT-N6-0001` uncertainty is `1200` bp | `C-DM-121` | Data model, carbon |
| `6500` | The `LOT-N6-0001` primary share is `6500` bp | `C-DM-122` | Data model, carbon |
| `virgin PA6` | The comparator names the material `virgin PA6` | `C-DM-123` | Data model, carbon |
| `EcoBase 2025` | The comparator names the dataset `EcoBase 2025` | `C-DM-124` | Data model, carbon |
| `EU-27` | The comparator names the region `EU-27` | `C-DM-125` | Data model, carbon |
| `5000` | The primary-data threshold is `5000` bp | `C-DM-126` | Data model, carbon |
| `collection_and_transport` | The breakdown line `collection_and_transport` is `310000` | `C-DM-127` | Data model, carbon |
| `310000` | The breakdown line `collection_and_transport` is `310000` | `C-DM-127` | Data model, carbon |
| `process_energy` | The breakdown line `process_energy` is `1850000` | `C-DM-128` | Data model, carbon |
| `1850000` | The breakdown line `process_energy` is `1850000` | `C-DM-128` | Data model, carbon |
| `reagents` | The breakdown line `reagents` is `1180000` | `C-DM-129` | Data model, carbon |
| `1180000` | The breakdown line `reagents` is `1180000` | `C-DM-129` | Data model, carbon |
| `water_and_effluent` | The breakdown line `water_and_effluent` is `240000` | `C-DM-130` | Data model, carbon |
| `240000` | The breakdown line `water_and_effluent` is `240000` | `C-DM-130` | Data model, carbon |
| `waste_and_residues` | The breakdown line `waste_and_residues` is `330000` | `C-DM-131` | Data model, carbon |
| `330000` | The breakdown line `waste_and_residues` is `330000` | `C-DM-131` | Data model, carbon |
| `outbound_transport` | The breakdown line `outbound_transport` is `410000` | `C-DM-132` | Data model, carbon |
| `410000` | The breakdown line `outbound_transport` is `410000` | `C-DM-132` | Data model, carbon |
| `byproduct_credit` | The breakdown line `byproduct_credit` is `-60000` | `C-DM-133` | Data model, carbon |
| `-60000` | The breakdown line `byproduct_credit` is `-60000` | `C-DM-133` | Data model, carbon |
| `620000` | The market-based energy figure is `620000` milligrams per kilogram | `C-DM-135` | Data model, carbon |
| `EAC-2026-0007` | The instrument `EAC-2026-0007` carries `250000` kilowatt hours retired | `C-DM-137` | Data model, carbon |
| `EAC-2025-0031` | The instrument `EAC-2025-0031` is held rather than retired | `C-DM-138` | Data model, carbon |
| `SPEC-N6` | The specification `SPEC-N6` is current at version `3` | `C-DM-142` | Data model, specifications |
| `3` | The specification `SPEC-N6` is current at version `3` | `C-DM-142` | Data model, specifications |
| `2026-02-01` | `SPEC-N6` was issued on `2026-02-01` | `C-DM-143` | Data model, specifications |
| `relative_viscosity` | The property `relative_viscosity` is guaranteed at `2.40` by method `ISO 307` | `C-DM-144` | Data model, specifications |
| `2.40` | The property `relative_viscosity` is guaranteed at `2.40` by method `ISO 307` | `C-DM-144` | Data model, specifications |
| `ISO 307` | The property `relative_viscosity` is guaranteed at `2.40` by method `ISO 307` | `C-DM-144` | Data model, specifications |
| `moisture` | The property `moisture` is guaranteed at `0.10` by method `ISO 15512` | `C-DM-145` | Data model, specifications |
| `0.10` | The property `moisture` is guaranteed at `0.10` by method `ISO 15512` | `C-DM-145` | Data model, specifications |
| `ISO 15512` | The property `moisture` is guaranteed at `0.10` by method `ISO 15512` | `C-DM-145` | Data model, specifications |
| `yellowness_index` | The property `yellowness_index` is typical at `8.0` by method `ASTM E313` | `C-DM-146` | Data model, specifications |
| `8.0` | The property `yellowness_index` is typical at `8.0` by method `ASTM E313` | `C-DM-146` | Data model, specifications |
| `ASTM E313` | The property `yellowness_index` is typical at `8.0` by method `ASTM E313` | `C-DM-146` | Data model, specifications |
| `ash_content` | The property `ash_content` is informational at `0.30` by method `ISO 3451-1` | `C-DM-147` | Data model, specifications |
| `0.30` | The property `ash_content` is informational at `0.30` by method `ISO 3451-1` | `C-DM-147` | Data model, specifications |
| `ISO 3451-1` | The property `ash_content` is informational at `0.30` by method `ISO 3451-1` | `C-DM-147` | Data model, specifications |
| `virgin PA6 at relative viscosity 2.42` | The virgin-quality reference reads `virgin PA6 at relative viscosity 2.42` | `C-DM-148` | Data model, specifications |
| `CUS-HELIOS` | The customer `CUS-HELIOS` is reached at `helios@example.com` | `C-DM-149` | Data model, customers |
| `helios@example.com` | The customer `CUS-HELIOS` is reached at `helios@example.com` | `C-DM-149` | Data model, customers |
| `CUS-VANTA` | The customer `CUS-VANTA` is reached at `vanta@example.com` | `C-DM-150` | Data model, customers |
| `vanta@example.com` | The customer `CUS-VANTA` is reached at `vanta@example.com` | `C-DM-150` | Data model, customers |
| `airbag fabric` | `CUS-VANTA` qualifies the application `airbag fabric` | `C-DM-153` | Data model, customers |
| `automotive` | `CUS-VANTA` sits in the industry `automotive` | `C-DM-154` | Data model, customers |
| `CON-HELIOS-1` | The contract `CON-HELIOS-1` commits `200` kilograms | `C-DM-155` | Data model, contracts |
| `200` | The contract `CON-HELIOS-1` commits `200` kilograms | `C-DM-155` | Data model, contracts |
| `CON-VANTA-1` | The contract `CON-VANTA-1` names the site `SITE-COMM` | `C-DM-157` | Data model, contracts |
| `a make-good volume in the following period` | `CON-VANTA-1` states the shortfall consequence `a make-good volume in the following period` | `C-DM-159` | Data model, contracts |
| `CERT-PILOT-000001` | The certificate `CERT-PILOT-000001` is seeded in state `withdrawn` | `C-DM-160` | Data model, certificates |
| `2026-04-18` | `CERT-PILOT-000001` was withdrawn on `2026-04-18` | `C-DM-161` | Data model, certificates |
| `A collector category was corrected after acceptance` | `CERT-PILOT-000001` names the reason `A collector category was corrected after acceptance` | `C-DM-162` | Data model, certificates |
| `CERT-PILOT-000002` | The certificate `CERT-PILOT-000002` is seeded in state `issued` | `C-DM-163` | Data model, certificates |
| `issued` | The certificate `CERT-PILOT-000002` is seeded in state `issued` | `C-DM-163` | Data model, certificates |
| `CERT-DEMO-000001` | The first certificate signed at `SITE-DEMO` is numbered `CERT-DEMO-000001` | `C-DM-165` | Data model, certificates |
| `RCS-2026` | The certification scheme is `RCS-2026` | `C-DM-166` | Data model, certificates |
| `REG-RAVEL-0042` | The producer registration is `REG-RAVEL-0042` | `C-DM-167` | Data model, certificates |
| `ravel.example.com` | The verification address is published under the host `ravel.example.com` | `C-DM-168` | Data model, certificates |
| `textiles_recycled` | The statistic `textiles_recycled` cites `Textile Flow Monitor` for `2024` | `C-DM-171` | Data model, public site |
| `Textile Flow Monitor` | The statistic `textiles_recycled` cites `Textile Flow Monitor` for `2024` | `C-DM-171` | Data model, public site |
| `2024` | The statistic `textiles_recycled` cites `Textile Flow Monitor` for `2024` | `C-DM-171` | Data model, public site |
| `plastics_emissions` | The statistic `plastics_emissions` cites `Global Materials Emissions Panel` for `2023` | `C-DM-172` | Data model, public site |
| `Global Materials Emissions Panel` | The statistic `plastics_emissions` cites `Global Materials Emissions Panel` for `2023` | `C-DM-172` | Data model, public site |
| `2023` | The statistic `plastics_emissions` cites `Global Materials Emissions Panel` for `2023` | `C-DM-172` | Data model, public site |
| `textile_incineration` | The statistic `textile_incineration` cites geography `EU-27` | `C-DM-173` | Data model, public site |
| `Process Engineer` | One open position is seeded as `Process Engineer` | `C-DM-175` | Data model, public site |
| `Lyon, France` | The seeded position is located in `Lyon, France` | `C-DM-176` | Data model, public site |
| `2026-11-30` | The seeded position closes on `2026-11-30` | `C-DM-177` | Data model, public site |
| `fr` | One seeded news item carries language `fr` | `C-DM-180` | Data model, public site |
| `feedstock@example.com` | A waste-supply enquiry is routed to `feedstock@example.com` | `C-DM-181` | Data model, public site |
| `sales@example.com` | A polymer enquiry is routed to `sales@example.com` | `C-DM-182` | Data model, public site |
| `partners@example.com` | A partnership enquiry is routed to `partners@example.com` | `C-DM-183` | Data model, public site |
| `press@example.com` | A press enquiry is routed to `press@example.com` | `C-DM-184` | Data model, public site |
| `1` | A press enquiry states a response time of `1` day | `C-DM-185` | Data model, public site |
| `Ravel Materials SAS` | The published controller is named `Ravel Materials SAS` | `C-DM-186` | Data model, public site |
| `privacy@example.com` | A rights request is addressed to `privacy@example.com` | `C-DM-187` | Data model, public site |
| `security@example.com` | The disclosure address is `security@example.com` | `C-DM-188` | Data model, public site |
| `180` | The record retention is stated as `180` months | `C-DM-189` | Data model, public site |
| `2026-02-20T06:14:00Z` | A `weighbridge` record is seeded at `2026-02-20T06:14:00Z` | `C-DM-192` | Data model, inbound |
| `2026-03-04T22:41:00Z` | A `control_system` record is seeded at `2026-03-04T22:41:00Z` | `C-DM-193` | Data model, inbound |
| `2026-03-06T09:02:00Z` | A `laboratory` record is seeded at `2026-03-06T09:02:00Z` | `C-DM-194` | Data model, inbound |
| `Brine Textile Recovery` | `COL-BRINE` holds the name `Brine Textile Recovery` from `2026-01-01` | `C-DM-198` | Data model, parties |
| `Brine Circular Materials` | `COL-BRINE` holds the name `Brine Circular Materials` from `2026-08-01` | `C-DM-199` | Data model, parties |
| `2026-08-01` | `COL-BRINE` holds the name `Brine Circular Materials` from `2026-08-01` | `C-DM-199` | Data model, parties |
| `TRF-0001` | The transfer `TRF-0001` moves `50000` grams on `2026-05-12` | `C-DM-201` | Data model, transfers |
| `50000` | The transfer `TRF-0001` moves `50000` grams on `2026-05-12` | `C-DM-201` | Data model, transfers |
| `2026-05-12` | The transfer `TRF-0001` moves `50000` grams on `2026-05-12` | `C-DM-201` | Data model, transfers |
| `120` | The scheme retention basis is `120` months | `C-DM-204` | Data model, retention |
| `84` | The statutory retention basis is `84` months | `C-DM-205` | Data model, retention |
| `HLD-0001` | The legal hold `HLD-0001` stands on the signing entry of `CERT-PILOT-000001` | `C-DM-207` | Data model, retention |
| `derived_in_g` | `CF-DEMO-1` carries `derived_in_g` of `1000000` | `C-DM-208` | Data model, factor derivation |
| `1000000` | `CF-DEMO-1` carries `derived_in_g` of `1000000` | `C-DM-208` | Data model, factor derivation |
| `derived_out_g` | `CF-DEMO-1` carries `derived_out_g` of `800000` | `C-DM-209` | Data model, factor derivation |
| `#301f00` | The reference published `#301f00` as its dark value | `C-FE-01` | Front-end specification, palette |
| `#f9f5f1` | The reference published `#f9f5f1` as its ground value | `C-FE-02` | Front-end specification, palette |
| `#2a4b22` | The reference published `#2a4b22` as its accent value | `C-FE-03` | Front-end specification, palette |
| `#b68ecb` | The reference published `#b68ecb` as its editorial value | `C-FE-04` | Front-end specification, palette |
| `#898d8f` | The reference published `#898d8f` as its grey value | `C-FE-05` | Front-end specification, palette |
| `#2d62ff` | The value `#2d62ff` appears nowhere in the built stylesheet | `C-FE-24` | Front-end specification, palette |
| `#dd23bb` | The value `#dd23bb` appears nowhere in the built stylesheet | `C-FE-25` | Front-end specification, palette |
| `#fcf8d8` | The value `#fcf8d8` appears nowhere in the built stylesheet | `C-FE-26` | Front-end specification, palette |
| `#cef5ca` | The value `#cef5ca` appears nowhere in the built stylesheet | `C-FE-27` | Front-end specification, palette |
| `#114e0b` | The value `#114e0b` appears nowhere in the built stylesheet | `C-FE-28` | Front-end specification, palette |
| `#f8e4e4` | The value `#f8e4e4` appears nowhere in the built stylesheet | `C-FE-29` | Front-end specification, palette |
| `#3b0b0b` | The value `#3b0b0b` appears nowhere in the built stylesheet | `C-FE-30` | Front-end specification, palette |
| `#5e5515` | The value `#5e5515` appears nowhere in the built stylesheet | `C-FE-31` | Front-end specification, palette |
| `#0000` | The value `#0000` appears nowhere in the built stylesheet | `C-FE-32` | Front-end specification, palette |
| `h1` | The step `h1` is `5rem` over `6rem` | `C-FE-50` | Front-end specification, typography |
| `5rem` | The step `h1` is `5rem` over `6rem` | `C-FE-50` | Front-end specification, typography |
| `6rem` | The step `h1` is `5rem` over `6rem` | `C-FE-50` | Front-end specification, typography |
| `h2` | The step `h2` is `4rem` over `4.5rem` | `C-FE-51` | Front-end specification, typography |
| `4rem` | The step `h2` is `4rem` over `4.5rem` | `C-FE-51` | Front-end specification, typography |
| `4.5rem` | The step `h2` is `4rem` over `4.5rem` | `C-FE-51` | Front-end specification, typography |
| `h3` | The step `h3` is `3rem` over `3.5rem` | `C-FE-52` | Front-end specification, typography |
| `3rem` | The step `h3` is `3rem` over `3.5rem` | `C-FE-52` | Front-end specification, typography |
| `3.5rem` | The step `h3` is `3rem` over `3.5rem` | `C-FE-52` | Front-end specification, typography |
| `h4` | The step `h4` is `1.625rem` over `1.8125rem` | `C-FE-53` | Front-end specification, typography |
| `1.625rem` | The step `h4` is `1.625rem` over `1.8125rem` | `C-FE-53` | Front-end specification, typography |
| `1.8125rem` | The step `h4` is `1.625rem` over `1.8125rem` | `C-FE-53` | Front-end specification, typography |
| `body-big` | The step `body-big` is `1.375rem` over `1.8125rem` | `C-FE-54` | Front-end specification, typography |
| `1.375rem` | The step `body-big` is `1.375rem` over `1.8125rem` | `C-FE-54` | Front-end specification, typography |
| `body-regular` | The step `body-regular` is `1.125rem` over `1.5rem` | `C-FE-55` | Front-end specification, typography |
| `1.125rem` | The step `body-regular` is `1.125rem` over `1.5rem` | `C-FE-55` | Front-end specification, typography |
| `1.5rem` | The step `body-regular` is `1.125rem` over `1.5rem` | `C-FE-55` | Front-end specification, typography |
| `body-small` | The step `body-small` is `1rem` over `1.5rem` | `C-FE-56` | Front-end specification, typography |
| `1rem` | The step `body-small` is `1rem` over `1.5rem` | `C-FE-56` | Front-end specification, typography |
| `eyebrow` | The step `eyebrow` is `0.875rem` over `1.125rem` | `C-FE-57` | Front-end specification, typography |
| `0.875rem` | The step `eyebrow` is `0.875rem` over `1.125rem` | `C-FE-57` | Front-end specification, typography |
| `220000` | A public route stays under `220000` bytes before first paint | `C-FE-153` | Front-end specification, performance |
| `360000` | A balance route stays under `360000` bytes before first paint | `C-FE-155` | Front-end specification, performance |
| `140000` | Fonts stay under `140000` bytes per route | `C-FE-156` | Front-end specification, performance |
| `Tomorrow's materials. Made from today's waste.` | The home route carries the line `Tomorrow's materials. Made from today's waste.` | `C-FE-164` | Front-end specification, copy |
| `The power of green chemistry` | The home route carries the line `The power of green chemistry` | `C-FE-166` | Front-end specification, copy |
| `We're closing the loop` | The home route carries the line `We're closing the loop` | `C-FE-167` | Front-end specification, copy |
| `Same material. Better origin.` | The product route carries the line `Same material. Better origin.` | `C-FE-169` | Front-end specification, copy |
| `Nylon in any form` | The first product feature is headed `Nylon in any form` | `C-FE-172` | Front-end specification, copy |
| `>25,000 tonnes per year` | The technology route carries the commercial capacity `>25,000 tonnes per year` | `C-FE-175` | Front-end specification, copy |
| `Losses reduce the claim.` | The product copy carries `Losses reduce the claim.` | `C-FE-192` | Front-end specification, product copy |
| `transition: all` | The declaration `transition: all` appears on no element in the built stylesheet | `C-FE-206` | Front-end specification, motion |
| `4173` | The container-internal port is `4173` | `C-DC-02` | Deployment contract |

### Referenced but not pinned

| What the instruction calls it | Item | Why it matters |
|---|---|---|
| the exact wording of each generated permitted statement | `C-TR-201` | the claim type, the percentage and the category split are fixed; the sentence is the builder's |
| the two named transition durations | `C-FE-49` | the character is fixed; the millisecond values are the builder's |
| the three named radius steps | `C-FE-41` | the count is fixed; the values are the builder's |
| the recipe set points and tolerances | `C-TR-103` | the fields are fixed; the numbers are the builder's |

## Coverage ledger

| Section | Obligation-bearing sentences | Items produced |
|---|---|---|
| Overview | 0 | 20 |
| User roles | 0 | 59 |
| Core features | 2 | 52 |
| User flow | 5 | 41 |
| UI/UX notes | 0 | 34 |
| Technical requirements | 56 | 428 |
| Data model | 1 | 211 |
| Front-end specification | 20 | 206 |
| Constraints | 2 | 17 |
| Deployment contract | 10 | 41 |
| Definition of done | 0 | 0 |
