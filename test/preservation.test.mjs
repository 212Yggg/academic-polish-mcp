import test from 'node:test';
import assert from 'node:assert/strict';
import { collectProtectedTokens, findPreservationRisks } from '../dist/preservation.js';

test('数字紧贴中文时仍检测改动，10不能被100的子串蒙混', () => {
  for (const [before, after] of [['使用100份问卷。', '使用200份问卷。'], ['有10例。', '有100例。']]) {
    assert.ok(findPreservationRisks(collectProtectedTokens(before, []), after).length > 0);
  }
});

test('检测新增数字、新增引文和重复引文丢失', () => {
  assert.ok(findPreservationRisks(collectProtectedTokens('结果可能有效[1]。', []), '结果有效[1][2]，提高20%。').length > 0);
  assert.ok(findPreservationRisks(collectProtectedTokens('甲[1]，乙[1]。', []), '甲[1]，乙。').length > 0);
});

test('允许语言润色，保持公式、DOI、链接、作者年份引文及指定术语', () => {
  const protectedText = '100份问卷、2.5%、$y=x+1$、（张三，2023）、Transformer、https://example.org/paper、10.1234/abc';
  const before = collectProtectedTokens(`我们使用了${protectedText}。`, ['Transformer']);
  assert.deepEqual(findPreservationRisks(before, `研究采用${protectedText}。`), []);
  assert.ok(findPreservationRisks(before, `研究采用${protectedText.replace('$y=x+1$', '$y=x+2$')}。`).some(s => s.includes('公式')));
});
