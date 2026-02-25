# Backward-compatibility shim — real module lives at core/nexus_core.py
# All existing importers (orchestrator, factory, forge, memory, tests, cli) work unchanged.
from core.nexus_core import *  # noqa: F401, F403
from core.nexus_core import NexusCore, Request, Response  # explicit for IDE/type checkers
