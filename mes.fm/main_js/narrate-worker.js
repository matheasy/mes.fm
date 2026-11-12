/* MES Narration worker (module worker, one per engine): turns text into speech in the browser, nothing is uploaded.
 *  - "kokoro": Kokoro-82M (Apache-2.0) through kokoro-js 1.2.1 = 28 ready-made English voices, ~90 MB (q8, any computer) or ~330 MB (GPU).
 *  - "clone":  Chatterbox (Resemble AI, MIT) through Transformers.js 4.3.2 = speaks in the voice of a 5-20 s sample, ~1.5 GB, needs WebGPU to be quick.
 * Messages in:  {id, op, a}; out: {id, progress} while loading, then {id, ok: true, r} or {id, ok: false, error}. Audio comes back as a transferred Float32Array. */
const TF = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/+esm";
const KJS = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm";
const KOKORO = "onnx-community/Kokoro-82M-v1.0-ONNX", CHATTER = "onnx-community/chatterbox-ONNX";
// Pinned model versions (Hugging Face commit ids, tested 2026-11-12): every download of these repos is sent to that exact commit instead of
// "main", so a later change or deletion on Hugging Face cannot quietly break the page. kokoro-js has no version option and fetches its
// voices from .../resolve/main/ itself, so the pinning is done here on fetch() for both libraries. To move to a newer version: test it,
// then change the id (visitors download the model once more).
const PIN = {
	"onnx-community/Kokoro-82M-v1.0-ONNX": "1939ad2a8e416c0acfeecc08a694d14ef25f2231",
	"onnx-community/chatterbox-ONNX": "3cab09af388d3f02bba43443fce88c1f4525ac43",
};
function pinUrl(u) {
	for (const repo in PIN) { const a = "https://huggingface.co/" + repo + "/resolve/main/"; if (u.startsWith(a)) return "https://huggingface.co/" + repo + "/resolve/" + PIN[repo] + "/" + u.slice(a.length); }
	return u;
}
const rawFetch = self.fetch.bind(self);
self.fetch = (input, init) => {
	if (typeof input === "string") return rawFetch(pinUrl(input), init);
	if (input instanceof URL) return rawFetch(pinUrl(input.href), init);
	if (input && input.url && pinUrl(input.url) !== input.url) return rawFetch(new Request(pinUrl(input.url), input), init);
	return rawFetch(input, init);
};
let kok = null, model = null, proc = null, T = null;
const spk = new Map();   // voice id -> encoded speaker (computed once per voice)

async function gpuInfo() {
	try { if (!self.navigator || !navigator.gpu) return { gpu: false, f16: false }; const ad = await navigator.gpu.requestAdapter(); return { gpu: !!ad, f16: !!(ad && ad.features && ad.features.has("shader-f16")) }; }
	catch (e) { return { gpu: false, f16: false }; }
}

const ops = {
	async info() { return await gpuInfo(); },
	async loadKokoro(a, prog) {
		if (kok) return { device: kok.__dev };
		const { KokoroTTS } = await import(KJS);
		const g = await gpuInfo(), device = a && a.gpu && g.gpu ? "webgpu" : "wasm";
		kok = await KokoroTTS.from_pretrained(KOKORO, { dtype: device === "webgpu" ? "fp32" : "q8", device, progress_callback: prog });
		kok.__dev = device; return { device };
	},
	async kokoro(a) {
		const out = await kok.generate(a.text, { voice: a.voice, speed: a.speed || 1 });
		return { audio: new Float32Array(out.audio), sr: out.sampling_rate || 24000 };
	},
	async loadClone(a, prog) {
		if (model) return { device: model.__dev };
		T = T || await import(TF);
		const g = await gpuInfo(), device = g.gpu && !(a && a.cpu) ? "webgpu" : "wasm";
		proc = await T.AutoProcessor.from_pretrained(CHATTER, { progress_callback: prog });
		model = await T.ChatterboxModel.from_pretrained(CHATTER, {
			device, progress_callback: prog,
			dtype: { embed_tokens: "fp32", speech_encoder: "fp32", conditional_decoder: "fp32", language_model: device === "webgpu" && g.f16 ? "q4f16" : "q4" },
		});
		model.__dev = device; return { device, f16: g.f16 };
	},
	async clone(a) {
		let s = spk.get(a.voiceId);
		if (!s) {
			if (!a.samples) throw new Error("need-voice");
			const fe = await proc.feature_extractor(a.samples);
			const o = await model.encode_speech(fe.input_values);
			s = { audio_features: o.audio_features, audio_tokens: o.audio_tokens, speaker_embeddings: o.speaker_embeddings, speaker_features: o.speaker_features };
			spk.set(a.voiceId, s);
		}
		const t = proc.tokenizer(a.text);
		const maxNew = Math.max(120, Math.min(1000, Math.round(a.text.length * 3.2 + 80)));
		const wav = await model.generate({ ...t, ...s, exaggeration: a.exaggeration == null ? 0.5 : a.exaggeration, max_new_tokens: maxNew, repetition_penalty: 1.2 });
		return { audio: new Float32Array(wav.data), sr: 24000 };
	},
	async forget(a) { spk.delete(a.voiceId); return {}; },
	async urls() { return { urls: (self.performance && performance.getEntriesByType ? performance.getEntriesByType("resource") : []).map((e) => e.name).filter((u) => u.indexOf("huggingface.co") >= 0) }; },   // for checking the pinning
};

self.onmessage = async (e) => {
	const { id, op, a } = e.data || {};
	const prog = (p) => { if (p && (p.status === "progress" || p.status === "done" || p.status === "initiate")) self.postMessage({ id, progress: { file: p.file || p.name || "", loaded: p.loaded || 0, total: p.total || 0, status: p.status } }); };
	try {
		if (!ops[op]) throw new Error("unknown op " + op);
		const r = await ops[op](a || {}, prog);
		self.postMessage({ id, ok: true, r }, r && r.audio ? [r.audio.buffer] : []);
	} catch (err) {
		self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
	}
};
