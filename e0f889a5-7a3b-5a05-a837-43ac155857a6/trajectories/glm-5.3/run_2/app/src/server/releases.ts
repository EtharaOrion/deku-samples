import { q } from './db/pool.ts';

export type ReleaseView = {
  version: string;
  build: number;
  released_on: string;
  channel: string;
  artifact_name: string;
  size_bytes: number;
  sha256: string;
  description: string | null;
  notes: Record<string, string[]>;
};

export function releaseView(row: any): ReleaseView {
  return {
    version: row.version,
    build: Number(row.build),
    released_on: new Date(row.released_on).toISOString().slice(0, 10),
    channel: row.channel,
    artifact_name: row.artifact_name,
    size_bytes: Number(row.size_bytes),
    sha256: row.sha256,
    description: row.description ?? null,
    notes: typeof row.notes === 'string' ? JSON.parse(row.notes) : (row.notes ?? {}),
  };
}

export async function listReleases(limit: number, cursor: string | null) {
  // Ordered by build descending, never by release date.
  const params: any[] = [];
  let where = 'TRUE';
  if (cursor) {
    params.push(Number(cursor));
    where = `build < $${params.length}`;
  }
  params.push(limit + 1);
  const res = await q(
    `SELECT * FROM app_release WHERE ${where} ORDER BY build DESC LIMIT $${params.length}`,
    params
  );
  const hasMore = res.rows.length > limit;
  const rows = hasMore ? res.rows.slice(0, limit) : res.rows;
  return { rows, hasMore, nextCursor: hasMore && rows.length > 0 ? String(rows[rows.length - 1].build) : null };
}

export async function releaseByVersion(version: string) {
  const res = await q(`SELECT * FROM app_release WHERE version = $1`, [version]);
  return res.rows[0] ?? null;
}

export async function latestRelease() {
  const res = await q(`SELECT * FROM app_release ORDER BY build DESC LIMIT 1`);
  return res.rows[0] ?? null;
}

export function groupOrder(): string[] {
  return ['Newly Added', 'Improvements', 'Bug Fixes', 'Known Issues'];
}

export function orderedNotes(notes: Record<string, string[]>): { title: string; items: string[] }[] {
  return groupOrder()
    .filter((g) => Array.isArray(notes?.[g]) && notes[g].length > 0)
    .map((g) => ({ title: g, items: notes[g] }));
}
