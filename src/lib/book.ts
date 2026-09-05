/** The keyboard layer lives in the shell and Book View is a lazy chunk, so the
 *  two meet here: the screen registers what a page turn means while it is
 *  mounted, and the shell's existing next/prev actions route through it.
 *  Nothing else may call these — a second registrant would silently win. */

type Turn = (to: number | "first" | "last") => void;

let handler: Turn | null = null;

export const setBookTurn = (fn: Turn | null): void => {
  handler = fn;
};

/** True when Book View took the key, so the caller leaves it alone. */
export const bookTurn = (to: number | "first" | "last"): boolean => {
  if (!handler) return false;
  handler(to);
  return true;
};
