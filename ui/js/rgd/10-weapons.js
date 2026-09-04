  /* ===== player weapons (categories + power slots) ===== */
  const WEAPON_CLASS_TRAITS = {
    Pistol:{name:'Sidearm',summary:'Flexible sidearms. Open slots take element infusions; locked slots are Time signatures.'},
    'Assault Rifle':{name:'Suppression',summary:'Eight continuous hits on the same target makes it flinch and cut its damage output. ARs keep a target locked down while the party sets up reactions.'},
    Shotgun:{name:'Saturation',summary:'Every pellet applies element stacks individually. A full body hit up close procs a status instantly. Shotguns are the fastest status applier and start reactions for everyone else.'},
    SMG:{name:'Haste',summary:'Sustained fire builds Haste stacks that raise movement and reload speed. SMGs are the only class that fires at full accuracy while sprinting or dashing.'},
  };
  const OPEN_SLOTS=[
    {id:"slot_element",index:1,kind:"open",accepts:["element_infusion","charged"],rerollPolicy:"hub",equippedPowerId:null,label:"Element Infusion"},
    {id:"slot_charged",index:2,kind:"open",accepts:["charged","element_infusion"],rerollPolicy:"hub",equippedPowerId:null,label:"Charged Scroll"},
  ];
  const lockedSlots=(id,label)=>[
    {id:"slot_signature",index:1,kind:"locked",accepts:[],rerollPolicy:"none",lockedPowerId:id,equippedPowerId:id,label},
    {id:"slot_element",index:2,kind:"open",accepts:["element_infusion","charged"],rerollPolicy:"hub",equippedPowerId:null,label:"Element Infusion"},
  ];
  function demoSkinsFor(w){
    const c=(w&&w.color)||'#9ca3af';
    return [
      {id:'default', name:'Default', color:c},
      {id:'midnight', name:'Midnight', color:'#6366f1'},
      {id:'ember', name:'Ember', color:'#ef4444'},
      {id:'glacier', name:'Glacier', color:'#38bdf8'},
    ];
  }
  function weaponWithSlotChrome(w){
    const base=Object.assign({}, w);
    if(!Array.isArray(base.skins)||base.skins.length<4) base.skins=demoSkinsFor(base);
    if(!Array.isArray(base.powerSlots)||base.powerSlots.length<2){
      if(base.slotPolicy==='locked_power'){
        const sig=(base.powerSlots&&base.powerSlots[0]&&base.powerSlots[0].kind==='locked')
          ? Object.assign({}, base.powerSlots[0], {index:1})
          : lockedSlots(base.powerSlots&&base.powerSlots[0]&&(base.powerSlots[0].lockedPowerId||base.powerSlots[0].equippedPowerId)||'', base.powerSlots&&base.powerSlots[0]&&base.powerSlots[0].label||'Signature')[0];
        base.powerSlots=[sig, Object.assign({}, OPEN_SLOTS[1], {id:'slot_element', label:'Element Infusion', index:2})];
      } else {
        const a=Object.assign({}, (base.powerSlots&&base.powerSlots[0])||OPEN_SLOTS[0], {index:1});
        const b=Object.assign({}, OPEN_SLOTS[1], {index:2});
        base.powerSlots=[a,b];
      }
    }
    return base;
  }
  /* Armory details bars (0–100). Kept on the weapon so each gun shows its own profile. */
  const WEAPON_ARMORY_STATS = {
    service_pistol:{damage:42, accuracy:78, range:55, mobility:70, fire_rate:58},
    hand_cannon:{damage:88, accuracy:62, range:60, mobility:48, fire_rate:28},
    machine_pistol:{damage:48, accuracy:45, range:40, mobility:72, fire_rate:92},
    paradox:{damage:55, accuracy:70, range:58, mobility:65, fire_rate:50},
    hourglass:{damage:72, accuracy:68, range:52, mobility:55, fire_rate:40},
    vanguard:{damage:62, accuracy:74, range:70, mobility:50, fire_rate:78},
    tribeam:{damage:58, accuracy:80, range:68, mobility:52, fire_rate:60},
    longshot:{damage:70, accuracy:90, range:95, mobility:40, fire_rate:35},
    recursion:{damage:64, accuracy:72, range:72, mobility:48, fire_rate:70},
    prophecy:{damage:66, accuracy:98, range:80, mobility:45, fire_rate:48},
    breacher:{damage:85, accuracy:55, range:28, mobility:45, fire_rate:30},
    flechette:{damage:60, accuracy:35, range:18, mobility:50, fire_rate:45},
    ripper:{damage:72, accuracy:50, range:32, mobility:55, fire_rate:55},
    echo:{damage:78, accuracy:48, range:30, mobility:42, fire_rate:40},
    unmake:{damage:80, accuracy:52, range:26, mobility:40, fire_rate:32},
    shred:{damage:50, accuracy:58, range:45, mobility:85, fire_rate:88},
    splitfire:{damage:55, accuracy:62, range:50, mobility:80, fire_rate:82},
    flux:{damage:58, accuracy:60, range:48, mobility:78, fire_rate:86},
    tempo:{damage:52, accuracy:55, range:46, mobility:90, fire_rate:95},
    revenant:{damage:60, accuracy:58, range:48, mobility:82, fire_rate:84},
  };
  const ARMORY_STAT_FIELDS = [
    {id:'damage', name:'Damage'},
    {id:'accuracy', name:'Accuracy'},
    {id:'range', name:'Range'},
    {id:'mobility', name:'Mobility'},
    {id:'fire_rate', name:'Fire Rate'},
  ];
  function weaponWithArmoryStats(w){
    const base=Object.assign({}, w);
    if(base.stats&&typeof base.stats==='object'&&Object.keys(base.stats).length) return base;
    if(WEAPON_ARMORY_STATS[base.id]) base.stats=Object.assign({}, WEAPON_ARMORY_STATS[base.id]);
    return base;
  }
  const WEAPON_DEFAULTS = [
    {id:"service_pistol",name:"Service Pistol",symbol:"S",color:"#f59e0b",category:"Pistol",starter:true,slotPolicy:"infusable",
      desc:"Starter semi-auto. Tapping beats spamming — free crits reward patience.",
      fireIdentity:"Semi auto. Any shot fired after a 0.4s pause is a guaranteed crit.",
      suggestedElements:["Ice"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.service_pistol),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_Service",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_ServicePistol",icon:"assets/weapons/pistol.svg",verseClass:"weapon_service_pistol",upgrades:[]},
    {id:"hand_cannon",name:"Hand Cannon",symbol:"H",color:"#ef4444",category:"Pistol",slotPolicy:"infusable",
      desc:"Six shots, heavy damage, real knockback. Overpressure pierce after every reload.",
      fireIdentity:"Every reload chambers one Overpressure round that pierces through a target and keeps going.",
      suggestedElements:["Void"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.hand_cannon),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_HandCannon",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_HandCannon",icon:"assets/weapons/pistol.svg",verseClass:"weapon_hand_cannon",upgrades:[]},
    {id:"machine_pistol",name:"Machine Pistol",symbol:"M",color:"#22c55e",category:"Pistol",slotPolicy:"infusable",
      desc:"Full auto on a heat gauge. Hold longer for more damage, pay with wider accuracy.",
      fireIdentity:"Full auto on a heat gauge. Accuracy widens as heat climbs but damage climbs with it.",
      suggestedElements:["Fire","Lightning"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.machine_pistol),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_Machine",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_MachinePistol",icon:"assets/weapons/pistol.svg",verseClass:"weapon_machine_pistol",upgrades:[]},
    {id:"paradox",name:"Paradox",symbol:"P",color:"#94a3b8",category:"Pistol",slotPolicy:"locked_power",
      desc:"Time signature. Every shot echoes 1.5s later at the same point in space.",
      fireIdentity:"Every shot fires twice — once now, and an echo 1.5 seconds later at the exact same point in space.",
      suggestedElements:[],powerSlots:lockedSlots("stasis_field","Stasis Field"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.paradox),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_Arc",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Paradox",icon:"assets/weapons/pistol.svg",verseClass:"weapon_paradox",upgrades:[]},
    {id:"hourglass",name:"Hourglass",symbol:"G",color:"#64748b",category:"Pistol",slotPolicy:"locked_power",
      desc:"Time signature. Accelerates aging; kills chamber a round instantly.",
      fireIdentity:"Damage scales with missing health. Kills chamber a round instantly, no reload.",
      suggestedElements:[],powerSlots:lockedSlots("rewind","Rewind"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.hourglass),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_Reaper",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Hourglass",icon:"assets/weapons/pistol.svg",verseClass:"weapon_hourglass",upgrades:[]},
    {id:"vanguard",name:"Vanguard",symbol:"V",color:"#f97316",category:"Assault Rifle",slotPolicy:"infusable",
      desc:"Class trait Suppression: eight continuous hits on the same target makes it flinch and cut its damage output.",
      fireIdentity:"Full auto that tightens instead of widening. After one second of held fire, spread drops to zero and damage ramps.",
      suggestedElements:["Fire"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.vanguard),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Vanguard",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Vanguard",icon:"assets/weapons/assault_rifle.svg",verseClass:"weapon_vanguard",upgrades:[]},
    {id:"tribeam",name:"Tribeam",symbol:"T",color:"#38bdf8",category:"Assault Rifle",slotPolicy:"infusable",
      desc:"Class trait Suppression: eight continuous hits on the same target makes it flinch and cut its damage output.",
      fireIdentity:"Three round burst. All three landing refunds the ammo and applies double element stacks.",
      suggestedElements:["Ice","Void"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.tribeam),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Tribeam",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Tribeam",icon:"assets/weapons/assault_rifle.svg",verseClass:"weapon_tribeam",upgrades:[]},
    {id:"longshot",name:"Longshot",symbol:"L",color:"#facc15",category:"Assault Rifle",slotPolicy:"infusable",
      desc:"Class trait Suppression: eight continuous hits on the same target makes it flinch and cut its damage output.",
      fireIdentity:"Semi auto marksman. Damage scales upward with distance to target.",
      suggestedElements:["Lightning"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.longshot),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Longshot",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Longshot",icon:"assets/weapons/assault_rifle.svg",verseClass:"weapon_longshot",upgrades:[]},
    {id:"recursion",name:"Recursion",symbol:"R",color:"#94a3b8",category:"Assault Rifle",slotPolicy:"locked_power",
      desc:"Time signature AR. Suppression still applies while Loop replays your fire.",
      fireIdentity:"Every sixth shot instantly replays the previous five shots at once.",
      suggestedElements:[],powerSlots:lockedSlots("loop","Loop"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.recursion),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Recursion",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Recursion",icon:"assets/weapons/assault_rifle.svg",verseClass:"weapon_recursion",upgrades:[]},
    {id:"prophecy",name:"Prophecy",symbol:"Y",color:"#cbd5e1",category:"Assault Rifle",slotPolicy:"locked_power",
      desc:"Time signature AR. Suppression still applies — never miss a moving enemy.",
      fireIdentity:"Shots resolve half a second ahead, so they land where the target will be. Never misses a moving enemy.",
      suggestedElements:[],powerSlots:lockedSlots("precognition","Precognition"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.prophecy),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Prophecy",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Prophecy",icon:"assets/weapons/assault_rifle.svg",verseClass:"weapon_prophecy",upgrades:[]},
    {id:"breacher",name:"Breacher",symbol:"B",color:"#a855f7",category:"Shotgun",slotPolicy:"infusable",
      desc:"Class trait Saturation: every pellet applies element stacks individually.",
      fireIdentity:"Pump action, tight cone, heavy stagger. Loads shell by shell so you can cancel the reload at any point.",
      suggestedElements:["Void"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.breacher),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Breacher",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Breacher",icon:"assets/weapons/shotgun.svg",verseClass:"weapon_breacher",upgrades:[]},
    {id:"flechette",name:"Flechette",symbol:"F",color:"#ef4444",category:"Shotgun",slotPolicy:"infusable",
      desc:"Class trait Saturation: every pellet applies element stacks individually.",
      fireIdentity:"Very wide cone, very high pellet count. Useless past ten meters, instant max stacks inside it.",
      suggestedElements:["Fire","Ice"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.flechette),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Flechette",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Flechette",icon:"assets/weapons/shotgun.svg",verseClass:"weapon_flechette",upgrades:[]},
    {id:"ripper",name:"Ripper",symbol:"I",color:"#facc15",category:"Shotgun",slotPolicy:"infusable",
      desc:"Class trait Saturation: every pellet applies element stacks individually.",
      fireIdentity:"Semi auto, fewer pellets per shot. Consecutive hits tighten the cone toward a slug.",
      suggestedElements:["Lightning"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.ripper),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Ripper",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Ripper",icon:"assets/weapons/shotgun.svg",verseClass:"weapon_ripper",upgrades:[]},
    {id:"echo",name:"Echo",symbol:"E",color:"#94a3b8",category:"Shotgun",slotPolicy:"locked_power",
      desc:"Time signature shotgun. Saturation still applies while Aftershock records damage.",
      fireIdentity:"One trigger pull, three blasts. The shot repeats twice more at the same point in space, half a second apart.",
      suggestedElements:[],powerSlots:lockedSlots("aftershock","Aftershock"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.echo),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Echo",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Echo",icon:"assets/weapons/shotgun.svg",verseClass:"weapon_echo",upgrades:[]},
    {id:"unmake",name:"Unmake",symbol:"U",color:"#64748b",category:"Shotgun",slotPolicy:"locked_power",
      desc:"Time signature shotgun. Saturation still applies while Regression reverts elites.",
      fireIdentity:"Each pellet strips one layer of armor, shield, or buff from what it hits.",
      suggestedElements:[],powerSlots:lockedSlots("regression","Regression"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.unmake),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Unmake",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Unmake",icon:"assets/weapons/shotgun.svg",verseClass:"weapon_unmake",upgrades:[]},
    {id:"shred",name:"Shred",symbol:"S",color:"#ef4444",category:"SMG",slotPolicy:"infusable",
      desc:"Class trait Haste: sustained fire builds Haste stacks that raise movement and reload speed.",
      fireIdentity:"Consecutive hits on the same target stack a damage bonus. Miss and the stacks decay.",
      suggestedElements:["Fire"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.shred),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Shred",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Shred",icon:"assets/weapons/smg.svg",verseClass:"weapon_shred",upgrades:[]},
    {id:"splitfire",name:"Splitfire",symbol:"P",color:"#facc15",category:"SMG",slotPolicy:"infusable",
      desc:"Class trait Haste: sustained fire builds Haste stacks that raise movement and reload speed.",
      fireIdentity:"Two streams that converge at a fixed distance. Standing at the convergence point doubles your damage.",
      suggestedElements:["Lightning"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.splitfire),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Splitfire",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Splitfire",icon:"assets/weapons/smg.svg",verseClass:"weapon_splitfire",upgrades:[]},
    {id:"flux",name:"Flux",symbol:"X",color:"#38bdf8",category:"SMG",slotPolicy:"infusable",
      desc:"Class trait Haste: sustained fire builds Haste stacks that raise movement and reload speed.",
      fireIdentity:"Damage climbs as the magazine empties. The last quarter of the mag hits hardest.",
      suggestedElements:["Ice","Void"],powerSlots:OPEN_SLOTS.map(s=>({...s})),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.flux),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Flux",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Flux",icon:"assets/weapons/smg.svg",verseClass:"weapon_flux",upgrades:[]},
    {id:"tempo",name:"Tempo",symbol:"T",color:"#e2e8f0",category:"SMG",slotPolicy:"locked_power",
      desc:"Time signature SMG. Haste still applies while Accelerate doubles your tempo.",
      fireIdentity:"Fire rate climbs the longer you hold the trigger with no cap. Release and it resets to base.",
      suggestedElements:[],powerSlots:lockedSlots("accelerate","Accelerate"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.tempo),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Tempo",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Tempo",icon:"assets/weapons/smg.svg",verseClass:"weapon_tempo",upgrades:[]},
    {id:"revenant",name:"Revenant",symbol:"V",color:"#475569",category:"SMG",slotPolicy:"locked_power",
      desc:"Time signature SMG. Haste still applies while Second Self mirrors your fire.",
      fireIdentity:"Every tenth kill leaves an afterimage of you that fires one burst at the nearest enemy.",
      suggestedElements:[],powerSlots:lockedSlots("second_self","Second Self"),
      stats:Object.assign({}, WEAPON_ARMORY_STATS.revenant),
      uefnAsset:"/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Revenant",uefnIcon:"/Roguelike/Weapons/Icons/T_Icon_Revenant",icon:"assets/weapons/smg.svg",verseClass:"weapon_revenant",upgrades:[]},
  ];
  const OLD_STUB_WEAPON_IDS = new Set(["pistol","assault_rifle","smg","shotgun","bolt_sniper","auto_sniper","rocket_launcher","bow","crossbow","minigun"]);

  function ensureWeapons(){
    if(!state.weapons) state.weapons=[];
    if(!state.meta) state.meta={};
    state.meta.weaponClassTraits = state.meta.weaponClassTraits || {};
    Object.entries(WEAPON_CLASS_TRAITS).forEach(([cat,trait])=>{
      if(!state.meta.weaponClassTraits[cat]) state.meta.weaponClassTraits[cat]=JSON.parse(JSON.stringify(trait));
    });
    const ids=new Set(state.weapons.map(w=>w.id));
    const onlyStubs=[...ids].length>0 && [...ids].every(id=>OLD_STUB_WEAPON_IDS.has(id));
    if((state.version||0)<4 || onlyStubs || !state.weapons.length){
      state.weapons=JSON.parse(JSON.stringify(WEAPON_DEFAULTS));
      state.version=Math.max(state.version||0,4);
    } else {
      WEAPON_DEFAULTS.forEach(w=>{ if(!ids.has(w.id) && !OLD_STUB_WEAPON_IDS.has(w.id)) state.weapons.push(JSON.parse(JSON.stringify(w))); });
      state.weapons=state.weapons.filter(w=>!OLD_STUB_WEAPON_IDS.has(w.id));
    }
    /* Backfill armory bars, 4 demo skins, 2 power sockets. */
    state.weapons=state.weapons.map(w=>weaponWithSlotChrome(weaponWithArmoryStats(w)));
  }

  function powerName(id){
    if(!id) return '— empty —';
    const p=(state.wizardry||[]).find(x=>x.id===id);
    return p?p.name:id;
  }

  function renderWeapons(){
    ensureWeapons(); ensureWizardry();
    const order=['Pistol','Assault Rifle','Shotgun','SMG'];
    const cats=[...new Set(state.weapons.map(w=>w.category||'Pistol'))].sort((a,b)=>{
      const ia=order.indexOf(a), ib=order.indexOf(b);
      return (ia<0?99:ia)-(ib<0?99:ib) || a.localeCompare(b);
    });
    const filter=state.meta.weaponFilter||'All';
    const list=state.weapons.filter(w=>filter==='All'||(w.category||'Pistol')===filter);
    const chips=['All',...cats].map(c=>`<button onclick="RGD.setWeaponFilter('${c}')" class="px-2.5 py-1 rounded-lg text-[11px] border ${filter===c?'bg-indigo-600 border-indigo-500 text-white':'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}">${c}</button>`).join('');
    const trait=(filter!=='All'&&(state.meta.weaponClassTraits||WEAPON_CLASS_TRAITS)[filter])||null;
    const traitHtml=trait?`<div class="mt-3 rounded-lg border border-cyan-900/50 bg-cyan-950/30 px-3 py-2"><div class="text-[11px] font-semibold text-cyan-300">Class trait · ${esc(trait.name)}</div><p class="text-[11px] text-gray-400 mt-0.5">${esc(trait.summary)}</p></div>`:`<p class="text-sm text-gray-400">Four classes. <span class="text-amber-300">Open</span> slots take element infusion scrolls (reroll at hub). <span class="text-slate-300">Locked</span> slots are Time signatures that cannot be swapped.</p>`;
    const body=catalogueView()==='table'
      ? weaponTableHtml(list)
      : `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${list.map(weaponCard).join('')||`<div class="col-span-full py-12 text-center text-gray-500 text-sm">No weapons in this category.</div>`}</div>`;
    document.getElementById('tab-weapons').innerHTML=`
      <div class="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div class="max-w-2xl">
          ${traitHtml}
          <div class="flex flex-wrap gap-1.5 mt-3">${chips}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">${viewToggleHtml()}<button onclick="RGD.openWeaponModal()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Add Weapon</button></div>
      </div>
      ${body}`;
  }
  function weaponTableHtml(list){
    if(!list.length) return `<div class="py-12 text-center text-gray-500 text-sm">No weapons in this category.</div>`;
    const rows=list.map(w=>{
      const slots=(w.powerSlots||[]).map(s=>{
        const locked=s.kind==='locked';
        const eq=locked?(s.lockedPowerId||s.equippedPowerId):s.equippedPowerId;
        return `${locked?'🔒':'◇'} ${esc(powerName(eq))}`;
      }).join(' · ')||'—';
      const sug=(w.suggestedElements||[]).join(', ')||'—';
      const iconHtml=w.icon?`<img src="../${esc(w.icon)}" alt="" class="w-7 h-7 rounded object-cover border border-gray-700">`:`<span class="inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold" style="background:${w.color}22;color:${w.color};border:1px solid ${w.color}55">${esc(w.symbol||'?')}</span>`;
      return `<tr class="cat-row" onclick="RGD.openWeaponModal('${w.id}')">
        <td>${iconHtml}</td>
        <td class="text-white font-medium">${esc(w.name)}${w.starter?' <span class="text-[10px] text-amber-400">starter</span>':''}</td>
        <td class="text-gray-300">${esc(w.category||'Pistol')}</td>
        <td><span class="text-[10px] px-1.5 py-0.5 rounded ${w.slotPolicy==='locked_power'?'bg-slate-700 text-slate-200':'bg-amber-900/40 text-amber-200'}">${w.slotPolicy==='locked_power'?'Locked':'Infusable'}</span></td>
        <td class="text-gray-400 max-w-[200px] truncate" title="${esc(w.fireIdentity||'')}">${esc(w.fireIdentity||'—')}</td>
        <td class="text-gray-400">${esc(sug)}</td>
        <td class="text-gray-300 text-[11px]">${slots}</td>
        <td class="mono max-w-[140px] truncate" title="${esc(w.verseClass||'')}">${esc(w.verseClass||'—')}</td>
        <td class="text-right whitespace-nowrap" onclick="event.stopPropagation()">
          <button onclick="event.stopPropagation();RGD.openWeaponModal('${w.id}')" class="text-gray-400 hover:text-white mr-2"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
          <button onclick="event.stopPropagation();RGD.deleteWeapon('${w.id}')" class="text-gray-400 hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </td>
      </tr>`;
    }).join('');
    return `<div class="bg-gray-800 border border-gray-700 rounded-xl overflow-x-auto"><table class="cat-table min-w-[980px]"><thead><tr><th></th><th>Name</th><th>Class</th><th>Slots</th><th>Fire identity</th><th>Suits</th><th>Power</th><th>Verse</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function setWeaponFilter(c){ state.meta.weaponFilter=c; save(); renderWeapons(); lucide.createIcons(); }

  function weaponCard(w){
    const slots=(w.powerSlots||[]).map(s=>{
      const locked=s.kind==='locked';
      const eq=locked?(s.lockedPowerId||s.equippedPowerId):s.equippedPowerId;
      return `<div class="flex items-center justify-between text-[11px] py-1.5 border-b border-gray-800/60 last:border-0 gap-2">
        <span class="px-1.5 py-0.5 rounded ${locked?'bg-slate-700 text-slate-200':'bg-amber-900/50 text-amber-200'}">${locked?'Locked':'Open'}</span>
        <span class="text-gray-300 truncate flex-1">${esc(s.label||'Slot')}</span>
        <span class="text-indigo-300 truncate max-w-[40%] text-right">${esc(powerName(eq))}</span>
      </div>`;
    }).join('')||'<div class="text-[11px] text-gray-600">No power slots</div>';
    const sug=(w.suggestedElements||[]).map(e=>`<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">${esc(e)}</span>`).join('');
    const iconHtml=w.icon?`<img src="../${esc(w.icon)}" alt="" class="w-11 h-11 rounded-lg object-cover border border-gray-700">`:`<div class="w-11 h-11 rounded-lg flex items-center justify-center text-xl font-bold" style="background:${w.color}22;color:${w.color};border:1px solid ${w.color}55">${esc(w.symbol||'?')}</div>`;
    return `<div class="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-3 min-w-0">
          ${iconHtml}
          <div class="min-w-0"><div class="text-sm font-semibold text-white leading-tight truncate">${esc(w.name)}${w.starter?' <span class="text-[10px] text-amber-400">starter</span>':''}</div>
            <div class="flex gap-1 mt-1 flex-wrap">
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">${esc(w.category||'Pistol')}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded ${w.slotPolicy==='locked_power'?'bg-slate-700 text-slate-200':'bg-amber-900/40 text-amber-200'}">${w.slotPolicy==='locked_power'?'Locked power':'Infusable'}</span>
            </div>
          </div>
        </div>
        <div class="flex gap-1 shrink-0"><button onclick="RGD.openWeaponModal('${w.id}')" class="text-gray-500 hover:text-white"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button><button onclick="RGD.deleteWeapon('${w.id}')" class="text-gray-500 hover:text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button></div>
      </div>
      ${w.fireIdentity?`<p class="text-[11px] text-cyan-300/80 mt-2 line-clamp-2">${esc(w.fireIdentity)}</p>`:''}
      ${w.desc?`<p class="text-[11px] text-gray-500 mt-1 line-clamp-2">${esc(w.desc)}</p>`:''}
      ${sug?`<div class="flex gap-1 mt-2 flex-wrap"><span class="text-[10px] text-gray-600">Suits:</span>${sug}</div>`:''}
      <div class="mt-3 text-[10px] text-gray-500 break-all"><span class="text-gray-600">UEFN:</span> <code class="text-indigo-300">${esc(w.uefnAsset||'—')}</code></div>
      <div class="mt-1 text-[10px] text-gray-500 break-all"><span class="text-gray-600">Verse:</span> <code class="text-emerald-300">${esc(w.verseClass||'—')}</code></div>
      <div class="mt-3 flex-1"><div class="text-[10px] text-gray-500 mb-1">Power slots</div>${slots}</div>
    </div>`;
  }

  function openWeaponModal(id){
    ensureWeapons(); ensureWizardry();
    const w=state.weapons.find(x=>x.id===id)||{name:'',category:'Pistol',symbol:'W',color:'#3b82f6',desc:'',fireIdentity:'',slotPolicy:'infusable',suggestedElements:[],powerSlots:[{kind:'open',label:'Element Infusion',rerollPolicy:'hub'}],uefnAsset:'',uefnIcon:'',icon:'',verseClass:'',upgrades:[]};
    const policy=w.slotPolicy||'infusable';
    const lockedId=(w.powerSlots&&w.powerSlots[0]&&(w.powerSlots[0].lockedPowerId||w.powerSlots[0].equippedPowerId))||'';
    const powerOpts=(state.wizardry||[]).filter(p=>p.kind==='locked_signature'||p.element==='Time').map(p=>`<option value="${esc(p.id)}" ${lockedId===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
    const sug=Array.isArray(w.suggestedElements)?w.suggestedElements.join(', '):'';
    modalShell(id?'Edit Player Weapon':'Add Player Weapon',`
      <div class="grid grid-cols-2 gap-3">
        ${field('Name',`<input id="mName" value="${esc(w.name||'')}" class="${IN}">`)}
        ${field('Category',`<select id="mCat" class="${IN}">${['Pistol','Assault Rifle','Shotgun','SMG','Sniper','Explosive','Bow','Heavy','Other'].map(t=>`<option ${(w.category||'Pistol')===t?'selected':''}>${t}</option>`).join('')}</select>`)}
        ${field('Symbol',`<input id="mSymbol" maxlength="1" value="${esc(w.symbol||'')}" class="${IN} text-center">`)}
        ${field('Color',`<input id="mColor" type="color" value="${w.color||'#3b82f6'}" class="w-full h-9 bg-gray-900 border border-gray-700 rounded-lg">`)}
      </div>
      ${field('Fire identity',`<textarea id="mFire" rows="2" class="${IN}">${esc(w.fireIdentity||'')}</textarea>`)}
      ${field('Description',`<textarea id="mDesc" rows="2" class="${IN}">${esc(w.desc||'')}</textarea>`)}
      <div class="grid grid-cols-2 gap-3">
        ${field('Slot policy',`<select id="mPolicy" class="${IN}" onchange="document.getElementById('mLockedWrap').style.display=this.value==='locked_power'?'block':'none'"><option value="infusable" ${policy==='infusable'?'selected':''}>Infusable (open element slot)</option><option value="locked_power" ${policy==='locked_power'?'selected':''}>Locked signature power</option></select>`)}
        ${field('Suggested elements',`<input id="mSug" value="${esc(sug)}" placeholder="Ice, Fire" class="${IN}">`)}
      </div>
      <div id="mLockedWrap" style="display:${policy==='locked_power'?'block':'none'}">${field('Locked power',`<select id="mLocked" class="${IN}"><option value="">—</option>${powerOpts}</select>`)}</div>
      ${field('UEFN Custom Weapon Path',`<input id="mAsset" value="${esc(w.uefnAsset||'')}" placeholder="/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_…" class="${IN} font-mono text-xs">`)}
      ${field('UEFN Icon Texture Path',`<input id="mIconAsset" value="${esc(w.uefnIcon||'')}" placeholder="/Roguelike/Weapons/Icons/T_Icon_…" class="${IN} font-mono text-xs">`)}
      ${field('Panel Icon (plugin SVG)',`<input id="mIcon" value="${esc(w.icon||'')}" placeholder="assets/weapons/pistol.svg" class="${IN} font-mono text-xs">`)}
      ${field('Verse class',`<input id="mVerse" value="${esc(w.verseClass||'')}" placeholder="weapon_service_pistol" class="${IN} font-mono text-xs">`)}
      <div class="mt-3"><div class="text-[11px] text-gray-400 mb-2">Shop price (0 = not sold / starter)</div>${priceFieldsHtml(w.price,'mWPrice')}</div>
      <div class="mt-3"><div class="text-[11px] text-gray-400 mb-2">Armory detail bars (0–100) — Damage / Accuracy / Range / Mobility / Fire Rate</div>
        <div class="grid grid-cols-2 gap-2">${ARMORY_STAT_FIELDS.map(s=>{
          const v=(w.stats&&w.stats[s.id]!=null)?w.stats[s.id]:'';
          return field(s.name, `<input id="mWStat_${esc(s.id)}" type="number" min="0" max="100" step="1" value="${esc(v)}" class="${IN}">`);
        }).join('')}</div>
      </div>
      <p class="text-[11px] text-gray-500">Open slots reroll at the hub between runs. Locked Time powers never accept element infusions.</p>
    `,`RGD.saveWeapon('${id||''}')`);
  }

  function saveWeapon(id){
    const name=val('mName').trim(); if(!name)return toast('Name required','warn');
    const policy=val('mPolicy')||'infusable';
    const sug=val('mSug').split(',').map(s=>s.trim()).filter(Boolean);
    let powerSlots;
    if(policy==='locked_power'){
      const pid=val('mLocked');
      const pname=powerName(pid);
      const prev=(id&&state.weapons.find(x=>x.id===id)||{}).powerSlots||[];
      const eq2=(prev[1]&&prev[1].kind==='open')?prev[1].equippedPowerId:null;
      powerSlots=[
        {id:'slot_signature',index:1,kind:'locked',accepts:[],rerollPolicy:'none',lockedPowerId:pid,equippedPowerId:pid,label:pname==='— empty —'?'Signature':pname},
        {id:'slot_element',index:2,kind:'open',accepts:['element_infusion','charged'],rerollPolicy:'hub',equippedPowerId:eq2,label:'Element Infusion'},
      ];
    } else {
      const prev=(id&&state.weapons.find(x=>x.id===id)||{}).powerSlots||[];
      const eq0=(prev[0]&&prev[0].kind==='open')?prev[0].equippedPowerId:null;
      const eq1=(prev[1]&&prev[1].kind==='open')?prev[1].equippedPowerId:null;
      powerSlots=[
        {id:'slot_element',index:1,kind:'open',accepts:['element_infusion','charged'],rerollPolicy:'hub',equippedPowerId:eq0,label:'Element Infusion'},
        {id:'slot_charged',index:2,kind:'open',accepts:['charged','element_infusion'],rerollPolicy:'hub',equippedPowerId:eq1,label:'Charged Scroll'},
      ];
    }
    const stats={};
    ARMORY_STAT_FIELDS.forEach(s=>{
      const el=document.getElementById('mWStat_'+s.id);
      if(!el) return;
      const raw=String(el.value||'').trim();
      if(raw==='') return;
      stats[s.id]=Math.max(0, Math.min(100, Number(raw)||0));
    });
    const prev=(id&&state.weapons.find(x=>x.id===id))||{};
    const rec={
      id:id||uid('weapon'), name, category:val('mCat')||'Pistol', symbol:val('mSymbol')||name[0].toUpperCase(),
      color:val('mColor'), desc:val('mDesc'), fireIdentity:val('mFire'),
      slotPolicy:policy, powerSlots, suggestedElements:sug,
      starter:!!prev.starter,
      uefnAsset:val('mAsset').trim(), uefnIcon:val('mIconAsset').trim(),
      icon:val('mIcon').trim()||('assets/weapons/'+(id||name.toLowerCase().replace(/[^a-z0-9]+/g,'_'))+'.svg'),
      verseClass:val('mVerse').trim()||('weapon_'+(id||name.toLowerCase().replace(/[^a-z0-9]+/g,'_'))),
      price:collectPrice('mWPrice'),
      stats,
      skins:Array.isArray(prev.skins)&&prev.skins.length>=4?prev.skins:demoSkinsFor({color:val('mColor')||'#9ca3af'}),
      upgrades:Array.isArray(prev.upgrades)?prev.upgrades:[]
    };
    if(id){ const i=state.weapons.findIndex(x=>x.id===id); state.weapons[i]=rec; }
    else state.weapons.push(rec);
    try{ if(typeof syncArmoryScreenFromWeapons==='function') syncArmoryScreenFromWeapons({force:true}); }catch(e){}
    save({flush:true}); closeModal(); renderWeapons(); toast('Weapon saved','ok');
  }
  function deleteWeapon(id){
    const w=(state.weapons||[]).find(x=>x.id===id); const label=w?w.name:id;
    confirmModal('Delete Weapon',
      'Really delete weapon <code class="text-indigo-300">'+esc(label)+'</code>?',
      "RGD.confirmDeleteWeapon('"+id+"')");
  }
  function confirmDeleteWeapon(id){
    closeModal();
    state.weapons=(state.weapons||[]).filter(w=>w.id!==id);
    try{ if(typeof syncArmoryScreenFromWeapons==='function') syncArmoryScreenFromWeapons({force:true}); }catch(e){}
    save({flush:true}); renderWeapons(); toast('Weapon deleted','ok');
  }

