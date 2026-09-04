  /* ======================================================================
     UI SCREENS — 01 · DESIGN TOKENS
     One palette + one type scale for every screen. Screens never hardcode a
     colour: they reference a token id, so re-theming the whole game is a single
     edit here (or in the Theme editor) instead of 25 screen edits.
     Tokens are emitted into Verse as MakeColorFromHex("RRGGBB"), so what the
     preview shows and what UEFN renders come from the same hex string.
     ====================================================================== */

  const UI_STAGE_W = 1920, UI_STAGE_H = 1080;

  const UI_DEFAULT_THEME = {
    id:'theme_chronomancer', name:'Chronomancer (default)',
    colors:{
      /* surfaces */
      bg:'#05070E', scrim:'#05070E', panel:'#101725', panelAlt:'#18202F', panelDeep:'#0A0F1A',
      stroke:'#2C3A52', strokeHot:'#C9A227', row:'#151D2C', rowHover:'#1E2839',
      /* text */
      text:'#E8EDF7', textDim:'#93A1BA', textMute:'#5D6B85', textInk:'#05070E',
      /* brand + intent */
      accent:'#4C8DFF', accentAlt:'#7C5CFF', gold:'#F2C14E',
      ok:'#35D07F', warn:'#FFB020', danger:'#FF4D4D',
      hp:'#E5484D', shield:'#4C8DFF', xp:'#7C5CFF',
      /* rarity */
      rarityCommon:'#9AA7BD', rarityRare:'#4C8DFF', rarityEpic:'#A855F7', rarityLegendary:'#F2C14E',
      /* elements — match the Wizardry tab */
      elemFire:'#FF6A2B', elemIce:'#59D5FF', elemLightning:'#FFD166', elemVoid:'#A855F7', elemTime:'#C9A227',
      /* currencies — match the Currencies tab */
      curTimeEssence:'#59D5FF', curSandGrain:'#F2C14E',
    },
    /* px at 1080p — Verse text sizes assume a 1080p reference, same as ours */
    type:{ display:64, h1:44, h2:32, h3:24, body:18, small:15, tiny:12 },
    space:{ xs:8, sm:12, md:16, lg:24, xl:32, xxl:48 },
    /* Verse UI has no corner radius or stroke: a "border" is a color_block behind
       a slightly smaller color_block. strokeW is how thick that reveal is. */
    strokeW:2,
    opacity:{ scrim:0.72, panel:0.96, rowIdle:0.55, disabled:0.35 },
  };

  function uiTheme(){
    const t = state.uiTheme;
    if(!t || !t.colors) return UI_DEFAULT_THEME;
    return {
      ...UI_DEFAULT_THEME, ...t,
      colors:{ ...UI_DEFAULT_THEME.colors, ...(t.colors||{}) },
      type:{ ...UI_DEFAULT_THEME.type, ...(t.type||{}) },
      space:{ ...UI_DEFAULT_THEME.space, ...(t.space||{}) },
      opacity:{ ...UI_DEFAULT_THEME.opacity, ...(t.opacity||{}) },
    };
  }
  /* Colours are stored as a token id ("accent") or a literal "#RRGGBB". */
  function uiColor(v){
    if(!v) return '#FFFFFF';
    if(v.charAt(0)==='#') return v.toUpperCase();
    const c=uiTheme().colors[v];
    return (c||'#FFFFFF').toUpperCase();
  }
  function uiHex6(v){ return uiColor(v).replace('#','').slice(0,6); }
  function uiRgba(v,a){
    const h=uiHex6(v);
    const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
    return `rgba(${r},${g},${b},${a==null?1:a})`;
  }
  function uiSize(v){
    if(typeof v==='number') return v;
    const t=uiTheme();
    return t.type[v] || t.space[v] || parseFloat(v) || 0;
  }
  const UI_COLOR_TOKENS = Object.keys(UI_DEFAULT_THEME.colors);
  const UI_TYPE_TOKENS  = Object.keys(UI_DEFAULT_THEME.type);
