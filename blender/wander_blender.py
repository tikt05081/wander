"""
Wander → Blender  (Premium tier)
================================
Builds a photoreal, path-traced version of a Wander project inside Blender:
walls with openings, floors per room type, real PBR materials, Poly Haven
furniture, sun + HDRI-style sky, one camera per room, and a 30-second tour.

USAGE (Terminal on your Mac, Blender 4.x installed):

  /Applications/Blender.app/Contents/MacOS/Blender --background --python blender/wander_blender.py -- \
      --project projects/perth-road-flat.json --out renders/perth-road-flat --stills

  Options
    --project PATH        Wander project JSON (from Studio → Save project, or projects/*.json)
    --out DIR             where renders go
    --stills              render one 1920x1080 still per room (Cycles, denoised)
    --tour                render the 30 s camera tour as PNG frames + MP4 (slow: ~900 frames)
    --samples N           Cycles samples (default 128; 32 for quick previews)
    --preview             just save the .blend and quit — open it in Blender to look around

You can also open Blender normally, go to Scripting, paste this file and press Run —
it will build the house in the open scene (using DEFAULTS below).
"""
import bpy, bmesh, json, math, os, sys, random
from mathutils import Vector

# ------------------------------------------------------------------ args
DEFAULTS = dict(project="projects/perth-road-flat.json", out="renders/out", samples=128)
argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
def arg(name, default=None, flag=False):
    if flag: return f"--{name}" in argv
    return argv[argv.index(f"--{name}")+1] if f"--{name}" in argv else default
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = os.path.join(ROOT, arg("project", DEFAULTS["project"]))
OUT = os.path.join(ROOT, arg("out", DEFAULTS["out"]))
SAMPLES = int(arg("samples", DEFAULTS["samples"]))
os.makedirs(OUT, exist_ok=True)
random.seed(7)

# ------------------------------------------------------------------ load project
P = json.load(open(PROJECT))
H = float(P.get("wallH", 2.6))
iw, ih = P.get("iw"), P.get("ih")
if not iw:   # derive image size from the plan PNG
    img = bpy.data.images.load(os.path.join(ROOT, P["planUrl"]))
    iw, ih = img.size
mpp = float(P["scale"]) / iw             # metres per plan pixel
def toW(p): return (p["x"]*iw*mpp, -p["y"]*ih*mpp)    # Blender: X right, Y *up the plan*, Z vertical
rooms = [dict(name=r["name"], pts=[toW(p) for p in r["pts"]]) for r in P["rooms"]]

def room_type(name):
    n = name.lower()
    if any(k in n for k in ("bath","wc","shower","ensuite","en-suite","cloak")): return "bath"
    if any(k in n for k in ("kitchen","diner","dining")): return "kitchen"
    if any(k in n for k in ("bed","box room","nursery")): return "bed"
    if any(k in n for k in ("hall","landing","porch","lobby","store","cupboard","utility","boot")): return "hall"
    if "garage" in n: return "garage"
    if any(k in n for k in ("study","office")): return "study"
    if any(k in n for k in ("conserv","garden room","sun")): return "garden"
    return "living"

# ------------------------------------------------------------------ scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.device = "GPU"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"      # Apple Silicon / AMD on Mac
    for d in prefs.devices: d.use = True
except Exception: pass
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.film_transparent = False

def coll(name):
    c = bpy.data.collections.new(name); scene.collection.children.link(c); return c
C_ARCH, C_FURN, C_LIGHT = coll("Architecture"), coll("Furniture"), coll("Lights")

# ------------------------------------------------------------------ materials
def mat(name, base=(0.8,0.8,0.8,1), rough=0.6, metal=0.0, emit=None, tex=None, scale=1.0, transmission=0.0, ior=1.45):
    if name in bpy.data.materials: return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = base
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["IOR"].default_value = ior
    if "Transmission Weight" in bsdf.inputs: bsdf.inputs["Transmission Weight"].default_value = transmission
    if emit:
        bsdf.inputs["Emission Color"].default_value = emit
        bsdf.inputs["Emission Strength"].default_value = 8.0
    if tex:   # procedural texture via noise → colour ramp for subtle variation
        tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (scale,)*3
        nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 6; nz.inputs["Detail"].default_value = 6
        ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = tex[0]; ramp.color_ramp.elements[1].color = tex[1]
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
        nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        if tex == "wood":
            pass
    return m

def wood_material(name, light=(0.62,0.42,0.25,1), dark=(0.40,0.25,0.13,1), scale=1.0):
    if name in bpy.data.materials: return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (scale, scale*12, scale)
    wave = nt.nodes.new("ShaderNodeTexWave"); wave.inputs["Scale"].default_value = 2.0; wave.inputs["Distortion"].default_value = 6; wave.inputs["Detail"].default_value = 3
    brick = nt.nodes.new("ShaderNodeTexBrick"); brick.inputs["Scale"].default_value = 1.0; brick.inputs["Mortar Size"].default_value = 0.004; brick.inputs["Color1"].default_value = (1,1,1,1); brick.inputs["Color2"].default_value = (0.85,0.85,0.85,1); brick.inputs["Mortar"].default_value = (0.2,0.15,0.1,1)
    brick.offset = 0.5; brick.inputs["Brick Width"].default_value = 1.2; brick.inputs["Row Height"].default_value = 0.14
    mp2 = nt.nodes.new("ShaderNodeMapping"); mp2.inputs["Scale"].default_value = (1,1,1)
    ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = dark; ramp.color_ramp.elements[1].color = light
    mix = nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type = "MULTIPLY"; mix.inputs["Fac"].default_value = 1.0
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], wave.inputs["Vector"])
    nt.links.new(tc.outputs["Object"], mp2.inputs["Vector"]); nt.links.new(mp2.outputs["Vector"], brick.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], mix.inputs[1]); nt.links.new(brick.outputs["Color"], mix.inputs[2])
    nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"]); bsdf.inputs["Roughness"].default_value = 0.35
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.15; nt.links.new(wave.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m

M = dict(
    plaster = mat("Plaster", (0.86,0.84,0.79,1), 0.9, tex=((0.84,0.82,0.77,1),(0.90,0.88,0.84,1)), scale=3),
    ceiling = mat("Ceiling", (0.95,0.94,0.92,1), 0.95),
    oak     = wood_material("OakFloor", scale=0.8),
    walnut  = wood_material("Walnut", (0.36,0.22,0.12,1), (0.20,0.11,0.05,1), scale=2),
    tile    = mat("Tile", (0.88,0.89,0.9,1), 0.15, tex=((0.84,0.86,0.88,1),(0.92,0.93,0.94,1)), scale=4),
    tileDark= mat("TileDark", (0.42,0.44,0.46,1), 0.2),
    carpet  = mat("Carpet", (0.62,0.6,0.56,1), 1.0, tex=((0.55,0.53,0.5,1),(0.68,0.66,0.62,1)), scale=40),
    trim    = mat("Trim", (0.96,0.95,0.93,1), 0.35),
    glass   = mat("Glass", (1,1,1,1), 0.0, transmission=1.0, ior=1.5),
    door    = mat("Door", (0.92,0.91,0.88,1), 0.4),
    brass   = mat("Brass", (0.83,0.66,0.32,1), 0.25, metal=1.0),
    steel   = mat("Steel", (0.75,0.76,0.78,1), 0.3, metal=1.0),
    black   = mat("Black", (0.05,0.05,0.05,1), 0.5),
    stone   = mat("Stone", (0.86,0.84,0.8,1), 0.3, tex=((0.8,0.78,0.74,1),(0.9,0.88,0.85,1)), scale=6),
    kitchen = mat("KitchenUnit", (0.16,0.18,0.2,1), 0.35),
    white   = mat("White", (0.95,0.95,0.95,1), 0.3),
    linen   = mat("Linen", (0.9,0.88,0.83,1), 1.0),
    sofa    = mat("SofaFabric", (0.36,0.4,0.46,1), 1.0),
    bulb    = mat("Bulb", (1,1,1,1), 0.5, emit=(1.0,0.85,0.65,1)),
    grass   = mat("Grass", (0.33,0.5,0.25,1), 1.0),
    paving  = mat("Paving", (0.6,0.58,0.54,1), 0.9),
    roof    = mat("Roof", (0.25,0.25,0.26,1), 0.8),
    screen  = mat("Screen", (0.02,0.02,0.03,1), 0.1, metal=0.5),
)

# ------------------------------------------------------------------ geometry helpers
def new_obj(name, mesh, collection, material=None):
    o = bpy.data.objects.new(name, mesh); collection.objects.link(o)
    if material: o.data.materials.append(material)
    return o

def box(name, size, loc, rot_z=0.0, material=None, collection=C_ARCH):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x*size[0], v.co.y*size[1], v.co.z*size[2]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = new_obj(name, me, collection, material); o.location = loc; o.rotation_euler = (0,0,rot_z); return o

def polygon(name, pts, z, material, flip=False):
    bm = bmesh.new(); verts = [bm.verts.new((x,y,z)) for x,y in pts]
    f = bm.faces.new(verts)
    if flip: f.normal_flip()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return new_obj(name, me, C_ARCH, material)

def point_light(loc, power=40, color=(1,0.9,0.78), radius=0.1):
    l = bpy.data.lights.new("Lamp", "POINT"); l.energy = power; l.color = color; l.shadow_soft_size = radius
    o = bpy.data.objects.new("Lamp", l); o.location = loc; C_LIGHT.objects.link(o); return o

# ------------------------------------------------------------------ walls
T = 0.14
def key(a,b):
    k1, k2 = f"{a[0]:.2f},{a[1]:.2f}", f"{b[0]:.2f},{b[1]:.2f}"
    return k1+"|"+k2 if k1 < k2 else k2+"|"+k1
all_pts = [p for r in rooms for p in r["pts"]]
def split_edge(a, b):
    L = math.hypot(b[0]-a[0], b[1]-a[1]); ux, uy = (b[0]-a[0])/L, (b[1]-a[1])/L; ts = []
    for p in all_pts:
        t = (p[0]-a[0])*ux + (p[1]-a[1])*uy
        if 0.05 < t < L-0.05 and math.hypot(a[0]+ux*t-p[0], a[1]+uy*t-p[1]) < 0.04: ts.append(t)
    pts = [a] + [(a[0]+ux*t, a[1]+uy*t) for t in sorted(ts)] + [b]
    return list(zip(pts[:-1], pts[1:]))
room_segs = [[s for i in range(len(r["pts"])) for s in split_edge(r["pts"][i], r["pts"][(i+1)%len(r["pts"])])] for r in rooms]
count, types = {}, {}
for ri, segs in enumerate(room_segs):
    for a,b in segs: k = key(a,b); count[k] = count.get(k,0)+1; types.setdefault(k, []).append(room_type(rooms[ri]["name"]))
built = set()

def wall_segment(a, b, off, w, zc, h, material=M["plaster"]):
    L = math.hypot(b[0]-a[0], b[1]-a[1]); ang = math.atan2(b[1]-a[1], b[0]-a[0]); mid = ((a[0]+b[0])/2, (a[1]+b[1])/2)
    return box("Wall", (w, T, h), (mid[0]+math.cos(ang)*off, mid[1]+math.sin(ang)*off, zc), ang, material)

def build_wall(a, b, interior, rtype):
    L = math.hypot(b[0]-a[0], b[1]-a[1]); ang = math.atan2(b[1]-a[1], b[0]-a[0]); mid = ((a[0]+b[0])/2, (a[1]+b[1])/2)
    def place(o, off, z): o.location = (mid[0]+math.cos(ang)*off, mid[1]+math.sin(ang)*off, z); o.rotation_euler = (0,0,ang)
    if interior and L > 1.3:                                    # doorway near one end
        dw, dh = 0.86, 2.04; dc = -L/2 + 0.45 + dw/2; lw = dc-dw/2+L/2; rw = L/2-(dc+dw/2)
        if lw > 0.02: wall_segment(a,b,-L/2+lw/2, lw, H/2, H)
        if rw > 0.02: wall_segment(a,b, L/2-rw/2, rw, H/2, H)
        wall_segment(a,b, dc, dw, dh+(H-dh)/2, H-dh)
        for s in (-1,1): place(box("Architrave", (0.07, T+0.03, dh+0.04), (0,0,0), 0, M["trim"]), dc+s*(dw/2+0.035), dh/2+0.02)
        place(box("Architrave", (dw+0.14, T+0.03, 0.07), (0,0,0), 0, M["trim"]), dc, dh+0.035)
        leaf = box("Door", (dw-0.04, 0.04, dh-0.02), (0,0,0), 0, M["door"]); hinge_ang = ang + 1.45
        hx, hy = mid[0]+math.cos(ang)*(dc-dw/2+0.02), mid[1]+math.sin(ang)*(dc-dw/2+0.02)
        leaf.location = (hx+math.cos(hinge_ang)*(dw-0.04)/2, hy+math.sin(hinge_ang)*(dw-0.04)/2, dh/2); leaf.rotation_euler = (0,0,hinge_ang)
    elif (not interior) and L > 1.6 and rtype != "garage":     # window
        ww = min(1.8, L*0.5); sill = 1.2 if rtype == "bath" else 0.85; head = min(H-0.25, 2.15); side = (L-ww)/2; gh = head-sill
        wall_segment(a,b,-L/2+side/2, side, H/2, H); wall_segment(a,b, L/2-side/2, side, H/2, H)
        wall_segment(a,b, 0, ww, sill/2, sill); wall_segment(a,b, 0, ww, head+(H-head)/2, H-head)
        place(box("Sill", (ww+0.16, T+0.12, 0.05), (0,0,0), 0, M["trim"]), 0, sill-0.005)
        place(box("Glazing", (ww, 0.01, gh), (0,0,0), 0, M["glass"]), 0, sill+gh/2)
        for x in (-ww/2+0.03, ww/2-0.03): place(box("Frame", (0.06, 0.09, gh), (0,0,0), 0, M["trim"]), x, sill+gh/2)
        place(box("Frame", (ww, 0.09, 0.06), (0,0,0), 0, M["trim"]), 0, head-0.03)
        place(box("Bar", (0.05, 0.07, gh), (0,0,0), 0, M["trim"]), 0, sill+gh/2); place(box("Bar", (ww, 0.07, 0.045), (0,0,0), 0, M["trim"]), 0, sill+gh*0.55)
    else:
        wall_segment(a,b, 0, L, H/2, H)

# ------------------------------------------------------------------ furniture (Poly Haven glTF if present, else simple stand-ins)
MODELS = os.path.join(ROOT, "models"); manifest = json.load(open(os.path.join(MODELS, "manifest.json"))) if os.path.exists(os.path.join(MODELS, "manifest.json")) else None
_imported = {}
def asset(k, x, y, rz=0, w=None, d=None, h=None, z=None, scale=None):
    """Import (once) a Poly Haven model, link a copy, fit one dimension, drop onto floor."""
    if not manifest or k not in manifest["files"]: return None
    if k not in _imported:
        before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, manifest["files"][k]))
        new = [o for o in set(bpy.data.objects)-before]
        root = bpy.data.objects.new(f"src_{k}", None); C_FURN.objects.link(root)
        for o in new:
            if o.parent is None: o.parent = root
            for c in o.users_collection: c.objects.unlink(o)
            C_FURN.objects.link(o)
        root.hide_render = root.hide_viewport = True
        for o in new: o.hide_render = o.hide_viewport = True
        _imported[k] = (root, new)
    root, children = _imported[k]; sx, sy, sz = manifest["dims"][k]["size"]; miny = manifest["dims"][k]["min"][1]
    sc = scale or (w/sx if w else d/sz if d else h/sy if h else 1.0)
    inst = bpy.data.objects.new(k, None); C_FURN.objects.link(inst); inst.instance_type = "COLLECTION"
    # simpler: duplicate hierarchy
    copies = {}
    for o in children:
        c = o.copy(); 
        if o.data: c.data = o.data
        c.hide_render = c.hide_viewport = False; C_FURN.objects.link(c); copies[o] = c
    for o, c in copies.items():
        if o.parent in copies: c.parent = copies[o.parent]
        else: c.parent = inst
    bpy.data.objects.remove(inst) if False else None
    # glTF is Y-up; Blender importer already converts to Z-up. Models' "front" = +Z gltf = -Y blender.
    holder = bpy.data.objects.new(k+"_holder", None); C_FURN.objects.link(holder)
    for o, c in copies.items():
        if c.parent is None or c.parent.name == inst.name: c.parent = holder
    bpy.data.objects.remove(inst)
    holder.scale = (sc, sc, sc); holder.location = (x, y, z if z is not None else -miny*sc); holder.rotation_euler = (0, 0, rz)
    return holder

def furnish(rtype, cx, cy, w, d, ang):
    """Local frame: origin room centre; -y = back (solid) wall in plan coords, +y = front. Rotated by ang."""
    def L(x, y):  # local → world
        return (cx + x*math.cos(ang) - y*math.sin(ang), cy + x*math.sin(ang) + y*math.cos(ang))
    def A(k, x, y, rz=0, **kw): p = L(x,y); return asset(k, p[0], p[1], rz+ang, **kw)
    def B(name, size, x, y, z, rz=0, m=None): p = L(x,y); return box(name, size, (p[0], p[1], z), rz+ang, m, C_FURN)
    def light(x, y, z, pw=25): p = L(x,y); point_light((p[0], p[1], z), pw)
    back, front, left, right = -d/2, d/2, -w/2, w/2
    mid, big = w*d > 7, w*d > 12
    if rtype == "living":
        A("sofa", 0, front-1.15, math.pi, w=min(2.3, w-1.4)); A("coffee_table", 0, 0.15, math.pi/2, d=1.05); A("vase", 0.2, 0.15, 0, h=0.26, z=0.36)
        if w > 3.6: A("armchair", right-0.7, -0.2, -math.pi/2-0.6, w=0.8)
        A("cabinet", 0, back+0.36, 0, w=min(1.9, w*0.45)); B("TV", (1.25, 0.035, 0.72), 0, back+0.13, 1.15, 0, M["black"]); B("Screen", (1.2, 0.01, 0.66), 0, back+0.152, 1.15, 0, M["screen"])
        A("picture2", -1.25, back+0.09, 0, z=1.55, scale=1.0); A("plant", left+0.45, back+0.5, 0.4, h=1.1)
        if mid: A("plant2", right-0.5, front-0.5, 0, h=0.6)
        if w > 4.6: A("bookshelf", left+0.32, 0.3, math.pi/2, h=2.0)
        light(left+0.6, front-0.6, 1.4, 20)
    elif rtype == "bed":
        bw = 1.6 if big else 1.5 if mid else 1.35
        A("bed", 0, back+1.0, 0, w=bw); B("Duvet", (bw+0.2, 1.5, 0.18), 0, back+1.25, 0.58, 0, M["linen"])
        for s in (-1, 1):
            B("Pillow", (bw*0.42, 0.4, 0.14), s*bw*0.25, back+0.5, 0.62, 0, M["white"])
            if w > bw+1.2: A("nightstand", s*(bw/2+0.4), back+0.32, 0, w=0.5); A("vase", s*(bw/2+0.4), back+0.32, 0, h=0.3, z=0.62); light(s*(bw/2+0.4), back+0.32, 0.9, 10)
        if w > 3.2: A("wardrobe", right-0.35, 0.4, -math.pi/2, h=2.1)
        if mid: A("plant", left+0.4, front-0.5, 0, h=1.2)
        A("picture3", 0.3, back+0.09, 0, z=1.75)
    elif rtype == "kitchen":
        run = min(w-0.4, 4.4)
        B("Base", (run, 0.6, 0.86), 0, back+0.32, 0.43, 0, M["kitchen"]); B("Worktop", (run+0.04, 0.64, 0.04), 0, back+0.32, 0.88, 0, M["stone"]); B("Wall units", (run, 0.35, 0.7), 0, back+0.18, 1.75, 0, M["kitchen"])
        x = -run/2+0.3
        while x < run/2: B("Handle", (0.5, 0.02, 0.02), x, back+0.62, 0.7, 0, M["brass"]); B("Handle", (0.5, 0.02, 0.02), x, back+0.36, 1.45, 0, M["brass"]); x += 0.6
        B("Hob", (0.6, 0.45, 0.02), -run/4, back+0.32, 0.905, 0, M["steel"]); B("Sink", (0.5, 0.36, 0.02), run/4, back+0.32, 0.9, 0, M["steel"]); B("Oven", (0.6, 0.5, 0.6), run/2-0.35, back+0.32, 0.5, 0, M["black"])
        A("vase2", -0.3, back+0.32, 0, h=0.3, z=0.9)
        if w > 3.6 and d > 3.6:
            B("Island", (1.8, 0.9, 0.9), 0, 0.3, 0.45, 0, M["white"]); B("IslandTop", (1.88, 0.98, 0.04), 0, 0.3, 0.92, 0, M["stone"])
            for xx in (-0.5, 0.5): A("stool", xx, 0.95, math.pi, h=0.68); A("pendant", xx, 0.3, 0, h=0.55, z=H-0.02-0.55*(1.36-1.34)/1.36); light(xx, 0.3, H-0.6, 15)
        elif d > 3:
            A("dining_table", 0, 0.7, 0, w=min(1.6, w-1.2))
            for xx, yy, r in ((-0.45,0.25,0),(0.45,0.25,0),(-0.45,1.15,math.pi),(0.45,1.15,math.pi)): A("dining_chair", xx, yy, r, h=0.95)
        A("plant", right-0.4, front-0.4, 0, h=1.2)
    elif rtype == "bath":
        if w*d > 4.5: B("Bath", (1.7, 0.75, 0.55), left+0.9, back+0.4, 0.275, 0, M["white"])
        else: B("Tray", (0.9, 0.9, 0.05), left+0.5, back+0.5, 0.025, 0, M["white"]); B("Screen", (0.02, 0.9, 2.0), left+0.95, back+0.5, 1.0, 0, M["glass"])
        B("WC", (0.4, 0.36, 0.32), right-0.4, front-0.35, 0.16, 0, M["white"]); B("Cistern", (0.38, 0.14, 0.5), right-0.4, front-0.1, 0.6, 0, M["white"])
        B("Vanity", (0.6, 0.45, 0.75), right-0.5, back+0.3, 0.375, 0, wood_material("Oak2", scale=2)); B("VanityTop", (0.62, 0.47, 0.05), right-0.5, back+0.3, 0.78, 0, M["stone"])
        A("mirror", right-0.5, back+0.09, 0, z=1.45, h=0.75)
    elif rtype == "study":
        A("desk", 0, back+0.55, 0, w=min(1.6, w-0.8)); A("desk_lamp", -0.5, back+0.45, 0.3, h=0.5, z=0.77); A("dining_chair", 0.1, back+1.15, math.pi, h=0.95)
        if w > 2.4: A("bookshelf", left+0.3, 0.4, math.pi/2, h=1.95)
        A("plant", right-0.4, front-0.4, 0, h=1.15); light(-0.5, back+0.45, 1.1, 8)
    elif rtype == "garden":
        A("armchair", -0.6, 0.1, math.pi+0.3, w=0.85); A("armchair", 0.6, 0.1, math.pi-0.3, w=0.85); A("side_table", 0, -0.7, 0, w=0.7); A("plant", right-0.45, front-0.45, 0, h=1.35)
    elif rtype == "hall":
        if w*d > 3: A("cabinet", 0, back+0.36, 0, w=min(1.4, w-0.6)); A("vase", 0.2, back+0.36, 0, h=0.35, z=0.68); A("mirror", 0, back+0.09, 0, z=1.5, h=0.75)
        if max(w, d) > 2.4: A("plant", right-0.35, front-0.35, 0, h=1.2)

# ------------------------------------------------------------------ build rooms
paint = [(0.86,0.84,0.79,1),(0.83,0.82,0.77,1),(0.80,0.83,0.80,1),(0.85,0.81,0.75,1),(0.81,0.84,0.87,1)]
room_info = []
for ri, r in enumerate(rooms):
    rtype = room_type(r["name"]); pts = r["pts"]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]; cx, cy = (min(xs)+max(xs))/2, (min(ys)+max(ys))/2; sx, sy = max(xs)-min(xs), max(ys)-min(ys)
    floor_m = {"bath": M["tile"], "kitchen": M["tileDark"], "bed": M["carpet"], "garage": M["paving"]}.get(rtype, M["oak"])
    polygon(f"Floor_{r['name']}", pts, 0.0, floor_m); polygon(f"Ceiling_{r['name']}", pts, H, M["ceiling"], flip=True)
    wallm = M["tile"] if rtype == "bath" else mat(f"Paint{ri%5}", paint[ri%5], 0.9)
    # side scoring for furniture back wall: 0=-y(top of plan → in blender that's +y... we keep plan sense: side 0 = max y), 1=+x, 2=min y, 3=-x
    side = {0:0, 1:0, 2:0, 3:0}
    for a, b in room_segs[ri]:
        k = key(a,b); ext = count[k] == 1; L = math.hypot(b[0]-a[0], b[1]-a[1]); mx, my = (a[0]+b[0])/2, (a[1]+b[1])/2
        sidx = (0 if my > cy else 2) if abs(b[1]-a[1]) < 0.01 else (1 if mx > cx else 3)
        pen = -10 if (ext and L > 1.6) else -2 if ((not ext) and L > 1.3) else 1
        side[sidx] += pen*L
        if k in built: continue
        built.add(k); interior = count[k] > 1 and "garage" not in types[k] and rtype != "garage"
        build_wall(a, b, interior, rtype)
    back = max((0,2,1,3), key=lambda i: side[i])
    ang = {0: math.pi, 2: 0.0, 1: math.pi/2, 3: -math.pi/2}[back]     # rotate local -y to face chosen wall
    along_x = back in (0, 2); rw, rd = (sx, sy) if along_x else (sy, sx)
    if rtype != "hall" or sx*sy > 2.5: furnish(rtype, cx, cy, rw-0.3, rd-0.3, ang)
    if rtype != "garage" and sx*sy > 2:
        point_light((cx, cy, H-0.3), 45 if rtype != "hall" else 20, radius=0.15)
        fixture = asset("ceiling_lamp", cx, cy, 0, h=0.5, z=H-0.5-0.22*(0.5/0.95)); 
    # skirting
    for a, b in room_segs[ri]:
        L = math.hypot(b[0]-a[0], b[1]-a[1]); angw = math.atan2(b[1]-a[1], b[0]-a[0]); mx, my = (a[0]+b[0])/2, (a[1]+b[1])/2
        nx, ny = -(b[1]-a[1])/L, (b[0]-a[0])/L
        if (cx-mx)*nx + (cy-my)*ny < 0: nx, ny = -nx, -ny
        box("Skirting", (L-0.02, 0.024, 0.12), (mx+nx*(T/2+0.012), my+ny*(T/2+0.012), 0.06), angw, M["trim"])
        if rtype not in ("bath", "garage"): box("Cornice", (L-0.02, 0.06, 0.10), (mx+nx*(T/2+0.03), my+ny*(T/2+0.03), H-0.05), angw, M["trim"])
    room_info.append(dict(name=r["name"], type=rtype, cx=cx, cy=cy, sx=sx, sy=sy, back=back, minx=min(xs), maxx=max(xs), miny=min(ys), maxy=max(ys)))

# ------------------------------------------------------------------ exterior + world
allx = [p[0] for p in all_pts]; ally = [p[1] for p in all_pts]; HX, HY = (min(allx)+max(allx))/2, (min(ally)+max(ally))/2; SX, SY = max(allx)-min(allx), max(ally)-min(ally)
g = box("Ground", (200, 200, 0.02), (HX, HY, -0.02), 0, M["grass"]); box("Paving", (SX+3, SY+3, 0.02), (HX, HY, -0.01), 0, M["paving"])
box("Roof", (SX+0.6, SY+0.6, 0.25), (HX, HY, H+0.13), 0, M["roof"])
for i in range(24):
    a = i/24*math.pi*2; rr = max(SX, SY)*0.9 + 5 + random.random()*3
    tx, ty = HX+math.cos(a)*rr, HY+math.sin(a)*rr
    trunk = box("Trunk", (0.3, 0.3, 2.2), (tx, ty, 1.1), 0, M["walnut"])
    bpy.ops.mesh.primitive_ico_sphere_add(radius=1.6+random.random()*1.2, subdivisions=2, location=(tx, ty, 3.2+random.random())); cr = bpy.context.object; cr.data.materials.append(mat("Leaves", (0.2,0.4,0.16,1), 1.0))
    for c in cr.users_collection: c.objects.unlink(cr)
    C_ARCH.objects.link(cr)
world = bpy.data.worlds.new("Sky"); scene.world = world; world.use_nodes = True
nt = world.node_tree; bg = nt.nodes["Background"]; sky = nt.nodes.new("ShaderNodeTexSky"); sky.sky_type = "NISHITA"; sky.sun_elevation = math.radians(28); sky.sun_rotation = math.radians(215); sky.sun_intensity = 0.6; sky.altitude = 20
nt.links.new(sky.outputs["Color"], bg.inputs["Color"]); bg.inputs["Strength"].default_value = 0.6

# ------------------------------------------------------------------ cameras + tour
cams = []
for i, r in enumerate(room_info):
    if r["type"] in ("garage",) or r["sx"]*r["sy"] < 2.5: continue
    W, D = r["sx"], r["sy"]
    pos = {0: (r["minx"]+W*0.25, r["miny"]+0.45), 2: (r["maxx"]-W*0.25, r["maxy"]-0.45), 1: (r["minx"]+0.45, r["maxy"]-D*0.25), 3: (r["maxx"]-0.45, r["miny"]+D*0.25)}[r["back"]]
    tgt = {0: (r["cx"]+W*0.1, r["maxy"]), 2: (r["cx"]-W*0.1, r["miny"]), 1: (r["maxx"], r["cy"]-D*0.1), 3: (r["minx"], r["cy"]+D*0.1)}[r["back"]]
    cd = bpy.data.cameras.new(f"Cam_{r['name']}"); cd.lens = 24; cd.sensor_width = 36
    co = bpy.data.objects.new(f"Cam_{r['name']}", cd); scene.collection.objects.link(co); co.location = (pos[0], pos[1], 1.55)
    direction = Vector((tgt[0]-pos[0], tgt[1]-pos[1], 1.45-1.55)); co.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cams.append((co, r))
scene.camera = cams[0][0] if cams else None

def render_stills():
    for co, r in cams:
        scene.camera = co; scene.render.filepath = os.path.join(OUT, f"{r['name'].replace('/', '-').replace(' ', '_')}.png")
        bpy.ops.render.render(write_still=True); print("rendered", scene.render.filepath)

def build_tour(seconds=30, fps=30):
    """One camera that eases between the room cameras, with gentle walking bob."""
    scene.render.fps = fps; scene.frame_start = 1; scene.frame_end = seconds*fps
    cd = bpy.data.cameras.new("TourCam"); cd.lens = 24; tour = bpy.data.objects.new("TourCam", cd); scene.collection.objects.link(tour); scene.camera = tour
    per = (seconds*fps) // max(1, len(cams))
    for i, (co, r) in enumerate(cams):
        f0 = 1 + i*per; f1 = f0 + per - 1
        # start a step back from the room camera, end at it (slow push-in)
        fwd = co.matrix_world.to_quaternion() @ Vector((0, 0, -1)); back = co.location - fwd*0.9
        for f, loc in ((f0, back), (f1, co.location.copy())):
            tour.location = loc; tour.rotation_euler = co.rotation_euler.copy(); tour.keyframe_insert("location", frame=f); tour.keyframe_insert("rotation_euler", frame=f)
    for fc in tour.animation_data.action.fcurves:
        for kp in fc.keyframe_points: kp.interpolation = "BEZIER"; kp.easing = "EASE_IN_OUT"
    # subtle bob
    noise_mod = None
    scene.render.image_settings.file_format = "FFMPEG"; scene.render.ffmpeg.format = "MPEG4"; scene.render.ffmpeg.codec = "H264"; scene.render.ffmpeg.constant_rate_factor = "HIGH"
    scene.render.filepath = os.path.join(OUT, "tour.mp4")

blend_path = os.path.join(OUT, "house.blend"); bpy.ops.wm.save_as_mainfile(filepath=blend_path); print("saved", blend_path)
if arg("stills", flag=True): render_stills()
if arg("tour", flag=True): build_tour(); bpy.ops.render.render(animation=True)
