/**
 * OCR Service
 *
 * Extracts text from screenshots using macOS Vision framework.
 * Falls back to Tesseract.js if native OCR fails.
 *
 * Features:
 * - High accuracy text recognition
 * - Supports multiple languages
 * - Region-based extraction for structured data
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { OCRResult } from '../../shared/types';

// ============================================================================
// OCR Service Class
// ============================================================================

export class OCRService {
  private swiftScriptPath: string;
  private isSwiftAvailable: boolean = false;

  constructor() {
    this.swiftScriptPath = path.join(app.getPath('userData'), 'ocr_script.swift');
    this.setupSwiftScript();
  }

  // ============================================================================
  // Setup
  // ============================================================================

  private setupSwiftScript(): void {
    // Create Swift script for Vision framework OCR
    const swiftCode = `
import Foundation
import Vision
import AppKit

// Read image path from command line
guard CommandLine.arguments.count > 1 else {
    fputs("Usage: swift ocr_script.swift <image_path>\\n", stderr)
    exit(1)
}

let imagePath = CommandLine.arguments[1]

// Load image
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("Failed to load image: \\(imagePath)\\n", stderr)
    exit(1)
}

// Create request
let request = VNRecognizeTextRequest { request, error in
    if let error = error {
        fputs("OCR error: \\(error.localizedDescription)\\n", stderr)
        exit(1)
    }

    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        print("[]")
        exit(0)
    }

    var results: [[String: Any]] = []

    for observation in observations {
        if let topCandidate = observation.topCandidates(1).first {
            let boundingBox = observation.boundingBox
            results.append([
                "text": topCandidate.string,
                "confidence": topCandidate.confidence,
                "x": boundingBox.origin.x,
                "y": boundingBox.origin.y,
                "width": boundingBox.size.width,
                "height": boundingBox.size.height
            ])
        }
    }

    // Output as JSON
    if let jsonData = try? JSONSerialization.data(withJSONObject: results, options: []),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    } else {
        print("[]")
    }
}

// Configure request
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["en-US"]

// Perform request
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("Failed to perform OCR: \\(error.localizedDescription)\\n", stderr)
    exit(1)
}

// Wait for completion
RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
`;

    try {
      // Write Swift script
      fs.writeFileSync(this.swiftScriptPath, swiftCode);

      // Test if Swift is available
      execSync('which swift', { encoding: 'utf-8' });
      this.isSwiftAvailable = true;
      console.log('[ocr] Swift/Vision framework available');
    } catch (error) {
      console.warn('[ocr] Swift not available, will use fallback methods');
      this.isSwiftAvailable = false;
    }
  }

  // ============================================================================
  // OCR Processing
  // ============================================================================

  async processImage(imagePath: string): Promise<OCRResult> {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found: ${imagePath}`);
    }

    // Try macOS Vision first
    if (this.isSwiftAvailable) {
      try {
        return await this.processWithVision(imagePath);
      } catch (error) {
        console.warn('[ocr] Vision framework failed, trying fallback:', error);
      }
    }

    // Fallback to simpler approach using macOS shortcuts command
    try {
      return await this.processWithShortcuts(imagePath);
    } catch (error) {
      console.warn('[ocr] Shortcuts fallback failed:', error);
    }

    // Last resort: return empty result
    return {
      text: '',
      confidence: 0,
      regions: [],
    };
  }

  // ============================================================================
  // Vision Framework (Primary)
  // ============================================================================

  private async processWithVision(imagePath: string): Promise<OCRResult> {
    return new Promise((resolve, reject) => {
      try {
        // Run Swift script
        const output = execSync(`swift "${this.swiftScriptPath}" "${imagePath}"`, {
          encoding: 'utf-8',
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        });

        const results = JSON.parse(output.trim()) as Array<{
          text: string;
          confidence: number;
          x: number;
          y: number;
          width: number;
          height: number;
        }>;

        // Combine all text
        const fullText = results.map((r) => r.text).join('\n');

        // Calculate average confidence
        const avgConfidence =
          results.length > 0
            ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
            : 0;

        // Build regions
        const regions = results.map((r) => ({
          text: r.text,
          bounds: {
            x: Math.round(r.x * 1000) / 1000,
            y: Math.round(r.y * 1000) / 1000,
            width: Math.round(r.width * 1000) / 1000,
            height: Math.round(r.height * 1000) / 1000,
          },
        }));

        console.log(`[ocr] Vision extracted ${results.length} text regions, ${fullText.length} chars`);

        resolve({
          text: fullText,
          confidence: avgConfidence,
          regions,
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // ============================================================================
  // Shortcuts Fallback (Using macOS text recognition)
  // ============================================================================

  private async processWithShortcuts(imagePath: string): Promise<OCRResult> {
    return new Promise((resolve) => {
      try {
        // Use macOS built-in text recognition via AppleScript
        // This leverages the same Vision framework but through a simpler interface
        const script = `
          use framework "Vision"
          use framework "AppKit"
          use scripting additions

          set imagePath to "${imagePath}"
          set theImage to current application's NSImage's alloc()'s initWithContentsOfFile:imagePath

          if theImage is missing value then
            return ""
          end if

          set imageRep to theImage's representations()'s firstObject()
          set cgImage to imageRep's CGImage()

          set requestHandler to current application's VNImageRequestHandler's alloc()'s initWithCGImage:cgImage options:(current application's NSDictionary's dictionary())

          set textRequest to current application's VNRecognizeTextRequest's alloc()'s init()
          textRequest's setRecognitionLevel:(current application's VNRequestTextRecognitionLevelAccurate)
          textRequest's setUsesLanguageCorrection:true

          requestHandler's performRequests:(current application's NSArray's arrayWithObject:textRequest) |error|:(missing value)

          set recognizedText to ""
          set observations to textRequest's results()

          repeat with observation in observations
            set topCandidate to (observation's topCandidates:1)'s firstObject()
            if topCandidate is not missing value then
              set recognizedText to recognizedText & (topCandidate's |string|() as text) & linefeed
            end if
          end repeat

          return recognizedText
        `;

        const result = execSync(`osascript -l AppleScript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
          encoding: 'utf-8',
          timeout: 30000,
        }).trim();

        console.log(`[ocr] Shortcuts extracted ${result.length} chars`);

        resolve({
          text: result,
          confidence: 0.8, // Assume reasonable confidence
          regions: [],
        });
      } catch (error) {
        console.error('[ocr] Shortcuts method failed:', error);
        resolve({
          text: '',
          confidence: 0,
          regions: [],
        });
      }
    });
  }

  // ============================================================================
  // Text Processing Helpers
  // ============================================================================

  /**
   * Clean and normalize OCR text
   */
  cleanText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove common OCR artifacts
      .replace(/[|\\[\]{}]/g, '')
      // Trim
      .trim();
  }

  /**
   * Extract specific patterns from OCR text
   */
  extractPatterns(text: string): {
    emails: string[];
    urls: string[];
    dates: string[];
    times: string[];
  } {
    const emails = text.match(/[\w.-]+@[\w.-]+\.\w+/g) || [];
    const urls = text.match(/https?:\/\/[^\s]+/g) || [];
    const dates = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2}-\d{1,2}-\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi) || [];
    const times = text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\b/g) || [];

    return { emails, urls, dates, times };
  }

  /**
   * Check if text appears to be from an email composition
   */
  isEmailComposition(text: string): boolean {
    const emailIndicators = [
      /^to:\s*/im,
      /^cc:\s*/im,
      /^bcc:\s*/im,
      /^subject:\s*/im,
      /^from:\s*/im,
      /compose.*email/i,
      /new message/i,
      /reply\s+all/i,
    ];

    return emailIndicators.some((pattern) => pattern.test(text));
  }

  /**
   * Check if text appears to be from a calendar view
   */
  isCalendarContent(text: string): boolean {
    const calendarIndicators = [
      /create.*event/i,
      /new.*event/i,
      /calendar/i,
      /schedule/i,
      /meeting/i,
      /appointment/i,
      /add.*invitees/i,
      /attendees/i,
    ];

    return calendarIndicators.some((pattern) => pattern.test(text));
  }

  /**
   * Extract commitment-like phrases
   */
  extractCommitmentPhrases(text: string): string[] {
    const commitmentPatterns = [
      /I(?:'ll| will| am going to) (?:send|email|call|follow up|get back|schedule|create|set up)[^.!?]*/gi,
      /let me (?:send|email|call|follow up|get back|schedule|create|set up)[^.!?]*/gi,
      /(?:will|going to) (?:send|forward|share|schedule|book|create)[^.!?]*/gi,
      /remind(?:er)?(?:\s+me)?\s+to\s+[^.!?]*/gi,
      /(?:need|have) to (?:send|email|call|follow up|schedule)[^.!?]*/gi,
    ];

    const commitments: string[] = [];

    for (const pattern of commitmentPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        commitments.push(...matches.map((m) => m.trim()));
      }
    }

    return [...new Set(commitments)]; // Remove duplicates
  }
}
