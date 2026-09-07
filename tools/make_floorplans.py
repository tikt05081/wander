"""Draws estate-agent-style floorplans for the sample properties and writes
matching pre-traced studio projects (projects/*.json) so each one is walkable."""
from PIL import Image, ImageDraw, ImageFont
import json, os, math

OUT = os.path.join(os.path.dirname(__file__), "..", "portfolio")
PRJ = os.path.join(os.path.dirname(__file__), "..", "projects")
os.makedirs(OUT, exist_ok=True); os.makedirs(PRJ, exist_ok=True)

def font(sz):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/System/Library/Fonts/Helvetica.ttc"]:
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

# Each property: rooms as (name, x, y, w, h) in metres; doors as (x,y,dir,len) ; windows as (x,y,dir,len)
PROPS = {
 "perth-road-flat": dict(title="Perth Road, West End", sub="2 bed Victorian tenement flat · 78 m²", W=11.0, H=8.0,
   rooms=[("Living Room",0,0,4.6,4.4),("Kitchen",4.6,0,3.0,3.2),("Bedroom 1",7.6,0,3.4,4.0),("Hall",4.6,3.2,3.0,1.6),
          ("Bedroom 2",0,4.4,4.6,3.6),("Bathroom",4.6,4.8,2.2,3.2),("Box Room",6.8,4.8,4.2,3.2)],
   doors=[(4.6,3.8,"v",0.9),(7.6,3.6,"v",0.9),(5.0,4.8,"h",0.9),(7.0,4.8,"h",0.9),(4.6,1.2,"v",0.9),(3.6,4.4,"h",0.9),(7.6,4.2,"v",0.8)],
   windows=[(1.0,0,"h",2.4),(8.4,0,"h",1.6),(1.2,8.0,"h",2.0),(7.8,8.0,"h",1.6)], bay=(0.7,0,3.0)),
 "broughty-ferry-semi": dict(title="Broughty Ferry", sub="3 bed semi-detached · ground floor · 62 m²", W=9.0, H=9.0,
   rooms=[("Lounge",0,0,4.2,5.2),("Hall",4.2,0,1.6,5.2),("Dining Room",5.8,0,3.2,3.6),("Kitchen",5.8,3.6,3.2,3.4),
          ("WC",4.2,5.2,1.6,1.8),("Utility",0,5.2,2.4,3.8),("Garden Room",2.4,5.2,3.4,3.8),("Porch",5.8,7.0,3.2,2.0)],
   doors=[(4.2,2.0,"v",0.9),(5.8,1.4,"v",0.9),(5.8,4.6,"v",0.9),(4.6,5.2,"h",0.8),(3.0,5.2,"h",0.9),(2.4,6.6,"v",0.8),(7.0,7.0,"h",0.9),(8.2,9.0,"h",0.9)],
   windows=[(0.9,0,"h",2.2),(6.6,0,"h",1.6),(0,2.0,"v",1.4),(9.0,4.4,"v",1.6),(3.2,9.0,"h",1.8),(0.4,9.0,"h",1.4)]),
 "city-quay-apartment": dict(title="City Quay", sub="1 bed waterfront apartment · 48 m²", W=9.5, H=5.5,
   rooms=[("Living / Kitchen",0,0,5.4,5.5),("Hall",5.4,0,1.4,2.6),("Bathroom",5.4,2.6,2.4,2.9),("Bedroom",6.8,0,2.7,2.6),("Store",7.8,2.6,1.7,2.9)],
   doors=[(5.4,1.0,"v",0.9),(6.8,1.2,"v",0.9),(6.0,2.6,"h",0.8),(8.4,2.6,"h",0.8),(6.8,5.5,"h",0.9)],
   windows=[(0,0.8,"v",3.6),(1.2,0,"h",2.8),(7.4,0,"h",1.4)]),
 "newport-detached": dict(title="Newport-on-Tay", sub="4 bed detached · ground floor · 96 m²", W=12.0, H=9.0,
   rooms=[("Kitchen / Diner",0,0,6.4,4.6),("Family Room",6.4,0,5.6,4.6),("Hall",4.6,4.6,2.8,4.4),("Sitting Room",7.4,4.6,4.6,4.4),
          ("Study",0,4.6,2.6,2.4),("Utility",0,7.0,2.6,2.0),("Cloakroom",2.6,4.6,2.0,2.0),("Boot Room",2.6,6.6,2.0,2.4)],
   doors=[(6.4,2.2,"v",1.6),(5.4,4.6,"h",1.2),(7.4,6.6,"v",0.9),(4.6,5.6,"v",0.9),(2.6,5.4,"v",0.8),(2.6,7.6,"v",0.8),(1.2,7.0,"h",0.8),(5.6,9.0,"h",1.0),(9.4,4.6,"h",1.2)],
   windows=[(1.4,0,"h",3.6),(7.6,0,"h",3.2),(12.0,1.2,"v",2.0),(12.0,5.6,"v",2.2),(8.6,9.0,"h",2.4),(0,5.0,"v",1.4),(0,7.4,"v",1.2)]),
 "monifieth-bungalow": dict(title="Monifieth", sub="2 bed detached bungalow · 71 m²", W=10.5, H=7.5,
   rooms=[("Lounge",0,0,4.8,4.2),("Kitchen",4.8,0,3.0,3.4),("Bedroom 1",7.8,0,2.7,4.0),("Hall",4.8,3.4,3.0,1.2),
          ("Bedroom 2",0,4.2,3.6,3.3),("Bathroom",3.6,4.6,2.6,2.9),("Conservatory",6.2,4.6,4.3,2.9),("Cupboard",7.8,4.0,2.7,0.6)],
   doors=[(4.8,2.6,"v",0.9),(7.8,3.4,"v",0.9),(4.8,1.0,"v",0.9),(2.6,4.2,"h",0.9),(4.4,4.6,"h",0.8),(7.0,4.6,"h",1.4),(6.2,4.6,"h",0.1)],
   windows=[(1.2,0,"h",2.6),(5.6,0,"h",1.4),(8.4,0,"h",1.4),(0,1.4,"v",1.6),(0.8,7.5,"h",2.0),(7.0,7.5,"h",3.0),(10.5,5.2,"v",1.8)]),
 "barnhill-townhouse": dict(title="Barnhill", sub="New-build 3 bed townhouse · ground floor · 58 m²", W=6.5, H=10.5,
   rooms=[("Lounge",0,0,6.5,4.4),("Hall",0,4.4,2.2,3.4),("WC",2.2,4.4,1.6,1.8),("Store",2.2,6.2,1.6,1.6),
          ("Kitchen / Dining",0,7.8,6.5,2.7),("Garage",3.8,4.4,2.7,3.4)],
   doors=[(1.0,4.4,"h",0.9),(2.2,5.2,"v",0.8),(2.2,7.0,"v",0.8),(1.0,7.8,"h",0.9),(3.8,6.6,"v",0.8),(0,6.2,"v",0.9),(5.0,10.5,"h",1.6),(4.4,7.8,"h",0.9)],
   windows=[(1.2,0,"h",3.6),(0,1.4,"v",1.6),(1.2,10.5,"h",2.4),(6.5,8.6,"v",1.4)]),
}

def m2ft(m): return f"{int(m*3.281)}'{int(round((m*3.281%1)*12))}\""

def draw(key, p):
    S = 90; PAD = 90; W, H = p["W"], p["H"]
    img = Image.new("RGB", (int(W*S)+2*PAD, int(H*S)+2*PAD+70), "white"); d = ImageDraw.Draw(img)
    X = lambda x: PAD + x*S; Y = lambda y: PAD + y*S
    wall = 9
    # floors
    for name,x,y,w,h in p["rooms"]:
        d.rectangle([X(x),Y(y),X(x+w),Y(y+h)], fill="#f7f5f0")
    # walls
    for name,x,y,w,h in p["rooms"]:
        d.rectangle([X(x),Y(y),X(x+w),Y(y+h)], outline="#1b1b1b", width=wall)
    # optional bay window
    if p.get("bay"):
        bx, by, bw = p["bay"]; d.polygon([(X(bx),Y(by)),(X(bx+0.4),Y(by)-40),(X(bx+bw-0.4),Y(by)-40),(X(bx+bw),Y(by))], fill="white", outline="#1b1b1b", width=wall)
        d.line([X(bx)+wall, Y(by), X(bx+bw)-wall, Y(by)], fill="white", width=wall)
    # windows (white gap with double thin line)
    for x,y,dr,l in p["windows"]:
        if dr=="h":
            d.line([X(x),Y(y),X(x+l),Y(y)], fill="white", width=wall)
            for o in (-3,3): d.line([X(x),Y(y)+o,X(x+l),Y(y)+o], fill="#1b1b1b", width=2)
        else:
            d.line([X(x),Y(y),X(x),Y(y+l)], fill="white", width=wall)
            for o in (-3,3): d.line([X(x)+o,Y(y),X(x)+o,Y(y+l)], fill="#1b1b1b", width=2)
    # doors: gap + swing arc
    for x,y,dr,l in p["doors"]:
        if l < 0.2: continue
        if dr=="h":
            d.line([X(x),Y(y),X(x+l),Y(y)], fill="#f7f5f0", width=wall+2)
            d.line([X(x),Y(y),X(x),Y(y)+l*S], fill="#1b1b1b", width=2)
            d.arc([X(x)-l*S,Y(y)-l*S,X(x)+l*S,Y(y)+l*S], 0, 90, fill="#1b1b1b", width=2)
        else:
            d.line([X(x),Y(y),X(x),Y(y+l)], fill="#f7f5f0", width=wall+2)
            d.line([X(x),Y(y),X(x)+l*S,Y(y)], fill="#1b1b1b", width=2)
            d.arc([X(x)-l*S,Y(y)-l*S,X(x)+l*S,Y(y)+l*S], 0, 90, fill="#1b1b1b", width=2)
    # labels
    f1, f2 = font(22), font(15)
    for name,x,y,w,h in p["rooms"]:
        cx, cy = X(x+w/2), Y(y+h/2)
        if w*h < 3.5: f1s, f2s = font(14), font(11)
        else: f1s, f2s = f1, f2
        d.text((cx,cy-10), name.upper(), fill="#1b1b1b", font=f1s, anchor="mm")
        if w*h >= 2.0: d.text((cx,cy+14), f"{w:.2f}m x {h:.2f}m\n({m2ft(w)} x {m2ft(h)})", fill="#555", font=f2s, anchor="ma", align="center")
    # header/footer
    d.text((PAD, 30), p["title"].upper(), fill="#1b1b1b", font=font(26), anchor="lm")
    d.text((img.width-PAD, 30), p["sub"], fill="#666", font=font(16), anchor="rm")
    area = sum(w*h for _,_,_,w,h in p["rooms"] if _ not in ("Garage","Porch"))
    d.text((PAD, img.height-38), f"APPROX. GROSS INTERNAL AREA {area:.0f} SQ M / {area*10.764:.0f} SQ FT", fill="#666", font=font(14), anchor="lm")
    d.text((img.width-PAD, img.height-38), "Not to scale. For illustrative purposes only.", fill="#999", font=font(13), anchor="rm")
    img.save(os.path.join(OUT, f"{key}-plan.png"))
    # studio project: rooms as normalised polygons over the image
    iw, ih = img.size
    N = lambda x,y: {"x":X(x)/iw, "y":Y(y)/ih}
    rooms=[{"name":n,"color":["#6c8cff","#3ddc84","#ffb648","#ff7b7b","#c78bff","#4fd1e0","#f28cd0","#a7e34d"][i%8],"photo":None,
            "pts":[N(x,y),N(x+w,y),N(x+w,y+h),N(x,y+h)]} for i,(n,x,y,w,h) in enumerate(p["rooms"])]
    json.dump({"title":p["title"],"rooms":rooms,"scale":iw/S,"wallH":2.6 if "Victorian" not in p["sub"] else 3.1,"planUrl":f"portfolio/{key}-plan.png"},
              open(os.path.join(PRJ, f"{key}.json"),"w"))
    print(key, img.size)

for k,p in PROPS.items(): draw(k,p)
