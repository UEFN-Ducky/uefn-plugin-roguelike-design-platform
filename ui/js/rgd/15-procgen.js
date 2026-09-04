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
