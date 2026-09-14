"""PostgreSQL connection management. One connection per request."""
import psycopg


class Database:
    def __init__(self, url):
        self.url = url

    def connection(self):
        conn = psycopg.connect(self.url, autocommit=False)
        conn.row_factory = psycopg.rows.dict_row
        return conn

    def rollback(self):
        try:
            conn = g_get()
            if conn is not None:
                conn.rollback()
        except Exception:
            pass


def g_get():
    from flask import g

    return g.get("conn", None)
