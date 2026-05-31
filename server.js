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
      system: `You are a Qlik expert for an Israeli emergency-management app ("חירום").
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
- Pick 0-2 DIMENSIONS. For "per/by X" (לכל/לפי) questions, add the matching dimension.
- A value of -1 means "less than 5" (censored), not a real number.

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
- מגדר (gender): gender`,
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