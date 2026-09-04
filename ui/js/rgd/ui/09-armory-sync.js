  /* ======================================================================
     UI SCREENS — 09 · ARMORY SYNC
     React ShopUI 1:1 — fixed tabs, per-weapon stat bars, power slots
     (open infusion / locked Time signature — Remnant/Souls style), skins,
     single CTA, list↔details Visible/Collapsed + slide. Live data from
     state.weapons (+ SCROLLS from buyable wizardry).
     ====================================================================== */

  const ARMORY_SCREEN_ID = 'scr_shop_weapons';
  const ARMORY_PICKER_SCREEN_ID = 'scr_armory_picker';
  /* Bump when Armory chrome shape changes so stale trees always rebuild. */
  const ARMORY_LAYOUT = 5;
  const ARMORY_PAGE_SIZE = 6;
  const ARMORY_GRID_W = 1680, ARMORY_CARD_W = 544, ARMORY_CARD_H = 398, ARMORY_GUTTER = 24;
  const ARMORY_HEADER_H = 92, ARMORY_TAB_H = 56;
  const ARMORY_FIXED_CATS = [
    {id:'PISTOLS', label:'PISTOLS', weaponCat:'Pistol'},
    {id:'ASSAULT RIFLES', label:'ASSAULT RIFLES', weaponCat:'Assault Rifle'},
    {id:'SHOTGUNS', label:'SHOTGUNS', weaponCat:'Shotgun'},
    {id:'SMGS', label:'SMGS', weaponCat:'SMG'},
    {id:'SCROLLS', label:'SCROLLS', scrolls:true},
  ];
  const ARMORY_STAT_KEYS = [
    {key:'damage', labels:['damage','dmg']},
    {key:'accuracy', labels:['accuracy','acc']},
    {key:'range', labels:['range']},
    {key:'mobility', labels:['mobility','move','speed']},
    {key:'fire_rate', labels:['fire_rate','firerate','fire rate','rate']},
  ];
  const ARMORY_STAT_LABELS = {
    damage:'Damage', accuracy:'Accuracy', range:'Range', mobility:'Mobility', fire_rate:'Fire Rate',
  };
  /* Display-only 0–100 bars — prefer WEAPON_ARMORY_STATS from 10-weapons.js. */
  const ARMORY_BAR_DEFAULTS = (typeof WEAPON_ARMORY_STATS==='object' && WEAPON_ARMORY_STATS) || {};

  function armoryCurrencyById(id){
    return (state.currencies||[]).find(c=>c.id===id) || null;
  }
  function armoryCategories(){
    return ARMORY_FIXED_CATS.map(c=>c.id);
  }
  function armoryCatMeta(id){
    return ARMORY_FIXED_CATS.find(c=>c.id===id) || ARMORY_FIXED_CATS[0];
  }
  function armoryScrollEntries(){
    return (state.wizardry||[]).filter(p=>p && p.buyable!==false && p.findable!==false).map(p=>{
      const price=p.price||{amount:Number(p.cost)||0, currencyId:(state.currencies&&state.currencies[0]&&state.currencies[0].id)||'gold'};
      return {
        id:'scroll_'+(p.id||p.name),
        name:p.name||p.id,
        desc:p.desc||p.procDesc||p.chargedDesc||'',
        category:'SCROLLS',
        starter:!!p.owned,
        color:p.color||'#a855f7',
        symbol:p.symbol||'S',
        uefnIcon:p.uefnIcon||'',
        price,
        stats:p.stats||null,
        skins:p.skins||[{id:'default', name:'Default', color:p.color||'#9ca3af'}],
        upgrades:p.upgrades||[],
        _scroll:true,
        _wizId:p.id,
      };
    });
  }
  function armoryCatalogEntries(){
    const weapons=(state.weapons||[]).map(w=>Object.assign({}, w, {_scroll:false}));
    return weapons.concat(armoryScrollEntries());
  }
  function armoryFilterEntries(entries, categoryId){
    const meta=armoryCatMeta(categoryId);
    if(meta.scrolls) return entries.filter(e=>e._scroll || e.category==='SCROLLS');
    return entries.filter(e=>!e._scroll && (e.category||'Pistol')===meta.weaponCat);
  }
  function armoryPriceParts(w){
    const price=w.price||{};
    const amt=Number(price.amount)||0;
    const cur=armoryCurrencyById(price.currencyId)||{symbol:'⏳', color:'#F2C14E', id:'gold'};
    return { amount:amt, sym:cur.symbol||'', color:cur.color||'gold', currencyId:cur.id||price.currencyId||'gold' };
  }
  function armoryNormPct(raw){
    const v=Number(raw);
    if(!isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v>1?v/100:v));
  }
  function armoryStatLabel(key){
    if(ARMORY_STAT_LABELS[key]) return ARMORY_STAT_LABELS[key];
    const cat=(state.stats||[]).find(s=>s&&(s.id===key||String(s.id).toLowerCase()===String(key).toLowerCase()));
    if(cat&&cat.name) return cat.name;
    return String(key||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())||'Stat';
  }
  function armoryResolvedStats(w){
    const out={};
    let raw=(w&&w.stats&&typeof w.stats==='object')?w.stats:{};
    /* Heal MCP nesting: weapon.fields.stats */
    if((!raw||!Object.keys(raw).length) && w&&w.fields&&typeof w.fields.stats==='object') raw=w.fields.stats;
    Object.keys(raw||{}).forEach(k=>{
      if(raw[k]==null||raw[k]==='') return;
      out[k]=raw[k];
    });
    if(Object.keys(out).length) return out;
    const fb=ARMORY_BAR_DEFAULTS[w&&w.id]||null;
    if(fb) return Object.assign({}, fb);
    /* Category fallback so custom weapons still show bars. */
    const cat=String((w&&w.category)||'Pistol');
    if(cat==='Assault Rifle') return {damage:62, accuracy:75, range:72, mobility:48, fire_rate:70};
    if(cat==='Shotgun') return {damage:80, accuracy:48, range:28, mobility:45, fire_rate:35};
    if(cat==='SMG') return {damage:52, accuracy:58, range:46, mobility:82, fire_rate:88};
    if(w&&w._scroll) return {damage:40, accuracy:50, range:45, mobility:55, fire_rate:60};
    return {damage:50, accuracy:60, range:50, mobility:55, fire_rate:55};
  }
  function armoryCatHit(nm, id, labels){
    /* Exact only — substring matches steal bars (e.g. "attack" ⊂ "Attack Range"). */
    return labels.some(l=>nm===l||id===l||nm===l.replace(/_/g,' ')||id===l.replace(/ /g,'_'));
  }
  function armoryStatPct(w, keySpec, resolved){
    const stats=resolved||armoryResolvedStats(w);
    if(stats[keySpec.key]!=null&&stats[keySpec.key]!=='') return armoryNormPct(stats[keySpec.key]);
    for(let i=0;i<keySpec.labels.length;i++){
      const k=keySpec.labels[i];
      if(stats[k]!=null&&stats[k]!=='') return armoryNormPct(stats[k]);
    }
    const cat=(state.stats||[]);
    for(let i=0;i<cat.length;i++){
      const s=cat[i];
      const nm=String(s.name||'').toLowerCase();
      const id=String(s.id||'').toLowerCase();
      if(armoryCatHit(nm, id, keySpec.labels.concat([keySpec.key]))){
        if(stats[s.id]!=null&&stats[s.id]!=='') return armoryNormPct(stats[s.id]);
      }
    }
    return null;
  }
  /* Bars for whatever THIS weapon actually has — preferred order, then extras. */
  function armoryStatRowsFor(w){
    const resolved=armoryResolvedStats(w);
    const rows=[];
    const used=new Set();
    ARMORY_STAT_KEYS.forEach(spec=>{
      const pct=armoryStatPct(w, spec, resolved);
      if(pct==null) return;
      rows.push({key:spec.key, label:ARMORY_STAT_LABELS[spec.key]||armoryStatLabel(spec.key), pct});
      used.add(spec.key);
      spec.labels.forEach(l=>used.add(l));
    });
    Object.keys(resolved).forEach(k=>{
      const lk=String(k).toLowerCase();
      if(used.has(k)||used.has(lk)) return;
      if(ARMORY_STAT_KEYS.some(spec=>spec.labels.indexOf(lk)>=0||spec.key===lk)) return;
      rows.push({key:k, label:armoryStatLabel(k), pct:armoryNormPct(resolved[k])});
    });
    return rows;
  }
  function armoryDescText(w){
    const d=String((w&&(w.desc||w.fireIdentity))||'').trim();
    return d||'No description yet.';
  }
  function armorySkinsFor(w){
    if(Array.isArray(w.skins)&&w.skins.length>=4) return w.skins.slice(0,4);
    if(typeof demoSkinsFor==='function') return demoSkinsFor(w);
    const c=(w&&w.color)||'#9ca3af';
    return [
      {id:'default', name:'Default', color:c},
      {id:'midnight', name:'Midnight', color:'#6366f1'},
      {id:'ember', name:'Ember', color:'#ef4444'},
      {id:'glacier', name:'Glacier', color:'#38bdf8'},
    ];
  }
  function armoryWizById(){
    const m={};
    (state.wizardry||[]).forEach(p=>{ if(p&&p.id) m[p.id]=p; });
    return m;
  }
  function armoryResolveWiz(id, byId){
    if(!id) return null;
    return (byId&&byId[id]) || (state.wizardry||[]).find(p=>p&&p.id===id) || null;
  }
  /* Remnant / Souls style: each weapon exposes its powerSlots (open or locked). */
  function armoryPowerSlotsFor(w){
    if(w&&w._scroll){
      const wizId=w._wizId||String(w.id||'').replace(/^scroll_/,'');
      return [{id:'scroll', index:1, kind:'open', equippedPowerId:wizId, label:w.name||'Scroll', accepts:[]}];
    }
    if(Array.isArray(w&&w.powerSlots)&&w.powerSlots.length) return w.powerSlots.slice(0,2);
    return [
      {id:'slot_element', index:1, kind:'open', accepts:['element_infusion','charged'], rerollPolicy:'hub', equippedPowerId:null, label:'Element Infusion'},
      {id:'slot_charged', index:2, kind:'open', accepts:['charged','element_infusion'], rerollPolicy:'hub', equippedPowerId:null, label:'Charged Scroll'},
    ];
  }
  function armoryPowerHeading(w){
    return (w&&w._scroll) ? 'SCROLL POWER' : 'POWER SLOTS';
  }
  function armoryNotes(){
    return [
      'React ShopUI 1:1 — Weapons + buyable Wizardry (SCROLLS). Listing/details SetVisibility + slide.',
      'Details: 4 skins + 2 power sockets (no orange detail plate). Skin_/PowerSlot_ open scr_armory_picker (X = CloseBtn).',
      'Picker canvas toggles SKINS ↔ POWERS view layers; Equip/Unlock stays on details.',
    ].join(' ');
  }

  /* Listing card: big EMPTY / FULL plate in the art area (not tiny pips). */
  function armoryCardSlotPlate(w){
    const slots=armoryPowerSlotsFor(w);
    const slot=slots[0]||{kind:'open', label:'Element Infusion'};
    const wiz=armoryResolveWiz(slot.equippedPowerId||slot.lockedPowerId, armoryWizById());
    const empty=!wiz && slot.kind!=='locked';
    const lockedSig=slot.kind==='locked' || (w&&w.slotPolicy)==='locked_power';
    const status=empty?'EMPTY':(lockedSig?'LOCKED':'FULL');
    const title=empty?(slot.label||'Power slot'):(wiz.name||slot.label||'Power');
    const accent=empty?'stroke':((wiz&&wiz.color)||w.color||'gold');
    const W=220, H=72;
    return uiOverlay([
      uiRect(accent, W, H, {opacity:1}, sl('Fill','Fill'), 'Slot plate border'),
      uiRect('panelDeep', W-4, H-4, {opacity:0.95}, sl('Fill','Fill',[2,2,2,2]), 'Slot plate fill'),
      uiText('SLOT · '+status, {size:'tiny', color:accent, justify:'Center'}, sl('Center','Top',[0,12,0,0]), 'Slot status'),
      uiText(title, {size:'small', color:'text', justify:'Center'}, sl('Center','Bottom',[0,0,0,12]), 'Slot title'),
    ], sl('Center','Center',[0,28,0,0]), 'Card power slot');
  }
  function buildArmoryWeaponCard(w, index, i){
    const owned=!!w.starter;
    const locked=!owned;
    const price=armoryPriceParts(w);
    const col=i%3, row=Math.floor(i/3);
    const x=col*(ARMORY_CARD_W+ARMORY_GUTTER);
    const y=row*(ARMORY_CARD_H+ARMORY_GUTTER);
    const states=['normal','hot','selected','locked'];
    const previewState=locked?'locked':(states[i%4]||'normal');
    const iconPath=w.uefnIcon||('Textures.'+(w.symbol||'W'));
    return uiWeaponCard(ARMORY_CARD_W, ARMORY_CARD_H, {
      title:w.name||w.id,
      body:armoryDescText(w),
      accent:w.color||'stroke',
      icon:iconPath,
      owned, locked,
      index:index+1,
      priceText:owned?'':String(price.amount||0),
      priceSym:price.sym,
      priceColor:price.color,
      priceBind:'Price_'+w.id,
      slotPlate: w._scroll ? null : armoryCardSlotPlate(w),
      state:previewState,
      fx:'pad', fxIndex:i,
      bind:'WeaponCard_'+w.id,
      slot:csBox(x,y,ARMORY_CARD_W,ARMORY_CARD_H),
      name:'Card · '+(w.name||w.id),
    });
  }

  function buildArmoryGridLayer(entries, category, page, viewProps, name){
    const filtered=armoryFilterEntries(entries, category);
    const pageCount=Math.max(1, Math.ceil(Math.max(filtered.length,1)/ARMORY_PAGE_SIZE));
    const pageIndex=Math.max(0, Math.min(pageCount-1, page|0));
    const slice=filtered.slice(pageIndex*ARMORY_PAGE_SIZE, pageIndex*ARMORY_PAGE_SIZE+ARMORY_PAGE_SIZE);
    const gridKids=[];
    for(let i=0;i<slice.length;i++){
      gridKids.push(buildArmoryWeaponCard(slice[i], pageIndex*ARMORY_PAGE_SIZE+i, i));
    }
    const gridH=ARMORY_CARD_H*2+ARMORY_GUTTER;
    const grid=uiCanvas(gridKids, csBox((UI_STAGE_W-ARMORY_GRID_W)/2, ARMORY_HEADER_H+ARMORY_TAB_H+24, ARMORY_GRID_W, gridH), 'Weapon grid');
    grid.props={collapseDefault:true};
    const kids=[grid];
    if(pageCount>1){
      kids.push(uiPager(pageIndex+1, pageCount, ARMORY_GRID_W, {
        slot:csBox((UI_STAGE_W-ARMORY_GRID_W)/2, ARMORY_HEADER_H+ARMORY_TAB_H+24+gridH+16, ARMORY_GRID_W, 48),
        prevBind:'PagerPrev', nextBind:'PagerNext', labelBind:'PagerLabel',
      }));
    }
    const layer=uiCanvas(kids, csFill(0,0,0,0), name||('Grid · '+category+' · p'+(pageIndex+1)));
    layer.props=Object.assign({collapseDefault:true}, viewProps||{});
    layer.slot=Object.assign(csFill(0,0,0,0), {z:2});
    return layer;
  }

  function buildArmoryDetailsView(weapon, categoryLabel){
    const w=weapon||{name:'No weapon', desc:'', fireIdentity:'', upgrades:[], stats:null, skins:null};
    const owned=!!w.starter;
    const price=armoryPriceParts(w);
    const backLabel='BACK TO '+(categoryLabel||w.category||'ARMORY').toUpperCase();
    const back=uiOverlay([
      uiRect('panelDeep', 280, 44, {opacity:0.95}, sl('Fill','Fill'), 'Back bg'),
      uiText(backLabel, {size:'tiny', color:'text'}, sl('Center','Center'), 'Back label'),
    ], csBox(MX, ARMORY_HEADER_H+16, 280, 44), 'Back affordance');
    back.props={asButton:true, variant:'quiet'}; back.bind='BackBtn';

    const statSpecs=armoryStatRowsFor(w);
    const statRows=(statSpecs.length?statSpecs:[{key:'damage',label:'Damage',pct:0}]).map((row)=>
      uiStatRow(row.label, row.pct, 340, {fx:'bar', bind:'Stat_'+String(row.key).replace(/[^A-Za-z0-9]+/g,'_')})
    );
    const desc=armoryDescText(w);
    const descH=Math.max(140, Math.min(260, 48+Math.ceil(desc.length/34)*22));
    const left=uiStack('V', [
      uiText('SELECTED WEAPON', {size:'tiny', color:'textMute'}, sl('Left','Top',[0,0,0,8]), 'Sel kicker'),
      Object.assign(uiText(w.name||w.id||'—', {size:'h2', color:'gold'}, sl('Left','Top',[0,0,0,16]), 'Weapon name'), {bind:'WeaponName'}),
      ...statRows,
      uiOverlay([
        uiRect('panelDeep', 340, descH, {opacity:0.95}, sl('Fill','Fill'), 'Desc bg'),
        uiRect('stroke', 340, descH, {opacity:0.5}, sl('Fill','Fill'), 'Desc border'),
        Object.assign(uiText(desc, {size:'small', color:'textDim', wrap:true, wrapWidth:308}, sl('Left','Top',[16,16,16,16]), 'Desc body'), {bind:'DescBody'}),
      ], sl('Fill','Top',[0,18,0,0]), 'Description plate'),
      uiRect('stroke', 2, 640, {opacity:0.5}, sl('Right','Fill'), 'Left divider'),
    ], csBox(MX, ARMORY_HEADER_H+80, 380, 720), 'Details left');
    left.props={fx:'pad', fxIndex:0, collapseDefault:true};

    const ghost=uiText(w.name||'', {size:'display', color:'textMute', opacity:0.12, justify:'Center'}, sl('Center','Top',[0,8,0,0]), 'Ghost name');
    ghost.props=Object.assign(ghost.props||{}, {fx:'fade'});
    const wizById=armoryWizById();
    const powerSlots=armoryPowerSlotsFor(w);
    const powerHeading=armoryPowerHeading(w);
    /* Two sockets side-by-side — press opens scr_armory_picker. */
    const powerCards=(powerSlots.length?powerSlots:armoryPowerSlotsFor({})).slice(0,2).map((slot,i)=>{
      const pid=slot.equippedPowerId||slot.lockedPowerId||null;
      const wiz=armoryResolveWiz(pid, wizById);
      return uiWizardrySlot(slot, wiz, i===0, {
        w:248, h:128,
        slotPolicy:w.slotPolicy||'infusable',
        bind:'PowerSlot_'+i,
        slot:sl('Left','Fill',[i?16:0,0,0,0]),
        name:'Power slot · '+(slot.label||(i+1)),
      });
    });
    const skins=armorySkinsFor(w);
    const center=uiStack('V', [
      ghost,
      uiOverlay([
        uiRect('panelDeep', 520, 160, {opacity:0.95}, sl('Fill','Fill'), 'Showcase bg'),
        uiRect(w.color||'stroke', 520, 4, {}, sl('Fill','Top'), 'Showcase bar'),
        uiIconPlate(w.uefnIcon||'Textures.T_Empty', 96),
      ], sl('Center','Top',[0,24,0,0]), 'Showcase'),
      uiText('AVAILABLE SKINS', {size:'tiny', color:'textMute'}, sl('Left','Top',[20,20,0,8]), 'Skins heading'),
      uiSkinsRow(skins, {slot:sl('Left','Top',[20,0,0,0]), bindPrefix:'Skin_', name:'Skins row'}),
      uiText(powerHeading, {size:'tiny', color:'gold'}, sl('Left','Top',[20,22,0,10]), 'Power heading'),
      uiStack('H', powerCards, sl('Left','Top',[20,0,0,0]), 'Power slots'),
    ], csBox(MX+380+40, ARMORY_HEADER_H+80, 892, 720), 'Details center');
    center.props={fx:'pad', fxIndex:1, collapseDefault:true};

    const upgrades=w.upgrades||[];
    const upRows=upgrades.length
      ? upgrades.map((u,i)=>uiUpgradeRow(u.name||('Upgrade '+(i+1)), u.desc||u.boost||'', u.cost!=null?String(u.cost):(u.amount!=null?String(u.amount):''), 400, {bind:'Upgrade_'+i, accent:w.color||'stroke'}))
      : [uiText('No upgrades listed', {size:'tiny', color:'textMute'}, sl('Left','Top'), 'No upgrades')];
    const actionLabel=owned
      ? 'Equip Weapon'
      : ('Unlock for '+(price.amount||0)+(price.sym?(' '+price.sym):''));
    const actionBtn=uiButton(actionLabel, 'loud', sl('Fill','Top'), owned?'Equip action':'Unlock action');
    actionBtn.bind='ActionBtn';
    actionBtn.props=Object.assign({}, actionBtn.props||{}, {state:owned?'selected':'normal', asButton:true, variant:'loud'});
    const right=uiStack('V', [
      uiText('UPGRADES', {size:'tiny', color:'gold'}, sl('Left','Top',[0,0,0,12]), 'Upgrades heading'),
      ...upRows,
      uiStack('V', [actionBtn], sl('Fill','Bottom',[0,20,0,0]), 'Action area'),
      uiRect('stroke', 2, 640, {opacity:0.5}, sl('Left','Fill'), 'Right divider'),
    ], csBox(MX+380+40+892+40, ARMORY_HEADER_H+80, 440, 720), 'Details right');
    right.props={fx:'pad', fxIndex:2, collapseDefault:true};

    const layer=uiCanvas([back, left, center, right], csFill(0,0,0,0), 'Details · '+(w.name||'empty'));
    layer.props={
      view:{group:'mode', id:'details', initial:false, label:'Details'},
      collapseDefault:true,
      fx:'slideDetails',
      modeSlide:'details',
    };
    layer.slot=Object.assign(csFill(0,0,0,0), {z:3});
    return layer;
  }

  function buildArmoryScreenRoot(){
    if(typeof ensureWeapons==='function') ensureWeapons();
    if(typeof ensureWizardry==='function') ensureWizardry();
    const entries=armoryCatalogEntries();
    const cats=armoryCategories();
    if(!state.meta) state.meta={};
    let activeCat=state.meta.armoryCategory||'PISTOLS';
    if(cats.indexOf(activeCat)<0) activeCat='PISTOLS';
    state.meta.armoryCategory=activeCat;
    const filteredActive=armoryFilterEntries(entries, activeCat);
    let sel=entries.find(w=>w.id===state.meta.armorySelected)||filteredActive[0]||entries[0]||null;
    if(sel) state.meta.armorySelected=sel.id;
    let page=Math.max(0, Number(state.meta.armoryPage)||0);
    const pageCount=Math.max(1, Math.ceil(Math.max(filteredActive.length,1)/ARMORY_PAGE_SIZE));
    if(page>=pageCount) page=pageCount-1;
    state.meta.armoryPage=page;

    const curs=(state.currencies||[]).slice(0,2);
    const chip0=curs[0]
      ? uiCurrencyChip(curs[0].symbol||'', '1,240', curs[0].color||'curSandGrain', 'SandText')
      : uiCurrencyChip('⏳','1,240','curSandGrain','SandText');
    const chip1=curs[1]
      ? uiCurrencyChip(curs[1].symbol||'', '86', curs[1].color||'curTimeEssence', 'EssenceText')
      : uiCurrencyChip('💷','86','curTimeEssence','EssenceText');

    const header=uiOverlay([
      uiRect('panelDeep', UI_STAGE_W, ARMORY_HEADER_H, {opacity:0.96}, sl('Fill','Fill'), 'Header bg'),
      uiRect('gold', UI_STAGE_W, 3, {}, sl('Fill','Bottom'), 'Header rule'),
      uiText('Armory', {size:'h1', color:'text'}, sl('Left','Center',[MX,0,0,0]), 'Armory title'),
      uiStack('H', [chip0, Object.assign(chip1, {slot:sl('Left','Center',[16,0,0,0])})], sl('Right','Center',[0,0,MX,0]), 'Wallet'),
    ], Object.assign(csBandTop(ARMORY_HEADER_H,0,0,0), {z:5}), 'Header band');
    header.props={collapseDefault:true};

    const tabLabels=cats.map(c=>armoryCatMeta(c).label);
    const activeIdx=Math.max(0, cats.indexOf(activeCat));
    const tabs=uiTabStrip(tabLabels, activeIdx, UI_STAGE_W, {
      binds:cats.map(c=>'Tab'+String(c).replace(/[^A-Za-z0-9]+/g,'')),
    });
    tabs.slot=Object.assign(csBandTop(ARMORY_TAB_H,0,0,ARMORY_HEADER_H), {z:5});
    tabs.props=Object.assign(tabs.props||{}, {collapseDefault:true});

    const pageLayers=[];
    for(let p=0;p<pageCount;p++){
      pageLayers.push(buildArmoryGridLayer(
        entries, activeCat, p,
        {view:{group:'page', id:String(p), initial:p===page, label:'Page '+(p+1)}},
        'Page · '+(p+1)
      ));
    }
    const catMarkers=cats.map(c=>{
      const m=uiRect('bg', 1, 1, {opacity:0}, csBox(-20,-20,1,1), 'ViewCat · '+c);
      m.props={view:{group:'category', id:c, initial:c===activeCat, label:c}};
      return m;
    });

    const listingHost=uiCanvas([tabs].concat(pageLayers).concat(catMarkers).concat([
      uiFooterHint(['[A] Confirm','[B] Back','[LB/RB] Category','[LS] Navigate']),
    ]), csFill(0,0,0,0), 'Listing host');
    listingHost.props={
      view:{group:'mode', id:'listing', initial:true, label:'Listing'},
      collapseDefault:true,
      fx:'slideList',
      modeSlide:'listing',
    };
    listingHost.slot=Object.assign(csFill(0,0,0,0), {z:2});

    const details=buildArmoryDetailsView(sel, activeCat);

    return uiCanvas([
      uiRect('bg', UI_STAGE_W, UI_STAGE_H, {opacity:1}, csFill(0,0,0,0), 'Backdrop'),
      listingHost,
      details,
      header,
    ], null, 'Root');
  }

  function armoryPickerOptions(mode, w){
    if(mode==='powers'){
      const accepts=['element_infusion','charged'];
      return (state.wizardry||[]).filter(p=>p && p.buyable!==false && accepts.indexOf(p.kind)>=0).slice(0,8).map(p=>({
        id:p.id, title:p.name||p.id, sub:(p.element||p.kind||'')+' · hub equip', right:p.symbol||'◆', accent:p.color||'accentAlt',
      }));
    }
    return armorySkinsFor(w).map(sk=>({
      id:sk.id, title:sk.name||sk.id, sub:'Cosmetic · equip anytime', right:'', accent:sk.color||'stroke',
    }));
  }
  function buildArmoryPickerRoot(){
    if(typeof ensureWeapons==='function') ensureWeapons();
    if(typeof ensureWizardry==='function') ensureWizardry();
    const entries=armoryCatalogEntries();
    const w=entries.find(x=>x.id===(state.meta&&state.meta.armorySelected))||entries[0]||{name:'Weapon', color:'#9ca3af'};
    if(!state.meta) state.meta={};
    let mode=state.meta.armoryPicker||'skins';
    if(mode!=='powers') mode='skins';
    state.meta.armoryPicker=mode;
    const PW=780, PH=720;
    const closeBtn=uiOverlay([
      uiRect('stroke', 48, 48, {opacity:1}, sl('Fill','Fill'), 'Close border'),
      uiRect('panelDeep', 44, 44, {opacity:0.95}, sl('Center','Center'), 'Close fill'),
      uiText('✕', {size:'h3', color:'text', justify:'Center'}, sl('Center','Center'), 'Close X'),
    ], sl('Right','Top'), 'Close');
    closeBtn.bind='CloseBtn';
    closeBtn.props={asButton:true, variant:'quiet', collapseDefault:true};
    function listLayer(listMode, label){
      const opts=armoryPickerOptions(listMode, w);
      const rows=opts.length?opts.map((opt,i)=>uiRow(PW-96, 88, {
        accent:opt.accent, title:opt.title, sub:opt.sub, right:opt.right||'Select', rightColor:'gold',
        binds:{btn:'Option_'+i},
        slot:sl('Fill','Top',[0,0,0,i?12:0]),
        name:'Option · '+opt.title,
      })):[uiText('Nothing available yet', {size:'small', color:'textMute'}, sl('Left','Top'), 'Empty list')];
      const layer=uiStack('V', rows, sl('Fill','Top',[0,16,0,0]), label+' list');
      layer.props={
        view:{group:'picker', id:listMode, initial:mode===listMode, label:label},
        collapseDefault:true,
      };
      return layer;
    }
    const title=Object.assign(uiText(mode==='powers'?'CHOOSE POWER':'CHOOSE SKIN', {size:'h2', color:'text'}, sl('Left','Top'), 'Picker title'), {bind:'PickerTitle'});
    const sub=Object.assign(uiText((w.name||'Weapon')+' · tap a row to equip · ✕ closes', {size:'small', color:'textDim'}, sl('Left','Top',[0,0,0,12]), 'Picker sub'), {bind:'PickerSub'});
    const tabs=uiTabStrip(['SKINS','POWERS'], mode==='powers'?1:0, PW-96, {
      binds:['PickerTabSkins','PickerTabPowers'],
    });
    tabs.slot=sl('Fill','Top',[0,0,0,18]);
    const content=uiStack('V', [
      uiOverlay([title, closeBtn], sl('Fill','Top',[0,0,0,8]), 'Picker header'),
      sub,
      tabs,
      listLayer('skins','Skins'),
      listLayer('powers','Powers'),
      uiText('[A] Select   [B] / ✕ Close', {size:'tiny', color:'textMute'}, sl('Left','Bottom',[0,20,0,0]), 'Picker hints'),
    ], sl('Fill','Fill'), 'Picker content');
    return uiScrim([ uiPanel(PW, PH, [content], {padding:48, stroke:'gold', name:'Picker panel'}) ]);
  }
  function syncArmoryPickerScreen(opts){
    const o=opts||{};
    if(!Array.isArray(state.uiScreens) || !state.uiScreens.length){
      state.uiScreens = uiSeedScreens();
    }
    const root=buildArmoryPickerRoot();
    const notes='Armory picker popup — Skin_/PowerSlot_ open this canvas. Toggle SKINS ↔ POWERS (picker view group). CloseBtn ✕ dismisses back to Armory details.';
    let screen=state.uiScreens.find(s=>s.id===ARMORY_PICKER_SCREEN_ID);
    if(!screen){
      screen=uiScreen(ARMORY_PICKER_SCREEN_ID,'Armory Picker','popup','popup', notes,
        'GameDevices/Gameplay/Screens/Popup','armory_picker', root);
      state.uiScreens.push(screen);
    } else {
      screen.root=root;
      screen.name='Armory Picker';
      screen.notes=notes;
      if(screen.status==='built') screen.status='design';
    }
    if(!state.meta.uiViews) state.meta.uiViews={};
    if(state.meta.uiViews.picker==null) state.meta.uiViews.picker=state.meta.armoryPicker||'skins';
    return true;
  }

  function armorySyncFingerprint(){
    try{
      return JSON.stringify({
        layout:ARMORY_LAYOUT,
        w:(state.weapons||[]).map(x=>({id:x.id,name:x.name,cat:x.category,st:x.starter,pr:x.price,stt:x.stats,sk:x.skins,up:x.upgrades,ic:x.uefnIcon,c:x.color,d:x.desc,f:x.fireIdentity,pol:x.slotPolicy,ps:(x.powerSlots||[]).map(s=>({k:s.kind,e:s.equippedPowerId,l:s.lockedPowerId,lb:s.label}))})),
        z:(state.wizardry||[]).map(x=>({id:x.id,name:x.name,el:x.element,k:x.kind,c:x.color,sy:x.symbol,buy:x.buyable,pr:x.price,d:x.desc,cd:x.chargedDesc,pd:x.procDesc})),
        cur:(state.currencies||[]).map(c=>({id:c.id,symbol:c.symbol,color:c.color})),
        sel:state.meta&&state.meta.armorySelected,
        cat:state.meta&&state.meta.armoryCategory,
        page:state.meta&&state.meta.armoryPage,
        picker:state.meta&&state.meta.armoryPicker,
      });
    }catch(e){ return String(Date.now()); }
  }
  let _armoryFp='';

  function syncArmoryScreenFromWeapons(opts){
    const o=opts||{};
    if(typeof ensureWeapons==='function') ensureWeapons();
    if(!Array.isArray(state.uiScreens) || !state.uiScreens.length){
      state.uiScreens = uiSeedScreens();
    }
    const fp=armorySyncFingerprint();
    let screen = state.uiScreens.find(s=>s.id===ARMORY_SCREEN_ID);
    if(screen && fp===_armoryFp && !o.force) {
      if(o.rerender && state.meta.activeTab==='uiscreens') renderUIScreens();
      return false;
    }
    _armoryFp=fp;
    const root=buildArmoryScreenRoot();
    const notes=armoryNotes();
    if(!screen){
      screen = uiScreen(ARMORY_SCREEN_ID,'Armory','hub','shop', notes,
        'GameDevices/Gameplay/Screens/Shop','shop_weapons', root);
      state.uiScreens.push(screen);
    } else {
      screen.root = root;
      screen.name = 'Armory';
      screen.notes = notes;
      if(screen.status==='built') screen.status='design';
    }
    syncArmoryPickerScreen({force:true});
    if(!state.meta.uiViews) state.meta.uiViews={};
    if(state.meta.uiViews.mode==null) state.meta.uiViews.mode='listing';
    state.meta.uiViews.category=state.meta.armoryCategory||'PISTOLS';
    state.meta.uiViews.page=String(state.meta.armoryPage||0);
    if(o.save) save(o.flush?{flush:true}:undefined);
    if(o.rerender && state.meta.activeTab==='uiscreens') renderUIScreens();
    return true;
  }
