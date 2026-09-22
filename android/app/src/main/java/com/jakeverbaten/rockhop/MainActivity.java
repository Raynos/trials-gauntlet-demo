package com.jakeverbaten.rockhop;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import java.util.Collections;
import org.json.JSONObject;

/**
 * Rockhop on Android (docs/plans/STORE_RELEASE.md Phase 5): landscape (manifest), immersive full screen, screen kept
 * on while the game is in front. System back is the game's: src/platform/native.ts listens to @capacitor/app's
 * `backButton`, which replaces Capacitor's default (history back / exit) and routes it to the pause menu / exit confirm.
 *
 * Debuggable builds only: `am start … --es rockhopGate '<json>'` (harness/native/android.ts) arms the in-app gate —
 * the page sees `navigator.webdriver === true` (the silent-automation rule, src/audio/automation.ts: no AudioContext
 * is ever opened) and `window.__rockhopGate` = the JSON; the harness reads the results over CDP.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "RockhopGate";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterImmersive();
        armGateIfRequested(getIntent());
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersive();
    }

    /** Hide status + navigation bars; a swipe from the edge shows them transiently, then they hide again. */
    private void enterImmersive() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    private void armGateIfRequested(Intent intent) {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0 || intent == null) return;
        String raw = intent.getStringExtra("rockhopGate");
        if (raw == null || bridge == null) return;
        String config;
        try {
            config = new JSONObject(raw).toString();
        } catch (Exception e) {
            config = "{}";
        }
        WebView wv = bridge.getWebView();
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Log.e(TAG, "document-start scripts unsupported by this WebView: gate not armed");
            return;
        }
        String script = "(function () {"
            + "try { Object.defineProperty(Navigator.prototype, 'webdriver', { get: function () { return true; }, configurable: true }); } catch (e) {}"
            + "var made = 0;"
            + "['AudioContext', 'webkitAudioContext'].forEach(function (k) {"
            + "  var C = window[k]; if (typeof C !== 'function') return;"
            + "  window[k] = new Proxy(C, { construct: function (t, a) { made += 1; return Reflect.construct(t, a); } });"
            + "});"
            + "window.__rockhopAudioContexts = function () { return made; };"
            + "window.__rockhopGate = Object.assign({ platform: 'android' }, " + config + ");"
            // Results survive the gate's own navigation (boot stage → ?harness=1) in sessionStorage, so the harness
            // never misses one between two CDP polls.
            + "var saved = {}; try { saved = JSON.parse(sessionStorage.getItem('rockhopGateResults') || '{}'); } catch (e) {}"
            + "window.__rockhopGateResults = saved;"
            + "window.__rockhopGatePost = function (msg) {"
            + "  window.__rockhopGateResults[msg.name] = msg;"
            + "  try { sessionStorage.setItem('rockhopGateResults', JSON.stringify(window.__rockhopGateResults)); } catch (e) {}"
            + "  console.info('[rockhop-gate] ' + msg.name + ' ' + JSON.stringify(msg).slice(0, 400));"
            + "};"
            + "})();";
        WebViewCompat.addDocumentStartJavaScript(wv, script, Collections.singleton("*"));
        Log.i(TAG, "armed " + config);
        // The first navigation may already have committed without the script: start a fresh one that has it.
        final String url = bridge.getAppUrl();
        wv.post(() -> wv.loadUrl(url));
    }
}
