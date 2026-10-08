const dialog = document.querySelector('#contact-dialog');
const form = document.querySelector('#contact-form');
const status = document.querySelector('#form-status');
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');
const submit = form.querySelector('.form-submit');
form.after(status);
status.setAttribute('tabindex', '-1');
let mode = 'order';
let sending = false;
let sent = false;
let verificationToken = '';
let widgetId;
let verificationLoading = false;

function loadVerification() {
  if (widgetId !== undefined) return;
  if (window.turnstile) {
    widgetId = window.turnstile.render('#contact-verification', {
      sitekey: '0x4AAAAAAFRXQ7Z4w-19_u5S',
      action: 'meipeanut_contact',
      size: 'flexible',
      callback: (token) => {
        verificationToken = token;
        submit.disabled = sending || sent;
      },
      'expired-callback': resetVerification,
      'error-callback': () => {
        if (sent) return;
        resetVerification();
        status.textContent = '安全驗證無法載入，請重新開啟視窗，或直接電話／Email 聯絡店家。';
      },
    });
    return;
  }
  if (verificationLoading) return;
  verificationLoading = true;
  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.onload = () => {
    verificationLoading = false;
    loadVerification();
  };
  script.onerror = () => {
    verificationLoading = false;
    status.textContent = '安全驗證無法載入，請重新開啟視窗，或直接聯絡店家。';
  };
  document.head.append(script);
}

function resetVerification() {
  verificationToken = '';
  submit.disabled = true;
}

function setMode(nextMode) {
  if (sending || sent) return;
  form.style.display = '';
  dialog.querySelector('.dialog-tabs').style.display = '';
  dialog.querySelector('.dialog-intro').hidden = false;
  dialog.querySelector('#dialog-title').textContent = '寫一封小小的訊息';
  submit.disabled = !verificationToken;
  mode = nextMode;
  dialog.querySelectorAll('.dialog-tab').forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
  const ordering = mode === 'order';
  const quantity = form.elements.quantity;
  const date = form.elements.date;
  form.querySelector('.order-field').hidden = !ordering;
  form.querySelector('.reading-field').hidden = ordering;
  quantity.disabled = !ordering;
  quantity.required = ordering;
  date.disabled = ordering;
  status.textContent = '';
}

document.querySelectorAll('[data-open-contact]').forEach((button) => {
  button.addEventListener('click', () => {
    if (sending) return;
    setMode(button.dataset.openContact);
    nav.classList.remove('is-open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', '開啟選單');
    dialog.showModal();
    loadVerification();
  });
});

dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.querySelectorAll('.dialog-tab').forEach((tab) => {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
});
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

menu.addEventListener('click', () => {
  const open = nav.classList.toggle('is-open');
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
});
nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('is-open');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', '開啟選單');
}));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sending || sent || !form.reportValidity()) return;
  if (!verificationToken) {
    status.textContent = '請先完成安全驗證。';
    return;
  }
  const data = new FormData(form);
  const payload = {
    site: 'meipeanut',
    mode,
    name: String(data.get('name') || '').trim(),
    phone: String(data.get('phone') || '').trim(),
    email: String(data.get('email') || '').trim(),
    message: String(data.get('message') || '').trim(),
    quantity: mode === 'order' ? Number(data.get('quantity')) : null,
    date: String(data.get('date') || ''),
    turnstileToken: verificationToken,
  };
  sending = true;
  submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  dialog.querySelectorAll('.dialog-tab').forEach((tab) => { tab.disabled = true; });
  status.textContent = '正在送出需求，請勿重複提交……';
  try {
    const response = await fetch('https://client-to-store-mail.kmbt1og.workers.dev/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok || result.accepted !== true) throw new Error(result.error || '送出失敗，請直接聯絡店家確認。');
    sent = true;
    submit.hidden = true;
    form.style.display = 'none';
    dialog.querySelector('.dialog-tabs').style.display = 'none';
    dialog.querySelector('.dialog-intro').hidden = true;
    dialog.querySelector('#dialog-title').textContent = '信件已送出';
    const emailNotice = !payload.email ? '' : result.customerEmailSent === true
      ? '收件通知已交由郵件服務寄送至您的 Email，寄件地址為 no-reply@omegaai.cc。若未收到，請檢查「垃圾郵件」資料夾。'
      : '您的 Email 通知未能確認寄出，但店家通知已送出，請勿重複提交。';
    status.textContent = `需求已交由郵件服務寄送給陳女士，請勿重複提交。${emailNotice}仍需店家回覆確認，尚非正式成立的訂單或預約。`;
    form.reset();
    status.focus();
  } catch (error) {
    status.textContent = error instanceof TypeError || error.name === 'TimeoutError' || error instanceof SyntaxError
      ? '無法確認寄送結果，請勿立即重送；請電話或 Email 聯絡店家確認。'
      : error.message;
  } finally {
    sending = false;
    form.removeAttribute('aria-busy');
    dialog.querySelectorAll('.dialog-tab').forEach((tab) => { tab.disabled = false; });
    resetVerification();
    if (widgetId !== undefined && !sent) window.turnstile.reset(widgetId);
  }
});
