/**
 * URL Shortener Web Application
 * Handles URL validation, OpenAPI integration (is.gd / v.gd / TinyURL),
 * Clipboard copying with alerts, and history tracking.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const shortenForm = document.getElementById('shortenForm');
  const urlInput = document.getElementById('urlInput');
  const btnClearInput = document.getElementById('btnClearInput');
  const btnShorten = document.getElementById('btnShorten');
  const inputMessage = document.getElementById('inputMessage');
  const btnReset = document.getElementById('btnReset');
  const logoBtn = document.getElementById('logoBtn');

  // Result Section Elements
  const resultSection = document.getElementById('resultSection');
  const resultBox = document.getElementById('resultBox');
  const btnCopy = document.getElementById('btnCopy');
  const originalUrlDisplay = document.getElementById('originalUrlDisplay');
  const savingsText = document.getElementById('savingsText');
  const btnOpenLink = document.getElementById('btnOpenLink');
  const btnMakeQR = document.getElementById('btnMakeQR');

  // History Elements
  const historySection = document.getElementById('historySection');
  const historyList = document.getElementById('historyList');
  const btnClearHistory = document.getElementById('btnClearHistory');

  // Toast Elements
  const toastPill = document.getElementById('toastPill');
  const toastText = document.getElementById('toastText');

  let toastTimer = null;
  const HISTORY_KEY = 'shortened_url_history';

  // ----------------------------------------------------
  // 3-2 Requirement: 입력 필드가 비어 있으면 '단축하기'버튼 비활성화
  // ----------------------------------------------------
  function updateButtonState() {
    const rawValue = urlInput.value.trim();
    if (rawValue.length > 0) {
      btnShorten.disabled = false;
      btnClearInput.style.display = 'flex';
    } else {
      btnShorten.disabled = true;
      btnClearInput.style.display = 'none';
    }
  }

  // 초기 상태 확인 (기본 disabled)
  updateButtonState();

  // 사용자 입력 시 실시간 체크
  urlInput.addEventListener('input', () => {
    updateButtonState();
    clearMessage();
  });

  // 입력 지우기 버튼 클릭
  btnClearInput.addEventListener('click', () => {
    urlInput.value = '';
    updateButtonState();
    clearMessage();
    urlInput.focus();
  });

  // 초기화 버튼
  btnReset.addEventListener('click', resetAll);
  logoBtn.addEventListener('click', resetAll);

  function resetAll() {
    urlInput.value = '';
    updateButtonState();
    clearMessage();
    resultSection.style.display = 'none';
    urlInput.focus();
  }

  // ----------------------------------------------------
  // 3-3 Requirement: '단축하기' 클릭 시 OpenAPI로 URL단축 요청 및 결과 표시
  // ----------------------------------------------------
  shortenForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!btnShorten.disabled) {
      handleShorten();
    }
  });

  async function handleShorten() {
    const rawVal = urlInput.value.trim();

    if (!rawVal) {
      showMessage('단축할 URL을 입력해 주세요.', 'error');
      btnShorten.disabled = true;
      urlInput.focus();
      return;
    }

    // URL 프로토콜 자동 보정 (예: naver.com -> https://naver.com)
    let targetUrl = rawVal;
    if (!/^[a-zA-Z]+:\/\//i.test(rawVal)) {
      targetUrl = 'https://' + rawVal;
    }

    // URL 유효성 검사
    try {
      new URL(targetUrl);
    } catch (_) {
      showMessage('올바른 URL 형식(예: https://example.com)을 입력해 주세요.', 'error');
      return;
    }

    // 로딩 상태 시작
    setLoading(true);
    clearMessage();

    try {
      // OpenAPI 호출 (다중 백엔드 지원: is.gd -> v.gd -> TinyURL)
      const shortUrl = await requestShortenAPI(targetUrl);

      // 응답 성공 시 UI 업데이트 (3-1 읽기 전용 상자에 표시)
      showResult(targetUrl, shortUrl);

      // 히스토리 저장
      saveHistory(targetUrl, shortUrl);

    } catch (err) {
      console.error('URL 단축 에러:', err);
      showMessage(err.message || 'URL 단축 요청 중 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
    } finally {
      setLoading(false);
    }
  }

  /**
   * OpenAPI URL 단축 요청 함수
   * 1차: is.gd OpenAPI (CORS 지원, 높은 안정성)
   * 2차 fallback: v.gd OpenAPI (CORS 지원)
   * 3차 fallback: TinyURL via CORS Proxy
   */
  async function requestShortenAPI(longUrl) {
    // 1차 시도: is.gd
    try {
      const isGdUrl = `https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`;
      const res = await fetch(isGdUrl, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data.shorturl) {
          return data.shorturl;
        }
        if (data.errormessage) {
          throw new Error(data.errormessage);
        }
      }
    } catch (e) {
      console.warn('is.gd 호출 실패, v.gd로 대체 시도:', e);
    }

    // 2차 시도: v.gd
    try {
      const vGdUrl = `https://v.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`;
      const res = await fetch(vGdUrl, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data.shorturl) {
          return data.shorturl;
        }
      }
    } catch (e) {
      console.warn('v.gd 호출 실패, TinyURL 프록시 대체 시도:', e);
    }

    // 3차 시도: TinyURL with AllOrigins Proxy
    try {
      const tinyApi = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`;
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(tinyApi)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const text = (await res.text()).trim();
        if (text.startsWith('http://') || text.startsWith('https://')) {
          return text;
        }
      }
    } catch (e) {
      console.warn('TinyURL 프록시 호출 실패:', e);
    }

    throw new Error('단축 OpenAPI 서버와의 통신에 실패했습니다. 네트워크 상태를 확인해 주세요.');
  }

  function setLoading(isLoading) {
    if (isLoading) {
      btnShorten.classList.add('is-loading');
      btnShorten.disabled = true;
    } else {
      btnShorten.classList.remove('is-loading');
      updateButtonState();
    }
  }

  // 3-1, 3-3: 결과 화면 및 읽기 전용 상자에 결과 표시
  function showResult(originalUrl, shortUrl) {
    originalUrlDisplay.textContent = originalUrl;
    resultBox.value = shortUrl; // 3-1 읽기 전용 출력 상자에 값 전달

    // 절약률 계산
    const origLen = originalUrl.length;
    const shortLen = shortUrl.length;
    if (origLen > shortLen) {
      const pct = Math.round(((origLen - shortLen) / origLen) * 100);
      savingsText.textContent = `길이 ${pct}% (${origLen - shortLen}자) 단축 완료!`;
    } else {
      savingsText.textContent = `단축 완료! (${shortLen}자)`;
    }

    // 빠른 액션 버튼 링크 연결
    btnOpenLink.href = shortUrl;
    btnMakeQR.href = `../url2qr/index.html?url=${encodeURIComponent(shortUrl)}`;

    resultSection.style.display = 'block';

    // 부드럽게 결과 카드로 스크롤 이동
    setTimeout(() => {
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }

  // 읽기 전용 상자 클릭 시 전체 선택 편의 기능
  resultBox.addEventListener('click', () => {
    resultBox.select();
  });

  // ----------------------------------------------------
  // 3-4 Requirement: '복사'버튼을 클릭하면 자동으로 복사하고 '복사하였습니다.'알림창이 나타나게 해 줘
  // ----------------------------------------------------
  btnCopy.addEventListener('click', async () => {
    const textToCopy = resultBox.value;
    if (!textToCopy) return;

    let success = false;
    // 1) Clipboard API 시도
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        success = true;
      } catch (err) {
        console.warn('Clipboard writeText 실패, fallback 시도', err);
      }
    }

    // 2) Fallback: execCommand('copy')
    if (!success) {
      try {
        resultBox.select();
        resultBox.setSelectionRange(0, 99999);
        document.execCommand('copy');
        success = true;
      } catch (err) {
        console.error('execCommand copy 실패', err);
      }
    }

    // 버튼 피드백 애니메이션
    const copyTextSpan = btnCopy.querySelector('.copy-text');
    const originalText = copyTextSpan.textContent;
    btnCopy.classList.add('copied');
    copyTextSpan.textContent = '복사 완료!';

    setTimeout(() => {
      btnCopy.classList.remove('copied');
      copyTextSpan.textContent = originalText;
    }, 2000);

    // 토스트 팝업 띄우기
    showToast('복사하였습니다.');

    // 3-4 Requirement: '복사하였습니다.' 알림창(alert) 호출
    // setTimeout을 주어 브라우저 렌더링 후 알림창이 확실하게 표시되도록 함
    setTimeout(() => {
      alert('복사하였습니다.');
    }, 50);
  });

  // 토스트 메시지 함수
  function showToast(message) {
    if (!toastPill) return;
    toastText.textContent = message;
    toastPill.classList.add('show');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastPill.classList.remove('show');
    }, 2500);
  }

  function showMessage(msg, type = 'info') {
    inputMessage.textContent = msg;
    inputMessage.className = `input-message ${type}`;
  }

  function clearMessage() {
    inputMessage.textContent = '';
    inputMessage.className = 'input-message';
  }

  // ----------------------------------------------------
  // 최근 단축 내역 (History) 관리
  // ----------------------------------------------------
  function loadHistory() {
    try {
      const data = localStorage.getItem(HISTORY_KEY);
      if (!data) return;
      const list = JSON.parse(data);
      if (Array.isArray(list) && list.length > 0) {
        renderHistory(list);
      }
    } catch (e) {
      console.warn('History load failed', e);
    }
  }

  function saveHistory(originalUrl, shortUrl) {
    try {
      let list = [];
      const data = localStorage.getItem(HISTORY_KEY);
      if (data) {
        list = JSON.parse(data) || [];
      }
      // 중복 방지
      list = list.filter(item => item.shortUrl !== shortUrl);
      list.unshift({
        originalUrl,
        shortUrl,
        timestamp: Date.now()
      });
      // 최대 5개 유지
      list = list.slice(0, 5);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
      renderHistory(list);
    } catch (e) {
      console.warn('History save failed', e);
    }
  }

  function renderHistory(list) {
    if (!list || list.length === 0) {
      historySection.style.display = 'none';
      return;
    }

    historyList.innerHTML = '';
    list.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <div class="history-urls">
          <a href="${item.shortUrl}" target="_blank" rel="noopener noreferrer" class="history-short">${item.shortUrl}</a>
          <span class="history-original" title="${item.originalUrl}">${item.originalUrl}</span>
        </div>
        <button type="button" class="btn-history-copy">복사</button>
      `;

      div.querySelector('.btn-history-copy').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(item.shortUrl);
        } catch (_) {
          const temp = document.createElement('textarea');
          temp.value = item.shortUrl;
          document.body.appendChild(temp);
          temp.select();
          document.execCommand('copy');
          document.body.removeChild(temp);
        }
        showToast('복사하였습니다.');
        setTimeout(() => {
          alert('복사하였습니다.');
        }, 50);
      });

      historyList.appendChild(div);
    });

    historySection.style.display = 'block';
  }

  btnClearHistory.addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    historyList.innerHTML = '';
    historySection.style.display = 'none';
  });

  // 초기 히스토리 로드
  loadHistory();

  // ----------------------------------------------------
  // 인터랙티브 배경 마우스 트래킹 효과
  // ----------------------------------------------------
  const root = document.documentElement;
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight * 0.4;
  let currentX = targetX;
  let currentY = targetY;

  window.addEventListener('mousemove', (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
  }, { passive: true });

  function updateGradientFrame() {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;

    const width = window.innerWidth || 1920;
    const height = window.innerHeight || 1080;

    const normX = ((currentX / width) - 0.5) * 2;
    const normY = ((currentY / height) - 0.5) * 2;

    const percentX = (currentX / width * 100).toFixed(2);
    const percentY = (currentY / height * 100).toFixed(2);

    const hue1 = 44 + (normX * 12) + (normY * 5);
    const hue2 = 28 + (normY * 12) - (normX * 8);
    const hue3 = 50 - (normX * 10);

    const color1 = `hsla(${hue1.toFixed(1)}, 95%, 68%, 0.65)`;
    const color2 = `hsla(${hue2.toFixed(1)}, 92%, 76%, 0.48)`;
    const color3 = `hsla(${hue3.toFixed(1)}, 96%, 82%, 0.68)`;
    const cursorGlowColor = `hsla(${(hue1 + 4).toFixed(1)}, 98%, 62%, 0.38)`;

    root.style.setProperty('--mouse-x', `${percentX}%`);
    root.style.setProperty('--mouse-y', `${percentY}%`);
    root.style.setProperty('--cursor-x', `${currentX.toFixed(1)}px`);
    root.style.setProperty('--cursor-y', `${currentY.toFixed(1)}px`);
    root.style.setProperty('--grad-c1', color1);
    root.style.setProperty('--grad-c2', color2);
    root.style.setProperty('--grad-c3', color3);
    root.style.setProperty('--cursor-color', cursorGlowColor);

    requestAnimationFrame(updateGradientFrame);
  }

  requestAnimationFrame(updateGradientFrame);
});
