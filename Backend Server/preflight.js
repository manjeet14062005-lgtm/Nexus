require('dotenv').config();

const { collectConfigStatus } = require('./readiness');

function fail(message) {
  console.error(`FAIL: ${message}`);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function main() {
  const status = collectConfigStatus();
  const production = status.config.production;
  let failed = false;

  console.log('Nexus release preflight');
  console.log(`Environment: ${production ? 'production' : 'development'}`);

  if (status.blocking.length) {
    failed = true;
    status.blocking.forEach(fail);
  } else {
    pass('No configured blocking readiness requirements are present.');
  }

  if (production) {
    const origins = String(process.env.FRONTEND_URL || '')
      .split(',').map((value) => value.trim()).filter(Boolean);
    if (!origins.length) {
      failed = true;
      fail('Production requires FRONTEND_URL.');
    } else if (!origins.every((origin) => origin.startsWith('https://'))) {
      failed = true;
      fail('Every production FRONTEND_URL value must use HTTPS.');
    } else {
      pass('Production frontend origins are HTTPS-only.');
    }

    if (String(process.env.WEBHOOK_ALLOW_HTTP || '').toLowerCase() === 'true') {
      failed = true;
      fail('WEBHOOK_ALLOW_HTTP must be false in production.');
    } else {
      pass('HTTP webhook delivery is disabled in production.');
    }
  }

  if (status.config.horizontalScaling && !status.config.distributedRateLimiting) {
    failed = true;
    fail('Horizontal scaling requires distributed rate limiting.');
  } else {
    pass('Rate-limiter configuration is consistent with scaling mode.');
  }

  const role = status.config.processRole;
  if (!['api', 'all'].includes(role)) {
    failed = true;
    fail(`Unsupported server process role: ${role}`);
  } else {
    pass(`Server process role is ${role}.`);
  }

  status.warnings.forEach((warning) => console.warn(`WARN: ${warning}`));

  if (failed) {
    process.exitCode = 1;
    return;
  }

  pass('Release preflight completed successfully.');
}

main();
