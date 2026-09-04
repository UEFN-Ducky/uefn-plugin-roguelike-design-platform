  /* ======================================================================
     UI SCREENS — 04 · LAYOUT + PREVIEW RENDERER
     Reimplements the three Verse layout panels (canvas / overlay / stack_box)
     with the same rules UMG uses, then paints the result as absolutely
     positioned divs on a 1920x1080 stage. If the preview is wrong the Verse
     will be wrong, so the maths here is the contract — not the CSS.

     canvas_slot per axis:
       anchor min == max  -> Offsets.L/T is the position, Offsets.R/B is the size
       anchor min != max  -> Offsets.L/T is the near inset, R/B is the far inset
       Alignment is the widget's own pivot (0,0 top-left .. 1,1 bottom-right)
     ====================================================================== */

  /* Fortnite's UI font is condensed; 0.50em average advance tracks it closely
     enough to catch overflow in the preview. */
  const UI_CHAR_W = 0.50, UI_LINE_H = 1.26;

  function uiTextSize(props){
    const size=uiSize(props.size||18);
    const str=String(props.text==null?'':props.text);
    const lines=str.split('\n');
    let w=0; for(const l of lines) w=Math.max(w, l.length*size*UI_CHAR_W);
    let n=lines.length;
    if(props.wrap && props.wrapWidth>0 && w>props.wrapWidth){
      n=Math.ceil(w/props.wrapWidth); w=props.wrapWidth;
    }
    return { w:Math.ceil(w), h:Math.ceil(size*UI_LINE_H*n) };
  }
  function uiButtonSize(props){
    const label=String(props.text||'');
    return { w:Math.max(180, Math.ceil(label.length*11)+80), h:56 };
  }
  function uiPadOf(n){ const p=(n.slot&&n.slot.pad)||[0,0,0,0]; return {l:p[0]||0,t:p[1]||0,r:p[2]||0,b:p[3]||0}; }

  /* Desired size, ignoring the slot's own padding (the parent adds that). */
  function uiMeasure(n, availW, availH){
    if(!n) return {w:0,h:0};
    switch(n.type){
      case 'text':     return uiTextSize(n.props);
      case 'button':   return uiButtonSize(n.props);
      case 'rect':
      case 'image':
      case 'material': return { w:+n.props.w||0, h:+n.props.h||0 };
      case 'canvas':   return { w:availW, h:availH };
      case 'overlay': {
        let w=0,h=0;
        for(const c of n.children||[]){
          const p=uiPadOf(c), d=uiMeasure(c, availW, availH);
          w=Math.max(w, d.w+p.l+p.r); h=Math.max(h, d.h+p.t+p.b);
        }
        return {w,h};
      }
      case 'stack': {
        const vert=(n.props.orient||'V')==='V';
        let along=0, cross=0;
        for(const c of n.children||[]){
          const p=uiPadOf(c), d=uiMeasure(c, availW, availH);
          const cw=d.w+p.l+p.r, ch=d.h+p.t+p.b;
          if(vert){ along+=ch; cross=Math.max(cross,cw); } else { along+=cw; cross=Math.max(cross,ch); }
        }
        return vert ? {w:cross,h:along} : {w:along,h:cross};
      }
      default: return {w:0,h:0};
    }
  }

  function uiCanvasRect(slot, pw, ph, desired){
    const a0=slot.aMin||[0,0], a1=slot.aMax||[0,0], o=slot.off||[0,0,0,0], al=slot.align||[0,0];
    let x,y,w,h;
    if(a0[0]===a1[0]){ w = slot.stc ? desired.w : (+o[2]||0); x = a0[0]*pw + (+o[0]||0) - (al[0]||0)*w; }
    else { const left=a0[0]*pw+(+o[0]||0), right=a1[0]*pw-(+o[2]||0); x=left; w=Math.max(0,right-left); }
    if(a0[1]===a1[1]){ h = slot.stc ? desired.h : (+o[3]||0); y = a0[1]*ph + (+o[1]||0) - (al[1]||0)*h; }
    else { const top=a0[1]*ph+(+o[1]||0), bot=a1[1]*ph-(+o[3]||0); y=top; h=Math.max(0,bot-top); }
    return {x,y,w,h};
  }
  function uiAlignIn(boxPos, boxLen, want, mode){
    if(mode==='Fill') return {pos:boxPos, len:boxLen};
    const len=Math.min(want, boxLen);
    if(mode==='Left'||mode==='Top')     return {pos:boxPos, len};
    if(mode==='Right'||mode==='Bottom') return {pos:boxPos+boxLen-len, len};
    return {pos:boxPos+(boxLen-len)/2, len};
  }

  /* Active designer view chips: one id per group (mode / category / page). */
  function uiActiveViews(){
    const m=(state.meta&&state.meta.uiViews)||{};
    return m;
  }
  function uiViewVisible(n){
    const v=n&&n.props&&n.props.view;
    if(!v||!v.group) return true;
    /* Mode hosts stay mounted so list↔details can slide (React ShopUI). */
    if(v.group==='mode') return true;
    const active=uiActiveViews()[v.group];
    if(active==null||active==='') return !!v.initial;
    return String(active)===String(v.id);
  }
  function uiModeSlideState(modeId){
    const activeRaw=uiActiveViews().mode;
    const active=(activeRaw!=null&&activeRaw!=='')?String(activeRaw):'listing';
    const on=String(active)===String(modeId);
    if(String(modeId)==='listing') return on?{dx:0,op:1,cls:'is-on'}:{dx:-UI_STAGE_W,op:0,cls:'is-off-left'};
    if(String(modeId)==='details') return on?{dx:0,op:1,cls:'is-on'}:{dx:UI_STAGE_W,op:0,cls:'is-off-right'};
    return on?{dx:0,op:1,cls:'is-on'}:{dx:0,op:0,cls:'is-off'};
  }
  function uiCollectViews(root){
    const groups={};
    uiWalk(root, n=>{
      const v=n.props&&n.props.view;
      if(!v||!v.group) return;
      if(!groups[v.group]) groups[v.group]=[];
      if(!groups[v.group].some(x=>x.id===v.id)) groups[v.group].push({id:v.id, label:v.label||v.id, initial:!!v.initial});
    });
    return groups;
  }
  function uiEnsureViewDefaults(root){
    if(!state.meta) state.meta={};
    if(!state.meta.uiViews) state.meta.uiViews={};
    const groups=uiCollectViews(root);
    Object.keys(groups).forEach(g=>{
      if(state.meta.uiViews[g]==null||state.meta.uiViews[g]===''){
        const init=groups[g].find(x=>x.initial)||groups[g][0];
        if(init) state.meta.uiViews[g]=init.id;
      }
    });
    return groups;
  }

  /* Flatten the tree into painted boxes in stage coordinates, in paint order. */
  function uiFlatten(root){
    const out=[];
    function place(n, rect, depth, fxIndex, modeSlide){
      if(!uiViewVisible(n)) return;
      let nextSlide=modeSlide||null;
      if(n.props&&n.props.modeSlide){
        nextSlide=uiModeSlideState(n.props.view&&n.props.view.id||n.props.modeSlide);
      }
      out.push({node:n, ...rect, depth, fxIndex:fxIndex||0, modeSlide:nextSlide});
      if(!UI_TYPES[n.type].container) return;
      const kids=(n.children||[]).filter(uiViewVisible);
      if(n.type==='canvas'){
        kids.sort((a,b)=>((a.slot.z||0)-(b.slot.z||0)));
        kids.forEach((c,i)=>{
          const d=uiMeasure(c, rect.w, rect.h);
          const r=uiCanvasRect(c.slot, rect.w, rect.h, d);
          place(c, {x:rect.x+r.x, y:rect.y+r.y, w:r.w, h:r.h}, depth+1, i, nextSlide);
        });
        return;
      }
      if(n.type==='overlay'){
        kids.forEach((c,i)=>{
          const p=uiPadOf(c);
          const bx=rect.x+p.l, by=rect.y+p.t, bw=Math.max(0,rect.w-p.l-p.r), bh=Math.max(0,rect.h-p.t-p.b);
          const d=uiMeasure(c, bw, bh);
          const H=uiAlignIn(bx,bw,d.w,c.slot.h||'Fill'), V=uiAlignIn(by,bh,d.h,c.slot.v||'Fill');
          place(c, {x:H.pos, y:V.pos, w:H.len, h:V.len}, depth+1, i, nextSlide);
        });
        return;
      }
      /* stack_box */
      const vert=(n.props.orient||'V')==='V';
      const total=vert?rect.h:rect.w;
      let fixed=0, weight=0;
      const meta=kids.map(c=>{
        const p=uiPadOf(c), d=uiMeasure(c, rect.w, rect.h);
        const along=(vert? d.h+p.t+p.b : d.w+p.l+p.r);
        const dist=(c.slot.dist==null?null:+c.slot.dist);
        if(dist==null) fixed+=along; else weight+=dist;
        return {c,p,d,along,dist};
      });
      const free=Math.max(0, total-fixed);
      let cursor=vert?rect.y:rect.x;
      meta.forEach((m,i)=>{
        const span=(m.dist==null) ? m.along : (weight>0 ? free*(m.dist/weight) : 0);
        if(vert){
          const by=cursor+m.p.t, bh=Math.max(0,span-m.p.t-m.p.b);
          const bx=rect.x+m.p.l, bw=Math.max(0,rect.w-m.p.l-m.p.r);
          const H=uiAlignIn(bx,bw,m.d.w,m.c.slot.h||'Fill'), V=uiAlignIn(by,bh,m.d.h,m.c.slot.v||'Fill');
          place(m.c, {x:H.pos, y:V.pos, w:H.len, h:V.len}, depth+1, i, nextSlide);
        } else {
          const bx=cursor+m.p.l, bw=Math.max(0,span-m.p.l-m.p.r);
          const by=rect.y+m.p.t, bh=Math.max(0,rect.h-m.p.t-m.p.b);
          const H=uiAlignIn(bx,bw,m.d.w,m.c.slot.h||'Fill'), V=uiAlignIn(by,bh,m.d.h,m.c.slot.v||'Fill');
          place(m.c, {x:H.pos, y:V.pos, w:H.len, h:V.len}, depth+1, i, nextSlide);
        }
        cursor+=span;
      });
    }
    place(root, {x:0,y:0,w:UI_STAGE_W,h:UI_STAGE_H}, 0, 0, null);
    return out;
  }

  /* ---- paint ---- */
  const UI_JUSTIFY_CSS={Left:'flex-start', Center:'center', Right:'flex-end'};
  function uiBoxHtml(b, selId, showBoxes){
    const n=b.node;
    const fx=n.props&&n.props.fx;
    const fxStyle=fx?`--i:${(n.props.fxIndex!=null?n.props.fxIndex:b.fxIndex)||0};`:'';
    const fxCls=fx?` ui-fx-${fx}`:'';
    const ms=b.modeSlide;
    const modeCls=ms?` ui-mode-host ${ms.cls}`:'';
    const modeStyle=ms?`transform:translateX(${ms.dx}px);opacity:${ms.op};`:'';
    const s=`left:${b.x}px;top:${b.y}px;width:${Math.max(0,b.w)}px;height:${Math.max(0,b.h)}px;${fxStyle}${modeStyle}`;
    const sel=n.id===selId ? ' is-sel' : '';
    const click=`onclick="event.stopPropagation();RGD.uiSelect('${n.id}')"`;
    if(n.type==='text'){
      const p=n.props, size=uiSize(p.size);
      const sh=p.shadow?`text-shadow:2px 2px 0 ${uiRgba(p.shadowColor,p.shadowOpacity)};`:'';
      const wrap=!!p.wrap && +p.wrapWidth>0;
      const ws=wrap?'pre-wrap':'pre';
      const alignY=wrap?'flex-start':'center';
      const spanW=wrap?`width:100%;max-width:${Math.max(1,+p.wrapWidth||b.w)}px;`: '';
      return `<div class="ui-box ui-t-text${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}display:flex;align-items:${alignY};justify-content:${UI_JUSTIFY_CSS[p.justify]||'flex-start'};overflow:hidden;">
        <span style="font-size:${size}px;line-height:${UI_LINE_H};color:${uiRgba(p.color,p.opacity)};${sh}${spanW}white-space:${ws};word-break:break-word;font-weight:600;letter-spacing:.01em;">${esc(p.text)}</span></div>`;
    }
    if(n.type==='rect'){
      return `<div class="ui-box ui-t-rect${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}background:${uiRgba(n.props.color,n.props.opacity)};"></div>`;
    }
    if(n.type==='image'){
      return `<div class="ui-box ui-t-image${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}background:${uiRgba(n.props.tint,(n.props.opacity)*0.22)};border:1px dashed ${uiRgba(n.props.tint,0.55)};display:flex;align-items:center;justify-content:center;">
        <span style="font-size:11px;color:${uiRgba(n.props.tint,0.8)};font-family:ui-monospace,monospace;overflow:hidden;">${esc(String(n.props.image).split('.').pop())}</span></div>`;
    }
    if(n.type==='material'){
      return `<div class="ui-box ui-t-image${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}background:repeating-linear-gradient(45deg,#1e293b,#1e293b 8px,#334155 8px,#334155 16px);display:flex;align-items:center;justify-content:center;">
        <span style="font-size:11px;color:#cbd5e1;font-family:ui-monospace,monospace;">${esc(n.props.material)}</span></div>`;
    }
    if(n.type==='button'){
      const vis=uiButtonVisual(n.props.variant||'loud', n.props.state||'normal');
      return `<div class="ui-box ui-t-button${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}background:${vis.fill};border:2px solid ${vis.border};opacity:${vis.opacity};display:flex;align-items:center;justify-content:center;">
        <span style="font-size:${vis.textSize}px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${vis.text};">${esc(n.props.text)}</span></div>`;
    }
    /* containers — asButton paints ApplyVisual chrome so locked/hot/selected are visible */
    if(n.props&&n.props.asButton){
      const vis=uiButtonVisual(n.props.variant||'card', n.props.state||'normal');
      return `<div class="ui-box ui-t-cont ui-as-btn${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}background:${vis.fill};border:2px solid ${vis.border};opacity:${vis.opacity};box-sizing:border-box;"></div>`;
    }
    const on = showBoxes || sel;
    return `<div class="ui-box ui-t-cont${sel}${fxCls}${modeCls}" data-id="${n.id}" ${click} style="${s}${on?'':'border-color:transparent;'}"></div>`;
  }
  function uiRenderStage(screen, selId, showBoxes){
    const boxes=uiFlatten(screen.root);
    return boxes.map(b=>uiBoxHtml(b, selId, showBoxes)).join('');
  }
