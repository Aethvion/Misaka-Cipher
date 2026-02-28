from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
import json
import os
from pathlib import Path

from core.providers.provider_manager import ProviderManager
from core.workspace.preferences_manager import get_preferences_manager
from core.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/misakacipher", tags=["misakacipher"])

# Path configuration
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
MEMORY_DIR = PROJECT_ROOT / "data" / "memory" / "storage" / "misakacipher"
EXPRESSIONS_DIR = PROJECT_ROOT / "core" / "interfaces" / "dashboard" / "static" / "misakacipher" / "expressions"

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage]

class ChatResponse(BaseModel):
    response: str
    expression: str
    model: str
    memory_updated: bool

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
    """Handle chat with Misaka Cipher using specialized memory."""
    try:
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
        # request.history should be a list of {role, content}
        # We take the tail of history
        history_to_send = request.history[-6:] # 3 pairs of user/assistant
        
        formatted_prompt = system_prompt + "\n\n--- Conversation History ---\n"
        for msg in history_to_send:
            formatted_prompt += f"{msg.role.capitalize()}: {msg.content}\n"
        formatted_prompt += f"User: {request.message}\n"
        formatted_prompt += "Misaka:"
        
        # 4. Invoke LLM
        pm = ProviderManager()
        trace_id = f"misaka-{uuid.uuid4().hex[:8]}"
        
        # Use preference for model if available, else default to flash
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
        
        # 5. Extract Expression
        expression = "default"
        import re
        expr_match = re.search(r"\[Emotion:\s*(\w+)\]", full_content)
        if expr_match:
            expression = expr_match.group(1)
            # Clean from content? Usually we keep it for the chat log but can strip for display
            
        # 6. Extract Memory Update
        memory_updated = False
        mem_match = re.search(r"<memory_update>(.*?)</memory_update>", full_content, re.DOTALL)
        if mem_match:
            try:
                update_json = json.loads(mem_match.group(1))
                # Merge into dynamic_memory
                if "user_info" in update_json:
                    dynamic_memory.setdefault("user_info", {}).update(update_json["user_info"])
                if "recent_observations" in update_json:
                    obs = update_json["recent_observations"]
                    if isinstance(obs, list):
                        curr_obs = dynamic_memory.setdefault("recent_observations", [])
                        curr_obs.extend(obs)
                        # Keep last 20 observations
                        dynamic_memory["recent_observations"] = curr_obs[-20:]
                
                dynamic_memory["last_updated"] = trace_id # Use trace_id as a timestamp/ref
                
                # Save back to file
                memory_path = MEMORY_DIR / "memory.json"
                with open(memory_path, "w", encoding="utf-8") as f:
                    json.dump(dynamic_memory, f, indent=4)
                memory_updated = True
                
                # Strip the tag from the final response
                full_content = full_content.replace(mem_match.group(0), "").strip()
            except Exception as me:
                logger.error(f"Failed to parse memory update: {me}")
        
        return ChatResponse(
            response=full_content,
            expression=expression,
            model=response.model,
            memory_updated=memory_updated
        )
        
    except Exception as e:
        logger.error(f"Misaka Chat Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
