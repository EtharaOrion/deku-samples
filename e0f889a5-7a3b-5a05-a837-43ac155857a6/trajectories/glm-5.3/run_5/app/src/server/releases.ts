import { q, one } from './db.js';
import { compare } from './semver.js';

export type ReleaseView = {
  version: string; build: number; released_on: string; channel: string;
  artifact_name: string; size_bytes: number; sha256: string;
  description: string | null; notes: ReleaseNotes;
};

export type ReleaseNotes = Array<{ group: string; items: string[] }>;
export const NOTE_GROUPS = ['Newly Added', 'Improvements', 'Bug Fixes', 'Known Issues'] as const;

/** The archive orders by build number descending and never by release date. */
export async function listReleases(): Promise<ReleaseView[]> {
  const rows = await q<any>(`SELECT * FROM app_release ORDER BY build DESC`);
  return rows.map(toReleaseView);
}

export async function getRelease(version: string): Promise<ReleaseView | null> {
  const row = await one<any>(`SELECT * FROM app_release WHERE version = $1`, [version]);
  return row ? toReleaseView(row) : null;
}

function toReleaseView(r: any): ReleaseView {
  const notes: ReleaseNotes = [];
  for (const group of NOTE_GROUPS) {
    const items = Array.isArray(r.notes) ? (r.notes.find((n: any) => n.group === group)?.items ?? []) : [];
    if (items.length > 0) notes.push({ group, items });
  }
  return {
    version: r.version,
    build: Number(r.build),
    released_on: String(r.released_on).slice(0, 10),
    channel: r.channel,
    artifact_name: r.artifact_name,
    size_bytes: Number(r.size_bytes),
    sha256: r.sha256,
    description: r.description ?? null,
    notes,
  };
}

/* --------------------------------- firmware --------------------------------- */

export type FirmwareEntry = {
  id: number; product_id: number; product_handle: string; version: string; build: number;
  min_firmware: string | null; min_app_version: string; channel: string;
  size_bytes: number; sha256: string; released_on: string;
};

export async function firmwareForProduct(productHandleOrModel: string, opts: { channel?: string | null } = {}): Promise<{ product: string; entries: FirmwareEntry[] }> {
  const rows = await q<any>(
    `SELECT f.*, p.title AS product_title, p.handle AS product_handle
       FROM firmware f JOIN product p ON p.id = f.product_id
      WHERE p.handle = $1 OR p.title = $1
      ORDER BY f.build DESC`, [productHandleOrModel]);
  const channel = opts.channel ?? null;
  const entries = rows.filter((r) => (channel ? r.channel === channel : r.channel !== 'internal' && r.channel !== 'yanked'));
  return { product: rows[0]?.product_title ?? productHandleOrModel, entries };
}

export async function latestFirmware(productHandle: string): Promise<FirmwareEntry | null> {
  const { entries } = await firmwareForProduct(productHandle, { channel: 'general' });
  return entries[0] ?? null;
}

export function meetsMinimum(reported: string | null | undefined, minimum: string | null | undefined): boolean {
  if (!minimum) return true;
  if (!reported) return false;
  return compare(reported, minimum) >= 0;
}
