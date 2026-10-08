import {test, before, after, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {downloadAsset, verifiedCache} from '../asset-download.mjs';

const good = Buffer.from('verified fixture asset');
const record = bytes => ({bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
const prefix = path.resolve('data', '.atlas-asset-test-');
let origin, target, baseURL, targetURL, handler, directory, destination, targetHits;
const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}/`; };
const close = server => new Promise(resolve => {server.close(resolve); server.closeAllConnections();});
const clean = async () => assert.deepEqual(await readdir(directory), ['asset.bin']);
const preserved = async () => {assert.equal(await readFile(destination, 'utf8'), 'existing'); await clean();};

before(async () => {
  targetHits = 0;
  target = http.createServer((req, res) => {targetHits++; res.end(good);});
  targetURL = await listen(target);
  origin = http.createServer((req, res) => handler(req, res));
  baseURL = await listen(origin);
});
after(async () => {await close(origin); await close(target);});
beforeEach(async () => {
  await mkdir(path.dirname(prefix), {recursive: true});
  directory = await mkdtemp(prefix);
  destination = path.join(directory, 'asset.bin');
  await writeFile(destination, 'existing');
});
afterEach(async () => {
  assert.ok(directory.startsWith(prefix));
  await rm(directory, {recursive: true, force: true});
});

test('redirect statuses are rejected without contacting a second loopback target', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    handler = (req, res) => {res.writeHead(status, {Location: targetURL}); res.end();};
    await assert.rejects(downloadAsset(baseURL, destination, record(good)));
  }
  assert.equal(targetHits, 0);
  await preserved();
});

test('chunked decoded overflow aborts before the fixture sends its full body', async () => {
  let sent = 0;
  let closed;
  const disconnected = new Promise(resolve => {closed = resolve;});
  const total = 1024 * 1024;
  handler = (req, res) => {
    res.writeHead(200);
    const timer = setInterval(() => {
      sent += 2048;
      res.write(Buffer.alloc(2048));
      if (sent >= total) {clearInterval(timer); res.end();}
    }, 10);
    res.on('close', () => {clearInterval(timer); closed();});
  };
  await assert.rejects(downloadAsset(baseURL, destination, record(Buffer.alloc(1024))), /exceeds locked byte size/);
  await disconnected;
  assert.ok(sent < total, `sent ${sent} of ${total}`);
  await preserved();
});

test('excessive identity Content-Length is rejected before waiting for the body', async () => {
  handler = (req, res) => {res.writeHead(200, {'Content-Length': 1000000}); res.flushHeaders();};
  await assert.rejects(downloadAsset(baseURL, destination, record(good), {timeoutMs: 1000}), /exceeds locked byte size/);
  await preserved();
});

test('exact valid body replaces the destination only after complete verification', async () => {
  let firstChunk;
  const started = new Promise(resolve => {firstChunk = resolve;});
  let finish;
  handler = (req, res) => {
    res.write(good.subarray(0, 4));
    finish = () => res.end(good.subarray(4));
    firstChunk();
  };
  const pending = downloadAsset(baseURL, destination, record(good));
  await started;
  assert.equal(await readFile(destination, 'utf8'), 'existing');
  finish();
  await pending;
  assert.deepEqual(await readFile(destination), good);
  await clean();
  assert.equal(await verifiedCache(destination, record(good)), true);
});

test('short body fails exact length verification and cleans the temporary file', async () => {
  handler = (req, res) => res.end(good.subarray(0, 3));
  await assert.rejects(downloadAsset(baseURL, destination, record(good)), /version mismatch/);
  await preserved();
});

test('same-length wrong digest preserves the existing destination', async () => {
  handler = (req, res) => res.end(Buffer.alloc(good.length));
  await assert.rejects(downloadAsset(baseURL, destination, record(good)), /version mismatch/);
  await preserved();
  assert.equal(await verifiedCache(destination, record(good)), false);
});

test('timeout during a stalled body aborts and cleans the temporary file', async () => {
  handler = (req, res) => res.write(good.subarray(0, 3));
  await assert.rejects(downloadAsset(baseURL, destination, record(good), {timeoutMs: 150}));
  await preserved();
});

test('abrupt response termination cleans the temporary file', async () => {
  handler = (req, res) => {res.write(good.subarray(0, 3)); setTimeout(() => res.destroy(), 20);};
  await assert.rejects(downloadAsset(baseURL, destination, record(good)));
  await preserved();
});

test('gzip Content-Length may exceed decoded size without rejecting valid bytes', async () => {
  const payload = randomBytes(64), compressed = gzipSync(payload);
  assert.ok(compressed.length > payload.length);
  handler = (req, res) => {res.writeHead(200, {'Content-Encoding': 'gzip', 'Content-Length': compressed.length}); res.end(compressed);};
  await downloadAsset(baseURL, destination, record(payload));
  assert.deepEqual(await readFile(destination), payload);
  await clean();
});

test('compressed responses enforce the decoded byte budget', async () => {
  const compressed = gzipSync(Buffer.alloc(8192));
  assert.ok(compressed.length < 1024);
  handler = (req, res) => {res.writeHead(200, {'Content-Encoding': 'gzip', 'Content-Length': compressed.length}); res.end(compressed);};
  await assert.rejects(downloadAsset(baseURL, destination, record(Buffer.alloc(1024))), /exceeds locked byte size/);
  await preserved();
});

test('invalid lock byte budgets are rejected before any network request', async () => {
  let requests = 0;
  handler = (req, res) => {requests++; res.end(good);};
  for (const bytes of [-1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(downloadAsset(baseURL, destination, {...record(good), bytes}), /Invalid asset lock/);
  }
  assert.equal(requests, 0);
  await preserved();
});

test('cache validation rejects oversized and same-size wrong-digest files', async () => {
  await writeFile(destination, Buffer.alloc(good.length + 1));
  assert.equal(await verifiedCache(destination, record(good)), false);
  await writeFile(destination, Buffer.alloc(good.length));
  assert.equal(await verifiedCache(destination, record(good)), false);
  await clean();
});
