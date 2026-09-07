-- Migration 002. Additive only: a new table, and no historical row changes its
-- meaning. Every reference already issued keeps the value and the meaning it
-- had, and this table is seeded from them so the next reference continues the
-- run rather than restarting it.
--
-- Why: reading the highest existing reference and adding one is not safe when
-- two acts land at once. Both read the same highest value, both compute the
-- same next reference, and one loses on the primary key. A reference is the
-- thing every later route addresses a record by, so it has to be allocated
-- atomically.

create table if not exists reference_sequence (
  prefix text primary key,
  last_n bigint not null default 0
);
