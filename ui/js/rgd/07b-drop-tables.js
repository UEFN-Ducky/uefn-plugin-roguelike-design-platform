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
