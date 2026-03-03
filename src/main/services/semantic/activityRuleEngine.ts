/**
 * Activity Rule Engine
 *
 * Maps app name + window title + context to activity classifications
 * using an extended version of the APP_CATEGORY_MAP pattern from
 * deep-context/pipeline/eventClassifier.ts.
 *
 * Pure rule-based (no MLX). Returns classifications with confidence
 * 0.3–0.9 depending on match strength.
 */

import type { ContextEvent } from '../../../deep-context/types';
import type { ActivityType, ActivitySubtype, ActivityClassification } from './types';

// ============================================================================
// App → Activity Map (extended from APP_CATEGORY_MAP)
// ============================================================================

interface AppActivity {
  type: ActivityType;
  subtype: ActivitySubtype;
  confidence: number;
}

const APP_ACTIVITY_MAP: Record<string, AppActivity> = {
  // --- Code Editors → BUILDING / coding ---
  'visual studio code': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'vs code': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'code': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'cursor': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'xcode': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'intellij idea': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'intellij': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'webstorm': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'pycharm': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'goland': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'rubymine': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'sublime text': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'vim': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  'neovim': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  'zed': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'android studio': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'fleet': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },
  'nova': { type: 'BUILDING', subtype: 'coding', confidence: 0.85 },

  // --- Design Tools → BUILDING / designing ---
  'figma': { type: 'BUILDING', subtype: 'designing', confidence: 0.85 },
  'sketch': { type: 'BUILDING', subtype: 'designing', confidence: 0.85 },
  'adobe photoshop': { type: 'BUILDING', subtype: 'designing', confidence: 0.80 },
  'adobe illustrator': { type: 'BUILDING', subtype: 'designing', confidence: 0.85 },
  'adobe xd': { type: 'BUILDING', subtype: 'designing', confidence: 0.85 },
  'canva': { type: 'BUILDING', subtype: 'designing', confidence: 0.75 },
  'framer': { type: 'BUILDING', subtype: 'designing', confidence: 0.85 },
  'principle': { type: 'BUILDING', subtype: 'designing', confidence: 0.85 },

  // --- Messaging → COMMUNICATING / messaging ---
  'slack': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.80 },
  'discord': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.80 },
  'teams': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.75 },
  'microsoft teams': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.75 },
  'messages': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.80 },
  'whatsapp': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.80 },
  'telegram': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.80 },
  'signal': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.80 },

  // --- Email → COMMUNICATING / emailing ---
  'mail': { type: 'COMMUNICATING', subtype: 'emailing', confidence: 0.80 },
  'outlook': { type: 'COMMUNICATING', subtype: 'emailing', confidence: 0.80 },
  'thunderbird': { type: 'COMMUNICATING', subtype: 'emailing', confidence: 0.80 },
  'spark': { type: 'COMMUNICATING', subtype: 'emailing', confidence: 0.80 },
  'airmail': { type: 'COMMUNICATING', subtype: 'emailing', confidence: 0.80 },
  'superhuman': { type: 'COMMUNICATING', subtype: 'emailing', confidence: 0.85 },

  // --- Meetings → COMMUNICATING / meeting ---
  'zoom': { type: 'COMMUNICATING', subtype: 'meeting', confidence: 0.90 },
  'google meet': { type: 'COMMUNICATING', subtype: 'meeting', confidence: 0.90 },
  'facetime': { type: 'COMMUNICATING', subtype: 'meeting', confidence: 0.85 },
  'webex': { type: 'COMMUNICATING', subtype: 'meeting', confidence: 0.90 },
  'skype': { type: 'COMMUNICATING', subtype: 'meeting', confidence: 0.85 },
  'around': { type: 'COMMUNICATING', subtype: 'meeting', confidence: 0.85 },
  'loom': { type: 'COMMUNICATING', subtype: 'presenting', confidence: 0.80 },
  'krisp': { type: 'COMMUNICATING', subtype: 'meeting', confidence: 0.80 },
  'gather': { type: 'COMMUNICATING', subtype: 'meeting', confidence: 0.80 },

  // --- Social Media → COMMUNICATING / messaging ---
  'twitter': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.70 },
  'tweetdeck': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.70 },
  'linkedin': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.70 },
  'facebook': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.65 },
  'instagram': { type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.65 },

  // --- Project Management → ORGANIZING / planning ---
  'jira': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  'linear': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  'asana': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  'trello': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  'monday': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  'monday.com': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  'clickup': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  'height': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  'shortcut': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  'basecamp': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  'todoist': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.75 },
  'things': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.75 },
  'omnifocus': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.75 },
  'ticktick': { type: 'ORGANIZING', subtype: 'planning', confidence: 0.75 },

  // --- Document Editing → BUILDING / writing ---
  'notion': { type: 'ORGANIZING', subtype: 'documenting', confidence: 0.70 },
  'obsidian': { type: 'BUILDING', subtype: 'writing', confidence: 0.70 },
  'word': { type: 'BUILDING', subtype: 'writing', confidence: 0.75 },
  'microsoft word': { type: 'BUILDING', subtype: 'writing', confidence: 0.75 },
  'pages': { type: 'BUILDING', subtype: 'writing', confidence: 0.75 },
  'google docs': { type: 'BUILDING', subtype: 'writing', confidence: 0.75 },
  'bear': { type: 'BUILDING', subtype: 'writing', confidence: 0.70 },
  'ulysses': { type: 'BUILDING', subtype: 'writing', confidence: 0.80 },
  'ia writer': { type: 'BUILDING', subtype: 'writing', confidence: 0.80 },

  // --- Spreadsheets → INVESTIGATING / analyzing ---
  'numbers': { type: 'INVESTIGATING', subtype: 'analyzing', confidence: 0.70 },
  'microsoft excel': { type: 'INVESTIGATING', subtype: 'analyzing', confidence: 0.70 },
  'excel': { type: 'INVESTIGATING', subtype: 'analyzing', confidence: 0.70 },
  'google sheets': { type: 'INVESTIGATING', subtype: 'analyzing', confidence: 0.70 },

  // --- Terminal → BUILDING / coding (may be refined by title) ---
  'terminal': { type: 'BUILDING', subtype: 'coding', confidence: 0.60 },
  'iterm': { type: 'BUILDING', subtype: 'coding', confidence: 0.60 },
  'iterm2': { type: 'BUILDING', subtype: 'coding', confidence: 0.60 },
  'warp': { type: 'BUILDING', subtype: 'coding', confidence: 0.60 },
  'hyper': { type: 'BUILDING', subtype: 'coding', confidence: 0.60 },
  'kitty': { type: 'BUILDING', subtype: 'coding', confidence: 0.60 },
  'alacritty': { type: 'BUILDING', subtype: 'coding', confidence: 0.60 },

  // --- Calendar → ORGANIZING / scheduling ---
  'calendar': { type: 'ORGANIZING', subtype: 'scheduling', confidence: 0.85 },
  'fantastical': { type: 'ORGANIZING', subtype: 'scheduling', confidence: 0.85 },
  'google calendar': { type: 'ORGANIZING', subtype: 'scheduling', confidence: 0.85 },

  // --- File Management → ORGANIZING / filing ---
  'finder': { type: 'ORGANIZING', subtype: 'filing', confidence: 0.60 },
  'path finder': { type: 'ORGANIZING', subtype: 'filing', confidence: 0.65 },
  'forklift': { type: 'ORGANIZING', subtype: 'filing', confidence: 0.65 },

  // --- Notes → ORGANIZING / documenting ---
  'notes': { type: 'ORGANIZING', subtype: 'documenting', confidence: 0.65 },
  'evernote': { type: 'ORGANIZING', subtype: 'documenting', confidence: 0.65 },
  'onenote': { type: 'ORGANIZING', subtype: 'documenting', confidence: 0.65 },

  // --- Monitoring / DevOps → OPERATING ---
  'datadog': { type: 'OPERATING', subtype: 'monitoring', confidence: 0.85 },
  'grafana': { type: 'OPERATING', subtype: 'monitoring', confidence: 0.85 },
  'new relic': { type: 'OPERATING', subtype: 'monitoring', confidence: 0.85 },
  'docker desktop': { type: 'OPERATING', subtype: 'configuring', confidence: 0.75 },
  'docker': { type: 'OPERATING', subtype: 'configuring', confidence: 0.75 },
  'pgadmin': { type: 'OPERATING', subtype: 'configuring', confidence: 0.75 },
  'tableplus': { type: 'OPERATING', subtype: 'configuring', confidence: 0.75 },
  'datagrip': { type: 'OPERATING', subtype: 'configuring', confidence: 0.75 },
  'dbeaver': { type: 'OPERATING', subtype: 'configuring', confidence: 0.75 },
  'sequel pro': { type: 'OPERATING', subtype: 'configuring', confidence: 0.75 },
  'system preferences': { type: 'OPERATING', subtype: 'configuring', confidence: 0.65 },
  'system settings': { type: 'OPERATING', subtype: 'configuring', confidence: 0.65 },
  'activity monitor': { type: 'OPERATING', subtype: 'monitoring', confidence: 0.70 },
  'console': { type: 'OPERATING', subtype: 'monitoring', confidence: 0.70 },
  'keychain access': { type: 'OPERATING', subtype: 'configuring', confidence: 0.65 },
  'transmit': { type: 'OPERATING', subtype: 'deploying', confidence: 0.70 },
  'cyberduck': { type: 'OPERATING', subtype: 'deploying', confidence: 0.70 },
  'filezilla': { type: 'OPERATING', subtype: 'deploying', confidence: 0.70 },
  '1password': { type: 'OPERATING', subtype: 'configuring', confidence: 0.60 },
  'lastpass': { type: 'OPERATING', subtype: 'configuring', confidence: 0.60 },
  'bitwarden': { type: 'OPERATING', subtype: 'configuring', confidence: 0.60 },
};

// ============================================================================
// File Extension → Activity Classification
// ============================================================================

interface CompoundExtensionPattern {
  pattern: RegExp;
  activity: { type: ActivityType; subtype: ActivitySubtype; confidence: number };
}

const COMPOUND_EXTENSION_PATTERNS: CompoundExtensionPattern[] = [
  { pattern: /\.test\.[jt]sx?$/i, activity: { type: 'OPERATING', subtype: 'testing_infra', confidence: 0.85 } },
  { pattern: /\.spec\.[jt]sx?$/i, activity: { type: 'OPERATING', subtype: 'testing_infra', confidence: 0.85 } },
  { pattern: /\.stories\.[jt]sx?$/i, activity: { type: 'BUILDING', subtype: 'designing', confidence: 0.70 } },
  { pattern: /\.config\.[jt]s$/i, activity: { type: 'BUILDING', subtype: 'coding', confidence: 0.70 } },
];

const FILE_EXTENSION_MAP: Record<string, { type: ActivityType; subtype: ActivitySubtype; confidence: number }> = {
  // Source code
  '.ts': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.tsx': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.js': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.jsx': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.py': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.go': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.rs': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.java': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.swift': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.kt': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.c': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.cpp': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.h': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.rb': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.php': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  '.sql': { type: 'BUILDING', subtype: 'coding', confidence: 0.80 },

  // Styles
  '.css': { type: 'BUILDING', subtype: 'designing', confidence: 0.75 },
  '.scss': { type: 'BUILDING', subtype: 'designing', confidence: 0.75 },
  '.less': { type: 'BUILDING', subtype: 'designing', confidence: 0.75 },
  '.sass': { type: 'BUILDING', subtype: 'designing', confidence: 0.75 },
  '.styl': { type: 'BUILDING', subtype: 'designing', confidence: 0.75 },

  // Templates
  '.html': { type: 'BUILDING', subtype: 'coding', confidence: 0.75 },
  '.htm': { type: 'BUILDING', subtype: 'coding', confidence: 0.75 },
  '.vue': { type: 'BUILDING', subtype: 'coding', confidence: 0.75 },
  '.svelte': { type: 'BUILDING', subtype: 'coding', confidence: 0.75 },

  // Config
  '.json': { type: 'BUILDING', subtype: 'coding', confidence: 0.70 },
  '.yaml': { type: 'BUILDING', subtype: 'coding', confidence: 0.70 },
  '.yml': { type: 'BUILDING', subtype: 'coding', confidence: 0.70 },
  '.toml': { type: 'BUILDING', subtype: 'coding', confidence: 0.70 },
  '.env': { type: 'BUILDING', subtype: 'coding', confidence: 0.65 },

  // Docs
  '.md': { type: 'BUILDING', subtype: 'writing', confidence: 0.70 },
  '.txt': { type: 'BUILDING', subtype: 'writing', confidence: 0.65 },
  '.rst': { type: 'BUILDING', subtype: 'writing', confidence: 0.70 },

  // Documents
  '.pdf': { type: 'INVESTIGATING', subtype: 'reading', confidence: 0.75 },
  '.doc': { type: 'INVESTIGATING', subtype: 'reading', confidence: 0.75 },
  '.docx': { type: 'INVESTIGATING', subtype: 'reading', confidence: 0.75 },

  // Data
  '.xlsx': { type: 'INVESTIGATING', subtype: 'analyzing', confidence: 0.70 },
  '.xls': { type: 'INVESTIGATING', subtype: 'analyzing', confidence: 0.70 },
  '.csv': { type: 'INVESTIGATING', subtype: 'analyzing', confidence: 0.70 },

  // Images
  '.png': { type: 'BUILDING', subtype: 'designing', confidence: 0.65 },
  '.jpg': { type: 'BUILDING', subtype: 'designing', confidence: 0.65 },
  '.jpeg': { type: 'BUILDING', subtype: 'designing', confidence: 0.65 },
  '.gif': { type: 'BUILDING', subtype: 'designing', confidence: 0.65 },
  '.svg': { type: 'BUILDING', subtype: 'designing', confidence: 0.70 },
  '.figma': { type: 'BUILDING', subtype: 'designing', confidence: 0.75 },

  // Scripts
  '.sh': { type: 'OPERATING', subtype: 'configuring', confidence: 0.70 },
  '.bash': { type: 'OPERATING', subtype: 'configuring', confidence: 0.70 },
  '.zsh': { type: 'OPERATING', subtype: 'configuring', confidence: 0.70 },

  // Logs
  '.log': { type: 'INVESTIGATING', subtype: 'analyzing', confidence: 0.70 },
};

// ============================================================================
// Window Title Refinement Patterns
// ============================================================================

interface TitlePattern {
  pattern: RegExp;
  type: ActivityType;
  subtype: ActivitySubtype;
  confidence: number;
}

const TITLE_PATTERNS: TitlePattern[] = [
  // IDE / editor refinements
  { pattern: /\bdebug(ger|ging)?\b/i, type: 'BUILDING', subtype: 'debugging', confidence: 0.80 },
  { pattern: /\bbreakpoint/i, type: 'BUILDING', subtype: 'debugging', confidence: 0.80 },
  { pattern: /\btest(s|ing|\.ts|\.js|\.py|_spec|_test)\b/i, type: 'OPERATING', subtype: 'testing_infra', confidence: 0.75 },
  { pattern: /\bjest\b|\bvitest\b|\bpytest\b|\bmocha\b/i, type: 'OPERATING', subtype: 'testing_infra', confidence: 0.80 },

  // Terminal refinements
  { pattern: /\bgit push\b|\bgit merge\b|\bdeploy\b|\bkubectl apply\b/i, type: 'OPERATING', subtype: 'deploying', confidence: 0.80 },
  { pattern: /\bdocker\b|\bdocker-compose\b|\bterraform\b/i, type: 'OPERATING', subtype: 'configuring', confidence: 0.75 },
  { pattern: /\bnpm test\b|\byarn test\b|\bpnpm test\b|\bjest\b|\bpytest\b/i, type: 'OPERATING', subtype: 'testing_infra', confidence: 0.80 },
  { pattern: /\bnpm install\b|\byarn add\b|\bpip install\b|\bbrew install\b/i, type: 'OPERATING', subtype: 'updating', confidence: 0.70 },
  { pattern: /\bnpm run build\b|\byarn build\b|\bmake\b/i, type: 'BUILDING', subtype: 'coding', confidence: 0.70 },

  // Browser refinements — INVESTIGATING
  { pattern: /stackoverflow\.com|stackexchange\.com/i, type: 'INVESTIGATING', subtype: 'searching', confidence: 0.80 },
  { pattern: /docs\.|documentation|\.dev\/docs|readme/i, type: 'INVESTIGATING', subtype: 'reading', confidence: 0.75 },
  { pattern: /mdn web docs|developer\.mozilla/i, type: 'INVESTIGATING', subtype: 'reading', confidence: 0.80 },
  { pattern: /github\.com.*\/pull\//i, type: 'INVESTIGATING', subtype: 'reviewing', confidence: 0.80 },
  { pattern: /github\.com.*\/issues\//i, type: 'INVESTIGATING', subtype: 'reading', confidence: 0.70 },
  { pattern: /\bgoogle\b.*search|duckduckgo|bing\.com\/search/i, type: 'INVESTIGATING', subtype: 'searching', confidence: 0.75 },
  { pattern: /medium\.com|dev\.to|hashnode/i, type: 'INVESTIGATING', subtype: 'reading', confidence: 0.70 },
  { pattern: /udemy|coursera|pluralsight|egghead/i, type: 'INVESTIGATING', subtype: 'learning', confidence: 0.80 },
  { pattern: /youtube\.com.*tutorial|youtube\.com.*course/i, type: 'INVESTIGATING', subtype: 'learning', confidence: 0.75 },

  // Browser refinements — BUILDING (web IDEs)
  { pattern: /localhost(:\d+)?/i, type: 'BUILDING', subtype: 'coding', confidence: 0.70 },
  { pattern: /codesandbox\.io|codepen\.io|replit\.com|stackblitz\.com/i, type: 'BUILDING', subtype: 'coding', confidence: 0.80 },
  { pattern: /vercel\.com\/.*deployments/i, type: 'OPERATING', subtype: 'deploying', confidence: 0.75 },
  { pattern: /netlify\.com.*deploys/i, type: 'OPERATING', subtype: 'deploying', confidence: 0.75 },

  // Browser refinements — COMMUNICATING
  { pattern: /gmail\.com|mail\.google\.com|outlook\.live\.com|protonmail/i, type: 'COMMUNICATING', subtype: 'emailing', confidence: 0.80 },
  { pattern: /outlook\.office\.com|outlook\.office365\.com/i, type: 'COMMUNICATING', subtype: 'emailing', confidence: 0.80 },
  { pattern: /mail\.yahoo\.com|fastmail\.com|hey\.com/i, type: 'COMMUNICATING', subtype: 'emailing', confidence: 0.80 },
  { pattern: /web\.whatsapp\.com|web\.telegram\.org/i, type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.80 },
  { pattern: /app\.slack\.com/i, type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.80 },
  { pattern: /discord\.com\/channels/i, type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.80 },
  { pattern: /teams\.microsoft\.com/i, type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.80 },
  { pattern: /meet\.google\.com|zoom\.us\/j\//i, type: 'COMMUNICATING', subtype: 'meeting', confidence: 0.85 },
  { pattern: /twitter\.com|x\.com\/(?!search)/i, type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.65 },
  { pattern: /linkedin\.com\/messaging|linkedin\.com\/in\//i, type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.70 },
  { pattern: /facebook\.com\/messages|messenger\.com/i, type: 'COMMUNICATING', subtype: 'messaging', confidence: 0.75 },

  // Browser refinements — ORGANIZING
  { pattern: /notion\.so/i, type: 'ORGANIZING', subtype: 'documenting', confidence: 0.70 },
  { pattern: /linear\.app|jira.*board|asana\.com/i, type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  { pattern: /trello\.com|monday\.com|clickup\.com/i, type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  { pattern: /basecamp\.com|height\.app|shortcut\.com/i, type: 'ORGANIZING', subtype: 'planning', confidence: 0.80 },
  { pattern: /calendar\.google\.com/i, type: 'ORGANIZING', subtype: 'scheduling', confidence: 0.85 },
  { pattern: /outlook\.office\.com\/calendar|outlook\.live\.com\/calendar/i, type: 'ORGANIZING', subtype: 'scheduling', confidence: 0.85 },
  { pattern: /confluence|wiki/i, type: 'ORGANIZING', subtype: 'documenting', confidence: 0.70 },
  { pattern: /docs\.google\.com\/spreadsheets/i, type: 'ORGANIZING', subtype: 'planning', confidence: 0.65 },
  { pattern: /airtable\.com/i, type: 'ORGANIZING', subtype: 'planning', confidence: 0.75 },
  { pattern: /coda\.io|roamresearch\.com/i, type: 'ORGANIZING', subtype: 'documenting', confidence: 0.70 },
  { pattern: /todoist\.com|ticktick\.com/i, type: 'ORGANIZING', subtype: 'planning', confidence: 0.75 },

  // Browser refinements — OPERATING
  { pattern: /console\.aws\.amazon|portal\.azure|console\.cloud\.google/i, type: 'OPERATING', subtype: 'configuring', confidence: 0.75 },
  { pattern: /sentry\.io|bugsnag|rollbar/i, type: 'OPERATING', subtype: 'monitoring', confidence: 0.80 },
  { pattern: /github\.com\/.*\/actions/i, type: 'OPERATING', subtype: 'deploying', confidence: 0.75 },
  { pattern: /app\.circleci\.com|travis-ci\.com|jenkins/i, type: 'OPERATING', subtype: 'deploying', confidence: 0.75 },
  { pattern: /app\.datadoghq\.com|grafana\.|newrelic\.com/i, type: 'OPERATING', subtype: 'monitoring', confidence: 0.80 },
  { pattern: /vercel\.com\/.*\/deployments|vercel\.com\/.*\/logs/i, type: 'OPERATING', subtype: 'deploying', confidence: 0.80 },
  { pattern: /netlify\.com\/sites|render\.com\/dashboard/i, type: 'OPERATING', subtype: 'deploying', confidence: 0.75 },
  { pattern: /supabase\.com\/dashboard|firebase\.google\.com\/project/i, type: 'OPERATING', subtype: 'configuring', confidence: 0.75 },
  { pattern: /cloudflare\.com\/|heroku\.com\/apps/i, type: 'OPERATING', subtype: 'configuring', confidence: 0.75 },
  { pattern: /admin\.|dashboard\.|analytics\./i, type: 'OPERATING', subtype: 'monitoring', confidence: 0.60 },
  { pattern: /pagerduty\.com|opsgenie\.com|statuspage\.io/i, type: 'OPERATING', subtype: 'monitoring', confidence: 0.80 },
];

// Browser app names (used to trigger title-based classification)
const BROWSER_APPS = new Set([
  'chrome', 'safari', 'firefox', 'arc', 'brave', 'edge', 'opera',
  'google chrome', 'microsoft edge', 'mozilla firefox',
]);

// ============================================================================
// Rule Engine
// ============================================================================

export class ActivityRuleEngine {
  /**
   * Classify a context event into the activity taxonomy using rules only.
   * Returns null if no confident match can be made.
   */
  classify(event: ContextEvent): ActivityClassification {
    const appName = event.source.application.toLowerCase().trim();
    const windowTitle = event.source.windowTitle || '';
    const url = event.source.url || '';
    const combinedTitle = `${windowTitle} ${url}`.trim();

    // 1. Try window title patterns first (they override app-level classification)
    //    — but only for browsers and terminals where context varies heavily
    const isBrowser = BROWSER_APPS.has(appName);
    const isTerminal = ['terminal', 'iterm', 'iterm2', 'warp', 'hyper', 'kitty', 'alacritty'].includes(appName);

    if ((isBrowser || isTerminal) && combinedTitle) {
      const titleMatch = this.matchTitlePatterns(combinedTitle);
      if (titleMatch) {
        return titleMatch;
      }
    }

    // 2. For file-manager apps, try file-extension classification first
    const isFileManager = ['finder', 'path finder', 'forklift'].includes(appName);
    if (isFileManager) {
      const fileResult = this.classifyByFileExtension(event.source.filePath, windowTitle);
      if (fileResult) return fileResult;
    }

    // 3. Check app-level classification
    const appMatch = APP_ACTIVITY_MAP[appName];
    if (appMatch) {
      // For IDEs, try to refine with title patterns (debug, test, etc.)
      if (appMatch.subtype === 'coding' && windowTitle) {
        const refinement = this.matchTitlePatterns(windowTitle);
        if (refinement && refinement.confidence >= appMatch.confidence) {
          return refinement;
        }
      }

      return {
        activityType: appMatch.type,
        activitySubtype: appMatch.subtype,
        confidence: appMatch.confidence,
        method: 'rule',
      };
    }

    // 4. Fallback: try partial app name matches
    for (const [key, activity] of Object.entries(APP_ACTIVITY_MAP)) {
      if (appName.includes(key) || key.includes(appName)) {
        return {
          activityType: activity.type,
          activitySubtype: activity.subtype,
          confidence: activity.confidence * 0.8, // Lower confidence for partial match
          method: 'rule',
        };
      }
    }

    // 5. Last resort: try title patterns on any app
    if (combinedTitle) {
      const titleMatch = this.matchTitlePatterns(combinedTitle);
      if (titleMatch) {
        return {
          ...titleMatch,
          confidence: titleMatch.confidence * 0.8, // Lower confidence for title-only match
        };
      }
    }

    // 6. Default: CONTEXT_SWITCHING with low confidence
    return {
      activityType: 'CONTEXT_SWITCHING',
      activitySubtype: 'app_switch',
      confidence: 0.30,
      method: 'rule',
    };
  }

  private matchTitlePatterns(text: string): ActivityClassification | null {
    for (const pattern of TITLE_PATTERNS) {
      if (pattern.pattern.test(text)) {
        return {
          activityType: pattern.type,
          activitySubtype: pattern.subtype,
          confidence: pattern.confidence,
          method: 'rule',
        };
      }
    }
    return null;
  }

  private classifyByFileExtension(filePath?: string, windowTitle?: string): ActivityClassification | null {
    // Try filePath first, fall back to extracting from window title
    const pathToCheck = filePath || windowTitle || '';
    if (!pathToCheck) return null;

    // Check compound extension patterns first (order matters: test/spec before generic)
    for (const { pattern, activity } of COMPOUND_EXTENSION_PATTERNS) {
      if (pattern.test(pathToCheck)) {
        return {
          activityType: activity.type,
          activitySubtype: activity.subtype,
          confidence: activity.confidence,
          method: 'rule',
        };
      }
    }

    // Extract simple extension
    const extMatch = pathToCheck.match(/(\.[a-zA-Z0-9]+)$/);
    if (!extMatch) return null;

    const ext = extMatch[1].toLowerCase();
    const mapping = FILE_EXTENSION_MAP[ext];
    if (!mapping) return null;

    return {
      activityType: mapping.type,
      activitySubtype: mapping.subtype,
      confidence: mapping.confidence,
      method: 'rule',
    };
  }
}
