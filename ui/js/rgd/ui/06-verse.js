  /* ======================================================================
     UI SCREENS — 06 · VERSE CODEGEN
     Turns a screen tree into a *_canvas builder class in the same shape as the
     project's existing top_hud_canvas.verse, plus a device stub that shows and
     hides it. Only fields that exist on the real widget classes are emitted —
     verified against Fortnite.digest / UnrealEngine.digest:

       text_block      DefaultText / DefaultTextColor / DefaultTextSize /
                       DefaultTextOpacity / DefaultJustification / DefaultShadow*
       color_block     DefaultColor / DefaultOpacity / DefaultDesiredSize
       texture_block   DefaultImage / DefaultTint / DefaultDesiredSize
       material_block  DefaultImage / DefaultTint / DefaultDesiredSize
       button          chrome-less Slot := button_slot{ Widget := overlay{ border, fill, text } }
       canvas_slot     Anchors / Offsets / Alignment / SizeToContent / ZOrder
       stack_box_slot  HorizontalAlignment / VerticalAlignment / Padding / Distribution
       overlay_slot    HorizontalAlignment / VerticalAlignment / Padding
       props.asButton  wraps overlay/stack in the same native button pattern

     DefaultText is `<localizes>:message`, so a bare string literal does NOT
     compile — every label becomes a module-scope `<localizes>` constant that the
     archetype references. Module scope specifically: a class field initialiser
     cannot read a sibling class member ("Accessing instance member ... is not yet
     implemented"), which rules out putting the messages inside the class. Names
     are prefixed with the class so two screens in the same folder cannot clash.

     A node with a `bind` becomes a class field so runtime code can call
     SetText / SetColor / SetDesiredSize on it; everything else is inlined.
     ====================================================================== */

  const VI = '    ';                                   /* one Verse indent */
  function vind(n){ return VI.repeat(n); }
  function vf(v){
    const x=Math.round((+v||0)*100)/100;
    return Number.isInteger(x) ? x.toFixed(1) : String(x);
  }
  function vstr(s){
    return '"' + String(s==null?'':s)
      .replace(/\\/g,'\\\\').replace(/"/g,'\\"')
      .replace(/\r/g,'').replace(/\n/g,'\\n') + '"';
  }
  function vcol(tok){ return `MakeColorFromHex(${vstr(uiHex6(tok))})`; }
  function vvec(x,y){ return `vector2{X := ${vf(x)}, Y := ${vf(y)}}`; }
  function vmargin(m){ const a=m||[0,0,0,0]; return `margin{Left := ${vf(a[0])}, Top := ${vf(a[1])}, Right := ${vf(a[2])}, Bottom := ${vf(a[3])}}`; }
  function vAnchors(s){ return `anchors{Minimum := ${vvec(s.aMin[0],s.aMin[1])}, Maximum := ${vvec(s.aMax[0],s.aMax[1])}}`; }
  function vIdent(s){
    const t=String(s||'').replace(/[^A-Za-z0-9_]/g,'');
    return /^[A-Za-z_]/.test(t) ? t : ('W'+t);
  }

  /* Localisable string table, collected while the tree is emitted. */
  let _uiMsg = null;
  function uiMsgRef(text){
    const s = String(text==null?'':text);
    if(!_uiMsg) return vstr(s);
    if(_uiMsg.map[s]) return _uiMsg.map[s];
    const name = _uiMsg.prefix + '_Msg' + (_uiMsg.order.length+1);
    _uiMsg.map[s]=name; _uiMsg.order.push({name, text:s});
    return name;
  }

  function uiVerseIndentLines(lines, extraDepth){
    const pad=vind(extraDepth);
    return lines.map(l=>pad+l);
  }

  /* Wrap an inner widget body in native chrome-less button{ Slot := button_slot{ Widget := ... } }. */
  function uiVerseAsButton(innerBody){
    const out=['button:'];
    out.push(VI+'Slot := button_slot:');
    out.push(VI+VI+'HorizontalAlignment := horizontal_alignment.Fill');
    out.push(VI+VI+'VerticalAlignment := vertical_alignment.Fill');
    out.push(VI+VI+'Widget := '+innerBody[0]);
    for(let i=1;i<innerBody.length;i++) out.push(VI+VI+innerBody[i]);
    return out;
  }

  function uiVerseLabelButtonBody(p){
    const st=UI_BUTTON_STYLE[p.variant]||UI_BUTTON_STYLE.loud;
    const w=p.w!=null?+p.w:st.w, h=p.h!=null?+p.h:st.h;
    const inner=[
      'overlay:',
      VI+'Slots := array:',
      VI+VI+'overlay_slot:',
      VI+VI+VI+'HorizontalAlignment := horizontal_alignment.Fill',
      VI+VI+VI+'VerticalAlignment := vertical_alignment.Fill',
      VI+VI+VI+'Widget := color_block:',
      VI+VI+VI+VI+`DefaultColor := MakeColorFromHex(${vstr(st.border)})`,
      VI+VI+VI+VI+'DefaultOpacity := 1.0',
      VI+VI+VI+VI+`DefaultDesiredSize := ${vvec(w,h)}`,
      VI+VI+'overlay_slot:',
      VI+VI+VI+'HorizontalAlignment := horizontal_alignment.Fill',
      VI+VI+VI+'VerticalAlignment := vertical_alignment.Fill',
      VI+VI+VI+'Padding := margin{Left := 2.0, Top := 2.0, Right := 2.0, Bottom := 2.0}',
      VI+VI+VI+'Widget := color_block:',
      VI+VI+VI+VI+`DefaultColor := MakeColorFromHex(${vstr(st.fill)})`,
      VI+VI+VI+VI+`DefaultOpacity := ${vf(st.fillOp)}`,
      VI+VI+VI+VI+`DefaultDesiredSize := ${vvec(w-4,h-4)}`,
      VI+VI+'overlay_slot:',
      VI+VI+VI+'HorizontalAlignment := horizontal_alignment.Center',
      VI+VI+VI+'VerticalAlignment := vertical_alignment.Center',
      VI+VI+VI+'Widget := text_block:',
      VI+VI+VI+VI+`DefaultText := ${uiMsgRef(p.text)}`,
      VI+VI+VI+VI+`DefaultTextColor := MakeColorFromHex(${vstr(st.text)})`,
      VI+VI+VI+VI+`DefaultTextSize := ${vf(st.textSize)}`,
      VI+VI+VI+VI+'DefaultJustification := text_justification.Center',
    ];
    return uiVerseAsButton(inner);
  }

  /* ---- widget body: [headerLine, ...fieldLines] at zero indent ---- */
  function uiVerseWidgetBody(n, opts){
    const p=n.props||{}, out=[];
    switch(n.type){
      case 'text': {
        out.push('text_block:');
        out.push(VI+`DefaultText := ${uiMsgRef(p.text)}`);
        out.push(VI+`DefaultTextColor := ${vcol(p.color)}`);
        out.push(VI+`DefaultTextSize := ${vf(uiSize(p.size))}`);
        out.push(VI+`DefaultJustification := text_justification.${p.justify||'Left'}`);
        if(p.opacity!=null && +p.opacity!==1) out.push(VI+`DefaultTextOpacity := ${vf(p.opacity)}`);
        if(p.wrap && +p.wrapWidth>0){
          out.push(VI+'AutoWrap := true');
          out.push(VI+`WrapWidth := ${vf(p.wrapWidth)}`);
        }
        if(p.shadow){
          out.push(VI+`DefaultShadowOffset := option{${vvec(2,2)}}`);
          out.push(VI+`DefaultShadowColor := ${vcol(p.shadowColor)}`);
          out.push(VI+`DefaultShadowOpacity := ${vf(p.shadowOpacity==null?0.6:p.shadowOpacity)}`);
        }
        return out;
      }
      case 'rect':
        out.push('color_block:');
        out.push(VI+`DefaultColor := ${vcol(p.color)}`);
        out.push(VI+`DefaultOpacity := ${vf(p.opacity==null?1:p.opacity)}`);
        out.push(VI+`DefaultDesiredSize := ${vvec(p.w,p.h)}`);
        return out;
      case 'image': {
        /* Content paths like /Roguelike/... are not valid DefaultImage literals — use empty. */
        const img=String(p.image||'Textures.T_Empty');
        const safeImg=(img.startsWith('/') || img.includes('/')) && !img.startsWith('Textures.')
          ? 'Textures.T_Empty' : (img||'Textures.T_Empty');
        out.push('texture_block:');
        out.push(VI+`DefaultImage := ${safeImg}`);
        out.push(VI+`DefaultTint := ${vcol(p.tint||'#FFFFFF')}`);
        out.push(VI+`DefaultDesiredSize := ${vvec(p.w,p.h)}`);
        return out;
      }
      case 'material':
        out.push('material_block:');
        out.push(VI+`DefaultImage := ${p.material||'Materials.M_UI'}`);
        out.push(VI+`DefaultDesiredSize := ${vvec(p.w,p.h)}`);
        return out;
      case 'button':
        return uiVerseLabelButtonBody(p);
      case 'overlay': {
        const inner=['overlay:'].concat(uiVerseSlots(n, 'overlay_slot', 1, opts));
        return p.asButton ? uiVerseAsButton(inner) : inner;
      }
      case 'stack': {
        const inner=['stack_box:', VI+`Orientation := orientation.${(p.orient||'V')==='V'?'Vertical':'Horizontal'}`]
          .concat(uiVerseSlots(n, 'stack_box_slot', 1, opts));
        return p.asButton ? uiVerseAsButton(inner) : inner;
      }
      case 'canvas':
        out.push('canvas:');
        return out.concat(uiVerseSlots(n, 'canvas_slot', 1, opts));
    }
    return ['color_block:'];
  }

  /* ---- Slots := array: <slot> ... , indented `depth` levels below the widget ---- */
  function uiVerseSlots(n, slotType, depth, opts){
    const allowBindRef=!(opts&&opts.allowBindRef===false);
    const kids=(n.children||[]).slice();
    if(!kids.length) return [vind(depth)+'Slots := array{}'];
    if(slotType==='canvas_slot') kids.sort((a,b)=>((a.slot.z||0)-(b.slot.z||0)));
    const out=[vind(depth)+'Slots := array:'];
    for(const c of kids){
      const s=c.slot, d=depth+1;
      out.push(vind(d)+slotType+':');
      if(slotType==='canvas_slot'){
        out.push(vind(d+1)+`Anchors := ${vAnchors(s)}`);
        out.push(vind(d+1)+`Offsets := ${vmargin(s.off)}`);
        out.push(vind(d+1)+`Alignment := ${vvec(s.align[0],s.align[1])}`);
        if(s.stc) out.push(vind(d+1)+'SizeToContent := true');
        if(s.z)   out.push(vind(d+1)+`ZOrder := ${s.z|0}`);
      } else {
        out.push(vind(d+1)+`HorizontalAlignment := horizontal_alignment.${s.h||'Fill'}`);
        out.push(vind(d+1)+`VerticalAlignment := vertical_alignment.${s.v||'Fill'}`);
        out.push(vind(d+1)+`Padding := ${vmargin(s.pad)}`);
        if(slotType==='stack_box_slot' && s.dist!=null) out.push(vind(d+1)+`Distribution := option{${vf(s.dist)}}`);
      }
      if(c.name) out.push(vind(d+1)+`# ${c.name}`);
      if(c.bind && allowBindRef){
        out.push(vind(d+1)+`Widget := ${vIdent(c.bind)}`);
      } else {
        const body=uiVerseWidgetBody(c, opts);
        out.push(vind(d+1)+'Widget := '+body[0]);
        for(let i=1;i<body.length;i++) out.push(vind(d+1)+body[i]);
      }
    }
    return out;
  }

  function uiVerseBinds(screen){
    const binds=[];
    function walk(n, underAsBtnBind){
      if(!n) return;
      const isAsBtnBind=!!(n.bind && n.props && n.props.asButton);
      const meta=UI_TYPES[n.type];
      if(n.bind && meta){
        if(meta.container){
          if(n.props && n.props.asButton && !underAsBtnBind) binds.push(n);
        } else {
          /* Leaf binds always — including under asButton cards/rows so runtime
             SetText/SetColor (Level0Title, Diff0Bg, …) keep working. */
          binds.push(n);
        }
      }
      for(const c of n.children||[]) walk(c, underAsBtnBind||isAsBtnBind);
    }
    walk(screen.root, false);
    return binds;
  }

  /* Inner chrome for asButton — overlay/stack without wrapping in button{}. */
  function uiVerseAsButtonInnerBody(n, opts){
    const cleared=Object.assign({}, n, { props:Object.assign({}, n.props||{}, {asButton:false}) });
    return uiVerseWidgetBody(cleared, opts);
  }

  /* Verse has SetVisibility but no DefaultVisibility on archetypes — drop non-initial
     view layers so CreateCanvas mounts the designer-active view (listing / page 0). */
  function uiVersePruneViews(node){
    if(!node) return null;
    const v=node.props&&node.props.view;
    if(v && !v.initial) return null;
    const kids=[];
    for(const c of node.children||[]){
      const k=uiVersePruneViews(c);
      if(k) kids.push(k);
    }
    return Object.assign({}, node, { children:kids, props:Object.assign({}, node.props||{}), slot:Object.assign({}, node.slot||{}) });
  }

  function uiVerseCanvasFile(screen){
    const exportScreen=Object.assign({}, screen, { root:uiVersePruneViews(screen.root)||screen.root });
    const cls=exportScreen.verse.klass, binds=uiVerseBinds(exportScreen);
    const asBtnBinds=binds.filter(b=>b.props&&b.props.asButton);
    const leafBinds=binds.filter(b=>!(b.props&&b.props.asButton));
    _uiMsg = { prefix:cls, map:{}, order:[] };

    /* Leaf fields first (allowBindRef false). asButton fields are empty button{} —
       Slot is wired in CreateCanvas so nested leaf binds can be referenced
       (field initialisers cannot read sibling members). */
    const leafBlocks=leafBinds.map(b=>{
      const body=uiVerseWidgetBody(b, {allowBindRef:false});
      return { name:vIdent(b.bind), type:body[0].replace(':',''), body:body.slice(1), from:b.name };
    });
    const asBtnSetSlots=asBtnBinds.map(b=>{
      const inner=uiVerseAsButtonInnerBody(b, {allowBindRef:true});
      return { name:vIdent(b.bind), from:b.name, inner };
    });
    const rootBody=uiVerseWidgetBody(exportScreen.root, {allowBindRef:true});
    const msgs=_uiMsg.order;
    _uiMsg = null;

    const L=[];
    L.push('using { /Fortnite.com/UI }');
    L.push('using { /UnrealEngine.com/Temporary/UI }');
    L.push('using { /UnrealEngine.com/Temporary/SpatialMath }');
    L.push('using { /Verse.org/Colors }');
    L.push('');
    L.push(`# ${screen.name} — ${screen.stage}/${screen.category}`);
    L.push('# Generated by the Roguelike Design Platform · UI Screens tab.');
    L.push('# The tab is the source of truth: re-export replaces this file.');
    if(screen.notes) String(screen.notes).split('\n').forEach(t=>L.push('# '+t));
    L.push('');
    if(msgs.length){
      L.push('# Localisable strings. DefaultText is <localizes>:message, so every label');
      L.push('# has to be a message constant — module scope, because a class field cannot');
      L.push('# read a sibling class member.');
      for(const m of msgs) L.push(`${m.name}<localizes> : message = ${vstr(m.text)}`);
      L.push('');
    }
    L.push(`${cls}<public> := class():`);
    L.push('');
    if(leafBlocks.length || asBtnBinds.length){
      L.push(VI+'# Runtime-bound widgets. Hold this builder and call the setters');
      L.push(VI+'# (SetText / SetColor / SetDesiredSize) to update the live HUD.');
      for(const b of leafBlocks){
        L.push(VI+`# ${b.from}`);
        L.push(VI+`var ${b.name}<public> : ${b.type} = ${b.type}{`);
        for(const line of b.body) L.push(VI+line);
        L.push(VI+'}');
      }
      for(const b of asBtnBinds){
        L.push(VI+`# ${b.name} — Slot required at init; real chrome via SetWidget in CreateCanvas`);
        L.push(VI+`var ${vIdent(b.bind)}<public> : button = button{`);
        L.push(VI+VI+'Slot := button_slot:');
        L.push(VI+VI+VI+'HorizontalAlignment := horizontal_alignment.Fill');
        L.push(VI+VI+VI+'VerticalAlignment := vertical_alignment.Fill');
        L.push(VI+VI+VI+'Widget := color_block:');
        L.push(VI+VI+VI+VI+'DefaultOpacity := 0.0');
        L.push(VI+VI+VI+VI+'DefaultDesiredSize := vector2{X := 1.0, Y := 1.0}');
        L.push(VI+'}');
      }
      L.push('');
    }
    L.push(VI+'CreateCanvas<public>() : canvas =');
    for(const slot of asBtnSetSlots){
      L.push(vind(2)+`# ${slot.from}`);
      L.push(vind(2)+`${slot.name}.SetWidget(button_slot{`);
      L.push(vind(3)+'HorizontalAlignment := horizontal_alignment.Fill');
      L.push(vind(3)+'VerticalAlignment := vertical_alignment.Fill');
      L.push(vind(3)+'Widget := '+slot.inner[0]);
      for(let i=1;i<slot.inner.length;i++) L.push(vind(3)+slot.inner[i]);
      L.push(vind(2)+'})');
    }
    L.push(vind(2)+'Root : canvas = '+rootBody[0]);
    for(let i=1;i<rootBody.length;i++) L.push(vind(2)+rootBody[i]);
    L.push(vind(2)+'return Root');
    L.push('');
    return L.join('\n');
  }

  /* First bound chrome-less / label button — gamepad SetFocus target. */
  function uiVerseFirstFocusBind(screen){
    for(const b of uiVerseBinds(screen)){
      if(b.type==='button' || (b.props && b.props.asButton)) return vIdent(b.bind);
    }
    return null;
  }

  function uiVerseDeviceFile(screen){
    const exportScreen=Object.assign({}, screen, { root:uiVersePruneViews(screen.root)||screen.root });
    const cls=exportScreen.verse.klass, dev=cls.replace(/_canvas$/,'')+'_ui_device';
    const modal=['menu','shop','popup','dialog'].indexOf(exportScreen.category)>=0;
    const focusBind = modal ? uiVerseFirstFocusBind(exportScreen) : null;
    const L=[];
    L.push('using { /Fortnite.com/Devices }');
    L.push('using { /Fortnite.com/UI }');
    L.push('using { /UnrealEngine.com/Temporary/UI }');
    L.push('using { /Verse.org/Simulation }');
    L.push('');
    L.push(`# Show/hide wrapper for ${exportScreen.name}. Wire Show/Hide from your game loop.`);
    L.push(`${dev} := class(creative_device):`);
    L.push('');
    L.push(VI+`Builder : ${cls} = ${cls}{}`);
    L.push('');
    L.push(VI+'# Session-scoped only, never persisted — a stale entry is harmless because');
    L.push(VI+'# Show hides first and then overwrites it.');
    L.push(VI+'var Shown : [player]canvas = map{}');
    L.push('');
    L.push(VI+'Show<public>(Agent : agent) : void =');
    L.push(vind(2)+'if (Player := player[Agent], PlayerUI := GetPlayerUI[Player]):');
    L.push(vind(3)+'Hide(Agent)');
    L.push(vind(3)+'Canvas := Builder.CreateCanvas()');
    if(modal){
      if(focusBind){
        L.push(vind(3)+`PlayerUI.SetFocus(Builder.${focusBind})`);
        L.push(vind(3)+'PlayerUI.AddWidget(Canvas, player_ui_slot{ InputMode := ui_input_mode.All })');
      } else {
        L.push(vind(3)+'# No focusable widgets — All would soft-lock controllers.');
        L.push(vind(3)+'PlayerUI.AddWidget(Canvas, player_ui_slot{ InputMode := ui_input_mode.None })');
      }
    } else {
      L.push(vind(3)+'PlayerUI.AddWidget(Canvas)');
    }
    L.push(vind(3)+'if (set Shown[Player] = Canvas) {}');
    L.push('');
    L.push(VI+'Hide<public>(Agent : agent) : void =');
    L.push(vind(2)+'if (Player := player[Agent], PlayerUI := GetPlayerUI[Player], Canvas := Shown[Player]):');
    L.push(vind(3)+'PlayerUI.RemoveWidget(Canvas)');
    L.push('');
    return L.join('\n');
  }

  function uiVerseBundle(screen){
    return {
      canvasPath: `Content/Verse/${screen.verse.folder}/${screen.verse.file}`,
      canvasCode: uiVerseCanvasFile(screen),
      devicePath: `Content/Verse/${screen.verse.folder}/${screen.verse.klass.replace(/_canvas$/,'')}_ui_device.verse`,
      deviceCode: uiVerseDeviceFile(screen),
      binds: uiVerseBinds(screen).map(b=>({ name:vIdent(b.bind), type:UI_TYPES[b.type].verse, from:b.name })),
    };
  }
