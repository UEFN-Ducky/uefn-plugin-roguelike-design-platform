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
