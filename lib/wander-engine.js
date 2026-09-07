/* Wander engine — turns traced rooms into a furnished, lit, first-person house.
   All geometry is procedural; textures are generated on canvases so it works offline. */
import * as THREE from './three.module.js';
import { PointerLockControls } from './PointerLockControls.js';
import { RoomEnvironment } from './RoomEnvironment.js';

/* ───────────────────────── procedural textures ───────────────────────── */
const texCache = {};
function canvasTex(key, w, h, draw, repeat=[1,1]) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; texCache[key] = t; return t;
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

/* ───────────────────────── materials ───────────────────────── */
function materials() {
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: plaster(), roughness: .95 }),
    wallPaint: c => new THREE.MeshStandardMaterial({ color: c, map: plaster(), roughness: .95 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xfaf8f4, roughness: 1, side: THREE.DoubleSide }),
    oak: new THREE.MeshStandardMaterial({ map: oakFloor(), roughness: .55, metalness: .02 }),
    tile: new THREE.MeshStandardMaterial({ map: tiles(), roughness: .25 }),
    tileDark: new THREE.MeshStandardMaterial({ map: tiles('#6e7378','#4a4e52'), roughness: .3 }),
    carpet: new THREE.MeshStandardMaterial({ map: carpet(), roughness: 1 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xf7f6f2, roughness: .5 }),
    frame: new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: .5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: .95, transparent: true, opacity: .35, roughness: .02, thickness: .01, ior: 1.5 }),
    door: new THREE.MeshStandardMaterial({ color: 0xeeece6, roughness: .55 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a24b, metalness: 1, roughness: .3 }),
    walnut: new THREE.MeshStandardMaterial({ color: 0x5b3a26, roughness: .55 }),
    lightOak: new THREE.MeshStandardMaterial({ color: 0xcfa878, roughness: .6 }),
    linen: new THREE.MeshStandardMaterial({ map: fabric('#e9e4da'), roughness: 1 }),
    sofa: new THREE.MeshStandardMaterial({ map: fabric('#6f7a86'), roughness: 1 }),
    cushion: new THREE.MeshStandardMaterial({ map: fabric('#c98d5a'), roughness: 1 }),
    duvet: new THREE.MeshStandardMaterial({ map: fabric('#f1eee8'), roughness: 1 }),
    matte: c => new THREE.MeshStandardMaterial({ color: c, roughness: .8 }),
    white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .3 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xdcd8d0, roughness: .35 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xbfc3c7, metalness: .9, roughness: .35 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: .6 }),
    plant: new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: .9 }),
    pot: new THREE.MeshStandardMaterial({ color: 0xb98d6b, roughness: .8 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x7fa86a, roughness: 1 }),
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
  // w,d = room size along its own axes; we place relative to the centre and rotate so "back" faces the longest wall
  const g = new THREE.Group(); g.position.set(cx,0,cz); g.rotation.y = ang0;
  const add = m => { g.add(m); return m; };
  const rug = (rw,rd,col) => { const r=new THREE.Mesh(new THREE.PlaneGeometry(rw,rd), new THREE.MeshStandardMaterial({map:fabric(col),roughness:1})); r.rotation.x=-Math.PI/2; r.position.y=0.012; r.receiveShadow=true; return add(r); };
  const lamp = (x,z) => { add(cyl(0.02,1.4,M.black,x,0.7,z,8)); add(cyl(0.16,0.005,M.black,x,0.02,z)); const sh=cyl(0.17,0.24,new THREE.MeshStandardMaterial({color:0xf3e9d6,emissive:0xffd9a0,emissiveIntensity:.45,side:THREE.DoubleSide}),x,1.5,z); add(sh); const l=new THREE.PointLight(0xffd6a3,6,5,2); l.position.set(x,1.45,z); add(l); };
  const plant = (x,z,s=1) => { add(cyl(0.16*s,0.32*s,M.pot,x,0.16*s,z)); for(let i=0;i<7;i++){ const leaf=new THREE.Mesh(new THREE.SphereGeometry(0.16*s,8,6),M.plant); leaf.scale.set(1,0.35,1.6); leaf.position.set(x+Math.cos(i*0.9)*0.14*s,0.45*s+i*0.05*s,z+Math.sin(i*0.9)*0.14*s); leaf.rotation.y=i*0.9; leaf.rotation.z=0.5; leaf.castShadow=true; add(leaf);} };
  const frame = (x,y,z,ry,w2=0.6,h2=0.8) => { const f=box(w2,h2,0.03,M.black,x,y,z,ry); add(f); const p=box(w2-0.08,h2-0.08,0.01,M.matte([0x9fb4c4,0xd8b28a,0x8e9a7a][Math.floor(rnd()*3)]),0,0,0.02); f.add(p); };
  const half = Math.min(w,d)/2;
  if (type==='living') {
    rug(Math.min(w,3.2),Math.min(d,2.2),'#c9c1b3');
    const sofa = add(rounded(2.1,0.42,0.9,0.08,M.sofa)); sofa.position.set(0,0,d/2-0.7);
    add(rounded(2.1,0.5,0.22,0.06,M.sofa)).position.set(0,0.42,d/2-0.36);
    [-0.7,0,0.7].forEach(x=>{ add(rounded(0.62,0.16,0.62,0.05,M.linen)).position.set(x,0.42,d/2-0.76); });
    [-0.6,0.55].forEach((x,i)=>{ const c=add(rounded(0.42,0.12,0.42,0.06,i?M.cushion:M.linen)); c.position.set(x,0.58,d/2-0.56); c.rotation.y=(i?-1:1)*0.2; c.rotation.x=-0.25; });
    const ct = add(rounded(1.1,0.04,0.55,0.15,M.walnut)); ct.position.set(0,0.4,d/2-1.9); [[-0.45,-0.2],[0.45,-0.2],[-0.45,0.2],[0.45,0.2]].forEach(([x,z])=>add(cyl(0.02,0.4,M.black,x,0.2,d/2-1.9+z,8)));
    add(box(0.28,0.02,0.2,M.matte(0xd9534f),-0.2,0.45,d/2-1.9)); add(box(0.22,0.02,0.16,M.matte(0x3a5f8a),-0.18,0.47,d/2-1.88)); add(cyl(0.05,0.1,M.white,0.3,0.49,d/2-1.85));
    // media unit + tv on opposite wall
    add(box(1.6,0.45,0.4,M.lightOak,0,0.225,-d/2+0.3)); add(box(1.25,0.72,0.04,M.black,0,0.95,-d/2+0.12)); add(box(1.2,0.66,0.01,new THREE.MeshStandardMaterial({color:0x111318,roughness:.1,metalness:.6}),0,0.95,-d/2+0.145));
    lamp(w/2-0.45,d/2-0.5); plant(-w/2+0.45,d/2-0.5,1.1);
    if (w>4.4) { const bk=add(box(0.9,2.1,0.3,M.lightOak,-w/2+0.16,1.05,-d/2+0.9,Math.PI/2)); for(let i=0;i<5;i++){ const shelf=box(0.86,0.02,0.28,M.lightOak,0,-0.9+i*0.42,0); bk.add(shelf); for(let k=0;k<6;k++) shelf.add(box(0.04+rnd()*0.03,0.2+rnd()*0.1,0.2,M.matte([0xb33,0x357,0x795,0xdb8,0x444][k%5]),-0.36+k*0.12,0.12,0)); } }
    frame(1.1,1.5,-d/2+0.16,0); 
  } else if (type==='bed') {
    if (w*d>7) rug(Math.min(w,2.6),Math.min(d,1.8),'#bdb2a3');
    const bw = w*d>9 ? 1.5 : 1.35;
    add(box(bw+0.1,0.28,2.05,M.lightOak,0,0.14,-d/2+1.15)); add(box(bw,0.24,2,M.white,0,0.38,-d/2+1.15));
    const dv=add(rounded(bw+0.04,0.16,1.55,0.06,M.duvet)); dv.position.set(0,0.5,-d/2+1.5);
    [-0.35,0.35].forEach(x=>{ const p=add(rounded(0.55,0.14,0.36,0.06,M.linen)); p.position.set(x*(bw/1.4),0.5,-d/2+0.42); p.rotation.x=-0.15; });
    add(box(bw+0.1,0.9,0.06,M.linen,0,0.6,-d/2+0.1));
    [-1,1].forEach(s=>{ add(box(0.45,0.5,0.4,M.walnut,s*(bw/2+0.3),0.25,-d/2+0.35)); add(cyl(0.11,0.2,new THREE.MeshStandardMaterial({color:0xf5eedf,emissive:0xffd9a0,emissiveIntensity:.5}),s*(bw/2+0.3),0.62,-d/2+0.35)); const l=new THREE.PointLight(0xffd6a3,3,3.5,2); l.position.set(s*(bw/2+0.3),0.62,-d/2+0.35); add(l); });
    if (w>3) add(box(1.2,2.2,0.6,M.white,w/2-0.32,1.1,d/2-0.7,Math.PI/2));
    plant(-w/2+0.4,d/2-0.4,0.9); frame(0,1.7,-d/2+0.04,0,1.0,0.5);
  } else if (type==='kitchen') {
    const runLen = Math.min(w-0.4,4.2), base=add(box(runLen,0.86,0.6,M.matte(0x30363b),0,0.43,-d/2+0.32)); add(box(runLen+0.04,0.04,0.64,M.stone,0,0.88,-d/2+0.32)); add(box(runLen,0.7,0.35,M.matte(0x30363b),0,1.75,-d/2+0.18));
    for(let x=-runLen/2+0.3;x<runLen/2;x+=0.6){ add(box(0.5,0.02,0.02,M.brass,x,0.7,-d/2+0.62)); add(box(0.5,0.02,0.02,M.brass,x,1.45,-d/2+0.36)); }
    add(box(0.6,0.02,0.45,M.steel,-runLen/4,0.905,-d/2+0.32)); add(box(0.5,0.16,0.35,M.matte(0x2a2a2a),-runLen/4,0.99,-d/2+0.32));
    add(cyl(0.015,0.32,M.brass,runLen/4,1.06,-d/2+0.16,10)); add(box(0.2,0.015,0.015,M.brass,runLen/4+0.1,1.2,-d/2+0.16)); add(box(0.55,0.4,0.05,M.steel,runLen/4,0.7,-d/2+0.6));
    add(box(0.6,0.6,0.5,M.matte(0x1e1e1e),runLen/2-0.35,0.5,-d/2+0.32)); // oven cavity
    if (w>3.4 && d>3.4) { add(box(1.8,0.9,0.9,M.matte(0xe8e4dc),0,0.45,0.2)); add(box(1.88,0.04,0.98,M.stone,0,0.92,0.2)); [-0.5,0.5].forEach(x=>{ add(cyl(0.18,0.03,M.walnut,x,0.66,0.85)); add(cyl(0.015,0.66,M.black,x,0.33,0.85,8)); }); [-0.5,0.5].forEach(x=>{ const l=new THREE.PointLight(0xffe0b0,4,4,2); l.position.set(x,H-0.7,0.2); add(l); add(cyl(0.12,0.16,M.black,x,H-0.6,0.2)); add(cyl(0.004,H-1.3,M.black,x,H-0.1-(H-1.3)/2+0.1,0.2,6)); }); add(box(0.32,0.2,0.22,M.matte(0xd9d3c7),0.3,1.04,0.2)); add(cyl(0.08,0.24,M.plant,-0.4,1.06,0.25)); }
    else if (d>2.8) { add(cyl(0.45,0.03,M.walnut,0,0.74,0.6)); add(cyl(0.03,0.72,M.black,0,0.37,0.6)); [0,1,2,3].forEach(i=>{ const a=i*Math.PI/2+0.4; add(box(0.4,0.42,0.4,M.matte(0xe3dcd0),Math.cos(a)*0.75,0.22,0.6+Math.sin(a)*0.75,-a)); }); }
    plant(w/2-0.35,d/2-0.35,0.9);
  } else if (type==='bath') {
    const big = w*d>4.5;
    if (big) { add(box(1.7,0.55,0.75,M.white,-w/2+0.9,0.275,-d/2+0.4)); add(box(1.5,0.02,0.55,M.matte(0xc9dfe8),-w/2+0.9,0.55,-d/2+0.4)); add(cyl(0.015,0.2,M.steel,-w/2+0.35,0.66,-d/2+0.4,8)); }
    else { add(box(0.9,0.05,0.9,M.white,-w/2+0.5,0.025,-d/2+0.5)); add(box(0.02,2.0,0.9,M.glass,-w/2+0.95,1.0,-d/2+0.5)); add(cyl(0.02,1.1,M.steel,-w/2+0.5,1.6,-d/2+0.1,8)); add(cyl(0.12,0.02,M.steel,-w/2+0.5,2.15,-d/2+0.3)); }
    add(box(0.6,0.4,0.42,M.white,w/2-0.4,0.4,d/2-0.35)); add(box(0.4,0.32,0.36,M.white,w/2-0.4,0.16,d/2-0.35)); add(box(0.38,0.5,0.14,M.white,w/2-0.4,0.6,d/2-0.1));
    add(box(0.6,0.75,0.45,M.lightOak,w/2-0.5,0.375,-d/2+0.3)); add(box(0.62,0.05,0.47,M.stone,w/2-0.5,0.78,-d/2+0.3)); add(cyl(0.18,0.1,M.white,w/2-0.5,0.85,-d/2+0.3)); add(cyl(0.012,0.25,M.brass,w/2-0.5,0.98,-d/2+0.08,8));
    add(box(0.55,0.7,0.02,new THREE.MeshStandardMaterial({color:0xffffff,metalness:1,roughness:0.02}),w/2-0.5,1.5,-d/2+0.02));
    add(cyl(0.02,0.6,M.brass,-w/2+0.05,1.2,d/2-0.4,8)); add(box(0.04,0.55,0.35,M.linen,-w/2+0.08,0.9,d/2-0.4));
  } else if (type==='study') {
    add(box(1.4,0.03,0.7,M.walnut,0,0.74,-d/2+0.45)); [[-0.65,-0.3],[0.65,-0.3],[-0.65,0.3],[0.65,0.3]].forEach(([x,z])=>add(box(0.04,0.72,0.04,M.black,x,0.36,-d/2+0.45+z)));
    add(box(0.6,0.36,0.02,M.black,0,1.0,-d/2+0.3)); add(box(0.58,0.34,0.005,new THREE.MeshStandardMaterial({color:0x1b3a5c,emissive:0x1b3a5c,emissiveIntensity:.6}),0,1.0,-d/2+0.315)); add(cyl(0.02,0.2,M.black,0,0.85,-d/2+0.3,8)); add(cyl(0.1,0.01,M.black,0,0.76,-d/2+0.3));
    add(box(0.42,0.04,0.14,M.white,0,0.77,-d/2+0.7)); add(cyl(0.24,0.05,M.black,0,0.45,-d/2+1.1)); add(cyl(0.03,0.4,M.black,0,0.25,-d/2+1.1,8)); add(box(0.44,0.44,0.08,M.matte(0x3d3d3d),0,0.75,-d/2+1.3));
    lamp(w/2-0.4,d/2-0.4); plant(-w/2+0.4,d/2-0.4,1.0); if (w>2.4) { const bk=add(box(0.8,1.9,0.3,M.lightOak,-w/2+0.16,0.95,0.3,Math.PI/2)); for(let i=0;i<4;i++){ const shelf=box(0.76,0.02,0.28,M.lightOak,0,-0.8+i*0.5,0); bk.add(shelf); for(let k=0;k<5;k++) shelf.add(box(0.05,0.22+rnd()*0.08,0.2,M.matte([0x8a5,0x458,0xb54,0x666][k%4]),-0.3+k*0.13,0.13,0)); } }
  } else if (type==='garden') {
    rug(Math.min(w,2.2),Math.min(d,1.6),'#cfc6b6'); [-0.55,0.55].forEach(x=>{ add(rounded(0.8,0.4,0.8,0.1,M.matte(0x9b8c76))).position.set(x,0,0.2); add(rounded(0.8,0.5,0.2,0.06,M.matte(0x9b8c76))).position.set(x,0.4,0.5); add(rounded(0.7,0.14,0.62,0.05,M.linen)).position.set(x,0.4,0.15); });
    add(cyl(0.3,0.03,M.walnut,0,0.45,-0.7)); add(cyl(0.03,0.43,M.black,0,0.22,-0.7,8)); plant(w/2-0.4,d/2-0.4,1.3); plant(-w/2+0.4,-d/2+0.4,1.0);
  } else if (type==='hall') {
    if (w*d>3) { add(box(0.9,0.85,0.35,M.lightOak,0,0.425,-d/2+0.2)); add(cyl(0.06,0.3,M.plant,0.25,1.0,-d/2+0.2)); add(box(0.06,0.06,0.06,M.brass,-0.2,0.9,-d/2+0.2)); frame(0,1.6,-d/2+0.04,0,0.5,0.7); }
    if (Math.max(w,d)>2.2) { add(cyl(0.02,1.7,M.black,w/2-0.25,0.85,d/2-0.25,8)); for(let i=0;i<3;i++) add(box(0.3,0.02,0.02,M.black,w/2-0.25,1.7,d/2-0.25,i*2.1)); add(box(0.4,0.02,0.4,M.black,w/2-0.25,0.01,d/2-0.25)); }
    if (type==='hall' && Math.min(w,d)<1.2) {} 
  } else if (type==='garage') {
    add(box(1.8,0.5,4.2,M.matte(0x8a2f2f),0,0.5,0)); add(box(1.7,0.6,2.2,M.matte(0x8a2f2f),0,1.0,-0.2)); [[-0.8,1.4],[0.8,1.4],[-0.8,-1.4],[0.8,-1.4]].forEach(([x,z])=>{ const wh=cyl(0.32,0.22,M.black,x,0.32,z); wh.rotation.z=Math.PI/2; add(wh); });
    add(box(1.0,1.8,0.4,M.steel,-w/2+0.5,0.9,-d/2+0.25));
  }
  group.add(g);
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
  const centre = bounds.getCenter(new THREE.Vector3());
  const paint = ['#ece7de','#e6e2d6','#dfe3dc','#e9e1d4','#e2e6ea','#efe9df'];

  rooms.forEach((room, ri) => {
    const w = roomsW[ri], type = roomType(room.name);
    const shape = new THREE.Shape(w.map(p => new THREE.Vector2(p.x, p.z)));
    const floorMat = type==='bath' ? M.tile : type==='kitchen' ? M.tileDark : type==='bed' ? M.carpet : type==='garage' ? M.paving : M.oak;
    const fg = new THREE.ShapeGeometry(shape); // uv in metres → scale
    const uv = fg.attributes.uv; for (let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)/ (type==='bed'?1.5:type==='bath'||type==='kitchen'?1.2:2.4), uv.getY(i)/(type==='bed'?1.5:type==='bath'||type==='kitchen'?1.2:2.4));
    const floor = new THREE.Mesh(fg, floorMat); floor.rotation.x = Math.PI/2; floor.receiveShadow = true; floor.position.y = 0.001; house.add(floor);
    const ceil = new THREE.Mesh(new THREE.ShapeGeometry(shape), M.ceiling); ceil.rotation.x = Math.PI/2; ceil.position.y = H; house.add(ceil);
    // wall paint per room
    const wallMat = type==='bath' ? M.tile : M.wallPaint(paint[ri%paint.length]);
    const bb = new THREE.Box2(); w.forEach(p => bb.expandByPoint(new THREE.Vector2(p.x,p.z))); const sz = bb.getSize(new THREE.Vector2()); const c = bb.getCenter(new THREE.Vector2());
    // ceiling light
    if (type!=='garage' && sz.x*sz.y>2) { const l=new THREE.PointLight(0xffe4c4, type==='hall'?2.5:5, Math.max(sz.x,sz.y)*1.6, 1.8); l.position.set(c.x, H-0.25, c.y); l.castShadow = quality==='full' && ri<4; l.shadow.mapSize.set(512,512); l.shadow.bias=-0.004; house.add(l);
      house.add(cyl(0.16,0.03,M.white,c.x,H-0.02,c.y)); const bulb=cyl(0.09,0.12,new THREE.MeshStandardMaterial({color:0xfff6e6,emissive:0xffe9c8,emissiveIntensity:1.2}),c.x,H-0.09,c.y); house.add(bulb); }
    // walls
    roomSegs[ri].forEach(([a,b]) => {
      const k = edgeKey(a,b); if (built.has(k)) return; built.add(k);
      const interior = edgeCount[k] > 1 && !edgeTypes[k].includes('garage');
      // which side is "inside this room": normal pointing toward room centre
      buildWall(a,b,interior,wallMat,type);
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
    } else if (!interior && len>1.6 && type!=='garage') {   // window with frame, sill, glazing bars
      const ww = Math.min(1.8, len*0.5), sill = type==='bath'?1.2:0.85, head = Math.min(H-0.25, 2.15), side=(len-ww)/2, gh=head-sill;
      seg(-len/2+side/2, side, H/2, H); seg(len/2-side/2, side, H/2, H); seg(0, ww, sill/2, sill); seg(0, ww, head+(H-head)/2, H-head, false);
      colliders.push({cx:mid.x,cz:mid.z,ang,hw:ww/2,ht:T/2+0.22});
      place(box(ww+0.1,0.06,T+0.08,M.frame),0,sill+0.03); place(box(ww+0.16,0.05,T+0.12,M.frame),0,sill-0.005);
      place(box(ww,gh,0.02,M.glass),0,sill+gh/2);
      [-ww/2+0.03, ww/2-0.03].forEach(x=>place(box(0.06,gh,0.09,M.frame),x,sill+gh/2)); place(box(ww,0.06,0.09,M.frame),0,head-0.03);
      place(box(0.05,gh,0.07,M.frame),0,sill+gh/2); place(box(ww,0.045,0.07,M.frame),0,sill+gh*0.55);
    } else if (!interior && len>2.2 && type==='garage') { seg(0,len,H/2,H); }
    else seg(0,len,H/2,H);
  }

  // exterior: ground, paving skirt, hedge, sky dome, roof slab so it reads as a house
  const size = bounds.getSize(new THREE.Vector3());
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80,48), M.grass); ground.rotation.x=-Math.PI/2; ground.position.set(centre.x,-0.02,centre.z); ground.receiveShadow=true; scene.add(ground);
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(size.x+3,size.z+3), M.paving); pave.rotation.x=-Math.PI/2; pave.position.set(centre.x,-0.01,centre.z); pave.receiveShadow=true; scene.add(pave);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(size.x+0.6, 0.25, size.z+0.6), M.matte(0x4a4a4a)); roof.position.set(centre.x, H+0.13, centre.z); roof.castShadow=true; scene.add(roof);
  for (let i=0;i<(quality==='lite'?12:26);i++){ const a=i/26*Math.PI*2, r=Math.max(size.x,size.z)*0.9+5+rnd()*3; const tr=new THREE.Group(); tr.position.set(centre.x+Math.cos(a)*r,0,centre.z+Math.sin(a)*r); tr.add(cyl(0.18,2.2,M.walnut,0,1.1,0,8)); const cr=new THREE.Mesh(new THREE.SphereGeometry(1.6+rnd()*1.2,10,8),M.matte(0x5c8f4c)); cr.position.y=3.2+rnd(); cr.castShadow=true; tr.add(cr); scene.add(tr); }
  const sky = new THREE.Mesh(new THREE.SphereGeometry(120,32,16), new THREE.MeshBasicMaterial({map:skyTex(), side:THREE.BackSide})); sky.position.copy(centre); scene.add(sky);

  return { colliders, centre, bounds, orient: rooms.map((_,i)=>furnishOrient.get(i)), roomBounds: roomsW.map(w=>{ const bb=new THREE.Box2(); w.forEach(p=>bb.expandByPoint(new THREE.Vector2(p.x,p.z))); return bb; }), roomCentres: roomsW.map(w=>{ const bb=new THREE.Box2(); w.forEach(p=>bb.expandByPoint(new THREE.Vector2(p.x,p.z))); const c=bb.getCenter(new THREE.Vector2()); return {x:c.x,z:c.y}; }) };
}

/* ───────────────────────── viewer (renderer, lighting, controls) ───────────────────────── */
export function createViewer(canvas, overlay) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.8; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer); const env = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture; 
  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 300);
  const controls = new PointerLockControls(camera, canvas);
  controls.addEventListener('lock', () => overlay.style.display = 'none'); controls.addEventListener('unlock', () => overlay.style.display = 'flex');
  overlay.onclick = () => controls.lock();
  const keys = {}; addEventListener('keydown', e => keys[e.code]=true); addEventListener('keyup', e => keys[e.code]=false);
  let scene = null, colliders = [], clock = new THREE.Clock(), bob = 0;
  // touch: drag to look, on-screen joystick handled by page
  const touch = { look:{dx:0,dy:0}, move:{x:0,y:0} };
  canvas.addEventListener('touchstart', e => { const t=e.touches[0]; touch.lx=t.clientX; touch.ly=t.clientY; }, {passive:true});
  canvas.addEventListener('touchmove', e => { const t=e.touches[0]; camera.rotation.y -= (t.clientX-touch.lx)*0.004; camera.rotation.x = Math.max(-1.2,Math.min(1.2,camera.rotation.x-(t.clientY-touch.ly)*0.004)); touch.lx=t.clientX; touch.ly=t.clientY; }, {passive:true});
  camera.rotation.order = 'YXZ';

  function collide(pos){ for (const c of colliders){ const dx=pos.x-c.cx, dz=pos.z-c.cz, cos=Math.cos(c.ang), sin=Math.sin(c.ang); const lx=dx*cos+dz*sin, lz=-dx*sin+dz*cos; if (Math.abs(lx)<c.hw+0.1 && Math.abs(lz)<c.ht){ const push=(c.ht-Math.abs(lz))*Math.sign(lz||1); pos.x+=-push*sin; pos.z+=push*cos; } } }
  function frame(){ requestAnimationFrame(frame); if (!scene) return; const dt=Math.min(clock.getDelta(),0.05);
    const moving = controls.isLocked || touch.move.x || touch.move.y;
    const sp=(keys.ShiftLeft||keys.ShiftRight?3.6:1.7)*dt; const dir=new THREE.Vector3(); camera.getWorldDirection(dir); dir.y=0; dir.normalize(); const right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0)); const p=camera.position; let mv=false;
    if (controls.isLocked){ if(keys.KeyW||keys.ArrowUp){p.addScaledVector(dir,sp);mv=true;} if(keys.KeyS||keys.ArrowDown){p.addScaledVector(dir,-sp);mv=true;} if(keys.KeyD||keys.ArrowRight){p.addScaledVector(right,sp);mv=true;} if(keys.KeyA||keys.ArrowLeft){p.addScaledVector(right,-sp);mv=true;} }
    if (touch.move.x||touch.move.y){ p.addScaledVector(dir,-touch.move.y*sp); p.addScaledVector(right,touch.move.x*sp); mv=true; }
    collide(p); bob = mv ? bob+dt*9 : 0; p.y = 1.62 + (mv?Math.sin(bob)*0.018:0);
    renderer.render(scene, camera); }
  frame();
  function resize(){ const r=canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width,r.height,false); camera.aspect=r.width/r.height; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize);

  return {
    camera, controls, renderer, touch, resize,
    load(rooms, opts) {
      scene = new THREE.Scene(); scene.environment = env; scene.environmentIntensity = 0.35; scene.background = new THREE.Color(0xcfdceb); scene.fog = new THREE.Fog(0xcfdceb, 30, 110);
      const sun = new THREE.DirectionalLight(0xfff2df, 1.8); sun.position.set(12, 16, 9); sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
      scene.add(new THREE.HemisphereLight(0xdfeaff, 0x9a8f7a, 0.3));
      const built = buildHouse(scene, rooms, opts);
      const b = built.bounds; sun.position.set(built.centre.x+10, 16, built.centre.z+8); sun.target.position.copy(built.centre); scene.add(sun.target); const sc=sun.shadow.camera; const R=Math.max(b.max.x-b.min.x,b.max.z-b.min.z)*0.9+2; sc.left=-R; sc.right=R; sc.top=R; sc.bottom=-R; sc.far=60; scene.add(sun);
      colliders = built.colliders;
      const rc = built.roomCentres[0], rb = built.roomBounds[0]; const o = built.orient[0] || {back:0};
      const pos = { 0:[rc.x+0.3, rb.max.y-0.7], 2:[rc.x+0.3, rb.min.y+0.7], 1:[rb.min.x+0.7, rc.z+0.3], 3:[rb.max.x-0.7, rc.z+0.3] }[o.back];
      const tgt = { 0:[rc.x, rb.min.y], 2:[rc.x, rb.max.y], 1:[rb.max.x, rc.z], 3:[rb.min.x, rc.z] }[o.back];
      camera.position.set(pos[0], 1.62, pos[1]); camera.rotation.set(0, Math.atan2(-(tgt[0]-pos[0]), -(tgt[1]-pos[1])), 0);
      resize(); return built;
    },
    teleport(c){ camera.position.set(c.x,1.62,c.z); },
    screenshot(){ renderer.render(scene,camera); return renderer.domElement.toDataURL('image/jpeg',0.9); },
  };
}
