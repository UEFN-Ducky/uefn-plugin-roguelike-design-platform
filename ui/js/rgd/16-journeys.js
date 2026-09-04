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
