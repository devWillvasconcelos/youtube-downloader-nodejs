const express = require('express');
const router = express.Router();
const youtubedl = require('yt-dlp-exec');
const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const sanitize = require('sanitize-filename');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Configurar FFmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ========== FUNÇÃO PARA OBTER INFORMAÇÕES DO VÍDEO ==========
async function getVideoInfo(url) {
    try {
        console.log('📥 Obtendo informações do vídeo...');
        
        // Usar yt-dlp para obter informações
        const info = await youtubedl(url, {
            dumpJson: true,
            noPlaylist: true,
            preferFreeFormats: true,
            geoBypass: true,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
            preferInsecure: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });

        return info;
    } catch (error) {
        console.error('❌ Erro ao obter informações:', error);
        throw error;
    }
}

// ========== FUNÇÃO PARA BAIXAR VÍDEO ==========
async function downloadVideo(url, outputPath, format = 'best[ext=mp4]/best') {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(`📥 Baixando vídeo para: ${outputPath}`);
            
            // Usar yt-dlp para download
            await youtubedl(url, {
                output: outputPath,
                format: format,
                noPlaylist: true,
                preferFreeFormats: true,
                geoBypass: true,
                noWarnings: true,
                noCallHome: true,
                noCheckCertificate: true,
                preferInsecure: true,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            });

            // Verificar se o arquivo foi criado
            if (fs.existsSync(outputPath)) {
                console.log('✅ Download concluído!');
                resolve(outputPath);
            } else {
                reject(new Error('Arquivo não encontrado após download'));
            }
        } catch (error) {
            console.error('❌ Erro no download:', error);
            reject(error);
        }
    });
}

// ========== FUNÇÃO PARA BAIXAR APENAS ÁUDIO ==========
async function downloadAudio(url, outputPath, quality = '128') {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(`🎵 Baixando áudio para: ${outputPath}`);
            
            // Usar yt-dlp para baixar e extrair áudio
            await youtubedl(url, {
                output: outputPath,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: quality,
                format: 'bestaudio/best',
                noPlaylist: true,
                preferFreeFormats: true,
                geoBypass: true,
                noWarnings: true,
                noCallHome: true,
                noCheckCertificate: true,
                preferInsecure: true,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            });

            // O yt-dlp já salva como .mp3, mas podemos verificar
            const possibleFile = outputPath;
            if (fs.existsSync(possibleFile)) {
                console.log('✅ Download de áudio concluído!');
                resolve(possibleFile);
            } else {
                // Tentar encontrar o arquivo com extensão .mp3
                const files = fs.readdirSync(path.dirname(outputPath));
                const mp3File = files.find(f => f.includes(path.basename(outputPath, '.mp3')) && f.endsWith('.mp3'));
                if (mp3File) {
                    const fullPath = path.join(path.dirname(outputPath), mp3File);
                    if (fullPath !== outputPath) {
                        fs.renameSync(fullPath, outputPath);
                    }
                    resolve(outputPath);
                } else {
                    reject(new Error('Arquivo de áudio não encontrado'));
                }
            }
        } catch (error) {
            console.error('❌ Erro no download do áudio:', error);
            reject(error);
        }
    });
}

// ========== ROTA DE INFORMAÇÕES ==========
router.post('/info', async (req, res) => {
    const { url } = req.body;

    console.log('\n📥 Nova solicitação de informações:');
    console.log('URL:', url);

    if (!url) {
        return res.status(400).json({
            error: 'URL não fornecida',
            details: 'Por favor, insira uma URL do YouTube'
        });
    }

    // Validar URL
    if (!url.includes('youtube.com/watch') && !url.includes('youtu.be/') && !url.includes('youtube.com/shorts/')) {
        return res.status(400).json({
            error: 'URL inválida',
            details: 'Use URLs do YouTube (youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...)'
        });
    }

    try {
        // Obter informações com timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Tempo limite excedido (30s)')), 30000);
        });

        const infoPromise = getVideoInfo(url);
        const info = await Promise.race([infoPromise, timeoutPromise]);

        console.log('✅ Informações obtidas com sucesso!');
        console.log('Título:', info.title);

        // Processar formatos de vídeo
        const videoFormats = [];
        const seenQualities = new Set();

        // Se tiver formats, usar eles
        if (info.formats && info.formats.length > 0) {
            info.formats
                .filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.height)
                .forEach(f => {
                    const quality = `${f.height}p`;
                    if (!seenQualities.has(quality)) {
                        seenQualities.add(quality);
                        videoFormats.push({
                            quality: quality,
                            format_id: f.format_id || `${f.height}+bestaudio`,
                            container: f.ext || 'mp4',
                            fps: f.fps || 30,
                            size: f.filesize ? `${(f.filesize / 1024 / 1024).toFixed(2)} MB` : 'Tamanho variável'
                        });
                    }
                });
        }

        // Se não encontrou formatos, usar padrões
        if (videoFormats.length === 0) {
            videoFormats.push(
                { quality: '1080p', format_id: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', container: 'mp4', size: 'Variável' },
                { quality: '720p', format_id: 'bestvideo[height<=720]+bestaudio/best[height<=720]', container: 'mp4', size: 'Variável' },
                { quality: '480p', format_id: 'bestvideo[height<=480]+bestaudio/best[height<=480]', container: 'mp4', size: 'Variável' },
                { quality: '360p', format_id: 'bestvideo[height<=360]+bestaudio/best[height<=360]', container: 'mp4', size: 'Variável' }
            );
        }

        // Formatos de áudio (sempre disponíveis)
        const audioFormats = [
            { quality: '320 kbps', format_id: 'bestaudio/best', container: 'mp3' },
            { quality: '256 kbps', format_id: 'bestaudio/best', container: 'mp3' },
            { quality: '192 kbps', format_id: 'bestaudio/best', container: 'mp3' },
            { quality: '128 kbps', format_id: 'bestaudio/best', container: 'mp3' }
        ];

        // Thumbnail
        const thumbnail = info.thumbnail || 
                          (info.thumbnails && info.thumbnails[info.thumbnails.length - 1]?.url) ||
                          `https://img.youtube.com/vi/${info.id}/maxresdefault.jpg`;

        res.json({
            success: true,
            title: info.title,
            duration: info.duration || 0,
            thumbnail: thumbnail,
            author: info.uploader || info.uploader_id || 'Desconhecido',
            views: info.view_count || 0,
            videoFormats: videoFormats,
            audioFormats: audioFormats
        });

    } catch (error) {
        console.error('❌ Erro detalhado:', error);

        let errorMessage = 'Erro ao processar vídeo';
        let errorDetails = error.message;
        let tips = [
            'Verifique se a URL está correta',
            'Tente um vídeo diferente'
        ];

        if (error.message.includes('Video unavailable')) {
            errorMessage = 'Vídeo indisponível';
            errorDetails = 'Este vídeo pode ser privado ou ter sido removido';
            tips = ['Tente um vídeo público'];
        } else if (error.message.includes('copyright')) {
            errorMessage = 'Vídeo protegido';
            errorDetails = 'Este vídeo tem restrições de direitos autorais';
            tips = ['Tente baixar apenas o áudio'];
        } else if (error.message.includes('410') || error.message.includes('Gone')) {
            errorMessage = 'Vídeo bloqueado (Erro 410)';
            errorDetails = 'O YouTube está bloqueando o acesso temporariamente';
            tips = [
                'Aguarde alguns minutos e tente novamente',
                'Use uma VPN se necessário',
                'Tente um vídeo diferente'
            ];
        } else if (error.message.includes('Timeout')) {
            errorMessage = 'Tempo limite excedido';
            errorDetails = 'O servidor demorou muito para responder';
            tips = ['Verifique sua conexão', 'Tente novamente'];
        } else if (error.message.includes('sign in') || error.message.includes('login')) {
            errorMessage = 'Vídeo com restrição de idade';
            errorDetails = 'Este vídeo requer login';
            tips = ['Tente um vídeo diferente', 'Configure cookies de uma conta do YouTube'];
        }

        res.status(500).json({
            error: errorMessage,
            details: errorDetails,
            tips: tips
        });
    }
});

// ========== ROTA DE DOWNLOAD ==========
router.post('/download', async (req, res) => {
    const { url, type, quality, format_id } = req.body;

    console.log('\n📥 Iniciando download:');
    console.log('Tipo:', type);
    console.log('Qualidade:', quality);

    try {
        // Primeiro, obter informações para o título
        const info = await getVideoInfo(url);
        let title = info.title || 'video';
        
        // Remover caracteres inválidos para nome de arquivo
        title = sanitize(title).replace(/\s+/g, '_').replace(/[^\w\-_]/g, '');
        const timestamp = Date.now();
        const filename = `${title}_${timestamp}`;

        if (type === 'audio') {
            // Download de áudio
            const outputPath = path.join(__dirname, '../downloads/audio', `${filename}.mp3`);
            
            console.log('🎵 Iniciando download de áudio...');
            
            // Usar yt-dlp para baixar e converter
            await downloadAudio(url, outputPath, quality);

            // Verificar se o arquivo existe
            if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                console.log(`✅ Áudio baixado: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                
                res.json({
                    success: true,
                    message: 'Áudio baixado com sucesso!',
                    file: `/downloads/audio/${filename}.mp3`,
                    filename: `${title}.mp3`
                });
            } else {
                throw new Error('Arquivo de áudio não foi criado');
            }

        } else {
            // Download de vídeo
            const outputPath = path.join(__dirname, '../downloads/video', `${filename}.mp4`);
            
            console.log('🎬 Iniciando download de vídeo...');
            
            // Determinar formato
            const format = format_id || 'best[ext=mp4]/best';
            
            // Usar yt-dlp para download
            await downloadVideo(url, outputPath, format);

            // Verificar se o arquivo existe
            if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                console.log(`✅ Vídeo baixado: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                
                res.json({
                    success: true,
                    message: 'Vídeo baixado com sucesso!',
                    file: `/downloads/video/${filename}.mp4`,
                    filename: `${title}.mp4`
                });
            } else {
                throw new Error('Arquivo de vídeo não foi criado');
            }
        }

    } catch (error) {
        console.error('❌ Erro detalhado:', error);

        let errorMessage = 'Erro ao processar download';
        let errorDetails = error.message;
        let tips = [
            'Verifique sua conexão com a internet',
            'Tente novamente',
            'Tente baixar em qualidade mais baixa'
        ];

        if (error.message.includes('410') || error.message.includes('Gone')) {
            errorMessage = 'Download bloqueado temporariamente';
            errorDetails = 'O YouTube está bloqueando downloads no momento';
            tips = [
                'Aguarde alguns minutos e tente novamente',
                'Use uma VPN se necessário',
                'Tente baixar apenas o áudio'
            ];
        } else if (error.message.includes('ffmpeg')) {
            errorMessage = 'Erro no FFmpeg';
            errorDetails = 'Problema na conversão do áudio';
            tips = ['Verifique a instalação do FFmpeg', 'Tente novamente'];
        } else if (error.message.includes('sign in') || error.message.includes('login')) {
            errorMessage = 'Vídeo com restrição';
            errorDetails = 'Este vídeo requer login';
            tips = ['Tente um vídeo diferente'];
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
            errorMessage = 'Erro de conexão';
            errorDetails = 'Não foi possível conectar ao YouTube';
            tips = [
                'Verifique sua conexão com a internet',
                'Desative firewall temporariamente',
                'Verifique se o YouTube está acessível no navegador'
            ];
        }

        res.status(500).json({
            error: errorMessage,
            details: errorDetails,
            tips: tips
        });
    }
});

// ========== ROTA DE DIAGNÓSTICO ==========
router.get('/diagnostic', async (req, res) => {
    const results = [];

    try {
        // Teste 1: Verificar yt-dlp
        try {
            const version = await youtubedl('--version');
            results.push({ test: 'yt-dlp', result: 'OK', version: version.trim() });
        } catch (e) {
            results.push({ test: 'yt-dlp', result: 'Erro', error: e.message });
        }

        // Teste 2: Verificar FFmpeg
        try {
            await new Promise((resolve, reject) => {
                ffmpeg.getAvailableCodecs((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            results.push({ test: 'FFmpeg', result: 'OK' });
        } catch (e) {
            results.push({ test: 'FFmpeg', result: 'Erro', error: e.message });
        }

        // Teste 3: Testar com vídeo simples
        try {
            const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
            const info = await getVideoInfo(testUrl);
            results.push({ 
                test: 'Conexão YouTube', 
                result: 'OK', 
                video: info.title 
            });
        } catch (e) {
            results.push({ test: 'Conexão YouTube', result: 'Erro', error: e.message });
        }

        // Teste 4: Verificar pastas de download
        const audioDir = path.join(__dirname, '../downloads/audio');
        const videoDir = path.join(__dirname, '../downloads/video');
        
        results.push({ 
            test: 'Pastas de download', 
            result: 'OK', 
            audio: fs.existsSync(audioDir),
            video: fs.existsSync(videoDir)
        });

        res.json({
            timestamp: new Date().toISOString(),
            results: results,
            status: results.every(r => r.result === 'OK') ? '✅ Sistema funcionando' : '⚠️ Alguns problemas detectados'
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;