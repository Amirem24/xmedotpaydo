// --- UTILS: PERSIAN NUMBERS & DATE ---
const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const persianMonths = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

function toPersianNum(num) {
    if (num === null || num === undefined) return '';
    return num.toString().replace(/\d/g, x => farsiDigits[x]);
}

function cleanNumber(str) {
    if (!str) return 0;
    const persianMap = {'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
    let englishStr = str.toString().replace(/[۰-۹]/g, w => persianMap[w] || w);
    englishStr = englishStr.replace(/,/g, '').replace(/[^\d.-]/g, '');
    return parseInt(englishStr) || 0;
}

function formatMoney(amount) {
    if (amount === null || amount === undefined) return '۰';
    const num = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return toPersianNum(num);
}

// Helper to parse "YYYY/MM/DD" string safely
function parsePersianDateStr(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
        const cleanDate = dateStr.replace(/[۰-۹]/g, w => {'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'}[w]);
        const parts = cleanDate.split('/');
        if (parts.length === 3) {
            return {
                year: parseInt(parts[0]),
                month: parseInt(parts[1]),
                day: parseInt(parts[2])
            };
        }
    } catch (e) {
        console.error('Date parse error', e);
    }
    return null;
}

// --- APP STATE ---
let state = {
    accounts: [
        { id: 1, name: 'کیف پول نقدی', type: 'cash', balance: 0 }
    ],
    transactions: [],
    currentTransType: 'expense'
};

// BUDGET STATE
let budgetState = {
    currentYear: 1403,
    currentMonth: 10, // Default to Dey
    activeTab: 'expense'
};

const DB_NAME = 'paydo_data_v1';
const OLD_DB_NAME = 'poolaki_data_v2';

// --- UI UTILS ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    let icon = 'info';
    if(type === 'success') icon = 'check_circle';
    if(type === 'error') icon = 'error_outline';
    toast.innerHTML = `<i class="material-icons" style="color:${type==='error'?'#ff5252':'#00e676'}">${icon}</i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showConfirm(title, message, onYes) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    const yesBtn = document.getElementById('btn-confirm-yes');
    const newBtn = yesBtn.cloneNode(true); // Remove old listeners
    yesBtn.parentNode.replaceChild(newBtn, yesBtn);
    newBtn.addEventListener('click', () => {
        onYes();
        closeModal('modal-confirm');
    });
    document.getElementById('modal-confirm').style.display = 'flex';
}

function updateLoading(percent, text) {
    const bar = document.getElementById('loading-bar');
    const txt = document.getElementById('loading-text');
    if(bar) bar.style.width = percent + '%';
    if(txt && text) txt.innerText = text;
}

function finishLoading() {
    updateLoading(100, 'آماده‌سازی رابط کاربری...');
    setTimeout(() => {
        const screen = document.getElementById('loading-screen');
        const app = document.getElementById('app-container');
        if(screen) {
            screen.style.opacity = '0';
            setTimeout(() => screen.style.display = 'none', 500);
        }
        if(app) app.style.opacity = '1';
    }, 600);
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        updateLoading(10, 'در حال بارگذاری هسته برنامه...');
        
        setTimeout(() => {
            try {
                loadData();
                
                // Set current Persian Date for Budget
                const todayStr = new Date().toLocaleDateString('fa-IR');
                const pDate = parsePersianDateStr(todayStr);
                if(pDate) {
                    budgetState.currentYear = pDate.year;
                    budgetState.currentMonth = pDate.month;
                }

                updateLoading(40, 'خواندن اطلاعات...');
                setupInputFormatters();
                setupEventListeners();
                
                setTimeout(() => {
                    try {
                        renderDashboard();
                        updateLoading(80, 'پردازش تراکنش‌ها...');
                    } catch (err) {
                        console.error('Render Error:', err);
                    }
                    setTimeout(finishLoading, 400);
                }, 300);
            } catch (err) {
                console.error('Critical Init Error:', err);
                finishLoading(); // Force open even if error
            }
        }, 300);
    } catch (e) {
        console.error('Base Error', e);
        finishLoading();
    }
});

function setupEventListeners() {
    const formTrans = document.getElementById('form-transaction');
    if(formTrans) formTrans.addEventListener('submit', saveTransaction);
    
    const formAcc = document.getElementById('form-account');
    if(formAcc) formAcc.addEventListener('submit', saveAccount);
    
    const search = document.getElementById('transaction-search');
    if(search) search.addEventListener('input', filterTransactions);
}

function loadData() {
    // 1. Try Loading New Data
    const saved = localStorage.getItem(DB_NAME);
    let loaded = false;

    if (saved) {
        try {
            state = JSON.parse(saved);
            loaded = true;
        } catch (e) {
            console.error('Data corruption in new DB');
        }
    }
    
    // 2. If no new data, try migrating old data
    if (!loaded) {
        const oldData = localStorage.getItem(OLD_DB_NAME);
        if (oldData) {
            try {
                state = JSON.parse(oldData);
                console.log('Migrated from Poolaki v2');
                saveData(); // Save to new Paydo DB
            } catch (e) {
                console.error('Data corruption in old DB');
            }
        }
    }

    // Ensure state structure is valid
    if(!state.accounts) state.accounts = [];
    if(!state.transactions) state.transactions = [];
}

function saveData() {
    localStorage.setItem(DB_NAME, JSON.stringify(state));
    renderDashboard();
    // Only render these if views are active to save performance
    if(document.getElementById('view-history').classList.contains('active')) renderHistory();
    if(document.getElementById('view-accounts').classList.contains('active')) renderAccountsList();
    if(document.getElementById('view-budget').classList.contains('active')) renderBudgetView();
}

function setupInputFormatters() {
    const moneyInputs = document.querySelectorAll('.money-input');
    moneyInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const rawVal = cleanNumber(e.target.value);
            if (rawVal === 0 && e.target.value.trim() === '') e.target.value = '';
            else e.target.value = formatMoney(rawVal);
        });
    });
}

// --- BUDGET & CHART LOGIC ---

window.changeBudgetMonth = function(delta) {
    let m = budgetState.currentMonth + delta;
    let y = budgetState.currentYear;
    
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    
    budgetState.currentMonth = m;
    budgetState.currentYear = y;
    renderBudgetView();
}

window.setBudgetTab = function(type) {
    budgetState.activeTab = type;
    document.querySelectorAll('.budget-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + type).classList.add('active');
    renderBudgetView();
}

function renderBudgetView() {
    const monthName = persianMonths[budgetState.currentMonth - 1] || 'نامشخص';
    const monthLabel = document.getElementById('budget-current-month');
    if(monthLabel) monthLabel.innerText = `${monthName} ${toPersianNum(budgetState.currentYear)}`;
    
    const filteredTrans = state.transactions.filter(t => {
        if (t.type !== budgetState.activeTab) return false;
        const d = parsePersianDateStr(t.date); 
        if (!d) return false;
        return d.year === budgetState.currentYear && d.month === budgetState.currentMonth;
    });

    const daysInMonth = (budgetState.currentMonth <= 6) ? 31 : (budgetState.currentMonth === 12 ? 29 : 30);
    const dailySums = new Array(daysInMonth + 1).fill(0);
    let totalSum = 0;

    filteredTrans.forEach(t => {
        const d = parsePersianDateStr(t.date);
        if (d && d.day <= daysInMonth) {
            dailySums[d.day] += parseInt(t.amount);
            totalSum += parseInt(t.amount);
        }
    });

    const totalEl = document.getElementById('chart-total-amount');
    if(totalEl) totalEl.innerText = `${formatMoney(totalSum)} ریال`;
    
    const subtitleEl = document.getElementById('chart-subtitle');
    if(subtitleEl) subtitleEl.innerText = budgetState.activeTab === 'expense' ? 'مجموع هزینه ماه' : 'مجموع درآمد ماه';

    const chartContainer = document.getElementById('chart-bars-container');
    if(chartContainer) {
        chartContainer.innerHTML = '';
        const maxVal = Math.max(...dailySums, 1);

        for (let i = 1; i <= daysInMonth; i++) {
            const val = dailySums[i];
            const heightPercent = (val / maxVal) * 100;
            
            const wrapper = document.createElement('div');
            wrapper.className = 'chart-bar-wrapper';
            
            const bar = document.createElement('div');
            bar.className = 'chart-bar';
            if (budgetState.activeTab === 'expense') bar.classList.add('expense-bar');
            
            bar.style.height = (val === 0) ? '4px' : `${Math.max(heightPercent, 4)}%`;
            if (val === 0) bar.style.opacity = '0.3';

            bar.onclick = () => {
                document.querySelectorAll('.chart-bar').forEach(b => b.classList.remove('active'));
                bar.classList.add('active');
                const info = document.getElementById('selected-day-info');
                if(info) info.innerText = `${i} ${monthName}: ${formatMoney(val)} تومان`;
            };

            wrapper.appendChild(bar);
            chartContainer.appendChild(wrapper);
        }
    }
    
    const info = document.getElementById('selected-day-info');
    if(info) info.innerText = '';

    renderBudgetCategories(filteredTrans, totalSum);
}

function renderBudgetCategories(transactions, totalSum) {
    const list = document.getElementById('budget-categories-list');
    if(!list) return;
    list.innerHTML = '';
    
    if (transactions.length === 0) {
        list.innerHTML = '<div style="text-align:center; opacity:0.5; font-size:12px; margin-top:20px;">داده‌ای یافت نشد</div>';
        return;
    }

    const tagMap = {};
    transactions.forEach(t => {
        const tags = (t.tags && t.tags.length > 0) ? t.tags : ['#سایر'];
        // Use the first tag as primary category
        const primaryTag = tags[0];
        tagMap[primaryTag] = (tagMap[primaryTag] || 0) + parseInt(t.amount);
    });

    const sortedTags = Object.keys(tagMap).map(key => ({
        tag: key,
        amount: tagMap[key]
    })).sort((a,b) => b.amount - a.amount);

    sortedTags.forEach(item => {
        const percent = totalSum > 0 ? Math.round((item.amount / totalSum) * 100) : 0;
        
        const row = document.createElement('div');
        row.className = 'cat-row';
        row.innerHTML = `
            <div class="cat-info">
                <div class="cat-name-group">
                    <i class="material-icons cat-icon">label_outline</i>
                    <span>${item.tag.replace('#','')}</span>
                </div>
                <div>
                    <span style="font-weight:700; margin-left:10px;">${formatMoney(item.amount)} ریال</span>
                    <span style="opacity:0.7; font-size:11px;">${toPersianNum(percent)}٪</span>
                </div>
            </div>
            <div class="progress-bg">
                <div class="progress-fill" style="width:${percent}%"></div>
            </div>
        `;
        list.appendChild(row);
    });
}

// --- STANDARD VIEWS ---
function renderDashboard() {
    const totalBalanceEl = document.getElementById('total-balance');
    const total = state.accounts.reduce((sum, acc) => sum + acc.balance, 0);
    if(totalBalanceEl) totalBalanceEl.innerHTML = `${formatMoney(total)} <span class="currency">تومان</span>`;
    
    const accountsContainer = document.getElementById('accounts-container');
    if(accountsContainer) {
        accountsContainer.innerHTML = '';
        if (state.accounts.length === 0) accountsContainer.innerHTML = '<div style="color:white; opacity:0.7; padding:10px;">حسابی وجود ندارد</div>';
        state.accounts.forEach(acc => {
            const icon = acc.type === 'cash' ? 'account_balance_wallet' : 'credit_card';
            const el = document.createElement('div');
            el.className = 'account-card';
            el.innerHTML = `
                <div class="account-icon"><i class="material-icons">${icon}</i></div>
                <div class="account-name">${acc.name}</div>
                <div class="account-balance">${formatMoney(acc.balance)}</div>
            `;
            accountsContainer.appendChild(el);
        });
    }

    const recentContainer = document.getElementById('recent-transactions');
    if(recentContainer) {
        recentContainer.innerHTML = '';
        const recent = [...state.transactions].sort((a,b) => b.id - a.id).slice(0, 5);
        if (recent.length === 0) recentContainer.innerHTML = '<div class="empty-state"><i class="material-icons">receipt</i><br>تراکنشی ثبت نشده</div>';
        else recent.forEach(t => recentContainer.appendChild(createTransactionEl(t)));
    }
}

function renderHistory(filterText = '') {
    const container = document.getElementById('all-transactions');
    if(!container) return;
    container.innerHTML = '';
    const all = [...state.transactions].sort((a,b) => b.id - a.id);
    const filtered = all.filter(t => 
        t.title.includes(filterText) || 
        t.amount.toString().includes(filterText) ||
        toPersianNum(t.amount).includes(filterText) ||
        (t.tags && t.tags.some(tag => tag.includes(filterText)))
    );
    if (filtered.length === 0) container.innerHTML = '<div class="empty-state"><i class="material-icons">search_off</i><br>تراکنشی یافت نشد</div>';
    else filtered.forEach(t => container.appendChild(createTransactionEl(t)));
}

function createTransactionEl(t) {
    const div = document.createElement('div');
    div.className = 'transaction-item';
    let icon = 'help_outline', iconClass = '', amountColorClass = '', sign = '';

    if (t.type === 'expense') { icon = 'trending_down'; iconClass = 'bg-expense'; amountColorClass = 'expense'; sign = '-'; }
    else if (t.type === 'income') { icon = 'trending_up'; iconClass = 'bg-income'; amountColorClass = 'income'; sign = '+'; }
    else { icon = 'swap_horiz'; iconClass = 'bg-transfer'; amountColorClass = 'transfer'; sign = ''; }

    const tagsHtml = (t.tags || []).join(' ');

    div.innerHTML = `
        <div class="trans-icon-box ${iconClass}"><i class="material-icons">${icon}</i></div>
        <div class="trans-details">
            <div class="trans-title">${t.title}</div>
            <div class="trans-meta">
                <i class="material-icons" style="font-size:12px">account_balance_wallet</i>
                ${getAccountName(t.accountId)} 
                <span style="margin: 0 5px">•</span> ${toPersianNum(t.date)}
            </div>
            ${tagsHtml ? `<div style="font-size:11px; color:rgba(255,255,255,0.5); margin-top:4px;">${tagsHtml}</div>` : ''}
        </div>
        <div class="trans-amount ${amountColorClass}">${sign}${formatMoney(t.amount)}</div>
    `;
    return div;
}

function renderAccountsList() {
    const container = document.getElementById('accounts-list-full');
    if(!container) return;
    container.innerHTML = '';
    state.accounts.forEach(acc => {
        const div = document.createElement('div');
        div.className = 'account-manage-item';
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div class="account-icon" style="background:rgba(255,255,255,0.1)">
                    <i class="material-icons">${acc.type === 'cash' ? 'account_balance_wallet' : 'credit_card'}</i>
                </div>
                <div>
                    <div style="font-weight:700">${acc.name}</div>
                    <div style="font-size:12px; color:rgba(255,255,255,0.6)">موجودی: ${formatMoney(acc.balance)}</div>
                </div>
            </div>
            <div class="account-actions"><i class="material-icons" onclick="deleteAccount(${acc.id})">delete</i></div>
        `;
        container.appendChild(div);
    });
}

function getAccountName(id) {
    const acc = state.accounts.find(a => a.id == id);
    return acc ? acc.name : 'حذف شده';
}

// --- SELECTORS ---
window.openAccountSelect = function(inputId, title) {
    const listContainer = document.getElementById('selection-list');
    if(!listContainer) return;
    listContainer.innerHTML = '';
    const titleEl = document.getElementById('selection-title');
    if(titleEl) titleEl.innerText = title;
    
    state.accounts.forEach(acc => {
        const item = document.createElement('div');
        item.className = 'selection-item';
        item.innerHTML = `
            <i class="material-icons">${acc.type === 'cash' ? 'account_balance_wallet' : 'credit_card'}</i>
            <div><div style="font-weight:500">${acc.name}</div><div style="font-size:11px; color:rgba(255,255,255,0.5)">${formatMoney(acc.balance)} تومان</div></div>
        `;
        item.onclick = () => {
            const input = document.getElementById(inputId);
            const trigger = document.getElementById('trigger-' + inputId);
            if(input) input.value = acc.id;
            if(trigger) {
                trigger.innerText = acc.name;
                trigger.style.color = '#fff';
            }
            closeModal('modal-selection');
        };
        listContainer.appendChild(item);
    });
    document.getElementById('modal-selection').style.display = 'flex';
}

window.openTypeSelect = function() {
    const listContainer = document.getElementById('selection-list');
    if(!listContainer) return;
    listContainer.innerHTML = '';
    const titleEl = document.getElementById('selection-title');
    if(titleEl) titleEl.innerText = 'نوع حساب';
    
    [{val: 'card', name: 'کارت بانکی', icon: 'credit_card'}, {val: 'cash', name: 'کیف پول نقدی', icon: 'account_balance_wallet'}]
    .forEach(t => {
        const item = document.createElement('div');
        item.className = 'selection-item';
        item.innerHTML = `<i class="material-icons">${t.icon}</i><div>${t.name}</div>`;
        item.onclick = () => {
            const input = document.getElementById('acc-type');
            const trigger = document.getElementById('trigger-acc-type');
            if(input) input.value = t.val;
            if(trigger) trigger.innerText = t.name;
            closeModal('modal-selection');
        };
        listContainer.appendChild(item);
    });
    document.getElementById('modal-selection').style.display = 'flex';
}

// --- ACTIONS & NAV ---
function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    const view = document.getElementById(`view-${viewName}`);
    if(view) view.classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    // If budget, highlight report nav
    const navTarget = viewName === 'budget' ? 'history' : viewName;
    const navItem = document.getElementById(`nav-${navTarget}`);
    if(navItem) navItem.classList.add('active');

    if(viewName === 'dashboard') renderDashboard();
    if(viewName === 'history') renderHistory();
    if(viewName === 'budget') renderBudgetView();
    if(viewName === 'accounts') renderAccountsList();
    if(viewName === 'settings') {
        // storage calc
        let total = 0;
        for (let x in localStorage) { if (Object.prototype.hasOwnProperty.call(localStorage, x)) total += (localStorage[x].length + x.length) * 2; }
        const storageEl = document.getElementById('storage-usage');
        if(storageEl) storageEl.innerText = `فضای اشغال شده: ${toPersianNum((total / 1024).toFixed(2))} کیلوبایت`;
    }
}

window.setTransType = function(type) {
    state.currentTransType = type;
    document.querySelectorAll('.type-option').forEach(el => el.classList.remove('selected'));
    const opt = document.getElementById(`opt-${type}`);
    if(opt) opt.classList.add('selected');
    
    const targetGroup = document.getElementById('target-account-group');
    if(targetGroup) targetGroup.style.display = (type === 'transfer') ? 'block' : 'none';
}

function saveTransaction(e) {
    e.preventDefault();
    const amount = cleanNumber(document.getElementById('trans-amount').value);
    const title = document.getElementById('trans-title').value;
    const accId = parseInt(document.getElementById('trans-account').value);
    const targetId = parseInt(document.getElementById('trans-target-account').value);
    const tagsInput = document.getElementById('trans-tags').value;
    let tags = (tagsInput && tagsInput.trim().length > 0) ? tagsInput.trim().split(/[\s,]+/).slice(0,3).map(t => t.startsWith('#')?t:'#'+t) : ['#سایر'];

    if (!amount || !title) { showToast('لطفا مبلغ و عنوان را وارد کنید', 'error'); return; }
    if (!accId) { showToast('لطفا حساب مبدا را انتخاب کنید', 'error'); return; }
    if (state.currentTransType === 'transfer' && (!targetId || accId === targetId)) { showToast('حساب مقصد نامعتبر است', 'error'); return; }

    const srcAcc = state.accounts.find(a => a.id === accId);
    if(srcAcc) {
        if (state.currentTransType === 'expense') srcAcc.balance -= amount;
        else if (state.currentTransType === 'income') srcAcc.balance += amount;
        else {
            srcAcc.balance -= amount;
            const destAcc = state.accounts.find(a => a.id === targetId);
            if(destAcc) destAcc.balance += amount;
        }
    }

    const newTrans = {
        id: Date.now(),
        type: state.currentTransType,
        amount: amount,
        title: title,
        tags: tags,
        accountId: accId,
        targetAccountId: state.currentTransType === 'transfer' ? targetId : null,
        date: new Date().toLocaleDateString('fa-IR'),
        timestamp: Date.now()
    };

    state.transactions.unshift(newTrans);
    saveData();
    closeModal('modal-transaction');
    
    const form = document.getElementById('form-transaction');
    if(form) form.reset();
    
    const triggerSrc = document.getElementById('trigger-trans-account');
    if(triggerSrc) triggerSrc.innerText = 'انتخاب کنید...';
    
    const inputSrc = document.getElementById('trans-account');
    if(inputSrc) inputSrc.value = '';
    
    showToast('تراکنش با موفقیت ثبت شد', 'success');
}

function saveAccount(e) {
    e.preventDefault();
    const name = document.getElementById('acc-name').value;
    const balance = cleanNumber(document.getElementById('acc-balance').value);
    const type = document.getElementById('acc-type').value;
    state.accounts.push({ id: Date.now(), name: name, type: type, balance: balance });
    saveData();
    closeModal('modal-account');
    const form = document.getElementById('form-account');
    if(form) form.reset();
    showToast('حساب جدید ایجاد شد', 'success');
}

window.deleteAccount = function(id) {
    if(state.accounts.length <= 1) { showToast('نمی‌توانید آخرین حساب را حذف کنید', 'error'); return; }
    showConfirm('حذف حساب', 'آیا از حذف این حساب مطمئن هستید؟', () => {
        state.accounts = state.accounts.filter(a => a.id !== id);
        saveData();
        showToast('حساب حذف شد', 'success');
    });
}

window.filterTransactions = function() { renderHistory(document.getElementById('transaction-search').value); }
window.openAddTransactionModal = function() { 
    const input = document.getElementById('trans-account');
    const trigger = document.getElementById('trigger-trans-account');
    if(input && !input.value && trigger) trigger.innerText = 'انتخاب کنید...';
    document.getElementById('modal-transaction').style.display = 'flex'; 
}
window.openAddAccountModal = function() { document.getElementById('modal-account').style.display = 'flex'; }
window.closeModal = function(id) { document.getElementById(id).style.display = 'none'; }
window.resetAppData = function() { showConfirm('حذف کل اطلاعات', 'آیا مطمئن هستید؟', () => { localStorage.removeItem(DB_NAME); location.reload(); }); }
window.backupData = function() {
    const dataStr = localStorage.getItem(DB_NAME);
    if (!dataStr) { showToast('هیچ داده‌ای وجود ندارد', 'error'); return; }
    const blob = new Blob([JSON.stringify(JSON.parse(dataStr), null, 2)], {type : 'application/json'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Paydo_Backup_${new Date().toLocaleDateString('fa-IR').replace(/\//g,'-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
window.restoreData = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsedData = JSON.parse(e.target.result);
            if (!parsedData.accounts || !parsedData.transactions) throw new Error();
            showConfirm('بازیابی', 'اطلاعات فعلی حذف و جایگزین می‌شوند. ادامه می‌دهید؟', () => {
                localStorage.setItem(DB_NAME, JSON.stringify(parsedData));
                location.reload();
            });
        } catch (err) { showToast('فایل نامعتبر است', 'error'); }
        input.value = '';
    };
    reader.readAsText(file);
}
window.checkForUpdate = function() { showConfirm('بروزرسانی', 'برنامه مجدداً بارگذاری می‌شود.', () => location.reload(true)); }

// CATEGORIES LOGIC
window.openCategoriesModal = function() {
    const container = document.getElementById('categories-list');
    if(!container) return;
    container.innerHTML = '';
    const tagCounts = {};
    state.transactions.forEach(t => (t.tags || []).forEach(tag => tagCounts[tag] = (tagCounts[tag] || 0) + 1));
    const tags = Object.keys(tagCounts).sort();
    if (tags.length === 0) container.innerHTML = '<div class="empty-state">دسته بندی وجود ندارد</div>';
    else {
        tags.forEach(tag => {
            const div = document.createElement('div');
            div.className = 'account-manage-item';
            div.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><div class="account-icon"><i class="material-icons">label</i></div><div><div style="font-weight:700">${tag}</div><div style="font-size:12px;opacity:0.6">${toPersianNum(tagCounts[tag])} تراکنش</div></div></div><div class="account-actions"><i class="material-icons" onclick="deleteTag('${tag}')">delete</i></div>`;
            container.appendChild(div);
        });
    }
    document.getElementById('modal-categories').style.display = 'flex';
}
window.deleteTag = function(tag) {
    showConfirm('حذف تگ', `تگ ${tag} حذف شود؟`, () => {
        state.transactions.forEach(t => { if(t.tags && t.tags.includes(tag)) { t.tags = t.tags.filter(x => x!==tag); if(t.tags.length===0) t.tags=['#سایر']; }});
        saveData();
        openCategoriesModal();
        showToast('حذف شد', 'success');
    });
}
