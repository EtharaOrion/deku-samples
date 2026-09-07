
/**
 * Proves the seat guarantee lives in the database, not in application logic,
 * by attacking the tables directly with SQL the app would never write.
 */
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + ' ' + d); } };

const eid = (await pool.query("select id from events where slug='thursday-night-5k'")).rows[0].id;
const accounts = (await pool.query("select id from accounts order by id limit 6")).rows.map(r => r.id);

async function refuses(label, sql, params = []) {
  try {
    await pool.query(sql, params);
    ok(label, false, 'the database accepted it');
    return false;
  } catch (e) {
    ok(label, true);
    return true;
  }
}

console.log('\n== the database refuses to oversell, whatever SQL is aimed at it ==');
await pool.query('delete from registrations where event_id=$1', [eid]);
await pool.query('update events set capacity=2 where id=$1', [eid]);

await pool.query(`insert into registrations (event_id, account_id, status, seat_no, ticket_code)
                  values ($1,$2,'confirmed',1,'TKT-DBTEST01')`, [eid, accounts[0]]);
await pool.query(`insert into registrations (event_id, account_id, status, seat_no, ticket_code)
                  values ($1,$2,'confirmed',2,'TKT-DBTEST02')`, [eid, accounts[1]]);

await refuses('a third seat beyond capacity is refused by the trigger',
  `insert into registrations (event_id, account_id, status, seat_no, ticket_code)
   values ($1,$2,'confirmed',3,'TKT-DBTEST03')`, [eid, accounts[2]]);

await refuses('a second occupant of seat 1 is refused by the unique index',
  `insert into registrations (event_id, account_id, status, seat_no, ticket_code)
   values ($1,$2,'confirmed',1,'TKT-DBTEST04')`, [eid, accounts[2]]);

await refuses('a confirmed row holding no seat is refused by the check',
  `insert into registrations (event_id, account_id, status, seat_no, ticket_code)
   values ($1,$2,'confirmed',null,'TKT-DBTEST05')`, [eid, accounts[2]]);

await refuses('a confirmed row holding no ticket is refused by the check',
  `insert into registrations (event_id, account_id, status, seat_no, ticket_code)
   values ($1,$2,'confirmed',3,null)`, [eid, accounts[2]]);

await refuses('a waitlisted row holding a ticket is refused by the check',
  `insert into registrations (event_id, account_id, status, waitlist_position, ticket_code)
   values ($1,$2,'waitlisted',1,'TKT-DBTEST06')`, [eid, accounts[2]]);

await refuses('a cancelled row keeping its seat is refused by the check',
  `insert into registrations (event_id, account_id, status, seat_no, ticket_code)
   values ($1,$2,'cancelled_by_guest',3,'TKT-DBTEST07')`, [eid, accounts[2]]);

await refuses('a second registration by the same account is refused by the unique index',
  `insert into registrations (event_id, account_id, status)
   values ($1,$2,'declined')`, [eid, accounts[0]]);

await refuses('two registrations cannot share a ticket code',
  `insert into registrations (event_id, account_id, status, seat_no, ticket_code)
   values ((select id from events where slug='sunrise-long-run'),$1,'confirmed',1,'TKT-DBTEST01')`, [accounts[2]]);

await refuses('a malformed ticket code is refused by the check',
  `insert into registrations (event_id, account_id, status, seat_no, ticket_code)
   values ((select id from events where slug='sunrise-long-run'),$1,'confirmed',2,'not-a-ticket')`, [accounts[2]]);

await refuses('lowering capacity below the seats taken is refused by the trigger',
  `update events set capacity = 1 where id = $1`, [eid]);

await refuses('an unknown registration status is refused by the check',
  `insert into registrations (event_id, account_id, status)
   values ((select id from events where slug='sunrise-long-run'),$1,'vip')`, [accounts[3]]);

await refuses('an unknown event state is refused by the check',
  `update events set state='paused' where id=$1`, [eid]);

const n = (await pool.query(
  `select count(*)::int n from registrations where event_id=$1 and status in ('confirmed','checked_in')`, [eid])).rows[0].n;
const cap = (await pool.query('select capacity from events where id=$1', [eid])).rows[0].capacity;
ok('after every attack the seats held still fit the capacity', n <= cap, `${n} of ${cap}`);

// restore the seeded shape of this event
await pool.query('delete from registrations where event_id=$1', [eid]);
await pool.query('update events set capacity=3 where id=$1', [eid]);
const [g1, g2, g3] = (await pool.query(
  `select id from accounts where email in ('guest@example.com','guest2@example.com','guest3@example.com')
   order by email`)).rows.map(r => r.id);
await pool.query(`insert into registrations (event_id, account_id, status, seat_no, ticket_code)
                  values ($1,$2,'confirmed',1,'TKT-SEEDTN01'),($1,$3,'confirmed',2,'TKT-SEEDTN02')`, [eid, g1, g2]);
await pool.query(`insert into registrations (event_id, account_id, status, waitlist_position)
                  values ($1,$2,'waitlisted',1)`, [eid, g3]);

console.log(`\n${pass} passed, ${fail} failed\n`);
await pool.end();
process.exit(fail ? 1 : 0);
