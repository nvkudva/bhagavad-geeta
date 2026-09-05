"""Benchmark IndicTrans2 configurations before committing to the full run.

Sweeps the batching token budget rather than a fixed sentence count: beam
memory scales with batch x longest-sentence-in-batch, and a fixed count blows
up on the long tail (see engine.TOKEN_BUDGET).
"""
import json, random, sys, torch
sys.stdout.reconfigure(line_buffering=True)
sys.path.insert(0, "scripts/mt")
from segment import split_paragraphs, split_sentences
import engine

verses = json.load(open("src/data/verses.json"))
sents = []
for v in verses:
    c = v.get("commentary_english")
    if not c:
        continue
    for p in split_paragraphs(c)[0]:
        sents += split_sentences(p)
random.Random(20260905).shuffle(sents)
sample = sents[:200]
TOTAL = 6669 * 2   # full corpus, both languages
print(f"sample: {len(sample)} sentences, "
      f"{sum(len(s) for s in sample)/len(sample):.0f} chars mean\n")

# A first sweep showed throughput flat from budget 3000 to 12000 (20.5 -> 19.0
# sent/s) while peak VRAM went 8.5 -> 23.4 GiB, and 24000 OOMed. Beam search,
# not batch parallelism, is the bottleneck once batches are length-sorted, so
# this sweep stays at the small end and spends the range on beams and dtype.
CONFIGS = [
    ("fp16", torch.float16,  1500, 5),
    ("fp16", torch.float16,  3000, 5),
    ("bf16", torch.bfloat16, 1500, 5),
    ("bf16", torch.bfloat16, 3000, 5),
    ("fp16", torch.float16,  1500, 1),
    ("fp16", torch.float16,  3000, 1),
    ("fp16", torch.float16,  6000, 1),
]

rows, outputs, loaded = [], {}, None
tok = model = ip = None
for name, dt, budget, beams in CONFIGS:
    if loaded != name:
        if loaded:
            del tok, model, ip
            torch.cuda.empty_cache()
        print(f"  loading {name}...", flush=True)
        tok, model, ip = engine.load(dt)
        loaded = name
        print(f"  loaded {name}", flush=True)
    print(f"  warmup {name} budget={budget} beam={beams}", flush=True)
    engine.translate(sample[:16], "kan_Knda", tok, model, ip,
                     budget=budget, num_beams=beams)              # warm up
    print("  warmup done", flush=True)
    try:
        res, secs, vram = engine.timed(
            sample, "kan_Knda", tok, model, ip, budget=budget, num_beams=beams)
    except torch.OutOfMemoryError:
        print(f"{name:5} budget {budget:6} beam {beams}  OOM", flush=True)
        torch.cuda.empty_cache()
        continue
    rows.append((name, budget, beams, len(sample) / secs, secs, vram))
    outputs[f"{name}/budget{budget}/beam{beams}"] = res
    print(f"{name:5} budget {budget:6} beam {beams}  "
          f"{len(sample)/secs:7.2f} sent/s  {secs:6.1f}s  {vram:5.2f} GiB peak")

print(f"\n{'dtype':6} {'budget':>7} {'beams':>5} {'sent/s':>8} {'200 sents':>10} "
      f"{'peak VRAM':>10} {'full job':>10}")
print("-" * 64)
for name, budget, beams, rate, secs, vram in rows:
    print(f"{name:6} {budget:7} {beams:5} {rate:8.2f} {secs:9.1f}s {vram:9.2f}G "
          f"{TOTAL/rate/60:8.1f} min")

out_dir = ("/tmp/claude-1000/-home-nvkudva-dev-projects/"
           "2bd71099-8584-40c2-8f98-2435292b88ff/scratchpad/")
json.dump(outputs, open(out_dir + "bench-out.json", "w"), ensure_ascii=False, indent=1)
json.dump(sample, open(out_dir + "bench-src.json", "w"), ensure_ascii=False, indent=1)
