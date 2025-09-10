document.addEventListener('DOMContentLoaded', () => {

    // --- ELEMENTOS DO DOM ---
    const loginScreen = document.getElementById('login-screen');
    const appContent = document.getElementById('app-content');
    const loginForm = document.getElementById('login-form');
    const mainContent = document.getElementById('main-content');
    const logoutButton = document.getElementById('logout-button');
    const mainNav = document.getElementById('main-nav');
    const menuToggle = document.getElementById('menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');

    // --- ESTADO DA APLICAÇÃO ---
    let state = {};
    
    // --- FUNÇÕES DE API (COMUNICAÇÃO COM O BACKEND) ---

    const loadDataFromServer = async () => {
        try {
            const response = await fetch('/api/data');
            if (!response.ok) throw new Error('Falha ao buscar dados do servidor');
            state = await response.json();
            // Garante que a estrutura de dados esteja sempre atualizada
            if (!state.centralCash) state.centralCash = { walletBalance: 0, transactions: [] };
            if (typeof state.centralCash.walletBalance !== 'number') state.centralCash.walletBalance = 0;
            if (!state.products) state.products = [];
            if (!state.pdvs) state.pdvs = [];
            if (!state.sales) state.sales = [];
            if (!state.accountsPayable) state.accountsPayable = [];
            if (!state.accountsReceivable) state.accountsReceivable = [];
            if (!state.goals) state.goals = {};

        } catch (error) {
            console.error(error);
            Swal.fire('Erro', 'Não foi possível carregar os dados. Tente recarregar a página.', 'error');
        }
    };

    const saveDataToServer = async () => {
        try {
            await fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state),
            });
        } catch (error) {
            console.error(error);
            Swal.fire('Erro', 'Não foi possível salvar os dados.', 'error');
        }
    };

    const formatCurrency = (value) => {
        if (typeof value !== 'number') return 'R$ 0,00';
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const generateId = () => `id_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`;

    // --- FUNÇÕES DE AUTENTICAÇÃO ---

    const checkAuth = () => sessionStorage.getItem('isLoggedIn') === 'true';

    const handleLogin = async (e) => {
        e.preventDefault();
        const username = loginForm.username.value;
        const password = loginForm.password.value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                sessionStorage.setItem('isLoggedIn', 'true');
                await initApp();
            } else {
                Swal.fire({ icon: 'error', title: 'Oops...', text: 'Usuário ou senha incorretos!' });
            }
        } catch (error) {
            Swal.fire('Erro de Conexão', 'Não foi possível conectar ao servidor.', 'error');
        }
    };
    
    const handleLogout = () => {
        sessionStorage.removeItem('isLoggedIn');
        loginScreen.style.display = 'flex';
        appContent.style.display = 'none';
    };

    // --- FUNÇÕES DE CÁLCULO E DADOS ---
    const getProduct = (productId) => state.products.find(p => p.id === productId);
    const getPdv = (pdvId) => state.pdvs.find(p => p.id === pdvId);

    const calculatePdvMetrics = (pdvId, startDate = null, endDate = null) => {
        let relevantSales = state.sales.filter(s => s.pdvId === pdvId);
        let relevantReceivables = state.accountsReceivable.filter(r => r.pdvId === pdvId && r.payments && r.payments.length > 0);

        const filterByDate = (items, dateProp) => {
            let filtered = items;
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                filtered = filtered.filter(item => new Date(item[dateProp]) >= start);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filtered = filtered.filter(item => new Date(item[dateProp]) <= end);
            }
            return filtered;
        };
        
        relevantSales = filterByDate(relevantSales, 'date');
        
        const salesRevenue = relevantSales.reduce((sum, s) => sum + s.totalPrice, 0);
        const costOfGoods = relevantSales.reduce((sum, s) => sum + (s.costAtTimeOfSale * s.quantity), 0);
        
        let receivablesRevenue = 0;
        relevantReceivables.forEach(receivable => {
            const paymentsInPeriod = filterByDate(receivable.payments, 'date');
            receivablesRevenue += paymentsInPeriod.reduce((sum, p) => sum + p.amount, 0);
        });

        const revenue = salesRevenue + receivablesRevenue;
        const netProfit = (salesRevenue - costOfGoods) + receivablesRevenue;

        const pdv = getPdv(pdvId);
        const fixedCosts = pdv?.fixedCosts.reduce((sum, c) => sum + c.value, 0) || 0;
        const variableCosts = pdv?.variableCosts.reduce((sum, c) => sum + c.value, 0) || 0;
        const totalCosts = fixedCosts + variableCosts;

        const finalProfit = netProfit - totalCosts;

        const stockValueCost = pdv?.inventory.reduce((sum, item) => {
            const product = getProduct(item.productId);
            if (!product) return sum;
            return sum + (product.currentCost * item.quantity);
        }, 0) || 0;

        const stockValueResale = pdv?.inventory.reduce((sum, item) => {
            const product = getProduct(item.productId);
            if (!product) return sum;
            return sum + (product.resalePrice * item.quantity);
        }, 0) || 0;

        return {
            salesCount: relevantSales.length,
            revenue,
            netProfit,
            finalProfit,
            ticket: relevantSales.length > 0 ? salesRevenue / relevantSales.length : 0,
            stockValueCost,
            stockValueResale,
            totalCosts
        };
    };

    // --- RENDERIZAÇÃO ---

    const render = () => {
        if (!state.activeView) state.activeView = 'dashboard';
        mainContent.innerHTML = '';
        updateNavigation();

        switch (state.activeView) {
            case 'dashboard': renderDashboard(); break;
            case 'pdvs': renderPdvs(); break;
            case 'products': renderProducts(); break;
            case 'finances': renderFinances(); break;
            case 'reports': renderReports(); break;
            case 'central_cash': renderCentralCash(); break;
        }
    };

    const updateNavigation = () => {
        const navLinks = [
            { id: 'dashboard', text: 'Dashboard', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>`},
            { id: 'pdvs', text: 'PDVs', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a.75.75 0 01.75.75v.5a.75.75 0 01-1.5 0v-.5A.75.75 0 0110 2zM6.31 3.97a.75.75 0 011.06 0l.708.707a.75.75 0 01-1.06 1.06L6.31 5.03a.75.75 0 010-1.06zm9.441 1.06a.75.75 0 01-1.06-1.06l-.707.707a.75.75 0 11-1.06 1.06l.707-.707a.75.75 0 011.06 0zM4 10a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5A.75.75 0 014 10zm11.25.75a.75.75 0 010-1.5h.5a.75.75 0 010 1.5h-.5zM6.31 14.97a.75.75 0 010 1.06l-.707.707a.75.75 0 01-1.06-1.06l.707-.707a.75.75 0 011.06 0zm9.441 1.06a.75.75 0 01-1.06 0l-.708-.707a.75.75 0 11-1.06-1.06l.708.707a.75.75 0 011.06 1.06zM10 16a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5a.75.75 0 01-.75-.75zM10 5a5 5 0 110 10 5 5 0 010-10z" clip-rule="evenodd" /></svg>`},
            { id: 'products', text: 'Produtos', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v1h-2V4H7v1H5V4zM5 7h10v9a2 2 0 01-2 2H7a2 2 0 01-2-2V7z" /></svg>`},
            { id: 'finances', text: 'Financeiro', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2.25 8.25h15.5M2.25 9h15.5m-15.5 2.25h15.5M2.25 15.25h15.5M2.25 6.75h15.5v10.5h-15.5V6.75zM4.75 4.5A2.25 2.25 0 002.5 6.75v10.5A2.25 2.25 0 004.75 19.5h10.5A2.25 2.25 0 0017.5 17.25V6.75A2.25 2.25 0 0015.25 4.5H4.75z"/></svg>`},
            { id: 'central_cash', text: 'Caixa Central', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0015.5 2h-11zM10 4a.75.75 0 01.75.75v.518l3.248 1.624a.75.75 0 11-.67 1.34l-2.828-1.414V12a.75.75 0 01-1.5 0V7.818l-2.828 1.414a.75.75 0 11-.67-1.34L9.25 5.268V4.75A.75.75 0 0110 4zM8.5 14a.5.5 0 100 1h3a.5.5 0 100-1h-3z" clip-rule="evenodd" /></svg>`},
            { id: 'reports', text: 'Relatórios', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12 1.5a.5.5 0 01.5.5v2.5a.5.5 0 01-1 0V2.382l-5.495 5.494a.5.5 0 01-.708 0L.5 3.596 2.207 2.5l3.248 3.248L12 1.5zM3 5.435L4.505 4.5 10 9.995 15.495 4.5 17 5.435v9.13a.5.5 0 01-.5.5h-13a.5.5 0 01-.5-.5V5.435z" clip-rule="evenodd" /></svg>`}
        ];
        
        const navHtml = navLinks.map(link => `
            <button data-view="${link.id}" class="nav-link flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-full transition-colors ${state.activeView === link.id ? 'bg-orange-500 text-white' : 'text-gray-300 hover:bg-gray-600'}">
                ${link.icon}
                <span class="hidden md:inline">${link.text}</span>
            </button>
        `).join('');
        
        mainNav.innerHTML = navHtml;
        mobileMenu.innerHTML = navLinks.map(link => `
            <button data-view="${link.id}" class="nav-link block w-full text-left px-4 py-3 text-base font-medium rounded-md ${state.activeView === link.id ? 'bg-orange-500 text-white' : 'text-gray-300 hover:bg-gray-700'}">${link.text}</button>
        `).join('');

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                state.activeView = link.dataset.view;
                mobileMenu.classList.add('hidden');
                render();
            });
        });
    };

    function renderDashboard() {
        const pdvStatusSection = `
            <h2 class="text-2xl font-bold mb-4 text-orange-500">Status dos PDVs</h2>
            <div id="pdv-status-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${state.pdvs.length > 0 ? state.pdvs.map(pdv => {
                    const metrics = calculatePdvMetrics(pdv.id);
                    const statusColor = metrics.finalProfit >= 0 ? 'border-green-500' : 'border-red-500';
                    const statusText = metrics.finalProfit >= 0 ? 'Positivo' : 'Prejuízo';
                    
                    const goal = state.goals[pdv.id];
                    let goalProgressHtml = '<p class="text-xs text-gray-500">Nenhuma meta definida.</p>';
                    if (goal && goal.target > 0 && goal.startDate && goal.endDate) {
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        const startDate = new Date(goal.startDate);
                        const endDate = new Date(goal.endDate);
                        
                        const daysRemaining = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)) + 1;
                        const currentMetrics = calculatePdvMetrics(pdv.id, goal.startDate, goal.endDate);
                        const remainingValue = goal.target - currentMetrics.revenue;
                        const dailyTarget = (daysRemaining > 0 && remainingValue > 0) ? remainingValue / daysRemaining : 0;
                        
                        const progress = (currentMetrics.revenue / goal.target) * 100;
                        goalProgressHtml = `
                            <p class="text-sm text-gray-300 mb-1">Meta: ${formatCurrency(goal.target)}</p>
                            <div class="w-full bg-gray-700 rounded-full h-2.5">
                                <div class="bg-orange-500 h-2.5 rounded-full" style="width: ${Math.min(progress, 100)}%"></div>
                            </div>
                             <p class="text-xs text-gray-400 mt-1">${progress.toFixed(1)}% | Restam ${daysRemaining > 0 ? daysRemaining : 0} dias</p>
                             <p class="text-xs text-orange-400 font-semibold">Venda diária necessária: ${formatCurrency(dailyTarget)}</p>
                        `;
                    }

                    return `
                        <div class="bg-gray-800 rounded-xl shadow-lg p-5 border-l-4 ${statusColor}">
                            <div class="flex justify-between items-start">
                                <h3 class="text-lg font-bold text-white">${pdv.name}</h3>
                                <span class="text-xs font-semibold px-2 py-1 rounded-full ${metrics.finalProfit >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">${statusText}</span>
                            </div>
                            <p class="text-2xl font-bold ${metrics.finalProfit >= 0 ? 'text-green-500' : 'text-red-500'} mt-2">${formatCurrency(metrics.finalProfit)}</p>
                            <p class="text-xs text-gray-400">Lucro final (após custos)</p>
                            <div class="mt-4 pt-4 border-t border-gray-700">
                                <h4 class="text-sm font-semibold text-orange-400 mb-2">Meta do Período</h4>
                                ${goalProgressHtml}
                            </div>
                        </div>
                    `;
                }).join('') : '<p class="text-gray-400 col-span-full text-center">Nenhum PDV cadastrado ainda.</p>'}
            </div>
        `;
        mainContent.innerHTML = `<div class="fade-in">${pdvStatusSection}</div>`;
    }

    function renderPdvs() {
        mainContent.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-bold text-orange-500">Pontos de Venda (PDVs)</h1>
                <button id="add-pdv-btn" class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    + Adicionar PDV
                </button>
            </div>
            <div id="pdv-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
        `;
        
        const pdvList = document.getElementById('pdv-list');
        if (state.pdvs.length === 0) {
            pdvList.innerHTML = '<p class="text-gray-400 col-span-full text-center">Clique em "Adicionar PDV" para começar.</p>';
        } else {
            pdvList.innerHTML = state.pdvs.map(pdv => {
                const metrics = calculatePdvMetrics(pdv.id);
                return `
                <div class="bg-gray-800 p-5 rounded-xl shadow-lg flex flex-col justify-between">
                    <div>
                        <h2 class="text-xl font-bold text-white mb-2">${pdv.name}</h2>
                        <p class="text-sm text-gray-400">Investimento Inicial: ${formatCurrency(pdv.initialInvestment)}</p>
                        <div class="my-4 space-y-2">
                             <p class="text-sm flex justify-between"><span>Lucro Final:</span> <span class="font-semibold ${metrics.finalProfit >= 0 ? 'text-green-400' : 'text-red-400'}">${formatCurrency(metrics.finalProfit)}</span></p>
                             <p class="text-sm flex justify-between"><span>Estoque (Custo):</span> <span class="font-semibold text-blue-400">${formatCurrency(metrics.stockValueCost)}</span></p>
                             <p class="text-sm flex justify-between"><span>Potencial Venda:</span> <span class="font-semibold text-purple-400">${formatCurrency(metrics.stockValueResale)}</span></p>
                        </div>
                    </div>
                    <div class="mt-4 pt-4 border-t border-gray-700 grid grid-cols-2 gap-2 text-white">
                        <button class="view-pdv-details-btn col-span-2 bg-gray-700 hover:bg-gray-600 text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-pdv-id="${pdv.id}">Detalhes</button>
                        <button class="add-sale-pdv-btn bg-green-600 hover:bg-green-700 text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-pdv-id="${pdv.id}">+ Venda</button>
                        <button class="restock-pdv-btn bg-blue-600 hover:bg-blue-700 text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-pdv-id="${pdv.id}">+ Estoque</button>
                    </div>
                </div>
            `}).join('');
        }
    
        document.getElementById('add-pdv-btn').addEventListener('click', showAddPdvModal);
        document.querySelectorAll('.view-pdv-details-btn').forEach(btn => btn.addEventListener('click', (e) => showPdvDetails(e.currentTarget.dataset.pdvId)));
        document.querySelectorAll('.add-sale-pdv-btn').forEach(btn => btn.addEventListener('click', (e) => showAddSaleModal(e.currentTarget.dataset.pdvId)));
        document.querySelectorAll('.restock-pdv-btn').forEach(btn => btn.addEventListener('click', (e) => showRestockModal(e.currentTarget.dataset.pdvId)));
    }

    function renderProducts() {
        mainContent.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-bold text-orange-500">Produtos</h1>
                <button id="add-product-btn" class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    + Adicionar Produto
                </button>
            </div>
            <div id="product-list-container"></div>
        `;

        const productContainer = document.getElementById('product-list-container');
        if (state.products.length === 0) {
            productContainer.innerHTML = '<p class="text-gray-400 text-center py-8">Nenhum produto cadastrado.</p>';
        } else {
            const productItems = state.products.map(product => {
                const totalStock = state.pdvs.reduce((sum, pdv) => {
                    const item = pdv.inventory.find(i => i.productId === product.id);
                    return sum + (item ? item.quantity : 0);
                }, 0);
                const profitPerSale = product.resalePrice - product.currentCost;
                return { product, totalStock, profitPerSale };
            });

            const desktopTable = `
                <div class="hidden md:block bg-gray-800 rounded-xl shadow-lg overflow-x-auto">
                    <table class="w-full text-sm text-left text-gray-300">
                        <thead class="text-xs text-gray-400 uppercase bg-gray-700">
                            <tr>
                                <th scope="col" class="px-6 py-3">Produto</th>
                                <th scope="col" class="px-6 py-3">Custo Atual</th>
                                <th scope="col" class="px-6 py-3">Preço de Venda</th>
                                <th scope="col" class="px-6 py-3">Lucro por Venda</th>
                                <th scope="col" class="px-6 py-3">Estoque Total</th>
                                <th scope="col" class="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productItems.map(({ product, totalStock, profitPerSale }) => `
                                <tr class="bg-gray-800 border-b border-gray-700 hover:bg-gray-700/50">
                                    <th scope="row" class="px-6 py-4 font-medium text-white whitespace-nowrap">${product.name}</th>
                                    <td class="px-6 py-4">${formatCurrency(product.currentCost)}</td>
                                    <td class="px-6 py-4">${formatCurrency(product.resalePrice)}</td>
                                    <td class="px-6 py-4 text-green-400">${formatCurrency(profitPerSale)}</td>
                                    <td class="px-6 py-4">${totalStock} un.</td>
                                    <td class="px-6 py-4">
                                        <div class="flex justify-center space-x-2">
                                            <button class="edit-product-btn text-yellow-400 hover:text-yellow-300" data-product-id="${product.id}" title="Editar">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                                            </button>
                                            <button class="delete-product-btn text-red-500 hover:text-red-400" data-product-id="${product.id}" title="Apagar">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            const mobileCards = `
                <div class="md:hidden space-y-4">
                    ${productItems.map(({ product, totalStock, profitPerSale }) => `
                        <div class="bg-gray-800 p-4 rounded-xl shadow-lg">
                            <h3 class="font-bold text-lg text-white">${product.name}</h3>
                            <div class="mt-2 space-y-1 text-sm text-gray-300 border-t border-gray-700 pt-2">
                                <p class="flex justify-between"><span>Custo Atual:</span> <span class="font-semibold">${formatCurrency(product.currentCost)}</span></p>
                                <p class="flex justify-between"><span>Preço de Venda:</span> <span class="font-semibold">${formatCurrency(product.resalePrice)}</span></p>
                                <p class="flex justify-between"><span>Lucro por Venda:</span> <span class="font-semibold text-green-400">${formatCurrency(profitPerSale)}</span></p>
                                <p class="flex justify-between"><span>Estoque Total:</span> <span class="font-semibold">${totalStock} unidades</span></p>
                            </div>
                            <div class="mt-4 pt-3 border-t border-gray-700 flex space-x-2">
                                <button class="edit-product-btn flex-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-product-id="${product.id}">Editar</button>
                                <button class="delete-product-btn flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-product-id="${product.id}">Apagar</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            
            productContainer.innerHTML = desktopTable + mobileCards;
        }
    
        document.getElementById('add-product-btn').addEventListener('click', showAddProductModal);
        document.querySelectorAll('.edit-product-btn').forEach(btn => btn.addEventListener('click', (e) => showEditProductModal(e.currentTarget.dataset.productId)));
        document.querySelectorAll('.delete-product-btn').forEach(btn => btn.addEventListener('click', (e) => handleDeleteProduct(e.currentTarget.dataset.productId)));
    }
    
    function renderFinances() {
        mainContent.innerHTML = `
            <h1 class="text-3xl font-bold text-orange-500 mb-6">Financeiro</h1>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold text-white">Contas a Pagar</h2>
                        <button id="add-payable-btn" class="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-2 px-3 rounded-lg transition-colors">+ Nova Conta</button>
                    </div>
                    <div id="payable-list" class="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                        ${renderFinanceList(state.accountsPayable, 'payable')}
                    </div>
                </div>
                <div>
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold text-white">Contas a Receber</h2>
                        <button id="add-receivable-btn" class="bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 px-3 rounded-lg transition-colors">+ Novo Recebível</button>
                    </div>
                    <div id="receivable-list" class="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                         ${renderFinanceList(state.accountsReceivable, 'receivable')}
                    </div>
                </div>
            </div>
        `;
    
        document.getElementById('add-payable-btn').addEventListener('click', () => showAddFinanceModal('payable'));
        document.getElementById('add-receivable-btn').addEventListener('click', () => showAddFinanceModal('receivable'));
        document.querySelectorAll('.action-btn-pay').forEach(btn => btn.addEventListener('click', (e) => handlePaymentAction(e.currentTarget.dataset.id, e.currentTarget.dataset.type)));
        document.querySelectorAll('.action-btn-edit').forEach(btn => btn.addEventListener('click', (e) => showEditFinanceModal(e.currentTarget.dataset.id, e.currentTarget.dataset.type)));
        document.querySelectorAll('.action-btn-delete').forEach(btn => btn.addEventListener('click', (e) => handleDeleteFinanceItem(e.currentTarget.dataset.id, e.currentTarget.dataset.type)));
    }

    function renderFinanceList(items, type) {
        if (!items || items.length === 0) {
            return '<p class="text-gray-400 text-center py-4">Nenhum lançamento.</p>';
        }

        return items.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate)).map(item => {
            const pdv = getPdv(item.pdvId);
            const isOverdue = new Date(item.dueDate) < new Date() && !item.paid;
            const totalPaid = (item.payments || []).reduce((sum, p) => sum + p.amount, 0);
            const isFullyPaid = item.paid || (type === 'receivable' && totalPaid >= item.amount);

            let paymentStatusHtml = '';
            if (type === 'receivable' && totalPaid > 0 && !isFullyPaid) {
                paymentStatusHtml = `<p class="text-xs text-yellow-400">Recebido: ${formatCurrency(totalPaid)} de ${formatCurrency(item.amount)}</p>`;
            }

            return `
                <div class="bg-gray-800 p-4 rounded-lg flex justify-between items-center ${isFullyPaid ? 'opacity-50' : ''}">
                    <div class="flex-1">
                        <p class="font-semibold text-white">${item.description}</p>
                        <p class="text-sm text-gray-400">${pdv?.name || 'PDV não encontrado'} | Venc.: ${new Date(item.dueDate).toLocaleDateString('pt-BR')}</p>
                        ${isOverdue && !isFullyPaid ? '<p class="text-xs text-red-400 font-semibold">VENCIDA</p>' : ''}
                        ${paymentStatusHtml}
                    </div>
                    <div class="text-right ml-4">
                         <p class="font-bold text-lg ${type === 'payable' ? 'text-red-400' : 'text-green-400'}">${formatCurrency(item.amount)}</p>
                        ${!isFullyPaid 
                            ? `<button class="action-btn-pay text-sm font-semibold text-blue-400 hover:text-blue-300" data-id="${item.id}" data-type="${type}">Registrar ${type === 'payable' ? 'Pagamento' : 'Recebimento'}</button>` 
                            : `<span class="text-sm font-semibold text-gray-500">${type === 'payable' ? 'Pago' : 'Recebido'}</span>`
                        }
                    </div>
                    <div class="flex flex-col space-y-2 ml-4">
                        <button class="action-btn-edit text-gray-400 hover:text-white" data-id="${item.id}" data-type="${type}" title="Editar">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                        </button>
                        <button class="action-btn-delete text-gray-400 hover:text-red-500" data-id="${item.id}" data-type="${type}" title="Apagar">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderCentralCash() {
        const cashBalance = state.centralCash.transactions.reduce((acc, t) => {
            if (['sale_pix', 'wallet_deposit', 'receivable_payment'].includes(t.type)) return acc + t.amount;
            if (['withdrawal', 'payable'].includes(t.type)) return acc - t.amount;
            return acc;
        }, 0);

        const creditToReceive = state.accountsReceivable
            .filter(ar => ar.origin === 'sale_credit' && !ar.paid)
            .reduce((sum, ar) => {
                const totalPaid = (ar.payments || []).reduce((s, p) => s + p.amount, 0);
                return sum + (ar.amount - totalPaid);
            }, 0);

        mainContent.innerHTML = `
            <h1 class="text-3xl font-bold text-orange-500 mb-6">Caixa Central</h1>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="bg-gray-800 p-6 rounded-xl">
                    <h2 class="text-gray-400 text-sm font-medium">Saldo Disponível em Caixa</h2>
                    <p class="text-3xl font-bold text-green-500 mt-1">${formatCurrency(cashBalance)}</p>
                </div>
                <div class="bg-gray-800 p-6 rounded-xl">
                    <h2 class="text-gray-400 text-sm font-medium">Saldo em Carteiras (Clientes)</h2>
                    <p class="text-3xl font-bold text-blue-500 mt-1">${formatCurrency(state.centralCash.walletBalance)}</p>
                </div>
                <div class="bg-gray-800 p-6 rounded-xl">
                    <h2 class="text-gray-400 text-sm font-medium">Crédito a Receber (Faturas)</h2>
                    <p class="text-3xl font-bold text-yellow-500 mt-1">${formatCurrency(creditToReceive)}</p>
                </div>
                 <div class="bg-gray-800 p-6 rounded-xl">
                    <h2 class="text-gray-400 text-sm font-medium">Patrimônio Total</h2>
                    <p class="text-3xl font-bold text-purple-500 mt-1">${formatCurrency(cashBalance + creditToReceive)}</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="space-y-6">
                    <form id="wallet-deposit-form" class="bg-gray-800 p-6 rounded-xl space-y-4">
                        <h2 class="text-xl font-bold text-white">Registrar Depósito em Carteira</h2>
                        <div>
                            <label for="wallet-deposit-amount" class="block text-sm font-medium text-gray-300 mb-1">Valor do Depósito</label>
                            <input type="number" id="wallet-deposit-amount" step="0.01" required class="w-full bg-gray-700 border border-gray-600 rounded-md p-2">
                        </div>
                        <div>
                            <label for="wallet-deposit-reason" class="block text-sm font-medium text-gray-300 mb-1">Cliente/Motivo</label>
                            <input type="text" id="wallet-deposit-reason" required class="w-full bg-gray-700 border border-gray-600 rounded-md p-2" placeholder="Ex: João Silva, apto 101">
                        </div>
                        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg">Confirmar Depósito</button>
                    </form>
                    <form id="withdrawal-form" class="bg-gray-800 p-6 rounded-xl space-y-4">
                        <h2 class="text-xl font-bold text-white">Realizar Retirada Pessoal</h2>
                        <div>
                            <label for="withdrawal-amount" class="block text-sm font-medium text-gray-300 mb-1">Valor</label>
                            <input type="number" id="withdrawal-amount" step="0.01" required class="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-orange-500 focus:border-orange-500">
                        </div>
                        <div>
                            <label for="withdrawal-reason" class="block text-sm font-medium text-gray-300 mb-1">Motivo</label>
                            <input type="text" id="withdrawal-reason" required class="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-orange-500 focus:border-orange-500" placeholder="Ex: Adiantamento, Pró-labore">
                        </div>
                        <button type="submit" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Confirmar Retirada</button>
                    </form>
                </div>
                <div>
                     <h2 class="text-xl font-bold text-white mb-4">Histórico de Transações do Caixa</h2>
                     <div class="bg-gray-800 p-4 rounded-xl max-h-[50vh] overflow-y-auto">
                        <div id="cash-transactions" class="space-y-3"></div>
                    </div>
                </div>
            </div>
        `;
        
        const transactionsList = document.getElementById('cash-transactions');
        if (!state.centralCash.transactions || state.centralCash.transactions.length === 0) {
            transactionsList.innerHTML = '<p class="text-gray-400 text-center py-4">Nenhuma transação registrada.</p>';
        } else {
            const transactionInfo = {
                sale_pix: { color: 'text-green-400', sign: '+' },
                wallet_deposit: { color: 'text-blue-400', sign: '+' },
                receivable_payment: { color: 'text-teal-400', sign: '+' },
                withdrawal: { color: 'text-red-400', sign: '-' },
                payable: { color: 'text-red-400', sign: '-' },
            };

            transactionsList.innerHTML = [...state.centralCash.transactions]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map(t => {
                    const info = transactionInfo[t.type] || { color: '', sign: '' };
                    return `
                    <div class="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                        <div>
                            <p class="font-semibold">${t.reason}</p>
                            <p class="text-xs text-gray-400">${new Date(t.date).toLocaleString('pt-BR')}</p>
                        </div>
                        <p class="font-bold text-lg ${info.color}">${info.sign}${formatCurrency(t.amount)}</p>
                    </div>
                `}).join('');
        }
    
        document.getElementById('withdrawal-form').addEventListener('submit', handleWithdrawal);
        document.getElementById('wallet-deposit-form').addEventListener('submit', handleWalletDeposit);
    }

    function renderReports() {
        mainContent.innerHTML = `
            <h1 class="text-3xl font-bold text-orange-500 mb-6">Relatórios</h1>
            <div class="bg-gray-800 p-4 rounded-xl mb-6">
                <form id="report-filter-form" class="flex flex-wrap items-end gap-4">
                    <div>
                        <label for="report-pdv" class="text-sm font-medium text-gray-300">PDV</label>
                        <select id="report-pdv" class="w-full mt-1 bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-orange-500 focus:border-orange-500">
                            <option value="all">Geral</option>
                            ${state.pdvs.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label for="report-start-date" class="text-sm font-medium text-gray-300">Data Início</label>
                        <input type="date" id="report-start-date" class="w-full mt-1 bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-orange-500 focus:border-orange-500">
                    </div>
                    <div>
                        <label for="report-end-date" class="text-sm font-medium text-gray-300">Data Fim</label>
                        <input type="date" id="report-end-date" class="w-full mt-1 bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-orange-500 focus:border-orange-500">
                    </div>
                    <button type="submit" class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg">Gerar Relatório</button>
                </form>
            </div>
            <div id="report-results"></div>
        `;
    
        document.getElementById('report-filter-form').addEventListener('submit', handleGenerateReport);
        handleGenerateReport(); 
    }
    
    // --- MODAIS E AÇÕES ---
    
    const handleGenerateReport = (e) => {
        if(e) e.preventDefault();
        const pdvId = document.getElementById('report-pdv')?.value || 'all';
        const startDate = document.getElementById('report-start-date')?.value || null;
        let endDate = document.getElementById('report-end-date')?.value || null;

        if(!startDate && !endDate){
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('report-start-date').value = today;
            document.getElementById('report-end-date').value = today;
            handleGenerateReport();
            return;
        }

        const metrics = pdvId === 'all' 
            ? state.pdvs.reduce((acc, pdv) => {
                const pdvMetrics = calculatePdvMetrics(pdv.id, startDate, endDate);
                acc.revenue += pdvMetrics.revenue;
                acc.netProfit += pdvMetrics.netProfit;
                acc.salesCount += pdvMetrics.salesCount;
                return acc;
              }, { revenue: 0, netProfit: 0, salesCount: 0 })
            : calculatePdvMetrics(pdvId, startDate, endDate);
        
        metrics.avgTicket = metrics.salesCount > 0 ? metrics.revenue / metrics.salesCount : 0;
        
        const resultsDiv = document.getElementById('report-results');
        resultsDiv.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-gray-700 p-4 rounded-lg"><p class="text-sm text-gray-400">Vendas no Período</p><p class="text-2xl font-bold">${metrics.salesCount}</p></div>
                <div class="bg-gray-700 p-4 rounded-lg"><p class="text-sm text-gray-400">Ticket Médio</p><p class="text-2xl font-bold">${formatCurrency(metrics.avgTicket)}</p></div>
                <div class="bg-gray-700 p-4 rounded-lg"><p class="text-sm text-gray-400">Faturamento</p><p class="text-2xl font-bold text-orange-400">${formatCurrency(metrics.revenue)}</p></div>
                <div class="bg-gray-700 p-4 rounded-lg"><p class="text-sm text-gray-400">Lucro Líquido</p><p class="text-2xl font-bold text-green-400">${formatCurrency(metrics.netProfit)}</p></div>
            </div>
        `;
    };

    const showAddPdvModal = () => {
        Swal.fire({
            title: 'Adicionar Novo PDV',
            html: `
                <input id="pdv-name" class="swal2-input" placeholder="Nome do PDV">
                <input id="pdv-investment" type="number" step="0.01" class="swal2-input" placeholder="Investimento Inicial">
            `,
            confirmButtonText: 'Salvar',
            focusConfirm: false,
            preConfirm: () => {
                const name = document.getElementById('pdv-name').value;
                const investment = parseFloat(document.getElementById('pdv-investment').value);
                if (!name || isNaN(investment)) {
                    Swal.showValidationMessage(`Por favor, preencha todos os campos.`);
                }
                return { name, investment };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const { name, investment } = result.value;
                state.pdvs.push({
                    id: generateId(), name, initialInvestment: investment,
                    fixedCosts: [], variableCosts: [], inventory: []
                });
                await saveDataToServer();
                render();
            }
        });
    };
    
    const showAddProductModal = () => {
       Swal.fire({
            title: 'Adicionar Novo Produto',
            html: `
                <input id="product-name" class="swal2-input" placeholder="Nome do Produto">
                <input id="product-cost" type="number" step="0.01" class="swal2-input" placeholder="Custo do Produto">
                <input id="product-resale" type="number" step="0.01" class="swal2-input" placeholder="Preço de Venda">
            `,
            confirmButtonText: 'Salvar',
            focusConfirm: false,
            preConfirm: () => {
                const name = document.getElementById('product-name').value;
                const cost = parseFloat(document.getElementById('product-cost').value);
                const resalePrice = parseFloat(document.getElementById('product-resale').value);
                if (!name || isNaN(cost) || isNaN(resalePrice)) {
                    Swal.showValidationMessage(`Preencha todos os campos com valores válidos.`);
                }
                return { name, cost, resalePrice };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const { name, cost, resalePrice } = result.value;
                state.products.push({
                    id: generateId(), name, currentCost: cost, resalePrice
                });
                await saveDataToServer();
                render();
            }
        });
    };

    const showEditProductModal = (productId) => {
        const product = getProduct(productId);
        Swal.fire({
            title: 'Editar Produto',
            html: `
                <input id="product-name" class="swal2-input" placeholder="Nome do Produto" value="${product.name}">
                <input id="product-cost" type="number" step="0.01" class="swal2-input" placeholder="Custo do Produto" value="${product.currentCost}">
                <input id="product-resale" type="number" step="0.01" class="swal2-input" placeholder="Preço de Venda" value="${product.resalePrice}">
            `,
            confirmButtonText: 'Salvar Alterações',
            focusConfirm: false,
            preConfirm: () => {
                const name = document.getElementById('product-name').value;
                const cost = parseFloat(document.getElementById('product-cost').value);
                const resalePrice = parseFloat(document.getElementById('product-resale').value);
                if (!name || isNaN(cost) || isNaN(resalePrice)) {
                    Swal.showValidationMessage(`Preencha todos os campos com valores válidos.`);
                }
                return { name, cost, resalePrice };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const { name, cost, resalePrice } = result.value;
                product.name = name;
                product.currentCost = cost;
                product.resalePrice = resalePrice;
                await saveDataToServer();
                render();
                Swal.fire('Sucesso!', 'Produto atualizado com sucesso!', 'success');
            }
        });
    };

    const handleDeleteProduct = (productId) => {
        const product = getProduct(productId);
        const isInStock = state.pdvs.some(pdv => 
            pdv.inventory.some(item => item.productId === productId && item.quantity > 0)
        );

        if (isInStock) {
            Swal.fire('Ação Bloqueada','Você não pode apagar um produto que ainda possui estoque.','error');
            return;
        }

        Swal.fire({
            title: 'Você tem certeza?',
            text: `Deseja apagar o produto "${product.name}"?`,
            icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33',
            confirmButtonText: 'Sim, apagar!', cancelButtonText: 'Cancelar'
        }).then(async (result) => {
            if (result.isConfirmed) {
                state.products = state.products.filter(p => p.id !== productId);
                await saveDataToServer();
                render();
                Swal.fire('Apagado!','O produto foi removido com sucesso.','success');
            }
        });
    };

    const showRestockModal = (pdvId) => {
        const pdv = getPdv(pdvId);
        if (state.products.length === 0) {
            Swal.fire('Atenção', 'Cadastre produtos antes de reabastecer o estoque.', 'warning');
            return;
        }

        const productOptions = state.products.map(p => `<option value="${p.id}">${p.name} - ${formatCurrency(p.currentCost)}</option>`).join('');

        Swal.fire({
            title: `Reabastecer Estoque de ${pdv.name}`,
            html: `
                <select id="restock-product-id" class="swal2-select bg-gray-700 text-gray-100">${productOptions}</select>
                <input id="restock-quantity" type="number" class="swal2-input" placeholder="Quantidade">
            `,
            showCancelButton: true, confirmButtonText: 'Próximo',
            preConfirm: () => {
                const productId = document.getElementById('restock-product-id').value;
                const quantity = parseInt(document.getElementById('restock-quantity').value);
                if (!productId || !quantity || quantity <= 0) {
                    Swal.showValidationMessage('Selecione um produto e informe a quantidade.');
                }
                return { productId, quantity };
            }
        }).then(result => {
            if (result.isConfirmed) {
                const { productId, quantity } = result.value;
                const product = getProduct(productId);

                Swal.fire({
                    title: `Custo de ${product.name}`,
                    text: `O último custo registrado foi ${formatCurrency(product.currentCost)}. É o mesmo?`,
                    icon: 'question', showCancelButton: true, showDenyButton: true,
                    confirmButtonText: 'Sim, mesmo valor', denyButtonText: 'Não, novo valor',
                }).then(costResult => {
                    if (costResult.isConfirmed) {
                        addStock(pdvId, productId, quantity, product.currentCost);
                    } else if (costResult.isDenied) {
                        Swal.fire({
                            title: 'Novo Custo Unitário', input: 'number',
                            inputAttributes: { step: '0.01' }, showCancelButton: true,
                            inputValidator: (v) => !v || parseFloat(v) <= 0 ? 'Informe um custo válido' : null
                        }).then(newCostResult => {
                            if (newCostResult.isConfirmed) {
                                const newCost = parseFloat(newCostResult.value);
                                product.currentCost = newCost;
                                addStock(pdvId, productId, quantity, newCost);
                            }
                        });
                    }
                });
            }
        });
    }

    const addStock = async (pdvId, productId, quantity, cost) => {
        const pdv = getPdv(pdvId);
        let inventoryItem = pdv.inventory.find(item => item.productId === productId);
        if (inventoryItem) {
            inventoryItem.quantity += quantity;
        } else {
            pdv.inventory.push({ productId, quantity });
        }
        
        const product = getProduct(productId);
        pdv.variableCosts.push({
            id: generateId(), name: `Compra de ${quantity}x ${product.name}`,
            value: cost * quantity, date: new Date().toISOString()
        });
        
        await saveDataToServer();
        Swal.fire('Sucesso!', 'Estoque atualizado com sucesso!', 'success');
        render();
    };

    const showPdvDetails = (pdvId) => {
        const pdv = getPdv(pdvId);
        const metrics = calculatePdvMetrics(pdv.id);
    
        const inventoryHtml = pdv.inventory.length > 0 ? pdv.inventory.map(item => {
            const product = getProduct(item.productId);
            if (!product) return '';
            return `<li class="flex justify-between items-center text-sm py-1">
                        <span>${product.name}</span>
                        <div class="flex items-center space-x-2">
                            <span class="font-mono">${item.quantity} un.</span>
                            <button class="edit-stock-btn text-yellow-400 hover:text-white" data-pdv-id="${pdv.id}" data-product-id="${product.id}" title="Editar Estoque">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                            </button>
                        </div>
                    </li>`;
        }).join('') : '<p class="text-sm text-gray-500">Estoque vazio.</p>';
    
        const costsHtml = (title, costs) => `
            <h4 class="font-semibold text-orange-400 mt-4 mb-2">${title}</h4>
            ${costs.length > 0 ? `<ul>${costs.map(c => `
                <li class="flex justify-between text-sm py-1"><span>${c.name}</span> <span class="font-semibold">${formatCurrency(c.value)}</span></li>
            `).join('')}</ul>` : '<p class="text-sm text-gray-500">Nenhum custo.</p>'}`;
        
        const currentGoal = state.goals[pdv.id] || {};
    
        Swal.fire({
            title: `Detalhes de ${pdv.name}`,
            width: '95%',
            customClass: { popup: 'p-2 sm:p-6' },
            html: `
                <div class="text-left space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="bg-gray-700/50 p-3 rounded-lg">
                            <h3 class="font-bold text-lg text-white">Resumo Financeiro</h3>
                            <ul class="mt-2 space-y-1 text-sm">
                                <li class="flex justify-between"><span>Faturamento:</span> <span class="font-bold text-green-400">${formatCurrency(metrics.revenue)}</span></li>
                                <li class="flex justify-between"><span>Lucro Líquido:</span> <span class="font-bold text-green-400">${formatCurrency(metrics.netProfit)}</span></li>
                                <li class="flex justify-between"><span>Custos Totais:</span> <span class="font-bold text-red-400">${formatCurrency(metrics.totalCosts)}</span></li>
                                <li class="flex justify-between border-t border-gray-600 pt-2 mt-2"><span>Lucro Final:</span> <span class="font-bold text-xl ${metrics.finalProfit >= 0 ? 'text-green-500' : 'text-red-500'}">${formatCurrency(metrics.finalProfit)}</span></li>
                            </ul>
                        </div>
                        <div class="bg-gray-700/50 p-3 rounded-lg">
                             <h3 class="font-bold text-lg text-white">Estoque</h3>
                             <ul class="mt-2 space-y-1 text-sm">
                                <li class="flex justify-between"><span>Valor (Custo):</span> <span class="font-bold text-blue-400">${formatCurrency(metrics.stockValueCost)}</span></li>
                                <li class="flex justify-between"><span>Potencial (Venda):</span> <span class="font-bold text-purple-400">${formatCurrency(metrics.stockValueResale)}</span></li>
                             </ul>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="bg-gray-700/50 p-3 rounded-lg">
                            <h3 class="font-bold text-lg text-white">Inventário Atual</h3>
                            <ul class="mt-2 space-y-1 max-h-40 overflow-y-auto pr-2">${inventoryHtml}</ul>
                        </div>
                        <div class="bg-gray-700/50 p-3 rounded-lg">
                             <h3 class="font-bold text-lg text-white">Custos</h3>
                             ${costsHtml('Fixos', pdv.fixedCosts)}
                             ${costsHtml('Variáveis', pdv.variableCosts)}
                        </div>
                    </div>
                    
                    <div>
                        <h3 class="font-bold text-lg text-white">Definir Meta</h3>
                         <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 items-end">
                            <div><label class="text-xs text-gray-400">Valor</label><input type="number" id="goal-target" class="swal2-input" placeholder="R$ 5000" value="${currentGoal.target || ''}"></div>
                            <div><label class="text-xs text-gray-400">Início</label><input type="date" id="goal-start-date" class="swal2-input" value="${currentGoal.startDate || ''}"></div>
                            <div><label class="text-xs text-gray-400">Fim</label><input type="date" id="goal-end-date" class="swal2-input" value="${currentGoal.endDate || ''}"></div>
                            <button id="save-goal-btn" class="col-span-full sm:col-span-3 bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 mt-2">Salvar Meta</button>
                         </div>
                    </div>
                </div>
            `,
            didOpen: () => {
                document.querySelectorAll('.edit-stock-btn').forEach(btn => btn.addEventListener('click', (e) => {
                    const { pdvId, productId } = e.currentTarget.dataset;
                    showEditStockModal(pdvId, productId);
                }));
                document.getElementById('save-goal-btn').addEventListener('click', async () => {
                    const target = parseFloat(document.getElementById('goal-target').value);
                    const startDate = document.getElementById('goal-start-date').value;
                    const endDate = document.getElementById('goal-end-date').value;
                    if (target > 0 && startDate && endDate) {
                        state.goals[pdv.id] = { target, startDate, endDate };
                        await saveDataToServer();
                        Swal.close();
                        render();
                    } else {
                        Swal.showValidationMessage('Preencha todos os campos da meta.');
                    }
                });
            }
        });
    }

    const showEditStockModal = (pdvId, productId) => {
        const pdv = getPdv(pdvId);
        const product = getProduct(productId);
        const inventoryItem = pdv.inventory.find(i => i.productId === productId) || { quantity: 0 };
        
        Swal.fire({
            title: `Editar Estoque de ${product.name}`, text: `PDV: ${pdv.name}`,
            input: 'number', inputValue: inventoryItem.quantity,
            confirmButtonText: 'Salvar', showCancelButton: true,
            inputValidator: (value) => {
                if (value === '' || parseInt(value) < 0) return 'Insira uma quantidade válida.';
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const item = pdv.inventory.find(i => i.productId === productId);
                if (item) {
                    item.quantity = parseInt(result.value);
                } else {
                    pdv.inventory.push({ productId, quantity: parseInt(result.value) });
                }
                await saveDataToServer();
                Swal.fire('Sucesso!', 'Estoque atualizado.', 'success').then(() => {
                    if (document.querySelector('.swal2-container')) showPdvDetails(pdvId);
                    else render();
                });
            }
        });
    }

    function showAddFinanceModal(type, item = null) {
        const title = `${item ? 'Editar' : 'Nova'} ${type === 'payable' ? 'Conta a Pagar' : 'Conta a Receber'}`;
        const pdvOptions = state.pdvs.map(p => `<option value="${p.id}" ${item?.pdvId === p.id ? 'selected' : ''}>${p.name}</option>`).join('');

        let recurringHtml = '';
        if ((type === 'receivable' && item?.origin !== 'sale_credit') || type === 'payable') {
             recurringHtml = `
                <div class="flex items-center justify-center mt-4">
                    <input id="finance-recurring" type="checkbox" class="h-4 w-4 rounded text-orange-600 focus:ring-orange-500" ${item?.isRecurring ? 'checked' : ''}>
                    <label for="finance-recurring" class="ml-2 block text-sm text-gray-300">Renovação Automática Mensal</label>
                </div>
            `;
        }
        
        Swal.fire({
            title,
            html: `
                <input id="finance-description" class="swal2-input" placeholder="Descrição" value="${item?.description || ''}">
                <input id="finance-amount" type="number" step="0.01" class="swal2-input" placeholder="Valor" value="${item?.amount || ''}">
                <input id="finance-due-date" type="date" class="swal2-input" value="${item ? new Date(item.dueDate).toISOString().split('T')[0] : ''}">
                <select id="finance-pdv-id" class="swal2-select bg-gray-700 text-gray-100">${pdvOptions}</select>
                ${recurringHtml}
            `,
            confirmButtonText: 'Salvar',
            preConfirm: () => {
                const description = document.getElementById('finance-description').value;
                const amount = parseFloat(document.getElementById('finance-amount').value);
                const dueDate = document.getElementById('finance-due-date').value;
                const pdvId = document.getElementById('finance-pdv-id').value;
                const isRecurring = document.getElementById('finance-recurring')?.checked || false;

                if (!description || !amount || !dueDate || !pdvId) {
                    Swal.showValidationMessage('Preencha todos os campos.');
                }
                return { description, amount, dueDate, pdvId, isRecurring };
            }
        }).then(async result => {
            if (result.isConfirmed) {
                const data = result.value;
                if (item) {
                    const list = type === 'payable' ? state.accountsPayable : state.accountsReceivable;
                    const existingItem = list.find(i => i.id === item.id);
                    Object.assign(existingItem, data);
                } else {
                    const list = type === 'payable' ? state.accountsPayable : state.accountsReceivable;
                    list.push({ id: generateId(), ...data, paid: false, payments: [] });
                }
                await saveDataToServer();
                render();
            }
        });
    }

    const showEditFinanceModal = (id, type) => {
        const list = type === 'payable' ? state.accountsPayable : state.accountsReceivable;
        const item = list.find(i => i.id === id);
        if (item) showAddFinanceModal(type, item);
    }
    
    const handleDeleteFinanceItem = async (id, type) => {
        const list = type === 'payable' ? state.accountsPayable : state.accountsReceivable;
        const item = list.find(i => i.id === id);
        Swal.fire({
            title: 'Você tem certeza?', text: `Deseja apagar "${item.description}"?`,
            icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33',
            confirmButtonText: 'Sim, apagar!', cancelButtonText: 'Cancelar'
        }).then(async (result) => {
            if (result.isConfirmed) {
                if (type === 'payable') state.accountsPayable = state.accountsPayable.filter(i => i.id !== id);
                else state.accountsReceivable = state.accountsReceivable.filter(i => i.id !== id);
                await saveDataToServer();
                render();
                Swal.fire('Apagado!', 'O lançamento foi removido.', 'success');
            }
        });
    }


    // --- INICIALIZAÇÃO ---
    const initApp = async () => {
        loginScreen.style.display = 'none';
        appContent.style.display = 'block';
        await loadDataFromServer();
        render();
    };
    
    loginForm.addEventListener('submit', handleLogin);
    logoutButton.addEventListener('click', handleLogout);
    menuToggle.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));

    if (checkAuth()) {
        initApp();
    } else {
        loginScreen.style.display = 'flex';
        appContent.style.display = 'none';
    }
});

