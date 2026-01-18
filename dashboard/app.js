const tg = window.Telegram.WebApp;
tg.expand();

// DOM Elements
const campaignList = document.getElementById('campaign-list');
const solPriceEl = document.getElementById('price-value');
const totalManagedEl = document.getElementById('total-managed');
const totalBuysEl = document.getElementById('total-buys');
const createBtn = document.getElementById('create-btn');

// Initialize
function init() {
    tg.ready();
    fetchData();

    // Refresh every 30 seconds
    setInterval(fetchData, 30000);
}

async function fetchData() {
    try {
        const userId = tg.initDataUnsafe.user?.id || 'TEST';
        const response = await fetch(`/api/user-data?userId=${userId}`);
        const data = await response.json();

        updateUI(data);
    } catch (err) {
        console.error('Failed to fetch data:', err);
    }
}

function updateUI(data) {
    // Update Stats
    solPriceEl.innerText = `$${data.solPrice?.toFixed(2) || '0.00'}`;
    totalManagedEl.innerText = `$${(data.totalManaged || 0).toFixed(2)}`;
    totalBuysEl.innerText = data.totalBuys || 0;

    // Update Campaigns
    if (!data.campaigns || data.campaigns.length === 0) {
        campaignList.innerHTML = `
            <div class="empty-state">
                <p>No active campaigns found.</p>
            </div>
        `;
        return;
    }

    campaignList.innerHTML = data.campaigns.map(c => {
        const progress = Math.min((c.buys_completed / c.total_buys) * 100, 100);
        const tokenDisplay = c.token_symbol || c.token_address.substring(0, 4);

        return `
            <div class="campaign-card">
                <div class="campaign-top">
                    <div class="token-info">
                        <div class="token-icon">${tokenDisplay[0]}</div>
                        <div>
                            <div class="token-name">${tokenDisplay}</div>
                            <div style="font-size: 0.7rem; color: var(--text-dim);">$${c.per_buy_amount} / buy</div>
                        </div>
                    </div>
                    <span class="token-status">${c.status.toUpperCase()}</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="progress-text">
                        <span>Progress</span>
                        <span>${c.buys_completed}/${c.total_buys} Buys</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

createBtn.addEventListener('click', () => {
    tg.close(); // Or send a message back to the bot
});

init();
