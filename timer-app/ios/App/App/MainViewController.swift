import UIKit
import Capacitor

/// Registers the app's own Capacitor plugin (TimerStatus).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TimerStatusPlugin())
    }
}
