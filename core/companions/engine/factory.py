"""
core/companions/engine/factory.py
══════════════════════════════════
CompanionEngineConfig — everything that makes one companion different from another.
make_companion_router()  — generates a fully-wired FastAPI router for any companion.

All companions — built-in and custom — use exactly the same router logic.
"""
from __future__ import annotations

import asyncio
import datetime
import json
import mimetypes
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from core.companions.registry import CompanionConfig
from core.companions.engine.memory import CompanionMemory
from core.companions.engine.history import CompanionHistory
from core.companions.engine.streaming import clean_memory_tags, build_nexus_capabilities, get_greeting_period
from core.companions.engine.tools import (
    execute_tools_stream,
    extract_peripheral_captures,
    load_workspaces,
    save_workspaces,
    validate_path,
)
from core.providers.provider_manager import ProviderManager
from core.workspace.preferences_manager import get_preferences_manager
from core.utils.logger import get_logger
from core.utils import utcnow_iso

logger = get_logger(__name__)

# Shared workspace config location (all companions share one workspace config)
try:
    from core.utils.paths import WORKSPACES, WS_UPLOADS
    _WORKSPACES_FILE = WORKSPACES / "workspaces.json"
    _UPLOADS_ROOT = WS_UPLOADS
except Exception:
    _ROOT = Path(__file__).parent.parent.parent.parent
    _WORKSPACES_FILE = _ROOT / "data" / "workspaces" / "workspaces.json"
    _UPLOADS_ROOT = _ROOT / "data" / "workspace_uploads"

try:
    import psutil as _psutil
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False


# ── Pydantic models (shared across all companions) ────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None
    attachments: Optional[List[Dict[str, Any]]] = None


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage]
    attached_files: Optional[List[Dict[str, Any]]] = None


class InitiateRequest(BaseModel):
    trigger: str = "startup"
    hours_since_last: float = 0.0


class ChatResponse(BaseModel):
    response: str
    responses: List[str] = []
    expression: str
    mood: str = "calm"
    model: str
    memory_updated: bool
    synthesis_ran: bool = False
    attachments: Optional[List[Dict[str, Any]]] = None


class WorkspaceConfig(BaseModel):
    id: Optional[str] = None
    label: str
    path: str
    permissions: List[str] = ["read"]
    recursive: bool = True


# ── Engine config ─────────────────────────────────────────────────────────────

@dataclass
class CompanionEngineConfig:
    """
    Everything that makes one companion unique.
    The engine reads this at router-construction time.
    """

    # Identity (from registry)
    companion: CompanionConfig

    # Memory defaults — written to base_info.json on first run
    default_base_info: dict

    # LLM settings
    temperature: float = 0.75
    initiate_temperature: float = 0.7

    # Expression / mood defaults
    default_expression: str = "default"
    default_mood: str = "calm"

    # Per-companion time-since-last-chat string flavor
    time_formatter: Callable[[int], str] | None = None

    # Prompt templates — filled with runtime vars by the engine.
    # Available placeholders: {name} {base_info} {memory} {workspace_block}
    #   {nexus_block} {datetime_ctx} {time_since} {history_ctx}
    chat_system_prompt: str = ""

    # Initiate template — placeholders: {name} {base_info} {memory}
    #   {datetime_ctx} {history_ctx} {trigger_instruction} {tool_instructions}
    initiate_system_prompt: str = ""

    # Trigger instructions for each initiate trigger type
    initiate_startup_instruction: str = (
        "Compose a warm opening message after the time apart. "
        "Reference memory if natural. Keep it brief. Be genuine."
    )
    initiate_proactive_instruction: str = (
        "Send a short spontaneous thought or question. Keep it under two sentences."
    )

    # Feature flags
    enable_proactive_tools: bool = False   # allow tool use in /initiate
    synthesis_threshold: int = 10          # messages between synthesis runs

    def __post_init__(self):
        if not self.chat_system_prompt:
            self.chat_system_prompt = _DEFAULT_CHAT_PROMPT
        if not self.initiate_system_prompt:
            self.initiate_system_prompt = _DEFAULT_INITIATE_PROMPT


# ── Default generic prompts (used by custom companions and as fallback) ───────

_DEFAULT_CHAT_PROMPT = """\
You are {name}.

YOUR IDENTITY:
{base_info}

YOUR MEMORY:
{memory}

{workspace_block}\
TEMPORAL CONTEXT:
- Current date/time: {datetime_ctx}
- Time since last message: {time_since}

INSTRUCTIONS:
1. Be consistent with your identity and past memory.
2. EXPRESSIONS: Every response MUST start with [Emotion: <name>] from your available expressions.
3. MOOD: Set [Mood: <name>] after the emotion tag.
4. Use [msg_break] to send two separate short messages if it feels right.
5. MEMORY AUTONOMY: Update your knowledge using the tag at the end of your response (hidden):
<memory_update>
{{
    "base_info": {{ ...updated fields only... }},
    "user_info": {{ ...facts about the user... }},
    "recent_observations": ["...specific thing you learned..."]
}}
</memory_update>

{nexus_block}\
Do NOT break character. Do NOT act like a generic AI assistant.\
"""

_DEFAULT_INITIATE_PROMPT = """\
You are {name}.

YOUR IDENTITY:
{base_info}

YOUR MEMORY:
{memory}

{history_ctx}\
TEMPORAL CONTEXT:
- Current date/time: {datetime_ctx}

INITIATION INSTRUCTION:
{trigger_instruction}

RULES:
1. Begin with [Emotion: <name>].
2. Set [Mood: <name>] after the emotion.
3. Be brief. Do NOT include memory updates.
{tool_instructions}\
"""


# ── Router factory ────────────────────────────────────────────────────────────

def make_companion_router(cfg: CompanionEngineConfig) -> APIRouter:
    """
    Build and return a fully-wired FastAPI APIRouter for the given companion.
    All 15 endpoints are registered with logic identical across all companions.
    """
    companion = cfg.companion
    router = APIRouter(prefix=companion.route_prefix, tags=[companion.id])

    # One memory + history instance per companion (captured by all closures below)
    memory = CompanionMemory(
        data_dir=companion.data_dir,
        default_base_info=cfg.default_base_info,
        companion_name=companion.name,
    )
    history = CompanionHistory(
        history_dir=companion.history_dir,
        companion_name=companion.name,
        time_formatter=cfg.time_formatter,
    )
    memory.initialize()

    _prefs_key = companion.prefs_key
    _call_source = companion.call_source

    # ── /expressions ─────────────────────────────────────────────────────

    @router.get("/expressions")
    async def get_expressions():
        return companion.expressions

    # ── /memory ──────────────────────────────────────────────────────────

    @router.get("/memory")
    async def get_memory():
        return memory.load()

    # ── /history ─────────────────────────────────────────────────────────

    @router.get("/history")
    async def get_history(offset_days: int = 0, limit_days: int = 3):
        return history.load_days(offset_days, limit_days)

    @router.post("/history/clear")
    async def clear_history():
        history.clear()
        return {"status": "cleared"}

    # ── /reset ───────────────────────────────────────────────────────────

    @router.post("/reset")
    async def reset_companion():
        history.clear()
        memory.reset()
        memory.initialize()
        logger.info(f"{companion.name}: Full reset completed.")
        return {"ok": True, "cleared": ["conversation history", "dynamic memory"]}

    # ── /workspaces ──────────────────────────────────────────────────────

    @router.get("/workspaces")
    async def get_workspaces():
        return {"workspaces": load_workspaces(_WORKSPACES_FILE)}

    @router.post("/workspaces")
    async def add_workspace(config: WorkspaceConfig):
        workspaces = load_workspaces(_WORKSPACES_FILE)
        resolved = str(Path(config.path).resolve())
        if not Path(resolved).exists():
            raise HTTPException(status_code=400, detail=f"Directory does not exist: {resolved}")
        ws = {
            "id": str(uuid.uuid4()),
            "label": config.label,
            "path": resolved,
            "permissions": config.permissions,
            "recursive": config.recursive,
        }
        workspaces.append(ws)
        save_workspaces(_WORKSPACES_FILE, workspaces)
        return ws

    @router.put("/workspaces/{workspace_id}")
    async def update_workspace(workspace_id: str, config: WorkspaceConfig):
        workspaces = load_workspaces(_WORKSPACES_FILE)
        for i, ws in enumerate(workspaces):
            if ws["id"] == workspace_id:
                workspaces[i] = {
                    "id": workspace_id,
                    "label": config.label,
                    "path": str(Path(config.path).resolve()),
                    "permissions": config.permissions,
                    "recursive": config.recursive,
                }
                save_workspaces(_WORKSPACES_FILE, workspaces)
                return workspaces[i]
        raise HTTPException(status_code=404, detail="Workspace not found")

    @router.delete("/workspaces/{workspace_id}")
    async def delete_workspace(workspace_id: str):
        workspaces = [
            ws for ws in load_workspaces(_WORKSPACES_FILE) if ws["id"] != workspace_id
        ]
        save_workspaces(_WORKSPACES_FILE, workspaces)
        return {"status": "deleted"}

    # ── /system-stats ────────────────────────────────────────────────────

    @router.get("/system-stats")
    async def get_system_stats():
        if not _HAS_PSUTIL:
            return {"error": "psutil not installed"}
        try:
            cpu = _psutil.cpu_percent(interval=0.5)
            vm = _psutil.virtual_memory()
            _root = Path(__file__).parent.parent.parent.parent
            disk = _psutil.disk_usage(str(_root))
            return {
                "cpu_percent": cpu,
                "ram_used_mb": vm.used // (1024 ** 2),
                "ram_total_mb": vm.total // (1024 ** 2),
                "ram_percent": vm.percent,
                "disk_used_gb": disk.used // (1024 ** 3),
                "disk_total_gb": disk.total // (1024 ** 3),
                "disk_free_gb": disk.free // (1024 ** 3),
                "disk_percent": disk.percent,
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # ── /nexus/registry + Spotify OAuth ─────────────────────────────────

    @router.get("/nexus/registry")
    async def get_nexus_registry():
        try:
            from core.nexus import nexus_manager
            return nexus_manager.get_registry()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/nexus/spotify/authorize")
    async def nexus_spotify_authorize(settings: Dict[str, str]):
        try:
            from core.nexus import spotify_link
            url = spotify_link.get_auth_url(settings)
            return {"url": url}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/nexus/spotify/callback")
    async def nexus_spotify_callback(code: str):
        try:
            from core.nexus import spotify_link, nexus_manager
            prefs_manager = get_preferences_manager()
            all_prefs = prefs_manager.get_all_preferences()
            settings = all_prefs.get("nexus", {}).get("spotify", {})
            success = spotify_link.handle_callback(settings, code)
            if success:
                nexus_manager.update_auth_state("spotify", True)
                return "Spotify authorized successfully! You can close this window."
            raise HTTPException(status_code=400, detail="Failed to authorize Spotify.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # ── /upload-context ──────────────────────────────────────────────────

    @router.post("/upload-context")
    async def upload_context(file: UploadFile = File(...)):
        MAX_SIZE = 4 * 1024 * 1024
        try:
            raw = await file.read()
            if len(raw) > MAX_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Max {MAX_SIZE // (1024 * 1024)} MB.",
                )
            filename = file.filename or "attachment"
            mime_type, _ = mimetypes.guess_type(filename)
            if not mime_type:
                mime_type = "application/octet-stream"
            is_image = mime_type.startswith("image/")
            text_content = None
            if not is_image:
                try:
                    text_content = raw.decode("utf-8")
                except UnicodeDecodeError:
                    try:
                        text_content = raw.decode("latin-1")
                    except Exception:
                        pass
            month_str = datetime.datetime.now().strftime("%Y-%m")
            uploads_dir = _UPLOADS_ROOT / month_str
            uploads_dir.mkdir(parents=True, exist_ok=True)
            safe_name = f"{uuid.uuid4().hex[:8]}_{filename}"
            file_path = uploads_dir / safe_name
            file_path.write_bytes(raw)
            return {
                "filename": filename,
                "path": str(file_path),
                "url": f"/api/workspace/files/content?path={file_path}",
                "is_image": is_image,
                "mime_type": mime_type,
                "content": text_content,
                "size": len(raw),
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"{companion.name}: Upload error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # ── /initiate ────────────────────────────────────────────────────────

    @router.post("/initiate", response_model=ChatResponse)
    async def initiate(request: InitiateRequest):
        try:
            now = datetime.datetime.now()
            timestamp = utcnow_iso()
            mem_data = memory.load()
            base_info = mem_data["base_info"]
            dynamic_memory = mem_data["memory"]

            hour = now.hour
            greeting_period = get_greeting_period(hour)
            day_of_week = now.strftime("%A")
            formatted_datetime = now.strftime(f"{day_of_week}, %d %B %Y — %H:%M")

            # Trigger instruction
            if request.trigger == "startup":
                hours = request.hours_since_last
                if hours < 1:
                    time_desc = "less than an hour"
                elif hours < 24:
                    time_desc = f"{int(hours)} hour{'s' if int(hours) != 1 else ''}"
                else:
                    days = int(hours / 24)
                    time_desc = f"{days} day{'s' if days != 1 else ''}"
                trigger_instruction = cfg.initiate_startup_instruction.format(
                    time_desc=time_desc
                )
            else:
                trigger_instruction = cfg.initiate_proactive_instruction

            # Recent history context
            prefs = get_preferences_manager()
            context_limit = prefs.get(_prefs_key, {}).get("context_limit", 6)
            history_lines: list[str] = []
            hist_data = history.load_days(0, 1)
            if hist_data["history"] and hist_data["history"][0]["messages"] and context_limit > 0:
                recent = hist_data["history"][0]["messages"][-context_limit:]
                for h in recent:
                    role_label = companion.name if h["role"] == "assistant" else "User"
                    clean = h.get("content", "").replace("[msg_break]", " ")
                    history_lines.append(f"{role_label}: {clean}")
            history_ctx = (
                "RECENT CONVERSATION:\n" + "\n".join(history_lines) + "\n\n"
                if history_lines
                else ""
            )

            # Tool instructions (proactive tools)
            tool_instructions = ""
            allow_proactive_tools = cfg.enable_proactive_tools or prefs.get(
                _prefs_key, {}
            ).get("allow_proactive_tools", False)
            if allow_proactive_tools:
                nexus_caps = build_nexus_capabilities()
                nexus_block = f"\n{nexus_caps}\n" if nexus_caps else ""
                tool_instructions = (
                    "TOOL USE: You have access to file tools and Nexus modules. "
                    'Use [tool:read_file path="..."], [tool:write_file path="..." content="..."], '
                    '[tool:list_files path="..."], [tool:search_files path="..." query="..."], '
                    '[tool:nexus module="id" cmd="command"]. '
                    "If you say you will do something, DO IT immediately with the tag.\n"
                    + nexus_block
                )

            system_prompt = cfg.initiate_system_prompt.format(
                name=companion.name,
                base_info=json.dumps(base_info, indent=2),
                memory=json.dumps(dynamic_memory, indent=2),
                datetime_ctx=f"{formatted_datetime} ({greeting_period})",
                history_ctx=history_ctx,
                trigger_instruction=trigger_instruction,
                tool_instructions=tool_instructions,
            )

            model = prefs.get(_prefs_key, {}).get("model", companion.default_model)
            pm = ProviderManager()
            trace_id = f"{companion.id}-initiate-{uuid.uuid4().hex[:8]}"
            response = pm.call_with_failover(
                prompt=system_prompt,
                trace_id=trace_id,
                temperature=cfg.initiate_temperature,
                model=model,
                request_type="generation",
                source=f"{_call_source}-initiate",
            )
            if not response.success:
                raise HTTPException(status_code=500, detail=response.error)

            full_content = response.content.strip()
            expression = cfg.default_expression
            mood = cfg.default_mood
            captured_attachments: list[dict] = []

            # Tool loop for proactive tools
            if allow_proactive_tools:
                response_parts = [full_content]
                workspaces = load_workspaces(_WORKSPACES_FILE)
                current_captures: list[dict] = []

                for _pass in range(3):
                    last_part = response_parts[-1]
                    if not re.search(r"\[tool:", last_part, re.IGNORECASE):
                        break

                    tool_gen = execute_tools_stream(last_part, workspaces)
                    cleaned_last = last_part
                    tool_results: list[str] = []
                    async for event in tool_gen:
                        if event["type"] == "final_cleaned":
                            cleaned_last = event["content"]
                            tool_results = event["results"]
                    response_parts[-1] = cleaned_last

                    if not tool_results:
                        break

                    current_captures, new_attachments = extract_peripheral_captures(
                        tool_results, current_captures
                    )
                    captured_attachments.extend(new_attachments)

                    followup = pm.call_with_failover(
                        prompt=(
                            system_prompt
                            + "\n\n--- SO FAR ---\n"
                            + "\n\n".join(response_parts)
                            + "\n\n--- TOOL RESULTS ---\n"
                            + "\n\n".join(tool_results)
                            + "\n\nContinue briefly. Do NOT repeat greetings."
                        ),
                        trace_id=f"{trace_id}-it{_pass}",
                        temperature=0.6,
                        model=model,
                        request_type="generation",
                        vision_context=current_captures or None,
                        source=f"{_call_source}-initiate-followup",
                    )
                    if followup.success and followup.content.strip():
                        response_parts.append(followup.content.strip())
                    else:
                        break

                full_content = " [msg_break] ".join(p for p in response_parts if p.strip())

            # Extract tags
            full_content = re.sub(r"\[Mood:\s*\w+\]?", "", full_content, flags=re.IGNORECASE).strip()
            exp_match = re.search(r"\[Emotion:\s*(\w+)\]?", full_content, re.IGNORECASE)
            if exp_match:
                expression = exp_match.group(1).lower()

            history.save_message(
                "assistant", full_content, timestamp,
                mood=mood, expression=expression,
                attachments=captured_attachments or None,
                proactive=True,
            )

            return ChatResponse(
                response=full_content,
                expression=expression,
                mood=mood,
                model=response.model,
                memory_updated=False,
                synthesis_ran=False,
                attachments=captured_attachments or None,
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"{companion.name} Initiate Error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    # ── /chat (streaming) ────────────────────────────────────────────────

    @router.post("/chat")
    async def chat(request: ChatRequest):

        async def chat_generator():
            try:
                now = datetime.datetime.now()
                timestamp = utcnow_iso()

                mem_data = memory.load()
                base_info = mem_data["base_info"]
                dynamic_memory = mem_data["memory"]

                workspaces = load_workspaces(_WORKSPACES_FILE)
                workspace_block = ""
                if workspaces:
                    lines = []
                    for ws in workspaces:
                        perms = ", ".join(ws.get("permissions", ["read"]))
                        scope = "all subfolders" if ws.get("recursive", True) else "folder only"
                        lines.append(f"  - [{ws['label']}] {ws['path']} ({perms}, {scope})")
                    workspace_block = (
                        "WORKSPACE ACCESS:\nYou can read/write the following directories:\n"
                        + "\n".join(lines)
                        + "\n\n"
                    )

                hour = now.hour
                greeting_period = get_greeting_period(hour)
                day_of_week = now.strftime("%A")
                formatted_datetime = now.strftime(f"{day_of_week}, %d %B %Y — %H:%M")
                time_since = history.time_since_last()

                nexus_caps = build_nexus_capabilities()
                nexus_block = (
                    "\n" + nexus_caps + "\n"
                    + '8. TOOL USE: use [tool:nexus module="<id>" cmd="<command>"] or file tools listed above.\n'
                    if nexus_caps else ""
                )

                system_prompt = cfg.chat_system_prompt.format(
                    name=companion.name,
                    base_info=json.dumps(base_info, indent=2),
                    memory=json.dumps(dynamic_memory, indent=2),
                    workspace_block=workspace_block,
                    nexus_block=nexus_block,
                    datetime_ctx=f"{formatted_datetime} ({greeting_period})",
                    time_since=time_since,
                )

                prefs = get_preferences_manager()
                prefs_data = prefs.get(_prefs_key, {})
                context_limit = prefs_data.get("context_limit", 6)
                model = prefs_data.get("model", companion.default_model)

                # Strip old peripheral captures from history (prevent hallucination)
                history_raw = request.history[-context_limit:] if context_limit > 0 else []
                history_to_send: list[ChatMessage] = []
                for h in history_raw:
                    h_dict = h.dict()
                    if h_dict.get("attachments"):
                        h_dict["attachments"] = [
                            a for a in h_dict["attachments"]
                            if not a.get("is_peripheral_capture")
                        ]
                    history_to_send.append(ChatMessage(**h_dict))

                # Process attached files / images
                user_message = request.message
                images: list[dict] = []
                if request.attached_files:
                    for fd in request.attached_files:
                        if fd.get("is_image"):
                            try:
                                img_bytes = Path(fd["path"]).read_bytes()
                                images.append({
                                    "data": img_bytes,
                                    "mime_type": fd.get("mime_type", "image/jpeg"),
                                })
                            except Exception as e:
                                logger.error(f"{companion.name}: Failed to load image: {e}")
                        elif fd.get("content"):
                            user_message = (
                                f"[Attached: {fd.get('filename')}]\n{fd['content']}\n"
                                f"[End Attachment]\n\n{user_message}"
                            )

                formatted_prompt = system_prompt + "\n\n--- Conversation History ---\n"
                for msg in history_to_send:
                    clean_content = msg.content.replace("[msg_break]", " ")
                    formatted_prompt += f"{msg.role.capitalize()}: {clean_content}\n"
                formatted_prompt += f"User: {user_message}\n{companion.name}:"

                pm = ProviderManager()
                trace_id = f"{companion.id}-{uuid.uuid4().hex[:8]}"

                yield json.dumps({"type": "tool_start", "content": "..."}) + "\n"

                # ── Main streaming loop ───────────────────────────────────
                full_content = ""
                buffer = ""
                inside_tool = False
                inside_memory = False
                original_images = list(images)
                current_turn_captures: list[dict] = []

                for chunk in pm.call_with_failover_stream(
                    prompt=formatted_prompt,
                    trace_id=trace_id,
                    temperature=cfg.temperature,
                    model=model,
                    request_type="generation",
                    source=_call_source,
                    images=original_images,
                ):
                    full_content += chunk
                    buffer += chunk

                    # Suppress <memory_update> blocks
                    if inside_memory:
                        close = re.search(r"</memory_update>", buffer, re.IGNORECASE)
                        if close:
                            buffer = buffer[close.end():]
                            inside_memory = False
                        else:
                            buffer = ""
                        continue

                    mem_open = re.search(r"<memory_update", buffer, re.IGNORECASE)
                    if mem_open:
                        pre = buffer[: mem_open.start()]
                        if pre:
                            yield json.dumps({"type": "message", "content": clean_memory_tags(pre)}) + "\n"
                        remainder = buffer[mem_open.start():]
                        close = re.search(r"</memory_update>", remainder, re.IGNORECASE)
                        if close:
                            buffer = remainder[close.end():]
                        else:
                            inside_memory = True
                            buffer = ""
                        continue

                    # Suppress [tool:...] blocks
                    if not inside_tool:
                        if "[tool:" in buffer:
                            parts = buffer.split("[tool:", 1)
                            pre = parts[0]
                            if pre:
                                yield json.dumps({"type": "message", "content": clean_memory_tags(pre)}) + "\n"
                            buffer = "[tool:" + parts[1]
                            inside_tool = True
                        elif len(buffer) > 20:
                            yield json.dumps({"type": "message", "content": clean_memory_tags(buffer)}) + "\n"
                            buffer = ""

                    if inside_tool:
                        depth = 0
                        close_idx = -1
                        for i, c in enumerate(buffer):
                            if c == "[":
                                depth += 1
                            elif c == "]":
                                depth -= 1
                                if depth == 0:
                                    close_idx = i
                                    break
                        if close_idx >= 0:
                            buffer = buffer[close_idx + 1:]
                            inside_tool = False

                if buffer and not inside_tool and not inside_memory:
                    yield json.dumps({"type": "message", "content": clean_memory_tags(buffer)}) + "\n"

                # ── Tool loop ─────────────────────────────────────────────
                expression = cfg.default_expression
                mood = cfg.default_mood
                synthesis_ran = False
                memory_updated = False
                captured_attachments: list[dict] = []

                response_parts = [full_content]

                for _tool_pass in range(3):
                    last_part = response_parts[-1]
                    if not re.search(r"\[tool:", last_part, re.IGNORECASE):
                        break

                    tool_gen = execute_tools_stream(last_part, workspaces)
                    cleaned_last = last_part
                    tool_results: list[str] = []
                    next_event_task = asyncio.create_task(tool_gen.__anext__())

                    while True:
                        try:
                            done, _ = await asyncio.wait([next_event_task], timeout=3)
                            if next_event_task in done:
                                try:
                                    event = next_event_task.result()
                                except StopAsyncIteration:
                                    break
                                if event["type"] == "tool_start":
                                    tool = event["tool"]
                                    args = event["args"]
                                    desc = f"Executing {tool}..."
                                    if tool == "read_file":
                                        desc = f"Reading: {args.get('path', '...')}"
                                    elif tool == "write_file":
                                        desc = f"Writing: {args.get('path', '...')}"
                                    elif tool == "list_files":
                                        desc = f"Listing: {args.get('path', '...')}"
                                    elif tool == "nexus":
                                        desc = f"Nexus: {args.get('module', '?')}.{args.get('cmd', '?')}"
                                    yield json.dumps({"type": "tool_start", "content": desc}) + "\n"
                                elif event["type"] == "final_cleaned":
                                    cleaned_last = event["content"]
                                    tool_results = event["results"]
                                    break
                                next_event_task = asyncio.create_task(tool_gen.__anext__())
                            else:
                                yield json.dumps({"type": "heartbeat", "content": "Processing..."}) + "\n"
                        except Exception as te:
                            logger.error(f"{companion.name}: Tool stream error: {te}")
                            if not next_event_task.done():
                                next_event_task.cancel()
                            break

                    response_parts[-1] = cleaned_last

                    if not tool_results:
                        yield json.dumps({"type": "tool_end"}) + "\n"
                        break

                    current_turn_captures, new_attachments = extract_peripheral_captures(
                        tool_results, current_turn_captures
                    )
                    captured_attachments.extend(new_attachments)

                    followup_images = original_images + current_turn_captures
                    cumulative = "\n\n".join(response_parts)

                    followup = pm.call_with_failover(
                        prompt=(
                            formatted_prompt
                            + f"\n\n--- CONVERSATION SO FAR ---\n{cumulative}\n\n"
                            + f"--- TOOL RESULTS ---\n{chr(10).join(tool_results)}\n\n"
                            + "Continue based on the tool results. "
                            + "Do NOT repeat anything already said. "
                            + "If another tool is needed, use it immediately."
                        ),
                        trace_id=f"{trace_id}-it{_tool_pass}",
                        temperature=0.5,
                        model=model,
                        request_type="generation",
                        source=f"{_call_source}-followup",
                        images=followup_images,
                    )

                    yield json.dumps({"type": "tool_end"}) + "\n"

                    if followup.success and followup.content.strip():
                        new_content = followup.content.strip()
                        if new_content.startswith(cumulative[:100]):
                            new_content = new_content[len(cumulative):].strip()
                        if new_content:
                            response_parts.append(new_content)
                            clean_fup = re.sub(r"\[Mood:[^\]]*\]?", "", new_content, flags=re.IGNORECASE)
                            clean_fup = re.sub(r"\[Emotion:[^\]]*\]?", "", clean_fup, flags=re.IGNORECASE)
                            clean_fup = re.sub(r"\[tool:.*?\]", "", clean_fup, flags=re.IGNORECASE)
                            clean_fup = clean_fup.replace("[msg_break]", "\n\n").strip()
                            if clean_fup and len(clean_fup) > 5:
                                yield json.dumps({"type": "message", "content": clean_fup}) + "\n"
                    else:
                        break

                # ── Post-processing ───────────────────────────────────────
                full_for_history = " [msg_break] ".join(p for p in response_parts if p.strip())
                full_for_history = re.sub(r"\[Mood:\s*\w+\]?", "", full_for_history, flags=re.IGNORECASE).strip()

                exp_match = re.search(r"\[Emotion:\s*(\w+)\]?", full_for_history, re.IGNORECASE)
                if exp_match:
                    expression = exp_match.group(1).lower()

                mood_match = re.search(r"\[Mood:\s*(\w+)\]?", full_content, re.IGNORECASE)
                if mood_match:
                    mood = mood_match.group(1).lower()

                full_for_history = memory.update_from_xml(full_for_history)
                memory_updated = True

                history.save_message(
                    "user", user_message, timestamp,
                    attachments=request.attached_files or None,
                )
                history.save_message(
                    "assistant", full_for_history, timestamp,
                    mood=mood,
                    expression=expression,
                    attachments=captured_attachments or None,
                )

                # Synthesis trigger
                msg_count = history.get_total_message_count()
                if msg_count > 0 and msg_count % cfg.synthesis_threshold == 0:
                    dynamic_memory = await memory.run_synthesis(base_info, dynamic_memory, model)
                    synthesis_ran = True

                yield json.dumps({
                    "type": "done",
                    "mood": mood,
                    "expression": expression,
                    "model": model,
                    "memory_updated": memory_updated,
                    "synthesis_ran": synthesis_ran,
                    "attachments": captured_attachments,
                }) + "\n"

            except Exception as e:
                logger.error(f"{companion.name} Stream Error: {e}", exc_info=True)
                yield json.dumps({"type": "error", "content": str(e)}) + "\n"

        return StreamingResponse(
            chat_generator(),
            media_type="application/x-ndjson",
            headers={"X-Accel-Buffering": "no"},
        )

    return router


# ── Custom companion support ──────────────────────────────────────────────────

def make_custom_companion_config(config_json: dict) -> CompanionEngineConfig:
    """
    Build a CompanionEngineConfig from a custom companion's config.json.
    Uses generic prompts — no Python code needed for custom companions.
    """
    from pathlib import Path as _Path
    from core.companions.registry import CompanionConfig as _CC

    _ROOT = _Path(__file__).parent.parent.parent.parent
    cid = config_json["id"]
    _CUSTOM_DIR = _ROOT / "data" / "companions" / "custom" / cid

    companion = _CC(
        id=cid,
        name=config_json.get("name", cid),
        route_prefix=config_json.get("route_prefix", f"/api/custom/{cid}"),
        description=config_json.get("description", ""),
        static_dir=f"companions/custom/{cid}/expressions",
        avatar_prefix=f"{cid}_",
        data_dir=_CUSTOM_DIR,
        history_dir=_CUSTOM_DIR / "history",
        call_source=cid,
        prefs_key=cid,
        default_model=config_json.get("default_model", "gemini-1.5-flash"),
        default_expression=config_json.get("expressions", ["default"])[0] if config_json.get("expressions") else "default",
        expressions=config_json.get("expressions", ["default", "happy", "thinking", "focused", "error"]),
        moods=config_json.get("moods", ["calm", "happy", "reflective", "intense"]),
    )

    default_base_info = {
        "name": config_json.get("name", cid),
        "core_identity": config_json.get("description", ""),
        "personality": config_json.get("personality", ""),
        "speech_style": config_json.get("speech_style", ""),
        "quirks": config_json.get("quirks", []),
        "likes": config_json.get("likes", []),
        "dislikes": config_json.get("dislikes", []),
    }

    return CompanionEngineConfig(
        companion=companion,
        default_base_info=default_base_info,
        temperature=0.75,
        initiate_temperature=0.7,
        default_expression=companion.default_expression,
        default_mood="calm",
    )
