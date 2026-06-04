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

            // Header
            const header = document.createElement("div");
            header.style.cssText = `
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;
            header.innerHTML = "<h2 style='margin: 0; font-size: 18px;'>💬 שאל את הנתונים</h2>";

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
            function runCube(measureExpr, dimensions, measureLabel) {
                const dims = dimensions || [];
                const hasTime = dims.some(isTimeDim);
                const qDimensions = dims.map(d => ({
                    qDef: { qFieldDefs: [d.field], qSortCriterias: [{ qSortByNumeric: 1, qSortByAscii: 1 }] },
                    qLabel: d.label
                }));
                const qMeasures = [{ qDef: { qDef: measureExpr, qSortBy: { qSortByNumeric: -1 } }, qLabel: measureLabel }];
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

            // Render a native Qlik chart into a fresh bubble.
            function renderChart(chartType, dimensions, measureExpr, measureLabel) {
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

                const cols = [];
                (dimensions || []).forEach(d => cols.push({ qDef: { qFieldDefs: [d.field] }, qLabel: d.label }));
                cols.push({ qDef: { qDef: measureExpr }, qLabel: measureLabel });
                qApp.visualization.create(chartType, cols, {})
                    .then(v => v.show(chartId))
                    .catch(e => addMessage("⚠️ לא ניתן לצייר גרף: " + (e && e.message ? e.message : e)));
            }

            // Build an HTML table string from columns + rows.
            function tableHtml(columns, rows, sizeY, maxRows) {
                const limit = maxRows || 10;
                let html = '<table style="width:100%; border-collapse:collapse; font-size:12px;"><tr style="background:#f5f5f5;">';
                columns.forEach(c => html += `<th style="padding:8px; text-align:right; border-bottom:1px solid #ddd; font-weight:600;">${escapeHtml(c)}</th>`);
                html += "</tr>";
                rows.slice(0, limit).forEach(r => {
                    html += "<tr>";
                    r.forEach(v => html += `<td style="padding:8px; text-align:right; border-bottom:1px solid #f0f0f0;">${escapeHtml(v)}</td>`);
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
                        res = await runCube(q.measure.expression, q.dimensions || [], q.measure.label || "");
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

            // Run a single query (lookup mode): chart, table, or "no data".
            async function runQuery(query) {
                addMessage("📊 " + (query.interpretation || "מעבד..."));
                const measureExpr = injectFilters(query.measure.expression, query.filters);
                if (query.filters && query.filters.length) {
                    addMessage("🔎 סינון: " + query.filters.map(f => f.field + " = " + f.value).join(", "));
                }
                const res = await runCube(measureExpr, query.dimensions || [], query.measure.label);
                const wantChart = query.chart && query.chart !== "table" && (query.dimensions || []).length >= 1;
                if (!res.hasData) {
                    addMessage("ℹ️ לא נמצאו נתונים לשאלה זו (ייתכן שאין נתונים, או שהסינון/התאריך מצמצם הכל)");
                } else if (wantChart) {
                    renderChart(query.chart, query.dimensions, measureExpr, query.measure.label);
                } else {
                    addPanel(tableHtml(res.columns, res.rows, res.sizeY, 10));
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
                        body: JSON.stringify({ question: question, app_id: appId })
                    });

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.error || "Backend error");
                    }

                    const query = (await response.json()).query;
                    if (!query) { addMessage("❌ Invalid response from backend"); return; }

                    // Analysis mode → two-step flow.
                    if (query.mode === "analysis" && Array.isArray(query.queries) && query.queries.length) {
                        await runAnalysis(question, query);
                        return;
                    }

                    // Lookup mode. A null measure with a note = supported-but-not-yet-implemented.
                    if (!query.measure) {
                        addMessage(query.note ? "ℹ️ " + query.note : "❌ Invalid response from backend");
                        return;
                    }
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

            // Welcome message (app-aware)
            addMessage(ui.welcome);
        }
    };
});