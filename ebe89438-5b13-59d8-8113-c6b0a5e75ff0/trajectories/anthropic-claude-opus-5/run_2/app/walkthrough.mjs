/**
 * Walks the five journeys the brief describes, as a stranger would, reading
 * values back off the page rather than trusting that it rendered.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.WALK_BASE || 'http://127.0.0.1:4173';
const MAILPIT = process.env.MAILPIT_URL || 'http://mailpit:8025';
const SHOTS = '/app/.browser_screenshots';
const PW = 'deku-demo-pw-2026';

let pass = 0;
let fail = 0;
const failures = [];
const consoleErrors = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    failures.push(`${name} ${detail}`);
    console.log(`  FAIL ${name} ${detail}`);
  }
}

const mail = {
  async all() {
    const r = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
    return (await r.json()).messages || [];
  },
  async find(pred, tries = 24) {
    for (let i = 0; i < tries; i++) {
      const hit = (await this.all()).find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  },
  async body(id) {
    return (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
  },
  async reset() {
    await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
  },
};

/** A persona gets its own browser context, so tokens never collide. */
async function persona(browser, email) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'America/New_York',
  });
  ctx.on('page', (p) =>
    p.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`${p.url()} :: ${m.text()}`);
    }),
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consoleErrors.push(`pageerror :: ${e.message}`));
  if (email) await signIn(page, email);
  return page;
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }),
    page.click('button[type=submit]'),
  ]);
  await page.waitForLoadState('networkidle');
}

async function signOut(page) {
  await page.evaluate(() => localStorage.clear());
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'America/New_York', // deliberately not the event zone
  });
  ctx.on('page', (p) =>
    p.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`${p.url()} :: ${m.text()}`);
    }),
  );
  const page = await ctx.newPage();
  page.on('pageerror', (e) => consoleErrors.push(`pageerror :: ${e.message}`));

  /* ---------------------------------------------------- landing + discover */

  console.log('\n== landing and discovery ==');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('landing has one h1', (await page.locator('h1').count()) === 1);
  check(
    'landing headline reads "events start here"',
    (await page.locator('h1').innerText()).replace(/\s+/g, ' ').includes('events start here'),
  );
  check('poster wall is drawn', (await page.locator('.poster').count()) >= 8);
  await page.screenshot({ path: `${SHOTS}/01_landing.png`, fullPage: false });

  await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
  const cardCount = await page.locator('.card-link').count();
  check('discover lists published events', cardCount >= 4, String(cardCount));
  const showing = await page.locator('.showing').innerText();
  check('page control reads "Showing <n> of <total>"', /^Showing \d+ of \d+$/.test(showing), showing);
  check(
    'a draft never appears in discovery',
    !(await page.content()).includes('Harbour Loop Recovery Jog'),
  );
  check(
    'a cancelled event never appears in discovery',
    !(await page.content()).includes('Autumn Book Swap'),
  );

  // the address is the state
  await page.goto(`${BASE}/discover?category=books`, { waitUntil: 'networkidle' });
  check(
    'a filter in the address is read back into the control',
    (await page.locator('#f-category').inputValue()) === 'books',
  );
  const booksTitles = await page.locator('.title').allInnerTexts();
  check(
    'the filtered list holds only that category',
    booksTitles.every((t) => t.includes('Winter Reading Night')),
    JSON.stringify(booksTitles),
  );
  await page.goBack({ waitUntil: 'networkidle' });
  check(
    'the back button restores the previous list',
    (await page.locator('.card-link').count()) === cardCount,
  );
  await page.screenshot({ path: `${SHOTS}/02_discover.png` });

  /* --------------------------------- journey 1: register and get a ticket */

  console.log('\n== journey 1: a stranger signs up, registers and is mailed a ticket ==');
  await mail.reset();
  const strangerEmail = `newcomer${Date.now()}@example.com`;

  // A stranger arrives with no account at all.
  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
  await page.fill('#name', 'Nora Newcomer');
  await page.fill('#email', strangerEmail);
  await page.fill('#password', 'newcomer-password-1');
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/signup'), { timeout: 20000 }),
    page.click('button[type=submit]'),
  ]);
  check('a new account lands on /home', page.url().endsWith('/home'), page.url());

  await page.goto(`${BASE}/thursday-night-5k`, { waitUntil: 'networkidle' });
  const groundBefore = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  check(
    'the event page arrives already wearing its colour',
    groundBefore !== 'rgb(255, 255, 255)' && groundBefore !== 'rgba(0, 0, 0, 0)',
    groundBefore,
  );
  check(
    'the event title is on the page',
    (await page.locator('h1.event-title').innerText()).includes('Thursday Night 5K'),
  );
  check('the visitor zone is shown when it differs', (await page.locator('.when-yours').count()) === 1);

  await page.waitForSelector('.panel-action', { timeout: 15000 });
  await page.click('.panel-action');
  await page.waitForTimeout(1500);
  const answer = await page.locator('.answer').innerText();
  check('the panel answers with a ticket code', /TKT-[A-Z0-9]{8}/.test(answer), answer);
  const ticketCode = (answer.match(/TKT-[A-Z0-9]{8}/) || [])[0];
  check(
    'the panel now says the guest is going',
    (await page.locator('.panel-title').innerText()).includes("You're going"),
  );

  const confirmMail = await mail.find(
    (m) =>
      m.Subject === "You're going to Thursday Night 5K" &&
      m.To.some((t) => t.Address === strangerEmail),
  );
  check('a real confirmation email arrives', !!confirmMail);
  if (confirmMail) {
    const full = await mail.body(confirmMail.ID);
    check('the email names the event', (full.Text || '').includes('Thursday Night 5K'));
    check('the email carries the ticket code', (full.Text || '').includes(ticketCode));
    check(
      'the email goes to that guest alone',
      confirmMail.To.length === 1 && !(confirmMail.Cc || []).length,
    );
  }
  await page.screenshot({ path: `${SHOTS}/03_registered_with_ticket.png` });

  // the ticket is presentable without an account
  const anon = await persona(browser, null);
  await anon.goto(`${BASE}/t/${ticketCode}`, { waitUntil: 'networkidle' });
  check(
    'a ticket opens for anyone presenting the code',
    (await anon.locator('.code').innerText()).trim() === ticketCode,
  );
  await anon.screenshot({ path: `${SHOTS}/04_ticket.png` });
  await anon.close();

  /* ---------------------------- journey 2: two guests take the last seat */

  console.log('\n== journey 2: two guests take the last seat at the same instant ==');
  await mail.reset();
  // Riverside Track Session has capacity 2 with one seat taken.
  const racer1 = await persona(browser, 'guest@example.com');
  const racer2 = await persona(browser, 'guest3@example.com');
  await racer1.goto(`${BASE}/riverside-track-session`, { waitUntil: 'networkidle' });
  await racer2.goto(`${BASE}/riverside-track-session`, { waitUntil: 'networkidle' });

  // both press at the same instant
  await Promise.all([
    racer1.click('.panel-action'),
    racer2.click('.panel-action'),
  ]);
  await racer1.waitForTimeout(1500);
  await racer2.waitForTimeout(1500);

  const a1 = await racer1.locator('.panel-title').innerText();
  const a2 = await racer2.locator('.panel-title').innerText();
  const going = [a1, a2].filter((t) => t.includes("You're going")).length;
  const waiting = [a1, a2].filter((t) => t.includes('waiting list')).length;
  check('exactly one of the two holds the seat', going === 1, `${a1} | ${a2}`);
  check('the other holds a waiting-list place', waiting === 1, `${a1} | ${a2}`);

  // the database is the fact
  const trackState = await (
    await fetch(`${BASE}/api/events/riverside-track-session`)
  ).json();
  check(
    'confirmed never exceeds capacity',
    trackState.confirmed_count <= trackState.capacity,
    `${trackState.confirmed_count}/${trackState.capacity}`,
  );
  check(
    'the event is exactly full',
    trackState.confirmed_count === trackState.capacity,
    `${trackState.confirmed_count}/${trackState.capacity}`,
  );
  const seatWinner = a1.includes("You're going") ? racer1 : racer2;
  const loser = a1.includes("You're going") ? racer2 : racer1;
  await seatWinner.screenshot({ path: `${SHOTS}/05_last_seat_winner.png` });
  await loser.screenshot({ path: `${SHOTS}/06_last_seat_waitlisted.png` });
  await racer1.close();
  await racer2.close();

  /* ------------------------- journey 3: the host approves a pending request */

  console.log('\n== journey 3: the host works the approval queue ==');
  await mail.reset();
  const host = await persona(browser, 'host@example.com');
  check('a host lands on /calendars', host.url().endsWith('/calendars'), host.url());
  await host.screenshot({ path: `${SHOTS}/07_host_calendars.png` });

  await host.goto(`${BASE}/event/sunrise-long-run/manage/guests`, {
    waitUntil: 'networkidle',
  });
  const queued = await host.locator('.queue-row').count();
  check('the approval queue shows the pending request', queued === 1, String(queued));
  const guestName = await host.locator('.queue-row .name').first().innerText();
  await host.locator('.queue-row button', { hasText: 'Approve' }).first().click();
  await host.waitForTimeout(1500);

  const rowStatuses = await host.locator('.guests tbody .pill').allInnerTexts();
  check(
    'the row flips to confirmed',
    rowStatuses.includes('Confirmed'),
    JSON.stringify(rowStatuses),
  );
  check(
    'the approved guest is mailed the approval subject',
    !!(await mail.find((m) => m.Subject === "You're in: Sunrise Long Run")),
  );
  await host.screenshot({ path: `${SHOTS}/08_host_approved_guest.png` });

  // the door: a second check-in records one arrival, not two
  const ticketCell = await host.locator('.code-cell').allInnerTexts();
  const doorCode = ticketCell.find((t) => /^TKT-/.test(t));
  if (doorCode) {
    await host.fill('#door-code', doorCode);
    await host.click('.door button[type=submit]');
    await host.waitForTimeout(1200);
    const first = await host.locator('.door-answer').innerText();
    check('a ticket checks in at the door', /Checked in/i.test(first), first);
    await host.fill('#door-code', doorCode);
    await host.click('.door button[type=submit]');
    await host.waitForTimeout(1200);
    const second = await host.locator('.door-answer').innerText();
    check(
      'a second check-in reports the first arrival rather than a second',
      /already checked in/i.test(second),
      second,
    );
    await host.screenshot({ path: `${SHOTS}/09_door_check_in.png` });
  }

  /* --------------- journey 4: a cancel passes the seat to the waiting list */

  console.log('\n== journey 4: cancelling passes the seat to the head of the list ==');
  await mail.reset();
  // Thursday Night 5K: guest@ is confirmed, guest3@ waits at position 1.
  const before = await (await fetch(`${BASE}/api/events/thursday-night-5k`)).json();
  const guest = await persona(browser, 'guest@example.com');
  await guest.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
  check('the guest sees their registrations', (await guest.locator('.row').count()) > 0);
  await guest.screenshot({ path: `${SHOTS}/10_guest_home.png` });

  const cancelRow = guest
    .locator('.row', { hasText: 'Thursday Night 5K' })
    .locator('button', { hasText: 'Cancel' });
  await cancelRow.first().click();
  await guest.waitForTimeout(400);
  check('a confirmation dialog opens', (await guest.locator('[role=dialog]').count()) === 1);
  await guest.locator('[role=dialog] button', { hasText: 'Cancel Registration' }).click();
  await guest.waitForTimeout(1800);

  const rowPill = await guest
    .locator('.row', { hasText: 'Thursday Night 5K' })
    .locator('.pill')
    .first()
    .innerText();
  check('the row moves to its new status in place', rowPill === 'Cancelled', rowPill);

  const promoted = await mail.find(
    (m) => m.Subject === 'A spot opened up for Thursday Night 5K',
  );
  check('the head of the waiting list is mailed a seat', !!promoted);
  const selfMail = (await mail.all()).filter((m) =>
    m.To.some((t) => t.Address === 'guest@example.com'),
  );
  check(
    'a guest cancelling their own registration sends themselves no mail',
    selfMail.length === 0,
    JSON.stringify(selfMail.map((m) => m.Subject)),
  );
  const after = await (await fetch(`${BASE}/api/events/thursday-night-5k`)).json();
  check(
    'the seat passed straight on, so the count holds',
    after.confirmed_count === before.confirmed_count,
    `${before.confirmed_count} -> ${after.confirmed_count}`,
  );
  await guest.screenshot({ path: `${SHOTS}/11_cancelled_and_promoted.png` });
  await guest.close();

  /* --------------------- journey 5: a host calls an event off with a reason */

  console.log('\n== journey 5: a host cancels an event with a typed reason ==');
  await mail.reset();
  const host2 = await persona(browser, 'host2@example.com');
  // give the event a guest, so somebody must be told
  const joiner = await persona(browser, 'guest2@example.com');
  await joiner.goto(`${BASE}/winter-reading-night`, { waitUntil: 'networkidle' });
  await joiner.click('.panel-action');
  await joiner.waitForTimeout(1200);
  await joiner.close();
  await mail.reset();

  const reason = 'The venue lost its heating and we will not sit in the cold.';
  await host2.goto(`${BASE}/event/winter-reading-night/manage/overview`, {
    waitUntil: 'networkidle',
  });
  await host2.locator('button', { hasText: 'Cancel Event' }).first().click();
  await host2.waitForTimeout(400);
  const actionDisabled = await host2
    .locator('[role=dialog] button', { hasText: 'Cancel Event' })
    .isDisabled();
  check('the cancel action waits for a reason to be typed', actionDisabled);
  await host2.fill('#reason', reason);
  await host2.locator('[role=dialog] button', { hasText: 'Cancel Event' }).click();
  await host2.waitForTimeout(2000);

  const notice = await host2.locator('.np-body').innerText();
  check('the manage page shows the host their own reason', notice.includes(reason), notice);
  await host2.screenshot({ path: `${SHOTS}/12_host_cancelled_event.png` });

  const cancelMail = await mail.find(
    (m) => m.Subject === 'Winter Reading Night has been cancelled',
  );
  check('every guest still holding a place is mailed', !!cancelMail);
  if (cancelMail) {
    const full = await mail.body(cancelMail.ID);
    check(
      "the mail carries the host's words unedited",
      (full.Text || '').includes(reason),
    );
  }

  // the page keeps its address and shows the notice, not the panel
  const publicView = await persona(browser, null);
  await publicView.goto(`${BASE}/winter-reading-night`, { waitUntil: 'networkidle' });
  check(
    'the cancelled event keeps its address',
    publicView.url().endsWith('/winter-reading-night'),
  );
  check(
    'the public page shows the cancellation notice, not the panel',
    (await publicView.locator('.cancelled-notice').count()) === 1 &&
      (await publicView.locator('.panel-action').count()) === 0,
  );
  check(
    'the notice carries the reason',
    (await publicView.locator('.cancelled-notice').innerText()).includes(reason),
  );
  await publicView.screenshot({ path: `${SHOTS}/13_cancelled_public_page.png` });
  await publicView.close();

  /* ----------------------------------------------- authorization in the UI */

  console.log('\n== authorization from the browser ==');
  const asGuest = await persona(browser, 'guest@example.com');
  await asGuest.goto(`${BASE}/calendars`, { waitUntil: 'networkidle' });
  check(
    'a guest at /calendars gets the not-found page',
    (await asGuest.locator('h1').innerText()).includes('Page Not Found'),
  );
  await asGuest.goto(`${BASE}/event/thursday-night-5k/manage/guests`, {
    waitUntil: 'networkidle',
  });
  check(
    'a guest at a manage route gets the not-found page',
    (await asGuest.locator('h1').innerText()).includes('Page Not Found'),
  );
  await asGuest.screenshot({ path: `${SHOTS}/14_guest_refused_not_found.png` });

  // a direct API call from a guest session is refused by the server
  const direct = await asGuest.evaluate(async () => {
    const res = await fetch('/api/events/thursday-night-5k/registrations', {
      headers: { authorization: `Bearer ${localStorage.getItem('cc.token')}` },
    });
    return res.status;
  });
  check('a direct API call from a guest session is denied', direct === 404, String(direct));
  await asGuest.close();

  // an unauthenticated visitor at a protected route
  const stranger = await persona(browser, null);
  await stranger.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
  check(
    'an unauthenticated visitor is sent to /login?next=',
    stranger.url().includes('/login?next=%2Fhome'),
    stranger.url(),
  );
  await stranger.close();

  // a draft event is a 404 to a stranger
  const drafty = await persona(browser, null);
  await drafty.goto(`${BASE}/harbour-loop-recovery-jog`, { waitUntil: 'networkidle' });
  check(
    'a draft event is the not-found page to a stranger',
    (await drafty.locator('h1').innerText()).includes('Page Not Found'),
  );
  await drafty.close();

  /* ------------------------------------------------- closed registration */

  console.log('\n== the closed registration panel ==');
  const closed = await persona(browser, null);
  await closed.goto(`${BASE}/riverside-winter-time-trial`, { waitUntil: 'networkidle' });
  const closedTitle = await closed.locator('.panel-title').innerText();
  const closedBody = await closed.locator('.panel-body').innerText();
  check('the closed panel reads "Registration Is Closed"', closedTitle === 'Registration Is Closed', closedTitle);
  check(
    'the closed panel carries its pinned sentence',
    closedBody === 'The host has stopped taking registrations for this event.',
    closedBody,
  );
  await closed.screenshot({ path: `${SHOTS}/15_registration_closed.png` });
  await closed.close();

  /* ---------------------------------------------------- signup as a stranger */

  console.log('\n== an approval event answers with request received ==');
  const fresh = await persona(browser, 'guest2@example.com');
  await fresh.goto(`${BASE}/sunrise-long-run`, { waitUntil: 'networkidle' });
  await fresh.waitForSelector('.panel-action', { timeout: 15000 });
  await fresh.click('.panel-action');
  await fresh.waitForTimeout(1500);
  const strangerPanel = await fresh.locator('.panel-title').innerText();
  check(
    'an approval event answers with request received',
    strangerPanel.includes('Request received'),
    strangerPanel,
  );
  await fresh.screenshot({ path: `${SHOTS}/16_request_received.png` });
  await fresh.close();

  /* ---------------------------------------- host raises capacity, list moves */

  console.log('\n== raising capacity seats the waiting list ==');
  await mail.reset();
  await host.goto(`${BASE}/event/riverside-track-session/manage/registration`, {
    waitUntil: 'networkidle',
  });
  const capBefore = await host.locator('.cap-input').inputValue();
  await host.locator('.step').nth(1).click(); // raise by one
  await host.waitForTimeout(2000);
  const live = await host.locator('.live').innerText();
  check(
    'raising capacity reports how many were seated',
    /moved from the waiting list to a seat/.test(live),
    live,
  );
  check(
    'the seated guest is mailed the waiting-list-to-seat subject',
    !!(await mail.find((m) => m.Subject === 'A spot opened up for Riverside Track Session')),
  );
  await host.screenshot({ path: `${SHOTS}/17_capacity_raised.png` });

  /* ------------------------------------------------------ settings + export */

  console.log('\n== settings and the export ==');
  await host.goto(`${BASE}/settings/profile`, { waitUntil: 'networkidle' });
  await host.fill('#handle', 'priya-raman');
  await host.waitForTimeout(300);
  check(
    'Save Changes is disabled until something differs',
    await host.locator('.save').isDisabled(),
  );
  await host.fill('#handle', 'amina-osei'); // already taken
  await host.waitForTimeout(300);
  await host.click('.save');
  await host.waitForTimeout(1200);
  const handleRefusal = await host.locator('#handle-refusal').innerText();
  check(
    'a taken handle is refused with the pinned sentence',
    handleRefusal === 'That handle is already taken.',
    handleRefusal,
  );
  await host.screenshot({ path: `${SHOTS}/18_settings_handle_refused.png` });

  await host.goto(`${BASE}/event/thursday-night-5k/manage/overview`, {
    waitUntil: 'networkidle',
  });
  const counters = await host.locator('.count').allInnerTexts();
  check('the dashboard shows four counters', counters.length === 4, JSON.stringify(counters));
  await host.screenshot({ path: `${SHOTS}/19_manage_overview.png` });
  await host.close();

  /* ------------------------------------------------------------ responsive */

  console.log('\n== responsive ==');
  const phone = await persona(browser, null);
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`${BASE}/thursday-night-5k`, { waitUntil: 'networkidle' });
  const footBar = await phone.locator('.foot-bar').count();
  const footVisible = footBar ? await phone.locator('.foot-bar').isVisible() : false;
  check('the panel becomes a foot bar on a phone', footVisible, `count=${footBar}`);
  await phone.screenshot({ path: `${SHOTS}/20_phone_event_footbar.png` });
  await phone.close();

  /* ------------------------------------------------------------- console */

  const realErrors = consoleErrors.filter(
    (e) => !/favicon|404 \(Not Found\)|Failed to load resource/.test(e),
  );
  check(
    'no console errors during the walk',
    realErrors.length === 0,
    JSON.stringify(realErrors.slice(0, 5)),
  );

  await browser.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('walkthrough crashed:', e);
  process.exit(2);
});
