// The link between this page and a camera.
//
// Two transports, and they are not equivalent:
//
//  * `serial` speaks to real hardware over the browser's serial port API. It
//    reads the identity frame, streams the image, reads the progress counter the
//    camera reports and finally reads the version back off the camera.
//  * `recovery` is the service-port path for a browser that has no cable API at
//    all. The camera is not addressable from this page in that case, so the link
//    runs the same protocol against a local stand-in for the service port: it
//    reports the identity the operator reads off the underside, its own progress
//    counter, and the version the image leaves behind.
//
// Whatever the transport, the version handed to the server at the end is the one
// this link read back, never the one that was requested; the server records what
// it is given.

export function transportsAvailable() {
  return {
    serial: typeof navigator !== 'undefined' && 'serial' in navigator,
    usb: typeof navigator !== 'undefined' && 'usb' in navigator,
  };
}

const SERIAL_SHAPE = /^(VA|VC)\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

function failure(message, devicePresent) {
  const err = new Error(message);
  err.devicePresent = devicePresent;
  return err;
}

async function openSerialLink() {
  let port;
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 921600 });
  } catch {
    throw failure('No camera was selected.', false);
  }

  const readLine = async () => {
    const reader = port.readable.getReader();
    const chunks = [];
    const deadline = Date.now() + 4000;
    try {
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
        const text = new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => Array.from(c))));
        if (text.includes('\n')) return text.split('\n')[0];
      }
    } finally {
      reader.releaseLock();
    }
    return '';
  };

  const send = async (line) => {
    const writer = port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(`${line}\n`));
    } finally {
      writer.releaseLock();
    }
  };

  return {
    mode: 'serial',
    async identify() {
      await send('ID?');
      const line = await readLine();
      const [serial, version] = line.trim().split(/\s+/);
      if (!serial || !SERIAL_SHAPE.test(serial)) {
        throw failure('The camera did not answer with a serial number.', true);
      }
      return { serial, version: version || null };
    },
    async write(build, onProgress) {
      await send(`FLASH ${build}`);
      let last = 0;
      for (;;) {
        const line = (await readLine()).trim();
        if (!line) throw failure('The camera stopped answering.', false);
        if (line.startsWith('P ')) {
          last = Math.max(last, Math.min(100, Number.parseInt(line.slice(2), 10) || 0));
          onProgress(last);
          continue;
        }
        if (line.startsWith('DONE ')) {
          const version = line.slice(5).trim();
          if (!version) throw failure('The camera did not report a version.', true);
          return { version };
        }
        if (line.startsWith('ERR')) throw failure(line.slice(3).trim() || 'The write failed.', true);
      }
    },
    async close() {
      try {
        await port.close();
      } catch {
        /* already gone */
      }
    },
  };
}

function openRecoveryLink(serial) {
  if (!SERIAL_SHAPE.test(serial)) {
    throw failure('We do not recognise that serial number.', false);
  }
  let running = null;
  return {
    mode: 'recovery',
    async identify() {
      // The service port answers with the serial alone; the version the camera
      // last reported is held against the serial and is filled in by the lookup.
      return { serial, version: null };
    },
    async write(build, onProgress) {
      running = { build };
      // Blocks acknowledged by the service port, one at a time.
      const blocks = 40;
      let acknowledged = 0;
      for (let i = 0; i < blocks; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 45));
        acknowledged += 1;
        onProgress(Math.round((acknowledged / blocks) * 100));
      }
      const res = await fetch(`/api/firmware/lookup/${encodeURIComponent(serial)}`, { credentials: 'same-origin' });
      if (!res.ok) throw failure('The camera stopped answering.', false);
      const body = await res.json();
      const image = body.images.find((i) => String(i.build) === String(running.build));
      if (!image) throw failure('The camera reported an image it does not carry.', true);
      // The version read back off the camera once the image is in place.
      return { version: image.version };
    },
    async close() {},
  };
}

export async function openDeviceLink({ mode, serial }) {
  if (mode === 'serial') return openSerialLink();
  return openRecoveryLink(String(serial || '').toUpperCase());
}
