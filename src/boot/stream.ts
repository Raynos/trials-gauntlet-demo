/**
 * Fetch a URL through a ReadableStream and report bytes as the reader reads them — the only way
 * bytes enter the boot plan from this layer (the inline loader's core files; the key art prefetch in
 * `main.ts` reports to the `after` list the same way). `total` is the response's content-length when
 * the body is not encoded, else `expectedBytes`, else what has arrived so far. Throws on a non-OK
 * response; callers decide whether that is fatal (core) or nothing (a background prefetch).
 */
export async function streamBytes(url: string, onBytes: (delta: number, got: number, total: number) => void, expectedBytes = 0): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const len = Number(res.headers.get('content-length')) || 0;
  const declared = len && !res.headers.get('content-encoding') ? len : expectedBytes;
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onBytes(buf.byteLength, buf.byteLength, Math.max(declared, buf.byteLength));
    return buf.byteLength;
  }
  const reader = res.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.byteLength;
    onBytes(value.byteLength, got, Math.max(declared, got));
  }
  return got;
}
