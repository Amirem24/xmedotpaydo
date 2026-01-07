// --- LOGGER & DEBUG SYSTEM ---
const appLogger = {
    logs: [],
    maxLogs: 100,
    log: function(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        this.logs.push(`[${timestamp}] [${type.toUpperCase()}] ${msg}`);
        if(this.logs.length > this.maxLogs) this.logs.shift();
        if(type === 'error') console.error(msg);
    },
    error: function(msg, err) {
        this.log(`${msg}: ${err?.message || err}`, 'error');
    },
    getLogs: function() {
        return this.logs.join('\n');
    }
};

window.onerror = function(msg, url, line) {
    appLogger.log(`${msg} (Line: ${line})`, 'error');
    return false;
};

// Footer Click Handler
let footerClickCount = 0;
let footerClickTimer;
window.handleFooterClick = function() {
    clearTimeout(footerClickTimer);
    footerClickCount++;
    if(footerClickCount >= 3) {
        showLogs();
        footerClickCount = 0;
    }
    footerClickTimer = setTimeout(() => { footerClickCount = 0; }, 1000);
};

window.showLogs = function() {
    document.getElementById('log-container').innerText = appLogger.getLogs();
    document.getElementById('modal-logs').style.display = 'flex';
};

window.copyLogs = function() {
    navigator.clipboard.writeText(appLogger.getLogs()).then(() => showToast('لاگ‌ها کپی شدند', 'success'));
};

// --- UTILS ---
const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function toPersianNum(num) { if (num === null || num === undefined) return ''; return num.toString().replace(/\d/g, x => farsiDigits[x]); }
function cleanNumber(str) { if (!str) return 0; const persianMap = {'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'}; let englishStr = str.toString().replace(/[۰-۹]/g, w => persianMap[w] || w); englishStr = englishStr.replace(/,/g, '').replace(/[^\d.-]/g, ''); return parseInt(englishStr) || 0; }
function formatMoney(amount) { if (amount === null || amount === undefined) return '۰'; const num = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); return toPersianNum(num); }
function getPersianDateParts(timestamp) { const date = new Date(timestamp); const formatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }); const parts = formatter.formatToParts(date); const y = parts.find(p => p.type === 'year').value; const m = parts.find(p => p.type === 'month').value; const d = parts.find(p => p.type === 'day').value; return { year: parseInt(y), month: parseInt(m), day: parseInt(d) }; }
function getPersianMonthName(monthIndex) { const months = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"]; return months[monthIndex - 1] || ""; }

function addPersianMonths(year, month, day, monthsToAdd) {
    let totalMonths = month + monthsToAdd;
    let newYear = year + Math.floor((totalMonths - 1) / 12);
    let newMonth = ((totalMonths - 1) % 12) + 1;
    let newDay = day;
    if (newMonth > 6 && newDay === 31) newDay = 30;
    if (newMonth === 12 && newDay > 29) newDay = 29; 
    return { year: newYear, month: newMonth, day: newDay };
}

// --- STATE ---
let state = {
    accounts: [{ id: 1, name: 'کیف پول نقدی', type: 'cash', balance: 0 }],
    transactions: [],
    assets: [], 
    loans: [], 
    currentTransType: 'expense',
    budgetMonthOffset: 0,
    budgetType: 'expense'
};

let editingAccountId = null;
let editingAssetId = null; 
let currentLoanId = null;
let editingInstallmentIndex = null;
const DB_NAME = 'poolaki_data_v2';

// --- UI UTILS ---
function showToast(message, type = 'info') { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = 'toast'; let icon = 'info'; if(type === 'success') icon = 'check_circle'; if(type === 'error') icon = 'error_outline'; toast.innerHTML = `<i class="material-icons" style="color:${type==='error'?'#ff5252':'#00e676'}">${icon}</i> ${message}`; container.appendChild(toast); setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(20px)'; setTimeout(() => toast.remove(), 300); }, 3000); }
function showConfirm(title, message, onYes) { document.getElementById('confirm-title').innerText = title; document.getElementById('confirm-message').innerText = message; const yesBtn = document.getElementById('btn-confirm-yes'); const newBtn = yesBtn.cloneNode(true); yesBtn.parentNode.replaceChild(newBtn, yesBtn); newBtn.addEventListener('click', () => { onYes(); closeModal('modal-confirm'); }); document.getElementById('modal-confirm').style.display = 'flex'; }
function updateLoading(percent, text) { document.getElementById('loading-bar').style.width = percent + '%'; if(text) document.getElementById('loading-text').innerText = text; }

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        updateLoading(10, 'در حال بارگذاری...');
        setTimeout(() => {
            loadData();
            updateLoading(40, 'خواندن اطلاعات...');
            setupInputFormatters();
            document.getElementById('form-transaction').addEventListener('submit', saveTransaction);
            document.getElementById('form-account').addEventListener('submit', saveAccount);
            document.getElementById('form-asset').addEventListener('submit', saveAsset);
            document.getElementById('form-loan').addEventListener('submit', saveLoan); 
            document.getElementById('form-edit-loan-main').addEventListener('submit', saveEditLoanMain);
            document.getElementById('form-edit-installment').addEventListener('submit', saveEditInstallment);
            document.getElementById('transaction-search').addEventListener('input', filterTransactions);
            
            const calcInstallment = () => {
                const total = cleanNumber(document.getElementById('loan-total').value);
                const count = parseInt(document.getElementById('loan-count').value) || 0;
                if(total > 0 && count > 0) {
                    document.getElementById('loan-installment-amount').value = formatMoney(Math.ceil(total / count));
                }
            };
            document.getElementById('loan-total').addEventListener('input', calcInstallment);
            document.getElementById('loan-count').addEventListener('input', calcInstallment);
            
            document.getElementById('btn-delete-loan').addEventListener('click', () => {
                 if(currentLoanId) deleteLoan(currentLoanId);
            });

            setTimeout(() => {
                renderDashboard();
                updateLoading(100, 'آماده‌سازی...');
                setTimeout(() => {
                    document.getElementById('loading-screen').style.opacity = '0';
                    setTimeout(() => document.getElementById('loading-screen').style.display = 'none', 500);
                    if (!localStorage.getItem('paydo_setup_complete')) {
                        document.getElementById('onboarding-screen').style.display = 'flex';
                        document.getElementById('app-container').style.opacity = '0';
                        renderAccountsList();
                    } else {
                        document.getElementById('app-container').style.opacity = '1';
                    }
                }, 600);
            }, 400);
        }, 300);
    } catch(e) {
        appLogger.error('Init Error', e);
    }
});

function loadData() {
    try {
        const saved = localStorage.getItem(DB_NAME);
        if (saved) { state = JSON.parse(saved); }
        if(!state.assets) state.assets = [];
        if(!state.loans) state.loans = [];
        if(typeof state.budgetMonthOffset === 'undefined') state.budgetMonthOffset = 0;
        if(typeof state.budgetType === 'undefined') state.budgetType = 'expense';
    } catch (e) { appLogger.error('Load Data Error', e); }
}

function saveData() {
    try {
        localStorage.setItem(DB_NAME, JSON.stringify(state));
        renderDashboard();
        if(document.getElementById('view-history').classList.contains('active')) renderHistory();
        if(document.getElementById('view-accounts').classList.contains('active')) renderAccountsList();
        if(document.getElementById('view-budget').classList.contains('active')) renderBudget();
        if(document.getElementById('view-assets').classList.contains('active')) renderAssets();
        if(document.getElementById('view-loans').classList.contains('active')) renderLoansList();
        if(document.getElementById('view-loan-details').classList.contains('active') && currentLoanId) renderLoanDetails(currentLoanId);
    } catch(e) { appLogger.error('Save Data Error', e); }
}

function setupInputFormatters() {
    document.querySelectorAll('.money-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const rawVal = cleanNumber(e.target.value);
            e.target.value = (rawVal === 0 && e.target.value.trim() === '') ? '' : formatMoney(rawVal);
        });
    });
}

// --- NAVIGATION ---
function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    let navId = '';
    if (viewName === 'dashboard') navId = 'nav-dashboard';
    if (viewName === 'history' || viewName === 'budget') navId = 'nav-history'; 
    if (viewName === 'settings' || viewName === 'accounts') navId = 'nav-settings';
    if (viewName === 'assets' || viewName === 'loans' || viewName === 'loan-details' || viewName === 'tools') navId = 'nav-tools';
    
    const navItem = document.getElementById(navId);
    if(navItem) navItem.classList.add('active');

    if(viewName === 'dashboard') renderDashboard();
    if(viewName === 'history') renderHistory();
    if(viewName === 'accounts') renderAccountsList();
    if(viewName === 'budget') renderBudget();
    if(viewName === 'settings') calculateStorage();
    if(viewName === 'assets') renderAssets();
    if(viewName === 'loans') renderLoansList();
}

// --- BUDGET ---
window.changeBudgetMonth = function(offset) { state.budgetMonthOffset += offset; renderBudget(); }
window.setBudgetTab = function(type) { state.budgetType = type; document.getElementById('tab-budget-expense').classList.toggle('active', type === 'expense'); document.getElementById('tab-budget-income').classList.toggle('active', type === 'income'); renderBudget(); }
function renderBudget() {
    const now = new Date();
    const currentPersian = getPersianDateParts(now.getTime());
    const targetDate = addPersianMonths(currentPersian.year, currentPersian.month, 1, state.budgetMonthOffset); // Day ignored here
    
    document.getElementById('budget-month-label').innerText = `${getPersianMonthName(targetDate.month)} ${toPersianNum(targetDate.year)}`;

    const filtered = state.transactions.filter(t => {
        if (t.type !== state.budgetType) return false;
        const tDate = getPersianDateParts(t.timestamp);
        return tDate.year === targetDate.year && tDate.month === targetDate.month;
    });

    const totalAmount = filtered.reduce((sum, t) => sum + t.amount, 0);
    document.getElementById('budget-total-amount').innerHTML = `${formatMoney(totalAmount)} <span style="font-size:14px; font-weight:400">تومان</span>`;
    document.getElementById('budget-total-label').innerText = state.budgetType === 'expense' ? 'مجموع هزینه این ماه' : 'مجموع درآمد این ماه';

    const daysInMonth = (targetDate.month <= 6) ? 31 : (targetDate.month === 12 ? 29 : 30);
    const dailyData = new Array(daysInMonth + 1).fill(0);
    filtered.forEach(t => {
        const d = getPersianDateParts(t.timestamp).day;
        if(d <= daysInMonth) dailyData[d] += t.amount;
    });

    const chartContainer = document.getElementById('chart-bars-area');
    chartContainer.innerHTML = '';
    const maxVal = Math.max(...dailyData) || 1;

    for (let i = 1; i <= daysInMonth; i++) {
        const amount = dailyData[i];
        const percent = (amount / maxVal) * 100;
        const bar = document.createElement('div');
        bar.className = `chart-bar ${amount === 0 ? 'empty' : ''}`;
        bar.style.height = `${Math.max(percent, amount > 0 ? 5 : 0)}%`;
        if(state.budgetType === 'income') bar.style.backgroundColor = '#00e676';
        bar.onclick = (e) => {
            const tooltip = document.getElementById('chart-tooltip');
            document.querySelectorAll('.chart-bar').forEach(b => b.classList.remove('active'));
            bar.classList.add('active');
            tooltip.style.opacity = '1';
            tooltip.innerHTML = `${toPersianNum(i)} ${getPersianMonthName(targetDate.month)}<br>${formatMoney(amount)} ت`;
            const rect = bar.getBoundingClientRect();
            const containerRect = document.querySelector('.chart-container').getBoundingClientRect();
            tooltip.style.left = (rect.left - containerRect.left + rect.width/2) + 'px';
            tooltip.style.top = (rect.top - containerRect.top) + 'px';
        };
        chartContainer.appendChild(bar);
    }
    
    document.addEventListener('click', (e) => {
        if(!e.target.closest('.chart-bar')) {
             document.getElementById('chart-tooltip').style.opacity = '0';
             document.querySelectorAll('.chart-bar').forEach(b => b.classList.remove('active'));
        }
    });

    const catContainer = document.getElementById('budget-categories-list');
    catContainer.innerHTML = '';
    const catTotals = {};
    filtered.forEach(t => {
        const tag = (t.tags && t.tags.length > 0) ? t.tags[0] : '#سایر';
        catTotals[tag] = (catTotals[tag] || 0) + t.amount;
    });

    const sortedCats = Object.entries(catTotals).sort((a,b) => b[1] - a[1]);
    if (sortedCats.length === 0) {
        catContainer.innerHTML = '<div style="text-align:center; opacity:0.5; font-size:12px; margin-top:20px;">داده‌ای برای نمایش وجود ندارد</div>';
    } else {
        sortedCats.forEach(([name, amount]) => {
            const percent = (amount / totalAmount) * 100;
            const div = document.createElement('div');
            div.className = 'cat-row';
            div.innerHTML = `
                <div class="cat-header"><span class="cat-name"><i class="material-icons" style="font-size:14px; opacity:0.7">label</i> ${name}</span><span class="cat-amount">${formatMoney(amount)} <span style="font-size:10px; opacity:0.7">%${toPersianNum(percent.toFixed(0))}</span></span></div>
                <div class="cat-progress-bg"><div class="cat-progress-fill" style="width: ${percent}%; background-color: ${state.budgetType==='income'?'#00e676':'#448aff'}"></div></div>
            `;
            catContainer.appendChild(div);
        });
    }
}

// --- LOANS LOGIC (IMPROVED) ---
function renderLoansList() {
    const container = document.getElementById('loans-list-container');
    container.innerHTML = '';
    if (state.loans.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="material-icons">account_balance</i><br>وامی ثبت نشده است</div>';
    } else {
        state.loans.forEach(loan => {
            const paidCount = loan.installments.filter(i => i.isPaid).length;
            const totalCount = loan.installments.length;
            const progress = (paidCount / totalCount) * 100;
            const lastInstallment = loan.installments[totalCount - 1];
            const div = document.createElement('div');
            div.className = 'loan-card';
            div.onclick = () => openLoanDetails(loan.id);
            div.innerHTML = `
                <div class="loan-card-header">
                    <div class="loan-status-badge">${toPersianNum(paidCount)} از ${toPersianNum(totalCount)} پرداخت شده</div>
                    <div style="font-size:11px; opacity:0.6;">اتمام: ${toPersianNum(lastInstallment.year)}/${toPersianNum(lastInstallment.month)}/${toPersianNum(lastInstallment.day || 1)}</div>
                </div>
                <div class="loan-bank-name">${loan.bankName}</div>
                <div class="loan-title">${formatMoney(loan.totalAmount)} تومان</div>
                <div class="loan-progress-container">
                    <div class="loan-progress-bar">
                        <div class="loan-progress-fill" style="width: ${progress}%"></div>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });
    }
}

window.openAddLoanModal = function() { 
    document.getElementById('form-loan').reset(); 
    document.getElementById('loan-start-year').value = 1403;
    document.getElementById('loan-start-day').value = 1;
    document.getElementById('modal-loan').style.display = 'flex'; 
}

function saveLoan(e) {
    e.preventDefault();
    const bank = document.getElementById('loan-bank').value;
    const total = cleanNumber(document.getElementById('loan-total').value);
    const count = parseInt(document.getElementById('loan-count').value);
    const startYear = parseInt(document.getElementById('loan-start-year').value);
    const startMonth = parseInt(document.getElementById('loan-start-month').value);
    const startDay = parseInt(document.getElementById('loan-start-day').value) || 1;
    const instAmount = cleanNumber(document.getElementById('loan-installment-amount').value);
    
    if(!bank || !total || !count || !startYear || !startMonth || !instAmount) { showToast('لطفا همه فیلدها را پر کنید', 'error'); return; }
    
    let installments = [];
    for(let i = 0; i < count; i++) {
        const date = addPersianMonths(startYear, startMonth, startDay, i);
        installments.push({ id: i + 1, year: date.year, month: date.month, day: date.day, amount: instAmount, isPaid: false });
    }
    state.loans.push({ id: Date.now(), bankName: bank, totalAmount: total, installments: installments });
    saveData(); closeModal('modal-loan'); showToast('وام جدید ایجاد شد', 'success');
}

window.openLoanDetails = function(id) { currentLoanId = id; renderLoanDetails(id); switchView('loan-details'); }

function renderLoanDetails(id) {
    const loan = state.loans.find(l => l.id === id); if(!loan) return;
    const paidInst = loan.installments.filter(i => i.isPaid);
    const paidAmount = paidInst.reduce((sum, i) => sum + i.amount, 0);
    const remainingAmount = loan.totalAmount - paidAmount;
    
    document.getElementById('loan-summary-card').innerHTML = `
        <h2 style="margin-bottom:5px;">${loan.bankName}</h2>
        <div style="font-size:12px; opacity:0.8; margin-bottom:20px;">مبلغ کل: ${formatMoney(loan.totalAmount)} تومان</div>
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:13px;"><span>پرداختی شما</span><span style="font-weight:700">${formatMoney(paidAmount)}</span></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:13px;"><span>باقیمانده</span><span style="font-weight:700">${formatMoney(remainingAmount)}</span></div>
        <div style="background:rgba(0,0,0,0.2); border-radius:10px; padding:10px; font-size:12px;">${toPersianNum(paidInst.length)} از ${toPersianNum(loan.installments.length)} قسط پرداخت شده</div>
    `;
    
    const timeline = document.getElementById('loan-timeline');
    timeline.innerHTML = '';
    loan.installments.forEach((inst, index) => {
        const div = document.createElement('div');
        div.className = `timeline-item ${inst.isPaid ? 'paid' : ''}`;
        div.onclick = () => openEditInstallmentModal(index);
        div.innerHTML = `
            <div class="timeline-point"></div>
            <div class="timeline-date">${toPersianNum(inst.day || 1)} ${getPersianMonthName(inst.month)} ${toPersianNum(inst.year)}</div>
            <div class="timeline-card">
                <div class="timeline-header"><span class="timeline-title">قسط ${toPersianNum(inst.id)}</span><span class="timeline-amount">${formatMoney(inst.amount)}</span></div>
                <div class="timeline-status">${inst.isPaid ? '<i class="material-icons" style="font-size:12px">check_circle</i> پرداخت شده' : '<i class="material-icons" style="font-size:12px">radio_button_unchecked</i> پرداخت نشده'}</div>
            </div>
        `;
        timeline.appendChild(div);
    });
}

// Edit Loan Main Info
window.openEditLoanMainModal = function() {
    const loan = state.loans.find(l => l.id === currentLoanId);
    if(!loan) return;
    document.getElementById('edit-loan-bank').value = loan.bankName;
    document.getElementById('edit-loan-total').value = formatMoney(loan.totalAmount);
    document.getElementById('modal-edit-loan-main').style.display = 'flex';
}

window.saveEditLoanMain = function(e) {
    e.preventDefault();
    const loan = state.loans.find(l => l.id === currentLoanId);
    if(loan) {
        loan.bankName = document.getElementById('edit-loan-bank').value;
        loan.totalAmount = cleanNumber(document.getElementById('edit-loan-total').value);
        saveData();
        closeModal('modal-edit-loan-main');
        showToast('اطلاعات وام بروز شد', 'success');
    }
}

// Edit Installment
window.openEditInstallmentModal = function(index) {
    editingInstallmentIndex = index;
    const loan = state.loans.find(l => l.id === currentLoanId);
    const inst = loan.installments[index];
    
    document.getElementById('edit-inst-index').value = index;
    document.getElementById('edit-inst-year').value = inst.year;
    document.getElementById('edit-inst-month').value = inst.month;
    document.getElementById('edit-inst-day').value = inst.day || 1;
    document.getElementById('edit-inst-amount').value = formatMoney(inst.amount);
    
    let existingCheckbox = document.getElementById('opt-inst-paid');
    if(!existingCheckbox) {
       const div = document.createElement('div');
       div.className = 'form-group';
       div.innerHTML = `<label class="form-label">وضعیت پرداخت</label><div class="type-selector"><div class="type-option" id="opt-inst-paid" onclick="toggleInstPaidStatus(true)">پرداخت شده</div><div class="type-option" id="opt-inst-unpaid" onclick="toggleInstPaidStatus(false)">پرداخت نشده</div></div>`;
       document.getElementById('form-edit-installment').insertBefore(div, document.getElementById('form-edit-installment').lastElementChild);
    }
    
    toggleInstPaidStatus(inst.isPaid);
    document.getElementById('modal-edit-installment').style.display = 'flex';
}

window.toggleInstPaidStatus = function(isPaid) {
    document.getElementById('opt-inst-paid').classList.toggle('selected', isPaid);
    document.getElementById('opt-inst-unpaid').classList.toggle('selected', !isPaid);
    document.getElementById('form-edit-installment').dataset.status = isPaid;
}

window.saveEditInstallment = function(e) {
    e.preventDefault();
    const loan = state.loans.find(l => l.id === currentLoanId);
    const idx = editingInstallmentIndex;
    if(loan && loan.installments[idx]) {
        loan.installments[idx].year = parseInt(document.getElementById('edit-inst-year').value);
        loan.installments[idx].month = parseInt(document.getElementById('edit-inst-month').value);
        loan.installments[idx].day = parseInt(document.getElementById('edit-inst-day').value);
        loan.installments[idx].amount = cleanNumber(document.getElementById('edit-inst-amount').value);
        loan.installments[idx].isPaid = document.getElementById('form-edit-installment').dataset.status === 'true';
        
        saveData();
        closeModal('modal-edit-installment');
        showToast('قسط ویرایش شد', 'success');
    }
}

window.deleteCurrentInstallment = function() {
    showConfirm('حذف قسط', 'آیا مطمئن هستید؟', () => {
        const loan = state.loans.find(l => l.id === currentLoanId);
        if(loan) {
            loan.installments.splice(editingInstallmentIndex, 1);
            // Re-index IDs
            loan.installments.forEach((inst, i) => inst.id = i + 1);
            saveData();
            closeModal('modal-edit-installment');
            showToast('قسط حذف شد', 'success');
        }
    });
}

window.openAddInstallmentModal = function() {
    const loan = state.loans.find(l => l.id === currentLoanId);
    if(!loan) return;
    
    const last = loan.installments[loan.installments.length - 1];
    const newInst = {
        id: loan.installments.length + 1,
        year: last ? last.year : 1403,
        month: last ? (last.month < 12 ? last.month + 1 : 1) : 1,
        day: last ? last.day : 1,
        amount: last ? last.amount : 0,
        isPaid: false
    };
    if (last && last.month === 12) newInst.year++;
    
    loan.installments.push(newInst);
    saveData();
    openEditInstallmentModal(loan.installments.length - 1); 
}

window.deleteLoan = function(id) { showConfirm('حذف وام', 'آیا از حذف این وام و تاریخچه اقساط آن مطمئن هستید؟', () => { state.loans = state.loans.filter(l => l.id !== id); saveData(); showToast('وام حذف شد', 'success'); switchView('loans'); }); }

// --- FORCE UPDATE ---
window.checkForUpdate = function() {
    showConfirm('بروزرسانی', 'آیا می‌خواهید نسخه جدید را دریافت کنید؟ برنامه مجددا راه اندازی می‌شود.', () => {
        updateLoading(50, 'پاکسازی کش...');
        document.getElementById('loading-screen').style.display = 'flex';
        document.getElementById('loading-screen').style.opacity = '1';
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) {
                    registration.unregister();
                }
            });
        }
        
        if ('caches' in window) {
            caches.keys().then(function(names) {
                for (let name of names) caches.delete(name);
            });
        }
        
        setTimeout(() => {
            window.location.reload(true);
        }, 1000);
    });
}

// --- STANDARD FUNCTIONS ---
window.nextOnboarding = function() { document.getElementById('slide-welcome').classList.remove('active'); document.getElementById('slide-setup').classList.add('active'); }
window.prevOnboarding = function() { document.getElementById('slide-setup').classList.remove('active'); document.getElementById('slide-welcome').classList.add('active'); }
window.finishOnboarding = function() { localStorage.setItem('paydo_setup_complete', 'true'); document.getElementById('onboarding-screen').style.transition = 'opacity 0.5s'; document.getElementById('onboarding-screen').style.opacity = '0'; document.getElementById('app-container').style.opacity = '1'; setTimeout(() => { document.getElementById('onboarding-screen').style.display = 'none'; }, 500); }
window.openAccountSelect = function(inputId, title) { const listContainer = document.getElementById('selection-list'); listContainer.innerHTML = ''; document.getElementById('selection-title').innerText = title; state.accounts.forEach(acc => { const item = document.createElement('div'); item.className = 'selection-item'; item.innerHTML = `<i class="material-icons">${acc.type === 'cash' ? 'account_balance_wallet' : 'credit_card'}</i><div><div style="font-weight:500">${acc.name}</div><div style="font-size:11px; color:rgba(255,255,255,0.5)">${formatMoney(acc.balance)} تومان</div></div>`; item.onclick = () => { document.getElementById(inputId).value = acc.id; document.getElementById('trigger-' + inputId).innerText = acc.name; document.getElementById('trigger-' + inputId).style.color = '#fff'; closeModal('modal-selection'); }; listContainer.appendChild(item); }); document.getElementById('modal-selection').style.display = 'flex'; }
window.openTypeSelect = function() { const listContainer = document.getElementById('selection-list'); listContainer.innerHTML = ''; document.getElementById('selection-title').innerText = 'نوع حساب'; [{val: 'card', name: 'کارت بانکی', icon: 'credit_card'}, {val: 'cash', name: 'کیف پول نقدی', icon: 'account_balance_wallet'}].forEach(t => { const item = document.createElement('div'); item.className = 'selection-item'; item.innerHTML = `<i class="material-icons">${t.icon}</i><div>${t.name}</div>`; item.onclick = () => { document.getElementById('acc-type').value = t.val; document.getElementById('trigger-acc-type').innerText = t.name; closeModal('modal-selection'); }; listContainer.appendChild(item); }); document.getElementById('modal-selection').style.display = 'flex'; }
function renderDashboard() { 
    const total = state.accounts.reduce((sum, acc) => sum + acc.balance, 0); 
    document.getElementById('total-balance').innerHTML = `${formatMoney(total)} <span class="currency">تومان</span>`; 
    
    const accountsContainer = document.getElementById('accounts-container'); accountsContainer.innerHTML = ''; 
    if (state.accounts.length === 0) accountsContainer.innerHTML = '<div style="color:white; opacity:0.7; padding:10px;">حسابی وجود ندارد</div>'; 
    state.accounts.forEach(acc => { const el = document.createElement('div'); el.className = 'account-card'; el.innerHTML = `<div class="account-icon"><i class="material-icons">${acc.type === 'cash' ? 'account_balance_wallet' : 'credit_card'}</i></div><div class="account-name">${acc.name}</div><div class="account-balance">${formatMoney(acc.balance)}</div>`; accountsContainer.appendChild(el); }); 
    
    const recentContainer = document.getElementById('recent-transactions'); recentContainer.innerHTML = ''; 
    const recent = [...state.transactions].sort((a,b) => b.timestamp - a.timestamp).slice(0, 5); 
    if (recent.length === 0) recentContainer.innerHTML = '<div class="empty-state"><i class="material-icons">receipt</i><br>تراکنشی ثبت نشده</div>'; 
    else recent.forEach(t => recentContainer.appendChild(createTransactionEl(t))); 
}
function renderHistory(filterText = '') { const container = document.getElementById('all-transactions'); container.innerHTML = ''; const all = [...state.transactions].sort((a,b) => b.timestamp - a.timestamp); const filtered = all.filter(t => t.title.includes(filterText) || t.amount.toString().includes(filterText) || toPersianNum(t.amount).includes(filterText) || (t.tags && t.tags.some(tag => tag.includes(filterText)))); if (filtered.length === 0) container.innerHTML = '<div class="empty-state"><i class="material-icons">search_off</i><br>تراکنشی یافت نشد</div>'; else filtered.forEach(t => container.appendChild(createTransactionEl(t))); }
function createTransactionEl(t) { const div = document.createElement('div'); div.className = 'transaction-item'; let iconClass = '', icon = 'help_outline', amountColorClass = '', sign = ''; if (t.type === 'expense') { icon = 'trending_down'; iconClass = 'bg-expense'; amountColorClass = 'expense'; sign = '-'; } else if (t.type === 'income') { icon = 'trending_up'; iconClass = 'bg-income'; amountColorClass = 'income'; sign = '+'; } else { icon = 'swap_horiz'; iconClass = 'bg-transfer'; amountColorClass = 'transfer'; sign = ''; } const tagsHtml = (t.tags || []).join(' '); div.innerHTML = ` <div class="trans-icon-box ${iconClass}"><i class="material-icons">${icon}</i></div> <div class="trans-details"> <div class="trans-title">${t.title}</div> <div class="trans-meta"><i class="material-icons" style="font-size:12px">account_balance_wallet</i> ${getAccountName(t.accountId)} ${t.targetAccountId ? `<i class="material-icons" style="font-size:12px; margin-right:5px">arrow_back</i> ${getAccountName(t.targetAccountId)}` : ''} <span style="margin: 0 5px">•</span> ${toPersianNum(t.date)}</div> ${tagsHtml ? `<div style="font-size:11px; color:rgba(255,255,255,0.5); margin-top:4px;">${tagsHtml}</div>` : ''} </div> <div class="trans-amount ${amountColorClass}">${sign}${formatMoney(t.amount)}</div>`; return div; }
function renderAccountsList() { const generateItemHTML = (acc) => ` <div style="display:flex; align-items:center; gap:10px;"> <div class="account-icon" style="background:rgba(255,255,255,0.1)"><i class="material-icons">${acc.type === 'cash' ? 'account_balance_wallet' : 'credit_card'}</i></div> <div><div style="font-weight:700">${acc.name}</div><div style="font-size:12px; color:rgba(255,255,255,0.6)">موجودی: ${formatMoney(acc.balance)}</div></div> </div> <div class="account-actions"><i class="material-icons" onclick="openEditAccountModal(${acc.id})">edit</i><i class="material-icons" onclick="deleteAccount(${acc.id})">delete</i></div> `; const containerFull = document.getElementById('accounts-list-full'); containerFull.innerHTML = ''; state.accounts.forEach(acc => { const div = document.createElement('div'); div.className = 'account-manage-item'; div.innerHTML = generateItemHTML(acc); containerFull.appendChild(div); }); const containerOnboard = document.getElementById('onboard-accounts-list'); if(containerOnboard) { containerOnboard.innerHTML = ''; state.accounts.forEach(acc => { const div = document.createElement('div'); div.className = 'account-manage-item'; div.innerHTML = generateItemHTML(acc); containerOnboard.appendChild(div); }); } }
window.openCategoriesModal = function() { const container = document.getElementById('categories-list'); container.innerHTML = ''; const tagCounts = {}; state.transactions.forEach(t => (t.tags || []).forEach(tag => tagCounts[tag] = (tagCounts[tag] || 0) + 1)); const tags = Object.keys(tagCounts).sort(); if (tags.length === 0) container.innerHTML = '<div class="empty-state"><i class="material-icons">label_off</i><br>دسته بندی وجود ندارد</div>'; else tags.forEach(tag => { const div = document.createElement('div'); div.className = 'account-manage-item'; div.innerHTML = `<div style="display:flex; align-items:center; gap:10px;"><div class="account-icon" style="background:rgba(255,255,255,0.1)"><i class="material-icons">label</i></div><div><div style="font-weight:700">${tag}</div><div style="font-size:12px; color:rgba(255,255,255,0.6)">${toPersianNum(tagCounts[tag])} تراکنش</div></div></div><div class="account-actions"><i class="material-icons" onclick="deleteTag('${tag}')">delete</i></div>`; container.appendChild(div); }); document.getElementById('modal-categories').style.display = 'flex'; }
window.deleteTag = function(tag) { showConfirm('حذف دسته‌بندی', `آیا از حذف ${tag} مطمئن هستید؟`, () => { let modified = false; state.transactions.forEach(t => { if (t.tags && t.tags.includes(tag)) { t.tags = t.tags.filter(x => x !== tag); if (t.tags.length === 0) t.tags = ['#سایر']; modified = true; } }); if (modified) { saveData(); window.openCategoriesModal(); showToast('دسته‌بندی حذف شد', 'success'); } }); }
function getAccountName(id) { const acc = state.accounts.find(a => a.id == id); return acc ? acc.name : 'حذف شده'; }
function calculateStorage() { let total = 0; for (let x in localStorage) { if (Object.prototype.hasOwnProperty.call(localStorage, x)) total += (localStorage[x].length + x.length) * 2; } document.getElementById('storage-usage').innerText = `فضای اشغال شده: ${toPersianNum((total / 1024).toFixed(2))} کیلوبایت`; }
window.resetAppData = function() { showConfirm('حذف کل اطلاعات', 'آیا مطمئن هستید؟', () => { localStorage.removeItem(DB_NAME); localStorage.removeItem('paydo_setup_complete'); location.reload(); }); }
window.backupData = function() { const dataStr = localStorage.getItem(DB_NAME); if (!dataStr) { showToast('هیچ داده‌ای نیست', 'error'); return; } const blob = new Blob([JSON.stringify(JSON.parse(dataStr), null, 2)], {type : 'application/json'}); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `Paydo_Backup_${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast('دانلود شد', 'success'); }
window.restoreData = function(input) { const file = input.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = function(e) { try { const parsed = JSON.parse(e.target.result); if (!parsed.accounts || !parsed.transactions) throw new Error(); showConfirm('بازیابی', 'اطلاعات فعلی جایگزین می‌شود.', () => { localStorage.setItem(DB_NAME, JSON.stringify(parsed)); showToast('بازیابی شد', 'success'); setTimeout(() => location.reload(), 1000); }); } catch { showToast('فایل نامعتبر', 'error'); } finally { input.value = ''; } }; reader.readAsText(file); }
window.setTransType = function(type) { state.currentTransType = type; document.querySelectorAll('.type-option').forEach(el => el.classList.remove('selected')); document.getElementById(`opt-${type}`).classList.add('selected'); document.getElementById('target-account-group').style.display = type === 'transfer' ? 'block' : 'none'; }
function saveTransaction(e) { e.preventDefault(); const amount = cleanNumber(document.getElementById('trans-amount').value); const title = document.getElementById('trans-title').value; const accId = parseInt(document.getElementById('trans-account').value); const targetId = parseInt(document.getElementById('trans-target-account').value); const tagsInput = document.getElementById('trans-tags').value; let tags = (tagsInput && tagsInput.trim().length > 0) ? tagsInput.trim().split(/[\s,]+/).slice(0, 3).map(t => t.startsWith('#') ? t : '#' + t) : ['#سایر']; if (!amount || !title) { showToast('مبلغ و عنوان الزامی است', 'error'); return; } if (!accId) { showToast('حساب مبدا را انتخاب کنید', 'error'); return; } if (state.currentTransType === 'transfer' && !targetId) { showToast('حساب مقصد را انتخاب کنید', 'error'); return; } if (state.currentTransType === 'transfer' && accId === targetId) { showToast('مبدا و مقصد نمی‌تواند یکی باشد', 'error'); return; } const srcAcc = state.accounts.find(a => a.id === accId); if (state.currentTransType === 'expense') srcAcc.balance -= amount; else if (state.currentTransType === 'income') srcAcc.balance += amount; else if (state.currentTransType === 'transfer') { srcAcc.balance -= amount; const destAcc = state.accounts.find(a => a.id === targetId); if(destAcc) destAcc.balance += amount; } state.transactions.unshift({ id: Date.now(), type: state.currentTransType, amount: amount, title: title, tags: tags, accountId: accId, targetAccountId: state.currentTransType === 'transfer' ? targetId : null, date: new Date().toLocaleDateString('fa-IR'), timestamp: Date.now() }); saveData(); closeModal('modal-transaction'); document.getElementById('form-transaction').reset(); document.getElementById('trigger-trans-account').innerText = 'انتخاب کنید...'; document.getElementById('trans-account').value = ''; document.getElementById('trigger-trans-target-account').innerText = 'انتخاب کنید...'; document.getElementById('trans-target-account').value = ''; document.getElementById('trans-amount').value = ''; showToast('ثبت شد', 'success'); }
window.openAddAccountModal = function() { editingAccountId = null; document.getElementById('modal-account-title').innerText = 'افزودن حساب جدید'; document.getElementById('btn-save-account').innerText = 'ایجاد حساب'; document.getElementById('form-account').reset(); document.getElementById('trigger-acc-type').innerText = 'کارت بانکی'; document.getElementById('acc-type').value = 'card'; document.getElementById('acc-balance').value = '۰'; document.getElementById('modal-account').style.display = 'flex'; }
window.openEditAccountModal = function(id) { editingAccountId = id; const acc = state.accounts.find(a => a.id === id); if(!acc) return; document.getElementById('modal-account-title').innerText = 'ویرایش حساب'; document.getElementById('btn-save-account').innerText = 'ذخیره تغییرات'; document.getElementById('acc-name').value = acc.name; document.getElementById('acc-balance').value = formatMoney(acc.balance); document.getElementById('acc-type').value = acc.type; document.getElementById('trigger-acc-type').innerText = (acc.type === 'cash') ? 'کیف پول نقدی' : 'کارت بانکی'; document.getElementById('modal-account').style.display = 'flex'; }
function saveAccount(e) { e.preventDefault(); const name = document.getElementById('acc-name').value; const balance = cleanNumber(document.getElementById('acc-balance').value); const type = document.getElementById('acc-type').value; if (editingAccountId) { const accIndex = state.accounts.findIndex(a => a.id === editingAccountId); if(accIndex !== -1) { state.accounts[accIndex].name = name; state.accounts[accIndex].balance = balance; state.accounts[accIndex].type = type; showToast('حساب ویرایش شد', 'success'); } } else { state.accounts.push({ id: Date.now(), name: name, type: type, balance: balance }); showToast('حساب جدید ایجاد شد', 'success'); } saveData(); closeModal('modal-account'); document.getElementById('form-account').reset(); }
window.deleteAccount = function(id) { if(state.accounts.length <= 1) { showToast('حداقل یک حساب لازم است', 'error'); return; } showConfirm('حذف حساب', 'مطمئنید؟', () => { state.accounts = state.accounts.filter(a => a.id !== id); saveData(); showToast('حذف شد', 'success'); }); }
window.filterTransactions = function() { renderHistory(document.getElementById('transaction-search').value); }
window.openAddTransactionModal = function() { if(!document.getElementById('trans-account').value) document.getElementById('trigger-trans-account').innerText = 'انتخاب کنید...'; document.getElementById('modal-transaction').style.display = 'flex'; }
window.closeModal = function(id) { document.getElementById(id).style.display = 'none'; }
function renderAssets() { const container = document.getElementById('assets-list-container'); container.innerHTML = ''; let totalAssets = 0; if (state.assets.length === 0) { container.innerHTML = '<div class="empty-state"><i class="material-icons">monetization_on</i><br>دارایی ثبت نشده</div>'; } else { state.assets.forEach(asset => { totalAssets += asset.value; const div = document.createElement('div'); div.className = 'account-manage-item'; div.innerHTML = ` <div style="display:flex; align-items:center; gap:10px;"> <div class="account-icon" style="background:rgba(255,215,0,0.15); color:#ffd700;"> <i class="material-icons">savings</i> </div> <div> <div style="font-weight:700">${asset.name}</div> <div style="font-size:12px; color:rgba(255,255,255,0.6)">ارزش: ${formatMoney(asset.value)} تومان</div> </div> </div> <div class="account-actions"> <i class="material-icons" onclick="openEditAssetModal(${asset.id})">edit</i> <i class="material-icons" onclick="deleteAsset(${asset.id})">delete</i> </div> `; container.appendChild(div); }); } document.getElementById('total-assets-value').innerHTML = `${formatMoney(totalAssets)} <span class="currency">تومان</span>`; }
window.openAddAssetModal = function() { editingAssetId = null; document.getElementById('modal-asset-title').innerText = 'افزودن دارایی'; document.getElementById('btn-save-asset').innerText = 'ذخیره دارایی'; document.getElementById('form-asset').reset(); document.getElementById('modal-asset').style.display = 'flex'; }
window.openEditAssetModal = function(id) { editingAssetId = id; const asset = state.assets.find(a => a.id === id); if(!asset) return; document.getElementById('modal-asset-title').innerText = 'ویرایش دارایی'; document.getElementById('btn-save-asset').innerText = 'ذخیره تغییرات'; document.getElementById('asset-name').value = asset.name; document.getElementById('asset-value').value = formatMoney(asset.value); document.getElementById('modal-asset').style.display = 'flex'; }
function saveAsset(e) { e.preventDefault(); const name = document.getElementById('asset-name').value; const value = cleanNumber(document.getElementById('asset-value').value); if (editingAssetId) { const idx = state.assets.findIndex(a => a.id === editingAssetId); if(idx !== -1) { state.assets[idx].name = name; state.assets[idx].value = value; showToast('دارایی ویرایش شد', 'success'); } } else { state.assets.push({ id: Date.now(), name: name, value: value }); showToast('دارایی جدید افزوده شد', 'success'); } saveData(); closeModal('modal-asset'); document.getElementById('form-asset').reset(); }
window.deleteAsset = function(id) { showConfirm('حذف دارایی', 'آیا از حذف این دارایی مطمئن هستید؟', () => { state.assets = state.assets.filter(a => a.id !== id); saveData(); showToast('دارایی حذف شد', 'success'); }); }
