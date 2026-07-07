const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { setAdminAccount, verifyAdminCredentials, loadAdminAccountFromDB } = require('../server');

test('registers and verifies admin credentials from a custom file', async () => {
  const tempFile = path.join(os.tmpdir(), `admin-auth-${Date.now()}.json`);
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

  const saved = await setAdminAccount({ username: 'superadmin', password: 'P@ssw0rd123' }, tempFile);
  assert.equal(saved.username, 'superadmin');
  assert.ok(saved.passwordHash);

  const loaded = loadAdminAccountFromDB(tempFile);
  assert.equal(loaded.username, 'superadmin');
  assert.equal(await verifyAdminCredentials('superadmin', 'P@ssw0rd123', tempFile), true);
  assert.equal(await verifyAdminCredentials('superadmin', 'wrong-password', tempFile), false);

  fs.unlinkSync(tempFile);
});
