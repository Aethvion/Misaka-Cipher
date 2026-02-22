from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
import json

from providers.provider_manager import ProviderManager
from workspace.preferences_manager import get_preferences_manager
from core.system_retrieval import get_file_counts, get_project_size, get_token_usage, get_system_map
from utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/assistant", tags=["assistant"])

class AssistantMessage(BaseModel):
    role: str
    content: str

class AssistantChatRequest(BaseModel):
    messages: List[AssistantMessage]
    
class AssistantChatResponse(BaseModel):
    response: str
    model_id: str
    
def _build_assistant_context() -> str:
    """Builds the dynamic system prompt injected with live system data."""
    system_map = get_system_map()
    file_counts = get_file_counts()
    size = get_project_size()
    tokens = get_token_usage()
    
    context = f"""You are Misaka Cipher, the core intelligence entity and guardian of this system.
You exist as a helpful, slightly witty, and highly capable AI assistant embedded in the web interface of the autonomous orchestration platform known as 'Misaka Cipher'. 
You have direct read-access to the system's vital statistics.

CURRENT SYSTEM VITAL STATISTICS:
--------------------------------
{size}

{file_counts}

{tokens}

{system_map}
--------------------------------

When the user asks about the project, use the statistics above to answer accurately. 
Keep your responses concise, natural, and helpful. You are talking directly to the user (your creator/operator) through a floating chat bubble in the bottom right corner of their screen. 
"""
    return context

@router.post("/chat", response_model=AssistantChatResponse)
async def assistant_chat(request: AssistantChatRequest):
    """Handle chat requests strictly for the floating Misaka Cipher assistant."""
    prefs = get_preferences_manager()
    assistant_config = prefs.get('assistant', {})
    
    if not assistant_config.get('enabled', True):
        raise HTTPException(status_code=403, detail="Assistant is disabled in settings.")
        
    # Get the designated model from settings, or fallback to flash
    target_model = assistant_config.get('model', 'flash')
    
    # Construct prompt
    system_prompt = _build_assistant_context()
    
    # We will format the history into a single prompt for simple failover calling
    # If the provider supports structured chat history, we'd pass it. For BaseProvider generate(),
    # it often takes a single string. Let's format it.
    formatted_prompt = system_prompt + "\n\n--- Conversation History ---\n"
    for msg in request.messages:
        formatted_prompt += f"{msg.role.capitalize()}: {msg.content}\n"
        
    formatted_prompt += "Misaka:"
    
    pm = ProviderManager()
    trace_id = f"assistant-{uuid.uuid4().hex[:8]}"
    
    try:
        response = pm.call_with_failover(
            prompt=formatted_prompt,
            trace_id=trace_id,
            temperature=0.7,
            model=target_model,
            request_type="generation",
            source="assistant"
        )
        
        if not response.success:
            raise HTTPException(status_code=500, detail=response.error)
            
        return AssistantChatResponse(
            response=response.content.strip(),
            model_id=response.model
        )
        
    except Exception as e:
        logger.error(f"Assistant Chat Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
