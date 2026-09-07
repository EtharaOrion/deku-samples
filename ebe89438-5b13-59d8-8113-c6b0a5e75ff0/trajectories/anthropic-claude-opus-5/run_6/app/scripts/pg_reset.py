
"""Small database helpers so the browser walk can arrange each journey."""
import asyncio, os
import asyncpg

DSN = os.environ["DATABASE_URL"]

async def _conn():
    return await asyncpg.connect(DSN)

async def reset_track_session():
    c = await _conn()
    eid = await c.fetchval("select id from events where slug='riverside-track-session'")
    await c.execute("delete from registrations where event_id=$1", eid)
    # capacity 2 with one seat already taken leaves exactly one free
    await c.execute("update events set capacity=2, waitlist_enabled=true, approval_required=false, state='published' where id=$1", eid)
    aid = await c.fetchval("select id from accounts where email='guest@example.com'")
    await c.execute("""insert into registrations (event_id, account_id, status, seat_no, ticket_code)
                       values ($1,$2,'confirmed',1,'TKT-WALKRT01')""", eid, aid)
    await c.close()

async def setup_cancel_case():
    """guest@example.com holds the only seat; a fresh account waits at position 1."""
    c = await _conn()
    eid = await c.fetchval("select id from events where slug='thursday-night-5k'")
    await c.execute("delete from registrations where event_id=$1", eid)
    await c.execute("update events set capacity=1, waitlist_enabled=true, approval_required=false, state='published' where id=$1", eid)
    holder = await c.fetchval("select id from accounts where email='guest@example.com'")
    await c.execute("""insert into registrations (event_id, account_id, status, seat_no, ticket_code)
                       values ($1,$2,'confirmed',1,'TKT-WALKTN01')""", eid, holder)
    head_email = 'walk-head@example.com'
    head = await c.fetchval("select id from accounts where email=$1", head_email)
    if not head:
        head = await c.fetchval("""insert into accounts (email, password_hash, display_name, handle, role)
                                   values ($1,$2,'Walk Head','walk-head','guest') returning id""",
                                head_email, await c.fetchval("select password_hash from accounts where email='guest@example.com'"))
        await c.execute("insert into namespace_reservations (slug, kind) values ('walk-head','account') on conflict do nothing")
    await c.execute("""insert into registrations (event_id, account_id, status, waitlist_position)
                       values ($1,$2,'waitlisted',1)
                       on conflict (event_id, account_id) do update
                       set status='waitlisted', waitlist_position=1, seat_no=null, ticket_code=null""",
                    eid, head)
    await c.execute("delete from email_log where recipient=$1", head_email)
    await c.close()
    return head_email

async def head_is_confirmed(email):
    c = await _conn()
    row = await c.fetchrow("""select r.status, r.ticket_code from registrations r
                              join accounts a on a.id=r.account_id
                              join events e on e.id=r.event_id
                              where a.email=$1 and e.slug='thursday-night-5k'""", email)
    await c.close()
    return bool(row and row['status']=='confirmed' and row['ticket_code'])

async def republish_winter():
    c = await _conn()
    await c.execute("""update events set state='published', cancel_reason=null, cancelled_at=null
                       where slug='winter-reading-night'""")
    await c.close()

async def any_ticket_code():
    c = await _conn()
    code = await c.fetchval("select ticket_code from registrations where ticket_code is not null limit 1")
    await c.close()
    return code


async def setup_pending_case():
    """Puts one guest back in the approval queue for sunrise-long-run."""
    c = await _conn()
    eid = await c.fetchval("select id from events where slug='sunrise-long-run'")
    await c.execute("delete from registrations where event_id=$1", eid)
    await c.execute("""update events set approval_required=true, capacity=20,
                       waitlist_enabled=true, state='published' where id=$1""", eid)
    aid = await c.fetchval("select id from accounts where email='guest3@example.com'")
    await c.execute("""insert into registrations (event_id, account_id, status)
                       values ($1,$2,'pending_approval')""", eid, aid)
    await c.close()
