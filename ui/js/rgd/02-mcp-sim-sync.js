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

