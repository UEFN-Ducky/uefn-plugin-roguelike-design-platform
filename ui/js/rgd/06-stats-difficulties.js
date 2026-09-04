  /* ===== stats ===== */
  function renderStats(){ const rows=state.stats.map(s=>`
    <tr class="cat-row border-b border-gray-700/60" onclick="RGD.openStatModal('${s.id}')"><td class="py-2 px-3"><code class="text-xs text-indigo-300">${esc(s.id)}</code></td><td class="py-2 px-3 text-sm">${esc(s.name)}</td><td class="py-2 px-3 text-sm text-gray-300">${s.def}</td>
    <td class="py-2 px-3 text-right" onclick="event.stopPropagation()"><button onclick="event.stopPropagation();RGD.openStatModal('${s.id}')" class="text-gray-400 hover:text-white mr-2"><i data-lucide="pencil" class="w-4 h-4"></i></button><button onclick="event.stopPropagation();RGD.deleteStat('${s.id}')" class="text-gray-400 hover:text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`).join('')
    ||`<tr><td colspan="4" class="py-8 text-center text-gray-500 text-sm">No stats yet.</td></tr>`;
    document.getElementById('tab-stats').innerHTML=`
      <div class="flex items-center justify-between mb-4"><p class="text-sm text-gray-400 max-w-xl">These global stats dynamically generate the input fields in NPC &amp; Item editors — and become readable/writable fields through the plugin's MCP tools.</p>
      <button onclick="RGD.openStatModal()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-2 shrink-0"><i data-lucide="plus" class="w-4 h-4"></i> Add Stat</button></div>
      <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden"><table class="w-full"><thead><tr class="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-700"><th class="text-left py-2 px-3">ID</th><th class="text-left py-2 px-3">Display Name</th><th class="text-left py-2 px-3">Default</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ===== difficulties ===== */
  function renderDifficulties(){
    const diffs=(state.difficulties||[]).slice().sort((a,b)=>(a.index||0)-(b.index||0));
    const menuRows=diffs.map(d=>`
      <tr class="border-b border-gray-700/60">
        <td class="py-2 px-3"><code class="text-xs text-indigo-300">${esc(d.id)}</code></td>
        <td class="py-2 px-3 text-sm font-medium">${esc(d.name)}</td>
        <td class="py-2 px-3 text-sm text-gray-300">${d.enemyCountPercent}%</td>
        <td class="py-2 px-3 text-xs text-gray-400">${esc(d.description||'')}</td>
      </tr>`).join('')||`<tr><td colspan="4" class="py-8 text-center text-gray-500 text-sm">No difficulty tiers defined.</td></tr>`;
    const npcRows=state.npcs.map(n=>{
      const ds=n.difficultyStats||[];
      const cells=diffs.map((d,i)=>{
        const s=ds[d.index!=null?d.index:i]||ds[i]||{};
        return `<td class="py-2 px-2 text-[11px] text-gray-300 whitespace-nowrap">${s.maxHealth||'—'} HP · ×${s.damageMultiplier||'?'} · dodge ${s.dodgeChance??'—'}%</td>`;
      }).join('');
      return `<tr class="border-b border-gray-800/70"><td class="py-2 px-3 text-sm text-white">${esc(n.name)}</td>${cells}</tr>`;
    }).join('')||`<tr><td colspan="4" class="py-8 text-center text-gray-500 text-sm">Create NPCs first.</td></tr>`;
    const head=diffs.map(d=>`<th class="text-left py-2 px-2 text-[11px] text-gray-500">${esc(d.name)}</th>`).join('');
    document.getElementById('tab-difficulties').innerHTML=`
      <div class="mb-4"><p class="text-sm text-gray-400 max-w-3xl">Matches <code class="text-indigo-300">roguelike_game_manager</code> Easy/Normal/Hard menu and each NPC device's <code class="text-indigo-300">EasyStats / NormalStats / HardStats</code> block. Use this table to wire identical values in UEFN Details.</p></div>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden xl:col-span-1">
          <div class="px-4 py-3 border-b border-gray-700 text-sm font-semibold text-white">Menu tiers</div>
          <table class="w-full"><thead><tr class="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-700"><th class="text-left py-2 px-3">ID</th><th class="text-left py-2 px-3">Name</th><th class="text-left py-2 px-3">Wave %</th><th class="text-left py-2 px-3">Notes</th></tr></thead><tbody>${menuRows}</tbody></table>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto xl:col-span-2">
          <div class="px-4 py-3 border-b border-gray-700 text-sm font-semibold text-white">Per-enemy difficulty stats</div>
          <table class="w-full min-w-[640px]"><thead><tr class="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-700"><th class="text-left py-2 px-3">Enemy</th>${head}</tr></thead><tbody>${npcRows}</tbody></table>
        </div>
      </div>`;
  }

