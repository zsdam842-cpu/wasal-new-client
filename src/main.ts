import "./style.css";

import { CallSocket } from "./calls/call.socket";

import {
  getSession,
  saveSession,
  clearSession,
  getValidAccessToken,
  startTokenRefreshTimer,
} from "./auth/session";

const SERVER_URL =
  import.meta.env
    .VITE_WASAL_SERVER_URL ??
  "http://localhost:3000";

const app =
  document.querySelector<HTMLDivElement>(
    "#app",
  );

if (!app) {
  throw new Error(
    "APP_ROOT_NOT_FOUND",
  );
}

app.innerHTML = `
  <main class="app">
    <div class="container">
      <header class="header">
        <h1>وصال</h1>
        <p>المكالمات ورفع الوسائط</p>
      </header>

      <section class="card">
        <div id="status" class="status">
          غير متصل بالسيرفر
        </div>

        <div class="field">
          <label for="token">
            Access Token
          </label>

          <input
            id="token"
            type="password"
            placeholder="أدخل رمز الدخول"
            autocomplete="off"
          />
        </div>

        <div class="field">
          <label for="refreshToken">
            Refresh Token
          </label>

          <input
            id="refreshToken"
            type="password"
            placeholder="أدخل رمز التجديد"
            autocomplete="off"
          />
        </div>

        <div class="field">
          <label for="serverUrl">
            Server URL
          </label>

          <input
            id="serverUrl"
            value="${SERVER_URL}"
            autocomplete="off"
          />
        </div>

        <button
          id="connectButton"
          class="btn primary"
        >
          اتصال بالسيرفر
        </button>

        <button
          id="logoutButton"
          class="btn"
          type="button"
        >
          تسجيل الخروج
        </button>
      </section>

      <section class="card">
        <h2>رفع صورة</h2>

        <div class="field">
          <input
            type="file"
            id="imageInput"
            accept="image/*"
          />
        </div>

        <button
          id="uploadButton"
          class="btn primary"
        >
          رفع الصورة
        </button>

        <div
          id="uploadStatus"
          class="status"
        ></div>
      </section>
    </div>
  </main>
`;

const statusElement =
  document.querySelector<HTMLDivElement>(
    "#status",
  )!;

const tokenInput =
  document.querySelector<HTMLInputElement>(
    "#token",
  )!;

const refreshTokenInput =
  document.querySelector<HTMLInputElement>(
    "#refreshToken",
  )!;

const serverUrlInput =
  document.querySelector<HTMLInputElement>(
    "#serverUrl",
  )!;

const connectButton =
  document.querySelector<HTMLButtonElement>(
    "#connectButton",
  )!;

const logoutButton =
  document.querySelector<HTMLButtonElement>(
    "#logoutButton",
  )!;

const imageInput =
  document.querySelector<HTMLInputElement>(
    "#imageInput",
  )!;

const uploadButton =
  document.querySelector<HTMLButtonElement>(
    "#uploadButton",
  )!;

const uploadStatus =
  document.querySelector<HTMLDivElement>(
    "#uploadStatus",
  )!;

const socket = new CallSocket();

let stopRefreshTimer:
  (() => void) | null = null;

function loadSavedSession(): void {
  const session = getSession();

  if (!session) {
    return;
  }

  tokenInput.value =
    session.accessToken;

  refreshTokenInput.value =
    session.refreshToken;
}

function saveCurrentSession(): boolean {
  const accessToken =
    tokenInput.value.trim();

  const refreshToken =
    refreshTokenInput.value.trim();

  if (
    !accessToken ||
    !refreshToken
  ) {
    return false;
  }

  saveSession({
    accessToken,
    refreshToken,
  });

  return true;
}

function startRefreshTimer(
  serverUrl: string,
): void {
  if (stopRefreshTimer) {
    stopRefreshTimer();
  }

  stopRefreshTimer =
    startTokenRefreshTimer(
      serverUrl,
    );
}

loadSavedSession();

connectButton.addEventListener(
  "click",
  async () => {
    const serverUrl =
      serverUrlInput.value.trim();

    if (!serverUrl) {
      statusElement.textContent =
        "أدخل عنوان السيرفر أولاً";
      return;
    }

    const saved =
      saveCurrentSession();

    if (!saved) {
      statusElement.textContent =
        "أدخل Access Token و Refresh Token أولاً";
      return;
    }

    const token =
      await getValidAccessToken(
        serverUrl,
      );

    if (!token) {
      statusElement.textContent =
        "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى";
      clearSession();
      return;
    }

    tokenInput.value = token;

    socket.connect(
      serverUrl,
      token,
    );

    startRefreshTimer(
      serverUrl,
    );

    statusElement.textContent =
      "جاري الاتصال بالسيرفر...";
  },
);

logoutButton.addEventListener(
  "click",
  () => {
    socket.disconnect();

    if (stopRefreshTimer) {
      stopRefreshTimer();
      stopRefreshTimer = null;
    }

    clearSession();

    tokenInput.value = "";
    refreshTokenInput.value = "";

    statusElement.textContent =
      "تم تسجيل الخروج";
  },
);

uploadButton.addEventListener(
  "click",
  async () => {
    const serverUrl =
      serverUrlInput.value.trim();

    const file =
      imageInput.files?.[0];

    if (!serverUrl) {
      uploadStatus.textContent =
        "أدخل عنوان السيرفر أولاً";
      return;
    }

    if (!file) {
      uploadStatus.textContent =
        "اختر صورة أولاً";
      return;
    }

    const token =
      await getValidAccessToken(
        serverUrl,
      );

    if (!token) {
      uploadStatus.textContent =
        "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى";
      return;
    }

    tokenInput.value = token;

    const formData =
      new FormData();

    formData.append(
      "file",
      file,
    );

    try {
      uploadStatus.textContent =
        "جاري رفع الصورة...";

      let response =
        await fetch(
          `${serverUrl}/api/media/upload`,
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
            body: formData,
          },
        );

      if (response.status === 401) {
        const newToken =
          await getValidAccessToken(
            serverUrl,
          );

        if (!newToken) {
          clearSession();

          uploadStatus.textContent =
            "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى";

          return;
        }

        tokenInput.value =
          newToken;

        response =
          await fetch(
            `${serverUrl}/api/media/upload`,
            {
              method: "POST",
              headers: {
                Authorization:
                  `Bearer ${newToken}`,
              },
              body: formData,
            },
          );
      }

      const result =
        await response.json();

      if (response.ok) {
        uploadStatus.textContent =
          "تم رفع الصورة بنجاح!";

        console.log(result);
        return;
      }

      uploadStatus.textContent =
        `فشل الرفع: ${
          result.message ||
          result.error ||
          "رمز غير صالح"
        }`;
    } catch {
      uploadStatus.textContent =
        "حدث خطأ أثناء الاتصال بالخادم";
    }
  },
);
