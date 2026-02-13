import asyncio
import shutil
from pathlib import Path
from datetime import datetime
from orchestrator.task_queue import TaskQueueManager, Task, TaskStatus
from orchestrator.task_models import ChatThread

# Mock Orchestrator
class MockOrchestrator:
    def __init__(self):
        pass
    
    def process_message(self, message, mode="auto"):
        pass

async def test_task_persistence():
    print("Starting Task Persistence Test...")
    
    # Setup paths
    base_path = Path(__file__).parent.parent
    threads_dir = base_path / "memory" / "storage" / "threads"
    tasks_dir = base_path / "memory" / "storage" / "tasks"
    
    # 1. Initialize Manager
    orchestrator = MockOrchestrator()
    manager = TaskQueueManager(orchestrator)
    
    # 2. Create Thread and Submit Task
    thread_id = "test_thread_tasks"
    task_id = await manager.submit_task("Hello Task Persistence", thread_id)
    
    print(f"Task submitted: {task_id} (Thread: {thread_id})")
    
    # 3. Verify Task File Exists (Queued status)
    task_file = tasks_dir / f"{task_id}.json"
    if task_file.exists():
        print("✅ Task file created on disk")
    else:
        print("❌ Task file NOT found on disk")
        return

    # 4. Simulate Task Completion (Manually update and save since worker runs in background)
    # in real usage, worker calls save_callback. Here we simulate it.
    task = manager.get_task(task_id)
    task.status = TaskStatus.COMPLETED
    task.result = {"response": "I persisted!"}
    task.completed_at = datetime.now()
    manager._save_task(task)
    print("Task updated to COMPLETED and saved")

    # 5. Simulate Restart
    print("Simulating restart...")
    # Create new manager instance to force reload
    manager2 = TaskQueueManager(orchestrator)
    
    if task_id in manager2.tasks:
        loaded_task = manager2.tasks[task_id]
        print(f"✅ Task loaded after restart: {loaded_task.id}")
        
        if loaded_task.status == TaskStatus.COMPLETED:
            print("✅ Task status persisted correctly")
        else:
            print(f"❌ Task status mismatch: {loaded_task.status}")
            
        if loaded_task.result and loaded_task.result.get("response") == "I persisted!":
            print("✅ Task result persisted correctly")
        else:
            print("❌ Task result mismatch")
            
        # Check thread linkage
        thread = manager2.get_thread(thread_id)
        if thread and task_id in thread.task_ids:
            print("✅ Thread->Task linkage persisted")
        else:
            print("❌ Thread->Task linkage broken")
            
    else:
        print("❌ Task NOT loaded after restart")
        return

    # 6. Delete Thread (Should delete tasks too)
    manager2.delete_thread(thread_id)
    print("Thread deleted")
    
    if not task_file.exists():
        print("✅ Task file deleted from disk")
    else:
        print(f"❌ Task file still exists: {task_file}")
        
    print("Test Complete")

if __name__ == "__main__":
    asyncio.run(test_task_persistence())
