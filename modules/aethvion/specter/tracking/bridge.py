"""
tracking/bridge.py — Tracking bridge stub for Specter VTuber Engine

This module provides the interface between external face/motion tracking
systems and the Specter parameter system. It is designed to be a separate
module that communicates with the Specter engine via WebSocket or HTTP.

Current status: Stub / interface definition
Full tracking will be implemented as a separate Specter Tracking Module.

Supported tracking backends (planned):
- MediaPipe Face Landmarker (browser-native, no install required)
- OpenSeeFace (desktop face tracking)
- VTube Studio API (bridge to VTS-compatible trackers)
- Custom webcam backend
"""

from typing import Optional, Callable


class TrackingBridge:
    """
    Interface for tracking backends → Specter parameter mapping.

    Usage:
        bridge = TrackingBridge(backend="mediapipe")
        bridge.on_params(lambda params: send_to_specter(params))
        bridge.start()
    """

    SUPPORTED_BACKENDS = ["mediapipe", "openseeface", "vtube_studio", "custom"]

    # Standard parameter mapping from tracking data
    # These map tracking output fields → Specter parameter IDs
    DEFAULT_MAPPING = {
        "head_yaw":         "ParamAngleX",     # Left-right head rotation
        "head_pitch":       "ParamAngleY",     # Up-down head rotation
        "head_roll":        "ParamAngleZ",     # Tilt head rotation
        "eye_open_left":    "ParamEyeOpenL",
        "eye_open_right":   "ParamEyeOpenR",
        "mouth_open":       "ParamMouthOpenY",
        "mouth_smile":      "ParamMouthForm",
        "brow_left_y":      "ParamBrowLY",
        "brow_right_y":     "ParamBrowRY",
    }

    def __init__(self, backend: str = "mediapipe",
                 param_mapping: Optional[dict] = None):
        self.backend = backend
        self.param_mapping = param_mapping or self.DEFAULT_MAPPING
        self._callback: Optional[Callable] = None
        self._running = False

        if backend not in self.SUPPORTED_BACKENDS:
            raise ValueError(
                f"Unknown backend '{backend}'. "
                f"Supported: {self.SUPPORTED_BACKENDS}"
            )

    def on_params(self, callback: Callable[[dict], None]) -> None:
        """Register a callback that receives Specter parameter updates."""
        self._callback = callback

    def start(self) -> None:
        """Start the tracking backend. Non-blocking."""
        if self._running:
            return
        self._running = True
        print(f"[TrackingBridge] Starting '{self.backend}' backend (stub)")
        # TODO: Initialize backend and start capture loop

    def stop(self) -> None:
        """Stop the tracking backend."""
        self._running = False
        print("[TrackingBridge] Stopped")

    def _emit(self, raw_tracking: dict) -> None:
        """Convert raw tracking data to Specter params and call callback."""
        if not self._callback:
            return
        params = {}
        for raw_key, param_id in self.param_mapping.items():
            if raw_key in raw_tracking:
                params[param_id] = raw_tracking[raw_key]
        self._callback(params)

    @property
    def is_running(self) -> bool:
        return self._running


# WebSocket endpoint data format (for frontend communication)
# The Specter editor connects to ws://localhost:8002/tracking
# and receives JSON messages of this format:
TRACKING_MESSAGE_SCHEMA = {
    "type": "params",      # "params" | "status" | "error"
    "params": {
        "ParamAngleX":   0.0,   # -30 to 30
        "ParamAngleY":   0.0,
        "ParamAngleZ":   0.0,
        "ParamEyeOpenL": 1.0,   # 0 to 1
        "ParamEyeOpenR": 1.0,
        "ParamMouthOpenY": 0.0,
        "ParamMouthForm": 0.0,  # -1 to 1
        "ParamBrowLY":   0.0,
        "ParamBrowRY":   0.0,
    }
}
