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
            const appId = "872ce203-b200-48ef-9582-4f7399299684";

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
            input.placeholder = "כמה מפונים יש בכל ישוב?";
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

            // Add message function
            function addMessage(text, isUser = false) {
                const msg = document.createElement("div");
                msg.style.cssText = `
                    display: flex;
                    justify-content: ${isUser ? "flex-end" : "flex-start"};
                    margin-bottom: 8px;
                `;

                const content = document.createElement("div");
                content.style.cssText = `
                    max-width: 80%;
                    background: ${isUser ? "#667eea" : "white"};
                    color: ${isUser ? "white" : "#333"};
                    padding: 12px 16px;
                    border-radius: 8px;
                    word-wrap: break-word;
                    line-height: 1.4;
                    font-size: 14px;
                    ${isUser ? "" : "border: 1px solid #e0e0e0;"}
                `;
                content.innerHTML = text;

                msg.appendChild(content);
                messagesDiv.appendChild(msg);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }

            // Send message function
            async function sendMessage() {
                const question = input.value.trim();
                if (!question || isLoading) return;

                isLoading = true;
                button.disabled = true;
                button.textContent = "⏳";

                addMessage(question, true);
                input.value = "";

                try {
                    // Call Backend (which calls Claude)
                    const response = await fetch(backendUrl + "/ask", {
                        method: "POST",
                        mode: "cors",
                        credentials: "omit",
                        headers: {
                            "Content-Type": "application/json",
                            "X-Backend-Token": backendToken
                        },
                        body: JSON.stringify({
                            question: question,
                            app_id: appId
                        })
                    });

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.error || "Backend error");
                    }

                    const result = await response.json();
                    const query = result.query;

                    // Parse JSON
                    if (!query || !query.measure) {
                        addMessage("❌ Invalid response from backend");
                        return;
                    }

                    addMessage(`📊 ${query.interpretation || "Processing..."}`);

                    // Execute Qlik query
                    if (query.measure && query.dimensions) {
                        const qApp = qlik.openApp(appId);

                        const qDimensions = query.dimensions.map(d => ({
                            qDef: { qFieldDefs: [d.field] },
                            qLabel: d.label
                        }));

                        const qMeasures = [{
                            qDef: { qDef: query.measure.expression },
                            qLabel: query.measure.label
                        }];

                        // Use Capability API createCube (returns data via callback)
                        const qHyperCube = await new Promise((resolve, reject) => {
                            let resolved = false;
                            qApp.createCube({
                                qDimensions: qDimensions,
                                qMeasures: qMeasures,
                                qInitialDataFetch: [{
                                    qHeight: 50,
                                    qWidth: qDimensions.length + qMeasures.length
                                }]
                            }, function(reply) {
                                if (resolved) return;
                                if (reply && reply.qHyperCube &&
                                    reply.qHyperCube.qDataPages &&
                                    reply.qHyperCube.qDataPages.length) {
                                    resolved = true;
                                    resolve(reply.qHyperCube);
                                }
                            });
                            // Timeout fallback
                            setTimeout(() => {
                                if (!resolved) {
                                    resolved = true;
                                    reject(new Error("Timeout - לא התקבלו נתונים"));
                                }
                            }, 15000);
                        });

                        if (qHyperCube && qHyperCube.qDataPages && qHyperCube.qDataPages.length) {
                            // Build table
                            const columns = [];
                            qHyperCube.qDimensionInfo.forEach(d =>
                                columns.push(d.qFallbackTitle || d.qLabel || d.qName)
                            );
                            qHyperCube.qMeasureInfo.forEach(m =>
                                columns.push(m.qFallbackTitle || m.qLabel || m.qName)
                            );

                            let tableHtml = `<table style="width:100%; border-collapse: collapse; font-size: 12px;">
                                <tr style="background: #f5f5f5;">`;

                            columns.forEach(col => {
                                tableHtml += `<th style="padding: 8px; text-align: right; border-bottom: 1px solid #ddd; font-weight: 600;">${col}</th>`;
                            });

                            tableHtml += `</tr>`;

                            let rowCount = 0;
                            qHyperCube.qDataPages.forEach(page => {
                                page.qMatrix.slice(0, 10).forEach(row => {
                                    tableHtml += `<tr>`;
                                    row.forEach(cell => {
                                        const val = cell.qText || (cell.qNum !== undefined ? cell.qNum : "");
                                        tableHtml += `<td style="padding: 8px; text-align: right; border-bottom: 1px solid #f0f0f0;">${val}</td>`;
                                    });
                                    tableHtml += `</tr>`;
                                    rowCount++;
                                });
                            });

                            tableHtml += `</table>`;

                            if (qHyperCube.qSize.qcy > 10) {
                                tableHtml += `<small style="color: #999;">... עוד ${qHyperCube.qSize.qcy - 10} שורות</small>`;
                            }

                            addMessage(tableHtml);
                        } else {
                            addMessage("ℹ️ לא נמצאו נתונים לשאלה זו");
                        }
                    }

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

            // Welcome message
            addMessage("👋 שלום! שאל אותי שאלה כלשהי בעברית...");
        }
    };
});