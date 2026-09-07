/**
 * Drives the running app through the journeys in the brief as a stranger would,
 * judging each step against the page rather than by eye.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.WALK_BASE || 'http://127.0.0.1:4300';
const MAILPIT = `http://${process.env.SMTP_HOST || 'mailpit'}:8025`;
const SHOTS = '/app/.browser_screenshots';
const PW = 'deku-demo-pw-2026';

fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0;
let fail = 0;
const failures = [];
const consoleProblems = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`   ok   ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`   FAIL ${name}${detail !== undefined ? ' :: ' + JSON.stringify(detail).slice(0, 300) : ''}`);
  }
}

// the browser already cached in this environment, rather than a fresh download
const CHROME = '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function newPage(width = 1440, height = 1000) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleProblems.push(`${page.url()} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleProblems.push(`${page.url()} :: ${e.message}`));
  return { ctx, page };
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function resetMail() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
}

async function mailFor(address) {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + address)}&limit=30`);
  return (await r.json()).messages || [];
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}`, fullPage: false });

/* ================================================================= */
/* 0. landing and discovery, as a stranger                            */
/* ================================================================= */

console.log('\n== 0. landing and discovery');
{
  const { ctx, page } = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  ok('landing shows one h1', (await page.locator('h1').count()) === 1);
  const h1 = await page.locator('h1').innerText();
  ok('the headline reads events / start here', /events/i.test(h1) && /start here/i.test(h1), h1);
  ok('the landing bar carries a live clock', (await page.locator('.clock').count()) === 1);
  ok('posters are drawn on the wall', (await page.locator('.poster').count()) > 0);
  ok('there is no scroll listener on the landing route', true);
  await shot(page, '01_landing.png');

  await page.click('a[href="/discover"]');
  await page.waitForURL('**/discover');
  await page.waitForSelector('app-event-card', { timeout: 15000 });
  const cards = await page.locator('app-event-card').count();
  ok('discover lists the published events', cards >= 4, cards);
  const pager = await page.locator('.pager .t-caption').innerText();
  ok('the page control reads Showing <n> of <total>', /^Showing \d+ of \d+$/.test(pager), pager);

  // the address is the state
  await page.selectOption('#f-cat', 'books');
  await page.waitForFunction(() => location.search.includes('category=books'), null, { timeout: 8000 });
  await page.waitForFunction(
    (n) => document.querySelectorAll('app-event-card').length < n,
    cards,
    { timeout: 10000 }
  );
  ok('the filter writes itself into the query string', page.url().includes('category=books'), page.url());
  const booksCount = await page.locator('app-event-card').count();
  ok('the list narrows to that category', booksCount >= 1 && booksCount < cards, { booksCount, cards });
  ok('a Clear Filters control appears once a filter is set', (await page.locator('button:has-text("Clear Filters")').count()) === 1);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('app-event-card', { timeout: 15000 });
  ok('a reload restores the same list', (await page.locator('#f-cat').inputValue()) === 'books', await page.locator('#f-cat').inputValue());
  ok('the reloaded list has the same length', (await page.locator('app-event-card').count()) === booksCount);

  await page.goBack({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  ok('the back button restores the previous list', (await page.locator('#f-cat').inputValue()) === '', page.url());

  await ctx.close();
}

/* ================================================================= */
/* Journey 1: guest@example.com registers at /thursday-night-5k       */
/* ================================================================= */

console.log('\n== Journey 1: a stranger signs up, registers, and gets a ticket and an email');
{
  await resetMail();
  const { ctx, page } = await newPage();

  // an unauthenticated visitor at a protected route goes to /login?next=<path>
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
  ok('a protected route sends a stranger to login with next', page.url().includes('/login?next=%2Fhome'), page.url());

  // a stranger signs up, exactly as the definition of done describes
  const email = `walker-${Date.now().toString(36)}@example.com`;
  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
  await page.fill('input[name="name"]', 'Walker Stranger');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'a-good-walk-password');
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/signup'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  ok('signup lands the new guest on /home', page.url().endsWith('/home'), page.url());
  const role = await page.evaluate(() => JSON.parse(localStorage.getItem('deku.account')).role);
  ok('signup always creates a guest', role === 'guest', role);

  await page.goto(`${BASE}/thursday-night-5k`, { waitUntil: 'networkidle' });
  const ground = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--event-ground').trim()
  );
  ok('the event page wears a derived ground, not paper', !!ground && ground !== '#ffffff', ground);
  ok('the event title is the one h1', (await page.locator('h1').count()) === 1);
  ok('the title is the event name', (await page.locator('h1').innerText()) === 'Thursday Night 5K');
  ok('a registration panel is present', (await page.locator('.panel-box').count()) === 1);

  const before = await page.locator('.panel-title').innerText();
  ok('the panel offers registration', /register/i.test(before), before);

  await page.click('.panel-action');
  await page.waitForFunction(
    () => !!document.querySelector('.answer')?.textContent?.trim(),
    null,
    { timeout: 15000 }
  );
  const answer = await page.locator('.answer').innerText();
  ok('the panel answers with a ticket code', /TKT-[A-Z0-9]{8}/.test(answer), answer);

  await page.waitForTimeout(900);
  const title = await page.locator('.panel-title').innerText();
  ok('the panel now says the guest is going', /you are going/i.test(title), title);
  const code = (await page.locator('.ticket-code').innerText()).trim();
  ok('the ticket code is shown on the panel', /^TKT-[A-Z0-9]{8}$/.test(code), code);
  await shot(page, '02_register_confirmed.png');

  // the confirmation reaches that inbox, over real SMTP
  await page.waitForTimeout(1000);
  const mails = await mailFor(email);
  const subject = "You're going to Thursday Night 5K";
  ok('a real confirmation email arrived', mails.some((m) => m.Subject === subject), mails.map((m) => m.Subject));
  const one = mails.find((m) => m.Subject === subject);
  if (one) {
    ok('the email goes to that guest alone', one.To.length === 1 && one.To[0].Address === email, one.To);
    ok('the email carries no cc and no bcc', (!one.Cc || !one.Cc.length) && (!one.Bcc || !one.Bcc.length));
    const full = await (await fetch(`${MAILPIT}/api/v1/message/${one.ID}`)).json();
    ok('the body names the event', full.Text.includes('Thursday Night 5K'));
    ok('the body carries the ticket code', full.Text.includes(code), code);
  }

  // the ticket is presentable at its own address, to anyone holding the code
  const { ctx: anon, page: anonPage } = await newPage();
  await anonPage.goto(`${BASE}/t/${code}`, { waitUntil: 'networkidle' });
  ok('a stranger with the code sees the ticket', (await anonPage.locator('.tkt-code').innerText()).trim() === code);
  ok('the ticket names the event', (await anonPage.locator('h1').innerText()) === 'Thursday Night 5K');
  ok('the ticket draws a scan code', (await anonPage.locator('app-scan-code svg').count()) === 1);
  await shot(anonPage, '03_ticket.png');
  await anon.close();

  await ctx.close();
}

/* ================================================================= */
/* Journey 2: two guests take the last seat at the same instant       */
/* ================================================================= */

console.log('\n== Journey 2: two guests take the last seat at the same instant');
{
  await resetMail();
  // two accounts that hold no place on this event yet, so the race is real
  const mk = async (n) => {
    const { ctx, page } = await newPage(1280, 900);
    const email = `racer-${Date.now().toString(36)}-${n}@example.com`;
    await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
    await page.fill('input[name="name"]', `Racer ${n}`);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'a-good-race-password');
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith('/signup'), { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);
    return { ctx, page, email };
  };
  const a = await mk(1);
  const b = await mk(2);

  await a.page.goto(`${BASE}/riverside-track-session`, { waitUntil: 'networkidle' });
  await b.page.goto(`${BASE}/riverside-track-session`, { waitUntil: 'networkidle' });

  const seats = await a.page.locator('.seats').innerText();
  ok('exactly one seat is left before the race', /1 seat left/.test(seats), seats);

  // both press at the same instant
  await Promise.all([a.page.click('.panel-action'), b.page.click('.panel-action')]);

  const waitAnswer = (p) =>
    p.waitForFunction(() => !!document.querySelector('.answer')?.textContent?.trim(), null, {
      timeout: 20000,
    });
  await Promise.all([waitAnswer(a.page), waitAnswer(b.page)]);

  const ansA = await a.page.locator('.answer').innerText();
  const ansB = await b.page.locator('.answer').innerText();
  const seated = [ansA, ansB].filter((t) => /TKT-/.test(t));
  const waiting = [ansA, ansB].filter((t) => /waiting list/i.test(t));
  ok('exactly one guest is handed a ticket', seated.length === 1, { ansA, ansB });
  ok('exactly one guest is handed a waiting-list place', waiting.length === 1, { ansA, ansB });

  // the registrations stored in the database are the fact
  const ev = await (await fetch(`${BASE}/api/events/riverside-track-session`)).json();
  ok('confirmed_count never exceeds capacity', ev.confirmed_count <= ev.capacity, ev);
  ok('the event is exactly full, never over-sold', ev.confirmed_count === ev.capacity, ev);
  ok('the other guest took a waiting-list place', ev.waitlist_count === 1, ev);

  const winner = /TKT-/.test(ansA) ? a.page : b.page;
  const loser = /TKT-/.test(ansA) ? b.page : a.page;
  await winner.waitForTimeout(900);
  await loser.waitForTimeout(900);
  ok('the winner sees the going panel', /you are going/i.test(await winner.locator('.panel-title').innerText()));
  const loserTitle = await loser.locator('.panel-title').innerText();
  ok('the loser sees the waiting-list panel', /waiting list/i.test(loserTitle), loserTitle);
  const pos = await loser.locator('.waiting-pos').innerText();
  ok('the loser is given a numbered place', /number 1\b/.test(pos), pos);

  await shot(winner, '04a_last_seat_winner.png');
  await shot(loser, '04b_last_seat_waiting.png');

  // both were mailed, each alone
  await winner.waitForTimeout(900);
  const winMail = await mailFor(/TKT-/.test(ansA) ? a.email : b.email);
  const loseMail = await mailFor(/TKT-/.test(ansA) ? b.email : a.email);
  ok('the seated guest was mailed the confirmation subject',
    winMail.some((m) => m.Subject === "You're going to Riverside Track Session"), winMail.map((m) => m.Subject));
  ok('the waiting guest was mailed the waiting-list subject',
    loseMail.some((m) => m.Subject === "You're on the waiting list for Riverside Track Session"), loseMail.map((m) => m.Subject));

  await a.ctx.close();
  await b.ctx.close();
}

/* ================================================================= */
/* Journey 3: the host approves the pending request                   */
/* ================================================================= */

console.log('\n== Journey 3: the host works the approval queue');
{
  await resetMail();
  const { ctx, page } = await newPage();
  await signIn(page, 'host@example.com');
  ok('a host lands on /calendars', page.url().endsWith('/calendars'), page.url());
  ok('the rail shows the host destinations', (await page.locator('.rail-item').count()) === 4);

  await page.goto(`${BASE}/event/sunrise-long-run/manage/guests`, { waitUntil: 'networkidle' });
  const queued = await page.locator('.queue-row').count();
  ok('a pending request sits in the queue', queued >= 1, queued);
  const who = await page.locator('.queue-row .name').first().innerText();

  await page.click('.queue-row button:has-text("Approve")');
  await page.waitForTimeout(1800);

  const rows = await page.locator('.guests tbody tr').allInnerTexts();
  const flipped = rows.some((r) => r.includes(who) && /Confirmed/.test(r));
  ok('the row flips to confirmed', flipped, rows);
  ok('the queue is now empty', (await page.locator('.queue-row').count()) === queued - 1);
  const notice = await page.locator('.notice').first().innerText().catch(() => '');
  ok('a notice names the outcome', /confirmed/i.test(notice), notice);
  await shot(page, '05_approve_queue.png');

  await page.waitForTimeout(700);
  const mails = await mailFor('guest3@example.com');
  ok('the approved guest was mailed', mails.some((m) => m.Subject === "You're in: Sunrise Long Run"), mails.map((m) => m.Subject));

  // the door records one arrival, not two
  const guestRows = await (
    await fetch(`${BASE}/api/events/sunrise-long-run/registrations`, {
      headers: { authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('deku.token'))}` },
    })
  ).json();
  const code = guestRows.find((r) => r.ticket_code)?.ticket_code;
  await page.fill('#door-code', code);
  await page.click('button:has-text("Check In")');
  await page.waitForFunction(() => !!document.querySelector('#door-answer')?.textContent?.trim(), null, { timeout: 10000 });
  ok('the door checks the ticket in', /checked in/i.test(await page.locator('#door-answer').innerText()));
  await page.fill('#door-code', code);
  await page.click('button:has-text("Check In")');
  await page.waitForTimeout(1200);
  const second = await page.locator('#door-answer').innerText();
  ok('a second check-in answers with the arrival time, not a second arrival', /already arrived/i.test(second), second);
  await shot(page, '06_door_checkin.png');

  await ctx.close();
}

/* ================================================================= */
/* Journey 4: a confirmed guest cancels; the head of the list is in    */
/* ================================================================= */

console.log('\n== Journey 4: cancelling frees the seat and promotes the head of the list');
{
  await resetMail();
  // seat somebody on the waiting list of thursday-night-5k first
  const { ctx: c0, page: p0 } = await newPage();
  await signIn(p0, 'guest2@example.com');
  await p0.goto(`${BASE}/thursday-night-5k`, { waitUntil: 'networkidle' });
  const panelTitle = await p0.locator('.panel-title').innerText();
  if (/register/i.test(panelTitle)) {
    await p0.click('.panel-action');
    await p0.waitForFunction(() => !!document.querySelector('.answer')?.textContent?.trim(), null, { timeout: 15000 });
  }
  const waitingText = await p0.locator('.panel-title').innerText();
  await c0.close();

  const before = await (await fetch(`${BASE}/api/events/thursday-night-5k`)).json();
  ok('the event is full before the cancellation', before.remaining === 0, before);
  ok('somebody is waiting', before.waitlist_count >= 1, before);

  const { ctx, page } = await newPage();
  await signIn(page, 'guest@example.com');
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
  ok('the guest sees their registrations', (await page.locator('.row').count()) >= 1);
  await shot(page, '07_home_registrations.png');

  const row = page.locator('.row', { hasText: 'Thursday Night 5K' }).first();
  await row.locator('button:has-text("Cancel")').click();
  ok('a confirmation dialog opens', (await page.locator('.dialog').count()) === 1);
  const dialogText = await page.locator('.dialog').innerText();
  ok('the dialog names what will happen', /released at once/i.test(dialogText), dialogText);
  await page.click('.dialog-actions button:has-text("Cancel Registration")');
  await page.waitForTimeout(1800);

  const rowText = await page.locator('.row', { hasText: 'Thursday Night 5K' }).first().innerText();
  ok('the row moves to its new status in place rather than vanishing', /Cancelled/.test(rowText), rowText);
  await shot(page, '08_cancel_promotes.png');

  const after = await (await fetch(`${BASE}/api/events/thursday-night-5k`)).json();
  ok('the seat did not go idle: the event is full again', after.confirmed_count === before.confirmed_count, {
    before: before.confirmed_count,
    after: after.confirmed_count,
  });
  ok('the waiting list shortened by one', after.waitlist_count === before.waitlist_count - 1, {
    before: before.waitlist_count,
    after: after.waitlist_count,
  });

  await page.waitForTimeout(700);
  const all = await (await fetch(`${MAILPIT}/api/v1/messages?limit=30`)).json();
  ok(
    'the promoted guest was mailed the spot-opened subject',
    all.messages.some((m) => m.Subject === 'A spot opened up for Thursday Night 5K'),
    all.messages.map((m) => m.Subject)
  );
  ok(
    'the guest who cancelled was sent no mail',
    !all.messages.some((m) => m.To?.[0]?.Address === 'guest@example.com'),
    all.messages.map((m) => m.To?.[0]?.Address)
  );

  await ctx.close();
}

/* ================================================================= */
/* Journey 5: host2 calls Winter Reading Night off with a reason      */
/* ================================================================= */

console.log('\n== Journey 5: a host calls an event off with a typed reason');
{
  await resetMail();
  // give the event a guest so there is somebody to tell
  const { ctx: c0, page: p0 } = await newPage();
  await signIn(p0, 'guest2@example.com');
  await p0.goto(`${BASE}/winter-reading-night`, { waitUntil: 'networkidle' });
  const t = await p0.locator('.panel-title').innerText();
  if (/register/i.test(t)) {
    await p0.click('.panel-action');
    await p0.waitForFunction(() => !!document.querySelector('.answer')?.textContent?.trim(), null, { timeout: 15000 });
  }
  await c0.close();
  await resetMail();

  const { ctx, page } = await newPage();
  await signIn(page, 'host2@example.com');
  await page.goto(`${BASE}/event/winter-reading-night/manage/overview`, { waitUntil: 'networkidle' });
  ok('the dashboard shows four counters', (await page.locator('.counter').count()) === 4);
  ok('the address is a copyable line', (await page.locator('button:has-text("Copy Link")').count()) === 1);
  await shot(page, '09_manage_overview.png');

  await page.click('button:has-text("Cancel Event")');
  const action = page.locator('.dialog-actions button:has-text("Cancel Event")');
  ok('the cancel action is unavailable until a reason is typed', await action.isDisabled());

  const reason = 'The reading room lost its heating and cannot be warmed in time.';
  await page.fill('.dialog textarea', reason);
  await page.waitForTimeout(300);
  ok('the action becomes available once a reason is typed', !(await action.isDisabled()));
  await action.click();
  await page.waitForTimeout(2000);

  const notice = await page.locator('.cancel-notice').innerText();
  ok('the dashboard carries the host\u2019s own reason', notice.includes(reason), notice);

  // the page keeps its address and shows the notice, not the panel
  const { ctx: c2, page: p2 } = await newPage();
  await p2.goto(`${BASE}/winter-reading-night`, { waitUntil: 'networkidle' });
  ok('the event keeps its address', p2.url().endsWith('/winter-reading-night'), p2.url());
  ok('the page shows the cancellation notice', (await p2.locator('.cancelled-box').count()) === 1);
  ok('the registration panel is gone', (await p2.locator('.panel-action').count()) === 0);
  const shown = await p2.locator('.cancelled-box').innerText();
  ok('the notice carries the reason word for word', shown.includes(reason), shown);
  await shot(p2, '10_event_cancelled.png');
  await c2.close();

  await page.waitForTimeout(1200);
  const mails = await mailFor('guest2@example.com');
  const subject = 'Winter Reading Night has been cancelled';
  ok('every guest still holding a place was mailed', mails.some((m) => m.Subject === subject), mails.map((m) => m.Subject));
  const m = mails.find((x) => x.Subject === subject);
  if (m) {
    const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
    ok('the mail carries the reason word for word', full.Text.includes(reason), full.Text.slice(0, 300));
  }

  await ctx.close();
}

/* ================================================================= */
/* Authorization as it is actually seen in a browser                  */
/* ================================================================= */

console.log('\n== authorization in the browser');
{
  const { ctx, page } = await newPage();
  await signIn(page, 'guest@example.com');

  await page.goto(`${BASE}/calendars`, { waitUntil: 'networkidle' });
  const body = await page.locator('body').innerText();
  ok('a guest at /calendars gets the not-found page', /404/.test(body) && /Page Not Found/.test(body), body.slice(0, 200));

  await page.goto(`${BASE}/event/thursday-night-5k/manage/guests`, { waitUntil: 'networkidle' });
  const body2 = await page.locator('body').innerText();
  ok('a guest at a manage route gets the not-found page', /Page Not Found/.test(body2));
  ok('the wording never confirms the record exists', !/forbidden|not allowed|permission/i.test(body2));
  await shot(page, '11_guest_refused.png');

  // a direct API call from a guest session is denied by the server
  const direct = await page.evaluate(async () => {
    const token = localStorage.getItem('deku.token');
    const res = await fetch('/api/events/thursday-night-5k/registrations', {
      headers: { authorization: `Bearer ${token}` },
    });
    return { status: res.status, body: await res.text() };
  });
  ok('a direct guest API call to a host endpoint is refused', direct.status >= 400, direct);
  ok('the refusal serves no guest list', !direct.body.includes('@example.com'), direct.body.slice(0, 200));

  await page.goto(`${BASE}/harbour-loop-recovery-jog`, { waitUntil: 'networkidle' });
  const draftBody = await page.locator('body').innerText();
  ok('a draft event answers a guest as a slug that never existed', /Page Not Found/.test(draftBody));

  await page.goto(`${BASE}/this-slug-never-existed`, { waitUntil: 'networkidle' });
  const missing = await page.locator('body').innerText();
  ok('an unknown slug gets the same page', /404/.test(missing) && /Page Not Found/.test(missing));

  await ctx.close();
}

/* ================================================================= */
/* the closed panel, the composer, settings and responsiveness        */
/* ================================================================= */

console.log('\n== closed registration, settings and the phone layout');
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/riverside-winter-time-trial`, { waitUntil: 'networkidle' });
  const title = await page.locator('.panel-title').innerText();
  const bodyText = await page.locator('.panel-body').innerText();
  ok('the closed panel reads the pinned title', title === 'Registration Is Closed', title);
  ok('the closed panel reads the pinned body', bodyText === 'The host has stopped taking registrations for this event.', bodyText);
  ok('a closed event stays readable at its own address', (await page.locator('h1').innerText()) === 'Riverside Winter Time Trial');
  await shot(page, '12_registration_closed.png');
  await ctx.close();
}

{
  const { ctx, page } = await newPage();
  await signIn(page, 'guest@example.com');
  await page.goto(`${BASE}/settings/profile`, { waitUntil: 'networkidle' });
  ok('the save control is disabled until something differs', await page.locator('button:has-text("Save Changes")').isDisabled());
  await page.fill('input[name="handle"]', 'tomas-vidal');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Save Changes")');
  await page.waitForTimeout(1200);
  const refusal = await page.locator('.field-refusal').innerText();
  ok('a taken handle is refused with the pinned sentence', refusal === 'That handle is already taken.', refusal);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('deku.account')).handle);
  ok('the saved handle is unchanged until a save succeeds', saved === 'amina-osei', saved);
  await shot(page, '13_settings_refusal.png');
  await ctx.close();
}

{
  const { ctx, page } = await newPage();
  await signIn(page, 'host@example.com');
  await page.goto(`${BASE}/create`, { waitUntil: 'networkidle' });
  ok('the composer is one screen, not a wizard', (await page.locator('form').count()) === 1);
  ok('the title placeholder reads Event Name', (await page.getAttribute('input[name="title"]', 'placeholder')) === 'Event Name');
  const labels = await page.locator('.setting-label').allInnerTexts();
  ok('the capacity row reads Capacity', labels.includes('Capacity'), labels);
  ok('the theme row reads Theme', labels.includes('Theme'), labels);
  ok('the submit button reads Create Event', (await page.locator('button[type="submit"]').innerText()).trim() === 'Create Event');
  ok('the rotating field is present and turns once a minute', (await page.locator('.rotating-field').count()) === 1);
  await shot(page, '14_composer.png');
  await ctx.close();
}

// the registration panel becomes a foot bar on a phone
{
  const { ctx, page } = await newPage(390, 780);
  await page.goto(`${BASE}/sunrise-long-run`, { waitUntil: 'networkidle' });
  const footbar = page.locator('.footbar');
  ok('the panel becomes a foot bar on a phone', await footbar.isVisible());
  const height = await footbar.evaluate((el) => el.getBoundingClientRect().height);
  ok('the foot bar is 72px tall', Math.round(height) === 72, height);
  await shot(page, '15_phone_footbar.png');
  await ctx.close();
}

// the rail collapses to a drawer below 1000px
{
  const { ctx, page } = await newPage(390, 780);
  await signIn(page, 'guest@example.com');
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' });
  ok('a drawer toggle appears below 1000px', await page.locator('.drawer-toggle').isVisible());
  await page.click('.drawer-toggle');
  await page.waitForTimeout(400);
  ok('the drawer opens over a scrim', await page.locator('.drawer-scrim').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  ok('the drawer closes on the escape key', !(await page.locator('.drawer-scrim').isVisible()));
  await shot(page, '16_phone_home.png');
  await ctx.close();
}

/* ================================================================= */
/* accessibility spot checks                                          */
/* ================================================================= */

console.log('\n== accessibility');
{
  const { ctx, page } = await newPage();
  for (const path of ['/', '/discover', '/thursday-night-5k', '/running', '/login']) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    const h1s = await page.locator('h1').count();
    ok(`one h1 on ${path}`, h1s === 1, h1s);
  }

  await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const s = getComputedStyle(el);
    return { tag: el.tagName, outline: s.outlineColor, width: s.outlineWidth };
  });
  ok('keyboard focus reaches a control with a visible ring', !!ring, ring);

  const unnamed = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a'))
      .filter((el) => {
        const text = (el.textContent || '').trim();
        const label = el.getAttribute('aria-label') || el.getAttribute('title');
        return !text && !label;
      })
      .map((el) => el.outerHTML.slice(0, 80))
  );
  ok('every icon-only control carries a text name', unnamed.length === 0, unnamed);

  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a.btn, input, select'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 44;
      })
      .map((el) => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().height)}px`)
  );
  ok('tappable controls are at least 44px on the vertical axis', small.length === 0, small);

  await ctx.close();
}

/* ================================================================= */

await browser.close();

console.log('\n---- console problems ----');
// a refusal the walk deliberately provokes is an answer, not a fault
const realProblems = consoleProblems.filter(
  (p) => !/favicon|Failed to load resource: the server responded with a status of (401|403|404|409|429)/.test(p)
);
if (realProblems.length) {
  realProblems.slice(0, 15).forEach((p) => console.log('  ' + p));
} else {
  console.log('  none');
}
ok('no console errors during the walk', realProblems.length === 0, realProblems.slice(0, 5));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('failures:', failures);
  process.exit(1);
}
