(function() {
    const DATA_BASE = '../assets/data/';
    const HABIT_DATA_BASE = `${DATA_BASE}scripts/`;
    const METADATA_PATH = `${DATA_BASE}habits.json`;
    const PROGRESS_PREFIX = 'habit-progress-';
    const STEP_MAX = 3;

    const LOCALE_COPY = {
        zh: {
            next: ['下一步', '查看计划', '开始践行'],
            dayLabel: (day) => `第 ${day} 天`,
            affirmation: '今日自我对话',
            reason: '坚持理由',
            action: '今日行动',
            recording: '录音提示',
            promptsTitle: '提醒',
            promptLabels: {
                morning: '早晨提醒',
                afternoon: '午间提示',
                evening: '夜间回顾',
                default: '提醒'
            },
            tags: '关键词',
            done: '完成今天的练习',
            repetitions: '今天重复了几次？',
            cardToggle: {
                expand: '展开',
                collapse: '收起'
            },
            learningHeading: '延伸阅读',
            reminderNote: {
                off: '我们会在本地保存提醒标记，并引导你把练习写进日历或待办。',
                on: '已为你开启每日提醒，建议立刻在日历或提醒工具中设定时间。'
            },
            noResources: '我们正在准备更多配套文章，敬请期待。',
            recorder: {
                idle: '准备就绪：点击“开始录音”练习今天的脚本。',
                recording: '录音中… 完成后按“停止”，尽量保持语速稳定。',
                processing: '正在处理录音…几秒后即可播放或下载。',
                ready: '录音完成！播放确认语气，或保存音频以便复习。',
                permission: '请允许浏览器使用麦克风，我们不会上传音频。',
                unsupported: '抱歉，你的浏览器暂不支持录音功能，请改用最新版 Chrome、Edge 或 Safari。',
                error: '录音遇到问题，请重试。',
                inactive: '选择一个模板并生成计划后，就能在这里练习录音。'
            },
            recorderButtons: {
                start: '开始录音',
                stop: '停止',
                download: '下载录音'
            }
        },
        en: {
            next: ['Next Step', 'See Plan', 'Start Practice'],
            dayLabel: (day) => `Day ${day}`,
            affirmation: 'Self-talk focus',
            reason: 'Why it matters',
            action: 'Action for today',
            recording: 'Recording tip',
            promptsTitle: 'Prompts',
            promptLabels: {
                morning: 'Morning prompt',
                afternoon: 'Afternoon prompt',
                evening: 'Evening reflection',
                default: 'Reminder'
            },
            tags: 'Tags',
            done: 'I completed today’s practice',
            repetitions: 'How many repetitions today?',
            cardToggle: {
                expand: 'Expand',
                collapse: 'Collapse'
            },
            learningHeading: 'Further reading',
            reminderNote: {
                off: 'We store this preference locally and prompt you to add calendar or to-do reminders.',
                on: 'Daily reminder saved locally. Add it to your calendar or to-do app right away.'
            },
            noResources: 'More resources are on the way. Stay tuned.',
            recorder: {
                idle: 'Ready to go: press “Start recording” to rehearse today’s script.',
                recording: 'Recording… speak with intention, then hit “Stop” when you’re done.',
                processing: 'Processing your audio… you can replay or download in a moment.',
                ready: 'All set! Replay the clip to check your tone or download it for later.',
                permission: 'Please allow microphone access. Nothing leaves your browser.',
                unsupported: 'Recording is not supported in this browser. Try the latest Chrome, Edge, or Safari.',
                error: 'Something went wrong while recording. Give it another try.',
                inactive: 'Generate your daily plan first, then the recorder will be ready here.'
            },
            recorderButtons: {
                start: 'Start recording',
                stop: 'Stop',
                download: 'Download audio'
            }
        }
    };

    const LEARNING_LIBRARY = {
        'phase-identity': {
            zh: { title: '身份重塑：用自我对话建立“无烟者”身份', url: '/learn/identity-reset' },
            en: { title: 'Identity reset: build your smoke-free narrative', url: '/learn/identity-reset' }
        },
        'phase-reasons': {
            zh: { title: '理由强化：把戒烟动机说出口', url: '/learn/reasons-playbook' },
            en: { title: 'Reason reinforcement: say your why aloud', url: '/learn/reasons-playbook' }
        },
        'phase-consolidation': {
            zh: { title: '巩固期：保持 21 天后的节奏', url: '/learn/consolidation' },
            en: { title: 'Consolidation: sustain momentum beyond day 21', url: '/learn/consolidation' }
        }
    };

    let metadataCache = null;
    let currentStep = 1;
    let currentPathway = 'break-bad-habit';
    let activeScriptId = null;
    let suppressCategorySync = false;

    const INLINE_SCRIPTS = (typeof window !== 'undefined' && window.SELFTALK_INLINE_SCRIPTS) || {};

    const scriptCache = new Map();
    const progressCache = new Map();
    const localeViews = {};
    const recorderControllers = {};

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        ['zh', 'en'].forEach((locale) => {
            localeViews[locale] = collectLocaleView(locale);
        });

        setupRecorders();

        attachPathwayListeners();
        attachTemplateListeners();
        attachReminderListeners();

        loadHabitMetadata()
            .then((metadata) => {
                if (metadata) {
                    syncTemplateMetadata(metadata);
                }
                applyPathway(currentPathway, { ensureVisible: true });
                updateNextButtonState();
            })
            .finally(() => {
                updateStepUI();
                debugLoadFromQuery();
            });
    }

    function collectLocaleView(locale) {
        return {
            wrapper: document.querySelector(`.plan-wrapper[data-locale="${locale}"]`),
            list: document.getElementById(`plan-day-list-${locale}`),
            empty: document.getElementById(`plan-empty-${locale}`),
            progressText: document.getElementById(`plan-progress-percent-${locale}`),
            progressBar: document.getElementById(`plan-progress-bar-${locale}`),
            reminder: document.getElementById(`plan-reminder-${locale}`),
            learning: document.getElementById(`plan-learning-${locale}`),
            recorder: collectRecorderView(locale)
        };
    }

    function collectRecorderView(locale) {
        const root = document.querySelector(`[data-recorder-locale="${locale}"]`);
        if (!root) {
            return null;
        }
        return {
            root,
            status: root.querySelector('[data-recorder-status]'),
            start: root.querySelector('[data-recorder-start]'),
            stop: root.querySelector('[data-recorder-stop]'),
            download: root.querySelector('[data-recorder-download]'),
            audio: root.querySelector('[data-recorder-audio]')
        };
    }

    function setupRecorders() {
        Object.entries(localeViews).forEach(([locale, view]) => {
            if (!view?.recorder) {
                return;
            }
            recorderControllers[locale] = initRecorderController(locale, view.recorder);
        });
    }

    function initRecorderController(locale, refs) {
        const copy = LOCALE_COPY[locale]?.recorder || {};
        const buttonCopy = LOCALE_COPY[locale]?.recorderButtons || {};
        const supported = Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';

        if (refs.start && buttonCopy.start) {
            refs.start.textContent = buttonCopy.start;
        }
        if (refs.stop && buttonCopy.stop) {
            refs.stop.textContent = buttonCopy.stop;
        }
        if (refs.download && buttonCopy.download) {
            refs.download.textContent = buttonCopy.download;
        }

        const controller = {
            locale,
            refs,
            copy,
            supported,
            available: false,
            recording: false,
            mediaRecorder: null,
            stream: null,
            chunks: [],
            audioUrl: null,
            mimeType: '',
            extension: 'webm'
        };

        if (refs.root) {
            refs.root.classList.add('is-disabled');
        }

        function setStatus(key) {
            if (!refs.status) {
                return;
            }
            const text = copy[key] || key || '';
            refs.status.textContent = text;
        }

        function revokeAudioUrl() {
            if (controller.audioUrl) {
                URL.revokeObjectURL(controller.audioUrl);
                controller.audioUrl = null;
            }
        }

        function clearAudio() {
            revokeAudioUrl();
            if (refs.audio) {
                refs.audio.pause();
                refs.audio.removeAttribute('src');
                refs.audio.hidden = true;
            }
            if (refs.download) {
                refs.download.hidden = true;
                refs.download.removeAttribute('href');
            }
        }

        function cleanupStream() {
            if (controller.stream) {
                controller.stream.getTracks().forEach((track) => track.stop());
                controller.stream = null;
            }
        }

        function resetButtons(disableStart = true) {
            if (refs.start) {
                refs.start.disabled = disableStart;
            }
            if (refs.stop) {
                refs.stop.disabled = true;
            }
        }

        function chooseRecorderFormat() {
            if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
                return { mimeType: '', extension: 'webm' };
            }
            const formats = [
                { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
                { mimeType: 'audio/webm', extension: 'webm' },
                { mimeType: 'audio/mp4;codecs=mp4a', extension: 'm4a' },
                { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
                { mimeType: 'audio/ogg', extension: 'ogg' }
            ];
            for (const format of formats) {
                try {
                    if (MediaRecorder.isTypeSupported(format.mimeType)) {
                        return format;
                    }
                } catch (error) {
                    // Ignore and continue checking other formats.
                }
            }
            return { mimeType: '', extension: 'webm' };
        }

        async function handleStart() {
            if (!controller.available || controller.recording || !supported) {
                return;
            }
            if (refs.start) {
                refs.start.disabled = true;
            }
            if (refs.stop) {
                refs.stop.disabled = true;
            }
            clearAudio();
            controller.chunks = [];
            setStatus('permission');

            try {
                controller.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (error) {
                console.error('[Recorder] getUserMedia failed', error);
                const statusKey = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
                    ? 'permission'
                    : 'error';
                setStatus(statusKey);
                resetButtons(false);
                return;
            }

            const format = chooseRecorderFormat();
            controller.mimeType = format.mimeType;
            controller.extension = format.extension;
            try {
                controller.mediaRecorder = controller.mimeType
                    ? new MediaRecorder(controller.stream, { mimeType: controller.mimeType })
                    : new MediaRecorder(controller.stream);
            } catch (error) {
                console.error('[Recorder] MediaRecorder init failed', error);
                setStatus('error');
                cleanupStream();
                resetButtons(false);
                return;
            }

            controller.recording = true;
            if (refs.stop) {
                refs.stop.disabled = false;
            }
            setStatus('recording');

            controller.mediaRecorder.addEventListener('dataavailable', (event) => {
                if (event?.data && event.data.size > 0) {
                    controller.chunks.push(event.data);
                }
            });

            controller.mediaRecorder.addEventListener('error', (event) => {
                console.error('[Recorder] error', event?.error || event);
                controller.recording = false;
                setStatus('error');
                cleanupStream();
                resetButtons(!controller.available);
            });

            controller.mediaRecorder.addEventListener('stop', () => {
                finalizeRecording();
            });

            try {
                controller.mediaRecorder.start();
            } catch (error) {
                console.error('[Recorder] start failed', error);
                controller.recording = false;
                setStatus('error');
                cleanupStream();
                resetButtons(false);
            }
        }

        function handleStop() {
            if (!controller.recording || !controller.mediaRecorder) {
                return;
            }
            if (refs.stop) {
                refs.stop.disabled = true;
            }
            setStatus('processing');
            try {
                controller.mediaRecorder.stop();
            } catch (error) {
                console.error('[Recorder] stop failed', error);
                finalizeRecording();
            }
        }

        function finalizeRecording() {
            const wasRecording = controller.recording;
            controller.recording = false;
            const mimeType = controller.mimeType || 'audio/webm';
            cleanupStream();

            if (refs.stop) {
                refs.stop.disabled = true;
            }
            if (refs.start) {
                refs.start.disabled = !controller.available;
            }

            if (!wasRecording || !controller.chunks.length) {
                setStatus('error');
                controller.chunks = [];
                controller.mediaRecorder = null;
                return;
            }

            if (!controller.available) {
                controller.chunks = [];
                controller.mediaRecorder = null;
                clearAudio();
                setStatus('inactive');
                return;
            }

            let blob;
            try {
                blob = new Blob(controller.chunks, { type: mimeType });
            } catch (error) {
                console.warn('[Recorder] Blob creation fallback', error);
                blob = new Blob(controller.chunks);
            }

            controller.chunks = [];
            controller.mediaRecorder = null;

            revokeAudioUrl();
            const url = URL.createObjectURL(blob);
            controller.audioUrl = url;

            if (refs.audio) {
                refs.audio.src = url;
                refs.audio.hidden = false;
                refs.audio.load();
            }

            if (refs.download) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `selftalk-practice-${locale}-${timestamp}.${controller.extension || 'webm'}`;
                refs.download.href = url;
                refs.download.setAttribute('download', filename);
                refs.download.hidden = false;
            }

            setStatus('ready');
        }

        controller.setAvailable = function(available) {
            controller.available = Boolean(available);
            if (!supported) {
                setStatus('unsupported');
                return;
            }
            if (!controller.available) {
                if (controller.recording && controller.mediaRecorder) {
                    try {
                        controller.mediaRecorder.stop();
                    } catch (error) {
                        console.warn('[Recorder] stop during deactivate failed', error);
                    }
                }
                controller.recording = false;
                controller.mediaRecorder = null;
                cleanupStream();
                clearAudio();
                resetButtons(true);
                if (refs.root) {
                    refs.root.classList.add('is-disabled');
                }
                setStatus('inactive');
                return;
            }

            if (refs.root) {
                refs.root.classList.remove('is-disabled');
            }
            if (refs.start) {
                refs.start.disabled = false;
            }
            if (refs.stop) {
                refs.stop.disabled = true;
            }
            if (controller.audioUrl) {
                setStatus('ready');
            } else {
                setStatus('idle');
            }
        };

        controller.resetAudio = clearAudio;
        controller.revoke = revokeAudioUrl;

        if (!supported) {
            resetButtons(true);
            clearAudio();
            setStatus('unsupported');
            if (refs.root) {
                refs.root.classList.add('is-unsupported');
            }
            return controller;
        }

        clearAudio();
        resetButtons(true);
        setStatus('inactive');

        refs.start?.addEventListener('click', handleStart);
        refs.stop?.addEventListener('click', handleStop);

        return controller;
    }

    function updateRecorderAvailability(locale, available) {
        const controller = recorderControllers[locale];
        if (!controller || typeof controller.setAvailable !== 'function') {
            return;
        }
        controller.setAvailable(Boolean(available));
    }

    function loadHabitMetadata() {
        if (metadataCache) {
            return Promise.resolve(metadataCache);
        }

        return fetch(METADATA_PATH)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Metadata request failed: ${response.status}`);
                }
                return response.json();
            })
            .then((metadata) => {
                metadataCache = metadata;
                console.info('[HabitMetadata] loaded', metadata);
                return metadataCache;
            })
            .catch((error) => {
                console.error('[HabitMetadata] load failed', error);
                return null;
            });
    }

    function loadHabitScript(habitId) {
        if (scriptCache.has(habitId)) {
            return Promise.resolve(scriptCache.get(habitId));
        }

        const url = `${HABIT_DATA_BASE}${habitId}.json`;
        return fetch(url)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Script request failed: ${response.status}`);
                }
                return response.json();
            })
            .then((payload) => {
                scriptCache.set(habitId, payload);
                console.info('[HabitScript] loaded', payload.id, payload);
                return payload;
            })
            .catch((error) => {
                console.error('[HabitScript] load failed', url, error);
                const inline = INLINE_SCRIPTS[habitId];
                if (inline) {
                    console.info('[HabitScript] fallback to inline data for', habitId);
                    scriptCache.set(habitId, inline);
                    return inline;
                }
                return null;
            });
    }

    function findLabelForInput(input) {
        if (!input || !input.id) {
            return null;
        }
        const explicit = document.querySelector(`label[for="${input.id}"]`);
        if (explicit) {
            return explicit;
        }
        const optionContainer = input.closest('.habit-option');
        if (optionContainer) {
            const fallback = optionContainer.querySelector('label');
            if (fallback) {
                return fallback;
            }
        }
        return input.nextElementSibling;
    }

    function badgeTextForStatus(status, labelNode) {
        const language = labelNode?.closest?.('.content[data-lang="zh"]') ? 'zh' : 'en';
        if (status === 'coming-soon') {
            return language === 'zh' ? '即将上线' : 'Coming soon';
        }
        if (status === 'custom') {
            return language === 'zh' ? '自定义' : 'Custom';
        }
        return status || '';
    }

    function syncTemplateMetadata(metadata) {
        if (!metadata || !Array.isArray(metadata.categories)) {
            return;
        }

        const templateMap = new Map();
        metadata.categories.forEach((category) => {
            (category.templates || []).forEach((template) => {
                if (template && template.habitId) {
                    templateMap.set(template.habitId, template);
                }
            });
        });

        document.querySelectorAll('input[type="radio"][name^="habit"]').forEach((input) => {
            const info = templateMap.get(input.value);
            const label = findLabelForInput(input);

            if (label) {
                label.querySelectorAll('.template-badge').forEach((badge) => badge.remove());
            }

            if (info && info.script) {
                input.dataset.script = info.script;
                input.disabled = false;
                input.dataset.status = 'ready';
            } else {
                delete input.dataset.script;
                if (info && info.status === 'coming-soon') {
                    input.dataset.status = 'coming-soon';
                    input.disabled = true;
                    if (label) {
                        const badge = document.createElement('span');
                        badge.className = 'template-badge';
                        badge.textContent = badgeTextForStatus(info.status, label);
                        label.appendChild(badge);
                    }
                } else {
                    input.dataset.status = info?.status || 'custom';
                    input.disabled = false;
                    if (label && info?.status === 'custom') {
                        const badge = document.createElement('span');
                        badge.className = 'template-badge';
                        badge.textContent = badgeTextForStatus(info.status, label);
                        label.appendChild(badge);
                    }
                }
            }
        });

        const activeReady = document.querySelector('input[type="radio"][data-script]:checked');
        if (activeReady?.dataset?.script) {
            selectScript(activeReady.dataset.script);
        }
    }

    function hasReadyTemplateSelected() {
        return Boolean(document.querySelector('input[type="radio"][data-script]:checked'));
    }

    function goToStep(step) {
        const target = Math.min(Math.max(step, 1), STEP_MAX);
        currentStep = target;
        updateStepUI();
    }

    function updateStepUI() {
        document.querySelectorAll('.step-view').forEach((view) => {
            const step = Number(view.getAttribute('data-step'));
            view.classList.toggle('active', step === currentStep);
        });

        document.querySelectorAll('.progress-indicator').forEach((indicator) => {
            const circles = indicator.querySelectorAll('.step-circle');
            circles.forEach((circle, index) => {
                const stepNumber = index + 1;
                circle.classList.toggle('active', stepNumber === currentStep);
                circle.classList.toggle('completed', stepNumber < currentStep);
            });

            const labels = indicator.querySelectorAll('.step-label');
            labels.forEach((label, index) => {
                const stepNumber = index + 1;
                label.classList.toggle('active', stepNumber === currentStep);
            });

            const connectors = indicator.querySelectorAll('.step-connector');
            connectors.forEach((connector, index) => {
                connector.classList.toggle('completed', index < currentStep - 1);
            });
        });

        updateNavButtons();
    }

    function updateNavButtons() {
        const isFirst = currentStep === 1;
        document.querySelectorAll('[id^="back-btn-"]').forEach((button) => {
            button.style.display = isFirst ? 'none' : 'inline-flex';
        });

        document.querySelectorAll('[id^="next-btn-"]').forEach((button) => {
            const locale = button.id.endsWith('-zh') ? 'zh' : 'en';
            const labels = LOCALE_COPY[locale]?.next || [];
            const label = labels[currentStep - 1] || labels[labels.length - 1] || button.textContent;
            button.textContent = label;
            button.disabled = currentStep === 1 && !hasReadyTemplateSelected();
        });
    }

    function getProgress(scriptId) {
        if (!scriptId) {
            return { days: {}, reminder: false };
        }
        if (progressCache.has(scriptId)) {
            return progressCache.get(scriptId);
        }
        let record = { days: {}, reminder: false };
        try {
            const raw = localStorage.getItem(`${PROGRESS_PREFIX}${scriptId}`);
            if (raw) {
                record = JSON.parse(raw);
            }
        } catch (error) {
            console.warn('[HabitProgress] read failed', error);
        }
        if (!record || typeof record !== 'object') {
            record = { days: {}, reminder: false };
        }
        if (!record.days) {
            record.days = {};
        }
        progressCache.set(scriptId, record);
        return record;
    }

    function setProgress(scriptId, value) {
        if (!scriptId) {
            return;
        }
        progressCache.set(scriptId, value);
        try {
            localStorage.setItem(`${PROGRESS_PREFIX}${scriptId}`, JSON.stringify(value));
        } catch (error) {
            console.warn('[HabitProgress] save failed', error);
        }
    }

    function updateReminderNotes(reminder) {
        Object.entries(localeViews).forEach(([locale, view]) => {
            if (!view?.wrapper) {
                return;
            }
            const note = view.wrapper.querySelector('.reminder-note');
            if (note) {
                const copy = LOCALE_COPY[locale]?.reminderNote;
                note.textContent = reminder ? copy?.on : copy?.off;
            }
            if (view.reminder) {
                view.reminder.checked = Boolean(reminder);
            }
        });
    }

    function updateProgressDisplays(progress, totalDays) {
        const completed = Object.values(progress.days || {}).filter((entry) => entry?.completed).length;
        const percent = totalDays > 0 ? Math.round((completed / totalDays) * 100) : 0;
        Object.values(localeViews).forEach((view) => {
            if (!view) {
                return;
            }
            if (view.progressText) {
                view.progressText.textContent = `${percent}%`;
            }
            if (view.progressBar) {
                view.progressBar.style.width = `${percent}%`;
            }
        });
    }

    function textForLocale(field, locale) {
        if (!field) {
            return '';
        }
        if (typeof field === 'string') {
            return field;
        }
        return field[locale] || field.en || field.zh || '';
    }

    function renderPlan(data) {
        const days = Array.isArray(data?.days) ? data.days : [];
        const phases = new Map();
        (data?.phases || []).forEach((phase) => {
            if (phase?.id) {
                phases.set(phase.id, phase);
            }
        });

        if (!activeScriptId || !days.length) {
            clearPlanViews();
            return;
        }

        const progress = getProgress(activeScriptId);
        Object.entries(localeViews).forEach(([locale, view]) => {
            renderPlanForLocale(locale, view, days, phases, progress);
        });
        updateProgressDisplays(progress, days.length);
        updateReminderNotes(progress.reminder);
    }

    function renderPlanForLocale(locale, view, days, phases, progress) {
        if (!view || !view.list || !view.empty) {
            return;
        }

        if (!days.length) {
            view.list.innerHTML = '';
            view.empty.style.display = 'block';
            updateLearning(locale, view, phases);
            updateRecorderAvailability(locale, false);
            return;
        }

        updateRecorderAvailability(locale, true);
        view.empty.style.display = 'none';
        const fragment = document.createDocumentFragment();
        const copy = LOCALE_COPY[locale];
        const secondaryLocale = locale === 'zh' ? 'en' : 'zh';

        days.forEach((dayInfo) => {
            const card = document.createElement('li');
            card.className = 'plan-day-card';
            card.dataset.day = String(dayInfo.day);

            const dayProgress = progress.days?.[dayInfo.day] || {};
            if (dayProgress.completed) {
                card.classList.add('completed');
            }

            const header = document.createElement('div');
            header.className = 'plan-day-header';
            const headerMain = document.createElement('div');
            headerMain.className = 'plan-day-header-main';
            const dayNumber = document.createElement('span');
            dayNumber.className = 'plan-day-number';
            dayNumber.textContent = copy?.dayLabel ? copy.dayLabel(dayInfo.day) : `Day ${dayInfo.day}`;
            const phase = phases.get(dayInfo.phase);
            const phaseLabel = document.createElement('span');
            phaseLabel.className = 'plan-day-phase';
            phaseLabel.textContent = textForLocale(phase?.title, locale) || '';
            headerMain.appendChild(dayNumber);
            if (phaseLabel.textContent) {
                headerMain.appendChild(phaseLabel);
            }
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'plan-day-toggle';
            header.appendChild(headerMain);
            header.appendChild(toggle);
            card.appendChild(header);

            const brief = document.createElement('p');
            brief.className = 'plan-day-brief';
            brief.textContent = textForLocale(dayInfo.affirmation, locale) || '';
            card.appendChild(brief);

            const body = document.createElement('div');
            body.className = 'plan-day-body';
            appendContentBlock(body, copy?.affirmation, textForLocale(dayInfo.affirmation, locale), textForLocale(dayInfo.affirmation, secondaryLocale));
            appendContentBlock(body, copy?.reason, textForLocale(dayInfo.why, locale), textForLocale(dayInfo.why, secondaryLocale));
            appendContentBlock(body, copy?.action, textForLocale(dayInfo.action, locale), textForLocale(dayInfo.action, secondaryLocale));
            appendContentBlock(body, copy?.recording, textForLocale(dayInfo.recordingHint, locale), textForLocale(dayInfo.recordingHint, secondaryLocale));
            card.appendChild(body);

            const prompts = Object.entries(dayInfo.prompts || {});
            if (prompts.length) {
                const promptsBlock = document.createElement('div');
                promptsBlock.className = 'plan-day-prompts';
                const title = document.createElement('strong');
                title.textContent = copy?.promptsTitle || 'Prompts';
                promptsBlock.appendChild(title);
                prompts.forEach(([key, value]) => {
                    const row = document.createElement('div');
                    const label = copy?.promptLabels?.[key] || copy?.promptLabels?.default || key;
                    const text = textForLocale(value, locale) || textForLocale(value, secondaryLocale);
                    row.textContent = `${label}：${text}`;
                    promptsBlock.appendChild(row);
                });
                card.appendChild(promptsBlock);
            }

            if (Array.isArray(dayInfo.tags) && dayInfo.tags.length) {
                const tags = document.createElement('div');
                tags.className = 'plan-day-tags';
                dayInfo.tags.forEach((tag) => {
                    const chip = document.createElement('span');
                    chip.className = 'tag-chip';
                    chip.textContent = tag.toUpperCase();
                    tags.appendChild(chip);
                });
                card.appendChild(tags);
            }

            const trackers = document.createElement('div');
            trackers.className = 'plan-day-trackers';

            const checkboxLabel = document.createElement('label');
            checkboxLabel.className = 'tracker-checkbox';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.day = String(dayInfo.day);
            checkbox.checked = Boolean(dayProgress.completed);
            checkboxLabel.appendChild(checkbox);
            const checkboxText = document.createElement('span');
            checkboxText.textContent = copy?.done || 'Completed today';
            checkboxLabel.appendChild(checkboxText);
            trackers.appendChild(checkboxLabel);

            const counterLabel = document.createElement('label');
            counterLabel.className = 'tracker-counter';
            const counterText = document.createElement('span');
            counterText.textContent = copy?.repetitions || 'Repetitions today?';
            counterLabel.appendChild(counterText);
            const counter = document.createElement('input');
            counter.type = 'number';
            counter.min = '0';
            counter.max = '10';
            counter.step = '1';
            counter.dataset.day = String(dayInfo.day);
            counter.value = dayProgress.repetitions ?? '';
            counterLabel.appendChild(counter);
            trackers.appendChild(counterLabel);
            card.appendChild(trackers);

            const toggleCopy = copy?.cardToggle || {};
            const setExpanded = (expanded) => {
                if (expanded) {
                    card.classList.add('is-expanded');
                    card.classList.remove('is-collapsed');
                    toggle.textContent = toggleCopy.collapse || 'Collapse';
                } else {
                    card.classList.add('is-collapsed');
                    card.classList.remove('is-expanded');
                    toggle.textContent = toggleCopy.expand || 'Expand';
                }
            };

            toggle.addEventListener('click', () => {
                const shouldExpand = card.classList.contains('is-collapsed');
                setExpanded(shouldExpand);
            });

            const initialExpanded = dayInfo.day === 1;
            setExpanded(initialExpanded);

            checkbox.addEventListener('change', () => {
                updateDayProgress(dayInfo.day, { completed: checkbox.checked });
            });

            counter.addEventListener('change', () => {
                const raw = counter.value;
                if (raw === '') {
                    updateDayProgress(dayInfo.day, { repetitions: null });
                    return;
                }
                const parsed = Number(raw);
                if (Number.isFinite(parsed)) {
                    const bounded = Math.min(Math.max(parsed, 0), 10);
                    counter.value = String(bounded);
                    updateDayProgress(dayInfo.day, { repetitions: bounded });
                }
            });

            fragment.appendChild(card);
        });

        view.list.innerHTML = '';
        view.list.appendChild(fragment);
        updateLearning(locale, view, phases);
    }

    function appendContentBlock(container, label, primary, secondary) {
        if (!label || (!primary && !secondary)) {
            return;
        }
        const block = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = label;
        block.appendChild(title);
        if (primary) {
            const main = document.createElement('p');
            main.textContent = primary;
            block.appendChild(main);
        }
        if (secondary && secondary !== primary) {
            const alt = document.createElement('p');
            alt.className = 'muted';
            alt.textContent = secondary;
            block.appendChild(alt);
        }
        container.appendChild(block);
    }

    function updateLearning(locale, view, phases) {
        if (!view?.learning) {
            return;
        }
        const copy = LOCALE_COPY[locale];
        const heading = copy?.learningHeading || 'Further reading';
        const cards = [];
        phases.forEach((phase, id) => {
            const resource = LEARNING_LIBRARY[id]?.[locale];
            const title = resource?.title || textForLocale(phase?.title, locale) || heading;
            const url = resource?.url || '#';
            const focus = textForLocale(phase?.focus, locale);
            cards.push({ title, url, focus });
        });

        view.learning.innerHTML = '';
        const headingEl = document.createElement('h3');
        headingEl.textContent = heading;
        view.learning.appendChild(headingEl);

        if (!cards.length) {
            const fallback = document.createElement('p');
            fallback.className = 'muted';
            fallback.textContent = copy?.noResources || '';
            view.learning.appendChild(fallback);
            return;
        }

        const list = document.createElement('div');
        list.className = 'learning-cards';
        cards.forEach((card) => {
            const link = document.createElement('a');
            link.className = 'learning-card';
            link.href = card.url;
            if (card.url.startsWith('http')) {
                link.target = '_blank';
                link.rel = 'noopener';
            }
            const title = document.createElement('strong');
            title.textContent = card.title;
            link.appendChild(title);
            if (card.focus) {
                const focus = document.createElement('span');
                focus.textContent = card.focus;
                link.appendChild(focus);
            }
            list.appendChild(link);
        });
        view.learning.appendChild(list);
    }

    function updateDayProgress(day, updates) {
        if (!activeScriptId) {
            return;
        }
        const progress = getProgress(activeScriptId);
        if (!progress.days) {
            progress.days = {};
        }
        const existing = progress.days[day] || {};
        const next = { ...existing, ...updates };
        if (Object.prototype.hasOwnProperty.call(updates, 'repetitions') && updates.repetitions === null) {
            delete next.repetitions;
        }
        progress.days[day] = next;
        setProgress(activeScriptId, progress);
        const data = scriptCache.get(activeScriptId);
        if (data) {
            renderPlan(data);
        }
    }

    function updateReminderPreference(checked) {
        if (!activeScriptId) {
            return;
        }
        const progress = getProgress(activeScriptId);
        progress.reminder = Boolean(checked);
        setProgress(activeScriptId, progress);
        const data = scriptCache.get(activeScriptId);
        if (data) {
            renderPlan(data);
        }
    }

    function clearPlanViews() {
        Object.entries(localeViews).forEach(([locale, view]) => {
            if (!view) {
                return;
            }
            if (view.list) {
                view.list.innerHTML = '';
            }
            if (view.empty) {
                view.empty.style.display = 'block';
            }
            if (view.progressText) {
                view.progressText.textContent = '0%';
            }
            if (view.progressBar) {
                view.progressBar.style.width = '0%';
            }
            if (view.learning) {
                updateLearning(locale, view, new Map());
            }
            updateRecorderAvailability(locale, false);
        });
    }

    function selectScript(scriptId) {
        if (!scriptId) {
            activeScriptId = null;
            clearPlanViews();
            return;
        }
        activeScriptId = scriptId;
        loadHabitScript(scriptId).then((data) => {
            if (data) {
                renderPlan(data);
            }
        });
    }

    function handleRadioChange(event) {
        if (!event.target.checked) {
            return;
        }
        const category = event.target.closest('.habit-category');
        if (category && category.dataset.pathway) {
            applyPathway(category.dataset.pathway, { ensureVisible: false });
        }
        const scriptId = event.target.dataset.script;
        if (scriptId) {
            selectScript(scriptId);
        } else {
            selectScript(null);
        }
        updateNextButtonState();
    }

    function attachTemplateListeners() {
        const habitInputs = Array.from(document.querySelectorAll('input[type="radio"][name^="habit"]'));
        habitInputs.forEach((input) => {
            input.addEventListener('change', handleRadioChange);
        });

        habitInputs
            .filter((input) => input.checked)
            .forEach((input) => {
                handleRadioChange({ target: input });
            });

        updateNextButtonState();
    }

    function attachReminderListeners() {
        Object.values(localeViews).forEach((view) => {
            if (!view?.reminder) {
                return;
            }
            view.reminder.addEventListener('change', (event) => {
                updateReminderPreference(event.target.checked);
            });
        });
    }

    function applyPathway(pathwayId, options = {}) {
        if (!pathwayId) {
            return;
        }
        currentPathway = pathwayId;
        const ensureVisible = options.ensureVisible !== false;

        document.querySelectorAll('.pathway-card').forEach((card) => {
            card.classList.toggle('selected', card.dataset.pathway === pathwayId);
        });

        document.querySelectorAll('.habit-category').forEach((category) => {
            const matches = category.dataset.pathway === pathwayId;
            category.classList.toggle('hidden-by-pathway', !matches);
        });

        if (ensureVisible) {
            const visibleSelected = document.querySelector('.habit-category.selected:not(.hidden-by-pathway)');
            if (!visibleSelected) {
                const firstVisible = document.querySelector(`.habit-category[data-pathway="${pathwayId}"]:not(.hidden-by-pathway)`);
                if (firstVisible) {
                    suppressCategorySync = true;
                    window.selectCategory(firstVisible);
                    suppressCategorySync = false;
                }
            }
        }
    }

    function attachPathwayListeners() {
        document.querySelectorAll('.pathway-card').forEach((card) => {
            card.addEventListener('click', () => {
                applyPathway(card.dataset.pathway, { ensureVisible: true });
            });
        });
        const defaultCard = document.querySelector('.pathway-card.selected');
        if (defaultCard?.dataset.pathway) {
            currentPathway = defaultCard.dataset.pathway;
        }
    }

    function updateNextButtonState() {
        updateNavButtons();
    }

    function onCategorySelected(categoryElement) {
        if (suppressCategorySync || !categoryElement) {
            updateNextButtonState();
            return;
        }
        const pathway = categoryElement.dataset.pathway;
        if (pathway && pathway !== currentPathway) {
            applyPathway(pathway, { ensureVisible: false });
        }
        updateNextButtonState();
    }

    function debugLoadFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const debugHabit = params.get('debugScript');
        if (!debugHabit) {
            return;
        }
        const target = document.querySelector(`input[type="radio"][data-script="${debugHabit}"]`);
        if (target) {
            target.checked = true;
            target.dispatchEvent(new Event('change', { bubbles: true }));
            goToStep(3);
        } else {
            selectScript(debugHabit);
            goToStep(3);
        }
    }

    window.nextStep = function() {
        if (currentStep === 1 && !hasReadyTemplateSelected()) {
            return;
        }
        if (currentStep < STEP_MAX) {
            goToStep(currentStep + 1);
        } else {
            const activePlan = document.querySelector('.content.active .plan-wrapper');
            if (activePlan) {
                activePlan.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    window.goBack = function() {
        if (currentStep > 1) {
            goToStep(currentStep - 1);
        }
    };

    window.HabitFlow = {
        updateStepUI,
        onCategorySelected
    };
})();
