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
    timerSounds: [],
    canPressSpace: true,
    resultScreenVisible: false,
    chooseSoundInstances: [],
    changeSoundPlayed: false,
    startSoundPlayed: false,
    // Определение браузера и платформы
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
    isChrome: /chrome|chromium|crios/i.test(navigator.userAgent),
    isFirefox: /firefox|fxios/i.test(navigator.userAgent),
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    isMac: /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent),
    // Флаги для аудио
    audioUnlocked: false,
    audioContext: null,
    // Хранилища звуков
    audioBuffers: {},
    soundElements: {},
    soundPromises: {},
    // Очереди и кэши
    soundQueue: [],
    isProcessingQueue: false,
    lastPlayTime: {},
    // Safari-specific оптимизации
    safariAudioFixApplied: false,
    soundRetryCounts: {},
    soundCache: {}, // Кэш для часто используемых звуков
    // ИСПРАВЛЕНИЕ: флаги для звуков которые не проигрываются
    criticalSoundsLoaded: false,
    repeatSoundInstance: null,
    changeSoundInstance: null,
    startSoundInstance: null,
    chooseSoundInstance: null,
    // ИСПРАВЛЕНИЕ: Громкость звуков
    volumes: {
        timer: 1.0,     // Увеличиваем громкость таймера
        choose: 0.9,
        start: 1.0,
        repeat: 1.0,
        change: 1.0,
        victory: 1.0,
        vic: 1.0,
        loss: 1.0
    }
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

// ============================
// SAFARI-SPECIFIC ФИКСЫ
// ============================

// Фикс для Safari на Mac (задержки звуков)
function applySafariAudioFix() {
    if (!state.isSafari || state.safariAudioFixApplied) return;
    
    console.log('Применяем Safari audio фикс...');
    state.safariAudioFixApplied = true;
    
    // 1. Создаем скрытый аудио элемент для "разогрева"
    const warmUpAudio = document.createElement('audio');
    warmUpAudio.style.display = 'none';
    warmUpAudio.volume = 0.001;
    warmUpAudio.src = 'sounds/timer.mp3';
    document.body.appendChild(warmUpAudio);
    
    // 2. "Разогрев" аудио системы
    setTimeout(() => {
        try {
            warmUpAudio.play().then(() => {
                warmUpAudio.pause();
                warmUpAudio.currentTime = 0;
                console.log('✓ Safari audio разогрет');
            }).catch(() => {
                // Игнорируем ошибки разогрева
            });
        } catch (e) {
            // Игнорируем ошибки
        }
    }, 500);
    
    // 3. Устанавливаем глобальные обработчики для Safari
    document.addEventListener('click', () => {
        if (!state.audioUnlocked) {
            unlockAudioSystem();
        }
    }, { once: true });
    
    return true;
}

// Инициализация AudioContext с фиксами для Safari
function initAudioContext() {
    if (state.audioContext) return state.audioContext;
    
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        
        state.audioContext = new AudioContext();
        
        // Safari может требовать возобновления контекста
        if (state.audioContext.state === 'suspended') {
            const resumeAudio = () => {
                if (state.audioContext && state.audioContext.state === 'suspended') {
                    state.audioContext.resume().then(() => {
                        console.log('✓ AudioContext возобновлен');
                    });
                }
                document.removeEventListener('click', resumeAudio);
                document.removeEventListener('touchstart', resumeAudio);
            };
            
            document.addEventListener('click', resumeAudio);
            document.addEventListener('touchstart', resumeAudio);
        }
        
        console.log('✓ AudioContext создан');
        return state.audioContext;
    } catch (error) {
        console.warn('AudioContext не доступен:', error);
        return null;
    }
}

// Загрузка звука с кэшированием (особенно важно для Safari)
function loadSoundWithCache(src, soundName, critical = false) {
    // Проверяем кэш
    if (state.soundCache[soundName]) {
        return Promise.resolve(state.soundCache[soundName]);
    }
    
    return new Promise((resolve) => {
        // Проверяем, не загружается ли уже
        if (state.soundPromises[soundName]) {
            state.soundPromises[soundName].then(resolve);
            return;
        }
        
        console.log(`Загрузка звука: ${soundName} (critical: ${critical})`);
        
        const audioElement = new Audio();
        
        // Критически важные атрибуты для Safari
        audioElement.preload = 'auto';
        audioElement.controls = false;
        
        if (state.isIOS || state.isSafari) {
            audioElement.setAttribute('playsinline', 'true');
            audioElement.setAttribute('webkit-playsinline', 'true');
            audioElement.playsInline = true;
            audioElement.webkitPlaysInline = true;
        }
        
        audioElement.src = src;
        
        const promise = new Promise((innerResolve) => {
            const onCanPlay = () => {
                console.log(`✓ ${soundName} готов к воспроизведению`);
                audioElement.removeEventListener('canplaythrough', onCanPlay);
                audioElement.removeEventListener('error', onError);
                
                // Сохраняем в кэш
                state.soundCache[soundName] = audioElement;
                state.soundElements[soundName] = audioElement;
                audio[soundName] = audioElement;
                
                // ИСПРАВЛЕНИЕ: сохраняем отдельные экземпляры для критических звуков
                if (soundName === 'repeat') {
                    state.repeatSoundInstance = audioElement;
                } else if (soundName === 'change') {
                    state.changeSoundInstance = audioElement;
                } else if (soundName === 'start') {
                    state.startSoundInstance = audioElement;
                } else if (soundName === 'choose') {
                    state.chooseSoundInstance = audioElement;
                }
                
                innerResolve(audioElement);
            };
            
            const onError = (e) => {
                console.warn(`✗ Ошибка загрузки ${soundName}:`, e.target.error);
                audioElement.removeEventListener('canplaythrough', onCanPlay);
                audioElement.removeEventListener('error', onError);
                
                // Для критических звуков пробуем создать резервный элемент
                if (critical) {
                    console.log(`Создаем резервный элемент для ${soundName}`);
                    const backupAudio = new Audio();
                    backupAudio.preload = 'auto';
                    backupAudio.src = src;
                    
                    if (state.isIOS || state.isSafari) {
                        backupAudio.setAttribute('playsinline', 'true');
                        backupAudio.setAttribute('webkit-playsinline', 'true');
                    }
                    
                    // Сохраняем резервный элемент
                    if (soundName === 'repeat') {
                        state.repeatSoundInstance = backupAudio;
                    } else if (soundName === 'change') {
                        state.changeSoundInstance = backupAudio;
                    } else if (soundName === 'start') {
                        state.startSoundInstance = backupAudio;
                    }
                    
                    innerResolve(backupAudio);
                } else {
                    innerResolve(null);
                }
            };
            
            audioElement.addEventListener('canplaythrough', onCanPlay, { once: true });
            audioElement.addEventListener('error', onError, { once: true });
            
            // Начинаем загрузку
            try {
                audioElement.load();
            } catch (e) {
                console.warn(`load() ошибка для ${soundName}:`, e);
                // Пробуем все равно
                innerResolve(audioElement);
            }
        });
        
        state.soundPromises[soundName] = promise;
        promise.then(resolve);
    });
}

// ИСПРАВЛЕНИЕ: Специальная функция для загрузки критических звуков
function loadCriticalSounds() {
    console.log('Загрузка критических звуков...');
    
    // Критические звуки которые часто не проигрываются
    const criticalSounds = [
        { src: 'sounds/repeat.mp3', name: 'repeat', volume: state.volumes.repeat },
        { src: 'sounds/result.mp3', name: 'change', volume: state.volumes.change },
        { src: 'sounds/start.mp3', name: 'start', volume: state.volumes.start },
        { src: 'sounds/choose.mp3', name: 'choose', volume: state.volumes.choose },
        { src: 'sounds/timer.mp3', name: 'timer', volume: state.volumes.timer }
    ];
    
    const loadPromises = criticalSounds.map(({ src, name, volume }) => {
        return loadSoundWithCache(src, name, true).then(sound => {
            if (sound) {
                // Предварительно устанавливаем громкость
                sound.volume = volume;
                console.log(`✓ Критический звук ${name} загружен`);
            } else {
                console.warn(`✗ Критический звук ${name} не загружен`);
            }
            return sound;
        });
    });
    
    return Promise.all(loadPromises).then(() => {
        state.criticalSoundsLoaded = true;
        console.log('✓ Все критические звуки загружены');
    });
}

// Создание экземпляров для часто используемых звуков
function createSoundInstances() {
    // Для choose создаем больше экземпляров
    state.chooseSoundInstances = [];
    const chooseCount = (state.isSafari || state.isIOS) ? 8 : 4;
    
    for (let i = 0; i < chooseCount; i++) {
        loadSoundWithCache('sounds/choose.mp3', `choose_${i}`).then(sound => {
            if (sound) {
                state.chooseSoundInstances.push({
                    sound: sound,
                    isPlaying: false,
                    lastPlayTime: 0,
                    index: i
                });
            }
        });
    }
}

// Инициализация всех звуков с приоритетом для важных
function initAudioElements() {
    console.log('Инициализация аудио элементов...');
    console.log('Браузер:', state.isSafari ? 'Safari' : state.isChrome ? 'Chrome' : state.isFirefox ? 'Firefox' : 'Другой');
    console.log('Платформа:', state.isIOS ? 'iOS' : state.isMac ? 'Mac' : state.isMobile ? 'Android' : 'Desktop');
    
    // Применяем Safari фикс
    if (state.isSafari) {
        applySafariAudioFix();
    }
    
    // Инициализируем AudioContext
    initAudioContext();
    
    // ИСПРАВЛЕНИЕ: Сначала загружаем КРИТИЧЕСКИЕ звуки
    loadCriticalSounds().then(() => {
        // Затем создаем экземпляры
        createSoundInstances();
        
        // Затем загружаем остальные звуки
        const resultSounds = [
            ['sounds/victory.mp3', 'victory'],
            ['sounds/vic.mp3', 'vic'],
            ['sounds/loss.mp3', 'loss']
        ];
        
        resultSounds.forEach(([src, name]) => {
            loadSoundWithCache(src, name);
        });
        
        state.soundsLoaded = true;
        console.log('✓ Все звуки загружены');
    });
}

// Система очереди для предотвращения конфликтов в Safari
function addToSoundQueue(soundName, playFunction, priority = false) {
    // Для Safari всегда используем очередь
    if (state.isSafari || state.isIOS) {
        const queueItem = { soundName, playFunction, timestamp: Date.now() };
        
        if (priority) {
            state.soundQueue.unshift(queueItem); // Высокий приоритет в начало
        } else {
            state.soundQueue.push(queueItem);
        }
        
        if (!state.isProcessingQueue) {
            processSoundQueue();
        }
        return;
    }
    
    // Для других браузеров пробуем сразу
    playFunction();
}

function processSoundQueue() {
    if (state.soundQueue.length === 0) {
        state.isProcessingQueue = false;
        return;
    }
    
    state.isProcessingQueue = true;
    const now = Date.now();
    
    // Берем следующий звук из очереди
    const { soundName, playFunction, timestamp } = state.soundQueue.shift();
    
    // Safari: задержка между звуками
    const minDelay = state.isSafari ? 50 : 30;
    const timeSinceLast = now - (state.lastPlayTime[soundName] || 0);
    
    if (timeSinceLast < minDelay) {
        // Возвращаем в очередь и ждем
        state.soundQueue.unshift({ soundName, playFunction, timestamp });
        setTimeout(processSoundQueue, minDelay - timeSinceLast);
        return;
    }
    
    console.log(`Очередь: воспроизведение ${soundName}`);
    
    // Пробуем воспроизвести
    playFunction();
    state.lastPlayTime[soundName] = Date.now();
    
    // Следующий звук с задержкой
    const nextDelay = state.isSafari ? 60 : 40;
    setTimeout(processSoundQueue, nextDelay);
}

// Разблокировка аудио системы с улучшениями для Safari
function unlockAudioSystem() {
    if (state.audioUnlocked) {
        console.log('Аудио уже разблокировано');
        return Promise.resolve();
    }
    
    console.log('=== РАЗБЛОКИРОВКА АУДИО СИСТЕМЫ ===');
    
    return new Promise((resolve) => {
        state.audioUnlocked = true;
        state.userInteracted = true;
        
        // Для Safari: тестовое воспроизведение
        if (state.isSafari) {
            safariUnlockSequence().then(() => {
                state.audioInitialized = true;
                console.log('✓ Safari аудио разблокировано');
                resolve(true);
            }).catch(() => {
                state.audioInitialized = true;
                console.log('Safari аудио разблокировано (с ошибками)');
                resolve(true);
            });
        } else {
            state.audioInitialized = true;
            console.log('✓ Аудио система разблокирована');
            resolve(true);
        }
    });
}

// Специальная последовательность разблокировки для Safari
function safariUnlockSequence() {
    return new Promise((resolve) => {
        console.log('Safari unlock sequence...');
        
        // 1. Возобновляем AudioContext если нужно
        if (state.audioContext && state.audioContext.state === 'suspended') {
            state.audioContext.resume().then(() => {
                console.log('✓ AudioContext возобновлен');
            });
        }
        
        // 2. Тестовое воспроизведение тихого звука
        setTimeout(() => {
            try {
                const testAudio = new Audio('sounds/timer.mp3');
                testAudio.volume = 0.01;
                testAudio.setAttribute('playsinline', 'true');
                
                testAudio.play().then(() => {
                    testAudio.pause();
                    testAudio.currentTime = 0;
                    console.log('✓ Safari тестовое воспроизведение успешно');
                    resolve();
                }).catch(error => {
                    console.log('Safari тестовое воспроизведение не удалось:', error.message);
                    resolve(); // Все равно разрешаем
                });
            } catch (e) {
                console.warn('Safari тестовое воспроизведение исключение:', e);
                resolve();
            }
        }, 100);
    });
}

// ============================
// УЛУЧШЕННЫЕ ФУНКЦИИ ВОСПРОИЗВЕДЕНИЯ
// ============================

// ИСПРАВЛЕНИЕ: Упрощенная функция воспроизведения звука для проблемных звуков
function playSoundSimple(soundName, customVolume = null) {
    if (!state.audioEnabled || !state.audioInitialized) {
        console.log(`Аудио не готово для ${soundName}`);
        return false;
    }
    
    const now = Date.now();
    const volume = customVolume !== null ? customVolume : (state.volumes[soundName] || 1.0);
    
    console.log(`Воспроизведение ${soundName} (volume: ${volume})`);
    
    // Используем специальные экземпляры для проблемных звуков
    let sound = null;
    
    if (soundName === 'repeat' && state.repeatSoundInstance) {
        sound = state.repeatSoundInstance;
    } else if (soundName === 'change' && state.changeSoundInstance) {
        sound = state.changeSoundInstance;
    } else if (soundName === 'start' && state.startSoundInstance) {
        sound = state.startSoundInstance;
    } else if (soundName === 'choose' && state.chooseSoundInstance) {
        sound = state.chooseSoundInstance;
    } else {
        sound = state.soundCache[soundName] || state.soundElements[soundName] || audio[soundName];
    }
    
    if (!sound) {
        console.warn(`Звук ${soundName} не найден`);
        return false;
    }
    
    try {
        // Всегда сбрасываем время и устанавливаем громкость
        sound.currentTime = 0;
        sound.volume = volume;
        
        if (state.isSafari || state.isIOS) {
            sound.setAttribute('playsinline', 'true');
            sound.setAttribute('webkit-playsinline', 'true');
        }
        
        // Пробуем воспроизвести
        const playPromise = sound.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log(`✓ ${soundName} воспроизведен успешно`);
                state.lastPlayTime[soundName] = now;
                return true;
            }).catch(error => {
                console.warn(`✗ ${soundName} ошибка воспроизведения:`, error.name);
                
                // Вторая попытка через новый элемент
                try {
                    console.log(`Вторая попытка для ${soundName}`);
                    const newSound = new Audio(sound.src);
                    newSound.volume = volume;
                    newSound.play().catch(() => {});
                    state.lastPlayTime[soundName] = now;
                    return true;
                } catch (e) {
                    console.warn(`И ${soundName} тоже не удалось:`, e);
                    return false;
                }
            });
        } else {
            // Старые браузеры
            try {
                sound.play();
                console.log(`✓ ${soundName} воспроизведен (старый браузер)`);
                state.lastPlayTime[soundName] = now;
                return true;
            } catch (e) {
                console.warn(`✗ ${soundName} не воспроизведен:`, e);
                return false;
            }
        }
    } catch (error) {
        console.warn(`Исключение при воспроизведении ${soundName}:`, error);
        return false;
    }
    
    return true;
}

// ИСПРАВЛЕНИЕ: Специальные функции для проблемных звуков

// Для repeat (рестарт) - УПРОЩЕННАЯ ВЕРСИЯ
function playRepeatSound() {
    console.log('playRepeatSound вызван');
    // Простая прямая попытка
    playSoundSimple('repeat', state.volumes.repeat);
    
    // И дополнительная резервная попытка через 50мс
    setTimeout(() => {
        const sound = state.repeatSoundInstance || state.soundCache['repeat'] || audio.repeat;
        if (sound) {
            try {
                sound.currentTime = 0;
                sound.volume = state.volumes.repeat;
                sound.play().catch(() => {});
            } catch (e) {
                console.warn('Резервное воспроизведение repeat не удалось:', e);
            }
        }
    }, 50);
}

// Для change (result) - УПРОЩЕННАЯ ВЕРСИЯ
function playChangeSound() {
    console.log('playChangeSound вызван');
    // Простая прямая попытка
    playSoundSimple('change', state.volumes.change);
    
    // И дополнительная резервная попытка через 50мс
    setTimeout(() => {
        const sound = state.changeSoundInstance || state.soundCache['change'] || audio.change;
        if (sound) {
            try {
                sound.currentTime = 0;
                sound.volume = state.volumes.change;
                sound.play().catch(() => {});
            } catch (e) {
                console.warn('Резервное воспроизведение change не удалось:', e);
            }
        }
    }, 50);
}

// Для start - УПРОЩЕННАЯ ВЕРСИЯ
function playStartSound() {
    console.log('playStartSound вызван');
    // Простая прямая попытка
    playSoundSimple('start', state.volumes.start);
    
    // И дополнительная резервная попытка через 50мс
    setTimeout(() => {
        const sound = state.startSoundInstance || state.soundCache['start'] || audio.start;
        if (sound) {
            try {
                sound.currentTime = 0;
                sound.volume = state.volumes.start;
                sound.play().catch(() => {});
            } catch (e) {
                console.warn('Резервное воспроизведение start не удалось:', e);
            }
        }
    }, 50);
}

// Улучшенная функция для choose
function playChooseSound() {
    // Сначала пробуем простой способ
    if (playSoundSimple('choose', state.volumes.choose)) {
        return true;
    }
    
    // Fallback к экземплярам
    if (state.chooseSoundInstances.length > 0) {
        const now = Date.now();
        let availableInstance = null;
        
        // Ищем доступный экземпляр
        for (const instance of state.chooseSoundInstances) {
            if (!instance.isPlaying && (now - instance.lastPlayTime > 80)) {
                availableInstance = instance;
                break;
            }
        }
        
        if (!availableInstance) {
            // Берем самый старый по времени воспроизведения
            availableInstance = state.chooseSoundInstances.reduce((oldest, current) => {
                return current.lastPlayTime < oldest.lastPlayTime ? current : oldest;
            });
        }
        
        try {
            const sound = availableInstance.sound;
            sound.currentTime = 0;
            sound.volume = state.volumes.choose;
            
            if (state.isSafari || state.isIOS) {
                sound.setAttribute('playsinline', 'true');
                sound.setAttribute('webkit-playsinline', 'true');
            }
            
            availableInstance.isPlaying = true;
            availableInstance.lastPlayTime = now;
            
            sound.play().then(() => {
                console.log('✓ Choose через экземпляр');
                state.lastPlayTime['choose'] = now;
            }).catch(error => {
                console.warn('Choose экземпляр ошибка:', error);
                availableInstance.isPlaying = false;
            });
            
            setTimeout(() => {
                availableInstance.isPlaying = false;
            }, 300);
            
            return true;
        } catch (error) {
            console.warn('Ошибка choose экземпляра:', error);
            availableInstance.isPlaying = false;
        }
    }
    
    // Последняя попытка
    try {
        const sound = new Audio('sounds/choose.mp3');
        sound.volume = state.volumes.choose;
        sound.play().catch(() => {});
        return true;
    } catch (e) {
        console.warn('Choose через новый элемент не удалось:', e);
    }
    
    return false;
}

// Улучшенная функция для timer
function playTimerSound(number) {
    if (number < 0) return;
    
    // Простая прямая попытка с увеличенной громкостью
    playSoundSimple('timer', state.volumes.timer);
}

// Принудительная активация аудио
function ensureAudio() {
    console.log('ensureAudio вызван');
    
    if (!state.audioUnlocked) {
        unlockAudioSystem().then(() => {
            console.log('✓ Аудио система разблокирована');
        });
    }
}

// Остальной код остается практически без изменений
// ------------------------------------------------------------

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

// Начало игры - ИСПРАВЛЕНО: убрана излишняя защита
function startGame() {
    // ИСПРАВЛЕНИЕ: Убрана излишняя защита от спама
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
        playStartSound();
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
            
            // Используем приоритетный звук для change (result.mp3)
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

// Обработка выбора игрока - ИСПРАВЛЕНО: убрана излишняя защита
function select() {
    // ИСПРАВЛЕНИЕ: Убрана излишняя защита от спама
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

// Завершение игры - ИСПРАВЛЕНО: приоритетные звуки результатов
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
        
        // Воспроизводим звуки результатов
        if (p === 100) {
            playSoundSimple('victory', state.volumes.victory);
        } else if (p >= 75) {
            playSoundSimple('vic', state.volumes.vic);
        } else {
            playSoundSimple('loss', state.volumes.loss);
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

// Сброс игры - ИСПРАВЛЕНО: убрана излишняя защита
function reset() {
    // ИСПРАВЛЕНИЕ: Убрана излишняя защита от спама
    if (state.resetBtnLock || state.isBusy) return;
    
    // Используем специальную функцию для repeat звука
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

// Обработчики для Safari/Mac
document.addEventListener('touchstart', function(e) {
    ensureAudio();
    
    if (e.target.tagName === 'BUTTON') {
        e.target.style.transform = 'scale(0.97)';
    }
}, { passive: true });

document.addEventListener('touchend', function(e) {
    if (e.target.tagName === 'BUTTON') {
        e.target.style.transform = '';
    }
}, { passive: true });

// Назначение обработчиков событий для кнопок - ИСПРАВЛЕНО: убрана излишняя защита
elements.startBtn.onclick = function() {
    if (state.startBtnLock) return;
    
    ensureAudio();
    startGame();
};

elements.selectBtn.onclick = function() {
    ensureAudio();
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
    console.log('Браузер:', state.isSafari ? 'Safari' : state.isChrome ? 'Chrome' : state.isFirefox ? 'Firefox' : 'Другой');
    console.log('Платформа:', state.isIOS ? 'iOS' : state.isMac ? 'Mac' : state.isMobile ? 'Android' : 'Desktop');
    
    try {
        // Инициализируем аудио элементы ПЕРВЫМ ДЕЛОМ
        initAudioElements();
        
        // Загружаем изображения
        await loadImages();
        console.log('✓ Изображения загружены');
        
        // Telegram инициализация
        if (tg) {
            tg.ready();
            tg.expand();
            console.log('✓ Telegram WebApp инициализирован');
        }
        
        // Запускаем игру
        startIdle();
        console.log('✓ Игра запущена в режиме ожидания');
        
        // Агрессивная разблокировка аудио для Safari
        const unlockOnAnyInteraction = () => {
            if (!state.audioUnlocked) {
                console.log('Обнаружено взаимодействие, разблокируем аудио');
                unlockAudioSystem();
            }
        };
        
        // Обработчики для всех типов взаимодействий
        const events = ['click', 'touchstart', 'mousedown', 'pointerdown', 'keydown'];
        events.forEach(event => {
            document.addEventListener(event, unlockOnAnyInteraction);
        });
        
        // Автоматическая попытка разблокировки через 1 секунду
        setTimeout(() => {
            if (!state.audioUnlocked) {
                console.log('Автоматическая разблокировка аудио');
                unlockAudioSystem();
            }
        }, 1000);
        
        console.log('=== ИГРА УСПЕШНО ЗАГРУЖЕНА ===');
        
    } catch (error) {
        console.error('Ошибка загрузки игры:', error);
        startIdle();
    }
};