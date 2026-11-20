import Foundation
import UIKit
import AVFoundation
import Capacitor

/// MES Audio native helper (iPhone / iPad):
///  start() - asks for the microphone and records with AVAudioRecorder (AAC .m4a). UIBackgroundModes "audio" keeps it going
///            with the screen locked or another app in front.
///  level() - {db} peak since the last call.  stop() - {path}.  remove({path}).
///  saveBegin({name}), saveChunk({data: base64}), saveEnd({mode: "share" | "save", mime}) - an export to the share sheet
///  (AirDrop, Messages, Save to Files...) or straight to the Files "Save" picker.
@objc(AudioNativePlugin)
public class AudioNativePlugin: CAPPlugin, CAPBridgedPlugin, AVAudioRecorderDelegate {
    public let identifier = "AudioNativePlugin"
    public let jsName = "AudioNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "level", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveBegin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveChunk", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveEnd", returnType: CAPPluginReturnPromise)
    ]
    private var recorder: AVAudioRecorder?
    private var recURL: URL?
    private var outURL: URL?

    @objc func start(_ call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        session.requestRecordPermission { granted in
            DispatchQueue.main.async {
                if !granted { call.reject("Microphone access is off. Turn it on in Settings > MES Audio > Microphone."); return }
                do {
                    try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
                    try session.setActive(true)
                    let url = FileManager.default.temporaryDirectory.appendingPathComponent("rec-\(Int(Date().timeIntervalSince1970 * 1000)).m4a")
                    let settings: [String: Any] = [
                        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                        AVSampleRateKey: 48000,
                        AVNumberOfChannelsKey: 1,
                        AVEncoderBitRateKey: 160000,
                        AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
                    ]
                    let r = try AVAudioRecorder(url: url, settings: settings)
                    r.isMeteringEnabled = true
                    r.delegate = self
                    if !r.record() { call.reject("Could not start recording"); return }
                    self.recorder = r; self.recURL = url
                    call.resolve()
                } catch { call.reject("Could not start recording: \(error.localizedDescription)") }
            }
        }
    }

    @objc func level(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let r = self.recorder else { call.resolve(["db": -90, "recording": false]); return }
            r.updateMeters()
            call.resolve(["db": Double(r.peakPower(forChannel: 0)), "recording": r.isRecording])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let r = self.recorder, let url = self.recURL else { call.reject("nothing was recorded"); return }
            r.stop(); self.recorder = nil
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
            call.resolve(["path": url.path])
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        if let p = call.getString("path"), p.hasPrefix(FileManager.default.temporaryDirectory.path) { try? FileManager.default.removeItem(atPath: p) }
        call.resolve()
    }

    @objc func saveBegin(_ call: CAPPluginCall) {
        let name = (call.getString("name") ?? "audio").replacingOccurrences(of: "/", with: "_")
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("out", isDirectory: true)
        try? FileManager.default.removeItem(at: dir)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(name)
        FileManager.default.createFile(atPath: url.path, contents: nil)
        outURL = url
        call.resolve()
    }

    @objc func saveChunk(_ call: CAPPluginCall) {
        guard let url = outURL, let s = call.getString("data"), let d = Data(base64Encoded: s) else { call.reject("bad chunk"); return }
        do { let h = try FileHandle(forWritingTo: url); h.seekToEndOfFile(); h.write(d); h.closeFile(); call.resolve() }
        catch { call.reject(error.localizedDescription) }
    }

    @objc func saveEnd(_ call: CAPPluginCall) {
        guard let url = outURL else { call.reject("saveBegin first"); return }
        let mode = call.getString("mode") ?? "share"
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else { call.reject("no window"); return }
            if mode == "save" {
                let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
                vc.present(picker, animated: true)
                call.resolve(["msg": "Choose where to save " + url.lastPathComponent])
            } else {
                let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                if let pop = av.popoverPresentationController { pop.sourceView = vc.view; pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 80, width: 1, height: 1) }
                vc.present(av, animated: true)
                call.resolve(["msg": "Opened the share sheet for " + url.lastPathComponent])
            }
        }
    }
}
