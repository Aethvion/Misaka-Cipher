/**
 * Code Golf
 * AI-powered refactoring game.
 */

(function () {
    let session = null;
    let originalCode = "";

    const elements = {
        originalCode: 'cg-original-code',
        solutionInput: 'cg-solution-input',
        submitBtn: 'cg-submit-btn',
        modelSelect: 'cg-model-select',
        difficultySelect: 'cg-difficulty-select',
        originalLen: 'cg-original-len',
        bestLen: 'cg-best-len',
        description: 'cg-description',
        langBadge: 'cg-lang-badge',
        charCount: 'cg-char-count',
        resetBtn: 'cg-reset-btn',
        hintBtn: 'cg-hint-btn',
        console: 'cg-console'
    };

    async function startNewGame() {
        const model = document.getElementById(elements.modelSelect)?.value || 'auto';
        const difficulty = document.getElementById(elements.difficultySelect)?.value || 'medium';

        setcgConsole('Initializing new golf challenge...');

        try {
            const data = await gameApiPost('new', {
                game_type: 'code-golf',
                difficulty: difficulty,
                model: model
            });

            if (data.success) {
                session = {
                    id: data.session_id,
                    model: data.model_used,
                    bestLength: Infinity
                };

                originalCode = data.snippet;
                document.getElementById(elements.originalCode).textContent = originalCode;
                document.getElementById(elements.originalLen).textContent = data.original_length;
                document.getElementById(elements.description).textContent = data.description || "Shorten the code while maintaining functionality.";
                document.getElementById(elements.langBadge).textContent = data.language || "code";
                document.getElementById(elements.solutionInput).value = "";
                document.getElementById(elements.submitBtn).disabled = false;
                updateCharCount();

                hideGameOverlay('code-golf');
                const startOverlay = document.getElementById('game-overlay-code-golf-start');
                if (startOverlay) startOverlay.style.display = 'none';

                setcgConsole('System ready. Submit your solution.');
            } else {
                setcgConsole(`Error: ${data.error}`, 'error');
            }
        } catch (err) {
            setcgConsole('Failed to start. Check connection.', 'error');
        }
    }

    async function submitSolution() {
        if (!session) return;
        const solution = document.getElementById(elements.solutionInput).value.trim();
        if (!solution) return;

        document.getElementById(elements.submitBtn).disabled = true;
        setcgConsole('Validation in progress... (AI is checking logic)');

        try {
            const data = await gameApiPost('action', {
                session_id: session.id,
                action: 'submit',
                data: { solution: solution }
            });

            if (data.success) {
                if (data.is_correct) {
                    setcgConsole(`SUCCESS! Length: ${data.new_length} chars. Savings: ${data.savings}`, 'success');
                    if (data.new_length < session.bestLength) {
                        session.bestLength = data.new_length;
                        document.getElementById(elements.bestLen).textContent = session.bestLength;
                    }
                    
                    showGameOverlay('code-golf', {
                        title: 'PAR!',
                        subtitle: data.message,
                        score: data.savings,
                        scoreLabel: 'Savings'
                    });
                } else {
                    setcgConsole(`REJECTED: ${data.message}`, 'error');
                }
            } else {
                setcgConsole(`Error: ${data.error}`, 'error');
            }
        } catch (err) {
            setcgConsole('Communication error.', 'error');
        } finally {
            document.getElementById(elements.submitBtn).disabled = false;
        }
    }

    function updateCharCount() {
        const val = document.getElementById(elements.solutionInput).value;
        document.getElementById(elements.charCount).textContent = `${val.length} chars`;
    }

    function setcgConsole(msg, type = 'info') {
        const con = document.getElementById(elements.console);
        if (!con) return;
        const color = type === 'error' ? '#f87171' : type === 'success' ? '#4ade80' : '#0f0';
        con.innerHTML = `<div style="color:${color}">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
    }

    async function requestHint() {
        if (!session) return;
        try {
            const data = await gameApiPost('action', { session_id: session.id, action: 'hint', data: {} });
            if (data.success) setcgConsole(`HINT: ${data.hint}`);
        } catch (e) {}
    }

    // Initialize
    function codeGolfInit() {
        loadGameModels(document.getElementById(elements.modelSelect));
        document.getElementById(elements.submitBtn)?.addEventListener('click', submitSolution);
        document.getElementById(elements.resetBtn)?.addEventListener('click', startNewGame);
        document.getElementById(elements.hintBtn)?.addEventListener('click', requestHint);
        document.getElementById(elements.solutionInput)?.addEventListener('input', updateCharCount);
    }

    // Register with framework
    registerGame('code-golf', {
        onLoad: codeGolfInit,
        onTabSwitch: () => {
            if (!session) {
                const overlay = document.getElementById('game-overlay-code-golf-start');
                if (overlay) overlay.style.display = 'flex';
            }
        }
    });

    window.startCodeGolf = startNewGame;
})();
