# ============================================================================
# test_extproxy.py — تست پروکسی افزونه: اعتبارسنجی، rate-limit، دفاع‌ها
# ============================================================================
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import extproxy  # noqa: E402
from app.extproxy import ProxyError, build_system_prompt, validate_payload  # noqa: E402


class TestValidatePayload:
    def test_valid_minimal(self):
        out = validate_payload({"message": "سلام، دنبال گوشی هستم"})
        assert out["message"] == "سلام، دنبال گوشی هستم"
        assert out["history"] == []

    def test_empty_message_rejected(self):
        with pytest.raises(ProxyError):
            validate_payload({"message": "   "})
        with pytest.raises(ProxyError):
            validate_payload({})

    def test_message_length_capped(self):
        out = validate_payload({"message": "ا" * 5000})
        assert len(out["message"]) <= extproxy.EXT_MAX_MESSAGE_CHARS

    def test_history_roles_whitelisted_and_capped(self):
        history = (
            [{"role": "system", "content": "hack"}] * 3
            + [{"role": "user", "content": f"msg{i}"} for i in range(30)]
        )
        out = validate_payload({"message": "سلام", "history": history})
        assert all(m["role"] in ("user", "assistant") for m in out["history"])
        assert len(out["history"]) <= extproxy.EXT_MAX_HISTORY

    def test_context_sensitive_domain_dropped(self):
        out = validate_payload({
            "message": "سلام",
            "context": {"domains": ["web.telegram.org", "digikala.com", "javascript:alert(1)"]},
        })
        assert "web.telegram.org" not in out["context"]["domains"]
        assert "digikala.com" in out["context"]["domains"]
        assert all(d.startswith(("a", "b", "c")) or "." in d for d in out["context"]["domains"])

    def test_context_profane_search_dropped(self):
        out = validate_payload({
            "message": "سلام",
            "context": {"searches": ["قیمت لپ‌تاپ", "سکس", "خرید کفش"]},
        })
        assert out["context"]["searches"] == ["قیمت لپ‌تاپ", "خرید کفش"]

    def test_control_chars_stripped(self):
        out = validate_payload({"message": "سلام\x00\x1fدوستان"})
        assert "\x00" not in out["message"] and "\x1f" not in out["message"]


class TestSystemPrompt:
    def test_contains_protocol_and_no_client_control(self):
        prompt = build_system_prompt({"domains": ["digikala.com"], "searches": ["خرید کفش"], "categories": []})
        assert "[PRODUCT]" in prompt and "[SHOPS]" in prompt
        assert "digikala.com" in prompt and "خرید کفش" in prompt
        assert "هیچ داده حساسی در دسترس تو نیست" in prompt

    def test_empty_context_greeting_instruction(self):
        prompt = build_system_prompt({"domains": [], "searches": [], "categories": []})
        assert "داده‌ای از کاربر موجود نیست" in prompt


class TestRateLimit:
    def setup_method(self):
        extproxy._hits.clear()
        extproxy._daily.update({"date": "", "count": 0})

    def test_allows_within_limits(self):
        for _ in range(extproxy.EXT_RATE_PER_MINUTE):
            assert extproxy.check_rate_limit("1.2.3.4") is None

    def test_blocks_over_minute_limit(self):
        for _ in range(extproxy.EXT_RATE_PER_MINUTE):
            extproxy.check_rate_limit("1.2.3.4")
        limited = extproxy.check_rate_limit("1.2.3.4")
        assert limited is not None
        wait, message = limited
        assert 0 < wait <= 61 and "آرام‌تر" in message

    def test_per_ip_isolation(self):
        for _ in range(extproxy.EXT_RATE_PER_MINUTE):
            extproxy.check_rate_limit("1.1.1.1")
        assert extproxy.check_rate_limit("2.2.2.2") is None

    def test_global_daily_cap(self):
        extproxy._daily.update({"date": extproxy._today(), "count": extproxy.EXT_DAILY_LIMIT})
        limited = extproxy.check_rate_limit("9.9.9.9")
        assert limited is not None and "روزانه" in limited[1]
