# ============================================================================
# main.py — وب‌اپ پنل مدیر (FastAPI)
# ----------------------------------------------------------------------------
# معماری:
#   • صفحات (Jinja2): /login ، / (لیست پروفایل‌ها) ، /profile/{uid}
#   • REST API تحت /api (کوکی نشست HttpOnly)
#   • ایمپورت: آپلود فایل‌های خروجی افزونه + واکشی مستقیم از ربات تلگرام
#     (همان فایل‌هایی که افزونه سمت کاربر به چت ادمین می‌فرستد)
# ============================================================================
import json
import logging
import time
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from . import analysis, avalai, db, extproxy, security
from .config import AVALAI_API_KEY, AVALAI_MODEL, APP_NAME, COOKIE_SECURE
from .security import SESSION_COOKIE
from .interests import compute_interests, search_matches_category
from .sanitize import ImportValidationError, is_likely_snapshot_filename, parse_json_file, validate_and_clean, final_scrub
from .taxonomy import category_stats, categorize_domain, category_label, category_icon
from . import telegram_client as tg

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("admin-panel")

app = FastAPI(title=APP_NAME, docs_url=None, redoc_url=None, openapi_url=None)
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))
app.mount("/static", StaticFiles(directory=str(Path(__file__).parent / "static")), name="static")

db.init_db()
security.ensure_admin_password()


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------
def require_admin(request: Request) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if not security.validate_session(token):
        raise HTTPException(status_code=401, detail="نشست منقضی شده است. دوباره وارد شوید.")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code == 401 and request.url.path.startswith("/api"):
        return JSONResponse({"ok": False, "error": exc.detail}, status_code=401)
    if exc.status_code == 401:
        return RedirectResponse("/login", status_code=302)
    return JSONResponse({"ok": False, "error": exc.detail}, status_code=exc.status_code)


def profile_row_to_dict(row) -> dict:
    snapshot = json.loads(row["snapshot_json"])
    analysis_raw = row["analysis_json"]
    return {
        "uid": row["uid"],
        "name": row["name"],
        "deviceLabel": row["device_label"],
        "source": row["source"],
        "sourceFile": row["source_file"],
        "createdAt": row["created_at"],
        "importedAt": row["imported_at"],
        "rangeDays": row["range_days"],
        "stats": snapshot.get("stats", {}),
        "analyzed": bool(analysis_raw),
        "analysisModel": row["analysis_model"],
        "analyzedAt": row["analyzed_at"],
    }


# ---------------------------------------------------------------------------
# صفحات
# ---------------------------------------------------------------------------
@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(request, "login.html", {"error": None})


@app.post("/login")
async def login_submit(request: Request):
    form = await request.form()
    password = str(form.get("password", ""))
    if not security.login_allowed():
        return templates.TemplateResponse(request, "login.html", {
            "error": "تلاش‌های زیاد — ۳۰ ثانیه صبر کنید.",
        }, status_code=429)
    ok = security.verify_password(password)
    security.register_login_attempt(ok)
    if not ok:
        return templates.TemplateResponse(request, "login.html", {
            "error": "رمز عبور اشتباه است.",
        }, status_code=401)
    token = security.create_session()
    resp = RedirectResponse("/", status_code=302)
    resp.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="lax",
                    secure=COOKIE_SECURE, max_age=72 * 3600)
    return resp


@app.get("/logout")
async def logout(request: Request):
    security.destroy_session(request.cookies.get(SESSION_COOKIE))
    resp = RedirectResponse("/login", status_code=302)
    resp.delete_cookie(SESSION_COOKIE)
    return resp


@app.get("/", response_class=HTMLResponse)
async def index_page(request: Request):
    if not security.validate_session(request.cookies.get(SESSION_COOKIE)):
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse(request, "index.html", {"app_name": APP_NAME})


@app.get("/profile/{uid}", response_class=HTMLResponse)
async def profile_page(request: Request, uid: str):
    if not security.validate_session(request.cookies.get(SESSION_COOKIE)):
        return RedirectResponse("/login", status_code=302)
    with db.get_db() as conn:
        row = db.get_profile(conn, uid)
    if not row:
        return templates.TemplateResponse(request, "index.html", {"app_name": APP_NAME})
    return templates.TemplateResponse(request, "profile.html", {
        "uid": uid, "app_name": APP_NAME,
    })


# ---------------------------------------------------------------------------
# API — پروفایل‌ها
# ---------------------------------------------------------------------------
@app.get("/api/stats")
async def api_stats(_: None = Depends(require_admin)):
    with db.get_db() as conn:
        return {"ok": True, **db.global_stats(conn)}


@app.get("/api/profiles")
async def api_profiles(_: None = Depends(require_admin)):
    with db.get_db() as conn:
        return {"ok": True, "profiles": [profile_row_to_dict(r) for r in db.list_profiles(conn)]}


@app.get("/api/profiles/{uid}")
async def api_profile_detail(uid: str, _: None = Depends(require_admin)):
    with db.get_db() as conn:
        row = db.get_profile(conn, uid)
        if not row:
            raise HTTPException(404, "پروفایل یافت نشد.")
        snapshot = json.loads(row["snapshot_json"])
        analysis_data = json.loads(row["analysis_json"]) if row["analysis_json"] else None
    return {
        "ok": True,
        "profile": profile_row_to_dict(row),
        "snapshot": snapshot,
        "analysis": analysis_data,
        "categories": category_stats(snapshot.get("domains", [])),
        "interests": compute_interests(snapshot),
    }


@app.patch("/api/profiles/{uid}")
async def api_rename(uid: str, payload: dict, _: None = Depends(require_admin)):
    name = str(payload.get("name", "")).strip()[:60]
    if not name:
        raise HTTPException(400, "نام خالی است.")
    with db.get_db() as conn:
        if not db.rename_profile(conn, uid, name):
            raise HTTPException(404, "پروفایل یافت نشد.")
    return {"ok": True}


@app.delete("/api/profiles/{uid}")
async def api_delete(uid: str, _: None = Depends(require_admin)):
    with db.get_db() as conn:
        if not db.delete_profile(conn, uid):
            raise HTTPException(404, "پروفایل یافت نشد.")
    return {"ok": True}


@app.get("/api/profiles/{uid}/domains-map")
async def api_domains_map(uid: str, _: None = Depends(require_admin)):
    """نگاشت هر دامنه به دسته (برای رندر سمت کلاینت بدون تکرار منطق)."""
    with db.get_db() as conn:
        row = db.get_profile(conn, uid)
        if not row:
            raise HTTPException(404, "پروفایل یافت نشد.")
        snapshot = json.loads(row["snapshot_json"])
    domain_map = {d["domain"]: categorize_domain(d["domain"]) for d in snapshot.get("domains", [])}
    # دسته‌بندی جستجوها بر اساس تداخل با دسته‌های دامنه‌ها (منطق سرور)
    search_cats: dict = {}
    domains = snapshot.get("domains", [])
    for s in snapshot.get("searches", []):
        matched = []
        for c in category_stats(domains):
            if c["category"] in ("search", "other"):
                continue
            if search_matches_category(s.get("term", ""), c["category"], domains):
                matched.append(c["category"])
        search_cats[s.get("term", "")] = matched
    return {"ok": True, "map": domain_map, "searchCats": search_cats}


@app.get("/api/profiles/{uid}/export")
async def api_export(uid: str, _: None = Depends(require_admin)):
    with db.get_db() as conn:
        row = db.get_profile(conn, uid)
    if not row:
        raise HTTPException(404, "پروفایل یافت نشد.")
    payload = {
        "app": "shop-profile-admin",
        "profile": profile_row_to_dict(row),
        "snapshot": json.loads(row["snapshot_json"]),
    }
    if row["analysis_json"]:
        payload["analysis"] = json.loads(row["analysis_json"])
    return JSONResponse(
        payload,
        headers={"Content-Disposition": f'attachment; filename="{uid}.json"'},
    )


# ---------------------------------------------------------------------------
# API — ایمپورت (آپلود همان فایل‌های خروجی افزونه)
# ---------------------------------------------------------------------------
async def _import_payload(conn, payload, source: str, source_file: str,
                          file_unique_id: Optional[str] = None) -> dict:
    snapshot = validate_and_clean(payload, source_file)
    snapshot, issues = final_scrub(snapshot)
    if issues:
        log.info("import re-scrub dropped: %d issue(s)", len(issues))
    name = f"کاربر {db.next_uid(conn).split('-')[1]}"
    uid = db.insert_profile(conn, name=name, source=source, source_file=source_file,
                            file_unique_id=file_unique_id, snapshot=snapshot)
    return {"uid": uid, "domains": snapshot["stats"]["domains"],
            "searches": snapshot["stats"]["searches"]}


@app.post("/api/profiles/import")
async def api_import(files: List[UploadFile] = File(...), _: None = Depends(require_admin)):
    added, failed = [], []
    for f in files:
        try:
            raw = await f.read()
            payload = parse_json_file(raw)
            if isinstance(payload, dict) and isinstance(payload.get("profiles"), list):
                # بسته چندپروفایلی (خروجی ZIP/JSON داشبورد)
                for item in payload["profiles"]:
                    try:
                        snap = item.get("snapshot", item)
                        with db.get_db() as conn:
                            added.append(await _import_payload(conn, snap, "upload", f.filename or "bundle"))
                    except ImportValidationError as e:
                        failed.append({"file": f.filename, "error": str(e)})
            else:
                with db.get_db() as conn:
                    added.append(await _import_payload(conn, payload, "upload", f.filename or "upload"))
        except ImportValidationError as e:
            failed.append({"file": f.filename, "error": str(e)})
        except Exception as e:  # noqa: BLE001
            log.warning("import failed: %s", type(e).__name__)
            failed.append({"file": f.filename, "error": "فایل قابل پردازش نبود."})
    return {"ok": len(added) > 0, "added": added, "failed": failed,
            "message": f"{len(added)} پروفایل اضافه شد" if added else "هیچ پروفایلی اضافه نشد"}


@app.post("/api/profiles/import-json")
async def api_import_json(payload: dict, _: None = Depends(require_admin)):
    """افزودن دستی با چسباندن JSON (همان ساختار فایل افزونه)."""
    try:
        with db.get_db() as conn:
            result = await _import_payload(conn, payload, "paste", "چسبانده‌شده")
        return {"ok": True, **result}
    except ImportValidationError as e:
        raise HTTPException(400, str(e))


@app.post("/api/profiles/import-sample")
async def api_import_sample(_: None = Depends(require_admin)):
    """افزودن پروفایل نمونه (فیکسچر داخلی) برای آشنایی با داشبورد."""
    fixture = Path(__file__).parent.parent / "tests" / "fixtures" / "sample_snapshot.json"
    if not fixture.exists():
        raise HTTPException(404, "فایل نمونه یافت نشد.")
    payload = parse_json_file(fixture.read_bytes())
    with db.get_db() as conn:
        result = await _import_payload(conn, payload, "sample", "sample_snapshot.json")
    return {"ok": True, **result}


# ---------------------------------------------------------------------------
# API — واکشی از ربات تلگرام (همان فایل‌هایی که افزونه فرستاده)
# ---------------------------------------------------------------------------
@app.get("/api/telegram/status")
async def api_tg_status(_: None = Depends(require_admin)):
    configured = False
    try:
        tg.get_config()
        configured = True
    except tg.TelegramError:
        pass
    with db.get_db() as conn:
        last_poll = db.get_tg_state(conn, "last_poll_at", "")
        offset = db.get_tg_state(conn, "offset", "0")
    return {"ok": True, "configured": configured, "lastPollAt": last_poll, "offset": offset}


@app.post("/api/telegram/poll")
async def api_tg_poll(_: None = Depends(require_admin)):
    """یک دور واکشی: همه آپدیت‌های جدید؛ فایل‌های JSON چت ادمین ایمپورت می‌شوند."""
    try:
        cfg = tg.get_config()
    except tg.NotConfigured as e:
        raise HTTPException(400, str(e))
    token, admin_chat = cfg["token"], cfg["chat_id"]

    with db.get_db() as conn:
        offset = int(db.get_tg_state(conn, "offset", "0") or 0)

    try:
        updates = tg.get_updates(token, offset=offset)
    except tg.NotConfigured as e:
        raise HTTPException(400, str(e))
    except tg.TelegramError as e:
        raise HTTPException(502, str(e))

    imported, skipped, errors = [], [], []
    max_update_id = offset

    for upd in updates:
        update_id = int(upd.get("update_id", 0))
        max_update_id = max(max_update_id, update_id + 1)

        msg = upd.get("message") or {}
        chat_id = str((msg.get("chat") or {}).get("id", ""))
        doc = msg.get("document")
        if not doc:
            continue
        if chat_id != str(admin_chat):
            skipped.append({"reason": "چت غیرمجاز", "file": doc.get("file_name")})
            continue
        file_name = str(doc.get("file_name") or "file.json")
        if not file_name.lower().endswith(".json"):
            skipped.append({"reason": "فقط JSON", "file": file_name})
            continue
        file_unique_id = str(doc.get("file_unique_id") or "")
        try:
            with db.get_db() as conn:
                if file_unique_id and db.file_unique_id_exists(conn, file_unique_id):
                    skipped.append({"reason": "قبلاً ایمپورت شده", "file": file_name})
                    continue
            raw = tg.download_document(token, doc.get("file_id"))
            payload = parse_json_file(raw)
            if isinstance(payload, dict) and isinstance(payload.get("profiles"), list):
                for item in payload["profiles"]:
                    try:
                        snap = item.get("snapshot", item)
                        with db.get_db() as conn:
                            imported.append(await _import_payload(conn, snap, "telegram", file_name))
                    except ImportValidationError as e:
                        errors.append({"file": file_name, "error": str(e)})
            else:
                with db.get_db() as conn:
                    imported.append(await _import_payload(conn, payload, "telegram", file_name,
                                                          file_unique_id or None))
            # پیام تایید به چت ادمین
            try:
                tg.send_message(token, admin_chat,
                                f"✅ «{file_name}» در پنل مدیریت ایمپورت شد.")
            except tg.TelegramError:
                pass
        except ImportValidationError as e:
            errors.append({"file": file_name, "error": str(e)})
        except tg.TelegramError as e:
            errors.append({"file": file_name, "error": str(e)})
        except Exception:  # noqa: BLE001
            log.warning("tg poll item failed: %s", type(doc).__name__)
            errors.append({"file": file_name, "error": "خطای نامشخص در پردازش فایل"})

    with db.get_db() as conn:
        db.set_tg_state(conn, "offset", str(max_update_id))
        db.set_tg_state(conn, "last_poll_at", str(int(time.time() * 1000)))

    return {"ok": True, "updates": len(updates), "imported": imported,
            "skipped": skipped, "errors": errors,
            "message": f"{len(imported)} فایل از تلگرام ایمپورت شد" if imported
            else "فایل جدیدی در چت ربات نبود"}


@app.post("/api/telegram/test")
async def api_tg_test(_: None = Depends(require_admin)):
    try:
        tg.test_connection()
        return {"ok": True}
    except tg.NotConfigured as e:
        raise HTTPException(400, str(e))
    except tg.TelegramError as e:
        raise HTTPException(502, str(e))


@app.post("/api/profiles/{uid}/send-telegram")
async def api_send_profile_tg(uid: str, _: None = Depends(require_admin)):
    with db.get_db() as conn:
        row = db.get_profile(conn, uid)
    if not row:
        raise HTTPException(404, "پروفایل یافت نشد.")
    try:
        cfg = tg.get_config()
    except tg.NotConfigured as e:
        raise HTTPException(400, str(e))
    meta = profile_row_to_dict(row)
    content = json.dumps(json.loads(row["snapshot_json"]), ensure_ascii=False, indent=2)
    caption = "\n".join([
        f"📊 پروفایل {meta['name']} ({meta['uid']})",
        f"دستگاه: {meta['deviceLabel']} | بازه: {meta['rangeDays']} روز",
        f"دامنه: {meta['stats'].get('domains', 0)} • جستجو: {meta['stats'].get('searches', 0)}",
    ])
    tg.send_document(cfg["token"], cfg["chat_id"], f"{uid}.json", content.encode("utf-8"), caption)
    return {"ok": True}


# ---------------------------------------------------------------------------
# API — تحلیل هوش مصنوعی
# ---------------------------------------------------------------------------
@app.post("/api/profiles/{uid}/analyze")
async def api_analyze(uid: str, _: None = Depends(require_admin)):
    with db.get_db() as conn:
        row = db.get_profile(conn, uid)
        if not row:
            raise HTTPException(404, "پروفایل یافت نشد.")
        snapshot = json.loads(row["snapshot_json"])
    try:
        result = analysis.analyze_snapshot(snapshot)
    except avalai.AvalAiError as e:
        status = 400 if e.status in (401, 402, 404) or e.status is None else 502
        raise HTTPException(status, str(e))
    with db.get_db() as conn:
        db.save_analysis(conn, uid, result, result.get("model", AVALAI_MODEL))
    return {"ok": True, "analysis": result}


@app.post("/api/ai/test")
async def api_ai_test(payload: dict = None, _: None = Depends(require_admin)):
    payload = payload or {}
    key = str(payload.get("aiKey") or "").strip() or AVALAI_API_KEY or security.get_secret("avalai_key")
    if not key:
        raise HTTPException(400, "کلید AvalAI تنظیم نشده است.")
    model = str(payload.get("model") or security.get_secret("avalai_model") or AVALAI_MODEL)
    try:
        r = avalai.test_connection(key, model)
        return {"ok": True, "sample": r["text"][:40]}
    except avalai.AvalAiError as e:
        raise HTTPException(502, str(e))


# ---------------------------------------------------------------------------
# API — تنظیمات
# ---------------------------------------------------------------------------
@app.get("/api/settings")
async def api_settings_get(_: None = Depends(require_admin)):
    model = security.get_secret("avalai_model") or AVALAI_MODEL
    key_exists = security.has_secret("avalai_key") or bool(AVALAI_API_KEY)
    return {
        "ok": True,
        "avalaiKeySet": key_exists,
        "avalaiKeyMask": security.mask(security.get_secret("avalai_key") or AVALAI_API_KEY) if key_exists else None,
        "model": model,
        "tgConfigured": security.has_secret("tg_token") and security.has_secret("tg_chat_id"),
    }


@app.post("/api/settings/avalai")
async def api_settings_avalai(payload: dict, _: None = Depends(require_admin)):
    key = str(payload.get("aiKey") or "").strip()
    model = str(payload.get("model") or "").strip()
    if key:
        security.set_secret("avalai_key", key)
    if model:
        security.set_secret("avalai_model", model[:80])
    return {"ok": True}


@app.post("/api/settings/telegram")
async def api_settings_telegram(payload: dict, _: None = Depends(require_admin)):
    token = str(payload.get("tgToken") or "").strip()
    chat_id = str(payload.get("tgChatId") or "").strip()
    if token:
        if ":" not in token:
            raise HTTPException(400, "فرمت توکن ربات صحیح نیست.")
        security.set_secret("tg_token", token)
    if chat_id:
        if not chat_id.lstrip("-").isdigit():
            raise HTTPException(400, "شناسه عددی ادمین باید عدد باشد.")
        security.set_secret("tg_chat_id", chat_id)
    return {"ok": True}


@app.post("/api/settings/password")
async def api_settings_password(payload: dict, _: None = Depends(require_admin)):
    current = str(payload.get("current") or "")
    new = str(payload.get("new") or "")
    try:
        if not security.change_password(current, new):
            raise HTTPException(400, "رمز فعلی اشتباه است.")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/healthz")
async def healthz():
    return {"ok": True}


# ---------------------------------------------------------------------------
# پروکسی افزونه (عمومی؛ کاربر بدون کلید — کلید فقط سمت سرور)
# ---------------------------------------------------------------------------
@app.post("/api/ext/chat")
async def ext_chat(request: Request):
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        return JSONResponse({"ok": False, "error": "بدنهٔ JSON نامعتبر است."}, status_code=400)

    client_ip = request.client.host if request.client else "unknown"
    limited = extproxy.check_rate_limit(client_ip)
    if limited:
        retry_after, message = limited
        return JSONResponse({"ok": False, "error": message}, status_code=429,
                            headers={"Retry-After": str(retry_after)})
    try:
        result = extproxy.run_chat(payload)
    except extproxy.ProxyError as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=e.status)
    except avalai.AvalAiError as e:
        status = 503 if e.retryable else 502
        return JSONResponse({"ok": False, "error": str(e)}, status_code=status)
    return {"ok": True, "reply": result["reply"]}


@app.get("/api/ext/ping")
async def ext_ping():
    """بررسی سلامت سرویس برای افزونه (بدون مصرف توکن)."""
    return {"ok": True, "service": "kharidar-pro", "proxyEnabled": extproxy.EXT_PROXY_ENABLED}
