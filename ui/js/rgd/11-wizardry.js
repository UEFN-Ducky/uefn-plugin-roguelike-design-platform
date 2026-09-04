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


