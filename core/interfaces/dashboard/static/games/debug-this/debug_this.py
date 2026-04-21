from abc import ABC, abstractmethod

class BaseGame(ABC):
    def __init__(self, difficulty: str):
        self.difficulty = difficulty

    @abstractmethod
    def get_system_prompt(self) -> str:
        pass

    @abstractmethod
    def get_opening_prompt(self) -> str:
        pass

class DebugThisGame(BaseGame):
    def get_system_prompt(self) -> str:
        difficulty_hints = {
            "easy":   "The bug should be obvious (e.g., misspelled variable, missing colon, wrong operator).",
            "medium": "The bug should be more subtle (e.g., off-by-one error, shallow vs deep copy issue, scope error).",
            "hard":   "The bug should be hard to find (e.g., race condition in logic, edge case for null/empty, logical flaw in math).",
            "expert": "The bug should be highly non-trivial or involve advanced language features."
        }
        hint = difficulty_hints.get(self.difficulty, difficulty_hints["easy"])
        return f"""You are the Game Master AI for 'Debug This!'.

== RULES ==
- You generate a small code snippet (Python or Javascript) with EXACTLY ONE deliberate bug.
- The bug should be from a specific category (off-by-one, wrong operator, missing null check, scope issue, etc.).
- The user must find and fix the bug.
- You must evaluate if the user's fix is correct.

== STRICT RESPONSE FORMAT (JSON ONLY) ==
Every response MUST be a single JSON object.
You will receive inputs like:
- ACTION: solve, DATA: {{"fix": "..."}}
- ACTION: hint, DATA: {{}}

1. New Game: {{"action": "ready", "bug_code": "code with bug", "language": "python", "description": "what the code IS SUPPOSED to do", "bug_type_hint": "general area"}}
2. Submit Fix: {{"action": "result", "is_fixed": true, "message": "congrats/explanation"}}
3. Wrong Fix: {{"action": "result", "is_fixed": false, "message": "why it's still broken"}}
4. Hint Request: {{"action": "hint", "hint": "nudge towards the bug location or type"}}

Current Difficulty: {self.difficulty}
{hint}"""

    def get_opening_prompt(self) -> str:
        return f"Start a new Debug This challenge. Difficulty: {self.difficulty}. Choose a language (Python/JS). Respond ONLY with the JSON object."
