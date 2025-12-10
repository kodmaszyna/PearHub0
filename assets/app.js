// assets/app.js
// Minimal SPA logic: tabbed search + sandboxed console.
// Uses Google for searches by opening a new tab with q= query.
// Tabs persist in localStorage.

const STORAGE_KEY = "quickhub.tabs.v1";

const el = id => document.getElementById(id);
const tabsEl = el("tabs");
const tabContentEl = el("tabContent");
const addTabBtn = el("addTabBtn");
const btnSearch = el("btnSearch");
const btnConsole = el("btnConsole");
const searchArea = el("searchArea");
const consoleArea = el("consoleArea");

// Console elements
const consoleInput = el("consoleInput");
const consoleRun = el("consoleRun");
const consoleClear = el("consoleClear");
const consoleOutput = el("consoleOutput");

// App state
let tabs = [];
let activeId = null;

// Utilities
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({tabs, activeId})); } catch(e){}
}
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (v && Array.isArray(v.tabs)) { tabs = v.tabs; activeId = v.activeId || (tabs[0] && tabs[0].id); return; }
  } catch(e){}
  // fallback: create one tab
  tabs = [{id: uid(), title: "New Tab", q: ""}];
  activeId = tabs[0].id;
}
function uid(){ return Math.random().toString(36).slice(2,10); }

// Render
function renderTabs() {
  tabsEl.innerHTML = "";
  tabs.forEach(t => {
    const btn = document.createElement("button");
    btn.className = "tab" + (t.id === activeId ? " active" : "");
    btn.title = t.title || "Tab";
    btn.textContent = t.title || "Tab";
    btn.addEventListener("click", () => selectTab(t.id));

    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "✕";
    close.title = "Close tab";
    close.addEventListener("click", (ev) => {
      ev.stopPropagation();
      closeTab(t.id);
    });
    btn.appendChild(close);
    tabsEl.appendChild(btn);
  });
}

function renderActiveTabContent() {
  const t = tabs.find(x => x.id === activeId);
  if (!t) { tabContentEl.innerHTML = "<div class='hint'>No tab</div>"; return; }
  tabContentEl.innerHTML = `
    <div class="search-row">
      <input id="tabSearchInput" type="search" placeholder="Search Google or press Enter" value="${escapeHtml(t.q)}" />
      <button id="tabSearchBtn">Search</button>
    </div>
    <div class="tab-actions">
      <button id="openResultsBtn">Open Results (Google)</button>
      <span class="muted" style="margin-left:8px">Tab: ${escapeHtml(t.title)}</span>
      <button id="renameTabBtn">Rename</button>
    </div>
  `;

  const input = el("tabSearchInput");
  const searchBtn = el("tabSearchBtn");
  const openResultsBtn = el("openResultsBtn");
  const renameTabBtn = el("renameTabBtn");

  input.addEventListener("input", (e) => {
    t.q = e.target.value;
    // live update title to first 24 chars when typing
    t.title = t.q ? (t.q.length > 24 ? t.q.slice(0,24) + "…" : t.q) : "New Tab";
    renderTabs();
    save();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") performSearch(t.q);
  });

  searchBtn.addEventListener("click", () => performSearch(t.q));
  openResultsBtn.addEventListener("click", () => openGoogle(t.q));
  renameTabBtn.addEventListener("click", () => {
    const name = prompt("Rename tab", t.title || "");
    if (name !== null) {
      t.title = name || "New Tab";
      renderTabs();
      renderActiveTabContent();
      save();
    }
  });
}

function escapeHtml(s){
  if (!s) return "";
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Tab operations
function addTab() {
  const t = {id: uid(), title: "New Tab", q: ""};
  tabs.push(t);
  activeId = t.id;
  renderTabs();
  renderActiveTabContent();
  save();
}
function selectTab(id){
  if (!tabs.find(t=>t.id===id)) return;
  activeId = id;
  renderTabs();
  renderActiveTabContent();
  save();
}
function closeTab(id){
  const idx = tabs.findIndex(t=>t.id===id);
  if(idx === -1) return;
  tabs.splice(idx,1);
  if (activeId === id) {
    activeId = tabs[idx] ? tabs[idx].id : (tabs[0] ? tabs[0].id : null);
  }
  if (tabs.length === 0) addTab();
  renderTabs();
  renderActiveTabContent();
  save();
}

// Search actions
function performSearch(q){
  if (!q || !q.trim()) { alert("Enter a search query."); return; }
  // open a Google search in a new tab
  openGoogle(q);
}
function openGoogle(q){
  const u = new URL("https://www.google.com/search");
  if (q && q.trim()) u.searchParams.set("q", q.trim());
  window.open(u.toString(), "_blank");
}

// Console implementation (sandboxed iframe)
let sandboxFrame = null;
let sandboxReady = false;

function setupSandbox() {
  if (sandboxFrame) return;
  sandboxFrame = document.createElement("iframe");
  sandboxFrame.style.display = "none";
  sandboxFrame.sandbox = "allow-scripts";
  const srcdoc = `
  <!doctype html><html><head><meta charset="utf-8"></head><body>
  <script>
  (function(){
    function send(type, payload){ parent.postMessage({type:type,payload:payload},"*"); }
    const realConsole = console;
    console = {
      log: function(){ send('log', Array.from(arguments).map(a=>{try{return JSON.stringify(a)}catch(e){return String(a)}}).join(' ')); if(realConsole && realConsole.log) realConsole.log.apply(realConsole,arguments); },
      info: function(){ send('log', Array.from(arguments).join(' ')); },
      warn: function(){ send('warn', Array.from(arguments).join(' ')); },
      error: function(){ send('error', Array.from(arguments).join(' ')); }
    };
    window.addEventListener('message', async function(ev){
      if(!ev.data || ev.data.type !== 'runCode') return;
      const id = ev.data.id;
      try{
        const result = await (0, eval)('(async function(){' + ev.data.code + '})();');
        send('result', {id:id, ok:true, value: result});
      }catch(err){
        send('result', {id:id, ok:false, error: String(err)});
      }
    }, false);
    send('ready', {msg:'sandbox ready'});
  })();
  <\/script>
  </body></html>
  `;
  sandboxFrame.srcdoc = srcdoc;
  document.body.appendChild(sandboxFrame);
  window.addEventListener("message", onSandboxMessage);
}

function onSandboxMessage(ev) {
  if (!ev.data || !ev.data.type) return;
  const {type, payload} = ev.data;
  if (type === "ready") {
    sandboxReady = true;
    appendConsoleOutput("[sandbox] ready", "info");
  } else if (type === "log") appendConsoleOutput(payload, "log");
  else if (type === "warn") appendConsoleOutput(payload, "warn");
  else if (type === "error") appendConsoleOutput(payload, "error");
  else if (type === "result") {
    if (payload.ok) appendConsoleOutput("[result] " + safeStringify(payload.value), "info");
    else appendConsoleOutput("[error] " + payload.error, "error");
  }
}

function runCode(code) {
  setupSandbox();
  if (!sandboxReady) {
    appendConsoleOutput("[sandbox] initializing — try again in a moment", "info");
    setTimeout(()=> runCode(code), 200);
    return;
  }
  sandboxFrame.contentWindow.postMessage({type:'runCode', code: code, id: Date.now()}, "*");
}

function appendConsoleOutput(msg, kind="info") {
  const d = document.createElement("div");
  d.className = "out-" + (kind || "info");
  d.textContent = msg;
  consoleOutput.appendChild(d);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}
function safeStringify(v){ try{return JSON.stringify(v)}catch(e){return String(v)} }

// Hook UI + events
addTabBtn.addEventListener("click", addTab);
btnSearch.addEventListener("click", () => {
  btnSearch.classList.add("active"); btnConsole.classList.remove("active");
  searchArea.classList.remove("hidden"); consoleArea.classList.add("hidden");
});
btnConsole.addEventListener("click", () => {
  btnConsole.classList.add("active"); btnSearch.classList.remove("active");
  consoleArea.classList.remove("hidden"); searchArea.classList.add("hidden");
});

// Console events
consoleRun.addEventListener("click", () => {
  const code = consoleInput.value;
  if(!code.trim()){ appendConsoleOutput("[info] nothing to run", "info"); return; }
  appendConsoleOutput("> " + code, "info");
  runCode(code);
});
consoleClear.addEventListener("click", () => consoleOutput.innerHTML = "");

// Initialization
function init() {
  load();
  renderTabs();
  renderActiveTabContent();
  setupSandbox();
  appendConsoleOutput("[info] QuickHub loaded — sandbox initializing...", "info");

  // Support loading with ?q= in URL (for bookmarklet)
  try {
    const pp = new URLSearchParams(location.search);
    const q = pp.get("q");
    if (q) {
      // open in current active tab
      const t = tabs.find(x => x.id === activeId) || tabs[0];
      if (t) { t.q = q; t.title = q.length > 24 ? q.slice(0,24)+"…" : q; renderTabs(); renderActiveTabContent(); save(); }
    }
  } catch(e){}
}
init();
