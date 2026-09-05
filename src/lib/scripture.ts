/** Presentation of the scripture line, shared by the card reader and Book View.
 *  Both strip the colophon and bind the danda; the corpus keeps both, because
 *  search and the word-gloss import key off the verse number. */

/* Every line closes with its own number between double dandas — "।।2.13।।" in
   Devanagari, "|| ೧೩ ||" in the Kannada and Telugu settings of the same text.
   The heading above the verse already says which verse this is, so the number
   and the pair that closes it are noise in the reading view. The opening danda
   stays: it is the sentence's full stop, not part of the number. */
export const stripVerseNumber = (text: string): string => text.replace(/(।।|॥|\|\|)[\s.\d०-९౦-౯೦-೯]+(?:।।|॥|\|\|)\s*$/u, "$1");

/* A danda is a full stop, and a full stop does not start a line. The corpus
   spaces it off the last word, so on a narrow column the pada wraps and leaves
   the mark stranded at the head of the next line; a no-break space glues it to
   the word it closes. */
export const bindDanda = (text: string): string => text.replace(/[ \t]+(?=(?:।|॥|\|)+)/g, "\u00a0");

/** The corpus separates pada with blank lines; under pre-wrap those render as a
 *  gap mid-verse. */
export const readableScripture = (text: string): string => bindDanda(stripVerseNumber(text.replace(/\n\s*\n/g, "\n").trim()));
