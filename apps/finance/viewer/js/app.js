/**
 * Aethvion Finance - Core Application Logic
 */

class FinanceApp {
    constructor() {
        this.transactions = [];
        this.balance = 0;
        this.income = 0;
        this.expenses = 0;
        this.chart = null;
        
        this.init();
    }

    init() {
        this.initChart();
        this.bindEvents();
        this.loadSampleData();
        this.updateUI();
        console.log("Aethvion Finance Initialized");
    }

    initChart() {
        const ctx = document.getElementById('mainChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'Net Worth',
                    data: [12000, 15000, 14500, 18000, 22000, 25000],
                    borderColor: '#00d2ff',
                    backgroundColor: 'rgba(0, 210, 255, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointBackgroundColor: '#00d2ff',
                    pointBorderColor: '#fff',
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#a0a0a0' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#a0a0a0' }
                    }
                }
            }
        });
    }

    bindEvents() {
        document.getElementById('save-btn').addEventListener('click', () => this.saveProject());
        document.getElementById('load-btn').addEventListener('click', () => this.loadProjectsList());
    }

    loadSampleData() {
        this.transactions = [
            { id: 1, name: 'Salary Payout', amount: 5000, date: '2026-03-15', category: 'Income' },
            { id: 2, name: 'Office Rent', amount: -1200, date: '2026-03-10', category: 'Rent' },
            { id: 3, name: 'Cloud Server', amount: -45.50, date: '2026-03-08', category: 'Services' },
            { id: 4, name: 'Vending Machine', amount: -2.50, date: '2026-03-05', category: 'Food' }
        ];
        this.calculateTotals();
    }

    calculateTotals() {
        this.income = this.transactions
            .filter(t => t.amount > 0)
            .reduce((sum, t) => sum + t.amount, 0);
        
        this.expenses = Math.abs(this.transactions
            .filter(t => t.amount < 0)
            .reduce((sum, t) => sum + t.amount, 0));
        
        this.balance = this.income - this.expenses;
    }

    updateUI() {
        document.getElementById('total-net-worth').textContent = `$${this.balance.toLocaleString()}`;
        document.getElementById('monthly-income').textContent = `+$${this.income.toLocaleString()}`;
        document.getElementById('monthly-expenses').textContent = `-$${this.expenses.toLocaleString()}`;
        document.getElementById('active-savings').textContent = `$${(this.balance * 0.4).toLocaleString()}`;

        const list = document.getElementById('transaction-list');
        list.innerHTML = '';
        this.transactions.forEach(t => {
            const item = document.createElement('div');
            item.className = 'activity-item';
            if (t.amount > 0) item.style.borderLeftColor = 'var(--success)';
            else if (t.amount < -500) item.style.borderLeftColor = 'var(--danger)';

            item.innerHTML = `
                <div class="info">
                    <h4>${t.name}</h4>
                    <p>${t.date} • ${t.category}</p>
                </div>
                <div class="amount ${t.amount > 0 ? 'positive' : 'negative'}">
                    ${t.amount > 0 ? '+' : ''}$${t.amount.toLocaleString()}
                </div>
            `;
            list.appendChild(item);
        });
    }

    async saveProject() {
        const name = prompt("Enter project name:", "My Finance");
        if (!name) return;

        const projectData = JSON.stringify({
            transactions: this.transactions,
            balance: this.balance,
            income: this.income,
            expenses: this.expenses
        });

        try {
            const resp = await fetch('/api/save-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, data: projectData })
            });
            const result = await resp.json();
            if (result.success) alert(`Project saved: ${result.filename}`);
        } catch (err) {
            console.error("Save failed:", err);
            alert("Failed to save project to server.");
        }
    }

    async loadProjectsList() {
        try {
            const resp = await fetch('/api/projects');
            const data = await resp.json();
            if (!data.projects.length) {
                alert("No projects found.");
                return;
            }
            
            const names = data.projects.map(p => p.name).join("\n");
            const selected = prompt(`Sync Project Data:\n\n${names}`);
            
            if (selected) {
                const project = data.projects.find(p => p.name.toLowerCase() === selected.toLowerCase());
                if (project) {
                    const lResp = await fetch(`/api/load-project/${project.filename}`);
                    const lData = await lResp.json();
                    const state = JSON.parse(lData.data);
                    
                    this.transactions = state.transactions;
                    this.calculateTotals();
                    this.updateUI();
                    alert("Finance workspace synchronized.");
                }
            }
        } catch (err) {
            console.error("Load failed:", err);
        }
    }
}

window.addEventListener('load', () => {
    window.financeApp = new FinanceApp();
});
