const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do Banco de Dados PostgreSQL
const pool = new Pool({
    // A Render irá fornecer a string de conexão através da variável de ambiente DATABASE_URL
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Middleware para parsear JSON
app.use(express.json());

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// --- Estado Inicial dos Dados ---
const initialState = {
    pdvs: [],
    products: [],
    sales: [],
    accountsPayable: [],
    accountsReceivable: [],
    clients: [],
    goals: {},
    centralCash: { transactions: [] },
    digitalWallet: { balance: 0, deposits: [] },
    smartCredit: { receivable: 0 },
    profitRealizations: []
};

// --- Funções do Banco de Dados ---

// Função para garantir que a tabela e os dados iniciais existam
const initializeDb = async () => {
    const client = await pool.connect();
    try {
        // Cria a tabela se ela não existir
        await client.query(`
            CREATE TABLE IF NOT EXISTS app_state (
                id INT PRIMARY KEY,
                data JSONB
            );
        `);
        
        // Verifica se a linha de dados já existe
        const res = await client.query('SELECT data FROM app_state WHERE id = 1');
        if (res.rowCount === 0) {
            // Se não existir, insere o estado inicial
            await client.query('INSERT INTO app_state(id, data) VALUES(1, $1)', [JSON.stringify(initialState)]);
            console.log('Banco de dados inicializado com sucesso.');
        } else {
            console.log('Banco de dados já inicializado.');
        }
    } catch (err) {
        console.error('Erro na inicialização do banco de dados:', err);
    } finally {
        client.release();
    }
};

// Nova função para ler os dados do PostgreSQL
const readDb = async () => {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT data FROM app_state WHERE id = 1');
        // Retorna os dados do banco ou o estado inicial se algo der errado
        return res.rows[0]?.data || initialState;
    } catch (err) {
        console.error('Erro ao ler dados do banco:', err);
        return initialState;
    } finally {
        client.release();
    }
};

// Nova função para escrever os dados no PostgreSQL
const writeDb = async (data) => {
    const client = await pool.connect();
    try {
        // Remove a 'activeView' que é só do frontend
        const { activeView, ...dataToSave } = data;
        // Usa "UPSERT": Insere a linha se não existir, ou atualiza se já existir
        await client.query(`
            INSERT INTO app_state (id, data) 
            VALUES (1, $1)
            ON CONFLICT (id) 
            DO UPDATE SET data = $1;
        `, [JSON.stringify(dataToSave)]);
    } catch (err) {
        console.error('Erro ao salvar dados no banco:', err);
    } finally {
        client.release();
    }
};

// --- Rotas da API ---

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'smart@20252025') {
        res.status(200).json({ message: 'Login bem-sucedido' });
    } else {
        res.status(401).json({ message: 'Credenciais inválidas' });
    }
});

app.get('/api/data', async (req, res) => {
    const data = await readDb();
    res.json(data);
});

app.post('/api/data', async (req, res) => {
    const data = req.body;
    await writeDb(data);
    res.status(200).json({ message: 'Dados salvos com sucesso' });
});

// Rota de fallback para servir o index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar o servidor e o DB
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    // Inicializa o banco de dados quando o servidor inicia
    initializeDb();
});
