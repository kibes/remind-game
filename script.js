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
    
    // ИСПРАВЛЕНИЕ 1: Флаг готовности кнопки для пробела
    isButtonReady: false, 

    // Определение платформы
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    isTelegramWebApp: window.Telegram && window.Telegram.WebApp,

    // ИСПРАВЛЕНИЕ 3: Новая система аудио (Web Audio API)
    audioContext: null,
    audioBuffers: {},
    soundsLoaded: false,
    audioUnlocked: false, // Флаг разблокировки контекста на iOS
    
    imagesLoaded: false
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

function setInstructionText(text, immediate = false) {
    const instruction = elements.instruction;
    if (immediate) {
        instruction.textContent = text;
        instruction.classList.add('show');
        return;
    }
    instruction.classList.remove('show');
    setTimeout(() => {
        instruction.textContent = text;
        setTimeout(() => {
            instruction.classList.add('show');
        }, 50);
    }, 300);
}

// ============================
// НОВАЯ СИСТЕМА ЗВУКОВ (WEB AUDIO API)
// ============================
// Решает проблемы с задержками и пропажей звуков на iOS

const AudioContext = window.AudioContext || window.webkitAudioContext;

function initAudioSystem() {
    try {
        state.audioContext = new AudioContext();
        console.log('AudioContext создан');
        loadAllSounds();
    } catch (e) {
        console.error('Web Audio API не поддерживается:', e);
    }
}

async function loadSoundFile(name, url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
        state.audioBuffers[name] = audioBuffer;
        console.log(`✓ Звук загружен: ${name}`);
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
        'change': 'sounds/result.mp3', // Проверьте, верно ли название файла в папке
        'victory': 'sounds/victory.mp3',
        'vic': 'sounds/vic.mp3',
        'loss': 'sounds/loss.mp3'
    };

    const promises = Object.entries(sounds).map(([name, url]) => loadSoundFile(name, url));
    await Promise.all(promises);
    state.soundsLoaded = true;
    console.log('✓ Все звуки загружены в память');
}

// Функция разблокировки аудио (критично для iOS)
function unlockAudio() {
    if (!state.audioContext || state.audioUnlocked) return;

    // Создаем и проигрываем тишину
    const buffer = state.audioContext.createBuffer(1, 1, 22050);
    const source = state.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(state.audioContext.destination);
    
    if (source.start) source.start(0);
    else if (source.noteOn) source.noteOn(0);

    // Возобновляем контекст
    if (state.audioContext.state === 'suspended') {
        state.audioContext.resume().then(() => {
            state.audioUnlocked = true;
            console.log('AudioContext разблокирован (resume)');
        });
    } else {
        state.audioUnlocked = true;
        console.log('AudioContext разблокирован');
    }
}

function playSound(name) {
    if (!state.soundsLoaded || !state.audioContext || !state.audioBuffers[name]) return;

    // Для iOS пытаемся возобновить контекст если он "уснул"
    if (state.audioContext.state === 'suspended') {
        state.audioContext.resume();
    }

    const source = state.audioContext.createBufferSource();
    source.buffer = state.audioBuffers[name];
    source.connect(state.audioContext.destination);
    
    // Запуск звука без задержки
    source.start(0);
}

// Обертки для совместимости
const playStartSound = () => playSound('start');
const playChooseSound = () => playSound('choose');
const playRepeatSound = () => playSound('repeat');
const playChangeSound = () => playSound('change');
// Таймеру теперь не нужны инстансы, WebAudio играет их "поверх" друг друга без лагов
const playTimerSound = (num) => { if(num >= 0) playSound('timer'); }; 


// ============================
// ЛОГИКА ИГРЫ
// ============================

function checkImagesLoaded() {
    let allLoaded = true;
    let loadedCount = 0;
    let totalCount = 0;
    
    for (const type of state.parts) totalCount += state.partCounts[type];
    
    for (const type of state.parts) {
        if (!state.loaded[type]) { allLoaded = false; continue; }
        for (const item of state.loaded[type]) {
            if (item && item.img && item.img.complete && item.img.naturalWidth !== 0) loadedCount++;
            else allLoaded = false;
        }
    }
    return { allLoaded, loadedCount, totalCount };
}

function updateLoadingUI() {
    const loadStatus = checkImagesLoaded();
    
    if (!loadStatus.allLoaded) {
        const progressText = `Загрузка... ${loadStatus.loadedCount}/${loadStatus.totalCount}`;
        if (elements.instruction.textContent !== progressText) {
            elements.instruction.textContent = progressText;
            elements.instruction.classList.add('show');
        }
        
        elements.startBtn.classList.add('hidden');
        elements.startBtn.disabled = true;
        // Кнопка не готова
        state.isButtonReady = false;
        
        setTimeout(updateLoadingUI, 500);
    } else {
        state.imagesLoaded = true;
        
        let instructionText = "Начнём?";
        elements.instruction.textContent = instructionText;
        elements.instruction.classList.add('show');
            
        setTimeout(() => {
            elements.startBtn.classList.remove('hidden');
            elements.startBtn.style.opacity = '0';
            elements.startBtn.style.transition = 'opacity 0.3s ease';
            
            setTimeout(() => {
                elements.startBtn.style.opacity = '1';
                elements.startBtn.disabled = false;
                elements.startBtn.style.pointerEvents = 'auto';
                
                // ИСПРАВЛЕНИЕ 1: Разрешаем пробел только когда кнопка полностью проявилась
                setTimeout(() => {
                    elements.startBtn.style.transition = '';
                    state.isButtonReady = true; 
                    console.log('Кнопка готова, можно жать пробел');
                }, 300);
            }, 50);
        }, 350);
        
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
                img.onload = r; 
                img.onerror = r; 
            }));
            state.loaded[type].push({ id: i, img: img });
        }
        await Promise.all(loadPromises);
    }
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
    
    // Глобальный слушатель для разблокировки аудио при первом тапе
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
            state.touchStartedOnButton = true;
            state.currentTouchButton = this;
            this.style.transform = 'scale(0.97)';
            // Важно для iOS аудио: действие пользователя
            unlockAudio(); 
        }, { passive: true });
        
        button.addEventListener('touchend', function(e) {
            if (state.touchStartedOnButton && state.currentTouchButton === this) {
                this.style.transform = '';
                e.preventDefault(); // Предотвращаем двойной клик
                
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
    
    // Click fallback
    elements.startBtn.addEventListener('click', (e) => { 
        if(e.detail === 0) return; // Игнорируем программные клики от touch
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
    
    if (!state.imagesLoaded) {
        updateLoadingUI();
        return;
    }
    startIdleAnimation();
}

function startIdleAnimation() {
    // Текст устанавливается либо при загрузке, либо при сбросе
    // Здесь мы просто убеждаемся, что он показан
    elements.instruction.classList.add('show');
    
    state.parts.forEach(p => {
        const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
        state.idleCharacter[p] = getRandomOrderItem(p, randomIndex);
    });
    render(elements.characterDisplay, state.idleCharacter);
    
    let lastTime = 0;
    const animateIdle = (timestamp) => {
        if (!state.idleInterval) return;
        
        if (timestamp - lastTime > 1000) {
            lastTime = timestamp;
            const p = state.parts[Math.floor(Math.random() * state.parts.length)];
            let next;
            do { 
                const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
                next = getRandomOrderItem(p, randomIndex); 
            } while (next && next.id === state.idleCharacter[p]?.id);
            
            if (next) {
                state.idleCharacter[p] = next;
                render(elements.characterDisplay, state.idleCharacter);
            }
        }
        if (state.gamePhase === 'idle') {
            requestAnimationFrame(animateIdle);
        }
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
            if (digitSpan.parentNode === timer) {
                digitSpan.classList.remove('changing');
            }
        }, 300);
    }
}

function startGame() {
    if (state.startBtnLock) return;
    
    state.startBtnLock = true;
    state.isButtonReady = false; // Блокируем пробел
    
    if (elements.startBtn && !elements.startBtn.classList.contains('hidden')) {
        hideButtonWithAnimation(elements.startBtn);
    }
    
    state.isBusy = true;
    state.gamePhase = 'creating';
    state.changeSoundPlayed = false;
    
    playStartSound();
    stopIdle();
    setInstructionText("Создаём персонажа...");
    
    if (state.fastCycle) {
        cancelAnimationFrame(state.fastCycle);
        state.fastCycle = null;
    }
    
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
        if (state.gamePhase === 'creating') {
            state.fastCycle = requestAnimationFrame(animateCreation);
        }
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
    
    setTimeout(() => {
        elements.selectBtn.classList.remove('hidden');
        elements.selectBtn.classList.add('show');
        nextCycle();
    }, 400);
}

function nextCycle() {
    if (state.currentPart >= state.parts.length) { finish(); return; }
    
    const type = state.parts[state.currentPart];
    let baseSpeed = 1200 - (state.currentPart * 200);
    let finalSpeed = state.streak > 0 ? baseSpeed * Math.pow(0.95, state.streak) : baseSpeed;
    finalSpeed = Math.max(finalSpeed, 200);
    
    let idx = 0;
    if (state.interval) clearInterval(state.interval);
    
    const cycle = () => {
        idx = (idx + 1) % state.partCounts[type];
        state.selection[type] = getRandomOrderItem(type, idx);
        render(elements.characterDisplay, state.selection);
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
        
        if (p === 100) {
            state.streak++; state.lastResult = 'win';
        } else if (p < 75) {
            state.streak = 0; state.lastResult = 'lose';
        } else {
            state.lastResult = 'almost';
        }
        
        if (state.streak > state.maxStreak) state.maxStreak = state.streak;
        
        elements.resultPercent.textContent = p + '%';
        elements.resultText.textContent = p === 100 ? "Идеально! 🎉" : (p >= 75 ? "Почти! 🤏🏻" : "Попробуй еще раз...");
        render(elements.resultTarget, state.target);
        render(elements.resultPlayer, state.selection);
        updateStats();
        
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
    
    state.round++;
    
    // ИСПРАВЛЕНИЕ 2: Меняем текст СРАЗУ, до анимации исчезновения
    elements.instruction.textContent = "Начнём?";
    elements.instruction.classList.remove('show');
    // Сбрасываем lastResult, чтобы startIdleAnimation не перезаписал текст
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
        
        // Разрешаем пробел только после появления кнопки (таймаут такой же как при загрузке)
        state.isButtonReady = false;
        setTimeout(() => {
            state.isButtonReady = true;
        }, 300);
        
        elements.resultAgainBtn.disabled = false;
        
        elements.selectBtn.classList.remove('show');
        elements.selectBtn.classList.add('hidden');
        
        elements.gameArea.classList.remove('hidden');
        updateStats();
        
        setTimeout(() => {
            startIdle();
        }, 100);
    }, 400);
}

function updateStats() {
    const anim = (el, val) => {
        if (el.textContent != val) {
            el.classList.add('updating');
            setTimeout(() => { 
                el.textContent = val; 
                el.classList.remove('updating'); 
            }, 300);
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
        
        // ИСПРАВЛЕНИЕ 1: Блокировка пробела если кнопка не готова
        if (state.gamePhase === 'idle' && !state.isButtonReady) return;
        
        if (state.gamePhase === 'finished' && !state.resultScreenVisible) return;
        if (state.gamePhase === 'selecting' && !state.canSelect) return;
        
        unlockAudio();
        
        if (state.gamePhase === 'idle' && !state.startBtnLock) {
            startGame();
        } else if (state.gamePhase === 'selecting' && state.canSelect) {
            select();
        } else if (state.gamePhase === 'finished' && !state.resetBtnLock && state.resultScreenVisible) {
            reset();
        }
    }
});

// Утилиты
document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - (window.lastTouchEnd || 0) < 300) e.preventDefault();
    window.lastTouchEnd = now;
}, { passive: false });

document.addEventListener('selectstart', e => { e.preventDefault(); return false; });
document.addEventListener('contextmenu', e => { e.preventDefault(); return false; });

// Инициализация
window.onload = async () => {
    // Инициализация аудио (создание контекста)
    initAudioSystem();
    
    try {
        await loadImages();
        if (tg) tg.ready();
        setupTouchHandlers();
        startIdle();
    } catch (error) {
        console.error('Ошибка:', error);
        updateLoadingUI();
        startIdle();
    }
};