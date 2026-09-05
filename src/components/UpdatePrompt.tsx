import type React from "react";
import { useEffect, useSyncExternalStore } from "react";
import { applyUpdate, getWaitingWorker, registerServiceWorker, subscribeUpdate } from "../lib/sw";

/** The precache is the whole app, so a deploy reaches nobody until the waiting
 *  worker takes over — and taking over silently would swap the JS out from under
 *  a reader mid-verse. The new build waits behind this prompt instead. */
export const UpdatePrompt: React.FC = () => {
  const waiting = useSyncExternalStore(subscribeUpdate, getWaitingWorker);

  useEffect(registerServiceWorker, []);

  if (!waiting) return null;

  return (
    <div className="update-toast" role="status">
      <span className="update-toast-text">Update available</span>
      <button type="button" className="update-toast-action" onClick={applyUpdate}>
        Refresh
      </button>
    </div>
  );
};
