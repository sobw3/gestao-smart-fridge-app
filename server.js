const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURAÇÃO DO BANCO DE DADOS PERSISTENTE ---
// Utiliza o caminho do Disco da Render, se disponível.
const dataPath = process.env.RENDER_DISK_PATH || __dirname;
const DB_PATH = path.join(dataPath, 'db.json');

// Garante que o diretório de dados exista
if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
}

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- Estado Inicial do Banco de Dados ---
const initialState = {
    pdvs: [], products: [], sales: [], accountsPayable: [],
    accountsReceivable: [], customers: [], goals: {},
    centralCash: { transactions: [] }, activeView: 'dashboard'
};

// --- Funções do Banco de Dados (db.json) ---
const readDb = () => {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify(initialState, null, 2));
        return initialState;
    }
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        if (data.trim() === '') return initialState;
        const dbState = JSON.parse(data);
        return { ...initialState, ...dbState };
    } catch (error) {
        console.error("Erro ao ler db.json, restaurando:", error);
        fs.writeFileSync(DB_PATH, JSON.stringify(initialState, null, 2));
        return initialState;
    }
};

const writeDb = (data) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// --- Rotas da API ---

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'smart@20252025') {
        res.status(200).send({ message: 'Login bem-sucedido' });
    } else {
        res.status(401).send({ message: 'Credenciais inválidas' });
    }
});

// Obter dados
app.get('/api/data', (req, res) => {
    res.json(readDb());
});

// Salvar dados
app.post('/api/data', (req, res) => {
    writeDb(req.body);
    res.status(200).send({ message: 'Dados salvos com sucesso' });
});

// Rota de fallback para o app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Banco de dados sendo salvo em: ${DB_PATH}`);
});

