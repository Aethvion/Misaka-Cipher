"""
Misaka Cipher - Memory Module
Memory Tier query interface
"""

from cli.utils import (
    console, clear_screen, print_header, print_menu, get_user_choice,
    get_text_input, print_table, print_key_value, pause, print_info,
    print_warning, confirm
)
from memory import get_episodic_memory, get_knowledge_graph
from rich.panel import Panel
from rich.tree import Tree


def memory_module():
    """Interactive Memory Tier query interface."""
    
    memory_store = get_episodic_memory()
    kg = get_knowledge_graph()
    
    while True:
        clear_screen()
        print_header("The Memory Tier", "Knowledge & Context Management")
        
        options = [
            "Semantic Search (Episodic Memory)",
            "Browse Knowledge Graph",
            "Trace_ID Lookup",
            "Memory Statistics"
        ]
        
        print_menu("Memory Operations", options)
        choice = get_user_choice(len(options))
        
        if choice == 0:
            break
        
        if choice == 1:
            # Semantic search
            _semantic_search(memory_store)
        
        elif choice == 2:
            # Knowledge graph browser
            _browse_knowledge_graph(kg)
        
        elif choice == 3:
            # Trace ID lookup
            _trace_lookup(memory_store, kg)
        
        elif choice == 4:
            # Stats
            _memory_stats(memory_store, kg)


def _semantic_search(memory_store):
    """Semantic search interface."""
    clear_screen()
    print_header("Semantic Search", "Query Episodic Memory")
    
    query = get_text_input("\nSearch Query")
    
    if not query.strip():
        return
    
    # Optional domain filter
    console.print()
    use_domain = confirm("Filter by domain?", default=False)
    domain = None
    
    if use_domain:
        domain = get_text_input("Domain (Finance, Data, Security, etc.)")
    
    # Search
    results = memory_store.search(query, k=10, domain=domain if domain else None)
    
    console.print("\n" + "═" * 50 + "\n")
    
    if results:
        print_info(f"Found {len(results)} results:")
        console.print()
        
        for i, memory in enumerate(results, 1):
            console.print(f"[bold yellow]{i}. {memory.summary}[/bold yellow]")
            print_key_value("  Event Type", memory.event_type)
            print_key_value("  Domain", memory.domain)
            print_key_value("  Timestamp", memory.timestamp)
            print_key_value("  Trace ID", memory.trace_id)
            console.print()
    else:
        print_warning("No results found")
    
    pause()


def _browse_knowledge_graph(kg):
    """Knowledge graph browser."""
    
    while True:
        clear_screen()
        print_header("Knowledge Graph", "Browse Domains, Tools, and Agents")
        
        options = [
            "List All Domains",
            "List Tools by Domain",
            "List Agents by Domain",
            "View Graph Statistics"
        ]
        
        print_menu("Knowledge Graph", options)
        choice = get_user_choice(len(options))
        
        if choice == 0:
            break
        
        if choice == 1:
            # List domains
            domains = kg.get_domains()
            console.print("\n[bold cyan]Domains:[/bold cyan]\n")
            for domain in domains:
                console.print(f"  • {domain}")
            pause()
        
        elif choice == 2:
            # List tools by domain
            domain = get_text_input("\nDomain name")
            if domain:
                tools = kg.get_tools_by_domain(domain)
                console.print(f"\n[bold cyan]{domain} Tools:[/bold cyan]\n")
                if tools:
                    for tool in tools:
                        console.print(f"  • {tool}")
                else:
                    print_warning(f"No tools found in {domain}")
                pause()
        
        elif choice == 3:
            # List agents by domain
            domain = get_text_input("\nDomain name")
            if domain:
                agents = kg.get_agents_by_domain(domain)
                console.print(f"\n[bold cyan]{domain} Agents:[/bold cyan]\n")
                if agents:
                    for agent in agents:
                        console.print(f"  • {agent}")
                else:
                    print_warning(f"No agents found in {domain}")
                pause()
        
        elif choice == 4:
            # Graph stats
            stats = kg.get_stats()
            console.print("\n[bold cyan]Knowledge Graph Statistics:[/bold cyan]\n")
            print_key_value("Total Nodes", stats['total_nodes'])
            print_key_value("Total Edges", stats['total_edges'])
            print_key_value("Domains", stats['domains'])
            
            console.print("\n[bold yellow]Node Types:[/bold yellow]")
            for node_type, count in stats['node_types'].items():
                console.print(f"  • {node_type}: {count}")
            
            pause()


def _trace_lookup(memory_store, kg):
    """Trace ID lookup interface."""
    clear_screen()
    print_header("Trace_ID Lookup", "Audit Trail Explorer")
    
    trace_id = get_text_input("\nTrace_ID")
    
    if not trace_id.strip():
        return
    
    # Get memories
    memories = memory_store.get_by_trace_id(trace_id)
    
    console.print("\n" + "═" * 50 + "\n")
    
    if memories:
        print_info(f"Found {len(memories)} memory/memories for {trace_id}:")
        console.print()
        
        for memory in memories:
            panel = Panel(
                f"[bold]Summary:[/bold] {memory.summary}\n"
                f"[bold]Event Type:[/bold] {memory.event_type}\n"
                f"[bold]Domain:[/bold] {memory.domain}\n"
                f"[bold]Timestamp:[/bold] {memory.timestamp}\n\n"
                f"[bold]Content:[/bold]\n{memory.content}",
                title=f"Memory: {memory.memory_id}",
                border_style="cyan"
            )
            console.print(panel)
            console.print()
    else:
        print_warning(f"No memories found for Trace_ID: {trace_id}")
    
    # Check knowledge graph
    node_info = kg.get_node_info(trace_id)
    if node_info:
        console.print("[bold cyan]Knowledge Graph Entry:[/bold cyan]\n")
        for key, value in node_info.items():
            print_key_value(key, value)
    
    pause()


def _memory_stats(memory_store, kg):
    """Display memory statistics."""
    clear_screen()
    print_header("Memory Statistics", "Overview of Stored Knowledge")
    
    memory_count = memory_store.get_count()
    stats = kg.get_stats()
    
    console.print()
    print_key_value("Episodic Memories", memory_count)
    print_key_value("Knowledge Graph Nodes", stats['total_nodes'])
    print_key_value("Knowledge Graph Edges", stats['total_edges'])
    print_key_value("Active Domains", stats['domains'])
    
    console.print("\n[bold yellow]Node Type Distribution:[/bold yellow]")
    for node_type, count in stats['node_types'].items():
        console.print(f"  • {node_type}: {count}")
    
    pause()
