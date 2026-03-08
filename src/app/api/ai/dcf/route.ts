import { NextRequest, NextResponse } from 'next/server';

export type AiDcfResponse = {
  fcf: string;
  sharesOutstanding: string;
  cashEquivalent: string;
  totalDebt: string;
  discountRate: string;
  terminalGrowth: string;
  years: string;
  note: string;
};

const PROMPT = (symbol: string) => `You are a financial analyst assistant. For the publicly listed company with ticker symbol "${symbol}", provide realistic DCF (Discounted Cash Flow) model inputs based on the most recent annual data you have.

Respond ONLY with a valid JSON object in exactly this format (no markdown, no explanation):
{
  "fcf": "<trailing twelve month free cash flow in millions, number only e.g. 85000>",
  "sharesOutstanding": "<diluted shares outstanding in millions, number only e.g. 7430>",
  "cashEquivalent": "<cash and short-term investments in millions, number only e.g. 75000>",
  "totalDebt": "<total debt in millions, number only e.g. 46000>",
  "discountRate": "<your suggested WACC as a decimal e.g. 0.09>",
  "terminalGrowth": "<suggested terminal growth rate as a decimal e.g. 0.025>",
  "years": "<projection horizon as integer e.g. 10>",
  "note": "<one sentence noting the data vintage, e.g. 'Based on FY2024 annual report data.'>"
}

Use millions for dollar values. If you are uncertain about a value, use a reasonable industry estimate and mention it in the note.`;

function extractJson(text: string): AiDcfResponse {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in response');
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;

  const str = (key: string) => (typeof parsed[key] === 'string' ? (parsed[key] as string).trim() : String(parsed[key] ?? ''));

  return {
    fcf: str('fcf'),
    sharesOutstanding: str('sharesOutstanding'),
    cashEquivalent: str('cashEquivalent'),
    totalDebt: str('totalDebt'),
    discountRate: str('discountRate'),
    terminalGrowth: str('terminalGrowth'),
    years: str('years'),
    note: str('note'),
  };
}

async function callClaude(symbol: string): Promise<AiDcfResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 512,
      messages: [{ role: 'user', content: PROMPT(symbol) }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  return extractJson(data.content[0].text);
}

async function callOpenAI(symbol: string): Promise<AiDcfResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 512,
      messages: [{ role: 'user', content: PROMPT(symbol) }],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return extractJson(data.choices[0].message.content);
}

async function callGemini(symbol: string): Promise<AiDcfResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const delays = [0, 3000, 7000];
  let lastError = '';

  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT(symbol) }] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
        }),
      },
    );

    if (res.status === 429) {
      lastError = 'Rate limited by Gemini — retrying...';
      continue;
    }
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
    const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    return extractJson(data.candidates[0].content.parts[0].text);
  }

  throw new Error(lastError || 'Gemini rate limit exceeded after retries');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { symbol?: string; provider?: string };
    const symbol = typeof body.symbol === 'string' ? body.symbol.toUpperCase().trim() : '';
    const provider = typeof body.provider === 'string' ? body.provider : '';

    if (!symbol) return NextResponse.json({ error: 'symbol is required' }, { status: 400 });

    let result: AiDcfResponse;

    if (provider === 'claude') result = await callClaude(symbol);
    else if (provider === 'openai') result = await callOpenAI(symbol);
    else if (provider === 'gemini') result = await callGemini(symbol);
    else return NextResponse.json({ error: 'invalid provider' }, { status: 400 });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
