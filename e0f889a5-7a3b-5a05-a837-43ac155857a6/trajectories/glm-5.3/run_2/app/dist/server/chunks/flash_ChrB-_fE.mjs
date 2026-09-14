import { q, pool } from "./pool_DifDkjYx.mjs";
import { f as deviceBySerial, i as compareFirmware } from "./devices_BeE0c41C.mjs";
class FlashError extends Error {
  code;
  status;
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
async function firmwareByBuild(build) {
  const res = await q(
    `SELECT f.*, p.handle AS product_handle, p.title AS product_title
       FROM firmware f JOIN product p ON p.id = f.product_id
      WHERE f.build = $1`,
    [build]
  );
  return res.rows[0] ?? null;
}
async function firmwareForProduct(productId, channel) {
  const res = await q(
    `SELECT f.*, p.handle AS product_handle, p.title AS product_title
       FROM firmware f JOIN product p ON p.id = f.product_id
      WHERE f.product_id = $1
      ORDER BY f.build DESC`,
    [productId]
  );
  return res.rows;
}
async function startFlashSession(input) {
  const serial = (input.serial || "").trim().toUpperCase();
  const device = await deviceBySerial(serial);
  if (!device) throw new FlashError("unknown_serial", "We do not recognise that serial number.", 404);
  if (device.status === "blocked") throw new FlashError("blocked", "That camera is blocked. Write to us and we will help.", 409);
  const firmware = await firmwareByBuild(input.targetBuild);
  if (!firmware) throw new FlashError("unknown_firmware", "We do not have that firmware.", 404);
  if (firmware.product_id !== device.product_id) {
    throw new FlashError("wrong_product", `${firmware.product_title} firmware does not belong to a ${device.model}.`, 409);
  }
  if (device.firmware_version && firmware.min_firmware && compareFirmware(device.firmware_version, firmware.min_firmware) < 0) {
    throw new FlashError(
      "below_minimum",
      `${device.model} is running ${device.firmware_version}. Firmware ${firmware.version} needs ${firmware.min_firmware} or later.`,
      409
    );
  }
  if (firmware.channel === "yanked") throw new FlashError("yanked", `Firmware ${firmware.version} was withdrawn.`, 409);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insert = await client.query(
      `INSERT INTO flash_session (device_id, firmware_id, state) VALUES ($1, $2, 'started')
       ON CONFLICT DO NOTHING RETURNING id, started_at`,
      [device.id, firmware.id]
    );
    if (insert.rowCount === 0) {
      const live = await client.query(`SELECT id FROM flash_session WHERE device_id = $1 AND state = 'started'`, [device.id]);
      await client.query("ROLLBACK");
      if (live.rows.length > 0) {
        throw new FlashError("session_in_progress", "A write is already running on that camera.", 409);
      }
      throw new FlashError("conflict", "That did not work. Try again.", 409);
    }
    await client.query("COMMIT");
    const id = insert.rows[0].id;
    return { id: String(id), device_serial: device.serial, firmware_version: firmware.version, firmware_build: Number(firmware.build), state: "started", started_at: insert.rows[0].started_at };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw err;
  } finally {
    client.release();
  }
}
async function completeFlashSession(id, reportedVersion) {
  const res = await q(`UPDATE flash_session
      SET state = 'succeeded', reported_version = $2, ended_at = now()
      WHERE id = $1 AND state = 'started'
      RETURNING *`, [id, reportedVersion]);
  if (res.rowCount === 0) throw new FlashError("not_started", "That session is not running.", 409);
  const session = res.rows[0];
  await q(`UPDATE device SET firmware_version = $2, firmware_reported_at = now() WHERE id = $1`, [session.device_id, reportedVersion]);
  return sessionView(await q(`SELECT * FROM flash_session WHERE id = $1`, [id]));
}
async function failFlashSession(id, reason) {
  const res = await q(`UPDATE flash_session
      SET state = 'failed', failure_reason = $2, ended_at = now()
      WHERE id = $1 AND state = 'started'
      RETURNING *`, [id, reason]);
  if (res.rowCount === 0) throw new FlashError("not_started", "That session is not running.", 409);
  return sessionView(await q(`SELECT * FROM flash_session WHERE id = $1`, [id]));
}
function sessionView(res) {
  const row = res.rows[0];
  return {
    id: String(row.id),
    device_id: String(row.device_id),
    firmware_id: String(row.firmware_id),
    state: row.state,
    reported_version: row.reported_version ?? null,
    failure_reason: row.failure_reason ?? null,
    started_at: new Date(row.started_at).toISOString(),
    ended_at: row.ended_at ? new Date(row.ended_at).toISOString() : null
  };
}
export {
  FlashError as F,
  failFlashSession as a,
  completeFlashSession as c,
  firmwareForProduct as f,
  startFlashSession as s
};
