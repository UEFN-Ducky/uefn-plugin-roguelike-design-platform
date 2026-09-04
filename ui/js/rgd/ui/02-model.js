  /* ======================================================================
     UI SCREENS — 02 · WIDGET MODEL
     Every node maps 1:1 onto a Verse UI widget, and every slot field maps 1:1
     onto a Verse slot field. Nothing in this model can be drawn in the preview
     that cannot be emitted as Verse — that is the whole point of the tab.

       node  = { id, type, name, bind?, note?, slot{}, props{}, children[] }
       slot  = canvas parent : aMin[x,y] aMax[x,y] off[l,t,r,b] align[x,y] z stc
               overlay/stack : h v pad[l,t,r,b] dist
     A slot object always carries BOTH field sets; the parent decides which half
     is read, so the same node can be dropped into a canvas or a stack unchanged.
     ====================================================================== */

  const UI_TYPES = {
    canvas:   { label:'Canvas',    icon:'square-dashed-bottom', container:true,  verse:'canvas' },
    overlay:  { label:'Overlay',   icon:'layers',               container:true,  verse:'overlay' },
    stack:    { label:'Stack Box', icon:'rows-3',               container:true,  verse:'stack_box' },
    text:     { label:'Text',      icon:'type',                 container:false, verse:'text_block' },
    rect:     { label:'Color',     icon:'square',               container:false, verse:'color_block' },
    image:    { label:'Texture',   icon:'image',                container:false, verse:'texture_block' },
    material: { label:'Material',  icon:'paintbrush',           container:false, verse:'material_block' },
    button:   { label:'Button',    icon:'mouse-pointer-click',  container:false, verse:'button' },
  };
  /* Variant → chrome-less native `button` skin (parity with ui_buttons.verse).
     hotFill / selBorder / lockFill mirror HotFillHex / SelBorderHex / LockFillHex.
     Preview-only `props.state` (normal|hot|selected|locked) uses ApplyVisual rules. */
  const UI_BUTTON_STYLE = {
    loud:    { border:'F2C14E', fill:'F2C14E', hotFill:'FFE28A', selBorder:'FFFFFF', lockFill:'5D6B85', fillOp:1,    text:'0A0F1A', textSize:18, w:220, h:56 },
    regular: { border:'151D2C', fill:'151D2C', hotFill:'1E2839', selBorder:'4C8DFF', lockFill:'0A0F1A', fillOp:0.95, text:'E8EDF7', textSize:16, w:220, h:48 },
    quiet:   { border:'1E2839', fill:'1E2839', hotFill:'2C3A52', selBorder:'4C8DFF', lockFill:'0A0F1A', fillOp:1,    text:'E8EDF7', textSize:16, w:160, h:48 },
    card:    { border:'2C3A52', fill:'101725', hotFill:'1E2839', selBorder:'F2C14E', lockFill:'0A0F1A', fillOp:0.97, text:'E8EDF7', textSize:12, w:400, h:480 },
    row:     { border:'151D2C', fill:'151D2C', hotFill:'1E2839', selBorder:'4C8DFF', lockFill:'0A0F1A', fillOp:0.9,  text:'E8EDF7', textSize:16, w:1200, h:132 },
    danger:  { border:'FF4D4D', fill:'3A1515', hotFill:'5A1F1F', selBorder:'FF4D4D', lockFill:'2A1010', fillOp:1,    text:'E8EDF7', textSize:16, w:220, h:48 },
  };
  const UI_BUTTON_VERSE = { loud:'button', regular:'button', quiet:'button', danger:'button' };
  function uiButtonVisual(variant, state){
    const st=UI_BUTTON_STYLE[variant]||UI_BUTTON_STYLE.loud;
    const s=state||'normal';
    let border=st.border, fill=st.fill, op=st.fillOp==null?1:st.fillOp;
    if(s==='locked'){ border=st.lockFill; fill=st.lockFill; op=0.55; }
    else if(s==='selected'){ border=st.selBorder; op=1; }
    else if(s==='hot'){ fill=st.hotFill; op=1; }
    return { border:'#'+border, fill:'#'+fill, opacity:op, text:'#'+st.text, textSize:st.textSize };
  }

  function uiDefaultProps(type){
    const t=uiTheme();
    switch(type){
      case 'stack':    return { orient:'V' };
      case 'text':     return { text:'Text', size:t.type.body, color:'text', opacity:1, justify:'Left', shadow:false, shadowColor:'#000000', shadowOpacity:0.6, wrap:false, wrapWidth:0 };
      case 'rect':     return { color:'panel', opacity:1, w:200, h:60 };
      case 'image':    return { image:'Textures.T_Empty', tint:'#FFFFFF', opacity:1, w:96, h:96 };
      case 'material': return { material:'Materials.M_UI', w:200, h:120 };
      case 'button':   return { variant:'loud', text:'Confirm' };
      default:         return {};
    }
  }
  function uiDefaultSlot(){
    return { aMin:[0,0], aMax:[0,0], off:[0,0,200,80], align:[0,0], z:0, stc:false,
             h:'Fill', v:'Fill', pad:[0,0,0,0], dist:null };
  }
  function uiMakeNode(type, props, children, slot, name){
    return {
      id: uid('w'), type,
      name: name || UI_TYPES[type].label,
      slot: Object.assign(uiDefaultSlot(), slot||{}),
      props: Object.assign(uiDefaultProps(type), props||{}),
      children: UI_TYPES[type].container ? (children||[]) : [],
    };
  }

  /* ---- authoring shorthands (used by the seeded catalogue) ---- */
  const uiCanvas  = (children, slot, name)          => uiMakeNode('canvas', {}, children, slot, name);
  const uiOverlay = (children, slot, name)          => uiMakeNode('overlay', {}, children, slot, name);
  const uiStack   = (orient, children, slot, name)  => uiMakeNode('stack', {orient}, children, slot, name);
  const uiText    = (text, props, slot, name)       => uiMakeNode('text', Object.assign({text}, props||{}), null, slot, name||('“'+String(text).slice(0,18)+'”'));
  const uiRect    = (color, w, h, props, slot, name)=> uiMakeNode('rect', Object.assign({color,w,h}, props||{}), null, slot, name);
  const uiImage   = (image, w, h, props, slot, name)=> uiMakeNode('image', Object.assign({image,w,h}, props||{}), null, slot, name);
  const uiButton  = (text, variant, slot, name)     => uiMakeNode('button', {text, variant:variant||'loud'}, null, slot, name||('['+text+']'));

  /* canvas slots — the shapes that cover ~everything */
  const csFill   = (l,t,r,b)      => ({ aMin:[0,0], aMax:[1,1], off:[l||0,t||0,r||0,b||0], align:[0,0] });
  const csBox    = (x,y,w,h)      => ({ aMin:[0,0], aMax:[0,0], off:[x,y,w,h], align:[0,0] });
  const csAnchor = (ax,ay,x,y,w,h,alx,aly) => ({ aMin:[ax,ay], aMax:[ax,ay], off:[x,y,w,h], align:[alx==null?0.5:alx, aly==null?0.5:aly] });
  const csCenter = (w,h,dx,dy)    => csAnchor(0.5,0.5,dx||0,dy||0,w,h,0.5,0.5);
  /* stretch horizontally across the parent, fixed height pinned top or bottom */
  const csBandTop    = (h,l,r,y)  => ({ aMin:[0,0], aMax:[1,0], off:[l||0, y||0, r||0, h], align:[0,0] });
  const csBandBottom = (h,l,r,y)  => ({ aMin:[0,1], aMax:[1,1], off:[l||0, -(h+(y||0)), r||0, h], align:[0,0] });

  /* overlay / stack slots */
  const sl  = (h,v,pad,dist) => ({ h:h||'Fill', v:v||'Fill', pad:pad||[0,0,0,0], dist:(dist==null?null:dist) });

  /* ---- composites — the Verse-correct way to fake what Verse UI lacks ----
     No corner radius, no stroke: a bordered panel is a stroke-coloured
     color_block with a slightly inset fill sitting on top of it. */
  function uiPanel(w, h, children, opts){
    const o=Object.assign({fill:'panel', stroke:'stroke', strokeW:uiTheme().strokeW,
                           opacity:uiTheme().opacity.panel, padding:24}, opts||{});
    const inset=o.strokeW;
    const kids=[
      uiRect(o.stroke, w, h, {opacity:1}, sl('Fill','Fill'), 'Panel border'),
      uiRect(o.fill, w-inset*2, h-inset*2, {opacity:o.opacity}, sl('Fill','Fill',[inset,inset,inset,inset]), 'Panel fill'),
    ];
    for(const c of children||[]){
      const p=c.slot&&c.slot.pad;
      if(!p || !(p[0]||p[1]||p[2]||p[3])) c.slot.pad=[o.padding,o.padding,o.padding,o.padding];
      kids.push(c);
    }
    /* Default to centred so the same panel works as a canvas child (modal) or a
       flow child (nested inside a stack) with no extra wiring. */
    const slot=Object.assign(csCenter(w,h), sl('Center','Center'), o.slot||{});
    return uiOverlay(kids, slot, o.name||'Panel');
  }
  /* Root canvas for any modal: full-bleed dim, then whatever sits on top. */
  function uiScrim(children){
    return uiCanvas([
      uiRect('scrim', UI_STAGE_W, UI_STAGE_H, {opacity:uiTheme().opacity.scrim}, csFill(0,0,0,0), 'Scrim'),
      ...(children||[]),
    ], null, 'Root');
  }
  /* Progress/health bar: track + fill. The fill width is what Verse animates. */
  function uiBar(w, h, fillColor, pct, name){
    const f=Math.max(0,Math.min(1,pct==null?0.7:pct));
    return uiOverlay([
      uiRect('panelDeep', w, h, {opacity:0.9}, sl('Fill','Fill'), 'Track'),
      uiRect(fillColor, Math.round(w*f), h, {opacity:1}, sl('Left','Fill'), 'Fill'),
    ], null, name||'Bar');
  }

  /* ---- tree ops ---- */
  function uiWalk(node, fn, parent, index){
    if(!node) return;
    fn(node, parent, index);
    (node.children||[]).forEach((c,i)=>uiWalk(c, fn, node, i));
  }
  function uiFind(root, id){ let hit=null; uiWalk(root, n=>{ if(n.id===id) hit=n; }); return hit; }
  function uiFindParent(root, id){ let hit=null; uiWalk(root,(n,p)=>{ if(n.id===id) hit=p; }); return hit; }
  function uiClone(node){
    const c=JSON.parse(JSON.stringify(node));
    uiWalk(c, n=>{ n.id=uid('w'); });
    return c;
  }
  function uiRemove(root, id){
    const p=uiFindParent(root,id); if(!p) return false;
    const i=p.children.findIndex(c=>c.id===id); if(i<0) return false;
    p.children.splice(i,1); return true;
  }
  function uiMove(root, id, delta){
    const p=uiFindParent(root,id); if(!p) return false;
    const i=p.children.findIndex(c=>c.id===id); const j=i+delta;
    if(i<0||j<0||j>=p.children.length) return false;
    const [n]=p.children.splice(i,1); p.children.splice(j,0,n); return true;
  }
  /* Slot fields are only meaningful to the parent that owns them. */
  function uiSlotKind(parentType){ return parentType==='canvas' ? 'canvas' : 'flow'; }
