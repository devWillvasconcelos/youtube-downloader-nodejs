const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs-extra');
const os = require('os');
const downloadRoutes = require('./routes/download');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações de rede
const networkInterfaces = os.networkInterfaces();
const localIP = Object.values(networkInterfaces)
    .flat()
    .find(iface => iface.family === 'IPv4' && !iface.internal)
    ?.address || 'localhost';

// Garantir que as pastas de download existam
fs.ensureDirSync(path.join(__dirname, 'downloads/audio'));
fs.ensureDirSync(path.join(__dirname, 'downloads/video'));

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Servir arquivos estáticos
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

// Rotas
app.use('/api', downloadRoutes);

// Rota de teste de conexão
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        server: {
            port: PORT,
            ip: localIP,
            platform: os.platform(),
            memory: process.memoryUsage()
        }
    });
});

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Tratamento de erros global
app.use((err, req, res, next) => {
    console.error('❌ Erro global:', err);
    res.status(500).json({
        error: 'Erro interno do servidor',
        details: err.message
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log('\n🚀 Servidor rodando com sucesso!');
    console.log(`📡 Local: http://localhost:${PORT}`);
    console.log(`📡 Rede: http://${localIP}:${PORT}`);
    console.log(`📁 Downloads: ${path.join(__dirname, 'downloads')}`);
    console.log('\n🔍 Para diagnóstico, acesse:');
    console.log(`   http://localhost:${PORT}/api/diagnostic\n`);
});