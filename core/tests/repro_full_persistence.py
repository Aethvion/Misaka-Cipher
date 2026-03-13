import asyncio
import shutil
from pathlib import Path
from datetime import datetime
from core.orchestrator.task_queue import TaskQueueManager, Task, TaskStatus
from core.orchestrator.task_models import ChatThread


# Mock Orchestrator
class MockOrchestrator:
    def __init__(self):
        pass
    
    def process_message(self, message, mode="auto"):
        return type('obj', (object,), {
            'success': True,
            'response': "Mock Response",
            'actions_taken': [],
            'tools_forged': [],
            'agents_spawned': [],
            'memories_queried': [],
            'execution_time': 0.1,
            'error': None
        })

async def test_full_persistence():
    print("Starting Full Persistence Test...")
    
    # Setup paths
    base_path = Path(__file__).parent.parent
    threads_dir = base_path / "memory" / "storage" / "threads"
    tasks_dir = base_path / "memory" / "storage" / "tasks"
    
    # Clean previous test artifacts
    test_thread_id = "test_full_persistence_thread"
    if (threads_dir / f"{test_thread_id}.json").exists():
        (threads_dir / f"{test_thread_id}.json").unlink()
    
    # 1. Initialize Manager
    orchestrator = MockOrchestrator()
    manager = TaskQueueManager(orchestrator)
    
    # 2. Set Thread Mode BEFORE Thread Exists? (UI usually creates local, then calls API)
    # UI behavior: User clicks toggle. API called.
    # But if thread doesn't exist in backend, set_thread_mode returns False.
    # So UI must create thread first? 
    # WAIT. `threads.js` createNewThread does NOT call API.
    # So thread DOES NOT EXIST on backend until first message.
    # If user clicks "Chat Only" BEFORE sending first message, 
    #   fetch(`/api/tasks/thread/{id}/mode`) -> 404 Not Found!
    
    print("Test 1: Set Mode on non-existent thread")
    success = manager.set_thread_mode(test_thread_id, "chat_only")
    if not success:
        print("✅ Correctly failed to set mode on non-existent thread")
    else:
        print("❌ Should have failed to set mode")

    # 3. Simulate First Message (Creates Thread)
    # We want to send Title too, but currently can't.
    print("Test 2: Submit First Task")
    task_id = await manager.submit_task("Hello", test_thread_id)
    print(f"Task submitted: {task_id}")
    
    # 4. Verify Thread Created with Default Title and Auto Mode
    thread = manager.get_thread(test_thread_id)
    if thread:
        print(f"✅ Thread created: {thread.title}, Mode: {thread.mode}")
        if thread.title == f"Thread {test_thread_id}":
            print("ℹ️ Title is default (Expected)")
        else:
            print(f"❓ Title is {thread.title}")
    else:
        print("❌ Thread not created")
        
    # 5. Set Mode NOW
    print("Test 3: Set Mode to Chat Only")
    manager.set_thread_mode(test_thread_id, "chat_only")
    if manager.get_thread(test_thread_id).mode == "chat_only":
        print("✅ Mode updated in memory")
    
    # 6. Simulate Restart
    print("Test 4: Restart Manager")
    manager2 = TaskQueueManager(orchestrator)
    
    # 7. Check Persistence
    loaded_thread = manager2.get_thread(test_thread_id)
    if loaded_thread:
        print(f"✅ Loaded Thread: {loaded_thread.title}, Mode: {loaded_thread.mode}")
        if loaded_thread.mode == "chat_only":
            print("✅ Mode persisted correctly")
        else:
            print(f"❌ Mode persistence failed! Got {loaded_thread.mode}")
            
        # Check Tasks
        tasks = manager2.get_thread_tasks(test_thread_id)
        print(f"Found {len(tasks)} tasks")
        if len(tasks) >= 1:
            print("✅ Tasks persisted and linked")
            print(f"Task Content: {tasks[0].prompt}")
        else:
            print("❌ Tasks missing after restart")
            
    else:
        print("❌ Thread missing after restart")

    # Cleanup
    manager2.delete_thread(test_thread_id)
    print("Cleanup done")

if __name__ == "__main__":
    asyncio.run(test_full_persistence())
