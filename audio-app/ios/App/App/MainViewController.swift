import UIKit
import Capacitor

/// Registers the app's own Capacitor plugin (AudioNative).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AudioNativePlugin())
    }
}
