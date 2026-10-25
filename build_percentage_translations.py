#!/usr/bin/env python3
"""Percentage Calculator in 5 more languages (2026-10-24): es /calculadora-de-porcentaje, pt-BR /calculadora-de-porcentagem,
id /kalkulator-persen, fr /calcul-pourcentage, de /prozentrechner.

Each page is generated from the English page mes.fm/percentagecalculator/index.html (the source of truth: never hand-edit the
generated pages, re-run this after changing the English one). Per language it swaps in the head (title, descriptions, canonical,
og:url, og:locale, JSON-LD), the header title + tagline, h1 + intro, the 10 calculation sentences (input order is never changed,
so A and B stay what the script expects), "Answer:" / "Formula:", Share Calculations and the Important Notes box, and sets
window.PC_I18N (toolbar / toast strings + decimal comma + share path) for js/percentagecalculator.js, which looks every visible
string up there. The English-only Android-tester banner is dropped; the "Type it in words" box gets this language's label,
placeholder, examples and messages (ASK table) and calls MESAsk.percent(text, code) (main_js/mes-ask.js reads es / pt / id /
fr / de phrasings, and English too). The site shell (info bar, menu, sidebar, footer, Comments) stays English, as on the translated BMI pages.
All six pages get hreflang links (x-default = English) and a language switcher under the intro (marker PC-LANGS).
The page keeps <base href="/percentagecalculator/">, so its images / script / css load from the English folder.

Dry-runs by default; --apply writes. Idempotent.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SITE = ROOT / "mes.fm"
SRC = SITE / "percentagecalculator" / "index.html"
APPLY = "--apply" in sys.argv

LANGS = {
"es": dict(
    slug="calculadora-de-porcentaje", lang="es", locale="es_ES", label="Español", dec=",",
    title="Calculadora de Porcentajes", doc_title="Calculadora de Porcentajes Gratis | MES",
    desc="Calculadora de porcentajes gratis: calcula el porcentaje de un número, aumentos y descuentos, la variación y la diferencia porcentual, fracciones y proporciones.",
    brand="Calculadora de Porcentajes de MES", tag="Calcula aumentos y descuentos, proporciones, fracciones y más",
    intro="Nuestra calculadora de porcentajes gratis calcula porcentajes de todo tipo: proporciones, fracciones, estadísticas, aumentos o disminuciones porcentuales y diferencias porcentuales.",
    intro2="¡Los resultados y las fórmulas (pulsa el botón «?») se calculan automáticamente mientras escribes! Puedes escribir los decimales con coma (12,5) o con punto (12.5).",
    learn='Aprende lo básico de los porcentajes: <a class="link" href="/percentagecalculator/how-do-you-calculate-percentages">How to Calculate Percentages</a> (en inglés)',
    share="Compartir cálculos", answer="Resultado:", formula="Fórmula:",
    eq={1: "¿{A} es qué porcentaje de {B}?", 2: "¿Cuánto es el {A} % de {B}?", 3: "¿{A} es el {B} % de qué número?",
        4: "¿Aumento/disminución de {A} a {B}?", 5: "¿Diferencia porcentual entre {A} y {B}?", 6: "Porcentaje de la fracción mixta:",
        7: "¿{A} x {B} %?", 8: "¿{A} / {B} %?", 9: "Aumentar {A} en un {B} %", 10: "Disminuir {A} en un {B} %"},
    notes_btn="Notas importantes sobre nuestra calculadora",
    notes="""<h2 class="header2 header2--top">Cómo calcular un porcentaje</h2>
		<p class="sentence">Para saber qué porcentaje es un número de otro, divide el primero entre el segundo y multiplica por 100: 15 de 60 es 15 / 60 × 100 = 25 %. Para calcular el porcentaje de un número, multiplica el número por el porcentaje y divide entre 100: el 20 % de 80 es 80 × 20 / 100 = 16.</p>
		<h3 class="header3">Aumentos, descuentos y variación porcentual</h3>
		<p class="sentence">Para aplicar un descuento del 15 % a 40 €, calcula 40 × (1 − 15 / 100) = 34 €. Para subir un precio un 10 %, multiplica por 1,10. La variación porcentual de A a B es (B − A) / A × 100: de 50 a 65 hay un aumento del 30 %.</p>
		<h2 class="header2">Ahorra tiempo con el teclado</h2>
		<p class="sentence">Los resultados se calculan mientras escribes. En un ordenador puedes pasar a la siguiente casilla con la tecla «Tab» y volver a la anterior con «Mayús + Tab», sin usar el ratón. Pulsa un resultado para copiarlo.</p>
		<h2 class="header2">Notación científica</h2>
		<p class="sentence">Si el resultado es muy pequeño o muy grande, puede aparecer en notación científica para que quepa en la casilla: un número multiplicado por 10 elevado a una potencia negativa (números pequeños) o positiva (números grandes). Por ejemplo, 0,000027 = 2,7x10<sup>-5</sup> y 270000 = 2,7x10<sup>5</sup>.</p>
		<h2 class="header2">Fórmulas de los cálculos</h2>
		<p class="sentence">Pulsa el signo de interrogación, <span class="button-icon button-icon--off">?</span>, junto a cada cálculo para ver su fórmula con tus números. Con el botón «+» añades otra fila al mismo cálculo, y «Etiquetas» y «Guardar» te permiten nombrar y guardar tus cálculos en este navegador.</p>""",
    js={"Copy failed": "No se pudo copiar", "Shared calculations loaded": "Cálculos compartidos cargados", "Hide labels": "Ocultar etiquetas",
        "Labels": "Etiquetas", "Open '{n}'": "Abrir «{n}»", "Opened '{n}'": "«{n}» abierto", "Delete '{n}'": "Borrar «{n}»",
        "Delete saved calculation {n}": "Borrar el cálculo guardado {n}", "Deleted '{n}' (click here to undo)": "«{n}» borrado (pulsa aquí para deshacer)",
        "Type some numbers into a calculation first, then press Save": "Primero escribe algunos números en un cálculo y luego pulsa Guardar",
        "Name this saved calculation (up to 20 characters):": "Nombre para este cálculo (hasta 20 caracteres):",
        "Replace the existing '{n}'?": "¿Reemplazar «{n}»?", "Saved '{n}'": "«{n}» guardado", "Cleared": "Todo borrado",
        "Remove this row": "Quitar esta fila", "Copied {n}": "Copiado: {n}", "Update Calculations": "Actualizar cálculos", "Link copied": "Enlace copiado",
        "Click to copy": "Pulsa para copiar", "Percentage of the mixed fraction": "Porcentaje de la fracción mixta", "Drag to reorder": "Arrastra para reordenar",
        "Reorder this calculation: drag, or use the up and down arrow keys": "Reordena este cálculo: arrástralo o usa las flechas arriba y abajo",
        "Expand: {n}": "Mostrar: {n}", "Expand": "Mostrar", "Collapse": "Plegar", "Expand this calculation": "Mostrar este cálculo",
        "Collapse this calculation": "Plegar este cálculo", "Expand all": "Mostrar todo", "Collapse all": "Plegar todo",
        "Empty every calculation": "Vaciar todos los cálculos", "Clear all": "Borrar todo", "Custom layout": "Personalizar orden",
        "Reset layout": "Orden original", "Hide icons": "Ocultar iconos", "Label: e.g. Personal taxes, Business, Discount": "Etiqueta: p. ej. Impuestos, Negocio, Descuento",
        "Label for calculation {n}": "Etiqueta del cálculo {n}", "Keep the current numbers under a name": "Guarda los números actuales con un nombre",
        "Save": "Guardar", "Saved calculations": "Cálculos guardados"},
),
"pt": dict(
    slug="calculadora-de-porcentagem", lang="pt-BR", locale="pt_BR", label="Português", dec=",",
    title="Calculadora de Porcentagem", doc_title="Calculadora de Porcentagem Grátis | MES",
    desc="Calculadora de porcentagem grátis: calcule a porcentagem de um número, aumentos e descontos, a variação e a diferença percentual, frações e proporções.",
    brand="Calculadora de Porcentagem da MES", tag="Calcule aumentos e descontos, proporções, frações e mais",
    intro="Nossa calculadora de porcentagem grátis calcula porcentagens de todo tipo: proporções, frações, estatísticas, aumentos ou reduções percentuais e diferenças percentuais.",
    intro2="Os resultados e as fórmulas (toque no botão “?”) são calculados automaticamente enquanto você digita! Você pode digitar os decimais com vírgula (12,5) ou com ponto (12.5).",
    learn='Aprenda o básico das porcentagens: <a class="link" href="/percentagecalculator/how-do-you-calculate-percentages">How to Calculate Percentages</a> (em inglês)',
    share="Compartilhar cálculos", answer="Resultado:", formula="Fórmula:",
    eq={1: "{A} é quantos por cento de {B}?", 2: "Quanto é {A} % de {B}?", 3: "{A} é {B} % de quanto?",
        4: "Aumento/redução de {A} para {B}?", 5: "Diferença percentual entre {A} e {B}?", 6: "Porcentagem da fração mista:",
        7: "{A} x {B} %?", 8: "{A} / {B} %?", 9: "Aumentar {A} em {B} %", 10: "Diminuir {A} em {B} %"},
    notes_btn="Notas importantes sobre a nossa calculadora",
    notes="""<h2 class="header2 header2--top">Como calcular porcentagem</h2>
		<p class="sentence">Para saber quantos por cento um número é de outro, divida o primeiro pelo segundo e multiplique por 100: 15 de 60 é 15 / 60 × 100 = 25 %. Para calcular a porcentagem de um número, multiplique o número pela porcentagem e divida por 100: 20 % de 80 é 80 × 20 / 100 = 16.</p>
		<h3 class="header3">Aumentos, descontos e variação percentual</h3>
		<p class="sentence">Para dar um desconto de 15 % em R$ 40, calcule 40 × (1 − 15 / 100) = R$ 34. Para aumentar um preço em 10 %, multiplique por 1,10. A variação percentual de A para B é (B − A) / A × 100: de 50 para 65 há um aumento de 30 %.</p>
		<h2 class="header2">Economize tempo com o teclado</h2>
		<p class="sentence">Os resultados são calculados enquanto você digita. No computador, passe para o próximo campo com a tecla “Tab” e volte com “Shift + Tab”, sem usar o mouse. Clique em um resultado para copiá-lo.</p>
		<h2 class="header2">Notação científica</h2>
		<p class="sentence">Se o resultado for muito pequeno ou muito grande, ele pode aparecer em notação científica para caber no campo: um número multiplicado por 10 elevado a uma potência negativa (números pequenos) ou positiva (números grandes). Por exemplo, 0,000027 = 2,7x10<sup>-5</sup> e 270000 = 2,7x10<sup>5</sup>.</p>
		<h2 class="header2">Fórmulas dos cálculos</h2>
		<p class="sentence">Clique no ponto de interrogação, <span class="button-icon button-icon--off">?</span>, ao lado de cada cálculo para ver a fórmula com os seus números. O botão “+” adiciona outra linha ao mesmo cálculo, e “Rótulos” e “Salvar” permitem dar nome e guardar seus cálculos neste navegador.</p>""",
    js={"Copy failed": "Não foi possível copiar", "Shared calculations loaded": "Cálculos compartilhados carregados", "Hide labels": "Ocultar rótulos",
        "Labels": "Rótulos", "Open '{n}'": "Abrir “{n}”", "Opened '{n}'": "“{n}” aberto", "Delete '{n}'": "Excluir “{n}”",
        "Delete saved calculation {n}": "Excluir o cálculo salvo {n}", "Deleted '{n}' (click here to undo)": "“{n}” excluído (clique aqui para desfazer)",
        "Type some numbers into a calculation first, then press Save": "Primeiro digite alguns números em um cálculo e depois clique em Salvar",
        "Name this saved calculation (up to 20 characters):": "Nome para este cálculo (até 20 caracteres):",
        "Replace the existing '{n}'?": "Substituir “{n}”?", "Saved '{n}'": "“{n}” salvo", "Cleared": "Tudo apagado",
        "Remove this row": "Remover esta linha", "Copied {n}": "Copiado: {n}", "Update Calculations": "Atualizar cálculos", "Link copied": "Link copiado",
        "Click to copy": "Clique para copiar", "Percentage of the mixed fraction": "Porcentagem da fração mista", "Drag to reorder": "Arraste para reordenar",
        "Reorder this calculation: drag, or use the up and down arrow keys": "Reordene este cálculo: arraste ou use as setas para cima e para baixo",
        "Expand: {n}": "Mostrar: {n}", "Expand": "Mostrar", "Collapse": "Recolher", "Expand this calculation": "Mostrar este cálculo",
        "Collapse this calculation": "Recolher este cálculo", "Expand all": "Mostrar tudo", "Collapse all": "Recolher tudo",
        "Empty every calculation": "Esvaziar todos os cálculos", "Clear all": "Limpar tudo", "Custom layout": "Personalizar ordem",
        "Reset layout": "Ordem original", "Hide icons": "Ocultar ícones", "Label: e.g. Personal taxes, Business, Discount": "Rótulo: ex. Impostos, Empresa, Desconto",
        "Label for calculation {n}": "Rótulo do cálculo {n}", "Keep the current numbers under a name": "Guarde os números atuais com um nome",
        "Save": "Salvar", "Saved calculations": "Cálculos salvos"},
),
"id": dict(
    slug="kalkulator-persen", lang="id", locale="id_ID", label="Bahasa Indonesia", dec=",",
    title="Kalkulator Persen", doc_title="Kalkulator Persen Online Gratis | MES",
    desc="Kalkulator persen gratis: hitung persen dari suatu angka, kenaikan dan diskon, perubahan dan selisih persentase, pecahan, dan perbandingan dengan mudah.",
    brand="Kalkulator Persen dari MES", tag="Hitung kenaikan dan diskon, perbandingan, pecahan, dan lainnya",
    intro="Kalkulator persen online gratis kami menghitung segala jenis persentase: perbandingan, pecahan, statistik, kenaikan atau penurunan persen, dan selisih persentase.",
    intro2="Hasil dan rumusnya (tekan tombol “?”) dihitung otomatis saat Anda mengetik! Desimal boleh ditulis dengan koma (12,5) atau titik (12.5).",
    learn='Pelajari dasar-dasar persen: <a class="link" href="/percentagecalculator/how-do-you-calculate-percentages">How to Calculate Percentages</a> (bahasa Inggris)',
    share="Bagikan perhitungan", answer="Hasil:", formula="Rumus:",
    eq={1: "{A} adalah berapa persen dari {B}?", 2: "Berapa {A} % dari {B}?", 3: "{A} adalah {B} % dari berapa?",
        4: "Kenaikan/penurunan dari {A} ke {B}?", 5: "Selisih persentase antara {A} dan {B}?", 6: "Persentase pecahan campuran:",
        7: "{A} x {B} %?", 8: "{A} / {B} %?", 9: "Naikkan {A} sebesar {B} %", 10: "Turunkan {A} sebesar {B} %"},
    notes_btn="Catatan penting tentang kalkulator kami",
    notes="""<h2 class="header2 header2--top">Cara menghitung persen</h2>
		<p class="sentence">Untuk mengetahui berapa persen suatu angka dari angka lain, bagi angka pertama dengan angka kedua lalu kalikan 100: 15 dari 60 adalah 15 / 60 × 100 = 25 %. Untuk menghitung persen dari suatu angka, kalikan angka itu dengan persennya lalu bagi 100: 20 % dari 80 adalah 80 × 20 / 100 = 16.</p>
		<h3 class="header3">Kenaikan, diskon, dan perubahan persen</h3>
		<p class="sentence">Untuk diskon 15 % dari Rp 40.000, hitung 40.000 × (1 − 15 / 100) = Rp 34.000. Untuk menaikkan harga 10 %, kalikan dengan 1,10. Perubahan persen dari A ke B adalah (B − A) / A × 100: dari 50 ke 65 naik 30 %.</p>
		<h2 class="header2">Hemat waktu dengan keyboard</h2>
		<p class="sentence">Hasil dihitung saat Anda mengetik. Di komputer, pindah ke kotak berikutnya dengan tombol “Tab” dan kembali dengan “Shift + Tab”, tanpa mouse. Klik sebuah hasil untuk menyalinnya.</p>
		<h2 class="header2">Notasi ilmiah</h2>
		<p class="sentence">Jika hasilnya sangat kecil atau sangat besar, hasil bisa tampil dalam notasi ilmiah agar muat di kotak: sebuah angka dikalikan 10 pangkat negatif (angka kecil) atau pangkat positif (angka besar). Contohnya, 0,000027 = 2,7x10<sup>-5</sup> dan 270000 = 2,7x10<sup>5</sup>.</p>
		<h2 class="header2">Rumus perhitungan</h2>
		<p class="sentence">Klik tanda tanya, <span class="button-icon button-icon--off">?</span>, di samping setiap perhitungan untuk melihat rumusnya dengan angka Anda. Tombol “+” menambah baris baru pada perhitungan yang sama, sedangkan “Label” dan “Simpan” memungkinkan Anda memberi nama dan menyimpan perhitungan di browser ini.</p>""",
    js={"Copy failed": "Gagal menyalin", "Shared calculations loaded": "Perhitungan yang dibagikan sudah dimuat", "Hide labels": "Sembunyikan label",
        "Labels": "Label", "Open '{n}'": "Buka “{n}”", "Opened '{n}'": "“{n}” dibuka", "Delete '{n}'": "Hapus “{n}”",
        "Delete saved calculation {n}": "Hapus perhitungan tersimpan {n}", "Deleted '{n}' (click here to undo)": "“{n}” dihapus (klik di sini untuk membatalkan)",
        "Type some numbers into a calculation first, then press Save": "Ketik beberapa angka di sebuah perhitungan dulu, lalu tekan Simpan",
        "Name this saved calculation (up to 20 characters):": "Nama untuk perhitungan ini (maks. 20 karakter):",
        "Replace the existing '{n}'?": "Ganti “{n}”?", "Saved '{n}'": "“{n}” disimpan", "Cleared": "Semua dikosongkan",
        "Remove this row": "Hapus baris ini", "Copied {n}": "Disalin: {n}", "Update Calculations": "Perbarui perhitungan", "Link copied": "Tautan disalin",
        "Click to copy": "Klik untuk menyalin", "Percentage of the mixed fraction": "Persentase pecahan campuran", "Drag to reorder": "Seret untuk mengurutkan",
        "Reorder this calculation: drag, or use the up and down arrow keys": "Urutkan perhitungan ini: seret, atau gunakan tombol panah atas dan bawah",
        "Expand: {n}": "Tampilkan: {n}", "Expand": "Tampilkan", "Collapse": "Lipat", "Expand this calculation": "Tampilkan perhitungan ini",
        "Collapse this calculation": "Lipat perhitungan ini", "Expand all": "Tampilkan semua", "Collapse all": "Lipat semua",
        "Empty every calculation": "Kosongkan semua perhitungan", "Clear all": "Hapus semua", "Custom layout": "Atur urutan",
        "Reset layout": "Urutan awal", "Hide icons": "Sembunyikan ikon", "Label: e.g. Personal taxes, Business, Discount": "Label: mis. Pajak, Usaha, Diskon",
        "Label for calculation {n}": "Label untuk perhitungan {n}", "Keep the current numbers under a name": "Simpan angka saat ini dengan sebuah nama",
        "Save": "Simpan", "Saved calculations": "Perhitungan tersimpan"},
),
"fr": dict(
    slug="calcul-pourcentage", lang="fr", locale="fr_FR", label="Français", dec=",",
    title="Calcul de Pourcentage", doc_title="Calcul de Pourcentage en Ligne Gratuit | MES",
    desc="Calculatrice de pourcentage gratuite : pourcentage d'un nombre, hausse et remise, taux d'évolution, écart en pourcentage, fractions et proportions.",
    brand="Calcul de Pourcentage par MES", tag="Calculez hausses et remises, proportions, fractions et plus",
    intro="Notre calculatrice de pourcentage gratuite calcule toutes sortes de pourcentages : proportions, fractions, statistiques, hausses ou baisses en pourcentage et écarts en pourcentage.",
    intro2="Les résultats et les formules (cliquez sur le bouton « ? ») se calculent automatiquement pendant la saisie ! Vous pouvez écrire les décimales avec une virgule (12,5) ou un point (12.5).",
    learn='Les bases des pourcentages : <a class="link" href="/percentagecalculator/how-do-you-calculate-percentages">How to Calculate Percentages</a> (en anglais)',
    share="Partager les calculs", answer="Résultat :", formula="Formule :",
    eq={1: "{A} représente quel pourcentage de {B} ?", 2: "Combien font {A} % de {B} ?", 3: "{A} représente {B} % de quel nombre ?",
        4: "Évolution de {A} à {B} ?", 5: "Écart en pourcentage entre {A} et {B} ?", 6: "Pourcentage de la fraction mixte :",
        7: "{A} x {B} % ?", 8: "{A} / {B} % ?", 9: "Augmenter {A} de {B} %", 10: "Diminuer {A} de {B} %"},
    notes_btn="Notes importantes sur notre calculatrice",
    notes="""<h2 class="header2 header2--top">Comment calculer un pourcentage</h2>
		<p class="sentence">Pour savoir quel pourcentage un nombre représente d'un autre, divisez le premier par le second puis multipliez par 100 : 15 sur 60 font 15 / 60 × 100 = 25 %. Pour calculer le pourcentage d'un nombre, multipliez ce nombre par le pourcentage puis divisez par 100 : 20 % de 80 font 80 × 20 / 100 = 16.</p>
		<h3 class="header3">Hausses, remises et taux d'évolution</h3>
		<p class="sentence">Pour une remise de 15 % sur 40 €, calculez 40 × (1 − 15 / 100) = 34 €. Pour augmenter un prix de 10 %, multipliez-le par 1,10. Le taux d'évolution de A à B est (B − A) / A × 100 : de 50 à 65, la hausse est de 30 %.</p>
		<h2 class="header2">Gagnez du temps avec le clavier</h2>
		<p class="sentence">Les résultats se calculent pendant la saisie. Sur ordinateur, passez à la case suivante avec la touche « Tab » et revenez à la précédente avec « Maj + Tab », sans la souris. Cliquez sur un résultat pour le copier.</p>
		<h2 class="header2">Notation scientifique</h2>
		<p class="sentence">Si le résultat est très petit ou très grand, il peut s'afficher en notation scientifique pour tenir dans la case : un nombre multiplié par 10 à une puissance négative (petits nombres) ou positive (grands nombres). Par exemple, 0,000027 = 2,7x10<sup>-5</sup> et 270000 = 2,7x10<sup>5</sup>.</p>
		<h2 class="header2">Formules des calculs</h2>
		<p class="sentence">Cliquez sur le point d'interrogation, <span class="button-icon button-icon--off">?</span>, à côté de chaque calcul pour voir sa formule avec vos nombres. Le bouton « + » ajoute une ligne au même calcul, et « Étiquettes » et « Enregistrer » permettent de nommer et de garder vos calculs dans ce navigateur.</p>""",
    js={"Copy failed": "Échec de la copie", "Shared calculations loaded": "Calculs partagés chargés", "Hide labels": "Masquer les étiquettes",
        "Labels": "Étiquettes", "Open '{n}'": "Ouvrir « {n} »", "Opened '{n}'": "« {n} » ouvert", "Delete '{n}'": "Supprimer « {n} »",
        "Delete saved calculation {n}": "Supprimer le calcul enregistré {n}", "Deleted '{n}' (click here to undo)": "« {n} » supprimé (cliquez ici pour annuler)",
        "Type some numbers into a calculation first, then press Save": "Saisissez d'abord des nombres dans un calcul, puis cliquez sur Enregistrer",
        "Name this saved calculation (up to 20 characters):": "Nom de ce calcul (20 caractères maximum) :",
        "Replace the existing '{n}'?": "Remplacer « {n} » ?", "Saved '{n}'": "« {n} » enregistré", "Cleared": "Tout est effacé",
        "Remove this row": "Supprimer cette ligne", "Copied {n}": "Copié : {n}", "Update Calculations": "Mettre à jour", "Link copied": "Lien copié",
        "Click to copy": "Cliquez pour copier", "Percentage of the mixed fraction": "Pourcentage de la fraction mixte", "Drag to reorder": "Faites glisser pour réordonner",
        "Reorder this calculation: drag, or use the up and down arrow keys": "Réordonnez ce calcul : faites-le glisser ou utilisez les flèches haut et bas",
        "Expand: {n}": "Afficher : {n}", "Expand": "Afficher", "Collapse": "Replier", "Expand this calculation": "Afficher ce calcul",
        "Collapse this calculation": "Replier ce calcul", "Expand all": "Tout afficher", "Collapse all": "Tout replier",
        "Empty every calculation": "Vider tous les calculs", "Clear all": "Tout effacer", "Custom layout": "Personnaliser l'ordre",
        "Reset layout": "Ordre d'origine", "Hide icons": "Masquer les icônes", "Label: e.g. Personal taxes, Business, Discount": "Étiquette : ex. Impôts, Entreprise, Remise",
        "Label for calculation {n}": "Étiquette du calcul {n}", "Keep the current numbers under a name": "Garder les nombres actuels sous un nom",
        "Save": "Enregistrer", "Saved calculations": "Calculs enregistrés"},
),
"de": dict(
    slug="prozentrechner", lang="de", locale="de_DE", label="Deutsch", dec=",",
    title="Prozentrechner", doc_title="Prozentrechner Online Kostenlos | MES",
    desc="Kostenloser Prozentrechner: Prozent von einer Zahl, Aufschlag und Rabatt, prozentuale Veränderung und Differenz, Brüche und Verhältnisse einfach berechnen.",
    brand="Prozentrechner von MES", tag="Aufschläge und Rabatte, Verhältnisse, Brüche und mehr berechnen",
    intro="Unser kostenloser Prozentrechner berechnet Prozente aller Art: Verhältnisse, Brüche, Statistiken, prozentuale Zu- oder Abnahme und prozentuale Unterschiede.",
    intro2="Ergebnisse und Formeln (klicken Sie auf „?“) werden schon beim Tippen berechnet! Dezimalzahlen können Sie mit Komma (12,5) oder Punkt (12.5) eingeben.",
    learn='Grundlagen der Prozentrechnung: <a class="link" href="/percentagecalculator/how-do-you-calculate-percentages">How to Calculate Percentages</a> (auf Englisch)',
    share="Rechnungen teilen", answer="Ergebnis:", formula="Formel:",
    eq={1: "{A} sind wie viel Prozent von {B}?", 2: "Wie viel sind {A} % von {B}?", 3: "{A} sind {B} % von wie viel?",
        4: "Veränderung von {A} auf {B}?", 5: "Prozentualer Unterschied zwischen {A} und {B}?", 6: "Prozent des gemischten Bruchs:",
        7: "{A} x {B} %?", 8: "{A} / {B} %?", 9: "{A} um {B} % erhöhen", 10: "{A} um {B} % verringern"},
    notes_btn="Wichtige Hinweise zu unserem Prozentrechner",
    notes="""<h2 class="header2 header2--top">So berechnen Sie Prozente</h2>
		<p class="sentence">Wie viel Prozent eine Zahl von einer anderen ist: die erste durch die zweite teilen und mit 100 multiplizieren, also 15 von 60 = 15 / 60 × 100 = 25 %. Prozent von einer Zahl: die Zahl mit dem Prozentsatz multiplizieren und durch 100 teilen, also 20 % von 80 = 80 × 20 / 100 = 16.</p>
		<h3 class="header3">Aufschlag, Rabatt und prozentuale Veränderung</h3>
		<p class="sentence">Für 15 % Rabatt auf 40 € rechnen Sie 40 × (1 − 15 / 100) = 34 €. Um einen Preis um 10 % zu erhöhen, multiplizieren Sie ihn mit 1,10. Die prozentuale Veränderung von A nach B ist (B − A) / A × 100: von 50 auf 65 sind es 30 % mehr.</p>
		<h2 class="header2">Zeit sparen mit der Tastatur</h2>
		<p class="sentence">Die Ergebnisse erscheinen schon beim Tippen. Am Computer springen Sie mit der „Tab“-Taste zum nächsten Feld und mit „Umschalt + Tab“ zurück, ganz ohne Maus. Klicken Sie auf ein Ergebnis, um es zu kopieren.</p>
		<h2 class="header2">Wissenschaftliche Schreibweise</h2>
		<p class="sentence">Sehr kleine oder sehr große Ergebnisse erscheinen eventuell in wissenschaftlicher Schreibweise, damit sie ins Feld passen: eine Zahl mal 10 hoch einer negativen (kleine Zahlen) oder positiven Zahl (große Zahlen). Zum Beispiel 0,000027 = 2,7x10<sup>-5</sup> und 270000 = 2,7x10<sup>5</sup>.</p>
		<h2 class="header2">Formeln der Rechnungen</h2>
		<p class="sentence">Klicken Sie auf das Fragezeichen, <span class="button-icon button-icon--off">?</span>, neben jeder Rechnung, um die Formel mit Ihren Zahlen zu sehen. Mit „+“ fügen Sie derselben Rechnung eine Zeile hinzu, und mit „Beschriftungen“ und „Speichern“ benennen und speichern Sie Ihre Rechnungen in diesem Browser.</p>""",
    js={"Copy failed": "Kopieren fehlgeschlagen", "Shared calculations loaded": "Geteilte Rechnungen geladen", "Hide labels": "Beschriftungen ausblenden",
        "Labels": "Beschriftungen", "Open '{n}'": "„{n}“ öffnen", "Opened '{n}'": "„{n}“ geöffnet", "Delete '{n}'": "„{n}“ löschen",
        "Delete saved calculation {n}": "Gespeicherte Rechnung {n} löschen", "Deleted '{n}' (click here to undo)": "„{n}“ gelöscht (hier klicken zum Rückgängigmachen)",
        "Type some numbers into a calculation first, then press Save": "Geben Sie zuerst Zahlen in eine Rechnung ein und klicken Sie dann auf Speichern",
        "Name this saved calculation (up to 20 characters):": "Name für diese Rechnung (bis zu 20 Zeichen):",
        "Replace the existing '{n}'?": "„{n}“ ersetzen?", "Saved '{n}'": "„{n}“ gespeichert", "Cleared": "Alles gelöscht",
        "Remove this row": "Diese Zeile entfernen", "Copied {n}": "Kopiert: {n}", "Update Calculations": "Rechnungen aktualisieren", "Link copied": "Link kopiert",
        "Click to copy": "Zum Kopieren klicken", "Percentage of the mixed fraction": "Prozent des gemischten Bruchs", "Drag to reorder": "Zum Sortieren ziehen",
        "Reorder this calculation: drag, or use the up and down arrow keys": "Rechnung verschieben: ziehen oder die Pfeiltasten nach oben und unten verwenden",
        "Expand: {n}": "Aufklappen: {n}", "Expand": "Aufklappen", "Collapse": "Zuklappen", "Expand this calculation": "Diese Rechnung aufklappen",
        "Collapse this calculation": "Diese Rechnung zuklappen", "Expand all": "Alle aufklappen", "Collapse all": "Alle zuklappen",
        "Empty every calculation": "Alle Rechnungen leeren", "Clear all": "Alles löschen", "Custom layout": "Reihenfolge ändern",
        "Reset layout": "Ursprüngliche Reihenfolge", "Hide icons": "Symbole ausblenden", "Label: e.g. Personal taxes, Business, Discount": "Beschriftung: z. B. Steuern, Firma, Rabatt",
        "Label for calculation {n}": "Beschriftung für Rechnung {n}", "Keep the current numbers under a name": "Aktuelle Zahlen unter einem Namen speichern",
        "Save": "Speichern", "Saved calculations": "Gespeicherte Rechnungen"},
),
}
# "Type it in words" box per language (2026-10-24): main_js/mes-ask.js reads these phrasings with MESAsk.percent(text, code)
# (English phrasings work too). Every example here is checked in tool_apps_src/mes-ask-tests.js: keep the two in step.
ASK = {
"es": dict(label="Escríbelo con palabras", button="Rellenar",
    placeholder="p. ej. cuánto es el 15 % de 80, 20 es qué porcentaje de 80, aumentar 80 en un 15 %",
    examples=["cuánto es el 15 % de 80", "20 es qué porcentaje de 80", "15 es el 30 % de qué número", "variación porcentual de 50 a 75", "aumentar 80 en un 15 %", "20 % de descuento en 60"],
    unsure="No sé qué cálculo es. Prueba:", filled="Rellenado <b>{name}</b> con {a} y {b}", answer=": resultado <b>{ans}</b>"),
"pt": dict(label="Escreva com palavras", button="Preencher",
    placeholder="ex. quanto é 15% de 80, 20 é quantos por cento de 80, aumentar 80 em 15%",
    examples=["quanto é 15% de 80", "20 é quantos por cento de 80", "15 é 30% de quanto", "variação percentual de 50 para 75", "aumentar 80 em 15%", "20% de desconto em 60"],
    unsure="Não sei qual é esse cálculo. Tente:", filled="Preenchido <b>{name}</b> com {a} e {b}", answer=": resultado <b>{ans}</b>"),
"id": dict(label="Ketik dengan kata-kata", button="Isi",
    placeholder="mis. berapa 15% dari 80, 20 adalah berapa persen dari 80, naikkan 80 sebesar 15%",
    examples=["berapa 15% dari 80", "20 adalah berapa persen dari 80", "15 adalah 30% dari berapa", "kenaikan dari 50 menjadi 75", "naikkan 80 sebesar 15%", "diskon 20% dari 60"],
    unsure="Belum jelas perhitungan yang mana. Coba:", filled="Terisi <b>{name}</b> dengan {a} dan {b}", answer=": hasil <b>{ans}</b>"),
"fr": dict(label="Écrivez votre calcul en mots", button="Remplir",
    placeholder="ex. combien font 15 % de 80, 20 représente quel pourcentage de 80, augmenter 80 de 15 %",
    examples=["combien font 15 % de 80", "20 représente quel pourcentage de 80", "15 représente 30 % de quel nombre", "évolution de 50 à 75", "augmenter 80 de 15 %", "remise de 20 % sur 60"],
    unsure="Je ne reconnais pas ce calcul. Essayez :", filled="Calcul rempli : <b>{name}</b> avec {a} et {b}", answer=" : résultat <b>{ans}</b>"),
"de": dict(label="In Worten eingeben", button="Ausfüllen",
    placeholder="z. B. wie viel sind 15 % von 80, 20 sind wie viel Prozent von 80, 80 um 15 % erhöhen",
    examples=["wie viel sind 15 % von 80", "20 sind wie viel Prozent von 80", "15 sind 30 % von wie viel", "Veränderung von 50 auf 75", "80 um 15 % erhöhen", "20 % Rabatt auf 60"],
    unsure="Diese Rechnung kenne ich nicht. Versuchen Sie:", filled="Ausgefüllt: <b>{name}</b> mit {a} und {b}", answer=": Ergebnis <b>{ans}</b>"),
}

EN = dict(slug="percentagecalculator", lang="en", label="English")
ORDER = ["en", "es", "pt", "id", "fr", "de"]


def esc(s):
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


def head_links(code):
    """hreflang links for every language + the language switcher; identical on all six pages except the current marker."""
    links = ['<link rel="alternate" hreflang="%s" href="https://mes.fm/%s" />' % ((L["lang"] if c != "en" else "en"), L["slug"])
             for c, L in [(c, EN if c == "en" else LANGS[c]) for c in ORDER]]
    links.append('<link rel="alternate" hreflang="x-default" href="https://mes.fm/percentagecalculator" />')
    return "<!-- PC-HREFLANG -->" + "".join(links) + "<!-- /PC-HREFLANG -->"


def switcher(code):
    items = []
    for c in ORDER:
        L = EN if c == "en" else LANGS[c]
        if c == code:
            items.append('<b>%s</b>' % L["label"])
        else:
            items.append('<a class="link" href="/%s" hreflang="%s" lang="%s">%s</a>' % (L["slug"], L["lang"], L["lang"], L["label"]))
    return ('<!-- PC-LANGS --><p class="pc-langs" style="margin:0.6em 0 0;font-size:0.92em;">&#127760; ' + " &middot; ".join(items) + '</p><!-- /PC-LANGS -->')


def put_shared(html, code):
    """hreflang in <head> + switcher after the intro paragraph; replaces earlier copies (idempotent)."""
    html = re.sub(r"<!-- PC-HREFLANG -->.*?<!-- /PC-HREFLANG -->", "", html, flags=re.S)
    html = re.sub(r"<!-- PC-LANGS -->.*?<!-- /PC-LANGS -->", "", html, flags=re.S)
    html = html.replace("</title>", "</title>" + head_links(code), 1)
    i = html.index('<p class="page-description">')
    j = html.index("</p>", i) + len("</p>")
    return html[:j] + switcher(code) + html[j:]


def sentence(tpl, inputs):
    """'¿{A} es qué porcentaje de {B}?' + the two original <input> tags -> spans and inputs in A, B order."""
    out, rest = [], tpl
    for key, inp in zip(("{A}", "{B}"), inputs):
        before, rest = rest.split(key, 1)
        if before:
            out.append("<span>%s</span>" % before.replace(" ", "&nbsp;"))
        out.append(inp)
    if rest:
        out.append("<span>%s</span>" % rest.replace(" ", "&nbsp;"))
    return "".join(out)


def ask_html(code):
    A = ASK[code]
    return ('<!-- PC-ASK: type a question in words, it fills the matching calculation (main_js/mes-ask.js, MESAsk.percent(text, "%s"); hidden where that script is missing) -->\n'
            '\t\t<div class="pc-ask" id="pc-ask" hidden>\n'
            '\t\t\t<label for="pc-ask-in" class="pc-ask__l">%s</label>\n'
            '\t\t\t<div class="pc-ask__row"><input id="pc-ask-in" class="pc-ask__in" type="text" autocomplete="off" spellcheck="false" placeholder="%s" aria-describedby="pc-ask-out"><button type="button" class="pc-ask__go" id="pc-ask-go">%s</button></div>\n'
            '\t\t\t<div class="pc-ask__out" id="pc-ask-out" aria-live="polite"></div>\n'
            '\t\t</div>\n'
            '\t\t<!-- /PC-ASK -->') % (code, esc(A["label"]), esc(A["placeholder"]), esc(A["button"]))


def ask_js(code):
    """The English page's PC-ASK-JS block, with this language's words (and its decimal mark) passed in as data."""
    A, L = ASK[code], LANGS[code]
    names = {n: re.sub(r"^[¿]|\s*[?]$", "", t.replace("{A}", "A").replace("{B}", "B")) for n, t in L["eq"].items() if n != 6}
    cfg = dict(lang=code, dec=L["dec"], names=names, unsure=esc(A["unsure"]) + " " + ", ".join("<b>%s</b>" % esc(e) for e in A["examples"]) + ".",
               filled=A["filled"], answer=A["answer"])
    return ('<!-- PC-ASK-JS --><script src="/main_js/mes-ask.js?v=1" defer></script><script>\n'
            '(function () {\n'
            '\tvar C = %s;\n'
            '\tfunction go() {\n'
            "\t\tvar box = document.getElementById('pc-ask'); if (!box || !window.MESAsk) return; box.hidden = false;\n"
            "\t\tvar inp = document.getElementById('pc-ask-in'), out = document.getElementById('pc-ask-out');\n"
            "\t\tfunction num(v) { return String(v).replace('.', C.dec); }\n"
            "\t\tfunction esc(s) { return String(s).replace(/[&<>]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]; }); }\n"
            '\t\tfunction fill() {\n'
            "\t\t\tvar t = inp.value.trim(); if (!t) { out.textContent = ''; return; }\n"
            '\t\t\tvar r = MESAsk.percent(t, C.lang);\n'
            '\t\t\tif (!r) { out.innerHTML = C.unsure; return; }\n'
            "\t\t\tvar eq = document.getElementById('equation-' + r.eq); if (!eq) return;\n"
            "\t\t\tvar ins = eq.querySelectorAll('.eq-text input.input'); if (ins.length < 2) return;\n"
            "\t\t\t[r.a, r.b].forEach(function (v, i) { ins[i].value = num(v); ins[i].dispatchEvent(new Event('input', {bubbles: true})); ins[i].dispatchEvent(new Event('keyup', {bubbles: true})); ins[i].dispatchEvent(new Event('change', {bubbles: true})); });\n"
            "\t\t\tvar body = eq.closest('.pc-item') || eq; if (body.classList.contains('pc-collapsed')) { var tg = body.querySelector('.pc-toggle'); if (tg) tg.click(); }\n"
            "\t\t\teq.classList.remove('pc-flash'); void eq.offsetWidth; eq.classList.add('pc-flash');\n"
            "\t\t\ttry { eq.scrollIntoView({behavior: 'smooth', block: 'center'}); } catch (e) {}\n"
            "\t\t\tsetTimeout(function () { var a = eq.querySelector('.answer'), ans = a ? a.textContent.trim() : '';\n"
            "\t\t\t\tout.innerHTML = C.filled.replace('{name}', esc(C.names[r.eq])).replace('{a}', num(r.a)).replace('{b}', num(r.b)) + (ans ? C.answer.replace('{ans}', esc(ans)) : '') + '.'; }, 120);\n"
            '\t\t}\n'
            "\t\tdocument.getElementById('pc-ask-go').addEventListener('click', fill);\n"
            "\t\tinp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fill(); } });\n"
            '\t}\n'
            "\tif (document.readyState === 'complete') go(); else window.addEventListener('load', go);\n"
            '})();\n'
            '</script><!-- /PC-ASK-JS -->') % json.dumps(cfg, ensure_ascii=False)


def translate(src, code):
    L = LANGS[code]
    h = src
    def rep(old, new, count=1):
        nonlocal h
        n = h.count(old)
        assert (n >= 1) if count == -1 else (n == count), (code, n, old[:70])
        h = h.replace(old, new)
    url = "https://mes.fm/" + L["slug"]
    title_doc = L["doc_title"]
    rep('<html lang="en">', '<html lang="%s">' % L["lang"])
    rep("<title>Percentage Calculator | Math Easy Solutions</title>", "<title>%s</title>" % esc(title_doc))
    rep('<link rel="canonical" href="https://mes.fm/percentagecalculator" />', '<link rel="canonical" href="%s" />' % url)
    rep('<meta property="og:url" content="https://mes.fm/percentagecalculator" />',
        '<meta property="og:url" content="%s" />        <meta property="og:locale" content="%s" />' % (url, L["locale"]))
    rep('<meta property="og:title" content="Percentage Calculator | Math Easy Solutions" />', '<meta property="og:title" content="%s" />' % esc(title_doc))
    en_desc = "Free percentage calculator: find a percent of a number, percentage increase or decrease, percent change and difference, fractions and ratios."
    rep(en_desc, esc(L["desc"]), -1)
    rep('<meta name="twitter:title" content="Percentage Calculator">', '<meta name="twitter:title" content="%s">' % esc(L["title"]))
    rep('<meta name="twitter:image:alt" content="Percentage Calculator">', '<meta name="twitter:image:alt" content="%s">' % esc(L["title"]))
    rep('"name": "Percentage Calculator", "url": "https://mes.fm/percentagecalculator"',
        '"name": %s, "url": "%s", "inLanguage": "%s"' % (json.dumps(L["title"], ensure_ascii=False), url, L["lang"]))
    # header + intro
    rep('<p class="calculator-title">Percentage Calculator by MES</p>', '<p class="calculator-title">%s</p>' % L["brand"])
    rep('<p class="tag-line">Calculate Percent Increase or Decrease, Ratios, Fractions, and More</p>', '<p class="tag-line">%s</p>' % L["tag"])
    rep('<h1 class="page-title">Percentage Calculator</h1>', '<h1 class="page-title">%s</h1>' % L["title"])
    i = h.index('<p class="page-description">'); j = h.index("</p>", i) + 4
    h = h[:i] + '<p class="page-description">%s<br><br>\n\t\t\t%s<br><br>%s</p>' % (L["intro"], L["intro2"], L["learn"]) + h[j:]
    # English-only blocks
    h = re.sub(r"\s*<!-- ANDROID-TESTERS-BANNER -->.*?<!-- /ANDROID-TESTERS-BANNER -->", "", h, flags=re.S)
    # "Type it in words": this language's box and script in place of the English ones
    a = h.index("<!-- PC-ASK:"); b = h.index("<!-- /PC-ASK -->", a) + len("<!-- /PC-ASK -->")
    h = h[:a] + ask_html(code) + h[b:]
    a = h.index("<!-- PC-ASK-JS -->"); b = h.index("<!-- /PC-ASK-JS -->", a) + len("<!-- /PC-ASK-JS -->")
    h = h[:a] + ask_js(code) + h[b:]
    rep('<div id="share-calc-button" class="button button--share-calc">Share Calculations</div>',
        '<div id="share-calc-button" class="button button--share-calc">%s</div>' % L["share"])
    # the 10 calculations
    for n, tpl in L["eq"].items():
        a = h.index('<div class="equation" id="equation-%d">' % n)
        b = h.index('<div class="equation" id="equation-%d">' % (n + 1)) if n < 10 else h.index('<div class="hide-div-button button selected">Important Notes')
        block = h[a:b]
        if n == 6:
            assert "<span>Percentage of the mixed fraction:&nbsp;</span>" in block
            block = block.replace("<span>Percentage of the mixed fraction:&nbsp;</span>", "<span>%s&nbsp;</span>" % tpl)
            block = block.replace('aria-label="of the mixed fraction"', 'aria-label="%s"' % esc(tpl.rstrip(": ")))
        else:
            x = block.index('<div class="eq-text">')
            y = block.rindex("</div>", x, block.index('<div class="input-container">')) + 6   # the eq-text div ends just before the answer box
            eqtext = block[x:y]
            inputs = re.findall(r"<input [^>]*>", eqtext)
            assert len(inputs) == 2, (code, n, inputs)
            plain = re.sub(r"\{[AB]\}", "…", tpl).replace("  ", " ")
            inputs = [re.sub(r'aria-label="[^"]*"', 'aria-label="%s"' % esc(plain + (" (A)" if k == 0 else " (B)")), inp) for k, inp in enumerate(inputs)]
            new = '<div class="eq-text"><div class="button-icon question-mark-button">?</div>' + sentence(tpl, inputs) + "</div>"
            block = block[:x] + new + block[y:]
        block = block.replace('<span class="text--answer">Answer:&nbsp;</span>', '<span class="text--answer">%s&nbsp;</span>' % L["answer"])
        block = block.replace("<span>Formula:&nbsp;&nbsp;", "<span>%s&nbsp;&nbsp;" % L["formula"])
        h = h[:a] + block + h[b:]
    assert "Answer:&nbsp;" not in h and "Formula:&nbsp;" not in h, code
    # Important Notes box
    a = h.index('<div class="hide-div-button button selected">Important Notes on our Percentage Calculator</div>')
    # the box's own closing </div> is the first </div> after its last <p>
    b = h.index("</div>", h.rindex("</p>", a, h.index("<!-- PC (Responsive/Rectangle) Matched Content -->"))) + 6
    h = h[:a] + '<div class="hide-div-button button selected">%s</div>\n\t<div class="box-border">\n\t\t%s\n\t</div>' % (L["notes_btn"], L["notes"]) + h[b:]
    # strings for js/percentagecalculator.js (must exist before it loads)
    cfg = dict(L["js"]); cfg["__dec"] = L["dec"]; cfg["__path"] = "/" + L["slug"]
    rep('<script>$.getScript("/percentagecalculator/js/percentagecalculator.js',
        '<script>window.PC_I18N = %s;</script><script>$.getScript("/percentagecalculator/js/percentagecalculator.js' % json.dumps(cfg, ensure_ascii=False))
    h = put_shared(h, code)
    h = h.replace("<!DOCTYPE html>", "<!DOCTYPE html><!-- GENERATED by build_percentage_translations.py from percentagecalculator/index.html: do not edit by hand -->", 1) \
        if "GENERATED by build_percentage_translations.py" not in h else h
    return h


def main():
    src = SRC.read_text(encoding="utf-8")
    for code in LANGS:
        L = LANGS[code]
        out = translate(src, code)
        p = SITE / L["slug"] / "index.html"
        old = p.read_text(encoding="utf-8") if p.exists() else None
        print("%-30s %s (%d bytes)" % (L["slug"], "unchanged" if old == out else ("new" if old is None else "updated"), len(out)))
        if APPLY and old != out:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(out, encoding="utf-8")
    en = put_shared(src, "en")
    print("%-30s %s" % ("percentagecalculator (hreflang + switcher)", "unchanged" if en == src else "updated"))
    if APPLY and en != src:
        SRC.write_text(en, encoding="utf-8")
    print("" if APPLY else "(dry run -- pass --apply)")


if __name__ == "__main__":
    main()
