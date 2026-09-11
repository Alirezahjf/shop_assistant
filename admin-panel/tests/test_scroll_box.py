# ============================================================================
# tests/test_scroll_box.py — اعتبارسنجی CSS/HTML اسکرول مستقل هر باکس
# ----------------------------------------------------------------------------
# این تست بدون مرورگر، وجود قوانین مورد نیاز را چک می‌کند؛ تست هدلس کامل
# در صورت در دسترس بودن Chromium توسط اسکریپت Node اجرا می‌شود، اما برای
# محیط‌های بدون اینترنت/مرورگر همین چک‌های استاتیک کافی است.
# ============================================================================
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

CSS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "static", "admin.css")
INDEX_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "templates", "index.html")
PROFILE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "templates", "profile.html")
CORE_JS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "static", "app-core.js")


def read(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def test_admin_css_contains_scroll_box_rules():
    css = read(CSS_PATH)
    # .scroll-box باید flex column min-height:0 overflow:hidden و max-height با vh و svh داشته باشد
    assert ".scroll-box" in css, ".scroll-box class missing"
    # max-height pattern min(64vh,520px) و min(64svh,520px)
    assert "min(64vh" in css or "64vh" in css, "64vh max-height missing"
    assert "min(64svh" in css or "64svh" in css or "svh" in css, "svh fallback missing"
    # body overflow-y:auto و overscroll-behavior:contain
    assert "overflow-y:auto" in css or "overflow-y: auto" in css, "overflow-y:auto missing"
    assert "overscroll-behavior:contain" in css or "overscroll-behavior: contain" in css, "overscroll-behavior missing"
    # scrollbar-width thin
    assert "scrollbar-width:thin" in css or "scrollbar-width: thin" in css, "scrollbar-width:thin missing"
    # focus-visible
    assert ":focus-visible" in css, ":focus-visible missing"
    # gradient ::after
    assert "::after" in css and "is-scrollable" in css, "gradient ::after for is-scrollable missing"
    # mobile calc with svh and vh fallback
    assert "calc(96vh" in css or "calc(96svh" in css, "mobile calc 96vh/svh missing"
    assert "@media" in css and ("max-width:768px" in css or "max-width: 768px" in css), "mobile media query missing"
    # tablet 769-1024
    assert "769" in css and "1024" in css, "tablet media query missing"
    # padding-inline-end for RTL fix
    assert "padding-inline-end" in css, "RTL padding-inline-end fix missing"


def test_index_html_has_scroll_box_and_tabindex():
    html = read(INDEX_PATH)
    # سه set-section باید scroll-box داشته باشند
    count = html.count('class="set-section scroll-box"')
    assert count >= 3, f"expected at least 3 set-section scroll-box in index.html, found {count}"
    # body باید scroll-box__body و tabindex="0"
    assert 'set-section__body scroll-box__body' in html, "scroll-box__body class missing in index.html"
    assert 'tabindex="0"' in html, "tabindex=0 missing in index.html"
    # چک id های مورد نیاز
    for tid in ["#set-model-custom", "#set-tg-chat", "#set-pass-new"]:
        raw = tid.lstrip("#")
        assert raw in html, f"{tid} missing in index.html"


def test_profile_html_has_scroll_box_and_ai_panel():
    html = read(PROFILE_PATH)
    assert "scroll-box" in html, "scroll-box missing in profile.html"
    assert "ai-panel" in html, "ai-panel missing in profile.html"
    assert "modal-drill" in html or "drill-body" in html, "drill modal missing"
    assert 'tabindex="0"' in html, "tabindex missing in profile.html"


def test_app_core_js_has_scrollable_logic():
    js = read(CORE_JS_PATH)
    # باید updateScrollableState و is-scrollable و is-at-bottom داشته باشد
    assert "is-scrollable" in js, "is-scrollable class logic missing in app-core.js"
    assert "is-at-bottom" in js, "is-at-bottom logic missing"
    assert "updateScrollableState" in js or "scrollHeight" in js, "scrollHeight check missing"
    # tabindex guard
    assert "tabindex" in js, "tabindex guard missing"
    # scroll listener
    assert "scroll" in js and "addEventListener" in js, "scroll listener missing"
    # 429 handling
    assert "retryAfter" in js or "retry_after" in js or "429" in js, "429 handling missing in app-core.js"


def test_modal_body_still_scrollable_and_flex_shrink():
    css = read(CSS_PATH)
    # .modal-body > * {flex-shrink:0} باید حفظ شده باشد (PR #4)
    assert "flex-shrink:0" in css or "flex-shrink: 0" in css, ".modal-body > * flex-shrink:0 missing"
    # .modal-body overflow
    # ensure modal-body still exists
    assert ".modal-body" in css, ".modal-body missing"
