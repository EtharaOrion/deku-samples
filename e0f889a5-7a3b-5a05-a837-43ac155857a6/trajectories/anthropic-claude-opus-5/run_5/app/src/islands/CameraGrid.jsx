import { useState } from 'preact/hooks';
import RegisterRow from './RegisterRow.jsx';

/**
 * The camera grid, one card per camera. Registration happens in place at the
 * top of it; a new card appears without a reload.
 */
export default function CameraGrid({ initial }) {
  const [devices, setDevices] = useState(initial ?? []);

  const add = (device) =>
    setDevices((list) =>
      list.some((d) => d.serial === device.serial) ? list : [device, ...list],
    );

  return (
    <div class="stack">
      <RegisterRow onRegistered={add} />

      {devices.length === 0 ? (
        <div class="empty-state">
          <p>No cameras registered yet.</p>
          <p style="margin-top:0.5rem">
            Register the serial from the underside of your camera above.
          </p>
        </div>
      ) : (
        <div class="grid grid--cards">
          {devices.map((device) => (
            <article class="card" key={device.serial}>
              <h3 style="font-size:16px;line-height:24px;font-weight:700">
                {device.nickname || device.model}
              </h3>
              {device.nickname && (
                <p style="color:var(--quiet);font-size:14px;line-height:21px">{device.model}</p>
              )}
              <p class="mono" style="margin-top:0.25rem">{device.serial}</p>

              <p class="row" style="margin-top:0.75rem;gap:0.5rem">
                <span
                  class={`chip ${
                    device.firmware_state === 'Update available'
                      ? 'chip--progress'
                      : device.firmware_state === 'Not yet connected'
                        ? ''
                        : 'chip--done'
                  }`}
                >
                  {device.firmware_state}
                </span>
                {/* An expired warranty is a neutral state and never a warning. */}
                <span class="chip">{device.warranty_state}</span>
              </p>

              <p style="margin-top:0.75rem">
                <a href={`/account/cameras/${device.serial}`}>Open this camera</a>
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
