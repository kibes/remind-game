// ============================
// SUPABASE CONFIGURATION (НАСТРОЙКА БАЗЫ ДАННЫХ)
// ============================

// !!! ВСТАВЬТЕ СЮДА ВАШИ РЕАЛЬНЫЕ КЛЮЧИ !!!
const SUPABASE_URL = 'https://lmlgnsthwwvcczoatoag.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_PQiqm6aI8DcfGYXog73idg_O9dWKx_R'; 

let supabaseClient = null;

function initSupabase() {
    if (window.supabase && SUPABASE_URL !== 'ВАШ_SUPABASE_URL') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✓ Supabase клиент инициализирован');
    } else {
        console.warn('Ошибка: Supabase ключи не установлены, или библиотека не загружена. Сохранение отключено.');
    }
}

// Telegram Web App интеграция
let tg = null;
if (window.Telegram && window.Telegram.WebApp) {
    tg = window.Telegram.WebApp;
    tg.expand();
}

// Основной объект состояния игры
const state = {
    round: 1,
    maxStreak: 0,
    streak: 0,
    target: {},
    selection: {},
    parts: ['skin', 'head', 'body', 'accessory'],
    partCounts: { skin: 4, head: 8, body: 9, accessory: 8},
    loaded: {},
    order: {},
    interval: null,
    idleInterval: null,
    currentPart: 0,
    canSelect: true,
    idleCharacter: {},
    lastResult: null,
    isBusy: false,
    isMuted: false,
    isTimerActive: false,
    isDataLoaded: false,
    gamePhase: 'idle',
    fastCycle: null,
    startBtnLock: false,
    resetBtnLock: false,
    userInteracted: false,
    isButtonReady: false, 
    loadingFinalized: false, 
    canPressSpace: false, 

    // Определение платформы
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
    isTelegramWebApp: window.Telegram && window.Telegram.WebApp,

    // Аудио система
    audioContext: null,
    audioBuffers: {},
    soundsLoaded: false,
    audioUnlocked: false,
    
    // Состояние загрузки
    totalAssets: 0,     
    loadedAssets: 0,    
    resourcesReady: false, 
    forceLoaded: false  
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
    resultPlayer: document.getElementById('result-player'),
    soundBtn: document.getElementById('sound-btn'),
    leaderboardBtn: document.getElementById('leaderboard-btn'),
    leaderboardOverlay: document.getElementById('leaderboard-overlay'),
    leaderboardList: document.getElementById('leaderboard-list'),
    userRankContainer: document.getElementById('user-rank-container'),
    closeLeaderboard: document.getElementById('close-leaderboard')
};

if (elements.characterDisplay) {
    elements.characterDisplay.style.isolation = 'isolate';
    elements.characterDisplay.style.webkitIsolation = 'isolate';
}

function setInstructionText(text, immediate = false) {
    const instruction = elements.instruction;
    if (immediate) {
        instruction.textContent = text;
        
        // Используем принудительный показ без анимации для мгновенного появления текста
        instruction.style.transition = 'none';
        instruction.classList.add('show');
        void instruction.offsetWidth; // Принудительная перерисовка
        instruction.style.transition = '';
        
        return;
    }
    // Стандартная плавная анимация (fade out -> fade in)
    instruction.classList.remove('show');
    setTimeout(() => {
        instruction.textContent = text;
        setTimeout(() => {
            instruction.classList.add('show');
        }, 50);
    }, 300);
}

// ============================
// AUDIO SYSTEM (Web Audio API)
// ============================

const AudioContext = window.AudioContext || window.webkitAudioContext;

function initAudioSystem() {
    try {
        state.audioContext = new AudioContext();
        loadAllSounds();
    } catch (e) {
        console.error('Web Audio API issue:', e);
        state.soundsLoaded = true; 
        checkLoadingProgress();
    }
}

async function loadSoundFile(name, url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        if (state.audioContext) {
            const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
            state.audioBuffers[name] = audioBuffer;
        }
    } catch (e) {
        console.warn(`Звук ${name} пропущен`);
    } finally {
        state.loadedAssets++;
        checkLoadingProgress();
    }
}

function loadAllSounds() {
    const sounds = {
        'start': 'sounds/start.mp3',
        'choose': 'sounds/choose.mp3',
        'repeat': 'sounds/repeat.mp3',
        'timer': 'sounds/timer.mp3',
        'change': 'sounds/result.mp3',
        'victory': 'sounds/victory.mp3',
        'vic': 'sounds/vic.mp3',
        'loss': 'sounds/loss.mp3',
        'next': 'sounds/next.mp3'
    };
    
    const soundKeys = Object.keys(sounds);
    state.totalAssets += soundKeys.length;

    soundKeys.forEach(name => {
        loadSoundFile(name, sounds[name]);
    });
}

function unlockAudio() {
    if (!state.audioContext || state.audioUnlocked) return;
    if (state.audioContext.state === 'suspended') {
        state.audioContext.resume().then(() => {
            state.audioUnlocked = true;
        }).catch(e => console.log(e));
    } else {
        state.audioUnlocked = true;
    }
}

function playSound(name) {
    if (state.isMuted) return; // Проверка на беззвучный режим
    if (!state.audioContext || !state.audioBuffers[name] || !state.audioUnlocked) return;
    try {
        const source = state.audioContext.createBufferSource();
        source.buffer = state.audioBuffers[name];
        source.connect(state.audioContext.destination);
        source.start(0);
    } catch(e) {}
}
function toggleSound() {
    state.isMuted = !state.isMuted;
    elements.soundBtn.classList.toggle('muted', state.isMuted);
    playSound('next');
}

async function showLeaderboard() {
    playSound('next');
    elements.leaderboardOverlay.classList.add('show');
    elements.leaderboardList.innerHTML = '<div style="text-align:center; color:#db4e4e">Загрузка...</div>';
    elements.userRankContainer.innerHTML = '';

    if (!supabaseClient) {
        elements.leaderboardList.innerHTML = '<div style="text-align:center; color:#db4e4e">База данных недоступна</div>';
        return;
    }

    try {
        const currentUserId = tg?.initDataUnsafe?.user?.id;

        // Запускаем запросы ОДНОВРЕМЕННО через Promise.all
        const promises = [
            supabaseClient
                .from('players')
                .select('username, max_streak, user_id, record_at')
                .order('max_streak', { ascending: false })
                .order('record_at', { ascending: true })
                .limit(5)
        ];

        // Добавляем запрос данных пользователя, если он залогинен
        if (currentUserId) {
            promises.push(
                supabaseClient
                    .from('players')
                    .select('max_streak, record_at')
                    .eq('user_id', currentUserId)
                    .maybeSingle()
            );
        }

        const results = await Promise.all(promises);
        const topPlayers = results[0].data;
        const me = results[1]?.data;

        let userRank = "?";

        if (me) {
            // Только этот запрос останется ждать данных от 'me'
            const { count } = await supabaseClient
                .from('players')
                .select('*', { count: 'exact', head: true })
                .or(`max_streak.gt.${me.max_streak},and(max_streak.eq.${me.max_streak},record_at.lt."${me.record_at}")`);
            
            userRank = (count || 0) + 1;
        }

        renderLeaderboard(topPlayers, userRank);
    } catch (e) {
        console.error('Ошибка:', e);
        elements.leaderboardList.innerHTML = 'Ошибка загрузки';
    }
}

function renderLeaderboard(players, myRank) {
    elements.leaderboardList.innerHTML = '';
    const currentUserId = tg?.initDataUnsafe?.user?.id;

    players.forEach((player, index) => {
        const isMe = String(player.user_id) === String(currentUserId);
        const item = document.createElement('div');
        item.className = `leader-item ${isMe ? 'user-special' : ''}`;
        item.innerHTML = `
            <span class="rank">${index + 1}</span>
            <span class="name">${player.username || 'Аноним'}</span>
            <span class="score">${player.max_streak}</span>
        `;
        elements.leaderboardList.appendChild(item);
    });

    // Если игрока нет в первой пятерке по результатам сортировки
    const isInTop5 = players.some(p => String(p.user_id) === String(currentUserId));
    
    if (!isInTop5 && tg?.initDataUnsafe?.user) {
        const myName = tg.initDataUnsafe.user.first_name || 'Вы';
        elements.userRankContainer.innerHTML = `
            <div style="width: 80%; margin: 15px auto; border-top: 2px solid #db4e4e; opacity: 0.5;"></div>
            <div class="leader-item user-special">
                <span class="rank">${myRank}</span>
                <span class="name">${myName}</span>
                <span class="score">${state.maxStreak}</span>
            </div>
        `;
    }
}

function closeLeaderboard() {
    playSound('repeat'); // Звук закрытия
    elements.leaderboardOverlay.classList.remove('show');
}

const playStartSound = () => playSound('start');
const playChooseSound = () => playSound('choose');
const playRepeatSound = () => playSound('repeat');
const playChangeSound = () => playSound('change');
const playNextSound = () => playSound('next'); 
const playTimerSound = (num) => { if(num >= 0) playSound('timer'); }; 


// ============================
// DATABASE LOGIC
// ============================

async function loadPlayerData() {
    if (!supabaseClient || !tg?.initDataUnsafe?.user) {
        state.isDataLoaded = true; // Считаем загруженным для анонимов
        return;
    }
    
    try {
        const user_id = tg.initDataUnsafe.user.id;
        const { data, error } = await supabaseClient
            .from('players')
            .select('streak, max_streak')
            .eq('user_id', user_id)
            .maybeSingle();

        if (!error && data) {
            state.streak = data.streak || 0;
            state.maxStreak = data.max_streak || 0;
            updateStats();
        }
    } catch (e) {
        console.error('Критический сбой в loadPlayerData:', e);
    } finally {
        state.isDataLoaded = true; // ГАРАНТИРУЕМ установку флага
    }
}


async function resetStreakOnServer() {
    if (!supabaseClient || !tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) return;
    const user_id = tg.initDataUnsafe.user.id;
    if (tg) tg.enableClosingConfirmation();
    // Сброс серии на сервере в 0 (анти-чит)
    await supabaseClient.from('players').update({ streak: 0 }).eq('user_id', user_id);
}

async function savePlayerData() {
    // Проверка загрузки данных и наличия клиента
    if (!state.isDataLoaded || !supabaseClient || !tg?.initDataUnsafe?.user) return;

    const user = tg.initDataUnsafe.user;

    try {
        // Вызываем нашу SQL-функцию через RPC
        const { error } = await supabaseClient.rpc('update_player_progress', {
            p_user_id: user.id,
            p_username: (user.first_name || 'Unknown') + (user.last_name ? ' ' + user.last_name : ''),
            p_streak: state.streak,
            p_max_streak: state.maxStreak
        });

        if (!error) {
            tg.disableClosingConfirmation();
            console.log("✓ Данные успешно синхронизированы с защитой рекорда");
        } else {
            console.error("Ошибка RPC:", error);
        }
    } catch (e) {
        console.error("Сбой при вызове сохранения:", e);
    }
}


// ============================
// GAME LOGIC & LOADING
// ============================

/**
 * Финализирует процесс загрузки после того, как завершился fade out/in инструкции.
 * Управляет появлением кнопки и запуском idle-анимации.
 */
function finalizeLoading() {
    if (state.loadingFinalized) return;
    state.loadingFinalized = true;

    // 1. Показываем кнопку старта с анимацией
    elements.startBtn.classList.remove('hidden');
    elements.startBtn.style.opacity = '0';
    
    setTimeout(() => {
        elements.startBtn.style.transition = 'opacity 0.3s ease';
        elements.startBtn.style.opacity = '1';
        elements.startBtn.disabled = false;
        elements.startBtn.style.pointerEvents = 'auto';

        // ГАРАНТИЯ: Устанавливаем готовность к приему ввода (пробела)
        state.isButtonReady = true; 
        state.canPressSpace = true; 

        // 2. Запускаем анимацию простоя (после появления кнопки)
        if (state.gamePhase === 'idle') {
            startIdleAnimation();
        }
    }, 50); // Небольшая задержка, чтобы кнопка сразу не 'прыгнула'
}


function checkLoadingProgress() {
    if (state.resourcesReady) return;

    let percent = 0;
    if (state.totalAssets > 0) {
        percent = Math.floor((state.loadedAssets / state.totalAssets) * 100);
    }
    
    if (state.forceLoaded) percent = 100;
    if (percent > 100) percent = 100;

    if (percent < 100) {
        // Обновление прогресса: используется мгновенное обновление текста
        if (elements.instruction.textContent !== `Загрузка... ${percent}%`) {
            setInstructionText(`Загрузка... ${percent}%`, true); 
        }
    } else {
        state.resourcesReady = true;
        console.log('✓ Загрузка завершена');

        // 1. Плавный переход от "Загрузка 100%" к "Начнём?"
        setInstructionText("Начнём?"); 
        
        // 2. Запускаем финализацию с задержкой, чтобы Fade Out/In текста завершился.
        setTimeout(finalizeLoading, 350); 
    }
}

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

function getRandomOrderItem(type, index) {
    if (!state.order[type] || !state.loaded[type]) return null;
    const realIndex = state.order[type][index % state.order[type].length];
    return state.loaded[type][realIndex];
}

function loadImages() {
    const folders = { skin: 'skins/', head: 'heads/', body: 'bodies/', accessory: 'accessories/' };
    
    let totalImages = 0;
    for (const type of state.parts) {
        totalImages += state.partCounts[type];
    }
    state.totalAssets += totalImages;

    for (const type of state.parts) {
        state.loaded[type] = [];
        for (let i = 1; i <= state.partCounts[type]; i++) {
            const img = new Image();
            img.onload = () => {
                state.loadedAssets++;
                checkLoadingProgress();
            };
            img.onerror = () => {
                state.loadedAssets++; 
                checkLoadingProgress();
            };
            img.src = `${folders[type]}${i}.png`;
            state.loaded[type].push({ id: i, img: img });
        }
    }
}

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

function setupTouchHandlers() {
    const buttons = [elements.startBtn, elements.selectBtn, elements.resultAgainBtn];
    
    const globalUnlock = () => {
        unlockAudio();
        document.removeEventListener('touchstart', globalUnlock);
        document.removeEventListener('click', globalUnlock);
    };
    document.addEventListener('touchstart', globalUnlock, { passive: true });
    document.addEventListener('click', globalUnlock, { passive: true });
    // Внутри функции инициализации или window.onload
    elements.soundBtn.addEventListener('click', toggleSound);
    elements.leaderboardBtn.addEventListener('click', showLeaderboard);
    elements.closeLeaderboard.addEventListener('click', closeLeaderboard);
    elements.leaderboardOverlay.addEventListener('click', (e) => {
        if (e.target === elements.leaderboardOverlay) closeLeaderboard();
    });

    buttons.forEach(button => {
        if (!button) return;
        
        button.addEventListener('touchstart', function(e) {
            if (this.disabled || this.classList.contains('hidden')) return;
            state.touchStartedOnButton = true;
            state.currentTouchButton = this;
            this.style.transform = 'scale(0.97)';
            unlockAudio(); 
        }, { passive: true });
        
        button.addEventListener('touchend', function(e) {
            if (!state.touchStartedOnButton || state.currentTouchButton !== this) return;
            this.style.transform = '';
            
            const touch = e.changedTouches[0];
            const rect = this.getBoundingClientRect();
            const isStillInside = (
                touch.clientX >= rect.left && 
                touch.clientX <= rect.right && 
                touch.clientY >= rect.top && 
                touch.clientY <= rect.bottom
            );

            if (isStillInside) {
                e.preventDefault(); 
                if (this === elements.startBtn) handleStartButton();
                else if (this === elements.selectBtn) handleSelectButton();
                else if (this === elements.resultAgainBtn) handleResetButton();
            }

            state.touchStartedOnButton = false;
            state.currentTouchButton = null;
        }, { passive: false });
        
        button.addEventListener('touchcancel', function() {
            state.touchStartedOnButton = false;
            this.style.transform = '';
        }, { passive: true });
    });
    
    elements.startBtn.addEventListener('click', (e) => { 
        if(e.detail === 0) return; 
        handleStartButton(); 
    });
    elements.selectBtn.addEventListener('click', (e) => { 
        if(e.detail === 0) return;
        handleSelectButton(); 
    });
    elements.resultAgainBtn.addEventListener('click', (e) => { 
        if(e.detail === 0) return;
        handleResetButton(); 
    });

    const closeLbBtn = document.getElementById('close-leaderboard');
    if (closeLbBtn) {
        closeLbBtn.onclick = () => {
            playSound('repeat'); // Или любой другой звук из твоего списка
            
            // Скрываем оверлей (проверь название переменной в своем коде)
            if (elements.leaderboardOverlay) {
                elements.leaderboardOverlay.classList.remove('active');
            } else {
                // Если ты используешь прямую работу с ID
                document.getElementById('leaderboard-overlay').classList.remove('active');
            }
        };
    }
}

function handleStartButton() {
    if (state.startBtnLock) return;
    unlockAudio();
    startGame();
}

function handleSelectButton() {
    unlockAudio();
    select();
}

function handleResetButton() {
    unlockAudio();
    reset();
}

function startIdle() {
    state.gamePhase = 'idle';
    state.startBtnLock = false;
    state.resetBtnLock = false;
    state.resultScreenVisible = false;
    state.changeSoundPlayed = false;
    
    createRandomOrder();
    
    if (!state.resourcesReady) {
        checkLoadingProgress();
        return;
    }
    
    if (state.resourcesReady && state.loadingFinalized) startIdleAnimation();
}

function startIdleAnimation() {
    if (state.idleInterval) {
        cancelAnimationFrame(state.idleInterval);
        state.idleInterval = null;
    }

    if (state.gamePhase !== 'idle') return;
    
    if (!state.idleCharacter.skin) {
        state.parts.forEach(p => {
            const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
            state.idleCharacter[p] = getRandomOrderItem(p, randomIndex);
        });
    }
    render(elements.characterDisplay, state.idleCharacter);
    
    let lastTime = 0;
    let partIndex = 0; 
    let isFirstFrame = true;
    
    const animateIdle = (timestamp) => {
        if (state.gamePhase !== 'idle') {
            state.idleInterval = null;
            return;
        }

        if (isFirstFrame) {
            lastTime = timestamp;
            isFirstFrame = false;
            state.idleInterval = requestAnimationFrame(animateIdle);
            return;
        }
        
        if (timestamp - lastTime > 1000) { 
            lastTime = timestamp;
            const p = state.parts[partIndex % state.parts.length];
            let next;
            do { 
                const randomIndex = Math.floor(Math.random() * state.partCounts[p]);
                next = getRandomOrderItem(p, randomIndex); 
            } while (next && next.id === state.idleCharacter[p]?.id);
            
            if (next) {
                state.idleCharacter[p] = next;
                render(elements.characterDisplay, state.idleCharacter);
            }
            partIndex++; 
        }
        state.idleInterval = requestAnimationFrame(animateIdle);
    };
    state.idleInterval = requestAnimationFrame(animateIdle);
}


function stopIdle() { 
    if (state.idleInterval) {
        cancelAnimationFrame(state.idleInterval);
        state.idleInterval = null;
    }
}

function hideButtonWithAnimation(button) {
    if (!button || button.classList.contains('hidden')) return;
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
            if (digitSpan.parentNode === timer) digitSpan.classList.remove('changing');
        }, 300);
    }
}

function startGame() {
    if (state.startBtnLock) return;
    state.startBtnLock = true;
    state.isButtonReady = false;
    
    if (elements.startBtn && !elements.startBtn.classList.contains('hidden')) {
        hideButtonWithAnimation(elements.startBtn);
    }
    
    state.isBusy = true;
    state.gamePhase = 'creating';
    state.changeSoundPlayed = false;
    state.canPressSpace = false; // Блокируем пробел при старте

    playStartSound();
    stopIdle(); 
    setInstructionText("Создаём персонажа...");
    
    if (state.fastCycle) { cancelAnimationFrame(state.fastCycle); state.fastCycle = null; }
    
    let duration = 0;
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
        if (state.gamePhase === 'creating') state.fastCycle = requestAnimationFrame(animateCreation);
    };
    state.fastCycle = requestAnimationFrame(animateCreation);
}

function getMemorizeTime() {
    if (state.streak >= 50) return 1;
    else if (state.streak >= 30) return 2;
    else if (state.streak >= 15) return 3;
    else if (state.streak >= 5) return 4;
    else return 5;
}

function finalizeTarget() {
    // Сброс серии на сервере в 0 именно здесь
    resetStreakOnServer(); 
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
        setTimeout(() => animateTimerChange(timeLeft), 100);
        
        const t = setInterval(() => {
            timeLeft--;
            if (timeLeft < 0) {
                clearInterval(t);
                elements.timer.classList.remove('show');
                state.isTimerActive = false;
                setTimeout(startSelecting, 300);
                return;
            }
            elements.timer.textContent = timeLeft;
            animateTimerChange(timeLeft);
        }, 1000);
    }, 500);
}

function startSelecting() {

    state.gamePhase = 'selecting';
    state.currentPart = 0;
    state.selection = {};
    state.canSelect = true;
    state.isBusy = false;
    state.canPressSpace = false;

    const firstType = state.parts[0];
    state.selection[firstType] = getRandomOrderItem(firstType, 0);
    render(elements.characterDisplay, state.selection);
    setInstructionText(`Выбери ${getLabel(firstType)}`);
    
    playNextSound();
    
    setTimeout(() => {
        elements.selectBtn.classList.remove('hidden');
        elements.selectBtn.classList.add('show');
        nextCycle();
    }, 400);
}

function nextCycle() {
    if (state.currentPart >= state.parts.length) { finish(); return; }
    
    const type = state.parts[state.currentPart];
    let baseSpeed = 1200 - (state.currentPart * 106);
    let finalSpeed = state.streak > 0 ? baseSpeed * Math.pow(0.969, state.streak) : baseSpeed;
    finalSpeed = Math.max(finalSpeed, 250);
    
    let idx = 0;
    if (state.interval) clearInterval(state.interval);
    
    const cycle = () => {
        idx = (idx + 1) % state.partCounts[type];
        state.selection[type] = getRandomOrderItem(type, idx);
        render(elements.characterDisplay, state.selection);
        playNextSound();
    };
    state.interval = setInterval(cycle, finalSpeed);
    setTimeout(() => { state.canPressSpace = true; }, 200);
}

function getLabel(t) { 
    return {skin:'цвет кожи', head:'голову', body:'тело', accessory:'аксессуар'}[t]; 
}

function select() {
    if (!state.canSelect || state.gamePhase !== 'selecting') return false;
    
    playChooseSound();
    state.canSelect = false;
    state.canPressSpace = false;
    
    if (state.interval) { clearInterval(state.interval); state.interval = null; }
    state.currentPart++;
    
    if (state.currentPart >= state.parts.length) {
        hideButtonWithAnimation(elements.selectBtn);
        setTimeout(() => { state.canSelect = true; finish(); }, 200);
    } else {
        const nextType = state.parts[state.currentPart];
        state.selection[nextType] = getRandomOrderItem(nextType, 0);
        render(elements.characterDisplay, state.selection);
        setInstructionText(`Выбери ${getLabel(nextType)}`);
        playNextSound(); 
        setTimeout(() => { state.canSelect = true; nextCycle(); }, 150);
    }
    return true;
}

function finish() {
    state.gamePhase = 'finished';
    state.isBusy = true;
    state.canPressSpace = false;
    state.resultScreenVisible = false;
    
    if (state.interval) { clearInterval(state.interval); state.interval = null; }
    elements.gameArea.classList.add('hidden');
    
    setTimeout(() => {
        let m = 0;
        state.parts.forEach(p => { 
            if(state.selection[p] && state.target[p] && state.selection[p].id === state.target[p].id) m++; 
        });
        const p = Math.round((m/4)*100);
        
        if (p === 100) { state.streak++; state.lastResult = 'win'; }
        else if (p < 75) { state.streak = 0; state.lastResult = 'lose'; }
        else { state.lastResult = 'almost'; }
        
        if (state.streak > state.maxStreak) state.maxStreak = state.streak;
        
        elements.resultPercent.textContent = p + '%';
        elements.resultText.textContent = p === 100 ? "Идеально! 🎉" : (p >= 75 ? "Почти! 🤏🏻" : "Попробуй еще раз...");
        render(elements.resultTarget, state.target);
        render(elements.resultPlayer, state.selection);
        updateStats();
        
        savePlayerData();
        
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
        
        if (p === 100) playSound('victory');
        else if (p >= 75) playSound('vic');
        else playSound('loss');
        
        if (tg && tg.sendData) {
            tg.sendData(JSON.stringify({
                round: state.round,
                streak: state.streak,
                maxStreak: state.maxStreak,
                lastResult: p
            }));
        }
    }, 400);
}

function reset() {
    if (state.resetBtnLock || state.isBusy) return;
    
    playRepeatSound();
    
    state.resetBtnLock = true;
    state.canPressSpace = false;
    elements.resultAgainBtn.disabled = true;
    
    let welcomeText = "Начнём?";
    if (state.lastResult === 'win') {
        welcomeText = state.streak >= 50 ? "Максимальная сложность!" : "Сложность повысилась!";
    } else if (state.lastResult === 'almost') {
        welcomeText = "Сейчас получится!";
    } else if (state.lastResult === 'lose') {
        welcomeText = "Начнём сначала?";
    }

    state.round++;
    // Убраны строки elements.instruction.textContent и elements.instruction.classList.remove('show'), 
    // чтобы избежать мигания/скрытия текста до его появления.
    state.lastResult = null; 
    
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
        
        // 1. Возвращаем игровую область
        elements.gameArea.classList.remove('hidden'); 
        
        // 2. МГНОВЕННО ПОКАЗЫВАЕМ ТЕКСТ ИНСТРУКЦИИ
        setInstructionText(welcomeText, true); 

        // ГАРАНТИЯ ИСПРАВЛЕНИЯ: Устанавливаем готовность к приему ввода (пробела)
        state.isButtonReady = false;
        setTimeout(() => { 
            state.isButtonReady = true; 
            state.canPressSpace = true; 
        }, 300);
        
        elements.resultAgainBtn.disabled = false;
        elements.selectBtn.classList.remove('show');
        elements.selectBtn.classList.add('hidden');
        
        setTimeout(startIdle, 100);
    }, 400);
}

function updateStats() {
    const anim = (el, val) => {
        if (el.textContent != val) {
            el.classList.add('updating');
            setTimeout(() => { el.textContent = val; el.classList.remove('updating'); }, 300);
        }
    };
    anim(elements.round, state.round);
    anim(elements.streak, state.streak);
    anim(elements.maxStreak, state.maxStreak);
}

window.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        
        // Общие проверки
        if (state.isTimerActive || state.isBusy || state.gamePhase === 'memorizing' || state.gamePhase === 'creating') return;
        
        // Критическая проверка: разрешено ли нажатие
        if (!state.canPressSpace) return;
        
        // Дополнительные проверки фазы
        if (state.gamePhase === 'finished' && !state.resultScreenVisible) return;
        if (state.gamePhase === 'selecting' && !state.canSelect) return;
        
        unlockAudio();
        
        if (state.gamePhase === 'idle' && !state.startBtnLock) startGame();
        else if (state.gamePhase === 'selecting' && state.canSelect) select();
        else if (state.gamePhase === 'finished' && !state.resetBtnLock && state.resultScreenVisible) reset();
    }
});


document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - (window.lastTouchEnd || 0) < 300) e.preventDefault();
    window.lastTouchEnd = now;
}, { passive: false });

document.addEventListener('selectstart', e => { e.preventDefault(); return false; });
document.addEventListener('contextmenu', e => { e.preventDefault(); return false; });

window.onload = async () => {
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: ГАРАНТИЯ МГНОВЕННОГО ОТОБРАЖЕНИЯ "ЗАГРУЗКА..."
    if (elements.instruction) {
        // 1. Установка текста и мгновенное отображение
        setInstructionText("Загрузка... 0%", true); 
    }
    
    if (elements.startBtn) {
        elements.startBtn.classList.add('hidden');
        elements.startBtn.disabled = true;
    }
    
    initSupabase(); 
    initAudioSystem();

    // Safety Timeout (4 сек)
    setTimeout(() => {
        if (!state.resourcesReady) {
            console.warn('Safety timeout: forcing game start');
            state.forceLoaded = true;
            checkLoadingProgress();
        }
    }, 4000);

    try {
        loadImages();
        loadPlayerData();
        
        if (tg) tg.ready();
        setupTouchHandlers();
        
        state.gamePhase = 'idle';
        createRandomOrder();

    } catch (error) {
        console.error('Критическая ошибка:', error);
        state.forceLoaded = true;
        checkLoadingProgress();
    }
};