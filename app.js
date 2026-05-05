import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
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
  ref,
  serverTimestamp,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

const ADMIN_LOGIN = "admin@admin";
const ADMIN_AUTH_EMAIL = "admin@admin.com";

const $ = (selector) => document.querySelector(selector);
const setupRequired = firebaseConfig.apiKey.startsWith("PASTE_");

const authScreen = $("#auth-screen");
const appShell = $("#app-shell");
const showLoginButton = $("#show-login-button");
const showSignupButton = $("#show-signup-button");
const loginPanel = $("#login-panel");
const signupPanel = $("#signup-panel");
const loginForm = $("#login-form");
const signupForm = $("#signup-form");
const logoutButton = $("#logout-button");
const authMessage = $("#auth-message");
const signupMessage = $("#signup-message");
const answerForm = $("#answer-form");
const answerInput = $("#answer");
const answerMessage = $("#answer-message");
const challengeDate = $("#challenge-date");
const challengeStatus = $("#challenge-status");
const challengeTitle = $("#challenge-title");
const challengeDescription = $("#challenge-description");
const leaderboardList = $("#leaderboard-list");
const auctionList = $("#auction-list");
const pageTitle = $("#page-title");
const todayLabel = $("#today-label");
const myPoints = $("#my-points");
const profileMessage = $("#profile-message");
const profileName = $("#profile-name");
const profileEmail = $("#profile-email");
const profileRole = $("#profile-role");
const profilePoints = $("#profile-points");
const adminNavButton = $("#admin-nav-button");
const challengeForm = $("#challenge-form");
const auctionForm = $("#auction-form");
const adminMessage = $("#admin-message");
const navButtons = document.querySelectorAll("[data-target-page]");

let auth;
let db;
let currentUser = null;
let currentProfile = null;
let currentChallengeId = null;
let unsubscribers = [];

const pageNames = {
  home: "오늘의 문제",
  leaderboard: "포인트 순위",
  auction: "포인트 경매장",
  profile: "내 정보",
  admin: "선생님 관리",
};

if (setupRequired) {
  setMessage(authMessage, "Firebase 설정값을 firebase-config.js에 넣어주세요.");
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);

  showLoginButton.addEventListener("click", () => setAuthMode("login"));
  showSignupButton.addEventListener("click", () => setAuthMode("signup"));
  loginForm.addEventListener("submit", handleLogin);
  signupForm.addEventListener("submit", handleSignup);
  logoutButton.addEventListener("click", () => signOut(auth));
  answerForm.addEventListener("submit", handleAnswerSubmit);
  challengeForm.addEventListener("submit", handleChallengeSave);
  auctionForm.addEventListener("submit", handleAuctionSave);

  navButtons.forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.targetPage));
  });

  $("#admin-challenge-date").value = getKoreaDateKey();

  onAuthStateChanged(auth, async (user) => {
    clearSubscriptions();
    currentUser = user;

    if (!user) {
      document.body.classList.remove("is-authenticated");
      authScreen.hidden = false;
      authScreen.style.display = "";
      appShell.hidden = true;
      appShell.style.display = "none";
      setAuthMode("login");
      setMessage(authMessage, "학생은 회원가입 후 바로 들어갈 수 있습니다. 선생님 계정은 admin@admin으로 로그인하세요.");
      return;
    }

    document.body.classList.add("is-authenticated");
    authScreen.hidden = true;
    authScreen.style.display = "none";
    appShell.hidden = false;
    appShell.style.display = "";
    currentProfile = await ensureProfile(user);
    renderProfile(user, currentProfile);
    showPage("home");
    subscribeChallenge();
    subscribeLeaderboard();
    subscribeAuctions();
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const rawLogin = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const email = normalizeLoginEmail(rawLogin);

  try {
    await signInWithEmailAndPassword(auth, email, password);
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
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    await set(ref(db, `users/${credential.user.uid}`), {
      name,
      email,
      role: "student",
      points: 0,
      todayResult: "-",
      createdAt: serverTimestamp(),
    });
    setMessage(signupMessage, "가입되었습니다.");
  } catch (error) {
    setMessage(signupMessage, authErrorMessage(error.code));
  }
}

async function ensureProfile(user) {
  const snapshot = await get(ref(db, `users/${user.uid}`));
  if (snapshot.exists()) {
    const profile = snapshot.val();
    if ((!profile.name || profile.name === "학생") && user.displayName) {
      const updatedProfile = { ...profile, name: user.displayName };
      await update(ref(db, `users/${user.uid}`), { name: user.displayName });
      return updatedProfile;
    }
    return profile;
  }

  const isAdmin = user.email === ADMIN_AUTH_EMAIL;
  const profile = {
    name: isAdmin ? "선생님" : user.displayName || "학생",
    email: isAdmin ? ADMIN_LOGIN : user.email,
    authEmail: user.email,
    role: "student",
    points: 0,
    todayResult: "-",
    createdAt: serverTimestamp(),
  };
  await set(ref(db, `users/${user.uid}`), profile);
  return profile;
}

function renderProfile(user, profile) {
  const name = profile?.name || user.displayName || "학생";
  const role = profile?.role ?? "student";
  const points = Number(profile?.points ?? 0);
  myPoints.textContent = points;
  profileMessage.textContent = role === "teacher" ? "문제와 경매 상품을 등록할 수 있습니다." : `${name} 님, 오늘 문제를 확인해보세요.`;
  profileName.textContent = name;
  profileEmail.textContent = profile?.email ?? user.email;
  profileRole.textContent = role === "teacher" ? "선생님" : "학생";
  profilePoints.textContent = points;
  adminNavButton.hidden = role !== "teacher";
}

function setAuthMode(mode) {
  const isSignup = mode === "signup";
  loginPanel.classList.toggle("active-auth-panel", !isSignup);
  signupPanel.classList.toggle("active-auth-panel", isSignup);
  showLoginButton.classList.toggle("active", !isSignup);
  showSignupButton.classList.toggle("active", isSignup);
  showLoginButton.setAttribute("aria-selected", String(!isSignup));
  showSignupButton.setAttribute("aria-selected", String(isSignup));
  setMessage(authMessage, isSignup ? "처음이면 이름, 이메일, 비밀번호를 입력하세요." : "이메일과 비밀번호로 로그인하세요.");
}

function showPage(page) {
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active-page", section.dataset.page === page);
  });

  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.targetPage === page);
  });

  pageTitle.textContent = pageNames[page] ?? "아침 창의력 챌린지";
  todayLabel.textContent = getKoreaDateKey();
}

function subscribeChallenge() {
  const today = getKoreaDateKey();
  const challengeRef = ref(db, `dailyChallenges/${today}`);

  const unsubscribe = onValue(challengeRef, (snapshot) => {
    if (!snapshot.exists()) {
      currentChallengeId = null;
      challengeDate.textContent = today;
      challengeStatus.textContent = "아직 공개 전";
      challengeTitle.textContent = "오늘의 문제가 아직 등록되지 않았습니다.";
      challengeDescription.textContent = "선생님이 문제를 등록하면 자동으로 표시됩니다.";
      answerForm.querySelector("button").disabled = true;
      return;
    }

    const challenge = snapshot.val();
    currentChallengeId = snapshot.key;
    challengeDate.textContent = today;
    challengeStatus.textContent = challenge.status === "open" ? "제출 가능" : "마감";
    challengeTitle.textContent = challenge.title;
    challengeDescription.textContent = challenge.description;
    answerForm.querySelector("button").disabled = challenge.status !== "open";
  });
  unsubscribers.push(unsubscribe);
}

function subscribeLeaderboard() {
  const studentsQuery = query(ref(db, "users"), orderByChild("points"), limitToLast(30));

  const unsubscribe = onValue(studentsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      leaderboardList.innerHTML = `<p class="empty-text">아직 포인트 기록이 없습니다.</p>`;
      return;
    }

    const students = [];
    snapshot.forEach((child) => {
      const student = child.val();
      if (student.role !== "teacher") students.push(student);
    });
    students.sort((a, b) => Number(b.points ?? 0) - Number(a.points ?? 0));

    leaderboardList.innerHTML = students.length
      ? students.map(renderRankItem).join("")
      : `<p class="empty-text">아직 학생 기록이 없습니다.</p>`;
  });
  unsubscribers.push(unsubscribe);
}

function renderRankItem(student, index) {
  const points = Number(student.points ?? 0);
  return `
    <article class="rank-item">
      <span class="rank-number">${index + 1}</span>
      <div>
        <p class="rank-name">${escapeHtml(student.name ?? student.email ?? "학생")}</p>
        <p class="rank-meta">${escapeHtml(student.todayResult ?? "-")}</p>
      </div>
      <span class="rank-points">${points}점</span>
    </article>
  `;
}

function subscribeAuctions() {
  const auctionsQuery = query(ref(db, "auctions"), orderByChild("endsAt"), limitToLast(20));

  const unsubscribe = onValue(auctionsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      auctionList.innerHTML = `<p class="empty-text">등록된 상품이 없습니다.</p>`;
      return;
    }

    const auctions = [];
    snapshot.forEach((child) => {
      const item = child.val();
      if (item.visible) auctions.push({ id: child.key, ...item });
    });

    if (!auctions.length) {
      auctionList.innerHTML = `<p class="empty-text">표시할 상품이 없습니다.</p>`;
      return;
    }

    auctions.sort((a, b) => Number(a.endsAt ?? 0) - Number(b.endsAt ?? 0));
    auctionList.innerHTML = auctions.map(renderAuctionItem).join("");

    auctionList.querySelectorAll("button[data-auction-id]").forEach((button) => {
      button.addEventListener("click", () => handleBid(button.dataset.auctionId));
    });
  });
  unsubscribers.push(unsubscribe);
}

function renderAuctionItem(item, index) {
  const status = item.status === "open" ? "진행 중" : "마감";
  const currentPrice = Number(item.currentPrice ?? item.startPrice ?? 0);
  const colorClass = ["color-green", "color-blue", "color-red"][index % 3];
  return `
    <article class="auction-item">
      <div class="auction-visual ${colorClass}">${escapeHtml(item.category ?? "상품")}</div>
      <div class="auction-body">
        <p class="eyebrow">${status}</p>
        <h3>${escapeHtml(item.title ?? "상품")}</h3>
        <p>현재가 ${currentPrice}점 · ${formatDeadline(item.endsAt)}</p>
        <button type="button" data-auction-id="${item.id}" ${item.status === "open" ? "" : "disabled"}>입찰하기</button>
      </div>
    </article>
  `;
}

async function handleAnswerSubmit(event) {
  event.preventDefault();

  if (!currentUser || !currentChallengeId) {
    setMessage(answerMessage, "로그인 후 오늘의 문제를 불러와 주세요.");
    return;
  }

  const answer = answerInput.value.trim();
  if (!answer) return;

  const submissionRef = push(ref(db, "submissions"));
  await set(submissionRef, {
    challengeId: currentChallengeId,
    uid: currentUser.uid,
    answer,
    status: "pending",
    createdAt: serverTimestamp(),
  });

  answerInput.value = "";
  setMessage(answerMessage, "제출됐습니다.");
}

async function handleBid(auctionId) {
  if (!currentUser) return;

  const amount = Number(prompt("입찰할 포인트를 입력하세요."));
  if (!Number.isFinite(amount) || amount <= 0) return;

  const bidRef = push(ref(db, "bids"));
  await set(bidRef, {
    auctionId,
    uid: currentUser.uid,
    amount,
    createdAt: serverTimestamp(),
  });
}

async function handleChallengeSave(event) {
  event.preventDefault();
  if (currentProfile?.role !== "teacher") return;

  const dateKey = $("#admin-challenge-date").value;
  const title = $("#admin-challenge-title").value.trim();
  const description = $("#admin-challenge-description").value.trim();
  const keywords = $("#admin-answer-keywords").value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  await update(ref(db), {
    [`dailyChallenges/${dateKey}`]: {
      title,
      description,
      status: "open",
      createdBy: currentUser.uid,
      updatedAt: serverTimestamp(),
    },
    [`challengeAnswers/${dateKey}`]: {
      keywords,
      exactAnswers: [],
      updatedAt: serverTimestamp(),
    },
  });

  challengeForm.reset();
  $("#admin-challenge-date").value = getKoreaDateKey();
  setMessage(adminMessage, "문제를 저장했습니다.");
}

async function handleAuctionSave(event) {
  event.preventDefault();
  if (currentProfile?.role !== "teacher") return;

  const title = $("#admin-auction-title").value.trim();
  const category = $("#admin-auction-category").value.trim();
  const startPrice = Number($("#admin-auction-price").value);
  const endsAt = new Date($("#admin-auction-end").value).getTime();
  const auctionRef = push(ref(db, "auctions"));

  await set(auctionRef, {
    title,
    category,
    visible: true,
    status: "open",
    startPrice,
    currentPrice: startPrice,
    endsAt,
    createdBy: currentUser.uid,
    createdAt: serverTimestamp(),
  });

  auctionForm.reset();
  setMessage(adminMessage, "경매 상품을 저장했습니다.");
}

function normalizeLoginEmail(value) {
  return value === ADMIN_LOGIN ? ADMIN_AUTH_EMAIL : value;
}

function getKoreaDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDeadline(timestamp) {
  if (!timestamp) return "마감 시간 미정";
  return new Date(Number(timestamp)).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function authErrorMessage(code) {
  if (code === "auth/email-already-in-use") return "이미 가입된 아이디입니다. 로그인으로 들어가세요.";
  if (code === "auth/invalid-email") return "아이디 또는 이메일 형식을 확인해주세요.";
  if (code === "auth/invalid-credential") return "아이디 또는 비밀번호를 확인해주세요.";
  if (code === "auth/unauthorized-domain") return "Firebase Authentication 승인 도메인에 kdynt17.github.io를 추가해주세요.";
  if (code === "auth/weak-password") return "비밀번호는 6자 이상이어야 합니다.";
  if (code === "auth/too-many-requests") return "잠시 후 다시 시도해주세요.";
  if (code === "PERMISSION_DENIED") return "데이터베이스 규칙을 최신 버전으로 게시해주세요.";
  return "처리 중 문제가 생겼습니다.";
}

function clearSubscriptions() {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
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
    .replaceAll("'", "&#039;");
}
