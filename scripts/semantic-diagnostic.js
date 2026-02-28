#!/usr/bin/env node
/**
 * SYNC Semantic Pipeline Diagnostic Script
 *
 * Reads the local SQLite database and produces a structured markdown report
 * assessing semantic pipeline quality across 7 diagnostic checks.
 *
 * Usage: node scripts/semantic-diagnostic.js
 * Output: SEMANTIC-DIAGNOSTIC-REPORT.md
 */

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DB_PATH = path.join(os.homedir(), 'Library/Application Support/sync-desktop/sync-desktop.db');
const REPORT_PATH = path.join(__dirname, '..', 'SEMANTIC-DIAGNOSTIC-REPORT.md');

// Helper: run a SQLite query and return parsed results
function query(sql) {
  try {
    // Collapse multi-line SQL to single line for sqlite3 CLI compatibility
    const singleLine = sql.replace(/\s+/g, ' ').trim();
    const result = execSync(
      `sqlite3 -json "${DB_PATH}" ${JSON.stringify(singleLine)}`,
      { encoding: 'utf8', timeout: 10000 }
    );
    return JSON.parse(result.trim() || '[]');
  } catch (e) {
    return [];
  }
}

// Helper: run a query that returns a single scalar value
function scalar(sql) {
  const rows = query(sql);
  if (rows.length === 0) return null;
  const firstKey = Object.keys(rows[0])[0];
  return rows[0][firstKey];
}

// ==========================================================================
// Diagnostic Checks
// ==========================================================================

function checkEntityResolution() {
  const metrics = [];
  const totalEntities = scalar('SELECT COUNT(*) as c FROM semantic_entities') || 0;
  metrics.push({
    metric: 'Total entities',
    value: String(totalEntities),
    status: totalEntities > 0 ? 'PASS' : 'FAIL',
  });

  if (totalEntities === 0) {
    return { name: 'Entity Resolution Quality', metrics, overallStatus: 'SKIP' };
  }

  const typeDist = query('SELECT type, COUNT(*) as cnt FROM semantic_entities GROUP BY type');
  const typeCount = typeDist.length;
  metrics.push({
    metric: 'Entity type distribution',
    value: typeDist.map(r => `${r.type}(${r.cnt})`).join(', '),
    status: typeCount >= 2 ? 'PASS' : 'WARN',
  });

  const aliasCount = scalar('SELECT COUNT(*) as c FROM entity_aliases') || 0;
  const avgAliases = totalEntities > 0 ? (aliasCount / totalEntities).toFixed(2) : '0';
  metrics.push({
    metric: 'Aliases per entity (avg)',
    value: avgAliases,
    status: parseFloat(avgAliases) > 0.1 ? 'PASS' : 'WARN',
  });

  const duplicates = query(
    "SELECT name, COUNT(*) as cnt FROM semantic_entities GROUP BY name HAVING COUNT(*) > 1"
  );
  metrics.push({
    metric: 'Duplicate name check',
    value: duplicates.length > 0 ? `${duplicates.length} duplicates` : 'None',
    status: duplicates.length === 0 ? 'PASS' : 'WARN',
  });

  const relCount = scalar('SELECT COUNT(*) as c FROM entity_relationships') || 0;
  metrics.push({
    metric: 'Relationship count',
    value: String(relCount),
    status: relCount > 0 ? 'PASS' : 'WARN',
  });

  const avgConf = scalar('SELECT AVG(confidence) as c FROM semantic_entities');
  metrics.push({
    metric: 'Avg confidence',
    value: avgConf != null ? parseFloat(avgConf).toFixed(3) : 'N/A',
    status: avgConf != null && parseFloat(avgConf) >= 0.4 ? 'PASS' : 'WARN',
  });

  return { name: 'Entity Resolution Quality', metrics };
}

function checkThreadCoherence() {
  const metrics = [];
  const totalThreads = scalar('SELECT COUNT(*) as c FROM semantic_threads') || 0;
  metrics.push({
    metric: 'Total threads',
    value: String(totalThreads),
    status: totalThreads > 0 ? 'PASS' : 'FAIL',
  });

  if (totalThreads === 0) {
    return { name: 'Thread Coherence', metrics, overallStatus: 'SKIP' };
  }

  const activeThreads = scalar("SELECT COUNT(*) as c FROM semantic_threads WHERE status = 'active'") || 0;
  metrics.push({
    metric: 'Active threads',
    value: String(activeThreads),
    status: activeThreads > 0 ? 'PASS' : 'WARN',
  });

  const avgEvents = scalar('SELECT AVG(event_count) as c FROM semantic_threads');
  metrics.push({
    metric: 'Avg events per thread',
    value: avgEvents != null ? parseFloat(avgEvents).toFixed(1) : '0',
    status: avgEvents != null && parseFloat(avgEvents) >= 2 ? 'PASS' : 'WARN',
  });

  const withEntities = scalar(
    "SELECT COUNT(*) as c FROM semantic_threads WHERE primary_entities != '[]' AND primary_entities IS NOT NULL AND primary_entities != ''"
  ) || 0;
  const entityPct = totalThreads > 0 ? ((withEntities / totalThreads) * 100).toFixed(1) : '0';
  metrics.push({
    metric: 'Threads with entities',
    value: `${withEntities}/${totalThreads} (${entityPct}%)`,
    status: parseFloat(entityPct) > 50 ? 'PASS' : 'WARN',
  });

  const avgDuration = scalar(
    'SELECT AVG(last_activity_at - started_at) / 60000.0 as c FROM semantic_threads WHERE last_activity_at > started_at'
  );
  metrics.push({
    metric: 'Avg thread duration (min)',
    value: avgDuration != null ? parseFloat(avgDuration).toFixed(1) : '0',
    status: avgDuration != null && parseFloat(avgDuration) > 5 ? 'PASS' : 'WARN',
  });

  const orphans = scalar('SELECT COUNT(*) as c FROM semantic_threads WHERE event_count = 0') || 0;
  metrics.push({
    metric: 'Orphan threads (0 events)',
    value: String(orphans),
    status: orphans === 0 ? 'PASS' : 'WARN',
  });

  return { name: 'Thread Coherence', metrics };
}

function checkActivityClassification() {
  const metrics = [];
  const total = scalar('SELECT COUNT(*) as c FROM semantic_activities') || 0;
  metrics.push({
    metric: 'Total activities',
    value: String(total),
    status: total > 0 ? 'PASS' : 'FAIL',
  });

  if (total === 0) {
    return { name: 'Activity Classification', metrics, overallStatus: 'SKIP' };
  }

  const avgConf = scalar('SELECT AVG(confidence) as c FROM semantic_activities');
  metrics.push({
    metric: 'Avg confidence',
    value: avgConf != null ? parseFloat(avgConf).toFixed(3) : 'N/A',
    status: avgConf != null && parseFloat(avgConf) >= 0.5 ? 'PASS' : 'WARN',
  });

  const lowConf = scalar('SELECT COUNT(*) as c FROM semantic_activities WHERE confidence < 0.3') || 0;
  const lowPct = total > 0 ? ((lowConf / total) * 100).toFixed(1) : '0';
  metrics.push({
    metric: 'Low confidence (< 0.3)',
    value: `${lowConf} (${lowPct}%)`,
    status: parseFloat(lowPct) < 20 ? 'PASS' : 'WARN',
  });

  const methods = query(
    'SELECT classification_method, COUNT(*) as cnt FROM semantic_activities GROUP BY classification_method'
  );
  metrics.push({
    metric: 'Classification methods',
    value: methods.map(r => `${r.classification_method}(${r.cnt})`).join(', '),
    status: methods.length >= 1 ? 'PASS' : 'FAIL',
  });

  const typeCount = scalar('SELECT COUNT(DISTINCT activity_type) as c FROM semantic_activities') || 0;
  metrics.push({
    metric: 'Activity type coverage',
    value: `${typeCount}/6 types`,
    status: typeCount >= 3 ? 'PASS' : 'WARN',
  });

  const withDuration = scalar('SELECT COUNT(*) as c FROM semantic_activities WHERE duration_ms > 0') || 0;
  const durPct = total > 0 ? ((withDuration / total) * 100).toFixed(1) : '0';
  metrics.push({
    metric: 'Activities with duration',
    value: `${withDuration} (${durPct}%)`,
    status: parseFloat(durPct) > 50 ? 'PASS' : 'WARN',
  });

  return { name: 'Activity Classification', metrics };
}

function checkIntentAccuracy() {
  const metrics = [];
  const total = scalar('SELECT COUNT(*) as c FROM semantic_intents') || 0;
  metrics.push({
    metric: 'Total intents',
    value: String(total),
    status: total > 0 ? 'PASS' : 'FAIL',
  });

  if (total === 0) {
    return { name: 'Intent Accuracy', metrics, overallStatus: 'SKIP' };
  }

  const typeCount = scalar('SELECT COUNT(DISTINCT intent_type) as c FROM semantic_intents') || 0;
  metrics.push({
    metric: 'Intent type coverage',
    value: `${typeCount}/5 types`,
    status: typeCount >= 2 ? 'PASS' : 'WARN',
  });

  const avgConf = scalar('SELECT AVG(confidence) as c FROM semantic_intents');
  metrics.push({
    metric: 'Avg confidence',
    value: avgConf != null ? parseFloat(avgConf).toFixed(3) : 'N/A',
    status: avgConf != null && parseFloat(avgConf) >= 0.4 ? 'PASS' : 'WARN',
  });

  const linkedThreads = scalar('SELECT COUNT(*) as c FROM semantic_intents WHERE thread_id IS NOT NULL') || 0;
  const linkedPct = total > 0 ? ((linkedThreads / total) * 100).toFixed(1) : '0';
  metrics.push({
    metric: 'Intents linked to threads',
    value: `${linkedThreads}/${total} (${linkedPct}%)`,
    status: parseFloat(linkedPct) > 80 ? 'PASS' : 'WARN',
  });

  const resolved = scalar('SELECT COUNT(*) as c FROM semantic_intents WHERE resolved_at IS NOT NULL') || 0;
  const resolvedPct = total > 0 ? ((resolved / total) * 100).toFixed(1) : '0';
  metrics.push({
    metric: 'Resolved intents',
    value: `${resolved} (${resolvedPct}%)`,
    status: 'PASS', // Report only
  });

  const recent = query(
    `SELECT i.intent_type, i.confidence, t.title
     FROM semantic_intents i
     LEFT JOIN semantic_threads t ON i.thread_id = t.thread_id
     ORDER BY i.created_at DESC LIMIT 5`
  );
  if (recent.length > 0) {
    metrics.push({
      metric: 'Recent intents (sample)',
      value: recent.map(r => `${r.intent_type}(${parseFloat(r.confidence).toFixed(2)}) → ${r.title || 'no thread'}`).join('; '),
      status: 'PASS',
    });
  }

  return { name: 'Intent Accuracy', metrics };
}

function checkSignatureStability() {
  const metrics = [];
  const total = scalar('SELECT COUNT(*) as c FROM behavioral_signatures') || 0;
  metrics.push({
    metric: 'Total signatures',
    value: String(total),
    status: total > 0 ? 'PASS' : 'SKIP',
  });

  if (total === 0) {
    return { name: 'Signature Stability', metrics, overallStatus: 'SKIP' };
  }

  const catCount = scalar('SELECT COUNT(DISTINCT category) as c FROM behavioral_signatures') || 0;
  metrics.push({
    metric: 'Categories present',
    value: `${catCount}/6`,
    status: catCount >= 3 ? 'PASS' : 'WARN',
  });

  const avgConf = scalar('SELECT AVG(confidence) as c FROM behavioral_signatures');
  metrics.push({
    metric: 'Avg confidence',
    value: avgConf != null ? parseFloat(avgConf).toFixed(3) : 'N/A',
    status: avgConf != null && parseFloat(avgConf) >= 0.5 ? 'PASS' : 'WARN',
  });

  const trends = query('SELECT trend, COUNT(*) as cnt FROM behavioral_signatures GROUP BY trend');
  metrics.push({
    metric: 'Trend distribution',
    value: trends.map(r => `${r.trend}(${r.cnt})`).join(', '),
    status: 'PASS', // Report only
  });

  const keyMetrics = query(
    "SELECT metric_name FROM behavioral_signatures WHERE metric_name IN ('deep_work_ratio', 'peak_hours', 'context_switch_rate', 'meeting_load')"
  );
  metrics.push({
    metric: 'Key metrics present',
    value: keyMetrics.length > 0 ? keyMetrics.map(r => r.metric_name).join(', ') : 'None',
    status: keyMetrics.length >= 2 ? 'PASS' : 'WARN',
  });

  const lastComputed = scalar('SELECT MAX(computed_at) as c FROM behavioral_signatures');
  if (lastComputed) {
    const hoursAgo = ((Date.now() - parseInt(lastComputed)) / 3600000).toFixed(1);
    metrics.push({
      metric: 'Last computed',
      value: `${hoursAgo}h ago`,
      status: parseFloat(hoursAgo) <= 12 ? 'PASS' : 'WARN',
    });
  } else {
    metrics.push({ metric: 'Last computed', value: 'Never', status: 'SKIP' });
  }

  return { name: 'Signature Stability', metrics };
}

function checkPipelineHealth() {
  const metrics = [];

  const enabled = scalar("SELECT value FROM sync_metadata WHERE key = 'semantic_foundation_enabled'");
  metrics.push({
    metric: 'Semantic cycle enabled',
    value: enabled || 'NOT SET',
    status: enabled === 'true' ? 'PASS' : 'FAIL',
  });

  const lastCycle = scalar("SELECT value FROM sync_metadata WHERE key = 'last_semantic_cycle'");
  if (lastCycle) {
    const minsAgo = ((Date.now() - parseInt(lastCycle)) / 60000).toFixed(1);
    metrics.push({
      metric: 'Last semantic cycle',
      value: `${minsAgo} min ago`,
      status: parseFloat(minsAgo) <= 5 ? 'PASS' : 'WARN',
    });
  } else {
    metrics.push({ metric: 'Last semantic cycle', value: 'Never', status: 'FAIL' });
  }

  const lastSig = scalar("SELECT value FROM sync_metadata WHERE key = 'last_signature_computation'");
  if (lastSig) {
    const hrsAgo = ((Date.now() - parseInt(lastSig)) / 3600000).toFixed(1);
    metrics.push({
      metric: 'Last signature computation',
      value: `${hrsAgo}h ago`,
      status: parseFloat(hrsAgo) <= 12 ? 'PASS' : 'WARN',
    });
  } else {
    metrics.push({ metric: 'Last signature computation', value: 'Never (expected on first run)', status: 'SKIP' });
  }

  const now = Date.now();
  const oneDayAgo = now - 86400000;
  const events24h = scalar(`SELECT COUNT(*) as c FROM context_events WHERE timestamp > ${oneDayAgo}`) || 0;
  metrics.push({
    metric: 'Source events (24h)',
    value: String(events24h),
    status: events24h > 0 ? 'PASS' : 'FAIL',
  });

  const oneHourAgo = now - 3600000;
  const activitiesLastHour = scalar(`SELECT COUNT(*) as c FROM semantic_activities WHERE created_at > ${oneHourAgo}`) || 0;
  const eventsLastHour = scalar(`SELECT COUNT(*) as c FROM context_events WHERE timestamp > ${oneHourAgo}`) || 0;
  const rate = eventsLastHour > 0 ? (activitiesLastHour / eventsLastHour).toFixed(2) : '0';
  metrics.push({
    metric: 'Processing rate (1h)',
    value: `${activitiesLastHour} activities / ${eventsLastHour} events = ${rate}`,
    status: parseFloat(rate) > 0 ? 'PASS' : (eventsLastHour === 0 ? 'SKIP' : 'FAIL'),
  });

  // Sync backlog across all semantic tables
  const tables = ['semantic_entities', 'semantic_activities', 'semantic_threads', 'semantic_intents', 'behavioral_signatures'];
  let totalUnsynced = 0;
  for (const t of tables) {
    const cnt = scalar(`SELECT COUNT(*) as c FROM ${t} WHERE synced = 0`);
    totalUnsynced += (cnt || 0);
  }
  metrics.push({
    metric: 'Sync backlog (unsynced rows)',
    value: String(totalUnsynced),
    status: 'PASS', // Report only
  });

  return { name: 'Pipeline Health', metrics };
}

function checkBeforeAfter() {
  const metrics = [];
  const now = Date.now();
  const oneDayAgo = now - 86400000;

  const rawEvents = scalar(`SELECT COUNT(*) as c FROM context_events WHERE timestamp > ${oneDayAgo}`) || 0;
  metrics.push({
    metric: 'Raw events (24h)',
    value: String(rawEvents),
    status: rawEvents > 0 ? 'PASS' : 'FAIL',
  });

  const semActivities = scalar(`SELECT COUNT(*) as c FROM semantic_activities WHERE created_at > ${oneDayAgo}`) || 0;
  metrics.push({
    metric: 'Semantic activities (24h)',
    value: String(semActivities),
    status: semActivities > 0 ? 'PASS' : (rawEvents === 0 ? 'SKIP' : 'FAIL'),
  });

  const convRate = rawEvents > 0 ? (semActivities / rawEvents).toFixed(3) : '0';
  metrics.push({
    metric: 'Conversion rate (activities/events)',
    value: convRate,
    status: parseFloat(convRate) > 0.5 ? 'PASS' : (rawEvents === 0 ? 'SKIP' : 'FAIL'),
  });

  const distinctEntities = scalar(
    `SELECT COUNT(DISTINCT eel.entity_id) as c FROM event_entity_links eel
     JOIN context_events ce ON eel.event_id = ce.id
     WHERE ce.timestamp > ${oneDayAgo}`
  ) || 0;
  const entityRate = rawEvents > 0 ? (distinctEntities / rawEvents).toFixed(3) : '0';
  metrics.push({
    metric: 'Entity extraction rate',
    value: `${distinctEntities} entities / ${rawEvents} events = ${entityRate}`,
    status: parseFloat(entityRate) > 0.1 ? 'PASS' : (rawEvents === 0 ? 'SKIP' : 'FAIL'),
  });

  const threadedEvents = scalar(
    `SELECT COUNT(DISTINCT te.event_id) as c FROM thread_events te
     JOIN context_events ce ON te.event_id = ce.id
     WHERE ce.timestamp > ${oneDayAgo}`
  ) || 0;
  const threadRate = rawEvents > 0 ? (threadedEvents / rawEvents).toFixed(3) : '0';
  metrics.push({
    metric: 'Thread assignment rate',
    value: `${threadedEvents} / ${rawEvents} = ${threadRate}`,
    status: parseFloat(threadRate) > 0.3 ? 'PASS' : (rawEvents === 0 ? 'SKIP' : 'FAIL'),
  });

  const totalLinks = scalar(
    `SELECT COUNT(*) as c FROM event_entity_links eel
     JOIN context_events ce ON eel.event_id = ce.id
     WHERE ce.timestamp > ${oneDayAgo}`
  ) || 0;
  const enrichDepth = rawEvents > 0 ? (totalLinks / rawEvents).toFixed(3) : '0';
  metrics.push({
    metric: 'Enrichment depth (entities/event)',
    value: enrichDepth,
    status: parseFloat(enrichDepth) > 0.5 ? 'PASS' : (rawEvents === 0 ? 'SKIP' : 'FAIL'),
  });

  return { name: 'Before/After Comparison', metrics };
}

// ==========================================================================
// Report Generation
// ==========================================================================

function computeCheckSummary(check) {
  const { metrics, overallStatus } = check;
  if (overallStatus === 'SKIP') {
    return { status: 'SKIP', score: '-' };
  }
  const total = metrics.length;
  const passing = metrics.filter(m => m.status === 'PASS').length;
  const failing = metrics.filter(m => m.status === 'FAIL').length;

  let status = 'PASS';
  if (failing > 0) status = 'FAIL';
  else if (passing < total) status = 'WARN';

  return { status, score: `${passing}/${total}` };
}

function formatReport(results) {
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];
  let md = `# SYNC Semantic Pipeline Diagnostic Report\nGenerated: ${now}\n\n`;

  // Summary table
  md += '## Summary\n';
  md += '| Check | Status | Score |\n';
  md += '|-------|--------|-------|\n';

  let totalPass = 0;
  let totalMetrics = 0;

  for (const check of results) {
    const summary = computeCheckSummary(check);
    md += `| ${check.name} | ${summary.status} | ${summary.score} |\n`;
    if (summary.score !== '-') {
      const [p, t] = summary.score.split('/').map(Number);
      totalPass += p;
      totalMetrics += t;
    }
  }

  const overallPct = totalMetrics > 0 ? ((totalPass / totalMetrics) * 100).toFixed(0) : '0';
  md += `\nOverall: ${totalPass}/${totalMetrics} metrics passing (${overallPct}%)\n\n`;

  // Detailed checks
  for (let i = 0; i < results.length; i++) {
    const check = results[i];
    md += `## Check ${i + 1}: ${check.name}\n`;
    md += '| Metric | Value | Status |\n';
    md += '|--------|-------|--------|\n';
    for (const m of check.metrics) {
      md += `| ${m.metric} | ${m.value} | ${m.status} |\n`;
    }
    md += '\n';
  }

  return md;
}

// ==========================================================================
// Main
// ==========================================================================

function main() {
  console.log('Running SYNC Semantic Pipeline Diagnostic...\n');

  // Check DB exists
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at: ${DB_PATH}`);
    process.exit(1);
  }

  const results = [];

  const checks = [
    { fn: checkEntityResolution, label: 'Entity Resolution' },
    { fn: checkThreadCoherence, label: 'Thread Coherence' },
    { fn: checkActivityClassification, label: 'Activity Classification' },
    { fn: checkIntentAccuracy, label: 'Intent Accuracy' },
    { fn: checkSignatureStability, label: 'Signature Stability' },
    { fn: checkPipelineHealth, label: 'Pipeline Health' },
    { fn: checkBeforeAfter, label: 'Before/After Comparison' },
  ];

  for (const { fn, label } of checks) {
    process.stdout.write(`  Checking ${label}...`);
    const result = fn();
    results.push(result);
    const summary = computeCheckSummary(result);
    console.log(` ${summary.status} (${summary.score})`);
  }

  const report = formatReport(results);
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\nReport written to SEMANTIC-DIAGNOSTIC-REPORT.md`);

  // Print summary
  const totalPass = results.reduce((sum, r) => {
    const s = computeCheckSummary(r);
    return sum + (s.score !== '-' ? parseInt(s.score.split('/')[0]) : 0);
  }, 0);
  const totalMetrics = results.reduce((sum, r) => {
    const s = computeCheckSummary(r);
    return sum + (s.score !== '-' ? parseInt(s.score.split('/')[1]) : 0);
  }, 0);
  console.log(`Overall: ${totalPass}/${totalMetrics} metrics passing (${totalMetrics > 0 ? ((totalPass / totalMetrics) * 100).toFixed(0) : 0}%)`);
}

main();
