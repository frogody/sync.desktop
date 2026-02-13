import AppKit
import ApplicationServices
import Carbon.HIToolbox

/// Intercepts system-wide keyboard events using CGEventTap when chat mode is active.
/// This allows the notch widget to capture typing without becoming the active app
/// (which would trigger Stage Manager). Requires accessibility permissions.
final class KeyboardCapture {
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private(set) var isCapturing = false

    // Callbacks — set by ViewModel
    var onCharacter: ((String) -> Void)?
    var onSubmit: (() -> Void)?
    var onDelete: (() -> Void)?
    var onEscape: (() -> Void)?

    func start() {
        guard !isCapturing else { return }

        // Don't attempt without accessibility — CGEvent.tapCreate triggers the dialog
        guard AXIsProcessTrusted() else {
            print("[keyboard] Accessibility not granted — skipping keyboard capture")
            return
        }

        let eventMask: CGEventMask = (1 << CGEventType.keyDown.rawValue)
            | (1 << CGEventType.flagsChanged.rawValue)

        // Store self pointer for the C callback
        let refcon = Unmanaged.passUnretained(self).toOpaque()

        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: eventMask,
            callback: KeyboardCapture.eventCallback,
            userInfo: refcon
        ) else {
            print("[keyboard] Failed to create event tap — accessibility permission needed")
            return
        }

        eventTap = tap
        runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), runLoopSource, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        isCapturing = true
    }

    func stop() {
        guard isCapturing else { return }
        isCapturing = false

        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
        }
        if let source = runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes)
        }
        eventTap = nil
        runLoopSource = nil
    }

    deinit {
        stop()
    }

    // MARK: - C Callback

    private static let eventCallback: CGEventTapCallBack = { proxy, type, event, refcon in
        guard let refcon = refcon else {
            return Unmanaged.passUnretained(event)
        }

        let capture = Unmanaged<KeyboardCapture>.fromOpaque(refcon).takeUnretainedValue()

        // If the tap gets disabled by the system (timeout), re-enable it
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = capture.eventTap {
                CGEvent.tapEnable(tap: tap, enable: true)
            }
            return Unmanaged.passUnretained(event)
        }

        guard type == .keyDown else {
            return Unmanaged.passUnretained(event)
        }

        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let flags = event.flags

        // Let Cmd+Q, Cmd+Tab, Cmd+Space and other system shortcuts through
        if flags.contains(.maskCommand) {
            // Cmd+V: paste from clipboard
            if keyCode == Int64(kVK_ANSI_V) {
                if let clipboardString = NSPasteboard.general.string(forType: .string) {
                    DispatchQueue.main.async {
                        capture.onCharacter?(clipboardString)
                    }
                }
                return nil // Consume the event
            }

            // Cmd+A: select all (clear and we'll handle it as "select all" = noop for now)
            if keyCode == Int64(kVK_ANSI_A) {
                return nil // Consume
            }

            // Let all other Cmd+ combos through (Cmd+Tab, Cmd+Q, Cmd+Space, etc.)
            return Unmanaged.passUnretained(event)
        }

        // Return / Enter
        if keyCode == Int64(kVK_Return) {
            DispatchQueue.main.async { capture.onSubmit?() }
            return nil
        }

        // Escape
        if keyCode == Int64(kVK_Escape) {
            DispatchQueue.main.async { capture.onEscape?() }
            return nil
        }

        // Delete / Backspace
        if keyCode == Int64(kVK_Delete) {
            DispatchQueue.main.async { capture.onDelete?() }
            return nil
        }

        // Tab — ignore (don't type tabs)
        if keyCode == Int64(kVK_Tab) {
            return nil
        }

        // Arrow keys, function keys — pass through
        if keyCode == Int64(kVK_LeftArrow) || keyCode == Int64(kVK_RightArrow)
            || keyCode == Int64(kVK_UpArrow) || keyCode == Int64(kVK_DownArrow)
            || (keyCode >= Int64(kVK_F1) && keyCode <= Int64(kVK_F20)) {
            return Unmanaged.passUnretained(event)
        }

        // Regular character input
        if let nsEvent = NSEvent(cgEvent: event), let chars = nsEvent.characters, !chars.isEmpty {
            DispatchQueue.main.async {
                capture.onCharacter?(chars)
            }
            return nil // Consume the event
        }

        return Unmanaged.passUnretained(event)
    }
}
