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
    audioEnabled: true,
    soundsLoaded: false,
    audioInitialized: false,
    userInteracted: false,
    debugMode: false,
    timerSounds: [],
    canPressSpace: true,
    resultScreenVisible: false,
    chooseSoundInstances: [],
    changeSoundPlayed: false,
    startSoundPlayed: false,
    // Новые флаги для мобильной оптимизации
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    audioContext: null,
    audioBuffers: {},
    useWebAudio: false, // Флаг для использования Web Audio API
    lastPlayTime: {} // Время последнего воспроизведения каждого звука
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
    timerEnd: null,
    change: null,
    victory: null,
    vic: null,
    loss: null
};

// Инициализация Web Audio API для мобильных устройств
function initWebAudio() {
    if (!state.isMobile) return false;
    
    try {
        // Создаем AudioContext
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return false;
        
        state.audioContext = new AudioContext();
        
        // Восстанавливаем контекст если он приостановлен
        if (state.audioContext.state === 'suspended') {
            state.audioContext.resume().then(() => {
                console.log('AudioContext восстановлен');
            });
        }
        
        state.useWebAudio = true;
        console.log('Web Audio API инициализирован для мобильного устройства');
        return true;
    } catch (error) {
        console.warn('Web Audio API не доступен:', error);
        return false;
    }
}

// Загрузка звука в буфер для Web Audio API
async function loadAudioBuffer(url) {
    if (!state.audioContext || !state.useWebAudio) return null;
    
    try {
        // Проверяем, не загружен ли уже этот звук
        if (state.audioBuffers[url]) {
            return state.audioBuffers[url];
        }
        
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
        
        state.audioBuffers[url] = audioBuffer;
        return audioBuffer;
    } catch (error) {
        console.warn('Ошибка загрузки звука в буфер:', url, error);
        return null;
    }
}

// Воспроизведение звука через Web Audio API (лучше для мобильных)
function playWebAudio(url, volume = 1.0) {
    if (!state.audioContext || !state.useWebAudio) return false;
    
    try {
        const audioBuffer = state.audioBuffers[url];
        if (!audioBuffer) return false;
        
        // Создаем источник звука
        const source = state.audioContext.createBufferSource();
        const gainNode = state.audioContext.createGain();
        
        source.buffer = audioBuffer;
        gainNode.gain.value = Math.max(0, Math.min(1, volume));
        
        source.connect(gainNode);
        gainNode.connect(state.audioContext.destination);
        
        // Воспроизводим
        source.start(0);
        
        // Очистка после воспроизведения
        source.onended = () => {
            source.disconnect();
            gainNode.disconnect();
        };
        
        return true;
    } catch (error) {
        console.warn('Ошибка воспроизведения Web Audio:', error);
        return false;
    }
}

// Создаем несколько экземпляров для звука choose
function createChooseSoundInstances() {
    state.chooseSoundInstances = [];
    
    // Создаем 5 экземпляров для звука choose (больше для мобильных)
    for (let i = 0; i < 5; i++) {
        const chooseSound = new Audio('sounds/choose.mp3');
        chooseSound.preload = 'auto';
        chooseSound.load(); // Принудительная загрузка
        
        state.chooseSoundInstances.push({
            sound: chooseSound,
            isPlaying: false,
            lastPlayTime: 0
        });
    }
}

// Создаем звуки таймера
function createTimerSounds() {
    state.timerSounds = [];
    
    for (let i = 0; i < 6; i++) {
        const timerSound = new Audio('sounds/timer.mp3');
        timerSound.preload = 'auto';
        timerSound.load();
        
        state.timerSounds.push({
            sound: timerSound,
            isPlaying: false,
            lastPlayTime: 0
        });
    }
}

// Улучшенная функция создания аудио элемента для мобильных
function createAudioElement(src, volume = 1.0) {
    const audioElement = new Audio();
    
    // Настройки для мобильных устройств
    audioElement.preload = 'auto';
    audioElement.src = src;
    audioElement.volume = Math.max(0, Math.min(1, volume));
    
    // Важно: отключаем управление для мобильных
    audioElement.controls = false;
    
    // События для отслеживания состояния
    audioElement.addEventListener('error', () => {
        console.warn(`Ошибка загрузки звука: ${src}`);
    });
    
    // Принудительная загрузка
    try {
        audioElement.load();
    } catch (e) {
        // Игнорируем ошибки загрузки
    }
    
    return audioElement;
}

// Универсальная функция воспроизведения звука (работает и на мобильных)
function playSound(soundName, useWebAudioFirst = true) {
    if (!state.audioEnabled || !state.audioInitialized) return false;
    
    // Проверка на частоту воспроизведения (предотвращение спама)
    const now = Date.now();
    if (state.lastPlayTime[soundName] && (now - state.lastPlayTime[soundName] < 50)) {
        return false; // Слишком часто
    }
    state.lastPlayTime[soundName] = now;
    
    const sound = audio[soundName];
    if (!sound) return false;
    
    // Пробуем Web Audio API для мобильных
    if (state.isMobile && useWebAudioFirst && state.useWebAudio) {
        let url;
        switch(soundName) {
            case 'start': url = 'sounds/start.mp3'; break;
            case 'choose': url = 'sounds/choose.mp3'; break;
            case 'repeat': url = 'sounds/repeat.mp3'; break;
            case 'timer': url = 'sounds/timer.mp3'; break;
            case 'change': url = 'sounds/result.mp3'; break;
            case 'victory': url = 'sounds/victory.mp3'; break;
            case 'vic': url = 'sounds/vic.mp3'; break;
            case 'loss': url = 'sounds/loss.mp3'; break;
        }
        
        if (url && playWebAudio(url, sound.volume)) {
            return true;
        }
    }
    
    // Fallback к стандартному Audio
    try {
        // Сбрасываем время и ставим максимальную громкость
        sound.currentTime = 0;
        sound.volume = Math.max(0.1, Math.min(1, sound.volume || 1));
        
        // Воспроизводим
        const playPromise = sound.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                // На мобильных часто возникает ошибка из-за политики автовоспроизведения
                if (state.isMobile) {
                    // Пробуем воспроизвести через 100мс с пользовательским взаимодействием
                    setTimeout(() => {
                        try {
                            sound.currentTime = 0;
                            sound.play().catch(() => {});
                        } catch (e) {
                            // Игнорируем
                        }
                    }, 100);
                }
            });
        }
        
        return true;
    } catch (error) {
        return false;
    }
}

// Оптимизированная функция для звука choose (особенно для мобильных)
function playChooseSound() {
    if (!state.audioEnabled) return false;
    
    // Пробуем Web Audio API
    if (state.isMobile && state.useWebAudio) {
        if (playWebAudio('sounds/choose.mp3', 1.0)) {
            return true;
        }
    }
    
    // Fallback к многоканальной системе
    if (state.chooseSoundInstances.length === 0) {
        return playSound('choose', false);
    }
    
    const now = Date.now();
    let availableInstance = null;
    
    // Ищем доступный экземпляр
    for (const instance of state.chooseSoundInstances) {
        if (!instance.isPlaying && (now - instance.lastPlayTime > 100)) {
            availableInstance = instance;
            break;
        }
    }
    
    // Если все заняты, берем тот, который дольше всего не играл
    if (!availableInstance) {
        availableInstance = state.chooseSoundInstances.reduce((oldest, current) => {
            return current.lastPlayTime < oldest.lastPlayTime ? current : oldest;
        });
    }
    
    // Воспроизводим
    try {
        availableInstance.sound.currentTime = 0;
        availableInstance.sound.volume = 1.0;
        availableInstance.isPlaying = true;
        availableInstance.lastPlayTime = now;
        
        availableInstance.sound.play().catch(() => {
            availableInstance.isPlaying = false;
        });
        
        // Автоматический сброс флага
        setTimeout(() => {
            availableInstance.isPlaying = false;
        }, 500);
        
        return true;
    } catch (error) {
        availableInstance.isPlaying = false;
        return playSound('choose', false);
    }
}

// Оптимизированная функция для звука таймера
function playTimerSound(number) {
    if (!state.audioEnabled || number < 0) return;
    
    // Пробуем Web Audio API
    if (state.isMobile && state.useWebAudio) {
        if (playWebAudio('sounds/timer.mp3', 1.0)) {
            return;
        }
    }
    
    try {
        // Используем предзагруженные звуки если они есть
        if (state.timerSounds.length > 0 && number >= 0 && number <= 5) {
            const index = 5 - number;
            const timerInstance = state.timerSounds[index];
            
            if (timerInstance && !timerInstance.isPlaying) {
                const now = Date.now();
                
                if (now - timerInstance.lastPlayTime < 100) return;
                
                timerInstance.sound.currentTime = 0;
                timerInstance.sound.volume = 1.0;
                timerInstance.isPlaying = true;
                timerInstance.lastPlayTime = now;
                
                timerInstance.sound.play().catch(() => {
                    timerInstance.isPlaying = false;
                });
                
                setTimeout(() => {
                    timerInstance.isPlaying = false;
                }, 500);
                
                return;
            }
        }
        
        // Фолбэк
        playSound('timer', false);
        
    } catch (error) {
        playSound('timer', false);
    }
}

// Инициализация звуков с оптимизацией для мобильных
function initAudio() {
    if (state.soundsLoaded) return true;
    
    try {
        // Инициализируем Web Audio API для мобильных
        if (state.isMobile) {
            initWebAudio();
        }
        
        // Создаем аудио элементы
        audio.start = createAudioElement('sounds/start.mp3', 1.0);
        audio.choose = createAudioElement('sounds/choose.mp3', 1.0);
        audio.repeat = createAudioElement('sounds/repeat.mp3', 1.0);
        audio.timer = createAudioElement('sounds/timer.mp3', 1.0);
        audio.timerEnd = createAudioElement('sounds/timer.mp3', 1.0);
        audio.change = createAudioElement('sounds/result.mp3', 1.0);
        audio.victory = createAudioElement('sounds/victory.mp3', 1.0);
        audio.vic = createAudioElement('sounds/vic.mp3', 1.0);
        audio.loss = createAudioElement('sounds/loss.mp3', 1.0);
        
        // Настраиваем звуки таймера
        audio.timer.playbackRate = 1.0;
        audio.timerEnd.playbackRate = 1.0;
        
        // Создаем звуки таймера
        createTimerSounds();
        
        // Создаем экземпляры для choose
        createChooseSoundInstances();
        
        state.soundsLoaded = true;
        state.audioInitialized = true;
        
        // Предзагрузка в Web Audio API для мобильных
        if (state.isMobile && state.useWebAudio) {
            setTimeout(() => {
                ['sounds/start.mp3', 'sounds/choose.mp3', 'sounds/timer.mp3', 'sounds/result.mp3'].forEach(url => {
                    loadAudioBuffer(url);
                });
            }, 500);
        }
        
        return true;
    } catch (error) {
        console.error('Ошибка инициализации звуков:', error);
        return false;
    }
}

// Принудительная активация аудио (особенно важно для мобильных)
function ensureAudio() {
    if (!state.userInteracted) {
        state.userInteracted = true;
        
        // Для мобильных: возобновляем AudioContext если он приостановлен
        if (state.isMobile && state.audioContext && state.audioContext.state === 'suspended') {
            state.audioContext.resume().then(() => {
                console.log('AudioContext активирован после взаимодействия');
            });
        }
        
        // Инициализируем звуки
        initAudio();
    }
}

// Предзагрузка critical изображений
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
    state.canPressSpace = true;
    state.resultScreenVisible = false;
    state.changeSoundPlayed = false;
    state.startSoundPlayed = false;
    
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
        
        // Проигрываем звук таймера
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
    state.changeSoundPlayed = false;
    
    // Воспроизводим звук начала игры
    if (!state.startSoundPlayed) {
        state.startSoundPlayed = true;
        playSound('start');
    }
    
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
                playSound('change');
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

// Функция для определения времени на запоминание
function getMemorizeTime() {
    if (state.streak >= 50) return 1;
    else if (state.streak >= 30) return 2;
    else if (state.streak >= 15) return 3;
    else if (state.streak >= 5) return 4;
    else return 5;
}

// Фиксация целевого персонажа
function finalizeTarget() {
    state.gamePhase = 'memorizing';
    
    state.parts.forEach(p => {
        const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
        state.target[p] = getRandomOrderItem(p, randomIndex);
    });
    
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
                
                if (timeLeft < 0) {
                    clearInterval(t);
                    elements.timer.classList.remove('show');
                    state.isTimerActive = false;
                    setTimeout(() => {
                        startSelecting();
                    }, 300);
                    return;
                }
                
                elements.timer.textContent = timeLeft;
                animateTimerChange(timeLeft);
            }, 1000);
        }, 400);
    }, 500);
}

// Начало фазы выбора
function startSelecting() {
    state.gamePhase = 'selecting';
    state.currentPart = 0;
    state.selection = {};
    state.canSelect = true;
    state.isBusy = false;
    state.isFirstChangeInCycle = true;
    state.canPressSpace = false;

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
        
        setTimeout(() => {
            state.canPressSpace = true;
        }, 200);
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
        
        state.isFirstChangeInCycle = false;
    };
    
    if (state.currentPart === 0) {
        idx = -1;
    }
    
    if (state.currentPart > 0) {
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
    
    // Используем оптимизированную функцию для choose
    playChooseSound();
    
    state.canSelect = false;
    state.canPressSpace = false;
    
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

// Завершение игры
function finish() {
    state.gamePhase = 'finished';
    state.isBusy = true;
    state.canPressSpace = false;
    state.resultScreenVisible = false;
    
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

// Сброс игры
function reset() {
    if (state.resetBtnLock || state.isBusy) return;
    
    playSound('repeat');
    
    state.resetBtnLock = true;
    state.canPressSpace = false;
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

// Обновление статистики
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

// Обработка нажатия пробела
window.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        
        if (state.isTimerActive || state.isBusy || state.gamePhase === 'memorizing' || state.gamePhase === 'creating') {
            return;
        }
        
        if (!state.canPressSpace) {
            return;
        }
        
        if (state.gamePhase === 'finished' && !state.resultScreenVisible) {
            return;
        }
        
        if (state.gamePhase === 'selecting' && !state.canSelect) {
            return;
        }
        
        ensureAudio();
        
        if (state.gamePhase === 'idle' && !state.startBtnLock) {
            startGame();
        } else if (state.gamePhase === 'selecting' && state.canSelect) {
            select();
        } else if (state.gamePhase === 'finished' && !state.resetBtnLock && state.resultScreenVisible) {
            reset();
        }
    }
});

// Обработчики для мобильных
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
    if (state.startBtnLock) return;
    
    ensureAudio();
    startGame();
};

elements.selectBtn.onclick = function() {
    select();
};

elements.resultAgainBtn.onclick = function() {
    ensureAudio();
    reset();
};

// Предотвращение зума
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

// Инициализация игры
window.onload = async () => {
    console.log('=== ИГРА ЗАГРУЖАЕТСЯ ===');
    
    try {
        // Определяем мобильное устройство
        state.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Инициализируем Web Audio API заранее для мобильных
        if (state.isMobile) {
            initWebAudio();
        }
        
        // Загружаем изображения
        await loadImages();
        console.log('Изображения загружены');
        
        // Telegram инициализация
        if (tg) {
            tg.ready();
            tg.expand();
            console.log('Telegram WebApp инициализирован');
        }
        
        // Предварительная инициализация звуков
        console.log('Предварительная инициализация звуков...');
        
        // Создаем основные звуки
        audio.start = new Audio('sounds/start.mp3');
        audio.choose = new Audio('sounds/choose.mp3');
        audio.repeat = new Audio('sounds/repeat.mp3');
        audio.timer = new Audio('sounds/timer.mp3');
        audio.timerEnd = new Audio('sounds/timer.mp3');
        audio.change = new Audio('sounds/result.mp3');
        audio.victory = new Audio('sounds/victory.mp3');
        audio.vic = new Audio('sounds/vic.mp3');
        audio.loss = new Audio('sounds/loss.mp3');
        
        // Устанавливаем громкость
        audio.timer.volume = 1.0;
        audio.timerEnd.volume = 1.0;
        audio.timerEnd.playbackRate = 1.0;
        
        // Создаем звуки таймера
        createTimerSounds();
        
        // Создаем экземпляры для choose
        createChooseSoundInstances();
        
        state.soundsLoaded = true;
        console.log('Аудио элементы предварительно созданы');
        
        // Запускаем игру
        startIdle();
        console.log('Игра запущена в режиме ожидания');
        
        // Обработчики для активации аудио
        const activateOnInteraction = () => {
            if (!state.userInteracted) {
                console.log('Первое взаимодействие обнаружено');
                ensureAudio();
            }
        };
        
        document.addEventListener('click', activateOnInteraction);
        document.addEventListener('touchstart', activateOnInteraction);
        document.addEventListener('keydown', activateOnInteraction);
        
        // Обработчики для паузы звуков
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                // На мобильных: приостанавливаем AudioContext
                if (state.isMobile && state.audioContext && state.audioContext.state === 'running') {
                    state.audioContext.suspend().catch(() => {});
                }
            } else {
                // Возобновляем при возвращении
                if (state.isMobile && state.audioContext && state.audioContext.state === 'suspended') {
                    state.audioContext.resume().catch(() => {});
                }
            }
        });
        
        window.addEventListener('blur', function() {
            if (state.isMobile && state.audioContext && state.audioContext.state === 'running') {
                state.audioContext.suspend().catch(() => {});
            }
        });
        
        window.addEventListener('focus', function() {
            if (state.isMobile && state.audioContext && state.audioContext.state === 'suspended') {
                state.audioContext.resume().catch(() => {});
            }
        });
        
        console.log('=== ИГРА УСПЕШНО ЗАГРУЖЕНА ===');
        
    } catch (error) {
        console.error('Ошибка загрузки игры:', error);
        startIdle();
    }
};