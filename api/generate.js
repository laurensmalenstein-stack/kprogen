const https = require('https');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { origin, process: processing, altitude, roastLevel, roastName, brew, flavors, notes, endTemp, totalTime, devPercent } = req.body;

  const prompt = `You are an expert coffee roaster specializing in Kaffelogic home roaster profiles. Generate a detailed roast profile analysis for:

Origin: ${origin}
Processing: ${processing}
Altitude: ${altitude} masl
Roast level: ${roastName} (${roastLevel}/6)
Brew method: ${brew}
Desired flavors: ${flavors && flavors.length ? flavors.join(', ') : 'not specified'}
Notes: ${notes || 'none'}
Calculated end temperature: ${endTemp}C
Total roast time: ${totalTime} min
Development: ${devPercent}%

Respond ONLY with valid JSON, no markdown, no backticks, no explanation:
{"flavorTags":["tag1","tag2","tag3","tag4"],"flavorDesc":"2-3 sentence flavor description in Dutch","klSettings":{"Profielniveau":"value","Laadtemperatuur":"value","First crack verwacht":"value","Development na FC":"value","Batchgrootte":"value"},"tips":"3-4 sentences roasting tips in Dutch","dryingPhase":{"duration":"X min","tempRange":"X-X C","pct":30},"maillardPhase":{"duration":"X min","tempRange":"X-X C","pct":45},"devPhase":{"duration":"X min","tempRange":"X-X C","pct":22}}`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  });

  return new Promise((resolve) => {
    const request = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            res.status(500).json({ error: parsed.error.message });
            return resolve();
          }
          const text = parsed.content.map(i => i.text || '').join('');
          const clean = text.replace(/```json|```/g, '').trim();
          const result = JSON.parse(clean);
          res.status(200).json(result);
          resolve();
        } catch (e) {
          res.status(500).json({ error: 'Parse error: ' + e.message });
          resolve();
        }
      });
    });

    request.on('error', (e) => {
      res.status(500).json({ error: 'Request error: ' + e.message });
      resolve();
    });

    request.write(requestBody);
    request.end();
  });
}
