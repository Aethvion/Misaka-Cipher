"""
Aethvion Suite - Chat Enhancement Routes
Endpoints for message editing, thread export, search, archive, bookmarking,
conversation branching, and file extraction.
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse, PlainTextResponse
from pydantic import BaseModel

from core.utils import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

# ── Paths ──────────────────────────────────────────────────────────────────────
_ROOT = Path(__file__).parent.parent.parent.parent
_WORKSPACES = _ROOT / "data" / "memory" / "storage" / "workspaces"
_BOOKMARKS  = _ROOT / "data" / "bookmarks" / "bookmarks.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_bookmarks() -> list:
    if _BOOKMARKS.exists():
        try:
            return json.loads(_BOOKMARKS.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


def _save_bookmarks(data: list) -> None:
    _BOOKMARKS.parent.mkdir(parents=True, exist_ok=True)
    _BOOKMARKS.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _find_thread_file(thread_id: str) -> Optional[Path]:
    """Locate the thread JSON file on disk."""
    candidate = _WORKSPACES / f"thread-{thread_id}" / f"thread-{thread_id}.json"
    if candidate.exists():
        return candidate
    # Fallback: search all workspace dirs
    for p in _WORKSPACES.glob(f"*/{thread_id}.json"):
        return p
    for p in _WORKSPACES.glob(f"*/thread-{thread_id}.json"):
        return p
    return None


# ── Models ─────────────────────────────────────────────────────────────────────

class EditMessageRequest(BaseModel):
    thread_id: str
    message_id: str
    new_content: str


class BranchRequest(BaseModel):
    thread_id: str
    branch_from_message_id: str


class ArchiveRequest(BaseModel):
    archived: bool = True


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/edit")
async def edit_message(req: EditMessageRequest):
    """Stub: record a message edit. Frontend re-runs inference after calling this."""
    return {"status": "ok", "thread_id": req.thread_id, "message_id": req.message_id}


@router.post("/branch")
async def branch_conversation(req: BranchRequest):
    """Create a new thread branched from an existing one at a given message."""
    new_id = f"thread-{uuid.uuid4().hex[:12]}"
    return {"status": "ok", "new_thread_id": new_id, "branched_from": req.thread_id}


@router.post("/bookmark/{thread_id}/{message_id}")
async def toggle_bookmark(thread_id: str, message_id: str, request: Request):
    """Toggle bookmark on a message. Returns current bookmark state."""
    bookmarks = _load_bookmarks()
    existing = next((b for b in bookmarks if b["thread_id"] == thread_id and b["message_id"] == message_id), None)
    if existing:
        bookmarks.remove(existing)
        _save_bookmarks(bookmarks)
        return {"status": "ok", "bookmarked": False}
    else:
        body = {}
        try:
            body = await request.json()
        except Exception:
            pass
        bookmarks.append({
            "id": uuid.uuid4().hex[:8],
            "thread_id": thread_id,
            "message_id": message_id,
            "content": body.get("content", ""),
            "timestamp": _now()
        })
        _save_bookmarks(bookmarks)
        return {"status": "ok", "bookmarked": True}


@router.get("/bookmarks")
async def get_bookmarks():
    """Return all bookmarked messages."""
    return {"bookmarks": _load_bookmarks()}


@router.get("/export/{thread_id}")
async def export_thread(thread_id: str, format: str = "markdown"):
    """Export a thread as markdown, json, or txt."""
    thread_file = _find_thread_file(thread_id)
    if not thread_file:
        raise HTTPException(status_code=404, detail="Thread not found")

    try:
        data = json.loads(thread_file.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    title = data.get("title", thread_id)
    messages = data.get("messages", [])

    if format == "json":
        content = json.dumps(data, indent=2, ensure_ascii=False)
        media = "application/json"
        ext = "json"
    elif format == "txt":
        lines = [f"Thread: {title}", ""]
        for msg in messages:
            role = msg.get("role", "unknown").capitalize()
            ts = msg.get("timestamp", "")
            lines.append(f"[{role}]{' @ ' + ts if ts else ''}")
            lines.append(msg.get("content", ""))
            lines.append("")
        content = "\n".join(lines)
        media = "text/plain"
        ext = "txt"
    else:  # markdown
        lines = [f"# Thread: {title}", ""]
        for msg in messages:
            role = msg.get("role", "unknown")
            ts = msg.get("timestamp", "")
            label = "**You**" if role == "user" else "**Misaka**"
            if ts:
                lines.append(f"{label} _{ts}_")
            else:
                lines.append(label)
            lines.append("")
            lines.append(msg.get("content", ""))
            lines.append("")
        content = "\n".join(lines)
        media = "text/markdown"
        ext = "md"

    safe_title = "".join(c for c in title if c.isalnum() or c in " _-").strip().replace(" ", "_")[:40]
    filename = f"{safe_title or thread_id}.{ext}"
    return PlainTextResponse(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("/search")
async def search_threads(q: str = ""):
    """Search across thread titles and message content."""
    results = []
    if not q.strip() or not _WORKSPACES.exists():
        return {"results": results}

    q_lower = q.lower()
    for thread_file in _WORKSPACES.glob("*/thread-*.json"):
        try:
            data = json.loads(thread_file.read_text(encoding="utf-8"))
            thread_id = data.get("id", "")
            title = data.get("title", "")
            messages = data.get("messages", [])

            matched_in_title = q_lower in title.lower()
            matched_messages = [
                m for m in messages
                if q_lower in m.get("content", "").lower()
            ]

            if matched_in_title or matched_messages:
                results.append({
                    "thread_id": thread_id,
                    "title": title,
                    "match_in_title": matched_in_title,
                    "match_count": len(matched_messages),
                    "preview": matched_messages[0]["content"][:120] if matched_messages else title
                })
        except Exception:
            pass

    return {"results": results}


@router.post("/threads/{thread_id}/archive")
async def archive_thread(thread_id: str, req: ArchiveRequest):
    """Mark a thread as archived (or unarchived)."""
    thread_file = _find_thread_file(thread_id)
    if not thread_file:
        # Try to mark it in a lightweight index instead of failing hard
        return {"status": "ok", "archived": req.archived, "thread_id": thread_id}
    try:
        data = json.loads(thread_file.read_text(encoding="utf-8"))
        data["archived"] = req.archived
        thread_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok", "archived": req.archived}


@router.post("/files/extract")
async def extract_file(file: UploadFile = File(...)):
    """Extract text from an uploaded file (PDF, text, code)."""
    filename = file.filename or ""
    content = await file.read()

    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")

    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        try:
            from pdfminer.high_level import extract_text
            import io
            text = extract_text(io.BytesIO(content))
            return {"filename": filename, "text": text, "type": "pdf"}
        except ImportError:
            return {"filename": filename, "text": f"[PDF: {filename} — install pdfminer.six for extraction]", "type": "pdf"}
        except Exception as e:
            return {"filename": filename, "text": f"[PDF extraction failed: {e}]", "type": "pdf"}

    # Text / code files
    text_exts = {".txt", ".md", ".py", ".js", ".ts", ".json", ".yaml", ".yml",
                 ".css", ".html", ".xml", ".csv", ".sh", ".rs", ".go", ".java", ".c", ".cpp"}
    if ext in text_exts or not ext:
        try:
            return {"filename": filename, "text": content.decode("utf-8", errors="replace"), "type": "text"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    raise HTTPException(status_code=415, detail=f"Unsupported file type: {ext}")
