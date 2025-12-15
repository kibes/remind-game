// Telegram Web App интеграция
let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.expand(); // Раскрываем на весь экран
    tg.enableClosingConfirmation(); // Включаем подтверждение закрытия
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
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    isIOS: /iPhone|iPad|iPod/i.test(navigator.userAgent),
    isAndroid: /Android/i.test(navigator.userAgent),
    audioEnabled: true,
    soundsLoaded: false,
    audioInitialized: false,
    lastPlayTime: {},
    audioLock: {},
    timerSoundVolume: 1.2,
    userInteracted: false,
    forceAudioFallback: false // Флаг для принудительного использования фолбэка
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

// Объект для хранения звуков
const audio = {
    start: null,
    choose: null,
    repeat: null,
    timer: null,
    change: null,
    next: null,
    result: null,
    victory: null,
    vic: null,
    loss: null
};

// Универсальное создание аудио элементов
function createAudioElement(src, volume = 1.0) {
    const audioElement = new Audio();
    
    // Устанавливаем базовые атрибуты
    audioElement.preload = 'auto';
    audioElement.src = src;
    audioElement.volume = volume;
    
    // Для кросс-доменных запросов
    if (src.startsWith('http')) {
        audioElement.crossOrigin = 'anonymous';
    }
    
    // Предзагрузка
    audioElement.load();
    
    return audioElement;
}

// Инициализация звуков
function initAudio() {
    if (state.soundsLoaded) return;
    
    console.log("Инициализация аудио");
    
    try {
        // Создаем все аудио элементы
        audio.start = createAudioElement('sounds/start.mp3', 1.0);
        audio.choose = createAudioElement('sounds/choose.mp3', 1.0);
        audio.repeat = createAudioElement('sounds/repeat.mp3', 1.0);
        audio.timer = createAudioElement('sounds/timer.mp3', state.timerSoundVolume);
        audio.change = createAudioElement('sounds/change.mp3', 1.0);
        audio.next = createAudioElement('sounds/next.mp3', 0.6);
        audio.result = createAudioElement('sounds/result.mp3', 1.0);
        audio.victory = createAudioElement('sounds/victory.mp3', 1.0);
        audio.vic = createAudioElement('sounds/vic.mp3', 1.0);
        audio.loss = createAudioElement('sounds/loss.mp3', 1.0);
        
        // Инициализируем объекты для отслеживания
        for (const key in audio) {
            state.lastPlayTime[key] = 0;
            state.audioLock[key] = false;
        }
        
        state.soundsLoaded = true;
        state.audioInitialized = true;
        console.log("Аудио элементы инициализированы");
    } catch (error) {
        console.warn("Ошибка инициализации аудио:", error);
        state.forceAudioFallback = true;
    }
}

// Универсальная функция воспроизведения звука
function playSound(soundName) {
    if (!state.audioEnabled || !state.soundsLoaded) {
        console.log("Аудио отключено или не загружено:", soundName);
        return false;
    }
    
    const sound = audio[soundName];
    if (!sound) {
        console.warn("Звук не найден:", soundName);
        return false;
    }
    
    const now = Date.now();
    const timeSinceLastPlay = now - state.lastPlayTime[soundName];
    
    // Минимальная задержка между одинаковыми звуками
    if (timeSinceLastPlay < 50) {
        return false;
    }
    
    if (state.audioLock[soundName]) {
        return false;
    }
    
    state.audioLock[soundName] = true;
    state.lastPlayTime[soundName] = now;
    
    try {
        // Всегда сбрасываем время
        sound.currentTime = 0;
        
        // Для некоторых устройств может потребоваться перезагрузка
        if (sound.readyState === 0) {
            sound.load();
        }
        
        // Пробуем воспроизвести
        const playPromise = sound.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Снимаем блокировку после завершения
                sound.onended = () => {
                    state.audioLock[soundName] = false;
                };
                
                // На всякий случай снимаем блокировку через время
                setTimeout(() => {
                    state.audioLock[soundName] = false;
                }, 1000);
                
            }).catch(error => {
                console.warn(`Не удалось воспроизвести ${soundName}:`, error);
                state.audioLock[soundName] = false;
                
                // Пробуем фолбэк
                if (state.forceAudioFallback) {
                    setTimeout(() => {
                        try {
                            const fallbackSound = new Audio(sound.src);
                            fallbackSound.volume = sound.volume;
                            fallbackSound.play().catch(() => {});
                        } catch (e) {
                            console.warn("Фолбэк не сработал:", e);
                        }
                    }, 10);
                }
            });
        } else {
            state.audioLock[soundName] = false;
        }
        
        return true;
    } catch (error) {
        console.warn(`Ошибка при попытке воспроизвести ${soundName}:`, error);
        state.audioLock[soundName] = false;
        return false;
    }
}

// Функция для воспроизведения тихого звука next.mp3
function playQuietNextSound() {
    if (!state.audioEnabled || !audio.next) return;
    
    try {
        const originalVolume = audio.next.volume;
        audio.next.volume = originalVolume * 0.3;
        
        playSound('next');
        
        setTimeout(() => {
            audio.next.volume = originalVolume;
        }, 100);
    } catch (error) {
        console.warn("Ошибка тихого звука next:", error);
    }
}

// Функция для звука таймера
function playTimerSound(number) {
    if (!state.audioEnabled || !audio.timer) return;
    
    try {
        let playbackRate = 1.0;
        switch(number) {
            case 5: playbackRate = 0.7; break;
            case 4: playbackRate = 0.8; break;
            case 3: playbackRate = 0.9; break;
            case 2: playbackRate = 1.1; break;
            case 1: playbackRate = 1.3; break;
            default: playbackRate = 1.0;
        }
        
        audio.timer.playbackRate = playbackRate;
        audio.timer.volume = state.timerSoundVolume;
        
        // Для таймера используем отдельную копию для надежности
        if (state.forceAudioFallback) {
            const timerSound = new Audio('sounds/timer.mp3');
            timerSound.volume = state.timerSoundVolume;
            timerSound.playbackRate = playbackRate;
            timerSound.play().catch(() => {});
        } else {
            playSound('timer');
        }
        
    } catch (error) {
        console.warn("Ошибка звука таймера:", error);
    }
}

// Простая активация аудио
function activateAudioSystem() {
    return new Promise((resolve) => {
        if (!state.soundsLoaded) {
            initAudio();
        }
        
        // Простая активация через тихий звук
        try {
            const silentAudio = new Audio();
            silentAudio.volume = 0.0001;
            
            // Короткий звук в формате base64
            silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ';
            
            silentAudio.play().then(() => {
                setTimeout(() => {
                    silentAudio.pause();
                    state.audioInitialized = true;
                    console.log("Аудио система активирована");
                    resolve(true);
                }, 50);
            }).catch(() => {
                // Даже если не удалось, продолжаем
                state.audioInitialized = true;
                resolve(true);
            });
        } catch (error) {
            console.warn("Ошибка активации аудио:", error);
            state.audioInitialized = true;
            resolve(true);
        }
    });
}

// Функция для принудительной активации
function ensureAudio() {
    if (!state.userInteracted) {
        state.userInteracted = true;
        console.log("Первое взаимодействие пользователя");
        
        initAudio();
        activateAudioSystem();
    }
}

// ОПТИМИЗАЦИЯ: Предзагрузка critical изображений
function preloadCriticalImages() {
    const criticalImages = [
        'skins/1.png', 'heads/1.png', 'bodies/1.png', 'accessories/1.png'
    ];
    
    criticalImages.forEach(src => {
        const img = new Image();
        img.src = src;
    });
}

// Функция для создания рандомного порядка элементов
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

// Получение элемента по индексу в рандомном порядке
function getRandomOrderItem(type, index) {
    const realIndex = state.order[type][index % state.order[type].length];
    return state.loaded[type][realIndex];
}

// Загрузка всех изображений частей персонажа
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
                img.onerror = () => { r(); };
            }));
            
            state.loaded[type].push({ id: i, img: img });
        }
        
        await Promise.all(loadPromises);
    }
}

// Отрисовка персонажа в указанном контейнере
function render(container, data) {
    const fragment = document.createDocumentFragment();
    state.parts.forEach(p => {
        if (data[p]) {
            const div = document.createElement('div');
            div.className = 'character-layer';
            div.style.backgroundImage = `url('${data[p].img.src}')`;
            fragment.appendChild(div);
        }
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
}

// Запуск анимации в режиме ожидания
function startIdle() {
    state.gamePhase = 'idle';
    state.startBtnLock = false;
    state.resetBtnLock = false;
    createRandomOrder();
    
    let instructionText;
    if (state.lastResult === null) {
        instructionText = "Начнём?";
    } else if (state.lastResult === 'win') {
        instructionText = "Сложность повысилась!";
    } else if (state.lastResult === 'almost') {
        instructionText = "Сейчас получится!";
    } else {
        instructionText = "Начнём сначала?";
    }
    
    elements.instruction.textContent = instructionText;
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
            } while (next.id === state.idleCharacter[p].id);
            
            state.idleCharacter[p] = next;
            render(elements.characterDisplay, state.idleCharacter);
        }
        
        if (state.gamePhase === 'idle') {
            requestAnimationFrame(animateIdle);
        }
    };
    
    if (state.idleInterval) {
        cancelAnimationFrame(state.idleInterval);
    }
    
    state.idleInterval = requestAnimationFrame(animateIdle);
}

// Остановка анимации в режиме ожидания
function stopIdle() { 
    if (state.idleInterval) {
        cancelAnimationFrame(state.idleInterval);
        state.idleInterval = null;
    }
}

// Анимация скрытия кнопки
function hideButtonWithAnimation(button) {
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

// Функция для анимации смены цифр таймера
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

// Начало игры
function startGame() {
    if (state.startBtnLock) return;
    
    state.startBtnLock = true;
    elements.startBtn.disabled = true;
    elements.startBtn.style.pointerEvents = 'none';
    elements.startBtn.style.opacity = '0.7';
    
    state.isBusy = true;
    state.gamePhase = 'creating';
    
    // Проигрываем звук начала игры
    playSound('start');
    
    stopIdle();
    
    elements.instruction.classList.remove('show');
    setTimeout(() => {
        elements.instruction.textContent = "Создаём персонажа...";
        elements.instruction.classList.add('show');
    }, 400);
    
    hideButtonWithAnimation(elements.startBtn);
    
    let duration = 0;
    if (state.fastCycle) {
        cancelAnimationFrame(state.fastCycle);
        state.fastCycle = null;
    }
    
    let lastTime = 0;
    let lastSoundTime = 0;
    const soundInterval = 100;
    
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
            
            if (timestamp - lastSoundTime >= soundInterval) {
                playSound('change');
                lastSoundTime = timestamp;
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

// Функция для определения времени на запоминание в зависимости от серии
function getMemorizeTime() {
    if (state.streak >= 50) return 1;
    else if (state.streak >= 30) return 2;
    else if (state.streak >= 15) return 3;
    else if (state.streak >= 5) return 4;
    else return 5;
}

// Фиксация целевого персонажа и начало фазы запоминания
function finalizeTarget() {
    state.gamePhase = 'memorizing';
    
    state.parts.forEach(p => {
        const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
        state.target[p] = getRandomOrderItem(p, randomIndex);
    });
    
    playSound('result');
    
    render(elements.characterDisplay, state.target);
    
    setTimeout(() => {
        elements.instruction.classList.remove('show');
        setTimeout(() => {
            elements.instruction.textContent = "Запомни персонажа";
            elements.instruction.classList.add('show');
            
            let timeLeft = getMemorizeTime();
            elements.timer.textContent = timeLeft;
            elements.timer.classList.add('show');
            state.isTimerActive = true;
            
            setTimeout(() => {
                animateTimerChange(timeLeft);
            }, 100);
            
            const t = setInterval(() => {
                timeLeft--;
                elements.timer.textContent = timeLeft;
                animateTimerChange(timeLeft);
                
                if (timeLeft <= 0) {
                    clearInterval(t);
                    state.isTimerActive = false;
                    setTimeout(() => {
                        elements.timer.classList.remove('show');
                        startSelecting();
                    }, 300);
                }
            }, 1000);
        }, 400);
    }, 500);
}

// Начало фазы выбора игрока
function startSelecting() {
    state.gamePhase = 'selecting';
    state.currentPart = 0;
    state.selection = {};
    state.canSelect = true;
    state.isBusy = false;
    state.isFirstChangeInCycle = true;

    elements.instruction.classList.remove('show');
    
    setTimeout(() => {
        elements.selectBtn.classList.remove('hidden');
        elements.selectBtn.classList.add('show');
        nextCycle();
    }, 400);
}

// Цикл выбора текущей части персонажа
function nextCycle() {
    if (state.currentPart >= state.parts.length) { finish(); return; }
    
    const type = state.parts[state.currentPart];
    
    if (state.currentPart > 0) {
        state.selection[type] = getRandomOrderItem(type, 0);
    }
    
    elements.instruction.classList.remove('show');
    setTimeout(() => {
        elements.instruction.textContent = `Выбери ${getLabel(type)}`;
        elements.instruction.classList.add('show');
    }, 200);
    
    let baseSpeed = 1200 - (state.currentPart * 200);
    let finalSpeed = state.streak > 0 ? baseSpeed * Math.pow(0.95, state.streak) : baseSpeed;
    finalSpeed = Math.max(finalSpeed, 200);
    
    let idx = 0;
    
    if (state.interval) {
        clearInterval(state.interval);
        state.interval = null;
    }
    
    const cycle = () => {
        idx = (idx + 1) % state.partCounts[type];
        state.selection[type] = getRandomOrderItem(type, idx);
        render(elements.characterDisplay, state.selection);
        
        if (state.currentPart === 0 || !state.isFirstChangeInCycle) {
            playSound('next');
        }
        state.isFirstChangeInCycle = false;
    };
    
    if (state.currentPart === 0) {
        idx = -1;
    }
    
    if (state.currentPart > 0) {
        playQuietNextSound();
        state.isFirstChangeInCycle = false;
    } else {
        state.isFirstChangeInCycle = true;
    }
    
    cycle();
    
    state.interval = setInterval(cycle, finalSpeed);
}

// Получение читаемого названия части персонажа
function getLabel(t) { 
    return {
        skin:'цвет кожи', 
        head:'голову', 
        body:'тело', 
        accessory:'аксессуар'
    }[t]; 
}

// Обработка выбора игрока
function select() {
    if (!state.canSelect || state.gamePhase !== 'selecting') {
        return false;
    }
    
    playSound('choose');
    
    state.canSelect = false;
    
    if (state.interval) {
        clearInterval(state.interval);
        state.interval = null;
    }
    
    state.currentPart++;
    
    if (state.currentPart >= state.parts.length) {
        hideButtonWithAnimation(elements.selectBtn);
        setTimeout(() => {
            state.canSelect = true;
            finish();
        }, 200);
    } else {
        setTimeout(() => { 
            state.canSelect = true;
            nextCycle(); 
        }, 150);
    }
    
    return true;
}

// Завершение игры и отображение результатов
function finish() {
    state.gamePhase = 'finished';
    state.isBusy = true;
    elements.instruction.classList.remove('show');
    
    if (state.interval) {
        clearInterval(state.interval);
        state.interval = null;
    }
    
    elements.gameArea.classList.add('hidden');
    
    setTimeout(() => {
        let m = 0;
        state.parts.forEach(p => { 
            if(state.selection[p].id === state.target[p].id) m++; 
        });
        const p = Math.round((m/4)*100);
        
        if (p === 100) {
            state.streak++; 
            state.lastResult = 'win';
        } else if (p < 75) {
            state.streak = 0; 
            state.lastResult = 'lose';
        } else {
            state.lastResult = 'almost';
        }
        
        if (state.streak > state.maxStreak) {
            state.maxStreak = state.streak;
        }
        
        elements.resultPercent.textContent = p + '%';
        elements.resultText.textContent = p === 100 ? "Идеально! 🎉" : (p >= 75 ? "Почти! 🤏🏻" : "Попробуй еще раз...");
        render(elements.resultTarget, state.target);
        render(elements.resultPlayer, state.selection);
        updateStats();
        elements.resultScreen.classList.add('show');
        state.startBtnLock = false;
        state.resetBtnLock = false;
        state.isBusy = false;
        
        if (p === 100) {
            playSound('victory');
        } else if (p >= 75) {
            playSound('vic');
        } else {
            playSound('loss');
        }
        
        if (tg && tg.sendData) {
            const gameData = {
                round: state.round,
                streak: state.streak,
                maxStreak: state.maxStreak,
                lastResult: p
            };
            tg.sendData(JSON.stringify(gameData));
        }
    }, 400);
}

// Сброс игры для нового раунда
function reset() {
    if (state.resetBtnLock || state.isBusy) return;
    
    playSound('repeat');
    
    state.resetBtnLock = true;
    elements.resultAgainBtn.disabled = true;
    elements.resultAgainBtn.style.pointerEvents = 'none';
    elements.resultAgainBtn.style.cursor = 'not-allowed';
    elements.resultAgainBtn.style.opacity = '0.7';
    
    state.round++;
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
        elements.startBtn.style.cursor = 'pointer';
        
        elements.resultAgainBtn.disabled = false;
        elements.resultAgainBtn.style.pointerEvents = 'auto';
        elements.resultAgainBtn.style.cursor = 'pointer';
        elements.resultAgainBtn.style.opacity = '1';
        
        elements.selectBtn.classList.remove('show');
        elements.selectBtn.classList.add('hidden');
        elements.selectBtn.style.opacity = '';
        elements.selectBtn.style.transform = '';
        
        elements.gameArea.classList.remove('hidden');
        updateStats();
        
        setTimeout(() => {
            startIdle();
        }, 100);
    }, 400);
}

// Обновление статистики на экране
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

// УПРОЩЕННАЯ обработка нажатия пробела
window.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        
        // Логируем событие
        console.log('Space pressed, gamePhase:', state.gamePhase, 'startBtnLock:', state.startBtnLock);
        
        if (state.isTimerActive || state.isBusy || state.gamePhase === 'memorizing' || state.gamePhase === 'creating') {
            console.log('Blocked: timer active or busy');
            return;
        }
        
        // Активируем аудио
        ensureAudio();
        
        // Проверяем состояние и запускаем соответствующее действие
        if (state.gamePhase === 'idle' && !state.startBtnLock) {
            console.log('Starting game from idle');
            startGame();
        } else if (state.gamePhase === 'selecting' && state.canSelect) {
            console.log('Selecting in game');
            select();
        } else if (state.gamePhase === 'finished' && !state.resetBtnLock) {
            console.log('Resetting game');
            reset();
        } else {
            console.log('No action for current state');
        }
    }
});

// ОПТИМИЗАЦИЯ: Делегирование событий для мобильных
document.addEventListener('touchstart', function(e) {
    if (e.target.tagName === 'BUTTON') {
        e.target.style.transform = 'scale(0.97)';
        ensureAudio();
    }
}, { passive: true });

document.addEventListener('touchend', function(e) {
    if (e.target.tagName === 'BUTTON') {
        e.target.style.transform = '';
    }
}, { passive: true });

// Назначение обработчиков событий для кнопок
elements.startBtn.onclick = function() {
    console.log('Start button clicked');
    if (state.startBtnLock) return;
    
    ensureAudio();
    startGame();
};

elements.selectBtn.onclick = function() {
    console.log('Select button clicked');
    select();
};

elements.resultAgainBtn.onclick = function() {
    console.log('Again button clicked');
    ensureAudio();
    reset();
};

// Предотвращение зума на двойной тап
document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - (window.lastTouchEnd || 0) < 300) {
        e.preventDefault();
    }
    window.lastTouchEnd = now;
}, { passive: false });

// Запрет выделения текста
document.addEventListener('selectstart', function(e) {
    e.preventDefault();
    return false;
});

// Запрет контекстного меню
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
});

// Инициализация игры при загрузке страницы
window.onload = async () => {
    console.log('Game loading...');
    
    try {
        await loadImages();
        
        // Telegram инициализация
        if (tg) {
            tg.ready();
            tg.expand();
        }
        
        // Инициализируем аудио сразу, но не активируем
        initAudio();
        
        startIdle();
        
        // ОПТИМИЗАЦИЯ: Предотвращение зума на iOS
        document.addEventListener('gesturestart', function(e) {
            e.preventDefault();
        });
        
        // Добавляем глобальный обработчик для активации аудио
        const activateAudio = () => {
            if (!state.userInteracted) {
                state.userInteracted = true;
                console.log('User interaction detected, activating audio');
                activateAudioSystem();
            }
        };
        
        // Множественные события для активации
        document.addEventListener('click', activateAudio, { once: true });
        document.addEventListener('touchstart', activateAudio, { once: true });
        document.addEventListener('keydown', activateAudio, { once: true });
        
        // Также активируем по любому клику на странице
        document.addEventListener('click', ensureAudio, { once: true });
        
        console.log('Game loaded successfully');
        
    } catch (error) {
        console.error("Ошибка инициализации игры:", error);
        // Все равно запускаем игру даже если есть ошибки
        startIdle();
    }
};

// Добавляем кнопку для тестирования звуков (для разработки)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Development mode: adding test button');
    
    document.addEventListener('DOMContentLoaded', function() {
        const testBtn = document.createElement('button');
        testBtn.textContent = 'Test Audio';
        testBtn.style.position = 'fixed';
        testBtn.style.bottom = '10px';
        testBtn.style.right = '10px';
        testBtn.style.zIndex = '10000';
        testBtn.style.padding = '5px 10px';
        testBtn.style.background = '#ff4444';
        testBtn.style.color = 'white';
        testBtn.style.border = 'none';
        testBtn.style.borderRadius = '5px';
        
        testBtn.onclick = function() {
            console.log('Testing all sounds');
            ensureAudio();
            activateAudioSystem().then(() => {
                playSound('start');
                setTimeout(() => playSound('choose'), 300);
                setTimeout(() => playSound('timer'), 600);
                setTimeout(() => playSound('victory'), 900);
            });
        };
        
        document.body.appendChild(testBtn);
    });
}