const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { PROMPTS, DEFAULT_APP_ID, resolveEntry } = require('./prompts');

const app = express();
app.use(express.json());

// ── CORS: restrict to the Qlik tenant origin (ALLOWED_ORIGIN), default "*" ──
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Backend-Token"]
}));

// ── Simple in-memory rate limiting (per IP) ──
const RATE_MAX = parseInt(process.env.RATE_MAX || "30", 10);   // requests
const RATE_WINDOW_MS = 60 * 1000;                               // per minute
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    return res.status(429).json({ error: "Too many requests — try again shortly" });
  }
  arr.push(now);
  hits.set(ip, arr);
  next();
}

// ── Optional app-level token: if BACKEND_TOKEN is set, require it on /ask ──
const BACKEND_TOKEN = process.env.BACKEND_TOKEN;
function requireToken(req, res, next) {
  if (!BACKEND_TOKEN) return next(); // disabled if not configured
  if (req.headers["x-backend-token"] === BACKEND_TOKEN) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

// ── Tri-mode model backend ────────────────────────────────────────
// 1) GEMINI_MODEL set  → Gemini on Vertex (Google first-party, no entitlement)
// 2) GCP_PROJECT set   → Claude on Vertex AI
// 3) else              → Anthropic direct API (key-based)
// callModel(question, systemPrompt) → { text, usage }
// The systemPrompt is chosen per Qlik app from the prompts registry.
let callModel;

if (process.env.GEMINI_MODEL) {
  const { VertexAI } = require('@google-cloud/vertexai');
  const vertexAI = new VertexAI({
    project: process.env.GCP_PROJECT,
    location: process.env.GCP_REGION || 'us-central1'
  });
  // One model instance per distinct system prompt (cached so we don't rebuild it
  // every request — also lets Gemini's implicit context cache stay warm per app).
  const modelCache = new Map();
  const getModel = (systemPrompt) => {
    let m = modelCache.get(systemPrompt);
    if (!m) {
      m = vertexAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL,
        systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
        // thinkingBudget:0 disables gemini-2.5 "thinking" — we only need structured
        // JSON, and thinking tokens were eating the output budget and truncating the
        // JSON on harder questions. maxOutputTokens raised as a safety net.
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 2048,
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 }
        }
      });
      modelCache.set(systemPrompt, m);
    }
    return m;
  };
  callModel = async (question, systemPrompt) => {
    const result = await getModel(systemPrompt).generateContent({
      contents: [{ role: 'user', parts: [{ text: question }] }]
    });
    const cand = result.response.candidates[0];
    const text = cand.content.parts.map(p => p.text || '').join('');
    const u = result.response.usageMetadata || {};
    return { text, usage: { input_tokens: u.promptTokenCount || 0, output_tokens: u.candidatesTokenCount || 0, cache_read_tokens: 0 } };
  };
  console.log(`🔵 Mode: Gemini on Vertex (model=${process.env.GEMINI_MODEL}, region=${process.env.GCP_REGION || 'us-central1'})`);
} else if (process.env.GCP_PROJECT) {
  const { AnthropicVertex } = require('@anthropic-ai/vertex-sdk');
  const client = new AnthropicVertex({ projectId: process.env.GCP_PROJECT, region: process.env.GCP_REGION || 'us-east5' });
  const MODEL = process.env.GCP_CLAUDE_MODEL || 'claude-opus-4-1@20250805';
  callModel = async (question, systemPrompt) => {
    const r = await client.messages.create({ model: MODEL, max_tokens: 800, system: systemPrompt, messages: [{ role: 'user', content: question }] });
    return { text: r.content[0].text, usage: { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens, cache_read_tokens: r.usage.cache_read_input_tokens || 0 } };
  };
  console.log(`🟢 Mode: Vertex Claude (model=${MODEL})`);
} else {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
  callModel = async (question, systemPrompt) => {
    const r = await client.messages.create({ model: MODEL, max_tokens: 800, system: systemPrompt, messages: [{ role: 'user', content: question }] });
    return { text: r.content[0].text, usage: { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens, cache_read_tokens: r.usage.cache_read_input_tokens || 0 } };
  };
  console.log('🟡 Mode: Anthropic direct API (key-based)');
}

// Structured token-usage log line (one JSON object per LLM call). Cloud Logging
// parses this into jsonPayload fields, which a log-based metric + alert use.
function logUsage(endpoint, appName, usage, extra = {}) {
  const input = (usage && usage.input_tokens) || 0;
  const output = (usage && usage.output_tokens) || 0;
  console.log(JSON.stringify(Object.assign({
    severity: "INFO",
    event: "llm_usage",
    component: "qlik-chatbot",
    endpoint: endpoint,
    app: appName,
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output
  }, extra)));
}

app.post('/ask', rateLimit, requireToken, async (req, res) => {
  const { question, app_id, app_name } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  // Pick the prompt by app_id; fall back to name keyword (survives publish/copy → new id).
  const entry = resolveEntry(app_id, app_name);
  if (!PROMPTS[app_id]) {
    console.warn(`⚠️ Unknown app_id "${app_id}" (name="${app_name || ''}") — resolved to "${entry.name}"`);
  }

  try {
    const { text, usage } = await callModel(question, entry.systemPrompt);

    let query;
    try {
      query = JSON.parse(text);
    } catch (e) {
      return res.status(400).json({ error: 'Failed to parse model response', raw: text });
    }

    logUsage('ask', entry.name, usage, { mode: (query && query.mode) || 'query' });
    res.json({ query, app: entry.name, cache_stats: usage });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── /interpret — step 2 of the two-step "analysis" flow ──────────────────────
// The extension first calls /ask (planner) → gets a plan of cuts → runs them in
// Qlik → sends the resulting tables here. Gemini (analyst persona) reasons over
// the real numbers and returns a structured analysis.
app.post('/interpret', rateLimit, requireToken, async (req, res) => {
  const { question, app_id, app_name, results } = req.body;

  if (!question || !Array.isArray(results)) {
    return res.status(400).json({ error: 'question and results[] are required' });
  }

  const entry = resolveEntry(app_id, app_name);
  if (!entry.analystPrompt) {
    return res.status(400).json({ error: `Analysis not supported for app "${entry.name}"` });
  }

  // Format the result tables compactly for the model.
  const resultsText = results.map((r, i) => {
    const cols = Array.isArray(r.columns) ? r.columns.join(' | ') : '';
    const rows = (Array.isArray(r.rows) ? r.rows.slice(0, 40) : [])
      .map(row => (Array.isArray(row) ? row.join(' | ') : String(row)))
      .join('\n');
    return `טבלה ${i + 1}: ${r.label || ''}\nעמודות: ${cols}\n${rows || '(אין נתונים)'}`;
  }).join('\n\n');

  const userMsg = `שאלת המשתמש: ${question}\n\nטבלאות תוצאה שחושבו מהנתונים:\n\n${resultsText}`;

  try {
    const { text, usage } = await callModel(userMsg, entry.analystPrompt);
    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch (e) {
      return res.status(400).json({ error: 'Failed to parse analyst response', raw: text });
    }
    logUsage('interpret', entry.name, usage, { cuts: results.length });
    res.json({ analysis, app: entry.name, cache_stats: usage });
  } catch (error) {
    console.error('Interpret error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', apps: Object.values(PROMPTS).map(p => p.name) });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
  console.log(`📚 Apps loaded: ${Object.values(PROMPTS).map(p => p.name).join(', ')}`);
  console.log('📍 POST /ask - Ask a question (router: query | analysis plan)');
  console.log('📍 POST /interpret - Analyze pulled result tables (analysis step 2)');
  console.log('📍 GET /health - Health check');
});
