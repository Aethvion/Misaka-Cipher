"""
Misaka Cipher - Arena Routes
API endpoints for the Arena Mode (model comparison battles)
"""

import json
import uuid
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from utils import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/arena", tags=["arena"])

DATA_DIR = Path(__file__).parent.parent / "data"
LEADERBOARD_FILE = DATA_DIR / "arena_leaderboard.json"


class ArenaBattleRequest(BaseModel):
    """Arena battle request."""
    prompt: str
    model_ids: List[str]
    evaluator_model_id: Optional[str] = None


def _load_leaderboard() -> Dict[str, Any]:
    """Load leaderboard from disk."""
    try:
        if LEADERBOARD_FILE.exists():
            with open(LEADERBOARD_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load leaderboard: {e}")
    return {"models": {}}


def _save_leaderboard(data: Dict[str, Any]) -> None:
    """Save leaderboard to disk."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(LEADERBOARD_FILE, 'w') as f:
        json.dump(data, f, indent=2)


async def _call_model(provider_manager, prompt: str, model_id: str, trace_id: str):
    """Call a single model and return result dict."""
    try:
        response = await asyncio.to_thread(
            provider_manager.call_with_failover,
            prompt=prompt,
            trace_id=trace_id,
            model=model_id,
            source="arena"
        )
        return {
            "model_id": model_id,
            "response": response.content if response.success else f"Error: {response.error}",
            "provider": response.provider,
            "success": response.success,
            "score": None
        }
    except Exception as e:
        logger.error(f"Arena call failed for {model_id}: {e}")
        return {
            "model_id": model_id,
            "response": f"Error: {str(e)}",
            "provider": "unknown",
            "success": False,
            "score": None
        }


async def _evaluate_responses(provider_manager, prompt: str, responses: List[Dict], evaluator_model_id: str, trace_id: str) -> List[Dict]:
    """Use evaluator model to score all responses."""
    # Build evaluation prompt
    eval_prompt = f"""You are an AI response evaluator. Score each response to the following prompt on a scale of 1-10.

ORIGINAL PROMPT: {prompt}

"""
    for i, r in enumerate(responses):
        if r["success"]:
            eval_prompt += f"--- RESPONSE {i+1} (Model: {r['model_id']}) ---\n{r['response']}\n\n"

    eval_prompt += """Score each response from 1-10 based on accuracy, helpfulness, clarity, and completeness.
Respond ONLY with a JSON array of objects like: [{"model_id": "...", "score": N}]
No other text. Just the JSON array."""

    try:
        eval_response = await asyncio.to_thread(
            provider_manager.call_with_failover,
            prompt=eval_prompt,
            trace_id=f"{trace_id}_eval",
            model=evaluator_model_id,
            source="arena"
        )

        if eval_response.success:
            # Parse scores from response
            content = eval_response.content.strip()
            # Try to extract JSON from response
            start = content.find('[')
            end = content.rfind(']') + 1
            if start >= 0 and end > start:
                scores = json.loads(content[start:end])
                score_map = {s["model_id"]: s["score"] for s in scores}
                for r in responses:
                    if r["model_id"] in score_map:
                        r["score"] = score_map[r["model_id"]]
    except Exception as e:
        logger.error(f"Evaluation failed: {e}")

    return responses


@router.post("/battle")
async def arena_battle(request: ArenaBattleRequest, req: Request):
    """Run an arena battle: send prompt to multiple models, optionally evaluate."""
    if len(request.model_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 models for a battle")

    try:
        nexus = getattr(req.app.state, 'nexus', None)
        if not nexus:
            raise HTTPException(status_code=503, detail="System not initialized")
        provider_manager = nexus.provider_manager

        trace_id = f"ARENA_{uuid.uuid4().hex[:8]}"

        # Call all models in parallel
        tasks = [
            _call_model(provider_manager, request.prompt, model_id, trace_id)
            for model_id in request.model_ids
        ]
        responses = await asyncio.gather(*tasks)

        # Evaluate if evaluator is set
        if request.evaluator_model_id:
            responses = await _evaluate_responses(
                provider_manager, request.prompt, list(responses),
                request.evaluator_model_id, trace_id
            )

        # Determine winner (highest score, or None if no evaluator)
        winner_id = None
        if request.evaluator_model_id:
            scored = [r for r in responses if r.get("score") is not None and r["success"]]
            if scored:
                winner = max(scored, key=lambda r: r["score"])
                winner_id = winner["model_id"]

        # Update leaderboard
        leaderboard = _load_leaderboard()
        models_data = leaderboard.get("models", {})

        for r in responses:
            if not r["success"]:
                continue
            mid = r["model_id"]
            if mid not in models_data:
                models_data[mid] = {"wins": 0, "battles": 0}
            models_data[mid]["battles"] += 1
            if mid == winner_id:
                models_data[mid]["wins"] += 1

        leaderboard["models"] = models_data
        _save_leaderboard(leaderboard)

        return {
            "trace_id": trace_id,
            "responses": list(responses),
            "winner_id": winner_id,
            "leaderboard": models_data
        }

    except Exception as e:
        logger.error(f"Arena battle error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/leaderboard")
async def get_leaderboard():
    """Get the arena leaderboard."""
    return _load_leaderboard()


@router.delete("/leaderboard")
async def clear_leaderboard():
    """Clear the arena leaderboard."""
    _save_leaderboard({"models": {}})
    return {"status": "success", "message": "Leaderboard cleared"}


class AIConvTurnRequest(BaseModel):
    """Request for a single turn in AI Conversation."""
    model_id: str
    system_prompt: Optional[str] = None
    messages: List[Dict[str, str]] # History of the conversation including current prompt


@router.post("/aiconv/generate")
async def aiconv_generate(request: AIConvTurnRequest, req: Request):
    """Generate a single turn for AI Conversations."""
    try:
        nexus = getattr(req.app.state, 'nexus', None)
        if not nexus:
            raise HTTPException(status_code=503, detail="System not initialized")
        provider_manager = nexus.provider_manager

        trace_id = f"AICONV_{uuid.uuid4().hex[:8]}"
        
        # Build the full prompt string or use the provider's message format if supported.
        # Since call_with_failover usually takes a single string prompt, we construct it:
        full_prompt = ""
        if request.system_prompt:
            full_prompt += f"{request.system_prompt}\n\n"
            
        for msg in request.messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            name = msg.get("name")
            
            if name:
                full_prompt += f"[{name}]: {content}\n\n"
            else:
                full_prompt += f"[{role.capitalize()}]: {content}\n\n"

        response = await asyncio.to_thread(
            provider_manager.call_with_failover,
            prompt=full_prompt,
            trace_id=trace_id,
            model=request.model_id,
            source="aiconv"
        )
        
        return {
            "model_id": request.model_id,
            "response": response.content if response.success else f"Error: {response.error}",
            "provider": response.provider,
            "success": response.success,
            "usage": response.metadata.get("usage", {}) if response.metadata else {}
        }

    except Exception as e:
        logger.error(f"AI Conv generate error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
