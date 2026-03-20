const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber, PageBreak
} = require("docx");

// Colors
const CYAN = "00CCBB";
const DARK = "0D0D0D";
const GOLD = "FABB00";
const GRAY = "666666";
const LIGHT_GRAY = "F5F5F5";
const WHITE = "FFFFFF";
const ACCENT_BG = "E8F8F5";
const BORDER_COLOR = "DDDDDD";
const WARM_BG = "FFF8E1";
const AMBER = "B8860B";

const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR };
const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
};

function spacer(pts = 100) {
  return new Paragraph({ spacing: { before: pts, after: pts }, children: [] });
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ heading: level, children: [new TextRun(text)] });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({ text, size: 22, font: "Arial", color: opts.color || "333333", ...opts })]
  });
}

function bodyRuns(runs, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after || 120 },
    alignment: opts.align || AlignmentType.LEFT,
    children: runs
  });
}

function bullet(text, ref = "bullet-list") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22, font: "Arial", color: "333333" })]
  });
}

function bulletBold(boldPart, rest, ref = "bullet-list") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: boldPart, bold: true, size: 22, font: "Arial", color: "222222" }),
      new TextRun({ text: rest, size: 22, font: "Arial", color: "333333" })
    ]
  });
}

function makeCell(content, opts = {}) {
  const children = typeof content === "string"
    ? [new Paragraph({ alignment: opts.align || AlignmentType.LEFT, children: [new TextRun({ text: content, size: opts.size || 20, font: "Arial", color: opts.color || "333333", bold: opts.bold || false })] })]
    : content;
  return new TableCell({
    borders: opts.noBorder ? noBorders : cellBorders,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children
  });
}

function sectionDivider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    borders: { bottom: { style: BorderStyle.SINGLE, size: 1, color: CYAN, space: 8 } },
    children: []
  });
}

// Callout box helper
function calloutBox(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    indent: { left: 720, right: 720 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: opts.borderColor || CYAN, space: 8 },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: opts.borderColor || CYAN, space: 8 },
    },
    children: [new TextRun({ text, size: opts.size || 24, italics: opts.italics !== false, color: opts.color || "1A1A1A", font: "Arial", bold: opts.bold || false })]
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: "333333" } } },
    paragraphStyles: [
      {
        id: "Title", name: "Title", basedOn: "Normal",
        run: { size: 56, bold: true, color: DARK, font: "Arial" },
        paragraph: { spacing: { before: 0, after: 60 }, alignment: AlignmentType.CENTER }
      },
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, color: DARK, font: "Arial" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, color: "1A1A1A", font: "Arial" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 }
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 23, bold: true, color: "2A2A2A", font: "Arial" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 }
      },
    ]
  },
  numbering: {
    config: [
      {
        reference: "bullet-list",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      },
      {
        reference: "bullet-list-2",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      },
      {
        reference: "num-list-1",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      },
      {
        reference: "num-list-2",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      },
    ]
  },
  sections: [
    // ===================== COVER PAGE =====================
    {
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      children: [
        spacer(2000),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "iSyncSO", size: 72, bold: true, color: DARK, font: "Arial" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "Inspired by Nature. Built for Business.", size: 28, color: CYAN, font: "Arial", italics: true })]
        }),
        spacer(400),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: "COMPANY PROFILE", size: 40, bold: true, color: DARK, font: "Arial", characterSpacing: 200 })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: "2026", size: 32, color: GRAY, font: "Arial" })]
        }),
        spacer(2000),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          borders: { top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR, space: 12 } },
          spacing: { before: 200 },
          children: [new TextRun({ text: "Confidential", size: 18, color: GRAY, font: "Arial", italics: true })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          children: [new TextRun({ text: "isyncso.com  |  app.isyncso.com", size: 18, color: GRAY, font: "Arial" })]
        }),
      ]
    },

    // ===================== MAIN CONTENT =====================
    {
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "iSyncSO  |  Company Profile 2026", size: 16, color: GRAY, font: "Arial", italics: true })]
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Page ", size: 16, color: GRAY, font: "Arial" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRAY, font: "Arial" }),
              new TextRun({ text: "  |  Confidential  |  \u00A9 2026 Isyncso Limited", size: 16, color: GRAY, font: "Arial" }),
            ]
          })]
        })
      },
      children: [

        // === EXECUTIVE SUMMARY ===
        heading("Executive Summary"),
        sectionDivider(),

        body("iSyncSO is an AI-native business operating system whose architecture is modeled not after human cognition, but after the honeybee brain. While every other AI tool was designed to think like a person, iSyncSO looked at how Apis mellifera \u2014 the Western honeybee \u2014 solves complex problems with a brain containing fewer than one million neurons."),
        spacer(60),
        body("The result is a platform that consolidates the fragmented toolkit of modern businesses into a single intelligent workspace. At its center sits SYNC \u2014 a context-aware AI agent that doesn't just respond to commands but actively understands what you're working on, who you're talking to, what you've committed to, and what needs your attention next. SYNC is not a chatbot. It is an orchestrator that executes actions across every domain of your business through natural language."),
        spacer(60),
        body("The platform spans two complementary products:"),
        bulletBold("app.isyncso.com", " \u2014 A comprehensive web platform with 8 purpose-built business modules, 180+ edge functions, and 30+ third-party integrations."),
        bulletBold("SYNC Desktop", " \u2014 A native desktop companion that silently observes your workflow and feeds real-time context to the AI \u2014 all processed locally on-device for privacy."),
        spacer(60),
        body("Together, they form an operating system where data flows naturally, context is preserved across every interaction, and the AI agent acts on your behalf before you even ask."),

        // === THE APIAN ARCHITECTURE ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("The Apian Architecture"),
        sectionDivider(),

        calloutBox("\"The bee doesn\u2019t have a bigger brain. She has a better one. The same principle applies to software.\"", { size: 24, bold: true }),

        spacer(60),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("The Origin")] }),
        spacer(40),
        body("iSyncSO was co-founded by Gody Duinsbergen and David. The philosophical foundation of the company traces back to Gody's grandfather \u2014 a beekeeper whose lifelong observation of honeybee colonies planted a seed that would eventually reshape how the founders thought about artificial intelligence."),
        spacer(60),
        body("While the entire AI industry raced toward bigger models, more parameters, and human-like reasoning, iSyncSO asked a different question: what if the most efficient intelligence architecture isn't human at all? What if a brain with fewer than one million neurons \u2014 the brain of Apis mellifera \u2014 offers a better blueprint for proactive business software than the hundred-billion-parameter models everyone else is building?"),
        spacer(60),
        body("This insight became The Apian Architecture: a systematic mapping of honeybee cognitive strategies onto software design. Not a metaphor. Not branding. A formal set of eight architectural correspondences, backed by peer-reviewed neuroscience, that explain why iSyncSO works the way it does."),

        spacer(100),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Eight Architectural Parallels")] }),
        spacer(40),
        body("Every major subsystem in iSyncSO maps to a specific cognitive mechanism in the honeybee brain:"),
        spacer(40),

        // Parallel table
        new Table({
          columnWidths: [2800, 2800, 3760],
          rows: [
            new TableRow({ tableHeader: true, children: [
              makeCell("Bee Cognition", { fill: DARK, color: WHITE, bold: true, width: 2800 }),
              makeCell("iSyncSO System", { fill: DARK, color: WHITE, bold: true, width: 2800 }),
              makeCell("What It Does", { fill: DARK, color: WHITE, bold: true, width: 3760 }),
            ]}),
            new TableRow({ children: [
              makeCell("Active Vision", { fill: ACCENT_BG, bold: true, width: 2800 }),
              makeCell("Desktop Sensor Pipeline", { fill: ACCENT_BG, width: 2800 }),
              makeCell("Reads structured accessibility API data, not raw screenshots \u2014 mirrors how bees use active gaze, not passive retina", { fill: ACCENT_BG, width: 3760 }),
            ]}),
            new TableRow({ children: [
              makeCell("One-Trial Learning", { bold: true, width: 2800 }),
              makeCell("EMA User Profiles", { width: 2800 }),
              makeCell("Learns from 1-3 examples with \u03B1=0.30 decay, not hundreds \u2014 mirrors a bee's single-flower-visit memory", { width: 3760 }),
            ]}),
            new TableRow({ children: [
              makeCell("Mushroom Bodies", { fill: ACCENT_BG, bold: true, width: 2800 }),
              makeCell("Two-Pass Intelligence", { fill: ACCENT_BG, width: 2800 }),
              makeCell("Divergent analysis (temp 0.5) then convergent suggestion (temp 0.3) \u2014 mirrors Kenyon cell \u2192 MBON architecture", { fill: ACCENT_BG, width: 3760 }),
            ]}),
            new TableRow({ children: [
              makeCell("Central Complex", { bold: true, width: 2800 }),
              makeCell("8-Gate Metacognitive Stack", { width: 2800 }),
              makeCell("System knows when NOT to talk \u2014 mirrors bee opt-out behavior (silence is an option)", { width: 3760 }),
            ]}),
            new TableRow({ children: [
              makeCell("Personality Variation", { fill: ACCENT_BG, bold: true, width: 2800 }),
              makeCell("5-Dimension User Profiles", { fill: ACCENT_BG, width: 2800 }),
              makeCell("WorkStyle, BusinessRole, SuggestionReceptivity, SkillGrowth, CharacterTraits", { fill: ACCENT_BG, width: 3760 }),
            ]}),
            new TableRow({ children: [
              makeCell("Three-Tier Neural Hierarchy", { bold: true, width: 2800 }),
              makeCell("Rule/MLX/Cloud Pipeline", { width: 2800 }),
              makeCell("Rule engine <1ms (70%), local MLX ~300ms (20%), cloud LLM ~2-5s (10%) \u2014 mirrors insect reflexes \u2192 learned \u2192 deliberative", { width: 3760 }),
            ]}),
            new TableRow({ children: [
              makeCell("Waggle Dance", { fill: ACCENT_BG, bold: true, width: 2800 }),
              makeCell("Proactive Suggestions", { fill: ACCENT_BG, width: 2800 }),
              makeCell("System surfaces insights without being asked \u2014 mirrors how scout bees communicate opportunities to the colony", { fill: ACCENT_BG, width: 3760 }),
            ]}),
            new TableRow({ children: [
              makeCell("Temporal Learning", { bold: true, width: 2800 }),
              makeCell("Pattern Detection Engine", { width: 2800 }),
              makeCell("4 algorithms detect recurring cycles, seasonal trends, and behavioral signatures \u2014 mirrors bee time-linked memory", { width: 3760 }),
            ]}),
          ]
        }),

        spacer(100),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Three Design Principles")] }),
        spacer(40),

        bodyRuns([
          new TextRun({ text: "1. Better Sensor, Not Bigger Brain", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
        ]),
        body("A bee doesn't process raw visual data through a massive neural network. She uses active vision \u2014 targeted, structured sensing. iSyncSO's Desktop sensor reads accessibility APIs and structured window data, not raw screenshots. The result: 12x cheaper compute than competitors who stream raw screen pixels to cloud GPUs."),
        spacer(60),

        bodyRuns([
          new TextRun({ text: "2. One-Trial Learning", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
        ]),
        body("A bee remembers a rewarding flower after a single visit. iSyncSO builds meaningful user profiles from day one \u2014 not after months of training data. Exponential moving averages with \u03B1=0.30 mean the system adapts in 1-3 interactions, not hundreds."),
        spacer(60),

        bodyRuns([
          new TextRun({ text: "3. Three-Speed Engine", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
        ]),
        body("A bee's nervous system has reflexes (instant), learned patterns (fast), and deliberative cognition (slow). iSyncSO mirrors this: rule-based processing handles 70% of decisions in under 1ms; local MLX handles 20% in ~300ms; cloud LLMs handle the remaining 10% in 2-5 seconds. Most AI tools send everything to the cloud. iSyncSO only escalates what actually requires deep reasoning."),

        // === VISION & MISSION ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("Vision & Mission"),
        sectionDivider(),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Vision")] }),
        spacer(40),
        calloutBox("\"A world where running a business feels like having a brilliant co-founder who never sleeps \u2014 one that thinks not like a human, but like a bee: efficient, proactive, and always aware.\""),
        spacer(40),
        body("iSyncSO envisions a future where entrepreneurs, operators, and teams don't spend 60% of their time on administrative overhead. Instead, an intelligent system \u2014 inspired by the most efficient cognitive architecture in nature \u2014 handles the operational weight so humans can focus on strategy, relationships, and creative work."),

        spacer(100),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Mission")] }),
        spacer(40),
        calloutBox("\"To build the AI-powered operating system that synchronizes every dimension of business operations \u2014 from first customer contact to final invoice \u2014 into one coherent, intelligent experience.\""),
        spacer(40),
        body("iSyncSO exists to eliminate the \"tool tax\" \u2014 the hidden cost of running a business across 8-12 disconnected SaaS products. Every hour spent switching between CRM, invoicing, inventory, recruiting, and compliance tools is an hour not spent building the business. iSyncSO replaces that fragmentation with a unified system where intelligence compounds across every domain."),

        spacer(100),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Origin Story")] }),
        spacer(40),
        body("The company began at the intersection of two worlds: Gody Duinsbergen's grandfather was a beekeeper who spent decades observing how colonies of simple creatures solved problems that seemed impossibly complex. That observation planted a question that lingered for years: why does nature solve coordination problems so efficiently while our software tools make everything harder?"),
        spacer(60),
        body("The first answer came in the learning space. iSyncSO started with the observation that $340 billion is spent on training annually, yet only 8% of organizations actually know what skills their workforce has. The original platform \u2014 branded under the tagline \"Making the invisible visible\" \u2014 built Hyve, an AI learning engine that semantically monitored actual work to deliver personalized micro-learning, achieving a 68% engagement rate where the industry average is 15%."),
        spacer(60),
        body("This foundational insight \u2014 that AI should observe your real work to help you grow \u2014 expanded far beyond learning. The same technology that watched work patterns for skill development could watch for missed follow-ups, forgotten CRM updates, untracked invoices, and emerging business opportunities. iSyncSO evolved from an AI learning platform into a full AI business operating system, carrying the same philosophy from the hive: watch, understand, act."),

        // === THE PROBLEM ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("The Problem We Solve"),
        sectionDivider(),

        body("Modern businesses are drowning in tools. The average SMB uses 8-12 SaaS subscriptions to manage their operations: one for CRM, another for invoicing, another for inventory, another for recruiting, another for learning, and another for compliance. Each tool operates in isolation. Data doesn't flow. Context is lost between every tab switch."),
        spacer(60),
        body("The consequences are real:"),
        bullet("Hours wasted daily on administrative overhead \u2014 copying data between systems, chasing follow-ups manually, updating multiple tools for a single event"),
        bullet("Missed opportunities \u2014 a sales signal in your CRM doesn't connect to the overdue invoice in your accounting tool or the recruitment need in your talent pipeline"),
        bullet("Zero proactive intelligence \u2014 your tools wait for commands instead of surfacing what matters"),
        bullet("Compliance risk \u2014 with EU AI Act penalties up to \u20AC35M or 7% of global turnover, companies need continuous proof, not reactive panic"),
        bullet("Training waste \u2014 $340B spent annually on training, yet most of it is generic courses that teach what people already know or will never apply"),
        spacer(60),
        body("iSyncSO doesn't add another tool to the stack. It replaces the stack."),

        // === PLATFORM OVERVIEW ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("Platform Overview"),
        sectionDivider(),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("The SYNC Agent \u2014 The AI Brain")] }),
        spacer(40),
        body("At the heart of everything is SYNC: a context-aware AI agent with 51+ executable actions across all business domains. SYNC understands natural language commands, maintains persistent memory of your business, and can be accessed via text chat or voice."),
        spacer(60),
        body("What makes SYNC different from other AI assistants is the Apian Architecture underneath. SYNC's two-pass reasoning engine \u2014 modeled after the mushroom bodies in the bee brain \u2014 first diverges to collect cross-domain data, then converges to produce actionable suggestions. Its 8-gate metacognitive stack means SYNC knows when NOT to speak, avoiding the noise that plagues other AI tools."),
        spacer(60),
        body("Example commands SYNC can execute:"),
        bullet("\"Create an invoice for Acme Corp for \u20AC5,000\""),
        bullet("\"Find me senior engineers in Berlin who are open to new opportunities\""),
        bullet("\"What's my cash flow looking like this month?\""),
        bullet("\"Schedule a follow-up with Maria for Thursday and send her the proposal deck\""),
        spacer(60),
        body("SYNC doesn't just chat. It acts. It creates invoices, sends outreach, updates CRM records, generates images, enrolls courses, and orchestrates complex multi-step workflows \u2014 all from a single conversation."),

        spacer(100),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Platform Modules")] }),
        spacer(40),

        new Table({
          columnWidths: [2200, 7160],
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                makeCell("Module", { fill: DARK, color: WHITE, bold: true, width: 2200, align: AlignmentType.CENTER }),
                makeCell("Capabilities", { fill: DARK, color: WHITE, bold: true, width: 7160 }),
              ]
            }),
            new TableRow({ children: [
              makeCell("GROWTH", { fill: ACCENT_BG, bold: true, width: 2200, color: "0A6E5C" }),
              makeCell("Full CRM with sales pipeline, multi-channel campaigns (email, SMS, LinkedIn), lead enrichment, predictive scoring, buyer intent detection, smart follow-up sequences, and sales signal monitoring.", { width: 7160 }),
            ]}),
            new TableRow({ children: [
              makeCell("FINANCE", { bold: true, width: 2200, color: "0A6E5C" }),
              makeCell("Invoicing, proposals, AI OCR receipt scanning, bank sync (Revolut/Plaid), double-entry ledger, P&L / balance sheet / cash flow reports, predictive cash forecasting, and Dutch BTW tax reporting.", { width: 7160 }),
            ]}),
            new TableRow({ children: [
              makeCell("PRODUCTS", { fill: ACCENT_BG, bold: true, width: 2200, color: "0A6E5C" }),
              makeCell("Product catalog with dynamic pricing (subscriptions, tiers, bundles), inventory management, warehouse tracking, bi-directional marketplace sync with bol.com and Shopify, B2B wholesale portal.", { width: 7160 }),
            ]}),
            new TableRow({ children: [
              makeCell("TALENT", { bold: true, width: 2200, color: "0A6E5C" }),
              makeCell("Recruitment intelligence: candidate database, AI matching engine with weighted scoring, multi-step outreach campaigns, SMS via Twilio, Nests marketplace for pre-built candidate pools.", { width: 7160 }),
            ]}),
            new TableRow({ children: [
              makeCell("LEARN", { fill: ACCENT_BG, bold: true, width: 2200, color: "0A6E5C" }),
              makeCell("Skills and certification platform with personalized course recommendations, XP/gamification, team learning dashboards, skill frameworks, and verifiable certificates. 68% engagement rate vs 15% industry average.", { width: 7160 }),
            ]}),
            new TableRow({ children: [
              makeCell("SENTINEL", { bold: true, width: 2200, color: "0A6E5C" }),
              makeCell("EU AI Act compliance engine: AI system registry, risk classification, automated Annex IV documentation, compliance roadmap tracking, vendor risk assessment. Covers GDPR, ISO 27001, HIPAA, SOC II.", { width: 7160 }),
            ]}),
            new TableRow({ children: [
              makeCell("RAISE", { fill: ACCENT_BG, bold: true, width: 2200, color: "0A6E5C" }),
              makeCell("Fundraising pipeline with investor Kanban, pitch deck builder, secure data room, and investor outreach campaigns.", { width: 7160 }),
            ]}),
            new TableRow({ children: [
              makeCell("HYVE HUB", { bold: true, width: 2200, color: "0A6E5C" }),
              makeCell("AI-generated personal work journal powered by desktop activity data. Daily narratives, focus patterns, productivity rhythms, behavioral insights, and autonomous task completion.", { width: 7160 }),
            ]}),
          ]
        }),

        // === SYNC DESKTOP ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("SYNC Desktop \u2014 The Silent Companion"),
        sectionDivider(),

        body("SYNC Desktop is a native application (macOS and Windows) that gives the AI agent eyes and ears on your actual work. It runs quietly in the menu bar, understands your workflow, and feeds real context to SYNC \u2014 so when you ask for help, the AI already knows what you're working on."),
        spacer(60),
        body("Crucially, SYNC Desktop embodies the Apian Architecture's first principle: better sensor, not bigger brain. Rather than streaming raw screenshots to a cloud GPU (like competitors), it reads structured accessibility API data from the operating system \u2014 the same approach a bee uses with active vision instead of a passive retina. This makes it 12x cheaper to operate while capturing richer, more meaningful context."),

        spacer(80),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Core Capabilities")] }),
        spacer(40),

        bodyRuns([
          new TextRun({ text: "Intelligent Activity Tracking", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
        ]),
        body("Knows which apps you use, how long you spend in each, and your focus patterns. Polls every 5 seconds, auto-categorizes work into Development, Communication, Meetings, Design, and more. Calculates focus scores based on context-switching frequency."),

        spacer(60),
        bodyRuns([
          new TextRun({ text: "Three-Tier Processing Pipeline", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
        ]),
        body("Mirrors the bee's neural hierarchy. Rule engine handles 70% of cases instantly (<1ms). Local MLX model on Apple Silicon refines 20% (~300ms). Only the remaining 10% escalates to the cloud (2-5 seconds). Most data never leaves your machine."),

        spacer(60),
        bodyRuns([
          new TextRun({ text: "Deep Context Engine", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
        ]),
        body("Captures and analyzes screen content locally using macOS Vision OCR. Detects commitments (\"I'll send you the proposal by Friday\"), action items, email contexts, and calendar events."),

        spacer(60),
        bodyRuns([
          new TextRun({ text: "Autonomous Assistance", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
        ]),
        body("Detects missed calendar entries, forgotten CRM updates, JIRA tickets, and more. Then executes them automatically or surfaces a proposal for one-click approval. Your CRM won't update itself \u2014 but SYNC does."),

        spacer(60),
        bodyRuns([
          new TextRun({ text: "Privacy-First Architecture", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
        ]),
        body("All screen capture and OCR happens entirely on-device. Sensitive apps (banking, passwords, healthcare, private browsing) are automatically excluded. Only aggregated, user-approved summaries sync to the cloud. GDPR-native, full user control."),

        // === INTELLIGENCE ENGINE ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("The Intelligence Engine"),
        sectionDivider(),

        body("What separates iSyncSO from traditional business tools is a continuously running intelligence layer \u2014 directly inspired by the mushroom bodies of the honeybee brain, where sparse Kenyon cells diverge to process multimodal input and then converge through mushroom body output neurons (MBONs) to produce decisions."),
        spacer(60),

        bulletBold("10-Domain Data Collection", " \u2014 Parallel collection across CRM, finance, inventory, recruiting, activity, and more (hourly during business hours, ~8K tokens per cycle). Like a scout bee surveying multiple nectar sources simultaneously."),
        bulletBold("Two-Pass LLM Reasoning", " \u2014 First pass diverges (temperature 0.5) to collect and structure cross-domain data. Second pass converges (temperature 0.3) to produce actionable suggestions. \"Your biggest client's payment is 15 days late AND they just had a leadership change \u2014 here's what that means.\""),
        bulletBold("Temporal Pattern Detection", " \u2014 Four algorithms identify recurring cycles, seasonal trends, action sequences, and behavioral signatures \u2014 mirroring the bee's time-linked circadian memory."),
        bulletBold("5-Dimension User Profiling", " \u2014 Adapts SYNC's behavior across WorkStyle, BusinessRole, SuggestionReceptivity, SkillGrowth, and CharacterTraits. Uses exponential moving averages (\u03B1=0.30) for one-trial learning \u2014 meaningful profiles from day one, not after months."),
        bulletBold("Proactive Suggestions with Silence Gating", " \u2014 SYNC surfaces insights before you ask, but its 8-gate metacognitive stack means it also knows when NOT to speak. Every suggestion must pass all 8 gates or it stays silent. This mirrors the bee's central complex, which can override foraging impulses."),

        spacer(60),
        body("The result: an AI that doesn't just answer questions, but anticipates needs. A 70% action rate on suggestions \u2014 versus 15% for competitors \u2014 because every suggestion is contextual, timely, and earned the right to interrupt."),

        // === HYVE ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("Hyve \u2014 Where It All Started"),
        sectionDivider(),

        body("Hyve is iSyncSO's original breakthrough: an AI learning engine inspired by bees. Just as a bee colony collects pollen from diverse sources to create honey, Hyve collects signals from your daily work to create personalized learning paths."),
        spacer(60),

        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("How Hyve Works")] }),
        spacer(40),
        bulletBold("Learning While You Work", " \u2014 No separate training environment. Hyve delivers 2-minute micro-lessons in the moments that matter, teaching you something useful now \u2014 not next quarter."),
        bulletBold("Proof, Not Certificates", " \u2014 Completion certificates prove nothing about capability. Hyve tracks whether you actually apply what you learned in your daily work and marks it to continue on something more complex."),
        bulletBold("Zero Wasted Time", " \u2014 Traditional courses waste time on what you already know. Hyve builds a precise skills map from your actual work and teaches only the gaps."),
        bulletBold("Team Skills Intelligence", " \u2014 Stop guessing what your team can do. See who has required skills for a new project, who's close, and whether to upskill internally or hire externally."),
        bulletBold("Intelligent Career Pathing", " \u2014 Want to transition to a different role? Hyve maps the exact skill gaps between where you are and where you want to be \u2014 and teaches you what's needed to get there."),
        spacer(60),
        body("Hyve achieved a 68% engagement rate where the industry average is 15%. Not by making courses more engaging, but by making learning invisible \u2014 embedded into the work itself."),

        // === EVIDENCE & METRICS ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("Evidence & Competitive Edge"),
        sectionDivider(),

        body("The Apian Architecture doesn't just sound different. It produces measurably different outcomes:"),
        spacer(60),

        new Table({
          columnWidths: [3120, 3120, 3120],
          rows: [
            new TableRow({ tableHeader: true, children: [
              makeCell("Metric", { fill: DARK, color: WHITE, bold: true, width: 3120 }),
              makeCell("iSyncSO", { fill: DARK, color: WHITE, bold: true, width: 3120 }),
              makeCell("Industry / Competitors", { fill: DARK, color: WHITE, bold: true, width: 3120 }),
            ]}),
            new TableRow({ children: [
              makeCell("Compute Cost per User", { fill: ACCENT_BG, bold: true, width: 3120 }),
              makeCell("~$0.08/day", { fill: ACCENT_BG, width: 3120 }),
              makeCell("~$1.00/day (screen-streaming competitors)", { fill: ACCENT_BG, width: 3120 }),
            ]}),
            new TableRow({ children: [
              makeCell("Suggestion Action Rate", { bold: true, width: 3120 }),
              makeCell("70%", { width: 3120 }),
              makeCell("~15% (notification-based tools)", { width: 3120 }),
            ]}),
            new TableRow({ children: [
              makeCell("Time to Personalization", { fill: ACCENT_BG, bold: true, width: 3120 }),
              makeCell("Day 1 (one-trial learning)", { fill: ACCENT_BG, width: 3120 }),
              makeCell("Weeks to months", { fill: ACCENT_BG, width: 3120 }),
            ]}),
            new TableRow({ children: [
              makeCell("Learning Engagement", { bold: true, width: 3120 }),
              makeCell("68%", { width: 3120 }),
              makeCell("15% industry average", { width: 3120 }),
            ]}),
            new TableRow({ children: [
              makeCell("Silence Rate", { fill: ACCENT_BG, bold: true, width: 3120 }),
              makeCell("30% (when staying silent is better)", { fill: ACCENT_BG, width: 3120 }),
              makeCell("~0% (always-on notifications)", { fill: ACCENT_BG, width: 3120 }),
            ]}),
            new TableRow({ children: [
              makeCell("Desktop Privacy", { bold: true, width: 3120 }),
              makeCell("100% on-device processing", { width: 3120 }),
              makeCell("Cloud-streamed screenshots", { width: 3120 }),
            ]}),
          ]
        }),

        spacer(100),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Why This Matters")] }),
        spacer(40),
        body("12x cheaper compute means iSyncSO can serve small businesses profitably where competitors need enterprise contracts to break even. A 70% action rate means suggestions actually get acted on \u2014 the system earns trust. Day-one personalization means no cold-start problem. And silence gating means users don't develop \"notification fatigue\" and start ignoring the AI."),
        spacer(60),
        body("These aren't incremental improvements. They're architectural consequences of choosing a fundamentally different cognitive model."),

        // === VALUE PROPOSITION ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("Value Proposition"),
        sectionDivider(),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("For the Business Owner")] }),
        spacer(40),
        body("One login replaces 8-12 SaaS subscriptions. CRM, invoicing, inventory, recruiting, learning, compliance \u2014 all in one workspace with shared context. No more copy-pasting between tools, no more \"let me check the other system.\""),

        spacer(80),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("For the Operator")] }),
        spacer(40),
        body("Your AI actually knows what's going on. SYNC sees your desktop activity, remembers your conversations, tracks your commitments, and connects dots across domains. Ask \"What should I focus on today?\" and get an answer grounded in real data \u2014 not generic advice."),

        spacer(80),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("For the Team")] }),
        spacer(40),
        body("Shared intelligence, not shared spreadsheets. Team members work in the same system, SYNC understands the full picture, and insights compound. The learning platform develops skills, the CRM tracks relationships, finance tracks revenue \u2014 and the AI connects it all."),

        spacer(100),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Quantified Impact")] }),
        spacer(40),
        new Table({
          columnWidths: [3120, 6240],
          rows: [
            new TableRow({ tableHeader: true, children: [
              makeCell("Metric", { fill: DARK, color: WHITE, bold: true, width: 3120 }),
              makeCell("Value", { fill: DARK, color: WHITE, bold: true, width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Time Saved", { fill: ACCENT_BG, bold: true, width: 3120 }),
              makeCell("10+ hours per week per user on administrative overhead", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Tool Consolidation", { bold: true, width: 3120 }),
              makeCell("One system replaces 8-12 separate SaaS subscriptions", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Compute Efficiency", { fill: ACCENT_BG, bold: true, width: 3120 }),
              makeCell("12x cheaper than screen-streaming competitors (~$0.08/day/user)", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Intelligence", { bold: true, width: 3120 }),
              makeCell("Proactive \u2014 70% action rate on AI suggestions (vs 15% industry average)", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Privacy Model", { fill: ACCENT_BG, bold: true, width: 3120 }),
              makeCell("Desktop intelligence runs 100% on-device, never in the cloud", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Learning Engagement", { bold: true, width: 3120 }),
              makeCell("68% engagement rate (industry average: 15%)", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Personalization", { fill: ACCENT_BG, bold: true, width: 3120 }),
              makeCell("Meaningful profiles from day one via one-trial learning", { width: 6240 }),
            ]}),
          ]
        }),

        // === TARGET AUDIENCE ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("Target Audience"),
        sectionDivider(),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Primary: Product-Based SMBs & Scaling Startups")] }),
        spacer(40),
        body("Companies with 5-50 employees that have outgrown spreadsheets but can't justify \u2014 or manage \u2014 a stack of enterprise tools. They need CRM, invoicing, inventory, and operations connected, not siloed."),
        spacer(60),
        bullet("Revenue \u20AC500K\u2013\u20AC10M"),
        bullet("Selling physical or digital products across multiple channels"),
        bullet("Small teams wearing multiple hats"),
        bullet("Based in or selling to the EU/Netherlands market"),
        bullet("Need operational efficiency, not just more dashboards"),

        spacer(100),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Secondary Segments")] }),
        spacer(40),

        new Table({
          columnWidths: [2340, 2340, 4680],
          rows: [
            new TableRow({ tableHeader: true, children: [
              makeCell("Segment", { fill: DARK, color: WHITE, bold: true, width: 2340 }),
              makeCell("Primary Modules", { fill: DARK, color: WHITE, bold: true, width: 2340 }),
              makeCell("Why iSyncSO", { fill: DARK, color: WHITE, bold: true, width: 4680 }),
            ]}),
            new TableRow({ children: [
              makeCell("Recruitment Agencies", { fill: ACCENT_BG, bold: true, width: 2340 }),
              makeCell("TALENT, GROWTH, FINANCE", { fill: ACCENT_BG, width: 2340 }),
              makeCell("AI matching + outreach automation + invoicing in one system", { fill: ACCENT_BG, width: 4680 }),
            ]}),
            new TableRow({ children: [
              makeCell("E-commerce Operators", { bold: true, width: 2340 }),
              makeCell("PRODUCTS, FINANCE, GROWTH", { width: 2340 }),
              makeCell("Multi-marketplace sync (bol.com + Shopify) + CRM + cash flow", { width: 4680 }),
            ]}),
            new TableRow({ children: [
              makeCell("Freelancers & Solopreneurs", { fill: ACCENT_BG, bold: true, width: 2340 }),
              makeCell("FINANCE, GROWTH, SYNC", { fill: ACCENT_BG, width: 2340 }),
              makeCell("One AI assistant that handles invoicing, CRM, and daily operations", { fill: ACCENT_BG, width: 4680 }),
            ]}),
            new TableRow({ children: [
              makeCell("Growth Teams", { bold: true, width: 2340 }),
              makeCell("GROWTH, LEARN, RAISE", { width: 2340 }),
              makeCell("Sales intelligence + team development + fundraising pipeline", { width: 4680 }),
            ]}),
            new TableRow({ children: [
              makeCell("Compliance Officers", { fill: ACCENT_BG, bold: true, width: 2340 }),
              makeCell("SENTINEL + all modules", { fill: ACCENT_BG, width: 2340 }),
              makeCell("EU AI Act compliance built into the platform they already use", { fill: ACCENT_BG, width: 4680 }),
            ]}),
            new TableRow({ children: [
              makeCell("Education & Government", { bold: true, width: 2340 }),
              makeCell("LEARN, SENTINEL", { width: 2340 }),
              makeCell("Workforce transformation with verifiable skill development", { width: 4680 }),
            ]}),
          ]
        }),

        // === COMPETITIVE DIFFERENTIATION ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("Competitive Differentiation"),
        sectionDivider(),

        body("iSyncSO doesn't compete with individual tools. It replaces the need for them. And its Apian Architecture creates advantages that can't be replicated by bolting AI onto existing software:"),
        spacer(60),

        new Paragraph({
          numbering: { reference: "num-list-1", level: 0 },
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "Bio-inspired, not human-inspired. ", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
            new TextRun({ text: "Every AI competitor models human cognition. iSyncSO models bee cognition \u2014 producing an architecture that is 12x cheaper, learns in one trial, and knows when to stay silent.", size: 22, font: "Arial", color: "333333" }),
          ]
        }),
        new Paragraph({
          numbering: { reference: "num-list-1", level: 0 },
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "Desktop awareness with privacy. ", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
            new TextRun({ text: "No other business platform has a silent desktop companion that uses active-vision sensing (not raw screenshots) with 100% on-device processing.", size: 22, font: "Arial", color: "333333" }),
          ]
        }),
        new Paragraph({
          numbering: { reference: "num-list-1", level: 0 },
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "Cross-domain intelligence. ", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
            new TextRun({ text: "Most tools are islands. iSyncSO's Intelligence Engine connects signals across CRM, finance, inventory, recruiting, and activity data through two-pass LLM reasoning to produce insights no single-purpose tool can generate.", size: 22, font: "Arial", color: "333333" }),
          ]
        }),
        new Paragraph({
          numbering: { reference: "num-list-1", level: 0 },
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "Earned attention, not noise. ", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
            new TextRun({ text: "The 8-gate metacognitive stack means every suggestion earns the right to interrupt you. 70% of suggestions get acted on because they pass the silence filter first.", size: 22, font: "Arial", color: "333333" }),
          ]
        }),
        new Paragraph({
          numbering: { reference: "num-list-1", level: 0 },
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "Regulatory compliance built in. ", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
            new TextRun({ text: "SENTINEL for EU AI Act is a first-class module that turns compliance from reactive panic into continuous proof \u2014 timestamped and contextualized.", size: 22, font: "Arial", color: "333333" }),
          ]
        }),
        new Paragraph({
          numbering: { reference: "num-list-1", level: 0 },
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "One agent, every domain. ", bold: true, size: 22, font: "Arial", color: "1A1A1A" }),
            new TextRun({ text: "SYNC executes 51+ actions across all modules through natural language. \"Invoice Acme for the March delivery\" triggers the right action in the right module without the user navigating anywhere.", size: 22, font: "Arial", color: "333333" }),
          ]
        }),

        // === SERVICES ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("Services"),
        sectionDivider(),

        body("Beyond the platform, iSyncSO offers professional services for organizations facing challenges others can't crack:"),
        spacer(60),

        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("Custom AI Automation")] }),
        spacer(40),
        body("Bespoke AI solutions built for specific business challenges. Example: reducing property splitting eligibility assessment from 2+ weeks to 2.5 minutes through custom automation."),

        spacer(60),
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("L&D Transformation")] }),
        spacer(40),
        body("Enterprise learning strategy powered by Hyve's technology. Implementation, integration with existing HR systems, and ongoing optimization of AI-driven workforce development programs."),

        spacer(60),
        new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun("Partner Program")] }),
        spacer(40),
        body("For consultancies, integrators, and technology partners who want to deliver iSyncSO's capabilities to their own client base."),

        spacer(60),
        calloutBox("\"If it can't be done, we're interested.\"", { bold: true, color: "0A6E5C" }),

        // === TECHNOLOGY ===
        new Paragraph({ children: [new PageBreak()] }),
        heading("Technology Stack"),
        sectionDivider(),

        new Table({
          columnWidths: [2340, 7020],
          rows: [
            new TableRow({ tableHeader: true, children: [
              makeCell("Layer", { fill: DARK, color: WHITE, bold: true, width: 2340 }),
              makeCell("Technologies", { fill: DARK, color: WHITE, bold: true, width: 7020 }),
            ]}),
            new TableRow({ children: [
              makeCell("Web Frontend", { fill: ACCENT_BG, bold: true, width: 2340 }),
              makeCell("React 18, Vite, TypeScript, Tailwind CSS, Radix UI, Framer Motion", { width: 7020 }),
            ]}),
            new TableRow({ children: [
              makeCell("Backend", { bold: true, width: 2340 }),
              makeCell("Supabase (PostgreSQL + 180+ Deno Edge Functions), Row-Level Security, pg_cron", { width: 7020 }),
            ]}),
            new TableRow({ children: [
              makeCell("Desktop", { fill: ACCENT_BG, bold: true, width: 2340 }),
              makeCell("Electron 34+, TypeScript, React, SQLite (better-sqlite3), OS Keychain", { width: 7020 }),
            ]}),
            new TableRow({ children: [
              makeCell("Native ML", { bold: true, width: 2340 }),
              makeCell("Swift, Apple MLX framework, macOS Vision OCR, on-device inference", { width: 7020 }),
            ]}),
            new TableRow({ children: [
              makeCell("AI Models", { fill: ACCENT_BG, bold: true, width: 2340 }),
              makeCell("Kimi-K2-Instruct & Llama-3.3-70B (Together.ai), Groq (extraction), FLUX (images)", { width: 7020 }),
            ]}),
            new TableRow({ children: [
              makeCell("Integrations", { bold: true, width: 2340 }),
              makeCell("Composio (30+ apps), Twilio, Stripe, bol.com API, Shopify Admin API, Apollo, LeadMagic", { width: 7020 }),
            ]}),
            new TableRow({ children: [
              makeCell("Infrastructure", { fill: ACCENT_BG, bold: true, width: 2340 }),
              makeCell("Vercel (frontend), Supabase Cloud (backend), GitHub Releases (desktop distribution)", { width: 7020 }),
            ]}),
          ]
        }),

        // === COMPANY FACTS ===
        spacer(200),
        heading("Company Facts"),
        sectionDivider(),

        new Table({
          columnWidths: [3120, 6240],
          rows: [
            new TableRow({ children: [
              makeCell("Legal Entity", { fill: ACCENT_BG, bold: true, width: 3120 }),
              makeCell("Isyncso Limited", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Founded By", { bold: true, width: 3120 }),
              makeCell("Gody Duinsbergen & David", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Product", { fill: ACCENT_BG, bold: true, width: 3120 }),
              makeCell("app.isyncso.com (web) + SYNC Desktop (native macOS & Windows)", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Headquarters", { bold: true, width: 3120 }),
              makeCell("Netherlands", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Team", { fill: ACCENT_BG, bold: true, width: 3120 }),
              makeCell("Founder-led, lean engineering team", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Business Model", { bold: true, width: 3120 }),
              makeCell("B2B SaaS (subscription) + Marketplace revenue (Nests) + Professional Services", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Architecture", { fill: ACCENT_BG, bold: true, width: 3120 }),
              makeCell("The Apian Architecture \u2014 8 structural parallels with Apis mellifera cognition", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Current Version", { bold: true, width: 3120 }),
              makeCell("Web: continuous deployment  |  Desktop: v2.3.0", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Platforms", { fill: ACCENT_BG, bold: true, width: 3120 }),
              makeCell("Web (all browsers), macOS (Apple Silicon & Intel), Windows", { width: 6240 }),
            ]}),
            new TableRow({ children: [
              makeCell("Website", { bold: true, width: 3120 }),
              makeCell("isyncso.com  |  app.isyncso.com", { width: 6240 }),
            ]}),
          ]
        }),

        // === CLOSING ===
        new Paragraph({ children: [new PageBreak()] }),
        spacer(800),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "iSyncSO", size: 48, bold: true, color: DARK, font: "Arial" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          indent: { left: 1440, right: 1440 },
          children: [new TextRun({ text: "The AI-powered business operating system that replaces your fragmented tool stack with one intelligent workspace \u2014 where a context-aware agent, inspired by honeybee cognition, watches, learns, and acts across every dimension of your business.", size: 24, color: "444444", font: "Arial", italics: true })]
        }),
        spacer(300),
        calloutBox("\"Every AI tool today was designed to think like a human. We looked at how bees think.\"", { size: 24, bold: true, borderColor: AMBER, color: AMBER }),
        spacer(200),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: "Collect Pollen, Earn Honey, Grow Your Hive.", size: 22, bold: true, color: CYAN, font: "Arial" })]
        }),
        spacer(200),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          borders: { top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR, space: 12 } },
          spacing: { before: 200 },
          children: [new TextRun({ text: "isyncso.com  |  app.isyncso.com  |  hello@isyncso.com", size: 20, color: GRAY, font: "Arial" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          children: [new TextRun({ text: "\u00A9 2026 Isyncso Limited. All rights reserved.", size: 18, color: GRAY, font: "Arial" })]
        }),
      ]
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = "/Users/godyduinsbergen/Desktop/iSyncSO-Company-Profile-2026.docx";
  fs.writeFileSync(outPath, buffer);
  console.log("Document written to:", outPath);
});
