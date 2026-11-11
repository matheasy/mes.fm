import Foundation
import UIKit
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif
#if canImport(AlarmKit)
import AlarmKit
import SwiftUI
#endif

/// MES Timer native helper (iPhone):
///  liveActivity({items}) - starts / updates / ends the Live Activity (lock screen + Dynamic Island countdown).
///  alarmsAvailable({ask}) - {ok} when AlarmKit (iOS 26+) may schedule alarms; ask = request permission.
///  scheduleAlarms({items:[{at,title,body}]}) - real system alarms that ring like the Clock app (replaces the earlier ones).
///  cancel() - removes the alarms scheduled by scheduleAlarms.  openSettings() - opens this app's Settings page.
@objc(TimerStatusPlugin)
public class TimerStatusPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TimerStatusPlugin"
    public let jsName = "TimerStatus"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "liveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "alarmsAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleAlarms", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]
    private let idsKey = "mes-timer-alarm-ids"

    // MARK: Live Activity
    @objc func liveActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            let raw = call.getArray("items", JSObject.self) ?? []
            let items: [TimerActivityAttributes.Item] = raw.prefix(3).map { o in
                TimerActivityAttributes.Item(
                    title: (o["title"] as? String) ?? "Timer",
                    text: (o["text"] as? String) ?? "",
                    end: (o["end"] as? NSNumber).map { $0.doubleValue / 1000 },
                    start: (o["start"] as? NSNumber).map { $0.doubleValue / 1000 })
            }
            NSLog("MESTIMER liveActivity items=%d enabled=%d", items.count, ActivityAuthorizationInfo().areActivitiesEnabled ? 1 : 0)
            Task {
                let current = Activity<TimerActivityAttributes>.activities
                if items.isEmpty {
                    for a in current { await a.end(nil, dismissalPolicy: .immediate) }
                    call.resolve(); return
                }
                let state = TimerActivityAttributes.ContentState(items: items)
                let stale = items.compactMap { $0.end }.min().map { Date(timeIntervalSince1970: $0 + 2) }
                let content = ActivityContent(state: state, staleDate: stale)
                if let a = current.first {
                    await a.update(content)
                    for extra in current.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
                    call.resolve()
                } else if ActivityAuthorizationInfo().areActivitiesEnabled {
                    do { _ = try Activity.request(attributes: TimerActivityAttributes(), content: content, pushType: nil); call.resolve() }
                    catch { NSLog("MESTIMER activity error %@", "\(error)"); call.reject(error.localizedDescription) }
                } else {
                    call.resolve(["enabled": false])
                }
            }
            return
        }
        #endif
        call.resolve(["enabled": false])
    }

    // MARK: AlarmKit
    @objc func alarmsAvailable(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let ask = call.getBool("ask") ?? false
            Task {
                var st = AlarmManager.shared.authorizationState
                if st == .notDetermined && ask { st = (try? await AlarmManager.shared.requestAuthorization()) ?? .denied }
                NSLog("MESTIMER alarmkit state %@ ask=%d", "\(st)", ask ? 1 : 0)
                call.resolve(["ok": st == .authorized, "state": "\(st)"])
            }
            return
        }
        #endif
        call.resolve(["ok": false, "state": "unsupported"])
    }

    @objc func scheduleAlarms(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let raw = call.getArray("items", JSObject.self) ?? []
            Task {
                await self.cancelKit()
                guard AlarmManager.shared.authorizationState == .authorized else { call.reject("not authorized"); return }
                var ids: [String] = []
                for o in raw.prefix(40) {
                    guard let at = (o["at"] as? NSNumber)?.doubleValue else { continue }
                    let date = Date(timeIntervalSince1970: at / 1000)
                    if date <= Date() { continue }
                    let title = (o["title"] as? String) ?? "Time is up"
                    let id = UUID()
                    do {
                        try await self.scheduleOne(id: id, date: date, title: title)
                        ids.append(id.uuidString)
                    } catch {
                        UserDefaults.standard.set(ids, forKey: self.idsKey)
                        call.reject(error.localizedDescription); return
                    }
                }
                UserDefaults.standard.set(ids, forKey: self.idsKey)
                call.resolve(["count": ids.count])
            }
            return
        }
        #endif
        call.reject("AlarmKit needs iOS 26")
    }

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    private func scheduleOne(id: UUID, date: Date, title: String) async throws {
        let stop = AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle")
        let alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title), stopButton: stop)
        let attrs = AlarmAttributes<MESTimerAlarmMetadata>(presentation: AlarmPresentation(alert: alert), metadata: MESTimerAlarmMetadata(), tintColor: Color(red: 0.96, green: 0.61, blue: 0.08))
        let config = AlarmManager.AlarmConfiguration<MESTimerAlarmMetadata>.alarm(schedule: .fixed(date), attributes: attrs, stopIntent: nil, secondaryIntent: nil, sound: .default)
        _ = try await AlarmManager.shared.schedule(id: id, configuration: config)
    }

    @available(iOS 26.0, *)
    private func cancelKit() async {
        let ids = UserDefaults.standard.stringArray(forKey: idsKey) ?? []
        for s in ids { if let u = UUID(uuidString: s) { try? AlarmManager.shared.cancel(id: u) } }
        UserDefaults.standard.set([String](), forKey: idsKey)
    }
    #endif

    @objc func cancel(_ call: CAPPluginCall) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) { Task { await self.cancelKit(); call.resolve() }; return }
        #endif
        call.resolve()
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
            call.resolve()
        }
    }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct MESTimerAlarmMetadata: AlarmMetadata {}
#endif
