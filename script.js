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
    debugMode: true,
    // Определение браузера и платформы
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
    isChrome: /chrome|chromium|crios/i.test(navigator.userAgent),
    isFirefox: /firefox|fxios/i.test(navigator.userAgent),
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    isMac: /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent),
    isTelegramWebApp: window.Telegram && window.Telegram.WebApp,
    // Флаги для аудио
    audioUnlocked: false,
    // ИСПРАВЛЕНИЕ: Упрощенная система звуков
    soundInstances: {
        start: [],
        choose: [],
        repeat: [],
        timer: [],
        change: [],
        victory: [],
        vic: [],
        loss: []
    },
    currentSoundIndex: {
        start: 0,
        choose: 0,
        repeat: 0,
        timer: 0,
        change: 0,
        victory: 0,
        vic: 0,
        loss: 0
    },
    // ИСПРАВЛЕНИЕ: Громкость звуков
    volumes: {
        timer: 1.0,
        choose: 0.9,
        start: 0.9,
        repeat: 0.9,
        change: 0.9,
        victory: 0.9,
        vic: 0.9,
        loss: 0.9
    },
    // Флаги для обработки касаний
    touchStartedOnButton: false,
    currentTouchButton: null,
    // Флаг загрузки изображений
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

// ИСПРАВЛЕНИЕ: Функция для плавной смены текста в instruction
function setInstructionText(text, immediate = false) {
    const instruction = elements.instruction;
    
    if (immediate) {
        instruction.textContent = text;
        instruction.classList.add('show');
        return;
    }
    
    // Плавное исчезновение
    instruction.classList.remove('show');
    
    // Смена текста и появление
    setTimeout(() => {
        instruction.textContent = text;
        setTimeout(() => {
            instruction.classList.add('show');
        }, 50);
    }, 300);
}

// ============================
// УПРОЩЕННАЯ СИСТЕМА ЗВУКОВ
// ============================

// ИСПРАВЛЕНИЕ: Простая и надежная система звуков
function initAudioSystem() {
    console.log('Инициализация системы звуков...');
    console.log('Браузер:', state.isSafari ? 'Safari' : state.isChrome ? 'Chrome' : state.isFirefox ? 'Firefox' : 'Другой');
    console.log('Платформа:', state.isIOS ? 'iOS' : state.isMac ? 'Mac' : state.isMobile ? 'Android' : 'Desktop');
    console.log('Telegram Web App:', state.isTelegramWebApp ? 'Да' : 'Нет');
    
    // Создаем экземпляры для каждого звука
    const soundConfigs = [
        { name: 'start', src: 'sounds/start.mp3', instances: 3, volume: state.volumes.start },
        { name: 'choose', src: 'sounds/choose.mp3', instances: 5, volume: state.volumes.choose },
        { name: 'repeat', src: 'sounds/repeat.mp3', instances: 2, volume: state.volumes.repeat },
        { name: 'timer', src: 'sounds/timer.mp3', instances: 5, volume: state.volumes.timer },
        { name: 'change', src: 'sounds/result.mp3', instances: 2, volume: state.volumes.change },
        { name: 'victory', src: 'sounds/victory.mp3', instances: 2, volume: state.volumes.victory },
        { name: 'vic', src: 'sounds/vic.mp3', instances: 2, volume: state.volumes.vic },
        { name: 'loss', src: 'sounds/loss.mp3', instances: 2, volume: state.volumes.loss }
    ];
    
    // Для Safari и Telegram создаем больше экземпляров
    if (state.isSafari || state.isTelegramWebApp) {
        soundConfigs.forEach(config => {
            config.instances *= 2; // Удваиваем количество экземпляров
        });
    }
    
    // Загружаем звуки
    soundConfigs.forEach(config => {
        state.soundInstances[config.name] = [];
        
        for (let i = 0; i < config.instances; i++) {
            const audio = new Audio();
            audio.src = config.src;
            audio.volume = config.volume;
            audio.preload = 'auto';
            
            // Критически важные атрибуты для Safari и Telegram
            if (state.isIOS || state.isSafari || state.isTelegramWebApp) {
                audio.setAttribute('playsinline', 'true');
                audio.setAttribute('webkit-playsinline', 'true');
                audio.playsInline = true;
                audio.webkitPlaysInline = true;
                audio.muted = false;
            }
            
            // Для Telegram добавляем дополнительные атрибуты
            if (state.isTelegramWebApp) {
                audio.setAttribute('muted', 'false');
            }
            
            // Предзагружаем
            audio.load();
            
            state.soundInstances[config.name].push({
                audio: audio,
                isPlaying: false,
                index: i
            });
        }
        
        console.log(`✓ ${config.name}: ${config.instances} экземпляров создано`);
    });
    
    state.soundsLoaded = true;
    console.log('✓ Система звуков инициализирована');
    
    // Разблокируем аудио при первом взаимодействии
    setupAudioUnlock();
}

// ИСПРАВЛЕНИЕ: Надежное воспроизведение звука
function playSound(soundName) {
    if (!state.audioEnabled || !state.soundsLoaded) {
        console.log(`Аудио не готово для ${soundName}`);
        return false;
    }
    
    const instances = state.soundInstances[soundName];
    if (!instances || instances.length === 0) {
        console.warn(`Нет экземпляров для звука ${soundName}`);
        return false;
    }
    
    // Используем round-robin для выбора экземпляра
    const index = state.currentSoundIndex[soundName] % instances.length;
    state.currentSoundIndex[soundName]++;
    
    const instance = instances[index];
    
    // Если экземпляр уже воспроизводится, пропускаем
    if (instance.isPlaying) {
        console.log(`Экземпляр ${soundName}-${index} уже воспроизводится`);
        return false;
    }
    
    try {
        // Сбрасываем и воспроизводим
        instance.audio.currentTime = 0;
        instance.isPlaying = true;
        
        // Для Safari/Telegram: дополнительные проверки
        if (state.isSafari || state.isTelegramWebApp) {
            instance.audio.setAttribute('playsinline', 'true');
            instance.audio.setAttribute('webkit-playsinline', 'true');
        }
        
        const playPromise = instance.audio.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log(`✓ ${soundName} воспроизведен (экземпляр ${index})`);
                
                // Сбрасываем флаг через время звука
                setTimeout(() => {
                    instance.isPlaying = false;
                }, 1000);
                
            }).catch(error => {
                console.warn(`✗ ${soundName} ошибка: ${error.name}`);
                instance.isPlaying = false;
                
                // Для Web App: пробуем альтернативный метод
                if (state.isTelegramWebApp) {
                    setTimeout(() => {
                        try {
                            instance.audio.play().catch(() => {});
                        } catch (e) {
                            // Игнорируем ошибку
                        }
                    }, 50);
                }
            });
        } else {
            // Старые браузеры
            instance.audio.play();
            console.log(`✓ ${soundName} воспроизведен (старый браузер)`);
            
            setTimeout(() => {
                instance.isPlaying = false;
            }, 1000);
        }
        
        return true;
        
    } catch (error) {
        console.warn(`Исключение для ${soundName}:`, error);
        instance.isPlaying = false;
        return false;
    }
}

// Специальные функции для проблемных звуков
function playStartSound() {
    console.log('playStartSound вызван');
    return playSound('start');
}

function playChooseSound() {
    console.log('playChooseSound вызван');
    return playSound('choose');
}

function playRepeatSound() {
    console.log('playRepeatSound вызван');
    return playSound('repeat');
}

function playTimerSound(number) {
    if (number < 0) return;
    console.log(`playTimerSound ${number} вызван`);
    return playSound('timer');
}

function playChangeSound() {
    console.log('playChangeSound вызван');
    return playSound('change');
}

// ИСПРАВЛЕНИЕ: Настройка разблокировки аудио
function setupAudioUnlock() {
    console.log('Настройка разблокировки аудио...');
    
    // Функция разблокировки
    const unlockAudio = () => {
        if (state.audioUnlocked) return;
        
        console.log('=== РАЗБЛОКИРОВКА АУДИО ===');
        state.audioUnlocked = true;
        state.userInteracted = true;
        
        // Для Safari/Telegram: тестовое воспроизведение
        if (state.isSafari || state.isTelegramWebApp) {
            setTimeout(() => {
                try {
                    // Пробуем воспроизвести тихий звук
                    const testAudio = new Audio('sounds/timer.mp3');
                    testAudio.volume = 0.001;
                    testAudio.setAttribute('playsinline', 'true');
                    
                    if (state.isTelegramWebApp) {
                        testAudio.setAttribute('muted', 'false');
                    }
                    
                    testAudio.play().then(() => {
                        testAudio.pause();
                        testAudio.currentTime = 0;
                        console.log('✓ Тестовое воспроизведение успешно');
                    }).catch(() => {
                        console.log('Тестовое воспроизведение не удалось');
                    });
                } catch (e) {
                    console.warn('Тестовое воспроизведение исключение:', e);
                }
            }, 100);
        }
        
        console.log('✓ Аудио система разблокирована');
        
        // Убираем обработчики после разблокировки
        events.forEach(event => {
            document.removeEventListener(event, unlockAudio);
        });
    };
    
    // Обработчики для всех типов взаимодействий
    const events = ['click', 'touchstart', 'mousedown', 'pointerdown', 'keydown'];
    events.forEach(event => {
        document.addEventListener(event, unlockAudio, { once: true });
    });
    
    // Автоматическая попытка разблокировки через 2 секунды
    setTimeout(() => {
        if (!state.audioUnlocked) {
            console.log('Автоматическая разблокировка аудио');
            unlockAudio();
        }
    }, 2000);
}

// Принудительная активация аудио
function ensureAudio() {
    if (!state.audioUnlocked) {
        setupAudioUnlock();
    }
}

// ============================
// ОСНОВНЫЕ ФУНКЦИИ ИГРЫ
// ============================

// ИСПРАВЛЕНИЕ: Функция для проверки загрузки всех изображений
function checkImagesLoaded() {
    let allLoaded = true;
    let loadedCount = 0;
    let totalCount = 0;
    
    // Подсчитываем общее количество изображений
    for (const type of state.parts) {
        totalCount += state.partCounts[type];
    }
    
    // Проверяем загружены ли все изображения
    for (const type of state.parts) {
        if (!state.loaded[type]) {
            allLoaded = false;
            continue;
        }
        
        for (const item of state.loaded[type]) {
            if (item && item.img && item.img.complete && item.img.naturalWidth !== 0) {
                loadedCount++;
            } else {
                allLoaded = false;
            }
        }
    }
    
    console.log(`Изображения: ${loadedCount}/${totalCount} загружено`);
    
    return {
        allLoaded: allLoaded,
        loadedCount: loadedCount,
        totalCount: totalCount
    };
}

// ИСПРАВЛЕНИЕ: Обновление UI в зависимости от загрузки
function updateLoadingUI() {
    const loadStatus = checkImagesLoaded();
    
    if (!loadStatus.allLoaded) {
        // Показываем загрузку с прогрессом
        const progressText = `Загрузка... ${loadStatus.loadedCount}/${loadStatus.totalCount}`;
        if (elements.instruction.textContent !== progressText) {
            setInstructionText(progressText);
        }
        
        // Скрываем кнопку
        elements.startBtn.classList.add('hidden');
        elements.startBtn.disabled = true;
        elements.startBtn.style.pointerEvents = 'none';
        elements.startBtn.style.opacity = '0.5';
        
        // Продолжаем проверять каждые 500мс
        setTimeout(updateLoadingUI, 500);
    } else {
        // Все загружено, показываем кнопку
        state.imagesLoaded = true;
        console.log('✓ Все изображения загружены');
        
        // ИСПРАВЛЕНИЕ: Плавная смена текста
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
        
        setInstructionText(instructionText);
        
        // ИСПРАВЛЕНИЕ: Плавное появление кнопки
        setTimeout(() => {
            elements.startBtn.classList.remove('hidden');
            elements.startBtn.style.opacity = '0';
            elements.startBtn.style.transition = 'opacity 0.3s ease';
            
            setTimeout(() => {
                elements.startBtn.style.opacity = '1';
                elements.startBtn.disabled = false;
                elements.startBtn.style.pointerEvents = 'auto';
                
                // Убираем transition после анимации
                setTimeout(() => {
                    elements.startBtn.style.transition = '';
                }, 300);
            }, 50);
        }, 350);
        
        // Запускаем idle анимацию если мы в режиме ожидания
        if (state.gamePhase === 'idle') {
            startIdleAnimation();
        }
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
    if (!state.order[type] || !state.loaded[type]) {
        return null;
    }
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
                img.onerror = () => { 
                    console.warn(`Ошибка загрузки: ${folders[type]}${i}.png`);
                    r(); 
                };
            }));
            
            state.loaded[type].push({ id: i, img: img });
        }
        
        await Promise.all(loadPromises);
        console.log(`✓ ${type} изображения загружены`);
    }
    
    // ИСПРАВЛЕНИЕ: После загрузки обновляем UI
    updateLoadingUI();
}

// Отрисовка персонажа в указанном контейнере
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

// ИСПРАВЛЕНИЕ: Функции для обработки касаний
function setupTouchHandlers() {
    console.log('Настройка обработчиков касаний...');
    
    // Обработчики для всех кнопок
    const buttons = [elements.startBtn, elements.selectBtn, elements.resultAgainBtn];
    
    buttons.forEach(button => {
        if (!button) return;
        
        // Touch start
        button.addEventListener('touchstart', function(e) {
            state.touchStartedOnButton = true;
            state.currentTouchButton = this;
            this.style.transform = 'scale(0.97)';
            e.preventDefault();
        }, { passive: false });
        
        // Touch move
        button.addEventListener('touchmove', function(e) {
            if (!state.touchStartedOnButton) return;
            
            const touch = e.touches[0];
            const rect = this.getBoundingClientRect();
            const isStillOnButton = (
                touch.clientX >= rect.left &&
                touch.clientX <= rect.right &&
                touch.clientY >= rect.top &&
                touch.clientY <= rect.bottom
            );
            
            if (!isStillOnButton) {
                state.touchStartedOnButton = false;
                this.style.transform = '';
            }
        }, { passive: true });
        
        // Touch end
        button.addEventListener('touchend', function(e) {
            if (state.touchStartedOnButton && state.currentTouchButton === this) {
                this.style.transform = '';
                
                if (this === elements.startBtn) {
                    handleStartButton();
                } else if (this === elements.selectBtn) {
                    handleSelectButton();
                } else if (this === elements.resultAgainBtn) {
                    handleResetButton();
                }
            }
            
            state.touchStartedOnButton = false;
            state.currentTouchButton = null;
            this.style.transform = '';
            e.preventDefault();
        }, { passive: false });
        
        // Touch cancel
        button.addEventListener('touchcancel', function() {
            state.touchStartedOnButton = false;
            state.currentTouchButton = null;
            this.style.transform = '';
        }, { passive: true });
    });
    
    // Обработчики кликов
    elements.startBtn.addEventListener('click', handleStartButton);
    elements.selectBtn.addEventListener('click', handleSelectButton);
    elements.resultAgainBtn.addEventListener('click', handleResetButton);
}

// Обработчики для кнопок
function handleStartButton() {
    if (state.startBtnLock) return;
    
    ensureAudio();
    startGame();
}

function handleSelectButton() {
    ensureAudio();
    select();
}

function handleResetButton() {
    ensureAudio();
    reset();
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
    
    if (!state.imagesLoaded) {
        updateLoadingUI();
        return;
    }
    
    startIdleAnimation();
}

// Отдельная функция для анимации idle
function startIdleAnimation() {
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
    
    setInstructionText(instructionText);
    
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
    state.changeSoundPlayed = false;
    
    playStartSound();
    
    stopIdle();
    
    setInstructionText("Создаём персонажа...");
    
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
        setInstructionText("Запомни персонажа");
        
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

    setInstructionText(`Выбери ${getLabel(state.parts[0])}`);
    
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
    
    setTimeout(() => {
        setInstructionText(`Выбери ${getLabel(type)}`);
        
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
    
    if (state.interval) {
        clearInterval(state.interval);
        state.interval = null;
    }
    
    elements.gameArea.classList.add('hidden');
    
    setTimeout(() => {
        let m = 0;
        state.parts.forEach(p => { 
            if(state.selection[p] && state.target[p] && state.selection[p].id === state.target[p].id) m++; 
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
        
        // Воспроизводим звуки результатов
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
    
    playRepeatSound();
    
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
    console.log('Браузер:', state.isSafari ? 'Safari' : state.isChrome ? 'Chrome' : state.isFirefox ? 'Firefox' : 'Другой');
    console.log('Платформа:', state.isIOS ? 'iOS' : state.isMac ? 'Mac' : state.isMobile ? 'Android' : 'Desktop');
    console.log('Telegram Web App:', state.isTelegramWebApp ? 'Да' : 'Нет');
    
    try {
        // Сначала показываем загрузку
        setInstructionText("Загрузка...", true);
        elements.startBtn.classList.add('hidden');
        elements.startBtn.disabled = true;
        elements.startBtn.style.opacity = '0.5';
        elements.startBtn.style.pointerEvents = 'none';
        
        // Инициализируем систему звуков ПЕРВЫМ ДЕЛОМ
        initAudioSystem();
        
        // Загружаем изображения
        await loadImages();
        console.log('✓ Изображения загружены');
        
        // Telegram инициализация
        if (tg) {
            tg.ready();
            tg.expand();
            console.log('✓ Telegram WebApp инициализирован');
        }
        
        // Настраиваем обработчики касаний
        setupTouchHandlers();
        console.log('✓ Обработчики касаний настроены');
        
        // Запускаем игру
        startIdle();
        console.log('✓ Игра запущена в режиме ожидания');
        
        console.log('=== ИГРА УСПЕШНО ЗАГРУЖЕНА ===');
        
    } catch (error) {
        console.error('Ошибка загрузки игры:', error);
        updateLoadingUI();
        startIdle();
    }
};