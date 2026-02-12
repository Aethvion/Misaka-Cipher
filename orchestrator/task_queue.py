"""
Misaka Cipher - Task Queue Manager
Manages async task execution with worker pool
"""

import asyncio
from typing import Dict, List, Optional
from datetime import datetime
from utils import get_logger, generate_trace_id
from .task_models import Task, TaskStatus, ChatThread

logger = get_logger(__name__)


class TaskWorker:
    """
    Worker that processes tasks from the queue.
    
    Each worker runs independently and can execute tasks in parallel.
    """
    
    def __init__(self, worker_id: str, queue: asyncio.Queue, tasks: Dict[str, Task], orchestrator):
        """
        Initialize task worker.
        
        Args:
            worker_id: Unique worker identifier
            queue: Shared task queue
            tasks: Shared tasks dictionary
            orchestrator: MasterOrchestrator instance
        """
        self.worker_id = worker_id
        self.queue = queue
        self.tasks = tasks
        self.orchestrator = orchestrator
        self.running = False
        self.current_task: Optional[Task] = None
        logger.info(f"Worker {worker_id} initialized")
    
    async def run(self):
        """Main worker loop - processes tasks from queue."""
        self.running = True
        logger.info(f"Worker {self.worker_id} started")
        
        while self.running:
            try:
                # Get task from queue (blocks until available)
                task = await self.queue.get()
                self.current_task = task
                
                logger.info(f"Worker {self.worker_id} picked up task {task.id}")
                
                # Update task status
                task.status = TaskStatus.RUNNING
                task.started_at = datetime.now()
                task.worker_id = self.worker_id
                
                try:
                    # Execute task via orchestrator in executor (it's synchronous)
                    loop = asyncio.get_event_loop()
                    result = await loop.run_in_executor(
                        None,  # Use default executor
                        self.orchestrator.process_message,
                        task.prompt
                    )
                    
                    # Convert ExecutionResult to dict
                    result_dict = {
                        'success': result.success,
                        'response': result.response,
                        'actions_taken': result.actions_taken,
                        'tools_forged': result.tools_forged,
                        'agents_spawned': result.agents_spawned,
                        'memories_queried': result.memories_queried,
                        'execution_time': result.execution_time,
                        'error': result.error
                    }
                    
                    # Update task with result
                    task.status = TaskStatus.COMPLETED
                    task.result = result_dict
                    task.completed_at = datetime.now()
                    
                    logger.info(
                        f"Worker {self.worker_id} completed task {task.id} "
                        f"in {task.duration:.2f}s"
                    )
                    
                except Exception as e:
                    # Task failed
                    task.status = TaskStatus.FAILED
                    task.error = str(e)
                    task.completed_at = datetime.now()
                    
                    logger.error(
                        f"Worker {self.worker_id} failed task {task.id}: {e}"
                    )
                
                finally:
                    self.current_task = None
                    self.queue.task_done()
                    
            except asyncio.CancelledError:
                logger.info(f"Worker {self.worker_id} cancelled")
                break
            except Exception as e:
                logger.error(f"Worker {self.worker_id} error: {e}")
    
    def stop(self):
        """Stop the worker."""
        self.running = False
        logger.info(f"Worker {self.worker_id} stopping")
    
    def get_status(self) -> Dict:
        """Get worker status."""
        return {
            'worker_id': self.worker_id,
            'running': self.running,
            'current_task': self.current_task.id if self.current_task else None
        }


class TaskQueueManager:
    """
    Manages async task execution with worker pool.
    
    Enables multiple tasks to run in parallel without blocking.
    """
    
    def __init__(self, orchestrator, max_workers: int = 4):
        """
        Initialize task queue manager.
        
        Args:
            orchestrator: MasterOrchestrator instance
            max_workers: Maximum number of parallel workers
        """
        self.orchestrator = orchestrator
        self.max_workers = max_workers
        self.queue: asyncio.Queue = asyncio.Queue()
        self.tasks: Dict[str, Task] = {}
        self.threads: Dict[str, ChatThread] = {}
        self.workers: List[TaskWorker] = []
        self.running = False
        logger.info(f"Task Queue Manager initialized (max_workers: {max_workers})")
    
    async def start(self):
        """Start the worker pool."""
        if self.running:
            logger.warning("Task Queue Manager already running")
            return
        
        self.running = True
        
        # Create and start workers
        for i in range(self.max_workers):
            worker = TaskWorker(
                worker_id=f"worker-{i}",
                queue=self.queue,
                tasks=self.tasks,
                orchestrator=self.orchestrator
            )
            self.workers.append(worker)
            
            # Start worker in background
            asyncio.create_task(worker.run())
        
        logger.info(f"Task Queue Manager started with {self.max_workers} workers")
    
    async def stop(self):
        """Stop all workers."""
        self.running = False
        
        for worker in self.workers:
            worker.stop()
        
        # Wait for queue to be empty
        await self.queue.join()
        
        logger.info("Task Queue Manager stopped")
    
    async def submit_task(self, prompt: str, thread_id: str = "default") -> str:
        """
        Submit a task to the queue.
        
        Args:
            prompt: User prompt/message
            thread_id: Chat thread ID
            
        Returns:
            Task ID
        """
        # Create task
        task = Task(
            id=generate_trace_id(),
            thread_id=thread_id,
            prompt=prompt,
            status=TaskStatus.QUEUED,
            created_at=datetime.now()
        )
        
        # Store task
        self.tasks[task.id] = task
        
        # Add to thread
        if thread_id not in self.threads:
            self.threads[thread_id] = ChatThread(
                id=thread_id,
                title=f"Thread {thread_id}",
                created_at=datetime.now()
            )
        
        self.threads[thread_id].task_ids.append(task.id)
        self.threads[thread_id].updated_at = datetime.now()
        
        # Add to queue
        await self.queue.put(task)
        
        logger.info(f"Task {task.id} submitted to queue (thread: {thread_id})")
        
        return task.id
    
    def get_task(self, task_id: str) -> Optional[Task]:
        """Get task by ID."""
        return self.tasks.get(task_id)
    
    def get_thread(self, thread_id: str) -> Optional[ChatThread]:
        """Get thread by ID."""
        return self.threads.get(thread_id)
    
    def get_thread_tasks(self, thread_id: str) -> List[Task]:
        """Get all tasks for a thread."""
        thread = self.threads.get(thread_id)
        if not thread:
            return []
        
        return [self.tasks[tid] for tid in thread.task_ids if tid in self.tasks]
    
    def get_status(self) -> Dict:
        """Get queue manager status."""
        queued = sum(1 for t in self.tasks.values() if t.status == TaskStatus.QUEUED)
        running = sum(1 for t in self.tasks.values() if t.status == TaskStatus.RUNNING)
        completed = sum(1 for t in self.tasks.values() if t.status == TaskStatus.COMPLETED)
        failed = sum(1 for t in self.tasks.values() if t.status == TaskStatus.FAILED)
        
        return {
            'running': self.running,
            'workers': {
                'total': len(self.workers),
                'active': sum(1 for w in self.workers if w.current_task is not None),
                'status': [w.get_status() for w in self.workers]
            },
            'tasks': {
                'total': len(self.tasks),
                'queued': queued,
                'running': running,
                'completed': completed,
                'failed': failed
            },
            'threads': {
                'total': len(self.threads),
                'active': sum(1 for t in self.threads.values() if any(
                    self.tasks[tid].status in [TaskStatus.QUEUED, TaskStatus.RUNNING]
                    for tid in t.task_ids if tid in self.tasks
                ))
            },
            'queue_size': self.queue.qsize()
        }


# Singleton instance
_task_queue_manager = None

def get_task_queue_manager(orchestrator=None, max_workers: int = 4) -> TaskQueueManager:
    """Get the singleton TaskQueueManager instance."""
    global _task_queue_manager
    if _task_queue_manager is None:
        if orchestrator is None:
            raise ValueError("Orchestrator required for first initialization")
        _task_queue_manager = TaskQueueManager(orchestrator, max_workers)
    return _task_queue_manager
