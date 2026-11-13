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
	/* ---------------- report mode: words doctors write in reports, letters and articles ---------------- */
	/* [phrase, phase, weight, why]: phase-level signs that do not depend on the tissue */
	var CLIN = [
		["edema", "pcla", 3, "edema (swelling) is typical of PCL-A"], ["oedema", "pcla", 3, "edema (swelling) is typical of PCL-A"], ["effusion", "pcla", 3, "in GNM, fluid collecting (an effusion) belongs to the healing phase"],
		["inflammation", "pcla", 3, "in GNM, inflammation is the repair of the healing phase"], ["inflammatory", "pcla", 2, "in GNM, inflammation is the repair of the healing phase"], ["inflamed", "pcla", 2, "in GNM, inflammation is the repair of the healing phase"],
		["infiltrate", "pcla", 2, "an infiltrate (inflamed, swollen tissue) fits PCL-A"], ["hyperemia", "pcla", 2, "more blood flow to the tissue fits the healing phase"], ["hyperaemia", "pcla", 2, "more blood flow to the tissue fits the healing phase"],
		["abscess", "pcla", 2, "in GNM, pus and an abscess come from microbes breaking tissue down in the healing phase"], ["pus", "pcla", 2, "in GNM, pus comes from microbes working in the healing phase"], ["purulent", "pcla", 2, "in GNM, pus comes from microbes working in the healing phase"],
		["elevated crp", "pcla", 2, "a raised CRP (inflammation marker) fits the healing phase"], ["raised crp", "pcla", 2, "a raised CRP (inflammation marker) fits the healing phase"], ["high crp", "pcla", 2, "a raised CRP (inflammation marker) fits the healing phase"],
		["elevated esr", "pcla", 2, "a raised ESR (inflammation marker) fits the healing phase"], ["leukocytosis", "pcla", 2, "a high white-cell count goes with inflammation, the healing phase in GNM"], ["leucocytosis", "pcla", 2, "a high white-cell count goes with inflammation, the healing phase in GNM"],
		["febrile", "pcla", 3, "fever belongs to the healing phase in GNM"], ["pyrexia", "pcla", 3, "fever belongs to the healing phase in GNM"], ["lethargy", "pcla", 2, "fatigue fits vagotonia"], ["lethargic", "pcla", 2, "fatigue fits vagotonia"], ["fatigue", "pcla", 2, "fatigue fits vagotonia"], ["malaise", "pcla", 1, "feeling unwell and tired fits vagotonia"],
		["night sweats", "pcla", 3, "night sweats go with the healing phase (tuberculous breakdown)"], ["caseating", "pcla", 3, "caseation is tuberculous breakdown, the healing phase in GNM"], ["caseation", "pcla", 3, "caseation is tuberculous breakdown, the healing phase in GNM"],
		["granuloma", "pcla", 2, "in GNM, granulomas are read as tuberculous healing"], ["granulomatous", "pcla", 2, "in GNM, granulomas are read as tuberculous healing"], ["tuberculosis", "pcla", 3, "in GNM, mycobacteria (TB) break down tumours in the healing phase"],
		["cavitation", "pcla", 2, "a cavity left after tuberculous breakdown is a healing-phase finding in GNM"], ["cavity", "pcla", 1, "a cavity left after breakdown fits the healing phase"],
		["fibrosis", "pclb", 2, "fibrosis (scar tissue) belongs to PCL-B"], ["fibrotic", "pclb", 2, "fibrosis (scar tissue) belongs to PCL-B"], ["scarring", "pclb", 2, "scarring belongs to PCL-B"], ["scar tissue", "pclb", 3, "scarring belongs to PCL-B"],
		["calcified", "pclb", 2, "calcification marks the end of healing (PCL-B) in GNM"], ["calcification", "pclb", 2, "calcification marks the end of healing (PCL-B) in GNM"], ["calcifications", "pclb", 2, "calcification marks the end of healing (PCL-B) in GNM"],
		["sclerotic", "pclb", 2, "sclerosis (hardening, recalcified bone) belongs to PCL-B"], ["recalcification", "pclb", 3, "recalcification of bone is PCL-B"], ["osteoblastic", "pclb", 2, "new bone being laid down is PCL-B"], ["callus", "pclb", 2, "callus (new bone) is PCL-B"], ["encapsulated", "pclb", 2, "an encapsulated growth is, in GNM, one that healing has closed off"],
		["tachycardia", "ca", 2, "a fast heartbeat fits sympathicotonia"], ["hypertension", "ca", 2, "high blood pressure fits sympathicotonia"], ["cachexia", "ca", 3, "wasting fits long sympathicotonia"], ["cachectic", "ca", 3, "wasting fits long sympathicotonia"],
		["anorexia", "ca", 2, "loss of appetite fits sympathicotonia"], ["poor appetite", "ca", 2, "loss of appetite fits sympathicotonia"], ["reduced appetite", "ca", 2, "loss of appetite fits sympathicotonia"], ["decreased appetite", "ca", 2, "loss of appetite fits sympathicotonia"],
		["unintentional weight loss", "ca", 3, "weight loss goes with sympathicotonia"], ["stress", "ca", 1, "stress fits sympathicotonia"], ["anxiety", "ca", 1, "constant worry fits sympathicotonia"], ["hypercalcemia", "ca", 2, "calcium released from dissolving bone fits the active phase of a bone program"], ["hypercalcaemia", "ca", 2, "calcium released from dissolving bone fits the active phase of a bone program"],
		["syncope", "ec", 2, "a short faint fits the epileptoid crisis"], ["fainted", "ec", 2, "a short faint fits the epileptoid crisis"], ["epileptic", "ec", 2, "seizures are a crisis sign"], ["arrhythmia", "ec", 1, "rhythm disturbances can be the crisis of a heart program"], ["pulmonary embolism", "ec", 2, "in GNM, a pulmonary embolism is read as an epileptoid crisis"],
		["stable disease", "norm", 1, "a growth that does not change fits normotonia or an encapsulated, finished program"], ["unchanged", "norm", 1, "no change since the last scan"], ["no change", "norm", 1, "no change since the last scan"],
		["regression", "pcla", 1, "a growth getting smaller fits breakdown in the healing phase"], ["decreased in size", "pcla", 1, "a growth getting smaller fits breakdown in the healing phase"], ["reduced in size", "pcla", 1, "a growth getting smaller fits breakdown in the healing phase"], ["resolving", "pclb", 1, "a finding going away fits the end of healing"], ["resolved", "pclb", 1, "a finding gone away fits the end of healing"]
	];
	/* [phrase, {layer: phase}, weight, what it is, layer hint when no organ word is found] -- GNM reads these by the tissue (third law) */
	var LAYERED = [
		["adenocarcinoma", { endo: "ca", oldm: "ca" }, 3, "an adenocarcinoma (compact glandular growth)", "endo"],
		["adenoma", { endo: "ca", oldm: "ca" }, 2, "an adenoma (glandular growth)", "endo"],
		["polyp", { endo: "ca" }, 2, "a polyp (growth of the gut lining)", "endo"], ["polyps", { endo: "ca" }, 2, "polyps (growth of the gut lining)", "endo"],
		["mesothelioma", { oldm: "ca" }, 3, "a mesothelioma (growth of the pleura or peritoneum)", "oldm"],
		["melanoma", { oldm: "ca" }, 3, "a melanoma (growth of the dermis)", "oldm"],
		["squamous cell carcinoma", { ecto: "pcla" }, 3, "a squamous cell carcinoma (squamous lining refilling and swelling)", "ecto"],
		["squamous", { ecto: "pcla" }, 1, "squamous lining refilling", "ecto"],
		["intraductal", { ecto: "pcla" }, 2, "an intraductal finding (lining of the milk ducts refilling)", "ecto"],
		["ductal carcinoma", { ecto: "pcla" }, 3, "a ductal carcinoma (lining of the milk ducts refilling)", "ecto"],
		["sarcoma", { newm: "pcla" }, 3, "a sarcoma (connective tissue or bone rebuilding)", "newm"], ["osteosarcoma", { newm: "pcla" }, 3, "an osteosarcoma (bone rebuilding with swelling)", "newm"],
		["lymphoma", { newm: "pcla" }, 3, "a lymphoma (lymph nodes swelling while they rebuild)", "newm"],
		["lymphadenopathy", { newm: "pcla" }, 3, "swollen lymph nodes", "newm"], ["enlarged lymph nodes", { newm: "pcla" }, 3, "swollen lymph nodes", "newm"],
		["osteolysis", { newm: "ca" }, 3, "osteolysis (bone dissolving)", "newm"], ["osteolytic", { newm: "ca" }, 3, "osteolysis (bone dissolving)", "newm"], ["lytic lesion", { newm: "ca" }, 3, "a lytic lesion (bone dissolving)", "newm"], ["lytic lesions", { newm: "ca" }, 3, "lytic lesions (bone dissolving)", "newm"],
		["osteoporosis", { newm: "ca" }, 2, "osteoporosis (bone thinning)", "newm"], ["osteopenia", { newm: "ca" }, 2, "osteopenia (bone thinning)", "newm"], ["atrophy", { newm: "ca", ecto: "ca" }, 2, "atrophy (tissue shrinking)", null],
		["necrosis", { newm: "ca", endo: "pcla", oldm: "pcla" }, 2, "necrosis (dead tissue)", null], ["necrotic", { newm: "ca", endo: "pcla", oldm: "pcla" }, 2, "necrotic (dead) tissue", null],
		["ulcer", { ecto: "ca" }, 2, "an ulcer (lining lost)", "ecto"], ["ulceration", { ecto: "ca" }, 2, "ulceration (lining lost)", "ecto"], ["ulcerated", { ecto: "ca" }, 2, "an ulcer (lining lost)", "ecto"], ["erosion", { ecto: "ca" }, 1, "an erosion (lining lost)", "ecto"],
		["tumor", { endo: "ca", oldm: "ca", newm: "pcla", ecto: "pcla" }, 1, "a tumour", null], ["tumour", { endo: "ca", oldm: "ca", newm: "pcla", ecto: "pcla" }, 1, "a tumour", null],
		["mass", { endo: "ca", oldm: "ca", newm: "pcla", ecto: "pcla" }, 1, "a mass", null], ["nodule", { endo: "ca", oldm: "ca" }, 1, "a nodule (compact growth)", null], ["nodules", { endo: "ca", oldm: "ca" }, 1, "nodules (compact growths)", null],
		["osteolytic lesion", { newm: "ca" }, 3, "an osteolytic lesion (bone dissolving)", "newm"], ["osteolytic lesions", { newm: "ca" }, 3, "osteolytic lesions (bone dissolving)", "newm"], ["sclerotic lesion", { newm: "pclb" }, 3, "a sclerotic lesion (bone recalcified)", "newm"], ["sclerotic lesions", { newm: "pclb" }, 3, "sclerotic lesions (bone recalcified)", "newm"],
		["progression", { endo: "ca", oldm: "ca", newm: "pcla", ecto: "pcla" }, 1, "growth since the last check (progression)", null], ["increased in size", { endo: "ca", oldm: "ca", newm: "pcla", ecto: "pcla" }, 1, "growth since the last check", null], ["enlarging", { endo: "ca", oldm: "ca", newm: "pcla", ecto: "pcla" }, 1, "growth since the last check", null]
	];
	/* extra organ words that turn up in reports */
	var CLIN_ORG = {
		alveoli: ["upper lobe", "lower lobe", "middle lobe", "right lung", "left lung", "pulmonary nodule", "pulmonary nodules", "lung nodule", "lung nodules", "nodules in the lung", "nodules in the lungs", "pulmonary", "lung cancer", "alveolar"],
		bronchi: ["bronchial", "bronchial carcinoma", "bronchiectasis", "copd"], stomach: ["gastric", "gastritis", "esophageal", "oesophageal"],
		intestine: ["colorectal", "colonic", "sigmoid", "cecum", "caecum", "ileum", "jejunum", "duodenum", "duodenal", "crohn's", "crohns", "colitis", "diverticulitis"],
		rectum: ["rectal", "anal", "hemorrhoids", "haemorrhoids"], liver: ["hepatic", "hepatocellular", "hepatitis", "cirrhosis"],
		breast: ["mammary gland", "lobular carcinoma", "breast cancer", "breast tumour", "breast tumor", "mammogram", "mammography"], milkducts: ["ductal", "intraductal", "ductal carcinoma"],
		bone: ["osseous", "vertebra", "vertebrae", "vertebral", "lumbar", "thoracic spine", "cervical spine", "femur", "femoral", "pelvis", "pelvic bone", "rib", "ribs", "skeletal", "osteolysis", "osteolytic", "lytic lesion", "lytic lesions", "osteosarcoma", "osteopenia", "bone marrow", "leukemia", "leukaemia", "myeloma"],
		lymph: ["lymphadenopathy", "nodal", "lymphoma", "axillary nodes", "cervical nodes", "enlarged lymph nodes"], larynx: ["laryngeal", "vocal cord", "vocal cords"], thyroid: ["thyroid nodule", "hypothyroid", "hashimoto", "hashimoto's"],
		pleura: ["pleural", "mesothelioma"], peritoneum: ["peritoneal", "peritonitis"], prostate: ["prostatic", "psa"], ovary: ["ovarian", "testicular"], kidneyp: ["renal cyst", "renal parenchyma", "wilms"], collecting: ["renal failure", "kidney failure", "oliguria"],
		skin: ["cutaneous", "dermatitis", "skin lesion", "basal cell"], dermis: ["melanoma"], bladder: ["urothelial", "bladder cancer"], coronary: ["myocardial infarction", "coronary artery disease", "stent"], motor: ["multiple sclerosis", "paresis", "hemiparesis"], islets: ["type 1 diabetes", "type 2 diabetes", "hba1c"]
	};
	var NEG_REP = /\b(no|not|without|never|nor|none|denies|denied|negative for|free of|absence of|absent|no evidence of|no sign of|no signs of|ruled out|excluded)\s+(\w+\s+){0,3}$/;
	var NEG_AFTER = /^ ?(\w+ ){0,3}(was |were |is |are |has been |have been )?(ruled out|excluded|not seen|not identified|not detected|not present|absent|negative)\b/;
	function negatedRep(txt, i, len) { return NEG_REP.test(txt.slice(Math.max(0, i - 44), i + 1)) || NEG_AFTER.test(txt.slice(i + len + 1, i + len + 50)); }

	function match(text, opts) {
		opts = opts || {};
		var rep = !!opts.report, txt = normText(text), sc = { norm: 0, dhs: 0, ca: 0, cl: 0, pcla: 0, ec: 0, pclb: 0, rec: 0 }, why = [], used = [];
		if (txt.trim().length < 2) return { empty: true, phase: null, scores: sc, organs: [], why: [], notes: [] };
		function neg(i, len) { return rep ? negatedRep(txt, i, len) : negated(txt, i); }
		function overlaps(i, len) { for (var u = 0; u < used.length; u++) if (i < used[u][1] && i + len > used[u][0]) return true; return false; }
		var cues = (rep ? CUES.concat(CLIN) : CUES).slice().sort(function (a, b) { return b[0].length - a[0].length; });   /* longer phrases first */
		cues.forEach(function (c) {
			findAll(txt, c[0]).forEach(function (i) {
				if (overlaps(i, c[0].length + 1)) return;
				used.push([i, i + c[0].length + 1]);
				if (neg(i, c[0].length)) { why.push({ w: c[0], neg: true, p: c[1], s: "'" + c[0] + "' is negated, so it is left out" }); return; }
				sc[c[1]] += c[2]; why.push({ w: c[0], p: c[1], s: c[3] });
			});
		});
		/* organ candidates: keyword hits; organ cues also vote for a phase */
		var org = [], orgPos = [];
		ORGANS.forEach(function (o) {
			var hits = [], score = 0, mine = [], kws = rep && CLIN_ORG[o.id] ? o.kw.concat(CLIN_ORG[o.id]) : o.kw;
			kws.slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (k) {
				findAll(txt, k).forEach(function (i) {
					if (neg(i, k.length)) return;
					for (var v = 0; v < mine.length; v++) if (i < mine[v][1] && i + k.length + 1 > mine[v][0]) return;   /* "poop" inside "pooping blood" */
					mine.push([i, i + k.length + 1]); orgPos.push({ i: i, id: o.id });
					for (var u = 0; u < used.length; u++) if (i < used[u][1] && i + k.length + 1 > used[u][0] && used[u][1] - used[u][0] > k.length + 1) return;   /* "cold" inside "cold hands" */
					if (hits.indexOf(k) < 0) { hits.push(k); score += k.indexOf(" ") > 0 ? 3 : 2; }
					var cp = o.cue[k]; if (cp) { sc[cp] += 2; if (!why.some(function (w) { return w.w === k && w.p === cp; })) why.push({ w: k, p: cp, o: o.id, s: "in GNM, '" + k + "' on the " + o.name.toLowerCase() + " belongs to " + PHASES[cp].short }); }
				});
			});
			if (score) org.push({ id: o.id, score: score, hits: hits });
		});
		org.sort(function (a, b) { return b.score - a.score || a.id.localeCompare(b.id); });
		/* report mode: tissue words, read by the germ layer of the organ found here (else the document's, else the word's own) */
		if (rep) {
			var docLay = LAYERS[opts.layer] ? opts.layer : "", lay = org.length ? ORGAN_BY[org[0].id].layer : docLay;
			var hitsL = [];
			LAYERED.slice().sort(function (a, b) { return b[0].length - a[0].length; }).forEach(function (c) {
				findAll(txt, c[0]).forEach(function (i) {
					if (overlaps(i, c[0].length + 1)) return;
					used.push([i, i + c[0].length + 1]);
					hitsL.push({ c: c, i: i });
				});
			});
			/* in reading order, so "the nodule ... with necrosis" reads the necrosis in the nodule's tissue */
			hitsL.sort(function (a, b) { return a.i - b.i; });
			var sticky = "", ctx = opts.ctx || [];
			hitsL.forEach(function (h) {
				var c = h.c, i = h.i, k;
				if (neg(i, c[0].length)) { why.push({ w: c[0], neg: true, p: "info", s: "'" + c[0] + "' is negated, so it is left out" }); return; }
				/* an organ found here whose tissue this word can be in; else the tissue just used; else recent sections / the document; else the word's own tissue */
				var L = "", guess = false;
				/* nearest organ word (within ~80 characters) whose tissue fits, then the tissue just used, then any organ named here */
				var near = null, nd = 1e9;
				orgPos.forEach(function (op) { var d = Math.abs(op.i - i), ly = ORGAN_BY[op.id].layer; if (c[1][ly] && d < nd) { nd = d; near = ly; } });
				if (near && nd <= 80) L = near;
				if (!L && sticky && c[1][sticky]) L = sticky;
				if (!L && near) L = near;
				for (k = 0; k < ctx.length && !L; k++) { var cl = ORGAN_BY[ctx[k]] && ORGAN_BY[ctx[k]].layer; if (cl && c[1][cl]) L = cl; }
				if (!L && docLay && c[1][docLay]) L = docLay;
				if (!L && c[4]) { L = c[4]; guess = true; }
				if (!L) L = lay;
				var p = L ? c[1][L] : null;
				if (p) { sticky = L; sc[p] += c[2]; why.push({ w: c[0], p: p, s: "in GNM, " + c[3] + " in " + LAYERS[L].name.toLowerCase() + " tissue belongs to " + PHASES[p].short + (guess ? " (tissue taken from the word itself)" : "") }); }
				else why.push({ w: c[0], p: "info", s: "GNM reads " + c[3] + " by the tissue it is in" + (L ? "; for " + LAYERS[L].name.toLowerCase() + " tissue there is no fixed phase" : ", and no organ was named here to decide") });
			});
		}
		var best = null, bestS = 0;
		ORDER.forEach(function (p) { if (sc[p] > bestS) { best = p; bestS = sc[p]; } });
		var total = 0; ORDER.forEach(function (p) { total += sc[p]; });
		var scenario = sc.rec >= 2 ? "hanging" : null;
		if (!best && sc.rec) best = "pcla";
		var notes = []; NOTES.forEach(function (n) { if (n[0].test(txt)) notes.push({ id: n[1], s: n[2] }); });
		if (rep) REP_NOTES.forEach(function (n) { if (n[0].test(txt) && !notes.some(function (x) { return x.id === n[1]; })) notes.push({ id: n[1], s: n[2] }); });
		return { empty: false, phase: best, conf: total ? bestS / total : 0, scores: sc, organs: org.slice(0, 5), why: why, scenario: scenario, notes: notes };
	}
	var REP_NOTES = [
		[/ (metastasis|metastases|metastatic|mets) /, "mets", "Hamer did not accept that cancer cells travel through the blood to start new tumours. In GNM, a new tumour found later is read as a new program with its own conflict, often set off by the shock of the first diagnosis or of a frightening prognosis (for example a death-fright conflict for lung nodules, an attack conflict for the pleura or peritoneum, a self-devaluation conflict for bone)."],
		[/ (diagnosis|diagnosed|prognosis|biopsy|scan showed|ct scan|mri|pet scan|pet ct) /, "dx", "GNM pays close attention to the moment a diagnosis or prognosis is given: Hamer described it as a common DHS in itself, so the date of each scan or biopsy is worth noting on a timeline."],
		[/ (chemotherapy|chemo|radiotherapy|radiation therapy|surgery|resection|resected|operation) /, "rx", "The report mentions treatment. GNM describes the course of the programs themselves; a resection, for example, removes the tissue a program was running in, so later reports are read for new programs rather than the old one."]
	];

	/* ---------------- whole reports: split into sections, read each, find dates ---------------- */
	var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
	function pad2(n) { return (n < 10 ? "0" : "") + n; }
	function findDates(s) {
		var out = [], m, re, str = String(s || "");
		function add(y, mo, d, raw, ambig) {
			y = +y; if (y < 100) y += y < 50 ? 2000 : 1900;
			if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || (d && (d < 1 || d > 31))) return;
			out.push({ raw: raw, key: y + "-" + pad2(mo) + (d ? "-" + pad2(d) : ""), ambig: !!ambig, at: m.index });
		}
		re = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g; while ((m = re.exec(str))) add(m[1], +m[2], +m[3], m[0]);
		re = /\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4}|\d{2})\b/g; while ((m = re.exec(str))) { var a = +m[1], b = +m[2]; if (a > 12) add(m[3], b, a, m[0]); else add(m[3], a, b, m[0], b <= 12 && a !== b); }
		var MN = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
		re = new RegExp("\\b" + MN + " (\\d{1,2})(?:st|nd|rd|th)?,? (\\d{4})\\b", "gi"); while ((m = re.exec(str))) add(m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2], m[0]);
		re = new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)? " + MN + ",? (\\d{4})\\b", "gi"); while ((m = re.exec(str))) add(m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1], m[0]);
		re = new RegExp("\\b" + MN + ",? (\\d{4})\\b", "gi"); while ((m = re.exec(str))) { var mi = m.index, raw = m[0]; if (!out.some(function (o) { return mi >= o.at && mi < o.at + o.raw.length + 6; })) add(m[2], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, 0, raw); }
		out.sort(function (x, y) { return x.at - y.at; });
		return out;
	}
	function isHeading(line) {
		var l = line.trim();
		if (!l || l.length > 70) return false;
		if (/:$/.test(l) && l.split(" ").length <= 8) return true;
		var letters = l.replace(/[^A-Za-z]/g, "");
		return letters.length >= 4 && letters === letters.toUpperCase() && !/[.!?]$/.test(l);
	}
	function splitLong(t, max) {
		if (t.length <= max) return [t];
		var parts = [], cur = "";
		t.split(/(?<=[.!?])\s+/).forEach(function (s) { if (cur && (cur + " " + s).length > max) { parts.push(cur); cur = s; } else cur = cur ? cur + " " + s : s; });
		if (cur) parts.push(cur);
		var out = []; parts.forEach(function (p) { while (p.length > max * 1.5) { out.push(p.slice(0, max)); p = p.slice(max); } out.push(p); });
		return out;
	}
	function sections(text) {
		var t = String(text || "").replace(/\r\n?/g, "\n").replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
		if (!t) return [];
		var out = [], head = "", lastBody = false;
		t.split(/\n\s*\n/).forEach(function (block) {
			var lines = block.split("\n"), body = [];
			lines.forEach(function (ln) {
				if (isHeading(ln)) {
					var hd = ln.trim().replace(/:$/, "");
					if (body.length) { out.push({ h: head, t: body.join(" ").trim() }); body = []; head = hd; lastBody = false; }
					else { head = head && !lastBody ? head + " · " + hd : hd; lastBody = false; }
				}
				else { body.push(ln.trim()); lastBody = true; }
			});
			if (body.length) { out.push({ h: head, t: body.join(" ").trim() }); }
		});
		/* merge very short bits into the next section with the same heading */
		var merged = [];
		out.forEach(function (s) {
			var last = merged[merged.length - 1];
			if (last && last.h === s.h && last.t.length < 40) last.t = last.t + " " + s.t; else merged.push({ h: s.h, t: s.t });
		});
		var fin = [];
		merged.forEach(function (s) { splitLong(s.t, 1600).forEach(function (p) { if (p.trim()) fin.push({ h: s.h, t: p.trim() }); }); });
		return fin.slice(0, 400);
	}
	var REPORT_MAX = 400000;
	function reviewReport(text) {
		var t = String(text || ""), tooLong = t.length > REPORT_MAX;
		if (tooLong) t = t.slice(0, REPORT_MAX);
		var secs = sections(t);
		if (!secs.length || t.replace(/\s/g, "").length < 3) return { empty: true, sections: [], timeline: [] };
		var overall = match(t, { report: true }), lay = overall.organs.length ? ORGAN_BY[overall.organs[0].id].layer : "";
		var docOrg = overall.organs.map(function (o) { return o.id; }), recent = [];
		var res = secs.map(function (s, i) {
			var r = match(s.h + " | " + s.t, { report: true, layer: lay, ctx: recent.concat(docOrg) });
			r.organs.slice().reverse().forEach(function (o) { var j = recent.indexOf(o.id); if (j >= 0) recent.splice(j, 1); recent.unshift(o.id); });
			return { i: i, h: s.h, t: s.t, r: r, dates: findDates(s.h + " | " + s.t), hits: r.why.filter(function (w) { return !w.neg; }).length + r.organs.length };
		});
		var tl = [], seen = {};
		res.forEach(function (s) { if (!s.r.phase || !s.dates.length) return; var d = s.dates[0], k = d.key + "|" + s.r.phase; if (seen[k]) return; seen[k] = 1; tl.push({ key: d.key, raw: d.raw, ambig: d.ambig, phase: s.r.phase, i: s.i, organ: s.r.organs.length ? s.r.organs[0].id : null }); });
		tl.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : a.i - b.i; });
		var words = (t.match(/\S+/g) || []).length;
		return { empty: false, tooLong: tooLong, chars: t.length, words: words, overall: overall, layer: lay, sections: res, found: res.filter(function (s) { return s.hits; }).length, timeline: tl };
	}

	var api = { PHASES: PHASES, ORDER: ORDER, LAYERS: LAYERS, LAYER_ORDER: LAYER_ORDER, ORGANS: ORGANS, ORGAN_BY: ORGAN_BY, LAWS: LAWS, GLOSSARY: GLOSSARY, SCEN: SCEN, CUES: CUES, NOTES: NOTES,
		build: build, levelAt: levelAt, phaseAt: phaseAt, sample: sample, placeFor: placeFor, cellSign: cellSign, organText: organText, focusLook: focusLook, match: match, normText: normText,
		CLIN: CLIN, LAYERED: LAYERED, CLIN_ORG: CLIN_ORG, REP_NOTES: REP_NOTES, findDates: findDates, sections: sections, reviewReport: reviewReport };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESGNM = api;
})(this);
