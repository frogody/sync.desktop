/**
 * Deep Context Manager
 *
 * Orchestrates the deep context pipeline:
 * 1. Screen Capture → captures active window
 * 2. OCR → extracts text from screenshot
 * 3. Semantic Analysis → understands content
 * 4. Storage → saves commitments, actions, context
 * 5. Cross-Reference → matches commitments to completed actions
 *
 * This is the central hub for all deep context features.
 */

import { EventEmitter } from 'events';
import { ScreenCaptureService, CaptureEvent } from './screenCapture';
import { OCRService } from './ocrService';
import { SemanticAnalyzer } from './semanticAnalyzer';
import {
  ScreenCapture,
  Commitment,
  ActionItem,
  CompletedAction,
  EmailContext,
  CalendarContext,
  ScreenAnalysis,
  PendingFollowUp,
  DeepContextSettings,
  DEFAULT_DEEP_CONTEXT_SETTINGS,
} from '../../shared/types';
import { getDatabase } from '../db/database';
import { getTogetherApiKey } from '../store';

// ============================================================================
// Types
// ============================================================================

export interface DeepContextEvent {
  type: 'commitment_detected' | 'action_completed' | 'follow_up_needed' | 'context_updated';
  data: unknown;
}

export interface DeepContextStatus {
  isRunning: boolean;
  capturesProcessed: number;
  commitmentsDetected: number;
  actionsCompleted: number;
  pendingFollowUps: number;
  lastCaptureTime: number | null;
  settings: DeepContextSettings;
}

// ============================================================================
// Deep Context Manager Class
// ============================================================================

export class DeepContextManager extends EventEmitter {
  private screenCapture: ScreenCaptureService;
  private ocrService: OCRService;
  private semanticAnalyzer: SemanticAnalyzer;
  private settings: DeepContextSettings;

  private _isRunning: boolean = false;
  private capturesProcessed: number = 0;
  private commitmentsDetected: number = 0;
  private actionsCompleted: number = 0;
  private lastCaptureTime: number | null = null;

  private crossReferenceInterval: NodeJS.Timeout | null = null;
  private readonly CROSS_REFERENCE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(settings: Partial<DeepContextSettings> = {}) {
    super();
    this.settings = { ...DEFAULT_DEEP_CONTEXT_SETTINGS, ...settings };

    // Initialize services
    this.screenCapture = new ScreenCaptureService(this.settings);
    this.ocrService = new OCRService();
    this.semanticAnalyzer = new SemanticAnalyzer();

    // Set API key if available
    const apiKey = getTogetherApiKey();
    if (apiKey) {
      this.semanticAnalyzer.setApiKey(apiKey);
      console.log('[deepContext] Together API key configured (length:', apiKey.length, ')');
    } else {
      console.log('[deepContext] No Together API key found - using quick analysis only');
    }

    // Listen for capture events
    this.screenCapture.on('capture', this.handleCaptureEvent.bind(this));
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this._isRunning) {
      console.log('[deepContext] Already running');
      return;
    }

    if (!this.settings.enabled) {
      console.log('[deepContext] Deep context is disabled');
      return;
    }

    console.log('[deepContext] Starting deep context manager');
    this._isRunning = true;

    // Start screen capture
    this.screenCapture.start();

    // Start cross-reference checking
    this.crossReferenceInterval = setInterval(() => {
      this.checkCommitmentsForFollowUp();
    }, this.CROSS_REFERENCE_INTERVAL_MS);

    // Initial check
    setTimeout(() => {
      this.checkCommitmentsForFollowUp();
    }, 30000); // 30 seconds after start
  }

  stop(): void {
    if (!this._isRunning) return;

    console.log('[deepContext] Stopping deep context manager');
    this._isRunning = false;

    this.screenCapture.stop();

    if (this.crossReferenceInterval) {
      clearInterval(this.crossReferenceInterval);
      this.crossReferenceInterval = null;
    }
  }

  updateSettings(settings: Partial<DeepContextSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.screenCapture.updateSettings(this.settings);

    // Update API key if needed
    const apiKey = getTogetherApiKey();
    if (apiKey) {
      this.semanticAnalyzer.setApiKey(apiKey);
    }
  }

  // ============================================================================
  // Capture Processing Pipeline
  // ============================================================================

  private async handleCaptureEvent(event: CaptureEvent): Promise<void> {
    if (event.type !== 'capture_complete' || !event.capture || !event.imagePath) {
      return;
    }

    try {
      const capture = event.capture;
      this.lastCaptureTime = capture.timestamp;

      // Step 1: OCR - Extract text from image
      let textContent = '';
      if (this.settings.ocrEnabled) {
        try {
          const ocrResult = await this.ocrService.processImage(event.imagePath);
          textContent = ocrResult.text;
          console.log(`[deepContext] OCR extracted ${textContent.length} chars`);
        } catch (error) {
          console.error('[deepContext] OCR failed:', error);
        }
      }

      // Clean up the image file after OCR
      this.screenCapture.cleanupCapture(event.imagePath);

      // Skip further processing if no meaningful text
      if (!textContent || textContent.length < 20) {
        return;
      }

      // Step 2: Semantic Analysis
      let analysis: ScreenAnalysis | null = null;
      if (this.settings.semanticAnalysisEnabled) {
        try {
          analysis = await this.semanticAnalyzer.analyzeContent(
            textContent,
            capture.appName,
            capture.windowTitle
          );
          console.log(`[deepContext] Analysis: ${analysis.appContext.activity}, ${analysis.commitments.length} commitments`);
        } catch (error) {
          console.error('[deepContext] Semantic analysis failed:', error);
        }
      }

      // Step 3: Store the capture with analysis
      const captureId = this.storeScreenCapture({
        ...capture,
        textContent,
        analysis,
      });

      this.capturesProcessed++;

      // Step 4: Process commitments
      if (analysis && analysis.commitments.length > 0 && this.settings.commitmentTrackingEnabled) {
        for (const commitment of analysis.commitments) {
          this.storeCommitment({
            text: commitment.text,
            type: commitment.type,
            recipient: commitment.recipient,
            deadline: commitment.deadline ? this.parseDeadline(commitment.deadline) : undefined,
            detectedAt: capture.timestamp,
            status: 'pending',
            sourceCaptureId: captureId,
            confidence: commitment.confidence,
            synced: false,
          });
          this.commitmentsDetected++;

          this.emit('event', {
            type: 'commitment_detected',
            data: commitment,
          } as DeepContextEvent);
        }
      }

      // Step 5: Process action items
      if (analysis && analysis.actionItems.length > 0) {
        for (const item of analysis.actionItems) {
          this.storeActionItem({
            text: item.text,
            priority: item.priority,
            source: item.source,
            detectedAt: capture.timestamp,
            status: 'pending',
            sourceCaptureId: captureId,
          });
        }
      }

      // Step 6: Track email/calendar context for cross-reference
      if (analysis?.emailContext) {
        this.trackEmailContext(analysis.emailContext, capture.appName, captureId);
      }

      if (analysis?.calendarContext) {
        this.trackCalendarContext(analysis.calendarContext, capture.appName, captureId);
      }

      // Emit context update
      this.emit('event', {
        type: 'context_updated',
        data: {
          capture,
          analysis,
        },
      } as DeepContextEvent);
    } catch (error) {
      console.error('[deepContext] Pipeline error:', error);
    }
  }

  // ============================================================================
  // Storage Operations
  // ============================================================================

  private storeScreenCapture(capture: ScreenCapture): number {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO screen_captures (timestamp, app_name, window_title, text_content, analysis, image_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      capture.timestamp,
      capture.appName,
      capture.windowTitle,
      capture.textContent,
      capture.analysis ? JSON.stringify(capture.analysis) : null,
      capture.imageHash
    );

    return result.lastInsertRowid as number;
  }

  private storeCommitment(commitment: Omit<Commitment, 'id'>): number {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO commitments (text, type, recipient, deadline, detected_at, completed_at, status, source_capture_id, context, confidence, synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      commitment.text,
      commitment.type,
      commitment.recipient || null,
      commitment.deadline || null,
      commitment.detectedAt,
      commitment.completedAt || null,
      commitment.status,
      commitment.sourceCaptureId || null,
      commitment.context ? JSON.stringify(commitment.context) : null,
      commitment.confidence,
      commitment.synced ? 1 : 0
    );

    console.log(`[deepContext] Stored commitment: "${commitment.text.substring(0, 50)}..."`);
    return result.lastInsertRowid as number;
  }

  private storeActionItem(item: Omit<ActionItem, 'id'>): number {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO action_items (text, priority, source, detected_at, completed_at, status, source_capture_id, context)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      item.text,
      item.priority,
      item.source,
      item.detectedAt,
      item.completedAt || null,
      item.status,
      item.sourceCaptureId || null,
      item.context ? JSON.stringify(item.context) : null
    );

    return result.lastInsertRowid as number;
  }

  private trackEmailContext(
    context: NonNullable<ScreenAnalysis['emailContext']>,
    appName: string,
    captureId: number
  ): void {
    // Check if this looks like a "sent" action (window title change, etc.)
    // For now, we track as "composing" and will update to "sent" when detected

    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO email_contexts (timestamp, app_name, action, recipient, subject, body_preview, has_attachment, source_capture_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      Date.now(),
      appName,
      context.composing ? 'composing' : 'reading',
      context.to.join(', ') || null,
      context.subject || null,
      context.bodyPreview || null,
      context.attachments.length > 0 ? 1 : 0,
      captureId
    );
  }

  private trackCalendarContext(
    context: NonNullable<ScreenAnalysis['calendarContext']>,
    appName: string,
    captureId: number
  ): void {
    const db = getDatabase();

    // If we detect a "created" event, this can complete commitments
    if (context.creating) {
      const stmt = db.prepare(`
        INSERT INTO calendar_contexts (timestamp, app_name, action, event_title, event_time, participants, source_capture_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        Date.now(),
        appName,
        context.creating ? 'creating' : 'viewing',
        context.eventTitle || null,
        context.eventTime || null,
        context.participants ? JSON.stringify(context.participants) : null,
        captureId
      );

      // Try to match with pending "create_event" commitments
      if (context.eventTitle) {
        this.tryMatchCalendarCommitment(context.eventTitle);
      }
    }
  }

  // ============================================================================
  // Cross-Reference Engine
  // ============================================================================

  private async checkCommitmentsForFollowUp(): Promise<void> {
    console.log('[deepContext] Checking commitments for follow-ups...');

    const pendingFollowUps = this.getPendingFollowUps();

    if (pendingFollowUps.length > 0) {
      console.log(`[deepContext] Found ${pendingFollowUps.length} pending follow-ups`);

      this.emit('event', {
        type: 'follow_up_needed',
        data: pendingFollowUps,
      } as DeepContextEvent);
    }
  }

  getPendingFollowUps(): PendingFollowUp[] {
    const db = getDatabase();

    // Get commitments from the last 2 hours that are still pending
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

    const commitments = db
      .prepare(`
        SELECT * FROM commitments
        WHERE status = 'pending'
          AND detected_at > ?
        ORDER BY detected_at DESC
      `)
      .all(twoHoursAgo) as Array<{
        id: number;
        text: string;
        type: string;
        recipient: string | null;
        deadline: number | null;
        detected_at: number;
        confidence: number;
      }>;

    const pendingFollowUps: PendingFollowUp[] = [];

    for (const commitment of commitments) {
      // Check if there's a matching completed action
      const hasMatchingAction = this.checkForMatchingAction(commitment);

      if (!hasMatchingAction) {
        const ageMinutes = Math.round((Date.now() - commitment.detected_at) / 60000);
        let urgency: PendingFollowUp['urgency'] = 'low';

        if (ageMinutes > 60) {
          urgency = 'high';
        } else if (ageMinutes > 30) {
          urgency = 'medium';
        }

        pendingFollowUps.push({
          commitment: {
            id: commitment.id,
            text: commitment.text,
            type: commitment.type as Commitment['type'],
            recipient: commitment.recipient || undefined,
            deadline: commitment.deadline || undefined,
            detectedAt: commitment.detected_at,
            status: 'pending',
            confidence: commitment.confidence,
            synced: false,
          },
          suggestedAction: this.getSuggestedAction(commitment.type),
          context: `Mentioned ${ageMinutes} minutes ago but no action detected`,
          urgency,
        });
      }
    }

    return pendingFollowUps;
  }

  private checkForMatchingAction(commitment: {
    type: string;
    recipient: string | null;
    detected_at: number;
  }): boolean {
    const db = getDatabase();

    switch (commitment.type) {
      case 'create_event': {
        // Check for calendar event created after the commitment
        const calendarAction = db
          .prepare(`
            SELECT * FROM calendar_contexts
            WHERE action = 'creating' AND timestamp > ?
            LIMIT 1
          `)
          .get(commitment.detected_at);
        return !!calendarAction;
      }

      case 'send_email': {
        // Check for email sent after the commitment
        const emailAction = db
          .prepare(`
            SELECT * FROM email_contexts
            WHERE action IN ('composing', 'sending', 'sent') AND timestamp > ?
            LIMIT 1
          `)
          .get(commitment.detected_at);
        return !!emailAction;
      }

      default:
        // For other types, check completed_actions table
        const completedAction = db
          .prepare(`
            SELECT * FROM completed_actions
            WHERE timestamp > ?
            LIMIT 1
          `)
          .get(commitment.detected_at);
        return !!completedAction;
    }
  }

  private tryMatchCalendarCommitment(eventTitle: string): void {
    const db = getDatabase();

    // Find recent "create_event" commitments
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const commitments = db
      .prepare(`
        SELECT * FROM commitments
        WHERE type = 'create_event'
          AND status = 'pending'
          AND detected_at > ?
      `)
      .all(oneHourAgo) as Array<{ id: number; text: string }>;

    // Simple matching: if any commitment text mentions similar keywords
    for (const commitment of commitments) {
      const lowerCommitment = commitment.text.toLowerCase();
      const lowerTitle = eventTitle.toLowerCase();

      // Basic fuzzy match
      const words = lowerTitle.split(/\s+/).filter((w) => w.length > 3);
      const hasMatch = words.some((word) => lowerCommitment.includes(word));

      if (hasMatch) {
        // Mark commitment as completed
        db.prepare(`
          UPDATE commitments
          SET status = 'completed', completed_at = ?
          WHERE id = ?
        `).run(Date.now(), commitment.id);

        // Record the completed action
        db.prepare(`
          INSERT INTO completed_actions (action_type, details, timestamp, app_name, matched_commitment_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          'created_event',
          JSON.stringify({ eventTitle }),
          Date.now(),
          'Calendar',
          commitment.id
        );

        this.actionsCompleted++;
        console.log(`[deepContext] Matched commitment "${commitment.text.substring(0, 40)}..." with calendar event`);

        this.emit('event', {
          type: 'action_completed',
          data: {
            commitmentId: commitment.id,
            actionType: 'created_event',
            eventTitle,
          },
        } as DeepContextEvent);
      }
    }
  }

  private getSuggestedAction(type: string): string {
    switch (type) {
      case 'send_email':
        return 'Send the email you mentioned';
      case 'create_event':
        return 'Create the calendar event';
      case 'send_file':
        return 'Send the file you mentioned';
      case 'follow_up':
        return 'Follow up as promised';
      case 'make_call':
        return 'Make the call you mentioned';
      default:
        return 'Complete the action you mentioned';
    }
  }

  private parseDeadline(deadlineStr: string): number | undefined {
    const lowerStr = deadlineStr.toLowerCase();

    // Handle relative times
    if (lowerStr.includes('tomorrow')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM
      return tomorrow.getTime();
    }

    if (lowerStr.includes('today')) {
      const today = new Date();
      today.setHours(17, 0, 0, 0); // Default to 5 PM
      return today.getTime();
    }

    if (lowerStr.includes('next week')) {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      return nextWeek.getTime();
    }

    // Try to parse as date
    const parsed = Date.parse(deadlineStr);
    if (!isNaN(parsed)) {
      return parsed;
    }

    return undefined;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  isRunning(): boolean {
    return this._isRunning;
  }

  getStats(): DeepContextStatus {
    return this.getStatus();
  }

  getStatus(): DeepContextStatus {
    return {
      isRunning: this._isRunning,
      capturesProcessed: this.capturesProcessed,
      commitmentsDetected: this.commitmentsDetected,
      actionsCompleted: this.actionsCompleted,
      pendingFollowUps: this.getPendingFollowUps().length,
      lastCaptureTime: this.lastCaptureTime,
      settings: this.settings,
    };
  }

  getCommitments(status?: 'pending' | 'completed' | 'expired' | 'dismissed', limit: number = 20): Commitment[] {
    const db = getDatabase();
    let query = `SELECT * FROM commitments`;
    const params: (string | number)[] = [];

    if (status) {
      query += ` WHERE status = ?`;
      params.push(status);
    }

    query += ` ORDER BY detected_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params) as Array<{
      id: number;
      text: string;
      type: string;
      recipient: string | null;
      deadline: number | null;
      detected_at: number;
      completed_at: number | null;
      status: string;
      source_capture_id: number | null;
      context: string | null;
      confidence: number;
      synced: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      type: row.type as Commitment['type'],
      recipient: row.recipient || undefined,
      deadline: row.deadline || undefined,
      detectedAt: row.detected_at,
      completedAt: row.completed_at || undefined,
      status: row.status as Commitment['status'],
      sourceCaptureId: row.source_capture_id || undefined,
      context: row.context ? JSON.parse(row.context) : undefined,
      confidence: row.confidence,
      synced: !!row.synced,
    }));
  }

  getRecentCommitments(limit: number = 10): Commitment[] {
    const db = getDatabase();
    const rows = db
      .prepare(`
        SELECT * FROM commitments
        ORDER BY detected_at DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        text: string;
        type: string;
        recipient: string | null;
        deadline: number | null;
        detected_at: number;
        completed_at: number | null;
        status: string;
        source_capture_id: number | null;
        context: string | null;
        confidence: number;
        synced: number;
      }>;

    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      type: row.type as Commitment['type'],
      recipient: row.recipient || undefined,
      deadline: row.deadline || undefined,
      detectedAt: row.detected_at,
      completedAt: row.completed_at || undefined,
      status: row.status as Commitment['status'],
      sourceCaptureId: row.source_capture_id || undefined,
      context: row.context ? JSON.parse(row.context) : undefined,
      confidence: row.confidence,
      synced: !!row.synced,
    }));
  }

  getRecentActionItems(limit: number = 10): ActionItem[] {
    const db = getDatabase();
    const rows = db
      .prepare(`
        SELECT * FROM action_items
        ORDER BY detected_at DESC
        LIMIT ?
      `)
      .all(limit) as Array<{
        id: number;
        text: string;
        priority: string;
        source: string;
        detected_at: number;
        completed_at: number | null;
        status: string;
        source_capture_id: number | null;
        context: string | null;
      }>;

    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      priority: row.priority as ActionItem['priority'],
      source: row.source as ActionItem['source'],
      detectedAt: row.detected_at,
      completedAt: row.completed_at || undefined,
      status: row.status as ActionItem['status'],
      sourceCaptureId: row.source_capture_id || undefined,
      context: row.context ? JSON.parse(row.context) : undefined,
    }));
  }

  /**
   * Get enriched context for SYNC AI
   */
  getEnrichedContextForSync(): string {
    const pendingFollowUps = this.getPendingFollowUps();
    const recentCommitments = this.getRecentCommitments(5);
    const recentActions = this.getRecentActionItems(5);

    const lines: string[] = [];

    // Pending follow-ups (high priority)
    if (pendingFollowUps.length > 0) {
      lines.push('PENDING FOLLOW-UPS:');
      for (const followUp of pendingFollowUps.slice(0, 3)) {
        lines.push(`- ${followUp.suggestedAction}: "${followUp.commitment.text}" (${followUp.urgency} urgency)`);
      }
      lines.push('');
    }

    // Recent commitments
    const pendingCommitments = recentCommitments.filter((c) => c.status === 'pending');
    if (pendingCommitments.length > 0) {
      lines.push('RECENT COMMITMENTS:');
      for (const commitment of pendingCommitments.slice(0, 3)) {
        const age = Math.round((Date.now() - commitment.detectedAt) / 60000);
        lines.push(`- "${commitment.text}" (${age} min ago, ${commitment.status})`);
      }
      lines.push('');
    }

    // Action items
    const pendingActions = recentActions.filter((a) => a.status === 'pending');
    if (pendingActions.length > 0) {
      lines.push('ACTION ITEMS:');
      for (const action of pendingActions.slice(0, 3)) {
        lines.push(`- [${action.priority.toUpperCase()}] ${action.text}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Manually mark a commitment as completed
   */
  completeCommitment(commitmentId: number): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE commitments
      SET status = 'completed', completed_at = ?
      WHERE id = ?
    `).run(Date.now(), commitmentId);

    this.actionsCompleted++;
  }

  /**
   * Dismiss a commitment (user doesn't need to complete it)
   */
  dismissCommitment(commitmentId: number): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE commitments
      SET status = 'dismissed'
      WHERE id = ?
    `).run(commitmentId);
  }

  /**
   * Get aggregated deep context data for the last completed hour
   * Used by summaryService to include OCR text, semantic categories, and commitments
   */
  /**
   * Get aggregated deep context data for the current (partial) hour.
   * Used by saveOrUpdateCurrentHourSummary() before each sync cycle.
   */
  getCurrentHourDeepContext(): { ocrText?: string; semanticCategory?: string; commitments?: any[] } | null {
    const now = new Date();
    const currentHour = new Date(now);
    currentHour.setMinutes(0, 0, 0);

    return this.getDeepContextForRange(currentHour.getTime(), now.getTime());
  }

  getLastHourDeepContext(): { ocrText?: string; semanticCategory?: string; commitments?: any[] } | null {
    // Calculate last hour boundaries
    const now = new Date();
    const lastHour = new Date(now);
    lastHour.setHours(lastHour.getHours() - 1);
    lastHour.setMinutes(0, 0, 0);

    const hourStart = lastHour.getTime();
    const hourEnd = hourStart + 60 * 60 * 1000;

    return this.getDeepContextForRange(hourStart, hourEnd);
  }

  private getDeepContextForRange(rangeStart: number, rangeEnd: number): { ocrText?: string; semanticCategory?: string; commitments?: any[] } | null {
    const db = getDatabase();

    const hourStart = rangeStart;
    const hourEnd = rangeEnd;

    // Get all screen captures from the last hour
    const captures = db
      .prepare(`
        SELECT text_content, analysis FROM screen_captures
        WHERE timestamp >= ? AND timestamp < ?
        ORDER BY timestamp ASC
      `)
      .all(hourStart, hourEnd) as Array<{
        text_content: string | null;
        analysis: string | null;
      }>;

    if (captures.length === 0) {
      return null;
    }

    // Aggregate OCR text (sample, don't include everything to save space)
    const allText = captures
      .map(c => c.text_content)
      .filter(t => t && t.length > 20)
      .join(' ');
    const ocrText = allText.length > 500 ? allText.substring(0, 500) + '...' : allText;

    // Find most common semantic category
    const categories = new Map<string, number>();
    for (const capture of captures) {
      if (capture.analysis) {
        try {
          const analysis = JSON.parse(capture.analysis);
          const category = analysis.appContext?.activity;
          if (category) {
            categories.set(category, (categories.get(category) || 0) + 1);
          }
        } catch (error) {
          // Skip invalid JSON
        }
      }
    }

    let semanticCategory: string | undefined;
    let maxCount = 0;
    for (const [category, count] of categories) {
      if (count > maxCount) {
        maxCount = count;
        semanticCategory = category;
      }
    }

    // Get commitments detected during this hour
    const commitmentRows = db
      .prepare(`
        SELECT text, type, recipient, deadline, confidence FROM commitments
        WHERE detected_at >= ? AND detected_at < ?
        ORDER BY confidence DESC
        LIMIT 10
      `)
      .all(hourStart, hourEnd) as Array<{
        text: string;
        type: string;
        recipient: string | null;
        deadline: number | null;
        confidence: number;
      }>;

    const commitments = commitmentRows.map(c => ({
      text: c.text,
      type: c.type,
      recipient: c.recipient,
      deadline: c.deadline,
      confidence: c.confidence,
    }));

    return {
      ocrText: ocrText || undefined,
      semanticCategory,
      commitments: commitments.length > 0 ? commitments : undefined,
    };
  }
}
