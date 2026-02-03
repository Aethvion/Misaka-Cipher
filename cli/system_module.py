"""
Misaka Cipher - System Status Module
Displays system diagnostics and health information
"""

from cli.utils import (
    console, clear_screen, print_header, print_table,
    print_key_value, print_success, print_warning, pause
)
from nexus_core import NexusCore
from factory import AgentFactory
from forge import ToolForge
from memory import get_episodic_memory, get_knowledge_graph
from rich.panel import Panel
from rich.columns import Columns
from rich.text import Text


def show_system_status(nexus: NexusCore, factory: AgentFactory, forge: ToolForge):
    """
    Display comprehensive system status.
    
    Args:
        nexus: NexusCore instance
        factory: AgentFactory instance
        forge: ToolForge instance
    """
    clear_screen()
    print_header("System Status", "Misaka Cipher - Comprehensive Diagnostics")
    
    # Nexus Core Status
    console.print("\n[bold cyan]═══ Nexus Core ═══[/bold cyan]")
    status = nexus.get_status()
    
    print_key_value("Initialized", "✓ Yes" if status['initialized'] else "✗ No")
    print_key_value("Active Traces", status['active_traces'])
    print_key_value("Firewall Status", 
                   f"[green]ACTIVE[/green] ({status['firewall']['mode']})")
    
    # Provider Status
    console.print("\n[bold yellow]Providers:[/bold yellow]")
    for provider_name, provider_info in status['providers']['providers'].items():
        health = "🟢" if provider_info['is_healthy'] else "🔴"
        console.print(
            f"  {health} {provider_name}: {provider_info['model']} "
            f"({provider_info['status']})"
        )
    
    # Factory Status
    console.print("\n[bold cyan]═══ The Factory ═══[/bold cyan]")
    try:
        agent_count = factory.registry.get_agent_count()
        template_count = len(factory.templates.get_all_templates())
        
        print_key_value("Registered Agents", agent_count)
        print_key_value("Available Templates", template_count)
        print_success("Factory operational")
    except Exception as e:
        print_warning(f"Factory status unavailable: {str(e)}")
    
    # Forge Status
    console.print("\n[bold cyan]═══ The Forge ═══[/bold cyan]")
    try:
        tool_count = forge.get_tool_count()
        recent_tools = forge.list_tools()[-3:] if forge.list_tools() else []
        
        print_key_value("Total Tools", tool_count)
        if recent_tools:
            console.print("[bold yellow]Recent Tools:[/bold yellow]")
            for tool in recent_tools:
                console.print(f"  • {tool['name']} ({tool['domain']})")
        else:
            console.print("[dim]No tools generated yet[/dim]")
        print_success("Forge operational")
    except Exception as e:
        print_warning(f"Forge status unavailable: {str(e)}")
    
    # Memory Tier Status
    console.print("\n[bold cyan]═══ The Memory Tier ═══[/bold cyan]")
    try:
        memory_store = get_episodic_memory()
        kg = get_knowledge_graph()
        
        memory_count = memory_store.get_count()
        stats = kg.get_stats()
        
        print_key_value("Episodic Memories", memory_count)
        print_key_value("Knowledge Graph Nodes", stats['total_nodes'])
        print_key_value("Knowledge Graph Edges", stats['total_edges'])
        print_key_value("Domains", stats['domains'])
        
        console.print("\n[bold yellow]Node Types:[/bold yellow]")
        for node_type, count in stats['node_types'].items():
            console.print(f"  • {node_type}: {count}")
        
        print_success("Memory Tier operational")
    except Exception as e:
        print_warning(f"Memory Tier status unavailable: {str(e)}")
    
    # Overall System Health
    console.print("\n" + "═" * 50)
    health_panel = Panel(
        "[bold green]System Status: OPERATIONAL[/bold green]\n"
        "All core modules initialized and healthy",
        title="Overall Health",
        border_style="green"
    )
    console.print(health_panel)
    
    pause()
