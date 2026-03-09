/**
 * Blackjack AI - Premium Table Logic
 */

(function () {
    let session = null;
    let streak = 0;

    const elements = {
        panel: 'game-blackjack-panel',
        modelSelect: 'pc-model-select',
        difficultySelect: 'pc-difficulty-select',
        streakDisplay: 'pc-streak',
        display: 'pc-display',
        aiHand: 'pc-ai-hand',
        playerHand: 'pc-player-hand',
        aiScore: 'pc-ai-score',
        playerScore: 'pc-player-score',
        hitBtn: 'pc-hit-btn',
        stayBtn: 'pc-stay-btn',
        hintBtn: 'pc-hint-btn',
        revealBtn: 'pc-reveal-btn',
        overlay: 'game-overlay-playing-cards',
        overlayTitle: 'pc-overlay-title',
        overlayMsg: 'pc-overlay-msg'
    };

    /**
     * Start a new duel
     */
    async function startNewDuel() {
        const model = document.getElementById(elements.modelSelect)?.value || 'auto';
        const difficulty = document.getElementById(elements.difficultySelect)?.value || 'medium';

        setDealerBubble('Shuffling deck...', true);
        hideOverlay();

        try {
            const data = await gameApiPost('new', {
                game_type: 'blackjack',
                difficulty: difficulty,
                model: model
            });

            if (data.success) {
                session = {
                    id: data.session_id,
                    completed: false
                };
                updateUI(data);
                setTimeout(() => setDealerBubble('Cards dealt. Your move.'), 800);
            } else {
                setDealerBubble(`Error: ${data.error}`, true);
            }
        } catch (err) {
            setDealerBubble('Failed to start duel.', true);
        }
    }

    /**
     * Draw a card (Hit)
     */
    async function hit() {
        if (!session || session.completed) return;
        setDealerBubble('Dealing...', true);

        try {
            const data = await gameApiPost('action', {
                session_id: session.id,
                action: 'draw',
                data: { target: 'player' }
            });

            if (data.success) {
                updateUI(data);
                if (data.completed) handleGameOver(data);
                else setTimeout(() => setDealerBubble('Hit again, or stay?'), 500);
            }
        } catch (err) { }
    }

    /**
     * Stand / Stay
     */
    async function stay() {
        if (!session || session.completed) return;
        setDealerBubble('Dealer\'s turn...', true);

        try {
            const data = await gameApiPost('action', {
                session_id: session.id,
                action: 'stay',
                data: {}
            });

            if (data.success) {
                updateUI(data);
                handleGameOver(data);
            }
        } catch (err) { }
    }

    /**
     * Get AI Tip
     */
    async function getTip() {
        if (!session) return;
        setDealerBubble('Hm, let me think about that...', true);

        try {
            const data = await gameApiPost('action', { session_id: session.id, action: 'hint', data: {} });
            if (data.success) {
                const tip = data.message || data.hint || "The dealer looks confident.";
                setTimeout(() => setDealerBubble(tip), 600);
            }
        } catch (err) { }
    }

    /**
     * Fold 
     */
    async function fold() {
        if (!session || session.completed) return;
        if (!confirm("Fold and lose this hand?")) return;

        try {
            const data = await gameApiPost('action', { session_id: session.id, action: 'reveal', data: {} });
            if (data.success) {
                updateUI(data);
                handleGameOver(data);
            }
        } catch (err) { }
    }

    /**
     * Update UI state
     */
    function updateUI(data) {
        console.log("[Blackjack] Updating Table UI:", data);

        if (data.player_hand) renderHand(document.getElementById(elements.playerHand), data.player_hand);
        if (data.ai_hand) renderHand(document.getElementById(elements.aiHand), data.ai_hand, data.hide_ai_card);

        if (data.player_score !== undefined) document.getElementById(elements.playerScore).textContent = data.player_score;
        if (data.ai_score !== undefined) document.getElementById(elements.aiScore).textContent = data.ai_score;

        if (data.message && !data.completed) {
            setDealerBubble(data.message);
        }
    }

    /**
     * Render Cards with premium layout
     */
    function renderHand(container, cards, hideHole = false) {
        container.innerHTML = '';

        const suitMap = {
            'Hearts': '♥', 'Diamonds': '♦', 'Clubs': '♣', 'Spades': '♠',
            'Heart': '♥', 'Diamond': '♦', 'Club': '♣', 'Spade': '♠',
            'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠',
            '♥': '♥', '♦': '♦', '♣': '♣', '♠': '♠'
        };

        cards.forEach((card, idx) => {
            const div = document.createElement('div');
            // Z-index fanning
            div.style.zIndex = idx + 1;
            div.style.animationDelay = `${idx * 0.15}s`;

            if (hideHole && idx === 1) {
                div.className = 'pc-card back';
            } else {
                const suit = suitMap[card.suit] || card.suit;
                const isRed = suit === '♥' || suit === '♦';
                div.className = `pc-card ${isRed ? 'red' : ''}`;
                div.innerHTML = `
                    <div class="card-top">${card.rank}<span>${suit}</span></div>
                    <div class="card-suit-center">${suit}</div>
                    <div class="card-bottom">${card.rank}<span>${suit}</span></div>
                `;
            }
            container.appendChild(div);
        });
    }

    function setDealerBubble(text, isThinking = false) {
        const bubble = document.getElementById(elements.display);
        if (!bubble) return;

        bubble.classList.remove('active');

        setTimeout(() => {
            bubble.textContent = isThinking ? '...' : text;
            bubble.classList.add('active');
        }, 100);
    }

    function handleGameOver(data) {
        session.completed = true;

        const overlay = document.getElementById(elements.overlay);
        const title = document.getElementById(elements.overlayTitle);
        const msg = document.getElementById(elements.overlayMsg);

        setTimeout(() => {
            if (data.result === 'win') {
                title.textContent = 'YOU WIN';
                title.style.color = '#55efc4';
                streak++;
            } else if (data.result === 'push') {
                title.textContent = 'PUSH';
                title.style.color = '#ffeaa7';
            } else {
                title.textContent = 'DEALER WINS';
                title.style.color = '#ff7675';
                streak = 0;
            }

            document.getElementById(elements.streakDisplay).textContent = streak;
            msg.textContent = data.message || 'Game Over.';
            overlay.style.display = 'flex';
        }, 1200); // Small delay to see final cards
    }

    function hideOverlay() {
        document.getElementById(elements.overlay).style.display = 'none';
    }

    // Register with framework
    document.addEventListener('DOMContentLoaded', () => {
        loadGameModels(document.getElementById(elements.modelSelect));

        document.getElementById(elements.hitBtn)?.addEventListener('click', hit);
        document.getElementById(elements.stayBtn)?.addEventListener('click', stay);
        document.getElementById(elements.hintBtn)?.addEventListener('click', getTip);
        document.getElementById(elements.revealBtn)?.addEventListener('click', fold);

        registerGame('blackjack', {
            onTabSwitch: () => {
                if (!session) startNewDuel();
            }
        });
    });

    window.startPlayingCards = startNewDuel;

})();
