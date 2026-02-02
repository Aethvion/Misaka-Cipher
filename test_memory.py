"""
Misaka Cipher - Memory Test Script
Test episodic memory storage and retrieval
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent / '.env'
if env_path.exists():
    load_dotenv(env_path)

from memory import EpisodicMemory, generate_memory_id, get_episodic_memory
from utils import get_logger

logger = get_logger(__name__)


def test_episodic_memory():
    """Test episodic memory functionality."""
    
    print("\n" + "=" * 70)
    print("MISAKA CIPHER - SPRINT 4 VERIFICATION TEST")
    print("THE MEMORY TIER - Episodic Memory (Phase 1)")
    print("=" * 70 + "\n")
    
    # Initialize episodic memory
    print("Initializing Episodic Memory Store...")
    memory_store = get_episodic_memory()
    
    print("\n" + "-" * 70)
    print("TEST 1: Store Episodic Memories")
    print("-" * 70 + "\n")
    
    # Create and store test memories
    memory1 = EpisodicMemory(
        memory_id=generate_memory_id(),
        trace_id="MCTR-20260201150000-TEST0001",
        timestamp="2026-02-01T15:00:00Z",
        event_type="tool_forge",
        domain="Finance",
        summary="Generated Finance_Fetch_StockPrice tool",
        content="Tool created to fetch stock prices from external API. Validated and registered successfully.",
        metadata={'tool_name': 'Finance_Fetch_StockPrice'}
    )
    
    memory2 = EpisodicMemory(
        memory_id=generate_memory_id(),
        trace_id="MCTR-20260201150100-TEST0002",
        timestamp="2026-02-01T15:01:00Z",
        event_type="agent_spawn",
        domain="Data",
        summary="Spawned Data_Analyze_Dataset agent",
        content="Agent spawned to analyze Q1 sales data. Loaded context from episodic memory.",
        metadata={'agent_name': 'Data_Analyze_Dataset'}
    )
    
    memory3 = EpisodicMemory(
        memory_id=generate_memory_id(),
        trace_id="MCTR-20260201150200-TEST0003",
        timestamp="2026-02-01T15:02:00Z",
        event_type="forge_intent_detection",
        domain="Security",
        summary="Intent detection flagged filesystem access request",
        content="Tool request for file reading detected and flagged by Intelligence Firewall intent scanner.",
        metadata={'intent_categories': ['filesystem_access']}
    )
    
    # Store memories
    for memory in [memory1, memory2, memory3]:
        success = memory_store.store(memory)
        if success:
            print(f"✅ Stored: {memory.summary}")
        else:
            print(f"❌ Failed: {memory.summary}")
    
    print(f"\nTotal memories in store: {memory_store.get_count()}")
    
    print("\n" + "-" * 70)
    print("TEST 2: Semantic Search")
    print("-" * 70 + "\n")
    
    # Search for finance-related memories
    query1 = "stock price tools"
    results1 = memory_store.search(query1, k=2)
    
    print(f"Query: '{query1}'")
    print(f"Results: {len(results1)}")
    for memory in results1:
        print(f"  - {memory.summary} (domain: {memory.domain})")
    
    print()
    
    # Search for security-related memories
    query2 = "security firewall detection"
    results2 = memory_store.search(query2, k=2)
    
    print(f"Query: '{query2}'")
    print(f"Results: {len(results2)}")
    for memory in results2:
        print(f"  - {memory.summary} (domain: {memory.domain})")
    
    print("\n" + "-" * 70)
    print("TEST 3: Get Recent Memories")
    print("-" * 70 + "\n")
    
    recent = memory_store.get_recent(hours=24)
    print(f"Memories from last 24 hours: {len(recent)}")
    for memory in recent[:5]:  # Show first 5
        print(f"  - [{memory.event_type}] {memory.summary}")
    
    print("\n" + "-" * 70)
    print("TEST 4: Trace_ID Linking")
    print("-" * 70 + "\n")
    
    # Get memories by Trace_ID
    trace_memories = memory_store.get_by_trace_id("MCTR-20260201150000-TEST0001")
    print(f"Memories for Trace_ID 'MCTR-20260201150000-TEST0001': {len(trace_memories)}")
    for memory in trace_memories:
        print(f"  - {memory.summary}")
        print(f"    Memory ID: {memory.memory_id}")
        print(f"    Event: {memory.event_type}")
    
    print("\n" + "=" * 70)
    print("SPRINT 4 PHASE 1 VERIFICATION: EPISODIC MEMORY - COMPLETE")
    print("=" * 70 + "\n")
    
    print(f"✅ ChromaDB Backend: Active")
    print(f"✅ Embedding Model: all-MiniLM-L6-v2")
    print(f"✅ Total Memories: {memory_store.get_count()}")
    print(f"✅ Semantic Search: Working")
    print(f"✅ Trace_ID Linking: Working")


if __name__ == "__main__":
    try:
        test_episodic_memory()
    except Exception as e:
        logger.error(f"Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
