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
    if (data.campaigns && data.campaigns.length > 0) {
        window.lastWallet = data.campaigns[0].destination_wallet;
    }

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

const createView = document.getElementById('create-view');
const closeCreateBtn = document.getElementById('close-create-btn');
const createForm = document.getElementById('create-form');

// Helper to update range inputs from chips
window.setVal = (id, val) => {
    document.getElementById(id).value = val;
};

// Toggle Create View
createBtn.addEventListener('click', () => {
    createView.classList.remove('hidden');
    // Pre-fill logic if needed
    const userId = tg.initDataUnsafe.user?.id || 'TEST';
    if (window.lastWallet) {
        document.getElementById('dest-wallet').value = window.lastWallet;
        document.getElementById('wallet-hint').classList.remove('hidden');
    }
});

closeCreateBtn.addEventListener('click', () => {
    createView.classList.add('hidden');
});

// Submit Form
createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = 'Creating...';
    btn.disabled = true;

    const data = {
        userId: tg.initDataUnsafe.user?.id,
        username: tg.initDataUnsafe.user?.username,
        destinationWallet: document.getElementById('dest-wallet').value,
        tokenAddress: document.getElementById('token-address').value,
        totalDeposit: parseFloat(document.getElementById('deposit-amount').value),
        numberOfBuys: parseInt(document.getElementById('num-buys').value),
        interval: parseInt(document.getElementById('interval').value)
    };

    try {
        const res = await fetch('/api/create-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (result.success) {
            tg.showPopup({
                title: 'Success!',
                message: 'Campaign created. Check the bot chat for deposit address.',
                buttons: [{ type: 'ok' }]
            }, () => {
                tg.close();
            });
        } else {
            tg.showAlert(result.error || 'Failed to create campaign');
            btn.innerText = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        tg.showAlert('Network error occurred');
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

init();
