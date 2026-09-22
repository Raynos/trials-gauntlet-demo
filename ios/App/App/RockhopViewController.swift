import UIKit
import WebKit
import Capacitor

/// The Rockhop game view: Capacitor's bridge, full screen, landscape only (docs/plans/STORE_RELEASE.md Phase 5).
///
/// - Status bar hidden (Info.plist `UIStatusBarHidden`, read by Capacitor's `setStatusBarDefaults`).
/// - Home indicator auto-hides: Capacitor's built-in SystemBars plugin owns `prefersHomeIndicatorAutoHidden`
///   (capacitor.config.ts `plugins.SystemBars.hidden`). The bottom edge also defers the system swipe, so a thumb
///   on the bottom touch strip needs a second swipe to leave the game mid-ride.
/// - Debug builds only: `-rockhopGate '<json>'` on the launch arguments (harness/native/ios.ts) arms the
///   in-app gate runner — the page sees `navigator.webdriver === true` (the silent-automation rule,
///   src/audio/automation.ts: no AudioContext is ever opened) and `window.__rockhopGate` = the JSON; its
///   results come back through the `rockhopGate` message handler into `Documents/gate/<name>.json`.
class RockhopViewController: CAPBridgeViewController {
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .bottom }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        installGateIfRequested()
        #endif
    }

    #if DEBUG
    private func installGateIfRequested() {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-rockhopGate"), let controller = webView?.configuration.userContentController else { return }
        let json = i + 1 < args.count ? args[i + 1] : "{}"
        let config = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) != nil ? json : "{}"
        let source = """
        (function () {
          try { Object.defineProperty(Navigator.prototype, 'webdriver', { get: function () { return true; }, configurable: true }); } catch (e) {}
          var made = 0;
          ['AudioContext', 'webkitAudioContext'].forEach(function (k) {
            var C = window[k];
            if (typeof C !== 'function') return;
            window[k] = new Proxy(C, { construct: function (t, a) { made += 1; return Reflect.construct(t, a); } });
          });
          window.__rockhopAudioContexts = function () { return made; };
          window.__rockhopGate = Object.assign({ platform: 'ios' }, \(config));
          window.__rockhopGatePost = function (msg) { window.webkit.messageHandlers.rockhopGate.postMessage(JSON.stringify(msg)); };
        })();
        """
        controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(GateSink(), name: "rockhopGate")
        print("[rockhop-gate] armed \(config)")
    }
    #endif
}

#if DEBUG
/// Writes each gate message to `Documents/gate/<name>.json` (read back with `simctl get_app_container … data`)
/// and echoes a one-line summary to stdout (`simctl launch --console-pty`).
private final class GateSink: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String,
              let obj = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else { return }
        let name = (obj["name"] as? String) ?? "message"
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("gate", isDirectory: true)
        try? FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
        try? Data(text.utf8).write(to: docs.appendingPathComponent("\(name).json"), options: .atomic)
        print("[rockhop-gate] \(name) \(text.prefix(400))")
    }
}
#endif
