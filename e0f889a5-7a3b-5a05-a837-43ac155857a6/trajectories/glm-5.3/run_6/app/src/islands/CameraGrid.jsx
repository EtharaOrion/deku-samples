import { createSignal, For, Show } from 'solid-js';

// The cameras grid. It renders on the server from the cameras already on the
// account and listens for a registration so the new card appears at once.
export default function CameraGrid(props) {
  const [devices, setDevices] = createSignal(props.devices || []);
  const [error, setError] = createSignal('');

  if (typeof window !== 'undefined') {
    window.addEventListener('vela:device-registered', (event) => {
      const device = event.detail;
      if (!device) return;
      setDevices((current) =>
        current.some((d) => d.serial === device.serial) ? current : [device, ...current]
      );
    });
  }

  return (
    <div>
      <Show when={error()}>
        <div class="notice wrong" role="alert">{error()}</div>
      </Show>
      <Show
        when={devices().length}
        fallback={
          <div class="empty">
            <p>No cameras registered yet.</p>
            <p class="hint">Type a serial above to register a camera you own.</p>
          </div>
        }
      >
        <ul class="grid two camera-grid">
          <For each={devices()}>
            {(device) => (
              <li class="card camera-card">
                <h3><a href={`/account/cameras/${device.serial}`}>{device.nickname || device.model}</a></h3>
                <p class="model">{device.model}</p>
                <p class="mono serial">{device.serial}</p>
                <p class="chips">
                  <span class={`chip ${device.update_available ? 'is-progress' : 'is-finished'}`}>
                    {device.never_connected
                      ? 'Not yet connected'
                      : device.update_available
                        ? `Update available (${device.latest_firmware})`
                        : `Up to date (${device.firmware_version})`}
                  </span>
                  <span class="chip is-neutral">
                    {device.warranty_until
                      ? new Date(device.warranty_until) > new Date()
                        ? `Warranty to ${shortDate(device.warranty_until)}`
                        : `Warranty ended ${shortDate(device.warranty_until)}`
                      : 'No warranty date'}
                  </span>
                </p>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

function shortDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
