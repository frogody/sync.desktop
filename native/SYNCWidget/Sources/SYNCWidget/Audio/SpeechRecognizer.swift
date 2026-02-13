import Foundation
import Speech
import AVFoundation

/// Wraps SFSpeechRecognizer for live microphone-to-text transcription.
/// Provides audio level metering for waveform visualization.
@MainActor
final class SpeechRecognizer: ObservableObject {
    @Published var transcript: String = ""
    @Published var isListening: Bool = false
    @Published var audioLevel: CGFloat = 0
    @Published var error: String?

    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var audioEngine: AVAudioEngine?

    init() {
        speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    }

    // MARK: - Permissions

    func requestPermissions() async -> Bool {
        let speechAuthorized = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }

        guard speechAuthorized else {
            error = "Speech recognition not authorized"
            return false
        }

        if #available(macOS 14.0, *) {
            let micAuthorized = await AVAudioApplication.requestRecordPermission()
            guard micAuthorized else {
                error = "Microphone access not authorized"
                return false
            }
        }

        return true
    }

    // MARK: - Start / Stop

    func startListening() {
        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable else {
            error = "Speech recognizer not available"
            return
        }

        stopListening()

        transcript = ""
        error = nil

        let audioEngine = AVAudioEngine()
        self.audioEngine = audioEngine

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        self.recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            request.append(buffer)

            let channelData = buffer.floatChannelData?[0]
            let frameLength = Int(buffer.frameLength)
            if let data = channelData, frameLength > 0 {
                var sum: Float = 0
                for i in 0..<frameLength {
                    sum += data[i] * data[i]
                }
                let rms = sqrt(sum / Float(frameLength))
                let level = min(1.0, CGFloat(rms) * 8.0)

                Task { @MainActor [weak self] in
                    self?.audioLevel = level
                }
            }
        }

        do {
            audioEngine.prepare()
            try audioEngine.start()
        } catch {
            self.error = "Audio engine failed: \(error.localizedDescription)"
            return
        }

        recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor [weak self] in
                guard let self = self else { return }

                if let result = result {
                    self.transcript = result.bestTranscription.formattedString
                }

                if let error = error {
                    let nsError = error as NSError
                    // Ignore cancellation (216) and no-speech (203) errors
                    if nsError.domain != "kAFAssistantErrorDomain" || (nsError.code != 216 && nsError.code != 203) {
                        self.error = error.localizedDescription
                    }
                }
            }
        }

        isListening = true
    }

    func stopListening() {
        recognitionTask?.cancel()
        recognitionTask = nil

        recognitionRequest?.endAudio()
        recognitionRequest = nil

        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil

        isListening = false
        audioLevel = 0
    }
}
