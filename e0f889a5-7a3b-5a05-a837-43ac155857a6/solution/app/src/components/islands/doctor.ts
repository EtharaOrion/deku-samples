/** The browser firmware installer.
 *
 *  Four numbered steps, and nothing is written until the last one. One polite
 *  live region carries the current step and status. The write shows a figure
 *  that came from the camera rather than a bar on a timer, and offers no
 *  cancel, because there is no safe cancel. Every refusal is the store's own:
 *  the page asks before it touches anything and repeats the reason it is given.
 *
 *  No camera can be plugged into a browser in this environment, so the camera
 *  on the bench is a stand-in that answers the way a camera on the cable would.
 *  The session it writes is a real one: the store records it, and the version
 *  recorded is the one the camera reads back. */

type Entry = {
  version: string;
  build: number;
  channel: string;
  min_firmware: string | null;
  min_app_version: string;
  size_bytes: number;
  sha256: string;
};

type Manifest = { product: string; handle: string; entries: Entry[] };

type Identified = {
  serial: string;
  model: string;
  handle: string;
  firmware_version: string | null;
};

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SHAPE = new RegExp(`^(VA|VC)[0-9]{2}(0[1-9]|[1-4][0-9]|5[0-2])[${ALPHABET}]{6}$`);
const KEEP_PLUGGED = "Do not unplug your camera.";
const DISCONNECTED =
  "The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine.";
const STILL_WORKING = "Your camera is still working and you can try again.";
const ANNOUNCE_EVERY = 25;

class Disconnected extends Error {
  constructor() {
    super("device_disconnected");
    this.name = "Disconnected";
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function grouped(count: number): string {
  return String(Math.trunc(count)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Dotted versions compare by their parts, so 6.11 sits above 6.2 and below 7.0. */
function compareVersions(left: string | null, right: string | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  const a = left.split(".").map((part) => Number(part.replace(/[^0-9]/g, "")) || 0);
  const b = right.split(".").map((part) => Number(part.replace(/[^0-9]/g, "")) || 0);
  const width = Math.max(a.length, b.length);
  for (let i = 0; i < width; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** The camera on the bench. It reports the bytes it has taken as they land,
 *  and once the write settles it reads its running version back. */
class BenchCamera {
  #version: string | null;
  #plugged = true;

  constructor(
    readonly serial: string,
    version: string | null,
  ) {
    this.#version = version;
  }

  get version(): string | null {
    return this.#version;
  }

  get plugged(): boolean {
    return this.#plugged;
  }

  unplug(): void {
    this.#plugged = false;
  }

  async write(image: Entry, report: (percent: number) => void): Promise<string> {
    const total = Math.max(1, image.size_bytes);
    let taken = 0;
    while (taken < total) {
      await pause(220);
      if (!this.#plugged) throw new Disconnected();
      const chunk = Math.round(total * (0.05 + Math.random() * 0.03));
      taken = Math.min(total, taken + chunk);
      report(Math.floor((taken * 100) / total));
    }
    await pause(500);
    if (!this.#plugged) throw new Disconnected();
    this.#version = image.version;
    return image.version;
  }
}

async function readJson(response: Response): Promise<Record<string, any>> {
  try {
    const parsed = await response.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function startInstaller(): void {
  const root = document.querySelector<HTMLElement>("[data-installer]");
  if (!root) return;
  const pick = <T extends HTMLElement>(selector: string): T | null =>
    root.querySelector<T>(selector);

  const live = pick<HTMLElement>("[data-live]");
  const capability = pick<HTMLElement>("[data-capability]");
  const capabilityNote = pick<HTMLElement>("[data-capability-note]");
  const arranger = pick<HTMLElement>("[data-arranger]");
  const accept = pick<HTMLButtonElement>("[data-accept]");
  const accepted = pick<HTMLElement>("[data-accepted]");
  const connectWhy = pick<HTMLElement>("[data-connect-why]");
  const serialField = pick<HTMLInputElement>("[data-serial]");
  const connectError = pick<HTMLElement>("[data-connect-error]");
  const connect = pick<HTMLButtonElement>("[data-connect]");
  const identity = pick<HTMLElement>("[data-identity]");
  const benchSlot = pick<HTMLElement>("[data-bench-slot]");
  const benchPhoto = pick<HTMLElement>("[data-bench-photo]");
  const benchRender = pick<HTMLElement>("[data-bench-render]");
  const unplug = pick<HTMLButtonElement>("[data-unplug]");
  const imageWhy = pick<HTMLElement>("[data-image-why]");
  const images = pick<HTMLElement>("[data-images]");
  const refusal = pick<HTMLElement>("[data-refusal]");
  const write = pick<HTMLButtonElement>("[data-write]");
  const progress = pick<HTMLElement>("[data-progress]");
  const progressLine = pick<HTMLElement>("[data-progress-line]");
  const meter = pick<HTMLElement>("[data-meter]");
  const outcome = pick<HTMLElement>("[data-outcome]");
  if (!live || !accept || !serialField || !connect || !write || !images) return;

  let manifests: Manifest[] = [];
  try {
    manifests = JSON.parse(root.dataset.manifests ?? "[]") as Manifest[];
  } catch {
    manifests = [];
  }

  let warningAccepted = false;
  let camera: BenchCamera | null = null;
  let device: Identified | null = null;
  let entries: Entry[] = [];
  let chosen: Entry | null = null;
  let writing = false;
  let session: { id: string; token: string } | null = null;
  let ended = false;

  const say = (text: string) => {
    live.textContent = text;
  };
  const show = (element: HTMLElement | null, text?: string) => {
    if (!element) return;
    if (text !== undefined) element.textContent = text;
    element.removeAttribute("hidden");
  };
  const hide = (element: HTMLElement | null) => {
    element?.setAttribute("hidden", "");
  };

  /* -------------------------------------------------- 1. this browser */

  const usb = "usb" in navigator;
  if (capability) {
    capability.textContent = usb
      ? "This browser can talk to a camera over USB. Chrome, Edge and Opera on a desktop can; Safari and Firefox cannot."
      : "This browser cannot talk to a camera over USB. Chrome, Edge and Opera on a desktop can, on a secure connection. Use Arranger instead, or continue below with the camera on the bench.";
  }
  show(
    capabilityNote,
    usb
      ? "This site holds no signed image to send over the cable, so nothing is written over USB from here. The installer runs against the camera on the bench, named by its serial, and the session it writes is recorded like any other."
      : "The camera on the bench is a stand-in that answers the way a camera on the cable would. Name it by its serial. The session it writes is recorded like any other, and the version recorded is the one the camera reads back.",
  );
  if (arranger) arranger.hidden = usb;
  say(
    usb
      ? "Step 1 of 4. This browser can talk to a camera over USB. Read the warning next."
      : "Step 1 of 4. This browser cannot talk to a camera over USB. Read the warning next.",
  );

  /* -------------------------------------------------- 2. the warning */

  const strip = (value: string) => value.toUpperCase().replace(/\s+/g, "").slice(0, 12);
  const group = (value: string) => value.replace(/(.{4})(?=.)/g, "$1 ");

  const gateConnect = () => {
    if (ended || camera) {
      connect.disabled = true;
      hide(connectWhy);
      return;
    }
    connect.hidden = !warningAccepted;
    connect.disabled = !warningAccepted;
    if (warningAccepted) hide(connectWhy);
    else show(connectWhy, "Unavailable until the warning above is accepted.");
  };

  accept.addEventListener("click", () => {
    warningAccepted = true;
    accept.setAttribute("aria-pressed", "true");
    accept.disabled = true;
    show(accepted, "Understood. The connect control below is now available.");
    gateConnect();
    say("Step 2 of 4. Warning accepted. Step 3 of 4: connect the camera by its serial.");
    serialField.focus();
  });

  /* -------------------------------------------------- 3. connect */

  serialField.addEventListener("input", () => {
    const bare = strip(serialField.value);
    serialField.value = group(bare);
    if (bare.length === 12 && !SHAPE.test(bare)) {
      show(connectError, "That is not a Vela serial number.");
    } else {
      hide(connectError);
    }
    gateConnect();
  });

  const identityLine = (found: Identified, version: string | null) =>
    `${found.model}, serial ${found.serial}, currently running ${version ?? "no reported version"}`;

  const seatCamera = (handle: string | null) => {
    hide(benchPhoto);
    hide(benchRender);
    benchSlot?.toggleAttribute("data-seated", handle !== null);
    if (handle === "compact") show(benchPhoto);
    else if (handle === "flagship") show(benchRender);
  };

  connect.addEventListener("click", async () => {
    const serial = strip(serialField.value);
    if (!warningAccepted || camera) return;
    if (!SHAPE.test(serial)) {
      const why =
        serial.length === 12
          ? "That is not a Vela serial number."
          : "Type the twelve character serial engraved on the underside.";
      show(connectError, why);
      say(`Step 3 of 4. ${why}`);
      serialField.focus();
      return;
    }
    hide(connectError);
    connect.disabled = true;
    connect.textContent = "Connecting";
    say("Step 3 of 4. Identifying the camera.");
    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(serial)}`, {
        headers: { accept: "application/json" },
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(String(payload.message ?? "That did not work."));
      device = {
        serial: String(payload.serial ?? serial),
        model: String(payload.model ?? "Camera"),
        handle: String(payload.handle ?? ""),
        firmware_version:
          typeof payload.firmware_version === "string" ? payload.firmware_version : null,
      };
      camera = new BenchCamera(device.serial, device.firmware_version);
      serialField.disabled = true;
      connect.textContent = "Connected";
      show(identity, identityLine(device, camera.version));
      seatCamera(device.handle);
      show(unplug);
      offerImages();
    } catch (error) {
      const message = error instanceof Error ? error.message : "That did not work.";
      show(connectError, message);
      connect.textContent = "Connect the camera";
      say(`Step 3 of 4. ${message}`);
      gateConnect();
    }
  });

  /* -------------------------------------------------- 4. the image */

  const eligibility = (entry: Entry): string | null => {
    const current = camera?.version ?? null;
    if (current === null) {
      return entry.min_firmware
        ? `Needs ${entry.min_firmware} or later, and this camera has not reported a version.`
        : null;
    }
    if (compareVersions(entry.min_firmware, current) > 0) {
      return `Needs ${entry.min_firmware} or later. This camera reports ${current}.`;
    }
    if (compareVersions(entry.version, current) < 0) {
      return `Below the minimum firmware for this camera, which runs ${current}.`;
    }
    return null;
  };

  const describe = (entry: Entry, recommended: boolean) => {
    const label = document.createElement("label");
    label.className = "toggle";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "image";
    input.value = String(entry.build);
    input.checked = recommended;
    const text = document.createElement("span");
    text.className = "stack stack-2";
    const head = document.createElement("span");
    head.className = "tabular";
    head.textContent = `${recommended ? "Recommended: " : ""}${entry.version}, build ${entry.build}, ${grouped(entry.size_bytes)} bytes`;
    const foot = document.createElement("span");
    foot.className = "small muted";
    const why = eligibility(entry);
    foot.textContent =
      why ??
      (entry.min_firmware
        ? `Needs ${entry.min_firmware} or later.`
        : "No earlier firmware required.");
    text.append(head, foot);
    label.append(input, text);
    return label;
  };

  const preflight = async (entry: Entry) => {
    if (!device) return;
    write.disabled = true;
    hide(refusal);
    show(imageWhy, `Checking ${entry.version} against this camera.`);
    try {
      const response = await fetch("/api/flash-sessions/preflight", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ serial: device.serial, target_build: entry.build }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(String(payload.message ?? "That did not work."));
      hide(imageWhy);
      write.disabled = writing || ended;
      write.textContent = `Write ${entry.version}`;
      say(`Step 4 of 4. ${entry.version} can be written to this camera. Nothing is written until you choose Write.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "That did not work.";
      show(refusal, `Refused. ${message}`);
      show(imageWhy, "Choose another image.");
      write.disabled = true;
      write.textContent = "Write";
      say(`Step 4 of 4. Refused. ${message}`);
    }
  };

  function offerImages(): void {
    if (!device || !camera || !images) return;
    entries = manifests.find((manifest) => manifest.handle === device!.handle)?.entries ?? [];
    images.replaceChildren();
    if (entries.length === 0) {
      show(imageWhy, "No image is on record for this camera.");
      say(`Step 3 of 4. ${identityLine(device, camera.version)}. No image is on record for this camera.`);
      return;
    }
    const [recommended, ...rest] = entries;
    const legend = document.createElement("legend");
    legend.className = "optionset__legend";
    legend.textContent = "Image";
    images.append(legend);
    if (recommended) images.append(describe(recommended, true));
    if (rest.length > 0) {
      const more = document.createElement("details");
      more.className = "installer-more";
      const summary = document.createElement("summary");
      summary.textContent = `Other versions (${rest.length})`;
      more.append(summary);
      const list = document.createElement("div");
      list.className = "stack stack-3";
      for (const entry of rest) list.append(describe(entry, false));
      more.append(list);
      images.append(more);
    }
    show(images);
    chosen = recommended ?? null;
    say(`Step 3 of 4. ${identityLine(device, camera.version)}. Step 4 of 4: choose an image.`);
    if (chosen) void preflight(chosen);
  }

  images.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name !== "image" || writing) return;
    chosen = entries.find((entry) => String(entry.build) === input.value) ?? null;
    if (chosen) void preflight(chosen);
  });

  /* -------------------------------------------------- the write */

  const settle = async (reason: string) => {
    if (!session) return;
    const held = session;
    session = null;
    try {
      await fetch(`/api/flash-sessions/${encodeURIComponent(held.id)}/fail`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-flash-session-token": held.token,
        },
        body: JSON.stringify({ reason }),
        keepalive: true,
      });
    } catch {
      /* the store closes an abandoned write on its own */
    }
  };

  const finish = (line: string) => {
    ended = true;
    writing = false;
    write.disabled = true;
    hide(unplug);
    show(outcome, line);
    say(line);
    for (const input of images.querySelectorAll<HTMLInputElement>("input")) input.disabled = true;
  };

  write.addEventListener("click", async () => {
    if (!device || !camera || !chosen || writing || ended) return;
    const image = chosen;
    writing = true;
    write.disabled = true;
    hide(refusal);
    hide(outcome);
    for (const input of images.querySelectorAll<HTMLInputElement>("input")) input.disabled = true;

    let started: Response;
    try {
      started = await fetch("/api/flash-sessions", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ serial: device.serial, target_build: image.build }),
      });
    } catch {
      writing = false;
      show(refusal, "That did not work. Check the connection and try again.");
      say("Step 4 of 4. That did not work. Check the connection and try again.");
      for (const input of images.querySelectorAll<HTMLInputElement>("input")) input.disabled = false;
      write.disabled = false;
      return;
    }
    const opened = await readJson(started);
    if (!started.ok) {
      writing = false;
      const message = String(opened.message ?? "That did not work.");
      show(refusal, `Refused. ${message}`);
      say(`Step 4 of 4. Refused. ${message}`);
      for (const input of images.querySelectorAll<HTMLInputElement>("input")) input.disabled = false;
      return;
    }
    session = { id: String(opened.id), token: String(opened.session_token ?? "") };

    show(progress);
    if (meter) meter.style.width = "0%";
    show(progressLine, `Writing, 0%. ${KEEP_PLUGGED}`);
    say(`Writing ${image.version}. ${KEEP_PLUGGED}`);
    let announced = 0;

    try {
      const readBack = await camera.write(image, (percent) => {
        show(progressLine, `Writing, ${percent}%. ${KEEP_PLUGGED}`);
        if (meter) meter.style.width = `${percent}%`;
        if (percent >= announced + ANNOUNCE_EVERY && percent < 100) {
          announced = percent - (percent % ANNOUNCE_EVERY);
          say(`Writing, ${percent}%. ${KEEP_PLUGGED}`);
        }
      });
      show(progressLine, `Writing, 100%. Reading the version back from the camera.`);

      const held = session;
      const completed = await fetch(
        `/api/flash-sessions/${encodeURIComponent(held.id)}/complete`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            "x-flash-session-token": held.token,
          },
          body: JSON.stringify({ reported_version: readBack }),
        },
      );
      const done = await readJson(completed);
      if (!completed.ok) throw new Error(String(done.message ?? "That did not work."));
      session = null;
      const recorded = String(done.reported_version ?? readBack);
      if (device) show(identity, identityLine(device, recorded));
      finish(`Done. Your camera is running ${recorded}.`);
    } catch (error) {
      if (error instanceof Disconnected) {
        await settle("device_disconnected");
        finish(DISCONNECTED);
        return;
      }
      await settle(error instanceof Error ? error.message.slice(0, 200) : "write_failed");
      writing = false;
      write.disabled = false;
      for (const input of images.querySelectorAll<HTMLInputElement>("input")) input.disabled = false;
      show(outcome, STILL_WORKING);
      say(`The write did not finish. ${STILL_WORKING}`);
    }
  });

  /* -------------------------------------------------- the cable */

  unplug?.addEventListener("click", () => {
    if (!camera) return;
    camera.unplug();
    seatCamera(null);
    if (writing) return;
    camera = null;
    hide(identity);
    hide(images);
    finish(DISCONNECTED);
  });

  window.addEventListener("pagehide", () => {
    if (!session || !writing) return;
    // The page is going away mid-write. The store hears that the camera was
    // left without a read-back rather than being told nothing.
    const held = session;
    session = null;
    navigator.sendBeacon(
      `/api/flash-sessions/${encodeURIComponent(held.id)}/fail`,
      new Blob([JSON.stringify({ reason: "page_closed" })], { type: "application/json" }),
    );
  });

  gateConnect();
}

startInstaller();
