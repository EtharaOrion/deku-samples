-- Creates the unprivileged role the AGENT connects as. The superuser stays with
-- the verifier (PLAN.md 3.4) so the agent cannot satisfy a workflow by writing
-- rows directly instead of implementing the feature.
--
-- GENERIC seed, identical across every postgres task. Owned by the central
-- environment/ catalog; environment/compose.py copies it into each task's
-- environment/postgres-init.sql. Edit HERE, never the per-task copy.
--
-- WHY .sql AND NOT .sh
-- ---------------------------------------------------------------------------
-- The postgres entrypoint dispatches on extension: a *.sql file is fed to psql
-- directly, while a *.sh file is executed when it carries the executable bit and
-- SOURCED when it does not. That makes a shell seed depend on a file mode, and
-- the mode has no durable carrier on the path a bundle travels: the output tree
-- is not a git repository, NTFS cannot store it, and zip archives drop it. On a
-- Windows checkout `ls -l` synthesises rwxr-xr-x for every file, so the mode
-- looks correct whatever it really is and `chmod +x` cannot be verified.
--
-- Sourcing carries its own failure: a trailing \r from CRLF line endings breaks
-- the heredoc a shell seed uses, so the role is never created. Either way the
-- database still starts, still reports healthy, and pg_isready still passes. The
-- app only fails much later with 28P01, which postgres words as "password
-- authentication failed" for a wrong password and a missing role alike, so the
-- symptom reads as an application credential bug and the cause is packaging.
--
-- A .sql seed has no mode, no interpreter and no heredoc, so none of that can
-- happen. G1 (tools/layout_lint.py) rejects any bundle that mounts a .sh into
-- /docker-entrypoint-initdb.d/.

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
