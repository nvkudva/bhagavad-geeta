import type React from "react";
import { useEffect, useRef } from "react";
import { SHORTCUTS } from "../lib/keys";

/** `?` — the list of what the keyboard does. Desktop only; there is no keyboard
 *  layer below the wide breakpoint for it to describe. */
export const ShortcutsSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="desk-dialog shortcuts-sheet"
      aria-label="Keyboard shortcuts"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}>
      <h2 className="shortcuts-title">Keyboard</h2>
      <div className="shortcuts-grid">
        {SHORTCUTS.map(({ keys, label }) => (
          <div className="shortcuts-row" key={keys}>
            <span>{label}</span>
            <kbd>{keys}</kbd>
          </div>
        ))}
      </div>
    </dialog>
  );
};
