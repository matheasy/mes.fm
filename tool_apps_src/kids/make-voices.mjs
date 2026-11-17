// Makes the MES Kids natural-voice clips: every fixed sentence of the cards (MESKids.voiceLines()) spoken by each Kokoro-82M voice in
// MESKids.AI_VOICES, saved as mes.fm/kids/voice/<voice>/<vkey>.mp3 (mono 24 kHz, 48 kbps) + index.json (the keys that exist).
// Kokoro-82M is Apache-2.0, the same model mes.fm/narration runs in the browser. Needs kokoro-js 1.2.1 installed somewhere and ffmpeg:
//   (cd <scratch> && npm i kokoro-js@1.2.1)
//   node tool_apps_src/kids/make-voices.mjs --kokoro <scratch>/node_modules/kokoro-js [--only=af_heart,bf_emma] [--force]
// Re-running only makes clips that are missing (add a card, run it again). Clips no longer used are deleted.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const here = path.dirname(new URL(import.meta.url).pathname);
const K = createRequire(import.meta.url)(path.join(here, "lib.js"));
const arg = (n) => { const a = process.argv.find((x) => x.startsWith("--" + n + "=")); const i = process.argv.indexOf("--" + n); return a ? a.split("=")[1] : i > 0 ? process.argv[i + 1] : null; };
const kdir = arg("kokoro"); if (!kdir) { console.error("--kokoro <path to node_modules/kokoro-js> is required"); process.exit(1); }
const only = (arg("only") || "").split(",").filter(Boolean), force = process.argv.includes("--force");
const out = path.join(here, "../../mes.fm/kids/voice");
const { KokoroTTS } = await import(pathToFileURL(path.join(kdir, "dist/kokoro.js")).href);
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" });
const lines = K.voiceLines(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kdv-"));
for (const [vid] of K.AI_VOICES) {
	if (only.length && !only.includes(vid)) continue;
	const dir = path.join(out, vid); fs.mkdirSync(dir, { recursive: true });
	const keys = [], t0 = Date.now(); let made = 0;
	for (const [s, letter] of lines) {
		const k = K.vkey(s), f = path.join(dir, k + ".mp3"); keys.push(k);
		if (!force && fs.existsSync(f)) continue;
		const a = await tts.generate(K.ttsText(s, letter, vid), { voice: vid, speed: K.AI_SPEED });
		const w = path.join(tmp, "x.wav"); await a.save(w);
		// trim silence at both ends, a short fade, peak-normalise to -1 dB, encode
		execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", w, "-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,afade=t=in:d=0.01,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "24000", "-ac", "1", "-b:a", "48k", f]);
		if (++made % 50 === 0) console.log(vid, made, "made", Math.round((Date.now() - t0) / 1000) + "s");
	}
	const set = new Set(keys);
	for (const f of fs.readdirSync(dir)) if (f.endsWith(".mp3") && !set.has(f.slice(0, -4))) fs.unlinkSync(path.join(dir, f));
	fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({ v: 1, voice: vid, speed: K.AI_SPEED, keys: keys.sort() }));
	console.log(vid, "done:", made, "new,", keys.length, "total");
}
