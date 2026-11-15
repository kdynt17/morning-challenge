import { answerKey, textAnswerKeys, pointsForRank, correctOrder, isHiddenUid, MAX_RAW_ANSWER } from "./quiz.mjs?v=20261115-pwlogin";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  get,
  getDatabase,
  equalTo,
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
// 하루 한 문제: 먼저 맞힌 순서대로 1등 150점, 한 등수마다 -5점. 틀리면 10점 감점 후 다시 제출(최대 10번).
// 출석 10점(월~금, 로그인하면 자동)은 그대로 둔다.
const FIRST_POINTS = 150;
const WRONG_ANSWER_PENALTY = 10;
const MAX_TRIES = 10;
const ATTENDANCE_POINTS = 10;
const STREAK_BONUS_EVERY = 7;
const STREAK_BONUS_POINTS = 30;
const LAST_NAME_KEY = "mc.lastName";
// 학생은 이 학교 구글 계정으로만 로그인한다(DB 규칙도 새 가입을 이 주소로만 받는다).
const SCHOOL_EMAIL_DOMAIN = "junghwa.sen.ms.kr";
const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 3600000;

const $ = (selector) => document.querySelector(selector);
const setupRequired = firebaseConfig.apiKey.startsWith("PASTE_");

const authScreen = $("#auth-screen");
const pendingScreen = $("#pending-screen");
const pendingTitle = $("#pending-title");
const pendingMessage = $("#pending-message");
const appShell = $("#app-shell");
const loginForm = $("#login-form");
const authMessage = $("#auth-message");
const pageTitle = $("#page-title");
const todayLabel = $("#today-label");
const leaderboardList = $("#leaderboard-list");
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
  home: "오늘의 문제",
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
let toastTimer = null;
let sessionDay = null;
// 선생님이 켜면 학생은 문제 답을 낼 수 없다(settings/gamesLocked, 예전 게임 잠금 자리를 그대로 쓴다).
let gamesLocked = false;
// 문제 풀이
let quizQuestions = [];
const quizCorrect = {};
const quizMine = {};
const quizAwards = {};
const quizAwarding = new Set();
let quizUnsubs = {};
let adminQuizData = { answers: {}, attempts: {}, awards: {} };
// 선생님이 상점을 닫으면 학생은 아무것도 살 수 없다(settings/storeClosed).
let storeClosed = false;
let storeProducts = [];

if (setupRequired) {
  showSignedOut();
  setMessage(authMessage, "Firebase 설정값을 firebase-config.js에 넣어주세요.");
} else {
  const app = initializeApp(firebaseConfig);
  // 로그인 정보를 IndexedDB(안 되면 localStorage)에 저장해, 다음에 열면 바로 들어가지게 한다.
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence], popupRedirectResolver: browserPopupRedirectResolver });
  auth.languageCode = "ko";
  db = getDatabase(app);
  showSplash();

  onValue(ref(db, ".info/serverTimeOffset"), (snapshot) => {
    serverOffsetMs = Number(snapshot.val() ?? 0);
  });

  loginForm.addEventListener("submit", handleLogin);
  $("#google-login-button").addEventListener("click", handleGoogleLogin);
  $("#pending-relogin-button").addEventListener("click", handleGoogleLogin);
  $("#answer-form").addEventListener("submit", handleAnswerSubmit);
  $("#challenge-form").addEventListener("submit", handleChallengeSave);
  $("#delete-challenge-button").addEventListener("click", handleChallengeDelete);
  $("#admin-challenge-date").value = todayKey();
  $("#admin-question-list").addEventListener("click", handleAdminQuestionClick);
  $("#logout-button").addEventListener("click", () => signOut(auth));
  $("#pending-logout-button").addEventListener("click", () => signOut(auth));
  productForm.addEventListener("submit", handleProductSave);
  pointGrantForm.addEventListener("submit", handlePointGrant);
  $("#game-lock-toggle").addEventListener("click", handleGameLockToggle);
  $("#store-lock-toggle").addEventListener("click", handleStoreLockToggle);
  buyProductButton.addEventListener("click", handlePurchase);
  attendanceButton.addEventListener("click", handleAttendance);

  document.querySelectorAll("[data-target-page]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.targetPage));
  });
  // 휴대폰·브라우저 뒤로 가기: 앱 안의 이전 화면으로 돌아간다.
  window.addEventListener("popstate", (event) => {
    if (!document.body.classList.contains("is-authenticated")) return;
    const page = event.state?.page ?? "home";
    showPage(pageNames[page] ? page : "home", { push: false });
  });


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

    if (!user) {
      showSignedOut();
      return;
    }

    // 학교 계정이 아닌 구글 계정이면 막는다. 방금 새로 생긴 계정이면 지워서 흔적을 남기지 않는다.
    const googleEmail = googleEmailOf(user);
    if (googleEmail && !isSchoolEmail(googleEmail)) {
      const onlyGoogle = user.providerData.every((info) => info.providerId === "google.com");
      await (onlyGoogle ? user.delete() : Promise.reject()).catch(() => signOut(auth));
      showSignedOut();
      setMessage(authMessage, `${googleEmail} 은(는) 학교 계정이 아니에요. 학번@${SCHOOL_EMAIL_DOMAIN} 구글 계정으로 로그인해 주세요.`);
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
    // 구글로 들어왔는데 기록에 아직 없으면 적어 둔다(예전 계정에 자동으로 합쳐진 경우).
    if (googleEmail && currentProfile && !currentProfile.googleEmail && !isTeacher(currentProfile, user)) {
      void update(ref(db, `users/${user.uid}`), { googleEmail, loginProvider: "google", googleLinkedAt: serverTimestamp() }).catch(() => {});
    }
    if (!isApproved(currentProfile, user)) {
      waitForApproval();
      return;
    }
    // ?page=store 처럼 들어오면 그 화면을 연다(예전 두뇌교실 주소 ?page=games 는 문제 화면으로).
    const params = new URLSearchParams(location.search);
    const requestedPage = params.get("page");
    enterApp(["leaderboard", "store", "profile", "admin"].includes(requestedPage) ? requestedPage : "home");
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
  subscribeQuiz();
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
  const linked = profile?.status === "linked";
  $("#pending-relogin-button").hidden = !linked;
  if (linked) {
    // 선생님이 이 구글 계정을 예전 계정(기록)에 붙였다. 다시 로그인하면 예전 계정으로 들어간다.
    pendingTitle.textContent = "예전 기록과 연결됐어요!";
    pendingMessage.textContent = "아래 '다시 구글로 로그인'을 누르면 포인트·출석 기록이 있는 원래 계정으로 들어가요.";
    return;
  }
  pendingTitle.textContent = rejected ? "가입이 승인되지 않았습니다" : "선생님 승인을 기다리고 있어요";
  pendingMessage.textContent = rejected
    ? "선생님에게 확인해 주세요."
    : `${profile?.name ?? "학생"} 님(${profile?.authEmail ?? ""})의 로그인이 접수됐어요. 선생님이 예전 기록과 연결(또는 승인)하면 이 화면이 자동으로 넘어가요.`;
}

// ── 로그인 (기본: 아이디·비밀번호, 못 들어오는 학생: 학교 구글 계정) ───────────

function schoolGoogleProvider() {
  const provider = new GoogleAuthProvider();
  // hd: 구글 창에서 학교 계정만 고르도록 안내(진짜 검사는 로그인 뒤 + DB 규칙)
  provider.setCustomParameters({ hd: SCHOOL_EMAIL_DOMAIN, prompt: "select_account" });
  return provider;
}

function googleEmailOf(user) {
  return user?.providerData?.find((info) => info.providerId === "google.com")?.email ?? null;
}

function isSchoolEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${SCHOOL_EMAIL_DOMAIN}`);
}

async function handleGoogleLogin() {
  setMessage(authMessage, "구글 로그인 창을 여는 중이에요.");
  try {
    await signInWithPopup(auth, schoolGoogleProvider());
  } catch (error) {
    if (error.code === "auth/popup-blocked" || error.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, schoolGoogleProvider()).catch((redirectError) => setMessage(authMessage, authErrorMessage(redirectError.code)));
      return;
    }
    setMessage(authMessage, authErrorMessage(error.code));
  }
}

async function handleLogin(event) {
  event.preventDefault();
  setMessage(authMessage, "로그인하는 중입니다.");
  try {
    await signInWithEmailAndPassword(auth, normalizeLoginEmail($("#login-email").value), $("#login-password").value);
  } catch (error) {
    setMessage(authMessage, authErrorMessage(error.code));
  }
}

function renderGoogleLink() {
  if (!currentUser) return;
  const teacher = isTeacher(currentProfile, currentUser);
  const googleEmail = googleEmailOf(currentUser);
  $("#profile-login").textContent = teacher ? "선생님 아이디" : googleEmail ? `학교 구글 (${googleEmail})` : "아이디·비밀번호";
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

  const googleEmail = googleEmailOf(user);
  const profile = {
    name: isAdmin ? "선생님" : user.displayName || "학생",
    email: isAdmin ? ADMIN_LOGIN : user.email,
    authEmail: user.email,
    role: isAdmin ? "teacher" : "student",
    ...(isAdmin ? {} : { status: "pending" }),
    ...(googleEmail ? { loginProvider: "google", googleEmail } : {}),
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
  $("#profile-points").textContent = formatNumber(points);
  $("#profile-name").textContent = name;
  $("#profile-email").textContent = profile?.email ?? user.email;
  $("#profile-role").textContent = teacher ? "선생님" : "학생";
  profileMessage.textContent = teacher ? "선생님 계정은 포인트가 저장되지 않습니다." : `${name} 님, 오늘 문제를 확인해보세요.`;
  adminNavButton.hidden = !teacher;
  renderGoogleLink();
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
}

function showPage(page, { push = true } = {}) {
  if (!pageNames[page]) page = "home";
  const current = document.querySelector(".page.active-page")?.dataset.page;
  if (push && page !== current) history.pushState({ page }, "");
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

// ── 문제 풀이 잠금 (선생님이 켜고 끔, DB 자리는 예전 게임 잠금 settings/gamesLocked) ──

function subscribeGameLock() {
  let firstLoad = true;
  const unsubscribe = onValue(ref(db, "settings/gamesLocked"), (snapshot) => {
    const locked = snapshot.val() === true;
    const changed = locked !== gamesLocked && !firstLoad;
    firstLoad = false;
    gamesLocked = locked;
    renderGameLockAdmin();
    renderChallenge();
    if (!changed || isTeacher(currentProfile, currentUser)) return;
    showToast(locked ? "선생님이 문제 풀이를 잠갔어요." : "문제 풀이 잠금이 풀렸어요.");
  }, () => {});
  unsubscribers.push(unsubscribe);
}

function renderGameLockAdmin() {
  const button = $("#game-lock-toggle");
  if (!button) return;
  $("#game-lock-status").textContent = gamesLocked
    ? "지금 학생들은 문제를 볼 수는 있지만 답을 낼 수 없어요."
    : "지금 학생들은 공개된 문제에 답을 낼 수 있어요.";
  button.textContent = gamesLocked ? "문제 풀이 잠금 풀기" : "문제 풀이 잠그기";
}

async function handleGameLockToggle() {
  if (!isTeacher(currentProfile, currentUser)) return;
  try {
    await set(ref(db, "settings/gamesLocked"), !gamesLocked);
  } catch (error) {
    setMessage(adminMessage, authErrorMessage(error.code));
  }
}

// ── 오늘의 문제 (선생님이 올리고, 먼저 맞힌 순서대로 포인트) ──────────────
// 채점은 DB 규칙이 한다: 정답(quiz/answers)은 선생님만 읽을 수 있고,
// 학생은 답을 quiz/attempts에 적은 뒤 quiz/correct에 '맞혔다'를 써 본다. 정답이 아니면 규칙이 거절한다.

// 한국 날짜 "YYYY-MM-DD" — 하루 한 문제의 열쇠
function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(serverNow()));
}

function subscribeQuiz() {
  const teacher = isTeacher(currentProfile, currentUser);
  const today = todayKey();
  const apply = (list) => {
    list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    quizQuestions = list;
    syncQuizSubscriptions();
    renderChallenge();
    renderAdminQuestions();
  };
  if (teacher) {
    // 선생님은 지난 문제 기록도 본다.
    const recent = query(ref(db, "quiz/questions"), orderByChild("createdAt"), limitToLast(60));
    unsubscribers.push(onValue(recent, (snapshot) => {
      const list = [];
      snapshot.forEach((child) => { list.push({ id: child.key, ...child.val() }); });
      apply(list);
    }, () => {}));
  } else {
    // 학생은 오늘 문제 하나만 본다.
    unsubscribers.push(onValue(ref(db, `quiz/questions/${today}`), (snapshot) => {
      apply(snapshot.exists() ? [{ id: today, ...snapshot.val() }] : []);
    }, () => {
      setMessage($("#answer-message"), "문제를 불러오지 못했어요. 선생님께 말해 주세요.");
    }));
  }
}

// 학생에게 보이는 문제: 받는 중이거나 마감된 문제(숨김 문제는 안 보임)
function isVisibleQuestion(question) {
  return question.open === true || Boolean(question.closedAt);
}

function watchQuiz(key, path, onData) {
  if (quizUnsubs[key]) return;
  quizUnsubs[key] = onValue(ref(db, path), (snapshot) => onData(snapshot.val()), () => {});
}

function syncQuizSubscriptions() {
  const teacher = isTeacher(currentProfile, currentUser);
  const wanted = new Set();
  for (const question of quizQuestions) {
    const qid = question.id;
    if (!teacher && !isVisibleQuestion(question)) continue;
    wanted.add(`correct:${qid}`);
    watchQuiz(`correct:${qid}`, `quiz/correct/${qid}`, (value) => {
      quizCorrect[qid] = value ?? {};
      maybeResumeAward(qid);
      renderChallenge();
      renderAdminQuestions();
    });
    if (teacher) {
      wanted.add(`attempts:${qid}`).add(`awards:${qid}`);
      watchQuiz(`attempts:${qid}`, `quiz/attempts/${qid}`, (value) => { adminQuizData.attempts[qid] = value ?? {}; renderAdminQuestions(); });
      watchQuiz(`awards:${qid}`, `quiz/awards/${qid}`, (value) => { adminQuizData.awards[qid] = value ?? {}; renderAdminQuestions(); });
    } else {
      wanted.add(`mine:${qid}`).add(`award:${qid}`);
      watchQuiz(`mine:${qid}`, `quiz/attempts/${qid}/${currentUser.uid}`, (value) => { quizMine[qid] = value; renderChallenge(); });
      watchQuiz(`award:${qid}`, `quiz/awards/${qid}/${currentUser.uid}`, (value) => {
        quizAwards[qid] = value;
        maybeResumeAward(qid);
        renderChallenge();
      });
    }
  }
  for (const key of Object.keys(quizUnsubs)) {
    if (wanted.has(key)) continue;
    quizUnsubs[key]();
    delete quizUnsubs[key];
  }
}

function questionById(qid) {
  return quizQuestions.find((question) => question.id === qid);
}

function myRankIn(qid) {
  return correctOrder(quizCorrect[qid], isHiddenUid).find((row) => row.uid === currentUser?.uid)?.rank ?? null;
}

// 홈: 오늘의 문제 카드 (예전 화면 그대로)
function renderChallenge() {
  if (!currentUser) return;
  const teacher = isTeacher(currentProfile, currentUser);
  const today = todayKey();
  const question = questionById(today);
  const visible = question && isVisibleQuestion(question);
  const status = $("#challenge-status");
  const submit = $("#answer-form button");
  const message = $("#answer-message");
  $("#challenge-date").textContent = today;
  status.className = "pill";

  if (!visible) {
    $("#challenge-title").textContent = "오늘의 문제가 아직 등록되지 않았습니다.";
    $("#challenge-description").textContent = "선생님이 문제를 등록하면 자동으로 표시됩니다.";
    renderImage($("#challenge-image"), "");
    $("#challenge-revealed").hidden = true;
    status.textContent = "아직 공개 전";
    submit.disabled = true;
    setMessage(message, "");
    $("#today-rank-list").innerHTML = `<p class="empty-text">아직 정답자가 없습니다.</p>`;
    return;
  }

  $("#challenge-title").textContent = question.title || "오늘의 문제";
  $("#challenge-description").textContent = question.text ?? "";
  renderImage($("#challenge-image"), question.imageUrl);
  $("#challenge-revealed").hidden = !question.revealed;
  $("#challenge-revealed").textContent = question.revealed ? `정답: ${question.revealed}` : "";

  const order = correctOrder(quizCorrect[today], isHiddenUid);
  const solved = Boolean(quizCorrect[today]?.[currentUser.uid]);
  const used = Number(quizMine[today]?.count ?? 0);
  const left = Math.max(0, Number(question.maxTries ?? MAX_TRIES) - used);
  const award = quizAwards[today];
  const rank = myRankIn(today);

  if (teacher) {
    status.textContent = question.open ? "제출 가능" : "마감";
    submit.disabled = true;
    setMessage(message, "선생님 계정은 답을 제출하지 않아요. 관리 화면에서 정답자를 확인하세요.");
  } else if (solved) {
    status.textContent = "제출 완료";
    status.classList.add("is-done");
    submit.disabled = true;
    const points = award?.points ?? pointsForRank(rank ?? order.length, question.firstPoints);
    setMessage(message, `정답입니다! ${rank ?? "-"}번째 정답으로 ${formatNumber(points)}점${award?.paid ? "을 받았습니다." : "을 받는 중입니다."}`);
  } else if (!question.open) {
    status.textContent = "마감";
    status.classList.add("is-closed");
    submit.disabled = true;
    setMessage(message, "오늘 문제는 마감되었습니다.");
  } else if (gamesLocked) {
    status.textContent = "잠김";
    status.classList.add("is-closed");
    submit.disabled = true;
    setMessage(message, "지금은 선생님이 문제 풀이를 잠가 두었습니다.");
  } else if (left === 0) {
    status.textContent = "기회 끝";
    status.classList.add("is-closed");
    submit.disabled = true;
    setMessage(message, `${used}번 모두 틀렸어요. 내일 문제에 다시 도전해요.`);
  } else {
    status.textContent = "제출 가능";
    submit.disabled = submittingAnswer;
  }

  $("#today-rank-list").innerHTML = order.length
    ? order.map((row, index) => renderRankItem({
        index,
        name: row.name,
        meta: formatClock(row.at),
        value: `${formatNumber(pointsForRank(row.rank, question.firstPoints))}점`,
        mine: row.uid === currentUser.uid,
      })).join("")
    : `<p class="empty-text">아직 정답자가 없습니다. 1등을 노려 보세요!</p>`;
}

let submittingAnswer = false;

async function handleAnswerSubmit(event) {
  event.preventDefault();
  if (!currentUser || isTeacher(currentProfile, currentUser)) return;
  const today = todayKey();
  const question = questionById(today);
  const message = $("#answer-message");
  if (!question || !question.open) return setMessage(message, "오늘 문제가 열려 있지 않습니다.");
  if (gamesLocked) return setMessage(message, "지금은 선생님이 문제 풀이를 잠가 두었습니다.");
  if (quizCorrect[today]?.[currentUser.uid]) return setMessage(message, "이미 정답을 제출했습니다. 포인트는 한 번만 지급됩니다.");

  const input = $("#answer");
  const raw = input.value.trim().slice(0, MAX_RAW_ANSWER);
  const key = answerKey("text", raw);
  if (!key) return;
  const used = Number(quizMine[today]?.count ?? 0);
  if (used >= Number(question.maxTries ?? MAX_TRIES)) return setMessage(message, "제출 기회를 모두 썼습니다.");

  const uid = currentUser.uid;
  const name = currentProfile?.name ?? "";
  submittingAnswer = true;
  $("#answer-form button").disabled = true;
  setMessage(message, "채점하는 중입니다.");
  try {
    try {
      await set(ref(db, `quiz/attempts/${today}/${uid}`), { name, count: used + 1, last: key, raw, at: serverTimestamp() });
    } catch (error) {
      setMessage(message, "제출하지 못했습니다. 마감됐거나 잠겼는지 확인해 주세요.");
      return;
    }
    // 정답이면 DB 규칙이 받아 주고, 틀리면 거절한다.
    let correct = true;
    try {
      await set(ref(db, `quiz/correct/${today}/${uid}`), { name, at: serverTimestamp() });
    } catch (error) {
      correct = false;
    }
    if (!correct) {
      const remaining = await applyWrongAnswerPenalty();
      const left = Number(question.maxTries ?? MAX_TRIES) - (used + 1);
      setMessage(message, `틀렸어요. ${WRONG_ANSWER_PENALTY}점이 차감되어 현재 ${formatNumber(remaining)}점입니다. ${left > 0 ? `답을 고쳐서 다시 제출할 수 있습니다. (남은 기회 ${left}번)` : "기회를 모두 썼습니다."}`);
      return;
    }
    input.value = "";
    await awardQuiz(question);
  } finally {
    submittingAnswer = false;
    renderChallenge();
  }
}

// 틀리면 10점 감점(0점 아래로는 안 내려감)
async function applyWrongAnswerPenalty() {
  try {
    const result = await runTransaction(ref(db, `users/${currentUser.uid}/points`), (current) => Math.max(0, Number(current ?? 0) - WRONG_ANSWER_PENALTY));
    const total = Number(result.snapshot.val() ?? 0);
    await syncLeaderboardProfile(currentUser.uid, { ...currentProfile, points: total });
    return total;
  } catch (error) {
    return Number(currentProfile?.points ?? 0);
  }
}

// 맞힌 순서대로 포인트를 받는다. 받기 전에 끊겼으면 다음에 열 때 이어서 받는다.
function maybeResumeAward(qid) {
  if (!currentUser || isTeacher(currentProfile, currentUser)) return;
  if (!quizCorrect[qid]?.[currentUser.uid]) return;
  if (!(qid in quizAwards)) return;
  if (quizAwards[qid]?.paid) return;
  const question = questionById(qid);
  if (question) void awardQuiz(question);
}

async function awardQuiz(question) {
  const qid = question.id;
  const uid = currentUser.uid;
  if (quizAwarding.has(qid)) return;
  quizAwarding.add(qid);
  try {
    const awardRef = ref(db, `quiz/awards/${qid}/${uid}`);
    let award = (await get(awardRef)).val();
    if (!award) {
      const order = correctOrder((await get(ref(db, `quiz/correct/${qid}`))).val(), isHiddenUid);
      const rank = order.find((row) => row.uid === uid)?.rank ?? order.length + 1;
      award = { rank, points: pointsForRank(rank, question.firstPoints), paid: false, at: serverTimestamp() };
      await set(awardRef, award);
    }
    if (!award.paid) {
      if (award.points > 0) await addMyPoints(award.points);
      await update(awardRef, { paid: true });
      setMessage($("#answer-message"), `정답입니다! ${award.rank}번째 정답으로 ${formatNumber(award.points)}점을 받았습니다.`);
    }
  } catch (error) {
    console.error(error);
    setMessage($("#answer-message"), "정답 처리는 됐지만 포인트를 아직 못 받았어요. 앱을 다시 열면 이어서 받아요.");
  } finally {
    quizAwarding.delete(qid);
  }
}

// ── 선생님: 문제 올리기·관리 ────────────────────────────────

async function handleChallengeSave(event) {
  event.preventDefault();
  if (!isTeacher(currentProfile, currentUser)) return;
  const button = event.target.querySelector("button[type=submit]");
  try {
    const dateKey = $("#admin-challenge-date").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("날짜를 골라 주세요.");
    const title = $("#admin-challenge-title").value.trim();
    const text = $("#admin-challenge-description").value.trim();
    const answer = $("#admin-answer").value.trim();
    const keys = textAnswerKeys(answer);
    if (!text) throw new Error("문제 내용을 적어 주세요.");
    if (!keys.length) throw new Error("정답을 적어 주세요.");
    const existing = (await get(ref(db, `quiz/questions/${dateKey}`))).exists();
    if (existing && !confirm(`${dateKey}에 이미 문제가 있어요. 새 문제로 바꾸면 그날 제출·정답 기록이 지워져요(이미 받은 포인트는 그대로). 바꿀까요?`)) return;
    button.disabled = true;
    setMessage(adminMessage, "문제를 저장하는 중입니다.");
    const imageUrl = await getImageValue("#admin-challenge-image-url", "#admin-challenge-image-file");
    await update(ref(db), {
      [`quiz/questions/${dateKey}`]: {
        title,
        text,
        imageUrl,
        type: "text",
        firstPoints: FIRST_POINTS,
        maxTries: MAX_TRIES,
        open: true,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
      },
      [`quiz/answers/${dateKey}`]: { keys: Object.fromEntries(keys.map((key) => [key, true])), display: answer },
      ...(existing ? { [`quiz/attempts/${dateKey}`]: null, [`quiz/correct/${dateKey}`]: null, [`quiz/awards/${dateKey}`]: null } : {}),
    });
    event.target.reset();
    $("#admin-challenge-date").value = todayKey();
    setMessage(adminMessage, `${dateKey} 문제를 저장했습니다.`);
  } catch (error) {
    setMessage(adminMessage, error.message || authErrorMessage(error.code));
  } finally {
    button.disabled = false;
  }
}

async function handleChallengeDelete() {
  if (!isTeacher(currentProfile, currentUser)) return;
  const dateKey = $("#admin-challenge-date").value || todayKey();
  if (!confirm(`${dateKey} 문제를 삭제할까요? 학생 화면에서도 사라집니다. (이미 받은 포인트는 그대로)`)) return;
  try {
    await deleteQuestion(dateKey);
    setMessage(adminMessage, "문제를 삭제했습니다.");
  } catch (error) {
    setMessage(adminMessage, error.message || authErrorMessage(error.code));
  }
}

function deleteQuestion(qid) {
  return update(ref(db), {
    [`quiz/questions/${qid}`]: null,
    [`quiz/answers/${qid}`]: null,
    [`quiz/attempts/${qid}`]: null,
    [`quiz/correct/${qid}`]: null,
    [`quiz/awards/${qid}`]: null,
  });
}

function subscribeAdminQuiz() {
  unsubscribers.push(onValue(ref(db, "quiz/answers"), (snapshot) => {
    adminQuizData.answers = snapshot.val() ?? {};
    renderAdminQuestions();
  }, () => {}));
}

function renderAdminQuestions() {
  if (!currentUser || !isTeacher(currentProfile, currentUser)) return;
  const list = $("#admin-question-list");
  const openDetails = new Set([...list.querySelectorAll("details[open][data-qid]")].map((el) => el.dataset.qid));
  list.innerHTML = quizQuestions.length
    ? [...quizQuestions].reverse().map((question) => renderAdminQuestion(question, openDetails.has(question.id))).join("")
    : `<p class="empty-text">아직 올린 문제가 없어요.</p>`;
}

function renderAdminQuestion(question, expanded) {
  const qid = question.id;
  const id = escapeAttribute(qid);
  const answer = adminQuizData.answers[qid]?.display ?? "-";
  const order = correctOrder(quizCorrect[qid], isHiddenUid);
  const awards = adminQuizData.awards[qid] ?? {};
  const attempts = adminQuizData.attempts[qid] ?? {};
  const wrong = Object.entries(attempts)
    .filter(([uid]) => !quizCorrect[qid]?.[uid] && !isHiddenUid(uid))
    .map(([, row]) => row)
    .sort((a, b) => Number(a.at ?? 0) - Number(b.at ?? 0));
  const state = question.open ? "받는 중" : question.closedAt ? "마감" : "숨김";
  const stateClass = question.open ? "pill-time" : "pill-off";
  const openButton = question.open
    ? `<button class="inline-danger-button" type="button" data-qaction="close" data-qid="${id}">마감하기</button>`
    : `<button class="inline-action-button" type="button" data-qaction="open" data-qid="${id}">${question.closedAt ? "다시 받기" : "공개하기"}</button>`;
  const revealButton = question.revealed
    ? `<button class="inline-action-button is-on" type="button" data-qaction="hide-answer" data-qid="${id}">정답 숨기기</button>`
    : `<button class="inline-action-button" type="button" data-qaction="reveal" data-qid="${id}">정답 공개</button>`;
  return `
    <article class="admin-question${question.open ? "" : " is-off"}">
      <div class="quiz-head">
        <span class="pill">${escapeHtml(qid)}</span>
        <span class="pill ${stateClass}">${state}</span>
      </div>
      <p class="rank-name">${escapeHtml(question.title || question.text?.slice(0, 40) || "문제")}</p>
      <p class="rank-meta">정답: <b>${escapeHtml(answer)}</b> · 맞힘 ${order.length}명 · 틀림 ${wrong.length}명</p>
      <div class="admin-question-actions">${openButton}${revealButton}<button class="inline-danger-button" type="button" data-qaction="delete" data-qid="${id}">삭제</button></div>
      <details data-qid="${id}"${expanded ? " open" : ""}>
        <summary>맞힌 순서 · 낸 답 보기</summary>
        <p class="quiz-text">${escapeHtml(question.text ?? "")}</p>
        ${order.length ? `<ol class="admin-rank">${order.map((row) => {
          const award = awards[row.uid];
          return `<li><b>${row.rank}등</b> ${escapeHtml(row.name ?? "학생")} <span class="rank-meta">${formatClock(row.at)} · ${award ? `+${formatNumber(award.points)}점${award.paid ? "" : " (지급 중)"}` : "포인트 받기 전"}</span></li>`;
        }).join("")}</ol>` : `<p class="empty-text">아직 맞힌 학생이 없어요.</p>`}
        ${wrong.length ? `<p class="rank-meta">틀린 학생 (정답 아직)</p><ul class="admin-wrong">${wrong.map((row) => `<li>${escapeHtml(row.name ?? "학생")} <span class="rank-meta">${Number(row.count ?? 0)}번 · 마지막 답 '${escapeHtml(row.raw ?? "-")}'</span></li>`).join("")}</ul>` : ""}
      </details>
    </article>`;
}

async function handleAdminQuestionClick(event) {
  const button = event.target.closest("[data-qaction]");
  if (!button || !isTeacher(currentProfile, currentUser)) return;
  const qid = button.dataset.qid;
  const question = questionById(qid);
  if (!question) return;
  const action = button.dataset.qaction;
  try {
    if (action === "open") {
      await update(ref(db, `quiz/questions/${qid}`), { open: true, openedAt: serverTimestamp() });
    } else if (action === "close") {
      await update(ref(db, `quiz/questions/${qid}`), { open: false, closedAt: serverTimestamp() });
    } else if (action === "reveal") {
      const answer = adminQuizData.answers[qid]?.display;
      if (!answer) return;
      if (question.open && !confirm("아직 답을 받는 중이에요. 정답을 공개하면 마감하고 공개할게요.")) return;
      await update(ref(db, `quiz/questions/${qid}`), { revealed: answer, open: false, ...(question.closedAt ? {} : { closedAt: serverTimestamp() }) });
    } else if (action === "hide-answer") {
      await update(ref(db, `quiz/questions/${qid}`), { revealed: null });
    } else if (action === "delete") {
      if (!confirm(`${qid} 문제를 지울까요? 정답 순서 기록도 지워져요. (이미 받은 포인트는 그대로예요)`)) return;
      await deleteQuestion(qid);
      setMessage(adminMessage, "문제를 지웠어요.");
    }
  } catch (error) {
    setMessage(adminMessage, authErrorMessage(error.code));
  }
}

function formatClock(ms) {
  if (!ms) return "-";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(Number(ms)));
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

  $("#attendance-line").textContent = teacher
    ? ""
    : !schoolDay
      ? "주말은 출석 쉬는 날이에요."
      : checkedToday
        ? `출석 완료 (+${ATTENDANCE_POINTS}점) · ${streak}일 연속 · 누적 ${Number(attendance?.total ?? 0)}일`
        : "출석 체크하는 중…";

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
        ? `${streak}일 연속 출석! +${ATTENDANCE_POINTS}점, 보너스 +${bonus}점`
        : `출석 완료! +${ATTENDANCE_POINTS}점`);
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  showToast("출석은 됐지만 포인트 반영에 실패했어요. 선생님께 말씀해 주세요.");
}

function subscribePointsLeaderboard() {
  rankUnsubscribe?.();
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
          value: `${formatNumber(student.points)}점`,
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
  unsubscribers.push(onValue(productsQuery, (snapshot) => {
    storeProducts = [];
    snapshot.forEach((child) => {
      const product = child.val();
      if (product.visible !== false) storeProducts.push({ id: child.key, ...product });
    });
    sortStoreProducts(storeProducts);
    renderStore();
  }));
  unsubscribers.push(onValue(ref(db, "settings/storeClosed"), (snapshot) => {
    storeClosed = snapshot.val() === true;
    renderStore();
    renderStoreLockAdmin();
  }, () => {}));
  // 판매 마감 시각이 지나면 화면을 열어 둔 채로도 '판매 마감'으로 바뀌게 한다.
  const timer = setInterval(renderStore, 30000);
  unsubscribers.push(() => clearInterval(timer));
}

// 지금 살 수 있는지와, 못 사면 그 이유
function saleState(product) {
  if (storeClosed) return { open: false, label: "상점 닫힘" };
  if (product.onSale === false) return { open: false, label: "판매 중지" };
  if (product.saleEndsAt && Number(product.saleEndsAt) <= serverNow()) return { open: false, label: "판매 마감" };
  return { open: true, label: product.saleEndsAt ? `${formatDateTime(product.saleEndsAt)}까지` : "" };
}

function renderStore() {
  const banner = storeClosed ? `<p class="store-closed-banner">지금은 선생님이 상점을 닫아 두었어요. 열리면 다시 살 수 있어요.</p>` : "";
  storeList.innerHTML = banner + (storeProducts.length
    ? storeProducts.map(renderProductItem).join("")
    : `<p class="empty-text">아직 상점 상품이 없습니다.</p>`);
  storeList.querySelectorAll("button[data-product-id]").forEach((button) => {
    const product = storeProducts.find((item) => item.id === button.dataset.productId);
    button.addEventListener("click", () => openProductDialog(product));
  });
}

function sortStoreProducts(products) {
  products.sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0);
  });
}

// 학생은 자기 구매 내역만 읽는다(DB 규칙도 uid로 걸러 읽을 때만 허락).
function subscribePurchaseHistory() {
  const mine = query(ref(db, "purchases"), orderByChild("uid"), equalTo(currentUser.uid));
  const unsubscribe = onValue(mine, (snapshot) => {
    const purchases = [];
    snapshot.forEach((child) => {
      purchases.push({ id: child.key, ...child.val() });
    });
    purchases.sort((a, b) => getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt));
    purchaseHistoryList.innerHTML = purchases.length
      ? purchases.map(renderPurchaseHistoryItem).join("")
      : `<p class="empty-text">아직 구매한 상품이 없습니다.</p>`;
  }, () => {
    purchaseHistoryList.innerHTML = `<p class="empty-text">구매 내역을 불러오지 못했어요.</p>`;
  });
  unsubscribers.push(unsubscribe);
}

function purchaseStatus(item) {
  if (item.refunded) return { text: "취소·환불됨", cls: "is-refunded" };
  if (item.adminChecked) return { text: "선생님 확인", cls: "is-checked" };
  return { text: "확인 전", cls: "" };
}

function renderPurchaseHistoryItem(item) {
  const status = purchaseStatus(item);
  return `
    <article class="history-item">
      <div>
        <p class="rank-name">${escapeHtml(item.productTitle ?? "상품")}</p>
        <p class="rank-meta">${formatDateTime(item.createdAt)}</p>
      </div>
      <div class="history-actions">
        <span class="rank-points">${item.refunded ? "+0" : `-${Number(item.price ?? 0)}`}점</span>
        <span class="purchase-status ${status.cls}">${status.text}</span>
      </div>
    </article>
  `;
}

function renderProductItem(product) {
  const image = product.imageUrl
    ? `<img class="product-image" src="${escapeAttribute(product.imageUrl)}" alt="" loading="lazy" />`
    : `<div class="product-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></div>`;
  const pinnedLabel = product.pinned ? `<span class="pill">누구나</span>` : `<span class="pill pill-hot">한정 1개</span>`;
  const sale = saleState(product);

  return `
    <article class="product-card${sale.open ? "" : " is-closed"}">
      ${image}
      <div class="product-body">
        <div class="product-top">${pinnedLabel}${sale.label ? `<span class="pill ${sale.open ? "pill-time" : "pill-off"}">${escapeHtml(sale.label)}</span>` : ""}<span class="product-price">${formatNumber(Number(product.price ?? 0))}점</span></div>
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
  dialogProductPrice.textContent = `${formatNumber(price)}점`;
  dialogProductTitle.textContent = product.title ?? "상품";
  dialogProductDescription.textContent = product.description ?? "";
  dialogBalance.textContent = `현재 잔액 ${formatNumber(points)}점`;
  dialogAfterBalance.textContent = `구매 후 잔액 ${formatNumber(points - price)}점`;
  const sale = saleState(product);
  buyProductButton.disabled = !sale.open || points < price || isTeacher(currentProfile, currentUser);
  buyProductButton.textContent = !sale.open ? `지금은 살 수 없어요 (${sale.label})` : points < price ? `${formatNumber(price - points)}점 더 모아야 해요` : "구매하기";
  setMessage(purchaseMessage, sale.open
    ? `버튼을 누르면 바로 구매되고 포인트가 차감됩니다.${product.saleEndsAt ? ` 판매 마감 ${formatDateTime(product.saleEndsAt)}` : ""}`
    : "선생님이 판매를 멈췄거나 판매 시간이 끝났어요.");
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
  const sale = saleState(selectedProduct);
  if (!sale.open) {
    setMessage(purchaseMessage, `지금은 살 수 없어요 (${sale.label}).`);
    buyProductButton.disabled = true;
    return;
  }
  buyProductButton.disabled = true;
  let paid = false;

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

    paid = true;
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
      createdAt: serverTimestamp(),
    });
    paid = false;
    if (!isPinnedProduct) {
      await update(ref(db, `storeProducts/${selectedProduct.id}`), {
        visible: false,
        purchasedBy: currentUser.uid,
        purchasedAt: serverTimestamp(),
      });
    }
    setMessage(purchaseMessage, `구매되었습니다. 남은 잔액은 ${formatNumber(remaining)}점입니다.`);
    dialogBalance.textContent = `현재 잔액 ${formatNumber(remaining)}점`;
    dialogAfterBalance.textContent = `구매 후 잔액 ${formatNumber(remaining)}점`;
    selectedProduct = null;
    setTimeout(() => {
      productDialog.close();
      showPage("profile");
    }, 900);
  } catch (error) {
    // 포인트는 빠졌는데 구매 기록을 못 남겼다면(그 사이 상점이 닫힘 등) 포인트를 돌려준다.
    if (paid) {
      await runTransaction(ref(db, `users/${currentUser.uid}/points`), (currentPoints) => Number(currentPoints ?? 0) + price).catch(() => {});
      setMessage(purchaseMessage, "구매하지 못했어요(상점이 닫혔거나 판매가 끝났어요). 포인트는 돌려받았어요.");
    } else {
      setMessage(purchaseMessage, authErrorMessage(error.code));
    }
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
  subscribeAdminQuiz();
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
        const label = `${student.name ?? student.email ?? "학생"} (${Number(student.points ?? 0)}점)`;
        return `<option value="${escapeAttribute(student.id)}">${escapeHtml(label)}</option>`;
      }).join("")}`
    : `<option value="">학생이 없습니다</option>`;
}

function subscribeAdminProducts() {
  const productsQuery = query(ref(db, "storeProducts"), orderByChild("createdAt"), limitToLast(100));

  const unsubscribe = onValue(productsQuery, (snapshot) => {
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
    adminProductList.querySelectorAll("button[data-sale-product-id]").forEach((button) => {
      button.addEventListener("click", () => handleProductSaleToggle(button.dataset.saleProductId, button.dataset.onSale === "true"));
    });
    adminProductList.querySelectorAll("button[data-ends-product-id]").forEach((button) => {
      button.addEventListener("click", () => handleProductEndsSave(button.dataset.endsProductId, button.dataset.clear === "true"));
    });
  });
  unsubscribers.push(unsubscribe);
}

// datetime-local 입력값(한국 시각)과 타임스탬프 사이 변환
function toLocalInput(ms) {
  if (!ms) return "";
  const date = new Date(Number(ms) - new Date().getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

function renderAdminProductItem(product) {
  const onSale = product.onSale !== false;
  const ended = product.saleEndsAt && Number(product.saleEndsAt) <= serverNow();
  const status = [product.pinned ? "누구나" : "한정 1개", onSale ? (ended ? "판매 마감" : "판매 중") : "판매 중지",
    product.saleEndsAt ? `마감 ${formatDateTime(product.saleEndsAt)}` : ""].filter(Boolean).join(" · ");
  const id = escapeAttribute(product.id);

  return `
    <article class="admin-list-item admin-product-item${onSale && !ended ? "" : " is-off"}">
      <div>
        <p class="rank-name">${escapeHtml(product.title ?? "상품")}</p>
        <p class="rank-meta">${Number(product.price ?? 0)}점 · ${escapeHtml(status)}</p>
        <div class="sale-ends-row">
          <input type="datetime-local" data-ends-input="${id}" value="${toLocalInput(product.saleEndsAt)}" aria-label="판매 마감 시각" />
          <button class="inline-action-button" type="button" data-ends-product-id="${id}">마감 시각 저장</button>
          ${product.saleEndsAt ? `<button class="inline-action-button" type="button" data-ends-product-id="${id}" data-clear="true">마감 없애기</button>` : ""}
        </div>
      </div>
      <div class="admin-product-actions">
        <button class="inline-action-button" type="button" data-sale-product-id="${id}" data-on-sale="${onSale}">${onSale ? "판매 중지" : "판매 재개"}</button>
        <button class="inline-danger-button" type="button" data-delete-product-id="${id}">삭제</button>
      </div>
    </article>
  `;
}

async function handleProductSaleToggle(productId, onSale) {
  if (!isTeacher(currentProfile, currentUser) || !productId) return;
  try {
    await update(ref(db, `storeProducts/${productId}`), { onSale: !onSale });
    setMessage(adminMessage, onSale ? "이 상품 판매를 멈췄어요. 학생은 살 수 없어요." : "이 상품을 다시 팔아요.");
  } catch (error) {
    setMessage(adminMessage, error.message || "판매 상태를 바꾸지 못했습니다.");
  }
}

async function handleProductEndsSave(productId, clear) {
  if (!isTeacher(currentProfile, currentUser) || !productId) return;
  const input = adminProductList.querySelector(`[data-ends-input="${CSS.escape(productId)}"]`);
  const value = clear ? null : input?.value ? new Date(input.value).getTime() : null;
  if (!clear && !value) {
    setMessage(adminMessage, "마감 날짜와 시각을 골라 주세요.");
    return;
  }
  try {
    await update(ref(db, `storeProducts/${productId}`), { saleEndsAt: value });
    setMessage(adminMessage, clear ? "판매 마감 시각을 없앴어요." : `${formatDateTime(value)}에 판매가 끝나요.`);
  } catch (error) {
    setMessage(adminMessage, error.message || "마감 시각을 저장하지 못했습니다.");
  }
}

// ── 상점 열고 닫기 ─────────────────────────────────────────

function renderStoreLockAdmin() {
  const button = $("#store-lock-toggle");
  if (!button) return;
  $("#store-lock-status").textContent = storeClosed ? "지금 상점이 닫혀 있어요. 학생은 아무것도 살 수 없어요." : "지금 상점이 열려 있어요.";
  button.textContent = storeClosed ? "상점 열기" : "상점 닫기";
}

async function handleStoreLockToggle() {
  if (!isTeacher(currentProfile, currentUser)) return;
  try {
    await set(ref(db, "settings/storeClosed"), !storeClosed);
  } catch (error) {
    setMessage(adminMessage, authErrorMessage(error.code));
  }
}

// ── 구매 기록 (선생님) ─────────────────────────────────────

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
  const items = purchases.sort((a, b) => getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt));
  const waiting = items.filter((item) => !item.adminChecked && !item.refunded).length;
  $("#admin-purchase-summary").textContent = items.length ? `전체 ${items.length}건 · 확인 전 ${waiting}건` : "";

  adminUsedList.innerHTML = items.length
    ? items.map(renderAdminPurchaseItem).join("")
    : `<p class="empty-text">아직 구매 기록이 없습니다.</p>`;

  adminUsedList.querySelectorAll("button[data-check-purchase-id]").forEach((button) => {
    button.addEventListener("click", () => handleAdminPurchaseCheck(button.dataset.checkPurchaseId, button.dataset.checked !== "true"));
  });
  adminUsedList.querySelectorAll("button[data-refund-purchase-id]").forEach((button) => {
    button.addEventListener("click", () => handleAdminRefund(button.dataset.refundPurchaseId));
  });
}

function renderAdminPurchaseItem(item) {
  const buyer = item.studentName ?? item.studentEmail ?? item.uid ?? "학생";
  const checked = Boolean(item.adminChecked);
  const status = purchaseStatus(item);
  const id = escapeAttribute(item.id);

  return `
    <article class="admin-list-item${checked ? " admin-list-item-checked" : ""}${item.refunded ? " is-off" : ""}">
      <div>
        <p class="rank-name">${escapeHtml(buyer)} · ${escapeHtml(item.productTitle ?? "상품")}</p>
        <p class="rank-meta">${Number(item.price ?? 0)}점 · 구매 ${formatDateTime(item.createdAt)}${checked ? ` · 확인 ${formatDateTime(item.adminCheckedAt)}` : ""} · <span class="purchase-status ${status.cls}">${status.text}</span></p>
      </div>
      <div class="admin-product-actions">
        ${item.refunded ? "" : `<button class="inline-action-button${checked ? " is-on" : ""}" type="button" data-check-purchase-id="${id}" data-checked="${checked}">${checked ? "확인함 ✓" : "확인"}</button>
        <button class="inline-danger-button" type="button" data-refund-purchase-id="${id}">취소·환불</button>`}
      </div>
    </article>
  `;
}

async function handleAdminPurchaseCheck(purchaseId, checked) {
  if (!isTeacher(currentProfile, currentUser) || !purchaseId) return;
  try {
    await update(ref(db, `purchases/${purchaseId}`), {
      adminChecked: checked,
      adminCheckedAt: checked ? serverTimestamp() : null,
      adminCheckedBy: checked ? currentUser.uid : null,
    });
  } catch (error) {
    setMessage(adminMessage, error.message || "확인 상태를 바꾸지 못했습니다.");
  }
}

// 마음에 안 드는 구매는 취소하고 포인트를 학생에게 돌려준다.
async function handleAdminRefund(purchaseId) {
  if (!isTeacher(currentProfile, currentUser) || !purchaseId) return;
  try {
    const purchaseRef = ref(db, `purchases/${purchaseId}`);
    const purchase = (await get(purchaseRef)).val();
    if (!purchase || purchase.refunded) return;
    const price = Number(purchase.price ?? 0);
    if (!confirm(`${purchase.studentName ?? "학생"}의 '${purchase.productTitle ?? "상품"}' 구매를 취소하고 ${price}점를 돌려줄까요?`)) return;
    // 먼저 취소 표시를 해 두 번 환불되지 않게 한다.
    const marked = await runTransaction(purchaseRef, (current) => (current && !current.refunded ? { ...current, refunded: true, refundedAt: Date.now(), refundedBy: currentUser.uid } : undefined));
    if (!marked.committed) return;
    const points = await runTransaction(ref(db, `users/${purchase.uid}/points`), (currentPoints) => Number(currentPoints ?? 0) + price);
    const student = (await get(ref(db, `users/${purchase.uid}`))).val();
    if (student) await syncLeaderboardProfile(purchase.uid, { ...student, points: points.snapshot.val() });
    setMessage(adminMessage, `구매를 취소하고 ${price}점를 돌려줬어요.`);
  } catch (error) {
    setMessage(adminMessage, error.message || "환불하지 못했습니다.");
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
    const endsValue = $("#admin-product-ends").value;
    const saleEndsAt = endsValue ? new Date(endsValue).getTime() : null;

    await set(push(ref(db, "storeProducts")), {
      title,
      description,
      price,
      pinned,
      imageUrl,
      visible: true,
      onSale: true,
      ...(saleEndsAt ? { saleEndsAt } : {}),
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
      ? `${name}에게 ${applied}점를 지급했습니다. (현재 ${total}점)`
      : `${name}에게서 ${-applied}점를 차감했습니다. (현재 ${total}점)`);
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
  // 학번만 적으면 학교 메일 주소로 로그인한다.
  if (/^\d{5,12}$/.test(login)) return `${login}@${SCHOOL_EMAIL_DOMAIN}`;
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
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "구글 로그인 창이 닫혔어요. 다시 눌러 주세요.";
  if (code === "auth/operation-not-allowed") return "아직 구글 로그인이 켜져 있지 않아요. 선생님께 말해 주세요.";
  if (code === "auth/account-exists-with-different-credential") return "예전 계정이 아직 구글과 연결되지 않았어요. 선생님께 '구글 로그인 열기'를 부탁한 뒤 다시 눌러 주세요.";
  if (code === "auth/requires-recent-login") return "다시 로그인한 뒤에 해 주세요.";
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
  Object.values(quizUnsubs).forEach((unsubscribe) => unsubscribe());
  quizUnsubs = {};
  quizQuestions = [];
  for (const store of [quizCorrect, quizMine, quizAwards]) Object.keys(store).forEach((key) => delete store[key]);
  quizAwarding.clear();
  adminQuizData = { answers: {}, attempts: {}, awards: {} };
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
