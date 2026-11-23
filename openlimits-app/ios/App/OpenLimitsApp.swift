import SwiftUI
import FamilyControls
import ManagedSettings
import Charts
import UserNotifications

@main
struct OpenLimitsApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    var body: some Scene {
        WindowGroup { ContentView().tint(Color("AccentColor")) }
    }
}

/// Which limit's maths screen to show (set when the "Tap to solve and unlock" notification is tapped).
@MainActor
final class MathRouter: ObservableObject {
    static let shared = MathRouter()
    @Published var pending: UUID?
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ app: UIApplication, didFinishLaunchingWithOptions o: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse, withCompletionHandler done: @escaping () -> Void) {
        if let s = r.notification.request.content.userInfo["mathLimit"] as? String, let id = UUID(uuidString: s) {
            Task { @MainActor in MathRouter.shared.pending = id }
        }
        done()
    }
    func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification, withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        done([.banner, .sound])
    }
}

/// The app's view of the shared store; refreshed whenever the app comes to the front (the shield writes too).
@MainActor
final class Model: ObservableObject {
    @Published var limits: [LimitItem] = []
    @Published var days: [String: [String: DayCount]] = [:]
    @Published var prefs = Prefs()
    @Published var authorized = false
    @Published var error: String?
    var isDemo = false

    init() { refresh() }

    func refresh() {
        limits = Shared.limits
        days = Shared.days
        prefs = Shared.prefs
        authorized = AuthorizationCenter.shared.authorizationStatus == .approved
        if authorized { Shields.reconcile() }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-demo") { demo() }
        if ProcessInfo.processInfo.arguments.contains("-demoMath"), MathRouter.shared.pending == nil, let l = limits.first { MathRouter.shared.pending = l.id }
        #endif
    }

    #if DEBUG
    /// Sample limits for store screenshots in the simulator (Screen Time doesn't work there). Never saved.
    private func demo() {
        isDemo = true
        // Fixed ids so a refresh keeps the same limits (the maths sheet holds one by id).
        var a = LimitItem(name: "Instagram", limit: 8), b = LimitItem(name: "TikTok", limit: 5), c = LimitItem(name: "YouTube", limit: 40)
        a.id = UUID(uuidString: "00000000-0000-0000-0000-00000000000A")!; b.id = UUID(uuidString: "00000000-0000-0000-0000-00000000000B")!
        c.id = UUID(uuidString: "00000000-0000-0000-0000-00000000000C")!; c.weekly = true
        limits = [a, b, c]
        var d: [String: [String: DayCount]] = [:]
        let cal = Calendar.current
        let past = [[5, 3, 2], [7, 4, 3], [4, 2, 4], [6, 5, 1], [3, 3, 2], [6, 4, 3]]
        for (i, v) in past.enumerated() {
            let day = Logic.dayKey(cal.date(byAdding: .day, value: -(i + 1), to: Date())!)
            d[day] = [a.id.uuidString: DayCount(o: v[0]), b.id.uuidString: DayCount(o: v[1]), c.id.uuidString: DayCount(o: v[2])]
        }
        d[Logic.dayKey()] = [a.id.uuidString: DayCount(o: 8), b.id.uuidString: DayCount(o: 2), c.id.uuidString: DayCount(o: 4)]
        days = d
        authorized = true
        prefs.pause = 30; prefs.warnAt = 3; prefs.mathMode = MathMode.whenLocked; prefs.mathLevel = 2; prefs.mathCount = 3
    }
    #endif

    func authorize() async {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            error = nil
        } catch {
            self.error = "Screen Time access wasn't allowed. Open Limits can't lock apps without it. (\(error.localizedDescription))"
        }
        refresh()
    }

    func save(_ l: LimitItem) {
        var all = Shared.limits
        if let i = all.firstIndex(where: { $0.id == l.id }) { all[i] = l } else { all.append(l) }
        Shared.limits = all
        if !l.on { Shields.unlock(l.id) }
        refresh()
        rebuildSounds(delay: 0)
    }

    private var rebuildTask: Task<Void, Never>?
    /// Remake the nudge sound files (after a message, sound, volume or recording changed).
    func rebuildSounds(delay: Double = 0.8) {
        rebuildTask?.cancel()
        rebuildTask = Task {
            if delay > 0 { try? await Task.sleep(nanoseconds: UInt64(delay * 1e9)) }
            guard !Task.isCancelled else { return }
            await NudgeAudio.shared.rebuildAll()
        }
    }

    func setNudge(_ f: (inout Prefs) -> Void) {
        var p = Shared.prefs; f(&p); Shared.prefs = p; prefs = p
        rebuildSounds()
        if p.nudge && p.sound != NudgeSound.off { Notes.ask() }
    }

    func remove(_ l: LimitItem) {
        Shields.remove(l)
        for u in [NudgeFiles.recording(l.id), NudgeFiles.play(l.id)].compactMap({ $0 }) { try? FileManager.default.removeItem(at: u) }
        Shared.limits = Shared.limits.filter { $0.id != l.id }
        refresh()
    }

    func setStrict(_ v: Bool) { var p = Shared.prefs; p.strict = v; Shared.prefs = p; refresh() }
    func setPrefs(_ f: (inout Prefs) -> Void) { var p = Shared.prefs; f(&p); Shared.prefs = p; refresh(); if p.notify || p.warnAt > 0 { Notes.ask() } }

    /// The maths was solved: earn one open if it is locked, then open it. Returns the minutes it is open for, or nil.
    func mathSolved(_ l: LimitItem) -> Int? {
        if isDemo { return l.session }
        let day = Logic.dayKey()
        let p = Shared.prefs
        if Logic.left(Shared.days, day, l) == 0 {
            guard Logic.canEarn(p, Shared.days, day, l) else { error = "No more opens to earn today for this limit."; return nil }
            Shared.addEarned(l.id)
        }
        let ok = Shields.open(l, extra: false)
        refresh()
        if !ok { error = "Couldn't start the open. Try again."; return nil }
        return max(15, l.session)
    }

    func openAnyway(_ l: LimitItem) {
        if !Shields.open(l, extra: true) { error = "Couldn't start the extra open. Try again." }
        refresh()
    }

    var streak: Int { Logic.streak(days, limits, since: Shared.since) }
    var best: Int { max(Shared.best, streak) }
    var sessionEnds: [String: Double] { Shared.sessions }
}

struct ContentView: View {
    @StateObject private var m = Model()
    @ObservedObject private var router = MathRouter.shared
    @State private var mathFor: LimitItem?
    @Environment(\.scenePhase) private var phase
    @State private var editing: LimitItem?
    @State private var adding = false

    var body: some View {
        NavigationStack {
            List {
                if !m.authorized {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Step 1: allow Screen Time access").font(.headline)
                            Text("Apple needs your OK before Open Limits can put a lock screen in front of an app. Nothing leaves your iPhone: Apple doesn't even tell Open Limits which apps you use.")
                                .font(.subheadline).foregroundStyle(.secondary)
                            Button("Allow access") { Task { await m.authorize() } }.buttonStyle(.borderedProminent).padding(.top, 4)
                        }.padding(.vertical, 6)
                    }
                }
                if let e = m.error { Section { Text(e).foregroundStyle(.red).font(.subheadline) } }

                if !m.limits.isEmpty {
                    Section {
                        HStack {
                            Text(m.streak > 0 ? "🔥 \(m.streak)-day streak" : "Start a streak today").font(.headline)
                            Spacer()
                            if m.best > 0 { Text("Best: \(m.best)").foregroundStyle(.secondary) }
                        }
                    }
                }

                Section {
                    if m.limits.isEmpty {
                        Text("No limits yet. Add the app you want to open less, like Instagram, and choose how many opens a day it gets.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(m.limits) { l in
                        LimitRow(l: l, days: m.days, sessionEnd: m.sessionEnds[l.id.uuidString])
                            .contentShape(Rectangle())
                            .onTapGesture { editing = l }
                        if l.on && Logic.needsMath(m.prefs, m.days, Logic.dayKey(), l) {
                            Button { mathFor = l } label: {
                                Label(Logic.left(m.days, Logic.dayKey(), l) == 0 ? "Solve maths for 1 more open" : "Solve to unlock", systemImage: "function")
                                    .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity)
                            }.buttonStyle(.borderedProminent)
                        }
                        if l.on && Logic.left(m.days, Logic.dayKey(), l) == 0 && !m.prefs.strict {
                            HoldButton(title: "Hold 5 seconds to open anyway") { m.openAnyway(l) }
                        }
                    }
                    Button { adding = true } label: { Label("Add a limit", systemImage: "plus.circle.fill").font(.headline) }
                        .disabled(!m.authorized)
                } header: { Text("Today") }

                if !m.limits.isEmpty {
                    Section("Last 7 days") { WeekChart(days: m.days, total: m.limits.filter(\.on).reduce(0) { $0 + ($1.weekly ? ($1.limit + 6) / 7 : $1.limit) }) }
                }

                Section("Settings") {
                    Toggle(isOn: Binding(get: { m.prefs.strict }, set: { v in
                        if !v { strictOff = true } else { m.setStrict(true) }
                    })) {
                        VStack(alignment: .leading) {
                            Text("Strict mode")
                            Text("No \"open anyway\" when locked, and loosening a limit makes you wait 30 seconds.").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    Picker("Wait before opening", selection: Binding(get: { m.prefs.pause }, set: { v in m.setPrefs { $0.pause = v } })) {
                        ForEach([0, 5, 10, 15, 30, 60, 120], id: \.self) { v in Text(v == 0 ? "None" : v < 60 ? "\(v) s" : "\(v / 60) min").tag(v) }
                    }
                    Toggle(isOn: Binding(get: { m.prefs.notify }, set: { v in m.setPrefs { $0.notify = v } })) {
                        VStack(alignment: .leading) {
                            Text("Tell me each time I open one")
                            Text("A quiet note like \"Instagram: 3/8 opens used\".").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Picker("Warn me when opens left are", selection: Binding(get: { m.prefs.warnAt }, set: { v in m.setPrefs { $0.warnAt = v } })) {
                        ForEach([0, 1, 2, 3, 5], id: \.self) { v in Text(v == 0 ? "Never" : "\(v)").tag(v) }
                    }
                } header: { Text("Wait and notifications") } footer: {
                    Text("With a wait, the first tap on Open starts it and a notification tells you when it's over. Notifications show on the lock screen; iPhone has no status-bar counter like Android.")
                }

                MathSection(m: m)

                NudgeSection(m: m)

                Section("How it works") {
                    Text("When you open a limited app, a lock screen asks if you really want to. Tap Open to use one of your opens: the app stays open for the minutes you chose, then locks again. When the opens are used up, it stays locked until midnight (or Monday for a weekly limit), unless you solve maths problems to earn one more open.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Link("Made by MES · mes.fm", destination: URL(string: "https://mes.fm/mobile-apps")!)
                    Link("Want a feature? Tell us at mes.fm/contact", destination: URL(string: "https://mes.fm/contact?subject=Open%20Limits%20app%20idea")!)
                }
            }
            .navigationTitle("Open Limits")
            .sheet(isPresented: $adding) { EditView(model: m, item: LimitItem(), isNew: true) }
            .sheet(item: $editing) { l in EditView(model: m, item: l, isNew: false) }
            .sheet(item: $mathFor) { l in MathUnlockView(m: m, l: l) }
            .sheet(isPresented: $strictOff) {
                WaitSheet(title: "Turn off strict mode?") { m.setStrict(false) }
            }
        }
        .onChange(of: phase) { p in if p == .active { m.refresh(); takePending() } }
        .onChange(of: router.pending) { _ in takePending() }
        .onAppear { takePending() }
    }
    @State private var strictOff = false

    private func takePending() {
        guard let id = router.pending else { return }
        router.pending = nil
        if let l = m.limits.first(where: { $0.id == id }) { editing = nil; adding = false; mathFor = l }
    }
}

struct AppsLabel: View {
    let l: LimitItem
    var body: some View {
        HStack(spacing: 6) {
            let apps = Array(l.selection.applicationTokens.prefix(3))
            ForEach(apps, id: \.self) { t in Label(t).labelStyle(.iconOnly).frame(width: 30, height: 30) }
            if apps.count == 1 && l.appCount == 1, let t = apps.first {
                Label(t).labelStyle(.titleOnly).font(.headline)
            } else if !l.name.isEmpty {
                Text(l.name).font(.headline)
            } else if l.appCount > apps.count || apps.isEmpty {
                Text(apps.isEmpty ? "\(l.appCount) picked" : "+\(l.appCount - apps.count) more").font(.headline)
            }
        }
    }
}

struct LimitRow: View {
    let l: LimitItem
    let days: [String: [String: DayCount]]
    let sessionEnd: Double?
    var body: some View {
        let day = Logic.dayKey()
        let c = Logic.period(days, day, l)
        let left = Logic.left(days, day, l)
        let allowed = l.limit + c.e
        let when = l.weekly ? "this week" : "today"
        let color: Color = !l.on ? .secondary : left == 0 ? .red : left <= 1 ? .orange : .green
        let openNow = (sessionEnd ?? 0) > Date().timeIntervalSince1970
        VStack(alignment: .leading, spacing: 6) {
            AppsLabel(l: l)
            Group {
                if !l.on { Text("Paused: no limit right now") }
                else if left == 0 { Text("Locked \(l.weekly ? "until Monday" : "for today") · \(c.o) of \(allowed) opens used" + (c.x > 0 ? " · +\(c.x) extra" : "")) }
                else if let per = Logic.perDayHint(days, day, l) { Text("\(c.o) of \(allowed) opens used this week · \(left) left, about \(per) a day") }
                else { Text("\(c.o) of \(allowed) opens \(when) · \(left) left · \(l.session) min each") }
            }.font(.subheadline).foregroundStyle(color)
            if c.e > 0 { Text("\(c.e) earned with maths \(when)").font(.caption).foregroundStyle(.secondary) }
            if openNow, let e = sessionEnd {
                Text("Open now, locks again at \(Date(timeIntervalSince1970: e).formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(.secondary)
            }
            ProgressView(value: Double(min(c.o, allowed)), total: Double(max(1, allowed))).tint(color)
        }.padding(.vertical, 4)
    }
}

struct WeekChart: View {
    let days: [String: [String: DayCount]]
    let total: Int
    var body: some View {
        let h = Logic.history(days, n: 7)
        VStack(alignment: .leading) {
            Chart {
                ForEach(h, id: \.0) { d, n in
                    BarMark(x: .value("Day", d, unit: .day), y: .value("Opens", n))
                        .foregroundStyle(n > total ? Color.red : Color("AccentColor"))
                        .annotation(position: .top) { Text("\(n)").font(.caption2) }
                }
                if total > 0 { RuleMark(y: .value("Limit", total)).lineStyle(StrokeStyle(lineWidth: 1, dash: [5])).foregroundStyle(.secondary) }
            }
            .chartXAxis { AxisMarks(values: .stride(by: .day)) { _ in AxisValueLabel(format: .dateTime.weekday(.abbreviated)) } }
            .frame(height: 150)
            Text("Opens per day, all limits · dashed line = your total daily limit (\(total); weekly limits count as a seventh)").font(.caption).foregroundStyle(.secondary)
        }.padding(.vertical, 6)
    }
}

/// You have to keep pressing for `seconds`: a slower, deliberate way out.
struct HoldButton: View {
    let title: String
    var seconds: Double = 5
    let action: () -> Void
    @State private var progress = 0.0
    @State private var timer: Timer?
    var body: some View {
        ZStack(alignment: .leading) {
            GeometryReader { g in Capsule().fill(Color.red.opacity(0.25)).frame(width: g.size.width * progress) }
            Text(title).font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity)
        }
        .frame(height: 44)
        .background(Capsule().fill(Color.secondary.opacity(0.15)))
        .clipShape(Capsule())
        .gesture(DragGesture(minimumDistance: 0)
            .onChanged { _ in
                guard timer == nil else { return }
                let start = Date()
                timer = Timer.scheduledTimer(withTimeInterval: 0.03, repeats: true) { t in
                    progress = min(1, Date().timeIntervalSince(start) / seconds)
                    if progress >= 1 { t.invalidate(); timer = nil; progress = 0; action() }
                }
            }
            .onEnded { _ in timer?.invalidate(); timer = nil; progress = 0 })
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { action() }
    }
}

struct WaitSheet: View {
    let title: String
    let onDone: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var left = 30
    let t = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    var body: some View {
        VStack(spacing: 18) {
            Text(title).font(.title2.bold())
            Text(left > 0 ? "Strict mode is on. Wait \(left) seconds… Still want it?" : "OK, you waited. Still want it?").multilineTextAlignment(.center)
            Button(left > 0 ? "Wait \(left)" : "Yes, do it") { onDone(); dismiss() }.buttonStyle(.borderedProminent).disabled(left > 0)
            Button("Keep it") { dismiss() }
        }
        .padding(30)
        .presentationDetents([.medium])
        .onReceive(t) { _ in if left > 0 { left -= 1 } }
    }
}

struct EditView: View {
    @ObservedObject var model: Model
    @State var item: LimitItem
    let isNew: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var picking = false
    @State private var wait: (() -> Void)?
    @State private var waiting = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button { picking = true } label: {
                        if item.appCount == 0 { Label("Choose apps", systemImage: "square.grid.2x2") }
                        else { AppsLabel(l: item) }
                    }
                } header: { Text("Apps") } footer: {
                    Text("Pick one app, or several that share the same opens (like all your social apps).")
                }
                if item.appCount > 1 || !item.name.isEmpty {
                    Section("Name (optional)") { TextField("e.g. Social apps", text: $item.name) }
                }
                Section {
                    Picker("Budget", selection: Binding(get: { item.weekly }, set: { v in
                        item.weekly = v
                        item.limit = v ? min(500, item.limit * 7) : max(1, min(99, (item.limit + 6) / 7))
                    })) {
                        Text("Per day").tag(false)
                        Text("Per week").tag(true)
                    }.pickerStyle(.segmented)
                    Stepper {
                        HStack { Text(item.weekly ? "Opens per week" : "Opens per day"); Spacer(); Text("\(item.limit)").font(.title2.bold()) }
                    } onIncrement: {
                        item.limit = min(item.maxLimit, item.limit + (item.weekly && item.limit >= 20 ? 5 : 1))
                    } onDecrement: {
                        item.limit = max(1, item.limit - (item.weekly && item.limit > 20 ? 5 : 1))
                    }
                    Picker("Each open lasts", selection: $item.session) {
                        ForEach([15, 20, 30, 45, 60], id: \.self) { Text("\($0) min").tag($0) }
                    }
                } footer: {
                    Text(item.weekly
                         ? "\(item.limit) opens to spend however you like from Monday to Sunday (about \((item.limit + 6) / 7) a day). After that it locks until Monday. Apple doesn't allow an open shorter than 15 minutes."
                         : "After \(item.limit) opens it locks until midnight. Apple doesn't allow an open shorter than 15 minutes.")
                }
                if model.prefs.nudge {
                    Section {
                        NudgeEditor(text: $item.msg, sound: $item.sound, recKey: item.id.uuidString, recURL: NudgeFiles.recording(item.id),
                                    perLimit: true, vol: model.prefs.vol, appName: item.name.isEmpty ? "this app" : item.name,
                                    placeholder: model.prefs.msg.isEmpty ? "Empty = your default message" : model.prefs.msg,
                                    defaultText: model.prefs.msg)
                    } header: { Text("Nudge message for this limit") } footer: {
                        Text("Leave it empty to use your default message from Settings.")
                    }
                }
                if !isNew {
                    Section {
                        Toggle("Limit is on", isOn: $item.on)
                        Button("Remove this limit", role: .destructive) { guarded(nil) { model.remove(item); dismiss() } }
                    }
                }
            }
            .navigationTitle(isNew ? "Add a limit" : "Edit limit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { guarded(item) { model.save(item); dismiss() } }.disabled(item.appCount == 0)
                }
            }
            .familyActivityPicker(isPresented: $picking, selection: $item.selection)
            .sheet(isPresented: $waiting) { WaitSheet(title: "Loosen this limit?") { wait?() } }
        }
    }

    private func guarded(_ next: LimitItem?, _ go: @escaping () -> Void) {
        if !isNew, model.prefs.strict, let old = model.limits.first(where: { $0.id == item.id }), Logic.loosens(old, next) {
            wait = go; waiting = true
        } else { go() }
    }
}

/// Settings: the default nudge message, its sound and volume.
struct NudgeSection: View {
    @ObservedObject var m: Model
    @State private var text = Shared.prefs.msg
    var body: some View {
        Section {
            Toggle(isOn: Binding(get: { m.prefs.nudge }, set: { v in m.setNudge { $0.nudge = v } })) {
                VStack(alignment: .leading) {
                    Text("Show my nudge message")
                    Text("Your own words on the lock screen over a limited app, and in the open notification. Each limit can have its own.").font(.caption).foregroundStyle(.secondary)
                }
            }
            if m.prefs.nudge {
                NudgeEditor(text: $text, sound: Binding(get: { m.prefs.sound }, set: { v in m.setNudge { $0.sound = v } }),
                            recKey: "default", recURL: NudgeFiles.recording(nil), perLimit: false, vol: m.prefs.vol, appName: "Instagram",
                            placeholder: "e.g. Stop opening up {app}. Touch grass instead.", defaultText: "",
                            onRecorded: { m.rebuildSounds(delay: 0) })
                    .onChange(of: text) { v in m.setNudge { $0.msg = String(v.prefix(nudgeMax)).trimmingCharacters(in: .whitespacesAndNewlines) } }
                if m.prefs.sound != NudgeSound.off || m.limits.contains(where: { $0.sound > NudgeSound.off }) {
                    VStack(alignment: .leading) {
                        Text("Sound volume: \(m.prefs.vol)%")
                        Slider(value: Binding(get: { Double(m.prefs.vol) }, set: { v in m.prefs.vol = Int(v) }), in: 0...100, step: 10) { editing in
                            if !editing { let v = m.prefs.vol; m.setNudge { $0.vol = v } }
                        }
                    }
                    Toggle("Play the sound only when it's locked", isOn: Binding(get: { m.prefs.soundLockedOnly }, set: { v in m.setNudge { $0.soundLockedOnly = v } }))
                }
            }
        } header: { Text("Nudge message") } footer: {
            if m.prefs.nudge {
                Text("{app} = the app's name, {left} = opens left. On iPhone the sound plays as a notification when you tap Not now or start the wait (Apple doesn't let the lock screen play sound). It follows your ringer volume, and the silent switch mutes it.")
            }
        }
    }
}

/// One nudge message: text, examples, sound choice, recording.
struct NudgeEditor: View {
    @Binding var text: String
    @Binding var sound: Int
    let recKey: String
    let recURL: URL?
    let perLimit: Bool
    let vol: Int
    let appName: String
    let placeholder: String
    let defaultText: String
    var onRecorded: () -> Void = {}
    @ObservedObject private var audio = NudgeAudio.shared
    @State private var hasRec = false

    var body: some View {
        TextField(placeholder, text: $text, axis: .vertical)
            .lineLimit(2...4)
            .onChange(of: text) { v in if v.count > nudgeMax { text = String(v.prefix(nudgeMax)) } }
            .onAppear { hasRec = NudgeFiles.exists(recURL) }
        Menu {
            ForEach(nudgeExamples, id: \.self) { e in Button(e) { text = e } }
            if !text.isEmpty { Divider(); Button("Clear", role: .destructive) { text = "" } }
        } label: { Label("Pick an example", systemImage: "text.quote") }
        Picker("Sound", selection: $sound) {
            if perLimit { Text("Same as default").tag(-1) }
            Text("Off").tag(NudgeSound.off)
            Text("Read it out").tag(NudgeSound.speak)
            Text("My recording").tag(NudgeSound.rec)
        }
        let spoken = Nudge.fill(text.isEmpty ? defaultText : text, app: appName, left: 3)
        if sound == NudgeSound.speak {
            Button { audio.hear(spoken, vol: vol) } label: { Label(spoken.isEmpty ? "Type a message to hear it" : "Hear it", systemImage: "play.circle") }
                .disabled(spoken.isEmpty)
        }
        if sound == NudgeSound.rec {
            if audio.recordingFor == recKey {
                Button(role: .destructive) { audio.stopRecording() } label: { Label("Stop  0:\(String(format: "%02d", audio.recSecs))", systemImage: "stop.circle.fill") }
                Text("Recording… say your message (up to 15 seconds).").font(.caption).foregroundStyle(.secondary)
            } else {
                Button {
                    if let u = recURL { audio.record(recKey, to: u) { hasRec = NudgeFiles.exists(recURL); onRecorded() } }
                } label: { Label(hasRec ? "Record again" : "Record", systemImage: "record.circle") }
                if hasRec, let u = recURL {
                    Button { audio.play(u, vol: vol) } label: { Label("Play", systemImage: "play.circle") }
                    Button("Delete recording", role: .destructive) { try? FileManager.default.removeItem(at: u); hasRec = false; onRecorded() }
                }
                Text(audio.denied ? "Open Limits needs the microphone to record: allow it in Settings > Open Limits."
                     : hasRec ? "Your recording plays when you're nudged."
                     : perLimit ? "No recording for this limit yet: your default recording plays (or the message is read out)."
                     : "No recording yet: the message is read out instead.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}


/// Settings: solve maths to unlock.
struct MathSection: View {
    @ObservedObject var m: Model
    var body: some View {
        Section {
            Picker("Solve to unlock", selection: Binding(get: { m.prefs.mathMode }, set: { v in m.setPrefs { $0.mathMode = v } })) {
                Text("Off").tag(MathMode.off)
                Text("When locked").tag(MathMode.whenLocked)
                Text("Every open").tag(MathMode.everyOpen)
            }
            if m.prefs.mathMode != MathMode.off {
                Picker("Level", selection: Binding(get: { m.prefs.mathLevel }, set: { v in m.setPrefs { $0.mathLevel = v } })) {
                    ForEach(1...5, id: \.self) { n in Text(MathGen.levelName(n)).tag(n) }
                }
                Stepper(value: Binding(get: { m.prefs.mathCount }, set: { v in m.setPrefs { $0.mathCount = v } }), in: 1...5) {
                    HStack { Text("Problems in a row"); Spacer(); Text("\(m.prefs.mathCount)").bold() }
                }
                Picker("Most opens to earn a day", selection: Binding(get: { m.prefs.mathMax }, set: { v in m.setPrefs { $0.mathMax = v } })) {
                    ForEach([0, 1, 2, 3, 5, 10], id: \.self) { v in Text(v == 0 ? "No limit" : "\(v) per app").tag(v) }
                }
            }
        } header: { Text("Solve to unlock (maths)") } footer: {
            switch m.prefs.mathMode {
            case MathMode.off: Text("Off: when an app is locked, it stays locked.")
            case MathMode.everyOpen: Text("Every open needs \(m.prefs.mathCount) correct answers in a row. When the opens are used up, solving earns one more open. A wrong answer shows the right one and starts the count again. Earned opens don't break your streak.")
            default: Text("When an app is locked, solve \(m.prefs.mathCount) maths \(m.prefs.mathCount == 1 ? "problem" : "problems") in a row to earn one more open. A wrong answer shows the right one and starts the count again. Earned opens don't break your streak.")
            }
        }
    }
}

/// The maths screen: N correct answers in a row unlock the limit.
struct MathUnlockView: View {
    @ObservedObject var m: Model
    let l: LimitItem
    @Environment(\.dismiss) private var dismiss
    @State private var problem = MathProblem(text: "", answer: 0)
    @State private var input = ""
    @State private var right = 0
    @State private var note: String?
    @State private var wrong = false
    @State private var openedFor: Int?
    @FocusState private var focused: Bool

    private var name: String { l.name.isEmpty ? Notes.name(l) : l.name }
    private var need: Int { m.prefs.mathCount }

    var body: some View {
        NavigationStack {
            VStack(spacing: 22) {
                if let mins = openedFor {
                    Spacer()
                    Image(systemName: "lock.open.fill").font(.system(size: 54)).foregroundStyle(.green)
                    Text("Unlocked").font(.largeTitle.bold())
                    Text("Unlocked for \(mins) minutes: go back to \(name).").font(.title3).multilineTextAlignment(.center)
                    Button("Done") { dismiss() }.buttonStyle(.borderedProminent).controlSize(.large)
                    Spacer()
                } else {
                    let locked = Logic.left(m.days, Logic.dayKey(), l) == 0
                    let more = Logic.earnLeft(m.prefs, m.days, Logic.dayKey(), l).map { " (\($0) left to earn today)" } ?? ""
                    Text(locked ? "Solve \(need) \(need == 1 ? "problem" : "problems") to earn 1 more open of \(name)\(more)"
                                : "Solve \(need) \(need == 1 ? "problem" : "problems") to open \(name)")
                        .font(.headline).multilineTextAlignment(.center).padding(.top, 8)
                    HStack(spacing: 10) {
                        ForEach(0..<need, id: \.self) { i in
                            Circle().fill(i < right ? Color.green : Color.secondary.opacity(0.25)).frame(width: 16, height: 16)
                        }
                    }
                    Text(MathGen.levelName(m.prefs.mathLevel)).font(.caption).foregroundStyle(.secondary)
                    Text(problem.text + (problem.text.contains("=") ? "" : " = ?"))
                        .font(.system(size: 40, weight: .bold, design: .rounded)).minimumScaleFactor(0.5).lineLimit(1)
                        .padding(.vertical, 6)
                    TextField("Answer", text: $input)
                        .keyboardType(.numberPad).font(.system(size: 34, weight: .semibold, design: .rounded))
                        .multilineTextAlignment(.center).frame(maxWidth: 220)
                        .padding(10).background(RoundedRectangle(cornerRadius: 12).fill(Color.secondary.opacity(0.12)))
                        .focused($focused)
                        .onChange(of: input) { v in let d = v.filter(\.isNumber); if d != v || d.count > 6 { input = String(d.prefix(6)) } }
                        .onSubmit(check)
                    if let note { Text(note).font(.subheadline).foregroundStyle(wrong ? .red : .green).multilineTextAlignment(.center) }
                    Button(action: check) { Text("Check").font(.headline).frame(maxWidth: 220) }
                        .buttonStyle(.borderedProminent).controlSize(.large).disabled(input.isEmpty)
                    Spacer()
                }
            }
            .padding()
            .navigationTitle("Solve to unlock")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(openedFor == nil ? "Not now" : "Close") { dismiss() } } }
            .onAppear { next(); focused = true }
        }
    }

    private func next() {
        var g = SystemRandomNumberGenerator()
        var p = MathGen.make(level: m.prefs.mathLevel, rng: &g)
        while p == problem { p = MathGen.make(level: m.prefs.mathLevel, rng: &g) }
        problem = p; input = ""
    }

    private func check() {
        guard let v = Int(input) else { return }
        if v == problem.answer {
            right += 1; wrong = false
            if right >= need {
                if let mins = m.mathSolved(l) { openedFor = mins; note = nil } else { note = m.error ?? "Couldn't unlock."; wrong = true }
                return
            }
            note = "Correct! \(need - right) more to go"
        } else {
            wrong = true
            let shown = problem.text.contains("=") ? "x = \(problem.answer)" : "\(problem.text) = \(problem.answer)"
            note = "Not quite: \(shown). Try this one."
            right = 0
        }
        next()
    }
}
