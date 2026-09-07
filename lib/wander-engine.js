/* Wander engine — turns traced rooms into a furnished, lit, first-person house.
   All geometry is procedural; textures are generated on canvases so it works offline. */
import * as THREE from './three.module.js';
import { PointerLockControls } from './PointerLockControls.js';
import { RoomEnvironment } from './RoomEnvironment.js';
import { GLTFLoader } from './GLTFLoader.js';
import { RGBELoader } from './RGBELoader.js';

/* ───────────────────────── scanned furniture (Poly Haven, CC0) ───────────────────────── */
const ASSET_BASE = new URL('../', import.meta.url).href;
let manifest = null; const gltfCache = {}; const loader = new GLTFLoader();
export async function preloadAssets(keys) {
  if (!manifest) manifest = await (await fetch(ASSET_BASE + 'models/manifest.json')).json();
  const pending = {};
  await Promise.all(keys.map(k => gltfCache[k] ? null : (pending[k] || (pending[k] = loader.loadAsync(ASSET_BASE + manifest.files[k]).then(g => { g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.material && o.material.map) o.material.map.anisotropy = 8; } }); gltfCache[k] = g.scene; }).catch(e => console.warn('asset failed', k, e))))));
}
/* place a model: x,z position (metres), ry facing, opts: {w|d|h: fit that dimension, footY: put base on floor (default true)} */
function asset(key, x, z, ry=0, opts={}) {
  const src = gltfCache[key]; if (!src) return null;
  const m = src.clone(); const dims = manifest.dims[key]; const [sx,sy,sz] = dims.size;
  let sc = opts.scale || 1; if (opts.w) sc = opts.w/sx; else if (opts.d) sc = opts.d/sz; else if (opts.h) sc = opts.h/sy;
  m.scale.setScalar(sc);
  const y = opts.y !== undefined ? opts.y : (opts.foot === false ? 0 : -dims.min[1]*sc);
  m.position.set(x, y, z); m.rotation.y = ry; m.userData.size = [sx*sc, sy*sc, sz*sc]; return m;
}

/* ───────────────────────── procedural textures ───────────────────────── */
const texCache = {};
function canvasTex(key, w, h, draw, repeat=[1,1]) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; texCache[key] = t; return t;
}
const TEX_BASE = new URL('../tex/', import.meta.url).href;
const texManager = new THREE.LoadingManager(); const texLoader = new THREE.TextureLoader(texManager); const pbrCache = {};
export function texturesReady(){ return new Promise(r => { let done=false; texManager.onLoad = () => { done=true; r(); }; setTimeout(()=>{ if(!done) r(); }, 8000); }); }
function pbr(key, repeat, extra={}) {
  const ck = key+repeat.join('x')+JSON.stringify(extra); if (pbrCache[ck]) return pbrCache[ck];
  const ld = (n, srgb) => { const t = texLoader.load(TEX_BASE + key + '_' + n + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const m = new THREE.MeshStandardMaterial({ map: ld('d', true), normalMap: ld('n'), roughnessMap: ld('r'), roughness: 1, metalness: 0, ...extra }); if (extra.normalScale!==undefined) m.normalScale=new THREE.Vector2(extra.normalScale,extra.normalScale);
  pbrCache[ck] = m; return m;
}
const rnd = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(42);
function oakFloor() {
  return canvasTex('oak', 1024, 1024, (g,w,h) => {
    g.fillStyle = '#b8895a'; g.fillRect(0,0,w,h);
    const pw = 128, pl = 512;
    for (let y=0; y<h; y+=pw) { const off = (y/pw % 2) * pl/2;
      for (let x=-pl; x<w+pl; x+=pl) {
        const hue = 28 + rnd()*6, l = 48 + rnd()*12;
        g.fillStyle = `hsl(${hue},45%,${l}%)`; g.fillRect(x+off, y, pl-2, pw-2);
        for (let k=0;k<26;k++){ g.strokeStyle=`hsla(${hue-6},40%,${l-14+rnd()*8}%,${0.25+rnd()*0.3})`; g.lineWidth=1+rnd()*2; g.beginPath(); const yy=y+rnd()*pw; g.moveTo(x+off,yy); g.bezierCurveTo(x+off+pl*0.3,yy+rnd()*8-4,x+off+pl*0.6,yy+rnd()*8-4,x+off+pl,yy+rnd()*6-3); g.stroke(); }
        g.fillStyle='rgba(0,0,0,.35)'; g.fillRect(x+off+pl-2,y,2,pw); g.fillRect(x+off,y+pw-2,pl,2);
      } }
  }, [1,1]);
}
function plaster() {
  return canvasTex('plaster', 512, 512, (g,w,h) => { g.fillStyle='#ece7de'; g.fillRect(0,0,w,h);
    for (let i=0;i<9000;i++){ g.fillStyle=`rgba(${120+rnd()*60},${110+rnd()*60},${100+rnd()*60},${rnd()*0.06})`; g.fillRect(rnd()*w,rnd()*h,1+rnd()*2,1+rnd()*2); } }, [2,2]);
}
function tiles(col='#dfe3e6', grout='#b9bec3') {
  return canvasTex('tiles'+col, 512, 512, (g,w,h) => { g.fillStyle=grout; g.fillRect(0,0,w,h);
    for (let y=0;y<h;y+=128) for (let x=0;x<w;x+=128){ g.fillStyle=col; g.fillRect(x+3,y+3,122,122); g.fillStyle=`rgba(0,0,0,${rnd()*0.05})`; g.fillRect(x+3,y+3,122,122);} }, [2,2]);
}
function carpet() {
  return canvasTex('carpet', 512, 512, (g,w,h) => { g.fillStyle='#9a9a94'; g.fillRect(0,0,w,h);
    for (let i=0;i<40000;i++){ g.fillStyle=`rgba(${100+rnd()*80},${100+rnd()*80},${95+rnd()*80},.35)`; g.fillRect(rnd()*w,rnd()*h,2,2);} }, [3,3]);
}
function fabric(col) {
  return canvasTex('fab'+col, 256, 256, (g,w,h) => { g.fillStyle=col; g.fillRect(0,0,w,h);
    for (let i=0;i<20000;i++){ g.fillStyle=`rgba(255,255,255,${rnd()*0.08})`; g.fillRect(rnd()*w,rnd()*h,1,1);} for (let i=0;i<20000;i++){ g.fillStyle=`rgba(0,0,0,${rnd()*0.08})`; g.fillRect(rnd()*w,rnd()*h,1,1);} }, [2,2]);
}
function skyTex() {
  return canvasTex('sky', 1024, 512, (g,w,h) => { const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'#7fb2e6'); gr.addColorStop(.55,'#d8e8f6'); gr.addColorStop(.6,'#c9d6c4'); gr.addColorStop(1,'#93b57a'); g.fillStyle=gr; g.fillRect(0,0,w,h);
    for (let i=0;i<14;i++){ g.fillStyle='rgba(255,255,255,.55)'; const x=rnd()*w,y=60+rnd()*150,r=30+rnd()*60; for(let k=0;k<5;k++){ g.beginPath(); g.arc(x+k*r*0.7-r,y+rnd()*10,r*(0.6+rnd()*0.5),0,7); g.fill(); } } });
}

function artTex(i){
  return canvasTex('art'+i, 512, 512, (g,w,h) => {
    const pal=[['#e8dfd0','#b7a58a','#5b6b63','#2f2a26'],['#f0ebe3','#c98d5a','#7a8b9c','#3a3632'],['#ece6da','#9aa78f','#d3b17f','#4b4a44']][i%3];
    g.fillStyle=pal[0]; g.fillRect(0,0,w,h);
    for(let k=0;k<7;k++){ g.fillStyle=pal[1+(k%3)]; g.globalAlpha=0.55+rnd()*0.4; g.beginPath(); const x=rnd()*w,y=rnd()*h,r=60+rnd()*160; if(k%2){ g.arc(x,y,r,0,7); } else { g.rect(x-r*0.6,y-r*0.3,r*1.2,r*0.6); } g.fill(); }
    g.globalAlpha=1; g.fillStyle='rgba(0,0,0,.06)'; for(let k=0;k<3000;k++) g.fillRect(rnd()*w,rnd()*h,1,1);
  });
}
function dressPicture(m, i){
  m.traverse(o=>{ if(o.isMesh){ const n=(o.material&&o.material.name||'').toLowerCase(); if(/artwork/.test(n)){ o.material = new THREE.MeshStandardMaterial({ map: artTex(i), roughness: .85, metalness: 0 }); }
    else if(/glass/.test(n)){ o.material = new THREE.MeshPhysicalMaterial({ color:0xffffff, transmission:.9, transparent:true, opacity:.15, roughness:.05, metalness:0 }); } } });
  return m;
}
/* ───────────────────────── materials ───────────────────────── */
function materials() {
  const M = {
    wall: pbr('plaster',[1.5,1.5],{ color: 0xffffff, normalScale: 0.15 }),
    wallPaint: c => pbr('plaster',[1.5,1.5],{ color: new THREE.Color(c), normalScale: 0.15 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xf6f4f0, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.0, emissive: 0xffffff, emissiveIntensity: 0.28 }),
    oak: pbr('oak',[1,1],{ color: 0x9e8b71, normalScale: 0.7 }),
    tile: pbr('tile',[1,1],{ color: 0xe8e8e6 }),
    tileDark: pbr('tileDark',[1,1],{ color: 0xd9d4cc }),
    carpet: pbr('carpet',[1,1],{ color: 0xcfc6b8, normalScale: 0.5 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: .35 }),
    frame: new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: .5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: .95, transparent: true, opacity: .35, roughness: .02, thickness: .01, ior: 1.5 }),
    door: new THREE.MeshStandardMaterial({ color: 0xeeece6, roughness: .55 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a24b, metalness: 1, roughness: .3 }),
    walnut: new THREE.MeshStandardMaterial({ color: 0x5b3a26, roughness: .55 }),
    lightOak: new THREE.MeshStandardMaterial({ color: 0xcfa878, roughness: .6 }),
    linen: pbr('linen',[2,2],{ color: 0xffffff, normalScale: 0.4 }),
    sofa: new THREE.MeshStandardMaterial({ map: fabric('#6f7a86'), roughness: 1 }),
    cushion: pbr('linen',[2,2],{ color: 0xc49a6c, normalScale: 0.4 }),
    duvet: pbr('linen',[2,2],{ color: 0xffffff, normalScale: 0.5 }),
    throw: pbr('linen',[2,2],{ color: 0xa9a294, normalScale: 0.5 }),
    matte: c => new THREE.MeshStandardMaterial({ color: c, roughness: .8 }),
    white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .3 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xdcd8d0, roughness: .35 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xbfc3c7, metalness: .9, roughness: .35 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: .6 }),
    plant: new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: .9 }),
    pot: new THREE.MeshStandardMaterial({ color: 0xb98d6b, roughness: .8 }),
    grass: pbr('grass',[40,40]),
    paving: new THREE.MeshStandardMaterial({ color: 0xa7a39a, roughness: .9 }),
  };
  return M;
}

/* ───────────────────────── helpers ───────────────────────── */
const box = (w,h,d,mat,x=0,y=0,z=0,ry=0) => { const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); m.rotation.y=ry; m.castShadow=m.receiveShadow=true; return m; };
const cyl = (r,h,mat,x=0,y=0,z=0,seg=24) => { const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,seg),mat); m.position.set(x,y,z); m.castShadow=m.receiveShadow=true; return m; };
const rounded = (w,h,d,r,mat) => { const s=new THREE.Shape(); const x=-w/2,y=-d/2; s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r); s.lineTo(x+w,y+d-r); s.quadraticCurveTo(x+w,y+d,x+w-r,y+d); s.lineTo(x+r,y+d); s.quadraticCurveTo(x,y+d,x,y+d-r); s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y);
  const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:true,bevelSize:Math.min(r*0.4,0.03),bevelThickness:0.02,bevelSegments:3}); g.rotateX(-Math.PI/2); g.translate(0,0,0); const m=new THREE.Mesh(g,mat); m.castShadow=m.receiveShadow=true; return m; };
const roomType = name => { const n=name.toLowerCase(); if(/bath|wc|shower|ensuite|en-suite|cloak/.test(n)) return 'bath'; if(/kitchen|diner|dining/.test(n)) return 'kitchen'; if(/bed|box room|nursery/.test(n)) return 'bed'; if(/hall|landing|porch|lobby|store|cupboard|utility|boot/.test(n)) return 'hall'; if(/garage/.test(n)) return 'garage'; if(/study|office/.test(n)) return 'study'; if(/conserv|garden room|sun/.test(n)) return 'garden'; return 'living'; };

/* ───────────────────────── furniture ───────────────────────── */
function furnish(group, type, cx, cz, w, d, ang0, M, H) {
  // local frame: origin = room centre, -z = "back" wall (solid), +z = front. w along x, d along z.
  const g = new THREE.Group(); g.position.set(cx,0,cz); g.rotation.y = ang0; group.add(g);
  const add = m => { if (m) g.add(m); return m; };
  const rug = (rw,rd,col,x=0,z=0) => { const r=new THREE.Mesh(new THREE.PlaneGeometry(rw,rd), pbr('carpet',[1.5,1.5],{ color: new THREE.Color(col).multiplyScalar(0.95), normalScale: 0.5 })); r.rotation.x=-Math.PI/2; r.position.set(x,0.012,z); r.receiveShadow=true; return add(r); };
  const warm = (x,y,z,i=3,dist=4) => { const l=new THREE.PointLight(0xffd2a0,i,dist,2); l.position.set(x,y,z); add(l); };
  let picN = 0; const pic = (key,x,y,z,ry,sc=1) => { const m = asset(key,x,z,ry,{y, scale:sc}); if (m) dressPicture(m, picN++); return add(m); };
  const back = -d/2, front = d/2, left = -w/2, right = w/2;
  const big = w*d > 12, mid = w*d > 7;

  if (type==='living') {
    rug(Math.min(w-1,3.4), Math.min(d-1.2,2.4), '#cdc4b4', 0, 0.1);
    // sofa faces the back wall (TV); sits toward the front
    add(asset('sofa', 0, front-1.15, Math.PI, {w: Math.min(2.3, w-1.4)}));
    add(asset('coffee_table', 0, 0.15, Math.PI/2, {d: 1.05}));
    add(asset('vase', 0.2, 0.15, 0, {h:0.26, y:0.36})); 
    if (w>3.6) add(asset('armchair', right-0.7, -0.2, -Math.PI/2-0.6, {w:0.8}));
    // media cabinet + TV on back wall
    add(asset('cabinet', 0, back+0.36, 0, {w: Math.min(1.9, w*0.45)}));
    add(box(1.25,0.72,0.035,M.black,0,1.15,back+0.13)); add(box(1.2,0.66,0.01,new THREE.MeshStandardMaterial({color:0x0e1014,roughness:.15,metalness:.5}),0,1.15,back+0.152));
    pic('picture2', Math.min(1.55, w/2-0.6), 1.55, back+0.09, 0, 1.0);
    add(asset('plant', left+0.45, back+0.5, 0.4, {h:1.1})); if (mid) add(asset('plant2', right-0.5, front-0.5, 0, {h:0.6}));
    if (w>4.6) add(asset('bookshelf', left+0.32, 0.3, Math.PI/2, {h:2.0}));
    
    warm(left+0.6, 1.4, front-0.6, 5, 5);
  } else if (type==='bed') {
    if (mid) rug(Math.min(w-1,2.6), Math.min(d-1.4,1.8), '#bfb5a6', 0, 0.3);
    const bw = big ? 1.6 : mid ? 1.5 : 1.35;
    add(asset('bed', 0, back+1.0, 0, {w: bw}));
    add(rounded(bw+0.14,0.18,1.5,0.09,M.duvet)).position.set(0,0.50,back+1.32); add(rounded(bw+0.16,0.08,0.7,0.04,M.throw)).position.set(0,0.66,back+1.75); add(rounded(bw*0.44,0.16,0.42,0.08,M.linen)).position.set(-bw*0.25,0.56,back+0.52); add(rounded(bw*0.44,0.16,0.42,0.08,M.linen)).position.set(bw*0.25,0.56,back+0.52); add(rounded(bw*0.3,0.12,0.3,0.06,M.cushion)).position.set(0,0.66,back+0.6);
    [-1,1].forEach(sd=>{ if (w > bw+1.2) { add(asset('nightstand', sd*(bw/2+0.4), back+0.32, 0, {w:0.5})); if (sd>0) add(asset('desk_lamp', sd*(bw/2+0.4), back+0.32, 0, {h:0.42, y:0.62})); else add(asset('vase2', sd*(bw/2+0.4), back+0.32, 0, {h:0.22, y:0.62})); warm(sd*(bw/2+0.4), 1.0, back+0.32, 1.6, 2.5); } });
    if (w>3.2 && d>3.2) add(asset('wardrobe', right-0.35, front-0.75, -Math.PI/2, {h:1.9, y:0}));
    add(asset('plant3', left+0.3, front-0.3, 0, {h:0.3})); if (mid) add(asset('plant', left+0.4, front-0.5, 0, {h:1.2}));
    pic('picture', 0, 1.6, back+0.09, 0, 1.1); 
  } else if (type==='kitchen') {
    const runLen = Math.min(w-0.4, 4.4);
    add(box(runLen,0.86,0.6,M.matte(0x2f353a),0,0.43,back+0.32)); add(box(runLen+0.04,0.04,0.64,M.stone,0,0.88,back+0.32)); add(box(runLen,0.7,0.35,M.matte(0x2f353a),0,1.75,back+0.18));
    for(let x=-runLen/2+0.3;x<runLen/2;x+=0.6){ add(box(0.5,0.02,0.02,M.brass,x,0.7,back+0.62)); add(box(0.5,0.02,0.02,M.brass,x,1.45,back+0.36)); }
    add(box(0.6,0.02,0.45,M.steel,-runLen/4,0.905,back+0.32)); add(box(0.5,0.14,0.34,M.matte(0x1c1c1c),-runLen/4,0.98,back+0.32));
    add(cyl(0.015,0.32,M.brass,runLen/4,1.06,back+0.16,10)); add(box(0.2,0.015,0.015,M.brass,runLen/4+0.1,1.2,back+0.16)); add(box(0.5,0.02,0.36,M.steel,runLen/4,0.9,back+0.32));
    add(box(0.6,0.6,0.5,M.matte(0x151515),runLen/2-0.35,0.5,back+0.32));
    add(asset('vase2', -0.3, back+0.32, 0, {h:0.3, y:0.9})); add(asset('plant3', 0.6, back+0.3, 0, {h:0.25, y:0.9}));
    if (w>3.6 && d>3.6) { add(box(1.8,0.9,0.9,M.matte(0xe6e2da),0,0.45,0.3)); add(box(1.88,0.04,0.98,M.stone,0,0.92,0.3)); [-0.5,0.5].forEach(x=>add(asset('stool', x, 0.95, Math.PI, {h:0.68}))); [-0.5,0.5].forEach(x=>{ add(asset('pendant', x, 0.3, 0, {y:H-0.02, h:0.55, foot:false})); warm(x, H-0.6, 0.3, 4, 4); }); add(asset('vase', 0.4, 0.3, 0, {h:0.3, y:0.94})); }
    else if (d>3) { add(asset('dining_table', 0, 0.7, 0, {w: Math.min(1.6, w-1.2)})); [[-0.45,0.25,0],[0.45,0.25,0],[-0.45,1.15,Math.PI],[0.45,1.15,Math.PI]].forEach(([x,z,r])=>add(asset('dining_chair', x, z, r, {h:0.95}))); add(asset('vase', 0, 0.7, 0, {h:0.3, y:0.76})); }
    if (/diner|dining/.test(type) || (w>5 && d>3)) {}
    add(asset('plant', right-0.4, front-0.4, 0, {h:1.2}));
  } else if (type==='bath') {
    const large = w*d > 4.5;
    if (large) { add(box(1.7,0.55,0.75,M.white,left+0.9,0.275,back+0.4)); add(box(1.5,0.02,0.55,M.matte(0xc6dde8),left+0.9,0.55,back+0.4)); add(cyl(0.015,0.2,M.steel,left+0.35,0.66,back+0.4,8)); }
    else { add(box(0.9,0.05,0.9,M.white,left+0.5,0.025,back+0.5)); add(box(0.02,2.0,0.9,M.glass,left+0.95,1.0,back+0.5)); add(cyl(0.02,1.1,M.steel,left+0.5,1.6,back+0.1,8)); add(cyl(0.12,0.02,M.steel,left+0.5,2.15,back+0.3)); }
    add(box(0.6,0.4,0.42,M.white,right-0.4,0.4,front-0.35)); add(box(0.4,0.32,0.36,M.white,right-0.4,0.16,front-0.35)); add(box(0.38,0.5,0.14,M.white,right-0.4,0.6,front-0.1));
    add(box(0.6,0.75,0.45,M.lightOak,right-0.5,0.375,back+0.3)); add(box(0.62,0.05,0.47,M.stone,right-0.5,0.78,back+0.3)); add(cyl(0.18,0.1,M.white,right-0.5,0.85,back+0.3)); add(cyl(0.012,0.25,M.brass,right-0.5,0.98,back+0.08,8));
    add(asset('mirror', right-0.5, back+0.09, 0, {y:1.45, h:0.75})); add(asset('plant3', right-0.25, back+0.3, 0, {h:0.22, y:0.8}));
    add(cyl(0.02,0.6,M.brass,left+0.05,1.2,front-0.4,8)); add(box(0.04,0.55,0.35,M.linen,left+0.08,0.9,front-0.4));
  } else if (type==='study') {
    add(asset('desk', 0, back+0.55, 0, {w: Math.min(1.6, w-0.8)}));
    add(asset('desk_lamp', -0.5, back+0.45, 0.3, {h:0.5, y:0.77})); warm(-0.5, 1.15, back+0.45, 2, 3);
    add(box(0.58,0.34,0.02,M.black,0.1,1.02,back+0.4)); add(box(0.56,0.32,0.005,new THREE.MeshStandardMaterial({color:0x17365a,emissive:0x17365a,emissiveIntensity:.5}),0.1,1.02,back+0.415)); add(cyl(0.02,0.2,M.black,0.1,0.87,back+0.4,8)); add(cyl(0.1,0.01,M.black,0.1,0.78,back+0.4));
    add(asset('dining_chair', 0.1, back+1.15, Math.PI, {h:0.95}));
    if (w>2.4) add(asset('bookshelf', left+0.3, 0.4, Math.PI/2, {h:1.95}));
    add(asset('plant', right-0.4, front-0.4, 0, {h:1.15})); pic('picture', 0.9, 1.5, back+0.09, 0, 0.8);
  } else if (type==='garden') {
    rug(Math.min(w-1,2.2), Math.min(d-1,1.6), '#cfc6b6');
    add(asset('armchair', -0.6, 0.1, Math.PI+0.3, {w:0.85})); add(asset('armchair', 0.6, 0.1, Math.PI-0.3, {w:0.85})); add(asset('side_table', 0, -0.7, 0, {w:0.7}));
    add(asset('plant', right-0.45, front-0.45, 0, {h:1.35})); add(asset('plant2', left+0.5, back+0.5, 0, {h:0.65})); add(asset('vase2', 0, -0.7, 0, {h:0.3, y:0.48}));
  } else if (type==='hall') {
    if (w*d>3) { add(asset('cabinet', 0, back+0.36, 0, {w: Math.min(1.4, w-0.6)})); add(asset('vase', 0.2, back+0.36, 0, {h:0.35, y:0.68})); add(asset('plant3', -0.35, back+0.36, 0, {h:0.25, y:0.68})); add(asset('mirror', 0, back+0.09, 0, {y:1.5, h:0.75})); }
    if (Math.max(w,d)>2.4) add(asset('plant', right-0.35, front-0.35, 0, {h:1.2}));
  } else if (type==='garage') {
    add(box(1.8,0.5,4.2,M.matte(0x5a5e63),0,0.5,0)); add(box(1.7,0.6,2.2,M.matte(0x5a5e63),0,1.0,-0.2)); [[-0.8,1.4],[0.8,1.4],[-0.8,-1.4],[0.8,-1.4]].forEach(([x,z])=>{ const wh=cyl(0.32,0.22,M.black,x,0.32,z); wh.rotation.z=Math.PI/2; add(wh); });
    add(box(1.0,1.8,0.4,M.steel,left+0.5,0.9,back+0.25));
  }
}

/* ───────────────────────── main build ───────────────────────── */
export function buildHouse(scene, rooms, opts) {
  const { H=2.6, mpp, iw, ih, quality='full' } = opts; // mpp = metres per plan pixel
  const M = materials();
  const toW = p => ({ x: p.x*iw*mpp, z: p.y*ih*mpp });
  const colliders = [];
  const house = new THREE.Group(); scene.add(house);
  const T = 0.14;

  // edges shared between two rooms are interior
  const edgeKey = (a,b) => { const k1=`${a.x.toFixed(2)},${a.z.toFixed(2)}`, k2=`${b.x.toFixed(2)},${b.z.toFixed(2)}`; return k1<k2?k1+'|'+k2:k2+'|'+k1; };
  const roomsW = rooms.map(r => r.pts.map(toW));
  // to get proper shared edges even when rooms have different corner sets, split every edge at every other room's vertex lying on it
  const allPts = roomsW.flat();
  const splitEdge = (a,b) => { const pts=[a]; const L=Math.hypot(b.x-a.x,b.z-a.z); const ux=(b.x-a.x)/L, uz=(b.z-a.z)/L; const ts=[];
    for (const p of allPts) { const t=((p.x-a.x)*ux+(p.z-a.z)*uz); if (t>0.05 && t<L-0.05) { const px=a.x+ux*t, pz=a.z+uz*t; if (Math.hypot(px-p.x,pz-p.z)<0.04) ts.push(t); } }
    ts.sort((x,y)=>x-y); for (const t of ts) pts.push({x:a.x+ux*t,z:a.z+uz*t}); pts.push(b); const segs=[]; for (let i=0;i<pts.length-1;i++) segs.push([pts[i],pts[i+1]]); return segs; };
  const roomSegs = roomsW.map(w => { const s=[]; for (let i=0;i<w.length;i++) s.push(...splitEdge(w[i], w[(i+1)%w.length])); return s; });
  const edgeCount = {}, edgeTypes = {}; roomSegs.forEach((s,ri) => s.forEach(([a,b]) => { const k=edgeKey(a,b); edgeCount[k]=(edgeCount[k]||0)+1; (edgeTypes[k]=edgeTypes[k]||[]).push(roomType(rooms[ri].name)); }));
  const built = new Set(); const furnishOrient = new Map();

  const bounds = new THREE.Box3(); allPts.forEach(p => bounds.expandByPoint(new THREE.Vector3(p.x,0,p.z)));
  const centre = bounds.getCenter(new THREE.Vector3()); const centreRef = centre;
  const paint = ['#ece7de','#e6e2d6','#dfe3dc','#e9e1d4','#e2e6ea','#efe9df'];

  rooms.forEach((room, ri) => {
    const w = roomsW[ri], type = roomType(room.name);
    const shape = new THREE.Shape(w.map(p => new THREE.Vector2(p.x, p.z)));
    const floorMat = type==='bath' ? M.tile : type==='kitchen' ? M.tileDark : type==='bed' ? M.carpet : type==='garage' ? M.paving : M.oak;
    const fg = new THREE.ShapeGeometry(shape); // uv in metres → scale
    const uv = fg.attributes.uv; for (let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)/ (type==='bed'?2.0:type==='bath'||type==='kitchen'?1.0:2.0), uv.getY(i)/(type==='bed'?2.0:type==='bath'||type==='kitchen'?1.0:2.0));
    const floor = new THREE.Mesh(fg, floorMat); floor.rotation.x = -Math.PI/2; floor.scale.y = -1; floor.receiveShadow = true; floor.position.y = 0.001; house.add(floor);
    const ceil = new THREE.Mesh(new THREE.ShapeGeometry(shape), M.ceiling); ceil.rotation.x = -Math.PI/2; ceil.scale.y = -1; ceil.position.y = H; ceil.receiveShadow = false; ceil.userData.ceiling = true; house.add(ceil);
    // wall paint per room
    const wallMat = type==='bath' ? M.tile : M.wallPaint(paint[ri%paint.length]);
    const bb = new THREE.Box2(); w.forEach(p => bb.expandByPoint(new THREE.Vector2(p.x,p.z))); const sz = bb.getSize(new THREE.Vector2()); const c = bb.getCenter(new THREE.Vector2());
    // ceiling light
    if (type!=='garage' && sz.x*sz.y>2) { const l=new THREE.PointLight(0xffe4c4, type==='hall'?1.2:1.6, Math.max(sz.x,sz.y)*1.6, 1.8); l.position.set(c.x, H-0.25, c.y); l.castShadow = quality==='full' && ri<4; l.shadow.mapSize.set(512,512); l.shadow.bias=-0.004; house.add(l);
      const lamp=(type==='kitchen'&&sz.x>3.6&&sz.y>3.6)?null:asset('ceiling_lamp', c.x, c.y, 0, {h:0.5, y:H-0.5-0.22*(0.5/0.95)}); if (lamp) { lamp.traverse(o=>{ if(o.isMesh){ o.material=o.material.clone(); o.material.emissive=new THREE.Color(0xfff1d6); o.material.emissiveIntensity=0.55; } }); house.add(lamp); } else house.add(cyl(0.16,0.03,M.white,c.x,H-0.02,c.y)); }
    // walls
    roomSegs[ri].forEach(([a,b]) => {
      const k = edgeKey(a,b); if (built.has(k)) return; built.add(k);
      const interior = edgeCount[k] > 1 && !edgeTypes[k].includes('garage') && type!=='garage'; const toGarage = edgeCount[k] > 1 && edgeTypes[k].includes('garage');
      // which side is "inside this room": normal pointing toward room centre
      buildWall(a,b,interior,wallMat,toGarage?'solid':type);
    });
    // furniture: orient so the "back" (-z in local) faces the room's longest exterior wall; simple heuristic: longest axis
    if (type!=='hall' || sz.x*sz.y>2.5) {
      // sides: 0 = -z (top on plan), 1 = +x, 2 = +z, 3 = -x. Score each: exterior walls (windows) are bad for the furniture back wall.
      const side = { 0:0, 1:0, 2:0, 3:0 };
      roomSegs[ri].forEach(([a,b]) => { const ext = edgeCount[edgeKey(a,b)]===1; const len=Math.hypot(b.x-a.x,b.z-a.z); const mx=(a.x+b.x)/2, mz=(a.z+b.z)/2; let sIdx;
        if (Math.abs(b.z-a.z) < 0.01) sIdx = mz < c.y ? 0 : 2; else sIdx = mx > c.x ? 1 : 3;
        const pen = (ext && len>1.6) ? -10 : (!ext && len>1.3) ? -2 : 1; side[sIdx] += pen * len; });
      const order = [0,2,1,3].sort((p,q)=>side[q]-side[p]); const back = order[0];
      const ang = [0, -Math.PI/2, Math.PI, Math.PI/2][back];   // rotate so local -z faces chosen wall
      const alongX = (back===0||back===2); const rw = alongX ? sz.x : sz.y, rd = alongX ? sz.y : sz.x;
      furnishOrient.set(ri, {back, alongX});
      furnish(house, type, c.x, c.y, rw-0.3, rd-0.3, ang, M, H);
    }
    // skirting + cornice per edge (inside face)
    roomSegs[ri].forEach(([a,b]) => { trimRun(a,b,c,0.06,0.12,M.trim); if (type!=='bath' && type!=='garage') trimRun(a,b,c,H-0.05,0.10,M.trim,true); });
  });

  function trimRun(a,b,centre,y,h,mat,cornice=false) {
    const len = Math.hypot(b.x-a.x,b.z-a.z); const ang = Math.atan2(b.z-a.z,b.x-a.x); const mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
    let nx=-(b.z-a.z)/len, nz=(b.x-a.x)/len; if ((centre.x-mid.x)*nx+(centre.y-mid.z)*nz<0){nx=-nx;nz=-nz;}
    const off = T/2 + (cornice?0.03:0.012);
    const m = box(len-0.02, h, cornice?0.06:0.024, mat, mid.x+nx*off, y, mid.z+nz*off, -ang); house.add(m);
  }
  function buildWall(a,b,interior,mat,type) {
    const len = Math.hypot(b.x-a.x,b.z-a.z); if (len<0.05) return;
    const ang = Math.atan2(b.z-a.z,b.x-a.x); const mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
    const place = (mesh,off,y) => { mesh.position.set(mid.x+Math.cos(ang)*off, y, mid.z+Math.sin(ang)*off); mesh.rotation.y=-ang; house.add(mesh); return mesh; };
    const seg = (off,w,y,h,coll=true) => { const m=box(w,h,T,mat); m.material=mat; place(m,off,y); if(coll) colliders.push({cx:m.position.x,cz:m.position.z,ang,hw:w/2,ht:T/2+0.22}); };
    if (interior && len>1.3) {           // doorway near one end of the wall (like a real house), with architrave + open leaf
      const dw=0.86, dh=2.04; const dc = -len/2 + 0.45 + dw/2;             // door centre offset from wall midpoint
      const leftW = dc - dw/2 + len/2, rightW = len/2 - (dc + dw/2);
      if (leftW>0.02) seg(-len/2+leftW/2, leftW, H/2, H); if (rightW>0.02) seg(len/2-rightW/2, rightW, H/2, H); seg(dc, dw, dh+(H-dh)/2, H-dh, false);
      [-1,1].forEach(s=>{ place(box(0.07,dh+0.04,T+0.03,M.trim),dc+s*(dw/2+0.035),dh/2+0.02); }); place(box(dw+0.14,0.07,T+0.03,M.trim),dc,dh+0.035);
      const leaf = box(dw-0.04,dh-0.02,0.04,M.door); const hinge=new THREE.Group(); hinge.position.set(mid.x+Math.cos(ang)*(dc-dw/2+0.02), dh/2, mid.z+Math.sin(ang)*(dc-dw/2+0.02)); hinge.rotation.y=-ang+1.45; leaf.position.set((dw-0.04)/2,0,0.02); hinge.add(leaf); house.add(hinge);
      const handle=cyl(0.01,0.12,M.brass,(dw-0.04)-0.08,-0.05,0.05,8); handle.rotation.z=Math.PI/2; leaf.add(handle);
      colliders.push({cx:hinge.position.x+Math.cos(-hinge.rotation.y)*(dw/2)*0.5, cz:hinge.position.z+Math.sin(-hinge.rotation.y)*(dw/2)*0.5, ang:-hinge.rotation.y, hw:dw*0.45, ht:0.15});
    } else if (!interior && len>1.6 && type!=='garage' && type!=='solid') {   // window with frame, sill, glazing bars
      const ww = Math.min(1.8, len*0.5), sill = type==='bath'?1.2:0.85, head = Math.min(H-0.25, 2.15), side=(len-ww)/2, gh=head-sill;
      seg(-len/2+side/2, side, H/2, H); seg(len/2-side/2, side, H/2, H); seg(0, ww, sill/2, sill); seg(0, ww, head+(H-head)/2, H-head, false);
      colliders.push({cx:mid.x,cz:mid.z,ang,hw:ww/2,ht:T/2+0.22});
      place(box(ww+0.1,0.06,T+0.08,M.frame),0,sill+0.03); place(box(ww+0.16,0.05,T+0.12,M.frame),0,sill-0.005);
      place(box(ww,gh,0.02,M.glass),0,sill+gh/2);
      { const wl = new THREE.PointLight(0xdfe9ff, 1.0, Math.max(4, len*1.4), 1.6); const nx=-Math.sin(ang), nz=Math.cos(ang); const inside=((centreRef.x-mid.x)*nx+(centreRef.z-mid.z)*nz)>0?1:-1; wl.position.set(mid.x+nx*inside*0.35, sill+gh*0.6, mid.z+nz*inside*0.35); house.add(wl); }
      [-ww/2+0.03, ww/2-0.03].forEach(x=>place(box(0.06,gh,0.09,M.frame),x,sill+gh/2)); place(box(ww,0.06,0.09,M.frame),0,head-0.03);
      place(box(0.05,gh,0.07,M.frame),0,sill+gh/2); place(box(ww,0.045,0.07,M.frame),0,sill+gh*0.55);
    } else if (!interior && len>2.2 && type==='garage') { seg(0,len,H/2,H); }
    else seg(0,len,H/2,H);
  }

  // exterior: ground, paving skirt, hedge, sky dome, roof slab so it reads as a house
  const size = bounds.getSize(new THREE.Vector3());
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80,48), M.grass); ground.rotation.x=-Math.PI/2; ground.position.set(centre.x,-0.02,centre.z); ground.receiveShadow=true; scene.add(ground);
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(size.x+3,size.z+3), M.paving); pave.rotation.x=-Math.PI/2; pave.position.set(centre.x,-0.01,centre.z); pave.receiveShadow=true; scene.add(pave);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(size.x+6, 0.25, size.z+6), M.matte(0x4a4a4a)); roof.position.set(centre.x, H+0.13, centre.z); roof.castShadow=true; roof.userData.ceiling=true; scene.add(roof);

  return { colliders, centre, bounds, orient: rooms.map((_,i)=>furnishOrient.get(i)), roomBounds: roomsW.map(w=>{ const bb=new THREE.Box2(); w.forEach(p=>bb.expandByPoint(new THREE.Vector2(p.x,p.z))); return bb; }), roomCentres: roomsW.map(w=>{ const bb=new THREE.Box2(); w.forEach(p=>bb.expandByPoint(new THREE.Vector2(p.x,p.z))); const c=bb.getCenter(new THREE.Vector2()); return {x:c.x,z:c.y}; }) };
}

/* ───────────────────────── viewer (renderer, lighting, controls) ───────────────────────── */
export function createViewer(canvas, overlay) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.62; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer); let env = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture; let skyTexture = null;
  const hdrReady = new RGBELoader().loadAsync(new URL('../tex/sky.hdr', import.meta.url).href).then(t => { t.mapping = THREE.EquirectangularReflectionMapping; skyTexture = t; env = pmrem.fromEquirectangular(t).texture; }).catch(e => console.warn('hdr failed', e));
  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 300);
  const controls = new PointerLockControls(camera, canvas);
  controls.addEventListener('lock', () => overlay.style.display = 'none'); controls.addEventListener('unlock', () => overlay.style.display = 'flex');
  overlay.onclick = () => controls.lock();
  const keys = {}; addEventListener('keydown', e => keys[e.code]=true); addEventListener('keyup', e => keys[e.code]=false);
  let scene = null, colliders = [], clock = new THREE.Clock(), bob = 0, paused = false, doll = false, builtRef = null;
  function setCeilings(v){ if(!scene) return; scene.traverse(o=>{ if(o.userData.ceiling) o.visible=v; }); }
  // touch: drag to look, on-screen joystick handled by page
  const touch = { look:{dx:0,dy:0}, move:{x:0,y:0} };
  canvas.addEventListener('touchstart', e => { const t=e.touches[0]; touch.lx=t.clientX; touch.ly=t.clientY; }, {passive:true});
  canvas.addEventListener('touchmove', e => { const t=e.touches[0]; camera.rotation.y -= (t.clientX-touch.lx)*0.004; camera.rotation.x = Math.max(-1.2,Math.min(1.2,camera.rotation.x-(t.clientY-touch.ly)*0.004)); touch.lx=t.clientX; touch.ly=t.clientY; }, {passive:true});
  camera.rotation.order = 'YXZ';

  function blocked(x,z,m=0.35){ for (const c of colliders){ const dx=x-c.cx, dz=z-c.cz, cos=Math.cos(c.ang), sin=Math.sin(c.ang); const lx=dx*cos+dz*sin, lz=-dx*sin+dz*cos; if (Math.abs(lx)<c.hw+m && Math.abs(lz)<c.ht+m) return true; } return false; }
  function safeSpot(ri){ const rb=builtRef.roomBounds[ri], rc=builtRef.roomCentres[ri]; const o=builtRef.orient[ri]||{back:0}; const W=rb.max.x-rb.min.x, D=rb.max.y-rb.min.y;
    // back = furnished wall (TV/bed head): 0 = z min, 1 = x max, 2 = z max, 3 = x min.
    // Stand in a FRONT corner (opposite the back wall), 0.7 m off both walls, look at a point 1/3 along the back wall from the far side.
    const inset=0.7;
    const corner = { 0:[rb.min.x+inset, rb.max.y-inset], 1:[rb.min.x+inset, rb.min.y+inset], 2:[rb.max.x-inset, rb.min.y+inset], 3:[rb.max.x-inset, rb.max.y-inset] }[o.back];
    const tgt    = { 0:[rb.min.x+W*0.62, rb.min.y], 1:[rb.max.x, rb.min.y+D*0.62], 2:[rb.max.x-W*0.62, rb.max.y], 3:[rb.min.x, rb.max.y-D*0.62] }[o.back];
    const other = { 0:[rb.max.x-inset, rb.max.y-inset], 1:[rb.max.x-inset, rb.min.y+inset], 2:[rb.min.x+inset, rb.min.y+inset], 3:[rb.min.x+inset, rb.max.y-inset] }[o.back]; const cands=[corner, other]; for (let r=0.4; r<Math.max(W,D); r+=0.4) for (let a=0;a<Math.PI*2;a+=Math.PI/6) cands.push([corner[0]+Math.cos(a)*r, corner[1]+Math.sin(a)*r]);
    for (const [x,z] of cands){ if (x<rb.min.x+0.4||x>rb.max.x-0.4||z<rb.min.y+0.4||z>rb.max.y-0.4) continue; if (!blocked(x,z,0.55)) return {x,z,yaw:Math.atan2(-(tgt[0]-x), -(tgt[1]-z))}; }
    return {x:rc.x,z:rc.z,yaw:0}; }
  function collide(pos){ for (const c of colliders){ const dx=pos.x-c.cx, dz=pos.z-c.cz, cos=Math.cos(c.ang), sin=Math.sin(c.ang); const lx=dx*cos+dz*sin, lz=-dx*sin+dz*cos; if (Math.abs(lx)<c.hw+0.1 && Math.abs(lz)<c.ht){ const push=(c.ht-Math.abs(lz))*Math.sign(lz||1); pos.x+=-push*sin; pos.z+=push*cos; } } }
  function frame(){ requestAnimationFrame(frame); if (!scene || paused) return; const dt=Math.min(clock.getDelta(),0.05);
    const moving = controls.isLocked || touch.move.x || touch.move.y;
    const sp=(keys.ShiftLeft||keys.ShiftRight?3.6:1.7)*dt; const dir=new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize(); const right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0)); const p=camera.position; let mv=false;
    if (controls.isLocked){ if(keys.KeyW||keys.ArrowUp){p.addScaledVector(dir,sp);mv=true;} if(keys.KeyS||keys.ArrowDown){p.addScaledVector(dir,-sp);mv=true;} if(keys.KeyD||keys.ArrowRight){p.addScaledVector(right,sp);mv=true;} if(keys.KeyA||keys.ArrowLeft){p.addScaledVector(right,-sp);mv=true;} }
    if (touch.move.x||touch.move.y){ p.addScaledVector(dir,-touch.move.y*sp); p.addScaledVector(right,touch.move.x*sp); mv=true; }
    if(!doll){ collide(p); bob = mv ? bob+dt*9 : 0; p.y = 1.62 + (mv?Math.sin(bob)*0.018:0); }
    renderer.render(scene, camera); }
  frame();
  function resize(){ const r=canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width,r.height,false); camera.aspect=r.width/r.height; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize);

  return {
    camera, controls, renderer, touch, resize,
    async load(rooms, opts) {
      await preloadAssets(['sofa','armchair','coffee_table','side_table','bed','nightstand','wardrobe','cabinet','dining_table','dining_chair','desk','stool','bookshelf','plant','plant2','plant3','ceiling_lamp','pendant','desk_lamp','picture','picture2','picture3','mirror','vase','vase2','ottoman']);
      await hdrReady; scene = new THREE.Scene(); scene.environment = env; scene.environmentIntensity = 0.4; scene.background = skyTexture || new THREE.Color(0xcfdceb); scene.backgroundBlurriness = 0.02; scene.backgroundIntensity = 1.0;
      const sun = new THREE.DirectionalLight(0xfff1dc, 1.5); sun.position.set(12, 16, 9); sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
      scene.add(new THREE.HemisphereLight(0xdfeaff, 0x8a7f6e, 0.15));
      const built = buildHouse(scene, rooms, opts);
      const b = built.bounds; sun.position.set(built.centre.x+14, 9, built.centre.z+11); sun.target.position.copy(built.centre); scene.add(sun.target); const sc=sun.shadow.camera; const R=Math.max(b.max.x-b.min.x,b.max.z-b.min.z)*0.9+2; sc.left=-R; sc.right=R; sc.top=R; sc.bottom=-R; sc.far=60; scene.add(sun);
      colliders = built.colliders; builtRef = built;
      const si = Math.min(opts.startRoom||0, built.roomCentres.length-1); const rc = built.roomCentres[si], rb = built.roomBounds[si]; const o = built.orient[si] || {back:0};
      const W = rb.max.x-rb.min.x, D = rb.max.y-rb.min.y;
      // stand near the front wall, off to one side, look toward the far (furnished) wall
      const pos = { 0:[rb.min.x+W*0.25, rb.max.y-0.45], 2:[rb.max.x-W*0.25, rb.min.y+0.45], 1:[rb.min.x+0.45, rb.min.y+D*0.25], 3:[rb.max.x-0.45, rb.max.y-D*0.25] }[o.back];
      const tgt = { 0:[rc.x+W*0.1, rb.min.y], 2:[rc.x-W*0.1, rb.max.y], 1:[rb.max.x, rc.z+D*0.1], 3:[rb.min.x, rc.z-D*0.1] }[o.back];
      { const sp=safeSpot(si); camera.position.set(sp.x,1.55,sp.z); camera.rotation.set(-0.04,sp.yaw,0); }
      resize(); return built;
    },
    teleport(c){ doll=false; setCeilings(true); if (typeof c==='number'){ const sp=safeSpot(c); camera.position.set(sp.x,1.62,sp.z); camera.rotation.set(0,sp.yaw,0); return; } camera.position.set(c.x,1.62,c.z); camera.rotation.x=0; },
    dollhouse(on){ doll = on===undefined ? !doll : on; setCeilings(!doll); if(doll){ const b=builtRef.bounds, c=builtRef.centre; const R=Math.max(b.max.x-b.min.x,b.max.z-b.min.z); const h=R*0.75+2; camera.position.set(c.x+R*0.25, h, c.z+R*0.55); camera.lookAt(c.x,0.4,c.z); } return doll; },
    isDollhouse(){ return doll; },
    glideTo(c, ms=900){ let yaw=null; if (typeof c==='number'){ const sp=safeSpot(c); yaw=sp.yaw; c=sp; } const from=camera.position.clone(); const to=new THREE.Vector3(c.x,1.62,c.z); const y0=camera.rotation.y; let dy=yaw===null?0:((yaw-y0+Math.PI*3)%(Math.PI*2))-Math.PI; const t0=performance.now(); doll=false; setCeilings(true); const step=()=>{ const k=Math.min(1,(performance.now()-t0)/ms); const e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2; camera.position.lerpVectors(from,to,e); camera.rotation.y=y0+dy*e; camera.rotation.x*=(1-e*0.1); if(k<1) requestAnimationFrame(step); }; step(); },
    screenshot(q=0.9){ renderer.render(scene,camera); return renderer.domElement.toDataURL('image/jpeg',q); },
    thumb(){ const dpr=renderer.getPixelRatio(), sz=new THREE.Vector2(); renderer.getSize(sz); renderer.setPixelRatio(1); renderer.setSize(264,144,false); camera.aspect=264/144; camera.updateProjectionMatrix(); renderer.render(scene,camera); const d=renderer.domElement.toDataURL('image/jpeg',0.7); renderer.setPixelRatio(dpr); renderer.setSize(sz.x,sz.y,false); camera.aspect=sz.x/sz.y; camera.updateProjectionMatrix(); return d; },
    pause(v){ paused = v; },
  };
}
