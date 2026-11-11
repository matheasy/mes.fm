import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Live Activity data for MES Timer (shared by the app and the widget extension).
public struct TimerActivityAttributes: ActivityAttributes {
    public struct Item: Codable, Hashable {
        public var title: String
        public var text: String
        public var end: Double?     // epoch seconds: counts down
        public var start: Double?   // epoch seconds: counts up (stopwatch)
    }
    public struct ContentState: Codable, Hashable {
        public var items: [Item]
    }
    public init() {}
}
#endif
