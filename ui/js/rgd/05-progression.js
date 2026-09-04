  /* ===== progression (player level + skill node tree) ===== */
  let _progDrag=null; // {id, ox, oy, startX, startY, moved}
  function ensureProgression(){
    if(!state.progression||typeof state.progression!=='object'){
      state.progression={
        maxLevel:30, pointsPerLevel:1,
        levelTable:[], scaling:[
          {statId:'hp',label:'Health',base:100,perLevel:12,curve:'linear'},
          {statId:'attack',label:'Damage',base:20,perLevel:2.5,curve:'linear'},
          {statId:'defense',label:'Defense',base:5,perLevel:0.8,curve:'linear'},
        ],
        tree:{width:900,height:520,nodes:[]}
      };
      rebuildLevelTable();
      return true;
    }
    if(!state.progression.tree) state.progression.tree={width:900,height:520,nodes:[]};
    if(!Array.isArray(state.progression.tree.nodes)) state.progression.tree.nodes=[];
    if(!Array.isArray(state.progression.levelTable)||!state.progression.levelTable.length) rebuildLevelTable();
    if(!Array.isArray(state.progression.scaling)) state.progression.scaling=[];
    if(!state.meta.progSimRanks) state.meta.progSimRanks={};
    if(state.meta.progSimLevel==null) state.meta.progSimLevel=5;
    if(!state.meta.progEditMode) state.meta.progEditMode='move';
    if(state.meta.progConnectFrom===undefined) state.meta.progConnectFrom=null;
    return false;
  }
  function progEditMode(){ ensureProgression(); return state.meta.progEditMode||'move'; }
  function setProgEditMode(mode){
    ensureProgression();
    const m=['move','connect','disconnect'].includes(mode)?mode:'move';
    state.meta.progEditMode=m;
    state.meta.progConnectFrom=null;
    renderProgression();
    if(m==='connect') toast('Connect: click prerequisite, then the node that needs it','info');
    else if(m==='disconnect') toast('Disconnect: click a line, or two linked nodes','info');
  }
  function beginWireToSelected(){
    ensureProgression();
    state.meta.progEditMode='connect';
    state.meta.progConnectFrom=null;
    renderProgression();
    toast('Click a prerequisite, then the selected node','info');
  }
  function rebuildLevelTable(){
    const p=state.progression; const max=Math.max(1,Math.min(200,Number(p.maxLevel)||30));
    const pts=Math.max(0,Number(p.pointsPerLevel)||1);
    const old={}; (p.levelTable||[]).forEach(r=>{ if(r&&r.level) old[r.level]=r; });
    let xp=0; const rows=[];
    for(let lv=1;lv<=max;lv++){
      xp+=Math.floor(80+lv*35+(lv*lv)*2);
      const prev=old[lv]||{};
      rows.push({level:lv, xp:prev.xp!=null?prev.xp:xp, points:prev.points!=null?prev.points:(lv===1?1:pts), notes:prev.notes||''});
    }
    p.maxLevel=max; p.levelTable=rows;
  }
  function totalPointsAtLevel(lv){
    ensureProgression();
    return (state.progression.levelTable||[]).filter(r=>r.level<=lv).reduce((a,r)=>a+(Number(r.points)||0),0);
  }
  function spentSimPoints(){
    ensureProgression();
    const ranks=state.meta.progSimRanks||{};
    let spent=0;
    (state.progression.tree.nodes||[]).forEach(n=>{
      const r=Math.max(0,Math.min(Number(n.maxRank)||1, Number(ranks[n.id])||0));
      spent+=r*(Number(n.cost)||1);
    });
    return spent;
  }
  function availableSimPoints(){
    return Math.max(0, totalPointsAtLevel(Number(state.meta.progSimLevel)||1) - spentSimPoints());
  }
  function nodeRank(id){ return Math.max(0, Number((state.meta.progSimRanks||{})[id])||0); }
  function nodeUnlocked(n){
    const req=n.requires||[];
    if(!req.length) return true;
    return req.every(rid=>nodeRank(rid)>=1);
  }
  function scaleAtLevel(row, lv){
    const base=Number(row.base)||0, per=Number(row.perLevel)||0, L=Math.max(1,lv);
    if((row.curve||'linear')==='quad') return base+per*(L-1)+0.05*per*(L-1)*(L-1);
    return base+per*(L-1);
  }
  function treeNodes(){ ensureProgression(); return state.progression.tree.nodes||[]; }
  function findTreeNode(id){ return treeNodes().find(n=>n.id===id)||null; }
  function wouldCreateCycle(prereqId, nodeId){
    if(prereqId===nodeId) return true;
    const stack=[prereqId]; const seen=new Set();
    while(stack.length){
      const cur=stack.pop();
      if(seen.has(cur)) continue;
      seen.add(cur);
      const n=findTreeNode(cur);
      for(const r of (n&&n.requires||[])){
        if(r===nodeId) return true;
        stack.push(r);
      }
    }
    return false;
  }
  function addProgRequire(prereqId, nodeId){
    const n=findTreeNode(nodeId); if(!n||!findTreeNode(prereqId)) return false;
    if((n.requires||[]).includes(prereqId)){ toast('Already connected','warn'); return false; }
    if(wouldCreateCycle(prereqId, nodeId)){ toast('That connection would create a cycle','warn'); return false; }
    n.requires=[...(n.requires||[]), prereqId];
    syncSkillTreeScreenFromProgression();
    save({flush:true});
    return true;
  }
  function removeProgRequire(prereqId, nodeId){
    const n=findTreeNode(nodeId); if(!n) return false;
    const before=(n.requires||[]).length;
    n.requires=(n.requires||[]).filter(r=>r!==prereqId);
    if(n.requires.length===before) return false;
    syncSkillTreeScreenFromProgression();
    save({flush:true});
    return true;
  }
  function progEdgesSvg(){
    const nodes=treeNodes(); const by={}; nodes.forEach(n=>by[n.id]=n);
    const mode=progEditMode();
    const lines=[];
    nodes.forEach(n=>{
      (n.requires||[]).forEach(rid=>{
        const a=by[rid], b=n; if(!a||!b) return;
        const x1=a.x+36, y1=a.y+36, x2=b.x+36, y2=b.y+36;
        const unlocked=nodeRank(rid)>=1;
        const clickable=mode==='disconnect'?' pointer-events="stroke" cursor="pointer"':'';
        lines.push(`<line class="prog-edge-hit" data-from="${esc(rid)}" data-to="${esc(n.id)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="14"${clickable} onclick="RGD.progEdgeClick(event,'${esc(rid)}','${esc(n.id)}')"/>`);
        lines.push(`<line class="prog-edge" data-from="${esc(rid)}" data-to="${esc(n.id)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${unlocked?'#e9d5ff':'#4c1d95'}" stroke-width="2" stroke-opacity="${unlocked?0.9:0.45}" pointer-events="none"/>`);
      });
    });
    const w=state.progression.tree.width||900, h=state.progression.tree.height||520;
    const pe=mode==='disconnect'?'auto':'none';
    return `<svg class="prog-edges mode-${mode}" style="pointer-events:${pe}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${lines.join('')}</svg>`;
  }
  function progNodeHtml(n){
    const rank=nodeRank(n.id), max=Number(n.maxRank)||1;
    const unlocked=nodeUnlocked(n);
    const maxed=rank>=max;
    const sel=state.meta.progSelectedNode===n.id;
    const from=state.meta.progConnectFrom===n.id;
    const mode=progEditMode();
    const cls=['prog-node', unlocked?'is-unlocked':'is-locked', maxed?'is-maxed':'', sel?'is-selected':'', from?'is-connect-from':'', 'mode-'+mode].filter(Boolean).join(' ');
    return `<div class="${cls}" data-nid="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px"
      onmousedown="RGD.progNodeDown(event,'${n.id}')">
      <div class="prog-node-face" style="color:${n.color||'#a855f7'}">
        <i data-lucide="${esc(n.icon||'sparkles')}" class="w-6 h-6"></i>
        <div class="prog-rank">${rank}/${max}</div>
      </div>
    </div>`;
  }
  function progModeHint(){
    const mode=progEditMode();
    const from=state.meta.progConnectFrom;
    if(mode==='connect'){
      if(from){ const t=findTreeNode(from); return 'Connect: now click the node that requires '+(t?t.name:from); }
      return 'Connect: click prerequisite first, then the dependent node';
    }
    if(mode==='disconnect') return 'Disconnect: click a purple line, or two nodes that are linked';
    return 'Move: drag nodes · click to select · Add node below · Connect to wire requires';
  }
  function renderProgression(){
    ensureProgression();
    const p=state.progression;
    const simLv=Number(state.meta.progSimLevel)||1;
    const avail=availableSimPoints();
    const mode=progEditMode();
    const sel=findTreeNode(state.meta.progSelectedNode)||treeNodes()[0]||null;
    if(sel&&state.meta.progSelectedNode!==sel.id) state.meta.progSelectedNode=sel.id;

    const scaleRows=(p.scaling||[]).map(row=>{
      const now=scaleAtLevel(row, simLv), next=scaleAtLevel(row, simLv+1);
      return `<tr><td class="text-gray-300">${esc(row.label||row.statId)}</td><td class="text-white font-medium">${now.toFixed(1)}</td><td class="text-emerald-300">+${(next-now).toFixed(1)}</td><td class="text-gray-500 text-[11px]">${esc(row.base)} + ${esc(row.perLevel)}/lv</td></tr>`;
    }).join('')||`<tr><td colspan="4" class="text-gray-500 py-4 text-center">No scaling rows — add Damage / Health curves below.</td></tr>`;

    const levelRows=(p.levelTable||[]).slice(0, Math.min(p.levelTable.length, 40)).map(r=>`
      <tr class="${r.level===simLv?'bg-violet-900/40':''}">
        <td class="text-white font-medium">${r.level}</td>
        <td class="text-gray-300">${r.xp}</td>
        <td><input type="number" min="0" step="1" value="${Number(r.points)||0}" class="w-16 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-xs" onchange="RGD.setLevelPoints(${r.level}, this.value)"></td>
        <td class="text-amber-300 text-xs">${totalPointsAtLevel(r.level)} total</td>
      </tr>`).join('');

    const rank=sel?nodeRank(sel.id):0;
    const max=sel?(Number(sel.maxRank)||1):1;
    const cost=sel?(Number(sel.cost)||1):1;
    const canUp=sel&&nodeUnlocked(sel)&&rank<max&&avail>=cost;
        const reqChips=sel&&(sel.requires||[]).length
      ? (sel.requires||[]).map(rid=>{
          const t=findTreeNode(rid);
          const ok=nodeRank(rid)>=1;
          return `<span class="prog-req-chip">${esc(t?t.name:rid)}${ok?' ✓':' ✗'} <button type="button" title="Remove connection" onclick="RGD.progRemoveRequireChip('${esc(sel.id)}','${esc(rid)}')">×</button></span>`;
        }).join('')
      : '<span class="text-violet-300/70 text-xs">None (root) — use Connect to wire prerequisites</span>';

    const modeBtn=(id,label,icon)=>`<button type="button" onclick="RGD.setProgEditMode('${id}')" class="prog-mode-btn ${mode===id?'is-active':''}"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i> ${label}</button>`;

    const detail=sel?`
      <div class="p-4 prog-detail h-full flex flex-col">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-14 h-14 rounded-xl flex items-center justify-center" style="background:${sel.color}22;color:${sel.color};border:2px solid ${sel.color}">
            <i data-lucide="${esc(sel.icon||'sparkles')}" class="w-7 h-7"></i>
          </div>
          <div>
            <div class="text-lg font-bold text-amber-200">${esc(sel.name)}</div>
            <div class="text-[11px] text-violet-300">${esc(sel.id)} · cost ${cost} pt/rank</div>
          </div>
        </div>
        <p class="text-sm text-gray-300 mb-2">${esc(sel.desc||'No description')}</p>
        <p class="text-xs text-emerald-300 mb-3">${esc(sel.effect||'')}</p>
        <div class="text-2xl font-black text-white mb-1">Upgrade ${rank}/${max}</div>
        <div class="bg-black/30 rounded-lg p-2 text-xs mb-2">
          <div class="flex items-center justify-between mb-1">
            <div class="text-gray-500">Requires</div>
            <button type="button" onclick="RGD.beginWireToSelected()" class="text-[10px] text-amber-300 hover:text-amber-200">+ Wire</button>
          </div>
          <div class="flex flex-wrap gap-1">${reqChips}</div>
        </div>
        <div class="bg-black/30 rounded-lg p-2 text-xs mb-3">
          <div class="text-gray-500">Next rank</div>
          <div class="text-amber-200">${rank>=max?'MAX':('+'+(sel.effect||'effect'))}</div>
        </div>
        <div class="flex gap-2 mb-3">
          <button ${canUp?'':'disabled'} onclick="RGD.simUpgradeNode('${sel.id}')" class="flex-1 py-2.5 prog-upgrade-btn">Upgrade</button>
          <button onclick="RGD.simRefundNode('${sel.id}')" class="px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-xs">−1</button>
        </div>
        <button onclick="RGD.openProgNodeModal('${sel.id}')" class="w-full py-2 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-sm mb-2">Edit node</button>
        <button onclick="RGD.deleteProgNode('${sel.id}')" class="w-full py-2 rounded-lg bg-gray-800 hover:bg-red-900/50 text-red-300 text-xs">Delete node</button>
        <p class="text-[10px] text-gray-500 mt-auto pt-3">Toolbar: <b class="text-violet-300">Add node</b>, <b class="text-violet-300">Connect</b> (draw requires), <b class="text-violet-300">Disconnect</b> (click lines). Drag in Move mode to rearrange.</p>
      </div>`:`<div class="p-6 text-gray-500 text-sm">Click <span class="text-violet-300">+ Add node</span> under the tree, or select a node to edit / delete / wire.</div>`;

    const w=p.tree.width||900, h=p.tree.height||520;
    document.getElementById('tab-progression').innerHTML=`
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div class="xl:col-span-8 prog-shell">
          <div class="prog-head">
            <span>SKILL TREE</span>
            <span class="text-sm font-semibold text-white">Available Points: <span class="text-amber-300">${avail}</span> · Sim Level
              <input type="number" min="1" max="${p.maxLevel}" value="${simLv}" class="ml-1 w-14 bg-violet-950 border border-amber-400/40 rounded px-1 text-amber-200 text-sm" onchange="RGD.setProgSimLevel(this.value)">
            </span>
          </div>
          <div class="prog-tree-view mode-${mode}" id="progTreeView">
            <div class="prog-tree-world" id="progTreeWorld" style="width:${w}px;height:${h}px" ondblclick="RGD.progTreeDblClick(event)">
              ${progEdgesSvg()}
              ${treeNodes().map(progNodeHtml).join('')}
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-violet-900/60 bg-black/20">
            <button onclick="RGD.openProgNodeModal()" class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs flex items-center gap-1"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Add node</button>
            <div class="prog-mode-group">
              ${modeBtn('move','Move','mouse-pointer')}
              ${modeBtn('connect','Connect','link')}
              ${modeBtn('disconnect','Disconnect','unplug')}
            </div>
            <button onclick="RGD.syncSkillTreeUI()" class="px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white text-xs">Sync UI screen</button>
            <button onclick="RGD.progWriteSkillTreeVerse()" class="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs">Write skill tree Verse</button>
            <button onclick="RGD.resetProgSim()" class="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs">Reset spent points</button>
            <button onclick="RGD.rebuildProgLevels()" class="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs">Rebuild level table</button>
            <span class="text-[11px] text-violet-300 ml-auto max-w-md text-right">${esc(progModeHint())}</span>
          </div>
        </div>
        <div class="xl:col-span-4 prog-shell min-h-[420px]">${detail}</div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <div class="text-sm font-semibold text-white">Level curve · points per level</div>
            <label class="text-[11px] text-gray-400">Max Lv <input type="number" min="1" max="200" value="${p.maxLevel}" class="w-16 ml-1 bg-gray-900 border border-gray-700 rounded px-1" onchange="RGD.setProgMaxLevel(this.value)"></label>
          </div>
          <div class="max-h-72 overflow-y-auto">
            <table class="cat-table"><thead><tr><th>Lv</th><th>XP</th><th>Points</th><th>Cumulative</th></tr></thead><tbody>${levelRows}</tbody></table>
          </div>
          <div class="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-700">Default points/level: <input type="number" min="0" value="${Number(p.pointsPerLevel)||1}" class="w-14 bg-gray-900 border border-gray-700 rounded px-1" onchange="RGD.setPointsPerLevel(this.value)"> (used when rebuilding)</div>
        </div>
        <div class="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <div class="text-sm font-semibold text-white">Scaling at level ${simLv}</div>
            <button onclick="RGD.openScalingModal()" class="text-xs text-indigo-300 hover:text-white">Edit curves</button>
          </div>
          <table class="cat-table"><thead><tr><th>Stat</th><th>At Lv</th><th>Next</th><th>Formula</th></tr></thead><tbody>${scaleRows}</tbody></table>
          <p class="px-4 py-2 text-[11px] text-gray-500">See damage / health / defense grow as the sim level changes — same store the skill tree reads.</p>
        </div>
      </div>`;
    lucide.createIcons();
  }
  function setProgSimLevel(v){ state.meta.progSimLevel=Math.max(1,Math.min(Number(state.progression.maxLevel)||30, Number(v)||1)); syncSkillTreeScreenFromProgression(); save(); renderProgression(); }
  function setProgMaxLevel(v){ ensureProgression(); state.progression.maxLevel=Math.max(1,Math.min(200,Number(v)||30)); rebuildLevelTable(); save({flush:true}); renderProgression(); }
  function setPointsPerLevel(v){ ensureProgression(); state.progression.pointsPerLevel=Math.max(0,Number(v)||0); syncSkillTreeScreenFromProgression(); save(); }
  function setLevelPoints(level, v){
    ensureProgression();
    const row=(state.progression.levelTable||[]).find(r=>r.level===level);
    if(row){ row.points=Math.max(0,Number(v)||0); save(); renderProgression(); }
  }
  function rebuildProgLevels(){ ensureProgression(); rebuildLevelTable(); save({flush:true}); renderProgression(); toast('Level table rebuilt','ok'); }
  function resetProgSim(){ state.meta.progSimRanks={}; syncSkillTreeScreenFromProgression(); save(); renderProgression(); }
  function selectProgNode(id){ state.meta.progSelectedNode=id; syncSkillTreeScreenFromProgression(); save(); renderProgression(); }
  function simUpgradeNode(id){
    const n=findTreeNode(id); if(!n||!nodeUnlocked(n)) return;
    const rank=nodeRank(id), max=Number(n.maxRank)||1, cost=Number(n.cost)||1;
    if(rank>=max||availableSimPoints()<cost) return toast('Not enough points or maxed','warn');
    state.meta.progSimRanks[id]=rank+1; syncSkillTreeScreenFromProgression(); save(); renderProgression();
  }
  function simRefundNode(id){
    const rank=nodeRank(id); if(rank<=0) return;
    state.meta.progSimRanks[id]=rank-1; syncSkillTreeScreenFromProgression(); save(); renderProgression();
  }
  function progHandleConnectClick(id){
    ensureProgression();
    const from=state.meta.progConnectFrom;
    if(!from){
      state.meta.progConnectFrom=id;
      state.meta.progSelectedNode=id;
      renderProgression();
      toast('Now click the node that requires this one','info');
      return;
    }
    if(from===id){ state.meta.progConnectFrom=null; renderProgression(); return; }
    if(addProgRequire(from, id)){
      state.meta.progConnectFrom=null;
      state.meta.progSelectedNode=id;
      state.meta.progEditMode='move';
      renderProgression();
      toast('Connected','ok');
    }
  }
  function progHandleDisconnectClick(id){
    ensureProgression();
    const from=state.meta.progConnectFrom;
    if(!from){
      state.meta.progConnectFrom=id;
      state.meta.progSelectedNode=id;
      renderProgression();
      toast('Click the other linked node to remove the line','info');
      return;
    }
    if(from===id){ state.meta.progConnectFrom=null; renderProgression(); return; }
    const a=findTreeNode(from), b=findTreeNode(id);
    let removed=false;
    if(b&&(b.requires||[]).includes(from)) removed=removeProgRequire(from, id);
    else if(a&&(a.requires||[]).includes(id)) removed=removeProgRequire(id, from);
    state.meta.progConnectFrom=null;
    if(removed){ state.meta.progEditMode='move'; toast('Connection removed','ok'); }
    else toast('Those nodes are not directly linked','warn');
    renderProgression();
  }
  function progEdgeClick(ev, fromId, toId){
    if(ev){ ev.preventDefault(); ev.stopPropagation(); }
    if(progEditMode()!=='disconnect') return;
    if(removeProgRequire(fromId, toId)){
      state.meta.progConnectFrom=null;
      state.meta.progEditMode='move';
      renderProgression();
      toast('Connection removed','ok');
    }
  }
  function progRemoveRequireChip(nodeId, prereqId){
    if(removeProgRequire(prereqId, nodeId)){ renderProgression(); toast('Connection removed','ok'); }
  }
  function progTreeDblClick(ev){
    if(ev.target&&(ev.target.closest&&ev.target.closest('.prog-node'))) return;
    ensureProgression();
    const world=document.getElementById('progTreeWorld');
    if(!world) return;
    const rect=world.getBoundingClientRect();
    const x=Math.max(0, Math.round(ev.clientX-rect.left-36));
    const y=Math.max(0, Math.round(ev.clientY-rect.top-36));
    state.meta.progPlaceXY={x,y};
    openProgNodeModal();
  }
  function progNodeDown(ev, id){
    ev.preventDefault(); ev.stopPropagation();
    const n=findTreeNode(id); if(!n) return;
    const mode=progEditMode();
    if(mode==='connect'){ progHandleConnectClick(id); return; }
    if(mode==='disconnect'){ progHandleDisconnectClick(id); return; }
    _progDrag={id, ox:n.x, oy:n.y, startX:ev.clientX, startY:ev.clientY, moved:false};
    const move=e=>{
      if(!_progDrag) return;
      const dx=e.clientX-_progDrag.startX, dy=e.clientY-_progDrag.startY;
      if(Math.abs(dx)+Math.abs(dy)>3) _progDrag.moved=true;
      const node=findTreeNode(_progDrag.id); if(!node) return;
      node.x=Math.max(0, _progDrag.ox+dx); node.y=Math.max(0, _progDrag.oy+dy);
      const el=document.querySelector('.prog-node[data-nid="'+_progDrag.id+'"]');
      if(el){ el.style.left=node.x+'px'; el.style.top=node.y+'px'; el.classList.add('is-dragging'); }
      const world=document.getElementById('progTreeWorld');
      if(world){ const svg=world.querySelector('.prog-edges'); if(svg) svg.outerHTML=progEdgesSvg(); }
    };
    const up=()=>{
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if(_progDrag){
        const el=document.querySelector('.prog-node[data-nid="'+_progDrag.id+'"]');
        if(el) el.classList.remove('is-dragging');
        if(_progDrag.moved){ syncSkillTreeScreenFromProgression(); save({flush:true}); toast('Node moved','ok'); }
        else selectProgNode(_progDrag.id);
      }
      _progDrag=null;
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
  function openProgNodeModal(id){
    ensureProgression();
    const place=state.meta.progPlaceXY||null;
    state.meta.progPlaceXY=null;
    const n=findTreeNode(id)||{id:'',name:'',x:place?place.x:120,y:place?place.y:120,maxRank:5,cost:1,requires:[],icon:'sparkles',color:'#a855f7',desc:'',effect:'',statMods:{}};
    if(!id&&place){ n.x=place.x; n.y=place.y; }
    const req=(n.requires||[]).join(', ');
    const others=treeNodes().filter(x=>x.id!==n.id).map(x=>x.id).join(', ');
    modalShell(id?'Edit skill node':'Add skill node',`
      <div class="grid grid-cols-2 gap-3">
        ${field('Node ID',`<input id="mPnId" value="${esc(n.id)}" ${id?'readonly':''} placeholder="shield" class="${IN} ${id?'opacity-60':''}">`)}
        ${field('Name',`<input id="mPnName" value="${esc(n.name)}" placeholder="Shield" class="${IN}">`)}
        ${field('Max rank',`<input id="mPnMax" type="number" min="1" value="${Number(n.maxRank)||1}" class="${IN}">`)}
        ${field('Cost / rank',`<input id="mPnCost" type="number" min="1" value="${Number(n.cost)||1}" class="${IN}">`)}
        ${field('Icon (lucide)',`<input id="mPnIcon" value="${esc(n.icon||'sparkles')}" class="${IN}">`)}
        ${field('Color',`<input id="mPnColor" type="color" value="${n.color||'#a855f7'}" class="w-full h-9 bg-gray-900 border border-gray-700 rounded-lg">`)}
      </div>
      ${field('Requires (optional — or use Connect on the tree)',`<input id="mPnReq" value="${esc(req)}" placeholder="${esc(others||'shield')}" class="${IN} font-mono text-xs">`)}
      ${field('Description',`<textarea id="mPnDesc" rows="2" class="${IN}">${esc(n.desc||'')}</textarea>`)}
      ${field('Effect summary',`<input id="mPnEffect" value="${esc(n.effect||'')}" placeholder="+Defense / rank" class="${IN}">`)}
      <input type="hidden" id="mPnX" value="${Number(n.x)||120}">
      <input type="hidden" id="mPnY" value="${Number(n.y)||120}">
      <p class="text-[11px] text-gray-500">Tip: after saving, use <b>Connect</b> on the tree toolbar to draw prerequisite lines by clicking nodes. Double-click empty tree space to add a node there.</p>
    `,`RGD.saveProgNode('${id||''}')`);
  }
  function saveProgNode(id){
    ensureProgression();
    const name=val('mPnName').trim();
    let nid=id||val('mPnId').trim().toLowerCase().replace(/[^a-z0-9_]/g,'_');
    if(!nid||!name) return toast('ID and name required','warn');
    if(!id&&findTreeNode(nid)) return toast('Node id exists','warn');
    const requires=val('mPnReq').split(',').map(s=>s.trim()).filter(Boolean);
    const xEl=document.getElementById('mPnX'), yEl=document.getElementById('mPnY');
    const rec={
      id:nid, name,
      x:id?(findTreeNode(id).x):(xEl?Number(xEl.value)||120:120+(treeNodes().length%4)*80),
      y:id?(findTreeNode(id).y):(yEl?Number(yEl.value)||120:80+Math.floor(treeNodes().length/4)*90),
      maxRank:Math.max(1,Number(val('mPnMax'))||1),
      cost:Math.max(1,Number(val('mPnCost'))||1),
      requires, icon:val('mPnIcon')||'sparkles', color:val('mPnColor')||'#a855f7',
      desc:val('mPnDesc'), effect:val('mPnEffect'),
      statMods:(id&&findTreeNode(id).statMods)||{}
    };
    if(id){ const i=treeNodes().findIndex(n=>n.id===id); state.progression.tree.nodes[i]=rec; }
    else state.progression.tree.nodes.push(rec);
    state.meta.progSelectedNode=nid;
    syncSkillTreeScreenFromProgression();
    save({flush:true}); closeModal(); renderProgression(); toast('Node saved','ok');
  }
  function deleteProgNode(id){
    confirmModal('Delete Skill Node',
      'Delete skill node <code class="text-indigo-300">'+esc(id)+'</code>?',
      "RGD.confirmDeleteProgNode('"+id+"')");
  }
  function confirmDeleteProgNode(id){
    closeModal();
    ensureProgression();
    state.progression.tree.nodes=treeNodes().filter(n=>n.id!==id);
    treeNodes().forEach(n=>{ n.requires=(n.requires||[]).filter(r=>r!==id); });
    delete state.meta.progSimRanks[id];
    if(state.meta.progSelectedNode===id) state.meta.progSelectedNode=null;
    if(state.meta.progConnectFrom===id) state.meta.progConnectFrom=null;
    syncSkillTreeScreenFromProgression();
    save({flush:true}); renderProgression(); toast('Node deleted','ok');
  }
  function openScalingModal(){
    ensureProgression();
    const rows=(state.progression.scaling||[]).map((r,i)=>`
      <div class="grid grid-cols-4 gap-2 mb-2">
        <input data-si="${i}" data-k="label" value="${esc(r.label||r.statId)}" class="${IN}" placeholder="Damage">
        <input data-si="${i}" data-k="base" type="number" value="${Number(r.base)||0}" class="${IN}" placeholder="base">
        <input data-si="${i}" data-k="perLevel" type="number" step="0.1" value="${Number(r.perLevel)||0}" class="${IN}" placeholder="/level">
        <input data-si="${i}" data-k="statId" value="${esc(r.statId||'')}" class="${IN} font-mono text-xs" placeholder="attack">
      </div>`).join('');
    modalShell('Scaling curves',`
      <p class="text-[11px] text-gray-400 mb-2">Label · Base · Per level · Stat id</p>
      <div id="mScaleRows">${rows||'<div class="text-gray-500 text-sm">No rows</div>'}</div>
      <button onclick="RGD.addScalingRow()" class="mt-2 text-xs text-indigo-300">+ Add row</button>
    `,`RGD.saveScaling()`);
  }
  function addScalingRow(){
    ensureProgression();
    state.progression.scaling.push({statId:'attack',label:'Damage',base:20,perLevel:2,curve:'linear'});
    openScalingModal();
  }
  function saveScaling(){
    ensureProgression();
    const next=[];
    document.querySelectorAll('#mScaleRows [data-si]').forEach(inp=>{
      const i=Number(inp.dataset.si); if(!next[i]) next[i]={curve:'linear'};
      const k=inp.dataset.k;
      next[i][k]=(k==='base'||k==='perLevel')?Number(inp.value)||0:inp.value;
    });
    state.progression.scaling=next.filter(Boolean);
    save({flush:true}); closeModal(); renderProgression(); toast('Scaling saved','ok');
  }


  function syncSkillTreeUI(){
    if(typeof syncSkillTreeScreenFromProgression!=='function'){
      return toast('UI sync not loaded','warn');
    }
    syncSkillTreeScreenFromProgression({rerender:true});
    save({flush:true});
    toast('Skill Tree UI synced from Progression','ok');
  }

  function progVerseFloat(v){
    const x = Math.round((Number(v)||0) * 100) / 100;
    if(Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x))+'.0';
    return String(x);
  }
  function progVerseStr(s){
    return '"'+String(s==null?'':s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'').replace(/\n/g,'\\n')+'"';
  }
  function progBuildSkillTreeCatalogVerse(){
    ensureProgression();
    const tree = state.progression.tree || {};
    const nodes = Array.isArray(tree.nodes) ? tree.nodes : [];
    const w = progVerseFloat(tree.width != null ? tree.width : 900);
    const h = progVerseFloat(tree.height != null ? tree.height : 520);
    const L = [];
    L.push('using { /Verse.org/Simulation }');
    L.push('');
    L.push('# Generated by the Roguelike Design Platform · Progression tab.');
    L.push('# The tab is the source of truth: re-export replaces this file.');
    L.push('# Tree size and node list mirror progression.tree in .ducky/roguelike-design/store.json.');
    L.push('');
    L.push('SkillTreeBoardW <public> : float = '+w);
    L.push('SkillTreeBoardH <public> : float = '+h);
    L.push('');
    L.push('MakeSkillCatalog <public>() : []skill_node_def =');
    if(!nodes.length){
      L.push('    array{}');
      L.push('');
      return L.join('\n');
    }
    L.push('    array:');
    for(const n of nodes){
      const req = Array.isArray(n.requires) ? n.requires : [];
      const reqLit = req.length
        ? 'array{'+req.map(r=>progVerseStr(r)).join(', ')+'}'
        : 'array{}';
      const hex = String(n.color||'#38bdf8').replace(/^#/,'').slice(0,6).toLowerCase() || '38bdf8';
      L.push('        skill_node_def{');
      L.push('            NodeId := '+progVerseStr(n.id||''));
      L.push('            DisplayName := '+progVerseStr(n.name||n.id||''));
      L.push('            MaxRank := '+Math.max(1, Math.floor(Number(n.maxRank)||1)));
      L.push('            Cost := '+Math.max(1, Math.floor(Number(n.cost)||1)));
      L.push('            Requires := '+reqLit);
      L.push('            Effect := '+progVerseStr(n.effect||''));
      L.push('            Desc := '+progVerseStr(n.desc||''));
      L.push('            ColorHex := '+progVerseStr(hex));
      L.push('            X := '+progVerseFloat(n.x));
      L.push('            Y := '+progVerseFloat(n.y));
      L.push('        }');
    }
    L.push('');
    return L.join('\n');
  }
  async function progWriteSkillTreeVerse(){
    ensureProgression();
    const nodes = (state.progression.tree && state.progression.tree.nodes) || [];
    if(!nodes.length) return toast('No skill nodes — add some in Progression first','warn');
    const content = progBuildSkillTreeCatalogVerse();
    const path = 'Content/Verse/GameDevices/Gameplay/Screens/Hub/skill_tree_catalog.verse';
    try{
      const r = await rgdRpc('ui_write_verse', { files:[{ path, content }] }, 20000);
      if(r && r.ok){
        const skipped = (r.skipped||[]).length;
        toast('Wrote skill_tree_catalog.verse ('+nodes.length+' nodes)'+(skipped?' · skipped '+skipped:'')+' — Build Verse in UEFN','ok');
      } else {
        toast('Write failed: '+((r&&r.error)||'no response'),'err');
      }
    }catch(e){
      toast('Write failed: '+String(e&&e.message||e),'err');
    }
  }
