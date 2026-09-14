import { q, one } from './db.js';
import { deviceBySerial, DeviceError } from './devices.js';
import { meetsMinimum } from './releases.js';

export class FlashError extends Error {
  constructor(public code: string, message: string, public status = 400, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export async function startFlashSession(input: { serial: string; targetBuild: number; currentVersion?: string | null }) {
  const device = await deviceBySerial(input.serial);
  if (!device) throw new FlashError('unknown_serial', 'We do not recognise that serial number.', 404);

  const firmware = await one<any>(
    `SELECT f.*, p.title AS product_title, p.handle AS product_handle
       FROM firmware f JOIN product p ON p.id = f.product_id
      WHERE f.build = $1`, [input.targetBuild]);
  if (!firmware) throw new FlashError('unknown_firmware', 'That firmware image does not exist.', 404);

  // Refused before it starts when the target image belongs to another product.
  if (Number(firmware.product_id) !== Number(device.product_id)) {
    throw new FlashError('wrong_product',
      `${firmware.product_title} firmware does not belong to ${device.product_title}.`, 409);
  }
  if (firmware.channel === 'yanked') {
    throw new FlashError('yanked', 'That firmware image was withdrawn.', 409);
  }

  const reported = input.currentVersion ?? device.firmware_version;
  // Refused before it starts when min_firmware is above the version the device reports.
  if (!meetsMinimum(reported, firmware.min_firmware)) {
    throw new FlashError('below_minimum',
      `${device.product_title} needs at least ${firmware.min_firmware} before it can run ${firmware.version}. It is on ${reported ?? 'an unknown version'}.`,
      409);
  }

  const existing = await one<{ id: number }>(
    `SELECT id FROM flash_session WHERE device_id = $1 AND state = 'started'`, [device.id]);
  if (existing) {
    throw new FlashError('session_in_progress', 'A write is already in progress on this camera.', 409);
  }

  const inserted = await one<any>(
    `INSERT INTO flash_session (device_id, firmware_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING *`, [device.id, firmware.id]);
  if (!inserted) {
    throw new FlashError('session_in_progress', 'A write is already in progress on this camera.', 409);
  }
  return { session: inserted, device, firmware };
}

export function sessionView(s: any, device?: any, firmware?: any): any {
  return {
    id: Number(s.id),
    device_id: Number(s.device_id),
    serial: device?.serial ?? null,
    state: s.state,
    target_build: firmware?.build ?? s.firmware_build ?? null,
    target_version: firmware?.version ?? s.firmware_version ?? null,
    reported_version: s.reported_version ?? null,
    failure_reason: s.failure_reason ?? null,
    started_at: s.started_at,
    ended_at: s.ended_at,
  };
}

export async function getSession(id: number) {
  const row = await one<any>(
    `SELECT s.*, d.serial AS serial, f.build AS firmware_build, f.version AS firmware_version, f.product_id
       FROM flash_session s
       JOIN device d ON d.id = s.device_id
       JOIN firmware f ON f.id = s.firmware_id
      WHERE s.id = $1`, [id]);
  return row;
}

/** Completing a session records the version read back from the device. */
export async function completeFlashSession(id: number, reportedVersion: string) {
  const session = await getSession(id);
  if (!session) throw new FlashError('unknown_session', 'That session does not exist.', 404);
  if (session.state !== 'started') throw new FlashError('not_started', 'That session is not running.', 409);

  const updated = await one<any>(
    `UPDATE flash_session SET state='succeeded', reported_version=$1, ended_at=now()
      WHERE id=$2 AND state='started' RETURNING *`, [reportedVersion, id]);
  if (!updated) throw new FlashError('not_started', 'That session is not running.', 409);

  await q(
    `UPDATE device SET firmware_version=$1, firmware_reported_at=now(), status =
        CASE WHEN status IN ('manufactured','sold') THEN 'registered' ELSE status END
      WHERE id=$2`, [reportedVersion, session.device_id]);

  return { session: updated, serial: session.serial };
}

/** A failed session leaves the device version exactly as it was. */
export async function failFlashSession(id: number, reason: string) {
  const session = await getSession(id);
  if (!session) throw new FlashError('unknown_session', 'That session does not exist.', 404);
  if (session.state !== 'started') throw new FlashError('not_started', 'That session is not running.', 409);
  const updated = await one<any>(
    `UPDATE flash_session SET state='failed', failure_reason=$1, ended_at=now()
      WHERE id=$2 AND state='started' RETURNING *`, [reason, id]);
  if (!updated) throw new FlashError('not_started', 'That session is not running.', 409);
  return updated;
}
