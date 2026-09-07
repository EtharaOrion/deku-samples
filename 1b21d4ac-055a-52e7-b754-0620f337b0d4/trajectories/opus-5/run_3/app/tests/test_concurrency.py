"""Two simultaneous creates carrying the same slug: exactly one lands."""
import sys
import threading

sys.path.insert(0, "/app")

from cirrus import create_app  # noqa: E402
from cirrus.db import execute, init_db, query  # noqa: E402

PW = "deku-demo-pw-2026"


def main():
    init_db()
    app = create_app()
    app.testing = True

    print("== seed idempotency ==")
    before = query("SELECT count(*) AS n FROM items")[0]["n"]
    init_db()
    init_db()
    after = query("SELECT count(*) AS n FROM items")[0]["n"]
    print(f"  items before {before}, after two further seeds {after}",
          "ok" if before == after else "FAIL")
    houses = query("SELECT count(*) AS n FROM houses")[0]["n"]
    accounts = query("SELECT count(*) AS n FROM accounts WHERE email IN ('producer@example.com','producer.meridian@example.com','viewer@example.com')")[0]["n"]
    print(f"  houses {houses} (expect 2)", "ok" if houses == 2 else "FAIL")
    print(f"  seeded accounts {accounts} (expect 3)", "ok" if accounts == 3 else "FAIL")

    print("\n== concurrent creates of one slug ==")
    with app.test_client() as c:
        token = c.post("/api/auth/login",
                       json={"email": "producer@example.com", "password": PW}
                       ).get_json()["token"]

    results = []
    lock = threading.Lock()
    barrier = threading.Barrier(8)

    def create(i):
        client = app.test_client()
        barrier.wait()
        r = client.post("/api/studio/items",
                        json={"kind": "talent", "title": f"Race {i}",
                              "slug": "race-condition", "discipline": "stylist"},
                        headers={"Authorization": f"Bearer {token}"})
        with lock:
            results.append(r.status_code)

    threads = [threading.Thread(target=create, args=(i,)) for i in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    created = [s for s in results if s == 201]
    refused = [s for s in results if 400 <= s < 500 and s != 201]
    rows = query("SELECT id, title FROM items WHERE slug='race-condition'")
    print(f"  statuses: {sorted(results)}")
    print(f"  exactly one create landed: {len(created)}",
          "ok" if len(created) == 1 else "FAIL")
    print(f"  the losers were refused as client errors: {len(refused)}",
          "ok" if len(refused) == 7 else "FAIL")
    print(f"  exactly one row exists: {len(rows)}", "ok" if len(rows) == 1 else "FAIL")
    print("  no server errors",
          "ok" if not any(s >= 500 for s in results) else "FAIL")

    execute("DELETE FROM items WHERE slug='race-condition'")
    print("  cleaned up")
    return 0 if len(created) == 1 and len(rows) == 1 and before == after else 1


if __name__ == "__main__":
    sys.exit(main())
