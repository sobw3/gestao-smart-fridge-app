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
    
    let state = {};

    // --- FUNÇÕES DE DADOS (API) ---
    const loadDataFromServer = async () => {
        try {
            const response = await fetch('/api/data');
            if (!response.ok) throw new Error('Falha ao buscar dados do servidor');
            const data = await response.json();
            state = data;
            state.activeView = state.activeView || 'dashboard';
        } catch (error) {
            console.error(error);
            Swal.fire('Erro de Conexão', 'Não foi possível carregar os dados do servidor.', 'error');
        }
    };

    const saveDataToServer = async () => {
        try {
            const response = await fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state)
            });
            if (!response.ok) throw new Error('Falha ao salvar dados no servidor');
        } catch (error) {
            console.error(error);
            Swal.fire('Erro de Conexão', 'Não foi possível salvar os dados no servidor.', 'error');
        }
    };

    // --- FUNÇÕES UTILITÁRIAS ---
    const formatCurrency = (value) => (typeof value === 'number' ? value : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const generateId = () => `id_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`;

    // --- FUNÇÕES DE AUTENTICAÇÃO (API) ---
    const checkAuth = () => sessionStorage.getItem('isLoggedIn') === 'true';

    const handleLogin = async (e) => {
        e.preventDefault();
        const username = loginForm.username.value;
        const password = loginForm.password.value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                sessionStorage.setItem('isLoggedIn', 'true');
                await initApp();
            } else {
                Swal.fire('Erro', 'Usuário ou senha incorretos!', 'error');
            }
        } catch (error) {
            Swal.fire('Erro de Conexão', 'Não foi possível conectar ao servidor para fazer login.', 'error');
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem('isLoggedIn');
        loginScreen.style.display = 'flex';
        appContent.style.display = 'none';
    };

    // --- FUNÇÕES DE CÁLCULO E DADOS ---
    const getProduct = (productId) => (state.products || []).find(p => p.id === productId);
    const getPdv = (pdvId) => (state.pdvs || []).find(p => p.id === pdvId);

    const calculatePdvMetrics = (pdvId, startDate = null, endDate = null) => {
        const filterByDate = (items, dateProp = 'date') => {
            const allItems = items || [];
            if (!startDate || !endDate) return allItems;
            
            const startDateTime = new Date(startDate + 'T00:00:00').getTime();
            const endDateTime = new Date(endDate + 'T23:59:59').getTime();
            
            return allItems.filter(item => {
                const itemTime = new Date(item[dateProp]).getTime();
                return itemTime >= startDateTime && itemTime <= endDateTime;
            });
        };

        const pdv = getPdv(pdvId);
        if (!pdv) return { grossProfit: 0, finalProfit: 0, costOfGoodsSold: 0, totalCosts: 0, stockValueCost: 0, stockValueResale: 0, salesCount: 0, ticket: 0, revenue: 0 };
        
        const relevantSales = filterByDate(state.sales, 'date').filter(s => s.pdvId === pdvId);
        
        const costOfGoodsSold = relevantSales.reduce((sum, s) => sum + (s.costAtTimeOfSale * s.quantity), 0);

        const realizedGrossProfitFromSales = relevantSales
            .filter(s => s.realized)
            .reduce((sum, s) => sum + (s.totalPrice - (s.costAtTimeOfSale * s.quantity)), 0);

        const realizedGrossProfitFromCredit = filterByDate(state.profitRealizations, 'date')
            .filter(p => p.pdvId === pdvId)
            .reduce((sum, p) => sum + p.amount, 0);

        const totalRealizedGrossProfit = realizedGrossProfitFromSales + realizedGrossProfitFromCredit;

        const revenue = relevantSales
            .filter(s => s.paymentMethod === 'pix' || s.paymentMethod === 'outros')
            .reduce((sum, s) => sum + s.totalPrice, 0);

        const fixedCosts = (pdv.fixedCosts || []).reduce((sum, c) => sum + c.value, 0);
        const variableCostsInPeriod = filterByDate(pdv.variableCosts, 'date').reduce((sum, c) => sum + c.value, 0);
        const totalCosts = fixedCosts + variableCostsInPeriod;
        
        const finalProfit = totalRealizedGrossProfit - totalCosts;

        const stockValueCost = (pdv.inventory || []).reduce((sum, item) => {
            const product = getProduct(item.productId);
            return sum + ((product?.currentCost || 0) * item.quantity);
        }, 0);

        const stockValueResale = (pdv.inventory || []).reduce((sum, item) => {
            const product = getProduct(item.productId);
            return sum + ((product?.resalePrice || 0) * item.quantity);
        }, 0);
        
        const totalSoldValue = relevantSales.reduce((sum, s) => sum + s.totalPrice, 0);

        return {
            grossProfit: totalRealizedGrossProfit,
            finalProfit,
            costOfGoodsSold,
            totalCosts,
            stockValueCost,
            stockValueResale,
            salesCount: relevantSales.length,
            ticket: relevantSales.length > 0 ? totalSoldValue / relevantSales.length : 0,
            revenue
        };
    };

    // --- FUNÇÕES DE RENDERIZAÇÃO (VIEWS) ---
    const render = () => {
        if (!state.activeView) state.activeView = 'dashboard';
        mainContent.innerHTML = '';
        updateNavigation();
        const viewFunction = {
            'dashboard': renderDashboard,
            'pdvs': renderPdvs,
            'products': renderProducts,
            'clients': renderClients,
            'finances': renderFinances,
            'reports': renderReports,
            'central_cash': renderCentralCash,
        }[state.activeView];
        
        if (viewFunction) viewFunction();
    };

    const updateNavigation = () => {
        const navLinks = [
            { id: 'dashboard', text: 'Dashboard' },
            { id: 'pdvs', text: 'PDVs' },
            { id: 'products', text: 'Produtos' },
            { id: 'clients', text: 'Clientes' },
            { id: 'finances', text: 'Financeiro' },
            { id: 'central_cash', text: 'Caixa Central' },
            { id: 'reports', text: 'Relatórios' }
        ];

        const createLink = (link, isMobile) => `
            <button data-view="${link.id}" class="nav-link ${isMobile ? 'block w-full text-left px-4 py-3 text-base font-medium rounded-md' : 'flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-full transition-colors'} ${state.activeView === link.id ? 'bg-orange-500 text-white' : 'text-gray-300 hover:bg-gray-600'}">
                <span>${link.text}</span>
            </button>`;

        mainNav.innerHTML = navLinks.map(link => createLink(link, false)).join('');
        mobileMenu.innerHTML = navLinks.map(link => createLink(link, true)).join('');

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                state.activeView = e.currentTarget.dataset.view;
                mobileMenu.classList.add('hidden');
                render();
            });
        });
    };

    function renderDashboard() {
        const totalMetrics = (state.pdvs || []).reduce((totals, pdv) => {
            const metrics = calculatePdvMetrics(pdv.id);
            totals.revenue += metrics.revenue;
            totals.grossProfit += metrics.grossProfit;
            totals.costOfGoodsSold += metrics.costOfGoodsSold;
            totals.totalCosts += metrics.totalCosts;
            totals.finalProfit += metrics.finalProfit;
            return totals;
        }, { revenue: 0, grossProfit: 0, costOfGoodsSold: 0, totalCosts: 0, finalProfit: 0 });

        const summaryCards = `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6 mb-8">
                <div class="bg-gray-800 p-5 rounded-xl shadow-lg"><h3 class="text-sm font-medium text-gray-400">Faturamento (PIX)</h3><p class="mt-1 text-3xl font-semibold text-orange-500">${formatCurrency(totalMetrics.revenue)}</p></div>
                <div class="bg-gray-800 p-5 rounded-xl shadow-lg"><h3 class="text-sm font-medium text-gray-400">Custo de Produtos Vendidos</h3><p class="mt-1 text-3xl font-semibold text-yellow-500">${formatCurrency(totalMetrics.costOfGoodsSold)}</p></div>
                <div class="bg-gray-800 p-5 rounded-xl shadow-lg"><h3 class="text-sm font-medium text-gray-400">Lucro Bruto (Realizado)</h3><p class="mt-1 text-3xl font-semibold text-green-400">${formatCurrency(totalMetrics.grossProfit)}</p></div>
                <div class="bg-gray-800 p-5 rounded-xl shadow-lg"><h3 class="text-sm font-medium text-gray-400">Custos Totais</h3><p class="mt-1 text-3xl font-semibold text-red-400">${formatCurrency(totalMetrics.totalCosts)}</p></div>
                <div class="bg-gray-800 p-5 rounded-xl shadow-lg"><h3 class="text-sm font-medium text-gray-400">Resultado Líquido</h3><p class="mt-1 text-3xl font-semibold  ${totalMetrics.finalProfit >= 0 ? 'text-green-500' : 'text-red-500'}">${formatCurrency(totalMetrics.finalProfit)}</p></div>
            </div>`;

        const pdvStatusSection = `
            <h2 class="text-2xl font-bold mb-4 text-orange-500">Status dos PDVs</h2>
            <div id="pdv-status-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${(state.pdvs || []).length > 0 ? (state.pdvs || []).map(pdv => {
                    const metrics = calculatePdvMetrics(pdv.id);
                    const statusColor = metrics.finalProfit >= 0 ? 'border-green-500' : 'border-red-500';
                    const goal = state.goals?.[pdv.id];
                    let goalProgressHtml = '<p class="text-xs text-gray-500">Nenhuma meta definida.</p>';

                    let profitLabel = 'Resultado Final';
                    if (metrics.finalProfit < 0 && metrics.grossProfit === 0) {
                        profitLabel = 'Custos Lançados';
                    }

                    if (goal && goal.target > 0 && goal.dueDate) {
                        const today = new Date().setHours(0,0,0,0);
                        const dueDate = new Date(goal.dueDate).setHours(23,59,59,999);
                        const daysRemaining = Math.max(1, Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)));
                        const revenueForGoal = calculatePdvMetrics(pdv.id, new Date(new Date(goal.dueDate).setDate(1)).toISOString().split('T')[0], goal.dueDate).revenue;
                        const remainingTarget = Math.max(0, goal.target - revenueForGoal);
                        const dailyTarget = remainingTarget / daysRemaining;
                        const progress = goal.target > 0 ? Math.min(100, (revenueForGoal / goal.target) * 100) : 0;

                        goalProgressHtml = `
                            <p class="text-sm text-gray-300 mb-1">Meta: ${formatCurrency(goal.target)} até ${new Date(goal.dueDate).toLocaleDateString('pt-BR')}</p>
                            <div class="w-full bg-gray-700 rounded-full h-2.5"><div class="bg-orange-500 h-2.5 rounded-full" style="width: ${progress}%"></div></div>
                            <p class="text-xs text-gray-400 mt-1">${progress.toFixed(1)}% | Venda diária necessária: ${formatCurrency(dailyTarget)}</p>`;
                    }

                    return `
                        <div class="bg-gray-800 rounded-xl shadow-lg p-5 border-l-4 ${statusColor}">
                            <h3 class="text-lg font-bold text-white">${pdv.name}</h3>
                            <p class="text-2xl font-bold ${metrics.finalProfit >= 0 ? 'text-green-500' : 'text-red-500'} mt-2">${formatCurrency(metrics.finalProfit)}</p>
                            <p class="text-xs text-gray-400">${profitLabel}</p>
                            <div class="mt-4 pt-4 border-t border-gray-700">
                                <h4 class="text-sm font-semibold text-orange-400 mb-2">Meta do Mês</h4>
                                ${goalProgressHtml}
                            </div>
                        </div>`;
                }).join('') : '<p class="text-gray-400 col-span-full text-center">Nenhum PDV cadastrado.</p>'}
            </div>`;

        mainContent.innerHTML = `<div class="fade-in">${summaryCards}${pdvStatusSection}</div>`;
    }
    
    // --- FUNÇÕES DE PDVs ---
    function renderPdvs() {
        mainContent.innerHTML = `
            <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
                <h1 class="text-3xl font-bold text-orange-500">Pontos de Venda (PDVs)</h1>
                <button id="add-pdv-btn" class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    + Adicionar PDV
                </button>
            </div>
            <div id="pdv-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${(state.pdvs || []).length > 0 ? (state.pdvs || []).map(pdv => {
                    const metrics = calculatePdvMetrics(pdv.id);
                    return `
                    <div class="bg-gray-800 p-5 rounded-xl shadow-lg flex flex-col justify-between">
                        <div>
                            <h2 class="text-xl font-bold text-white mb-2">${pdv.name}</h2>
                            <div class="my-4 space-y-2">
                                 <p class="text-sm flex justify-between"><span>Resultado Final:</span> <span class="font-semibold ${metrics.finalProfit >= 0 ? 'text-green-400' : 'text-red-400'}">${formatCurrency(metrics.finalProfit)}</span></p>
                                 <p class="text-sm flex justify-between"><span>Estoque (Custo):</span> <span class="font-semibold text-blue-400">${formatCurrency(metrics.stockValueCost)}</span></p>
                                 <p class="text-sm flex justify-between"><span>Potencial Venda:</span> <span class="font-semibold text-purple-400">${formatCurrency(metrics.stockValueResale)}</span></p>
                            </div>
                        </div>
                        <div class="mt-4 pt-4 border-t border-gray-700 grid grid-cols-3 gap-2">
                            <button class="view-pdv-details-btn col-span-3 bg-gray-700 hover:bg-gray-600 text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-pdv-id="${pdv.id}">Detalhes & Metas</button>
                            <button class="add-sale-pdv-btn bg-green-600 hover:bg-green-700 text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-pdv-id="${pdv.id}">+ Venda</button>
                            <button class="restock-pdv-btn bg-blue-600 hover:bg-blue-700 text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-pdv-id="${pdv.id}">+ Estoque</button>
                            <button class="add-cost-pdv-btn bg-red-600 hover:bg-red-700 text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-pdv-id="${pdv.id}">+ Custo</button>
                        </div>
                    </div>
                `}).join('') : '<p class="text-gray-400 col-span-full text-center">Clique em "Adicionar PDV" para começar.</p>'}
            </div>
        `;
    
        document.getElementById('add-pdv-btn').addEventListener('click', showAddPdvModal);
        document.querySelectorAll('.view-pdv-details-btn').forEach(btn => btn.addEventListener('click', (e) => showPdvDetails(e.currentTarget.dataset.pdvId)));
        document.querySelectorAll('.add-sale-pdv-btn').forEach(btn => btn.addEventListener('click', (e) => showAddSaleModal(e.currentTarget.dataset.pdvId)));
        document.querySelectorAll('.restock-pdv-btn').forEach(btn => btn.addEventListener('click', (e) => showRestockModal(e.currentTarget.dataset.pdvId)));
        document.querySelectorAll('.add-cost-pdv-btn').forEach(btn => btn.addEventListener('click', (e) => showAddVariableCostModal(e.currentTarget.dataset.pdvId)));
    }

    const showAddPdvModal = () => {
        Swal.fire({
            title: 'Adicionar Novo PDV',
            html: `
                <input id="pdv-name" class="swal2-input" placeholder="Nome do PDV">
                <input id="pdv-investment" type="number" step="0.01" class="swal2-input" placeholder="Investimento Inicial">
                <input id="pdv-fixed-cost-name" class="swal2-input" placeholder="Nome do Custo Fixo (ex: Aluguel)">
                <input id="pdv-fixed-cost-value" type="number" step="0.01" class="swal2-input" placeholder="Valor do Custo Fixo">
            `,
            confirmButtonText: 'Salvar',
            focusConfirm: false,
            preConfirm: () => ({
                name: document.getElementById('pdv-name').value,
                investment: parseFloat(document.getElementById('pdv-investment').value),
                costName: document.getElementById('pdv-fixed-cost-name').value,
                costValue: parseFloat(document.getElementById('pdv-fixed-cost-value').value),
            })
        }).then((result) => {
            if (result.isConfirmed) {
                const { name, investment, costName, costValue } = result.value;
                if (!name) { 
                    Swal.fire('Erro', 'O nome do PDV é obrigatório.', 'error');
                    return;
                }
                const newPdv = { id: generateId(), name, initialInvestment: investment || 0, fixedCosts: [], variableCosts: [], inventory: [] };
                if(costName && !isNaN(costValue)) {
                    newPdv.fixedCosts.push({ id: generateId(), name: costName, value: costValue });
                }
                if(!state.pdvs) state.pdvs = [];
                state.pdvs.push(newPdv);
                saveDataToServer();
                render();
            }
        });
    };
    
    const showAddVariableCostModal = (pdvId) => {
        const pdv = getPdv(pdvId);
        Swal.fire({
            title: `Adicionar Custo Variável para ${pdv.name}`,
            html: `
                <input id="cost-name" class="swal2-input" placeholder="Descrição do Custo">
                <input id="cost-value" type="number" step="0.01" class="swal2-input" placeholder="Valor do Custo">
            `,
            confirmButtonText: 'Adicionar',
            preConfirm: () => ({
                name: document.getElementById('cost-name').value,
                value: parseFloat(document.getElementById('cost-value').value)
            })
        }).then(result => {
            if (result.isConfirmed && result.value.name && !isNaN(result.value.value)) {
                if (!pdv.variableCosts) pdv.variableCosts = [];
                pdv.variableCosts.push({
                    id: generateId(),
                    name: result.value.name,
                    value: result.value.value,
                    date: new Date().toISOString()
                });
                saveDataToServer();
                render();
                Swal.fire('Sucesso', 'Custo variável adicionado.', 'success');
            }
        });
    };

    function showPdvDetails(pdvId) {
        const pdv = getPdv(pdvId);
        const metrics = calculatePdvMetrics(pdvId);
        const goal = state.goals?.[pdv.id] || {};
    
        const inventoryHtml = (pdv.inventory || []).length > 0 ? pdv.inventory.map(item => {
            const product = getProduct(item.productId);
            if (!product) return '';
            return `<li class="flex justify-between items-center text-sm py-1">
                        <span>${product.name} (${item.quantity} un.)</span>
                        <button class="edit-stock-btn text-orange-400 hover:text-orange-300 text-xs font-semibold" data-pdv-id="${pdv.id}" data-product-id="${product.id}">EDITAR</button>
                    </li>`;
        }).join('') : '<p class="text-sm text-gray-500">Estoque vazio.</p>';

        Swal.fire({
            title: `Detalhes de ${pdv.name}`,
            width: '90%',
            maxWidth: '800px',
            html: `
                <div class="text-left space-y-6 p-2 md:p-4">
                     <div class="bg-gray-700/50 p-4 rounded-lg">
                        <h3 class="font-bold text-lg text-white mb-2">Definir Meta Mensal</h3>
                         <div class="flex flex-col sm:flex-row items-center gap-2">
                             <input type="number" id="goal-target" class="swal2-input flex-grow" placeholder="Valor da Meta" value="${goal.target || ''}">
                             <input type="date" id="goal-due-date" class="swal2-input flex-grow" value="${goal.dueDate || ''}">
                             <button id="save-goal-btn" class="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 w-full sm:w-auto">Salvar Meta</button>
                         </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="bg-gray-700/50 p-4 rounded-lg">
                             <h3 class="font-bold text-lg text-white">Inventário Atual</h3>
                             <ul class="mt-2 space-y-1 max-h-40 overflow-y-auto pr-2">${inventoryHtml}</ul>
                        </div>
                        <div class="bg-gray-700/50 p-4 rounded-lg">
                            <h3 class="font-bold text-lg text-white">Resumo Financeiro</h3>
                            <ul class="mt-2 space-y-2 text-sm">
                                <li class="flex justify-between"><span>Lucro Bruto Realizado:</span> <span class="font-bold text-green-400">${formatCurrency(metrics.grossProfit)}</span></li>
                                <li class="flex justify-between"><span>Resultado Final (Líquido):</span> <span class="font-bold text-xl ${metrics.finalProfit >= 0 ? 'text-green-500' : 'text-red-500'}">${formatCurrency(metrics.finalProfit)}</span></li>
                                <li class="flex justify-between"><span>Valor em Estoque:</span> <span class="font-bold text-blue-400">${formatCurrency(metrics.stockValueCost)}</span></li>
                            </ul>
                        </div>
                    </div>
                </div>
            `,
            didOpen: () => {
                document.getElementById('save-goal-btn').addEventListener('click', () => {
                    const target = parseFloat(document.getElementById('goal-target').value);
                    const dueDate = document.getElementById('goal-due-date').value;
                    if (target > 0 && dueDate) {
                        if (!state.goals) state.goals = {};
                        state.goals[pdv.id] = { target, dueDate };
                        saveDataToServer();
                        Swal.close();
                        renderDashboard();
                    } else {
                        Swal.showValidationMessage('Informe um valor e data válidos para a meta.');
                    }
                });
                document.querySelectorAll('.edit-stock-btn').forEach(btn => btn.addEventListener('click', e => {
                    const { pdvId, productId } = e.currentTarget.dataset;
                    showEditStockModal(pdvId, productId);
                }));
            }
        });
    }
    
    // --- FUNÇÕES DE PRODUTOS E ESTOQUE ---
    function renderProducts() {
        mainContent.innerHTML = `
            <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
                <h1 class="text-3xl font-bold text-orange-500">Produtos</h1>
                <button id="add-product-btn" class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">+ Adicionar Produto</button>
            </div>
            <div class="bg-gray-800 rounded-xl shadow-lg overflow-x-auto">
                <table class="w-full text-sm text-left text-gray-300">
                    <thead class="text-xs text-gray-400 uppercase bg-gray-700">
                        <tr>
                            <th scope="col" class="px-6 py-3">Produto</th>
                            <th scope="col" class="px-6 py-3">Custo</th>
                            <th scope="col" class="px-6 py-3">Venda</th>
                            <th scope="col" class="px-6 py-3">Lucro</th>
                            <th scope="col" class="px-6 py-3">Estoque Total</th>
                            <th scope="col" class="px-6 py-3">Ação</th>
                        </tr>
                    </thead>
                    <tbody id="product-table-body">
                        ${(state.products || []).map(product => `
                            <tr class="bg-gray-800 border-b border-gray-700 hover:bg-gray-700/50">
                                <td class="px-6 py-4 font-medium text-white whitespace-nowrap">${product.name}</td>
                                <td class="px-6 py-4">${formatCurrency(product.currentCost)}</td>
                                <td class="px-6 py-4">${formatCurrency(product.resalePrice)}</td>
                                <td class="px-6 py-4 text-green-400">${formatCurrency(product.resalePrice - product.currentCost)}</td>
                                <td class="px-6 py-4">${(state.pdvs || []).reduce((sum, pdv) => sum + ((pdv.inventory || []).find(i => i.productId === product.id)?.quantity || 0), 0)} un.</td>
                                <td class="px-6 py-4"><button class="edit-product-btn text-orange-400 hover:text-orange-300 text-xs font-semibold" data-product-id="${product.id}">EDITAR</button></td>
                            </tr>`).join('') || '<tr><td colspan="6" class="text-center py-8 text-gray-400">Nenhum produto cadastrado.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('add-product-btn').addEventListener('click', showAddProductModal);
        document.querySelectorAll('.edit-product-btn').forEach(btn => btn.addEventListener('click', e => showEditProductModal(e.currentTarget.dataset.productId)));
    }
    
    const showAddProductModal = () => {
        Swal.fire({
            title: 'Adicionar Produto',
            html: `<input id="product-name" class="swal2-input" placeholder="Nome"><input id="product-cost" type="number" step="0.01" class="swal2-input" placeholder="Custo"><input id="product-resale" type="number" step="0.01" class="swal2-input" placeholder="Preço de Venda">`,
            confirmButtonText: 'Salvar',
            preConfirm: () => ({ name: document.getElementById('product-name').value, cost: parseFloat(document.getElementById('product-cost').value), resalePrice: parseFloat(document.getElementById('product-resale').value) })
        }).then(result => {
            if (result.isConfirmed) {
                const { name, cost, resalePrice } = result.value;
                if(name && !isNaN(cost) && !isNaN(resalePrice)) {
                    if (!state.products) state.products = [];
                    state.products.push({ id: generateId(), name, currentCost: cost, resalePrice });
                    saveDataToServer();
                    render();
                }
            }
        });
    }

    const showEditProductModal = (productId) => {
        const product = getProduct(productId);
        Swal.fire({
            title: `Editar ${product.name}`,
            html: `<input id="product-name" class="swal2-input" value="${product.name}"><input id="product-cost" type="number" step="0.01" class="swal2-input" value="${product.currentCost}"><input id="product-resale" type="number" step="0.01" class="swal2-input" value="${product.resalePrice}">`,
            confirmButtonText: 'Salvar Alterações',
            preConfirm: () => ({ name: document.getElementById('product-name').value, cost: parseFloat(document.getElementById('product-cost').value), resalePrice: parseFloat(document.getElementById('product-resale').value) })
        }).then(result => {
            if (result.isConfirmed) {
                const { name, cost, resalePrice } = result.value;
                if(name && !isNaN(cost) && !isNaN(resalePrice)) {
                    product.name = name;
                    product.currentCost = cost;
                    product.resalePrice = resalePrice;
                    saveDataToServer();
                    render();
                }
            }
        });
    }

    const showRestockModal = (pdvId) => {
        const pdv = getPdv(pdvId);
        if ((state.products || []).length === 0) {
            Swal.fire('Atenção', 'Cadastre produtos antes de reabastecer.', 'warning');
            return;
        }
        const productOptions = (state.products || []).map(p => `<option value="${p.id}">${p.name} - Custo: ${formatCurrency(p.currentCost)}</option>`).join('');
        Swal.fire({
            title: `Reabastecer Estoque de ${pdv.name}`,
            html: `<select id="restock-product-id" class="swal2-select">${productOptions}</select><input id="restock-quantity" type="number" class="swal2-input" placeholder="Quantidade">`,
            confirmButtonText: 'Próximo',
            preConfirm: () => ({ productId: document.getElementById('restock-product-id').value, quantity: parseInt(document.getElementById('restock-quantity').value) })
        }).then(result => {
            if (result.isConfirmed && result.value.productId && result.value.quantity > 0) {
                const { productId, quantity } = result.value;
                const product = getProduct(productId);
                Swal.fire({
                    title: `Custo de ${product.name}`,
                    text: `O último custo foi ${formatCurrency(product.currentCost)}. O custo da nova compra é o mesmo?`,
                    icon: 'question',
                    showDenyButton: true,
                    confirmButtonText: 'Sim, mesmo valor',
                    denyButtonText: 'Não, novo valor',
                }).then(costResult => {
                    if (costResult.isConfirmed) {
                        addStock(pdvId, productId, quantity, product.currentCost);
                    } else if (costResult.isDenied) {
                        Swal.fire({
                            title: 'Novo Custo Unitário',
                            input: 'number',
                            inputAttributes: { step: '0.01' },
                            confirmButtonText: 'Salvar Novo Custo',
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

    const addStock = (pdvId, productId, quantity, cost) => {
        const pdv = getPdv(pdvId);
        if (!pdv.inventory) pdv.inventory = [];
        let inventoryItem = pdv.inventory.find(item => item.productId === productId);
        if (inventoryItem) inventoryItem.quantity += quantity;
        else pdv.inventory.push({ productId, quantity });
        
        const product = getProduct(productId);
        if (!pdv.variableCosts) pdv.variableCosts = [];
        pdv.variableCosts.push({ id: generateId(), name: `Compra de ${quantity}x ${product.name}`, value: cost * quantity, date: new Date().toISOString() });
        
        saveDataToServer();
        Swal.fire('Sucesso!', 'Estoque atualizado!', 'success');
        render();
    };

    const showEditStockModal = (pdvId, productId) => {
        const pdv = getPdv(pdvId);
        const product = getProduct(productId);
        const inventoryItem = (pdv.inventory || []).find(i => i.productId === productId);
        Swal.fire({
            title: `Ajustar Estoque de ${product.name}`,
            text: `PDV: ${pdv.name}`,
            input: 'number',
            inputValue: inventoryItem?.quantity || 0,
            confirmButtonText: 'Salvar',
        }).then(result => {
            if (result.isConfirmed) {
                const newQuantity = parseInt(result.value);
                if (inventoryItem) inventoryItem.quantity = newQuantity;
                else {
                    if (!pdv.inventory) pdv.inventory = [];
                    pdv.inventory.push({ productId, quantity: newQuantity });
                }
                saveDataToServer();
                Swal.fire('Sucesso', 'Estoque ajustado.', 'success').then(() => showPdvDetails(pdvId));
            }
        });
    };
    
    // --- FUNÇÕES DE CLIENTES (ATUALIZADO) ---
    function renderClients() {
        mainContent.innerHTML = `
            <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
                <h1 class="text-3xl font-bold text-orange-500">Clientes e Limites de Crédito</h1>
                <button id="add-client-btn" class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">+ Novo Cliente</button>
            </div>
            <div class="bg-gray-800 rounded-xl shadow-lg overflow-x-auto">
                <table class="w-full text-sm text-left text-gray-300">
                    <thead class="text-xs text-gray-400 uppercase bg-gray-700">
                        <tr>
                            <th scope="col" class="px-6 py-3">Nome</th>
                            <th scope="col" class="px-6 py-3">PDV</th>
                            <th scope="col" class="px-6 py-3">Limite de Crédito</th>
                            <th scope="col" class="px-6 py-3">Dívida Atual</th>
                            <th scope="col" class="px-6 py-3">Crédito Disponível</th>
                            <th scope="col" class="px-6 py-3">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(state.clients || []).map(client => {
                            const availableCredit = (client.creditLimit || 0) - (client.debt || 0);
                            const pdvName = getPdv(client.pdvId)?.name || 'N/A';
                            return `
                            <tr class="bg-gray-800 border-b border-gray-700 hover:bg-gray-700/50">
                                <td class="px-6 py-4 font-medium text-white whitespace-nowrap">${client.name}</td>
                                <td class="px-6 py-4">${pdvName}</td>
                                <td class="px-6 py-4">${formatCurrency(client.creditLimit)}</td>
                                <td class="px-6 py-4 text-red-400">${formatCurrency(client.debt)}</td>
                                <td class="px-6 py-4 text-green-400">${formatCurrency(availableCredit)}</td>
                                <td class="px-6 py-4 space-x-4">
                                    <button class="edit-client-btn text-yellow-400 hover:text-yellow-300 font-semibold" data-client-id="${client.id}">EDITAR</button>
                                    <button class="delete-client-btn text-red-500 hover:text-red-400 font-semibold" data-client-id="${client.id}">EXCLUIR</button>
                                </td>
                            </tr>
                            `
                        }).join('') || '<tr><td colspan="6" class="text-center py-8 text-gray-400">Nenhum cliente cadastrado.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('add-client-btn').addEventListener('click', showAddClientModal);
        document.querySelectorAll('.edit-client-btn').forEach(btn => btn.addEventListener('click', (e) => showEditClientModal(e.currentTarget.dataset.clientId)));
        document.querySelectorAll('.delete-client-btn').forEach(btn => btn.addEventListener('click', (e) => handleDeleteClient(e.currentTarget.dataset.clientId)));
    }

    const showAddClientModal = () => {
        const pdvOptions = (state.pdvs || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        if (!pdvOptions) {
            Swal.fire('Ação Necessária', 'Cadastre um PDV antes de adicionar um cliente.', 'info');
            return;
        }

        Swal.fire({
            title: 'Cadastrar Novo Cliente',
            html: `
                <input id="client-name" class="swal2-input" placeholder="Nome do Cliente">
                <select id="client-pdv-id" class="swal2-select mb-3">${pdvOptions}</select>
                <input id="client-credit-limit" type="number" step="0.01" class="swal2-input" placeholder="Limite de Crédito (R$)">
            `,
            confirmButtonText: 'Salvar',
            preConfirm: () => ({
                name: document.getElementById('client-name').value,
                pdvId: document.getElementById('client-pdv-id').value,
                creditLimit: parseFloat(document.getElementById('client-credit-limit').value) || 0
            })
        }).then(result => {
            if (result.isConfirmed && result.value.name && result.value.pdvId) {
                const { name, pdvId, creditLimit } = result.value;
                if (!state.clients) state.clients = [];
                state.clients.push({ id: generateId(), name, pdvId, creditLimit, debt: 0 });
                saveDataToServer();
                render();
            }
        });
    };

    const showEditClientModal = (clientId) => {
        const client = (state.clients || []).find(c => c.id === clientId);
        const pdvOptions = (state.pdvs || []).map(p => `<option value="${p.id}" ${p.id === client.pdvId ? 'selected' : ''}>${p.name}</option>`).join('');

        Swal.fire({
            title: `Editar ${client.name}`,
            html: `
                <input id="client-name" class="swal2-input" value="${client.name}">
                <select id="client-pdv-id" class="swal2-select mb-3">${pdvOptions}</select>
                <input id="client-credit-limit" type="number" step="0.01" class="swal2-input" value="${client.creditLimit}">
            `,
            confirmButtonText: 'Salvar Alterações',
            preConfirm: () => ({
                name: document.getElementById('client-name').value,
                pdvId: document.getElementById('client-pdv-id').value,
                creditLimit: parseFloat(document.getElementById('client-credit-limit').value) || 0
            })
        }).then(result => {
            if (result.isConfirmed && result.value.name && result.value.pdvId) {
                client.name = result.value.name;
                client.pdvId = result.value.pdvId;
                client.creditLimit = result.value.creditLimit;
                saveDataToServer();
                render();
            }
        });
    };
    
    const handleDeleteClient = (clientId) => {
        const client = (state.clients || []).find(c => c.id === clientId);
        if (client.debt > 0) {
            Swal.fire('Ação Bloqueada', 'Não é possível excluir um cliente com dívida pendente.', 'error');
            return;
        }
        Swal.fire({
            title: 'Tem certeza?',
            text: `Deseja excluir o cliente ${client.name}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonText: 'Cancelar',
            confirmButtonText: 'Sim, excluir!'
        }).then((result) => {
            if (result.isConfirmed) {
                state.clients = (state.clients || []).filter(c => c.id !== clientId);
                saveDataToServer();
                render();
            }
        });
    };
    
    // --- FUNÇÕES DE VENDAS ---
    const showAddSaleModal = (pdvId) => {
        const pdv = getPdv(pdvId);
        const productOptions = (pdv.inventory || []).filter(i => i.quantity > 0).map(item => {
            const product = getProduct(item.productId);
            return `<option value="${product.id}"> ${product.name} (${item.quantity} un.)</option>`
        }).join('');

        if (!productOptions) {
            Swal.fire('Estoque Vazio', `O PDV ${pdv.name} não tem produtos para vender.`, 'warning');
            return;
        }
    
        Swal.fire({
            title: `Registrar Venda - ${pdv.name}`,
            html: `
                <select id="sale-product-id" class="swal2-select">${productOptions}</select>
                <input id="sale-quantity" type="number" class="swal2-input" placeholder="Quantidade vendida">
                <div class="grid grid-cols-3 gap-2 mt-4 text-sm">
                    <label class="border border-gray-600 rounded p-2"><input type="radio" name="payment" value="pix" checked> PIX</label>
                    <label class="border border-gray-600 rounded p-2"><input type="radio" name="payment" value="wallet"> Carteira</label>
                    <label class="border border-gray-600 rounded p-2"><input type="radio" name="payment" value="credit"> Crédito</label>
                </div>
            `,
            confirmButtonText: 'Registrar',
            preConfirm: () => ({ 
                productId: document.getElementById('sale-product-id').value, 
                quantity: parseInt(document.getElementById('sale-quantity').value),
                paymentMethod: document.querySelector('input[name="payment"]:checked').value
            })
        }).then(result => {
            if (!result.isConfirmed) return;
    
            const { productId, quantity, paymentMethod } = result.value;
            const product = getProduct(productId);
            const totalPrice = product.resalePrice * quantity;
            const inventoryItem = (pdv.inventory || []).find(i => i.productId === productId);
    
            if (!quantity || quantity <= 0) {
                Swal.fire('Erro', 'Informe uma quantidade válida.', 'error');
                return;
            }
    
            if (quantity > inventoryItem.quantity) {
                Swal.fire('Estoque Insuficiente', `Disponível: ${inventoryItem.quantity} unidades.`, 'error');
                return;
            }
    
            if (paymentMethod === 'credit') {
                handleCreditSale(pdvId, productId, quantity, totalPrice);
            } else {
                processSale(pdvId, productId, quantity, paymentMethod);
            }
        });
    }
    
    const handleCreditSale = (pdvId, productId, quantity, totalPrice) => {
        const clientsOfThisPdv = (state.clients || []).filter(c => c.pdvId === pdvId);
        if (clientsOfThisPdv.length === 0) {
            Swal.fire('Ação Necessária', 'Não há clientes cadastrados para este PDV.', 'info');
            return;
        }
        const clientOptions = clientsOfThisPdv.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    
        Swal.fire({
            title: 'Venda no Crédito',
            html: `<p class="mb-4">Selecione o cliente (deste PDV):</p>
                   <select id="client-id" class="swal2-select">${clientOptions}</select>`,
            confirmButtonText: 'Confirmar Crédito',
            preConfirm: () => ({ clientId: document.getElementById('client-id').value })
        }).then(clientResult => {
            if (!clientResult.isConfirmed || !clientResult.value.clientId) return;
    
            const { clientId } = clientResult.value;
            const client = state.clients.find(c => c.id === clientId);
            const availableCredit = client.creditLimit - client.debt;
            
            if (totalPrice > availableCredit) {
                Swal.fire('Crédito Insuficiente', `O cliente ${client.name} não possui crédito suficiente.
                <br>Disponível: ${formatCurrency(availableCredit)}
                <br>Valor da Compra: ${formatCurrency(totalPrice)}`, 'error');
                return;
            }
    
            processSale(pdvId, productId, quantity, 'credit', client.id);
        });
    };
    
    const processSale = (pdvId, productId, quantity, paymentMethod, clientId = null) => {
        const product = getProduct(productId);
        const totalPrice = product.resalePrice * quantity;
        const pdv = getPdv(pdvId);
        
        if(paymentMethod === 'wallet' && state.digitalWallet.balance < totalPrice) {
            Swal.fire('Saldo Insuficiente', `Saldo em carteira (${formatCurrency(state.digitalWallet.balance)}) insuficiente.`, 'error');
            return;
        }
        
        const inventoryItem = pdv.inventory.find(i => i.productId === productId);
        inventoryItem.quantity -= quantity;
        
        if(!state.sales) state.sales = [];
        const newSale = { 
            id: generateId(), 
            pdvId, 
            productId, 
            quantity, 
            unitPrice: product.resalePrice, 
            totalPrice, 
            costAtTimeOfSale: product.currentCost, 
            date: new Date().toISOString(), 
            paymentMethod, 
            clientId,
            realized: (paymentMethod === 'pix' || paymentMethod === 'wallet')
        };
        state.sales.push(newSale);
        
        let successMessage = 'Venda registrada!';
        if (paymentMethod === 'pix') {
            if(!state.centralCash.transactions) state.centralCash.transactions = [];
            state.centralCash.transactions.push({ id: generateId(), type: 'sale', amount: totalPrice, reason: `Venda PIX: ${product.name}`, date: newSale.date });
            successMessage = 'Venda registrada no PIX e valor adicionado ao caixa.';
        } else if (paymentMethod === 'wallet') {
            state.digitalWallet.balance -= totalPrice;
            successMessage = 'Venda registrada. Saldo debitado da carteira do cliente.';
        } else if (paymentMethod === 'credit') {
            const client = state.clients.find(c => c.id === clientId);
            client.debt += totalPrice;
            state.smartCredit.receivable += totalPrice;
            successMessage = `Venda registrada no crédito de ${client.name}.`;
        }
    
        saveDataToServer();
        Swal.fire('Sucesso!', successMessage, 'success');
        render();
    };
    
    // --- FUNÇÕES FINANCEIRAS ---
    function renderFinances() {
        const clientDebtsAsReceivables = (state.clients || [])
            .filter(c => c.debt > 0)
            .map(client => ({
                id: client.id,
                description: `Dívida Cliente: ${client.name}`,
                amount: client.debt,
                dueDate: new Date().toISOString(),
                isClientDebt: true,
                pdvId: client.pdvId
            }));

        const allReceivables = [...(state.accountsReceivable || []), ...clientDebtsAsReceivables];

        mainContent.innerHTML = `
            <h1 class="text-3xl font-bold text-orange-500 mb-6">Financeiro</h1>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold text-white">Contas a Pagar</h2><button id="add-payable-btn" class="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-2 px-3 rounded-lg">+ Nova Conta</button></div>
                    <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-2">${renderFinanceList(state.accountsPayable || [], 'payable')}</div>
                </div>
                <div>
                    <div class="flex justify-between items-center mb-4"><h2 class="text-xl font-bold text-white">Contas a Receber</h2><button id="add-receivable-btn" class="bg-green-600 hover:bg-green-700 text-white text-sm font-bold py-2 px-3 rounded-lg">+ Novo Recebível</button></div>
                    <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-2">${renderFinanceList(allReceivables, 'receivable')}</div>
                </div>
            </div>`;
        document.getElementById('add-payable-btn').addEventListener('click', () => showAddFinanceModal('payable'));
        document.getElementById('add-receivable-btn').addEventListener('click', () => showAddFinanceModal('receivable'));
        document.querySelectorAll('.action-btn-pay').forEach(btn => btn.addEventListener('click', e => handlePaymentAction(e.currentTarget.dataset.id, e.currentTarget.dataset.type, e.currentTarget.dataset.clientDebt === 'true')));
        
        document.querySelectorAll('.edit-finance-btn').forEach(btn => btn.addEventListener('click', e => showEditFinanceModal(e.currentTarget.dataset.id, e.currentTarget.dataset.type)));
        document.querySelectorAll('.delete-finance-btn').forEach(btn => btn.addEventListener('click', e => handleDeleteFinanceItem(e.currentTarget.dataset.id, e.currentTarget.dataset.type)));
    }

    function renderFinanceList(items, type) {
        if (!items || items.length === 0) return '<p class="text-gray-400 text-center py-4">Nenhum lançamento.</p>';
        return items.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate)).map(item => {
            const isFullyPaid = item.paid;
            const isClientDebt = item.isClientDebt;
            const pdvName = getPdv(item.pdvId)?.name || 'Geral';
            return `
                <div class="bg-gray-800 p-4 rounded-lg flex justify-between items-center ${isFullyPaid ? 'opacity-50' : ''}">
                    <div>
                        <p class="font-semibold text-white">${item.description}</p>
                        <p class="text-sm text-gray-400">${pdvName} | ${!isClientDebt ? `Venc.: ${new Date(item.dueDate).toLocaleDateString('pt-BR')}`: 'Dívida em aberto'}</p>
                    </div>
                    <div class="text-right ml-4 flex items-center gap-4">
                        <div>
                            <p class="font-bold text-lg ${type === 'payable' ? 'text-red-400' : 'text-green-400'}">${formatCurrency(item.amount)}</p>
                            ${!isFullyPaid ? `<button class="action-btn-pay text-sm font-semibold text-blue-400 hover:text-blue-300" data-id="${item.id}" data-type="${type}" data-client-debt="${isClientDebt}">Registrar Pag/Rec</button>` : `<span class="text-sm font-semibold text-gray-500">${type === 'payable' ? 'Pago' : 'Recebido'}</span>`}
                        </div>
                        ${!isClientDebt ? `
                        <div class="flex flex-col gap-2">
                            <button class="edit-finance-btn text-xs text-yellow-400 hover:text-yellow-300" data-id="${item.id}" data-type="${type}">Editar</button>
                            <button class="delete-finance-btn text-xs text-red-500 hover:text-red-400" data-id="${item.id}" data-type="${type}">Excluir</button>
                        </div>` : ''}
                    </div>
                </div>`;
        }).join('');
    }

    const showAddFinanceModal = (type) => {
        let recurringHtml = '';
        if (type === 'payable') {
            recurringHtml = `<div class="flex items-center justify-center mt-4"><input id="finance-recurring" type="checkbox" class="h-4 w-4 rounded"><label for="finance-recurring" class="ml-2 block text-sm">Renovação Automática Mensal</label></div>`;
        }

        Swal.fire({
            title: `Nova ${type === 'payable' ? 'Conta a Pagar' : 'Conta a Receber'}`,
            html: `
                <input id="finance-description" class="swal2-input" placeholder="Descrição">
                <input id="finance-amount" type="number" step="0.01" class="swal2-input" placeholder="Valor">
                <input id="finance-due-date" type="date" class="swal2-input">
                <select id="finance-pdv-id" class="swal2-select"><option value="geral">Geral</option>${(state.pdvs || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
                ${recurringHtml}
            `,
            confirmButtonText: 'Salvar',
            preConfirm: () => ({ 
                description: document.getElementById('finance-description').value, 
                amount: parseFloat(document.getElementById('finance-amount').value), 
                dueDate: document.getElementById('finance-due-date').value, 
                pdvId: document.getElementById('finance-pdv-id').value,
                isRecurring: type === 'payable' ? document.getElementById('finance-recurring').checked : false
            })
        }).then(result => {
            if(result.isConfirmed && result.value.description && !isNaN(result.value.amount)) {
                if (type === 'payable') {
                    if (!state.accountsPayable) state.accountsPayable = [];
                    state.accountsPayable.push({ id: generateId(), ...result.value, paid: false });
                } else {
                    if (!state.accountsReceivable) state.accountsReceivable = [];
                    state.accountsReceivable.push({ id: generateId(), ...result.value, paid: false, payments: [] });
                }
                saveDataToServer();
                render();
            }
        });
    };

    const showEditFinanceModal = (id, type) => {
        const list = type === 'payable' ? state.accountsPayable : state.accountsReceivable;
        const item = list.find(i => i.id === id);
    
        Swal.fire({
            title: `Editar Lançamento`,
            html: `
                <input id="finance-description" class="swal2-input" placeholder="Descrição" value="${item.description}">
                <input id="finance-amount" type="number" step="0.01" class="swal2-input" placeholder="Valor" value="${item.amount}">
                <input id="finance-due-date" type="date" class="swal2-input" value="${item.dueDate.split('T')[0]}">
            `,
            confirmButtonText: 'Salvar Alterações',
            preConfirm: () => ({
                description: document.getElementById('finance-description').value,
                amount: parseFloat(document.getElementById('finance-amount').value),
                dueDate: document.getElementById('finance-due-date').value,
            })
        }).then(result => {
            if (result.isConfirmed && result.value.description && !isNaN(result.value.amount)) {
                item.description = result.value.description;
                item.amount = result.value.amount;
                item.dueDate = result.value.dueDate;
                saveDataToServer();
                render();
            }
        });
    };
    
    const handleDeleteFinanceItem = (id, type) => {
        Swal.fire({
            title: 'Tem certeza?',
            text: "Você não poderá reverter esta ação!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sim, excluir!',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                if (type === 'payable') {
                    state.accountsPayable = (state.accountsPayable || []).filter(i => i.id !== id);
                } else {
                    state.accountsReceivable = (state.accountsReceivable || []).filter(i => i.id !== id);
                }
                saveDataToServer();
                render();
                Swal.fire('Excluído!', 'O lançamento foi removido.', 'success');
            }
        });
    };

    const renewPayable = (item) => {
        const dueDate = new Date(item.dueDate);
        dueDate.setMonth(dueDate.getMonth() + 1);
        const newItem = { ...item, id: generateId(), dueDate: dueDate.toISOString(), paid: false };
        if (!state.accountsPayable) state.accountsPayable = [];
        state.accountsPayable.push(newItem);
    };

    const handlePaymentAction = async (id, type, isClientDebt) => {
        if (type === 'receivable' && isClientDebt) {
            const client = state.clients.find(c => c.id === id);
            const { value: paymentAmount } = await Swal.fire({
                title: `Receber de ${client.name}`,
                text: `Valor total da dívida: ${formatCurrency(client.debt)}`,
                input: 'number',
                inputValue: client.debt.toFixed(2),
                showCancelButton: true,
            });

            if (paymentAmount) {
                const receivedAmount = Math.min(parseFloat(paymentAmount), client.debt);
                
                const unrealizedSales = (state.sales || []).filter(s => s.clientId === client.id && !s.realized).sort((a,b) => new Date(a.date) - new Date(b.date));
                let amountToRealize = receivedAmount;
                
                for(const sale of unrealizedSales) {
                    if (amountToRealize <= 0) break;
                    
                    const amountFromThisSale = Math.min(amountToRealize, sale.totalPrice);
                    const profitRatio = sale.totalPrice > 0 ? (sale.totalPrice - (sale.costAtTimeOfSale * sale.quantity)) / sale.totalPrice : 0;
                    const realizedProfit = amountFromThisSale * profitRatio;
                    
                    if(!state.profitRealizations) state.profitRealizations = [];
                    state.profitRealizations.push({
                        id: generateId(),
                        date: new Date().toISOString(),
                        pdvId: sale.pdvId,
                        amount: realizedProfit
                    });
                    
                    sale.realized = true; 
                    amountToRealize -= amountFromThisSale;
                }

                client.debt -= receivedAmount;
                state.smartCredit.receivable -= receivedAmount;
                state.centralCash.transactions.push({ id: generateId(), type: 'receivable', amount: receivedAmount, reason: `Rec. Dívida: ${client.name}`, date: new Date().toISOString() });
                
                saveDataToServer();
                render();
            }
            return;
        }

        const list = type === 'payable' ? state.accountsPayable : state.accountsReceivable;
        const item = list.find(i => i.id === id);
        if (!item || item.paid) return;

        const { value: paymentAmount } = await Swal.fire({
            title: `Registrar ${type === 'payable' ? 'Pagamento' : 'Recebimento'}`,
            text: `Valor total: ${formatCurrency(item.amount)}`,
            input: 'number',
            inputValue: item.amount.toFixed(2),
            showCancelButton: true,
        });

        if (paymentAmount) {
            const receivedAmount = parseFloat(paymentAmount);
            if (type === 'payable') {
                item.paid = true;
                state.centralCash.transactions.push({ id: generateId(), type, amount: receivedAmount, reason: `Pag.: ${item.description}`, date: new Date().toISOString() });
                if (item.isRecurring) {
                    renewPayable(item);
                }
            } else { // receivable manual
                if (!item.payments) item.payments = [];
                item.payments.push({ amount: receivedAmount, date: new Date().toISOString() });
                state.centralCash.transactions.push({ id: generateId(), type, amount: receivedAmount, reason: `Rec.: ${item.description}`, date: new Date().toISOString() });
                const totalPaid = item.payments.reduce((sum, p) => sum + p.amount, 0);
                if (totalPaid >= item.amount) {
                    item.paid = true;
                }
            }
            saveDataToServer();
            render();
        }
    };
    
    // --- CAIXA CENTRAL ---
    function renderCentralCash() {
        const balance = (state.centralCash?.transactions || []).reduce((acc, t) => {
            if (t.type === 'receivable' || t.type === 'sale' || t.type === 'wallet_deposit') return acc + t.amount;
            if (t.type === 'withdrawal' || t.type === 'payable') return acc - t.amount;
            return acc;
        }, 0);

        mainContent.innerHTML = `
            <h1 class="text-3xl font-bold text-orange-500 mb-6">Caixa Central</h1>
            <div class="bg-gray-800 p-6 rounded-xl mb-8">
                <h2 class="text-gray-400 text-sm font-medium">Saldo Disponível em Caixa</h2>
                <p class="text-4xl font-bold text-green-500 mt-1">${formatCurrency(balance)}</p>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div class="lg:col-span-1 space-y-6">
                    <form id="withdrawal-form" class="bg-gray-800 p-6 rounded-xl space-y-4"><h2 class="text-lg font-bold">Realizar Retirada</h2><input type="number" id="withdrawal-amount" step="0.01" required class="w-full bg-gray-700 p-2 rounded" placeholder="Valor"><input type="text" id="withdrawal-reason" required class="w-full bg-gray-700 p-2 rounded" placeholder="Motivo"><button type="submit" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Confirmar Retirada</button></form>
                    <form id="deposit-form" class="bg-gray-800 p-6 rounded-xl space-y-4"><h2 class="text-lg font-bold">Depositar na Carteira</h2><input type="number" id="deposit-amount" step="0.01" required class="w-full bg-gray-700 p-2 rounded" placeholder="Valor"><input type="text" id="deposit-reason" required class="w-full bg-gray-700 p-2 rounded" placeholder="Nome do Cliente"><button type="submit" class="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded-lg">Confirmar Depósito</button></form>
                </div>
                <div class="lg:col-span-2">
                    <h2 class="text-xl font-bold text-white mb-4">Histórico de Transações do Caixa</h2>
                    <div class="bg-gray-800 p-4 rounded-xl max-h-96 overflow-y-auto"><div class="space-y-3">${[...(state.centralCash?.transactions || [])].reverse().map(t => `<div class="flex justify-between items-center bg-gray-700/50 p-3 rounded-md"><div><p class="font-semibold">${t.reason}</p><p class="text-xs text-gray-400">${new Date(t.date).toLocaleString('pt-BR')}</p></div><p class="font-bold ${t.type.includes('sale') || t.type.includes('rec') || t.type.includes('deposit') ? 'text-green-400' : 'text-red-400'}">${t.type.includes('pay') || t.type.includes('with') ? '-' : '+'}${formatCurrency(t.amount)}</p></div>`).join('') || '<p class="text-gray-400 text-center py-4">Nenhuma transação.</p>'}</div></div>
                </div>
            </div>`;
    
        document.getElementById('withdrawal-form').addEventListener('submit', handleWithdrawal);
        document.getElementById('deposit-form').addEventListener('submit', handleWalletDeposit);
    }
    
    const handleWithdrawal = (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('withdrawal-amount').value);
        const reason = document.getElementById('withdrawal-reason').value;
        if (amount > 0 && reason) {
            if (!state.centralCash.transactions) state.centralCash.transactions = [];
            state.centralCash.transactions.push({ id: generateId(), type: 'withdrawal', amount, reason, date: new Date().toISOString() });
            saveDataToServer();
            render();
        }
    };
    
    const handleWalletDeposit = (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('deposit-amount').value);
        const reason = document.getElementById('deposit-reason').value;
        if (amount > 0 && reason) {
            if (!state.digitalWallet) state.digitalWallet = { balance: 0 };
            state.digitalWallet.balance += amount;
            if (!state.centralCash.transactions) state.centralCash.transactions = [];
            state.centralCash.transactions.push({ id: generateId(), type: 'wallet_deposit', amount, reason: `Depósito Carteira: ${reason}`, date: new Date().toISOString() });
            saveDataToServer();
            render();
        }
    };
    
    // --- RELATÓRIOS ---
    function renderReports() {
        mainContent.innerHTML = `
            <h1 class="text-3xl font-bold text-orange-500 mb-6">Relatórios</h1>
            <div class="bg-gray-800 p-4 rounded-xl mb-6">
                <form id="report-filter-form" class="flex flex-col md:flex-row items-end gap-4">
                    <div class="w-full"><label for="report-pdv" class="text-sm">PDV</label><select id="report-pdv" class="w-full mt-1 bg-gray-700 p-2 rounded"><option value="all">Geral</option>${(state.pdvs || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
                    <div class="w-full"><label for="report-start-date" class="text-sm">Data Início</label><input type="date" id="report-start-date" class="w-full mt-1 bg-gray-700 p-2 rounded"></div>
                    <div class="w-full"><label for="report-end-date" class="text-sm">Data Fim</label><input type="date" id="report-end-date" class="w-full mt-1 bg-gray-700 p-2 rounded"></div>
                    <button type="submit" class="w-full md:w-auto bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg">Gerar</button>
                </form>
            </div><div id="report-results"></div>`;
        
        document.getElementById('report-filter-form').addEventListener('submit', handleGenerateReport);
        
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('report-start-date').value = today;
        document.getElementById('report-end-date').value = today;
        handleGenerateReport();
    }

    const handleGenerateReport = (e) => {
        if (e) e.preventDefault();
    
        const startDate = document.getElementById('report-start-date')?.value;
        const endDate = document.getElementById('report-end-date')?.value;
        const pdvId = document.getElementById('report-pdv')?.value || 'all';
    
        const pdvsToReport = pdvId === 'all' ? (state.pdvs || []) : [(state.pdvs || []).find(p => p.id === pdvId)].filter(Boolean);
        const pdvIdsToReport = pdvsToReport.map(p => p.id);
    
        const relevantSales = (state.sales || []).filter(s => {
            const saleTime = new Date(s.date).getTime();
            const isInDateRange = new Date(startDate + 'T00:00:00').getTime() <= saleTime && saleTime <= new Date(endDate + 'T23:59:59').getTime();
            const isInPdv = pdvIdsToReport.includes(s.pdvId);
            return isInDateRange && isInPdv;
        });
    
        const centralTransactions = state.centralCash?.transactions || [];
        const contasPagas = centralTransactions.filter(t => {
            const tTime = new Date(t.date).getTime();
            return t.type === 'payable' && new Date(startDate + 'T00:00:00').getTime() <= tTime && tTime <= new Date(endDate + 'T23:59:59').getTime();
        });
        const totalPago = contasPagas.reduce((sum, t) => sum + t.amount, 0);
    
        const contasRecebidas = centralTransactions.filter(t => {
            const tTime = new Date(t.date).getTime();
            return t.type === 'receivable' && new Date(startDate + 'T00:00:00').getTime() <= tTime && tTime <= new Date(endDate + 'T23:59:59').getTime();
        });
        const totalRecebido = contasRecebidas.reduce((sum, p) => sum + p.amount, 0);
    
        const faturamentoBruto = relevantSales.reduce((sum, s) => sum + s.totalPrice, 0);
        
        const lucroBrutoRealizado = pdvIdsToReport.reduce((totalProfit, currentPdvId) => {
             const metrics = calculatePdvMetrics(currentPdvId, startDate, endDate);
             return totalProfit + metrics.grossProfit;
        }, 0);

        const vendasPix = relevantSales.filter(s => s.paymentMethod === 'pix').reduce((sum, s) => sum + s.totalPrice, 0);
        const depositosCarteira = centralTransactions.filter(t => {
             const tTime = new Date(t.date).getTime();
             return t.type === 'wallet_deposit' && new Date(startDate + 'T00:00:00').getTime() <= tTime && tTime <= new Date(endDate + 'T23:59:59').getTime();
        }).reduce((sum, t) => sum + t.amount, 0);
    
        const totalEntradas = vendasPix + totalRecebido + depositosCarteira;
    
    
        document.getElementById('report-results').innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div class="bg-gray-700 p-5 rounded-lg">
                    <p class="text-sm text-gray-400">Faturamento Bruto (Todas as Vendas)</p>
                    <p class="text-3xl font-bold text-orange-400">${formatCurrency(faturamentoBruto)}</p>
                </div>
                <div class="bg-gray-700 p-5 rounded-lg">
                    <p class="text-sm text-gray-400">Lucro Bruto (Realizado)</p>
                    <p class="text-3xl font-bold text-green-400">${formatCurrency(lucroBrutoRealizado)}</p>
                </div>
                 <div class="bg-gray-700 p-5 rounded-lg">
                    <p class="text-sm text-gray-400">Total de Entradas no Caixa</p>
                    <p class="text-3xl font-bold text-cyan-400">${formatCurrency(totalEntradas)}</p>
                    <p class="text-xs text-gray-500 mt-1">Vendas PIX + Contas Recebidas + Depósitos</p>
                </div>
                <div class="bg-gray-700 p-5 rounded-lg">
                    <p class="text-sm text-gray-400">Total Recebido (de Contas a Receber)</p>
                    <p class="text-2xl font-bold">${formatCurrency(totalRecebido)}</p>
                </div>
                <div class="bg-gray-700 p-5 rounded-lg">
                    <p class="text-sm text-gray-400">Total Pago (de Contas a Pagar)</p>
                    <p class="text-2xl font-bold text-red-400">${formatCurrency(totalPago)}</p>
                </div>
                <div class="bg-gray-700 p-5 rounded-lg">
                    <p class="text-sm text-gray-400">Total de Vendas no Período</p>
                    <p class="text-2xl font-bold">${relevantSales.length}</p>
                </div>
            </div>`;
    };

    // --- INICIALIZAÇÃO DA APLICAÇÃO ---
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
    }
});

