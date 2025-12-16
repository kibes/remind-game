{
// ============================
// SUPABASE CONFIGURATION (НАСТРОЙКА БАЗЫ ДАННЫХ)
// ============================

// !!! ВСТАВЬТЕ СЮДА ВАШИ РЕАЛЬНЫЕ КЛЮЧИ !!!
const SUPABASE_URL = 'https://lmlgnsthwwvcczoatoag.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_PQiqm6aI8DcfGYXog73idg_O9dWKx_R'; 

let supabaseClient = null;

function initSupabase() {
    if (window.supabase && SUPABASE_URL !== 'ВАШ_SUPABASE_URL') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✓ Supabase клиент инициализирован');
    } else {
        console.warn('Ошибка: Supabase ключи не установлены, или библиотека не загружена. Сохранение отключено.');
    }
}


// Telegram Web App интеграция
let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.expand();
    tg.enableClosingConfirmation();
}

// Основной объект состояния игры
const state = {
    round: 1,
    maxStreak: 0,
    streak: 0,
    target: {},
    selection: {},
    parts: ['skin', 'head', 'body', 'accessory'],
    partCounts: { skin: 4, head: 7, body: 8, accessory: 7 },
    loaded: {},
    order: {},
    interval: null,
    idleInterval: null,
    currentPart: 0,
    canSelect: true,
    idleCharacter: {},
    lastResult: null,
    isBusy: false,
    isTimerActive: false,
    gamePhase: 'idle',
    fastCycle: null,
    startBtnLock: false,
    resetBtnLock: false,
    userInteracted: false,
    isButtonReady: false, 

    // Определение платформы
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    isTelegramWebApp: window.Telegram && window.Telegram.WebApp,

    // Аудио система
    audioContext: null,
    audioBuffers: {},
    soundsLoaded: false,
    audioUnlocked: false,
    
    // Флаги загрузки
    imagesLoaded: false, // Глобальный флаг, когда Promise.all завершен
    resourcesReady: false // Когда готовы и картинки, и звуки
};

// Ссылки на DOM элементы
const elements = {
    round: document.getElementById('round'),
    maxStreak: document.getElementById('max-streak'),
    streak: document.getElementById('streak'),
    timer: document.getElementById('timer'),
    instruction: document.getElementById('instruction'),
    characterDisplay: document.getElementById('character-display'),
    startBtn: document.getElementById('start-btn'),
    selectBtn: document.getElementById('select-btn'),
    resultAgainBtn: document.getElementById('result-again-btn'),
    gameArea: document.getElementById('game-area'),
    resultScreen: document.getElementById('result-screen'),
    resultPercent: document.getElementById('result-percent'),
    resultText: document.getElementById('result-text'),
    resultTarget: document.getElementById('result-target'),
    resultPlayer: document.getElementById('result-player')
};

// ИСПРАВЛЕНИЕ TWA: Принудительная изоляция слоев
if (elements.characterDisplay) {
    elements.characterDisplay.style.isolation = 'isolate';
    elements.characterDisplay.style.webkitIsolation = 'isolate';
}

function setInstructionText(text, immediate = false) {
    const instruction = elements.instruction;
    if (immediate) {
        instruction.textContent = text;
        instruction.classList.add('show');
        return;
    }
    // Плавная анимация (исчезновение -> смена текста -> появление)
    instruction.classList.remove('show');
    setTimeout(() => {
        instruction.textContent = text;
        setTimeout(() => {
            instruction.classList.add('show');
        }, 50);
    }, 300);
}

// ============================
// AUDIO SYSTEM (Web Audio API)
// ============================

const AudioContext = window.AudioContext || window.webkitAudioContext;

function initAudioSystem() {
    try {
        state.audioContext = new AudioContext();
        loadAllSounds();
    } catch (e) {
        console.error('Web Audio API не поддерживается:', e);
        state.soundsLoaded = true; 
    }
}

async function loadSoundFile(name, url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
        state.audioBuffers[name] = audioBuffer;
    } catch (e) {
        console.error(`Ошибка загрузки звука ${name}:`, e);
    }
}

async function loadAllSounds() {
    const sounds = {
        'start': 'sounds/start.mp3',
        'choose': 'sounds/choose.mp3',
        'repeat': 'sounds/repeat.mp3',
        'timer': 'sounds/timer.mp3',
        'change': 'sounds/result.mp3',
        'victory': 'sounds/victory.mp3',
        'vic': 'sounds/vic.mp3',
        'loss': 'sounds/loss.mp3',
        'next': 'sounds/next.mp3'
    };

    const promises = Object.entries(sounds).map(([name, url]) => loadSoundFile(name, url));
    await Promise.all(promises);
    state.soundsLoaded = true;
    console.log('✓ Все звуки загружены');
    updateLoadingUI();
}

function unlockAudio() {
    if (!state.audioContext || state.audioUnlocked) return;
    
    const buffer = state.audioContext.createBuffer(1, 1, 22050);
    const source = state.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(state.audioContext.destination);
    if (source.start) source.start(0);
    else if (source.noteOn) source.noteOn(0);

    if (state.audioContext.state === 'suspended') {
        state.audioContext.resume();
    }
    state.audioUnlocked = true;
}

function playSound(name) {
    if (!state.soundsLoaded || !state.audioContext || !state.audioBuffers[name]) return;
    if (state.audioContext.state === 'suspended') state.audioContext.resume();

    const source = state.audioContext.createBufferSource();
    source.buffer = state.audioBuffers[name];
    source.connect(state.audioContext.destination);
    source.start(0);
}

const playStartSound = () => playSound('start');
const playChooseSound = () => playSound('choose');
const playRepeatSound = () => playSound('repeat');
const playChangeSound = () => playSound('change');
const playNextSound = () => playSound('next'); 
const playTimerSound = (num) => { if(num >= 0) playSound('timer'); }; 


// ============================
// DATABASE LOGIC (ЛОГИКА БАЗЫ ДАННЫХ)
// ============================

async function loadPlayerData() {
    if (!supabaseClient || !tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) return;

    const user_id = tg.initDataUnsafe.user.id;
    
    const { data, error } = await supabaseClient
        .from('players')
        .select('*')
        .eq('user_id', user_id)
        .single();

    if (error && error.code !== 'PGRST116') { 
        console.error('Ошибка загрузки данных игрока:', error);
        return;
    }

    if (data) {
        state.streak = data.streak || 0;
        state.maxStreak = data.max_streak || 0;
        console.log(`✓ Данные игрока загружены. Стрик: ${state.streak}`);
    } else {
        console.log('Нет данных игрока. Начинаем с нуля.');
    }
    
    updateStats();
}

// FIX: Новая функция для сброса серии на сервере (Anti-Cheat)
async function resetStreakOnServer() {
    if (!supabaseClient || !tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) return;
    
    const user_id = tg.initDataUnsafe.user.id;
    
    // Сбрасываем только на сервере, локально оставляем для UI
    await supabaseClient
        .from('players')
        .update({ streak: 0 })
        .eq('user_id', user_id);
        
    console.log('Anti-cheat: Streak staked at 0 on server (game phase started)');
}

async function savePlayerData() {
    if (!supabaseClient || !tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) return;

    const user = tg.initDataUnsafe.user;
    
    let userName;
    if (user.first_name) {
        userName = user.first_name;
        if (user.last_name) {
            userName += ' ' + user.last_name;
        }
    } else if (user.username) {
        userName = user.username; 
    } else {
        userName = 'Unknown';
    }

    const playerData = {
        user_id: user.id,
        username: userName, 
        streak: state.streak,
        max_streak: state.maxStreak,
        updated_at: new Date() 
    };

    const { error } = await supabaseClient
        .from('players')
        .upsert(playerData, { onConflict: 'user_id' });

    if (error) {
        console.error('Ошибка сохранения данных игрока:', error);
    } else {
        console.log('✓ Данные игрока сохранены');
    }
}


// ============================
// GAME LOGIC
// ============================

// FIX: Убрана ненадежная проверка naturalWidth, которая вешала игру на Desktop
// Мы доверяем Promise.all в loadImages.
function updateLoadingUI() {
    // Если уже все готово, выходим (чтобы не зацикливаться)
    if (state.resourcesReady) return;

    // Считаем прогресс (упрощенно, так как загрузка теперь асинхронная)
    let progressPercent = 0;
    if (state.imagesLoaded && !state.soundsLoaded) progressPercent = 80;
    else if (state.imagesLoaded && state.soundsLoaded) progressPercent = 100;
    else progressPercent = 10; // Просто стартовое значение
    
    if (progressPercent < 100) {
        const progressText = `Загрузка... ${progressPercent}%`;
        // FIX: Используем immediate=true для обновления цифр, чтобы они не мерцали
        if (elements.instruction.textContent !== progressText) {
            setInstructionText(progressText, true);
        }
        
        elements.startBtn.classList.add('hidden');
        elements.startBtn.disabled = true;
        elements.startBtn.style.opacity = '0'; 
        state.isButtonReady = false;
        
        // Продолжаем проверять, пока флаги не станут true
        if (!state.imagesLoaded || !state.soundsLoaded) {
            // Редкий опрос флагов, т.к. они обновятся колбэками
            return; 
        }
    }

    // Если мы здесь, значит всё 100%
    if (state.imagesLoaded && state.soundsLoaded && !state.resourcesReady) {
        state.resourcesReady = true;
        console.log('✓ UI разблокирован');

        // FIX: Красивый переход от "Загрузка 100%" к "Начнём?"
        // Используем immediate=false (по умолчанию), чтобы сработала CSS анимация
        setInstructionText("Начнём?"); 
        
        elements.startBtn.classList.remove('hidden');
        elements.startBtn.style.opacity = '0';
        
        setTimeout(() => {
            elements.startBtn.style.transition = 'opacity 0.3s ease';
            elements.startBtn.style.opacity = '1';
            elements.startBtn.disabled = false;
            elements.startBtn.style.pointerEvents = 'auto';
            
            setTimeout(() => {
                elements.startBtn.style.transition = '';
                state.isButtonReady = true; 
            }, 300);
        }, 100);
        
        if (state.gamePhase === 'idle') {
            startIdleAnimation();
        }
    }
}

function preloadCriticalImages() {
    ['skins/1.png', 'heads/1.png', 'bodies/1.png', 'accessories/1.png'].forEach(src => {
        (new Image()).src = src;
    });
}

function createRandomOrder() {
    state.order = {};
    state.parts.forEach(type => {
        const indices = Array.from({length: state.partCounts[type]}, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        state.order[type] = indices;
    });
}

function getRandomOrderItem(type, index) {
    if (!state.order[type] || !state.loaded[type]) return null;
    const realIndex = state.order[type][index % state.order[type].length];
    return state.loaded[type][realIndex];
}

async function loadImages() {
    const folders = { skin: 'skins/', head: 'heads/', body: 'bodies/', accessory: 'accessories/' };
    preloadCriticalImages();
    
    for (const type of state.parts) {
        state.loaded[type] = [];
        const loadPromises = [];
        for (let i = 1; i <= state.partCounts[type]; i++) {
            const img = new Image();
            img.src = `${folders[type]}${i}.png`;
            loadPromises.push(new Promise(r => { 
                img.onload = () => r(true); 
                img.onerror = () => { console.warn('Img fail', img.src); r(false); }; 
            }));
            state.loaded[type].push({ id: i, img: img });
        }
        await Promise.all(loadPromises);
    }
    // FIX: Явно ставим флаг готовности после завершения промисов
    state.imagesLoaded = true;
    updateLoadingUI();
}

function render(container, data) {
    const fragment = document.createDocumentFragment();
    state.parts.forEach(p => {
        if (data[p] && data[p].img) {
            const div = document.createElement('div');
            div.className = 'character-layer';
            div.style.backgroundImage = `url('${data[p].img.src}')`;
            fragment.appendChild(div);
        }
    });
    container.innerHTML = '';
    container.appendChild(fragment);
}

function setupTouchHandlers() {
    const buttons = [elements.startBtn, elements.selectBtn, elements.resultAgainBtn];
    
    const globalUnlock = () => {
        unlockAudio();
        document.removeEventListener('touchstart', globalUnlock);
        document.removeEventListener('click', globalUnlock);
    };
    document.addEventListener('touchstart', globalUnlock, { passive: true });
    document.addEventListener('click', globalUnlock, { passive: true });

    buttons.forEach(button => {
        if (!button) return;
        
        button.addEventListener('touchstart', function(e) {
            if (this.disabled || this.classList.contains('hidden')) return;
            state.touchStartedOnButton = true;
            state.currentTouchButton = this;
            this.style.transform = 'scale(0.97)';
            unlockAudio(); 
        }, { passive: true });
        
        button.addEventListener('touchend', function(e) {
            if (!state.touchStartedOnButton || state.currentTouchButton !== this) return;

            this.style.transform = '';
            
            const touch = e.changedTouches[0];
            const rect = this.getBoundingClientRect();
            const isStillInside = (
                touch.clientX >= rect.left && 
                touch.clientX <= rect.right && 
                touch.clientY >= rect.top && 
                touch.clientY <= rect.bottom
            );

            if (isStillInside) {
                e.preventDefault(); 
                
                if (this === elements.startBtn) handleStartButton();
                else if (this === elements.selectBtn) handleSelectButton();
                else if (this === elements.resultAgainBtn) handleResetButton();
            }

            state.touchStartedOnButton = false;
            state.currentTouchButton = null;
        }, { passive: false });
        
        button.addEventListener('touchcancel', function() {
            state.touchStartedOnButton = false;
            this.style.transform = '';
        }, { passive: true });
    });
    
    elements.startBtn.addEventListener('click', (e) => { 
        if(e.detail === 0) return; 
        handleStartButton(); 
    });
    elements.selectBtn.addEventListener('click', (e) => { 
        if(e.detail === 0) return;
        handleSelectButton(); 
    });
    elements.resultAgainBtn.addEventListener('click', (e) => { 
        if(e.detail === 0) return;
        handleResetButton(); 
    });
}

function handleStartButton() {
    if (state.startBtnLock) return;
    unlockAudio();
    startGame();
}

function handleSelectButton() {
    unlockAudio();
    select();
}

function handleResetButton() {
    unlockAudio();
    reset();
}

function startIdle() {
    state.gamePhase = 'idle';
    state.startBtnLock = false;
    state.resetBtnLock = false;
    state.canPressSpace = true;
    state.resultScreenVisible = false;
    state.changeSoundPlayed = false;
    
    createRandomOrder();
    
    if (!state.resourcesReady) {
        updateLoadingUI();
        return;
    }
    startIdleAnimation();
}

// FIX: Исправлена логика первого кадра, чтобы персонаж не дергался и не менял 2 части сразу
function startIdleAnimation() {
    // Если картинки еще не прогрузились (на случай быстрого вызова)
    if (!state.imagesLoaded) return;

    elements.instruction.classList.add('show');
    
    // 1. Сначала генерируем и отрисовываем стартового персонажа
    state.parts.forEach(p => {
        const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
        state.idleCharacter[p] = getRandomOrderItem(p, randomIndex);
    });
    render(elements.characterDisplay, state.idleCharacter);
    
    let lastTime = 0;
    let partIndex = 0; 
    let isFirstFrame = true; // Флаг для первого запуска цикла
    
    const animateIdle = (timestamp) => {
        if (!state.idleInterval) return;
        
        // FIX: На первом кадре просто запоминаем время, НЕ обновляем персонажа
        if (isFirstFrame) {
            lastTime = timestamp;
            isFirstFrame = false;
            state.idleInterval = requestAnimationFrame(animateIdle);
            return;
        }
        
        // Теперь обновление произойдет ровно через 1000мс после отрисовки
        if (timestamp - lastTime > 1000) { 
            lastTime = timestamp;
            
            const p = state.parts[partIndex % state.parts.length];
            
            let next;
            do { 
                const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
                next = getRandomOrderItem(p, randomIndex); 
            } while (next && next.id === state.idleCharacter[p]?.id);
            
            if (next) {
                state.idleCharacter[p] = next;
                render(elements.characterDisplay, state.idleCharacter);
            }
            
            partIndex++; 
        }
        
        if (state.gamePhase === 'idle') requestAnimationFrame(animateIdle);
    };
    
    if (state.idleInterval) cancelAnimationFrame(state.idleInterval);
    state.idleInterval = requestAnimationFrame(animateIdle);
}


function stopIdle() { 
    if (state.idleInterval) {
        cancelAnimationFrame(state.idleInterval);
        state.idleInterval = null;
    }
}

function hideButtonWithAnimation(button) {
    if (!button || button.classList.contains('hidden')) return;
    button.style.transition = 'all 0.2s ease';
    button.style.opacity = '0';
    button.style.transform = 'scale(0.8)';
    setTimeout(() => {
        button.classList.add('hidden');
        button.style.transition = '';
        button.style.opacity = '';
        button.style.transform = '';
    }, 200);
}

function animateTimerChange(timerNumber) {
    const timer = elements.timer;
    if (timer.textContent && timer.textContent.trim()) {
        const digitSpan = document.createElement('span');
        digitSpan.className = 'timer-digit changing';
        digitSpan.textContent = timer.textContent;
        timer.innerHTML = '';
        timer.appendChild(digitSpan);
        playTimerSound(timerNumber);
        setTimeout(() => {
            if (digitSpan.parentNode === timer) digitSpan.classList.remove('changing');
        }, 300);
    }
}

function startGame() {
    if (state.startBtnLock) return;
    
    state.startBtnLock = true;
    state.isButtonReady = false;
    
    // FIX: Убрали resetStreakOnServer() отсюда, чтобы не сбрасывать при случайном закрытии во время генерации
    
    if (elements.startBtn && !elements.startBtn.classList.contains('hidden')) {
        hideButtonWithAnimation(elements.startBtn);
    }
    
    state.isBusy = true;
    state.gamePhase = 'creating';
    state.changeSoundPlayed = false;
    
    playStartSound();
    stopIdle();
    setInstructionText("Создаём персонажа...");
    
    if (state.fastCycle) { cancelAnimationFrame(state.fastCycle); state.fastCycle = null; }
    
    let duration = 0;
    let lastTime = 0;
    const animateCreation = (timestamp) => {
        if (!state.fastCycle) return;
        if (timestamp - lastTime > 50) {
            lastTime = timestamp;
            const temp = {};
            state.parts.forEach(p => {
                const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
                temp[p] = getRandomOrderItem(p, randomIndex);
            });
            render(elements.characterDisplay, temp);
            duration += 50;
            
            if (!state.changeSoundPlayed) {
                playChangeSound();
                state.changeSoundPlayed = true;
            }
            if (duration >= 2000) {
                cancelAnimationFrame(state.fastCycle);
                state.fastCycle = null;
                finalizeTarget();
                return;
            }
        }
        if (state.gamePhase === 'creating') state.fastCycle = requestAnimationFrame(animateCreation);
    };
    state.fastCycle = requestAnimationFrame(animateCreation);
}

function getMemorizeTime() {
    if (state.streak >= 50) return 1;
    else if (state.streak >= 30) return 2;
    else if (state.streak >= 15) return 3;
    else if (state.streak >= 5) return 4;
    else return 5;
}

function finalizeTarget() {
    state.gamePhase = 'memorizing';
    state.parts.forEach(p => {
        const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
        state.target[p] = getRandomOrderItem(p, randomIndex);
    });
    render(elements.characterDisplay, state.target);
    
    setTimeout(() => {
        setInstructionText("Запомни персонажа");
        let timeLeft = getMemorizeTime();
        elements.timer.textContent = timeLeft;
        elements.timer.classList.add('show');
        state.isTimerActive = true;
        setTimeout(() => animateTimerChange(timeLeft), 100);
        
        const t = setInterval(() => {
            timeLeft--;
            if (timeLeft < 0) {
                clearInterval(t);
                elements.timer.classList.remove('show');
                state.isTimerActive = false;
                setTimeout(startSelecting, 300);
                return;
            }
            elements.timer.textContent = timeLeft;
            animateTimerChange(timeLeft);
        }, 1000);
    }, 500);
}

function startSelecting() {
    // FIX: Сбрасываем стрик на сервере в 0 именно здесь.
    // Если игрок закроет игру сейчас (после того как таймер вышел), стрик обнулится.
    resetStreakOnServer();

    state.gamePhase = 'selecting';
    state.currentPart = 0;
    state.selection = {};
    state.canSelect = true;
    state.isBusy = false;
    state.canPressSpace = false;

    const firstType = state.parts[0];
    state.selection[firstType] = getRandomOrderItem(firstType, 0);
    render(elements.characterDisplay, state.selection);
    setInstructionText(`Выбери ${getLabel(firstType)}`);
    
    playNextSound();
    
    setTimeout(() => {
        elements.selectBtn.classList.remove('hidden');
        elements.selectBtn.classList.add('show');
        nextCycle();
    }, 400);
}

function nextCycle() {
    if (state.currentPart >= state.parts.length) { finish(); return; }
    
    const type = state.parts[state.currentPart];
    let baseSpeed = 1200 - (state.currentPart * 184);
    let finalSpeed = state.streak > 0 ? baseSpeed * Math.pow(0.968, state.streak) : baseSpeed;
    finalSpeed = Math.max(finalSpeed, 250);
    
    let idx = 0;
    if (state.interval) clearInterval(state.interval);
    
    const cycle = () => {
        idx = (idx + 1) % state.partCounts[type];
        state.selection[type] = getRandomOrderItem(type, idx);
        render(elements.characterDisplay, state.selection);
        
        playNextSound();
    };
    state.interval = setInterval(cycle, finalSpeed);
    setTimeout(() => { state.canPressSpace = true; }, 200);
}

function getLabel(t) { 
    return {skin:'цвет кожи', head:'голову', body:'тело', accessory:'аксессуар'}[t]; 
}

function select() {
    if (!state.canSelect || state.gamePhase !== 'selecting') return false;
    
    playChooseSound();
    state.canSelect = false;
    state.canPressSpace = false;
    
    if (state.interval) { clearInterval(state.interval); state.interval = null; }
    state.currentPart++;
    
    if (state.currentPart >= state.parts.length) {
        hideButtonWithAnimation(elements.selectBtn);
        setTimeout(() => { state.canSelect = true; finish(); }, 200);
    } else {
        const nextType = state.parts[state.currentPart];
        state.selection[nextType] = getRandomOrderItem(nextType, 0);
        render(elements.characterDisplay, state.selection);
        setInstructionText(`Выбери ${getLabel(nextType)}`);
        
        playNextSound(); 
        
        setTimeout(() => { state.canSelect = true; nextCycle(); }, 150);
    }
    return true;
}

function finish() {
    state.gamePhase = 'finished';
    state.isBusy = true;
    state.canPressSpace = false;
    state.resultScreenVisible = false;
    
    if (state.interval) { clearInterval(state.interval); state.interval = null; }
    elements.gameArea.classList.add('hidden');
    
    setTimeout(() => {
        let m = 0;
        state.parts.forEach(p => { 
            if(state.selection[p] && state.target[p] && state.selection[p].id === state.target[p].id) m++; 
        });
        const p = Math.round((m/4)*100);
        
        if (p === 100) { state.streak++; state.lastResult = 'win'; }
        else if (p < 75) { state.streak = 0; state.lastResult = 'lose'; }
        else { state.lastResult = 'almost'; }
        
        if (state.streak > state.maxStreak) state.maxStreak = state.streak;
        
        elements.resultPercent.textContent = p + '%';
        elements.resultText.textContent = p === 100 ? "Идеально! 🎉" : (p >= 75 ? "Почти! 🤏🏻" : "Попробуй еще раз...");
        render(elements.resultTarget, state.target);
        render(elements.resultPlayer, state.selection);
        updateStats();
        
        // --- СОХРАНЕНИЕ ДАННЫХ В БАЗУ ДАННЫХ ---
        // Записываем реальный результат (или 0, если проиграл, или +1 если выиграл)
        savePlayerData();
        // ---------------------------------------
        
        elements.resultScreen.style.display = 'flex';
        setTimeout(() => {
            elements.resultScreen.classList.add('show');
            setTimeout(() => {
                state.resultScreenVisible = true;
                state.canPressSpace = true;
            }, 400);
        }, 50);
        
        state.startBtnLock = false;
        state.resetBtnLock = false;
        state.isBusy = false;
        
        if (p === 100) playSound('victory');
        else if (p >= 75) playSound('vic');
        else playSound('loss');
        
        if (tg && tg.sendData) {
            tg.sendData(JSON.stringify({
                round: state.round,
                streak: state.streak,
                maxStreak: state.maxStreak,
                lastResult: p
            }));
        }
    }, 400);
}

function reset() {
    if (state.resetBtnLock || state.isBusy) return;
    
    playRepeatSound();
    
    state.resetBtnLock = true;
    state.canPressSpace = false;
    elements.resultAgainBtn.disabled = true;
    
    let welcomeText = "Начнём?";
    if (state.lastResult === 'win') {
        if (state.streak >= 60) {
            welcomeText = "Максимальная сложность!";
        } else {
            welcomeText = "Сложность повысилась!";
        }
    } else if (state.lastResult === 'almost') {
        welcomeText = "Попробуем ещё?";
    } else if (state.lastResult === 'lose') {
        welcomeText = "Начнём сначала?";
    }

    state.round++;
    elements.instruction.textContent = welcomeText; 
    elements.instruction.classList.remove('show');
    state.lastResult = null; 
    
    elements.resultScreen.classList.remove('show');
    
    state.target = {};
    state.selection = {};
    state.idleCharacter = {};
    elements.characterDisplay.innerHTML = '';
    
    setTimeout(() => {
        elements.resultTarget.innerHTML = '';
        elements.resultPlayer.innerHTML = '';
        
        elements.startBtn.classList.remove('hidden');
        elements.startBtn.style.opacity = '1';
        elements.startBtn.style.transform = 'scale(1)';
        elements.startBtn.disabled = false;
        elements.startBtn.style.pointerEvents = 'auto';
        
        state.isButtonReady = false;
        setTimeout(() => { state.isButtonReady = true; }, 300);
        
        elements.resultAgainBtn.disabled = false;
        elements.selectBtn.classList.remove('show');
        elements.selectBtn.classList.add('hidden');
        elements.gameArea.classList.remove('hidden');
        updateStats();
        
        setTimeout(startIdle, 100);
    }, 400);
}

function updateStats() {
    const anim = (el, val) => {
        if (el.textContent != val) {
            el.classList.add('updating');
            setTimeout(() => { el.textContent = val; el.classList.remove('updating'); }, 300);
        }
    };
    anim(elements.round, state.round);
    anim(elements.streak, state.streak);
    anim(elements.maxStreak, state.maxStreak);
}

window.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        if (state.isTimerActive || state.isBusy || state.gamePhase === 'memorizing' || state.gamePhase === 'creating') return;
        if (!state.canPressSpace) return;
        if (state.gamePhase === 'idle' && !state.isButtonReady) return;
        if (state.gamePhase === 'finished' && !state.resultScreenVisible) return;
        if (state.gamePhase === 'selecting' && !state.canSelect) return;
        
        unlockAudio();
        
        if (state.gamePhase === 'idle' && !state.startBtnLock) startGame();
        else if (state.gamePhase === 'selecting' && state.canSelect) select();
        else if (state.gamePhase === 'finished' && !state.resetBtnLock && state.resultScreenVisible) reset();
    }
});

document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - (window.lastTouchEnd || 0) < 300) e.preventDefault();
    window.lastTouchEnd = now;
}, { passive: false });

document.addEventListener('selectstart', e => { e.preventDefault(); return false; });
document.addEventListener('contextmenu', e => { e.preventDefault(); return false; });

window.onload = async () => {
    if (elements.instruction) {
        setInstructionText("Загрузка... 0%", true); 
    }
    
    if (elements.startBtn) {
        elements.startBtn.classList.add('hidden');
        elements.startBtn.disabled = true;
    }
    
    initSupabase(); 
    initAudioSystem();
    
    try {
        const loadPromises = [
            loadImages(),
            loadPlayerData()
        ];
        
        await Promise.all(loadPromises);
        
        if (tg) tg.ready();
        setupTouchHandlers();
        startIdle();
    } catch (error) {
        console.error('Критическая ошибка:', error);
        // Даже если ошибка, пробуем показать UI (например, звуки не загрузились)
        state.imagesLoaded = true;
        state.soundsLoaded = true;
        updateLoadingUI(); 
        startIdle();
    }
};
}