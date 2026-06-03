const express = require('express');
const cors = require('cors');
require('dotenv').config();

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

// ── System prompt (shared across all model backends) ──
const SYSTEM_PROMPT = `You are a Qlik expert for an Israeli emergency-management app ("חירום").
The user asks questions in Hebrew. Return ONLY valid JSON (no markdown, no text).

Return format:
{
  "interpretation": "Short restatement of the question in Hebrew",
  "measure": {"expression": "<exact Qlik expression from MEASURES below>", "label": "<Hebrew label>"},
  "dimensions": [{"field": "<exact field name from DIMENSIONS below>", "label": "<Hebrew label>"}]
}

CRITICAL RULES:
- The data model is EAV-style: numeric values live in val_int, filtered by madad/src/val_name.
- NEVER invent field names. Use ONLY the exact expressions and field names listed below.
- Pick the single MEASURE that best matches the question. Copy its expression verbatim.
- Pick 0-2 DIMENSIONS. Whenever the question groups by something, ADD that dimension.
  Trigger words for grouping: בכל / לכל / לפי / per / by / each (e.g. "בכל יישוב" → add יישוב).
- A value of -1 means "less than 5" (censored), not a real number.

EXAMPLES:
Q: "כמה מפונים יש בכל ישוב?"
A: {"interpretation":"מספר המפונים בכל יישוב","measure":{"expression":"Count(distinct [mg_evacuee_yahad_allevent_vw.citizen_id])","label":"מספר מפונים"},"dimensions":[{"field":"locality_heb_name","label":"יישוב"}]}
Q: "כמה נפגעים יש?"
A: {"interpretation":"סך הנפגעים","measure":{"expression":"Sum({<madad={'totalCasualties'}>} val_int)","label":"נפגעים"},"dimensions":[]}
Q: "כמות התרעות לפי מחוז"
A: {"interpretation":"כמות התרעות לפי מחוז","measure":{"expression":"Count({<src={'fianl_alert'}>} distinct val_int)","label":"כמות התרעות"},"dimensions":[{"field":"district_name_rachel","label":"מחוז"}]}

WORD DISAMBIGUATION (these are DIFFERENT - do not confuse):
- מפונים = evacuees → use the evacuees measure (citizen_id count). NOT casualties.
- נפגעים = casualties/injured → totalCasualties measure.
- נפטרים / הרוגים = deceased/killed → totalDeceased or [full name] count.
- Read the user's word literally. Keep the same word in your interpretation.

MEASURES (use the expression exactly as written):
- נפגעים (casualties): Sum({<madad={'totalCasualties'}>} val_int)
- נפטרים (deceased/killed in emergency): Sum({<madad={'totalDeceased'}>} val_int)
- מאושפזים (hospitalized): Sum({<madad={'totalHospitalized'}>} val_int)
- הרוגים (people killed, by name): Count(distinct [full name])
- כמות התרעות (alerts count): Count({<src={'fianl_alert'}>} distinct val_int)
- מספר מפונים / מפונים (evacuees, distinct citizens): Count(distinct [mg_evacuee_yahad_allevent_vw.citizen_id])
- אזרחים שאינם בביתם כעת (citizens not currently home): Count({<[mg_evacuee_yahad_allevent_vw.event_type]={'שאגת הארי'},[mg_evacuee_yahad_allevent_vw.is_currently_in_place_flag]={1},[mg_evacuee_yahad_allevent_vw.is_last_row]={1},[mg_evacuee_yahad_allevent_vw.housing_type_person]-={''}>} DISTINCT [mg_evacuee_yahad_allevent_vw.citizen_id])
- דורשי עבודה (job seekers): Sum({<src={'job_seekers'}>} val_int)
- כניסות לארץ (entries to country): {<madad={'כניסה'}>} Sum(val_int)
- יציאות מהארץ (exits from country): {<madad={'יציאה'}>} Sum(val_int)
- generic sum of val: Sum(val_int)

DIMENSIONS (use the field name exactly):
- יישוב (settlement): locality_heb_name
- רשות / מועצה / רשות מקומית (local authority): municipal_short_name
- מחוז (district): district_name_rachel
- מועצה אזורית (regional council): regional_council_name_datagov
- תאריך (date): FullDate
- חודש (month): MonthYear
- שנה (year): Year
- סוג אירוע (event type): eventType
- קבוצת גיל (age group): group_age
- מגדר (gender): gender`;

// ── Tri-mode model backend ────────────────────────────────────────
// 1) GEMINI_MODEL set  → Gemini on Vertex (Google first-party, no entitlement)
// 2) GCP_PROJECT set   → Claude on Vertex AI
// 3) else              → Anthropic direct API (key-based)
// callModel(question) → { text, usage }
let callModel;

if (process.env.GEMINI_MODEL) {
  const { VertexAI } = require('@google-cloud/vertexai');
  const vertexAI = new VertexAI({
    project: process.env.GCP_PROJECT,
    location: process.env.GCP_REGION || 'us-central1'
  });
  const model = vertexAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL,
    systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 800, temperature: 0 }
  });
  callModel = async (question) => {
    const result = await model.generateContent({
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
  callModel = async (question) => {
    const r = await client.messages.create({ model: MODEL, max_tokens: 800, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: question }] });
    return { text: r.content[0].text, usage: { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens, cache_read_tokens: r.usage.cache_read_input_tokens || 0 } };
  };
  console.log(`🟢 Mode: Vertex Claude (model=${MODEL})`);
} else {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
  callModel = async (question) => {
    const r = await client.messages.create({ model: MODEL, max_tokens: 800, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: question }] });
    return { text: r.content[0].text, usage: { input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens, cache_read_tokens: r.usage.cache_read_input_tokens || 0 } };
  };
  console.log('🟡 Mode: Anthropic direct API (key-based)');
}

app.post('/ask', rateLimit, requireToken, async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const { text, usage } = await callModel(question);

    let query;
    try {
      query = JSON.parse(text);
    } catch (e) {
      return res.status(400).json({ error: 'Failed to parse model response', raw: text });
    }

    res.json({ query, cache_stats: usage });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
  console.log('📍 POST /ask - Ask a question');
  console.log('📍 GET /health - Health check');
});