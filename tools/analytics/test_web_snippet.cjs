// Ejecuta el snippet entregado, con almacenamiento/red simulados y clave ficticia.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const document = fs.readFileSync(path.join(__dirname, '../../vantare-v2/docs/analytics/web-snippet.md'), 'utf8');
const source = document.match(/```js\r?\n([\s\S]*?)```/)[1];
const storage = new Map();
const requests = [];
let accesses = 0;
let nextId = 0;
const context = vm.createContext({
  AbortController,
  setTimeout: () => 1,
  clearTimeout: () => {},
  crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}` },
  localStorage: {
    getItem: key => { accesses++; return storage.get(key); },
    setItem: (key, value) => { accesses++; storage.set(key, value); },
    removeItem: key => { accesses++; storage.delete(key); },
  },
  fetch: (url, options) => {
    requests.push({url, ...options});
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  },
});
vm.runInContext(source, context);

(async () => {
  const client = context.vantareDownloads('public-test-only');
  assert.equal(accesses, 0);
  await client.download('windows');
  assert.equal(accesses, 0);
  assert.equal(requests.length, 0);
  client.setConsent(false);
  await client.download('windows');
  assert.equal(requests.length, 0);
  client.setConsent(true);
  const firstId = storage.get('vantare-analytics-web-id-v1');
  await client.download('private-path');
  assert.equal(requests.length, 0);
  const pending = client.download('windows');
  assert.equal(requests.length, 1);
  const payload = JSON.parse(requests[0].body);
  assert.deepEqual(payload, {
    api_key: 'public-test-only', event: 'download_requested', distinct_id: firstId,
    properties: {platform: 'windows', $process_person_profile: false, $ip: null, $geoip_disable: true},
  });
  assert.equal(requests[0].credentials, 'omit');
  assert.equal(requests[0].referrerPolicy, 'no-referrer');
  assert.equal(requests[0].redirect, 'error');
  storage.set('unrelated', 'preserved');
  client.setConsent(false);
  await pending;
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(storage.get('vantare-analytics-web-id-v1'), undefined);
  assert.equal(storage.get('unrelated'), 'preserved');
  await client.download('windows');
  assert.equal(requests.length, 1);
  client.setConsent(true);
  assert.notEqual(storage.get('vantare-analytics-web-id-v1'), firstId);
  console.log('PASS: snippet sin red/ID antes del permiso; payload cerrado; revocación y nuevo UUID');
})().catch(error => { console.error(error); process.exitCode = 1; });
