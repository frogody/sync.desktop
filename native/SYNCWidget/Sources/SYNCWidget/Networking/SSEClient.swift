import Foundation

/// Server-Sent Events client for streaming chat responses from Supabase.
/// Replicates the exact request/response format from ChatWidget.tsx.
final class SSEClient {

    /// Stream a chat message to the SYNC AI endpoint.
    /// Calls `onChunk` with accumulated content as each chunk arrives.
    /// Calls `onComplete` with the final content when done.
    func streamChat(
        message: String,
        config: ConfigPayload,
        context: ContextPayload?,
        onChunk: @escaping (String) -> Void,
        onComplete: @escaping (String) -> Void,
        onError: @escaping (String) -> Void
    ) async {
        let urlString = "\(config.supabaseUrl)/functions/v1/sync"
        guard let url = URL(string: urlString) else {
            onError("Invalid URL: \(urlString)")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(config.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.anonKey, forHTTPHeaderField: "apikey")

        // Build request body matching ChatWidget.tsx format
        let body: [String: Any] = [
            "message": message,
            "sessionId": config.sessionId,
            "stream": true,
            "context": [
                "userId": config.userId,
                "userEmail": config.userEmail,
                "userName": config.userName,
                "source": "desktop-app",
                "recentActivity": context?.recentActivity ?? "",
                "currentApp": context?.currentApp ?? "",
                "focusScore": context?.focusScore ?? 0,
                "isIdle": context?.isIdle ?? false,
                "recentApps": context?.recentApps.prefix(5) ?? [],
            ] as [String: Any],
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            onError("Failed to encode request: \(error.localizedDescription)")
            return
        }

        do {
            let (bytes, response) = try await URLSession.shared.bytes(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                onError("HTTP \(code)")
                return
            }

            var fullContent = ""

            for try await line in bytes.lines {
                // SSE format: each line starts with "data: "
                guard line.hasPrefix("data: ") else { continue }

                let data = String(line.dropFirst(6))

                // Stream end marker
                if data == "[DONE]" {
                    break
                }

                // Try to parse as JSON
                guard let jsonData = data.data(using: .utf8) else { continue }

                do {
                    if let parsed = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any] {
                        let event = parsed["event"] as? String

                        if event == "chunk", let content = parsed["content"] as? String {
                            // Streaming chunk — accumulate
                            fullContent += content
                            onChunk(fullContent)
                        }

                        if event == "end", let content = parsed["content"] as? String {
                            // Final complete content from server
                            fullContent = content
                            onChunk(fullContent)
                        }

                        // Legacy text field
                        if let text = parsed["text"] as? String {
                            fullContent += text
                            onChunk(fullContent)
                        }
                    }
                } catch {
                    // Non-JSON data — treat as plain text
                    let trimmed = data.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty {
                        fullContent += trimmed
                        onChunk(fullContent)
                    }
                }
            }

            // Strip [ACTION]...[/ACTION] blocks from display
            let cleanContent = Self.stripActionTags(fullContent)
            onComplete(cleanContent.isEmpty ? "I'm here to help!" : cleanContent)

        } catch {
            if (error as NSError).code == NSURLErrorCancelled {
                onError("Cancelled")
            } else {
                onError(error.localizedDescription)
            }
        }
    }

    /// Remove [ACTION]...[/ACTION] blocks from the response text.
    private static func stripActionTags(_ text: String) -> String {
        // Regex to remove [ACTION]...[/ACTION] blocks
        guard let regex = try? NSRegularExpression(
            pattern: "\\[ACTION\\].*?\\[/ACTION\\]",
            options: [.dotMatchesLineSeparators]
        ) else { return text }

        let range = NSRange(text.startIndex..., in: text)
        return regex.stringByReplacingMatches(in: text, range: range, withTemplate: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
