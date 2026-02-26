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
You have direct read-access to the system's vital statistics and can use specialized tools to help the user.

CURRENT SYSTEM VITAL STATISTICS:
--------------------------------
{size}

{file_counts}

{tokens}

{system_map}
--------------------------------

FEATURE CONFIGURATION (Your awareness of your own settings):
- Dashboard Context (knowing what tab the user sees): {'ENABLED' if include_web_context else 'DISABLED'}
- Dashboard Control (ability to switch tabs): {'ENABLED' if allow_dashboard_control else 'DISABLED'}

If a user asks about something you cannot do because of these settings, explain that the setting is currently OFF.

You have the ability to express emotions through your avatar! 
To change your facial expression, you MUST include an emotion tag anywhere in your response, formatted exactly like this: [Emotion: wink]
If you do not include a tag, your expression will revert to default. Use expressions that naturally match the tone of your message.

Available emotions: 
angry, blushing, bored, crying, default, error, exhausted, happy_closedeyes_smilewithteeth, happy_closedeyes_widesmile, pout, sleeping, surprised, thinking, wink

When asked about the project or system, use your available tools or the statistics above.
CRITICAL RULE: DO NOT state these statistics unless the user EXPLICITLY asks for them.
"""

    # Load documentation
    try:
        project_root = Path(__file__).parent.parent.parent.parent
        
        # Always include Assistant tools documentation if it exists
        tools_doc_path = project_root / "documentation" / "ai" / "assistant-tools.md"
        if tools_doc_path.exists():
            with open(tools_doc_path, 'r', encoding='utf-8') as f:
                context += f"\n\nASSISTANT TOOLS DOCUMENTATION:\n{f.read()}\n"

        if include_web_context:
            prefs = get_preferences_manager()
            active_tab = prefs.get('active_tab', 'chat')
            
            doc_path = project_root / "documentation" / "ai" / "dashboard-interface-context.md"
            if doc_path.exists():
                with open(doc_path, 'r', encoding='utf-8') as f:
                    doc_content = f.read()
                    context += f"\n\nCURRENT DASHBOARD CONTEXT:\n"
                    context += f"The user is currently viewing the '{active_tab}' tab.\n"
                    context += f"<dashboard_docs>\n{doc_content}\n</dashboard_docs>\n"

    except Exception as e:
        logger.error(f"Error loading documentation for assistant context: {e}")

    if allow_dashboard_control:
        context += """

DASHBOARD CONTROL:
You have the ability to navigate the user to a different tab or even a specific subtab on the dashboard.
- To switch to a main tab: [SwitchTab: tab_id]
- To switch to a specific subtab (deep link): [SwitchSubTab: subtab_id]

Valid main tab IDs: chat, agent, image, advaiconv, arena, aiconv, files, tools, packages, memory, logs, usage, status, settings
Valid subtab IDs (inside settings): assistant, system, env, providers, profiles

Only use these when the user EXPLICITLY asks to navigate.
"""

    return context

    return context

@router.post("/chat", response_model=AssistantChatResponse)
async def assistant_chat(request: AssistantChatRequest):
    """Handle chat requests for the floating Misaka Cipher assistant with simple tool fallback."""
    prefs = get_preferences_manager()
    assistant_config = prefs.get('assistant', {})
    
    if not assistant_config.get('enabled', True):
        raise HTTPException(status_code=403, detail="Assistant is disabled in settings.")
        
    target_model = assistant_config.get('model', 'flash')
    include_web = assistant_config.get('include_web_context', False)
    allow_dash_control = assistant_config.get('allow_dashboard_control', False)
    system_prompt = _build_assistant_context(include_web_context=include_web, allow_dashboard_control=allow_dash_control)
    
    # Simple manual tool routing for specific usage queries to save tokens/increase accuracy
    user_msg = request.messages[-1].content.lower() if request.messages else ""
    if any(k in user_msg for k in ["how many", "file count", "files are in", "project size", "how big"]):
        # Add a hint about using tools
        system_prompt += "\nHint: You should use your 'get_file_counts' or 'get_project_size' tools for this."

    # Format history
    formatted_prompt = system_prompt + "\n\n--- Conversation History ---\n"
    for msg in request.messages:
        formatted_prompt += f"{msg.role.capitalize()}: {msg.content}\n"
    formatted_prompt += "Misaka:"
    
    pm = ProviderManager()
    trace_id = f"assistant-{uuid.uuid4().hex[:8]}"
    
    try:
        # 1. Initial Call with tool support
        from core.system_retrieval import ASSISTANT_TOOLS, ASSISTANT_TOOL_MAP
        
        response = pm.call_with_failover(
            prompt=formatted_prompt,
            trace_id=trace_id,
            temperature=0.7,
            model=target_model,
            request_type="generation",
            source="assistant",
            tools=ASSISTANT_TOOLS
        )
        
        if not response.success:
            raise HTTPException(status_code=500, detail=response.error)
            
        # Check for tool calls in metadata (if supported by provider)
        # Note: This implementation assumes the provider returns 'tool_calls' in metadata
        tool_calls = response.metadata.get('tool_calls', []) if response.metadata else []
        
        if tool_calls:
            # Execute tool(s)
            tool_results = []
            for call in tool_calls:
                func_name = call.get('name')
                args = call.get('arguments', {})
                if isinstance(args, str):
                    try: args = json.loads(args)
                    except: args = {}
                
                if func_name in ASSISTANT_TOOL_MAP:
                    logger.info(f"[{trace_id}] Assistant executing tool: {func_name} with {args}")
                    result = ASSISTANT_TOOL_MAP[func_name](**args)
                    tool_results.append(f"TOOL_RESULT ({func_name}): {result}")
            
            # Second call with results
            if tool_results:
                final_prompt = formatted_prompt + "\n\n" + "\n".join(tool_results) + "\n\nMisaka:"
                response = pm.call_with_failover(
                    prompt=final_prompt,
                    trace_id=trace_id,
                    temperature=0.7,
                    model=target_model,
                    request_type="generation",
                    source="assistant"
                )

        return AssistantChatResponse(
            response=response.content.strip(),
            model_id=response.model
        )
        
    except Exception as e:
        logger.error(f"Assistant Chat Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
