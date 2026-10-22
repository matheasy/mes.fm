"""Builds the bulk-upload CSV for the new tool campaigns (2026-10-22).
Each campaign is first made by copying "Enigma Machine US Desktop" / "Enigma Machine World (No US) Desktop"
(desktop only, Manual CPC, 25,000 VND/day) and renaming the copy; this file then adds the ad groups, keywords
and ads, and removes the copied Enigma ad group.
Run: python3 make_new_tools.py  -> new-tools-upload.csv
"""
import csv, sys

CID = "220-619-6234"
BIDS = {"US": 1000, "World (No US)": 500}
OLD_AG = "Enigma Machine - Core"

# tool: [(ad group, final url, path1, path2, keywords [(text, match)], headlines, descriptions)]
T = {
 "Gematria": [
  ("Gematria - Core", "https://mes.fm/gematria", "gematria", "calculator",
   [("gematria calculator","Phrase"),("gematria","Exact"),("english gematria","Phrase"),("hebrew gematria","Phrase"),
    ("gematria decoder","Phrase"),("simple gematria","Phrase"),("gematria values","Phrase"),("gematria calculator","Exact")],
   ["Free Gematria Calculator","Ordinal, Reduction, Sumerian","Hebrew Gematria Too","Letter-by-Letter Breakdown",
    "Reverse Ciphers Included","Every Word Scored","Instant Results, No Signup","Share Any Result as a Link",
    "Compare Words and Phrases","Gematria Decoder Online"],
   ["Type a word or phrase and see its value in 6 English ciphers plus Hebrew gematria.",
    "See how each letter adds up, word by word. Free, no signup, nothing to install.",
    "Ordinal, reduction, Sumerian and their reverse ciphers side by side. Share a link."]),
 ],
 "Famous Birthdays": [
  ("Birthdays - Core", "https://mes.fm/birthday", "famous", "birthdays",
   [("famous birthdays","Phrase"),("famous birthdays today","Phrase"),("celebrities born today","Phrase"),
    ("who was born on my birthday","Phrase"),("famous people born on my birthday","Phrase"),
    ("celebrity birthdays","Phrase"),("famous birthdays","Exact"),("born on this day","Phrase")],
   ["Famous Birthdays Today","Who Shares Your Birthday?","10,000 Famous People","Celebrities Born Today",
    "Pick Any Day of the Year","Your Closest Birthday Twin","Free, No Signup","On This Day in History",
    "Famous People by Birthday","See Who Turns Your Age"],
   ["Pick any day and see the famous people born on it, with photos and their ages.",
    "Find your birthday twins, who is closest to your age, and events from that day.",
    "10,000 well-known people from Wikidata. Free, no signup, share the day as a link."]),
 ],
 "Time Zone": [
  ("Time Zone - Core", "https://mes.fm/timezone", "time-zone", "converter",
   [("time zone converter","Phrase"),("timezone converter","Phrase"),("convert time zones","Phrase"),
    ("time difference calculator","Phrase"),("pst to est","Phrase"),("est to pst","Phrase"),
    ("utc converter","Phrase"),("time zone converter","Exact")],
   ["Free Time Zone Converter","Convert Any Time Instantly","Daylight Saving Handled","Type It in Words",
    "PST, EST, UTC and More","Compare Several Cities","Share a Meeting Time Link","No Signup Needed",
    "Time Difference Calculator","Works in Your Local Time"],
   ["Convert a time between any time zones, with daylight saving handled for you.",
    "Type a time in plain words or pick a city. Compare several zones at once.",
    "Send a link that shows the time in each person's own zone. Free, no signup."]),
 ],
 "Materials": [
  ("Young's Modulus", "https://mes.fm/youngs-modulus-calculator", "youngs", "modulus",
   [("youngs modulus calculator","Phrase"),("young's modulus calculator","Phrase"),("modulus of elasticity calculator","Phrase"),
    ("stress strain calculator","Phrase"),("stress calculator","Phrase"),("strain calculator","Phrase"),
    ("axial stress calculator","Phrase"),("youngs modulus calculator","Exact")],
   ["Young's Modulus Calculator","Stress, Strain and E Solved","Any 4 Values Solve the Rest","SI and US Units",
    "30 Materials Built In","Safety Factor and Buckling","Free Engineering Calculator","Worked Steps Shown",
    "Stress and Strain Calculator","No Signup Needed"],
   ["Enter any 4 of force, area, length, stretch, stress, strain or E and get the rest.",
    "Built-in steel, aluminium, titanium, plastics and more. SI or US units.",
    "Safety factor and Euler buckling for pushes. Free, no signup, share a link."]),
  ("Tensile Test", "https://mes.fm/tensile-test-simulator", "tensile", "test",
   [("stress strain curve","Phrase"),("tensile test simulator","Phrase"),("stress strain curve generator","Phrase"),
    ("tensile test calculator","Phrase"),("yield strength calculator","Phrase"),("stress strain diagram","Phrase")],
   ["Tensile Test Simulator","Stress-Strain Curve Online","Yield, UTS and Necking","Compare 3 Materials",
    "True vs Engineering Stress","0.2% Offset Yield Shown","Free Engineering Tool","Steel, Aluminium, Plastics",
    "Toughness and Resilience","No Signup Needed"],
   ["Watch a stress-strain curve form, with yield, ultimate strength and necking marked.",
    "Compare up to three materials, see true stress and the areas under the curve.",
    "Made by an engineer for students and teachers. Free, no signup."]),
  ("Shear Stress", "https://mes.fm/shear-stress-calculator", "shear", "stress",
   [("shear stress calculator","Phrase"),("torsion calculator","Phrase"),("shear strain calculator","Phrase"),
    ("torsional shear stress calculator","Phrase"),("bolt shear calculator","Phrase"),("shear stress calculator","Exact")],
   ["Shear Stress Calculator","Torsion Calculator Too","Bolts, Pins and Shafts","Single and Double Shear",
    "SI and US Units","Free Engineering Calculator","Shear Strain and Modulus","Worked Steps Shown",
    "Interactive Diagrams","No Signup Needed"],
   ["Shear stress for bolts, pins and plates, plus torsion of solid and hollow shafts.",
    "Drag the sliders and watch the part deform. SI or US units, worked steps.",
    "Free engineering calculator for students and engineers. No signup."]),
 ],
 "Matrix": [
  ("Matrix - Core", "https://mes.fm/matrix-calculator", "matrix", "calculator",
   [("matrix calculator","Phrase"),("matrix multiplication calculator","Phrase"),("determinant calculator","Phrase"),
    ("inverse matrix calculator","Phrase"),("eigenvalue calculator","Phrase"),("rref calculator","Phrase"),
    ("matrix inverse calculator","Phrase"),("matrix calculator","Exact")],
   ["Free Matrix Calculator","Determinant and Inverse","Eigenvalues and SVD","RREF With Every Step",
    "Paste From Excel or LaTeX","Up to 50 x 50 Matrices","Multiply Matrices Online","Fractions and pi Work",
    "Copy as LaTeX or NumPy","No Signup Needed"],
   ["Multiply, invert, row-reduce and find eigenvalues, with the Gauss-Jordan steps shown.",
    "Paste a matrix from a spreadsheet, MATLAB, NumPy or LaTeX. Copy results back.",
    "Free, no signup, up to 50 x 50. Made by a math tutor for students."]),
 ],
}

def check():
    errs, seen = [], {}
    for tool, ags in T.items():
        for ag, url, p1, p2, kws, hs, ds in ags:
            if len(hs) < 3 or len(ds) < 2: errs.append(f"{ag}: too few assets")
            errs += [f"{ag} headline {len(h)}: {h}" for h in hs if len(h) > 30]
            errs += [f"{ag} desc {len(d)}: {d}" for d in ds if len(d) > 90]
            errs += [f"{ag} path: {p}" for p in (p1, p2) if len(p) > 15]
            if len(set(hs)) != len(hs): errs.append(f"{ag}: duplicate headline")
            for t, m in kws:
                k = (t.lower(), m)
                if k in seen: errs.append(f"keyword {t} {m} in {seen[k]} and {ag}")
                seen[k] = ag
    return errs

errs = check()
if errs:
    print("\n".join(errs)); sys.exit(1)

H = ["Customer ID","Campaign","Ad group","Max CPC","Keyword","Criterion Type","Ad type"] + [f"Headline {i}" for i in range(1,16)] \
    + [f"Description {i}" for i in range(1,5)] + ["Final URL","Path 1","Path 2","Status"]
rows = []
def row(camp, **kw):
    r = {h: "" for h in H}; r.update(kw); r["Campaign"] = camp; r["Customer ID"] = CID; return r
for tool, ags in T.items():
    for region, bid in BIDS.items():
        camp = f"{tool} {region} Desktop"
        rows.append(row(camp, **{"Ad group": OLD_AG, "Status": "Removed"}))
        for ag, url, p1, p2, kws, hs, ds in ags:
            rows.append(row(camp, **{"Ad group": ag, "Max CPC": bid, "Status": "Enabled"}))
            for t, m in kws:
                rows.append(row(camp, **{"Ad group": ag, "Keyword": t, "Criterion Type": m, "Status": "Enabled"}))
            ad = {"Ad group": ag, "Ad type": "Responsive search ad", "Final URL": url, "Path 1": p1, "Path 2": p2, "Status": "Enabled"}
            for i, h in enumerate(hs, 1): ad[f"Headline {i}"] = h
            for i, d in enumerate(ds, 1): ad[f"Description {i}"] = d
            rows.append(row(camp, **ad))
with open("new-tools-upload.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, H); w.writeheader(); w.writerows(rows)
camps = [f"{t} {r} Desktop" for t in T for r in BIDS]
print(f"ok: {len(camps)} campaigns, {sum(len(a) for a in T.values())*2} ad groups, {len(rows)} rows")
print("\n".join(camps))
