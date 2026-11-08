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

    var appCount: Int { selection.applicationTokens.count + selection.categoryTokens.count + selection.webDomainTokens.count }
}

struct DayCount: Codable, Equatable {
    var o: Int = 0   // opens
    var x: Int = 0   // emergency opens after the limit
}

struct Prefs: Codable, Equatable {
    var strict = false
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
