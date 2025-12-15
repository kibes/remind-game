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
    isTelegramWebApp: window.Telegram && window.Telegram.WebApp,
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
    timerSoundInstance: null,
    // ИСПРАВЛЕНИЕ: Флаги для каждого звука чтобы предотвратить пропуски
    lastTimerPlayTime: 0,
    timerPlayQueue: [],
    isPlayingTimer: false,
    // ИСПРАВЛЕНИЕ: Громкость звуков
    volumes: {
        timer: 1.0,     // Увеличиваем громкость таймера
        choose: 1.0,
        start: 1.0,
        repeat: 1.0,
        change: 1.0,
        victory: 1.0,
        vic: 1.0,
        loss: 1.0
    },
    // ИСПРАВЛЕНИЕ: Флаги для обработки касаний
    touchStartedOnButton: false,
    currentTouchButton: null,
    // ИСПРАВЛЕНИЕ: Флаг загрузки изображений
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
        
        // Критически важные атрибуты для Safari и Telegram Web App
        audioElement.preload = 'auto';
        audioElement.controls = false;
        
        // Telegram Web App требует особых атрибутов
        if (state.isIOS || state.isSafari || state.isTelegramWebApp) {
            audioElement.setAttribute('playsinline', 'true');
            audioElement.setAttribute('webkit-playsinline', 'true');
            audioElement.playsInline = true;
            audioElement.webkitPlaysInline = true;
            audioElement.muted = false;
        }
        
        // Для Telegram Web App добавляем дополнительные атрибуты
        if (state.isTelegramWebApp) {
            audioElement.setAttribute('muted', 'false');
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
                } else if (soundName === 'timer') {
                    state.timerSoundInstance = audioElement;
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
                    
                    if (state.isIOS || state.isSafari || state.isTelegramWebApp) {
                        backupAudio.setAttribute('playsinline', 'true');
                        backupAudio.setAttribute('webkit-playsinline', 'true');
                        backupAudio.muted = false;
                    }
                    
                    if (state.isTelegramWebApp) {
                        backupAudio.setAttribute('muted', 'false');
                    }
                    
                    // Сохраняем резервный элемент
                    if (soundName === 'repeat') {
                        state.repeatSoundInstance = backupAudio;
                    } else if (soundName === 'change') {
                        state.changeSoundInstance = backupAudio;
                    } else if (soundName === 'start') {
                        state.startSoundInstance = backupAudio;
                    } else if (soundName === 'timer') {
                        state.timerSoundInstance = backupAudio;
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
        { src: 'sounds/start.mp3', name: 'start', volume: state.volumes.start },
        { src: 'sounds/choose.mp3', name: 'choose', volume: state.volumes.choose },
        { src: 'sounds/timer.mp3', name: 'timer', volume: state.volumes.timer },
        { src: 'sounds/repeat.mp3', name: 'repeat', volume: state.volumes.repeat },
        { src: 'sounds/result.mp3', name: 'change', volume: state.volumes.change }
    ];
    
    const loadPromises = criticalSounds.map(({ src, name, volume }) => {
        return loadSoundWithCache(src, name, true).then(sound => {
            if (sound) {
                // Предварительно устанавливаем громкость
                sound.volume = volume;
                console.log(`✓ Критический звук ${name} загружен`);
                
                // ИСПРАВЛЕНИЕ: Предзагружаем звук для немедленного воспроизведения
                if (state.isTelegramWebApp) {
                    setTimeout(() => {
                        try {
                            sound.currentTime = 0;
                            sound.volume = 0.01;
                            sound.play().then(() => {
                                sound.pause();
                                sound.currentTime = 0;
                                sound.volume = volume;
                                console.log(`✓ Telegram: ${name} предзагружен`);
                            }).catch(() => {});
                        } catch (e) {
                            // Игнорируем ошибки предзагрузки
                        }
                    }, 300);
                }
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
    // Для choose создаем больше экземпляров, особенно для Telegram Web App
    state.chooseSoundInstances = [];
    const chooseCount = (state.isTelegramWebApp || state.isSafari || state.isIOS) ? 12 : 6;
    
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
    
    // Для timer создаем экземпляры для Telegram Web App
    state.timerSounds = [];
    const timerCount = (state.isTelegramWebApp) ? 10 : 5;
    
    for (let i = 0; i < timerCount; i++) {
        loadSoundWithCache('sounds/timer.mp3', `timer_instance_${i}`).then(sound => {
            if (sound) {
                state.timerSounds.push({
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
    console.log('Telegram Web App:', state.isTelegramWebApp ? 'Да' : 'Нет');
    
    // Применяем Safari фикс
    if (state.isSafari || state.isTelegramWebApp) {
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

// ИСПРАВЛЕНИЕ: Упрощенная очередь для Telegram Web App
function addToSoundQueue(soundName, playFunction, priority = false) {
    const now = Date.now();
    
    // Для Telegram Web App используем минимальную задержку 20мс
    const minDelay = 20;
    const timeSinceLast = now - (state.lastPlayTime[soundName] || 0);
    
    if (timeSinceLast < minDelay) {
        // Запускаем с небольшой задержкой
        setTimeout(() => playFunction(), minDelay - timeSinceLast);
        return;
    }
    
    // Немедленное выполнение
    playFunction();
    state.lastPlayTime[soundName] = now;
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
        
        // Для Safari/Telegram: тестовое воспроизведение
        if (state.isSafari || state.isTelegramWebApp) {
            safariUnlockSequence().then(() => {
                state.audioInitialized = true;
                console.log('✓ Safari/Telegram аудио разблокировано');
                resolve(true);
            }).catch(() => {
                state.audioInitialized = true;
                console.log('Safari/Telegram аудио разблокировано (с ошибками)');
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
        console.log('Safari/Telegram unlock sequence...');
        
        // 1. Возобновляем AudioContext если нужно
        if (state.audioContext && state.audioContext.state === 'suspended') {
            state.audioContext.resume().then(() => {
                console.log('✓ AudioContext возобновлен');
            });
        }
        
        // 2. Тестовое воспроизведение тихого звука для каждого критического звука
        const testSounds = ['timer', 'choose', 'start', 'repeat', 'change'];
        let completed = 0;
        
        testSounds.forEach(soundName => {
            setTimeout(() => {
                try {
                    const testAudio = new Audio(`sounds/${soundName}.mp3`);
                    testAudio.volume = 0.001;
                    testAudio.setAttribute('playsinline', 'true');
                    testAudio.setAttribute('webkit-playsinline', 'true');
                    
                    if (state.isTelegramWebApp) {
                        testAudio.setAttribute('muted', 'false');
                    }
                    
                    testAudio.play().then(() => {
                        testAudio.pause();
                        testAudio.currentTime = 0;
                        console.log(`✓ Тест звука ${soundName} успешен`);
                        completed++;
                        if (completed === testSounds.length) {
                            resolve();
                        }
                    }).catch(() => {
                        console.log(`Тест звука ${soundName} не удался`);
                        completed++;
                        if (completed === testSounds.length) {
                            resolve();
                        }
                    });
                } catch (e) {
                    console.warn(`Тест звука ${soundName} исключение:`, e);
                    completed++;
                    if (completed === testSounds.length) {
                        resolve();
                    }
                }
            }, 50 * testSounds.indexOf(soundName));
        });
    });
}

// ============================
// УЛУЧШЕННЫЕ ФУНКЦИИ ВОСПРОИЗВЕДЕНИЯ
// ============================

// ИСПРАВЛЕНИЕ: Надежная функция воспроизведения звука
function playSoundReliable(soundName, customVolume = null) {
    if (!state.audioEnabled) {
        console.log(`Аудио отключено для ${soundName}`);
        return false;
    }
    
    // Если аудио не инициализировано, пробуем инициализировать
    if (!state.audioInitialized) {
        console.log(`Аудио не инициализировано для ${soundName}, пробуем разблокировать`);
        unlockAudioSystem().then(() => {
            // Повторяем попытку через небольшой интервал
            setTimeout(() => playSoundReliable(soundName, customVolume), 50);
        });
        return false;
    }
    
    const now = Date.now();
    const volume = customVolume !== null ? customVolume : (state.volumes[soundName] || 1.0);
    
    console.log(`Воспроизведение ${soundName} (volume: ${volume})`);
    
    // ИСПРАВЛЕНИЕ: Добавляем в очередь с небольшой задержкой
    addToSoundQueue(soundName, () => {
        actuallyPlaySound(soundName, volume, now);
    }, true);
    
    return true;
}

// Фактическое воспроизведение звука
function actuallyPlaySound(soundName, volume, now) {
    // Получаем звук
    let sound = state.soundCache[soundName] || state.soundElements[soundName] || audio[soundName];
    
    // ИСПРАВЛЕНИЕ: Для критических звуков используем специальные экземпляры
    if (!sound) {
        if (soundName === 'repeat' && state.repeatSoundInstance) {
            sound = state.repeatSoundInstance;
        } else if (soundName === 'change' && state.changeSoundInstance) {
            sound = state.changeSoundInstance;
        } else if (soundName === 'start' && state.startSoundInstance) {
            sound = state.startSoundInstance;
        } else if (soundName === 'choose' && state.chooseSoundInstance) {
            sound = state.chooseSoundInstance;
        } else if (soundName === 'timer' && state.timerSoundInstance) {
            sound = state.timerSoundInstance;
        }
    }
    
    if (!sound) {
        console.warn(`Звук ${soundName} не найден, создаем новый`);
        try {
            sound = new Audio(`sounds/${soundName}.mp3`);
            sound.volume = volume;
            sound.setAttribute('playsinline', 'true');
            if (state.isTelegramWebApp) {
                sound.setAttribute('muted', 'false');
            }
        } catch (e) {
            console.warn(`Не удалось создать звук ${soundName}:`, e);
            return false;
        }
    }
    
    try {
        // ИСПРАВЛЕНИЕ: Всегда сбрасываем время
        sound.currentTime = 0;
        sound.volume = volume;
        
        if (state.isSafari || state.isIOS || state.isTelegramWebApp) {
            sound.setAttribute('playsinline', 'true');
            sound.setAttribute('webkit-playsinline', 'true');
            sound.muted = false;
        }
        
        // Пробуем воспроизвести
        sound.play().then(() => {
            console.log(`✓ ${soundName} воспроизведен успешно`);
            state.lastPlayTime[soundName] = now;
        }).catch(error => {
            console.warn(`✗ ${soundName} ошибка воспроизведения:`, error.name);
            
            // Вторая попытка через 50мс с новым элементом
            setTimeout(() => {
                try {
                    const newSound = new Audio(`sounds/${soundName}.mp3`);
                    newSound.volume = volume;
                    newSound.setAttribute('playsinline', 'true');
                    newSound.play().catch(() => {});
                    console.log(`✓ ${soundName} через новый элемент`);
                } catch (e) {
                    console.warn(`И ${soundName} тоже не удалось:`, e);
                }
            }, 50);
        });
        
        return true;
    } catch (error) {
        console.warn(`Исключение при воспроизведении ${soundName}:`, error);
        return false;
    }
}

// ИСПРАВЛЕНИЕ: Специальные функции для проблемных звуков

// Для repeat (рестарт)
function playRepeatSound() {
    console.log('playRepeatSound вызван');
    // Прямая надежная попытка
    playSoundReliable('repeat', state.volumes.repeat);
    
    // Резервная попытка через 100мс
    setTimeout(() => {
        playSoundReliable('repeat', state.volumes.repeat);
    }, 100);
}

// Для change (result)
function playChangeSound() {
    console.log('playChangeSound вызван');
    // Прямая надежная попытка
    playSoundReliable('change', state.volumes.change);
    
    // Резервная попытка через 100мс
    setTimeout(() => {
        playSoundReliable('change', state.volumes.change);
    }, 100);
}

// Для start
function playStartSound() {
    console.log('playStartSound вызван');
    // Прямая надежная попытка
    playSoundReliable('start', state.volumes.start);
    
    // Резервная попытка через 100мс
    setTimeout(() => {
        playSoundReliable('start', state.volumes.start);
    }, 100);
}

// ИСПРАВЛЕНИЕ: Улучшенная функция для choose
function playChooseSound() {
    console.log('playChooseSound вызван');
    
    // Сначала пробуем простой способ
    playSoundReliable('choose', state.volumes.choose);
    
    // Затем пробуем через экземпляры
    setTimeout(() => {
        if (state.chooseSoundInstances.length > 0) {
            const now = Date.now();
            let availableInstance = null;
            
            // Ищем доступный экземпляр
            for (const instance of state.chooseSoundInstances) {
                if (!instance.isPlaying && (now - instance.lastPlayTime > 100)) {
                    availableInstance = instance;
                    break;
                }
            }
            
            if (!availableInstance) {
                availableInstance = state.chooseSoundInstances.reduce((oldest, current) => {
                    return current.lastPlayTime < oldest.lastPlayTime ? current : oldest;
                });
            }
            
            try {
                const sound = availableInstance.sound;
                sound.currentTime = 0;
                sound.volume = state.volumes.choose;
                
                if (state.isSafari || state.isIOS || state.isTelegramWebApp) {
                    sound.setAttribute('playsinline', 'true');
                    sound.setAttribute('webkit-playsinline', 'true');
                    sound.muted = false;
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
                
            } catch (error) {
                console.warn('Ошибка choose экземпляра:', error);
                if (availableInstance) availableInstance.isPlaying = false;
            }
        }
    }, 30);
    
    return true;
}

// ИСПРАВЛЕНИЕ: Улучшенная функция для timer с гарантированным воспроизведением
function playTimerSound(number) {
    if (number < 0) return;
    
    console.log(`playTimerSound ${number} вызван`);
    
    // ИСПРАВЛЕНИЕ: Гарантируем воспроизведение на первой и последней цифре
    const now = Date.now();
    
    // Прямая надежная попытка
    playSoundReliable('timer', state.volumes.timer);
    
    // Для Telegram Web App добавляем резервную попытку через экземпляры
    setTimeout(() => {
        if (state.timerSounds.length > 0) {
            const index = number % state.timerSounds.length;
            const timerInstance = state.timerSounds[index];
            
            if (timerInstance && (now - timerInstance.lastPlayTime > 150)) {
                try {
                    const sound = timerInstance.sound;
                    sound.currentTime = 0;
                    sound.volume = state.volumes.timer;
                    
                    if (state.isSafari || state.isIOS || state.isTelegramWebApp) {
                        sound.setAttribute('playsinline', 'true');
                        sound.setAttribute('webkit-playsinline', 'true');
                        sound.muted = false;
                    }
                    
                    timerInstance.isPlaying = true;
                    timerInstance.lastPlayTime = now;
                    
                    sound.play().then(() => {
                        console.log(`✓ Timer ${number} через экземпляр`);
                        state.lastPlayTime['timer'] = now;
                    }).catch(error => {
                        console.warn(`Timer ${number} экземпляр ошибка:`, error);
                        timerInstance.isPlaying = false;
                    });
                    
                    setTimeout(() => {
                        timerInstance.isPlaying = false;
                    }, 300);
                    
                } catch (error) {
                    console.warn(`Timer ${number} исключение:`, error);
                    if (timerInstance) timerInstance.isPlaying = false;
                }
            }
        }
    }, 40);
    
    // ИСПРАВЛЕНИЕ: Дополнительная гарантированная попытка для первой и последней цифры
    if (number === 5 || number === 1 || number === 0) {
        setTimeout(() => {
            try {
                const sound = new Audio('sounds/timer.mp3');
                sound.volume = state.volumes.timer;
                sound.setAttribute('playsinline', 'true');
                sound.setAttribute('muted', 'false');
                sound.play().catch(() => {});
                console.log(`✓ Timer ${number} гарантированно`);
            } catch (e) {
                console.warn(`Timer ${number} гарантированно не удалось:`, e);
            }
        }, 80);
    }
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

// ИСПРАВЛЕНИЕ: Функции для обработки касаний
function setupTouchHandlers() {
    console.log('Настройка обработчиков касаний...');
    
    // Обработчики для всех кнопок
    const buttons = [elements.startBtn, elements.selectBtn, elements.resultAgainBtn];
    
    buttons.forEach(button => {
        if (!button) return;
        
        // Touch start - запоминаем, что касание началось на кнопке
        button.addEventListener('touchstart', function(e) {
            state.touchStartedOnButton = true;
            state.currentTouchButton = this;
            this.style.transform = 'scale(0.97)';
            e.preventDefault();
        }, { passive: false });
        
        // Touch move - проверяем, находится ли палец еще на кнопке
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
                // Палец ушел с кнопки
                state.touchStartedOnButton = false;
                this.style.transform = '';
            }
        }, { passive: true });
        
        // Touch end - срабатывает только если палец все еще на кнопке
        button.addEventListener('touchend', function(e) {
            if (state.touchStartedOnButton && state.currentTouchButton === this) {
                // Касание завершилось на той же кнопке
                this.style.transform = '';
                
                // Вызываем соответствующую функцию
                if (this === elements.startBtn) {
                    handleStartButton();
                } else if (this === elements.selectBtn) {
                    handleSelectButton();
                } else if (this === elements.resultAgainBtn) {
                    handleResetButton();
                }
            }
            
            // Сбрасываем состояние
            state.touchStartedOnButton = false;
            state.currentTouchButton = null;
            this.style.transform = '';
            e.preventDefault();
        }, { passive: false });
        
        // Touch cancel - сбрасываем состояние
        button.addEventListener('touchcancel', function() {
            state.touchStartedOnButton = false;
            state.currentTouchButton = null;
            this.style.transform = '';
        }, { passive: true });
    });
    
    // Также настраиваем обработчики кликов для десктопов
    elements.startBtn.addEventListener('click', handleStartButton);
    elements.selectBtn.addEventListener('click', handleSelectButton);
    elements.resultAgainBtn.addEventListener('click', handleResetButton);
}

// Обработчики для кнопок (вынесены в отдельные функции)
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
        for (const item of state.loaded[type] || []) {
            if (item.img && item.img.complete) {
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
        // Показываем загрузку
        elements.instruction.textContent = `Загрузка... ${loadStatus.loadedCount}/${loadStatus.totalCount}`;
        elements.instruction.classList.add('show');
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
        elements.startBtn.classList.remove('hidden');
        elements.startBtn.disabled = false;
        elements.startBtn.style.pointerEvents = 'auto';
        elements.startBtn.style.opacity = '1';
        
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
    
    // ИСПРАВЛЕНИЕ: Проверяем загружены ли изображения
    if (!state.imagesLoaded) {
        updateLoadingUI();
        return;
    }
    
    // Если изображения загружены, продолжаем как обычно
    startIdleAnimation();
}

// ИСПРАВЛЕНИЕ: Отдельная функция для анимации idle
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
        
        // ИСПРАВЛЕНИЕ: Гарантированное воспроизведение звука таймера
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
    
    // ИСПРАВЛЕНИЕ: Гарантированное воспроизведение звука начала
    playStartSound();
    
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
            
            // ИСПРАВЛЕНИЕ: Гарантированное воспроизведение звука change
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
            
            // ИСПРАВЛЕНИЕ: Гарантированное воспроизведение первого звука таймера
            setTimeout(() => {
                animateTimerChange(timeLeft);
            }, 150); // Немного увеличили задержку
            
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
                // ИСПРАВЛЕНИЕ: Гарантированное воспроизведение каждого звука таймера
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
    
    // ИСПРАВЛЕНИЕ: Гарантированное воспроизведение звука выбора
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
        
        // Воспроизводим звуки результатов
        if (p === 100) {
            playSoundReliable('victory', state.volumes.victory);
        } else if (p >= 75) {
            playSoundReliable('vic', state.volumes.vic);
        } else {
            playSoundReliable('loss', state.volumes.loss);
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
    
    // ИСПРАВЛЕНИЕ: Гарантированное воспроизведение звука рестарта
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
        // ИСПРАВЛЕНИЕ: Сначала показываем загрузку
        elements.instruction.textContent = "Загрузка...";
        elements.instruction.classList.add('show');
        elements.startBtn.classList.add('hidden');
        elements.startBtn.disabled = true;
        elements.startBtn.style.opacity = '0.5';
        
        // Инициализируем аудио элементы
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
        
        // Настраиваем обработчики касаний
        setupTouchHandlers();
        console.log('✓ Обработчики касаний настроены');
        
        // Запускаем игру
        startIdle();
        console.log('✓ Игра запущена в режиме ожидания');
        
        // Агрессивная разблокировка аудио
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