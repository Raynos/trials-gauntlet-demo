import XCTest

/// Exercises the installed WKWebView through native input injection. Optional JS observes only.
final class NativeTouchTests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "com.trialsgauntlet.game")

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .landscapeLeft
        if ProcessInfo.processInfo.environment["TRIALS_UI_OBSERVE"] == "1" {
            app.launchEnvironment["TRIALS_PROBE_JS"] = """
            const h = window.__trials;
            const events = [];
            const observe = (event) => {
              const touch = event.changedTouches?.[0];
              const x = touch?.clientX ?? event.clientX;
              const y = touch?.clientY ?? event.clientY;
              const target = event.target;
              const hit = document.elementFromPoint(x ?? 0, y ?? 0);
              events.push({ type: event.type, x, y, trusted: event.isTrusted,
                target: target?.tagName, className: target?.className,
                hit: hit?.tagName, hitClass: hit?.className,
                screen: h.app.screen(), at: performance.now(),
                live: document.querySelector('.menu')?.className });
            };
            for (const type of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'])
              document.addEventListener(type, observe, true);
            await new Promise(resolve => setTimeout(resolve, 35000));
            return {probeAt: Date.now(), events, screen: h.app.screen(),
              viewport: {width: innerWidth, height: innerHeight},
              live: [...document.querySelectorAll('.live')].map(e => e.className)};
            """
        }
        app.launch()
    }

    private func button(_ label: String, prefix: Bool = true) -> XCUIElement {
        let predicate = NSPredicate(format: prefix ? "label BEGINSWITH[c] %@" : "label ==[c] %@", label)
        return app.webViews.buttons.matching(predicate).firstMatch
    }

    private func tap(_ element: XCUIElement, timeout: TimeInterval = 45, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "Missing element: \(element)", file: file, line: line)
        let hittable = NSPredicate { _, _ in element.isHittable }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: hittable, object: nil)], timeout: timeout), .completed, "Element is not touchable: \(element)", file: file, line: line)
        element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    }

    private func waitUntilGone(_ element: XCUIElement, timeout: TimeInterval = 10, file: StaticString = #filePath, line: UInt = #line) {
        let gone = NSPredicate { _, _ in !element.exists || !element.isHittable }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: gone, object: nil)], timeout: timeout), .completed, file: file, line: line)
    }

    private func pauseWithTouch() {
        // The touch layer is intentionally aria-hidden. Its visible pause control is 56×44 pt,
        // left of the HUD, inset by the device safe area; use a real coordinate tap in landscape.
        app.webViews.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.095, dy: 0.08)).tap()
    }

    func testMenuRidePauseRestartThroughNativeTouches() {
        XCTAssertTrue(button("Play").waitForExistence(timeout: 120))
        // WKWebView exposes the menu accessibility tree while the opaque boot loader
        // still covers it. A hittable AX button alone therefore does not mean boot finished.
        let download = app.webViews.staticTexts.matching(NSPredicate(format: "label ==[c] %@", "Download")).firstMatch
        waitUntilGone(download, timeout: 120)
        tap(button("Play"), timeout: 120)
        let ride = button("Ride", prefix: true)
        XCTAssertTrue(ride.waitForExistence(timeout: 45), "Play should reveal the world map's Ride action")
        tap(ride)

        // First launch shows the tutorial. Later runs preserve saves and exercise the same ride flow.
        let tutorial = button("Got it", prefix: true)
        if tutorial.waitForExistence(timeout: 8) { tap(tutorial) }
        waitUntilGone(ride)

        pauseWithTouch()
        let resume = button("Resume")
        XCTAssertTrue(resume.waitForExistence(timeout: 15), "The native pause tap must reveal Resume")
        tap(button("Restart"))
        waitUntilGone(resume)

        pauseWithTouch()
        XCTAssertTrue(resume.waitForExistence(timeout: 15), "Restart must return to a run that can be paused again")
        tap(resume)
        waitUntilGone(resume)

        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10), "Home must background the native app")
        app.activate()
        XCTAssertTrue(resume.waitForExistence(timeout: 15), "Returning from Home must leave the run paused")
        let noAutomaticResume = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in !resume.exists }, object: nil)
        noAutomaticResume.isInverted = true
        XCTAssertEqual(XCTWaiter.wait(for: [noAutomaticResume], timeout: 2), .completed, "Foreground must not automatically resume")
        tap(resume)
        waitUntilGone(resume)
        pauseWithTouch()
        tap(button("Quit"))
        XCTAssertTrue(button("Play").waitForExistence(timeout: 15), "Quit must return to the main menu")
    }

    override func tearDownWithError() throws {
        if let testRun = testRun, testRun.failureCount > 0 {
            let hierarchy = XCTAttachment(string: app.debugDescription)
            hierarchy.name = "Native accessibility hierarchy"
            hierarchy.lifetime = .keepAlways
            add(hierarchy)
        }
        app.terminate()
    }
}
