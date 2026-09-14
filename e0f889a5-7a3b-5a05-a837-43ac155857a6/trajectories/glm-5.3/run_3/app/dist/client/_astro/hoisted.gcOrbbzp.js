class l extends HTMLElement{connectedCallback(){const a=this.dataset.active||"",t=JSON.parse(localStorage.getItem("vela_customer")||"null"),o=[["/shop","Shop","shop"],["/downloads","Downloads","downloads"],["/doctor","Firmware installer","doctor"],...t?[["/account","Overview","account"],["/account/orders","Orders","orders"],["/account/cameras","Cameras","cameras"]]:[]];this.innerHTML=`
          <button class="rail-jump" type="button" aria-expanded="false" aria-controls="rail-nav">Menu</button>
          <nav id="rail-nav" class="rail-nav" aria-label="Main">
            ${o.map(([n,i,c])=>`
              <a href="${n}" class="rail-link ${a===c?"is-active":""}" ${a===c?'aria-current="page"':""}>
                <span class="rail-marker" aria-hidden="true"></span>${i}
              </a>`).join("")}
            <div class="rail-spacer"></div>
            ${t?`<a href="/account" class="rail-link rail-account"><span class="rail-marker" aria-hidden="true"></span>${t.name}</a>
                 <button class="rail-link rail-signout" type="button">Sign out</button>`:`<a href="/sign-in" class="rail-link ${a==="signin"?"is-active":""}"><span class="rail-marker" aria-hidden="true"></span>Sign in</a>`}
          </nav>`;const e=this.querySelector(".rail-jump");e&&e.addEventListener("click",()=>{const i=this.querySelector(".rail-nav").classList.toggle("open");e.textContent=i?"Close menu":"Menu",e.setAttribute("aria-expanded",String(i))});const s=this.querySelector(".rail-signout");s&&s.addEventListener("click",async()=>{const n=localStorage.getItem("vela_token");if(n)try{await fetch("/api/auth/logout",{method:"POST",headers:{Authorization:`Bearer ${n}`}})}catch{}localStorage.removeItem("vela_token"),localStorage.removeItem("vela_customer"),window.location.href="/"})}}customElements.define("rail-sidebar",l);class d extends HTMLElement{connectedCallback(){this.render(),document.addEventListener("vela:cart",()=>this.render()),this.addEventListener("click",()=>{window.location.href="/cart"})}render(){const a=Number(localStorage.getItem("vela_cart_count")||0),t=a===0?"Cart, empty":`Cart, ${a} ${a===1?"item":"items"}`;this.innerHTML=`
          <button class="cart-btn" type="button" aria-label="${t}">
            <span aria-hidden="true">Cart</span>
            ${a>0?`<span class="cart-badge tnum" aria-hidden="true">${a>99?"99+":a}</span>`:""}
          </button>`,this.setAttribute("aria-label",t)}}customElements.define("cart-control",d);(async()=>{try{const r=localStorage.getItem("vela_cart_token");if(!r)return;const a=await fetch("/api/cart",{headers:{"x-cart-token":r}});if(!a.ok)return;const o=((await a.json()).lines||[]).reduce((e,s)=>e+s.quantity,0);localStorage.setItem("vela_cart_count",String(o)),document.dispatchEvent(new CustomEvent("vela:cart"))}catch{}})();
