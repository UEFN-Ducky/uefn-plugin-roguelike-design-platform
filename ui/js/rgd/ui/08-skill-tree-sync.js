  /* ======================================================================
     UI SCREENS — 08 · SKILL TREE SYNC
     Progression.tree.nodes is the source of truth. This rebuilds scr_skill_tree
     (and keeps scr_levelup points copy honest) whenever the tree or sim points
     change. Verse is NOT written here — use UI Screens → Write to project.
     ====================================================================== */

  const SKILL_TREE_SCREEN_ID = 'scr_skill_tree';
  const LEVEL_UP_SCREEN_ID = 'scr_levelup';
  const SKILL_TREE_PANEL_W = 1180, SKILL_TREE_PANEL_H = 620;
  const SKILL_TREE_PAD = 24;
  const SKILL_NODE_W = 88, SKILL_NODE_H = 100, SKILL_NODE_FACE = 64;

  function buildSkillTreeNodeWidget(n, x, y, rank, selected){
    const color = n.color || '#a855f7';
    const max = Math.max(1, Number(n.maxRank)||1);
    const r = Math.max(0, Number(rank)||0);
    const accent = selected ? 'gold' : color;
    const face = uiOverlay([
      uiRect(accent, SKILL_NODE_FACE+4, SKILL_NODE_FACE+4, {opacity:1}, sl('Fill','Fill'), 'Node ring'),
      uiRect('panelDeep', SKILL_NODE_FACE, SKILL_NODE_FACE, {opacity:0.95}, sl('Center','Center',[2,2,2,2]), 'Node face'),
      uiRect(color, 8, 8, {opacity:1}, sl('Center','Center'), 'Node gem'),
      uiText((r)+'/'+max, {size:'tiny', color:selected?'gold':'text', justify:'Center'}, sl('Center','Bottom',[0,0,0,6]), 'Node rank'),
    ], csBox(Math.round((SKILL_NODE_W-SKILL_NODE_FACE-4)/2), 0, SKILL_NODE_FACE+4, SKILL_NODE_FACE+4), 'Node face wrap');
    const label = uiText(n.name||n.id, {size:'tiny', color:selected?'gold':'text', justify:'Center', wrap:true, wrapWidth:SKILL_NODE_W},
      csBox(0, SKILL_NODE_FACE+8, SKILL_NODE_W, 28), 'Node name');
    return uiOverlay([face, label], csBox(Math.round(x), Math.round(y), SKILL_NODE_W, SKILL_NODE_H), 'Node · '+(n.id||n.name));
  }

  function buildSkillTreeEdgeWidgets(nodes, by, scale, ox, oy){
    const edges=[];
    nodes.forEach(n=>{
      (n.requires||[]).forEach(rid=>{
        const a=by[rid], b=n; if(!a||!b) return;
        const x1=ox + (Number(a.x)||0)*scale + SKILL_NODE_W/2;
        const y1=oy + (Number(a.y)||0)*scale + SKILL_NODE_FACE/2;
        const x2=ox + (Number(b.x)||0)*scale + SKILL_NODE_W/2;
        const y2=oy + (Number(b.y)||0)*scale + SKILL_NODE_FACE/2;
        const unlocked = nodeRank(rid) >= 1;
        const mx=(x1+x2)/2, my=(y1+y2)/2;
        const dx=x2-x1, dy=y2-y1;
        const len=Math.max(2, Math.sqrt(dx*dx+dy*dy));
        // Axis-aligned stub: short horizontal + vertical segments so Verse can draw them.
        const hx=Math.min(x1,x2), hw=Math.max(2, Math.abs(dx));
        const vy=Math.min(y1,y2), vh=Math.max(2, Math.abs(dy));
        edges.push(uiRect(unlocked?'accentAlt':'stroke', hw, 2, {opacity:unlocked?0.85:0.45}, csBox(Math.round(hx), Math.round(my-1), Math.round(hw), 2), 'Edge H · '+rid+'=>'+n.id));
        edges.push(uiRect(unlocked?'accentAlt':'stroke', 2, vh, {opacity:unlocked?0.85:0.45}, csBox(Math.round(mx-1), Math.round(vy), 2, Math.round(vh)), 'Edge V · '+rid+'=>'+n.id));
        void len;
      });
    });
    return edges;
  }

  function buildSkillTreeScreenRoot(){
    ensureProgression();
    const p=state.progression;
    const tree=p.tree||{width:900,height:520,nodes:[]};
    const nodes=tree.nodes||[];
    const by={}; nodes.forEach(n=>by[n.id]=n);
    const sel=findTreeNode(state.meta.progSelectedNode)||nodes[0]||null;
    const avail=availableSimPoints();
    const innerW=SKILL_TREE_PANEL_W - SKILL_TREE_PAD*2;
    const innerH=SKILL_TREE_PANEL_H - SKILL_TREE_PAD*2;
    const tw=Math.max(1, Number(tree.width)||900);
    const th=Math.max(1, Number(tree.height)||520);
    const scale=Math.min(innerW/tw, innerH/th);
    const ox=Math.round((innerW - tw*scale)/2);
    const oy=Math.round((innerH - th*scale)/2);

    const nodeKids = nodes.map(n=>{
      const x = ox + (Number(n.x)||0)*scale;
      const y = oy + (Number(n.y)||0)*scale;
      return buildSkillTreeNodeWidget(n, x, y, nodeRank(n.id), sel && sel.id===n.id);
    });
    const edgeKids = buildSkillTreeEdgeWidgets(nodes, by, scale, ox, oy);
    const treeCanvasKids = edgeKids.concat(nodeKids);
    if(!treeCanvasKids.length){
      treeCanvasKids.push(uiText('Add skill nodes in the Progression tab', {size:'small', color:'textMute', justify:'Center'}, sl('Center','Center'), 'Tree empty'));
    }

    const reqNames = sel ? (sel.requires||[]).map(rid=>{
      const t=findTreeNode(rid); return t?t.name:rid;
    }).filter(Boolean) : [];
    const rank = sel ? nodeRank(sel.id) : 0;
    const max = sel ? (Number(sel.maxRank)||1) : 1;
    const cost = sel ? (Number(sel.cost)||1) : 1;
    const body = sel
      ? ('Rank '+rank+' / '+max+' — '+(sel.effect||sel.desc||'No effect summary.'))
      : 'Select a node in Progression to preview its card.';
    const cardAccent = (sel && sel.color) || 'accentAlt';

    return uiCanvas([
      uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
      uiPageHeader('Threads of mastery','Spend skill points. Later nodes stay locked until their prerequisites are filled.','accentAlt'),
      uiOverlay([
        uiRect('panelDeep', 300, 74, {opacity:0.9}, sl('Fill','Fill'), 'Points bg'),
        uiRect('accentAlt', 4, 74, {}, sl('Left','Fill'), 'Points accent'),
        uiStack('V', [
          uiText('SKILL POINTS', {size:'tiny', color:'accentAlt'}, sl('Left','Top',[0,0,0,4]), 'Points kicker'),
          Object.assign(uiText(avail+' unspent', {size:'h3', color:'text'}, sl('Left','Top'), 'Points value'), {bind:'PointsText'}),
        ], sl('Left','Center',[20,0,0,0]), 'Points stack'),
      ], csAnchor(1,0,-MX,MY,300,74,1,0), 'Points banner'),
      uiPanel(SKILL_TREE_PANEL_W, SKILL_TREE_PANEL_H, [
        uiOverlay(treeCanvasKids, sl('Fill','Fill'), 'Tree canvas'),
      ], {padding:SKILL_TREE_PAD, name:'Tree panel', slot:csBox(MX, 240, SKILL_TREE_PANEL_W, SKILL_TREE_PANEL_H)}),
      uiCard(440, 620, {
        accent: cardAccent,
        kicker: 'SELECTED NODE',
        title: sel ? (sel.name||sel.id) : 'No node selected',
        artH: 140,
        body: body,
        footL: 'Cost: '+cost+' point'+(cost===1?'':'s'),
        footR: reqNames.length ? ('Requires: '+reqNames.join(', ')) : 'Requires: none',
        slot: csAnchor(1,0,-MX,240,440,620,1,0),
        name: 'Card · '+(sel ? (sel.name||sel.id) : 'Empty'),
      }),
      uiFooterHint(['[Click] Select node','[Space] Upgrade','[R] Refund','[Esc] Back']),
    ], null, 'Root');
  }

  function syncLevelUpScreenFromProgression(){
    ensureProgression();
    const screens = Array.isArray(state.uiScreens) ? state.uiScreens : null;
    if(!screens) return false;
    const screen = screens.find(s=>s.id===LEVEL_UP_SCREEN_ID);
    if(!screen || !screen.root) return false;
    const p=state.progression;
    const simLv=Number(state.meta.progSimLevel)||1;
    const pts=Number(p.pointsPerLevel)||1;
    const total=availableSimPoints();
    const hpRow=(p.scaling||[]).find(r=>r.statId==='hp');
    const hpGain = hpRow ? Math.round(Number(hpRow.perLevel)||0) : 10;
    const hpNow = hpRow ? Math.round(scaleAtLevel(hpRow, simLv)) : 100;
    // Walk known text widgets by name and refresh copy.
    let touched=false;
    uiWalk(screen.root, n=>{
      if(n.type!=='text' || !n.props) return;
      if(n.name==='Modal title'){ n.props.text='LEVEL '+simLv; touched=true; }
      if(n.name==='Row title' && String(n.props.text||'').indexOf('Skill Point')>=0){
        n.props.text = '+'+pts+' Skill Point'+(pts===1?'':'s'); touched=true;
      }
      if(n.name==='Row value' && n.props.color==='accentAlt'){
        n.props.text = total+' total'; touched=true;
      }
      if(n.name==='Row title' && String(n.props.text||'').indexOf('Max Health')>=0){
        n.props.text = '+'+(hpGain||10)+' Max Health'; touched=true;
      }
      if(n.name==='Row value' && n.props.color==='hp'){
        n.props.text = String(hpNow); touched=true;
      }
    });
    return touched;
  }

  function syncSkillTreeScreenFromProgression(opts){
    const o=opts||{};
    ensureProgression();
    if(!Array.isArray(state.uiScreens) || !state.uiScreens.length){
      // Seed catalogue first so the screen exists, then overwrite the skill tree root.
      state.uiScreens = uiSeedScreens();
    }
    let screen = state.uiScreens.find(s=>s.id===SKILL_TREE_SCREEN_ID);
    if(!screen){
      screen = uiScreen(SKILL_TREE_SCREEN_ID,'Skill Tree','hub','menu',
        'Mirrors the Progression tab tree. Auto-synced from Progression. Write to project to update in-game Verse.',
        'GameDevices/Gameplay/Screens/Hub','skill_tree', buildSkillTreeScreenRoot());
      state.uiScreens.push(screen);
    } else {
      screen.root = buildSkillTreeScreenRoot();
      screen.notes = 'Mirrors the Progression tab tree. Auto-synced from Progression. Use UI Screens → Write to project to update in-game Verse.';
      if(screen.status==='built') screen.status='design'; // mark dirty vs last Verse write
    }
    syncLevelUpScreenFromProgression();
    if(o.save) save(o.flush?{flush:true}:undefined);
    if(o.rerender && state.meta.activeTab==='uiscreens') renderUIScreens();
    return true;
  }
