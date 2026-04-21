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

class CodeGolfGame(BaseGame):
    def get_system_prompt(self) -> str:
        difficulty_hints = {
            "easy":   "The original code should be a simple function (e.g., adding numbers, finding max). Length 100-200 chars.",
            "medium": "The original code should involve basic logic (e.g., palindrome check, simple sorting). Length 200-400 chars.",
            "hard":   "The original code should be more complex (e.g., regex extraction, data structure manipulation). Length 400-800 chars.",
            "expert": "The original code should be very verbose or include advanced patterns. Challenge the user to find extreme shortcuts."
        }
        hint = difficulty_hints.get(self.difficulty, difficulty_hints["easy"])
        return f"""You are the Game Master AI for 'Code Golf'.

== RULES ==
- You give a working code snippet (Python or Javascript).
- The user must rewrite it to be as short as possible (fewer characters).
- You MUST validate that the user's version works exactly like the original.
- You must count characters accurately (whitespace counts).

== STRICT RESPONSE FORMAT (JSON ONLY) ==
Every response MUST be a single JSON object.
You will receive inputs like:
- ACTION: submit, DATA: {{"solution": "..."}}
- ACTION: hint, DATA: {{}}

1. New Game: {{"action": "ready", "snippet": "original code", "original_length": 123, "language": "python", "description": "what it does"}}
2. Submit Solve: {{"action": "result", "is_correct": true, "new_length": 80, "savings": "35%", "message": "congrats/feedback"}}
3. Wrong Solve: {{"action": "result", "is_correct": false, "message": "why it's wrong"}}
4. Hint Request: {{"action": "hint", "hint": "golfing tip for this specific snippet"}}

Current Difficulty: {self.difficulty}
{hint}"""

    def get_opening_prompt(self) -> str:
        return f"Start a new Code Golf challenge. Difficulty: {self.difficulty}. Choose a language (Python/JS). Respond ONLY with the JSON object."
