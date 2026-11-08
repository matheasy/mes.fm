import ManagedSettings

/// The shield's buttons. "Not now" (the big one) closes the app; "Open" uses one of today's opens.
class ShieldActionExtension: ShieldActionDelegate {
    private func act(_ action: ShieldAction, _ l: LimitItem?, _ done: @escaping (ShieldActionResponse) -> Void) {
        guard action == .secondaryButtonPressed, let l, Logic.left(Shared.days, Logic.dayKey(), l) > 0 else {
            done(.close); return
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
