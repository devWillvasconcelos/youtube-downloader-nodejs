const https = require('https');
const { exec } = require('child_process');
const os = require('os');

console.log('🔧 Diagnóstico do YouTube Downloader\n');

// Informações do sistema
console.log('📊 Informações do Sistema:');
console.log(`OS: ${os.platform()} ${os.release()}`);
console.log(`Node: ${process.version}`);
console.log(`Memória: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`CPU: ${os.cpus()[0].model}\n`);

// Testar conexão com YouTube
console.log('📡 Testando conexão com YouTube...');
https.get('https://www.youtube.com', {
    timeout: 5000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    console.log(`✅ YouTube respondendo (Status: ${res.statusCode})`);
    
    // Testar API do YouTube
    console.log('\n📡 Testando API do YouTube...');
    https.get('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
        console.log(`✅ Vídeo acessível (Status: ${res.statusCode})`);
        
        // Testar FFmpeg
        console.log('\n🎬 Testando FFmpeg...');
        exec('ffmpeg -version', (error, stdout) => {
            if (error) {
                console.log('❌ FFmpeg não encontrado');
                console.log('   Execute: npm install @ffmpeg-installer/ffmpeg');
            } else {
                console.log('✅ FFmpeg OK');
            }
            
            // Testar portas
            console.log('\n🌐 Testando portas...');
            testPort(3000);
        });
    }).on('error', (err) => {
        console.log('❌ Erro ao acessar vídeo:', err.message);
    });
}).on('error', (err) => {
    console.log('❌ Erro ao conectar com YouTube:', err.message);
});

function testPort(port) {
    const server = require('net').createServer();
    server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`✅ Porta ${port} está em uso (servidor rodando)`);
        } else {
            console.log(`❌ Erro na porta ${port}:`, err.message);
        }
    });
    server.once('listening', () => {
        server.close();
        console.log(`✅ Porta ${port} está livre`);
    });
    server.listen(port);
}