const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  // Parse body - Vercel may pass it as string or object
  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch(e) { return res.status(400).json({ error: 'Invalid JSON body' }); }
  }
  if (!data) return res.status(400).json({ error: 'Empty body' });

  const { origin, process: processing, altitude, roastLevel, roastName, brew, flavors, notes, endTemp, totalTime, devPercent } = data;

  const prompt = `You are an expert coffee roaster specializing in Kaffelogic home roaster profiles. Generate a roast profile analysis for:
Origin: ${origin}, Processing: ${processing}, Altitude: ${altitude} masl, Roast level: ${roastName}, Brew: ${brew}
Flavors: ${flavors && flavors.length ? flavors.join(', ') : 'not specified'}, Notes: ${notes || 'none'}
End temperature: ${endTemp}C, Roast time: ${totalTime} min, Development: ${devPercent}%

Respond ONLY with valid JSON, no markdown, no backticks:
{"flavorTags":["tag1","tag2","tag3","tag4"],"flavorDesc":"2-3 sentences in Dutch","klSettings":{"Profielniveau":"value","Laadtemperatuur":"value","First crack verwacht":"value","Development na FC":"value","Batchgrootte":"value"},"tips":"3-4 sentences in Dutch","dryingPhase":{"duration":"X min","tempRange":"X-X C","pct":30},"maillardPhase":{"duration":"X min","tempRange":"X-X C","pct":45},"devPhase":{"duration":"X min","tempRange":"X-X C","pct":22}}`;

  const body = JSON.stringify({
    model: 'claude-3-5-sonnet-20241022',
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
        'Content-Length': Buffer.byteLength(body)
      }
    }, (response) => {
      let raw = '';
      response.on('data', chunk => raw += chunk);
      response.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) { res.status(500).json({ error: parsed.error.message }); return resolve(); }
          const text = parsed.content.map(i => i.text || '').join('');
          const result = JSON.parse(text.replace(/```json|```/g, '').trim());
          res.status(200).json(result);
          resolve();
        } catch (e) {
          res.status(500).json({ error: 'Parse error: ' + e.message, raw: raw.substring(0, 300) });
          resolve();
        }
      });
    });
    request.on('error', (e) => { res.status(500).json({ error: e.message }); resolve(); });
    request.write(body);
    request.end();
  });
};
