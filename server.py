#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
App luyện đề / thi thử - local server
Chạy: python3 server.py
Mở trình duyệt tại: http://localhost:3939
Chỉ dùng thư viện chuẩn của Python, không cần pip install gì cả.
"""

import http.server
import socketserver
import json
import os
import re
import datetime
import unicodedata
import urllib.parse
from pathlib import Path

# Khi chạy local: mặc định cổng 3939.
# Khi deploy lên Render/Railway/...: nền tảng sẽ cấp cổng qua biến môi
# trường PORT, bắt buộc phải lắng nghe đúng cổng đó thì mới truy cập được.
PORT = int(os.environ.get("PORT", 3939))
ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
PUBLIC_DIR = ROOT / "public"
SCORES_FILE = ROOT / "scores.json"

# ---------------------------------------------------------------------------
# Lưu điểm cao nhất
# ---------------------------------------------------------------------------

def load_scores():
    if SCORES_FILE.exists():
        try:
            return json.loads(SCORES_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_scores(scores):
    SCORES_FILE.write_text(
        json.dumps(scores, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def score_key(subject, file):
    return f"{subject}::{file}"


# ---------------------------------------------------------------------------
# Parser cho file đề .txt
# ---------------------------------------------------------------------------

Q_RE = re.compile(r"^#Q(\S+)\s*\[(.+?)\]\s*$")
OPT_RE = re.compile(r"^([A-F])\.\s*(.*)$")
VALID_TYPES = {"TF", "SC4", "MC4", "SC6", "MC6", "ESSAY"}


def canonicalize_type(raw_type, option_count, answer):
    """Quy các nhãn loại câu hỏi (có thể viết khác chuẩn, ví dụ 'SINGLE4',
    'MULTI6', 'TRUEFALSE'...) về đúng 6 mã mà phần còn lại của app hiểu:
    TF, SC4, MC4, SC6, MC6, ESSAY.

    Lý do cần hàm này: nếu file đề dùng nhãn không khớp tuyệt đối với 6 mã
    trên (ví dụ '[SINGLE4]' thay vì '[SC4]'), phần chấm điểm ở app.js sẽ
    không nhận ra loại câu và luôn trả về "sai" dù người dùng chọn đúng
    đáp án. Thay vì bắt buộc người soạn đề phải gõ đúng tuyệt đối, ta suy
    luận loại câu dựa trên nhãn (khoan dung với biến thể) + cấu trúc thực
    tế của câu hỏi (có phương án hay không, đáp án có dấu phẩy hay không).
    """
    s = (raw_type or "").upper().replace(" ", "").replace("_", "").replace("-", "")
    answer_is_multi = "," in (answer or "")

    if "ESSAY" in s or "TULUAN" in s or "FILL" in s:
        return "ESSAY"
    if s in ("TF", "DS") or "DUNGSAI" in s or "TRUEFALSE" in s or "BOOL" in s:
        return "TF"

    # Không có phương án (A./B./C...) => không phải câu trắc nghiệm.
    if option_count == 0:
        norm_ans = normalize_vn(answer)
        if norm_ans in ("đúng", "dung", "sai"):
            return "TF"
        return "ESSAY"

    is_multi = answer_is_multi or "MULTI" in s or s.startswith("MC")
    is_six = option_count > 4 or "6" in s
    if is_multi:
        return "MC6" if is_six else "MC4"
    return "SC6" if is_six else "SC4"


def normalize_vn(s):
    return (s or "").strip().lower()


def parse_exam(text):
    # Chuẩn hoá Unicode về dạng NFC (dựng sẵn). Một số trình soạn thảo /
    # nguồn copy-paste (Word, PDF...) lưu tiếng Việt ở dạng NFD (tổ hợp:
    # ví dụ "ú" = "u" + dấu sắc ghép rời). Hai dạng này hiển thị giống hệt
    # nhau nhưng so sánh chuỗi (===) trong app.js sẽ cho ra "khác nhau",
    # khiến đáp án đúng (ví dụ "Đúng") bị chấm sai. Chuẩn hoá về NFC ngay
    # tại đây để toàn bộ nội dung, phương án, đáp án... luôn đồng nhất.
    text = unicodedata.normalize("NFC", text)
    lines = text.splitlines()
    n = len(lines)
    i = 0
    time_limit = None

    # Tìm #TIME (nếu có) trước câu hỏi đầu tiên
    while i < n:
        line = lines[i].strip()
        if line.upper().startswith("#TIME:"):
            val = line.split(":", 1)[1].strip()
            time_limit = int(val) if val.isdigit() else None
            i += 1
            continue
        if line.startswith("#Q"):
            break
        i += 1

    questions = []
    while i < n:
        raw_line = lines[i].strip()
        m = Q_RE.match(raw_line)
        if not m:
            i += 1
            continue

        qid = m.group(1)
        qtype = m.group(2).strip().upper()
        i += 1

        content_lines = []
        options = []
        while i < n:
            raw = lines[i]
            trimmed = raw.strip()
            if trimmed.upper().startswith("#ANSWER:") or Q_RE.match(trimmed):
                break
            om = OPT_RE.match(trimmed)
            if om:
                options.append({"key": om.group(1), "text": om.group(2)})
            elif trimmed:
                content_lines.append(raw.strip())
            i += 1

        answer = ""
        if i < n and lines[i].strip().upper().startswith("#ANSWER:"):
            answer = lines[i].strip().split(":", 1)[1].strip()
            i += 1

        explain_lines = []
        if i < n and lines[i].strip().upper().startswith("#EXPLAIN:"):
            first = lines[i].strip().split(":", 1)
            explain_lines.append(first[1].strip() if len(first) > 1 else "")
            i += 1
            while i < n and not Q_RE.match(lines[i].strip()):
                if lines[i].strip():
                    explain_lines.append(lines[i].strip())
                i += 1
        explain = "\n".join([l for l in explain_lines if l is not None]).strip()

        canonical_type = canonicalize_type(qtype, len(options), answer)

        questions.append(
            {
                "id": qid,
                "type": canonical_type,
                "content": "\n".join(content_lines).strip(),
                "options": options,
                "answer": answer,
                "explain": explain,
            }
        )

    return {"time": time_limit, "questions": questions}


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "ExamApp/1.0"

    def log_message(self, fmt, *args):
        pass  # im lặng, khỏi in log ra console

    # -- helpers -------------------------------------------------------
    def _send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, status, data, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _safe_data_path(self, subject, file):
        candidate = (DATA_DIR / subject / file).resolve()
        if DATA_DIR.resolve() not in candidate.parents:
            return None
        return candidate

    # -- GET -------------------------------------------------------------
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        pathname = urllib.parse.unquote(parsed.path)
        qs = urllib.parse.parse_qs(parsed.query)

        if pathname == "/api/tree":
            return self._handle_tree()
        if pathname == "/api/exam":
            subject = qs.get("subject", [None])[0]
            file = qs.get("file", [None])[0]
            return self._handle_get_exam(subject, file)
        if pathname.startswith("/api/"):
            return self._send_json(404, {"error": "Không tìm thấy API"})

        return self._serve_static(pathname)

    def _handle_tree(self):
        scores = load_scores()
        tree = []
        if DATA_DIR.exists():
            subject_dirs = sorted(
                [d for d in DATA_DIR.iterdir() if d.is_dir()], key=lambda d: d.name
            )
            for subject_dir in subject_dirs:
                exams = []
                for f in sorted(subject_dir.glob("*.txt"), key=lambda p: p.name):
                    qcount, tlimit = 0, None
                    try:
                        text = f.read_text(encoding="utf-8")
                        data = parse_exam(text)
                        qcount = len(data["questions"])
                        tlimit = data["time"]
                    except Exception:
                        pass
                    key = score_key(subject_dir.name, f.name)
                    rec = scores.get(key)
                    exams.append(
                        {
                            "file": f.name,
                            "title": f.stem,
                            "questionCount": qcount,
                            "timeLimit": tlimit,
                            "highScore": rec["highScore"] if rec else None,
                        }
                    )
                tree.append({"subject": subject_dir.name, "exams": exams})
        self._send_json(200, {"tree": tree})

    def _handle_get_exam(self, subject, file):
        if not subject or not file:
            return self._send_json(400, {"error": "Thiếu subject hoặc file"})
        path = self._safe_data_path(subject, file)
        if path is None:
            return self._send_json(403, {"error": "Đường dẫn không hợp lệ"})
        try:
            text = path.read_text(encoding="utf-8")
        except Exception as e:
            return self._send_json(404, {"error": f"Không đọc được đề: {e}"})

        exam = parse_exam(text)
        scores = load_scores()
        key = score_key(subject, file)
        rec = scores.get(key)
        self._send_json(
            200,
            {
                "subject": subject,
                "file": file,
                "title": Path(file).stem,
                "time": exam["time"],
                "questions": exam["questions"],
                "highScore": rec["highScore"] if rec else None,
            },
        )

    def _serve_static(self, pathname):
        if pathname == "/":
            pathname = "/index.html"
        static_path = (PUBLIC_DIR / pathname.lstrip("/")).resolve()
        if PUBLIC_DIR.resolve() not in static_path.parents:
            return self._send_bytes(403, b"Forbidden", "text/plain")
        if not static_path.exists() or not static_path.is_file():
            return self._send_bytes(404, b"Not found", "text/plain")
        content_type = MIME.get(static_path.suffix, "application/octet-stream")
        self._send_bytes(200, static_path.read_bytes(), content_type)

    # -- POST ------------------------------------------------------------
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/score":
            return self._handle_post_score()
        self._send_json(404, {"error": "Không tìm thấy API"})

    def _handle_post_score(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)
            subject = data["subject"]
            file = data["file"]
            score = float(data["score"])
        except Exception as e:
            return self._send_json(400, {"error": f"Dữ liệu không hợp lệ: {e}"})

        scores = load_scores()
        key = score_key(subject, file)
        prev = scores.get(key, {}).get("highScore")
        is_new = prev is None or score > prev
        new_high = score if is_new else prev
        scores[key] = {
            "highScore": new_high,
            "updatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        }
        save_scores(scores)
        self._send_json(200, {"highScore": new_high, "isNewRecord": is_new})


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with ThreadedHTTPServer(("", PORT), Handler) as httpd:
        print("=" * 52)
        print(f"  Ứng dụng đang chạy tại: http://localhost:{PORT}")
        print("  Nhấn Ctrl+C để dừng server.")
        print("=" * 52)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nĐã dừng server.")


if __name__ == "__main__":
    main()
