"""
Misaka Cipher - Settings Module
CLI module for managing providers and configuring the Model Registry
"""

from cli_modules.utils import (
    console, clear_screen, print_header, print_menu, get_user_choice,
    print_success, print_error, confirm, print_key_value
)
import json
from pathlib import Path

# Load settings from file directly
SETTINGS_FILE = Path("c:/Aethvion/Misaka-Cipher/config/model_registry.json")

def load_settings():
    if not SETTINGS_FILE.exists():
        return {}
    try:
        with open(SETTINGS_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        print_error(f"Failed to load settings: {e}")
        return {}

def save_settings(data):
    try:
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(data, f, indent=4)
        return True
    except Exception as e:
        print_error(f"Failed to save settings: {e}")
        return False

def show_providers_menu():
    """Display providers menu loop."""
    while True:
        clear_screen()
        print_header("Provider Settings", "Manage active API Providers")
        
        settings = load_settings()
        providers = settings.get("providers", {})
        
        if not providers:
            print_error("No providers found in model_registry.json")
            input("\nPress Enter to return...")
            return
            
        options = []
        prov_list = []
        
        # Display each provider
        for i, (key, data) in enumerate(providers.items(), 1):
            if key in ['default', 'fallback_order']:
                continue
            
            status = "[green]Enabled[/green]" if data.get('active') else "[dim]Disabled[/dim]"
            display = f"{key} - {status}"
            options.append(display)
            prov_list.append(key)
            
        print_menu("Available Providers", options)
        choice = get_user_choice(len(options), "Select a provider to toggle, or 0 to back")
        
        if choice == 0:
            break
            
        selected_prov = prov_list[choice - 1]
        prov_data = providers[selected_prov]
        
        # Toggle active state
        current_state = prov_data.get('active', False)
        new_state = not current_state
        prov_data['active'] = new_state
        
        if save_settings(settings):
            action = "Enabled" if new_state else "Disabled"
            print_success(f"{action} {selected_prov}")
            if confirm("Continue?", default=True):
                continue
            else:
                break

def settings_module():
    """Main entry point for Settings CLI module."""
    while True:
        clear_screen()
        print_header("Settings & Configuration", "System Preferences")
        
        options = [
            "Manage Providers",
            "View Raw Settings (Read-Only)"
        ]
        
        print_menu("Settings Menu", options)
        choice = get_user_choice(len(options))
        
        if choice == 0:
            break
        elif choice == 1:
            show_providers_menu()
        elif choice == 2:
            clear_screen()
            print_header("Raw Settings")
            console.print_json(json.dumps(load_settings()))
            input("\nPress Enter to return...")
