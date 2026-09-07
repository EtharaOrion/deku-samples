import{d as a}from"./hooks.module.B6Bl1fq7.js";import{g as v}from"./format.DOiXrd1p.js";import{u as e}from"./jsxRuntime.module.Dqw-6DmR.js";import"./preact.module.BTqC4RwC.js";const b=/^(VA|VC)\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;function T(){const[l,c]=a(""),[t,r]=a("idle"),[u,i]=a(null),[m,p]=a(null),n=l.replace(/[^0-9A-Z]/g,""),s=b.test(n),o=n.length===12&&!s?"We do not recognise that serial number.":null;async function f(d){if(d.preventDefault(),!(!s||t==="working")){r("working"),i(null),p(null);try{const g=await fetch("/api/account/devices",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({serial:n})}),h=await g.json();if(!g.ok){r("error"),i(h.message||"That did not work.");return}r("done"),p(h),c(""),setTimeout(()=>window.location.reload(),900)}catch{r("error"),i("That did not work. Check your connection and try again.")}}}return e("form",{class:"register",onSubmit:f,children:[e("div",{class:"field",children:[e("label",{for:"serial",children:"Register a camera"}),e("input",{class:"input ident",id:"serial",name:"serial",value:l,maxLength:14,spellcheck:!1,autocomplete:"off",placeholder:"VA26 09KT MHX4","aria-describedby":"serial-hint","aria-invalid":o?"true":void 0,onInput:d=>c(v(d.currentTarget.value))}),e("span",{class:"hint",id:"serial-hint",children:"Twelve characters, engraved on the underside."})]}),e("button",{type:"submit",class:"btn btn-primary",disabled:!s||t==="working",children:t==="working"?"Checking":"Register"}),e("p",{class:"live",role:"status","aria-live":"polite",children:[o&&e("span",{class:"error-text",children:o}),u&&e("span",{class:"error-text",children:u}),m&&e("span",{class:"added",children:["Registered. ",m.model," is on your account."]})]}),e("style",{children:`
        .register {
          display: grid;
          grid-template-columns: minmax(0, 320px) auto;
          gap: calc(var(--space) * 3);
          align-items: end;
          border: var(--border-w) solid var(--rule);
          border-radius: var(--radius);
          padding: calc(var(--space) * 4);
          background: var(--bg-raised);
        }
        .live { grid-column: 1 / -1; min-height: 21px; font-size: 14px; }
        .added { animation: fade-out 400ms var(--ease) 3s forwards; }
        @keyframes fade-out { to { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .added { animation: none; }
        }
        @media (max-width: 63.999rem) {
          .register { grid-template-columns: minmax(0, 1fr); }
        }
      `})]})}export{T as default};
