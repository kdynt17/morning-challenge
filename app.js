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
const challengeImage = $("#challenge-image");
const challengeDescription = $("#challenge-description");
const leaderboardList = $("#leaderboard-list");
const storeList = $("#store-list");
const pageTitle = $("#page-title");
const todayLabel = $("#today-label");
const myPoints = $("#my-points");
const profileMessage = $("#profile-message");
const profileName = $("#profile-name");
const profileEmail = $("#profile-email");
const profileRole = $("#profile-role");
const profilePoints = $("#profile-points");
const purchaseHistoryList = $("#purchase-history-list");
const adminNavButton = $("#admin-nav-button");
const challengeForm = $("#challenge-form");
const deleteChallengeButton = $("#delete-challenge-button");
const productForm = $("#product-form");
const adminProductList = $("#admin-product-list");
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
const navButtons = document.querySelectorAll("[data-target-page]");

let auth;
let db;
let currentUser = null;
let currentProfile = null;
let currentChallengeId = null;
let currentChallenge = null;
let currentChallengeResult = null;
let selectedProduct = null;
let adminStudents = [];
let unsubscribers = [];

const pageNames = {
  home: "오늘의 문제",
  leaderboard: "포인트 순위",
  store: "포인트 상점",
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
  answerInput.addEventListener("input", () => setMessage(answerMessage, ""));
  answerForm.addEventListener("submit", handleAnswerSubmit);
  challengeForm.addEventListener("submit", handleChallengeSave);
  deleteChallengeButton.addEventListener("click", handleChallengeDelete);
  productForm.addEventListener("submit", handleProductSave);
  pointGrantForm.addEventListener("submit", handlePointGrant);
  buyProductButton.addEventListener("click", handlePurchase);

  navButtons.forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.targetPage));
  });

  $("#admin-challenge-date").value = getKoreaDateKey();
  setAuthMode("login");

  onAuthStateChanged(auth, async (user) => {
    clearSubscriptions();
    currentUser = user;
    currentProfile = null;
    currentChallengeResult = null;
    selectedProduct = null;

    if (!user) {
      showSignedOut();
      return;
    }

    showSignedIn();
    currentProfile = await ensureProfile(user);
    renderProfile(user, currentProfile);
    showPage("home");
    subscribeProfile();
    subscribeChallenge();
    subscribeMyChallengeResult();
    subscribeLeaderboard();
    subscribeStore();
    subscribePurchaseHistory();
    subscribeAdminTools();
  });
}

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
      points: 0,
      todayResult: "-",
      createdAt: serverTimestamp(),
    });
    await syncLeaderboardProfile(credential.user.uid, { name, role: "student", points: 0, todayResult: "-" });
    setMessage(signupMessage, "가입되었습니다.");
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
    renderProfile(currentUser, currentProfile);
    void syncLeaderboardProfile(currentUser.uid, currentProfile);
  });
  unsubscribers.push(unsubscribe);
}

function renderProfile(user, profile) {
  const name = profile?.name || user.displayName || "학생";
  const teacher = isTeacher(profile, user);
  const points = Number(profile?.points ?? 0);

  myPoints.textContent = points;
  profileMessage.textContent = teacher
    ? "문제와 상점 상품을 등록할 수 있습니다."
    : `${name} 님, 오늘 문제를 확인해보세요.`;
  profileName.textContent = name;
  profileEmail.textContent = profile?.email ?? user.email;
  profileRole.textContent = teacher ? "선생님" : "학생";
  profilePoints.textContent = points;
  adminNavButton.hidden = !teacher;
}

async function syncLeaderboardProfile(uid, profile) {
  if (!uid || profile?.role === "teacher") return;

  await set(ref(db, `leaderboardUsers/${uid}`), {
    name: profile?.name || "학생",
    points: Number(profile?.points ?? 0),
    todayResult: profile?.todayResult ?? "-",
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
  setMessage(authMessage, isSignup ? "처음이면 이름, 이메일, 비밀번호를 입력하세요." : "이메일과 비밀번호로 로그인하세요.");
}

function showSignedIn() {
  document.body.classList.add("is-authenticated");
  authScreen.hidden = true;
  appShell.hidden = false;
}

function showSignedOut() {
  document.body.classList.remove("is-authenticated");
  authScreen.hidden = false;
  appShell.hidden = true;
  setAuthMode("login");
  setMessage(authMessage, "이메일과 비밀번호로 로그인하세요.");
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
      currentChallenge = null;
      challengeDate.textContent = today;
      challengeTitle.textContent = "오늘의 문제가 아직 등록되지 않았습니다.";
      challengeDescription.textContent = "선생님이 문제를 등록하면 자동으로 표시됩니다.";
      challengeImage.hidden = true;
      challengeImage.removeAttribute("src");
      renderChallengeAvailability();
      return;
    }

    const challenge = snapshot.val();
    currentChallengeId = snapshot.key;
    currentChallenge = challenge;
    challengeDate.textContent = today;
    challengeTitle.textContent = challenge.title;
    challengeDescription.textContent = challenge.description;
    renderImage(challengeImage, challenge.imageUrl);
    setMessage(answerMessage, "");
    renderChallengeAvailability();
  });
  unsubscribers.push(unsubscribe);
}

function subscribeMyChallengeResult() {
  const today = getKoreaDateKey();
  const unsubscribe = onValue(ref(db, `challengeResults/${today}/${currentUser.uid}`), (snapshot) => {
    currentChallengeResult = snapshot.exists() ? snapshot.val() : null;
    renderChallengeAvailability();
  });
  unsubscribers.push(unsubscribe);
}

function renderChallengeAvailability() {
  const submitButton = answerForm.querySelector("button");

  if (!currentChallenge) {
    challengeStatus.textContent = "아직 공개 전";
    submitButton.disabled = true;
    return;
  }

  if (currentChallengeResult?.status === "correct") {
    challengeStatus.textContent = "제출 완료";
    submitButton.disabled = true;
    setMessage(answerMessage, "이미 정답을 제출했습니다. 포인트는 한 번만 지급됩니다.");
    return;
  }

  if (currentChallengeResult?.status === "awarding") {
    challengeStatus.textContent = "처리 중";
    submitButton.disabled = true;
    return;
  }

  challengeStatus.textContent = "제출 가능";
  submitButton.disabled = false;
}

function subscribeLeaderboard() {
  const studentsQuery = query(ref(db, "leaderboardUsers"), orderByChild("points"), limitToLast(30));

  const unsubscribe = onValue(studentsQuery, (snapshot) => {
    if (!snapshot.exists()) {
      leaderboardList.innerHTML = `<p class="empty-text">아직 포인트 기록이 없습니다.</p>`;
      return;
    }

    const students = [];
    snapshot.forEach((child) => {
      const student = child.val();
      students.push(student);
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
    products.sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));

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
    purchases.sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));

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
  return `
    <article class="history-item">
      <div>
        <p class="rank-name">${escapeHtml(item.productTitle ?? "상품")}</p>
        <p class="rank-meta">${formatDateTime(item.createdAt)}</p>
      </div>
      <div class="history-actions">
        <span class="rank-points">-${Number(item.price ?? 0)}점</span>
        <button class="secondary-button inline-action-button" type="button" data-use-purchase-id="${escapeAttribute(item.id)}">사용 완료</button>
      </div>
    </article>
  `;
}

async function handlePurchaseUse(purchaseId) {
  if (!currentUser || !purchaseId) return;

  const ok = confirm("이 구매 내역을 사용 완료로 정리할까요?");
  if (!ok) return;

  try {
    await remove(ref(db, `purchases/${purchaseId}`));
  } catch (error) {
    setMessage(profileMessage, error.message || "구매 내역을 정리하지 못했습니다.");
  }
}

function subscribeAdminTools() {
  if (!isTeacher(currentProfile, currentUser)) return;
  subscribeAdminStudents();
  subscribeAdminProducts();
}

function subscribeAdminStudents() {
  const unsubscribe = onValue(ref(db, "users"), (snapshot) => {
    adminStudents = [];

    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        const student = child.val();
        if (student.role !== "teacher") {
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
    if (!snapshot.exists()) {
      adminProductList.innerHTML = `<p class="empty-text">등록된 상품이 없습니다.</p>`;
      return;
    }

    const products = [];
    snapshot.forEach((child) => {
      const product = child.val();
      if (product.visible !== false) products.push({ id: child.key, ...product });
    });
    products.sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));

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
  const status = product.visible === false ? "삭제 또는 판매 완료" : "판매 중";
  const disabled = product.visible === false ? " disabled" : "";

  return `
    <article class="admin-list-item">
      <div>
        <p class="rank-name">${escapeHtml(product.title ?? "상품")}</p>
        <p class="rank-meta">${Number(product.price ?? 0)}점 · ${escapeHtml(status)}</p>
      </div>
      <button class="inline-danger-button" type="button" data-delete-product-id="${escapeAttribute(product.id)}"${disabled}>삭제</button>
    </article>
  `;
}

function renderProductItem(product) {
  const image = product.imageUrl
    ? `<img class="product-image" src="${escapeAttribute(product.imageUrl)}" alt="" loading="lazy" />`
    : `<div class="product-placeholder">상품</div>`;

  return `
    <article class="product-card">
      ${image}
      <div class="product-body">
        <p class="eyebrow">${Number(product.price ?? 0)}점</p>
        <h3>${escapeHtml(product.title ?? "상품")}</h3>
        <p>${escapeHtml(product.description ?? "")}</p>
        <button type="button" data-product-id="${product.id}">자세히 보기</button>
      </div>
    </article>
  `;
}

function openProductDialog(product) {
  selectedProduct = product;
  const price = Number(product.price ?? 0);
  const points = Number(currentProfile?.points ?? 0);
  renderImage(dialogProductImage, product.imageUrl);
  dialogProductPrice.textContent = `${price}점`;
  dialogProductTitle.textContent = product.title ?? "상품";
  dialogProductDescription.textContent = product.description ?? "";
  dialogBalance.textContent = `현재 잔액 ${points}점`;
  dialogAfterBalance.textContent = `구매 후 잔액 ${points - price}점`;
  buyProductButton.disabled = points < price || isTeacher(currentProfile, currentUser);
  buyProductButton.textContent = points < price ? "포인트가 부족합니다" : "제품 구입";
  setMessage(purchaseMessage, "진짜 구매하시겠습니까? 버튼을 누르면 포인트가 차감됩니다.");
  productDialog.showModal();
}

async function handlePurchase() {
  if (!currentUser || !selectedProduct) return;
  if (isTeacher(currentProfile, currentUser)) {
    setMessage(purchaseMessage, "선생님 계정은 구매하지 않습니다.");
    return;
  }

  const price = Number(selectedProduct.price ?? 0);
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
      price,
      remainingPoints: remaining,
      createdAt: serverTimestamp(),
    });
    await update(ref(db, `storeProducts/${selectedProduct.id}`), {
      visible: false,
      purchasedBy: currentUser.uid,
      purchasedAt: serverTimestamp(),
    });
    setMessage(purchaseMessage, `구매되었습니다. 남은 잔액은 ${remaining}점입니다.`);
    dialogBalance.textContent = `현재 잔액 ${remaining}점`;
    dialogAfterBalance.textContent = `구매 후 잔액 ${remaining}점`;
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

async function handleAnswerSubmit(event) {
  event.preventDefault();

  if (!currentUser || !currentChallengeId) {
    setMessage(answerMessage, "로그인 후 오늘의 문제를 불러와 주세요.");
    return;
  }

  const answer = answerInput.value.trim();
  if (!answer) return;

  if (!currentChallenge?.answerHash) {
    setMessage(answerMessage, "아직 자동 채점용 정답이 등록되지 않았습니다.");
    return;
  }

  try {
    setMessage(answerMessage, "채점하는 중입니다.");
    const submittedHash = await hashText(normalizeAnswer(answer));
    const isCorrect = submittedHash === currentChallenge.answerHash;

    await saveSubmission(answer, isCorrect ? "correct" : "wrong");

    if (!isCorrect) {
      setMessage(answerMessage, "틀렸어요. 답을 고쳐서 다시 제출할 수 있습니다.");
      return;
    }

    const resultRef = ref(db, `challengeResults/${currentChallengeId}/${currentUser.uid}`);
    const reserveResult = await runTransaction(resultRef, (currentResult) => {
      if (currentResult?.status === "correct" && Number.isFinite(Number(currentResult.awardedPoints))) return;
      return {
        ...(currentResult ?? {}),
        uid: currentUser.uid,
        challengeId: currentChallengeId,
        status: "awarding",
        answer,
        createdAt: currentResult?.createdAt ?? Date.now(),
      };
    });

    if (!reserveResult.committed) {
      const previousResult = reserveResult.snapshot.val();
      answerInput.value = "";
      setMessage(
        answerMessage,
        previousResult?.rank
          ? `이미 정답 처리되었습니다. ${previousResult.rank}번째 정답으로 ${Number(previousResult.awardedPoints ?? 0)}점이 지급된 기록이 있습니다.`
          : "이미 정답 처리되었습니다. 포인트는 한 번만 지급됩니다.",
      );
      return;
    }

    const reservedResult = reserveResult.snapshot.val();
    let rank = Number(reservedResult?.rank ?? 0);
    let awardedPoints = Number(reservedResult?.awardedPoints ?? NaN);

    if (!rank || !Number.isFinite(awardedPoints)) {
      const counterResult = await runTransaction(ref(db, `scoreCounters/${currentChallengeId}/correctCount`), (currentCount) => {
        return Number(currentCount ?? 0) + 1;
      });
      rank = Number(counterResult.snapshot.val() ?? 1);
      awardedPoints = Math.max(0, 150 - (rank - 1) * 5);
    }

    await update(resultRef, {
      uid: currentUser.uid,
      challengeId: currentChallengeId,
      status: "awarding",
      rank,
      awardedPoints,
      answer,
    });

    const pointResult = await runTransaction(ref(db, `users/${currentUser.uid}/points`), (currentPoints) => {
      return Number(currentPoints ?? 0) + awardedPoints;
    });

    if (!pointResult.committed) {
      throw new Error("포인트 지급에 실패했습니다. 선생님에게 보정 지급을 요청해주세요.");
    }

    const totalPoints = Number(pointResult.snapshot.val() ?? 0);
    await syncLeaderboardProfile(currentUser.uid, { ...currentProfile, points: totalPoints });

    await update(resultRef, {
      uid: currentUser.uid,
      challengeId: currentChallengeId,
      status: "correct",
      rank,
      awardedPoints,
      answer,
      awardedAt: serverTimestamp(),
    });

    answerInput.value = "";
    setMessage(answerMessage, `정답입니다! ${rank}번째 정답으로 ${awardedPoints}점을 받았습니다.`);
  } catch (error) {
    setMessage(answerMessage, error.message || authErrorMessage(error.code));
  }
}

async function saveSubmission(answer, status) {
  await set(push(ref(db, "submissions")), {
    challengeId: currentChallengeId,
    uid: currentUser.uid,
    answer,
    status,
    createdAt: serverTimestamp(),
  });
}

async function handleChallengeSave(event) {
  event.preventDefault();
  if (!isTeacher(currentProfile, currentUser)) return;

  try {
    setMessage(adminMessage, "문제를 저장하는 중입니다.");
    const dateKey = $("#admin-challenge-date").value;
    const title = $("#admin-challenge-title").value.trim();
    const description = $("#admin-challenge-description").value.trim();
    const answer = $("#admin-answer").value.trim();
    const answerHash = answer ? await hashText(normalizeAnswer(answer)) : "";
    const imageUrl = await getImageValue("#admin-challenge-image-url", "#admin-challenge-image-file");

    await update(ref(db), {
      [`dailyChallenges/${dateKey}`]: {
        title,
        description,
        imageUrl,
        answerHash,
        correctCount: 0,
        status: "open",
        createdBy: currentUser.uid,
        updatedAt: serverTimestamp(),
      },
      [`challengeAnswers/${dateKey}`]: {
        answer,
        updatedAt: serverTimestamp(),
      },
    });

    challengeForm.reset();
    $("#admin-challenge-date").value = getKoreaDateKey();
    setMessage(adminMessage, "문제를 저장했습니다.");
  } catch (error) {
    setMessage(adminMessage, error.message || "문제를 저장하지 못했습니다.");
  }
}

async function handleChallengeDelete() {
  if (!isTeacher(currentProfile, currentUser)) return;

  const dateKey = $("#admin-challenge-date").value || getKoreaDateKey();
  const ok = confirm(`${dateKey} 문제를 삭제할까요? 학생 화면에서도 사라집니다.`);
  if (!ok) return;

  try {
    setMessage(adminMessage, "문제를 삭제하는 중입니다.");
    await update(ref(db), {
      [`dailyChallenges/${dateKey}`]: null,
      [`challengeAnswers/${dateKey}`]: null,
      [`scoreCounters/${dateKey}`]: null,
    });
    setMessage(adminMessage, "문제를 삭제했습니다.");
  } catch (error) {
    setMessage(adminMessage, error.message || "문제를 삭제하지 못했습니다.");
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
    const imageUrl = await getImageValue("#admin-product-image-url", "#admin-product-image-file");

    await set(push(ref(db, "storeProducts")), {
      title,
      description,
      price,
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

    pointGrantForm.reset();
    setMessage(adminMessage, `${student?.name ?? "학생"}에게 ${amount}점을 지급했습니다.`);
  } catch (error) {
    setMessage(adminMessage, error.message || "포인트를 지급하지 못했습니다.");
  }
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

function normalizeAnswer(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ko-KR");
}

async function hashText(value) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isTeacher(profile, user) {
  return profile?.role === "teacher" || user?.email === ADMIN_AUTH_EMAIL;
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

function formatDateTime(timestamp) {
  if (!timestamp) return "방금";
  return new Date(Number(timestamp)).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function authErrorMessage(code) {
  if (code === "auth/email-already-in-use") return "이미 가입된 이메일입니다. 로그인으로 들어가세요.";
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

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
