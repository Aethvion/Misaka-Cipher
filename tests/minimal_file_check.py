import os
import json
from pathlib import Path

def check_files():
    print("Starting Minimal File Check...")
    
    # Setup paths
    base_path = Path(__file__).parent.parent
    threads_dir = base_path / "memory" / "storage" / "threads"
    tasks_dir = base_path / "memory" / "storage" / "tasks"
    
    print(f"Threads Dir: {threads_dir}")
    print(f"Tasks Dir: {tasks_dir}")

    if not tasks_dir.exists():
        print("Tasks dir does not exist!")
        return

    # Manual check of files
    files = list(tasks_dir.glob("*.json"))
    print(f"Found {len(files)} JSON files in tasks dir")
    for f in files:
        print(f"  - {f.name}")
        try:
            with open(f, 'r', encoding='utf-8') as file:
                data = json.load(file)
                print(f"    ID: {data.get('id')}, Thread: {data.get('thread_id')}")
        except Exception as e:
            print(f"    Error reading file: {e}")

if __name__ == "__main__":
    check_files()
