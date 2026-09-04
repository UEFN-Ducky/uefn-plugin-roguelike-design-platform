
/* ======================================================================
   Roguelike Game Design Platform — panel UI (js/rgd/*.js, loaded as one scope).
   The project store is the only source of truth: this panel reads and writes it
   over the plugin bridge (rgdRpc), the same store the rgd_* MCP tools use, so the
   panel and the AI never hold competing copies. Outside the app, where the bridge
   does not answer, the panel stays read-only and says so.
   ====================================================================== */
const RGD = (() => {
  let projectKey = '_no_project';
  const WORLD_STEP = 512;

  const GRID_MAX = 100000;
  const DENSE_MAX_CELLS = 16384;
  let view = { zoom:1, panX:0, panY:0, baseCell:26, fitted:false };
  function isSparseGrid(g){ return g && typeof g==='object' && !Array.isArray(g) && !!g._sparse; }
  function emptyCell(){ return {terrain:'empty', entity:null}; }
  function cellKey(x,y){ return x+','+y; }
  function getCell(lvl,x,y){
    const g=lvl.grid;
    if(isSparseGrid(g)){ const c=(g.cells||{})[cellKey(x,y)]; return c?{terrain:c.terrain||'empty',entity:c.entity||null}:emptyCell(); }
    if(Array.isArray(g) && g[y] && g[y][x]) return g[y][x];
    return emptyCell();
  }
  function setCell(lvl,x,y,cell){
    const terr=(cell&&cell.terrain)||'empty'; const ent=cell&&cell.entity?cell.entity:null;
    let g=lvl.grid;
    if(isSparseGrid(g)){
      g.cells=g.cells||{}; const k=cellKey(x,y);
      if(terr==='empty'&&!ent) delete g.cells[k]; else g.cells[k]={terrain:terr,entity:ent};
      return;
    }
    if(Array.isArray(g) && g[y] && g[y][x]!==undefined){ g[y][x]={terrain:terr,entity:ent}; }
  }
  function iterPainted(lvl){
    const out=[]; const g=lvl.grid; const w=lvl.w|0, h=lvl.h|0;
    if(isSparseGrid(g)){
      Object.keys(g.cells||{}).forEach(k=>{
        const p=k.split(','); const x=+p[0], y=+p[1]; const c=g.cells[k];
        if(x>=0&&y>=0&&x<w&&y<h&&c&&((c.terrain&&c.terrain!=='empty')||c.entity)) out.push([x,y,c]);
      });
      return out;
    }
    if(Array.isArray(g)){
      for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const c=g[y]&&g[y][x]; if(c&&((c.terrain&&c.terrain!=='empty')||c.entity)) out.push([x,y,c]); }
    }
    return out;
  }
  function makeGrid(w,h,old){
    w=clamp(w|0,4,GRID_MAX); h=clamp(h|0,4,GRID_MAX);
    const useSparse=(w*h)>DENSE_MAX_CELLS;
    const cells={};
    if(isSparseGrid(old)){
      Object.keys(old.cells||{}).forEach(k=>{
        const p=k.split(','); const x=+p[0], y=+p[1]; const c=old.cells[k];
        if(x>=0&&y>=0&&x<w&&y<h&&c&&((c.terrain&&c.terrain!=='empty')||c.entity)) cells[cellKey(x,y)]={terrain:c.terrain||'empty',entity:c.entity||null};
      });
    } else if(Array.isArray(old)){
      for(let y=0;y<Math.min(h,old.length);y++) for(let x=0;x<Math.min(w,(old[y]||[]).length);x++){
        const c=old[y][x]; if(c&&((c.terrain&&c.terrain!=='empty')||c.entity)) cells[cellKey(x,y)]={terrain:c.terrain||'empty',entity:c.entity||null};
      }
    }
    if(useSparse) return {_sparse:true, cells};
    const g=[]; for(let y=0;y<h;y++){ const row=[]; for(let x=0;x<w;x++){ const k=cellKey(x,y); row.push(cells[k]?{...cells[k]}:emptyCell()); } g.push(row);} return g;
  }

  const NAV = [
    { id:'dashboard', label:'Dashboard',       icon:'layout-dashboard' },
    { id:'levels',    label:'Levels',          icon:'map' },
    { id:'assets',    label:'Assets',          icon:'boxes' },
    { id:'npcs',      label:'NPCs & Enemies',  icon:'skull' },
    { id:'items',     label:'Drops',           icon:'gem' },
    { id:'droptables',label:'Drop Tables',     icon:'package' },
    { id:'currencies',label:'Currencies',      icon:'coins' },
    { id:'progression',label:'Progression',    icon:'network' },
    { id:'weapons',   label:'Player Weapons',  icon:'crosshair' },
    { id:'wizardry',  label:'Wizardry',        icon:'sparkles' },
    { id:'uiscreens', label:'UI Screens',      icon:'layout-template' },
    { id:'stats',     label:'Game Stat Rules', icon:'sliders-horizontal' },
    { id:'difficulties', label:'Difficulty Menu', icon:'gauge' },
    { id:'mcp',       label:'MCP / Live Sync', icon:'plug-zap' },
  ];

  function seed() {
    return {
      version:4,
      stats:[
        {id:'hp',name:'Health',def:100},{id:'attack',name:'Attack Damage',def:20},
        {id:'defense',name:'Defense',def:5},{id:'speed',name:'Speed',def:300},
        {id:'range',name:'Attack Range (cm)',def:220},{id:'cooldown',name:'Attack Cooldown (s)',def:1.3},
        {id:'chaserange',name:'Max Chase Range (cm)',def:8000},{id:'spread',name:'Spread Distance (cm)',def:260},
        {id:'sidestep',name:'Sidestep Chance (%)',def:35}
      ],
      difficulties:[
        {id:'easy',name:'Easy',index:0,enemyCountPercent:75,description:'Fewer enemies, weaker stats.'},
        {id:'normal',name:'Normal',index:1,enemyCountPercent:100,description:'Designed wave counts and baseline tuning.'},
        {id:'hard',name:'Hard',index:2,enemyCountPercent:150,description:'More enemies, +50% HP, +35% damage.'}
      ],
      npcs:[], items:[], currencies:[], progression:null, weapons:[], wizardry:[], elements:[], levels:[],
      journeys:[], chunks:[], chunkAssets:[], genTemplates:[],
      scene:{ actors:[], lastSync:null, listener:'unknown' },
      log:[],
      meta:{ activeLevelId:null, activeJourneyId:null, activeTab:'dashboard', levelsSubtab:'gen', infusionRerollPolicy:'hub', weaponFilter:'All', wizardryFilter:'All', progSimLevel:5, progSelectedNode:null, progSimRanks:{} },
    };
  }

  function defaultJourney(){ return { name:'Journey', teleportOnAdvance:true, steps:[] }; }
  function defaultInclude(){ return { npcIds:[], itemIds:[] }; }
  function defaultLayers(){ return { terrain:true, path:true, npcs:true, items:true, spawns:true, starts:true, entrances:true }; }
  function normalizeLevelLocal(l){
    if(!l||typeof l!=='object') return l;
    if(l.journeyId===undefined||l.journeyId===null) l.journeyId='';
    else l.journeyId=String(l.journeyId);
    if(!l.journey) l.journey=defaultJourney();
    if(!Array.isArray(l.journey.steps)) l.journey.steps=[];
    if(l.journey.teleportOnAdvance===undefined) l.journey.teleportOnAdvance=true;
    if(!l.include) l.include=defaultInclude();
    if(!Array.isArray(l.include.npcIds)) l.include.npcIds=[];
    if(!Array.isArray(l.include.itemIds)) l.include.itemIds=[];
    const dl=defaultLayers();
    if(!l.layers) l.layers=dl;
    else Object.keys(dl).forEach(k=>{ if(l.layers[k]===undefined) l.layers[k]=dl[k]; });
    if(!l.overlay) l.overlay={file:'',opacity:0.55,enabled:false,stretch:true};
    return l;
  }
  let state = seed();

  function stripOverlayDataUrls(st){
    try{
      const levels=(st&&st.levels)||[];
      for(const l of levels){
        if(l&&l.overlay&&l.overlay._dataUrl){ const ov=Object.assign({},l.overlay); delete ov._dataUrl; l.overlay=ov; }
      }
    }catch(_){}
    return st;
  }
  function persistableState(){
    // Deep-ish clone without huge overlay data URLs (they blow the RPC payload).
    if(!state.meta) state.meta={};
    const raw=JSON.parse(JSON.stringify(state));
    stripOverlayDataUrls(raw);
    // Keep the store small — log is session-only.
    if(raw.log && raw.log.length>40) raw.log=raw.log.slice(0,40);
    return raw;
  }
  function paintedCount(st){
    let n=0;
    for(const l of (st&&st.levels)||[]){
      const g=l&&l.grid;
      if(g&&g._sparse&&g.cells){ n+=Object.keys(g.cells).length; continue; }
      if(Array.isArray(g)){
        for(let y=0;y<g.length;y++){
          const row=g[y]; if(!row) continue;
          for(let x=0;x<row.length;x++){
            const c=row[x];
            if(c&&((c.terrain&&c.terrain!=='empty')||c.entity)) n++;
          }
        }
      }
    }
    return n;
  }

  /* ================= PERSISTENCE — ONE STORE, ONE WRITER =================
     The project store (<project>/.ducky/roguelike-design/store.json) is the ONLY
     copy of the design, read through get_store and written through set_store —
     same shape as app Settings. No localStorage mirror, no second write path, no
     freshness/merge heuristics: those made two copies race and silently lose edits.
     _hydrated gates every write, so a failed load can never flush defaults over
     real work.

     Reads and writes go over the postMessage bridge (rgdRpc), NOT window.
     __duckyPluginHost: that object is for main-window scripts and is absent in this
     sandboxed panel, which is why edits used to fall back to a browser-only copy
     and never reach the project. If the bridge does not answer we say so — a save
     is never reported as done when nothing was written. */
  let _hydrated=false, _hydratedKey=null;
  let _saveT=null, _saveChain=Promise.resolve(), _lastSaveOk=null;
  async function _writeStore(){
    if(!_hydrated || _hydratedKey!==projectKey){ _lastSaveOk={ok:false, error:'design not loaded yet — refusing to overwrite the saved store'}; return _lastSaveOk; }
    if(!state.meta) state.meta={};
    state.meta.savedAt=Date.now();
    // Snapshot at write time so a queued older save cannot overwrite fresher edits.
    const st=persistableState();
    try{
      const r=await rgdRpc('set_store',{state:st},90000);
      _lastSaveOk=(r&&r.ok)?{ok:true}:{ok:false, error:(r&&(r.error||r.message))||'set_store failed'};
    }catch(e){ _lastSaveOk={ok:false, error:String(e&&e.message||e)}; }
    return _lastSaveOk;
  }
  function enqueueSave(){
    const p=_saveChain.then(_writeStore).catch(function(e){
      _lastSaveOk={ok:false, error:String(e&&e.message||e)};
      return _lastSaveOk;
    });
    _saveChain=p.then(function(){}, function(){});
    return p;
  }
  function save(opts){
    clearTimeout(_saveT);
    if(opts&&opts.flush) return enqueueSave();
    _saveT=setTimeout(function(){ enqueueSave(); }, 250);
    return Promise.resolve({ok:true, queued:true});
  }
  function flushSave(){
    clearTimeout(_saveT); _saveT=null;
    return enqueueSave();
  }
  function diffNames(){ return (state.difficulties||[]).map(d=>d.name||('D'+d.index)); }
  function diffLabel(idx){ const d=(state.difficulties||[]).find(x=>x.index===idx); return d?d.name:(['Easy','Normal','Hard'][idx]||('Tier '+idx)); }
  function npcDiffLine(n){
    const ds=n.difficultyStats; if(!ds||!ds.length) return '';
    const e=ds[0], h=ds[ds.length-1];
    return `<div class="text-[10px] text-gray-500 mt-1">${esc(diffLabel(0))}: ${e.maxHealth} HP · dmg×${e.damageMultiplier} → ${esc(diffLabel(ds.length-1))}: ${h.maxHealth} HP · dmg×${h.damageMultiplier}</div>`;
  }
  const uid=(p)=>p+'_'+Math.random().toString(36).slice(2,8);

  /* ================= MCP BRIDGE ================= */
  const bridge = {
    resolveHost(){ return window.__duckyPluginHost || window.RGDHost || null; },
    async raw(name, args){
      // The postMessage bridge is the only path out of this sandboxed panel; the
      // main-window host object is just a fallback for other embeddings.
      try{
        const r=await rgdRpc('call_tool',{name:name, args:args||{}},60000);
        if(r&&r.ok) return r.result;
        // Surface errors (incl. unknown tool) — do not silently fall through to a broken host path.
        if(r&&r.error) return { error:r.error };
      }catch(e){}
      const h=this.resolveHost(); if(!h) return undefined;
      try{
        if (typeof h.callTool==='function')   return await h.callTool(name,args||{});
        if (typeof h.invokeTool==='function') return await h.invokeTool(name,args||{});
        if (typeof h.mcp==='function')        return await h.mcp(name,args||{});
        if (typeof h.request==='function')    return await h.request('tool',{name,args:args||{}});
      }catch(e){ return { error:String(e&&e.message||e) }; }
      return undefined;
    },
    async call(tool, args){
      const entry={ t:Date.now(), tool, args:summarize(args), ok:true, result:null };
      let res;
      try{
        const r=await this.raw('rgd_'+tool, args||{});
        res=(r===undefined)?await sim(tool,args||{}):r;
        entry.result=res; entry.ok=!(res&&res.error);
        return res;
      }catch(e){ entry.ok=false; entry.result={error:String(e)}; return entry.result; }
      finally{ state.log.unshift(entry); if(state.log.length>200)state.log.length=200;
        if(state.meta.activeTab==='mcp') renderMCP(); }
    }
  };
  function summarize(a){ if(!a)return''; return Object.entries(a).map(([k,v])=>(v&&typeof v==='object')?k+'={…}':k+'='+String(v)).join(' '); }

  /* ===== LOCAL SIMULATION (standalone fallback) ===== */
  async function sim(tool,args){
    await new Promise(r=>setTimeout(r,50));
    const root='/RoguelikeDesign';
    switch(tool){
      case 'get_state': return null;
      case 'get_sync_status': return computeSyncStatus();
      case 'get_scene_state': return { actors:state.scene.actors, count:state.scene.actors.length, listener:state.scene.listener };
      case 'list_levels': return state.levels.map(pick(['id','name','w','h']));
      case 'list_npcs': return state.npcs.map(pick(['id','name','type']));
      case 'list_items': return state.items.map(pick(['id','name','category']));
      case 'list_stats': return state.stats.slice();
      case 'sync_from_uefn': state.scene.lastSync=Date.now(); state.scene.listener='online'; return { pulled:state.scene.actors.length, present:state.scene.actors.length, actors:state.scene.actors };
      case 'clear_level_in_uefn': { const b=state.scene.actors.length; state.scene.actors=state.scene.actors.filter(a=>a.levelId!==args.level_id); return { removed:b-state.scene.actors.length }; }
      case 'spawn_npc_in_uefn':
      case 'spawn_item_in_uefn': {
        const isN=tool==='spawn_npc_in_uefn';
        const ent=(isN?state.npcs:state.items).find(e=>e.id===(args.npc_id||args.item_id)); if(!ent) return {error:'entity not found'};
        const lvl=state.levels.find(l=>l.id===args.level_id)||{id:'free',name:'Free',w:1,h:1};
        const dup=state.scene.actors.find(a=>a.levelId===(args.level_id||'free')&&a.x===(args.x||0)&&a.y===(args.y||0)&&a.entityId===ent.id);
        if(dup) return { skipped:true, reason:'already spawned', actorPath:dup.path };
        const world=cellToWorld(lvl,args.x||0,args.y||0);
        const label=safeLabel(ent.name)+'_'+(args.x||0)+'_'+(args.y||0);
        const folder=folderFor(lvl,isN?'Enemies':'Loot');
        const actor={ path:root+'/Spawned/'+safeLabel(lvl.name)+'/'+label, label, folder, kind:isN?'npc':'item', entityId:ent.id, levelId:args.level_id||'free', x:args.x||0, y:args.y||0, world, warnings:[] };
        state.scene.actors.push(actor);
        return { actorPath:actor.path, label, folder, world, warnings:[] };
      }
      case 'build_level_in_uefn': {
        const lvl=state.levels.find(l=>l.id===args.level_id); if(!lvl) return {error:'level not found'};
        state.scene.actors=state.scene.actors.filter(a=>a.levelId!==lvl.id);
        let walls=0,doors=0,ents=0; const warnings=[];
        for(let y=0;y<lvl.h;y++)for(let x=0;x<lvl.w;x++){ const c=lvl.grid[y][x]; const world=cellToWorld(lvl,x,y);
          if(c.terrain==='wall'){ state.scene.actors.push(geo(root,lvl,'Wall',x,y,world)); walls++; }
          else if(c.terrain==='door'){ state.scene.actors.push(geo(root,lvl,'Door',x,y,world)); doors++; }
          if(c.entity){ const list=c.entity.kind==='npc'?state.npcs:state.items; const e=list.find(z=>z.id===c.entity.id);
            if(!e){ warnings.push('missing '+c.entity.id); continue; }
            state.scene.actors.push({ path:root+'/Spawned/'+safeLabel(lvl.name)+'/'+safeLabel(e.name)+'_'+x+'_'+y, label:safeLabel(e.name)+'_'+x+'_'+y, folder:folderFor(lvl,c.entity.kind==='npc'?'Enemies':'Loot'), kind:c.entity.kind, entityId:e.id, levelId:lvl.id, x, y, world }); ents++; }
        }
        state.scene.lastSync=Date.now(); state.scene.listener='online';
        return { level:lvl.name, walls, doors, entities:ents, warnings, actors:state.scene.actors.filter(a=>a.levelId===lvl.id).length };
      }
      case 'set_level_overlay': {
        const lvl=state.levels.find(l=>l.id===args.level_id); if(!lvl) return {error:'level not found'};
        if(args.clear){ lvl.overlay={file:'',opacity:0.55,enabled:false,stretch:true}; return {ok:true,level_id:lvl.id,overlay:lvl.overlay}; }
        const ov=Object.assign({file:'',opacity:0.55,enabled:true,stretch:true}, lvl.overlay||{});
        if(args.opacity!=null) ov.opacity=Math.max(0.05,Math.min(1,+args.opacity));
        if(args.enabled!=null) ov.enabled=!!args.enabled;
        if(args.stretch!=null) ov.stretch=!!args.stretch;
        if(args.image_path) ov.file=String(args.image_path).split(/[/\\]/).pop()||ov.file;
        lvl.overlay=ov; return {ok:true,level_id:lvl.id,overlay:ov};
      }
      default: return { error:'unknown tool '+tool };
    }
  }
  function geo(root,lvl,kind,x,y,world){ return { path:root+'/Spawned/'+safeLabel(lvl.name)+'/'+kind+'_'+x+'_'+y, label:kind+'_'+x+'_'+y, folder:folderFor(lvl,kind==='Wall'?'Geometry/Walls':'Geometry/Doors'), kind:'geo', geo:kind.toLowerCase(), levelId:lvl.id, x, y, world }; }
  const pick=(keys)=>(o)=>Object.fromEntries(keys.map(k=>[k,o[k]]));
  function safeLabel(s){ return String(s||'X').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'')||'X'; }
  function folderFor(lvl,sub){ return (lvl&&lvl.name?safeLabel(lvl.name):'Free')+'/'+sub; }
  function cellToWorld(lvl,x,y){ const w=lvl.w||1,h=lvl.h||1; return { x:(x-w/2)*WORLD_STEP, y:(y-h/2)*WORLD_STEP, z:0 }; }

  /* ===== sync / drift ===== */
  function intended(){ const out=[]; state.levels.forEach(l=>{ iterPainted(l).forEach(([x,y,c])=>{
    if(c.terrain==='wall'||c.terrain==='door') out.push(key(l.id,'geo',x,y));
    if(c.entity) out.push(key(l.id,c.entity.kind,x,y,c.entity.id)); }); }); return out; }
  const key=(lid,kind,x,y,eid)=>[lid,kind,x,y,eid||''].join('|');
  function actorKey(a){ return key(a.levelId,a.kind==='geo'?'geo':a.kind,a.x,a.y,a.kind==='geo'?'':a.entityId); }
  function computeSyncStatus(){ const want=new Set(intended()); const have=new Set(state.scene.actors.map(actorKey));
    let missing=0,extra=0; want.forEach(k=>{if(!have.has(k))missing++;}); have.forEach(k=>{if(!want.has(k))extra++;});
    return { inSync:missing===0&&extra===0, missing, extra, sceneActors:state.scene.actors.length, intended:want.size, listener:state.scene.listener, lastSync:state.scene.lastSync }; }

  /* ===== toasts ===== */
  function toast(msg,kind='info'){
    const colors={info:'bg-gray-800 border-gray-700',ok:'bg-emerald-900/80 border-emerald-700',warn:'bg-amber-900/80 border-amber-700',err:'bg-red-900/80 border-red-700'};
    const icons={info:'info',ok:'check-circle-2',warn:'alert-triangle',err:'x-circle'};
    const el=document.createElement('div');
    el.className=`toast-in border ${colors[kind]} rounded-lg px-3 py-2.5 text-sm text-gray-100 shadow-lg flex items-start gap-2`;
    el.innerHTML=`<i data-lucide="${icons[kind]}" class="w-4 h-4 mt-0.5 shrink-0"></i><span>${esc(msg)}</span>`;
    document.getElementById('toasts').appendChild(el); lucide.createIcons({nodes:[el]});
    setTimeout(()=>{ el.style.transition='opacity .3s'; el.style.opacity='0'; setTimeout(()=>el.remove(),300); },2600);
  }
  function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  /* ===== status chips ===== */
  async function refreshStatus(){
    const r=await bridge.raw('rgd_get_sync_status',{});
    if(r&&!r.error&&r.listener) state.scene.listener=r.listener;
    else if(state.scene.listener==='unknown') state.scene.listener='offline';
    const online = state.scene.listener==='online';
    const setC=(d,t,c,x)=>{ const de=document.getElementById(d),te=document.getElementById(t); if(de)de.className='chip-dot '+c; if(te)te.textContent=x; };
    const lc=online?'bg-emerald-500':'bg-red-500', lt=online?'online':'offline';
    setC('chipListenerDot','chipListenerText',lc,'Listener: '+lt);
    setC('hdrListenerDot','hdrListenerText',lc,'UEFN '+lt);
    // Sidebar chip only — no actor "drift" spam (design store autosaves; Build/spawn is explicit).
    setC('chipSyncDot','chipSyncText', online?'bg-emerald-500':'bg-gray-500', online?'UEFN ready':'UEFN offline');
    const m=document.getElementById('chipMode');
    if(m) m.textContent=_hydrated?('saving to: '+projectKey):'READ-ONLY · design store unreachable';
  }

  /* ===== nav / routing ===== */
  function buildNav(){ document.getElementById('nav').innerHTML=NAV.map(n=>`
    <button data-tab="${n.id}" onclick="RGD.go('${n.id}')" class="nav-item w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 border-l-2 border-transparent transition">
      <i data-lucide="${n.icon}" class="w-4 h-4"></i><span>${n.label}</span></button>`).join(''); lucide.createIcons(); }
  function go(tab, subtab){
    if(typeof closeDetail==='function') closeDetail();
    if(typeof closeConfirm==='function') closeConfirm();
    // Legacy routes → Levels subtabs
    if(tab==='procgen'){ tab='levels'; subtab=subtab||'gen'; }
    if(tab==='chunks'){ tab='levels'; subtab=subtab||'chunks'; }
    if(!state.meta) state.meta={};
    state.meta.activeTab=tab;
    if(tab==='levels' && subtab) state.meta.levelsSubtab=subtab;
    if(tab==='levels' && !state.meta.levelsSubtab) state.meta.levelsSubtab='gen';
    flushSave();
    document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('is-active'));
    const pane=document.getElementById('tab-'+tab);
    if(pane) pane.classList.add('is-active');
    const lp=document.querySelector('.list-pane'); if(lp) lp.classList.toggle('ui-mode', tab==='uiscreens');
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('is-active',b.dataset.tab===tab));
    const meta=NAV.find(n=>n.id===tab); if(meta) document.getElementById('pageTitle').textContent=meta.label;
    const subs={dashboard:'Live design source of truth · autosaves to the project · shared by UI & MCP',levels:'Level Gen · Chunks · Journeys — generate layouts; place props from Assets onto chunks (3D preview)',assets:'All kit meshes — floors, walls, roofs, arches, doors, columns · Three.js preview · Sync from UEFN Content',npcs:'Enemy / Elite / Boss you fight · Friendly (Wizard Bob & friends) you talk to — Melee / Ranged / Caster roles',items:'Scrolls, buffs & currency pickups — stat mods + currency rewards on pickup, optional shop price',droptables:'Named shared loot pools · attach on enemies · full chance/weight/qty',currencies:'Gold / Gems / Keys catalogue — referenced by drop rewards, NPC kill loot, and shop prices',progression:'Player levels grant skill points — spend them on a drag-editable node tree; later nodes stay locked until prerequisites are filled',weapons:'Weapon catalogue (Pistol / AR / Shotgun / SMG) — open element slots vs locked Time signatures, linked to UEFN custom weapons',wizardry:'Element powers as reusable scrolls (Fire/Ice/Lightning/Void) + locked Time signatures',stats:'Global stats generate NPC/Item fields AND MCP-readable data',difficulties:'Easy / Normal / Hard menu defaults — per-enemy HP, damage, dodge for in-game matching',uiscreens:'Design every canvas UI in the loop — shops, popups, HUD — then export it as Verse canvas code',mcp:'Tool log + scene inventory · design store autosaves (no manual push)'};
    document.getElementById('pageSub').textContent=subs[tab]||''; renderTab(tab); }
  function setLevelsSubtab(sub){
    if(!state.meta) state.meta={};
    // Assets moved to its own sidebar tab — route old deep-links there.
    if(sub==='assets'){ go('assets'); return; }
    state.meta.levelsSubtab=(sub==='chunks'||sub==='journeys')?sub:'gen';
    save(); renderLevels();
  }
  function renderTab(tab){ ({dashboard:renderDashboard,levels:renderLevels,assets:renderAssets,npcs:renderNPCs,items:renderItems,droptables:renderDropTables,currencies:renderCurrencies,progression:renderProgression,weapons:renderWeapons,wizardry:renderWizardry,uiscreens:renderUIScreens,stats:renderStats,difficulties:renderDifficulties,mcp:renderMCP}[tab]||(()=>{}))(); lucide.createIcons(); }

  /* ===== dashboard ===== */
  function renderDashboard(){
    const online=state.scene.listener==='online';
    const card=(icon,label,val,color)=>`<div class="bg-gray-800 border border-gray-700 rounded-xl p-4"><div class="flex items-center justify-between"><span class="text-xs text-gray-400">${label}</span><i data-lucide="${icon}" class="w-4 h-4 ${color}"></i></div><div class="text-3xl font-bold text-white mt-2">${val}</div></div>`;
    document.getElementById('tab-dashboard').innerHTML=`
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        ${card('map','Total Levels',state.levels.length,'text-sky-400')}
        ${card('skull','NPCs Created',state.npcs.length,'text-rose-400')}
        ${card('gem','Drops Defined',state.items.length,'text-amber-400')}${card('package','Drop Tables',(state.dropTables||[]).length,'text-orange-300')}
        ${card('coins','Currencies',(state.currencies||[]).length,'text-yellow-400')}
        ${card('network','Skill Nodes',(((state.progression||{}).tree||{}).nodes||[]).length,'text-purple-400')}
        ${card('crosshair','Player Weapons',(state.weapons||[]).length,'text-cyan-400')}
        ${card('sparkles','Wizardry Powers',(state.wizardry||[]).length,'text-fuchsia-400')}
        ${card('sliders-horizontal','Global Stats',state.stats.length,'text-violet-400')}
        ${card('boxes','Assets',(state.chunkAssets||[]).length,'text-amber-400')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div class="lg:col-span-2 bg-gray-800 border border-gray-700 rounded-xl p-5">
          <div class="flex items-center justify-between mb-4"><h3 class="text-sm font-semibold text-white flex items-center gap-2"><i data-lucide="plug-zap" class="w-4 h-4 text-indigo-400"></i> UEFN</h3><span class="text-[11px] px-2 py-0.5 rounded-full ${online?'bg-emerald-900 text-emerald-300':'bg-gray-700 text-gray-300'}">${online?'online':'offline'}</span></div>
          <p class="text-sm text-gray-400">Design store autosaves to the project. Place / Build in Levels when you want actors in the editor — no manual push.</p>
          <div class="text-[11px] text-gray-500 mt-4">Listener: <span class="${online?'text-emerald-400':'text-red-400'}">${state.scene.listener||'unknown'}</span> · Scene actors tracked: ${state.scene.actors.length}</div>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h3 class="text-sm font-semibold text-white mb-4 flex items-center gap-2"><i data-lucide="zap" class="w-4 h-4 text-amber-400"></i> Quick Actions</h3>
          <div class="space-y-2">
            <button onclick="RGD.go('levels','gen');RGD.newLevel()" class="w-full text-left px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> New Level</button>
            <button onclick="RGD.go('levels','gen')" class="w-full text-left px-3 py-2 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-sm flex items-center gap-2"><i data-lucide="dices" class="w-4 h-4"></i> Level Gen</button>
            <button onclick="RGD.go('assets')" class="w-full text-left px-3 py-2 rounded-lg bg-amber-800 hover:bg-amber-700 text-white text-sm flex items-center gap-2"><i data-lucide="boxes" class="w-4 h-4"></i> Assets</button>
            <button onclick="RGD.go('npcs');RGD.openNPCModal()" class="w-full text-left px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> New NPC</button>
          </div>
        </div>
      </div>`;
  }

  /* ===== currencies =====
     Catalogue of money types. Everywhere else references these ids:
       drop.currencyReward / npc.currencyDrop = {gold:5}
       drop.price / weapon.price / wizardry.price = {currencyId, amount} */
  function ensureCurrencies(){
    if(!Array.isArray(state.currencies)) state.currencies=[];
    if(!state.currencies.length){
      state.currencies=[
        {id:'gold',name:'Gold',symbol:'G',color:'#fbbf24',desc:'Common loot coin.',startingAmount:0},
        {id:'gems',name:'Gems',symbol:'◆',color:'#a78bfa',desc:'Rare crystal.',startingAmount:0},
        {id:'keys',name:'Keys',symbol:'K',color:'#38bdf8',desc:'Unlocks chests and doors.',startingAmount:0},
      ];
      return true;
    }
    return false;
  }
  function currencyById(id){ return (state.currencies||[]).find(c=>c.id===id)||null; }
  function formatCurrencyBag(bag){
    bag=bag||{};
    const parts=Object.keys(bag).filter(k=>Number(bag[k])).map(k=>{
      const c=currencyById(k); const n=Number(bag[k]);
      return (c?c.symbol+' ':'')+n+' '+(c?c.name:k);
    });
    return parts.join(' · ')||'—';
  }
  function formatPrice(price){
    if(!price||!Number(price.amount)) return '—';
    const c=currencyById(price.currencyId)||{symbol:'$',name:price.currencyId||'gold'};
    return (c.symbol||'$')+' '+Number(price.amount)+' '+(c.name||'');
  }
  function currencyAmountFields(bag, prefix){
    ensureCurrencies();
    bag=bag||{};
    if(!(state.currencies||[]).length) return '<div class="text-[11px] text-amber-400">Add a currency in the Currencies tab first.</div>';
    return `<div class="grid grid-cols-3 gap-2">${state.currencies.map(c=>`
      <label class="block rounded-lg bg-gray-900/80 border border-gray-700 px-2 py-1.5"><span class="text-[10px] text-amber-300/90 flex items-center gap-1"><span style="color:${c.color}">${esc(c.symbol||'$')}</span>${esc(c.name)}</span>
        <input id="${prefix}_${esc(c.id)}" type="number" step="1" value="${Number(bag[c.id])||0}" class="${IN} mt-1 text-amber-100"></label>`).join('')}</div>`;
  }
  function collectCurrencyBag(prefix){
    const out={};
    (state.currencies||[]).forEach(c=>{
      const v=Number(val(prefix+'_'+c.id));
      if(v) out[c.id]=v;
    });
    return out;
  }
  function priceFieldsHtml(price, prefix){
    ensureCurrencies();
    price=price&&typeof price==='object'?price:{currencyId:'gold',amount:0};
    const opts=(state.currencies||[]).map(c=>`<option value="${esc(c.id)}" ${(price.currencyId||'gold')===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
    return `<div class="grid grid-cols-2 gap-3">${field('Shop currency',`<select id="${prefix}Cur" class="${IN}"><option value="">— free —</option>${opts}</select>`)}${field('Shop price',`<input id="${prefix}Amt" type="number" min="0" step="1" value="${Number(price.amount)||0}" class="${IN}">`)}</div>`;
  }
  function collectPrice(prefix){
    const currencyId=val(prefix+'Cur')||'';
    const amount=Number(val(prefix+'Amt'))||0;
    if(!currencyId||!amount) return {currencyId:currencyId||'gold', amount:0};
    return {currencyId, amount};
  }
  function renderCurrencies(){
    ensureCurrencies();
    const rows=(state.currencies||[]).map(c=>{
      const usedDrops=(state.items||[]).filter(i=>Number((i.currencyReward||{})[c.id])||((i.price||{}).currencyId===c.id&&Number((i.price||{}).amount))).length;
      const usedNpcs=(state.npcs||[]).filter(n=>Number((n.currencyDrop||{})[c.id])).length;
      const usedShop=(state.weapons||[]).filter(w=>((w.price||{}).currencyId===c.id&&Number((w.price||{}).amount))).length
        +(state.wizardry||[]).filter(p=>((p.price||{}).currencyId===c.id&&Number((p.price||{}).amount))).length
        +(state.items||[]).filter(i=>((i.price||{}).currencyId===c.id&&Number((i.price||{}).amount))).length;
      return `<tr class="cat-row border-b border-gray-700/60" onclick="RGD.openCurrencyModal('${c.id}')">
        <td class="py-2 px-3"><span class="inline-flex items-center justify-center w-8 h-8 rounded text-sm font-bold" style="background:${c.color}22;color:${c.color};border:1px solid ${c.color}55">${esc(c.symbol||'?')}</span></td>
        <td class="py-2 px-3"><code class="text-xs text-indigo-300">${esc(c.id)}</code></td>
        <td class="py-2 px-3 text-sm text-white font-medium">${esc(c.name)}</td>
        <td class="py-2 px-3 text-sm text-gray-300">${Number(c.startingAmount)||0}</td>
        <td class="py-2 px-3 text-[11px] text-gray-400">${usedDrops} drops · ${usedNpcs} NPC loot · ${usedShop} prices</td>
        <td class="py-2 px-3 text-right whitespace-nowrap" onclick="event.stopPropagation()">
          <button onclick="event.stopPropagation();RGD.openCurrencyModal('${c.id}')" class="text-gray-400 hover:text-white mr-2"><i data-lucide="pencil" class="w-4 h-4"></i></button>
          <button onclick="event.stopPropagation();RGD.deleteCurrency('${c.id}')" class="text-gray-400 hover:text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </td></tr>`;
    }).join('')||`<tr><td colspan="6" class="py-8 text-center text-gray-500 text-sm">No currencies yet.</td></tr>`;
    document.getElementById('tab-currencies').innerHTML=`
      <div class="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <p class="text-sm text-gray-400 max-w-2xl">Define money types once. Drops grant them on pickup, enemies drop them on kill, and shops charge them — every amount points at an id from this list.</p>
        <button onclick="RGD.openCurrencyModal()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-2 shrink-0"><i data-lucide="plus" class="w-4 h-4"></i> Add Currency</button>
      </div>
      <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto"><table class="w-full min-w-[720px]"><thead><tr class="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-700"><th class="text-left py-2 px-3"></th><th class="text-left py-2 px-3">ID</th><th class="text-left py-2 px-3">Name</th><th class="text-left py-2 px-3">Start</th><th class="text-left py-2 px-3">Used by</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function openCurrencyModal(id){
    ensureCurrencies();
    const c=state.currencies.find(x=>x.id===id)||{id:'',name:'',symbol:'$',color:'#fbbf24',desc:'',startingAmount:0};
    modalShell(id?'Edit Currency':'Add Currency',`
      <div class="grid grid-cols-2 gap-3">
        ${field('Currency ID',`<input id="mCurId" value="${esc(c.id)}" ${id?'readonly':''} placeholder="gold" class="${IN} ${id?'opacity-60':''}">`)}
        ${field('Display Name',`<input id="mCurName" value="${esc(c.name)}" placeholder="Gold" class="${IN}">`)}
        ${field('Symbol',`<input id="mCurSym" maxlength="2" value="${esc(c.symbol||'')}" class="${IN} text-center">`)}
        ${field('Color',`<input id="mCurColor" type="color" value="${c.color||'#fbbf24'}" class="w-full h-9 bg-gray-900 border border-gray-700 rounded-lg">`)}
        ${field('Starting amount',`<input id="mCurStart" type="number" min="0" step="1" value="${Number(c.startingAmount)||0}" class="${IN}">`)}
      </div>
      ${field('Description',`<textarea id="mCurDesc" rows="2" class="${IN}">${esc(c.desc||'')}</textarea>`)}
      <p class="text-[11px] text-gray-500 mt-2">Use this id in drop rewards, NPC kill loot, and shop prices across the design.</p>
    `,`RGD.saveCurrency('${id||''}')`);
  }
  function saveCurrency(id){
    ensureCurrencies();
    const name=val('mCurName').trim();
    let cid=id||val('mCurId').trim().toLowerCase().replace(/[^a-z0-9_]/g,'_');
    if(!cid||!name) return toast('ID and name required','warn');
    if(!id&&state.currencies.some(c=>c.id===cid)) return toast('Currency id exists','warn');
    const rec={id:cid, name, symbol:val('mCurSym')||name[0].toUpperCase(), color:val('mCurColor')||'#fbbf24', desc:val('mCurDesc'), startingAmount:Number(val('mCurStart'))||0};
    if(id){ const i=state.currencies.findIndex(c=>c.id===id); state.currencies[i]=rec; }
    else state.currencies.push(rec);
    save({flush:true}); closeModal(); renderCurrencies(); toast('Currency saved','ok');
  }
  function deleteCurrency(id){
    confirmModal('Delete Currency',
      'Delete currency <code class="text-indigo-300">'+esc(id)+'</code>? It will be cleared from drop rewards, NPC loot, and shop prices.',
      "RGD.confirmDeleteCurrency('"+id+"')");
  }
  function confirmDeleteCurrency(id){
    closeModal();
    state.currencies=(state.currencies||[]).filter(c=>c.id!==id);
    if(!state.meta) state.meta={};
    const removed=Array.isArray(state.meta.removedCurrencyIds)?state.meta.removedCurrencyIds:[];
    if(!removed.includes(id)) removed.push(id);
    state.meta.removedCurrencyIds=removed;
    const fallback=(state.currencies[0]&&state.currencies[0].id)||'gold';
    (state.items||[]).forEach(it=>{
      if(it.currencyReward) delete it.currencyReward[id];
      if(it.price&&it.price.currencyId===id){ it.price.currencyId=fallback; it.price.amount=0; }
    });
    (state.npcs||[]).forEach(n=>{ if(n.currencyDrop) delete n.currencyDrop[id]; });
    (state.weapons||[]).forEach(w=>{ if(w.price&&w.price.currencyId===id){ w.price.currencyId=fallback; w.price.amount=0; } });
    (state.wizardry||[]).forEach(p=>{ if(p.price&&p.price.currencyId===id){ p.price.currencyId=fallback; p.price.amount=0; } });
    save({flush:true}); renderCurrencies(); toast('Currency deleted','ok');
  }

  /* ===== progression (player level + skill node tree) ===== */
  let _progDrag=null; // {id, ox, oy, startX, startY, moved}
  function ensureProgression(){
    if(!state.progression||typeof state.progression!=='object'){
      state.progression={
        maxLevel:30, pointsPerLevel:1,
        levelTable:[], scaling:[
          {statId:'hp',label:'Health',base:100,perLevel:12,curve:'linear'},
          {statId:'attack',label:'Damage',base:20,perLevel:2.5,curve:'linear'},
          {statId:'defense',label:'Defense',base:5,perLevel:0.8,curve:'linear'},
        ],
        tree:{width:900,height:520,nodes:[]}
      };
      rebuildLevelTable();
      return true;
    }
    if(!state.progression.tree) state.progression.tree={width:900,height:520,nodes:[]};
    if(!Array.isArray(state.progression.tree.nodes)) state.progression.tree.nodes=[];
    if(!Array.isArray(state.progression.levelTable)||!state.progression.levelTable.length) rebuildLevelTable();
    if(!Array.isArray(state.progression.scaling)) state.progression.scaling=[];
    if(!state.meta.progSimRanks) state.meta.progSimRanks={};
    if(state.meta.progSimLevel==null) state.meta.progSimLevel=5;
    if(!state.meta.progEditMode) state.meta.progEditMode='move';
    if(state.meta.progConnectFrom===undefined) state.meta.progConnectFrom=null;
    return false;
  }
  function progEditMode(){ ensureProgression(); return state.meta.progEditMode||'move'; }
  function setProgEditMode(mode){
    ensureProgression();
    const m=['move','connect','disconnect'].includes(mode)?mode:'move';
    state.meta.progEditMode=m;
    state.meta.progConnectFrom=null;
    renderProgression();
    if(m==='connect') toast('Connect: click prerequisite, then the node that needs it','info');
    else if(m==='disconnect') toast('Disconnect: click a line, or two linked nodes','info');
  }
  function beginWireToSelected(){
    ensureProgression();
    state.meta.progEditMode='connect';
    state.meta.progConnectFrom=null;
    renderProgression();
    toast('Click a prerequisite, then the selected node','info');
  }
  function rebuildLevelTable(){
    const p=state.progression; const max=Math.max(1,Math.min(200,Number(p.maxLevel)||30));
    const pts=Math.max(0,Number(p.pointsPerLevel)||1);
    const old={}; (p.levelTable||[]).forEach(r=>{ if(r&&r.level) old[r.level]=r; });
    let xp=0; const rows=[];
    for(let lv=1;lv<=max;lv++){
      xp+=Math.floor(80+lv*35+(lv*lv)*2);
      const prev=old[lv]||{};
      rows.push({level:lv, xp:prev.xp!=null?prev.xp:xp, points:prev.points!=null?prev.points:(lv===1?1:pts), notes:prev.notes||''});
    }
    p.maxLevel=max; p.levelTable=rows;
  }
  function totalPointsAtLevel(lv){
    ensureProgression();
    return (state.progression.levelTable||[]).filter(r=>r.level<=lv).reduce((a,r)=>a+(Number(r.points)||0),0);
  }
  function spentSimPoints(){
    ensureProgression();
    const ranks=state.meta.progSimRanks||{};
    let spent=0;
    (state.progression.tree.nodes||[]).forEach(n=>{
      const r=Math.max(0,Math.min(Number(n.maxRank)||1, Number(ranks[n.id])||0));
      spent+=r*(Number(n.cost)||1);
    });
    return spent;
  }
  function availableSimPoints(){
    return Math.max(0, totalPointsAtLevel(Number(state.meta.progSimLevel)||1) - spentSimPoints());
  }
  function nodeRank(id){ return Math.max(0, Number((state.meta.progSimRanks||{})[id])||0); }
  function nodeUnlocked(n){
    const req=n.requires||[];
    if(!req.length) return true;
    return req.every(rid=>nodeRank(rid)>=1);
  }
  function scaleAtLevel(row, lv){
    const base=Number(row.base)||0, per=Number(row.perLevel)||0, L=Math.max(1,lv);
    if((row.curve||'linear')==='quad') return base+per*(L-1)+0.05*per*(L-1)*(L-1);
    return base+per*(L-1);
  }
  function treeNodes(){ ensureProgression(); return state.progression.tree.nodes||[]; }
  function findTreeNode(id){ return treeNodes().find(n=>n.id===id)||null; }
  function wouldCreateCycle(prereqId, nodeId){
    if(prereqId===nodeId) return true;
    const stack=[prereqId]; const seen=new Set();
    while(stack.length){
      const cur=stack.pop();
      if(seen.has(cur)) continue;
      seen.add(cur);
      const n=findTreeNode(cur);
      for(const r of (n&&n.requires||[])){
        if(r===nodeId) return true;
        stack.push(r);
      }
    }
    return false;
  }
  function addProgRequire(prereqId, nodeId){
    const n=findTreeNode(nodeId); if(!n||!findTreeNode(prereqId)) return false;
    if((n.requires||[]).includes(prereqId)){ toast('Already connected','warn'); return false; }
    if(wouldCreateCycle(prereqId, nodeId)){ toast('That connection would create a cycle','warn'); return false; }
    n.requires=[...(n.requires||[]), prereqId];
    syncSkillTreeScreenFromProgression();
    save({flush:true});
    return true;
  }
  function removeProgRequire(prereqId, nodeId){
    const n=findTreeNode(nodeId); if(!n) return false;
    const before=(n.requires||[]).length;
    n.requires=(n.requires||[]).filter(r=>r!==prereqId);
    if(n.requires.length===before) return false;
    syncSkillTreeScreenFromProgression();
    save({flush:true});
    return true;
  }
  function progEdgesSvg(){
    const nodes=treeNodes(); const by={}; nodes.forEach(n=>by[n.id]=n);
    const mode=progEditMode();
    const lines=[];
    nodes.forEach(n=>{
      (n.requires||[]).forEach(rid=>{
        const a=by[rid], b=n; if(!a||!b) return;
        const x1=a.x+36, y1=a.y+36, x2=b.x+36, y2=b.y+36;
        const unlocked=nodeRank(rid)>=1;
        const clickable=mode==='disconnect'?' pointer-events="stroke" cursor="pointer"':'';
        lines.push(`<line class="prog-edge-hit" data-from="${esc(rid)}" data-to="${esc(n.id)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="14"${clickable} onclick="RGD.progEdgeClick(event,'${esc(rid)}','${esc(n.id)}')"/>`);
        lines.push(`<line class="prog-edge" data-from="${esc(rid)}" data-to="${esc(n.id)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${unlocked?'#e9d5ff':'#4c1d95'}" stroke-width="2" stroke-opacity="${unlocked?0.9:0.45}" pointer-events="none"/>`);
      });
    });
    const w=state.progression.tree.width||900, h=state.progression.tree.height||520;
    const pe=mode==='disconnect'?'auto':'none';
    return `<svg class="prog-edges mode-${mode}" style="pointer-events:${pe}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${lines.join('')}</svg>`;
  }
  function progNodeHtml(n){
    const rank=nodeRank(n.id), max=Number(n.maxRank)||1;
    const unlocked=nodeUnlocked(n);
    const maxed=rank>=max;
    const sel=state.meta.progSelectedNode===n.id;
    const from=state.meta.progConnectFrom===n.id;
    const mode=progEditMode();
    const cls=['prog-node', unlocked?'is-unlocked':'is-locked', maxed?'is-maxed':'', sel?'is-selected':'', from?'is-connect-from':'', 'mode-'+mode].filter(Boolean).join(' ');
    return `<div class="${cls}" data-nid="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px"
      onmousedown="RGD.progNodeDown(event,'${n.id}')">
      <div class="prog-node-face" style="color:${n.color||'#a855f7'}">
        <i data-lucide="${esc(n.icon||'sparkles')}" class="w-6 h-6"></i>
        <div class="prog-rank">${rank}/${max}</div>
      </div>
    </div>`;
  }
  function progModeHint(){
    const mode=progEditMode();
    const from=state.meta.progConnectFrom;
    if(mode==='connect'){
      if(from){ const t=findTreeNode(from); return 'Connect: now click the node that requires '+(t?t.name:from); }
      return 'Connect: click prerequisite first, then the dependent node';
    }
    if(mode==='disconnect') return 'Disconnect: click a purple line, or two nodes that are linked';
    return 'Move: drag nodes · click to select · Add node below · Connect to wire requires';
  }
  function renderProgression(){
    ensureProgression();
    const p=state.progression;
    const simLv=Number(state.meta.progSimLevel)||1;
    const avail=availableSimPoints();
    const mode=progEditMode();
    const sel=findTreeNode(state.meta.progSelectedNode)||treeNodes()[0]||null;
    if(sel&&state.meta.progSelectedNode!==sel.id) state.meta.progSelectedNode=sel.id;

    const scaleRows=(p.scaling||[]).map(row=>{
      const now=scaleAtLevel(row, simLv), next=scaleAtLevel(row, simLv+1);
      return `<tr><td class="text-gray-300">${esc(row.label||row.statId)}</td><td class="text-white font-medium">${now.toFixed(1)}</td><td class="text-emerald-300">+${(next-now).toFixed(1)}</td><td class="text-gray-500 text-[11px]">${esc(row.base)} + ${esc(row.perLevel)}/lv</td></tr>`;
    }).join('')||`<tr><td colspan="4" class="text-gray-500 py-4 text-center">No scaling rows — add Damage / Health curves below.</td></tr>`;

    const levelRows=(p.levelTable||[]).slice(0, Math.min(p.levelTable.length, 40)).map(r=>`
      <tr class="${r.level===simLv?'bg-violet-900/40':''}">
        <td class="text-white font-medium">${r.level}</td>
        <td class="text-gray-300">${r.xp}</td>
        <td><input type="number" min="0" step="1" value="${Number(r.points)||0}" class="w-16 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-xs" onchange="RGD.setLevelPoints(${r.level}, this.value)"></td>
        <td class="text-amber-300 text-xs">${totalPointsAtLevel(r.level)} total</td>
      </tr>`).join('');

    const rank=sel?nodeRank(sel.id):0;
    const max=sel?(Number(sel.maxRank)||1):1;
    const cost=sel?(Number(sel.cost)||1):1;
    const canUp=sel&&nodeUnlocked(sel)&&rank<max&&avail>=cost;
        const reqChips=sel&&(sel.requires||[]).length
      ? (sel.requires||[]).map(rid=>{
          const t=findTreeNode(rid);
          const ok=nodeRank(rid)>=1;
          return `<span class="prog-req-chip">${esc(t?t.name:rid)}${ok?' ✓':' ✗'} <button type="button" title="Remove connection" onclick="RGD.progRemoveRequireChip('${esc(sel.id)}','${esc(rid)}')">×</button></span>`;
        }).join('')
      : '<span class="text-violet-300/70 text-xs">None (root) — use Connect to wire prerequisites</span>';

    const modeBtn=(id,label,icon)=>`<button type="button" onclick="RGD.setProgEditMode('${id}')" class="prog-mode-btn ${mode===id?'is-active':''}"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i> ${label}</button>`;

    const detail=sel?`
      <div class="p-4 prog-detail h-full flex flex-col">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-14 h-14 rounded-xl flex items-center justify-center" style="background:${sel.color}22;color:${sel.color};border:2px solid ${sel.color}">
            <i data-lucide="${esc(sel.icon||'sparkles')}" class="w-7 h-7"></i>
          </div>
          <div>
            <div class="text-lg font-bold text-amber-200">${esc(sel.name)}</div>
            <div class="text-[11px] text-violet-300">${esc(sel.id)} · cost ${cost} pt/rank</div>
          </div>
        </div>
        <p class="text-sm text-gray-300 mb-2">${esc(sel.desc||'No description')}</p>
        <p class="text-xs text-emerald-300 mb-3">${esc(sel.effect||'')}</p>
        <div class="text-2xl font-black text-white mb-1">Upgrade ${rank}/${max}</div>
        <div class="bg-black/30 rounded-lg p-2 text-xs mb-2">
          <div class="flex items-center justify-between mb-1">
            <div class="text-gray-500">Requires</div>
            <button type="button" onclick="RGD.beginWireToSelected()" class="text-[10px] text-amber-300 hover:text-amber-200">+ Wire</button>
          </div>
          <div class="flex flex-wrap gap-1">${reqChips}</div>
        </div>
        <div class="bg-black/30 rounded-lg p-2 text-xs mb-3">
          <div class="text-gray-500">Next rank</div>
          <div class="text-amber-200">${rank>=max?'MAX':('+'+(sel.effect||'effect'))}</div>
        </div>
        <div class="flex gap-2 mb-3">
          <button ${canUp?'':'disabled'} onclick="RGD.simUpgradeNode('${sel.id}')" class="flex-1 py-2.5 prog-upgrade-btn">Upgrade</button>
          <button onclick="RGD.simRefundNode('${sel.id}')" class="px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-xs">−1</button>
        </div>
        <button onclick="RGD.openProgNodeModal('${sel.id}')" class="w-full py-2 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-sm mb-2">Edit node</button>
        <button onclick="RGD.deleteProgNode('${sel.id}')" class="w-full py-2 rounded-lg bg-gray-800 hover:bg-red-900/50 text-red-300 text-xs">Delete node</button>
        <p class="text-[10px] text-gray-500 mt-auto pt-3">Toolbar: <b class="text-violet-300">Add node</b>, <b class="text-violet-300">Connect</b> (draw requires), <b class="text-violet-300">Disconnect</b> (click lines). Drag in Move mode to rearrange.</p>
      </div>`:`<div class="p-6 text-gray-500 text-sm">Click <span class="text-violet-300">+ Add node</span> under the tree, or select a node to edit / delete / wire.</div>`;

    const w=p.tree.width||900, h=p.tree.height||520;
    document.getElementById('tab-progression').innerHTML=`
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div class="xl:col-span-8 prog-shell">
          <div class="prog-head">
            <span>SKILL TREE</span>
            <span class="text-sm font-semibold text-white">Available Points: <span class="text-amber-300">${avail}</span> · Sim Level
              <input type="number" min="1" max="${p.maxLevel}" value="${simLv}" class="ml-1 w-14 bg-violet-950 border border-amber-400/40 rounded px-1 text-amber-200 text-sm" onchange="RGD.setProgSimLevel(this.value)">
            </span>
          </div>
          <div class="prog-tree-view mode-${mode}" id="progTreeView">
            <div class="prog-tree-world" id="progTreeWorld" style="width:${w}px;height:${h}px" ondblclick="RGD.progTreeDblClick(event)">
              ${progEdgesSvg()}
              ${treeNodes().map(progNodeHtml).join('')}
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-violet-900/60 bg-black/20">
            <button onclick="RGD.openProgNodeModal()" class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs flex items-center gap-1"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Add node</button>
            <div class="prog-mode-group">
              ${modeBtn('move','Move','mouse-pointer')}
              ${modeBtn('connect','Connect','link')}
              ${modeBtn('disconnect','Disconnect','unplug')}
            </div>
            <button onclick="RGD.syncSkillTreeUI()" class="px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white text-xs">Sync UI screen</button>
            <button onclick="RGD.progWriteSkillTreeVerse()" class="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs">Write skill tree Verse</button>
            <button onclick="RGD.resetProgSim()" class="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs">Reset spent points</button>
            <button onclick="RGD.rebuildProgLevels()" class="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs">Rebuild level table</button>
            <span class="text-[11px] text-violet-300 ml-auto max-w-md text-right">${esc(progModeHint())}</span>
          </div>
        </div>
        <div class="xl:col-span-4 prog-shell min-h-[420px]">${detail}</div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <div class="text-sm font-semibold text-white">Level curve · points per level</div>
            <label class="text-[11px] text-gray-400">Max Lv <input type="number" min="1" max="200" value="${p.maxLevel}" class="w-16 ml-1 bg-gray-900 border border-gray-700 rounded px-1" onchange="RGD.setProgMaxLevel(this.value)"></label>
          </div>
          <div class="max-h-72 overflow-y-auto">
            <table class="cat-table"><thead><tr><th>Lv</th><th>XP</th><th>Points</th><th>Cumulative</th></tr></thead><tbody>${levelRows}</tbody></table>
          </div>
          <div class="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-700">Default points/level: <input type="number" min="0" value="${Number(p.pointsPerLevel)||1}" class="w-14 bg-gray-900 border border-gray-700 rounded px-1" onchange="RGD.setPointsPerLevel(this.value)"> (used when rebuilding)</div>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <div class="text-sm font-semibold text-white">Scaling at level ${simLv}</div>
            <button onclick="RGD.openScalingModal()" class="text-xs text-indigo-300 hover:text-white">Edit curves</button>
          </div>
          <table class="cat-table"><thead><tr><th>Stat</th><th>At Lv</th><th>Next</th><th>Formula</th></tr></thead><tbody>${scaleRows}</tbody></table>
          <p class="px-4 py-2 text-[11px] text-gray-500">See damage / health / defense grow as the sim level changes — same store the skill tree reads.</p>
        </div>
      </div>`;
    lucide.createIcons();
  }
  function setProgSimLevel(v){ state.meta.progSimLevel=Math.max(1,Math.min(Number(state.progression.maxLevel)||30, Number(v)||1)); syncSkillTreeScreenFromProgression(); save(); renderProgression(); }
  function setProgMaxLevel(v){ ensureProgression(); state.progression.maxLevel=Math.max(1,Math.min(200,Number(v)||30)); rebuildLevelTable(); save({flush:true}); renderProgression(); }
  function setPointsPerLevel(v){ ensureProgression(); state.progression.pointsPerLevel=Math.max(0,Number(v)||0); syncSkillTreeScreenFromProgression(); save(); }
  function setLevelPoints(level, v){
    ensureProgression();
    const row=(state.progression.levelTable||[]).find(r=>r.level===level);
    if(row){ row.points=Math.max(0,Number(v)||0); save(); renderProgression(); }
  }
  function rebuildProgLevels(){ ensureProgression(); rebuildLevelTable(); save({flush:true}); renderProgression(); toast('Level table rebuilt','ok'); }
  function resetProgSim(){ state.meta.progSimRanks={}; syncSkillTreeScreenFromProgression(); save(); renderProgression(); }
  function selectProgNode(id){ state.meta.progSelectedNode=id; syncSkillTreeScreenFromProgression(); save(); renderProgression(); }
  function simUpgradeNode(id){
    const n=findTreeNode(id); if(!n||!nodeUnlocked(n)) return;
    const rank=nodeRank(id), max=Number(n.maxRank)||1, cost=Number(n.cost)||1;
    if(rank>=max||availableSimPoints()<cost) return toast('Not enough points or maxed','warn');
    state.meta.progSimRanks[id]=rank+1; syncSkillTreeScreenFromProgression(); save(); renderProgression();
  }
  function simRefundNode(id){
    const rank=nodeRank(id); if(rank<=0) return;
    state.meta.progSimRanks[id]=rank-1; syncSkillTreeScreenFromProgression(); save(); renderProgression();
  }
  function progHandleConnectClick(id){
    ensureProgression();
    const from=state.meta.progConnectFrom;
    if(!from){
      state.meta.progConnectFrom=id;
      state.meta.progSelectedNode=id;
      renderProgression();
      toast('Now click the node that requires this one','info');
      return;
    }
    if(from===id){ state.meta.progConnectFrom=null; renderProgression(); return; }
    if(addProgRequire(from, id)){
      state.meta.progConnectFrom=null;
      state.meta.progSelectedNode=id;
      state.meta.progEditMode='move';
      renderProgression();
      toast('Connected','ok');
    }
  }
  function progHandleDisconnectClick(id){
    ensureProgression();
    const from=state.meta.progConnectFrom;
    if(!from){
      state.meta.progConnectFrom=id;
      state.meta.progSelectedNode=id;
      renderProgression();
      toast('Click the other linked node to remove the line','info');
      return;
    }
    if(from===id){ state.meta.progConnectFrom=null; renderProgression(); return; }
    const a=findTreeNode(from), b=findTreeNode(id);
    let removed=false;
    if(b&&(b.requires||[]).includes(from)) removed=removeProgRequire(from, id);
    else if(a&&(a.requires||[]).includes(id)) removed=removeProgRequire(id, from);
    state.meta.progConnectFrom=null;
    if(removed){ state.meta.progEditMode='move'; toast('Connection removed','ok'); }
    else toast('Those nodes are not directly linked','warn');
    renderProgression();
  }
  function progEdgeClick(ev, fromId, toId){
    if(ev){ ev.preventDefault(); ev.stopPropagation(); }
    if(progEditMode()!=='disconnect') return;
    if(removeProgRequire(fromId, toId)){
      state.meta.progConnectFrom=null;
      state.meta.progEditMode='move';
      renderProgression();
      toast('Connection removed','ok');
    }
  }
  function progRemoveRequireChip(nodeId, prereqId){
    if(removeProgRequire(prereqId, nodeId)){ renderProgression(); toast('Connection removed','ok'); }
  }
  function progTreeDblClick(ev){
    if(ev.target&&(ev.target.closest&&ev.target.closest('.prog-node'))) return;
    ensureProgression();
    const world=document.getElementById('progTreeWorld');
    if(!world) return;
    const rect=world.getBoundingClientRect();
    const x=Math.max(0, Math.round(ev.clientX-rect.left-36));
    const y=Math.max(0, Math.round(ev.clientY-rect.top-36));
    state.meta.progPlaceXY={x,y};
    openProgNodeModal();
  }
  function progNodeDown(ev, id){
    ev.preventDefault(); ev.stopPropagation();
    const n=findTreeNode(id); if(!n) return;
    const mode=progEditMode();
    if(mode==='connect'){ progHandleConnectClick(id); return; }
    if(mode==='disconnect'){ progHandleDisconnectClick(id); return; }
    _progDrag={id, ox:n.x, oy:n.y, startX:ev.clientX, startY:ev.clientY, moved:false};
    const move=e=>{
      if(!_progDrag) return;
      const dx=e.clientX-_progDrag.startX, dy=e.clientY-_progDrag.startY;
      if(Math.abs(dx)+Math.abs(dy)>3) _progDrag.moved=true;
      const node=findTreeNode(_progDrag.id); if(!node) return;
      node.x=Math.max(0, _progDrag.ox+dx); node.y=Math.max(0, _progDrag.oy+dy);
      const el=document.querySelector('.prog-node[data-nid="'+_progDrag.id+'"]');
      if(el){ el.style.left=node.x+'px'; el.style.top=node.y+'px'; el.classList.add('is-dragging'); }
      const world=document.getElementById('progTreeWorld');
      if(world){ const svg=world.querySelector('.prog-edges'); if(svg) svg.outerHTML=progEdgesSvg(); }
    };
    const up=()=>{
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if(_progDrag){
        const el=document.querySelector('.prog-node[data-nid="'+_progDrag.id+'"]');
        if(el) el.classList.remove('is-dragging');
        if(_progDrag.moved){ syncSkillTreeScreenFromProgression(); save({flush:true}); toast('Node moved','ok'); }
        else selectProgNode(_progDrag.id);
      }
      _progDrag=null;
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
  function openProgNodeModal(id){
    ensureProgression();
    const place=state.meta.progPlaceXY||null;
    state.meta.progPlaceXY=null;
    const n=findTreeNode(id)||{id:'',name:'',x:place?place.x:120,y:place?place.y:120,maxRank:5,cost:1,requires:[],icon:'sparkles',color:'#a855f7',desc:'',effect:'',statMods:{}};
    if(!id&&place){ n.x=place.x; n.y=place.y; }
    const req=(n.requires||[]).join(', ');
    const others=treeNodes().filter(x=>x.id!==n.id).map(x=>x.id).join(', ');
    modalShell(id?'Edit skill node':'Add skill node',`
      <div class="grid grid-cols-2 gap-3">
        ${field('Node ID',`<input id="mPnId" value="${esc(n.id)}" ${id?'readonly':''} placeholder="shield" class="${IN} ${id?'opacity-60':''}">`)}
        ${field('Name',`<input id="mPnName" value="${esc(n.name)}" placeholder="Shield" class="${IN}">`)}
        ${field('Max rank',`<input id="mPnMax" type="number" min="1" value="${Number(n.maxRank)||1}" class="${IN}">`)}
        ${field('Cost / rank',`<input id="mPnCost" type="number" min="1" value="${Number(n.cost)||1}" class="${IN}">`)}
        ${field('Icon (lucide)',`<input id="mPnIcon" value="${esc(n.icon||'sparkles')}" class="${IN}">`)}
        ${field('Color',`<input id="mPnColor" type="color" value="${n.color||'#a855f7'}" class="w-full h-9 bg-gray-900 border border-gray-700 rounded-lg">`)}
      </div>
      ${field('Requires (optional — or use Connect on the tree)',`<input id="mPnReq" value="${esc(req)}" placeholder="${esc(others||'shield')}" class="${IN} font-mono text-xs">`)}
      ${field('Description',`<textarea id="mPnDesc" rows="2" class="${IN}">${esc(n.desc||'')}</textarea>`)}
      ${field('Effect summary',`<input id="mPnEffect" value="${esc(n.effect||'')}" placeholder="+Defense / rank" class="${IN}">`)}
      <input type="hidden" id="mPnX" value="${Number(n.x)||120}">
      <input type="hidden" id="mPnY" value="${Number(n.y)||120}">
      <p class="text-[11px] text-gray-500">Tip: after saving, use <b>Connect</b> on the tree toolbar to draw prerequisite lines by clicking nodes. Double-click empty tree space to add a node there.</p>
    `,`RGD.saveProgNode('${id||''}')`);
  }
  function saveProgNode(id){
    ensureProgression();
    const name=val('mPnName').trim();
    let nid=id||val('mPnId').trim().toLowerCase().replace(/[^a-z0-9_]/g,'_');
    if(!nid||!name) return toast('ID and name required','warn');
    if(!id&&findTreeNode(nid)) return toast('Node id exists','warn');
    const requires=val('mPnReq').split(',').map(s=>s.trim()).filter(Boolean);
    const xEl=document.getElementById('mPnX'), yEl=document.getElementById('mPnY');
    const rec={
      id:nid, name,
      x:id?(findTreeNode(id).x):(xEl?Number(xEl.value)||120:120+(treeNodes().length%4)*80),
      y:id?(findTreeNode(id).y):(yEl?Number(yEl.value)||120:80+Math.floor(treeNodes().length/4)*90),
      maxRank:Math.max(1,Number(val('mPnMax'))||1),
      cost:Math.max(1,Number(val('mPnCost'))||1),
      requires, icon:val('mPnIcon')||'sparkles', color:val('mPnColor')||'#a855f7',
      desc:val('mPnDesc'), effect:val('mPnEffect'),
      statMods:(id&&findTreeNode(id).statMods)||{}
    };
    if(id){ const i=treeNodes().findIndex(n=>n.id===id); state.progression.tree.nodes[i]=rec; }
    else state.progression.tree.nodes.push(rec);
    state.meta.progSelectedNode=nid;
    syncSkillTreeScreenFromProgression();
    save({flush:true}); closeModal(); renderProgression(); toast('Node saved','ok');
  }
  function deleteProgNode(id){
    confirmModal('Delete Skill Node',
      'Delete skill node <code class="text-indigo-300">'+esc(id)+'</code>?',
      "RGD.confirmDeleteProgNode('"+id+"')");
  }
  function confirmDeleteProgNode(id){
    closeModal();
    ensureProgression();
    state.progression.tree.nodes=treeNodes().filter(n=>n.id!==id);
    treeNodes().forEach(n=>{ n.requires=(n.requires||[]).filter(r=>r!==id); });
    delete state.meta.progSimRanks[id];
    if(state.meta.progSelectedNode===id) state.meta.progSelectedNode=null;
    if(state.meta.progConnectFrom===id) state.meta.progConnectFrom=null;
    syncSkillTreeScreenFromProgression();
    save({flush:true}); renderProgression(); toast('Node deleted','ok');
  }
  function openScalingModal(){
    ensureProgression();
    const rows=(state.progression.scaling||[]).map((r,i)=>`
      <div class="grid grid-cols-4 gap-2 mb-2">
        <input data-si="${i}" data-k="label" value="${esc(r.label||r.statId)}" class="${IN}" placeholder="Damage">
        <input data-si="${i}" data-k="base" type="number" value="${Number(r.base)||0}" class="${IN}" placeholder="base">
        <input data-si="${i}" data-k="perLevel" type="number" step="0.1" value="${Number(r.perLevel)||0}" class="${IN}" placeholder="/level">
        <input data-si="${i}" data-k="statId" value="${esc(r.statId||'')}" class="${IN} font-mono text-xs" placeholder="attack">
      </div>`).join('');
    modalShell('Scaling curves',`
      <p class="text-[11px] text-gray-400 mb-2">Label · Base · Per level · Stat id</p>
      <div id="mScaleRows">${rows||'<div class="text-gray-500 text-sm">No rows</div>'}</div>
      <button onclick="RGD.addScalingRow()" class="mt-2 text-xs text-indigo-300">+ Add row</button>
    `,`RGD.saveScaling()`);
  }
  function addScalingRow(){
    ensureProgression();
    state.progression.scaling.push({statId:'attack',label:'Damage',base:20,perLevel:2,curve:'linear'});
    openScalingModal();
  }
  function saveScaling(){
    ensureProgression();
    const next=[];
    document.querySelectorAll('#mScaleRows [data-si]').forEach(inp=>{
      const i=Number(inp.dataset.si); if(!next[i]) next[i]={curve:'linear'};
      const k=inp.dataset.k;
      next[i][k]=(k==='base'||k==='perLevel')?Number(inp.value)||0:inp.value;
    });
    state.progression.scaling=next.filter(Boolean);
    save({flush:true}); closeModal(); renderProgression(); toast('Scaling saved','ok');
  }


  function syncSkillTreeUI(){
    if(typeof syncSkillTreeScreenFromProgression!=='function'){
      return toast('UI sync not loaded','warn');
    }
    syncSkillTreeScreenFromProgression({rerender:true});
    save({flush:true});
    toast('Skill Tree UI synced from Progression','ok');
  }

  function progVerseFloat(v){
    const x = Math.round((Number(v)||0) * 100) / 100;
    if(Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x))+'.0';
    return String(x);
  }
  function progVerseStr(s){
    return '"'+String(s==null?'':s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'').replace(/\n/g,'\\n')+'"';
  }
  function progBuildSkillTreeCatalogVerse(){
    ensureProgression();
    const tree = state.progression.tree || {};
    const nodes = Array.isArray(tree.nodes) ? tree.nodes : [];
    const w = progVerseFloat(tree.width != null ? tree.width : 900);
    const h = progVerseFloat(tree.height != null ? tree.height : 520);
    const L = [];
    L.push('using { /Verse.org/Simulation }');
    L.push('');
    L.push('# Generated by the Roguelike Design Platform · Progression tab.');
    L.push('# The tab is the source of truth: re-export replaces this file.');
    L.push('# Tree size and node list mirror progression.tree in .ducky/roguelike-design/store.json.');
    L.push('');
    L.push('SkillTreeBoardW <public> : float = '+w);
    L.push('SkillTreeBoardH <public> : float = '+h);
    L.push('');
    L.push('MakeSkillCatalog <public>() : []skill_node_def =');
    if(!nodes.length){
      L.push('    array{}');
      L.push('');
      return L.join('\n');
    }
    L.push('    array:');
    for(const n of nodes){
      const req = Array.isArray(n.requires) ? n.requires : [];
      const reqLit = req.length
        ? 'array{'+req.map(r=>progVerseStr(r)).join(', ')+'}'
        : 'array{}';
      const hex = String(n.color||'#38bdf8').replace(/^#/,'').slice(0,6).toLowerCase() || '38bdf8';
      L.push('        skill_node_def{');
      L.push('            NodeId := '+progVerseStr(n.id||''));
      L.push('            DisplayName := '+progVerseStr(n.name||n.id||''));
      L.push('            MaxRank := '+Math.max(1, Math.floor(Number(n.maxRank)||1)));
      L.push('            Cost := '+Math.max(1, Math.floor(Number(n.cost)||1)));
      L.push('            Requires := '+reqLit);
      L.push('            Effect := '+progVerseStr(n.effect||''));
      L.push('            Desc := '+progVerseStr(n.desc||''));
      L.push('            ColorHex := '+progVerseStr(hex));
      L.push('            X := '+progVerseFloat(n.x));
      L.push('            Y := '+progVerseFloat(n.y));
      L.push('        }');
    }
    L.push('');
    return L.join('\n');
  }
  async function progWriteSkillTreeVerse(){
    ensureProgression();
    const nodes = (state.progression.tree && state.progression.tree.nodes) || [];
    if(!nodes.length) return toast('No skill nodes — add some in Progression first','warn');
    const content = progBuildSkillTreeCatalogVerse();
    const path = 'Content/Verse/GameDevices/Gameplay/Screens/Hub/skill_tree_catalog.verse';
    try{
      const r = await rgdRpc('ui_write_verse', { files:[{ path, content }] }, 20000);
      if(r && r.ok){
        const skipped = (r.skipped||[]).length;
        toast('Wrote skill_tree_catalog.verse ('+nodes.length+' nodes)'+(skipped?' · skipped '+skipped:'')+' — Build Verse in UEFN','ok');
      } else {
        toast('Write failed: '+((r&&r.error)||'no response'),'err');
      }
    }catch(e){
      toast('Write failed: '+String(e&&e.message||e),'err');
    }
  }

  /* ===== stats ===== */
  function renderStats(){ const rows=state.stats.map(s=>`
    <tr class="cat-row border-b border-gray-700/60" onclick="RGD.openStatModal('${s.id}')"><td class="py-2 px-3"><code class="text-xs text-indigo-300">${esc(s.id)}</code></td><td class="py-2 px-3 text-sm">${esc(s.name)}</td><td class="py-2 px-3 text-sm text-gray-300">${s.def}</td>
    <td class="py-2 px-3 text-right" onclick="event.stopPropagation()"><button onclick="event.stopPropagation();RGD.openStatModal('${s.id}')" class="text-gray-400 hover:text-white mr-2"><i data-lucide="pencil" class="w-4 h-4"></i></button><button onclick="event.stopPropagation();RGD.deleteStat('${s.id}')" class="text-gray-400 hover:text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`).join('')
    ||`<tr><td colspan="4" class="py-8 text-center text-gray-500 text-sm">No stats yet.</td></tr>`;
    document.getElementById('tab-stats').innerHTML=`
      <div class="flex items-center justify-between mb-4"><p class="text-sm text-gray-400 max-w-xl">These global stats dynamically generate the input fields in NPC &amp; Item editors — and become readable/writable fields through the plugin's MCP tools.</p>
      <button onclick="RGD.openStatModal()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-2 shrink-0"><i data-lucide="plus" class="w-4 h-4"></i> Add Stat</button></div>
      <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden"><table class="w-full"><thead><tr class="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-700"><th class="text-left py-2 px-3">ID</th><th class="text-left py-2 px-3">Display Name</th><th class="text-left py-2 px-3">Default</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ===== difficulties ===== */
  function renderDifficulties(){
    const diffs=(state.difficulties||[]).slice().sort((a,b)=>(a.index||0)-(b.index||0));
    const menuRows=diffs.map(d=>`
      <tr class="border-b border-gray-700/60">
        <td class="py-2 px-3"><code class="text-xs text-indigo-300">${esc(d.id)}</code></td>
        <td class="py-2 px-3 text-sm font-medium">${esc(d.name)}</td>
        <td class="py-2 px-3 text-sm text-gray-300">${d.enemyCountPercent}%</td>
        <td class="py-2 px-3 text-xs text-gray-400">${esc(d.description||'')}</td>
      </tr>`).join('')||`<tr><td colspan="4" class="py-8 text-center text-gray-500 text-sm">No difficulty tiers defined.</td></tr>`;
    const npcRows=state.npcs.map(n=>{
      const ds=n.difficultyStats||[];
      const cells=diffs.map((d,i)=>{
        const s=ds[d.index!=null?d.index:i]||ds[i]||{};
        return `<td class="py-2 px-2 text-[11px] text-gray-300 whitespace-nowrap">${s.maxHealth||'—'} HP · ×${s.damageMultiplier||'?'} · dodge ${s.dodgeChance??'—'}%</td>`;
      }).join('');
      return `<tr class="border-b border-gray-800/70"><td class="py-2 px-3 text-sm text-white">${esc(n.name)}</td>${cells}</tr>`;
    }).join('')||`<tr><td colspan="4" class="py-8 text-center text-gray-500 text-sm">Create NPCs first.</td></tr>`;
    const head=diffs.map(d=>`<th class="text-left py-2 px-2 text-[11px] text-gray-500">${esc(d.name)}</th>`).join('');
    document.getElementById('tab-difficulties').innerHTML=`
      <div class="mb-4"><p class="text-sm text-gray-400 max-w-3xl">Matches <code class="text-indigo-300">roguelike_game_manager</code> Easy/Normal/Hard menu and each NPC device's <code class="text-indigo-300">EasyStats / NormalStats / HardStats</code> block. Use this table to wire identical values in UEFN Details.</p></div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden xl:col-span-1">
          <div class="px-4 py-3 border-b border-gray-700 text-sm font-semibold text-white">Menu tiers</div>
          <table class="w-full"><thead><tr class="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-700"><th class="text-left py-2 px-3">ID</th><th class="text-left py-2 px-3">Name</th><th class="text-left py-2 px-3">Wave %</th><th class="text-left py-2 px-3">Notes</th></tr></thead><tbody>${menuRows}</tbody></table>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto xl:col-span-2">
          <div class="px-4 py-3 border-b border-gray-700 text-sm font-semibold text-white">Per-enemy difficulty stats</div>
          <table class="w-full min-w-[640px]"><thead><tr class="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-700"><th class="text-left py-2 px-3">Enemy</th>${head}</tr></thead><tbody>${npcRows}</tbody></table>
        </div>
      </div>`;
  }

  /* ===== catalogue cards / table view ===== */
  function catalogueView(){ return (state.meta&&state.meta.catalogueView)==='table'?'table':'cards'; }
  function setCatalogueView(mode){
    if(!state.meta) state.meta={};
    state.meta.catalogueView=(mode==='table')?'table':'cards';
    save();
    const tab=state.meta.activeTab;
    if(tab==='npcs') renderNPCs();
    else if(tab==='items') renderItems();
    else if(tab==='weapons') renderWeapons();
    else if(tab==='wizardry') renderWizardry();
    lucide.createIcons();
  }
  function viewToggleHtml(){
    const v=catalogueView();
    return `<div class="view-toggle" title="Cards or table list">
      <button type="button" class="${v==='cards'?'is-on':''}" onclick="RGD.setCatalogueView('cards')"><i data-lucide="layout-grid" class="w-3.5 h-3.5"></i> Cards</button>
      <button type="button" class="${v==='table'?'is-on':''}" onclick="RGD.setCatalogueView('table')"><i data-lucide="table" class="w-3.5 h-3.5"></i> Table</button>
    </div>`;
  }

  /* ===== drops (scrolls + buffs) =====
     Drops replaced generic items: every drop is a scroll or a buff, and every one
     carries a category from this list. Legacy labels (Consumable / Armor / Relic /
     Currency / Key) are folded in by dropCategory, by name first then by which stat
     the drop actually modifies. */
  const DROP_CATEGORIES=['Scroll','Health','Shield','Damage','Speed','Defense','Utility','Currency'];
  function dropCategory(it){
    const cat=String((it&&it.category)||'').trim();
    if(DROP_CATEGORIES.indexOf(cat)>=0) return cat;
    const name=String((it&&it.name)||'');
    if((it&&it.currencyReward&&Object.keys(it.currencyReward).some(k=>Number(it.currencyReward[k]))) || /\b(gold|coin|gems?|purse|currency)\b/i.test(name)) return 'Currency';
    if(/scroll/i.test(cat)||/scroll/i.test(name)) return 'Scroll';
    if(/shield/i.test(name)) return 'Shield';
    if(/health|potion|heal|medkit/i.test(name)) return 'Health';
    const s=(it&&it.stats)||{};
    if(Number(s.hp)) return 'Health';
    if(Number(s.speed)) return 'Speed';
    if(Number(s.attack)) return 'Damage';
    if(Number(s.defense)) return 'Defense';
    return 'Utility';
  }
  function dropsByCategory(cat){
    const list=state.items||[];
    return (!cat||cat==='All')?list.slice():list.filter(i=>dropCategory(i)===cat);
  }
  /* Rewrite legacy categories once on load so the store matches what is on screen. */
  function normalizeDrops(){
    let changed=false;
    (state.items||[]).forEach(i=>{
      const c=dropCategory(i);
      if(i.category!==c){ i.category=c; changed=true; }
      if(!i.currencyReward||typeof i.currencyReward!=='object'){ i.currencyReward={}; changed=true; }
      if(!i.price||typeof i.price!=='object'){ i.price={currencyId:'gold',amount:0}; changed=true; }
    });
    return changed;
  }
  function setDropFilter(c){ state.meta.dropFilter=c; save(); renderItems(); lucide.createIcons(); }

  /* ===== npcs / items =====
     NPCs use two axes (same idea as drop categories):
       type = Enemy | Elite | Boss | Friendly   (threat / affiliation)
       role = Melee | Ranged | Caster | Charger | Support | Civilian
     Legacy Merchant/NPC/Ally fold into Friendly. */
  const NPC_TYPES=['Enemy','Elite','Boss','Friendly'];
  const NPC_ROLES=['Melee','Ranged','Caster','Charger','Support','Civilian'];
  function npcType(n){
    const t=String((n&&n.type)||'').trim();
    if(NPC_TYPES.indexOf(t)>=0) return t;
    const low=t.toLowerCase();
    if(low==='elite') return 'Elite';
    if(low==='boss') return 'Boss';
    if(['merchant','npc','ally','friendly','quest','vendor'].indexOf(low)>=0) return 'Friendly';
    return 'Enemy';
  }
  function npcRole(n){
    const r=String((n&&n.role)||'').trim();
    if(NPC_ROLES.indexOf(r)>=0) return r;
    const b=String((n&&n.behavior)||'').toLowerCase();
    if(/cast|mage|wizard|sorcer/.test(b)) return 'Caster';
    if(/charge|rush|bomb|splod/.test(b)) return 'Charger';
    if(/range|archer|kite|lob|sniper|gun/.test(b)) return 'Ranged';
    if(/heal|buff|support|merchant|shop|vendor/.test(b)) return 'Support';
    if(/friend|civilian|quest|ally|\bnpc\b/.test(b)) return 'Civilian';
    const rng=n&&n.stats&&n.stats.range;
    if(typeof rng==='number' && rng>=1000) return 'Ranged';
    return npcType(n)==='Friendly'?'Civilian':'Melee';
  }
  function npcsFiltered(){
    const tf=state.meta.npcTypeFilter||'All';
    const rf=state.meta.npcRoleFilter||'All';
    return (state.npcs||[]).filter(n=>{
      if(tf!=='All' && npcType(n)!==tf) return false;
      if(rf!=='All' && npcRole(n)!==rf) return false;
      return true;
    });
  }
  function normalizeNpcs(){
    let changed=false;
    if(!state.npcs) state.npcs=[];
    // Starter friendly — same id as backend DEFAULT_NPCS. A tab that loaded before
    // v1.5 would otherwise keep saving a catalogue without him.
    if(!state.npcs.some(n=>n&&n.id==='wizard_bob')){
      state.npcs.push({
        id:'wizard_bob', name:'Wizard Bob', type:'Friendly', role:'Support',
        symbol:'W', color:'#38bdf8', behavior:'Friendly Caster',
        stats:{hp:120,attack:0,defense:8,speed:250,range:0,cooldown:0,chaserange:0,spread:0,sidestep:0},
        difficultyStats:[]
      });
      changed=true;
    }
    state.npcs.forEach(n=>{
      const t=npcType(n), r=npcRole(n);
      if(n.type!==t){ n.type=t; changed=true; }
      if(n.role!==r){ n.role=r; changed=true; }
      if(!Array.isArray(n.dropTableIds)){ n.dropTableIds=[]; changed=true; }
      if(!Array.isArray(n.bonusDrops)){ n.bonusDrops=[]; changed=true; }
      else {
        const ne=normalizeDropEntries(n.bonusDrops);
        if(JSON.stringify(ne)!==JSON.stringify(n.bonusDrops)){ n.bonusDrops=ne; changed=true; }
      }
      if(!n.currencyDrop||typeof n.currencyDrop!=='object'){ n.currencyDrop={}; changed=true; }
    });
    if(typeof ensureDropTables==='function') ensureDropTables();
    return changed;
  }
  function setNpcTypeFilter(c){ state.meta.npcTypeFilter=c; save(); renderNPCs(); lucide.createIcons(); }
  function setNpcRoleFilter(c){ state.meta.npcRoleFilter=c; save(); renderNPCs(); lucide.createIcons(); }
  function renderNPCs(){
    const tf=state.meta.npcTypeFilter||'All';
    const rf=state.meta.npcRoleFilter||'All';
    const list=npcsFiltered();
    const typeChips=['All',...NPC_TYPES].map(c=>{
      const n=c==='All'?(state.npcs||[]).length:(state.npcs||[]).filter(x=>npcType(x)===c).length;
      return `<button onclick="RGD.setNpcTypeFilter('${c}')" class="px-2.5 py-1 rounded-lg text-[11px] border ${tf===c?'bg-indigo-600 border-indigo-500 text-white':'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}">${c} <span class="opacity-60">${n}</span></button>`;
    }).join('');
    const roleChips=['All',...NPC_ROLES].map(c=>{
      const n=c==='All'?(state.npcs||[]).length:(state.npcs||[]).filter(x=>npcRole(x)===c).length;
      return `<button onclick="RGD.setNpcRoleFilter('${c}')" class="px-2.5 py-1 rounded-lg text-[11px] border ${rf===c?'bg-rose-700 border-rose-600 text-white':'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}">${c} <span class="opacity-60">${n}</span></button>`;
    }).join('');
    const body=catalogueView()==='table' ? npcTableHtml(list) : npcCardsHtml(list,tf);
    document.getElementById('tab-npcs').innerHTML=`
      <div class="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div class="max-w-3xl">
          <p class="text-sm text-gray-400"><span class="text-rose-300">Enemy / Elite / Boss</span> you fight · <span class="text-sky-300">Friendly</span> (Wizard Bob &amp; friends) you talk to. Role is how they fight (or don't).</p>
          <div class="flex flex-wrap gap-1.5 mt-3">${typeChips}</div>
          <div class="flex flex-wrap gap-1.5 mt-1.5">${roleChips}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">${viewToggleHtml()}<button onclick="RGD.openNPCModal()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Create NPC</button></div>
      </div>
      ${body}`;
  }
  function npcCardsHtml(list,typeFilter){
    if(!list.length) return `<div class="py-12 text-center text-gray-500 text-sm">No NPCs in this filter.</div>`;
    const grid=items=>`<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">${items.map(n=>entityCard(n,'npc')).join('')}</div>`;
    if(typeFilter!=='All') return grid(list);
    return NPC_TYPES.map(c=>{
      const group=list.filter(n=>npcType(n)===c);
      if(!group.length) return '';
      return `<div class="mb-5"><div class="flex items-center gap-2 mb-2"><span class="text-xs font-semibold uppercase tracking-wide text-gray-300">${c}</span><span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">${group.length}</span></div>${grid(group)}</div>`;
    }).join('');
  }
  function renderItems(){
    const filter=state.meta.dropFilter||'All';
    const list=dropsByCategory(filter);
    const chips=['All',...DROP_CATEGORIES].map(c=>{
      const n=c==='All'?(state.items||[]).length:dropsByCategory(c).length;
      return `<button onclick="RGD.setDropFilter('${c}')" class="px-2.5 py-1 rounded-lg text-[11px] border ${filter===c?'bg-indigo-600 border-indigo-500 text-white':'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}">${c} <span class="opacity-60">${n}</span></button>`;
    }).join('');
    const body=catalogueView()==='table' ? itemTableHtml(list) : dropCardsHtml(list,filter);
    document.getElementById('tab-items').innerHTML=`
      <div class="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div class="max-w-2xl">
          <p class="text-sm text-gray-400">Drops are <span class="text-amber-300">scrolls</span> and <span class="text-emerald-300">buffs</span> only — no generic items. Stat fields are MODIFIERS (e.g. +10 HP) applied on pickup.</p>
          <div class="flex flex-wrap gap-1.5 mt-3">${chips}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">${viewToggleHtml()}<button onclick="RGD.openItemModal()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Add Drop</button></div>
      </div>
      ${body}`;
  }
  /* Cards stay grouped by category so an unfiltered list still reads as categories. */
  function dropCardsHtml(list,filter){
    if(!list.length) return `<div class="py-12 text-center text-gray-500 text-sm">No drops in this category.</div>`;
    const grid=items=>`<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">${items.map(i=>entityCard(i,'item')).join('')}</div>`;
    if(filter!=='All') return grid(list);
    return DROP_CATEGORIES.map(c=>{
      const group=list.filter(i=>dropCategory(i)===c);
      if(!group.length) return '';
      return `<div class="mb-5"><div class="flex items-center gap-2 mb-2"><span class="text-xs font-semibold uppercase tracking-wide text-gray-300">${c}</span><span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">${group.length}</span></div>${grid(group)}</div>`;
    }).join('');
  }
  function npcTableHtml(list){
    list=list||state.npcs||[];
    if(!list.length) return `<div class="py-12 text-center text-gray-500 text-sm">No NPCs in this filter.</div>`;
    const rows=list.map(n=>{
      const hp=(n.stats&&n.stats.hp!=null)?n.stats.hp:'—';
      const atk=(n.stats&&n.stats.attack!=null)?n.stats.attack:'—';
      return `<tr class="cat-row" onclick="RGD.openNPCModal('${n.id}')">
        <td><span class="inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold" style="background:${n.color}22;color:${n.color};border:1px solid ${n.color}55">${esc(n.symbol||'?')}</span></td>
        <td class="text-white font-medium">${esc(n.name)}</td>
        <td class="text-gray-300">${esc(npcType(n))}</td>
        <td class="text-gray-300">${esc(npcRole(n))}</td>
        <td class="text-gray-400">${esc(n.behavior||'—')}</td>
        <td class="text-gray-300">${hp}</td>
        <td class="text-gray-300">${atk}</td>
        <td class="text-right whitespace-nowrap" onclick="event.stopPropagation()">
          <button onclick="event.stopPropagation();RGD.spawnEntity('npc','${n.id}')" class="text-gray-400 hover:text-indigo-300 mr-2" title="Spawn"><i data-lucide="box" class="w-3.5 h-3.5"></i></button>
          <button onclick="event.stopPropagation();RGD.openNPCModal('${n.id}')" class="text-gray-400 hover:text-white mr-2"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
          <button onclick="event.stopPropagation();RGD.deleteNPC('${n.id}')" class="text-gray-400 hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </td>
      </tr>`;
    }).join('');
    return `<div class="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto"><table class="cat-table min-w-[780px]"><thead><tr><th></th><th>Name</th><th>Type</th><th>Role</th><th>Behavior</th><th>HP</th><th>Atk</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function itemTableHtml(list){
    list=list||state.items||[];
    if(!list.length) return `<div class="py-12 text-center text-gray-500 text-sm">No drops in this category.</div>`;
    const rows=list.map(i=>{
      const mods=state.stats.map(s=>{
        const v=(i.stats&&i.stats[s.id]!=null)?i.stats[s.id]:0;
        if(!v) return '';
        const sign=v>0?'+':'';
        return `<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 ${v>0?'text-emerald-300':v<0?'text-red-300':'text-gray-400'}">${esc(s.id)}${sign}${v}</span>`;
      }).filter(Boolean).join(' ')||'<span class="text-gray-600">—</span>';
      return `<tr class="cat-row" onclick="RGD.openItemModal('${i.id}')">
        <td><span class="inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold" style="background:${i.color}22;color:${i.color};border:1px solid ${i.color}55">${esc(i.symbol||'?')}</span></td>
        <td class="text-white font-medium">${esc(i.name)}</td>
        <td class="text-gray-300">${esc(dropCategory(i))}</td>
        <td class="text-gray-400 max-w-[220px] truncate" title="${esc(i.desc||'')}">${esc(i.desc||'—')}</td>
        <td><div class="flex flex-wrap gap-1">${mods}</div></td>
        <td class="text-right whitespace-nowrap" onclick="event.stopPropagation()">
          <button onclick="event.stopPropagation();RGD.spawnEntity('item','${i.id}')" class="text-gray-400 hover:text-indigo-300 mr-2" title="Spawn"><i data-lucide="box" class="w-3.5 h-3.5"></i></button>
          <button onclick="event.stopPropagation();RGD.openItemModal('${i.id}')" class="text-gray-400 hover:text-white mr-2"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
          <button onclick="event.stopPropagation();RGD.deleteItem('${i.id}')" class="text-gray-400 hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </td>
      </tr>`;
    }).join('');
    return `<div class="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto"><table class="cat-table min-w-[800px]"><thead><tr><th></th><th>Name</th><th>Category</th><th>Description</th><th>Modifiers</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function entityCard(e,kind){
    const stats=state.stats.map(s=>{ const v=(e.stats&&e.stats[s.id]!=null)?e.stats[s.id]:(kind==='item'?0:s.def); const sign=kind==='item'&&v>0?'+':'';
      return `<div class="flex justify-between"><span class="text-gray-500">${esc(s.name)}</span><span class="${kind==='item'&&v>0?'text-emerald-400':kind==='item'&&v<0?'text-red-400':'text-gray-300'}">${sign}${v}</span></div>`; }).join('');
    const money=kind==='npc'?formatCurrencyBag(e.currencyDrop):(formatCurrencyBag(e.currencyReward)+(Number((e.price||{}).amount)?' · buy '+formatPrice(e.price):''));
    const meta=kind==='npc'?`<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">${esc(npcType(e))}</span><span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-rose-300">${esc(npcRole(e))}</span>`:`<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">${esc(dropCategory(e))}</span>`;
    const openFn=kind==='npc'?`RGD.openNPCModal('${e.id}')`:`RGD.openItemModal('${e.id}')`;
    const spawnFn=`RGD.spawnEntity('${kind}','${e.id}')`; const delFn=kind==='npc'?`RGD.deleteNPC('${e.id}')`:`RGD.deleteItem('${e.id}')`;
    return `<div class="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col">
      <div class="flex items-start justify-between"><div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-lg flex items-center justify-center text-xl font-bold" style="background:${e.color}22;color:${e.color};border:1px solid ${e.color}55">${esc(e.symbol||'?')}</div>
        <div><div class="text-sm font-semibold text-white leading-tight">${esc(e.name)}</div><div class="flex gap-1 mt-1 flex-wrap">${meta}</div></div></div>
        <div class="flex gap-1"><button onclick="${openFn}" class="text-gray-500 hover:text-white"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button><button onclick="${delFn}" class="text-gray-500 hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button></div></div>
      ${kind==='item'&&e.desc?`<p class="text-[11px] text-gray-500 mt-2 line-clamp-2">${esc(e.desc)}</p>`:''}
      ${money&&money!=='—'?`<p class="text-[11px] text-amber-300/90 mt-1">${esc(money)}</p>`:''}
      ${kind==='npc'?npcDiffLine(e):''}${kind==='npc'?npcLootPreviewLine(e):''}
      <div class="mt-3 space-y-1 text-[11px] flex-1">${stats||'<span class="text-gray-600">No stats</span>'}</div>
      <button onclick="${spawnFn}" class="mt-3 w-full px-2 py-1.5 rounded-lg bg-gray-700 hover:bg-indigo-600 text-xs text-gray-200 hover:text-white flex items-center justify-center gap-1.5 transition"><i data-lucide="box" class="w-3.5 h-3.5"></i> Spawn in UEFN</button></div>`;
  }

  /* ===== drop tables (shared loot pools + per-NPC bonus) =====
     Named tables live in state.dropTables[]. NPCs attach via dropTableIds[]
     and can also list unique bonusDrops[] with the same entry shape:
       { itemId, chance, weight, qtyMin, qtyMax, guaranteed } */
  function ensureDropTables(){
    if(!Array.isArray(state.dropTables)) state.dropTables=[];
    let changed=false;
    if(!state.dropTables.length){
      state.dropTables=[
        {id:'dt_common_trash',name:'Common Trash',color:'#94a3b8',desc:'Shared loot for basic enemies.',entries:[
          {itemId:'health_potion',chance:35,weight:3,qtyMin:1,qtyMax:1,guaranteed:false},
          {itemId:'gold_purse',chance:60,weight:5,qtyMin:1,qtyMax:1,guaranteed:false},
          {itemId:'swift_boots',chance:8,weight:1,qtyMin:1,qtyMax:1,guaranteed:false}
        ]},
        {id:'dt_elite_cache',name:'Elite Cache',color:'#f59e0b',desc:'Richer shared table for elites.',entries:[
          {itemId:'damage_charm',chance:40,weight:2,qtyMin:1,qtyMax:1,guaranteed:false},
          {itemId:'iron_shield',chance:35,weight:2,qtyMin:1,qtyMax:1,guaranteed:false},
          {itemId:'health_potion',chance:70,weight:3,qtyMin:1,qtyMax:2,guaranteed:false},
          {itemId:'gold_purse',chance:100,weight:4,qtyMin:1,qtyMax:2,guaranteed:true}
        ]},
        {id:'dt_boss_hoard',name:'Boss Hoard',color:'#ef4444',desc:'Boss shared table.',entries:[
          {itemId:'damage_charm',chance:100,weight:2,qtyMin:1,qtyMax:1,guaranteed:true},
          {itemId:'iron_shield',chance:80,weight:2,qtyMin:1,qtyMax:1,guaranteed:false},
          {itemId:'gold_purse',chance:100,weight:3,qtyMin:2,qtyMax:4,guaranteed:true},
          {itemId:'health_potion',chance:100,weight:2,qtyMin:1,qtyMax:3,guaranteed:true}
        ]}
      ];
      changed=true;
    }
    state.dropTables.forEach(t=>{ t.entries=normalizeDropEntries(t.entries); });
    return changed;
  }
  function normalizeDropEntry(e){
    if(!e||typeof e!=='object') return null;
    const itemId=String(e.itemId||e.item_id||'').trim();
    if(!itemId) return null;
    let qtyMin=Number(e.qtyMin!=null?e.qtyMin:(e.qty_min!=null?e.qty_min:1)); if(!isFinite(qtyMin)||qtyMin<0) qtyMin=1;
    let qtyMax=Number(e.qtyMax!=null?e.qtyMax:(e.qty_max!=null?e.qty_max:qtyMin)); if(!isFinite(qtyMax)||qtyMax<qtyMin) qtyMax=qtyMin;
    let chance=Number(e.chance!=null?e.chance:100); if(!isFinite(chance)) chance=100;
    let weight=Number(e.weight!=null?e.weight:1); if(!isFinite(weight)) weight=1;
    return {itemId, chance, weight, qtyMin, qtyMax, guaranteed:!!e.guaranteed};
  }
  function normalizeDropEntries(list){
    if(!Array.isArray(list)) return [];
    return list.map(normalizeDropEntry).filter(Boolean);
  }
  function dropTableById(id){ return (state.dropTables||[]).find(t=>t.id===id)||null; }
  function itemById(id){ return (state.items||[]).find(i=>i.id===id)||null; }
  function npcsUsingDropTable(tableId){
    return (state.npcs||[]).filter(n=>(n.dropTableIds||[]).indexOf(tableId)>=0);
  }
  function linksForItem(itemId){
    const tables=(state.dropTables||[]).filter(t=>(t.entries||[]).some(e=>e.itemId===itemId));
    const npcs=(state.npcs||[]).filter(n=>{
      if((n.bonusDrops||[]).some(e=>e.itemId===itemId)) return true;
      return (n.dropTableIds||[]).some(tid=>{
        const t=dropTableById(tid);
        return t&&(t.entries||[]).some(e=>e.itemId===itemId);
      });
    });
    return {tables, npcs};
  }
  function entrySummary(e){
    const it=itemById(e.itemId);
    const name=it?it.name:e.itemId;
    const qty=e.qtyMin===e.qtyMax?('x'+e.qtyMin):('x'+e.qtyMin+'-'+e.qtyMax);
    const g=e.guaranteed?' · guaranteed':'';
    return esc(name)+' · '+e.chance+'% · w'+e.weight+' · '+qty+g;
  }
  function dropEntriesEditorHtml(entries, prefix){
    entries=normalizeDropEntries(entries);
    const opts=(state.items||[]).map(i=>`<option value="${esc(i.id)}">${esc(i.name)} (${esc(dropCategory(i))})</option>`).join('');
    if(!entries.length){
      return `<div id="${prefix}Wrap" class="space-y-2" data-prefix="${prefix}">
        <div class="text-[11px] text-gray-500">No drop entries yet.</div>
        <button type="button" onclick="RGD.addDropEntryRow('${prefix}')" class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px] text-gray-200">+ Add entry</button>
        <select id="${prefix}ItemLib" class="hidden">${opts}</select>
      </div>`;
    }
    const rows=entries.map((e,i)=>dropEntryRowHtml(prefix,i,e,opts)).join('');
    return `<div id="${prefix}Wrap" class="space-y-2" data-prefix="${prefix}">
      ${rows}
      <button type="button" onclick="RGD.addDropEntryRow('${prefix}')" class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px] text-gray-200">+ Add entry</button>
      <select id="${prefix}ItemLib" class="hidden">${opts}</select>
    </div>`;
  }
  function dropEntryRowHtml(prefix, idx, e, opts){
    e=normalizeDropEntry(e)||{itemId:'',chance:100,weight:1,qtyMin:1,qtyMax:1,guaranteed:false};
    const itemOpts=(state.items||[]).map(i=>`<option value="${esc(i.id)}" ${e.itemId===i.id?'selected':''}>${esc(i.name)} (${esc(dropCategory(i))})</option>`).join('');
    return `<div class="drop-entry-row border border-gray-700 rounded-lg p-2 grid grid-cols-6 gap-2 items-end" data-idx="${idx}">
      <label class="col-span-2 block"><span class="text-[10px] text-gray-500">Drop</span>
        <select data-k="itemId" class="${IN}">${itemOpts}</select></label>
      <label class="block"><span class="text-[10px] text-gray-500">Chance %</span>
        <input data-k="chance" type="number" min="0" max="100" step="1" value="${e.chance}" class="${IN}"></label>
      <label class="block"><span class="text-[10px] text-gray-500">Weight</span>
        <input data-k="weight" type="number" min="0" step="0.1" value="${e.weight}" class="${IN}"></label>
      <label class="block"><span class="text-[10px] text-gray-500">Qty min-max</span>
        <div class="flex gap-1"><input data-k="qtyMin" type="number" min="0" value="${e.qtyMin}" class="${IN}"><input data-k="qtyMax" type="number" min="0" value="${e.qtyMax}" class="${IN}"></div></label>
      <div class="flex items-center justify-between gap-1 pb-1">
        <label class="text-[10px] text-gray-400 flex items-center gap-1"><input data-k="guaranteed" type="checkbox" ${e.guaranteed?'checked':''}> Guar.</label>
        <button type="button" onclick="RGD.removeDropEntryRow('${prefix}',${idx})" class="text-gray-500 hover:text-red-400" title="Remove"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
      </div>
    </div>`;
  }
  function collectDropEntries(prefix){
    const wrap=document.getElementById(prefix+'Wrap');
    if(!wrap) return [];
    const out=[];
    wrap.querySelectorAll('.drop-entry-row').forEach(row=>{
      const get=k=>{
        const el=row.querySelector('[data-k="'+k+'"]');
        if(!el) return null;
        if(el.type==='checkbox') return el.checked;
        return el.value;
      };
      const ne=normalizeDropEntry({
        itemId:get('itemId'), chance:get('chance'), weight:get('weight'),
        qtyMin:get('qtyMin'), qtyMax:get('qtyMax'), guaranteed:get('guaranteed')
      });
      if(ne) out.push(ne);
    });
    return out;
  }
  function addDropEntryRow(prefix){
    const wrap=document.getElementById(prefix+'Wrap');
    if(!wrap) return;
    const lib=document.getElementById(prefix+'ItemLib');
    const first=(state.items&&state.items[0]&&state.items[0].id)||'';
    if(!first) return toast('Create a Drop first','warn');
    // Persist current values then rebuild with one more blank-ish entry
    const cur=collectDropEntries(prefix);
    cur.push({itemId:first,chance:100,weight:1,qtyMin:1,qtyMax:1,guaranteed:false});
    wrap.outerHTML=dropEntriesEditorHtml(cur, prefix);
    lucide.createIcons();
  }
  function removeDropEntryRow(prefix, idx){
    const cur=collectDropEntries(prefix).filter((_,i)=>i!==idx);
    const wrap=document.getElementById(prefix+'Wrap');
    if(!wrap) return;
    wrap.outerHTML=dropEntriesEditorHtml(cur, prefix);
    lucide.createIcons();
  }

  function renderDropTables(){
    ensureDropTables();
    const list=state.dropTables||[];
    const cards=list.map(t=>{
      const linked=npcsUsingDropTable(t.id);
      const entries=(t.entries||[]).slice(0,4).map(e=>`<div class="text-[11px] text-gray-400 truncate">${entrySummary(e)}</div>`).join('')||'<div class="text-[11px] text-gray-600">No entries</div>';
      const more=(t.entries||[]).length>4?`<div class="text-[10px] text-gray-500">+${(t.entries||[]).length-4} more</div>`:'';
      const npcBits=linked.slice(0,4).map(n=>`<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">${esc(n.name)}</span>`).join('')||'<span class="text-[10px] text-gray-600">No enemies linked</span>';
      return `<div class="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg" style="background:${t.color}33;border:1px solid ${t.color}66"></div>
            <div><div class="text-sm font-semibold text-white">${esc(t.name)}</div>
              <div class="text-[10px] text-gray-500">${(t.entries||[]).length} entries · ${linked.length} enemies</div></div>
          </div>
          <div class="flex gap-1">
            <button onclick="RGD.openDropTableModal('${t.id}')" class="text-gray-500 hover:text-white"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
            <button onclick="RGD.deleteDropTable('${t.id}')" class="text-gray-500 hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
          </div>
        </div>
        ${t.desc?`<p class="text-[11px] text-gray-500 mt-2">${esc(t.desc)}</p>`:''}
        <div class="mt-3 space-y-1 flex-1">${entries}${more}</div>
        <div class="mt-3 flex flex-wrap gap-1">${npcBits}</div>
      </div>`;
    }).join('')||'<div class="py-12 text-center text-gray-500 text-sm">No drop tables yet.</div>';
    document.getElementById('tab-droptables').innerHTML=`
      <div class="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div class="max-w-2xl">
          <p class="text-sm text-gray-400">Named <span class="text-amber-300">shared loot pools</span>. Attach them on an enemy (NPCs tab), or add unique <span class="text-emerald-300">bonus drops</span> per monster. Full fields: chance %, weight, qty, guaranteed.</p>
        </div>
        <button onclick="RGD.openDropTableModal()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> New Drop Table</button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${cards}</div>`;
  }
  function openDropTableModal(id){
    ensureDropTables();
    const t=dropTableById(id)||{id:'',name:'',color:'#94a3b8',desc:'',entries:[]};
    const linked=id?npcsUsingDropTable(id):[];
    const linkHtml=linked.length?`<div class="text-[11px] text-gray-400">Linked enemies: ${linked.map(n=>esc(n.name)).join(', ')}</div>`:'';
    modalShell(id?'Edit Drop Table':'New Drop Table',`
      <div class="grid grid-cols-2 gap-3">
        ${field('Name',`<input id="mDtName" value="${esc(t.name)}" class="${IN}">`)}
        ${field('Color',`<input id="mDtColor" type="color" value="${t.color||'#94a3b8'}" class="w-full h-9 bg-gray-900 border border-gray-700 rounded-lg">`)}
      </div>
      ${!id?field('ID (optional)',`<input id="mDtId" placeholder="dt_my_table" class="${IN}">`):''}
      ${field('Description',`<textarea id="mDtDesc" rows="2" class="${IN}">${esc(t.desc||'')}</textarea>`)}
      <div><div class="text-[11px] text-gray-400 mb-2">Entries</div>${dropEntriesEditorHtml(t.entries||[],'mDtEnt')}</div>
      ${linkHtml}
      ${id?`<div class="mt-2"><div class="text-[11px] text-gray-400 mb-1">Quick-attach to enemy</div>
        <div class="flex gap-2"><select id="mDtAttachNpc" class="${IN} flex-1"><option value="">— pick NPC —</option>${(state.npcs||[]).map(n=>`<option value="${esc(n.id)}">${esc(n.name)}</option>`).join('')}</select>
        <button type="button" onclick="RGD.attachTableToNpcFromModal('${id}')" class="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-indigo-600 text-sm text-white">Attach</button></div></div>`:''}
    `,`RGD.saveDropTable('${id||''}')`);
  }
  function attachTableToNpcFromModal(tableId){
    const npcId=val('mDtAttachNpc');
    if(!npcId) return toast('Pick an enemy','warn');
    const n=(state.npcs||[]).find(x=>x.id===npcId);
    if(!n) return toast('NPC missing','err');
    n.dropTableIds=Array.isArray(n.dropTableIds)?n.dropTableIds:[];
    if(n.dropTableIds.indexOf(tableId)<0) n.dropTableIds.push(tableId);
    save({flush:true});
    toast('Attached to '+n.name,'ok');
    openDropTableModal(tableId);
  }
  function saveDropTable(id){
    ensureDropTables();
    const name=val('mDtName').trim(); if(!name) return toast('Name required','warn');
    const entries=collectDropEntries('mDtEnt');
    if(id){
      const t=dropTableById(id); if(!t) return toast('Missing table','err');
      t.name=name; t.color=val('mDtColor')||t.color; t.desc=val('mDtDesc'); t.entries=entries;
    } else {
      let tid=(val('mDtId')||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'_');
      if(!tid) tid=uid('dt');
      if(dropTableById(tid)) return toast('Table id exists','warn');
      state.dropTables.push({id:tid,name,color:val('mDtColor')||'#94a3b8',desc:val('mDtDesc'),entries});
    }
    save({flush:true}); closeModal(); renderDropTables(); toast('Drop table saved','ok');
  }
  function deleteDropTable(id){
    confirmModal('Delete Drop Table',
      'Delete this drop table and detach it from enemies?',
      "RGD.confirmDeleteDropTable('"+id+"')");
  }
  function confirmDeleteDropTable(id){
    closeModal();
    state.dropTables=(state.dropTables||[]).filter(t=>t.id!==id);
    (state.npcs||[]).forEach(n=>{ if(Array.isArray(n.dropTableIds)) n.dropTableIds=n.dropTableIds.filter(x=>x!==id); });
    save({flush:true}); renderDropTables(); toast('Drop table deleted','ok');
  }

  function npcLootAttachHtml(n){
    ensureDropTables();
    const attached=new Set(n.dropTableIds||[]);
    const checks=(state.dropTables||[]).map(t=>`
      <label class="flex items-center gap-2 text-[11px] text-gray-300 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5">
        <input type="checkbox" data-dt="${esc(t.id)}" ${attached.has(t.id)?'checked':''}>
        <span class="w-2.5 h-2.5 rounded-sm" style="background:${t.color}"></span>
        <span class="flex-1 truncate">${esc(t.name)}</span>
        <span class="text-gray-500">${(t.entries||[]).length}</span>
      </label>`).join('')||'<div class="text-[11px] text-gray-500">No drop tables — create one in Drop Tables tab.</div>';
    return `<div class="space-y-1.5" id="mDtAttach">${checks}</div>`;
  }
  function collectNpcDropTableIds(){
    const out=[];
    document.querySelectorAll('#mDtAttach [data-dt]').forEach(el=>{ if(el.checked) out.push(el.getAttribute('data-dt')); });
    return out;
  }
  function npcLootPreviewLine(n){
    const tids=n.dropTableIds||[];
    const bonus=(n.bonusDrops||[]).length;
    const names=tids.map(id=>{ const t=dropTableById(id); return t?t.name:id; }).filter(Boolean);
    if(!names.length&&!bonus) return '';
    const bit=names.length?names.join(', '):'no tables';
    return `<p class="text-[11px] text-amber-300/80 mt-1">Loot: ${esc(bit)}${bonus?' · +'+bonus+' bonus':''}</p>`;
  }

  /* ===== Levels — Level Gen (journey-driven) + Chunks subtab host ===== */
  function activeLevel(){
    const l=state.levels.find(l=>l.id===state.meta.activeLevelId)||null;
    return l?normalizeLevelLocal(l):null;
  }

  // Overlay cache (reference image under generate preview)
  let _overlayCache={ id:null, file:'', dataUrl:'' };
  const _overlayDiskCache={};

  function levelsSubtabChrome(){
    const sub=state.meta.levelsSubtab||'gen';
    return `<div class="flex items-center gap-1 mb-4 border-b border-gray-800 pb-2">
      <button onclick="RGD.setLevelsSubtab('gen')" class="px-3 py-1.5 rounded-lg text-sm ${sub==='gen'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">Level Gen</button>
      <button onclick="RGD.setLevelsSubtab('chunks')" class="px-3 py-1.5 rounded-lg text-sm ${sub==='chunks'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">Chunks</button>
      <button onclick="RGD.go('assets')" class="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-amber-300 hover:bg-gray-700 border border-amber-700/40">Assets →</button>
      <button onclick="RGD.setLevelsSubtab('journeys')" class="px-3 py-1.5 rounded-lg text-sm ${sub==='journeys'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">Journeys</button>
    </div>`;
  }

  function renderLevels(){
    (state.levels||[]).forEach(normalizeLevelLocal);
    if(typeof ensureJourneys==='function') ensureJourneys();
    const host=document.getElementById('tab-levels');
    if(!host) return;
    if(typeof disposeAllThreeViewers==='function') disposeAllThreeViewers();
    else if(typeof disposeAssetViewer==='function') disposeAssetViewer();
    const sub=state.meta.levelsSubtab||'gen';
    if(sub==='chunks'){
      host.innerHTML=levelsSubtabChrome()+`<div id="levelsSubHost"></div>`;
      renderChunks();
      return;
    }
    if(sub==='journeys'){
      host.innerHTML=levelsSubtabChrome()+`<div id="levelsSubHost"></div>`;
      renderJourneys();
      return;
    }
    renderLevelGen();
  }

  function renderLevelGen(){
    const lvl=activeLevel();
    const opts=state.levels.map(l=>`<option value="${l.id}" ${l.id===state.meta.activeLevelId?'selected':''}>${esc(l.name)}</option>`).join('');
    const host=document.getElementById('tab-levels');
    const prevScroll=document.getElementById('rgdLevelGenScroll');
    const keepY=prevScroll?prevScroll.scrollTop:0;
    const tpl=typeof activeTemplate==='function'?activeTemplate():null;
    const tOpts=(state.genTemplates||[]).map(t=>`<option value="${t.id}" ${tpl&&t.id===tpl.id?'selected':''}>${esc(t.name||t.id)}</option>`).join('');
    const res=_pg&&_pg.lastResult;
    const stats=res&&res.stats||(lvl&&lvl.gen&&lvl.gen.stats)||{};
    const layers=lvl?lvl.layers:defaultLayers();
    const jSel=lvl&&lvl.journeyId&&typeof journeyById==='function'?journeyById(lvl.journeyId):null;
    const steps=(jSel&&jSel.steps)||[];
    const stampRefs=typeof journeyStampSummary==='function'?journeyStampSummary(jSel):{npcs:[],items:[],tables:[]};

    if(!lvl){
      host.innerHTML=levelsSubtabChrome()+`
        <div class="flex items-center gap-2 mb-4">
          <select onchange="RGD.selectLevel(this.value)" class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"><option value="">— select a level —</option>${opts}</select>
          <button onclick="RGD.newLevel()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-1.5"><i data-lucide="plus" class="w-4 h-4"></i> New Level</button>
        </div>
        <div class="py-16 text-center text-gray-500 text-sm">No level selected. Create one, pick a Journey, then Generate.</div>`;
      return;
    }

    const layerKey=Object.keys(layers).map(k=>`
      <label class="flex items-center gap-1.5 text-[11px] text-gray-300">
        <input type="checkbox" ${layers[k]?'checked':''} onchange="RGD.setLayerVisible('${k}',this.checked)"> ${k}
      </label>`).join('');

    const canBuild=!!(lvl.layout&&lvl.layout.length);

    // Tear down GL before wiping DOM (keeps orbit state via remount keep in mountProcgenViewer)
    if(typeof disposeProcgenViewer==='function') disposeProcgenViewer();

    host.innerHTML=`
      ${levelsSubtabChrome()}
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <select onchange="RGD.selectLevel(this.value)" class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">${opts}</select>
        <button onclick="RGD.newLevel()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm" title="New"><i data-lucide="plus" class="w-4 h-4"></i></button>
        <button onclick="RGD.saveLevel()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-1.5"><i data-lucide="save" class="w-4 h-4"></i> Save</button>
        <button onclick="RGD.deleteLevel('${lvl.id}')" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-red-600 text-sm"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        <select onchange="RGD.pgSelectTemplate(this.value)" class="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm min-w-[140px]">${tOpts}</select>
        <label class="text-xs text-gray-400 flex items-center gap-1">Seed
          <input id="pgSeed" type="number" value="${(_pg&&_pg.seed!=null)?_pg.seed:((lvl.gen&&lvl.gen.seed)||1337)}" class="w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" onchange="RGD.pgSetSeed(+this.value)"/>
        </label>
        <button onclick="RGD.pgGenerate()" class="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center gap-1.5"><i data-lucide="dices" class="w-4 h-4"></i> Generate</button>
        <button onclick="RGD.pgReroll()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-1.5"><i data-lucide="refresh-cw" class="w-4 h-4"></i> Reroll</button>
        <button onclick="RGD.pgToggleDemo()" class="px-3 py-2 rounded-lg ${_pg&&_pg.demoPlaying?'bg-amber-600':'bg-gray-700'} text-sm flex items-center gap-1.5"><i data-lucide="${_pg&&_pg.demoPlaying?'pause':'play'}" class="w-4 h-4"></i> Demo</button>
        <div class="flex-1"></div>
        <button onclick="RGD.pgBuildUeFn()" ${canBuild?'':'disabled'} class="px-3 py-2 rounded-lg ${canBuild?'bg-emerald-600 hover:bg-emerald-500':'bg-gray-700 opacity-50'} text-white text-sm font-medium flex items-center gap-1.5"><i data-lucide="hammer" class="w-4 h-4"></i> Build in UEFN</button>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div id="rgdLevelGenScroll" class="xl:col-span-1 space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
            <div class="text-sm font-semibold text-white">Level</div>
            <label class="text-[11px] text-gray-400 block">Name
              <input value="${esc(lvl.name)}" onchange="RGD.updateLevelField('name',this.value)" class="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm"/>
            </label>
            <div class="flex gap-2">
              <div class="flex-1"><label class="text-[11px] text-gray-400">Theme</label><input type="color" value="${lvl.theme||'#6366f1'}" onchange="RGD.updateLevelField('theme',this.value)" class="w-full h-8 mt-1 bg-gray-900 border border-gray-700 rounded-lg"></div>
              <div class="flex-1"><label class="text-[11px] text-gray-400">Threat</label><select onchange="RGD.updateLevelField('threat',this.value)" class="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm">${['Low','Medium','High','Boss'].map(t=>`<option ${lvl.threat===t?'selected':''}>${t}</option>`).join('')}</select></div>
            </div>
            <div class="flex gap-2">
              <div class="flex-1"><label class="text-[11px] text-gray-400">Difficulty (Verse Level)</label><select onchange="RGD.updateLevelField('difficultyIndex',+this.value)" class="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm">${[['0','Easy'],['1','Normal'],['2','Hard']].map(([v,l])=>`<option value="${v}" ${String(lvl.difficultyIndex??1)===v?'selected':''}>${l}</option>`).join('')}</select></div>
              <div class="flex-1"><label class="text-[11px] text-gray-400">Enemy count %</label><input type="number" min="1" max="500" value="${lvl.enemyCountPercent??100}" onchange="RGD.updateLevelField('enemyCountPercent',+this.value||100)" class="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm"/></div>
            </div>
            <div class="text-[11px] text-gray-500">Difficulty → <code class="text-gray-400">roguelike_level_device</code> Easy/Normal/Hard NPC stats. Menu pick can override at runtime.</div>
          </div>

          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-semibold text-white">Journey</div>
              <button onclick="RGD.setLevelsSubtab('journeys')" class="px-2 py-1 rounded-lg bg-violet-700 hover:bg-violet-600 text-[11px] text-white">Create / edit Journeys →</button>
            </div>
            <label class="text-[11px] text-gray-400 block">Select journey for this level
              <select onchange="RGD.setLevelJourney(this.value)" class="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-sm">
                <option value="">— none (template spine) —</option>
                ${(state.journeys||[]).map(j=>`<option value="${esc(j.id)}" ${lvl.journeyId===j.id?'selected':''}>${esc(j.name)} (${(j.steps||[]).length} steps)</option>`).join('')}
              </select>
            </label>
            <div class="text-[11px] text-gray-500">Enemies are picked on each Journey <b class="text-gray-300">step</b>. Loot = drop tables on those NPCs.</div>
            ${jSel?`<div class="rounded-lg bg-gray-900/70 border border-gray-700 p-2 text-[11px] text-gray-300 space-y-1">
              <div class="font-medium text-white">${esc(jSel.name)}</div>
              <div class="text-gray-500">${(jSel.steps||[]).map(s=>s.type).join(' → ')||'no steps'}</div>
              <div class="text-gray-500">${stampRefs.npcs.length} NPC(s) from steps · ${stampRefs.items.length} loot item(s)</div>
              ${stampRefs.npcs.length?`<div class="text-gray-400 truncate" title="${esc(stampRefs.npcs.map(n=>n.name).join(', '))}">${esc(stampRefs.npcs.map(n=>n.name).join(', '))}</div>`:'<div class="text-amber-500/90">No step enemies yet — open Journeys and check NPCs on wave/boss steps.</div>'}
            </div>`:`<div class="text-xs text-amber-500/90 py-1">No journey selected — Generate uses template spine only (no NPC/item stamps).</div>`}
          </div>

          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
            <div class="text-sm font-semibold text-white">Generation</div>
            <label class="text-xs text-gray-400 block">Template
              <input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" value="${esc(tpl&&tpl.name||'')}" onchange="RGD.pgUpdateTpl('name',this.value)"/>
            </label>
            <label class="text-xs text-gray-400 block">Space
              <select class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" onchange="RGD.pgUpdateTpl('space',this.value)">
                <option value="inside" ${tpl&&tpl.space==='inside'?'selected':''}>inside</option>
                <option value="outside" ${tpl&&tpl.space==='outside'?'selected':''}>outside</option>
              </select>
            </label>

            <div>
              <div class="text-xs text-gray-400 mb-1">Layout style</div>
              <div class="grid grid-cols-3 gap-1">
                ${[['linear','Linear','One path, tight'],['branched','Branched','Main path + sides'],['open','Open','Sprawl, air gaps']].map(([id,lab,hint])=>{
                  const cur=(_pg&&_pg.layoutStyle)||(tpl&&tpl.openSocketScope==='all'&&(tpl.branchBudget||0)>=6?'open':(tpl&&tpl.openSocketScope==='all'?'branched':'linear'));
                  return `<button type="button" data-pg-style="${id}" onclick="RGD.pgSetLayoutStyle('${id}')" title="${hint}"
                    class="px-2 py-2 rounded-lg text-[11px] border ${cur===id?'bg-violet-600 border-violet-500 text-white':'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'}">${lab}</button>`;
                }).join('')}
              </div>
            </div>

            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Map size</span>
                <span id="pgSizeLabel" class="text-gray-500">${['','S','M','L','XL','Huge'][(tpl&&tpl.sizeScale)||2]||'M'}</span>
              </div>
              <input type="range" min="1" max="5" value="${(tpl&&tpl.sizeScale)||2}" class="w-full"
                oninput="RGD.pgSetSizeScale(+this.value,true)" onchange="RGD.pgSetSizeScale(+this.value,false)"/>
              <div class="flex justify-between text-[10px] text-gray-600"><span>Small</span><span>Huge</span></div>
            </div>

            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Map height</span>
                <span id="pgHeightLabel" class="text-gray-500">${(tpl&&tpl.mapHeight)||1} stor${((tpl&&tpl.mapHeight)||1)===1?'y':'ies'}</span>
              </div>
              <input type="range" min="1" max="8" value="${(tpl&&tpl.mapHeight)||1}" class="w-full"
                oninput="RGD.pgSetMapHeight(+this.value,true)" onchange="RGD.pgSetMapHeight(+this.value,false)"/>
              <div class="flex justify-between text-[10px] text-gray-600"><span>Flat (1)</span><span>Tall (8)</span></div>
              <div class="text-[10px] text-gray-600 mt-0.5">Caps chunk height. 1 = no stairs/balconies. 2+ allows tall rooms, stairs, ledges.</div>
            </div>

            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Path stretch</span>
                <span id="pgPadLabel" class="text-gray-500">${(tpl&&tpl.pathPadding)!=null?tpl.pathPadding:((tpl&&tpl.sizeScale)||2)-1} pads</span>
              </div>
              <input type="range" min="0" max="8" value="${(tpl&&tpl.pathPadding)!=null?tpl.pathPadding:Math.max(0,((tpl&&tpl.sizeScale)||2)-1)}" class="w-full"
                oninput="RGD.pgSetPathPadding(+this.value,true)" onchange="RGD.pgSetPathPadding(+this.value,false)"/>
              <div class="text-[10px] text-gray-600">Extra halls/rooms between Journey steps (longer run).</div>
            </div>

            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Side branches</span>
                <span id="pgBranchLabel" class="text-gray-500">${(tpl&&tpl.branchBudget)||0}</span>
              </div>
              <input type="range" min="0" max="16" value="${(tpl&&tpl.branchBudget)||0}" class="w-full"
                oninput="RGD.pgSetBranchBudget(+this.value,true)" onchange="RGD.pgSetBranchBudget(+this.value,false)"/>
              <div class="text-[10px] text-gray-600">Dead-ends &amp; side rooms off the main path.</div>
            </div>

            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Straightness</span>
                <span id="pgStraightLabel" class="text-gray-500">${(tpl&&tpl.straightness)!=null?tpl.straightness:50}%</span>
              </div>
              <input type="range" min="0" max="100" value="${(tpl&&tpl.straightness)!=null?tpl.straightness:50}" class="w-full"
                oninput="RGD.pgSetStraightness(+this.value,true)" onchange="RGD.pgSetStraightness(+this.value,false)"/>
              <div class="flex justify-between text-[10px] text-gray-600"><span>Windy</span><span>Straight</span></div>
            </div>

            <label class="flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" ${(tpl&&(tpl.fillEmpty!==false))?'checked':''} onchange="RGD.pgSetFillEmpty(this.checked)">
              Surround map with walls
            </label>
            <div class="text-[10px] text-gray-600">Fills the bounding box + 1-cell rim with filler walls. Off = air gaps (Open style).</div>

            <label class="text-xs text-gray-400 block">Tags filter
              <input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" value="${esc(((tpl&&tpl.tags)||[]).join(', '))}" onchange="RGD.pgUpdateTpl('tags',this.value.split(',').map(s=>s.trim()).filter(Boolean))"/>
            </label>
          </div>

          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-gray-500">Reference overlay</div>
            <label class="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" ${((lvl.overlay||{}).enabled)?'checked':''} onchange="RGD.setOverlayField('enabled',this.checked)"> Show overlay</label>
            <label class="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" ${((lvl.overlay||{}).stretch!==false)?'checked':''} onchange="RGD.setOverlayField('stretch',this.checked)"> Stretch to grid</label>
            <div><label class="text-[11px] text-gray-400">Opacity <span id="ovOpacityLabel">${Math.round((((lvl.overlay||{}).opacity)||0.55)*100)}%</span></label>
              <input id="ovOpacity" type="range" min="5" max="100" value="${Math.round((((lvl.overlay||{}).opacity)||0.55)*100)}" oninput="RGD.setOverlayOpacity(this.value)" class="w-full mt-1"></div>
            <input id="ovFile" type="file" accept="image/*" class="hidden" onchange="RGD.onOverlayFile(this)">
            <div class="flex gap-2">
              <button onclick="document.getElementById('ovFile').click()" class="flex-1 px-2 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs">Load Image</button>
              <button onclick="RGD.clearOverlay()" class="flex-1 px-2 py-1.5 rounded-lg bg-gray-700 hover:bg-red-600 text-xs">Clear</button>
            </div>
          </div>

          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div class="text-sm font-semibold text-white mb-2">Stats</div>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div><div class="text-gray-500">Chunks</div><div class="text-xl text-white font-bold">${stats.chunksPlaced||'—'}</div></div>
              <div><div class="text-gray-500">Path len</div><div class="text-xl text-white font-bold">${stats.mainPathLen||'—'}</div></div>
              <div><div class="text-gray-500">Seed</div><div class="text-xl text-white font-bold">${stats.seed||'—'}</div></div>
              <div><div class="text-gray-500">Steps</div><div class="text-xl text-white font-bold">${steps.length}</div></div>
            </div>
            ${(lvl.gen&&lvl.gen.spineUsed)?`<div class="text-[10px] text-gray-500 mt-2 font-mono break-all">${esc((lvl.gen.spineUsed||[]).join(' → '))}</div>`:''}
          </div>
        </div>

        <div class="xl:col-span-2 space-y-3">
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-3 relative">
            <div class="flex flex-wrap gap-3 mb-2 px-1">${layerKey}</div>
            <div class="flex flex-wrap items-center gap-2 mb-2 px-1">
              <button onclick="RGD.pgSetViewMode('2d')" class="px-3 py-1.5 rounded-lg text-xs ${(_pg&&_pg.viewMode)!=='3d'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">2D map</button>
              <button onclick="RGD.pgSetViewMode('3d')" class="px-3 py-1.5 rounded-lg text-xs ${(_pg&&_pg.viewMode)==='3d'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">3D orbit</button>
              <span class="text-[10px] text-gray-500">${(_pg&&_pg.viewMode)==='3d'?'Drag rotate · right-drag / Shift pan · scroll zoom · double-click reframes':'Top-down preview'}</span>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-1 mb-2 px-1 text-[10px] text-gray-400">
              ${[
                ['E','Entrance','#22c55e'],['X','Exit','#ef4444'],['O','Objective','#f59e0b'],
                ['B','Boss','#e11d48'],['R','Room','#6366f1'],['C','Hall / connector','#94a3b8'],
                ['D','Dead-end','#78716c'],['#','Filler wall','#64748b'],
              ].map(([sym,lab,col])=>`<span class="inline-flex items-center gap-1"><span class="w-3.5 h-3.5 rounded text-[9px] font-bold text-center leading-3.5 text-white" style="background:${col}">${sym}</span>${lab}</span>`).join('')}
              <span class="text-sky-400">— blue line = main path (entrance→exit)</span>
            </div>
            <div id="pgView2dWrap" class="${(_pg&&_pg.viewMode)==='3d'?'hidden':''}">
              <canvas id="pgCanvas" width="720" height="480" class="w-full rounded-lg bg-[#0b0f19]" style="min-height:380px"></canvas>
            </div>
            <div id="pgView3dWrap" class="${(_pg&&_pg.viewMode)==='3d'?'':'hidden'}">
              <div id="rgdProcgenView3d" class="w-full rounded-lg border border-gray-700 overflow-hidden bg-[#0b1220]" style="height:480px;min-height:380px;cursor:grab"></div>
            </div>
            <div class="flex items-center gap-2 mt-2 text-xs text-gray-400">
              <span>Stage</span>
              <input type="range" id="pgStage" min="0" max="${Math.max(0,((res&&res.trace)||[]).length-1)}" value="${(_pg&&_pg.stageIdx)||0}" class="flex-1" oninput="RGD.pgSetStage(+this.value)"/>
              <span>${esc(((res&&res.trace)||[])[(_pg&&_pg.stageIdx)||0]&&((res&&res.trace)||[])[(_pg&&_pg.stageIdx)||0].stage||'preview')}</span>
            </div>
            <div class="text-[11px] text-gray-500 mt-1">${(_pg&&_pg.viewMode)==='3d'?'Full layout 3D — every chunk, props, path, entities.':'Preview only — no paint. Layers toggle draw; Save stores generation result.'}</div>
          </div>
        </div>
      </div>`;

    // Hydrate _pg.lastResult from level.layout when missing
    if(lvl.layout&&lvl.layout.length&&(!_pg.lastResult||!_pg.lastResult.ok||_pg.lastResult.levelId!==lvl.id)){
      _pg.lastResult={
        ok:true, levelId:lvl.id, layout:lvl.layout, grid:lvl.grid, w:lvl.w, h:lvl.h,
        mainPath:(lvl.gen&&lvl.gen.mainPath)||[], stats:lvl.gen&&lvl.gen.stats||{},
        trace:[{stage:'final',placements:lvl.layout}], seed:lvl.gen&&lvl.gen.seed,
      };
    }
    if((_pg&&_pg.viewMode)==='3d'){
      requestAnimationFrame(()=>{
        if(typeof refreshProcgenPreview3d==='function') refreshProcgenPreview3d();
        else if(typeof drawProcgenCanvas==='function') drawProcgenCanvas();
      });
    } else if(typeof drawProcgenCanvas==='function'){
      drawProcgenCanvas();
    }
    // Keep left-panel scroll so Generation knobs don't jump to top on every click/drag.
    const sc=document.getElementById('rgdLevelGenScroll');
    if(sc&&keepY) sc.scrollTop=keepY;
    // overlay under canvas if enabled (2D only)
    if((_pg&&_pg.viewMode)!=='3d' && lvl.overlay&&lvl.overlay.enabled&&lvl.overlay.file){
      ensureOverlayData(lvl).then(url=>{
        const canvas=document.getElementById('pgCanvas');
        if(canvas&&url) canvas.dataset.overlayUrl=url;
        if(typeof drawProcgenCanvas==='function') drawProcgenCanvas();
      });
    }
  }

  async function ensureOverlayData(lvl){
    const ov=lvl.overlay||{};
    if(!ov.enabled||!(ov.file||ov._dataUrl)){ return ''; }
    const diskKey=lvl.id+'::'+(ov.file||'');
    if(ov._dataUrl){
      _overlayCache={id:lvl.id,file:ov.file||'',dataUrl:ov._dataUrl};
      if(ov.file) _overlayDiskCache[diskKey]=ov._dataUrl;
      return ov._dataUrl;
    }
    if(_overlayCache.id===lvl.id && _overlayCache.file===ov.file && _overlayCache.dataUrl) return _overlayCache.dataUrl;
    if(ov.file && _overlayDiskCache[diskKey]){
      _overlayCache={id:lvl.id,file:ov.file,dataUrl:_overlayDiskCache[diskKey]};
      return _overlayDiskCache[diskKey];
    }
    let dataUrl='';
    try{
      if(typeof rgdRpc==='function'){
        const r=await rgdRpc('get_overlay_image',{level_id:lvl.id, max_edge:1600},45000);
        if(r&&r.ok&&r.dataUrl) dataUrl=r.dataUrl;
        else if(r&&r.dataUrl) dataUrl=r.dataUrl;
      }
    }catch(e){ console.warn('[RGD] get_overlay_image failed', e); }
    if(!dataUrl && ov.file) dataUrl='../assets/overlays/'+ov.file;
    if(dataUrl && ov.file) _overlayDiskCache[diskKey]=dataUrl;
    _overlayCache={id:lvl.id,file:ov.file||'',dataUrl};
    return dataUrl;
  }

  /* Journey select / layers (include is derived at generate — not authored here) */
  function setLevelJourney(journeyId){
    const l=activeLevel(); if(!l) return;
    l.journeyId=journeyId||'';
    l.journey=defaultJourney();
    save(); renderLevelGen();
  }
  // Legacy stubs (inline journey authoring moved to Journeys tab)
  function updateJourneyField(){ toast('Edit journeys on the Journeys tab','info'); }
  function addJourneyStep(){ setLevelsSubtab('journeys'); toast('Create steps on the Journeys tab','info'); }
  function updateJourneyStep(){}
  function moveJourneyStep(){}
  function removeJourneyStep(){}
  function toggleInclude(){ toast('NPCs → Journeys · items → NPC drop tables','info'); }
  function setLayerVisible(k,on){
    const l=activeLevel(); if(!l) return;
    l.layers=l.layers||defaultLayers();
    l.layers[k]=!!on; save();
    if(typeof drawProcgenCanvas==='function') drawProcgenCanvas();
  }

  // Stubs kept so old exports don't explode
  function fitGrid(){}
  function centerGrid(){}
  function zoomBy(){}
  function undoPaint(){ toast('Paint removed — use Generate','info'); }
  function redoPaint(){ toast('Paint removed — use Generate','info'); }
  function pickTool(){}
  function pickEntity(){}
  function resizeLevel(){ toast('Grid size comes from generation','info'); }
  function resetLevel(){
    const l=activeLevel(); if(!l) return;
    l.grid={_sparse:true,cells:{}}; l.layout=[]; l.gen=null;
    if(_pg) _pg.lastResult=null;
    save({flush:true}); renderLevelGen(); toast('Generation cleared','warn');
  }

  /* ===== MCP / Live Sync ===== */
  function renderMCP(){ const planned=intended();
    const sceneList=state.scene.actors.slice(0,60).map(a=>`<div class="flex items-center justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-300 truncate max-w-[220px]">${esc(a.label)}</span><span class="text-gray-500 truncate max-w-[160px]">${esc(a.folder)}</span></div>`).join('')||`<div class="text-[11px] text-gray-600 py-2">Scene empty.</div>`;
    const stateSummary=`<div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">Levels</span><span class="text-gray-200">${state.levels.length}</span></div><div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">NPCs</span><span class="text-gray-200">${state.npcs.length}</span></div><div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">Items</span><span class="text-gray-200">${state.items.length}</span></div><div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">Player Weapons</span><span class="text-gray-200">${(state.weapons||[]).length}</span></div><div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">Stats</span><span class="text-gray-200">${state.stats.length}</span></div><div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">Assets</span><span class="text-gray-200">${(state.chunkAssets||[]).length}</span></div><div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">Tracked scene actors</span><span class="text-gray-200">${planned.length}</span></div>`;
    const logRows=state.log.slice(0,40).map(l=>`<div class="flex items-start gap-2 text-[11px] py-1 border-b border-gray-800/60"><span class="chip-dot mt-1 ${l.ok?'bg-emerald-500':'bg-red-500'}"></span><span class="font-mono text-indigo-300 shrink-0">rgd_${esc(l.tool)}</span><span class="text-gray-500 truncate">${esc(l.args||'')}</span><span class="ml-auto text-gray-600 shrink-0">${new Date(l.t).toLocaleTimeString()}</span></div>`).join('')||`<div class="text-[11px] text-gray-600 py-2">No MCP calls yet.</div>`;
    document.getElementById('tab-mcp').innerHTML=`
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs"><span class="chip-dot ${state.scene.listener==='online'?'bg-emerald-500':'bg-red-500'}"></span>Listener ${state.scene.listener}</div>
        <div class="text-[11px] text-gray-500">Design store autosaves · Build/spawn tools place into UEFN when you ask</div>
        <div class="flex-1"></div>
        <button onclick="RGD.syncFromUEFN()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-1.5"><i data-lucide="download-cloud" class="w-4 h-4"></i> Refresh scene list</button>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-gray-800 border border-gray-700 rounded-xl p-4"><h3 class="text-sm font-semibold text-white mb-3 flex items-center gap-2"><i data-lucide="database" class="w-4 h-4 text-violet-400"></i> Plugin Design State</h3>${stateSummary}</div>
        <div class="bg-gray-800 border border-gray-700 rounded-xl p-4"><h3 class="text-sm font-semibold text-white mb-3 flex items-center gap-2"><i data-lucide="box" class="w-4 h-4 text-sky-400"></i> Live UEFN Scene (${state.scene.actors.length})</h3><div class="max-h-64 overflow-y-auto">${sceneList}</div></div>
      </div>
      <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 mt-4"><h3 class="text-sm font-semibold text-white mb-3 flex items-center gap-2"><i data-lucide="terminal" class="w-4 h-4 text-emerald-400"></i> MCP Tool Call Log</h3><div class="max-h-72 overflow-y-auto font-mono">${logRows}</div></div>`;
    lucide.createIcons();
  }

  /* ===== player weapons (categories + power slots) ===== */
  const WEAPON_CLASS_TRAITS = {
    Pistol:{name:'Sidearm',summary:'Flexible sidearms. Open slots take element infusions; locked slots are Time signatures.'},
    'Assault Rifle':{name:'Suppression',summary:'Eight continuous hits on the same target makes it flinch and cut its damage output. ARs keep a target locked down while the party sets up reactions.'},
    Shotgun:{name:'Saturation',summary:'Every pellet applies element stacks individually. A full body hit up close procs a status instantly. Shotguns are the fastest status applier and start reactions for everyone else.'},
    SMG:{name:'Haste',summary:'Sustained fire builds Haste stacks that raise movement and reload speed. SMGs are the only class that fires at full accuracy while sprinting or dashing.'},
  };
  const OPEN_SLOTS=[
    {id:"slot_element",index:1,kind:"open",accepts:["element_infusion","charged"],rerollPolicy:"hub",equippedPowerId:null,label:"Element Infusion"},
    {id:"slot_charged",index:2,kind:"open",accepts:["charged","element_infusion"],rerollPolicy:"hub",equippedPowerId:null,label:"Charged Scroll"},
  ];
  const lockedSlots=(id,label)=>[
    {id:"slot_signature",index:1,kind:"locked",accepts:[],rerollPolicy:"none",lockedPowerId:id,equippedPowerId:id,label},
    {id:"slot_element",index:2,kind:"open",accepts:["element_infusion","charged"],rerollPolicy:"hub",equippedPowerId:null,label:"Element Infusion"},
  ];
  function demoSkinsFor(w){
    const c=(w&&w.color)||'#9ca3af';
    return [
      {id:'default', name:'Default', color:c},
      {id:'midnight', name:'Midnight', color:'#6366f1'},
      {id:'ember', name:'Ember', color:'#ef4444'},
      {id:'glacier', name:'Glacier', color:'#38bdf8'},
    ];
  }
  function weaponWithSlotChrome(w){
    const base=Object.assign({}, w);
    if(!Array.isArray(base.skins)||base.skins.length<4) base.skins=demoSkinsFor(base);
    if(!Array.isArray(base.powerSlots)||base.powerSlots.length<2){
      if(base.slotPolicy==='locked_power'){
        const sig=(base.powerSlots&&base.powerSlots[0]&&base.powerSlots[0].kind==='locked')
          ? Object.assign({}, base.powerSlots[0], {index:1})
          : lockedSlots(base.powerSlots&&base.powerSlots[0]&&(base.powerSlots[0].lockedPowerId||base.powerSlots[0].equippedPowerId)||'', base.powerSlots&&base.powerSlots[0]&&base.powerSlots[0].label||'Signature')[0];
        base.powerSlots=[sig, Object.assign({}, OPEN_SLOTS[1], {id:'slot_element', label:'Element Infusion', index:2})];
      } else {
        const a=Object.assign({}, (base.powerSlots&&base.powerSlots[0])||OPEN_SLOTS[0], {index:1});
        const b=Object.assign({}, OPEN_SLOTS[1], {index:2});
        base.powerSlots=[a,b];
      }
    }
    return base;
  }
  /* Armory details bars (0–100). Kept on the weapon so each gun shows its own profile. */
  const WEAPON_ARMORY_STATS = {
    service_pistol:{damage:42, accuracy:78, range:55, mobility:70, fire_rate:58},
    hand_cannon:{damage:88, accuracy:62, range:60, mobility:48, fire_rate:28},
    machine_pistol:{damage:48, accuracy:45, range:40, mobility:72, fire_rate:92},
    paradox:{damage:55, accuracy:70, range:58, mobility:65, fire_rate:50},
    hourglass:{damage:72, accuracy:68, range:52, mobility:55, fire_rate:40},
    vanguard:{damage:62, accuracy:74, range:70, mobility:50, fire_rate:78},
    tribeam:{damage:58, accuracy:80, range:68, mobility:52, fire_rate:60},
    longshot:{damage:70, accuracy:90, range:95, mobility:40, fire_rate:35},
    recursion:{damage:64, accuracy:72, range:72, mobility:48, fire_rate:70},
    prophecy:{damage:66, accuracy:98, range:80, mobility:45, fire_rate:48},
    breacher:{damage:85, accuracy:55, range:28, mobility:45, fire_rate:30},
    flechette:{damage:60, accuracy:35, range:18, mobility:50, fire_rate:45},
    ripper:{damage:72, accuracy:50, range:32, mobility:55, fire_rate:55},
    echo:{damage:78, accuracy:48, range:30, mobility:42, fire_rate:40},
    unmake:{damage:80, accuracy:52, range:26, mobility:40, fire_rate:32},
    shred:{damage:50, accuracy:58, range:45, mobility:85, fire_rate:88},
    splitfire:{damage:55, accuracy:62, range:50, mobility:80, fire_rate:82},
    flux:{damage:58, accuracy:60, range:48, mobility:78, fire_rate:86},
    tempo:{damage:52, accuracy:55, range:46, mobility:90, fire_rate:95},
    revenant:{damage:60, accuracy:58, range:48, mobility:82, fire_rate:84},
  };
  const ARMORY_STAT_FIELDS = [
    {id:'damage', name:'Damage'},
    {id:'accuracy', name:'Accuracy'},
    {id:'range', name:'Range'},
    {id:'mobility', name:'Mobility'},
    {id:'fire_rate', name:'Fire Rate'},
  ];
  function weaponWithArmoryStats(w){
    const base=Object.assign({}, w);
    if(base.stats&&typeof base.stats==='object'&&Object.keys(base.stats).length) return base;
    if(WEAPON_ARMORY_STATS[base.id]) base.stats=Object.assign({}, WEAPON_ARMORY_STATS[base.id]);
    return base;
  }
  const WEAPON_DEFAULTS = [
    {id:"service_pistol",name:"Service Pistol",symbol:"S",color:"#f59e0b",category:"Pistol",starter:true,slotPolicy:"infusable",
      desc:"Starter semi-auto. Tapping beats spamming — free crits reward patience.",
      fireIdentity:"Semi auto. Any shot fired after a 0.4s pause is a guaranteed crit.",
      suggestedElements:["Ice"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.service_pistol),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_Service",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_ServicePistol",icon:"assets/weapons/pistol.svg",verseClass:"weapon_service_pistol",upgrades:[]},
    {id:"hand_cannon",name:"Hand Cannon",symbol:"H",color:"#ef4444",category:"Pistol",slotPolicy:"infusable",
      desc:"Six shots, heavy damage, real knockback. Overpressure pierce after every reload.",
      fireIdentity:"Every reload chambers one Overpressure round that pierces through a target and keeps going.",
      suggestedElements:["Void"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.hand_cannon),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_HandCannon",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_HandCannon",icon:"assets/weapons/pistol.svg",verseClass:"weapon_hand_cannon",upgrades:[]},
    {id:"machine_pistol",name:"Machine Pistol",symbol:"M",color:"#22c55e",category:"Pistol",slotPolicy:"infusable",
      desc:"Full auto on a heat gauge. Hold longer for more damage, pay with wider accuracy.",
      fireIdentity:"Full auto on a heat gauge. Accuracy widens as heat climbs but damage climbs with it.",
      suggestedElements:["Fire","Lightning"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.machine_pistol),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_Machine",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_MachinePistol",icon:"assets/weapons/pistol.svg",verseClass:"weapon_machine_pistol",upgrades:[]},
    {id:"paradox",name:"Paradox",symbol:"P",color:"#94a3b8",category:"Pistol",slotPolicy:"locked_power",
      desc:"Time signature. Every shot echoes 1.5s later at the same point in space.",
      fireIdentity:"Every shot fires twice — once now, and an echo 1.5 seconds later at the exact same point in space.",
      suggestedElements:[],powerSlots:lockedSlots("stasis_field","Stasis Field"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.paradox),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_Arc",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Paradox",icon:"assets/weapons/pistol.svg",verseClass:"weapon_paradox",upgrades:[]},
    {id:"hourglass",name:"Hourglass",symbol:"G",color:"#64748b",category:"Pistol",slotPolicy:"locked_power",
      desc:"Time signature. Accelerates aging; kills chamber a round instantly.",
      fireIdentity:"Damage scales with missing health. Kills chamber a round instantly, no reload.",
      suggestedElements:[],powerSlots:lockedSlots("rewind","Rewind"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.hourglass),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_Reaper",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Hourglass",icon:"assets/weapons/pistol.svg",verseClass:"weapon_hourglass",upgrades:[]},
    {id:"vanguard",name:"Vanguard",symbol:"V",color:"#f97316",category:"Assault Rifle",slotPolicy:"infusable",
      desc:"Class trait Suppression: eight continuous hits on the same target makes it flinch and cut its damage output.",
      fireIdentity:"Full auto that tightens instead of widening. After one second of held fire, spread drops to zero and damage ramps.",
      suggestedElements:["Fire"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.vanguard),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Vanguard",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Vanguard",icon:"assets/weapons/assault_rifle.svg",verseClass:"weapon_vanguard",upgrades:[]},
    {id:"tribeam",name:"Tribeam",symbol:"T",color:"#38bdf8",category:"Assault Rifle",slotPolicy:"infusable",
      desc:"Class trait Suppression: eight continuous hits on the same target makes it flinch and cut its damage output.",
      fireIdentity:"Three round burst. All three landing refunds the ammo and applies double element stacks.",
      suggestedElements:["Ice","Void"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.tribeam),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Tribeam",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Tribeam",icon:"assets/weapons/assault_rifle.svg",verseClass:"weapon_tribeam",upgrades:[]},
    {id:"longshot",name:"Longshot",symbol:"L",color:"#facc15",category:"Assault Rifle",slotPolicy:"infusable",
      desc:"Class trait Suppression: eight continuous hits on the same target makes it flinch and cut its damage output.",
      fireIdentity:"Semi auto marksman. Damage scales upward with distance to target.",
      suggestedElements:["Lightning"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.longshot),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Longshot",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Longshot",icon:"assets/weapons/assault_rifle.svg",verseClass:"weapon_longshot",upgrades:[]},
    {id:"recursion",name:"Recursion",symbol:"R",color:"#94a3b8",category:"Assault Rifle",slotPolicy:"locked_power",
      desc:"Time signature AR. Suppression still applies while Loop replays your fire.",
      fireIdentity:"Every sixth shot instantly replays the previous five shots at once.",
      suggestedElements:[],powerSlots:lockedSlots("loop","Loop"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.recursion),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Recursion",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Recursion",icon:"assets/weapons/assault_rifle.svg",verseClass:"weapon_recursion",upgrades:[]},
    {id:"prophecy",name:"Prophecy",symbol:"Y",color:"#cbd5e1",category:"Assault Rifle",slotPolicy:"locked_power",
      desc:"Time signature AR. Suppression still applies — never miss a moving enemy.",
      fireIdentity:"Shots resolve half a second ahead, so they land where the target will be. Never misses a moving enemy.",
      suggestedElements:[],powerSlots:lockedSlots("precognition","Precognition"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.prophecy),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Prophecy",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Prophecy",icon:"assets/weapons/assault_rifle.svg",verseClass:"weapon_prophecy",upgrades:[]},
    {id:"breacher",name:"Breacher",symbol:"B",color:"#a855f7",category:"Shotgun",slotPolicy:"infusable",
      desc:"Class trait Saturation: every pellet applies element stacks individually.",
      fireIdentity:"Pump action, tight cone, heavy stagger. Loads shell by shell so you can cancel the reload at any point.",
      suggestedElements:["Void"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.breacher),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Breacher",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Breacher",icon:"assets/weapons/shotgun.svg",verseClass:"weapon_breacher",upgrades:[]},
    {id:"flechette",name:"Flechette",symbol:"F",color:"#ef4444",category:"Shotgun",slotPolicy:"infusable",
      desc:"Class trait Saturation: every pellet applies element stacks individually.",
      fireIdentity:"Very wide cone, very high pellet count. Useless past ten meters, instant max stacks inside it.",
      suggestedElements:["Fire","Ice"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.flechette),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Flechette",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Flechette",icon:"assets/weapons/shotgun.svg",verseClass:"weapon_flechette",upgrades:[]},
    {id:"ripper",name:"Ripper",symbol:"I",color:"#facc15",category:"Shotgun",slotPolicy:"infusable",
      desc:"Class trait Saturation: every pellet applies element stacks individually.",
      fireIdentity:"Semi auto, fewer pellets per shot. Consecutive hits tighten the cone toward a slug.",
      suggestedElements:["Lightning"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.ripper),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Ripper",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Ripper",icon:"assets/weapons/shotgun.svg",verseClass:"weapon_ripper",upgrades:[]},
    {id:"echo",name:"Echo",symbol:"E",color:"#94a3b8",category:"Shotgun",slotPolicy:"locked_power",
      desc:"Time signature shotgun. Saturation still applies while Aftershock records damage.",
      fireIdentity:"One trigger pull, three blasts. The shot repeats twice more at the same point in space, half a second apart.",
      suggestedElements:[],powerSlots:lockedSlots("aftershock","Aftershock"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.echo),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Echo",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Echo",icon:"assets/weapons/shotgun.svg",verseClass:"weapon_echo",upgrades:[]},
    {id:"unmake",name:"Unmake",symbol:"U",color:"#64748b",category:"Shotgun",slotPolicy:"locked_power",
      desc:"Time signature shotgun. Saturation still applies while Regression reverts elites.",
      fireIdentity:"Each pellet strips one layer of armor, shield, or buff from what it hits.",
      suggestedElements:[],powerSlots:lockedSlots("regression","Regression"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.unmake),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Unmake",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Unmake",icon:"assets/weapons/shotgun.svg",verseClass:"weapon_unmake",upgrades:[]},
    {id:"shred",name:"Shred",symbol:"S",color:"#ef4444",category:"SMG",slotPolicy:"infusable",
      desc:"Class trait Haste: sustained fire builds Haste stacks that raise movement and reload speed.",
      fireIdentity:"Consecutive hits on the same target stack a damage bonus. Miss and the stacks decay.",
      suggestedElements:["Fire"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.shred),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Shred",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Shred",icon:"assets/weapons/smg.svg",verseClass:"weapon_shred",upgrades:[]},
    {id:"splitfire",name:"Splitfire",symbol:"P",color:"#facc15",category:"SMG",slotPolicy:"infusable",
      desc:"Class trait Haste: sustained fire builds Haste stacks that raise movement and reload speed.",
      fireIdentity:"Two streams that converge at a fixed distance. Standing at the convergence point doubles your damage.",
      suggestedElements:["Lightning"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.splitfire),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Splitfire",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Splitfire",icon:"assets/weapons/smg.svg",verseClass:"weapon_splitfire",upgrades:[]},
    {id:"flux",name:"Flux",symbol:"X",color:"#38bdf8",category:"SMG",slotPolicy:"infusable",
      desc:"Class trait Haste: sustained fire builds Haste stacks that raise movement and reload speed.",
      fireIdentity:"Damage climbs as the magazine empties. The last quarter of the mag hits hardest.",
      suggestedElements:["Ice","Void"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.flux),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Flux",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Flux",icon:"assets/weapons/smg.svg",verseClass:"weapon_flux",upgrades:[]},
    {id:"tempo",name:"Tempo",symbol:"T",color:"#e2e8f0",category:"SMG",slotPolicy:"locked_power",
      desc:"Time signature SMG. Haste still applies while Accelerate doubles your tempo.",
      fireIdentity:"Fire rate climbs the longer you hold the trigger with no cap. Release and it resets to base.",
      suggestedElements:[],powerSlots:lockedSlots("accelerate","Accelerate"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.tempo),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Tempo",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Tempo",icon:"assets/weapons/smg.svg",verseClass:"weapon_tempo",upgrades:[]},
    {id:"revenant",name:"Revenant",symbol:"V",color:"#475569",category:"SMG",slotPolicy:"locked_power",
      desc:"Time signature SMG. Haste still applies while Second Self mirrors your fire.",
      fireIdentity:"Every tenth kill leaves an afterimage of you that fires one burst at the nearest enemy.",
      suggestedElements:[],powerSlots:lockedSlots("second_self","Second Self"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.revenant),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Revenant",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Revenant",icon:"assets/weapons/smg.svg",verseClass:"weapon_revenant",upgrades:[]},
  ];
  const OLD_STUB_WEAPON_IDS = new Set(["pistol","assault_rifle","smg","shotgun","bolt_sniper","auto_sniper","rocket_launcher","bow","crossbow","minigun"]);

  function ensureWeapons(){
    if(!state.weapons) state.weapons=[];
    if(!state.meta) state.meta={};
    state.meta.weaponClassTraits = state.meta.weaponClassTraits || {};
    Object.entries(WEAPON_CLASS_TRAITS).forEach(([cat,trait])=>{
      if(!state.meta.weaponClassTraits[cat]) state.meta.weaponClassTraits[cat]=JSON.parse(JSON.stringify(trait));
    });
    const ids=new Set(state.weapons.map(w=>w.id));
    const onlyStubs=[...ids].length>0 && [...ids].every(id=>OLD_STUB_WEAPON_IDS.has(id));
    if((state.version||0)<4 || onlyStubs || !state.weapons.length){
      state.weapons=JSON.parse(JSON.stringify(WEAPON_DEFAULTS));
      state.version=Math.max(state.version||0,4);
    } else {
      WEAPON_DEFAULTS.forEach(w=>{ if(!ids.has(w.id) && !OLD_STUB_WEAPON_IDS.has(w.id)) state.weapons.push(JSON.parse(JSON.stringify(w))); });
      state.weapons=state.weapons.filter(w=>!OLD_STUB_WEAPON_IDS.has(w.id));
    }
    /* Backfill armory bars, 4 demo skins, 2 power sockets. */
    state.weapons=state.weapons.map(w=>weaponWithSlotChrome(weaponWithArmoryStats(w)));
  }

  function powerName(id){
    if(!id) return '— empty —';
    const p=(state.wizardry||[]).find(x=>x.id===id);
    return p?p.name:id;
  }

  function renderWeapons(){
    ensureWeapons(); ensureWizardry();
    const order=['Pistol','Assault Rifle','Shotgun','SMG'];
    const cats=[...new Set(state.weapons.map(w=>w.category||'Pistol'))].sort((a,b)=>{
      const ia=order.indexOf(a), ib=order.indexOf(b);
      return (ia<0?99:ia)-(ib<0?99:ib) || a.localeCompare(b);
    });
    const filter=state.meta.weaponFilter||'All';
    const list=state.weapons.filter(w=>filter==='All'||(w.category||'Pistol')===filter);
    const chips=['All',...cats].map(c=>`<button onclick="RGD.setWeaponFilter('${c}')" class="px-2.5 py-1 rounded-lg text-[11px] border ${filter===c?'bg-indigo-600 border-indigo-500 text-white':'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}">${c}</button>`).join('');
    const trait=(filter!=='All'&&(state.meta.weaponClassTraits||WEAPON_CLASS_TRAITS)[filter])||null;
    const traitHtml=trait?`<div class="mt-3 rounded-lg border border-cyan-900/50 bg-cyan-950/30 px-3 py-2"><div class="text-[11px] font-semibold text-cyan-300">Class trait · ${esc(trait.name)}</div><p class="text-[11px] text-gray-400 mt-0.5">${esc(trait.summary)}</p></div>`:`<p class="text-sm text-gray-400">Four classes. <span class="text-amber-300">Open</span> slots take element infusion scrolls (reroll at hub). <span class="text-slate-300">Locked</span> slots are Time signatures that cannot be swapped.</p>`;
    const body=catalogueView()==='table'
      ? weaponTableHtml(list)
      : `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${list.map(weaponCard).join('')||`<div class="col-span-full py-12 text-center text-gray-500 text-sm">No weapons in this category.</div>`}</div>`;
    document.getElementById('tab-weapons').innerHTML=`
      <div class="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div class="max-w-2xl">
          ${traitHtml}
          <div class="flex flex-wrap gap-1.5 mt-3">${chips}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">${viewToggleHtml()}<button onclick="RGD.openWeaponModal()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Add Weapon</button></div>
      </div>
      ${body}`;
  }
  function weaponTableHtml(list){
    if(!list.length) return `<div class="py-12 text-center text-gray-500 text-sm">No weapons in this category.</div>`;
    const rows=list.map(w=>{
      const slots=(w.powerSlots||[]).map(s=>{
        const locked=s.kind==='locked';
        const eq=locked?(s.lockedPowerId||s.equippedPowerId):s.equippedPowerId;
        return `${locked?'🔒':'◇'} ${esc(powerName(eq))}`;
      }).join(' · ')||'—';
      const sug=(w.suggestedElements||[]).join(', ')||'—';
      const iconHtml=w.icon?`<img src="../${esc(w.icon)}" alt="" class="w-7 h-7 rounded object-cover border border-gray-700">`:`<span class="inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold" style="background:${w.color}22;color:${w.color};border:1px solid ${w.color}55">${esc(w.symbol||'?')}</span>`;
      return `<tr class="cat-row" onclick="RGD.openWeaponModal('${w.id}')">
        <td>${iconHtml}</td>
        <td class="text-white font-medium">${esc(w.name)}${w.starter?' <span class="text-[10px] text-amber-400">starter</span>':''}</td>
        <td class="text-gray-300">${esc(w.category||'Pistol')}</td>
        <td><span class="text-[10px] px-1.5 py-0.5 rounded ${w.slotPolicy==='locked_power'?'bg-slate-700 text-slate-200':'bg-amber-900/40 text-amber-200'}">${w.slotPolicy==='locked_power'?'Locked':'Infusable'}</span></td>
        <td class="text-gray-400 max-w-[200px] truncate" title="${esc(w.fireIdentity||'')}">${esc(w.fireIdentity||'—')}</td>
        <td class="text-gray-400">${esc(sug)}</td>
        <td class="text-gray-300 text-[11px]">${slots}</td>
        <td class="mono max-w-[140px] truncate" title="${esc(w.verseClass||'')}">${esc(w.verseClass||'—')}</td>
        <td class="text-right whitespace-nowrap" onclick="event.stopPropagation()">
          <button onclick="event.stopPropagation();RGD.openWeaponModal('${w.id}')" class="text-gray-400 hover:text-white mr-2"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
          <button onclick="event.stopPropagation();RGD.deleteWeapon('${w.id}')" class="text-gray-400 hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </td>
      </tr>`;
    }).join('');
    return `<div class="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto"><table class="cat-table min-w-[980px]"><thead><tr><th></th><th>Name</th><th>Class</th><th>Slots</th><th>Fire identity</th><th>Suits</th><th>Power</th><th>Verse</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function setWeaponFilter(c){ state.meta.weaponFilter=c; save(); renderWeapons(); lucide.createIcons(); }

  function weaponCard(w){
    const slots=(w.powerSlots||[]).map(s=>{
      const locked=s.kind==='locked';
      const eq=locked?(s.lockedPowerId||s.equippedPowerId):s.equippedPowerId;
      return `<div class="flex items-center justify-between text-[11px] py-1.5 border-b border-gray-800/60 last:border-0 gap-2">
        <span class="px-1.5 py-0.5 rounded ${locked?'bg-slate-700 text-slate-200':'bg-amber-900/50 text-amber-200'}">${locked?'Locked':'Open'}</span>
        <span class="text-gray-300 truncate flex-1">${esc(s.label||'Slot')}</span>
        <span class="text-indigo-300 truncate max-w-[40%] text-right">${esc(powerName(eq))}</span>
      </div>`;
    }).join('')||'<div class="text-[11px] text-gray-600">No power slots</div>';
    const sug=(w.suggestedElements||[]).map(e=>`<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">${esc(e)}</span>`).join('');
    const iconHtml=w.icon?`<img src="../${esc(w.icon)}" alt="" class="w-11 h-11 rounded-lg object-cover border border-gray-700">`:`<div class="w-11 h-11 rounded-lg flex items-center justify-center text-xl font-bold" style="background:${w.color}22;color:${w.color};border:1px solid ${w.color}55">${esc(w.symbol||'?')}</div>`;
    return `<div class="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-3 min-w-0">
          ${iconHtml}
          <div class="min-w-0"><div class="text-sm font-semibold text-white leading-tight truncate">${esc(w.name)}${w.starter?' <span class="text-[10px] text-amber-400">starter</span>':''}</div>
            <div class="flex gap-1 mt-1 flex-wrap">
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">${esc(w.category||'Pistol')}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded ${w.slotPolicy==='locked_power'?'bg-slate-700 text-slate-200':'bg-amber-900/40 text-amber-200'}">${w.slotPolicy==='locked_power'?'Locked power':'Infusable'}</span>
            </div>
          </div>
        </div>
        <div class="flex gap-1 shrink-0"><button onclick="RGD.openWeaponModal('${w.id}')" class="text-gray-500 hover:text-white"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button><button onclick="RGD.deleteWeapon('${w.id}')" class="text-gray-500 hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button></div>
      </div>
      ${w.fireIdentity?`<p class="text-[11px] text-cyan-300/80 mt-2 line-clamp-2">${esc(w.fireIdentity)}</p>`:''}
      ${w.desc?`<p class="text-[11px] text-gray-500 mt-1 line-clamp-2">${esc(w.desc)}</p>`:''}
      ${sug?`<div class="flex gap-1 mt-2 flex-wrap"><span class="text-[10px] text-gray-600">Suits:</span>${sug}</div>`:''}
      <div class="mt-3 text-[10px] text-gray-500 break-all"><span class="text-gray-600">UEFN:</span> <code class="text-indigo-300">${esc(w.uefnAsset||'—')}</code></div>
      <div class="mt-1 text-[10px] text-gray-500 break-all"><span class="text-gray-600">Verse:</span> <code class="text-emerald-300">${esc(w.verseClass||'—')}</code></div>
      <div class="mt-3 flex-1"><div class="text-[10px] text-gray-500 mb-1">Power slots</div>${slots}</div>
    </div>`;
  }

  function openWeaponModal(id){
    ensureWeapons(); ensureWizardry();
    const w=state.weapons.find(x=>x.id===id)||{name:'',category:'Pistol',symbol:'W',color:'#3b82f6',desc:'',fireIdentity:'',slotPolicy:'infusable',suggestedElements:[],powerSlots:[{kind:'open',label:'Element Infusion',rerollPolicy:'hub'}],uefnAsset:'',uefnIcon:'',icon:'',verseClass:'',upgrades:[]};
    const policy=w.slotPolicy||'infusable';
    const lockedId=(w.powerSlots&&w.powerSlots[0]&&(w.powerSlots[0].lockedPowerId||w.powerSlots[0].equippedPowerId))||'';
    const powerOpts=(state.wizardry||[]).filter(p=>p.kind==='locked_signature'||p.element==='Time').map(p=>`<option value="${esc(p.id)}" ${lockedId===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
    const sug=Array.isArray(w.suggestedElements)?w.suggestedElements.join(', '):'';
    modalShell(id?'Edit Player Weapon':'Add Player Weapon',`
      <div class="grid grid-cols-2 gap-3">
        ${field('Name',`<input id="mName" value="${esc(w.name||'')}" class="${IN}">`)}
        ${field('Category',`<select id="mCat" class="${IN}">${['Pistol','Assault Rifle','Shotgun','SMG','Sniper','Explosive','Bow','Heavy','Other'].map(t=>`<option ${(w.category||'Pistol')===t?'selected':''}>${t}</option>`).join('')}</select>`)}
        ${field('Symbol',`<input id="mSymbol" maxlength="1" value="${esc(w.symbol||'')}" class="${IN} text-center">`)}
        ${field('Color',`<input id="mColor" type="color" value="${w.color||'#3b82f6'}" class="w-full h-9 bg-gray-900 border border-gray-700 rounded-lg">`)}
      </div>
      ${field('Fire identity',`<textarea id="mFire" rows="2" class="${IN}">${esc(w.fireIdentity||'')}</textarea>`)}
      ${field('Description',`<textarea id="mDesc" rows="2" class="${IN}">${esc(w.desc||'')}</textarea>`)}
      <div class="grid grid-cols-2 gap-3">
        ${field('Slot policy',`<select id="mPolicy" class="${IN}" onchange="document.getElementById('mLockedWrap').style.display=this.value==='locked_power'?'block':'none'"><option value="infusable" ${policy==='infusable'?'selected':''}>Infusable (open element slot)</option><option value="locked_power" ${policy==='locked_power'?'selected':''}>Locked signature power</option></select>`)}
        ${field('Suggested elements',`<input id="mSug" value="${esc(sug)}" placeholder="Ice, Fire" class="${IN}">`)}
      </div>
      <div id="mLockedWrap" style="display:${policy==='locked_power'?'block':'none'}">${field('Locked power',`<select id="mLocked" class="${IN}"><option value="">—</option>${powerOpts}</select>`)}</div>
      ${field('UEFN Custom Weapon Path',`<input id="mAsset" value="${esc(w.uefnAsset||'')}" placeholder="/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_…" class="${IN} font-mono text-xs">`)}
      ${field('UEFN Icon Texture Path',`<input id="mIconAsset" value="${esc(w.uefnIcon||'')}" placeholder="/Roguelike/Weapons/Icons/T_Icon_…" class="${IN} font-mono text-xs">`)}
      ${field('Panel Icon (plugin SVG)',`<input id="mIcon" value="${esc(w.icon||'')}" placeholder="assets/weapons/pistol.svg" class="${IN} font-mono text-xs">`)}
      ${field('Verse class',`<input id="mVerse" value="${esc(w.verseClass||'')}" placeholder="weapon_service_pistol" class="${IN} font-mono text-xs">`)}
      <div class="mt-3"><div class="text-[11px] text-gray-400 mb-2">Shop price (0 = not sold / starter)</div>${priceFieldsHtml(w.price,'mWPrice')}</div>
      <div class="mt-3"><div class="text-[11px] text-gray-400 mb-2">Armory detail bars (0–100) — Damage / Accuracy / Range / Mobility / Fire Rate</div>
        <div class="grid grid-cols-2 gap-2">${ARMORY_STAT_FIELDS.map(s=>{
          const v=(w.stats&&w.stats[s.id]!=null)?w.stats[s.id]:'';
          return field(s.name, `<input id="mWStat_${esc(s.id)}" type="number" min="0" max="100" step="1" value="${esc(v)}" class="${IN}">`);
        }).join('')}</div>
      </div>
      <p class="text-[11px] text-gray-500">Open slots reroll at the hub between runs. Locked Time powers never accept element infusions.</p>
    `,`RGD.saveWeapon('${id||''}')`);
  }

  function saveWeapon(id){
    const name=val('mName').trim(); if(!name)return toast('Name required','warn');
    const policy=val('mPolicy')||'infusable';
    const sug=val('mSug').split(',').map(s=>s.trim()).filter(Boolean);
    let powerSlots;
    if(policy==='locked_power'){
      const pid=val('mLocked');
      const pname=powerName(pid);
      const prev=(id&&state.weapons.find(x=>x.id===id)||{}).powerSlots||[];
      const eq2=(prev[1]&&prev[1].kind==='open')?prev[1].equippedPowerId:null;
      powerSlots=[
        {id:'slot_signature',index:1,kind:'locked',accepts:[],rerollPolicy:'none',lockedPowerId:pid,equippedPowerId:pid,label:pname==='— empty —'?'Signature':pname},
        {id:'slot_element',index:2,kind:'open',accepts:['element_infusion','charged'],rerollPolicy:'hub',equippedPowerId:eq2,label:'Element Infusion'},
      ];
    } else {
      const prev=(id&&state.weapons.find(x=>x.id===id)||{}).powerSlots||[];
      const eq0=(prev[0]&&prev[0].kind==='open')?prev[0].equippedPowerId:null;
      const eq1=(prev[1]&&prev[1].kind==='open')?prev[1].equippedPowerId:null;
      powerSlots=[
        {id:'slot_element',index:1,kind:'open',accepts:['element_infusion','charged'],rerollPolicy:'hub',equippedPowerId:eq0,label:'Element Infusion'},
        {id:'slot_charged',index:2,kind:'open',accepts:['charged','element_infusion'],rerollPolicy:'hub',equippedPowerId:eq1,label:'Charged Scroll'},
      ];
    }
    const stats={};
    ARMORY_STAT_FIELDS.forEach(s=>{
      const el=document.getElementById('mWStat_'+s.id);
      if(!el) return;
      const raw=String(el.value||'').trim();
      if(raw==='') return;
      stats[s.id]=Math.max(0, Math.min(100, Number(raw)||0));
    });
    const prev=(id&&state.weapons.find(x=>x.id===id))||{};
    const rec={
      id:id||uid('weapon'), name, category:val('mCat')||'Pistol', symbol:val('mSymbol')||name[0].toUpperCase(),
      color:val('mColor'), desc:val('mDesc'), fireIdentity:val('mFire'),
      slotPolicy:policy, powerSlots, suggestedElements:sug,
      starter:!!prev.starter,
      uefnAsset:val('mAsset').trim(), uefnIcon:val('mIconAsset').trim(),
      icon:val('mIcon').trim()||('assets/weapons/'+(id||name.toLowerCase().replace(/[^a-z0-9]+/g,'_'))+'.svg'),
      verseClass:val('mVerse').trim()||('weapon_'+(id||name.toLowerCase().replace(/[^a-z0-9]+/g,'_'))),
      price:collectPrice('mWPrice'),
      stats,
      skins:Array.isArray(prev.skins)&&prev.skins.length>=4?prev.skins:demoSkinsFor({color:val('mColor')||'#9ca3af'}),
      upgrades:Array.isArray(prev.upgrades)?prev.upgrades:[]
    };
    if(id){ const i=state.weapons.findIndex(x=>x.id===id); state.weapons[i]=rec; }
    else state.weapons.push(rec);
    try{ if(typeof syncArmoryScreenFromWeapons==='function') syncArmoryScreenFromWeapons({force:true}); }catch(e){}
    save({flush:true}); closeModal(); renderWeapons(); toast('Weapon saved','ok');
  }
  function deleteWeapon(id){
    const w=(state.weapons||[]).find(x=>x.id===id); const label=w?w.name:id;
    confirmModal('Delete Weapon',
      'Really delete weapon <code class="text-indigo-300">'+esc(label)+'</code>?',
      "RGD.confirmDeleteWeapon('"+id+"')");
  }
  function confirmDeleteWeapon(id){
    closeModal();
    state.weapons=(state.weapons||[]).filter(w=>w.id!==id);
    try{ if(typeof syncArmoryScreenFromWeapons==='function') syncArmoryScreenFromWeapons({force:true}); }catch(e){}
    save({flush:true}); renderWeapons(); toast('Weapon deleted','ok');
  }

  /* ===== wizardry (element powers / scrolls) ===== */
  const WIZARDRY_DEFAULTS = [
    {id:"burn_infusion",name:"Burn Infusion",element:"Fire",kind:"element_infusion",color:"#ef4444",symbol:"F",stackName:"Burn",stackThreshold:5,procName:"Ignite",procDesc:"DoT that spreads to nearby enemies.",desc:"On hit, apply Burn. At 5 stacks: Ignite.",findable:true,buyable:true,reusable:true,customItemId:"scroll_burn_infusion",verseClass:"wizardry_burn_infusion"},
    {id:"cinder_nova",name:"Cinder Nova",element:"Fire",kind:"charged",color:"#f97316",symbol:"N",chargedName:"Cinder Nova",chargedDesc:"Ignites everything around you; doubles burn ticks for 6s.",desc:"Charged ability: Cinder Nova.",findable:true,buyable:true,reusable:true,customItemId:"scroll_cinder_nova",verseClass:"wizardry_cinder_nova"},
    {id:"chill_infusion",name:"Chill Infusion",element:"Ice",kind:"element_infusion",color:"#38bdf8",symbol:"I",stackName:"Chill",stackThreshold:5,procName:"Frozen",procDesc:"Locked in place; 2x crit until break.",desc:"On hit, apply Chill. At 5 stacks: Frozen.",findable:true,buyable:true,reusable:true,customItemId:"scroll_chill_infusion",verseClass:"wizardry_chill_infusion"},
    {id:"frost_field",name:"Frost Field",element:"Ice",kind:"charged",color:"#0ea5e9",symbol:"Z",chargedName:"Frost Field",chargedDesc:"Zone that chills everything inside continuously.",desc:"Charged ability: Frost Field.",findable:true,buyable:true,reusable:true,customItemId:"scroll_frost_field",verseClass:"wizardry_frost_field"},
    {id:"charge_infusion",name:"Charge Infusion",element:"Lightning",kind:"element_infusion",color:"#facc15",symbol:"L",stackName:"Charge",stackThreshold:5,procName:"Overload",procDesc:"Bursts and jumps to 3 nearby enemies.",desc:"On hit, apply Charge. At 5 stacks: Overload.",findable:true,buyable:true,reusable:true,customItemId:"scroll_charge_infusion",verseClass:"wizardry_charge_infusion"},
    {id:"storm_call",name:"Storm Call",element:"Lightning",kind:"charged",color:"#eab308",symbol:"K",chargedName:"Storm Call",chargedDesc:"Strikes the 6 highest charge targets on screen.",desc:"Charged ability: Storm Call.",findable:true,buyable:true,reusable:true,customItemId:"scroll_storm_call",verseClass:"wizardry_storm_call"},
    {id:"decay_infusion",name:"Decay Infusion",element:"Void",kind:"element_infusion",color:"#a855f7",symbol:"V",stackName:"Decay",stackThreshold:5,procName:"Collapse",procDesc:"Pulls nearby enemies; cuts their damage.",desc:"On hit, apply Decay. At 5 stacks: Collapse.",findable:true,buyable:true,reusable:true,customItemId:"scroll_decay_infusion",verseClass:"wizardry_decay_infusion"},
    {id:"singularity",name:"Singularity",element:"Void",kind:"charged",color:"#7c3aed",symbol:"Q",chargedName:"Singularity",chargedDesc:"Rift that pulls, holds, and drains.",desc:"Charged ability: Singularity.",findable:true,buyable:true,reusable:true,customItemId:"scroll_singularity",verseClass:"wizardry_singularity"},
    {id:"stasis_field",name:"Stasis Field",element:"Time",kind:"locked_signature",color:"#94a3b8",symbol:"T",chargedName:"Stasis Field",chargedDesc:"Time stops; stored damage lands when field drops.",desc:"Locked to Paradox. Time stop zone; damage stored then released.",findable:false,buyable:false,reusable:false,customItemId:"",verseClass:"wizardry_stasis_field"},
    {id:"rewind",name:"Rewind",element:"Time",kind:"locked_signature",color:"#64748b",symbol:"R",chargedName:"Rewind",chargedDesc:"Health, ammo, position snap back 5 seconds.",desc:"Locked to Hourglass. Rewind self 5 seconds.",findable:false,buyable:false,reusable:false,customItemId:"",verseClass:"wizardry_rewind"},
    {id:"loop",name:"Loop",element:"Time",kind:"locked_signature",color:"#94a3b8",symbol:"L",chargedName:"Loop",chargedDesc:"Records four seconds of fire, then replays it on its own.",desc:"Locked to Recursion. Records four seconds of your fire, then replays it while you do something else.",findable:false,buyable:false,reusable:false,customItemId:"",verseClass:"wizardry_loop"},
    {id:"precognition",name:"Precognition",element:"Time",kind:"locked_signature",color:"#cbd5e1",symbol:"P",chargedName:"Precognition",chargedDesc:"For six seconds nothing you can see can hit you.",desc:"Locked to Prophecy. For six seconds nothing you can see can hit you.",findable:false,buyable:false,reusable:false,customItemId:"",verseClass:"wizardry_precognition"},
    {id:"aftershock",name:"Aftershock",element:"Time",kind:"locked_signature",color:"#94a3b8",symbol:"A",chargedName:"Aftershock",chargedDesc:"Records five seconds of damage, replays at the same spots three seconds later.",desc:"Locked to Echo. For five seconds everything you deal is recorded, then replays at the same spots three seconds later.",findable:false,buyable:false,reusable:false,customItemId:"",verseClass:"wizardry_aftershock"},
    {id:"regression",name:"Regression",element:"Time",kind:"locked_signature",color:"#64748b",symbol:"G",chargedName:"Regression",chargedDesc:"Reverts enemies in front, stripping shields/armor/elite mods.",desc:"Locked to Unmake. Reverts every enemy in front of you to an earlier state, removing shields, armor, and elite modifiers.",findable:false,buyable:false,reusable:false,customItemId:"",verseClass:"wizardry_regression"},
    {id:"accelerate",name:"Accelerate",element:"Time",kind:"locked_signature",color:"#e2e8f0",symbol:"C",chargedName:"Accelerate",chargedDesc:"Move, shoot, and reload at double speed while the world runs normal.",desc:"Locked to Tempo. You move, shoot, and reload at double speed while the world runs normal.",findable:false,buyable:false,reusable:false,customItemId:"",verseClass:"wizardry_accelerate"},
    {id:"second_self",name:"Second Self",element:"Time",kind:"locked_signature",color:"#475569",symbol:"2",chargedName:"Second Self",chargedDesc:"Time clone mirrors everything you fire for eight seconds.",desc:"Locked to Revenant. A time clone appears and mirrors everything you fire for eight seconds.",findable:false,buyable:false,reusable:false,customItemId:"",verseClass:"wizardry_second_self"},
  ];
  const ELEMENT_ORDER = ["Fire","Ice","Lightning","Void","Time"];

  function ensureWizardry(){
    if(!state.wizardry) state.wizardry=[];
    if(!state.elements) state.elements=[];
    if(!state.meta) state.meta={};
    state.meta.infusionRerollPolicy = state.meta.infusionRerollPolicy || 'hub';
    const seen=new Set(state.wizardry.map(p=>p.id));
    if(!state.wizardry.length || (state.version||0)<4){
      state.wizardry=JSON.parse(JSON.stringify(WIZARDRY_DEFAULTS));
    } else {
      WIZARDRY_DEFAULTS.forEach(p=>{ if(!seen.has(p.id)) state.wizardry.push(JSON.parse(JSON.stringify(p))); });
    }
    // Ensure scroll items exist for findable powers
    if(!state.items) state.items=[];
    const itemIds=new Set(state.items.map(i=>i.id));
    state.wizardry.filter(p=>p.findable && p.customItemId).forEach(p=>{
      if(!itemIds.has(p.customItemId)){
        const zeros={}; (state.stats||[]).forEach(s=>zeros[s.id]=0);
        state.items.push({id:p.customItemId,name:'Scroll: '+p.name,category:'Wizardry Scroll',symbol:p.symbol,color:p.color,
          desc:'Reusable scroll. Slot onto any open weapon power slot. '+(p.desc||''),
          stats:zeros,wizardryId:p.id,element:p.element,reusable:true,uefnCustomItem:'',verseClass:p.verseClass});
      }
    });
  }

  function renderWizardry(){
    ensureWizardry();
    const filter=state.meta.wizardryFilter||'All';
    const chips=['All',...ELEMENT_ORDER].map(c=>`<button onclick="RGD.setWizardryFilter('${c}')" class="px-2.5 py-1 rounded-lg text-[11px] border ${filter===c?'bg-violet-600 border-violet-500 text-white':'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}">${c}</button>`).join('');
    const list=state.wizardry.filter(p=>filter==='All'||p.element===filter);
    let body;
    if(catalogueView()==='table'){
      body=wizardryTableHtml(list);
    } else {
      body=ELEMENT_ORDER.filter(e=>filter==='All'||filter===e).map(el=>{
        const powers=state.wizardry.filter(p=>p.element===el);
        if(!powers.length) return '';
        const cards=powers.map(wizardryCard).join('');
        return `<div class="mb-6"><h3 class="text-sm font-semibold text-white mb-3 flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full" style="background:${powers[0].color}"></span>${el}</h3><div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">${cards}</div></div>`;
      }).join('')||'<div class="py-12 text-center text-gray-500 text-sm">No wizardry powers.</div>';
    }
    document.getElementById('tab-wizardry').innerHTML=`
      <div class="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div class="max-w-2xl">
          <p class="text-sm text-gray-400">Remnant-style scrolls. Find or buy a reusable scroll, then slot it on any <span class="text-amber-300">open</span> weapon power slot. Time signatures stay locked. Individual powers only — no reactions in this catalogue yet.</p>
          <div class="flex flex-wrap gap-1.5 mt-3">${chips}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">${viewToggleHtml()}<button onclick="RGD.openWizardryModal()" class="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Add Power</button></div>
      </div>
      ${body}`;
  }
  function wizardryTableHtml(list){
    if(!list.length) return `<div class="py-12 text-center text-gray-500 text-sm">No wizardry powers.</div>`;
    const rows=list.map(p=>{
      const kindBadge=p.kind==='element_infusion'?'Infusion':(p.kind==='charged'?'Charged':(p.kind==='locked_signature'?'Locked':'Power'));
      const stack=p.kind==='element_infusion'
        ? `${esc(p.stackName||'?')}×${p.stackThreshold||5} → ${esc(p.procName||'?')}`
        : (p.chargedName||p.name||'—');
      return `<tr class="cat-row" onclick="RGD.openWizardryModal('${p.id}')">
        <td><span class="inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold" style="background:${p.color}22;color:${p.color};border:1px solid ${p.color}55">${esc(p.symbol||'?')}</span></td>
        <td class="text-white font-medium">${esc(p.name)}</td>
        <td class="text-gray-300">${esc(p.element)}</td>
        <td><span class="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-200">${kindBadge}</span></td>
        <td class="text-gray-400 text-[11px]">${stack}</td>
        <td class="text-gray-400">${p.findable?'Scroll':(p.reusable?'Reusable':'—')}${p.reusable&&p.findable?' · reusable':''}</td>
        <td class="mono max-w-[140px] truncate" title="${esc(p.customItemId||'')}">${esc(p.customItemId||'—')}</td>
        <td class="mono max-w-[140px] truncate" title="${esc(p.verseClass||'')}">${esc(p.verseClass||'—')}</td>
        <td class="text-right whitespace-nowrap" onclick="event.stopPropagation()">
          <button onclick="event.stopPropagation();RGD.openWizardryModal('${p.id}')" class="text-gray-400 hover:text-white mr-2"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
          <button onclick="event.stopPropagation();RGD.deleteWizardry('${p.id}')" class="text-gray-400 hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </td>
      </tr>`;
    }).join('');
    return `<div class="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto"><table class="cat-table min-w-[980px]"><thead><tr><th></th><th>Name</th><th>Element</th><th>Kind</th><th>Stack / Charge</th><th>Loot</th><th>Custom item</th><th>Verse</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function setWizardryFilter(c){ state.meta.wizardryFilter=c; save(); renderWizardry(); lucide.createIcons(); }

  function wizardryCard(p){
    const kindBadge=p.kind==='element_infusion'?'Infusion':(p.kind==='charged'?'Charged':(p.kind==='locked_signature'?'Locked':'Power'));
    const meta=p.kind==='element_infusion'
      ? `<div class="text-[11px] text-gray-400 mt-2">Stack <span class="text-white">${esc(p.stackName||'?')}</span> ×${p.stackThreshold||5} → <span class="text-amber-300">${esc(p.procName||'?')}</span></div><p class="text-[11px] text-gray-500 mt-1">${esc(p.procDesc||p.desc||'')}</p>`
      : `<p class="text-[11px] text-gray-500 mt-2">${esc(p.chargedDesc||p.desc||'')}</p>`;
    return `<div class="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold" style="background:${p.color}22;color:${p.color};border:1px solid ${p.color}55">${esc(p.symbol||'?')}</div>
          <div class="min-w-0"><div class="text-sm font-semibold text-white truncate">${esc(p.name)}</div>
            <div class="flex gap-1 mt-1 flex-wrap">
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">${esc(p.element)}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-200">${kindBadge}</span>
              ${p.findable?'<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-200">Scroll</span>':''}
              ${p.reusable?'<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">Reusable</span>':''}
            </div>
          </div>
        </div>
        <div class="flex gap-1 shrink-0"><button onclick="RGD.openWizardryModal('${p.id}')" class="text-gray-500 hover:text-white"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button><button onclick="RGD.deleteWizardry('${p.id}')" class="text-gray-500 hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button></div>
      </div>
      ${meta}
      <div class="mt-3 text-[10px] text-gray-500 break-all"><span class="text-gray-600">Custom item:</span> <code class="text-amber-300">${esc(p.customItemId||'—')}</code></div>
      <div class="mt-1 text-[10px] text-gray-500 break-all"><span class="text-gray-600">Verse:</span> <code class="text-emerald-300">${esc(p.verseClass||'—')}</code></div>
      <div class="mt-1 text-[10px] text-gray-500 break-all"><span class="text-gray-600">UEFN custom item:</span> <code class="text-indigo-300">${esc(p.uefnCustomItem||'(set in Details / @editable)')}</code></div>
    </div>`;
  }

  function openWizardryModal(id){
    ensureWizardry();
    const p=state.wizardry.find(x=>x.id===id)||{name:'',element:'Fire',kind:'element_infusion',color:'#a855f7',symbol:'W',desc:'',stackName:'',stackThreshold:5,procName:'',procDesc:'',chargedName:'',chargedDesc:'',findable:true,buyable:true,reusable:true,customItemId:'',uefnCustomItem:'',verseClass:''};
    modalShell(id?'Edit Wizardry Power':'Add Wizardry Power',`
      <div class="grid grid-cols-2 gap-3">
        ${field('Name',`<input id="mName" value="${esc(p.name||'')}" class="${IN}">`)}
        ${field('Element',`<select id="mEl" class="${IN}">${ELEMENT_ORDER.map(t=>`<option ${p.element===t?'selected':''}>${t}</option>`).join('')}</select>`)}
        ${field('Kind',`<select id="mKind" class="${IN}"><option value="element_infusion" ${p.kind==='element_infusion'?'selected':''}>Element infusion</option><option value="charged" ${p.kind==='charged'?'selected':''}>Charged ability</option><option value="locked_signature" ${p.kind==='locked_signature'?'selected':''}>Locked signature</option></select>`)}
        ${field('Symbol',`<input id="mSymbol" maxlength="1" value="${esc(p.symbol||'')}" class="${IN} text-center">`)}
        ${field('Color',`<input id="mColor" type="color" value="${p.color||'#a855f7'}" class="w-full h-9 bg-gray-900 border border-gray-700 rounded-lg">`)}
        ${field('Stack threshold',`<input id="mThresh" type="number" value="${p.stackThreshold||5}" class="${IN}">`)}
      </div>
      ${field('Description',`<textarea id="mDesc" rows="2" class="${IN}">${esc(p.desc||'')}</textarea>`)}
      <div class="grid grid-cols-2 gap-3">
        ${field('Stack name',`<input id="mStack" value="${esc(p.stackName||'')}" class="${IN}">`)}
        ${field('Proc name (at threshold)',`<input id="mProc" value="${esc(p.procName||'')}" class="${IN}">`)}
      </div>
      ${field('Proc description',`<textarea id="mProcDesc" rows="2" class="${IN}">${esc(p.procDesc||'')}</textarea>`)}
      <div class="grid grid-cols-2 gap-3">
        ${field('Charged name',`<input id="mCharged" value="${esc(p.chargedName||'')}" class="${IN}">`)}
        ${field('Custom item id (scroll)',`<input id="mItem" value="${esc(p.customItemId||'')}" placeholder="scroll_…" class="${IN} font-mono text-xs">`)}
      </div>
      ${field('Charged description',`<textarea id="mChargedDesc" rows="2" class="${IN}">${esc(p.chargedDesc||'')}</textarea>`)}
      ${field('Verse class (@editable device ref)',`<input id="mVerse" value="${esc(p.verseClass||'')}" placeholder="wizardry_burn_infusion" class="${IN} font-mono text-xs">`)}
      ${field('UEFN custom item class path',`<input id="mUeFnItem" value="${esc(p.uefnCustomItem||'')}" placeholder="(wire later in Verse device)" class="${IN} font-mono text-xs">`)}
      <div class="flex gap-4 text-xs text-gray-300 mt-1">
        <label class="flex items-center gap-2"><input id="mFind" type="checkbox" ${p.findable!==false?'checked':''}> Findable</label>
        <label class="flex items-center gap-2"><input id="mBuy" type="checkbox" ${p.buyable!==false?'checked':''}> Buyable</label>
        <label class="flex items-center gap-2"><input id="mReuse" type="checkbox" ${p.reusable!==false?'checked':''}> Reusable scroll</label>
      </div>
    `,`RGD.saveWizardry('${id||''}')`);
  }

  function saveWizardry(id){
    const name=val('mName').trim(); if(!name)return toast('Name required','warn');
    const findable=document.getElementById('mFind').checked;
    const buyable=document.getElementById('mBuy').checked;
    const reusable=document.getElementById('mReuse').checked;
    const kind=val('mKind');
    let cid=val('mItem').trim();
    if(findable && !cid) cid='scroll_'+(id||name.toLowerCase().replace(/[^a-z0-9]+/g,'_'));
    if(kind==='locked_signature') cid='';
    const rec={
      id:id||uid('power'), name, element:val('mEl'), kind, color:val('mColor'),
      symbol:val('mSymbol')||name[0].toUpperCase(), desc:val('mDesc'),
      stackName:val('mStack'), stackThreshold:parseInt(val('mThresh')||'5',10)||5,
      procName:val('mProc'), procDesc:val('mProcDesc'),
      chargedName:val('mCharged'), chargedDesc:val('mChargedDesc'),
      findable, buyable, reusable, customItemId:cid,
      uefnCustomItem:val('mUeFnItem').trim(),
      verseClass:val('mVerse').trim()||('wizardry_'+(id||name.toLowerCase().replace(/[^a-z0-9]+/g,'_'))),
      category:'Wizardry'
    };
    if(id){ const i=state.wizardry.findIndex(x=>x.id===id); state.wizardry[i]=rec; }
    else state.wizardry.push(rec);
    ensureWizardry();
    try{ if(typeof syncArmoryScreenFromWeapons==='function') syncArmoryScreenFromWeapons({force:true}); }catch(e){}
    save({flush:true}); closeModal(); renderWizardry(); toast('Power saved','ok');
  }
  function deleteWizardry(id){
    const p=(state.wizardry||[]).find(x=>x.id===id); const label=p?p.name:id;
    confirmModal('Delete Power',
      'Really delete wizardry power <code class="text-indigo-300">'+esc(label)+'</code>?',
      "RGD.confirmDeleteWizardry('"+id+"')");
  }
  function confirmDeleteWizardry(id){
    closeModal();
    state.wizardry=(state.wizardry||[]).filter(p=>p.id!==id);
    try{ if(typeof syncArmoryScreenFromWeapons==='function') syncArmoryScreenFromWeapons({force:true}); }catch(e){}
    save({flush:true}); renderWizardry(); toast('Power deleted','ok');
  }

  /* ===== list↔detail slide + confirm overlays ===== */
  function closeConfirm(){ const r=document.getElementById('modalRoot'); if(r) r.innerHTML=''; }
  function closeDetail(){
    const slide=document.getElementById('slideBody');
    const pane=document.getElementById('detailPane');
    if(slide) slide.classList.remove('is-detail');
    if(pane){ pane.setAttribute('aria-hidden','true'); pane.innerHTML=''; }
  }
  function closeModal(){ closeConfirm(); closeDetail(); }
  /* Entity editors slide over the table list (Settings/Discord pattern) — not modal popups. */
  function modalShell(title,body,saveFn){
    const pane=document.getElementById('detailPane');
    const slide=document.getElementById('slideBody');
    if(!pane||!slide){ console.warn('slide shell missing'); return; }
    pane.innerHTML=`
      <div class="detail-inner">
        <div class="detail-head">
          <div class="detail-head-left">
            <button type="button" onclick="RGD.closeDetail()" class="detail-back"><i data-lucide="arrow-left" class="w-4 h-4"></i> Back</button>
            <h3 class="detail-title">${esc(title)}</h3>
          </div>
          <div class="detail-actions">
            <button type="button" onclick="RGD.closeDetail()" class="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm">Cancel</button>
            <button type="button" onclick="${saveFn}" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm">Save</button>
          </div>
        </div>
        <div class="detail-scroll space-y-4">${body}</div>
      </div>`;
    slide.classList.add('is-detail');
    pane.setAttribute('aria-hidden','false');
    lucide.createIcons();
  }
  /* Sandboxed plugin panels block window.confirm (no allow-modals) — use an in-panel dialog. */
  function confirmModal(title, body, okFn, okLabel){
    document.getElementById('modalRoot').innerHTML=`
    <div class="modal-back fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onclick="if(event.target===this)RGD.closeConfirm()">
      <div class="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div class="flex items-center justify-between px-5 py-3 border-b border-gray-700"><h3 class="text-sm font-semibold text-white">${esc(title)}</h3><button onclick="RGD.closeConfirm()" class="text-gray-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button></div>
        <div class="p-5 text-sm text-gray-300">${body}</div>
        <div class="flex justify-end gap-2 px-5 py-3 border-t border-gray-700"><button onclick="RGD.closeConfirm()" class="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm">Cancel</button><button onclick="${okFn}" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm">${esc(okLabel||'Delete')}</button></div>
      </div></div>`; lucide.createIcons();
  }

  const field=(l,i)=>`<div><label class="text-[11px] text-gray-400 block mb-1">${l}</label>${i}</div>`;
  const IN='w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm';

  function openStatModal(id){ const s=state.stats.find(x=>x.id===id)||{id:'',name:'',def:0};
    modalShell(id?'Edit Stat':'New Stat',`${field('Stat ID (used by MCP tools)',`<input id="mStatId" value="${esc(s.id)}" ${id?'readonly':''} placeholder="hp" class="${IN} ${id?'opacity-60':''}">`)}${field('Display Name',`<input id="mStatName" value="${esc(s.name)}" placeholder="Health" class="${IN}">`)}${field('Default Value',`<input id="mStatDef" type="number" value="${s.def}" class="${IN}">`)}`,`RGD.saveStat('${id||''}')`); }
  function saveStat(id){ const name=val('mStatName').trim(); let sid=id||val('mStatId').trim().toLowerCase().replace(/[^a-z0-9_]/g,'_'); const def=Number(val('mStatDef'))||0;
    if(!sid||!name)return toast('ID and name required','warn'); if(!id&&state.stats.some(s=>s.id===sid))return toast('Stat id exists','warn');
    if(id){ const s=state.stats.find(x=>x.id===id); s.name=name; s.def=def; } else { state.stats.push({id:sid,name,def}); state.npcs.forEach(n=>{n.stats=n.stats||{}; if(n.stats[sid]==null)n.stats[sid]=def;}); state.items.forEach(i=>{i.stats=i.stats||{}; if(i.stats[sid]==null)i.stats[sid]=0;}); }
    save({flush:true}); closeModal(); renderStats(); toast('Stat saved','ok'); }
  function deleteStat(id){
    confirmModal('Delete Stat',
      'Really delete stat <code class="text-indigo-300">'+esc(id)+'</code>? It will be removed from every NPC and Drop.',
      "RGD.confirmDeleteStat('"+id+"')");
  }
  function confirmDeleteStat(id){
    closeModal();
    state.stats=state.stats.filter(s=>s.id!==id); state.npcs.forEach(n=>{if(n.stats)delete n.stats[id];}); state.items.forEach(i=>{if(i.stats)delete i.stats[id];}); save({flush:true}); renderStats(); toast('Stat deleted','ok');
  }

  function statFieldsHtml(e,isItem){ return state.stats.map(s=>{ const v=(e.stats&&e.stats[s.id]!=null)?e.stats[s.id]:(isItem?0:s.def);
    return `<div class="flex items-center gap-2"><span class="text-xs text-gray-400 w-24 truncate">${esc(s.name)}${isItem?' Δ':''}</span><input data-stat="${s.id}" type="number" value="${v}" class="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm"></div>`; }).join('')||`<div class="text-xs text-gray-600">Define Global Stats first.</div>`; }
  function collectStats(){ const o={}; document.querySelectorAll('#mStats [data-stat]').forEach(inp=>{ o[inp.dataset.stat]=Number(inp.value)||0; }); return o; }

  function diffFieldsHtml(n){
    const ds=n.difficultyStats||[];
    const rows=(state.difficulties||[{index:0,name:'Easy'},{index:1,name:'Normal'},{index:2,name:'Hard'}]).map((d,i)=>{
      const s=ds[d.index!=null?d.index:i]||{maxHealth:100,damageMultiplier:1,dodgeChance:0,moveSpeedMultiplier:1,spawnWeight:1};
      const p='d'+i;
      return `<div class="border border-gray-700 rounded-lg p-3 space-y-2"><div class="text-xs font-semibold text-indigo-300">${esc(d.name||diffLabel(i))}</div>
        <div class="grid grid-cols-2 gap-2 text-[11px]">
          <label class="text-gray-500">Max HP<input data-diff="${p}" data-k="maxHealth" type="number" step="0.1" value="${s.maxHealth||0}" class="${IN} mt-1 py-1"></label>
          <label class="text-gray-500">Dmg mult<input data-diff="${p}" data-k="damageMultiplier" type="number" step="0.01" value="${s.damageMultiplier||1}" class="${IN} mt-1 py-1"></label>
          <label class="text-gray-500">Dodge %<input data-diff="${p}" data-k="dodgeChance" type="number" value="${s.dodgeChance||0}" class="${IN} mt-1 py-1"></label>
          <label class="text-gray-500">Speed mult<input data-diff="${p}" data-k="moveSpeedMultiplier" type="number" step="0.01" value="${s.moveSpeedMultiplier||1}" class="${IN} mt-1 py-1"></label>
        </div></div>`;
    }).join('');
    return rows||'<div class="text-xs text-gray-600">Difficulty stats auto-generated on save.</div>';
  }
  function collectDiffStats(){
    const out=[]; for(let i=0;i<3;i++){
      const o={maxHealth:100,damageMultiplier:1,dodgeChance:0,moveSpeedMultiplier:1,spawnWeight:1};
      document.querySelectorAll(`[data-diff="d${i}"]`).forEach(inp=>{ o[inp.dataset.k]=Number(inp.value)||0; });
      out.push(o);
    } return out;
  }
  function openNPCModal(id){ const n=state.npcs.find(x=>x.id===id)||{name:'',type:'Enemy',role:'Melee',symbol:'E',color:'#ef4444',behavior:'Aggressive',stats:{},difficultyStats:[],currencyDrop:{},dropTableIds:[],bonusDrops:[]};
    const curT=npcType(n), curR=npcRole(n); ensureCurrencies(); ensureDropTables();
    modalShell(id?'Edit NPC':'Create NPC',`<div class="grid grid-cols-2 gap-3">${field('Name',`<input id="mName" value="${esc(n.name)}" class="${IN}">`)}${field('Type',`<select id="mType" class="${IN}">${NPC_TYPES.map(t=>`<option ${curT===t?'selected':''}>${t}</option>`).join('')}</select>`)}${field('Role',`<select id="mRole" class="${IN}">${NPC_ROLES.map(t=>`<option ${curR===t?'selected':''}>${t}</option>`).join('')}</select>`)}${field('Symbol (1 char)',`<input id="mSymbol" maxlength="1" value="${esc(n.symbol||'')}" class="${IN} text-center">`)}${field('Color',`<input id="mColor" type="color" value="${n.color||'#ef4444'}" class="w-full h-9 bg-gray-900 border border-gray-700 rounded-lg">`)}${field('AI Behavior',`<input id="mBehavior" value="${esc(n.behavior||'')}" placeholder="Melee Chaser / Friendly Caster" class="${IN}">`)}</div><p class="text-[11px] text-gray-500 mt-1">Type = who they are (Enemy / Elite / Boss / Friendly). Role = how they fight — Friendlies are people like Wizard Bob.</p><div class="mt-3 p-3 rounded-xl border border-amber-700/40 bg-amber-950/20"><div class="text-[11px] text-amber-300 mb-2 font-semibold">$ Currency on kill</div>${currencyAmountFields(n.currencyDrop||{},'mDrop')}</div><div class="mt-3"><div class="flex items-center justify-between mb-2"><div class="text-[11px] text-gray-400">Shared drop tables</div><button type="button" onclick="RGD.go('droptables')" class="text-[10px] text-indigo-300 hover:text-indigo-200">Manage tables</button></div>${npcLootAttachHtml(n)}</div><div class="mt-3"><div class="text-[11px] text-gray-400 mb-2">Bonus drops (this enemy only)</div>${dropEntriesEditorHtml(n.bonusDrops||[],'mBonus')}</div><div class="mt-3"><div class="text-[11px] text-gray-400 mb-2">Base Stats (Normal tier reference)</div><div class="space-y-2" id="mStats">${statFieldsHtml(n,false)}</div></div><div><div class="text-[11px] text-gray-400 mb-2">Per-Difficulty (matches Verse EasyStats/NormalStats/HardStats)</div><div id="mDiff" class="space-y-2">${diffFieldsHtml(n)}</div></div>`,`RGD.saveNPC('${id||''}')`); }
  function saveNPC(id){ const name=val('mName').trim(); if(!name)return toast('Name required','warn');
    const rec={ id:id||uid('npc'), name, type:val('mType'), role:val('mRole'), symbol:val('mSymbol')||name[0].toUpperCase(), color:val('mColor'), behavior:val('mBehavior'), stats:collectStats(), difficultyStats:collectDiffStats(), currencyDrop:collectCurrencyBag('mDrop'), dropTableIds:collectNpcDropTableIds(), bonusDrops:collectDropEntries('mBonus') };
    if(id){ const i=state.npcs.findIndex(x=>x.id===id); state.npcs[i]=rec; } else state.npcs.push(rec);
    save({flush:true}); closeModal(); renderNPCs(); if(state.meta.activeTab==='difficulties')renderDifficulties(); toast('NPC saved','ok'); }
  function deleteNPC(id){
    const n=(state.npcs||[]).find(x=>x.id===id); const label=n?n.name:id;
    confirmModal('Delete NPC',
      'Really delete <code class="text-indigo-300">'+esc(label)+'</code>? It will be removed from all level grids.',
      "RGD.confirmDeleteNPC('"+id+"')");
  }
  function confirmDeleteNPC(id){
    closeModal();
    state.npcs=state.npcs.filter(n=>n.id!==id); stripEntity('npc',id); save({flush:true}); renderNPCs(); toast('NPC deleted','ok');
  }

  function openItemModal(id){ const it=state.items.find(x=>x.id===id)||{name:'',category:'Health',symbol:'i',color:'#22c55e',desc:'',stats:{},currencyReward:{},price:{currencyId:'gold',amount:0}};
    const cur=dropCategory(it); ensureCurrencies(); ensureDropTables();
    const links=id?linksForItem(id):{tables:[],npcs:[]};
    const linkBlock=id?`<div class="mt-3 p-3 rounded-xl border border-indigo-700/40 bg-indigo-950/20 space-y-2">
      <div class="text-[11px] text-indigo-300 font-semibold">Linked from enemies / tables</div>
      <div class="text-[11px] text-gray-400">Tables: ${links.tables.length?links.tables.map(t=>esc(t.name)).join(', '):'—'}</div>
      <div class="text-[11px] text-gray-400">Enemies: ${links.npcs.length?links.npcs.map(n=>esc(n.name)).join(', '):'—'}</div>
      <div class="flex flex-wrap gap-2 items-end">
        <label class="flex-1 min-w-[140px]"><span class="text-[10px] text-gray-500">Add to enemy bonus</span>
          <select id="mLinkNpc" class="${IN}"><option value="">— pick NPC —</option>${(state.npcs||[]).filter(n=>npcType(n)!=='Friendly').map(n=>`<option value="${esc(n.id)}">${esc(n.name)}</option>`).join('')}</select></label>
        <label class="flex-1 min-w-[140px]"><span class="text-[10px] text-gray-500">Or shared table</span>
          <select id="mLinkTable" class="${IN}"><option value="">— pick table —</option>${(state.dropTables||[]).map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>
        <button type="button" onclick="RGD.linkItemToLoot('${id}')" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs">Link drop</button>
      </div>
      ${links.npcs.length?`<div class="flex flex-wrap gap-1">${links.npcs.map(n=>`<button type="button" onclick="RGD.unlinkItemFromNpc('${id}','${n.id}')" class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 hover:text-red-300" title="Remove from this enemy">✕ ${esc(n.name)}</button>`).join('')}</div>`:''}
    </div>`:'<div class="text-[11px] text-gray-500">Save this drop first, then you can link it to enemies/tables.</div>';
    modalShell(id?'Edit Drop':'Add Drop',`<div class="grid grid-cols-2 gap-3">${field('Name',`<input id="mName" value="${esc(it.name)}" class="${IN}">`)}${field('Category',`<select id="mCat" class="${IN}">${DROP_CATEGORIES.map(t=>`<option ${cur===t?'selected':''}>${t}</option>`).join('')}</select>`)}${field('Symbol (1 char)',`<input id="mSymbol" maxlength="1" value="${esc(it.symbol||'')}" class="${IN} text-center">`)}${field('Color',`<input id="mColor" type="color" value="${it.color}" class="w-full h-9 bg-gray-900 border border-gray-700 rounded-lg">`)}</div>${field('Description',`<textarea id="mDesc" rows="2" class="${IN}">${esc(it.desc||'')}</textarea>`)}<div><div class="text-[11px] text-gray-400 mb-2">Stat Modifiers (applied on pickup)</div><div class="space-y-2" id="mStats">${statFieldsHtml(it,true)}</div></div><div class="mt-3"><div class="text-[11px] text-gray-400 mb-2">Currency reward (granted on pickup)</div>${currencyAmountFields(it.currencyReward||{},'mRew')}</div><div class="mt-3"><div class="text-[11px] text-gray-400 mb-2">Shop price (0 = not sold)</div>${priceFieldsHtml(it.price,'mPrice')}</div>${linkBlock}`,`RGD.saveItem('${id||''}')`); }
  function linkItemToLoot(itemId){
    const npcId=val('mLinkNpc'); const tableId=val('mLinkTable');
    if(!npcId&&!tableId) return toast('Pick an enemy or table','warn');
    const entry={itemId,chance:100,weight:1,qtyMin:1,qtyMax:1,guaranteed:false};
    if(tableId){
      const t=dropTableById(tableId); if(!t) return toast('Table missing','err');
      t.entries=normalizeDropEntries(t.entries||[]);
      if(!t.entries.some(e=>e.itemId===itemId)) t.entries.push(entry);
    }
    if(npcId){
      const n=(state.npcs||[]).find(x=>x.id===npcId); if(!n) return toast('NPC missing','err');
      n.bonusDrops=normalizeDropEntries(n.bonusDrops||[]);
      if(!n.bonusDrops.some(e=>e.itemId===itemId)) n.bonusDrops.push(entry);
    }
    save({flush:true}); toast('Linked','ok'); openItemModal(itemId);
  }
  function unlinkItemFromNpc(itemId, npcId){
    const n=(state.npcs||[]).find(x=>x.id===npcId); if(!n) return;
    n.bonusDrops=normalizeDropEntries(n.bonusDrops||[]).filter(e=>e.itemId!==itemId);
    // Also detach shared tables that only exist to carry this item? No — only strip bonus + remove entry from attached tables if user wants. Strip from attached tables' entries when unlinking from npc context: remove from bonus only.
    save({flush:true}); toast('Removed from '+n.name,'ok'); openItemModal(itemId);
  }
  function saveItem(id){ const name=val('mName').trim(); if(!name)return toast('Name required','warn');
    const rec={ id:id||uid('item'), name, category:val('mCat'), symbol:val('mSymbol')||name[0].toLowerCase(), color:val('mColor'), desc:val('mDesc'), stats:collectStats(), currencyReward:collectCurrencyBag('mRew'), price:collectPrice('mPrice') };
    if(id){ const i=state.items.findIndex(x=>x.id===id); state.items[i]=rec; } else state.items.push(rec);
    save({flush:true}); closeModal(); renderItems(); toast('Drop saved','ok'); }
  function deleteItem(id){
    const it=(state.items||[]).find(x=>x.id===id); const label=it?it.name:id;
    confirmModal('Delete Drop',
      'Really delete <code class="text-indigo-300">'+esc(label)+'</code>? It will be removed from level grids, drop tables, and NPC bonus drops.',
      "RGD.confirmDeleteItem('"+id+"')");
  }
  function confirmDeleteItem(id){
    closeModal();
    state.items=state.items.filter(i=>i.id!==id); stripEntity('item',id); (state.dropTables||[]).forEach(t=>{ t.entries=normalizeDropEntries(t.entries||[]).filter(e=>e.itemId!==id); }); (state.npcs||[]).forEach(n=>{ n.bonusDrops=normalizeDropEntries(n.bonusDrops||[]).filter(e=>e.itemId!==id); }); save({flush:true}); renderItems(); toast('Drop deleted','ok');
  }
  function stripEntity(kind,id){ state.levels.forEach(l=>{ iterPainted(l).forEach(([x,y,c])=>{ if(c.entity&&c.entity.kind===kind&&c.entity.id===id){ c=Object.assign({},c,{entity:null}); setCell(l,x,y,c); } }); }); }

  /* ===== level ops ===== */
  function newLevel(){
    const w=16,h=12;
    if(typeof ensureJourneys==='function') ensureJourneys();
    const defaultJid=(state.journeys&&state.journeys[0]&&state.journeys[0].id)||'';
    const lvl=normalizeLevelLocal({
      id:uid('lvl'), name:'Level '+(state.levels.length+1), theme:'#6366f1', threat:'Medium', w, h,
      grid:{_sparse:true,cells:{}},
      overlay:{file:'',opacity:0.55,enabled:false,stretch:true},
      journeyId:defaultJid,
      journey:defaultJourney(),
      include:defaultInclude(),
      layers:defaultLayers(),
    });
    state.levels.push(lvl); state.meta.activeLevelId=lvl.id; state.meta.levelsSubtab='gen';
    save({flush:true});
    if(state.meta.activeTab!=='levels') go('levels','gen'); else renderLevels();
    toast(defaultJid?'Level created — pick/edit Journeys, then Generate':'Level created — open Journeys tab to author one','ok');
  }
  function selectLevel(id){ state.meta.activeLevelId=id||null; view.fitted=false; save(); renderLevels(); }
  function updateLevelField(k,v){ const l=activeLevel(); if(!l)return; l[k]=v; save(); renderLevels(); }
  async function saveLevel(){
    toast('Saving…','info');
    try{
      const r=await flushSave();
      if(!r||!r.ok) return toast('Save FAILED: '+((r&&r.error)||'unknown'),'err');
      const l=activeLevel();
      const n=(l&&l.layout)?l.layout.length:0;
      toast(n?('Generation saved · '+n+' chunks'):'Level saved','ok');
    }catch(e){ toast('Save FAILED: '+e,'err'); }
  }
  function deleteLevel(id){
    const l=(state.levels||[]).find(x=>x.id===id); const label=l?l.name:id;
    confirmModal('Delete Level',
      'Really delete level <code class="text-indigo-300">'+esc(label)+'</code>? This cannot be undone from the trash button.',
      "RGD.confirmDeleteLevel('"+id+"')");
  }
  function confirmDeleteLevel(id){
    closeModal();
    state.levels=state.levels.filter(l=>l.id!==id); if(state.meta.activeLevelId===id)state.meta.activeLevelId=(state.levels[0]&&state.levels[0].id)||null; save({flush:true}); renderLevels(); refreshStatus(); toast('Level deleted','ok');
  }
  function ensureLevelOverlay(l){
    if(!l.overlay) l.overlay={file:'',opacity:0.55,enabled:false,stretch:true};
    return l.overlay;
  }
  function setOverlayField(k,v){
    const l=activeLevel(); if(!l)return;
    const ov=ensureLevelOverlay(l);
    ov[k]=v;
    save(); renderLevels();
  }
  function setOverlayOpacity(pct){
    const l=activeLevel(); if(!l)return;
    const ov=ensureLevelOverlay(l);
    const op=Math.max(0.05,Math.min(1,(Number(pct)||55)/100));
    ov.opacity=op;
    const lab=document.getElementById('ovOpacityLabel'); if(lab) lab.textContent=Math.round(op*100)+'%';
    const img=document.getElementById('mapOverlayImg'); if(img) img.style.opacity=String(op);
    save();
  }
  function clearOverlay(){
    const l=activeLevel(); if(!l)return;
    if(l.overlay&&l.overlay.file) delete _overlayDiskCache[l.id+'::'+l.overlay.file];
    l.overlay={file:'',opacity:0.55,enabled:false,stretch:true};
    _overlayCache={id:null,file:'',dataUrl:''};
    save({flush:true});
    renderLevels(); toast('Overlay cleared','ok');
  }
  function downscaleDataUrl(dataUrl, maxEdge){
    return new Promise(function(resolve){
      try{
        const img=new Image();
        img.onload=function(){
          const w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
          const edge=Math.max(w,h);
          if(!edge || edge<=maxEdge){ resolve(dataUrl); return; }
          const scale=maxEdge/edge;
          const cw=Math.max(1,Math.round(w*scale)), ch=Math.max(1,Math.round(h*scale));
          const c=document.createElement('canvas'); c.width=cw; c.height=ch;
          const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,cw,ch);
          resolve(c.toDataURL('image/jpeg',0.88));
        };
        img.onerror=function(){ resolve(dataUrl); };
        img.src=dataUrl;
      }catch(_){ resolve(dataUrl); }
    });
  }
  function onOverlayFile(input){
    const l=activeLevel(); if(!l||!input||!input.files||!input.files[0])return;
    const f=input.files[0];
    const reader=new FileReader();
    reader.onload=async ()=>{
      let dataUrl=String(reader.result||'');
      if(!dataUrl){ toast('Failed to read image','err'); return; }
      // Shrink huge maps before bridge RPC so save does not time out.
      dataUrl=await downscaleDataUrl(dataUrl, 4096);
      const ov=ensureLevelOverlay(l);
      ov.enabled=true;
      ov._dataUrl=dataUrl;
      ov.source_name=f.name||ov.source_name||'';
      _overlayCache={id:l.id,file:ov.file||f.name,dataUrl};
      let persisted=false;
      try{
        if(_hydrated){
          // Ensure the level exists in the backend store before writing the image file.
          await flushSave();
          const r=await rgdRpc('save_overlay_image',{
            level_id:l.id, data_url:dataUrl, file_name:f.name||'',
            opacity:ov.opacity||0.55, enabled:true, stretch:ov.stretch!==false
          },90000);
          if(r&&r.ok&&r.overlay){
            Object.assign(ov, r.overlay);
            // Keep preview so tab switches never blank the map while disk preview loads.
            ov._dataUrl=dataUrl;
            if(ov.file) _overlayDiskCache[l.id+'::'+ov.file]=dataUrl;
            _overlayCache={id:l.id,file:ov.file,dataUrl};
            persisted=true;
            toast('Overlay saved','ok');
          } else {
            toast('Overlay preview only — save failed: '+((r&&r.error)||'unknown'),'warn');
          }
        }
      }catch(e){ toast('Overlay preview only — '+e,'warn'); }
      if(!persisted){
        ov.file=f.name||('overlay_'+l.id+'.png');
        ov._dataUrl=dataUrl;
        _overlayDiskCache[l.id+'::'+ov.file]=dataUrl;
      }
      await flushSave();
      renderLevels();
      try{ input.value=''; }catch(_){}
    };
    reader.onerror=()=>toast('Failed to read image','err');
    reader.readAsDataURL(f);
  }
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  /* ===== ACT ===== */
  async function spawnEntity(kind,id){ const lvl=activeLevel();
    const tool=kind==='npc'?'spawn_npc_in_uefn':'spawn_item_in_uefn';
    const args=kind==='npc'?{npc_id:id,level_id:lvl?lvl.id:null,x:lvl?Math.floor(lvl.w/2):0,y:lvl?Math.floor(lvl.h/2):0}:{item_id:id,level_id:lvl?lvl.id:null,x:lvl?Math.floor(lvl.w/2):0,y:lvl?Math.floor(lvl.h/2):0};
    const res=await bridge.call(tool,args);
    if(res&&res.error)return toast('Spawn failed: '+res.error,'err'); if(res&&res.skipped)return toast('Already spawned','warn');
    toast('Spawned '+((res&&res.label)||id)+' → '+((res&&res.folder)||''),'ok'); refreshStatus(); if(state.meta.activeTab==='mcp')renderMCP(); }
  async function buildLevel(id){ const lvl=state.levels.find(l=>l.id===id); if(!lvl)return; toast('Building '+lvl.name+' in UEFN…','info');
    const res=await bridge.call('build_level_in_uefn',{level_id:id});
    if(res&&res.error)return toast('Build failed: '+res.error,'err');
    toast(`${lvl.name}: ${res.walls||0} walls, ${res.doors||0} doors, ${res.entities||0} entities`,'ok');
    if(res.warnings&&res.warnings.length)toast(res.warnings.length+' warning(s)','warn'); refreshStatus(); renderDashboard(); if(state.meta.activeTab==='mcp')renderMCP(); }
  async function syncFromUEFN(){ const res=await bridge.call('sync_from_uefn',{level_id:state.meta.activeLevelId});
    if(res&&res.error)return toast('Sync failed: '+res.error,'err'); toast('Pulled '+((res&&res.pulled)||0)+' actors from UEFN','ok'); refreshStatus(); renderMCP(); }
  async function pushEverything(){
    // Removed from UI — design store autosaves; use Level Gen → Build / spawn tools when you want actors.
    toast('No manual push — store autosaves. Use Build on a level when you want UEFN actors.','info');
  }

  function val(id){ const el=document.getElementById(id); return el?el.value:''; }

  /* ===== Chunks tab — catalogue + 2D socket/roof/slot viewer ===== */
  let _chunkSel = null;
  let _chunkRotPreview = 0;
  let _chunkPaint = null; // terrain brush for footprint override (incl. empty notches)
  let _chunkPlace = null; // 'slotA' | 'slotB' | 'prop' | null
  let _chunkPropId = null; // selected chunkAssets id when placing props
  let _chunkViewMode = '2d'; // '2d' | '3d' — tab toggle, not side-by-side

  function chunksList(){ return state.chunks || (state.chunks=[]); }
  function chunkSolidCount(c){
    const g=c&&c.grid||[];
    let n=0;
    for(let y=0;y<g.length;y++) for(let x=0;x<(g[y]||[]).length;x++){
      const t=g[y][x]; if(t&&t!=='empty') n++;
    }
    return n||((c.cw||0)*(c.ch||0));
  }
  function selectedChunk(){
    const list=chunksList();
    if(!_chunkSel || !list.find(c=>c.id===_chunkSel)) _chunkSel = list[0]&&list[0].id;
    return list.find(c=>c.id===_chunkSel)||null;
  }

  const ROLE_COLORS = {
    entrance:'#22c55e', exit:'#ef4444', objective:'#f59e0b', room:'#6366f1',
    connector:'#94a3b8', deadend:'#78716c', cap:'#a8a29e', filler:'#44403c', boss:'#e11d48',
  };

  function sockSummary(c){
    const s=c.sockets||{};
    return ['N','E','S','W'].map(d=>{
      const arr=s[d]||[];
      return d+':'+arr.map(e=>{
        const k=((e.kind||'wall')[0]||'?').toUpperCase();
        const z=+(e.height_step!=null?e.height_step:e.z)||0;
        return z?k+'@'+z:k;
      }).join('');
    }).join(' ');
  }

  function rotateGridJs(grid, rot){
    rot=((rot%360)+360)%360;
    if(!grid||!grid.length||rot===0) return grid.map(r=>r.slice());
    const h=grid.length, w=grid[0].length;
    if(rot===90){
      const out=[]; for(let y=0;y<w;y++){ const row=[]; for(let x=0;x<h;x++) row.push(grid[h-1-x][y]); out.push(row);} return out;
    }
    if(rot===180) return grid.slice().reverse().map(r=>r.slice().reverse());
    if(rot===270){
      const out=[]; for(let y=0;y<w;y++){ const row=[]; for(let x=0;x<h;x++) row.push(grid[x][w-1-y]); out.push(row);} return out;
    }
    return grid.map(r=>r.slice());
  }

  function chunksHostEl(){
    return document.getElementById('levelsSubHost') || document.getElementById('tab-chunks');
  }
  function renderChunks(){
    if(typeof disposeChunkViewer==='function') disposeChunkViewer();
    const list=chunksList();
    const c=selectedChunk();
    const host=chunksHostEl();
    if(!host) return;
    const items=list.map(ch=>`
      <button onclick="RGD.selectChunk('${ch.id}')" class="w-full text-left px-3 py-2 rounded-lg border mb-1.5 ${ch.id===_chunkSel?'border-indigo-500 bg-indigo-600/20':'border-gray-700 bg-gray-800 hover:bg-gray-750'}">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-white font-medium truncate">${esc(ch.name||ch.id)}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded" style="background:${ROLE_COLORS[ch.role]||'#555'}33;color:${ROLE_COLORS[ch.role]||'#aaa'}">${esc(ch.role||'?')}</span>
        </div>
        <div class="text-[11px] text-gray-500 mt-0.5">${ch.cw}×${ch.ch}×${ch.cz||1} · ${chunkSolidCount(ch)} cells${ch.shape?' · '+esc(ch.shape):''} · ${ch.space||'inside'}${ch.roof?' · roof':''}</div>
      </button>`).join('')||`<div class="text-xs text-gray-500 p-3">No chunks yet.</div>`;

    host.innerHTML=`
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <button onclick="RGD.importChunkFromUeFn()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-1.5"><i data-lucide="download" class="w-4 h-4"></i> Import from UEFN selection</button>
        <button onclick="RGD.newChunk()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-1.5"><i data-lucide="plus" class="w-4 h-4"></i> New Chunk</button>
        <div class="flex-1"></div>
        <span class="text-xs text-gray-500">${list.length} chunks</span>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4" style="min-height:420px">
        <div class="lg:col-span-1 bg-gray-800/50 border border-gray-700 rounded-xl p-3 overflow-y-auto max-h-[70vh]">${items}</div>
        <div class="lg:col-span-2 bg-gray-800 border border-gray-700 rounded-xl p-4">
          ${c?chunkDetailHtml(c):`<div class="py-16 text-center text-gray-500 text-sm">Select a chunk</div>`}
        </div>
      </div>`;
    if(c){
      if(_chunkViewMode==='3d'){
        requestAnimationFrame(()=>{ if(typeof mountChunkViewer==='function') mountChunkViewer(c, _chunkRotPreview); });
      } else {
        drawChunkPreview(c, _chunkRotPreview);
      }
    }
  }

  function chunkAssetsList(){ return state.chunkAssets || (state.chunkAssets=[]); }
  function chunkDetailHtml(c){
    const roles=['entrance','exit','objective','room','connector','deadend','cap','filler','boss'];
    const assets=chunkAssetsList();
    if(!_chunkPropId && assets[0]) _chunkPropId=assets[0].id;
    const propOpts=assets.map(a=>`<option value="${esc(a.id)}" ${a.id===_chunkPropId?'selected':''}>${esc(a.name||a.id)} · ${esc(a.kind||'prop')}</option>`).join('');
    const propCount=(c.props||[]).length;
    return `
      <div class="flex flex-wrap items-start gap-3 mb-3">
        <div class="flex-1 min-w-[200px]">
          <div class="text-lg font-semibold text-white">${esc(c.name)}</div>
          <div class="text-[11px] text-gray-500 font-mono">${esc(c.id)} · ${sockSummary(c)}</div>
        </div>
        <button onclick="RGD.chunkRotPrev()" class="px-2 py-1.5 rounded-lg bg-gray-700 text-xs">⟲ ${_chunkRotPreview}°</button>
        <button onclick="RGD.chunkRotNext()" class="px-2 py-1.5 rounded-lg bg-gray-700 text-xs">⟳</button>
        <button onclick="RGD.deleteChunk('${c.id}')" class="px-2 py-1.5 rounded-lg bg-gray-700 hover:bg-red-600 text-xs"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
        <label class="text-gray-400">Name<input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${esc(c.name||'')}" onchange="RGD.updateChunkField('name',this.value)"/></label>
        <label class="text-gray-400">Role<select class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" onchange="RGD.updateChunkField('role',this.value)">${roles.map(r=>`<option value="${r}" ${c.role===r?'selected':''}>${r}</option>`).join('')}</select></label>
        <label class="text-gray-400">Space<select class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" onchange="RGD.updateChunkField('space',this.value)"><option value="inside" ${c.space==='inside'?'selected':''}>inside</option><option value="outside" ${c.space==='outside'?'selected':''}>outside</option></select></label>
        <label class="text-gray-400">Weight<input type="number" step="0.1" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${c.weight||1}" onchange="RGD.updateChunkField('weight',+this.value)"/></label>
        <label class="text-gray-400">W (cells)<input type="number" min="1" max="32" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${c.cw||1}" onchange="RGD.updateChunkField('cw',+this.value)"/></label>
        <label class="text-gray-400">D (cells)<input type="number" min="1" max="32" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${c.ch||1}" onchange="RGD.updateChunkField('ch',+this.value)"/></label>
        <label class="text-gray-400">H stories<input type="number" min="1" max="16" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${c.cz||1}" onchange="RGD.updateChunkField('cz',+this.value)" title="Cell height / stories (2×2×4 → H=4)"/></label>
        <label class="text-gray-400 text-[10px] text-gray-500 flex items-end pb-1">Size ${c.cw||1}×${c.ch||1}×${c.cz||1} · ledge@z matches height_step</label>
        <label class="text-gray-400 col-span-2">Tags (comma)<input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${esc((c.tags||[]).join(', '))}" onchange="RGD.updateChunkField('tags',this.value.split(',').map(s=>s.trim()).filter(Boolean))"/></label>
        <label class="text-gray-400 col-span-2">Content prefab
          <input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white font-mono text-[11px]" value="${esc(c.contentPath||(typeof contentPathLabel==='function'?contentPathLabel(c.prefabPath):c.prefabPath)||'')}" onchange="RGD.updateChunkField('prefabPath', (typeof toUeContentPath==='function'?toUeContentPath(this.value):this.value))" placeholder="Content/Prefabs/Chunks/EP_…"/>
          <div class="text-[10px] text-gray-500 mt-1">UEFN mount: <span class="font-mono text-gray-400">${esc(c.prefabPath||'—')}</span> · under project Content/ only (not Saved/ or .ducky)</div>
        </label>
        <label class="flex items-center gap-2 text-gray-300 col-span-2 mt-1"><input type="checkbox" ${c.roof?'checked':''} onchange="RGD.updateChunkField('roof',this.checked)"/> Roofed (indoor)</label>
        <label class="flex items-center gap-2 text-gray-300 col-span-2 mt-1"><input type="checkbox" ${c.gridAuto!==false?'checked':''} onchange="RGD.updateChunkField('gridAuto',this.checked)"/> Auto-derive footprint from sockets</label>
      </div>
      <div class="flex flex-wrap items-center gap-2 mb-2 text-xs">
        <span class="text-gray-400">Paint footprint:</span>
        ${['floor','wall','door','empty'].map(t=>`<button onclick="RGD.chunkPickPaint('${t}')" class="px-2 py-1 rounded border ${_chunkPaint===t&&!_chunkPlace?'border-indigo-500 bg-indigo-600/30':'border-gray-700 bg-gray-800'}">${t==='empty'?'empty (notch)':t}</button>`).join('')}
        <button onclick="RGD.chunkPickPaint(null)" class="px-2 py-1 rounded border border-gray-700 bg-gray-800">off</button>
        <span class="text-gray-500 ml-2">Presets:</span>
        ${[['L','L'],['J','J'],['T','T'],['S','S'],['Z','Z'],['I','I'],['O','O'],['U','U']].map(([k,lab])=>`
          <button onclick="RGD.applyChunkShapePreset('${k}')" class="px-2 py-1 rounded border border-violet-700/60 bg-violet-900/30 hover:bg-violet-700/40">${lab}</button>`).join('')}
      </div>
      <div class="flex flex-wrap items-center gap-2 mb-2 text-xs border-t border-gray-700/60 pt-2">
        <span class="text-gray-400">Place on grid:</span>
        <button onclick="RGD.chunkPickPlace('slotA')" class="px-2 py-1 rounded border ${_chunkPlace==='slotA'?'border-emerald-500 bg-emerald-600/30':'border-gray-700 bg-gray-800'}">Slot A (player)</button>
        <button onclick="RGD.chunkPickPlace('slotB')" class="px-2 py-1 rounded border ${_chunkPlace==='slotB'?'border-pink-500 bg-pink-600/30':'border-gray-700 bg-gray-800'}">Slot B (enemy)</button>
        <button onclick="RGD.chunkPickPlace('prop')" class="px-2 py-1 rounded border ${_chunkPlace==='prop'?'border-amber-500 bg-amber-600/30':'border-gray-700 bg-gray-800'}">Prop / column</button>
        <button onclick="RGD.chunkPickPlace(null)" class="px-2 py-1 rounded border border-gray-700 bg-gray-800">off</button>
        <select class="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white max-w-[220px]" onchange="RGD.chunkSetPropAsset(this.value)" ${_chunkPlace==='prop'?'':'disabled'}>
          ${propOpts||'<option value="">No assets — add below</option>'}
        </select>
        <span class="text-gray-500">${propCount} props on this chunk</span>
      </div>
      <div class="flex items-center gap-1 mb-2">
        <button onclick="RGD.setChunkViewMode('2d')" class="px-3 py-1.5 rounded-lg text-xs ${_chunkViewMode==='2d'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">2D edit</button>
        <button onclick="RGD.setChunkViewMode('3d')" class="px-3 py-1.5 rounded-lg text-xs ${_chunkViewMode==='3d'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">3D orbit</button>
        <span class="text-[10px] text-gray-500 ml-2">${_chunkViewMode==='2d'?'Click to paint / place props':'Drag to rotate · scroll to zoom · ⟲⟳ footprint yaw'}</span>
      </div>
      <div id="chunkView2dWrap" class="${_chunkViewMode==='2d'?'':'hidden'}">
        <canvas id="chunkPreview" width="480" height="360" class="w-full rounded-lg border border-gray-700 bg-[#0b0f19]" style="height:380px;max-height:380px"></canvas>
      </div>
      <div id="chunkView3dWrap" class="${_chunkViewMode==='3d'?'':'hidden'}">
        <div id="rgdChunkView3d" class="w-full rounded-lg border border-gray-700 overflow-hidden bg-[#0b1220]" style="height:380px;cursor:grab"></div>
      </div>
      <div class="text-[11px] text-gray-500 mt-2">${chunkSolidCount(c)} solid cells · ${(c.ports||[]).filter(p=>p.kind==='door'||p.kind==='open').length} open ports · ${propCount} props.
        ${_chunkViewMode==='2d'?'Paint/place here, then switch to 3D to orbit.':'Props from Assets show as columns/arches/etc. UEFN:'} <code class="text-gray-400">Socket_N0_Door</code>, <code class="text-gray-400">Slot_A</code>.</div>
      <div class="mt-3 rounded-lg border border-gray-700 bg-gray-900/50 p-3 space-y-2">
        <div class="text-[11px] uppercase tracking-wide text-gray-500">Chunk assets catalogue</div>
        <div class="text-[11px] text-gray-400">Columns / meshes from <code class="text-gray-500">Content/</code>. Pick one above, then click cells.</div>
        <div class="max-h-28 overflow-y-auto text-[11px] font-mono text-gray-400 space-y-0.5">
          ${assets.map(a=>`<div><span class="text-amber-400/90">${esc(a.kind||'prop')}</span> ${esc(a.name)} <span class="text-gray-600">${esc(a.contentPath||(typeof contentPathLabel==='function'?contentPathLabel(a.assetPath):a.assetPath)||'')}</span></div>`).join('')||'<div class="text-gray-600">Empty</div>'}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <input id="chkAssetName" class="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" placeholder="Name (Egypt Column)"/>
          <input id="chkAssetPath" class="md:col-span-2 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white font-mono" placeholder="Content/Meshes/SM_…"/>
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="RGD.addChunkAsset()" class="px-2 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white">Add asset to catalogue</button>
          <button onclick="RGD.go('assets')" class="px-2 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-xs text-white">Open Assets tab →</button>
        </div>
      </div>`;
  }

  function setChunkViewMode(mode){
    _chunkViewMode=(mode==='3d')?'3d':'2d';
    const c=selectedChunk();
    renderChunks();
    if(_chunkViewMode==='3d' && c && typeof mountChunkViewer==='function'){
      requestAnimationFrame(()=>mountChunkViewer(c, _chunkRotPreview));
    }
  }

  function drawChunkPreview(c, rot){
    if(_chunkViewMode==='3d' && typeof refreshChunkThree==='function'){
      refreshChunkThree(c, rot);
      return;
    }
    const canvas=document.getElementById('chunkPreview'); if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    const cssW=canvas.clientWidth||480, cssH=360;
    canvas.width=cssW*dpr; canvas.height=cssH*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#0b0f19'; ctx.fillRect(0,0,cssW,cssH);
    const g=rotateGridJs(c.grid||[], rot);
    const ch=g.length, cw=(g[0]||[]).length;
    if(!cw||!ch) return;
    const pad=24;
    const cell=Math.min((cssW-pad*2)/cw, (cssH-pad*2)/ch);
    const ox=(cssW-cw*cell)/2, oy=(cssH-ch*cell)/2;
    const terrColor={floor:'#1e293b', wall:'#475569', door:'#fbbf24', empty:'#0f172a'};
    for(let y=0;y<ch;y++) for(let x=0;x<cw;x++){
      const t=g[y][x]||'empty';
      ctx.fillStyle=terrColor[t]||'#333';
      ctx.fillRect(ox+x*cell, oy+y*cell, cell-1, cell-1);
    }
    // Roof hatch
    if(c.roof){
      ctx.strokeStyle='rgba(165,180,252,0.25)';
      ctx.lineWidth=1;
      for(let i=-ch;i<cw+ch;i++){
        ctx.beginPath();
        ctx.moveTo(ox+i*cell, oy);
        ctx.lineTo(ox+(i-ch)*cell, oy+ch*cell);
        ctx.stroke();
      }
    }
    // Open ports (in/out) after rotation
    const portFace={N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]};
    const faceRot=(f,r)=>{ const o=['N','E','S','W']; const i=o.indexOf(f); return o[(i+r/90)%4]; };
    (c.ports||[]).forEach(p=>{
      if(!(p.kind==='door'||p.kind==='open'||p.kind==='ledge'||p.kind==='window')) return;
      let lx=+p.x||0, ly=+p.y||0, face=p.face||'N';
      if(rot===90){ const t=lx; lx=ch-1-ly; ly=t; face=faceRot(face,90); }
      else if(rot===180){ lx=cw-1-lx; ly=ch-1-ly; face=faceRot(face,180); }
      else if(rot===270){ const t=lx; lx=ly; ly=cw-1-t; face=faceRot(face,270); }
      const [dx,dy]=portFace[face]||[0,-1];
      const cx=ox+(lx+0.5)*cell, cy=oy+(ly+0.5)*cell;
      const hz=+(p.height_step!=null?p.height_step:p.z)||0;
      const isLedge=p.kind==='ledge'||p.kind==='window';
      ctx.strokeStyle=isLedge?'#38bdf8':'#fbbf24';
      ctx.fillStyle=ctx.strokeStyle;
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx+dx*cell*0.45, cy+dy*cell*0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx+dx*cell*0.42, cy+dy*cell*0.42, Math.max(2,cell*0.12), 0, Math.PI*2);
      ctx.fill();
      if(hz){
        ctx.fillStyle='#e2e8f0';
        ctx.font=`bold ${Math.max(8,cell*0.22)}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.fillText('z'+hz, cx+dx*cell*0.42, cy+dy*cell*0.42-Math.max(3,cell*0.14));
      }
    });
    // Role outline (bbox)
    ctx.strokeStyle=ROLE_COLORS[c.role]||'#818cf8';
    ctx.lineWidth=2;
    ctx.strokeRect(ox-1, oy-1, cw*cell+1, ch*cell+1);
    // Slots
    (c.slots||[]).forEach(s=>{
      let lx=+s.x||0, ly=+s.y||0;
      if(rot===90){ const t=lx; lx=ch-1-ly; ly=t; }
      else if(rot===180){ lx=cw-1-lx; ly=ch-1-ly; }
      else if(rot===270){ const t=lx; lx=ly; ly=cw-1-t; }
      ctx.fillStyle=String(s.group||'').toUpperCase()==='A'?'#34d399':'#f472b6';
      ctx.beginPath();
      ctx.arc(ox+(lx+0.5)*cell, oy+(ly+0.5)*cell, Math.max(3,cell*0.22), 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle='#fff';
      ctx.font=`${Math.max(9,cell*0.35)}px sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(s.group||'?', ox+(lx+0.5)*cell, oy+(ly+0.5)*cell);
    });
    // Props (columns etc.)
    (c.props||[]).forEach(pr=>{
      let lx=+pr.x||0, ly=+pr.y||0;
      if(rot===90){ const t=lx; lx=ch-1-ly; ly=t; }
      else if(rot===180){ lx=cw-1-lx; ly=ch-1-ly; }
      else if(rot===270){ const t=lx; lx=ly; ly=cw-1-t; }
      const px=ox+(lx+0.5)*cell, py=oy+(ly+0.5)*cell;
      ctx.fillStyle='#f59e0b';
      ctx.fillRect(px-cell*0.18, py-cell*0.32, cell*0.36, cell*0.64);
      ctx.fillStyle='#0f172a';
      ctx.font=`bold ${Math.max(8,cell*0.28)}px sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('▮', px, py);
    });
    // Click-to-paint / place
    canvas.onmousedown=function(ev){
      if(!c) return;
      const rect=canvas.getBoundingClientRect();
      const mx=ev.clientX-rect.left, my=ev.clientY-rect.top;
      const x=Math.floor((mx-ox)/cell), y=Math.floor((my-oy)/cell);
      if(x<0||y<0||x>=c.cw||y>=c.ch) return;
      if(rot!==0){ toast('Reset rotation to 0° to edit','warn'); return; }
      if(_chunkPlace==='slotA'||_chunkPlace==='slotB'){
        const group=_chunkPlace==='slotA'?'A':'B';
        c.slots=Array.isArray(c.slots)?c.slots:[];
        const idx=c.slots.findIndex(s=>+s.x===x&&+s.y===y);
        if(idx>=0 && String(c.slots[idx].group).toUpperCase()===group) c.slots.splice(idx,1);
        else if(idx>=0) c.slots[idx]={group,x,y};
        else c.slots.push({group,x,y});
        save({flush:true});
        bridge.call('update_chunk',{id:c.id, slots:c.slots});
        drawChunkPreview(c, rot);
        return;
      }
      if(_chunkPlace==='prop'){
        if(!_chunkPropId){ toast('Pick a prop asset first','warn'); return; }
        c.props=Array.isArray(c.props)?c.props:[];
        const idx=c.props.findIndex(p=>+p.x===x&&+p.y===y);
        if(idx>=0 && c.props[idx].assetId===_chunkPropId) c.props.splice(idx,1);
        else if(idx>=0) c.props[idx]={x,y,assetId:_chunkPropId,yaw:0};
        else c.props.push({x,y,assetId:_chunkPropId,yaw:0});
        save({flush:true});
        bridge.call('update_chunk',{id:c.id, props:c.props});
        drawChunkPreview(c, rot);
        return;
      }
      if(!_chunkPaint) return;
      if(!Array.isArray(c.grid)) c.grid=[];
      while(c.grid.length<c.ch) c.grid.push([]);
      for(let yy=0;yy<c.ch;yy++){ c.grid[yy]=c.grid[yy]||[]; while(c.grid[yy].length<c.cw) c.grid[yy].push('floor'); }
      c.grid[y][x]=_chunkPaint;
      c.gridAuto=false;
      c.ports=rebuildPortsFromGrid(c);
      save(); drawChunkPreview(c, rot);
    };
  }

  function rebuildPortsFromGrid(c){
    const g=c.grid||[]; const ch=c.ch||g.length; const cw=c.cw||((g[0]||[]).length);
    const solid=(x,y)=>y>=0&&y<ch&&x>=0&&x<cw&&g[y]&&g[y][x]&&g[y][x]!=='empty';
    const oldOpen=new Set((c.ports||[]).filter(p=>p.kind==='door'||p.kind==='open').map(p=>p.x+','+p.y+','+p.face));
    const ports=[];
    const faces=[['N',0,-1],['E',1,0],['S',0,1],['W',-1,0]];
    for(let y=0;y<ch;y++) for(let x=0;x<cw;x++){
      if(!solid(x,y)) continue;
      faces.forEach(([face,dx,dy])=>{
        if(solid(x+dx,y+dy)) return;
        const key=x+','+y+','+face;
        let kind='wall';
        if(g[y][x]==='door'||oldOpen.has(key)) kind='door';
        ports.push({x,y,face,kind,size:1,height_step:0,z:0});
      });
    }
    return ports;
  }

  function applyChunkShapePreset(kind){
    const c=selectedChunk(); if(!c) return;
    const presets={
      L:['#..','#..','##.'],
      J:['..#','..#','.##'],
      T:['.#.','###'],
      S:['.##','##.'],
      Z:['##.','.##'],
      I:['####'],
      O:['##','##'],
      U:['#.#','#.#','###'],
    };
    const mask=presets[kind]; if(!mask) return;
    const ch=mask.length, cw=Math.max(...mask.map(r=>r.length));
    c.cw=cw; c.ch=ch; c.shape=kind; c.gridAuto=false;
    c.grid=mask.map(r=>{
      const row=[]; for(let x=0;x<cw;x++) row.push((r[x]==='#')?'floor':'empty'); return row;
    });
    // Default doors: first/last exposed ports on opposite-ish sides
    c.ports=[];
    c.ports=rebuildPortsFromGrid(c);
    const opens=c.ports.filter(p=>true);
    // Open N-most and S/E-most wall ports as doors so pieces can join
    const byFace={N:[],E:[],S:[],W:[]};
    opens.forEach(p=>byFace[p.face]&&byFace[p.face].push(p));
    ['N','S','E','W'].forEach(f=>{
      if(byFace[f][0]) byFace[f][0].kind='door';
      if(byFace[f].length>1) byFace[f][byFace[f].length-1].kind='door';
    });
    // Mark door cells for preview
    c.ports.forEach(p=>{ if(p.kind==='door'&&c.grid[p.y]) c.grid[p.y][p.x]='door'; });
    save({flush:true});
    bridge.call('update_chunk',{id:c.id, cw, ch, grid:c.grid, gridAuto:false, ports:c.ports, shape:kind, sockets:c.sockets});
    renderChunks();
    toast('Applied '+kind+' footprint — tweak doors with paint','ok');
  }

  function selectChunk(id){ _chunkSel=id; _chunkRotPreview=0; renderChunks(); }
  function chunkRotNext(){ _chunkRotPreview=(_chunkRotPreview+90)%360; renderChunks(); }
  function chunkRotPrev(){ _chunkRotPreview=(_chunkRotPreview+270)%360; renderChunks(); }
  function chunkPickPaint(t){ _chunkPaint=t; _chunkPlace=null; renderChunks(); }
  function chunkPickPlace(mode){ _chunkPlace=mode; if(mode) _chunkPaint=null; renderChunks(); }
  function chunkSetPropAsset(id){ _chunkPropId=id||null; _chunkPlace='prop'; _chunkPaint=null; }
  function addChunkAsset(){
    const name=(document.getElementById('chkAssetName')||{}).value||'';
    const path=(document.getElementById('chkAssetPath')||{}).value||'';
    if(!path.trim()){ toast('Asset path required (Content/… mesh)','warn'); return; }
    const id=('ast_'+Date.now().toString(36));
    const ue=(typeof toUeContentPath==='function'?toUeContentPath(path):path.trim());
    const kind=/column|pillar/i.test(path+name)?'column':(/wall/i.test(path+name)?'wall':(/floor|tile/i.test(path+name)?'floor':'prop'));
    const rec={id, name:name.trim()||id, assetPath:ue, contentPath:(typeof contentPathLabel==='function'?contentPathLabel(ue):path.trim()), kind, preview:kind==='prop'?'cube':kind, source:'catalogue'};
    chunkAssetsList().push(rec);
    _chunkPropId=id;
    _chunkPlace='prop';
    save({flush:true});
    bridge.call('upsert_chunk_asset',{id, name:rec.name, asset_path:ue, kind, preview:rec.preview});
    renderChunks();
    toast('Added '+rec.name+' — click cells to place (full list → Assets tab)','ok');
  }

  function updateChunkField(key, val){
    const c=selectedChunk(); if(!c) return;
    if(key==='prefabPath'){
      c.prefabPath=(typeof toUeContentPath==='function'?toUeContentPath(val):val)||'';
      c.contentPath=(typeof contentPathLabel==='function'?contentPathLabel(c.prefabPath):'')||'';
      bridge.call('update_chunk',{id:c.id, prefabPath:c.prefabPath});
    } else if(key==='cw'||key==='ch'||key==='cz'){
      const n=Math.max(1, Math.min(key==='cz'?16:32, Math.round(+val)||1));
      c[key]=n;
      const patch={id:c.id, [key]:n};
      if((key==='cw'||key==='ch') && c.gridAuto!==false) patch.gridAuto=true;
      bridge.call('update_chunk', patch);
    } else {
      c[key]=val;
      if(key!=='gridAuto') bridge.call('update_chunk',{id:c.id, [key]:val});
    }
    if(key==='space' && val==='outside') c.roof=false;
    if(key==='gridAuto' && val){
      // ask backend to re-normalize via update
      bridge.call('update_chunk',{id:c.id, gridAuto:true, sockets:c.sockets}).then(r=>{
        if(r&&r.ok){ hydrateChunkFromState(); renderChunks(); }
      });
    }
    save(); renderChunks();
  }

  function hydrateChunkFromState(){ /* state already live */ }

  async function importChunkFromUeFn(){
    const name=prompt('Chunk name (optional):','')||'';
    toast('Importing from UEFN selection…','info');
    const r=await bridge.call('import_chunk_from_selection',{name, role:'room', space:'inside', tags:['ruins']});
    if(r&&r.error){ toast(r.error,'err'); return; }
    if(r&&r.chunk){
      const existing=chunksList().find(c=>c.id===r.id);
      if(existing) Object.assign(existing, r.chunk);
      else chunksList().push(r.chunk);
      _chunkSel=r.id;
      save({flush:true});
      toast('Imported '+r.id+' ('+(r.markers&&r.markers.sockets||0)+' sockets)','ok');
      renderChunks();
    } else toast('Import returned nothing — is the listener online?','warn');
  }

  function newChunk(){
    const id='chk_'+Date.now().toString(36);
    const rec={
      id, name:'New Chunk', cw:2, ch:2, cz:1, role:'room', space:'inside', roof:true,
      sockets:{N:[{kind:'door'},{kind:'door'}],E:[{kind:'wall'},{kind:'wall'}],S:[{kind:'door'},{kind:'door'}],W:[{kind:'wall'},{kind:'wall'}]},
      rotations:[0,90,180,270], mirror:false, weight:1, tags:['ruins'], slots:[],
      grid:[['door','door'],['door','door']], gridAuto:true, prefabPath:'',
    };
    chunksList().push(rec);
    _chunkSel=id;
    save({flush:true});
    bridge.call('create_chunk',{id, name:rec.name, cw:2, ch:2, cz:1, role:'room', sockets:{N:['door','door'],E:['wall','wall'],S:['door','door'],W:['wall','wall']}});
    renderChunks();
  }

  async function deleteChunk(id){
    if(!confirm('Delete chunk '+id+'?')) return;
    state.chunks=chunksList().filter(c=>c.id!==id);
    await bridge.call('delete_chunk',{id});
    save({flush:true});
    renderChunks();
    toast('Deleted','ok');
  }

  /* ===== Procedural Gen tab — generate / demo / troubleshoot ===== */
  let _pg = {
    templateId: null,
    seed: 1337,
    lastResult: null,
    demoIdx: 0,
    demoTimer: null,
    demoPlaying: false,
    demoSpeed: 120,
    stageIdx: 0,
    viewMode: '2d', // '2d' | '3d' — same orbit viewer as Chunks/Assets
    linear: 0, // legacy slider mirror
    layoutStyle: 'linear', // linear | branched | open
    troubleshootOpen: true,
  };

  function templatesList(){ return state.genTemplates || (state.genTemplates=[]); }
  function activeTemplate(){
    const list=templatesList();
    if(!_pg.templateId || !list.find(t=>t.id===_pg.templateId)) _pg.templateId=list[0]&&list[0].id;
    return list.find(t=>t.id===_pg.templateId)||null;
  }

  const PG_ROLE_FILL = {
    entrance:'rgba(34,197,94,0.45)', exit:'rgba(239,68,68,0.45)', objective:'rgba(245,158,11,0.45)',
    room:'rgba(99,102,241,0.35)', connector:'rgba(148,163,184,0.3)', deadend:'rgba(120,113,108,0.35)',
    cap:'rgba(168,162,158,0.25)', filler:'rgba(68,64,60,0.2)', boss:'rgba(225,29,72,0.45)',
  };

  function renderProcgen(){
    // Procgen lives under Levels → Level Gen
    if(typeof go==='function') go('levels','gen');
    else if(typeof renderLevelGen==='function') renderLevelGen();
  }

  function pgSetSeed(v){ _pg.seed=+v||0; }
  function pgSetDemoSpeed(v){ _pg.demoSpeed=+v||120; }
  function pgToggleTroubleshoot(){ _pg.troubleshootOpen=!_pg.troubleshootOpen; if(typeof renderLevelGen==='function') renderLevelGen(); }
  function pgSelectTemplate(id){
    _pg.templateId=id;
    const t=activeTemplate();
    if(t){
      _pg.seed=t.seed||0;
      _pg.layoutStyle=t.openSocketScope==='all'&&(t.branchBudget||0)>=6?'open':(t.openSocketScope==='all'?'branched':'linear');
      _pg.linear=_pg.layoutStyle==='linear'?0:(_pg.layoutStyle==='open'?100:50);
    }
    if(typeof renderLevelGen==='function') renderLevelGen();
  }
  function pgUpdateTpl(key, val){
    const t=activeTemplate(); if(!t) return;
    t[key]=val;
    bridge.call('update_gen_template',{id:t.id, [key]:val});
    save(); if(typeof renderLevelGen==='function') renderLevelGen();
  }
  function pgSyncTemplateKnobs(extra, opts){
    const t=activeTemplate(); if(!t) return;
    const patch=Object.assign({
      id:t.id,
      openSocketScope:t.openSocketScope,
      branchBudget:t.branchBudget,
      branchDepthMax:t.branchDepthMax,
      sizeScale:t.sizeScale,
      mapHeight:t.mapHeight!=null?t.mapHeight:1,
      pathPadding:t.pathPadding,
      straightness:t.straightness,
      fillEmpty:t.fillEmpty,
      metrics:t.metrics,
    }, extra||{});
    bridge.call('update_gen_template', patch);
    save();
    // Default: do NOT rebuild the whole Level Gen panel (that resets scroll).
    if(opts&&opts.rerender&&typeof renderLevelGen==='function') renderLevelGen();
    else pgRefreshKnobLabels();
  }
  function pgRefreshKnobLabels(){
    const t=activeTemplate(); if(!t) return;
    const sizeEl=document.getElementById('pgSizeLabel');
    if(sizeEl) sizeEl.textContent=['','S','M','L','XL','Huge'][t.sizeScale||2]||'M';
    const hEl=document.getElementById('pgHeightLabel');
    if(hEl){
      const h=t.mapHeight!=null?t.mapHeight:1;
      hEl.textContent=h+' stor'+(h===1?'y':'ies');
    }
    const padEl=document.getElementById('pgPadLabel');
    if(padEl) padEl.textContent=((t.pathPadding!=null?t.pathPadding:Math.max(0,(t.sizeScale||2)-1))+' pads');
    const brEl=document.getElementById('pgBranchLabel');
    if(brEl) brEl.textContent=String(t.branchBudget||0);
    const stEl=document.getElementById('pgStraightLabel');
    if(stEl) stEl.textContent=((t.straightness!=null?t.straightness:50)+'%');
    // Layout style button highlight without full re-render
    const style=_pg.layoutStyle||(t.openSocketScope==='all'&&(t.branchBudget||0)>=6?'open':(t.openSocketScope==='all'?'branched':'linear'));
    document.querySelectorAll('[data-pg-style]').forEach(btn=>{
      const on=btn.getAttribute('data-pg-style')===style;
      btn.className='px-2 py-2 rounded-lg text-[11px] border '+(on?'bg-violet-600 border-violet-500 text-white':'bg-gray-900 border-gray-700 text-gray-400 hover:text-white');
    });
    const fill=document.querySelector('#rgdLevelGenScroll input[type=checkbox][onchange*="pgSetFillEmpty"]');
    if(fill) fill.checked=!!t.fillEmpty;
  }
  function pgSetMapHeight(v, live){
    const t=activeTemplate(); if(!t) return;
    t.mapHeight=Math.max(1, Math.min(8, +v||1));
    if(live){ pgRefreshKnobLabels(); return; }
    pgSyncTemplateKnobs({mapHeight:t.mapHeight});
  }
  function pgApplyPathMetrics(t){
    const scale=Math.max(1, Math.min(5, +(t.sizeScale||2)));
    const pad=Math.max(0, +(t.pathPadding!=null?t.pathPadding:scale-1));
    const branches=Math.max(0, +(t.branchBudget||0));
    // Loose band so padding/branches can actually land
    const minLen=Math.max(4, 6+pad*2);
    const maxLen=Math.max(minLen+10, 20+scale*18+pad*8+branches*3);
    t.metrics=Object.assign({}, t.metrics||{}, {mainPathLen:[minLen, maxLen]});
  }
  function pgSetLayoutStyle(style){
    const t=activeTemplate(); if(!t) return;
    _pg.layoutStyle=style;
    if(style==='linear'){
      t.openSocketScope='last'; t.branchBudget=0; t.branchDepthMax=0; t.fillEmpty=true;
      t.straightness=t.straightness!=null?Math.max(t.straightness,70):80;
    } else if(style==='branched'){
      t.openSocketScope='all'; t.branchBudget=Math.max(t.branchBudget||0,4); t.branchDepthMax=Math.max(t.branchDepthMax||0,2);
      t.fillEmpty=false; t.straightness=t.straightness!=null?t.straightness:45;
    } else {
      // open sprawl — real budget, longer side arms, no wall pack
      t.openSocketScope='all'; t.branchBudget=Math.max(t.branchBudget||0,10); t.branchDepthMax=Math.max(t.branchDepthMax||0,6);
      t.fillEmpty=false;
      // Open + max straightness = a stick; bias windy unless user already set low
      if(t.straightness==null || t.straightness>=70) t.straightness=30;
      if((t.sizeScale||2)<3) t.sizeScale=3;
      if((t.pathPadding||0)<2) t.pathPadding=2;
    }
    _pg.linear=style==='linear'?0:(style==='open'?100:50);
    pgApplyPathMetrics(t);
    // Update slider DOM values in place so Open preset numbers show without scroll jump
    const sizeInp=document.querySelector('#rgdLevelGenScroll input[oninput*="pgSetSizeScale"]');
    if(sizeInp) sizeInp.value=t.sizeScale||2;
    const padInp=document.querySelector('#rgdLevelGenScroll input[oninput*="pgSetPathPadding"]');
    if(padInp) padInp.value=t.pathPadding!=null?t.pathPadding:0;
    const brInp=document.querySelector('#rgdLevelGenScroll input[oninput*="pgSetBranchBudget"]');
    if(brInp) brInp.value=t.branchBudget||0;
    const stInp=document.querySelector('#rgdLevelGenScroll input[oninput*="pgSetStraightness"]');
    if(stInp) stInp.value=t.straightness!=null?t.straightness:50;
    pgSyncTemplateKnobs();
  }
  function pgSetSizeScale(v, live){
    const t=activeTemplate(); if(!t) return;
    t.sizeScale=Math.max(1, Math.min(5, +v||2));
    if(t.pathPadding==null) t.pathPadding=Math.max(0, t.sizeScale-1);
    pgApplyPathMetrics(t);
    if(live){ pgRefreshKnobLabels(); return; }
    pgSyncTemplateKnobs();
  }
  function pgSetPathPadding(v, live){
    const t=activeTemplate(); if(!t) return;
    t.pathPadding=Math.max(0, Math.min(12, +v||0));
    pgApplyPathMetrics(t);
    if(live){ pgRefreshKnobLabels(); return; }
    pgSyncTemplateKnobs();
  }
  function pgSetBranchBudget(v, live){
    const t=activeTemplate(); if(!t) return;
    t.branchBudget=Math.max(0, Math.min(24, +v||0));
    if(t.branchBudget>0){
      t.openSocketScope='all';
      t.branchDepthMax=Math.max(t.branchDepthMax||1, t.branchBudget>=8?6:3);
      // keep fillEmpty as designer set — branches no longer force air gaps
    }
    _pg.layoutStyle=t.branchBudget>=6?'open':(t.branchBudget>0?'branched':'linear');
    pgApplyPathMetrics(t);
    if(live){ pgRefreshKnobLabels(); return; }
    pgSyncTemplateKnobs();
  }
  function pgSetStraightness(v, live){
    const t=activeTemplate(); if(!t) return;
    t.straightness=Math.max(0, Math.min(100, +v||50));
    if(live){ pgRefreshKnobLabels(); return; }
    pgSyncTemplateKnobs();
  }
  function pgSetFillEmpty(on){
    const t=activeTemplate(); if(!t) return;
    t.fillEmpty=!!on;
    // persist immediately so Generate uses surround walls
    pgSyncTemplateKnobs();
  }
  function pgSetLinear(v){
    // legacy: map old slider onto layout style
    if(v<=10) pgSetLayoutStyle('linear');
    else if(v<=55) pgSetLayoutStyle('branched');
    else pgSetLayoutStyle('open');
  }
  function pgAddSpine(role){
    const t=activeTemplate(); if(!t) return;
    t.spine=t.spine||[]; t.spine.push(role);
    bridge.call('update_gen_template',{id:t.id, spine:t.spine});
    save(); if(typeof renderLevelGen==='function') renderLevelGen();
  }
  function pgRemoveSpine(i){
    const t=activeTemplate(); if(!t||!t.spine) return;
    t.spine.splice(i,1);
    bridge.call('update_gen_template',{id:t.id, spine:t.spine});
    save(); if(typeof renderLevelGen==='function') renderLevelGen();
  }
  function pgDupTemplate(){
    const t=activeTemplate(); if(!t) return;
    const id=t.id+'_copy_'+Date.now().toString(36).slice(-4);
    const copy=JSON.parse(JSON.stringify(t));
    copy.id=id; copy.name=(t.name||t.id)+' Copy';
    templatesList().push(copy);
    bridge.call('create_gen_template',{
      id, name:copy.name, spine:copy.spine, space:copy.space,
      open_socket_scope:copy.openSocketScope, branch_budget:copy.branchBudget,
      branch_depth_max:copy.branchDepthMax, tags:copy.tags, seed:copy.seed,
      max_attempts:copy.maxAttempts, metrics:copy.metrics,
    });
    _pg.templateId=id; save(); if(typeof renderLevelGen==='function') renderLevelGen(); toast('Duplicated template','ok');
  }

  async function pgGenerate(){
    const t=activeTemplate(); if(!t){ toast('No template','err'); return; }
    const lvl=typeof activeLevel==='function'?activeLevel():null;
    if(!lvl){ toast('Select a Level first','warn'); return; }
    const seedEl=document.getElementById('pgSeed');
    if(seedEl) _pg.seed=+seedEl.value||0;
    pgStopDemo();
    toast('Generating from Journey…','info');
    // Persist journey/include before generate so backend reads them
    await flushSave();
    const r=await bridge.call('generate_layout',{
      template_id:t.id, seed:_pg.seed, create_level:true, level_id:lvl.id,
    });
    if(r&&r.ok){
      _pg.lastResult=r;
      _pg.stageIdx=Math.max(0,((r.trace||[]).length-1));
      // New layout → reframe 3D camera
      if(typeof resetProcgenOrbit==='function') resetProcgenOrbit();
      try{
        const st=await bridge.raw('rgd_get_state',{});
        if(st&&st.chunks) state.chunks=st.chunks;
        if(st&&st.genTemplates) state.genTemplates=st.genTemplates;
        if(st&&st.journeys){ state.journeys=st.journeys; if(typeof ensureJourneys==='function') ensureJourneys(); }
        if(st&&st.levels){ state.levels=st.levels; state.levels.forEach(normalizeLevelLocal); }
      }catch(_){
        lvl.w=r.w; lvl.h=r.h; lvl.grid=r.grid; lvl.layout=r.layout;
        lvl.gen={templateId:t.id,seed:r.seed,stats:r.stats,spineUsed:r.spineUsed||[]};
      }
      state.meta.activeLevelId=r.levelId||lvl.id;
      toast('Generated · path '+(r.stats&&r.stats.mainPathLen)+' · '+r.stats.chunksPlaced+' chunks','ok');
    } else {
      _pg.lastResult=r||{ok:false,attemptsLog:[],rejectionHistogram:{},hints:['Generate failed']};
      toast((r&&r.error)||'Generation failed','err');
    }
    if(typeof renderLevelGen==='function') renderLevelGen();
  }

  function pgReroll(){
    _pg.seed=Math.floor(Math.random()*1e9);
    const el=document.getElementById('pgSeed'); if(el) el.value=_pg.seed;
    pgGenerate();
  }

  function pgSetViewMode(mode){
    _pg.viewMode=(mode==='3d')?'3d':'2d';
    if(_pg.viewMode!=='3d' && typeof disposeProcgenViewer==='function') disposeProcgenViewer();
    if(typeof renderLevelGen==='function') renderLevelGen();
  }
  function pgSetStage(i){
    _pg.stageIdx=i;
    if(_pg.viewMode==='3d') refreshProcgenPreview3d();
    else drawProcgenCanvas();
  }
  function refreshProcgenPreview3d(){
    const res=_pg.lastResult;
    if(!res||!res.ok) return;
    if(typeof refreshProcgenThree==='function')
      refreshProcgenThree(res, _pg.stageIdx, _pg.demoPlaying?_pg.demoIdx:null);
    else if(typeof mountProcgenViewer==='function')
      mountProcgenViewer(res, _pg.stageIdx, _pg.demoPlaying?_pg.demoIdx:null);
  }

  function pgStopDemo(){
    if(_pg.demoTimer){ clearInterval(_pg.demoTimer); _pg.demoTimer=null; }
    _pg.demoPlaying=false;
  }
  function pgToggleDemo(){
    if(_pg.demoPlaying){ pgStopDemo(); if(typeof renderLevelGen==='function') renderLevelGen(); return; }
    const path=(_pg.lastResult&&_pg.lastResult.mainPath)||[];
    if(!path.length){ toast('Generate a layout first','warn'); return; }
    _pg.demoPlaying=true; _pg.demoIdx=0;
    if(typeof renderLevelGen==='function') renderLevelGen();
    _pg.demoTimer=setInterval(()=>{
      _pg.demoIdx++;
      if(_pg.demoIdx>=path.length){ _pg.demoIdx=path.length-1; pgStopDemo(); if(typeof renderLevelGen==='function') renderLevelGen(); return; }
      if(_pg.viewMode==='3d') refreshProcgenPreview3d();
      else drawProcgenCanvas();
    }, Math.max(30, 500-_pg.demoSpeed));
  }

  async function pgBuildUeFn(){
    const lvl=typeof activeLevel==='function'?activeLevel():null;
    const lid=(_pg.lastResult&&_pg.lastResult.levelId)||(lvl&&lvl.id);
    if(!lid){ toast('Generate first','warn'); return; }
    toast('Building layout in UEFN…','info');
    const res=await bridge.call('build_layout_in_uefn',{level_id:lid});
    if(res&&res.error) toast(res.error,'err');
    else toast('Placed '+(res&&res.chunks||0)+' chunks','ok');
  }

  function drawProcgenCanvas(){
    if(_pg.viewMode==='3d'){
      refreshProcgenPreview3d();
      return;
    }
    if(typeof disposeProcgenViewer==='function') disposeProcgenViewer();
    const canvas=document.getElementById('pgCanvas'); if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    const cssW=canvas.clientWidth||720, cssH=Math.max(360, canvas.clientHeight||480);
    canvas.width=cssW*dpr; canvas.height=cssH*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#0b0f19'; ctx.fillRect(0,0,cssW,cssH);
    const lvl=typeof activeLevel==='function'?activeLevel():null;
    const layers=(lvl&&lvl.layers)||(typeof defaultLayers==='function'?defaultLayers():{});
    const res=_pg.lastResult;
    if(!res||!res.ok){
      ctx.fillStyle='#64748b'; ctx.font='14px sans-serif'; ctx.textAlign='center';
      ctx.fillText(res&&res.error?('Failed: '+res.error):'Add Journey steps, then Generate', cssW/2, cssH/2);
      return;
    }
    const trace=res.trace||[];
    const stage=trace[_pg.stageIdx]||trace[trace.length-1]||{};
    const placements=stage.placements||res.layout||[];
    const w=res.w||1, h=res.h||1;
    const pad=20;
    const cell=Math.min((cssW-pad*2)/w, (cssH-pad*2)/h);
    const ox=(cssW-w*cell)/2, oy=(cssH-h*cell)/2;

    // Reference overlay (draw-only; does not mutate layout)
    const ov=lvl&&lvl.overlay;
    const ovUrl=canvas.dataset.overlayUrl||'';
    if(ov&&ov.enabled&&ovUrl){
      let img=canvas._overlayImg;
      if(!img||img._src!==ovUrl){
        img=new Image();
        img._src=ovUrl;
        canvas._overlayImg=img;
        img.onload=function(){ drawProcgenCanvas(); };
        img.src=ovUrl;
      }
      if(img.complete&&img.naturalWidth){
        ctx.save();
        ctx.globalAlpha=Math.max(0.05, Math.min(1, Number(ov.opacity)||0.55));
        if(ov.stretch!==false){
          ctx.drawImage(img, ox, oy, w*cell, h*cell);
        }else{
          const scale=Math.min((w*cell)/img.naturalWidth, (h*cell)/img.naturalHeight);
          const dw=img.naturalWidth*scale, dh=img.naturalHeight*scale;
          ctx.drawImage(img, ox+(w*cell-dw)/2, oy+(h*cell-dh)/2, dw, dh);
        }
        ctx.restore();
      }
    }

    const grid=res.grid;
    const terrColor={floor:'#1e293b', wall:'#334155', door:'#854d0e', empty:'#0f172a'};
    if(layers.terrain!==false && grid&&grid._sparse&&grid.cells){
      Object.keys(grid.cells).forEach(k=>{
        const [x,y]=k.split(',').map(Number);
        const t=grid.cells[k].terrain||'empty';
        ctx.fillStyle=terrColor[t]||'#222';
        ctx.fillRect(ox+x*cell, oy+y*cell, cell-0.5, cell-0.5);
      });
    }

    placements.forEach(p=>{
      if(layers.terrain===false) return;
      const cw=p.cw||1, ch=p.ch||1;
      ctx.fillStyle=PG_ROLE_FILL[p.role]||'rgba(100,100,100,0.3)';
      ctx.fillRect(ox+p.cx*cell, oy+p.cy*cell, cw*cell, ch*cell);
      ctx.strokeStyle=ROLE_COLORS[p.role]||'#818cf8';
      ctx.lineWidth=1.5;
      ctx.strokeRect(ox+p.cx*cell+0.5, oy+p.cy*cell+0.5, cw*cell-1, ch*cell-1);
      if(cell>=14 && p.role!=='filler'){
        const sym={entrance:'E',exit:'X',objective:'O',boss:'B',room:'R',connector:'C',deadend:'D',cap:'·'}[p.role]||'?';
        ctx.fillStyle='#e2e8f0';
        ctx.font=`${Math.max(8, Math.min(11,cell*0.45))}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(sym, ox+(p.cx+cw/2)*cell, oy+(p.cy+ch/2)*cell);
      }
      (p.slots||[]).forEach(s=>{
        const group=String(s.group||'').toUpperCase();
        if(group==='A' && layers.starts===false) return;
        if(group==='B' && layers.spawns===false) return;
        ctx.fillStyle=group==='A'?'#34d399':(group==='B'?'#f472b6':'#a78bfa');
        ctx.beginPath();
        ctx.arc(ox+(s.x+0.5)*cell, oy+(s.y+0.5)*cell, Math.max(2,cell*0.15), 0, Math.PI*2);
        ctx.fill();
      });
    });

    if(grid&&grid._sparse&&grid.cells){
      Object.keys(grid.cells).forEach(k=>{
        const ent=grid.cells[k].entity; if(!ent) return;
        if(ent.kind==='npc'&&layers.npcs===false) return;
        if(ent.kind==='item'&&layers.items===false) return;
        const [x,y]=k.split(',').map(Number);
        const list=ent.kind==='npc'?state.npcs:state.items;
        const e=(list||[]).find(z=>z.id===ent.id);
        ctx.fillStyle=(e&&e.color)||'#fff';
        ctx.font=`bold ${Math.max(9,cell*0.4)}px monospace`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText((e&&e.symbol)||'?', ox+(x+0.5)*cell, oy+(y+0.5)*cell);
      });
    }

    const path=res.mainPath||[];
    if(layers.path!==false && path.length>1){
      ctx.strokeStyle='#38bdf8';
      ctx.lineWidth=Math.max(1.5, cell*0.15);
      ctx.beginPath();
      path.forEach((pt,i)=>{
        const x=ox+(pt[0]+0.5)*cell, y=oy+(pt[1]+0.5)*cell;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();
    }
    if(layers.entrances!==false){
      placements.forEach(p=>{
        if(p.role!=='entrance'&&p.role!=='exit') return;
        const x=ox+(p.cx+p.cw/2)*cell, y=oy+(p.cy+p.ch/2)*cell;
        ctx.fillStyle=p.role==='entrance'?'#22c55e':'#ef4444';
        ctx.font=`bold ${Math.max(9,cell*0.4)}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.fillText(p.role==='entrance'?'IN':'OUT', x, y-cell*0.15);
      });
    }

    if(path.length){
      const idx=Math.min(_pg.demoIdx, path.length-1);
      const pt=path[idx];
      ctx.fillStyle='#fef08a';
      ctx.beginPath();
      ctx.arc(ox+(pt[0]+0.5)*cell, oy+(pt[1]+0.5)*cell, Math.max(3,cell*0.28), 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle='#ca8a04'; ctx.lineWidth=2; ctx.stroke();
    }
  }

  /* ===== Journeys catalogue — authored here; Level Gen only selects ===== */
  function ensureJourneys(){
    if(!Array.isArray(state.journeys)) state.journeys=[];
    if(!state.meta) state.meta={};
    if(!state.meta.activeJourneyId && state.journeys[0]) state.meta.activeJourneyId=state.journeys[0].id;
    // Migrate leftover inline level.journey.steps → catalogue (once).
    (state.levels||[]).forEach(l=>{
      if(!l||typeof l!=='object') return;
      if(l.journeyId) return;
      const steps=(l.journey&&l.journey.steps)||[];
      if(!steps.length){ l.journeyId=l.journeyId||''; return; }
      const id='jny_from_'+(l.id||uid('lvl'));
      if(!state.journeys.find(j=>j.id===id)){
        state.journeys.push(normalizeJourneyRecord({
          id, name:(l.journey&&l.journey.name)||((l.name||'Level')+' Journey'),
          teleportOnAdvance:!(l.journey&&l.journey.teleportOnAdvance===false),
          steps, enemyPoolNpcIds:(l.include&&l.include.npcIds)||[],
          rewardItemIds:(l.include&&l.include.itemIds)||[],
        }));
      }
      l.journeyId=id;
      l.journey=defaultJourney();
    });
    if(!state.journeys.length){
      state.journeys.push(normalizeJourneyRecord({
        id:'jny_training_gauntlet', name:'Training Gauntlet',
        notes:'Wave → travel → boss', teleportOnAdvance:true,
        enemyPoolNpcIds:[], rewardItemIds:[], rewardDropTableIds:[],
        steps:[
          {id:uid('js'),type:'wave',name:'Warm-up',offerUpgrade:true,waveCount:2,enemyPoolNpcIds:[]},
          {id:uid('js'),type:'travel',name:'Hall',lengthHint:2},
          {id:uid('js'),type:'boss',name:'Boss',bossNpcId:''},
        ],
      }));
    }
    state.journeys=state.journeys.map(normalizeJourneyRecord);
  }

  function defaultJourneyLoop(){ return {enabled:false,count:1,dropTableId:'',onComplete:'exit'}; }
  function defaultStepRewards(){ return {itemIds:[],dropTableIds:[],currency:{}}; }

  function normalizeJourneyRecord(raw){
    const j=raw&&typeof raw==='object'?raw:{};
    const loopIn=j.loop&&typeof j.loop==='object'?j.loop:{};
    const loop=defaultJourneyLoop();
    loop.enabled=!!loopIn.enabled;
    loop.count=Math.max(1, Number(loopIn.count)||1);
    loop.dropTableId=String(loopIn.dropTableId||'');
    loop.onComplete=(loopIn.onComplete==='restart')?'restart':'exit';
    const steps=Array.isArray(j.steps)?j.steps.map((s,i)=>normalizeJourneyStepLocal(s,i)).filter(Boolean):[];
    return {
      id:String(j.id||uid('jny')),
      name:String(j.name||'Journey'),
      notes:String(j.notes||''),
      teleportOnAdvance:j.teleportOnAdvance!==false,
      enemyPoolNpcIds:Array.isArray(j.enemyPoolNpcIds)?j.enemyPoolNpcIds.map(String):[],
      rewardItemIds:Array.isArray(j.rewardItemIds)?j.rewardItemIds.map(String):[],
      rewardDropTableIds:Array.isArray(j.rewardDropTableIds)?j.rewardDropTableIds.map(String):[],
      loop, steps,
    };
  }

  function normalizeJourneyStepLocal(raw, index){
    if(!raw||typeof raw!=='object') return null;
    const type=['wave','boss','travel','timer'].includes(raw.type)?raw.type:'wave';
    const rewIn=raw.rewards&&typeof raw.rewards==='object'?raw.rewards:{};
    const cur={};
    if(rewIn.currency&&typeof rewIn.currency==='object'){
      Object.keys(rewIn.currency).forEach(k=>{ const n=Number(rewIn.currency[k]); if(n) cur[k]=n; });
    }
    const step={
      id:String(raw.id||('step_'+index)),
      type, name:String(raw.name||type),
      offerUpgrade:!!raw.offerUpgrade,
      notes:String(raw.notes||''),
      rewards:{
        itemIds:Array.isArray(rewIn.itemIds)?rewIn.itemIds.map(String):[],
        dropTableIds:Array.isArray(rewIn.dropTableIds)?rewIn.dropTableIds.map(String):[],
        currency:cur,
      },
    };
    if(type==='wave'){
      step.waveCount=Math.max(1, Number(raw.waveCount)||3);
      step.enemyPoolNpcIds=Array.isArray(raw.enemyPoolNpcIds)?raw.enemyPoolNpcIds.map(String):[];
    } else if(type==='boss'){
      step.bossNpcId=String(raw.bossNpcId||'');
    } else if(type==='travel'){
      step.lengthHint=Math.max(1, Number(raw.lengthHint)||2);
    } else if(type==='timer'){
      step.durationSec=Math.max(5, Number(raw.durationSec)||60);
      step.survive=raw.survive!==false;
      step.enemyPoolNpcIds=Array.isArray(raw.enemyPoolNpcIds)?raw.enemyPoolNpcIds.map(String):[];
    }
    return step;
  }

  function activeJourney(){
    ensureJourneys();
    const id=state.meta.activeJourneyId;
    return state.journeys.find(j=>j.id===id)||state.journeys[0]||null;
  }

  function journeyById(id){
    ensureJourneys();
    return (state.journeys||[]).find(j=>j.id===id)||null;
  }

  function journeyNpcIds(j){
    if(!j) return [];
    const ids=[];
    // Enemies live on steps (wave/timer pools + boss). Legacy journey-level pool ignored for UX.
    (j.steps||[]).forEach(s=>{
      (s.enemyPoolNpcIds||[]).forEach(id=>{ if(id&&ids.indexOf(id)<0) ids.push(id); });
      if(s.bossNpcId&&ids.indexOf(s.bossNpcId)<0) ids.push(s.bossNpcId);
    });
    return ids;
  }

  /** One-shot: old journey-wide enemy list → wave/timer steps that had none. */
  function migrateJourneyPoolIntoSteps(j){
    if(!j) return false;
    const pool=Array.isArray(j.enemyPoolNpcIds)?j.enemyPoolNpcIds.filter(Boolean):[];
    if(!pool.length) return false;
    let changed=false;
    (j.steps||[]).forEach(s=>{
      if(s.type!=='wave'&&s.type!=='timer') return;
      if((s.enemyPoolNpcIds||[]).length) return;
      s.enemyPoolNpcIds=pool.slice();
      changed=true;
    });
    j.enemyPoolNpcIds=[];
    return true;
  }

  /** Items/tables come from drop tables attached on Journey NPCs — not journey/level checkboxes. */
  function journeyStampSummary(j){
    const npcIds=journeyNpcIds(j);
    const npcs=npcIds.map(id=>(state.npcs||[]).find(n=>n.id===id)).filter(Boolean);
    const tableIds=[];
    const itemIds=[];
    npcs.forEach(n=>{
      (n.dropTableIds||[]).forEach(tid=>{ if(tid&&tableIds.indexOf(tid)<0) tableIds.push(tid); });
      (n.bonusDrops||[]).forEach(e=>{
        const iid=e&&e.itemId; if(iid&&itemIds.indexOf(iid)<0) itemIds.push(iid);
      });
    });
    tableIds.forEach(tid=>{
      const t=(state.dropTables||[]).find(x=>x.id===tid);
      (t&&t.entries||[]).forEach(e=>{
        const iid=e&&e.itemId; if(iid&&itemIds.indexOf(iid)<0) itemIds.push(iid);
      });
    });
    return {
      npcs,
      items:itemIds.map(id=>(state.items||[]).find(i=>i.id===id)).filter(Boolean),
      tables:tableIds.map(id=>(state.dropTables||[]).find(t=>t.id===id)).filter(Boolean),
    };
  }
  function journeyRefsSummary(j){ return journeyStampSummary(j); }

  function renderJourneys(){
    ensureJourneys();
    const host=document.getElementById('levelsSubHost')||document.getElementById('tab-levels');
    if(!host) return;
    const j=activeJourney();
    const list=(state.journeys||[]).map(x=>`
      <button onclick="RGD.selectJourney('${x.id}')"
        class="w-full text-left px-3 py-2 rounded-lg mb-1 ${x.id===(j&&j.id)?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">
        <div class="text-sm font-medium truncate">${esc(x.name)}</div>
        <div class="text-[10px] opacity-70">${(x.steps||[]).length} steps</div>
      </button>`).join('');

    if(!j){
      host.innerHTML=`<div class="py-12 text-center text-gray-500 text-sm">No journeys yet.
        <button onclick="RGD.newJourney()" class="ml-2 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm">Create Journey</button></div>`;
      return;
    }

    if(migrateJourneyPoolIntoSteps(j)) save();
    const refs=journeyStampSummary(j);

    const stepsHtml=(j.steps||[]).map((step,idx)=>journeyCatalogueStepRow(step,idx)).join('')
      ||`<div class="text-xs text-gray-600 py-3">No steps yet — add wave / travel / boss / timer.</div>`;

    const levelsUsing=(state.levels||[]).filter(l=>l.journeyId===j.id);

    host.innerHTML=`
      <div class="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div class="xl:col-span-1">
          <div class="flex items-center justify-between mb-2">
            <div class="text-sm font-semibold text-white">Journeys</div>
            <button onclick="RGD.newJourney()" class="px-2 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs text-white">+ New</button>
          </div>
          <div class="max-h-[calc(100vh-240px)] overflow-y-auto pr-1">${list}</div>
        </div>
        <div class="xl:col-span-3 space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <input value="${esc(j.name)}" onchange="RGD.updateJourneyRecord('name',this.value)"
                class="flex-1 min-w-[160px] bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-semibold text-white"/>
              <button onclick="RGD.dupJourney()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs">Duplicate</button>
              <button onclick="RGD.deleteJourney('${j.id}')" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-red-600 text-xs">Delete</button>
            </div>
            <label class="text-[11px] text-gray-400 block">Notes
              <textarea rows="2" onchange="RGD.updateJourneyRecord('notes',this.value)"
                class="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200">${esc(j.notes||'')}</textarea>
            </label>
            ${levelsUsing.length?`<div class="text-[11px] text-gray-500">Linked from Level Gen: ${levelsUsing.map(l=>esc(l.name)).join(', ')}</div>`:''}
          </div>

          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div class="text-sm font-semibold text-white">Steps</div>
                <div class="text-[11px] text-gray-500">Click a step to edit. Closed by default. Start &amp; End rooms are automatic.</div>
              </div>
              <div class="flex flex-wrap gap-1.5">
                ${[['wave','+ Wave fight'],['boss','+ Boss'],['travel','+ Travel'],['timer','+ Survive']].map(([t,lab])=>`
                  <button onclick="RGD.addCatalogueJourneyStep('${t}')"
                    class="px-2.5 py-1.5 rounded-lg text-[11px] bg-violet-700/80 hover:bg-violet-600 text-white">${lab}</button>`).join('')}
              </div>
            </div>
            <div class="space-y-2">${stepsHtml}</div>
          </div>

          ${journeyLootOverviewHtml(refs, j)}
        </div>
      </div>`;
    try{ lucide.createIcons(); }catch(_){}
  }

  function journeyLootOverviewHtml(refs, j){
    const chip=(sym, color, name)=>`
      <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-900/80 border border-gray-700/80 min-w-0">
        <span class="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0" style="background:${color||'#64748b'}33;color:${color||'#94a3b8'};box-shadow:inset 0 0 0 1px ${color||'#64748b'}55">${esc(sym||'?')}</span>
        <span class="text-xs text-gray-200 truncate">${esc(name||'')}</span>
      </div>`;
    const npcChips=(refs.npcs||[]).map(n=>chip(n.symbol, n.color, n.name)).join('')
      ||`<div class="text-xs text-gray-600 py-2">No fighters yet — open a Wave / Boss / Survive step and check enemies.</div>`;
    const tableChips=(refs.tables||[]).map(t=>chip('▣', t.color||'#f59e0b', t.name)).join('')
      ||`<div class="text-xs text-gray-600 py-2">Attach drop tables on those NPCs under <b class="text-gray-400">NPCs &amp; Enemies</b>.</div>`;
    const itemChips=(refs.items||[]).map(i=>chip(i.symbol, i.color, i.name)).join('')
      ||`<div class="text-xs text-gray-600 py-2">Items appear here from the NPC loot tables above.</div>`;
    const stepCount=(j.steps||[]).length;
    const fightCount=(j.steps||[]).filter(s=>s.type==='wave'||s.type==='boss'||s.type==='timer').length;
    return `<div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-700/80">
        <div class="text-sm font-semibold text-white">Auto loot preview</div>
        <div class="text-[11px] text-gray-500 mt-0.5">Filled from your steps — you don’t edit this list. Change enemies on steps, or loot tables on NPCs.</div>
      </div>
      <div class="px-4 py-3 border-b border-gray-800 bg-gray-900/40">
        <div class="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
          <span class="px-2 py-1 rounded-lg bg-violet-600/20 text-violet-200 border border-violet-500/30">${stepCount} steps</span>
          <span class="text-gray-600">→</span>
          <span class="px-2 py-1 rounded-lg bg-rose-600/20 text-rose-200 border border-rose-500/30">${fightCount} fights</span>
          <span class="text-gray-600">→</span>
          <span class="px-2 py-1 rounded-lg bg-amber-600/20 text-amber-200 border border-amber-500/30">${(refs.npcs||[]).length} fighters</span>
          <span class="text-gray-600">→</span>
          <span class="px-2 py-1 rounded-lg bg-emerald-600/20 text-emerald-200 border border-emerald-500/30">${(refs.items||[]).length} drop items</span>
        </div>
        <div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-[10px] text-gray-500">
          <div class="rounded-lg border border-dashed border-gray-700 p-2">
            <div class="text-2xl mb-1">①</div>
            <div class="text-gray-300 font-medium">Pick on steps</div>
            Wave / Boss / Survive checkboxes
          </div>
          <div class="rounded-lg border border-dashed border-gray-700 p-2">
            <div class="text-2xl mb-1">②</div>
            <div class="text-gray-300 font-medium">NPC loot tables</div>
            Set on each enemy in NPCs tab
          </div>
          <div class="rounded-lg border border-dashed border-gray-700 p-2">
            <div class="text-2xl mb-1">③</div>
            <div class="text-gray-300 font-medium">Items show here</div>
            Auto — for Generate preview
          </div>
        </div>
      </div>
      <div class="p-4 space-y-4">
        <div>
          <div class="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Fighters from steps</div>
          <div class="flex flex-wrap gap-2">${npcChips}</div>
        </div>
        <div>
          <div class="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Loot tables on those fighters</div>
          <div class="flex flex-wrap gap-2">${tableChips}</div>
        </div>
        <div>
          <div class="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Items that can drop</div>
          <div class="flex flex-wrap gap-2">${itemChips}</div>
        </div>
      </div>
    </div>`;
  }

  function stepTypeLabel(t){
    return ({wave:'Wave fight',boss:'Boss',travel:'Travel',timer:'Survive'})[t]||t;
  }
  function stepTypeColor(t){
    return ({wave:'#8b5cf6',boss:'#ef4444',travel:'#64748b',timer:'#f59e0b'})[t]||'#6b7280';
  }

  function journeyStepEnemyPicker(step, idx){
    const types=(typeof NPC_TYPES!=='undefined'?NPC_TYPES:['Enemy','Elite','Boss','Friendly']);
    const key='stepEnemyTab_'+((step&&step.id)||idx);
    const tab=(state.meta&&state.meta[key])||'Enemy';
    const active=types.indexOf(tab)>=0?tab:types[0];
    const selected=new Set(step.enemyPoolNpcIds||[]);
    const tabs=types.map(t=>{
      const inCat=(state.npcs||[]).filter(n=>(typeof npcType==='function'?npcType(n):n.type)===t);
      const sel=inCat.filter(n=>selected.has(n.id)).length;
      return `<button type="button" onclick="RGD.setCatalogueStepEnemyTab(${idx},'${t}')"
        class="px-2 py-1 rounded-lg text-[10px] border ${active===t?'bg-violet-600 border-violet-500 text-white':'bg-gray-900 border-gray-700 text-gray-400'}">
        ${esc(t)} <span class="${sel?'text-emerald-300':'opacity-50'}">${sel}</span>
      </button>`;
    }).join('');
    const shown=(state.npcs||[]).filter(n=>(typeof npcType==='function'?npcType(n):n.type)===active);
    const checks=shown.map(n=>`
      <label class="flex items-center gap-2 text-xs text-gray-300 px-2 py-1 rounded hover:bg-gray-800 cursor-pointer">
        <input type="checkbox" ${selected.has(n.id)?'checked':''}
          onchange="RGD.toggleCatalogueStepEnemy(${idx},'${n.id}',this.checked)">
        <span class="w-4 h-4 rounded text-center text-[9px] font-bold leading-4 shrink-0" style="background:${n.color||'#888'}33;color:${n.color||'#aaa'}">${esc(n.symbol||'?')}</span>
        <span class="truncate">${esc(n.name)}</span>
      </label>`).join('')||`<div class="text-[11px] text-gray-600 px-2 py-2">No ${esc(active)} NPCs.</div>`;
    return `<div class="space-y-1.5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-[11px] text-gray-400">Enemies this step <span class="text-gray-500">· ${selected.size} selected</span></div>
        ${selected.size?`<button type="button" onclick="RGD.clearCatalogueStepEnemies(${idx})" class="text-[10px] text-gray-500 hover:text-white">Clear all</button>`:''}
      </div>
      ${!selected.size?`<div class="text-[11px] text-amber-500/90 px-1">Pick who spawns here.</div>`:''}
      <div class="flex flex-wrap gap-1">${tabs}</div>
      <div class="max-h-36 overflow-y-auto border border-gray-700/70 rounded-lg bg-black/20 p-1">${checks}</div>
    </div>`;
  }

  function journeyBossDropdown(step, idx){
    const types=(typeof NPC_TYPES!=='undefined'?NPC_TYPES:['Enemy','Elite','Boss','Friendly']);
    const groups=types.map(t=>{
      const opts=(state.npcs||[]).filter(n=>(typeof npcType==='function'?npcType(n):n.type)===t)
        .map(n=>`<option value="${esc(n.id)}" ${step.bossNpcId===n.id?'selected':''}>${esc(n.name)}</option>`).join('');
      return opts?`<optgroup label="${esc(t)}">${opts}</optgroup>`:'';
    }).join('');
    return `<label class="block text-[11px] text-gray-400">Which boss?
      <select class="mt-1 w-full max-w-md bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white"
        onchange="RGD.updateCatalogueJourneyStep(${idx},'bossNpcId',this.value)">
        <option value="">— pick a boss —</option>${groups}
      </select></label>`;
  }

  function journeyStepSummary(step){
    if(step.type==='wave'){
      const n=(step.enemyPoolNpcIds||[]).length;
      return `${step.waveCount||3} waves · ${n} enem${n===1?'y':'ies'}${step.offerUpgrade?' · upgrade':''}`;
    }
    if(step.type==='boss'){
      const b=(state.npcs||[]).find(n=>n.id===step.bossNpcId);
      return b?('Boss: '+b.name):(step.bossNpcId?'Boss set':'No boss picked');
    }
    if(step.type==='travel') return 'Hall ×'+(step.lengthHint||2);
    if(step.type==='timer'){
      const n=(step.enemyPoolNpcIds||[]).length;
      return (step.durationSec||60)+'s · '+n+' enem'+(n===1?'y':'ies');
    }
    return step.type||'';
  }

  function isJourneyStepOpen(step, idx){
    if(!state.meta) return false;
    const id=step.id||('idx_'+idx);
    return state.meta.openJourneyStepId===id;
  }

  function toggleJourneyStepAccordion(idx, ev){
    if(ev&&ev.target&&ev.target.closest('button,input,select,label,a')) return;
    const j=activeJourney(); if(!j||!j.steps[idx]) return;
    if(!state.meta) state.meta={};
    const id=j.steps[idx].id||('idx_'+idx);
    state.meta.openJourneyStepId=(state.meta.openJourneyStepId===id)?'':id;
    save(); renderJourneys();
  }

  function journeyCatalogueStepRow(step, idx){
    const open=isJourneyStepOpen(step, idx);
    const types=[['wave','Wave fight'],['boss','Boss'],['travel','Travel'],['timer','Survive']];
    const typeBtns=types.map(([t,lab])=>`
      <button type="button" onclick="event.stopPropagation();RGD.updateCatalogueJourneyStep(${idx},'type','${t}')"
        class="px-2 py-0.5 rounded-md text-[10px] border ${step.type===t?'text-white border-transparent':'bg-gray-900 border-gray-700 text-gray-500 hover:text-white'}"
        style="${step.type===t?'background:'+stepTypeColor(t):''}">${lab}</button>`).join('');

    let body='';
    if(step.type==='wave'){
      body=`<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
        <label class="text-[11px] text-gray-400">How many waves?
          <input type="number" min="1" value="${step.waveCount||3}" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white"
            onchange="RGD.updateCatalogueJourneyStep(${idx},'waveCount',+this.value)"/></label>
        <label class="flex items-center gap-2 text-sm text-gray-300 mt-6">
          <input type="checkbox" ${step.offerUpgrade?'checked':''} onchange="RGD.updateCatalogueJourneyStep(${idx},'offerUpgrade',this.checked)">
          Offer upgrade after this step
        </label>
      </div>${journeyStepEnemyPicker(step, idx)}`;
    } else if(step.type==='boss'){
      body=`<div class="space-y-3">
        ${journeyBossDropdown(step, idx)}
        <label class="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" ${step.offerUpgrade?'checked':''} onchange="RGD.updateCatalogueJourneyStep(${idx},'offerUpgrade',this.checked)">
          Offer upgrade after this step
        </label>
      </div>`;
    } else if(step.type==='travel'){
      body=`<label class="text-[11px] text-gray-400 block max-w-xs">Hall length (chunks)
        <input type="number" min="1" max="12" value="${step.lengthHint||2}" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white"
          onchange="RGD.updateCatalogueJourneyStep(${idx},'lengthHint',+this.value)"/>
        <span class="text-[10px] text-gray-600">Corridor between fights — no enemy pick needed.</span>
      </label>`;
    } else if(step.type==='timer'){
      body=`<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
        <label class="text-[11px] text-gray-400">Survive for (seconds)
          <input type="number" min="5" value="${step.durationSec||60}" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white"
            onchange="RGD.updateCatalogueJourneyStep(${idx},'durationSec',+this.value)"/></label>
        <label class="flex items-center gap-2 text-sm text-gray-300 mt-6">
          <input type="checkbox" ${step.survive!==false?'checked':''} onchange="RGD.updateCatalogueJourneyStep(${idx},'survive',this.checked)">
          Must survive (fail if dead)
        </label>
      </div>${journeyStepEnemyPicker(step, idx)}`;
    }

    return `<div class="rounded-xl border ${open?'border-violet-500/50':'border-gray-700'} bg-gray-900/60 overflow-hidden">
      <div role="button" tabindex="0" onclick="RGD.toggleJourneyStepAccordion(${idx},event)"
        class="flex flex-wrap items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-800/60 ${open?'border-b border-gray-800':''}"
        style="border-left:3px solid ${stepTypeColor(step.type)}">
        <span class="text-gray-500 text-xs w-4">${open?'▼':'▶'}</span>
        <span class="text-xs font-semibold text-gray-500 w-5">${idx+1}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded font-medium" style="background:${stepTypeColor(step.type)}33;color:${stepTypeColor(step.type)}">${esc(stepTypeLabel(step.type))}</span>
        <span class="text-sm text-white font-medium truncate max-w-[180px]">${esc(step.name||stepTypeLabel(step.type))}</span>
        <span class="text-[11px] text-gray-500 truncate flex-1 min-w-[100px]">${esc(journeyStepSummary(step))}</span>
        <div class="flex gap-1 ml-auto" onclick="event.stopPropagation()">
          <button title="Move up" onclick="RGD.moveCatalogueJourneyStep(${idx},-1)" class="px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300">↑</button>
          <button title="Move down" onclick="RGD.moveCatalogueJourneyStep(${idx},1)" class="px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300">↓</button>
          <button title="Remove" onclick="RGD.removeCatalogueJourneyStep(${idx})" class="px-2 py-1 rounded-lg bg-gray-800 hover:bg-red-700 text-xs text-gray-300">Remove</button>
        </div>
      </div>
      ${open?`<div class="px-3 py-3 space-y-3">
        <div>
          <div class="text-[10px] text-gray-500 mb-1">Step type</div>
          <div class="flex flex-wrap gap-1">${typeBtns}</div>
        </div>
        <label class="text-[11px] text-gray-400 block">Name
          <input value="${esc(step.name||'')}" placeholder="Name this step"
            class="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white"
            onchange="RGD.updateCatalogueJourneyStep(${idx},'name',this.value)"/>
        </label>
        ${body}
      </div>`:''}
    </div>`;
  }

  function setJourneyEnemyTab(){ /* legacy no-op — enemies are per-step */ }
  function selectJourney(id){ state.meta.activeJourneyId=id; save(); renderJourneys(); }

  function newJourney(){
    ensureJourneys();
    const j=normalizeJourneyRecord({
      id:uid('jny'), name:'Journey '+(state.journeys.length+1),
      notes:'', teleportOnAdvance:true,
      steps:[{id:uid('js'),type:'wave',name:'Wave Arena',offerUpgrade:true,waveCount:3,enemyPoolNpcIds:[]}],
    });
    state.journeys.push(j);
    state.meta.activeJourneyId=j.id;
    state.meta.levelsSubtab='journeys';
    save({flush:true});
    renderLevels();
    toast('Journey created — add steps and pick enemies on each fight','ok');
  }

  function dupJourney(){
    const src=activeJourney(); if(!src) return;
    const copy=normalizeJourneyRecord(JSON.parse(JSON.stringify(src)));
    copy.id=uid('jny'); copy.name=(src.name||'Journey')+' Copy';
    state.journeys.push(copy); state.meta.activeJourneyId=copy.id;
    save(); renderJourneys(); toast('Duplicated','ok');
  }

  function deleteJourney(id){
    ensureJourneys();
    if(state.journeys.length<=1){ toast('Keep at least one journey','warn'); return; }
    state.journeys=state.journeys.filter(j=>j.id!==id);
    (state.levels||[]).forEach(l=>{ if(l.journeyId===id) l.journeyId=''; });
    if(state.meta.activeJourneyId===id) state.meta.activeJourneyId=state.journeys[0].id;
    save(); renderJourneys(); toast('Journey deleted','warn');
  }

  function updateJourneyRecord(k,v){
    const j=activeJourney(); if(!j) return;
    j[k]=v; save(); if(k==='name') renderJourneys();
  }
  function updateJourneyLoop(k,v){
    const j=activeJourney(); if(!j) return;
    j.loop=j.loop||defaultJourneyLoop();
    j.loop[k]=v; save();
  }
  function toggleJourneyPool(){ toast('Pick enemies on each step, not a journey-wide list','info'); }

  function addCatalogueJourneyStep(type){
    const j=activeJourney(); if(!j) return;
    const defaults={wave:'Wave fight',boss:'Boss',travel:'Travel',timer:'Survive'};
    const step=normalizeJourneyStepLocal({id:uid('js'),type,name:defaults[type]||type,offerUpgrade:type==='wave'}, j.steps.length);
    j.steps.push(step);
    if(!state.meta) state.meta={};
    state.meta.openJourneyStepId=step.id;
    save(); renderJourneys();
  }
  function updateCatalogueJourneyStep(idx,key,val){
    const j=activeJourney(); if(!j||!j.steps[idx]) return;
    j.steps[idx][key]=val;
    if(key==='type') j.steps[idx]=normalizeJourneyStepLocal(j.steps[idx], idx);
    if(!state.meta) state.meta={};
    state.meta.openJourneyStepId=j.steps[idx].id||('idx_'+idx);
    save(); renderJourneys();
  }
  function moveCatalogueJourneyStep(idx,dir){
    const j=activeJourney(); if(!j) return;
    const arr=j.steps; const n=idx+dir;
    if(n<0||n>=arr.length) return;
    const t=arr[idx]; arr[idx]=arr[n]; arr[n]=t;
    save(); renderJourneys();
  }
  function removeCatalogueJourneyStep(idx){
    const j=activeJourney(); if(!j) return;
    j.steps.splice(idx,1); save(); renderJourneys();
  }
  function setCatalogueStepEnemyPool(idx, sel){
    const j=activeJourney(); if(!j||!j.steps[idx]) return;
    j.steps[idx].enemyPoolNpcIds=[...sel.selectedOptions].map(o=>o.value);
    save();
  }
  function setCatalogueStepEnemyTab(idx, tab){
    const j=activeJourney(); if(!j||!j.steps[idx]) return;
    if(!state.meta) state.meta={};
    state.meta['stepEnemyTab_'+(j.steps[idx].id||idx)]=tab;
    save(); renderJourneys();
  }
  function toggleCatalogueStepEnemy(idx, id, on){
    const j=activeJourney(); if(!j||!j.steps[idx]) return;
    const arr=j.steps[idx].enemyPoolNpcIds||(j.steps[idx].enemyPoolNpcIds=[]);
    const i=arr.indexOf(id);
    if(on&&i<0) arr.push(id);
    if(!on&&i>=0) arr.splice(i,1);
    save(); renderJourneys();
  }
  function clearCatalogueStepEnemies(idx){
    const j=activeJourney(); if(!j||!j.steps[idx]) return;
    j.steps[idx].enemyPoolNpcIds=[];
    save(); renderJourneys();
  }
  function setCatalogueStepRewardIds(){ toast('Loot lives on NPC drop tables, not step rewards','info'); }

  /* ===== Assets tab — kit catalogue + Three.js preview (+ chunk / Level Gen 3D) ===== */
  let _assetSel = null;
  let _assetCompose = false;
  let _three = null; // asset orbit viewer
  let _chunkThree = null; // chunk orbit viewer (footprint + props)
  let _pgThree = null; // Level Gen layout orbit viewer
  let _pgOrbitKeep = null; // survive HTML rebuild / dispose

  const LAYOUT_ROLE_HEX = {
    entrance:0x22c55e, exit:0xef4444, objective:0xf59e0b, room:0x6366f1,
    connector:0x94a3b8, deadend:0x78716c, cap:0xa8a29e, filler:0x44403c, boss:0xe11d48,
  };

  function contentPathLabel(uePath){
    const s=String(uePath||'').replace(/\\/g,'/').trim();
    if(!s) return '';
    if(s.startsWith('Content/')) return s;
    if(s.startsWith('/')){
      const parts=s.replace(/^\/+/,'').split('/');
      if(parts.length>=2) return 'Content/'+parts.slice(1).join('/');
      return 'Content/'+(parts[0]||'');
    }
    return 'Content/'+s.replace(/^\/+/,'');
  }
  function toUeContentPath(raw){
    let s=String(raw||'').replace(/\\/g,'/').trim();
    if(!s) return '';
    if(s.startsWith('Content/')) return '/Roguelike/'+s.slice('Content/'.length);
    if(s.startsWith('/')) return s;
    return '/Roguelike/'+s.replace(/^\/+/,'');
  }

  function assetsList(){ return state.chunkAssets || (state.chunkAssets=[]); }
  function selectedAsset(){
    const list=assetsList();
    if(!_assetSel || !list.find(a=>a.id===_assetSel)) _assetSel=list[0]&&list[0].id;
    return list.find(a=>a.id===_assetSel)||null;
  }

  const KIND_COLORS={
    floor:'#84cc16', wall:'#64748b', roof:'#38bdf8', arch:'#f59e0b',
    door:'#a78bfa', column:'#f97316', prop:'#94a3b8', cube:'#94a3b8',
  };

  function _disposeThreeHandle(handle){
    if(!handle) return null;
    cancelAnimationFrame(handle.raf);
    try{
      if(typeof handle.cleanup==='function') handle.cleanup();
      if(handle.meshRoot){
        handle.meshRoot.traverse(o=>{
          if(o.geometry) o.geometry.dispose();
          if(o.material){
            if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose());
            else o.material.dispose();
          }
        });
      }
      if(handle.renderer) handle.renderer.dispose();
      if(handle.el&&handle.renderer&&handle.renderer.domElement.parentNode===handle.el)
        handle.el.removeChild(handle.renderer.domElement);
    }catch(_){}
    return null;
  }
  function disposeAssetViewer(){ _three=_disposeThreeHandle(_three); }
  function disposeChunkViewer(){ _chunkThree=_disposeThreeHandle(_chunkThree); }
  function _stashOrbitKeep(handle){
    if(!handle) return null;
    return {
      yaw:handle.targetYaw!=null?handle.targetYaw:handle.yaw,
      pitch:handle.targetPitch!=null?handle.targetPitch:handle.pitch,
      dist:handle.targetDist!=null?handle.targetDist:handle.dist,
      lookX:handle.targetX!=null?handle.targetX:handle.lookX,
      lookY:handle.targetY!=null?handle.targetY:handle.lookY,
      lookZ:handle.targetZ!=null?handle.targetZ:handle.lookZ,
    };
  }
  function disposeProcgenViewer(){
    if(_pgThree) _pgOrbitKeep=_stashOrbitKeep(_pgThree);
    _pgThree=_disposeThreeHandle(_pgThree);
  }
  function resetProcgenOrbit(){
    _pgOrbitKeep=null;
    _pgThree=_disposeThreeHandle(_pgThree);
  }
  function disposeAllThreeViewers(){ disposeAssetViewer(); disposeChunkViewer(); disposeProcgenViewer(); }

  // One grid cell = one cube (width = length = height). Matches UEFN 512² footprint in preview units.
  const CELL = 1;

  function mat(hex, opts){
    return new THREE.MeshStandardMaterial(Object.assign({ color:hex, roughness:0.72, metalness:0.08 }, opts||{}));
  }

  function buildPreviewMesh(preview, kind, unit){
    const U = (unit!=null && unit>0) ? unit : CELL;
    const g=new THREE.Group();
    const p=String(preview||kind||'prop').toLowerCase();
    if(p==='floor'){
      const t=U*0.08;
      const m=new THREE.Mesh(new THREE.BoxGeometry(U*0.98, t, U*0.98), mat(0x8b7355));
      m.position.y=t*0.5; g.add(m);
    } else if(p==='wall'){
      // Full cell cube — same size up as sideways
      const m=new THREE.Mesh(new THREE.BoxGeometry(U*0.98, U*0.98, U*0.98), mat(0x9ca3af));
      m.position.y=U*0.5; g.add(m);
    } else if(p==='roof'){
      const t=U*0.08;
      const m=new THREE.Mesh(new THREE.BoxGeometry(U*1.02, t, U*1.02), mat(0x64748b));
      m.position.y=U+t*0.5; g.add(m);
    } else if(p==='arch'){
      const col=mat(0xd6b27a);
      const postW=U*0.18, postH=U*0.92, gap=U*0.55;
      const L=new THREE.Mesh(new THREE.BoxGeometry(postW, postH, postW), col); L.position.set(-gap*0.5, postH*0.5, 0); g.add(L);
      const R=new THREE.Mesh(new THREE.BoxGeometry(postW, postH, postW), col); R.position.set(gap*0.5, postH*0.5, 0); g.add(R);
      const lintel=new THREE.Mesh(new THREE.BoxGeometry(gap+postW, U*0.16, postW), col); lintel.position.set(0, postH+U*0.08, 0); g.add(lintel);
      const key=new THREE.Mesh(new THREE.BoxGeometry(U*0.22, U*0.12, postW*1.1), mat(0xf59e0b)); key.position.set(0, postH+U*0.18, 0); g.add(key);
    } else if(p==='door'){
      const frame=mat(0x78716c);
      const h=U*0.85, fw=U*0.1;
      const L=new THREE.Mesh(new THREE.BoxGeometry(fw, h, fw), frame); L.position.set(-U*0.28, h*0.5, 0); g.add(L);
      const R=new THREE.Mesh(new THREE.BoxGeometry(fw, h, fw), frame); R.position.set(U*0.28, h*0.5, 0); g.add(R);
      const top=new THREE.Mesh(new THREE.BoxGeometry(U*0.66, fw, fw), frame); top.position.set(0, h+fw*0.5, 0); g.add(top);
      const leaf=new THREE.Mesh(new THREE.BoxGeometry(U*0.48, h*0.9, U*0.04), mat(0x44403c)); leaf.position.set(0, h*0.45, U*0.02); g.add(leaf);
    } else if(p==='column'){
      const shaftH=U*0.88;
      const shaft=new THREE.Mesh(new THREE.CylinderGeometry(U*0.12, U*0.14, shaftH, 12), mat(0xe7d3a3));
      shaft.position.y=shaftH*0.5+U*0.06; g.add(shaft);
      const base=new THREE.Mesh(new THREE.CylinderGeometry(U*0.2, U*0.22, U*0.08, 12), mat(0xc4a574));
      base.position.y=U*0.04; g.add(base);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(U*0.18, U*0.14, U*0.08, 12), mat(0xc4a574));
      cap.position.y=shaftH+U*0.1; g.add(cap);
    } else {
      const m=new THREE.Mesh(new THREE.BoxGeometry(U*0.45, U*0.45, U*0.45), mat(0x94a3b8));
      m.position.y=U*0.225; g.add(m);
    }
    return g;
  }

  function buildComposeRoom(){
    const U=CELL;
    const g=new THREE.Group();
    const floorMat=mat(0x8b7355), wallMat=mat(0x9ca3af), roofMat=mat(0x64748b);
    for(let z=-1.5;z<=1.5;z++) for(let x=-1.5;x<=1.5;x++){
      const f=new THREE.Mesh(new THREE.BoxGeometry(U*0.95, U*0.06, U*0.95), floorMat);
      f.position.set(x*U, U*0.03, z*U); g.add(f);
    }
    for(let i=-2;i<=2;i++){
      const n=new THREE.Mesh(new THREE.BoxGeometry(U*0.95, U, U*0.12), wallMat); n.position.set(i*U, U*0.5, -2.05*U); g.add(n);
      const s=new THREE.Mesh(new THREE.BoxGeometry(U*0.95, U, U*0.12), wallMat); s.position.set(i*U, U*0.5, 2.05*U); g.add(s);
      const e=new THREE.Mesh(new THREE.BoxGeometry(U*0.12, U, U*0.95), wallMat); e.position.set(2.05*U, U*0.5, i*U); g.add(e);
      const w=new THREE.Mesh(new THREE.BoxGeometry(U*0.12, U, U*0.95), wallMat); w.position.set(-2.05*U, U*0.5, i*U); g.add(w);
    }
    const archN=buildPreviewMesh('arch', 'arch', U); archN.position.set(0,0,-2.05*U); g.add(archN);
    const archS=buildPreviewMesh('arch', 'arch', U); archS.rotation.y=Math.PI; archS.position.set(0,0,2.05*U); g.add(archS);
    const roof=new THREE.Mesh(new THREE.BoxGeometry(4.4*U, U*0.08, 4.4*U), roofMat);
    roof.position.y=U+U*0.04; g.add(roof);
    [[-1.2,-1.2],[1.2,-1.2],[-1.2,1.2],[1.2,1.2]].forEach(([x,z])=>{
      const c=buildPreviewMesh('column','column',U); c.position.set(x*U,0,z*U); g.add(c);
    });
    return g;
  }

  function _orbitFitFromRoot(meshRoot, camera, aspect){
    const box=new THREE.Box3().setFromObject(meshRoot);
    const sphere=new THREE.Sphere();
    if(box.isEmpty()){
      sphere.center.set(0, 0.55, 0);
      sphere.radius=2;
    } else {
      box.getBoundingSphere(sphere);
      sphere.radius=Math.max(0.5, sphere.radius);
    }
    const fovV=THREE.MathUtils.degToRad(camera.fov);
    const fovH=2*Math.atan(Math.tan(fovV*0.5)*Math.max(0.2, aspect));
    const half=Math.min(fovV, fovH)*0.5;
    const fitDist=(sphere.radius/Math.max(1e-4, Math.sin(half)))*1.2;
    return {
      center: sphere.center.clone(),
      radius: sphere.radius,
      fitDist: Math.max(2.2, fitDist),
      minDist: Math.max(0.5, sphere.radius*0.25),
      maxDist: Math.max(8, sphere.radius*8, fitDist*2.5),
    };
  }

  function mountOrbitViewer(slotSetter, el, opts){
    const o=opts||{};
    if(!el || typeof THREE==='undefined'){
      if(el) el.innerHTML=`<div class="text-xs text-amber-400 p-4">Three.js not loaded — check CDN.</div>`;
      return null;
    }
    el.innerHTML='';
    const w=Math.max(280, el.clientWidth||420), h=Math.max(260, el.clientHeight||320);
    const renderer=new THREE.WebGLRenderer({ antialias:true, alpha:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x0b1220, 1);
    const canvas=renderer.domElement;
    canvas.style.width='100%';
    canvas.style.height='100%';
    canvas.style.display='block';
    canvas.style.cursor='grab';
    canvas.style.touchAction='none';
    el.appendChild(canvas);
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(42, w/h, 0.1, 2000);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key=new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(3, 6, 2); scene.add(key);
    const fill=new THREE.DirectionalLight(0x93c5fd, 0.35);
    fill.position.set(-4, 2, -2); scene.add(fill);
    let gridHelper=new THREE.GridHelper(Math.max(8, Math.ceil(o.gridSize||8)), Math.max(8, Math.ceil(o.gridSize||8)), 0x334155, 0x1e293b);
    scene.add(gridHelper);
    let meshRoot=typeof o.buildRoot==='function'?o.buildRoot():new THREE.Group();
    scene.add(meshRoot);

    const fit=_orbitFitFromRoot(meshRoot, camera, w/h);
    const initYaw=o.yaw!=null?o.yaw:0.55;
    const initPitch=o.pitch!=null?o.pitch:0.42;
    const initDist=o.dist!=null?o.dist:fit.fitDist;
    const initTX=o.lookX!=null?o.lookX:fit.center.x;
    const initTY=o.lookY!=null?o.lookY:(fit.center.y||0.55);
    const initTZ=o.lookZ!=null?o.lookZ:fit.center.z;

    const handle={
      renderer, scene, camera, meshRoot, raf:0, el, gridHelper,
      // smoothed (rendered)
      yaw:initYaw, pitch:initPitch, dist:initDist,
      lookX:initTX, lookY:initTY, lookZ:initTZ,
      // targets (OrbitControls-style damping)
      targetYaw:initYaw, targetPitch:initPitch, targetDist:initDist,
      targetX:initTX, targetY:initTY, targetZ:initTZ,
      minDist:fit.minDist, maxDist:fit.maxDist,
      dragging:false, panning:false, lx:0, ly:0,
      cleanup:null,
      fitToBounds:null, replaceRoot:null,
    };

    handle.fitToBounds=()=>{
      const f=_orbitFitFromRoot(handle.meshRoot, camera, camera.aspect||1);
      handle.minDist=f.minDist;
      handle.maxDist=f.maxDist;
      handle.targetX=f.center.x;
      handle.targetY=f.center.y;
      handle.targetZ=f.center.z;
      handle.targetDist=Math.max(handle.minDist, Math.min(handle.maxDist, f.fitDist));
      const gSize=Math.max(8, Math.ceil(f.radius*2+4));
      if(handle.gridHelper){
        scene.remove(handle.gridHelper);
        handle.gridHelper.geometry&&handle.gridHelper.geometry.dispose();
        handle.gridHelper.material&&handle.gridHelper.material.dispose();
      }
      handle.gridHelper=new THREE.GridHelper(gSize, gSize, 0x334155, 0x1e293b);
      scene.add(handle.gridHelper);
    };

    handle.replaceRoot=(newRoot)=>{
      if(handle.meshRoot){
        scene.remove(handle.meshRoot);
        handle.meshRoot.traverse(o=>{
          if(o.geometry) o.geometry.dispose();
          if(o.material){
            if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose());
            else o.material.dispose();
          }
        });
      }
      handle.meshRoot=newRoot||new THREE.Group();
      scene.add(handle.meshRoot);
    };

    const onDown=e=>{
      handle.dragging=true;
      handle.panning=(e.button===2)||e.shiftKey||e.altKey;
      handle.lx=e.clientX; handle.ly=e.clientY;
      canvas.style.cursor=handle.panning?'move':'grabbing';
      try{ canvas.setPointerCapture(e.pointerId); }catch(_){}
      e.preventDefault();
    };
    const onUp=e=>{
      handle.dragging=false; handle.panning=false;
      canvas.style.cursor='grab';
      try{ if(e&&e.pointerId!=null) canvas.releasePointerCapture(e.pointerId); }catch(_){}
    };
    const onMove=e=>{
      if(!handle.dragging) return;
      const dx=e.clientX-handle.lx, dy=e.clientY-handle.ly;
      handle.lx=e.clientX; handle.ly=e.clientY;
      if(handle.panning){
        // Truck in camera plane (OrbitControls pan)
        const panScale=handle.targetDist*0.0018;
        const cosY=Math.cos(handle.targetYaw), sinY=Math.sin(handle.targetYaw);
        handle.targetX+=(-dx*cosY - dy*Math.sin(handle.targetPitch)*sinY)*panScale;
        handle.targetZ+=(-dx*sinY + dy*Math.sin(handle.targetPitch)*cosY)*panScale;
        handle.targetY+=(dy*Math.cos(handle.targetPitch))*panScale;
      } else {
        handle.targetYaw+=dx*0.01;
        handle.targetPitch=Math.max(-0.15, Math.min(1.35, handle.targetPitch+dy*0.01));
      }
    };
    const onWheel=e=>{
      e.preventDefault();
      // Exponential dolly — constant feel at any scale (camera-controls / OrbitControls)
      const next=handle.targetDist*Math.pow(0.95, -e.deltaY/53);
      handle.targetDist=Math.max(handle.minDist, Math.min(handle.maxDist, next));
    };
    const onDbl=e=>{
      e.preventDefault();
      handle.fitToBounds();
    };
    const onContext=e=>e.preventDefault();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('wheel', onWheel, {passive:false});
    canvas.addEventListener('dblclick', onDbl);
    canvas.addEventListener('contextmenu', onContext);
    handle.cleanup=()=>{
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('contextmenu', onContext);
    };

    // If caller didn't pass dist, auto-frame
    if(o.dist==null && o.autoFit!==false){
      handle.targetDist=fit.fitDist;
      handle.dist=fit.fitDist;
      handle.minDist=fit.minDist;
      handle.maxDist=fit.maxDist;
    } else {
      handle.minDist=Math.min(handle.minDist, initDist*0.25);
      handle.maxDist=Math.max(handle.maxDist, initDist*4);
    }

    const DAMP=0.14; // SmoothDamp-ish lerp (OrbitControls enableDamping)
    const tick=()=>{
      const nw=Math.max(280, el.clientWidth||w), nh=Math.max(260, el.clientHeight||h);
      const pr=renderer.getPixelRatio();
      if(Math.abs(nw-renderer.domElement.width/pr)>2 || Math.abs(nh-renderer.domElement.height/pr)>2){
        renderer.setSize(nw, nh, false);
        camera.aspect=nw/nh; camera.updateProjectionMatrix();
      }
      handle.yaw+=(handle.targetYaw-handle.yaw)*DAMP;
      handle.pitch+=(handle.targetPitch-handle.pitch)*DAMP;
      handle.dist+=(handle.targetDist-handle.dist)*DAMP;
      handle.lookX+=(handle.targetX-handle.lookX)*DAMP;
      handle.lookY+=(handle.targetY-handle.lookY)*DAMP;
      handle.lookZ+=(handle.targetZ-handle.lookZ)*DAMP;
      // Compat: lookY scalar used by older remount keep
      handle.lookY=handle.lookY;
      const cp=Math.cos(handle.pitch), sp=Math.sin(handle.pitch);
      const cy=Math.cos(handle.yaw), sy=Math.sin(handle.yaw);
      camera.position.x=handle.lookX+cy*cp*handle.dist;
      camera.position.y=handle.lookY+sp*handle.dist;
      camera.position.z=handle.lookZ+sy*cp*handle.dist;
      camera.lookAt(handle.lookX, handle.lookY, handle.lookZ);
      camera.near=Math.max(0.05, handle.dist*0.01);
      camera.far=Math.max(200, handle.dist*20+100);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      handle.raf=requestAnimationFrame(tick);
    };
    if(typeof slotSetter==='function') slotSetter(handle);
    tick();
    return handle;
  }

  function mountAssetViewer(el, asset){
    disposeAssetViewer();
    mountOrbitViewer(h=>{ _three=h; }, el, {
      buildRoot:()=>_assetCompose?buildComposeRoom():buildPreviewMesh(asset&&asset.preview, asset&&asset.kind),
      dist:_assetCompose?7.2:4.2,
      lookY:_assetCompose?0.5:0.55,
      gridSize:_assetCompose?10:8,
    });
  }

  function _rotCell(x, y, cw, ch, rot){
    rot=((rot%360)+360)%360;
    if(rot===90) return {x:ch-1-y, y:x};
    if(rot===180) return {x:cw-1-x, y:ch-1-y};
    if(rot===270) return {x:y, y:cw-1-x};
    return {x, y};
  }

  function buildChunkMesh3D(chunk, rot){
    const root=new THREE.Group();
    if(typeof THREE==='undefined'||!chunk) return root;
    const U=CELL; // cubic voxel: width = depth = height per story
    const stories=Math.max(1, Math.min(16, +(chunk.cz||chunk.stories)||1));
    const raw=chunk.grid||[];
    const g=(typeof rotateGridJs==='function')?rotateGridJs(raw, rot||0):raw;
    const ch=g.length, cw=(g[0]||[]).length;
    if(!cw||!ch) return root;
    const ox=-(cw-1)*0.5*U, oz=-(ch-1)*0.5*U;
    const floorMat=mat(0x8b7355), wallMat=mat(0x9ca3af);
    const doorFloor=mat(0xd4a017);
    const ledgeMat=mat(0x38bdf8, { transparent:true, opacity:0.85 });
    const floorT=U*0.08;
    let solidN=0;
    for(let story=0; story<stories; story++){
      const yBase=story*U;
      for(let y=0;y<ch;y++) for(let x=0;x<cw;x++){
        const t=g[y][x]||'empty';
        if(t==='empty') continue;
        const wx=ox+x*U, wz=oz+y*U;
        if(t==='wall'){
          const m=new THREE.Mesh(new THREE.BoxGeometry(U*0.96, U*0.96, U*0.96), wallMat);
          m.position.set(wx, yBase+U*0.5, wz); root.add(m);
          solidN++;
        } else if(t==='door'){
          // Door arch only on ground story; upper stories keep open volume + floor
          const f=new THREE.Mesh(new THREE.BoxGeometry(U*0.96, floorT, U*0.96), story===0?doorFloor:floorMat);
          f.position.set(wx, yBase+floorT*0.5, wz); root.add(f);
          if(story===0){
            const arch=buildPreviewMesh('arch', 'arch', U);
            let yaw=0;
            if(y===0) yaw=Math.PI;
            else if(y===ch-1) yaw=0;
            else if(x===0) yaw=Math.PI/2;
            else if(x===cw-1) yaw=-Math.PI/2;
            arch.rotation.y=yaw;
            arch.position.set(wx, yBase, wz);
            root.add(arch);
          } else {
            const edge=new THREE.LineSegments(
              new THREE.EdgesGeometry(new THREE.BoxGeometry(U*0.96, U*0.96, U*0.96)),
              new THREE.LineBasicMaterial({ color:0x334155, transparent:true, opacity:0.3 })
            );
            edge.position.set(wx, yBase+U*0.5, wz);
            root.add(edge);
          }
          solidN++;
        } else {
          const f=new THREE.Mesh(new THREE.BoxGeometry(U*0.96, floorT, U*0.96), floorMat);
          f.position.set(wx, yBase+floorT*0.5, wz); root.add(f);
          const edge=new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(U*0.96, U*0.96, U*0.96)),
            new THREE.LineBasicMaterial({ color:0x334155, transparent:true, opacity:0.35 })
          );
          edge.position.set(wx, yBase+U*0.5, wz);
          root.add(edge);
          solidN++;
        }
      }
    }
    // Elevated open ports (ledges / high doors) as balcony slabs at height_step
    (chunk.ports||[]).forEach(p=>{
      if(!p) return;
      const kind=String(p.kind||'').toLowerCase();
      if(kind!=='ledge'&&kind!=='window'&&kind!=='door'&&kind!=='open') return;
      const hz=+(p.height_step!=null?p.height_step:p.z)||0;
      if(hz<=0 && kind!=='ledge' && kind!=='window') return;
      const rr=_rotCell(+p.x||0, +p.y||0, chunk.cw||cw, chunk.ch||ch, rot||0);
      const slab=new THREE.Mesh(new THREE.BoxGeometry(U*0.7, U*0.06, U*0.28), ledgeMat);
      let face=String(p.face||'N').toUpperCase();
      const o=['N','E','S','W'];
      const fi=o.indexOf(face);
      if(fi>=0 && rot) face=o[(fi+((rot||0)/90))%4];
      const off=U*0.42;
      let dx=0, dz=0, yaw=0;
      if(face==='N'){ dz=-off; yaw=0; }
      else if(face==='S'){ dz=off; yaw=Math.PI; }
      else if(face==='E'){ dx=off; yaw=-Math.PI/2; }
      else { dx=-off; yaw=Math.PI/2; }
      slab.rotation.y=yaw;
      const storyY=Math.max(0, hz)*U + U*0.55;
      slab.position.set(ox+rr.x*U+dx, storyY, oz+rr.y*U+dz);
      root.add(slab);
    });
    if(chunk.roof && solidN){
      const roofT=U*0.08;
      const roof=new THREE.Mesh(
        new THREE.BoxGeometry(cw*U*0.98, roofT, ch*U*0.98),
        mat(0x64748b, { transparent:true, opacity:0.55 })
      );
      roof.position.set(0, stories*U+roofT*0.5, 0);
      root.add(roof);
    }
    (chunk.slots||[]).forEach(s=>{
      const rr=_rotCell(+s.x||0, +s.y||0, chunk.cw||cw, chunk.ch||ch, rot||0);
      const col=String(s.group||'').toUpperCase()==='A'?0x34d399:0xf472b6;
      const m=new THREE.Mesh(new THREE.CylinderGeometry(U*0.16, U*0.16, U*0.1, 10), mat(col));
      m.position.set(ox+rr.x*U, U*0.12, oz+rr.y*U);
      root.add(m);
    });
    const byId={};
    (state.chunkAssets||[]).forEach(a=>{ if(a&&a.id) byId[a.id]=a; });
    (chunk.props||[]).forEach(pr=>{
      if(!pr) return;
      const rr=_rotCell(+pr.x||0, +pr.y||0, chunk.cw||cw, chunk.ch||ch, rot||0);
      const asset=byId[pr.assetId]||null;
      const preview=(asset&&(asset.preview||asset.kind))||'column';
      const mesh=buildPreviewMesh(preview, asset&&asset.kind, U);
      const yawDeg=(+pr.yaw||0)+(+rot||0);
      mesh.rotation.y=yawDeg*Math.PI/180;
      mesh.position.set(ox+rr.x*U, 0, oz+rr.y*U);
      root.add(mesh);
    });
    return root;
  }

  function mountChunkViewer(chunk, rot){
    const el=document.getElementById('rgdChunkView3d');
    if(!el) return;
    const prev=_chunkThree;
    const keep=prev?{
      yaw:prev.targetYaw!=null?prev.targetYaw:prev.yaw,
      pitch:prev.targetPitch!=null?prev.targetPitch:prev.pitch,
      dist:prev.targetDist!=null?prev.targetDist:prev.dist,
      lookX:prev.targetX!=null?prev.targetX:prev.lookX,
      lookY:prev.targetY!=null?prev.targetY:prev.lookY,
      lookZ:prev.targetZ!=null?prev.targetZ:prev.lookZ,
    }:null;
    disposeChunkViewer();
    const cw=Math.max(1, +(chunk&&chunk.cw)||2), ch=Math.max(1, +(chunk&&chunk.ch)||2);
    const cz=Math.max(1, +(chunk&&chunk.cz)||1);
    const span=Math.max(cw, ch, cz, 1)*CELL;
    mountOrbitViewer(h=>{
      _chunkThree=h;
      if(keep&&keep.yaw!=null){
        h.yaw=h.targetYaw=keep.yaw;
        h.pitch=h.targetPitch=keep.pitch;
        h.dist=h.targetDist=keep.dist;
        if(keep.lookX!=null){ h.lookX=h.targetX=keep.lookX; h.lookY=h.targetY=keep.lookY; h.lookZ=h.targetZ=keep.lookZ; }
      }
    }, el, {
      buildRoot:()=>buildChunkMesh3D(chunk, rot||0),
      dist: Math.max(4.5, span*1.35+CELL*2.2),
      lookY: cz*CELL*0.5,
      pitch: 0.55,
      gridSize: Math.max(8, Math.ceil(Math.max(cw, ch, cz)+4)),
    });
  }

  function refreshChunkThree(chunk, rot){
    if(!document.getElementById('rgdChunkView3d')) return;
    mountChunkViewer(chunk, rot);
  }

  function buildLayoutMesh3D(result, stageIdx, demoIdx){
    const root=new THREE.Group();
    if(typeof THREE==='undefined'||!result||!result.ok) return root;
    const U=CELL;
    const trace=result.trace||[];
    const stage=trace[stageIdx!=null?stageIdx:trace.length-1]||trace[trace.length-1]||{};
    const placements=stage.placements||result.layout||[];
    const w=Math.max(1, +(result.w)||1), h=Math.max(1, +(result.h)||1);
    const ox=-(w-1)*0.5*U, oz=-(h-1)*0.5*U;
    const byId={};
    (state.chunks||[]).forEach(c=>{ if(c&&c.id) byId[c.id]=c; });

    // ponytail: full per-cell mesh ok under ~4000 cells; above that one box/placement
    let cellEst=0;
    placements.forEach(p=>{
      const ch=byId[p.chunkId];
      cellEst+=(ch?(+(ch.cw)||1)*(+(ch.ch)||1)*(+(ch.cz)||1):(+p.cw||1)*(+p.ch||1));
    });
    const detail=cellEst<=4000;

    placements.forEach(p=>{
      if(!p) return;
      const ch=byId[p.chunkId];
      const cw=Math.max(1, +(p.cw)||(ch&&ch.cw)||1);
      const chh=Math.max(1, +(p.ch)||(ch&&ch.ch)||1);
      const cz=Math.max(1, +(ch&&ch.cz)||1);
      const cx=+(p.cx)||0, cy=+(p.cy)||0;
      const wx=ox+(cx+(cw-1)*0.5)*U;
      const wz=oz+(cy+(chh-1)*0.5)*U;
      const roleHex=LAYOUT_ROLE_HEX[p.role]||0x6366f1;
      const slab=new THREE.Mesh(
        new THREE.BoxGeometry(cw*U*0.98, U*0.05, chh*U*0.98),
        mat(roleHex, { transparent:true, opacity:0.4 })
      );
      slab.position.set(wx, U*0.025, wz);
      root.add(slab);

      if(detail && ch){
        const mesh=buildChunkMesh3D(ch, p.rot||0);
        mesh.position.set(wx, 0, wz);
        root.add(mesh);
      } else {
        const box=new THREE.Mesh(
          new THREE.BoxGeometry(cw*U*0.9, cz*U*0.85, chh*U*0.9),
          mat(roleHex, { transparent:true, opacity:0.55 })
        );
        box.position.set(wx, cz*U*0.42, wz);
        root.add(box);
      }
    });

    const path=result.mainPath||[];
    if(path.length>1){
      const pts=path.map(pt=>new THREE.Vector3(ox+(+pt[0]||0)*U, U*0.22, oz+(+pt[1]||0)*U));
      const geo=new THREE.BufferGeometry().setFromPoints(pts);
      root.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color:0x38bdf8 })));
    }
    if(path.length && demoIdx!=null && demoIdx>=0){
      const pt=path[Math.min(demoIdx, path.length-1)];
      if(pt){
        const m=new THREE.Mesh(new THREE.SphereGeometry(U*0.28, 12, 12), mat(0xfef08a));
        m.position.set(ox+(+pt[0]||0)*U, U*0.35, oz+(+pt[1]||0)*U);
        root.add(m);
      }
    }

    const grid=result.grid;
    if(grid&&grid._sparse&&grid.cells){
      Object.keys(grid.cells).forEach(k=>{
        const ent=grid.cells[k].entity; if(!ent) return;
        const [x,y]=k.split(',').map(Number);
        const col=ent.kind==='npc'?0xf472b6:0x34d399;
        const sph=new THREE.Mesh(new THREE.SphereGeometry(U*0.16, 10, 10), mat(col));
        sph.position.set(ox+x*U, U*0.32, oz+y*U);
        root.add(sph);
      });
    }
    return root;
  }

  function mountProcgenViewer(result, stageIdx, demoIdx){
    const el=document.getElementById('rgdProcgenView3d');
    if(!el) return;
    // Stage scrub: same DOM node → swap mesh only, keep orbit
    if(_pgThree && _pgThree.el===el && typeof _pgThree.replaceRoot==='function'){
      _pgThree.replaceRoot(buildLayoutMesh3D(result, stageIdx, demoIdx));
      return;
    }
    const keep=_pgThree?_stashOrbitKeep(_pgThree):_pgOrbitKeep;
    disposeProcgenViewer();
    const w=Math.max(1, +(result&&result.w)||8), h=Math.max(1, +(result&&result.h)||8);
    mountOrbitViewer(hnd=>{
      _pgThree=hnd;
      if(keep&&keep.yaw!=null){
        hnd.yaw=hnd.targetYaw=keep.yaw;
        hnd.pitch=hnd.targetPitch=keep.pitch;
        hnd.dist=hnd.targetDist=keep.dist;
        if(keep.lookX!=null){
          hnd.lookX=hnd.targetX=keep.lookX;
          hnd.lookY=hnd.targetY=keep.lookY;
          hnd.lookZ=hnd.targetZ=keep.lookZ;
        }
        _pgOrbitKeep=keep;
      } else if(typeof hnd.fitToBounds==='function'){
        hnd.fitToBounds();
        _pgOrbitKeep=_stashOrbitKeep(hnd);
      }
    }, el, {
      buildRoot:()=>buildLayoutMesh3D(result, stageIdx, demoIdx),
      pitch: 0.7,
      yaw: 0.85,
      autoFit: !(keep&&keep.yaw!=null),
      gridSize: Math.max(12, Math.ceil(Math.max(w, h)+6)),
    });
  }

  function refreshProcgenThree(result, stageIdx, demoIdx){
    if(!document.getElementById('rgdProcgenView3d')) return;
    mountProcgenViewer(result, stageIdx, demoIdx);
  }

  function assetsHostEl(){
    return document.getElementById('tab-assets') || document.getElementById('levelsSubHost');
  }
  function renderAssets(){
    const list=assetsList();
    const a=selectedAsset();
    const host=assetsHostEl();
    if(!host) return;
    disposeAllThreeViewers();
    const kinds=['floor','wall','roof','arch','door','column','prop'];
    const items=list.map(ch=>{
      const col=KIND_COLORS[ch.kind]||KIND_COLORS.prop;
      const cp=ch.contentPath||contentPathLabel(ch.assetPath);
      return `<button onclick="RGD.selectAsset('${ch.id}')" class="w-full text-left px-3 py-2 rounded-lg border mb-1.5 ${ch.id===_assetSel?'border-amber-500 bg-amber-600/15':'border-gray-700 bg-gray-800 hover:bg-gray-750'}">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-white font-medium truncate">${esc(ch.name||ch.id)}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded" style="background:${col}33;color:${col}">${esc(ch.kind||'prop')}</span>
        </div>
        <div class="text-[10px] text-gray-500 mt-0.5 font-mono truncate" title="${esc(cp)}">${esc(cp||'(no Content path)')}${ch.source==='uefn'?' · UEFN':''}</div>
      </button>`;
    }).join('')||`<div class="text-xs text-gray-500 p-3">No assets yet.</div>`;

    host.innerHTML=`
      <div class="mb-3 rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100/90">
        <b class="text-amber-200">Assets</b> — manage every floor / wall / roof / arch / door / column here.
        Place them on chunks via <button onclick="RGD.go('levels');RGD.setLevelsSubtab('chunks')" class="underline text-white">Levels → Chunks → Prop</button> (3D view shows them).
      </div>
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <button onclick="RGD.syncAssetsFromUeFn()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-1.5"><i data-lucide="download" class="w-4 h-4"></i> Sync from UEFN Content</button>
        <button onclick="RGD.newKitAsset()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-1.5"><i data-lucide="plus" class="w-4 h-4"></i> New asset</button>
        <button onclick="RGD.toggleAssetCompose()" class="px-3 py-2 rounded-lg text-sm ${_assetCompose?'bg-amber-600 text-white':'bg-gray-700 hover:bg-gray-600'}">Compose room (kit)</button>
        <div class="flex-1"></div>
        <span class="text-xs text-gray-500">${list.length} assets · Content/… paths</span>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4" style="min-height:420px">
        <div class="lg:col-span-1 bg-gray-800/50 border border-gray-700 rounded-xl p-3 overflow-y-auto max-h-[70vh]">${items}</div>
        <div class="lg:col-span-2 bg-gray-800 border border-gray-700 rounded-xl p-4">
          ${a?`
            <div class="flex flex-wrap items-start gap-3 mb-3">
              <div class="flex-1 min-w-[200px]">
                <div class="text-lg font-semibold text-white">${esc(a.name)}</div>
                <div class="text-[11px] text-gray-500 font-mono">${esc(a.id)} · preview:${esc(a.preview||a.kind||'?')}</div>
              </div>
              <button onclick="RGD.deleteAsset('${a.id}')" class="px-2 py-1.5 rounded-lg bg-gray-700 hover:bg-red-600 text-xs"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3 text-xs">
              <label class="text-gray-400">Name<input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${esc(a.name||'')}" onchange="RGD.updateAssetField('name',this.value)"/></label>
              <label class="text-gray-400">Kind<select class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" onchange="RGD.updateAssetField('kind',this.value)">${kinds.map(k=>`<option value="${k}" ${(a.kind||'prop')===k?'selected':''}>${k}</option>`).join('')}</select></label>
              <label class="text-gray-400">Preview<select class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" onchange="RGD.updateAssetField('preview',this.value)">${['floor','wall','roof','arch','door','column','cube'].map(k=>`<option value="${k}" ${(a.preview||a.kind||'cube')===k?'selected':''}>${k}</option>`).join('')}</select></label>
              <label class="text-gray-400 col-span-2 md:col-span-3">Content path
                <input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white font-mono text-[11px]" value="${esc(a.contentPath||contentPathLabel(a.assetPath))}" onchange="RGD.updateAssetField('assetPath',RGD.toUeContentPath(this.value))" placeholder="Content/Meshes/SM_…"/>
                <div class="text-[10px] text-gray-500 mt-1">UEFN mount: <span class="font-mono text-gray-400">${esc(a.assetPath||'—')}</span> · must live under project Content/</div>
              </label>
            </div>
            <div class="text-[11px] text-gray-500 mb-1">3D canvas · drag to rotate · scroll to zoom</div>
            <div id="rgdAssetView" class="rounded-xl border border-gray-700 overflow-hidden bg-[#0b1220]" style="height:420px;cursor:grab"></div>
            <div class="text-[10px] text-gray-500 mt-2">Orbit this mesh, then place it on a chunk (Levels → Chunks → Prop → 3D orbit tab).</div>
          `:`<div class="py-16 text-center text-gray-500 text-sm">Select an asset</div>`}
        </div>
      </div>`;
    if(typeof lucide!=='undefined') lucide.createIcons();
    if(a){
      requestAnimationFrame(()=>{
        const el=document.getElementById('rgdAssetView');
        mountAssetViewer(el, a);
      });
    }
  }

  function selectAsset(id){ _assetSel=id; renderAssets(); }
  function toggleAssetCompose(){ _assetCompose=!_assetCompose; renderAssets(); }

  function updateAssetField(key, val){
    const a=selectedAsset(); if(!a) return;
    if(key==='assetPath'){
      a.assetPath=toUeContentPath(val);
      a.contentPath=contentPathLabel(a.assetPath);
    } else if(key==='kind'){
      a.kind=val;
      if(!a.preview || a.preview===a.kind) a.preview=val==='prop'?'cube':val;
    } else {
      a[key]=val;
    }
    save({flush:true});
    bridge.call('upsert_chunk_asset',{
      id:a.id, name:a.name, asset_path:a.assetPath||'', kind:a.kind||'prop', preview:a.preview||a.kind||'prop'
    });
    renderAssets();
  }

  function newKitAsset(){
    const id='ast_'+Date.now().toString(36);
    const rec={id, name:'New Wall', assetPath:'/Roguelike/Meshes/SM_TileWall', contentPath:'Content/Meshes/SM_TileWall', kind:'wall', preview:'wall', source:'catalogue'};
    assetsList().push(rec);
    _assetSel=id;
    save({flush:true});
    bridge.call('upsert_chunk_asset',{id, name:rec.name, asset_path:rec.assetPath, kind:'wall', preview:'wall'});
    renderAssets();
  }

  async function deleteAsset(id){
    if(!confirm('Remove asset '+id+' from catalogue?')) return;
    state.chunkAssets=assetsList().filter(a=>a.id!==id);
    save({flush:true});
    renderAssets();
    toast('Removed','ok');
  }

  async function syncAssetsFromUeFn(){
    toast('Scanning UEFN Content meshes…','info');
    // Prefer raw so we don't mask unknown-tool after a plugin update without process restart.
    let r=await bridge.raw('rgd_sync_chunk_assets_from_uefn',{search:'SM_', limit:80});
    if(r===undefined) r=await bridge.call('sync_chunk_assets_from_uefn',{search:'SM_', limit:80});
    if(r&&r.error){
      const msg=String(r.error);
      if(/unknown tool/i.test(msg)){
        toast('Sync tool not loaded — fully quit UEFN-Ducky and reopen (panel reload is not enough)','err');
      } else toast(msg,'err');
      return;
    }
    const st=await bridge.raw('rgd_get_state',{});
    if(st&&Array.isArray(st.chunkAssets)) state.chunkAssets=st.chunkAssets;
    renderAssets();
    toast('Synced +'+(r&&r.added||0)+' / ~'+(r&&r.updated||0)+' · total '+(r&&r.total||assetsList().length),'ok');
  }

  /* ======================================================================
     UI SCREENS — 01 · DESIGN TOKENS
     One palette + one type scale for every screen. Screens never hardcode a
     colour: they reference a token id, so re-theming the whole game is a single
     edit here (or in the Theme editor) instead of 25 screen edits.
     Tokens are emitted into Verse as MakeColorFromHex("RRGGBB"), so what the
     preview shows and what UEFN renders come from the same hex string.
     ====================================================================== */

  const UI_STAGE_W = 1920, UI_STAGE_H = 1080;

  const UI_DEFAULT_THEME = {
    id:'theme_chronomancer', name:'Chronomancer (default)',
    colors:{
      /* surfaces */
      bg:'#05070E', scrim:'#05070E', panel:'#101725', panelAlt:'#18202F', panelDeep:'#0A0F1A',
      stroke:'#2C3A52', strokeHot:'#C9A227', row:'#151D2C', rowHover:'#1E2839',
      /* text */
      text:'#E8EDF7', textDim:'#93A1BA', textMute:'#5D6B85', textInk:'#05070E',
      /* brand + intent */
      accent:'#4C8DFF', accentAlt:'#7C5CFF', gold:'#F2C14E',
      ok:'#35D07F', warn:'#FFB020', danger:'#FF4D4D',
      hp:'#E5484D', shield:'#4C8DFF', xp:'#7C5CFF',
      /* rarity */
      rarityCommon:'#9AA7BD', rarityRare:'#4C8DFF', rarityEpic:'#A855F7', rarityLegendary:'#F2C14E',
      /* elements — match the Wizardry tab */
      elemFire:'#FF6A2B', elemIce:'#59D5FF', elemLightning:'#FFD166', elemVoid:'#A855F7', elemTime:'#C9A227',
      /* currencies — match the Currencies tab */
      curTimeEssence:'#59D5FF', curSandGrain:'#F2C14E',
    },
    /* px at 1080p — Verse text sizes assume a 1080p reference, same as ours */
    type:{ display:64, h1:44, h2:32, h3:24, body:18, small:15, tiny:12 },
    space:{ xs:8, sm:12, md:16, lg:24, xl:32, xxl:48 },
    /* Verse UI has no corner radius or stroke: a "border" is a color_block behind
       a slightly smaller color_block. strokeW is how thick that reveal is. */
    strokeW:2,
    opacity:{ scrim:0.72, panel:0.96, rowIdle:0.55, disabled:0.35 },
  };

  function uiTheme(){
    const t = state.uiTheme;
    if(!t || !t.colors) return UI_DEFAULT_THEME;
    return {
      ...UI_DEFAULT_THEME, ...t,
      colors:{ ...UI_DEFAULT_THEME.colors, ...(t.colors||{}) },
      type:{ ...UI_DEFAULT_THEME.type, ...(t.type||{}) },
      space:{ ...UI_DEFAULT_THEME.space, ...(t.space||{}) },
      opacity:{ ...UI_DEFAULT_THEME.opacity, ...(t.opacity||{}) },
    };
  }
  /* Colours are stored as a token id ("accent") or a literal "#RRGGBB". */
  function uiColor(v){
    if(!v) return '#FFFFFF';
    if(v.charAt(0)==='#') return v.toUpperCase();
    const c=uiTheme().colors[v];
    return (c||'#FFFFFF').toUpperCase();
  }
  function uiHex6(v){ return uiColor(v).replace('#','').slice(0,6); }
  function uiRgba(v,a){
    const h=uiHex6(v);
    const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
    return `rgba(${r},${g},${b},${a==null?1:a})`;
  }
  function uiSize(v){
    if(typeof v==='number') return v;
    const t=uiTheme();
    return t.type[v] || t.space[v] || parseFloat(v) || 0;
  }
  const UI_COLOR_TOKENS = Object.keys(UI_DEFAULT_THEME.colors);
  const UI_TYPE_TOKENS  = Object.keys(UI_DEFAULT_THEME.type);

  /* ======================================================================
     UI SCREENS — 02 · WIDGET MODEL
     Every node maps 1:1 onto a Verse UI widget, and every slot field maps 1:1
     onto a Verse slot field. Nothing in this model can be drawn in the preview
     that cannot be emitted as Verse — that is the whole point of the tab.

       node  = { id, type, name, bind?, note?, slot{}, props{}, children[] }
       slot  = canvas parent : aMin[x,y] aMax[x,y] off[l,t,r,b] align[x,y] z stc
               overlay/stack : h v pad[l,t,r,b] dist
     A slot object always carries BOTH field sets; the parent decides which half
     is read, so the same node can be dropped into a canvas or a stack unchanged.
     ====================================================================== */

  const UI_TYPES = {
    canvas:   { label:'Canvas',    icon:'square-dashed-bottom', container:true,  verse:'canvas' },
    overlay:  { label:'Overlay',   icon:'layers',               container:true,  verse:'overlay' },
    stack:    { label:'Stack Box', icon:'rows-3',               container:true,  verse:'stack_box' },
    text:     { label:'Text',      icon:'type',                 container:false, verse:'text_block' },
    rect:     { label:'Color',     icon:'square',               container:false, verse:'color_block' },
    image:    { label:'Texture',   icon:'image',                container:false, verse:'texture_block' },
    material: { label:'Material',  icon:'paintbrush',           container:false, verse:'material_block' },
    button:   { label:'Button',    icon:'mouse-pointer-click',  container:false, verse:'button' },
  };
  /* Variant → chrome-less native `button` skin (parity with ui_buttons.verse).
     hotFill / selBorder / lockFill mirror HotFillHex / SelBorderHex / LockFillHex.
     Preview-only `props.state` (normal|hot|selected|locked) uses ApplyVisual rules. */
  const UI_BUTTON_STYLE = {
    loud:    { border:'F2C14E', fill:'F2C14E', hotFill:'FFE28A', selBorder:'FFFFFF', lockFill:'5D6B85', fillOp:1,    text:'0A0F1A', textSize:18, w:220, h:56 },
    regular: { border:'151D2C', fill:'151D2C', hotFill:'1E2839', selBorder:'4C8DFF', lockFill:'0A0F1A', fillOp:0.95, text:'E8EDF7', textSize:16, w:220, h:48 },
    quiet:   { border:'1E2839', fill:'1E2839', hotFill:'2C3A52', selBorder:'4C8DFF', lockFill:'0A0F1A', fillOp:1,    text:'E8EDF7', textSize:16, w:160, h:48 },
    card:    { border:'2C3A52', fill:'101725', hotFill:'1E2839', selBorder:'F2C14E', lockFill:'0A0F1A', fillOp:0.97, text:'E8EDF7', textSize:12, w:400, h:480 },
    row:     { border:'151D2C', fill:'151D2C', hotFill:'1E2839', selBorder:'4C8DFF', lockFill:'0A0F1A', fillOp:0.9,  text:'E8EDF7', textSize:16, w:1200, h:132 },
    danger:  { border:'FF4D4D', fill:'3A1515', hotFill:'5A1F1F', selBorder:'FF4D4D', lockFill:'2A1010', fillOp:1,    text:'E8EDF7', textSize:16, w:220, h:48 },
  };
  const UI_BUTTON_VERSE = { loud:'button', regular:'button', quiet:'button', danger:'button' };
  function uiButtonVisual(variant, state){
    const st=UI_BUTTON_STYLE[variant]||UI_BUTTON_STYLE.loud;
    const s=state||'normal';
    let border=st.border, fill=st.fill, op=st.fillOp==null?1:st.fillOp;
    if(s==='locked'){ border=st.lockFill; fill=st.lockFill; op=0.55; }
    else if(s==='selected'){ border=st.selBorder; op=1; }
    else if(s==='hot'){ fill=st.hotFill; op=1; }
    return { border:'#'+border, fill:'#'+fill, opacity:op, text:'#'+st.text, textSize:st.textSize };
  }

  function uiDefaultProps(type){
    const t=uiTheme();
    switch(type){
      case 'stack':    return { orient:'V' };
      case 'text':     return { text:'Text', size:t.type.body, color:'text', opacity:1, justify:'Left', shadow:false, shadowColor:'#000000', shadowOpacity:0.6, wrap:false, wrapWidth:0 };
      case 'rect':     return { color:'panel', opacity:1, w:200, h:60 };
      case 'image':    return { image:'Textures.T_Empty', tint:'#FFFFFF', opacity:1, w:96, h:96 };
      case 'material': return { material:'Materials.M_UI', w:200, h:120 };
      case 'button':   return { variant:'loud', text:'Confirm' };
      default:         return {};
    }
  }
  function uiDefaultSlot(){
    return { aMin:[0,0], aMax:[0,0], off:[0,0,200,80], align:[0,0], z:0, stc:false,
             h:'Fill', v:'Fill', pad:[0,0,0,0], dist:null };
  }
  function uiMakeNode(type, props, children, slot, name){
    return {
      id: uid('w'), type,
      name: name || UI_TYPES[type].label,
      slot: Object.assign(uiDefaultSlot(), slot||{}),
      props: Object.assign(uiDefaultProps(type), props||{}),
      children: UI_TYPES[type].container ? (children||[]) : [],
    };
  }

  /* ---- authoring shorthands (used by the seeded catalogue) ---- */
  const uiCanvas  = (children, slot, name)          => uiMakeNode('canvas', {}, children, slot, name);
  const uiOverlay = (children, slot, name)          => uiMakeNode('overlay', {}, children, slot, name);
  const uiStack   = (orient, children, slot, name)  => uiMakeNode('stack', {orient}, children, slot, name);
  const uiText    = (text, props, slot, name)       => uiMakeNode('text', Object.assign({text}, props||{}), null, slot, name||('“'+String(text).slice(0,18)+'”'));
  const uiRect    = (color, w, h, props, slot, name)=> uiMakeNode('rect', Object.assign({color,w,h}, props||{}), null, slot, name);
  const uiImage   = (image, w, h, props, slot, name)=> uiMakeNode('image', Object.assign({image,w,h}, props||{}), null, slot, name);
  const uiButton  = (text, variant, slot, name)     => uiMakeNode('button', {text, variant:variant||'loud'}, null, slot, name||('['+text+']'));

  /* canvas slots — the shapes that cover ~everything */
  const csFill   = (l,t,r,b)      => ({ aMin:[0,0], aMax:[1,1], off:[l||0,t||0,r||0,b||0], align:[0,0] });
  const csBox    = (x,y,w,h)      => ({ aMin:[0,0], aMax:[0,0], off:[x,y,w,h], align:[0,0] });
  const csAnchor = (ax,ay,x,y,w,h,alx,aly) => ({ aMin:[ax,ay], aMax:[ax,ay], off:[x,y,w,h], align:[alx==null?0.5:alx, aly==null?0.5:aly] });
  const csCenter = (w,h,dx,dy)    => csAnchor(0.5,0.5,dx||0,dy||0,w,h,0.5,0.5);
  /* stretch horizontally across the parent, fixed height pinned top or bottom */
  const csBandTop    = (h,l,r,y)  => ({ aMin:[0,0], aMax:[1,0], off:[l||0, y||0, r||0, h], align:[0,0] });
  const csBandBottom = (h,l,r,y)  => ({ aMin:[0,1], aMax:[1,1], off:[l||0, -(h+(y||0)), r||0, h], align:[0,0] });

  /* overlay / stack slots */
  const sl  = (h,v,pad,dist) => ({ h:h||'Fill', v:v||'Fill', pad:pad||[0,0,0,0], dist:(dist==null?null:dist) });

  /* ---- composites — the Verse-correct way to fake what Verse UI lacks ----
     No corner radius, no stroke: a bordered panel is a stroke-coloured
     color_block with a slightly inset fill sitting on top of it. */
  function uiPanel(w, h, children, opts){
    const o=Object.assign({fill:'panel', stroke:'stroke', strokeW:uiTheme().strokeW,
                           opacity:uiTheme().opacity.panel, padding:24}, opts||{});
    const inset=o.strokeW;
    const kids=[
      uiRect(o.stroke, w, h, {opacity:1}, sl('Fill','Fill'), 'Panel border'),
      uiRect(o.fill, w-inset*2, h-inset*2, {opacity:o.opacity}, sl('Fill','Fill',[inset,inset,inset,inset]), 'Panel fill'),
    ];
    for(const c of children||[]){
      const p=c.slot&&c.slot.pad;
      if(!p || !(p[0]||p[1]||p[2]||p[3])) c.slot.pad=[o.padding,o.padding,o.padding,o.padding];
      kids.push(c);
    }
    /* Default to centred so the same panel works as a canvas child (modal) or a
       flow child (nested inside a stack) with no extra wiring. */
    const slot=Object.assign(csCenter(w,h), sl('Center','Center'), o.slot||{});
    return uiOverlay(kids, slot, o.name||'Panel');
  }
  /* Root canvas for any modal: full-bleed dim, then whatever sits on top. */
  function uiScrim(children){
    return uiCanvas([
      uiRect('scrim', UI_STAGE_W, UI_STAGE_H, {opacity:uiTheme().opacity.scrim}, csFill(0,0,0,0), 'Scrim'),
      ...(children||[]),
    ], null, 'Root');
  }
  /* Progress/health bar: track + fill. The fill width is what Verse animates. */
  function uiBar(w, h, fillColor, pct, name){
    const f=Math.max(0,Math.min(1,pct==null?0.7:pct));
    return uiOverlay([
      uiRect('panelDeep', w, h, {opacity:0.9}, sl('Fill','Fill'), 'Track'),
      uiRect(fillColor, Math.round(w*f), h, {opacity:1}, sl('Left','Fill'), 'Fill'),
    ], null, name||'Bar');
  }

  /* ---- tree ops ---- */
  function uiWalk(node, fn, parent, index){
    if(!node) return;
    fn(node, parent, index);
    (node.children||[]).forEach((c,i)=>uiWalk(c, fn, node, i));
  }
  function uiFind(root, id){ let hit=null; uiWalk(root, n=>{ if(n.id===id) hit=n; }); return hit; }
  function uiFindParent(root, id){ let hit=null; uiWalk(root,(n,p)=>{ if(n.id===id) hit=p; }); return hit; }
  function uiClone(node){
    const c=JSON.parse(JSON.stringify(node));
    uiWalk(c, n=>{ n.id=uid('w'); });
    return c;
  }
  function uiRemove(root, id){
    const p=uiFindParent(root,id); if(!p) return false;
    const i=p.children.findIndex(c=>c.id===id); if(i<0) return false;
    p.children.splice(i,1); return true;
  }
  function uiMove(root, id, delta){
    const p=uiFindParent(root,id); if(!p) return false;
    const i=p.children.findIndex(c=>c.id===id); const j=i+delta;
    if(i<0||j<0||j>=p.children.length) return false;
    const [n]=p.children.splice(i,1); p.children.splice(j,0,n); return true;
  }
  /* Slot fields are only meaningful to the parent that owns them. */
  function uiSlotKind(parentType){ return parentType==='canvas' ? 'canvas' : 'flow'; }

  /* ======================================================================
     UI SCREENS — 03 · SEEDED CATALOGUE
     Every screen the Chronomancer loop needs, walked stage by stage:
       boot  -> title, class pick, difficulty
       hub   -> hub HUD, merchant (weapons / scrolls), infusion bench,
                skill tree, loadout, journey map, ready up, NPC dialogue
       run   -> run HUD, wave banner, boss bar, boss defeated, interact prompt, toasts
       popup -> upgrade choice, loot, level up, purchase, insufficient, confirm
       end   -> room clear, death, victory, pause, settings, leaderboard
     Each screen is a real widget tree, not a mockup image — it previews with
     Verse layout rules and exports as Verse.
     ====================================================================== */

  const MX = 120, MY = 72;   /* title-safe margins at 1080p */

  /* ---------- shared composites (the design system) ---------- */
  function uiKicker(txt, color){ return uiText(txt, {size:'tiny', color:color||'textMute', justify:'Left'}, sl('Left','Top'), 'Kicker'); }
  function uiH(txt, lvl, color){ return uiText(txt, {size:lvl||'h2', color:color||'text'}, sl('Left','Top'), 'Heading'); }

  function uiPageHeader(title, sub, accent){
    return uiStack('V', [
      uiRect(accent||'gold', 64, 4, {}, sl('Left','Top',[0,0,0,12]), 'Rule'),
      uiText(title, {size:'h1', color:'text'}, sl('Left','Top'), 'Title'),
      uiText(sub, {size:'small', color:'textDim'}, sl('Left','Top',[0,8,0,0]), 'Subtitle'),
    ], csBox(MX, MY, 900, 140), 'Page header');
  }

  /* Quiet Back — select screens advance on card/row press; Back returns one step. */
  function uiNavBack(label){
    const btn=uiButton(label||'Back','quiet', csBox(MX, 28, 180, 48), 'Back');
    btn.bind='BackBtn';
    return btn;
  }

  /* Currency pill — symbol, amount. Bound so Verse can update the amount. */
  function uiCurrencyChip(sym, amount, color, bind, opts){
    const o=opts||{};
    const symbolNode = o.icon
      ? uiIconPlate(o.icon, 28, color)
      : uiText(sym, {size:'h3', color}, sl('Left','Center',[0,0,10,0]), 'Symbol');
    return uiOverlay([
      uiRect('panelDeep', 210, 52, {opacity:0.85}, sl('Fill','Fill'), 'Chip bg'),
      uiRect(color, 4, 52, {}, sl('Left','Fill'), 'Chip accent'),
      uiStack('H', [
        symbolNode,
        Object.assign(uiText(amount, {size:'h3', color:'text'}, sl('Left','Center'), 'Amount'), {bind}),
      ], sl('Left','Center',[18,0,0,0]), 'Chip row'),
    ], null, 'Currency · '+bind);
  }

  function uiBadge(text, color, w, h, opts){
    const o=opts||{};
    const W=w||110, H=h||28;
    const kids=[
      uiRect(color||'accent', W, H, {opacity:1}, sl('Fill','Fill'), 'Badge border'),
      uiRect('panelDeep', W-4, H-4, {opacity:0.95}, sl('Fill','Fill',[2,2,2,2]), 'Badge fill'),
      uiText(text, {size:'tiny', color:color||'accent', justify:'Center'}, sl('Center','Center'), 'Badge text'),
    ];
    const badge=uiOverlay(kids, o.slot||null, o.name||('Badge · '+text));
    if(o.bind) badge.bind=o.bind;
    return badge;
  }
  function uiStatRow(label, pct, w, opts){
    const o=opts||{};
    const W=w||340, barW=Math.max(80, W-126);
    const bar=uiBar(barW, 10, o.fill||'accent', pct, 'Stat bar');
    bar.slot=sl('Right','Center');
    bar.props=Object.assign(bar.props||{}, {fx:o.fx||'bar'});
    const row=uiOverlay([
      uiText(label, {size:'tiny', color:'textMute'}, sl('Left','Center'), 'Stat label'),
      bar,
    ], o.slot||sl('Fill','Top',[0,0,0,10]), o.name||('Stat · '+label));
    if(o.bind) row.bind=o.bind;
    return row;
  }
  function uiIconPlate(image, size, tint){
    const s=size||64;
    return uiImage(image||'Textures.T_Empty', s, s, {tint:tint||'#FFFFFF', opacity:1}, sl('Center','Center'), 'Icon plate');
  }
  function uiPricePill(amount, sym, color, opts){
    const o=opts||{};
    const W=o.w||140, H=o.h||36;
    const kids=[
      uiRect(color||'gold', W, H, {opacity:1}, sl('Fill','Fill'), 'Price border'),
      uiRect('panelDeep', W-4, H-4, {opacity:0.95}, sl('Fill','Fill',[2,2,2,2]), 'Price fill'),
      uiStack('H', [
        uiText(String(sym||''), {size:'small', color:color||'gold'}, sl('Left','Center',[0,0,8,0]), 'Price sym'),
        Object.assign(uiText(String(amount==null?'':amount), {size:'small', color:'text'}, sl('Left','Center'), 'Price amt'), {bind:o.bind}),
      ], sl('Center','Center'), 'Price row'),
    ];
    return uiOverlay(kids, o.slot||null, o.name||'Price pill');
  }
  function uiWeaponCard(w, h, o){
    const O=o||{};
    const kids=[];
    const accent=O.accent||'stroke';
    const locked=!!O.locked;
    const owned=!!O.owned;
    kids.push(uiRect(accent, w, h, {opacity:1}, sl('Fill','Fill'), 'Card border'));
    kids.push(uiRect('panel', w-4, h-4, {opacity:locked?0.75:0.97}, sl('Fill','Fill',[2,2,2,2]), 'Card fill'));
    kids.push(uiRect(accent, w-4, 6, {}, sl('Fill','Top',[2,2,2,0]), 'Card rarity bar'));
    const artH=h-120;
    kids.push(uiRect('panelDeep', w-8, artH, {opacity:1}, sl('Fill','Top',[4,10,4,0]), 'Art plate'));
    if(O.index!=null){
      kids.push(uiText(String(O.index).padStart(2,'0'), {size:'display', color:'textMute', opacity:0.18, justify:'Center'}, sl('Center','Top',[0,24,0,0]), 'Ghost index'));
    }
    if(O.icon) kids.push(Object.assign(uiIconPlate(O.icon, Math.min(160, artH-40)), {slot:sl('Center','Top',[0,40,0,0])}));
    kids.push(uiBadge(owned?'UNLOCKED':'LOCKED', owned?'accent':'danger', owned?110:96, 28, {slot:sl('Right','Top',[0,18,14,0])}));
    /* Optional wizardry slot plate (EMPTY / FULL) — sits in the art well. */
    if(O.slotPlate) kids.push(O.slotPlate);
    else if(O.pips) kids.push(Object.assign(O.pips, {slot:sl('Left','Top',[16, artH-8,0,0])}));
    const footKids=[
      uiText(O.title||'', {size:'h3', color:'text'}, sl('Left','Top',[0,0,0,6]), 'Card title'),
      uiText(O.body||'', {size:'tiny', color:'textDim', wrap:true, wrapWidth:w-40}, sl('Left','Top',[0,0,0,8]), 'Card body'),
    ];
    if(owned) footKids.push(uiText('IN INVENTORY', {size:'tiny', color:'accent'}, sl('Left','Bottom'), 'Owned label'));
    else if(O.priceText) footKids.push(uiPricePill(O.priceText, O.priceSym||'', O.priceColor||'gold', {slot:sl('Left','Bottom'), bind:O.priceBind}));
    kids.push(uiStack('V', footKids, sl('Fill','Bottom',[16,0,16,14]), 'Card info'));
    const card=uiOverlay(kids, O.slot||null, O.name||('Weapon · '+(O.title||'')));
    card.props=Object.assign(card.props||{}, { asButton:true, variant:'card', state:O.state||(locked?'locked':'normal'), fx:O.fx||'pad', fxIndex:O.fxIndex||0, collapseDefault:true });
    if(O.bind) card.bind=O.bind;
    return card;
  }
  function uiPager(page, total, w, opts){
    const o=opts||{};
    const W=w||1680;
    const prev=uiOverlay([
      uiRect('panelDeep', 140, 48, {opacity:1}, sl('Fill','Fill'), 'Prev bg'),
      uiText('PREV', {size:'small', color:'text'}, sl('Center','Center'), 'Prev label'),
    ], sl('Left','Center'), 'Pager prev');
    prev.props={asButton:true, variant:'quiet'}; prev.bind=o.prevBind||'PagerPrev';
    const next=uiOverlay([
      uiRect('panelDeep', 140, 48, {opacity:1}, sl('Fill','Fill'), 'Next bg'),
      uiText('NEXT', {size:'small', color:'text'}, sl('Center','Center'), 'Next label'),
    ], sl('Right','Center'), 'Pager next');
    next.props={asButton:true, variant:'quiet'}; next.bind=o.nextBind||'PagerNext';
    const mid=Object.assign(uiText('PAGE '+page+' / '+total, {size:'small', color:'textMute', justify:'Center'}, sl('Center','Center'), 'Pager label'), {bind:o.labelBind||'PagerLabel'});
    return uiOverlay([prev, mid, next], o.slot||null, o.name||'Pager');
  }
  function uiWizardrySlot(slot, wiz, selected, opts){
    const o=opts||{};
    const W=o.w||200, H=o.h||120;
    const policy=o.slotPolicy||'infusable';
    const filled=!!(wiz&&(wiz.id||wiz.name));
    const lockedSig=!!(slot&&slot.kind==='locked') || (wiz&&wiz.kind==='locked_signature');
    const nonSwap=policy==='locked_power' || lockedSig;
    const empty=!filled && !(slot&&slot.kind==='locked');
    let skin='filled';
    if(empty) skin='empty';
    else if(nonSwap&&lockedSig) skin='signature';
    else if(slot&&slot.kind==='locked') skin='locked';
    const accent=(wiz&&wiz.color)||(skin==='empty'?'stroke':'accentAlt');
    const title=filled?(wiz.name||wiz.id):(slot&&slot.label)||'Open slot';
    const kicker=filled?(wiz.element||''):(skin==='empty'?'EMPTY':(slot&&slot.kind)||'');
    let effect='';
    if(filled&&wiz){
      if(wiz.kind==='element_infusion') effect=(wiz.stackName||'?')+' x'+(wiz.stackThreshold||5)+' → '+(wiz.procName||'?');
      else effect=wiz.chargedName||wiz.desc||'';
    } else if(empty){
      const accepts=(slot&&slot.accepts)||[];
      effect=accepts.length?('Accepts '+accepts.join(' / ')):'Hub reroll';
    } else effect='Signature — cannot swap';
    const kids=[
      uiRect(selected?'gold':accent, W, H, {opacity:1}, sl('Fill','Fill'), 'Wiz border'),
      uiRect(skin==='locked'||skin==='signature'?'panelDeep':'panel', W-4, H-4, {opacity:skin==='locked'?0.7:0.95}, sl('Fill','Fill',[2,2,2,2]), 'Wiz fill'),
      uiOverlay([
        uiRect(accent, 36, 36, {opacity:1}, sl('Fill','Fill'), 'Sym border'),
        uiRect('panelDeep', 32, 32, {opacity:0.95}, sl('Center','Center'), 'Sym fill'),
        uiText((wiz&&wiz.symbol)||(empty?'+':'🔒'), {size:'body', color:accent, justify:'Center'}, sl('Center','Center'), 'Sym'),
      ], sl('Left','Top',[12,12,0,0]), 'Symbol plate'),
      uiStack('V', [
        uiText(kicker, {size:'tiny', color:accent}, sl('Left','Top',[0,0,0,4]), 'Wiz kicker'),
        uiText(title, {size:'small', color:'text'}, sl('Left','Top',[0,0,0,4]), 'Wiz title'),
        uiText(effect, {size:'tiny', color:'textDim', wrap:true, wrapWidth:W-24}, sl('Left','Top'), 'Wiz effect'),
      ], sl('Fill','Fill',[56,12,12,12]), 'Wiz copy'),
    ];
    const node=uiOverlay(kids, o.slot||sl('Left','Fill',[0,0,12,0]), o.name||('Wizardry · '+title));
    node.props={asButton:true, variant:'card', state:skin==='locked'?'locked':(selected?'selected':'normal'), collapseDefault:true};
    if(o.bind) node.bind=o.bind;
    return node;
  }
  function uiWizardryPips(slots, wizById, opts){
    const o=opts||{};
    const list=slots||[];
    const kids=list.map((slot,i)=>{
      const pid=slot.equippedPowerId||slot.lockedPowerId;
      const wiz=pid&&wizById?wizById[pid]:null;
      const filled=!!wiz;
      const color=(wiz&&wiz.color)||'stroke';
      const pip=uiOverlay([
        uiRect(color, 22, 22, {opacity:filled?1:0.45}, sl('Fill','Fill'), 'Pip border'),
        uiRect(filled?'panelDeep':'panel', 18, 18, {opacity:filled?0.95:0.35}, sl('Center','Center'), 'Pip fill'),
        uiText(filled?(wiz.symbol||'·'):'·', {size:'tiny', color:filled?color:'textMute', justify:'Center'}, sl('Center','Center'), 'Pip sym'),
      ], sl('Left','Center',[i?6:0,0,0,0]), 'Pip '+i);
      return pip;
    });
    if(!kids.length) return uiRect('panel', 1, 1, {opacity:0}, o.slot||null, 'Pips empty');
    return uiStack('H', kids, o.slot||null, o.name||'Wizardry pips');
  }
  function uiUpgradeRow(name, boost, cost, w, opts){
    const o=opts||{};
    const W=w||400, H=o.h||72;
    const kids=[
      uiRect('row', W, H, {opacity:0.9}, sl('Fill','Fill'), 'Upgrade bg'),
      uiRect(o.accent||'stroke', 4, H, {}, sl('Left','Fill'), 'Upgrade accent'),
      uiStack('V', [
        uiText(name||'', {size:'body', color:'text'}, sl('Left','Top',[0,0,0,4]), 'Upgrade name'),
        uiText(boost||'', {size:'tiny', color:'textDim'}, sl('Left','Top'), 'Upgrade boost'),
      ], sl('Left','Center',[20,0,0,0]), 'Upgrade text'),
      uiText(cost||'', {size:'small', color:o.costColor||'gold'}, sl('Right','Center',[0,0,16,0]), 'Upgrade cost'),
    ];
    const row=uiOverlay(kids, o.slot||sl('Fill','Top',[0,0,0,10]), o.name||('Upgrade · '+(name||'')));
    row.props={asButton:true, variant:'row', state:o.state||'normal', collapseDefault:true};
    if(o.bind) row.bind=o.bind;
    return row;
  }
  /* Available Skins row — Armory details (React ShopUI). Color swatch + label. */
  function uiSkinSlot(name, swatch, selected, opts){
    const o=opts||{};
    const W=o.w||96, H=o.h||64;
    const kids=[
      uiRect(selected?'accent':'stroke', W, H, {opacity:1}, sl('Fill','Fill'), 'Skin border'),
      uiRect('panelDeep', W-4, H-4, {opacity:selected?0.95:0.9}, sl('Fill','Fill',[2,2,2,2]), 'Skin fill'),
      uiRect(swatch||'stroke', 32, 16, {opacity:1}, sl('Center','Top',[0,14,0,0]), 'Skin swatch'),
      uiText(name||'Default', {size:'tiny', color:'textMute', justify:'Center'}, sl('Center','Bottom',[0,0,0,10]), 'Skin label'),
    ];
    const node=uiOverlay(kids, o.slot||sl('Left','Fill',[0,0,16,0]), o.name||('Skin · '+(name||'Default')));
    node.props={asButton:true, variant:'card', state:selected?'selected':'normal', collapseDefault:true};
    if(o.bind) node.bind=o.bind;
    return node;
  }
  function uiSkinsRow(skins, opts){
    const o=opts||{};
    const list=(skins&&skins.length)?skins:[{id:'default', name:'Default', color:'#9ca3af'}];
    const kids=list.map((sk,i)=>uiSkinSlot(sk.name||sk.id||('Skin '+(i+1)), sk.color||'stroke', i===0, {
      bind:o.bindPrefix? (o.bindPrefix+i):('Skin_'+i),
      slot:sl('Left','Fill',[i?16:0,0,0,0]),
    }));
    return uiStack('H', kids, o.slot||sl('Fill','Top'), o.name||'Available Skins');
  }

  /* Card — the workhorse for upgrades, weapons, classes, loot, difficulty.
     Optional o.binds: {border, bar, kicker, title, body, footL, footR, btn}
     lets runtime Verse SetColor/SetText for ACTIVE selection + live data. */
  function uiCard(w, h, o){
    const B=o.binds||{};
    const kids=[];
    const border=uiRect(o.accent||'stroke', w, h, {opacity:1}, sl('Fill','Fill'), 'Card border');
    if(B.border) border.bind=B.border;
    kids.push(border);
    kids.push(uiRect('panel', w-4, h-4, {opacity:0.97}, sl('Fill','Fill',[2,2,2,2]), 'Card fill'));
    const bar=uiRect(o.accent||'stroke', w-4, 6, {}, sl('Fill','Top',[2,2,2,0]), 'Card rarity bar');
    if(B.bar) bar.bind=B.bar;
    kids.push(bar);
    const body=[];
    if(o.art!==false) body.push(uiRect('panelDeep', w-56, o.artH||160, {opacity:1}, sl('Fill','Top',[0,0,0,18]), 'Art plate'));
    if(o.kicker){
      const k=uiText(o.kicker, {size:'tiny', color:o.accent||'textMute'}, sl('Left','Top',[0,0,0,6]), 'Kicker');
      if(B.kicker) k.bind=B.kicker;
      body.push(k);
    }
    const title=uiText(o.title, {size:'h3', color:'text'}, sl('Left','Top',[0,0,0,10]), 'Card title');
    if(B.title) title.bind=B.title;
    body.push(title);
    if(o.body){
      const bd=uiText(o.body, {size:'small', color:'textDim', wrap:true, wrapWidth:w-56}, sl('Left','Top'), 'Card body');
      if(B.body) bd.bind=B.body;
      body.push(bd);
    }
    if(o.footL||o.footR){
      const fl=o.footL?uiText(o.footL, {size:'body', color:'gold'}, sl('Left','Center'), 'Cost'):uiRect('panel',1,1,{opacity:0},sl('Left','Center'),'—');
      if(o.footL && B.footL) fl.bind=B.footL;
      const fr=o.footR?uiText(o.footR, {size:'small', color:'textMute'}, sl('Right','Center'), 'Meta'):uiRect('panel',1,1,{opacity:0},sl('Right','Center'),'—');
      if(o.footR && B.footR) fr.bind=B.footR;
      body.push(uiOverlay([fl, fr], sl('Fill','Bottom',[0,16,0,0]), 'Card footer'));
    }
    kids.push(uiStack('V', body, sl('Fill','Fill',[28,22,28,22]), 'Card body'));
    const card=uiOverlay(kids, o.slot||null, o.name||('Card · '+o.title));
    if(B.btn){
      card.props=Object.assign(card.props||{}, { asButton:true, variant:'card' });
      card.bind=B.btn;
    }
    return card;
  }

  /* Table-style row for shops and leaderboards.
     Optional o.binds: {bg, accent, title, sub, right, btn} for ACTIVE select. */
  function uiRow(w, h, o){
    const B=o.binds||{};
    const bg=uiRect('row', w, h, {opacity:0.9}, sl('Fill','Fill'), 'Row bg');
    if(B.bg) bg.bind=B.bg;
    const accent=uiRect(o.accent||'stroke', 4, h, {}, sl('Left','Fill'), 'Row accent');
    if(B.accent) accent.bind=B.accent;
    const title=uiText(o.title, {size:'body', color:'text'}, sl('Left','Top',[0,0,0,4]), 'Row title');
    if(B.title) title.bind=B.title;
    const sub=uiText(o.sub||'', {size:'tiny', color:'textDim'}, sl('Left','Top'), 'Row sub');
    if(B.sub) sub.bind=B.sub;
    const right=uiText(o.right||'', {size:'h3', color:o.rightColor||'gold'}, sl('Right','Center',[0,0,28,0]), 'Row value');
    if(B.right) right.bind=B.right;
    const kids=[
      bg, accent,
      uiRect('panelDeep', h-24, h-24, {}, sl('Left','Center',[24,0,0,0]), 'Icon plate'),
      uiStack('V', [title, sub], sl('Left','Center',[24+(h-24)+20,0,0,0]), 'Row text'),
      right,
    ];
    const row=uiOverlay(kids, o.slot||null, o.name||('Row · '+o.title));
    if(B.btn){
      row.props=Object.assign(row.props||{}, { asButton:true, variant:'row' });
      row.bind=B.btn;
    }
    return row;
  }

  function uiTabStrip(labels, active, w, opts){
    const o=opts||{};
    const binds=o.binds||[];
    const tw=Math.floor(w/Math.max(1,labels.length));
    return uiStack('H', labels.map((l,i)=>{
      const tab=uiOverlay([
        uiRect(i===active?'panelAlt':'panelDeep', tw, 56, {opacity:1}, sl('Fill','Fill'), 'Tab bg'),
        uiRect('gold', tw, 4, {opacity:i===active?1:0}, sl('Fill','Bottom'), 'Tab underline'),
        uiText(l, {size:'small', color:i===active?'text':'textMute'}, sl('Center','Center'), 'Tab label'),
      ], sl('Left','Fill'), 'Tab · '+l);
      tab.props={asButton:true, variant:'quiet', state:i===active?'selected':'normal'};
      if(binds[i]) tab.bind=binds[i];
      else tab.bind='Tab'+String(l).replace(/[^A-Za-z0-9]+/g,'');
      return tab;
    }), null, 'Tab strip');
  }

  /* Modal frame: scrim + bordered panel + title + body + button row. */
  function uiModal(w, h, title, sub, bodyNodes, buttons, accent){
    const content=uiStack('V', [
      uiRect(accent||'gold', 56, 4, {}, sl('Left','Top',[0,0,0,14]), 'Rule'),
      uiText(title, {size:'h2', color:'text'}, sl('Left','Top',[0,0,0,6]), 'Modal title'),
      ...(sub?[uiText(sub, {size:'small', color:'textDim', wrap:true, wrapWidth:w-96}, sl('Left','Top',[0,0,0,22]), 'Modal sub')]:[]),
      ...bodyNodes,
      uiStack('H', buttons.map((b,i)=>uiButton(b.text, b.variant||(i===0?'loud':'quiet'), sl('Left','Fill',[i?16:0,0,0,0]))),
        sl('Right','Bottom',[0,26,0,0]), 'Modal buttons'),
    ], sl('Fill','Fill'), 'Modal content');
    return uiScrim([ uiPanel(w, h, [content], {padding:48, stroke:accent||'stroke', name:'Modal panel'}) ]);
  }

  function uiFooterHint(hints){
    return uiStack('H', hints.map((t,i)=>uiText(t, {size:'tiny', color:'textMute'}, sl('Left','Center',[i?36:0,0,0,0]), 'Hint')),
      csBandBottom(40, MX, MX, MY-40), 'Footer hints');
  }

  function uiScreen(id, name, stage, category, notes, verseFolder, verseFile, root){
    return { id, name, stage, category, status:'design', notes,
      verse:{ folder:verseFolder, file:verseFile+'_canvas.verse', klass:verseFile+'_canvas' },
      root };
  }

  /* ====================== the catalogue ====================== */
  function uiSeedScreens(){
    const S=[];

    /* ---------------- BOOT ---------------- */
    S.push(uiScreen('scr_title','Title / Press Start','boot','menu',
      'First frame after load. One action only. Version + build string bottom-left so playtest reports are traceable.',
      'GameDevices/Gameplay/Screens/Boot','title_screen',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiStack('V', [
          uiText('CHRONO', {size:'display', color:'gold', justify:'Center'}, sl('Center','Top'), 'Logo top'),
          uiText('BREAKERS', {size:'display', color:'text', justify:'Center'}, sl('Center','Top',[0,-8,0,0]), 'Logo bottom'),
          uiRect('gold', 260, 3, {}, sl('Center','Top',[0,26,0,26]), 'Rule'),
          uiText('The hourglass is broken. Walk back through it.', {size:'body', color:'textDim', justify:'Center'}, sl('Center','Top'), 'Tagline'),
        ], csCenter(900, 320, 0, -80), 'Logo lockup'),
        uiButton('Press Start', 'loud', csAnchor(0.5,0.5,0,220,420,72,0.5,0.5)),
        uiText('v0.4.1 · build 2318', {size:'tiny', color:'textMute'}, csAnchor(0,1,MX,-MY,400,28,0,1), 'Build stamp'),
      ], null, 'Root')));

    S.push(uiScreen('scr_class_select','Class Select','boot','menu',
      'Three cards. Pressing a card advances — no confirm CTA. Stat deltas as text. Back returns to Title.',
      'GameDevices/Gameplay/Screens/Boot','class_select',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiNavBack('Back'),
        uiPageHeader('Choose your thread','Your starting weapon and one permanent trait.','gold'),
        uiStack('H', [
          uiCard(420, 560, {accent:'elemTime', kicker:'STARTER · SERVICE PISTOL', title:'Archivist', body:'Crits refund 1 second of every cooldown.', footL:'+15% Crit', footR:'Balanced', slot:sl('Left','Fill'),
            binds:{btn:'Class0Btn'}}),
          uiCard(420, 560, {accent:'elemFire', kicker:'STARTER · MACHINE PISTOL', title:'Emberwright', body:'Heat never punishes you — spread stays flat while damage ramps.', footL:'+20% Fire', footR:'Aggressive', slot:sl('Left','Fill',[28,0,0,0]),
            binds:{btn:'Class1Btn'}}),
          uiCard(420, 560, {accent:'elemVoid', kicker:'STARTER · HAND CANNON', title:'Nullwarden', body:'Overpressure rounds pierce one extra target and strip a buff.', footL:'+1 Pierce', footR:'Technical', slot:sl('Left','Fill',[28,0,0,0]),
            binds:{btn:'Class2Btn'}}),
        ], csAnchor(0.5,0,0,260,1376,560,0.5,0), 'Class cards'),
        uiFooterHint(['[A]/[D] Focus card','[Enter] Choose','[Esc] Back']),
      ], null, 'Root')));

    S.push(uiScreen('scr_difficulty','Difficulty Select','boot','menu',
      'Reads Difficulty Menu tab: enemy count %, HP and damage multipliers. Never hide the multipliers. Pressing a row advances (no Confirm). Back returns to Journey / Level Select.',
      'GameDevices/Gameplay/Screens/Boot','difficulty_select',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiNavBack('Back'),
        uiPageHeader('Set the resistance','Difficulty only scales enemies. Your build is never nerfed.','accent'),
        uiStack('H', [
          Object.assign(uiRect('bg', 0, 460, {opacity:0}, sl('Left','Fill'), 'Slide pad'), {bind:'SlidePad'}),
          uiStack('V', [
            uiRow(1200, 132, {accent:'ok', title:'Easy', sub:'75% enemy count · 0.8x HP · 0.8x damage', right:'x0.8', rightColor:'ok', slot:sl('Center','Top',[0,0,0,20]),
              binds:{bg:'Diff0Bg', accent:'Diff0Accent', btn:'Diff0Btn'}}),
            uiRow(1200, 132, {accent:'accent', title:'Normal', sub:'100% enemy count · designed wave counts and baseline tuning', right:'x1.0', rightColor:'accent', slot:sl('Center','Top',[0,0,0,20]),
              binds:{bg:'Diff1Bg', accent:'Diff1Accent', btn:'Diff1Btn'}}),
            uiRow(1200, 132, {accent:'danger', title:'Hard', sub:'150% enemy count · 1.5x HP · 1.35x damage', right:'x1.5', rightColor:'danger', slot:sl('Center','Top'),
              binds:{bg:'Diff2Bg', accent:'Diff2Accent', btn:'Diff2Btn'}}),
          ], sl('Left','Fill'), 'Difficulty rows'),
        ], csAnchor(0.5,0,0,280,1400,460,0.5,0), 'Difficulty track'),
      ], null, 'Root')));

    /* ---------------- HUB ---------------- */
    S.push(uiScreen('scr_hub_hud','Hub HUD','hub','hud',
      'Persistent while walking the Hub. Currency top-right, objective top-left, nothing centre — the centre belongs to the game.',
      'GameDevices/Gameplay/Screens/Hub','hub_hud',
      uiCanvas([
        uiStack('H', [
          uiCurrencyChip('⏳','1,240','curSandGrain','SandText'),
          uiCurrencyChip('💷','86','curTimeEssence','EssenceText'),
        ], csAnchor(1,0,-MX,MY,440,52,1,0), 'Currency rail'),
        uiOverlay([
          uiRect('panelDeep', 460, 74, {opacity:0.8}, sl('Fill','Fill'), 'Objective bg'),
          uiRect('gold', 4, 74, {}, sl('Left','Fill'), 'Objective accent'),
          uiStack('V', [
            uiText('HUB', {size:'tiny', color:'gold'}, sl('Left','Top',[0,0,0,4]), 'Objective kicker'),
            Object.assign(uiText('Talk to Wizard Bob to open the rift', {size:'small', color:'text'}, sl('Left','Top'), 'Objective text'), {bind:'ObjectiveText'}),
          ], sl('Left','Center',[20,0,0,0]), 'Objective stack'),
        ], csBox(MX, MY, 460, 74), 'Objective card'),
        uiFooterHint(['[E] Interact','[Tab] Loadout','[M] Journey']),
      ], null, 'Root')));

    S.push(uiScreen('scr_shop_weapons','Armory','hub','shop',
      'React ShopUI 1:1 via syncArmoryScreenFromWeapons. Listing cards show SLOT·EMPTY/FULL; details show power slots. Fixed five tabs including SCROLLS.',
      'GameDevices/Gameplay/Screens/Shop','shop_weapons',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiText('Armory sync pending…', {size:'h3', color:'textMute', justify:'Center'}, csCenter(600,40,0,0), 'Sync placeholder'),
      ], null, 'Root')));

    S.push(uiScreen('scr_shop_scrolls','Merchant — Wizardry Scrolls','hub','shop',
      'Same frame as the weapon shop, element-coloured. Scrolls are reusable: say so on the card or players hoard them.',
      'GameDevices/Gameplay/Screens/Shop','shop_scrolls',
      uiCanvas([
        uiRect('scrim', UI_STAGE_W, UI_STAGE_H, {opacity:0.82}, csFill(0,0,0,0), 'Scrim'),
        uiPanel(1560, 860, [uiStack('V', [
          uiOverlay([
            uiText('THE SCRIPTORIUM', {size:'h2', color:'text'}, sl('Left','Center'), 'Shop title'),
            uiCurrencyChip('⏳','1,240','curSandGrain','SandText'),
          ], sl('Fill','Top',[0,0,0,20]), 'Shop header'),
          uiTabStrip(['Fire','Ice','Lightning','Void','Time'], 0, 1464),
          uiStack('H', [
            uiCard(340, 520, {accent:'elemFire', kicker:'FIRE · SCROLL · REUSABLE', title:'Cinder Mark', body:'Hits apply Cinder. At 5 stacks the target detonates for 40% of damage dealt.', footL:'180 ⏳', footR:'Stack x5', slot:sl('Left','Top')}),
            uiCard(340, 520, {accent:'elemFire', kicker:'FIRE · SCROLL · REUSABLE', title:'Backdraft', body:'Reloading with a full heat gauge releases a ring of flame around you.', footL:'240 ⏳', footR:'On reload', slot:sl('Left','Top',[26,0,0,0])}),
            uiCard(340, 520, {accent:'elemFire', kicker:'FIRE · CHARGED', title:'Pyre Sigil', body:'Charged shot plants a burning sigil for 6 seconds. Enemies inside take Cinder every 0.5s.', footL:'420 ⏳', footR:'Charged', slot:sl('Left','Top',[26,0,0,0])}),
            uiCard(340, 520, {accent:'stroke', kicker:'LOCKED', title:'???', body:'Reach Journey depth 3 to unlock the fourth Fire scroll.', footL:'—', footR:'Locked', art:true, slot:sl('Left','Top',[26,0,0,0])}),
          ], sl('Fill','Fill',[0,16,0,0]), 'Scroll grid'),
          uiStack('H', [
            uiButton('Buy scroll','loud', sl('Left','Fill')),
            uiButton('Leave','quiet', sl('Left','Fill',[16,0,0,0])),
          ], sl('Right','Bottom',[0,20,0,0]), 'Shop actions'),
        ], sl('Fill','Fill'), 'Shop content')], {padding:36, name:'Shop panel'}),
      ], null, 'Root')));

    S.push(uiScreen('scr_infusion_bench','Infusion Bench (Hub Reroll)','hub','shop',
      'Hub-only reroll, per meta.infusionRerollPolicy. Show the current infusion and the cost before the roll, never after.',
      'GameDevices/Gameplay/Screens/Shop','infusion_bench',
      uiCanvas([
        uiRect('scrim', UI_STAGE_W, UI_STAGE_H, {opacity:0.82}, csFill(0,0,0,0), 'Scrim'),
        uiPanel(1120, 700, [uiStack('V', [
          uiText('INFUSION BENCH', {size:'h2', color:'text'}, sl('Left','Top',[0,0,0,6]), 'Title'),
          uiText('Open power slots only. Locked Time signatures cannot be rerolled.', {size:'small', color:'textDim'}, sl('Left','Top',[0,0,0,28]), 'Subtitle'),
          uiStack('H', [
            uiCard(440, 380, {accent:'elemIce', kicker:'EQUIPPED · SLOT 1', title:'Service Pistol', artH:150, body:'Current infusion: Frost Mark — hits slow by 18% for 2s.', footL:'Reroll: 90 ⏳', footR:'Infusable', slot:sl('Left','Fill')}),
            uiStack('V', [
              uiText('→', {size:'display', color:'gold', justify:'Center'}, sl('Center','Center'), 'Arrow'),
            ], sl('Left','Fill',[36,0,36,0]), 'Arrow col'),
            uiCard(440, 380, {accent:'stroke', kicker:'RESULT', title:'Roll to reveal', artH:150, body:'A random scroll from the elements this weapon supports.', footL:'—', footR:'1 of 4 outcomes', slot:sl('Left','Fill')}),
          ], sl('Fill','Fill'), 'Bench body'),
          uiStack('H', [
            uiButton('Reroll · 90 ⏳','loud', sl('Left','Fill')),
            uiButton('Keep current','quiet', sl('Left','Fill',[16,0,0,0])),
          ], sl('Right','Bottom',[0,24,0,0]), 'Bench actions'),
        ], sl('Fill','Fill'), 'Bench content')], {padding:44, stroke:'elemIce', name:'Bench panel'}),
      ], null, 'Root')));

    S.push(uiScreen('scr_skill_tree','Skill Tree','hub','menu',
      'Mirrors the Progression tab tree. Auto-synced from Progression. Use Write to project for in-game Verse.',
      'GameDevices/Gameplay/Screens/Hub','skill_tree',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiPageHeader('Threads of mastery','Spend skill points. Later nodes stay locked until their prerequisites are filled.','accentAlt'),
        uiText('Syncing skill tree from Progression…', {size:'small', color:'textMute', justify:'Center'}, csBox(MX, 400, 900, 40), 'Tree sync pending'),
      ], null, 'Root')));

    S.push(uiScreen('scr_loadout','Loadout','hub','menu',
      'Weapon slots with their power slot state. An empty slot reads "Empty" — never blank.',
      'GameDevices/Gameplay/Screens/Hub','loadout',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiPageHeader('Loadout','Two weapons. Each open slot takes one scroll.','gold'),
        uiStack('H', [
          uiCard(520, 600, {accent:'rarityEpic', kicker:'PRIMARY · SLOT 1 · FROST MARK', title:'Machine Pistol', artH:200, body:'Full auto on a heat gauge. Accuracy widens as heat climbs but damage climbs with it.', footL:'DPS 214', footR:'Infusable', slot:sl('Left','Fill')}),
          uiCard(520, 600, {accent:'rarityLegendary', kicker:'SECONDARY · SIGNATURE LOCKED', title:'Hourglass', artH:200, body:'Damage scales with missing health. Kills chamber a round instantly, no reload.', footL:'DPS 180', footR:'Locked power', slot:sl('Left','Fill',[40,0,0,0])}),
          uiStack('V', [
            uiRow(400, 96, {accent:'elemIce', title:'Frost Mark', sub:'Equipped · Slot 1', right:'✓', rightColor:'ok', slot:sl('Left','Top',[0,0,0,14])}),
            uiRow(400, 96, {accent:'elemFire', title:'Cinder Mark', sub:'In pack', right:'', slot:sl('Left','Top',[0,0,0,14])}),
            uiRow(400, 96, {accent:'elemVoid', title:'Null Field', sub:'In pack', right:'', slot:sl('Left','Top')}),
          ], sl('Left','Top',[40,0,0,0]), 'Scroll pack'),
        ], csAnchor(0.5,0,0,270,1560,600,0.5,0), 'Loadout body'),
        uiFooterHint(['[Tab] Close','[Enter] Equip scroll','[X] Unequip']),
      ], null, 'Root')));

    S.push(uiScreen('scr_journey_map','Journey / Level Select','hub','menu',
      'Run route. Threat and reward are on the node. Pressing a level card advances to Difficulty (no Enter CTA). Back closes to Hub.',
      'GameDevices/Gameplay/Screens/Hub','journey_map',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiNavBack('Back'),
        uiPageHeader('The Journey','Pick the next fracture. You cannot come back for the one you skipped.','gold'),
        uiStack('H', [
          Object.assign(uiRect('bg', 0, 480, {opacity:0}, sl('Left','Fill'), 'Slide pad'), {bind:'SlidePad'}),
          uiCard(400, 480, {accent:'ok', kicker:'DEPTH 1 · THREAT 3', title:'The Warrens', artH:170, body:'Tight corridors. Melee-heavy. Guaranteed scroll drop.', footL:'⏳ 180–240', footR:'Open', slot:sl('Left','Fill'),
            binds:{border:'Level0Border', bar:'Level0Bar', kicker:'Level0Kicker', title:'Level0Title', body:'Level0Desc', footL:'Level0Reward', footR:'Level0Meta', btn:'Level0Btn'}}),
          uiCard(400, 480, {accent:'gold', kicker:'DEPTH 2 · THREAT 4', title:'Arcane Vault', artH:170, body:'Casters behind shields. Bring a piercing weapon.', footL:'⏳ 260–320', footR:'Open', slot:sl('Left','Fill',[32,0,0,0]),
            binds:{border:'Level1Border', bar:'Level1Bar', kicker:'Level1Kicker', title:'Level1Title', body:'Level1Desc', footL:'Level1Reward', footR:'Level1Meta', btn:'Level1Btn'}}),
          uiCard(400, 480, {accent:'danger', kicker:'DEPTH 3 · THREAT 5 · BOSS', title:'Throne of the Hooker King', artH:170, body:'Two phases. Adds spawn on phase change.', footL:'💷 8–12', footR:'Locked', slot:sl('Left','Fill',[32,0,0,0]),
            binds:{border:'Level2Border', bar:'Level2Bar', kicker:'Level2Kicker', title:'Level2Title', body:'Level2Desc', footL:'Level2Reward', footR:'Level2Meta', btn:'Level2Btn'}}),
        ], csAnchor(0.5,0,0,280,1400,480,0.5,0), 'Route track'),
      ], null, 'Root')));


    S.push(uiScreen('scr_ready_up','Ready Up','hub','menu',
      'Lobby gate after difficulty. Roster rows update live. READY toggles; Cancel leaves the queue. Matches Chronomancer page chrome.',
      'GameDevices/Gameplay/Screens/Hub','ready_up',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiPageHeader('Ready up','Everyone locks in before the fracture opens.','gold'),
        uiStack('H', [
          Object.assign(uiRect('bg', 0, 520, {opacity:0}, sl('Left','Fill'), 'Slide pad'), {bind:'SlidePad'}),
          uiPanel(1100, 520, [uiStack('V', [
            uiStack('H', [
              Object.assign(uiText('THE WARRENS', {size:'h2', color:'text'}, sl('Left','Center'), 'Level name'), {bind:'LevelNameText'}),
              Object.assign(uiText('NORMAL', {size:'h3', color:'accent'}, sl('Right','Center'), 'Difficulty'), {bind:'DifficultyText'}),
            ], sl('Fill','Top',[0,0,0,18]), 'Run summary'),
            Object.assign(uiText('Players: 1  (0/1 ready)', {size:'small', color:'textDim'}, sl('Left','Top',[0,0,0,20]), 'Roster count'), {bind:'RosterCountText'}),
            uiStack('V', [
              uiOverlay([
                uiRect('row', 1004, 72, {opacity:0.9}, sl('Fill','Fill'), 'Row bg'),
                uiRect('gold', 4, 72, {}, sl('Left','Fill'), 'Row accent'),
                Object.assign(uiText('Player 1', {size:'body', color:'text'}, sl('Left','Center',[24,0,0,0]), 'Name'), {bind:'Roster0Name'}),
                Object.assign(uiText('NOT READY', {size:'small', color:'textMute'}, sl('Right','Center',[0,0,24,0]), 'Status'), {bind:'Roster0Status'}),
              ], sl('Fill','Top',[0,0,0,10]), 'Roster row 0'),
              uiOverlay([
                uiRect('row', 1004, 72, {opacity:0.9}, sl('Fill','Fill'), 'Row bg'),
                uiRect('stroke', 4, 72, {}, sl('Left','Fill'), 'Row accent'),
                Object.assign(uiText('Player 2', {size:'body', color:'textMute'}, sl('Left','Center',[24,0,0,0]), 'Name'), {bind:'Roster1Name'}),
                Object.assign(uiText('—', {size:'small', color:'textMute'}, sl('Right','Center',[0,0,24,0]), 'Status'), {bind:'Roster1Status'}),
              ], sl('Fill','Top',[0,0,0,10]), 'Roster row 1'),
              uiOverlay([
                uiRect('row', 1004, 72, {opacity:0.9}, sl('Fill','Fill'), 'Row bg'),
                uiRect('stroke', 4, 72, {}, sl('Left','Fill'), 'Row accent'),
                Object.assign(uiText('Player 3', {size:'body', color:'textMute'}, sl('Left','Center',[24,0,0,0]), 'Name'), {bind:'Roster2Name'}),
                Object.assign(uiText('—', {size:'small', color:'textMute'}, sl('Right','Center',[0,0,24,0]), 'Status'), {bind:'Roster2Status'}),
              ], sl('Fill','Top',[0,0,0,10]), 'Roster row 2'),
              uiOverlay([
                uiRect('row', 1004, 72, {opacity:0.9}, sl('Fill','Fill'), 'Row bg'),
                uiRect('stroke', 4, 72, {}, sl('Left','Fill'), 'Row accent'),
                Object.assign(uiText('Player 4', {size:'body', color:'textMute'}, sl('Left','Center',[24,0,0,0]), 'Name'), {bind:'Roster3Name'}),
                Object.assign(uiText('—', {size:'small', color:'textMute'}, sl('Right','Center',[0,0,24,0]), 'Status'), {bind:'Roster3Status'}),
              ], sl('Fill','Top'), 'Roster row 3'),
            ], sl('Fill','Fill',[0,0,0,24]), 'Roster list'),
            uiStack('H', [
              Object.assign(uiButton('READY','loud', sl('Left','Fill')), {bind:'ReadyBtn'}),
              Object.assign(uiButton('Cancel','quiet', sl('Left','Fill',[16,0,0,0])), {bind:'CancelBtn'}),
            ], sl('Right','Bottom'), 'Ready actions'),
          ], sl('Fill','Fill'), 'Ready content')], {padding:40, name:'Ready panel'}),
        ], csAnchor(0.5,0,0,240,1200,560,0.5,0), 'Ready track'),
      ], null, 'Root')));

    S.push(uiScreen('scr_npc_dialogue','NPC Dialogue','hub','dialog',
      'Bottom-third band so the world stays visible. Portrait left, name plate above the text, choices right-aligned.',
      'GameDevices/Gameplay/Screens/Hub','npc_dialogue',
      uiCanvas([
        uiOverlay([
          uiRect('panelDeep', UI_STAGE_W, 320, {opacity:0.94}, sl('Fill','Fill'), 'Band bg'),
          uiRect('gold', UI_STAGE_W, 3, {}, sl('Fill','Top'), 'Band top rule'),
          uiStack('H', [
            uiOverlay([
              uiRect('gold', 200, 200, {}, sl('Fill','Fill'), 'Portrait border'),
              uiRect('panel', 194, 194, {}, sl('Fill','Fill',[3,3,3,3]), 'Portrait fill'),
              uiImage('Textures.T_Empty', 180, 180, {tint:'gold'}, sl('Center','Center'), 'Portrait'),
            ], sl('Left','Center'), 'Portrait frame'),
            uiStack('V', [
              Object.assign(uiText('WIZARD BOB', {size:'h3', color:'gold'}, sl('Left','Top',[0,0,0,12]), 'Speaker'), {bind:'SpeakerText'}),
              Object.assign(uiText('You broke it, then. Everyone does. The trick is not the breaking —\nit is walking back through without becoming someone else.', {size:'body', color:'text', wrap:true, wrapWidth:1000}, sl('Left','Top'), 'Line'), {bind:'LineText'}),
            ], sl('Left','Top',[32,0,0,0]), 'Speech'),
            uiStack('V', [
              uiButton('Open the rift','loud', sl('Right','Top')),
              uiButton('Tell me about scrolls','quiet', sl('Right','Top',[0,12,0,0])),
              uiButton('Later','quiet', sl('Right','Top',[0,12,0,0])),
            ], sl('Right','Center',[24,0,0,0]), 'Choices'),
          ], sl('Fill','Fill',[MX,42,MX,42]), 'Band content'),
        ], csBandBottom(320,0,0,0), 'Dialogue band'),
      ], null, 'Root')));

    /* ---------------- RUN / COMBAT ---------------- */
    S.push(uiScreen('scr_run_hud','In-Run HUD','run','hud',
      'The only screen the player stares at for 20 minutes. Corners only: health bottom-left, ammo bottom-right, objective top-left, currency top-right. Centre stays empty.',
      'GameDevices/Gameplay/Screens/Run','run_hud',
      uiCanvas([
        /* health + shield */
        uiStack('V', [
          uiStack('H', [
            Object.assign(uiText('148', {size:'h2', color:'text'}, sl('Left','Bottom'), 'HP value'), {bind:'HealthText'}),
            uiText('/ 200', {size:'small', color:'textMute'}, sl('Left','Bottom',[8,0,0,6]), 'HP max'),
          ], sl('Left','Top',[0,0,0,8]), 'HP row'),
          uiBar(420, 22, 'hp', 0.74, 'Health bar'),
          uiBar(420, 10, 'shield', 0.45, 'Shield bar'),
        ], csAnchor(0,1,MX,-MY-8,420,120,0,1), 'Vitals'),
        /* abilities */
        uiStack('H', [
          uiOverlay([ uiRect('stroke',84,84,{},sl('Fill','Fill'),'Border'), uiRect('panelDeep',80,80,{},sl('Fill','Fill',[2,2,2,2]),'Fill'), uiText('Q',{size:'h3',color:'elemIce'},sl('Center','Center'),'Key') ], sl('Left','Fill'), 'Ability Q'),
          uiOverlay([ uiRect('stroke',84,84,{},sl('Fill','Fill'),'Border'), uiRect('panelDeep',80,80,{},sl('Fill','Fill',[2,2,2,2]),'Fill'), uiText('E',{size:'h3',color:'elemVoid'},sl('Center','Center'),'Key') ], sl('Left','Fill',[14,0,0,0]), 'Ability E'),
          uiOverlay([ uiRect('gold',84,84,{},sl('Fill','Fill'),'Border'), uiRect('panelDeep',80,80,{},sl('Fill','Fill',[2,2,2,2]),'Fill'), uiText('R',{size:'h3',color:'gold'},sl('Center','Center'),'Key') ], sl('Left','Fill',[14,0,0,0]), 'Ultimate R'),
        ], csAnchor(0,1,MX+460,-MY-8,290,84,0,1), 'Ability rail'),
        /* ammo */
        uiStack('V', [
          uiStack('H', [
            Object.assign(uiText('17', {size:'display', color:'text'}, sl('Right','Bottom'), 'Ammo mag'), {bind:'AmmoText'}),
            uiText('/ 108', {size:'h3', color:'textMute'}, sl('Right','Bottom',[10,0,0,10]), 'Ammo reserve'),
          ], sl('Right','Top',[0,0,0,4]), 'Ammo row'),
          uiText('MACHINE PISTOL · FROST MARK', {size:'tiny', color:'elemIce'}, sl('Right','Top'), 'Weapon name'),
        ], csAnchor(1,1,-MX,-MY-8,460,120,1,1), 'Ammo block'),
        /* objective */
        uiOverlay([
          uiRect('panelDeep', 440, 78, {opacity:0.8}, sl('Fill','Fill'), 'Objective bg'),
          uiRect('gold', 4, 78, {}, sl('Left','Fill'), 'Objective accent'),
          uiStack('V', [
            uiText('ARCANE VAULT · DEPTH 2', {size:'tiny', color:'gold'}, sl('Left','Top',[0,0,0,4]), 'Objective kicker'),
            Object.assign(uiText('Wave 3 of 5 · 11 remaining', {size:'body', color:'text'}, sl('Left','Top'), 'Objective text'), {bind:'ObjectiveText'}),
          ], sl('Left','Center',[20,0,0,0]), 'Objective stack'),
        ], csBox(MX, MY, 440, 78), 'Objective card'),
        /* currency */
        uiStack('H', [
          uiCurrencyChip('⏳','412','curSandGrain','SandText'),
        ], csAnchor(1,0,-MX,MY,210,52,1,0), 'Currency rail'),
        /* crosshair-adjacent hit feed */
        uiStack('V', [
          uiText('+40  Cinder detonation', {size:'small', color:'elemFire', justify:'Right'}, sl('Right','Top',[0,0,0,4]), 'Feed 1'),
          uiText('+18  Crit', {size:'small', color:'gold', justify:'Right'}, sl('Right','Top',[0,0,0,4]), 'Feed 2'),
          uiText('+12', {size:'small', color:'textDim', justify:'Right'}, sl('Right','Top'), 'Feed 3'),
        ], csAnchor(1,0.5,-MX,-60,400,120,1,0), 'Damage feed'),
      ], null, 'Root')));

    S.push(uiScreen('scr_wave_banner','Wave / Objective Banner','run','overlay',
      'Fires for ~2s at wave start. Upper third so it never covers the reticle. Animate opacity only.',
      'GameDevices/Gameplay/Screens/Run','wave_banner',
      uiCanvas([
        uiOverlay([
          uiRect('panelDeep', 900, 118, {opacity:0.85}, sl('Fill','Fill'), 'Banner bg'),
          uiRect('gold', 900, 3, {}, sl('Fill','Top'), 'Top rule'),
          uiRect('gold', 900, 3, {}, sl('Fill','Bottom'), 'Bottom rule'),
          uiStack('V', [
            Object.assign(uiText('WAVE 3', {size:'h1', color:'gold', justify:'Center'}, sl('Center','Top',[0,0,0,2]), 'Banner title'), {bind:'WaveText'}),
            uiText('ARMOURED CASTERS INCOMING', {size:'small', color:'textDim', justify:'Center'}, sl('Center','Top'), 'Banner sub'),
          ], sl('Center','Center'), 'Banner text'),
        ], csAnchor(0.5,0,0,220,900,118,0.5,0), 'Banner'),
      ], null, 'Root')));

    S.push(uiScreen('scr_boss_bar','Boss Health Bar','combat','overlay',
      'Top-centre, phase pips above the bar. Never stack the boss bar on top of the objective card.',
      'GameDevices/Gameplay/Screens/Run','boss_bar',
      uiCanvas([
        uiStack('V', [
          Object.assign(uiText('BOSS', {size:'h2', color:'danger', justify:'Center'}, sl('Center','Top',[0,0,0,6]), 'Boss name'), {bind:'BossNameText'}),
          uiStack('H', [
            uiRect('danger', 180, 6, {}, sl('Left','Center',[0,0,6,0]), 'Phase 1'),
            uiRect('danger', 180, 6, {}, sl('Left','Center',[0,0,6,0]), 'Phase 2'),
            uiRect('stroke', 180, 6, {}, sl('Left','Center'), 'Phase 3'),
          ], sl('Center','Top',[0,0,0,8]), 'Phase pips'),
          uiOverlay([
            uiRect('panelDeep', 1100, 30, {opacity:0.95}, sl('Fill','Fill'), 'Track'),
            Object.assign(uiRect('danger', 660, 30, {}, sl('Left','Fill'), 'Fill'), {bind:'BossFill'}),
            uiRect('stroke', 1100, 30, {opacity:0}, sl('Fill','Fill'), 'Track edge'),
          ], sl('Center','Top'), 'Boss bar'),
        ], csAnchor(0.5,0,0,64,1100,140,0.5,0), 'Boss block'),
      ], null, 'Root')));

    S.push(uiScreen('scr_boss_defeated','Boss Defeated','combat','overlay',
      '~3s after boss kill. Centre banner. No buttons — InputMode.None.',
      'GameDevices/Gameplay/Screens/Run','boss_defeated',
      uiCanvas([
        uiOverlay([
          uiRect('panelDeep', 900, 140, {opacity:0.9}, sl('Fill','Fill'), 'Banner bg'),
          uiRect('gold', 900, 3, {}, sl('Fill','Top'), 'Top rule'),
          uiRect('gold', 900, 3, {}, sl('Fill','Bottom'), 'Bottom rule'),
          uiStack('V', [
            Object.assign(uiText('BOSS DEFEATED', {size:'h1', color:'gold', justify:'Center'}, sl('Center','Top',[0,0,0,4]), 'Defeat title'), {bind:'DefeatTitleText'}),
            Object.assign(uiText('SUN WUKONG', {size:'h2', color:'text', justify:'Center'}, sl('Center','Top'), 'Boss name'), {bind:'BossNameText'}),
          ], sl('Center','Center'), 'Banner text'),
        ], csAnchor(0.5,0.5,0,0,900,140,0.5,0.5), 'Banner'),
      ], null, 'Root')));

    S.push(uiScreen('scr_interact_prompt','Interaction Prompt','run','overlay',
      'Anchored just below centre so it reads without covering the target. Key glyph, then verb, then noun.',
      'GameDevices/Gameplay/Screens/Run','interact_prompt',
      uiCanvas([
        uiStack('H', [
          uiOverlay([
            uiRect('text', 48, 48, {}, sl('Fill','Fill'), 'Key border'),
            uiRect('panelDeep', 44, 44, {}, sl('Fill','Fill',[2,2,2,2]), 'Key fill'),
            uiText('E', {size:'body', color:'text'}, sl('Center','Center'), 'Key glyph'),
          ], sl('Left','Center'), 'Key cap'),
          Object.assign(uiText('Take  ·  Cinder Mark (Scroll)', {size:'body', color:'text'}, sl('Left','Center',[16,0,0,0]), 'Prompt text'), {bind:'PromptText'}),
        ], csAnchor(0.5,0.5,0,150,560,48,0.5,0.5), 'Prompt'),
      ], null, 'Root')));

    S.push(uiScreen('scr_toast','Pickup / Reward Toasts','run','overlay',
      'Stack upward from bottom-centre-right, max 4, 2.5s each. One line per toast — if it needs two lines it is a popup, not a toast.',
      'GameDevices/Gameplay/Screens/Run','toast_feed',
      uiCanvas([
        uiStack('V', [
          uiOverlay([ uiRect('panelDeep',420,52,{opacity:0.9},sl('Fill','Fill'),'Toast bg'), uiRect('gold',4,52,{},sl('Left','Fill'),'Accent'),
            uiText('+120 ⏳  Grain of Sand',{size:'small',color:'text'},sl('Left','Center',[18,0,0,0]),'Toast text') ], sl('Right','Top',[0,0,0,10]), 'Toast 1'),
          uiOverlay([ uiRect('panelDeep',420,52,{opacity:0.9},sl('Fill','Fill'),'Toast bg'), uiRect('elemIce',4,52,{},sl('Left','Fill'),'Accent'),
            uiText('Scroll found · Frost Mark',{size:'small',color:'text'},sl('Left','Center',[18,0,0,0]),'Toast text') ], sl('Right','Top',[0,0,0,10]), 'Toast 2'),
          uiOverlay([ uiRect('panelDeep',420,52,{opacity:0.9},sl('Fill','Fill'),'Toast bg'), uiRect('ok',4,52,{},sl('Left','Fill'),'Accent'),
            uiText('Objective complete',{size:'small',color:'text'},sl('Left','Center',[18,0,0,0]),'Toast text') ], sl('Right','Top'), 'Toast 3'),
        ], csAnchor(1,1,-MX,-260,420,180,1,1), 'Toast stack'),
      ], null, 'Root')));

    /* ---------------- POPUPS ---------------- */
    S.push(uiScreen('scr_upgrade_choice','Upgrade Choice (1 of 3)','popup','popup',
      'The core roguelike beat. Three cards, no reroll unless earned, no timer. Rarity colour on the top bar and the border only.',
      'GameDevices/Gameplay/Screens/Popup','upgrade_choice',
      uiCanvas([
        uiRect('scrim', UI_STAGE_W, UI_STAGE_H, {opacity:0.78}, csFill(0,0,0,0), 'Scrim'),
        uiStack('V', [
          uiText('CHOOSE ONE', {size:'h1', color:'text', justify:'Center'}, sl('Center','Top',[0,0,0,4]), 'Title'),
          uiText('The thread only holds one change per fracture.', {size:'small', color:'textDim', justify:'Center'}, sl('Center','Top'), 'Subtitle'),
        ], csAnchor(0.5,0,0,150,900,110,0.5,0), 'Header'),
        uiStack('H', [
          uiCard(380, 520, {accent:'rarityRare', kicker:'RARE · OFFENCE', title:'Overpressure', body:'Every reload chambers a round that pierces one extra target.', footL:'Stacks: 1', footR:'Weapon', slot:sl('Left','Fill')}),
          uiCard(380, 520, {accent:'rarityEpic', kicker:'EPIC · ELEMENT', title:'Cinder Cascade', body:'Cinder detonations apply 2 Cinder stacks to everything within 4m.', footL:'Stacks: 0', footR:'Fire', slot:sl('Left','Fill',[36,0,0,0])}),
          uiCard(380, 520, {accent:'rarityLegendary', kicker:'LEGENDARY · TIME', title:'Second Draft', body:'Once per room, dying instead rewinds you 3 seconds at 30% health.', footL:'Unique', footR:'Time', slot:sl('Left','Fill',[36,0,0,0])}),
        ], csCenter(1252, 520, 0, 40), 'Upgrade cards'),
        uiStack('H', [
          uiButton('Reroll · 1 ⏳','quiet', sl('Left','Fill')),
          uiButton('Skip (+40 ⏳)','quiet', sl('Left','Fill',[16,0,0,0])),
        ], csAnchor(0.5,1,0,-MY,520,60,0.5,1), 'Secondary actions'),
      ], null, 'Root')));

    S.push(uiScreen('scr_loot_popup','Loot / Drop Reward','popup','popup',
      'Fires on a guaranteed or boss drop. Rarity drives the border. Take is loud, Discard is quiet — never the reverse.',
      'GameDevices/Gameplay/Screens/Popup','loot_popup',
      uiModal(760, 560, 'FRACTURE DROP', 'From the Hooker King · guaranteed table', [
        uiCard(620, 300, {accent:'rarityLegendary', kicker:'LEGENDARY SCROLL · REUSABLE', title:'Hourglass Sigil', artH:120,
          body:'Charged shots freeze the target in a stopped second for 1.2s. Damage taken during the stop lands all at once when it ends.',
          footL:'Slot: any open', footR:'Time', slot:sl('Center','Top',[0,0,0,0])}),
      ], [{text:'Take'},{text:'Discard'}], 'rarityLegendary')));

    S.push(uiScreen('scr_levelup','Level Up','popup','popup',
      'Short, celebratory, dismissible. It grants points; it does not make the player spend them here.',
      'GameDevices/Gameplay/Screens/Popup','level_up',
      uiModal(680, 420, 'LEVEL 7', 'Your thread thickens.', [
        uiStack('V', [
          uiRow(584, 88, {accent:'accentAlt', title:'+1 Skill Point', sub:'Spend it in the Hub skill tree', right:'4 total', rightColor:'accentAlt', slot:sl('Center','Top',[0,0,0,14])}),
          uiRow(584, 88, {accent:'hp', title:'+10 Max Health', sub:'Applied immediately', right:'210', rightColor:'hp', slot:sl('Center','Top')}),
        ], sl('Fill','Top'), 'Rewards'),
      ], [{text:'Continue'},{text:'Open skill tree', variant:'quiet'}], 'accentAlt')));

    S.push(uiScreen('scr_purchase_confirm','Purchase Confirm','popup','popup',
      'Only for spends above a threshold or for locked-signature weapons. Show balance before and after — always both.',
      'GameDevices/Gameplay/Screens/Popup','purchase_confirm',
      uiModal(640, 400, 'CONFIRM PURCHASE', 'Machine Pistol · Epic · infusable, 1 open slot', [
        uiStack('V', [
          uiRow(544, 76, {accent:'gold', title:'Price', sub:'Grain of Sand', right:'510 ⏳', slot:sl('Center','Top',[0,0,0,12])}),
          uiRow(544, 76, {accent:'stroke', title:'Balance after', sub:'From 1,240', right:'730 ⏳', rightColor:'textDim', slot:sl('Center','Top')}),
        ], sl('Fill','Top'), 'Ledger'),
      ], [{text:'Buy'},{text:'Cancel'}], 'gold')));

    S.push(uiScreen('scr_insufficient','Insufficient Funds','popup','popup',
      'Tell the player exactly how short they are, and where that currency comes from. Never just "not enough".',
      'GameDevices/Gameplay/Screens/Popup','insufficient_funds',
      uiModal(600, 340, 'NOT ENOUGH SAND', 'You are 270 ⏳ short of the Machine Pistol.', [
        uiStack('V', [
          uiRow(504, 76, {accent:'danger', title:'You have', sub:'Grain of Sand', right:'240 ⏳', rightColor:'danger', slot:sl('Center','Top',[0,0,0,12])}),
          uiRow(504, 76, {accent:'ok', title:'Best source', sub:'Arcane Vault clear · depth 2', right:'~300 ⏳', rightColor:'ok', slot:sl('Center','Top')}),
        ], sl('Fill','Top'), 'Ledger'),
      ], [{text:'Got it'}], 'danger')));

    S.push(uiScreen('scr_confirm','Generic Confirm','popup','popup',
      'One reusable modal for every destructive action. Destructive verb on the loud button, never "Yes".',
      'GameDevices/Gameplay/Screens/Popup','confirm_modal',
      uiModal(560, 300, 'ABANDON RUN?', 'You keep Time Essence earned so far. Everything else in this run is lost.', [],
        [{text:'Abandon run'},{text:'Keep playing'}], 'danger')));

    /* ---------------- END OF RUN ---------------- */
    S.push(uiScreen('scr_room_clear','Room Cleared','end','popup',
      'Brief beat between rooms. Rewards, then straight into the upgrade choice — do not make the player click twice.',
      'GameDevices/Gameplay/Screens/End','room_clear',
      uiModal(720, 480, 'ROOM CLEARED', 'Arcane Vault · wave 5 of 5 · 01:47', [
        uiStack('V', [
          uiRow(624, 76, {accent:'gold', title:'Grain of Sand', sub:'Kills + clear bonus', right:'+312 ⏳', slot:sl('Center','Top',[0,0,0,12])}),
          uiRow(624, 76, {accent:'accentAlt', title:'Experience', sub:'23 kills · 4 elites', right:'+1,840', rightColor:'accentAlt', slot:sl('Center','Top',[0,0,0,12])}),
          uiRow(624, 76, {accent:'ok', title:'No damage bonus', sub:'Took 0 damage in wave 4', right:'+50 ⏳', rightColor:'ok', slot:sl('Center','Top')}),
        ], sl('Fill','Top'), 'Rewards'),
      ], [{text:'Continue'}], 'ok')));

    S.push(uiScreen('scr_run_death','Run Failed','end','menu',
      'The most-read screen in a roguelike. Lead with what carries over, not with the failure.',
      'GameDevices/Gameplay/Screens/End','run_death',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiStack('V', [
          uiText('THE THREAD SNAPPED', {size:'h1', color:'danger', justify:'Center'}, sl('Center','Top',[0,0,0,8]), 'Title'),
          uiText('Depth 2 · Arcane Vault · killed by Vault Warden', {size:'small', color:'textDim', justify:'Center'}, sl('Center','Top'), 'Subtitle'),
        ], csAnchor(0.5,0,0,140,1000,110,0.5,0), 'Header'),
        uiPanel(1160, 460, [uiStack('V', [
          uiText('CARRIES OVER', {size:'tiny', color:'gold'}, sl('Left','Top',[0,0,0,14]), 'Section'),
          uiRow(1064, 84, {accent:'curTimeEssence', title:'Time Essence', sub:'Permanent meta currency', right:'+9 💷', rightColor:'curTimeEssence', slot:sl('Center','Top',[0,0,0,12])}),
          uiRow(1064, 84, {accent:'accentAlt', title:'Player level', sub:'Level 6 → 7 · +1 skill point', right:'+1,840 XP', rightColor:'accentAlt', slot:sl('Center','Top',[0,0,0,22])}),
          uiText('LOST', {size:'tiny', color:'textMute'}, sl('Left','Top',[0,0,0,14]), 'Section 2'),
          uiRow(1064, 84, {accent:'stroke', title:'Grain of Sand · weapons · scrolls', sub:'Run-scoped, as designed', right:'−1,240 ⏳', rightColor:'textMute', slot:sl('Center','Top')}),
        ], sl('Fill','Fill'), 'Summary')], {padding:32, name:'Summary panel', slot:csAnchor(0.5,0,0,290,1160,460,0.5,0)}),
        uiStack('H', [
          uiButton('Run it again','loud', sl('Left','Fill')),
          uiButton('Back to Hub','quiet', sl('Left','Fill',[20,0,0,0])),
        ], csAnchor(0.5,1,0,-MY,760,72,0.5,1), 'Actions'),
      ], null, 'Root')));

    S.push(uiScreen('scr_run_victory','Run Complete','end','menu',
      'Same skeleton as Run Failed so the eye lands in the same place. Gold instead of red, and a rank.',
      'GameDevices/Gameplay/Screens/End','run_victory',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiStack('V', [
          uiText('THE HOURGLASS TURNS', {size:'h1', color:'gold', justify:'Center'}, sl('Center','Top',[0,0,0,8]), 'Title'),
          uiText('Run complete · 3 fractures · 24:16 · Normal', {size:'small', color:'textDim', justify:'Center'}, sl('Center','Top'), 'Subtitle'),
        ], csAnchor(0.5,0,0,140,1000,110,0.5,0), 'Header'),
        uiStack('H', [
          uiCard(360, 420, {accent:'gold', kicker:'RANK', title:'A', artH:150, body:'Cleared without a full wipe of your scroll pack.', footL:'Next: S', footR:'No damage x2', slot:sl('Left','Fill')}),
          uiCard(360, 420, {accent:'curTimeEssence', kicker:'EARNED', title:'26 💷', artH:150, body:'Time Essence carries into the Hub and the skill tree.', footL:'Best: 31', footR:'Meta', slot:sl('Left','Fill',[32,0,0,0])}),
          uiCard(360, 420, {accent:'accentAlt', kicker:'PROGRESS', title:'Level 9', artH:150, body:'+4,120 XP · 3 skill points unspent.', footL:'+3 points', footR:'Tree', slot:sl('Left','Fill',[32,0,0,0])}),
        ], csAnchor(0.5,0,0,300,1144,420,0.5,0), 'Summary cards'),
        uiButton('Return to Hub','loud', csAnchor(0.5,1,0,-MY,420,72,0.5,1)),
      ], null, 'Root')));

    /* ---------------- SYSTEM ---------------- */
    S.push(uiScreen('scr_pause','Pause Menu','end','menu',
      'Left rail of verbs, right pane of run state. Resume is always first and always focused.',
      'GameDevices/Gameplay/Screens/System','pause_menu',
      uiCanvas([
        uiRect('scrim', UI_STAGE_W, UI_STAGE_H, {opacity:0.8}, csFill(0,0,0,0), 'Scrim'),
        uiPanel(1200, 640, [uiStack('H', [
          uiStack('V', [
            uiText('PAUSED', {size:'h2', color:'text'}, sl('Left','Top',[0,0,0,28]), 'Title'),
            uiButton('Resume','loud', sl('Left','Top',[0,0,0,14])),
            uiButton('Settings','quiet', sl('Left','Top',[0,0,0,14])),
            uiButton('Controls','quiet', sl('Left','Top',[0,0,0,14])),
            uiButton('Abandon run','quiet', sl('Left','Top')),
          ], sl('Left','Fill'), 'Verb rail'),
          uiStack('V', [
            uiText('THIS RUN', {size:'tiny', color:'gold'}, sl('Left','Top',[0,0,0,14]), 'Section'),
            uiRow(640, 76, {accent:'gold', title:'Depth 2 · Arcane Vault', sub:'Wave 3 of 5', right:'11:20', slot:sl('Left','Top',[0,0,0,12])}),
            uiRow(640, 76, {accent:'rarityEpic', title:'Machine Pistol', sub:'Frost Mark infusion', right:'DPS 214', rightColor:'rarityEpic', slot:sl('Left','Top',[0,0,0,12])}),
            uiRow(640, 76, {accent:'curSandGrain', title:'Grain of Sand', sub:'Spendable at the next merchant', right:'412 ⏳', slot:sl('Left','Top')}),
          ], sl('Left','Fill',[56,0,0,0]), 'Run state'),
        ], sl('Fill','Fill'), 'Pause body')], {padding:44, name:'Pause panel'}),
      ], null, 'Root')));

    S.push(uiScreen('scr_settings','Settings','end','menu',
      'Grouped rows, value right-aligned. Every row shows its current value as text — sliders alone are unreadable on a TV.',
      'GameDevices/Gameplay/Screens/System','settings_menu',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiPageHeader('Settings','Applies immediately. Nothing here needs a confirm.','accent'),
        uiPanel(1300, 620, [uiStack('V', [
          uiTabStrip(['Audio','Video','Controls','Accessibility'], 0, 1204),
          uiRow(1204, 82, {accent:'accent', title:'Master volume', sub:'All audio', right:'80%', rightColor:'accent', slot:sl('Left','Top',[0,18,0,0])}),
          uiRow(1204, 82, {accent:'stroke', title:'Music volume', sub:'Score and hub ambience', right:'55%', rightColor:'textDim', slot:sl('Left','Top',[0,12,0,0])}),
          uiRow(1204, 82, {accent:'stroke', title:'Hit feedback', sub:'Damage numbers in the run HUD', right:'On', rightColor:'ok', slot:sl('Left','Top',[0,12,0,0])}),
          uiRow(1204, 82, {accent:'stroke', title:'Screen shake', sub:'Reduce for motion sensitivity', right:'50%', rightColor:'textDim', slot:sl('Left','Top')}),
        ], sl('Fill','Fill'), 'Settings body')], {padding:32, name:'Settings panel', slot:csAnchor(0.5,0,0,250,1300,620,0.5,0)}),
        uiFooterHint(['[↑/↓] Row','[←/→] Adjust','[Esc] Back']),
      ], null, 'Root')));

    S.push(uiScreen('scr_leaderboard','Leaderboard','end','menu',
      'Own row pinned and highlighted, even when off-page. A board you are not on is a board you ignore.',
      'GameDevices/Gameplay/Screens/System','leaderboard',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiPageHeader('Deepest fractures','Ranked by depth, then by clear time.','gold'),
        uiPanel(1300, 600, [uiStack('V', [
          uiRow(1204, 78, {accent:'gold', title:'1 · Wrenfold', sub:'Depth 7 · Hard', right:'21:04', slot:sl('Left','Top',[0,0,0,10])}),
          uiRow(1204, 78, {accent:'rarityCommon', title:'2 · Sable', sub:'Depth 6 · Hard', right:'23:41', rightColor:'textDim', slot:sl('Left','Top',[0,0,0,10])}),
          uiRow(1204, 78, {accent:'rarityCommon', title:'3 · Okonkwo', sub:'Depth 6 · Normal', right:'19:58', rightColor:'textDim', slot:sl('Left','Top',[0,0,0,10])}),
          uiRow(1204, 78, {accent:'accent', title:'14 · YOU', sub:'Depth 3 · Normal', right:'24:16', rightColor:'accent', slot:sl('Left','Top')}),
        ], sl('Fill','Fill'), 'Board')], {padding:32, name:'Board panel', slot:csAnchor(0.5,0,0,250,1300,600,0.5,0)}),
      ], null, 'Root')));

    return S;
  }

  const UI_STAGES = [
    { id:'boot',  label:'Boot / Front end', icon:'power' },
    { id:'hub',   label:'Hub',              icon:'home' },
    { id:'run',   label:'In run',           icon:'swords' },
    { id:'combat',label:'Combat overlays',  icon:'crosshair' },
    { id:'popup', label:'Popups',           icon:'message-square' },
    { id:'end',   label:'End of run / system', icon:'flag' },
  ];
  const UI_CATEGORIES = ['hud','menu','shop','popup','dialog','overlay'];
  const UI_STATUSES = [
    { id:'design',   label:'Designing', color:'text-amber-300 bg-amber-900/40' },
    { id:'approved', label:'Approved',  color:'text-sky-300 bg-sky-900/40' },
    { id:'built',    label:'Built in UEFN', color:'text-emerald-300 bg-emerald-900/40' },
  ];

  /* ======================================================================
     UI SCREENS — 04 · LAYOUT + PREVIEW RENDERER
     Reimplements the three Verse layout panels (canvas / overlay / stack_box)
     with the same rules UMG uses, then paints the result as absolutely
     positioned divs on a 1920x1080 stage. If the preview is wrong the Verse
     will be wrong, so the maths here is the contract — not the CSS.

     canvas_slot per axis:
       anchor min == max  -> Offsets.L/T is the position, Offsets.R/B is the size
       anchor min != max  -> Offsets.L/T is the near inset, R/B is the far inset
       Alignment is the widget's own pivot (0,0 top-left .. 1,1 bottom-right)
     ====================================================================== */

  /* Fortnite's UI font is condensed; 0.50em average advance tracks it closely
     enough to catch overflow in the preview. */
  const UI_CHAR_W = 0.50, UI_LINE_H = 1.26;

  function uiTextSize(props){
    const size=uiSize(props.size||18);
    const str=String(props.text==null?'':props.text);
    const lines=str.split('\n');
    let w=0; for(const l of lines) w=Math.max(w, l.length*size*UI_CHAR_W);
    let n=lines.length;
    if(props.wrap && props.wrapWidth>0 && w>props.wrapWidth){
      n=Math.ceil(w/props.wrapWidth); w=props.wrapWidth;
    }
    return { w:Math.ceil(w), h:Math.ceil(size*UI_LINE_H*n) };
  }
  function uiButtonSize(props){
    const label=String(props.text||'');
    return { w:Math.max(180, Math.ceil(label.length*11)+80), h:56 };
  }
  function uiPadOf(n){ const p=(n.slot&&n.slot.pad)||[0,0,0,0]; return {l:p[0]||0,t:p[1]||0,r:p[2]||0,b:p[3]||0}; }

  /* Desired size, ignoring the slot's own padding (the parent adds that). */
  function uiMeasure(n, availW, availH){
    if(!n) return {w:0,h:0};
    switch(n.type){
      case 'text':     return uiTextSize(n.props);
      case 'button':   return uiButtonSize(n.props);
      case 'rect':
      case 'image':
      case 'material': return { w:+n.props.w||0, h:+n.props.h||0 };
      case 'canvas':   return { w:availW, h:availH };
      case 'overlay': {
        let w=0,h=0;
        for(const c of n.children||[]){
          const p=uiPadOf(c), d=uiMeasure(c, availW, availH);
          w=Math.max(w, d.w+p.l+p.r); h=Math.max(h, d.h+p.t+p.b);
        }
        return {w,h};
      }
      case 'stack': {
        const vert=(n.props.orient||'V')==='V';
        let along=0, cross=0;
        for(const c of n.children||[]){
          const p=uiPadOf(c), d=uiMeasure(c, availW, availH);
          const cw=d.w+p.l+p.r, ch=d.h+p.t+p.b;
          if(vert){ along+=ch; cross=Math.max(cross,cw); } else { along+=cw; cross=Math.max(cross,ch); }
        }
        return vert ? {w:cross,h:along} : {w:along,h:cross};
      }
      default: return {w:0,h:0};
    }
  }

  function uiCanvasRect(slot, pw, ph, desired){
    const a0=slot.aMin||[0,0], a1=slot.aMax||[0,0], o=slot.off||[0,0,0,0], al=slot.align||[0,0];
    let x,y,w,h;
    if(a0[0]===a1[0]){ w = slot.stc ? desired.w : (+o[2]||0); x = a0[0]*pw + (+o[0]||0) - (al[0]||0)*w; }
    else { const left=a0[0]*pw+(+o[0]||0), right=a1[0]*pw-(+o[2]||0); x=left; w=Math.max(0,right-left); }
    if(a0[1]===a1[1]){ h = slot.stc ? desired.h : (+o[3]||0); y = a0[1]*ph + (+o[1]||0) - (al[1]||0)*h; }
    else { const top=a0[1]*ph+(+o[1]||0), bot=a1[1]*ph-(+o[3]||0); y=top; h=Math.max(0,bot-top); }
    return {x,y,w,h};
  }
  function uiAlignIn(boxPos, boxLen, want, mode){
    if(mode==='Fill') return {pos:boxPos, len:boxLen};
    const len=Math.min(want, boxLen);
    if(mode==='Left'||mode==='Top')     return {pos:boxPos, len};
    if(mode==='Right'||mode==='Bottom') return {pos:boxPos+boxLen-len, len};
    return {pos:boxPos+(boxLen-len)/2, len};
  }

  /* Active designer view chips: one id per group (mode / category / page). */
  function uiActiveViews(){
    const m=(state.meta&&state.meta.uiViews)||{};
    return m;
  }
  function uiViewVisible(n){
    const v=n&&n.props&&n.props.view;
    if(!v||!v.group) return true;
    /* Mode hosts stay mounted so list↔details can slide (React ShopUI). */
    if(v.group==='mode') return true;
    const active=uiActiveViews()[v.group];
    if(active==null||active==='') return !!v.initial;
    return String(active)===String(v.id);
  }
  function uiModeSlideState(modeId){
    const activeRaw=uiActiveViews().mode;
    const active=(activeRaw!=null&&activeRaw!=='')?String(activeRaw):'listing';
    const on=String(active)===String(modeId);
    if(String(modeId)==='listing') return on?{dx:0,op:1,cls:'is-on'}:{dx:-UI_STAGE_W,op:0,cls:'is-off-left'};
    if(String(modeId)==='details') return on?{dx:0,op:1,cls:'is-on'}:{dx:UI_STAGE_W,op:0,cls:'is-off-right'};
    return on?{dx:0,op:1,cls:'is-on'}:{dx:0,op:0,cls:'is-off'};
  }
  function uiCollectViews(root){
    const groups={};
    uiWalk(root, n=>{
      const v=n.props&&n.props.view;
      if(!v||!v.group) return;
      if(!groups[v.group]) groups[v.group]=[];
      if(!groups[v.group].some(x=>x.id===v.id)) groups[v.group].push({id:v.id, label:v.label||v.id, initial:!!v.initial});
    });
    return groups;
  }
  function uiEnsureViewDefaults(root){
    if(!state.meta) state.meta={};
    if(!state.meta.uiViews) state.meta.uiViews={};
    const groups=uiCollectViews(root);
    Object.keys(groups).forEach(g=>{
      if(state.meta.uiViews[g]==null||state.meta.uiViews[g]===''){
        const init=groups[g].find(x=>x.initial)||groups[g][0];
        if(init) state.meta.uiViews[g]=init.id;
      }
    });
    return groups;
  }

  /* Flatten the tree into painted boxes in stage coordinates, in paint order. */
  function uiFlatten(root){
    const out=[];
    function place(n, rect, depth, fxIndex, modeSlide){
      if(!uiViewVisible(n)) return;
      let nextSlide=modeSlide||null;
      if(n.props&&n.props.modeSlide){
        nextSlide=uiModeSlideState(n.props.view&&n.props.view.id||n.props.modeSlide);
      }
      out.push({node:n, ...rect, depth, fxIndex:fxIndex||0, modeSlide:nextSlide});
      if(!UI_TYPES[n.type].container) return;
      const kids=(n.children||[]).filter(uiViewVisible);
      if(n.type==='canvas'){
        kids.sort((a,b)=>((a.slot.z||0)-(b.slot.z||0)));
        kids.forEach((c,i)=>{
          const d=uiMeasure(c, rect.w, rect.h);
          const r=uiCanvasRect(c.slot, rect.w, rect.h, d);
          place(c, {x:rect.x+r.x, y:rect.y+r.y, w:r.w, h:r.h}, depth+1, i, nextSlide);
        });
        return;
      }
      if(n.type==='overlay'){
        kids.forEach((c,i)=>{
          const p=uiPadOf(c);
          const bx=rect.x+p.l, by=rect.y+p.t, bw=Math.max(0,rect.w-p.l-p.r), bh=Math.max(0,rect.h-p.t-p.b);
          const d=uiMeasure(c, bw, bh);
          const H=uiAlignIn(bx,bw,d.w,c.slot.h||'Fill'), V=uiAlignIn(by,bh,d.h,c.slot.v||'Fill');
          place(c, {x:H.pos, y:V.pos, w:H.len, h:V.len}, depth+1, i, nextSlide);
        });
        return;
      }
      /* stack_box */
      const vert=(n.props.orient||'V')==='V';
      const total=vert?rect.h:rect.w;
      let fixed=0, weight=0;
      const meta=kids.map(c=>{
        const p=uiPadOf(c), d=uiMeasure(c, rect.w, rect.h);
        const along=(vert? d.h+p.t+p.b : d.w+p.l+p.r);
        const dist=(c.slot.dist==null?null:+c.slot.dist);
        if(dist==null) fixed+=along; else weight+=dist;
        return {c,p,d,along,dist};
      });
      const free=Math.max(0, total-fixed);
      let cursor=vert?rect.y:rect.x;
      meta.forEach((m,i)=>{
        const span=(m.dist==null) ? m.along : (weight>0 ? free*(m.dist/weight) : 0);
        if(vert){
          const by=cursor+m.p.t, bh=Math.max(0,span-m.p.t-m.p.b);
          const bx=rect.x+m.p.l, bw=Math.max(0,rect.w-m.p.l-m.p.r);
          const H=uiAlignIn(bx,bw,m.d.w,m.c.slot.h||'Fill'), V=uiAlignIn(by,bh,m.d.h,m.c.slot.v||'Fill');
          place(m.c, {x:H.pos, y:V.pos, w:H.len, h:V.len}, depth+1, i, nextSlide);
        } else {
          const bx=cursor+m.p.l, bw=Math.max(0,span-m.p.l-m.p.r);
          const by=rect.y+m.p.t, bh=Math.max(0,rect.h-m.p.t-m.p.b);
          const H=uiAlignIn(bx,bw,m.d.w,m.c.slot.h||'Fill'), V=uiAlignIn(by,bh,m.d.h,m.c.slot.v||'Fill');
          place(m.c, {x:H.pos, y:V.pos, w:H.len, h:V.len}, depth+1, i, nextSlide);
        }
        cursor+=span;
      });
    }
    place(root, {x:0,y:0,w:UI_STAGE_W,h:UI_STAGE_H}, 0, 0, null);
    return out;
  }

  /* ---- paint ---- */
  const UI_JUSTIFY_CSS={Left:'flex-start', Center:'center', Right:'flex-end'};
  function uiBoxHtml(b, selId, showBoxes){
    const n=b.node;
    const fx=n.props&&n.props.fx;
    const fxStyle=fx?`--i:${(n.props.fxIndex!=null?n.props.fxIndex:b.fxIndex)||0};`:'';
    const fxCls=fx?` ui-fx-${fx}`:'';
    const ms=b.modeSlide;
    const modeCls=ms?` ui-mode-host ${ms.cls}`:'';
    const modeStyle=ms?`transform:translateX(${ms.dx}px);opacity:${ms.op};`:'';
    const s=`left:${b.x}px;top:${b.y}px;width:${Math.max(0,b.w)}px;height:${Math.max(0,b.h)}px;${fxStyle}${modeStyle}`;
    const sel=n.id===selId ? ' is-sel' : '';
    const click=`onclick="event.stopPropagation();RGD.uiSelect('${n.id}')"`;
    if(n.type==='text'){
      const p=n.props, size=uiSize(p.size);
      const sh=p.shadow?`text-shadow:2px 2px 0 ${uiRgba(p.shadowColor,p.shadowOpacity)};`:'';
      const wrap=!!p.wrap && +p.wrapWidth>0;
      const ws=wrap?'pre-wrap':'pre';
      const alignY=wrap?'flex-start':'center';
      const spanW=wrap?`width:100%;max-width:${Math.max(1,+p.wrapWidth||b.w)}px;`: '';
      return `<div class="ui-box ui-t-text${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}display:flex;align-items:${alignY};justify-content:${UI_JUSTIFY_CSS[p.justify]||'flex-start'};overflow:hidden;">
        <span style="font-size:${size}px;line-height:${UI_LINE_H};color:${uiRgba(p.color,p.opacity)};${sh}${spanW}white-space:${ws};word-break:break-word;font-weight:600;letter-spacing:.01em;">${esc(p.text)}</span></div>`;
    }
    if(n.type==='rect'){
      return `<div class="ui-box ui-t-rect${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}background:${uiRgba(n.props.color,n.props.opacity)};"></div>`;
    }
    if(n.type==='image'){
      return `<div class="ui-box ui-t-image${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}background:${uiRgba(n.props.tint,(n.props.opacity)*0.22)};border:1px dashed ${uiRgba(n.props.tint,0.55)};display:flex;align-items:center;justify-content:center;">
        <span style="font-size:11px;color:${uiRgba(n.props.tint,0.8)};font-family:ui-monospace,monospace;overflow:hidden;">${esc(String(n.props.image).split('.').pop())}</span></div>`;
    }
    if(n.type==='material'){
      return `<div class="ui-box ui-t-image${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}background:repeating-linear-gradient(45deg,#1e293b,#1e293b 8px,#334155 8px,#334155 16px);display:flex;align-items:center;justify-content:center;">
        <span style="font-size:11px;color:#cbd5e1;font-family:ui-monospace,monospace;">${esc(n.props.material)}</span></div>`;
    }
    if(n.type==='button'){
      const vis=uiButtonVisual(n.props.variant||'loud', n.props.state||'normal');
      return `<div class="ui-box ui-t-button${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}background:${vis.fill};border:2px solid ${vis.border};opacity:${vis.opacity};display:flex;align-items:center;justify-content:center;">
        <span style="font-size:${vis.textSize}px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${vis.text};">${esc(n.props.text)}</span></div>`;
    }
    /* containers — asButton paints ApplyVisual chrome so locked/hot/selected are visible */
    if(n.props&&n.props.asButton){
      const vis=uiButtonVisual(n.props.variant||'card', n.props.state||'normal');
      return `<div class="ui-box ui-t-cont ui-as-btn${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}background:${vis.fill};border:2px solid ${vis.border};opacity:${vis.opacity};box-sizing:border-box;"></div>`;
    }
    const on = showBoxes || sel;
    return `<div class="ui-box ui-t-cont${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}${on?'':'border-color:transparent;'}"></div>`;
  }
  function uiRenderStage(screen, selId, showBoxes){
    const boxes=uiFlatten(screen.root);
    return boxes.map(b=>uiBoxHtml(b, selId, showBoxes)).join('');
  }

  /* ======================================================================
     UI SCREENS — 05 · LAYER TREE + INSPECTOR
     Left of the inspector is the widget tree; right of it is every field that
     the Verse generator can emit. Nothing is editable here that cannot be
     exported, and nothing is exported that cannot be edited here.
     ====================================================================== */

  const UI_ANCHOR_PRESETS = {
    'Top left':      {aMin:[0,0],   aMax:[0,0],   align:[0,0]},
    'Top centre':    {aMin:[0.5,0], aMax:[0.5,0], align:[0.5,0]},
    'Top right':     {aMin:[1,0],   aMax:[1,0],   align:[1,0]},
    'Centre':        {aMin:[0.5,0.5],aMax:[0.5,0.5],align:[0.5,0.5]},
    'Bottom left':   {aMin:[0,1],   aMax:[0,1],   align:[0,1]},
    'Bottom centre': {aMin:[0.5,1], aMax:[0.5,1], align:[0.5,1]},
    'Bottom right':  {aMin:[1,1],   aMax:[1,1],   align:[1,1]},
    'Stretch all':   {aMin:[0,0],   aMax:[1,1],   align:[0,0]},
    'Stretch top':   {aMin:[0,0],   aMax:[1,0],   align:[0,0]},
    'Stretch bottom':{aMin:[0,1],   aMax:[1,1],   align:[0,0]},
  };
  function uiAnchorPresetName(s){
    for(const k of Object.keys(UI_ANCHOR_PRESETS)){
      const p=UI_ANCHOR_PRESETS[k];
      if(p.aMin[0]===s.aMin[0]&&p.aMin[1]===s.aMin[1]&&p.aMax[0]===s.aMax[0]&&p.aMax[1]===s.aMax[1]) return k;
    }
    return 'Custom';
  }

  /* ---- tiny form controls, styled to match the rest of the panel ---- */
  const uiInpCls='w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:border-indigo-500 focus:outline-none';
  function uiRowLbl(label, control){
    return `<label class="flex items-center gap-2 mb-1.5"><span class="w-24 shrink-0 text-[11px] text-gray-400">${esc(label)}</span><span class="flex-1 min-w-0">${control}</span></label>`;
  }
  function uiNum(val, handler, step){
    return `<input type="number" step="${step||1}" value="${val==null?0:val}" onchange="${handler}" class="${uiInpCls}">`;
  }
  function uiTxt(val, handler){
    return `<input type="text" value="${esc(val==null?'':val)}" onchange="${handler}" class="${uiInpCls}">`;
  }
  function uiSel(val, opts, handler){
    return `<select onchange="${handler}" class="${uiInpCls}">${opts.map(o=>{
      const v=typeof o==='string'?o:o.v, l=typeof o==='string'?o:o.l;
      return `<option value="${esc(v)}" ${String(v)===String(val)?'selected':''}>${esc(l)}</option>`;
    }).join('')}</select>`;
  }
  function uiChk(val, handler){
    return `<input type="checkbox" ${val?'checked':''} onchange="${handler}" class="w-4 h-4 accent-indigo-500">`;
  }
  function uiColorField(val, handler){
    const isTok = val && val.charAt(0)!=='#';
    const opts=[{v:'',l:'— custom hex —'}].concat(UI_COLOR_TOKENS.map(t=>({v:t,l:t})));
    return `<span class="flex items-center gap-1.5">
      <span class="w-5 h-5 rounded shrink-0 border border-gray-600" style="background:${uiColor(val)}"></span>
      ${uiSel(isTok?val:'', opts, handler.replace('$V','this.value'))}
      <input type="text" value="${esc(isTok?'':(val||''))}" placeholder="#RRGGBB" onchange="${handler.replace('$V','this.value')}" class="${uiInpCls} w-24">
    </span>`;
  }
  function uiQuad(vals, handler, labels){
    const L=labels||['L','T','R','B'];
    return `<span style="display:grid;grid-template-columns:repeat(${L.length},minmax(0,1fr));gap:4px">${L.map((l,i)=>
      `<span class="flex items-center gap-0.5"><span class="text-[10px] text-gray-500">${l}</span>
       <input type="number" value="${vals[i]||0}" onchange="${handler.replace('$I',i)}" class="${uiInpCls} px-1">`+
      `</span>`).join('')}</span>`;
  }

  /* ---- layer tree ---- */
  function uiCollapsedMap(){
    if(!state.meta) state.meta={};
    if(!state.meta.uiCollapsed || typeof state.meta.uiCollapsed!=='object') state.meta.uiCollapsed={};
    return state.meta.uiCollapsed;
  }
  function uiIsCollapsed(node){
    const map=uiCollapsedMap();
    if(Object.prototype.hasOwnProperty.call(map, node.id)) return !!map[node.id];
    return !!(node.props&&node.props.collapseDefault);
  }
  function uiLayerRows(node, depth, selId, parentType){
    const meta=UI_TYPES[node.type];
    const on = node.id===selId;
    const bind = node.bind ? `<span class="ui-bind-pill">${esc(node.bind)}</span>` : '';
    const kids=node.children||[];
    const hasKids=!!(meta.container && kids.length);
    const collapsed=hasKids && uiIsCollapsed(node);
    const chev=hasKids
      ? `<button type="button" class="ui-layer-chev" onclick="event.stopPropagation();RGD.uiToggleCollapse('${node.id}')" title="${collapsed?'Expand':'Collapse'}"><i data-lucide="${collapsed?'chevron-right':'chevron-down'}" class="w-3 h-3"></i></button>`
      : `<span class="ui-layer-chev-spacer"></span>`;
    const viewPill=(node.props&&node.props.view)?`<span class="ui-view-pill">${esc(node.props.view.group)}:${esc(node.props.view.id)}</span>`:'';
    let html=`<div class="ui-layer${on?' is-sel':''}" style="padding-left:${8+depth*14}px" onclick="RGD.uiSelect('${node.id}')">
      ${chev}
      <i data-lucide="${meta.icon}" class="w-3.5 h-3.5 shrink-0 ${on?'text-indigo-300':'text-gray-500'}"></i>
      <span class="ui-layer-name">${esc(node.name||meta.label)}</span>${bind}${viewPill}
      <span class="ui-layer-type">${meta.verse}</span></div>`;
    if(!collapsed){
      for(const c of kids) html+=uiLayerRows(c, depth+1, selId, node.type);
    }
    return html;
  }
  function uiExpandAncestors(root, id){
    if(!root||!id) return;
    const map=uiCollapsedMap();
    let cur=uiFindParent(root, id);
    while(cur){
      map[cur.id]=false;
      cur=uiFindParent(root, cur.id);
    }
  }

  /* ---- inspector ---- */
  function uiInspector(screen, sel){
    if(!sel) return `<div class="p-4 text-xs text-gray-500">Select a widget in the preview or the layer tree.</div>`;
    const parent=uiFindParent(screen.root, sel.id);
    const kind=parent?uiSlotKind(parent.type):null;
    const P=`RGD.uiProp('${sel.id}',`, S=`RGD.uiSlot('${sel.id}',`;
    const meta=UI_TYPES[sel.type], p=sel.props, s=sel.slot;
    const sec=(t,b)=>`<div class="ui-sec"><div class="ui-sec-h">${t}</div><div class="ui-sec-b">${b}</div></div>`;

    /* node */
    let node = uiRowLbl('Name', uiTxt(sel.name, `RGD.uiNode('${sel.id}','name',this.value)`));
    node += uiRowLbl('Verse type', `<span class="text-[11px] font-mono text-indigo-300">${meta.verse}</span>`);
    if(!meta.container || (sel.props && sel.props.asButton)) node += uiRowLbl('Bind as', uiTxt(sel.bind||'', `RGD.uiNode('${sel.id}','bind',this.value)`))
      + `<div class="text-[10px] text-gray-500 -mt-1 mb-1">Named widgets become class fields you can SetText/SetColor at runtime.</div>`;
    if(meta.container && sel.type!=='canvas') node += uiRowLbl('Whole element is a button', uiChk(!!(sel.props&&sel.props.asButton), `RGD.uiProp('${sel.id}','asButton',this.checked)`))
      + `<div class="text-[10px] text-gray-500 -mt-1 mb-1">Wraps this container in a native chrome-less button so the entire card/row is clickable.</div>`;
    if(meta.container){
      const v=p.view||{};
      node += uiRowLbl('View group', uiTxt(v.group||'', `RGD.uiViewField('${sel.id}','group',this.value)`))
        + uiRowLbl('View id', uiTxt(v.id||'', `RGD.uiViewField('${sel.id}','id',this.value)`))
        + uiRowLbl('Initial view', uiChk(!!v.initial, `RGD.uiViewField('${sel.id}','initial',this.checked)`))
        + `<div class="text-[10px] text-gray-500 -mt-1 mb-1">Preview-only: one visible child per group. Exporter ignores this.</div>`;
    }
    if((sel.type==='button') || (sel.props&&sel.props.asButton)){
      node += uiRowLbl('Preview state', uiSel(p.state||'normal', ['normal','hot','selected','locked'], `${P}'state',this.value)`))
        + `<div class="text-[10px] text-gray-500 -mt-1 mb-1">Designer-only ApplyVisual skin (hot / selected / locked).</div>`;
    }

    /* slot */
    let slot='<div class="text-[11px] text-gray-500">Root widget — the canvas fills the screen.</div>';
    if(kind==='canvas'){
      slot = uiRowLbl('Anchor', uiSel(uiAnchorPresetName(s), ['Custom'].concat(Object.keys(UI_ANCHOR_PRESETS)), `RGD.uiAnchorPreset('${sel.id}',this.value)`))
        + uiRowLbl('Anchor min', uiQuad([s.aMin[0],s.aMin[1]], `${S}'aMin',$I,+this.value)`, ['X','Y']))
        + uiRowLbl('Anchor max', uiQuad([s.aMax[0],s.aMax[1]], `${S}'aMax',$I,+this.value)`, ['X','Y']))
        + uiRowLbl('Offsets', uiQuad(s.off, `${S}'off',$I,+this.value)`))
        + uiRowLbl('Alignment', uiQuad([s.align[0],s.align[1]], `${S}'align',$I,+this.value)`, ['X','Y']))
        + uiRowLbl('Z order', uiNum(s.z, `${S}'z',null,+this.value)`))
        + uiRowLbl('Size to content', uiChk(s.stc, `${S}'stc',null,this.checked)`))
        + `<div class="text-[10px] text-gray-500 mt-1">Per axis: anchor min = max → Offsets L/T is position, R/B is size. Otherwise they are insets.</div>`;
    } else if(kind==='flow'){
      slot = uiRowLbl('Horizontal', uiSel(s.h, ['Fill','Left','Center','Right'], `${S}'h',null,this.value)`))
        + uiRowLbl('Vertical', uiSel(s.v, ['Fill','Top','Center','Bottom'], `${S}'v',null,this.value)`))
        + uiRowLbl('Padding', uiQuad(s.pad, `${S}'pad',$I,+this.value)`));
      if(parent.type==='stack') slot += uiRowLbl('Distribution', uiTxt(s.dist==null?'':s.dist, `${S}'dist',null,this.value)`))
        + `<div class="text-[10px] text-gray-500 -mt-1">Blank = size to content. A number takes that share of the leftover space.</div>`;
    }

    /* props */
    let props='';
    if(sel.type==='text'){
      props = uiRowLbl('Text', `<textarea rows="2" onchange="${P}'text',this.value)" class="${uiInpCls}">${esc(p.text)}</textarea>`)
        + uiRowLbl('Size', uiSel(String(uiSize(p.size)), UI_TYPE_TOKENS.map(t=>({v:String(uiTheme().type[t]),l:`${t} · ${uiTheme().type[t]}px`})).concat([{v:String(uiSize(p.size)),l:uiSize(p.size)+'px (custom)'}]), `${P}'size',+this.value)`))
        + uiRowLbl('Colour', uiColorField(p.color, `${P}'color',$V)`))
        + uiRowLbl('Opacity', uiNum(p.opacity, `${P}'opacity',+this.value)`, 0.05))
        + uiRowLbl('Justify', uiSel(p.justify, ['Left','Center','Right'], `${P}'justify',this.value)`))
        + uiRowLbl('Wrap', uiChk(p.wrap, `${P}'wrap',this.checked)`))
        + (p.wrap?uiRowLbl('Wrap width', uiNum(p.wrapWidth, `${P}'wrapWidth',+this.value)`)):'')
        + uiRowLbl('Shadow', uiChk(p.shadow, `${P}'shadow',this.checked)`));
    } else if(sel.type==='rect'){
      props = uiRowLbl('Colour', uiColorField(p.color, `${P}'color',$V)`))
        + uiRowLbl('Opacity', uiNum(p.opacity, `${P}'opacity',+this.value)`, 0.05))
        + uiRowLbl('Width', uiNum(p.w, `${P}'w',+this.value)`))
        + uiRowLbl('Height', uiNum(p.h, `${P}'h',+this.value)`));
    } else if(sel.type==='image'){
      props = uiRowLbl('Image', uiTxt(p.image, `${P}'image',this.value)`))
        + `<div class="text-[10px] text-gray-500 -mt-1 mb-1">A Verse texture identifier, e.g. Textures.T_Empty — not a /Game path.</div>`
        + uiRowLbl('Tint', uiColorField(p.tint, `${P}'tint',$V)`))
        + uiRowLbl('Width', uiNum(p.w, `${P}'w',+this.value)`))
        + uiRowLbl('Height', uiNum(p.h, `${P}'h',+this.value)`));
    } else if(sel.type==='material'){
      props = uiRowLbl('Material', uiTxt(p.material, `${P}'material',this.value)`))
        + uiRowLbl('Width', uiNum(p.w, `${P}'w',+this.value)`))
        + uiRowLbl('Height', uiNum(p.h, `${P}'h',+this.value)`));
    } else if(sel.type==='button'){
      props = uiRowLbl('Label', uiTxt(p.text, `${P}'text',this.value)`))
        + uiRowLbl('Variant', uiSel(p.variant, [{v:'loud',l:'Primary (gold)'},{v:'regular',l:'Row'},{v:'quiet',l:'Ghost'},{v:'danger',l:'Danger'}], `${P}'variant',this.value)`));
    } else if(sel.type==='stack'){
      props = uiRowLbl('Orientation', uiSel(p.orient, [{v:'V',l:'Vertical'},{v:'H',l:'Horizontal'}], `${P}'orient',this.value)`));
      if(p.asButton) props += uiRowLbl('Button skin', uiSel(p.variant||'row', [{v:'loud',l:'Primary'},{v:'regular',l:'Row'},{v:'quiet',l:'Ghost'},{v:'card',l:'Card'},{v:'row',l:'Row'},{v:'danger',l:'Danger'}], `${P}'variant',this.value)`));
    } else if(sel.type==='overlay'){
      if(p.asButton) props = uiRowLbl('Button skin', uiSel(p.variant||'card', [{v:'loud',l:'Primary'},{v:'regular',l:'Row'},{v:'quiet',l:'Ghost'},{v:'card',l:'Card'},{v:'row',l:'Row'},{v:'danger',l:'Danger'}], `${P}'variant',this.value)`));
      else props = `<div class="text-[11px] text-gray-500">${meta.label} has no properties of its own — it only positions its children.</div>`;
    } else {
      props = `<div class="text-[11px] text-gray-500">${meta.label} has no properties of its own — it only positions its children.</div>`;
    }

    /* add-child palette for containers */
    let add='';
    if(meta.container){
      add = `<div class="flex flex-wrap gap-1">${Object.keys(UI_TYPES).map(t=>
        `<button onclick="RGD.uiAdd('${t}')" class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px] flex items-center gap-1"><i data-lucide="${UI_TYPES[t].icon}" class="w-3 h-3"></i>${UI_TYPES[t].label}</button>`).join('')}</div>`;
    }

    return sec('Widget', node)
      + sec('Slot in '+(parent?UI_TYPES[parent.type].verse:'—'), slot)
      + sec('Properties', props)
      + (add?sec('Add child', add):'')
      + sec('Actions', `<div class="flex flex-wrap gap-1">
          <button onclick="RGD.uiMoveSel(-1)" class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px]">↑ Up</button>
          <button onclick="RGD.uiMoveSel(1)" class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px]">↓ Down</button>
          <button onclick="RGD.uiDupSel()" class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px]">Duplicate</button>
          <button onclick="RGD.uiDelSel()" class="px-2 py-1 rounded bg-red-900/70 hover:bg-red-800 text-[11px] text-red-200">Delete</button>
        </div>`);
  }

  /* ======================================================================
     UI SCREENS — 06 · VERSE CODEGEN
     Turns a screen tree into a *_canvas builder class in the same shape as the
     project's existing top_hud_canvas.verse, plus a device stub that shows and
     hides it. Only fields that exist on the real widget classes are emitted —
     verified against Fortnite.digest / UnrealEngine.digest:

       text_block      DefaultText / DefaultTextColor / DefaultTextSize /
                       DefaultTextOpacity / DefaultJustification / DefaultShadow*
       color_block     DefaultColor / DefaultOpacity / DefaultDesiredSize
       texture_block   DefaultImage / DefaultTint / DefaultDesiredSize
       material_block  DefaultImage / DefaultTint / DefaultDesiredSize
       button          chrome-less Slot := button_slot{ Widget := overlay{ border, fill, text } }
       canvas_slot     Anchors / Offsets / Alignment / SizeToContent / ZOrder
       stack_box_slot  HorizontalAlignment / VerticalAlignment / Padding / Distribution
       overlay_slot    HorizontalAlignment / VerticalAlignment / Padding
       props.asButton  wraps overlay/stack in the same native button pattern

     DefaultText is `<localizes>:message`, so a bare string literal does NOT
     compile — every label becomes a module-scope `<localizes>` constant that the
     archetype references. Module scope specifically: a class field initialiser
     cannot read a sibling class member ("Accessing instance member ... is not yet
     implemented"), which rules out putting the messages inside the class. Names
     are prefixed with the class so two screens in the same folder cannot clash.

     A node with a `bind` becomes a class field so runtime code can call
     SetText / SetColor / SetDesiredSize on it; everything else is inlined.
     ====================================================================== */

  const VI = '    ';                                   /* one Verse indent */
  function vind(n){ return VI.repeat(n); }
  function vf(v){
    const x=Math.round((+v||0)*100)/100;
    return Number.isInteger(x) ? x.toFixed(1) : String(x);
  }
  function vstr(s){
    return '"' + String(s==null?'':s)
      .replace(/\\/g,'\\\\').replace(/"/g,'\\"')
      .replace(/\r/g,'').replace(/\n/g,'\\n') + '"';
  }
  function vcol(tok){ return `MakeColorFromHex(${vstr(uiHex6(tok))})`; }
  function vvec(x,y){ return `vector2{X := ${vf(x)}, Y := ${vf(y)}}`; }
  function vmargin(m){ const a=m||[0,0,0,0]; return `margin{Left := ${vf(a[0])}, Top := ${vf(a[1])}, Right := ${vf(a[2])}, Bottom := ${vf(a[3])}}`; }
  function vAnchors(s){ return `anchors{Minimum := ${vvec(s.aMin[0],s.aMin[1])}, Maximum := ${vvec(s.aMax[0],s.aMax[1])}}`; }
  function vIdent(s){
    const t=String(s||'').replace(/[^A-Za-z0-9_]/g,'');
    return /^[A-Za-z_]/.test(t) ? t : ('W'+t);
  }

  /* Localisable string table, collected while the tree is emitted. */
  let _uiMsg = null;
  function uiMsgRef(text){
    const s = String(text==null?'':text);
    if(!_uiMsg) return vstr(s);
    if(_uiMsg.map[s]) return _uiMsg.map[s];
    const name = _uiMsg.prefix + '_Msg' + (_uiMsg.order.length+1);
    _uiMsg.map[s]=name; _uiMsg.order.push({name, text:s});
    return name;
  }

  function uiVerseIndentLines(lines, extraDepth){
    const pad=vind(extraDepth);
    return lines.map(l=>pad+l);
  }

  /* Wrap an inner widget body in native chrome-less button{ Slot := button_slot{ Widget := ... } }. */
  function uiVerseAsButton(innerBody){
    const out=['button:'];
    out.push(VI+'Slot := button_slot:');
    out.push(VI+VI+'HorizontalAlignment := horizontal_alignment.Fill');
    out.push(VI+VI+'VerticalAlignment := vertical_alignment.Fill');
    out.push(VI+VI+'Widget := '+innerBody[0]);
    for(let i=1;i<innerBody.length;i++) out.push(VI+VI+innerBody[i]);
    return out;
  }

  function uiVerseLabelButtonBody(p){
    const st=UI_BUTTON_STYLE[p.variant]||UI_BUTTON_STYLE.loud;
    const w=p.w!=null?+p.w:st.w, h=p.h!=null?+p.h:st.h;
    const inner=[
      'overlay:',
      VI+'Slots := array:',
      VI+VI+'overlay_slot:',
      VI+VI+VI+'HorizontalAlignment := horizontal_alignment.Fill',
      VI+VI+VI+'VerticalAlignment := vertical_alignment.Fill',
      VI+VI+VI+'Widget := color_block:',
      VI+VI+VI+VI+`DefaultColor := MakeColorFromHex(${vstr(st.border)})`,
      VI+VI+VI+VI+'DefaultOpacity := 1.0',
      VI+VI+VI+VI+`DefaultDesiredSize := ${vvec(w,h)}`,
      VI+VI+'overlay_slot:',
      VI+VI+VI+'HorizontalAlignment := horizontal_alignment.Fill',
      VI+VI+VI+'VerticalAlignment := vertical_alignment.Fill',
      VI+VI+VI+'Padding := margin{Left := 2.0, Top := 2.0, Right := 2.0, Bottom := 2.0}',
      VI+VI+VI+'Widget := color_block:',
      VI+VI+VI+VI+`DefaultColor := MakeColorFromHex(${vstr(st.fill)})`,
      VI+VI+VI+VI+`DefaultOpacity := ${vf(st.fillOp)}`,
      VI+VI+VI+VI+`DefaultDesiredSize := ${vvec(w-4,h-4)}`,
      VI+VI+'overlay_slot:',
      VI+VI+VI+'HorizontalAlignment := horizontal_alignment.Center',
      VI+VI+VI+'VerticalAlignment := vertical_alignment.Center',
      VI+VI+VI+'Widget := text_block:',
      VI+VI+VI+VI+`DefaultText := ${uiMsgRef(p.text)}`,
      VI+VI+VI+VI+`DefaultTextColor := MakeColorFromHex(${vstr(st.text)})`,
      VI+VI+VI+VI+`DefaultTextSize := ${vf(st.textSize)}`,
      VI+VI+VI+VI+'DefaultJustification := text_justification.Center',
    ];
    return uiVerseAsButton(inner);
  }

  /* ---- widget body: [headerLine, ...fieldLines] at zero indent ---- */
  function uiVerseWidgetBody(n, opts){
    const p=n.props||{}, out=[];
    switch(n.type){
      case 'text': {
        out.push('text_block:');
        out.push(VI+`DefaultText := ${uiMsgRef(p.text)}`);
        out.push(VI+`DefaultTextColor := ${vcol(p.color)}`);
        out.push(VI+`DefaultTextSize := ${vf(uiSize(p.size))}`);
        out.push(VI+`DefaultJustification := text_justification.${p.justify||'Left'}`);
        if(p.opacity!=null && +p.opacity!==1) out.push(VI+`DefaultTextOpacity := ${vf(p.opacity)}`);
        if(p.wrap && +p.wrapWidth>0){
          out.push(VI+'AutoWrap := true');
          out.push(VI+`WrapWidth := ${vf(p.wrapWidth)}`);
        }
        if(p.shadow){
          out.push(VI+`DefaultShadowOffset := option{${vvec(2,2)}}`);
          out.push(VI+`DefaultShadowColor := ${vcol(p.shadowColor)}`);
          out.push(VI+`DefaultShadowOpacity := ${vf(p.shadowOpacity==null?0.6:p.shadowOpacity)}`);
        }
        return out;
      }
      case 'rect':
        out.push('color_block:');
        out.push(VI+`DefaultColor := ${vcol(p.color)}`);
        out.push(VI+`DefaultOpacity := ${vf(p.opacity==null?1:p.opacity)}`);
        out.push(VI+`DefaultDesiredSize := ${vvec(p.w,p.h)}`);
        return out;
      case 'image': {
        /* Content paths like /Roguelike/... are not valid DefaultImage literals — use empty. */
        const img=String(p.image||'Textures.T_Empty');
        const safeImg=(img.startsWith('/') || img.includes('/')) && !img.startsWith('Textures.')
          ? 'Textures.T_Empty' : (img||'Textures.T_Empty');
        out.push('texture_block:');
        out.push(VI+`DefaultImage := ${safeImg}`);
        out.push(VI+`DefaultTint := ${vcol(p.tint||'#FFFFFF')}`);
        out.push(VI+`DefaultDesiredSize := ${vvec(p.w,p.h)}`);
        return out;
      }
      case 'material':
        out.push('material_block:');
        out.push(VI+`DefaultImage := ${p.material||'Materials.M_UI'}`);
        out.push(VI+`DefaultDesiredSize := ${vvec(p.w,p.h)}`);
        return out;
      case 'button':
        return uiVerseLabelButtonBody(p);
      case 'overlay': {
        const inner=['overlay:'].concat(uiVerseSlots(n, 'overlay_slot', 1, opts));
        return p.asButton ? uiVerseAsButton(inner) : inner;
      }
      case 'stack': {
        const inner=['stack_box:', VI+`Orientation := orientation.${(p.orient||'V')==='V'?'Vertical':'Horizontal'}`]
          .concat(uiVerseSlots(n, 'stack_box_slot', 1, opts));
        return p.asButton ? uiVerseAsButton(inner) : inner;
      }
      case 'canvas':
        out.push('canvas:');
        return out.concat(uiVerseSlots(n, 'canvas_slot', 1, opts));
    }
    return ['color_block:'];
  }

  /* ---- Slots := array: <slot> ... , indented `depth` levels below the widget ---- */
  function uiVerseSlots(n, slotType, depth, opts){
    const allowBindRef=!(opts&&opts.allowBindRef===false);
    const kids=(n.children||[]).slice();
    if(!kids.length) return [vind(depth)+'Slots := array{}'];
    if(slotType==='canvas_slot') kids.sort((a,b)=>((a.slot.z||0)-(b.slot.z||0)));
    const out=[vind(depth)+'Slots := array:'];
    for(const c of kids){
      const s=c.slot, d=depth+1;
      out.push(vind(d)+slotType+':');
      if(slotType==='canvas_slot'){
        out.push(vind(d+1)+`Anchors := ${vAnchors(s)}`);
        out.push(vind(d+1)+`Offsets := ${vmargin(s.off)}`);
        out.push(vind(d+1)+`Alignment := ${vvec(s.align[0],s.align[1])}`);
        if(s.stc) out.push(vind(d+1)+'SizeToContent := true');
        if(s.z)   out.push(vind(d+1)+`ZOrder := ${s.z|0}`);
      } else {
        out.push(vind(d+1)+`HorizontalAlignment := horizontal_alignment.${s.h||'Fill'}`);
        out.push(vind(d+1)+`VerticalAlignment := vertical_alignment.${s.v||'Fill'}`);
        out.push(vind(d+1)+`Padding := ${vmargin(s.pad)}`);
        if(slotType==='stack_box_slot' && s.dist!=null) out.push(vind(d+1)+`Distribution := option{${vf(s.dist)}}`);
      }
      if(c.name) out.push(vind(d+1)+`# ${c.name}`);
      if(c.bind && allowBindRef){
        out.push(vind(d+1)+`Widget := ${vIdent(c.bind)}`);
      } else {
        const body=uiVerseWidgetBody(c, opts);
        out.push(vind(d+1)+'Widget := '+body[0]);
        for(let i=1;i<body.length;i++) out.push(vind(d+1)+body[i]);
      }
    }
    return out;
  }

  function uiVerseBinds(screen){
    const binds=[];
    function walk(n, underAsBtnBind){
      if(!n) return;
      const isAsBtnBind=!!(n.bind && n.props && n.props.asButton);
      const meta=UI_TYPES[n.type];
      if(n.bind && meta){
        if(meta.container){
          if(n.props && n.props.asButton && !underAsBtnBind) binds.push(n);
        } else {
          /* Leaf binds always — including under asButton cards/rows so runtime
             SetText/SetColor (Level0Title, Diff0Bg, …) keep working. */
          binds.push(n);
        }
      }
      for(const c of n.children||[]) walk(c, underAsBtnBind||isAsBtnBind);
    }
    walk(screen.root, false);
    return binds;
  }

  /* Inner chrome for asButton — overlay/stack without wrapping in button{}. */
  function uiVerseAsButtonInnerBody(n, opts){
    const cleared=Object.assign({}, n, { props:Object.assign({}, n.props||{}, {asButton:false}) });
    return uiVerseWidgetBody(cleared, opts);
  }

  /* Verse has SetVisibility but no DefaultVisibility on archetypes — drop non-initial
     view layers so CreateCanvas mounts the designer-active view (listing / page 0). */
  function uiVersePruneViews(node){
    if(!node) return null;
    const v=node.props&&node.props.view;
    if(v && !v.initial) return null;
    const kids=[];
    for(const c of node.children||[]){
      const k=uiVersePruneViews(c);
      if(k) kids.push(k);
    }
    return Object.assign({}, node, { children:kids, props:Object.assign({}, node.props||{}), slot:Object.assign({}, node.slot||{}) });
  }

  function uiVerseCanvasFile(screen){
    const exportScreen=Object.assign({}, screen, { root:uiVersePruneViews(screen.root)||screen.root });
    const cls=exportScreen.verse.klass, binds=uiVerseBinds(exportScreen);
    const asBtnBinds=binds.filter(b=>b.props&&b.props.asButton);
    const leafBinds=binds.filter(b=>!(b.props&&b.props.asButton));
    _uiMsg = { prefix:cls, map:{}, order:[] };

    /* Leaf fields first (allowBindRef false). asButton fields are empty button{} —
       Slot is wired in CreateCanvas so nested leaf binds can be referenced
       (field initialisers cannot read sibling members). */
    const leafBlocks=leafBinds.map(b=>{
      const body=uiVerseWidgetBody(b, {allowBindRef:false});
      return { name:vIdent(b.bind), type:body[0].replace(':',''), body:body.slice(1), from:b.name };
    });
    const asBtnSetSlots=asBtnBinds.map(b=>{
      const inner=uiVerseAsButtonInnerBody(b, {allowBindRef:true});
      return { name:vIdent(b.bind), from:b.name, inner };
    });
    const rootBody=uiVerseWidgetBody(exportScreen.root, {allowBindRef:true});
    const msgs=_uiMsg.order;
    _uiMsg = null;

    const L=[];
    L.push('using { /Fortnite.com/UI }');
    L.push('using { /UnrealEngine.com/Temporary/UI }');
    L.push('using { /UnrealEngine.com/Temporary/SpatialMath }');
    L.push('using { /Verse.org/Colors }');
    L.push('');
    L.push(`# ${screen.name} — ${screen.stage}/${screen.category}`);
    L.push('# Generated by the Roguelike Design Platform · UI Screens tab.');
    L.push('# The tab is the source of truth: re-export replaces this file.');
    if(screen.notes) String(screen.notes).split('\n').forEach(t=>L.push('# '+t));
    L.push('');
    if(msgs.length){
      L.push('# Localisable strings. DefaultText is <localizes>:message, so every label');
      L.push('# has to be a message constant — module scope, because a class field cannot');
      L.push('# read a sibling class member.');
      for(const m of msgs) L.push(`${m.name}<localizes> : message = ${vstr(m.text)}`);
      L.push('');
    }
    L.push(`${cls}<public> := class():`);
    L.push('');
    if(leafBlocks.length || asBtnBinds.length){
      L.push(VI+'# Runtime-bound widgets. Hold this builder and call the setters');
      L.push(VI+'# (SetText / SetColor / SetDesiredSize) to update the live HUD.');
      for(const b of leafBlocks){
        L.push(VI+`# ${b.from}`);
        L.push(VI+`var ${b.name}<public> : ${b.type} = ${b.type}{`);
        for(const line of b.body) L.push(VI+line);
        L.push(VI+'}');
      }
      for(const b of asBtnBinds){
        L.push(VI+`# ${b.name} — Slot required at init; real chrome via SetWidget in CreateCanvas`);
        L.push(VI+`var ${vIdent(b.bind)}<public> : button = button{`);
        L.push(VI+VI+'Slot := button_slot:');
        L.push(VI+VI+VI+'HorizontalAlignment := horizontal_alignment.Fill');
        L.push(VI+VI+VI+'VerticalAlignment := vertical_alignment.Fill');
        L.push(VI+VI+VI+'Widget := color_block:');
        L.push(VI+VI+VI+VI+'DefaultOpacity := 0.0');
        L.push(VI+VI+VI+VI+'DefaultDesiredSize := vector2{X := 1.0, Y := 1.0}');
        L.push(VI+'}');
      }
      L.push('');
    }
    L.push(VI+'CreateCanvas<public>() : canvas =');
    for(const slot of asBtnSetSlots){
      L.push(vind(2)+`# ${slot.from}`);
      L.push(vind(2)+`${slot.name}.SetWidget(button_slot{`);
      L.push(vind(3)+'HorizontalAlignment := horizontal_alignment.Fill');
      L.push(vind(3)+'VerticalAlignment := vertical_alignment.Fill');
      L.push(vind(3)+'Widget := '+slot.inner[0]);
      for(let i=1;i<slot.inner.length;i++) L.push(vind(3)+slot.inner[i]);
      L.push(vind(2)+'})');
    }
    L.push(vind(2)+'Root : canvas = '+rootBody[0]);
    for(let i=1;i<rootBody.length;i++) L.push(vind(2)+rootBody[i]);
    L.push(vind(2)+'return Root');
    L.push('');
    return L.join('\n');
  }

  /* First bound chrome-less / label button — gamepad SetFocus target. */
  function uiVerseFirstFocusBind(screen){
    for(const b of uiVerseBinds(screen)){
      if(b.type==='button' || (b.props && b.props.asButton)) return vIdent(b.bind);
    }
    return null;
  }

  function uiVerseDeviceFile(screen){
    const exportScreen=Object.assign({}, screen, { root:uiVersePruneViews(screen.root)||screen.root });
    const cls=exportScreen.verse.klass, dev=cls.replace(/_canvas$/,'')+'_ui_device';
    const modal=['menu','shop','popup','dialog'].indexOf(exportScreen.category)>=0;
    const focusBind = modal ? uiVerseFirstFocusBind(exportScreen) : null;
    const L=[];
    L.push('using { /Fortnite.com/Devices }');
    L.push('using { /Fortnite.com/UI }');
    L.push('using { /UnrealEngine.com/Temporary/UI }');
    L.push('using { /Verse.org/Simulation }');
    L.push('');
    L.push(`# Show/hide wrapper for ${exportScreen.name}. Wire Show/Hide from your game loop.`);
    L.push(`${dev} := class(creative_device):`);
    L.push('');
    L.push(VI+`Builder : ${cls} = ${cls}{}`);
    L.push('');
    L.push(VI+'# Session-scoped only, never persisted — a stale entry is harmless because');
    L.push(VI+'# Show hides first and then overwrites it.');
    L.push(VI+'var Shown : [player]canvas = map{}');
    L.push('');
    L.push(VI+'Show<public>(Agent : agent) : void =');
    L.push(vind(2)+'if (Player := player[Agent], PlayerUI := GetPlayerUI[Player]):');
    L.push(vind(3)+'Hide(Agent)');
    L.push(vind(3)+'Canvas := Builder.CreateCanvas()');
    if(modal){
      if(focusBind){
        L.push(vind(3)+`PlayerUI.SetFocus(Builder.${focusBind})`);
        L.push(vind(3)+'PlayerUI.AddWidget(Canvas, player_ui_slot{ InputMode := ui_input_mode.All })');
      } else {
        L.push(vind(3)+'# No focusable widgets — All would soft-lock controllers.');
        L.push(vind(3)+'PlayerUI.AddWidget(Canvas, player_ui_slot{ InputMode := ui_input_mode.None })');
      }
    } else {
      L.push(vind(3)+'PlayerUI.AddWidget(Canvas)');
    }
    L.push(vind(3)+'if (set Shown[Player] = Canvas) {}');
    L.push('');
    L.push(VI+'Hide<public>(Agent : agent) : void =');
    L.push(vind(2)+'if (Player := player[Agent], PlayerUI := GetPlayerUI[Player], Canvas := Shown[Player]):');
    L.push(vind(3)+'PlayerUI.RemoveWidget(Canvas)');
    L.push('');
    return L.join('\n');
  }

  function uiVerseBundle(screen){
    return {
      canvasPath: `Content/Verse/${screen.verse.folder}/${screen.verse.file}`,
      canvasCode: uiVerseCanvasFile(screen),
      devicePath: `Content/Verse/${screen.verse.folder}/${screen.verse.klass.replace(/_canvas$/,'')}_ui_device.verse`,
      deviceCode: uiVerseDeviceFile(screen),
      binds: uiVerseBinds(screen).map(b=>({ name:vIdent(b.bind), type:UI_TYPES[b.type].verse, from:b.name })),
    };
  }

  /* ======================================================================
     UI SCREENS — 07 · TAB SHELL
     Three columns: screen list (grouped by loop stage) · 1920x1080 preview
     stage · layer tree + inspector. The Verse pane under the stage always
     shows the code this exact tree exports, so the preview and the shipped
     UEFN widget can never drift apart.
     ====================================================================== */

  function uiEnsureSeededScreen(id){
    const all = Array.isArray(state.uiScreens) ? state.uiScreens : [];
    if(all.some(s => s && s.id === id)) return false;
    const seeded = (typeof uiSeedScreens === 'function' ? uiSeedScreens() : []).find(s => s && s.id === id);
    if(!seeded) return false;
    const afterId = id === 'scr_boss_defeated' ? 'scr_boss_bar' : null;
    const idx = afterId ? all.findIndex(s => s && s.id === afterId) : -1;
    if(idx >= 0) all.splice(idx + 1, 0, seeded);
    else all.push(seeded);
    state.uiScreens = all;
    return true;
  }
  function uiScreensList(){
    if(!Array.isArray(state.uiScreens) || !state.uiScreens.length) state.uiScreens = uiSeedScreens();
    // ponytail: migrate live stores that predate new catalogue screens without Reset.
    uiEnsureSeededScreen('scr_boss_defeated');
    return state.uiScreens;
  }
  function uiCurrentScreen(){
    const all=uiScreensList();
    return all.find(s=>s.id===state.meta.uiScreenId) || all[0];
  }
  function uiSelectedNode(){
    const s=uiCurrentScreen(); if(!s) return null;
    return uiFind(s.root, state.meta.uiSel) || null;
  }
  function uiZoom(){ const z=+state.meta.uiZoom; return (z>0.05&&z<3)?z:0.5; }

  /* ---------------- render ---------------- */
  function renderUIScreens(){
    try{ if(typeof syncArmoryScreenFromWeapons==='function') syncArmoryScreenFromWeapons(); }catch(e){}
    const all=uiScreensList(), cur=uiCurrentScreen();
    if(!cur){ document.getElementById('tab-uiscreens').innerHTML='<div class="text-sm text-gray-400">No screens.</div>'; return; }
    if(!state.meta.uiScreenId) state.meta.uiScreenId=cur.id;
    const sel=uiSelectedNode();
    const viewGroups=uiEnsureViewDefaults(cur.root);
    const viewChips=Object.keys(viewGroups).map(g=>{
      const active=(state.meta.uiViews||{})[g];
      const opts=viewGroups[g].map(v=>`<button type="button" onclick="RGD.uiSetView('${esc(g)}','${esc(v.id)}')" class="ui-view-chip${active===v.id?' is-on':''}">${esc(v.label||v.id)}</button>`).join('');
      return `<div class="ui-view-group"><span class="ui-view-group-label">${esc(g)}</span>${opts}</div>`;
    }).join('');

    /* --- column 1: screens by loop stage --- */
    const list=UI_STAGES.map(st=>{
      const rows=all.filter(s=>s.stage===st.id);
      if(!rows.length) return '';
      return `<div class="ui-stage-group">
        <div class="ui-stage-head"><i data-lucide="${st.icon}" class="w-3.5 h-3.5"></i>${esc(st.label)}<span class="ui-count">${rows.length}</span></div>
        ${rows.map(s=>{
          const stt=UI_STATUSES.find(x=>x.id===s.status)||UI_STATUSES[0];
          return `<button onclick="RGD.uiGoScreen('${s.id}')" class="ui-screen-item${s.id===cur.id?' is-sel':''}">
            <span class="ui-screen-name">${esc(s.name)}</span>
            <span class="ui-screen-meta"><span class="ui-cat">${esc(s.category)}</span><span class="ui-dot ${s.status==='built'?'bg-emerald-400':s.status==='approved'?'bg-sky-400':'bg-amber-400'}" title="${esc(stt.label)}"></span></span>
          </button>`;
        }).join('')}
      </div>`;
    }).join('');

    /* --- column 2: toolbar + stage + verse --- */
    const showCode=!!state.meta.uiCode;
    const bundle=uiVerseBundle(cur);
    const toolbar=`
      <div class="ui-toolbar">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <input value="${esc(cur.name)}" onchange="RGD.uiScreenField('name',this.value)" class="bg-transparent text-sm font-semibold text-white border-b border-transparent hover:border-gray-600 focus:border-indigo-500 focus:outline-none px-0.5 min-w-0" style="width:${Math.max(180, cur.name.length*8)}px">
            <select onchange="RGD.uiScreenField('status',this.value)" class="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-200">
              ${UI_STATUSES.map(s=>`<option value="${s.id}" ${s.id===cur.status?'selected':''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <div class="text-[11px] text-gray-500 truncate">${esc(cur.verse.folder)}/${esc(cur.verse.file)} · ${esc(cur.verse.klass)}</div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button onclick="RGD.uiZoomBy(-1)" class="ui-tb-btn" title="Zoom out">−</button>
          <span class="text-[11px] text-gray-400 w-10 text-center">${Math.round(uiZoom()*100)}%</span>
          <button onclick="RGD.uiZoomBy(1)" class="ui-tb-btn" title="Zoom in">+</button>
          <button onclick="RGD.uiFit()" class="ui-tb-btn">Fit</button>
          <button onclick="RGD.uiToggle('uiBoxes')" class="ui-tb-btn ${state.meta.uiBoxes?'is-on':''}" title="Show container bounds">Boxes</button>
          <button onclick="RGD.uiToggle('uiSafe')" class="ui-tb-btn ${state.meta.uiSafe?'is-on':''}" title="Title-safe guides">Safe</button>
          <button onclick="RGD.uiToggle('uiCode')" class="ui-tb-btn ${showCode?'is-on':''}">Verse</button>
          <button onclick="RGD.uiWriteVerse()" class="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium flex items-center gap-1"><i data-lucide="file-code-2" class="w-3.5 h-3.5"></i> Write to project</button>
        </div>
      </div>
      ${viewChips?`<div class="ui-view-bar">${viewChips}</div>`:''}`;

    const safe = state.meta.uiSafe
      ? `<div class="ui-safe" style="left:96px;top:54px;right:96px;bottom:54px"></div><div class="ui-safe ui-safe-2" style="left:${MX}px;top:${MY}px;right:${MX}px;bottom:${MY}px"></div>`
      : '';
    const stage=`
      <div class="ui-viewport" id="uiViewport" onclick="RGD.uiSelect('')">
        <div class="ui-stage" id="uiStage" style="width:${UI_STAGE_W}px;height:${UI_STAGE_H}px;background:${uiColor('bg')};transform:scale(${uiZoom()})">
          ${uiRenderStage(cur, state.meta.uiSel, !!state.meta.uiBoxes)}
          ${safe}
        </div>
      </div>`;

    const code = showCode ? `
      <div class="ui-code">
        <div class="ui-code-head">
          <span>${esc(bundle.canvasPath)}</span>
          <span class="flex gap-1">
            <button onclick="RGD.uiCopyVerse('canvas')" class="ui-tb-btn">Copy canvas</button>
            <button onclick="RGD.uiCopyVerse('device')" class="ui-tb-btn">Copy device</button>
          </span>
        </div>
        <pre class="ui-code-body">${esc(bundle.canvasCode)}</pre>
        <div class="ui-code-head"><span>${esc(bundle.devicePath)}</span><span class="text-gray-500">${bundle.binds.length} bound widget${bundle.binds.length===1?'':'s'}</span></div>
        <pre class="ui-code-body">${esc(bundle.deviceCode)}</pre>
      </div>` : '';

    /* --- column 3: layers + inspector --- */
    const inspect=`
      <div class="ui-insp-layers">
        <div class="ui-sec-h flex items-center justify-between gap-2">
          <span>Layers</span>
          <span class="flex gap-1">
            <button type="button" onclick="RGD.uiCollapseAll(true)" class="ui-tb-btn" title="Collapse all">Collapse</button>
            <button type="button" onclick="RGD.uiCollapseAll(false)" class="ui-tb-btn" title="Expand all">Expand</button>
          </span>
        </div>
        <div class="ui-layer-list">${uiLayerRows(cur.root, 0, state.meta.uiSel, null)}</div>
      </div>
      <div class="ui-insp-props">${uiInspector(cur, sel)}</div>`;

    document.getElementById('tab-uiscreens').innerHTML=`
      <div class="ui-work">
        <aside class="ui-col-list">
          <div class="ui-col-head">
            <span>${all.length} screens</span>
            <button onclick="RGD.uiNewScreen()" class="ui-tb-btn" title="New screen"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>
          </div>
          <div class="ui-col-scroll">${list}</div>
          <div class="ui-col-foot">
            <button onclick="RGD.uiResetCatalogue()" class="ui-tb-btn w-full">Restore seeded catalogue</button>
          </div>
        </aside>
        <section class="ui-col-stage">
          ${toolbar}
          ${stage}
          <div class="ui-notes">
            <textarea rows="2" onchange="RGD.uiScreenField('notes',this.value)" placeholder="Design intent — why this screen is laid out this way" class="${uiInpCls}">${esc(cur.notes||'')}</textarea>
          </div>
          ${code}
        </section>
        <aside class="ui-col-insp">${inspect}</aside>
      </div>`;
    lucide.createIcons();
  }

  /* ---------------- actions ---------------- */
  function uiRerender(){ renderUIScreens(); save(); }
  function uiGoScreen(id){ state.meta.uiScreenId=id; state.meta.uiSel=null; uiRerender(); }
  function uiSelect(id){
    state.meta.uiSel=id||null;
    const s=uiCurrentScreen();
    if(s&&id) uiExpandAncestors(s.root, id);
    renderUIScreens();
  }
  function uiToggle(key){ state.meta[key]=!state.meta[key]; uiRerender(); }
  function uiSetView(group, id){
    if(!state.meta.uiViews) state.meta.uiViews={};
    state.meta.uiViews[group]=id;
    if(group==='category'){
      state.meta.armoryCategory=id;
      state.meta.armoryPage=0;
      state.meta.uiViews.page='0';
      try{ if(typeof syncArmoryScreenFromWeapons==='function') syncArmoryScreenFromWeapons(); }catch(e){}
    } else if(group==='page'){
      state.meta.armoryPage=Math.max(0, parseInt(id,10)||0);
      try{ if(typeof syncArmoryScreenFromWeapons==='function') syncArmoryScreenFromWeapons(); }catch(e){}
    }
    /* mode flips: Visible/Collapsed + CSS slide only — never rebuild the tree */
    uiRerender();
  }
  function uiToggleCollapse(id){
    const map=uiCollapsedMap();
    const s=uiCurrentScreen(), n=s&&uiFind(s.root,id);
    const cur=n?uiIsCollapsed(n):!!map[id];
    map[id]=!cur;
    renderUIScreens();
  }
  function uiCollapseAll(collapse){
    const s=uiCurrentScreen(); if(!s) return;
    const map=uiCollapsedMap();
    uiWalk(s.root, n=>{
      if(UI_TYPES[n.type]&&UI_TYPES[n.type].container&&(n.children||[]).length) map[n.id]=!!collapse;
    });
    renderUIScreens();
  }
  function uiViewField(id, key, val){
    const s=uiCurrentScreen(), n=uiFind(s.root,id); if(!n) return;
    n.props=n.props||{};
    const v=Object.assign({}, n.props.view||{});
    if(key==='initial') v.initial=!!val;
    else v[key]=String(val||'').trim();
    if(!v.group && !v.id) delete n.props.view;
    else n.props.view=v;
    uiRerender();
  }
  function uiZoomBy(dir){
    const steps=[0.25,0.3,0.35,0.4,0.5,0.6,0.75,1];
    const cur=uiZoom();
    let i=steps.findIndex(s=>Math.abs(s-cur)<0.02); if(i<0) i=4;
    state.meta.uiZoom=steps[Math.max(0,Math.min(steps.length-1,i+dir))];
    uiRerender();
  }
  function uiFit(){
    const vp=document.getElementById('uiViewport');
    const w=vp?vp.clientWidth-32:960;
    state.meta.uiZoom=Math.max(0.15, Math.min(1, w/UI_STAGE_W));
    uiRerender();
  }
  function uiScreenField(k,v){ const s=uiCurrentScreen(); if(!s) return; s[k]=v; uiRerender(); }
  function uiNode(id,k,v){
    const s=uiCurrentScreen(), n=uiFind(s.root,id); if(!n) return;
    if(k==='bind'){ n.bind = String(v||'').trim() || undefined; } else { n[k]=v; }
    uiRerender();
  }
  function uiProp(id,k,v){
    const s=uiCurrentScreen(), n=uiFind(s.root,id); if(!n) return;
    n.props[k]=v; uiRerender();
  }
  function uiSlot(id,k,idx,v){
    const s=uiCurrentScreen(), n=uiFind(s.root,id); if(!n) return;
    if(idx==null){ n.slot[k] = (k==='dist') ? (String(v).trim()===''?null:+v) : v; }
    else { const a=(n.slot[k]||[]).slice(); a[idx]=v; n.slot[k]=a; }
    uiRerender();
  }
  function uiAnchorPreset(id,name){
    const p=UI_ANCHOR_PRESETS[name]; if(!p) return;
    const s=uiCurrentScreen(), n=uiFind(s.root,id); if(!n) return;
    Object.assign(n.slot, {aMin:p.aMin.slice(), aMax:p.aMax.slice(), align:p.align.slice()});
    uiRerender();
  }
  function uiAdd(type){
    const s=uiCurrentScreen(), parent=uiSelectedNode()||s.root;
    if(!UI_TYPES[parent.type].container) return toast('Pick a canvas, overlay or stack box first','warn');
    const n=uiMakeNode(type, null, [], parent.type==='canvas'?csBox(80,80,320,120):sl('Left','Top'));
    parent.children.push(n);
    state.meta.uiSel=n.id; uiRerender();
  }
  function uiMoveSel(d){ const s=uiCurrentScreen(); if(uiMove(s.root, state.meta.uiSel, d)) uiRerender(); }
  function uiDupSel(){
    const s=uiCurrentScreen(), n=uiSelectedNode(); if(!n) return;
    const p=uiFindParent(s.root,n.id); if(!p) return;
    const c=uiClone(n); p.children.splice(p.children.indexOf(n)+1,0,c);
    state.meta.uiSel=c.id; uiRerender();
  }
  function uiDelSel(){
    const s=uiCurrentScreen();
    if(uiRemove(s.root, state.meta.uiSel)){ state.meta.uiSel=null; uiRerender(); }
  }
  function uiNewScreen(){
    const s=uiScreen(uid('scr'),'New screen','popup','popup','', 'GameDevices/Gameplay/Screens/Custom','new_screen',
      uiCanvas([ uiRect('scrim', UI_STAGE_W, UI_STAGE_H, {opacity:0.7}, csFill(0,0,0,0), 'Scrim'),
                 uiPanel(720,420,[uiText('New screen',{size:'h2'},sl('Left','Top'),'Title')],{name:'Panel'}) ], null, 'Root'));
    uiScreensList().push(s);
    state.meta.uiScreenId=s.id; state.meta.uiSel=null; uiRerender();
  }
  function uiResetCatalogue(){
    confirmModal('Restore seeded catalogue?','Every screen you edited here is replaced by the shipped catalogue. Screens you added are removed.', ()=>{
      state.uiScreens=uiSeedScreens();
      try{ syncSkillTreeScreenFromProgression(); }catch(e){}
      try{ if(typeof syncArmoryScreenFromWeapons==='function') syncArmoryScreenFromWeapons(); }catch(e){}
      state.meta.uiScreenId=state.uiScreens[0].id; state.meta.uiSel=null;
      uiRerender(); toast('Catalogue restored','ok');
    });
  }
  function uiCopyVerse(which){
    const b=uiVerseBundle(uiCurrentScreen());
    const txt = which==='device'?b.deviceCode:b.canvasCode;
    try{ navigator.clipboard.writeText(txt); toast('Copied '+(which==='device'?'device':'canvas')+' Verse','ok'); }
    catch(e){ toast('Clipboard blocked — select the code and copy manually','warn'); }
  }
  async function uiWriteVerse(){
    const s=uiCurrentScreen(), b=uiVerseBundle(s);
    try{
      const r=await rgdRpc('ui_write_verse', { files:[
        { path:b.canvasPath, content:b.canvasCode },
        { path:b.devicePath, content:b.deviceCode },
      ]}, 20000);
      if(r&&r.ok){
        s.status='built'; uiRerender();
        const skipped=(r.skipped||[]).length;
        const wrote=(r.written||[]).length;
        if(!wrote && skipped){
          toast('Skipped '+skipped+' hand-written file(s) — not overwritten','warn');
        } else {
          toast('Wrote '+wrote+' file(s)'+(skipped?' · skipped '+skipped+' hand-written':'')+' — run a Verse build in UEFN','ok');
        }
      } else {
        toast('Write failed: '+((r&&r.error)||'no response'),'err');
      }
    }catch(e){ toast('Write failed: '+String(e&&e.message||e),'err'); }
  }

  /* ======================================================================
     UI SCREENS — 08 · SKILL TREE SYNC
     Progression.tree.nodes is the source of truth. This rebuilds scr_skill_tree
     (and keeps scr_levelup points copy honest) whenever the tree or sim points
     change. Verse is NOT written here — use UI Screens → Write to project.
     ====================================================================== */

  const SKILL_TREE_SCREEN_ID = 'scr_skill_tree';
  const LEVEL_UP_SCREEN_ID = 'scr_levelup';
  const SKILL_TREE_PANEL_W = 1180, SKILL_TREE_PANEL_H = 620;
  const SKILL_TREE_PAD = 24;
  const SKILL_NODE_W = 88, SKILL_NODE_H = 100, SKILL_NODE_FACE = 64;

  function buildSkillTreeNodeWidget(n, x, y, rank, selected){
    const color = n.color || '#a855f7';
    const max = Math.max(1, Number(n.maxRank)||1);
    const r = Math.max(0, Number(rank)||0);
    const accent = selected ? 'gold' : color;
    const face = uiOverlay([
      uiRect(accent, SKILL_NODE_FACE+4, SKILL_NODE_FACE+4, {opacity:1}, sl('Fill','Fill'), 'Node ring'),
      uiRect('panelDeep', SKILL_NODE_FACE, SKILL_NODE_FACE, {opacity:0.95}, sl('Center','Center',[2,2,2,2]), 'Node face'),
      uiRect(color, 8, 8, {opacity:1}, sl('Center','Center'), 'Node gem'),
      uiText((r)+'/'+max, {size:'tiny', color:selected?'gold':'text', justify:'Center'}, sl('Center','Bottom',[0,0,0,6]), 'Node rank'),
    ], csBox(Math.round((SKILL_NODE_W-SKILL_NODE_FACE-4)/2), 0, SKILL_NODE_FACE+4, SKILL_NODE_FACE+4), 'Node face wrap');
    const label = uiText(n.name||n.id, {size:'tiny', color:selected?'gold':'text', justify:'Center', wrap:true, wrapWidth:SKILL_NODE_W},
      csBox(0, SKILL_NODE_FACE+8, SKILL_NODE_W, 28), 'Node name');
    return uiOverlay([face, label], csBox(Math.round(x), Math.round(y), SKILL_NODE_W, SKILL_NODE_H), 'Node · '+(n.id||n.name));
  }

  function buildSkillTreeEdgeWidgets(nodes, by, scale, ox, oy){
    const edges=[];
    nodes.forEach(n=>{
      (n.requires||[]).forEach(rid=>{
        const a=by[rid], b=n; if(!a||!b) return;
        const x1=ox + (Number(a.x)||0)*scale + SKILL_NODE_W/2;
        const y1=oy + (Number(a.y)||0)*scale + SKILL_NODE_FACE/2;
        const x2=ox + (Number(b.x)||0)*scale + SKILL_NODE_W/2;
        const y2=oy + (Number(b.y)||0)*scale + SKILL_NODE_FACE/2;
        const unlocked = nodeRank(rid) >= 1;
        const mx=(x1+x2)/2, my=(y1+y2)/2;
        const dx=x2-x1, dy=y2-y1;
        const len=Math.max(2, Math.sqrt(dx*dx+dy*dy));
        // Axis-aligned stub: short horizontal + vertical segments so Verse can draw them.
        const hx=Math.min(x1,x2), hw=Math.max(2, Math.abs(dx));
        const vy=Math.min(y1,y2), vh=Math.max(2, Math.abs(dy));
        edges.push(uiRect(unlocked?'accentAlt':'stroke', hw, 2, {opacity:unlocked?0.85:0.45}, csBox(Math.round(hx), Math.round(my-1), Math.round(hw), 2), 'Edge H · '+rid+'=>'+n.id));
        edges.push(uiRect(unlocked?'accentAlt':'stroke', 2, vh, {opacity:unlocked?0.85:0.45}, csBox(Math.round(mx-1), Math.round(vy), 2, Math.round(vh)), 'Edge V · '+rid+'=>'+n.id));
        void len;
      });
    });
    return edges;
  }

  function buildSkillTreeScreenRoot(){
    ensureProgression();
    const p=state.progression;
    const tree=p.tree||{width:900,height:520,nodes:[]};
    const nodes=tree.nodes||[];
    const by={}; nodes.forEach(n=>by[n.id]=n);
    const sel=findTreeNode(state.meta.progSelectedNode)||nodes[0]||null;
    const avail=availableSimPoints();
    const innerW=SKILL_TREE_PANEL_W - SKILL_TREE_PAD*2;
    const innerH=SKILL_TREE_PANEL_H - SKILL_TREE_PAD*2;
    const tw=Math.max(1, Number(tree.width)||900);
    const th=Math.max(1, Number(tree.height)||520);
    const scale=Math.min(innerW/tw, innerH/th);
    const ox=Math.round((innerW - tw*scale)/2);
    const oy=Math.round((innerH - th*scale)/2);

    const nodeKids = nodes.map(n=>{
      const x = ox + (Number(n.x)||0)*scale;
      const y = oy + (Number(n.y)||0)*scale;
      return buildSkillTreeNodeWidget(n, x, y, nodeRank(n.id), sel && sel.id===n.id);
    });
    const edgeKids = buildSkillTreeEdgeWidgets(nodes, by, scale, ox, oy);
    const treeCanvasKids = edgeKids.concat(nodeKids);
    if(!treeCanvasKids.length){
      treeCanvasKids.push(uiText('Add skill nodes in the Progression tab', {size:'small', color:'textMute', justify:'Center'}, sl('Center','Center'), 'Tree empty'));
    }

    const reqNames = sel ? (sel.requires||[]).map(rid=>{
      const t=findTreeNode(rid); return t?t.name:rid;
    }).filter(Boolean) : [];
    const rank = sel ? nodeRank(sel.id) : 0;
    const max = sel ? (Number(sel.maxRank)||1) : 1;
    const cost = sel ? (Number(sel.cost)||1) : 1;
    const body = sel
      ? ('Rank '+rank+' / '+max+' — '+(sel.effect||sel.desc||'No effect summary.'))
      : 'Select a node in Progression to preview its card.';
    const cardAccent = (sel && sel.color) || 'accentAlt';

    return uiCanvas([
      uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
      uiPageHeader('Threads of mastery','Spend skill points. Later nodes stay locked until their prerequisites are filled.','accentAlt'),
      uiOverlay([
        uiRect('panelDeep', 300, 74, {opacity:0.9}, sl('Fill','Fill'), 'Points bg'),
        uiRect('accentAlt', 4, 74, {}, sl('Left','Fill'), 'Points accent'),
        uiStack('V', [
          uiText('SKILL POINTS', {size:'tiny', color:'accentAlt'}, sl('Left','Top',[0,0,0,4]), 'Points kicker'),
          Object.assign(uiText(avail+' unspent', {size:'h3', color:'text'}, sl('Left','Top'), 'Points value'), {bind:'PointsText'}),
        ], sl('Left','Center',[20,0,0,0]), 'Points stack'),
      ], csAnchor(1,0,-MX,MY,300,74,1,0), 'Points banner'),
      uiPanel(SKILL_TREE_PANEL_W, SKILL_TREE_PANEL_H, [
        uiOverlay(treeCanvasKids, sl('Fill','Fill'), 'Tree canvas'),
      ], {padding:SKILL_TREE_PAD, name:'Tree panel', slot:csBox(MX, 240, SKILL_TREE_PANEL_W, SKILL_TREE_PANEL_H)}),
      uiCard(440, 620, {
        accent: cardAccent,
        kicker: 'SELECTED NODE',
        title: sel ? (sel.name||sel.id) : 'No node selected',
        artH: 140,
        body: body,
        footL: 'Cost: '+cost+' point'+(cost===1?'':'s'),
        footR: reqNames.length ? ('Requires: '+reqNames.join(', ')) : 'Requires: none',
        slot: csAnchor(1,0,-MX,240,440,620,1,0),
        name: 'Card · '+(sel ? (sel.name||sel.id) : 'Empty'),
      }),
      uiFooterHint(['[Click] Select node','[Space] Upgrade','[R] Refund','[Esc] Back']),
    ], null, 'Root');
  }

  function syncLevelUpScreenFromProgression(){
    ensureProgression();
    const screens = Array.isArray(state.uiScreens) ? state.uiScreens : null;
    if(!screens) return false;
    const screen = screens.find(s=>s.id===LEVEL_UP_SCREEN_ID);
    if(!screen || !screen.root) return false;
    const p=state.progression;
    const simLv=Number(state.meta.progSimLevel)||1;
    const pts=Number(p.pointsPerLevel)||1;
    const total=availableSimPoints();
    const hpRow=(p.scaling||[]).find(r=>r.statId==='hp');
    const hpGain = hpRow ? Math.round(Number(hpRow.perLevel)||0) : 10;
    const hpNow = hpRow ? Math.round(scaleAtLevel(hpRow, simLv)) : 100;
    // Walk known text widgets by name and refresh copy.
    let touched=false;
    uiWalk(screen.root, n=>{
      if(n.type!=='text' || !n.props) return;
      if(n.name==='Modal title'){ n.props.text='LEVEL '+simLv; touched=true; }
      if(n.name==='Row title' && String(n.props.text||'').indexOf('Skill Point')>=0){
        n.props.text = '+'+pts+' Skill Point'+(pts===1?'':'s'); touched=true;
      }
      if(n.name==='Row value' && n.props.color==='accentAlt'){
        n.props.text = total+' total'; touched=true;
      }
      if(n.name==='Row title' && String(n.props.text||'').indexOf('Max Health')>=0){
        n.props.text = '+'+(hpGain||10)+' Max Health'; touched=true;
      }
      if(n.name==='Row value' && n.props.color==='hp'){
        n.props.text = String(hpNow); touched=true;
      }
    });
    return touched;
  }

  function syncSkillTreeScreenFromProgression(opts){
    const o=opts||{};
    ensureProgression();
    if(!Array.isArray(state.uiScreens) || !state.uiScreens.length){
      // Seed catalogue first so the screen exists, then overwrite the skill tree root.
      state.uiScreens = uiSeedScreens();
    }
    let screen = state.uiScreens.find(s=>s.id===SKILL_TREE_SCREEN_ID);
    if(!screen){
      screen = uiScreen(SKILL_TREE_SCREEN_ID,'Skill Tree','hub','menu',
        'Mirrors the Progression tab tree. Auto-synced from Progression. Write to project to update in-game Verse.',
        'GameDevices/Gameplay/Screens/Hub','skill_tree', buildSkillTreeScreenRoot());
      state.uiScreens.push(screen);
    } else {
      screen.root = buildSkillTreeScreenRoot();
      screen.notes = 'Mirrors the Progression tab tree. Auto-synced from Progression. Use UI Screens → Write to project to update in-game Verse.';
      if(screen.status==='built') screen.status='design'; // mark dirty vs last Verse write
    }
    syncLevelUpScreenFromProgression();
    if(o.save) save(o.flush?{flush:true}:undefined);
    if(o.rerender && state.meta.activeTab==='uiscreens') renderUIScreens();
    return true;
  }

  /* ======================================================================
     UI SCREENS — 09 · ARMORY SYNC
     React ShopUI 1:1 — fixed tabs, per-weapon stat bars, power slots
     (open infusion / locked Time signature — Remnant/Souls style), skins,
     single CTA, list↔details Visible/Collapsed + slide. Live data from
     state.weapons (+ SCROLLS from buyable wizardry).
     ====================================================================== */

  const ARMORY_SCREEN_ID = 'scr_shop_weapons';
  const ARMORY_PICKER_SCREEN_ID = 'scr_armory_picker';
  /* Bump when Armory chrome shape changes so stale trees always rebuild. */
  const ARMORY_LAYOUT = 5;
  const ARMORY_PAGE_SIZE = 6;
  const ARMORY_GRID_W = 1680, ARMORY_CARD_W = 544, ARMORY_CARD_H = 398, ARMORY_GUTTER = 24;
  const ARMORY_HEADER_H = 92, ARMORY_TAB_H = 56;
  const ARMORY_FIXED_CATS = [
    {id:'PISTOLS', label:'PISTOLS', weaponCat:'Pistol'},
    {id:'ASSAULT RIFLES', label:'ASSAULT RIFLES', weaponCat:'Assault Rifle'},
    {id:'SHOTGUNS', label:'SHOTGUNS', weaponCat:'Shotgun'},
    {id:'SMGS', label:'SMGS', weaponCat:'SMG'},
    {id:'SCROLLS', label:'SCROLLS', scrolls:true},
  ];
  const ARMORY_STAT_KEYS = [
    {key:'damage', labels:['damage','dmg']},
    {key:'accuracy', labels:['accuracy','acc']},
    {key:'range', labels:['range']},
    {key:'mobility', labels:['mobility','move','speed']},
    {key:'fire_rate', labels:['fire_rate','firerate','fire rate','rate']},
  ];
  const ARMORY_STAT_LABELS = {
    damage:'Damage', accuracy:'Accuracy', range:'Range', mobility:'Mobility', fire_rate:'Fire Rate',
  };
  /* Display-only 0–100 bars — prefer WEAPON_ARMORY_STATS from 10-weapons.js. */
  const ARMORY_BAR_DEFAULTS = (typeof WEAPON_ARMORY_STATS==='object' && WEAPON_ARMORY_STATS) || {};

  function armoryCurrencyById(id){
    return (state.currencies||[]).find(c=>c.id===id) || null;
  }
  function armoryCategories(){
    return ARMORY_FIXED_CATS.map(c=>c.id);
  }
  function armoryCatMeta(id){
    return ARMORY_FIXED_CATS.find(c=>c.id===id) || ARMORY_FIXED_CATS[0];
  }
  function armoryScrollEntries(){
    return (state.wizardry||[]).filter(p=>p && p.buyable!==false && p.findable!==false).map(p=>{
      const price=p.price||{amount:Number(p.cost)||0, currencyId:(state.currencies&&state.currencies[0]&&state.currencies[0].id)||'gold'};
      return {
        id:'scroll_'+(p.id||p.name),
        name:p.name||p.id,
        desc:p.desc||p.procDesc||p.chargedDesc||'',
        category:'SCROLLS',
        starter:!!p.owned,
        color:p.color||'#a855f7',
        symbol:p.symbol||'S',
        uefnIcon:p.uefnIcon||'',
        price,
        stats:p.stats||null,
        skins:p.skins||[{id:'default', name:'Default', color:p.color||'#9ca3af'}],
        upgrades:p.upgrades||[],
        _scroll:true,
        _wizId:p.id,
      };
    });
  }
  function armoryCatalogEntries(){
    const weapons=(state.weapons||[]).map(w=>Object.assign({}, w, {_scroll:false}));
    return weapons.concat(armoryScrollEntries());
  }
  function armoryFilterEntries(entries, categoryId){
    const meta=armoryCatMeta(categoryId);
    if(meta.scrolls) return entries.filter(e=>e._scroll || e.category==='SCROLLS');
    return entries.filter(e=>!e._scroll && (e.category||'Pistol')===meta.weaponCat);
  }
  function armoryPriceParts(w){
    const price=w.price||{};
    const amt=Number(price.amount)||0;
    const cur=armoryCurrencyById(price.currencyId)||{symbol:'⏳', color:'#F2C14E', id:'gold'};
    return { amount:amt, sym:cur.symbol||'', color:cur.color||'gold', currencyId:cur.id||price.currencyId||'gold' };
  }
  function armoryNormPct(raw){
    const v=Number(raw);
    if(!isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v>1?v/100:v));
  }
  function armoryStatLabel(key){
    if(ARMORY_STAT_LABELS[key]) return ARMORY_STAT_LABELS[key];
    const cat=(state.stats||[]).find(s=>s&&(s.id===key||String(s.id).toLowerCase()===String(key).toLowerCase()));
    if(cat&&cat.name) return cat.name;
    return String(key||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())||'Stat';
  }
  function armoryResolvedStats(w){
    const out={};
    let raw=(w&&w.stats&&typeof w.stats==='object')?w.stats:{};
    /* Heal MCP nesting: weapon.fields.stats */
    if((!raw||!Object.keys(raw).length) && w&&w.fields&&typeof w.fields.stats==='object') raw=w.fields.stats;
    Object.keys(raw||{}).forEach(k=>{
      if(raw[k]==null||raw[k]==='') return;
      out[k]=raw[k];
    });
    if(Object.keys(out).length) return out;
    const fb=ARMORY_BAR_DEFAULTS[w&&w.id]||null;
    if(fb) return Object.assign({}, fb);
    /* Category fallback so custom weapons still show bars. */
    const cat=String((w&&w.category)||'Pistol');
    if(cat==='Assault Rifle') return {damage:62, accuracy:75, range:72, mobility:48, fire_rate:70};
    if(cat==='Shotgun') return {damage:80, accuracy:48, range:28, mobility:45, fire_rate:35};
    if(cat==='SMG') return {damage:52, accuracy:58, range:46, mobility:82, fire_rate:88};
    if(w&&w._scroll) return {damage:40, accuracy:50, range:45, mobility:55, fire_rate:60};
    return {damage:50, accuracy:60, range:50, mobility:55, fire_rate:55};
  }
  function armoryCatHit(nm, id, labels){
    /* Exact only — substring matches steal bars (e.g. "attack" ⊂ "Attack Range"). */
    return labels.some(l=>nm===l||id===l||nm===l.replace(/_/g,' ')||id===l.replace(/ /g,'_'));
  }
  function armoryStatPct(w, keySpec, resolved){
    const stats=resolved||armoryResolvedStats(w);
    if(stats[keySpec.key]!=null&&stats[keySpec.key]!=='') return armoryNormPct(stats[keySpec.key]);
    for(let i=0;i<keySpec.labels.length;i++){
      const k=keySpec.labels[i];
      if(stats[k]!=null&&stats[k]!=='') return armoryNormPct(stats[k]);
    }
    const cat=(state.stats||[]);
    for(let i=0;i<cat.length;i++){
      const s=cat[i];
      const nm=String(s.name||'').toLowerCase();
      const id=String(s.id||'').toLowerCase();
      if(armoryCatHit(nm, id, keySpec.labels.concat([keySpec.key]))){
        if(stats[s.id]!=null&&stats[s.id]!=='') return armoryNormPct(stats[s.id]);
      }
    }
    return null;
  }
  /* Bars for whatever THIS weapon actually has — preferred order, then extras. */
  function armoryStatRowsFor(w){
    const resolved=armoryResolvedStats(w);
    const rows=[];
    const used=new Set();
    ARMORY_STAT_KEYS.forEach(spec=>{
      const pct=armoryStatPct(w, spec, resolved);
      if(pct==null) return;
      rows.push({key:spec.key, label:ARMORY_STAT_LABELS[spec.key]||armoryStatLabel(spec.key), pct});
      used.add(spec.key);
      spec.labels.forEach(l=>used.add(l));
    });
    Object.keys(resolved).forEach(k=>{
      const lk=String(k).toLowerCase();
      if(used.has(k)||used.has(lk)) return;
      if(ARMORY_STAT_KEYS.some(spec=>spec.labels.indexOf(lk)>=0||spec.key===lk)) return;
      rows.push({key:k, label:armoryStatLabel(k), pct:armoryNormPct(resolved[k])});
    });
    return rows;
  }
  function armoryDescText(w){
    const d=String((w&&(w.desc||w.fireIdentity))||'').trim();
    return d||'No description yet.';
  }
  function armorySkinsFor(w){
    if(Array.isArray(w.skins)&&w.skins.length>=4) return w.skins.slice(0,4);
    if(typeof demoSkinsFor==='function') return demoSkinsFor(w);
    const c=(w&&w.color)||'#9ca3af';
    return [
      {id:'default', name:'Default', color:c},
      {id:'midnight', name:'Midnight', color:'#6366f1'},
      {id:'ember', name:'Ember', color:'#ef4444'},
      {id:'glacier', name:'Glacier', color:'#38bdf8'},
    ];
  }
  function armoryWizById(){
    const m={};
    (state.wizardry||[]).forEach(p=>{ if(p&&p.id) m[p.id]=p; });
    return m;
  }
  function armoryResolveWiz(id, byId){
    if(!id) return null;
    return (byId&&byId[id]) || (state.wizardry||[]).find(p=>p&&p.id===id) || null;
  }
  /* Remnant / Souls style: each weapon exposes its powerSlots (open or locked). */
  function armoryPowerSlotsFor(w){
    if(w&&w._scroll){
      const wizId=w._wizId||String(w.id||'').replace(/^scroll_/,'');
      return [{id:'scroll', index:1, kind:'open', equippedPowerId:wizId, label:w.name||'Scroll', accepts:[]}];
    }
    if(Array.isArray(w&&w.powerSlots)&&w.powerSlots.length) return w.powerSlots.slice(0,2);
    return [
      {id:'slot_element', index:1, kind:'open', accepts:['element_infusion','charged'], rerollPolicy:'hub', equippedPowerId:null, label:'Element Infusion'},
      {id:'slot_charged', index:2, kind:'open', accepts:['charged','element_infusion'], rerollPolicy:'hub', equippedPowerId:null, label:'Charged Scroll'},
    ];
  }
  function armoryPowerHeading(w){
    return (w&&w._scroll) ? 'SCROLL POWER' : 'POWER SLOTS';
  }
  function armoryNotes(){
    return [
      'React ShopUI 1:1 — Weapons + buyable Wizardry (SCROLLS). Listing/details SetVisibility + slide.',
      'Details: 4 skins + 2 power sockets (no orange detail plate). Skin_/PowerSlot_ open scr_armory_picker (X = CloseBtn).',
      'Picker canvas toggles SKINS ↔ POWERS view layers; Equip/Unlock stays on details.',
    ].join(' ');
  }

  /* Listing card: big EMPTY / FULL plate in the art area (not tiny pips). */
  function armoryCardSlotPlate(w){
    const slots=armoryPowerSlotsFor(w);
    const slot=slots[0]||{kind:'open', label:'Element Infusion'};
    const wiz=armoryResolveWiz(slot.equippedPowerId||slot.lockedPowerId, armoryWizById());
    const empty=!wiz && slot.kind!=='locked';
    const lockedSig=slot.kind==='locked' || (w&&w.slotPolicy)==='locked_power';
    const status=empty?'EMPTY':(lockedSig?'LOCKED':'FULL');
    const title=empty?(slot.label||'Power slot'):(wiz.name||slot.label||'Power');
    const accent=empty?'stroke':((wiz&&wiz.color)||w.color||'gold');
    const W=220, H=72;
    return uiOverlay([
      uiRect(accent, W, H, {opacity:1}, sl('Fill','Fill'), 'Slot plate border'),
      uiRect('panelDeep', W-4, H-4, {opacity:0.95}, sl('Fill','Fill',[2,2,2,2]), 'Slot plate fill'),
      uiText('SLOT · '+status, {size:'tiny', color:accent, justify:'Center'}, sl('Center','Top',[0,12,0,0]), 'Slot status'),
      uiText(title, {size:'small', color:'text', justify:'Center'}, sl('Center','Bottom',[0,0,0,12]), 'Slot title'),
    ], sl('Center','Center',[0,28,0,0]), 'Card power slot');
  }
  function buildArmoryWeaponCard(w, index, i){
    const owned=!!w.starter;
    const locked=!owned;
    const price=armoryPriceParts(w);
    const col=i%3, row=Math.floor(i/3);
    const x=col*(ARMORY_CARD_W+ARMORY_GUTTER);
    const y=row*(ARMORY_CARD_H+ARMORY_GUTTER);
    const states=['normal','hot','selected','locked'];
    const previewState=locked?'locked':(states[i%4]||'normal');
    const iconPath=w.uefnIcon||('Textures.'+(w.symbol||'W'));
    return uiWeaponCard(ARMORY_CARD_W, ARMORY_CARD_H, {
      title:w.name||w.id,
      body:armoryDescText(w),
      accent:w.color||'stroke',
      icon:iconPath,
      owned, locked,
      index:index+1,
      priceText:owned?'':String(price.amount||0),
      priceSym:price.sym,
      priceColor:price.color,
      priceBind:'Price_'+w.id,
      slotPlate: w._scroll ? null : armoryCardSlotPlate(w),
      state:previewState,
      fx:'pad', fxIndex:i,
      bind:'WeaponCard_'+w.id,
      slot:csBox(x,y,ARMORY_CARD_W,ARMORY_CARD_H),
      name:'Card · '+(w.name||w.id),
    });
  }

  function buildArmoryGridLayer(entries, category, page, viewProps, name){
    const filtered=armoryFilterEntries(entries, category);
    const pageCount=Math.max(1, Math.ceil(Math.max(filtered.length,1)/ARMORY_PAGE_SIZE));
    const pageIndex=Math.max(0, Math.min(pageCount-1, page|0));
    const slice=filtered.slice(pageIndex*ARMORY_PAGE_SIZE, pageIndex*ARMORY_PAGE_SIZE+ARMORY_PAGE_SIZE);
    const gridKids=[];
    for(let i=0;i<slice.length;i++){
      gridKids.push(buildArmoryWeaponCard(slice[i], pageIndex*ARMORY_PAGE_SIZE+i, i));
    }
    const gridH=ARMORY_CARD_H*2+ARMORY_GUTTER;
    const grid=uiCanvas(gridKids, csBox((UI_STAGE_W-ARMORY_GRID_W)/2, ARMORY_HEADER_H+ARMORY_TAB_H+24, ARMORY_GRID_W, gridH), 'Weapon grid');
    grid.props={collapseDefault:true};
    const kids=[grid];
    if(pageCount>1){
      kids.push(uiPager(pageIndex+1, pageCount, ARMORY_GRID_W, {
        slot:csBox((UI_STAGE_W-ARMORY_GRID_W)/2, ARMORY_HEADER_H+ARMORY_TAB_H+24+gridH+16, ARMORY_GRID_W, 48),
        prevBind:'PagerPrev', nextBind:'PagerNext', labelBind:'PagerLabel',
      }));
    }
    const layer=uiCanvas(kids, csFill(0,0,0,0), name||('Grid · '+category+' · p'+(pageIndex+1)));
    layer.props=Object.assign({collapseDefault:true}, viewProps||{});
    layer.slot=Object.assign(csFill(0,0,0,0), {z:2});
    return layer;
  }

  function buildArmoryDetailsView(weapon, categoryLabel){
    const w=weapon||{name:'No weapon', desc:'', fireIdentity:'', upgrades:[], stats:null, skins:null};
    const owned=!!w.starter;
    const price=armoryPriceParts(w);
    const backLabel='BACK TO '+(categoryLabel||w.category||'ARMORY').toUpperCase();
    const back=uiOverlay([
      uiRect('panelDeep', 280, 44, {opacity:0.95}, sl('Fill','Fill'), 'Back bg'),
      uiText(backLabel, {size:'tiny', color:'text'}, sl('Center','Center'), 'Back label'),
    ], csBox(MX, ARMORY_HEADER_H+16, 280, 44), 'Back affordance');
    back.props={asButton:true, variant:'quiet'}; back.bind='BackBtn';

    const statSpecs=armoryStatRowsFor(w);
    const statRows=(statSpecs.length?statSpecs:[{key:'damage',label:'Damage',pct:0}]).map((row)=>
      uiStatRow(row.label, row.pct, 340, {fx:'bar', bind:'Stat_'+String(row.key).replace(/[^A-Za-z0-9]+/g,'_')})
    );
    const desc=armoryDescText(w);
    const descH=Math.max(140, Math.min(260, 48+Math.ceil(desc.length/34)*22));
    const left=uiStack('V', [
      uiText('SELECTED WEAPON', {size:'tiny', color:'textMute'}, sl('Left','Top',[0,0,0,8]), 'Sel kicker'),
      Object.assign(uiText(w.name||w.id||'—', {size:'h2', color:'gold'}, sl('Left','Top',[0,0,0,16]), 'Weapon name'), {bind:'WeaponName'}),
      ...statRows,
      uiOverlay([
        uiRect('panelDeep', 340, descH, {opacity:0.95}, sl('Fill','Fill'), 'Desc bg'),
        uiRect('stroke', 340, descH, {opacity:0.5}, sl('Fill','Fill'), 'Desc border'),
        Object.assign(uiText(desc, {size:'small', color:'textDim', wrap:true, wrapWidth:308}, sl('Left','Top',[16,16,16,16]), 'Desc body'), {bind:'DescBody'}),
      ], sl('Fill','Top',[0,18,0,0]), 'Description plate'),
      uiRect('stroke', 2, 640, {opacity:0.5}, sl('Right','Fill'), 'Left divider'),
    ], csBox(MX, ARMORY_HEADER_H+80, 380, 720), 'Details left');
    left.props={fx:'pad', fxIndex:0, collapseDefault:true};

    const ghost=uiText(w.name||'', {size:'display', color:'textMute', opacity:0.12, justify:'Center'}, sl('Center','Top',[0,8,0,0]), 'Ghost name');
    ghost.props=Object.assign(ghost.props||{}, {fx:'fade'});
    const wizById=armoryWizById();
    const powerSlots=armoryPowerSlotsFor(w);
    const powerHeading=armoryPowerHeading(w);
    /* Two sockets side-by-side — press opens scr_armory_picker. */
    const powerCards=(powerSlots.length?powerSlots:armoryPowerSlotsFor({})).slice(0,2).map((slot,i)=>{
      const pid=slot.equippedPowerId||slot.lockedPowerId||null;
      const wiz=armoryResolveWiz(pid, wizById);
      return uiWizardrySlot(slot, wiz, i===0, {
        w:248, h:128,
        slotPolicy:w.slotPolicy||'infusable',
        bind:'PowerSlot_'+i,
        slot:sl('Left','Fill',[i?16:0,0,0,0]),
        name:'Power slot · '+(slot.label||(i+1)),
      });
    });
    const skins=armorySkinsFor(w);
    const center=uiStack('V', [
      ghost,
      uiOverlay([
        uiRect('panelDeep', 520, 160, {opacity:0.95}, sl('Fill','Fill'), 'Showcase bg'),
        uiRect(w.color||'stroke', 520, 4, {}, sl('Fill','Top'), 'Showcase bar'),
        uiIconPlate(w.uefnIcon||'Textures.T_Empty', 96),
      ], sl('Center','Top',[0,24,0,0]), 'Showcase'),
      uiText('AVAILABLE SKINS', {size:'tiny', color:'textMute'}, sl('Left','Top',[20,20,0,8]), 'Skins heading'),
      uiSkinsRow(skins, {slot:sl('Left','Top',[20,0,0,0]), bindPrefix:'Skin_', name:'Skins row'}),
      uiText(powerHeading, {size:'tiny', color:'gold'}, sl('Left','Top',[20,22,0,10]), 'Power heading'),
      uiStack('H', powerCards, sl('Left','Top',[20,0,0,0]), 'Power slots'),
    ], csBox(MX+380+40, ARMORY_HEADER_H+80, 892, 720), 'Details center');
    center.props={fx:'pad', fxIndex:1, collapseDefault:true};

    const upgrades=w.upgrades||[];
    const upRows=upgrades.length
      ? upgrades.map((u,i)=>uiUpgradeRow(u.name||('Upgrade '+(i+1)), u.desc||u.boost||'', u.cost!=null?String(u.cost):(u.amount!=null?String(u.amount):''), 400, {bind:'Upgrade_'+i, accent:w.color||'stroke'}))
      : [uiText('No upgrades listed', {size:'tiny', color:'textMute'}, sl('Left','Top'), 'No upgrades')];
    const actionLabel=owned
      ? 'Equip Weapon'
      : ('Unlock for '+(price.amount||0)+(price.sym?(' '+price.sym):''));
    const actionBtn=uiButton(actionLabel, 'loud', sl('Fill','Top'), owned?'Equip action':'Unlock action');
    actionBtn.bind='ActionBtn';
    actionBtn.props=Object.assign({}, actionBtn.props||{}, {state:owned?'selected':'normal', asButton:true, variant:'loud'});
    const right=uiStack('V', [
      uiText('UPGRADES', {size:'tiny', color:'gold'}, sl('Left','Top',[0,0,0,12]), 'Upgrades heading'),
      ...upRows,
      uiStack('V', [actionBtn], sl('Fill','Bottom',[0,20,0,0]), 'Action area'),
      uiRect('stroke', 2, 640, {opacity:0.5}, sl('Left','Fill'), 'Right divider'),
    ], csBox(MX+380+40+892+40, ARMORY_HEADER_H+80, 440, 720), 'Details right');
    right.props={fx:'pad', fxIndex:2, collapseDefault:true};

    const layer=uiCanvas([back, left, center, right], csFill(0,0,0,0), 'Details · '+(w.name||'empty'));
    layer.props={
      view:{group:'mode', id:'details', initial:false, label:'Details'},
      collapseDefault:true,
      fx:'slideDetails',
      modeSlide:'details',
    };
    layer.slot=Object.assign(csFill(0,0,0,0), {z:3});
    return layer;
  }

  function buildArmoryScreenRoot(){
    if(typeof ensureWeapons==='function') ensureWeapons();
    if(typeof ensureWizardry==='function') ensureWizardry();
    const entries=armoryCatalogEntries();
    const cats=armoryCategories();
    if(!state.meta) state.meta={};
    let activeCat=state.meta.armoryCategory||'PISTOLS';
    if(cats.indexOf(activeCat)<0) activeCat='PISTOLS';
    state.meta.armoryCategory=activeCat;
    const filteredActive=armoryFilterEntries(entries, activeCat);
    let sel=entries.find(w=>w.id===state.meta.armorySelected)||filteredActive[0]||entries[0]||null;
    if(sel) state.meta.armorySelected=sel.id;
    let page=Math.max(0, Number(state.meta.armoryPage)||0);
    const pageCount=Math.max(1, Math.ceil(Math.max(filteredActive.length,1)/ARMORY_PAGE_SIZE));
    if(page>=pageCount) page=pageCount-1;
    state.meta.armoryPage=page;

    const curs=(state.currencies||[]).slice(0,2);
    const chip0=curs[0]
      ? uiCurrencyChip(curs[0].symbol||'', '1,240', curs[0].color||'curSandGrain', 'SandText')
      : uiCurrencyChip('⏳','1,240','curSandGrain','SandText');
    const chip1=curs[1]
      ? uiCurrencyChip(curs[1].symbol||'', '86', curs[1].color||'curTimeEssence', 'EssenceText')
      : uiCurrencyChip('💷','86','curTimeEssence','EssenceText');

    const header=uiOverlay([
      uiRect('panelDeep', UI_STAGE_W, ARMORY_HEADER_H, {opacity:0.96}, sl('Fill','Fill'), 'Header bg'),
      uiRect('gold', UI_STAGE_W, 3, {}, sl('Fill','Bottom'), 'Header rule'),
      uiText('Armory', {size:'h1', color:'text'}, sl('Left','Center',[MX,0,0,0]), 'Armory title'),
      uiStack('H', [chip0, Object.assign(chip1, {slot:sl('Left','Center',[16,0,0,0])})], sl('Right','Center',[0,0,MX,0]), 'Wallet'),
    ], Object.assign(csBandTop(ARMORY_HEADER_H,0,0,0), {z:5}), 'Header band');
    header.props={collapseDefault:true};

    const tabLabels=cats.map(c=>armoryCatMeta(c).label);
    const activeIdx=Math.max(0, cats.indexOf(activeCat));
    const tabs=uiTabStrip(tabLabels, activeIdx, UI_STAGE_W, {
      binds:cats.map(c=>'Tab'+String(c).replace(/[^A-Za-z0-9]+/g,'')),
    });
    tabs.slot=Object.assign(csBandTop(ARMORY_TAB_H,0,0,ARMORY_HEADER_H), {z:5});
    tabs.props=Object.assign(tabs.props||{}, {collapseDefault:true});

    const pageLayers=[];
    for(let p=0;p<pageCount;p++){
      pageLayers.push(buildArmoryGridLayer(
        entries, activeCat, p,
        {view:{group:'page', id:String(p), initial:p===page, label:'Page '+(p+1)}},
        'Page · '+(p+1)
      ));
    }
    const catMarkers=cats.map(c=>{
      const m=uiRect('bg', 1, 1, {opacity:0}, csBox(-20,-20,1,1), 'ViewCat · '+c);
      m.props={view:{group:'category', id:c, initial:c===activeCat, label:c}};
      return m;
    });

    const listingHost=uiCanvas([tabs].concat(pageLayers).concat(catMarkers).concat([
      uiFooterHint(['[A] Confirm','[B] Back','[LB/RB] Category','[LS] Navigate']),
    ]), csFill(0,0,0,0), 'Listing host');
    listingHost.props={
      view:{group:'mode', id:'listing', initial:true, label:'Listing'},
      collapseDefault:true,
      fx:'slideList',
      modeSlide:'listing',
    };
    listingHost.slot=Object.assign(csFill(0,0,0,0), {z:2});

    const details=buildArmoryDetailsView(sel, activeCat);

    return uiCanvas([
      uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
      listingHost,
      details,
      header,
    ], null, 'Root');
  }

  function armoryPickerOptions(mode, w){
    if(mode==='powers'){
      const accepts=['element_infusion','charged'];
      return (state.wizardry||[]).filter(p=>p && p.buyable!==false && accepts.indexOf(p.kind)>=0).slice(0,8).map(p=>({
        id:p.id, title:p.name||p.id, sub:(p.element||p.kind||'')+' · hub equip', right:p.symbol||'◆', accent:p.color||'accentAlt',
      }));
    }
    return armorySkinsFor(w).map(sk=>({
      id:sk.id, title:sk.name||sk.id, sub:'Cosmetic · equip anytime', right:'', accent:sk.color||'stroke',
    }));
  }
  function buildArmoryPickerRoot(){
    if(typeof ensureWeapons==='function') ensureWeapons();
    if(typeof ensureWizardry==='function') ensureWizardry();
    const entries=armoryCatalogEntries();
    const w=entries.find(x=>x.id===(state.meta&&state.meta.armorySelected))||entries[0]||{name:'Weapon', color:'#9ca3af'};
    if(!state.meta) state.meta={};
    let mode=state.meta.armoryPicker||'skins';
    if(mode!=='powers') mode='skins';
    state.meta.armoryPicker=mode;
    const PW=780, PH=720;
    const closeBtn=uiOverlay([
      uiRect('stroke', 48, 48, {opacity:1}, sl('Fill','Fill'), 'Close border'),
      uiRect('panelDeep', 44, 44, {opacity:0.95}, sl('Center','Center'), 'Close fill'),
      uiText('✕', {size:'h3', color:'text', justify:'Center'}, sl('Center','Center'), 'Close X'),
    ], sl('Right','Top'), 'Close');
    closeBtn.bind='CloseBtn';
    closeBtn.props={asButton:true, variant:'quiet', collapseDefault:true};
    function listLayer(listMode, label){
      const opts=armoryPickerOptions(listMode, w);
      const rows=opts.length?opts.map((opt,i)=>uiRow(PW-96, 88, {
        accent:opt.accent, title:opt.title, sub:opt.sub, right:opt.right||'Select', rightColor:'gold',
        binds:{btn:'Option_'+i},
        slot:sl('Fill','Top',[0,0,0,i?12:0]),
        name:'Option · '+opt.title,
      })):[uiText('Nothing available yet', {size:'small', color:'textMute'}, sl('Left','Top'), 'Empty list')];
      const layer=uiStack('V', rows, sl('Fill','Top',[0,16,0,0]), label+' list');
      layer.props={
        view:{group:'picker', id:listMode, initial:mode===listMode, label:label},
        collapseDefault:true,
      };
      return layer;
    }
    const title=Object.assign(uiText(mode==='powers'?'CHOOSE POWER':'CHOOSE SKIN', {size:'h2', color:'text'}, sl('Left','Top'), 'Picker title'), {bind:'PickerTitle'});
    const sub=Object.assign(uiText((w.name||'Weapon')+' · tap a row to equip · ✕ closes', {size:'small', color:'textDim'}, sl('Left','Top',[0,0,0,12]), 'Picker sub'), {bind:'PickerSub'});
    const tabs=uiTabStrip(['SKINS','POWERS'], mode==='powers'?1:0, PW-96, {
      binds:['PickerTabSkins','PickerTabPowers'],
    });
    tabs.slot=sl('Fill','Top',[0,0,0,18]);
    const content=uiStack('V', [
      uiOverlay([title, closeBtn], sl('Fill','Top',[0,0,0,8]), 'Picker header'),
      sub,
      tabs,
      listLayer('skins','Skins'),
      listLayer('powers','Powers'),
      uiText('[A] Select   [B] / ✕ Close', {size:'tiny', color:'textMute'}, sl('Left','Bottom',[0,20,0,0]), 'Picker hints'),
    ], sl('Fill','Fill'), 'Picker content');
    return uiScrim([ uiPanel(PW, PH, [content], {padding:48, stroke:'gold', name:'Picker panel'}) ]);
  }
  function syncArmoryPickerScreen(opts){
    const o=opts||{};
    if(!Array.isArray(state.uiScreens) || !state.uiScreens.length){
      state.uiScreens = uiSeedScreens();
    }
    const root=buildArmoryPickerRoot();
    const notes='Armory picker popup — Skin_/PowerSlot_ open this canvas. Toggle SKINS ↔ POWERS (picker view group). CloseBtn ✕ dismisses back to Armory details.';
    let screen=state.uiScreens.find(s=>s.id===ARMORY_PICKER_SCREEN_ID);
    if(!screen){
      screen=uiScreen(ARMORY_PICKER_SCREEN_ID,'Armory Picker','popup','popup', notes,
        'GameDevices/Gameplay/Screens/Popup','armory_picker', root);
      state.uiScreens.push(screen);
    } else {
      screen.root=root;
      screen.name='Armory Picker';
      screen.notes=notes;
      if(screen.status==='built') screen.status='design';
    }
    if(!state.meta.uiViews) state.meta.uiViews={};
    if(state.meta.uiViews.picker==null) state.meta.uiViews.picker=state.meta.armoryPicker||'skins';
    return true;
  }

  function armorySyncFingerprint(){
    try{
      return JSON.stringify({
        layout:ARMORY_LAYOUT,
        w:(state.weapons||[]).map(x=>({id:x.id,name:x.name,cat:x.category,st:x.starter,pr:x.price,stt:x.stats,sk:x.skins,up:x.upgrades,ic:x.uefnIcon,c:x.color,d:x.desc,f:x.fireIdentity,pol:x.slotPolicy,ps:(x.powerSlots||[]).map(s=>({k:s.kind,e:s.equippedPowerId,l:s.lockedPowerId,lb:s.label}))})),
        z:(state.wizardry||[]).map(x=>({id:x.id,name:x.name,el:x.element,k:x.kind,c:x.color,sy:x.symbol,buy:x.buyable,pr:x.price,d:x.desc,cd:x.chargedDesc,pd:x.procDesc})),
        cur:(state.currencies||[]).map(c=>({id:c.id,symbol:c.symbol,color:c.color})),
        sel:state.meta&&state.meta.armorySelected,
        cat:state.meta&&state.meta.armoryCategory,
        page:state.meta&&state.meta.armoryPage,
        picker:state.meta&&state.meta.armoryPicker,
      });
    }catch(e){ return String(Date.now()); }
  }
  let _armoryFp='';

  function syncArmoryScreenFromWeapons(opts){
    const o=opts||{};
    if(typeof ensureWeapons==='function') ensureWeapons();
    if(!Array.isArray(state.uiScreens) || !state.uiScreens.length){
      state.uiScreens = uiSeedScreens();
    }
    const fp=armorySyncFingerprint();
    let screen = state.uiScreens.find(s=>s.id===ARMORY_SCREEN_ID);
    if(screen && fp===_armoryFp && !o.force) {
      if(o.rerender && state.meta.activeTab==='uiscreens') renderUIScreens();
      return false;
    }
    _armoryFp=fp;
    const root=buildArmoryScreenRoot();
    const notes=armoryNotes();
    if(!screen){
      screen = uiScreen(ARMORY_SCREEN_ID,'Armory','hub','shop', notes,
        'GameDevices/Gameplay/Screens/Shop','shop_weapons', root);
      state.uiScreens.push(screen);
    } else {
      screen.root = root;
      screen.name = 'Armory';
      screen.notes = notes;
      if(screen.status==='built') screen.status='design';
    }
    syncArmoryPickerScreen({force:true});
    if(!state.meta.uiViews) state.meta.uiViews={};
    if(state.meta.uiViews.mode==null) state.meta.uiViews.mode='listing';
    state.meta.uiViews.category=state.meta.armoryCategory||'PISTOLS';
    state.meta.uiViews.page=String(state.meta.armoryPage||0);
    if(o.save) save(o.flush?{flush:true}:undefined);
    if(o.rerender && state.meta.activeTab==='uiscreens') renderUIScreens();
    return true;
  }

  /* ===== boot ===== */
  async function resolveProjectKey(){
    try{
      const r=await rgdRpc('get_project_key',{},6000);
      if(r&&r.ok&&r.key){ projectKey=r.key; return projectKey; }
    }catch(e){}
    try{
      const s=await bridge.raw('rgd_get_state',{});
      if(s&&s.meta&&s.meta.projectKey){ projectKey=s.meta.projectKey; return projectKey; }
    }catch(e){}
    return projectKey;
  }
  async function fetchDefaults(){
    try{
      const r=await fetch('../assets/defaults.json');
      if(!r.ok) return null;
      return await r.json();
    }catch(e){ return null; }
  }
  /* Load = read the store. Nothing else. A failed read leaves _hydrated false so
     no later save can write defaults over the design that is still on disk. */
  async function hydrateState(){
    await resolveProjectKey();
    let disk=null, storeErr='';
    try{
      const r=await rgdRpc('get_store',{},30000);
      if(r&&r.ok&&r.state) disk=r.state;
      else storeErr=(r&&(r.error||r.message))||'get_store returned nothing';
    }catch(e){ storeErr=String(e&&e.message||e); }
    if(!disk){
      // No store = no idea what is saved. Stay read-only rather than invent a design.
      _hydrated=false; _hydratedKey=null;
      toast('Cannot reach the design store ('+storeErr+') — READ-ONLY, nothing will be saved','err');
      return false;
    }
    // A brand-new project comes back empty — seed it from the shipped defaults.
    const empty=!(disk.levels||[]).length && !(disk.npcs||[]).length;
    const merged=Object.assign(seed(), empty?((await fetchDefaults())||disk):disk);
    if(!merged.difficulties||!merged.difficulties.length) merged.difficulties=seed().difficulties;
    if(!merged.weapons) merged.weapons=[];
    if(!merged.wizardry) merged.wizardry=[];
    if(!merged.elements) merged.elements=[];
    if(!merged.currencies) merged.currencies=[];
    if(!merged.chunks) merged.chunks=[];
    if(!merged.genTemplates) merged.genTemplates=[];
    if(!merged.journeys) merged.journeys=[];
    state=merged;
    if(!state.meta) state.meta={};
    if(state.meta.activeTab==='procgen'||state.meta.activeTab==='chunks'){
      state.meta.levelsSubtab=state.meta.activeTab==='chunks'?'chunks':'gen';
      state.meta.activeTab='levels';
    }
    if(!state.meta.levelsSubtab) state.meta.levelsSubtab='gen';
    if(state.meta.levelsSubtab==='assets'){ state.meta.levelsSubtab='gen'; state.meta.activeTab='assets'; }
    if(['gen','chunks','journeys'].indexOf(state.meta.levelsSubtab)<0) state.meta.levelsSubtab='gen';
    if(!state.chunkAssets) state.chunkAssets=[];
    (state.levels||[]).forEach(normalizeLevelLocal);
    if(typeof ensureJourneys==='function') ensureJourneys();
    _hydrated=true; _hydratedKey=projectKey;
    const seeded=ensureCurrencies();
    let synced=false;
    try{ synced=syncSkillTreeScreenFromProgression(); }catch(e){}
    let armorySynced=false;
    try{ armorySynced=!!syncArmoryScreenFromWeapons({force:true}); }catch(e){}
    let uiMigrated=false;
    try{ uiMigrated = !!uiEnsureSeededScreen('scr_boss_defeated'); }catch(e){}
    if(normalizeDrops() || normalizeNpcs() || seeded || synced || armorySynced || uiMigrated) save();
    return true;
  }
  let _booted=false, _booting=false, _hostBound=false, _statusTimer=null, _loadTries=0;
  async function init(){
    if(_booting) return;
    _booting=true;
    try{
      // Re-init only when project key changes — host-ready used to wipe in-memory edits.
      const prevKey=projectKey;
      buildNav();
      if(!_booted){
        await hydrateState();
      } else {
        const k=await resolveProjectKey();
        // Re-read on project switch, and retry a load that failed earlier.
        if(k!==prevKey || !_hydrated) await hydrateState();
      }
      ensureWeapons(); ensureWizardry();
      go(state.meta.activeTab||'dashboard');
      if(!_statusTimer) _statusTimer=setInterval(refreshStatus,5000);
      refreshStatus();
      if(!_hostBound){
        _hostBound=true;
        window.addEventListener('rgd:host-ready',()=>{ init(); });
        window.addEventListener('keydown', function onEditorKey(ev){
          const mod=ev.ctrlKey||ev.metaKey; if(!mod) return;
          const t=ev.target; const tag=(t&&t.tagName)||'';
          if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
          if(ev.key==='s'||ev.key==='S'){
            ev.preventDefault();
            Promise.resolve(flushSave()).then(function(r){
              if(r&&r.ok) toast(r.local?'Saved locally':'Saved','ok');
              else toast('Save failed: '+((r&&r.error)||'unknown'),'err');
            }).catch(function(e){ toast('Save failed: '+e,'err'); });
          }
        });
        // Every edit already writes within 250ms; these only flush a pending debounce.
        window.addEventListener('pagehide', ()=>{ try{ flushSave(); }catch(_){ } });
        window.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden'){ try{ flushSave(); }catch(_){ } } });
      }
      _booted=true;
      lucide.createIcons();
      // The bridge can come up after the panel does — keep retrying the load a few
      // times instead of sitting read-only forever.
      if(!_hydrated && _loadTries<5){ _loadTries++; setTimeout(init, 2000); }
    } finally { _booting=false; }
  }

  return { init, go, toast, closeModal, closeDetail, closeConfirm, confirmModal,
    setCatalogueView,
    openStatModal, saveStat, deleteStat, confirmDeleteStat,
    openNPCModal, saveNPC, deleteNPC, confirmDeleteNPC, setNpcTypeFilter, setNpcRoleFilter,
    openItemModal, saveItem, deleteItem, confirmDeleteItem, setDropFilter,
    openDropTableModal, saveDropTable, deleteDropTable, confirmDeleteDropTable, addDropEntryRow, removeDropEntryRow,
    attachTableToNpcFromModal, linkItemToLoot, unlinkItemFromNpc,
    openCurrencyModal, saveCurrency, deleteCurrency, confirmDeleteCurrency,
    setProgSimLevel, setProgMaxLevel, setPointsPerLevel, setLevelPoints, rebuildProgLevels, resetProgSim,
    selectProgNode, simUpgradeNode, simRefundNode, progNodeDown,
    setProgEditMode, beginWireToSelected, progEdgeClick, progRemoveRequireChip, progTreeDblClick,
    openProgNodeModal, saveProgNode, deleteProgNode, confirmDeleteProgNode, syncSkillTreeUI, progWriteSkillTreeVerse,
    openScalingModal, addScalingRow, saveScaling,
    openWeaponModal, saveWeapon, deleteWeapon, confirmDeleteWeapon, setWeaponFilter,
    openWizardryModal, saveWizardry, deleteWizardry, confirmDeleteWizardry, setWizardryFilter,
    uiGoScreen, uiSelect, uiToggle, uiZoomBy, uiFit, uiScreenField, uiNode, uiProp, uiSlot,
    uiAnchorPreset, uiAdd, uiMoveSel, uiDupSel, uiDelSel, uiNewScreen, uiResetCatalogue,
    uiCopyVerse, uiWriteVerse, uiSetView, uiToggleCollapse, uiCollapseAll, uiViewField,
    _uiScreens:()=>uiScreensList(), _uiVerse:(id)=>uiVerseBundle((state.uiScreens||[]).find(s=>s.id===id)),
    newLevel,setOverlayField,setOverlayOpacity,clearOverlay,onOverlayFile, selectLevel, updateLevelField, resizeLevel, resetLevel, saveLevel, deleteLevel, confirmDeleteLevel,
    pickTool, pickEntity, undoPaint, redoPaint, fitGrid, centerGrid, zoomBy,
    setLevelsSubtab, renderLevelGen, setLevelJourney,
    addJourneyStep, updateJourneyStep, moveJourneyStep, removeJourneyStep, updateJourneyField,
    ensureJourneys, renderJourneys, selectJourney, newJourney, dupJourney, deleteJourney,
    updateJourneyRecord, updateJourneyLoop, toggleJourneyPool, setJourneyEnemyTab,
    addCatalogueJourneyStep, updateCatalogueJourneyStep, moveCatalogueJourneyStep, removeCatalogueJourneyStep,
    toggleJourneyStepAccordion,
    setCatalogueStepEnemyPool, setCatalogueStepEnemyTab, toggleCatalogueStepEnemy, clearCatalogueStepEnemies,
    setCatalogueStepRewardIds, journeyById, activeJourney,
    journeyStampSummary, journeyNpcIds,
    toggleInclude, setLayerVisible,
    spawnEntity, buildLevel, syncFromUEFN, pushEverything,
    selectChunk, chunkRotNext, chunkRotPrev, chunkPickPaint, chunkPickPlace, chunkSetPropAsset, addChunkAsset, updateChunkField,
    setChunkViewMode,
    applyChunkShapePreset, rebuildPortsFromGrid,
    importChunkFromUeFn, newChunk, deleteChunk, renderChunks,
    contentPathLabel, toUeContentPath, renderAssets, selectAsset, updateAssetField, newKitAsset, deleteAsset,
    syncAssetsFromUeFn, toggleAssetCompose, disposeAssetViewer, disposeChunkViewer, disposeProcgenViewer, resetProcgenOrbit, disposeAllThreeViewers,
    mountChunkViewer, refreshChunkThree, buildChunkMesh3D,
    buildLayoutMesh3D, mountProcgenViewer, refreshProcgenThree,
    renderProcgen, pgSelectTemplate, pgUpdateTpl, pgSetLinear,
    pgSetLayoutStyle, pgSetSizeScale, pgSetMapHeight, pgSetPathPadding, pgSetBranchBudget, pgSetStraightness, pgSetFillEmpty,
    pgAddSpine, pgRemoveSpine,
    pgDupTemplate, pgGenerate, pgReroll, pgSetStage, pgSetViewMode, pgToggleDemo, pgBuildUeFn,
    pgSetSeed, pgSetDemoSpeed, pgToggleTroubleshoot, refreshProcgenPreview3d,
    _state:()=>state, _bridge:bridge, _sync:computeSyncStatus,
    _dropCategory:dropCategory, _npcType:npcType, _npcRole:npcRole,
    _scaleAtLevel:scaleAtLevel, _totalPointsAtLevel:totalPointsAtLevel,
    _hydrated:()=>_hydrated, _save:save };
})();
document.addEventListener('DOMContentLoaded', RGD.init);

document.addEventListener('DOMContentLoaded', RGD.init);
