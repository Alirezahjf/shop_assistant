#!/usr/bin/env python3
# ============================================================================
# run.py — اجرای پنل مدیریت
#   python3 run.py                    → http://0.0.0.0:8000
#   PORT=9000 python3 run.py
# ============================================================================
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn  # noqa: E402

if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    print(f"🚀 پنل مدیریت: http://{host}:{port}  (ورود: /login)")
    uvicorn.run("app.main:app", host=host, port=port, log_level="info")
