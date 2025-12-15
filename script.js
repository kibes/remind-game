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
    debugMode: true, // Включаем отладку чтобы видеть что происходит
    timerSounds: [],
    canPressSpace: true,
    resultScreenVisible: false,
    chooseSoundInstances: [],
    changeSoundPlayed: false,
    startSoundPlayed: false,
    // Упрощаем: убираем сложную Web Audio логику
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    // Убираем Web Audio API - возвращаемся к простому подходу
    audioElements: {}, // Храним аудио элементы отдельно для быстрого доступа
    soundBuffers: {}, // Простые предзагруженные звуки
    lastSoundPlayTime: 0 // Время последнего звука
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

// Объект для хранения звуков - ВОЗВРАЩАЕМ ВСЕ ЗВУКИ
const audio = {
    start: null,
    choose: null,
    repeat: null,
    timer: null,
    timerEnd: null,
    change: null, // Это result.mp3
    victory: null,
    vic: null,
    loss: null
};

// ПРОСТАЯ функция создания аудио элемента для мобильных
function createAudioElement(src, volume = 1.0, preload = true) {
    try {
        const audioElement = new Audio();
        
        // Важные настройки для мобильных
        audioElement.preload = preload ? 'auto' : 'none';
        audioElement.src = src;
        audioElement.volume = Math.max(0.1, Math.min(1, volume)); // Минимум 0.1 чтобы было слышно
        audioElement.load(); // Принудительная загрузка
        
        // Сохраняем элемент для быстрого доступа
        const soundName = getSoundNameFromSrc(src);
        if (soundName) {
            state.audioElements[soundName] = audioElement;
        }
        
        return audioElement;
    } catch (error) {
        console.warn('Не удалось создать аудио элемент:', src, error);
        return null;
    }
}

// Получение имени звука из src
function getSoundNameFromSrc(src) {
    const matches = src.match(/\/([^\/]+)\.mp3$/);
    return matches ? matches[1] : null;
}

// Создаем несколько экземпляров для звука choose
function createChooseSoundInstances() {
    state.chooseSoundInstances = [];
    
    // Создаем 5 экземпляров для звука choose
    for (let i = 0; i < 5; i++) {
        const chooseSound = createAudioElement('sounds/choose.mp3', 1.0);
        if (chooseSound) {
            state.chooseSoundInstances.push({
                sound: chooseSound,
                isPlaying: false,
                lastPlayTime: 0
            });
        }
    }
}

// Создаем звуки таймера
function createTimerSounds() {
    state.timerSounds = [];
    
    for (let i = 0; i < 6; i++) {
        const timerSound = createAudioElement('sounds/timer.mp3', 1.0);
        if (timerSound) {
            state.timerSounds.push({
                sound: timerSound,
                isPlaying: false,
                lastPlayTime: 0
            });
        }
    }
}

// ПРЕДЗАГРУЗКА ВСЕХ ЗВУКОВ СРАЗУ (важно для мобильных)
function preloadAllSounds() {
    console.log('Начинаем предзагрузку всех звуков...');
    
    const soundsToPreload = [
        { name: 'start', src: 'sounds/start.mp3', volume: 1.0 },
        { name: 'choose', src: 'sounds/choose.mp3', volume: 1.0 },
        { name: 'repeat', src: 'sounds/repeat.mp3', volume: 1.0 },
        { name: 'timer', src: 'sounds/timer.mp3', volume: 1.0 },
        { name: 'change', src: 'sounds/result.mp3', volume: 1.0 }, // Это result.mp3
        { name: 'victory', src: 'sounds/victory.mp3', volume: 1.0 },
        { name: 'vic', src: 'sounds/vic.mp3', volume: 1.0 },
        { name: 'loss', src: 'sounds/loss.mp3', volume: 1.0 }
    ];
    
    // Создаем простые аудио элементы для предзагрузки
    soundsToPreload.forEach(sound => {
        try {
            const audioElement = new Audio();
            audioElement.preload = 'auto';
            audioElement.src = sound.src;
            audioElement.volume = sound.volume;
            
            // Сохраняем в буфер для быстрого доступа
            state.soundBuffers[sound.name] = {
                src: sound.src,
                volume: sound.volume,
                element: audioElement
            };
            
            // Начинаем загрузку
            audioElement.load();
            
            // Пытаемся воспроизвести короткий тихий звук чтобы "разбудить" аудио на мобильных
            if (state.isMobile) {
                setTimeout(() => {
                    try {
                        audioElement.volume = 0.01; // Почти беззвучно
                        audioElement.play().then(() => {
                            audioElement.pause();
                            audioElement.currentTime = 0;
                            audioElement.volume = sound.volume;
                        }).catch(() => {
                            // Игнорируем ошибки тихого воспроизведения
                        });
                    } catch (e) {
                        // Игнорируем ошибки
                    }
                }, 1000);
            }
            
        } catch (error) {
            console.warn(`Ошибка предзагрузки звука ${sound.name}:`, error);
        }
    });
    
    console.log('Предзагрузка звуков запущена');
}

// ОСНОВНАЯ функция воспроизведения звука (работает на всех устройствах)
function playSound(soundName, retryCount = 0) {
    if (!state.audioEnabled) {
        console.log('Аудио отключено, пропускаем:', soundName);
        return false;
    }
    
    if (!state.audioInitialized) {
        console.log('Аудио не инициализировано, пропускаем:', soundName);
        return false;
    }
    
    const maxRetries = state.isMobile ? 2 : 0; // Больше попыток для мобильных
    const now = Date.now();
    
    // Проверяем частоту воспроизведения (не чаще чем раз в 50мс для одного звука)
    if (now - state.lastSoundPlayTime < 50 && retryCount === 0) {
        setTimeout(() => playSound(soundName), 50);
        return false;
    }
    
    console.log(`Пробуем воспроизвести звук: ${soundName}, попытка: ${retryCount + 1}`);
    
    // Сначала пробуем основной аудио элемент
    const sound = audio[soundName];
    if (sound) {
        try {
            // Всегда сбрасываем время воспроизведения
            sound.currentTime = 0;
            
            // Устанавливаем громкость (важно для мобильных)
            sound.volume = state.isMobile ? 1.0 : (sound.volume || 1.0);
            
            // Пробуем воспроизвести
            const playPromise = sound.play();
            
            if (playPromise !== undefined) {
                return playPromise.then(() => {
                    console.log(`✓ Звук ${soundName} успешно воспроизведен`);
                    state.lastSoundPlayTime = now;
                    return true;
                }).catch(error => {
                    console.warn(`✗ Не удалось воспроизвести ${soundName}:`, error.message);
                    
                    // Для мобильных: пробуем еще раз через небольшой промежуток
                    if (retryCount < maxRetries) {
                        console.log(`Повторная попытка ${retryCount + 1} для ${soundName}`);
                        setTimeout(() => {
                            playSound(soundName, retryCount + 1);
                        }, 100 * (retryCount + 1));
                        return false;
                    }
                    
                    // Создаем новый элемент и пробуем через него
                    try {
                        const newSound = new Audio(sound.src);
                        newSound.volume = sound.volume;
                        newSound.play().catch(() => {});
                        state.lastSoundPlayTime = now;
                        return true;
                    } catch (e) {
                        console.warn(`Резервное воспроизведение ${soundName} не удалось:`, e);
                        return false;
                    }
                });
            } else {
                // Для старых браузеров
                try {
                    sound.play();
                    console.log(`✓ Звук ${soundName} воспроизведен (старый браузер)`);
                    state.lastSoundPlayTime = now;
                    return true;
                } catch (e) {
                    console.warn(`✗ ${soundName} не воспроизведен (старый браузер):`, e);
                    return false;
                }
            }
        } catch (error) {
            console.warn(`Ошибка при попытке воспроизвести ${soundName}:`, error);
            
            // Пробуем использовать предзагруженный буфер
            if (state.soundBuffers[soundName]) {
                try {
                    const bufferSound = new Audio(state.soundBuffers[soundName].src);
                    bufferSound.volume = state.soundBuffers[soundName].volume;
                    bufferSound.play().catch(() => {});
                    state.lastSoundPlayTime = now;
                    return true;
                } catch (e) {
                    // Игнорируем ошибки буфера
                }
            }
            
            return false;
        }
    } else {
        console.warn(`Звук не найден: ${soundName}`);
        return false;
    }
    
    return false;
}

// Улучшенная функция для звука choose
function playChooseSound() {
    if (!state.audioEnabled) return false;
    
    console.log('Воспроизведение choose звука');
    
    // Пробуем обычный playSound сначала
    if (playSound('choose')) {
        return true;
    }
    
    // Fallback к многоканальной системе
    if (state.chooseSoundInstances.length === 0) {
        return false;
    }
    
    const now = Date.now();
    let availableInstance = null;
    
    // Ищем доступный экземпляр
    for (const instance of state.chooseSoundInstances) {
        if (!instance.isPlaying && (now - instance.lastPlayTime > 50)) {
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
    
    try {
        availableInstance.sound.currentTime = 0;
        availableInstance.sound.volume = 1.0;
        availableInstance.isPlaying = true;
        availableInstance.lastPlayTime = now;
        
        availableInstance.sound.play().then(() => {
            console.log('✓ Choose звук воспроизведен через экземпляр');
            state.lastSoundPlayTime = now;
        }).catch(() => {
            availableInstance.isPlaying = false;
        });
        
        // Автоматический сброс флага
        setTimeout(() => {
            availableInstance.isPlaying = false;
        }, 300);
        
        return true;
    } catch (error) {
        console.warn('Ошибка воспроизведения choose через экземпляр:', error);
        availableInstance.isPlaying = false;
        return false;
    }
}

// Улучшенная функция для звука таймера
function playTimerSound(number) {
    if (!state.audioEnabled || number < 0) return;
    
    console.log(`Воспроизведение таймера: ${number}`);
    
    // Пробуем обычный playSound
    if (playSound('timer')) {
        return;
    }
    
    // Fallback к экземплярам
    try {
        if (state.timerSounds.length > 0 && number >= 0 && number <= 5) {
            const index = 5 - number;
            const timerInstance = state.timerSounds[index];
            
            if (timerInstance) {
                const now = Date.now();
                
                if (now - timerInstance.lastPlayTime < 50) return;
                
                timerInstance.sound.currentTime = 0;
                timerInstance.sound.volume = 1.0;
                timerInstance.isPlaying = true;
                timerInstance.lastPlayTime = now;
                
                timerInstance.sound.play().then(() => {
                    console.log(`✓ Таймер ${number} воспроизведен через экземпляр`);
                    state.lastSoundPlayTime = now;
                }).catch(() => {
                    timerInstance.isPlaying = false;
                });
                
                setTimeout(() => {
                    timerInstance.isPlaying = false;
                }, 300);
                
                return;
            }
        }
        
        // Последняя попытка: новый аудио элемент
        const newTimerSound = new Audio('sounds/timer.mp3');
        newTimerSound.volume = 1.0;
        newTimerSound.play().catch(() => {});
        state.lastSoundPlayTime = Date.now();
        
    } catch (error) {
        console.warn('Ошибка воспроизведения таймера:', error);
    }
}

// Инициализация всех звуков
function initAudio() {
    if (state.soundsLoaded) {
        console.log('Звуки уже загружены');
        return true;
    }
    
    console.log('Инициализация всех звуков...');
    
    try {
        // Создаем ВСЕ аудио элементы
        audio.start = createAudioElement('sounds/start.mp3', 1.0);
        audio.choose = createAudioElement('sounds/choose.mp3', 1.0);
        audio.repeat = createAudioElement('sounds/repeat.mp3', 1.0);
        audio.timer = createAudioElement('sounds/timer.mp3', 1.0);
        audio.timerEnd = createAudioElement('sounds/timer.mp3', 1.0);
        audio.change = createAudioElement('sounds/result.mp3', 1.0); // Это result.mp3
        audio.victory = createAudioElement('sounds/victory.mp3', 1.0);
        audio.vic = createAudioElement('sounds/vic.mp3', 1.0);
        audio.loss = createAudioElement('sounds/loss.mp3', 1.0);
        
        // Настраиваем звуки таймера
        if (audio.timer) audio.timer.playbackRate = 1.0;
        if (audio.timerEnd) audio.timerEnd.playbackRate = 1.0;
        
        // Создаем звуки таймера
        createTimerSounds();
        
        // Создаем экземпляры для choose
        createChooseSoundInstances();
        
        state.soundsLoaded = true;
        state.audioInitialized = true;
        
        console.log('✓ Все звуки успешно инициализированы');
        
        // На мобильных: "разогреваем" аудио систему
        if (state.isMobile) {
            setTimeout(() => {
                console.log('Разогрев аудио системы для мобильных...');
                // Пробуем тихое воспроизведение чтобы активировать аудио
                try {
                    const silentAudio = new Audio();
                    silentAudio.volume = 0.001;
                    silentAudio.play().then(() => {
                        silentAudio.pause();
                        console.log('✓ Аудио система активирована');
                    }).catch(e => {
                        console.log('Тихий звук не воспроизведен, но это нормально');
                    });
                } catch (e) {
                    // Игнорируем ошибки разогрева
                }
            }, 1000);
        }
        
        return true;
    } catch (error) {
        console.error('Ошибка инициализации звуков:', error);
        
        // Пробуем создать хотя бы основные звуки
        try {
            audio.start = new Audio('sounds/start.mp3');
            audio.choose = new Audio('sounds/choose.mp3');
            audio.timer = new Audio('sounds/timer.mp3');
            audio.change = new Audio('sounds/result.mp3');
            
            state.soundsLoaded = true;
            state.audioInitialized = true;
            console.log('✓ Основные звуки созданы (упрощенная инициализация)');
            return true;
        } catch (e) {
            console.error('Не удалось создать даже основные звуки:', e);
            return false;
        }
    }
}

// Принудительная активация аудио
function ensureAudio() {
    console.log('ensureAudio вызван, userInteracted:', state.userInteracted);
    
    if (!state.userInteracted) {
        state.userInteracted = true;
        console.log('✓ Первое взаимодействие пользователя');
        
        // Инициализируем звуки
        initAudio();
        
        // На мобильных: сразу пробуем проиграть тестовый звук
        if (state.isMobile && state.audioInitialized) {
            setTimeout(() => {
                console.log('Тестирование аудио на мобильном...');
                playSound('timer').then(success => {
                    if (success) {
                        console.log('✓ Тестовый звук воспроизведен успешно');
                    } else {
                        console.log('✗ Тестовый звук не воспроизведен');
                    }
                });
            }, 300);
        }
    } else if (!state.soundsLoaded) {
        console.log('Переинициализация звуков...');
        initAudio();
    }
}

// Остальные функции остаются в основном без изменений
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

// Начало игры - ВОЗВРАЩАЕМ ВСЕ ЗВУКИ
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
        console.log('Звук start.mp3 запущен');
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
                playSound('change'); // Теперь это result.mp3
                console.log('Звук change.mp3 (теперь result.mp3) запущен');
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
    console.log('Звук choose.mp3 запущен');
    
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

// Завершение игры - ВОЗВРАЩАЕМ ВСЕ ЗВУКИ РЕЗУЛЬТАТОВ
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
        
        // ВОЗВРАЩАЕМ ВСЕ ЗВУКИ РЕЗУЛЬТАТОВ
        if (p === 100) {
            playSound('victory');
            console.log('Звук victory.mp3 запущен');
        } else if (p >= 75) {
            playSound('vic');
            console.log('Звук vic.mp3 запущен');
        } else {
            playSound('loss');
            console.log('Звук loss.mp3 запущен');
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

// Сброс игры - ВОЗВРАЩАЕМ ЗВУК repeat
function reset() {
    if (state.resetBtnLock || state.isBusy) return;
    
    playSound('repeat');
    console.log('Звук repeat.mp3 запущен');
    
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
    console.log('Мобильное устройство:', state.isMobile);
    
    try {
        // Начинаем предзагрузку всех звуков СРАЗУ
        preloadAllSounds();
        
        // Загружаем изображения
        await loadImages();
        console.log('✓ Изображения загружены');
        
        // Telegram инициализация
        if (tg) {
            tg.ready();
            tg.expand();
            console.log('✓ Telegram WebApp инициализирован');
        }
        
        // Сразу создаем ВСЕ аудио элементы (не ждем user interaction)
        console.log('Создание всех аудио элементов...');
        
        audio.start = new Audio('sounds/start.mp3');
        audio.choose = new Audio('sounds/choose.mp3');
        audio.repeat = new Audio('sounds/repeat.mp3');
        audio.timer = new Audio('sounds/timer.mp3');
        audio.timerEnd = new Audio('sounds/timer.mp3');
        audio.change = new Audio('sounds/result.mp3');
        audio.victory = new Audio('sounds/victory.mp3');
        audio.vic = new Audio('sounds/vic.mp3');
        audio.loss = new Audio('sounds/loss.mp3');
        
        // Настраиваем
        audio.timer.volume = 1.0;
        audio.timerEnd.volume = 1.0;
        audio.timerEnd.playbackRate = 1.0;
        
        // Предзагружаем все звуки
        Object.values(audio).forEach(sound => {
            if (sound && typeof sound.load === 'function') {
                try {
                    sound.load();
                } catch (e) {
                    // Игнорируем ошибки загрузки
                }
            }
        });
        
        // Создаем звуки таймера и choose
        createTimerSounds();
        createChooseSoundInstances();
        
        state.soundsLoaded = true;
        state.audioInitialized = true;
        
        console.log('✓ Все аудио элементы созданы и предзагружены');
        
        // Запускаем игру
        startIdle();
        console.log('✓ Игра запущена в режиме ожидания');
        
        // Упрощенная активация аудио
        const activateOnInteraction = () => {
            if (!state.userInteracted) {
                console.log('✓ Активация аудио по взаимодействию');
                state.userInteracted = true;
                
                // На мобильных: пробуем "разбудить" аудио
                if (state.isMobile) {
                    setTimeout(() => {
                        console.log('Пробуем разбудить аудио на мобильном...');
                        // Тихий тестовый звук
                        try {
                            const testSound = new Audio('sounds/timer.mp3');
                            testSound.volume = 0.01;
                            testSound.play().then(() => {
                                testSound.pause();
                                console.log('✓ Аудио разбужено');
                            }).catch(() => {
                                console.log('Аудио не разбужено, но это нормально');
                            });
                        } catch (e) {
                            // Игнорируем ошибки
                        }
                    }, 100);
                }
            }
        };
        
        // Вешаем обработчики
        document.addEventListener('click', activateOnInteraction);
        document.addEventListener('touchstart', activateOnInteraction);
        document.addEventListener('keydown', activateOnInteraction);
        
        // Обработчики для видимости страницы
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden && state.isMobile && state.userInteracted) {
                // При возвращении на страницу пробуем восстановить аудио
                setTimeout(() => {
                    if (audio.timer) {
                        audio.timer.currentTime = 0;
                    }
                }, 100);
            }
        });
        
        console.log('=== ИГРА УСПЕШНО ЗАГРУЖЕНА ===');
        console.log('Аудио готово к воспроизведению');
        
    } catch (error) {
        console.error('Ошибка загрузки игры:', error);
        startIdle();
    }
};

// Экспортируем для отладки
window.playSound = playSound;
window.playTimerSound = playTimerSound;
window.playChooseSound = playChooseSound;
window.ensureAudio = ensureAudio;