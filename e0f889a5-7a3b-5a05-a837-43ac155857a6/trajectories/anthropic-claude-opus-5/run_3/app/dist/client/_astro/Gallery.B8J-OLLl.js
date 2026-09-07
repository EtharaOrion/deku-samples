import{d}from"./hooks.module.B6Bl1fq7.js";import{u as l}from"./jsxRuntime.module.Dqw-6DmR.js";import"./preact.module.BTqC4RwC.js";function g({handle:n,title:i}){const a=[{key:"front",label:"Front"},{key:"top",label:"Top"},{key:"back",label:"Back"}],[t,o]=d(0);function s(r){r.key==="ArrowRight"?(r.preventDefault(),o(e=>(e+1)%a.length)):r.key==="ArrowLeft"&&(r.preventDefault(),o(e=>(e-1+a.length)%a.length))}return l("div",{class:"gallery",children:[l("div",{class:"gallery__frame",role:"group","aria-label":`${i}, view ${a[t].label}`,tabIndex:0,onKeyDown:s,children:l("img",{src:`/media/products/${n}.svg`,alt:`${i}, ${a[t].label.toLowerCase()} view`,width:"480",height:"400",style:{transform:`rotate(${t*0}deg)`}})}),l("div",{class:"gallery__thumbs",role:"tablist","aria-label":"Views",children:a.map((r,e)=>l("button",{type:"button",role:"tab","aria-selected":e===t?"true":"false",class:`gallery__thumb ${e===t?"is-current":""}`,onClick:()=>o(e),children:r.label},r.key))}),l("style",{children:`
        .gallery__frame {
          border: var(--border-w) solid var(--line);
          background: var(--surface-sunken);
          border-radius: 0;
          overflow: hidden;
        }
        .gallery__frame img { width: 100%; height: auto; display: block; }
        .gallery__thumbs { display: flex; gap: calc(var(--unit) * 2); margin-top: calc(var(--unit) * 3); }
        .gallery__thumb {
          padding: calc(var(--unit) * 1.5) calc(var(--unit) * 3);
          border: var(--border-w) solid var(--line-strong);
          border-radius: var(--radius);
          background: var(--surface);
          cursor: pointer;
          font-size: 14px;
          transition: background var(--speed) var(--ease);
        }
        .gallery__thumb.is-current { font-weight: 700; border-color: var(--fg); }
      `})]})}export{g as default};
