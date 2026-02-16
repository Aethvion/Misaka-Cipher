"""
Misaka Cipher - Usage Tracker
Tracks API calls, token usage, and estimated costs.
"""

import json
import threading
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict

from utils import get_logger

logger = get_logger(__name__)

_instance = None
_lock = threading.Lock()

MAX_LOG_ENTRIES = 10000
DATA_DIR = Path(__file__).parent.parent / "data"
USAGE_LOG_FILE = DATA_DIR / "usage_log.json"


def get_usage_tracker():
    """Get or create the singleton UsageTracker."""
    global _instance
    if _instance is None:
        with _lock:
            if _instance is None:
                _instance = UsageTracker()
    return _instance


class UsageTracker:
    """Tracks all API usage: calls, tokens, costs."""

    def __init__(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._log: List[Dict[str, Any]] = self._load_log()
        self._model_costs = self._load_model_costs()
        logger.info(f"UsageTracker initialized ({len(self._log)} existing entries)")

    def _load_log(self) -> List[Dict[str, Any]]:
        """Load existing usage log from disk."""
        try:
            if USAGE_LOG_FILE.exists():
                with open(USAGE_LOG_FILE, "r") as f:
                    data = json.load(f)
                return data if isinstance(data, list) else []
        except Exception as e:
            logger.warning(f"Could not load usage log: {e}")
        return []

    def _save_log(self):
        """Persist usage log to disk (capped)."""
        try:
            # Keep only the most recent entries
            trimmed = self._log[-MAX_LOG_ENTRIES:]
            with open(USAGE_LOG_FILE, "w") as f:
                json.dump(trimmed, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save usage log: {e}")

    def _load_model_costs(self) -> Dict[str, float]:
        """Load per-model cost data from model_registry.json."""
        costs = {}
        try:
            registry_path = Path(__file__).parent.parent / "config" / "model_registry.json"
            if registry_path.exists():
                with open(registry_path, "r") as f:
                    registry = json.load(f)
                for provider_name, provider_cfg in registry.get("providers", {}).items():
                    for model_key, model_info in provider_cfg.get("models", {}).items():
                        if isinstance(model_info, dict):
                            model_id = model_info.get("id", model_key)
                            costs[model_id] = model_info.get("cost_per_1k_tokens", 0.0)
        except Exception as e:
            logger.warning(f"Could not load model costs: {e}")
        return costs

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count from text length (approx 1 token ≈ 4 chars)."""
        if not text:
            return 0
        return max(1, len(text) // 4)

    def log_api_call(
        self,
        provider: str,
        model: str,
        prompt: str,
        response_content: str,
        trace_id: str,
        operation: str = "chat",
        success: bool = True,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Log an API call with token and cost estimation."""
        metadata = metadata or {}

        # Extract or estimate token counts
        usage_data = metadata.get("usage", {})
        prompt_tokens = usage_data.get("prompt_tokens") or usage_data.get("prompt_token_count") or self.estimate_tokens(prompt)
        completion_tokens = usage_data.get("completion_tokens") or usage_data.get("candidates_token_count") or self.estimate_tokens(response_content)
        total_tokens = usage_data.get("total_tokens") or (prompt_tokens + completion_tokens)

        # Estimate cost
        cost_per_1k = self._model_costs.get(model, 0.0)
        estimated_cost = (total_tokens / 1000.0) * cost_per_1k

        entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "provider": provider,
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "estimated_cost": round(estimated_cost, 6),
            "operation": operation,
            "trace_id": trace_id,
            "success": success,
            "tokens_estimated": "usage" not in metadata
        }

        self._log.append(entry)
        self._save_log()

        logger.debug(
            f"[{trace_id}] Usage logged: {provider}/{model} "
            f"tokens={total_tokens} cost=${estimated_cost:.6f}"
        )

    def get_summary(self) -> Dict[str, Any]:
        """Get aggregated usage summary."""
        if not self._log:
            return {
                "total_calls": 0,
                "total_tokens": 0,
                "total_cost": 0.0,
                "by_provider": {},
                "by_model": {},
                "success_rate": 0.0,
                "since": None
            }

        by_provider = defaultdict(lambda: {"calls": 0, "tokens": 0, "cost": 0.0})
        by_model = defaultdict(lambda: {"calls": 0, "tokens": 0, "cost": 0.0})
        total_tokens = 0
        total_cost = 0.0
        successes = 0

        for entry in self._log:
            p = entry.get("provider", "unknown")
            m = entry.get("model", "unknown")
            t = entry.get("total_tokens", 0)
            c = entry.get("estimated_cost", 0.0)

            by_provider[p]["calls"] += 1
            by_provider[p]["tokens"] += t
            by_provider[p]["cost"] += round(c, 6)

            by_model[m]["calls"] += 1
            by_model[m]["tokens"] += t
            by_model[m]["cost"] += round(c, 6)

            total_tokens += t
            total_cost += c
            if entry.get("success", True):
                successes += 1

        return {
            "total_calls": len(self._log),
            "total_tokens": total_tokens,
            "total_cost": round(total_cost, 6),
            "by_provider": dict(by_provider),
            "by_model": dict(by_model),
            "success_rate": round(successes / len(self._log) * 100, 1) if self._log else 0,
            "since": self._log[0].get("timestamp") if self._log else None
        }

    def get_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get recent usage entries (newest first)."""
        return list(reversed(self._log[-limit:]))

    def get_hourly_breakdown(self, hours: int = 24) -> List[Dict[str, Any]]:
        """Get token usage broken down by hour for chart data."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        cutoff_str = cutoff.isoformat() + "Z"

        buckets = defaultdict(lambda: {"tokens": 0, "calls": 0, "cost": 0.0})

        for entry in self._log:
            ts = entry.get("timestamp", "")
            if ts >= cutoff_str:
                # Bucket by hour
                hour_key = ts[:13]  # "2026-02-16T14"
                buckets[hour_key]["tokens"] += entry.get("total_tokens", 0)
                buckets[hour_key]["calls"] += 1
                buckets[hour_key]["cost"] += entry.get("estimated_cost", 0.0)

        # Sort by hour
        result = []
        for key in sorted(buckets.keys()):
            result.append({
                "hour": key,
                "tokens": buckets[key]["tokens"],
                "calls": buckets[key]["calls"],
                "cost": round(buckets[key]["cost"], 6)
            })

        return result
