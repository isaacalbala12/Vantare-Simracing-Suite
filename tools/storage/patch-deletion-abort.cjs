// #1608: prepared compatibility patch for Storage v1.70.3, never a SQL bypass.
// Abort must remove backend bytes before metadata. Fail closed on source drift.
const fs = require('node:fs');
const crypto = require('node:crypto');
const file = process.argv[2] || '/app/dist/storage/protocols/s3/s3-handler.js';
const source = fs.readFileSync(file, 'utf8');
const hash = crypto.createHash('sha256').update(source).digest('hex');
if (hash !== '5a9778ad3f9305ca46bb9d5612356799ae1459b469c322a59512878c3b81f928') {
  throw new Error('storage_1_70_3_source_changed');
}
const start = source.indexOf('  async abortMultipartUpload(command) {');
const end = source.indexOf('  async headObject(command) {', start);
let abort = source.slice(start, end);
abort = abort.replace('"id,version,user_metadata,metadata"',
  '"id,bucket_id,key,version,user_metadata,metadata"');
const check = '    const uploader = new import_uploader.Uploader(this.storage.backend, this.storage.db, this.storage.location);';
abort = abort.replace(check, `    if (multipart.bucket_id !== Bucket || multipart.key !== Key) {
      throw import_errors.ERRORS.AccessDenied("Multipart path mismatch");
    }
    // role comes from the JWT verified by signature-v4 and the db plugin.
    // Service abort is a removal; it must never simulate INSERT/UPSERT.
    // All actual writes, including service INSERT, keep the SQL barrier.
    if (this.storage.db.role !== "service_role") {
${check}`);
abort = abort.replace('    try {\n      await this.storage.backend.abortMultipartUpload(',
  '    }\n    try {\n      await this.storage.backend.abortMultipartUpload(');
if (!abort.includes('Multipart path mismatch') || !abort.includes('if (this.storage.db.role')) {
  throw new Error('storage_abort_patch_not_applied');
}
fs.writeFileSync(file, source.slice(0, start) + abort + source.slice(end));
console.log('Storage v1.70.3 deletion abort patched; backend removal and metadata order preserved');
