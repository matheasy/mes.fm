#!/usr/bin/env python3
"""Build the data files of MES Maps (mes.fm/maps).

Sources (public domain / ISC):
  * world-atlas 2.0.2 (countries-110m.json, countries-50m.json): TopoJSON of Natural Earth's
    admin-0 countries, ids = ISO 3166-1 numeric. Copied as is.
  * Natural Earth 50m admin-0 countries: population, continent, subregion, GDP, ISO codes.
  * Natural Earth 50m admin-1 states / provinces (the 9 countries Natural Earth has at 50m:
    USA, Canada, Australia, Brazil, China, India, Indonesia, Russia, South Africa).
  * Natural Earth 10m populated places: national capitals and state / province capitals.

Writes mes.fm/maps/data/:
  countries-110m.json, countries-50m.json   (world-atlas, unchanged)
  countries.json   {id: {n, a2, a3, c (continent), s (subregion), p, g (GDP M$), cap: [name, lon, lat, pop], alt: [...]}}
  admin1.json      {countries: {A3: name}, f: [{n, a3, c (iso 3166-2), t (type), ar (km2), cap, g: polygons}]}
                   polygons = [[ring, ...], ...], ring = flat delta-encoded ints of lon/lat x 100.

Dry run by default; --apply writes. --cache DIR keeps downloads (default ~/.cache/mes-maps).
"""
import json, math, os, sys, unicodedata, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "mes.fm", "maps", "data")
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
SRC = {
    "countries-110m.json": "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json",
    "countries-50m.json": "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json",
    "admin0.geojson": NE + "ne_50m_admin_0_countries.geojson",
    "admin1.geojson": NE + "ne_50m_admin_1_states_provinces.geojson",
    "places.geojson": NE + "ne_10m_populated_places_simple.geojson",
}
TOL = 0.025  # degrees, Douglas-Peucker tolerance for admin-1 shapes


def fetch(cache):
    os.makedirs(cache, exist_ok=True)
    for name, url in SRC.items():
        p = os.path.join(cache, name)
        if not os.path.exists(p):
            print("download", url)
            req = urllib.request.Request(url, headers={"User-Agent": "mes.fm-maps-build/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r, open(p, "wb") as f:
                f.write(r.read())
    return {k: os.path.join(cache, k) for k in SRC}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return "".join(ch for ch in s if ch.isalnum())


def dp(pts, tol):
    if len(pts) < 5:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-12
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L if (dx or dy) else math.hypot(px - ax, py - ay)
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack.append((a, bi)); stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def enc_ring(ring):
    pts = dp([(x, y) for x, y in ring], TOL)
    if len(pts) < 4:
        return None
    out, px, py = [], 0, 0
    for x, y in pts:
        ix, iy = round(x * 100), round(y * 100)
        out += [ix - px, iy - py]
        px, py = ix, iy
    return out


def enc_geom(g):
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    res = []
    for poly in polys:
        rings = [r for r in (enc_ring(r) for r in poly) if r]
        if rings:
            res.append(rings)
    return res


def pip(x, y, geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for poly in polys:
        inside = False
        for ri, ring in enumerate(poly):
            c = False
            j = len(ring) - 1
            for i in range(len(ring)):
                xi, yi = ring[i][0], ring[i][1]
                xj, yj = ring[j][0], ring[j][1]
                if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
                    c = not c
                j = i
            if ri == 0:
                inside = c
            elif c:
                inside = False
        if inside:
            return True
    return False


# States whose capital lies outside them (Chandigarh) or that Natural Earth names differently.
HAND_CAPS = {("IND", "Haryana"): ["Chandigarh", 76.78, 30.735, 979000],
             ("IND", "Punjab"): ["Chandigarh", 76.78, 30.735, 979000],
             ("IND", "Gujarat"): ["Gandhinagar", 72.637, 23.223, 292000],
             ("IND", "Odisha"): ["Bhubaneswar", 85.824, 20.296, 837000],
             ("IND", "Uttarakhand"): ["Dehradun", 78.032, 30.316, 578000],
             ("AUS", "Jervis Bay Territory"): None,
             ("IDN", "Banten"): ["Serang", 106.15, -6.12, 690000],
             ("IDN", "Bangka-Belitung"): ["Pangkal Pinang", 106.11, -2.13, 220000],
             ("IDN", "Sulawesi Barat"): ["Mamuju", 118.89, -2.68, 280000],
             ("IDN", "Kepulauan Riau"): ["Tanjung Pinang", 104.45, 0.92, 230000],
             ("IDN", "Gorontalo"): ["Gorontalo", 123.06, 0.54, 200000],
             ("IDN", "Papua Barat"): ["Manokwari", 134.08, -0.86, 170000],
             ("IDN", "Maluku Utara"): ["Sofifi", 127.57, 0.74, 40000],
             ("RUS", "Leningrad"): ["Gatchina", 30.13, 59.57, 95000],
             ("RUS", "Moskovskaya"): ["Krasnogorsk", 37.33, 55.82, 175000],
             ("RUS", "Khakass"): ["Abakan", 91.44, 53.72, 187000],
             ("RUS", "Sevastopol"): ["Sevastopol", 33.52, 44.62, 450000]}


def main():
    apply = "--apply" in sys.argv
    cache = os.path.expanduser("~/.cache/mes-maps")
    if "--cache" in sys.argv:
        cache = sys.argv[sys.argv.index("--cache") + 1]
    p = fetch(cache)
    a0 = json.load(open(p["admin0.geojson"]))["features"]
    a1 = json.load(open(p["admin1.geojson"]))["features"]
    pl = json.load(open(p["places.geojson"]))["features"]
    wa = json.load(open(p["countries-50m.json"]))
    geos = wa["objects"]["countries"]["geometries"]

    caps, alts, subcaps, regcaps, allcaps = {}, {}, {}, {}, {}
    for f in pl:
        q = f["properties"]
        row = [" ".join(q["name"].split()), round(q["longitude"], 3), round(q["latitude"], 3), q.get("pop_max") or 0]
        fc = q["featurecla"]
        if fc == "Admin-0 capital":
            caps.setdefault(q["adm0_a3"], []).append(row)
        elif fc == "Admin-0 region capital":
            regcaps.setdefault(q["adm0_a3"], []).append(row)
        elif fc == "Admin-0 capital alt":
            alts.setdefault(q["adm0_a3"], []).append(row)
        if fc in ("Admin-1 capital", "Admin-1 region capital", "Admin-0 capital", "Admin-0 capital alt"):
            allcaps.setdefault(q["adm0_a3"], []).append(row)
        if fc in ("Admin-1 capital", "Admin-1 region capital"):
            subcaps[(q["adm0_a3"], norm(q.get("adm1name")))] = row

    by_n3, by_name = {}, {}
    for f in a0:
        q = f["properties"]
        for k in ("ISO_N3", "ISO_N3_EH"):
            v = str(q.get(k) or "")
            if v and v != "-99":
                by_n3.setdefault(v.zfill(3), q)
        for k in ("NAME", "NAME_LONG", "ADMIN", "NAME_EN"):
            if q.get(k):
                by_name.setdefault(norm(q[k]), q)

    meta, missing = {}, []
    for gi, g in enumerate(geos):
        nm = g.get("properties", {}).get("name", "")
        gid = g.get("id") or ("x" + norm(nm))
        q = by_n3.get(str(gid)) or by_name.get(norm(nm))
        if not q:
            missing.append(nm)
            meta[gid] = {"n": nm}
            continue
        a3 = q.get("ADM0_A3") or q.get("ISO_A3")
        c = list(caps.get(a3) or caps.get(q.get("ISO_A3")) or regcaps.get(a3) or [])
        c.sort(key=lambda r: -r[3])
        a2 = q.get("ISO_A2_EH") if q.get("ISO_A2") in (None, "-99") else q.get("ISO_A2")
        m = {"n": nm, "ln": q.get("NAME_LONG") or nm, "a2": a2 if a2 and a2 != "-99" else "",
             "a3": a3, "c": q.get("CONTINENT"), "s": q.get("SUBREGION"),
             "p": int(q.get("POP_EST") or 0), "g": int(q.get("GDP_MD") or 0)}
        if c:
            m["cap"] = c[0]
            if len(c) > 1:
                m["alt"] = c[1:]
        if alts.get(a3):
            m.setdefault("alt", []).extend(alts[a3])
        meta[gid] = m

    countries, feats, nocap = {}, [], 0
    for f in a1:
        q = f["properties"]
        a3 = q["adm0_a3"]
        countries[a3] = q["admin"]
        cap = subcaps.get((a3, norm(q["name"]))) or subcaps.get((a3, norm(q.get("name_en") or "")))
        if (a3, q["name"]) in HAND_CAPS:
            cap = HAND_CAPS[(a3, q["name"])]
        elif not cap:
            ins = [r for r in allcaps.get(a3, []) if pip(r[1], r[2], f["geometry"])]
            cap = max(ins, key=lambda r: r[3]) if ins else None
        if not cap:
            nocap += 1
            if "-v" in sys.argv:
                print("  no capital:", q["admin"], q["name"], [k[1] for k in subcaps if k[0] == a3][:0])
        feats.append({"n": q.get("name_en") or q["name"], "a3": a3, "c": q.get("iso_3166_2") or "",
                      "t": q.get("type_en") or "", "ar": int(q.get("area_sqkm") or 0),
                      "cap": cap, "g": enc_geom(f["geometry"])})
    feats.sort(key=lambda r: (r["a3"], r["n"]))

    print(f"countries: {len(meta)}, unmatched: {missing}")
    print(f"countries without a capital: {[m['n'] for m in meta.values() if 'cap' not in m]}")
    print(f"admin-1: {len(feats)} in {len(countries)} countries, {nocap} without a capital")
    blob1 = json.dumps({"countries": countries, "f": feats}, separators=(",", ":"))
    blob0 = json.dumps(meta, separators=(",", ":"), ensure_ascii=False)
    print(f"countries.json {len(blob0)//1024} KB, admin1.json {len(blob1)//1024} KB")
    if not apply:
        print("dry run: pass --apply to write")
        return
    os.makedirs(OUT, exist_ok=True)
    for k in ("countries-110m.json", "countries-50m.json"):
        with open(p[k], "rb") as s, open(os.path.join(OUT, k), "wb") as d:
            d.write(s.read())
    open(os.path.join(OUT, "countries.json"), "w").write(blob0)
    open(os.path.join(OUT, "admin1.json"), "w").write(blob1)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
