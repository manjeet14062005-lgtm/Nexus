const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { UpstashRedisRateLimiter } = require('./rateLimiter');
function provider(t, payload, status = 200) {
  const requests = [];
  t.mock.method(https, 'request', (options, callback) => {
    const request = new EventEmitter(); let body = '';
    request.write = value => { body += value; };
    request.end = () => queueMicrotask(() => {
      requests.push({options, command: JSON.parse(body)});
      const response = new EventEmitter(); response.statusCode = status;
      callback(response);
      const value = typeof payload === 'function' ? payload() : payload;
      response.emit('data', Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
      response.emit('end');
    });
    request.destroy = error => request.emit('error', error);
    return request;
  });
  return requests;
}
const limiter = () => new UpstashRedisRateLimiter({url:'https://redis.example.test',token:'test-only-token'});
const options = {limit:12,windowMs:60000};
test('the real pipeline response shape allows a request below its limit', async t => {
  const requests = provider(t,[{result:1},{result:1}]);
  const result = await limiter().consume('workspace-ai:test-account',options);
  assert.equal(result.limited,false); assert.equal(result.remaining,11);
  assert.ok(result.resetAt > Date.now());
  assert.equal(requests[0].options.path,'/pipeline');
  assert.equal(requests[0].options.rejectUnauthorized,true);
  assert.equal(requests[0].options.headers.Authorization,'Bearer test-only-token');
  const commands=requests[0].command;
  assert.equal(commands[0][0],'INCR'); assert.equal(commands[1][0],'EXPIRE');
  assert.equal(commands[0][1],commands[1][1]); assert.equal(commands[1][2],61);
  assert.ok(!commands[0][1].includes('test-account'));
});
test('requests above the distributed limit stay blocked', async t => {
  provider(t,[{result:13},{result:1}]);
  assert.deepEqual((({limited,remaining})=>({limited,remaining}))(await limiter().consume('one',options)),{limited:true,remaining:0});
});
test('provider authentication errors remain failures, never successful checks', async t => {
  provider(t,{error:'Unauthorized'},401);
  await assert.rejects(limiter().consume('one',options),/HTTP 401/);
});
test('an error within the pipeline remains a service failure', async t => {
  provider(t,[{error:'ERR counter unavailable'},{result:1}]);
  await assert.rejects(limiter().consume('one',options),/counter unavailable/);
});
test('a failed expiry command cannot report a successful rate-limit check', async t => {
  provider(t,[{result:1},{error:'ERR expiry unavailable'}]);
  await assert.rejects(limiter().consume('one',options),/expiry unavailable/);
});
test('a missing expiry and invalid counters fail closed', async t => {
  const payloads=[[{result:1},{result:0}],[{result:null},{result:1}],[{result:-1},{result:1}],[{result:1.5},{result:1}],[{result:1}],{result:1}];
  let current;
  provider(t,()=>current);
  for(const payload of payloads){current=payload;
    await assert.rejects(limiter().consume('one',options),/Invalid distributed rate-limit/);
  }
});
test('malformed JSON fails without disabling distributed protection', async t => {
  provider(t,'not-json');await assert.rejects(limiter().consume('one',options),/Invalid Upstash response/);
});
