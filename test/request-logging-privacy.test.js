const test = require('node:test');
const assert = require('node:assert/strict');

const { app, pool } = require('../src/app');

test('request logging only emits allowlisted diagnostics for login and never logs credentials or auth headers', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  const originalQuery = pool.query;
  pool.query = async () => ({ rowCount: 0, rows: [] });

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer super-secret-token'
      },
      body: JSON.stringify({ email: 'user@example.com', password: 'secret-pass-123' })
    });

    assert.equal(response.status, 401);

    const requestStart = logs
      .map((entry) => {
        try { return JSON.parse(entry); } catch { return null; }
      })
      .find((entry) => entry && entry.event === 'request.start' && entry.path === '/api/auth/login');

    assert.equal(requestStart.requestHeaders.authorization, undefined);
    assert.equal(requestStart.requestHeaders['content-type'], 'application/json');
    assert.equal(typeof requestStart.requestBody.emailHash, 'string');
    assert.equal(requestStart.requestBody.credentialProvided, true);
    assert.equal(requestStart.requestBody.password, undefined);

    const serialized = JSON.stringify(requestStart);
    assert.equal(serialized.includes('super-secret-token'), false);
    assert.equal(serialized.includes('secret-pass-123'), false);
  } finally {
    server.close();
    pool.query = originalQuery;
    console.log = originalLog;
  }
});

test('request logging never includes reset token or plaintext password', async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  const originalConnect = pool.connect;
  const originalQuery = pool.query;
  pool.query = async () => ({ rowCount: 0, rows: [] });
  pool.connect = async () => ({
    async query(sql) {
      if (String(sql).includes('FROM password_reset_tokens')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {}
  });

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'reset-super-secret-token', password: 'Str0ng!Passphrase' })
    });

    assert.equal(response.status, 400);

    const requestStart = logs
      .map((entry) => {
        try { return JSON.parse(entry); } catch { return null; }
      })
      .find((entry) => entry && entry.event === 'request.start' && entry.path === '/api/auth/reset-password');

    assert.equal(requestStart.requestBody.resetOrInviteReferenceProvided, true);
    assert.equal(requestStart.requestBody.credentialProvided, true);
    assert.equal(requestStart.requestBody.token, undefined);

    const serialized = JSON.stringify(requestStart);
    assert.equal(serialized.includes('reset-super-secret-token'), false);
    assert.equal(serialized.includes('Str0ng!Passphrase'), false);
  } finally {
    server.close();
    pool.connect = originalConnect;
    pool.query = originalQuery;
    console.log = originalLog;
  }
});
