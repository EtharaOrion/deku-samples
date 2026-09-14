import"./hoisted.gcOrbbzp.js";import{a as c,s as v}from"./client.B_lvX2o6.js";import{m as o}from"./format.BaGEAqP4.js";const f=[{n:1,href:"/checkout/where-it-goes",label:"Where it goes"},{n:2,href:"/checkout/how-it-gets-there",label:"How it gets there"},{n:3,href:"/checkout/payment",label:"Payment"}];class g extends HTMLElement{connectedCallback(){const e=Number(this.getAttribute("step"));this.innerHTML=`<ol class="checkout-steps">
      ${f.map(s=>`<li class="${s.n===e?"is-current":""}">
        ${s.n===e?`${s.n}. ${s.label}`:`<a href="${s.href}">${s.n}. ${s.label}</a>`}
      </li>`).join("")}
    </ol>`}}customElements.define("checkout-steps",g);const d=(l,e)=>{try{localStorage.setItem(l,e)}catch{}},m=l=>{try{return localStorage.getItem(l)||""}catch{return""}},p=[["email","Email","email",!0,"wide"],["name","Name","text",!0],["line1","Address line 1","text",!0,"wide"],["line2","Address line 2 (optional)","text",!1,"wide"],["city","City","text",!0],["region","Region","text",!1],["postal_code","Postal code","text",!0],["country","Country","text",!0],["phone","Phone (optional)","tel",!1,"wide"]];class b extends HTMLElement{connectedCallback(){this.innerHTML=`
      <div class="checkout-grid">
        <form class="card" novalidate>
          <h1 class="page-title">Where it goes</h1>
          <p class="page-sub">We ship to the United States.</p>
          <div class="form-grid">
            ${p.map(([e,s,a,t,i])=>`
              <div class="field ${i||""}">
                <label for="f-${e}">${s}</label>
                <input id="f-${e}" name="${e}" type="${a}" ${e==="country"?'value="US"':""} autocomplete="on" />
                <p class="field-error" data-error-for="${e}"></p>
              </div>`).join("")}
            <label class="consent">
              <input type="checkbox" id="f-consent" />
              <span>Email me about firmware for the cameras I own. Nothing else.</span>
            </label>
          </div>
          <p class="form-error" role="alert"></p>
          <button class="btn btn-primary" type="submit">Continue to delivery</button>
        </form>
        <aside class="card" data-summary aria-label="Summary"><div class="skeleton" style="height:10rem"></div></aside>
      </div>`,this.querySelector("#f-email").value=m("vela_co_email"),this.querySelector("#f-consent").checked=m("vela_co_consent")==="1",this.querySelector("form").addEventListener("submit",e=>this.submit(e)),this.summary()}async summary(){const e=await c.get("/cart");this.renderSummary(e)}renderSummary(e){const s=this.querySelector("[data-summary]");s&&(s.innerHTML=`
      <h2 class="summary-title">Order so far</h2>
      <ul class="sum-lines">
        ${e.lines.map(a=>`<li><span>${a.title} × ${a.quantity}</span><span class="tnum">${o(a.line_total_minor)}</span></li>`).join("")||"<li>No items yet.</li>"}
      </ul>
      <div class="sumrow"><span>Subtotal</span><span class="tnum">${o(e.subtotal_minor)}</span></div>
      <p class="estimate-note">Estimated. We will show the exact amount once we know where it is going.</p>`)}async submit(e){e.preventDefault();const s=e.currentTarget,a=this.querySelector(".form-error");a.textContent="";const t={};for(const[r]of p)t[r]=s.querySelector(`[name="${r}"]`).value.trim();const i=this.querySelector("#f-consent").checked;d("vela_co_email",t.email),d("vela_co_consent",i?"1":"0");let n=!1;for(const[r,h,,u]of p){const y=this.querySelector(`[data-error-for="${r}"]`);y.textContent="",u&&!t[r]&&(y.textContent=`${h.replace(" (optional)","")} is required.`,n=!0)}if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t.email)&&!this.querySelector('[data-error-for="email"]').textContent&&(this.querySelector('[data-error-for="email"]').textContent="Email is required.",n=!0),!n)try{const r=await c.post("/cart/delivery",{email:t.email,marketing_consent:i,shipping_address:{name:t.name,line1:t.line1,line2:t.line2,city:t.city,region:t.region,postal_code:t.postal_code,country:t.country,phone:t.phone}});Object.entries(t).forEach(([h,u])=>d(`vela_co_${h}`,u)),window.location.href="/checkout/how-it-gets-there"}catch(r){a.textContent=r.message||"That did not work."}}}customElements.define("checkout-address",b);class $ extends HTMLElement{connectedCallback(){this.innerHTML=`
      <div class="checkout-grid">
        <form class="card" novalidate>
          <h1 class="page-title">How it gets there</h1>
          <p class="page-sub">Choose one. Neither is chosen for you.</p>
          <div class="method-list" role="radiogroup" aria-label="Delivery method">
            <div class="skeleton" style="height:4rem"></div>
          </div>
          <p class="form-error" role="alert"></p>
          <button class="btn btn-primary" type="submit" data-continue disabled>Loading delivery options</button>
        </form>
        <aside class="card" data-summary aria-label="Summary"><div class="skeleton" style="height:10rem"></div></aside>
      </div>`,this.querySelector("form").addEventListener("submit",e=>this.submit(e)),this.load()}async load(){try{const e=await c.get("/cart");this.cart=e;const s=this.querySelector(".method-list"),a=m("vela_co_method"),t=e.shipping_method||"";s.innerHTML=(e.delivery_options||[]).map(n=>`
        <label class="method ${t===n.method||!t&&n.method===a?"is-selected":""}">
          <input type="radio" name="method" value="${n.method}" ${t===n.method||!t&&n.method===a?"checked":""} />
          <span>${n.method}</span>
          <span class="tnum">${n.price_minor===0?"Free":o(n.price_minor)}</span>
          <span class="method-note">${n.min_days===n.max_days?`${n.max_days} days`:`${n.min_days} to ${n.max_days} days`}</span>
        </label>`).join("")||'<p class="estimate-note">We need an address before we can quote delivery. <a href="/checkout/where-it-goes">Add one</a>.</p>',s.querySelectorAll("input").forEach(n=>n.addEventListener("change",()=>{s.querySelectorAll(".method").forEach(r=>r.classList.remove("is-selected")),n.closest(".method").classList.add("is-selected")}));const i=this.querySelector("[data-continue]");(e.delivery_options||[]).length&&(i.disabled=!1),i.textContent="Continue to payment",this.renderSummary(e)}catch(e){this.querySelector(".form-error").textContent=e.message}}renderSummary(e){const s=this.querySelector("[data-summary]");s.innerHTML=`
      <h2 class="summary-title">Order so far</h2>
      <ul class="sum-lines">
        ${e.lines.map(a=>`<li><span>${a.title} × ${a.quantity}</span><span class="tnum">${o(a.line_total_minor)}</span></li>`).join("")}
      </ul>
      <div class="sumrow"><span>Subtotal</span><span class="tnum">${o(e.subtotal_minor)}</span></div>
      <div class="sumrow"><span>Estimated delivery</span><span class="tnum">—</span></div>
      <div class="sumrow"><span>Estimated tax</span><span class="tnum">—</span></div>
      <p class="estimate-note">Estimated. We will show the exact amount once we know where it is going.</p>`}async submit(e){e.preventDefault();const s=this.querySelector(".form-error");s.textContent="";const a=this.querySelector('input[name="method"]:checked');if(!a){s.textContent="Choose how the order gets there.";return}try{const t=await c.post("/cart/delivery",{shipping_method:a.value});d("vela_co_method",a.value),window.location.href="/checkout/payment"}catch(t){s.textContent=t.message}}}customElements.define("checkout-delivery",$);class w extends HTMLElement{connectedCallback(){this.innerHTML=`
      <div class="checkout-grid">
        <section class="card">
          <h1 class="page-title">Payment</h1>
          <p class="page-sub">We invoice the order when it is placed. There is no card form.</p>
          <div data-body><div class="skeleton" style="height:8rem"></div></div>
        </section>
        <aside class="card" data-summary aria-label="Summary"><div class="skeleton" style="height:10rem"></div></aside>
      </div>`,this.load()}async load(){try{const e=await c.get("/cart");if(!e.lines.length){this.querySelector("[data-body]").innerHTML="<p>Your cart is empty.</p>",this.querySelector("[data-summary]").innerHTML='<p><a class="btn" href="/shop">Back to the shop</a></p>';return}const s=e.address_known&&e.shipping_method;this.querySelector("[data-summary]").innerHTML=`
        <h2 class="summary-title">Order total</h2>
        <ul class="sum-lines">
          ${e.lines.map(t=>`<li><span>${t.title} × ${t.quantity}</span><span class="tnum">${o(t.line_total_minor)}</span></li>`).join("")}
        </ul>
        <div class="sumrow"><span>Subtotal</span><span class="tnum">${o(e.subtotal_minor)}</span></div>
        ${e.protection_minor?`<div class="sumrow"><span>Shipment protection</span><span class="tnum">${o(e.protection_minor)}</span></div>`:""}
        <div class="sumrow"><span>Delivery (${e.shipping_method||"not chosen"})</span><span class="tnum">${e.shipping_minor!==null?o(e.shipping_minor):"—"}</span></div>
        <div class="sumrow"><span>Tax</span><span class="tnum">${e.tax_minor!==null?o(e.tax_minor):"—"}</span></div>
        <div class="sumrow sumrow-total"><span>Total</span><span class="tnum">${e.total_minor!==null?o(e.total_minor):"—"}</span></div>
        <p class="estimate-note">To ${e.email||"an address we do not have yet"}.</p>`,this.querySelector("[data-body]").innerHTML=`
        ${s?"":'<div class="notice" data-tone="wrong">We still need <a href="/checkout/where-it-goes">where it goes</a> and <a href="/checkout/how-it-gets-there">how it gets there</a>.</div>'}
        <p class="placing-note" role="status"></p>
        <button class="btn btn-primary" data-place ${s?"":"disabled"}>Place the order</button>`;const a=this.querySelector("[data-place]");a.addEventListener("click",()=>this.place(a))}catch(e){this.querySelector("[data-body]").innerHTML=`<p class="notice" data-tone="wrong">${e.message}</p>`}}async place(e){const s=this.querySelector(".placing-note");e.disabled=!0,e.textContent="Placing your order",s.textContent="Placing your order";let a=m("vela_place_key");a||(a=`pk-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,d("vela_place_key",a));try{const t=await c.post("/orders",{},{"Idempotency-Key":a});localStorage.removeItem("vela_place_key"),v(0),window.location.href=`/orders/${t.number}?access_token=${encodeURIComponent(t.access_token)}`}catch(t){e.disabled=!1,e.textContent="Place the order",s.textContent=t.message||"That did not work.",t.code==="prices_changed"&&setTimeout(()=>{window.location.href="/cart"},1200)}}}customElements.define("checkout-place",w);
