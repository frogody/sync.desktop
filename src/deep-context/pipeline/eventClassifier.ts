/**
 * Event Classifier
 *
 * Classifies raw accessibility captures into structured ContextEvents
 * using regex patterns and heuristics. No LLM calls in Phase 1.
 *
 * Detects:
 * - Commitments (promises, agreements, deadlines)
 * - Activity types (email, calendar, coding, browsing, etc.)
 * - Entities (people, projects, tools)
 * - Skill signals (tool/domain proficiency indicators)
 * - Context switches (unrelated task transitions)
 */

import type {
  ContextEvent,
  ContextEventType,
  Commitment,
  SkillSignal,
  AccessibilityCaptureResult,
  FileChangeEvent,
} from '../types';

// ============================================================================
// Activity Detection Map
// ============================================================================

type ActivityCategory =
  | 'email_compose'
  | 'email_read'
  | 'calendar'
  | 'coding'
  | 'document_editing'
  | 'browsing'
  | 'communication'
  | 'meeting'
  | 'design'
  | 'spreadsheet'
  | 'terminal'
  | 'other';

const APP_CATEGORY_MAP: Record<string, ActivityCategory> = {
  // Email
  'mail': 'email_compose',
  'outlook': 'email_compose',
  'gmail': 'email_compose',
  'thunderbird': 'email_compose',
  'spark': 'email_compose',
  'airmail': 'email_compose',
  // Calendar
  'calendar': 'calendar',
  'fantastical': 'calendar',
  // Code editors
  'visual studio code': 'coding',
  'vs code': 'coding',
  'code': 'coding',
  'xcode': 'coding',
  'intellij': 'coding',
  'webstorm': 'coding',
  'sublime text': 'coding',
  'vim': 'coding',
  'neovim': 'coding',
  'cursor': 'coding',
  'zed': 'coding',
  // Communication
  'slack': 'communication',
  'discord': 'communication',
  'teams': 'communication',
  'messages': 'communication',
  'whatsapp': 'communication',
  'telegram': 'communication',
  // Meetings
  'zoom': 'meeting',
  'google meet': 'meeting',
  'facetime': 'meeting',
  'webex': 'meeting',
  'skype': 'meeting',
  // Design
  'figma': 'design',
  'sketch': 'design',
  'adobe photoshop': 'design',
  'adobe illustrator': 'design',
  'canva': 'design',
  // Document editing
  'notion': 'document_editing',
  'obsidian': 'document_editing',
  'word': 'document_editing',
  'pages': 'document_editing',
  'google docs': 'document_editing',
  'notes': 'document_editing',
  'bear': 'document_editing',
  // Spreadsheets
  'numbers': 'spreadsheet',
  'microsoft excel': 'spreadsheet',
  'excel': 'spreadsheet',
  'google sheets': 'spreadsheet',
  // Terminal
  'terminal': 'terminal',
  'iterm': 'terminal',
  'warp': 'terminal',
  'hyper': 'terminal',
  // Browsers
  'chrome': 'browsing',
  'safari': 'browsing',
  'firefox': 'browsing',
  'arc': 'browsing',
  'brave': 'browsing',
  'edge': 'browsing',
  'opera': 'browsing',
};

// ============================================================================
// Skill Category Map
// ============================================================================

const SKILL_CATEGORY_MAP: Record<ActivityCategory, { category: string; path: string[] }> = {
  coding: { category: 'Technology', path: ['Technology', 'Software Development'] },
  terminal: { category: 'Technology', path: ['Technology', 'DevOps'] },
  email_compose: { category: 'Communication', path: ['Communication', 'Written Communication'] },
  email_read: { category: 'Communication', path: ['Communication', 'Email Management'] },
  communication: { category: 'Communication', path: ['Communication', 'Team Collaboration'] },
  meeting: { category: 'Communication', path: ['Communication', 'Meetings'] },
  document_editing: { category: 'Productivity', path: ['Productivity', 'Documentation'] },
  spreadsheet: { category: 'Analytics', path: ['Analytics', 'Data Analysis'] },
  design: { category: 'Design', path: ['Design', 'Visual Design'] },
  calendar: { category: 'Productivity', path: ['Productivity', 'Time Management'] },
  browsing: { category: 'Research', path: ['Research', 'Web Research'] },
  other: { category: 'General', path: ['General'] },
};

// ============================================================================
// Commitment Patterns
// ============================================================================

const COMMITMENT_PATTERNS: {
  regex: RegExp;
  action: string;
}[] = [
  // "I will / I'll" patterns
  { regex: /I(?:'ll| will) (?:send|email|forward)(?: you| them| him| her)? (?:a |the )?(.+?)(?:\.|!|$)/gi, action: 'send_email' },
  { regex: /I(?:'ll| will) (?:create|schedule|set up|book) (?:a |the )?(?:meeting|event|call|appointment)(.+?)(?:\.|!|$)/gi, action: 'create_event' },
  { regex: /I(?:'ll| will) (?:send|share|forward) (?:the |a )?(?:file|document|doc|pdf|attachment|report|spreadsheet)(.+?)(?:\.|!|$)/gi, action: 'send_file' },
  { regex: /I(?:'ll| will) (?:follow up|get back to|reach out|circle back|touch base)(.+?)(?:\.|!|$)/gi, action: 'follow_up' },
  { regex: /I(?:'ll| will) (?:call|phone|ring)(.+?)(?:\.|!|$)/gi, action: 'make_call' },
  // "Let me" patterns
  { regex: /let me (?:send|email|schedule|create|set up|share|forward)(.+?)(?:\.|!|$)/gi, action: 'follow_up' },
  // "Going to" patterns
  { regex: /(?:going to|gonna) (?:send|email|schedule|create|share)(.+?)(?:\.|!|$)/gi, action: 'follow_up' },
  // "Need to / Have to" patterns
  { regex: /(?:need|have) to (?:send|email|call|follow up|schedule|finish|complete|submit)(.+?)(?:\.|!|$)/gi, action: 'follow_up' },
  // "Remind me" patterns
  { regex: /remind(?:er)?(?:\s+me)?\s+to\s+(.+?)(?:\.|!|$)/gi, action: 'follow_up' },
  // "By [deadline]" patterns
  { regex: /(?:by|before|due|deadline)\s+(?:end of day|eod|tomorrow|next week|friday|monday|tuesday|wednesday|thursday|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d+)/gi, action: 'deadline' },
  // "Agreed to" / "promised" patterns
  { regex: /(?:agreed|promised|committed) to (.+?)(?:\.|!|$)/gi, action: 'follow_up' },
];

// ============================================================================
// Deadline Patterns
// ============================================================================

const DEADLINE_PATTERNS: { regex: RegExp; resolver: () => number }[] = [
  {
    regex: /\b(?:today|end of day|eod|tonight)\b/i,
    resolver: () => {
      const d = new Date();
      d.setHours(17, 0, 0, 0);
      return d.getTime();
    },
  },
  {
    regex: /\btomorrow\b/i,
    resolver: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    },
  },
  {
    regex: /\bnext week\b/i,
    resolver: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.getTime();
    },
  },
  {
    regex: /\b(?:this |next )?(?:monday)\b/i,
    resolver: () => nextDayOfWeek(1),
  },
  {
    regex: /\b(?:this |next )?(?:tuesday)\b/i,
    resolver: () => nextDayOfWeek(2),
  },
  {
    regex: /\b(?:this |next )?(?:wednesday)\b/i,
    resolver: () => nextDayOfWeek(3),
  },
  {
    regex: /\b(?:this |next )?(?:thursday)\b/i,
    resolver: () => nextDayOfWeek(4),
  },
  {
    regex: /\b(?:this |next )?(?:friday)\b/i,
    resolver: () => nextDayOfWeek(5),
  },
];

function nextDayOfWeek(dayOfWeek: number): number {
  const d = new Date();
  const currentDay = d.getDay();
  let daysAhead = dayOfWeek - currentDay;
  if (daysAhead <= 0) daysAhead += 7;
  d.setDate(d.getDate() + daysAhead);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

// ============================================================================
// Entity Extraction Patterns
// ============================================================================

const ENTITY_PATTERNS = [
  // Capitalized names (2+ word names)
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
  // @mentions
  /@(\w+)/g,
  // Project/tool names in common formats
  /(?:project|repo|repository|branch|ticket|issue|PR|pull request)\s+[:#]?\s*([A-Za-z0-9_-]+)/gi,
];

// ============================================================================
// Event Classifier Class
// ============================================================================

export class EventClassifier {
  private lastAppName: string | null = null;
  private lastCategory: ActivityCategory | null = null;

  // ============================================================================
  // Main Classification
  // ============================================================================

  /**
   * Classify an accessibility capture into a ContextEvent.
   */
  classifyCapture(capture: AccessibilityCaptureResult): ContextEvent {
    const category = this.detectCategory(capture.appName, capture.windowTitle, capture.visibleText);
    const text = capture.visibleText || capture.focusedElementText || '';

    // Detect context switch
    const isContextSwitch = this.detectContextSwitch(capture.appName, category);
    this.lastAppName = capture.appName;
    this.lastCategory = category;

    // Extract information
    const commitments = this.extractCommitments(text);
    const entities = this.extractEntities(text);
    const skillSignals = this.detectSkillSignals(category, capture.appName, text);

    // Determine event type (priority order matters)
    let eventType: ContextEventType;
    if (commitments.length > 0) {
      eventType = 'commitment_detected';
    } else if (isContextSwitch) {
      eventType = 'context_switch';
    } else if (category === 'communication' || category === 'email_compose' || category === 'email_read' || category === 'meeting') {
      eventType = 'communication_event';
    } else if (skillSignals.length > 0) {
      eventType = 'skill_signal';
    } else {
      eventType = 'document_interaction';
    }

    // Build summary
    const summary = this.buildSummary(category, capture.appName, capture.windowTitle, text);

    // Determine intent
    const intent = this.detectIntent(category, capture.windowTitle, text);

    // Calculate confidence
    const confidence = this.calculateConfidence(text, commitments);

    return {
      timestamp: capture.timestamp,
      eventType,
      source: {
        application: capture.appName,
        windowTitle: capture.windowTitle,
        url: capture.url,
        filePath: capture.filePath,
      },
      semanticPayload: {
        summary,
        entities,
        intent,
        commitments: commitments.length > 0 ? commitments : undefined,
        skillSignals: skillSignals.length > 0 ? skillSignals : undefined,
      },
      confidence,
      privacyLevel: 'sync_allowed',
      synced: false,
    };
  }

  /**
   * Classify a file change event into a ContextEvent.
   */
  classifyFileEvent(event: FileChangeEvent): ContextEvent {
    const summary = `File ${event.eventType}: ${event.fileName}`;
    const skillSignals = this.detectFileSkillSignals(event);

    return {
      timestamp: event.timestamp,
      eventType: 'document_interaction',
      source: {
        application: 'Finder',
        windowTitle: event.fileName,
        filePath: event.filePath,
      },
      semanticPayload: {
        summary,
        entities: [],
        intent: `${event.eventType} file`,
        skillSignals: skillSignals.length > 0 ? skillSignals : undefined,
      },
      confidence: 0.9,
      privacyLevel: 'sync_allowed',
      synced: false,
    };
  }

  // ============================================================================
  // Category Detection
  // ============================================================================

  private detectCategory(
    appName: string,
    windowTitle: string,
    text: string
  ): ActivityCategory {
    const lowerApp = appName.toLowerCase();
    const lowerTitle = windowTitle.toLowerCase();

    // Check app name against map
    for (const [pattern, category] of Object.entries(APP_CATEGORY_MAP)) {
      if (lowerApp.includes(pattern)) {
        // Refine email category based on context
        if (category === 'email_compose') {
          if (lowerTitle.includes('inbox') || lowerTitle.includes('- mail')) {
            return 'email_read';
          }
          if (lowerTitle.includes('compose') || lowerTitle.includes('new message') || lowerTitle.includes('draft')) {
            return 'email_compose';
          }
          // Check text content
          if (text && text.toLowerCase().includes('to:') && text.toLowerCase().includes('subject:')) {
            return 'email_compose';
          }
          return 'email_read';
        }
        return category;
      }
    }

    // Check window title for clues
    if (lowerTitle.includes('compose') || lowerTitle.includes('new message')) return 'email_compose';
    if (lowerTitle.includes('inbox') || lowerTitle.includes('mail')) return 'email_read';
    if (lowerTitle.includes('calendar') || lowerTitle.includes('event')) return 'calendar';

    return 'other';
  }

  // ============================================================================
  // Context Switch Detection
  // ============================================================================

  private detectContextSwitch(appName: string, category: ActivityCategory): boolean {
    if (!this.lastAppName || !this.lastCategory) return false;
    if (appName === this.lastAppName) return false;

    // Same category is not a context switch (e.g., switching between two code editors)
    if (category === this.lastCategory) return false;

    // Switching between related categories is not a context switch
    const relatedPairs: [ActivityCategory, ActivityCategory][] = [
      ['coding', 'terminal'],
      ['email_compose', 'email_read'],
      ['document_editing', 'spreadsheet'],
      ['browsing', 'document_editing'],
    ];

    for (const [a, b] of relatedPairs) {
      if (
        (category === a && this.lastCategory === b) ||
        (category === b && this.lastCategory === a)
      ) {
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // Commitment Extraction
  // ============================================================================

  extractCommitments(text: string): Commitment[] {
    if (!text || text.length < 10) return [];

    const commitments: Commitment[] = [];
    const seen = new Set<string>();

    for (const pattern of COMMITMENT_PATTERNS) {
      // Reset regex lastIndex for global regexes
      pattern.regex.lastIndex = 0;
      const matches = text.matchAll(pattern.regex);

      for (const match of matches) {
        const fullMatch = match[0].trim();
        const normalized = fullMatch.toLowerCase();

        // Deduplicate
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        // Extract deadline if present
        const dueDate = this.extractDeadline(fullMatch);

        // Extract involved parties
        const parties = this.extractParties(fullMatch);

        commitments.push({
          description: fullMatch,
          dueDate,
          involvedParties: parties,
          status: 'detected',
          requiredAction: pattern.action,
        });
      }
    }

    return commitments;
  }

  private extractDeadline(text: string): number | undefined {
    for (const pattern of DEADLINE_PATTERNS) {
      if (pattern.regex.test(text)) {
        return pattern.resolver();
      }
    }
    return undefined;
  }

  private extractParties(text: string): string[] {
    const parties: string[] = [];

    // Look for "to [Name]" or "with [Name]"
    const toMatch = text.match(/(?:to|with|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (toMatch) {
      parties.push(toMatch[1]);
    }

    // Look for @mentions
    const mentionMatches = text.matchAll(/@(\w+)/g);
    for (const match of mentionMatches) {
      parties.push(match[1]);
    }

    return [...new Set(parties)];
  }

  // ============================================================================
  // Entity Extraction
  // ============================================================================

  extractEntities(text: string): string[] {
    if (!text || text.length < 5) return [];

    const entities = new Set<string>();

    for (const pattern of ENTITY_PATTERNS) {
      pattern.lastIndex = 0;
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const entity = match[1] || match[0];
        // Filter out common non-entity capitalized words
        if (!isCommonWord(entity) && entity.length > 1 && entity.length < 50) {
          entities.add(entity.trim());
        }
      }
    }

    return Array.from(entities).slice(0, 20);
  }

  // ============================================================================
  // Skill Signal Detection
  // ============================================================================

  detectSkillSignals(
    category: ActivityCategory,
    appName: string,
    text: string
  ): SkillSignal[] {
    const signals: SkillSignal[] = [];
    const skillInfo = SKILL_CATEGORY_MAP[category];

    if (!skillInfo || category === 'other') return signals;

    // Build skill path including the specific app
    const skillPath = [...skillInfo.path, appName];

    // Determine proficiency based on heuristics
    const proficiency = this.estimateProficiency(text, category);

    signals.push({
      skillCategory: skillInfo.category,
      skillPath,
      proficiencyIndicator: proficiency,
      evidence: `Active use of ${appName}`,
    });

    // Additional skill signals from text content
    if (category === 'coding' && text) {
      const langSignals = this.detectProgrammingLanguages(text);
      for (const lang of langSignals) {
        signals.push({
          skillCategory: 'Technology',
          skillPath: ['Technology', 'Programming Languages', lang],
          proficiencyIndicator: 'intermediate',
          evidence: `Writing ${lang} code in ${appName}`,
        });
      }
    }

    return signals;
  }

  private detectFileSkillSignals(event: FileChangeEvent): SkillSignal[] {
    const signals: SkillSignal[] = [];
    const ext = event.extension.toLowerCase();

    const extensionSkillMap: Record<string, { category: string; path: string[] }> = {
      '.ts': { category: 'Technology', path: ['Technology', 'Programming Languages', 'TypeScript'] },
      '.tsx': { category: 'Technology', path: ['Technology', 'Programming Languages', 'TypeScript'] },
      '.js': { category: 'Technology', path: ['Technology', 'Programming Languages', 'JavaScript'] },
      '.jsx': { category: 'Technology', path: ['Technology', 'Programming Languages', 'JavaScript'] },
      '.py': { category: 'Technology', path: ['Technology', 'Programming Languages', 'Python'] },
      '.rs': { category: 'Technology', path: ['Technology', 'Programming Languages', 'Rust'] },
      '.go': { category: 'Technology', path: ['Technology', 'Programming Languages', 'Go'] },
      '.swift': { category: 'Technology', path: ['Technology', 'Programming Languages', 'Swift'] },
      '.java': { category: 'Technology', path: ['Technology', 'Programming Languages', 'Java'] },
      '.css': { category: 'Design', path: ['Design', 'Web Design', 'CSS'] },
      '.scss': { category: 'Design', path: ['Design', 'Web Design', 'SCSS'] },
      '.sql': { category: 'Technology', path: ['Technology', 'Databases', 'SQL'] },
      '.md': { category: 'Productivity', path: ['Productivity', 'Documentation', 'Markdown'] },
      '.docx': { category: 'Productivity', path: ['Productivity', 'Documentation', 'Word Processing'] },
      '.xlsx': { category: 'Analytics', path: ['Analytics', 'Spreadsheets'] },
      '.psd': { category: 'Design', path: ['Design', 'Graphic Design', 'Photoshop'] },
      '.fig': { category: 'Design', path: ['Design', 'UI Design', 'Figma'] },
    };

    const skillInfo = extensionSkillMap[ext];
    if (skillInfo) {
      signals.push({
        skillCategory: skillInfo.category,
        skillPath: skillInfo.path,
        proficiencyIndicator: 'intermediate',
        evidence: `${event.eventType} file: ${event.fileName}`,
      });
    }

    return signals;
  }

  private estimateProficiency(text: string, category: ActivityCategory): SkillSignal['proficiencyIndicator'] {
    // TODO: Decision point — proficiency estimation heuristics
    // For Phase 1, default to 'intermediate' for all activity
    // Phase 2 can analyze text complexity, tool usage patterns, etc.
    if (!text) return 'beginner';
    if (text.length > 500) return 'intermediate';
    return 'intermediate';
  }

  private detectProgrammingLanguages(text: string): string[] {
    const languages: string[] = [];
    const lowerText = text.toLowerCase();

    const languagePatterns: [string, RegExp][] = [
      ['TypeScript', /\b(?:interface|type|enum|as\s+\w+|:.*=>)\b/],
      ['Python', /\b(?:def\s+\w+|import\s+\w+|class\s+\w+.*:|self\.|__\w+__)\b/],
      ['JavaScript', /\b(?:const|let|var|function|=>|require\(|module\.exports)\b/],
      ['Rust', /\b(?:fn\s+\w+|let\s+mut|impl|pub\s+fn|use\s+\w+::)\b/],
      ['Go', /\b(?:func\s+\w+|package\s+\w+|import\s*\(|:=)\b/],
      ['SQL', /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE|JOIN)\b/i],
      ['HTML', /<(?:div|span|p|h[1-6]|a|img|form|table|section|header|footer)\b/i],
      ['CSS', /\{[^}]*(?:display|margin|padding|color|font-size|background|flex|grid)\s*:/i],
    ];

    for (const [lang, pattern] of languagePatterns) {
      if (pattern.test(text)) {
        languages.push(lang);
      }
    }

    return languages;
  }

  // ============================================================================
  // Summary & Intent
  // ============================================================================

  private buildSummary(
    category: ActivityCategory,
    appName: string,
    windowTitle: string,
    text: string
  ): string {
    const categoryLabels: Record<ActivityCategory, string> = {
      email_compose: 'Composing email',
      email_read: 'Reading email',
      calendar: 'Managing calendar',
      coding: 'Writing code',
      document_editing: 'Editing document',
      browsing: 'Browsing web',
      communication: 'Communicating',
      meeting: 'In meeting',
      design: 'Designing',
      spreadsheet: 'Working on spreadsheet',
      terminal: 'Using terminal',
      other: 'Using application',
    };

    const action = categoryLabels[category];
    const titleSnippet = windowTitle.length > 50 ? windowTitle.substring(0, 50) + '...' : windowTitle;

    return `${action} in ${appName}: ${titleSnippet}`;
  }

  private detectIntent(
    category: ActivityCategory,
    windowTitle: string,
    text: string
  ): string {
    switch (category) {
      case 'email_compose':
        return 'composing email message';
      case 'email_read':
        return 'reviewing emails';
      case 'calendar':
        if (text.toLowerCase().includes('create') || text.toLowerCase().includes('new event')) {
          return 'creating calendar event';
        }
        return 'reviewing schedule';
      case 'coding':
        return 'writing or editing code';
      case 'document_editing':
        return 'editing document content';
      case 'browsing':
        return 'researching or browsing';
      case 'communication':
        return 'communicating with team';
      case 'meeting':
        return 'participating in meeting';
      case 'design':
        return 'creating visual designs';
      case 'spreadsheet':
        return 'analyzing data in spreadsheet';
      case 'terminal':
        return 'running commands';
      default:
        return 'general application use';
    }
  }

  // ============================================================================
  // Confidence Calculation
  // ============================================================================

  private calculateConfidence(text: string, commitments: Commitment[]): number {
    let confidence = 0.5;

    // More text = more confidence in classification
    if (text.length > 100) confidence += 0.1;
    if (text.length > 500) confidence += 0.1;

    // Commitments detected = higher confidence
    if (commitments.length > 0) confidence += 0.2;

    return Math.min(confidence, 1.0);
  }
}

// ============================================================================
// Helpers
// ============================================================================

const COMMON_WORDS = new Set([
  'The', 'This', 'That', 'These', 'Those', 'Here', 'There', 'Where',
  'When', 'What', 'Which', 'Who', 'How', 'Why', 'From', 'With',
  'About', 'After', 'Before', 'Between', 'Under', 'Over', 'Into',
  'Through', 'During', 'Until', 'Against', 'Along', 'Among',
  'New', 'Open', 'Close', 'Save', 'Edit', 'View', 'Help',
  'File', 'Window', 'Tools', 'Format', 'Insert', 'Table',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
  'Saturday', 'Sunday', 'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December', 'Today', 'Tomorrow', 'Yesterday',
]);

function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(word);
}
