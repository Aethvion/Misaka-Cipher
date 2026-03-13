
import sys
import os
import asyncio
import json
from pathlib import Path

# Add project root to path
sys.path.append(os.getcwd())

from core.orchestrator.task_queue import TaskQueueManager, get_task_queue_manager
from core.orchestrator.task_models import ChatThread, Task

# Mock orchestrator for init
class MockOrchestrator:
    def process_message(self, *args, **kwargs):
        return "Mock response"

async def test_thread_flow():
    print("Initializing TaskQueueManager...")
    # Initialize directly to avoid singleton issues if possible, or use get_
    # But get_task_queue_manager might not be initialized with orchestrator if running standalone
    
    tqm = TaskQueueManager(orchestrator=MockOrchestrator())
    
    # 1. Create Thread
    # Use simple ID
    import time
    thread_id = f"debug-thread-{int(time.time())}"
    print(f"Creating thread: {thread_id}")
    
    success = tqm.create_thread(thread_id, "Debug Thread")
    if not success:
        print("Failed to create thread")
        return
        
    # Check file
    thread_file = tqm.threads_dir / f"{thread_id}.json"
    if not thread_file.exists():
        print(f"Thread file not created: {thread_file}")
        return
    print(f"Thread file created: {thread_file}")
    
    # 2. Submit Task
    print("Submitting task...")
    task_id = await tqm.submit_task("Hello World", thread_id)
    print(f"Task submitted: {task_id}")
    
    # 3. Check if Task is in Thread.task_ids (in memory)
    thread = tqm.get_thread(thread_id)
    if task_id not in thread.task_ids:
        print(f"Task ID {task_id} NOT found in thread.task_ids (memory)")
    else:
        print(f"Task ID {task_id} found in thread.task_ids (memory)")
        
    # 4. Check if Task is in Thread JSON (disk)
    print("Checking disk content...")
    with open(thread_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    saved_task_ids = data.get('task_ids', [])
    print(f"Saved task_ids: {saved_task_ids}")
    
    if task_id in saved_task_ids:
        print("SUCCESS: Task ID persisted to thread JSON")
    else:
        print("FAILURE: Task ID NOT persisted to thread JSON")
    
    # Clean up
    tqm.delete_thread(thread_id)

if __name__ == "__main__":
    asyncio.run(test_thread_flow())
