import {freeClient} from './academy/free-client.js';
import {dayKey as academyDay,closesAt as academyEnd,isHiddenUid,GAMES as ACADEMY_GAMES} from './academy/functions/domain.mjs';
import {mountBrain,brainSummary,GUIDE_HIDDEN_PREFIX} from './academy/brain.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  setPersistence,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  get,
  getDatabase,
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

const ADMIN_LOGIN = "admin@admin";
const ADMIN_AUTH_EMAIL = "admin@admin.com";
const MAX_INLINE_IMAGE_BYTES = 450 * 1024;

// ── 포인트 설계 ─────────────────────────────────────────────
// 출석10P(월~금, 로그인하면 자동) + 5영역 도전 순위보상(1등100P~최소20P) + 영역별 연습10P(최대50P).
// 출석은 자정, 게임은 오전6시 기준.
const ATTENDANCE_POINTS = 10;
const STREAK_BONUS_EVERY = 7;
const STREAK_BONUS_POINTS = 30;
const LAST_EMAIL_KEY = "mc.lastEmail";
const LAST_NAME_KEY = "mc.lastName";
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

const pageNames = {
  home: "홈",
  games: "두뇌교실",
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
let brainData = null;
let toastTimer = null;
let sessionDay = null;
let brainMount = null;
// 선생님이 켜면 학생은 게임을 시작할 수 없다(settings/gamesLocked).
let gamesLocked = false;

if (setupRequired) {
  showSignedOut();
  setMessage(authMessage, "Firebase 설정값을 firebase-config.js에 넣어주세요.");
} else {
  const app = initializeApp(firebaseConfig);
  // 로그인 정보를 IndexedDB(안 되면 localStorage)에 저장해, 다음에 열면 바로 들어가지게 한다.
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  db = getDatabase(app);
  showSplash();

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
  $("#game-lock-toggle").addEventListener("click", handleGameLockToggle);
  buyProductButton.addEventListener("click", handlePurchase);
  attendanceButton.addEventListener("click", handleAttendance);

  document.querySelectorAll("[data-target-page]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.targetPage));
  });
  // 휴대폰·브라우저 뒤로 가기: 앱 안의 이전 화면으로 돌아간다(두뇌교실 게임은 brain.js가 따로 닫는다).
  window.addEventListener("popstate", (event) => {
    if (!document.body.classList.contains("is-authenticated")) return;
    const page = event.state?.page ?? "home";
    showPage(pageNames[page] ? page : "home", { push: false });
  });

  // 내 정보 → 게임 설명서 다시 보이게 하기
  $("#show-tutorials-button").addEventListener("click", () => {
    ACADEMY_GAMES.forEach((game) => storeLocal(GUIDE_HIDDEN_PREFIX + game.id, null));
    showToast("연습을 시작하면 설명서가 다시 나와요.");
  });
  setAuthMode("login");

  // 자정이나 월이 바뀐 채로 화면을 켜 두면 날짜 기준 구독을 새로 연다.
  setInterval(() => {
    if (!currentUser || sessionDay === null || !document.body.classList.contains("is-authenticated")) return;
    if (kstDay(serverNow()) === sessionDay) return;
    const activePage = document.querySelector(".page.active-page")?.dataset.page ?? "home";
    clearSubscriptions();
    enterApp(activePage);
  }, 60000);

  onAuthStateChanged(auth, async (user) => {
    clearSubscriptions();
    currentUser = user;
    currentProfile = null;
    selectedProduct = null;
    attendance = null;
    brainData = null;

    if (!user) {
      showSignedOut();
      return;
    }

    try {
      currentProfile = await ensureProfile(user);
    } catch (error) {
      // 프로필을 못 읽거나 못 만들면(규칙 미배포·네트워크) 로딩 화면에 멈추지 않고 이유를 보여준다.
      console.error(error);
      showSignedOut();
      setMessage(authMessage, user.email === ADMIN_AUTH_EMAIL
        ? "관리자 계정 정보를 저장하지 못했어요. Firebase 콘솔에서 이 저장소의 database.rules.json이 게시됐는지 확인해 주세요."
        : "계정 정보를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 로그인해 주세요.");
      void signOut(auth);
      return;
    }
    if (!isApproved(currentProfile, user)) {
      waitForApproval();
      return;
    }
    // 두뇌교실 화면의 아래 메뉴에서 ?page=store 처럼 들어오면 그 화면을 연다.
    const params = new URLSearchParams(location.search);
    const requestedPage = params.get("page");
    enterApp(params.has("game") ? "games" : ["games", "leaderboard", "store", "profile", "admin"].includes(requestedPage) ? requestedPage : "home");
  });
}

function enterApp(page = "home") {
  sessionDay = kstDay(serverNow());
  showSignedIn();
  renderProfile(currentUser, currentProfile);
  history.replaceState({ page }, "", location.pathname);
  showPage(page, { push: false });
  subscribeProfile();
  subscribeAttendance();
  mountAcademy();
  subscribeGameDaily();
  subscribeBrain();
  subscribePointsLeaderboard();
  subscribeStore();
  subscribePurchaseHistory();
  subscribeAdminTools();
  subscribeGameLock();
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
  hideSplash();
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
  const remember = $("#remember-me").checked;

  try {
    await setPersistence(auth, remember ? indexedDBLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
    storeLocal(LAST_EMAIL_KEY, remember ? rawLogin : null);
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

  $("#header-points-value").textContent = formatNumber(points);
  $("#profile-points").textContent = formatNumber(points);
  $("#profile-name").textContent = name;
  $("#profile-email").textContent = profile?.email ?? user.email;
  $("#profile-role").textContent = teacher ? "선생님" : "학생";
  $("#greeting").textContent = `${name} 님, ${greetingByHour()}`;
  profileMessage.textContent = teacher ? "선생님 계정은 포인트와 게임 기록이 저장되지 않아요." : "";
  adminNavButton.hidden = !teacher;
  document.body.classList.toggle("is-teacher", teacher);
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

  if (latestProfile?.role !== "student" || isHiddenUid(uid)) {
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

function showSplash() {
  const lastName = readLocal(LAST_NAME_KEY);
  $("#splash-text").textContent = lastName ? `${lastName} 님, 들어가는 중…` : "들어가는 중…";
  $("#splash-screen").hidden = false;
}

function hideSplash() {
  $("#splash-screen").hidden = true;
}

function showSignedIn() {
  hideSplash();
  storeLocal(LAST_NAME_KEY, currentProfile?.name ?? null);
  document.body.classList.add("is-authenticated");
  authScreen.hidden = true;
  pendingScreen.hidden = true;
  appShell.hidden = false;
}

function showSignedOut() {
  hideSplash();
  storeLocal(LAST_NAME_KEY, null);
  document.body.classList.remove("is-authenticated");
  authScreen.hidden = false;
  pendingScreen.hidden = true;
  appShell.hidden = true;
  setAuthMode("login");
  const lastEmail = readLocal(LAST_EMAIL_KEY);
  if (lastEmail && !$("#login-email").value) {
    $("#login-email").value = lastEmail;
    $("#login-password").focus({ preventScroll: true });
  }
}

function showPage(page, { push = true } = {}) {
  if (!pageNames[page]) page = "home";
  const current = document.querySelector(".page.active-page")?.dataset.page;
  if (push && page !== current) history.pushState({ page }, "");
  // 두뇌교실 밖으로 나가면 진행 중인 게임 화면을 닫는다(오늘의 도전은 '이어서 하기'로 돌아올 수 있음).
  if (page !== "games") brainMount?.exit?.();
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active-page", section.dataset.page === page);
  });
  document.querySelectorAll(".bottom-nav [data-nav]").forEach((button) => {
    button.classList.toggle("active", button.dataset.nav === page);
  });

  pageTitle.textContent = pageNames[page] ?? "아침 챌린지";
  todayLabel.textContent = formatKoreanDate(serverNow());
  window.scrollTo({ top: 0 });
}

// ── 두뇌교실 (같은 화면 안에서 연다) ─────────────────────────

function mountAcademy() {
  const root = $("#brain-root");
  brainMount?.();
  brainMount = null;
  if (isTeacher(currentProfile, currentUser)) {
    root.innerHTML = `<p class="empty-text">두뇌교실 게임은 학생 계정으로 참여해요.</p>`;
    return;
  }
  if (gamesLocked) {
    root.innerHTML = `<p class="empty-text">지금은 선생님이 게임을 잠가 두었어요. 잠금이 풀리면 다시 할 수 있어요.</p>`;
    return;
  }
  brainMount = mountBrain({ db, user: currentUser, root });
}

// ── 게임 잠금 (선생님이 켜고 끔) ───────────────────────────

function subscribeGameLock() {
  const unsubscribe = onValue(ref(db, "settings/gamesLocked"), (snapshot) => {
    const locked = snapshot.val() === true;
    const changed = locked !== gamesLocked;
    gamesLocked = locked;
    renderGameLockAdmin();
    if (!changed || isTeacher(currentProfile, currentUser)) return;
    if (locked) {
      brainMount?.exit?.();
      showToast("선생님이 게임을 잠갔어요.");
    }
    mountAcademy();
  }, () => {});
  unsubscribers.push(unsubscribe);
}

function renderGameLockAdmin() {
  const button = $("#game-lock-toggle");
  if (!button) return;
  $("#game-lock-status").textContent = gamesLocked
    ? "지금 학생들은 게임을 할 수 없어요."
    : "지금 학생들은 게임을 할 수 있어요.";
  button.textContent = gamesLocked ? "게임 잠금 풀기" : "게임 잠그기";
}

async function handleGameLockToggle() {
  if (!isTeacher(currentProfile, currentUser)) return;
  try {
    await set(ref(db, "settings/gamesLocked"), !gamesLocked);
  } catch (error) {
    setMessage(adminMessage, authErrorMessage(error.code));
  }
}

// ── 출석 체크 (월~금, 로그인하면 자동) ──────────────────────

function subscribeAttendance() {
  let firstLoad = true;
  const unsubscribe = onValue(ref(db, `attendance/${currentUser.uid}`), (snapshot) => {
    attendance = snapshot.exists() ? snapshot.val() : null;
    renderAttendance();
    // 로그인해서 들어오면 평일에는 바로 출석 처리한다.
    if (firstLoad) {
      firstLoad = false;
      void handleAttendance();
    }
  });
  unsubscribers.push(unsubscribe);
}

// 날짜 번호의 요일(0=일요일). 1970-01-01이 목요일이라 4를 더한다. DB 규칙도 같은 식을 쓴다.
function weekdayOf(day) {
  return (day + 4) % 7;
}

function isSchoolDay(day) {
  const weekday = weekdayOf(day);
  return weekday >= 1 && weekday <= 5;
}

// 바로 전 평일(월요일이면 금요일). 연속 출석은 주말을 건너뛰고 이어진다.
function previousSchoolDay(day) {
  let previous = day - 1;
  while (!isSchoolDay(previous)) previous -= 1;
  return previous;
}

function renderAttendance() {
  if (!currentUser) return;
  const today = kstDay(serverNow());
  const schoolDay = isSchoolDay(today);
  const checkedToday = attendance?.day === today;
  const lastSchoolDay = schoolDay ? previousSchoolDay(today) : previousSchoolDay(today + 1);
  const alive = attendance && (attendance.day === today || attendance.day === lastSchoolDay);
  const streak = alive ? Number(attendance.streak ?? 0) : 0;
  const teacher = isTeacher(currentProfile, currentUser);

  $("#streak-count").textContent = streak;
  $("#attendance-total").textContent = `누적 ${Number(attendance?.total ?? 0)}일`;
  $("#attendance-title").textContent = teacher
    ? "선생님은 출석 체크를 하지 않아요"
    : !schoolDay
      ? "주말은 출석 쉬는 날이에요"
      : checkedToday
        ? `출석 완료! ${streak}일 연속`
        : "출석 체크하는 중…";

  const inCycle = streak === 0 ? 0 : ((streak - 1) % STREAK_BONUS_EVERY) + 1;
  $("#streak-dots").innerHTML = Array.from({ length: STREAK_BONUS_EVERY }, (_, i) => {
    const filled = i < inCycle;
    const bonus = i === STREAK_BONUS_EVERY - 1;
    return `<span class="streak-dot${filled ? " filled" : ""}${bonus ? " bonus" : ""}">${bonus ? "+30" : i + 1}</span>`;
  }).join("");

  // 출석은 들어오면 자동으로 된다. 버튼은 자동 출석이 실패했을 때 다시 시도하는 용도로만 보인다.
  attendanceButton.hidden = teacher || !schoolDay || checkedToday || !attendanceFailed;
  attendanceButton.disabled = attendanceBusy;
  attendanceButton.textContent = "출석 다시 시도";
}

let attendanceBusy = false;
let attendanceFailed = false;

async function handleAttendance() {
  if (!currentUser || isTeacher(currentProfile, currentUser) || attendanceBusy) return;
  const today = kstDay(serverNow());
  if (!isSchoolDay(today) || attendance?.day === today) return;
  attendanceBusy = true;
  try {
    await checkIn(today);
  } finally {
    attendanceBusy = false;
    renderAttendance();
  }
}

async function checkIn(today) {
  let streak;
  try {
    const latest = (await get(ref(db, `attendance/${currentUser.uid}`))).val();
    if (latest?.day === today) return;
    streak = latest && latest.day >= previousSchoolDay(today) ? Number(latest.streak ?? 0) + 1 : 1;
    const total = Number(latest?.total ?? 0) + 1;
    // 출석 기록 세 곳을 한 번에 저장한다(하나라도 실패하면 모두 저장되지 않음).
    await update(ref(db), {
      [`attendance/${currentUser.uid}`]: { day: today, streak, total, at: serverTimestamp() },
      [`attendanceDays/${today}/${currentUser.uid}`]: { name: currentProfile?.name ?? "학생", at: serverTimestamp() },
      [`users/${currentUser.uid}/todayResult`]: `${streak}일 연속 출석`,
    });
  } catch (error) {
    attendanceFailed = true;
    showToast("자동 출석에 실패했어요. 출석 카드의 버튼을 눌러 다시 시도해 주세요.");
    return;
  }
  attendanceFailed = false;
  attendance = { day: today, streak, total: Number(attendance?.total ?? 0) + 1 };
  renderAttendance();

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

function subscribeGameDaily() {
  unsubscribers.push(onValue(ref(db,`users/${currentUser.uid}`),snapshot=>{
    const p=snapshot.val()||{};
    const mask=p.practiceEnd===academyEnd(academyDay(serverNow()))?p.practiceMask||0:0;
    const used=[1,2,4,8,16].filter(bit=>mask&bit).length*10;
    $('#daily-game-points').textContent=used;
    $('#daily-game-fill').style.width=used*2+'%';
  }));
}

// ── 두뇌 지수 ───────────────────────────────────────────────

function subscribeBrain() {
  unsubscribers.push(onValue(ref(db,`academy/history/${currentUser.uid}`),s=>{brainData=s.val()||{};renderBrain();}));
  renderBrain();
}

// 홈의 두뇌 무게 카드: 두뇌교실과 같은 말랑그램 + 오각형 + 기준표.
function renderBrain() {
  const details = $("#brain-summary details");
  const open = details?.open ?? false;
  $("#brain-summary").innerHTML = brainSummary(brainData || {});
  if (open) $("#brain-summary details").open = true;
}

function subscribePointsLeaderboard() {
  rankUnsubscribe?.();
  rankCaption.textContent = "현재 포인트 순위";
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

        if (profile?.role !== "student" || !isApproved(profile) || isHiddenUid(child.key)) {
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
        if (student.role === "teacher" || isHiddenUid(child.key)) {
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
      if (isHiddenUid(child.key)) return;
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

  if (!Number.isFinite(amount) || amount === 0) {
    setMessage(adminMessage, "포인트를 숫자로 입력해주세요. 빼려면 -50처럼 입력하세요.");
    return;
  }

  try {
    setMessage(adminMessage, amount > 0 ? "포인트를 지급하는 중입니다." : "포인트를 차감하는 중입니다.");
    const { applied, total } = await grantPoints(studentId, student, amount, reason);
    pointGrantForm.reset();
    const name = student?.name ?? "학생";
    setMessage(adminMessage, applied > 0
      ? `${name}에게 ${applied}P를 지급했습니다. (현재 ${total}P)`
      : `${name}에게서 ${-applied}P를 차감했습니다. (현재 ${total}P)`);
  } catch (error) {
    setMessage(adminMessage, error.message || "포인트를 지급하지 못했습니다.");
  }
}

// 음수면 차감한다. 포인트는 0 아래로 내려가지 않으므로 실제로 빠진 만큼만 기록한다.
async function grantPoints(studentId, student, amount, reason) {
  let applied = 0;
  const pointResult = await runTransaction(ref(db, `users/${studentId}/points`), (currentPoints) => {
    const before = Number(currentPoints ?? 0);
    const after = Math.max(0, before + amount);
    applied = after - before;
    return after;
  });

  if (!pointResult.committed) {
    throw new Error("포인트 지급이 반영되지 않았습니다.");
  }

  const totalPoints = Number(pointResult.snapshot.val() ?? 0);
  await syncLeaderboardProfile(studentId, { ...student, points: totalPoints });

  if (applied === 0) return { applied, total: totalPoints };
  await set(push(ref(db, "pointGrants")), {
    uid: studentId,
    studentName: student?.name ?? student?.email ?? "학생",
    points: applied,
    reason,
    grantedBy: currentUser.uid,
    createdAt: serverTimestamp(),
  });
  return { applied, total: totalPoints };
}

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

function readLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function storeLocal(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (error) {
    // 저장소를 못 쓰는 브라우저(시크릿 창 등)에서는 기억하지 않는다.
  }
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

// 휴대폰 자판이 첫 글자를 대문자로 바꾸거나 공백이 붙어도 관리자 아이디로 알아본다.
function normalizeLoginEmail(value) {
  const login = String(value ?? "").trim();
  const lower = login.toLowerCase();
  if (lower === ADMIN_LOGIN || lower === "admin" || lower === ADMIN_AUTH_EMAIL) return ADMIN_AUTH_EMAIL;
  return login;
}

function serverNow() {
  return Date.now() + serverOffsetMs;
}

// 한국 시간 기준 날짜 번호(1970-01-01부터 며칠째). DB 규칙에서도 같은 식으로 계산한다.
function kstDay(ms) {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
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
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "아이디 또는 비밀번호를 확인해주세요.";
  if (code === "auth/user-disabled") return "사용이 중지된 계정입니다. Firebase 콘솔에서 확인해주세요.";
  if (code === "auth/network-request-failed") return "인터넷 연결을 확인해주세요.";
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
  brainMount?.();
  brainMount = null;
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
