  /* ======================================================================
     UI SCREENS — 03 · SEEDED CATALOGUE
     Every screen the Chronomancer loop needs, walked stage by stage:
       boot  -> title, class pick, difficulty
       hub   -> hub HUD, merchant (weapons / scrolls), infusion bench,
                skill tree, loadout, journey map, ready up, NPC dialogue
       run   -> run HUD, wave banner, boss bar, boss defeated, interact prompt, toasts
       popup -> upgrade choice, loot, level up, purchase, insufficient, confirm
       end   -> room clear, death, victory, pause, settings, leaderboard
     Each screen is a real widget tree, not a mockup image — it previews with
     Verse layout rules and exports as Verse.
     ====================================================================== */

  const MX = 120, MY = 72;   /* title-safe margins at 1080p */

  /* ---------- shared composites (the design system) ---------- */
  function uiKicker(txt, color){ return uiText(txt, {size:'tiny', color:color||'textMute', justify:'Left'}, sl('Left','Top'), 'Kicker'); }
  function uiH(txt, lvl, color){ return uiText(txt, {size:lvl||'h2', color:color||'text'}, sl('Left','Top'), 'Heading'); }

  function uiPageHeader(title, sub, accent){
    return uiStack('V', [
      uiRect(accent||'gold', 64, 4, {}, sl('Left','Top',[0,0,0,12]), 'Rule'),
      uiText(title, {size:'h1', color:'text'}, sl('Left','Top'), 'Title'),
      uiText(sub, {size:'small', color:'textDim'}, sl('Left','Top',[0,8,0,0]), 'Subtitle'),
    ], csBox(MX, MY, 900, 140), 'Page header');
  }

  /* Quiet Back — select screens advance on card/row press; Back returns one step. */
  function uiNavBack(label){
    const btn=uiButton(label||'Back','quiet', csBox(MX, 28, 180, 48), 'Back');
    btn.bind='BackBtn';
    return btn;
  }

  /* Currency pill — symbol, amount. Bound so Verse can update the amount. */
  function uiCurrencyChip(sym, amount, color, bind, opts){
    const o=opts||{};
    const symbolNode = o.icon
      ? uiIconPlate(o.icon, 28, color)
      : uiText(sym, {size:'h3', color}, sl('Left','Center',[0,0,10,0]), 'Symbol');
    return uiOverlay([
      uiRect('panelDeep', 210, 52, {opacity:0.85}, sl('Fill','Fill'), 'Chip bg'),
      uiRect(color, 4, 52, {}, sl('Left','Fill'), 'Chip accent'),
      uiStack('H', [
        symbolNode,
        Object.assign(uiText(amount, {size:'h3', color:'text'}, sl('Left','Center'), 'Amount'), {bind}),
      ], sl('Left','Center',[18,0,0,0]), 'Chip row'),
    ], null, 'Currency · '+bind);
  }

  function uiBadge(text, color, w, h, opts){
    const o=opts||{};
    const W=w||110, H=h||28;
    const kids=[
      uiRect(color||'accent', W, H, {opacity:1}, sl('Fill','Fill'), 'Badge border'),
      uiRect('panelDeep', W-4, H-4, {opacity:0.95}, sl('Fill','Fill',[2,2,2,2]), 'Badge fill'),
      uiText(text, {size:'tiny', color:color||'accent', justify:'Center'}, sl('Center','Center'), 'Badge text'),
    ];
    const badge=uiOverlay(kids, o.slot||null, o.name||('Badge · '+text));
    if(o.bind) badge.bind=o.bind;
    return badge;
  }
  function uiStatRow(label, pct, w, opts){
    const o=opts||{};
    const W=w||340, barW=Math.max(80, W-126);
    const bar=uiBar(barW, 10, o.fill||'accent', pct, 'Stat bar');
    bar.slot=sl('Right','Center');
    bar.props=Object.assign(bar.props||{}, {fx:o.fx||'bar'});
    const row=uiOverlay([
      uiText(label, {size:'tiny', color:'textMute'}, sl('Left','Center'), 'Stat label'),
      bar,
    ], o.slot||sl('Fill','Top',[0,0,0,10]), o.name||('Stat · '+label));
    if(o.bind) row.bind=o.bind;
    return row;
  }
  function uiIconPlate(image, size, tint){
    const s=size||64;
    return uiImage(image||'Textures.T_Empty', s, s, {tint:tint||'#FFFFFF', opacity:1}, sl('Center','Center'), 'Icon plate');
  }
  function uiPricePill(amount, sym, color, opts){
    const o=opts||{};
    const W=o.w||140, H=o.h||36;
    const kids=[
      uiRect(color||'gold', W, H, {opacity:1}, sl('Fill','Fill'), 'Price border'),
      uiRect('panelDeep', W-4, H-4, {opacity:0.95}, sl('Fill','Fill',[2,2,2,2]), 'Price fill'),
      uiStack('H', [
        uiText(String(sym||''), {size:'small', color:color||'gold'}, sl('Left','Center',[0,0,8,0]), 'Price sym'),
        Object.assign(uiText(String(amount==null?'':amount), {size:'small', color:'text'}, sl('Left','Center'), 'Price amt'), {bind:o.bind}),
      ], sl('Center','Center'), 'Price row'),
    ];
    return uiOverlay(kids, o.slot||null, o.name||'Price pill');
  }
  function uiWeaponCard(w, h, o){
    const O=o||{};
    const kids=[];
    const accent=O.accent||'stroke';
    const locked=!!O.locked;
    const owned=!!O.owned;
    kids.push(uiRect(accent, w, h, {opacity:1}, sl('Fill','Fill'), 'Card border'));
    kids.push(uiRect('panel', w-4, h-4, {opacity:locked?0.75:0.97}, sl('Fill','Fill',[2,2,2,2]), 'Card fill'));
    kids.push(uiRect(accent, w-4, 6, {}, sl('Fill','Top',[2,2,2,0]), 'Card rarity bar'));
    const artH=h-120;
    kids.push(uiRect('panelDeep', w-8, artH, {opacity:1}, sl('Fill','Top',[4,10,4,0]), 'Art plate'));
    if(O.index!=null){
      kids.push(uiText(String(O.index).padStart(2,'0'), {size:'display', color:'textMute', opacity:0.18, justify:'Center'}, sl('Center','Top',[0,24,0,0]), 'Ghost index'));
    }
    if(O.icon) kids.push(Object.assign(uiIconPlate(O.icon, Math.min(160, artH-40)), {slot:sl('Center','Top',[0,40,0,0])}));
    kids.push(uiBadge(owned?'UNLOCKED':'LOCKED', owned?'accent':'danger', owned?110:96, 28, {slot:sl('Right','Top',[0,18,14,0])}));
    /* Optional wizardry slot plate (EMPTY / FULL) — sits in the art well. */
    if(O.slotPlate) kids.push(O.slotPlate);
    else if(O.pips) kids.push(Object.assign(O.pips, {slot:sl('Left','Top',[16, artH-8,0,0])}));
    const footKids=[
      uiText(O.title||'', {size:'h3', color:'text'}, sl('Left','Top',[0,0,0,6]), 'Card title'),
      uiText(O.body||'', {size:'tiny', color:'textDim', wrap:true, wrapWidth:w-40}, sl('Left','Top',[0,0,0,8]), 'Card body'),
    ];
    if(owned) footKids.push(uiText('IN INVENTORY', {size:'tiny', color:'accent'}, sl('Left','Bottom'), 'Owned label'));
    else if(O.priceText) footKids.push(uiPricePill(O.priceText, O.priceSym||'', O.priceColor||'gold', {slot:sl('Left','Bottom'), bind:O.priceBind}));
    kids.push(uiStack('V', footKids, sl('Fill','Bottom',[16,0,16,14]), 'Card info'));
    const card=uiOverlay(kids, O.slot||null, O.name||('Weapon · '+(O.title||'')));
    card.props=Object.assign(card.props||{}, { asButton:true, variant:'card', state:O.state||(locked?'locked':'normal'), fx:O.fx||'pad', fxIndex:O.fxIndex||0, collapseDefault:true });
    if(O.bind) card.bind=O.bind;
    return card;
  }
  function uiPager(page, total, w, opts){
    const o=opts||{};
    const W=w||1680;
    const prev=uiOverlay([
      uiRect('panelDeep', 140, 48, {opacity:1}, sl('Fill','Fill'), 'Prev bg'),
      uiText('PREV', {size:'small', color:'text'}, sl('Center','Center'), 'Prev label'),
    ], sl('Left','Center'), 'Pager prev');
    prev.props={asButton:true, variant:'quiet'}; prev.bind=o.prevBind||'PagerPrev';
    const next=uiOverlay([
      uiRect('panelDeep', 140, 48, {opacity:1}, sl('Fill','Fill'), 'Next bg'),
      uiText('NEXT', {size:'small', color:'text'}, sl('Center','Center'), 'Next label'),
    ], sl('Right','Center'), 'Pager next');
    next.props={asButton:true, variant:'quiet'}; next.bind=o.nextBind||'PagerNext';
    const mid=Object.assign(uiText('PAGE '+page+' / '+total, {size:'small', color:'textMute', justify:'Center'}, sl('Center','Center'), 'Pager label'), {bind:o.labelBind||'PagerLabel'});
    return uiOverlay([prev, mid, next], o.slot||null, o.name||'Pager');
  }
  function uiWizardrySlot(slot, wiz, selected, opts){
    const o=opts||{};
    const W=o.w||200, H=o.h||120;
    const policy=o.slotPolicy||'infusable';
    const filled=!!(wiz&&(wiz.id||wiz.name));
    const lockedSig=!!(slot&&slot.kind==='locked') || (wiz&&wiz.kind==='locked_signature');
    const nonSwap=policy==='locked_power' || lockedSig;
    const empty=!filled && !(slot&&slot.kind==='locked');
    let skin='filled';
    if(empty) skin='empty';
    else if(nonSwap&&lockedSig) skin='signature';
    else if(slot&&slot.kind==='locked') skin='locked';
    const accent=(wiz&&wiz.color)||(skin==='empty'?'stroke':'accentAlt');
    const title=filled?(wiz.name||wiz.id):(slot&&slot.label)||'Open slot';
    const kicker=filled?(wiz.element||''):(skin==='empty'?'EMPTY':(slot&&slot.kind)||'');
    let effect='';
    if(filled&&wiz){
      if(wiz.kind==='element_infusion') effect=(wiz.stackName||'?')+' x'+(wiz.stackThreshold||5)+' → '+(wiz.procName||'?');
      else effect=wiz.chargedName||wiz.desc||'';
    } else if(empty){
      const accepts=(slot&&slot.accepts)||[];
      effect=accepts.length?('Accepts '+accepts.join(' / ')):'Hub reroll';
    } else effect='Signature — cannot swap';
    const kids=[
      uiRect(selected?'gold':accent, W, H, {opacity:1}, sl('Fill','Fill'), 'Wiz border'),
      uiRect(skin==='locked'||skin==='signature'?'panelDeep':'panel', W-4, H-4, {opacity:skin==='locked'?0.7:0.95}, sl('Fill','Fill',[2,2,2,2]), 'Wiz fill'),
      uiOverlay([
        uiRect(accent, 36, 36, {opacity:1}, sl('Fill','Fill'), 'Sym border'),
        uiRect('panelDeep', 32, 32, {opacity:0.95}, sl('Center','Center'), 'Sym fill'),
        uiText((wiz&&wiz.symbol)||(empty?'+':'🔒'), {size:'body', color:accent, justify:'Center'}, sl('Center','Center'), 'Sym'),
      ], sl('Left','Top',[12,12,0,0]), 'Symbol plate'),
      uiStack('V', [
        uiText(kicker, {size:'tiny', color:accent}, sl('Left','Top',[0,0,0,4]), 'Wiz kicker'),
        uiText(title, {size:'small', color:'text'}, sl('Left','Top',[0,0,0,4]), 'Wiz title'),
        uiText(effect, {size:'tiny', color:'textDim', wrap:true, wrapWidth:W-24}, sl('Left','Top'), 'Wiz effect'),
      ], sl('Fill','Fill',[56,12,12,12]), 'Wiz copy'),
    ];
    const node=uiOverlay(kids, o.slot||sl('Left','Fill',[0,0,12,0]), o.name||('Wizardry · '+title));
    node.props={asButton:true, variant:'card', state:skin==='locked'?'locked':(selected?'selected':'normal'), collapseDefault:true};
    if(o.bind) node.bind=o.bind;
    return node;
  }
  function uiWizardryPips(slots, wizById, opts){
    const o=opts||{};
    const list=slots||[];
    const kids=list.map((slot,i)=>{
      const pid=slot.equippedPowerId||slot.lockedPowerId;
      const wiz=pid&&wizById?wizById[pid]:null;
      const filled=!!wiz;
      const color=(wiz&&wiz.color)||'stroke';
      const pip=uiOverlay([
        uiRect(color, 22, 22, {opacity:filled?1:0.45}, sl('Fill','Fill'), 'Pip border'),
        uiRect(filled?'panelDeep':'panel', 18, 18, {opacity:filled?0.95:0.35}, sl('Center','Center'), 'Pip fill'),
        uiText(filled?(wiz.symbol||'·'):'·', {size:'tiny', color:filled?color:'textMute', justify:'Center'}, sl('Center','Center'), 'Pip sym'),
      ], sl('Left','Center',[i?6:0,0,0,0]), 'Pip '+i);
      return pip;
    });
    if(!kids.length) return uiRect('panel', 1, 1, {opacity:0}, o.slot||null, 'Pips empty');
    return uiStack('H', kids, o.slot||null, o.name||'Wizardry pips');
  }
  function uiUpgradeRow(name, boost, cost, w, opts){
    const o=opts||{};
    const W=w||400, H=o.h||72;
    const kids=[
      uiRect('row', W, H, {opacity:0.9}, sl('Fill','Fill'), 'Upgrade bg'),
      uiRect(o.accent||'stroke', 4, H, {}, sl('Left','Fill'), 'Upgrade accent'),
      uiStack('V', [
        uiText(name||'', {size:'body', color:'text'}, sl('Left','Top',[0,0,0,4]), 'Upgrade name'),
        uiText(boost||'', {size:'tiny', color:'textDim'}, sl('Left','Top'), 'Upgrade boost'),
      ], sl('Left','Center',[20,0,0,0]), 'Upgrade text'),
      uiText(cost||'', {size:'small', color:o.costColor||'gold'}, sl('Right','Center',[0,0,16,0]), 'Upgrade cost'),
    ];
    const row=uiOverlay(kids, o.slot||sl('Fill','Top',[0,0,0,10]), o.name||('Upgrade · '+(name||'')));
    row.props={asButton:true, variant:'row', state:o.state||'normal', collapseDefault:true};
    if(o.bind) row.bind=o.bind;
    return row;
  }
  /* Available Skins row — Armory details (React ShopUI). Color swatch + label. */
  function uiSkinSlot(name, swatch, selected, opts){
    const o=opts||{};
    const W=o.w||96, H=o.h||64;
    const kids=[
      uiRect(selected?'accent':'stroke', W, H, {opacity:1}, sl('Fill','Fill'), 'Skin border'),
      uiRect('panelDeep', W-4, H-4, {opacity:selected?0.95:0.9}, sl('Fill','Fill',[2,2,2,2]), 'Skin fill'),
      uiRect(swatch||'stroke', 32, 16, {opacity:1}, sl('Center','Top',[0,14,0,0]), 'Skin swatch'),
      uiText(name||'Default', {size:'tiny', color:'textMute', justify:'Center'}, sl('Center','Bottom',[0,0,0,10]), 'Skin label'),
    ];
    const node=uiOverlay(kids, o.slot||sl('Left','Fill',[0,0,16,0]), o.name||('Skin · '+(name||'Default')));
    node.props={asButton:true, variant:'card', state:selected?'selected':'normal', collapseDefault:true};
    if(o.bind) node.bind=o.bind;
    return node;
  }
  function uiSkinsRow(skins, opts){
    const o=opts||{};
    const list=(skins&&skins.length)?skins:[{id:'default', name:'Default', color:'#9ca3af'}];
    const kids=list.map((sk,i)=>uiSkinSlot(sk.name||sk.id||('Skin '+(i+1)), sk.color||'stroke', i===0, {
      bind:o.bindPrefix? (o.bindPrefix+i):('Skin_'+i),
      slot:sl('Left','Fill',[i?16:0,0,0,0]),
    }));
    return uiStack('H', kids, o.slot||sl('Fill','Top'), o.name||'Available Skins');
  }

  /* Card — the workhorse for upgrades, weapons, classes, loot, difficulty.
     Optional o.binds: {border, bar, kicker, title, body, footL, footR, btn}
     lets runtime Verse SetColor/SetText for ACTIVE selection + live data. */
  function uiCard(w, h, o){
    const B=o.binds||{};
    const kids=[];
    const border=uiRect(o.accent||'stroke', w, h, {opacity:1}, sl('Fill','Fill'), 'Card border');
    if(B.border) border.bind=B.border;
    kids.push(border);
    kids.push(uiRect('panel', w-4, h-4, {opacity:0.97}, sl('Fill','Fill',[2,2,2,2]), 'Card fill'));
    const bar=uiRect(o.accent||'stroke', w-4, 6, {}, sl('Fill','Top',[2,2,2,0]), 'Card rarity bar');
    if(B.bar) bar.bind=B.bar;
    kids.push(bar);
    const body=[];
    if(o.art!==false) body.push(uiRect('panelDeep', w-56, o.artH||160, {opacity:1}, sl('Fill','Top',[0,0,0,18]), 'Art plate'));
    if(o.kicker){
      const k=uiText(o.kicker, {size:'tiny', color:o.accent||'textMute'}, sl('Left','Top',[0,0,0,6]), 'Kicker');
      if(B.kicker) k.bind=B.kicker;
      body.push(k);
    }
    const title=uiText(o.title, {size:'h3', color:'text'}, sl('Left','Top',[0,0,0,10]), 'Card title');
    if(B.title) title.bind=B.title;
    body.push(title);
    if(o.body){
      const bd=uiText(o.body, {size:'small', color:'textDim', wrap:true, wrapWidth:w-56}, sl('Left','Top'), 'Card body');
      if(B.body) bd.bind=B.body;
      body.push(bd);
    }
    if(o.footL||o.footR){
      const fl=o.footL?uiText(o.footL, {size:'body', color:'gold'}, sl('Left','Center'), 'Cost'):uiRect('panel',1,1,{opacity:0},sl('Left','Center'),'—');
      if(o.footL && B.footL) fl.bind=B.footL;
      const fr=o.footR?uiText(o.footR, {size:'small', color:'textMute'}, sl('Right','Center'), 'Meta'):uiRect('panel',1,1,{opacity:0},sl('Right','Center'),'—');
      if(o.footR && B.footR) fr.bind=B.footR;
      body.push(uiOverlay([fl, fr], sl('Fill','Bottom',[0,16,0,0]), 'Card footer'));
    }
    kids.push(uiStack('V', body, sl('Fill','Fill',[28,22,28,22]), 'Card body'));
    const card=uiOverlay(kids, o.slot||null, o.name||('Card · '+o.title));
    if(B.btn){
      card.props=Object.assign(card.props||{}, { asButton:true, variant:'card' });
      card.bind=B.btn;
    }
    return card;
  }

  /* Table-style row for shops and leaderboards.
     Optional o.binds: {bg, accent, title, sub, right, btn} for ACTIVE select. */
  function uiRow(w, h, o){
    const B=o.binds||{};
    const bg=uiRect('row', w, h, {opacity:0.9}, sl('Fill','Fill'), 'Row bg');
    if(B.bg) bg.bind=B.bg;
    const accent=uiRect(o.accent||'stroke', 4, h, {}, sl('Left','Fill'), 'Row accent');
    if(B.accent) accent.bind=B.accent;
    const title=uiText(o.title, {size:'body', color:'text'}, sl('Left','Top',[0,0,0,4]), 'Row title');
    if(B.title) title.bind=B.title;
    const sub=uiText(o.sub||'', {size:'tiny', color:'textDim'}, sl('Left','Top'), 'Row sub');
    if(B.sub) sub.bind=B.sub;
    const right=uiText(o.right||'', {size:'h3', color:o.rightColor||'gold'}, sl('Right','Center',[0,0,28,0]), 'Row value');
    if(B.right) right.bind=B.right;
    const kids=[
      bg, accent,
      uiRect('panelDeep', h-24, h-24, {}, sl('Left','Center',[24,0,0,0]), 'Icon plate'),
      uiStack('V', [title, sub], sl('Left','Center',[24+(h-24)+20,0,0,0]), 'Row text'),
      right,
    ];
    const row=uiOverlay(kids, o.slot||null, o.name||('Row · '+o.title));
    if(B.btn){
      row.props=Object.assign(row.props||{}, { asButton:true, variant:'row' });
      row.bind=B.btn;
    }
    return row;
  }

  function uiTabStrip(labels, active, w, opts){
    const o=opts||{};
    const binds=o.binds||[];
    const tw=Math.floor(w/Math.max(1,labels.length));
    return uiStack('H', labels.map((l,i)=>{
      const tab=uiOverlay([
        uiRect(i===active?'panelAlt':'panelDeep', tw, 56, {opacity:1}, sl('Fill','Fill'), 'Tab bg'),
        uiRect('gold', tw, 4, {opacity:i===active?1:0}, sl('Fill','Bottom'), 'Tab underline'),
        uiText(l, {size:'small', color:i===active?'text':'textMute'}, sl('Center','Center'), 'Tab label'),
      ], sl('Left','Fill'), 'Tab · '+l);
      tab.props={asButton:true, variant:'quiet', state:i===active?'selected':'normal'};
      if(binds[i]) tab.bind=binds[i];
      else tab.bind='Tab'+String(l).replace(/[^A-Za-z0-9]+/g,'');
      return tab;
    }), null, 'Tab strip');
  }

  /* Modal frame: scrim + bordered panel + title + body + button row. */
  function uiModal(w, h, title, sub, bodyNodes, buttons, accent){
    const content=uiStack('V', [
      uiRect(accent||'gold', 56, 4, {}, sl('Left','Top',[0,0,0,14]), 'Rule'),
      uiText(title, {size:'h2', color:'text'}, sl('Left','Top',[0,0,0,6]), 'Modal title'),
      ...(sub?[uiText(sub, {size:'small', color:'textDim', wrap:true, wrapWidth:w-96}, sl('Left','Top',[0,0,0,22]), 'Modal sub')]:[]),
      ...bodyNodes,
      uiStack('H', buttons.map((b,i)=>uiButton(b.text, b.variant||(i===0?'loud':'quiet'), sl('Left','Fill',[i?16:0,0,0,0]))),
        sl('Right','Bottom',[0,26,0,0]), 'Modal buttons'),
    ], sl('Fill','Fill'), 'Modal content');
    return uiScrim([ uiPanel(w, h, [content], {padding:48, stroke:accent||'stroke', name:'Modal panel'}) ]);
  }

  function uiFooterHint(hints){
    return uiStack('H', hints.map((t,i)=>uiText(t, {size:'tiny', color:'textMute'}, sl('Left','Center',[i?36:0,0,0,0]), 'Hint')),
      csBandBottom(40, MX, MX, MY-40), 'Footer hints');
  }

  function uiScreen(id, name, stage, category, notes, verseFolder, verseFile, root){
    return { id, name, stage, category, status:'design', notes,
      verse:{ folder:verseFolder, file:verseFile+'_canvas.verse', klass:verseFile+'_canvas' },
      root };
  }

  /* ====================== the catalogue ====================== */
  function uiSeedScreens(){
    const S=[];

    /* ---------------- BOOT ---------------- */
    S.push(uiScreen('scr_title','Title / Press Start','boot','menu',
      'First frame after load. One action only. Version + build string bottom-left so playtest reports are traceable.',
      'GameDevices/Gameplay/Screens/Boot','title_screen',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiStack('V', [
          uiText('CHRONO', {size:'display', color:'gold', justify:'Center'}, sl('Center','Top'), 'Logo top'),
          uiText('BREAKERS', {size:'display', color:'text', justify:'Center'}, sl('Center','Top',[0,-8,0,0]), 'Logo bottom'),
          uiRect('gold', 260, 3, {}, sl('Center','Top',[0,26,0,26]), 'Rule'),
          uiText('The hourglass is broken. Walk back through it.', {size:'body', color:'textDim', justify:'Center'}, sl('Center','Top'), 'Tagline'),
        ], csCenter(900, 320, 0, -80), 'Logo lockup'),
        uiButton('Press Start', 'loud', csAnchor(0.5,0.5,0,220,420,72,0.5,0.5)),
        uiText('v0.4.1 · build 2318', {size:'tiny', color:'textMute'}, csAnchor(0,1,MX,-MY,400,28,0,1), 'Build stamp'),
      ], null, 'Root')));

    S.push(uiScreen('scr_class_select','Class Select','boot','menu',
      'Three cards. Pressing a card advances — no confirm CTA. Stat deltas as text. Back returns to Title.',
      'GameDevices/Gameplay/Screens/Boot','class_select',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiNavBack('Back'),
        uiPageHeader('Choose your thread','Your starting weapon and one permanent trait.','gold'),
        uiStack('H', [
          uiCard(420, 560, {accent:'elemTime', kicker:'STARTER · SERVICE PISTOL', title:'Archivist', body:'Crits refund 1 second of every cooldown.', footL:'+15% Crit', footR:'Balanced', slot:sl('Left','Fill'),
            binds:{btn:'Class0Btn'}}),
          uiCard(420, 560, {accent:'elemFire', kicker:'STARTER · MACHINE PISTOL', title:'Emberwright', body:'Heat never punishes you — spread stays flat while damage ramps.', footL:'+20% Fire', footR:'Aggressive', slot:sl('Left','Fill',[28,0,0,0]),
            binds:{btn:'Class1Btn'}}),
          uiCard(420, 560, {accent:'elemVoid', kicker:'STARTER · HAND CANNON', title:'Nullwarden', body:'Overpressure rounds pierce one extra target and strip a buff.', footL:'+1 Pierce', footR:'Technical', slot:sl('Left','Fill',[28,0,0,0]),
            binds:{btn:'Class2Btn'}}),
        ], csAnchor(0.5,0,0,260,1376,560,0.5,0), 'Class cards'),
        uiFooterHint(['[A]/[D] Focus card','[Enter] Choose','[Esc] Back']),
      ], null, 'Root')));

    S.push(uiScreen('scr_difficulty','Difficulty Select','boot','menu',
      'Reads Difficulty Menu tab: enemy count %, HP and damage multipliers. Never hide the multipliers. Pressing a row advances (no Confirm). Back returns to Journey / Level Select.',
      'GameDevices/Gameplay/Screens/Boot','difficulty_select',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiNavBack('Back'),
        uiPageHeader('Set the resistance','Difficulty only scales enemies. Your build is never nerfed.','accent'),
        uiStack('H', [
          Object.assign(uiRect('bg', 0, 460, {opacity:0}, sl('Left','Fill'), 'Slide pad'), {bind:'SlidePad'}),
          uiStack('V', [
            uiRow(1200, 132, {accent:'ok', title:'Easy', sub:'75% enemy count · 0.8x HP · 0.8x damage', right:'x0.8', rightColor:'ok', slot:sl('Center','Top',[0,0,0,20]),
              binds:{bg:'Diff0Bg', accent:'Diff0Accent', btn:'Diff0Btn'}}),
            uiRow(1200, 132, {accent:'accent', title:'Normal', sub:'100% enemy count · designed wave counts and baseline tuning', right:'x1.0', rightColor:'accent', slot:sl('Center','Top',[0,0,0,20]),
              binds:{bg:'Diff1Bg', accent:'Diff1Accent', btn:'Diff1Btn'}}),
            uiRow(1200, 132, {accent:'danger', title:'Hard', sub:'150% enemy count · 1.5x HP · 1.35x damage', right:'x1.5', rightColor:'danger', slot:sl('Center','Top'),
              binds:{bg:'Diff2Bg', accent:'Diff2Accent', btn:'Diff2Btn'}}),
          ], sl('Left','Fill'), 'Difficulty rows'),
        ], csAnchor(0.5,0,0,280,1400,460,0.5,0), 'Difficulty track'),
      ], null, 'Root')));

    /* ---------------- HUB ---------------- */
    S.push(uiScreen('scr_hub_hud','Hub HUD','hub','hud',
      'Persistent while walking the Hub. Currency top-right, objective top-left, nothing centre — the centre belongs to the game.',
      'GameDevices/Gameplay/Screens/Hub','hub_hud',
      uiCanvas([
        uiStack('H', [
          uiCurrencyChip('⏳','1,240','curSandGrain','SandText'),
          uiCurrencyChip('💷','86','curTimeEssence','EssenceText'),
        ], csAnchor(1,0,-MX,MY,440,52,1,0), 'Currency rail'),
        uiOverlay([
          uiRect('panelDeep', 460, 74, {opacity:0.8}, sl('Fill','Fill'), 'Objective bg'),
          uiRect('gold', 4, 74, {}, sl('Left','Fill'), 'Objective accent'),
          uiStack('V', [
            uiText('HUB', {size:'tiny', color:'gold'}, sl('Left','Top',[0,0,0,4]), 'Objective kicker'),
            Object.assign(uiText('Talk to Wizard Bob to open the rift', {size:'small', color:'text'}, sl('Left','Top'), 'Objective text'), {bind:'ObjectiveText'}),
          ], sl('Left','Center',[20,0,0,0]), 'Objective stack'),
        ], csBox(MX, MY, 460, 74), 'Objective card'),
        uiFooterHint(['[E] Interact','[Tab] Loadout','[M] Journey']),
      ], null, 'Root')));

    S.push(uiScreen('scr_shop_weapons','Armory','hub','shop',
      'React ShopUI 1:1 via syncArmoryScreenFromWeapons. Listing cards show SLOT·EMPTY/FULL; details show power slots. Fixed five tabs including SCROLLS.',
      'GameDevices/Gameplay/Screens/Shop','shop_weapons',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiText('Armory sync pending…', {size:'h3', color:'textMute', justify:'Center'}, csCenter(600,40,0,0), 'Sync placeholder'),
      ], null, 'Root')));

    S.push(uiScreen('scr_shop_scrolls','Merchant — Wizardry Scrolls','hub','shop',
      'Same frame as the weapon shop, element-coloured. Scrolls are reusable: say so on the card or players hoard them.',
      'GameDevices/Gameplay/Screens/Shop','shop_scrolls',
      uiCanvas([
        uiRect('scrim', UI_STAGE_W, UI_STAGE_H, {opacity:0.82}, csFill(0,0,0,0), 'Scrim'),
        uiPanel(1560, 860, [uiStack('V', [
          uiOverlay([
            uiText('THE SCRIPTORIUM', {size:'h2', color:'text'}, sl('Left','Center'), 'Shop title'),
            uiCurrencyChip('⏳','1,240','curSandGrain','SandText'),
          ], sl('Fill','Top',[0,0,0,20]), 'Shop header'),
          uiTabStrip(['Fire','Ice','Lightning','Void','Time'], 0, 1464),
          uiStack('H', [
            uiCard(340, 520, {accent:'elemFire', kicker:'FIRE · SCROLL · REUSABLE', title:'Cinder Mark', body:'Hits apply Cinder. At 5 stacks the target detonates for 40% of damage dealt.', footL:'180 ⏳', footR:'Stack x5', slot:sl('Left','Top')}),
            uiCard(340, 520, {accent:'elemFire', kicker:'FIRE · SCROLL · REUSABLE', title:'Backdraft', body:'Reloading with a full heat gauge releases a ring of flame around you.', footL:'240 ⏳', footR:'On reload', slot:sl('Left','Top',[26,0,0,0])}),
            uiCard(340, 520, {accent:'elemFire', kicker:'FIRE · CHARGED', title:'Pyre Sigil', body:'Charged shot plants a burning sigil for 6 seconds. Enemies inside take Cinder every 0.5s.', footL:'420 ⏳', footR:'Charged', slot:sl('Left','Top',[26,0,0,0])}),
            uiCard(340, 520, {accent:'stroke', kicker:'LOCKED', title:'???', body:'Reach Journey depth 3 to unlock the fourth Fire scroll.', footL:'—', footR:'Locked', art:true, slot:sl('Left','Top',[26,0,0,0])}),
          ], sl('Fill','Fill',[0,16,0,0]), 'Scroll grid'),
          uiStack('H', [
            uiButton('Buy scroll','loud', sl('Left','Fill')),
            uiButton('Leave','quiet', sl('Left','Fill',[16,0,0,0])),
          ], sl('Right','Bottom',[0,20,0,0]), 'Shop actions'),
        ], sl('Fill','Fill'), 'Shop content')], {padding:36, name:'Shop panel'}),
      ], null, 'Root')));

    S.push(uiScreen('scr_infusion_bench','Infusion Bench (Hub Reroll)','hub','shop',
      'Hub-only reroll, per meta.infusionRerollPolicy. Show the current infusion and the cost before the roll, never after.',
      'GameDevices/Gameplay/Screens/Shop','infusion_bench',
      uiCanvas([
        uiRect('scrim', UI_STAGE_W, UI_STAGE_H, {opacity:0.82}, csFill(0,0,0,0), 'Scrim'),
        uiPanel(1120, 700, [uiStack('V', [
          uiText('INFUSION BENCH', {size:'h2', color:'text'}, sl('Left','Top',[0,0,0,6]), 'Title'),
          uiText('Open power slots only. Locked Time signatures cannot be rerolled.', {size:'small', color:'textDim'}, sl('Left','Top',[0,0,0,28]), 'Subtitle'),
          uiStack('H', [
            uiCard(440, 380, {accent:'elemIce', kicker:'EQUIPPED · SLOT 1', title:'Service Pistol', artH:150, body:'Current infusion: Frost Mark — hits slow by 18% for 2s.', footL:'Reroll: 90 ⏳', footR:'Infusable', slot:sl('Left','Fill')}),
            uiStack('V', [
              uiText('→', {size:'display', color:'gold', justify:'Center'}, sl('Center','Center'), 'Arrow'),
            ], sl('Left','Fill',[36,0,36,0]), 'Arrow col'),
            uiCard(440, 380, {accent:'stroke', kicker:'RESULT', title:'Roll to reveal', artH:150, body:'A random scroll from the elements this weapon supports.', footL:'—', footR:'1 of 4 outcomes', slot:sl('Left','Fill')}),
          ], sl('Fill','Fill'), 'Bench body'),
          uiStack('H', [
            uiButton('Reroll · 90 ⏳','loud', sl('Left','Fill')),
            uiButton('Keep current','quiet', sl('Left','Fill',[16,0,0,0])),
          ], sl('Right','Bottom',[0,24,0,0]), 'Bench actions'),
        ], sl('Fill','Fill'), 'Bench content')], {padding:44, stroke:'elemIce', name:'Bench panel'}),
      ], null, 'Root')));

    S.push(uiScreen('scr_skill_tree','Skill Tree','hub','menu',
      'Mirrors the Progression tab tree. Auto-synced from Progression. Use Write to project for in-game Verse.',
      'GameDevices/Gameplay/Screens/Hub','skill_tree',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiPageHeader('Threads of mastery','Spend skill points. Later nodes stay locked until their prerequisites are filled.','accentAlt'),
        uiText('Syncing skill tree from Progression…', {size:'small', color:'textMute', justify:'Center'}, csBox(MX, 400, 900, 40), 'Tree sync pending'),
      ], null, 'Root')));

    S.push(uiScreen('scr_loadout','Loadout','hub','menu',
      'Weapon slots with their power slot state. An empty slot reads "Empty" — never blank.',
      'GameDevices/Gameplay/Screens/Hub','loadout',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiPageHeader('Loadout','Two weapons. Each open slot takes one scroll.','gold'),
        uiStack('H', [
          uiCard(520, 600, {accent:'rarityEpic', kicker:'PRIMARY · SLOT 1 · FROST MARK', title:'Machine Pistol', artH:200, body:'Full auto on a heat gauge. Accuracy widens as heat climbs but damage climbs with it.', footL:'DPS 214', footR:'Infusable', slot:sl('Left','Fill')}),
          uiCard(520, 600, {accent:'rarityLegendary', kicker:'SECONDARY · SIGNATURE LOCKED', title:'Hourglass', artH:200, body:'Damage scales with missing health. Kills chamber a round instantly, no reload.', footL:'DPS 180', footR:'Locked power', slot:sl('Left','Fill',[40,0,0,0])}),
          uiStack('V', [
            uiRow(400, 96, {accent:'elemIce', title:'Frost Mark', sub:'Equipped · Slot 1', right:'✓', rightColor:'ok', slot:sl('Left','Top',[0,0,0,14])}),
            uiRow(400, 96, {accent:'elemFire', title:'Cinder Mark', sub:'In pack', right:'', slot:sl('Left','Top',[0,0,0,14])}),
            uiRow(400, 96, {accent:'elemVoid', title:'Null Field', sub:'In pack', right:'', slot:sl('Left','Top')}),
          ], sl('Left','Top',[40,0,0,0]), 'Scroll pack'),
        ], csAnchor(0.5,0,0,270,1560,600,0.5,0), 'Loadout body'),
        uiFooterHint(['[Tab] Close','[Enter] Equip scroll','[X] Unequip']),
      ], null, 'Root')));

    S.push(uiScreen('scr_journey_map','Journey / Level Select','hub','menu',
      'Run route. Threat and reward are on the node. Pressing a level card advances to Difficulty (no Enter CTA). Back closes to Hub.',
      'GameDevices/Gameplay/Screens/Hub','journey_map',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiNavBack('Back'),
        uiPageHeader('The Journey','Pick the next fracture. You cannot come back for the one you skipped.','gold'),
        uiStack('H', [
          Object.assign(uiRect('bg', 0, 480, {opacity:0}, sl('Left','Fill'), 'Slide pad'), {bind:'SlidePad'}),
          uiCard(400, 480, {accent:'ok', kicker:'DEPTH 1 · THREAT 3', title:'The Warrens', artH:170, body:'Tight corridors. Melee-heavy. Guaranteed scroll drop.', footL:'⏳ 180–240', footR:'Open', slot:sl('Left','Fill'),
            binds:{border:'Level0Border', bar:'Level0Bar', kicker:'Level0Kicker', title:'Level0Title', body:'Level0Desc', footL:'Level0Reward', footR:'Level0Meta', btn:'Level0Btn'}}),
          uiCard(400, 480, {accent:'gold', kicker:'DEPTH 2 · THREAT 4', title:'Arcane Vault', artH:170, body:'Casters behind shields. Bring a piercing weapon.', footL:'⏳ 260–320', footR:'Open', slot:sl('Left','Fill',[32,0,0,0]),
            binds:{border:'Level1Border', bar:'Level1Bar', kicker:'Level1Kicker', title:'Level1Title', body:'Level1Desc', footL:'Level1Reward', footR:'Level1Meta', btn:'Level1Btn'}}),
          uiCard(400, 480, {accent:'danger', kicker:'DEPTH 3 · THREAT 5 · BOSS', title:'Throne of the Hooker King', artH:170, body:'Two phases. Adds spawn on phase change.', footL:'💷 8–12', footR:'Locked', slot:sl('Left','Fill',[32,0,0,0]),
            binds:{border:'Level2Border', bar:'Level2Bar', kicker:'Level2Kicker', title:'Level2Title', body:'Level2Desc', footL:'Level2Reward', footR:'Level2Meta', btn:'Level2Btn'}}),
        ], csAnchor(0.5,0,0,280,1400,480,0.5,0), 'Route track'),
      ], null, 'Root')));


    S.push(uiScreen('scr_ready_up','Ready Up','hub','menu',
      'Lobby gate after difficulty. Roster rows update live. READY toggles; Cancel leaves the queue. Matches Chronomancer page chrome.',
      'GameDevices/Gameplay/Screens/Hub','ready_up',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiPageHeader('Ready up','Everyone locks in before the fracture opens.','gold'),
        uiStack('H', [
          Object.assign(uiRect('bg', 0, 520, {opacity:0}, sl('Left','Fill'), 'Slide pad'), {bind:'SlidePad'}),
          uiPanel(1100, 520, [uiStack('V', [
            uiStack('H', [
              Object.assign(uiText('THE WARRENS', {size:'h2', color:'text'}, sl('Left','Center'), 'Level name'), {bind:'LevelNameText'}),
              Object.assign(uiText('NORMAL', {size:'h3', color:'accent'}, sl('Right','Center'), 'Difficulty'), {bind:'DifficultyText'}),
            ], sl('Fill','Top',[0,0,0,18]), 'Run summary'),
            Object.assign(uiText('Players: 1  (0/1 ready)', {size:'small', color:'textDim'}, sl('Left','Top',[0,0,0,20]), 'Roster count'), {bind:'RosterCountText'}),
            uiStack('V', [
              uiOverlay([
                uiRect('row', 1004, 72, {opacity:0.9}, sl('Fill','Fill'), 'Row bg'),
                uiRect('gold', 4, 72, {}, sl('Left','Fill'), 'Row accent'),
                Object.assign(uiText('Player 1', {size:'body', color:'text'}, sl('Left','Center',[24,0,0,0]), 'Name'), {bind:'Roster0Name'}),
                Object.assign(uiText('NOT READY', {size:'small', color:'textMute'}, sl('Right','Center',[0,0,24,0]), 'Status'), {bind:'Roster0Status'}),
              ], sl('Fill','Top',[0,0,0,10]), 'Roster row 0'),
              uiOverlay([
                uiRect('row', 1004, 72, {opacity:0.9}, sl('Fill','Fill'), 'Row bg'),
                uiRect('stroke', 4, 72, {}, sl('Left','Fill'), 'Row accent'),
                Object.assign(uiText('Player 2', {size:'body', color:'textMute'}, sl('Left','Center',[24,0,0,0]), 'Name'), {bind:'Roster1Name'}),
                Object.assign(uiText('—', {size:'small', color:'textMute'}, sl('Right','Center',[0,0,24,0]), 'Status'), {bind:'Roster1Status'}),
              ], sl('Fill','Top',[0,0,0,10]), 'Roster row 1'),
              uiOverlay([
                uiRect('row', 1004, 72, {opacity:0.9}, sl('Fill','Fill'), 'Row bg'),
                uiRect('stroke', 4, 72, {}, sl('Left','Fill'), 'Row accent'),
                Object.assign(uiText('Player 3', {size:'body', color:'textMute'}, sl('Left','Center',[24,0,0,0]), 'Name'), {bind:'Roster2Name'}),
                Object.assign(uiText('—', {size:'small', color:'textMute'}, sl('Right','Center',[0,0,24,0]), 'Status'), {bind:'Roster2Status'}),
              ], sl('Fill','Top',[0,0,0,10]), 'Roster row 2'),
              uiOverlay([
                uiRect('row', 1004, 72, {opacity:0.9}, sl('Fill','Fill'), 'Row bg'),
                uiRect('stroke', 4, 72, {}, sl('Left','Fill'), 'Row accent'),
                Object.assign(uiText('Player 4', {size:'body', color:'textMute'}, sl('Left','Center',[24,0,0,0]), 'Name'), {bind:'Roster3Name'}),
                Object.assign(uiText('—', {size:'small', color:'textMute'}, sl('Right','Center',[0,0,24,0]), 'Status'), {bind:'Roster3Status'}),
              ], sl('Fill','Top'), 'Roster row 3'),
            ], sl('Fill','Fill',[0,0,0,24]), 'Roster list'),
            uiStack('H', [
              Object.assign(uiButton('READY','loud', sl('Left','Fill')), {bind:'ReadyBtn'}),
              Object.assign(uiButton('Cancel','quiet', sl('Left','Fill',[16,0,0,0])), {bind:'CancelBtn'}),
            ], sl('Right','Bottom'), 'Ready actions'),
          ], sl('Fill','Fill'), 'Ready content')], {padding:40, name:'Ready panel'}),
        ], csAnchor(0.5,0,0,240,1200,560,0.5,0), 'Ready track'),
      ], null, 'Root')));

    S.push(uiScreen('scr_npc_dialogue','NPC Dialogue','hub','dialog',
      'Bottom-third band so the world stays visible. Portrait left, name plate above the text, choices right-aligned.',
      'GameDevices/Gameplay/Screens/Hub','npc_dialogue',
      uiCanvas([
        uiOverlay([
          uiRect('panelDeep', UI_STAGE_W, 320, {opacity:0.94}, sl('Fill','Fill'), 'Band bg'),
          uiRect('gold', UI_STAGE_W, 3, {}, sl('Fill','Top'), 'Band top rule'),
          uiStack('H', [
            uiOverlay([
              uiRect('gold', 200, 200, {}, sl('Fill','Fill'), 'Portrait border'),
              uiRect('panel', 194, 194, {}, sl('Fill','Fill',[3,3,3,3]), 'Portrait fill'),
              uiImage('Textures.T_Empty', 180, 180, {tint:'gold'}, sl('Center','Center'), 'Portrait'),
            ], sl('Left','Center'), 'Portrait frame'),
            uiStack('V', [
              Object.assign(uiText('WIZARD BOB', {size:'h3', color:'gold'}, sl('Left','Top',[0,0,0,12]), 'Speaker'), {bind:'SpeakerText'}),
              Object.assign(uiText('You broke it, then. Everyone does. The trick is not the breaking —\nit is walking back through without becoming someone else.', {size:'body', color:'text', wrap:true, wrapWidth:1000}, sl('Left','Top'), 'Line'), {bind:'LineText'}),
            ], sl('Left','Top',[32,0,0,0]), 'Speech'),
            uiStack('V', [
              uiButton('Open the rift','loud', sl('Right','Top')),
              uiButton('Tell me about scrolls','quiet', sl('Right','Top',[0,12,0,0])),
              uiButton('Later','quiet', sl('Right','Top',[0,12,0,0])),
            ], sl('Right','Center',[24,0,0,0]), 'Choices'),
          ], sl('Fill','Fill',[MX,42,MX,42]), 'Band content'),
        ], csBandBottom(320,0,0,0), 'Dialogue band'),
      ], null, 'Root')));

    /* ---------------- RUN / COMBAT ---------------- */
    S.push(uiScreen('scr_run_hud','In-Run HUD','run','hud',
      'The only screen the player stares at for 20 minutes. Corners only: health bottom-left, ammo bottom-right, objective top-left, currency top-right. Centre stays empty.',
      'GameDevices/Gameplay/Screens/Run','run_hud',
      uiCanvas([
        /* health + shield */
        uiStack('V', [
          uiStack('H', [
            Object.assign(uiText('148', {size:'h2', color:'text'}, sl('Left','Bottom'), 'HP value'), {bind:'HealthText'}),
            uiText('/ 200', {size:'small', color:'textMute'}, sl('Left','Bottom',[8,0,0,6]), 'HP max'),
          ], sl('Left','Top',[0,0,0,8]), 'HP row'),
          uiBar(420, 22, 'hp', 0.74, 'Health bar'),
          uiBar(420, 10, 'shield', 0.45, 'Shield bar'),
        ], csAnchor(0,1,MX,-MY-8,420,120,0,1), 'Vitals'),
        /* abilities */
        uiStack('H', [
          uiOverlay([ uiRect('stroke',84,84,{},sl('Fill','Fill'),'Border'), uiRect('panelDeep',80,80,{},sl('Fill','Fill',[2,2,2,2]),'Fill'), uiText('Q',{size:'h3',color:'elemIce'},sl('Center','Center'),'Key') ], sl('Left','Fill'), 'Ability Q'),
          uiOverlay([ uiRect('stroke',84,84,{},sl('Fill','Fill'),'Border'), uiRect('panelDeep',80,80,{},sl('Fill','Fill',[2,2,2,2]),'Fill'), uiText('E',{size:'h3',color:'elemVoid'},sl('Center','Center'),'Key') ], sl('Left','Fill',[14,0,0,0]), 'Ability E'),
          uiOverlay([ uiRect('gold',84,84,{},sl('Fill','Fill'),'Border'), uiRect('panelDeep',80,80,{},sl('Fill','Fill',[2,2,2,2]),'Fill'), uiText('R',{size:'h3',color:'gold'},sl('Center','Center'),'Key') ], sl('Left','Fill',[14,0,0,0]), 'Ultimate R'),
        ], csAnchor(0,1,MX+460,-MY-8,290,84,0,1), 'Ability rail'),
        /* ammo */
        uiStack('V', [
          uiStack('H', [
            Object.assign(uiText('17', {size:'display', color:'text'}, sl('Right','Bottom'), 'Ammo mag'), {bind:'AmmoText'}),
            uiText('/ 108', {size:'h3', color:'textMute'}, sl('Right','Bottom',[10,0,0,10]), 'Ammo reserve'),
          ], sl('Right','Top',[0,0,0,4]), 'Ammo row'),
          uiText('MACHINE PISTOL · FROST MARK', {size:'tiny', color:'elemIce'}, sl('Right','Top'), 'Weapon name'),
        ], csAnchor(1,1,-MX,-MY-8,460,120,1,1), 'Ammo block'),
        /* objective */
        uiOverlay([
          uiRect('panelDeep', 440, 78, {opacity:0.8}, sl('Fill','Fill'), 'Objective bg'),
          uiRect('gold', 4, 78, {}, sl('Left','Fill'), 'Objective accent'),
          uiStack('V', [
            uiText('ARCANE VAULT · DEPTH 2', {size:'tiny', color:'gold'}, sl('Left','Top',[0,0,0,4]), 'Objective kicker'),
            Object.assign(uiText('Wave 3 of 5 · 11 remaining', {size:'body', color:'text'}, sl('Left','Top'), 'Objective text'), {bind:'ObjectiveText'}),
          ], sl('Left','Center',[20,0,0,0]), 'Objective stack'),
        ], csBox(MX, MY, 440, 78), 'Objective card'),
        /* currency */
        uiStack('H', [
          uiCurrencyChip('⏳','412','curSandGrain','SandText'),
        ], csAnchor(1,0,-MX,MY,210,52,1,0), 'Currency rail'),
        /* crosshair-adjacent hit feed */
        uiStack('V', [
          uiText('+40  Cinder detonation', {size:'small', color:'elemFire', justify:'Right'}, sl('Right','Top',[0,0,0,4]), 'Feed 1'),
          uiText('+18  Crit', {size:'small', color:'gold', justify:'Right'}, sl('Right','Top',[0,0,0,4]), 'Feed 2'),
          uiText('+12', {size:'small', color:'textDim', justify:'Right'}, sl('Right','Top'), 'Feed 3'),
        ], csAnchor(1,0.5,-MX,-60,400,120,1,0), 'Damage feed'),
      ], null, 'Root')));

    S.push(uiScreen('scr_wave_banner','Wave / Objective Banner','run','overlay',
      'Fires for ~2s at wave start. Upper third so it never covers the reticle. Animate opacity only.',
      'GameDevices/Gameplay/Screens/Run','wave_banner',
      uiCanvas([
        uiOverlay([
          uiRect('panelDeep', 900, 118, {opacity:0.85}, sl('Fill','Fill'), 'Banner bg'),
          uiRect('gold', 900, 3, {}, sl('Fill','Top'), 'Top rule'),
          uiRect('gold', 900, 3, {}, sl('Fill','Bottom'), 'Bottom rule'),
          uiStack('V', [
            Object.assign(uiText('WAVE 3', {size:'h1', color:'gold', justify:'Center'}, sl('Center','Top',[0,0,0,2]), 'Banner title'), {bind:'WaveText'}),
            uiText('ARMOURED CASTERS INCOMING', {size:'small', color:'textDim', justify:'Center'}, sl('Center','Top'), 'Banner sub'),
          ], sl('Center','Center'), 'Banner text'),
        ], csAnchor(0.5,0,0,220,900,118,0.5,0), 'Banner'),
      ], null, 'Root')));

    S.push(uiScreen('scr_boss_bar','Boss Health Bar','combat','overlay',
      'Top-centre, phase pips above the bar. Never stack the boss bar on top of the objective card.',
      'GameDevices/Gameplay/Screens/Run','boss_bar',
      uiCanvas([
        uiStack('V', [
          Object.assign(uiText('BOSS', {size:'h2', color:'danger', justify:'Center'}, sl('Center','Top',[0,0,0,6]), 'Boss name'), {bind:'BossNameText'}),
          uiStack('H', [
            uiRect('danger', 180, 6, {}, sl('Left','Center',[0,0,6,0]), 'Phase 1'),
            uiRect('danger', 180, 6, {}, sl('Left','Center',[0,0,6,0]), 'Phase 2'),
            uiRect('stroke', 180, 6, {}, sl('Left','Center'), 'Phase 3'),
          ], sl('Center','Top',[0,0,0,8]), 'Phase pips'),
          uiOverlay([
            uiRect('panelDeep', 1100, 30, {opacity:0.95}, sl('Fill','Fill'), 'Track'),
            Object.assign(uiRect('danger', 660, 30, {}, sl('Left','Fill'), 'Fill'), {bind:'BossFill'}),
            uiRect('stroke', 1100, 30, {opacity:0}, sl('Fill','Fill'), 'Track edge'),
          ], sl('Center','Top'), 'Boss bar'),
        ], csAnchor(0.5,0,0,64,1100,140,0.5,0), 'Boss block'),
      ], null, 'Root')));

    S.push(uiScreen('scr_boss_defeated','Boss Defeated','combat','overlay',
      '~3s after boss kill. Centre banner. No buttons — InputMode.None.',
      'GameDevices/Gameplay/Screens/Run','boss_defeated',
      uiCanvas([
        uiOverlay([
          uiRect('panelDeep', 900, 140, {opacity:0.9}, sl('Fill','Fill'), 'Banner bg'),
          uiRect('gold', 900, 3, {}, sl('Fill','Top'), 'Top rule'),
          uiRect('gold', 900, 3, {}, sl('Fill','Bottom'), 'Bottom rule'),
          uiStack('V', [
            Object.assign(uiText('BOSS DEFEATED', {size:'h1', color:'gold', justify:'Center'}, sl('Center','Top',[0,0,0,4]), 'Defeat title'), {bind:'DefeatTitleText'}),
            Object.assign(uiText('SUN WUKONG', {size:'h2', color:'text', justify:'Center'}, sl('Center','Top'), 'Boss name'), {bind:'BossNameText'}),
          ], sl('Center','Center'), 'Banner text'),
        ], csAnchor(0.5,0.5,0,0,900,140,0.5,0.5), 'Banner'),
      ], null, 'Root')));

    S.push(uiScreen('scr_interact_prompt','Interaction Prompt','run','overlay',
      'Anchored just below centre so it reads without covering the target. Key glyph, then verb, then noun.',
      'GameDevices/Gameplay/Screens/Run','interact_prompt',
      uiCanvas([
        uiStack('H', [
          uiOverlay([
            uiRect('text', 48, 48, {}, sl('Fill','Fill'), 'Key border'),
            uiRect('panelDeep', 44, 44, {}, sl('Fill','Fill',[2,2,2,2]), 'Key fill'),
            uiText('E', {size:'body', color:'text'}, sl('Center','Center'), 'Key glyph'),
          ], sl('Left','Center'), 'Key cap'),
          Object.assign(uiText('Take  ·  Cinder Mark (Scroll)', {size:'body', color:'text'}, sl('Left','Center',[16,0,0,0]), 'Prompt text'), {bind:'PromptText'}),
        ], csAnchor(0.5,0.5,0,150,560,48,0.5,0.5), 'Prompt'),
      ], null, 'Root')));

    S.push(uiScreen('scr_toast','Pickup / Reward Toasts','run','overlay',
      'Stack upward from bottom-centre-right, max 4, 2.5s each. One line per toast — if it needs two lines it is a popup, not a toast.',
      'GameDevices/Gameplay/Screens/Run','toast_feed',
      uiCanvas([
        uiStack('V', [
          uiOverlay([ uiRect('panelDeep',420,52,{opacity:0.9},sl('Fill','Fill'),'Toast bg'), uiRect('gold',4,52,{},sl('Left','Fill'),'Accent'),
            uiText('+120 ⏳  Grain of Sand',{size:'small',color:'text'},sl('Left','Center',[18,0,0,0]),'Toast text') ], sl('Right','Top',[0,0,0,10]), 'Toast 1'),
          uiOverlay([ uiRect('panelDeep',420,52,{opacity:0.9},sl('Fill','Fill'),'Toast bg'), uiRect('elemIce',4,52,{},sl('Left','Fill'),'Accent'),
            uiText('Scroll found · Frost Mark',{size:'small',color:'text'},sl('Left','Center',[18,0,0,0]),'Toast text') ], sl('Right','Top',[0,0,0,10]), 'Toast 2'),
          uiOverlay([ uiRect('panelDeep',420,52,{opacity:0.9},sl('Fill','Fill'),'Toast bg'), uiRect('ok',4,52,{},sl('Left','Fill'),'Accent'),
            uiText('Objective complete',{size:'small',color:'text'},sl('Left','Center',[18,0,0,0]),'Toast text') ], sl('Right','Top'), 'Toast 3'),
        ], csAnchor(1,1,-MX,-260,420,180,1,1), 'Toast stack'),
      ], null, 'Root')));

    /* ---------------- POPUPS ---------------- */
    S.push(uiScreen('scr_upgrade_choice','Upgrade Choice (1 of 3)','popup','popup',
      'The core roguelike beat. Three cards, no reroll unless earned, no timer. Rarity colour on the top bar and the border only.',
      'GameDevices/Gameplay/Screens/Popup','upgrade_choice',
      uiCanvas([
        uiRect('scrim', UI_STAGE_W, UI_STAGE_H, {opacity:0.78}, csFill(0,0,0,0), 'Scrim'),
        uiStack('V', [
          uiText('CHOOSE ONE', {size:'h1', color:'text', justify:'Center'}, sl('Center','Top',[0,0,0,4]), 'Title'),
          uiText('The thread only holds one change per fracture.', {size:'small', color:'textDim', justify:'Center'}, sl('Center','Top'), 'Subtitle'),
        ], csAnchor(0.5,0,0,150,900,110,0.5,0), 'Header'),
        uiStack('H', [
          uiCard(380, 520, {accent:'rarityRare', kicker:'RARE · OFFENCE', title:'Overpressure', body:'Every reload chambers a round that pierces one extra target.', footL:'Stacks: 1', footR:'Weapon', slot:sl('Left','Fill')}),
          uiCard(380, 520, {accent:'rarityEpic', kicker:'EPIC · ELEMENT', title:'Cinder Cascade', body:'Cinder detonations apply 2 Cinder stacks to everything within 4m.', footL:'Stacks: 0', footR:'Fire', slot:sl('Left','Fill',[36,0,0,0])}),
          uiCard(380, 520, {accent:'rarityLegendary', kicker:'LEGENDARY · TIME', title:'Second Draft', body:'Once per room, dying instead rewinds you 3 seconds at 30% health.', footL:'Unique', footR:'Time', slot:sl('Left','Fill',[36,0,0,0])}),
        ], csCenter(1252, 520, 0, 40), 'Upgrade cards'),
        uiStack('H', [
          uiButton('Reroll · 1 ⏳','quiet', sl('Left','Fill')),
          uiButton('Skip (+40 ⏳)','quiet', sl('Left','Fill',[16,0,0,0])),
        ], csAnchor(0.5,1,0,-MY,520,60,0.5,1), 'Secondary actions'),
      ], null, 'Root')));

    S.push(uiScreen('scr_loot_popup','Loot / Drop Reward','popup','popup',
      'Fires on a guaranteed or boss drop. Rarity drives the border. Take is loud, Discard is quiet — never the reverse.',
      'GameDevices/Gameplay/Screens/Popup','loot_popup',
      uiModal(760, 560, 'FRACTURE DROP', 'From the Hooker King · guaranteed table', [
        uiCard(620, 300, {accent:'rarityLegendary', kicker:'LEGENDARY SCROLL · REUSABLE', title:'Hourglass Sigil', artH:120,
          body:'Charged shots freeze the target in a stopped second for 1.2s. Damage taken during the stop lands all at once when it ends.',
          footL:'Slot: any open', footR:'Time', slot:sl('Center','Top',[0,0,0,0])}),
      ], [{text:'Take'},{text:'Discard'}], 'rarityLegendary')));

    S.push(uiScreen('scr_levelup','Level Up','popup','popup',
      'Short, celebratory, dismissible. It grants points; it does not make the player spend them here.',
      'GameDevices/Gameplay/Screens/Popup','level_up',
      uiModal(680, 420, 'LEVEL 7', 'Your thread thickens.', [
        uiStack('V', [
          uiRow(584, 88, {accent:'accentAlt', title:'+1 Skill Point', sub:'Spend it in the Hub skill tree', right:'4 total', rightColor:'accentAlt', slot:sl('Center','Top',[0,0,0,14])}),
          uiRow(584, 88, {accent:'hp', title:'+10 Max Health', sub:'Applied immediately', right:'210', rightColor:'hp', slot:sl('Center','Top')}),
        ], sl('Fill','Top'), 'Rewards'),
      ], [{text:'Continue'},{text:'Open skill tree', variant:'quiet'}], 'accentAlt')));

    S.push(uiScreen('scr_purchase_confirm','Purchase Confirm','popup','popup',
      'Only for spends above a threshold or for locked-signature weapons. Show balance before and after — always both.',
      'GameDevices/Gameplay/Screens/Popup','purchase_confirm',
      uiModal(640, 400, 'CONFIRM PURCHASE', 'Machine Pistol · Epic · infusable, 1 open slot', [
        uiStack('V', [
          uiRow(544, 76, {accent:'gold', title:'Price', sub:'Grain of Sand', right:'510 ⏳', slot:sl('Center','Top',[0,0,0,12])}),
          uiRow(544, 76, {accent:'stroke', title:'Balance after', sub:'From 1,240', right:'730 ⏳', rightColor:'textDim', slot:sl('Center','Top')}),
        ], sl('Fill','Top'), 'Ledger'),
      ], [{text:'Buy'},{text:'Cancel'}], 'gold')));

    S.push(uiScreen('scr_insufficient','Insufficient Funds','popup','popup',
      'Tell the player exactly how short they are, and where that currency comes from. Never just "not enough".',
      'GameDevices/Gameplay/Screens/Popup','insufficient_funds',
      uiModal(600, 340, 'NOT ENOUGH SAND', 'You are 270 ⏳ short of the Machine Pistol.', [
        uiStack('V', [
          uiRow(504, 76, {accent:'danger', title:'You have', sub:'Grain of Sand', right:'240 ⏳', rightColor:'danger', slot:sl('Center','Top',[0,0,0,12])}),
          uiRow(504, 76, {accent:'ok', title:'Best source', sub:'Arcane Vault clear · depth 2', right:'~300 ⏳', rightColor:'ok', slot:sl('Center','Top')}),
        ], sl('Fill','Top'), 'Ledger'),
      ], [{text:'Got it'}], 'danger')));

    S.push(uiScreen('scr_confirm','Generic Confirm','popup','popup',
      'One reusable modal for every destructive action. Destructive verb on the loud button, never "Yes".',
      'GameDevices/Gameplay/Screens/Popup','confirm_modal',
      uiModal(560, 300, 'ABANDON RUN?', 'You keep Time Essence earned so far. Everything else in this run is lost.', [],
        [{text:'Abandon run'},{text:'Keep playing'}], 'danger')));

    /* ---------------- END OF RUN ---------------- */
    S.push(uiScreen('scr_room_clear','Room Cleared','end','popup',
      'Brief beat between rooms. Rewards, then straight into the upgrade choice — do not make the player click twice.',
      'GameDevices/Gameplay/Screens/End','room_clear',
      uiModal(720, 480, 'ROOM CLEARED', 'Arcane Vault · wave 5 of 5 · 01:47', [
        uiStack('V', [
          uiRow(624, 76, {accent:'gold', title:'Grain of Sand', sub:'Kills + clear bonus', right:'+312 ⏳', slot:sl('Center','Top',[0,0,0,12])}),
          uiRow(624, 76, {accent:'accentAlt', title:'Experience', sub:'23 kills · 4 elites', right:'+1,840', rightColor:'accentAlt', slot:sl('Center','Top',[0,0,0,12])}),
          uiRow(624, 76, {accent:'ok', title:'No damage bonus', sub:'Took 0 damage in wave 4', right:'+50 ⏳', rightColor:'ok', slot:sl('Center','Top')}),
        ], sl('Fill','Top'), 'Rewards'),
      ], [{text:'Continue'}], 'ok')));

    S.push(uiScreen('scr_run_death','Run Failed','end','menu',
      'The most-read screen in a roguelike. Lead with what carries over, not with the failure.',
      'GameDevices/Gameplay/Screens/End','run_death',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiStack('V', [
          uiText('THE THREAD SNAPPED', {size:'h1', color:'danger', justify:'Center'}, sl('Center','Top',[0,0,0,8]), 'Title'),
          uiText('Depth 2 · Arcane Vault · killed by Vault Warden', {size:'small', color:'textDim', justify:'Center'}, sl('Center','Top'), 'Subtitle'),
        ], csAnchor(0.5,0,0,140,1000,110,0.5,0), 'Header'),
        uiPanel(1160, 460, [uiStack('V', [
          uiText('CARRIES OVER', {size:'tiny', color:'gold'}, sl('Left','Top',[0,0,0,14]), 'Section'),
          uiRow(1064, 84, {accent:'curTimeEssence', title:'Time Essence', sub:'Permanent meta currency', right:'+9 💷', rightColor:'curTimeEssence', slot:sl('Center','Top',[0,0,0,12])}),
          uiRow(1064, 84, {accent:'accentAlt', title:'Player level', sub:'Level 6 → 7 · +1 skill point', right:'+1,840 XP', rightColor:'accentAlt', slot:sl('Center','Top',[0,0,0,22])}),
          uiText('LOST', {size:'tiny', color:'textMute'}, sl('Left','Top',[0,0,0,14]), 'Section 2'),
          uiRow(1064, 84, {accent:'stroke', title:'Grain of Sand · weapons · scrolls', sub:'Run-scoped, as designed', right:'−1,240 ⏳', rightColor:'textMute', slot:sl('Center','Top')}),
        ], sl('Fill','Fill'), 'Summary')], {padding:32, name:'Summary panel', slot:csAnchor(0.5,0,0,290,1160,460,0.5,0)}),
        uiStack('H', [
          uiButton('Run it again','loud', sl('Left','Fill')),
          uiButton('Back to Hub','quiet', sl('Left','Fill',[20,0,0,0])),
        ], csAnchor(0.5,1,0,-MY,760,72,0.5,1), 'Actions'),
      ], null, 'Root')));

    S.push(uiScreen('scr_run_victory','Run Complete','end','menu',
      'Same skeleton as Run Failed so the eye lands in the same place. Gold instead of red, and a rank.',
      'GameDevices/Gameplay/Screens/End','run_victory',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiStack('V', [
          uiText('THE HOURGLASS TURNS', {size:'h1', color:'gold', justify:'Center'}, sl('Center','Top',[0,0,0,8]), 'Title'),
          uiText('Run complete · 3 fractures · 24:16 · Normal', {size:'small', color:'textDim', justify:'Center'}, sl('Center','Top'), 'Subtitle'),
        ], csAnchor(0.5,0,0,140,1000,110,0.5,0), 'Header'),
        uiStack('H', [
          uiCard(360, 420, {accent:'gold', kicker:'RANK', title:'A', artH:150, body:'Cleared without a full wipe of your scroll pack.', footL:'Next: S', footR:'No damage x2', slot:sl('Left','Fill')}),
          uiCard(360, 420, {accent:'curTimeEssence', kicker:'EARNED', title:'26 💷', artH:150, body:'Time Essence carries into the Hub and the skill tree.', footL:'Best: 31', footR:'Meta', slot:sl('Left','Fill',[32,0,0,0])}),
          uiCard(360, 420, {accent:'accentAlt', kicker:'PROGRESS', title:'Level 9', artH:150, body:'+4,120 XP · 3 skill points unspent.', footL:'+3 points', footR:'Tree', slot:sl('Left','Fill',[32,0,0,0])}),
        ], csAnchor(0.5,0,0,300,1144,420,0.5,0), 'Summary cards'),
        uiButton('Return to Hub','loud', csAnchor(0.5,1,0,-MY,420,72,0.5,1)),
      ], null, 'Root')));

    /* ---------------- SYSTEM ---------------- */
    S.push(uiScreen('scr_pause','Pause Menu','end','menu',
      'Left rail of verbs, right pane of run state. Resume is always first and always focused.',
      'GameDevices/Gameplay/Screens/System','pause_menu',
      uiCanvas([
        uiRect('scrim', UI_STAGE_W, UI_STAGE_H, {opacity:0.8}, csFill(0,0,0,0), 'Scrim'),
        uiPanel(1200, 640, [uiStack('H', [
          uiStack('V', [
            uiText('PAUSED', {size:'h2', color:'text'}, sl('Left','Top',[0,0,0,28]), 'Title'),
            uiButton('Resume','loud', sl('Left','Top',[0,0,0,14])),
            uiButton('Settings','quiet', sl('Left','Top',[0,0,0,14])),
            uiButton('Controls','quiet', sl('Left','Top',[0,0,0,14])),
            uiButton('Abandon run','quiet', sl('Left','Top')),
          ], sl('Left','Fill'), 'Verb rail'),
          uiStack('V', [
            uiText('THIS RUN', {size:'tiny', color:'gold'}, sl('Left','Top',[0,0,0,14]), 'Section'),
            uiRow(640, 76, {accent:'gold', title:'Depth 2 · Arcane Vault', sub:'Wave 3 of 5', right:'11:20', slot:sl('Left','Top',[0,0,0,12])}),
            uiRow(640, 76, {accent:'rarityEpic', title:'Machine Pistol', sub:'Frost Mark infusion', right:'DPS 214', rightColor:'rarityEpic', slot:sl('Left','Top',[0,0,0,12])}),
            uiRow(640, 76, {accent:'curSandGrain', title:'Grain of Sand', sub:'Spendable at the next merchant', right:'412 ⏳', slot:sl('Left','Top')}),
          ], sl('Left','Fill',[56,0,0,0]), 'Run state'),
        ], sl('Fill','Fill'), 'Pause body')], {padding:44, name:'Pause panel'}),
      ], null, 'Root')));

    S.push(uiScreen('scr_settings','Settings','end','menu',
      'Grouped rows, value right-aligned. Every row shows its current value as text — sliders alone are unreadable on a TV.',
      'GameDevices/Gameplay/Screens/System','settings_menu',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiPageHeader('Settings','Applies immediately. Nothing here needs a confirm.','accent'),
        uiPanel(1300, 620, [uiStack('V', [
          uiTabStrip(['Audio','Video','Controls','Accessibility'], 0, 1204),
          uiRow(1204, 82, {accent:'accent', title:'Master volume', sub:'All audio', right:'80%', rightColor:'accent', slot:sl('Left','Top',[0,18,0,0])}),
          uiRow(1204, 82, {accent:'stroke', title:'Music volume', sub:'Score and hub ambience', right:'55%', rightColor:'textDim', slot:sl('Left','Top',[0,12,0,0])}),
          uiRow(1204, 82, {accent:'stroke', title:'Hit feedback', sub:'Damage numbers in the run HUD', right:'On', rightColor:'ok', slot:sl('Left','Top',[0,12,0,0])}),
          uiRow(1204, 82, {accent:'stroke', title:'Screen shake', sub:'Reduce for motion sensitivity', right:'50%', rightColor:'textDim', slot:sl('Left','Top')}),
        ], sl('Fill','Fill'), 'Settings body')], {padding:32, name:'Settings panel', slot:csAnchor(0.5,0,0,250,1300,620,0.5,0)}),
        uiFooterHint(['[↑/↓] Row','[←/→] Adjust','[Esc] Back']),
      ], null, 'Root')));

    S.push(uiScreen('scr_leaderboard','Leaderboard','end','menu',
      'Own row pinned and highlighted, even when off-page. A board you are not on is a board you ignore.',
      'GameDevices/Gameplay/Screens/System','leaderboard',
      uiCanvas([
        uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
        uiPageHeader('Deepest fractures','Ranked by depth, then by clear time.','gold'),
        uiPanel(1300, 600, [uiStack('V', [
          uiRow(1204, 78, {accent:'gold', title:'1 · Wrenfold', sub:'Depth 7 · Hard', right:'21:04', slot:sl('Left','Top',[0,0,0,10])}),
          uiRow(1204, 78, {accent:'rarityCommon', title:'2 · Sable', sub:'Depth 6 · Hard', right:'23:41', rightColor:'textDim', slot:sl('Left','Top',[0,0,0,10])}),
          uiRow(1204, 78, {accent:'rarityCommon', title:'3 · Okonkwo', sub:'Depth 6 · Normal', right:'19:58', rightColor:'textDim', slot:sl('Left','Top',[0,0,0,10])}),
          uiRow(1204, 78, {accent:'accent', title:'14 · YOU', sub:'Depth 3 · Normal', right:'24:16', rightColor:'accent', slot:sl('Left','Top')}),
        ], sl('Fill','Fill'), 'Board')], {padding:32, name:'Board panel', slot:csAnchor(0.5,0,0,250,1300,600,0.5,0)}),
      ], null, 'Root')));

    return S;
  }

  const UI_STAGES = [
    { id:'boot',  label:'Boot / Front end', icon:'power' },
    { id:'hub',   label:'Hub',              icon:'home' },
    { id:'run',   label:'In run',           icon:'swords' },
    { id:'combat',label:'Combat overlays',  icon:'crosshair' },
    { id:'popup', label:'Popups',           icon:'message-square' },
    { id:'end',   label:'End of run / system', icon:'flag' },
  ];
  const UI_CATEGORIES = ['hud','menu','shop','popup','dialog','overlay'];
  const UI_STATUSES = [
    { id:'design',   label:'Designing', color:'text-amber-300 bg-amber-900/40' },
    { id:'approved', label:'Approved',  color:'text-sky-300 bg-sky-900/40' },
    { id:'built',    label:'Built in UEFN', color:'text-emerald-300 bg-emerald-900/40' },
  ];
