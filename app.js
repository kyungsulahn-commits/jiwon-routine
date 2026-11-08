/**
 * 안지원 육아 루틴 관리 웹앱 (Jiwon Routine Manager)
 * Core Application Logic
 */

// Local Storage Key
const STORAGE_KEY = 'jiwon_routine_store_v1';

// Default State
const DEFAULT_STATE = {
  baby: {
    name: '안지원',
    birthDate: '2026-07-07'
  },
  currentAssigneeFilter: 'ALL', // 'ALL' | '경술' | '지은'
  tasks: [
    {
      id: 'task-1',
      title: '브레짜 내부 세척',
      cycleDays: 7,
      assignee: '경술',
      notes: '구연산 1티스푼 넣고 세척 모드 작동',
      lastCompletedDate: '2026-11-01',
      nextDueDate: '2026-11-08',
      history: [
        { date: '2026-11-01', completedBy: '경술', timestamp: 1793500000000 }
      ]
    },
    {
      id: 'task-2',
      title: '브레짜 물통 교체 & 세척',
      cycleDays: 1,
      assignee: '지은',
      notes: '정수기 물 45도 맞춤 채우기',
      lastCompletedDate: '2026-11-07',
      nextDueDate: '2026-11-08',
      history: [
        { date: '2026-11-07', completedBy: '지은', timestamp: 1794000000000 }
      ]
    },
    {
      id: 'task-3',
      title: '젖병 & 쪽쪽이 열탕 소독',
      cycleDays: 3,
      assignee: '경술',
      notes: '끓는 물 3분간 열탕 소독',
      lastCompletedDate: '2026-11-04',
      nextDueDate: '2026-11-07', // 지연(Overdue) 테스트용
      history: [
        { date: '2026-11-04', completedBy: '경술', timestamp: 1793750000000 }
      ]
    },
    {
      id: 'task-4',
      title: '아기 침구 & 손수건 세탁',
      cycleDays: 4,
      assignee: '지은',
      notes: '아기 전용 세제 30도 울코스',
      lastCompletedDate: '2026-11-07',
      nextDueDate: '2026-11-11', // 다가오는 일
      history: [
        { date: '2026-11-07', completedBy: '지은', timestamp: 1794000000000 }
      ]
    },
    {
      id: 'task-5',
      title: '아기 장난감 / 치발기 소독',
      cycleDays: 5,
      assignee: '공통',
      notes: '소독티슈 닦고 자연 건조',
      lastCompletedDate: '2026-11-05',
      nextDueDate: '2026-11-10', // 다가오는 일
      history: [
        { date: '2026-11-05', completedBy: '지은', timestamp: 1793850000000 }
      ]
    }
  ]
};

// Global App State
let state = loadState();

// Calendar State
let currentCalYear = 2026;
let currentCalMonth = 10; // 0-indexed: 10 = 11월
let selectedCalDate = '2026-11-08';

// Target Task for Complete Modal
let activeCompletingTaskId = null;

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  // Clear any stale browser cache to ensure latest calendar logic runs
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key))).catch(() => {});
  }

  // Sync calendar date with today
  const todayStr = getTodayStr();
  const [tY, tM] = todayStr.split('-').map(Number);
  currentCalYear = tY;
  currentCalMonth = tM - 1;
  selectedCalDate = todayStr;

  renderBabyInfo();
  renderRoutines();
  renderCalendar();
  initIcons();

  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=4').catch((err) => {
      console.log('SW registration note:', err);
    });
  }
});

function initIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

// ================= STORAGE =================
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Ensure baby info exists
      if (!parsed.baby) parsed.baby = DEFAULT_STATE.baby;
      if (!parsed.tasks) parsed.tasks = DEFAULT_STATE.tasks;
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load storage, using default', e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state', e);
  }
}

// ================= DATE HELPERS =================
function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Number(days));
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

function diffDaysBetweenDates(dateStrA, dateStrB) {
  const [y1, m1, d1] = dateStrA.split('-').map(Number);
  const [y2, m2, d2] = dateStrB.split('-').map(Number);
  const dt1 = new Date(y1, m1 - 1, d1).getTime();
  const dt2 = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((dt2 - dt1) / (1000 * 60 * 60 * 24));
}

function diffDaysFromToday(targetDateStr) {
  return diffDaysBetweenDates(getTodayStr(), targetDateStr);
}

// Check if a routine is projected to occur on a target future/today date
function isTaskScheduledOnDate(task, targetDateStr, todayStr) {
  // 과거 날짜는 예정으로 찍지 않음 (실제 완료 기록만 달력에 표시)
  if (targetDateStr < todayStr) return false;

  const cycle = task.cycleDays || 1;
  const firstDue = task.nextDueDate;

  if (firstDue < todayStr) {
    // 이미 지연(Overdue)된 경우: 오늘은 무조건 수행 대상
    if (targetDateStr === todayStr) return true;
    // 그 이후 미래 날짜: 오늘 기준 주기 투영
    const diff = diffDaysBetweenDates(todayStr, targetDateStr);
    return diff > 0 && diff % cycle === 0;
  } else {
    // 정상 미래 또는 오늘 예정
    const diff = diffDaysBetweenDates(firstDue, targetDateStr);
    return diff >= 0 && diff % cycle === 0;
  }
}

function formatKoreanDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${y}년 ${m}월 ${d}일 (${days[dt.getDay()]})`;
}

// ================= BABY PROFILE RENDER =================
function renderBabyInfo() {
  const baby = state.baby || DEFAULT_STATE.baby;
  document.getElementById('babyNameDisplay').textContent = baby.name;
  
  // Calculate D-Day
  const todayStr = getTodayStr();
  const [by, bm, bd] = baby.birthDate.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  
  const birthDt = new Date(by, bm - 1, bd).getTime();
  const todayDt = new Date(ty, tm - 1, td).getTime();
  const diffDays = Math.floor((todayDt - birthDt) / (1000 * 60 * 60 * 24));
  
  const ddayBadge = document.getElementById('babyDdayBadge');
  const ageDetail = document.getElementById('babyAgeDetail');

  if (diffDays >= 0) {
    const ddayNum = diffDays + 1; // 태어난 날을 1일로 계산
    ddayBadge.textContent = `D+${ddayNum}일`;
    
    // Calculate months and days
    const totalMonths = Math.floor(diffDays / 30.4375);
    const remainDays = Math.floor(diffDays % 30.4375);
    ageDetail.textContent = totalMonths > 0 ? `${totalMonths}개월 ${remainDays}일차` : `${diffDays}일차`;
  } else {
    ddayBadge.textContent = `D${diffDays}일`;
    ageDetail.textContent = '출산 예정';
  }

  // Sync settings inputs
  const nameInput = document.getElementById('settingBabyName');
  const birthInput = document.getElementById('settingBabyBirth');
  if (nameInput) nameInput.value = baby.name;
  if (birthInput) birthInput.value = baby.birthDate;

  // Header current date
  const curDateEl = document.getElementById('currentDateStr');
  if (curDateEl) curDateEl.textContent = formatKoreanDate(todayStr);
}

// ================= ROUTINE DASHBOARD RENDER =================
function setAssigneeFilter(filter) {
  state.currentAssigneeFilter = filter;
  
  // Update Buttons UI
  ['ALL', '경술', '지은'].forEach((item) => {
    const btn = document.getElementById(`filterBtn-${item}`);
    if (!btn) return;
    if (item === filter) {
      btn.className = 'px-3 py-1.5 rounded-lg transition font-semibold bg-white text-indigo-600 shadow-xs';
    } else {
      btn.className = 'px-3 py-1.5 rounded-lg transition text-slate-500 hover:text-slate-800';
    }
  });

  renderRoutines();
  renderCalendar();
}

function filterByAssignee(tasks) {
  const filter = state.currentAssigneeFilter;
  if (filter === 'ALL') return tasks;
  return tasks.filter((t) => t.assignee === filter || t.assignee === '공통');
}

function renderRoutines() {
  const todayStr = getTodayStr();
  const allFiltered = filterByAssignee(state.tasks);

  const overdueTasks = [];
  const todayTasks = [];
  const completedTodayTasks = [];
  const upcomingTasks = [];

  allFiltered.forEach((task) => {
    // Check if completed today
    const wasCompletedToday = (task.history || []).some((h) => h.date === todayStr);

    const diff = diffDaysFromToday(task.nextDueDate);

    if (wasCompletedToday) {
      completedTodayTasks.push(task);
    }

    if (diff < 0) {
      // Overdue
      overdueTasks.push(task);
    } else if (diff === 0) {
      // Today
      if (!wasCompletedToday) {
        todayTasks.push(task);
      }
    } else {
      // Upcoming
      upcomingTasks.push(task);
    }
  });

  // Sort upcoming by nextDueDate
  upcomingTasks.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

  // Update Summary Banner
  const totalRelevantToday = todayTasks.length + completedTodayTasks.length;
  const completedCount = completedTodayTasks.length;
  const percent = totalRelevantToday > 0 ? Math.round((completedCount / totalRelevantToday) * 100) : 100;

  document.getElementById('progressHeadline').textContent = 
    totalRelevantToday === 0 ? '오늘 예정된 루틴이 모두 완료되었어요! 🎉' : `오늘 루틴 ${totalRelevantToday}개 중 ${completedCount}개 완료 ✨`;
  document.getElementById('progressPercent').textContent = `${percent}%`;
  document.getElementById('progressBar').style.width = `${percent}%`;
  document.getElementById('progressOverdueText').textContent = `⚠️ 기한 지난 일: ${overdueTasks.length}건`;

  // Render Overdue Section
  const overdueSection = document.getElementById('overdueSection');
  const overdueList = document.getElementById('overdueList');
  document.getElementById('overdueCountBadge').textContent = overdueTasks.length;

  if (overdueTasks.length === 0) {
    overdueSection.classList.add('hidden');
  } else {
    overdueSection.classList.remove('hidden');
    overdueList.innerHTML = overdueTasks.map((task) => renderTaskCard(task, 'overdue')).join('');
  }

  // Render Today Section
  const todayList = document.getElementById('todayList');
  document.getElementById('todayCountBadge').textContent = todayTasks.length;
  if (todayTasks.length === 0) {
    todayList.innerHTML = `
      <div class="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 text-center text-xs text-indigo-700 font-medium">
        오늘 해야 할 루틴이 없습니다. 멋져요! 👍
      </div>
    `;
  } else {
    todayList.innerHTML = todayTasks.map((task) => renderTaskCard(task, 'today')).join('');
  }

  // Render Completed Today Section
  const completedSection = document.getElementById('completedTodaySection');
  const completedList = document.getElementById('completedTodayList');
  document.getElementById('completedCountBadge').textContent = completedTodayTasks.length;

  if (completedTodayTasks.length === 0) {
    completedSection.classList.add('hidden');
  } else {
    completedSection.classList.remove('hidden');
    completedList.innerHTML = completedTodayTasks.map((task) => renderTaskCard(task, 'completed')).join('');
  }

  // Render Upcoming Section
  const upcomingList = document.getElementById('upcomingList');
  if (upcomingTasks.length === 0) {
    upcomingList.innerHTML = `
      <div class="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center text-xs text-slate-400">
        다가오는 루틴이 없습니다.
      </div>
    `;
  } else {
    upcomingList.innerHTML = upcomingTasks.map((task) => renderUpcomingCard(task)).join('');
  }

  // Update total routines badge
  const totalBadge = document.getElementById('totalRoutinesCountBadge');
  if (totalBadge) totalBadge.textContent = state.tasks.length;

  // Also render routine management list
  renderRoutineManageList();

  initIcons();
}

// ================= ROUTINE SUB-VIEWS TOGGLE =================
let currentRoutineSubView = 'today'; // 'today' | 'manage'

function switchRoutineSubView(view) {
  currentRoutineSubView = view;
  const todayContainer = document.getElementById('subView-today');
  const manageContainer = document.getElementById('subView-manage');
  const todayBtn = document.getElementById('subViewBtn-today');
  const manageBtn = document.getElementById('subViewBtn-manage');

  // Make sure we are in routines tab first
  switchTab('routines');

  if (view === 'today') {
    todayContainer.classList.remove('hidden');
    manageContainer.classList.add('hidden');
    todayBtn.className = 'flex-1 py-2 text-xs font-bold rounded-xl transition bg-white text-indigo-600 shadow-xs flex items-center justify-center space-x-1.5';
    manageBtn.className = 'flex-1 py-2 text-xs font-medium rounded-xl transition text-slate-500 hover:text-slate-800 flex items-center justify-center space-x-1.5';
  } else {
    todayContainer.classList.add('hidden');
    manageContainer.classList.remove('hidden');
    todayBtn.className = 'flex-1 py-2 text-xs font-medium rounded-xl transition text-slate-500 hover:text-slate-800 flex items-center justify-center space-x-1.5';
    manageBtn.className = 'flex-1 py-2 text-xs font-bold rounded-xl transition bg-white text-indigo-600 shadow-xs flex items-center justify-center space-x-1.5';
    renderRoutineManageList();
  }
}

// ================= ROUTINE MANAGEMENT LIST RENDER =================
function renderRoutineManageList() {
  const container = document.getElementById('allRoutinesManageList');
  if (!container) return;

  const searchInput = document.getElementById('manageSearchInput');
  const query = (searchInput ? searchInput.value.trim().toLowerCase() : '');
  const sortSelect = document.getElementById('manageSortSelect');
  const sortBy = sortSelect ? sortSelect.value : 'nextDue';

  // Filter by assignee & search query
  let filtered = filterByAssignee(state.tasks);
  if (query) {
    filtered = filtered.filter((t) => 
      t.title.toLowerCase().includes(query) || (t.notes && t.notes.toLowerCase().includes(query))
    );
  }

  // Sort
  filtered.sort((a, b) => {
    if (sortBy === 'nextDue') {
      return a.nextDueDate.localeCompare(b.nextDueDate);
    } else if (sortBy === 'cycle') {
      return a.cycleDays - b.cycleDays;
    } else if (sortBy === 'name') {
      return a.title.localeCompare(b.title);
    }
    return 0;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-8 text-center border border-slate-100 card-shadow space-y-3">
        <div class="text-3xl">🔍</div>
        <p class="text-xs text-slate-500 font-medium">검색 결과 또는 등록된 루틴이 없습니다.</p>
        <button onclick="openAddTaskModal()" class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition">
          + 새 루틴 추가하기
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((task) => {
    const diff = diffDaysFromToday(task.nextDueDate);
    const historyCount = (task.history || []).length;
    const isOverdue = diff < 0;
    const isToday = diff === 0;

    let statusBadge = '';
    if (isOverdue) {
      statusBadge = `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">${Math.abs(diff)}일 지남</span>`;
    } else if (isToday) {
      statusBadge = `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">오늘 예정</span>`;
    } else {
      statusBadge = `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">D-${diff}</span>`;
    }

    return `
      <div class="bg-white rounded-2xl p-4 border border-slate-100 card-shadow space-y-3 transition hover:border-indigo-100">
        <div class="flex items-start justify-between space-x-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center space-x-2 flex-wrap gap-y-1">
              <h4 class="font-bold text-sm text-slate-800">${escapeHtml(task.title)}</h4>
              ${getAssigneeBadge(task.assignee)}
              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                ${task.cycleDays}일마다
              </span>
              ${statusBadge}
            </div>
            ${task.notes ? `<p class="text-xs text-slate-500 mt-1.5 bg-slate-50 p-2 rounded-xl border border-slate-100/60">${escapeHtml(task.notes)}</p>` : ''}
          </div>
        </div>

        <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-50">
          <div class="flex items-center space-x-2">
            <span>최근 완료: <strong>${task.lastCompletedDate || '없음'}</strong></span>
            <span>·</span>
            <span>다음 예정: <strong>${task.nextDueDate}</strong></span>
            <span>·</span>
            <span class="text-indigo-600 font-semibold">총 ${historyCount}회 완료</span>
          </div>

          <!-- Action Buttons -->
          <div class="flex items-center space-x-1.5">
            <button onclick="triggerCompleteTask('${task.id}')" title="오늘 완료 체크" class="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-xs font-bold transition">
              <i data-lucide="check" class="w-4 h-4"></i>
            </button>
            <button onclick="openEditTaskModal('${task.id}')" title="루틴 수정" class="p-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition">
              <i data-lucide="edit-3" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteTaskDirectly('${task.id}')" title="루틴 삭제" class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-400 transition">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  initIcons();
}

function deleteTaskDirectly(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  if (!confirm(`'${task.title}' 루틴을 정말 삭제하시겠습니까?`)) return;

  state.tasks = state.tasks.filter((t) => t.id !== taskId);
  saveState();
  renderRoutines();
  renderCalendar();
}

function getAssigneeBadge(assignee) {
  if (assignee === '경술') {
    return `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full badge-ks">경술 💚</span>`;
  } else if (assignee === '지은') {
    return `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full badge-je">지은 💖</span>`;
  }
  return `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full badge-all">공통 👨‍👩‍👧</span>`;
}

function renderTaskCard(task, type) {
  const isOverdue = type === 'overdue';
  const isCompleted = type === 'completed';
  const diff = diffDaysFromToday(task.nextDueDate);
  const diffText = diff < 0 ? `${Math.abs(diff)}일 지남` : diff === 0 ? '오늘' : `D-${diff}`;

  const borderClass = isOverdue 
    ? 'border-rose-200 bg-rose-50/30' 
    : isCompleted 
    ? 'border-blue-100 bg-blue-50/20 opacity-80' 
    : 'border-slate-100 bg-white';

  return `
    <div class="p-3.5 rounded-2xl border ${borderClass} card-shadow flex items-center justify-between space-x-3 transition">
      <div class="flex items-center space-x-3 flex-1 min-w-0" onclick="openEditTaskModal('${task.id}')">
        <div class="flex-shrink-0">
          ${isCompleted ? `
            <div class="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              ✓
            </div>
          ` : `
            <button onclick="event.stopPropagation(); triggerCompleteTask('${task.id}')" 
              class="w-8 h-8 rounded-xl border-2 ${isOverdue ? 'border-rose-400 bg-white hover:bg-rose-50' : 'border-indigo-400 bg-white hover:bg-indigo-50'} flex items-center justify-center transition active:scale-90">
            </button>
          `}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center space-x-2">
            <h4 class="font-bold text-sm text-slate-800 truncate ${isCompleted ? 'line-through text-slate-400' : ''}">
              ${escapeHtml(task.title)}
            </h4>
            ${getAssigneeBadge(task.assignee)}
          </div>
          <div class="flex items-center space-x-2 text-xs text-slate-400 mt-1">
            <span>주기: ${task.cycleDays}일마다</span>
            ${task.notes ? `<span class="truncate">· ${escapeHtml(task.notes)}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        ${isOverdue ? `
          <span class="text-xs font-bold text-rose-600 bg-rose-100 px-2.5 py-1 rounded-xl urgent-pulse">
            ${diffText}
          </span>
        ` : isCompleted ? `
          <div class="flex items-center space-x-1.5">
            <span class="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-xl">
              완료됨
            </span>
            <button onclick="event.stopPropagation(); cancelCompleteTask('${task.id}')" title="완료 취소" class="text-xs font-semibold text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-xl transition active:scale-95">
              취소
            </button>
          </div>
        ` : `
          <button onclick="triggerCompleteTask('${task.id}')" class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-bold transition active:scale-95">
            완료 체크
          </button>
        `}
      </div>
    </div>
  `;
}

function renderUpcomingCard(task) {
  const diff = diffDaysFromToday(task.nextDueDate);
  return `
    <div onclick="openEditTaskModal('${task.id}')" class="p-3 bg-white hover:bg-slate-50/80 rounded-2xl border border-slate-100 card-shadow flex items-center justify-between cursor-pointer transition">
      <div class="flex items-center space-x-3 min-w-0">
        <div class="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">
          ${task.cycleDays}d
        </div>
        <div class="min-w-0">
          <div class="flex items-center space-x-2">
            <span class="font-bold text-xs text-slate-800 truncate">${escapeHtml(task.title)}</span>
            ${getAssigneeBadge(task.assignee)}
          </div>
          <p class="text-[11px] text-slate-400 mt-0.5">예정일: ${task.nextDueDate}</p>
        </div>
      </div>
      <span class="text-xs font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600">
        D-${diff}
      </span>
    </div>
  `;
}

// ================= TASK COMPLETION LOGIC =================
function triggerCompleteTask(taskId, defaultDate) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  activeCompletingTaskId = taskId;
  document.getElementById('completeTaskTitle').textContent = task.title;

  const dateInput = document.getElementById('completeDateInput');
  if (dateInput) {
    dateInput.value = defaultDate || getTodayStr();
  }

  const modal = document.getElementById('completeModal');
  modal.classList.remove('hidden');
}

function closeCompleteModal() {
  document.getElementById('completeModal').classList.add('hidden');
  activeCompletingTaskId = null;
}

function confirmCompleteTask(person) {
  if (!activeCompletingTaskId) return;

  const task = state.tasks.find((t) => t.id === activeCompletingTaskId);
  if (!task) return;

  const dateInput = document.getElementById('completeDateInput');
  // 실제 완료한 날짜 (사용자가 변경했거나 오늘)
  const actualCompletedDate = (dateInput && dateInput.value) ? dateInput.value : getTodayStr();

  // 실제 완료한 날짜를 기준으로 다음 예정일을 +cycleDays 로 재계산!
  task.lastCompletedDate = actualCompletedDate;
  task.nextDueDate = addDaysToDateStr(actualCompletedDate, task.cycleDays);

  if (!task.history) task.history = [];
  task.history.push({
    date: actualCompletedDate,
    completedBy: person,
    timestamp: Date.now()
  });

  saveState();
  closeCompleteModal();

  // Trigger celebration confetti!
  triggerConfetti();

  // Re-render routines & calendar
  renderRoutines();
  renderCalendar();
}

// ================= TASK COMPLETION UNDO (완료 취소 및 이전 주기 복원) =================
function cancelCompleteTask(taskId, targetTimestamp) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (!confirm(`'${task.title}' 완료를 취소하시겠습니까?\n이전 예정 주기로 다시 되돌아갑니다.`)) return;

  if (!task.history || task.history.length === 0) {
    // 기록이 없더라도 오늘 할 일로 리셋
    task.lastCompletedDate = '';
    task.nextDueDate = getTodayStr();
    saveState();
    renderRoutines();
    renderCalendar();
    return;
  }

  if (targetTimestamp) {
    // 특정 타임스탬프의 완료 이력 제거
    task.history = task.history.filter((h) => h.timestamp !== targetTimestamp);
  } else {
    // 가장 최근 완료 이력 제거
    task.history.pop();
  }

  // 이전 완료 이력을 찾아 기준일 및 다음 예정일 복원
  if (task.history.length > 0) {
    task.history.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const previousCompleted = task.history[task.history.length - 1];
    task.lastCompletedDate = previousCompleted.date;
    task.nextDueDate = addDaysToDateStr(previousCompleted.date, task.cycleDays);
  } else {
    // 이전 완료 기록이 아예 없는 경우: 오늘 완료해야 할 일로 복구
    task.lastCompletedDate = '';
    task.nextDueDate = getTodayStr();
  }

  saveState();
  renderRoutines();
  renderCalendar();
}

function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 }
    });
  }
}

// ================= CALENDAR RENDER =================
function changeCalendarMonth(offset) {
  currentCalMonth += offset;
  if (currentCalMonth < 0) {
    currentCalMonth = 11;
    currentCalYear -= 1;
  } else if (currentCalMonth > 11) {
    currentCalMonth = 0;
    currentCalYear += 1;
  }
  renderCalendar();
}

function goTodayCalendar() {
  const todayStr = getTodayStr();
  const [tY, tM] = todayStr.split('-').map(Number);
  currentCalYear = tY;
  currentCalMonth = tM - 1;
  selectedCalDate = todayStr;
  renderCalendar();
}

function selectCalendarDate(dateStr) {
  selectedCalDate = dateStr;
  renderCalendar();
}

function renderCalendar() {
  const monthTitle = document.getElementById('calendarMonthTitle');
  monthTitle.textContent = `${currentCalYear}년 ${currentCalMonth + 1}월`;

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const firstDay = new Date(currentCalYear, currentCalMonth, 1).getDay();
  const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
  const todayStr = getTodayStr();

  // Previous month padding
  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day p-1 rounded-xl text-center text-xs text-slate-300 opacity-40';
    grid.appendChild(emptyCell);
  }

  // Days in current month
  for (let d = 1; d <= daysInMonth; d++) {
    const curDateStr = `${currentCalYear}-${String(currentCalMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = curDateStr === todayStr;
    const isSelected = curDateStr === selectedCalDate;

    // Filter tasks
    const relevantTasks = filterByAssignee(state.tasks);

    // Completed events on this date
    const completedOnThisDate = [];
    relevantTasks.forEach((t) => {
      (t.history || []).forEach((h) => {
        if (h.date === curDateStr) {
          completedOnThisDate.push({ task: t, history: h });
        }
      });
    });

    // Projected scheduled tasks on this date (Future repeating projection)
    const scheduledOnThisDate = relevantTasks.filter((t) => isTaskScheduledOnDate(t, curDateStr, todayStr));

    const cell = document.createElement('div');
    cell.className = `calendar-day p-1 rounded-xl flex flex-col items-center justify-between cursor-pointer text-xs font-semibold ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`;
    cell.onclick = () => selectCalendarDate(curDateStr);

    // Date number
    const dateNum = document.createElement('span');
    dateNum.className = `${isToday ? 'text-indigo-600 font-bold bg-indigo-50 w-6 h-6 rounded-full flex items-center justify-center' : 'text-slate-700'}`;
    dateNum.textContent = d;
    cell.appendChild(dateNum);

    // Dots/Badges Container (Color Coded by Person and Scheduled)
    const badgesCont = document.createElement('div');
    badgesCont.className = 'flex items-center space-x-1 mt-0.5';

    const hasKsCompleted = completedOnThisDate.some((item) => item.history.completedBy === '경술');
    const hasJeCompleted = completedOnThisDate.some((item) => item.history.completedBy === '지은');
    const hasOtherCompleted = completedOnThisDate.some((item) => item.history.completedBy !== '경술' && item.history.completedBy !== '지은');

    // 1. Green Dot: 경술 완료 (초록색 점)
    if (hasKsCompleted) {
      const dot = document.createElement('span');
      dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-xs';
      dot.title = '경술 완료';
      badgesCont.appendChild(dot);
    }
    // 2. Pink Dot: 지은 완료
    if (hasJeCompleted) {
      const dot = document.createElement('span');
      dot.className = 'w-1.5 h-1.5 rounded-full bg-pink-500 shadow-xs';
      dot.title = '지은 완료';
      badgesCont.appendChild(dot);
    }
    // 3. Purple Dot: 앞으로 해야 할 예정 루틴 (미래 주기 투영)
    if (scheduledOnThisDate.length > 0) {
      const dot = document.createElement('span');
      dot.className = 'w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-xs flex-shrink-0';
      dot.title = `예정된 루틴 (${scheduledOnThisDate.length}건)`;
      badgesCont.appendChild(dot);

      if (scheduledOnThisDate.length > 1) {
        const countSpan = document.createElement('span');
        countSpan.className = 'text-[9px] font-bold text-indigo-600 leading-none -ml-0.5';
        countSpan.textContent = scheduledOnThisDate.length;
        badgesCont.appendChild(countSpan);
      }
    }
    cell.appendChild(badgesCont);

    grid.appendChild(cell);
  }

  renderSelectedDatePanel();
}

function renderSelectedDatePanel() {
  const panel = document.getElementById('selectedDatePanel');
  const title = document.getElementById('selectedDateTitle');
  const statusBadge = document.getElementById('selectedDateStatusBadge');
  const list = document.getElementById('selectedDateTasksList');

  const todayStr = getTodayStr();
  title.textContent = `${formatKoreanDate(selectedCalDate)} 내역`;

  const isToday = selectedCalDate === todayStr;
  const isPast = selectedCalDate < todayStr;
  const isFuture = selectedCalDate > todayStr;

  if (isToday) {
    statusBadge.textContent = '오늘';
    statusBadge.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600';
  } else if (isPast) {
    statusBadge.textContent = '과거 기록';
    statusBadge.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500';
  } else {
    statusBadge.textContent = '앞으로의 예정';
    statusBadge.className = 'text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600';
  }

  const relevantTasks = filterByAssignee(state.tasks);

  // Completed on this date
  const completedList = [];
  relevantTasks.forEach((t) => {
    (t.history || []).forEach((h) => {
      if (h.date === selectedCalDate) {
        completedList.push({ task: t, history: h });
      }
    });
  });

  // Scheduled tasks on this date (projected by recurring cycle)
  const scheduledList = relevantTasks.filter((t) => isTaskScheduledOnDate(t, selectedCalDate, todayStr));

  if (completedList.length === 0 && scheduledList.length === 0) {
    list.innerHTML = `
      <p class="text-xs text-slate-400 py-3 text-center">
        이 날짜에는 완료된 기록이나 예정된 루틴이 없습니다.
      </p>
    `;
    return;
  }

  let html = '';

  // 1. Completed Tasks Section
  if (completedList.length > 0) {
    html += `<div class="text-[11px] font-bold text-blue-700 uppercase tracking-wider mb-1.5">이 날 완료한 일 (${completedList.length})</div>`;
    completedList.forEach((item) => {
      html += `
        <div class="p-2.5 bg-blue-50/40 border border-blue-100 rounded-xl flex items-center justify-between text-xs mb-1.5">
          <div class="flex items-center space-x-2">
            <span class="text-blue-600 font-bold">✓</span>
            <span class="font-bold text-slate-800">${escapeHtml(item.task.title)}</span>
          </div>
          <div class="flex items-center space-x-1.5">
            <span class="font-semibold px-2 py-0.5 rounded-md ${item.history.completedBy === '경술' ? 'badge-ks' : 'badge-je'}">
              ${item.history.completedBy} 님이 완료
            </span>
            <button onclick="cancelCompleteTask('${item.task.id}', ${item.history.timestamp})" title="완료 취소" class="text-[11px] font-bold text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-lg transition active:scale-95">
              취소
            </button>
          </div>
        </div>
      `;
    });
  }

  // 2. Scheduled Future/Today Tasks Section
  if (scheduledList.length > 0) {
    const label = isToday ? `오늘 해야 할 일 (${scheduledList.length})` : `이 날 해야 할 예정 루틴 (${scheduledList.length})`;
    html += `<div class="text-[11px] font-bold text-indigo-700 uppercase tracking-wider mt-3 mb-1.5">${label}</div>`;
    scheduledList.forEach((task) => {
      html += `
        <div class="p-2.5 bg-indigo-50/40 border border-indigo-100 rounded-xl flex items-center justify-between text-xs mb-1.5">
          <div class="flex items-center space-x-2 min-w-0">
            <span class="text-indigo-600 font-bold">⏳</span>
            <div class="min-w-0">
              <span class="font-bold text-slate-800 truncate">${escapeHtml(task.title)}</span>
              <span class="text-[10px] text-slate-400 block">${task.cycleDays}일 주기 반복</span>
            </div>
          </div>
          <div class="flex items-center space-x-1.5 flex-shrink-0">
            ${getAssigneeBadge(task.assignee)}
            <button onclick="triggerCompleteTask('${task.id}', '${selectedCalDate}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold transition active:scale-95">
              완료 체크
            </button>
          </div>
        </div>
      `;
    });
  }

  list.innerHTML = html;
}

// ================= CYCLE HELPERS & PRESETS =================
function calculateDaysFromUnit(num, unit) {
  const n = parseInt(num, 10) || 1;
  if (unit === 'weeks') return n * 7;
  if (unit === 'months') return n * 30;
  return n; // 'days'
}

function updateCyclePreview() {
  const numInput = document.getElementById('taskCycleNumberInput');
  const unitInput = document.getElementById('taskCycleUnitInput');
  const preview = document.getElementById('cyclePreviewText');
  if (!numInput || !unitInput || !preview) return;

  const num = parseInt(numInput.value, 10) || 1;
  const unit = unitInput.value;
  const totalDays = calculateDaysFromUnit(num, unit);

  let desc = '';
  if (unit === 'weeks') {
    desc = `${num}주마다 (${totalDays}일 간격)`;
  } else if (unit === 'months') {
    desc = `${num}개월마다 (${totalDays}일 간격)`;
  } else {
    desc = `${num}일마다`;
  }

  preview.textContent = `${desc} 반복`;
}

function setCyclePreset(num, unit) {
  const numInput = document.getElementById('taskCycleNumberInput');
  const unitInput = document.getElementById('taskCycleUnitInput');
  if (numInput) numInput.value = num;
  if (unitInput) unitInput.value = unit;
  updateCyclePreview();
}

// ================= TASK MODAL (ADD / EDIT) =================
function openAddTaskModal() {
  document.getElementById('taskModalTitle').textContent = '새로운 주기적 루틴 추가';
  document.getElementById('taskIdInput').value = '';
  document.getElementById('taskTitleInput').value = '';
  document.getElementById('taskCycleNumberInput').value = '1';
  document.getElementById('taskCycleUnitInput').value = 'weeks';
  updateCyclePreview();

  document.getElementById('taskAssigneeInput').value = '경술';
  document.getElementById('taskLastDateInput').value = getTodayStr();
  document.getElementById('taskNotesInput').value = '';
  document.getElementById('deleteTaskBtn').classList.add('hidden');

  document.getElementById('taskModal').classList.remove('hidden');
}

function openEditTaskModal(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  document.getElementById('taskModalTitle').textContent = '루틴 수정하기';
  document.getElementById('taskIdInput').value = task.id;
  document.getElementById('taskTitleInput').value = task.title;

  // Convert cycleDays into best-fit number and unit
  const days = task.cycleDays || 1;
  const numInput = document.getElementById('taskCycleNumberInput');
  const unitInput = document.getElementById('taskCycleUnitInput');

  if (days >= 30 && days % 30 === 0) {
    numInput.value = days / 30;
    unitInput.value = 'months';
  } else if (days >= 7 && days % 7 === 0) {
    numInput.value = days / 7;
    unitInput.value = 'weeks';
  } else {
    numInput.value = days;
    unitInput.value = 'days';
  }
  updateCyclePreview();

  document.getElementById('taskAssigneeInput').value = task.assignee;
  document.getElementById('taskLastDateInput').value = task.lastCompletedDate || getTodayStr();
  document.getElementById('taskNotesInput').value = task.notes || '';
  document.getElementById('deleteTaskBtn').classList.remove('hidden');

  document.getElementById('taskModal').classList.remove('hidden');
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.add('hidden');
}

function handleSaveTask(e) {
  e.preventDefault();

  const id = document.getElementById('taskIdInput').value;
  const title = document.getElementById('taskTitleInput').value.trim();

  // Custom cycle calculation
  const num = parseInt(document.getElementById('taskCycleNumberInput').value, 10) || 1;
  const unit = document.getElementById('taskCycleUnitInput').value;
  const cycleDays = calculateDaysFromUnit(num, unit);

  const assignee = document.getElementById('taskAssigneeInput').value;
  const lastCompletedDate = document.getElementById('taskLastDateInput').value || getTodayStr();
  const notes = document.getElementById('taskNotesInput').value.trim();

  // Next due date = lastCompletedDate + cycleDays
  const nextDueDate = addDaysToDateStr(lastCompletedDate, cycleDays);

  if (id) {
    // Edit existing
    const existing = state.tasks.find((t) => t.id === id);
    if (existing) {
      existing.title = title;
      existing.cycleDays = cycleDays;
      existing.assignee = assignee;
      existing.lastCompletedDate = lastCompletedDate;
      existing.nextDueDate = nextDueDate;
      existing.notes = notes;
    }
  } else {
    // Add new
    const newTask = {
      id: 'task-' + Date.now(),
      title,
      cycleDays,
      assignee,
      lastCompletedDate,
      nextDueDate,
      notes,
      history: []
    };
    state.tasks.push(newTask);
  }

  saveState();
  closeTaskModal();
  renderRoutines();
  renderCalendar();
}

function handleDeleteTask() {
  const id = document.getElementById('taskIdInput').value;
  if (!id) return;
  if (!confirm('이 루틴을 삭제하시겠습니까?')) return;

  state.tasks = state.tasks.filter((t) => t.id !== id);
  saveState();
  closeTaskModal();
  renderRoutines();
  renderCalendar();
}

// ================= BABY SETTINGS =================
function openBabyEditModal() {
  const baby = state.baby || DEFAULT_STATE.baby;
  document.getElementById('modalBabyName').value = baby.name;
  document.getElementById('modalBabyBirth').value = baby.birthDate;
  document.getElementById('babyModal').classList.remove('hidden');
}

function closeBabyModal() {
  document.getElementById('babyModal').classList.add('hidden');
}

function saveBabyFromModal() {
  const name = document.getElementById('modalBabyName').value.trim();
  const birthDate = document.getElementById('modalBabyBirth').value;
  if (!name || !birthDate) return;

  state.baby = { name, birthDate };
  saveState();
  closeBabyModal();
  renderBabyInfo();
}

function saveBabySettings() {
  const name = document.getElementById('settingBabyName').value.trim();
  const birthDate = document.getElementById('settingBabyBirth').value;
  if (!name || !birthDate) return;

  state.baby = { name, birthDate };
  saveState();
  renderBabyInfo();
  alert('아기 정보가 저장되었습니다!');
}

// ================= BACKUP & EXPORT =================
function exportDataJson() {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `지원루틴_백업_${getTodayStr()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importDataJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.tasks && imported.baby) {
        state = imported;
        saveState();
        renderBabyInfo();
        renderRoutines();
        renderCalendar();
        alert('데이터가 성공적으로 복원되었습니다!');
      } else {
        alert('유효하지 않은 백업 파일 형식입니다.');
      }
    } catch (err) {
      alert('파일을 읽는 도중 오류가 발생했습니다.');
    }
  };
  reader.readAsText(file);
}

function resetToSampleData() {
  if (!confirm('정말 기본 예시 데이터로 초기화하시겠습니까? 현재 기록이 모두 삭제됩니다.')) return;
  state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  saveState();
  renderBabyInfo();
  renderRoutines();
  renderCalendar();
  alert('초기 데이터로 재설정되었습니다.');
}

// ================= TAB NAVIGATION =================
function switchTab(tabName) {
  const tabs = ['routines', 'calendar', 'timelog', 'growth', 'diary', 'settings'];

  tabs.forEach((tab) => {
    const section = document.getElementById(`tab-${tab}`);
    if (section) {
      if (tab === tabName) {
        section.classList.remove('hidden');
      } else {
        section.classList.add('hidden');
      }
    }

    const navBtn = document.getElementById(`navBtn-${tab}`);
    if (navBtn) {
      if (tab === tabName) {
        navBtn.className = 'flex flex-col items-center space-y-1 py-1 px-2.5 rounded-xl text-indigo-600 font-semibold text-xs transition';
      } else {
        navBtn.className = 'flex flex-col items-center space-y-1 py-1 px-2.5 rounded-xl text-slate-400 hover:text-slate-600 font-medium text-xs transition';
      }
    }
  });

  if (tabName === 'calendar') {
    renderCalendar();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================= UTILITIES =================
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
