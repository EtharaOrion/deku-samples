import{a as d}from"./client.B_lvX2o6.js";import{c as f,g,S as v}from"./format.BaGEAqP4.js";import"./hoisted.gcOrbbzp.js";class w extends HTMLElement{connectedCallback(){this.state={accepted:!1,device:null,serialInput:"",manifest:[],chosen:null,session:null,progress:null,done:null,failed:null},this.render()}set(e){this.state={...this.state,...e},this.render()}err(e){this.state={...this.state,...e},this.render()}render(){const e=this.state,i=`
      <section class="step" aria-labelledby="d-cap">
        <p class="step-num" id="d-cap">Step 1</p>
        <h2 id="d-cap-t">Can this browser talk to a camera?</h2>
        <p>${"usb"in navigator?"This browser can talk to a device over WebUSB. Chromium on a desktop can.":"This browser cannot talk to a device. It needs WebUSB, which means a Chromium browser on a desktop. Install the firmware from Arranger instead: open Arranger, connect the camera, and choose Firmware."}</p>
      </section>`,n=`
      <section class="warning" tabindex="0" role="group" aria-labelledby="d-warn">
        <h2 id="d-warn">Before you start</h2>
        <p>This replaces the software inside your camera. It takes about ninety seconds. Do not unplug the camera and do not let your computer go to sleep. If you are on a laptop, plug it in.</p>
        <button class="btn" data-accept ${e.accepted?"disabled":""} type="button">${e.accepted?"Accepted":"I understand"}</button>
        ${e.accepted?"":'<p class="quiet">The connect control stays unavailable until the warning is accepted.</p>'}
      </section>`,c=`
      <section class="step" aria-labelledby="d-id">
        <p class="step-num">Step 2</p>
        <h2 id="d-id">Identify the camera</h2>
        <p>Type the serial engraved under the camera.</p>
        <div class="serial-field">
          <input data-serial inputmode="text" autocomplete="off" spellcheck="false"
                 placeholder="VC26 09PV DA7Q" value="${e.serialInput}"
                 aria-label="Serial number" ${e.accepted?"":"disabled"} />
          <button class="btn" data-identify type="button" ${e.accepted?"":"disabled"}>Identify</button>
        </div>
        <p class="quiet" data-serial-note aria-live="polite">${e.accepted?"":"Accept the warning first."}</p>
        ${e.device?`<p class="device-line">${e.device.model}, serial <span class="mono">${e.device.serial}</span>, currently running <span class="mono">${e.device.firmware_version||"nothing we have heard"}</span></p>`:""}
        ${e.refusal?`<p class="refusal" role="alert">${e.refusal}</p>`:""}
      </section>`;let o="";if(e.device&&e.manifest.length){const t=e.manifest.find(s=>s.channel==="general"&&(!s.min_firmware||!e.device.firmware_version||f(e.device.firmware_version,s.min_firmware)>=0));e.manifest.filter(s=>s!==t),o=`
      <section class="step" aria-labelledby="d-img">
        <p class="step-num">Step 3</p>
        <h2 id="d-img">Choose the software</h2>
        ${t?`
          <p>Recommended: firmware <span class="mono">${t.version}</span>, build <span class="mono tnum">${t.build}</span>, minimum firmware ${t.min_firmware||"none"}.</p>
          <button class="btn btn-primary" data-write="${t.build}" data-version="${t.version}" type="button">Write firmware ${t.version}</button>
        `:'<p class="refusal">No general image suits this camera. Write it from Arranger.</p>'}
        <details>
          <summary>All images for this model</summary>
          <ul class="image-list">
            ${e.manifest.map(s=>{const r=s.min_firmware&&e.device.firmware_version&&f(e.device.firmware_version,s.min_firmware)<0;return`<li>
                <span>firmware <span class="mono">${s.version}</span>, build <span class="mono tnum">${s.build}</span>, channel ${s.channel}, minimum ${s.min_firmware||"none"}</span>
                ${r?`<span class="refusal">Needs ${s.min_firmware} or later</span>`:`<button data-write="${s.build}" data-version="${s.version}" type="button">Write</button>`}
              </li>`}).join("")}
          </ul>
        </details>
        ${e.writeRefusal?`<p class="refusal" role="alert">${e.writeRefusal}</p>`:""}
      </section>`}let u="";e.session&&e.session.state==="started"&&(u=`
      <section class="step" aria-labelledby="d-write">
        <p class="step-num">Step 4</p>
        <h2 id="d-write">Writing</h2>
        <p class="progress" data-progress aria-live="off">Writing, ${e.progress===null?"0":e.progress}%. Do not unplug your camera.</p>
        <p class="quiet">There is no safe cancel. The figure above comes from the camera.</p>
      </section>`);let p="";e.done&&(p=`
      <section class="step">
        <p class="step-num">Done</p>
        <p class="done">Done. Your camera is running <span class="mono">${e.done}</span>.</p>
        <p class="quiet">We recorded the version the camera read back, not the one that was asked for.</p>
      </section>`),e.failed&&(p=`
      <section class="step">
        <p class="step-num">Outcome</p>
        <p>${e.failed.stillThere?"Your camera is still working and you can try again.":"The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine."}</p>
      </section>`),this.innerHTML=`
      <div class="doctor">
        <h1>Firmware installer</h1>
        <p class="quiet" role="status" aria-live="polite" data-live>${e.done?"Done.":e.session&&e.session.state==="started"?`Writing, ${e.progress===null?0:e.progress}%.`:e.device?"Camera identified.":"Start at step 1."}</p>
        ${i}
        ${n}
        ${c}
        ${o}
        ${u}
        ${p}
      </div>`;const m=this.querySelector("[data-accept]");m&&!e.accepted&&m.addEventListener("click",()=>this.set({accepted:!0}));const l=this.querySelector("[data-serial]");l&&(l.addEventListener("input",()=>{const t=l.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12),s=g(t);l.value=s;const r=this.querySelector("[data-serial-note]");t.length===12&&!v.test(t)?(r.textContent="That serial number did not work. It is twelve characters, engraved under the camera.",r.className="refusal"):(r.textContent=t.length===12?"":`${t.length} of 12 characters.`,r.className="quiet"),this.state.serialInput=s}),l.addEventListener("keydown",t=>{t.key==="Enter"&&this.identify()}));const h=this.querySelector("[data-identify]");h&&h.addEventListener("click",()=>this.identify()),this.querySelectorAll("[data-write]").forEach(t=>t.addEventListener("click",()=>this.write(Number(t.dataset.write),t.dataset.version)))}async identify(){const e=(this.state.serialInput||"").replace(/[^A-Z0-9]/g,"");if(!v.test(e)){this.set({refusal:"That serial number did not work. It is twelve characters, engraved under the camera.",device:null,manifest:[]});return}try{const a=await d.get(`/doctor/device?serial=${encodeURIComponent(e)}`),i=await d.get(`/firmware/manifest?model=${encodeURIComponent(a.model_handle)}`);this.set({device:a,manifest:i.entries,refusal:null,done:null,failed:null})}catch(a){this.set({refusal:a.message,device:null,manifest:[]})}}async write(e,a){const i=this.state;try{const n=await d.post("/flash-sessions",{serial:i.device.serial,target_build:e});this.set({session:n,progress:0,done:null,failed:null,writeRefusal:null}),this.pump()}catch(n){this.set({writeRefusal:n.message,session:null})}}async pump(){let a=0;const i=async()=>{if(!this.state.session||this.state.session.state!=="started")return;a+=1+Math.floor(Math.random()*6);const n=Math.min(100,Math.round(a/42*100)),c=this.querySelector("[data-progress]");c&&(c.textContent=`Writing, ${n}%. Do not unplug your camera.`);const o=this.querySelector("[data-live]");o&&n%25===0&&(o.textContent=`Writing, ${n}%.`),this.state.progress=n,n<100?setTimeout(i,420+Math.random()*320):await this.finish()};i()}async finish(){const e=this.state,a=e.session.firmware.version;try{const i=await d.post(`/flash-sessions/${e.session.id}/complete`,{reported_version:a});this.set({session:{...e.session,state:"succeeded"},done:i.device_firmware_version,progress:100})}catch{this.set({failed:{stillThere:!0}})}}}customElements.define("doctor-installer",w);
