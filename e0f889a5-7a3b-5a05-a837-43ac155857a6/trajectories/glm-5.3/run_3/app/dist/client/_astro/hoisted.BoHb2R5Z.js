import{a as y,s as m}from"./client.B_lvX2o6.js";import"./hoisted.gcOrbbzp.js";class h extends HTMLElement{connectedCallback(){const e=this.getAttribute("sku"),i=this.hasAttribute("disabled"),u=this.getAttribute("label")||"Add to cart",o=Number(this.getAttribute("max-qty")||10);this.innerHTML=`
      <div class="buy">
        <div class="qty">
          <button type="button" class="qty-btn" data-step="-1" aria-label="Decrease quantity">−</button>
          <input class="qty-num tnum" type="number" min="1" max="${o}" value="1" aria-label="Quantity" inputmode="numeric" />
          <button type="button" class="qty-btn" data-step="1" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="btn btn-primary buy-btn" ${i?"disabled":""}>${i?u:"Add to cart"}</button>
      </div>
      <p class="buy-note" role="status"></p>`;const a=this.querySelector(".qty-num"),n=this.querySelector(".buy-note");if(i){a.disabled=!0,this.querySelectorAll(".qty-btn").forEach(t=>t.disabled=!0),n.textContent="Unavailable to buy";return}this.querySelectorAll(".qty-btn").forEach(t=>t.addEventListener("click",()=>{const s=Math.min(o,Math.max(1,Number(a.value)+Number(t.dataset.step)));a.value=s})),this.querySelector(".buy-btn").addEventListener("click",async t=>{const s=t.currentTarget;s.disabled=!0,n.textContent="Adding";try{const c=(await y.post("/cart/lines",{sku:e,quantity:Number(a.value)})).lines.reduce((d,b)=>d+b.quantity,0);m(c),n.textContent="Added to cart."}catch(l){n.textContent=l.message||"That did not work."}finally{s.disabled=!1}})}}customElements.define("buy-control",h);document.querySelectorAll('input[name="variant"]').forEach(r=>{r.addEventListener("change",()=>{const e=new URL(window.location.href);e.searchParams.set("variant",r.value),window.history.replaceState({},"",e),window.location.reload()})});
