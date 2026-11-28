// Bounded JSON body reader: checks Content-Length first, reads once, enforces maxBytes, parses once.
export async function readJsonBody(request, { maxBytes = 1024 * 1024 } = {}) {
  const rawContentLen = request?.headers?.get?.('Content-Length');
  if (rawContentLen !== null && rawContentLen !== undefined && rawContentLen !== '') {
    const declared = Number(rawContentLen);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return {
        ok: false,
        status: 413,
        error: `Request body exceeds maximum allowed size (${Math.round(maxBytes / 1024)} KB)`,
      };
    }
  }

  let rawText = '';
  try {
    rawText = await request.text();
  } catch {
    return { ok: false, status: 400, error: 'Failed to read request body' };
  }

  if (rawText.length > maxBytes || new TextEncoder().encode(rawText).byteLength > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Request body exceeds maximum allowed size (${Math.round(maxBytes / 1024)} KB)`,
    };
  }

  if (!rawText.trim()) {
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  }

  try {
    const data = JSON.parse(rawText);
    return { ok: true, data };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  }
}
