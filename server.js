const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

app.post('/ask', async (req, res) => {
  const { question, app_id } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 800,
      system: `You are a Qlik query expert. Return ONLY valid JSON (no markdown, no text).

Return format:
{
  "interpretation": "What the user asked",
  "measure": {"expression": "Qlik expression", "label": "Label"},
  "dimensions": [{"field": "field_name", "label": "Label"}]
}

Schema:
- Tables: emergency_new_operation_vw, harugim, mg_evacuee_yahad_allevent_vw, dim_locality, dim_municipal, MasterCalendar
- Key measures: נפגעים, נפטרים, מאושפזים, כמות התרעות, CND_citizen_id
- Key dimensions: יישוב, רשות, מחוז, FullDate, madad`,
      messages: [{ role: 'user', content: question }]
    });

    const responseText = response.content[0].text;
    let query;

    try {
      query = JSON.parse(responseText);
    } catch (e) {
      return res.status(400).json({
        error: 'Failed to parse Claude response',
        raw: responseText
      });
    }

    res.json({
      query,
      cache_stats: {
        cache_read_tokens: response.usage.cache_read_input_tokens || 0,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens
      }
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(5000, () => {
  console.log('✅ Backend running on http://localhost:5000');
  console.log('📍 POST /ask - Ask a question');
  console.log('📍 GET /health - Health check');
});