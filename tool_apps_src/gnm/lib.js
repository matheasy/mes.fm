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
			color: "#dc2626" },
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
			color: "#2563eb" },
		ec: { name: "Epileptoid crisis (EC)", short: "EC", g: "ec",
			sum: "Hamer described the epileptic or epileptoid crisis (EC) as a short return to sympathicotonia at the deepest point of the healing phase, which squeezes the edema out of the brain relay.",
			psyche: "The conflict is briefly relived, as if once more; restless, tense for hours.",
			body: "Chills, cold sweat, cold hands, palpitations, sometimes cramps, intense pain or a seizure-like attack, depending on the germ layer.",
			brain: "In GNM, the edema of the Hamer focus is pressed out; the focus contracts.",
			microbes: "Microbes keep working; the crisis is the peak of the program in GNM.",
			color: "#ea580c" },
		pclb: { name: "Healing phase PCL-B", short: "PCL-B", g: "pclb",
			sum: "PCL-B is the second half of healing in GNM: the edema leaves the body (urinary phase), scar tissue forms and the rhythm returns towards normotonia.",
			psyche: "Energy returns, the mood lifts, the episode feels finished.",
			body: "Passing a lot of urine as the fluid leaves (the 'pee phase'), swelling goes down, scars or indurations may remain, strength comes back.",
			brain: "Glia (connective tissue of the brain) is laid down in the Hamer focus; on CT it shows white.",
			microbes: "Microbial work comes to an end.",
			color: "#0891b2" }
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
			"Brain stem, right side.", ["stomach", "indigestion", "heartburn", "nausea"], {}),
		O("intestine", "Small intestine and colon", "endo", 110, 212, "Indigestible-morsel conflict, often about money, food or 'something nasty' that can't be passed on.",
			"Flat or cauliflower-like growth, more digestive secretion.", "Breakdown by fungi and mycobacteria, possible diarrhoea with blood or mucus, night sweats.", "Colicky cramps.",
			"Brain stem, right side (small intestine) and left side (colon end).", ["intestine", "bowel", "gut", "colon", "diarrhea", "diarrhoea", "constipation", "belly", "abdomen"], { "diarrhea": "pcla", "diarrhoea": "pcla" }),
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
			seg("ec", t, t + 4); events.push({ t: t + 1.6, id: "ec", label: "EC" }); k(t + 1.6, a * 0.35); k(t + 3.2, depth * 0.7); k(t + 4, depth * 0.62); t += 4;
			var bLen = P * 0.5; seg("pclb", t, t + bLen); k(t + bLen * 0.5, depth * 0.3); t += bLen; k(t, 0);
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
	function match(text) {
		var txt = normText(text), sc = { norm: 0, dhs: 0, ca: 0, cl: 0, pcla: 0, ec: 0, pclb: 0, rec: 0 }, why = [], used = [];
		if (txt.trim().length < 2) return { empty: true, phase: null, scores: sc, organs: [], why: [] };
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
			var hits = [], score = 0;
			o.kw.forEach(function (k) {
				findAll(txt, k).forEach(function (i) {
					if (negated(txt, i)) return;
					for (var u = 0; u < used.length; u++) if (i < used[u][1] && i + k.length + 1 > used[u][0] && used[u][1] - used[u][0] > k.length + 1) return;   /* "cold" inside "cold hands" */
					if (hits.indexOf(k) < 0) { hits.push(k); score += k.indexOf(" ") > 0 ? 3 : 2; }
					var cp = o.cue[k]; if (cp) { sc[cp] += 2; why.push({ w: k, p: cp, o: o.id, s: "in GNM, '" + k + "' on the " + o.name.toLowerCase() + " belongs to " + PHASES[cp].short }); }
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
		return { empty: false, phase: best, conf: total ? bestS / total : 0, scores: sc, organs: org.slice(0, 5), why: why, scenario: scenario };
	}

	var api = { PHASES: PHASES, ORDER: ORDER, LAYERS: LAYERS, LAYER_ORDER: LAYER_ORDER, ORGANS: ORGANS, ORGAN_BY: ORGAN_BY, LAWS: LAWS, GLOSSARY: GLOSSARY, SCEN: SCEN, CUES: CUES,
		build: build, levelAt: levelAt, phaseAt: phaseAt, sample: sample, placeFor: placeFor, cellSign: cellSign, organText: organText, focusLook: focusLook, match: match, normText: normText };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESGNM = api;
})(this);
