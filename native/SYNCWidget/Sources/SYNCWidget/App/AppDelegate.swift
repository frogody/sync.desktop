import AppKit
import SwiftUI

final class SYNCWidgetAppDelegate: NSObject, NSApplicationDelegate {
    private var panel: NotchOverlayPanel?
    private var stdinReader: StdinReader?
    private let stdoutWriter = StdoutWriter()
    private var mouseMonitor: MouseMonitor?
    private var viewModel: NotchViewModel?
    private var singleClickTimer: DispatchWorkItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let geometry = NotchGeometry.detect()

        if geometry.hasNotch {
            log("Notch detected: \(Int(geometry.notchWidth))x\(Int(geometry.notchHeight)) at (\(Int(geometry.notchRect.origin.x)), \(Int(geometry.notchRect.origin.y)))")
        } else {
            log("No notch detected, using top-center fallback")
        }

        // Create the view model
        let vm = NotchViewModel(writer: stdoutWriter)
        self.viewModel = vm

        // Create the overlay panel with the container view
        panel = NotchOverlayPanel(geometry: geometry, viewModel: vm)
        panel?.orderFrontRegardless()

        // Setup mouse proximity tracking
        let monitor = MouseMonitor(geometry: geometry)
        monitor.onProximityChange = { [weak vm] distance, maxDistance in
            DispatchQueue.main.async {
                vm?.updateProximity(distance: distance, maxDistance: maxDistance)
            }
        }
        monitor.onMouseEntered = { [weak vm] in
            vm?.mouseEntered()
        }
        monitor.onMouseExited = { [weak vm] in
            vm?.mouseExited()
        }
        monitor.onClick = { [weak self, weak vm] in
            guard let self = self, let vm = vm else { return }
            DispatchQueue.main.async {
                // In voice mode, a click on the notch area dismisses
                if vm.state == .voiceListening || vm.state == .voiceSpeaking {
                    vm.dismiss()
                    return
                }
                guard vm.state == .hovering else { return }
                // Delay single-click to allow double-click detection.
                // If a second click comes within 300ms, the timer is cancelled
                // and onDoubleClick fires instead.
                self.singleClickTimer?.cancel()
                let work = DispatchWorkItem { vm.activateVoice() }
                self.singleClickTimer = work
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: work)
            }
        }
        monitor.onForceClick = { [weak vm] in
            guard let vm = vm else { return }
            DispatchQueue.main.async {
                guard vm.state == .hovering else { return }
                vm.activateVoice()
            }
        }
        monitor.onDoubleClick = { [weak self, weak vm] in
            guard let self = self, let vm = vm else { return }
            DispatchQueue.main.async {
                guard vm.state == .hovering else { return }
                // Cancel pending single-click so voice doesn't fire
                self.singleClickTimer?.cancel()
                self.singleClickTimer = nil
                vm.activateChat()
            }
        }
        monitor.start()
        self.mouseMonitor = monitor

        // Start stdin reader for Electron bridge
        stdinReader = StdinReader { [weak self] message in
            self?.handleMessage(message)
        }
        stdinReader?.start()

        // Signal readiness to Electron
        stdoutWriter.send(OutgoingMessage(type: "ready", payload: [:]))
        log("SYNCWidget started")
    }

    func applicationWillTerminate(_ notification: Notification) {
        mouseMonitor?.stop()
        panel?.close()
        log("SYNCWidget shutting down")
    }

    @MainActor private func handleMessage(_ message: IncomingMessage) {
        switch message.type {
        case "config":
            if let config = ConfigPayload(from: message.payload) {
                viewModel?.updateConfig(config)
                log("Config received (user: \(config.userEmail))")
            } else {
                log("Failed to parse config payload")
            }

        case "context_update":
            if let context = ContextPayload(from: message.payload) {
                viewModel?.updateContext(context)
            }

        case "sync_status":
            log("Received sync status")

        case "knock":
            viewModel?.transition(to: .knocking)
            log("Knock received")

        case "shutdown":
            log("Shutdown requested")
            DispatchQueue.main.async {
                NSApp.terminate(nil)
            }

        default:
            log("Unknown message type: \(message.type)")
        }
    }

    private func log(_ message: String) {
        stdoutWriter.send(OutgoingMessage(
            type: "log",
            payload: ["level": .string("info"), "message": .string(message)]
        ))
    }
}
