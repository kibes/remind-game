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
    // Новые флаги для HTTPS/серверных проблем
    isHttps: window.location.protocol === 'https:',
    audioUnlocked: false, // Флаг разблокировки аудио
    soundElements: {}, // Храним аудио элементы отдельно
    soundPromises: {} // Промисы для загрузки звуков
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
    change: null, // Это result.mp3
    victory: null,
    vic: null,
    loss: null
};

// Создаем и загружаем аудио элемент С ПРАВИЛЬНЫМИ НАСТРОЙКАМИ для HTTPS
function createAndLoadAudio(src, soundName) {
    return new Promise((resolve) => {
        try {
            console.log(`Создание аудио элемента для: ${soundName}`);
            
            const audioElement = new Audio();
            
            // КРИТИЧЕСКИ ВАЖНО для HTTPS:
            // 1. Не устанавливаем src сразу
            // 2. Не вызываем load() до user interaction
            // 3. Используем относительный путь
            
            // Настраиваем элемент
            audioElement.preload = 'none'; // Меняем на 'none' для HTTPS!
            audioElement.controls = false;
            
            // Сохраняем путь, но не устанавливаем src
            audioElement.dataset.src = src;
            audioElement.dataset.name = soundName;
            
            // Сохраняем в разных местах для доступа
            state.soundElements[soundName] = audioElement;
            audio[soundName] = audioElement;
            
            console.log(`Аудио элемент ${soundName} создан (ожидает загрузки)`);
            resolve(audioElement);
            
        } catch (error) {
            console.warn(`Ошибка создания аудио элемента ${soundName}:`, error);
            resolve(null);
        }
    });
}

// Функция ЗАГРУЗКИ аудио (только после user interaction!)
function loadAudioElement(soundName) {
    const audioElement = state.soundElements[soundName];
    if (!audioElement || audioElement.src) {
        return Promise.resolve(); // Уже загружен
    }
    
    return new Promise((resolve) => {
        try {
            const src = audioElement.dataset.src;
            console.log(`Загрузка аудио: ${soundName} из ${src}`);
            
            // Устанавливаем src и загружаем ТОЛЬКО СЕЙЧАС
            audioElement.src = src;
            
            // События загрузки
            const onCanPlay = () => {
                console.log(`✓ Аудио ${soundName} готово к воспроизведению`);
                audioElement.removeEventListener('canplay', onCanPlay);
                audioElement.removeEventListener('error', onError);
                resolve(true);
            };
            
            const onError = (e) => {
                console.warn(`✗ Ошибка загрузки аудио ${soundName}:`, e);
                audioElement.removeEventListener('canplay', onCanPlay);
                audioElement.removeEventListener('error', onError);
                resolve(false);
            };
            
            audioElement.addEventListener('canplay', onCanPlay, { once: true });
            audioElement.addEventListener('error', onError, { once: true });
            
            // Начинаем загрузку
            audioElement.load();
            
        } catch (error) {
            console.warn(`Ошибка при загрузке ${soundName}:`, error);
            resolve(false);
        }
    });
}

// Создаем несколько экземпляров для звука choose
function createChooseSoundInstances() {
    state.chooseSoundInstances = [];
    
    // Создаем 5 экземпляров для звука choose
    for (let i = 0; i < 5; i++) {
        createAndLoadAudio('sounds/choose.mp3', `choose_${i}`).then(chooseSound => {
            if (chooseSound) {
                state.chooseSoundInstances.push({
                    sound: chooseSound,
                    isPlaying: false,
                    lastPlayTime: 0
                });
            }
        });
    }
}

// Создаем звуки таймера
function createTimerSounds() {
    state.timerSounds = [];
    
    for (let i = 0; i < 6; i++) {
        createAndLoadAudio('sounds/timer.mp3', `timer_${i}`).then(timerSound => {
            if (timerSound) {
                state.timerSounds.push({
                    sound: timerSound,
                    isPlaying: false,
                    lastPlayTime: 0
                });
            }
        });
    }
}

// Инициализация ВСЕХ аудио элементов (без загрузки)
function initAudioElements() {
    console.log('Инициализация всех аудио элементов...');
    
    // Создаем промисы для всех звуков
    const soundPromises = [
        createAndLoadAudio('sounds/start.mp3', 'start'),
        createAndLoadAudio('sounds/choose.mp3', 'choose'),
        createAndLoadAudio('sounds/repeat.mp3', 'repeat'),
        createAndLoadAudio('sounds/timer.mp3', 'timer'),
        createAndLoadAudio('sounds/timer.mp3', 'timerEnd'),
        createAndLoadAudio('sounds/result.mp3', 'change'), // Это result.mp3
        createAndLoadAudio('sounds/victory.mp3', 'victory'),
        createAndLoadAudio('sounds/vic.mp3', 'vic'),
        createAndLoadAudio('sounds/loss.mp3', 'loss')
    ];
    
    Promise.all(soundPromises).then(() => {
        state.soundsLoaded = true;
        console.log('✓ Все аудио элементы созданы (ожидают загрузки)');
        
        // Создаем экземпляры для choose и timer
        createChooseSoundInstances();
        createTimerSounds();
        
        // Загружаем КРИТИЧЕСКИ ВАЖНЫЕ звуки СРАЗУ (те, что работали)
        if (state.audioUnlocked) {
            loadCriticalSounds();
        }
    });
}

// Загружаем критические звуки которые уже работали
function loadCriticalSounds() {
    console.log('Загрузка критических звуков...');
    
    // Звуки, которые уже работали
    const criticalSounds = ['timer', 'choose'];
    
    criticalSounds.forEach(soundName => {
        if (state.soundElements[soundName]) {
            loadAudioElement(soundName);
        }
    });
}

// РАЗБЛОКИРОВКА аудио системы (после user interaction)
function unlockAudioSystem() {
    if (state.audioUnlocked) {
        console.log('Аудио уже разблокировано');
        return Promise.resolve();
    }
    
    console.log('=== РАЗБЛОКИРОВКА АУДИО СИСТЕМЫ ===');
    console.log('HTTPS:', state.isHttps);
    console.log('User interacted:', state.userInteracted);
    
    return new Promise((resolve) => {
        state.audioUnlocked = true;
        state.userInteracted = true;
        
        // Загружаем ВСЕ звуки после user interaction
        const loadPromises = [];
        
        for (const soundName in state.soundElements) {
            if (state.soundElements[soundName]) {
                loadPromises.push(loadAudioElement(soundName));
            }
        }
        
        Promise.all(loadPromises).then(() => {
            console.log('✓ Все звуки загружены и готовы');
            state.audioInitialized = true;
            resolve(true);
        });
    });
}

// Улучшенная функция воспроизведения звука для HTTPS
function playSound(soundName, retryCount = 0) {
    // Если аудио не разблокировано, пробуем разблокировать
    if (!state.audioUnlocked) {
        console.log(`Аудио заблокировано, пытаемся разблокировать для ${soundName}`);
        unlockAudioSystem().then(() => {
            // Пробуем еще раз после разблокировки
            setTimeout(() => playSound(soundName, retryCount), 100);
        });
        return false;
    }
    
    const maxRetries = 2;
    const now = Date.now();
    
    console.log(`Попытка воспроизвести: ${soundName} (попытка ${retryCount + 1})`);
    
    // Получаем аудио элемент
    const sound = audio[soundName] || state.soundElements[soundName];
    
    if (!sound) {
        console.warn(`Аудио элемент не найден: ${soundName}`);
        
        // Пробуем создать на лету для критических звуков
        if (retryCount === 0) {
            createAndLoadAudio(`sounds/${soundName}.mp3`, soundName).then(() => {
                setTimeout(() => playSound(soundName, retryCount + 1), 100);
            });
        }
        return false;
    }
    
    try {
        // Проверяем, загружен ли звук
        if (!sound.src && sound.dataset.src) {
            console.log(`Звук ${soundName} не загружен, загружаем...`);
            loadAudioElement(soundName).then(() => {
                setTimeout(() => playSound(soundName, retryCount + 1), 100);
            });
            return false;
        }
        
        // Сбрасываем и воспроизводим
        sound.currentTime = 0;
        sound.volume = 1.0;
        
        const playPromise = sound.play();
        
        if (playPromise !== undefined) {
            return playPromise.then(() => {
                console.log(`✓ Звук ${soundName} воспроизведен успешно`);
                return true;
            }).catch(error => {
                console.warn(`✗ Ошибка воспроизведения ${soundName}:`, error.message);
                
                // Особые случаи для HTTPS
                if (error.name === 'NotAllowedError') {
                    console.log('Аудио заблокировано браузером, требуется взаимодействие');
                    return false;
                }
                
                // Пробуем еще раз
                if (retryCount < maxRetries) {
                    setTimeout(() => playSound(soundName, retryCount + 1), 200 * (retryCount + 1));
                } else {
                    // Последняя попытка: создаем новый элемент
                    try {
                        const newSound = new Audio(sound.src);
                        newSound.volume = 1.0;
                        newSound.play().catch(() => {});
                        console.log(`Звук ${soundName} воспроизведен через новый элемент`);
                        return true;
                    } catch (e) {
                        console.warn(`Резервное воспроизведение не удалось:`, e);
                        return false;
                    }
                }
                return false;
            });
        } else {
            // Старые браузеры
            try {
                sound.play();
                console.log(`✓ Звук ${soundName} воспроизведен (старый браузер)`);
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
    if (!state.audioUnlocked) {
        unlockAudioSystem().then(() => {
            setTimeout(playChooseSound, 100);
        });
        return false;
    }
    
    // Сначала пробуем основной choose звук
    if (playSound('choose')) {
        return true;
    }
    
    // Fallback к экземплярам
    if (state.chooseSoundInstances.length > 0) {
        const now = Date.now();
        let availableInstance = null;
        
        for (const instance of state.chooseSoundInstances) {
            if (!instance.isPlaying && (now - instance.lastPlayTime > 50)) {
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
            
            // Проверяем загрузку
            if (!sound.src && sound.dataset.src) {
                loadAudioElement(availableInstance.sound.dataset.name).then(() => {
                    playChooseSound();
                });
                return false;
            }
            
            sound.currentTime = 0;
            sound.volume = 1.0;
            availableInstance.isPlaying = true;
            availableInstance.lastPlayTime = now;
            
            sound.play().then(() => {
                console.log('✓ Choose звук воспроизведен через экземпляр');
            }).catch(() => {
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
    if (!state.audioUnlocked || number < 0) {
        if (!state.audioUnlocked) {
            unlockAudioSystem();
        }
        return;
    }
    
    // Пробуем основной timer звук
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
                const sound = timerInstance.sound;
                
                // Проверяем загрузку
                if (!sound.src && sound.dataset.src) {
                    loadAudioElement(timerInstance.sound.dataset.name);
                    return;
                }
                
                if (now - timerInstance.lastPlayTime < 50) return;
                
                sound.currentTime = 0;
                sound.volume = 1.0;
                timerInstance.isPlaying = true;
                timerInstance.lastPlayTime = now;
                
                sound.play().then(() => {
                    console.log(`✓ Таймер ${number} через экземпляр`);
                }).catch(() => {
                    timerInstance.isPlaying = false;
                });
                
                setTimeout(() => {
                    timerInstance.isPlaying = false;
                }, 300);
                
                return;
            }
        }
        
        // Последняя попытка
        if (state.audioUnlocked) {
            const newSound = new Audio('sounds/timer.mp3');
            newSound.volume = 1.0;
            newSound.play().catch(() => {});
        }
        
    } catch (error) {
        console.warn('Ошибка таймера:', error);
    }
}

// Принудительная активация аудио
function ensureAudio() {
    console.log('ensureAudio вызван');
    
    // Всегда пробуем разблокировать
    unlockAudioSystem().then(() => {
        console.log('✓ Аудио система разблокирована');
    });
}

// Остальные функции остаются практически без изменений
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

// Обработчики для мобильных - ВАЖНО: разблокируем аудио
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
    console.log('Протокол:', window.location.protocol);
    console.log('HTTPS:', state.isHttps);
    
    try {
        // Создаем аудио элементы СРАЗУ (но не загружаем!)
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
        
        // Агрессивная разблокировка аудио при ЛЮБОМ взаимодействии
        const unlockOnAnyInteraction = () => {
            if (!state.audioUnlocked) {
                console.log('Обнаружено взаимодействие, разблокируем аудио...');
                unlockAudioSystem();
            }
        };
        
        // Много обработчиков для гарантированной разблокировки
        document.addEventListener('click', unlockOnAnyInteraction);
        document.addEventListener('touchstart', unlockOnAnyInteraction);
        document.addEventListener('mousedown', unlockOnAnyInteraction);
        document.addEventListener('keydown', unlockOnAnyInteraction);
        document.addEventListener('pointerdown', unlockOnAnyInteraction);
        
        // Также пробуем разблокировать при загрузке (на случай если уже было взаимодействие)
        setTimeout(() => {
            if (!state.audioUnlocked) {
                console.log('Пробуем разблокировать аудио автоматически...');
                unlockAudioSystem();
            }
        }, 1000);
        
        console.log('=== ИГРА УСПЕШНО ЗАГРУЖЕНА ===');
        console.log('Аудио элементы созданы, ожидают разблокировки');
        
    } catch (error) {
        console.error('Ошибка загрузки игры:', error);
        startIdle();
    }
};