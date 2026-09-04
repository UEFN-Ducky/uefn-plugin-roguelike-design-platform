  /* ===== Levels — Level Gen (journey-driven) + Chunks subtab host ===== */
  function activeLevel(){
    const l=state.levels.find(l=>l.id===state.meta.activeLevelId)||null;
    return l?normalizeLevelLocal(l):null;
  }

  // Overlay cache (reference image under generate preview)
  let _overlayCache={ id:null, file:'', dataUrl:'' };
  const _overlayDiskCache={};

  function levelsSubtabChrome(){
    const sub=state.meta.levelsSubtab||'gen';
    return `<div class="flex items-center gap-1 mb-4 border-b border-gray-800 pb-2">
      <button onclick="RGD.setLevelsSubtab('gen')" class="px-3 py-1.5 rounded-lg text-sm ${sub==='gen'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">Level Gen</button>
      <button onclick="RGD.setLevelsSubtab('chunks')" class="px-3 py-1.5 rounded-lg text-sm ${sub==='chunks'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">Chunks</button>
      <button onclick="RGD.go('assets')" class="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-amber-300 hover:bg-gray-700 border border-amber-700/40">Assets →</button>
      <button onclick="RGD.setLevelsSubtab('journeys')" class="px-3 py-1.5 rounded-lg text-sm ${sub==='journeys'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">Journeys</button>
    </div>`;
  }

  function renderLevels(){
    (state.levels||[]).forEach(normalizeLevelLocal);
    if(typeof ensureJourneys==='function') ensureJourneys();
    const host=document.getElementById('tab-levels');
    if(!host) return;
    if(typeof disposeAllThreeViewers==='function') disposeAllThreeViewers();
    else if(typeof disposeAssetViewer==='function') disposeAssetViewer();
    const sub=state.meta.levelsSubtab||'gen';
    if(sub==='chunks'){
      host.innerHTML=levelsSubtabChrome()+`<div id="levelsSubHost"></div>`;
      renderChunks();
      return;
    }
    if(sub==='journeys'){
      host.innerHTML=levelsSubtabChrome()+`<div id="levelsSubHost"></div>`;
      renderJourneys();
      return;
    }
    renderLevelGen();
  }

  function renderLevelGen(){
    const lvl=activeLevel();
    const opts=state.levels.map(l=>`<option value="${l.id}" ${l.id===state.meta.activeLevelId?'selected':''}>${esc(l.name)}</option>`).join('');
    const host=document.getElementById('tab-levels');
    const prevScroll=document.getElementById('rgdLevelGenScroll');
    const keepY=prevScroll?prevScroll.scrollTop:0;
    const tpl=typeof activeTemplate==='function'?activeTemplate():null;
    const tOpts=(state.genTemplates||[]).map(t=>`<option value="${t.id}" ${tpl&&t.id===tpl.id?'selected':''}>${esc(t.name||t.id)}</option>`).join('');
    const res=_pg&&_pg.lastResult;
    const stats=res&&res.stats||(lvl&&lvl.gen&&lvl.gen.stats)||{};
    const layers=lvl?lvl.layers:defaultLayers();
    const jSel=lvl&&lvl.journeyId&&typeof journeyById==='function'?journeyById(lvl.journeyId):null;
    const steps=(jSel&&jSel.steps)||[];
    const stampRefs=typeof journeyStampSummary==='function'?journeyStampSummary(jSel):{npcs:[],items:[],tables:[]};

    if(!lvl){
      host.innerHTML=levelsSubtabChrome()+`
        <div class="flex items-center gap-2 mb-4">
          <select onchange="RGD.selectLevel(this.value)" class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"><option value="">— select a level —</option>${opts}</select>
          <button onclick="RGD.newLevel()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-1.5"><i data-lucide="plus" class="w-4 h-4"></i> New Level</button>
        </div>
        <div class="py-16 text-center text-gray-500 text-sm">No level selected. Create one, pick a Journey, then Generate.</div>`;
      return;
    }

    const layerKey=Object.keys(layers).map(k=>`
      <label class="flex items-center gap-1.5 text-[11px] text-gray-300">
        <input type="checkbox" ${layers[k]?'checked':''} onchange="RGD.setLayerVisible('${k}',this.checked)"> ${k}
      </label>`).join('');

    const canBuild=!!(lvl.layout&&lvl.layout.length);

    // Tear down GL before wiping DOM (keeps orbit state via remount keep in mountProcgenViewer)
    if(typeof disposeProcgenViewer==='function') disposeProcgenViewer();

    host.innerHTML=`
      ${levelsSubtabChrome()}
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <select onchange="RGD.selectLevel(this.value)" class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">${opts}</select>
        <button onclick="RGD.newLevel()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm" title="New"><i data-lucide="plus" class="w-4 h-4"></i></button>
        <button onclick="RGD.saveLevel()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-1.5"><i data-lucide="save" class="w-4 h-4"></i> Save</button>
        <button onclick="RGD.deleteLevel('${lvl.id}')" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-red-600 text-sm"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        <select onchange="RGD.pgSelectTemplate(this.value)" class="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm min-w-[140px]">${tOpts}</select>
        <label class="text-xs text-gray-400 flex items-center gap-1">Seed
          <input id="pgSeed" type="number" value="${(_pg&&_pg.seed!=null)?_pg.seed:((lvl.gen&&lvl.gen.seed)||1337)}" class="w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" onchange="RGD.pgSetSeed(+this.value)"/>
        </label>
        <button onclick="RGD.pgGenerate()" class="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium flex items-center gap-1.5"><i data-lucide="dices" class="w-4 h-4"></i> Generate</button>
        <button onclick="RGD.pgReroll()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-1.5"><i data-lucide="refresh-cw" class="w-4 h-4"></i> Reroll</button>
        <button onclick="RGD.pgToggleDemo()" class="px-3 py-2 rounded-lg ${_pg&&_pg.demoPlaying?'bg-amber-600':'bg-gray-700'} text-sm flex items-center gap-1.5"><i data-lucide="${_pg&&_pg.demoPlaying?'pause':'play'}" class="w-4 h-4"></i> Demo</button>
        <div class="flex-1"></div>
        <button onclick="RGD.pgBuildUeFn()" ${canBuild?'':'disabled'} class="px-3 py-2 rounded-lg ${canBuild?'bg-emerald-600 hover:bg-emerald-500':'bg-gray-700 opacity-50'} text-white text-sm font-medium flex items-center gap-1.5"><i data-lucide="hammer" class="w-4 h-4"></i> Build in UEFN</button>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div id="rgdLevelGenScroll" class="xl:col-span-1 space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
            <div class="text-sm font-semibold text-white">Level</div>
            <label class="text-[11px] text-gray-400 block">Name
              <input value="${esc(lvl.name)}" onchange="RGD.updateLevelField('name',this.value)" class="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm"/>
            </label>
            <div class="flex gap-2">
              <div class="flex-1"><label class="text-[11px] text-gray-400">Theme</label><input type="color" value="${lvl.theme||'#6366f1'}" onchange="RGD.updateLevelField('theme',this.value)" class="w-full h-8 mt-1 bg-gray-900 border border-gray-700 rounded-lg"></div>
              <div class="flex-1"><label class="text-[11px] text-gray-400">Threat</label><select onchange="RGD.updateLevelField('threat',this.value)" class="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm">${['Low','Medium','High','Boss'].map(t=>`<option ${lvl.threat===t?'selected':''}>${t}</option>`).join('')}</select></div>
            </div>
            <div class="flex gap-2">
              <div class="flex-1"><label class="text-[11px] text-gray-400">Difficulty (Verse Level)</label><select onchange="RGD.updateLevelField('difficultyIndex',+this.value)" class="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm">${[['0','Easy'],['1','Normal'],['2','Hard']].map(([v,l])=>`<option value="${v}" ${String(lvl.difficultyIndex??1)===v?'selected':''}>${l}</option>`).join('')}</select></div>
              <div class="flex-1"><label class="text-[11px] text-gray-400">Enemy count %</label><input type="number" min="1" max="500" value="${lvl.enemyCountPercent??100}" onchange="RGD.updateLevelField('enemyCountPercent',+this.value||100)" class="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm"/></div>
            </div>
            <div class="text-[11px] text-gray-500">Difficulty → <code class="text-gray-400">roguelike_level_device</code> Easy/Normal/Hard NPC stats. Menu pick can override at runtime.</div>
          </div>

          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-semibold text-white">Journey</div>
              <button onclick="RGD.setLevelsSubtab('journeys')" class="px-2 py-1 rounded-lg bg-violet-700 hover:bg-violet-600 text-[11px] text-white">Create / edit Journeys →</button>
            </div>
            <label class="text-[11px] text-gray-400 block">Select journey for this level
              <select onchange="RGD.setLevelJourney(this.value)" class="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-sm">
                <option value="">— none (template spine) —</option>
                ${(state.journeys||[]).map(j=>`<option value="${esc(j.id)}" ${lvl.journeyId===j.id?'selected':''}>${esc(j.name)} (${(j.steps||[]).length} steps)</option>`).join('')}
              </select>
            </label>
            <div class="text-[11px] text-gray-500">Enemies are picked on each Journey <b class="text-gray-300">step</b>. Loot = drop tables on those NPCs.</div>
            ${jSel?`<div class="rounded-lg bg-gray-900/70 border border-gray-700 p-2 text-[11px] text-gray-300 space-y-1">
              <div class="font-medium text-white">${esc(jSel.name)}</div>
              <div class="text-gray-500">${(jSel.steps||[]).map(s=>s.type).join(' → ')||'no steps'}</div>
              <div class="text-gray-500">${stampRefs.npcs.length} NPC(s) from steps · ${stampRefs.items.length} loot item(s)</div>
              ${stampRefs.npcs.length?`<div class="text-gray-400 truncate" title="${esc(stampRefs.npcs.map(n=>n.name).join(', '))}">${esc(stampRefs.npcs.map(n=>n.name).join(', '))}</div>`:'<div class="text-amber-500/90">No step enemies yet — open Journeys and check NPCs on wave/boss steps.</div>'}
            </div>`:`<div class="text-xs text-amber-500/90 py-1">No journey selected — Generate uses template spine only (no NPC/item stamps).</div>`}
          </div>

          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
            <div class="text-sm font-semibold text-white">Generation</div>
            <label class="text-xs text-gray-400 block">Template
              <input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" value="${esc(tpl&&tpl.name||'')}" onchange="RGD.pgUpdateTpl('name',this.value)"/>
            </label>
            <label class="text-xs text-gray-400 block">Space
              <select class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" onchange="RGD.pgUpdateTpl('space',this.value)">
                <option value="inside" ${tpl&&tpl.space==='inside'?'selected':''}>inside</option>
                <option value="outside" ${tpl&&tpl.space==='outside'?'selected':''}>outside</option>
              </select>
            </label>

            <div>
              <div class="text-xs text-gray-400 mb-1">Layout style</div>
              <div class="grid grid-cols-3 gap-1">
                ${[['linear','Linear','One path, tight'],['branched','Branched','Main path + sides'],['open','Open','Sprawl, air gaps']].map(([id,lab,hint])=>{
                  const cur=(_pg&&_pg.layoutStyle)||(tpl&&tpl.openSocketScope==='all'&&(tpl.branchBudget||0)>=6?'open':(tpl&&tpl.openSocketScope==='all'?'branched':'linear'));
                  return `<button type="button" data-pg-style="${id}" onclick="RGD.pgSetLayoutStyle('${id}')" title="${hint}"
                    class="px-2 py-2 rounded-lg text-[11px] border ${cur===id?'bg-violet-600 border-violet-500 text-white':'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'}">${lab}</button>`;
                }).join('')}
              </div>
            </div>

            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Map size</span>
                <span id="pgSizeLabel" class="text-gray-500">${['','S','M','L','XL','Huge'][(tpl&&tpl.sizeScale)||2]||'M'}</span>
              </div>
              <input type="range" min="1" max="5" value="${(tpl&&tpl.sizeScale)||2}" class="w-full"
                oninput="RGD.pgSetSizeScale(+this.value,true)" onchange="RGD.pgSetSizeScale(+this.value,false)"/>
              <div class="flex justify-between text-[10px] text-gray-600"><span>Small</span><span>Huge</span></div>
            </div>

            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Map height</span>
                <span id="pgHeightLabel" class="text-gray-500">${(tpl&&tpl.mapHeight)||1} stor${((tpl&&tpl.mapHeight)||1)===1?'y':'ies'}</span>
              </div>
              <input type="range" min="1" max="8" value="${(tpl&&tpl.mapHeight)||1}" class="w-full"
                oninput="RGD.pgSetMapHeight(+this.value,true)" onchange="RGD.pgSetMapHeight(+this.value,false)"/>
              <div class="flex justify-between text-[10px] text-gray-600"><span>Flat (1)</span><span>Tall (8)</span></div>
              <div class="text-[10px] text-gray-600 mt-0.5">Caps chunk height. 1 = no stairs/balconies. 2+ allows tall rooms, stairs, ledges.</div>
            </div>

            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Path stretch</span>
                <span id="pgPadLabel" class="text-gray-500">${(tpl&&tpl.pathPadding)!=null?tpl.pathPadding:((tpl&&tpl.sizeScale)||2)-1} pads</span>
              </div>
              <input type="range" min="0" max="8" value="${(tpl&&tpl.pathPadding)!=null?tpl.pathPadding:Math.max(0,((tpl&&tpl.sizeScale)||2)-1)}" class="w-full"
                oninput="RGD.pgSetPathPadding(+this.value,true)" onchange="RGD.pgSetPathPadding(+this.value,false)"/>
              <div class="text-[10px] text-gray-600">Extra halls/rooms between Journey steps (longer run).</div>
            </div>

            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Side branches</span>
                <span id="pgBranchLabel" class="text-gray-500">${(tpl&&tpl.branchBudget)||0}</span>
              </div>
              <input type="range" min="0" max="16" value="${(tpl&&tpl.branchBudget)||0}" class="w-full"
                oninput="RGD.pgSetBranchBudget(+this.value,true)" onchange="RGD.pgSetBranchBudget(+this.value,false)"/>
              <div class="text-[10px] text-gray-600">Dead-ends &amp; side rooms off the main path.</div>
            </div>

            <div>
              <div class="flex justify-between text-xs text-gray-400 mb-1">
                <span>Straightness</span>
                <span id="pgStraightLabel" class="text-gray-500">${(tpl&&tpl.straightness)!=null?tpl.straightness:50}%</span>
              </div>
              <input type="range" min="0" max="100" value="${(tpl&&tpl.straightness)!=null?tpl.straightness:50}" class="w-full"
                oninput="RGD.pgSetStraightness(+this.value,true)" onchange="RGD.pgSetStraightness(+this.value,false)"/>
              <div class="flex justify-between text-[10px] text-gray-600"><span>Windy</span><span>Straight</span></div>
            </div>

            <label class="flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" ${(tpl&&(tpl.fillEmpty!==false))?'checked':''} onchange="RGD.pgSetFillEmpty(this.checked)">
              Surround map with walls
            </label>
            <div class="text-[10px] text-gray-600">Fills the bounding box + 1-cell rim with filler walls. Off = air gaps (Open style).</div>

            <label class="text-xs text-gray-400 block">Tags filter
              <input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm" value="${esc(((tpl&&tpl.tags)||[]).join(', '))}" onchange="RGD.pgUpdateTpl('tags',this.value.split(',').map(s=>s.trim()).filter(Boolean))"/>
            </label>
          </div>

          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-gray-500">Reference overlay</div>
            <label class="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" ${((lvl.overlay||{}).enabled)?'checked':''} onchange="RGD.setOverlayField('enabled',this.checked)"> Show overlay</label>
            <label class="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" ${((lvl.overlay||{}).stretch!==false)?'checked':''} onchange="RGD.setOverlayField('stretch',this.checked)"> Stretch to grid</label>
            <div><label class="text-[11px] text-gray-400">Opacity <span id="ovOpacityLabel">${Math.round((((lvl.overlay||{}).opacity)||0.55)*100)}%</span></label>
              <input id="ovOpacity" type="range" min="5" max="100" value="${Math.round((((lvl.overlay||{}).opacity)||0.55)*100)}" oninput="RGD.setOverlayOpacity(this.value)" class="w-full mt-1"></div>
            <input id="ovFile" type="file" accept="image/*" class="hidden" onchange="RGD.onOverlayFile(this)">
            <div class="flex gap-2">
              <button onclick="document.getElementById('ovFile').click()" class="flex-1 px-2 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs">Load Image</button>
              <button onclick="RGD.clearOverlay()" class="flex-1 px-2 py-1.5 rounded-lg bg-gray-700 hover:bg-red-600 text-xs">Clear</button>
            </div>
          </div>

          <div class="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div class="text-sm font-semibold text-white mb-2">Stats</div>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div><div class="text-gray-500">Chunks</div><div class="text-xl text-white font-bold">${stats.chunksPlaced||'—'}</div></div>
              <div><div class="text-gray-500">Path len</div><div class="text-xl text-white font-bold">${stats.mainPathLen||'—'}</div></div>
              <div><div class="text-gray-500">Seed</div><div class="text-xl text-white font-bold">${stats.seed||'—'}</div></div>
              <div><div class="text-gray-500">Steps</div><div class="text-xl text-white font-bold">${steps.length}</div></div>
            </div>
            ${(lvl.gen&&lvl.gen.spineUsed)?`<div class="text-[10px] text-gray-500 mt-2 font-mono break-all">${esc((lvl.gen.spineUsed||[]).join(' → '))}</div>`:''}
          </div>
        </div>

        <div class="xl:col-span-2 space-y-3">
          <div class="bg-gray-800 border border-gray-700 rounded-xl p-3 relative">
            <div class="flex flex-wrap gap-3 mb-2 px-1">${layerKey}</div>
            <div class="flex flex-wrap items-center gap-2 mb-2 px-1">
              <button onclick="RGD.pgSetViewMode('2d')" class="px-3 py-1.5 rounded-lg text-xs ${(_pg&&_pg.viewMode)!=='3d'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">2D map</button>
              <button onclick="RGD.pgSetViewMode('3d')" class="px-3 py-1.5 rounded-lg text-xs ${(_pg&&_pg.viewMode)==='3d'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">3D orbit</button>
              <span class="text-[10px] text-gray-500">${(_pg&&_pg.viewMode)==='3d'?'Drag rotate · right-drag / Shift pan · scroll zoom · double-click reframes':'Top-down preview'}</span>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-1 mb-2 px-1 text-[10px] text-gray-400">
              ${[
                ['E','Entrance','#22c55e'],['X','Exit','#ef4444'],['O','Objective','#f59e0b'],
                ['B','Boss','#e11d48'],['R','Room','#6366f1'],['C','Hall / connector','#94a3b8'],
                ['D','Dead-end','#78716c'],['#','Filler wall','#64748b'],
              ].map(([sym,lab,col])=>`<span class="inline-flex items-center gap-1"><span class="w-3.5 h-3.5 rounded text-[9px] font-bold text-center leading-3.5 text-white" style="background:${col}">${sym}</span>${lab}</span>`).join('')}
              <span class="text-sky-400">— blue line = main path (entrance→exit)</span>
            </div>
            <div id="pgView2dWrap" class="${(_pg&&_pg.viewMode)==='3d'?'hidden':''}">
              <canvas id="pgCanvas" width="720" height="480" class="w-full rounded-lg bg-[#0b0f19]" style="min-height:380px"></canvas>
            </div>
            <div id="pgView3dWrap" class="${(_pg&&_pg.viewMode)==='3d'?'':'hidden'}">
              <div id="rgdProcgenView3d" class="w-full rounded-lg border border-gray-700 overflow-hidden bg-[#0b1220]" style="height:480px;min-height:380px;cursor:grab"></div>
            </div>
            <div class="flex items-center gap-2 mt-2 text-xs text-gray-400">
              <span>Stage</span>
              <input type="range" id="pgStage" min="0" max="${Math.max(0,((res&&res.trace)||[]).length-1)}" value="${(_pg&&_pg.stageIdx)||0}" class="flex-1" oninput="RGD.pgSetStage(+this.value)"/>
              <span>${esc(((res&&res.trace)||[])[(_pg&&_pg.stageIdx)||0]&&((res&&res.trace)||[])[(_pg&&_pg.stageIdx)||0].stage||'preview')}</span>
            </div>
            <div class="text-[11px] text-gray-500 mt-1">${(_pg&&_pg.viewMode)==='3d'?'Full layout 3D — every chunk, props, path, entities.':'Preview only — no paint. Layers toggle draw; Save stores generation result.'}</div>
          </div>
        </div>
      </div>`;

    // Hydrate _pg.lastResult from level.layout when missing
    if(lvl.layout&&lvl.layout.length&&(!_pg.lastResult||!_pg.lastResult.ok||_pg.lastResult.levelId!==lvl.id)){
      _pg.lastResult={
        ok:true, levelId:lvl.id, layout:lvl.layout, grid:lvl.grid, w:lvl.w, h:lvl.h,
        mainPath:(lvl.gen&&lvl.gen.mainPath)||[], stats:lvl.gen&&lvl.gen.stats||{},
        trace:[{stage:'final',placements:lvl.layout}], seed:lvl.gen&&lvl.gen.seed,
      };
    }
    if((_pg&&_pg.viewMode)==='3d'){
      requestAnimationFrame(()=>{
        if(typeof refreshProcgenPreview3d==='function') refreshProcgenPreview3d();
        else if(typeof drawProcgenCanvas==='function') drawProcgenCanvas();
      });
    } else if(typeof drawProcgenCanvas==='function'){
      drawProcgenCanvas();
    }
    // Keep left-panel scroll so Generation knobs don't jump to top on every click/drag.
    const sc=document.getElementById('rgdLevelGenScroll');
    if(sc&&keepY) sc.scrollTop=keepY;
    // overlay under canvas if enabled (2D only)
    if((_pg&&_pg.viewMode)!=='3d' && lvl.overlay&&lvl.overlay.enabled&&lvl.overlay.file){
      ensureOverlayData(lvl).then(url=>{
        const canvas=document.getElementById('pgCanvas');
        if(canvas&&url) canvas.dataset.overlayUrl=url;
        if(typeof drawProcgenCanvas==='function') drawProcgenCanvas();
      });
    }
  }

  async function ensureOverlayData(lvl){
    const ov=lvl.overlay||{};
    if(!ov.enabled||!(ov.file||ov._dataUrl)){ return ''; }
    const diskKey=lvl.id+'::'+(ov.file||'');
    if(ov._dataUrl){
      _overlayCache={id:lvl.id,file:ov.file||'',dataUrl:ov._dataUrl};
      if(ov.file) _overlayDiskCache[diskKey]=ov._dataUrl;
      return ov._dataUrl;
    }
    if(_overlayCache.id===lvl.id && _overlayCache.file===ov.file && _overlayCache.dataUrl) return _overlayCache.dataUrl;
    if(ov.file && _overlayDiskCache[diskKey]){
      _overlayCache={id:lvl.id,file:ov.file,dataUrl:_overlayDiskCache[diskKey]};
      return _overlayDiskCache[diskKey];
    }
    let dataUrl='';
    try{
      if(typeof rgdRpc==='function'){
        const r=await rgdRpc('get_overlay_image',{level_id:lvl.id, max_edge:1600},45000);
        if(r&&r.ok&&r.dataUrl) dataUrl=r.dataUrl;
        else if(r&&r.dataUrl) dataUrl=r.dataUrl;
      }
    }catch(e){ console.warn('[RGD] get_overlay_image failed', e); }
    if(!dataUrl && ov.file) dataUrl='../assets/overlays/'+ov.file;
    if(dataUrl && ov.file) _overlayDiskCache[diskKey]=dataUrl;
    _overlayCache={id:lvl.id,file:ov.file||'',dataUrl};
    return dataUrl;
  }

  /* Journey select / layers (include is derived at generate — not authored here) */
  function setLevelJourney(journeyId){
    const l=activeLevel(); if(!l) return;
    l.journeyId=journeyId||'';
    l.journey=defaultJourney();
    save(); renderLevelGen();
  }
  // Legacy stubs (inline journey authoring moved to Journeys tab)
  function updateJourneyField(){ toast('Edit journeys on the Journeys tab','info'); }
  function addJourneyStep(){ setLevelsSubtab('journeys'); toast('Create steps on the Journeys tab','info'); }
  function updateJourneyStep(){}
  function moveJourneyStep(){}
  function removeJourneyStep(){}
  function toggleInclude(){ toast('NPCs → Journeys · items → NPC drop tables','info'); }
  function setLayerVisible(k,on){
    const l=activeLevel(); if(!l) return;
    l.layers=l.layers||defaultLayers();
    l.layers[k]=!!on; save();
    if(typeof drawProcgenCanvas==='function') drawProcgenCanvas();
  }

  // Stubs kept so old exports don't explode
  function fitGrid(){}
  function centerGrid(){}
  function zoomBy(){}
  function undoPaint(){ toast('Paint removed — use Generate','info'); }
  function redoPaint(){ toast('Paint removed — use Generate','info'); }
  function pickTool(){}
  function pickEntity(){}
  function resizeLevel(){ toast('Grid size comes from generation','info'); }
  function resetLevel(){
    const l=activeLevel(); if(!l) return;
    l.grid={_sparse:true,cells:{}}; l.layout=[]; l.gen=null;
    if(_pg) _pg.lastResult=null;
    save({flush:true}); renderLevelGen(); toast('Generation cleared','warn');
  }
