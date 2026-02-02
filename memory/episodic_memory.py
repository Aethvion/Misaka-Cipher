"""
Misaka Cipher - Episodic Memory
Vector-based semantic memory storage using ChromaDB
"""

import yaml
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from sentence_transformers import SentenceTransformer

from .memory_spec import EpisodicMemory, generate_memory_id
from utils import get_logger

logger = get_logger(__name__)


class EpisodicMemoryStore:
    """
    Episodic Memory Store - Vector-based semantic search.
    
    Uses ChromaDB for persistent vector storage with semantic search capabilities.
    Enables agents to query recent interactions by semantic similarity.
    """
    
    def __init__(self, config_path: Optional[Path] = None):
        """
        Initialize Episodic Memory Store.
        
        Args:
            config_path: Path to memory.yaml
        """
        # Load configuration
        if config_path is None:
            workspace = Path(__file__).parent.parent
            config_path = workspace / "config" / "memory.yaml"
        
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        
        self.config = config.get('episodic_memory', {})
        self.enabled = self.config.get('enabled', True)
        
        if not self.enabled:
            logger.info("Episodic Memory is disabled")
            return
        
        # Lazy imports (ChromaDB)
        import chromadb
        from chromadb.config import Settings
        
        # Storage paths
        workspace = Path(__file__).parent.parent
        storage_path = workspace / self.config.get('storage_path', 'memory/storage')
        storage_path.mkdir(parents=True, exist_ok=True)
        
        # Initialize ChromaDB client
        self.client = chromadb.PersistentClient(
            path=str(storage_path),
            settings=Settings(anonymized_telemetry=False)
        )
        
        # Get or create collection
        collection_name = self.config.get('collection_name', 'misaka_episodic')
        try:
            self.collection = self.client.get_collection(name=collection_name)
            logger.info(f"Loaded existing ChromaDB collection: {collection_name}")
        except:
            self.collection = self.client.create_collection(
                name=collection_name,
                metadata={"description": "Misaka Cipher Episodic Memory"}
            )
            logger.info(f"Created new ChromaDB collection: {collection_name}")
        
        # Initialize embedding model
        model_name = self.config.get('embedding_model', 'all-MiniLM-L6-v2')
        logger.info(f"Loading embedding model: {model_name}...")
        self.embedding_model = SentenceTransformer(model_name)
        logger.info(f"Embedding model loaded (dim: {self.embedding_model.get_sentence_embedding_dimension()})")
        
        # Configuration
        self.max_memories = self.config.get('max_memories', 10000)
        self.retention_days = self.config.get('retention_days', 30)
        
        logger.info(
            f"Episodic Memory Store initialized "
            f"(max_memories: {self.max_memories},  retention: {self.retention_days}d)"
        )
    
    def store(self, memory: EpisodicMemory) -> bool:
        """
        Store an episodic memory.
        
        Args:
            memory: EpisodicMemory object
            
        Returns:
            True if stored successfully
        """
        if not self.enabled:
            return False
        
        try:
            # Generate embedding
            text = f"{memory.summary} {memory.content}"
            embedding = self.embedding_model.encode(text).tolist()
            
            # Store in ChromaDB
            self.collection.add(
                ids=[memory.memory_id],
                embeddings=[embedding],
                documents=[memory.summary],  # Store summary as document
                metadatas=[{
                    'trace_id': memory.trace_id,
                    'timestamp': memory.timestamp,
                    'event_type': memory.event_type,
                    'domain': memory.domain,
                    'content': memory.content,
                    **memory.metadata
                }]
            )
            
            logger.info(f"Stored memory: {memory.memory_id} (event: {memory.event_type}, domain: {memory.domain})")
            
            # Check if we need to prune old memories
            self._check_and_prune()
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to store memory {memory.memory_id}: {str(e)}")
            return False
    
    def search(self, query: str, k: int = 5, domain: Optional[str] = None) -> List[EpisodicMemory]:
        """
        Search for memories by semantic similarity.
        
        Args:
            query: Search query
            k: Number of results to return
            domain: Optional domain filter
            
        Returns:
            List of matching memories
        """
        if not self.enabled:
            return []
        
        try:
            # Generate query embedding
            query_embedding = self.embedding_model.encode(query).tolist()
            
            # Prepare where clause for filtering
            where = {}
            if domain:
                where['domain'] = domain
            
            # Search
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=k,
                where=where if where else None
            )
            
            # Convert to EpisodicMemory objects
            memories = []
            for i in range(len(results['ids'][0])):
                metadata = results['metadatas'][0][i]
                memory = EpisodicMemory(
                    memory_id=results['ids'][0][i],
                    trace_id=metadata.get('trace_id'),
                    timestamp=metadata.get('timestamp'),
                    event_type=metadata.get('event_type'),
                    domain=metadata.get('domain'),
                    summary=results['documents'][0][i],
                    content=metadata.get('content', ''),
                    metadata={k: v for k, v in metadata.items() 
                             if k not in ['trace_id', 'timestamp', 'event_type', 'domain', 'content']}
                )
                memories.append(memory)
            
            logger.debug(f"Search query: '{query}' returned {len(memories)} results")
            
            return memories
            
        except Exception as e:
            logger.error(f"Memory search failed: {str(e)}")
            return []
    
    def get_recent(self, hours: int = 24, domain: Optional[str] = None) -> List[EpisodicMemory]:
        """
        Get recent memories within time window.
        
        Args:
            hours: Time window in hours
            domain: Optional domain filter
            
        Returns:
            List of recent memories
        """
        if not self.enabled:
            return []
        
        try:
            cutoff_time = (datetime.now() - timedelta(hours=hours)).isoformat()
            
            where = {}
            if domain:
                where['domain'] = domain
            
            # ChromaDB doesn't support timestamp filtering directly in where clause
            # So we get all and filter in Python
            results = self.collection.get(
                where=where if where else None,
                limit=self.max_memories
            )
            
            # Filter by timestamp and convert to memories
            memories = []
            for i in range(len(results['ids'])):
                metadata = results['metadatas'][i]
                timestamp = metadata.get('timestamp', '')
                
                if timestamp >= cutoff_time:
                    memory = EpisodicMemory(
                        memory_id=results['ids'][i],
                        trace_id=metadata.get('trace_id'),
                        timestamp=timestamp,
                        event_type=metadata.get('event_type'),
                        domain=metadata.get('domain'),
                        summary=results['documents'][i],
                        content=metadata.get('content', ''),
                        metadata={k: v for k, v in metadata.items() 
                                 if k not in ['trace_id', 'timestamp', 'event_type', 'domain', 'content']}
                    )
                    memories.append(memory)
            
            logger.debug(f"Retrieved {len(memories)} memories from last {hours}h")
            
            return sorted(memories, key=lambda m: m.timestamp, reverse=True)
            
        except Exception as e:
            logger.error(f"Failed to get recent memories: {str(e)}")
            return []
    
    def get_by_trace_id(self, trace_id: str) -> List[EpisodicMemory]:
        """
        Get memories linked to a specific Trace_ID.
        
        Args:
            trace_id: Trace ID to search for
            
        Returns:
            List of memories with this Trace_ID
        """
        if not self.enabled:
            return []
        
        try:
            results = self.collection.get(
                where={'trace_id': trace_id}
            )
            
            memories = []
            for i in range(len(results['ids'])):
                metadata = results['metadatas'][i]
                memory = EpisodicMemory(
                    memory_id=results['ids'][i],
                    trace_id=metadata.get('trace_id'),
                    timestamp=metadata.get('timestamp'),
                    event_type=metadata.get('event_type'),
                    domain=metadata.get('domain'),
                    summary=results['documents'][i],
                    content=metadata.get('content', ''),
                    metadata={k: v for k, v in metadata.items() 
                             if k not in ['trace_id', 'timestamp', 'event_type', 'domain', 'content']}
                )
                memories.append(memory)
            
            logger.debug(f"Retrieved {len(memories)} memories for Trace_ID: {trace_id}")
            
            return memories
            
        except Exception as e:
            logger.error(f"Failed to get memories by trace_id: {str(e)}")
            return []
    
    def get_count(self) -> int:
        """Get total number of stored memories."""
        if not self.enabled:
            return 0
        
        try:
            return self.collection.count()
        except:
            return 0
    
    def _check_and_prune(self):
        """Check if memory limit is exceeded and prune oldest memories."""
        try:
            count = self.get_count()
            
            if count > self.max_memories:
                # Prune oldest 10%
                to_remove = int(count * 0.1)
                logger.warning(f"Memory limit exceeded ({count}/{self.max_memories}), pruning {to_remove} oldest memories")
                
                # Get all memories sorted by timestamp
                all_results = self.collection.get()
                memory_ids_with_time = [
                    (all_results['ids'][i], all_results['metadatas'][i].get('timestamp', ''))
                    for i in range(len(all_results['ids']))
                ]
                
                # Sort by timestamp and get oldest
                memory_ids_with_time.sort(key=lambda x: x[1])
                ids_to_remove = [mid for mid, _ in memory_ids_with_time[:to_removed]]
                
                # Delete
                self.collection.delete(ids=ids_to_remove)
                logger.info(f"Pruned {len(ids_to_remove)} old memories")
                
        except Exception as e:
            logger.error(f"Memory pruning failed: {str(e)}")


# Global instance
_episodic_memory = None


def get_episodic_memory(config_path: Optional[Path] = None) -> EpisodicMemoryStore:
    """Get the global episodic memory store."""
    global _episodic_memory
    if _episodic_memory is None:
        _episodic_memory = EpisodicMemoryStore(config_path)
    return _episodic_memory
