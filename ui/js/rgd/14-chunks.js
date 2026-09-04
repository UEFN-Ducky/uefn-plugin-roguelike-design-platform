  /* ===== Chunks tab — catalogue + 2D socket/roof/slot viewer ===== */
  let _chunkSel = null;
  let _chunkRotPreview = 0;
  let _chunkPaint = null; // terrain brush for footprint override (incl. empty notches)
  let _chunkPlace = null; // 'slotA' | 'slotB' | 'prop' | null
  let _chunkPropId = null; // selected chunkAssets id when placing props
  let _chunkViewMode = '2d'; // '2d' | '3d' — tab toggle, not side-by-side

  function chunksList(){ return state.chunks || (state.chunks=[]); }
  function chunkSolidCount(c){
    const g=c&&c.grid||[];
    let n=0;
    for(let y=0;y<g.length;y++) for(let x=0;x<(g[y]||[]).length;x++){
      const t=g[y][x]; if(t&&t!=='empty') n++;
    }
    return n||((c.cw||0)*(c.ch||0));
  }
  function selectedChunk(){
    const list=chunksList();
    if(!_chunkSel || !list.find(c=>c.id===_chunkSel)) _chunkSel = list[0]&&list[0].id;
    return list.find(c=>c.id===_chunkSel)||null;
  }

  const ROLE_COLORS = {
    entrance:'#22c55e', exit:'#ef4444', objective:'#f59e0b', room:'#6366f1',
    connector:'#94a3b8', deadend:'#78716c', cap:'#a8a29e', filler:'#44403c', boss:'#e11d48',
  };

  function sockSummary(c){
    const s=c.sockets||{};
    return ['N','E','S','W'].map(d=>{
      const arr=s[d]||[];
      return d+':'+arr.map(e=>{
        const k=((e.kind||'wall')[0]||'?').toUpperCase();
        const z=+(e.height_step!=null?e.height_step:e.z)||0;
        return z?k+'@'+z:k;
      }).join('');
    }).join(' ');
  }

  function rotateGridJs(grid, rot){
    rot=((rot%360)+360)%360;
    if(!grid||!grid.length||rot===0) return grid.map(r=>r.slice());
    const h=grid.length, w=grid[0].length;
    if(rot===90){
      const out=[]; for(let y=0;y<w;y++){ const row=[]; for(let x=0;x<h;x++) row.push(grid[h-1-x][y]); out.push(row);} return out;
    }
    if(rot===180) return grid.slice().reverse().map(r=>r.slice().reverse());
    if(rot===270){
      const out=[]; for(let y=0;y<w;y++){ const row=[]; for(let x=0;x<h;x++) row.push(grid[x][w-1-y]); out.push(row);} return out;
    }
    return grid.map(r=>r.slice());
  }

  function chunksHostEl(){
    return document.getElementById('levelsSubHost') || document.getElementById('tab-chunks');
  }
  function renderChunks(){
    if(typeof disposeChunkViewer==='function') disposeChunkViewer();
    const list=chunksList();
    const c=selectedChunk();
    const host=chunksHostEl();
    if(!host) return;
    const items=list.map(ch=>`
      <button onclick="RGD.selectChunk('${ch.id}')" class="w-full text-left px-3 py-2 rounded-lg border mb-1.5 ${ch.id===_chunkSel?'border-indigo-500 bg-indigo-600/20':'border-gray-700 bg-gray-800 hover:bg-gray-750'}">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-white font-medium truncate">${esc(ch.name||ch.id)}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded" style="background:${ROLE_COLORS[ch.role]||'#555'}33;color:${ROLE_COLORS[ch.role]||'#aaa'}">${esc(ch.role||'?')}</span>
        </div>
        <div class="text-[11px] text-gray-500 mt-0.5">${ch.cw}×${ch.ch}×${ch.cz||1} · ${chunkSolidCount(ch)} cells${ch.shape?' · '+esc(ch.shape):''} · ${ch.space||'inside'}${ch.roof?' · roof':''}</div>
      </button>`).join('')||`<div class="text-xs text-gray-500 p-3">No chunks yet.</div>`;

    host.innerHTML=`
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <button onclick="RGD.importChunkFromUeFn()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-1.5"><i data-lucide="download" class="w-4 h-4"></i> Import from UEFN selection</button>
        <button onclick="RGD.newChunk()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-1.5"><i data-lucide="plus" class="w-4 h-4"></i> New Chunk</button>
        <div class="flex-1"></div>
        <span class="text-xs text-gray-500">${list.length} chunks</span>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4" style="min-height:420px">
        <div class="lg:col-span-1 bg-gray-800/50 border border-gray-700 rounded-xl p-3 overflow-y-auto max-h-[70vh]">${items}</div>
        <div class="lg:col-span-2 bg-gray-800 border border-gray-700 rounded-xl p-4">
          ${c?chunkDetailHtml(c):`<div class="py-16 text-center text-gray-500 text-sm">Select a chunk</div>`}
        </div>
      </div>`;
    if(c){
      if(_chunkViewMode==='3d'){
        requestAnimationFrame(()=>{ if(typeof mountChunkViewer==='function') mountChunkViewer(c, _chunkRotPreview); });
      } else {
        drawChunkPreview(c, _chunkRotPreview);
      }
    }
  }

  function chunkAssetsList(){ return state.chunkAssets || (state.chunkAssets=[]); }
  function chunkDetailHtml(c){
    const roles=['entrance','exit','objective','room','connector','deadend','cap','filler','boss'];
    const assets=chunkAssetsList();
    if(!_chunkPropId && assets[0]) _chunkPropId=assets[0].id;
    const propOpts=assets.map(a=>`<option value="${esc(a.id)}" ${a.id===_chunkPropId?'selected':''}>${esc(a.name||a.id)} · ${esc(a.kind||'prop')}</option>`).join('');
    const propCount=(c.props||[]).length;
    return `
      <div class="flex flex-wrap items-start gap-3 mb-3">
        <div class="flex-1 min-w-[200px]">
          <div class="text-lg font-semibold text-white">${esc(c.name)}</div>
          <div class="text-[11px] text-gray-500 font-mono">${esc(c.id)} · ${sockSummary(c)}</div>
        </div>
        <button onclick="RGD.chunkRotPrev()" class="px-2 py-1.5 rounded-lg bg-gray-700 text-xs">⟲ ${_chunkRotPreview}°</button>
        <button onclick="RGD.chunkRotNext()" class="px-2 py-1.5 rounded-lg bg-gray-700 text-xs">⟳</button>
        <button onclick="RGD.deleteChunk('${c.id}')" class="px-2 py-1.5 rounded-lg bg-gray-700 hover:bg-red-600 text-xs"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
        <label class="text-gray-400">Name<input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${esc(c.name||'')}" onchange="RGD.updateChunkField('name',this.value)"/></label>
        <label class="text-gray-400">Role<select class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" onchange="RGD.updateChunkField('role',this.value)">${roles.map(r=>`<option value="${r}" ${c.role===r?'selected':''}>${r}</option>`).join('')}</select></label>
        <label class="text-gray-400">Space<select class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" onchange="RGD.updateChunkField('space',this.value)"><option value="inside" ${c.space==='inside'?'selected':''}>inside</option><option value="outside" ${c.space==='outside'?'selected':''}>outside</option></select></label>
        <label class="text-gray-400">Weight<input type="number" step="0.1" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${c.weight||1}" onchange="RGD.updateChunkField('weight',+this.value)"/></label>
        <label class="text-gray-400">W (cells)<input type="number" min="1" max="32" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${c.cw||1}" onchange="RGD.updateChunkField('cw',+this.value)"/></label>
        <label class="text-gray-400">D (cells)<input type="number" min="1" max="32" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${c.ch||1}" onchange="RGD.updateChunkField('ch',+this.value)"/></label>
        <label class="text-gray-400">H stories<input type="number" min="1" max="16" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${c.cz||1}" onchange="RGD.updateChunkField('cz',+this.value)" title="Cell height / stories (2×2×4 → H=4)"/></label>
        <label class="text-gray-400 text-[10px] text-gray-500 flex items-end pb-1">Size ${c.cw||1}×${c.ch||1}×${c.cz||1} · ledge@z matches height_step</label>
        <label class="text-gray-400 col-span-2">Tags (comma)<input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${esc((c.tags||[]).join(', '))}" onchange="RGD.updateChunkField('tags',this.value.split(',').map(s=>s.trim()).filter(Boolean))"/></label>
        <label class="text-gray-400 col-span-2">Content prefab
          <input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white font-mono text-[11px]" value="${esc(c.contentPath||(typeof contentPathLabel==='function'?contentPathLabel(c.prefabPath):c.prefabPath)||'')}" onchange="RGD.updateChunkField('prefabPath', (typeof toUeContentPath==='function'?toUeContentPath(this.value):this.value))" placeholder="Content/Prefabs/Chunks/EP_…"/>
          <div class="text-[10px] text-gray-500 mt-1">UEFN mount: <span class="font-mono text-gray-400">${esc(c.prefabPath||'—')}</span> · under project Content/ only (not Saved/ or .ducky)</div>
        </label>
        <label class="flex items-center gap-2 text-gray-300 col-span-2 mt-1"><input type="checkbox" ${c.roof?'checked':''} onchange="RGD.updateChunkField('roof',this.checked)"/> Roofed (indoor)</label>
        <label class="flex items-center gap-2 text-gray-300 col-span-2 mt-1"><input type="checkbox" ${c.gridAuto!==false?'checked':''} onchange="RGD.updateChunkField('gridAuto',this.checked)"/> Auto-derive footprint from sockets</label>
      </div>
      <div class="flex flex-wrap items-center gap-2 mb-2 text-xs">
        <span class="text-gray-400">Paint footprint:</span>
        ${['floor','wall','door','empty'].map(t=>`<button onclick="RGD.chunkPickPaint('${t}')" class="px-2 py-1 rounded border ${_chunkPaint===t&&!_chunkPlace?'border-indigo-500 bg-indigo-600/30':'border-gray-700 bg-gray-800'}">${t==='empty'?'empty (notch)':t}</button>`).join('')}
        <button onclick="RGD.chunkPickPaint(null)" class="px-2 py-1 rounded border border-gray-700 bg-gray-800">off</button>
        <span class="text-gray-500 ml-2">Presets:</span>
        ${[['L','L'],['J','J'],['T','T'],['S','S'],['Z','Z'],['I','I'],['O','O'],['U','U']].map(([k,lab])=>`
          <button onclick="RGD.applyChunkShapePreset('${k}')" class="px-2 py-1 rounded border border-violet-700/60 bg-violet-900/30 hover:bg-violet-700/40">${lab}</button>`).join('')}
      </div>
      <div class="flex flex-wrap items-center gap-2 mb-2 text-xs border-t border-gray-700/60 pt-2">
        <span class="text-gray-400">Place on grid:</span>
        <button onclick="RGD.chunkPickPlace('slotA')" class="px-2 py-1 rounded border ${_chunkPlace==='slotA'?'border-emerald-500 bg-emerald-600/30':'border-gray-700 bg-gray-800'}">Slot A (player)</button>
        <button onclick="RGD.chunkPickPlace('slotB')" class="px-2 py-1 rounded border ${_chunkPlace==='slotB'?'border-pink-500 bg-pink-600/30':'border-gray-700 bg-gray-800'}">Slot B (enemy)</button>
        <button onclick="RGD.chunkPickPlace('prop')" class="px-2 py-1 rounded border ${_chunkPlace==='prop'?'border-amber-500 bg-amber-600/30':'border-gray-700 bg-gray-800'}">Prop / column</button>
        <button onclick="RGD.chunkPickPlace(null)" class="px-2 py-1 rounded border border-gray-700 bg-gray-800">off</button>
        <select class="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white max-w-[220px]" onchange="RGD.chunkSetPropAsset(this.value)" ${_chunkPlace==='prop'?'':'disabled'}>
          ${propOpts||'<option value="">No assets — add below</option>'}
        </select>
        <span class="text-gray-500">${propCount} props on this chunk</span>
      </div>
      <div class="flex items-center gap-1 mb-2">
        <button onclick="RGD.setChunkViewMode('2d')" class="px-3 py-1.5 rounded-lg text-xs ${_chunkViewMode==='2d'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">2D edit</button>
        <button onclick="RGD.setChunkViewMode('3d')" class="px-3 py-1.5 rounded-lg text-xs ${_chunkViewMode==='3d'?'bg-violet-600 text-white':'bg-gray-800 text-gray-300 hover:bg-gray-700'}">3D orbit</button>
        <span class="text-[10px] text-gray-500 ml-2">${_chunkViewMode==='2d'?'Click to paint / place props':'Drag to rotate · scroll to zoom · ⟲⟳ footprint yaw'}</span>
      </div>
      <div id="chunkView2dWrap" class="${_chunkViewMode==='2d'?'':'hidden'}">
        <canvas id="chunkPreview" width="480" height="360" class="w-full rounded-lg border border-gray-700 bg-[#0b0f19]" style="height:380px;max-height:380px"></canvas>
      </div>
      <div id="chunkView3dWrap" class="${_chunkViewMode==='3d'?'':'hidden'}">
        <div id="rgdChunkView3d" class="w-full rounded-lg border border-gray-700 overflow-hidden bg-[#0b1220]" style="height:380px;cursor:grab"></div>
      </div>
      <div class="text-[11px] text-gray-500 mt-2">${chunkSolidCount(c)} solid cells · ${(c.ports||[]).filter(p=>p.kind==='door'||p.kind==='open').length} open ports · ${propCount} props.
        ${_chunkViewMode==='2d'?'Paint/place here, then switch to 3D to orbit.':'Props from Assets show as columns/arches/etc. UEFN:'} <code class="text-gray-400">Socket_N0_Door</code>, <code class="text-gray-400">Slot_A</code>.</div>
      <div class="mt-3 rounded-lg border border-gray-700 bg-gray-900/50 p-3 space-y-2">
        <div class="text-[11px] uppercase tracking-wide text-gray-500">Chunk assets catalogue</div>
        <div class="text-[11px] text-gray-400">Columns / meshes from <code class="text-gray-500">Content/</code>. Pick one above, then click cells.</div>
        <div class="max-h-28 overflow-y-auto text-[11px] font-mono text-gray-400 space-y-0.5">
          ${assets.map(a=>`<div><span class="text-amber-400/90">${esc(a.kind||'prop')}</span> ${esc(a.name)} <span class="text-gray-600">${esc(a.contentPath||(typeof contentPathLabel==='function'?contentPathLabel(a.assetPath):a.assetPath)||'')}</span></div>`).join('')||'<div class="text-gray-600">Empty</div>'}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <input id="chkAssetName" class="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" placeholder="Name (Egypt Column)"/>
          <input id="chkAssetPath" class="md:col-span-2 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white font-mono" placeholder="Content/Meshes/SM_…"/>
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="RGD.addChunkAsset()" class="px-2 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs text-white">Add asset to catalogue</button>
          <button onclick="RGD.go('assets')" class="px-2 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-xs text-white">Open Assets tab →</button>
        </div>
      </div>`;
  }

  function setChunkViewMode(mode){
    _chunkViewMode=(mode==='3d')?'3d':'2d';
    const c=selectedChunk();
    renderChunks();
    if(_chunkViewMode==='3d' && c && typeof mountChunkViewer==='function'){
      requestAnimationFrame(()=>mountChunkViewer(c, _chunkRotPreview));
    }
  }

  function drawChunkPreview(c, rot){
    if(_chunkViewMode==='3d' && typeof refreshChunkThree==='function'){
      refreshChunkThree(c, rot);
      return;
    }
    const canvas=document.getElementById('chunkPreview'); if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    const cssW=canvas.clientWidth||480, cssH=360;
    canvas.width=cssW*dpr; canvas.height=cssH*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#0b0f19'; ctx.fillRect(0,0,cssW,cssH);
    const g=rotateGridJs(c.grid||[], rot);
    const ch=g.length, cw=(g[0]||[]).length;
    if(!cw||!ch) return;
    const pad=24;
    const cell=Math.min((cssW-pad*2)/cw, (cssH-pad*2)/ch);
    const ox=(cssW-cw*cell)/2, oy=(cssH-ch*cell)/2;
    const terrColor={floor:'#1e293b', wall:'#475569', door:'#fbbf24', empty:'#0f172a'};
    for(let y=0;y<ch;y++) for(let x=0;x<cw;x++){
      const t=g[y][x]||'empty';
      ctx.fillStyle=terrColor[t]||'#333';
      ctx.fillRect(ox+x*cell, oy+y*cell, cell-1, cell-1);
    }
    // Roof hatch
    if(c.roof){
      ctx.strokeStyle='rgba(165,180,252,0.25)';
      ctx.lineWidth=1;
      for(let i=-ch;i<cw+ch;i++){
        ctx.beginPath();
        ctx.moveTo(ox+i*cell, oy);
        ctx.lineTo(ox+(i-ch)*cell, oy+ch*cell);
        ctx.stroke();
      }
    }
    // Open ports (in/out) after rotation
    const portFace={N:[0,-1],E:[1,0],S:[0,1],W:[-1,0]};
    const faceRot=(f,r)=>{ const o=['N','E','S','W']; const i=o.indexOf(f); return o[(i+r/90)%4]; };
    (c.ports||[]).forEach(p=>{
      if(!(p.kind==='door'||p.kind==='open'||p.kind==='ledge'||p.kind==='window')) return;
      let lx=+p.x||0, ly=+p.y||0, face=p.face||'N';
      if(rot===90){ const t=lx; lx=ch-1-ly; ly=t; face=faceRot(face,90); }
      else if(rot===180){ lx=cw-1-lx; ly=ch-1-ly; face=faceRot(face,180); }
      else if(rot===270){ const t=lx; lx=ly; ly=cw-1-t; face=faceRot(face,270); }
      const [dx,dy]=portFace[face]||[0,-1];
      const cx=ox+(lx+0.5)*cell, cy=oy+(ly+0.5)*cell;
      const hz=+(p.height_step!=null?p.height_step:p.z)||0;
      const isLedge=p.kind==='ledge'||p.kind==='window';
      ctx.strokeStyle=isLedge?'#38bdf8':'#fbbf24';
      ctx.fillStyle=ctx.strokeStyle;
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx+dx*cell*0.45, cy+dy*cell*0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx+dx*cell*0.42, cy+dy*cell*0.42, Math.max(2,cell*0.12), 0, Math.PI*2);
      ctx.fill();
      if(hz){
        ctx.fillStyle='#e2e8f0';
        ctx.font=`bold ${Math.max(8,cell*0.22)}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.fillText('z'+hz, cx+dx*cell*0.42, cy+dy*cell*0.42-Math.max(3,cell*0.14));
      }
    });
    // Role outline (bbox)
    ctx.strokeStyle=ROLE_COLORS[c.role]||'#818cf8';
    ctx.lineWidth=2;
    ctx.strokeRect(ox-1, oy-1, cw*cell+1, ch*cell+1);
    // Slots
    (c.slots||[]).forEach(s=>{
      let lx=+s.x||0, ly=+s.y||0;
      if(rot===90){ const t=lx; lx=ch-1-ly; ly=t; }
      else if(rot===180){ lx=cw-1-lx; ly=ch-1-ly; }
      else if(rot===270){ const t=lx; lx=ly; ly=cw-1-t; }
      ctx.fillStyle=String(s.group||'').toUpperCase()==='A'?'#34d399':'#f472b6';
      ctx.beginPath();
      ctx.arc(ox+(lx+0.5)*cell, oy+(ly+0.5)*cell, Math.max(3,cell*0.22), 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle='#fff';
      ctx.font=`${Math.max(9,cell*0.35)}px sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(s.group||'?', ox+(lx+0.5)*cell, oy+(ly+0.5)*cell);
    });
    // Props (columns etc.)
    (c.props||[]).forEach(pr=>{
      let lx=+pr.x||0, ly=+pr.y||0;
      if(rot===90){ const t=lx; lx=ch-1-ly; ly=t; }
      else if(rot===180){ lx=cw-1-lx; ly=ch-1-ly; }
      else if(rot===270){ const t=lx; lx=ly; ly=cw-1-t; }
      const px=ox+(lx+0.5)*cell, py=oy+(ly+0.5)*cell;
      ctx.fillStyle='#f59e0b';
      ctx.fillRect(px-cell*0.18, py-cell*0.32, cell*0.36, cell*0.64);
      ctx.fillStyle='#0f172a';
      ctx.font=`bold ${Math.max(8,cell*0.28)}px sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('▮', px, py);
    });
    // Click-to-paint / place
    canvas.onmousedown=function(ev){
      if(!c) return;
      const rect=canvas.getBoundingClientRect();
      const mx=ev.clientX-rect.left, my=ev.clientY-rect.top;
      const x=Math.floor((mx-ox)/cell), y=Math.floor((my-oy)/cell);
      if(x<0||y<0||x>=c.cw||y>=c.ch) return;
      if(rot!==0){ toast('Reset rotation to 0° to edit','warn'); return; }
      if(_chunkPlace==='slotA'||_chunkPlace==='slotB'){
        const group=_chunkPlace==='slotA'?'A':'B';
        c.slots=Array.isArray(c.slots)?c.slots:[];
        const idx=c.slots.findIndex(s=>+s.x===x&&+s.y===y);
        if(idx>=0 && String(c.slots[idx].group).toUpperCase()===group) c.slots.splice(idx,1);
        else if(idx>=0) c.slots[idx]={group,x,y};
        else c.slots.push({group,x,y});
        save({flush:true});
        bridge.call('update_chunk',{id:c.id, slots:c.slots});
        drawChunkPreview(c, rot);
        return;
      }
      if(_chunkPlace==='prop'){
        if(!_chunkPropId){ toast('Pick a prop asset first','warn'); return; }
        c.props=Array.isArray(c.props)?c.props:[];
        const idx=c.props.findIndex(p=>+p.x===x&&+p.y===y);
        if(idx>=0 && c.props[idx].assetId===_chunkPropId) c.props.splice(idx,1);
        else if(idx>=0) c.props[idx]={x,y,assetId:_chunkPropId,yaw:0};
        else c.props.push({x,y,assetId:_chunkPropId,yaw:0});
        save({flush:true});
        bridge.call('update_chunk',{id:c.id, props:c.props});
        drawChunkPreview(c, rot);
        return;
      }
      if(!_chunkPaint) return;
      if(!Array.isArray(c.grid)) c.grid=[];
      while(c.grid.length<c.ch) c.grid.push([]);
      for(let yy=0;yy<c.ch;yy++){ c.grid[yy]=c.grid[yy]||[]; while(c.grid[yy].length<c.cw) c.grid[yy].push('floor'); }
      c.grid[y][x]=_chunkPaint;
      c.gridAuto=false;
      c.ports=rebuildPortsFromGrid(c);
      save(); drawChunkPreview(c, rot);
    };
  }

  function rebuildPortsFromGrid(c){
    const g=c.grid||[]; const ch=c.ch||g.length; const cw=c.cw||((g[0]||[]).length);
    const solid=(x,y)=>y>=0&&y<ch&&x>=0&&x<cw&&g[y]&&g[y][x]&&g[y][x]!=='empty';
    const oldOpen=new Set((c.ports||[]).filter(p=>p.kind==='door'||p.kind==='open').map(p=>p.x+','+p.y+','+p.face));
    const ports=[];
    const faces=[['N',0,-1],['E',1,0],['S',0,1],['W',-1,0]];
    for(let y=0;y<ch;y++) for(let x=0;x<cw;x++){
      if(!solid(x,y)) continue;
      faces.forEach(([face,dx,dy])=>{
        if(solid(x+dx,y+dy)) return;
        const key=x+','+y+','+face;
        let kind='wall';
        if(g[y][x]==='door'||oldOpen.has(key)) kind='door';
        ports.push({x,y,face,kind,size:1,height_step:0,z:0});
      });
    }
    return ports;
  }

  function applyChunkShapePreset(kind){
    const c=selectedChunk(); if(!c) return;
    const presets={
      L:['#..','#..','##.'],
      J:['..#','..#','.##'],
      T:['.#.','###'],
      S:['.##','##.'],
      Z:['##.','.##'],
      I:['####'],
      O:['##','##'],
      U:['#.#','#.#','###'],
    };
    const mask=presets[kind]; if(!mask) return;
    const ch=mask.length, cw=Math.max(...mask.map(r=>r.length));
    c.cw=cw; c.ch=ch; c.shape=kind; c.gridAuto=false;
    c.grid=mask.map(r=>{
      const row=[]; for(let x=0;x<cw;x++) row.push((r[x]==='#')?'floor':'empty'); return row;
    });
    // Default doors: first/last exposed ports on opposite-ish sides
    c.ports=[];
    c.ports=rebuildPortsFromGrid(c);
    const opens=c.ports.filter(p=>true);
    // Open N-most and S/E-most wall ports as doors so pieces can join
    const byFace={N:[],E:[],S:[],W:[]};
    opens.forEach(p=>byFace[p.face]&&byFace[p.face].push(p));
    ['N','S','E','W'].forEach(f=>{
      if(byFace[f][0]) byFace[f][0].kind='door';
      if(byFace[f].length>1) byFace[f][byFace[f].length-1].kind='door';
    });
    // Mark door cells for preview
    c.ports.forEach(p=>{ if(p.kind==='door'&&c.grid[p.y]) c.grid[p.y][p.x]='door'; });
    save({flush:true});
    bridge.call('update_chunk',{id:c.id, cw, ch, grid:c.grid, gridAuto:false, ports:c.ports, shape:kind, sockets:c.sockets});
    renderChunks();
    toast('Applied '+kind+' footprint — tweak doors with paint','ok');
  }

  function selectChunk(id){ _chunkSel=id; _chunkRotPreview=0; renderChunks(); }
  function chunkRotNext(){ _chunkRotPreview=(_chunkRotPreview+90)%360; renderChunks(); }
  function chunkRotPrev(){ _chunkRotPreview=(_chunkRotPreview+270)%360; renderChunks(); }
  function chunkPickPaint(t){ _chunkPaint=t; _chunkPlace=null; renderChunks(); }
  function chunkPickPlace(mode){ _chunkPlace=mode; if(mode) _chunkPaint=null; renderChunks(); }
  function chunkSetPropAsset(id){ _chunkPropId=id||null; _chunkPlace='prop'; _chunkPaint=null; }
  function addChunkAsset(){
    const name=(document.getElementById('chkAssetName')||{}).value||'';
    const path=(document.getElementById('chkAssetPath')||{}).value||'';
    if(!path.trim()){ toast('Asset path required (Content/… mesh)','warn'); return; }
    const id=('ast_'+Date.now().toString(36));
    const ue=(typeof toUeContentPath==='function'?toUeContentPath(path):path.trim());
    const kind=/column|pillar/i.test(path+name)?'column':(/wall/i.test(path+name)?'wall':(/floor|tile/i.test(path+name)?'floor':'prop'));
    const rec={id, name:name.trim()||id, assetPath:ue, contentPath:(typeof contentPathLabel==='function'?contentPathLabel(ue):path.trim()), kind, preview:kind==='prop'?'cube':kind, source:'catalogue'};
    chunkAssetsList().push(rec);
    _chunkPropId=id;
    _chunkPlace='prop';
    save({flush:true});
    bridge.call('upsert_chunk_asset',{id, name:rec.name, asset_path:ue, kind, preview:rec.preview});
    renderChunks();
    toast('Added '+rec.name+' — click cells to place (full list → Assets tab)','ok');
  }

  function updateChunkField(key, val){
    const c=selectedChunk(); if(!c) return;
    if(key==='prefabPath'){
      c.prefabPath=(typeof toUeContentPath==='function'?toUeContentPath(val):val)||'';
      c.contentPath=(typeof contentPathLabel==='function'?contentPathLabel(c.prefabPath):'')||'';
      bridge.call('update_chunk',{id:c.id, prefabPath:c.prefabPath});
    } else if(key==='cw'||key==='ch'||key==='cz'){
      const n=Math.max(1, Math.min(key==='cz'?16:32, Math.round(+val)||1));
      c[key]=n;
      const patch={id:c.id, [key]:n};
      if((key==='cw'||key==='ch') && c.gridAuto!==false) patch.gridAuto=true;
      bridge.call('update_chunk', patch);
    } else {
      c[key]=val;
      if(key!=='gridAuto') bridge.call('update_chunk',{id:c.id, [key]:val});
    }
    if(key==='space' && val==='outside') c.roof=false;
    if(key==='gridAuto' && val){
      // ask backend to re-normalize via update
      bridge.call('update_chunk',{id:c.id, gridAuto:true, sockets:c.sockets}).then(r=>{
        if(r&&r.ok){ hydrateChunkFromState(); renderChunks(); }
      });
    }
    save(); renderChunks();
  }

  function hydrateChunkFromState(){ /* state already live */ }

  async function importChunkFromUeFn(){
    const name=prompt('Chunk name (optional):','')||'';
    toast('Importing from UEFN selection…','info');
    const r=await bridge.call('import_chunk_from_selection',{name, role:'room', space:'inside', tags:['ruins']});
    if(r&&r.error){ toast(r.error,'err'); return; }
    if(r&&r.chunk){
      const existing=chunksList().find(c=>c.id===r.id);
      if(existing) Object.assign(existing, r.chunk);
      else chunksList().push(r.chunk);
      _chunkSel=r.id;
      save({flush:true});
      toast('Imported '+r.id+' ('+(r.markers&&r.markers.sockets||0)+' sockets)','ok');
      renderChunks();
    } else toast('Import returned nothing — is the listener online?','warn');
  }

  function newChunk(){
    const id='chk_'+Date.now().toString(36);
    const rec={
      id, name:'New Chunk', cw:2, ch:2, cz:1, role:'room', space:'inside', roof:true,
      sockets:{N:[{kind:'door'},{kind:'door'}],E:[{kind:'wall'},{kind:'wall'}],S:[{kind:'door'},{kind:'door'}],W:[{kind:'wall'},{kind:'wall'}]},
      rotations:[0,90,180,270], mirror:false, weight:1, tags:['ruins'], slots:[],
      grid:[['door','door'],['door','door']], gridAuto:true, prefabPath:'',
    };
    chunksList().push(rec);
    _chunkSel=id;
    save({flush:true});
    bridge.call('create_chunk',{id, name:rec.name, cw:2, ch:2, cz:1, role:'room', sockets:{N:['door','door'],E:['wall','wall'],S:['door','door'],W:['wall','wall']}});
    renderChunks();
  }

  async function deleteChunk(id){
    if(!confirm('Delete chunk '+id+'?')) return;
    state.chunks=chunksList().filter(c=>c.id!==id);
    await bridge.call('delete_chunk',{id});
    save({flush:true});
    renderChunks();
    toast('Deleted','ok');
  }
