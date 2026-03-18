const test = require('node:test');
const assert = require('node:assert/strict');

const { startServerRuntime } = require('../src/app/bootstrap');

test('startServerRuntime orchestrates startup validation, maintenance, and listen', async () => {
  const calls = [];
  const fakeApp = {
    listen(port, cb) {
      calls.push(`listen:${port}`);
      if (typeof cb === 'function') cb();
    }
  };

  const originalSetInterval = global.setInterval;
  let intervalHandler = null;
  global.setInterval = (handler, ms) => {
    calls.push(`interval:${ms}`);
    intervalHandler = handler;
    return { unref() { calls.push('unref'); } };
  };

  try {
    await startServerRuntime({
      validateAuthRuntimeSafety: () => calls.push('validateAuthRuntimeSafety'),
      validateRuntimeEnvironment: () => calls.push('validateRuntimeEnvironment'),
      cleanupAuditLogRetention: async () => calls.push('cleanupAuditLogRetention'),
      cleanupAuthLifecycleArtifacts: async () => calls.push('cleanupAuthLifecycleArtifacts'),
      incrementCleanupFailure: () => calls.push('incrementCleanupFailure'),
      cleanupIntervalMs: 12345,
      app: fakeApp,
      port: 7777,
      logger: { warn() {}, log() {} }
    });

    assert.deepEqual(calls.slice(0, 6), [
      'validateAuthRuntimeSafety',
      'validateRuntimeEnvironment',
      'cleanupAuditLogRetention',
      'cleanupAuthLifecycleArtifacts',
      'interval:12345',
      'unref'
    ]);
    assert.equal(calls.includes('listen:7777'), true);

    await intervalHandler();
    assert.equal(calls.filter((entry) => entry === 'cleanupAuthLifecycleArtifacts').length, 2);
  } finally {
    global.setInterval = originalSetInterval;
  }
});
