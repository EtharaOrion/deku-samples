DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'deku_app') THEN
        CREATE ROLE deku_app LOGIN PASSWORD 'deku-local-dev';
    END IF;
END
$$;

DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO deku_app', current_database());
END
$$;

GRANT ALL ON SCHEMA public TO deku_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO deku_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO deku_app;
