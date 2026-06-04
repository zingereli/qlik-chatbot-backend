# Qlik Chatbot - Hebrew Natural Language Data Queries

**תוכנה שמתשאלת את ה-Qlik בעברית בשפה חופשית**

## Architecture

```
[Qlik Extension - Chat Panel in Sheet]
            ↓
[Flask Backend + Claude API with Prompt Caching]
            ↓
[Qlik Engine API - HyperCube Queries]
            ↓
[Results back to Extension]
```

## Components

1. **app.py** - Flask backend
   - Receives Hebrew questions
   - Calls Claude API with Prompt Caching (schema cached)
   - Returns Qlik query structure

2. **qlik-chatbot-extension.js** - Qlik Extension
   - Chat UI embedded in Qlik sheet
   - Displays conversation with Claude
   - Shows results as tables

3. **qlik-helper.js** - Qlik Engine Bridge
   - Converts query structure to HyperCube API
   - Executes queries, extracts results

## Setup

### 1. Backend Environment

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cat > .env << 'ENVEOF'
ANTHROPIC_API_KEY=sk-...
PORT=5000
ENVEOF

# Run backend
python app.py
```

Backend will be available at: http://localhost:5000

### 2. Qlik Extension Setup

1. **Upload Extension to Qlik:**
   - Go to Qlik Sense Hub → Create → Extension
   - Upload `qlik-chatbot-extension.js`
   - Save

2. **Add Extension to Sheet:**
   - Open any sheet in the app
   - Add object → Select your uploaded extension
   - Configure:
     - Backend API URL: `http://localhost:5000` (or your deployment URL)
     - App ID: `872ce203-b200-48ef-9582-4f7399299684` (your app)

3. **Start asking questions in Hebrew!**

## How It Works

### End-to-End Flow

1. **User asks question in Hebrew:**
   - "כמה מפונים יש בכל ישוב?"
   
2. **Backend processes:**
   ```
   Flask receives question
   ↓
   Claude receives system prompt + schema (cached)
   ↓
   Claude returns JSON query structure:
   {
     "interpretation": "כמה מפונים...",
     "measure": {"expression": "Count(...)", "label": "מפונים"},
     "dimensions": [{"field": "locality_heb_name", "label": "יישוב"}],
     ...
   }
   ↓
   Flask returns to Extension
   ```

3. **Extension executes:**
   ```
   Converts query structure to Qlik HyperCube
   ↓
   Calls Qlik Engine API
   ↓
   Gets results (table of settlements + counts)
   ↓
   Displays in chat
   ```

4. **User sees:**
   - Table with settlements and evacuee counts
   - Cache stats (how many tokens saved)

## Key Features

### ✅ Prompt Caching
- Schema cached in Claude API (90% token savings)
- First question: full schema cached
- Subsequent questions: cached schema reused
- Cost reduction on repeated questions

### ✅ HyperCube Queries
- No BigQuery cost for QVD apps
- Real-time, in-memory data
- Works with Qlik's associative model

### ✅ Hebrew Natural Language
- Supports diverse question patterns
- Handles time filters ("בחודש האחרון")
- Supports comparisons ("השווה בין צפון לדרום")
- Ranked queries ("הכי הרבה")

## Supported Question Patterns

| Pattern | Example | Query Type |
|---------|---------|-----------|
| Metric by dimension | "כמה מפונים בכל יישוב?" | GROUP BY |
| Top N | "מה הישוב עם הכי הרבה נפגעים?" | ORDER DESC LIMIT 1 |
| Time-based | "בחודש האחרון" | DATE FILTER |
| Comparison | "השווה צפון לדרום" | GROUP BY region |
| Aggregation | "סך הכל הרוגים" | SUM |

## API Endpoints

### POST /ask
Request:
```json
{
  "question": "כמה מפונים יש?",
  "app_id": "872ce203-b200-48ef-9582-4f7399299684"
}
```

Response:
```json
{
  "query": {
    "interpretation": "מפונים",
    "measure": {...},
    "dimensions": [...],
    ...
  },
  "cache_stats": {
    "input_tokens": 1000,
    "cache_read_tokens": 900,
    "output_tokens": 150
  }
}
```

### POST /execute
(Used by Extension to execute the query)

## Deployment

### Option 1: Local Development
```bash
python app.py
```

### Option 2: Docker
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app.py .
CMD ["python", "app.py"]
```

### Option 3: Cloud (Google Cloud Run, AWS Lambda, etc.)
- Requires ANTHROPIC_API_KEY in environment
- Set PORT environment variable
- Update Extension with cloud URL

## Cost Optimization

| Data Source | Query Method | Cost |
|------------|-------------|------|
| QVD (in-memory) | HyperCube API | $0 ✓ |
| BigQuery | Direct SQL | $ (query cost) |
| **Prompt Caching** | Claude API | 90% savings on schema |

## Next Steps

1. ✅ Backend API running
2. ✅ Extension uploaded to Qlik
3. ⬜ Add semantic routing (for 50+ apps)
4. ⬜ Add visualization options (charts, exports)
5. ⬜ Add data filtering/permissions
6. ⬜ Add analytics (track popular questions)

## Troubleshooting

### Extension not loading
- Check browser console for errors
- Verify Backend URL is correct
- Check CORS headers in Flask

### Claude API errors
- Verify ANTHROPIC_API_KEY in .env
- Check API quota and rate limits
- Look at error message from /ask endpoint

### No data returned
- Verify app_id is correct
- Check if query dimensions/measures exist
- Look at Qlik console for HyperCube errors

## References

- [Qlik Sense Extension API](https://qlik.dev/extensions/)
- [Claude API with Prompt Caching](https://docs.anthropic.com/en/docs/build/advanced-features/caching)
- [Qlik Engine JSON API](https://github.com/qlik-oss/qlik-engine-api)

---

**Built with:** Claude + Qlik Sense + Prompt Caching

**Language:** Hebrew + English

**Status:** POC Ready for Testing
