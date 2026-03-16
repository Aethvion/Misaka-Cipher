from .vtuber_format import VTuberFormat, VTUBER_VERSION

# Backward-compatible aliases (older scripts may use the Specter name)
SpecterFormat   = VTuberFormat
SPECTER_VERSION = VTUBER_VERSION

__all__ = [
    "VTuberFormat",   "VTUBER_VERSION",
    "SpecterFormat",  "SPECTER_VERSION",
]
