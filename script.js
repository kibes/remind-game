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
    audioContextActivated: false,
    userInteracted: false,
    soundsLoaded: false, // Флаг загрузки звуков
    useSimpleAudio: true // Использовать простой Audio вместо AudioContext
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

// Функция для создания аудио элемента
function createAudioElement(src) {
    const audioElement = new Audio();
    
    // Для локального тестирования (file://) не устанавливаем crossOrigin
    if (window.location.protocol !== 'file:') {
        audioElement.crossOrigin = 'anonymous';
    }
    
    audioElement.preload = 'auto';
    audioElement.src = src;
    
    // Загружаем аудио
    audioElement.load();
    
    return audioElement;
}

// Функция для инициализации всех звуков
function initAudio() {
    // Создаем все аудио элементы
    audio.start = createAudioElement('sounds/start.mp3');
    audio.choose = createAudioElement('sounds/choose.mp3');
    audio.repeat = createAudioElement('sounds/repeat.mp3');
    audio.timer = createAudioElement('sounds/timer.mp3');
    audio.change = createAudioElement('sounds/change.mp3');
    audio.next = createAudioElement('sounds/next.mp3');
    audio.result = createAudioElement('sounds/result.mp3');
    audio.victory = createAudioElement('sounds/victory.mp3');
    audio.vic = createAudioElement('sounds/vic.mp3');
    audio.loss = createAudioElement('sounds/loss.mp3');
    
    // Настройка громкости
    audio.next.volume = 0.6;
    
    state.soundsLoaded = true;
    console.log("Аудио элементы инициализированы");
}

// Функция для воспроизведения звука
function playSound(soundName) {
    try {
        const sound = audio[soundName];
        if (!sound) return;
        
        // Если звук еще не загружен, пытаемся загрузить
        if (sound.readyState === 0) {
            sound.load();
        }
        
        // Сбрасываем воспроизведение
        sound.currentTime = 0;
        
        // Пробуем воспроизвести
        const playPromise = sound.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.log(`Аудио ${soundName} не может быть воспроизведено:`, e);
                // Пробуем снова через небольшой промежуток
                setTimeout(() => {
                    try {
                        sound.currentTime = 0;
                        sound.play().catch(() => {});
                    } catch (err) {
                        console.log("Повторная попытка воспроизведения не удалась:", err);
                    }
                }, 100);
            });
        }
    } catch (e) {
        console.log("Ошибка воспроизведения звука:", e);
    }
}

// Функция для воспроизведения тихого звука next.mp3
function playQuietNextSound() {
    try {
        const sound = audio.next;
        if (!sound) return;
        
        const originalVolume = sound.volume;
        sound.volume = originalVolume * 0.3;
        sound.currentTime = 0;
        
        const playPromise = sound.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                setTimeout(() => {
                    sound.volume = originalVolume;
                }, 100);
            }).catch(e => {
                console.log("Тихий next.mp3 не может быть воспроизведен:", e);
                sound.volume = originalVolume;
            });
        } else {
            setTimeout(() => {
                sound.volume = originalVolume;
            }, 100);
        }
    } catch (e) {
        console.log("Ошибка воспроизведения тихого next.mp3:", e);
    }
}

// Функция для звука таймера с разной тональностью
function playTimerSound(number) {
    if (state.isTimerPlaying) {
        return;
    }
    
    try {
        // Создаем новый аудио элемент каждый раз для избежания CORS проблем
        const sound = new Audio('sounds/timer.mp3');
        
        // Настраиваем скорость воспроизведения для разных тональностей
        let playbackRate = 1.0;
        switch(number) {
            case 5: playbackRate = 0.7; break;
            case 4: playbackRate = 0.8; break;
            case 3: playbackRate = 0.9; break;
            case 2: playbackRate = 1.1; break;
            case 1: playbackRate = 1.3; break;
            default: playbackRate = 1.0;
        }
        
        sound.playbackRate = playbackRate;
        sound.currentTime = 0;
        sound.volume = 1;
        
        state.isTimerPlaying = true;
        
        // Пытаемся воспроизвести
        const playPromise = sound.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                sound.onended = () => {
                    state.isTimerPlaying = false;
                };
            }).catch(e => {
                console.log("Таймер аудио не может быть воспроизведено:", e);
                state.isTimerPlaying = false;
                
                // Фолбэк: пробуем использовать основной аудио элемент
                try {
                    if (audio.timer) {
                        audio.timer.currentTime = 0;
                        audio.timer.playbackRate = playbackRate;
                        audio.timer.play().catch(() => {});
                    }
                } catch (err) {
                    console.log("Фолбэк таймера также не сработал:", err);
                }
            });
        }
        
    } catch (e) {
        console.log("Ошибка воспроизведения звука таймера:", e);
        state.isTimerPlaying = false;
    }
}

// Функция для активации аудио системы
function activateAudioSystem() {
    return new Promise((resolve) => {
        // Инициализируем аудио если еще не инициализировано
        if (!state.soundsLoaded) {
            initAudio();
        }
        
        // Активируем AudioContext только если он нужен и поддерживается
        if (state.useSimpleAudio) {
            // Используем простой Audio - не нужен AudioContext
            console.log("Используется простой Audio API");
            state.audioContextActivated = true;
            resolve(true);
            return;
        }
        
        // Старая логика AudioContext (на всякий случай)
        if (!state.audioContext && window.AudioContext) {
            try {
                state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log("AudioContext создан");
            } catch (e) {
                console.log("AudioContext не поддерживается:", e);
                state.audioContext = null;
                state.useSimpleAudio = true;
                resolve(true);
                return;
            }
        }
        
        if (state.audioContext) {
            if (state.audioContext.state === 'suspended') {
                state.audioContext.resume().then(() => {
                    console.log("AudioContext активирован");
                    state.audioContextActivated = true;
                    resolve(true);
                }).catch(err => {
                    console.log("Не удалось активировать AudioContext:", err);
                    state.audioContextActivated = true;
                    state.useSimpleAudio = true;
                    resolve(true);
                });
            } else {
                state.audioContextActivated = true;
                resolve(true);
            }
        } else {
            state.audioContextActivated = true;
            state.useSimpleAudio = true;
            resolve(true);
        }
    });
}

// Функция для принудительной активации при первом взаимодействии
function ensureAudio() {
    if (!state.userInteracted) {
        state.userInteracted = true;
        console.log("Первое взаимодействие пользователя, активируем аудио");
        
        // Инициализируем аудио
        initAudio();
        
        // Пробуем воспроизвести короткий тихий звук для разблокировки аудио
        try {
            // Создаем пустой звук для разблокировки
            const testAudio = new Audio();
            testAudio.volume = 0.01;
            
            // Короткий звук в формате base64
            const emptyAudio = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ';
            testAudio.src = emptyAudio;
            
            testAudio.play().then(() => {
                setTimeout(() => {
                    testAudio.pause();
                }, 100);
            }).catch(() => {});
        } catch (e) {
            console.log("Ошибка тестового звука:", e);
        }
        
        // Активируем аудио систему
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
            playSound('loss')
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

// Обработка нажатия пробела
window.addEventListener('keydown', e => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (state.isTimerActive || state.isBusy || state.gamePhase === 'memorizing' || state.gamePhase === 'creating') return;
        if (state.gamePhase === 'selecting' && elements.selectBtn.classList.contains('hidden')) return;
        
        ensureAudio();
        activateAudioSystem().then(() => {
            if (state.gamePhase === 'idle' && !state.startBtnLock && !elements.startBtn.classList.contains('hidden')) {
                startGame();
            } else if (state.gamePhase === 'selecting' && state.canSelect) {
                select();
            } else if (state.gamePhase === 'finished' && !state.resetBtnLock) {
                reset();
            }
        });
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
    ensureAudio();
    activateAudioSystem().then(() => {
        startGame();
    });
};

elements.selectBtn.onclick = function() {
    select();
};

elements.resultAgainBtn.onclick = function() {
    ensureAudio();
    activateAudioSystem().then(() => {
        reset();
    });
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
    await loadImages();
    
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
    
    // Активация аудио при первом взаимодействии
    document.addEventListener('click', function initAudio() {
        ensureAudio();
        activateAudioSystem().then(() => {
            console.log("Аудио система активирована");
            
            // Пробуем воспроизвести короткий звук для проверки
            try {
                const testSound = new Audio();
                testSound.volume = 0.01;
                testSound.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ';
                testSound.play().then(() => {
                    setTimeout(() => {
                        testSound.pause();
                    }, 100);
                }).catch(() => {});
            } catch(e) {}
        });
        
        document.removeEventListener('click', initAudio);
    }, { once: true });
};