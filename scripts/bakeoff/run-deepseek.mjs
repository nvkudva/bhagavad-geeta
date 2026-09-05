// Translates the sample with DeepSeek. Requires DEEPSEEK_API_KEY in the environment.
import { readFileSync, writeFileSync } from 'node:fs';
import { SYSTEM, userMessage } from './prompt.mjs';

const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) { console.error('DEEPSEEK_API_KEY not set. source ~/.zshrc.secrets'); process.exit(1); }

const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-pro';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5);
const TAG = MODEL.replace(/^deepseek-/, '');

const sample = JSON.parse(readFileSync(new URL('./out/sample.json', import.meta.url)));
const prior = process.env.RESUME
  ? JSON.parse(readFileSync(new URL(`./out/${TAG}.json`, import.meta.url)))
  : {};
const results = Object.fromEntries(Object.entries(prior).filter(([, v]) => !v.error));
const perCall = [];
const usage = { prompt: 0, completion: 0 };

async function translate(v) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMessage(v) }],
      response_format: { type: 'json_object' },
      max_tokens: 32000,
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`${v.id}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  usage.prompt += json.usage?.prompt_tokens ?? 0;
  usage.completion += json.usage?.completion_tokens ?? 0;
  const choice = json.choices[0];
  const text = choice.message.content;
  perCall.push({ id: v.id, srcChars: v.commentary_english.length, finish: choice.finish_reason, ...json.usage });
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${v.id}: unparseable (finish=${choice.finish_reason}, ${text.length} chars, ${json.usage?.completion_tokens} completion tokens)`);
  }
}

const queue = sample.filter((v) => !results[v.id]);
console.log(`${queue.length} to translate (${Object.keys(results).length} reused)`);
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
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n${MODEL}: ${secs}s, ${usage.prompt} prompt + ${usage.completion} completion tokens`);
writeFileSync(new URL(`./out/${TAG}-usage.json`, import.meta.url), JSON.stringify(perCall, null, 2));
console.table(perCall.map((c) => ({ id: c.id, srcChars: c.srcChars, finish: c.finish_reason ?? c.finish, out: c.completion_tokens })));
console.log(`completion tokens per output char: ${(usage.completion / Object.values(results).reduce((s, r) => s + ((r.kannada ?? '') + (r.telugu ?? '')).length, 1)).toFixed(2)}`);
