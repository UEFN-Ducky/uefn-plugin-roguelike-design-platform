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

