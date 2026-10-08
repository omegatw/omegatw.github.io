const dialog = document.querySelector('#contact-dialog');
const form = document.querySelector('#contact-form');
const status = document.querySelector('#form-status');
const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');
let mode = 'order';

function setMode(nextMode) {
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
    setMode(button.dataset.openContact);
    nav.classList.remove('is-open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', '開啟選單');
    dialog.showModal();
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

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const name = String(data.get('name')).trim();
  const phone = String(data.get('phone')).trim();
  const email = String(data.get('email')).trim();
  const message = String(data.get('message')).trim();
  if (!name || !phone) return;

  const subject = mode === 'order' ? `花生糖訂購詢問｜${name}` : `風谷占卜預約詢問｜${name}`;
  const details = mode === 'order'
    ? `預計訂購：${data.get('quantity')} 包（每包 NT$200，實際運費與金額由店家確認）`
    : `希望預約日期：${data.get('date') || '尚未指定'}（實際時段與費用由店家確認）`;
  const body = [
    `您好，我想${mode === 'order' ? '詢問花生糖訂購' : '詢問風谷占卜預約'}。`,
    '',
    `稱呼：${name}`,
    `聯絡電話：${phone}`,
    `電子郵件：${email || '未提供'}`,
    details,
    `備註：${message || '無'}`,
    '',
    '此訊息為需求詢問，尚待店家回覆確認。',
  ].join('\n');
  status.textContent = '已開啟電子郵件程式，請在郵件程式中確認並按「寄出」。若沒有開啟，請直接聯繫下方電話或 LINE。';
  window.location.href = `mailto:chen0909570015@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
