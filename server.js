const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH = path.join(__dirname, 'db.json');

// Middleware para servir arquivos estáticos da pasta 'public'
app.use(express.static('public'));
// Middleware para parsear JSON no corpo das requisições
app.use(express.json());

// --- Funções Auxiliares do "Banco de Dados" ---

const readDB = () => {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error("Erro ao ler o banco de dados:", error);
    }
    // Se o arquivo não existir ou estiver vazio/corrompido, retorna o estado inicial
    return {
        pdvs: [],
        products: [],
        sales: [],
        accountsPayable: [],
        accountsReceivable: [],
        centralCash: {
            balance: 0,
            transactions: [],
        },
        goals: {},
    };
};

const writeDB = (data) => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Erro ao escrever no banco de dados:", error);
    }
};

// --- API Endpoints ---

// Endpoint de Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'smart@20252025') {
        res.status(200).json({ success: true, message: 'Login bem-sucedido' });
    } else {
        res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }
});

// Endpoint para buscar todos os dados
app.get('/api/data', (req, res) => {
    const data = readDB();
    res.json(data);
});

// Endpoint para salvar todos os dados
app.post('/api/data', (req, res) => {
    const newData = req.body;
    writeDB(newData);
    res.status(200).json({ success: true, message: 'Dados salvos com sucesso' });
});

// Rota principal que serve o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
