  /* ===== currencies =====
     Catalogue of money types. Everywhere else references these ids:
       drop.currencyReward / npc.currencyDrop = {gold:5}
       drop.price / weapon.price / wizardry.price = {currencyId, amount} */
  function ensureCurrencies(){
    if(!Array.isArray(state.currencies)) state.currencies=[];
    if(!state.currencies.length){
      state.currencies=[
        {id:'gold',name:'Gold',symbol:'G',color:'#fbbf24',desc:'Common loot coin.',startingAmount:0},
        {id:'gems',name:'Gems',symbol:'◆',color:'#a78bfa',desc:'Rare crystal.',startingAmount:0},
        {id:'keys',name:'Keys',symbol:'K',color:'#38bdf8',desc:'Unlocks chests and doors.',startingAmount:0},
      ];
      return true;
    }
    return false;
  }
  function currencyById(id){ return (state.currencies||[]).find(c=>c.id===id)||null; }
  function formatCurrencyBag(bag){
    bag=bag||{};
    const parts=Object.keys(bag).filter(k=>Number(bag[k])).map(k=>{
      const c=currencyById(k); const n=Number(bag[k]);
      return (c?c.symbol+' ':'')+n+' '+(c?c.name:k);
    });
    return parts.join(' · ')||'—';
  }
  function formatPrice(price){
    if(!price||!Number(price.amount)) return '—';
    const c=currencyById(price.currencyId)||{symbol:'$',name:price.currencyId||'gold'};
    return (c.symbol||'$')+' '+Number(price.amount)+' '+(c.name||'');
  }
  function currencyAmountFields(bag, prefix){
    ensureCurrencies();
    bag=bag||{};
    if(!(state.currencies||[]).length) return '<div class="text-[11px] text-amber-400">Add a currency in the Currencies tab first.</div>';
    return `<div class="grid grid-cols-3 gap-2">${state.currencies.map(c=>`
      <label class="block rounded-lg bg-gray-900/80 border border-gray-700 px-2 py-1.5"><span class="text-[10px] text-amber-300/90 flex items-center gap-1"><span style="color:${c.color}">${esc(c.symbol||'$')}</span>${esc(c.name)}</span>
        <input id="${prefix}_${esc(c.id)}" type="number" step="1" value="${Number(bag[c.id])||0}" class="${IN} mt-1 text-amber-100"></label>`).join('')}</div>`;
  }
  function collectCurrencyBag(prefix){
    const out={};
    (state.currencies||[]).forEach(c=>{
      const v=Number(val(prefix+'_'+c.id));
      if(v) out[c.id]=v;
    });
    return out;
  }
  function priceFieldsHtml(price, prefix){
    ensureCurrencies();
    price=price&&typeof price==='object'?price:{currencyId:'gold',amount:0};
    const opts=(state.currencies||[]).map(c=>`<option value="${esc(c.id)}" ${(price.currencyId||'gold')===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
    return `<div class="grid grid-cols-2 gap-3">${field('Shop currency',`<select id="${prefix}Cur" class="${IN}"><option value="">— free —</option>${opts}</select>`)}${field('Shop price',`<input id="${prefix}Amt" type="number" min="0" step="1" value="${Number(price.amount)||0}" class="${IN}">`)}</div>`;
  }
  function collectPrice(prefix){
    const currencyId=val(prefix+'Cur')||'';
    const amount=Number(val(prefix+'Amt'))||0;
    if(!currencyId||!amount) return {currencyId:currencyId||'gold', amount:0};
    return {currencyId, amount};
  }
  function renderCurrencies(){
    ensureCurrencies();
    const rows=(state.currencies||[]).map(c=>{
      const usedDrops=(state.items||[]).filter(i=>Number((i.currencyReward||{})[c.id])||((i.price||{}).currencyId===c.id&&Number((i.price||{}).amount))).length;
      const usedNpcs=(state.npcs||[]).filter(n=>Number((n.currencyDrop||{})[c.id])).length;
      const usedShop=(state.weapons||[]).filter(w=>((w.price||{}).currencyId===c.id&&Number((w.price||{}).amount))).length
        +(state.wizardry||[]).filter(p=>((p.price||{}).currencyId===c.id&&Number((p.price||{}).amount))).length
        +(state.items||[]).filter(i=>((i.price||{}).currencyId===c.id&&Number((i.price||{}).amount))).length;
      return `<tr class="cat-row border-b border-gray-700/60" onclick="RGD.openCurrencyModal('${c.id}')">
        <td class="py-2 px-3"><span class="inline-flex items-center justify-center w-8 h-8 rounded text-sm font-bold" style="background:${c.color}22;color:${c.color};border:1px solid ${c.color}55">${esc(c.symbol||'?')}</span></td>
        <td class="py-2 px-3"><code class="text-xs text-indigo-300">${esc(c.id)}</code></td>
        <td class="py-2 px-3 text-sm text-white font-medium">${esc(c.name)}</td>
        <td class="py-2 px-3 text-sm text-gray-300">${Number(c.startingAmount)||0}</td>
        <td class="py-2 px-3 text-[11px] text-gray-400">${usedDrops} drops · ${usedNpcs} NPC loot · ${usedShop} prices</td>
        <td class="py-2 px-3 text-right whitespace-nowrap" onclick="event.stopPropagation()">
          <button onclick="event.stopPropagation();RGD.openCurrencyModal('${c.id}')" class="text-gray-400 hover:text-white mr-2"><i data-lucide="pencil" class="w-4 h-4"></i></button>
          <button onclick="event.stopPropagation();RGD.deleteCurrency('${c.id}')" class="text-gray-400 hover:text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </td></tr>`;
    }).join('')||`<tr><td colspan="6" class="py-8 text-center text-gray-500 text-sm">No currencies yet.</td></tr>`;
    document.getElementById('tab-currencies').innerHTML=`
      <div class="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <p class="text-sm text-gray-400 max-w-2xl">Define money types once. Drops grant them on pickup, enemies drop them on kill, and shops charge them — every amount points at an id from this list.</p>
        <button onclick="RGD.openCurrencyModal()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-2 shrink-0"><i data-lucide="plus" class="w-4 h-4"></i> Add Currency</button>
      </div>
      <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto"><table class="w-full min-w-[720px]"><thead><tr class="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-700"><th class="text-left py-2 px-3"></th><th class="text-left py-2 px-3">ID</th><th class="text-left py-2 px-3">Name</th><th class="text-left py-2 px-3">Start</th><th class="text-left py-2 px-3">Used by</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function openCurrencyModal(id){
    ensureCurrencies();
    const c=state.currencies.find(x=>x.id===id)||{id:'',name:'',symbol:'$',color:'#fbbf24',desc:'',startingAmount:0};
    modalShell(id?'Edit Currency':'Add Currency',`
      <div class="grid grid-cols-2 gap-3">
        ${field('Currency ID',`<input id="mCurId" value="${esc(c.id)}" ${id?'readonly':''} placeholder="gold" class="${IN} ${id?'opacity-60':''}">`)}
        ${field('Display Name',`<input id="mCurName" value="${esc(c.name)}" placeholder="Gold" class="${IN}">`)}
        ${field('Symbol',`<input id="mCurSym" maxlength="2" value="${esc(c.symbol||'')}" class="${IN} text-center">`)}
        ${field('Color',`<input id="mCurColor" type="color" value="${c.color||'#fbbf24'}" class="w-full h-9 bg-gray-900 border border-gray-700 rounded-lg">`)}
        ${field('Starting amount',`<input id="mCurStart" type="number" min="0" step="1" value="${Number(c.startingAmount)||0}" class="${IN}">`)}
      </div>
      ${field('Description',`<textarea id="mCurDesc" rows="2" class="${IN}">${esc(c.desc||'')}</textarea>`)}
      <p class="text-[11px] text-gray-500 mt-2">Use this id in drop rewards, NPC kill loot, and shop prices across the design.</p>
    `,`RGD.saveCurrency('${id||''}')`);
  }
  function saveCurrency(id){
    ensureCurrencies();
    const name=val('mCurName').trim();
    let cid=id||val('mCurId').trim().toLowerCase().replace(/[^a-z0-9_]/g,'_');
    if(!cid||!name) return toast('ID and name required','warn');
    if(!id&&state.currencies.some(c=>c.id===cid)) return toast('Currency id exists','warn');
    const rec={id:cid, name, symbol:val('mCurSym')||name[0].toUpperCase(), color:val('mCurColor')||'#fbbf24', desc:val('mCurDesc'), startingAmount:Number(val('mCurStart'))||0};
    if(id){ const i=state.currencies.findIndex(c=>c.id===id); state.currencies[i]=rec; }
    else state.currencies.push(rec);
    save({flush:true}); closeModal(); renderCurrencies(); toast('Currency saved','ok');
  }
  function deleteCurrency(id){
    confirmModal('Delete Currency',
      'Delete currency <code class="text-indigo-300">'+esc(id)+'</code>? It will be cleared from drop rewards, NPC loot, and shop prices.',
      "RGD.confirmDeleteCurrency('"+id+"')");
  }
  function confirmDeleteCurrency(id){
    closeModal();
    state.currencies=(state.currencies||[]).filter(c=>c.id!==id);
    if(!state.meta) state.meta={};
    const removed=Array.isArray(state.meta.removedCurrencyIds)?state.meta.removedCurrencyIds:[];
    if(!removed.includes(id)) removed.push(id);
    state.meta.removedCurrencyIds=removed;
    const fallback=(state.currencies[0]&&state.currencies[0].id)||'gold';
    (state.items||[]).forEach(it=>{
      if(it.currencyReward) delete it.currencyReward[id];
      if(it.price&&it.price.currencyId===id){ it.price.currencyId=fallback; it.price.amount=0; }
    });
    (state.npcs||[]).forEach(n=>{ if(n.currencyDrop) delete n.currencyDrop[id]; });
    (state.weapons||[]).forEach(w=>{ if(w.price&&w.price.currencyId===id){ w.price.currencyId=fallback; w.price.amount=0; } });
    (state.wizardry||[]).forEach(p=>{ if(p.price&&p.price.currencyId===id){ p.price.currencyId=fallback; p.price.amount=0; } });
    save({flush:true}); renderCurrencies(); toast('Currency deleted','ok');
  }

