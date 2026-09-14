import"./hoisted.gcOrbbzp.js";import{a as c,b as m}from"./client.B_lvX2o6.js";class d extends HTMLElement{connectedCallback(){const e=this.getAttribute("mode")||"signin",o=this.getAttribute("next")||"/account",t=o.startsWith("/")?o:"/account";this.innerHTML=`
      <div class="auth">
        <h1>${e==="signin"?"Sign in":"Create an account"}</h1>
        ${e==="signin"?`<form>
            <div class="field"><label for="a-email">Email</label><input id="a-email" name="email" type="email" autocomplete="email" /></div>
            <div class="field"><label for="a-pw">Password</label><input id="a-pw" name="password" type="password" autocomplete="current-password" /></div>
            <p class="field-error" role="alert" data-error></p>
            <button class="btn btn-primary" type="submit">Sign in</button>
          </form>
          <p class="auth-note">No account yet? <a href="/sign-up?next=${encodeURIComponent(t)}">Create one</a>. You can also check out as a guest.</p>`:`<form>
            <div class="field"><label for="a-name">Name</label><input id="a-name" name="name" type="text" autocomplete="name" /></div>
            <div class="field"><label for="a-email">Email</label><input id="a-email" name="email" type="email" autocomplete="email" /></div>
            <div class="field"><label for="a-pw">Password, at least eight characters</label><input id="a-pw" name="password" type="password" autocomplete="new-password" /></div>
            <p class="field-error" role="alert" data-error></p>
            <button class="btn btn-primary" type="submit">Create account</button>
          </form>
          <p class="auth-note">Already have one? <a href="/sign-in?next=${encodeURIComponent(t)}">Sign in</a>.</p>`}
      </div>`,this.querySelector("form").addEventListener("submit",async s=>{s.preventDefault();const i=this.querySelector("[data-error]");i.textContent="";const a=s.currentTarget,r={email:a.querySelector('[name="email"]').value.trim(),password:a.querySelector('[name="password"]').value};e==="signup"&&(r.name=a.querySelector('[name="name"]').value.trim());try{const n=e==="signin"?"/auth/login":"/auth/signup",l=await c.post(n,r);m(l.access_token,l.customer),window.location.href=t}catch(n){i.textContent=n.message||"That did not work."}})}}customElements.define("auth-form",d);
