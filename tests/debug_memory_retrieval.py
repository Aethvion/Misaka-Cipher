
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

    # Check specific trace IDs
    trace_ids = [
        "MCTR-20260215101544-7Z0GB0WH", # From default.json
        "MCTR-20260213133506-OX4DH3LJ"  # From thread-1
    ]
    
    for tid in trace_ids:
        print(f"\nQuerying Trace ID: {tid}")
        memories = store.get_by_trace_id(tid)
        print(f"Found {len(memories)} memories")
        for m in memories:
            print(f" - [{m.event_type}] {m.summary[:50]}...")

    # List all IDs to see format
    print("\n--- Listing first 5 IDs in DB ---")
    results = store.collection.get(limit=5)
    for i, mid in enumerate(results['ids']):
        meta = results['metadatas'][i]
        print(f"ID: {mid} | Trace: {meta.get('trace_id')} | Event: {meta.get('event_type')}")

if __name__ == "__main__":
    debug_memory()
