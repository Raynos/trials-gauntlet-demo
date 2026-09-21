/** Runtime native write failures keep the game playable and offer a durable-save retry. */
interface SaveStatus {
  subscribeSaveStatus(listener: (failed: boolean) => void): () => void;
  flush(): Promise<void>;
}

export function installNativeSaveNotice(saves: SaveStatus): () => void {
  const root = document.createElement('div');
  root.className = 'native-save-notice';
  root.setAttribute('role', 'alert');
  root.hidden = true;
  root.innerHTML = `<style>
    .native-save-notice { position:fixed; z-index:12000; top:max(12px,env(safe-area-inset-top));
      left:max(12px,env(safe-area-inset-left)); right:max(12px,env(safe-area-inset-right));
      margin:auto; max-width:560px; box-sizing:border-box; display:flex; align-items:center; gap:16px;
      padding:10px 14px; border:1px solid #f3b94b; border-radius:10px; background:#211c13;
      color:#fff3d6; font:14px/1.4 system-ui,sans-serif; box-shadow:0 4px 18px #0008; }
    .native-save-notice[hidden] { display:none; }
    .native-save-notice span { flex:1; }
    .native-save-notice button { min-height:44px; padding:8px 14px; border:0; border-radius:6px;
      background:#f3b94b; color:#211c13; font:600 14px system-ui,sans-serif; cursor:pointer; }
    .native-save-notice button:disabled { opacity:.65; }
  </style><span></span><button type="button">Retry save</button>`;
  const message = root.querySelector('span')!;
  const retry = root.querySelector('button')!;
  const warning = 'Progress isn’t saved. Retry before closing the app.';
  let disposed = false;
  message.textContent = warning;
  document.body.append(root);
  const unsubscribe = saves.subscribeSaveStatus(failed => { root.hidden = !failed; });
  retry.addEventListener('click', () => {
    if (retry.disabled) return;
    retry.disabled = true;
    message.textContent = 'Saving progress…';
    void saves.flush().catch(() => { /* Preserve the warning until a committed save succeeds. */ }).finally(() => {
      if (disposed) return;
      retry.disabled = false;
      message.textContent = warning;
    });
  });
  return () => { disposed = true; unsubscribe(); root.remove(); };
}
