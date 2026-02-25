
import sys
import asyncio
from pathlib import Path
from datetime import datetime
import json

# Add project root
sys.path.append(str(Path(__file__).parent.parent))

from core.memory import get_episodic_memory
from core.memory.memory_spec import EpisodicMemory

async def test_persistence():
    print("--- Memory Persistence Check ---")
    store = get_episodic_memory()
    
    # 1. Create a fake memory
    tid = f"TEST-TRACE-{datetime.now().strftime('%H%M%S')}"
    mid = f"MEM-{tid}"
    
    print(f"Storing memory for Trace ID: {tid}")
    
    mem = EpisodicMemory(
        memory_id=mid,
        trace_id=tid,
        timestamp=datetime.now().isoformat(),
        event_type="test_event",
        domain="System",
        summary="Test Memory Persistence",
        content="This is a test content"
    )
    
    store.store(mem)
    print("Stored.")
    
    # 2. Retrieve immediately
    print("Retrieving...")
    results = store.get_by_trace_id(tid)
    
    if results:
        print(f"SUCCESS: Found {len(results)} memory.")
        print(f"ID: {results[0].memory_id}")
    else:
        print("FAILURE: Could not retrieve memory immediately!")
        
    # 3. Check raw collection
    print("Checking raw collection...")
    raw = store.collection.get(where={'trace_id': tid})
    print(f"Raw IDs: {raw['ids']}")

if __name__ == "__main__":
    asyncio.run(test_persistence())
