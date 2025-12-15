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
    debugMode: false, // Убрал отладку для чистоты
    timerSounds: [], // Массив для звуков таймера
    canPressSpace: true, // Разрешение на нажатие пробела
    resultScreenVisible: false, // Видимость экрана результатов
    chooseSoundInstances: [], // Массив экземпляров для звука choose
    changeSoundPlayed: false, // Флаг для отслеживания воспроизведения change.mp3
    startSoundPlayed: false, // Флаг для отслеживания воспроизведения start.mp3
    audioBufferLoaded: false // Новый флаг: загружен ли аудио буфер
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

// Объект для хранения звуков (next.mp3 удален)
const audio = {
    start: null,
    choose: null,
    repeat: null,
    timer: null, // Основной звук таймера
    timerEnd: null, // Звук окончания таймера
    change: null, // Теперь это result.mp3
    // УДАЛЕНО: next: null,
    // УДАЛЕНО: result: null,
    victory: null,
    vic: null,
    loss: null
};

// Создаем несколько экземпляров для звука choose чтобы избежать обрезания
function createChooseSoundInstances() {
    state.chooseSoundInstances = [];
    
    // Создаем 3 экземпляра для звука choose
    for (let i = 0; i < 3; i++) {
        const chooseSound = new Audio('sounds/choose.mp3');
        chooseSound.preload = 'auto';
        chooseSound.volume = 1.0;
        
        try {
            chooseSound.load();
        } catch (e) {
            console.warn('Ошибка загрузки choose звука:', e);
        }
        
        state.chooseSoundInstances.push({
            sound: chooseSound,
            isPlaying: false,
            lastPlayTime: 0
        });
    }
}

// Создаем звуки таймера без тональности (одинаковые)
function createTimerSounds() {
    state.timerSounds = [];
    
    // Создаем 6 звуков таймера (от 5 до 0) - все одинаковые
    for (let i = 0; i < 6; i++) {
        const timerSound = new Audio('sounds/timer.mp3');
        timerSound.preload = 'auto';
        timerSound.volume = 1.0; // Максимальная громкость
        timerSound.playbackRate = 1.0; // Одинаковая скорость для всех!
        
        // Пытаемся предзагрузить
        try {
            timerSound.load();
        } catch (e) {
            console.warn('Ошибка предзагрузки таймера:', e);
        }
        
        state.timerSounds.push({
            sound: timerSound,
            isPlaying: false,
            lastPlayTime: 0
        });
    }
}

// Улучшенная функция создания аудио элемента с предзагрузкой
function createAudioElement(src, volume = 1.0) {
    const audioElement = new Audio();
    
    // Устанавливаем атрибуты
    audioElement.preload = 'auto';
    audioElement.src = src;
    
    // Ограничиваем громкость диапазоном [0, 1]
    audioElement.volume = Math.max(0, Math.min(1, volume));
    
    // Важно: сразу загружаем аудио
    try {
        audioElement.load();
    } catch (e) {
        console.warn(`Не удалось загрузить звук ${src}:`, e);
    }
    
    return audioElement;
}

// Функция предзагрузки аудио для мгновенного воспроизведения
function preloadAudioBuffer() {
    if (state.audioBufferLoaded) {
        return Promise.resolve();
    }
    
    console.log('Начинаем предзагрузку аудио буфера...');
    
    return new Promise((resolve) => {
        // Критические звуки для быстрого доступа
        const criticalSounds = [
            'sounds/start.mp3',
            'sounds/choose.mp3',
            'sounds/result.mp3' // Теперь используется как change
        ];
        
        let loadedCount = 0;
        const totalSounds = criticalSounds.length;
        
        criticalSounds.forEach(src => {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = src;
            
            audio.addEventListener('canplaythrough', () => {
                loadedCount++;
                if (loadedCount === totalSounds) {
                    console.log('Критические звуки предзагружены');
                    state.audioBufferLoaded = true;
                    resolve();
                }
            }, { once: true });
            
            // Начинаем загрузку
            audio.load();
            
            // Таймаут на случай проблем
            setTimeout(() => {
                if (!state.audioBufferLoaded && loadedCount < totalSounds) {
                    loadedCount++;
                    if (loadedCount === totalSounds) {
                        console.log('Предзагрузка завершена (таймаут)');
                        state.audioBufferLoaded = true;
                        resolve();
                    }
                }
            }, 2000);
        });
    });
}

// ИСПРАВЛЕННАЯ инициализация звуков (next.mp3 и result.mp3 удалены)
function initAudio() {
    if (state.soundsLoaded) {
        console.log('Звуки уже загружены');
        return true;
    }
    
    console.log('Инициализация звуков...');
    
    try {
        // Создаем все аудио элементы (next.mp3 и result.mp3 удалены)
        audio.start = createAudioElement('sounds/start.mp3', 1.0);
        audio.choose = createAudioElement('sounds/choose.mp3', 1.0);
        audio.repeat = createAudioElement('sounds/repeat.mp3', 1.0);
        audio.timer = createAudioElement('sounds/timer.mp3', 1.0);
        audio.timerEnd = createAudioElement('sounds/timer.mp3', 1.0);
        audio.change = createAudioElement('sounds/result.mp3', 1.0); // ЗАМЕНА: change.mp3 на result.mp3
        // УДАЛЕНО: audio.next
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
        console.log('Звуки успешно инициализированы');
        
        return true;
    } catch (error) {
        console.error('Ошибка инициализации звуков:', error);
        return false;
    }
}

// Улучшенная функция воспроизведения звука choose (без обрезания)
function playChooseSound() {
    if (!state.audioEnabled) return false;
    
    if (state.chooseSoundInstances.length === 0) {
        // Фолбэк на стандартный звук
        return playSound('choose');
    }
    
    try {
        // Ищем доступный экземпляр
        const now = Date.now();
        let availableInstance = null;
        
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
        
        // Подготавливаем и воспроизводим
        availableInstance.sound.currentTime = 0;
        availableInstance.isPlaying = true;
        availableInstance.lastPlayTime = now;
        
        const playPromise = availableInstance.sound.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Сбрасываем флаг после завершения
                availableInstance.sound.onended = () => {
                    availableInstance.isPlaying = false;
                };
                
                // На всякий случай сбрасываем через время звука
                setTimeout(() => {
                    availableInstance.isPlaying = false;
                }, 500);
                
            }).catch(error => {
                console.warn('Не удалось воспроизвести choose:', error);
                availableInstance.isPlaying = false;
                
                // Пробуем фолбэк
                setTimeout(() => {
                    const fallbackSound = new Audio('sounds/choose.mp3');
                    fallbackSound.volume = 1.0;
                    fallbackSound.play().catch(() => {});
                }, 10);
            });
        } else {
            // Без промиса
            try {
                availableInstance.sound.play();
                setTimeout(() => {
                    availableInstance.isPlaying = false;
                }, 500);
            } catch (e) {
                console.warn('Не удалось воспроизвести choose (без промиса):', e);
                availableInstance.isPlaying = false;
            }
        }
        
        return true;
    } catch (error) {
        console.warn('Ошибка при попытке воспроизвести choose:', error);
        return playSound('choose');
    }
}

// ИСПРАВЛЕННАЯ функция воспроизведения звука (без задержек)
function playSound(soundName) {
    if (!state.audioEnabled) return false;
    
    const sound = audio[soundName];
    if (!sound) {
        console.warn(`Звук не найден: ${soundName}`);
        return false;
    }
    
    try {
        // Сбрасываем время и устанавливаем громкость
        sound.currentTime = 0;
        
        // Попытка воспроизвести
        const playPromise = sound.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.warn(`Не удалось воспроизвести ${soundName}:`, error);
                
                // Альтернативная попытка с новым элементом
                setTimeout(() => {
                    try {
                        const newSound = new Audio(sound.src);
                        newSound.volume = sound.volume;
                        newSound.play().catch(() => {});
                    } catch (e) {
                        // Игнорируем ошибки резервного воспроизведения
                    }
                }, 10);
            });
        } else {
            // Для старых браузеров без Promise
            try {
                sound.play();
            } catch (e) {
                // Игнорируем ошибки
            }
        }
        
        return true;
    } catch (error) {
        console.warn(`Ошибка при попытке воспроизвести ${soundName}:`, error);
        return false;
    }
}

// ИСПРАВЛЕННАЯ функция для звука таймера
function playTimerSound(number) {
    if (!state.audioEnabled) return;
    
    // Не играем для отрицательных чисел
    if (number < 0) return;
    
    try {
        // Используем предзагруженные звуки если они есть
        if (state.timerSounds.length > 0 && number >= 0 && number <= 5) {
            const index = 5 - number;
            const timerInstance = state.timerSounds[index];
            
            if (timerInstance && !timerInstance.isPlaying) {
                const now = Date.now();
                
                // Проверяем, не играл ли этот звук недавно
                if (now - timerInstance.lastPlayTime < 100) {
                    return;
                }
                
                timerInstance.sound.currentTime = 0;
                timerInstance.sound.volume = 1.0;
                timerInstance.sound.playbackRate = 1.0;
                timerInstance.isPlaying = true;
                timerInstance.lastPlayTime = now;
                
                const playPromise = timerInstance.sound.play();
                
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        timerInstance.sound.onended = () => {
                            timerInstance.isPlaying = false;
                        };
                        
                        setTimeout(() => {
                            timerInstance.isPlaying = false;
                        }, 500);
                        
                    }).catch(error => {
                        timerInstance.isPlaying = false;
                        playTimerSoundFallback(number);
                    });
                } else {
                    try {
                        timerInstance.sound.play();
                        setTimeout(() => {
                            timerInstance.isPlaying = false;
                        }, 500);
                    } catch (e) {
                        timerInstance.isPlaying = false;
                        playTimerSoundFallback(number);
                    }
                }
                return;
            }
        }
        
        // Фолбэк если предзагруженные звуки не сработали
        playTimerSoundFallback(number);
        
    } catch (error) {
        playTimerSoundFallback(number);
    }
}

// Фолбэк функция для звука таймера
function playTimerSoundFallback(number) {
    if (number < 0) return;
    
    try {
        const timerSound = new Audio('sounds/timer.mp3');
        timerSound.volume = 1.0;
        timerSound.playbackRate = 1.0;
        timerSound.currentTime = 0;
        
        const playPromise = timerSound.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(() => {
                if (audio.timer) {
                    audio.timer.currentTime = 0;
                    audio.timer.playbackRate = 1.0;
                    audio.timer.volume = 1.0;
                    audio.timer.play().catch(() => {});
                }
            });
        } else {
            try {
                timerSound.play();
            } catch (e) {
                if (audio.timer) {
                    audio.timer.currentTime = 0;
                    audio.timer.playbackRate = 1.0;
                    audio.timer.volume = 1.0;
                    audio.timer.play();
                }
            }
        }
    } catch (error) {
        // Игнорируем ошибки фолбэка
    }
}

// Пауза всех звуков при сворачивании страницы
function pauseAllSounds() {
    // Пауза основных звуков
    for (const key in audio) {
        if (audio[key] && typeof audio[key].pause === 'function') {
            try {
                audio[key].pause();
            } catch (e) {
                // Игнорируем ошибки паузы
            }
        }
    }
    
    // Пауза звуков таймера
    for (const timerInstance of state.timerSounds) {
        if (timerInstance && timerInstance.sound && typeof timerInstance.sound.pause === 'function') {
            try {
                timerInstance.sound.pause();
            } catch (e) {
                // Игнорируем ошибки
            }
        }
    }
    
    // Пауза экземпляров choose
    for (const chooseInstance of state.chooseSoundInstances) {
        if (chooseInstance && chooseInstance.sound && typeof chooseInstance.sound.pause === 'function') {
            try {
                chooseInstance.sound.pause();
            } catch (e) {
                // Игнорируем ошибки
            }
        }
    }
}

// ИСПРАВЛЕННАЯ активация аудио системы (без задержек)
function activateAudioSystem() {
    // Всегда инициализируем звуки при активации
    const success = initAudio();
    
    if (success) {
        state.audioInitialized = true;
    }
    
    return success;
}

// Функция для принудительной активации
function ensureAudio() {
    if (!state.userInteracted) {
        state.userInteracted = true;
        
        // Активируем аудио систему
        activateAudioSystem();
    } else if (!state.soundsLoaded) {
        // Если пользователь уже взаимодействовал, но звуки не загружены
        initAudio();
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

// ИСПРАВЛЕННОЕ начало игры (без задержек звука)
function startGame() {
    if (state.startBtnLock) return;
    
    state.startBtnLock = true;
    elements.startBtn.disabled = true;
    elements.startBtn.style.pointerEvents = 'none';
    elements.startBtn.style.opacity = '0.7';
    
    state.isBusy = true;
    state.gamePhase = 'creating';
    state.changeSoundPlayed = false;
    
    // Воспроизводим звук начала игры только если еще не воспроизводился
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
            
            // Воспроизводим change.mp3 (теперь это result.mp3) только один раз при начале прокрутки
            if (!state.changeSoundPlayed) {
                playSound('change'); // Теперь это result.mp3 звук
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
            
            // Анимация таймера
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
                
                // Анимация таймера
                animateTimerChange(timeLeft);
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
    state.canPressSpace = false; // Запрещаем пробел пока не появился предмет

    elements.instruction.classList.remove('show');
    
    setTimeout(() => {
        elements.selectBtn.classList.remove('hidden');
        elements.selectBtn.classList.add('show');
        nextCycle();
    }, 400);
}

// ИСПРАВЛЕННЫЙ цикл выбора текущей части персонажа (без next.mp3)
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
        
        // Разрешаем пробел после появления инструкции
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
        
        // УДАЛЕНО: воспроизведение next.mp3
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
    
    // Используем улучшенную версию звука choose
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

// Завершение игры и отображение результатов
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
        
        // Показываем экран результатов с анимацией
        elements.resultScreen.style.display = 'flex';
        setTimeout(() => {
            elements.resultScreen.classList.add('show');
            
            // Разрешаем пробел после полного показа экрана результатов
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

// Сброс игры для нового раунда
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
window.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        
        // Общие блокировки
        if (state.isTimerActive || state.isBusy || state.gamePhase === 'memorizing' || state.gamePhase === 'creating') {
            return;
        }
        
        // Блокировка пробела если не разрешено
        if (!state.canPressSpace) {
            return;
        }
        
        // Специфичные блокировки для этапов
        if (state.gamePhase === 'finished' && !state.resultScreenVisible) {
            return;
        }
        
        if (state.gamePhase === 'selecting' && !state.canSelect) {
            return;
        }
        
        // Активируем аудио
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

// ИСПРАВЛЕННАЯ инициализация игры при загрузке страницы
window.onload = async () => {
    console.log('=== ИГРА ЗАГРУЖАЕТСЯ ===');
    
    try {
        // Начинаем предзагрузку аудио СРАЗУ (это ключевое изменение!)
        const audioPreloadPromise = preloadAudioBuffer();
        
        // Загружаем изображения параллельно
        const imagesLoadPromise = loadImages();
        
        // Ждем завершения обоих операций
        await Promise.all([audioPreloadPromise, imagesLoadPromise]);
        console.log('Изображения и аудио предзагружены');
        
        // Telegram инициализация
        if (tg) {
            tg.ready();
            tg.expand();
            console.log('Telegram WebApp инициализирован');
        }
        
        // Инициализация основных звуков
        console.log('Инициализация звуков...');
        
        // Создаем основные звуки (next.mp3 удален)
        audio.start = new Audio('sounds/start.mp3');
        audio.choose = new Audio('sounds/choose.mp3');
        audio.repeat = new Audio('sounds/repeat.mp3');
        audio.timer = new Audio('sounds/timer.mp3');
        audio.timerEnd = new Audio('sounds/timer.mp3');
        audio.change = new Audio('sounds/result.mp3'); // ЗАМЕНА: change.mp3 на result.mp3
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
        
        // Помечаем как загруженные
        state.soundsLoaded = true;
        console.log('Аудио элементы инициализированы');
        
        // Запускаем игру
        startIdle();
        console.log('Игра запущена в режиме ожидания');
        
        // ОПТИМИЗАЦИЯ: Предотвращение зума на iOS
        document.addEventListener('gesturestart', function(e) {
            e.preventDefault();
        });
        
        // ИСПРАВЛЕННАЯ активация аудио по первому взаимодействию
        const activateOnInteraction = () => {
            if (!state.userInteracted) {
                console.log('Первое взаимодействие обнаружено - аудио готово');
                ensureAudio();
            }
        };
        
        // Множественные события для активации
        document.addEventListener('click', activateOnInteraction);
        document.addEventListener('touchstart', activateOnInteraction);
        document.addEventListener('keydown', activateOnInteraction);
        
        // Добавляем обработчики для паузы звуков при сворачивании страницы
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                pauseAllSounds();
            }
        });
        
        window.addEventListener('blur', function() {
            pauseAllSounds();
        });
        
        window.addEventListener('pagehide', function() {
            pauseAllSounds();
        });
        
        console.log('=== ИГРА УСПЕШНО ЗАГРУЖЕНА ===');
        
    } catch (error) {
        console.error('Ошибка загрузки игры:', error);
        // Все равно запускаем игру
        startIdle();
    }
};