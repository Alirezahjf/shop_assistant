// ============================================================================
// tests/ai-params.test.js — پارامترهای درخواست AvalAI (مطابق مستندات رسمی)
// ----------------------------------------------------------------------------
// اجرا: node --test tests/ai-params.test.js
//
// منبع: https://docs.avalai.ir/en/api-reference/chat
//   • max_completion_tokens جایگزین رسمی max_tokens (که Legacy/Deprecated است و
//     «با بعضی مدل‌های reasoning سازگار نیست»).
//   • بعضی مدل‌ها temperature/top_p را رد می‌کنند (مثلاً kimi فقط
//     reasoning_effort:"max" را می‌پذیرد و می‌گوید temperature را حذف کن).
//   • glm-5.3 نیاز به thinking.type:"enabled" + reasoning_effort دارد.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';

const ai = await import('../smart-shopping-assistant/lib/ai.js');

test('پیش‌فرض: max_completion_tokens فرستاده می‌شود نه max_tokens (Legacy)', () => {
  const body = ai.buildRequestBody({
    model: 'qwen3.8-flash',
    messages: [{ role: 'user', content: 'سلام' }],
    temperature: 0.7,
    maxOutputTokens: 900,
  });
  assert.equal(body.max_completion_tokens, 900);
  assert.equal(body.max_tokens, undefined, 'max_tokens نباید به‌صورت پیش‌فرض فرستاده شود');
  assert.equal(body.model, 'qwen3.8-flash');
});

test('مدل‌های kimi: temperature حذف و reasoning_effort="max" اضافه می‌شود', () => {
  const body = ai.buildRequestBody({
    model: 'kimi-k3',
    messages: [{ role: 'user', content: 'سلام' }],
    temperature: 0.7,
    maxOutputTokens: 900,
  });
  assert.equal(body.temperature, undefined, 'مستندات: برای kimi نباید temperature فرستاد');
  assert.equal(body.reasoning_effort, 'max');
  assert.equal(body.max_completion_tokens, 900);
});

test('glm-5.3: thinking.type="enabled" الزامی است و temperature فرستاده نمی‌شود', () => {
  const body = ai.buildRequestBody({
    model: 'glm-5.3',
    messages: [{ role: 'user', content: 'سلام' }],
    temperature: 0.7,
    maxOutputTokens: 900,
  });
  assert.deepEqual(body.thinking, { type: 'enabled' });
  assert.ok(['low', 'high', 'max'].includes(body.reasoning_effort));
  assert.equal(body.temperature, undefined);
});

test('gpt-6-astra: reasoning_effort دارد و temperature مجاز است', () => {
  const body = ai.buildRequestBody({
    model: 'gpt-6-astra',
    messages: [{ role: 'user', content: 'سلام' }],
    temperature: 0.4,
    maxOutputTokens: 500,
  });
  assert.ok(typeof body.reasoning_effort === 'string');
  assert.equal(body.temperature, 0.4);
  assert.equal(body.max_completion_tokens, 500);
});

test('samplingAllowed برای مدل‌های حساس false و برای بقیه true است', () => {
  assert.equal(ai.samplingAllowed('kimi-k3'), false);
  assert.equal(ai.samplingAllowed('glm-5.3'), false);
  assert.equal(ai.samplingAllowed('qwen3.8-flash'), true);
  assert.equal(ai.samplingAllowed('glm-5.3-flash'), true);
  assert.equal(ai.samplingAllowed('gpt-6-astra'), true);
});

test('بدنهٔ درخواست فقط نقش‌های مجاز و طول محدود دارد', () => {
  const long = 'a'.repeat(5000);
  const body = ai.buildRequestBody({
    model: 'qwen3.8-flash',
    messages: [{ role: 'user', content: long }],
    maxOutputTokens: 10,
  });
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, 'user');
});
