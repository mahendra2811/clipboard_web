"use strict";

/* ===================== storage keys ===================== */
const KEY = "snippet-launcher-v2";
const VIEW_KEY = "snippet-launcher-view";

/* Fallback seed — used when data.json can't be fetched (e.g. opened via file://). */
const FALLBACK_DATA = {
  categories:[
    {id:"c-ref",name:"LinkedIn referral"},
    {id:"c-email",name:"Application email"},
    {id:"c-follow",name:"Follow-up"},
    {id:"c-comment",name:"LinkedIn comment"},
  ],
  templates:[
    {id:"t1",cat:"c-ref",title:"Referral request — short",desc:"First cold DM asking for a referral",
      body:"Hi {name}, hope you're doing well! I noticed {company} is hiring for a {role} and saw you're on the team. I'm a frontend engineer (Next.js, React, TypeScript) with ~2 yrs of production experience. Would you be open to referring me? Happy to share my resume — thanks a lot either way!"},
    {id:"t2",cat:"c-ref",title:"Referral request — with resume",desc:"When they replied / you have their contact",
      body:"Thanks so much, {name}! Here's a quick summary: frontend SDE with ~2 yrs on Next.js, React, TypeScript and Shopify headless commerce, plus production observability (Sentry). I've attached my resume for the {role} role at {company}. Really appreciate you taking the time."},
    {id:"t3",cat:"c-email",title:"Cold application email",desc:"Direct to recruiter / hiring manager",
      body:"Subject: Frontend Engineer application — {role}\n\nHi {name},\n\nI'm reaching out about the {role} position at {company}. I'm a frontend engineer with ~2 years of experience shipping production apps with Next.js, React and TypeScript, including headless Shopify storefronts and Sentry-based observability.\n\nMy resume is attached. I'd love the chance to talk about how I can contribute to your team.\n\nBest,\nRaj"},
    {id:"t4",cat:"c-follow",title:"Follow-up — no reply",desc:"Gentle nudge ~4–5 days later",
      body:"Hi {name}, just floating this back to the top of your inbox in case it got buried. Still very interested in the {role} role at {company} — happy to share anything that would help. Thanks for your time!"},
    {id:"t5",cat:"c-comment",title:"\"Interested\" comment",desc:"Reply under a hiring post",
      body:"This looks like a great opportunity! I'm a frontend engineer (Next.js / React / TypeScript) actively looking and would love to be considered for the {role} role. Dropping a note here and will DM as well — thanks {name}!"},
  ],
};

/* ===================== runtime state ===================== */
let state = { categories:[], templates:[] };
let activeCat = "all";
let view = localStorage.getItem(VIEW_KEY) || "accordion";
let editingId = null;
let fillBody = "";
const expanded = new Set();   // open accordion items

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ===================== persistence ===================== */
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }
  catch(e){ toast("Couldn't save — storage may be full", true); } }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

async function boot(){
  const raw = localStorage.getItem(KEY);
  if(raw){
    try{ state = JSON.parse(raw); }catch(e){ state = clone(FALLBACK_DATA); }
  }else{
    try{
      const r = await fetch("data.json", {cache:"no-store"});
      state = r.ok ? await r.json() : clone(FALLBACK_DATA);
    }catch(e){ state = clone(FALLBACK_DATA); }
    save();
  }
  if(!Array.isArray(state.categories)) state.categories=[];
  if(!Array.isArray(state.templates)) state.templates=[];
  setView(view, true);
  render();
}
function clone(o){ return JSON.parse(JSON.stringify(o)); }

/* ===================== helpers ===================== */
function catName(id){ const c=state.categories.find(c=>c.id===id); return c?c.name:"Uncategorized"; }
function vars(body){
  const out=[]; const re=/\{([^}]+)\}/g; let m;
  while((m=re.exec(body))!==null){ const v=m[1].trim(); if(v&&!out.includes(v)) out.push(v); }
  return out;
}
function esc(s){ return (s||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
function getBody(id){ const t=state.templates.find(t=>t.id===id); return t?t.body:""; }
function hasVars(id){ return vars(getBody(id)).length>0; }

function filtered(){
  const q = $("#search").value.trim().toLowerCase();
  let list = state.templates;
  if(activeCat!=="all") list = list.filter(t=>t.cat===activeCat);
  if(q) list = list.filter(t => (t.title+" "+t.desc+" "+t.body+" "+catName(t.cat)).toLowerCase().includes(q));
  return list;
}

/* ===================== view switch ===================== */
function setView(v, silent){
  view = v; localStorage.setItem(VIEW_KEY, v);
  $$("#viewSeg button").forEach(b=>b.classList.toggle("active", b.dataset.view===v));
  if(!silent) render();
}

/* ===================== render: chips ===================== */
function renderChips(){
  const counts={}; state.templates.forEach(t=>counts[t.cat]=(counts[t.cat]||0)+1);
  let html = chip("all","All",state.templates.length);
  state.categories.forEach(c=> html += chip(c.id,c.name,counts[c.id]||0));
  html += `<button class="chip manage" id="manageCats" title="Add / rename / delete categories">✎ Edit</button>`;
  $("#chips").innerHTML = html;

  $$(".chip[data-id]").forEach(el=> el.onclick=()=>{ activeCat=el.dataset.id; render(); });
  $("#manageCats").onclick = openCatModal;
}
function chip(id,name,count){
  return `<button class="chip ${activeCat===id?"active":""}" data-id="${id}">
    ${esc(name)} <span class="c-count">${count}</span></button>`;
}

/* ===================== render: main ===================== */
function render(){
  renderChips();
  const list = filtered();
  const main = $("#main");
  if(list.length===0){ main.innerHTML = emptyHtml(); wireEmpty(); return; }
  if(view==="cards")      main.innerHTML = `<div class="grid">${list.map(cardHtml).join("")}</div>`;
  else if(view==="list")  main.innerHTML = `<div class="list">${list.map(listHtml).join("")}</div>`;
  else                    main.innerHTML = `<div class="acc-list">${list.map(accHtml).join("")}</div>`;
  wireRows();
}

function emptyHtml(){
  const q=$("#search").value.trim();
  const msg = q ? "No templates match your search." :
    "Write a message once, drop in <code>{name}</code> or <code>{company}</code> where it should change, and reuse it forever.";
  return `<div class="empty"><h2>${q?"Nothing found":"Nothing here yet"}</h2><p>${msg}</p>
    ${q?"":'<button class="btn primary" id="emptyNew">+ New template</button>'}</div>`;
}
function wireEmpty(){ const b=$("#emptyNew"); if(b) b.onclick=()=>openEditor(); }

/* card */
function cardHtml(t){
  const v=vars(t.body), hv=v.length>0;
  return `<div class="card">
    <span class="tag">${esc(catName(t.cat))}</span>
    <h3>${esc(t.title)}</h3>
    ${t.desc?`<div class="desc">${esc(t.desc)}</div>`:""}
    <div class="preview clamp">${esc(t.body)}</div>
    ${hv?`<div class="vars">${v.map(x=>`<span class="var-chip">${esc(x)}</span>`).join("")}</div>`:""}
    <div class="row-actions">
      <button class="btn primary" data-act="${hv?"fill":"copy"}" data-id="${t.id}">${hv?"Customize &amp; copy":"Copy"}</button>
      ${hv?`<button class="btn mini" title="Copy raw template" data-act="copy" data-id="${t.id}">⧉</button>`:""}
      <button class="btn mini" title="Edit" data-act="edit" data-id="${t.id}">✎</button>
    </div>
  </div>`;
}

/* accordion */
function accHtml(t){
  const v=vars(t.body), hv=v.length>0, open=expanded.has(t.id);
  return `<div class="acc ${open?"open":""}" data-id="${t.id}">
    <div class="acc-head" data-act="toggle" data-id="${t.id}">
      <div class="acc-main">
        <span class="acc-cat">${esc(catName(t.cat))}</span>
        <div class="acc-title"><span class="ttl">${esc(t.title)}</span></div>
      </div>
      <div class="acc-tools">
        <button class="acc-quick" data-act="${hv?"fill":"copy"}" data-id="${t.id}">${hv?"Customize":"Copy"}</button>
        <span class="chev">▾</span>
      </div>
    </div>
    <div class="acc-body">
      ${t.desc?`<div class="desc">${esc(t.desc)}</div>`:""}
      <div class="preview">${esc(t.body)}</div>
      ${hv?`<div class="vars" style="margin-top:10px">${v.map(x=>`<span class="var-chip">${esc(x)}</span>`).join("")}</div>`:""}
      <div class="row-actions" style="margin-top:11px">
        <button class="btn primary" data-act="${hv?"fill":"copy"}" data-id="${t.id}">${hv?"Customize &amp; copy":"Copy"}</button>
        ${hv?`<button class="btn mini" title="Copy raw" data-act="copy" data-id="${t.id}">⧉</button>`:""}
        <button class="btn mini" title="Edit" data-act="edit" data-id="${t.id}">✎</button>
      </div>
    </div>
  </div>`;
}

/* list */
function listHtml(t){
  const hv=hasVars(t.id);
  return `<div class="li">
    <div class="li-main" data-act="${hv?"fill":"copy"}" data-id="${t.id}">
      <div class="li-title">${esc(t.title)}</div>
      <div class="li-sub"><b>${esc(catName(t.cat))}</b> · ${esc(t.desc||t.body)}</div>
    </div>
    <div class="li-tools">
      <button class="iconbtn go" title="${hv?"Customize & copy":"Copy"}" data-act="${hv?"fill":"copy"}" data-id="${t.id}">${hv?"✎":"⧉"}</button>
      <button class="iconbtn" title="Edit" data-act="edit" data-id="${t.id}">⚙</button>
    </div>
  </div>`;
}

/* one delegated handler for every row action */
function wireRows(){
  $("#main").querySelectorAll("[data-act]").forEach(el=>{
    el.onclick = e=>{
      e.stopPropagation();
      const {act,id} = el.dataset;
      if(act==="toggle"){ expanded.has(id)?expanded.delete(id):expanded.add(id); render(); }
      else if(act==="copy"){ copyText(getBody(id)); }
      else if(act==="fill"){ openFill(id); }
      else if(act==="edit"){ openEditor(id); }
    };
  });
}

/* ===================== editor (slide-over) ===================== */
function openEditor(id){
  editingId = id||null;
  const sel=$("#f_cat");
  sel.innerHTML = state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  if(id){
    const t=state.templates.find(t=>t.id===id);
    $("#editorTitle").textContent="Edit template";
    sel.value=t.cat; $("#f_title").value=t.title; $("#f_desc").value=t.desc||""; $("#f_body").value=t.body;
    $("#deleteTplBtn").hidden=false;
  }else{
    $("#editorTitle").textContent="New template";
    if(activeCat!=="all") sel.value=activeCat;
    $("#f_title").value=""; $("#f_desc").value=""; $("#f_body").value="";
    $("#deleteTplBtn").hidden=true;
  }
  refreshDetected();
  $("#editor").classList.add("show"); $("#editor").setAttribute("aria-hidden","false");
  $("#editorBackdrop").classList.add("show");
  setTimeout(()=>$("#f_title").focus(),60);
}
function closeEditor(){
  $("#editor").classList.remove("show"); $("#editor").setAttribute("aria-hidden","true");
  $("#editorBackdrop").classList.remove("show");
}
function refreshDetected(){
  const v=vars($("#f_body").value);
  $("#detected").innerHTML = v.length
    ? `<span style="font-size:11px;color:var(--faint);margin-right:4px;align-self:center">Variables:</span>`
      + v.map(x=>`<span class="var-chip">${esc(x)}</span>`).join("")
    : "";
}
function saveTemplate(){
  const title=$("#f_title").value.trim(), body=$("#f_body").value;
  if(!title){ toast("Add a title first",true); $("#f_title").focus(); return; }
  if(!body.trim()){ toast("The message is empty",true); $("#f_body").focus(); return; }
  const data={cat:$("#f_cat").value,title,desc:$("#f_desc").value.trim(),body};
  if(editingId) Object.assign(state.templates.find(t=>t.id===editingId),data);
  else state.templates.unshift({id:uid(),...data});
  save(); render(); closeEditor(); toast(editingId?"Template updated":"Template added");
}
function deleteTemplate(){
  if(editingId && confirm("Delete this template?")){
    state.templates=state.templates.filter(t=>t.id!==editingId);
    save(); render(); closeEditor(); toast("Template deleted");
  }
}

/* ===================== customize / fill ===================== */
function openFill(id){
  const t=state.templates.find(t=>t.id===id); if(!t) return;
  fillBody=t.body;
  $("#fillTitle").textContent=t.title;
  $("#varGrid").innerHTML = vars(fillBody).map(name=>`
    <div class="var-row"><label>${esc(name)}</label>
      <input data-var="${esc(name)}" placeholder="Enter ${esc(name)}" autocomplete="off"></div>`).join("");
  $$("#varGrid input").forEach(inp=> inp.oninput=updatePreview);
  updatePreview();
  $("#fillOverlay").classList.add("show");
  setTimeout(()=>{const f=$("#varGrid input"); if(f) f.focus();},60);
}
function fillValues(){
  const map={}; $$("#varGrid input").forEach(i=>map[i.dataset.var]=i.value); return map;
}
function buildFilled(map, html){
  return fillBody.replace(/\{([^}]+)\}/g,(full,raw)=>{
    const k=raw.trim(), val=map[k];
    if(val&&val.length) return html?`<span class="fill">${esc(val)}</span>`:val;
    return html?`<span class="miss">{${esc(k)}}</span>`:full;
  });
}
function updatePreview(){ $("#fillPreview").innerHTML = buildFilled(fillValues(), true); }

/* ===================== categories ===================== */
function openCatModal(){ renderCatRows(); $("#newCatInput").value=""; $("#catOverlay").classList.add("show"); }
function renderCatRows(){
  const counts={}; state.templates.forEach(t=>counts[t.cat]=(counts[t.cat]||0)+1);
  $("#catRows").innerHTML = state.categories.map(c=>`
    <div class="cat-row" data-id="${c.id}">
      <input value="${esc(c.name)}" data-id="${c.id}">
      <button class="del" data-id="${c.id}" title="Delete (${counts[c.id]||0} templates)">🗑</button>
    </div>`).join("");
  // live rename
  $$("#catRows .cat-row input").forEach(inp=>{
    inp.onchange=()=>{ const c=state.categories.find(c=>c.id===inp.dataset.id);
      if(c){ c.name=inp.value.trim()||c.name; inp.value=c.name; save(); renderChips(); } };
  });
  // delete
  $$("#catRows .del").forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.dataset.id, used=state.templates.filter(t=>t.cat===id).length;
      if(state.categories.length<=1){ toast("Keep at least one category",true); return; }
      if(used>0 && !confirm(`${used} template(s) use this category. Delete it? They'll move to "${state.categories.find(c=>c.id!==id).name}".`)) return;
      state.categories=state.categories.filter(c=>c.id!==id);
      const fb=state.categories[0].id;
      state.templates.forEach(t=>{ if(t.cat===id) t.cat=fb; });
      if(activeCat===id) activeCat="all";
      save(); renderCatRows(); render();
    };
  });
}
function addCategory(){
  const name=$("#newCatInput").value.trim();
  if(!name){ $("#newCatInput").focus(); return; }
  state.categories.push({id:uid(),name});
  save(); $("#newCatInput").value=""; renderCatRows(); renderChips();
  toast("Category added"); $("#newCatInput").focus();
}

/* ===================== export / import ===================== */
function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`snippets-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(a.href); toast("Backup downloaded");
}
function importData(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      if(!Array.isArray(data.categories)||!Array.isArray(data.templates)) throw 0;
      const replace=confirm("OK = REPLACE everything with this backup.\nCancel = MERGE it into what you have now.");
      if(replace){ state=data; }
      else{
        const haveC=new Set(state.categories.map(c=>c.id));
        data.categories.forEach(c=>{ if(!haveC.has(c.id)) state.categories.push(c); });
        const haveT=new Set(state.templates.map(t=>t.id));
        data.templates.forEach(t=>{ if(!haveT.has(t.id)) state.templates.push(t); });
      }
      save(); render(); toast(replace?"Backup restored":"Backup merged");
    }catch(err){ toast("That file isn't a valid backup",true); }
    e.target.value="";
  };
  reader.readAsText(file);
}

/* ===================== clipboard + toast ===================== */
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); }
  catch(e){
    const ta=document.createElement("textarea"); ta.value=text;
    ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta);
    ta.select(); try{document.execCommand("copy");}catch(_){} ta.remove();
  }
  toast("Copied to clipboard");
}
let toastTimer;
function toast(msg,bad){
  const t=$("#toast");
  t.textContent=(bad?"⚠ ":"✓ ")+msg;
  t.style.background=bad?"var(--danger)":"var(--ok)";
  t.style.color=bad?"#fff":"#04130c";
  t.classList.add("show"); clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("show"),1700);
}

/* ===================== wiring ===================== */
$("#viewSeg").addEventListener("click",e=>{ const b=e.target.closest("button"); if(b) setView(b.dataset.view); });
$("#newTplBtn").onclick=()=>openEditor();
$("#saveTplBtn").onclick=saveTemplate;
$("#deleteTplBtn").onclick=deleteTemplate;
$("#f_body").addEventListener("input",refreshDetected);
$("#fillCopyBtn").onclick=()=>{ copyText(buildFilled(fillValues(),false)); $("#fillOverlay").classList.remove("show"); };
$("#exportBtn").onclick=exportData;
$("#importBtn").onclick=()=>$("#importFile").click();
$("#importFile").onchange=importData;
$("#addCatBtn").onclick=addCategory;
$("#newCatInput").addEventListener("keydown",e=>{ if(e.key==="Enter") addCategory(); });

const search=$("#search");
search.addEventListener("input",()=>{ $("#searchClear").hidden=!search.value; render(); });
$("#searchClear").onclick=()=>{ search.value=""; $("#searchClear").hidden=true; render(); search.focus(); };

$("#editorBackdrop").onclick=closeEditor;
$$("[data-close='editor']").forEach(b=>b.onclick=closeEditor);
$$("[data-close-overlay]").forEach(b=>b.onclick=()=>$("#"+b.dataset.closeOverlay).classList.remove("show"));
$$(".overlay").forEach(o=>o.addEventListener("click",e=>{ if(e.target===o) o.classList.remove("show"); }));
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){
    $$(".overlay.show").forEach(o=>o.classList.remove("show"));
    if($("#editor").classList.contains("show")) closeEditor();
  }
});

boot();
