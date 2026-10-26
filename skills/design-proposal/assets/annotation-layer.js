/* Annotation layer for design-proposal playground copies.
   Draws on top of each .page section (or <main> when the page has no tabs).
   Drawings and notes are kept in the viewer's browser only. */
(function(){
"use strict";
const $=(q,r=document)=>r.querySelector(q), $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const NS="http://www.w3.org/2000/svg";
const KEY="design-proposal-annotations:"+location.pathname+":"+document.title;
const COLORS={orange:"#FF7A2F",blue:"#4397D2",red:"#E5312B",green:"#1FA36B",ink:"var(--ink, #1D2433)"};
const SWATCH_ORDER=["orange","blue","red","green","ink"];
const PEN={pen:{w:3,o:1},marker:{w:18,o:0.32},laser:{w:5,o:0.9}};
const TOOL_KEYS={v:"pointer",p:"pen",h:"marker",t:"text",n:"note",e:"eraser",l:"laser"};
let tool="pointer", color="orange", saveTimer=null;
const history=[];

const bar=document.createElement("div");
bar.className="ann-tb";bar.setAttribute("role","toolbar");bar.setAttribute("aria-label","Drawing tools");
bar.innerHTML=
  [["pointer","Pointer","V"],["pen","Pen","P"],["marker","Marker","H"],["text","Text","T"],["note","Sticky","N"],["eraser","Eraser","E"],["laser","Laser","L"]]
    .map(([t,l,k])=>`<button type="button" data-tool="${t}">${l} <kbd>${k}</kbd></button>`).join("")+
  '<span class="sep"></span>'+
  SWATCH_ORDER.map((c,i)=>`<button type="button" class="sw" data-color="${c}" aria-label="${c} (${i+1})"><i style="background:${c==="ink"?"var(--ann-on-bar)":COLORS[c]}"></i></button>`).join("")+
  '<span class="sep"></span>'+
  '<button type="button" data-act="undo">Undo <kbd>Ctrl Z</kbd></button>'+
  '<button type="button" data-act="clear">Clear page</button>'+
  '<button type="button" data-act="hide">Hide <kbd>A</kbd></button>'+
  '<button type="button" data-act="full">Full screen <kbd>F</kbd></button>';
document.body.append(bar);

let pages=$$(".page");
if(!pages.length){const root=$("main")||document.body;root.classList.add("ann-root");if(!root.id)root.id="ann-root";pages=[root];}
let data={};
try{data=JSON.parse(localStorage.getItem(KEY)||"{}")||{};}catch(e){data={};}

const layers={};
pages.forEach(pg=>{
  const svg=document.createElementNS(NS,"svg");
  svg.setAttribute("class","ann");svg.setAttribute("aria-hidden","true");
  pg.append(svg);
  layers[pg.id]={pg,svg};
  const size=()=>{svg.style.height=pg.offsetHeight+"px";};
  if(window.ResizeObserver)new ResizeObserver(size).observe(pg);
  size();
  const d=data[pg.id]||{};
  (d.strokes||[]).forEach(st=>svg.append(makePath(st)));
  (d.notes||[]).forEach(n=>pg.append(makeNote(n)));
  wireLayer(pg,svg);
});

function currentPage(){return pages.find(p=>!p.hidden)||pages[0];}
function makePath(st){
  const p=document.createElementNS(NS,"path");
  p.setAttribute("d",st.d);p.dataset.c=st.c;p.dataset.w=st.w;p.dataset.o=st.o;
  p.setAttribute("stroke",COLORS[st.c]||COLORS.orange);p.setAttribute("stroke-width",st.w);p.setAttribute("stroke-opacity",st.o);
  return p;
}
function makeNote(n){
  const el=document.createElement("div");
  el.className="ann-note"+(n.s?" sticky":"");
  el.dataset.c=n.c;el.style.left=n.x+"px";el.style.top=n.y+"px";
  if(!n.s)el.style.color=COLORS[n.c]||COLORS.orange;
  el.textContent=n.t||"";
  el.contentEditable=(tool==="text"||tool==="note")?"true":"false";
  el.spellcheck=false;
  wireNote(el);
  return el;
}
function save(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    const out={};
    for(const id in layers){
      const {pg,svg}=layers[id];
      out[id]={
        strokes:$$("path:not(.laser)",svg).map(p=>({d:p.getAttribute("d"),c:p.dataset.c,w:+p.dataset.w,o:+p.dataset.o})),
        notes:$$(":scope > .ann-note",pg).filter(n=>n.textContent.trim()).map(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top),t:n.textContent,c:n.dataset.c,s:n.classList.contains("sticky")}))
      };
    }
    try{localStorage.setItem(KEY,JSON.stringify(out));}catch(e){}
  },250);
}
function removeEl(el){
  if(!el||!el.parentNode)return;
  history.push({type:"remove",el,parent:el.parentNode,next:el.nextSibling});
  el.remove();save();
}
function setTool(t){
  tool=t;document.body.dataset.tool=t;
  $$("[data-tool]",bar).forEach(b=>b.setAttribute("aria-pressed",b.dataset.tool===t));
  const edit=(t==="text"||t==="note");
  $$(".ann-note").forEach(n=>{n.contentEditable=edit?"true":"false";});
  if(!edit&&document.activeElement&&document.activeElement.classList.contains("ann-note"))document.activeElement.blur();
}
function setColor(c){
  color=c;$$("[data-color]",bar).forEach(b=>b.setAttribute("aria-pressed",b.dataset.color===c));
}

function localPoint(svg,e){const r=svg.getBoundingClientRect();return [Math.round((e.clientX-r.left)*10)/10,Math.round((e.clientY-r.top)*10)/10];}
let drawing=null, erasing=false;
function wireLayer(pg,svg){
  svg.addEventListener("pointerdown",e=>{
    if(e.button!==0)return;
    if(tool in PEN){
      e.preventDefault();svg.setPointerCapture(e.pointerId);
      const [x,y]=localPoint(svg,e);
      const c=tool==="laser"?"red":color, cfg=PEN[tool];
      const p=makePath({d:`M${x},${y} L${x},${y}`,c,w:cfg.w,o:cfg.o});
      if(tool==="laser")p.classList.add("laser");
      svg.append(p);drawing={p,svg,d:`M${x},${y}`};
    }else if(tool==="eraser"){
      erasing=true;eraseAt(e);
    }else if(tool==="text"||tool==="note"){
      e.preventDefault();
      const [x,y]=localPoint(svg,e);
      const el=makeNote({x:x-4,y:y-14,t:"",c:color,s:tool==="note"});
      pg.append(el);history.push({type:"add",el});
      setTimeout(()=>el.focus(),0);
    }
  });
  svg.addEventListener("pointermove",e=>{
    if(drawing&&drawing.svg===svg){
      const [x,y]=localPoint(svg,e);drawing.d+=` L${x},${y}`;drawing.p.setAttribute("d",drawing.d);
    }else if(erasing)eraseAt(e);
  });
  const end=()=>{
    if(drawing&&drawing.svg===svg){
      const p=drawing.p;drawing=null;
      if(p.classList.contains("laser")){p.style.opacity="0";setTimeout(()=>p.remove(),950);}
      else{history.push({type:"add",el:p});save();}
    }
    erasing=false;
  };
  svg.addEventListener("pointerup",end);svg.addEventListener("pointercancel",end);
}
function eraseAt(e){
  const el=document.elementFromPoint(e.clientX,e.clientY);
  if(el&&el.tagName==="path"&&el.closest("svg.ann"))removeEl(el);
}
function wireNote(el){
  el.addEventListener("pointerdown",e=>{
    if(tool==="eraser"){e.preventDefault();removeEl(el);return;}
    if(tool!=="pointer")return;
    e.preventDefault();el.setPointerCapture(e.pointerId);
    const sx=e.clientX,sy=e.clientY,ox=parseFloat(el.style.left),oy=parseFloat(el.style.top);
    const move=ev=>{el.style.left=(ox+ev.clientX-sx)+"px";el.style.top=(oy+ev.clientY-sy)+"px";};
    const up=()=>{el.removeEventListener("pointermove",move);el.removeEventListener("pointerup",up);save();};
    el.addEventListener("pointermove",move);el.addEventListener("pointerup",up);
  });
  el.addEventListener("input",save);
  el.addEventListener("blur",()=>{if(!el.textContent.trim())el.remove();save();});
}

function undo(){
  const h=history.pop();if(!h)return;
  if(h.type==="add")h.el.remove();
  else if(h.type==="remove")h.parent.insertBefore(h.el,h.next&&h.next.parentNode===h.parent?h.next:null);
  else if(h.type==="clear")h.els.forEach(([el,parent])=>parent.append(el));
  save();
}
let clearArmed=null;
function clearPage(b){
  if(!clearArmed){
    b.textContent="Click again to clear";b.classList.add("warn");
    clearArmed=setTimeout(()=>{clearArmed=null;b.textContent="Clear page";b.classList.remove("warn");},3000);
    return;
  }
  clearTimeout(clearArmed);clearArmed=null;b.textContent="Clear page";b.classList.remove("warn");
  const {pg,svg}=layers[currentPage().id];
  const els=[...$$("path",svg).map(p=>[p,svg]),...$$(":scope > .ann-note",pg).map(n=>[n,pg])];
  if(!els.length)return;
  els.forEach(([el])=>el.remove());history.push({type:"clear",els});save();
}
function toggleHide(){const on=document.body.classList.toggle("ann-hidden");$('[data-act="hide"]',bar).setAttribute("aria-pressed",on);}
function fullscreen(){
  try{
    const r=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
    if(r&&r.catch)r.catch(()=>{});
  }catch(e){}
}
function go(step){
  if(pages.length<2)return;
  const i=pages.indexOf(currentPage()), n=pages[(i+step+pages.length)%pages.length];
  location.hash=n.id;
}

$$("[data-tool]",bar).forEach(b=>b.addEventListener("click",()=>setTool(b.dataset.tool)));
$$("[data-color]",bar).forEach(b=>b.addEventListener("click",()=>setColor(b.dataset.color)));
$('[data-act="undo"]',bar).addEventListener("click",undo);
$('[data-act="clear"]',bar).addEventListener("click",e=>clearPage(e.currentTarget));
$('[data-act="hide"]',bar).addEventListener("click",toggleHide);
$('[data-act="full"]',bar).addEventListener("click",fullscreen);

document.addEventListener("keydown",e=>{
  const t=e.target;
  if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))){
    if(e.key==="Escape")t.blur();
    return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();undo();return;}
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key.toLowerCase();
  if(TOOL_KEYS[k]){setTool(TOOL_KEYS[k]);return;}
  if(k>="1"&&k<="5"){setColor(SWATCH_ORDER[+k-1]);return;}
  if(k==="a"){toggleHide();return;}
  if(k==="f"){fullscreen();return;}
  if(e.key==="Escape"){setTool("pointer");return;}
  if(e.key==="ArrowRight"||e.key==="PageDown"){e.preventDefault();go(1);return;}
  if(e.key==="ArrowLeft"||e.key==="PageUp"){e.preventDefault();go(-1);}
});
setTool("pointer");setColor("orange");
})();
