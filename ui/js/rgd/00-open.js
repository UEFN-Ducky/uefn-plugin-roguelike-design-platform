
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
