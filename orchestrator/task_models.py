"""
Misaka Cipher - Task Queue Models
Data models for async task management
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum


class TaskStatus(Enum):
    """Task execution status."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Task:
    """
    Represents a task in the queue.
    
    A task is a user request that will be executed by a worker.
    Multiple tasks can run in parallel.
    """
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
        """Convert to dictionary for JSON serialization."""
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
    
    @property
    def duration(self) -> Optional[float]:
        """Get task duration in seconds."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None


@dataclass
class ChatThread:
    """
    Represents a conversation thread.
    
    Each thread can have multiple tasks running independently.
    """
    id: str
    title: str
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    task_ids: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    mode: str = "auto"  # "auto" or "chat_only"
    settings: Dict[str, Any] = field(default_factory=lambda: {"context_mode": "none", "context_window": 5})
    is_deleted: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'title': self.title,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'task_ids': self.task_ids,
            'metadata': self.metadata,
            'mode': self.mode,
            'settings': self.settings,
            'is_deleted': self.is_deleted
        }


@dataclass
class Message:
    """
    Represents a message in a chat thread.
    """
    id: str
    thread_id: str
    role: str  # 'user', 'assistant', 'system'
    content: str
    task_id: Optional[str] = None  # Link to task if message triggered one
    created_at: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'thread_id': self.thread_id,
            'role': self.role,
            'content': self.content,
            'task_id': self.task_id,
            'created_at': self.created_at.isoformat(),
            'metadata': self.metadata
        }
