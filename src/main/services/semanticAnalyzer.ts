/**
 * Semantic Analyzer Service
 *
 * Uses LLM (Together.ai Kimi-K2) to analyze screen content and extract:
 * - Commitments and promises
 * - Action items and TODOs
 * - Email context (composing, recipients, subject)
 * - Calendar context (creating events, participants)
 *
 * This is the "brain" that understands what the user is doing
 * and what they've committed to doing.
 */

import {
  ScreenAnalysis,
  CommitmentType,
  ActionPriority,
  ActionSource,
  ActivityType,
} from '../../shared/types';
import { SUPABASE_URL } from '../../shared/constants';

// ============================================================================
// Configuration
// ============================================================================

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const MODEL = 'moonshotai/Kimi-K2-Instruct';

// App categories for activity detection
const APP_ACTIVITY_MAP: Record<string, ActivityType> = {
  // Email apps
  'mail': 'composing_email',
  'outlook': 'composing_email',
  'gmail': 'composing_email',
  'thunderbird': 'composing_email',
  'spark': 'composing_email',
  'airmail': 'composing_email',

  // Calendar apps
  'calendar': 'calendar',
  'fantastical': 'calendar',
  'google calendar': 'calendar',
  'outlook calendar': 'calendar',

  // Code editors
  'visual studio code': 'coding',
  'vs code': 'coding',
  'code': 'coding',
  'xcode': 'coding',
  'intellij': 'coding',
  'webstorm': 'coding',
  'sublime': 'coding',
  'vim': 'coding',
  'neovim': 'coding',
  'cursor': 'coding',

  // Communication
  'slack': 'chatting',
  'discord': 'chatting',
  'teams': 'chatting',
  'messages': 'chatting',
  'whatsapp': 'chatting',
  'telegram': 'chatting',

  // Meeting apps
  'zoom': 'meeting',
  'google meet': 'meeting',
  'facetime': 'meeting',
  'webex': 'meeting',
  'skype': 'meeting',

  // Document editing
  'notion': 'editing_doc',
  'obsidian': 'editing_doc',
  'word': 'editing_doc',
  'pages': 'editing_doc',
  'google docs': 'editing_doc',
  'notes': 'editing_doc',

  // Browsers
  'chrome': 'browsing',
  'safari': 'browsing',
  'firefox': 'browsing',
  'arc': 'browsing',
  'brave': 'browsing',
  'edge': 'browsing',
  'opera': 'browsing',

  // Terminal apps
  'terminal': 'coding',
  'iterm': 'coding',
  'warp': 'coding',
  'hyper': 'coding',

  // Design apps
  'figma': 'editing_doc',
  'sketch': 'editing_doc',
  'canva': 'editing_doc',
  'adobe photoshop': 'editing_doc',
  'adobe illustrator': 'editing_doc',

  // Spreadsheets
  'numbers': 'editing_doc',
  'excel': 'editing_doc',
  'google sheets': 'editing_doc',
};

// ============================================================================
// Semantic Analyzer Class
// ============================================================================

export class SemanticAnalyzer {
  private apiKey: string | null = null;
  private analysisQueue: Array<{
    text: string;
    appName: string;
    windowTitle: string;
    timestamp: number;
    resolve: (result: ScreenAnalysis) => void;
    reject: (error: Error) => void;
  }> = [];
  private isProcessing: boolean = false;
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY_MS = 2000; // Wait 2 seconds to batch requests
  private readonly MAX_BATCH_SIZE = 3;

  constructor() {
    // API key will be set from environment or store
    this.apiKey = process.env.TOGETHER_API_KEY || null;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  // ============================================================================
  // Analysis
  // ============================================================================

  async analyzeContent(
    text: string,
    appName: string,
    windowTitle: string
  ): Promise<ScreenAnalysis> {
    const timestamp = Date.now();

    // Quick pre-analysis without LLM
    const quickAnalysis = this.quickAnalysis(text, appName, windowTitle, timestamp);

    // If text is too short or no meaningful content, return quick analysis
    if (!text || text.length < 50) {
      return quickAnalysis;
    }

    // If no API key, return quick analysis
    if (!this.apiKey) {
      console.log('[semanticAnalyzer] No API key, using quick analysis only');
      return quickAnalysis;
    }

    // Queue for batch processing
    return new Promise((resolve, reject) => {
      this.analysisQueue.push({
        text,
        appName,
        windowTitle,
        timestamp,
        resolve,
        reject,
      });

      // Start batch timer if not already running
      if (!this.batchTimeout) {
        this.batchTimeout = setTimeout(() => {
          this.processBatch();
        }, this.BATCH_DELAY_MS);
      }

      // Process immediately if batch is full
      if (this.analysisQueue.length >= this.MAX_BATCH_SIZE) {
        if (this.batchTimeout) {
          clearTimeout(this.batchTimeout);
          this.batchTimeout = null;
        }
        this.processBatch();
      }
    });
  }

  // ============================================================================
  // Quick Analysis (No LLM)
  // ============================================================================

  private quickAnalysis(
    text: string,
    appName: string,
    windowTitle: string,
    timestamp: number
  ): ScreenAnalysis {
    // Detect activity type from app name
    const activity = this.detectActivity(appName, windowTitle, text);

    // Extract commitments using regex patterns
    const commitments = this.extractCommitmentsQuick(text);

    // Extract action items using regex patterns
    const actionItems = this.extractActionItemsQuick(text);

    // Detect email context
    const emailContext = this.detectEmailContext(text, appName, windowTitle);

    // Detect calendar context
    const calendarContext = this.detectCalendarContext(text, appName, windowTitle);

    return {
      timestamp,
      appContext: {
        app: appName,
        activity,
      },
      commitments,
      actionItems,
      emailContext,
      calendarContext,
    };
  }

  private detectActivity(appName: string, windowTitle: string, text: string): ActivityType {
    const lowerApp = appName.toLowerCase();
    const lowerTitle = windowTitle.toLowerCase();

    // Check app name against map
    for (const [pattern, activity] of Object.entries(APP_ACTIVITY_MAP)) {
      if (lowerApp.includes(pattern)) {
        return activity;
      }
    }

    // Check window title for clues
    if (lowerTitle.includes('compose') || lowerTitle.includes('new message')) {
      return 'composing_email';
    }
    if (lowerTitle.includes('inbox') || lowerTitle.includes('mail')) {
      return 'reading_email';
    }
    if (lowerTitle.includes('calendar') || lowerTitle.includes('event')) {
      return 'calendar';
    }

    // Check text content
    if (text && text.length > 0) {
      const lowerText = text.toLowerCase();
      if (lowerText.includes('to:') && lowerText.includes('subject:')) {
        return 'composing_email';
      }
      if (lowerText.includes('create event') || lowerText.includes('new event')) {
        return 'calendar';
      }
    }

    return 'other';
  }

  private extractCommitmentsQuick(text: string): ScreenAnalysis['commitments'] {
    const commitments: ScreenAnalysis['commitments'] = [];

    if (!text) return commitments;

    const patterns = [
      { regex: /I(?:'ll| will) (?:send|email) (?:you |them |him |her )?(?:a |the )?(\w+.*?)(?:\.|$)/gi, type: 'send_email' as CommitmentType },
      { regex: /I(?:'ll| will) (?:create|schedule|set up|book) (?:a |the )?(?:meeting|event|call|appointment)(.*?)(?:\.|$)/gi, type: 'create_event' as CommitmentType },
      { regex: /I(?:'ll| will) (?:send|share|forward) (?:you |them )?(?:the |a )?(?:file|document|doc|pdf|attachment)(.*?)(?:\.|$)/gi, type: 'send_file' as CommitmentType },
      { regex: /I(?:'ll| will) (?:follow up|get back|call|reach out)(.*?)(?:\.|$)/gi, type: 'follow_up' as CommitmentType },
      { regex: /I(?:'ll| will) (?:call|phone|ring)(.*?)(?:\.|$)/gi, type: 'make_call' as CommitmentType },
      { regex: /let me (?:send|email|schedule|create|set up)(.*?)(?:\.|$)/gi, type: 'other' as CommitmentType },
      { regex: /(?:going to|will) send (?:you |them )?(?:a |the )?calendar (?:invite|invitation)(.*?)(?:\.|$)/gi, type: 'create_event' as CommitmentType },
    ];

    for (const { regex, type } of patterns) {
      const matches = text.matchAll(regex);
      for (const match of matches) {
        commitments.push({
          text: match[0].trim(),
          type,
          confidence: 0.7,
        });
      }
    }

    return commitments;
  }

  private extractActionItemsQuick(text: string): ScreenAnalysis['actionItems'] {
    const items: ScreenAnalysis['actionItems'] = [];

    if (!text) return items;

    const patterns = [
      { regex: /TODO:?\s*(.+?)(?:\n|$)/gi, priority: 'medium' as ActionPriority },
      { regex: /URGENT:?\s*(.+?)(?:\n|$)/gi, priority: 'high' as ActionPriority },
      { regex: /ACTION:?\s*(.+?)(?:\n|$)/gi, priority: 'high' as ActionPriority },
      { regex: /(?:need|have) to (?:do|complete|finish|send|email)(.+?)(?:\.|$)/gi, priority: 'medium' as ActionPriority },
      { regex: /reminder:?\s*(.+?)(?:\n|$)/gi, priority: 'medium' as ActionPriority },
    ];

    for (const { regex, priority } of patterns) {
      const matches = text.matchAll(regex);
      for (const match of matches) {
        items.push({
          text: match[1]?.trim() || match[0].trim(),
          priority,
          source: 'other' as ActionSource,
        });
      }
    }

    return items;
  }

  private detectEmailContext(
    text: string,
    appName: string,
    windowTitle: string
  ): ScreenAnalysis['emailContext'] | undefined {
    const lowerApp = appName.toLowerCase();
    const lowerTitle = windowTitle.toLowerCase();
    const lowerText = (text || '').toLowerCase();

    // Check if this is an email app
    const isEmailApp = ['mail', 'outlook', 'gmail', 'thunderbird', 'spark', 'airmail'].some(
      (app) => lowerApp.includes(app)
    );

    if (!isEmailApp && !lowerText.includes('to:')) {
      return undefined;
    }

    // Check if composing
    const composing =
      lowerTitle.includes('compose') ||
      lowerTitle.includes('new message') ||
      lowerTitle.includes('draft') ||
      lowerText.includes('to:');

    // Try to extract recipients
    const toMatch = text?.match(/to:\s*([^\n]+)/i);
    const to = toMatch ? toMatch[1].split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [];

    // Try to extract subject
    const subjectMatch = text?.match(/subject:\s*([^\n]+)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : '';

    // Get body preview (first 200 chars after subject/to lines)
    let bodyPreview = '';
    if (text) {
      const lines = text.split('\n');
      const bodyLines = lines.filter(
        (line) =>
          !line.toLowerCase().startsWith('to:') &&
          !line.toLowerCase().startsWith('cc:') &&
          !line.toLowerCase().startsWith('bcc:') &&
          !line.toLowerCase().startsWith('subject:') &&
          !line.toLowerCase().startsWith('from:')
      );
      bodyPreview = bodyLines.join(' ').substring(0, 200);
    }

    return {
      composing,
      to,
      subject,
      bodyPreview,
      attachments: [],
    };
  }

  private detectCalendarContext(
    text: string,
    appName: string,
    windowTitle: string
  ): ScreenAnalysis['calendarContext'] | undefined {
    const lowerApp = appName.toLowerCase();
    const lowerTitle = windowTitle.toLowerCase();
    const lowerText = (text || '').toLowerCase();

    // Check if this is a calendar app
    const isCalendarApp = ['calendar', 'fantastical', 'outlook'].some(
      (app) => lowerApp.includes(app) || lowerTitle.includes(app)
    );

    if (!isCalendarApp && !lowerText.includes('event') && !lowerText.includes('meeting')) {
      return undefined;
    }

    const viewing = !lowerTitle.includes('new') && !lowerTitle.includes('create');
    const creating = lowerTitle.includes('new') || lowerTitle.includes('create') || lowerText.includes('create event');

    // Try to extract event title
    const titleMatch = text?.match(/(?:title|event|meeting):\s*([^\n]+)/i);
    const eventTitle = titleMatch ? titleMatch[1].trim() : undefined;

    // Try to extract time
    const timeMatch = text?.match(/(\d{1,2}:\d{2}(?:\s*(?:AM|PM))?(?:\s*-\s*\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)?)/i);
    const eventTime = timeMatch ? timeMatch[1] : undefined;

    return {
      viewing,
      creating,
      eventTitle,
      eventTime,
      participants: [],
    };
  }

  // ============================================================================
  // Batch Processing with LLM
  // ============================================================================

  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.analysisQueue.length === 0) return;

    this.isProcessing = true;
    this.batchTimeout = null;

    // Take up to MAX_BATCH_SIZE items
    const batch = this.analysisQueue.splice(0, this.MAX_BATCH_SIZE);

    try {
      // For now, process one at a time (can optimize later with batch prompts)
      for (const item of batch) {
        try {
          const result = await this.analyzeWithLLM(item.text, item.appName, item.windowTitle, item.timestamp);
          item.resolve(result);
        } catch (error) {
          // Fallback to quick analysis on error
          const fallback = this.quickAnalysis(item.text, item.appName, item.windowTitle, item.timestamp);
          item.resolve(fallback);
        }
      }
    } finally {
      this.isProcessing = false;

      // Process remaining items if any
      if (this.analysisQueue.length > 0 && !this.batchTimeout) {
        this.batchTimeout = setTimeout(() => {
          this.processBatch();
        }, this.BATCH_DELAY_MS);
      }
    }
  }

  private async analyzeWithLLM(
    text: string,
    appName: string,
    windowTitle: string,
    timestamp: number
  ): Promise<ScreenAnalysis> {
    const systemPrompt = `You are an AI assistant that analyzes screen content to extract actionable information.
Your job is to identify:
1. COMMITMENTS: Any promises or statements of future action the user is making
2. ACTION ITEMS: Tasks, TODOs, or things that need to be done
3. CONTEXT: What the user is currently doing (email, calendar, coding, etc.)

Be concise and accurate. Only extract clear commitments and action items.
Respond in valid JSON format only.`;

    const userPrompt = `Analyze this screen content from "${appName}" (window: "${windowTitle}"):

${text.substring(0, 3000)}

Extract and return JSON in this exact format:
{
  "activity": "composing_email|reading_email|editing_doc|browsing|coding|meeting|calendar|chatting|other",
  "commitments": [
    {
      "text": "the exact commitment text",
      "type": "send_email|create_event|send_file|follow_up|make_call|other",
      "recipient": "who it's to (if mentioned)",
      "deadline": "when (if mentioned)",
      "confidence": 0.0-1.0
    }
  ],
  "actionItems": [
    {
      "text": "the action item",
      "priority": "high|medium|low",
      "source": "email|document|chat|calendar|browser|other"
    }
  ],
  "emailContext": {
    "composing": true/false,
    "to": ["recipient@email.com"],
    "subject": "email subject",
    "bodyPreview": "first 100 chars of body"
  },
  "calendarContext": {
    "viewing": true/false,
    "creating": true/false,
    "eventTitle": "event title",
    "eventTime": "time if visible"
  }
}

Only include emailContext if this appears to be email-related.
Only include calendarContext if this appears to be calendar-related.
Return ONLY valid JSON, no other text.`;

    try {
      const response = await fetch(TOGETHER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content in LLM response');
      }

      // Parse JSON from response
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);

      console.log('[semanticAnalyzer] LLM analysis complete:', {
        activity: parsed.activity,
        commitments: parsed.commitments?.length || 0,
        actionItems: parsed.actionItems?.length || 0,
      });

      return {
        timestamp,
        appContext: {
          app: appName,
          activity: parsed.activity || 'other',
        },
        commitments: (parsed.commitments || []).map((c: any) => ({
          text: c.text,
          type: c.type || 'other',
          recipient: c.recipient,
          deadline: c.deadline,
          confidence: c.confidence || 0.7,
        })),
        actionItems: (parsed.actionItems || []).map((a: any) => ({
          text: a.text,
          priority: a.priority || 'medium',
          source: a.source || 'other',
        })),
        emailContext: parsed.emailContext
          ? {
              composing: parsed.emailContext.composing || false,
              to: parsed.emailContext.to || [],
              subject: parsed.emailContext.subject || '',
              bodyPreview: parsed.emailContext.bodyPreview || '',
              attachments: parsed.emailContext.attachments || [],
            }
          : undefined,
        calendarContext: parsed.calendarContext
          ? {
              viewing: parsed.calendarContext.viewing || false,
              creating: parsed.calendarContext.creating || false,
              eventTitle: parsed.calendarContext.eventTitle,
              eventTime: parsed.calendarContext.eventTime,
              participants: parsed.calendarContext.participants || [],
            }
          : undefined,
      };
    } catch (error) {
      console.error('[semanticAnalyzer] LLM analysis failed:', error);
      // Fall back to quick analysis
      return this.quickAnalysis(text, appName, windowTitle, timestamp);
    }
  }
}
