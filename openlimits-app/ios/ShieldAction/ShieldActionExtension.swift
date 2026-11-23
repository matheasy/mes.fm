import Foundation
import ManagedSettings

/// The shield's buttons. "Not now" (the big one) closes the app; "Open" uses one of today's opens;
/// "Solve maths" sends a notification that opens the app's maths screen.
class ShieldActionExtension: ShieldActionDelegate {
    private func act(_ action: ShieldAction, _ l: LimitItem?, _ done: @escaping (ShieldActionResponse) -> Void) {
        // Solve to unlock: the shield can't take typed answers, so a notification opens the app on the maths screen.
        if action == .secondaryButtonPressed, let l, Logic.needsMath(Shared.prefs, Shared.days, Logic.dayKey(), l) {
            Notes.mathPrompt(l)
            done(.close); return
        }
        guard action == .secondaryButtonPressed, let l, Logic.left(Shared.days, Logic.dayKey(), l) > 0 else {
            // "Not now" / "OK": the nudge sound (and message) as the app closes.
            if let l { Notes.nudge(l, locked: Logic.left(Shared.days, Logic.dayKey(), l) == 0) }
            done(.close); return
        }
        // A wait before opening: the first tap starts it, the shield then shows how long is left; a tap after it opens.
        let pause = Shared.prefs.pause
        let now = Date().timeIntervalSince1970
        let key = l.id.uuidString
        if pause > 0 {
            var w = Shared.waits
            let left = Logic.waitLeft(start: w[key], pause: pause, now: now)
            if w[key] == nil || now - (w[key] ?? 0) >= 600 {
                w[key] = now; Shared.waits = w
                Notes.nudge(l, locked: false)
                Notes.waitDone(l, after: pause)
                done(.defer); return   // .defer re-draws the shield with the time left
            }
            if left > 0 { done(.defer); return }
        }
        // Takes the shield down; .defer makes the system look again and show the app.
        done(Shields.open(l, extra: false) ? .defer : .close)
    }

    override func handle(action: ShieldAction, for application: ApplicationToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        act(action, Shared.limit(containing: application), completionHandler)
    }
    override func handle(action: ShieldAction, for webDomain: WebDomainToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        act(action, Shared.limit(containing: nil, web: webDomain), completionHandler)
    }
    override func handle(action: ShieldAction, for category: ActivityCategoryToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        act(action, Shared.limit(containing: nil, category: category), completionHandler)
    }
}
