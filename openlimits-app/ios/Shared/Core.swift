import Foundation
import FamilyControls
import ManagedSettings
import DeviceActivity

// Shared by the app and its three extensions (shield look, shield buttons, schedule monitor).
// Everything is stored in the App Group, on this phone only.

let appGroup = "group.fm.mes.openlimits"

/// One limit: one or more apps (they share the opens), N opens a day, each open lasts `session` minutes.
struct LimitItem: Codable, Identifiable, Equatable {
    var id = UUID()
    var name: String = ""
    var selection = FamilyActivitySelection()
    var limit: Int = 5
    /// Minutes one open lasts (Apple's schedules can't be shorter than 15).
    var session: Int = 15
    var on: Bool = true
    /// Own nudge message ("" = use the default one).
    var msg: String = ""
    /// Sound: -1 = same as the default, else NudgeSound.off / speak / rec.
    var sound: Int = -1

    init() {}
    init(name: String, limit: Int) { self.name = name; self.limit = limit }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(UUID.self, forKey: .id)) ?? UUID()
        name = (try? c.decode(String.self, forKey: .name)) ?? ""
        selection = (try? c.decode(FamilyActivitySelection.self, forKey: .selection)) ?? FamilyActivitySelection()
        limit = (try? c.decode(Int.self, forKey: .limit)) ?? 5
        session = (try? c.decode(Int.self, forKey: .session)) ?? 15
        on = (try? c.decode(Bool.self, forKey: .on)) ?? true
        msg = (try? c.decode(String.self, forKey: .msg)) ?? ""
        sound = (try? c.decode(Int.self, forKey: .sound)) ?? -1
    }

    var appCount: Int { selection.applicationTokens.count + selection.categoryTokens.count + selection.webDomainTokens.count }
}

struct DayCount: Codable, Equatable {
    var o: Int = 0   // opens
    var x: Int = 0   // emergency opens after the limit
}

struct Prefs: Codable, Equatable {
    var strict = false
    /// Seconds to wait on the lock screen before "Open" works (0 = no wait).
    var pause = 0
    /// A notification after each open: "Instagram: 3/8 opens used".
    var notify = true
    /// Warn when this many opens or fewer are left (0 = never).
    var warnAt = 3
    /// Nudge messages: shown on the lock screen and in notifications.
    var nudge = true
    /// The default nudge message ("" = none). {app} and {left} are filled in.
    var msg = ""
    /// Default nudge sound (NudgeSound).
    var sound = NudgeSound.off
    /// Nudge sound volume 0-100 (of the ringer volume).
    var vol = 80
    /// Play the sound only when the app is locked for today.
    var soundLockedOnly = false

    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        strict = (try? c.decode(Bool.self, forKey: .strict)) ?? false
        pause = (try? c.decode(Int.self, forKey: .pause)) ?? 0
        notify = (try? c.decode(Bool.self, forKey: .notify)) ?? true
        warnAt = (try? c.decode(Int.self, forKey: .warnAt)) ?? 3
        nudge = (try? c.decode(Bool.self, forKey: .nudge)) ?? true
        msg = (try? c.decode(String.self, forKey: .msg)) ?? ""
        sound = (try? c.decode(Int.self, forKey: .sound)) ?? NudgeSound.off
        vol = (try? c.decode(Int.self, forKey: .vol)) ?? 80
        soundLockedOnly = (try? c.decode(Bool.self, forKey: .soundLockedOnly)) ?? false
    }
}

enum NudgeSound {
    static let off = 0
    /// The iPhone's voice reads the message (made into a sound file by the app).
    static let speak = 1
    /// A voice note recorded in the app.
    static let rec = 2
}

/// Ready-made nudge messages to pick from.
let nudgeExamples = [
    "Stop opening up {app}. Touch grass instead.",
    "Checking your portfolio won't make it go up.",
    "Is this really why you picked up your phone?",
    "Put the phone down and go for a walk.",
    "Nothing new happened since last time.",
    "Future you will thank you for closing {app}.",
    "Drink some water and stretch first.",
    "Only {left} opens left today. Spend them well.",
]
let nudgeMax = 160

enum Nudge {
    /// Fill in {app} and {left} ({left} = nil: "a few", for the spoken file made ahead of time).
    static func fill(_ t: String, app: String, left: Int?) -> String {
        var s = t.replacingOccurrences(of: "{app}", with: app, options: .caseInsensitive)
        s = s.replacingOccurrences(of: "{left}", with: left.map(String.init) ?? "a few", options: .caseInsensitive)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    static func raw(_ p: Prefs, _ l: LimitItem) -> String? {
        guard p.nudge else { return nil }
        let t = l.msg.trimmingCharacters(in: .whitespaces).isEmpty ? p.msg : l.msg
        return t.trimmingCharacters(in: .whitespaces).isEmpty ? nil : t
    }
    static func text(_ p: Prefs, _ l: LimitItem, app: String, left: Int?) -> String? {
        raw(p, l).map { fill($0, app: app, left: left) }
    }
    static func sound(_ p: Prefs, _ l: LimitItem, locked: Bool) -> Int {
        guard p.nudge, p.vol > 0, !(p.soundLockedOnly && !locked) else { return NudgeSound.off }
        return (NudgeSound.off...NudgeSound.rec).contains(l.sound) ? l.sound : p.sound
    }
}

/// Nudge sound files live in the App Group's Library/Sounds, where notifications can play them.
enum NudgeFiles {
    static var dir: URL? {
        guard let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else { return nil }
        let d = base.appendingPathComponent("Library/Sounds", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    /// The person's own recording: nil = the default one, else one limit's.
    static func recording(_ id: UUID?) -> URL? { dir?.appendingPathComponent("rec-\(id?.uuidString ?? "default").caf") }
    /// The ready-to-play sound for one limit (spoken message or recording, volume applied). Made by the app.
    static func play(_ id: UUID) -> URL? { dir?.appendingPathComponent("nudge-\(id.uuidString).caf") }
    static func exists(_ u: URL?) -> Bool { u.map { FileManager.default.fileExists(atPath: $0.path) } ?? false }
}

enum Logic {
    static func dayKey(_ d: Date = Date(), cal: Calendar = .current) -> String {
        let c = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    static func used(_ days: [String: [String: DayCount]], _ day: String, _ id: UUID) -> DayCount {
        days[day]?[id.uuidString] ?? DayCount()
    }

    static func left(_ days: [String: [String: DayCount]], _ day: String, _ l: LimitItem) -> Int {
        max(0, l.limit - used(days, day, l.id).o)
    }

    /// A day is kept when no limit went over and no emergency open was used.
    static func dayKept(_ days: [String: [String: DayCount]], _ day: String, _ limits: [LimitItem]) -> Bool {
        guard let d = days[day] else { return true }
        return !limits.contains { l in
            guard let c = d[l.id.uuidString] else { return false }
            return c.x > 0 || c.o > l.limit
        }
    }

    static func streak(_ days: [String: [String: DayCount]], _ limits: [LimitItem], since: String, today: Date = Date(), cal: Calendar = .current) -> Int {
        guard !limits.isEmpty, !since.isEmpty else { return 0 }
        var n = dayKept(days, dayKey(today, cal: cal), limits) ? 1 : 0
        var d = cal.date(byAdding: .day, value: -1, to: today)!
        while dayKey(d, cal: cal) >= since && dayKept(days, dayKey(d, cal: cal), limits) {
            n += 1
            d = cal.date(byAdding: .day, value: -1, to: d)!
        }
        return n
    }

    static func history(_ days: [String: [String: DayCount]], n: Int, today: Date = Date(), cal: Calendar = .current) -> [(Date, Int)] {
        (0..<n).reversed().map { back in
            let d = cal.date(byAdding: .day, value: -back, to: today)!
            let total = days[dayKey(d, cal: cal)]?.values.reduce(0) { $0 + $1.o + $1.x } ?? 0
            return (d, total)
        }
    }

    static func loosens(_ old: LimitItem, _ new: LimitItem?) -> Bool {
        guard let new else { return old.on }
        return old.on && (!new.on || new.limit > old.limit || new.session > old.session)
    }

    /// Text of the notification after an open: (title, body).
    static func openMessage(_ name: String, used: Int, limit: Int, extra: Bool, warnAt: Int) -> (String, String) {
        let left = max(0, limit - used)
        if extra { return ("\(name): extra open", "Over today's limit. It locks again when the open's time is up.") }
        if left == 0 { return ("\(name): last open used", "\(used)/\(limit) opens used. It locks until midnight.") }
        if warnAt > 0 && left <= warnAt { return ("WARNING: \(left) \(left == 1 ? "open" : "opens") left of \(name)", "\(used)/\(limit) opens used today.") }
        return ("\(name): \(used)/\(limit) opens used", "\(left) left today.")
    }

    /// Seconds still to wait before "Open" works (0 = ready). The wait starts at the first tap on Open.
    static func waitLeft(start: Double?, pause: Int, now: Double) -> Int {
        guard pause > 0 else { return 0 }
        guard let start, now - start < 600 else { return pause }   // no wait started (or an old one): the full wait
        return max(0, Int((Double(pause) - (now - start)).rounded(.up)))
    }

    /// Keep 120 days.
    static func prune(_ days: [String: [String: DayCount]], today: Date = Date()) -> [String: [String: DayCount]] {
        let cut = dayKey(Calendar.current.date(byAdding: .day, value: -120, to: today)!)
        return days.filter { $0.key >= cut }
    }
}

/// Reads and writes the App Group store. Every call re-reads, because the extensions write too.
enum Shared {
    static let d = UserDefaults(suiteName: appGroup) ?? .standard

    private static func get<T: Decodable>(_ k: String, _ def: T) -> T {
        guard let data = d.data(forKey: k), let v = try? JSONDecoder().decode(T.self, from: data) else { return def }
        return v
    }
    private static func put<T: Encodable>(_ k: String, _ v: T) {
        if let data = try? JSONEncoder().encode(v) { d.set(data, forKey: k) }
    }

    static var limits: [LimitItem] { get { get("limits", []) } set { put("limits", newValue) } }
    static var days: [String: [String: DayCount]] { get { get("days", [:]) } set { put("days", Logic.prune(newValue)) } }
    /// limit id -> end of the current open (seconds since 1970).
    static var sessions: [String: Double] { get { get("sessions", [:]) } set { put("sessions", newValue) } }
    static var prefs: Prefs { get { get("prefs", Prefs()) } set { put("prefs", newValue) } }
    static var since: String {
        get { if let s = d.string(forKey: "since") { return s }; let s = Logic.dayKey(); d.set(s, forKey: "since"); return s }
    }
    /// limit id -> when the wait on the lock screen started (seconds since 1970).
    static var waits: [String: Double] { get { get("waits", [:]) } set { put("waits", newValue) } }
    static var best: Int { get { d.integer(forKey: "best") } set { d.set(newValue, forKey: "best") } }

    static func limit(containing app: ApplicationToken?, category: ActivityCategoryToken? = nil, web: WebDomainToken? = nil) -> LimitItem? {
        limits.first { l in
            if let app, l.selection.applicationTokens.contains(app) { return true }
            if let category, l.selection.categoryTokens.contains(category) { return true }
            if let web, l.selection.webDomainTokens.contains(web) { return true }
            return false
        }
    }

    static func addOpen(_ id: UUID, extra: Bool) {
        var all = days
        let day = Logic.dayKey()
        var m = all[day] ?? [:]
        var c = m[id.uuidString] ?? DayCount()
        if extra { c.x += 1 } else { c.o += 1 }
        m[id.uuidString] = c
        all[day] = m
        days = all
        let s = Logic.streak(all, limits, since: since)
        if s > best { best = s }
    }
}

/// Puts the shields up and takes them down. One named store per limit, so one limit can open while others stay locked.
enum Shields {
    static func store(_ id: UUID) -> ManagedSettingsStore { ManagedSettingsStore(named: .init("l-" + id.uuidString)) }

    static func lock(_ l: LimitItem) {
        let s = store(l.id)
        guard l.on else { s.clearAllSettings(); return }
        s.shield.applications = l.selection.applicationTokens.isEmpty ? nil : l.selection.applicationTokens
        s.shield.applicationCategories = l.selection.categoryTokens.isEmpty ? nil : .specific(l.selection.categoryTokens)
        s.shield.webDomains = l.selection.webDomainTokens.isEmpty ? nil : l.selection.webDomainTokens
        s.shield.webDomainCategories = l.selection.categoryTokens.isEmpty ? nil : .specific(l.selection.categoryTokens)
    }

    static func unlock(_ id: UUID) { store(id).clearAllSettings() }

    /// Count an open (or an emergency open), take the shield down and lock again when the open's time is up.
    @discardableResult
    static func open(_ l: LimitItem, extra: Bool) -> Bool {
        let now = Date()
        let end = now.addingTimeInterval(Double(max(15, l.session)) * 60)
        let name = DeviceActivityName("s-" + l.id.uuidString)
        let cal = Calendar.current
        let sched = DeviceActivitySchedule(
            intervalStart: cal.dateComponents([.hour, .minute, .second], from: now),
            intervalEnd: cal.dateComponents([.hour, .minute, .second], from: end),
            repeats: false)
        let center = DeviceActivityCenter()
        center.stopMonitoring([name])
        do { try center.startMonitoring(name, during: sched) } catch { return false }
        Shared.addOpen(l.id, extra: extra)
        var w = Shared.waits; w[l.id.uuidString] = nil; Shared.waits = w
        Notes.afterOpen(l, extra: extra)
        var s = Shared.sessions; s[l.id.uuidString] = end.timeIntervalSince1970; Shared.sessions = s
        unlock(l.id)
        return true
    }

    /// Make every shield match the saved state: locked unless its open's time is still running.
    static func reconcile() {
        let now = Date().timeIntervalSince1970
        var sessions = Shared.sessions
        let limits = Shared.limits
        for l in limits {
            if let end = sessions[l.id.uuidString], end > now, l.on { continue }
            sessions[l.id.uuidString] = nil
            lock(l)
        }
        // Limits that were removed: drop their stores.
        let ids = Set(limits.map { $0.id.uuidString })
        for k in sessions.keys where !ids.contains(k) { sessions[k] = nil }
        Shared.sessions = sessions
        ensureTicks()
    }

    /// Repeating 3-hour windows so the monitor wakes up regularly and re-locks anything left open by mistake.
    static func ensureTicks() {
        let center = DeviceActivityCenter()
        let have = Set(center.activities.map { $0.rawValue })
        for i in 0..<8 where !have.contains("tick-\(i)") {
            let sched = DeviceActivitySchedule(
                intervalStart: DateComponents(hour: i * 3, minute: 0),
                intervalEnd: DateComponents(hour: i * 3 + 2, minute: 59, second: 59),
                repeats: true)
            try? center.startMonitoring(DeviceActivityName("tick-\(i)"), during: sched)
        }
    }

    static func remove(_ l: LimitItem) {
        unlock(l.id)
        DeviceActivityCenter().stopMonitoring([DeviceActivityName("s-" + l.id.uuidString)])
    }
}

import UserNotifications

/// Local notifications (the app asks for permission; the shield extensions post them).
enum Notes {
    static func name(_ l: LimitItem) -> String { l.name.isEmpty ? (l.appCount == 1 ? "This app" : "These apps") : l.name }
    /// The name inside a sentence ("Stop opening up this app").
    static func inline(_ l: LimitItem) -> String { l.name.isEmpty ? (l.appCount == 1 ? "this app" : "these apps") : l.name }

    static func afterOpen(_ l: LimitItem, extra: Bool) {
        let p = Shared.prefs
        guard p.notify || extra || p.warnAt > 0 else { return }
        let used = Logic.used(Shared.days, Logic.dayKey(), l.id).o
        let left = max(0, l.limit - used)
        let warn = extra || left == 0 || (p.warnAt > 0 && left <= p.warnAt)
        if !p.notify && !warn { return }
        var (t, b) = Logic.openMessage(name(l), used: used, limit: l.limit, extra: extra, warnAt: p.warnAt)
        if let n = Nudge.text(p, l, app: inline(l), left: left) { b += "\n" + n }
        post(id: "open-" + l.id.uuidString, title: t, body: b, sound: warn, at: nil)
    }

    /// The nudge sound (and message) when the lock screen is dismissed or an open starts.
    static func nudge(_ l: LimitItem, locked: Bool) {
        let p = Shared.prefs
        guard Nudge.sound(p, l, locked: locked) != NudgeSound.off, let f = NudgeFiles.play(l.id), NudgeFiles.exists(f) else { return }
        let left = Logic.left(Shared.days, Logic.dayKey(), l)
        let c = UNMutableNotificationContent()
        c.title = name(l)
        c.body = Nudge.text(p, l, app: inline(l), left: left) ?? (locked ? "Locked for today." : "Do you really need it right now?")
        c.sound = UNNotificationSound(named: UNNotificationSoundName(f.lastPathComponent))
        if #available(iOS 15.0, *) { c.interruptionLevel = .timeSensitive }
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "nudge-" + l.id.uuidString, content: c, trigger: nil))
    }

    /// "You can open it now" when a lock-screen wait is over.
    static func waitDone(_ l: LimitItem, after seconds: Int) {
        post(id: "wait-" + l.id.uuidString, title: "\(name(l)): the wait is over", body: "Go back and tap Open to use one of today's opens.", sound: true, at: seconds)
    }

    static func post(id: String, title: String, body: String, sound: Bool, at: Int?) {
        let c = UNMutableNotificationContent()
        c.title = title; c.body = body
        if sound { c.sound = .default }
        if #available(iOS 15.0, *) { c.interruptionLevel = sound ? .timeSensitive : .passive }
        let trig = at.map { UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(max(1, $0)), repeats: false) }
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: trig))
    }

    static func ask() { UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in } }
}
