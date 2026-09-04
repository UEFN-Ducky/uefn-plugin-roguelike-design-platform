  /* ===== boot ===== */
  async function resolveProjectKey(){
    try{
      const r=await rgdRpc('get_project_key',{},6000);
      if(r&&r.ok&&r.key){ projectKey=r.key; return projectKey; }
    }catch(e){}
    try{
      const s=await bridge.raw('rgd_get_state',{});
      if(s&&s.meta&&s.meta.projectKey){ projectKey=s.meta.projectKey; return projectKey; }
    }catch(e){}
    return projectKey;
  }
  async function fetchDefaults(){
    try{
      const r=await fetch('../assets/defaults.json');
      if(!r.ok) return null;
      return await r.json();
    }catch(e){ return null; }
  }
  /* Load = read the store. Nothing else. A failed read leaves _hydrated false so
     no later save can write defaults over the design that is still on disk. */
  async function hydrateState(){
    await resolveProjectKey();
    let disk=null, storeErr='';
    try{
      const r=await rgdRpc('get_store',{},30000);
      if(r&&r.ok&&r.state) disk=r.state;
      else storeErr=(r&&(r.error||r.message))||'get_store returned nothing';
    }catch(e){ storeErr=String(e&&e.message||e); }
    if(!disk){
      // No store = no idea what is saved. Stay read-only rather than invent a design.
      _hydrated=false; _hydratedKey=null;
      toast('Cannot reach the design store ('+storeErr+') — READ-ONLY, nothing will be saved','err');
      return false;
    }
    // A brand-new project comes back empty — seed it from the shipped defaults.
    const empty=!(disk.levels||[]).length && !(disk.npcs||[]).length;
    const merged=Object.assign(seed(), empty?((await fetchDefaults())||disk):disk);
    if(!merged.difficulties||!merged.difficulties.length) merged.difficulties=seed().difficulties;
    if(!merged.weapons) merged.weapons=[];
    if(!merged.wizardry) merged.wizardry=[];
    if(!merged.elements) merged.elements=[];
    if(!merged.currencies) merged.currencies=[];
    if(!merged.chunks) merged.chunks=[];
    if(!merged.genTemplates) merged.genTemplates=[];
    if(!merged.journeys) merged.journeys=[];
    state=merged;
    if(!state.meta) state.meta={};
    if(state.meta.activeTab==='procgen'||state.meta.activeTab==='chunks'){
      state.meta.levelsSubtab=state.meta.activeTab==='chunks'?'chunks':'gen';
      state.meta.activeTab='levels';
    }
    if(!state.meta.levelsSubtab) state.meta.levelsSubtab='gen';
    if(state.meta.levelsSubtab==='assets'){ state.meta.levelsSubtab='gen'; state.meta.activeTab='assets'; }
    if(['gen','chunks','journeys'].indexOf(state.meta.levelsSubtab)<0) state.meta.levelsSubtab='gen';
    if(!state.chunkAssets) state.chunkAssets=[];
    (state.levels||[]).forEach(normalizeLevelLocal);
    if(typeof ensureJourneys==='function') ensureJourneys();
    _hydrated=true; _hydratedKey=projectKey;
    const seeded=ensureCurrencies();
    let synced=false;
    try{ synced=syncSkillTreeScreenFromProgression(); }catch(e){}
    let armorySynced=false;
    try{ armorySynced=!!syncArmoryScreenFromWeapons({force:true}); }catch(e){}
    let uiMigrated=false;
    try{ uiMigrated = !!uiEnsureSeededScreen('scr_boss_defeated'); }catch(e){}
    if(normalizeDrops() || normalizeNpcs() || seeded || synced || armorySynced || uiMigrated) save();
    return true;
  }
  let _booted=false, _booting=false, _hostBound=false, _statusTimer=null, _loadTries=0;
  async function init(){
    if(_booting) return;
    _booting=true;
    try{
      // Re-init only when project key changes — host-ready used to wipe in-memory edits.
      const prevKey=projectKey;
      buildNav();
      if(!_booted){
        await hydrateState();
      } else {
        const k=await resolveProjectKey();
        // Re-read on project switch, and retry a load that failed earlier.
        if(k!==prevKey || !_hydrated) await hydrateState();
      }
      ensureWeapons(); ensureWizardry();
      go(state.meta.activeTab||'dashboard');
      if(!_statusTimer) _statusTimer=setInterval(refreshStatus,5000);
      refreshStatus();
      if(!_hostBound){
        _hostBound=true;
        window.addEventListener('rgd:host-ready',()=>{ init(); });
        window.addEventListener('keydown', function onEditorKey(ev){
          const mod=ev.ctrlKey||ev.metaKey; if(!mod) return;
          const t=ev.target; const tag=(t&&t.tagName)||'';
          if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
          if(ev.key==='s'||ev.key==='S'){
            ev.preventDefault();
            Promise.resolve(flushSave()).then(function(r){
              if(r&&r.ok) toast(r.local?'Saved locally':'Saved','ok');
              else toast('Save failed: '+((r&&r.error)||'unknown'),'err');
            }).catch(function(e){ toast('Save failed: '+e,'err'); });
          }
        });
        // Every edit already writes within 250ms; these only flush a pending debounce.
        window.addEventListener('pagehide', ()=>{ try{ flushSave(); }catch(_){ } });
        window.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden'){ try{ flushSave(); }catch(_){ } } });
      }
      _booted=true;
      lucide.createIcons();
      // The bridge can come up after the panel does — keep retrying the load a few
      // times instead of sitting read-only forever.
      if(!_hydrated && _loadTries<5){ _loadTries++; setTimeout(init, 2000); }
    } finally { _booting=false; }
  }

  return { init, go, toast, closeModal, closeDetail, closeConfirm, confirmModal,
    setCatalogueView,
    openStatModal, saveStat, deleteStat, confirmDeleteStat,
    openNPCModal, saveNPC, deleteNPC, confirmDeleteNPC, setNpcTypeFilter, setNpcRoleFilter,
    openItemModal, saveItem, deleteItem, confirmDeleteItem, setDropFilter,
    openDropTableModal, saveDropTable, deleteDropTable, confirmDeleteDropTable, addDropEntryRow, removeDropEntryRow,
    attachTableToNpcFromModal, linkItemToLoot, unlinkItemFromNpc,
    openCurrencyModal, saveCurrency, deleteCurrency, confirmDeleteCurrency,
    setProgSimLevel, setProgMaxLevel, setPointsPerLevel, setLevelPoints, rebuildProgLevels, resetProgSim,
    selectProgNode, simUpgradeNode, simRefundNode, progNodeDown,
    setProgEditMode, beginWireToSelected, progEdgeClick, progRemoveRequireChip, progTreeDblClick,
    openProgNodeModal, saveProgNode, deleteProgNode, confirmDeleteProgNode, syncSkillTreeUI, progWriteSkillTreeVerse,
    openScalingModal, addScalingRow, saveScaling,
    openWeaponModal, saveWeapon, deleteWeapon, confirmDeleteWeapon, setWeaponFilter,
    openWizardryModal, saveWizardry, deleteWizardry, confirmDeleteWizardry, setWizardryFilter,
    uiGoScreen, uiSelect, uiToggle, uiZoomBy, uiFit, uiScreenField, uiNode, uiProp, uiSlot,
    uiAnchorPreset, uiAdd, uiMoveSel, uiDupSel, uiDelSel, uiNewScreen, uiResetCatalogue,
    uiCopyVerse, uiWriteVerse, uiSetView, uiToggleCollapse, uiCollapseAll, uiViewField,
    _uiScreens:()=>uiScreensList(), _uiVerse:(id)=>uiVerseBundle((state.uiScreens||[]).find(s=>s.id===id)),
    newLevel,setOverlayField,setOverlayOpacity,clearOverlay,onOverlayFile, selectLevel, updateLevelField, resizeLevel, resetLevel, saveLevel, deleteLevel, confirmDeleteLevel,
    pickTool, pickEntity, undoPaint, redoPaint, fitGrid, centerGrid, zoomBy,
    setLevelsSubtab, renderLevelGen, setLevelJourney,
    addJourneyStep, updateJourneyStep, moveJourneyStep, removeJourneyStep, updateJourneyField,
    ensureJourneys, renderJourneys, selectJourney, newJourney, dupJourney, deleteJourney,
    updateJourneyRecord, updateJourneyLoop, toggleJourneyPool, setJourneyEnemyTab,
    addCatalogueJourneyStep, updateCatalogueJourneyStep, moveCatalogueJourneyStep, removeCatalogueJourneyStep,
    toggleJourneyStepAccordion,
    setCatalogueStepEnemyPool, setCatalogueStepEnemyTab, toggleCatalogueStepEnemy, clearCatalogueStepEnemies,
    setCatalogueStepRewardIds, journeyById, activeJourney,
    journeyStampSummary, journeyNpcIds,
    toggleInclude, setLayerVisible,
    spawnEntity, buildLevel, syncFromUEFN, pushEverything,
    selectChunk, chunkRotNext, chunkRotPrev, chunkPickPaint, chunkPickPlace, chunkSetPropAsset, addChunkAsset, updateChunkField,
    setChunkViewMode,
    applyChunkShapePreset, rebuildPortsFromGrid,
    importChunkFromUeFn, newChunk, deleteChunk, renderChunks,
    contentPathLabel, toUeContentPath, renderAssets, selectAsset, updateAssetField, newKitAsset, deleteAsset,
    syncAssetsFromUeFn, toggleAssetCompose, disposeAssetViewer, disposeChunkViewer, disposeProcgenViewer, resetProcgenOrbit, disposeAllThreeViewers,
    mountChunkViewer, refreshChunkThree, buildChunkMesh3D,
    buildLayoutMesh3D, mountProcgenViewer, refreshProcgenThree,
    renderProcgen, pgSelectTemplate, pgUpdateTpl, pgSetLinear,
    pgSetLayoutStyle, pgSetSizeScale, pgSetMapHeight, pgSetPathPadding, pgSetBranchBudget, pgSetStraightness, pgSetFillEmpty,
    pgAddSpine, pgRemoveSpine,
    pgDupTemplate, pgGenerate, pgReroll, pgSetStage, pgSetViewMode, pgToggleDemo, pgBuildUeFn,
    pgSetSeed, pgSetDemoSpeed, pgToggleTroubleshoot, refreshProcgenPreview3d,
    _state:()=>state, _bridge:bridge, _sync:computeSyncStatus,
    _dropCategory:dropCategory, _npcType:npcType, _npcRole:npcRole,
    _scaleAtLevel:scaleAtLevel, _totalPointsAtLevel:totalPointsAtLevel,
    _hydrated:()=>_hydrated, _save:save };
})();
document.addEventListener('DOMContentLoaded', RGD.init);
