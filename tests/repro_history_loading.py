import asyncio
import os
import json
from pathlib import Path
from datetime import datetime
from orchestrator.task_queue import TaskQueueManager, Task, TaskStatus
from orchestrator.task_models import ChatThread
import sys

# Mock Orchestrator
class MockOrchestrator:
    def __init__(self):
        pass
    def process_message(self, message, mode="auto"):
        pass

def debug_print(msg):
    print(msg)
    sys.stdout.flush()

async def debug_history_loading():
    debug_print("Starting History Loading Debug...")
    
    # Setup paths
    base_path = Path(__file__).parent.parent
    threads_dir = base_path / "memory" / "storage" / "threads"
    tasks_dir = base_path / "memory" / "storage" / "tasks"
    
    debug_print(f"Threads Dir: {threads_dir}")
    debug_print(f"Tasks Dir: {tasks_dir}")

    if not tasks_dir.exists():
        debug_print("Tasks dir does not exist!")
        return

    # Manual check of files
    files = list(tasks_dir.glob("*.json"))
    debug_print(f"Found {len(files)} JSON files in tasks dir")
    for f in files[:3]:
        debug_print(f"  - {f.name}")

    # 1. Initialize Manager
    debug_print("Initializing Manager...")
    try:
        orchestrator = MockOrchestrator()
        manager = TaskQueueManager(orchestrator)
        debug_print("Manager Initialized.")
    except Exception as e:
        debug_print(f"Failed to initialize manager: {e}")
        return
    
    # 2. Check Loaded Tasks Count
    debug_print(f"Manager Loaded Tasks: {len(manager.tasks)}")
    debug_print(f"Manager Loaded Threads: {len(manager.threads)}")
    
    # 3. Check Specific Thread
    target_thread_id = "thread-1770942830115"
    thread = manager.get_thread(target_thread_id)
    
    if thread:
        debug_print(f"Found Thread: {thread.id}")
        debug_print(f"Thread Task IDs: {thread.task_ids}")
        
        # 4. Check if Tasks exist in memory
        missing_tasks = []
        found_tasks = []
        for tid in thread.task_ids:
            if tid in manager.tasks:
                found_tasks.append(tid)
            else:
                missing_tasks.append(tid)
                
        debug_print(f"Found Tasks in Memory: {len(found_tasks)}")
        debug_print(f"Missing Tasks in Memory: {len(missing_tasks)}")
        
        if missing_tasks:
            debug_print(f"First Missing Task: {missing_tasks[0]}")
            # Try to manually load it to see why it failed
            task_file = tasks_dir / f"{missing_tasks[0]}.json"
            if task_file.exists():
                debug_print(f"File exists: {task_file}")
                try:
                    with open(task_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    debug_print("JSON content loaded successfully")
                    debug_print(f"Content keys: {list(data.keys())}")
                except Exception as e:
                    debug_print(f"Failed to read/parse JSON: {e}")
            else:
                debug_print("File does NOT exist")
                
    else:
        debug_print(f"Target thread {target_thread_id} NOT found in memory")
        # List available threads
        debug_print(f"Available Threads: {list(manager.threads.keys())}")

if __name__ == "__main__":
    asyncio.run(debug_history_loading())
