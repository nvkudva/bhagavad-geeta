"""IndicTrans2 batched inference, length-sorted."""
import time, torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from IndicTransToolkit.processor import IndicProcessor

MODEL_ID = "ai4bharat/indictrans2-en-indic-1B"
MAX_SRC_TOKENS = 200   # model positions cap at 256; leave room for tags and drift

# Batches are formed to a token budget, not a fixed sentence count. Beam-search
# memory scales with batch x longest-sentence-in-batch, and this corpus spans
# 5 to 185 tokens: at a fixed 256 sentences the long tail asks for ~60 GiB on a
# 32 GB card. Under WSL that does not raise - the driver spills to system RAM
# over PCIe and throughput collapses to 0.56 sent/s instead of failing. The
# budget keeps every batch at roughly constant memory.
TOKEN_BUDGET = 6000
MAX_BATCH = 384


def load(dtype=torch.float16):
    tok = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(
        MODEL_ID, trust_remote_code=True,
        # 4.46.3 spells this torch_dtype; the vendored modeling file forwards
        # **kwargs, so the newer `dtype` alias reaches __init__ and is rejected.
        torch_dtype=dtype,
    ).to("cuda").eval()
    # Fail loudly instead of spilling into host memory: see TOKEN_BUDGET above.
    torch.cuda.set_per_process_memory_fraction(0.92)
    return tok, model, IndicProcessor(inference=True)


def token_len(tok, text, tgt_lang="kan_Knda"):
    """Length of a raw English sentence in model tokens.

    The vendored tokenizer reads the two language tags off the front of the
    string and asserts on anything else, so a bare sentence cannot be
    tokenised directly - it has to be tagged first.
    """
    tagged = f"eng_Latn {tgt_lang} {text}"
    return len(tok(tagged, add_special_tokens=False)["input_ids"])


def batches(order, lengths, budget=TOKEN_BUDGET, max_batch=MAX_BATCH):
    """Group length-sorted indices so batch x longest-in-batch stays under budget."""
    cur = []
    for i in order:
        peak = max(lengths[i], *(lengths[j] for j in cur)) if cur else lengths[i]
        if cur and ((len(cur) + 1) * peak > budget or len(cur) + 1 > max_batch):
            yield cur
            cur = []
        cur.append(i)
    if cur:
        yield cur


def translate(sents, tgt_lang, tok, model, ip, budget=TOKEN_BUDGET,
              max_batch=MAX_BATCH, num_beams=5, progress=None):
    """Translate a list of English sentences. Output order matches input.

    Sentences are sorted by token length before batching and restored after:
    padding waste dominates throughput on a corpus whose sentence lengths span
    two orders of magnitude, so this is the largest single win available.
    """
    n = len(sents)
    if n == 0:
        return []
    # Sort on the raw sentence tagged for the tokenizer, not on preprocessed
    # text: IndicProcessor pairs preprocess_batch with postprocess_batch through
    # an internal FIFO of placeholder maps, so preprocessing the whole corpus up
    # front and postprocessing it in a different (length-sorted) order
    # desynchronises that queue and wedges the processor. Pre and post are
    # therefore paired per batch below, and the tagged raw length is the sort key.
    lengths = [token_len(tok, s, tgt_lang) for s in sents]
    order = sorted(range(n), key=lambda i: lengths[i])
    out = [None] * n
    done = 0
    for idx in batches(order, lengths, budget, max_batch):
        pre = ip.preprocess_batch([sents[i] for i in idx],
                                  src_lang="eng_Latn", tgt_lang=tgt_lang)
        enc = tok(pre, truncation=True, padding="longest",
                  max_length=256, return_tensors="pt").to("cuda")
        with torch.inference_mode():
            gen = model.generate(
                **enc, num_beams=num_beams, num_return_sequences=1,
                max_length=256, min_length=0, early_stopping=True,
            )
        dec = tok.batch_decode(gen, skip_special_tokens=True,
                               clean_up_tokenization_spaces=True)
        for i, t in zip(idx, ip.postprocess_batch(dec, lang=tgt_lang)):
            out[i] = t
        done += len(idx)
        if progress:
            progress(done, n)
    return out


def timed(sents, tgt_lang, tok, model, ip, **kw):
    torch.cuda.synchronize(); torch.cuda.reset_peak_memory_stats()
    t0 = time.perf_counter()
    res = translate(sents, tgt_lang, tok, model, ip, **kw)
    torch.cuda.synchronize()
    dt = time.perf_counter() - t0
    return res, dt, torch.cuda.max_memory_allocated() / 2**30
