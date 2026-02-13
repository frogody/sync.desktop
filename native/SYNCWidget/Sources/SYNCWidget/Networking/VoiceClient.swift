import Foundation
import AVFoundation

/// Calls the sync-voice Supabase edge function and plays back audio response.
/// Matches the request format from VoiceMode.tsx.
final class VoiceClient {
    private var audioPlayer: AVAudioPlayer?

    private func log(_ msg: String) {
        fputs("[voice] \(msg)\n", stderr)
    }

    /// Send a voice transcript to the SYNC voice endpoint.
    /// Returns the text response. Audio is fetched via a second ttsOnly request.
    func sendVoice(
        message: String,
        config: ConfigPayload,
        context: ContextPayload?,
        onResponse: @escaping (String) -> Void,
        onAudioStart: @escaping () -> Void,
        onAudioEnd: @escaping () -> Void,
        onError: @escaping (String) -> Void
    ) async {
        log("sendVoice called: \"\(message.prefix(60))\"")

        let urlString = "\(config.supabaseUrl)/functions/v1/sync-voice"
        guard let url = URL(string: urlString) else {
            onError("Invalid URL: \(urlString)")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(config.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.anonKey, forHTTPHeaderField: "apikey")

        var body: [String: Any] = [
            "message": message,
            "userId": config.userId,
            "sessionId": config.sessionId,
            "voice": "tara",
            "context": [
                "source": "desktop-app",
                "recentActivity": context?.recentActivity ?? "",
                "currentApp": context?.currentApp ?? "",
                "focusScore": context?.focusScore ?? 0,
                "isIdle": context?.isIdle ?? false,
                "recentApps": Array(context?.recentApps.prefix(5) ?? []),
            ] as [String: Any],
        ]
        if !config.companyId.isEmpty {
            body["companyId"] = config.companyId
        }

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            log("encode error: \(error)")
            onError("Failed to encode request: \(error.localizedDescription)")
            return
        }

        log("sending request to \(urlString)")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            log("response: HTTP \(code), \(data.count) bytes")

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                let bodyStr = String(data: data, encoding: .utf8) ?? ""
                log("error body: \(bodyStr.prefix(300))")
                onError("HTTP \(code): \(bodyStr.prefix(200))")
                return
            }

            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                log("failed to parse JSON")
                onError("Invalid response format")
                return
            }

            let text = json["text"] as? String ?? json["response"] as? String ?? ""
            log("response text: \"\(text.prefix(80))\"")
            onResponse(text)

            // Check if audio was included in the main response
            if let audioBase64 = json["audio"] as? String,
               let audioData = Data(base64Encoded: audioBase64) {
                log("audio in response: \(audioData.count) bytes")
                onAudioStart()
                playAudio(data: audioData) {
                    onAudioEnd()
                }
                return
            }

            // No audio in response — fetch TTS separately
            guard !text.isEmpty else {
                log("empty text, skipping TTS")
                onAudioEnd()
                return
            }

            log("fetching TTS for text...")
            let ttsAudio = await fetchTTS(text: text, voice: "tara", config: config)
            if let audioData = ttsAudio {
                log("TTS audio: \(audioData.count) bytes, playing")
                onAudioStart()
                playAudio(data: audioData) {
                    onAudioEnd()
                }
            } else {
                log("TTS failed, ending turn")
                onAudioEnd()
            }
        } catch {
            log("network error: \(error)")
            if (error as NSError).code == NSURLErrorCancelled {
                onError("Cancelled")
            } else {
                onError(error.localizedDescription)
            }
        }
    }

    /// Fetch TTS audio via a separate ttsOnly request to sync-voice.
    private func fetchTTS(text: String, voice: String, config: ConfigPayload) async -> Data? {
        let urlString = "\(config.supabaseUrl)/functions/v1/sync-voice"
        guard let url = URL(string: urlString) else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(config.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.anonKey, forHTTPHeaderField: "apikey")

        let body: [String: Any] = [
            "ttsOnly": true,
            "ttsText": text,
            "voice": voice,
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else { return nil }

            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let audioBase64 = json["audio"] as? String,
                  let audioData = Data(base64Encoded: audioBase64) else { return nil }

            return audioData
        } catch {
            return nil
        }
    }

    /// Play audio data via AVAudioPlayer.
    /// Dispatches to main thread for timer scheduling (RunLoop required).
    private func playAudio(data: Data, completion: @escaping () -> Void) {
        DispatchQueue.main.async { [weak self] in
            do {
                let player = try AVAudioPlayer(data: data)
                self?.audioPlayer = player
                player.play()
                self?.log("audio playing, duration: \(String(format: "%.1f", player.duration))s")

                // Poll for completion on main RunLoop
                Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { timer in
                    if !player.isPlaying {
                        timer.invalidate()
                        self?.log("audio finished playing")
                        completion()
                    }
                }
            } catch {
                self?.log("audio playback error: \(error)")
                completion()
            }
        }
    }

    func stopAudio() {
        audioPlayer?.stop()
        audioPlayer = nil
    }
}
