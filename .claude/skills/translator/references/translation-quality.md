# Quality bar for generated text

Everything here is measured on this corpus, not general knowledge about models.
The numbers are worth trusting; re-measure if the models change.

## Why this is harder than ordinary translation

Scripture commentary carries a technical vocabulary that must survive
translation *as itself*. When Śaṅkara glosses *karmaṇy akarma*, rendering it
with everyday words for "action" and "inactivity" doesn't just lose register —
it destroys the doctrinal claim the sentence exists to make.

Kannada and Telugu both take Sanskrit loanwords natively, so the right output is
usually the Sanskrit term in the target script (ಕರ್ಮ / కర్మ), not a native
equivalent. A model that "translates well" by general standards will often fail
exactly here, because everyday vocabulary is what its training data rewards.

Three registers, and they behave differently:

| register | verses | difficulty |
|---|---|---|
| Sivananda — plain devotional prose | 631 | easy |
| Rāmānuja — Viśiṣṭādvaita bhāṣya | 48 | hard |
| Śaṅkara — Advaita bhāṣya | 22 | hard |

The 70 bhāṣya verses are ~10% of the corpus and carry most of the risk. Budget
the strongest model for them and don't let an aggregate quality number hide them.

## Measured failure modes

### IndicTrans2 (local, free, MIT)

Good on plain exposition — three of four sampled Sivananda sentences were
shippable. It fails in two specific ways:

- **Sanskrit terms are collapsed into everyday vocabulary.** *"the knower of
  Reality"* → ವಾಸ್ತವವನ್ನು ತಿಳಿದವನು (everyday "reality") instead of ತತ್ತ್ವ;
  *"inaction in action"* → ಕ್ರಿಯೆ/ನಿಷ್ಕ್ರಿಯತೆ instead of ಕರ್ಮ/ಅಕರ್ಮ;
  *"organs"* → ಅಂಗಗಳ (body parts) instead of ಇಂದ್ರಿಯ (sense-organs).
- **Transliteration is unreliable even when it keeps the term.** For *"Dvesha or
  aversion"* it produced ದ್ವೇಶ ಅಥವಾ ದ್ವೇಷ — misspelled the transliteration
  (ಶ for ಷ), then translated the gloss to the correctly-spelled word, yielding a
  misspelled word, "or", and the same word again.

It does sometimes keep terms correctly (ರಾಗ came through fine), which makes the
failures harder to spot: output that is 90% right and fluent invites trust.

**On word-by-word glosses it is markedly worse than on prose**, because
`context_english`'s `headword—meaning; headword—meaning` shape is nothing like
the sentences it was trained on. Measured on 1.3 and 1.4: ಪಾಶ್ಯ for *paśhya*
(should be ಪಶ್ಯ — it transliterated the source's `śh` digraph literally),
ಮಹಾ-ಇಸು-ಆಸ for *mahā-iṣhu-āsa*, ವಾಯುದಮ್ for *vyūḍhām*, and — the clearest tell —
the English word "here" rendered phonetically as ಹಿಯರ್ instead of translated.
Glosses need a human source or a frontier model.

**Verdict: usable as a draft generator for plain prose, not for glosses or
bhāṣya.** Its unambiguously good use is back-translation checking (see below),
where a spelling slip costs nothing.

### Smaller/faster frontier models

On a 3-verse, 3-commentator sample against the production prompt — which
explicitly instructed "Sanskrit technical vocabulary stays Sanskrit" — a Sonnet
run substituted ಕ್ರಿಯೆ/క్రియ for ಕರ್ಮ/కర్మ in **8 of 8** occurrences, while an
Opus run at the same instruction did the inverse: 8 correct, 0 substitutions.
Sonnet also mis-declined *ātman* (ಆತ್ಮದಲ್ಲಿ, neuter, instead of ಆತ್ಮನಲ್ಲಿ) and
ignored the instruction to match the published translation's register.

Both passed every mechanical check. **Fluency is not the discriminator here and
automated script checks will not find this** — the vocabulary rule has to be
verified deliberately.

## Two checks that find real defects cheaply

### Cross-script codepoint agreement

For scripts sharing a parent, a Sanskrit term should be the same word in both,
differing only in glyph. Kannada and Telugu satisfy `telugu = kannada - 0x80`
**exactly** — verified across all 65,838 characters of
`text_kannada`/`text_telugu` with zero exceptions.

So when generating both languages, any shared Sanskrit term that isn't an exact
codepoint-offset twin is a defect you can find without reading either language.
Compare 4-character stems rather than whole words: the two languages inflect the
same stem differently, so whole-word matching scores near zero even on the
published human translations. Their measured p5 for stem agreement is ~6%.

This also catches drift between two separately-generated languages: in a
47-verse gloss run, it found the single verse where one side wrote ಕಿಂ
(anusvāra) and the other కిమ్ (explicit *ma* + virāma) — both valid, but not
twins.

### Back-translation

Translate the generated text back to English locally and diff against the
source. This catches omissions, padding and hallucinated clauses — exactly what
script-purity and length-ratio checks are blind to. IndicTrans2's
`indic-en` direction is well suited: the 200M distilled model is enough, since
you're diffing meaning rather than shipping its prose.

Environment that works (versions are load-bearing):

- **Python 3.12** — on 3.14 the `tokenizers` wheel older transformers needs does
  not exist and the Rust build fails
- **`transformers==4.46.3`** — newer versions break IndicTrans2's vendored
  `modeling_indictrans.py` (`past_key_values[0][0].shape[2]` against a cache
  object whose first layer is `None`). On 4.46.3 leave `use_cache` at its default
  `True`; forcing `use_cache=False` "works" but measured **32× slower**
  (2.6 h → 85 h for this corpus).
- Batch size is **not** monotonic — on Apple silicon, batch 16 → 32 at beam 5 was
  16× *slower* with near-identical input lengths. Measure, don't assume.

## Prompt shape that worked

For per-verse translation, supplying the Sanskrit, the English, and **the
already-published translation of that same verse in the target language** is what
lets a model match register — it anchors the voice the new text will sit beside.
Reinforce with an explicit rule that Sanskrit technical vocabulary stays
Sanskrit in the target script, and that a shared term must be identical across
the two languages bar the script.

Ask for a fixed JSON shape, and keep the system prompt byte-identical across
calls so it caches.

## What to do with the result

Machine-generated text goes in with provenance, never silently:
`<field>_source` on every verse and, where the field ships a per-verse flag,
`<field>_machine: true`. The reader surfaces this — that's why
`translation_telugu_machine` exists for the three composed Telugu verses.

Consider flagging the 70 bhāṣya verses separately as low-confidence even inside
an otherwise-accepted language, so a later pass can find them.
