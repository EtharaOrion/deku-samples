import{d as g,T as S,h as k}from"./hooks.module.B6Bl1fq7.js";import{f as q}from"./format.DOiXrd1p.js";import{u as e}from"./jsxRuntime.module.Dqw-6DmR.js";import{S as z}from"./preact.module.BTqC4RwC.js";function N({product:v,initialSku:w}){const a=v.variants,[y,x]=g(()=>{const n=a.find(i=>i.sku===w);return n?n.sku:a[0]?.sku}),[r,b]=g(1),[o,u]=g("idle"),[m,p]=g(null),t=S(()=>a.find(n=>n.sku===y)||a[0],[y,a]),s=v.status==="discontinued",h=Number(t?.available||0),f=h<=0,l=!s&&!f,c=Math.max(1,Math.min(10,h));k(()=>{if(!t)return;const n=new URL(window.location.href);a.length>1?n.searchParams.set("variant",t.sku):n.searchParams.delete("variant"),window.history.replaceState({},"",n)},[t?.sku]),k(()=>{r>c&&b(c)},[c]);async function C(){if(!(!l||o==="working")){u("working"),p(null);try{const n=await fetch("/api/cart/lines",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({sku:t.sku,quantity:r})}),i=await n.json();if(!n.ok){u("error"),p(i.message||"That did not work.");return}u("done"),p("Added to your cart."),window.dispatchEvent(new CustomEvent("vela:cart-changed",{detail:i}))}catch{u("error"),p("That did not work. Check your connection and try again.")}}}if(!t)return null;let d=null;return s?d="Discontinued":f?d="Sold out":h<=10&&(d=`Only ${h} left`),e("div",{class:"buy",children:[e("p",{class:"price money tnum",children:q(t.price_minor,t.currency)}),d&&e("p",{class:`availability${f||s?" danger":""}`,children:d}),a.length>1&&e("fieldset",{class:"options",children:[e("legend",{children:"Colour"}),e("div",{class:"option-row",children:a.map(n=>{const i=Number(n.available)<=0;return e("label",{class:`option${n.sku===t.sku?" selected":""}`,children:[e("input",{type:"radio",name:"variant",value:n.sku,checked:n.sku===t.sku,onChange:()=>x(n.sku)}),e("span",{children:n.option_value}),i&&e("span",{class:"option-note",children:"Sold out"})]},n.sku)})})]}),e("div",{class:"qty",children:[e("span",{id:"qty-label",children:"Quantity"}),e("div",{class:"stepper",role:"group","aria-labelledby":"qty-label",children:[e("button",{type:"button",class:"step",onClick:()=>b(n=>Math.max(1,n-1)),disabled:r<=1||!l,children:[e("span",{"aria-hidden":"true",children:"−"}),e("span",{class:"visually-hidden",children:"One fewer"})]}),e("output",{class:"qty-value tnum","aria-live":"polite",children:r}),e("button",{type:"button",class:"step",onClick:()=>b(n=>Math.min(c,n+1)),disabled:r>=c||!l,children:[e("span",{"aria-hidden":"true",children:"+"}),e("span",{class:"visually-hidden",children:"One more"})]})]})]}),e("button",{type:"button",class:"btn btn-primary buy-control",onClick:C,disabled:!l||o==="working",children:s?"Discontinued":f?"Sold out":o==="working"?"Adding":"Add to cart"}),!l&&e("p",{class:"hint",children:s?"We no longer sell this.":"We have none of this one left."}),e("p",{class:"live",role:"status","aria-live":"polite",children:m&&e("span",{class:o==="error"?"error-text":void 0,children:[m,o==="done"&&e(z,{children:[" ",e("a",{href:"/cart",children:"Go to your cart"})]})]})}),e("style",{children:`
        .buy { display: flex; flex-direction: column; gap: calc(var(--space) * 4); }
        .price { font-size: 24px; line-height: 30px; font-weight: 700; }
        .availability { font-size: 14px; color: var(--fg-muted); }
        .availability.danger { color: var(--danger); }

        .options { border: 0; padding: 0; margin: 0; }
        .options legend { font-weight: 700; font-size: 14px; padding: 0 0 calc(var(--space) * 2); }
        .option-row { display: flex; flex-wrap: wrap; gap: calc(var(--space) * 2); }
        .option {
          display: inline-flex; align-items: center; gap: calc(var(--space) * 2);
          border: var(--border-w) solid var(--rule-strong);
          border-radius: var(--radius);
          padding: calc(var(--space) * 2) calc(var(--space) * 3);
          cursor: pointer;
        }
        .option.selected { border-color: var(--fg); font-weight: 700; }
        .option-note { font-size: 12px; color: var(--fg-muted); }

        .qty { display: flex; align-items: center; gap: calc(var(--space) * 3); font-size: 14px; }
        .stepper { display: inline-flex; align-items: center; border: var(--border-w) solid var(--rule-strong); border-radius: var(--radius); }
        .step {
          width: 36px; height: 36px; border: 0; background: transparent; cursor: pointer;
          transition: background-color var(--speed) var(--ease);
        }
        .step:hover:not(:disabled) { background: var(--bg-sunken); }
        .step:disabled { opacity: 0.4; cursor: not-allowed; }
        .qty-value { min-width: 36px; text-align: center; font-variant-numeric: tabular-nums; }

        .buy-control { align-self: flex-start; min-width: 200px; }
        .live { min-height: 21px; font-size: 14px; }
      `})]})}export{N as default};
