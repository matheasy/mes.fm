import ManagedSettings
import ManagedSettingsUI
import UIKit

/// What the shield over a limited app looks like: opens left, or locked for today.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {
    private let bg = UIColor(red: 0.118, green: 0.106, blue: 0.294, alpha: 1)       // #1E1B4B
    private let accent = UIColor(red: 0.647, green: 0.706, blue: 0.988, alpha: 1)   // #A5B4FC

    private func make(_ name: String?, _ l: LimitItem?) -> ShieldConfiguration {
        let title = name ?? "This app"
        guard let l else {
            return ShieldConfiguration(backgroundBlurStyle: .systemUltraThinMaterialDark, backgroundColor: bg,
                                       title: .init(text: title, color: .white),
                                       subtitle: .init(text: "Open Limits", color: .lightGray),
                                       primaryButtonLabel: .init(text: "OK", color: bg), primaryButtonBackgroundColor: accent)
        }
        let day = Logic.dayKey()
        let p = Shared.prefs
        let nudge = Nudge.text(p, l, app: title, left: Logic.left(Shared.days, day, l)).map { "\n\n\u{201C}\($0)\u{201D}" } ?? ""
        let c = Logic.period(Shared.days, day, l)
        let allowed = l.limit + c.e
        let used = c.o
        let left = Logic.left(Shared.days, day, l)
        let when = l.weekly ? "this week" : "today"
        let earned = c.e > 0 ? " (\(c.e) earned with maths)" : ""
        if left == 0 {
            let canEarn = Logic.canEarn(p, Shared.days, day, l)
            let again = l.weekly ? "It unlocks on Monday." : "It unlocks at midnight."
            var sub = "You used all \(allowed) opens \(when)\(earned). \(again)"
            if canEarn {
                let more = Logic.earnLeft(p, Shared.days, day, l).map { " (\($0) left to earn today)" } ?? ""
                sub += "\n\nSolve \(p.mathCount) maths \(p.mathCount == 1 ? "problem" : "problems") to earn 1 more open\(more)."
            }
            return ShieldConfiguration(
                backgroundBlurStyle: .systemUltraThinMaterialDark, backgroundColor: bg,
                icon: UIImage(systemName: canEarn ? "function" : "lock.fill")?.withTintColor(accent, renderingMode: .alwaysOriginal),
                title: .init(text: "\(title) is locked \(l.weekly ? "until Monday" : "for today")", color: .white),
                subtitle: .init(text: sub + nudge, color: UIColor(white: 0.8, alpha: 1)),
                primaryButtonLabel: .init(text: "OK", color: bg), primaryButtonBackgroundColor: accent,
                secondaryButtonLabel: canEarn ? .init(text: "Solve maths for 1 more open", color: accent) : nil)
        }
        let after = left - 1
        let openText: String
        if p.mathMode == MathMode.everyOpen {
            openText = "Solve to open (\(left) left)"
        } else {
            let pause = p.pause
            let start = Shared.waits[l.id.uuidString]
            let now = Date().timeIntervalSince1970
            let started = start != nil && now - (start ?? 0) < 600
            let wait = Logic.waitLeft(start: start, pause: pause, now: now)
            if pause == 0 || (started && wait == 0) { openText = "Open (\(left) left)" }
            else if !started { openText = "Breathe: wait \(pause < 60 ? "\(pause) s" : "\(pause / 60) min") to open" }
            else { openText = "Wait \(wait) s more, then tap again" }
        }
        let hint = Logic.perDayHint(Shared.days, day, l).map { " About \($0) a day." } ?? ""
        return ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark, backgroundColor: bg,
            icon: UIImage(systemName: p.mathMode == MathMode.everyOpen ? "function" : "hand.raised.fill")?.withTintColor(accent, renderingMode: .alwaysOriginal),
            title: .init(text: "Open \(title)?", color: .white),
            subtitle: .init(text: "This would be open \(used + 1) of \(allowed) \(when), for \(l.session) minutes. "
                            + (after == 0 ? "It's your last one." : "\(after) left after this one.") + hint + nudge, color: UIColor(white: 0.8, alpha: 1)),
            primaryButtonLabel: .init(text: "Not now", color: bg), primaryButtonBackgroundColor: accent,
            secondaryButtonLabel: .init(text: openText, color: accent))
    }

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        make(application.localizedDisplayName, Shared.limit(containing: application.token))
    }
    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        make(application.localizedDisplayName, Shared.limit(containing: application.token, category: category.token))
    }
    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        make(webDomain.domain, Shared.limit(containing: nil, web: webDomain.token))
    }
    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        make(webDomain.domain, Shared.limit(containing: nil, category: category.token, web: webDomain.token))
    }
}
