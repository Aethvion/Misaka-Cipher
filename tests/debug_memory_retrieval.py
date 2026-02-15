
import sys
from pathlib import Path
import logging

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent))

from memory.episodic_memory import get_episodic_memory
from utils import get_logger

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = get_logger("debug_memory")

def debug_memory():
    print("--- Memory Debugger ---")
    
    # Initialize store
    store = get_episodic_memory()
    print(f"Store initialized: {store}")
    
    # Check count
    count = store.get_count()
    print(f"Total memories in DB: {count}")
    
    if count == 0:
        print("!! DB is empty !!")
        return

    # List recent IDs to see format
    print("\n--- Listing LAST 20 IDs in DB ---")
    count = store.collection.count()
    limit = min(20, count)
    results = store.collection.get(limit=limit, include=['metadatas', 'documents']) # offset handling is not great in chroma get without ids, let's just dump first N or query by timestamp?
    # Actually Chroma `get` returns first N by insertion order usually if no filter. 
    # But let's dump what we can.
    
    # Just dump everything if small, or first 50.
    all_res = store.collection.get(limit=50)
    for i, mid in enumerate(all_res['ids']):
        meta = all_res['metadatas'][i]
        print(f"ID: {mid} | Trace: {meta.get('trace_id')} | Thread: {meta.get('thread_id', 'N/A')} | Event: {meta.get('event_type')}")
        print(f"   Summary: {meta.get('summary', 'No summary')[:100]}")

if __name__ == "__main__":
    debug_memory()
