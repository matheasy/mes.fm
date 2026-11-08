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
        let used = Logic.used(Shared.days, day, l.id).o
        let left = Logic.left(Shared.days, day, l)
        if left == 0 {
            return ShieldConfiguration(
                backgroundBlurStyle: .systemUltraThinMaterialDark, backgroundColor: bg,
                icon: UIImage(systemName: "lock.fill")?.withTintColor(accent, renderingMode: .alwaysOriginal),
                title: .init(text: "\(title) is locked for today", color: .white),
                subtitle: .init(text: "You used all \(l.limit) opens. It unlocks at midnight.", color: UIColor(white: 0.8, alpha: 1)),
                primaryButtonLabel: .init(text: "OK", color: bg), primaryButtonBackgroundColor: accent)
        }
        let after = left - 1
        return ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark, backgroundColor: bg,
            icon: UIImage(systemName: "hand.raised.fill")?.withTintColor(accent, renderingMode: .alwaysOriginal),
            title: .init(text: "Open \(title)?", color: .white),
            subtitle: .init(text: "This would be open \(used + 1) of \(l.limit) today, for \(l.session) minutes. "
                            + (after == 0 ? "It's your last one." : "\(after) left after this one."), color: UIColor(white: 0.8, alpha: 1)),
            primaryButtonLabel: .init(text: "Not now", color: bg), primaryButtonBackgroundColor: accent,
            secondaryButtonLabel: .init(text: "Open (\(left) left)", color: accent))
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
