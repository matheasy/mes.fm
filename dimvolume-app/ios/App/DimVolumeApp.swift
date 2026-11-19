import SwiftUI
import MediaPlayer
import AVFoundation
import UIKit

@main
struct DimVolumeApp: App {
    var body: some Scene { WindowGroup { ContentView() } }
}

// MARK: - Volume

/// iOS lets an app change the volume only through the system volume slider (MPVolumeView).
/// Its slider moves in any amount, unlike the side buttons (16 steps), so the app drives it in small steps.
final class VolumeModel: ObservableObject {
    @Published var level: Float = AVAudioSession.sharedInstance().outputVolume
    @Published var step: Double = UserDefaults.standard.object(forKey: "volStep") as? Double ?? 2 {   // percent per tap
        didSet { UserDefaults.standard.set(step, forKey: "volStep") }
    }
    weak var slider: UISlider?
    private var obs: NSKeyValueObservation?

    init() {
        try? AVAudioSession.sharedInstance().setActive(true, options: [])
        obs = AVAudioSession.sharedInstance().observe(\.outputVolume, options: [.new]) { [weak self] s, _ in
            DispatchQueue.main.async { self?.level = s.outputVolume }
        }
    }

    func set(_ v: Float) {
        let c = min(1, max(0, v))
        // Round to the step grid so repeated taps land on clean numbers.
        let g = Float(step) / 100
        let r = (c / g).rounded() * g
        level = min(1, max(0, r))
        slider?.setValue(level, animated: false)
        slider?.sendActions(for: .valueChanged)
    }
    func nudge(_ dir: Float) { set(level + dir * Float(step) / 100) }
}

/// The real system volume slider (also suppresses the volume pop-up while the app is open).
struct SystemVolumeSlider: UIViewRepresentable {
    let model: VolumeModel
    func makeUIView(context: Context) -> MPVolumeView {
        let v = MPVolumeView(frame: .zero)
        v.showsVolumeSlider = true
        DispatchQueue.main.async {
            model.slider = v.subviews.compactMap { $0 as? UISlider }.first
        }
        return v
    }
    func updateUIView(_ uiView: MPVolumeView, context: Context) {}
}

// MARK: - Brightness

final class BrightModel: ObservableObject {
    @Published var level: CGFloat = UIScreen.main.brightness
    @Published var step: Double = UserDefaults.standard.object(forKey: "brStep") as? Double ?? 2 {
        didSet { UserDefaults.standard.set(step, forKey: "brStep") }
    }
    init() {
        NotificationCenter.default.addObserver(forName: UIScreen.brightnessDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.level = UIScreen.main.brightness
        }
    }
    func set(_ v: CGFloat) { let c = min(1, max(0, v)); UIScreen.main.brightness = c; level = c }
    func nudge(_ dir: CGFloat) { set(level + dir * CGFloat(step) / 100) }
}

// MARK: - UI

struct ContentView: View {
    @StateObject var vol = VolumeModel()
    @StateObject var br = BrightModel()
    @AppStorage("tab") var tab = 0
    var body: some View {
        TabView(selection: $tab) {
            NavigationView { VolumeView(vol: vol) }.navigationViewStyle(.stack)
                .tabItem { Label("Volume", systemImage: "speaker.wave.2") }.tag(0)
            NavigationView { BrightnessView(br: br) }.navigationViewStyle(.stack)
                .tabItem { Label("Brightness", systemImage: "sun.max") }.tag(1)
            NavigationView { DarkerView() }.navigationViewStyle(.stack)
                .tabItem { Label("Darker", systemImage: "moon.stars") }.tag(2)
        }
    }
}

struct StepButton: View {
    let symbol: String; let label: String; let action: () -> Void
    @State private var timer: Timer?
    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 30, weight: .semibold))
            .frame(width: 86, height: 86)
            .background(Circle().fill(Color.accentColor.opacity(0.18)))
            .foregroundColor(.accentColor)
            .accessibilityLabel(label).accessibilityAddTraits(.isButton)
            .onTapGesture { action() }
            .onLongPressGesture(minimumDuration: 0.4, pressing: { down in
                if down { } else { timer?.invalidate(); timer = nil }
            }, perform: {
                timer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { _ in action() }
            })
    }
}

struct BigNumber: View {
    let value: Double
    var body: some View {
        Text("\(Int((value * 100).rounded()))%")
            .font(.system(size: 64, weight: .bold, design: .rounded)).monospacedDigit()
    }
}

struct StepPicker: View {
    @Binding var step: Double
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Each tap changes it by").font(.subheadline).foregroundColor(.secondary)
            Picker("Step", selection: $step) {
                ForEach([1.0, 2.0, 3.0, 5.0], id: \.self) { Text("\(Int($0))%").tag($0) }
            }.pickerStyle(.segmented)
        }
    }
}

struct VolumeView: View {
    @ObservedObject var vol: VolumeModel
    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                Text("Media volume").font(.headline).foregroundColor(.secondary)
                BigNumber(value: Double(vol.level))
                HStack(spacing: 40) {
                    StepButton(symbol: "minus", label: "Volume down a little") { vol.nudge(-1) }
                    StepButton(symbol: "plus", label: "Volume up a little") { vol.nudge(1) }
                }
                SystemVolumeSlider(model: vol).frame(height: 34).padding(.horizontal, 6)
                StepPicker(step: $vol.step)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Quick levels").font(.subheadline).foregroundColor(.secondary)
                    HStack {
                        ForEach([0.03, 0.08, 0.15, 0.25, 0.5], id: \.self) { v in
                            Button("\(Int(v * 100))%") { vol.set(Float(v)) }
                                .buttonStyle(.bordered).frame(maxWidth: .infinity)
                        }
                    }
                }
                Tip("The side buttons jump in 16 steps (about 6% each). Here each tap moves only the amount you pick, and the volume stays where you leave it when you go back to your music or video. Tip: Control Center's volume slider can also be dragged smoothly.")
            }.padding()
        }.navigationTitle("Fine volume")
    }
}

struct BrightnessView: View {
    @ObservedObject var br: BrightModel
    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                Text("Screen brightness").font(.headline).foregroundColor(.secondary)
                BigNumber(value: Double(br.level))
                HStack(spacing: 40) {
                    StepButton(symbol: "minus", label: "Dimmer") { br.nudge(-1) }
                    StepButton(symbol: "plus", label: "Brighter") { br.nudge(1) }
                }
                Slider(value: Binding(get: { Double(br.level) }, set: { br.set(CGFloat($0)) }), in: 0...1)
                    .padding(.horizontal, 6)
                StepPicker(step: $br.step)
                Button { br.set(0) } label: {
                    Label("Lowest brightness", systemImage: "moon.fill").frame(maxWidth: .infinity)
                }.buttonStyle(.borderedProminent).controlSize(.large)
                Tip("Need it darker than the lowest brightness? Open the Darker tab: iPhone has a built-in filter for that, and you can switch it on and off with a triple-click of the side button. If Auto-Brightness is on, iOS may change the level again later.")
            }.padding()
        }.navigationTitle("Fine brightness")
    }
}

struct Tip: View {
    let text: String
    init(_ t: String) { text = t }
    var body: some View {
        Text(text).font(.footnote).foregroundColor(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14).background(RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemBackground)))
    }
}

struct GuideStep: Identifiable { let id: Int; let title: String; let detail: String }

struct DarkerView: View {
    @AppStorage("done") var doneRaw = ""
    private var done: Set<Int> { Set(doneRaw.split(separator: ",").compactMap { Int($0) }) }
    private func toggle(_ i: Int) {
        var d = done; if d.contains(i) { d.remove(i) } else { d.insert(i) }
        doneRaw = d.sorted().map(String.init).joined(separator: ",")
    }
    let white = [
        GuideStep(id: 1, title: "Turn on Reduce White Point", detail: "Settings > Accessibility > Display & Text Size > Reduce White Point. Turn it on and drag the slider (100% is the darkest)."),
        GuideStep(id: 2, title: "Add it to the triple-click shortcut", detail: "Settings > Accessibility > Accessibility Shortcut (at the bottom) > tick Reduce White Point. Now a triple-click of the side button turns it on and off."),
        GuideStep(id: 3, title: "Then set the lowest brightness", detail: "Use the Brightness tab (or Control Center). Together with Reduce White Point the screen gets far darker than the lowest brightness alone."),
    ]
    let zoom = [
        GuideStep(id: 4, title: "Even darker: Zoom with a Low Light filter", detail: "Settings > Accessibility > Zoom. Set Zoom Filter to Low Light and Zoom Region to Full Screen Zoom, then turn Zoom on. Set the zoom level to 1x if you don't want things bigger."),
        GuideStep(id: 5, title: "Put Zoom on the shortcut too", detail: "Settings > Accessibility > Accessibility Shortcut > tick Zoom. With both ticked, a triple-click asks which one."),
        GuideStep(id: 6, title: "Night colour", detail: "Settings > Display & Brightness > Night Shift makes the screen warmer. Color Filters (Accessibility > Display & Text Size) can tint it red."),
    ]
    var body: some View {
        List {
            Section(footer: Text("Apple doesn't let apps dim other apps, so this part is a short guide to the iPhone's own settings. Tick each step as you go.")) {
                Button { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } } label: {
                    Label("Open the Settings app", systemImage: "gear")
                }
            }
            Section("Darker than the lowest brightness") { ForEach(white) { row($0) } }
            Section("Darker still") { ForEach(zoom) { row($0) } }
            Section(footer: Text("Privacy: the app keeps your settings on this iPhone only. No ads, no account, nothing is sent anywhere.")) {
                Link("mes.fm/mobile-apps", destination: URL(string: "https://mes.fm/mobile-apps#dim-volume")!)
            }
        }.navigationTitle("Darker than dark")
    }
    func row(_ s: GuideStep) -> some View {
        Button { toggle(s.id) } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: done.contains(s.id) ? "checkmark.circle.fill" : "circle")
                    .font(.title2).foregroundColor(done.contains(s.id) ? .green : .secondary)
                VStack(alignment: .leading, spacing: 4) {
                    Text(s.title).font(.headline).foregroundColor(.primary)
                    Text(s.detail).font(.subheadline).foregroundColor(.secondary)
                }
            }.padding(.vertical, 4)
        }
    }
}
