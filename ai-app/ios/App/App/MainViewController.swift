import UIKit
import Capacitor

/// Registers the app's own Capacitor plugin (AppSave).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppSavePlugin())
    }
}
