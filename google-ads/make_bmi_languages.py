"""Builds Google Ads Editor import files for the BMI language campaign (2026-10-20).
Run: python3 make_bmi_languages.py  -> bmi-languages-adseditor.csv, bmi-world-foreign-negatives.csv
"""
import csv, sys

CAMP = "BMI Languages (World) Desktop"
BID = 500

# lang: (ad group, final url, path1, path2, keywords [(text, match)], headlines, descriptions)
L = {
 "es": ("BMI - Español", "https://mes.fm/calculadora-imc", "calculadora", "imc",
   [("calculadora imc","Phrase"),("calculadora de imc","Phrase"),("calcular imc","Phrase"),("calculo imc","Phrase"),
    ("cálculo del imc","Phrase"),("indice de masa corporal","Phrase"),("calculadora imc","Exact"),("calcular mi imc","Exact")],
   ["Calculadora de IMC Gratis","Calcula tu IMC al Instante","Índice de Masa Corporal","IMC en kg y cm",
    "Sin Registro, 100% Gratis","Tu Rango de Peso Saludable","Escala OMS y Asiática","Guarda tu Historial de IMC",
    "Calculadora IMC Online","Resultado en Segundos"],
   ["Calcula tu índice de masa corporal gratis. Rango de peso saludable y categoría OMS.",
    "Introduce tu peso y altura y obtén tu IMC al instante. Funciona en kg/cm y lb/pies.",
    "Sigue tu IMC con el tiempo con un gráfico. Sin registro y sin descargar nada."]),
 "pt": ("BMI - Português", "https://mes.fm/calculadora-imc-pt", "calculadora", "imc",
   [("índice de massa corporal","Phrase"),("calcular o imc","Phrase"),("como calcular o imc","Phrase"),
    ("calculo do imc","Phrase"),("cálculo do imc","Phrase"),("calculadora de imc online","Exact"),("imc calcular","Exact")],
   ["Calculadora de IMC Grátis","Calcule seu IMC Agora","Índice de Massa Corporal","IMC em kg e cm",
    "Sem Cadastro, 100% Grátis","Sua Faixa de Peso Saudável","Escala OMS e Asiática","Guarde seu Histórico",
    "Calculadora IMC Online","Resultado em Segundos"],
   ["Calcule seu índice de massa corporal grátis. Faixa de peso saudável e categoria OMS.",
    "Digite seu peso e altura e veja seu IMC na hora. Funciona em kg/cm e lb/pés.",
    "Acompanhe seu IMC ao longo do tempo com um gráfico. Sem cadastro, sem download."]),
 "id": ("BMI - Indonesia", "https://mes.fm/kalkulator-bmi", "kalkulator", "bmi",
   [("kalkulator bmi","Phrase"),("hitung bmi","Phrase"),("hitung imt","Phrase"),("cara menghitung bmi","Phrase"),
    ("menghitung imt","Phrase"),("cek bmi","Phrase"),("indeks massa tubuh","Phrase"),("kalkulator bmi","Exact")],
   ["Kalkulator BMI Gratis","Hitung BMI Anda Sekarang","Indeks Massa Tubuh (IMT)","BMI dalam kg dan cm",
    "Tanpa Daftar, Gratis","Rentang Berat Badan Sehat","Skala WHO dan Asia","Simpan Riwayat BMI",
    "Kalkulator IMT Online","Hasil dalam Hitungan Detik"],
   ["Hitung indeks massa tubuh Anda gratis. Rentang berat badan sehat dan kategori WHO.",
    "Masukkan berat dan tinggi badan, lihat BMI Anda langsung. Ada skala Asia juga.",
    "Pantau BMI Anda dari waktu ke waktu dengan grafik. Tanpa daftar, tanpa unduhan."]),
 "fr": ("BMI - Français", "https://mes.fm/calcul-imc", "calcul", "imc",
   [("calcul imc","Phrase"),("calculer imc","Phrase"),("calculer son imc","Phrase"),("calculatrice imc","Phrase"),
    ("indice de masse corporelle","Phrase"),("calcul de l imc","Phrase"),("calcul imc","Exact")],
   ["Calcul IMC Gratuit","Calculez votre IMC","Indice de Masse Corporelle","IMC en kg et cm",
    "Sans Inscription, Gratuit","Votre Poids Santé Idéal","Échelle OMS et Asiatique","Historique de votre IMC",
    "Calculatrice IMC en Ligne","Résultat Immédiat"],
   ["Calculez votre indice de masse corporelle gratuitement. Poids santé et catégorie OMS.",
    "Entrez votre poids et votre taille et obtenez votre IMC tout de suite. kg/cm ou lb.",
    "Suivez votre IMC dans le temps avec un graphique. Sans inscription, sans téléchargement."]),
 "de": ("BMI - Deutsch", "https://mes.fm/bmi-rechner", "bmi", "rechner",
   [("bmi rechner","Phrase"),("bmi berechnen","Phrase"),("body mass index rechner","Phrase"),
    ("bmi rechner frau","Phrase"),("bmi rechner mann","Phrase"),("bmi rechner","Exact")],
   ["BMI Rechner Kostenlos","BMI Sofort Berechnen","Body-Mass-Index Rechner","BMI in kg und cm",
    "Ohne Anmeldung, Gratis","Ihr Gesundes Gewicht","WHO- und Asien-Skala","BMI-Verlauf Speichern",
    "BMI Rechner Online","Ergebnis in Sekunden"],
   ["Berechnen Sie Ihren Body-Mass-Index kostenlos. Gesunder Gewichtsbereich und WHO-Kategorie.",
    "Gewicht und Größe eingeben und den BMI sofort sehen. In kg/cm oder lb/Fuß.",
    "Verfolgen Sie Ihren BMI mit einem Diagramm. Ohne Anmeldung, ohne Download."]),
 "it": ("BMI - Italiano", "https://mes.fm/calcolo-bmi", "calcolo", "bmi",
   [("calcolo bmi","Phrase"),("calcola bmi","Phrase"),("calcolo imc","Phrase"),("indice di massa corporea","Phrase"),
    ("calcolo indice di massa corporea","Phrase"),("calcolo bmi","Exact")],
   ["Calcolo BMI Gratuito","Calcola il tuo BMI Ora","Indice di Massa Corporea","BMI in kg e cm",
    "Senza Registrazione","Il tuo Peso Ideale","Scala OMS e Asiatica","Salva lo Storico BMI",
    "Calcolatore BMI Online","Risultato in Pochi Secondi"],
   ["Calcola il tuo indice di massa corporea gratis. Peso sano e categoria OMS.",
    "Inserisci peso e altezza e vedi subito il tuo BMI. Funziona in kg/cm e lb/piedi.",
    "Segui il tuo BMI nel tempo con un grafico. Senza registrazione e senza download."]),
 "tr": ("BMI - Türkçe", "https://mes.fm/vucut-kitle-indeksi", "vki", "hesaplama",
   [("vücut kitle indeksi","Phrase"),("vücut kitle indeksi hesaplama","Phrase"),("vki hesaplama","Phrase"),
    ("vücut kitle endeksi","Phrase"),("beden kitle indeksi","Phrase"),("vücut kitle indeksi hesaplama","Exact")],
   ["Vücut Kitle İndeksi Hesapla","VKİ Hesaplama Ücretsiz","Hemen VKİ Hesaplayın","VKİ: kg ve cm",
    "Kayıt Yok, Tamamen Ücretsiz","Sağlıklı Kilo Aralığınız","DSÖ ve Asya Ölçeği","VKİ Geçmişinizi Kaydedin",
    "Online VKİ Hesaplayıcı","Saniyeler İçinde Sonuç"],
   ["Vücut kitle indeksinizi ücretsiz hesaplayın. Sağlıklı kilo aralığı ve DSÖ kategorisi.",
    "Kilo ve boyunuzu girin, VKİ sonucunuzu hemen görün. kg/cm veya lb/feet ile çalışır.",
    "VKİ değerinizi grafikle takip edin. Kayıt yok, indirme yok."]),
 "vi": ("BMI - Tiếng Việt", "https://mes.fm/tinh-chi-so-bmi", "tinh", "bmi",
   [("tính chỉ số bmi","Phrase"),("chỉ số bmi","Phrase"),("cách tính chỉ số bmi","Phrase"),("tính bmi","Phrase"),
    ("chỉ số khối cơ thể","Phrase"),("tính chỉ số bmi","Exact")],
   ["Tính Chỉ Số BMI Miễn Phí","Tính BMI Ngay Lập Tức","Chỉ Số Khối Cơ Thể","BMI Theo kg và cm",
    "Không Cần Đăng Ký","Cân Nặng Khỏe Mạnh","Thang WHO và Châu Á","Lưu Lịch Sử BMI",
    "Máy Tính BMI Online","Kết Quả Trong Vài Giây"],
   ["Tính chỉ số khối cơ thể miễn phí. Mức cân nặng khỏe mạnh và phân loại WHO, châu Á.",
    "Nhập cân nặng và chiều cao, xem chỉ số BMI ngay. Dùng kg/cm hoặc lb/feet.",
    "Theo dõi BMI theo thời gian bằng biểu đồ. Không cần đăng ký, không cần tải về."]),
 "pl": ("BMI - Polski", "https://mes.fm/kalkulator-bmi-pl", "kalkulator", "bmi",
   [("obliczanie bmi","Phrase"),("oblicz bmi","Phrase"),("jak obliczyć bmi","Phrase"),("wskaźnik masy ciała","Phrase"),
    ("kalkulator bmi kobieta","Phrase"),("kalkulator bmi mężczyzna","Phrase"),("bmi kalkulator","Exact")],
   ["Kalkulator BMI Za Darmo","Oblicz BMI w Sekundę","Wskaźnik Masy Ciała","BMI w kg i cm",
    "Bez Rejestracji, Za Darmo","Twoja Zdrowa Waga","Skala WHO i Azjatycka","Zapisz Historię BMI",
    "Kalkulator BMI Online","Wynik Od Razu"],
   ["Oblicz swój wskaźnik masy ciała za darmo. Zakres zdrowej wagi i kategoria WHO.",
    "Wpisz wagę i wzrost, a zobaczysz BMI od razu. Działa w kg/cm i lb/stopach.",
    "Śledź swoje BMI w czasie na wykresie. Bez rejestracji i bez pobierania."]),
 "ar": ("BMI - العربية", "https://mes.fm/hasibat-kutlat-al-jism", "", "",
   [("مؤشر كتلة الجسم","Phrase"),("حساب كتلة الجسم","Phrase"),("حاسبة كتلة الجسم","Phrase"),
    ("حساب مؤشر كتلة الجسم","Phrase"),("حاسبة مؤشر كتلة الجسم","Exact")],
   ["حاسبة مؤشر كتلة الجسم","احسب مؤشر كتلة جسمك","مجانا وبدون تسجيل","النتيجة خلال ثوان",
    "الوزن الصحي لطولك","بالكيلوغرام والسنتيمتر","مقياس منظمة الصحة العالمية","احفظ سجل قياساتك"],
   ["احسب مؤشر كتلة الجسم مجانا واعرف نطاق الوزن الصحي لطولك حسب منظمة الصحة العالمية.",
    "أدخل وزنك وطولك واحصل على النتيجة فورا. بدون تسجيل وبدون تنزيل."]),
 "hi": ("BMI - हिन्दी", "https://mes.fm/bmi-calculator-hindi", "", "",
   [("बीएमआई कैलकुलेटर","Phrase"),("बीएमआई कैसे निकाले","Phrase"),("बॉडी मास इंडेक्स","Phrase"),
    ("बीएमआई चेक","Phrase"),("bmi calculator hindi","Phrase"),("bmi kaise nikale","Phrase")],
   ["बीएमआई कैलकुलेटर मुफ्त","अपना बीएमआई जानें","बॉडी मास इंडेक्स","किलो और सेमी में",
    "बिना रजिस्ट्रेशन, मुफ्त","आपका स्वस्थ वजन","WHO और एशियाई स्केल","तुरंत परिणाम"],
   ["अपना बॉडी मास इंडेक्स मुफ्त में जानें। आपकी लंबाई के लिए स्वस्थ वजन भी देखें।",
    "वजन और लंबाई डालें और तुरंत अपना बीएमआई देखें। कोई रजिस्ट्रेशन नहीं।"]),
}

# Phrase negatives for the existing English campaign, so non-English searches go to the new campaign instead.
FOREIGN_NEG = ["imc","imt","vki","vkı","calculadora","calcular","calculo","cálculo","hitung","menghitung","cek","kira",
  "rechner","berechnen","kalkulator","calcolo","calcola","calcul","calculer","calculatrice","kitle","indeksi","hesaplama",
  "chỉ số","tính","obliczanie","oblicz","masa corporal","massa corporal","masse corporelle","massa corporea","massa tubuh",
  "körper","számítás","kalkulačka","rechner bmi","كتلة","مؤشر","बीएमआई","कैलकुलेटर","kaise","hindi"]

def check():
    errs = []
    for k,(ag,url,p1,p2,kws,hs,ds) in L.items():
        if len(hs) < 3 or len(ds) < 2: errs.append(f"{k}: too few assets")
        for h in hs:
            if len(h) > 30: errs.append(f"{k} headline {len(h)}: {h}")
        for d in ds:
            if len(d) > 90: errs.append(f"{k} desc {len(d)}: {d}")
        for p in (p1,p2):
            if len(p) > 15: errs.append(f"{k} path: {p}")
        if len(set(hs)) != len(hs): errs.append(f"{k}: duplicate headline")
    seen = {}
    for k,(ag,*_r) in L.items():
        for t,m in L[k][4]:
            key=(t.lower(),m)
            if key in seen: errs.append(f"keyword {t} {m} in {seen[key]} and {k}")
            seen[key]=k
    return errs

errs = check()
if errs:
    print("\n".join(errs)); sys.exit(1)

H = ["Customer ID","Campaign","Ad group","Max CPC","Keyword","Criterion Type","Ad type"] + [f"Headline {i}" for i in range(1,16)] \
    + [f"Description {i}" for i in range(1,5)] + ["Final URL","Path 1","Path 2","Status"]
rows = []
def row(**kw):
    r = {h:"" for h in H}; r.update(kw); r["Campaign"]=CAMP; r["Customer ID"]="220-619-6234"; return r
for k,(ag,url,p1,p2,kws,hs,ds) in L.items():
    rows.append(row(**{"Ad group":ag,"Max CPC":BID,"Status":"Enabled"}))
    for t,m in kws:
        rows.append(row(**{"Ad group":ag,"Keyword":t,"Criterion Type":m,"Final URL":"","Status":"Enabled"}))
    ad = {"Ad group":ag,"Ad type":"Responsive search ad","Final URL":url,"Path 1":p1,"Path 2":p2,"Status":"Enabled"}
    for i,h in enumerate(hs,1): ad[f"Headline {i}"]=h
    for i,d in enumerate(ds,1): ad[f"Description {i}"]=d
    rows.append(row(**ad))
with open("bmi-languages-adseditor.csv","w",newline="",encoding="utf-8-sig") as f:
    w=csv.DictWriter(f,H); w.writeheader(); w.writerows(rows)
with open("bmi-world-foreign-negatives.csv","w",newline="",encoding="utf-8-sig") as f:
    w=csv.writer(f); w.writerow(["Customer ID","Campaign","Keyword","Criterion Type"])
    for n in FOREIGN_NEG: w.writerow(["220-619-6234","BMI World (No US) Desktop",n,"Negative phrase"])
print(f"ok: {len(L)} ad groups, {sum(len(v[4]) for v in L.values())} keywords, {len(rows)} rows; {len(FOREIGN_NEG)} negatives")
for k,v in L.items(): print(k, v[1])
