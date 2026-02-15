
import sys
import asyncio
from pathlib import Path

# Add project root
sys.path.append(str(Path(__file__).parent.parent))

from memory import get_episodic_memory

async def remove_manual_memory():
    store = get_episodic_memory()
    
    # ID of the manual memory
    target_id = "MANUAL-MCTR-20260215101609-6CGUOALW"
    
    print(f"Attempting to delete memory: {target_id}")
    
    try:
        # Check if it exists first
        results = store.collection.get(ids=[target_id])
        if not results['ids']:
            print("Memory not found (already deleted?)")
            return

        # Delete
        store.collection.delete(ids=[target_id])
        print("Successfully deleted memory.")
        
    except Exception as e:
        print(f"Error deleting memory: {e}")

if __name__ == "__main__":
    asyncio.run(remove_manual_memory())
