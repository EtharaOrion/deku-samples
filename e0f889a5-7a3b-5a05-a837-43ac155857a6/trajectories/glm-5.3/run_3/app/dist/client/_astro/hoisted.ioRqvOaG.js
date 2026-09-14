import"./hoisted.gcOrbbzp.js";import{c as $,a as l}from"./client.B_lvX2o6.js";import{s as p,m as d,o as u,g,S as v}from"./format.BaGEAqP4.js";class f extends HTMLElement{connectedCallback(){if(!$()){const r=window.location.pathname+window.location.search;window.location.href=`/sign-in?next=${encodeURIComponent(r)}`,this.innerHTML='<p class="quiet">Sign in to see your account.</p>';return}const t=this.getAttribute("section")||"overview",a=this.getAttribute("number"),e=this.getAttribute("serial");this.load(t,{number:a,serial:e})}async load(s,t={}){try{const a=await l.get("/auth/me");if(s==="overview")return this.overview(a);if(s==="orders")return this.orders(a);if(s==="order")return this.oneOrder(a,t.number);if(s==="cameras")return this.cameras(a,t);if(s==="camera")return this.oneCamera(a,t.serial);this.overview(a)}catch(a){if(a.status===401){localStorage.removeItem("vela_token"),localStorage.removeItem("vela_customer");const e=window.location.pathname;window.location.href=`/sign-in?next=${encodeURIComponent(e)}`,this.innerHTML="<p>Your session has ended. Sign in again.</p>"}else this.innerHTML=`<p class="notice" data-tone="wrong">Something went wrong at our end. Reference ${a.request_id||"unknown"}.</p>`}}header(s,t){return`<header class="account-head"><h1>${t}</h1><p class="quiet">${s.customer.name} · ${s.customer.email}</p></header>`}cameraCard(s){const t=s.update_available?'<span class="chip" data-tone="progress">Update available</span>':s.firmware_version?`<span class="chip" data-tone="finished">Firmware <span class="mono">${s.firmware_version}</span></span>`:'<span class="chip">Not yet connected</span>',a=new Date().toISOString().slice(0,10),e=s.warranty_until?`<span class="chip">Warranty ${String(s.warranty_until).slice(0,10)>a?"until":"ended"} ${String(s.warranty_until).slice(0,10)}</span>`:"";return`<a class="card camera-card" href="/account/cameras/${s.serial}">
      <strong>${s.model}</strong>
      <span class="nickname">${s.nickname||""}</span>
      <span class="serial mono">${s.serial}</span>
      <span class="chips">${t}${e}</span>
    </a>`}async overview(s){const[t,a,e]=await Promise.all([l.get("/account/devices").catch(()=>null),l.get("/account/orders?page_size=2").catch(()=>null),l.get("/releases?page_size=1").catch(()=>null)]),r=e&&e.data[0],i=localStorage.getItem("vela_last_app_seen"),o=r&&(!i||Number(r.build)>Number(i));this.innerHTML=`
      <div class="account">
        ${this.header(s,"Account")}
        <section class="section" aria-labelledby="s-cam">
          <h2 id="s-cam">Cameras</h2>
          ${t&&t.data.length?`<div class="camera-grid">${t.data.map(n=>this.cameraCard(n)).join("")}</div>`:'<p class="quiet">No cameras registered yet. <a href="/account/cameras">Register one</a>.</p>'}
        </section>
        <section class="section" aria-labelledby="s-ord">
          <h2 id="s-ord">Recent orders</h2>
          ${a&&a.data.length?a.data.map(n=>`<div class="order-row">
                <a href="/account/orders/${n.number}"><span class="mono">${n.number}</span></a>
                <span>${p(n.placed_at)}</span>
                <span>${n.first_line_title}${n.more_lines?` and ${n.more_lines} more`:""}</span>
                <span class="tnum">${d(n.total_minor)} ${n.currency}</span>
                <span class="chip">${u(n)}</span>
              </div>`).join(""):'<p class="quiet">No orders yet.</p>'}
        </section>
        <section class="section" aria-labelledby="s-app">
          <h2 id="s-app">Software</h2>
          ${r?`<p>The current application is Arranger <span class="mono">${r.version}</span>, build <span class="mono tnum">${r.build}</span>.
               ${o?"It is newer than the one you last saw.":"You have seen this build."} <a href="/downloads">Downloads</a>.</p>`:'<p class="quiet">No releases yet.</p>'}
        </section>
      </div>`,r&&localStorage.setItem("vela_last_app_seen",String(r.build))}async orders(s){const t=await l.get("/account/orders?page_size=20");this.innerHTML=`
      <div class="account">
        ${this.header(s,"Orders")}
        ${t.data.length?t.data.map(e=>`<div class="order-row">
              <a href="/account/orders/${e.number}"><span class="mono">${e.number}</span></a>
              <span>${p(e.placed_at)}</span>
              <span>${e.first_line_title}${e.more_lines?` and ${e.more_lines} more`:""}</span>
              <span class="tnum">${d(e.total_minor)} ${e.currency}</span>
              <span class="chip">${u(e)}</span>
            </div>`).join(""):'<p class="quiet">No orders yet. <a href="/shop">The shop is here</a>.</p>'}
        ${t.has_more?'<p class="quiet"><button class="btn btn-sm" data-more>Load more</button></p>':""}
      </div>`;const a=this.querySelector("[data-more]");a&&a.addEventListener("click",()=>this.load("orders"))}async oneOrder(s,t){try{const a=await l.get(`/account/orders/${t}`),e=a.shipping_address||{},r={};for(const i of a.serials||[])(r[i.order_line_id]=r[i.order_line_id]||[]).push(i);this.innerHTML=`
        <div class="account">
          ${this.header(s,`Order <span class="mono">${a.number}</span>`)}
          <p><span class="chip">${u(a)}</span> <span class="quiet">${p(a.placed_at)}</span></p>
          <section class="section">
            <h2>Lines</h2>
            <table class="spec">
              <tbody>${a.lines.map(i=>`<tr>
                <td>${i.title} <span class="quiet">${i.option}</span><br /><span class="quiet mono">${i.sku}</span>
                  ${(r[i.id]||[]).map(o=>`<br /><span class="mono">${o.serial}</span> <span class="quiet">${o.model}</span>`).join("")}
                </td>
                <td class="num tnum">${d(i.unit_price_minor)}</td>
                <td class="num tnum">${i.quantity}</td>
                <td class="num tnum">${d(i.total_minor)}</td>
              </tr>`).join("")}</tbody>
            </table>
          </section>
          <section class="section">
            <h2>Totals</h2>
            <div class="sumrow"><span>Subtotal</span><span class="tnum">${d(a.subtotal_minor)}</span></div>
            <div class="sumrow"><span>Delivery, ${a.shipping_method}</span><span class="tnum">${d(a.shipping_minor)}</span></div>
            <div class="sumrow"><span>Tax</span><span class="tnum">${d(a.tax_minor)}</span></div>
            <div class="sumrow sumrow-total"><span>Total</span><span class="tnum">${d(a.total_minor)} ${a.currency}</span></div>
          </section>
          <section class="section">
            <h2>Address</h2>
            <address>${e.name}<br />${e.line1}${e.line2?`, ${e.line2}`:""}<br />${e.city}${e.region?`, ${e.region}`:""} ${e.postal_code}<br />${e.country}</address>
          </section>
        </div>`}catch{this.innerHTML=`<div class="account"><h1>That page does not exist.</h1><p class="quiet">Another customer's order reads as not found.</p></div>`}}async cameras(s,{flashAfter:t=!1}={}){const a=await l.get("/account/devices");this.innerHTML=`
      <div class="account">
        ${this.header(s,"Cameras")}
        <form class="register-row" data-register>
          <input data-serial-input inputmode="text" autocomplete="off" spellcheck="false" placeholder="VC26 09PV DA7Q" aria-label="Serial number" />
          <button class="btn btn-primary" type="submit">Register</button>
        </form>
        <p class="quiet" data-register-note aria-live="polite"></p>
        <div data-register-flash>${t?'<p class="flash">Registered.</p>':""}</div>
        ${a.data.length?`<div class="camera-grid">${a.data.map(c=>this.cameraCard(c)).join("")}</div>`:'<p class="quiet">No cameras registered yet.</p>'}
      </div>`;const r=this.querySelector("[data-register-flash]").querySelector(".flash");r&&setTimeout(()=>{r.remove()},4e3);const i=this.querySelector("[data-register]"),o=this.querySelector("[data-serial-input]"),n=this.querySelector("[data-register-note]");o.addEventListener("input",()=>{const c=o.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12);o.value=g(c),c.length===12&&!v.test(c)?(n.textContent="That serial number did not work. It is twelve characters, engraved under the camera.",n.className="refusal"):(n.textContent=c.length===12?"":`${c.length} of 12 characters.`,n.className="quiet")}),i.addEventListener("submit",async c=>{c.preventDefault();const m=o.value.replace(/[^A-Z0-9]/g,"");if(!v.test(m)){n.textContent="That serial number did not work. It is twelve characters, engraved under the camera.",n.className="refusal";return}try{const h=await l.post("/account/devices",{serial:m});await this.load("cameras",{flashAfter:!0})}catch(h){n.textContent=h.message,n.className="refusal"}})}async oneCamera(s,t){try{const e=(await l.get("/account/devices?page_size=100")).data.find(o=>o.serial.toUpperCase()===t.toUpperCase());if(!e)throw new Error("not found");this.innerHTML=`
        <div class="account">
          ${this.header(s,`${e.model} <span class="mono">${e.serial}</span>`)}
          <section class="section">
            <h2>This camera</h2>
            <p>Nickname: ${e.nickname||"none yet"}</p>
            <p>Firmware: <span class="mono">${e.firmware_version||"not yet connected"}</span>${e.update_available?' <span class="chip" data-tone="progress">Update available</span> <a href="/doctor">Install it</a>':""}</p>
            <p>Warranty: ${e.warranty_until?String(e.warranty_until).slice(0,10):"not recorded"}</p>
          </section>
          <section class="section">
            <h2>Change the name</h2>
            <form class="register-row" data-rename>
              <input data-nickname value="${e.nickname||""}" maxlength="60" aria-label="Nickname" />
              <button class="btn" type="submit">Save name</button>
            </form>
            <p class="quiet" data-rename-note aria-live="polite"></p>
          </section>
          <section class="section">
            <h2>Let it go</h2>
            <p class="quiet">Removing releases the camera without giving it to anyone. It is what you do when you sell it to a stranger. Handing it to someone else is a different thing: release it here and the new owner registers it themselves.</p>
            <button class="btn" data-release type="button">Remove from my account</button>
            <p class="quiet" data-release-note aria-live="polite"></p>
          </section>
        </div>`;const r=this.querySelector("[data-rename-note]");this.querySelector("[data-rename]").addEventListener("submit",async o=>{o.preventDefault();const n=this.querySelector("[data-nickname]").value.trim();try{await l.patch(`/account/devices/${e.serial}`,{nickname:n}),r.textContent="Saved.",r.className="quiet"}catch(c){r.textContent=c.message,r.className="refusal"}});const i=this.querySelector("[data-release-note]");this.querySelector("[data-release]").addEventListener("click",async()=>{if(confirm("Remove this camera from your account? It is not given to anyone."))try{await l.del(`/account/devices/${e.serial}`),window.location.href="/account/cameras"}catch(o){i.textContent=o.message,i.className="refusal"}})}catch{this.innerHTML=`<div class="account"><h1>That page does not exist.</h1><p class="quiet">Another customer's camera reads as not found.</p></div>`}}}customElements.define("account-guard",f);
