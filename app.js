import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  get,
  getDatabase,
  limitToFirst,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  remove,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";
import { createMinesweeper } from "./minesweeper.js?v=20261018-minesweeper";

const ADMIN_LOGIN = "admin@admin";
const ADMIN_AUTH_EMAIL = "admin@admin.com";
const MAX_INLINE_IMAGE_BYTES = 450 * 1024;

// ── 포인트 설계 ─────────────────────────────────────────────
// 꾸준히 하는 학생(매일 출석 + 게임 포인트 상한)은 하루 약 44P → 2,000P까지 약 6~7주.
// 가볍게 하는 학생(출석 + 중급 1판)은 하루 약 26P → 약 2달 반.
const POINT_GOAL = 2000;
const ATTENDANCE_POINTS = 10;
const STREAK_BONUS_EVERY = 7;
const STREAK_BONUS_POINTS = 30;
const DAILY_GAME_POINT_CAP = 30;
const GAME_RULES = {
  beginner: { label: "초급", rows: 9, cols: 9, mines: 10, points: 5, minMs: 2000 },
  intermediate: { label: "중급", rows: 16, cols: 16, mines: 40, points: 12, minMs: 8000 },
  expert: { label: "고급", rows: 16, cols: 30, mines: 99, points: 30, minMs: 25000 },
};
const MONTHLY_REWARDS = {
  expert: [100, 60, 40],
  intermediate: [60, 40, 20],
  beginner: [30, 20, 10],
};
const DIFFICULTIES = ["beginner", "intermediate", "expert"];
const TUTORIAL_HIDDEN_KEY = "mc.minesweeperTutorialHidden";
const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 3600000;

const $ = (selector) => document.querySelector(selector);
const setupRequired = firebaseConfig.apiKey.startsWith("PASTE_");

const authScreen = $("#auth-screen");
const pendingScreen = $("#pending-screen");
const pendingTitle = $("#pending-title");
const pendingMessage = $("#pending-message");
const appShell = $("#app-shell");
const showLoginButton = $("#show-login-button");
const showSignupButton = $("#show-signup-button");
const loginPanel = $("#login-panel");
const signupPanel = $("#signup-panel");
const loginForm = $("#login-form");
const signupForm = $("#signup-form");
const authMessage = $("#auth-message");
const signupMessage = $("#signup-message");
const pageTitle = $("#page-title");
const todayLabel = $("#today-label");
const leaderboardList = $("#leaderboard-list");
const rankCaption = $("#rank-caption");
const storeList = $("#store-list");
const profileMessage = $("#profile-message");
const purchaseHistoryList = $("#purchase-history-list");
const adminNavButton = $("#admin-nav-button");
const productForm = $("#product-form");
const adminProductList = $("#admin-product-list");
const adminUsedList = $("#admin-used-list");
const pointGrantForm = $("#point-grant-form");
const grantStudentSelect = $("#grant-student-id");
const grantPointsInput = $("#grant-points");
const grantReasonInput = $("#grant-reason");
const adminMessage = $("#admin-message");
const productDialog = $("#product-dialog");
const dialogProductImage = $("#dialog-product-image");
const dialogProductPrice = $("#dialog-product-price");
const dialogProductTitle = $("#dialog-product-title");
const dialogProductDescription = $("#dialog-product-description");
const dialogBalance = $("#dialog-balance");
const dialogAfterBalance = $("#dialog-after-balance");
const buyProductButton = $("#buy-product-button");
const purchaseMessage = $("#purchase-message");
const attendanceButton = $("#attendance-button");
const tutorialDialog = $("#tutorial-dialog");
const resultDialog = $("#result-dialog");
const msStatus = $("#ms-status");
const msTimer = $("#ms-timer");
const msMinesLeft = $("#ms-mines-left");
const flagModeButton = $("#ms-flag-mode");
const rewardPreview = $("#reward-preview");
const rewardSubmitButton = $("#reward-submit-button");

const pageNames = {
  home: "홈",
  game: "지뢰찾기",
  leaderboard: "순위",
  store: "포인트 상점",
  profile: "내 정보",
  admin: "선생님 관리",
};

let auth;
let db;
let currentUser = null;
let currentProfile = null;
let selectedProduct = null;
let adminStudents = [];
let unsubscribers = [];
let rankUnsubscribe = null;
let serverOffsetMs = 0;
let attendance = null;
let gameDaily = null;
let monthBests = {};
let allTimeBests = {};
let currentDifficulty = "beginner";
let currentRankTab = "beginner";
let game = null;
let gameStarted = false;
let timerHandle = null;
let tutorialShownThisSession = false;
let rewardPlan = null;
let toastTimer = null;
let sessionDay = null;

if (setupRequired) {
  setMessage(authMessage, "Firebase 설정값을 firebase-config.js에 넣어주세요.");
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);

  onValue(ref(db, ".info/serverTimeOffset"), (snapshot) => {
    serverOffsetMs = Number(snapshot.val() ?? 0);
  });

  showLoginButton.addEventListener("click", () => setAuthMode("login"));
  showSignupButton.addEventListener("click", () => setAuthMode("signup"));
  loginForm.addEventListener("submit", handleLogin);
  $("#forgot-password-button").addEventListener("click", handlePasswordReset);
  signupForm.addEventListener("submit", handleSignup);
  $("#logout-button").addEventListener("click", () => signOut(auth));
  $("#pending-logout-button").addEventListener("click", () => signOut(auth));
  productForm.addEventListener("submit", handleProductSave);
  pointGrantForm.addEventListener("submit", handlePointGrant);
  buyProductButton.addEventListener("click", handlePurchase);
  attendanceButton.addEventListener("click", handleAttendance);
  $("#reward-preview-button").addEventListener("click", previewMonthlyRewards);
  $("#monthly-reward-form").addEventListener("submit", handleMonthlyRewards);
  $("#reward-month").addEventListener("change", () => {
    rewardPlan = null;
    rewardSubmitButton.disabled = true;
    rewardPreview.innerHTML = "";
  });

  document.querySelectorAll("[data-target-page]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.targetPage));
  });
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => selectDifficulty(button.dataset.difficulty));
  });
  document.querySelectorAll("[data-rank-tab]").forEach((button) => {
    button.addEventListener("click", () => selectRankTab(button.dataset.rankTab));
  });

  setupGame();
  setupTutorial();
  setAuthMode("login");

  // 자정이나 월이 바뀐 채로 화면을 켜 두면 날짜 기준 구독을 새로 연다.
  setInterval(() => {
    if (!currentUser || sessionDay === null || !document.body.classList.contains("is-authenticated")) return;
    if (kstDay(serverNow()) === sessionDay) return;
    const activePage = document.querySelector(".page.active-page")?.dataset.page ?? "home";
    clearSubscriptions();
    enterApp(activePage === "game" ? "home" : activePage);
  }, 60000);

  onAuthStateChanged(auth, async (user) => {
    clearSubscriptions();
    currentUser = user;
    currentProfile = null;
    selectedProduct = null;
    attendance = null;
    gameDaily = null;
    monthBests = {};
    allTimeBests = {};

    if (!user) {
      showSignedOut();
      return;
    }

    currentProfile = await ensureProfile(user);
    if (!isApproved(currentProfile, user)) {
      waitForApproval();
      return;
    }
    enterApp();
  });
}

function enterApp(page = "home") {
  sessionDay = kstDay(serverNow());
  showSignedIn();
  renderProfile(currentUser, currentProfile);
  showPage(page);
  subscribeProfile();
  subscribeAttendance();
  subscribeGameDaily();
  subscribeMyBests();
  selectRankTab(currentRankTab);
  subscribeStore();
  subscribePurchaseHistory();
  subscribeAdminTools();
}

function waitForApproval() {
  showPendingApproval(currentProfile);
  const unsubscribe = onValue(ref(db, `users/${currentUser.uid}`), async (snapshot) => {
    if (!snapshot.exists()) return;
    currentProfile = snapshot.val();
    if (!isApproved(currentProfile, currentUser)) {
      showPendingApproval(currentProfile);
      return;
    }
    clearSubscriptions();
    await syncLeaderboardProfile(currentUser.uid, currentProfile);
    enterApp();
  });
  unsubscribers.push(unsubscribe);
}

function showPendingApproval(profile) {
  document.body.classList.remove("is-authenticated");
  authScreen.hidden = true;
  appShell.hidden = true;
  pendingScreen.hidden = false;

  const rejected = profile?.status === "rejected";
  pendingTitle.textContent = rejected ? "가입이 승인되지 않았습니다" : "선생님 승인을 기다리고 있어요";
  pendingMessage.textContent = rejected
    ? "선생님에게 확인해 주세요."
    : `${profile?.name ?? "학생"} 님의 가입 신청이 접수되었습니다. 선생님이 승인하면 이 화면이 자동으로 넘어갑니다.`;
}

// ── 로그인 / 가입 ───────────────────────────────────────────

async function handleLogin(event) {
  event.preventDefault();
  setMessage(authMessage, "로그인하는 중입니다.");
  const rawLogin = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const email = normalizeLoginEmail(rawLogin);

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    setMessage(authMessage, authErrorMessage(error.code));
  }
}

async function handlePasswordReset() {
  const email = $("#login-email").value.trim();
  if (!email) {
    setMessage(authMessage, "위 이메일 칸에 가입한 이메일을 먼저 입력하세요.");
    $("#login-email").focus();
    return;
  }
  if (normalizeLoginEmail(email) === ADMIN_AUTH_EMAIL) {
    setMessage(authMessage, "관리자 계정은 Firebase 콘솔에서 비밀번호를 바꿔주세요.");
    return;
  }

  try {
    setMessage(authMessage, "재설정 메일을 보내는 중입니다.");
    auth.languageCode = "ko";
    await sendPasswordResetEmail(auth, email);
    setMessage(authMessage, `${email}로 비밀번호 재설정 메일을 보냈습니다. 메일함(스팸함 포함)에서 링크를 눌러 새 비밀번호를 정하세요.`);
  } catch (error) {
    setMessage(authMessage, authErrorMessage(error.code));
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const name = $("#signup-name").value.trim();
  const email = $("#signup-email").value.trim();
  const password = $("#signup-password").value;

  try {
    setMessage(signupMessage, "가입하는 중입니다.");
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    await set(ref(db, `users/${credential.user.uid}`), {
      name,
      email,
      authEmail: credential.user.email,
      role: "student",
      status: "pending",
      points: 0,
      todayResult: "-",
      createdAt: serverTimestamp(),
    });
    setMessage(signupMessage, "가입 신청이 완료되었습니다. 선생님 승인을 기다려 주세요.");
  } catch (error) {
    setMessage(signupMessage, authErrorMessage(error.code));
  }
}

async function ensureProfile(user) {
  const userRef = ref(db, `users/${user.uid}`);
  const snapshot = await get(userRef);
  const isAdmin = user.email === ADMIN_AUTH_EMAIL;

  if (snapshot.exists()) {
    const profile = snapshot.val();
    const updates = {};

    if (isAdmin && profile.role !== "teacher") {
      updates.role = "teacher";
      updates.name = "선생님";
      updates.email = ADMIN_LOGIN;
      updates.authEmail = ADMIN_AUTH_EMAIL;
    }
    if (!profile.name && user.displayName) updates.name = user.displayName;

    if (Object.keys(updates).length) {
      await update(userRef, updates);
      const nextProfile = { ...profile, ...updates };
      await syncLeaderboardProfile(user.uid, nextProfile);
      return nextProfile;
    }
    await syncLeaderboardProfile(user.uid, profile);
    return profile;
  }

  const profile = {
    name: isAdmin ? "선생님" : user.displayName || "학생",
    email: isAdmin ? ADMIN_LOGIN : user.email,
    authEmail: user.email,
    role: isAdmin ? "teacher" : "student",
    ...(isAdmin ? {} : { status: "pending" }),
    points: 0,
    todayResult: "-",
    createdAt: serverTimestamp(),
  };
  await set(userRef, profile);
  await syncLeaderboardProfile(user.uid, profile);
  return profile;
}

function subscribeProfile() {
  const unsubscribe = onValue(ref(db, `users/${currentUser.uid}`), (snapshot) => {
    if (!snapshot.exists()) return;
    currentProfile = snapshot.val();
    if (!isApproved(currentProfile, currentUser)) {
      clearSubscriptions();
      waitForApproval();
      return;
    }
    renderProfile(currentUser, currentProfile);
    void syncLeaderboardProfile(currentUser.uid, currentProfile);
  });
  unsubscribers.push(unsubscribe);
}

function renderProfile(user, profile) {
  const name = profile?.name || user.displayName || "학생";
  const teacher = isTeacher(profile, user);
  const points = Number(profile?.points ?? 0);

  $("#my-points").textContent = formatNumber(points);
  $("#header-points-value").textContent = formatNumber(points);
  $("#profile-points").textContent = formatNumber(points);
  $("#profile-name").textContent = name;
  $("#profile-email").textContent = profile?.email ?? user.email;
  $("#profile-role").textContent = teacher ? "선생님" : "학생";
  $("#greeting").textContent = `${name} 님, ${greetingByHour()}`;
  profileMessage.textContent = teacher ? "선생님 계정은 포인트와 게임 기록이 저장되지 않아요." : "";
  adminNavButton.hidden = !teacher;
  document.body.classList.toggle("is-teacher", teacher);

  const ratio = Math.min(1, points / POINT_GOAL);
  $("#goal-meter-fill").style.width = `${ratio * 100}%`;
  $("#goal-meter").setAttribute("aria-valuenow", String(points));
  $("#goal-text").textContent = points >= POINT_GOAL
    ? `목표 ${formatNumber(POINT_GOAL)}P 달성! 상점을 확인해 보세요`
    : `목표 ${formatNumber(POINT_GOAL)}P까지 ${formatNumber(POINT_GOAL - points)}P 남았어요`;
  renderAttendance();
}

async function syncLeaderboardProfile(uid, profile) {
  if (!uid) return;

  let latestProfile = profile;

  try {
    const profileSnapshot = await get(ref(db, `users/${uid}`));
    if (profileSnapshot.exists()) latestProfile = profileSnapshot.val();
  } catch (error) {
    latestProfile = profile;
  }

  if (latestProfile?.role !== "student") {
    await remove(ref(db, `leaderboardUsers/${uid}`));
    return;
  }

  if (!isApproved(latestProfile)) return;

  await set(ref(db, `leaderboardUsers/${uid}`), {
    name: latestProfile?.name || "학생",
    points: Number(latestProfile?.points ?? 0),
    todayResult: latestProfile?.todayResult ?? "-",
    updatedAt: serverTimestamp(),
  });
}

function setAuthMode(mode) {
  const isSignup = mode === "signup";
  loginPanel.classList.toggle("active-auth-panel", !isSignup);
  signupPanel.classList.toggle("active-auth-panel", isSignup);
  showLoginButton.classList.toggle("active", !isSignup);
  showSignupButton.classList.toggle("active", isSignup);
  showLoginButton.setAttribute("aria-selected", String(!isSignup));
  showSignupButton.setAttribute("aria-selected", String(isSignup));
  setMessage(authMessage, isSignup ? "이름, 이메일, 비밀번호를 입력하세요." : "이메일과 비밀번호로 로그인하세요.");
}

function showSignedIn() {
  document.body.classList.add("is-authenticated");
  authScreen.hidden = true;
  pendingScreen.hidden = true;
  appShell.hidden = false;
}

function showSignedOut() {
  document.body.classList.remove("is-authenticated");
  authScreen.hidden = false;
  pendingScreen.hidden = true;
  appShell.hidden = true;
  setAuthMode("login");
}

function showPage(page) {
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active-page", section.dataset.page === page);
  });
  document.querySelectorAll(".bottom-nav [data-target-page]").forEach((button) => {
    button.classList.toggle("active", button.dataset.targetPage === page);
  });

  pageTitle.textContent = pageNames[page] ?? "아침 챌린지";
  todayLabel.textContent = formatKoreanDate(serverNow());
  window.scrollTo({ top: 0 });

  if (page === "game") {
    if (!gameStarted) startNewGame();
    requestAnimationFrame(() => game.fitToWidth());
    if (!tutorialShownThisSession && !isTutorialHidden()) {
      tutorialShownThisSession = true;
      tutorialDialog.showModal();
    }
  }
}

// ── 출석 체크 ───────────────────────────────────────────────

function subscribeAttendance() {
  const unsubscribe = onValue(ref(db, `attendance/${currentUser.uid}`), (snapshot) => {
    attendance = snapshot.exists() ? snapshot.val() : null;
    renderAttendance();
  });
  unsubscribers.push(unsubscribe);
}

function renderAttendance() {
  if (!currentUser) return;
  const today = kstDay(serverNow());
  const checkedToday = attendance?.day === today;
  const alive = attendance && (attendance.day === today || attendance.day === today - 1);
  const streak = alive ? Number(attendance.streak ?? 0) : 0;
  const teacher = isTeacher(currentProfile, currentUser);

  $("#streak-count").textContent = streak;
  $("#attendance-total").textContent = `누적 ${Number(attendance?.total ?? 0)}일`;
  $("#attendance-title").textContent = teacher
    ? "선생님은 출석 체크를 하지 않아요"
    : checkedToday
      ? `출석 완료! ${streak}일 연속`
      : streak
        ? `${streak}일 연속 중 · 오늘도 이어가요`
        : "오늘 아직 출석 전이에요";

  const inCycle = streak === 0 ? 0 : ((streak - 1) % STREAK_BONUS_EVERY) + 1;
  $("#streak-dots").innerHTML = Array.from({ length: STREAK_BONUS_EVERY }, (_, i) => {
    const filled = i < inCycle;
    const bonus = i === STREAK_BONUS_EVERY - 1;
    return `<span class="streak-dot${filled ? " filled" : ""}${bonus ? " bonus" : ""}">${bonus ? "+30" : i + 1}</span>`;
  }).join("");

  attendanceButton.disabled = teacher || checkedToday;
  const willBonus = (streak + (checkedToday ? 0 : 1)) % STREAK_BONUS_EVERY === 0;
  attendanceButton.textContent = checkedToday
    ? "내일 또 만나요"
    : `출석하기 +${ATTENDANCE_POINTS + (willBonus ? STREAK_BONUS_POINTS : 0)}P`;
  attendanceButton.classList.toggle("is-done", checkedToday);
}

async function handleAttendance() {
  if (!currentUser || isTeacher(currentProfile, currentUser)) return;
  const today = kstDay(serverNow());
  if (attendance?.day === today) return;

  attendanceButton.disabled = true;
  let streak;
  try {
    const latest = (await get(ref(db, `attendance/${currentUser.uid}`))).val();
    if (latest?.day === today) return;
    streak = latest && latest.day === today - 1 ? Number(latest.streak ?? 0) + 1 : 1;
    const total = Number(latest?.total ?? 0) + 1;
    // 출석 기록 세 곳을 한 번에 저장한다(하나라도 실패하면 모두 저장되지 않음).
    await update(ref(db), {
      [`attendance/${currentUser.uid}`]: { day: today, streak, total, at: serverTimestamp() },
      [`attendanceDays/${today}/${currentUser.uid}`]: { name: currentProfile?.name ?? "학생", at: serverTimestamp() },
      [`users/${currentUser.uid}/todayResult`]: `${streak}일 연속 출석`,
    });
  } catch (error) {
    attendanceButton.disabled = false;
    showToast("출석 체크에 실패했어요. 잠시 후 다시 눌러 주세요.");
    return;
  }

  // 출석은 이미 기록됐으므로, 포인트 반영은 실패해도 몇 번 더 시도한다.
  const bonus = streak % STREAK_BONUS_EVERY === 0 ? STREAK_BONUS_POINTS : 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await addMyPoints(ATTENDANCE_POINTS + bonus);
      showToast(bonus
        ? `${streak}일 연속 출석! +${ATTENDANCE_POINTS}P, 보너스 +${bonus}P`
        : `출석 완료! +${ATTENDANCE_POINTS}P`);
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  showToast("출석은 됐지만 포인트 반영에 실패했어요. 선생님께 말씀해 주세요.");
}

// ── 지뢰찾기 ────────────────────────────────────────────────

function setupGame() {
  game = createMinesweeper($("#ms-board"), {
    onStart: () => {
      startTimer();
      msStatus.textContent = "깃발: PC는 오른쪽 클릭, 폰은 길게 누르기";
      if (canSaveGame()) void bumpStat(currentDifficulty, "plays");
    },
    onChange: ({ minesLeft }) => {
      msMinesLeft.textContent = minesLeft;
    },
    onWin: (result) => void handleWin(result),
    onLose: () => {
      stopTimer();
      msStatus.textContent = "펑! 지뢰를 밟았어요. 새 게임으로 다시 도전!";
      openResult({
        eyebrow: GAME_RULES[currentDifficulty].label,
        title: "아쉬워요!",
        time: "",
        detail: "지뢰를 밟았어요. 첫 칸은 항상 안전하니 다시 도전해 보세요.",
        lost: true,
      });
    },
  });

  $("#ms-restart").addEventListener("click", startNewGame);
  flagModeButton.addEventListener("click", () => {
    const next = flagModeButton.getAttribute("aria-pressed") !== "true";
    flagModeButton.setAttribute("aria-pressed", String(next));
    $("#ms-flag-mode-label").textContent = next ? "깃발 모드 켜짐" : "깃발 모드 꺼짐";
    game.setFlagMode(next);
  });
  $("#ms-help").addEventListener("click", () => tutorialDialog.showModal());
  $("#result-again").addEventListener("click", () => {
    resultDialog.close();
    startNewGame();
  });
  $("#result-rank").addEventListener("click", () => {
    resultDialog.close();
    selectRankTab(currentDifficulty);
    showPage("leaderboard");
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => game.fitToWidth(), 120);
  });
}

function selectDifficulty(difficulty) {
  if (!GAME_RULES[difficulty]) return;
  if (game.getState() === "playing" && difficulty !== currentDifficulty && !confirm("진행 중인 게임을 그만두고 난이도를 바꿀까요?")) {
    return;
  }
  currentDifficulty = difficulty;
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.classList.toggle("active", button.dataset.difficulty === difficulty);
  });
  startNewGame();
}

function startNewGame() {
  const rule = GAME_RULES[currentDifficulty];
  // 고급은 폰 화면에서 세로로 돌려 같은 칸 수(16×30)를 유지한다.
  const vertical = currentDifficulty === "expert" && window.innerWidth < 720;
  game.start({
    rows: vertical ? rule.cols : rule.rows,
    cols: vertical ? rule.rows : rule.cols,
    mines: rule.mines,
  });
  gameStarted = true;
  stopTimer();
  msTimer.textContent = "0.0";
  msStatus.textContent = "아무 칸이나 눌러서 시작하세요. 첫 칸은 항상 안전해요.";
}

function startTimer() {
  stopTimer();
  timerHandle = setInterval(() => {
    msTimer.textContent = (game.getElapsedMs() / 1000).toFixed(1);
  }, 100);
}

function stopTimer() {
  clearInterval(timerHandle);
  timerHandle = null;
}

function canSaveGame() {
  return Boolean(currentUser) && !isTeacher(currentProfile, currentUser);
}

async function handleWin({ timeMs }) {
  stopTimer();
  const difficulty = currentDifficulty;
  const rule = GAME_RULES[difficulty];
  msTimer.textContent = (timeMs / 1000).toFixed(1);
  msStatus.textContent = `${rule.label} 성공! ${formatSeconds(timeMs)}`;

  openResult({
    eyebrow: rule.label,
    title: "성공!",
    time: formatSeconds(timeMs),
    detail: canSaveGame() ? "기록을 저장하는 중이에요…" : "선생님 계정은 기록과 포인트가 저장되지 않아요.",
  });
  if (!canSaveGame()) return;

  if (timeMs < rule.minMs) {
    $("#result-detail").textContent = "기록이 비정상적으로 빨라서 저장하지 않았어요.";
    return;
  }

  // 포인트와 기록은 따로 저장해서, 하나가 실패해도 나머지 결과는 정확히 알려 준다.
  const [points, monthBest, allTimeBest] = await Promise.allSettled([
    awardGamePoints(rule.points),
    saveMonthRecord(difficulty, timeMs),
    saveAllTimeBest(difficulty, timeMs),
    bumpStat(difficulty, "wins"),
  ]);
  const rank = await getMonthRank(difficulty, currentUser.uid).catch(() => null);

  const lines = [];
  if (points.status === "rejected") {
    lines.push("포인트를 반영하지 못했어요");
  } else if (points.value > 0) {
    lines.push(`+${points.value}P 획득!${points.value < rule.points ? " (오늘 게임 포인트 상한 도달)" : ""}`);
  } else {
    lines.push(`오늘 게임 포인트 ${DAILY_GAME_POINT_CAP}P를 다 모았어요. 기록은 저장돼요.`);
  }
  if (monthBest.status === "rejected") lines.push("기록을 저장하지 못했어요");
  else if (allTimeBest.value) lines.push("내 역대 최고 기록 갱신!");
  else if (monthBest.value) lines.push("이번 달 내 최고 기록 갱신!");
  if (rank) lines.push(`이번 달 ${rule.label} ${rank}위`);
  $("#result-detail").textContent = lines.join(" · ");
}

function openResult({ eyebrow, title, time, detail, lost = false }) {
  $("#result-eyebrow").textContent = eyebrow;
  $("#result-title").textContent = title;
  $("#result-time").textContent = time;
  $("#result-time").hidden = !time;
  $("#result-detail").textContent = detail;
  resultDialog.classList.toggle("is-lost", lost);
  if (!resultDialog.open) resultDialog.showModal();
}

async function awardGamePoints(points) {
  const today = kstDay(serverNow());
  let granted = 0;
  const result = await runTransaction(ref(db, `gameDaily/${currentUser.uid}`), (current) => {
    const used = current?.day === today ? Number(current.points ?? 0) : 0;
    granted = Math.max(0, Math.min(points, DAILY_GAME_POINT_CAP - used));
    return { day: today, points: used + granted };
  });
  if (!result.committed || granted <= 0) return 0;
  await addMyPoints(granted);
  return granted;
}

async function saveMonthRecord(difficulty, timeMs) {
  const month = kstMonthKey(serverNow());
  const result = await runTransaction(ref(db, `msRecords/${month}/${difficulty}/${currentUser.uid}`), (current) => {
    if (current && Number(current.timeMs) <= timeMs) return undefined;
    return { name: currentProfile?.name ?? "학생", timeMs, at: serverNow() };
  });
  return result.committed;
}

async function saveAllTimeBest(difficulty, timeMs) {
  const result = await runTransaction(ref(db, `msBest/${currentUser.uid}/${difficulty}`), (current) => {
    if (current && Number(current.timeMs) <= timeMs) return undefined;
    return { timeMs, at: serverNow() };
  });
  return result.committed;
}

async function bumpStat(difficulty, field) {
  try {
    await runTransaction(ref(db, `gameStats/${currentUser.uid}/${difficulty}/${field}`), (current) => Number(current ?? 0) + 1);
  } catch (error) {
    // 통계는 부가 정보라 실패해도 게임 진행에 영향을 주지 않는다.
  }
}

async function getMonthRank(difficulty, uid) {
  const month = kstMonthKey(serverNow());
  const snapshot = await get(ref(db, `msRecords/${month}/${difficulty}`));
  const records = [];
  snapshot.forEach((child) => {
    records.push({ uid: child.key, timeMs: Number(child.val().timeMs) });
  });
  records.sort((a, b) => a.timeMs - b.timeMs);
  const index = records.findIndex((record) => record.uid === uid);
  return index >= 0 ? index + 1 : null;
}

function subscribeGameDaily() {
  const unsubscribe = onValue(ref(db, `gameDaily/${currentUser.uid}`), (snapshot) => {
    gameDaily = snapshot.exists() ? snapshot.val() : null;
    const today = kstDay(serverNow());
    const used = gameDaily?.day === today ? Number(gameDaily.points ?? 0) : 0;
    $("#daily-game-points").textContent = used;
    $("#daily-game-fill").style.width = `${Math.min(1, used / DAILY_GAME_POINT_CAP) * 100}%`;
  });
  unsubscribers.push(unsubscribe);
}

function subscribeMyBests() {
  const month = kstMonthKey(serverNow());
  DIFFICULTIES.forEach((difficulty) => {
    const unsubscribe = onValue(ref(db, `msRecords/${month}/${difficulty}/${currentUser.uid}`), (snapshot) => {
      monthBests[difficulty] = snapshot.exists() ? Number(snapshot.val().timeMs) : null;
      renderBestGrid($("#my-best-list"), monthBests);
    });
    unsubscribers.push(unsubscribe);
  });

  const unsubscribe = onValue(ref(db, `msBest/${currentUser.uid}`), (snapshot) => {
    const value = snapshot.val() ?? {};
    allTimeBests = Object.fromEntries(DIFFICULTIES.map((d) => [d, value[d] ? Number(value[d].timeMs) : null]));
    renderBestGrid($("#all-time-best-list"), allTimeBests);
  });
  unsubscribers.push(unsubscribe);
  renderBestGrid($("#my-best-list"), monthBests);
  renderBestGrid($("#all-time-best-list"), allTimeBests);
}

function renderBestGrid(container, bests) {
  container.innerHTML = DIFFICULTIES.map((difficulty) => {
    const time = bests[difficulty];
    return `
      <div class="best-item">
        <span class="best-label">${GAME_RULES[difficulty].label}</span>
        <span class="best-time">${time ? formatSeconds(time) : "-"}</span>
      </div>
    `;
  }).join("");
}

function setupTutorial() {
  $("#tutorial-close").addEventListener("click", () => {
    if ($("#tutorial-hide").checked) {
      try {
        localStorage.setItem(TUTORIAL_HIDDEN_KEY, "1");
      } catch (error) {
        // 저장소를 못 쓰는 브라우저에서는 이번 접속 동안만 숨긴다.
      }
    }
    tutorialDialog.close();
  });
  $("#show-tutorial-button").addEventListener("click", () => {
    $("#tutorial-hide").checked = false;
    try {
      localStorage.removeItem(TUTORIAL_HIDDEN_KEY);
    } catch (error) {
      // 무시
    }
    tutorialDialog.showModal();
  });
}

function isTutorialHidden() {
  try {
    return localStorage.getItem(TUTORIAL_HIDDEN_KEY) === "1";
  } catch (error) {
    return false;
  }
}

// ── 순위 ────────────────────────────────────────────────────

function selectRankTab(tab) {
  currentRankTab = tab;
  document.querySelectorAll("[data-rank-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.rankTab === tab);
  });
  rankUnsubscribe?.();
  rankUnsubscribe = null;
  if (!currentUser) return;
  leaderboardList.innerHTML = `<p class="empty-text">순위를 불러오고 있어요.</p>`;

  if (tab === "points") {
    rankCaption.textContent = "지금까지 모은 포인트 순위예요.";
    subscribePointsLeaderboard();
  } else {
    const month = kstMonthKey(serverNow());
    const [year, mon] = month.split("-");
    const rewards = MONTHLY_REWARDS[tab].join("·");
    rankCaption.textContent = `${year}년 ${Number(mon)}월 ${GAME_RULES[tab].label} 최단 기록 순위예요. 월말 TOP 3는 ${rewards}P 보너스!`;
    subscribeRecordLeaderboard(tab, month);
  }
}

function subscribeRecordLeaderboard(difficulty, month) {
  const recordsQuery = query(ref(db, `msRecords/${month}/${difficulty}`), orderByChild("timeMs"), limitToFirst(30));
  rankUnsubscribe = onValue(recordsQuery, (snapshot) => {
    const records = [];
    snapshot.forEach((child) => {
      records.push({ uid: child.key, ...child.val() });
    });
    records.sort((a, b) => Number(a.timeMs) - Number(b.timeMs));
    leaderboardList.innerHTML = records.length
      ? records.map((record, index) => renderRankItem({
          index,
          name: record.name,
          meta: formatDateTime(record.at),
          value: formatSeconds(record.timeMs),
          mine: record.uid === currentUser?.uid,
        })).join("")
      : `<p class="empty-text">이번 달 첫 기록의 주인공이 되어 보세요!</p>`;
  }, () => {
    leaderboardList.innerHTML = `<p class="empty-text">순위를 불러오지 못했어요. 데이터베이스 규칙을 확인해 주세요.</p>`;
  });
}

function subscribePointsLeaderboard() {
  const studentsQuery = query(ref(db, "leaderboardUsers"), orderByChild("points"), limitToLast(40));

  rankUnsubscribe = onValue(studentsQuery, async (snapshot) => {
    const students = [];
    const studentChecks = [];
    snapshot.forEach((child) => {
      studentChecks.push((async () => {
        const student = child.val();
        let profile = null;

        try {
          const profileSnapshot = await get(ref(db, `users/${child.key}`));
          profile = profileSnapshot.exists() ? profileSnapshot.val() : null;
        } catch (error) {
          profile = null;
        }

        if (profile?.role !== "student" || !isApproved(profile)) {
          if (isTeacher(currentProfile, currentUser)) {
            void remove(ref(db, `leaderboardUsers/${child.key}`));
          }
          return;
        }

        students.push({
          uid: child.key,
          name: profile?.name ?? student?.name,
          points: Number(profile?.points ?? student?.points ?? 0),
          todayResult: profile?.todayResult ?? student?.todayResult,
        });
      })());
    });
    await Promise.all(studentChecks);
    if (currentRankTab !== "points") return;
    students.sort((a, b) => b.points - a.points);

    leaderboardList.innerHTML = students.length
      ? students.map((student, index) => renderRankItem({
          index,
          name: student.name,
          meta: student.todayResult && student.todayResult !== "-" ? student.todayResult : "",
          value: `${formatNumber(student.points)}P`,
          mine: student.uid === currentUser?.uid,
        })).join("")
      : `<p class="empty-text">아직 학생 기록이 없습니다.</p>`;
  });
}

function renderRankItem({ index, name, meta, value, mine }) {
  const place = index + 1;
  return `
    <article class="rank-item${place <= 3 ? ` rank-top rank-${place}` : ""}${mine ? " rank-mine" : ""}">
      <span class="rank-number">${place}</span>
      <div class="rank-body">
        <p class="rank-name">${escapeHtml(name ?? "학생")}${mine ? `<span class="me-tag">나</span>` : ""}</p>
        ${meta ? `<p class="rank-meta">${escapeHtml(meta)}</p>` : ""}
      </div>
      <span class="rank-points">${escapeHtml(value)}</span>
    </article>
  `;
}

// ── 상점 ────────────────────────────────────────────────────

function subscribeStore() {
  const productsQuery = query(ref(db, "storeProducts"), orderByChild("createdAt"), limitToLast(50));

  const unsubscribe = onValue(productsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      storeList.innerHTML = `<p class="empty-text">아직 상점 상품이 없습니다.</p>`;
      return;
    }

    const products = [];
    snapshot.forEach((child) => {
      const product = child.val();
      if (product.visible !== false) products.push({ id: child.key, ...product });
    });
    sortStoreProducts(products);

    storeList.innerHTML = products.length
      ? products.map(renderProductItem).join("")
      : `<p class="empty-text">지금 살 수 있는 상품이 없습니다.</p>`;

    storeList.querySelectorAll("button[data-product-id]").forEach((button) => {
      const product = products.find((item) => item.id === button.dataset.productId);
      button.addEventListener("click", () => openProductDialog(product));
    });
  });
  unsubscribers.push(unsubscribe);
}

function sortStoreProducts(products) {
  products.sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0);
  });
}

function subscribePurchaseHistory() {
  const unsubscribe = onValue(ref(db, "purchases"), (snapshot) => {
    if (!snapshot.exists()) {
      purchaseHistoryList.innerHTML = `<p class="empty-text">아직 구매한 상품이 없습니다.</p>`;
      return;
    }

    const purchases = [];
    snapshot.forEach((child) => {
      const item = child.val();
      if (item.uid === currentUser.uid) purchases.push({ id: child.key, ...item });
    });
    purchases.sort((a, b) => getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt));

    purchaseHistoryList.innerHTML = purchases.length
      ? purchases.map(renderPurchaseHistoryItem).join("")
      : `<p class="empty-text">아직 구매한 상품이 없습니다.</p>`;

    purchaseHistoryList.querySelectorAll("button[data-use-purchase-id]").forEach((button) => {
      button.addEventListener("click", () => handlePurchaseUse(button.dataset.usePurchaseId));
    });
  });
  unsubscribers.push(unsubscribe);
}

function renderPurchaseHistoryItem(item) {
  const used = Boolean(item.used);
  const usedMeta = used ? ` · 사용 완료 ${formatDateTime(item.usedAt)}` : "";

  return `
    <article class="history-item">
      <div>
        <p class="rank-name">${escapeHtml(item.productTitle ?? "상품")}</p>
        <p class="rank-meta">${formatDateTime(item.createdAt)}${escapeHtml(usedMeta)}</p>
      </div>
      <div class="history-actions">
        <span class="rank-points">-${Number(item.price ?? 0)}P</span>
        <button class="inline-action-button" type="button" data-use-purchase-id="${escapeAttribute(item.id)}"${used ? " disabled" : ""}>${used ? "사용함" : "사용하기"}</button>
      </div>
    </article>
  `;
}

async function handlePurchaseUse(purchaseId) {
  if (!currentUser || !purchaseId) return;

  const ok = confirm("이 상품을 사용하시겠습니까? 선생님께 화면을 보여주세요.");
  if (!ok) return;

  try {
    await markPurchaseUsed(purchaseId);
  } catch (error) {
    setMessage(profileMessage, error.message || "구매 내역을 정리하지 못했습니다.");
  }
}

async function markPurchaseUsed(purchaseId) {
  const purchaseRef = ref(db, `purchases/${purchaseId}`);
  const snapshot = await get(purchaseRef);

  if (!snapshot.exists()) {
    throw new Error("구매 내역을 찾을 수 없습니다.");
  }

  const purchase = snapshot.val();
  if (purchase.uid !== currentUser.uid) {
    throw new Error("본인의 구매 내역만 사용할 수 있습니다.");
  }

  await set(purchaseRef, {
    ...purchase,
    used: true,
    usedAt: serverTimestamp(),
  });
}

function renderProductItem(product) {
  const image = product.imageUrl
    ? `<img class="product-image" src="${escapeAttribute(product.imageUrl)}" alt="" loading="lazy" />`
    : `<div class="product-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></div>`;
  const pinnedLabel = product.pinned ? `<span class="pill">누구나</span>` : `<span class="pill pill-hot">한정 1개</span>`;

  return `
    <article class="product-card">
      ${image}
      <div class="product-body">
        <div class="product-top">${pinnedLabel}<span class="product-price">${formatNumber(Number(product.price ?? 0))}P</span></div>
        <h3>${escapeHtml(product.title ?? "상품")}</h3>
        <p>${escapeHtml(product.description ?? "")}</p>
        <button type="button" data-product-id="${escapeAttribute(product.id)}">자세히 보기</button>
      </div>
    </article>
  `;
}

function openProductDialog(product) {
  selectedProduct = product;
  const price = Number(product.price ?? 0);
  const points = Number(currentProfile?.points ?? 0);
  renderImage(dialogProductImage, product.imageUrl);
  dialogProductPrice.textContent = `${formatNumber(price)}P`;
  dialogProductTitle.textContent = product.title ?? "상품";
  dialogProductDescription.textContent = product.description ?? "";
  dialogBalance.textContent = `현재 잔액 ${formatNumber(points)}P`;
  dialogAfterBalance.textContent = `구매 후 잔액 ${formatNumber(points - price)}P`;
  buyProductButton.disabled = points < price || isTeacher(currentProfile, currentUser);
  buyProductButton.textContent = points < price ? `${formatNumber(price - points)}P 더 모아야 해요` : "구매하기";
  setMessage(purchaseMessage, "버튼을 누르면 바로 포인트가 차감됩니다.");
  productDialog.showModal();
}

async function handlePurchase() {
  if (!currentUser || !selectedProduct) return;
  if (isTeacher(currentProfile, currentUser)) {
    setMessage(purchaseMessage, "선생님 계정은 구매하지 않습니다.");
    return;
  }

  const price = Number(selectedProduct.price ?? 0);
  const isPinnedProduct = Boolean(selectedProduct.pinned);
  buyProductButton.disabled = true;

  try {
    const result = await runTransaction(ref(db, `users/${currentUser.uid}/points`), (currentPoints) => {
      const points = Number(currentPoints ?? 0);
      if (points < price) return;
      return points - price;
    });

    if (!result.committed) {
      setMessage(purchaseMessage, "포인트가 부족해서 구매하지 못했습니다.");
      return;
    }

    const remaining = Number(result.snapshot.val() ?? 0);
    await syncLeaderboardProfile(currentUser.uid, { ...currentProfile, points: remaining });
    await set(push(ref(db, "purchases")), {
      uid: currentUser.uid,
      productId: selectedProduct.id,
      productTitle: selectedProduct.title,
      productPinned: isPinnedProduct,
      studentName: currentProfile?.name ?? currentUser.displayName ?? "",
      studentEmail: currentProfile?.email ?? currentUser.email ?? "",
      price,
      remainingPoints: remaining,
      used: false,
      createdAt: serverTimestamp(),
    });
    if (!isPinnedProduct) {
      await update(ref(db, `storeProducts/${selectedProduct.id}`), {
        visible: false,
        purchasedBy: currentUser.uid,
        purchasedAt: serverTimestamp(),
      });
    }
    setMessage(purchaseMessage, `구매되었습니다. 남은 잔액은 ${formatNumber(remaining)}P입니다.`);
    dialogBalance.textContent = `현재 잔액 ${formatNumber(remaining)}P`;
    dialogAfterBalance.textContent = `구매 후 잔액 ${formatNumber(remaining)}P`;
    selectedProduct = null;
    setTimeout(() => {
      productDialog.close();
      showPage("profile");
    }, 900);
  } catch (error) {
    setMessage(purchaseMessage, authErrorMessage(error.code));
    buyProductButton.disabled = false;
  }
}

// ── 선생님 관리 ─────────────────────────────────────────────

function subscribeAdminTools() {
  if (!isTeacher(currentProfile, currentUser)) return;
  $("#reward-month").value = previousMonthKey(kstMonthKey(serverNow()));
  subscribeAdminStudents();
  subscribeAdminProducts();
  subscribeAdminPurchases();
  subscribeAdminAttendance();
}

function subscribeAdminStudents() {
  const unsubscribe = onValue(ref(db, "users"), (snapshot) => {
    adminStudents = [];

    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const student = child.val();
        if (student.role === "teacher") {
          void remove(ref(db, `leaderboardUsers/${child.key}`));
        } else if (!isApproved(student)) {
          void remove(ref(db, `leaderboardUsers/${child.key}`));
        } else {
          adminStudents.push({ id: child.key, ...student });
          void syncLeaderboardProfile(child.key, student);
        }
      });
    }

    adminStudents.sort((a, b) => String(a.name ?? a.email ?? "").localeCompare(String(b.name ?? b.email ?? ""), "ko-KR"));
    renderGrantStudentOptions();
  });
  unsubscribers.push(unsubscribe);
}

function subscribeAdminAttendance() {
  const today = kstDay(serverNow());
  const unsubscribe = onValue(ref(db, `attendanceDays/${today}`), (snapshot) => {
    const names = [];
    snapshot.forEach((child) => {
      names.push({ name: child.val().name ?? "학생", at: child.val().at });
    });
    names.sort((a, b) => getTimestampValue(a.at) - getTimestampValue(b.at));
    $("#admin-attendance-summary").textContent = names.length
      ? `오늘 ${names.length}명이 출석했어요.`
      : "아직 출석한 학생이 없어요.";
    $("#admin-attendance-list").innerHTML = names
      .map((item) => `<span class="chip">${escapeHtml(item.name)}</span>`)
      .join("");
  });
  unsubscribers.push(unsubscribe);
}

function renderGrantStudentOptions() {
  if (!grantStudentSelect) return;

  grantStudentSelect.innerHTML = adminStudents.length
    ? `<option value="">학생을 선택하세요</option>${adminStudents.map((student) => {
        const label = `${student.name ?? student.email ?? "학생"} (${Number(student.points ?? 0)}P)`;
        return `<option value="${escapeAttribute(student.id)}">${escapeHtml(label)}</option>`;
      }).join("")}`
    : `<option value="">학생이 없습니다</option>`;
}

function subscribeAdminProducts() {
  const productsQuery = query(ref(db, "storeProducts"), orderByChild("createdAt"), limitToLast(100));

  const unsubscribe = onValue(productsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      adminProductList.innerHTML = `<p class="empty-text">등록된 상품이 없습니다.</p>`;
      return;
    }

    const products = [];
    snapshot.forEach((child) => {
      const product = child.val();
      if (product.visible !== false) products.push({ id: child.key, ...product });
    });
    sortStoreProducts(products);

    adminProductList.innerHTML = products.length
      ? products.map(renderAdminProductItem).join("")
      : `<p class="empty-text">등록된 상품이 없습니다.</p>`;

    adminProductList.querySelectorAll("button[data-delete-product-id]").forEach((button) => {
      button.addEventListener("click", () => handleProductDelete(button.dataset.deleteProductId));
    });
  });
  unsubscribers.push(unsubscribe);
}

function renderAdminProductItem(product) {
  const status = product.visible === false ? "삭제 또는 판매 완료" : product.pinned ? "고정 · 판매 중" : "판매 중";
  const disabled = product.visible === false ? " disabled" : "";

  return `
    <article class="admin-list-item">
      <div>
        <p class="rank-name">${escapeHtml(product.title ?? "상품")}</p>
        <p class="rank-meta">${Number(product.price ?? 0)}P · ${escapeHtml(status)}</p>
      </div>
      <button class="inline-danger-button" type="button" data-delete-product-id="${escapeAttribute(product.id)}"${disabled}>삭제</button>
    </article>
  `;
}

function subscribeAdminPurchases() {
  const unsubscribe = onValue(ref(db, "purchases"), (snapshot) => {
    const purchases = [];
    snapshot.forEach((child) => {
      purchases.push({ id: child.key, ...child.val() });
    });
    renderAdminPurchaseLists(purchases);
  });
  unsubscribers.push(unsubscribe);
}

function renderAdminPurchaseLists(purchases) {
  const usedItems = purchases
    .filter((item) => item.used)
    .sort((a, b) => getTimestampValue(b.usedAt) - getTimestampValue(a.usedAt));

  adminUsedList.innerHTML = usedItems.length
    ? usedItems.map(renderAdminUsedItem).join("")
    : `<p class="empty-text">아직 사용 기록이 없습니다.</p>`;

  adminUsedList.querySelectorAll("input[data-admin-check-use-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => handleAdminUsedCheck(checkbox.dataset.adminCheckUseId, checkbox.checked));
  });
}

function renderAdminUsedItem(item) {
  const buyer = item.studentName ?? item.studentEmail ?? item.uid ?? "학생";
  const pinned = item.productPinned ? " · 고정 상품" : "";
  const checked = Boolean(item.adminChecked);
  const checkedMeta = checked ? ` · 확인 ${formatDateTime(item.adminCheckedAt)}` : "";

  return `
    <article class="admin-list-item${checked ? " admin-list-item-checked" : ""}">
      <div>
        <p class="rank-name">${escapeHtml(item.productTitle ?? "상품")}</p>
        <p class="rank-meta">${escapeHtml(buyer)} · ${Number(item.price ?? 0)}P · 사용 ${formatDateTime(item.usedAt)} · 구매 ${formatDateTime(item.createdAt)}${escapeHtml(pinned)}${escapeHtml(checkedMeta)}</p>
      </div>
      <label class="admin-check-label">
        <input type="checkbox" data-admin-check-use-id="${escapeAttribute(item.id)}"${checked ? " checked" : ""} />
        확인
      </label>
    </article>
  `;
}

async function handleAdminUsedCheck(purchaseId, checked) {
  if (!isTeacher(currentProfile, currentUser) || !purchaseId) return;

  try {
    const purchaseRef = ref(db, `purchases/${purchaseId}`);
    const snapshot = await get(purchaseRef);
    if (!snapshot.exists()) return;

    const purchase = snapshot.val();
    await set(purchaseRef, {
      ...purchase,
      adminChecked: checked,
      adminCheckedAt: checked ? serverTimestamp() : null,
      adminCheckedBy: checked ? currentUser.uid : null,
    });
  } catch (error) {
    setMessage(adminMessage, error.message || "사용 기록 확인 상태를 바꾸지 못했습니다.");
  }
}

async function handleProductSave(event) {
  event.preventDefault();
  if (!isTeacher(currentProfile, currentUser)) return;

  try {
    setMessage(adminMessage, "상품을 저장하는 중입니다.");
    const title = $("#admin-product-title").value.trim();
    const description = $("#admin-product-description").value.trim();
    const price = Number($("#admin-product-price").value);
    const pinned = $("#admin-product-pinned").checked;
    const imageUrl = await getImageValue("#admin-product-image-url", "#admin-product-image-file");

    await set(push(ref(db, "storeProducts")), {
      title,
      description,
      price,
      pinned,
      imageUrl,
      visible: true,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
    });

    productForm.reset();
    $("#admin-product-price").value = 10;
    setMessage(adminMessage, "상점 상품을 저장했습니다.");
  } catch (error) {
    setMessage(adminMessage, error.message || "상품을 저장하지 못했습니다.");
  }
}

async function handleProductDelete(productId) {
  if (!isTeacher(currentProfile, currentUser) || !productId) return;

  const ok = confirm("이 상품을 상점에서 삭제할까요?");
  if (!ok) return;

  try {
    setMessage(adminMessage, "상품을 삭제하는 중입니다.");
    await remove(ref(db, `storeProducts/${productId}`));
    setMessage(adminMessage, "상품을 삭제했습니다.");
  } catch (error) {
    setMessage(adminMessage, error.message || "상품을 삭제하지 못했습니다.");
  }
}

async function handlePointGrant(event) {
  event.preventDefault();
  if (!isTeacher(currentProfile, currentUser)) return;

  const studentId = grantStudentSelect.value;
  const amount = Math.floor(Number(grantPointsInput.value));
  const reason = grantReasonInput.value.trim();
  const student = adminStudents.find((item) => item.id === studentId);

  if (!studentId) {
    setMessage(adminMessage, "포인트를 지급할 학생을 선택해주세요.");
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    setMessage(adminMessage, "지급할 포인트를 1점 이상 숫자로 입력해주세요.");
    return;
  }

  try {
    setMessage(adminMessage, "포인트를 지급하는 중입니다.");
    await grantPoints(studentId, student, amount, reason);
    pointGrantForm.reset();
    setMessage(adminMessage, `${student?.name ?? "학생"}에게 ${amount}P를 지급했습니다.`);
  } catch (error) {
    setMessage(adminMessage, error.message || "포인트를 지급하지 못했습니다.");
  }
}

async function grantPoints(studentId, student, amount, reason) {
  const pointResult = await runTransaction(ref(db, `users/${studentId}/points`), (currentPoints) => {
    return Number(currentPoints ?? 0) + amount;
  });

  if (!pointResult.committed) {
    throw new Error("포인트 지급이 반영되지 않았습니다.");
  }

  const totalPoints = Number(pointResult.snapshot.val() ?? 0);
  await syncLeaderboardProfile(studentId, { ...student, points: totalPoints });

  await set(push(ref(db, "pointGrants")), {
    uid: studentId,
    studentName: student?.name ?? student?.email ?? "학생",
    points: amount,
    reason,
    grantedBy: currentUser.uid,
    createdAt: serverTimestamp(),
  });
}

async function previewMonthlyRewards() {
  if (!isTeacher(currentProfile, currentUser)) return;
  const month = $("#reward-month").value;
  if (!month) return;

  rewardPlan = null;
  rewardSubmitButton.disabled = true;
  rewardSubmitButton.textContent = "보상 지급하기";
  if (month >= kstMonthKey(serverNow())) {
    rewardPreview.innerHTML = `<p class="empty-text">${month}은(는) 아직 끝나지 않은 달이에요. 다음 달에 지급할 수 있어요.</p>`;
    return;
  }
  rewardPreview.innerHTML = `<p class="empty-text">순위를 계산하고 있어요.</p>`;

  try {
    const done = await get(ref(db, `monthlyRewards/${month}`));
    if (done.exists()) {
      const record = done.val();
      const winners = Object.values(record.winners ?? {});
      const paid = record.paid ?? {};
      const unpaid = winners.map((item, index) => ({ ...item, index })).filter((item) => !paid[item.index]);
      rewardPreview.innerHTML = renderRewardRows(winners.map((item, index) => ({ ...item, index })), paid);
      rewardPreview.insertAdjacentHTML("afterbegin", `<p class="helper-text no-margin">${unpaid.length ? `지급이 중간에 멈췄어요. 남은 ${unpaid.length}건을 이어서 지급할 수 있어요.` : `이 달 보상은 이미 모두 지급했어요 (${formatDateTime(record.grantedAt)}).`}</p>`);
      if (unpaid.length) {
        rewardPlan = { month, plan: unpaid, resume: true };
        rewardSubmitButton.disabled = false;
        rewardSubmitButton.textContent = `남은 ${unpaid.length}건 지급하기`;
      }
      return;
    }

    const plan = [];
    for (const difficulty of [...DIFFICULTIES].reverse()) {
      const snapshot = await get(ref(db, `msRecords/${month}/${difficulty}`));
      const records = [];
      snapshot.forEach((child) => {
        records.push({ uid: child.key, ...child.val() });
      });
      records.sort((a, b) => Number(a.timeMs) - Number(b.timeMs));
      records.slice(0, 3).forEach((record, index) => {
        plan.push({
          uid: record.uid,
          name: record.name ?? "학생",
          difficulty,
          rank: index + 1,
          timeMs: Number(record.timeMs),
          points: MONTHLY_REWARDS[difficulty][index],
        });
      });
    }

    if (!plan.length) {
      rewardPreview.innerHTML = `<p class="empty-text">${month} 기록이 없어요.</p>`;
      return;
    }

    plan.forEach((item, index) => {
      item.index = index;
    });
    rewardPreview.innerHTML = renderRewardRows(plan, {});
    rewardPlan = { month, plan, resume: false };
    rewardSubmitButton.disabled = false;
  } catch (error) {
    rewardPreview.innerHTML = `<p class="empty-text">순위를 불러오지 못했어요. 데이터베이스 규칙을 확인해 주세요.</p>`;
  }
}

function renderRewardRows(items, paid) {
  return items.map((item) => `
    <article class="admin-list-item${paid[item.index] ? " admin-list-item-checked" : ""}">
      <div>
        <p class="rank-name">${GAME_RULES[item.difficulty]?.label ?? ""} ${item.rank}위 · ${escapeHtml(item.name)}</p>
        <p class="rank-meta">${formatSeconds(item.timeMs)}${paid[item.index] ? " · 지급 완료" : ""}</p>
      </div>
      <span class="rank-points">+${item.points}P</span>
    </article>
  `).join("");
}

async function handleMonthlyRewards(event) {
  event.preventDefault();
  if (!rewardPlan || !isTeacher(currentProfile, currentUser)) return;
  const { month, plan, resume } = rewardPlan;
  const total = plan.reduce((sum, item) => sum + item.points, 0);
  if (!confirm(`${month} 순위 보상 ${plan.length}건, 총 ${total}P를 지급할까요?`)) return;

  rewardSubmitButton.disabled = true;
  try {
    if (!resume) {
      // 먼저 지급 계획을 저장해 두 번 지급되는 것을 막고, 중간에 멈추면 이어서 지급할 수 있게 한다.
      await set(ref(db, `monthlyRewards/${month}`), {
        grantedAt: serverTimestamp(),
        grantedBy: currentUser.uid,
        winners: plan.map(({ uid, name, difficulty, rank, timeMs, points }) => ({ uid, name, difficulty, rank, timeMs, points })),
      });
    }
    for (const item of plan) {
      const student = adminStudents.find((s) => s.id === item.uid) ?? { name: item.name };
      await grantPoints(item.uid, student, item.points, `${month} 지뢰찾기 ${GAME_RULES[item.difficulty]?.label ?? ""} ${item.rank}위`);
      await set(ref(db, `monthlyRewards/${month}/paid/${item.index}`), true);
    }
    rewardPlan = null;
    setMessage(adminMessage, `${month} 순위 보상 ${plan.length}건을 지급했습니다.`);
  } catch (error) {
    setMessage(adminMessage, "보상 지급이 중간에 멈췄습니다. '순위 미리보기'를 다시 눌러 남은 보상을 이어서 지급해 주세요.");
  }
  await previewMonthlyRewards();
}

// ── 공통 ────────────────────────────────────────────────────

async function addMyPoints(amount) {
  const result = await runTransaction(ref(db, `users/${currentUser.uid}/points`), (currentPoints) => {
    return Number(currentPoints ?? 0) + amount;
  });
  if (!result.committed) throw new Error("포인트를 반영하지 못했습니다.");
  const total = Number(result.snapshot.val() ?? 0);
  await syncLeaderboardProfile(currentUser.uid, { ...currentProfile, points: total });
  return total;
}

async function getImageValue(urlSelector, fileSelector) {
  const url = $(urlSelector).value.trim();
  const file = $(fileSelector).files?.[0];
  if (file) return readSmallImage(file);
  return url;
}

function readSmallImage(file) {
  if (file.size > MAX_INLINE_IMAGE_BYTES) {
    throw new Error("사진 파일이 너무 큽니다. 450KB 이하 사진이나 사진 주소를 사용해주세요.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("사진을 읽지 못했습니다.")));
    reader.readAsDataURL(file);
  });
}

function renderImage(imageElement, imageUrl) {
  if (!imageUrl) {
    imageElement.hidden = true;
    imageElement.removeAttribute("src");
    return;
  }
  imageElement.src = imageUrl;
  imageElement.hidden = false;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.remove("toast-show");
  void toast.offsetWidth;
  toast.classList.add("toast-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function isTeacher(profile, user) {
  return profile?.role === "teacher" || user?.email === ADMIN_AUTH_EMAIL;
}

// 승인 기능 도입 전 가입자는 status가 없으므로 승인된 것으로 본다.
function isApproved(profile, user) {
  if (isTeacher(profile, user)) return true;
  return !profile?.status || profile.status === "approved";
}

function normalizeLoginEmail(value) {
  return value === ADMIN_LOGIN ? ADMIN_AUTH_EMAIL : value;
}

function serverNow() {
  return Date.now() + serverOffsetMs;
}

// 한국 시간 기준 날짜 번호(1970-01-01부터 며칠째). DB 규칙에서도 같은 식으로 계산한다.
function kstDay(ms) {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

function previousMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

function kstMonthKey(ms) {
  const date = new Date(ms + KST_OFFSET_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatKoreanDate(ms) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(ms));
}

function greetingByHour() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" }).format(new Date(serverNow())));
  if (hour < 11) return "좋은 아침!";
  if (hour < 17) return "오늘도 화이팅!";
  return "오늘 하루 수고했어요!";
}

function formatSeconds(ms) {
  return `${(Number(ms) / 1000).toFixed(2)}초`;
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString("ko-KR");
}

function formatDateTime(timestamp) {
  if (!timestamp) return "방금";
  return new Date(getTimestampValue(timestamp)).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTimestampValue(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp === "number") return timestamp;
  return 0;
}

function authErrorMessage(code) {
  if (code === "auth/email-already-in-use") return "이미 가입된 이메일입니다. 로그인으로 들어가세요.";
  if (code === "auth/invalid-email") return "아이디 또는 이메일 형식을 확인해주세요.";
  if (code === "auth/invalid-credential") return "아이디 또는 비밀번호를 확인해주세요.";
  if (code === "auth/unauthorized-domain") return "Firebase Authentication 승인 도메인에 kdynt17.github.io를 추가해주세요.";
  if (code === "auth/weak-password") return "비밀번호는 6자 이상이어야 합니다.";
  if (code === "auth/missing-email") return "가입한 이메일을 입력해주세요.";
  if (code === "auth/too-many-requests") return "잠시 후 다시 시도해주세요.";
  if (code === "PERMISSION_DENIED") return "데이터베이스 규칙을 최신 버전으로 게시해주세요.";
  return "처리 중 문제가 생겼습니다.";
}

function clearSubscriptions() {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
  rankUnsubscribe?.();
  rankUnsubscribe = null;
}

function setMessage(element, message) {
  element.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
