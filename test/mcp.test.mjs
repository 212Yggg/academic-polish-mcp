import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const FAKE_KEY = 'local-test-credential';
const executable = fileURLToPath(new URL('../dist/index.js', import.meta.url));

function startClient(t, extraEnv) {
  const proc = spawn(process.execPath, [executable], {
    env: { ...process.env, LLM_API_KEY: '', ...extraEnv },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const waiting = new Map();
  let counter = 0;
  const lines = createInterface({ input: proc.stdout });
  proc.stderr.resume();
  lines.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); }
    catch { for (const item of waiting.values()) item.reject(new Error('Non-JSON output on MCP stdout')); return; }
    if (message.id != null) {
      const item = waiting.get(message.id);
      if (item) {
        clearTimeout(item.timer);
        waiting.delete(message.id);
        item.resolve(message);
      }
    }
  });
  proc.on('exit', () => {
    for (const item of waiting.values()) {
      clearTimeout(item.timer);
      item.reject(new Error('MCP exited while a request was pending'));
    }
    waiting.clear();
  });
  t.after(() => { lines.close(); proc.stdin.end(); proc.kill(); });
  function request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++counter;
      const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`Timed out: ${method}`)); }, 8000);
      waiting.set(id, { resolve, reject, timer });
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  return { request, notify(method) { proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'); } };
}

async function initialize(client) {
  const result = await client.request('initialize', {
    protocolVersion: '2025-11-25', capabilities: {},
    clientInfo: { name: 'local-regression-test', version: '1.0.0' },
  });
  assert.equal(result.result.serverInfo.name, 'academic-polish-mcp');
  client.notify('notifications/initialized');
}

test('MCP协议和模拟模型联调，不使用真实API Key', { timeout: 30000 }, async (t) => {
  const original = '本研究使用100份问卷[1]，结果可能有效。';
  const revised = '本研究基于100份问卷[1]，结果提示该方法可能有效。';
  let responseMode = 'valid';
  const observed = [];
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    observed.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
    res.setHeader('Content-Type', 'application/json');
    if (responseMode === 'http-error') {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: `upstream echoed ${FAKE_KEY}` }));
      return;
    }
    const modelResult = {
      polished_text: responseMode === 'changed-number' ? revised.replace('100', '200') : revised,
      change_summary: ['优化学术表达。'], risk_flags: [],
    };
    res.end(JSON.stringify({ choices: [{
      finish_reason: responseMode === 'truncated' ? 'length' : 'stop',
      message: { content: responseMode === 'bad-json' ? 'not JSON' : JSON.stringify(modelResult) },
    }] }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { upstream.closeAllConnections(); upstream.close(resolve); }));
  const client = startClient(t, {
    LLM_API_KEY: FAKE_KEY,
    LLM_BASE_URL: `http://127.0.0.1:${upstream.address().port}`,
    LLM_MODEL: 'local-test-model', LLM_TIMEOUT_MS: '5000',
  });
  await initialize(client);
  const tools = await client.request('tools/list');
  assert.equal(tools.result.tools[0].name, 'polish_academic_text');
  const call = () => client.request('tools/call', { name: 'polish_academic_text', arguments: { text: original } });
  const decode = result => JSON.parse(result.result.content[0].text);

  await t.test('有效稿按原契约返回，保留人工复核标记', async () => {
    const response = await call();
    assert.notEqual(response.result.isError, true);
    const output = decode(response);
    assert.equal(output.polished_text, revised);
    assert.equal(output.preservation_check, 'passed');
    assert.equal(output.requires_human_review, true);
    assert.equal(observed[0].path, '/chat/completions');
    assert.equal(observed[0].auth, `Bearer ${FAKE_KEY}`);
    assert.equal(JSON.parse(observed[0].body.messages[1].content).source_text, original);
  });
  await t.test('模型误改数字时阻止采用候选稿', async () => {
    responseMode = 'changed-number';
    const output = decode(await call());
    assert.equal(output.polished_text, original);
    assert.equal(output.preservation_check, 'blocked');
    assert.ok(output.risk_flags.length > 0);
  });
  await t.test('HTTP错误不回显上游原始响应或凭据', async () => {
    responseMode = 'http-error';
    const response = await call();
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /401/);
    assert.ok(!JSON.stringify(response).includes(FAKE_KEY));
    assert.ok(!JSON.stringify(response).includes('upstream echoed'));
  });
  await t.test('拒绝非法JSON和截断稿', async () => {
    for (const mode of ['bad-json', 'truncated']) {
      responseMode = mode;
      const response = await call();
      assert.equal(response.result.isError, true);
    }
  });
  await t.test('空白输入被拒绝，不发送模型请求', async () => {
    const countBefore = observed.length;
    const response = await client.request('tools/call', { name: 'polish_academic_text', arguments: { text: '  ' } });
    assert.ok(response.error || response.result?.isError);
    assert.equal(observed.length, countBefore);
  });
});

test('未配置Key时仍可发现工具，调用明确报错', { timeout: 15000 }, async (t) => {
  const client = startClient(t, { LLM_API_KEY: '' });
  await initialize(client);
  const result = await client.request('tools/call', { name: 'polish_academic_text', arguments: { text: '待润色的段落。' } });
  assert.equal(result.result.isError, true);
  assert.match(result.result.content[0].text, /LLM_API_KEY/);
});
