/* Zoom for generated pages. One copy lives in design-proposal/assets; review and write inline it.
   Diagrams (each .fw box):
   - zoom: - / % / + / Fit buttons, Ctrl or Cmd + wheel (plain wheel in full screen), trackpad or touch pinch,
     double-click on empty space (zooms in 2x there, again goes back), keys + - 0 F when focused. Clicking % resets.
   - pan: drag with the left or middle mouse button, one finger on touch, arrow keys when focused.
   - full screen: ⤢ fits the diagram to the screen, Esc leaves it.
   A short hint shows on hover. Clicks and double-clicks on links and focusable nodes inside a diagram keep working.
   Page: - / % / + in a [data-zoom-page] slot (fixed corner without one) zooms <main>.
   Skips the page control on design-proposal playground copies, where drawings are pinned to page coordinates. */
(function(){
"use strict";
const MIN=0.25,MAX=8,STEP=1.25,DRAG=4;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const touch=matchMedia("(pointer:coarse)").matches;
const css=document.createElement("style");
css.textContent=
".zm-tb{display:flex;align-items:center;width:max-content;max-width:100%;margin:0 0 4px auto;gap:2px;padding:2px;border:1px solid GrayText;border-radius:6px;background:Canvas;color:CanvasText}"+
".zm-tb button,.zm-page button{all:unset;box-sizing:border-box;cursor:pointer;min-width:28px;height:28px;padding:0 6px;border-radius:4px;text-align:center;font:600 13px/28px system-ui,sans-serif;font-variant-numeric:tabular-nums}"+
".zm-tb button:hover,.zm-page button:hover{background:rgba(127,127,127,.2)}"+
".zm-tb button:focus-visible,.zm-page button:focus-visible,.zm>.fw:focus-visible{outline:2px solid Highlight;outline-offset:1px}"+
".zm-hint{display:none;padding:0 8px;font:12px/28px system-ui,sans-serif;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
".zm:hover .zm-hint,.zm:focus-within .zm-hint,.zm.zm-full .zm-hint{display:block}"+
"@media (max-width:600px){.zm .zm-hint{display:none}}"+
".zm>.fw{touch-action:pan-x pan-y}"+
".zm>.fw.zm-on{overflow:auto;max-height:80vh}"+
".zm>.fw.zm-pan{cursor:grab}.zm>.fw.zm-drag{cursor:grabbing;user-select:none}"+
".zm.zm-full{position:fixed;inset:0;z-index:2147483000;margin:0;padding:44px 12px 12px;background:var(--bg,Canvas);display:flex;flex-direction:column}"+
".zm.zm-full>.fw{flex:1;min-height:0;max-height:none;overflow:auto;display:flex}"+
// Centred when smaller than the screen; auto margins (not justify-content) keep a bigger one scrollable to its edges.
".zm.zm-full>.fw>*{margin:auto;flex:none}"+
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
  const isFull=()=>fig.classList.contains("zm-full");
  const target=()=>fw.querySelector("svg")||fw.firstElementChild;
  const pct=btn("100%","Reset zoom",()=>set(1));
  const full=btn("⤢","Full screen",()=>toggleFull());
  const hint=document.createElement("span");
  hint.className="zm-hint";
  const tb=document.createElement("div");
  tb.className="zm-tb";tb.setAttribute("role","toolbar");tb.setAttribute("aria-label","Diagram zoom");
  tb.append(hint,btn("−","Zoom out",()=>set(scale/STEP)),pct,btn("+","Zoom in",()=>set(scale*STEP)),btn("Fit","Fit to view",()=>set(fit())),full);
  fig.insertBefore(tb,fw);
  showHint();

  function showHint(){
    hint.textContent=touch?"Pinch to zoom, drag to pan":isFull()?"Scroll to zoom, drag to pan, Esc to close":"Ctrl + scroll to zoom, drag to pan, double-click to zoom in";
  }
  // The box can pan when its content is bigger than it is.
  const sync=()=>fw.classList.toggle("zm-pan",fw.scrollWidth>fw.clientWidth+1||fw.scrollHeight>fw.clientHeight+1);
  // Box pixels per screen pixel (differs from 1 under page zoom).
  const ratio=()=>fw.clientWidth/(fw.getBoundingClientRect().width||1);

  function set(next,cx,cy){
    const t=target();if(!t)return;
    next=clamp(next,MIN,MAX);
    if(Math.abs(next-1)<0.01)next=1;
    if(next===scale)return;
    if(scale===1){base=parseFloat(getComputedStyle(t).width)||t.getBoundingClientRect().width;saved=t.getAttribute("style");}
    // Keep the point under the cursor (or the box centre) in place, in the box's own pixels.
    const r=fw.getBoundingClientRect(),k=ratio();
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
    sync();
  }
  // Scale at which the whole diagram fits the box (full screen) or the box's 80vh cap (inline).
  function fit(){
    const t=target();if(!t)return scale;
    const cs=getComputedStyle(t),fs=getComputedStyle(fw);
    const w=parseFloat(cs.width)/scale,h=parseFloat(cs.height)/scale;
    const aw=fw.clientWidth-parseFloat(fs.paddingLeft)-parseFloat(fs.paddingRight)-4;
    const ah=(isFull()?fw.clientHeight:innerHeight*0.8)-parseFloat(fs.paddingTop)-parseFloat(fs.paddingBottom)-4;
    const f=Math.min(aw/w,ah/h);
    return f>0&&isFinite(f)?f:scale;
  }
  const home=()=>isFull()?fit():1;
  function toggleFull(on=!isFull()){
    set(1);
    fig.classList.toggle("zm-full",on);
    document.documentElement.style.overflow=on?"hidden":"";
    full.textContent=on?"✕":"⤢";
    full.title=on?"Exit full screen":"Full screen";full.setAttribute("aria-label",full.title);
    showHint();
    if(on)set(fit());
    fw.focus({preventScroll:true});
  }
  // Links, buttons and focusable nodes inside the diagram keep their own clicks.
  // A target gone from the page was replaced by its own handler (a re-render), so it counts too.
  const own=el=>{if(!el.isConnected)return true;const i=el.closest&&el.closest("a,button,input,select,textarea,[role=button],[tabindex]");return !!i&&i!==fw&&fw.contains(i);};

  fw.addEventListener("wheel",e=>{
    if(!e.ctrlKey&&!e.metaKey&&!isFull())return;
    e.preventDefault();
    set(scale*Math.exp(-e.deltaY*(e.deltaMode===1?0.03:0.002)),e.clientX,e.clientY);
  },{passive:false});
  fw.addEventListener("keydown",e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||e.target!==fw&&own(e.target))return;
    if(e.key==="+"||e.key==="=")set(scale*STEP);
    else if(e.key==="-")set(scale/STEP);
    else if(e.key==="0")set(1);
    else if(e.key==="f"||e.key==="F")set(fit());
    else if(e.key==="Escape"&&isFull())toggleFull(false);
    else return;
    e.preventDefault();
  });
  fw.addEventListener("dblclick",e=>{
    if(own(e.target))return;
    const h=home();
    if(Math.abs(scale-h)<0.01)set(scale*2,e.clientX,e.clientY);else set(h);
    getSelection()?.removeAllRanges();
  });
  // Stop middle-click autoscroll and double-click word selection inside the diagram.
  fw.addEventListener("mousedown",e=>{
    if(e.button===1&&fw.classList.contains("zm-pan")||e.button===0&&e.detail>1&&!own(e.target))e.preventDefault();
  });
  fw.addEventListener("pointerenter",sync);

  // Left or middle drag pans. It starts after a few pixels, so a plain click still reaches what is under it.
  let drag=null;
  // The click that follows a drag is not a click: swallow it, once. The next press or key ends this
  // in case no click comes (released outside the window).
  const EAT=["click","auxclick"],END=["pointerdown","keydown"];
  const eat=ev=>{ev.stopPropagation();ev.preventDefault();uneat();};
  const uneat=()=>{EAT.forEach(t=>removeEventListener(t,eat,true));END.forEach(t=>removeEventListener(t,uneat,true));};
  fw.addEventListener("pointerdown",e=>{
    if(e.pointerType==="touch"||e.button!==0&&e.button!==1)return;
    sync();
    if(!fw.classList.contains("zm-pan"))return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,l:fw.scrollLeft,t:fw.scrollTop,on:false};
  });
  fw.addEventListener("pointermove",e=>{
    if(!drag||e.pointerId!==drag.id)return;
    if(!e.buttons){drag=null;return;}
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(!drag.on){
      if(Math.hypot(dx,dy)<DRAG)return;
      drag.on=true;
      fw.setPointerCapture(e.pointerId);fw.classList.add("zm-drag");
      getSelection()?.removeAllRanges();
    }
    const k=ratio();
    fw.scrollLeft=drag.l-dx*k;fw.scrollTop=drag.t-dy*k;
  });
  const stop=e=>{
    if(!drag||e.pointerId!==drag.id)return;
    if(drag.on){
      fw.classList.remove("zm-drag");
      EAT.forEach(t=>addEventListener(t,eat,true));END.forEach(t=>addEventListener(t,uneat,true));
    }
    drag=null;
  };
  fw.addEventListener("pointerup",stop);fw.addEventListener("pointercancel",stop);

  // Two-finger pinch zooms around the fingers and pans with them; one finger scrolls natively.
  let pinch=null;
  const two=t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2,d:Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY)});
  fw.addEventListener("touchstart",e=>{
    if(e.touches.length!==2)return;
    pinch={...two(e.touches),s:scale};e.preventDefault();
  },{passive:false});
  fw.addEventListener("touchmove",e=>{
    if(!pinch||e.touches.length!==2)return;
    e.preventDefault();
    const m=two(e.touches),k=ratio();
    set(pinch.s*m.d/(pinch.d||1),m.x,m.y);
    fw.scrollLeft-=(m.x-pinch.x)*k;fw.scrollTop-=(m.y-pinch.y)*k;
    pinch.x=m.x;pinch.y=m.y;
  },{passive:false});
  const unpinch=e=>{if(e.touches.length<2)pinch=null;};
  fw.addEventListener("touchend",unpinch);fw.addEventListener("touchcancel",unpinch);
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
