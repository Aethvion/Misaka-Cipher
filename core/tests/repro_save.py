
import json
import dataclasses
from datetime import datetime
from core.orchestrator.task_models import ChatThread
from pathlib import Path
import tempfile
import os

def test_save_thread():
    print("Testing ChatThread serialization...")
    
    # Create thread with typical data
    thread = ChatThread(
        id="test-thread-1",
        title="Test Thread",
        created_at=datetime.now(),
        updated_at=datetime.now(),
        settings={
            "context_mode": "none",
            "context_window": 5,
            "system_terminal_enabled": True
        }
    )
    
    print(f"Thread object: {thread}")
    
    try:
        data = thread.to_dict()
        print(f"to_dict result: {data}")
        
        json_str = json.dumps(data, indent=2)
        print("JSON serialization successful")
        print(json_str)
        
    except Exception as e:
        print(f"JSON serialization FAILED: {e}")
        return

    # Test with potentially problematic settings
    print("\nTesting with 'set' in settings (should fail)...")
    thread.settings['bad_value'] = {1, 2, 3}
    
    try:
        data = thread.to_dict()
        # to_dict shouldn't fail, but json.dump should
        json.dumps(data)
        print("JSON serialization unexpectedly succeeded with set")
    except TypeError as e:
        print(f"Caught expected TypeError: {e}")
    except Exception as e:
        print(f"Caught unexpected exception: {e}")

if __name__ == "__main__":
    test_save_thread()
