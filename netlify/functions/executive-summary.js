export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'GROQ_API_KEY not set' }) };

  let stats;
  try { stats = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  // stats: { total, critical, high, medium, low, topHazards: [{name,count}], topLocations: [{id, risk, hazardCount, topHazardName}], resolvedCount }
  const prompt = `You are writing a short executive summary paragraph for a government Commissioner reviewing a Kumbh Mela field safety audit. Be factual, concise, and confident — this will be read by a non-technical official deciding whether to approve next steps.

AUDIT DATA:
- Total locations audited: ${stats.total}
- Risk breakdown: ${stats.critical} Critical, ${stats.high} High, ${stats.medium} Medium, ${stats.low} Low/Clear
- Most common hazards found: ${(stats.topHazards||[]).map(h=>`${h.name} (${h.count} locations)`).join(', ') || 'none significant'}
- Locations needing urgent attention: ${(stats.topLocations||[]).slice(0,5).map(l=>`Photo #${l.id} (${l.risk} risk, ${l.hazardCount} hazards, primarily ${l.topHazardName})`).join('; ') || 'none'}
- Hazards already marked as addressed/fixed: ${stats.resolvedCount||0}

Write exactly ONE paragraph (4-6 sentences), in plain English, that:
1. States the scale of the audit (how many locations covered)
2. Highlights the overall risk picture
3. Names the most urgent 2-3 specific locations/hazard types
4. Ends with a clear, actionable recommendation

Respond with ONLY the paragraph text, no headers, no markdown, no preamble.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 400
      })
    });
    const data = await response.json();
    if (!response.ok) return { statusCode: response.status, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: data.error?.message || 'Groq API error' }) };

    const summary = data.choices?.[0]?.message?.content?.trim() || '';
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ summary }) };
  } catch (err) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: err.message }) };
  }
}