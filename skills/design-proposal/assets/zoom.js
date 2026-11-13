/* Zoom for generated pages. One copy lives in design-proposal/assets; review and write inline it.
   Diagrams (each .fw box): - / % / + buttons, Ctrl or Cmd + wheel (and trackpad pinch), drag to pan,
   keys + - 0 when focused, a full-screen toggle that fits the diagram, Esc to leave it. Clicking % resets.
   Page: - / % / + in a [data-zoom-page] slot (fixed corner without one) zooms <main>.
   Skips the page control on design-proposal playground copies, where drawings are pinned to page coordinates. */
(function(){
"use strict";
const MIN=0.25,MAX=8,STEP=1.25;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const css=document.createElement("style");
css.textContent=
".zm-tb{display:flex;width:max-content;margin:0 0 4px auto;gap:2px;padding:2px;border:1px solid GrayText;border-radius:6px;background:Canvas;color:CanvasText}"+
".zm-tb button,.zm-page button{all:unset;box-sizing:border-box;cursor:pointer;min-width:28px;height:28px;padding:0 6px;border-radius:4px;text-align:center;font:600 13px/28px system-ui,sans-serif;font-variant-numeric:tabular-nums}"+
".zm-tb button:hover,.zm-page button:hover{background:rgba(127,127,127,.2)}"+
".zm-tb button:focus-visible,.zm-page button:focus-visible,.zm>.fw:focus-visible{outline:2px solid Highlight;outline-offset:1px}"+
".zm>.fw.zm-on{overflow:auto;max-height:80vh}"+
".zm>.fw.zm-pan{cursor:grab}.zm>.fw.zm-drag{cursor:grabbing;user-select:none}"+
".zm.zm-full{position:fixed;inset:0;z-index:2147483000;margin:0;padding:44px 12px 12px;background:var(--bg,Canvas);display:flex;flex-direction:column}"+
".zm.zm-full>.fw{flex:1;min-height:0;max-height:none;overflow:auto}"+
".zm.zm-full>.zm-tb{position:absolute;top:6px;right:12px;margin:0}"+
".zm-page{display:inline-flex;align-items:center;gap:2px;color:inherit}"+
".zm-page.zm-corner{position:fixed;right:12px;bottom:12px;z-index:50;padding:2px;border:1px solid GrayText;border-radius:6px;background:Canvas;color:CanvasText}";
document.head.append(css);

function btn(label,title,fn){
  const b=document.createElement("button");
  b.type="button";b.textContent=label;b.title=title;b.setAttribute("aria-label",title);
  b.addEventListener("click",fn);return b;
}

/* Diagrams: zoom resizes the svg so the box scrolls natively; drag scrolls the box. */
function diagram(fw){
  const fig=fw.parentElement;
  fig.classList.add("zm");
  fw.tabIndex=0;
  let scale=1,base=0,saved=null;
  const target=()=>fw.querySelector("svg")||fw.firstElementChild;
  const pct=btn("100%","Reset zoom",()=>set(1));
  const full=btn("⤢","Full screen",()=>toggleFull());
  const tb=document.createElement("div");
  tb.className="zm-tb";tb.setAttribute("role","toolbar");tb.setAttribute("aria-label","Diagram zoom");
  tb.append(btn("−","Zoom out",()=>set(scale/STEP)),pct,btn("+","Zoom in",()=>set(scale*STEP)),full);
  fig.insertBefore(tb,fw);

  function set(next,cx,cy){
    const t=target();if(!t)return;
    next=clamp(next,MIN,MAX);
    if(Math.abs(next-1)<0.01)next=1;
    if(next===scale)return;
    if(scale===1){base=parseFloat(getComputedStyle(t).width)||t.getBoundingClientRect().width;saved=t.getAttribute("style");}
    // Keep the point under the cursor (or the box centre) in place, in the box's own pixels.
    const r=fw.getBoundingClientRect(),k=fw.clientWidth/(r.width||1);
    const ox=(cx===undefined?r.width/2:cx-r.left)*k,oy=(cy===undefined?r.height/2:cy-r.top)*k;
    const fx=(fw.scrollLeft+ox)/(fw.scrollWidth||1),fy=(fw.scrollTop+oy)/(fw.scrollHeight||1);
    scale=next;
    if(scale===1){
      if(saved===null)t.removeAttribute("style");else t.setAttribute("style",saved);
      fw.classList.remove("zm-on");
    }else{
      Object.assign(t.style,{width:base*scale+"px",maxWidth:"none",minWidth:"0",height:"auto"});
      fw.classList.add("zm-on");
    }
    fw.scrollLeft=fx*fw.scrollWidth-ox;
    fw.scrollTop=fy*fw.scrollHeight-oy;
    pct.textContent=Math.round(scale*100)+"%";
    fw.classList.toggle("zm-pan",fw.scrollWidth>fw.clientWidth||fw.scrollHeight>fw.clientHeight);
  }
  function toggleFull(on=!fig.classList.contains("zm-full")){
    set(1);
    fig.classList.toggle("zm-full",on);
    document.documentElement.style.overflow=on?"hidden":"";
    full.textContent=on?"✕":"⤢";
    full.title=on?"Exit full screen":"Full screen";full.setAttribute("aria-label",full.title);
    const t=target();
    if(on&&t){
      // Fit the diagram to the screen.
      const cs=getComputedStyle(t),fit=Math.min((fw.clientWidth-24)/parseFloat(cs.width),(fw.clientHeight-24)/parseFloat(cs.height));
      if(fit>0&&isFinite(fit))set(fit);
    }
    fw.focus({preventScroll:true});
  }

  fw.addEventListener("wheel",e=>{
    if(!e.ctrlKey&&!e.metaKey)return;
    e.preventDefault();
    set(scale*Math.exp(-e.deltaY*0.002),e.clientX,e.clientY);
  },{passive:false});
  fw.addEventListener("keydown",e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==="+"||e.key==="=")set(scale*STEP);
    else if(e.key==="-")set(scale/STEP);
    else if(e.key==="0")set(1);
    else if(e.key==="Escape"&&fig.classList.contains("zm-full"))toggleFull(false);
    else return;
    e.preventDefault();
  });
  // Mouse and pen drag to pan; touch keeps native scrolling.
  let drag=null;
  fw.addEventListener("pointerdown",e=>{
    if(e.pointerType==="touch"||e.button!==0||!fw.classList.contains("zm-pan"))return;
    drag={x:e.clientX,y:e.clientY,l:fw.scrollLeft,t:fw.scrollTop};
    fw.setPointerCapture(e.pointerId);fw.classList.add("zm-drag");e.preventDefault();
  });
  fw.addEventListener("pointermove",e=>{
    if(!drag)return;
    fw.scrollLeft=drag.l-(e.clientX-drag.x);fw.scrollTop=drag.t-(e.clientY-drag.y);
  });
  const stop=()=>{drag=null;fw.classList.remove("zm-drag");};
  fw.addEventListener("pointerup",stop);fw.addEventListener("pointercancel",stop);
}

/* Page: CSS zoom on <main>, so sticky headers and bottom bars keep their size. */
function page(){
  if(document.querySelector(".ann-tb"))return;
  const root=document.querySelector("main");if(!root)return;
  const slot=document.querySelector("[data-zoom-page]");
  const box=document.createElement("span");
  box.className="zm-page"+(slot?"":" zm-corner");
  box.setAttribute("role","group");box.setAttribute("aria-label","Page zoom");
  let z=1;
  const pct=btn("100%","Reset page zoom",()=>set(1));
  function set(next){
    z=Math.round(clamp(next,0.5,2)*10)/10;
    root.style.zoom=z===1?"":String(z);
    pct.textContent=Math.round(z*100)+"%";
  }
  box.append(btn("−","Zoom page out",()=>set(z-0.1)),pct,btn("+","Zoom page in",()=>set(z+0.1)));
  (slot||document.body).append(box);
}

function init(){
  document.querySelectorAll(".fw").forEach(diagram);
  page();
}
// Run after the page's own scripts (and the annotation layer, when present).
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(init));
else setTimeout(init);
})();
