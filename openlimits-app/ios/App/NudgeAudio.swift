import AVFoundation
import SwiftUI

/// Nudge sounds made by the app. An app extension can't play audio over another app, so the shield posts a
/// notification whose sound is a file made here ahead of time: the message read out by the iPhone's voice, or the
/// person's recording, with the chosen volume applied. Files live in the App Group's Library/Sounds (max 30 s).
@MainActor
final class NudgeAudio: NSObject, ObservableObject, AVAudioPlayerDelegate {
    static let shared = NudgeAudio()
    @Published var recordingFor: String?      // "default" or a limit id while recording
    @Published var recSecs = 0
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private let live = AVSpeechSynthesizer()
    private var writers: [AVSpeechSynthesizer] = []
    private var tick: Timer?

    static let maxRec: TimeInterval = 15

    // MARK: making the play files

    /// Make (or delete) every limit's ready-to-play nudge sound.
    func rebuildAll() async {
        let p = Shared.prefs
        for l in Shared.limits { await build(l, p) }
    }

    func build(_ l: LimitItem, _ p: Prefs) async {
        guard let out = NudgeFiles.play(l.id) else { return }
        try? FileManager.default.removeItem(at: out)
        let snd = Nudge.sound(p, l, locked: true)
        let gain = Float(p.vol) / 100
        if snd == NudgeSound.off || gain <= 0 { return }
        if snd == NudgeSound.rec {
            let mine = l.sound == NudgeSound.rec ? NudgeFiles.recording(l.id) : nil
            if let src = [mine, NudgeFiles.recording(nil)].compactMap({ $0 }).first(where: { NudgeFiles.exists($0) }) {
                if (try? Self.copy(src, to: out, gain: gain)) != nil { return }
            }
        }
        if let text = Nudge.text(p, l, app: Notes.inline(l), left: nil) {
            try? await speakToFile(text, out, gain: gain)
        }
    }

    /// Read [text] with the iPhone's voice into a 16-bit CAF file.
    func speakToFile(_ text: String, _ url: URL, gain: Float) async throws {
        let synth = AVSpeechSynthesizer()
        writers.append(synth)
        defer { writers.removeAll { $0 === synth } }
        let u = Self.utterance(text)
        var file: AVAudioFile?
        var failed: Error?
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            var finished = false
            synth.write(u) { buf in
                guard !finished else { return }
                guard let pcm = buf as? AVAudioPCMBuffer, pcm.frameLength > 0 else { finished = true; done.resume(); return }
                do {
                    if file == nil {
                        let settings: [String: Any] = [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: pcm.format.sampleRate,
                                                       AVNumberOfChannelsKey: pcm.format.channelCount, AVLinearPCMBitDepthKey: 16,
                                                       AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false]
                        file = try AVAudioFile(forWriting: url, settings: settings, commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)
                    }
                    Self.scale(pcm, gain)
                    try file?.write(from: pcm)
                } catch { failed = error }
            }
        }
        if let failed { throw failed }
    }

    static func utterance(_ text: String) -> AVSpeechUtterance {
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: Locale.preferredLanguages.first ?? "en-US") ?? AVSpeechSynthesisVoice(language: "en-US")
        u.rate = AVSpeechUtteranceDefaultSpeechRate
        return u
    }

    /// Copy a recording into a play file with the volume applied (at most 29 seconds).
    static func copy(_ src: URL, to dst: URL, gain: Float) throws {
        let input = try AVAudioFile(forReading: src)
        let fmt = input.processingFormat
        let settings: [String: Any] = [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: fmt.sampleRate, AVNumberOfChannelsKey: fmt.channelCount,
                                       AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false]
        let out = try AVAudioFile(forWriting: dst, settings: settings, commonFormat: fmt.commonFormat, interleaved: fmt.isInterleaved)
        let maxFrames = AVAudioFramePosition(fmt.sampleRate * 29)
        guard let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: 4096) else { return }
        while input.framePosition < min(input.length, maxFrames) {
            try input.read(into: buf)
            if buf.frameLength == 0 { break }
            scale(buf, gain)
            try out.write(from: buf)
        }
    }

    static func scale(_ b: AVAudioPCMBuffer, _ g: Float) {
        guard g < 0.999 else { return }
        let n = Int(b.frameLength) * (b.format.isInterleaved ? Int(b.format.channelCount) : 1)
        let chans = b.format.isInterleaved ? 1 : Int(b.format.channelCount)
        if let f = b.floatChannelData { for c in 0..<chans { for i in 0..<n { f[c][i] *= g } } }
        else if let s = b.int16ChannelData { for c in 0..<chans { for i in 0..<n { s[c][i] = Int16(Float(s[c][i]) * g) } } }
    }

    // MARK: previews

    func hear(_ text: String, vol: Int) {
        stop()
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        let u = Self.utterance(text)
        u.volume = Float(vol) / 100
        live.speak(u)
    }

    func play(_ url: URL, vol: Int) {
        stop()
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        try? AVAudioSession.sharedInstance().setActive(true)
        player = try? AVAudioPlayer(contentsOf: url)
        player?.volume = Float(vol) / 100
        player?.play()
    }

    func stop() {
        player?.stop(); player = nil
        if live.isSpeaking { live.stopSpeaking(at: .immediate) }
    }

    // MARK: recording

    /// Ask for the microphone and record into [url] (stops by itself after 15 seconds).
    func record(_ key: String, to url: URL, done: @escaping () -> Void) {
        stop(); stopRecording()
        AVAudioSession.sharedInstance().requestRecordPermission { ok in
            Task { @MainActor in
                guard ok else { self.denied = true; return }
                self.denied = false
                let s = AVAudioSession.sharedInstance()
                try? s.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
                try? s.setActive(true)
                let tmp = url.appendingPathExtension("part")
                let settings: [String: Any] = [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 22050, AVNumberOfChannelsKey: 1,
                                               AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false]
                guard let r = try? AVAudioRecorder(url: tmp, settings: settings), r.record(forDuration: Self.maxRec) else { return }
                self.recorder = r; self.target = url; self.onDone = done
                self.recordingFor = key; self.recSecs = 0
                self.tick = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
                    Task { @MainActor in
                        guard let r = self.recorder else { return }
                        self.recSecs = Int(r.currentTime)
                        if !r.isRecording { self.stopRecording() }
                    }
                }
            }
        }
    }
    @Published var denied = false
    private var target: URL?
    private var onDone: (() -> Void)?

    func stopRecording() {
        tick?.invalidate(); tick = nil
        guard let r = recorder else { return }
        recorder = nil
        let had = r.currentTime > 0.3 || !r.isRecording
        r.stop()
        if let t = target {
            let tmp = t.appendingPathExtension("part")
            if had, FileManager.default.fileExists(atPath: tmp.path) {
                try? FileManager.default.removeItem(at: t)
                try? FileManager.default.moveItem(at: tmp, to: t)
            } else { try? FileManager.default.removeItem(at: tmp) }
        }
        recordingFor = nil
        target = nil
        let d = onDone; onDone = nil
        d?()
    }
}
