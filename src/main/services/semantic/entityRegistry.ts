/**
 * Entity Registry — Stage 1 of the Semantic Foundation
 *
 * Extracts entities (people, projects, tools, topics) from context events,
 * resolves aliases to canonical names, and maintains a relationship graph
 * based on co-occurrence.
 *
 * Phase 1: Rule-based extraction only (regex + app detection).
 * Phase 2 will add MLX-powered disambiguation via NotchBridge.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { ContextEvent } from '../../../deep-context/types';
import type { Entity, EntityType, EntityRole, ExtractionMethod, RelationshipType } from './types';
import {
  insertEntity,
  updateEntity,
  getEntityById,
  findEntityByName,
  findEntityByAlias,
  getRecentEntities,
  upsertEntityAlias,
  upsertEntityRelationship,
  linkEventToEntity,
} from '../../db/queries';

// ============================================================================
// App → Tool Entity Map
// ============================================================================

const APP_TOOL_MAP: Record<string, string> = {
  'visual studio code': 'VS Code',
  'vs code': 'VS Code',
  'code': 'VS Code',
  'cursor': 'Cursor',
  'zed': 'Zed',
  'xcode': 'Xcode',
  'intellij idea': 'IntelliJ IDEA',
  'intellij': 'IntelliJ IDEA',
  'webstorm': 'WebStorm',
  'sublime text': 'Sublime Text',
  'vim': 'Vim',
  'neovim': 'Neovim',
  'terminal': 'Terminal',
  'iterm': 'iTerm2',
  'iterm2': 'iTerm2',
  'warp': 'Warp',
  'hyper': 'Hyper',
  'figma': 'Figma',
  'sketch': 'Sketch',
  'slack': 'Slack',
  'discord': 'Discord',
  'teams': 'Microsoft Teams',
  'microsoft teams': 'Microsoft Teams',
  'zoom': 'Zoom',
  'notion': 'Notion',
  'obsidian': 'Obsidian',
  'linear': 'Linear',
  'jira': 'Jira',
  'chrome': 'Chrome',
  'google chrome': 'Chrome',
  'safari': 'Safari',
  'firefox': 'Firefox',
  'arc': 'Arc',
  'brave': 'Brave',
  'postman': 'Postman',
  'docker': 'Docker',
  'docker desktop': 'Docker',
  'tableplus': 'TablePlus',
  'datagrip': 'DataGrip',
};

// ============================================================================
// Entity Extraction Patterns
// ============================================================================

// Multi-word capitalized names (people, places, companies)
const NAME_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;

// @mentions
const MENTION_PATTERN = /@([A-Za-z0-9_-]{2,30})/g;

// Project references in common formats
const PROJECT_PATTERN = /(?:project|repo|repository|branch|ticket|issue|PR|pull request)\s+[:#]?\s*([A-Za-z0-9_-]{2,50})/gi;

// Generic directory names that should NOT be treated as project entities
const GENERIC_DIRECTORIES = new Set([
  'components', 'pages', 'hooks', 'lib', 'utils', 'src', 'dist', 'build',
  'node_modules', 'public', 'assets', 'static', 'styles', 'scripts',
  'tests', 'test', '__tests__', 'spec', 'fixtures', 'mocks',
  'config', 'configs', 'types', 'interfaces', 'models', 'services',
  'helpers', 'middleware', 'routes', 'api', 'views', 'templates',
  'layouts', 'containers', 'reducers', 'actions', 'store', 'context',
  'contexts', 'providers', 'modules', 'plugins', 'extensions', 'vendor', 'packages',
  'main', 'renderer', 'shared', 'common', 'core', 'app', 'server', 'client',
  'desktop', 'documents', 'downloads', 'pictures', 'music', 'movies',
  'applications', 'users', 'library', 'volumes', 'tmp', 'var', 'etc',
  'native', 'resources', 'features', 'supabase', 'functions',
]);

// File extension → technology name mapping
const FILE_EXT_TECHNOLOGY: Record<string, string> = {
  '.tsx': 'React', '.jsx': 'React',
  '.ts': 'TypeScript', '.js': 'JavaScript',
  '.py': 'Python', '.go': 'Go', '.rs': 'Rust',
  '.java': 'Java', '.swift': 'Swift', '.kt': 'Kotlin',
  '.rb': 'Ruby', '.php': 'PHP',
  '.vue': 'Vue', '.svelte': 'Svelte',
  '.css': 'CSS', '.scss': 'Sass',
  '.sql': 'SQL', '.sh': 'Shell',
};

// Git branch → project extraction
const GIT_BRANCH_PATTERN = /(?:feat|fix|chore|hotfix)[/]([A-Za-z0-9_-]+)/i;

// Window title patterns for project context
const TITLE_PROJECT_PATTERNS = [
  // "filename — ProjectName" (VS Code, Cursor, etc.)
  /\s[—–-]\s([A-Za-z0-9_-]+)(?:\s[—–-]|$)/,
  // "[ProjectName]" in title
  /\[([A-Za-z0-9_-]+)\]/,
  // "ProjectName - App Name"
  /^([A-Za-z0-9_-]+)\s-\s/,
];

// Window title patterns that indicate a person name
const PERSON_TITLE_PATTERNS = [
  // Email patterns: "To: John Smith", "From: Jane Doe"
  /(?:To|From|Cc|Bcc):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/,
  // Messaging: "DM with Sarah", "Chat with John Doe"
  /(?:DM|Chat|Conversation)\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
  // Call/Meeting: "Call with John Doe", "Meeting with Sarah"
  /(?:Call|Meeting|Video)\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
  // Messaging: "Message from Jane", "Reply to David"
  /(?:Message|Reply|Note)\s+(?:from|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
  // Slack/Teams DMs: "David Smith | Slack", "Jane Doe - Teams"
  /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s*[|—–-]\s*(?:Slack|Teams|Discord|Messages)/,
  // LinkedIn: "John Smith | LinkedIn"
  /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s*[|—–-]\s*LinkedIn/,
  // PR/review: "Review by John Smith", "Assigned to Jane"
  /(?:Review|Assigned|Created)\s+(?:by|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
];

// Organization extraction patterns from window titles and URLs
const ORG_TITLE_PATTERNS = [
  // LinkedIn company pages: "Company Name | LinkedIn"
  /^(.+?)\s*[|]\s*LinkedIn\s*$/,
  // GitHub org: "orgname/repo" — extract org
  /github\.com\/([A-Za-z0-9_-]+)\//,
  // Jira: "PROJ-123" — extract project key as potential org context
  /\b([A-Z]{2,8})-\d{1,6}\b/,
  // "Company Name - Careers" / "Company Name - About"
  /^(.+?)\s*[-—–]\s*(?:Careers|About|Jobs|Team|Blog|Press)/,
];

// URL domain → organization mapping (well-known SaaS domains)
const DOMAIN_ORG_MAP: Record<string, string> = {
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'bitbucket.org': 'Bitbucket',
  'vercel.com': 'Vercel',
  'netlify.com': 'Netlify',
  'heroku.com': 'Heroku',
  'aws.amazon.com': 'AWS',
  'console.cloud.google.com': 'Google Cloud',
  'portal.azure.com': 'Azure',
  'supabase.com': 'Supabase',
  'firebase.google.com': 'Firebase',
};

const COMMON_WORDS = new Set([
  'The', 'This', 'That', 'These', 'Those', 'Some', 'Any', 'All',
  'Each', 'Every', 'Both', 'Few', 'More', 'Most', 'Other', 'Such',
  'With', 'From', 'About', 'After', 'Before', 'Between', 'Under',
  'Over', 'Into', 'Through', 'During', 'Until', 'Against', 'Along',
  'New', 'Open', 'Close', 'Save', 'Edit', 'View', 'Help', 'File',
  'Window', 'Tools', 'Format', 'Insert', 'Table', 'Settings',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
  'Saturday', 'Sunday', 'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December', 'Today', 'Tomorrow', 'Yesterday',
  'Getting', 'Started', 'Welcome', 'Home', 'Dashboard',
  'Loading', 'Error', 'Success', 'Warning', 'Info',
  'Untitled', 'Document', 'Inbox', 'Sent', 'Draft', 'Drafts',
  'General', 'Channel', 'Thread', 'Message', 'Search',
  'Google', 'Apple', 'Microsoft',
]);

// ============================================================================
// LRU Cache
// ============================================================================

class LRUCache<K, V> {
  private capacity: number;
  private cache = new Map<K, V>();

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // Delete oldest entry (first key)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  values(): IterableIterator<V> {
    return this.cache.values();
  }

  evictToSize(newCapacity: number): void {
    while (this.cache.size > newCapacity) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      } else {
        break;
      }
    }
    this.capacity = newCapacity;
  }
}

// ============================================================================
// Entity Registry
// ============================================================================

interface CachedEntity {
  entityId: string;
  name: string;
  type: EntityType;
  aliases: string[];
  lastSeen: number;
}

export class EntityRegistry extends EventEmitter {
  private entityCache: LRUCache<string, CachedEntity>;
  private aliasIndex: Map<string, string>; // normalized alias → entityId
  private running = false;
  private lastExtractedEntities: Entity[] = [];

  constructor(cacheCapacity: number = 500) {
    super();
    this.entityCache = new LRUCache(cacheCapacity);
    this.aliasIndex = new Map();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Load recent entities into cache
    try {
      const recent = getRecentEntities(200);
      for (const entity of recent) {
        const cached: CachedEntity = {
          entityId: entity.entityId,
          name: entity.name,
          type: entity.type,
          aliases: [],
          lastSeen: entity.lastSeen,
        };
        this.entityCache.set(this.normalizeKey(entity.name), cached);
        this.aliasIndex.set(this.normalizeKey(entity.name), entity.entityId);
      }
      console.log(`[semantic:entities] Started. Loaded ${recent.length} entities into cache.`);
    } catch (err) {
      console.error('[semantic:entities] Failed to load cache:', err);
    }
  }

  stop(): void {
    this.running = false;
    this.entityCache.clear();
    this.aliasIndex.clear();
    console.log('[semantic:entities] Stopped.');
  }

  // ============================================================================
  // Core: Extract entities from a context event
  // ============================================================================

  extractAndResolve(event: ContextEvent): Entity[] {
    const now = Date.now();
    const entities: Entity[] = [];
    const seen = new Set<string>();

    // 1. Tool entity from app name
    const tool = this.extractToolEntity(event.source.application);
    if (tool && !seen.has(this.normalizeKey(tool.name))) {
      const resolved = this.resolveOrCreate(tool.name, 'tool', 'rule', now, event.source.application);
      entities.push(resolved);
      seen.add(this.normalizeKey(tool.name));
    }

    // 2. Project entity from window title / file path
    const projects = this.extractProjectEntities(event.source.windowTitle, event.source.filePath);
    for (const projectName of projects) {
      if (!seen.has(this.normalizeKey(projectName))) {
        const resolved = this.resolveOrCreate(projectName, 'project', 'rule', now, event.source.windowTitle);
        entities.push(resolved);
        seen.add(this.normalizeKey(projectName));
      }
    }

    // 2.5 Technology entity from file extension
    const techEntity = this.extractTechnologyEntity(event.source.filePath, event.source.windowTitle);
    if (techEntity && !seen.has(this.normalizeKey(techEntity))) {
      const resolved = this.resolveOrCreate(techEntity, 'topic', 'rule', now, 'file_extension');
      entities.push(resolved);
      seen.add(this.normalizeKey(techEntity));
    }

    // 3. People from semantic payload entities and text patterns
    const textSources = [
      event.semanticPayload.summary || '',
      event.source.windowTitle || '',
    ].join(' ');

    const people = this.extractPeopleEntities(textSources);
    for (const personName of people) {
      if (!seen.has(this.normalizeKey(personName))) {
        const resolved = this.resolveOrCreate(personName, 'person', 'regex', now, 'text_extraction');
        entities.push(resolved);
        seen.add(this.normalizeKey(personName));
      }
    }

    // 3.5 Organization entities from window titles and URLs
    const orgs = this.extractOrganizationEntities(event.source.windowTitle, event.source.url);
    for (const orgName of orgs) {
      if (!seen.has(this.normalizeKey(orgName))) {
        const resolved = this.resolveOrCreate(orgName, 'organization', 'rule', now, 'title_extraction');
        entities.push(resolved);
        seen.add(this.normalizeKey(orgName));
      }
    }

    // 4. Topic entities from semantic payload entities (existing)
    if (event.semanticPayload.entities) {
      for (const entityStr of event.semanticPayload.entities) {
        if (!seen.has(this.normalizeKey(entityStr)) && !COMMON_WORDS.has(entityStr)) {
          const resolved = this.resolveOrCreate(entityStr, 'topic', 'regex', now, 'deep_context');
          entities.push(resolved);
          seen.add(this.normalizeKey(resolved.name));
        }
      }
    }

    // 4.5 Skill signal entities from semantic payload
    if (event.semanticPayload.skillSignals && Array.isArray(event.semanticPayload.skillSignals)) {
      for (const signal of event.semanticPayload.skillSignals) {
        const skillPath = (signal as any).skillPath;
        if (Array.isArray(skillPath) && skillPath.length > 0) {
          const leafSkill = skillPath[skillPath.length - 1];
          if (leafSkill && typeof leafSkill === 'string' && !seen.has(this.normalizeKey(leafSkill))) {
            const resolved = this.resolveOrCreate(leafSkill, 'topic', 'rule', now, 'skill_signal');
            entities.push(resolved);
            seen.add(this.normalizeKey(leafSkill));
          }
        }
      }
    }

    // 5. Link all entities to this event
    const eventId = String(event.id || event.timestamp);
    for (let i = 0; i < entities.length; i++) {
      const role: EntityRole = i === 0 ? 'primary' : 'mentioned';
      try {
        linkEventToEntity({
          eventId,
          entityId: entities[i].entityId,
          role,
          extractionMethod: 'rule',
          confidence: entities[i].confidence,
          createdAt: now,
        });
      } catch (err) {
        // Ignore duplicate link errors
      }
    }

    // 6. Update co-occurrence relationships
    this.updateRelationships(entities, now);

    this.lastExtractedEntities = entities;
    this.emit('entities-extracted', { eventId, entities, timestamp: now });
    return entities;
  }

  /**
   * Get the entities from the last extractAndResolve() call.
   * Used by ThreadManager to get entities for the current event.
   */
  getLastExtractedEntities(): Entity[] {
    return this.lastExtractedEntities;
  }

  // ============================================================================
  // Entity Resolution
  // ============================================================================

  resolveOrCreate(
    mention: string,
    type: EntityType,
    method: ExtractionMethod,
    timestamp: number,
    source: string,
  ): Entity {
    const normalizedKey = this.normalizeKey(mention);

    // 1. Check in-memory cache
    const cached = this.entityCache.get(normalizedKey);
    if (cached) {
      // Update occurrence
      updateEntity(cached.entityId, {
        lastSeen: timestamp,
        occurrenceCount: undefined, // We'll increment in SQL
      });
      // Increment occurrence count directly
      try {
        const db = require('../../db/database').getDatabase();
        db.prepare('UPDATE semantic_entities SET occurrence_count = occurrence_count + 1, last_seen = ?, synced = 0, updated_at = ? WHERE entity_id = ?')
          .run(timestamp, timestamp, cached.entityId);
      } catch { /* ignore */ }

      cached.lastSeen = timestamp;
      const full = getEntityById(cached.entityId);
      if (full) return full;
    }

    // 2. Check alias index
    const aliasEntityId = this.aliasIndex.get(normalizedKey);
    if (aliasEntityId) {
      const entity = getEntityById(aliasEntityId);
      if (entity) {
        updateEntity(entity.entityId, { lastSeen: timestamp });
        return entity;
      }
    }

    // 3. Check DB by name
    const dbMatches = findEntityByName(mention, type);
    if (dbMatches.length > 0) {
      const entity = dbMatches[0];
      this.cacheEntity(entity);
      updateEntity(entity.entityId, { lastSeen: timestamp });
      return entity;
    }

    // 4. Check DB by alias
    const aliasMatch = findEntityByAlias(mention);
    if (aliasMatch) {
      this.cacheEntity(aliasMatch);
      return aliasMatch;
    }

    // 5. Create new entity
    const now = Date.now();
    const entity: Omit<Entity, 'id'> = {
      entityId: randomUUID(),
      name: mention,
      type,
      confidence: method === 'rule' ? 0.7 : method === 'regex' ? 0.5 : 0.8,
      firstSeen: timestamp,
      lastSeen: timestamp,
      occurrenceCount: 1,
      metadata: { source },
      privacyLevel: 'sync_allowed',
      synced: false,
      createdAt: now,
      updatedAt: now,
    };

    try {
      insertEntity(entity);
      upsertEntityAlias({
        entityId: entity.entityId,
        alias: mention,
        source: 'window_title',
        frequency: 1,
        createdAt: now,
      });
    } catch (err) {
      console.error('[semantic:entities] Failed to insert entity:', mention, err);
    }

    const fullEntity = { ...entity, id: 0 } as Entity;
    this.cacheEntity(fullEntity);
    return fullEntity;
  }

  // ============================================================================
  // Extraction Helpers
  // ============================================================================

  private extractToolEntity(appName: string): { name: string } | null {
    const lower = appName.toLowerCase();
    for (const [pattern, canonical] of Object.entries(APP_TOOL_MAP)) {
      if (lower.includes(pattern)) {
        return { name: canonical };
      }
    }
    // For unknown apps, use the app name as-is if it's reasonable
    if (appName.length > 1 && appName.length < 40 && !COMMON_WORDS.has(appName)) {
      return { name: appName };
    }
    return null;
  }

  private extractProjectEntities(windowTitle: string, filePath?: string): string[] {
    const projects: string[] = [];

    // From file path — smart project extraction
    if (filePath) {
      const projectName = this.extractProjectFromPath(filePath);
      if (projectName) projects.push(projectName);
    }

    // From window title patterns
    if (windowTitle) {
      for (const pattern of TITLE_PROJECT_PATTERNS) {
        const match = windowTitle.match(pattern);
        if (match?.[1] && match[1].length > 2 && !GENERIC_DIRECTORIES.has(match[1].toLowerCase())) {
          projects.push(match[1]);
          break;
        }
      }

      // Git branch pattern
      const gitMatch = windowTitle.match(GIT_BRANCH_PATTERN);
      if (gitMatch?.[1]) projects.push(gitMatch[1]);

      // Project pattern in text
      PROJECT_PATTERN.lastIndex = 0;
      const projectMatches = windowTitle.matchAll(PROJECT_PATTERN);
      for (const m of projectMatches) {
        if (m[1] && m[1].length > 2 && !COMMON_WORDS.has(m[1])) {
          projects.push(m[1]);
        }
      }

      // GitHub repo from URL in title: "owner/repo-name"
      const ghRepoMatch = windowTitle.match(/github\.com\/[A-Za-z0-9_-]+\/([A-Za-z0-9_.-]+)/);
      if (ghRepoMatch?.[1] && ghRepoMatch[1].length > 2) {
        projects.push(ghRepoMatch[1].replace(/\.git$/, ''));
      }

      // IDE workspace indicators: "workspace: ProjectName" or "~/ProjectName"
      const workspaceMatch = windowTitle.match(/(?:workspace|~\/|~\\)([A-Za-z0-9_.-]+)/i);
      if (workspaceMatch?.[1] && workspaceMatch[1].length > 2
          && !GENERIC_DIRECTORIES.has(workspaceMatch[1].toLowerCase())) {
        projects.push(workspaceMatch[1]);
      }
    }

    return [...new Set(projects)];
  }

  private extractProjectFromPath(filePath: string): string | null {
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);

    // Strategy 1: /Users/{username}/{project-name}/...
    const usersIdx = parts.indexOf('Users');
    if (usersIdx >= 0 && usersIdx + 2 < parts.length) {
      const candidate = parts[usersIdx + 2];
      const macOSStandard = new Set([
        'desktop', 'documents', 'downloads', 'pictures', 'music',
        'movies', 'library', 'applications', 'public',
      ]);
      if (candidate && !macOSStandard.has(candidate.toLowerCase())) {
        return candidate;
      }
      // If standard dir, try next level (e.g., /Users/x/Documents/my-project/...)
      if (usersIdx + 3 < parts.length) {
        const deeper = parts[usersIdx + 3];
        if (deeper && !GENERIC_DIRECTORIES.has(deeper.toLowerCase())) {
          return deeper;
        }
      }
    }

    // Strategy 2: Find directory before code markers (src, lib, pkg, app, cmd)
    const codeMarkers = ['src', 'lib', 'pkg', 'app', 'cmd', 'internal'];
    for (let i = 1; i < parts.length; i++) {
      if (codeMarkers.includes(parts[i].toLowerCase()) && i > 0) {
        const candidate = parts[i - 1];
        if (candidate && !GENERIC_DIRECTORIES.has(candidate.toLowerCase())
            && candidate.length > 1 && candidate.length < 50) {
          return candidate;
        }
      }
    }

    return null;
  }

  private extractTechnologyEntity(filePath?: string, windowTitle?: string): string | null {
    const target = filePath || windowTitle || '';
    if (!target) return null;
    if (/\.tsx$/i.test(target) || /\.jsx$/i.test(target)) return 'React';
    const extMatch = target.match(/(\.[a-zA-Z0-9]+)$/);
    if (!extMatch) return null;
    return FILE_EXT_TECHNOLOGY[extMatch[1].toLowerCase()] || null;
  }

  private extractOrganizationEntities(windowTitle: string, url?: string): string[] {
    const orgs: string[] = [];

    // From URL: extract GitHub org names
    if (url) {
      const ghMatch = url.match(/github\.com\/([A-Za-z0-9_-]+)\//);
      if (ghMatch?.[1] && ghMatch[1].length > 1 && !COMMON_WORDS.has(ghMatch[1])) {
        orgs.push(ghMatch[1]);
      }

      // From known SaaS domains — only extract if the user is actively using the service
      for (const [domain, orgName] of Object.entries(DOMAIN_ORG_MAP)) {
        if (url.includes(domain)) {
          orgs.push(orgName);
          break;
        }
      }
    }

    // From window title: Jira project keys (PROJ-123)
    if (windowTitle) {
      const jiraMatch = windowTitle.match(/\b([A-Z]{2,8})-\d{1,6}\b/);
      if (jiraMatch?.[1]) {
        orgs.push(jiraMatch[1]);
      }
    }

    return [...new Set(orgs)].slice(0, 5);
  }

  private extractPeopleEntities(text: string): string[] {
    if (!text || text.length < 5) return [];
    const people: string[] = [];

    // Targeted person extraction from window title patterns (high confidence)
    for (const pattern of PERSON_TITLE_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const name = match[1].trim();
        if (name.length > 2 && name.length < 40 && !COMMON_WORDS.has(name)) {
          people.push(name);
        }
      }
    }

    // Multi-word capitalized names
    NAME_PATTERN.lastIndex = 0;
    const nameMatches = text.matchAll(NAME_PATTERN);
    for (const match of nameMatches) {
      const name = match[1] || match[0];
      if (!COMMON_WORDS.has(name) && name.length > 3 && name.length < 40) {
        // Heuristic: 2-3 word capitalized names are likely people
        const wordCount = name.split(/\s+/).length;
        if (wordCount >= 2 && wordCount <= 3) {
          people.push(name.trim());
        }
      }
    }

    // @mentions
    MENTION_PATTERN.lastIndex = 0;
    const mentionMatches = text.matchAll(MENTION_PATTERN);
    for (const match of mentionMatches) {
      if (match[1] && match[1].length > 2) {
        people.push(match[1]);
      }
    }

    return [...new Set(people)].slice(0, 10);
  }

  // ============================================================================
  // Relationship Tracking
  // ============================================================================

  private updateRelationships(entities: Entity[], timestamp: number): void {
    if (entities.length < 2) return;

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];

        // Determine relationship type from entity types
        const relType = this.inferRelationshipType(a.type, b.type);

        try {
          upsertEntityRelationship({
            sourceEntityId: a.entityId,
            targetEntityId: b.entityId,
            relationshipType: relType,
            strength: 0.5,
            evidenceCount: 1,
            lastEvidence: timestamp,
            synced: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        } catch (err) {
          // Ignore relationship insert errors
        }
      }
    }
  }

  private inferRelationshipType(typeA: EntityType, typeB: EntityType): RelationshipType {
    if (typeA === 'person' && typeB === 'project') return 'works_on';
    if (typeA === 'project' && typeB === 'person') return 'works_on';
    if (typeA === 'person' && typeB === 'person') return 'collaborates_with';
    if (typeA === 'tool' && typeB === 'project') return 'uses';
    if (typeA === 'project' && typeB === 'tool') return 'uses';
    if (typeA === 'person' && typeB === 'organization') return 'member_of';
    return 'uses';
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  private cacheEntity(entity: Entity): void {
    const cached: CachedEntity = {
      entityId: entity.entityId,
      name: entity.name,
      type: entity.type,
      aliases: [],
      lastSeen: entity.lastSeen,
    };
    this.entityCache.set(this.normalizeKey(entity.name), cached);
    this.aliasIndex.set(this.normalizeKey(entity.name), entity.entityId);
  }

  private normalizeKey(name: string): string {
    return name.toLowerCase().trim();
  }

  // ============================================================================
  // Query Methods (public API)
  // ============================================================================

  getEntity(entityId: string): Entity | null {
    return getEntityById(entityId);
  }

  searchEntities(query: string, type?: EntityType): Entity[] {
    const results = findEntityByName(query, type);
    if (results.length > 0) return results;

    // Try alias search
    const aliasResult = findEntityByAlias(query);
    return aliasResult ? [aliasResult] : [];
  }

  getRecent(limit: number = 50): Entity[] {
    return getRecentEntities(limit);
  }

  // ============================================================================
  // Feedback / Corrections
  // ============================================================================

  applyCorrection(entityId: string, correction: { type?: EntityType; name?: string; mergeWithEntityId?: string }): void {
    if (correction.mergeWithEntityId) {
      this.mergeEntities(entityId, correction.mergeWithEntityId);
      return;
    }

    const updates: Partial<Pick<Entity, 'name' | 'confidence'>> & { metadata?: Record<string, unknown> } = {};
    if (correction.name) updates.name = correction.name;
    updates.confidence = 1.0; // Manual corrections are ground truth

    updateEntity(entityId, updates);

    // Invalidate cache
    this.entityCache.delete(this.normalizeKey(correction.name || ''));
    console.log('[semantic:entities] Applied correction to', entityId);
  }

  private mergeEntities(sourceId: string, targetId: string): void {
    try {
      const db = require('../../db/database').getDatabase();

      // Move all event links from source to target
      db.prepare('UPDATE event_entity_links SET entity_id = ? WHERE entity_id = ?')
        .run(targetId, sourceId);

      // Move aliases
      db.prepare('UPDATE OR IGNORE entity_aliases SET entity_id = ? WHERE entity_id = ?')
        .run(targetId, sourceId);

      // Move relationships
      db.prepare('UPDATE OR IGNORE entity_relationships SET source_entity_id = ? WHERE source_entity_id = ?')
        .run(targetId, sourceId);
      db.prepare('UPDATE OR IGNORE entity_relationships SET target_entity_id = ? WHERE target_entity_id = ?')
        .run(targetId, sourceId);

      // Delete the source entity
      db.prepare('DELETE FROM semantic_entities WHERE entity_id = ?').run(sourceId);

      // Clear cache for both
      this.entityCache.clear();
      this.aliasIndex.clear();

      console.log('[semantic:entities] Merged', sourceId, 'into', targetId);
    } catch (err) {
      console.error('[semantic:entities] Merge failed:', err);
    }
  }

  // ============================================================================
  // Memory Pressure
  // ============================================================================

  reduceMemory(): void {
    this.entityCache.evictToSize(250);
    console.log('[semantic:entities] Reduced cache to', this.entityCache.size, 'entries');
  }
}
