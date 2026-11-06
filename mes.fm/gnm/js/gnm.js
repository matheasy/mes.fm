/* MESGNM: German New Medicine (GNM, Dr. Ryke Geerd Hamer) explorer: data + pure functions, no DOM.
   - PHASES, LAYERS (the four germ layers and their brain parts), ORGANS (organ catalogue by germ layer), LAWS, GLOSSARY
   - build(opts) -> model {T, knots, segs, events}: the two-phase curve for a scenario (classic / hanging / recurrence / unresolved)
   - levelAt(model, t), phaseAt(model, t), sample(model, n), placeFor(model, phase)
   - organText(organ, phase), cellSign(layer, phase), focusLook(phase)
   - match(text) -> the "Describe your symptoms" keyword matcher (no AI): phase scores, organ candidates, reasons
   Text describes what GNM teaches, in its own terms. Node: require('./tool_apps_src/gnm/lib.js'); tests: node tool_apps_src/gnm-tests.js */
(function (root) {
	"use strict";

	/* ---------------------------------------------------------------- phases */
	var PHASES = {
		norm: { name: "Normotonia", short: "Normal", g: "normotonia",
			sum: "In GNM, normotonia is the everyday rhythm: sympathicotonia (stress mode) by day and vagotonia (rest mode) by night, in balance.",
			psyche: "Ordinary ups and downs; no biological conflict is running. Attention moves freely from one thing to the next.",
			body: "Normal day-night rhythm: alert by day, sleeps through the night, normal appetite, warm hands and feet.",
			brain: "No active Hamer focus for this program.",
			microbes: "Microbes are present but, in GNM, they are not working on this organ.",
			color: "#64748b" },
		dhs: { name: "DHS (conflict shock)", short: "DHS", g: "dhs",
			sum: "Hamer described the DHS as an unexpected, highly acute, isolating conflict shock that catches a person on the wrong foot. In GNM it starts a Significant Biological Special Program (SBS) on the psyche, brain and organ at the same moment.",
			psyche: "A shock moment: 'I can't believe this is happening'. The person is caught unprepared and feels alone with it. The exact content of the conflict decides, in GNM, which brain relay and which organ are hit.",
			body: "The switch to constant sympathicotonia happens in that second: hands and feet go cold, the stomach tightens.",
			brain: "In GNM, a Hamer focus appears at once in the brain relay that matches the conflict content (on CT: sharp concentric rings, the 'target' pattern).",
			microbes: "No change yet. For the brain-stem and cerebellum programs Hamer said mycobacteria start to multiply now, so that they are ready for the healing phase.",
			color: "#7c3aed" },
		ca: { name: "Conflict-active phase", short: "ca-phase", g: "ca",
			sum: "In GNM, the conflict-active phase (ca-phase) is constant sympathicotonia: the whole organism is busy with the conflict, day and night, until it is resolved.",
			psyche: "Compulsive thinking about the conflict, going over it again and again; tense, driven, focused on solving it.",
			body: "Cold hands and feet, little appetite, losing weight, trouble sleeping (often waking in the early hours), more energy for the problem, higher stress levels.",
			brain: "The Hamer focus shows sharp, concentric rings (the 'shooting target' configuration) in the relay of the affected organ.",
			microbes: "Microbes are inactive for this program. In GNM, mycobacteria multiply in this phase (brain-stem and cerebellum programs) in step with the tumour.",
			color: "#2563eb" },
		cl: { name: "Conflictolysis (CL)", short: "CL", g: "cl",
			sum: "Conflictolysis (CL) is the moment the conflict is resolved. In GNM it is the turning point: the program switches from the active phase to the healing phase.",
			psyche: "Relief: the problem is solved, the danger is over, the separation has ended, the territory is back.",
			body: "Hands and feet warm up, appetite returns, the person can finally relax and sleep.",
			brain: "The rings of the Hamer focus begin to swell and blur as edema starts.",
			microbes: "In GNM, the matching microbes are switched on by the brain from this point.",
			color: "#15803d" },
		pcla: { name: "Healing phase PCL-A", short: "PCL-A", g: "pcla",
			sum: "PCL-A is the first half of the healing phase in GNM: vagotonia, rest and repair, with edema (fluid) in the brain relay and in the organ.",
			psyche: "Tired, relieved, wants to rest; often a feeling of weakness even though the conflict is solved.",
			body: "Deep fatigue, warm hands and feet, good appetite, often fever, headaches, inflammation, swelling and pain at the healing organ.",
			brain: "The Hamer focus fills with edema: the rings are blurred and swollen.",
			microbes: "In GNM, fungi, mycobacteria, bacteria or (as Hamer put it) viruses work now, each on the tissue of its own germ layer.",
			color: "#dc2626" },
		ec: { name: "Epileptoid crisis (EC)", short: "EC", g: "ec",
			sum: "Hamer described the epileptic or epileptoid crisis (EC) as a short return to sympathicotonia at the deepest point of the healing phase, which squeezes the edema out of the brain relay.",
			psyche: "The conflict is briefly relived, as if once more; restless, tense for hours.",
			body: "Chills, cold sweat, cold hands, palpitations, sometimes cramps, intense pain or a seizure-like attack, depending on the germ layer.",
			brain: "In GNM, the edema of the Hamer focus is pressed out; the focus contracts.",
			microbes: "Microbes keep working; the crisis is the peak of the program in GNM.",
			color: "#0891b2" },
		pclb: { name: "Healing phase PCL-B", short: "PCL-B", g: "pclb",
			sum: "PCL-B is the second half of healing in GNM: the edema leaves the body (urinary phase), scar tissue forms and the rhythm returns towards normotonia.",
			psyche: "Energy returns, the mood lifts, the episode feels finished.",
			body: "Passing a lot of urine as the fluid leaves (the 'pee phase'), swelling goes down, scars or indurations may remain, strength comes back.",
			brain: "Glia (connective tissue of the brain) is laid down in the Hamer focus; on CT it shows white.",
			microbes: "Microbial work comes to an end.",
			color: "#b45309" }
	};
	var ORDER = ["norm", "dhs", "ca", "cl", "pcla", "ec", "pclb"];

	/* ---------------------------------------------------------------- germ layers */
	var LAYERS = {
		endo: { name: "Endoderm", brain: "Brain stem", brainGroup: "old", color: "#d4a20b", fg: "#1f2937",
			ca: "+", pcl: "-", caText: "Cell proliferation: compact, cauliflower-like or flat growth (adenoid cells) that does more of the organ's work.",
			pclText: "The extra cells are broken down by fungi and mycobacteria (caseation, tuberculous processes), often with night sweats.",
			theme: "'Morsel' conflicts: not being able to catch, swallow, digest or get rid of a morsel; existence and starvation fears.",
			microbes: "Fungi and mycobacteria", purpose: "In the conflict-active phase (the extra cells do the extra work)." },
		oldm: { name: "Old mesoderm", brain: "Cerebellum", brainGroup: "old", color: "#e8771c", fg: "#1f2937",
			ca: "+", pcl: "-", caText: "Cell proliferation of protective or glandular tissue (thicker skin layer, breast gland, pleura, peritoneum, pericardium).",
			pclText: "The extra cells are removed by fungi, mycobacteria and bacteria; effusions and swelling are typical.",
			theme: "Attack conflicts (an attack against the chest, belly, heart, skin), worry and argument conflicts, soiling or disfigurement.",
			microbes: "Fungi, mycobacteria and bacteria", purpose: "In the conflict-active phase (protection against the attack)." },
		newm: { name: "New mesoderm", brain: "Cerebral medulla (white matter)", brainGroup: "new", color: "#d9480f", fg: "#ffffff",
			ca: "-", pcl: "+", caText: "Cell loss (necrosis): holes in bone (osteolysis), loss of lymph-node, connective, muscle or kidney tissue.",
			pclText: "The tissue is rebuilt with swelling, pain and lots of new cells (in GNM terms, what is often called sarcoma, lymphoma or leukaemia belongs here); bacteria help.",
			theme: "Self-devaluation conflicts: 'I'm not good enough, not strong enough, worthless'. The location follows the content (e.g. hands = clumsiness).",
			microbes: "Bacteria", purpose: "At the end of the healing phase: the tissue ends up stronger than before (e.g. a recalcified bone)." },
		ecto: { name: "Ectoderm", brain: "Cerebral cortex", brainGroup: "new", color: "#b91c1c", fg: "#ffffff",
			ca: "-", pcl: "+", caText: "Ulceration (cell loss) of squamous-epithelial linings, or loss of function (numbness, paralysis, hormone changes).",
			pclText: "The lining is restored with swelling, redness and inflammation; function returns; Hamer named viruses as the helpers here.",
			theme: "Territorial, separation, fright and motor conflicts (being cut off, losing territory, being unable to escape or hold on).",
			microbes: "Viruses (whose existence Hamer questioned)", purpose: "Mostly in the conflict-active phase (e.g. a widened duct or vessel lets more through)." }
	};
	var LAYER_ORDER = ["endo", "oldm", "newm", "ecto"];

	/* ---------------------------------------------------------------- organs
	   id, name, layer, x/y on the body diagram (viewBox 0 0 220 440), conflict, ca, pcl, ec, relay, kw (keywords), cue (phase hints from symptom words) */
	function O(id, name, layer, x, y, conflict, ca, pcl, ec, relay, kw, cue) {
		return { id: id, name: name, layer: layer, x: x, y: y, conflict: conflict, ca: ca, pcl: pcl, ec: ec, relay: relay, kw: kw, cue: cue || {} };
	}
	var ORGANS = [
		O("alveoli", "Lungs (alveoli)", "endo", 92, 138, "Death-fright conflict: fear of dying, of suffocating, often after a frightening diagnosis.",
			"Compact growth of alveolar cells (in GNM: more cells to take in more air and survive).", "Breakdown of the growth by mycobacteria: coughing up, night sweats, low fever.", "Short phase of breathlessness.",
			"Brain stem, both sides of the lung relays.", ["lung", "lungs", "alveoli", "short of breath", "coughing up"], { "coughing up": "pcla" }),
		O("stomach", "Stomach (greater curvature)", "endo", 120, 178, "Indigestible-morsel conflict: something that 'can't be digested', a hard-to-swallow situation.",
			"More secretory cells, more acid and enzymes to digest the morsel; possible growth.", "Breakdown of the extra cells; possible bleeding, night sweats.", "Cramp-like stomach pain.",
			"Brain stem, right side.", ["stomach", "indigestion", "heartburn", "nausea", "vomit", "vomiting", "throwing up", "threw up", "spitting up", "spit up", "reflux"], {}),
		O("intestine", "Small intestine and colon", "endo", 110, 212, "Indigestible-morsel conflict, often about money, food or 'something nasty' that can't be passed on.",
			"Flat or cauliflower-like growth, more digestive secretion.", "Breakdown by fungi and mycobacteria, possible diarrhoea with blood or mucus, night sweats.", "Colicky cramps.",
			"Brain stem, right side (small intestine) and left side (colon end).", ["intestine", "bowel", "gut", "colon", "diarrhea", "diarrhoea", "constipation", "belly", "abdomen", "poop", "poo", "stool", "stools", "bowel movement", "bowel movements", "diaper", "nappy", "pooping blood", "blood in stool", "blood in his stool", "blood in her stool", "blood in the stool", "blood in poop", "blood in his poop", "blood in her poop", "blood in the poop", "blood in the diaper", "bloody stool", "bloody poop", "bloody diaper", "mucus in stool", "mucus in poop", "mucousy poop", "colic", "gas", "gassy", "tummy", "tummy ache", "stomach ache", "belly ache", "cramping"],
			{ "diarrhea": "pcla", "diarrhoea": "pcla", "pooping blood": "pcla", "blood in stool": "pcla", "blood in his stool": "pcla", "blood in her stool": "pcla", "blood in the stool": "pcla", "blood in poop": "pcla", "blood in his poop": "pcla", "blood in her poop": "pcla", "blood in the poop": "pcla", "blood in the diaper": "pcla", "bloody stool": "pcla", "bloody poop": "pcla", "bloody diaper": "pcla", "mucus in stool": "pcla", "mucus in poop": "pcla", "mucousy poop": "pcla", "colic": "ec", "cramping": "ec", "constipation": "ca" }),
		O("liver", "Liver (parenchyma)", "endo", 98, 180, "Starvation conflict: fear of not having enough to live on.",
			"Compact growth of liver cells to make more of the food available.", "Breakdown by mycobacteria, night sweats.", "",
			"Brain stem, right side.", ["liver"], {}),
		O("collecting", "Kidney collecting tubules", "endo", 128, 200, "Refugee or existence conflict: feeling abandoned, alone, 'like a fish out of water', fighting for one's existence.",
			"Growth of the collecting-tubule cells: water is held back, little urine, weight gain from fluid. With any other healing SBS this is what GNM calls the 'syndrome'.", "Breakdown; urine flow returns.", "",
			"Brain stem, right side.", ["water retention", "fluid retention", "puffy", "bloated", "little urine", "not peeing"], { "water retention": "ca", "fluid retention": "ca", "puffy": "ca" }),
		O("thyroid", "Thyroid gland (glandular part)", "endo", 110, 96, "Not being able to catch a morsel quickly enough; having to hurry.",
			"More hormone-making cells: more thyroid hormone, faster metabolism.", "Breakdown of the extra cells; possible nodules remain.", "",
			"Brain stem.", ["thyroid", "hyperthyroid", "goitre", "goiter"], {}),
		O("middleear", "Middle ear", "endo", 92, 50, "Not being able to catch a 'sound morsel': news one urgently wants to hear.",
			"Growth of the middle-ear mucosa.", "Breakdown with discharge (in GNM, the classic middle-ear infection).", "Sharp earache.",
			"Brain stem.", ["ear", "earache", "ear infection", "middle ear", "ear discharge"], { "ear infection": "pcla", "earache": "pcla" }),
		O("prostate", "Prostate", "endo", 110, 252, "Sexual or 'ugly' conflict about a partner or offspring, often a man's generational conflict.",
			"Growth of the prostate gland.", "Breakdown by mycobacteria, night sweats.", "",
			"Brain stem.", ["prostate"], {}),

		O("breast", "Breast gland", "oldm", 128, 146, "Worry or argument conflict about a child, mother, partner or nest (which breast depends on handedness).",
			"Growth of breast-gland cells (in GNM: more milk to nourish the one worried about).", "Breakdown by mycobacteria with swelling, night sweats.", "",
			"Cerebellum; side depends on handedness (mother/child or partner side).", ["breast", "breast lump", "lump in breast", "mammary"], {}),
		O("dermis", "Dermis (corium)", "oldm", 168, 210, "Soiling or disfigurement conflict: feeling dirtied, attacked in one's integrity.",
			"Growth of the dermis (protective thickening); in GNM terms, melanoma belongs here.", "Breakdown, itching, possible weeping lesions.", "",
			"Cerebellum.", ["mole", "melanoma", "dermis"], {}),
		O("pleura", "Pleura", "oldm", 82, 150, "Attack-against-the-chest conflict (e.g. after a frightening chest diagnosis).",
			"Flat growth of the pleura (in GNM terms, mesothelioma).", "Breakdown with fluid: pleural effusion, breathlessness when lying down.", "",
			"Cerebellum.", ["pleura", "pleurisy", "pleural effusion", "fluid on the lung"], { "pleural effusion": "pcla" }),
		O("peritoneum", "Peritoneum", "oldm", 100, 226, "Attack-against-the-belly conflict (a blow, an operation, a diagnosis).",
			"Flat growth of the peritoneum.", "Breakdown with fluid in the belly (ascites).", "",
			"Cerebellum.", ["peritoneum", "ascites", "fluid in belly", "abdominal fluid"], { "ascites": "pcla" }),
		O("pericardium", "Pericardium", "oldm", 116, 140, "Attack-against-the-heart conflict, real or symbolic ('this broke my heart').",
			"Growth of the pericardium.", "Fluid in the pericardium (pericardial effusion).", "",
			"Cerebellum.", ["pericardium", "pericardial", "pericarditis"], {}),

		O("bone", "Bones and spine", "newm", 110, 238, "Self-devaluation conflict; where the bone is shows the content (spine: central to one's personality; hip: 'I can't cope'; hands: clumsiness).",
			"Bone loss (osteolysis), usually without pain; the bone marrow makes fewer blood cells (anaemia).", "Recalcification with swelling, the periosteum stretches: bone pain, back pain; in GNM terms, the 'leukaemia' phase of the blood.", "A short peak of bone pain.",
			"Cerebral medulla.", ["bone", "bones", "bone pain", "spine", "back pain", "osteoporosis", "anemia", "anaemia"], { "back pain": "pcla", "bone pain": "pcla", "anemia": "ca", "anaemia": "ca" }),
		O("joints", "Joints, cartilage and tendons", "newm", 152, 330, "Self-devaluation linked to that joint's use (knees: sport or not being agile; shoulder: being a good parent or partner).",
			"Loss of cartilage or tendon tissue, stiffness.", "Rebuilding with swelling, warmth and pain: in GNM, what is called rheumatism, arthritis or tendinitis.", "",
			"Cerebral medulla, side by handedness.", ["joint", "joints", "knee", "knees", "hip", "shoulder", "elbow", "wrist", "arthritis", "rheumatism", "tendon", "tendinitis", "stiff"], { "arthritis": "pcla", "rheumatism": "pcla", "stiff": "ca" }),
		O("muscle", "Muscles (tissue)", "newm", 58, 200, "Self-devaluation about strength: 'I'm not strong enough'.",
			"Muscle wasting (the tissue part; movement itself is controlled from the motor cortex).", "Rebuilding with swelling and aching.", "Muscle cramps or twitching.",
			"Cerebral medulla.", ["muscle", "muscles", "muscle pain", "aching muscles", "sore muscles", "wasting"], { "sore muscles": "pcla", "aching muscles": "pcla", "wasting": "ca" }),
		O("lymph", "Lymph nodes", "newm", 82, 108, "Mild self-devaluation tied to the area the node drains.",
			"Loss of lymph-node tissue.", "Swelling of the node while it rebuilds (in GNM terms, lymphoma).", "",
			"Cerebral medulla.", ["lymph", "lymph node", "lymph nodes", "swollen glands", "swollen gland"], { "swollen glands": "pcla", "swollen gland": "pcla" }),
		O("kidneyp", "Kidney (parenchyma)", "newm", 92, 200, "Water or fluid conflict: a frightening experience with water or liquid.",
			"Loss of kidney tissue; blood pressure rises to keep filtering.", "A kidney cyst forms and hardens: in GNM, the rebuilt and stronger tissue.", "",
			"Cerebral medulla.", ["kidney", "kidneys", "cyst", "blood pressure", "high blood pressure"], { "high blood pressure": "ca" }),
		O("ovary", "Ovaries / testicles (interstitial)", "newm", 124, 246, "Deep loss conflict: losing a person or animal one loves.",
			"Loss of tissue, lower hormone levels.", "A cyst grows and hardens; more hormones later.", "",
			"Cerebral medulla.", ["ovary", "ovaries", "testicle", "testicles", "ovarian cyst"], {}),

		O("skin", "Epidermis (skin)", "ecto", 52, 160, "Separation conflict: losing touch with someone, being cut off (or wanting to be separated).",
			"Ulceration: rough, dry, flaky skin, often numb or pale (sensory paralysis).", "Restoration: redness, rash, itching, swelling (in GNM, eczema; with recurrences, psoriasis).", "A brief numb or absent spell.",
			"Sensory cortex, side by handedness.", ["skin", "rash", "eczema", "itch", "itchy", "itching", "dry skin", "psoriasis", "numb", "numbness", "hives", "redness"], { "rash": "pcla", "eczema": "pcla", "itch": "pcla", "itchy": "pcla", "itching": "pcla", "redness": "pcla", "hives": "pcla", "dry skin": "ca", "numb": "ca", "numbness": "ca" }),
		O("bronchi", "Bronchial mucosa", "ecto", 104, 128, "Territorial fear or fright conflict: a threat to one's territory.",
			"Ulceration of the bronchial lining, airways widen (in GNM: more air in).", "Restoration with swelling and mucus: cough, bronchitis.", "Coughing fit; in GNM, an asthma attack when combined with another active relay.",
			"Cortex, right side (male-type).", ["cough", "coughing", "bronchitis", "bronchi", "phlegm", "mucus", "wheeze", "wheezing", "asthma"], { "cough": "pcla", "coughing": "pcla", "bronchitis": "pcla", "phlegm": "pcla", "asthma": "ec", "wheezing": "ec", "wheeze": "ec" }),
		O("larynx", "Larynx", "ecto", 110, 88, "Fright or scare conflict: a fright that 'took the voice away'.",
			"Ulceration of the larynx lining.", "Restoration: hoarseness, laryngitis, losing the voice.", "Coughing or choking fit.",
			"Cortex, left side (female-type).", ["hoarse", "hoarseness", "laryngitis", "voice", "lost my voice", "sore throat", "throat"], { "hoarse": "pcla", "hoarseness": "pcla", "laryngitis": "pcla", "sore throat": "pcla", "lost my voice": "pcla" }),
		O("nose", "Nasal mucosa", "ecto", 110, 60, "'Stink' conflict: a situation that stinks, or wanting to smell (sense) what is coming.",
			"Ulceration of the nasal lining, often unnoticed.", "Restoration: runny or blocked nose, the common cold, sinusitis.", "Sneezing fits.",
			"Sensory cortex.", ["nose", "runny nose", "blocked nose", "stuffy nose", "cold", "sniffles", "sinus", "sinusitis", "sneezing", "sneeze"], { "cold": "pcla", "runny nose": "pcla", "stuffy nose": "pcla", "blocked nose": "pcla", "sniffles": "pcla", "sinusitis": "pcla", "sneezing": "ec" }),
		O("coronary", "Coronary arteries", "ecto", 120, 146, "Territorial-loss conflict (male-type): losing one's territory, home, job or partner.",
			"Ulceration of the inner vessel lining (in GNM: the vessel widens); angina-like chest pain.", "Restoration with swelling of the lining.", "Hamer described the epileptoid crisis of this program as the heart attack.",
			"Cortex, right side.", ["angina", "coronary", "heart attack", "chest pain", "chest tightness"], { "angina": "ca", "chest tightness": "ca", "heart attack": "ec" }),
		O("bladder", "Bladder mucosa", "ecto", 110, 262, "Territorial-marking conflict: not being able to mark one's territory or boundaries.",
			"Ulceration of the bladder lining.", "Restoration: burning, cystitis-like symptoms, sometimes blood in the urine.", "Spasm of the bladder.",
			"Cortex.", ["bladder", "cystitis", "burning urine", "burning when peeing", "uti", "urinary infection"], { "cystitis": "pcla", "burning urine": "pcla", "burning when peeing": "pcla", "uti": "pcla", "urinary infection": "pcla" }),
		O("rectum", "Rectum (lower end, mucosa)", "ecto", 110, 236, "Identity conflict: not knowing where one belongs or what one's place is; in GNM terms often a change of 'nest' or of who looks after one.",
			"Ulceration of the rectal lining, often unnoticed.", "Restoration with swelling of the lining; bright red bleeding is typical of this healing (in GNM, haemorrhoids belong here).", "Spasm-like pain.",
			"Cortex, left temporal lobe.", ["rectum", "rectal", "rectal bleeding", "hemorrhoids", "haemorrhoids", "piles", "bright red blood", "anal fissure", "fissure", "pooping blood", "blood in stool", "blood in the stool", "blood in poop", "blood in the poop", "blood in the diaper", "bloody stool", "bloody poop", "bloody diaper"],
			{ "rectal bleeding": "pcla", "hemorrhoids": "pcla", "haemorrhoids": "pcla", "piles": "pcla", "bright red blood": "pcla", "pooping blood": "pcla", "blood in stool": "pcla", "blood in the stool": "pcla", "blood in poop": "pcla", "blood in the poop": "pcla", "blood in the diaper": "pcla", "bloody stool": "pcla", "bloody poop": "pcla", "bloody diaper": "pcla" }),
		O("milkducts", "Milk ducts", "ecto", 140, 146, "Separation conflict: a child, partner or mother 'torn from the breast'.",
			"Ulceration of the duct lining, the breast may pull in.", "Restoration with swelling of the ducts (in GNM terms, intraductal carcinoma).", "",
			"Sensory cortex, side by handedness.", ["milk duct", "milk ducts", "nipple"], {}),
		O("motor", "Motor cortex (movement)", "ecto", 168, 380, "Motor conflict: not being able to escape, to hold on, to move forward or to fend off.",
			"Loss of function: weakness or paralysis of the muscles concerned.", "Function returns step by step.", "Hamer described the epileptic crisis of this program as the seizure: twitching or convulsions.",
			"Motor cortex, side by handedness.", ["paralysis", "paralyzed", "paralysed", "weakness", "weak legs", "can't move", "twitch", "twitching", "seizure", "convulsion"], { "paralysis": "ca", "paralyzed": "ca", "paralysed": "ca", "weak legs": "ca", "twitch": "ec", "twitching": "ec", "seizure": "ec", "convulsion": "ec" }),
		O("islets", "Pancreatic islets", "ecto", 126, 190, "Resistance conflict (beta cells) or fear-disgust conflict (alpha cells).",
			"Loss of function: less insulin and higher blood sugar (beta cells), or low blood sugar (alpha cells).", "Function returns.", "",
			"Cortex.", ["blood sugar", "diabetes", "insulin", "hypoglycemia", "hypoglycaemia", "sugar levels"], { "diabetes": "ca" }),
		O("teeth", "Tooth enamel", "ecto", 110, 70, "Not being allowed to bite: unable to defend oneself.",
			"Enamel thins (functional ulceration).", "No restoration of enamel; in GNM the dentine below rebuilds (new mesoderm).", "",
			"Cortex.", ["teeth", "tooth", "enamel", "toothache"], { toothache: "pcla" })
	];
	var ORGAN_BY = {}; ORGANS.forEach(function (o) { ORGAN_BY[o.id] = o; });

	/* ---------------------------------------------------------------- laws */
	var LAWS = [
		{ id: "iron", n: 1, name: "The Iron Rule of Cancer",
			text: "Every Significant Biological Special Program (SBS) starts with a DHS: a highly acute, dramatic, isolating conflict shock that is experienced on three levels at the same moment: psyche, brain and organ. The conflict content decides where the Hamer focus forms in the brain and which organ is affected, and from then on the three levels run in step." },
		{ id: "two", n: 2, name: "The Law of the Two Phases",
			text: "Every SBS has two phases, provided the conflict is resolved: a conflict-active phase (constant sympathicotonia) and, after conflictolysis, a healing phase (vagotonia) that is split by the epileptoid crisis into PCL-A and PCL-B. Without resolution the program stays in the active phase. The more conflict mass (intensity x duration), the deeper and longer the healing phase." },
		{ id: "onto", n: 3, name: "The Ontogenetic System of Tumours and Cancer Equivalents",
			text: "Hamer ordered all programs by the germ layer the tissue comes from. The old brain (brain stem: endoderm; cerebellum: old mesoderm) makes cells multiply in the active phase and breaks them down in healing. The new brain (cerebral medulla: new mesoderm; cortex: ectoderm) makes cells disappear (or function drop) in the active phase and rebuilds them in healing." },
		{ id: "mic", n: 4, name: "The Ontogenetic System of Microbes",
			text: "In GNM, microbes are not the enemy but helpers controlled by the brain, and they work only in the healing phase. The oldest microbes serve the oldest brain parts: fungi and mycobacteria the brain stem and cerebellum programs, bacteria the cerebellum and medulla programs, and (as Hamer wrote) viruses, if they exist, the cortex programs." },
		{ id: "quint", n: 5, name: "The Quintessence",
			text: "Every so-called disease is, in GNM, part of a meaningful Significant Biological Special Program of nature that can be understood in evolutionary terms. Each SBS has a biological purpose: for the old-brain programs it lies in the active phase, for the new mesoderm at the end of healing, and for most ectodermal programs again in the active phase." }
	];

	/* ---------------------------------------------------------------- glossary */
	var GLOSSARY = {
		gnm: ["German New Medicine (GNM)", "The model of health and disease developed by Dr. Ryke Geerd Hamer (1935-2017) from 1981, built on his Five Biological Laws. Hamer later called it Germanische Neue Medizin."],
		hamer: ["Ryke Geerd Hamer", "German physician (1935-2017). After the death of his son Dirk in 1978 and his own testicular cancer, he studied patients' histories, brain scans and organs and formulated the Five Biological Laws."],
		dhs: ["DHS (Dirk Hamer Syndrome)", "In GNM, the conflict shock that starts a program: unexpected, highly acute, dramatic and isolating. Named after Hamer's son Dirk."],
		sbs: ["SBS (Significant Biological Special Program)", "Hamer's name for what medicine calls a disease: a meaningful program of nature with a conflict-active phase and a healing phase, running on psyche, brain and organ together."],
		conflict: ["Biological conflict", "In GNM, a conflict as an animal would experience it (a lost territory, a morsel that can't be swallowed, a separation), not a merely intellectual problem."],
		mass: ["Conflict mass", "Intensity x duration of the active phase. In GNM, the bigger the conflict mass, the longer and harder the healing phase."],
		track: ["Track (rail)", "Everything the person perceived at the moment of the DHS (a smell, a voice, a place, a food). In GNM, meeting a track later can re-trigger the conflict: a recurrence."],
		recurrence: ["Recurrence (relapse)", "A conflict that becomes active again, usually set off by a track. The program goes back into its active phase."],
		hanging: ["Hanging healing", "A healing phase that keeps being interrupted by recurrences, so the program never completes. In GNM, many chronic complaints are hanging healings."],
		handedness: ["Handedness (laterality)", "In GNM, whether a person is right- or left-handed decides on which side of the cerebellum and cortex a conflict lands, and so which side of the body is affected. Hamer used the clapping test: the hand on top leads."],
		mcside: ["Mother/child and partner side", "For a right-hander, the left side of the body relates to mother and child, the right side to partners (and the reverse for a left-hander), in GNM."],
		constellation: ["Constellation", "In GNM, two or more active conflicts whose Hamer foci lie on opposite hemispheres of the cerebral cortex (or of the cerebellum). Hamer linked constellations to special states of mind such as mania, depression, aggression or 'floating'."],
		focus: ["Hamer focus (HH)", "Hamer's name for the mark a program leaves in its brain relay, visible on a brain CT: sharp concentric rings in the active phase, an edema in healing, a white glial scar at the end."],
		target: ["Target configuration", "The sharp, concentric 'shooting target' rings of a Hamer focus in the conflict-active phase."],
		relay: ["Brain relay", "In GNM, the exact place in the brain that controls one organ or tissue. Each relay matches one conflict content."],
		syndrome: ["Syndrome", "Hamer's term for an active kidney collecting-tubule program (refugee or existence conflict) at the same time as another program in healing: water is held back and the healing swelling becomes much bigger."],
		germ: ["Germ layer", "One of the three layers of the embryo (endoderm, mesoderm, ectoderm) that every tissue grows from. GNM splits the mesoderm into old and new."],
		endo: ["Endoderm", "Inner germ layer: most of the gut, liver, lung alveoli, thyroid, middle ear. Controlled from the brain stem in GNM."],
		oldm: ["Old mesoderm", "The cerebellum-controlled part of the middle layer: dermis, breast gland, pleura, peritoneum, pericardium."],
		newm: ["New mesoderm", "The cerebral-medulla-controlled part of the middle layer: bones, cartilage, tendons, muscles, lymph nodes, blood vessels, kidney parenchyma, ovaries and testicles."],
		ecto: ["Ectoderm", "Outer germ layer: epidermis, squamous-epithelial linings (bronchi, larynx, bladder, milk ducts, coronary vessels), and nerve functions. Controlled from the cerebral cortex."],
		brainstem: ["Brain stem", "The oldest part of the brain. In GNM it controls the endodermal organs, arranged in a ring from mouth to anus."],
		cerebellum: ["Cerebellum", "In GNM, the controller of the old-mesodermal organs (protective skins and the breast gland)."],
		medulla: ["Cerebral medulla", "The white matter inside the cerebrum. In GNM, the controller of the new-mesodermal organs (support and movement tissues)."],
		cortex: ["Cerebral cortex", "The grey outer layer of the cerebrum. In GNM, the controller of the ectodermal organs and of motor and sensory function."],
		oldbrain: ["Old brain / new brain", "In GNM, the brain stem and cerebellum are the 'old brain' (cells multiply in the active phase); medulla and cortex are the 'new brain' (cells are lost in the active phase)."],
		normotonia: ["Normotonia", "The normal day-night rhythm: sympathicotonia by day, vagotonia by night."],
		sympathicotonia: ["Sympathicotonia", "Stress mode of the autonomic nervous system: alert, cold hands, little appetite, poor sleep. In GNM, it is constant through the conflict-active phase."],
		vagotonia: ["Vagotonia", "Rest-and-repair mode of the autonomic nervous system: tired, warm, hungry. In GNM, it marks the healing phase."],
		ca: ["Conflict-active phase (ca-phase)", "In GNM, the first phase of every SBS, from the DHS to conflictolysis."],
		cl: ["Conflictolysis (CL)", "The resolution of the conflict, which starts the healing phase in GNM."],
		pcl: ["PCL (healing phase)", "Post-conflictolysis phase: the healing phase that follows the CL, split by the epileptoid crisis into PCL-A and PCL-B."],
		pcla: ["PCL-A", "First half of the healing phase in GNM: edema, swelling, fatigue, often fever and pain."],
		pclb: ["PCL-B", "Second half of the healing phase in GNM: the edema leaves (urinary phase), scar tissue and glia form."],
		ec: ["Epileptoid crisis (EC)", "In GNM, a brief sympathicotonic peak at the deepest point of the healing phase that squeezes the edema out of the Hamer focus. For motor programs Hamer called it the epileptic crisis (the seizure)."],
		edema: ["Edema", "Fluid in a tissue. In GNM, the swelling of the Hamer focus and of the organ in PCL-A."],
		glia: ["Glia", "The connective tissue of the brain, laid down in the Hamer focus in PCL-B; it shows white on CT."],
		urinary: ["Urinary phase", "The start of PCL-B in GNM, when the body passes the edema as lots of urine."],
		cancer_eq: ["Cancer equivalent", "Hamer's term for a program in which no tumour grows (for example a loss of function, or an ulcer) but which follows the same laws."],
		purpose: ["Biological purpose", "In GNM, the meaning of an SBS for survival: what the organ change achieves, in the active phase or at the end of healing depending on the germ layer."],
		proliferation: ["Cell proliferation (+)", "Cells multiplying. In GNM, the old-brain programs do this in the active phase."],
		necrosis: ["Necrosis / ulceration (-)", "Cell loss. In GNM, the new-brain programs do this in the active phase (holes in tissue, ulcers of linings)."],
		microbes: ["Microbes in GNM", "Hamer's view: fungi, mycobacteria, bacteria (and, as he put it, viruses if they exist) are helpers switched on by the brain in the healing phase, each working on its own germ layer."],
		mycobacteria: ["Mycobacteria", "In GNM, the microbes (for example of tuberculosis) that break down the extra cells of brain-stem and cerebellum programs in healing. Hamer said they multiply in the active phase."],
		quintessence: ["Quintessence", "The fifth law: every so-called disease is a meaningful biological program of nature."],
		morsel: ["Morsel conflict", "In GNM, the endodermal conflict type: not being able to catch, swallow, digest or get rid of a 'morsel', literal or figurative."],
		selfdev: ["Self-devaluation conflict", "In GNM, the new-mesodermal conflict type: a blow to one's self-worth. The bone or tissue affected matches the content."],
		separation: ["Separation conflict", "In GNM, the conflict of losing or wanting to lose physical contact, which affects the epidermis or milk ducts."],
		territorial: ["Territorial conflict", "In GNM, conflicts about one's territory (home, job, partner, group): losing it, fearing for it, being unable to mark it."],
		scar: ["Scar / induration", "Tissue that stays changed after PCL-B: a hardened node, a cyst, a recalcified bone."]
	};

	/* ---------------------------------------------------------------- the two-phase curve */
	var SCEN = {
		classic: "Classic: one conflict, resolved",
		hanging: "Hanging healing: recurrences keep interrupting",
		recurrence: "Recurrence: a track re-triggers it later",
		unresolved: "Unresolved: the conflict stays active"
	};
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	/* opts: {scenario, intensity 0.2..1, duration 0.2..1} */
	function build(opts) {
		opts = opts || {};
		var sc = SCEN[opts.scenario] ? opts.scenario : "classic";
		var A = clamp(Number(opts.intensity) || 0.7, 0.2, 1), D = clamp(Number(opts.duration) || 0.5, 0.2, 1);
		var knots = [], segs = [], events = [], t = 0;
		function k(tt, y) { knots.push([tt, y]); }
		function seg(p, t0, t1, extra) { var s = { p: p, t0: t0, t1: t1 }; if (extra) for (var e in extra) s[e] = extra[e]; segs.push(s); }
		function norm(len) { k(t, 0); seg("norm", t, t + len); t += len; k(t, 0); }
		function cycle(a, d, rec) {     /* DHS -> ca -> CL -> PCL-A -> EC -> PCL-B -> back at 0 */
			var dhs = t; seg("dhs", t, t + 1.2, rec ? { rec: true } : null); events.push({ t: t, id: "dhs", label: rec ? "DHS again (track)" : "DHS" });
			k(t + 1.2, a * 0.85); t += 1.2;
			var caLen = 10 + 26 * d; seg("ca", t, t + caLen, rec ? { rec: true } : null);
			k(t + caLen * 0.5, a * 0.95); k(t + caLen, a); t += caLen;
			seg("cl", t, t + 1.2); events.push({ t: t, id: "cl", label: "CL" }); k(t + 1.2, a * 0.1); t += 1.2;
			var P = (caLen + 6) * (0.6 + 0.6 * a), depth = -a * (0.55 + 0.4 * d);
			var aLen = P * 0.5; seg("pcla", t, t + aLen); k(t + aLen * 0.55, depth * 0.85); k(t + aLen, depth); t += aLen;
			seg("ec", t, t + 4); events.push({ t: t + 1.6, id: "ec", label: "EC" }); k(t + 1.6, a * 0.92); k(t + 3.2, depth * 0.7); k(t + 4, depth * 0.62); t += 4;
			var bLen = P * 0.5; seg("pclb", t, t + bLen); k(t + bLen * 0.45, depth * 0.52); t += bLen; k(t, 0);
			return dhs;
		}
		if (sc === "classic") { norm(10); cycle(A, D, false); norm(10); }
		else if (sc === "recurrence") { norm(8); cycle(A, D * 0.8, false); norm(8); cycle(A * 0.8, D * 0.45, true); norm(8); }
		else if (sc === "unresolved") {
			norm(10); seg("dhs", t, t + 1.2); events.push({ t: t, id: "dhs", label: "DHS" }); k(t + 1.2, A * 0.85); t += 1.2;
			var L = 60 + 30 * D; seg("ca", t, t + L, { open: true }); k(t + L * 0.4, A * 0.95); k(t + L, Math.min(1.08, A * 1.1)); t += L;
			events.push({ t: t - 2, id: "open", label: "no CL yet" });
		} else {        /* hanging: CL, healing starts, a recurrence pulls it back, again and again */
			norm(10); seg("dhs", t, t + 1.2); events.push({ t: t, id: "dhs", label: "DHS" }); k(t + 1.2, A * 0.85); t += 1.2;
			var c = 8 + 14 * D; seg("ca", t, t + c); k(t + c, A); t += c;
			for (var i = 0; i < 3; i++) {
				seg("cl", t, t + 1.2); events.push({ t: t, id: "cl", label: i ? "CL" : "CL" }); k(t + 1.2, A * 0.1); t += 1.2;
				var h = 9 + 6 * D; seg("pcla", t, t + h, { hang: true }); k(t + h * 0.6, -A * 0.5); k(t + h, -A * 0.42); t += h;
				seg("dhs", t, t + 1, { rec: true }); events.push({ t: t, id: "rec", label: "track" }); k(t + 1, A * 0.7); t += 1;
				var r = 4 + 4 * D; seg("ca", t, t + r, { rec: true }); k(t + r, A * 0.8); t += r;
			}
			seg("cl", t, t + 1.2); k(t + 1.2, A * 0.1); t += 1.2;
			var h2 = 12; seg("pcla", t, t + h2, { hang: true }); k(t + h2 * 0.6, -A * 0.5); k(t + h2, -A * 0.45); t += h2;
			events.push({ t: t - 1, id: "hang", label: "still hanging" });
		}
		knots.sort(function (a, b) { return a[0] - b[0]; });
		return { scenario: sc, A: A, D: D, T: t, knots: knots, segs: segs, events: events };
	}
	function levelAt(m, t) {
		var K = m.knots, n = K.length;
		if (t <= K[0][0]) return K[0][1];
		if (t >= K[n - 1][0]) return K[n - 1][1];
		var i = 1; while (i < n && K[i][0] < t) i++;
		var a = K[i - 1], b = K[i], span = b[0] - a[0];
		var u = span > 0 ? (t - a[0]) / span : 1, s = (1 - Math.cos(Math.PI * u)) / 2;
		var y = a[1] + (b[1] - a[1]) * s;
		var sg = segAt(m, t);
		if (sg && sg.p === "norm") y += 0.07 * Math.sin((t - sg.t0) * 1.3);    /* day / night swing */
		else if (sg && sg.p === "ca") {      /* the wavy plateau of the classic chart: stress keeps flaring up while the conflict is active */
			var u2 = (t - sg.t0) / Math.max(1e-9, sg.t1 - sg.t0), env = Math.min(1, u2 * 8, (1 - u2) * 8);
			y += env * (0.05 * Math.sin((t - sg.t0) * 1.9) + 0.025 * Math.sin((t - sg.t0) * 3.7 + 1));
		}
		return y;
	}
	function segAt(m, t) {
		var S = m.segs; if (t <= S[0].t0) return S[0];
		for (var i = 0; i < S.length; i++) if (t >= S[i].t0 && t < S[i].t1) return S[i];
		return S[S.length - 1];
	}
	function phaseAt(m, t) {
		t = clamp(t, 0, m.T);
		var s = segAt(m, t), f = s.t1 > s.t0 ? clamp((t - s.t0) / (s.t1 - s.t0), 0, 1) : 0;
		return { p: s.p, f: f, seg: s, y: levelAt(m, t), rec: !!s.rec, hang: !!s.hang, open: !!s.open };
	}
	function sample(m, n) { n = n || 400; var out = []; for (var i = 0; i <= n; i++) { var t = m.T * i / n; out.push([t, levelAt(m, t)]); } return out; }
	/* where to put the marker for a phase (first segment of that phase, at `at` of its length) */
	function placeFor(m, p, at) {
		at = at == null ? 0.5 : at;
		for (var i = 0; i < m.segs.length; i++) { var s = m.segs[i]; if (s.p === p) return s.t0 + (s.t1 - s.t0) * at; }
		return null;
	}

	function cellSign(layer, p) {
		var L = LAYERS[layer]; if (!L) return "0";
		if (p === "ca" || p === "dhs") return L.ca;
		if (p === "pcla" || p === "ec") return L.pcl;
		if (p === "pclb") return L.pcl + "end";
		return "0";
	}
	function organText(o, p) {
		var L = LAYERS[o.layer];
		if (p === "norm") return "No program running on the " + o.name.toLowerCase() + "; the organ works normally.";
		if (p === "dhs") return "The conflict hits: " + o.conflict + " In GNM, the organ change starts this very second.";
		if (p === "ca") return o.ca;
		if (p === "cl") return "The conflict is resolved; the organ switches from the active change to repair.";
		if (p === "pcla") return o.pcl;
		if (p === "ec") return o.ec || ("The crisis of this " + L.name.toLowerCase() + " program: a short sympathicotonic peak before PCL-B.");
		if (p === "pclb") return "Repair is finished off: " + (L.ca === "+" ? "the remains of the broken-down cells are cleared; scars or caseated spots may stay." : "the rebuilt tissue settles and hardens (scar, cyst, callus).");
		return "";
	}
	function focusLook(p) {
		return { norm: "none", dhs: "rings", ca: "rings", cl: "blur", pcla: "edema", ec: "squeeze", pclb: "glia" }[p] || "none";
	}

	/* ---------------------------------------------------------------- symptom matcher (no AI) */
	/* phase cues: [phrase, phase, weight, what it says] */
	var CUES = [
		["cold hands", "ca", 3, "cold hands are the classic sign of sympathicotonia"], ["cold feet", "ca", 3, "cold feet go with sympathicotonia"],
		["cold extremities", "ca", 3, "cold extremities = sympathicotonia"], ["can't sleep", "ca", 3, "sleeplessness is typical of the active phase"],
		["cant sleep", "ca", 3, "sleeplessness is typical of the active phase"], ["cannot sleep", "ca", 3, "sleeplessness is typical of the active phase"],
		["insomnia", "ca", 3, "sleeplessness is typical of the active phase"], ["trouble sleeping", "ca", 3, "sleeplessness is typical of the active phase"],
		["waking up at", "ca", 2, "waking in the early hours fits the active phase"], ["wake up at 3", "ca", 3, "waking around 3 am is a GNM sign of the active phase"],
		["waking at night", "ca", 2, "waking in the night fits the active phase"], ["losing weight", "ca", 3, "weight loss goes with sympathicotonia"],
		["weight loss", "ca", 3, "weight loss goes with sympathicotonia"], ["lost weight", "ca", 3, "weight loss goes with sympathicotonia"],
		["no appetite", "ca", 3, "loss of appetite fits the active phase"], ["not hungry", "ca", 2, "loss of appetite fits the active phase"],
		["loss of appetite", "ca", 3, "loss of appetite fits the active phase"], ["can't eat", "ca", 2, "not eating fits the active phase"],
		["stressed", "ca", 2, "stress = sympathicotonia"], ["stress", "ca", 1, "stress = sympathicotonia"], ["tense", "ca", 2, "tension fits the active phase"],
		["anxious", "ca", 2, "worry and anxiety go with the active phase"], ["worried", "ca", 2, "worry goes with the active phase"], ["worrying", "ca", 2, "worry goes with the active phase"],
		["can't stop thinking", "ca", 3, "compulsive thinking about the conflict is the GNM mark of the active phase"], ["keep thinking", "ca", 3, "compulsive thinking about the conflict marks the active phase"],
		["obsessing", "ca", 3, "compulsive thinking marks the active phase"], ["restless", "ca", 1, "restlessness fits sympathicotonia"], ["nervous", "ca", 2, "nervousness fits sympathicotonia"],
		["racing heart", "ca", 1, "a fast pulse fits sympathicotonia"], ["shock", "dhs", 3, "a sudden shock is how GNM describes a DHS"], ["just happened", "dhs", 2, "something that has just hit fits the DHS moment"],
		["out of the blue", "dhs", 3, "an unexpected blow is the GNM picture of a DHS"], ["caught off guard", "dhs", 3, "being caught on the wrong foot is the DHS"],
		["relieved", "cl", 3, "relief marks conflictolysis"], ["relief", "cl", 3, "relief marks conflictolysis"], ["resolved", "cl", 3, "a resolved conflict = conflictolysis"],
		["solved", "cl", 2, "a solved problem = conflictolysis"], ["warm hands", "pcla", 3, "warm hands are a vagotonia sign"], ["warm feet", "pcla", 2, "warm feet are a vagotonia sign"],
		["tired", "pcla", 3, "fatigue is the main sign of the healing phase (vagotonia)"], ["exhausted", "pcla", 3, "exhaustion marks PCL-A"], ["fatigue", "pcla", 3, "fatigue marks the healing phase"],
		["sleepy", "pcla", 2, "sleepiness = vagotonia"], ["sleeping a lot", "pcla", 3, "lots of sleep = vagotonia"], ["weak", "pcla", 1, "feeling weak is common in PCL-A"],
		["fever", "pcla", 3, "fever belongs to the healing phase in GNM"], ["temperature", "pcla", 1, "a raised temperature belongs to the healing phase"],
		["swelling", "pcla", 3, "swelling (edema) is typical of PCL-A"], ["swollen", "pcla", 3, "swelling (edema) is typical of PCL-A"], ["inflammation", "pcla", 3, "inflammation marks PCL-A"],
		["inflamed", "pcla", 3, "inflammation marks PCL-A"], ["pain", "pcla", 1, "pain is common in PCL-A"], ["painful", "pcla", 1, "pain is common in PCL-A"], ["sore", "pcla", 1, "soreness fits PCL-A"],
		["headache", "pcla", 2, "headaches come with the brain edema of PCL-A"], ["hungry", "pcla", 2, "a good appetite returns in healing"], ["good appetite", "pcla", 3, "a good appetite returns in healing"],
		["infection", "pcla", 2, "in GNM, microbes work in the healing phase"], ["flu", "pcla", 2, "flu-like illness fits PCL-A"], ["night sweats", "pcla", 3, "night sweats fit the healing of brain-stem and cerebellum programs"],
		["chills", "ec", 3, "chills are a sign of the epileptoid crisis"], ["shivering", "ec", 3, "shivering fits the crisis"], ["cold sweat", "ec", 3, "cold sweat is an EC sign"],
		["palpitations", "ec", 3, "palpitations fit the crisis"], ["heart pounding", "ec", 2, "a pounding heart fits the crisis"], ["cramps", "ec", 2, "cramps can mark the crisis"],
		["attack", "ec", 1, "a sudden attack fits the crisis"], ["spasm", "ec", 2, "a spasm fits the crisis"], ["fainting", "ec", 2, "a brief absence can mark the crisis"], ["dizzy", "ec", 1, "dizziness can come with the crisis"],
		["peeing a lot", "pclb", 3, "passing lots of urine is the 'urinary phase' that starts PCL-B"], ["lots of urine", "pclb", 3, "passing lots of urine starts PCL-B"], ["urinating a lot", "pclb", 3, "passing lots of urine starts PCL-B"],
		["frequent urination", "pclb", 2, "passing lots of urine starts PCL-B"], ["swelling going down", "pclb", 3, "the edema leaving = PCL-B"], ["swelling went down", "pclb", 3, "the edema leaving = PCL-B"],
		["energy coming back", "pclb", 3, "returning energy = PCL-B"], ["energy is back", "pclb", 3, "returning energy = PCL-B"], ["getting better", "pclb", 2, "recovering fits PCL-B"], ["feeling better", "pclb", 2, "recovering fits PCL-B"],
		["scar", "pclb", 2, "scarring belongs to PCL-B"], ["hardened", "pclb", 1, "hardening fits PCL-B"],
		["keeps coming back", "rec", 3, "a complaint that keeps coming back fits a hanging healing"], ["comes back", "rec", 2, "returning complaints fit recurrences"], ["chronic", "rec", 3, "in GNM, chronic complaints are often hanging healings"],
		["on and off", "rec", 2, "on-and-off complaints fit recurrences"], ["flare", "rec", 2, "flare-ups fit recurrences on a track"], ["flares", "rec", 2, "flare-ups fit recurrences on a track"], ["every time", "rec", 2, "'every time' points to a track"],
		["allergy", "rec", 2, "in GNM, an allergy is a track: something that was present at the original DHS (a food, a smell, a person, a place) sets the program off again"],
		["allergies", "rec", 2, "in GNM, an allergy is a track: something present at the original DHS sets the program off again"], ["allergic", "rec", 2, "in GNM, an allergic reaction is a track being set off again"],
		["intolerance", "rec", 2, "in GNM, a food that sets symptoms off is read as a track from the first DHS"], ["sensitive to", "rec", 1, "a trigger that sets symptoms off again fits a track"],
		["after eating", "rec", 1, "symptoms after a certain food fit a track"], ["after feeding", "rec", 1, "symptoms after feeds fit a track"], ["after drinking", "rec", 1, "symptoms after a certain drink fit a track"],
		["keeps happening", "rec", 2, "a complaint that keeps happening fits a hanging healing"], ["again and again", "rec", 2, "repeated complaints fit recurrences on a track"],
		["bleeding", "pcla", 2, "in GNM, bleeding from a mucosa or a growth that is being broken down belongs to the healing phase"],
		["fussy", "ca", 1, "a baby that is restless and fussy fits sympathicotonia"], ["crying a lot", "ca", 1, "much crying fits sympathicotonia in a baby"], ["won't sleep", "ca", 2, "sleeplessness is typical of the active phase"],
		["fine", "norm", 1, "feeling fine fits normotonia"], ["normal", "norm", 1, "feeling normal fits normotonia"]
	];
	var NEG = /\b(no|not|without|never|don't|dont|didn't|didnt|isn't|no more|nor|none|free of)\s+(\w+\s+){0,2}$/;
	function normText(s) {
		return " " + String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[,.;:!?\n()]+/g, " | ").replace(/[^a-z0-9'| ]+/g, " ").replace(/\s+/g, " ").trim() + " ";
	}
	function findAll(txt, phrase) {
		var out = [], p = " " + phrase + " ", i = txt.indexOf(p);
		while (i >= 0) { out.push(i); i = txt.indexOf(p, i + 1); }
		/* allow a plural / -ing tail ("swellings", "itches") */
		if (!out.length && phrase.length > 3) { var re = new RegExp(" " + phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(s|es|ing) "), m = txt.match(re); if (m) out.push(m.index); }
		return out;
	}
	function negated(txt, i) { return NEG.test(txt.slice(Math.max(0, i - 30), i + 1)); }
	/* context notes: not phase cues, just what GNM looks at for this kind of situation */
	var NOTES = [
		[/ (baby|babies|infant|newborn|toddler|my son|my daughter|nephew|niece|grandson|granddaughter)('s)? /, "baby",
			"In GNM, a baby's conflicts are mostly about the mother (being close to her, separated from her), feeding, a fright, or a change of surroundings, and Hamer held that a baby also lives through what the mother lives through. GNM asks what happened shortly before the symptoms first appeared: the birth, a hospital stay, a change in feeding (breast, bottle, formula, solids), a move, a new carer, a frightening noise, or a hard time for the mother."],
		[/ (dairy|milk|formula|breastfeed|breastfeeding|breast milk|lactose|cow's milk|cows milk|gluten|wheat|peanut|egg|eggs|soy|food) /, "food",
			"In GNM, a food that seems to set symptoms off is read as a track: it was present (as a taste, smell or situation) at the moment of the first DHS, so meeting it again restarts the program. GNM therefore looks for the first time the symptoms appeared and what was going on then, rather than at the food itself."],
		[/ (blood(?! pressure| sugar| test)|bleed|bleeding|bloody) /, "blood",
			"In GNM, bright red blood from the lower bowel usually points to the rectum (ectoderm, identity conflict), and blood mixed with mucus higher up to the intestine (endoderm, morsel conflict); in both, Hamer placed the bleeding in the healing phase. Both are listed below as organ candidates."]
	];
	function match(text) {
		var txt = normText(text), sc = { norm: 0, dhs: 0, ca: 0, cl: 0, pcla: 0, ec: 0, pclb: 0, rec: 0 }, why = [], used = [];
		if (txt.trim().length < 2) return { empty: true, phase: null, scores: sc, organs: [], why: [], notes: [] };
		function overlaps(i, len) { for (var u = 0; u < used.length; u++) if (i < used[u][1] && i + len > used[u][0]) return true; return false; }
		var cues = CUES.slice().sort(function (a, b) { return b[0].length - a[0].length; });   /* longer phrases first */
		cues.forEach(function (c) {
			findAll(txt, c[0]).forEach(function (i) {
				if (overlaps(i, c[0].length + 1)) return;
				used.push([i, i + c[0].length + 1]);
				if (negated(txt, i)) { why.push({ w: c[0], neg: true, p: c[1], s: "'" + c[0] + "' is negated, so it is left out" }); return; }
				sc[c[1]] += c[2]; why.push({ w: c[0], p: c[1], s: c[3] });
			});
		});
		/* organ candidates: keyword hits; organ cues also vote for a phase */
		var org = [];
		ORGANS.forEach(function (o) {
			var hits = [], score = 0, mine = [];
			o.kw.slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (k) {
				findAll(txt, k).forEach(function (i) {
					if (negated(txt, i)) return;
					for (var v = 0; v < mine.length; v++) if (i < mine[v][1] && i + k.length + 1 > mine[v][0]) return;   /* "poop" inside "pooping blood" */
					mine.push([i, i + k.length + 1]);
					for (var u = 0; u < used.length; u++) if (i < used[u][1] && i + k.length + 1 > used[u][0] && used[u][1] - used[u][0] > k.length + 1) return;   /* "cold" inside "cold hands" */
					if (hits.indexOf(k) < 0) { hits.push(k); score += k.indexOf(" ") > 0 ? 3 : 2; }
					var cp = o.cue[k]; if (cp) { sc[cp] += 2; if (!why.some(function (w) { return w.w === k && w.p === cp; })) why.push({ w: k, p: cp, o: o.id, s: "in GNM, '" + k + "' on the " + o.name.toLowerCase() + " belongs to " + PHASES[cp].short }); }
				});
			});
			if (score) org.push({ id: o.id, score: score, hits: hits });
		});
		org.sort(function (a, b) { return b.score - a.score || a.id.localeCompare(b.id); });
		var best = null, bestS = 0;
		ORDER.forEach(function (p) { if (sc[p] > bestS) { best = p; bestS = sc[p]; } });
		var total = 0; ORDER.forEach(function (p) { total += sc[p]; });
		var scenario = sc.rec >= 2 ? "hanging" : null;
		if (!best && sc.rec) best = "pcla";
		var notes = []; NOTES.forEach(function (n) { if (n[0].test(txt)) notes.push({ id: n[1], s: n[2] }); });
		return { empty: false, phase: best, conf: total ? bestS / total : 0, scores: sc, organs: org.slice(0, 5), why: why, scenario: scenario, notes: notes };
	}

	var api = { PHASES: PHASES, ORDER: ORDER, LAYERS: LAYERS, LAYER_ORDER: LAYER_ORDER, ORGANS: ORGANS, ORGAN_BY: ORGAN_BY, LAWS: LAWS, GLOSSARY: GLOSSARY, SCEN: SCEN, CUES: CUES, NOTES: NOTES,
		build: build, levelAt: levelAt, phaseAt: phaseAt, sample: sample, placeFor: placeFor, cellSign: cellSign, organText: organText, focusLook: focusLook, match: match, normText: normText };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESGNM = api;
})(this);

/* German New Medicine explorer UI: two-phase chart with a draggable marker, "describe your symptoms" matcher, organ / brain-relay picker,
   the Five Biological Laws with diagrams, glossary popovers. Data + maths: MESGNM (lib.js, node-tested: tool_apps_src/gnm-tests.js).
   Settings: localStorage mes-gnm:v1 = {sc, A, D, t, organ, layer, law} (the symptom text is never saved). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("gn"); if (!root || !window.MESGNM) return;
	var G = window.MESGNM, KEY = "mes-gnm:v1", NS = "http://www.w3.org/2000/svg";
	function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	var saved = load(), saveT;
	function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 250); }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
	function num(v, lo, hi, d) { v = Number(v); return isFinite(v) && v >= lo && v <= hi ? v : d; }
	function q(id) { return G.GLOSSARY[id] ? '<button type="button" class="gn-q" data-g="' + id + '" aria-label="What is ' + esc(G.GLOSSARY[id][0]) + '?">?</button>' : ""; }

	var S = {
		sc: G.SCEN[saved.sc] ? saved.sc : "classic",
		A: num(saved.A, 0.2, 1, 0.7), D: num(saved.D, 0.2, 1, 0.5),
		t: num(saved.t, 0, 1, 0.3),            /* marker as a fraction of the time axis */
		organ: G.ORGAN_BY[saved.organ] ? saved.organ : "bronchi",
		layer: G.LAYERS[saved.layer] ? saved.layer : "",
		law: num(saved.law, 0, 4, 0)
	};
	var qs = new URLSearchParams(location.search);
	if (G.ORGAN_BY[qs.get("organ")]) S.organ = qs.get("organ");
	var M = G.build({ scenario: S.sc, intensity: S.A, duration: S.D });

	/* ---------------------------------------------------------------- svg helpers */
	function el(name, attrs, parent) { var e = document.createElementNS(NS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
	function txt(parent, x, y, s, cls, extra) { var a = { x: x, y: y, "class": cls || "gn-st" }; if (extra) for (var k in extra) a[k] = extra[k]; var e = el("text", a, parent); e.textContent = s; return e; }

	/* ---------------------------------------------------------------- chart */
	/* The classic two-phase chart (after Dr. Ryke Geerd Hamer): day phase / sympathicotonia above the normotonia line (blue), night phase /
	   vagotonia below (red), DHS and CL triangles on the line, the epileptoid crisis spike with its box, PCL-A / PCL-B labels in the troughs,
	   dashed phase dividers, and the "Conflict-active phase" / "Healing phase" bars underneath. Drawn from the same MESGNM model, so the
	   course buttons and sliders reshape it. */
	var CH = $("gn-chart"), W = 1000, H = 560, L = 150, R = 16, TOP = 62, PB = 400, Y1 = 1.18, Y0 = -1.08;
	function X(t) { return L + (W - L - R) * t / M.T; }
	function Y(v) { return TOP + (PB - TOP) * (Y1 - v) / (Y1 - Y0); }
	function tOfX(x) { return clamp((x - L) / (W - L - R), 0, 1) * M.T; }
	var mk = {};
	/* spans of the bars underneath: active = DHS .. CL, healing = CL .. back to normotonia (or the next DHS) */
	function spans() {
		var out = [], cur = null;
		M.segs.forEach(function (s) {
			var kind = s.p === "norm" ? null : (s.p === "dhs" || s.p === "ca") ? "act" : "heal";
			if (cur && cur.k === kind) { cur.t1 = s.t1; cur.open = cur.open || !!s.open; return; }
			if (cur) out.push(cur);
			cur = kind ? { k: kind, t0: s.t0, t1: s.t1, open: !!s.open } : null;
		});
		if (cur) out.push(cur);
		return out;
	}
	function drawChart() {
		var nar = (CH.getBoundingClientRect().width || 900) < 720;   /* phones: a narrower drawing, so the text stays readable */
		W = nar ? 640 : 1000; H = nar ? 640 : 560; L = nar ? 112 : 150; TOP = nar ? 78 : 62; PB = nar ? 450 : 400;
		CH.setAttribute("viewBox", "0 0 " + W + " " + H); CH.classList.toggle("gn-chart--n", nar);
		CH.innerHTML = "";
		var fs = nar ? 1.45 : 1, uid = "gnc", defs = el("defs", {}, CH), y0 = Y(0), bot = H - (nar ? 6 : 4);
		/* clip regions: program phases above / below the line, normotonia stretches on their own */
		var cUp = el("clipPath", { id: uid + "u" }, defs), cDn = el("clipPath", { id: uid + "d" }, defs), cN = el("clipPath", { id: uid + "n" }, defs);
		M.segs.forEach(function (sg) {
			var x0 = X(sg.t0), w = Math.max(0.5, X(sg.t1) - x0);
			if (sg.p === "norm") el("rect", { x: x0, y: 0, width: w, height: H }, cN);
			else { el("rect", { x: x0, y: 0, width: w, height: y0 }, cUp); el("rect", { x: x0, y: y0, width: w, height: H }, cDn); }
		});
		/* axis labels */
		var ax = function (y, a, b, cls) { txt(CH, L - 10, y, a, "gn-st gn-ax " + cls, { "text-anchor": "end" }); if (b) txt(CH, L - 10, y + 17 * fs, b, "gn-st gn-ax " + cls, { "text-anchor": "end" }); };
		if (nar) { ax(Y(0.72), "Day", "phase ↑", "gn-ax--up"); ax(y0 + 7, "Normal", "", ""); ax(Y(-0.5), "Night", "phase ↓", "gn-ax--dn"); }
		else { ax(Y(0.78), "Day phase:", "Sympathicotonia", "gn-ax--up"); ax(y0 + 5, "Normotonia", "", ""); ax(Y(-0.5), "Night phase:", "Vagotonia", "gn-ax--dn"); }
		/* the curve and its fills */
		var pts = G.sample(M, 700), d = "", a = "M" + X(0) + "," + y0;
		pts.forEach(function (p, i) { var c = X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1); d += (i ? "L" : "M") + c; a += "L" + c; });
		a += "L" + X(M.T) + "," + y0 + "Z";
		el("path", { d: a, "class": "gn-fill-n", "clip-path": "url(#" + uid + "n)" }, CH);
		el("path", { d: a, "class": "gn-fill-act", "clip-path": "url(#" + uid + "u)" }, CH);
		el("path", { d: a, "class": "gn-fill-heal", "clip-path": "url(#" + uid + "d)" }, CH);
		el("line", { x1: L, x2: W - R, y1: y0, y2: y0, "class": "gn-base" }, CH);
		/* dashed dividers at every phase change of a program (DHS, CL, crisis start / end, end of healing) */
		var vx = {};
		M.segs.forEach(function (sg, i) {
			var prev = M.segs[i - 1];
			if (sg.p === "dhs" || sg.p === "cl" || sg.p === "ec") vx[X(sg.t0).toFixed(1)] = 1;
			if (sg.p === "ec") vx[X(sg.t1).toFixed(1)] = 1;
			if (sg.p === "norm" && prev && prev.p !== "norm") vx[X(sg.t0).toFixed(1)] = 1;
		});
		Object.keys(vx).forEach(function (x) { el("line", { x1: x, x2: x, y1: TOP - 30 * fs, y2: bot - (nar ? 74 : 60), "class": "gn-vdash" }, CH); });
		el("path", { d: d, "class": "gn-curve" }, CH);
		/* trough / spike labels */
		M.segs.forEach(function (sg) {
			var xm = (X(sg.t0) + X(sg.t1)) / 2, w = X(sg.t1) - X(sg.t0);
			if (sg.p === "pcla" || sg.p === "pclb") {
				txt(CH, xm, y0 - 8, sg.p === "pcla" ? "PCL-A" : "PCL-B", "gn-st gn-ph", { "text-anchor": "middle" });
				var lw = (sg.p === "pcla" ? 76 : 66) * (nar ? 1.08 : 1), tl = (sg.t1 - sg.t0) * lw / 2 / Math.max(1, w), sh = -1, best = (sg.t0 + sg.t1) / 2;
				/* put the label where the trough is deepest across its whole width, so it never crosses the curve */
				for (var k = 0; k <= 16; k++) {
					var tc = sg.t0 + tl + (sg.t1 - sg.t0 - 2 * tl) * k / 16;
					var dd = Math.min(Y(G.levelAt(M, tc - tl)), Y(G.levelAt(M, tc + tl)), Y(G.levelAt(M, tc))) - y0;
					if (dd > sh) { sh = dd; best = tc; }
				}
				xm = X(best);
				if (w > lw + 6 && sh > 30 * (nar ? 1.2 : 1)) {
					var two = sg.p === "pcla" && sh > 56 * (nar ? 1.2 : 1), yy = y0 + (two ? sh * 0.42 : sh * 0.6) + 2;
					if (sg.p === "pcla") { txt(CH, xm, yy, "Exudation", "gn-st gn-in", { "text-anchor": "middle" }); if (two) txt(CH, xm, yy + 18 * (nar ? 1.2 : 1), "edema", "gn-st gn-in gn-in--b", { "text-anchor": "middle" }); }
					else if (!sg.hang) txt(CH, xm, yy, "Scarring", "gn-st gn-in", { "text-anchor": "middle" });
				}
			}
		});
		/* DHS / CL triangles on the line, the crisis box with an arrow at its peak */
		var tw = 62 * (nar ? 1.25 : 1), th = 40 * (nar ? 1.25 : 1);
		M.events.forEach(function (e) {
			var x = X(e.t);
			if (e.id === "dhs" || e.id === "rec" || e.id === "cl") {
				var g = el("g", { "class": "gn-tri" + (e.id === "cl" ? " gn-tri--cl" : "") }, CH);
				el("path", { d: "M" + (x - tw / 2) + "," + (y0 - th) + "L" + (x + tw / 2) + "," + (y0 - th) + "L" + x + "," + y0 + "Z" }, g);
				txt(g, x, y0 - th + 15 * fs + 1, e.id === "cl" ? "CL" : "DHS", "gn-st gn-tri-t", { "text-anchor": "middle" });
				if (e.id === "rec" || /track/.test(e.label)) txt(CH, x, y0 + 20 * fs, "track", "gn-st gn-small", { "text-anchor": "middle" });
			} else if (e.id === "ec") {
				var py = Y(G.levelAt(M, e.t)), bw = nar ? 230 : 190, bh = nar ? 38 : 30, by = TOP - (nar ? 72 : 58), bx = clamp(x - bw / 2, L, W - R - bw);
				el("line", { x1: x, x2: x, y1: by + bh, y2: py - 14, "class": "gn-ecline" }, CH);
				el("path", { d: "M" + (x - 9) + "," + (py - 2) + "L" + (x + 9) + "," + (py - 2) + "L" + x + "," + (py - 22) + "Z", "class": "gn-ecarrow" }, CH);
				var gg = el("g", { "class": "gn-ecbox" }, CH); el("rect", { x: bx, y: by, width: bw, height: bh, rx: 4 }, gg);
				txt(gg, bx + bw / 2, by + bh / 2 + 5 * fs, "Epileptoid crisis", "gn-st gn-ecbox-t", { "text-anchor": "middle" });
			} else {
				var ly = e.id === "open" || e.id === "hang" ? Y(G.levelAt(M, e.t)) + (e.id === "open" ? -14 : 26) : y0 - 12;
				txt(CH, X(e.t), ly, e.label, "gn-st gn-ev", { "text-anchor": "end" });
			}
		});
		/* the phase bars underneath */
		var barY = PB + (nar ? 44 : 36), barH = nar ? 52 : 44;
		spans().forEach(function (sp) {
			var x0 = X(sp.t0) + 3, x1 = X(sp.t1) - 3, w = x1 - x0; if (w < 6) return;
			var g = el("g", { "class": sp.k === "act" ? "gn-bar gn-bar--act" : "gn-bar gn-bar--heal" }, CH);
			el("rect", { x: x0, y: barY, width: w, height: barH, rx: 3 }, g);
			var big = sp.k === "act" ? ["Conflict-active", "phase"] : ["Healing", "phase"], cm = (x0 + x1) / 2;
			if (w > 150 * fs) txt(g, cm, barY + barH / 2 + 5 * fs, big.join(" "), "gn-st gn-bar-t", { "text-anchor": "middle" });
			else if (w > 66 * fs) { txt(g, cm, barY + barH / 2 - 2, big[0], "gn-st gn-bar-t gn-bar-t--s", { "text-anchor": "middle" }); txt(g, cm, barY + barH / 2 + 14 * fs - 2, big[1], "gn-st gn-bar-t gn-bar-t--s", { "text-anchor": "middle" }); }
			var cap = sp.k === "act" ? (sp.open ? ["Prolonged", "sympathicotonia (no CL yet)"] : ["Prolonged", "sympathicotonia"]) : ["Prolonged", "vagotonia"];
			var cpx = nar ? 17 : 14;      /* caption font size: show it only where its longest line fits under the bar */
			if (w > 0.56 * cpx * Math.max(cap[0].length, cap[1].length)) { txt(CH, cm, barY + barH + cpx * 1.5, cap[0], "gn-st gn-cap", { "text-anchor": "middle" }); txt(CH, cm, barY + barH + cpx * 2.85, cap[1], "gn-st gn-cap", { "text-anchor": "middle" }); }
		});
		mk.line = el("line", { y1: TOP - 20, y2: PB + 20, "class": "gn-mline" }, CH);
		mk.halo = el("circle", { r: 15, "class": "gn-mhalo" }, CH);
		mk.dot = el("circle", { r: 8, "class": "gn-mdot" }, CH);
		mk.lab = txt(CH, 0, 0, "", "gn-st gn-mlab", { "text-anchor": "middle" });
		drawStrip(); placeMarker();
	}
	function drawStrip() {
		var box = $("gn-strip"), h = "", seen = {};
		M.segs.forEach(function (s, i) {
			var w = 100 * (s.t1 - s.t0) / M.T, P = G.PHASES[s.p];
			h += '<button type="button" class="gn-sp" data-i="' + i + '" style="flex:' + w.toFixed(3) + ' 1 0" title="' + esc(P.name) + '"><i style="background:' + P.color + '"></i><span>' + (w > 7 ? esc(P.short) : "") + "</span></button>";
			seen[s.p] = 1;
		});
		box.innerHTML = h;
	}
	function placeMarker() {
		var t = S.t * M.T, ph = G.phaseAt(M, t), x = X(t), y = Y(ph.y), P = G.PHASES[ph.p];
		mk.line.setAttribute("x1", x); mk.line.setAttribute("x2", x);
		[mk.halo, mk.dot].forEach(function (c) { c.setAttribute("cx", x); c.setAttribute("cy", y); });
		mk.dot.setAttribute("fill", P.color); mk.halo.setAttribute("stroke", P.color);
		mk.lab.textContent = P.short + (ph.rec ? " (recurrence)" : "");
		mk.lab.setAttribute("x", clamp(x, L + 50, W - R - 60)); mk.lab.setAttribute("y", ph.y > 0.6 ? y + 34 : ph.y < -0.6 ? y - 20 : y - 22);
		CH.setAttribute("aria-valuenow", Math.round(S.t * 100)); CH.setAttribute("aria-valuetext", P.name);
		[].forEach.call($("gn-strip").children, function (b) { var s = M.segs[+b.getAttribute("data-i")]; b.classList.toggle("is-on", s === ph.seg); });
		renderInfo(ph); save();
	}
	function setT(f) { S.t = clamp(f, 0, 1); placeMarker(); }
	function pointerT(ev) { var pt = CH.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; var m = CH.getScreenCTM(); if (!m) return; var p = pt.matrixTransform(m.inverse()); setT(tOfX(p.x) / M.T); }
	/* mouse / pen drag at once; a finger only once the move is clearly sideways (or on a tap), so an up/down swipe scrolls the page */
	(function () {
		var id = null, on = false, sx = 0, sy = 0;
		function begin(ev) { on = true; try { CH.setPointerCapture(ev.pointerId); } catch (e) {} pointerT(ev); }
		CH.addEventListener("pointerdown", function (ev) { if (ev.button > 0) return; id = ev.pointerId; sx = ev.clientX; sy = ev.clientY; on = false; if (ev.pointerType !== "touch") { begin(ev); ev.preventDefault(); } });
		CH.addEventListener("pointermove", function (ev) {
			if (ev.pointerId !== id) return; if (on) { pointerT(ev); return; }
			var dx = Math.abs(ev.clientX - sx), dy = Math.abs(ev.clientY - sy);
			if (dx > 9 && dx > dy * 1.4) begin(ev); else if (dy > 12) id = null;
		});
		CH.addEventListener("pointerup", function (ev) { if (ev.pointerId !== id) return; if (!on && Math.abs(ev.clientX - sx) < 9 && Math.abs(ev.clientY - sy) < 9) pointerT(ev); on = false; id = null; });
		CH.addEventListener("pointercancel", function () { on = false; id = null; });
	})();
	function segIndexAt() { var t = S.t * M.T; for (var i = 0; i < M.segs.length; i++) if (t >= M.segs[i].t0 && t < M.segs[i].t1) return i; return M.segs.length - 1; }
	function goSeg(i) { i = clamp(i, 0, M.segs.length - 1); var s = M.segs[i], w = s.t1 - s.t0; setT((s.t0 + w * (w < 2 ? 0.5 : 0.45)) / M.T); }
	CH.addEventListener("keydown", function (ev) {
		var k = ev.key, step = ev.shiftKey ? 0.05 : 0.01;
		if (k === "ArrowRight" || k === "ArrowUp") setT(S.t + step);
		else if (k === "ArrowLeft" || k === "ArrowDown") setT(S.t - step);
		else if (k === "Home") setT(0); else if (k === "End") setT(1);
		else if (k === "PageDown") goSeg(segIndexAt() + 1); else if (k === "PageUp") goSeg(segIndexAt() - 1);
		else return;
		ev.preventDefault();
	});
	$("gn-strip").addEventListener("click", function (ev) { var b = ev.target.closest(".gn-sp"); if (b) goSeg(+b.getAttribute("data-i")); });

	/* controls */
	var scBox = $("gn-scen");
	Object.keys(G.SCEN).forEach(function (k) { var b = document.createElement("button"); b.type = "button"; b.setAttribute("data-sc", k); b.textContent = G.SCEN[k].split(":")[0]; b.title = G.SCEN[k]; scBox.appendChild(b); });
	function paintScen() { [].forEach.call(scBox.children, function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-sc") === S.sc ? "true" : "false"); }); }
	scBox.addEventListener("click", function (ev) { var b = ev.target.closest("button"); if (!b) return; S.sc = b.getAttribute("data-sc"); rebuild(); });
	var aIn = $("gn-a"), dIn = $("gn-d");
	aIn.value = S.A; dIn.value = S.D;
	function word(v) { return v < 0.4 ? "mild" : v < 0.7 ? "medium" : v < 0.9 ? "strong" : "very strong"; }
	function dword(v) { return v < 0.4 ? "short" : v < 0.7 ? "a while" : v < 0.9 ? "long" : "very long"; }
	function paintSliders() {
		$("gn-a-v").textContent = word(S.A); $("gn-d-v").textContent = dword(S.D);
		var mass = S.A * S.D;
		$("gn-mass").innerHTML = "Conflict mass " + q("mass") + " (intensity × duration): <b>" + (mass < 0.15 ? "small" : mass < 0.35 ? "moderate" : mass < 0.6 ? "large" : "very large") + "</b>. In GNM, the bigger the conflict mass, the deeper and longer the healing phase.";
	}
	aIn.addEventListener("input", function () { S.A = +aIn.value; rebuild(); });
	dIn.addEventListener("input", function () { S.D = +dIn.value; rebuild(); });
	function reflow() { var w = CH.getBoundingClientRect().width; if (w && (w < 720) !== (W < 1000)) drawChart(); }
	if (window.ResizeObserver) new ResizeObserver(reflow).observe(CH.parentNode); else window.addEventListener("resize", reflow);
	function rebuild() { M = G.build({ scenario: S.sc, intensity: S.A, duration: S.D }); paintScen(); paintSliders(); drawChart(); }

	/* ---------------------------------------------------------------- info panel */
	function hhSvg(look, color) {
		var id = "gnb" + Math.random().toString(36).slice(2, 7), rings = "", c = 50, s = '<svg viewBox="0 0 100 100" class="gn-hh" role="img" aria-label="Hamer focus: ' + look + '">';
		s += '<defs><filter id="' + id + '"><feGaussianBlur stdDeviation="' + (look === "blur" ? 1.4 : 2.6) + '"/></filter></defs>';
		s += '<ellipse cx="50" cy="50" rx="44" ry="46" class="gn-hh-brain"/>';
		var n = look === "squeeze" ? 4 : 5, step = look === "squeeze" ? 4 : 6.5;
		for (var i = 1; i <= n; i++) rings += '<circle cx="' + c + '" cy="' + c + '" r="' + (i * step) + '" fill="none" stroke="' + color + '" stroke-width="' + (look === "rings" ? 2 : 2.4) + '"/>';
		if (look === "none") s += '<text x="50" y="55" text-anchor="middle" class="gn-st gn-small">no focus</text>';
		else if (look === "rings") s += rings;
		else if (look === "blur") s += '<g filter="url(#' + id + ')">' + rings + "</g>";
		else if (look === "edema") s += '<circle cx="50" cy="50" r="38" class="gn-hh-edema" filter="url(#' + id + ')"/><g filter="url(#' + id + ')" opacity="0.6">' + rings + "</g>";
		else if (look === "squeeze") s += '<circle cx="50" cy="50" r="22" class="gn-hh-edema" opacity="0.5"/>' + rings;
		else if (look === "glia") s += '<circle cx="50" cy="50" r="17" class="gn-hh-glia"/><circle cx="50" cy="50" r="27" fill="none" class="gn-hh-glia2"/>';
		return s + "</svg>";
	}
	var LOOK = { none: "No Hamer focus for this program.", rings: "Sharp concentric rings (the target configuration): the relay is active.", blur: "The rings start to blur as edema begins.", edema: "Edema: blurred, swollen rings.", squeeze: "The crisis squeezes the edema out; the rings contract.", glia: "Glia is laid down: a white spot on CT." };
	function cellsRow(p) {
		var h = '<div class="gn-cells">';
		G.LAYER_ORDER.forEach(function (k) {
			var Ly = G.LAYERS[k], sg = G.cellSign(k, p), on = G.ORGAN_BY[S.organ].layer === k;
			var lab = sg === "+" ? "cells grow" : sg === "-" ? "cells lost" : sg === "+end" ? "rebuilt" : sg === "-end" ? "cleared" : "no change";
			var ic = sg === "+" || sg === "+end" ? "+" : sg === "-" || sg === "-end" ? "−" : "·";
			h += '<div class="gn-cell' + (on ? " is-on" : "") + '" title="' + esc(Ly.name + " (" + Ly.brain + "): " + lab) + '"><b style="background:' + Ly.color + ';color:' + Ly.fg + '">' + ic + "</b><span>" + esc(Ly.name) + "<small>" + lab + "</small></span></div>";
		});
		return h + "</div>";
	}
	function renderInfo(ph) {
		var P = G.PHASES[ph.p], o = G.ORGAN_BY[S.organ], Ly = G.LAYERS[o.layer], look = G.focusLook(ph.p), note = "";
		if (ph.rec) note = "This is a recurrence " + q("recurrence") + ": a track " + q("track") + " has re-triggered the same conflict, so the program is back in its active phase (usually shorter).";
		else if (ph.hang) note = "Hanging healing " + q("hanging") + ": this healing phase keeps being interrupted before the crisis, so the program never completes.";
		else if (ph.open) note = "The conflict has not been resolved, so in GNM the program stays in the active phase and the organ change goes on.";
		var micro = ph.p === "pcla" || ph.p === "ec" || ph.p === "pclb" ? Ly.microbes + " work on the " + o.name.toLowerCase() + " now (in GNM)." : P.microbes;
		var h = '<div class="gn-ihead"><span class="gn-badge" style="background:' + P.color + '">' + esc(P.short) + "</span><h3>" + esc(P.name) + " " + q(P.g) + "</h3></div>";
		h += '<p class="gn-isum">' + esc(P.sum) + "</p>";
		if (note) h += '<p class="gn-inote">' + note + "</p>";
		h += '<div class="gn-igrid">';
		h += '<div class="gn-ib"><h4>Psyche</h4><p>' + esc(P.psyche) + "</p></div>";
		h += '<div class="gn-ib"><h4>Body (vegetative)</h4><p>' + esc(P.body) + "</p></div>";
		h += '<div class="gn-ib gn-ib--org"><h4>Organ: ' + esc(o.name) + ' <span class="gn-lay" style="background:' + Ly.color + ';color:' + Ly.fg + '">' + esc(Ly.name) + "</span></h4><p>" + esc(G.organText(o, ph.p)) + '</p><button type="button" class="gn-link" data-go="org">Choose another organ ↓</button></div>';
		h += '<div class="gn-ib gn-ib--hh">' + hhSvg(look, Ly.color) + "<div><h4>Brain relay " + q("focus") + "</h4><p>" + esc(relayText(o)) + " " + esc(LOOK[look]) + "</p></div></div>";
		h += '<div class="gn-ib"><h4>Microbes ' + q("microbes") + "</h4><p>" + esc(micro) + "</p></div>";
		h += '<div class="gn-ib gn-ib--cells"><h4>Cells in this phase, by germ layer ' + q("oldbrain") + "</h4>" + cellsRow(ph.p) + "</div>";
		h += "</div>";
		$("gn-info").innerHTML = h;
	}
	$("gn-info").addEventListener("click", function (ev) { var b = ev.target.closest("[data-go=org]"); if (b) $("gn-orgcard").scrollIntoView({ behavior: "smooth", block: "start" }); });

	/* ---------------------------------------------------------------- describe your symptoms */
	var EX = ["cold hands, can't sleep, losing weight", "fever, swelling, tired", "cough and a runny nose", "chills, palpitations, cold sweat", "peeing a lot, energy coming back", "itchy rash that keeps coming back", "back pain and swollen joints", "baby with blood in the poop after feeds", "no fever, but I wake up at 3 and keep thinking about it"];
	$("gn-ask-ex").innerHTML = EX.map(function (e) { return '<button type="button" class="tu-chip" data-ex="' + esc(e) + '">' + esc(e) + "</button>"; }).join("");
	$("gn-ask-ex").addEventListener("click", function (ev) { var b = ev.target.closest("[data-ex]"); if (!b) return; $("gn-ask-in").value = b.getAttribute("data-ex"); ask(); });
	$("gn-ask-go").addEventListener("click", ask);
	$("gn-ask-clr").addEventListener("click", function () { $("gn-ask-in").value = ""; $("gn-ask-out").innerHTML = ""; $("gn-ask-in").focus(); });
	$("gn-ask-in").addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); ask(); } });
	function ask() {
		var r = G.match($("gn-ask-in").value), out = $("gn-ask-out"), h = "";
		if (r.empty) { out.innerHTML = '<p class="tu-note">Type a few words first.</p>'; return; }
		var notesH = (r.notes || []).map(function (n) { return '<p class="gn-inote">' + esc(n.s) + "</p>"; }).join("");
		if (!r.phase && !r.organs.length) { out.innerHTML = '<div class="gn-askres"><p>No symptom words from the GNM list were found. Try plain words such as <i>cold hands</i>, <i>tired</i>, <i>fever</i>, <i>cough</i>, <i>rash</i>, <i>diarrhea</i>, <i>blood in the poop</i>, <i>chills</i>, <i>joint pain</i>.</p>' + notesH + "</div>"; return; }
		if (r.scenario === "hanging" && S.sc !== "hanging") { S.sc = "hanging"; rebuild(); }
		if (r.organs.length) { S.organ = r.organs[0].id; renderOrgans(); }
		if (r.phase) { var t = G.placeFor(M, r.phase, r.phase === "ca" ? 0.6 : 0.5); if (t != null) setT(t / M.T); else placeMarker(); } else placeMarker();
		if (r.phase) {
			var P = G.PHASES[r.phase];
			h += '<div class="gn-askres"><p class="gn-askhead"><span class="gn-badge" style="background:' + P.color + '">' + esc(P.short) + "</span> In GNM terms this reads most like <b>" + esc(P.name) + "</b> " + q(P.g) + (r.conf < 0.6 ? " (mixed signs: see below)" : "") + ".</p>";
		} else h += '<div class="gn-askres"><p class="gn-askhead">No clear phase signs, but organ words were found.</p>';
		/* score bars */
		var max = 0; G.ORDER.forEach(function (p) { max = Math.max(max, r.scores[p]); });
		if (max) {
			h += '<div class="gn-bars">';
			G.ORDER.forEach(function (p) { var v = r.scores[p]; if (!v) return; h += '<div class="gn-bar"><span>' + esc(G.PHASES[p].short) + '</span><i><b style="width:' + (100 * v / max).toFixed(0) + "%;background:" + G.PHASES[p].color + '"></b></i><em>' + v + "</em></div>"; });
			h += "</div>";
		}
		if (r.scenario === "hanging") h += '<p class="gn-inote">Words like "allergy", "keeps coming back" or "chronic" point, in GNM, to a track or a hanging healing ' + q("hanging") + ", so the chart now shows that course.</p>";
		h += notesH;
		h += '<h4>Why</h4><ul class="gn-why">' + r.why.map(function (w) { return "<li" + (w.neg ? ' class="is-neg"' : "") + "><b>" + esc(w.w) + "</b>: " + esc(w.s) + (w.neg ? "" : ' <span class="gn-tag" style="background:' + (G.PHASES[w.p] ? G.PHASES[w.p].color : "#64748b") + '">' + esc(G.PHASES[w.p] ? G.PHASES[w.p].short : "recurrence") + "</span>") + "</li>"; }).join("") + "</ul>";
		if (r.organs.length) {
			h += '<h4>Organ candidates</h4><div class="gn-cands">' + r.organs.map(function (c) { var o = G.ORGAN_BY[c.id], Ly = G.LAYERS[o.layer]; return '<button type="button" class="gn-cand' + (c.id === S.organ ? " is-on" : "") + '" data-org="' + c.id + '"><i style="background:' + Ly.color + '"></i><span><b>' + esc(o.name) + "</b><small>" + esc(Ly.name) + " · " + esc(Ly.brain) + " · matched: " + esc(c.hits.join(", ")) + "</small></span></button>"; }).join("") + "</div>";
		}
		h += '<p class="tu-note">The marker on the chart and the organ have been set from this. <button type="button" class="gn-link" data-go="chart">See it on the chart ↑</button></p></div>';
		out.innerHTML = h;
	}
	$("gn-ask-out").addEventListener("click", function (ev) {
		var c = ev.target.closest("[data-org]"); if (c) { S.organ = c.getAttribute("data-org"); renderOrgans(); placeMarker(); [].forEach.call($("gn-ask-out").querySelectorAll(".gn-cand"), function (b) { b.classList.toggle("is-on", b === c); }); return; }
		if (ev.target.closest("[data-go=chart]")) $("gn-chartcard").scrollIntoView({ behavior: "smooth", block: "start" });
	});

	/* ---------------------------------------------------------------- organs, body and brain */
	function drawBody() {
		var B = $("gn-body"); B.innerHTML = "";
		el("path", { d: "M110,20c17,0 29,13 29,32c0,19 -12,34 -29,34c-17,0 -29,-15 -29,-34c0,-19 12,-32 29,-32Z", "class": "gn-sil" }, B);
		el("path", { d: "M98,84h24v14h-24Z", "class": "gn-sil" }, B);
		el("path", { d: "M64,104c10,-6 28,-8 46,-8s36,2 46,8c8,5 10,14 10,24l0,88c0,10 -4,24 -10,40l-4,10h-84l-4,-10c-6,-16 -10,-30 -10,-40l0,-88c0,-10 2,-19 10,-24Z", "class": "gn-sil" }, B);
		el("path", { d: "M62,108c-12,4 -18,16 -20,30l-10,88c-1,10 2,16 8,18c6,2 10,-2 12,-10l12,-80Z", "class": "gn-sil" }, B);
		el("path", { d: "M158,108c12,4 18,16 20,30l10,88c1,10 -2,16 -8,18c-6,2 -10,-2 -12,-10l-12,-80Z", "class": "gn-sil" }, B);
		el("path", { d: "M70,262h38l-4,150c0,10 -6,16 -14,16h-6c-6,0 -10,-6 -10,-14Z", "class": "gn-sil" }, B);
		el("path", { d: "M112,262h38l-4,152c0,8 -4,14 -10,14h-6c-8,0 -14,-6 -14,-16Z", "class": "gn-sil" }, B);
		G.ORGANS.forEach(function (o) {
			if (S.layer && o.layer !== S.layer) return;
			var on = o.id === S.organ, Ly = G.LAYERS[o.layer], g = el("g", { "class": "gn-od" + (on ? " is-on" : ""), "data-org": o.id, tabindex: 0, role: "button", "aria-label": o.name + " (" + Ly.name + ")" }, B);
			if (on) el("circle", { cx: o.x, cy: o.y, r: 11, fill: "none", stroke: Ly.color, "stroke-width": 2.5, "class": "gn-pulse" }, g);
			el("circle", { cx: o.x, cy: o.y, r: on ? 7 : 5.5, fill: Ly.color, "class": "gn-odot" }, g);
			el("title", {}, g).textContent = o.name + " · " + Ly.name;
		});
		var o = G.ORGAN_BY[S.organ];
		if (!S.layer || o.layer === S.layer) txt(B, clamp(o.x, 40, 180), o.y < 30 ? o.y + 22 : o.y - 14, o.name.replace(/ \(.*\)/, ""), "gn-st gn-olab", { "text-anchor": "middle" });
	}
	var BRAIN = {
		ecto: "M40,150C20,110 30,55 80,32C130,10 210,12 255,40C292,62 300,110 285,148C276,170 250,176 225,172L170,166C140,170 110,176 80,174C58,172 46,164 40,150Z",
		newm: "M64,144C48,112 58,70 96,52C136,34 204,36 240,58C268,76 274,108 262,136C254,152 236,156 214,152L170,148C140,152 112,156 90,154C76,152 68,150 64,144Z",
		oldm: "M206,182C210,166 236,160 262,166C286,172 296,190 286,206C276,222 246,226 224,218C208,212 202,196 206,182Z",
		endo: "M158,150C170,144 192,146 200,156L198,190C196,212 192,232 188,246L168,246C166,226 164,206 160,186Z"
	};
	var BRAIN_LAB = { ecto: [150, 30, "Cortex"], newm: [165, 96, "Medulla"], oldm: [252, 236, "Cerebellum"], endo: [146, 228, "Brain stem"] };
	function drawBrain() {
		var B = $("gn-brain"); B.innerHTML = "";
		var cur = G.ORGAN_BY[S.organ].layer;
		["oldm", "endo", "ecto", "newm"].forEach(function (k) {
			var Ly = G.LAYERS[k], dim = S.layer && S.layer !== k;
			var p = el("path", { d: BRAIN[k], fill: Ly.color, "fill-opacity": dim ? 0.18 : k === cur ? 0.95 : 0.62, "class": "gn-bp" + (k === cur ? " is-cur" : "") + (S.layer === k ? " is-sel" : ""), "data-layer": k, tabindex: 0, role: "button", "aria-label": Ly.brain + ": " + Ly.name + " organs" }, B);
			el("title", {}, p).textContent = Ly.brain + " → " + Ly.name;
		});
		/* the Hamer focus of the selected organ, in its brain part */
		var fx = { ecto: [50, 112], newm: [118, 124], oldm: [250, 194], endo: [180, 206] }[cur];
		el("circle", { cx: fx[0], cy: fx[1], r: 9, "class": "gn-bfocus" }, B); el("circle", { cx: fx[0], cy: fx[1], r: 4.5, "class": "gn-bfocus" }, B);
		for (var k in BRAIN_LAB) { var b = BRAIN_LAB[k]; txt(B, b[0], b[1], b[2], "gn-st gn-blab", { "text-anchor": "middle" }); }
	}
	function layerChips() {
		var h = '<button type="button" class="gn-lc" data-layer=""' + (S.layer ? "" : ' aria-pressed="true"') + ">All layers</button>";
		G.LAYER_ORDER.forEach(function (k) { var Ly = G.LAYERS[k]; h += '<button type="button" class="gn-lc" data-layer="' + k + '" aria-pressed="' + (S.layer === k) + '"><i style="background:' + Ly.color + '"></i>' + esc(Ly.name) + " <small>" + esc(Ly.brain.replace(" (white matter)", "")) + "</small></button>"; });
		$("gn-layerchips").innerHTML = h;
	}
	function renderList() {
		var qv = G.normText($("gn-org-q").value).trim(), h = "";
		G.LAYER_ORDER.forEach(function (k) {
			if (S.layer && S.layer !== k) return;
			var Ly = G.LAYERS[k], items = G.ORGANS.filter(function (o) { return o.layer === k && (!qv || G.normText(o.name + " " + o.kw.join(" ") + " " + o.conflict).indexOf(qv) >= 0); });
			if (!items.length) return;
			h += '<div class="gn-og"><div class="gn-ogh"><i style="background:' + Ly.color + '"></i>' + esc(Ly.name) + " · " + esc(Ly.brain) + " " + q(k) + "</div>";
			items.forEach(function (o) { h += '<button type="button" role="option" class="gn-oi' + (o.id === S.organ ? " is-on" : "") + '" aria-selected="' + (o.id === S.organ) + '" data-org="' + o.id + '">' + esc(o.name) + "</button>"; });
			h += "</div>";
		});
		$("gn-org-list").innerHTML = h || '<p class="tu-note">No organ matches. Try another word.</p>';
	}
	function relayText(o) {   /* the organ's relay note without repeating the brain part's name */
		var b = G.LAYERS[o.layer].brain.split(" (")[0], r = o.relay;
		if (r.indexOf(b) === 0) { r = r.slice(b.length).replace(/^[.,]\s*/, ""); r = r.charAt(0).toUpperCase() + r.slice(1); }
		return G.LAYERS[o.layer].brain + "." + (r ? " " + r : "");
	}
	function renderDetail() {
		var o = G.ORGAN_BY[S.organ], Ly = G.LAYERS[o.layer], h = "";
		h += '<div class="gn-ihead"><span class="gn-badge" style="background:' + Ly.color + ';color:' + Ly.fg + '">' + esc(Ly.name) + "</span><h3>" + esc(o.name) + "</h3></div>";
		h += '<p><b>Conflict in GNM:</b> ' + esc(o.conflict) + "</p>";
		h += '<p><b>Brain relay:</b> ' + esc(relayText(o)) + "</p>";
		h += '<div class="gn-ptab">';
		[["ca", o.ca, G.cellSign(o.layer, "ca")], ["pcla", o.pcl, G.cellSign(o.layer, "pcla")], ["ec", G.organText(o, "ec"), ""], ["pclb", G.organText(o, "pclb"), ""]].forEach(function (r) {
			var P = G.PHASES[r[0]];
			h += '<button type="button" class="gn-pr" data-ph="' + r[0] + '"><span class="gn-badge" style="background:' + P.color + '">' + esc(P.short) + "</span><span>" + esc(r[1]) + (r[2] ? ' <b class="gn-sign">' + (r[2] === "+" ? "+ cells" : "− cells") + "</b>" : "") + "</span></button>";
		});
		h += "</div>";
		h += '<p class="tu-note"><b>Biological purpose</b> ' + q("purpose") + " for " + esc(Ly.name.toLowerCase()) + " programs: " + esc(Ly.purpose) + " Click a phase to see it on the chart.</p>";
		$("gn-org-detail").innerHTML = h;
	}
	function renderOrgans() { layerChips(); renderList(); renderDetail(); drawBody(); drawBrain(); save(); }
	function pickOrgan(id) { if (!G.ORGAN_BY[id]) return; S.organ = id; if (S.layer && G.ORGAN_BY[id].layer !== S.layer) S.layer = ""; renderOrgans(); placeMarker(); }
	$("gn-org-list").addEventListener("click", function (ev) { var b = ev.target.closest("[data-org]"); if (b) pickOrgan(b.getAttribute("data-org")); });
	$("gn-org-q").addEventListener("input", function () {
		renderList();
		var first = $("gn-org-list").querySelector("[data-org]"); if (first && $("gn-org-q").value.trim().length > 2 && !$("gn-org-list").querySelector(".is-on")) pickOrgan(first.getAttribute("data-org"));
	});
	$("gn-layerchips").addEventListener("click", function (ev) { var b = ev.target.closest("[data-layer]"); if (!b) return; S.layer = b.getAttribute("data-layer"); if (S.layer && G.ORGAN_BY[S.organ].layer !== S.layer) { var f = G.ORGANS.filter(function (o) { return o.layer === S.layer; })[0]; S.organ = f.id; placeMarker(); } renderOrgans(); });
	function svgPick(ev) {
		var g = ev.target.closest("[data-org]"); if (g) { pickOrgan(g.getAttribute("data-org")); return true; }
		var p = ev.target.closest("[data-layer]"); if (p) { var k = p.getAttribute("data-layer"); S.layer = S.layer === k ? "" : k; if (S.layer && G.ORGAN_BY[S.organ].layer !== S.layer) { S.organ = G.ORGANS.filter(function (o) { return o.layer === S.layer; })[0].id; placeMarker(); } renderOrgans(); return true; }
		return false;
	}
	["gn-body", "gn-brain"].forEach(function (id) {
		$(id).addEventListener("click", svgPick);
		$(id).addEventListener("keydown", function (ev) { if ((ev.key === "Enter" || ev.key === " ") && svgPick(ev)) ev.preventDefault(); });
	});
	$("gn-org-detail").addEventListener("click", function (ev) {
		var b = ev.target.closest("[data-ph]"); if (!b) return;
		var t = G.placeFor(M, b.getAttribute("data-ph"), 0.5); if (t == null) { S.sc = "classic"; rebuild(); t = G.placeFor(M, b.getAttribute("data-ph"), 0.5); }
		setT(t / M.T); $("gn-chartcard").scrollIntoView({ behavior: "smooth", block: "start" });
	});

	/* ---------------------------------------------------------------- the five laws */
	function lawDiagram(id) {
		var s = "";
		if (id === "iron") {
			s = '<svg viewBox="0 0 520 260" class="gn-lsvg" role="img" aria-label="Psyche, brain and organ hit by the DHS at the same moment">';
			var pts = [[260, 40, "Psyche", "the conflict"], [90, 210, "Brain", "Hamer focus"], [430, 210, "Organ", "organ change"]];
			s += '<path d="M260,40L90,210L430,210Z" class="gn-ltri"/>';
			s += '<path d="M268,96l-30,52h24l-16,48l46,-66h-26l18,-34Z" fill="#7c3aed"/><text x="300" y="150" class="gn-st gn-ev">DHS</text>';
			pts.forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="34" class="gn-lnode"/><text x="' + p[0] + '" y="' + (p[1] + 2) + '" text-anchor="middle" class="gn-st gn-lnt">' + p[2] + '</text><text x="' + p[0] + '" y="' + (p[1] + 18) + '" text-anchor="middle" class="gn-st gn-small">' + p[3] + "</text>"; });
			s += '<text x="260" y="250" text-anchor="middle" class="gn-st gn-small">In GNM: one program, three levels, the same second, from then on in step</text></svg>';
		} else if (id === "two") {
			var m = G.build({ scenario: "classic", intensity: 0.8, duration: 0.5 }), w = 520, hh = 200, x = function (t) { return 20 + (w - 40) * t / m.T; }, y = function (v) { return 100 - v * 75; };
			s = '<svg viewBox="0 0 ' + w + " " + hh + '" class="gn-lsvg" role="img" aria-label="The two-phase curve">';
			s += '<line x1="20" x2="' + (w - 20) + '" y1="100" y2="100" class="gn-base"/>';
			var d = ""; G.sample(m, 240).forEach(function (p, i) { d += (i ? "L" : "M") + x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1); });
			s += '<path d="' + d + '" class="gn-curve"/>';
			m.segs.forEach(function (sg) { if (sg.p === "norm" || sg.p === "dhs" || sg.p === "cl") return; var mx = x((sg.t0 + sg.t1) / 2); s += '<text x="' + mx + '" y="' + (sg.p === "ca" ? 14 : sg.p === "ec" ? 14 : 192) + '" text-anchor="middle" class="gn-st gn-small" fill="' + G.PHASES[sg.p].color + '">' + G.PHASES[sg.p].short + "</text>"; });
			s += '<text x="24" y="92" class="gn-st gn-small">sympathicotonia ↑</text><text x="24" y="116" class="gn-st gn-small">vagotonia ↓</text></svg><p><button type="button" class="tu-btn tu-btn--ghost" data-go="chart">Explore it on the big chart ↑</button></p>';
		} else if (id === "onto") {
			s = '<div class="gn-onto"><div class="gn-oh"><span>Germ layer</span><span>Brain part</span><span>Active phase</span><span>Healing phase</span></div>';
			G.LAYER_ORDER.forEach(function (k) {
				var Ly = G.LAYERS[k];
				s += '<button type="button" class="gn-orow" data-layer="' + k + '"><span><i style="background:' + Ly.color + '"></i><b>' + esc(Ly.name) + "</b></span><span>" + esc(Ly.brain) + "<small>" + (Ly.brainGroup === "old" ? "old brain" : "new brain") + '</small></span><span class="gn-sgn ' + (Ly.ca === "+" ? "is-plus" : "is-minus") + '">' + cellPic(Ly.ca, Ly.color) + "<small>" + (Ly.ca === "+" ? "cells multiply" : "cells lost") + '</small></span><span class="gn-sgn ' + (Ly.pcl === "+" ? "is-plus" : "is-minus") + '">' + cellPic(Ly.pcl, Ly.color) + "<small>" + (Ly.pcl === "+" ? "rebuilt" : "broken down") + "</small></span></button>";
			});
			s += '</div><p class="tu-note">Click a row to see that layer\'s organs. Typical conflict themes: ' + G.LAYER_ORDER.map(function (k) { return "<b>" + G.LAYERS[k].name + "</b>: " + esc(G.LAYERS[k].theme); }).join(" ") + "</p>";
		} else if (id === "mic") {
			s = '<div class="gn-mic">';
			G.LAYER_ORDER.forEach(function (k) {
				var Ly = G.LAYERS[k];
				s += '<div class="gn-mrow"><span><i style="background:' + Ly.color + '"></i><b>' + esc(Ly.brain.replace(" (white matter)", "")) + "</b><small>" + esc(Ly.name) + '</small></span><span class="gn-mbar"><em class="gn-mca">active phase: idle</em><em class="gn-mpcl" style="background:' + Ly.color + ';color:' + Ly.fg + '">healing: ' + esc(Ly.microbes) + "</em></span></div>";
			});
			s += '</div><p class="tu-note">Oldest microbes for the oldest brain parts, as Hamer put it. In GNM they work only after conflictolysis; if the matching microbes are missing, the tissue is repaired more slowly or left encapsulated.</p>';
		} else {
			s = '<div class="gn-mic">';
			G.LAYER_ORDER.forEach(function (k) {
				var Ly = G.LAYERS[k], at = k === "newm" ? 92 : 30;
				s += '<div class="gn-mrow"><span><i style="background:' + Ly.color + '"></i><b>' + esc(Ly.name) + '</b></span><span class="gn-qbar"><em class="gn-qa">active</em><em class="gn-qp">healing</em><b class="gn-star" style="left:' + at + '%" title="' + esc(Ly.purpose) + '">★</b></span></div>';
			});
			s += '</div><p class="tu-note">★ = where, in GNM, the biological purpose ' + q("purpose") + " of the program lies. Example from Hamer: in a bone program the bone ends up stronger after healing; in a bronchial program the widened airway lets more air in during the active phase.</p>";
		}
		return s;
	}
	function cellPic(sign, color) {
		var s = '<svg viewBox="0 0 48 28" class="gn-cp" aria-hidden="true">', P = [[8, 8], [20, 8], [32, 8], [14, 19], [26, 19], [38, 19], [44, 8]];
		P.forEach(function (p, i) { var hole = sign === "-" && (i === 1 || i === 4 || i === 6), extra = sign === "+" || i < 5; if (!extra) return; s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5.2" ' + (hole ? 'fill="none" stroke="' + color + '" stroke-dasharray="2 2"' : 'fill="' + color + '"') + "/>"; });
		return s + "</svg>";
	}
	function renderLaws() {
		$("gn-lawtabs").innerHTML = G.LAWS.map(function (Lw, i) { return '<button type="button" role="tab" data-law="' + i + '" aria-selected="' + (i === S.law) + '"><b>' + Lw.n + "</b> " + esc(Lw.name.replace(/^The /, "")) + "</button>"; }).join("");
		var Lw = G.LAWS[S.law], gl = { iron: "dhs", two: "pcl", onto: "germ", mic: "microbes", quint: "quintessence" }[Lw.id];
		$("gn-lawpanel").innerHTML = "<h3>" + Lw.n + ". " + esc(Lw.name) + " " + q(gl) + "</h3><p>" + esc(Lw.text) + "</p>" + lawDiagram(Lw.id);
		save();
	}
	$("gn-lawtabs").addEventListener("click", function (ev) { var b = ev.target.closest("[data-law]"); if (!b) return; S.law = +b.getAttribute("data-law"); renderLaws(); });
	$("gn-lawtabs").addEventListener("keydown", function (ev) { var d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0; if (!d) return; S.law = (S.law + d + 5) % 5; renderLaws(); $("gn-lawtabs").children[S.law].focus(); ev.preventDefault(); });
	$("gn-lawpanel").addEventListener("click", function (ev) {
		var r = ev.target.closest("[data-layer]"); if (r) { S.layer = r.getAttribute("data-layer"); if (G.ORGAN_BY[S.organ].layer !== S.layer) { S.organ = G.ORGANS.filter(function (o) { return o.layer === S.layer; })[0].id; placeMarker(); } renderOrgans(); $("gn-orgcard").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
		if (ev.target.closest("[data-go=chart]")) $("gn-chartcard").scrollIntoView({ behavior: "smooth", block: "start" });
	});

	/* ---------------------------------------------------------------- glossary list + "?" popovers */
	function renderGloss() {
		var qv = G.normText($("gn-gl-q").value).trim();
		var keys = Object.keys(G.GLOSSARY).sort(function (a, b) { return G.GLOSSARY[a][0].localeCompare(G.GLOSSARY[b][0]); });
		$("gn-gl-list").innerHTML = keys.filter(function (k) { return !qv || G.normText(G.GLOSSARY[k].join(" ")).indexOf(qv) >= 0; }).map(function (k) { return '<div class="gn-gi" id="gn-g-' + k + '"><dt>' + esc(G.GLOSSARY[k][0]) + "</dt><dd>" + esc(G.GLOSSARY[k][1]) + "</dd></div>"; }).join("") || '<p class="tu-note">No term matches.</p>';
	}
	$("gn-gl-q").addEventListener("input", renderGloss);
	var pop = document.createElement("div"); pop.className = "gn-pop"; pop.id = "gn-pop"; pop.setAttribute("role", "dialog"); pop.hidden = true; root.appendChild(pop);
	var popFor = null;
	function closePop() { if (pop.hidden) return; pop.hidden = true; if (popFor) popFor.setAttribute("aria-expanded", "false"); popFor = null; }
	function openPop(btn) {
		var g = G.GLOSSARY[btn.getAttribute("data-g")]; if (!g) return;
		if (popFor === btn) { closePop(); return; }
		closePop(); popFor = btn; btn.setAttribute("aria-expanded", "true");
		pop.innerHTML = "<b>" + esc(g[0]) + '</b><p>' + esc(g[1]) + '</p><button type="button" class="gn-popx" aria-label="Close">×</button>';
		pop.hidden = false;
		var host = root.closest(".mes-pfill") || root, hr = (host === root ? root : host).getBoundingClientRect(), br = btn.getBoundingClientRect(), pw = Math.min(320, window.innerWidth - 24);
		if (pop.parentNode !== host) host.appendChild(pop);
		pop.style.width = pw + "px";
		var x = clamp(br.left - hr.left - pw / 2 + br.width / 2, 4 - hr.left + 8, window.innerWidth - hr.left - pw - 12), y = br.bottom - hr.top + (host === root ? 0 : host.scrollTop) + 6;
		pop.style.left = x + "px"; pop.style.top = y + "px";
	}
	document.addEventListener("click", function (ev) {
		var b = ev.target.closest(".gn-q"); if (b && root.contains(b) || b && b.closest(".mes-pfill")) { ev.preventDefault(); ev.stopPropagation(); openPop(b); return; }
		if (ev.target.closest(".gn-popx") || !ev.target.closest(".gn-pop")) closePop();
	}, true);
	document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !pop.hidden) { var f = popFor; closePop(); if (f) f.focus(); } });
	window.addEventListener("resize", closePop);

	/* ---------------------------------------------------------------- Fill window / Full screen */
	function panels() {
		if (!window.MESPanel) return false;
		window.MESPanel.add($("gn-chartcard"), { bar: $("gn-ch-pv"), onChange: closePop });
		window.MESPanel.add($("gn-orgcard"), { bar: $("gn-org-pv"), onChange: closePop });
		return true;
	}
	if (!panels()) { var tries = 0, iv = setInterval(function () { if (panels() || ++tries > 40) clearInterval(iv); }, 150); }

	paintScen(); paintSliders(); drawChart(); renderOrgans(); renderLaws(); renderGloss();
	window.MESGNMDebug = { S: S, model: function () { return M; }, setT: setT, ask: ask };
})();
