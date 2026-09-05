# Quality of generated text

All findings below were measured on this corpus. Re-measure if the models change.

## Why scripture is harder than ordinary translation

- Sanskrit technical terms must stay Sanskrit, written in the target script:
  ಕರ್ಮ / కర్మ, not a everyday word meaning "action".
- Kannada and Telugu already use these loanwords, so the correct output is
  usually the Sanskrit term unchanged.
- Models trained on news and web text do the opposite — they reach for everyday
  vocabulary, because that is what general translation rewards.
- When Śaṅkara glosses *karmaṇy akarma*, replacing *karma* with an everyday word
  removes the point the sentence exists to make.

## The three registers

| commentator | verses | difficulty |
|---|---|---|
| Swami Sivananda — plain devotional prose | 631 | easy |
| Sri Ramanuja — Viśiṣṭādvaita bhāṣya | 48 | hard |
| Sri Shankaracharya — Advaita bhāṣya | 22 | hard |

- The 70 bhāṣya verses are ~10% of the corpus and carry most of the risk.
- Use the strongest model available for those 70.
- Do not judge a run by an average score — it hides them.

## IndicTrans2 (local, free, MIT)

**Use for:** plain prose drafts, and back-translation checking.
**Do not use for:** word-by-word glosses, or bhāṣya.

Good on plain exposition — 3 of 4 sampled Sivananda sentences were shippable.

Two failure modes on prose:

| English | IndicTrans2 gave | should be |
|---|---|---|
| the knower of Reality | ವಾಸ್ತವವನ್ನು ತಿಳಿದವನು | ತತ್ತ್ವ… |
| inaction in action | ಕ್ರಿಯೆ / ನಿಷ್ಕ್ರಿಯತೆ | ಕರ್ಮ / ಅಕರ್ಮ |
| organs | ಅಂಗಗಳ (body parts) | ಇಂದ್ರಿಯ (sense-organs) |
| Dvesha or aversion | ದ್ವೇಶ ಅಥವಾ ದ್ವೇಷ | ದ್ವೇಷ |

That last row is the clearest example: it misspelled the transliteration
(ಶ instead of ಷ), then translated "aversion" to the correctly-spelled word — so
the output is a misspelled word, "or", then the same word again.

It sometimes gets terms right (ರಾಗ came through correctly). That inconsistency
is the danger: output that is 90% right and reads fluently invites trust.

**On word-by-word glosses it is much worse**, because `context_english` is a
`headword—meaning; headword—meaning` chain, not sentences. Measured on 1.3 and 1.4:

| source | gave | should be |
|---|---|---|
| paśhya | ಪಾಶ್ಯ | ಪಶ್ಯ |
| mahā-iṣhu-āsa | ಮಹಾ-ಇಸು-ಆಸ | — mangled |
| vyūḍhām | ವಾಯುದಮ್ | — mangled |
| here | ಹಿಯರ್ | translated, not spelled phonetically |

## Frontier models

Tested on 3 verses covering all three commentators, using the production prompt,
which explicitly said "Sanskrit technical vocabulary stays Sanskrit":

| model | kept the Sanskrit term | substituted an everyday word |
|---|---|---|
| Opus | 8 of 8 | 0 |
| Sonnet | 0 of 8 | 8 |

Sonnet also:

- Mis-declined *ātman* — wrote ಆತ್ಮದಲ್ಲಿ (neuter) instead of ಆತ್ಮನಲ್ಲಿ.
- Ignored the instruction to match the published translation's register.

**Both outputs passed every automated check.** Script-purity, length and
paragraph checks cannot see this class of error. Someone has to verify the
vocabulary deliberately.

## Two cheap checks that catch real defects

### 1. Cross-script codepoint agreement (Kannada ↔ Telugu only)

- A Sanskrit term is the same word in both languages, differing only in script.
- Telugu codepoint = Kannada codepoint − 0x80, exactly.
- Verified across all 65,838 characters of `text_kannada` / `text_telugu` — zero
  exceptions.
- So any shared Sanskrit term that is not an exact offset pair is a bug, findable
  without reading either language.

How to run it:

- Compare 4-character word stems, not whole words. The two languages inflect the
  same stem differently, so whole-word matching finds almost nothing even on the
  published human translations.
- Expect a low match rate. On human translations only about 6% of stems match,
  so treat anything below that as the failure signal, not a high number as
  success.

It works. In a 47-verse gloss run it found the one verse where Kannada wrote
ಕಿಂ (anusvāra) and Telugu wrote కిమ్ (explicit *ma* + virāma) — both valid
spellings, but not the same word.

### 2. Back-translation

- Translate the generated text back to English locally, then diff against the
  English source.
- Catches omissions, padding and invented clauses — none of which script or
  length checks can see.
- Use IndicTrans2's `indic-en` direction. The 200M distilled model is enough,
  because you are comparing meaning, not shipping its prose.

## Environment for the local model

These exact versions are required. Newer ones break.

| requirement | why |
|---|---|
| Python 3.12 | On 3.14 the `tokenizers` wheel does not exist and the Rust build fails. |
| `transformers==4.46.3` | Newer versions break IndicTrans2's vendored `modeling_indictrans.py`. |
| Leave `use_cache` at `True` | Setting it `False` works but ran **32× slower** — 2.6 h became 85 h. |
| CUDA 12.8+ on RTX 50xx | Blackwell is `sm_120`; older CUDA builds will not run on it. |

**Batch size is not "bigger is better".** On Apple silicon, raising batch 16 → 32
at beam 5 was **16× slower**, with near-identical sentence lengths. Always
measure a new batch size on a small sample before using it.

## Prompt shape that worked

Give the model, per verse:

- The Sanskrit śloka.
- The English translation.
- **The already-published translation of that same verse in the target
  language.** This is what lets it match register — the new text sits directly
  beneath that translation in the reader.
- The English text to translate.

Then state the rules explicitly:

- Sanskrit technical vocabulary stays Sanskrit, in the target script.
- A shared term must be identical in both languages apart from the script.
- Preserve paragraph count and order.

Ask for a fixed JSON shape, and keep the system prompt byte-identical across
calls so it caches.

## Recording the result

- Write `<field>_source` on every verse, in language a reader would understand.
- Where the field has a per-verse flag, also write `<field>_machine: true`.
- `translation_telugu_machine` is the existing example — it marks the three
  Telugu verses that were composed rather than taken from Wikisource.
- Consider flagging the 70 bhāṣya verses as low-confidence even inside an
  accepted language, so a later pass can find them.
