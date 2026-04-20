const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
    return;
  }

  // Vercel automatically parses JSON body when Content-Type is application/json
  const data = req.body;
  if (!data || typeof data !== 'object') {
    res.status(400).json({ error: 'Invalid or empty request body' });
    return;
  }

  const {
    origin = '',
    process: processing = '',
    altitude = '',
    roastLevel = 3,
    roastName = 'Medium',
    brew = 'Espresso',
    flavors = [],
    notes = '',
    endTemp = 213,
    totalTime = 11,
    devPercent = 20
  } = data;

  const flavorStr = Array.isArray(flavors) && flavors.length ? flavors.join(', ') : 'not specified';

  const prompt = `You are an expert coffee roaster specializing in Kaffelogic home roaster profiles. Generate a roast profile analysis for these beans:
Origin: ${origin}
Processing: ${processing}
Altitude: ${altitude} masl
Roast level: ${roastName}
Brew method: ${brew}
Desired flavors: ${flavorStr}
Notes: ${notes || 'none'}
End temperature: ${endTemp}C
Roast time: ${totalTime} min
Development ratio: ${devPercent}%

Respond ONLY with a single valid JSON object. No markdown, no backticks, no explanation before or after. Use this exact structure:
{"flavorTags":["tag1","tag2","tag3","tag4"],"flavorDesc":"2-3 sentences in Dutch describing the expected flavor","klSettings":{"Profielniveau":"3 (medium)","Laadtemperatuur":"170C","First crack verwacht":"rond 8:20 min","Development na FC":"2:10 min","Batchgrootte":"100g aanbevolen"},"tips":"3-4 sentences of roasting tips in Dutch","dryingPhase":{"duration":"3 min 30s","tempRange":"150-175C","pct":30},"maillardPhase":{"duration":"5 min","tempRange":"175-203C","pct":45},"devPhase":{"duration":"2 min 10s","tempRange":"203-213C","pct":22}}`;

  const requestBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req2 = https.request(options, (apiRes) => {
      let rawData = '';
      apiRes.on('data', (chunk) => { rawData += chunk; });
      apiRes.on('end', () => {
        try {
          const apiResponse = JSON.parse(rawData);

          if (apiResponse.error) {
            res.status(500).json({ error: apiResponse.error.message || 'Anthropic API error' });
            return resolve();
          }

          if (!apiResponse.content || !apiResponse.content[0]) {
            res.status(500).json({ error: 'Empty response from API', raw: rawData.substring(0, 200) });
            return resolve();
          }

          const text = apiResponse.content[0].text || '';
          const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const result = JSON.parse(cleaned);
          res.status(200).json(result);
          resolve();
        } catch (parseError) {
          res.status(500).json({
            error: 'Failed to parse API response: ' + parseError.message,
            raw: rawData.substring(0, 500)
          });
          resolve();
        }
      });
    });

    req2.on('error', (networkError) => {
      res.status(500).json({ error: 'Network error: ' + networkError.message });
      resolve();
    });

    req2.write(requestBody);
    req2.end();
  });
};
