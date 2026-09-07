import{d as a,A as E,h as J}from"./hooks.module.B6Bl1fq7.js";import{g as N,a as j}from"./format.DOiXrd1p.js";import{u as e}from"./jsxRuntime.module.Dqw-6DmR.js";import{S as R}from"./preact.module.BTqC4RwC.js";function Q(){const[b,A]=a(null),[g,L]=a(!1),[T,M]=a(""),[l,C]=a(null),[v,U]=a([]),[S,w]=a(null),[$,_]=a(!1),[o,y]=a(null),[s,c]=a("idle"),[z,D]=a(0),[Y,t]=a(""),[x,k]=a(null),[I,m]=a(null),O=E(-1);J(()=>{A("usb"in navigator||"serial"in navigator)},[]);async function W(n){n?.preventDefault();const p=T.replace(/[^0-9A-Za-z]/g,"").toUpperCase();w(null),m(null),C(null),_(!0),t("Looking for that camera.");try{const d=await fetch(`/api/firmware/device/${encodeURIComponent(p)}`,{credentials:"same-origin"}),r=await d.json();if(!d.ok){w(r.message||"We do not recognise that serial number."),t("That camera was not found.");return}C(r.device),U(r.manifest.entries||[]);const f=(r.manifest.entries||[])[0];y(f?f.build:null),t(`Found ${r.device.model}, running ${r.device.firmware_version||"an unknown version"}.`)}catch{w("That did not work. Check your connection and try again.")}finally{_(!1)}}async function B(){if(!l||!o||s==="writing")return;m(null),c("starting"),t("Starting."),D(0);let n;try{const i=await fetch("/api/flash-sessions",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({serial:l.serial,target_build:o})});if(n=await i.json(),!i.ok){m(n.message||"That image cannot go on this camera."),c("idle"),t("That image was refused.");return}}catch{m("That did not work. Check your connection and try again."),c("idle");return}c("writing");const p=v.find(i=>i.build===o),d=p?p.size_bytes:0;let r=0;const f=Math.max(1,Math.floor(d/40));for(;r<d;){await new Promise(u=>setTimeout(u,55)),r=Math.min(d,r+f);const i=Math.floor(r/d*100);D(i),(i-O.current>=20||i===100)&&(O.current=i,t(`Writing, ${i} percent.`))}try{const i=await fetch(`/api/flash-sessions/${n.id}/complete`,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({reported_version:p.version})}),u=await i.json();if(!i.ok){c("failed"),k({ok:!1,present:!0,message:u.message}),t("The write did not finish.");return}c("done"),k({ok:!0,version:u.reported_version}),t(`Done. Your camera is running ${u.reported_version}.`)}catch{await fetch(`/api/flash-sessions/${n.id}/fail`,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({reason:"disconnected"})}).catch(()=>{}),c("failed"),k({ok:!1,present:!1}),t("The camera disconnected.")}}const h=v[0],P=v.slice(1);return e("div",{class:"doctor",children:[e("p",{class:"live",role:"status","aria-live":"polite",children:Y}),e("ol",{class:"steps",children:[e("li",{class:"step",children:[e("h2",{children:[e("span",{class:"n tnum",children:"1"})," Can this browser talk to your camera"]}),b===null?e("p",{class:"skeleton line","aria-hidden":"true"}):b?e("p",{children:"This browser can talk to a camera over USB. Keep the camera plugged in."}):e(R,{children:[e("p",{children:"This browser cannot talk to a camera. Chrome, Edge and Opera on a desktop can."}),e("p",{children:["You can also use Arranger, which does the same job. ",e("a",{href:"/downloads",children:"Get Arranger"}),"."]})]})]}),e("li",{class:"step",children:[e("h2",{children:[e("span",{class:"n tnum",children:"2"})," Read this first"]}),e("div",{class:"warning",tabIndex:0,role:"group","aria-label":"Before you start",children:e("p",{children:"This replaces the software inside your camera. It takes about ninety seconds. Do not unplug the camera and do not let your computer go to sleep. If you are on a laptop, plug it in."})}),e("button",{type:"button",class:"btn",onClick:()=>L(!0),disabled:g,children:g?"Understood":"I understand"})]}),e("li",{class:"step",children:[e("h2",{children:[e("span",{class:"n tnum",children:"3"})," Find your camera"]}),e("form",{onSubmit:W,class:"find",children:[e("div",{class:"field",children:[e("label",{for:"doctor-serial",children:"Serial number"}),e("input",{class:"input ident",id:"doctor-serial",value:T,maxLength:14,onInput:n=>M(N(n.currentTarget.value)),placeholder:"VC26 09PV DA7Q","aria-describedby":"doctor-serial-hint"}),e("span",{class:"hint",id:"doctor-serial-hint",children:"It is engraved on the underside."})]}),e("button",{type:"submit",class:"btn",disabled:!g||!b||$,children:$?"Looking":"Connect"})]}),!g&&e("p",{class:"hint",children:"Read the warning above and choose “I understand” first."}),S&&e("p",{class:"notice notice-danger",role:"alert",children:S}),l&&e("p",{class:"found",children:[l.model,", serial ",e("span",{class:"ident",children:l.serial}),", currently running ",e("span",{class:"ident",children:l.firmware_version||"an unknown version"})]})]}),l&&e("li",{class:"step",children:[e("h2",{children:[e("span",{class:"n tnum",children:"4"})," Choose the software"]}),h&&e("label",{class:`image${o===h.build?" selected":""}`,children:[e("input",{type:"radio",name:"image",checked:o===h.build,onChange:()=>y(h.build)}),e("span",{class:"image-body",children:[e("span",{class:"image-title",children:["Recommended: ",e("span",{class:"ident",children:h.version})]}),e("span",{class:"hint tnum",children:j(h.size_bytes)})]})]}),P.length>0&&e("details",{class:"others",children:[e("summary",{children:"Other versions"}),e("div",{class:"others-body",children:P.map(n=>e("label",{class:`image${o===n.build?" selected":""}`,children:[e("input",{type:"radio",name:"image",checked:o===n.build,onChange:()=>y(n.build)}),e("span",{class:"image-body",children:[e("span",{class:"image-title",children:e("span",{class:"ident",children:n.version})}),e("span",{class:"hint tnum",children:j(n.size_bytes)})]})]},n.build))})]}),I&&e("p",{class:"notice notice-danger",role:"alert",children:I}),s!=="writing"&&s!=="done"&&e("button",{type:"button",class:"btn btn-primary",onClick:B,disabled:!o,children:"Write the software"})]}),(s==="writing"||s==="done"||s==="failed")&&e("li",{class:"step",children:[e("h2",{children:[e("span",{class:"n tnum",children:"5"})," The write"]}),s==="writing"&&e(R,{children:[e("p",{class:"writing tnum",children:["Writing, ",z,"%. Do not unplug your camera."]}),e("div",{class:"bar",role:"presentation",children:e("div",{class:"bar-fill",style:`width:${z}%`})})]}),s==="done"&&x?.ok&&e("p",{class:"done-line",children:["Done. Your camera is running ",e("span",{class:"ident",children:x.version}),"."]}),s==="failed"&&e("p",{class:"notice notice-danger",children:x?.present?"Your camera is still working and you can try again.":"The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine."})]})]}),e("style",{children:`
        .doctor { display: flex; flex-direction: column; gap: calc(var(--space) * 4); max-width: 68ch; }
        .live { min-height: 21px; font-size: 14px; color: var(--fg-muted); }
        .steps { list-style: none; display: flex; flex-direction: column; gap: calc(var(--space) * 8); }
        .step { display: flex; flex-direction: column; gap: calc(var(--space) * 3); align-items: flex-start; }
        .step h2 { font-size: 18px; line-height: 24px; display: flex; align-items: center; gap: calc(var(--space) * 2); }
        .n {
          display: inline-grid; place-items: center;
          width: 24px; height: 24px;
          border: var(--border-w) solid currentColor;
          border-radius: var(--radius);
          font-size: 13px;
        }
        .warning {
          border: var(--border-w) solid var(--rule-strong);
          border-left-width: 3px;
          border-radius: var(--radius);
          padding: calc(var(--space) * 4);
          background: var(--bg-raised);
          max-width: 62ch;
        }
        .find { display: flex; gap: calc(var(--space) * 3); align-items: flex-end; flex-wrap: wrap; }
        .found { font-size: 14px; }
        .line { width: 40ch; height: 21px; }

        .image {
          display: flex; align-items: center; gap: calc(var(--space) * 3);
          border: var(--border-w) solid var(--rule-strong);
          border-radius: var(--radius);
          padding: calc(var(--space) * 3);
          cursor: pointer;
          min-width: 320px;
        }
        .image.selected { border-color: var(--fg); border-width: 2px; }
        .image-body { display: flex; flex-direction: column; }
        .image-title { font-weight: 700; }
        .others { width: 100%; }
        .others-body { display: flex; flex-direction: column; gap: calc(var(--space) * 2); padding-top: calc(var(--space) * 2); }

        .writing { font-weight: 700; }
        .bar {
          width: 100%; max-width: 420px; height: 8px;
          background: var(--bg-sunken);
          border-radius: var(--radius);
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          background: var(--progress);
          transition: width var(--speed) var(--ease);
        }
        .done-line { font-weight: 700; }
      `})]})}export{Q as default};
