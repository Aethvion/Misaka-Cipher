import asyncio
import json
import traceback
from datetime import datetime

# Import project modules
try:
    from core.orchestrator.task_queue import TaskQueueManager, Task
    from core.orchestrator.task_models import ChatThread
except ImportError:
    print("Error importing project modules. Adjust PYTHONPATH.")
    traceback.print_exc()
    exit(1)

# Mock Orchestrator
class MockOrchestrator:
    def __init__(self):
        pass
    def process_message(self, message, mode="auto"):
        pass

async def simulate_api_response():
    print("Starting Internal API Response Simulation...")
    
    # 1. Initialize Manager (Loads real data from disk)
    orchestrator = MockOrchestrator()
    manager = TaskQueueManager(orchestrator)
    
    print(f"Loaded Threads: {len(manager.threads)}")
    print(f"Loaded Tasks: {len(manager.tasks)}")
    
    # 2. Find a thread with tasks
    target_thread = None
    for t in manager.threads.values():
        if len(t.task_ids) > 0:
            target_thread = t
            break
            
    if not target_thread:
        print("No threads with tasks found.")
        return

    print(f"Target Thread: {target_thread.id} ({len(target_thread.task_ids)} tasks)")
    
    # 3. Simulate get_thread_tasks logic (from task_routes.py)
    try:
        thread = manager.get_thread(target_thread.id)
        if not thread:
            print("Thread not found via get_thread")
            return
            
        tasks = manager.get_thread_tasks(target_thread.id)
        print(f"Retrieved {len(tasks)} task objects for thread")
        
        # 4. Serialize (Simulate JSON response)
        response_data = {
            'thread': thread.to_dict(),
            'tasks': [task.to_dict() for task in tasks]
        }
        
        # Print JSON structure to check for serialization errors
        json_output = json.dumps(response_data, indent=2)
        print("\n--- JSON RESPONSE PREVIEW ---")
        print(json_output[:1000]) # First 1000 chars
        print("-----------------------------")
        
        if len(tasks) > 0:
            print("\nFirst Task content:")
            print(f"ID: {tasks[0].id}")
            print(f"Prompt: {tasks[0].prompt}")
            print(f"Result: {tasks[0].result}")
            
    except Exception as e:
        print(f"Error simulating API response: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(simulate_api_response())
