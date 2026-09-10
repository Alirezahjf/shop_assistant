# ============================================================================
# tests/test_avalai_params.py — بدنهٔ درخواست و نگاشت خطاهای AvalAI
# ----------------------------------------------------------------------------
# منبع: https://docs.avalai.ir/en/api-reference/chat و /en/quickstart
#   • max_completion_tokens جایگزین رسمی max_tokens (Legacy) است.
#   • بعضی مدل‌ها temperature/top_p را رد می‌کنند؛ glm-5.3 نیاز به thinking دارد.
#   • کدها: ۴۰۱/۴۰۳ کلید یا دسترسی، ۴۰۲ اعتبار، ۴۰۴ مدل، ۴۲۹ محدودیت نرخ.
# ============================================================================
import json
import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import avalai  # noqa: E402


# ─────────────────────────── بدنهٔ درخواست ───────────────────────────
def test_uses_max_completion_tokens_not_legacy_max_tokens():
    payload = avalai.build_payload("qwen3.8-flash", [{"role": "user", "content": "سلام"}],
                                   temperature=0.7, max_output_tokens=900)
    assert payload["max_completion_tokens"] == 900
    assert "max_tokens" not in payload


def test_legacy_fallback_when_requested():
    payload = avalai.build_payload("qwen3.8-flash", [{"role": "user", "content": "سلام"}],
                                   max_output_tokens=900, use_legacy_max_tokens=True)
    assert payload["max_tokens"] == 900
    assert "max_completion_tokens" not in payload


def test_kimi_omits_temperature_and_sets_max_effort():
    payload = avalai.build_payload("kimi-k3", [{"role": "user", "content": "سلام"}],
                                   temperature=0.7, max_output_tokens=100)
    assert "temperature" not in payload
    assert payload["reasoning_effort"] == "max"


def test_glm_5_3_requires_thinking():
    payload = avalai.build_payload("glm-5.3", [{"role": "user", "content": "سلام"}],
                                   temperature=0.7, max_output_tokens=100)
    assert payload["thinking"] == {"type": "enabled"}
    assert payload["reasoning_effort"] in ("low", "high", "max")
    assert "temperature" not in payload


def test_sampling_allowed_matrix():
    assert avalai.sampling_allowed("kimi-k3") is False
    assert avalai.sampling_allowed("glm-5.3") is False
    assert avalai.sampling_allowed("qwen3.8-flash") is True
    assert avalai.sampling_allowed("glm-5.3-flash") is True
    assert avalai.sampling_allowed("gpt-6-astra") is True


# ─────────────────────────── نگاشت خطاها ───────────────────────────
@pytest.mark.parametrize("status,expected", [
    (401, "کلید AvalAI نامعتبر است یا دسترسی ندارد."),
    (403, "دسترسی به این مدل مجاز نیست"),
    (402, "اعتبار حساب AvalAI کافی نیست"),
    (404, "مدل انتخابی در AvalAI یافت نشد."),
    (429, "محدودیت نرخ AvalAI"),
])
def test_error_messages(status, expected):
    err = avalai._friendly(status, "")
    assert expected in str(err)


def test_400_unknown_parameter_is_retryable():
    body = json.dumps({"error": {"message": "Unknown parameter: 'max_completion_tokens'"}})
    err = avalai._friendly(400, body)
    assert err.retryable is True


def test_500_is_retryable():
    assert avalai._friendly(500, "").retryable is True


# ─────────────────────────── فراخوانی ───────────────────────────
class _FakeResponse:
    def __init__(self, status_code, payload=None, text="", headers=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text or json.dumps(payload if payload is not None else {})
        self.headers = headers or {}

    def json(self):
        return self._payload


class _FakeClient:
    """شبیه‌ساز httpx.Client — ترتیبِ پاسخ‌ها را از responses می‌خواند."""

    def __init__(self, responses, **kwargs):
        self.responses = list(responses)
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def post(self, url, headers=None, json=None):
        self.calls.append({"url": url, "headers": headers, "json": json})
        return self.responses.pop(0)

    def get(self, url, headers=None):
        self.calls.append({"url": url, "headers": headers})
        return self.responses.pop(0)


def test_falls_back_to_legacy_max_tokens_on_unknown_parameter(monkeypatch):
    bad = _FakeResponse(400, text="Unknown parameter: 'max_completion_tokens'")
    ok = _FakeResponse(200, payload={
        "choices": [{"message": {"content": "متصل"}}], "model": "qwen3.8-flash"})
    fake = _FakeClient([bad, ok])
    monkeypatch.setattr(avalai.httpx, "Client", lambda *a, **kw: fake)
    monkeypatch.setattr(avalai.time, "sleep", lambda *a: None)

    out = avalai.chat_completion("sk-test", "qwen3.8-flash", [{"role": "user", "content": "hi"}])
    assert out["text"] == "متصل"
    assert "max_completion_tokens" in fake.calls[0]["json"]
    assert "max_tokens" in fake.calls[1]["json"]


def test_request_id_header_is_not_raised_and_request_is_authenticated(monkeypatch):
    ok = _FakeResponse(200,
                       payload={"choices": [{"message": {"content": "ok"}}], "model": "qwen3.8-flash"},
                       headers={"avalai-request-id": "019ac4a0-a8f4-7041-845f-3ea8f15dcf1a"})
    fake = _FakeClient([ok])
    monkeypatch.setattr(avalai.httpx, "Client", lambda *a, **kw: fake)
    avalai.chat_completion("sk-test", "qwen3.8-flash", [{"role": "user", "content": "hi"}])
    call = fake.calls[0]
    assert call["headers"]["Authorization"] == "Bearer sk-test"
    assert call["url"].endswith("/chat/completions")


def test_list_models_prefers_authenticated_endpoint(monkeypatch):
    ok = _FakeResponse(200, payload={"data": [{"id": "qwen3.8-flash"}, {"id": "glm-5.3-flash"}]})
    fake = _FakeClient([ok])
    monkeypatch.setattr(avalai.httpx, "Client", lambda *a, **kw: fake)
    models = avalai.list_models("sk-test")
    assert [m["id"] for m in models] == ["qwen3.8-flash", "glm-5.3-flash"]
    assert fake.calls[0]["url"].endswith("/models")
    assert fake.calls[0]["headers"]["Authorization"] == "Bearer sk-test"


def test_list_models_falls_back_to_public_catalog(monkeypatch):
    fail = _FakeResponse(401, text="unauthorized")
    ok = _FakeResponse(200, payload={"data": [{"id": "gpt-6-astra"}]})
    fake = _FakeClient([fail, ok])
    monkeypatch.setattr(avalai.httpx, "Client", lambda *a, **kw: fake)
    models = avalai.list_models("sk-test")
    assert [m["id"] for m in models] == ["gpt-6-astra"]
    assert "public/models" in fake.calls[1]["url"]


def test_list_models_returns_empty_list_on_total_failure(monkeypatch):
    fake = _FakeClient([])
    monkeypatch.setattr(avalai.httpx, "Client", lambda *a, **kw: fake)

    def boom(*a, **kw):
        raise OSError("network down")

    monkeypatch.setattr(fake, "get", boom)
    assert avalai.list_models("sk-test") == []
    assert avalai.list_models(None) == []


def test_get_api_key_raises_persian_message(monkeypatch):
    monkeypatch.setattr(avalai, "get_secret", lambda name: "")
    with pytest.raises(avalai.AvalAiError) as exc:
        avalai.get_api_key()
    assert "کلید AvalAI تنظیم نشده است" in str(exc.value)
