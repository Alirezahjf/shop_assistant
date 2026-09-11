# ============================================================================
# tests/test_avalai_rate_limit.py — تست مدیریت 429/402 و کول‌داون و single-flight
# ----------------------------------------------------------------------------
# مرجع: docs.avalai.ir/en/guides/error-handling و /en/guides/rate-limits
#   • 429 با هدر Retry-After (عدد ثانیه یا HTTP-date) → sleep دقیق همان مقدار
#   • پس از اتمام MAX_RETRIES، کول‌داون thread-safe per-key (حداقل ۱۰ ثانیه)
#   • single-flight per-key با BoundedSemaphore(1) non-blocking → 409
#   • 402 اعتبار ناکافی → پیام «اعتبار حساب AvalAI کافی نیست — از داشبورد شارژ کنید»
#     و نگاشت در API به 400 نه 502
#   • GET /api/models کش ده‌دقیقه‌ای و soft-fail 429 به فهرست ایستا
# ============================================================================
import json
import os
import sys
import time
import threading
import email.utils
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import avalai  # noqa: E402
from app import config as app_config  # noqa: E402
from app.main import _map_avalai_error_to_json_response  # noqa: E402


# ───────────────────────────── فیک کلاینت ─────────────────────────────
class _FakeResponse:
    def __init__(self, status_code, payload=None, text="", headers=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text or json.dumps(payload if payload is not None else {})
        self.headers = headers or {}

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, responses, **kwargs):
        self.responses = list(responses)
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def post(self, url, headers=None, json=None):
        self.calls.append({"url": url, "headers": headers, "json": json, "method": "post"})
        if not self.responses:
            raise AssertionError("no more mocked responses")
        return self.responses.pop(0)

    def get(self, url, headers=None):
        self.calls.append({"url": url, "headers": headers, "method": "get"})
        if not self.responses:
            raise AssertionError("no more mocked responses for GET")
        return self.responses.pop(0)


# ───────────────────────────── تست‌ها ─────────────────────────────
def setup_function():
    avalai._reset_state_for_tests()


def teardown_function():
    avalai._reset_state_for_tests()


def test_parse_retry_after_seconds():
    assert avalai._parse_retry_after("3") == 3.0
    assert avalai._parse_retry_after("3.5") == 3.5
    assert avalai._parse_retry_after("  10 ") == 10.0


def test_parse_retry_after_http_date():
    future = datetime.now(timezone.utc) + timedelta(seconds=5)
    http_date = email.utils.format_datetime(future)
    parsed = avalai._parse_retry_after(http_date)
    assert parsed is not None
    # تقریباً ۵ ثانیه (با تلورانس 2 ثانیه برای اجرای تست)
    assert 2.0 <= parsed <= 8.0


def test_429_retry_after_exact_sleep_then_success(monkeypatch):
    # 429 با Retry-After:3 سپس 200
    r1 = _FakeResponse(429, text="rate limit", headers={"Retry-After": "3", "avalai-request-id": "req-1"})
    r2 = _FakeResponse(200, payload={"choices": [{"message": {"content": "سلام"}}], "model": "qwen3.8-flash"},
                       headers={"avalai-request-id": "req-2"})
    fake = _FakeClient([r1, r2])

    sleeps = []

    def fake_sleep(s):
        sleeps.append(s)

    monkeypatch.setattr(avalai.httpx, "Client", lambda *a, **kw: fake)
    monkeypatch.setattr(avalai, "_sleep", fake_sleep)
    monkeypatch.setenv("AVALAI_MAX_RETRIES", "3")
    monkeypatch.setenv("AVALAI_RETRY_BASE", "2.5")

    out = avalai.chat_completion("sk-test-429", "qwen3.8-flash", [{"role": "user", "content": "hi"}])
    assert out["text"] == "سلام"
    # باید دقیقاً ۳ ثانیه خوابیده باشد (Retry-After مقدم بر jitter است)
    assert len(sleeps) == 1
    assert sleeps[0] == 3.0
    assert len(fake.calls) == 2


def test_exhaust_retries_then_cooldown_active_no_network_call(monkeypatch):
    # ۴ بار 429 (MAX_RETRIES=3 → ۴ تلاش)
    responses = [
        _FakeResponse(429, text="rate limit", headers={"Retry-After": "1", "avalai-request-id": f"req-{i}"})
        for i in range(4)
    ]
    fake = _FakeClient(responses)

    monkeypatch.setattr(avalai.httpx, "Client", lambda *a, **kw: fake)
    monkeypatch.setattr(avalai, "_sleep", lambda s: None)
    monkeypatch.setenv("AVALAI_MAX_RETRIES", "3")
    monkeypatch.setenv("AVALAI_RETRY_BASE", "0.1")

    with pytest.raises(avalai.AvalAiError) as exc:
        avalai.chat_completion("sk-cooldown", "qwen3.8-flash", [{"role": "user", "content": "hi"}])

    assert exc.value.status == 429
    assert exc.value.retry_after is not None
    # کول‌داون حداقل ۱۰ ثانیه
    assert exc.value.retry_after >= 10.0
    assert "محدودیت نرخ AvalAI" in str(exc.value)

    # اکنون یک درخواست جدید با همان کلید — نباید هیچ تماسی به شبکه بزند (کول‌داون فعال)
    # Client جدیدی می‌سازیم که اگر صدا زده شود خطا می‌دهد
    def boom_client(*a, **kw):
        raise AssertionError("network call during cooldown — should be blocked")

    monkeypatch.setattr(avalai.httpx, "Client", boom_client)

    with pytest.raises(avalai.AvalAiError) as exc2:
        avalai.chat_completion("sk-cooldown", "qwen3.8-flash", [{"role": "user", "content": "hi2"}])

    assert exc2.value.status == 429
    # پیام باید شامل «ثانیه دیگر» باشد
    assert "ثانیه دیگر" in str(exc2.value)
    assert exc2.value.retry_after is not None


def test_single_flight_concurrent_second_gets_409(monkeypatch):
    # کلاینت کند که ۲ ثانیه طول می‌کشد
    def slow_response(*a, **kw):
        class SlowClient:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def post(self, *args, **kwargs):
                time.sleep(0.6)
                return _FakeResponse(200, payload={"choices": [{"message": {"content": "ok"}}], "model": "m"})

            def get(self, *args, **kwargs):
                return _FakeResponse(200, payload={"data": []})

        return SlowClient()

    monkeypatch.setattr(avalai.httpx, "Client", slow_response)
    monkeypatch.setattr(avalai, "_sleep", lambda s: None)

    results = []

    def first():
        try:
            avalai.chat_completion("sk-same-key", "qwen3.8-flash", [{"role": "user", "content": "hi"}])
            results.append("ok")
        except Exception as e:
            results.append(f"err:{e}")

    def second():
        time.sleep(0.1)  # اطمینان از اینکه اولی lock را گرفته
        try:
            avalai.chat_completion("sk-same-key", "qwen3.8-flash", [{"role": "user", "content": "hi"}])
            results.append("ok2")
        except avalai.AvalAiError as e:
            results.append(f"avalai:{e.status}:{e}")
        except Exception as e:
            results.append(f"err2:{e}")

    t1 = threading.Thread(target=first)
    t2 = threading.Thread(target=second)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # یکی موفق، یکی 409
    assert any("ok" == r for r in results)
    assert any("409" in r and "تحلیل در حال انجام است" in r for r in results)


def test_402_maps_to_400_not_502_and_message():
    # پیام فارسی اعتبار
    err = avalai._friendly(402, "")
    assert "اعتبار حساب AvalAI کافی نیست" in str(err)
    assert err.retryable is False

    # نگاشت در main.py → 400
    avalai_err = avalai.AvalAiError(avalai._ERROR_MESSAGES[402], status=402)
    resp = _map_avalai_error_to_json_response(avalai_err)
    assert resp.status_code == 400
    body = json.loads(resp.body.decode())
    assert "اعتبار حساب AvalAI کافی نیست" in body["error"]
    # اطمینان از اینکه 502 نیست
    assert resp.status_code != 502


def test_401_maps_to_400_not_500():
    avalai_err = avalai.AvalAiError(avalai._ERROR_MESSAGES[401], status=401)
    resp = _map_avalai_error_to_json_response(avalai_err)
    assert resp.status_code == 400
    assert resp.status_code != 500
    assert resp.status_code != 502


def test_429_maps_to_429_with_retry_after_header():
    avalai_err = avalai.AvalAiError("محدودیت نرخ", status=429, retry_after=12.0, request_id="req-xyz")
    resp = _map_avalai_error_to_json_response(avalai_err)
    assert resp.status_code == 429
    assert resp.headers.get("Retry-After") == "12"
    body = json.loads(resp.body.decode())
    assert body["retryAfter"] == 12
    assert "محدودیت نرخ" in body["error"]


def test_409_maps_to_409():
    avalai_err = avalai.AvalAiError("تحلیل در حال انجام است؛ لطفاً صبر کنید", status=409)
    resp = _map_avalai_error_to_json_response(avalai_err)
    assert resp.status_code == 409


def test_5xx_maps_to_502():
    avalai_err = avalai.AvalAiError("خطای سرور", status=500, retryable=True)
    resp = _map_avalai_error_to_json_response(avalai_err)
    assert resp.status_code == 502


def test_list_models_cache_10min_and_soft_fail_429(monkeypatch):
    # مرحله اول: پاسخ موفق
    ok = _FakeResponse(200, payload={"data": [{"id": "qwen3.8-flash"}, {"id": "glm-5.3-flash"}]})
    fake = _FakeClient([ok])
    monkeypatch.setattr(avalai.httpx, "Client", lambda *a, **kw: fake)

    models = avalai.list_models("sk-cache-test")
    assert len(models) == 2

    # مرحله دوم: همان کلید در ۱۰ دقیقه → نباید به شبکه بزند (کش)
    def boom(*a, **kw):
        raise AssertionError("should be cached, no network")

    monkeypatch.setattr(avalai.httpx, "Client", boom)
    models2 = avalai.list_models("sk-cache-test")
    assert len(models2) == 2
    assert models2 == models

    # مرحله سوم: کش را با کلید دیگر تست کنیم که 429 soft-fail کند و خالی برگردد
    avalai._reset_state_for_tests()
    r429 = _FakeResponse(429, text="rate limit", headers={"Retry-After": "5"})
    fake429 = _FakeClient([r429, r429])  # اول /v1/models سپس /public/models هر دو 429
    monkeypatch.setattr(avalai.httpx, "Client", lambda *a, **kw: fake429)

    models3 = avalai.list_models("sk-429")
    # چون هر دو endpoint 429 دادند و کش قبلی نداریم، خالی برمی‌گردد (soft-fail)
    assert models3 == []

    # در لایهٔ main.py، 429 به فهرست ایستا map می‌شود — این را اینجا هم چک می‌کنیم
    avalai_err = avalai.AvalAiError("محدودیت نرخ", status=429, retry_after=7)
    # در main.py soft-fail به static تبدیل می‌شود؛ در avalai.list_models خالی می‌دهد
    # اما تست endpoint جداست — اینجا فقط soft-fail را چک کردیم


def test_max_retries_respects_env_and_retry_after(monkeypatch):
    # env MAX_RETRIES=1 → باید فقط ۲ درخواست بزند (تلاش اولیه + ۱ retry)
    r1 = _FakeResponse(429, text="rate limit", headers={"Retry-After": "2"})
    r2 = _FakeResponse(429, text="rate limit", headers={"Retry-After": "2"})
    fake = _FakeClient([r1, r2])

    sleeps = []
    monkeypatch.setattr(avalai.httpx, "Client", lambda *a, **kw: fake)
    monkeypatch.setattr(avalai, "_sleep", lambda s: sleeps.append(s))
    monkeypatch.setenv("AVALAI_MAX_RETRIES", "1")

    with pytest.raises(avalai.AvalAiError):
        avalai.chat_completion("sk-env-test", "qwen3.8-flash", [{"role": "user", "content": "hi"}])

    # دقیقاً ۱ بار sleep (بعد از تلاش اول) و ۲ تماس شبکه
    assert len(sleeps) == 1
    assert sleeps[0] == 2.0
    assert len(fake.calls) == 2
