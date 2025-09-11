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
            const data = await response.json();
            // Garante que o estado tenha a nova estrutura de 'clientes'
            state = {
                customers: [], // Garante que a propriedade exista
                ...data
            };
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

    /**
     * Formata um número para o formato de moeda BRL (Real).
     * @param {number} value - O valor a ser formatado.
     * @returns {string} O valor formatado como moeda.
     */
    const formatCurrency = (value) => {
        if (typeof value !== 'number') return 'R$ 0,00';
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    /**
     * Gera um ID único simples.
     * @returns {string} Um ID único.
     */
    const generateId = () => `id_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`;

    // --- FUNÇÕES DE AUTENTICAÇÃO ---

    const checkAuth = () => {
        return sessionStorage.getItem('isLoggedIn') === 'true';
    };

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
                Swal.fire({
                    icon: 'error',
                    title: 'Oops...',
                    text: 'Usuário ou senha incorretos!',
                });
            }
        } catch (error) {
            Swal.fire('Erro de Conexão', 'Não foi possível conectar ao servidor.', 'error');
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem('isLoggedIn');
        loginScreen.style.display = 'flex';
        appContent.style.display = 'none';
        window.location.reload();
    };

    // --- FUNÇÕES DE CÁLCULO E DADOS ---
    const getProduct = (productId) => state.products.find(p => p.id === productId);
    const getPdv = (pdvId) => state.pdvs.find(p => p.id === pdvId);
    const getCustomer = (customerId) => state.customers.find(c => c.id === customerId);

    const calculatePdvMetrics = (pdvId, startDate = null, endDate = null) => {
        let relevantSales = state.sales.filter(s => s.pdvId === pdvId);
        
        const filterByDate = (items, dateProp) => {
            if (!startDate && !endDate) return items;
            let filtered = items;
            if (startDate) {
                filtered = filtered.filter(item => new Date(item[dateProp]).setHours(0,0,0,0) >= new Date(startDate).setHours(0,0,0,0));
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filtered = filtered.filter(item => new Date(item[dateProp]) <= end);
            }
            return filtered;
        };
        
        relevantSales = filterByDate(relevantSales, 'date');
        
        const revenue = relevantSales.reduce((sum, s) => sum + s.totalPrice, 0);
        const costOfGoods = relevantSales.reduce((sum, s) => sum + (s.costAtTimeOfSale * s.quantity), 0);
        const netProfit = revenue - costOfGoods;

        const pdv = getPdv(pdvId);
        // Filtra custos fixos e variáveis por data, se aplicável
        const relevantFixedCosts = pdv?.fixedCosts || [];
        const relevantVariableCosts = filterByDate(pdv?.variableCosts || [], 'date');

        const fixedCosts = relevantFixedCosts.reduce((sum, c) => sum + c.value, 0);
        const variableCosts = relevantVariableCosts.reduce((sum, c) => sum + c.value, 0);
        const totalCosts = fixedCosts + variableCosts;

        const finalProfit = netProfit - totalCosts;

        const stockValueCost = pdv?.inventory.reduce((sum, item) => {
            const product = getProduct(item.productId);
            return sum + (product.currentCost * item.quantity);
        }, 0) || 0;

        const stockValueResale = pdv?.inventory.reduce((sum, item) => {
            const product = getProduct(item.productId);
            return sum + (product.resalePrice * item.quantity);
        }, 0) || 0;

        return {
            salesCount: relevantSales.length,
            revenue,
            netProfit,
            finalProfit,
            ticket: relevantSales.length > 0 ? revenue / relevantSales.length : 0,
            stockValueCost,
            stockValueResale,
            totalCosts
        };
    };
    
    // NOVO: Função para calcular métricas de produto
    const calculateProductMetrics = (productId) => {
        const productSales = state.sales.filter(s => s.productId === productId);
        const totalSold = productSales.reduce((sum, s) => sum + s.quantity, 0);
        const totalRevenue = productSales.reduce((sum, s) => sum + s.totalPrice, 0);
        const totalCost = productSales.reduce((sum, s) => sum + (s.costAtTimeOfSale * s.quantity), 0);
        const totalProfit = totalRevenue - totalCost;
        return { totalSold, totalRevenue, totalProfit };
    };


    // --- FUNÇÕES DE RENDERIZAÇÃO (VIEWS) ---

    const render = () => {
        if (!state.activeView) state.activeView = 'dashboard';
        mainContent.innerHTML = '';
        updateNavigation();

        switch (state.activeView) {
            case 'dashboard':
                renderDashboard();
                break;
            case 'pdvs':
                renderPdvs();
                break;
            case 'products':
                renderProducts();
                break;
            // NOVO: Rota para a nova view de Clientes
            case 'customers':
                renderCustomers();
                break;
            case 'finances':
                renderFinances();
                break;
            case 'reports':
                renderReports();
                break;
            case 'central_cash':
                renderCentralCash();
                break;
        }
    };
    
    const updateNavigation = () => {
        const navLinks = [
            { id: 'dashboard', text: 'Dashboard', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>`},
            { id: 'pdvs', text: 'PDVs', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a.75.75 0 01.75.75v.5a.75.75 0 01-1.5 0v-.5A.75.75 0 0110 2zM6.31 3.97a.75.75 0 011.06 0l.708.707a.75.75 0 01-1.06 1.06L6.31 5.03a.75.75 0 010-1.06zm9.441 1.06a.75.75 0 01-1.06-1.06l-.707.707a.75.75 0 11-1.06 1.06l.707-.707a.75.75 0 011.06 0zM4 10a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5A.75.75 0 014 10zm11.25.75a.75.75 0 010-1.5h.5a.75.75 0 010 1.5h-.5zM6.31 14.97a.75.75 0 010 1.06l-.707.707a.75.75 0 01-1.06-1.06l.707-.707a.75.75 0 011.06 0zm9.441 1.06a.75.75 0 01-1.06 0l-.708-.707a.75.75 0 11-1.06-1.06l.708.707a.75.75 0 011.06 1.06zM10 16a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5a.75.75 0 01-.75-.75zM10 5a5 5 0 110 10 5 5 0 010-10z" clip-rule="evenodd" /></svg>`},
            { id: 'products', text: 'Produtos', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v1h-2V4H7v1H5V4zM5 7h10v9a2 2 0 01-2 2H7a2 2 0 01-2-2V7z" /></svg>`},
             // NOVO: Link de navegação para Clientes
            { id: 'customers', text: 'Clientes', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0110 14.25a5 5 0 01-3.43-1.58 6.97 6.97 0 00-1.5 4.33c0 .34.024.673.07 1h9.72zM12 14a5 5 0 01-10 0v-1.25a5 5 0 0110 0v1.25z"/></svg>` },
            { id: 'finances', text: 'Financeiro', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2.25 8.25h15.5M2.25 9h15.5m-15.5 2.25h15.5M2.25 15.25h15.5M2.25 6.75h15.5v10.5h-15.5V6.75zM4.75 4.5A2.25 2.25 0 002.5 6.75v10.5A2.25 2.25 0 004.75 19.5h10.5A2.25 2.25 0 0017.5 17.25V6.75A2.25 2.25 0 0015.25 4.5H4.75z"/></svg>`},
            { id: 'central_cash', text: 'Caixa Central', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0015.5 2h-11zM10 4a.75.75 0 01.75.75v.518l3.248 1.624a.75.75 0 11-.67 1.34l-2.828-1.414V12a.75.75 0 01-1.5 0V7.818l-2.828 1.414a.75.75 0 11-.67-1.34L9.25 5.268V4.75A.75.75 0 0110 4zM8.5 14a.5.5 0 100 1h3a.5.5 0 100-1h-3z" clip-rule="evenodd" /></svg>`},
            { id: 'reports', text: 'Relatórios', icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12 1.5a.5.5 0 01.5.5v2.5a.5.5 0 01-1 0V2.382l-5.495 5.494a.5.5 0 01-.708 0L.5 3.596 2.207 2.5l3.248 3.248L12 1.5zM3 5.435L4.505 4.5 10 9.995 15.495 4.5 17 5.435v9.13a.5.5 0 01-.5.5h-13a.5.5 0 01-.5-.5V5.435z" clip-rule="evenodd" /></svg>`}
        ];
        
        const navHtml = navLinks.map(link => `
            <button data-view="${link.id}" class="nav-link flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-full transition-colors ${state.activeView === link.id ? 'bg-orange-500 text-white' : 'text-gray-300 hover:bg-gray-600'}">
                ${link.icon}
                <span>${link.text}</span>
            </button>
        `).join('');
        
        mainNav.innerHTML = navHtml;
        mobileMenu.innerHTML = navLinks.map(link => `
            <button data-view="${link.id}" class="nav-link block w-full text-left px-4 py-3 text-base font-medium rounded-md ${state.activeView === link.id ? 'bg-orange-500 text-white' : 'text-gray-300 hover:bg-gray-700'}">${link.text}</button>
        `).join('');

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                state.activeView = link.dataset.view;
                mobileMenu.classList.add('hidden'); // Esconde menu mobile ao clicar
                render();
            });
        });
    };

    function renderDashboard() {
        const totalMetrics = state.pdvs.reduce((totals, pdv) => {
            const metrics = calculatePdvMetrics(pdv.id);
            totals.revenue += metrics.revenue;
            totals.netProfit += metrics.netProfit;
            totals.stockValueCost += metrics.stockValueCost;
            totals.stockValueResale += metrics.stockValueResale;
            totals.salesCount += metrics.salesCount;
            return totals;
        }, { revenue: 0, netProfit: 0, stockValueCost: 0, stockValueResale: 0, salesCount: 0 });

        // NOVO: Calcula o total pendente dos clientes
        const totalWalletBalance = state.customers.reduce((sum, c) => sum + (c.walletBalance || 0), 0);
    
        const summaryCards = `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
                <div class="bg-gray-800 p-5 rounded-xl shadow-lg">
                    <h3 class="text-sm font-medium text-gray-400">Faturamento Total (Vendas)</h3>
                    <p class="mt-1 text-3xl font-semibold text-orange-500">${formatCurrency(totalMetrics.revenue)}</p>
                </div>
                <div class="bg-gray-800 p-5 rounded-xl shadow-lg">
                    <h3 class="text-sm font-medium text-gray-400">Lucro Líquido (Vendas)</h3>
                    <p class="mt-1 text-3xl font-semibold text-green-500">${formatCurrency(totalMetrics.netProfit)}</p>
                </div>
                <div class="bg-gray-800 p-5 rounded-xl shadow-lg">
                    <h3 class="text-sm font-medium text-gray-400">Valor em Estoque (Custo)</h3>
                    <p class="mt-1 text-3xl font-semibold text-blue-500">${formatCurrency(totalMetrics.stockValueCost)}</p>
                </div>
                 <div class="bg-gray-800 p-5 rounded-xl shadow-lg">
                    <h3 class="text-sm font-medium text-gray-400">Pendente (Clientes)</h3>
                    <p class="mt-1 text-3xl font-semibold text-yellow-500">${formatCurrency(totalWalletBalance)}</p>
                </div>
            </div>
        `;
    
        const pdvStatusSection = `
            <h2 class="text-2xl font-bold mb-4 text-orange-500">Status dos PDVs</h2>
            <div id="pdv-status-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${state.pdvs.length > 0 ? state.pdvs.map(pdv => {
                    const metrics = calculatePdvMetrics(pdv.id);
                    const statusColor = metrics.finalProfit >= 0 ? 'border-green-500' : 'border-red-500';
                    const statusText = metrics.finalProfit >= 0 ? 'Positivo' : 'Prejuízo';
                    
                    const goal = state.goals[pdv.id];
                    let goalProgressHtml = '<p class="text-xs text-gray-500">Nenhuma meta definida.</p>';
                    if (goal) {
                        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
                        const dailyTarget = (goal.target / daysInMonth) || 0;
                        const progress = (metrics.revenue / goal.target) * 100;
                        goalProgressHtml = `
                            <p class="text-sm text-gray-300 mb-1">Meta: ${formatCurrency(goal.target)}</p>
                            <div class="w-full bg-gray-700 rounded-full h-2.5">
                                <div class="bg-orange-500 h-2.5 rounded-full" style="width: ${Math.min(progress, 100)}%"></div>
                            </div>
                             <p class="text-xs text-gray-400 mt-1">${progress.toFixed(1)}% alcançado. Venda diária necessária: ${formatCurrency(dailyTarget)}</p>
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
                                <h4 class="text-sm font-semibold text-orange-400 mb-2">Meta do Mês</h4>
                                ${goalProgressHtml}
                            </div>
                        </div>
                    `;
                }).join('') : '<p class="text-gray-400 col-span-full text-center">Nenhum PDV cadastrado ainda.</p>'}
            </div>
        `;
    
        mainContent.innerHTML = `
            <div class="fade-in">
                ${summaryCards}
                ${pdvStatusSection}
            </div>
        `;
    }

    function renderPdvs() {
        mainContent.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-bold text-orange-500">Pontos de Venda (PDVs)</h1>
                <button id="add-pdv-btn" class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    + Adicionar PDV
                </button>
            </div>
            <div id="pdv-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- PDVs serão listados aqui -->
            </div>
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
                    <div class="mt-4 pt-4 border-t border-gray-700 flex space-x-2">
                        <button class="view-pdv-details-btn flex-1 bg-gray-700 hover:bg-gray-600 text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-pdv-id="${pdv.id}">Detalhes</button>
                        <button class="add-sale-pdv-btn flex-1 bg-green-600 hover:bg-green-700 text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-pdv-id="${pdv.id}">+ Venda</button>
                        <button class="restock-pdv-btn flex-1 bg-blue-600 hover:bg-blue-700 text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-pdv-id="${pdv.id}">+ Estoque</button>
                    </div>
                </div>
            `}).join('');
        }
    
        document.getElementById('add-pdv-btn').addEventListener('click', showAddPdvModal);
        document.querySelectorAll('.view-pdv-details-btn').forEach(btn => btn.addEventListener('click', (e) => showPdvDetails(e.target.dataset.pdvId)));
        document.querySelectorAll('.add-sale-pdv-btn').forEach(btn => btn.addEventListener('click', (e) => showAddSaleModal(e.target.dataset.pdvId)));
        document.querySelectorAll('.restock-pdv-btn').forEach(btn => btn.addEventListener('click', (e) => showRestockModal(e.target.dataset.pdvId)));
    }
    
    function renderProducts() {
        mainContent.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-bold text-orange-500">Produtos</h1>
                <button id="add-product-btn" class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    + Adicionar Produto
                </button>
            </div>
            <div class="bg-gray-800 rounded-xl shadow-lg overflow-x-auto">
                <table class="w-full text-sm text-left text-gray-300">
                    <thead class="text-xs text-gray-400 uppercase bg-gray-700">
                        <tr>
                            <th scope="col" class="px-6 py-3">Produto</th>
                            <th scope="col" class="px-6 py-3">Custo Atual</th>
                            <th scope="col" class="px-6 py-3">Preço Venda</th>
                            <th scope="col" class="px-6 py-3">Lucro/Unid.</th>
                            <th scope="col" class="px-6 py-3">Estoque Total</th>
                            <th scope="col" class="px-6 py-3">Lucro Acumulado</th>
                        </tr>
                    </thead>
                    <tbody id="product-table-body">
                        <!-- Linhas da tabela serão inseridas aqui -->
                    </tbody>
                </table>
            </div>
        `;
    
        const tableBody = document.getElementById('product-table-body');
        if (state.products.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">Nenhum produto cadastrado.</td></tr>';
        } else {
            tableBody.innerHTML = state.products.map(product => {
                const totalStock = state.pdvs.reduce((sum, pdv) => {
                    const item = pdv.inventory.find(i => i.productId === product.id);
                    return sum + (item ? item.quantity : 0);
                }, 0);
                const profitPerSale = product.resalePrice - product.currentCost;
                // NOVO: Calcula lucro acumulado
                const { totalProfit } = calculateProductMetrics(product.id);
    
                return `
                    <tr class="bg-gray-800 border-b border-gray-700 hover:bg-gray-700/50">
                        <th scope="row" class="px-6 py-4 font-medium text-white whitespace-nowrap">${product.name}</th>
                        <td class="px-6 py-4">${formatCurrency(product.currentCost)}</td>
                        <td class="px-6 py-4">${formatCurrency(product.resalePrice)}</td>
                        <td class="px-6 py-4 text-green-400">${formatCurrency(profitPerSale)}</td>
                        <td class="px-6 py-4">${totalStock} unidades</td>
                        <td class="px-6 py-4 font-bold text-teal-400">${formatCurrency(totalProfit)}</td>
                    </tr>
                `;
            }).join('');
        }
    
        document.getElementById('add-product-btn').addEventListener('click', showAddProductModal);
    }

    // NOVO: Função para renderizar a tela de Clientes
    function renderCustomers() {
        mainContent.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-bold text-orange-500">Clientes</h1>
                <button id="add-customer-btn" class="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    + Novo Cliente
                </button>
            </div>
            <div id="customer-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- Clientes serão listados aqui -->
            </div>
        `;

        const customerList = document.getElementById('customer-list');
        if (!state.customers || state.customers.length === 0) {
            customerList.innerHTML = '<p class="text-gray-400 col-span-full text-center">Nenhum cliente cadastrado.</p>';
        } else {
            customerList.innerHTML = state.customers.map(customer => `
                <div class="bg-gray-800 p-5 rounded-xl shadow-lg flex flex-col justify-between">
                    <div>
                        <h2 class="text-xl font-bold text-white mb-2">${customer.name}</h2>
                        <p class="text-sm text-gray-400">Saldo Devedor:</p>
                        <p class="text-2xl font-bold ${customer.walletBalance > 0 ? 'text-red-500' : 'text-green-500'}">${formatCurrency(customer.walletBalance)}</p>
                    </div>
                    <div class="mt-4 pt-4 border-t border-gray-700 flex space-x-2">
                        <button class="view-customer-details-btn flex-1 bg-gray-700 hover:bg-gray-600 text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-customer-id="${customer.id}">Detalhes</button>
                        <button class="add-customer-payment-btn flex-1 bg-green-600 hover:bg-green-700 text-sm font-semibold py-2 px-3 rounded-md transition-colors" data-customer-id="${customer.id}" ${customer.walletBalance <= 0 ? 'disabled' : ''}>+ Pagamento</button>
                    </div>
                </div>
            `).join('');
        }

        document.getElementById('add-customer-btn').addEventListener('click', showAddCustomerModal);
        document.querySelectorAll('.view-customer-details-btn').forEach(btn => btn.addEventListener('click', e => showCustomerDetails(e.currentTarget.dataset.customerId)));
        document.querySelectorAll('.add-customer-payment-btn').forEach(btn => btn.addEventListener('click', e => handleWalletPayment(e.currentTarget.dataset.customerId)));
    }
    
    function renderFinances() {
        mainContent.innerHTML = `
            <h1 class="text-3xl font-bold text-orange-500 mb-6">Financeiro</h1>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <!-- Contas a Pagar -->
                <div>
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold text-white">Contas a Pagar</h2>
                        <button id="add-payable-btn" class="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-2 px-3 rounded-lg transition-colors">+ Nova Conta</button>
                    </div>
                    <div id="payable-list" class="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                        ${renderFinanceList(state.accountsPayable, 'payable')}
                    </div>
                </div>
                <!-- Contas a Receber -->
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
                        <p class="text-sm text-gray-400">${pdv?.name || 'Geral'} | Venc.: ${new Date(item.dueDate).toLocaleDateString('pt-BR')}</p>
                        ${isOverdue && !isFullyPaid ? '<p class="text-xs text-red-400 font-semibold">VENCIDA</p>' : ''}
                        ${paymentStatusHtml}
                    </div>
                    <div class="text-right ml-4">
                         <p class="font-bold text-lg ${type === 'payable' ? 'text-red-400' : 'text-green-400'}">${formatCurrency(item.amount)}</p>
                        ${!isFullyPaid 
                            ? `<button class="action-btn-pay text-sm font-semibold text-blue-400 hover:text-blue-300" data-id="${item.id}" data-type="${type}">Registrar ${type === 'payable' ? 'Pagamento' : 'Recebimento'}</button>` 
                            : `<span class="text-sm font-semibold text-gray-500">${type === 'payable' ? 'Pago' : 'Recebido Integralmente'}</span>`
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
        const balance = state.centralCash.transactions.reduce((acc, t) => {
            if (t.type === 'sale' || t.type === 'receivable' || t.type === 'wallet_payment') return acc + t.amount;
            if (t.type === 'withdrawal' || t.type === 'payable' || t.type === 'stock_purchase') return acc - t.amount;
            return acc;
        }, 0);

        const totalStockValueCost = state.pdvs.reduce((sum, pdv) => sum + calculatePdvMetrics(pdv.id).stockValueCost, 0);
        
        const totalNetProfitFromSales = state.sales.reduce((sum, sale) => {
            const profit = sale.totalPrice - (sale.costAtTimeOfSale * sale.quantity);
            return sum + profit;
        }, 0);
        
        const totalPendingFromCustomers = state.customers.reduce((sum, c) => sum + (c.walletBalance || 0), 0);
        const totalEquity = balance + totalStockValueCost + totalPendingFromCustomers;

        mainContent.innerHTML = `
            <h1 class="text-3xl font-bold text-orange-500 mb-6">Caixa Central</h1>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="bg-gray-800 p-6 rounded-xl">
                    <h2 class="text-gray-400 text-sm font-medium">Saldo Disponível em Caixa</h2>
                    <p class="text-3xl font-bold text-green-500 mt-1">${formatCurrency(balance)}</p>
                </div>
                <div class="bg-gray-800 p-6 rounded-xl">
                    <h2 class="text-gray-400 text-sm font-medium">Lucro Líquido Total (Vendas)</h2>
                    <p class="text-3xl font-bold text-teal-400 mt-1">${formatCurrency(totalNetProfitFromSales)}</p>
                </div>
                <div class="bg-gray-800 p-6 rounded-xl">
                    <h2 class="text-gray-400 text-sm font-medium">Pendente em Carteiras</h2>
                    <p class="text-3xl font-bold text-yellow-500 mt-1">${formatCurrency(totalPendingFromCustomers)}</p>
                </div>
                <div class="bg-gray-800 p-6 rounded-xl">
                    <h2 class="text-gray-400 text-sm font-medium">Patrimônio Total</h2>
                    <p class="text-3xl font-bold text-purple-500 mt-1">${formatCurrency(totalEquity)}</p>
                    <p class="text-xs text-gray-500 mt-1">Caixa + Estoque + Pendente</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <h2 class="text-xl font-bold text-white mb-4">Realizar Retirada Pessoal</h2>
                    <form id="withdrawal-form" class="bg-gray-800 p-6 rounded-xl space-y-4">
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
                    <div class="bg-gray-800 p-4 rounded-xl max-h-80 overflow-y-auto">
                        <div id="cash-transactions" class="space-y-3">
                            <!-- transações aqui -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    
        const transactionsList = document.getElementById('cash-transactions');
        if (!state.centralCash.transactions || state.centralCash.transactions.length === 0) {
            transactionsList.innerHTML = '<p class="text-gray-400 text-center py-4">Nenhuma transação registrada.</p>';
        } else {
            const transactionColors = {
                receivable: 'text-green-400',
                sale: 'text-green-400',
                wallet_payment: 'text-green-400',
                withdrawal: 'text-red-400',
                payable: 'text-red-400',
                stock_purchase: 'text-red-400',
            };
            const transactionSigns = {
                receivable: '+',
                sale: '+',
                wallet_payment: '+',
                withdrawal: '-',
                payable: '-',
                stock_purchase: '-',
            };

            transactionsList.innerHTML = [...state.centralCash.transactions]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map(t => `
                <div class="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                    <div>
                        <p class="font-semibold">${t.reason}</p>
                        <p class="text-xs text-gray-400">${new Date(t.date).toLocaleString('pt-BR')}</p>
                    </div>
                    <p class="font-bold text-lg ${transactionColors[t.type] || ''}">${transactionSigns[t.type] || ''}${formatCurrency(t.amount)}</p>
                </div>
            `).join('');
        }
    
        document.getElementById('withdrawal-form').addEventListener('submit', handleWithdrawal);
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
            <div id="report-results">
                <p class="text-gray-500 text-center">Selecione um período para gerar o relatório.</p>
            </div>
        `;
    
        document.getElementById('report-filter-form').addEventListener('submit', handleGenerateReport);
    }
    
    // --- FUNÇÕES DE MANIPULAÇÃO DE EVENTOS E MODAIS ---
    
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
            preConfirm: () => {
                const name = document.getElementById('pdv-name').value;
                const investment = parseFloat(document.getElementById('pdv-investment').value);
                const costName = document.getElementById('pdv-fixed-cost-name').value;
                const costValue = parseFloat(document.getElementById('pdv-fixed-cost-value').value);
                if (!name || isNaN(investment)) {
                    Swal.showValidationMessage(`Por favor, preencha o nome e o investimento.`);
                }
                return { name, investment, costName, costValue };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const { name, investment, costName, costValue } = result.value;
                const newPdv = {
                    id: generateId(),
                    name,
                    initialInvestment: investment || 0,
                    fixedCosts: [],
                    variableCosts: [],
                    inventory: []
                };
                if(costName && !isNaN(costValue)) {
                    newPdv.fixedCosts.push({ id: generateId(), name: costName, value: costValue });
                }
                state.pdvs.push(newPdv);
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
                    id: generateId(),
                    name,
                    currentCost: cost,
                    resalePrice
                });
                await saveDataToServer();
                render();
            }
        });
    }

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
            showCancelButton: true,
            confirmButtonText: 'Próximo',
            focusConfirm: false,
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
                    text: `O último custo registrado para este produto foi ${formatCurrency(product.currentCost)}. O custo da nova compra é o mesmo?`,
                    icon: 'question',
                    showCancelButton: true,
                    showDenyButton: true,
                    confirmButtonText: 'Sim, é o mesmo valor',
                    denyButtonText: 'Não, quero informar um novo valor',
                    cancelButtonText: 'Cancelar'
                }).then(costResult => {
                    if (costResult.isConfirmed) {
                        addStock(pdvId, productId, quantity, product.currentCost);
                    } else if (costResult.isDenied) {
                        Swal.fire({
                            title: 'Novo Custo',
                            input: 'number',
                            inputLabel: `Informe o novo custo unitário para ${product.name}`,
                            inputAttributes: { step: '0.01' },
                            showCancelButton: true,
                            confirmButtonText: 'Salvar Novo Custo',
                            inputValidator: (value) => {
                                if (!value || parseFloat(value) <= 0) {
                                    return 'Você precisa informar um valor de custo válido!'
                                }
                            }
                        }).then(newCostResult => {
                            if (newCostResult.isConfirmed) {
                                const newCost = parseFloat(newCostResult.value);
                                product.currentCost = newCost; // Atualiza o custo principal do produto
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
        const totalCost = cost * quantity;

        // Adiciona como custo variável para o PDV
        pdv.variableCosts.push({
            id: generateId(),
            name: `Compra de ${quantity}x ${product.name}`,
            value: totalCost,
            date: new Date().toISOString()
        });

        // Debita a compra do caixa central
        state.centralCash.transactions.push({
            id: generateId(),
            type: 'stock_purchase',
            amount: totalCost,
            reason: `Compra estoque: ${product.name} (${pdv.name})`,
            date: new Date().toISOString()
        });
        
        await saveDataToServer();
        Swal.fire('Sucesso!', 'Estoque atualizado e valor debitado do caixa!', 'success');
        render();
    };

    // ALTERADO: Modal de venda agora com opção de pagamento
    const showAddSaleModal = (pdvId) => {
        const pdv = getPdv(pdvId);
        if (!pdv.inventory || pdv.inventory.length === 0) {
            Swal.fire('Estoque Vazio', `O PDV ${pdv.name} não tem produtos no estoque para vender.`, 'warning');
            return;
        }

        const productOptions = pdv.inventory.filter(i => i.quantity > 0).map(item => {
            const product = getProduct(item.productId);
            return `<option value="${product.id}"> ${product.name} (${item.quantity} em estoque)</option>`;
        }).join('');

        if (productOptions.trim() === '') {
             Swal.fire('Estoque Vazio', `O PDV ${pdv.name} não tem produtos com estoque positivo.`, 'warning');
            return;
        }

        const customerOptions = state.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        Swal.fire({
            title: `Registrar Venda - ${pdv.name}`,
            html: `
                <select id="sale-product-id" class="swal2-select">${productOptions}</select>
                <input id="sale-quantity" type="number" class="swal2-input" placeholder="Quantidade vendida">
                
                <h3 class="swal2-title text-lg mt-4 !text-orange-500">Forma de Pagamento</h3>
                <div class="flex justify-center gap-4 my-2">
                    <label class="flex items-center">
                        <input type="radio" name="payment-method" value="cash" class="form-radio h-5 w-5 text-orange-600" checked>
                        <span class="ml-2 text-gray-300">À vista</span>
                    </label>
                    <label class="flex items-center">
                        <input type="radio" name="payment-method" value="wallet" class="form-radio h-5 w-5 text-orange-600" ${customerOptions ? '' : 'disabled'}>
                        <span class="ml-2 text-gray-300 ${customerOptions ? '' : 'opacity-50'}">Fiado (Cliente)</span>
                    </label>
                </div>
                <select id="sale-customer-id" class="swal2-select hidden">${customerOptions}</select>
                ${!customerOptions ? '<p class="text-xs text-yellow-500">Cadastre clientes para usar a opção "Fiado".</p>' : ''}
            `,
            didOpen: () => {
                const walletRadio = document.querySelector('input[value="wallet"]');
                const customerSelect = document.getElementById('sale-customer-id');
                walletRadio.addEventListener('change', () => {
                    customerSelect.classList.toggle('hidden', !walletRadio.checked);
                });
                document.querySelector('input[value="cash"]').addEventListener('change', (e) => {
                    if (e.target.checked) customerSelect.classList.add('hidden');
                });
            },
            confirmButtonText: 'Registrar',
            focusConfirm: false,
            preConfirm: () => {
                const productId = document.getElementById('sale-product-id').value;
                const quantity = parseInt(document.getElementById('sale-quantity').value);
                const inventoryItem = pdv.inventory.find(i => i.productId === productId);
                const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
                const customerId = document.getElementById('sale-customer-id').value;
                
                if (!productId || !quantity || quantity <= 0) {
                    Swal.showValidationMessage('Selecione um produto e informe a quantidade.');
                } else if (quantity > inventoryItem.quantity) {
                    Swal.showValidationMessage(`Quantidade insuficiente em estoque. Disponível: ${inventoryItem.quantity}`);
                } else if (paymentMethod === 'wallet' && !customerId) {
                    Swal.showValidationMessage('Selecione um cliente para a venda fiado.');
                }
                return { pdvId, productId, quantity, paymentMethod, customerId };
            }
        }).then(async result => {
            if (result.isConfirmed) {
                const { pdvId, productId, quantity, paymentMethod, customerId } = result.value;
                const product = getProduct(productId);
                const pdv = getPdv(pdvId);

                const inventoryItem = pdv.inventory.find(i => i.productId === productId);
                inventoryItem.quantity -= quantity;

                const newSale = {
                    id: generateId(),
                    pdvId,
                    productId,
                    quantity,
                    unitPrice: product.resalePrice,
                    totalPrice: product.resalePrice * quantity,
                    costAtTimeOfSale: product.currentCost,
                    date: new Date().toISOString(),
                    paymentMethod,
                    customerId: paymentMethod === 'wallet' ? customerId : null
                };
                state.sales.push(newSale);

                let successMessage = 'Venda Registrada!';

                if (paymentMethod === 'cash') {
                    // Adiciona a venda ao caixa central
                    state.centralCash.transactions.push({
                        id: generateId(),
                        type: 'sale',
                        amount: newSale.totalPrice,
                        reason: `Venda: ${product.name} (${pdv.name})`,
                        date: newSale.date
                    });
                    successMessage = 'Venda registrada e valor adicionado ao caixa!';
                } else { // 'wallet'
                    const customer = getCustomer(customerId);
                    if (customer) {
                        customer.walletBalance = (customer.walletBalance || 0) + newSale.totalPrice;
                        successMessage = `Venda registrada na carteira de ${customer.name}!`;
                    }
                }

                await saveDataToServer();
                Swal.fire('Sucesso!', successMessage, 'success');
                render();
            }
        });
    }

    function showPdvDetails(pdvId) {
        const pdv = getPdv(pdvId);
        const metrics = calculatePdvMetrics(pdv.id);
    
        const inventoryHtml = pdv.inventory.length > 0 ? pdv.inventory.map(item => {
            const product = getProduct(item.productId);
            if (!product) return '';
            return `<li class="flex justify-between text-sm py-1"><span>${product.name}</span> <span class="font-mono">${item.quantity} un.</span></li>`;
        }).join('') : '<p class="text-sm text-gray-500">Estoque vazio.</p>';
    
        const costsHtml = (title, costs) => {
            return `
                <h4 class="font-semibold text-orange-400 mt-4 mb-2">${title}</h4>
                ${costs.length > 0 ? `<ul>${costs.map(c => `
                    <li class="flex justify-between text-sm py-1"><span>${c.name}</span> <span class="font-semibold">${formatCurrency(c.value)}</span></li>
                `).join('')}</ul>` : '<p class="text-sm text-gray-500">Nenhum custo registrado.</p>'}
            `;
        };
    
        Swal.fire({
            title: `Detalhes de ${pdv.name}`,
            width: '800px',
            html: `
                <div class="text-left space-y-6 p-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-gray-700/50 p-4 rounded-lg">
                            <h3 class="font-bold text-lg text-white">Resumo Financeiro</h3>
                            <ul class="mt-2 space-y-2 text-sm">
                                <li class="flex justify-between"><span>Faturamento:</span> <span class="font-bold text-green-400">${formatCurrency(metrics.revenue)}</span></li>
                                <li class="flex justify-between"><span>Lucro Líquido:</span> <span class="font-bold text-green-400">${formatCurrency(metrics.netProfit)}</span></li>
                                <li class="flex justify-between"><span>Custos Totais:</span> <span class="font-bold text-red-400">${formatCurrency(metrics.totalCosts)}</span></li>
                                <li class="flex justify-between border-t border-gray-600 pt-2 mt-2"><span>Lucro Final:</span> <span class="font-bold text-xl ${metrics.finalProfit >= 0 ? 'text-green-500' : 'text-red-500'}">${formatCurrency(metrics.finalProfit)}</span></li>
                            </ul>
                        </div>
                        <div class="bg-gray-700/50 p-4 rounded-lg">
                             <h3 class="font-bold text-lg text-white">Estoque</h3>
                             <ul class="mt-2 space-y-2 text-sm">
                                <li class="flex justify-between"><span>Valor (Custo):</span> <span class="font-bold text-blue-400">${formatCurrency(metrics.stockValueCost)}</span></li>
                                <li class="flex justify-between"><span>Potencial (Venda):</span> <span class="font-bold text-purple-400">${formatCurrency(metrics.stockValueResale)}</span></li>
                             </ul>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="bg-gray-700/50 p-4 rounded-lg">
                            <h3 class="font-bold text-lg text-white">Inventário Atual</h3>
                            <ul class="mt-2 space-y-1 max-h-40 overflow-y-auto pr-2">${inventoryHtml}</ul>
                        </div>
                        <div class="bg-gray-700/50 p-4 rounded-lg">
                             <h3 class="font-bold text-lg text-white">Custos</h3>
                             ${costsHtml('Fixos', pdv.fixedCosts)}
                             ${costsHtml('Variáveis (Compras, etc)', pdv.variableCosts)}
                        </div>
                    </div>
                    
                    <div>
                        <h3 class="font-bold text-lg text-white">Definir Meta Mensal</h3>
                         <div class="flex items-center space-x-2 mt-2">
                             <input type="number" id="goal-target" step="100" class="swal2-input w-full" placeholder="Valor da Meta" value="${state.goals[pdv.id]?.target || ''}">
                             <button id="save-goal-btn" class="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700">Salvar Meta</button>
                         </div>
                    </div>
                </div>
            `,
            didOpen: () => {
                document.getElementById('save-goal-btn').addEventListener('click', async () => {
                    const target = parseFloat(document.getElementById('goal-target').value);
                    if (target && target > 0) {
                        state.goals[pdv.id] = { target };
                        await saveDataToServer();
                        Swal.close();
                        renderDashboard();
                        Swal.fire('Meta Salva!', '', 'success');
                    } else {
                        Swal.showValidationMessage('Informe um valor válido para a meta.');
                    }
                });
            }
        });
    }

    // --- FUNÇÕES FINANCEIRAS MODIFICADAS ---

    function showAddFinanceModal(type, item = null) {
        const title = `${item ? 'Editar' : 'Nova'} ${type === 'payable' ? 'Conta a Pagar' : 'Conta a Receber'}`;
        const pdvOptions = `<option value="geral" ${item?.pdvId === 'geral' ? 'selected' : ''}>Geral / Administrativo</option>` + state.pdvs.map(p => `<option value="${p.id}" ${item?.pdvId === p.id ? 'selected' : ''}>${p.name}</option>`).join('');

        let recurringHtml = '';
        if (type === 'receivable') {
            recurringHtml = `
                <div class="flex items-center justify-center mt-4">
                    <input id="finance-recurring" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" ${item?.isRecurring ? 'checked' : ''}>
                    <label for="finance-recurring" class="ml-2 block text-sm text-gray-300">Renovação Automática Mensal</label>
                </div>
            `;
        }

        Swal.fire({
            title,
            html: `
                <input id="finance-description" class="swal2-input" placeholder="Descrição (ex: Conta de Luz)" value="${item?.description || ''}">
                <input id="finance-amount" type="number" step="0.01" class="swal2-input" placeholder="Valor" value="${item?.amount || ''}">
                <input id="finance-due-date" type="date" class="swal2-input" value="${item ? new Date(item.dueDate).toISOString().split('T')[0] : ''}">
                <select id="finance-pdv-id" class="swal2-select">${pdvOptions}</select>
                ${recurringHtml}
            `,
            confirmButtonText: 'Salvar',
            focusConfirm: false,
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
                    const newItem = {
                        id: generateId(),
                        ...data,
                        paid: false,
                        payments: []
                    };
                    if (type === 'payable') {
                        state.accountsPayable.push(newItem);
                    } else {
                        state.accountsReceivable.push(newItem);
                    }
                }
                await saveDataToServer();
                render();
            }
        });
    }

    function showEditFinanceModal(id, type) {
        const list = type === 'payable' ? state.accountsPayable : state.accountsReceivable;
        const item = list.find(i => i.id === id);
        if (item) {
            showAddFinanceModal(type, item);
        }
    }

    const handleDeleteFinanceItem = async (id, type) => {
        const list = type === 'payable' ? state.accountsPayable : state.accountsReceivable;
        const item = list.find(i => i.id === id);

        Swal.fire({
            title: 'Você tem certeza?',
            text: `Deseja apagar "${item.description}"? Esta ação não pode ser desfeita.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sim, apagar!',
            cancelButtonText: 'Cancelar'
        }).then(async (result) => {
            if (result.isConfirmed) {
                if (type === 'payable') {
                    state.accountsPayable = state.accountsPayable.filter(i => i.id !== id);
                } else {
                    state.accountsReceivable = state.accountsReceivable.filter(i => i.id !== id);
                }
                await saveDataToServer();
                render();
                Swal.fire('Apagado!', 'O lançamento foi removido.', 'success');
            }
        });
    }
    
    const handlePaymentAction = async (id, type) => {
        if (type === 'payable') {
            const item = state.accountsPayable.find(i => i.id === id);
            if (!item || item.paid) return;
            item.paid = true;
            state.centralCash.transactions.push({
                id: generateId(),
                type: 'payable',
                amount: item.amount,
                reason: `Pagamento: ${item.description} (${getPdv(item.pdvId)?.name || 'Geral'})`,
                date: new Date().toISOString()
            });
            Swal.fire('Sucesso!', 'Conta marcada como paga e valor debitado do caixa central.', 'success');
        } else {
            const item = state.accountsReceivable.find(i => i.id === id);
            if (!item || item.paid) return;
            const totalPaid = (item.payments || []).reduce((sum, p) => sum + p.amount, 0);
            const remaining = item.amount - totalPaid;
            const { value: paymentAmount } = await Swal.fire({
                title: 'Registrar Recebimento',
                text: `Valor total: ${formatCurrency(item.amount)}. Restante: ${formatCurrency(remaining)}`,
                input: 'number',
                inputValue: remaining.toFixed(2),
                inputAttributes: { step: '0.01' },
                showCancelButton: true,
                confirmButtonText: 'Registrar',
                cancelButtonText: 'Cancelar',
                inputValidator: (value) => {
                    if (!value || parseFloat(value) <= 0 || parseFloat(value) > remaining) {
                        return `Por favor, insira um valor válido (maior que zero e menor ou igual a ${formatCurrency(remaining)})`;
                    }
                }
            });
            if (paymentAmount) {
                const receivedAmount = parseFloat(paymentAmount);
                if (!item.payments) item.payments = [];
                item.payments.push({
                    amount: receivedAmount,
                    date: new Date().toISOString()
                });
                state.centralCash.transactions.push({
                    id: generateId(),
                    type: 'receivable',
                    amount: receivedAmount,
                    reason: `Recebimento: ${item.description} (${getPdv(item.pdvId)?.name || 'Geral'})`,
                    date: new Date().toISOString()
                });
                const newTotalPaid = totalPaid + receivedAmount;
                if (newTotalPaid >= item.amount) {
                    item.paid = true;
                    if (item.isRecurring) {
                        renewReceivable(item);
                    }
                }
                Swal.fire('Sucesso!', 'Recebimento registrado e valor creditado no caixa central.', 'success');
            }
        }
        await saveDataToServer();
        render();
    };

    const renewReceivable = (item) => {
        const dueDate = new Date(item.dueDate);
        dueDate.setMonth(dueDate.getMonth() + 1);
        const newItem = {
            ...item,
            id: generateId(),
            dueDate: dueDate.toISOString(),
            paid: false,
            payments: []
        };
        state.accountsReceivable.push(newItem);
    };

    const handleWithdrawal = async (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('withdrawal-amount').value);
        const reason = document.getElementById('withdrawal-reason').value;

        if (amount > 0 && reason) {
            state.centralCash.transactions.push({
                id: generateId(),
                type: 'withdrawal',
                amount,
                reason,
                date: new Date().toISOString()
            });
            await saveDataToServer();
            render();
            document.getElementById('withdrawal-form').reset();
        } else {
            Swal.fire('Erro', 'Preencha o valor e o motivo da retirada.', 'error');
        }
    };

    const handleGenerateReport = (e) => {
        if(e) e.preventDefault();
        const pdvId = document.getElementById('report-pdv')?.value || 'all';
        const startDate = document.getElementById('report-start-date')?.value || null;
        const endDate = document.getElementById('report-end-date')?.value || null;

        if(!startDate || !endDate){
             document.getElementById('report-results').innerHTML = `<p class="text-gray-500 text-center">Selecione um período para gerar o relatório.</p>`;
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

    // --- NOVO: Funções de gestão de clientes ---

    const showAddCustomerModal = () => {
        Swal.fire({
            title: 'Adicionar Novo Cliente',
            html: `<input id="customer-name" class="swal2-input" placeholder="Nome do Cliente">`,
            confirmButtonText: 'Salvar',
            focusConfirm: false,
            preConfirm: () => {
                const name = document.getElementById('customer-name').value;
                if (!name) {
                    Swal.showValidationMessage(`Por favor, insira o nome do cliente.`);
                }
                return { name };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const { name } = result.value;
                state.customers.push({
                    id: generateId(),
                    name,
                    walletBalance: 0
                });
                await saveDataToServer();
                render();
            }
        });
    };
    
    const showCustomerDetails = (customerId) => {
        const customer = getCustomer(customerId);
        const salesHistory = state.sales.filter(s => s.customerId === customerId).sort((a,b) => new Date(b.date) - new Date(a.date));
        
        const historyHtml = salesHistory.length > 0 ? salesHistory.map(sale => {
            const product = getProduct(sale.productId);
            const pdv = getPdv(sale.pdvId);
            return `
                <div class="flex justify-between items-center bg-gray-700/50 p-3 rounded-md">
                    <div>
                        <p class="font-semibold">${sale.quantity}x ${product.name}</p>
                        <p class="text-xs text-gray-400">${pdv.name} - ${new Date(sale.date).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <p class="font-bold text-lg text-orange-400">${formatCurrency(sale.totalPrice)}</p>
                </div>
            `;
        }).join('') : '<p class="text-sm text-gray-500 text-center py-4">Nenhuma compra registrada.</p>';

        Swal.fire({
            title: `Detalhes de ${customer.name}`,
            width: '600px',
            html: `
                <div class="text-left p-4">
                    <div class="bg-gray-700/50 p-4 rounded-lg mb-4">
                        <h3 class="font-bold text-lg text-white">Saldo Devedor</h3>
                        <p class="text-3xl font-bold ${customer.walletBalance > 0 ? 'text-red-500' : 'text-green-500'}">${formatCurrency(customer.walletBalance)}</p>
                    </div>
                    <h3 class="font-bold text-lg text-white mb-2">Histórico de Compras</h3>
                    <div class="space-y-2 max-h-60 overflow-y-auto pr-2">${historyHtml}</div>
                </div>
            `,
            confirmButtonText: 'Fechar'
        });
    };

    const handleWalletPayment = async (customerId) => {
        const customer = getCustomer(customerId);
        if (!customer || customer.walletBalance <= 0) return;

        const { value: paymentAmount } = await Swal.fire({
            title: 'Registrar Pagamento de Cliente',
            text: `Saldo devedor de ${customer.name}: ${formatCurrency(customer.walletBalance)}`,
            input: 'number',
            inputValue: customer.walletBalance.toFixed(2),
            inputAttributes: { step: '0.01', min: '0.01' },
            showCancelButton: true,
            confirmButtonText: 'Confirmar Pagamento',
            cancelButtonText: 'Cancelar',
            inputValidator: (value) => {
                if (!value || parseFloat(value) <= 0 || parseFloat(value) > customer.walletBalance) {
                    return `Insira um valor válido (maior que zero e menor ou igual a ${formatCurrency(customer.walletBalance)})`;
                }
            }
        });

        if (paymentAmount) {
            const amount = parseFloat(paymentAmount);
            customer.walletBalance -= amount;
            
            state.centralCash.transactions.push({
                id: generateId(),
                type: 'wallet_payment',
                amount: amount,
                reason: `Pagamento recebido de ${customer.name}`,
                date: new Date().toISOString()
            });

            await saveDataToServer();
            Swal.fire('Sucesso!', 'Pagamento registrado e valor adicionado ao caixa central.', 'success');
            render();
        }
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
    menuToggle.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
    });

    if (checkAuth()) {
        initApp();
    } else {
        loginScreen.style.display = 'flex';
        appContent.style.display = 'none';
    }
});
