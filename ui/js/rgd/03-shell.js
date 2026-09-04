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

