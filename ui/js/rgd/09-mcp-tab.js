  /* ===== MCP / Live Sync ===== */
  function renderMCP(){ const planned=intended();
    const sceneList=state.scene.actors.slice(0,60).map(a=>`<div class="flex items-center justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-300 truncate max-w-[220px]">${esc(a.label)}</span><span class="text-gray-500 truncate max-w-[160px]">${esc(a.folder)}</span></div>`).join('')||`<div class="text-[11px] text-gray-600 py-2">Scene empty.</div>`;
    const stateSummary=`<div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">Levels</span><span class="text-gray-200">${state.levels.length}</span></div><div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">NPCs</span><span class="text-gray-200">${state.npcs.length}</span></div><div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">Items</span><span class="text-gray-200">${state.items.length}</span></div><div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">Player Weapons</span><span class="text-gray-200">${(state.weapons||[]).length}</span></div><div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">Stats</span><span class="text-gray-200">${state.stats.length}</span></div><div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">Assets</span><span class="text-gray-200">${(state.chunkAssets||[]).length}</span></div><div class="flex justify-between text-[11px] py-1 border-b border-gray-800/70"><span class="text-gray-400">Tracked scene actors</span><span class="text-gray-200">${planned.length}</span></div>`;
    const logRows=state.log.slice(0,40).map(l=>`<div class="flex items-start gap-2 text-[11px] py-1 border-b border-gray-800/60"><span class="chip-dot mt-1 ${l.ok?'bg-emerald-500':'bg-red-500'}"></span><span class="font-mono text-indigo-300 shrink-0">rgd_${esc(l.tool)}</span><span class="text-gray-500 truncate">${esc(l.args||'')}</span><span class="ml-auto text-gray-600 shrink-0">${new Date(l.t).toLocaleTimeString()}</span></div>`).join('')||`<div class="text-[11px] text-gray-600 py-2">No MCP calls yet.</div>`;
    document.getElementById('tab-mcp').innerHTML=`
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs"><span class="chip-dot ${state.scene.listener==='online'?'bg-emerald-500':'bg-red-500'}"></span>Listener ${state.scene.listener}</div>
        <div class="text-[11px] text-gray-500">Design store autosaves · Build/spawn tools place into UEFN when you ask</div>
        <div class="flex-1"></div>
        <button onclick="RGD.syncFromUEFN()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-1.5"><i data-lucide="download-cloud" class="w-4 h-4"></i> Refresh scene list</button>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-gray-800 border border-gray-700 rounded-xl p-4"><h3 class="text-sm font-semibold text-white mb-3 flex items-center gap-2"><i data-lucide="database" class="w-4 h-4 text-violet-400"></i> Plugin Design State</h3>${stateSummary}</div>
        <div class="bg-gray-800 border border-gray-700 rounded-xl p-4"><h3 class="text-sm font-semibold text-white mb-3 flex items-center gap-2"><i data-lucide="box" class="w-4 h-4 text-sky-400"></i> Live UEFN Scene (${state.scene.actors.length})</h3><div class="max-h-64 overflow-y-auto">${sceneList}</div></div>
      </div>
      <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 mt-4"><h3 class="text-sm font-semibold text-white mb-3 flex items-center gap-2"><i data-lucide="terminal" class="w-4 h-4 text-emerald-400"></i> MCP Tool Call Log</h3><div class="max-h-72 overflow-y-auto font-mono">${logRows}</div></div>`;
    lucide.createIcons();
  }



