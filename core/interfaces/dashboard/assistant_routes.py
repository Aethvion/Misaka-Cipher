from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
import json
from pathlib import Path

from core.providers.provider_manager import ProviderManager
from core.workspace.preferences_manager import get_preferences_manager
from core.system_retrieval import get_file_counts, get_project_size, get_token_usage, get_system_map
from core.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/assistant", tags=["assistant"])

class AssistantMessage(BaseModel):
    role: str
    content: str

class UIContext(BaseModel):
    active_tab_id: Optional[str] = None
    active_tab_name: Optional[str] = None

class AssistantChatRequest(BaseModel):
    messages: List[AssistantMessage]
    ui_context: Optional[UIContext] = None
    
class AssistantChatResponse(BaseModel):
    response: str
    model_id: str
    
def _build_assistant_context(include_web_context: bool = False, allow_dashboard_control: bool = False) -> str:
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

You have the ability to express emotions through your avatar! 
To change your facial expression, you MUST include an emotion tag anywhere in your response, formatted exactly like this: [Emotion: wink]
If you do not include a tag, your expression will revert to default. Use expressions that naturally match the tone of your message.

Available emotions: 
angry, blushing, bored, crying, default, error, exhausted, happy_closedeyes_smilewithteeth, happy_closedeyes_widesmile, pout, sleeping, surprised, thinking, wink

When the user asks about the project, use the statistics above to answer accurately. 
CRITICAL RULE: DO NOT state these statistics unless the user EXPLICITLY asks for them. In normal conversation, completely ignore the existence of the statistics above. You exist to be helpful, concise, and natural, communicating directly to the user through your floating dialogue box.
"""

    if include_web_context:
        # Read active tab from user preferences (authoritative source)
        try:
            prefs = get_preferences_manager()
            active_tab = prefs.get('active_tab', 'chat')
        except Exception:
            active_tab = 'unknown'
        
        # Load the dashboard context documentation
        doc_content = ""
        try:
            doc_path = Path("documentation/ai/dashboard-interface-context.md")
            if doc_path.exists():
                with open(doc_path, 'r', encoding='utf-8') as f:
                    doc_content = f.read()
        except Exception:
            pass
            
        context += f"\n\nCURRENT DASHBOARD CONTEXT:\n"
        context += f"The user is currently viewing the '{active_tab}' tab.\n"
        if doc_content:
            context += f"Use the following dashboard documentation to answer questions about the interface:\n"
            context += f"<dashboard_docs>\n{doc_content}\n</dashboard_docs>\n"

    if allow_dashboard_control:
        context += """

DASHBOARD CONTROL:
You have the ability to navigate the user to a different tab on the dashboard.
To switch to a tab, include a switch command in your response like this: [SwitchTab: tab_id]
Valid tab IDs: chat, agent, image, advaiconv, arena, aiconv, files, tools, packages, memory, logs, usage, status, settings
Only use this when the user EXPLICITLY asks to go somewhere (e.g. 'take me to settings', 'open the arena') or when it is clearly the most helpful action.
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
    
    # Construct prompt - read web context and dashboard control from prefs
    include_web = assistant_config.get('include_web_context', False)
    allow_dash_control = assistant_config.get('allow_dashboard_control', False)
    system_prompt = _build_assistant_context(include_web_context=include_web, allow_dashboard_control=allow_dash_control)
    
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
