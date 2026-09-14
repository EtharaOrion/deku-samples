import{a as d,s as m}from"./client.B_lvX2o6.js";import{m as r}from"./format.BaGEAqP4.js";import"./hoisted.gcOrbbzp.js";class p extends HTMLElement{connectedCallback(){this.render('<div class="skeleton" style="height:12rem"></div>'),this.load()}async load(){try{const e=await d.get("/cart");m(e.lines.reduce((i,a)=>i+a.quantity,0)),this.render(this.html(e)),this.wire(e)}catch(e){this.render(`<p class="notice" data-tone="wrong" role="alert">That did not work. ${e.message||""}</p>`)}}html(e){if(!e.lines.length)return`<div class="empty">
        <h1 class="page-title">Your cart is empty.</h1>
        <p><a class="btn" href="/shop">Back to the shop</a></p>
      </div>`;const i=(e.notices||[]).map(t=>t.kind==="price_changed"?`<div class="notice" data-tone="wrong" role="alert">The price of ${t.item} changed from ${r(t.from_minor)} to ${r(t.to_minor)} since you added it.</div>`:`<div class="notice" data-tone="wrong" role="alert">${t.item} is sold out. Remove it to continue.</div>`).join(""),a=e.protection_rung?`<label class="protect">
          <input type="checkbox" id="protection-toggle" ${e.protection_enabled?"checked":""} />
          <span>Protect this shipment against loss, theft and damage for ${r(e.protection_rung.price_minor)}</span>
        </label>`:"",n=e.address_known&&e.shipping_method;return`
      <h1 class="page-title">Cart</h1>
      ${i?`<div class="notices">${i}</div>`:""}
      <div class="cart-grid">
        <ul class="lines">
          ${e.lines.map(t=>`
            <li class="line card" data-line="${t.id}">
              <div class="line-thumb" data-sku="${t.sku}"></div>
              <div class="line-info">
                <p class="line-title">${t.title}</p>
                <p class="line-variant">${t.option_value}</p>
                <p class="line-unit tnum">${r(t.current_price_minor)} each</p>
              </div>
              <div class="line-qty">
                <button type="button" class="qty-btn" data-step="-1" aria-label="Decrease quantity of ${t.title}">−</button>
                <input class="qty-num tnum" type="number" min="1" max="10" value="${t.quantity}" aria-label="Quantity of ${t.title}" />
                <button type="button" class="qty-btn" data-step="1" aria-label="Increase quantity of ${t.title}">+</button>
              </div>
              <p class="line-total tnum" data-total>${r(t.line_total_minor)}</p>
              <button type="button" class="btn btn-sm line-remove" data-remove>Remove</button>
            </li>`).join("")}
        </ul>
        <aside class="summary card" aria-label="Summary">
          <h2 class="summary-title">Summary</h2>
          <dl class="sumrows">
            <div class="sumrow"><dt>Subtotal</dt><dd class="tnum">${r(e.subtotal_minor-(e.protection_minor||0))}</dd></div>
            ${e.protection_minor?`<div class="sumrow"><dt>Shipment protection</dt><dd class="tnum">${r(e.protection_minor)}</dd></div>`:""}
            <div class="sumrow"><dt>${n?"Delivery":"Estimated delivery"}</dt><dd class="tnum">${n?r(e.shipping_minor):"—"}</dd></div>
            <div class="sumrow"><dt>${n?"Tax":"Estimated tax"}</dt><dd class="tnum">${n?r(e.tax_minor):"—"}</dd></div>
            <div class="sumrow sumrow-total"><dt>${n?"Total":"Estimated total"}</dt><dd class="tnum">${n?r(e.total_minor):"—"}</dd></div>
          </dl>
          ${n?"":'<p class="estimate-note">Estimated. We will show the exact amount once we know where it is going.</p>'}
          ${a}
          <a class="btn btn-primary checkout-link" href="/checkout/where-it-goes">Check out</a>
        </aside>
      </div>`}render(e){this.innerHTML=e}wire(e){this.querySelectorAll(".line").forEach(a=>{const n=Number(a.dataset.line),t=a.querySelector(".qty-num");a.querySelector("[data-total]"),Number(t.value)>0;const u=async s=>{const o=t.value;t.value=s,a.setAttribute("data-pending","");try{const l=await d.patch(`/cart/lines/${n}`,{quantity:s});m(l.lines.reduce((c,h)=>c+h.quantity,0)),this.render(this.html(l)),this.wire(l)}catch(l){t.value=o,a.removeAttribute("data-pending");const c=a.querySelector(".line-note")||document.createElement("p");c.className="line-note",c.setAttribute("role","alert"),c.textContent=l.message,a.appendChild(c)}};a.querySelectorAll(".qty-btn").forEach(s=>s.addEventListener("click",()=>{const o=Math.min(10,Math.max(1,Number(t.value)+Number(s.dataset.step)));u(o)})),t.addEventListener("change",()=>{const s=Math.min(10,Math.max(1,Number(t.value)||1));u(s)}),a.querySelector("[data-remove]").addEventListener("click",async()=>{try{const s=await d.del(`/cart/lines/${n}`);m(s.lines.reduce((o,l)=>o+l.quantity,0)),this.render(this.html(s)),this.wire(s)}catch(s){const o=document.createElement("p");o.className="line-note",o.setAttribute("role","alert"),o.textContent=s.message,a.appendChild(o)}})});const i=this.querySelector("#protection-toggle");i&&i.addEventListener("change",async()=>{try{const a=await d.post("/cart/protection",{enabled:i.checked});m(a.lines.reduce((n,t)=>n+t.quantity,0)),this.render(this.html(a)),this.wire(a)}catch{i.checked=!i.checked}})}}customElements.define("cart-view",p);
