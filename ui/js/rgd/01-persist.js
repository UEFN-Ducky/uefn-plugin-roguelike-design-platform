  /* ================= PERSISTENCE — ONE STORE, ONE WRITER =================
     The project store (<project>/.ducky/roguelike-design/store.json) is the ONLY
     copy of the design, read through get_store and written through set_store —
     same shape as app Settings. No localStorage mirror, no second write path, no
     freshness/merge heuristics: those made two copies race and silently lose edits.
     _hydrated gates every write, so a failed load can never flush defaults over
     real work.

     Reads and writes go over the postMessage bridge (rgdRpc), NOT window.
     __duckyPluginHost: that object is for main-window scripts and is absent in this
     sandboxed panel, which is why edits used to fall back to a browser-only copy
     and never reach the project. If the bridge does not answer we say so — a save
     is never reported as done when nothing was written. */
  let _hydrated=false, _hydratedKey=null;
  let _saveT=null, _saveChain=Promise.resolve(), _lastSaveOk=null;
  async function _writeStore(){
    if(!_hydrated || _hydratedKey!==projectKey){ _lastSaveOk={ok:false, error:'design not loaded yet — refusing to overwrite the saved store'}; return _lastSaveOk; }
    if(!state.meta) state.meta={};
    state.meta.savedAt=Date.now();
    // Snapshot at write time so a queued older save cannot overwrite fresher edits.
    const st=persistableState();
    try{
      const r=await rgdRpc('set_store',{state:st},90000);
      _lastSaveOk=(r&&r.ok)?{ok:true}:{ok:false, error:(r&&(r.error||r.message))||'set_store failed'};
    }catch(e){ _lastSaveOk={ok:false, error:String(e&&e.message||e)}; }
    return _lastSaveOk;
  }
  function enqueueSave(){
    const p=_saveChain.then(_writeStore).catch(function(e){
      _lastSaveOk={ok:false, error:String(e&&e.message||e)};
      return _lastSaveOk;
    });
    _saveChain=p.then(function(){}, function(){});
    return p;
  }
  function save(opts){
    clearTimeout(_saveT);
    if(opts&&opts.flush) return enqueueSave();
    _saveT=setTimeout(function(){ enqueueSave(); }, 250);
    return Promise.resolve({ok:true, queued:true});
  }
  function flushSave(){
    clearTimeout(_saveT); _saveT=null;
    return enqueueSave();
  }
  function diffNames(){ return (state.difficulties||[]).map(d=>d.name||('D'+d.index)); }
  function diffLabel(idx){ const d=(state.difficulties||[]).find(x=>x.index===idx); return d?d.name:(['Easy','Normal','Hard'][idx]||('Tier '+idx)); }
  function npcDiffLine(n){
    const ds=n.difficultyStats; if(!ds||!ds.length) return '';
    const e=ds[0], h=ds[ds.length-1];
    return `<div class="text-[10px] text-gray-500 mt-1">${esc(diffLabel(0))}: ${e.maxHealth} HP · dmg×${e.damageMultiplier} → ${esc(diffLabel(ds.length-1))}: ${h.maxHealth} HP · dmg×${h.damageMultiplier}</div>`;
  }
  const uid=(p)=>p+'_'+Math.random().toString(36).slice(2,8);

