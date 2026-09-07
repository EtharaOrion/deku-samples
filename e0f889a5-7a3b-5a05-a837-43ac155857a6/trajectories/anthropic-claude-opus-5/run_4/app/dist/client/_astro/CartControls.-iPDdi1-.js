import{d as l}from"./hooks.module.B6Bl1fq7.js";import{f as a}from"./format.DOiXrd1p.js";import{u as e}from"./jsxRuntime.module.Dqw-6DmR.js";import"./preact.module.BTqC4RwC.js";function O({initial:b}){const[n,x]=l(b),[w,m]=l(!1),[u,o]=l({}),[g,d]=l(null),[k,p]=l(null);async function h(t,i,c){m(!0),d(null);try{const r=await fetch(t,{credentials:"same-origin",headers:{"content-type":"application/json"},...i}),s=await r.json();return r.ok?(x(s),o({}),window.dispatchEvent(new CustomEvent("vela:cart-changed",{detail:s})),s):(c?.(),d(s.message||"That did not work."),null)}catch{return c?.(),d("That did not work. Check your connection and try again."),null}finally{m(!1)}}function y(t,i){if(i<1||i>10)return;const c=u[t.id]??t.quantity;o(r=>({...r,[t.id]:i})),h(`/api/cart/lines/${t.id}`,{method:"PATCH",body:JSON.stringify({quantity:i})},()=>o(r=>({...r,[t.id]:c})))}function C(t){h(`/api/cart/lines/${t.id}`,{method:"DELETE"}),p(null)}function _(t){h("/api/cart/protection",{method:"POST",body:JSON.stringify({enabled:t})})}const f=n.lines||[],v=n.protection_rung;return f.length?e("div",{class:"cart-grid",children:[e("div",{class:"lines-side",children:[(n.notices||[]).length>0&&e("ul",{class:"notices",children:n.notices.map(t=>e("li",{class:"notice notice-danger",children:t.message},t.line_id+t.kind))}),g&&e("p",{class:"notice notice-danger",role:"alert",children:g}),e("ul",{class:"lines",children:f.map(t=>{const i=u[t.id]??t.quantity;return e("li",{class:"line",children:[e("div",{class:"line-media","aria-hidden":"true"}),e("div",{class:"line-body",children:[e("a",{class:"line-title",href:`/shop/${t.handle}`,children:t.title}),e("p",{class:"hint",children:t.option_value}),e("p",{class:"hint money tnum",children:[a(t.unit_price_minor)," each"]})]}),e("div",{class:"stepper",role:"group","aria-label":`Quantity of ${t.title}`,children:[e("button",{type:"button",class:"step",onClick:()=>y(t,i-1),disabled:i<=1,children:[e("span",{"aria-hidden":"true",children:"−"}),e("span",{class:"visually-hidden",children:["One fewer ",t.title]})]}),e("output",{class:"qty-value tnum",children:i}),e("button",{type:"button",class:"step",onClick:()=>y(t,i+1),disabled:i>=Math.min(10,t.available),children:[e("span",{"aria-hidden":"true",children:"+"}),e("span",{class:"visually-hidden",children:["One more ",t.title]})]})]}),e("p",{class:`line-total money tnum${w?" pending":""}`,children:a(t.unit_price_minor*i)}),k===t.id?e("div",{class:"confirm",children:[e("p",{children:"Remove it?"}),e("button",{type:"button",class:"btn",onClick:()=>C(t),children:"Remove"}),e("button",{type:"button",class:"btn",onClick:()=>p(null),children:"Keep"})]}):e("button",{type:"button",class:"btn remove",onClick:()=>p(t.id),children:["Remove",e("span",{class:"visually-hidden",children:[" ",t.title]})]})]},t.id)})})]}),e("aside",{class:"summary card","aria-label":"Cart summary",children:[e("h2",{children:"Summary"}),e("dl",{class:"totals",children:[e("div",{children:[e("dt",{children:"Subtotal"}),e("dd",{class:"money tnum",children:a(n.subtotal_minor)})]}),e("div",{children:[e("dt",{children:"Estimated delivery"}),e("dd",{class:"money tnum",children:a(n.shipping_minor)})]}),n.protection_minor>0&&e("div",{children:[e("dt",{children:"Shipment protection"}),e("dd",{class:"money tnum",children:a(n.protection_minor)})]}),e("div",{children:[e("dt",{children:"Estimated tax"}),e("dd",{class:"money tnum",children:a(n.tax_minor)})]}),e("div",{class:"grand",children:[e("dt",{children:"Total"}),e("dd",{class:"money tnum",children:a(n.total_minor)})]})]}),e("p",{class:"hint",children:"Estimated. We will show the exact amount once we know where it is going."}),v&&e("label",{class:"protect",children:[e("input",{type:"checkbox",checked:!!n.protection_enabled,onChange:t=>_(t.currentTarget.checked)}),e("span",{children:["Protect this shipment against loss, theft and damage for ",a(v.price_minor)]})]}),e("a",{class:"btn btn-primary checkout",href:"/checkout/where-it-goes",children:"Check out"})]}),e("style",{children:`
        .cart-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 320px);
          gap: calc(var(--space) * 8);
          align-items: start;
        }
        .lines-side { display: flex; flex-direction: column; gap: calc(var(--space) * 4); }
        .notices, .lines { list-style: none; display: flex; flex-direction: column; gap: calc(var(--space) * 3); }

        .line {
          display: grid;
          grid-template-columns: 64px minmax(0, 1fr) auto auto auto;
          gap: calc(var(--space) * 3);
          align-items: center;
          border: var(--border-w) solid var(--rule);
          border-radius: var(--radius);
          padding: calc(var(--space) * 3);
          background: var(--bg-raised);
        }
        .line-media {
          width: 64px; height: 48px;
          background: var(--bg-sunken);
          border: var(--border-w) solid var(--rule);
          border-radius: 0;
        }
        .line-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .line-title { font-weight: 700; text-decoration: none; }
        .line-total { min-width: 84px; text-align: right; font-weight: 700; }
        /* The totals show a pending state while the server settles. */
        .line-total.pending { opacity: 0.5; }

        .stepper { display: inline-flex; align-items: center; border: var(--border-w) solid var(--rule-strong); border-radius: var(--radius); }
        .step { width: 32px; height: 32px; border: 0; background: transparent; cursor: pointer; }
        .step:hover:not(:disabled) { background: var(--bg-sunken); }
        .step:disabled { opacity: 0.4; cursor: not-allowed; }
        .qty-value { min-width: 30px; text-align: center; font-variant-numeric: tabular-nums; }

        .remove { min-height: 32px; font-size: 14px; }
        .confirm { display: flex; align-items: center; gap: calc(var(--space) * 2); font-size: 14px; }

        .summary {
          padding: calc(var(--space) * 4);
          display: flex; flex-direction: column; gap: calc(var(--space) * 4);
          position: sticky; top: calc(var(--header-h) + var(--space) * 4);
        }
        .summary h2 { font-size: 16px; }
        .totals { display: flex; flex-direction: column; gap: calc(var(--space) * 2); font-size: 14px; }
        .totals > div { display: flex; justify-content: space-between; gap: calc(var(--space) * 3); }
        .totals dd { margin: 0; }
        .grand { border-top: var(--border-w) solid var(--rule); padding-top: calc(var(--space) * 2); font-weight: 700; font-size: 16px; }
        .protect { display: flex; gap: calc(var(--space) * 2); font-size: 14px; align-items: flex-start; }
        .checkout { width: 100%; }

        @media (max-width: 63.999rem) {
          .cart-grid { grid-template-columns: minmax(0, 1fr); }
          .line { grid-template-columns: 48px minmax(0, 1fr); grid-auto-flow: row; }
          .summary { position: static; }
        }
      `})]}):e("div",{class:"empty card",children:[e("p",{children:"Your cart is empty."}),e("a",{href:"/shop",children:"Shop"}),e("style",{children:`
          .empty {
            padding: calc(var(--space) * 6);
            display: flex; flex-direction: column; gap: calc(var(--space) * 2);
            align-items: flex-start;
          }
        `})]})}export{O as default};
