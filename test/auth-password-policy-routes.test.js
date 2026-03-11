const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../src/app');

test('POST /api/auth/register-initial-admin returns clear message for predictable passwords', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/register-initial-admin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'first.admin@example.com',
        displayName: 'First Admin',
        password: 'Password123!!'
      })
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'Password is too common or predictable. Choose a less obvious password.');
  } finally {
    server.close();
  }
});
