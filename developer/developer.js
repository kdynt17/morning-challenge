import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  get,
  getDatabase,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

import { firebaseConfig } from "../firebase-config.js";

const ADMIN_LOGIN = "admin@admin";
const ADMIN_AUTH_EMAIL = "admin@admin.com";
// 학생 비밀번호를 바꾸려면 Firebase 프로젝트 주인 구글 계정의 허락(토큰)이 필요하다.
// 별도 앱으로 구글 로그인 창을 띄워 토큰만 받고, 선생님(admin) 로그인은 그대로 둔다.
const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const MIN_PASSWORD = 6;

const $ = (selector) => document.querySelector(selector);

const loginScreen = $("#dev-login-screen");
const shell = $("#dev-shell");
const loginForm = $("#dev-login-form");
const loginMessage = $("#dev-login-message");
const pendingList = $("#pending-list");
const userList = $("#user-list");
const searchInput = $("#dev-search");
const statusFilter = $("#dev-status-filter");
const devMessage = $("#dev-message");

const statusLabels = { pending: "승인 대기", approved: "승인", rejected: "거절" };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
let ownerAuth = null;
let ownerToken = null;

let currentUser = null;
let users = [];
let unsubscribeUsers = null;

loginForm.addEventListener("submit", handleLogin);
$("#dev-logout-button").addEventListener("click", () => signOut(auth));
searchInput.addEventListener("input", renderUsers);
statusFilter.addEventListener("change", renderUsers);
document.addEventListener("click", handleActionClick);

onAuthStateChanged(auth, async (user) => {
  unsubscribeUsers?.();
  unsubscribeUsers = null;
  currentUser = user;

  if (!user) {
    showLogin();
    return;
  }

  let profile = null;
  try {
    const snapshot = await get(ref(db, `users/${user.uid}`));
    profile = snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    profile = null;
  }

  if (!isTeacher(profile, user)) {
    await signOut(auth);
    setMessage(loginMessage, "선생님 계정만 들어올 수 있습니다.");
    return;
  }

  showShell();
  subscribeUsers();
});

async function handleLogin(event) {
  event.preventDefault();
  setMessage(loginMessage, "로그인하는 중입니다.");
  const rawLogin = $("#dev-login-email").value.trim();
  // 휴대폰 자판이 첫 글자를 대문자로 바꿔도 관리자 아이디로 알아본다.
  const lower = rawLogin.toLowerCase();
  const email = [ADMIN_LOGIN, "admin", ADMIN_AUTH_EMAIL].includes(lower) ? ADMIN_AUTH_EMAIL : rawLogin;

  try {
    await signInWithEmailAndPassword(auth, email, $("#dev-login-password").value);
  } catch (error) {
    setMessage(loginMessage, ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(error.code) ? "아이디 또는 비밀번호를 확인해주세요." : `로그인하지 못했습니다. (${error.code ?? "알 수 없는 오류"})`);
  }
}

function subscribeUsers() {
  unsubscribeUsers = onValue(
    ref(db, "users"),
    (snapshot) => {
      users = [];
      snapshot.forEach((child) => {
        users.push({ id: child.key, ...child.val() });
      });
      users.sort((a, b) => getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt));
      renderStats();
      renderPending();
      renderUsers();
    },
    () => setMessage(devMessage, "가입자 목록을 읽지 못했습니다. 데이터베이스 규칙을 확인해주세요."),
  );
}

function renderStats() {
  const students = users.filter((user) => user.role !== "teacher");
  $("#stat-total").textContent = students.length;
  $("#stat-pending").textContent = students.filter((user) => getStatus(user) === "pending").length;
  $("#stat-approved").textContent = students.filter((user) => getStatus(user) === "approved").length;
  $("#stat-rejected").textContent = students.filter((user) => getStatus(user) === "rejected").length;
}

function renderPending() {
  const pending = users.filter((user) => user.role !== "teacher" && getStatus(user) === "pending");
  pendingList.innerHTML = pending.length
    ? pending.map(renderUserItem).join("")
    : `<p class="empty-text">승인을 기다리는 학생이 없습니다.</p>`;
}

function renderUsers() {
  const keyword = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;

  const filtered = users.filter((user) => {
    if (status !== "all" && (user.role === "teacher" || getStatus(user) !== status)) return false;
    if (!keyword) return true;
    return [user.name, user.email, user.authEmail].some((value) => String(value ?? "").toLowerCase().includes(keyword));
  });

  userList.innerHTML = filtered.length
    ? filtered.map(renderUserItem).join("")
    : `<p class="empty-text">조건에 맞는 가입자가 없습니다.</p>`;
}

function renderUserItem(user) {
  const teacher = user.role === "teacher";
  const status = getStatus(user);
  const badge = teacher
    ? `<span class="status-badge status-teacher">선생님</span>`
    : `<span class="status-badge status-${status}">${statusLabels[status]}</span>`;
  const meta = [
    user.email ?? user.authEmail ?? "-",
    teacher ? null : `${Number(user.points ?? 0)}점`,
    `가입 ${formatDateTime(user.createdAt)}`,
  ].filter(Boolean).join(" · ");

  return `
    <article class="dev-user">
      <div class="dev-user-info">
        <p class="dev-user-name">${escapeHtml(user.name ?? "이름 없음")}${badge}</p>
        <p class="dev-user-meta">${escapeHtml(meta)}</p>
      </div>
      ${teacher ? "" : `<div class="dev-user-actions">${renderActions(user.id, status)}</div>`}
    </article>
  `;
}

function resetButton(id) {
  return `<button class="neutral-button" type="button" data-action="password" data-uid="${id}">비밀번호 재설정</button>`;
}

function renderActions(uid, status) {
  const id = escapeHtml(uid);
  if (status === "pending") {
    return `${resetButton(id)}
      <button class="approve-button" type="button" data-action="approve" data-uid="${id}">승인</button>
      <button class="reject-button" type="button" data-action="reject" data-uid="${id}">거절</button>
    `;
  }
  if (status === "approved") {
    return `${resetButton(id)}
      <button class="reject-button" type="button" data-action="reject" data-uid="${id}">승인 취소</button>`;
  }
  return `${resetButton(id)}<button class="neutral-button" type="button" data-action="approve" data-uid="${id}">다시 승인</button>`;
}

async function handleActionClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const user = users.find((item) => item.id === button.dataset.uid);
  if (!user) return;

  const name = user.name ?? user.email ?? "학생";
  if (button.dataset.action === "password") {
    await handlePasswordReset(user, button);
    return;
  }
  if (button.dataset.action === "reject" && !confirm(`${name} 학생을 ${getStatus(user) === "approved" ? "승인 취소" : "거절"}할까요? 학생은 앱을 이용할 수 없게 됩니다.`)) {
    return;
  }

  button.disabled = true;
  try {
    if (button.dataset.action === "approve") {
      await setStatus(user, "approved");
      setMessage(devMessage, `${name} 학생을 승인했습니다.`);
    } else {
      await setStatus(user, "rejected");
      setMessage(devMessage, `${name} 학생의 이용을 막았습니다.`);
    }
  } catch (error) {
    button.disabled = false;
    setMessage(devMessage, "상태를 바꾸지 못했습니다. 데이터베이스 규칙을 최신 버전으로 게시했는지 확인해주세요.");
  }
}

// ── 비밀번호 재설정 (선생님이 새 비밀번호를 정해 줌, 지금 비밀번호는 볼 수 없음) ──

async function handlePasswordReset(user, button) {
  const name = user.name ?? "학생";
  const login = user.authEmail ?? user.email ?? "";
  const password = prompt(`${name} (${login})\n새 비밀번호를 적으세요. (${MIN_PASSWORD}자 이상)\n학생에게 이 비밀번호를 알려 주고, 로그인한 뒤에도 그대로 써요.`);
  if (password === null) return;
  if (password.length < MIN_PASSWORD) {
    setMessage(devMessage, `비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`);
    return;
  }
  if (password !== prompt("확인을 위해 같은 비밀번호를 한 번 더 적으세요.")) {
    setMessage(devMessage, "두 비밀번호가 달라요. 다시 해 주세요.");
    return;
  }

  button.disabled = true;
  try {
    setMessage(devMessage, `${name} 학생의 비밀번호를 바꾸는 중이에요.`);
    let token = await getOwnerToken();
    let response = await updateAuthPassword(token, user.id, password);
    if (response.status === 401) {
      // 토큰이 만료됐으면 한 번 더 구글 허락을 받는다.
      ownerToken = null;
      token = await getOwnerToken();
      response = await updateAuthPassword(token, user.id, password);
    }
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(passwordErrorMessage(response.status, detail?.error?.message));
    }
    await update(ref(db, `users/${user.id}`), { passwordResetAt: serverTimestamp(), passwordResetBy: currentUser.uid }).catch(() => {});
    setMessage(devMessage, `${name} 학생의 비밀번호를 바꿨어요. 아이디 ${login} / 새 비밀번호로 로그인하면 돼요. (다른 기기에 로그인돼 있던 것은 곧 풀려요)`);
  } catch (error) {
    setMessage(devMessage, error.message || "비밀번호를 바꾸지 못했어요.");
  } finally {
    button.disabled = false;
  }
}

async function getOwnerToken() {
  if (ownerToken && ownerToken.expiresAt > Date.now() + 60000) return ownerToken.value;
  if (!ownerAuth) {
    ownerAuth = initializeAuth(initializeApp(firebaseConfig, "project-owner"), { persistence: inMemoryPersistence });
  }
  const provider = new GoogleAuthProvider();
  provider.addScope(CLOUD_SCOPE);
  provider.setCustomParameters({ prompt: "select_account" });
  let result;
  try {
    result = await signInWithPopup(ownerAuth, provider);
  } catch (error) {
    if (error.code === "auth/popup-blocked") throw new Error("팝업이 막혔어요. 브라우저에서 이 사이트의 팝업을 허용하고 다시 눌러 주세요.");
    if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") throw new Error("구글 로그인 창을 닫았어요. 다시 눌러 주세요.");
    if (error.code === "auth/operation-not-allowed") throw new Error("Firebase 콘솔 → Authentication → 로그인 방법에서 'Google'을 사용 설정해 주세요.");
    if (error.code === "auth/unauthorized-domain") throw new Error("Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 kdynt17.github.io를 추가해 주세요.");
    throw new Error(`구글 로그인에 실패했어요. (${error.code ?? error.message})`);
  }
  const accessToken = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  // 토큰만 쓰고, 구글 계정 로그인은 바로 닫는다.
  await signOut(ownerAuth).catch(() => {});
  if (!accessToken) throw new Error("구글 허락 토큰을 받지 못했어요. 다시 눌러 주세요.");
  ownerToken = { value: accessToken, expiresAt: Date.now() + 50 * 60000 };
  return accessToken;
}

function updateAuthPassword(token, uid, password) {
  return fetch(`https://identitytoolkit.googleapis.com/v1/projects/${firebaseConfig.projectId}/accounts:update`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ localId: uid, password }),
  });
}

function passwordErrorMessage(status, code = "") {
  if (code.startsWith("WEAK_PASSWORD")) return `비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`;
  if (code === "USER_NOT_FOUND") return "이 학생의 로그인 계정을 찾지 못했어요(Firebase에서 지워진 계정).";
  if (status === 403) return "이 구글 계정은 Firebase 프로젝트(morning-quest) 주인이 아니라서 비밀번호를 바꿀 수 없어요. 프로젝트를 만든 구글 계정을 골라 주세요.";
  return `비밀번호를 바꾸지 못했어요. (${status} ${code})`;
}

async function setStatus(user, status) {
  await update(ref(db, `users/${user.id}`), {
    status,
    statusUpdatedAt: serverTimestamp(),
    statusUpdatedBy: currentUser.uid,
  });

  if (status === "approved") {
    await set(ref(db, `leaderboardUsers/${user.id}`), {
      name: user.name || "학생",
      points: Number(user.points ?? 0),
      todayResult: user.todayResult ?? "-",
      updatedAt: serverTimestamp(),
    });
  } else {
    await remove(ref(db, `leaderboardUsers/${user.id}`));
  }
}

// 승인 기능 도입 전 가입자는 status가 없으므로 승인된 것으로 본다.
function getStatus(user) {
  return user.status ?? "approved";
}

function isTeacher(profile, user) {
  return profile?.role === "teacher" || user?.email === ADMIN_AUTH_EMAIL;
}

function showLogin() {
  loginScreen.hidden = false;
  shell.hidden = true;
}

function showShell() {
  loginScreen.hidden = true;
  shell.hidden = false;
  setMessage(loginMessage, "학생 계정으로는 들어갈 수 없습니다.");
}

function formatDateTime(timestamp) {
  if (!timestamp) return "-";
  return new Date(getTimestampValue(timestamp)).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTimestampValue(timestamp) {
  return typeof timestamp === "number" ? timestamp : 0;
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
