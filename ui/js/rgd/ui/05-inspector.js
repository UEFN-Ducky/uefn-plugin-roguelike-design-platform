  /* ======================================================================
     UI SCREENS — 05 · LAYER TREE + INSPECTOR
     Left of the inspector is the widget tree; right of it is every field that
     the Verse generator can emit. Nothing is editable here that cannot be
     exported, and nothing is exported that cannot be edited here.
     ====================================================================== */

  const UI_ANCHOR_PRESETS = {
    'Top left':      {aMin:[0,0],   aMax:[0,0],   align:[0,0]},
    'Top centre':    {aMin:[0.5,0], aMax:[0.5,0], align:[0.5,0]},
    'Top right':     {aMin:[1,0],   aMax:[1,0],   align:[1,0]},
    'Centre':        {aMin:[0.5,0.5],aMax:[0.5,0.5],align:[0.5,0.5]},
    'Bottom left':   {aMin:[0,1],   aMax:[0,1],   align:[0,1]},
    'Bottom centre': {aMin:[0.5,1], aMax:[0.5,1], align:[0.5,1]},
    'Bottom right':  {aMin:[1,1],   aMax:[1,1],   align:[1,1]},
    'Stretch all':   {aMin:[0,0],   aMax:[1,1],   align:[0,0]},
    'Stretch top':   {aMin:[0,0],   aMax:[1,0],   align:[0,0]},
    'Stretch bottom':{aMin:[0,1],   aMax:[1,1],   align:[0,0]},
  };
  function uiAnchorPresetName(s){
    for(const k of Object.keys(UI_ANCHOR_PRESETS)){
      const p=UI_ANCHOR_PRESETS[k];
      if(p.aMin[0]===s.aMin[0]&&p.aMin[1]===s.aMin[1]&&p.aMax[0]===s.aMax[0]&&p.aMax[1]===s.aMax[1]) return k;
    }
    return 'Custom';
  }

  /* ---- tiny form controls, styled to match the rest of the panel ---- */
  const uiInpCls='w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:border-indigo-500 focus:outline-none';
  function uiRowLbl(label, control){
    return `<label class="flex items-center gap-2 mb-1.5"><span class="w-24 shrink-0 text-[11px] text-gray-400">${esc(label)}</span><span class="flex-1 min-w-0">${control}</span></label>`;
  }
  function uiNum(val, handler, step){
    return `<input type="number" step="${step||1}" value="${val==null?0:val}" onchange="${handler}" class="${uiInpCls}">`;
  }
  function uiTxt(val, handler){
    return `<input type="text" value="${esc(val==null?'':val)}" onchange="${handler}" class="${uiInpCls}">`;
  }
  function uiSel(val, opts, handler){
    return `<select onchange="${handler}" class="${uiInpCls}">${opts.map(o=>{
      const v=typeof o==='string'?o:o.v, l=typeof o==='string'?o:o.l;
      return `<option value="${esc(v)}" ${String(v)===String(val)?'selected':''}>${esc(l)}</option>`;
    }).join('')}</select>`;
  }
  function uiChk(val, handler){
    return `<input type="checkbox" ${val?'checked':''} onchange="${handler}" class="w-4 h-4 accent-indigo-500">`;
  }
  function uiColorField(val, handler){
    const isTok = val && val.charAt(0)!=='#';
    const opts=[{v:'',l:'— custom hex —'}].concat(UI_COLOR_TOKENS.map(t=>({v:t,l:t})));
    return `<span class="flex items-center gap-1.5">
      <span class="w-5 h-5 rounded shrink-0 border border-gray-600" style="background:${uiColor(val)}"></span>
      ${uiSel(isTok?val:'', opts, handler.replace('$V','this.value'))}
      <input type="text" value="${esc(isTok?'':(val||''))}" placeholder="#RRGGBB" onchange="${handler.replace('$V','this.value')}" class="${uiInpCls} w-24">
    </span>`;
  }
  function uiQuad(vals, handler, labels){
    const L=labels||['L','T','R','B'];
    return `<span style="display:grid;grid-template-columns:repeat(${L.length},minmax(0,1fr));gap:4px">${L.map((l,i)=>
      `<span class="flex items-center gap-0.5"><span class="text-[10px] text-gray-500">${l}</span>
       <input type="number" value="${vals[i]||0}" onchange="${handler.replace('$I',i)}" class="${uiInpCls} px-1">`+
      `</span>`).join('')}</span>`;
  }

  /* ---- layer tree ---- */
  function uiCollapsedMap(){
    if(!state.meta) state.meta={};
    if(!state.meta.uiCollapsed || typeof state.meta.uiCollapsed!=='object') state.meta.uiCollapsed={};
    return state.meta.uiCollapsed;
  }
  function uiIsCollapsed(node){
    const map=uiCollapsedMap();
    if(Object.prototype.hasOwnProperty.call(map, node.id)) return !!map[node.id];
    return !!(node.props&&node.props.collapseDefault);
  }
  function uiLayerRows(node, depth, selId, parentType){
    const meta=UI_TYPES[node.type];
    const on = node.id===selId;
    const bind = node.bind ? `<span class="ui-bind-pill">${esc(node.bind)}</span>` : '';
    const kids=node.children||[];
    const hasKids=!!(meta.container && kids.length);
    const collapsed=hasKids && uiIsCollapsed(node);
    const chev=hasKids
      ? `<button type="button" class="ui-layer-chev" onclick="event.stopPropagation();RGD.uiToggleCollapse('${node.id}')" title="${collapsed?'Expand':'Collapse'}"><i data-lucide="${collapsed?'chevron-right':'chevron-down'}" class="w-3 h-3"></i></button>`
      : `<span class="ui-layer-chev-spacer"></span>`;
    const viewPill=(node.props&&node.props.view)?`<span class="ui-view-pill">${esc(node.props.view.group)}:${esc(node.props.view.id)}</span>`:'';
    let html=`<div class="ui-layer${on?' is-sel':''}" style="padding-left:${8+depth*14}px" onclick="RGD.uiSelect('${node.id}')">
      ${chev}
      <i data-lucide="${meta.icon}" class="w-3.5 h-3.5 shrink-0 ${on?'text-indigo-300':'text-gray-500'}"></i>
      <span class="ui-layer-name">${esc(node.name||meta.label)}</span>${bind}${viewPill}
      <span class="ui-layer-type">${meta.verse}</span></div>`;
    if(!collapsed){
      for(const c of kids) html+=uiLayerRows(c, depth+1, selId, node.type);
    }
    return html;
  }
  function uiExpandAncestors(root, id){
    if(!root||!id) return;
    const map=uiCollapsedMap();
    let cur=uiFindParent(root, id);
    while(cur){
      map[cur.id]=false;
      cur=uiFindParent(root, cur.id);
    }
  }

  /* ---- inspector ---- */
  function uiInspector(screen, sel){
    if(!sel) return `<div class="p-4 text-xs text-gray-500">Select a widget in the preview or the layer tree.</div>`;
    const parent=uiFindParent(screen.root, sel.id);
    const kind=parent?uiSlotKind(parent.type):null;
    const P=`RGD.uiProp('${sel.id}',`, S=`RGD.uiSlot('${sel.id}',`;
    const meta=UI_TYPES[sel.type], p=sel.props, s=sel.slot;
    const sec=(t,b)=>`<div class="ui-sec"><div class="ui-sec-h">${t}</div><div class="ui-sec-b">${b}</div></div>`;

    /* node */
    let node = uiRowLbl('Name', uiTxt(sel.name, `RGD.uiNode('${sel.id}','name',this.value)`));
    node += uiRowLbl('Verse type', `<span class="text-[11px] font-mono text-indigo-300">${meta.verse}</span>`);
    if(!meta.container || (sel.props && sel.props.asButton)) node += uiRowLbl('Bind as', uiTxt(sel.bind||'', `RGD.uiNode('${sel.id}','bind',this.value)`))
      + `<div class="text-[10px] text-gray-500 -mt-1 mb-1">Named widgets become class fields you can SetText/SetColor at runtime.</div>`;
    if(meta.container && sel.type!=='canvas') node += uiRowLbl('Whole element is a button', uiChk(!!(sel.props&&sel.props.asButton), `RGD.uiProp('${sel.id}','asButton',this.checked)`))
      + `<div class="text-[10px] text-gray-500 -mt-1 mb-1">Wraps this container in a native chrome-less button so the entire card/row is clickable.</div>`;
    if(meta.container){
      const v=p.view||{};
      node += uiRowLbl('View group', uiTxt(v.group||'', `RGD.uiViewField('${sel.id}','group',this.value)`))
        + uiRowLbl('View id', uiTxt(v.id||'', `RGD.uiViewField('${sel.id}','id',this.value)`))
        + uiRowLbl('Initial view', uiChk(!!v.initial, `RGD.uiViewField('${sel.id}','initial',this.checked)`))
        + `<div class="text-[10px] text-gray-500 -mt-1 mb-1">Preview-only: one visible child per group. Exporter ignores this.</div>`;
    }
    if((sel.type==='button') || (sel.props&&sel.props.asButton)){
      node += uiRowLbl('Preview state', uiSel(p.state||'normal', ['normal','hot','selected','locked'], `${P}'state',this.value)`))
        + `<div class="text-[10px] text-gray-500 -mt-1 mb-1">Designer-only ApplyVisual skin (hot / selected / locked).</div>`;
    }

    /* slot */
    let slot='<div class="text-[11px] text-gray-500">Root widget — the canvas fills the screen.</div>';
    if(kind==='canvas'){
      slot = uiRowLbl('Anchor', uiSel(uiAnchorPresetName(s), ['Custom'].concat(Object.keys(UI_ANCHOR_PRESETS)), `RGD.uiAnchorPreset('${sel.id}',this.value)`))
        + uiRowLbl('Anchor min', uiQuad([s.aMin[0],s.aMin[1]], `${S}'aMin',$I,+this.value)`, ['X','Y']))
        + uiRowLbl('Anchor max', uiQuad([s.aMax[0],s.aMax[1]], `${S}'aMax',$I,+this.value)`, ['X','Y']))
        + uiRowLbl('Offsets', uiQuad(s.off, `${S}'off',$I,+this.value)`))
        + uiRowLbl('Alignment', uiQuad([s.align[0],s.align[1]], `${S}'align',$I,+this.value)`, ['X','Y']))
        + uiRowLbl('Z order', uiNum(s.z, `${S}'z',null,+this.value)`))
        + uiRowLbl('Size to content', uiChk(s.stc, `${S}'stc',null,this.checked)`))
        + `<div class="text-[10px] text-gray-500 mt-1">Per axis: anchor min = max → Offsets L/T is position, R/B is size. Otherwise they are insets.</div>`;
    } else if(kind==='flow'){
      slot = uiRowLbl('Horizontal', uiSel(s.h, ['Fill','Left','Center','Right'], `${S}'h',null,this.value)`))
        + uiRowLbl('Vertical', uiSel(s.v, ['Fill','Top','Center','Bottom'], `${S}'v',null,this.value)`))
        + uiRowLbl('Padding', uiQuad(s.pad, `${S}'pad',$I,+this.value)`));
      if(parent.type==='stack') slot += uiRowLbl('Distribution', uiTxt(s.dist==null?'':s.dist, `${S}'dist',null,this.value)`))
        + `<div class="text-[10px] text-gray-500 -mt-1">Blank = size to content. A number takes that share of the leftover space.</div>`;
    }

    /* props */
    let props='';
    if(sel.type==='text'){
      props = uiRowLbl('Text', `<textarea rows="2" onchange="${P}'text',this.value)" class="${uiInpCls}">${esc(p.text)}</textarea>`)
        + uiRowLbl('Size', uiSel(String(uiSize(p.size)), UI_TYPE_TOKENS.map(t=>({v:String(uiTheme().type[t]),l:`${t} · ${uiTheme().type[t]}px`})).concat([{v:String(uiSize(p.size)),l:uiSize(p.size)+'px (custom)'}]), `${P}'size',+this.value)`))
        + uiRowLbl('Colour', uiColorField(p.color, `${P}'color',$V)`))
        + uiRowLbl('Opacity', uiNum(p.opacity, `${P}'opacity',+this.value)`, 0.05))
        + uiRowLbl('Justify', uiSel(p.justify, ['Left','Center','Right'], `${P}'justify',this.value)`))
        + uiRowLbl('Wrap', uiChk(p.wrap, `${P}'wrap',this.checked)`))
        + (p.wrap?uiRowLbl('Wrap width', uiNum(p.wrapWidth, `${P}'wrapWidth',+this.value)`)):'')
        + uiRowLbl('Shadow', uiChk(p.shadow, `${P}'shadow',this.checked)`));
    } else if(sel.type==='rect'){
      props = uiRowLbl('Colour', uiColorField(p.color, `${P}'color',$V)`))
        + uiRowLbl('Opacity', uiNum(p.opacity, `${P}'opacity',+this.value)`, 0.05))
        + uiRowLbl('Width', uiNum(p.w, `${P}'w',+this.value)`))
        + uiRowLbl('Height', uiNum(p.h, `${P}'h',+this.value)`));
    } else if(sel.type==='image'){
      props = uiRowLbl('Image', uiTxt(p.image, `${P}'image',this.value)`))
        + `<div class="text-[10px] text-gray-500 -mt-1 mb-1">A Verse texture identifier, e.g. Textures.T_Empty — not a /Game path.</div>`
        + uiRowLbl('Tint', uiColorField(p.tint, `${P}'tint',$V)`))
        + uiRowLbl('Width', uiNum(p.w, `${P}'w',+this.value)`))
        + uiRowLbl('Height', uiNum(p.h, `${P}'h',+this.value)`));
    } else if(sel.type==='material'){
      props = uiRowLbl('Material', uiTxt(p.material, `${P}'material',this.value)`))
        + uiRowLbl('Width', uiNum(p.w, `${P}'w',+this.value)`))
        + uiRowLbl('Height', uiNum(p.h, `${P}'h',+this.value)`));
    } else if(sel.type==='button'){
      props = uiRowLbl('Label', uiTxt(p.text, `${P}'text',this.value)`))
        + uiRowLbl('Variant', uiSel(p.variant, [{v:'loud',l:'Primary (gold)'},{v:'regular',l:'Row'},{v:'quiet',l:'Ghost'},{v:'danger',l:'Danger'}], `${P}'variant',this.value)`));
    } else if(sel.type==='stack'){
      props = uiRowLbl('Orientation', uiSel(p.orient, [{v:'V',l:'Vertical'},{v:'H',l:'Horizontal'}], `${P}'orient',this.value)`));
      if(p.asButton) props += uiRowLbl('Button skin', uiSel(p.variant||'row', [{v:'loud',l:'Primary'},{v:'regular',l:'Row'},{v:'quiet',l:'Ghost'},{v:'card',l:'Card'},{v:'row',l:'Row'},{v:'danger',l:'Danger'}], `${P}'variant',this.value)`));
    } else if(sel.type==='overlay'){
      if(p.asButton) props = uiRowLbl('Button skin', uiSel(p.variant||'card', [{v:'loud',l:'Primary'},{v:'regular',l:'Row'},{v:'quiet',l:'Ghost'},{v:'card',l:'Card'},{v:'row',l:'Row'},{v:'danger',l:'Danger'}], `${P}'variant',this.value)`));
      else props = `<div class="text-[11px] text-gray-500">${meta.label} has no properties of its own — it only positions its children.</div>`;
    } else {
      props = `<div class="text-[11px] text-gray-500">${meta.label} has no properties of its own — it only positions its children.</div>`;
    }

    /* add-child palette for containers */
    let add='';
    if(meta.container){
      add = `<div class="flex flex-wrap gap-1">${Object.keys(UI_TYPES).map(t=>
        `<button onclick="RGD.uiAdd('${t}')" class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px] flex items-center gap-1"><i data-lucide="${UI_TYPES[t].icon}" class="w-3 h-3"></i>${UI_TYPES[t].label}</button>`).join('')}</div>`;
    }

    return sec('Widget', node)
      + sec('Slot in '+(parent?UI_TYPES[parent.type].verse:'—'), slot)
      + sec('Properties', props)
      + (add?sec('Add child', add):'')
      + sec('Actions', `<div class="flex flex-wrap gap-1">
          <button onclick="RGD.uiMoveSel(-1)" class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px]">↑ Up</button>
          <button onclick="RGD.uiMoveSel(1)" class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px]">↓ Down</button>
          <button onclick="RGD.uiDupSel()" class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px]">Duplicate</button>
          <button onclick="RGD.uiDelSel()" class="px-2 py-1 rounded bg-red-900/70 hover:bg-red-800 text-[11px] text-red-200">Delete</button>
        </div>`);
  }
