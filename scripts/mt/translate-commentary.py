"""Machine-translate commentary_english into Kannada and Telugu.

Writes src/data/commentary-mt.json — a staging file keyed "chapter.verse".
Nothing here touches verses.json; the merge is a separate, human-reviewed step.

    python scripts/mt/translate-commentary.py [--limit N] [--beams 5]
                                              [--budget 1500] [--dtype bf16]

Defaults come from scripts/mt/bench.py on a 200-sentence sample: bf16 at a
1500-token batch budget with beam 5 was the fastest beam-5 configuration
(21.6 sent/s) and the cheapest in memory (5.5 GiB peak). Greedy is 5.3x faster
but changes 55% of sentences, and at this corpus size beam 5 costs ten minutes.
"""
import argparse, json, sys, time, torch
sys.path.insert(0, "scripts/mt")
sys.stdout.reconfigure(line_buffering=True)
from segment import split_paragraphs, split_sentences, join_paragraphs, hard_split
import engine

MODEL_VERSION = "10e65a9951a1e922cd109a95e8aba9357b62144b"  # HF revision pinned
OUT = "src/data/commentary-mt.json"

# The bhāṣya commentators. IndicTrans2 fails structurally on this register —
# it renders the karma/akarma pair as everyday ಕ್ರಿಯೆ/ನಿಷ್ಕ್ರಿಯತೆ and "organs"
# as ಅಂಗಗಳ (limbs) rather than ಇಂದ್ರಿಯ (sense-organs) — so these are
# translated but marked for redoing with a stronger model.
BHASYA = {"Sri Shankaracharya", "Sri Ramanuja"}

ap = argparse.ArgumentParser()
ap.add_argument("--limit", type=int)
ap.add_argument("--beams", type=int, default=5)
ap.add_argument("--budget", type=int, default=1500)
ap.add_argument("--dtype", choices=["fp16", "bf16"], default="bf16")
args = ap.parse_args()

verses = [v for v in json.load(open("src/data/verses.json"))
          if v.get("commentary_english")]
if args.limit:
    verses = verses[:args.limit]

tok, model, ip = engine.load(
    torch.bfloat16 if args.dtype == "bf16" else torch.float16)

# ── segment ────────────────────────────────────────────────────────────────
# One flat sentence list across the whole corpus, with a plan describing how to
# put each verse back together. Batching globally rather than per verse is what
# makes length-sorting worth anything: a single verse rarely fills a batch.

tlen = lambda s: engine.token_len(tok, s)
flat, plan = [], []
for v in verses:
    chunks, seps = split_paragraphs(v["commentary_english"])
    para_plan = []
    for para in chunks:
        counts = []
        for sent in split_sentences(para):
            pieces = hard_split(sent, tlen, engine.MAX_SRC_TOKENS)
            counts.append(len(pieces))
            flat.extend(pieces)
        para_plan.append(counts)
    plan.append((f"{v['chapter_id']}.{v['verse_number']}", v, para_plan, seps))

print(f"{len(verses)} verses, {sum(len(c) for _,_,pp,_ in plan for c in pp)} "
      f"paragraphs, {len(flat)} sentence pieces")


def reassemble(translated, para_plan, seps):
    """Rebuild one verse. Consumes `translated` in order and returns the text.

    Paragraph count and the exact newline runs between them are reproduced from
    the source, because the reader sets commentary with `white-space: pre-line`.
    """
    out, k = [], reassemble.cursor
    for counts in para_plan:
        sents = []
        for n in counts:
            sents.append(" ".join(translated[k:k + n]))
            k += n
        out.append(" ".join(sents))
    reassemble.cursor = k
    return join_paragraphs(out, seps)


# ── translate ──────────────────────────────────────────────────────────────
results, timings = {}, {}
for lang, field in [("kan_Knda", "commentary_kannada"),
                    ("tel_Telu", "commentary_telugu")]:
    t0 = time.perf_counter()
    last = [0]

    def tick(done, n):
        if done - last[0] >= 512 or done == n:
            el = time.perf_counter() - t0
            print(f"  {lang} {done}/{n}  {done/el:.1f} sent/s  "
                  f"eta {(n-done)/(done/el)/60:.1f} min")
            last[0] = done

    out = engine.translate(flat, lang, tok, model, ip,
                           budget=args.budget, num_beams=args.beams,
                           progress=tick)
    timings[lang] = time.perf_counter() - t0
    print(f"{lang}: {len(flat)/timings[lang]:.2f} sent/s, "
          f"{timings[lang]/60:.1f} min")

    reassemble.cursor = 0
    for vid, v, para_plan, seps in plan:
        results.setdefault(vid, {})[field] = reassemble(out, para_plan, seps)
    assert reassemble.cursor == len(flat), "reassembly did not consume all pieces"

# ── provenance ─────────────────────────────────────────────────────────────
stamp = time.strftime("%Y-%m-%d")
source = (f"machine-translated by ai4bharat/indictrans2-en-indic-1B "
          f"(rev {MODEL_VERSION[:12]}, {args.dtype}, beam {args.beams}), {stamp}")

for vid, v, _, _ in plan:
    r = results[vid]
    r["commentary_kannada_machine"] = True
    r["commentary_telugu_machine"] = True
    r["commentary_kannada_source"] = source
    r["commentary_telugu_source"] = source
    r["commentary_author"] = v["commentary_author"]
    if v["commentary_author"] in BHASYA:
        r["low_confidence"] = True
        r["low_confidence_reason"] = (
            "bhāṣya register: the model loses technical pairs such as "
            "karma/akarma and renders indriya as 'limbs'. Redo with a "
            "stronger model before shipping.")

json.dump(results, open(OUT, "w"), ensure_ascii=False, indent=1)
total = sum(timings.values())
print(f"\nwrote {OUT}: {len(results)} verses")
print(f"total {2*len(flat)} translations in {total/60:.1f} min "
      f"({2*len(flat)/total:.2f} sent/s)")
