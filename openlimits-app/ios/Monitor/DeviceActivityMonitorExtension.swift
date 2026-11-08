import DeviceActivity

/// Wakes up when an open's time is over (and every few hours) and puts the shields back.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {
    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        if activity.rawValue.hasPrefix("tick-") { Shields.reconcile() }
    }
    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        if activity.rawValue.hasPrefix("s-") {
            let id = String(activity.rawValue.dropFirst(2))
            var s = Shared.sessions; s[id] = nil; Shared.sessions = s
        }
        Shields.reconcile()
    }
}
