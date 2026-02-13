import Foundation

/// Writes newline-delimited JSON messages to stdout.
/// Thread-safe: can be called from any queue.
final class StdoutWriter {
    private let lock = NSLock()
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = .sortedKeys // Deterministic output
        return e
    }()

    func send(_ message: OutgoingMessage) {
        guard let data = try? encoder.encode(message),
              let json = String(data: data, encoding: .utf8)
        else { return }

        lock.lock()
        defer { lock.unlock() }

        // Write to stdout with newline delimiter
        print(json)
        fflush(stdout)
    }
}
