import json
from pathlib import Path
from datetime import datetime
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List

# --- COPIED FROM task_models.py to avoid imports ---
class TaskStatus(Enum):
    """Task execution status."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class Task:
    id: str
    thread_id: str  # Chat thread ID
    prompt: str
    status: TaskStatus = TaskStatus.QUEUED
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    worker_id: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'thread_id': self.thread_id,
            'prompt': self.prompt,
            'status': self.status.value,
            'created_at': self.created_at.isoformat(),
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'worker_id': self.worker_id,
            'result': self.result,
            'error': self.error,
            'metadata': self.metadata
        }
# ---------------------------------------------------

def debug_load_logic():
    print("Starting Isolated Load Logic Debug...")
    
    # Setup paths
    base_path = Path(__file__).parent.parent
    tasks_dir = base_path / "memory" / "storage" / "tasks"
    
    print(f"Tasks Dir: {tasks_dir}")

    count = 0
    # Manual check of files
    try:
        files = list(tasks_dir.glob("*.json"))
        print(f"Found {len(files)} JSON files")
        
        for file_path in files:
            print(f"Attempting to load: {file_path.name}")
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                print("  JSON loaded.")
                
                # Logic from task_queue.py _load_tasks
                task = Task(
                    id=data['id'],
                    thread_id=data['thread_id'],
                    prompt=data['prompt'],
                    status=TaskStatus(data['status']),
                    created_at=datetime.fromisoformat(data['created_at']),
                    started_at=datetime.fromisoformat(data['started_at']) if data.get('started_at') else None,
                    completed_at=datetime.fromisoformat(data['completed_at']) if data.get('completed_at') else None,
                    error=data.get('error'),
                    result=data.get('result'),
                    metadata=data.get('metadata', {}),
                    worker_id=data.get('worker_id')
                )
                
                print(f"  ✅ Task object created successfully: {task.id}")
                count += 1
                    
            except Exception as e:
                print(f"  ❌ Failed to load/parse: {e}")
                # Print specific field that might fail
                if 'data' in locals():
                    if 'created_at' in data:
                        print(f"     created_at: {data['created_at']}")
                    if 'status' in data:
                        print(f"     status: {data['status']}")
                        
        print(f"Total successful loads: {count}")
        
    except Exception as e:
        print(f"Global error: {e}")

if __name__ == "__main__":
    debug_load_logic()
