"""Bulk-upload file for the Percentage Calculator language campaign (2026-10-24), same shape as make_bmi_languages.py.
Run: python3 google-ads/make_percentage_languages.py  -> google-ads/percentage-languages-upload.csv
Campaign "Percentage Languages (World) Desktop" = a copy of "BMI Languages (World) Desktop" (desktop only, all languages,
all countries except Argentina, Manual CPC, ₫25,000/day) with these 5 ad groups at ₫500 instead of the BMI ones.
"""
import csv, pathlib

CAMP = "Percentage Languages (World) Desktop"
BID = 500
OUT = pathlib.Path(__file__).with_name("percentage-languages-upload.csv")

# lang: (ad group, final url, path1, path2, keywords [(text, match)], headlines (<= 30 chars), descriptions (<= 90 chars))
L = {
 "es": ("Percentage - Español", "https://mes.fm/calculadora-de-porcentaje", "calculadora", "porcentaje",
   [("calculadora de porcentajes","Phrase"),("calcular porcentaje","Phrase"),("calculadora porcentaje","Phrase"),
    ("como calcular el porcentaje","Phrase"),("sacar porcentaje","Phrase"),("calculo de porcentaje","Phrase"),
    ("porcentaje de un numero","Phrase"),("calculadora de porcentajes","Exact")],
   ["Calculadora de Porcentajes","Calcula Porcentajes Gratis","Aumentos y Descuentos en %","Resultado al Instante",
    "Sin Registro, 100% Gratis","Variación Porcentual","Diferencia Porcentual","Fórmula Paso a Paso",
    "10 Cálculos en Una Página","Calculadora % Online"],
   ["Calcula el porcentaje de un número, aumentos, descuentos y variaciones. Gratis.",
    "Escribe tus números y obtén el resultado al instante, con la fórmula. Sin registro.",
    "Guarda y comparte tus cálculos. Funciona con coma o punto decimal."]),
 "pt": ("Percentage - Português", "https://mes.fm/calculadora-de-porcentagem", "calculadora", "porcentagem",
   [("calculadora de porcentagem","Phrase"),("calcular porcentagem","Phrase"),("como calcular porcentagem","Phrase"),
    ("calculo de porcentagem","Phrase"),("porcentagem de um numero","Phrase"),("calculadora de porcentagem","Exact")],
   ["Calculadora de Porcentagem","Calcule Porcentagem Grátis","Aumentos e Descontos em %","Resultado na Hora",
    "Sem Cadastro, 100% Grátis","Variação Percentual","Diferença Percentual","Fórmula Passo a Passo",
    "10 Cálculos em Uma Página","Calculadora % Online"],
   ["Calcule a porcentagem de um número, aumentos, descontos e variações. Grátis.",
    "Digite seus números e veja o resultado na hora, com a fórmula. Sem cadastro.",
    "Salve e compartilhe seus cálculos. Funciona com vírgula ou ponto decimal."]),
 "id": ("Percentage - Indonesia", "https://mes.fm/kalkulator-persen", "kalkulator", "persen",
   [("kalkulator persen","Phrase"),("hitung persen","Phrase"),("cara menghitung persen","Phrase"),
    ("menghitung persentase","Phrase"),("kalkulator persentase","Phrase"),("kalkulator persen","Exact")],
   ["Kalkulator Persen Gratis","Hitung Persen dengan Mudah","Kenaikan dan Diskon dalam %","Hasil Langsung Muncul",
    "Tanpa Daftar, 100% Gratis","Perubahan Persentase","Selisih Persentase","Rumus Langkah demi Langkah",
    "10 Hitungan dalam 1 Halaman","Kalkulator % Online"],
   ["Hitung persen dari suatu angka, kenaikan, diskon, dan perubahan. Gratis.",
    "Ketik angka Anda dan lihat hasilnya langsung, lengkap dengan rumus. Tanpa daftar.",
    "Simpan dan bagikan perhitungan Anda. Bisa pakai koma atau titik desimal."]),
 "fr": ("Percentage - Français", "https://mes.fm/calcul-pourcentage", "calcul", "pourcentage",
   [("calcul pourcentage","Phrase"),("calculer un pourcentage","Phrase"),("calculatrice pourcentage","Phrase"),
    ("calcul de pourcentage","Phrase"),("pourcentage d un nombre","Phrase"),("calcul pourcentage","Exact")],
   ["Calcul de Pourcentage","Calculez un % Gratuitement","Hausses et Remises en %","Résultat Immédiat",
    "Sans Inscription, Gratuit","Taux d'Évolution","Écart en Pourcentage","Formule Étape par Étape",
    "10 Calculs sur Une Page","Calculatrice % en Ligne"],
   ["Calculez le pourcentage d'un nombre, une hausse, une remise ou une évolution.",
    "Saisissez vos nombres et obtenez le résultat tout de suite, avec la formule.",
    "Enregistrez et partagez vos calculs. Virgule ou point décimal acceptés."]),
 "de": ("Percentage - Deutsch", "https://mes.fm/prozentrechner", "prozent", "rechner",
   [("prozentrechner","Phrase"),("prozent berechnen","Phrase"),("prozentrechnung","Phrase"),
    ("prozentrechner online","Phrase"),("prozentsatz berechnen","Phrase"),("prozentrechner","Exact")],
   ["Prozentrechner Kostenlos","Prozente Sofort Berechnen","Aufschlag und Rabatt in %","Ergebnis in Sekunden",
    "Ohne Anmeldung, Gratis","Prozentuale Veränderung","Prozentualer Unterschied","Formel Schritt für Schritt",
    "10 Rechnungen auf 1 Seite","Prozentrechner Online"],
   ["Prozent von einer Zahl, Aufschlag, Rabatt und Veränderung berechnen. Kostenlos.",
    "Zahlen eingeben und das Ergebnis sofort sehen, mit Formel. Ohne Anmeldung.",
    "Rechnungen speichern und teilen. Mit Komma oder Punkt als Dezimalzeichen."]),
}

H = ["Customer ID","Campaign","Ad group","Max CPC","Keyword","Criterion Type","Ad type"] + [f"Headline {i}" for i in range(1,16)] \
    + [f"Description {i}" for i in range(1,5)] + ["Final URL","Path 1","Path 2","Status"]
rows = []
def row(**kw):
    r = {h: "" for h in H}; r.update(kw); r["Campaign"] = CAMP; r["Customer ID"] = "220-619-6234"; return r
for k, (ag, url, p1, p2, kws, hs, ds) in L.items():
    assert all(len(h) <= 30 for h in hs), [h for h in hs if len(h) > 30]
    assert all(len(d) <= 90 for d in ds), [d for d in ds if len(d) > 90]
    assert len(p1) <= 15 and len(p2) <= 15
    rows.append(row(**{"Ad group": ag, "Max CPC": BID, "Status": "Enabled"}))
    for t, m in kws:
        rows.append(row(**{"Ad group": ag, "Keyword": t, "Criterion Type": m, "Status": "Enabled"}))
    ad = {"Ad group": ag, "Ad type": "Responsive search ad", "Final URL": url, "Path 1": p1, "Path 2": p2, "Status": "Enabled"}
    for i, h in enumerate(hs, 1): ad[f"Headline {i}"] = h
    for i, d in enumerate(ds, 1): ad[f"Description {i}"] = d
    rows.append(row(**ad))
with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, H); w.writeheader(); w.writerows(rows)
print(f"ok: {len(L)} ad groups, {sum(len(v[4]) for v in L.values())} keywords, {len(rows)} rows -> {OUT.name}")
