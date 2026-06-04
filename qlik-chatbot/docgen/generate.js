const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak
} = require("docx");

const PURPLE = "5B3F9D";
const PURPLE_LIGHT = "EDE8F7";
const GREY = "F5F5F7";

// ── helpers (RTL Hebrew) ─────────────────────────────────────────────
function P(text, opts = {}) {
  const runs = Array.isArray(text) ? text : [{ text }];
  return new Paragraph({
    bidirectional: true,
    alignment: opts.align || AlignmentType.RIGHT,
    spacing: { after: opts.after == null ? 120 : opts.after, before: opts.before || 0, line: 276 },
    children: runs.map(r => new TextRun({
      text: r.text, bold: r.bold || false, italics: r.italics || false,
      color: r.color, size: r.size || 22, rightToLeft: true, font: r.font || "Arial"
    }))
  });
}
function H1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, bidirectional: true, alignment: AlignmentType.RIGHT,
    spacing: { before: 280, after: 140 },
    children: [new TextRun({ text, bold: true, color: PURPLE, size: 30, rightToLeft: true, font: "Arial" })]
  });
}
function H2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, bidirectional: true, alignment: AlignmentType.RIGHT,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, color: "333333", size: 25, rightToLeft: true, font: "Arial" })]
  });
}
function Bullet(text, opts = {}) {
  const runs = Array.isArray(text) ? text : [{ text }];
  return new Paragraph({
    bidirectional: true, alignment: AlignmentType.RIGHT, bullet: { level: opts.level || 0 },
    spacing: { after: 60, line: 264 },
    children: runs.map(r => new TextRun({ text: r.text, bold: r.bold || false, italics: r.italics || false, color: r.color, size: r.size || 22, rightToLeft: true, font: "Arial" }))
  });
}
function cell(content, opts = {}) {
  const runs = Array.isArray(content) ? content : [{ text: String(content) }];
  return new TableCell({
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({
      bidirectional: true, alignment: opts.align || AlignmentType.RIGHT,
      spacing: { after: 0, line: 252 },
      children: runs.map(r => new TextRun({
        text: r.text, bold: r.bold || false, color: r.color || (opts.headerText ? "FFFFFF" : "222222"),
        size: r.size || 20, rightToLeft: true, font: "Arial"
      }))
    })]
  });
}
function tbl(headers, rows, widths) {
  const border = { style: BorderStyle.SINGLE, size: 2, color: "D9D9E3" };
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => cell([{ text: h, bold: true }], { fill: PURPLE, headerText: true, width: widths ? widths[i] : undefined, align: AlignmentType.RIGHT }))
  });
  const bodyRows = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => cell(c, { fill: ri % 2 ? GREY : "FFFFFF", width: widths ? widths[i] : undefined }))
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    visuallyRightToLeft: true,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [headRow, ...bodyRows]
  });
}
const SP = () => new Paragraph({ spacing: { after: 80 }, children: [] });

// ── document content ─────────────────────────────────────────────────
const body = [];

// Title block
body.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 60, before: 200 },
  children: [new TextRun({ text: "צ'אט-בוט לתשאול נתונים בשפה טבעית ב-Qlik Cloud", bold: true, color: PURPLE, size: 40, rightToLeft: true, font: "Arial" })]
}));
body.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 60 },
  children: [new TextRun({ text: "מסמך ארכיטקטורה · מקורות מידע · אתגרים ופתרונות · כלים ועלויות הקמה", size: 24, color: "555555", rightToLeft: true, font: "Arial" })]
}));
body.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 200 },
  children: [new TextRun({ text: "פרויקט תעסוקה ופריון / חירום · עודכן יוני 2026", size: 20, color: "888888", rightToLeft: true, font: "Arial" })]
}));

// 1. Executive summary
body.push(H1("1. תקציר מנהלים"));
body.push(P("המערכת מאפשרת למשתמשי קצה לשאול שאלות בשפה טבעית (עברית) על דשבורדים קיימים ב-Qlik Cloud, ולקבל תשובה מיידית — מספר, טבלה, גרף או ניתוח עומק — כולל שאלות שאינן קיימות בדשבורד הסטטי. מודל שפה (LLM) מתרגם את השאלה לשאילתת Qlik, והחישוב עצמו מתבצע במנוע של Qlik על הנתונים שכבר טעונים בזיכרון — כך שאין עלות חישוב נוספת ואין הוצאת נתונים החוצה."));
body.push(P([
  { text: "שני מצבי עבודה: " },
  { text: "תשאול (Lookup)", bold: true },
  { text: " — שאלה אחת → תשובה אחת; ו" },
  { text: "ניתוח (Analysis)", bold: true },
  { text: " — שאלה פתוחה (\"מה השפיע על…\") שעבורה המערכת שולפת מספר חתכים ומפיקה ניתוח מובנה. המערכת רב-אפליקציונית: אותו רכיב משרת כמה אפליקציות, וטוען אוטומטית את הסכימה המתאימה." }
]));

// 2. Overview
body.push(H1("2. סקירה כללית"));
body.push(P("המערכת מורכבת מארבע שכבות: רכיב הרחבה (Extension) בתוך Qlik שמספק את ממשק הצ'אט; שרת תיווך (Backend) בענן; מודל שפה שמתרגם שאלה למבנה שאילתה; ומנוע Qlik שמבצע את החישוב. הערך המרכזי: המודל אינו \"ממציא\" מספרים — הוא רק מתרגם את הכוונה, והנתונים האמיתיים מגיעים תמיד מ-Qlik."));

// 3. Architecture
body.push(H1("3. ארכיטקטורה"));
body.push(H2("3.1 שכבות המערכת"));
body.push(tbl(
  ["שכבה", "טכנולוגיה", "תפקיד", "חשיפה"],
  [
    ["Extension (ממשק)", "JavaScript טהור + Qlik Capability API", "ממשק הצ'אט; הרצת השאילתה מול Qlik; ציור טבלה/גרף/כרטיס ניתוח", "רץ בדפדפן המשתמש"],
    ["Backend (תיווך)", "Node.js + Express על Cloud Run", "בחירת סכימה לפי אפליקציה; קריאה ל-LLM; אבטחה", "ציבורי — מוגן בטוקן, CORS ו-Rate-Limit"],
    ["LLM (מודל שפה)", "Gemini 2.5 Flash דרך Vertex AI", "תרגום שאלה → שאילתת Qlik (JSON); ניתוח תוצאות", "פרטי — גישה רק ל-Service Account"],
    ["Qlik Engine", "Qlik Associative Engine (in-memory)", "ביצוע החישוב בפועל על הנתונים", "בתוך האפליקציה · עלות $0"]
  ],
  [22, 26, 35, 17]
));
body.push(SP());
body.push(H2("3.2 זרימה — שאלת תשאול (Lookup)"));
body.push(Bullet("המשתמש מקליד שאלה בעברית → ה-Extension שולח אותה ל-Backend (יחד עם מזהה האפליקציה)."));
body.push(Bullet("ה-Backend שולח ל-LLM את \"ספר ההוראות\" של האפליקציה + השאלה."));
body.push(Bullet("ה-LLM מחזיר מבנה JSON: מדד, ממדים, סינונים וסוג תצוגה."));
body.push(Bullet("ה-Extension מריץ את הביטוי מול מנוע Qlik (createCube) → מקבל את המספרים → מצייר טבלה/גרף."));
body.push(H2("3.3 זרימה — שאלת ניתוח (Analysis, דו-שלבית)"));
body.push(Bullet([{ text: "שלב א' — מתכנן: ", bold: true }, { text: "ה-LLM מזהה שאלה פתוחה ומחזיר תוכנית של 2–5 חתכי נתונים." }]));
body.push(Bullet([{ text: "ביצוע: ", bold: true }, { text: "ה-Extension מריץ את כל החתכים מול Qlik ואוסף את המספרים האמיתיים." }]));
body.push(Bullet([{ text: "שלב ב' — אנליסט: ", bold: true }, { text: "ה-LLM מקבל את המספרים וכותב ניתוח מובנה — כותרת, תקציר, ממצאים עם ראיות מספריות, וסייג." }]));
body.push(P([{ text: "הערה: ", bold: true }, { text: "המספרים בניתוח תמיד אמיתיים (מ-Qlik); המודל מנסח תובנות ומתאמים — לא קובע סיבתיות." }]));
body.push(H2("3.4 גבולות אבטחה"));
body.push(Bullet("ה-Backend הוא הרכיב הציבורי היחיד (כדי שהדפדפן יוכל לפנות אליו), ומוגן בטוקן אפליקטיבי, ב-CORS המוגבל לכתובת ה-Qlik, וב-Rate-Limit."));
body.push(Bullet("מודל ה-LLM לעולם אינו חשוף לאינטרנט — ה-Backend מזדהה אליו דרך Service Account פנימי של הענן."));
body.push(Bullet("אבטחת הנתונים נשמרת אוטומטית: השאילתות רצות ב-session של המשתמש, כך שהוא רואה רק את הנתונים שמותרים לו ב-Qlik (כולל Section Access אם מוגדר)."));

// 4. Data sources
body.push(new Paragraph({ children: [new PageBreak()] }));
body.push(H1("4. מקורות המידע"));
body.push(P("הנתונים מקורם באפליקציות Qlik Cloud קיימות. כל אפליקציה היא \"עולם תוכן\" עם מודל נתונים משלו. הגישה לנתונים היא דרך מנוע Qlik (in-memory) — ולכן אין עלות שאילתה ואין תלות במסד נתונים חיצוני בזמן השאלה."));
body.push(H2("4.1 אפליקציית \"תעסוקה ופריון\""));
body.push(P("מבוססת על תפיסת המדידה של מכון אהרון / ג'וינט תבת. טבלת עובדות מרכזית (fact_employment_productivity): כל שורה מחזיקה ערך של מדד (KPI) בודד עבור צירוף מאפיינים (מגזר, מגדר, קבוצת גיל, רמת השכלה, אזור, תקופה)."));
body.push(Bullet("מדדי-על: שיעור תעסוקה, שכר (ממוצע/חציוני), פריון."));
body.push(Bullet("מאפיינים לפילוח/סינון: מגזר, מגדר, קבוצת גיל, רמת השכלה, מיקום, סוג מיקום, שנה/רבעון."));
body.push(Bullet("טווח זמן: 2012–2024 (נתון שנתי אחרון 2024; שכר עד 2023)."));
body.push(Bullet([{ text: "שתי משפחות מדדים: ", bold: true }, { text: "(א) שיעורים/אחוזים/שכר — נתמכים במלואם; (ב) ספירות (משרות טק, סה\"כ מועסקים) — מבנה תקופה שונה, נדחו לשלב הבא." }]));
body.push(H2("4.2 אפליקציית \"חירום\""));
body.push(P("מודל מסוג EAV: הערכים המספריים נמצאים בשדה אחד (val_int) ומסוננים לפי שדות סוג (madad / src). מדדים לדוגמה: נפגעים, נפטרים, מפונים, התרעות. ממדים: יישוב, רשות, מחוז."));
body.push(H2("4.3 אופן הגישה לנתונים"));
body.push(tbl(
  ["שאלה", "מקור החישוב", "עלות"],
  [
    ["תשאול / ניתוח של אפליקציה טעונה", "מנוע Qlik (in-memory)", "$0"],
    ["נתונים גולמיים (מחוץ ל-Qlik)", "BigQuery (לא בשימוש בפרויקט זה)", "לפי שאילתה — נמנע"]
  ],
  [40, 40, 20]
));

// 5. Problems & solutions
body.push(new Paragraph({ children: [new PageBreak()] }));
body.push(H1("5. אתגרים ופתרונות"));
body.push(P("להלן האתגרים המרכזיים שהתעוררו בבנייה, והפתרון שיושם עבור כל אחד. רובם נחשפו רק באמצעות אימות מול הנתונים החיים — \"הנחות הגיוניות\" החזירו 0 או מספר שגוי."));
body.push(tbl(
  ["#", "האתגר", "הפתרון"],
  [
    ["1", "מדיניות אבטחת תוכן (CSP) של Qlik חסמה קריאות מהדפדפן ל-Backend", "הוספת כתובת ה-Backend ל-connect-src ב-Qlik Management Console"],
    ["2", "Backend מקומי (localhost/tunnel) לא עבד בגלל CSP/HTTPS", "פריסה לענן (Cloud Run) עם HTTPS וכתובת קבועה"],
    ["3", "המצאת שמות שדות החזירה 0 תוצאות", "שליפת הסכימה האמיתית מהאפליקציה ואימות כל ביטוי מול הנתונים החיים"],
    ["4", "createCube מתעלם מהקשר סינון חיצוני (qContextSetExpression)", "הזרקת הסינון ישירות לתוך ביטוי המדד כ-Set Analysis"],
    ["5", "התאמת wildcard תפסה יותר מדי ערכים (\"יהודים\" תפס גם \"יהודים חרדים\")", "מצב התאמה מדויקת (exact) לשדות קטגוריים"],
    ["6", "מודל רב-ממדי עם שורות \"סה\"כ\" — ממוצע על תת-קבוצות נתן מספר שגוי", "קיבוע (pin) הממדים שלא מפצלים לערך הטוטאל → מספר ארצי נכון"],
    ["7", "קבוצת גיל שינתה דרמטית את התוצאה (59% מול 78%)", "דיפולט גיל 25–66 למדדי שיעור/שכר; למדדים עם גיל בשם — לא לקבע"],
    ["8", "דגל בפועל/יעד \"הרעיל\" מדדי שיעור (החזיר 0)", "לא להחיל את הדגל אלא אם המשתמש מבקש יעד במפורש"],
    ["9", "מודל השפה \"חתך\" את ה-JSON בשאלות מורכבות", "ביטול \"חשיבה\" (thinking) של המודל + הגדלת תקציב הפלט"],
    ["10", "המודל המציא משתנה Qlik שאינו קיים (\"3 שנים אחרונות\")", "איסור מוחלט על משתנים; שימוש בשנים מפורשות"],
    ["11", "טבלאות הוצגו ללא מיון (שנים בערבוביה)", "הגדרת מיון חכם: ממד-זמן עולה; ממד קטגורי לפי הערך יורד"],
    ["12", "צורך לתמוך בכמה אפליקציות עם אותו רכיב", "Backend רב-אפליקציוני + זיהוי אוטומטי של האפליקציה הנוכחית"],
    ["13", "ניתוחי עומק (\"מה השפיע\") — מעבר משאילתה בודדת", "מצב אנליסט דו-שלבי: מתכנן שולף חתכים, אנליסט מפרש את המספרים"],
    ["14", "חשיפה ועלות בעת פתיחה למשתמשים", "טוקן + CORS + Rate-Limit (מסלול A); LB/Cloud Armor לפרודקשן (מסלול B)"]
  ],
  [6, 44, 50]
));

// 6. Tools & costs
body.push(new Paragraph({ children: [new PageBreak()] }));
body.push(H1("6. כלים ועלויות להקמה מאפס"));
body.push(P("הסעיף מפרט מה נדרש כדי להקים מערכת כזו מאפס, כולל אפשרויות רישוי למודל השפה. המחירים משוערים ונכונים לסדר גודל בלבד — יש לאמת מול הספקים."));

body.push(H2("6.1 כלים נדרשים"));
body.push(tbl(
  ["כלי", "תפקיד", "עלות"],
  [
    ["Qlik Cloud", "פלטפורמת הדשבורדים שבה מוטמע הצ'אט (תנאי מקדים)", "מנוי ארגוני (לפי משתמש/קיבולת) — הצעת מחיר מול Qlik/שותף"],
    ["חשבון Google Cloud (GCP)", "אירוח ה-Backend והמודל", "חינם ליצירה; תשלום לפי שימוש"],
    ["Node.js + npm", "סביבת ריצת ה-Backend", "חינם"],
    ["gcloud CLI", "פריסה לענן", "חינם"],
    ["עורך קוד (VS Code) + git", "פיתוח וניהול גרסאות", "חינם"],
    ["מודל שפה (LLM)", "תרגום שאלות וניתוח", "לפי שימוש — ראו 6.2"],
    ["Qlik MCP (אופציונלי)", "כלי פיתוח לאימות סכימה מול הנתונים החיים", "חינם (לא חלק מהפרודקשן)"]
  ],
  [24, 40, 36]
));

body.push(H2("6.2 בחירת מודל שפה ורישוי"));
body.push(P("הקוד תומך בשלושה מצבים (ניתן להחליף ספק בלי שינוי לוגיקה). אין \"רישיון\" קבוע למודלים — התשלום הוא לפי צריכת טוקנים (Pay-as-you-go). מנגנון Prompt Caching חוסך כ-90% מעלות \"ספר ההוראות\" החוזר."));
body.push(tbl(
  ["אפשרות", "רישוי / הקמה", "מתי לבחור", "מחיר משוער (לכל מיליון טוקנים)"],
  [
    ["Gemini דרך Vertex AI (נבחר)", "זמין מיידית בכל פרויקט GCP; אימות ב-Service Account, ללא מפתח", "הקמה מהירה, עלות נמוכה, נשאר באקוסיסטם של GCP", "Flash: כ-$0.10 קלט / $0.40 פלט"],
    ["Claude דרך Anthropic API", "פתיחת חשבון ב-Anthropic Console + טעינת קרדיט; מפתח API", "כשרוצים את מודלי Claude ישירות; פשוט להתחלה", "Haiku: כ-$1 / $5 · Sonnet: כ-$3 / $15 · Opus: גבוה יותר"],
    ["Claude דרך Vertex AI / AWS Bedrock", "הפעלה ב-Model Garden/Bedrock (לעיתים דורש אישור/entitlement)", "כשרוצים Claude בתוך תשתית הענן הקיימת", "דומה ל-Anthropic API (לפי צריכה)"]
  ],
  [24, 30, 24, 22]
));
body.push(SP());
body.push(P([{ text: "הערה לגבי Claude: ", bold: true }, { text: "אין עלות רישוי קבועה — משלמים רק על שימוש. למשימה זו (חילוץ מבנה JSON) מספיק מודל קטן וזול (Haiku); לניתוח עומק איכותי כדאי מודל חזק יותר (Sonnet). הפעלת Prompt Caching על \"ספר ההוראות\" מקטינה משמעותית את העלות החוזרת." }]));

body.push(H2("6.3 הערכת עלות חודשית"));
body.push(tbl(
  ["רכיב", "POC (כ-1,000 שאלות/חודש)", "פרודקשן (כ-20,000 שאלות/חודש)"],
  [
    ["מודל שפה (LLM)", "כ-$5–$30", "כ-$100–$600 (תלוי במודל ובמצב ניתוח)"],
    ["Cloud Run", "כ-$0–$5 (scale-to-zero)", "כ-$10–$50"],
    ["Cloud Build + Artifact Registry", "כ-$0–$2", "כ-$2–$5"],
    ["אבטחה (LB + Cloud Armor)", "לא נדרש", "כ-$20–$40"],
    ["Qlik Cloud", "תנאי מקדים (קיים בארגון)", "תנאי מקדים (קיים בארגון)"],
    ["סה\"כ מעבר ל-Qlik", "עשרות ₪/$ בודדים בחודש", "מאות ₪/$ בחודש"]
  ],
  [30, 35, 35]
));
body.push(SP());
body.push(H2("6.4 דגשי חיסכון"));
body.push(Bullet("מנוע Qlik מבצע את החישוב — אין עלות חישוב/BigQuery בזמן השאלה."));
body.push(Bullet("Cloud Run יורד לאפס כשאין תעבורה — אין תשלום על זמן סרק."));
body.push(Bullet("Prompt Caching חוסך כ-90% מעלות ה-LLM על החלק הקבוע של ההנחיה."));
body.push(Bullet("מודל \"Flash/Haiku\" זול מספיק לתרגום; שומרים מודל חזק לניתוח בלבד."));

// 7. Setup steps
body.push(H1("7. צעדי הקמה (תמצית)"));
body.push(Bullet("הקמת חשבון GCP ופרויקט; הפעלת Vertex AI / חיבור ספק LLM."));
body.push(Bullet("פיתוח ה-Backend (Node/Express) עם \"ספר הוראות\" לכל אפליקציה — מבוסס על הסכימה האמיתית."));
body.push(Bullet("פריסת ה-Backend ל-Cloud Run; הגדרת טוקן, CORS ו-Rate-Limit."));
body.push(Bullet("בניית ה-Extension (קובץ ZIP) והעלאתו ל-Qlik; הוספת כתובת ה-Backend ל-CSP."));
body.push(Bullet("אימות כל מדד/חתך מול הנתונים החיים לפני העלאה למשתמשים."));
body.push(Bullet("לפרודקשן: שדרוג אבטחה (מסלול B) והגדרת תקרת עלות/שימוש."));

// 8. Summary
body.push(H1("8. סיכום והמלצות"));
body.push(P("המערכת מספקת תשאול חופשי וניתוח עומק על דשבורדים קיימים, בעלות נמוכה, תוך שמירה על אבטחת הנתונים של Qlik. ההמלצה: להמשיך עם מודל \"Flash/Haiku\" לתשאול ומודל חזק יותר לניתוח; לפתוח למשתמשים בקהל מבוקר תחילה (מסלול A), ולשדרג אבטחה (מסלול B) לפני חשיפה רחבה. הרחבות עתידיות: תמיכה במדדי הספירה (משפחה ב') וחיזוי סדרות-זמן."));
body.push(SP());
body.push(P([{ text: "כתב ויתור: ", bold: true }, { text: "המחירים משוערים ולסדר גודל בלבד; יש לאמת מול תמחור עדכני של Qlik, Google Cloud ו-Anthropic.", italics: true, color: "888888" }]));

// ── build ────────────────────────────────────────────────────────────
const doc = new Document({
  styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
  sections: [{ properties: {}, children: body }]
});

const outPath = path.join(__dirname, "..", "מסמך_ארכיטקטורה_ועלויות_Qlik_Chatbot.docx");
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log("WROTE:", outPath, "(" + buf.length + " bytes)");
});