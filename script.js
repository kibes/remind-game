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
    audioContext: null,
    isFirstChangeInCycle: true,
    isTimerPlaying: false,
    audioUnlocked: false,
    userInteracted: false,
    soundQueue: [],
    isPlayingQueue: false,
    soundsLoaded: false,
    loadingSounds: false,
    isTelegram: !!window.Telegram?.WebApp,
    lastSoundTime: 0,
    soundCooldown: 0,
    nextSoundCooldown: 0,
    lastTimerSound: 0,
    timerPlaybackRate: 1.0,
    activeTimerSounds: new Set(),
    // Новые поля для оптимизации мобильных
    soundInstanceCounter: {},
    maxSoundInstances: {
        start: 2,
        choose: 2,
        repeat: 2,
        timer: 3,
        change: 4,
        next: 8,
        result: 2,
        victory: 2,
        vic: 2,
        loss: 2
    },
    soundThrottle: new Map(),
    audioInitialized: false,
    creationStartTime: 0,
    creationDuration: 0,
    creationFrameCount: 0,
    lastFrameTime: 0,
    lastSpacePress: 0
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
const audio = {};

// Пути к звуковым файлам
const soundFiles = {
    start: 'sounds/start.mp3',
    choose: 'sounds/choose.mp3',
    repeat: 'sounds/repeat.mp3',
    timer: 'sounds/timer.mp3',
    change: 'sounds/change.mp3',
    next: 'sounds/next.mp3',
    result: 'sounds/result.mp3',
    victory: 'sounds/victory.mp3',
    vic: 'sounds/vic.mp3',
    loss: 'sounds/loss.mp3'
};

// Важные звуки (должны работать всегда)
const importantSounds = ['start', 'choose', 'repeat', 'timer', 'result', 'victory', 'vic', 'loss'];

// Частые звуки (могут быть ограничены)
const frequentSounds = ['change', 'next'];

// Функция для создания аудио элемента с оптимизацией для мобильных
function createAudioElement(src) {
    const audioElement = new Audio();
    
    audioElement.preload = 'auto';
    audioElement.src = src;
    
    // Загружаем сразу
    audioElement.load();
    
    return audioElement;
}

// Оптимизированная предзагрузка звуков
async function preloadAllSounds() {
    if (state.loadingSounds || state.soundsLoaded) return;
    
    state.loadingSounds = true;
    console.log("Начинаем предзагрузку звуков...");
    
    // Создаем экземпляры звуков
    for (const soundName in soundFiles) {
        audio[soundName] = [];
        
        // Разное количество экземпляров для разных типов звуков
        let instances = 1;
        if (importantSounds.includes(soundName)) {
            instances = 4; // Важные звуки - 4 экземпляра
        } else if (soundName === 'next') {
            instances = 10; // Next звук - много экземпляров для быстрой прокрутки
        } else if (soundName === 'change') {
            instances = 6; // Change звук - несколько экземпляров
        }
        
        for (let i = 0; i < instances; i++) {
            const audioEl = createAudioElement(soundFiles[soundName]);
            
            // Специальная настройка для next
            if (soundName === 'next') {
                audioEl.volume = 0.6;
            }
            
            audio[soundName].push(audioEl);
        }
    }
    
    // Ждем загрузки важных звуков
    await Promise.all(
        importantSounds.map(soundName => 
            Promise.all(audio[soundName].map(el => 
                new Promise(resolve => {
                    if (el.readyState >= 3) { // HAVE_FUTURE_DATA или больше
                        resolve();
                    } else {
                        el.addEventListener('canplaythrough', resolve, { once: true });
                        el.addEventListener('error', resolve, { once: true });
                    }
                })
            ))
        )
    );
    
    state.soundsLoaded = true;
    state.loadingSounds = false;
    console.log("Все звуки предзагружены");
    
    // Пробуем разблокировать аудио
    if (!state.audioUnlocked) {
        unlockAudio();
    }
}

// Функция для получения доступного экземпляра звука
function getAvailableAudioInstance(soundName) {
    if (!audio[soundName] || audio[soundName].length === 0) {
        // Создаем на лету если нет экземпляров
        const newInstance = createAudioElement(soundFiles[soundName]);
        audio[soundName] = [newInstance];
        
        if (soundName === 'next') {
            newInstance.volume = 0.6;
        }
        
        return newInstance;
    }
    
    // Ищем готовый экземпляр
    for (let i = 0; i < audio[soundName].length; i++) {
        const instance = audio[soundName][i];
        if ((instance.paused || instance.ended || instance.readyState === 0) && instance.readyState >= 2) {
            return instance;
        }
    }
    
    // Если все заняты, создаем новый экземпляр
    const newInstance = createAudioElement(soundFiles[soundName]);
    audio[soundName].push(newInstance);
    
    if (soundName === 'next') {
        newInstance.volume = 0.6;
    }
    
    return newInstance;
}

// Улучшенная функция воспроизведения звука
function playSound(soundName) {
    // Проверяем cooldown для частых звуков
    const now = Date.now();
    
    // Для звука next особый cooldown
    if (soundName === 'next') {
        if (now - state.nextSoundCooldown < 80) { // 80ms между звуками next
            return;
        }
        state.nextSoundCooldown = now;
    }
    
    if (frequentSounds.includes(soundName) && soundName !== 'next') {
        if (now - state.lastSoundTime < state.soundCooldown) {
            return; // Пропускаем звук если cooldown
        }
    }
    
    state.lastSoundTime = now;
    
    // Для частых звуков увеличиваем cooldown на мобильных
    if (state.isMobile && frequentSounds.includes(soundName) && soundName !== 'next') {
        state.soundCooldown = 150;
    } else {
        state.soundCooldown = 0;
    }
    
    // Если аудио еще не разблокировано
    if (!state.audioUnlocked) {
        // Для важных звуков сразу пытаемся разблокировать
        if (importantSounds.includes(soundName)) {
            unlockAudio();
        }
        
        // Добавляем в очередь
        state.soundQueue.push(soundName);
        return;
    }
    
    try {
        const soundInstance = getAvailableAudioInstance(soundName);
        
        // Проверяем готовность звука
        if (soundInstance.readyState < 2) {
            // Звук не готов, пробуем через 30ms
            setTimeout(() => playSound(soundName), 30);
            return;
        }
        
        // Сбрасываем и воспроизводим
        soundInstance.currentTime = 0;
        
        const playPromise = soundInstance.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.log(`Звук ${soundName} не воспроизвелся:`, e.name);
                
                // Если ошибка разблокировки, пробуем снова
                if (e.name === 'NotAllowedError') {
                    console.log("Аудио заблокировано, пробуем разблокировать...");
                    state.audioUnlocked = false;
                    unlockAudio();
                    
                    // Добавляем звук обратно в очередь
                    setTimeout(() => {
                        state.soundQueue.push(soundName);
                        processSoundQueue();
                    }, 200);
                }
            });
        }
    } catch (e) {
        console.log(`Ошибка при воспроизведении ${soundName}:`, e);
    }
}

// Функция для воспроизведения тихого next.mp3
function playQuietNextSound() {
    const now = Date.now();
    if (now - state.nextSoundCooldown < 80) return;
    
    state.nextSoundCooldown = now;
    
    if (!state.audioUnlocked) {
        state.soundQueue.push('next-quiet');
        return;
    }
    
    try {
        const soundInstance = getAvailableAudioInstance('next');
        if (soundInstance.readyState < 2) return;
        
        const originalVolume = soundInstance.volume;
        soundInstance.volume = originalVolume * 0.3;
        soundInstance.currentTime = 0;
        
        const playPromise = soundInstance.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                setTimeout(() => {
                    soundInstance.volume = originalVolume;
                }, 100);
            }).catch(e => {
                soundInstance.volume = originalVolume;
            });
        }
    } catch (e) {
        console.log("Ошибка тихого next:", e);
    }
}

// Функция для звука таймера
function playTimerSound(number) {
    const now = Date.now();
    
    if (now - state.lastTimerSound < 500) {
        return;
    }
    
    state.lastTimerSound = now;
    
    if (!state.audioUnlocked) {
        state.soundQueue.push(`timer-${number}`);
        unlockAudio();
        return;
    }
    
    try {
        const soundInstance = getAvailableAudioInstance('timer');
        if (soundInstance.readyState < 2) {
            return;
        }
        
        // Настройка тональности через playbackRate
        let playbackRate = 1.0;
        switch(number) {
            case 5: playbackRate = 0.7; break;
            case 4: playbackRate = 0.85; break;
            case 3: playbackRate = 0.95; break;
            case 2: playbackRate = 1.15; break;
            case 1: playbackRate = 1.35; break;
        }
        
        state.timerPlaybackRate = playbackRate;
        
        // Сбрасываем состояние воспроизведения
        state.isTimerPlaying = false;
        
        // Даем небольшую паузу перед воспроизведением
        setTimeout(() => {
            soundInstance.playbackRate = playbackRate;
            soundInstance.currentTime = 0;
            soundInstance.volume = 1;
            
            state.isTimerPlaying = true;
            
            const playPromise = soundInstance.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    setTimeout(() => {
                        state.isTimerPlaying = false;
                        soundInstance.playbackRate = 1.0;
                    }, 1000);
                }).catch(e => {
                    console.log("Таймер аудио не воспроизвелся:", e);
                    state.isTimerPlaying = false;
                    soundInstance.playbackRate = 1.0;
                });
            }
        }, 50);
        
    } catch (e) {
        console.log("Ошибка воспроизведения таймера:", e);
        state.isTimerPlaying = false;
    }
}

// Функция для разблокировки аудио
function unlockAudio() {
    if (state.audioUnlocked) return;
    
    console.log("Разблокировка аудио...");
    
    // Для локальной разработки
    state.userInteracted = true;
    
    try {
        const testSound = new Audio();
        testSound.volume = 0.001;
        testSound.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ';
        
        testSound.play().then(() => {
            state.audioUnlocked = true;
            setTimeout(() => {
                testSound.pause();
                testSound.currentTime = 0;
            }, 10);
            processSoundQueue();
        }).catch(() => {
            state.audioUnlocked = true;
            processSoundQueue();
        });
    } catch (e) {
        state.audioUnlocked = true;
        processSoundQueue();
    }
}

// Функция для обработки очереди звуков
function processSoundQueue() {
    if (!state.audioUnlocked || state.isPlayingQueue) return;
    
    state.isPlayingQueue = true;
    
    const playNextFromQueue = () => {
        if (state.soundQueue.length === 0) {
            state.isPlayingQueue = false;
            return;
        }
        
        const soundName = state.soundQueue.shift();
        
        if (soundName.startsWith('timer-')) {
            const number = parseInt(soundName.split('-')[1]);
            playTimerSound(number);
        } else if (soundName === 'next-quiet') {
            playQuietNextSound();
        } else {
            playSound(soundName);
        }
        
        // Задержка между звуками в очереди
        setTimeout(playNextFromQueue, 40);
    };
    
    playNextFromQueue();
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
        
        // Добавляем небольшую задержку для стабильности
        setTimeout(() => {
            playTimerSound(timerNumber);
        }, 30);
        
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
    
    // Воспроизводим start звук
    playSound('start');
    
    stopIdle();
    
    elements.instruction.classList.remove('show');
    setTimeout(() => {
        elements.instruction.textContent = "Создаём персонажа...";
        elements.instruction.classList.add('show');
    }, 400);
    
    hideButtonWithAnimation(elements.startBtn);
    
    // Сбрасываем таймер создания
    state.creationStartTime = Date.now();
    state.creationDuration = 0;
    
    if (state.fastCycle) {
        cancelAnimationFrame(state.fastCycle);
        state.fastCycle = null;
    }
    
    let lastChangeTime = 0;
    let changeSoundCounter = 0;
    
    const animateCreation = (timestamp) => {
        if (!state.fastCycle) return;
        
        const currentTime = Date.now();
        const elapsedTime = currentTime - state.creationStartTime;
        
        // Меняем персонажа каждые 50ms (20 раз в секунду)
        if (currentTime - lastChangeTime > 50) {
            lastChangeTime = currentTime;
            
            const temp = {};
            state.parts.forEach(p => {
                const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
                temp[p] = getRandomOrderItem(p, randomIndex);
            });
            render(elements.characterDisplay, temp);
            
            // Воспроизводим звук change каждые 4 изменения (примерно 200ms)
            changeSoundCounter++;
            if (changeSoundCounter % 4 === 0) {
                playSound('change');
            }
            
            // Проверяем, прошло ли 2 секунды
            if (elapsedTime >= 2000) {
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
    
    // Форсируем воспроизведение result звука
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
            
            // Проигрываем первый звук таймера с задержкой
            setTimeout(() => {
                animateTimerChange(timeLeft);
            }, 200);
            
            const t = setInterval(() => {
                timeLeft--;
                elements.timer.textContent = timeLeft;
                
                // Добавляем задержку для стабильности звука
                setTimeout(() => {
                    animateTimerChange(timeLeft);
                }, 100);
                
                if (timeLeft <= 0) {
                    clearInterval(t);
                    state.isTimerActive = false;
                    setTimeout(() => {
                        elements.timer.classList.remove('show');
                        startSelecting();
                    }, 400);
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
    
    // Счетчик для управления звуками
    let soundCounter = 0;
    
    const cycle = () => {
        idx = (idx + 1) % state.partCounts[type];
        state.selection[type] = getRandomOrderItem(type, idx);
        render(elements.characterDisplay, state.selection);
        
        // Для звука next в такт смене персонажа
        if (state.currentPart === 0 || !state.isFirstChangeInCycle) {
            soundCounter++;
            
            // Особый режим для аксессуаров (последний элемент)
            if (type === 'accessory') {
                // Для аксессуаров всегда проигрываем звук
                playSound('next');
            } else {
                // Для остальных частей - адаптивная частота
                let playSoundChance = 1.0; // 100% по умолчанию
                
                if (finalSpeed < 350) { // Очень быстрая скорость
                    playSoundChance = 0.6; // 60% шанс
                } else if (finalSpeed < 600) { // Средняя скорость
                    playSoundChance = 0.8; // 80% шанс
                }
                
                // На мобильных реже для очень быстрой скорости
                if (state.isMobile && finalSpeed < 300) {
                    playSoundChance = 0.4; // 40% шанс
                }
                
                // Проигрываем звук с учетом вероятности
                if (Math.random() < playSoundChance) {
                    playSound('next');
                }
            }
        }
        state.isFirstChangeInCycle = false;
    };
    
    if (state.currentPart === 0) {
        idx = -1;
    }
    
    if (state.currentPart > 0) {
        // Для первого изменения после выбора предыдущей части
        setTimeout(() => {
            playQuietNextSound();
        }, 50);
        state.isFirstChangeInCycle = false;
    } else {
        state.isFirstChangeInCycle = true;
    }
    
    // Первое изменение сразу
    cycle();
    
    // Интервал с учетом звука
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
    
    // Форсируем воспроизведение choose звука
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
        }, 200);
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
        
        // Форсируем воспроизведение финальных звуков
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
    
    state.resetBtnLock = true;
    elements.resultAgainBtn.disabled = true;
    elements.resultAgainBtn.style.pointerEvents = 'none';
    elements.resultAgainBtn.style.cursor = 'not-allowed';
    elements.resultAgainBtn.style.opacity = '0.7';
    
    // Воспроизводим repeat звук
    playSound('repeat');
    
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

// Обработка нажатия пробела
window.addEventListener('keydown', e => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (state.isTimerActive || state.isBusy || state.gamePhase === 'memorizing' || state.gamePhase === 'creating') return;
        if (state.gamePhase === 'selecting' && elements.selectBtn.classList.contains('hidden')) return;
        
        unlockAudio();
        
        if (state.gamePhase === 'idle' && !state.startBtnLock && !elements.startBtn.classList.contains('hidden')) {
            startGame();
        } else if (state.gamePhase === 'selecting' && state.canSelect) {
            select();
        } else if (state.gamePhase === 'finished' && !state.resetBtnLock) {
            reset();
        }
    }
});

// ОПТИМИЗАЦИЯ: Делегирование событий для мобильных
document.addEventListener('touchstart', function(e) {
    if (e.target.tagName === 'BUTTON') {
        e.target.style.transform = 'scale(0.97)';
        unlockAudio();
    }
}, { passive: true });

document.addEventListener('touchend', function(e) {
    if (e.target.tagName === 'BUTTON') {
        e.target.style.transform = '';
    }
}, { passive: true });

// Назначение обработчиков событий для кнопок
elements.startBtn.onclick = function() {
    unlockAudio();
    setTimeout(() => startGame(), 50);
};

elements.selectBtn.onclick = function() {
    unlockAudio();
    select();
};

elements.resultAgainBtn.onclick = function() {
    unlockAudio();
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
    // Сразу начинаем загрузку
    const loadPromise = loadImages();
    
    // Предзагружаем звуки
    preloadAllSounds();
    
    // Ждем изображения
    await loadPromise;
    
    // Telegram инициализация
    if (tg) {
        tg.ready();
        tg.expand();
    }
    
    startIdle();
    
    // ОПТИМИЗАЦИЯ: Предотвращение зума на iOS
    document.addEventListener('gesturestart', function(e) {
        e.preventDefault();
    });
    
    // Разблокируем аудио при любом взаимодействии
    document.addEventListener('click', function initAudio() {
        unlockAudio();
        document.removeEventListener('click', initAudio);
    }, { once: true });
    
    document.addEventListener('touchstart', function initAudioTouch() {
        unlockAudio();
        document.removeEventListener('touchstart', initAudioTouch);
    }, { once: true });
    
    // Для локальной разработки: пробуем разблокировать через 1 секунду
    setTimeout(() => {
        if (!state.audioUnlocked) {
            console.log("Автоматическая разблокировка аудио для локальной разработки");
            unlockAudio();
        }
    }, 1000);
};