import UIKit
import WebKit
import StoreKit
import Capacitor

/// Registers the app's own Capacitor plugin (AudioNative), and switches the AI noise removal off where the App Store
/// country is China mainland (window.MES_NO_AI = true before the page's scripts run; the editor then offers only the
/// classic, non-AI spectral gate). China needs AI filings for apps with AI features; everywhere else keeps the AI.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AudioNativePlugin())
    }

    override open func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        if MainViewController.inChina() {
            let js = "window.MES_NO_AI = true;"
            config.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        return config
    }

    /// App Store storefront country (ISO 3166-1 alpha-3, "CHN" = China mainland). If the storefront isn't known yet,
    /// fall back to the device region so a China user never gets the AI by accident.
    static func inChina() -> Bool {
        if let code = SKPaymentQueue.default().storefront?.countryCode { return code.uppercased() == "CHN" }
        return (Locale.current.regionCode ?? "").uppercased() == "CN"
    }
}
