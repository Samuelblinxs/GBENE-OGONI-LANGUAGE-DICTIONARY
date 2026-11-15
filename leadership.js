const dictionaryWords = typeof WORDS !== 'undefined' && Array.isArray(WORDS) ? WORDS : [];
const voiceList = document.getElementById('dictionaryVoiceList');
const voiceSearch = document.getElementById('voiceSearch');
const voiceCount = document.getElementById('voiceWordCount');
const editorStatus = document.getElementById('voiceEditorStatus');
const savedVoices = new Map();
const pendingRecordings = new Map();
const previewUrls = new Map();
let activeRecorder = null;

function getWordKey(english, ogoni) {
    return JSON.stringify([english.trim().toLowerCase(), ogoni.trim().toLowerCase()]);
}

function setEditorStatus(message, type = '') {
    editorStatus.textContent = message;
    editorStatus.className = `voice-status${type ? ` ${type}` : ''}`;
}

function addVoiceEditor(entry, kind, label) {
    const key = getWordKey(entry.english, entry.ogoni);
    const laneKey = `${key}:${kind}`;
    const savedVoice = savedVoices.get(key)?.[kind] || '';
    const pending = pendingRecordings.has(laneKey);
    const editor = document.createElement('div');
    editor.className = 'voice-editor';

    const heading = document.createElement('p');
    heading.textContent = label;
    editor.append(heading);

    const textToRecord = document.createElement('p');
    textToRecord.textContent = kind === 'wordAudio'
        ? entry.ogoni
        : (entry.example || 'No example sentence provided.');
    editor.append(textToRecord);

    const preview = document.createElement('audio');
    preview.controls = true;
    preview.hidden = !savedVoice && !pending;
    if (pending) preview.src = previewUrls.get(laneKey);
    else if (savedVoice) preview.src = savedVoice;
    editor.append(preview);

    const recordButton = document.createElement('button');
    recordButton.className = 'btn';
    recordButton.type = 'button';
    recordButton.dataset.action = 'record';
    recordButton.textContent = 'Record voice';
    editor.append(recordButton);

    const saveButton = document.createElement('button');
    saveButton.className = 'btn';
    saveButton.type = 'button';
    saveButton.dataset.action = 'save';
    saveButton.textContent = 'Save recording';
    saveButton.disabled = !pendingRecordings.has(laneKey);
    editor.append(saveButton);

    const status = document.createElement('div');
    status.className = 'voice-status';
    status.dataset.status = '';
    status.textContent = pending
        ? 'Recording ready. Play it back, then save it.'
        : savedVoice ? 'A recording is saved.' : 'No recording saved yet.';
    editor.append(status);

    editor.dataset.key = key;
    editor.dataset.english = entry.english;
    editor.dataset.ogoni = entry.ogoni;
    editor.dataset.kind = kind;
    editor.dataset.laneKey = laneKey;
    editor._voicePreview = preview;
    editor._voiceStatus = status;
    editor._voiceSaveButton = saveButton;
    editor._voiceRecordButton = recordButton;
    return editor;
}

function renderVoiceEntries() {
    const query = voiceSearch.value.trim().toLowerCase();
    const filtered = dictionaryWords.filter(word =>
        `${word.english} ${word.ogoni}`.toLowerCase().includes(query)
    );
    voiceCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'word' : 'words'}`;
    voiceList.replaceChildren();

    filtered.forEach(word => {
        const entry = document.createElement('section');
        entry.className = 'card voice-entry';
        const title = document.createElement('h3');
        title.textContent = `${word.english} — ${word.ogoni}`;
        entry.append(title);

        const editors = document.createElement('div');
        editors.className = 'voice-editors';
        editors.append(
            addVoiceEditor(word, 'wordAudio', 'Word pronunciation'),
            addVoiceEditor(word, 'sentenceAudio', 'Example sentence')
        );
        entry.append(editors);
        voiceList.append(entry);
    });
}

function extensionFor(type) {
    const normalized = type.toLowerCase();
    if (normalized.includes('ogg')) return 'ogg';
    if (normalized.includes('mp4')) return 'm4a';
    if (normalized.includes('wav') || normalized.includes('wave')) return 'wav';
    if (normalized.includes('mpeg')) return 'mp3';
    if (normalized.includes('aac')) return 'aac';
    return 'webm';
}

function setRecordingControlsDisabled(disabled, except = null) {
    voiceList.querySelectorAll('button[data-action="record"]').forEach(button => {
        button.disabled = disabled && button !== except;
    });
}

function setSaveControlsDisabled(disabled) {
    voiceList.querySelectorAll('button[data-action="save"]').forEach(button => {
        const laneKey = button.closest('.voice-editor').dataset.laneKey;
        button.disabled = disabled || !pendingRecordings.has(laneKey);
    });
}

voiceSearch.addEventListener('input', renderVoiceEntries);
voiceList.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const editor = button.closest('.voice-editor');
    const status = editor._voiceStatus;
    if (button.dataset.action === 'record') {
        if (activeRecorder?.editor === editor) {
            activeRecorder.recorder.stop();
            return;
        }
        if (activeRecorder) {
            setEditorStatus('Stop the current recording before starting another.', 'error');
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            status.textContent = 'Voice recording is not supported by this browser.';
            status.className = 'voice-status error';
            return;
        }

        button.disabled = true;
        status.textContent = 'Requesting microphone access...';
        status.className = 'voice-status';
        voiceSearch.disabled = true;
        setRecordingControlsDisabled(true, button);
        setSaveControlsDisabled(true);
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = [
                'audio/webm;codecs=opus',
                'audio/ogg;codecs=opus',
                'audio/mp4'
            ].find(type => MediaRecorder.isTypeSupported(type));
            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);
            const chunks = [];
            activeRecorder = { editor, recorder };
            recorder.addEventListener('dataavailable', recorderEvent => {
                if (recorderEvent.data.size) chunks.push(recorderEvent.data);
            });
            recorder.addEventListener('error', () => {
                stream.getTracks().forEach(track => track.stop());
                if (activeRecorder?.recorder === recorder) activeRecorder = null;
                voiceSearch.disabled = false;
                button.disabled = false;
                button.textContent = 'Record voice';
                setRecordingControlsDisabled(false);
                setSaveControlsDisabled(false);
                status.textContent = 'Recording failed. Please try again.';
                status.className = 'voice-status error';
            });
            recorder.addEventListener('stop', () => {
                stream.getTracks().forEach(track => track.stop());
                if (activeRecorder?.recorder === recorder) activeRecorder = null;
                voiceSearch.disabled = false;
                button.disabled = false;
                button.textContent = 'Record voice';
                setRecordingControlsDisabled(false);
                setSaveControlsDisabled(false);
                if (!chunks.length || chunks.every(chunk => !chunk.size)) {
                    status.textContent = 'No audio was recorded. Please try again.';
                    status.className = 'voice-status error';
                    return;
                }

                const type = recorder.mimeType || chunks[0].type || 'audio/webm';
                const blob = new Blob(chunks, { type });
                if (!blob.size) {
                    status.textContent = 'No audio was recorded. Please try again.';
                    status.className = 'voice-status error';
                    return;
                }
                const laneKey = editor.dataset.laneKey;
                pendingRecordings.set(laneKey, {
                    blob,
                    filename: `recording.${extensionFor(type)}`
                });
                if (previewUrls.has(laneKey)) URL.revokeObjectURL(previewUrls.get(laneKey));
                const previewUrl = URL.createObjectURL(blob);
                previewUrls.set(laneKey, previewUrl);
                editor._voicePreview.src = previewUrl;
                editor._voicePreview.hidden = false;
                editor._voicePreview.load();
                editor._voiceSaveButton.disabled = false;
                status.textContent = 'Recording ready. Play it back, then save it.';
                status.className = 'voice-status success';
            });

            recorder.start();
            voiceSearch.disabled = true;
            button.disabled = false;
            button.textContent = 'Stop recording';
            status.textContent = 'Recording... Select Stop recording when finished.';
            setRecordingControlsDisabled(true, button);
        } catch (error) {
            stream?.getTracks().forEach(track => track.stop());
            if (activeRecorder?.editor === editor) activeRecorder = null;
            voiceSearch.disabled = false;
            setRecordingControlsDisabled(false);
            setSaveControlsDisabled(false);
            button.disabled = false;
            button.textContent = 'Record voice';
            status.textContent = error.name === 'NotAllowedError'
                ? 'Microphone access was denied. Allow microphone access and try again.'
                : 'Could not start recording. Please check your microphone and try again.';
            status.className = 'voice-status error';
        }
        return;
    }

    if (button.dataset.action === 'save') {
        const recording = pendingRecordings.get(editor.dataset.laneKey);
        if (!recording) return;
        button.disabled = true;
        status.textContent = 'Saving recording...';
        status.className = 'voice-status';
        try {
            const formData = new FormData();
            formData.append('english', editor.dataset.english);
            formData.append('ogoni', editor.dataset.ogoni);
            formData.append('kind', editor.dataset.kind);
            formData.append('audio', recording.blob, recording.filename);
            const response = await fetch('/api/admin/word-voices', {
                method: 'POST',
                credentials: 'same-origin',
                body: formData
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not save this recording.');

            const key = editor.dataset.key;
            savedVoices.set(key, result.voice);
            pendingRecordings.delete(editor.dataset.laneKey);
            if (previewUrls.has(editor.dataset.laneKey)) {
                URL.revokeObjectURL(previewUrls.get(editor.dataset.laneKey));
                previewUrls.delete(editor.dataset.laneKey);
            }
            renderVoiceEntries();
            setEditorStatus(`Saved voice for ${editor.dataset.english} — ${editor.dataset.ogoni}.`, 'success');
        } catch (error) {
            button.disabled = false;
            status.textContent = error.message;
            status.className = 'voice-status error';
        }
    }
});

renderVoiceEntries();
fetch('/api/dictionary/voices', { credentials: 'same-origin' })
    .then(response => {
        if (!response.ok) throw new Error('Could not load saved dictionary recordings.');
        return response.json();
    })
    .then(result => {
        (Array.isArray(result.voices) ? result.voices : []).forEach(voice => {
            savedVoices.set(getWordKey(voice.english, voice.ogoni), voice);
        });
        renderVoiceEntries();
        setEditorStatus('');
    })
    .catch(error => {
        setEditorStatus(error.message, 'error');
    });
