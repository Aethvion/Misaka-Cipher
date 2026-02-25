import asyncio
import shutil
from pathlib import Path
from core.orchestrator.task_queue import TaskQueueManager, Task
from core.orchestrator.task_models import ChatThread

# Mock Orchestrator
class MockOrchestrator:
    def __init__(self):
        pass
    
    def process_message(self, message, mode="auto"):
        pass

async def test_persistence():
    print("Starting Persistence Test...")
    
    # Setup
    base_path = Path(__file__).parent.parent
    threads_dir = base_path / "memory" / "storage" / "threads"
    
    # Clean up any existing test threads
    if threads_dir.exists():
        # Don't delete the whole dir, just test files if any
        pass
    
    # 1. Initialize Manager
    orchestrator = MockOrchestrator()
    manager = TaskQueueManager(orchestrator)
    
    # 2. Create Thread
    thread_id = "test_thread_persistence"
    await manager.submit_task("Hello", thread_id)
    
    print(f"Thread created: {thread_id}")
    
    # 3. Set Mode
    manager.set_thread_mode(thread_id, "chat_only")
    print("Mode set to chat_only")
    
    # 4. Verify File Exists
    thread_file = threads_dir / f"{thread_id}.json"
    if thread_file.exists():
        print("✅ Thread file found on disk")
    else:
        print("❌ Thread file NOT found on disk")
        return

    # 5. Simulate Restart (New Manager)
    print("Simulating restart...")
    manager2 = TaskQueueManager(orchestrator)
    
    if thread_id in manager2.threads:
        thread = manager2.threads[thread_id]
        print("✅ Thread loaded after restart")
        
        if thread.mode == "chat_only":
            print("✅ Thread mode persisted correctly")
        else:
            print(f"❌ Thread mode mismatch: {thread.mode}")
            
        if len(thread.task_ids) > 0:
             print("✅ Task IDs persisted")
        else:
             print("❌ Task IDs lost")
             
    else:
        print("❌ Thread NOT loaded after restart")
        return

    # 6. Delete Thread
    manager2.delete_thread(thread_id)
    print("Thread deleted")
    
    if not thread_file.exists():
        print("✅ Thread file deleted from disk")
    else:
        print("❌ Thread file still exists on disk")
        
    print("Test Complete")

if __name__ == "__main__":
    asyncio.run(test_persistence())
