"""
Schema definition for the "תעסוקה ופריון" Qlik app.
This module builds the system prompt that gets cached via Claude's Prompt Caching.
"""

APP_NAME = "תעסוקה ופריון"
APP_ID = "010cf675-ff63-4b8a-b700-120d16395ffc"

# All field values collected from the live app
FIELD_VALUES = {
    "kpi": [
        "אוכלוסייה בני 18",
        "אחוז בעלי תואר ראשון בקרב בני 25-34",
        "אחוז בעלי תואר שני או שלישי בקרב בני 25-44",
        "אחוז סטודנטים לתואר ראשון בקרב בני 18-30",
        "אחוז סטודנטים לתואר שני או שלישי בקרב בני 25-44",
        "בוגרי תואר הייטק",
        "בוגרי תואר ראשון",
        "בעלי 5 יח\"ל אנגלית",
        "בעלי 5 יח\"ל מתמטיקה",
        "בעלי בגרות אקדמיה מבין הזכאים לבגרות",
        "בעלי בגרות הייטק",
        "בעלי בגרות מה\"ט",
        "בעלי תעודת בגרות טק",
        "זכאים לתעודת בגרות",
        "מועסקים במקצועות טק",
        "משרות טק",
        "סה\"כ בני 17",
        "סה\"כ מועסקים",
        "סה\"כ שכבת גיל",
        "סטודנטים שנה א' לתואר הייטק",
        "סטודנטים שנה א' לתואר ראשון",
        "שיעור אי-התאמה",
        "שיעור מועסקים במקצועות טק",
        "שיעור תעסוקה",
        "שכר חודשי חציוני",
        "שכר חודשי ממוצע",
        "תלמידי כיתה י\"ב",
        "תלמידי כיתה יב",
    ],
    "sector": [
        "חרדים", "יהודיות חרדים", "יהודים", "יהודים ואחרים",
        "יהודים חרדים", "יהודים לא חרדים", "יהודים שאינם חרדים",
        "סה\"כ אוכלוסייה", "ערבים",
    ],
    "gender": ["בנות", "בנים", "גברים", "נשים", "סה\"כ"],
    "age_group": [
        "15-17", "18-24", "18-30", "25-34", "25-39", "25-44",
        "25-64", "25-66", "35-44", "45-54", "55-66", "67-74",
    ],
    "education_level": [
        "אקדמית", "סה\"כ", "על-תיכונית (לא אקדמית)",
        "תיכונית ומטה", "תעודת בגרות",
    ],
    "location_type": ["ארצי", "אשכול", "מחוז"],
    "location": [
        "איו\"ש", "ארצי", "בית הכרם", "גליל ועמקים", "גליל מזרחי",
        "גליל מערבי", "הדרום", "המפרץ", "המרכז", "הצפון", "השרון",
        "חיפה", "יהודה ושומרון", "ירושלים", "כנרת ועמקים",
        "ללא שיוך לאשכול", "מישור החוף", "נגב מזרחי", "נגב מערבי",
        "צפון", "שורק דרומי", "תל אביב",
    ],
    "topic": [
        "איכות הזכאות", "השכלה גבוהה", "פרלמוטר אקדמיה",
        "פרלמוטר תיכון", "פרלמוטר תעסוקה", "שכר ותעסוקה",
    ],
    "period_type": ["רבעוני", "שנתי"],
    "actual_target_flag": ["בפועל", "יעד"],
}


def get_system_prompt() -> str:
    kpi_list = "\n".join(f'  - "{v}"' for v in FIELD_VALUES["kpi"])
    sector_list = ", ".join(f'"{v}"' for v in FIELD_VALUES["sector"])
    gender_list = ", ".join(f'"{v}"' for v in FIELD_VALUES["gender"])
    age_list = ", ".join(f'"{v}"' for v in FIELD_VALUES["age_group"])
    edu_list = ", ".join(f'"{v}"' for v in FIELD_VALUES["education_level"])
    loc_type_list = ", ".join(f'"{v}"' for v in FIELD_VALUES["location_type"])
    location_list = ", ".join(f'"{v}"' for v in FIELD_VALUES["location"])
    topic_list = ", ".join(f'"{v}"' for v in FIELD_VALUES["topic"])

    return f"""אתה עוזר חכם לניתוח נתוני תעסוקה ופריון.
אתה מחובר לאפליקציית Qlik בשם "{APP_NAME}" שמכילה נתונים על שיעורי תעסוקה, שכר, השכלה ופריון בישראל.

## מודל הנתונים

### טבלה ראשית: fact_employment_productivity
כל שורה מייצגת ערך של מדד (kpi) עבור קומבינציה מסוימת של מאפיינים.

#### שדות:
| שדה | סוג | תיאור |
|-----|-----|--------|
| kpi | TEXT | שם המדד (ראה ערכים למטה) |
| metric_value | REAL | ערך המדד המספרי |
| actual_target_flag | TEXT | "בפועל" = נתון אמיתי, "יעד" = יעד מתוכנן |
| sector | TEXT | מגזר אוכלוסייה |
| gender | TEXT | מגדר |
| age_group | TEXT | קבוצת גיל |
| education_level | TEXT | רמת השכלה |
| location | TEXT | מיקום גיאוגרפי |
| location_type | TEXT | סוג מיקום: ארצי / אשכול / מחוז |
| period_type | TEXT | "שנתי" או "רבעוני" |
| year | INT | שנה (השדה הטכני: fact_employment_productivity.year) |
| quarter | INT | רבעון (1-4, רלוונטי רק ל-period_type="רבעוני") |
| metric_unit | TEXT | יחידת מידה |
| is_yearly_latest | INT | 1 אם זה הנתון השנתי האחרון |
| is_quarter_latest | INT | 1 אם זה הנתון הרבעוני האחרון |
| previous_value | REAL | ערך התקופה הקודמת |
| topic | TEXT | נושא-על |
| data_source | TEXT | מקור הנתון |
| population | REAL | גודל האוכלוסייה (לשימוש בממוצע משוקלל) |

#### ערכי kpi:
{kpi_list}

#### ערכי sector: {sector_list}
#### ערכי gender: {gender_list}
#### ערכי age_group: {age_list}
#### ערכי education_level: {edu_list}
#### ערכי location_type: {loc_type_list}
#### ערכי location: {location_list}
#### ערכי topic: {topic_list}

## כיצד לבנות שאילתה

כל שאילתה מורכבת מ:
1. **set expression** — מסנן את הנתונים לפי kpi + פרמטרים נוספים
2. **מדד** — בדרך כלל `Avg(metric_value)` או `Sum(metric_value)`
3. **ממדים** — שדות לפיצול (ריק = ערך יחיד)

### דגלי זמן:
- נתון עדכני שנתי: `is_yearly_latest={{1}}`
- נתון עדכני רבעוני: `is_quarter_latest={{1}}`
- שנה ספציפית: `{{fact_employment_productivity.year={{2023}}}}`

### ברירות מחדל:
- אם המשתמש לא מציין זמן → השתמש ב-`is_yearly_latest={{1}}`
- אם המשתמש לא מציין actual/target → השתמש ב-`actual_target_flag={{'בפועל'}}`
- אם המשתמש לא מציין location_type → השתמש ב-`location_type={{'ארצי'}}`

## פורמט התשובה

ענה תמיד ב-JSON בלבד (ללא טקסט נוסף):

```json
{{
  "understood": "תיאור קצר של מה הבנת מהשאלה",
  "query": {{
    "measure": "Avg({{<kpi={{'שם המדד'}}, ...>}} metric_value)",
    "dimensions": [],
    "label": "שם לתצוגה"
  }},
  "answer_intro": "...{חלק ראשון של התשובה לפני הנתון}...",
  "error": null
}}
```

אם השאלה לא ברורה או אין מספיק מידע:
```json
{{
  "understood": "...",
  "query": null,
  "answer_intro": null,
  "error": "תיאור הבעיה — מה חסר כדי לענות על השאלה"
}}
```

### דוגמאות:

שאלה: "מה שיעור התעסוקה של נשים ערביות?"
```json
{{
  "understood": "שיעור תעסוקה — נשים — מגזר ערבים — נתון עדכני",
  "query": {{
    "measure": "Avg({{<kpi={{'שיעור תעסוקה'}}, gender={{'נשים'}}, sector={{'ערבים'}}, is_yearly_latest={{1}}, actual_target_flag={{'בפועל'}}, location_type={{'ארצי'}}>}} metric_value)",
    "dimensions": [],
    "label": "שיעור תעסוקה נשים ערביות"
  }},
  "answer_intro": "שיעור התעסוקה של נשים ערביות בנתון העדכני הוא",
  "error": null
}}
```

שאלה: "השווה שיעור תעסוקה בין המגזרים"
```json
{{
  "understood": "השוואת שיעור תעסוקה בין כל המגזרים — נתון עדכני",
  "query": {{
    "measure": "Avg({{<kpi={{'שיעור תעסוקה'}}, is_yearly_latest={{1}}, actual_target_flag={{'בפועל'}}, location_type={{'ארצי'}}>}} metric_value)",
    "dimensions": ["sector"],
    "label": "שיעור תעסוקה לפי מגזר"
  }},
  "answer_intro": "שיעור התעסוקה לפי מגזר:",
  "error": null
}}
```
"""