// Основной объект состояния игры
const state = {
    round: 1,               // Текущий раунд
    maxStreak: 0,           // Максимальная серия побед
    streak: 0,              // Текущая серия побед
    target: {},             // Целевой персонаж (который нужно запомнить)
    selection: {},          // Выбор игрока
    parts: ['skin', 'head', 'body', 'accessory'], // Части персонажа
    partCounts: { skin: 4, head: 7, body: 8, accessory: 7 }, // Количество вариантов для каждой части
    loaded: {},             // Загруженные изображения
    order: {},              // Рандомный порядок для каждой части в текущей игре
    interval: null,         // Интервал для циклического перебора частей
    idleInterval: null,     // Интервал для анимации в режиме ожидания
    currentPart: 0,         // Текущая часть при выборе
    canSelect: true,        // Флаг возможности выбора
    idleCharacter: {},      // Персонаж в режиме ожидания
    lastResult: null,       // Результат предыдущей игры: 'win', 'lose', или null для первой игры
    isBusy: false,          // Флаг блокировки действий во время анимаций
    isTimerActive: false,   // Флаг активности таймера
    gamePhase: 'idle',      // Текущая фаза игры: 'idle', 'creating', 'memorizing', 'selecting', 'finished'
    fastCycle: null,        // Интервал для быстрой смены частей при создании персонажа
    startBtnLock: false,    // Блокировка кнопки "Начать игру"
    resetBtnLock: false     // НОВЫЙ ФЛАГ: блокировка кнопки "Ещё раз"
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

// Функция для создания рандомного порядка элементов
function createRandomOrder() {
    state.order = {};
    state.parts.forEach(type => {
        // Создаем массив чисел от 0 до partCounts[type]-1
        const indices = Array.from({length: state.partCounts[type]}, (_, i) => i);
        // Перемешиваем массив
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
    for (const type of state.parts) {
        state.loaded[type] = [];
        for (let i = 1; i <= state.partCounts[type]; i++) {
            const img = new Image();
            img.src = `${folders[type]}${i}.png`;
            await new Promise(r => { 
                img.onload = r; 
                img.onerror = () => { r(); }; // Продолжить даже если изображение не загрузилось
            });
            state.loaded[type].push({ id: i, img: img });
        }
    }
}

// Отрисовка персонажа в указанном контейнере
function render(container, data) {
    container.innerHTML = '';
    state.parts.forEach(p => {
        if (data[p]) {
            const div = document.createElement('div');
            div.className = 'character-layer';
            div.style.backgroundImage = `url('${data[p].img.src}')`;
            container.appendChild(div);
        }
    });
}

// Запуск анимации в режиме ожидания (до начала игры)
function startIdle() {
    state.gamePhase = 'idle';
    state.startBtnLock = false; // Разблокируем кнопку
    state.resetBtnLock = false; // Разблокируем кнопку "Ещё раз"
    createRandomOrder(); // Создаем новый рандомный порядок для новой игры
    
    // Определяем текст в зависимости от результата предыдущей игры
    let instructionText;
    if (state.lastResult === null) {
        instructionText = "Начнём?";
    } else if (state.lastResult === 'win') {
        if (state.streak >= 50) {
            welcomeText = "Максимальная сложность!";
        } else {
            welcomeText = "Сложность повысилась!";
        }
    } else if (state.lastResult === 'almost') {
        instructionText = "Сейчас получится!";
    } else { // 'lose'
        instructionText = "Начнём сначала?";
    }
    
    // Устанавливаем соответствующую надпись
    elements.instruction.textContent = instructionText;
    elements.instruction.classList.add('show');
    
    state.parts.forEach(p => {
        const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
        state.idleCharacter[p] = getRandomOrderItem(p, randomIndex);
    });
    render(elements.characterDisplay, state.idleCharacter);
    state.idleInterval = setInterval(() => {
        const p = state.parts[Math.floor(Math.random() * state.parts.length)];
        let next;
        do { 
            const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
            next = getRandomOrderItem(p, randomIndex); 
        } while (next.id === state.idleCharacter[p].id); // Убедиться, что следующая часть отличается от текущей
        state.idleCharacter[p] = next;
        render(elements.characterDisplay, state.idleCharacter);
    }, 1000);
}

// Остановка анимации в режиме ожидания
function stopIdle() { 
    if (state.idleInterval) {
        clearInterval(state.idleInterval);
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
function animateTimerChange() {
    const timer = elements.timer;
    if (timer.textContent && timer.textContent.trim()) {
        // Создаем элемент для анимации
        const digitSpan = document.createElement('span');
        digitSpan.className = 'timer-digit changing';
        digitSpan.textContent = timer.textContent;
        timer.innerHTML = '';
        timer.appendChild(digitSpan);
        
        // Удаляем класс анимации после завершения
        setTimeout(() => {
            if (digitSpan.parentNode === timer) {
                digitSpan.classList.remove('changing');
            }
        }, 300);
    }
}

// Начало игры
function startGame() {
    // Простая и надежная блокировка кнопки "Начать игру"
    if (state.startBtnLock) {
        return;
    }
    
    // Блокируем кнопку сразу же
    state.startBtnLock = true;
    elements.startBtn.disabled = true;
    elements.startBtn.style.pointerEvents = 'none';
    elements.startBtn.style.cursor = 'not-allowed';
    elements.startBtn.style.opacity = '0.7';
    
    state.isBusy = true;
    state.gamePhase = 'creating';
    
    stopIdle();
    
    // Меняем надпись на "Создаём персонажа..."
    elements.instruction.classList.remove('show');
    setTimeout(() => {
        elements.instruction.textContent = "Создаём персонажа...";
        elements.instruction.classList.add('show');
    }, 400);
    
    // Анимация исчезновения кнопки "Начать игру"
    hideButtonWithAnimation(elements.startBtn);
    
    let duration = 0;
    // Быстрая смена частей персонажа (2 секунды)
    // Очищаем предыдущий интервал, если он есть
    if (state.fastCycle) {
        clearInterval(state.fastCycle);
        state.fastCycle = null;
    }
    
    state.fastCycle = setInterval(() => {
        const temp = {};
        state.parts.forEach(p => {
            const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
            temp[p] = getRandomOrderItem(p, randomIndex);
        });
        render(elements.characterDisplay, temp);
        duration += 100;
        if (duration >= 2000) {
            clearInterval(state.fastCycle);
            state.fastCycle = null;
            finalizeTarget(); // Завершение выбора целевого персонажа
        }
    }, 100);
}

// Функция для определения времени на запоминание в зависимости от серии
function getMemorizeTime() {
    if (state.streak >= 50) return 1;      // 50+ серия = 1 секунда
    else if (state.streak >= 30) return 2; // 30-49 серия = 2 секунды
    else if (state.streak >= 15) return 3; // 15-29 серия = 3 секунды
    else if (state.streak >= 5) return 4;  // 5-14 серия = 4 секунды
    else return 5;                         // 0-4 серия = 5 секунд
}

// Фиксация целевого персонажа и начало фазы запоминания
function finalizeTarget() {
    state.gamePhase = 'memorizing';
    
    state.parts.forEach(p => {
        const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
        state.target[p] = getRandomOrderItem(p, randomIndex);
    });
    render(elements.characterDisplay, state.target);
    
    // Меняем надпись на "Запомни персонажа"
    setTimeout(() => {
        elements.instruction.classList.remove('show');
        setTimeout(() => {
            elements.instruction.textContent = "Запомни персонажа";
            elements.instruction.classList.add('show');
            
            let timeLeft = getMemorizeTime(); // Используем динамическое время
            elements.timer.textContent = timeLeft;
            elements.timer.classList.add('show');
            state.isTimerActive = true;
            
            // Анимируем начальное значение таймера
            animateTimerChange();
            
            const t = setInterval(() => {
                timeLeft--;
                elements.timer.textContent = timeLeft;
                
                // Анимируем каждое изменение таймера
                animateTimerChange();
                
                if (timeLeft <= 0) {
                    clearInterval(t);
                    state.isTimerActive = false;
                    setTimeout(() => {
                        elements.timer.classList.remove('show');
                        startSelecting(); // Начинаем фазу выбора
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
    state.canSelect = true; // Сбрасываем флаг возможности выбора

    state.isBusy = false;

    // Даем надписи "Запомни персонажа" полностью исчезнуть
    elements.instruction.classList.remove('show');
    
    // Ждем немного чтобы надпись "Запомни персонажа" успела исчезнуть
    setTimeout(() => {
        // Показываем кнопку "Выбрать" с анимацией
        elements.selectBtn.classList.remove('hidden');
        elements.selectBtn.classList.add('show');
        
        // Переходим к циклу выбора
        nextCycle();
    }, 400);
}

// Цикл выбора текущей части персонажа
function nextCycle() {
    if (state.currentPart >= state.parts.length) { finish(); return; }
    
    const type = state.parts[state.currentPart];
    
    // Для КОЖИ часть уже добавлена в startSelecting(), для остальных - добавляем здесь
    if (state.currentPart > 0) {
        // Добавляем начальное значение для этой части
        state.selection[type] = getRandomOrderItem(type, 0);
    }
    
    // Обновляем надпись
    elements.instruction.classList.remove('show');
    setTimeout(() => {
        elements.instruction.textContent = `Выбери ${getLabel(type)}`;
        elements.instruction.classList.add('show');
    }, 200);
    
    // Расчет времени с учетом серии побед
    let baseSpeed = 1200 - (state.currentPart * 100);
    let finalSpeed = state.streak > 0 ? baseSpeed * Math.pow(0.95, state.streak) : baseSpeed;
    finalSpeed = Math.max(finalSpeed, 200);
    
    // Запускаем циклическую смену вариантов текущей части
    let idx = 0;
    
    // Очищаем предыдущий интервал, если он есть
    if (state.interval) {
        clearInterval(state.interval);
        state.interval = null;
    }
    
    // НЕМЕДЛЕННО запускаем первый тик вместо ожидания первой задержки
    const cycle = () => {
        idx = (idx + 1) % state.partCounts[type];
        state.selection[type] = getRandomOrderItem(type, idx);
        render(elements.characterDisplay, state.selection);
    };
    
    // ОСОБЫЙ СЛУЧАЙ ДЛЯ КОЖИ: начинаем с индекса -1
    if (state.currentPart === 0) {
        // Для кожи начинаем с индекса -1, чтобы первое выполнение cycle() дало индекс 0
        idx = -1;
    }
    
    // Запускаем первый цикл сразу
    cycle();
    
    // Затем устанавливаем интервал для последующих циклов
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

// Обработка выбора игрока - ОБЩАЯ ФУНКЦИЯ ДЛЯ КНОПКИ И ПРОБЕЛА
function select() {
    if (!state.canSelect) {
        return false;
    }
    if (state.gamePhase !== 'selecting') {
        return false;
    }
    
    // Блокируем повторное нажатие
    state.canSelect = false;
    
    // Очищаем интервал цикла
    if (state.interval) {
        clearInterval(state.interval);
        state.interval = null;
    }
    
    // Фиксируем текущую выбранную часть
    const currentType = state.parts[state.currentPart];
    
    state.currentPart++;
    
    if (state.currentPart >= state.parts.length) {
        hideButtonWithAnimation(elements.selectBtn);
        setTimeout(() => {
            state.canSelect = true;
            finish();
        }, 200);
    } else {
        // Добавляем небольшую паузу перед началом следующей части
        setTimeout(() => { 
            state.canSelect = true; // ВОССТАНАВЛИВАЕМ ВОЗМОЖНОСТЬ ВЫБОРА
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
    
    // Очищаем интервал, если он еще активен
    if (state.interval) {
        clearInterval(state.interval);
        state.interval = null;
    }
    
    // Сначала скрываем игровую область (0.4с)
    elements.gameArea.classList.add('hidden');
    
    // Через 0.4с показываем экран результатов (0.4с)
    setTimeout(() => {
        // Подсчёт совпадений
        let m = 0;
        state.parts.forEach(p => { 
            if(state.selection[p].id === state.target[p].id) m++; 
        });
        const p = Math.round((m/4)*100);
        
        // Управление серией побед и сохранение результата
        if (p === 100) {
            // 100% - увеличиваем серию
            state.streak++; 
            state.lastResult = 'win'; // Сохраняем результат как победу
        } else if (p < 75) {
            // Меньше 75% - сбрасываем серию
            state.streak = 0; 
            state.lastResult = 'lose'; // Сохраняем результат как поражение
        } else {
            // 75% и больше (но не 100%) - оставляем серию как есть
            // state.streak не меняется
            state.lastResult = 'almost'; // Новый тип результата
        }
        
        // Обновление максимальной серии
        if (state.streak > state.maxStreak) {
            state.maxStreak = state.streak;
        }
        
        elements.resultPercent.textContent = p + '%';
        elements.resultText.textContent = p === 100 ? "Идеально! 🎉" : (p >= 75 ? "Почти! 🤏🏻" : "Попробуй еще раз...");
        render(elements.resultTarget, state.target);
        render(elements.resultPlayer, state.selection);
        updateStats();
        elements.resultScreen.classList.add('show'); // Показать экран результатов
        state.startBtnLock = false; // Разблокируем кнопку "Начать игру"
        state.resetBtnLock = false; // Разблокируем кнопку "Ещё раз"
        state.isBusy = false; // Снимаем блокировку
    }, 400); // Задержка = время исчезновения первого экрана
}

// Сброс игры для нового раунда
function reset() {
    // Блокируем повторное нажатие кнопки "Ещё раз"
    if (state.resetBtnLock) {
        return;
    }
    
    if (state.isBusy) {
        return;
    }
    
    // Блокируем кнопку сразу же
    state.resetBtnLock = true;
    elements.resultAgainBtn.disabled = true;
    elements.resultAgainBtn.style.pointerEvents = 'none';
    elements.resultAgainBtn.style.cursor = 'not-allowed';
    elements.resultAgainBtn.style.opacity = '0.7';
    
    state.round++;
    
    // Сразу скрываем экран результатов
    elements.resultScreen.classList.remove('show');
    
    // ОЧИСТКА: удаляем старого персонажа
    state.target = {};
    state.selection = {};
    state.idleCharacter = {};
    
    // Очищаем отображение персонажа в основной области
    elements.characterDisplay.innerHTML = '';
    
    // Ждем пока скроется экран результатов (0.4с) и ТОЛЬКО ПОТОМ очищаем персонажей
    setTimeout(() => {
        // Очищаем персонажей на экране результатов ПОСЛЕ анимации скрытия
        elements.resultTarget.innerHTML = '';
        elements.resultPlayer.innerHTML = '';
        
        // Сбрасываем состояние кнопок (включаем кнопку "Начать игру")
        elements.startBtn.classList.remove('hidden');
        elements.startBtn.style.opacity = '1';
        elements.startBtn.style.transform = 'scale(1)';
        elements.startBtn.disabled = false;
        elements.startBtn.style.pointerEvents = 'auto';
        elements.startBtn.style.cursor = 'pointer';
        
        // Сбрасываем состояние кнопки "Ещё раз"
        elements.resultAgainBtn.disabled = false;
        elements.resultAgainBtn.style.pointerEvents = 'auto';
        elements.resultAgainBtn.style.cursor = 'pointer';
        elements.resultAgainBtn.style.opacity = '1';
        
        elements.selectBtn.classList.remove('show');
        elements.selectBtn.classList.add('hidden');
        elements.selectBtn.style.opacity = '';
        elements.selectBtn.style.transform = '';
        
        // Показываем игровую область с начальной надписью
        elements.gameArea.classList.remove('hidden');
        
        // Обновляем статистику
        updateStats();
        
        // Возвращаемся в режим ожидания
        setTimeout(() => {
            startIdle();
        }, 100);
    }, 400); // Задержка = время исчезновения первого экрана
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

// Обработка нажатия пробела для управления - УПРОЩЕННАЯ ВЕРСИЯ
window.addEventListener('keydown', e => {
    if (e.code === 'Space') {
        e.preventDefault();

        // Запрещаем нажатие пробела в следующие моменты:
        if (state.isTimerActive) return;
        if (state.isBusy) return;
        if (state.gamePhase === 'memorizing') return;
        if (state.gamePhase === 'creating') return;
        // Если фаза выбора, но кнопка "Выбрать" еще скрыта - не позволяем
        if (state.gamePhase === 'selecting' && elements.selectBtn.classList.contains('hidden')) {
            return;
        }
        
        // Разрешаем действие только если все проверки пройдены
        if (state.gamePhase === 'idle' && !state.startBtnLock && !elements.startBtn.classList.contains('hidden')) {
            startGame();
        } else if (state.gamePhase === 'selecting' && state.canSelect) {
            select();
        } else if (state.gamePhase === 'finished' && !state.resetBtnLock) {
            reset();
        }
    }
});

// Назначение обработчиков событий для кнопок
elements.startBtn.onclick = function() {
    startGame();
};

elements.selectBtn.onclick = function() {
    select();
};

elements.resultAgainBtn.onclick = function() {
    reset();
};

// Инициализация игры при загрузке страницы
window.onload = async () => {
    await loadImages();
    startIdle();
};