# פריסה ל-Google Cloud Run עם Vertex AI (Claude)

מדריך הרצה צעד-אחר-צעד. החלף `modern-bolt-417216` ב-Project ID האמיתי שלך.
הקוד כבר מוכן ב-GitHub ותומך בשני המצבים (Vertex / Anthropic) אוטומטית.

---

## דרישות מקדימות
- `gcloud` CLI מותקן ומחובר: `gcloud auth login`
- בחירת הפרויקט: `gcloud config set project modern-bolt-417216`

---

## שלב 1 — הפעלת APIs (פעם אחת)
```bash
gcloud services enable \
  aiplatform.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

## שלב 2 — הפעלת מודל Claude ב-Vertex Model Garden
- Console → Vertex AI → **Model Garden** → חפש **Claude** → בחר את המודל (למשל Claude Opus 4.x) → **Enable / Request access**.
- רשום את ה-**Model ID** המדויק שמופיע שם (למשל `claude-opus-4-1@20250805`) ואת ה-**region** (לרוב `us-east5`).

## שלב 3 — פריסה ל-Cloud Run (מהקוד ב-GitHub)
אם הקוד מקומי בתיקייה זו:
```bash
gcloud run deploy qlik-chatbot-backend \
  --source . \
  --region us-east5 \
  --allow-unauthenticated \
  --set-env-vars GCP_PROJECT=modern-bolt-417216,GCP_REGION=us-east5,GCP_CLAUDE_MODEL=claude-opus-4-1@20250805
```
> `--source .` בונה את ה-Docker image אוטומטית (Cloud Build) ופורס.
> בסיום תקבל URL: `https://qlik-chatbot-backend-xxxx-uc.a.run.app`

## שלב 4 — הרשאת ה-Service Account לקרוא ל-Vertex
מצא את ה-Service Account שבו Cloud Run משתמש (ברירת מחדל: `PROJECT_NUMBER-compute@developer.gserviceaccount.com`) ותן לו תפקיד:
```bash
gcloud projects add-iam-policy-binding modern-bolt-417216 \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

## שלב 5 — בדיקת ה-Backend
```bash
curl -X POST https://<YOUR-RUN-URL>/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"כמה מפונים יש בכל ישוב?"}'
```
אמור לחזור JSON עם `measure` ו-`dimensions`.

## שלב 6 — חיבור Qlik
1. עדכן ב-`chatbot.js` את השורה:
   `const backendUrl = "https://<YOUR-RUN-URL>";`
2. ב-Qlik Management Console → **Content security policy** → הוסף את הדומיין `<YOUR-RUN-URL>` ל-directive `connect-src`.
3. בנה מחדש את ה-ZIP והעלה מחדש ל-Qlik:
   ```powershell
   Compress-Archive -Path chatbot.js, chatbot.qext -DestinationPath chatbot.zip -Force
   ```

---

## הרשאות IAM — סיכום
| למי | תפקיד | בשביל מה |
|-----|--------|----------|
| Service Account של Cloud Run | `roles/aiplatform.user` | לקרוא ל-Claude דרך Vertex |
| המשתמש שמ-deploy | `roles/run.admin` + `roles/cloudbuild.builds.editor` + `roles/iam.serviceAccountUser` | לבנות ולפרוס |

## הערות
- **אין מפתח API** במצב Vertex — האימות דרך ה-Service Account. אפשר למחוק את `ANTHROPIC_API_KEY`.
- אם תרצה לחזור זמנית ל-Anthropic: פשוט אל תגדיר `GCP_PROJECT` (הקוד יזהה ויעבור למצב מפתח).
- לאחר אימות שה-Cloud Run עובד — אפשר למחוק את שירות ה-Render.
- **אבטחה לפני public:** ראה סעיף 11 במסמך הסיכום (אימות, rate limiting, CORS מוגבל, תקרת עלות).