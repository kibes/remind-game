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
    // Определение платформы
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    // Флаги для iOS
    audioUnlocked: false,
    audioContext: null,
    // Хранилища звуков
    audioBuffers: {},
    soundElements: {},
    // iOS-specific оптимизации
    iosAudioQueue: [], // Очередь звуков для iOS
    isPlayingQueue: false,
    lastAudioPlayTime: 0
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
// iOS-SPECIFIC ОПТИМИЗАЦИИ
// ============================

// Инициализация AudioContext для iOS (Web Audio API работает лучше)
function initAudioContext() {
    if (!state.isIOS) return null;
    
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        
        state.audioContext = new AudioContext();
        console.log('✓ AudioContext создан для iOS');
        return state.audioContext;
    } catch (error) {
        console.warn('AudioContext не доступен на iOS:', error);
        return null;
    }
}

// Загрузка звука в буфер AudioContext (лучше для iOS)
function loadAudioBuffer(url, soundName) {
    if (!state.audioContext || !state.isIOS) return Promise.resolve(null);
    
    return new Promise((resolve) => {
        // Проверяем, не загружен ли уже
        if (state.audioBuffers[soundName]) {
            resolve(state.audioBuffers[soundName]);
            return;
        }
        
        fetch(url)
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => state.audioContext.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                state.audioBuffers[soundName] = audioBuffer;
                console.log(`✓ Звук ${soundName} загружен в AudioBuffer`);
                resolve(audioBuffer);
            })
            .catch(error => {
                console.warn(`Ошибка загрузки AudioBuffer ${soundName}:`, error);
                resolve(null);
            });
    });
}

// Воспроизведение через AudioContext (работает лучше на iOS)
function playAudioBuffer(soundName) {
    if (!state.audioContext || !state.audioBuffers[soundName]) return false;
    
    try {
        const source = state.audioContext.createBufferSource();
        const gainNode = state.audioContext.createGain();
        
        source.buffer = state.audioBuffers[soundName];
        gainNode.gain.value = 1.0;
        
        source.connect(gainNode);
        gainNode.connect(state.audioContext.destination);
        
        source.start(0);
        
        // Очистка
        source.onended = () => {
            source.disconnect();
            gainNode.disconnect();
        };
        
        return true;
    } catch (error) {
        console.warn(`Ошибка воспроизведения AudioBuffer ${soundName}:`, error);
        return false;
    }
}

// Очередь звуков для iOS (предотвращает конфликты)
function addToIOSQueue(soundName, playFunction) {
    if (!state.isIOS) {
        playFunction();
        return;
    }
    
    state.iosAudioQueue.push({ soundName, playFunction });
    
    if (!state.isPlayingQueue) {
        processIOSQueue();
    }
}

function processIOSQueue() {
    if (state.iosAudioQueue.length === 0) {
        state.isPlayingQueue = false;
        return;
    }
    
    state.isPlayingQueue = true;
    const now = Date.now();
    
    // Задержка между звуками на iOS
    if (now - state.lastAudioPlayTime < 100) {
        setTimeout(processIOSQueue, 100 - (now - state.lastAudioPlayTime));
        return;
    }
    
    const { soundName, playFunction } = state.iosAudioQueue.shift();
    
    console.log(`iOS очередь: воспроизведение ${soundName}`);
    
    // Пробуем воспроизвести
    playFunction();
    state.lastAudioPlayTime = Date.now();
    
    // Следующий звук через 50мс
    setTimeout(processIOSQueue, 50);
}

// ============================
// ОСНОВНЫЕ ФУНКЦИИ АУДИО
// ============================

// Создание аудио элемента с оптимизацией для iOS
function createAudioElement(src, soundName) {
    try {
        const audioElement = new Audio();
        
        // iOS требует особых настроек
        if (state.isIOS) {
            // Важно для iOS:
            audioElement.preload = 'metadata'; // metadata вместо auto
            audioElement.playsInline = true; // Критически важно для iOS!
            audioElement.webkitPlaysInline = true; // Для старых iOS
            audioElement.setAttribute('playsinline', 'true'); // Атрибут для Safari
            audioElement.setAttribute('webkit-playsinline', 'true'); // Для WebKit
            
            // Отключаем управление
            audioElement.controls = false;
            audioElement.style.display = 'none';
        } else {
            audioElement.preload = 'auto';
        }
        
        audioElement.src = src;
        
        // Сохраняем
        state.soundElements[soundName] = audioElement;
        audio[soundName] = audioElement;
        
        // События для отладки
        audioElement.addEventListener('loadeddata', () => {
            console.log(`✓ ${soundName} загружен`);
        });
        
        audioElement.addEventListener('error', (e) => {
            console.warn(`✗ Ошибка ${soundName}:`, e.target.error);
        });
        
        // Принудительная загрузка (кроме iOS)
        if (!state.isIOS) {
            audioElement.load();
        }
        
        console.log(`Аудио элемент создан: ${soundName}`);
        return audioElement;
    } catch (error) {
        console.warn(`Ошибка создания ${soundName}:`, error);
        return null;
    }
}

// Создание экземпляров для choose
function createChooseSoundInstances() {
    state.chooseSoundInstances = [];
    
    // Больше экземпляров для iOS
    const instanceCount = state.isIOS ? 8 : 5;
    
    for (let i = 0; i < instanceCount; i++) {
        const chooseSound = createAudioElement('sounds/choose.mp3', `choose_${i}`);
        if (chooseSound) {
            state.chooseSoundInstances.push({
                sound: chooseSound,
                isPlaying: false,
                lastPlayTime: 0
            });
        }
    }
}

// Создание звуков таймера
function createTimerSounds() {
    state.timerSounds = [];
    
    const instanceCount = state.isIOS ? 10 : 6;
    
    for (let i = 0; i < instanceCount; i++) {
        const timerSound = createAudioElement('sounds/timer.mp3', `timer_${i}`);
        if (timerSound) {
            state.timerSounds.push({
                sound: timerSound,
                isPlaying: false,
                lastPlayTime: 0
            });
        }
    }
}

// Инициализация всех аудио элементов
function initAudioElements() {
    console.log('Инициализация аудио элементов...');
    console.log('Платформа:', state.isIOS ? 'iOS' : 'Desktop/Android');
    
    // Инициализируем AudioContext для iOS
    if (state.isIOS) {
        initAudioContext();
    }
    
    // Создаем основные звуки
    const sounds = [
        ['sounds/start.mp3', 'start'],
        ['sounds/choose.mp3', 'choose'],
        ['sounds/repeat.mp3', 'repeat'],
        ['sounds/timer.mp3', 'timer'],
        ['sounds/timer.mp3', 'timerEnd'],
        ['sounds/result.mp3', 'change'],
        ['sounds/victory.mp3', 'victory'],
        ['sounds/vic.mp3', 'vic'],
        ['sounds/loss.mp3', 'loss']
    ];
    
    sounds.forEach(([src, name]) => {
        createAudioElement(src, name);
    });
    
    // Создаем экземпляры
    createChooseSoundInstances();
    createTimerSounds();
    
    state.soundsLoaded = true;
    console.log('✓ Все аудио элементы созданы');
    
    // Предзагрузка в AudioContext для iOS
    if (state.isIOS && state.audioContext) {
        setTimeout(() => {
            console.log('Предзагрузка звуков в AudioContext для iOS...');
            ['timer', 'choose', 'start'].forEach(soundName => {
                const element = state.soundElements[soundName];
                if (element) {
                    loadAudioBuffer(element.src, soundName);
                }
            });
        }, 500);
    }
}

// Разблокировка аудио системы (особенно важно для iOS)
function unlockAudioSystem() {
    if (state.audioUnlocked) {
        console.log('Аудио уже разблокировано');
        return Promise.resolve();
    }
    
    console.log('=== РАЗБЛОКИРОВКА АУДИО СИСТЕМЫ ===');
    console.log('iOS:', state.isIOS);
    console.log('Safari:', state.isSafari);
    
    return new Promise((resolve) => {
        state.audioUnlocked = true;
        state.userInteracted = true;
        
        // Для iOS: возобновляем AudioContext
        if (state.isIOS && state.audioContext && state.audioContext.state === 'suspended') {
            state.audioContext.resume().then(() => {
                console.log('✓ AudioContext возобновлен на iOS');
            }).catch(console.warn);
        }
        
        // "Разогрев" аудио на iOS
        if (state.isIOS) {
            warmUpIOSAudio().then(() => {
                console.log('✓ iOS аудио разогрето');
                state.audioInitialized = true;
                resolve(true);
            }).catch(() => {
                state.audioInitialized = true;
                resolve(true);
            });
        } else {
            state.audioInitialized = true;
            resolve(true);
        }
    });
}

// "Разогрев" аудио на iOS (тихое воспроизведение)
function warmUpIOSAudio() {
    return new Promise((resolve) => {
        if (!state.isIOS) {
            resolve();
            return;
        }
        
        console.log('Разогрев аудио на iOS...');
        
        // Пробуем тихое воспроизведение
        try {
            const silentAudio = new Audio();
            silentAudio.volume = 0.001;
            silentAudio.src = 'sounds/timer.mp3';
            silentAudio.play().then(() => {
                silentAudio.pause();
                silentAudio.currentTime = 0;
                console.log('✓ iOS аудио разогрето (тихий звук)');
                resolve();
            }).catch(error => {
                console.log('Тихий звук не сработал:', error.message);
                
                // Альтернатива: touch event
                document.dispatchEvent(new TouchEvent('touchstart', {
                    touches: [new Touch({ identifier: 1, target: document.body })]
                }));
                
                setTimeout(resolve, 100);
            });
        } catch (error) {
            console.warn('Ошибка разогрева iOS:', error);
            setTimeout(resolve, 100);
        }
    });
}

// Основная функция воспроизведения с оптимизацией для iOS
function playSound(soundName, retryCount = 0) {
    if (!state.audioEnabled || !state.audioInitialized) {
        console.log(`Аудио не готово для ${soundName}`);
        return false;
    }
    
    const maxRetries = state.isIOS ? 3 : 1;
    const now = Date.now();
    
    // Частотный лимит для iOS
    if (state.isIOS && now - state.lastAudioPlayTime < 30 && retryCount === 0) {
        setTimeout(() => playSound(soundName, retryCount), 30);
        return false;
    }
    
    console.log(`Воспроизведение ${soundName} (iOS: ${state.isIOS}, попытка ${retryCount + 1})`);
    
    // Для iOS добавляем в очередь
    if (state.isIOS) {
        addToIOSQueue(soundName, () => {
            actuallyPlaySound(soundName, retryCount);
        });
        return true;
    } else {
        return actuallyPlaySound(soundName, retryCount);
    }
}

// Фактическое воспроизведение звука
function actuallyPlaySound(soundName, retryCount = 0) {
    const maxRetries = state.isIOS ? 3 : 1;
    
    // Пробуем AudioContext для iOS
    if (state.isIOS && state.audioContext && state.audioBuffers[soundName]) {
        if (playAudioBuffer(soundName)) {
            console.log(`✓ ${soundName} через AudioContext`);
            state.lastAudioPlayTime = Date.now();
            return true;
        }
    }
    
    // Получаем аудио элемент
    const sound = audio[soundName] || state.soundElements[soundName];
    
    if (!sound) {
        console.warn(`Звук не найден: ${soundName}`);
        
        // Создаем на лету для iOS
        if (state.isIOS && retryCount === 0) {
            createAudioElement(`sounds/${soundName}.mp3`, soundName);
            setTimeout(() => playSound(soundName, retryCount + 1), 100);
        }
        return false;
    }
    
    try {
        // iOS: проверяем, не воспроизводится ли уже
        if (state.isIOS && !sound.paused) {
            if (retryCount < maxRetries) {
                setTimeout(() => actuallyPlaySound(soundName, retryCount + 1), 50 * (retryCount + 1));
            }
            return false;
        }
        
        // Сбрасываем и настраиваем
        sound.currentTime = 0;
        sound.volume = 1.0;
        
        // iOS: playsinline критически важно
        if (state.isIOS) {
            sound.setAttribute('playsinline', 'true');
            sound.setAttribute('webkit-playsinline', 'true');
        }
        
        const playPromise = sound.play();
        
        if (playPromise !== undefined) {
            return playPromise.then(() => {
                console.log(`✓ ${soundName} воспроизведен`);
                state.lastAudioPlayTime = Date.now();
                return true;
            }).catch(error => {
                console.warn(`✗ ${soundName} ошибка:`, error.name, error.message);
                
                // iOS-specific ошибки
                if (state.isIOS) {
                    if (error.name === 'NotAllowedError') {
                        console.log('iOS: Аудио заблокировано, пробуем разблокировать');
                        unlockAudioSystem().then(() => {
                            setTimeout(() => playSound(soundName, retryCount + 1), 100);
                        });
                    } else if (retryCount < maxRetries) {
                        // iOS часто требует повторных попыток
                        setTimeout(() => actuallyPlaySound(soundName, retryCount + 1), 100 * (retryCount + 1));
                    } else {
                        // Последняя попытка для iOS: создаем новый элемент
                        try {
                            const newSound = new Audio(sound.src);
                            newSound.volume = 1.0;
                            newSound.setAttribute('playsinline', 'true');
                            newSound.setAttribute('webkit-playsinline', 'true');
                            newSound.play().catch(() => {});
                            console.log(`✓ ${soundName} через новый элемент`);
                            state.lastAudioPlayTime = Date.now();
                            return true;
                        } catch (e) {
                            console.warn(`iOS: финальная попытка не удалась:`, e);
                        }
                    }
                } else if (retryCount < maxRetries) {
                    setTimeout(() => actuallyPlaySound(soundName, retryCount + 1), 100);
                }
                
                return false;
            });
        } else {
            // Старые браузеры
            try {
                sound.play();
                console.log(`✓ ${soundName} (старый браузер)`);
                state.lastAudioPlayTime = Date.now();
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
}

// Улучшенная функция для звука choose
function playChooseSound() {
    if (!state.audioInitialized) {
        unlockAudioSystem().then(() => {
            setTimeout(playChooseSound, 100);
        });
        return false;
    }
    
    // Для iOS: используем очередь
    if (state.isIOS) {
        addToIOSQueue('choose', () => {
            actuallyPlayChooseSound();
        });
        return true;
    }
    
    return actuallyPlayChooseSound();
}

function actuallyPlayChooseSound() {
    // Пробуем основной звук
    if (playSound('choose')) {
        return true;
    }
    
    // Fallback к экземплярам
    if (state.chooseSoundInstances.length > 0) {
        const now = Date.now();
        let availableInstance = null;
        
        // Ищем доступный экземпляр
        for (const instance of state.chooseSoundInstances) {
            if (!instance.isPlaying && (now - instance.lastPlayTime > (state.isIOS ? 100 : 50))) {
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
            
            // iOS проверки
            if (state.isIOS && !sound.paused) {
                return false;
            }
            
            sound.currentTime = 0;
            sound.volume = 1.0;
            
            if (state.isIOS) {
                sound.setAttribute('playsinline', 'true');
                sound.setAttribute('webkit-playsinline', 'true');
            }
            
            availableInstance.isPlaying = true;
            availableInstance.lastPlayTime = now;
            
            sound.play().then(() => {
                console.log('✓ Choose через экземпляр');
                state.lastAudioPlayTime = now;
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
            return false;
        }
    }
    
    return false;
}

// Улучшенная функция для звука таймера
function playTimerSound(number) {
    if (number < 0) return;
    
    if (!state.audioInitialized) {
        unlockAudioSystem().then(() => {
            setTimeout(() => playTimerSound(number), 100);
        });
        return;
    }
    
    // Для iOS: используем очередь
    if (state.isIOS) {
        addToIOSQueue(`timer_${number}`, () => {
            actuallyPlayTimerSound(number);
        });
        return;
    }
    
    actuallyPlayTimerSound(number);
}

function actuallyPlayTimerSound(number) {
    // Пробуем основной звук
    if (playSound('timer')) {
        return;
    }
    
    // Fallback к экземплярам
    try {
        if (state.timerSounds.length > 0 && number >= 0 && number <= 5) {
            const index = Math.min(number, state.timerSounds.length - 1);
            const timerInstance = state.timerSounds[index];
            
            if (timerInstance) {
                const now = Date.now();
                const sound = timerInstance.sound;
                
                // iOS проверки
                if (state.isIOS && (now - timerInstance.lastPlayTime < 100 || !sound.paused)) {
                    return;
                }
                
                sound.currentTime = 0;
                sound.volume = 1.0;
                
                if (state.isIOS) {
                    sound.setAttribute('playsinline', 'true');
                    sound.setAttribute('webkit-playsinline', 'true');
                }
                
                timerInstance.isPlaying = true;
                timerInstance.lastPlayTime = now;
                
                sound.play().then(() => {
                    console.log(`✓ Таймер ${number} через экземпляр`);
                    state.lastAudioPlayTime = now;
                }).catch(error => {
                    console.warn(`Таймер ${number} ошибка:`, error);
                    timerInstance.isPlaying = false;
                });
                
                setTimeout(() => {
                    timerInstance.isPlaying = false;
                }, 300);
                
                return;
            }
        }
        
        // Последняя попытка
        if (state.audioInitialized) {
            const newSound = new Audio('sounds/timer.mp3');
            newSound.volume = 1.0;
            
            if (state.isIOS) {
                newSound.setAttribute('playsinline', 'true');
                newSound.setAttribute('webkit-playsinline', 'true');
            }
            
            newSound.play().catch(() => {});
            state.lastAudioPlayTime = Date.now();
        }
        
    } catch (error) {
        console.warn('Ошибка таймера:', error);
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

// Обработчики для iOS - более агрессивные
document.addEventListener('touchstart', function(e) {
    ensureAudio();
    
    // iOS: дополнительный touch для активации
    if (state.isIOS && !state.audioUnlocked) {
        document.dispatchEvent(new Event('click'));
    }
    
    if (e.target.tagName === 'BUTTON') {
        e.target.style.transform = 'scale(0.97)';
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
    console.log('iOS:', state.isIOS);
    console.log('Safari:', state.isSafari);
    console.log('User Agent:', navigator.userAgent);
    
    try {
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
        
        // Запускаем игру
        startIdle();
        console.log('✓ Игра запущена в режиме ожидания');
        
        // Агрессивная разблокировка аудио для iOS
        const unlockOnAnyInteraction = () => {
            if (!state.audioUnlocked) {
                console.log('iOS: обнаружено взаимодействие, разблокируем аудио');
                unlockAudioSystem();
            }
        };
        
        // Много обработчиков для iOS
        document.addEventListener('click', unlockOnAnyInteraction);
        document.addEventListener('touchstart', unlockOnAnyInteraction);
        document.addEventListener('mousedown', unlockOnAnyInteraction);
        document.addEventListener('pointerdown', unlockOnAnyInteraction);
        
        // iOS: симулируем клик для активации
        if (state.isIOS) {
            setTimeout(() => {
                if (!state.audioUnlocked) {
                    console.log('iOS: автоматическая активация аудио');
                    document.body.click();
                    unlockAudioSystem();
                }
            }, 500);
        }
        
        console.log('=== ИГРА УСПЕШНО ЗАГРУЖЕНА ===');
        
    } catch (error) {
        console.error('Ошибка загрузки игры:', error);
        startIdle();
    }
};