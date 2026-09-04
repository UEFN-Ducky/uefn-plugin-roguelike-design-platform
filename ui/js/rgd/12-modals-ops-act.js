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

