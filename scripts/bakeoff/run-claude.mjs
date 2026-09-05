// Translates the sample with Claude. Requires ANTHROPIC_API_KEY in the environment.
// MODEL and EFFORT pick the contender; IDS scopes the run to a few verses.
import { readFileSync, writeFileSync } from 'node:fs';
import { SYSTEM, userMessage } from './prompt.mjs';

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('ANTHROPIC_API_KEY not set. source ~/.zshrc.secrets'); process.exit(1); }

const MODEL = process.env.MODEL ?? 'claude-opus-5';
const EFFORT = process.env.EFFORT ?? 'medium';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);
const TAG = `${MODEL.replace(/^claude-/, '')}-${EFFORT}`;

const sample = JSON.parse(readFileSync(new URL('./out/sample.json', import.meta.url)));
const only = process.env.IDS?.split(',');
const queue = sample.filter((v) => !only || only.includes(v.id));
const results = {};
const perCall = [];
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

async function translate(v) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 20000,
      // The system prompt is byte-identical across every call, so it caches.
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      thinking: { type: 'adaptive' },
      output_config: { effort: EFFORT },
      messages: [{ role: 'user', content: userMessage(v) }],
    }),
  });
  if (!res.ok) throw new Error(`${v.id}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  usage.input += json.usage?.input_tokens ?? 0;
  usage.output += json.usage?.output_tokens ?? 0;
  usage.cacheRead += json.usage?.cache_read_input_tokens ?? 0;
  usage.cacheWrite += json.usage?.cache_creation_input_tokens ?? 0;
  perCall.push({ id: v.id, srcChars: v.commentary_english.length, stop: json.stop_reason, out: json.usage?.output_tokens });
  const text = json.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const bare = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(bare);
  } catch {
    throw new Error(`${v.id}: unparseable (stop=${json.stop_reason}, ${text.length} chars)`);
  }
}

console.log(`${MODEL} effort=${EFFORT}: ${queue.length} verses`);
const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const v = queue.shift();
    try {
      results[v.id] = await translate(v);
      process.stdout.write('.');
    } catch (e) {
      results[v.id] = { error: String(e.message) };
      process.stdout.write('x');
    }
  }
}));

writeFileSync(new URL(`./out/${TAG}.json`, import.meta.url), JSON.stringify(results, null, 2));
console.log(`\n${TAG}: ${((Date.now() - t0) / 1000).toFixed(1)}s, ${usage.input} in (+${usage.cacheWrite} cache write, ${usage.cacheRead} cache read), ${usage.output} out`);
console.table(perCall);
