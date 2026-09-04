  /* ===== Assets tab — kit catalogue + Three.js preview (+ chunk / Level Gen 3D) ===== */
  let _assetSel = null;
  let _assetCompose = false;
  let _three = null; // asset orbit viewer
  let _chunkThree = null; // chunk orbit viewer (footprint + props)
  let _pgThree = null; // Level Gen layout orbit viewer
  let _pgOrbitKeep = null; // survive HTML rebuild / dispose

  const LAYOUT_ROLE_HEX = {
    entrance:0x22c55e, exit:0xef4444, objective:0xf59e0b, room:0x6366f1,
    connector:0x94a3b8, deadend:0x78716c, cap:0xa8a29e, filler:0x44403c, boss:0xe11d48,
  };

  function contentPathLabel(uePath){
    const s=String(uePath||'').replace(/\\/g,'/').trim();
    if(!s) return '';
    if(s.startsWith('Content/')) return s;
    if(s.startsWith('/')){
      const parts=s.replace(/^\/+/,'').split('/');
      if(parts.length>=2) return 'Content/'+parts.slice(1).join('/');
      return 'Content/'+(parts[0]||'');
    }
    return 'Content/'+s.replace(/^\/+/,'');
  }
  function toUeContentPath(raw){
    let s=String(raw||'').replace(/\\/g,'/').trim();
    if(!s) return '';
    if(s.startsWith('Content/')) return '/Roguelike/'+s.slice('Content/'.length);
    if(s.startsWith('/')) return s;
    return '/Roguelike/'+s.replace(/^\/+/,'');
  }

  function assetsList(){ return state.chunkAssets || (state.chunkAssets=[]); }
  function selectedAsset(){
    const list=assetsList();
    if(!_assetSel || !list.find(a=>a.id===_assetSel)) _assetSel=list[0]&&list[0].id;
    return list.find(a=>a.id===_assetSel)||null;
  }

  const KIND_COLORS={
    floor:'#84cc16', wall:'#64748b', roof:'#38bdf8', arch:'#f59e0b',
    door:'#a78bfa', column:'#f97316', prop:'#94a3b8', cube:'#94a3b8',
  };

  function _disposeThreeHandle(handle){
    if(!handle) return null;
    cancelAnimationFrame(handle.raf);
    try{
      if(typeof handle.cleanup==='function') handle.cleanup();
      if(handle.meshRoot){
        handle.meshRoot.traverse(o=>{
          if(o.geometry) o.geometry.dispose();
          if(o.material){
            if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose());
            else o.material.dispose();
          }
        });
      }
      if(handle.renderer) handle.renderer.dispose();
      if(handle.el&&handle.renderer&&handle.renderer.domElement.parentNode===handle.el)
        handle.el.removeChild(handle.renderer.domElement);
    }catch(_){}
    return null;
  }
  function disposeAssetViewer(){ _three=_disposeThreeHandle(_three); }
  function disposeChunkViewer(){ _chunkThree=_disposeThreeHandle(_chunkThree); }
  function _stashOrbitKeep(handle){
    if(!handle) return null;
    return {
      yaw:handle.targetYaw!=null?handle.targetYaw:handle.yaw,
      pitch:handle.targetPitch!=null?handle.targetPitch:handle.pitch,
      dist:handle.targetDist!=null?handle.targetDist:handle.dist,
      lookX:handle.targetX!=null?handle.targetX:handle.lookX,
      lookY:handle.targetY!=null?handle.targetY:handle.lookY,
      lookZ:handle.targetZ!=null?handle.targetZ:handle.lookZ,
    };
  }
  function disposeProcgenViewer(){
    if(_pgThree) _pgOrbitKeep=_stashOrbitKeep(_pgThree);
    _pgThree=_disposeThreeHandle(_pgThree);
  }
  function resetProcgenOrbit(){
    _pgOrbitKeep=null;
    _pgThree=_disposeThreeHandle(_pgThree);
  }
  function disposeAllThreeViewers(){ disposeAssetViewer(); disposeChunkViewer(); disposeProcgenViewer(); }

  // One grid cell = one cube (width = length = height). Matches UEFN 512² footprint in preview units.
  const CELL = 1;

  function mat(hex, opts){
    return new THREE.MeshStandardMaterial(Object.assign({ color:hex, roughness:0.72, metalness:0.08 }, opts||{}));
  }

  function buildPreviewMesh(preview, kind, unit){
    const U = (unit!=null && unit>0) ? unit : CELL;
    const g=new THREE.Group();
    const p=String(preview||kind||'prop').toLowerCase();
    if(p==='floor'){
      const t=U*0.08;
      const m=new THREE.Mesh(new THREE.BoxGeometry(U*0.98, t, U*0.98), mat(0x8b7355));
      m.position.y=t*0.5; g.add(m);
    } else if(p==='wall'){
      // Full cell cube — same size up as sideways
      const m=new THREE.Mesh(new THREE.BoxGeometry(U*0.98, U*0.98, U*0.98), mat(0x9ca3af));
      m.position.y=U*0.5; g.add(m);
    } else if(p==='roof'){
      const t=U*0.08;
      const m=new THREE.Mesh(new THREE.BoxGeometry(U*1.02, t, U*1.02), mat(0x64748b));
      m.position.y=U+t*0.5; g.add(m);
    } else if(p==='arch'){
      const col=mat(0xd6b27a);
      const postW=U*0.18, postH=U*0.92, gap=U*0.55;
      const L=new THREE.Mesh(new THREE.BoxGeometry(postW, postH, postW), col); L.position.set(-gap*0.5, postH*0.5, 0); g.add(L);
      const R=new THREE.Mesh(new THREE.BoxGeometry(postW, postH, postW), col); R.position.set(gap*0.5, postH*0.5, 0); g.add(R);
      const lintel=new THREE.Mesh(new THREE.BoxGeometry(gap+postW, U*0.16, postW), col); lintel.position.set(0, postH+U*0.08, 0); g.add(lintel);
      const key=new THREE.Mesh(new THREE.BoxGeometry(U*0.22, U*0.12, postW*1.1), mat(0xf59e0b)); key.position.set(0, postH+U*0.18, 0); g.add(key);
    } else if(p==='door'){
      const frame=mat(0x78716c);
      const h=U*0.85, fw=U*0.1;
      const L=new THREE.Mesh(new THREE.BoxGeometry(fw, h, fw), frame); L.position.set(-U*0.28, h*0.5, 0); g.add(L);
      const R=new THREE.Mesh(new THREE.BoxGeometry(fw, h, fw), frame); R.position.set(U*0.28, h*0.5, 0); g.add(R);
      const top=new THREE.Mesh(new THREE.BoxGeometry(U*0.66, fw, fw), frame); top.position.set(0, h+fw*0.5, 0); g.add(top);
      const leaf=new THREE.Mesh(new THREE.BoxGeometry(U*0.48, h*0.9, U*0.04), mat(0x44403c)); leaf.position.set(0, h*0.45, U*0.02); g.add(leaf);
    } else if(p==='column'){
      const shaftH=U*0.88;
      const shaft=new THREE.Mesh(new THREE.CylinderGeometry(U*0.12, U*0.14, shaftH, 12), mat(0xe7d3a3));
      shaft.position.y=shaftH*0.5+U*0.06; g.add(shaft);
      const base=new THREE.Mesh(new THREE.CylinderGeometry(U*0.2, U*0.22, U*0.08, 12), mat(0xc4a574));
      base.position.y=U*0.04; g.add(base);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(U*0.18, U*0.14, U*0.08, 12), mat(0xc4a574));
      cap.position.y=shaftH+U*0.1; g.add(cap);
    } else {
      const m=new THREE.Mesh(new THREE.BoxGeometry(U*0.45, U*0.45, U*0.45), mat(0x94a3b8));
      m.position.y=U*0.225; g.add(m);
    }
    return g;
  }

  function buildComposeRoom(){
    const U=CELL;
    const g=new THREE.Group();
    const floorMat=mat(0x8b7355), wallMat=mat(0x9ca3af), roofMat=mat(0x64748b);
    for(let z=-1.5;z<=1.5;z++) for(let x=-1.5;x<=1.5;x++){
      const f=new THREE.Mesh(new THREE.BoxGeometry(U*0.95, U*0.06, U*0.95), floorMat);
      f.position.set(x*U, U*0.03, z*U); g.add(f);
    }
    for(let i=-2;i<=2;i++){
      const n=new THREE.Mesh(new THREE.BoxGeometry(U*0.95, U, U*0.12), wallMat); n.position.set(i*U, U*0.5, -2.05*U); g.add(n);
      const s=new THREE.Mesh(new THREE.BoxGeometry(U*0.95, U, U*0.12), wallMat); s.position.set(i*U, U*0.5, 2.05*U); g.add(s);
      const e=new THREE.Mesh(new THREE.BoxGeometry(U*0.12, U, U*0.95), wallMat); e.position.set(2.05*U, U*0.5, i*U); g.add(e);
      const w=new THREE.Mesh(new THREE.BoxGeometry(U*0.12, U, U*0.95), wallMat); w.position.set(-2.05*U, U*0.5, i*U); g.add(w);
    }
    const archN=buildPreviewMesh('arch', 'arch', U); archN.position.set(0,0,-2.05*U); g.add(archN);
    const archS=buildPreviewMesh('arch', 'arch', U); archS.rotation.y=Math.PI; archS.position.set(0,0,2.05*U); g.add(archS);
    const roof=new THREE.Mesh(new THREE.BoxGeometry(4.4*U, U*0.08, 4.4*U), roofMat);
    roof.position.y=U+U*0.04; g.add(roof);
    [[-1.2,-1.2],[1.2,-1.2],[-1.2,1.2],[1.2,1.2]].forEach(([x,z])=>{
      const c=buildPreviewMesh('column','column',U); c.position.set(x*U,0,z*U); g.add(c);
    });
    return g;
  }

  function _orbitFitFromRoot(meshRoot, camera, aspect){
    const box=new THREE.Box3().setFromObject(meshRoot);
    const sphere=new THREE.Sphere();
    if(box.isEmpty()){
      sphere.center.set(0, 0.55, 0);
      sphere.radius=2;
    } else {
      box.getBoundingSphere(sphere);
      sphere.radius=Math.max(0.5, sphere.radius);
    }
    const fovV=THREE.MathUtils.degToRad(camera.fov);
    const fovH=2*Math.atan(Math.tan(fovV*0.5)*Math.max(0.2, aspect));
    const half=Math.min(fovV, fovH)*0.5;
    const fitDist=(sphere.radius/Math.max(1e-4, Math.sin(half)))*1.2;
    return {
      center: sphere.center.clone(),
      radius: sphere.radius,
      fitDist: Math.max(2.2, fitDist),
      minDist: Math.max(0.5, sphere.radius*0.25),
      maxDist: Math.max(8, sphere.radius*8, fitDist*2.5),
    };
  }

  function mountOrbitViewer(slotSetter, el, opts){
    const o=opts||{};
    if(!el || typeof THREE==='undefined'){
      if(el) el.innerHTML=`<div class="text-xs text-amber-400 p-4">Three.js not loaded — check CDN.</div>`;
      return null;
    }
    el.innerHTML='';
    const w=Math.max(280, el.clientWidth||420), h=Math.max(260, el.clientHeight||320);
    const renderer=new THREE.WebGLRenderer({ antialias:true, alpha:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x0b1220, 1);
    const canvas=renderer.domElement;
    canvas.style.width='100%';
    canvas.style.height='100%';
    canvas.style.display='block';
    canvas.style.cursor='grab';
    canvas.style.touchAction='none';
    el.appendChild(canvas);
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(42, w/h, 0.1, 2000);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key=new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(3, 6, 2); scene.add(key);
    const fill=new THREE.DirectionalLight(0x93c5fd, 0.35);
    fill.position.set(-4, 2, -2); scene.add(fill);
    let gridHelper=new THREE.GridHelper(Math.max(8, Math.ceil(o.gridSize||8)), Math.max(8, Math.ceil(o.gridSize||8)), 0x334155, 0x1e293b);
    scene.add(gridHelper);
    let meshRoot=typeof o.buildRoot==='function'?o.buildRoot():new THREE.Group();
    scene.add(meshRoot);

    const fit=_orbitFitFromRoot(meshRoot, camera, w/h);
    const initYaw=o.yaw!=null?o.yaw:0.55;
    const initPitch=o.pitch!=null?o.pitch:0.42;
    const initDist=o.dist!=null?o.dist:fit.fitDist;
    const initTX=o.lookX!=null?o.lookX:fit.center.x;
    const initTY=o.lookY!=null?o.lookY:(fit.center.y||0.55);
    const initTZ=o.lookZ!=null?o.lookZ:fit.center.z;

    const handle={
      renderer, scene, camera, meshRoot, raf:0, el, gridHelper,
      // smoothed (rendered)
      yaw:initYaw, pitch:initPitch, dist:initDist,
      lookX:initTX, lookY:initTY, lookZ:initTZ,
      // targets (OrbitControls-style damping)
      targetYaw:initYaw, targetPitch:initPitch, targetDist:initDist,
      targetX:initTX, targetY:initTY, targetZ:initTZ,
      minDist:fit.minDist, maxDist:fit.maxDist,
      dragging:false, panning:false, lx:0, ly:0,
      cleanup:null,
      fitToBounds:null, replaceRoot:null,
    };

    handle.fitToBounds=()=>{
      const f=_orbitFitFromRoot(handle.meshRoot, camera, camera.aspect||1);
      handle.minDist=f.minDist;
      handle.maxDist=f.maxDist;
      handle.targetX=f.center.x;
      handle.targetY=f.center.y;
      handle.targetZ=f.center.z;
      handle.targetDist=Math.max(handle.minDist, Math.min(handle.maxDist, f.fitDist));
      const gSize=Math.max(8, Math.ceil(f.radius*2+4));
      if(handle.gridHelper){
        scene.remove(handle.gridHelper);
        handle.gridHelper.geometry&&handle.gridHelper.geometry.dispose();
        handle.gridHelper.material&&handle.gridHelper.material.dispose();
      }
      handle.gridHelper=new THREE.GridHelper(gSize, gSize, 0x334155, 0x1e293b);
      scene.add(handle.gridHelper);
    };

    handle.replaceRoot=(newRoot)=>{
      if(handle.meshRoot){
        scene.remove(handle.meshRoot);
        handle.meshRoot.traverse(o=>{
          if(o.geometry) o.geometry.dispose();
          if(o.material){
            if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose());
            else o.material.dispose();
          }
        });
      }
      handle.meshRoot=newRoot||new THREE.Group();
      scene.add(handle.meshRoot);
    };

    const onDown=e=>{
      handle.dragging=true;
      handle.panning=(e.button===2)||e.shiftKey||e.altKey;
      handle.lx=e.clientX; handle.ly=e.clientY;
      canvas.style.cursor=handle.panning?'move':'grabbing';
      try{ canvas.setPointerCapture(e.pointerId); }catch(_){}
      e.preventDefault();
    };
    const onUp=e=>{
      handle.dragging=false; handle.panning=false;
      canvas.style.cursor='grab';
      try{ if(e&&e.pointerId!=null) canvas.releasePointerCapture(e.pointerId); }catch(_){}
    };
    const onMove=e=>{
      if(!handle.dragging) return;
      const dx=e.clientX-handle.lx, dy=e.clientY-handle.ly;
      handle.lx=e.clientX; handle.ly=e.clientY;
      if(handle.panning){
        // Truck in camera plane (OrbitControls pan)
        const panScale=handle.targetDist*0.0018;
        const cosY=Math.cos(handle.targetYaw), sinY=Math.sin(handle.targetYaw);
        handle.targetX+=(-dx*cosY - dy*Math.sin(handle.targetPitch)*sinY)*panScale;
        handle.targetZ+=(-dx*sinY + dy*Math.sin(handle.targetPitch)*cosY)*panScale;
        handle.targetY+=(dy*Math.cos(handle.targetPitch))*panScale;
      } else {
        handle.targetYaw+=dx*0.01;
        handle.targetPitch=Math.max(-0.15, Math.min(1.35, handle.targetPitch+dy*0.01));
      }
    };
    const onWheel=e=>{
      e.preventDefault();
      // Exponential dolly — constant feel at any scale (camera-controls / OrbitControls)
      const next=handle.targetDist*Math.pow(0.95, -e.deltaY/53);
      handle.targetDist=Math.max(handle.minDist, Math.min(handle.maxDist, next));
    };
    const onDbl=e=>{
      e.preventDefault();
      handle.fitToBounds();
    };
    const onContext=e=>e.preventDefault();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('wheel', onWheel, {passive:false});
    canvas.addEventListener('dblclick', onDbl);
    canvas.addEventListener('contextmenu', onContext);
    handle.cleanup=()=>{
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('contextmenu', onContext);
    };

    // If caller didn't pass dist, auto-frame
    if(o.dist==null && o.autoFit!==false){
      handle.targetDist=fit.fitDist;
      handle.dist=fit.fitDist;
      handle.minDist=fit.minDist;
      handle.maxDist=fit.maxDist;
    } else {
      handle.minDist=Math.min(handle.minDist, initDist*0.25);
      handle.maxDist=Math.max(handle.maxDist, initDist*4);
    }

    const DAMP=0.14; // SmoothDamp-ish lerp (OrbitControls enableDamping)
    const tick=()=>{
      const nw=Math.max(280, el.clientWidth||w), nh=Math.max(260, el.clientHeight||h);
      const pr=renderer.getPixelRatio();
      if(Math.abs(nw-renderer.domElement.width/pr)>2 || Math.abs(nh-renderer.domElement.height/pr)>2){
        renderer.setSize(nw, nh, false);
        camera.aspect=nw/nh; camera.updateProjectionMatrix();
      }
      handle.yaw+=(handle.targetYaw-handle.yaw)*DAMP;
      handle.pitch+=(handle.targetPitch-handle.pitch)*DAMP;
      handle.dist+=(handle.targetDist-handle.dist)*DAMP;
      handle.lookX+=(handle.targetX-handle.lookX)*DAMP;
      handle.lookY+=(handle.targetY-handle.lookY)*DAMP;
      handle.lookZ+=(handle.targetZ-handle.lookZ)*DAMP;
      // Compat: lookY scalar used by older remount keep
      handle.lookY=handle.lookY;
      const cp=Math.cos(handle.pitch), sp=Math.sin(handle.pitch);
      const cy=Math.cos(handle.yaw), sy=Math.sin(handle.yaw);
      camera.position.x=handle.lookX+cy*cp*handle.dist;
      camera.position.y=handle.lookY+sp*handle.dist;
      camera.position.z=handle.lookZ+sy*cp*handle.dist;
      camera.lookAt(handle.lookX, handle.lookY, handle.lookZ);
      camera.near=Math.max(0.05, handle.dist*0.01);
      camera.far=Math.max(200, handle.dist*20+100);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      handle.raf=requestAnimationFrame(tick);
    };
    if(typeof slotSetter==='function') slotSetter(handle);
    tick();
    return handle;
  }

  function mountAssetViewer(el, asset){
    disposeAssetViewer();
    mountOrbitViewer(h=>{ _three=h; }, el, {
      buildRoot:()=>_assetCompose?buildComposeRoom():buildPreviewMesh(asset&&asset.preview, asset&&asset.kind),
      dist:_assetCompose?7.2:4.2,
      lookY:_assetCompose?0.5:0.55,
      gridSize:_assetCompose?10:8,
    });
  }

  function _rotCell(x, y, cw, ch, rot){
    rot=((rot%360)+360)%360;
    if(rot===90) return {x:ch-1-y, y:x};
    if(rot===180) return {x:cw-1-x, y:ch-1-y};
    if(rot===270) return {x:y, y:cw-1-x};
    return {x, y};
  }

  function buildChunkMesh3D(chunk, rot){
    const root=new THREE.Group();
    if(typeof THREE==='undefined'||!chunk) return root;
    const U=CELL; // cubic voxel: width = depth = height per story
    const stories=Math.max(1, Math.min(16, +(chunk.cz||chunk.stories)||1));
    const raw=chunk.grid||[];
    const g=(typeof rotateGridJs==='function')?rotateGridJs(raw, rot||0):raw;
    const ch=g.length, cw=(g[0]||[]).length;
    if(!cw||!ch) return root;
    const ox=-(cw-1)*0.5*U, oz=-(ch-1)*0.5*U;
    const floorMat=mat(0x8b7355), wallMat=mat(0x9ca3af);
    const doorFloor=mat(0xd4a017);
    const ledgeMat=mat(0x38bdf8, { transparent:true, opacity:0.85 });
    const floorT=U*0.08;
    let solidN=0;
    for(let story=0; story<stories; story++){
      const yBase=story*U;
      for(let y=0;y<ch;y++) for(let x=0;x<cw;x++){
        const t=g[y][x]||'empty';
        if(t==='empty') continue;
        const wx=ox+x*U, wz=oz+y*U;
        if(t==='wall'){
          const m=new THREE.Mesh(new THREE.BoxGeometry(U*0.96, U*0.96, U*0.96), wallMat);
          m.position.set(wx, yBase+U*0.5, wz); root.add(m);
          solidN++;
        } else if(t==='door'){
          // Door arch only on ground story; upper stories keep open volume + floor
          const f=new THREE.Mesh(new THREE.BoxGeometry(U*0.96, floorT, U*0.96), story===0?doorFloor:floorMat);
          f.position.set(wx, yBase+floorT*0.5, wz); root.add(f);
          if(story===0){
            const arch=buildPreviewMesh('arch', 'arch', U);
            let yaw=0;
            if(y===0) yaw=Math.PI;
            else if(y===ch-1) yaw=0;
            else if(x===0) yaw=Math.PI/2;
            else if(x===cw-1) yaw=-Math.PI/2;
            arch.rotation.y=yaw;
            arch.position.set(wx, yBase, wz);
            root.add(arch);
          } else {
            const edge=new THREE.LineSegments(
              new THREE.EdgesGeometry(new THREE.BoxGeometry(U*0.96, U*0.96, U*0.96)),
              new THREE.LineBasicMaterial({ color:0x334155, transparent:true, opacity:0.3 })
            );
            edge.position.set(wx, yBase+U*0.5, wz);
            root.add(edge);
          }
          solidN++;
        } else {
          const f=new THREE.Mesh(new THREE.BoxGeometry(U*0.96, floorT, U*0.96), floorMat);
          f.position.set(wx, yBase+floorT*0.5, wz); root.add(f);
          const edge=new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(U*0.96, U*0.96, U*0.96)),
            new THREE.LineBasicMaterial({ color:0x334155, transparent:true, opacity:0.35 })
          );
          edge.position.set(wx, yBase+U*0.5, wz);
          root.add(edge);
          solidN++;
        }
      }
    }
    // Elevated open ports (ledges / high doors) as balcony slabs at height_step
    (chunk.ports||[]).forEach(p=>{
      if(!p) return;
      const kind=String(p.kind||'').toLowerCase();
      if(kind!=='ledge'&&kind!=='window'&&kind!=='door'&&kind!=='open') return;
      const hz=+(p.height_step!=null?p.height_step:p.z)||0;
      if(hz<=0 && kind!=='ledge' && kind!=='window') return;
      const rr=_rotCell(+p.x||0, +p.y||0, chunk.cw||cw, chunk.ch||ch, rot||0);
      const slab=new THREE.Mesh(new THREE.BoxGeometry(U*0.7, U*0.06, U*0.28), ledgeMat);
      let face=String(p.face||'N').toUpperCase();
      const o=['N','E','S','W'];
      const fi=o.indexOf(face);
      if(fi>=0 && rot) face=o[(fi+((rot||0)/90))%4];
      const off=U*0.42;
      let dx=0, dz=0, yaw=0;
      if(face==='N'){ dz=-off; yaw=0; }
      else if(face==='S'){ dz=off; yaw=Math.PI; }
      else if(face==='E'){ dx=off; yaw=-Math.PI/2; }
      else { dx=-off; yaw=Math.PI/2; }
      slab.rotation.y=yaw;
      const storyY=Math.max(0, hz)*U + U*0.55;
      slab.position.set(ox+rr.x*U+dx, storyY, oz+rr.y*U+dz);
      root.add(slab);
    });
    if(chunk.roof && solidN){
      const roofT=U*0.08;
      const roof=new THREE.Mesh(
        new THREE.BoxGeometry(cw*U*0.98, roofT, ch*U*0.98),
        mat(0x64748b, { transparent:true, opacity:0.55 })
      );
      roof.position.set(0, stories*U+roofT*0.5, 0);
      root.add(roof);
    }
    (chunk.slots||[]).forEach(s=>{
      const rr=_rotCell(+s.x||0, +s.y||0, chunk.cw||cw, chunk.ch||ch, rot||0);
      const col=String(s.group||'').toUpperCase()==='A'?0x34d399:0xf472b6;
      const m=new THREE.Mesh(new THREE.CylinderGeometry(U*0.16, U*0.16, U*0.1, 10), mat(col));
      m.position.set(ox+rr.x*U, U*0.12, oz+rr.y*U);
      root.add(m);
    });
    const byId={};
    (state.chunkAssets||[]).forEach(a=>{ if(a&&a.id) byId[a.id]=a; });
    (chunk.props||[]).forEach(pr=>{
      if(!pr) return;
      const rr=_rotCell(+pr.x||0, +pr.y||0, chunk.cw||cw, chunk.ch||ch, rot||0);
      const asset=byId[pr.assetId]||null;
      const preview=(asset&&(asset.preview||asset.kind))||'column';
      const mesh=buildPreviewMesh(preview, asset&&asset.kind, U);
      const yawDeg=(+pr.yaw||0)+(+rot||0);
      mesh.rotation.y=yawDeg*Math.PI/180;
      mesh.position.set(ox+rr.x*U, 0, oz+rr.y*U);
      root.add(mesh);
    });
    return root;
  }

  function mountChunkViewer(chunk, rot){
    const el=document.getElementById('rgdChunkView3d');
    if(!el) return;
    const prev=_chunkThree;
    const keep=prev?{
      yaw:prev.targetYaw!=null?prev.targetYaw:prev.yaw,
      pitch:prev.targetPitch!=null?prev.targetPitch:prev.pitch,
      dist:prev.targetDist!=null?prev.targetDist:prev.dist,
      lookX:prev.targetX!=null?prev.targetX:prev.lookX,
      lookY:prev.targetY!=null?prev.targetY:prev.lookY,
      lookZ:prev.targetZ!=null?prev.targetZ:prev.lookZ,
    }:null;
    disposeChunkViewer();
    const cw=Math.max(1, +(chunk&&chunk.cw)||2), ch=Math.max(1, +(chunk&&chunk.ch)||2);
    const cz=Math.max(1, +(chunk&&chunk.cz)||1);
    const span=Math.max(cw, ch, cz, 1)*CELL;
    mountOrbitViewer(h=>{
      _chunkThree=h;
      if(keep&&keep.yaw!=null){
        h.yaw=h.targetYaw=keep.yaw;
        h.pitch=h.targetPitch=keep.pitch;
        h.dist=h.targetDist=keep.dist;
        if(keep.lookX!=null){ h.lookX=h.targetX=keep.lookX; h.lookY=h.targetY=keep.lookY; h.lookZ=h.targetZ=keep.lookZ; }
      }
    }, el, {
      buildRoot:()=>buildChunkMesh3D(chunk, rot||0),
      dist: Math.max(4.5, span*1.35+CELL*2.2),
      lookY: cz*CELL*0.5,
      pitch: 0.55,
      gridSize: Math.max(8, Math.ceil(Math.max(cw, ch, cz)+4)),
    });
  }

  function refreshChunkThree(chunk, rot){
    if(!document.getElementById('rgdChunkView3d')) return;
    mountChunkViewer(chunk, rot);
  }

  function buildLayoutMesh3D(result, stageIdx, demoIdx){
    const root=new THREE.Group();
    if(typeof THREE==='undefined'||!result||!result.ok) return root;
    const U=CELL;
    const trace=result.trace||[];
    const stage=trace[stageIdx!=null?stageIdx:trace.length-1]||trace[trace.length-1]||{};
    const placements=stage.placements||result.layout||[];
    const w=Math.max(1, +(result.w)||1), h=Math.max(1, +(result.h)||1);
    const ox=-(w-1)*0.5*U, oz=-(h-1)*0.5*U;
    const byId={};
    (state.chunks||[]).forEach(c=>{ if(c&&c.id) byId[c.id]=c; });

    // ponytail: full per-cell mesh ok under ~4000 cells; above that one box/placement
    let cellEst=0;
    placements.forEach(p=>{
      const ch=byId[p.chunkId];
      cellEst+=(ch?(+(ch.cw)||1)*(+(ch.ch)||1)*(+(ch.cz)||1):(+p.cw||1)*(+p.ch||1));
    });
    const detail=cellEst<=4000;

    placements.forEach(p=>{
      if(!p) return;
      const ch=byId[p.chunkId];
      const cw=Math.max(1, +(p.cw)||(ch&&ch.cw)||1);
      const chh=Math.max(1, +(p.ch)||(ch&&ch.ch)||1);
      const cz=Math.max(1, +(ch&&ch.cz)||1);
      const cx=+(p.cx)||0, cy=+(p.cy)||0;
      const wx=ox+(cx+(cw-1)*0.5)*U;
      const wz=oz+(cy+(chh-1)*0.5)*U;
      const roleHex=LAYOUT_ROLE_HEX[p.role]||0x6366f1;
      const slab=new THREE.Mesh(
        new THREE.BoxGeometry(cw*U*0.98, U*0.05, chh*U*0.98),
        mat(roleHex, { transparent:true, opacity:0.4 })
      );
      slab.position.set(wx, U*0.025, wz);
      root.add(slab);

      if(detail && ch){
        const mesh=buildChunkMesh3D(ch, p.rot||0);
        mesh.position.set(wx, 0, wz);
        root.add(mesh);
      } else {
        const box=new THREE.Mesh(
          new THREE.BoxGeometry(cw*U*0.9, cz*U*0.85, chh*U*0.9),
          mat(roleHex, { transparent:true, opacity:0.55 })
        );
        box.position.set(wx, cz*U*0.42, wz);
        root.add(box);
      }
    });

    const path=result.mainPath||[];
    if(path.length>1){
      const pts=path.map(pt=>new THREE.Vector3(ox+(+pt[0]||0)*U, U*0.22, oz+(+pt[1]||0)*U));
      const geo=new THREE.BufferGeometry().setFromPoints(pts);
      root.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color:0x38bdf8 })));
    }
    if(path.length && demoIdx!=null && demoIdx>=0){
      const pt=path[Math.min(demoIdx, path.length-1)];
      if(pt){
        const m=new THREE.Mesh(new THREE.SphereGeometry(U*0.28, 12, 12), mat(0xfef08a));
        m.position.set(ox+(+pt[0]||0)*U, U*0.35, oz+(+pt[1]||0)*U);
        root.add(m);
      }
    }

    const grid=result.grid;
    if(grid&&grid._sparse&&grid.cells){
      Object.keys(grid.cells).forEach(k=>{
        const ent=grid.cells[k].entity; if(!ent) return;
        const [x,y]=k.split(',').map(Number);
        const col=ent.kind==='npc'?0xf472b6:0x34d399;
        const sph=new THREE.Mesh(new THREE.SphereGeometry(U*0.16, 10, 10), mat(col));
        sph.position.set(ox+x*U, U*0.32, oz+y*U);
        root.add(sph);
      });
    }
    return root;
  }

  function mountProcgenViewer(result, stageIdx, demoIdx){
    const el=document.getElementById('rgdProcgenView3d');
    if(!el) return;
    // Stage scrub: same DOM node → swap mesh only, keep orbit
    if(_pgThree && _pgThree.el===el && typeof _pgThree.replaceRoot==='function'){
      _pgThree.replaceRoot(buildLayoutMesh3D(result, stageIdx, demoIdx));
      return;
    }
    const keep=_pgThree?_stashOrbitKeep(_pgThree):_pgOrbitKeep;
    disposeProcgenViewer();
    const w=Math.max(1, +(result&&result.w)||8), h=Math.max(1, +(result&&result.h)||8);
    mountOrbitViewer(hnd=>{
      _pgThree=hnd;
      if(keep&&keep.yaw!=null){
        hnd.yaw=hnd.targetYaw=keep.yaw;
        hnd.pitch=hnd.targetPitch=keep.pitch;
        hnd.dist=hnd.targetDist=keep.dist;
        if(keep.lookX!=null){
          hnd.lookX=hnd.targetX=keep.lookX;
          hnd.lookY=hnd.targetY=keep.lookY;
          hnd.lookZ=hnd.targetZ=keep.lookZ;
        }
        _pgOrbitKeep=keep;
      } else if(typeof hnd.fitToBounds==='function'){
        hnd.fitToBounds();
        _pgOrbitKeep=_stashOrbitKeep(hnd);
      }
    }, el, {
      buildRoot:()=>buildLayoutMesh3D(result, stageIdx, demoIdx),
      pitch: 0.7,
      yaw: 0.85,
      autoFit: !(keep&&keep.yaw!=null),
      gridSize: Math.max(12, Math.ceil(Math.max(w, h)+6)),
    });
  }

  function refreshProcgenThree(result, stageIdx, demoIdx){
    if(!document.getElementById('rgdProcgenView3d')) return;
    mountProcgenViewer(result, stageIdx, demoIdx);
  }

  function assetsHostEl(){
    return document.getElementById('tab-assets') || document.getElementById('levelsSubHost');
  }
  function renderAssets(){
    const list=assetsList();
    const a=selectedAsset();
    const host=assetsHostEl();
    if(!host) return;
    disposeAllThreeViewers();
    const kinds=['floor','wall','roof','arch','door','column','prop'];
    const items=list.map(ch=>{
      const col=KIND_COLORS[ch.kind]||KIND_COLORS.prop;
      const cp=ch.contentPath||contentPathLabel(ch.assetPath);
      return `<button onclick="RGD.selectAsset('${ch.id}')" class="w-full text-left px-3 py-2 rounded-lg border mb-1.5 ${ch.id===_assetSel?'border-amber-500 bg-amber-600/15':'border-gray-700 bg-gray-800 hover:bg-gray-750'}">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-white font-medium truncate">${esc(ch.name||ch.id)}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded" style="background:${col}33;color:${col}">${esc(ch.kind||'prop')}</span>
        </div>
        <div class="text-[10px] text-gray-500 mt-0.5 font-mono truncate" title="${esc(cp)}">${esc(cp||'(no Content path)')}${ch.source==='uefn'?' · UEFN':''}</div>
      </button>`;
    }).join('')||`<div class="text-xs text-gray-500 p-3">No assets yet.</div>`;

    host.innerHTML=`
      <div class="mb-3 rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100/90">
        <b class="text-amber-200">Assets</b> — manage every floor / wall / roof / arch / door / column here.
        Place them on chunks via <button onclick="RGD.go('levels');RGD.setLevelsSubtab('chunks')" class="underline text-white">Levels → Chunks → Prop</button> (3D view shows them).
      </div>
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <button onclick="RGD.syncAssetsFromUeFn()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm flex items-center gap-1.5"><i data-lucide="download" class="w-4 h-4"></i> Sync from UEFN Content</button>
        <button onclick="RGD.newKitAsset()" class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm flex items-center gap-1.5"><i data-lucide="plus" class="w-4 h-4"></i> New asset</button>
        <button onclick="RGD.toggleAssetCompose()" class="px-3 py-2 rounded-lg text-sm ${_assetCompose?'bg-amber-600 text-white':'bg-gray-700 hover:bg-gray-600'}">Compose room (kit)</button>
        <div class="flex-1"></div>
        <span class="text-xs text-gray-500">${list.length} assets · Content/… paths</span>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4" style="min-height:420px">
        <div class="lg:col-span-1 bg-gray-800/50 border border-gray-700 rounded-xl p-3 overflow-y-auto max-h-[70vh]">${items}</div>
        <div class="lg:col-span-2 bg-gray-800 border border-gray-700 rounded-xl p-4">
          ${a?`
            <div class="flex flex-wrap items-start gap-3 mb-3">
              <div class="flex-1 min-w-[200px]">
                <div class="text-lg font-semibold text-white">${esc(a.name)}</div>
                <div class="text-[11px] text-gray-500 font-mono">${esc(a.id)} · preview:${esc(a.preview||a.kind||'?')}</div>
              </div>
              <button onclick="RGD.deleteAsset('${a.id}')" class="px-2 py-1.5 rounded-lg bg-gray-700 hover:bg-red-600 text-xs"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3 text-xs">
              <label class="text-gray-400">Name<input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" value="${esc(a.name||'')}" onchange="RGD.updateAssetField('name',this.value)"/></label>
              <label class="text-gray-400">Kind<select class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" onchange="RGD.updateAssetField('kind',this.value)">${kinds.map(k=>`<option value="${k}" ${(a.kind||'prop')===k?'selected':''}>${k}</option>`).join('')}</select></label>
              <label class="text-gray-400">Preview<select class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white" onchange="RGD.updateAssetField('preview',this.value)">${['floor','wall','roof','arch','door','column','cube'].map(k=>`<option value="${k}" ${(a.preview||a.kind||'cube')===k?'selected':''}>${k}</option>`).join('')}</select></label>
              <label class="text-gray-400 col-span-2 md:col-span-3">Content path
                <input class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white font-mono text-[11px]" value="${esc(a.contentPath||contentPathLabel(a.assetPath))}" onchange="RGD.updateAssetField('assetPath',RGD.toUeContentPath(this.value))" placeholder="Content/Meshes/SM_…"/>
                <div class="text-[10px] text-gray-500 mt-1">UEFN mount: <span class="font-mono text-gray-400">${esc(a.assetPath||'—')}</span> · must live under project Content/</div>
              </label>
            </div>
            <div class="text-[11px] text-gray-500 mb-1">3D canvas · drag to rotate · scroll to zoom</div>
            <div id="rgdAssetView" class="rounded-xl border border-gray-700 overflow-hidden bg-[#0b1220]" style="height:420px;cursor:grab"></div>
            <div class="text-[10px] text-gray-500 mt-2">Orbit this mesh, then place it on a chunk (Levels → Chunks → Prop → 3D orbit tab).</div>
          `:`<div class="py-16 text-center text-gray-500 text-sm">Select an asset</div>`}
        </div>
      </div>`;
    if(typeof lucide!=='undefined') lucide.createIcons();
    if(a){
      requestAnimationFrame(()=>{
        const el=document.getElementById('rgdAssetView');
        mountAssetViewer(el, a);
      });
    }
  }

  function selectAsset(id){ _assetSel=id; renderAssets(); }
  function toggleAssetCompose(){ _assetCompose=!_assetCompose; renderAssets(); }

  function updateAssetField(key, val){
    const a=selectedAsset(); if(!a) return;
    if(key==='assetPath'){
      a.assetPath=toUeContentPath(val);
      a.contentPath=contentPathLabel(a.assetPath);
    } else if(key==='kind'){
      a.kind=val;
      if(!a.preview || a.preview===a.kind) a.preview=val==='prop'?'cube':val;
    } else {
      a[key]=val;
    }
    save({flush:true});
    bridge.call('upsert_chunk_asset',{
      id:a.id, name:a.name, asset_path:a.assetPath||'', kind:a.kind||'prop', preview:a.preview||a.kind||'prop'
    });
    renderAssets();
  }

  function newKitAsset(){
    const id='ast_'+Date.now().toString(36);
    const rec={id, name:'New Wall', assetPath:'/Roguelike/Meshes/SM_TileWall', contentPath:'Content/Meshes/SM_TileWall', kind:'wall', preview:'wall', source:'catalogue'};
    assetsList().push(rec);
    _assetSel=id;
    save({flush:true});
    bridge.call('upsert_chunk_asset',{id, name:rec.name, asset_path:rec.assetPath, kind:'wall', preview:'wall'});
    renderAssets();
  }

  async function deleteAsset(id){
    if(!confirm('Remove asset '+id+' from catalogue?')) return;
    state.chunkAssets=assetsList().filter(a=>a.id!==id);
    save({flush:true});
    renderAssets();
    toast('Removed','ok');
  }

  async function syncAssetsFromUeFn(){
    toast('Scanning UEFN Content meshes…','info');
    // Prefer raw so we don't mask unknown-tool after a plugin update without process restart.
    let r=await bridge.raw('rgd_sync_chunk_assets_from_uefn',{search:'SM_', limit:80});
    if(r===undefined) r=await bridge.call('sync_chunk_assets_from_uefn',{search:'SM_', limit:80});
    if(r&&r.error){
      const msg=String(r.error);
      if(/unknown tool/i.test(msg)){
        toast('Sync tool not loaded — fully quit UEFN-Ducky and reopen (panel reload is not enough)','err');
      } else toast(msg,'err');
      return;
    }
    const st=await bridge.raw('rgd_get_state',{});
    if(st&&Array.isArray(st.chunkAssets)) state.chunkAssets=st.chunkAssets;
    renderAssets();
    toast('Synced +'+(r&&r.added||0)+' / ~'+(r&&r.updated||0)+' · total '+(r&&r.total||assetsList().length),'ok');
  }
