import WidgetKit
import SwiftUI
import ActivityKit

private let accent = Color(red: 0.96, green: 0.61, blue: 0.08)

@available(iOS 16.2, *)
private struct TimeText: View {
    let item: TimerActivityAttributes.Item
    var stale: Bool = false
    var body: some View {
        if let f = item.frozen {
            Text(f).monospacedDigit()
        } else if let e = item.end, stale || e <= Date().timeIntervalSince1970 {
            Text("Done").fontWeight(.bold)
        } else if let e = item.end {
            let end = Date(timeIntervalSince1970: e)
            Text(timerInterval: Date()...max(end, Date()), countsDown: true).monospacedDigit()
        } else if let s = item.start {
            Text(Date(timeIntervalSince1970: s), style: .timer).monospacedDigit()
        } else {
            Text(item.text)
        }
    }
}

@available(iOS 16.2, *)
struct TimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TimerActivityAttributes.self) { ctx in
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(ctx.state.items.enumerated()), id: \.offset) { _, it in
                    // the time is the main, big line (like the phone's own Clock app); the name under it
                    HStack(alignment: .center, spacing: 12) {
                        Image(systemName: it.frozen != nil ? "pause.circle.fill" : it.start != nil ? "stopwatch" : "timer").font(.title2).foregroundColor(accent)
                        VStack(alignment: .leading, spacing: 0) {
                            TimeText(item: it, stale: ctx.isStale).font(.system(size: ctx.state.items.count > 1 ? 30 : 40, weight: .regular)).foregroundColor(it.frozen != nil ? .secondary : .white).lineLimit(1).minimumScaleFactor(0.6)
                            Text(it.text.isEmpty ? it.title : it.title + " · " + it.text).font(.subheadline).foregroundColor(.secondary).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(14)
            .activityBackgroundTint(Color.black.opacity(0.75))
            .activitySystemActionForegroundColor(accent)
        } dynamicIsland: { ctx in
            let first = ctx.state.items.first ?? TimerActivityAttributes.Item(title: "MES Timer", text: "", end: nil, start: nil)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(first.title, systemImage: first.start != nil ? "stopwatch" : "timer").font(.headline).foregroundColor(accent).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TimeText(item: first, stale: ctx.isStale).font(.title2.weight(.semibold)).foregroundColor(accent).frame(maxWidth: 110, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if ctx.state.items.count > 1 {
                        Text("+\(ctx.state.items.count - 1) more running").font(.caption).foregroundColor(.secondary)
                    } else if !first.text.isEmpty {
                        Text(first.text).font(.caption).foregroundColor(.secondary)
                    }
                }
            } compactLeading: {
                Image(systemName: first.start != nil ? "stopwatch" : "timer").foregroundColor(accent)
            } compactTrailing: {
                TimeText(item: first, stale: ctx.isStale).foregroundColor(accent).frame(maxWidth: 56)
            } minimal: {
                Image(systemName: "timer").foregroundColor(accent)
            }
            .keylineTint(accent)
        }
    }
}

@main
struct TimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.2, *) { TimerLiveActivity() }
    }
}
