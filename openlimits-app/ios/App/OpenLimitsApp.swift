import SwiftUI
import FamilyControls
import ManagedSettings
import Charts

@main
struct OpenLimitsApp: App {
    var body: some Scene {
        WindowGroup { ContentView().tint(Color("AccentColor")) }
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

    init() { refresh() }

    func refresh() {
        limits = Shared.limits
        days = Shared.days
        prefs = Shared.prefs
        authorized = AuthorizationCenter.shared.authorizationStatus == .approved
        if authorized { Shields.reconcile() }
    }

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
    }

    func remove(_ l: LimitItem) {
        Shields.remove(l)
        Shared.limits = Shared.limits.filter { $0.id != l.id }
        refresh()
    }

    func setStrict(_ v: Bool) { var p = Shared.prefs; p.strict = v; Shared.prefs = p; refresh() }

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
                        if l.on && Logic.left(m.days, Logic.dayKey(), l) == 0 && !m.prefs.strict {
                            HoldButton(title: "Hold 5 seconds to open anyway") { m.openAnyway(l) }
                        }
                    }
                    Button { adding = true } label: { Label("Add a limit", systemImage: "plus.circle.fill").font(.headline) }
                        .disabled(!m.authorized)
                } header: { Text("Today") }

                if !m.limits.isEmpty {
                    Section("Last 7 days") { WeekChart(days: m.days, total: m.limits.filter(\.on).reduce(0) { $0 + $1.limit }) }
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

                Section("How it works") {
                    Text("When you open a limited app, a lock screen asks if you really want to. Tap Open to use one of today's opens: the app stays open for the minutes you chose, then locks again. When the opens are used up, it stays locked until midnight.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Link("Made by MES · mes.fm", destination: URL(string: "https://mes.fm/mobile-apps")!)
                    Link("Want a feature? Tell us at mes.fm/contact", destination: URL(string: "https://mes.fm/contact?subject=Open%20Limits%20app%20idea")!)
                }
            }
            .navigationTitle("Open Limits")
            .sheet(isPresented: $adding) { EditView(model: m, item: LimitItem(), isNew: true) }
            .sheet(item: $editing) { l in EditView(model: m, item: l, isNew: false) }
            .sheet(isPresented: $strictOff) {
                WaitSheet(title: "Turn off strict mode?") { m.setStrict(false) }
            }
        }
        .onChange(of: phase) { p in if p == .active { m.refresh() } }
    }
    @State private var strictOff = false
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
        let c = Logic.used(days, Logic.dayKey(), l.id)
        let left = Logic.left(days, Logic.dayKey(), l)
        let color: Color = !l.on ? .secondary : left == 0 ? .red : left <= 1 ? .orange : .green
        let openNow = (sessionEnd ?? 0) > Date().timeIntervalSince1970
        VStack(alignment: .leading, spacing: 6) {
            AppsLabel(l: l)
            Group {
                if !l.on { Text("Paused: no limit right now") }
                else if left == 0 { Text("Locked · \(c.o) of \(l.limit) opens used" + (c.x > 0 ? " · +\(c.x) extra" : "")) }
                else { Text("\(c.o) of \(l.limit) opens · \(left) left · \(l.session) min each") }
            }.font(.subheadline).foregroundStyle(color)
            if openNow, let e = sessionEnd {
                Text("Open now, locks again at \(Date(timeIntervalSince1970: e).formatted(date: .omitted, time: .shortened))").font(.caption).foregroundStyle(.secondary)
            }
            ProgressView(value: Double(min(c.o, l.limit)), total: Double(l.limit)).tint(color)
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
            Text("Opens per day, all limits · dashed line = your total limit (\(total))").font(.caption).foregroundStyle(.secondary)
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
                    Stepper(value: $item.limit, in: 1...99) {
                        HStack { Text("Opens per day"); Spacer(); Text("\(item.limit)").font(.title2.bold()) }
                    }
                    Picker("Each open lasts", selection: $item.session) {
                        ForEach([15, 20, 30, 45, 60], id: \.self) { Text("\($0) min").tag($0) }
                    }
                } footer: {
                    Text("After \(item.limit) opens it locks until midnight. Apple doesn't allow an open shorter than 15 minutes.")
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
