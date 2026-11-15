// CONFIG - change later to your real API
const API_URL = "https://your-vercel-api.vercel.app";
const CUSTOM_WORDS_KEY = "gbene_custom_words";
let dictionaryVoiceMap = new Map();

function dictionaryWordKey(english, ogoni) {
    return JSON.stringify([english.trim().toLowerCase(), ogoni.trim().toLowerCase()]);
}

function getSavedWords() {
    try {
        const raw = localStorage.getItem(CUSTOM_WORDS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function saveWords(words) {
    localStorage.setItem(CUSTOM_WORDS_KEY, JSON.stringify(words));
}

// Typing Effect
const text = [
    "GBENE OGONI BUE KA",
    "GBENE OGONI BUE ZOR ",
    "GBENE OGONI KA A LENEBARI",
];

let index = 0;
let charIndex = 0;
let typing = true;

const typingElement = document.getElementById("typing");

function typeEffect() {
    if (!typingElement) return;

    if (typing) {
        typingElement.textContent = text[index].substring(0, charIndex++);

        if (charIndex > text[index].length) {
            typing = false;
        }
    } else {
        typingElement.textContent = text[index].substring(0, charIndex--);

        if (charIndex < 0) {
            typing = true;
            index++;

            if (index >= text.length) {
                index = 0;
            }
        }
    }
}

setInterval(typeEffect, 120);

function normalizeWord(word) {
    return {
        en: (word.english || word.en || "").trim(),
        kh: (word.ogoni || word.khana || word.kh || "").trim(),
        ex: (word.example || word.ex || "Community added this word").trim(),
        exKh: (word.exampleOgoni || word.exampleKhana || word.example_khana || word.exKh || "").trim(),
        wordAudio: (word.wordAudio || "").trim(),
        sentenceAudio: (word.sentenceAudio || "").trim(),
        category: word.category || "General"
    };
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function getAllWords() {
    const baseWords = Array.isArray(window.WORDS)
        ? window.WORDS
        : (typeof WORDS !== 'undefined' && Array.isArray(WORDS) ? WORDS : []);
    const customWords = getSavedWords();
    const wordsWithVoices = baseWords.map(word => {
        const normalized = normalizeWord(word);
        const voice = dictionaryVoiceMap.get(dictionaryWordKey(normalized.en, normalized.kh));
        return normalizeWord({ ...word, ...(voice || {}) });
    });
    return [...wordsWithVoices, ...customWords.map(normalizeWord)].filter(w => w.en && w.kh);
}

// TAB SWITCH
document.querySelectorAll('nav button[data-tab]').forEach(btn=>{
    btn.addEventListener('click',()=>{
        document.querySelectorAll('nav button[data-tab]').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
        const target = document.getElementById(btn.dataset.tab);
        if (target) target.classList.add('active');
    });
});

const requestedTab = new URLSearchParams(window.location.search).get('tab');
if (requestedTab) {
    const requestedTabButton = Array.from(document.querySelectorAll('nav button[data-tab]'))
        .find(button => button.dataset.tab === requestedTab);
    requestedTabButton?.click();
}

// RENDER WORDS
const WORDS_PER_PAGE = 5;
let currentPage = 1;
let renderedWords = [];

function render(list){
    const el = document.getElementById('wordList');
    if (!el) return;

    renderedWords = list;
    const pageCount = Math.max(1, Math.ceil(list.length / WORDS_PER_PAGE));
    currentPage = Math.min(currentPage, pageCount);
    const startIndex = (currentPage - 1) * WORDS_PER_PAGE;
    const pageWords = list.slice(startIndex, startIndex + WORDS_PER_PAGE);

    el.innerHTML = pageWords.map(w => `
        <div class="card">
            <span class="tag">${escapeHtml(w.category)}</span>
            <div style="font-size:24px;font-weight:700;margin:10px 0">Ogoni: ${escapeHtml(w.kh)} = ${escapeHtml(w.en)}</div>
            <button class="btn play-voice-btn" type="button"${w.wordAudio ? ` data-play-voice="${escapeHtml(w.wordAudio)}"` : ' disabled title="No word recording available yet"'}>Play voice</button>
            <p class="muted"><strong>Example:</strong> ${escapeHtml(w.ex || 'Community word')}</p>
            <button class="btn play-voice-btn" type="button"${w.sentenceAudio ? ` data-play-voice="${escapeHtml(w.sentenceAudio)}"` : ' disabled title="No example recording available yet"'}>Play voice</button>
            ${w.exKh ? `<p class="muted"><strong>Ogoni:</strong> ${escapeHtml(w.exKh)}</p>` : ''}
        </div>
    `).join('');

    const pagination = document.getElementById('wordPagination');
    if (pagination) {
        pagination.innerHTML = pageCount > 1 ? `
            <button type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
            <span>Page ${currentPage} of ${pageCount}</span>
            <button type="button" data-page="${currentPage + 1}" ${currentPage === pageCount ? 'disabled' : ''}>Next</button>
        ` : `<span>${list.length} ${list.length === 1 ? 'word' : 'words'}</span>`;
    }
}

document.getElementById('wordList')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-play-voice]');
    if (!button) return;

    const audio = new Audio(button.dataset.playVoice);
    button.disabled = true;
    button.textContent = 'Playing...';
    audio.addEventListener('ended', () => {
        button.disabled = false;
        button.textContent = 'Play voice';
    }, { once: true });
    audio.play().catch(() => {
        button.disabled = false;
        button.textContent = 'Could not play voice';
        window.setTimeout(() => {
            button.textContent = 'Play voice';
        }, 2500);
    });
});

document.getElementById('wordPagination')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-page]');
    if (!button || button.disabled) return;
    currentPage = Number(button.dataset.page);
    render(renderedWords);
});

let words = getAllWords();
render(words);
fetch('/api/dictionary/voices', { credentials: 'same-origin' })
    .then(response => {
        if (!response.ok) throw new Error('Could not load dictionary voice recordings.');
        return response.json();
    })
    .then(result => {
        const voices = Array.isArray(result.voices) ? result.voices : [];
        dictionaryVoiceMap = new Map(voices.map(voice => [
            dictionaryWordKey(voice.english || '', voice.ogoni || ''),
            voice
        ]));
        words = getAllWords();
        currentPage = 1;
        handleSearch();
    })
    .catch(error => {
        console.error('Could not load dictionary voice recordings.', error);
    });

// SEARCH
document.getElementById('searchBtn')?.addEventListener('click', handleSearch);
document.getElementById('searchInput')?.addEventListener('input', handleSearch);
document.getElementById('searchInput')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        handleSearch();
    }
});

function handleSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;

    const q = (input.value || '').trim().toLowerCase();
    if (!q) {
        currentPage = 1;
        render(words);
        return;
    }

    const filtered = words.filter(w =>
        (w.en || '').toLowerCase().includes(q) ||
        (w.kh || '').toLowerCase().includes(q)
    );

    currentPage = 1;
    render(filtered.length ? filtered : [{ en: q, kh: 'Not found yet', ex: 'No match found. Add this word in the contribute form.' }]);
}

// QUIZ: draw from the dictionary and contributed words in local storage.
let quizQueue = [];
let currentQuizWord = null;
let quizAnswerLocked = false;
let wrongQuizAttempts = 0;

function normalizeQuizAnswer(value) {
    return String(value)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .replace(/[ɛ]/g, 'e')
        .replace(/[ɔ]/g, 'o')
        .replace(/[ɲ]/g, 'n')
        .replace(/[ŋ]/g, 'n')
        .replace(/[^a-z0-9]/g, '');
}

function shuffleWords(list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

function loadQuestion() {
    const questionText = document.getElementById('questionText');
    const answerInput = document.getElementById('answerInput');
    const status = document.getElementById('answerStatus');
    if (!questionText) return;

    const availableWords = getAllWords();
    if (!availableWords.length) {
        currentQuizWord = null;
        questionText.textContent = 'No words are available for the quiz yet.';
        if (answerInput) answerInput.disabled = true;
        const submitButton = document.getElementById('submitAnswerBtn');
        if (submitButton) submitButton.disabled = true;
        return;
    }

    if (answerInput) answerInput.disabled = false;
    const submitButton = document.getElementById('submitAnswerBtn');
    if (submitButton) submitButton.disabled = false;

    if (!quizQueue.length) {
        quizQueue = shuffleWords([...availableWords]);
        if (currentQuizWord && quizQueue.length > 1 &&
            quizQueue[0].en === currentQuizWord.en && quizQueue[0].kh === currentQuizWord.kh) {
            [quizQueue[0], quizQueue[1]] = [quizQueue[1], quizQueue[0]];
        }
    }

    currentQuizWord = quizQueue.shift();
    quizAnswerLocked = false;
    wrongQuizAttempts = 0;
    if (submitButton) submitButton.textContent = 'Submit Answer';
    questionText.textContent = `Translate "${currentQuizWord.en}" to Ogoni?`;
    if (answerInput) {
        answerInput.value = '';
        answerInput.focus();
    }
    if (status) status.textContent = '';
}

function submitQuizAnswer() {
    if (!currentQuizWord) return;

    if (quizAnswerLocked) {
        loadQuestion();
        return;
    }

    const answerInput = document.getElementById('answerInput');
    const status = document.getElementById('answerStatus');
    const answer = (answerInput?.value || '').trim();
    if (!status) return;

    if (!answer) {
        status.innerHTML = '<p style="color:#fbbf24">Type your answer first.</p>';
        return;
    }

    if (normalizeQuizAnswer(answer) === normalizeQuizAnswer(currentQuizWord.kh)) {
        quizAnswerLocked = true;
        const submitButton = document.getElementById('submitAnswerBtn');
        if (submitButton) submitButton.textContent = 'Next word →';
        const ribbonPieces = Array.from({ length: 28 }, (_, pieceIndex) => {
            const colors = ['#f472b6', '#facc15', '#a3e635', '#60a5fa', '#c084fc', '#fb7185'];
            const left = Math.random() * 100;
            const delay = Math.random() * 1.4;
            const duration = 1.5 + Math.random() * 1.8;
            const color = colors[pieceIndex % colors.length];
            return `<i class="ribbon-piece" aria-hidden="true" style="--left:${left}%;--delay:${delay}s;--duration:${duration}s;--ribbon-color:${color}"></i>`;
        }).join('');
        status.innerHTML = `
            <div class="quiz-celebration" role="status" aria-live="polite">
                <div class="ribbon-rain" aria-hidden="true">${ribbonPieces}</div>
                <div class="quiz-flowers" aria-hidden="true">🌸 🌼 🎀 🌺</div>
                <strong>🎀 Correct! “${escapeHtml(currentQuizWord.kh)}” is right! 🎀</strong>
                <div class="quiz-flowers" aria-hidden="true">🌺 🌷 🌼</div>
                <span>+10 points — press Enter or click “Next word” to continue.</span>
            </div>`;
        return;
    }

    wrongQuizAttempts += 1;
    if (wrongQuizAttempts >= 3) {
        status.innerHTML = `<p style="color:#fca5a5">✗ Full hint: the correct Ogoni word is <strong>${escapeHtml(currentQuizWord.kh)}</strong>.</p>`;
    } else {
        const firstLetter = Array.from(currentQuizWord.kh)[0] || '';
        status.textContent = `✗ Try again (${wrongQuizAttempts}/3). Hint: the answer starts with “${firstLetter}”.`;
    }
}

document.getElementById('nextQuestionBtn')?.addEventListener('click', loadQuestion);
document.getElementById('submitAnswerBtn')?.addEventListener('click', submitQuizAnswer);
document.getElementById('answerInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        submitQuizAnswer();
    }
});

if (document.getElementById('questionText')) {
    loadQuestion();
}

// CONTRIBUTE
const submitWordBtn = document.getElementById('submitWordBtn');
const recordedVoices = new Map();
let activeVoiceRecorder = null;

document.querySelectorAll('[data-audio-id]').forEach(button => {
    button.addEventListener('click', async () => {
        const audioId = button.dataset.audioId;
        const status = document.getElementById(`${audioId}Status`);
        const preview = document.getElementById(`${audioId}Preview`);

        if (activeVoiceRecorder?.button === button) {
            activeVoiceRecorder.recorder.stop();
            return;
        }
        if (activeVoiceRecorder) {
            activeVoiceRecorder.recorder.stop();
        }

        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            status.textContent = 'Voice recording is not supported by this browser.';
            return;
        }

        const previousVoice = recordedVoices.get(audioId);
        if (previousVoice) {
            recordedVoices.delete(audioId);
            if (preview.src) URL.revokeObjectURL(preview.src);
            preview.removeAttribute('src');
            preview.hidden = true;
            preview.load();
            status.textContent = 'Previous recording removed. Record your replacement now.';
        }

        button.disabled = true;
        if (!previousVoice) status.textContent = 'Requesting microphone access...';

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const supportedType = [
                'audio/webm;codecs=opus',
                'audio/ogg;codecs=opus',
                'audio/mp4'
            ].find(type => MediaRecorder.isTypeSupported(type));
            const recorder = supportedType
                ? new MediaRecorder(stream, { mimeType: supportedType })
                : new MediaRecorder(stream);
            const chunks = [];
            activeVoiceRecorder = { button, recorder };
            recorder.addEventListener('dataavailable', event => {
                if (event.data.size) chunks.push(event.data);
            });
            recorder.addEventListener('error', () => {
                stream.getTracks().forEach(track => track.stop());
                if (activeVoiceRecorder?.recorder === recorder) activeVoiceRecorder = null;
                button.disabled = false;
                button.textContent = 'Add voice';
                status.textContent = 'Recording failed. Please try again.';
            });
            recorder.addEventListener('stop', () => {
                stream.getTracks().forEach(track => track.stop());
                if (activeVoiceRecorder?.recorder === recorder) activeVoiceRecorder = null;
                button.disabled = false;
                button.textContent = recordedVoices.has(audioId) ? 'Edit voice' : 'Add voice';

                if (!chunks.length || chunks.every(chunk => !chunk.size)) {
                    status.textContent = 'No audio was recorded. Please try again.';
                    return;
                }

                const type = recorder.mimeType || chunks[0].type || 'audio/webm';
                const normalizedType = type.toLowerCase();
                const extension = normalizedType.includes('ogg') ? 'ogg'
                    : normalizedType.includes('mp4') ? 'm4a'
                    : normalizedType.includes('wav') || normalizedType.includes('wave') ? 'wav'
                    : normalizedType.includes('mpeg') ? 'mp3'
                    : normalizedType.includes('aac') ? 'aac'
                    : 'webm';
                const blob = new Blob(chunks, { type });
                if (!blob.size) {
                    status.textContent = 'No audio was recorded. Please try again.';
                    return;
                }
                recordedVoices.set(audioId, { blob, filename: `recording.${extension}` });
                if (preview.src) URL.revokeObjectURL(preview.src);
                preview.src = URL.createObjectURL(blob);
                preview.hidden = false;
                preview.load();
                button.textContent = 'Edit voice';
                status.textContent = 'Voice recorded. Play it back below, or select Edit voice to replace it.';
            });

            button.disabled = false;
            button.textContent = 'Stop recording';
            status.textContent = 'Recording... Select “Stop recording” when finished.';
            recorder.start();
        } catch (error) {
            stream?.getTracks().forEach(track => track.stop());
            button.disabled = false;
            button.textContent = recordedVoices.has(audioId) ? 'Edit voice' : 'Add voice';
            status.textContent = error.name === 'NotAllowedError'
                ? 'Microphone access was denied. Allow microphone access and try again.'
                : 'Could not start recording. Please check your microphone and try again.';
        }
    });
});

['wordAudioPreview', 'sentenceAudioPreview'].forEach(id => {
    const preview = document.getElementById(id);
    preview?.addEventListener('error', () => {
        const audioId = id === 'wordAudioPreview' ? 'wordAudio' : 'sentenceAudio';
        document.getElementById(`${audioId}Status`).textContent =
            'This recording could not be played by the browser. Edit the voice and record it again.';
    });
});

submitWordBtn?.addEventListener('click', async ()=>{
    const en = (document.getElementById('englishWord').value || '').trim();
    const ogoni = (document.getElementById('ogoniWord').value || '').trim();
    const category = (document.getElementById('wordCategory').value || '').trim();
    const example = (document.getElementById('exampleText').value || '').trim();
    const exampleOgoni = (document.getElementById('exampleOgoniText').value || '').trim();
    const wordAudio = recordedVoices.get('wordAudio');
    const sentenceAudio = recordedVoices.get('sentenceAudio');
    const status = document.getElementById('contributeStatus');

    if (!en || !ogoni || !category || !example || !exampleOgoni || !wordAudio || !sentenceAudio) {
        if (status) {
            status.innerHTML = '<p style="color:#ef4444;margin-top:10px">Complete the English word, Ogoni translation, category, both example sentences, and record both voice clips before submitting.</p>';
        }
        return;
    }

    const newWord = {
        english: en,
        ogoni,
        example,
        exampleOgoni,
        category
    };

    if (submitWordBtn) submitWordBtn.disabled = true;
    try {
        const formData = new FormData();
        Object.entries(newWord).forEach(([key, value]) => formData.append(key, value));
        if (wordAudio) formData.append('wordAudio', wordAudio.blob, wordAudio.filename);
        if (sentenceAudio) formData.append('sentenceAudio', sentenceAudio.blob, sentenceAudio.filename);

        const response = await fetch('/api/contributions', {
            method: 'POST',
            credentials: 'same-origin',
            body: formData
        });
        const result = await response.json();
        if (response.status === 401) {
            if (status) {
                status.innerHTML = '<p style="color:#fbbf24;margin-top:10px">Please <a href="/Login.html?next=%2Fcontribute.html" style="color:#a3e635;text-decoration:underline">sign in</a> to submit this contribution.</p>';
            }
            return;
        }
        if (!response.ok) {
            throw new Error(result.error || 'Could not submit contribution. Please sign in and try again.');
        }

        const savedWords = getSavedWords();
        savedWords.push({ ...newWord, ...result.contribution });
        saveWords(savedWords);

        words = getAllWords();
        currentPage = 1;
        render(words);

        if (status) {
            status.innerHTML = `<p style="color:#22c55e;margin-top:10px">✓ "${escapeHtml(en)} = ${escapeHtml(ogoni)}" submitted successfully and now appears in searches.</p>`;
        }

        document.getElementById('englishWord').value = '';
        document.getElementById('ogoniWord').value = '';
        document.getElementById('wordCategory').value = '';
        document.getElementById('exampleText').value = '';
        document.getElementById('exampleOgoniText').value = '';
        recordedVoices.clear();
        ['wordAudio', 'sentenceAudio'].forEach(audioId => {
            const preview = document.getElementById(`${audioId}Preview`);
            if (preview.src) URL.revokeObjectURL(preview.src);
            preview.removeAttribute('src');
            preview.hidden = true;
            preview.load();
            document.querySelector(`[data-audio-id="${audioId}"]`).textContent = 'Add voice';
            document.getElementById(`${audioId}Status`).textContent =
                audioId === 'wordAudio'
                    ? 'Record a pronunciation using your microphone.'
                    : 'Record the sentence using your microphone.';
        });
    } catch (error) {
        if (status) {
            status.innerHTML = `<p style="color:#ef4444;margin-top:10px">${escapeHtml(error.message)}</p>`;
        }
    } finally {
        if (submitWordBtn) submitWordBtn.disabled = false;
    }
});

// Show who is viewing
const logged = localStorage.getItem('khana_logged') === 'true';
const name = localStorage.getItem('khana_name');
const userStatus = document.getElementById('userStatus');
if (userStatus) {
    userStatus.innerText = logged ? `Hi, ${name} ✓` : 'Guest viewing - Login to contribute';
}
