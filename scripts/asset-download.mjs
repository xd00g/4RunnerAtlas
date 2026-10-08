import {createReadStream} from 'node:fs';
import {mkdir, open, rename, unlink, stat} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';

function validateRecord(record) {
  if (!Number.isSafeInteger(record.bytes) || record.bytes < 0 || !/^[a-f0-9]{64}$/.test(record.sha256)) throw Error('Invalid asset lock record');
}

export async function verifiedCache(destination, record) {
  validateRecord(record);
  try {
    if ((await stat(destination)).size !== record.bytes) return false;
    const digest = createHash('sha256');
    let size = 0;
    for await (const chunk of createReadStream(destination)) {
      size += chunk.length;
      if (size > record.bytes) return false;
      digest.update(chunk);
    }
    return size === record.bytes && digest.digest('hex') === record.sha256;
  } catch { return false; }
}

export async function downloadAsset(url, destination, record, {timeoutMs = 120000} = {}) {
  validateRecord(record);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Asset download timed out', 'TimeoutError')), timeoutMs);
  timer.unref();
  let response, reader, file, temporary;
  try {
    response = await fetch(url, {redirect: 'error', signal: controller.signal});
    if (!response.ok) throw Error(`Asset unavailable (${response.status})`);
    // Fetch decodes compressed bodies; Content-Length then describes wire bytes.
    const encoding = response.headers.get('content-encoding');
    const declared = response.headers.get('content-length');
    if ((!encoding || encoding.toLowerCase() === 'identity') && declared !== null && /^\d+$/.test(declared) && BigInt(declared) > BigInt(record.bytes)) throw Error('Asset exceeds locked byte size');
    if (!response.body) throw Error('Asset response has no body');
    await mkdir(path.dirname(destination), {recursive: true});
    const temporaryName = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
    file = await open(temporaryName, 'wx');
    temporary = temporaryName;
    reader = response.body.getReader();
    const digest = createHash('sha256');
    let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      if (value.byteLength > record.bytes - size) throw Error('Asset exceeds locked byte size');
      size += value.byteLength;
      digest.update(value);
      await file.writeFile(value);
    }
    if (size !== record.bytes || digest.digest('hex') !== record.sha256) throw Error('Asset version mismatch. Update the asset lock with the matching viewer release.');
    controller.signal.throwIfAborted();
    await file.close();
    file = undefined;
    await rename(temporary, destination);
    temporary = undefined;
  } catch (error) {
    controller.abort(error);
    try { if (reader) await reader.cancel(error); else if (response?.body) await response.body.cancel(error); } catch {}
    throw error;
  } finally {
    clearTimeout(timer);
    reader?.releaseLock();
    try { if (file) await file.close(); } finally { if (temporary) await unlink(temporary); }
  }
}
