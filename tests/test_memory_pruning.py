"""
Test for memory pruning fix - ensures to_remove variable is correctly used
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

def test_variable_names():
    """
    Test that the pruning logic uses correct variable names.
    This verifies the fix for the to_removed -> to_remove typo.
    """
    # Read the episodic_memory.py file
    memory_file = Path(__file__).parent.parent / "memory" / "episodic_memory.py"
    with open(memory_file, 'r') as f:
        content = f.read()
    
    # Check that to_remove is defined
    assert "to_remove = int(count * 0.1)" in content, "to_remove variable should be defined"
    
    # Check that to_removed (typo) is NOT used
    assert "to_removed" not in content, "to_removed (typo) should not be present in the file"
    
    # Check that to_remove is correctly used in the list comprehension
    assert "memory_ids_with_time[:to_remove]" in content, "to_remove should be used in the list comprehension"
    
    print("✅ All variable name checks passed!")
    print("✅ The pruning logic correctly uses 'to_remove' variable")
    return True

if __name__ == "__main__":
    try:
        test_variable_names()
        print("\n✅ Memory pruning fix verified successfully!")
        sys.exit(0)
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
