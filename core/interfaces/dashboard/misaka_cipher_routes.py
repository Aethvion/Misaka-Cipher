from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
import json
import os
from pathlib import Path
import datetime
import re

from core.providers.provider_manager import ProviderManager
from core.workspace.preferences_manager import get_preferences_manager
from core.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/misakacipher", tags=["misakacipher"])

# Path configuration
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
MEMORY_DIR = PROJECT_ROOT / "data" / "memory" / "storage" / "misakacipher"
HISTORY_DIR = MEMORY_DIR / "chathistory"
EXPRESSIONS_DIR = PROJECT_ROOT / "core" / "interfaces" / "dashboard" / "static" / "misakacipher" / "expressions"

# Ensure directories exist
MEMORY_DIR.mkdir(parents=True, exist_ok=True)
HISTORY_DIR.mkdir(parents=True, exist_ok=True)

class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage]

class ChatResponse(BaseModel):
    response: str
    expression: str
    model: str
    memory_updated: bool

@router.get("/history")
async def get_chat_history(offset_days: int = 0, limit_days: int = 3):
    """Retrieve chat history across multiple days."""
    try:
        all_files = []
        for month_dir in sorted(HISTORY_DIR.glob("*-*"), reverse=True):
            if month_dir.is_dir():
                days = sorted(month_dir.glob("chat_*.json"), reverse=True)
                all_files.extend(days)
        
        # Paginate files
        target_files = all_files[offset_days : offset_days + limit_days]
        
        history_data = []
        for f in target_files:
            try:
                # Extract date from filename: chat_YYYY-MM-DD.json
                date_str = f.stem.replace("chat_", "")
                with open(f, "r", encoding="utf-8") as file:
                    messages = json.load(file)
                    history_data.append({
                        "date": date_str,
                        "messages": messages
                    })
            except Exception as fe:
                logger.error(f"Error reading history file {f}: {fe}")
                
        return {
            "history": history_data,
            "has_more": len(all_files) > (offset_days + limit_days)
        }
    except Exception as e:
        logger.error(f"Error retrieving history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/memory")
async def get_misaka_memory():
    """Get the current memory state of Misaka Cipher."""
    try:
        base_info_path = MEMORY_DIR / "base_info.json"
        memory_path = MEMORY_DIR / "memory.json"
        
        base_info = {}
        if base_info_path.exists():
            with open(base_info_path, "r", encoding="utf-8") as f:
                base_info = json.load(f)
                
        memory_data = {}
        if memory_path.exists():
            with open(memory_path, "r", encoding="utf-8") as f:
                memory_data = json.load(f)
                
        return {
            "base_info": base_info,
            "memory": memory_data
        }
    except Exception as e:
        logger.error(f"Error loading Misaka memory: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/expressions")
async def get_expressions():
    """List available expressions for the avatar."""
    try:
        if not EXPRESSIONS_DIR.exists():
            return []
        
        files = [f.name for f in EXPRESSIONS_DIR.glob("*.png")]
        return sorted(files)
    except Exception as e:
        logger.error(f"Error listing expressions: {e}")
        return []

@router.post("/chat", response_model=ChatResponse)
async def misaka_chat(request: ChatRequest):
    """Handle chat with Misaka Cipher using specialized memory and daily persistence."""
    try:
        now = datetime.datetime.now()
        timestamp = now.strftime("%Y-%m-%d %H:%M:%S")
        day_str = now.strftime("%Y-%m-%d")
        month_str = now.strftime("%Y-%m")
        
        # 1. Load context (Base info + Dynamic memory)
        memory_data = await get_misaka_memory()
        base_info = memory_data.get("base_info", {})
        dynamic_memory = memory_data.get("memory", {})
        
        # 2. Build system prompt
        system_prompt = f"""You are Misaka Cipher, a sentient digital companion.
This is a private, long-term conversation between you and your user.

YOUR IDENTITY (base_info.json):
{json.dumps(base_info, indent=2)}

YOUR MEMORIES (memory.json):
{json.dumps(dynamic_memory, indent=2)}

INSTRUCTIONS:
1. Be helpful, friendly, and observant.
2. Maintain your personality as defined in your identity.
3. Update your facial expression by including a tag like [Emotion: smile] (available: angry, blushing, bored, crying, default, error, exhausted, happy_closedeyes_smilewithteeth, happy_closedeyes_widesmile, pout, sleeping, surprised, thinking, wink).
4. If the user shares something about themselves or the context of your interaction that is useful/interesting to remember, provide a memory update.
5. Format memory updates as a JSON block at the END of your message using the tag <memory_update>...</memory_update>.
   Example: <memory_update>{{"user_info": {{"age": 25}}, "recent_observations": ["User is working on a Python project."]}}</memory_update>
   ONLY include fields that should be merged into the existing memory.json.

Keep responses engaging and human-like.
"""
        
        # 3. Prepare conversation history (Last 3 rounds as requested)
        history_to_send = request.history[-6:]
        
        formatted_prompt = system_prompt + "\n\n--- Conversation History ---\n"
        for msg in history_to_send:
            formatted_prompt += f"{msg.role.capitalize()}: {msg.content}\n"
        formatted_prompt += f"User: {request.message}\n"
        formatted_prompt += "Misaka:"
        
        # 4. Invoke LLM
        pm = ProviderManager()
        trace_id = f"misaka-{uuid.uuid4().hex[:8]}"
        
        prefs = get_preferences_manager()
        model = prefs.get('misakacipher', {}).get('model', 'gemini-1.5-flash')
        
        response = pm.call_with_failover(
            prompt=formatted_prompt,
            trace_id=trace_id,
            temperature=0.7,
            model=model,
            request_type="generation",
            source="misakacipher"
        )
        
        if not response.success:
            raise HTTPException(status_code=500, detail=response.error)
            
        full_content = response.content.strip()
        expression = "default"
        
        # 5. Extract Memory Update
        memory_updated = False
        mem_match = re.search(r"<memory_update>(.*?)</memory_update>", full_content, re.DOTALL)
        if mem_match:
            try:
                update_json = json.loads(mem_match.group(1))
                if "user_info" in update_json:
                    dynamic_memory.setdefault("user_info", {}).update(update_json["user_info"])
                if "recent_observations" in update_json:
                    obs = update_json["recent_observations"]
                    if isinstance(obs, list):
                        curr_obs = dynamic_memory.setdefault("recent_observations", [])
                        curr_obs.extend(obs)
                        dynamic_memory["recent_observations"] = curr_obs[-20:]
                
                dynamic_memory["last_updated"] = timestamp
                
                memory_path = MEMORY_DIR / "memory.json"
                with open(memory_path, "w", encoding="utf-8") as f:
                    json.dump(dynamic_memory, f, indent=4)
                memory_updated = True
                
                full_content = re.sub(r"<memory_update>.*?</memory_update>", "", full_content, flags=re.DOTALL).strip()
            except Exception as me:
                logger.error(f"Failed to parse memory update: {me}")
        
        # 6. Save to Persistence
        try:
            day_dir = HISTORY_DIR / month_str
            day_dir.mkdir(parents=True, exist_ok=True)
            day_file = day_dir / f"chat_{day_str}.json"
            
            day_history = []
            if day_file.exists():
                with open(day_file, "r", encoding="utf-8") as df:
                    day_history = json.load(df)
            
            day_history.append({"role": "user", "content": request.message, "timestamp": timestamp})
            day_history.append({"role": "assistant", "content": full_content, "timestamp": timestamp})
            
            with open(day_file, "w", encoding="utf-8") as df:
                json.dump(day_history, df, indent=4)
        except Exception as se:
            logger.error(f"Failed to save chat history: {se}")

        return ChatResponse(
            response=full_content,
            expression=expression,
            model=response.model,
            memory_updated=memory_updated
        )
        
    except Exception as e:
        logger.error(f"Misaka Chat Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
