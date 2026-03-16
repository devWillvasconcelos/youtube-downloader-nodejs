document.addEventListener('DOMContentLoaded', () => {
    const videoUrlInput = document.getElementById('videoUrl');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loading = document.getElementById('loading');
    const loadingMessage = document.getElementById('loadingMessage');
    const videoInfo = document.getElementById('videoInfo');
    const progress = document.getElementById('progress');
    const progressMessage = document.getElementById('progressMessage');
    const result = document.getElementById('result');
    const resultMessage = document.getElementById('resultMessage');
    const error = document.getElementById('error');
    const errorTitle = document.getElementById('errorTitle');
    const errorDetails = document.getElementById('errorDetails');
    const errorTips = document.getElementById('errorTips');
    const downloadLink = document.getElementById('downloadLink');

    let currentVideoInfo = null;

    // ========== VERIFICAR SAÚDE DO SERVIDOR ==========
    checkServerHealth();

    async function checkServerHealth() {
        try {
            const response = await fetch('/api/health');
            if (response.ok) {
                console.log('✅ Servidor conectado');
            }
        } catch (err) {
            console.error('❌ Servidor não responde:', err);
            showError(
                'Servidor offline',
                'O servidor não está respondendo. Execute "npm start" para iniciá-lo.',
                ['Execute "npm start" no terminal', 'Verifique se o servidor está rodando']
            );
        }
    }

    // ========== ANALISAR VÍDEO ==========
    analyzeBtn.addEventListener('click', async () => {
        const url = videoUrlInput.value.trim();

        if (!url) {
            showError('URL não fornecida', 'Por favor, insira uma URL do YouTube');
            return;
        }

        if (!isValidYouTubeUrl(url)) {
            showError(
                'URL inválida',
                'A URL deve ser do YouTube',
                ['Use: youtube.com/watch?v=...', 'Use: youtu.be/...', 'Use: youtube.com/shorts/...']
            );
            return;
        }

        await analyzeVideo(url);
    });

    function isValidYouTubeUrl(url) {
        const patterns = [
            /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]{11}(&\S*)?$/,
            /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]{11}$/,
            /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]{11}$/,
            /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]{11}$/
        ];
        return patterns.some(pattern => pattern.test(url));
    }

    async function analyzeVideo(url) {
        showLoading('Analisando vídeo...');

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);

            const response = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const data = await response.json();

            if (response.ok && data.success) {
                currentVideoInfo = { url, ...data };
                displayVideoInfo(data);
                hideLoading();
                videoInfo.classList.remove('hidden');
            } else {
                showError(
                    data.error || 'Erro ao analisar vídeo',
                    data.details || 'Tente novamente mais tarde',
                    data.tips
                );
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                showError(
                    'Tempo limite excedido',
                    'O servidor demorou muito para responder',
                    ['Tente novamente mais tarde', 'Verifique sua conexão']
                );
            } else {
                showError(
                    'Erro de conexão',
                    'Não foi possível conectar ao servidor',
                    ['Execute "npm start" no terminal', 'Verifique se o servidor está rodando']
                );
            }
            console.error('Erro detalhado:', err);
        }
    }

    // ========== INICIAR DOWNLOAD ==========
    async function startDownload(type, quality, itag = null) {
        videoInfo.classList.add('hidden');
        showLoading(type === 'audio' ? 'Convertendo áudio...' : 'Baixando vídeo...');

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000);

            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: currentVideoInfo.url,
                    type,
                    quality,
                    itag
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const data = await response.json();

            hideLoading();

            if (response.ok && data.success) {
                showResult(data);
            } else {
                showError(
                    data.error || 'Erro no download',
                    data.details || 'Tente novamente',
                    data.tip ? [data.tip] : null
                );
            }
        } catch (err) {
            hideLoading();
            if (err.name === 'AbortError') {
                showError(
                    'Tempo limite excedido',
                    'O download demorou muito para completar',
                    ['Tente um vídeo menor', 'Escolha uma qualidade mais baixa']
                );
            } else {
                showError(
                    'Erro de conexão',
                    'Não foi possível completar o download',
                    ['Verifique sua conexão', 'Tente novamente mais tarde']
                );
            }
            console.error('Erro detalhado:', err);
        }
    }

    // ========== EXIBIR INFORMAÇÕES DO VÍDEO ==========
    function displayVideoInfo(info) {
        document.getElementById('thumbnail').src = info.thumbnail;
        document.getElementById('videoTitle').textContent = info.title;

        const duration = formatDuration(info.duration);
        document.getElementById('videoDuration').textContent = duration;
        document.getElementById('videoAuthor').textContent = info.author || 'Desconhecido';
        document.getElementById('videoViews').textContent = formatNumber(info.views);

        // Preencher qualidades de vídeo
        const videoQualitySelect = document.getElementById('videoQuality');
        videoQualitySelect.innerHTML = '';

        if (info.videoFormats && info.videoFormats.length > 0) {
            info.videoFormats.forEach(format => {
                const option = document.createElement('option');
                option.value = format.quality;
                option.textContent = `${format.quality} (${format.size || 'Tamanho variável'})`;
                option.dataset.itag = format.itag;
                videoQualitySelect.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = 'Média';
            option.textContent = 'Qualidade média (MP4)';
            option.dataset.itag = '18';
            videoQualitySelect.appendChild(option);
        }
    }

    // ========== UTILITÁRIOS ==========
    function formatDuration(seconds) {
        if (!seconds) return '00:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    function formatNumber(num) {
        if (!num) return '0';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    function formatFileSize(bytes) {
        if (!bytes) return 'Desconhecido';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return size.toFixed(1) + ' ' + units[unitIndex];
    }

    // ========== CONTROLES DE UI ==========
    function showLoading(message) {
        loading.classList.remove('hidden');
        videoInfo.classList.add('hidden');
        result.classList.add('hidden');
        error.classList.add('hidden');
        progress.classList.add('hidden');
        loadingMessage.textContent = message;
    }

    function hideLoading() {
        loading.classList.add('hidden');
    }

    function showError(title, message, tips = null) {
        error.classList.remove('hidden');
        videoInfo.classList.add('hidden');
        result.classList.add('hidden');
        progress.classList.add('hidden');
        loading.classList.add('hidden');

        errorTitle.textContent = title;
        errorDetails.innerHTML = `<p>${message}</p>`;

        if (tips && tips.length > 0) {
            errorTips.classList.remove('hidden');
            errorTips.innerHTML = '<strong>💡 Dicas:</strong><ul>' +
                tips.map(tip => `<li>${tip}</li>`).join('') +
                '</ul>';
        } else {
            errorTips.classList.add('hidden');
        }
    }

    function showResult(data) {
        result.classList.remove('hidden');
        resultMessage.innerHTML = data.message;
        downloadLink.href = data.file;
        downloadLink.download = data.filename;
    }

    function resetUI() {
        videoUrlInput.value = '';
        videoInfo.classList.add('hidden');
        result.classList.add('hidden');
        error.classList.add('hidden');
        progress.classList.add('hidden');
        loading.classList.add('hidden');
        videoUrlInput.focus();
    }

    // ========== EVENT LISTENERS ==========
    document.getElementById('downloadAudioBtn').addEventListener('click', () => {
        if (!currentVideoInfo) return;
        const quality = document.getElementById('audioQuality').value;
        startDownload('audio', quality);
    });

    document.getElementById('downloadVideoBtn').addEventListener('click', () => {
        if (!currentVideoInfo) return;
        const qualitySelect = document.getElementById('videoQuality');
        const selectedOption = qualitySelect.options[qualitySelect.selectedIndex];
        const itag = selectedOption.dataset.itag;
        startDownload('video', qualitySelect.value, itag);
    });

    document.getElementById('newDownloadBtn').addEventListener('click', resetUI);
    document.getElementById('retryBtn').addEventListener('click', resetUI);

    videoUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') analyzeBtn.click();
    });
});