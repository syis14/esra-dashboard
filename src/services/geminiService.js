import { malaysiaLocations } from '../data/malaysiaLocations';

export async function screenWithGemini(items, apiKey, state = '', district = '') {
  if (!apiKey || items.length === 0) return items;

  let districtInstruction = "";
  if (state && district && malaysiaLocations[state]) {
    const otherDistricts = malaysiaLocations[state].filter(d => d.toLowerCase() !== district.toLowerCase());
    if (otherDistricts.length > 0) {
      districtInstruction = `- Target District Enforcement: The user is specifically monitoring "${district}" (in the state of ${state}). You MUST filter out and exclude any news articles that are explicitly and solely about other districts in ${state} (such as: ${otherDistricts.join(', ')}) unless they also explicitly mention "${district}". General state-wide news is acceptable.\n`;
    }
  }

  let promptText = "You are a Public Health Intelligence Analyst for the Ministry of Health Malaysia (KKM). Your task is to perform cross-lingual semantic deduplication and screening for Event-Based Surveillance (EBS).\n\n";
  promptText += "Here is a list of scraped news articles (in Malay, English, Chinese, and Tamil). Each has an ID.\n";
  
  items.forEach((item, index) => {
    promptText += `ID: ${index}\nTitle: ${item.title}\nSnippet: ${item.snippet || ''}\n\n`;
  });

  promptText += `Instructions:
- Read and understand all articles, translating Chinese/Tamil/English to contextually match them.
- Deduplicate identical events. If two or more articles report the exact same incident, group them together (e.g. "Three dead in crash" and "Tiga maut kemalangan").
- Filter out irrelevant news (e.g. property ads, general politics, normal business, elections, sports).
- Select and include ALL relevant EBS events (outbreaks, deaths, disasters, poisoning, disease clusters). Do not artificially limit the list count.
${districtInstruction}- Return ONLY a pure JSON array. No explanation, no markdown, just raw JSON.
For each event, return an object with:
  - "keptId": number (ID of the best article, prefer Malay/English)
  - "mergedIds": array of numbers (all duplicate article IDs, including keptId)

Output example:
[{"keptId":2,"mergedIds":[2,5]},{"keptId":0,"mergedIds":[0]}]`;

  // Cuba v1 (stable) dulu, kemudian v1beta
  const endpointsToTry = [
    // v1 stable — model terkini
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
    // v1beta — model alternatif
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
  ];

  let lastErrorMsg = '';

  for (const endpoint of endpointsToTry) {
    const modelLabel = endpoint.match(/models\/([^:]+)/)?.[1] || endpoint;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { temperature: 0.1 }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        lastErrorMsg = data.error?.message || response.statusText;
        console.warn(`[Gemini] '${modelLabel}' gagal: ${lastErrorMsg}`);
        continue;
      }

      let resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Bersihkan markdown code block jika ada
      resultText = resultText.replace(/```json/gi, '').replace(/```/gi, '').trim();
      
      const selections = JSON.parse(resultText);

      const finalItems = selections.map(sel => {
        const mainItem = items[sel.keptId];
        if (mainItem && sel.mergedIds && sel.mergedIds.length > 1) {
          const sources = new Set(
            sel.mergedIds.map(id => items[id]?.source).filter(Boolean)
          );
          mainItem.source = Array.from(sources).join(', ');
        }
        return mainItem;
      }).filter(Boolean);

      console.log(`[Gemini] ✅ Berjaya! Model: ${modelLabel}. ${finalItems.length} berita dipilih.`);
      return { success: true, data: finalItems, modelUsed: modelLabel };

    } catch (error) {
      console.error(`[Gemini] Exception '${modelLabel}':`, error);
      lastErrorMsg = error.message;
    }
  }

  return { success: false, error: `Semua model gagal. Ralat terakhir: ${lastErrorMsg}\n\nSila semak bahawa API Key anda dibenarkan untuk Gemini API di Google AI Studio.` };
}

export async function testGeminiApiKey(apiKey) {
  if (!apiKey) return { success: false, error: "Kunci API kosong" };
  const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Hello" }] }],
        generationConfig: { maxOutputTokens: 5 }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error?.message || response.statusText };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
