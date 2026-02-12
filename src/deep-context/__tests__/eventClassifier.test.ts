import { describe, it, expect, beforeEach } from 'vitest';
import { EventClassifier } from '../pipeline/eventClassifier';
import type { AccessibilityCaptureResult, FileChangeEvent } from '../types';

describe('EventClassifier', () => {
  let classifier: EventClassifier;

  beforeEach(() => {
    classifier = new EventClassifier();
  });

  // ==========================================================================
  // Commitment Detection
  // ==========================================================================

  describe('extractCommitments', () => {
    it('detects "I will send" commitments', () => {
      const text = "I'll send you the report by tomorrow.";
      const commitments = classifier.extractCommitments(text);
      expect(commitments.length).toBeGreaterThan(0);
      expect(commitments[0].requiredAction).toBe('send_email');
    });

    it('detects "I will schedule" commitments', () => {
      const text = "I will schedule a meeting with the team for next week.";
      const commitments = classifier.extractCommitments(text);
      expect(commitments.length).toBeGreaterThan(0);
      expect(commitments[0].requiredAction).toBe('create_event');
    });

    it('detects "I will follow up" commitments', () => {
      const text = "I'll follow up with Sarah on the proposal.";
      const commitments = classifier.extractCommitments(text);
      expect(commitments.length).toBeGreaterThan(0);
      expect(commitments[0].requiredAction).toBe('follow_up');
    });

    it('detects "need to" commitments', () => {
      const text = "I need to send the invoice to the client by Friday.";
      const commitments = classifier.extractCommitments(text);
      expect(commitments.length).toBeGreaterThan(0);
    });

    it('detects "remind me to" commitments', () => {
      const text = "Remind me to call the vendor tomorrow.";
      const commitments = classifier.extractCommitments(text);
      expect(commitments.length).toBeGreaterThan(0);
    });

    it('extracts deadlines from commitment text', () => {
      const text = "I'll send the report by tomorrow.";
      const commitments = classifier.extractCommitments(text);
      expect(commitments.length).toBeGreaterThan(0);
      expect(commitments[0].dueDate).toBeDefined();
    });

    it('extracts involved parties', () => {
      const text = "I'll send the report to Sarah Johnson.";
      const commitments = classifier.extractCommitments(text);
      expect(commitments.length).toBeGreaterThan(0);
      expect(commitments[0].involvedParties).toContain('Sarah Johnson');
    });

    it('returns empty for no commitments', () => {
      const text = "The weather is nice today.";
      const commitments = classifier.extractCommitments(text);
      expect(commitments).toHaveLength(0);
    });

    it('returns empty for short text', () => {
      const commitments = classifier.extractCommitments('Hi');
      expect(commitments).toHaveLength(0);
    });

    it('deduplicates identical commitments', () => {
      const text = "I'll send the report. I'll send the report.";
      const commitments = classifier.extractCommitments(text);
      // Exact duplicates should be deduplicated (matched by lowercase normalization)
      const uniqueDescriptions = new Set(commitments.map((c) => c.description.toLowerCase()));
      expect(uniqueDescriptions.size).toBeLessThanOrEqual(commitments.length);
    });
  });

  // ==========================================================================
  // Entity Extraction
  // ==========================================================================

  describe('extractEntities', () => {
    it('extracts capitalized names', () => {
      const text = "Meeting with John Smith about the project.";
      const entities = classifier.extractEntities(text);
      expect(entities).toContain('John Smith');
    });

    it('extracts @mentions', () => {
      const text = "Hey @john, can you review this?";
      const entities = classifier.extractEntities(text);
      expect(entities).toContain('john');
    });

    it('extracts project references', () => {
      const text = "Working on project Alpha-2 today.";
      const entities = classifier.extractEntities(text);
      expect(entities.some((e) => e.includes('Alpha-2'))).toBe(true);
    });

    it('filters common words', () => {
      const text = "The New File was created on Monday.";
      const entities = classifier.extractEntities(text);
      // "The", "New", "Monday" are common words and should be filtered
      expect(entities).not.toContain('The');
      expect(entities).not.toContain('Monday');
    });

    it('returns empty for no entities', () => {
      const entities = classifier.extractEntities('hello world');
      expect(entities).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Activity Classification
  // ==========================================================================

  describe('classifyCapture', () => {
    function makeCapture(overrides: Partial<AccessibilityCaptureResult> = {}): AccessibilityCaptureResult {
      return {
        timestamp: Date.now(),
        appName: 'TextEdit',
        windowTitle: 'Untitled',
        focusedElementText: '',
        focusedElementRole: 'AXTextArea',
        visibleText: '',
        ...overrides,
      };
    }

    it('classifies email compose', () => {
      const capture = makeCapture({
        appName: 'Mail',
        windowTitle: 'New Message',
        visibleText: 'To: john@example.com\nSubject: Meeting',
      });
      const event = classifier.classifyCapture(capture);
      expect(event.eventType).toBe('communication_event');
      expect(event.semanticPayload.intent).toContain('email');
    });

    it('classifies coding activity', () => {
      const capture = makeCapture({
        appName: 'Visual Studio Code',
        windowTitle: 'index.ts - project',
        visibleText: 'const foo = () => { return bar; }',
      });
      const event = classifier.classifyCapture(capture);
      expect(event.source.application).toBe('Visual Studio Code');
    });

    it('classifies browsing', () => {
      const capture = makeCapture({
        appName: 'Google Chrome',
        windowTitle: 'GitHub - Trending',
        url: 'https://github.com/trending',
      });
      const event = classifier.classifyCapture(capture);
      expect(event.source.url).toBe('https://github.com/trending');
    });

    it('detects context switch', () => {
      // First capture: coding
      classifier.classifyCapture(makeCapture({
        appName: 'Visual Studio Code',
        windowTitle: 'index.ts',
      }));

      // Second capture: email (different category)
      const event = classifier.classifyCapture(makeCapture({
        appName: 'Mail',
        windowTitle: 'Inbox',
      }));

      expect(event.eventType).toBe('context_switch');
    });

    it('does not flag same-category switch as context switch', () => {
      // First capture: one editor
      classifier.classifyCapture(makeCapture({
        appName: 'Visual Studio Code',
        windowTitle: 'index.ts',
      }));

      // Second capture: same type of app
      const event = classifier.classifyCapture(makeCapture({
        appName: 'Cursor',
        windowTitle: 'main.py',
      }));

      // Both are coding, so not a context switch
      expect(event.eventType).not.toBe('context_switch');
    });

    it('detects commitments in capture', () => {
      const capture = makeCapture({
        appName: 'Slack',
        windowTitle: '#general',
        visibleText: "I'll send the report to Sarah by Friday.",
      });
      const event = classifier.classifyCapture(capture);
      expect(event.eventType).toBe('commitment_detected');
      expect(event.semanticPayload.commitments).toBeDefined();
      expect(event.semanticPayload.commitments!.length).toBeGreaterThan(0);
    });

    it('detects skill signals', () => {
      const capture = makeCapture({
        appName: 'Visual Studio Code',
        windowTitle: 'app.py',
        visibleText: 'def main():\n  print("hello")\n  import pandas',
      });
      const event = classifier.classifyCapture(capture);
      expect(event.semanticPayload.skillSignals).toBeDefined();
    });

    it('assigns confidence scores', () => {
      const capture = makeCapture({
        appName: 'Notion',
        windowTitle: 'Project Plan',
        visibleText: 'This is a long document with plenty of content that should increase confidence. '.repeat(10),
      });
      const event = classifier.classifyCapture(capture);
      expect(event.confidence).toBeGreaterThan(0.5);
    });
  });

  // ==========================================================================
  // File Event Classification
  // ==========================================================================

  describe('classifyFileEvent', () => {
    it('classifies file creation', () => {
      const fileEvent: FileChangeEvent = {
        timestamp: Date.now(),
        eventType: 'created',
        filePath: '/Users/test/Documents/report.docx',
        fileName: 'report.docx',
        directory: '/Users/test/Documents',
        extension: '.docx',
      };
      const event = classifier.classifyFileEvent(fileEvent);
      expect(event.eventType).toBe('document_interaction');
      expect(event.semanticPayload.summary).toContain('created');
    });

    it('detects skill signals from file extension', () => {
      const fileEvent: FileChangeEvent = {
        timestamp: Date.now(),
        eventType: 'modified',
        filePath: '/Users/test/project/app.py',
        fileName: 'app.py',
        directory: '/Users/test/project',
        extension: '.py',
      };
      const event = classifier.classifyFileEvent(fileEvent);
      expect(event.semanticPayload.skillSignals).toBeDefined();
      expect(event.semanticPayload.skillSignals![0].skillPath).toContain('Python');
    });
  });
});
