"""
Misaka Cipher - Main CLI Interface
Interactive command-line interface for Misaka Cipher system
"""

import sys
from core.interfaces.cli_modules.utils import (
    console, clear_screen, print_banner, print_menu, get_user_choice,
    print_success, print_error
)
from core.interfaces.cli_modules.system_module import show_system_status
from core.interfaces.cli_modules.nexus_module import nexus_core_module
from core.interfaces.cli_modules.factory_module import factory_module
from core.interfaces.cli_modules.forge_module import forge_module
from core.interfaces.cli_modules.memory_module import memory_module

from nexus_core import NexusCore
from factory import AgentFactory
from forge import ToolForge
from utils import get_logger

logger = get_logger(__name__)


class MisakaCLI:
    """Main CLI coordinator for Misaka Cipher."""
    
    def __init__(self):
        """Initialize CLI and system components."""
        self.nexus = None
        self.factory = None
        self.forge = None
        self.running = False
    
    def initialize(self):
        """Initialize all system components."""
        try:
            console.print("[bold cyan]Initializing Misaka Cipher...[/bold cyan]")
            
            # Initialize Nexus Core
            console.print("  • Nexus Core...", end="")
            self.nexus = NexusCore()
            self.nexus.initialize()
            console.print(" [bold green]✓[/bold green]")
            
            # Initialize Factory
            console.print("  • The Factory...", end="")
            self.factory = AgentFactory(self.nexus)
            console.print(" [bold green]✓[/bold green]")
            
            # Initialize Forge
            console.print("  • The Forge...", end="")
            self.forge = ToolForge(self.nexus)
            console.print(" [bold green]✓[/bold green]")
            
            # Memory Tier initializes lazily via get_episodic_memory()
            console.print("  • The Memory Tier...", end="")
            from memory import get_episodic_memory, get_knowledge_graph
            get_episodic_memory()  # Initialize
            get_knowledge_graph()  # Initialize
            console.print(" [bold green]✓[/bold green]")
            
            console.print("\n[bold green]All systems operational[/bold green]\n")
            
            return True
            
        except Exception as e:
            console.print(f" [bold red]✗[/bold red]")
            print_error(f"Initialization failed: {str(e)}")
            logger.error(f"CLI initialization failed: {str(e)}")
            return False
    
    def show_main_menu(self):
        """Display main menu."""
        clear_screen()
        print_banner()
        
        options = [
            "Nexus Core - Direct AI Interaction",
            "Memory - Query & Search State",
            "Advanced AI Conversations - Research Lab",
            "LLM Arena - Model vs Model Battles",
            "Settings & Configuration",
            "System Status - Diagnostics"
        ]
        
        print_menu("Main Menu", options)
        return get_user_choice(len(options), "Select option")
    
    def run(self):
        """Run the main CLI loop."""
        self.running = True
        
        # Initialize systems
        if not self.initialize():
            console.print("\n[bold red]Failed to initialize. Press Enter to exit...[/bold red]")
            input()
            return
        
        input("\nPress Enter to continue...")
        
        # Main loop
        while self.running:
            choice = self.show_main_menu()
            
            if choice == 0:
                # Exit
                self.running = False
                clear_screen()
                print_success("Goodbye!")
                break
            
            elif choice == 1:
                from core.interfaces.cli_modules.nexus_module import nexus_core_module
                nexus_core_module(self.nexus)
            
            elif choice == 2:
                from core.interfaces.cli_modules.memory_module import memory_module
                memory_module()
                
            elif choice == 3:
                from core.interfaces.cli_modules.research_module import research_module
                research_module(self.nexus)
                
            elif choice == 4:
                from core.interfaces.cli_modules.arena_module import arena_module
                arena_module(self.nexus)
                
            elif choice == 5:
                from core.interfaces.cli_modules.settings_module import settings_module
                settings_module()
            
            elif choice == 6:
                from core.interfaces.cli_modules.system_module import show_system_status
                show_system_status(self.nexus, self.factory, self.forge)


def main():
    """Main entry point for CLI."""
    try:
        cli = MisakaCLI()
        cli.run()
    except KeyboardInterrupt:
        console.print("\n\n[yellow]Interrupted by user[/yellow]")
        sys.exit(0)
    except Exception as e:
        print_error(f"Fatal error: {str(e)}")
        logger.error(f"CLI fatal error: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
