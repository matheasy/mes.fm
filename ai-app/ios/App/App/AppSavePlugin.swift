import Foundation
import UIKit
import Photos
import Capacitor

/// MES app save helper (iPhone / iPad):
///  saveBegin({name}), saveChunk({data: base64}), saveEnd({mode: "share" | "save" | "files", mime}):
///  "save" puts an image into Photos (asks for add-only access), anything else / "files" opens the Files "Save" picker,
///  "share" opens the share sheet (AirDrop, Messages, Save Image, Save to Files...).
@objc(AppSavePlugin)
public class AppSavePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppSavePlugin"
    public let jsName = "AppSave"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveBegin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveChunk", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveEnd", returnType: CAPPluginReturnPromise)
    ]
    private var outURL: URL?

    @objc func saveBegin(_ call: CAPPluginCall) {
        let name = (call.getString("name") ?? "file").replacingOccurrences(of: "/", with: "_")
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

    private func present(_ av: UIViewController, _ vc: UIViewController) {
        if let pop = av.popoverPresentationController { pop.sourceView = vc.view; pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 80, width: 1, height: 1) }
        vc.present(av, animated: true)
    }

    @objc func saveEnd(_ call: CAPPluginCall) {
        guard let url = outURL else { call.reject("saveBegin first"); return }
        let mode = call.getString("mode") ?? "share", mime = call.getString("mime") ?? ""
        if mode == "save" && mime.hasPrefix("image/") {
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { st in
                if st != .authorized && st != .limited {
                    call.resolve(["msg": "Photos access is off. Turn it on in Settings > MES AI > Photos, or use Share > Save to Files.", "saved": false]); return
                }
                PHPhotoLibrary.shared().performChanges({
                    let req = PHAssetCreationRequest.forAsset()
                    req.addResource(with: .photo, fileURL: url, options: nil)
                }) { ok, err in
                    call.resolve(["msg": ok ? "Saved to Photos: " + url.lastPathComponent : "Could not save to Photos: " + (err?.localizedDescription ?? "unknown error"), "saved": ok])
                }
            }
            return
        }
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else { call.reject("no window"); return }
            if mode == "save" || mode == "files" {
                self.present(UIDocumentPickerViewController(forExporting: [url], asCopy: true), vc)
                call.resolve(["msg": "Choose where to save " + url.lastPathComponent])
            } else {
                self.present(UIActivityViewController(activityItems: [url], applicationActivities: nil), vc)
                call.resolve(["msg": "Opened the share sheet for " + url.lastPathComponent])
            }
        }
    }
}
