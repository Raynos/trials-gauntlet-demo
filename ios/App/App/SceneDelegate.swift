import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        #if DEBUG
        window?.rootViewController = ProbeBridgeViewController()
        #else
        window?.rootViewController = CAPBridgeViewController()
        #endif
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

#if DEBUG
// CLI-only simulator probe. Entire class is absent from store Release builds.
// The probe is supplied by a local test process, never by network content.
private final class ProbeBridgeViewController: CAPBridgeViewController {
    private var attempts = 0
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        if ProcessInfo.processInfo.environment["TRIALS_PROBE_JS"] != nil {
            pollReady()
        }
    }

    private func pollReady() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self = self else { return }
            self.attempts += 1
            self.webView?.evaluateJavaScript("Boolean(window.__trials?.app && !document.querySelector('#loader'))") { ready, _ in
                    if ready as? Bool == true { self.runProbe() }
                    else if self.attempts < 240 { self.pollReady() }
                    else { self.save(["error": "Native boot probe timed out"]) }
            }
        }
    }

    private func runProbe() {
        guard let js = ProcessInfo.processInfo.environment["TRIALS_PROBE_JS"] else { return }
        webView?.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let value): self.save(value ?? ["error": "Probe returned no report"])
            case .failure(let error): self.save(["error": error.localizedDescription])
            }
        }
    }

    private func save(_ value: Any) {
        do {
            let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("native-probe.json")
            try data.write(to: url, options: .atomic)
            print("TRIALS_PROBE_DONE \(url.path)")
        } catch { print("TRIALS_PROBE_ERROR \(error)") }
    }
}
#endif
