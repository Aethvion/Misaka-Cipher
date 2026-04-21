/**
 * Debug This!
 * AI-powered troubleshooting game.
 */

(function () {
    let session = null;
    let streak = 0;
    let level = 1;

    const elements = {
        codeInput: 'dt-code-input',
        submitBtn: 'dt-submit-btn',
        modelSelect: 'dt-model-select',
        difficultySelect: 'dt-difficulty-select',
        levelDisplay: 'dt-level-display',
        streakDisplay: 'dt-streak-display',
        description: 'dt-description',
        langBadge: 'dt-lang-badge',
        bugHint: 'dt-bug-hint',
        resetBtn: 'dt-reset-btn',
        hintBtn: 'dt-hint-btn',
        logs: 'dt-logs'
    };

    async function startNewGame() {
        const model = document.getElementById(elements.modelSelect)?.value || 'auto';
        const difficulty = document.getElementById(elements.difficultySelect)?.value || 'medium';

        setdtLogs('Injecting bug into system environment...');

        try {
            const data = await gameApiPost('new', {
                game_type: 'debug-this',
                difficulty: difficulty,
                model: model
            });

            if (data.success) {
                session = {
                    id: data.session_id,
                    model: data.model_used
                };

                document.getElementById(elements.codeInput).value = data.bug_code;
                document.getElementById(elements.description).textContent = data.description || "Fix the bug in the code.";
                document.getElementById(elements.langBadge).textContent = data.language || "code";
                document.getElementById(elements.bugHint).textContent = data.bug_type_hint ? `Area: ${data.bug_type_hint}` : "";
                document.getElementById(elements.submitBtn).disabled = false;

                hideGameOverlay('debug-this');
                const startOverlay = document.getElementById('game-overlay-debug-this-start');
                if (startOverlay) startOverlay.style.display = 'none';

                setdtLogs('Bug localized. System awaiting patches.', 'info');
            } else {
                setdtLogs(`Infection Error: ${data.error}`, 'error');
            }
        } catch (err) {
            setdtLogs('Failed to deploy test environment.', 'error');
        }
    }

    async function submitFix() {
        if (!session) return;
        const fixedCode = document.getElementById(elements.codeInput).value.trim();
        if (!fixedCode) return;

        document.getElementById(elements.submitBtn).disabled = true;
        setdtLogs('Running automated unit tests...');

        try {
            const data = await gameApiPost('action', {
                session_id: session.id,
                action: 'solve',
                data: { fix: fixedCode }
            });

            if (data.success) {
                if (data.is_fixed) {
                    streak++;
                    level = Math.floor(streak / 3) + 1;
                    document.getElementById(elements.streakDisplay).textContent = streak;
                    document.getElementById(elements.levelDisplay).textContent = level;

                    setdtLogs('Patch successful. All tests passed.', 'success');
                    
                    showGameOverlay('debug-this', {
                        title: 'VULNERABILITY PATCHED',
                        subtitle: data.message,
                        score: `${streak % 3}/3`,
                        scoreLabel: 'Next Level'
                    });
                } else {
                    setdtLogs(`DEBUGGER ERROR: ${data.message}`, 'error');
                }
            } else {
                setdtLogs(`API Error: ${data.error}`, 'error');
            }
        } catch (err) {
            setdtLogs('Transmission line failure.', 'error');
        } finally {
            document.getElementById(elements.submitBtn).disabled = false;
        }
    }

    function setdtLogs(msg, type = 'info') {
        const con = document.getElementById(elements.logs);
        if (!con) return;
        const color = type === 'error' ? '#e94560' : type === 'success' ? '#34d399' : '#00d2ff';
        con.innerHTML = `<div style="color:${color}">[SYS_LOG] ${msg}</div>`;
    }

    async function requestHint() {
        if (!session) return;
        try {
            const data = await gameApiPost('action', { session_id: session.id, action: 'hint', data: {} });
            if (data.success) setdtLogs(`AI_HINT: ${data.hint}`, 'success');
        } catch (e) {}
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        loadGameModels(document.getElementById(elements.modelSelect));
        document.getElementById(elements.submitBtn)?.addEventListener('click', submitFix);
        document.getElementById(elements.resetBtn)?.addEventListener('click', startNewGame);
        document.getElementById(elements.hintBtn)?.addEventListener('click', requestHint);

        registerGame('debug-this', {
            onTabSwitch: () => {
                if (!session) {
                    const overlay = document.getElementById('game-overlay-debug-this-start');
                    if (overlay) overlay.style.display = 'flex';
                }
            }
        });
    });

    window.startDebugThis = startNewGame;
})();
