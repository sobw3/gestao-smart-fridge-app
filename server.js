const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// Middleware para parsear JSON
app.use(express.json());

// Servir arquivos estáticos da raiz do projeto
app.use(express.static(path.join(__dirname)));

// --- Estado Inicial do Banco de Dados ---
const initialState = {
    pdvs: [],
    products: [],
    sales: [],
    accountsPayable: [],
    accountsReceivable: [],
    customers: [],
    goals: {},
    centralCash: {
        transactions: []
    },
    activeView: 'dashboard'
};

// --- Funções do "Banco de Dados" (db.json) ---
const readDb = () => {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify(initialState, null, 2));
        return initialState;
    }
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        const dbState = JSON.parse(data);
        return { ...initialState, ...dbState };
    } catch (error) {
        console.error("Erro ao ler db.json, restaurando para o estado inicial:", error);
        fs.writeFileSync(DB_PATH, JSON.stringify(initialState, null, 2));
        return initialState;
    }
};

const writeDb = (data) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// --- Rotas da API ---

// Rota de Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'smart@20252025') {
        res.status(200).send({ message: 'Login bem-sucedido' });
    } else {
        res.status(401).send({ message: 'Credenciais inválidas' });
    }
});

// Rota para obter todos os dados
app.get('/api/data', (req, res) => {
    const data = readDb();
    res.json(data);
});

// Rota para salvar todos os dados
app.post('/api/data', (req, res) => {
    const data = req.body;
    writeDb(data);
    res.status(200).send({ message: 'Dados salvos com sucesso' });
});

// Rota de fallback para servir o index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

