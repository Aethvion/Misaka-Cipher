(function () {
    const elements = {
        totalGames: 'res-total-games',
        winRate: 'res-win-rate',
        totalWins: 'res-total-wins',
        totalLosses: 'res-total-losses',
        historyBody: 'res-history-body',
        refreshBtn: 'results-refresh-btn'
    };

    async function loadStats() {
        try {
            const resp = await fetch('/api/games/stats');
            const data = await resp.json();

            if (data.success) {
                updateUI(data);
            }
        } catch (err) {
            console.error("Failed to load game stats:", err);
        }
    }

    function updateUI(data) {
        const stats = data.stats;
        document.getElementById(elements.totalGames).textContent = stats.total_games;
        document.getElementById(elements.totalWins).textContent = stats.wins;
        document.getElementById(elements.totalLosses).textContent = stats.losses;

        const rate = stats.total_games > 0 ? ((stats.wins / stats.total_games) * 100).toFixed(1) : 0;
        document.getElementById(elements.winRate).textContent = `${rate}%`;

        // Update Table
        const body = document.getElementById(elements.historyBody);
        body.innerHTML = '';

        data.recent.forEach(game => {
            const row = document.createElement('tr');
            const date = new Date(game.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

            row.innerHTML = `
                <td>#${game.id}</td>
                <td>${game.type}</td>
                <td><span class="result-badge result-${game.result}">${game.result}</span></td>
                <td>${game.score}</td>
                <td>${date}</td>
            `;
            body.appendChild(row);
        });
    }

    // Register with framework
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById(elements.refreshBtn)?.addEventListener('click', loadStats);

        registerGame('game-results', {
            onTabSwitch: () => {
                loadStats();
            }
        });
    });

    window.refreshGameStats = loadStats;
})();
