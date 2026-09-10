# ============================================================================
# test_sanitize.py — تست‌های حریم خصوصی سمت سرور (pytest)
# اجرا: cd admin-panel && python3 -m pytest tests/ -v
# ============================================================================
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.blocklists import (  # noqa: E402
    classify_domain_sensitivity, clean_domain, is_profane, normalize_text,
)
from app.sanitize import (  # noqa: E402
    ImportValidationError, final_scrub, validate_and_clean,
)
from app.interests import compute_interests, search_matches_category  # noqa: E402
from app.taxonomy import categorize_domain  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "sample_snapshot.json"


# ─────────────────────── نرمال‌سازی و دامنه ───────────────────────
class TestNormalize:
    def test_arabic_to_persian(self):
        assert normalize_text("كِتاب") == "کتاب"

    def test_zwnj_becomes_space(self):
        assert normalize_text("خرید\u200cکفش") == "خرید کفش"

    def test_collapse_spaces(self):
        assert normalize_text("خرید  کفش") == "خرید کفش"

    def test_clean_domain_prefix_only(self):
        assert clean_domain("WWW.Example.COM") == "example.com"
        assert clean_domain("awww.example.com") == "awww.example.com"
        assert clean_domain("www.www.ir") == "www.ir"


class TestSensitiveDomains:
    @pytest.mark.parametrize("domain,blocked", [
        ("web.telegram.org", True), ("t.me", True), ("wa.me", True),
        ("bale.ai", True), ("eitaa.com", True),
        ("bankmellat.ir", True), ("bpm.bankmellat.ir", True), ("shaparak.ir", True),
        ("zarinpal.com", True), ("nobitex.ir", True),
        ("pornhub.com", True), ("gmail.com", True), ("smtp.gmail.com", True),
        ("accounts.google.com", True), ("auth.mysite.com", True),
        ("digikala.com", False), ("github.com", False), ("aparat.com", False),
    ])
    def test_classification(self, domain, blocked):
        assert classify_domain_sensitivity(domain)[0] is blocked


class TestProfanity:
    def test_exact_duplicate_merge_semantics(self):
        assert normalize_text("خرید کفش") == normalize_text("خرید کفش")
        assert normalize_text("خرید کفش") != normalize_text("خرید کفش ورزشی")

    def test_profane_blocked(self):
        assert is_profane("دانلود سکس")
        assert is_profane("سکسی")
        assert is_profane("porn")

    def test_false_positives_kept(self):
        assert not is_profane("بکس ورزشی")
        assert not is_profane("سوکسالا")


# ─────────────────────── اعتبارسنجی فایل ایمپورتی ───────────────────────
class TestValidateAndClean:
    def test_valid_fixture_passes(self):
        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        snap = validate_and_clean(payload, "test.json")
        assert snap["stats"]["domains"] >= 1
        assert snap["stats"]["searches"] >= 1

    def test_cookie_value_never_stored(self):
        payload = {
            "schemaVersion": 2,
            "cookies": [
                {"domain": "example.com", "name": "prefs", "value": "TOPSECRET"},
                {"domain": "example.com", "name": "theme"},
            ],
        }
        snap = validate_and_clean(payload)
        # فیلد غیرمجاز value → فقط آن رکورد حذف؛ هیچ مقداری هم ذخیره نشده
        assert [c["name"] for c in snap["cookies"]] == ["theme"]
        assert "TOPSECRET" not in json.dumps(snap, ensure_ascii=False)

    def test_fully_malicious_file_rejected(self):
        payload = {
            "schemaVersion": 2,
            "cookies": [{"domain": "example.com", "name": "c", "value": "LEAK"}],
        }
        with pytest.raises(ImportValidationError):
            validate_and_clean(payload)

    def test_sensitive_domain_in_file_dropped(self):
        payload = {
            "schemaVersion": 2,
            "domains": [
                {"domain": "web.telegram.org", "visits": 10, "histogram": [0] * 7},
                {"domain": "digikala.com", "visits": 5, "histogram": [0] * 7},
            ],
        }
        snap = validate_and_clean(payload)
        domains = [d["domain"] for d in snap["domains"]]
        assert "web.telegram.org" not in domains
        assert "digikala.com" in domains

    def test_sensitive_cookie_name_dropped(self):
        payload = {
            "schemaVersion": 2,
            "cookies": [
                {"domain": "shop.com", "name": "PHPSESSID"},
                {"domain": "shop.com", "name": "theme"},
            ],
        }
        snap = validate_and_clean(payload)
        assert [c["name"] for c in snap["cookies"]] == ["theme"]

    def test_profanity_and_duplicates_server_side(self):
        payload = {
            "schemaVersion": 2,
            "searches": [
                {"term": "خرید کفش", "count": 1},
                {"term": "خرید  کفش", "count": 2},
                {"term": "خرید کفش ورزشی", "count": 1},
                {"term": "سکس", "count": 5},
            ],
        }
        snap = validate_and_clean(payload)
        terms = {normalize_text(s["term"]) for s in snap["searches"]}
        assert terms == {"خرید کفش", "خرید کفش ورزشی"}
        assert snap["searches"][0]["count"] == 3  # ادغام دوباره انجام شد

    def test_invalid_rejected(self):
        with pytest.raises(ImportValidationError):
            validate_and_clean({"schemaVersion": 9})
        with pytest.raises(ImportValidationError):
            validate_and_clean("not a dict")
        with pytest.raises(ImportValidationError):
            validate_and_clean({})  # خالی کامل

    def test_leak_patterns_scrubbed(self):
        payload = {
            "schemaVersion": 2,
            "searches": [
                {"term": "ali@example.com", "count": 1},
                {"term": "سلام", "count": 1},
            ],
        }
        snap = validate_and_clean(payload)
        terms = [s["term"] for s in snap["searches"]]
        assert "ali@example.com" not in terms
        assert "سلام" in terms


class TestFinalScrub:
    def test_extra_fields_removed(self):
        snap = {
            "domains": [{"domain": "a.com", "visits": 1, "lastVisit": 0,
                         "histogram": [0] * 7, "hack": 1}],
            "searches": [], "cookies": [],
        }
        out, issues = final_scrub(snap)
        assert out["domains"] == []
        assert len(issues) == 1


# ─────────────────────── دسته‌بندی و علاقه‌مندی ───────────────────────
class TestTaxonomyAndInterests:
    def test_categories(self):
        assert categorize_domain("digikala.com") == "shopping"
        assert categorize_domain("en.wikipedia.org") == "reference"
        assert categorize_domain("ut.ac.ir") == "education"

    def test_interests_sections(self):
        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        snap = validate_and_clean(payload)
        secs = compute_interests(snap)
        ids = [s["id"] for s in secs]
        assert "top_searches" in ids and "top_sites" in ids and "categories" in ids

    def test_search_category_matching(self):
        domains = [{"domain": "digikala.com", "visits": 5}]
        assert search_matches_category("قیمت گوشی در digikala", "shopping", domains)
        assert not search_matches_category("آموزش پایتون", "shopping", domains)


class TestSearchFaKeywords:
    def test_persian_keywords_match(self):
        from app.interests import search_matches_category
        domains = [{"domain": "digikala.com", "visits": 5}]
        assert search_matches_category("خرید کفش", "shopping", domains)
        assert search_matches_category("قیمت گوشی سامسونگ", "tech-news", domains)
        assert search_matches_category("آموزش پایتون", "education", domains)
        assert search_matches_category("دانلود فیلم", "entertainment", domains)
        assert not search_matches_category("خرید کفش", "news", domains)
