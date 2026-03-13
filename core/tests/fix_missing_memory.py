
import sys
import asyncio
from pathlib import Path
from datetime import datetime

# Add project root
sys.path.append(str(Path(__file__).parent.parent))

from core.memory import get_episodic_memory
from core.memory.memory_spec import EpisodicMemory

async def inject_memory():
    store = get_episodic_memory()
    
    # Target specific task ID from user logs
    target_trace_id = "MCTR-20260215101609-6CGUOALW"
    
    print(f"Injecting debug memory for Trace ID: {target_trace_id}")
    
    mem = EpisodicMemory(
        memory_id=f"MANUAL-{target_trace_id}",
        trace_id=target_trace_id,
        timestamp=datetime.now().isoformat(),
        event_type="manual_fix",
        domain="Debug",
        summary="This is a manually injected memory to verify the viewer.",
        content="If you can see this, the retrieval system is working perfectly. The issue is in the saving process.",
        metadata={'status': 'manual_injection'}
    )
    
    success = store.store(mem)
    if success:
        print("Success! Memory injected.")
        print("Please refresh the Memory page now.")
    else:
        print("Failed to store memory.")

if __name__ == "__main__":
    asyncio.run(inject_memory())
