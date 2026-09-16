/**
 * Clipboard write that survives iOS Safari: `navigator.clipboard.writeText` is called synchronously inside the
 * tap's own handler (the promise is what the caller awaits, not what iOS gates), with the hidden-textarea
 * `execCommand('copy')` path when the async API is missing or refuses.
 */
export async function copyText(text: string): Promise<boolean> {
  const cb = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (cb && typeof cb.writeText === 'function') {
    try {
      await cb.writeText(text);
      return true;
    } catch {
      /* fall through to the textarea path */
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
