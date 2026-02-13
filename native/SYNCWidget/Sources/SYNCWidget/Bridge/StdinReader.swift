import AppKit

/// Reads newline-delimited JSON messages from stdin.
/// When stdin closes (parent process exited), terminates the app.
final class StdinReader {
    private let handler: (IncomingMessage) -> Void
    private var isRunning = false

    init(handler: @escaping (IncomingMessage) -> Void) {
        self.handler = handler
    }

    func start() {
        guard !isRunning else { return }
        isRunning = true

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let decoder = JSONDecoder()

            while let line = readLine(strippingNewline: true) {
                guard let self = self, self.isRunning else { break }
                guard !line.isEmpty else { continue }

                guard let data = line.data(using: .utf8) else { continue }

                do {
                    let message = try decoder.decode(IncomingMessage.self, from: data)
                    DispatchQueue.main.async {
                        self.handler(message)
                    }
                } catch {
                    // Log parse error via stderr (not stdout, which is the bridge)
                    FileHandle.standardError.write(
                        "[SYNCWidget] Failed to parse stdin: \(error.localizedDescription)\n"
                            .data(using: .utf8) ?? Data()
                    )
                }
            }

            // stdin closed → parent (Electron) exited → quit
            DispatchQueue.main.async {
                NSApplication.shared.terminate(nil)
            }
        }
    }

    func stop() {
        isRunning = false
    }
}
