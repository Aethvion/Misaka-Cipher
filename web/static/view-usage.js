// Misaka Cipher - Usage Dashboard View
// Handles interacting with the Usage statistics and charts

let _providerChart = null;
let _timelineChart = null;
let _costByModelChart = null;
let _tokensByModelChart = null;

async function loadUsageDashboard() {
    try {
        const timeRange = typeof prefs !== 'undefined' ? prefs.get('usage.time_range', '1w') : '1w';
        const hours = timeRange === '1d' ? 24 : 168;

        document.querySelectorAll('.chart-time-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.range === timeRange);
        });

        const [summaryRes, historyRes, hourlyRes, costModelRes, tokensModelRes] = await Promise.all([
            fetch('/api/usage/summary'),
            fetch('/api/usage/history?limit=50'),
            fetch(`/api/usage/hourly?hours=${hours}`),
            fetch('/api/usage/cost-by-model'),
            fetch('/api/usage/tokens-by-model')
        ]);

        const summary = await summaryRes.json();
        const history = await historyRes.json();
        const hourly = await hourlyRes.json();
        const costModel = await costModelRes.json();
        const tokensModel = await tokensModelRes.json();

        updateUsageStatCards(summary);
        renderProviderChart(summary);
        renderTimelineChart(hourly);
        renderCostByModelChart(costModel);
        renderTokensByModelChart(tokensModel);
        renderModelUsageTable(summary);
        renderRecentCallsTable(history.entries || []);

        if (!window.usageListenersSetup) {
            setupUsageListeners();
            window.usageListenersSetup = true;
        }

    } catch (error) {
        console.error('Error loading usage dashboard:', error);
    }
}

function setupUsageListeners() {
    document.querySelectorAll('.chart-time-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const range = e.target.dataset.range;
            if (typeof savePreference === 'function') {
                await savePreference('usage.time_range', range);
            }
            loadUsageDashboard();
        });
    });
}

function formatNumber(n) {
    if (n === undefined || n === null) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function formatCost(v) {
    if (v === undefined || v === null) return '$0.00';
    if (v >= 1) return '$' + v.toFixed(2);
    if (v >= 0.01) return '$' + v.toFixed(4);
    if (v === 0) return '$0.00';
    return '$' + v.toFixed(6);
}

function updateUsageStatCards(summary) {
    const totalCalls = document.getElementById('usage-total-calls');
    if (totalCalls) totalCalls.textContent = formatNumber(summary.total_calls || 0);

    const totalTokens = document.getElementById('usage-total-tokens');
    if (totalTokens) totalTokens.textContent = formatNumber(summary.total_tokens || 0);

    const inputCost = document.getElementById('usage-input-cost');
    if (inputCost) inputCost.textContent = formatCost(summary.total_input_cost || 0);

    const outputCost = document.getElementById('usage-output-cost');
    if (outputCost) outputCost.textContent = formatCost(summary.total_output_cost || 0);

    const successRate = document.getElementById('usage-success-rate');
    if (successRate) successRate.textContent = (summary.success_rate || 0).toFixed(1) + '%';
}

function renderProviderChart(summary) {
    const ctx = document.getElementById('chart-provider-calls');
    if (!ctx || typeof Chart === 'undefined') return;

    if (_providerChart) _providerChart.destroy();

    const providers = summary.by_provider || {};
    const labels = Object.keys(providers);
    const data = labels.map(k => providers[k].calls);

    const colorMap = {
        'google_ai': '#4285F4',
        'openai': '#10A37F',
        'grok': '#FF6600',
        'local': '#FFAA00'
    };
    const colors = labels.map(l => colorMap[l] || '#888888');

    _providerChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: '#0a0e1a',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#a0a0a0', font: { size: 12 } }
                }
            }
        }
    });
}

function renderTimelineChart(hourlyData) {
    const ctx = document.getElementById('chart-tokens-timeline');
    if (!ctx || typeof Chart === 'undefined') return;

    if (_timelineChart) _timelineChart.destroy();

    const hours = hourlyData.hours || [];
    const labels = hours.map(h => {
        const parts = h.hour.split('T');
        return parts[1] ? parts[1] + ':00' : h.hour;
    });
    const tokenData = hours.map(h => h.tokens);
    const callData = hours.map(h => h.calls);

    _timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Tokens',
                    data: tokenData,
                    borderColor: '#00d9ff',
                    backgroundColor: 'rgba(0, 217, 255, 0.1)',
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y'
                },
                {
                    label: 'Calls',
                    data: callData,
                    borderColor: '#ff00aa',
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.3,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { type: 'linear', display: true, position: 'left', ticks: { color: '#00d9ff' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y1: { type: 'linear', display: true, position: 'right', ticks: { color: '#ff00aa' }, grid: { drawOnChartArea: false } }
            },
            plugins: { legend: { labels: { color: '#a0a0a0' } } }
        }
    });
}

function renderCostByModelChart(data) {
    const ctx = document.getElementById('chart-cost-model');
    if (!ctx || typeof Chart === 'undefined') return;

    if (_costByModelChart) _costByModelChart.destroy();

    const items = data.costs || [];
    const labels = items.map(i => i.model);
    const inCosts = items.map(i => i.input_cost);
    const outCosts = items.map(i => i.output_cost);

    _costByModelChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Out ($)', data: outCosts, backgroundColor: '#ff00aa' },
                { label: 'In ($)', data: inCosts, backgroundColor: '#00d9ff' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: { stacked: true, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { stacked: true, ticks: { color: '#a0a0a0', font: { size: 10 } }, grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderTokensByModelChart(data) {
    const ctx = document.getElementById('chart-tokens-model');
    if (!ctx || typeof Chart === 'undefined') return;

    if (_tokensByModelChart) _tokensByModelChart.destroy();

    const items = data.tokens || [];
    const labels = items.map(i => i.model);
    const values = items.map(i => i.tokens);

    _tokensByModelChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ data: values, backgroundColor: '#00d9ff' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#a0a0a0', font: { size: 10 } }, grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderModelUsageTable(summary) {
    const tbody = document.getElementById('usage-models-tbody');
    if (!tbody) return;

    const models = summary.by_model || {};
    const arr = Object.keys(models).map(k => ({ model: k, ...models[k] }));

    arr.sort((a, b) => b.cost - a.cost);

    if (!arr.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="placeholder-text">No usage recorded</td></tr>';
        return;
    }

    tbody.innerHTML = arr.map(m => `<tr>
        <td style="font-family: 'Fira Code', monospace; font-size: 0.85rem;">${m.model}</td>
        <td>${formatNumber(m.prompt_tokens)}</td>
        <td>${formatNumber(m.completion_tokens)}</td>
        <td>${formatNumber(m.tokens)}</td>
        <td>${formatCost(m.cost)}</td>
    </tr>`).join('');
}

function renderRecentCallsTable(entries) {
    const tbody = document.getElementById('usage-recent-tbody');
    if (!tbody) return;

    if (!entries.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="placeholder-text">No API calls recorded yet</td></tr>';
        return;
    }

    tbody.innerHTML = entries.slice(0, 25).map(e => {
        const time = new Date(e.timestamp).toLocaleTimeString();
        const provider = e.provider || 'unknown';
        const source = e.source || 'chat';
        return `<tr>
            <td style="font-family: 'Fira Code', monospace; font-size: 0.8rem;">${time}</td>
            <td><span class="source-badge ${source}">${source}</span></td>
            <td><span class="provider-badge ${provider}">${provider}</span></td>
            <td style="font-family: 'Fira Code', monospace; font-size: 0.8rem;">${e.model || '?'}</td>
            <td>${formatNumber(e.prompt_tokens || 0)}${e.tokens_estimated ? ' ~' : ''}</td>
            <td>${formatNumber(e.completion_tokens || 0)}${e.tokens_estimated ? ' ~' : ''}</td>
            <td>${formatCost(e.input_cost || 0)}</td>
            <td>${formatCost(e.output_cost || 0)}</td>
        </tr>`;
    }).join('');
}
