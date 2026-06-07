/**
 * Qlik Chatbot Extension - Standalone (No jQuery)
 */

define(["qlik"], function(qlik) {
    return {
        definition: {
            type: "object",
            component: "my-component",
            label: "💬 שאל את הנתונים",
            defaultWidth: 500,
            defaultHeight: 600,
            properties: {}
        },

        paint: function($element, layout) {
            // Cloud Run (GCP + Gemini). Previous: https://qlik-chatbot-backend.onrender.com
            const backendUrl = "https://qlik-chatbot-backend-81682902305.us-central1.run.app";
            const backendToken = "1c7f3347091a0bc25acefb3cb3b383edcf6b490faf9284f6";
            // Auto-detect the app this extension is embedded in, so the SAME .zip
            // works on every app. The backend picks the matching schema by app_id.
            const qApp = qlik.currApp(this);
            const appId = qApp.id;

            // Per-app UI text (placeholder + welcome). Falls back to a generic prompt
            // so a brand-new app still shows something sensible.
            const UI_BY_APP = {
                "872ce203-b200-48ef-9582-4f7399299684": {
                    placeholder: "כמה מפונים יש בכל ישוב?",
                    welcome: "👋 שלום! שאלו אותי על נתוני החירום — מפונים, נפגעים, הרוגים, התרעות. אפשר לפי יישוב/מחוז וגם בגרף."
                },
                "010cf675-ff63-4b8a-b700-120d16395ffc": {
                    placeholder: "מה שיעור התעסוקה של נשים ערביות?",
                    welcome: "👋 שלום! שאלו אותי על תעסוקה ופריון — שיעורי תעסוקה, שכר, השכלה ותעסוקת טק, לפי מגזר/מגדר/גיל/אזור או לאורך השנים. אפשר גם לשאול שאלות ניתוח כמו \"מה השפיע על שיעור התעסוקה ב-2020?\""
                }
            };
            const ui = UI_BY_APP[appId] || {
                placeholder: "שאלו שאלה על הנתונים…",
                welcome: "👋 שלום! שאלו אותי שאלה בעברית על הנתונים."
            };

            // Clear element
            $element.empty();

            // Create container
            const container = document.createElement("div");
            container.style.cssText = `
                display: flex;
                flex-direction: column;
                height: 100%;
                background: #f5f5f5;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                direction: rtl;
            `;

            // Header (title + "new conversation" reset button)
            const header = document.createElement("div");
            header.style.cssText = `
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                display: flex; align-items: center; justify-content: space-between;
            `;
            const headerTitle = document.createElement("h2");
            headerTitle.style.cssText = "margin:0; font-size:18px;";
            headerTitle.textContent = "💬 שאל את הנתונים";
            const resetBtn = document.createElement("button");
            resetBtn.textContent = "🔄 שיחה חדשה";
            resetBtn.style.cssText = "background:rgba(255,255,255,0.2); color:white; border:1px solid rgba(255,255,255,0.45); border-radius:6px; padding:5px 10px; cursor:pointer; font-size:12px; font-family:inherit; white-space:nowrap;";
            header.appendChild(headerTitle);
            header.appendChild(resetBtn);

            // Messages area
            const messagesDiv = document.createElement("div");
            messagesDiv.id = "chatMessages";
            messagesDiv.style.cssText = `
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            `;

            // Input area
            const inputArea = document.createElement("div");
            inputArea.style.cssText = `
                display: flex;
                gap: 8px;
                padding: 16px;
                background: white;
                border-top: 1px solid #e0e0e0;
            `;

            const input = document.createElement("input");
            input.id = "userInput";
            input.type = "text";
            input.placeholder = ui.placeholder;
            input.style.cssText = `
                flex: 1;
                padding: 10px 12px;
                border: 1px solid #ddd;
                border-radius: 6px;
                font-size: 14px;
                font-family: inherit;
            `;

            const button = document.createElement("button");
            button.id = "sendBtn";
            button.textContent = "שלח";
            button.style.cssText = `
                padding: 10px 20px;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                white-space: nowrap;
            `;

            inputArea.appendChild(input);
            inputArea.appendChild(button);

            container.appendChild(header);
            container.appendChild(messagesDiv);
            container.appendChild(inputArea);

            $element.append(container);

            // State
            let isLoading = false;
            // Client-side conversation memory (this session only). Each entry holds the
            // user's question + a compact description of the query that was built, so a
            // follow-up ("ורק לנשים", "ולמה ירד?") can be resolved against prior context.
            let history = [];

            // Prepend recent conversation context to a question (follow-up support).
            function buildContextualQuestion(q) {
                if (!history.length) return q;
                const recent = history.slice(-4);
                let ctx = "הקשר השיחה עד כה (השתמש בו רק אם השאלה הנוכחית היא המשך/חידוד של הקודמת; אחרת התעלם):\n";
                recent.forEach(function(h) {
                    ctx += '- שאלה: "' + h.question + '"' + (h.detail ? "  [" + h.detail + "]" : "") + "\n";
                });
                ctx += '\nהשאלה הנוכחית: "' + q + '"\n';
                ctx += "אם זו שאלת המשך — בנה את השאילתה על בסיס הקודמת ושנה רק את מה שהשתנה. החזר JSON כרגיל.";
                return ctx;
            }

            // Compact one-line description of a resolved query (for the context block).
            function summarizeQuery(query) {
                if (!query) return "";
                if (query.mode === "analysis") return "ניתוח: " + (query.plan_intro || query.interpretation || "");
                const parts = [];
                if (query.interpretation) parts.push(query.interpretation);
                if (query.measure && query.measure.expression) parts.push("measure=" + query.measure.expression);
                if (query.dimensions && query.dimensions.length) parts.push("dims=" + query.dimensions.map(function(d){return d.field;}).join(","));
                if (query.chart) parts.push("chart=" + query.chart);
                return parts.join(" | ");
            }

            // ── UI helpers ───────────────────────────────────────────────────
            function escapeHtml(s) {
                return String(s == null ? "" : s)
                    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }

            // A standard chat bubble (right = user, left = bot).
            function addMessage(text, isUser = false) {
                const msg = document.createElement("div");
                msg.style.cssText = `display:flex; justify-content:${isUser ? "flex-end" : "flex-start"}; margin-bottom:8px;`;
                const content = document.createElement("div");
                content.style.cssText = `
                    max-width: 80%;
                    background: ${isUser ? "#667eea" : "white"};
                    color: ${isUser ? "white" : "#333"};
                    padding: 12px 16px; border-radius: 8px; word-wrap: break-word;
                    line-height: 1.4; font-size: 14px;
                    ${isUser ? "" : "border: 1px solid #e0e0e0;"}`;
                content.innerHTML = text;
                msg.appendChild(content);
                messagesDiv.appendChild(msg);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }

            // A wide, chrome-less left-aligned panel (for cards / tables / charts).
            function addPanel(node) {
                const msg = document.createElement("div");
                msg.style.cssText = "display:flex; justify-content:flex-start; margin-bottom:8px;";
                const box = document.createElement("div");
                box.style.cssText = "width:94%;";
                if (typeof node === "string") box.innerHTML = node; else box.appendChild(node);
                msg.appendChild(box);
                messagesDiv.appendChild(msg);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
                return box;
            }

            // ── Qlik query helpers ───────────────────────────────────────────
            const isTimeDim = (d) =>
                /year|quarter|month|date/i.test(d.field) || /שנה|רבעון|חודש|תאריך/.test(d.label || "");

            // Make a measure independent of the user's current selections in the Qlik
            // sheet, by switching the set identifier to "1" (all records). Without this,
            // a stray selection (e.g. a year or gender filter the user clicked) silently
            // constrains every answer — empty results / truncated trends.
            function ignoreSelections(expr) {
                if (!expr) return expr;
                if (expr.indexOf("{<") !== -1) return expr.replace(/\{</g, "{1<");
                if (expr.indexOf("{1<") !== -1 || expr.indexOf("{1}") !== -1) return expr;
                // no set modifier → add one that ignores selections
                return expr.replace("(", "({1} ");
            }

            // Bake query.filters into a measure expression as set analysis (query mode only).
            function injectFilters(expr, filters) {
                if (!filters || !filters.length) return expr;
                const setStr = filters.map(f => {
                    const v = String(f.value).replace(/['"]/g, "");
                    return f.match === "exact"
                        ? f.field + "={'" + v + "'}"
                        : f.field + '={"*' + v + '*"}';
                }).join(",");
                return expr.indexOf("{<") !== -1
                    ? expr.replace("{<", "{<" + setStr + ", ")
                    : expr.replace("(", "({<" + setStr + ">} ");
            }

            // Minimum dimensions/measures each chart type needs to render properly.
            const CHART_REQS = {
                barchart: { d: 1, m: 1 }, linechart: { d: 1, m: 1 }, piechart: { d: 1, m: 1 },
                treemap: { d: 1, m: 1 }, waterfallchart: { d: 1, m: 1 }, "pivot-table": { d: 1, m: 1 },
                distributionplot: { d: 1, m: 1 }, boxplot: { d: 1, m: 1 }, histogram: { d: 1, m: 0 },
                heatmap: { d: 2, m: 1 }, combochart: { d: 1, m: 2 }, scatterplot: { d: 0, m: 2 },
                kpi: { d: 0, m: 1 }, gauge: { d: 0, m: 1 }, table: { d: 0, m: 0 }
            };
            function chartFits(type, nDims, nMeas) {
                const r = CHART_REQS[type];
                if (!r) return true;
                return nDims >= r.d && nMeas >= r.m;
            }
            // Qlik number format for a measure, by unit hint.
            function numFmtFor(unit) {
                if (unit === "percent") return { qType: "F", qFmt: "#,##0.0", qDec: ".", qThou: "," };
                if (unit === "currency") return { qType: "F", qFmt: "#,##0", qDec: ".", qThou: "," };
                return { qType: "F", qFmt: "#,##0.##", qDec: ".", qThou: "," };
            }
            function unitSuffix(unit) { return unit === "percent" ? "%" : (unit === "currency" ? " ₪" : ""); }

            // Convert a hypercube into a simple {hasData, columns, rows, sizeY}.
            function cubeToResult(hc) {
                const empty = { hasData: false, columns: [], rows: [], sizeY: 0 };
                if (!hc || !hc.qDataPages || !hc.qDataPages.length) return empty;
                const matrix = hc.qDataPages[0].qMatrix;
                if (!matrix || !matrix.length) return empty;
                const columns = [];
                (hc.qDimensionInfo || []).forEach(d => columns.push(d.qFallbackTitle || d.qLabel || d.qName));
                (hc.qMeasureInfo || []).forEach(m => columns.push(m.qFallbackTitle || m.qLabel || m.qName));
                const rows = [];
                hc.qDataPages.forEach(p => (p.qMatrix || []).forEach(r =>
                    rows.push(r.map(c => (c.qText !== undefined && c.qText !== "" ? c.qText
                        : (c.qNum !== undefined && c.qNum !== "NaN" ? c.qNum : ""))))
                ));
                return { hasData: true, columns, rows, sizeY: (hc.qSize ? hc.qSize.qcy : rows.length) };
            }

            // Run one hypercube; resolves with cubeToResult(...). Time dims sort ascending
            // by value; categorical dims sort by the measure (descending).
            function runCube(measureExpr, dimensions, measureLabel, unit) {
                const dims = dimensions || [];
                const hasTime = dims.some(isTimeDim);
                const qDimensions = dims.map(d => ({
                    qDef: { qFieldDefs: [d.field], qFieldLabels: [d.label], qSortCriterias: [{ qSortByNumeric: 1, qSortByAscii: 1 }] },
                    qLabel: d.label
                }));
                const qMeasures = [{ qDef: { qDef: measureExpr, qLabel: measureLabel, qSortBy: { qSortByNumeric: -1 }, qNumFormat: numFmtFor(unit) }, qLabel: measureLabel }];
                const nDims = qDimensions.length;
                let order = [];
                if (nDims === 0 || hasTime) { for (let i = 0; i <= nDims; i++) order.push(i); }
                else { order = [nDims]; for (let i = 0; i < nDims; i++) order.push(i); }

                return new Promise((resolve) => {
                    let resolved = false, lastCube = null;
                    const finish = (cube) => { if (!resolved) { resolved = true; resolve(cubeToResult(cube)); } };
                    qApp.createCube({
                        qDimensions: qDimensions,
                        qMeasures: qMeasures,
                        qInterColumnSortOrder: order,
                        qSuppressZero: false,
                        qInitialDataFetch: [{ qHeight: 50, qWidth: nDims + 1 }]
                    }, function(reply) {
                        if (resolved || !reply || !reply.qHyperCube) return;
                        lastCube = reply.qHyperCube;
                        const pages = reply.qHyperCube.qDataPages;
                        if (pages && pages.length && pages[0].qMatrix && pages[0].qMatrix.length) finish(reply.qHyperCube);
                    });
                    setTimeout(() => finish(lastCube), 8000);
                });
            }

            // Render a native Qlik chart into a fresh bubble. Supports any Qlik
            // visualization type; if the type doesn't fit the data, it removes the
            // empty chart and falls back to a table (using the already-fetched res).
            function renderChart(chartType, dimensions, measureExpr, measureLabel, res, unit) {
                const chartId = "chart_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
                const box = document.createElement("div");
                box.style.cssText = "background:white; border:1px solid #e0e0e0; border-radius:8px; padding:8px; width:92%;";
                const chartDiv = document.createElement("div");
                chartDiv.id = chartId;
                chartDiv.style.cssText = "width:100%; height:300px;";
                box.appendChild(chartDiv);
                const wrap = document.createElement("div");
                wrap.style.cssText = "display:flex; justify-content:flex-start; margin-bottom:8px;";
                wrap.appendChild(box);
                messagesDiv.appendChild(wrap);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;

                // Clean labels: friendly axis title (qFieldLabels) + a measure label that
                // carries the unit, plus a number format — so no raw field names or raw
                // expressions leak into the axis/tooltip.
                const dims = dimensions || [];
                const mLabel = measureLabel + (unit === "percent" ? " (%)" : unit === "currency" ? " (₪)" : "");
                const cols = [];
                dims.forEach(d => cols.push({ qDef: { qFieldDefs: [d.field], qFieldLabels: [d.label] }, qLabel: d.label }));
                cols.push({ qDef: { qDef: measureExpr, qLabel: mLabel, qNumFormat: numFmtFor(unit) }, qLabel: mLabel });
                qApp.visualization.create(chartType, cols, {})
                    .then(v => v.show(chartId))
                    .catch(e => {
                        wrap.remove();
                        addMessage("⚠️ סוג התצוגה \"" + chartType + "\" לא מתאים לנתונים האלה — מציג טבלה במקום.");
                        if (res && res.hasData) addPanel(tableHtml(res.columns, res.rows, res.sizeY, 10, { nDims: dims.length, unit: unit }));
                    });
            }

            // Build an HTML table string. opts.nDims marks how many leading columns are
            // dimensions; opts.unit appends % / ₪ to the measure columns (the rest).
            function tableHtml(columns, rows, sizeY, maxRows, opts) {
                const limit = maxRows || 10;
                const nDims = opts && opts.nDims != null ? opts.nDims : -1;
                const sfx = opts && opts.unit ? unitSuffix(opts.unit) : "";
                let html = '<table style="width:100%; border-collapse:collapse; font-size:12px;"><tr style="background:#f5f5f5;">';
                columns.forEach(c => html += `<th style="padding:8px; text-align:right; border-bottom:1px solid #ddd; font-weight:600;">${escapeHtml(c)}</th>`);
                html += "</tr>";
                rows.slice(0, limit).forEach(r => {
                    html += "<tr>";
                    r.forEach((v, ci) => {
                        let cell = escapeHtml(v);
                        if (sfx && nDims >= 0 && ci >= nDims && v !== "" && v != null) cell += sfx;
                        html += `<td style="padding:8px; text-align:right; border-bottom:1px solid #f0f0f0;">${cell}</td>`;
                    });
                    html += "</tr>";
                });
                html += "</table>";
                if (sizeY > limit) html += `<small style="color:#999;">... עוד ${sizeY - limit} שורות</small>`;
                return html;
            }

            // ── Analysis (two-step) rendering ────────────────────────────────
            function renderAnalysisCard(a) {
                const findings = Array.isArray(a.findings) ? a.findings : [];
                let html = `<div style="background:#fff; border:1px solid #e6e6ef; border-right:4px solid #764ba2;
                    border-radius:10px; padding:16px 18px; box-shadow:0 2px 8px rgba(80,60,140,0.08);">`;
                html += `<div style="font-size:15px; font-weight:700; color:#2d2150; margin-bottom:8px;">
                    📊 ${escapeHtml(a.headline || "ניתוח")}</div>`;
                if (a.summary)
                    html += `<div style="font-size:13px; color:#444; line-height:1.6; margin-bottom:${findings.length ? "12px" : "0"};">${escapeHtml(a.summary)}</div>`;
                findings.forEach((f, i) => {
                    html += `<div style="display:flex; gap:10px; align-items:flex-start; padding:8px 0; border-top:1px solid #f0eef7;">
                        <span style="flex:0 0 22px; height:22px; line-height:22px; text-align:center; border-radius:50%;
                            background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; font-size:12px; font-weight:700;">${i + 1}</span>
                        <div style="flex:1;">
                            <div style="font-size:13px; font-weight:600; color:#222;">${escapeHtml(f.point)}</div>
                            ${f.evidence ? `<div style="font-size:11px; color:#7a7a8c; margin-top:2px;">${escapeHtml(f.evidence)}</div>` : ""}
                        </div></div>`;
                });
                if (a.caveat)
                    html += `<div style="margin-top:12px; padding-top:10px; border-top:1px solid #f0eef7;
                        font-size:11px; color:#999; font-style:italic;">ℹ️ ${escapeHtml(a.caveat)}</div>`;
                html += "</div>";
                addPanel(html);
            }

            // Collapsible "supporting data" section with each cut as a small table.
            function renderSupporting(items) {
                const withData = items.filter(it => it.res && it.res.hasData);
                if (!withData.length) return;
                let html = `<details style="background:#fafafe; border:1px solid #ececf5; border-radius:8px; padding:8px 12px;">
                    <summary style="cursor:pointer; font-size:12px; font-weight:600; color:#555;">📂 נתונים תומכים (${withData.length} חתכים)</summary>`;
                withData.forEach(it => {
                    html += `<div style="margin-top:12px;">
                        <div style="font-size:12px; font-weight:600; color:#444; margin-bottom:4px;">${escapeHtml(it.label)}</div>
                        ${tableHtml(it.res.columns, it.res.rows, it.res.sizeY, 14)}</div>`;
                });
                html += "</details>";
                addPanel(html);
            }

            // Run the planned cuts, then ask the backend to interpret the real numbers.
            async function runAnalysis(question, plan) {
                addMessage("🔍 " + (plan.plan_intro || plan.interpretation || "מנתח את הנתונים..."));

                const queries = Array.isArray(plan.queries) ? plan.queries : [];
                const results = [];   // sent to /interpret
                const items = [];     // for the supporting-data panel
                for (const q of queries) {
                    if (!q.measure || !q.measure.expression) continue;
                    const label = q.label || (q.measure.label || "");
                    let res;
                    try {
                        res = await runCube(ignoreSelections(q.measure.expression), q.dimensions || [], q.measure.label || "");
                    } catch (e) {
                        res = { hasData: false, columns: [], rows: [], sizeY: 0 };
                    }
                    results.push({ label: label, columns: res.columns, rows: res.rows });
                    items.push({ label: label, res: res });
                }

                if (!results.some(r => r.rows && r.rows.length)) {
                    addMessage("ℹ️ לא נמצאו נתונים לניתוח הזה.");
                    return;
                }

                let analysis = null;
                try {
                    const resp = await fetch(backendUrl + "/interpret", {
                        method: "POST", mode: "cors", credentials: "omit",
                        headers: { "Content-Type": "application/json", "X-Backend-Token": backendToken },
                        body: JSON.stringify({ question: question, app_id: appId, results: results })
                    });
                    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || "interpret error"); }
                    analysis = (await resp.json()).analysis;
                } catch (e) {
                    addMessage("⚠️ הניתוח נכשל: " + e.message);
                }

                if (analysis) renderAnalysisCard(analysis);
                renderSupporting(items);
            }

            // Run a single query (lookup mode). The MODEL decides the output format
            // via query.chart (table or a specific chart); we just render it, with a
            // graceful fallback to a table if the chosen chart doesn't fit the data.
            async function runQuery(query) {
                addMessage("📊 " + (query.interpretation || "מעבד..."));
                const measureExpr = ignoreSelections(injectFilters(query.measure.expression, query.filters));
                if (query.filters && query.filters.length) {
                    addMessage("🔎 סינון: " + query.filters.map(f => f.field + " = " + f.value).join(", "));
                }
                const dims = query.dimensions || [];
                const unit = query.unit;
                const res = await runCube(measureExpr, dims, query.measure.label, unit);
                if (!res.hasData) {
                    addMessage("ℹ️ לא נמצאו נתונים לשאלה זו (ייתכן שאין נתונים, או שהסינון/התאריך מצמצם הכל)");
                    return;
                }
                const tblOpts = { nDims: dims.length, unit: unit };
                const chart = query.chart || "table";
                // Only draw a chart that actually fits the result shape; otherwise table.
                if (chart !== "table" && !chartFits(chart, dims.length, 1)) {
                    addMessage("ℹ️ אי אפשר להציג את התצוגה המבוקשת לנתון הזה (חסר פילוח מתאים) — מציג כטבלה.");
                    addPanel(tableHtml(res.columns, res.rows, res.sizeY, 10, tblOpts));
                } else if (chart === "table") {
                    addPanel(tableHtml(res.columns, res.rows, res.sizeY, 10, tblOpts));
                } else {
                    renderChart(chart, dims, measureExpr, query.measure.label, res, unit);
                }
            }

            // ── Send message (router: analysis vs lookup) ────────────────────
            async function sendMessage() {
                const question = input.value.trim();
                if (!question || isLoading) return;

                isLoading = true;
                button.disabled = true;
                button.textContent = "⏳";

                addMessage(question, true);
                input.value = "";

                try {
                    const response = await fetch(backendUrl + "/ask", {
                        method: "POST", mode: "cors", credentials: "omit",
                        headers: { "Content-Type": "application/json", "X-Backend-Token": backendToken },
                        // Send the question with recent conversation context (follow-ups).
                        body: JSON.stringify({ question: buildContextualQuestion(question), app_id: appId })
                    });

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.error || "Backend error");
                    }

                    const query = (await response.json()).query;
                    if (!query) { addMessage("❌ Invalid response from backend"); return; }

                    // Analysis mode → two-step flow.
                    if (query.mode === "analysis" && Array.isArray(query.queries) && query.queries.length) {
                        history.push({ question: question, detail: summarizeQuery(query) });
                        if (history.length > 8) history = history.slice(-8);
                        await runAnalysis(question, query);
                        return;
                    }

                    // Lookup mode. A null measure with a note = supported-but-not-yet-implemented.
                    if (!query.measure) {
                        addMessage(query.note ? "ℹ️ " + query.note : "❌ Invalid response from backend");
                        return;
                    }
                    history.push({ question: question, detail: summarizeQuery(query) });
                    if (history.length > 8) history = history.slice(-8);
                    await runQuery(query);

                } catch (error) {
                    console.error("Error:", error);
                    addMessage(`❌ ${error.message}`);
                } finally {
                    isLoading = false;
                    button.disabled = false;
                    button.textContent = "שלח";
                }
            }

            // Event listeners
            button.addEventListener("click", sendMessage);
            input.addEventListener("keypress", (e) => {
                if (e.key === "Enter") sendMessage();
            });

            // "New conversation" — clear memory + transcript, keep the format selector.
            resetBtn.addEventListener("click", () => {
                if (isLoading) return;
                history = [];
                messagesDiv.innerHTML = "";
                addMessage(ui.welcome);
            });

            // Welcome message (app-aware)
            addMessage(ui.welcome);
        }
    };
});