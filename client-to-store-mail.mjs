const sites = {
  meipeanut: {
    origin: 'https://omegatw.github.io',
    hostname: 'omegatw.github.io',
    action: 'meipeanut_contact',
    secret: 'TURNSTILE_SECRET_MEIPEANUT',
    recipient: 'chen0909570015@gmail.com',
    sender: 'no-reply@omegaai.cc',
  },
};

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty body');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      await reader.cancel();
      throw new Error('Body too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function validData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const limits = { name: 50, phone: 30, email: 100, message: 500, date: 10, turnstileToken: 2048 };
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof data[key] !== 'string' || data[key].length > limit) return false;
  }
  if (!data.name.trim() || /[\r\n\x00-\x1f\x7f]/.test(data.name) || !/^[+\d().\s-]{5,30}$/.test(data.phone) || !data.turnstileToken) return false;
  if (data.email && !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(data.email)) return false;
  if (data.mode === 'order') return Number.isInteger(data.quantity) && data.quantity >= 1 && data.quantity <= 999;
  if (data.mode !== 'reading') return false;
  if (!data.date) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(data.date) && Number.isFinite(Date.parse(data.date)) && new Date(data.date).toISOString().slice(0, 10) === data.date;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowedOrigin = Object.values(sites).some((site) => site.origin === origin);
    const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (allowedOrigin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type';
    }
    const respond = (body, status = 200) => Response.json(body, { status, headers });
    if (new URL(request.url).pathname !== '/contact') return respond({ error: 'Not found' }, 404);
    if (!allowedOrigin) return respond({ error: '不允許的網站來源。' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return respond({ error: '只接受 POST。' }, 405);
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return respond({ error: '資料格式錯誤。' }, 415);

    let data;
    try {
      data = await readBody(request);
    } catch {
      return respond({ error: '資料過大或格式錯誤。' }, 400);
    }
    const site = data && Object.hasOwn(sites, data.site) ? sites[data.site] : null;
    if (!site || site.origin !== origin || !validData(data)) return respond({ error: '請檢查表單欄位。' }, 400);
    if (!env.EMAIL || !env.MAIL_IP_LIMITER || !env.MAIL_SITE_LIMITER || !env[site.secret]) return respond({ error: '服務尚未設定完成，請直接聯絡店家。' }, 503);
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) return respond({ error: '無法驗證連線來源。' }, 403);

    const requestId = crypto.randomUUID();
    const version = 'mail-diagnostics-20261009';
    let stage = 'ip-limit';
    try {
      console.log('Contact processing started', { requestId, version, site: data.site });
      const ipLimit = await env.MAIL_IP_LIMITER.limit({ key: `${data.site}:${ip}` });
      if (!ipLimit.success) return respond({ error: '送出過於頻繁，請稍候一分鐘。' }, 429);
      stage = 'turnstile';
      const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: env[site.secret], response: data.turnstileToken, remoteip: ip }),
        signal: AbortSignal.timeout(10000),
      });
      if (!verification.ok) throw new Error('Verification unavailable');
      const result = await verification.json();
      if (!result.success || result.hostname !== site.hostname || result.action !== site.action) return respond({ error: '安全驗證失敗或已過期，請重新驗證。' }, 403);
      stage = 'site-limit';
      const siteLimit = await env.MAIL_SITE_LIMITER.limit({ key: data.site });
      if (!siteLimit.success) return respond({ error: '目前詢問較多，請稍候一分鐘。' }, 429);
      const ordering = data.mode === 'order';
      const details = ordering
        ? `預計訂購：${data.quantity} 袋（每袋 NT$200，運費與實際金額由店家確認）`
        : `希望預約日期：${data.date || '尚未指定'}（時段與費用由店家確認）`;
      stage = 'store-email';
      console.log('Store email sending', { requestId, version, recipient: site.recipient, sender: site.sender });
      const storeResult = await env.EMAIL.send({
        from: { email: site.sender, name: '溪美手作｜網站通知' },
        to: site.recipient,
        ...(data.email ? { replyTo: data.email } : {}),
        subject: ordering ? '溪美手作｜花生糖訂購需求' : '溪美手作｜風谷占卜預約需求',
        text: [
          '收到一份網站需求，請與顧客聯繫確認。', '',
          `稱呼：${data.name.trim()}`, `聯絡電話：${data.phone.trim()}`,
          `電子郵件：${data.email || '未提供'}`, details,
          `備註：${data.message.trim() || '無'}`, '',
          '此訊息為需求詢問，尚非已確認訂單或預約。',
        ].join('\n'),
      });
      const storeMessageId = storeResult?.messageId ?? null;
      console.log('Store email accepted', {
        requestId, version, recipient: site.recipient, messageId: storeMessageId,
      });
      let customerEmailSent = false;
      let customerMessageId = null;

      if (data.email) {
        try {
          console.log('Customer email sending', { requestId, version });
          const customerResult = await env.EMAIL.send({
            from: {
              email: site.sender,
              name: '溪美手作｜收件通知',
            },
            to: data.email,
            replyTo: site.recipient,
            subject: ordering
              ? '溪美手作｜已收到您的花生糖訂購需求'
              : '溪美手作｜已收到您的占卜預約需求',
            text: [
              '您好，您的需求已送出，並已交由郵件服務通知店家。',
              '',
              details,
              '',
              '此信僅為需求收件通知，尚非正式成立的訂單或預約。',
              '實際數量、運費、金額或預約時段，仍需店家與您聯繫確認。',
              '目前無需付款，請勿重複提交。',
              '',
              '如需詢問進度，請回覆此信或致電：0909-570-015。',
              '若您未提交需求，請忽略此信；您的 Email 可能由他人誤填。',
            ].join('\n'),
          });
          customerMessageId = customerResult?.messageId ?? null;
          console.log('Customer email accepted', {
            requestId, version, messageId: customerMessageId,
          });
          customerEmailSent = true;
        } catch (error) {
          console.error('Customer receipt email failed', {
            requestId, version, code: error?.code ?? 'UNKNOWN',
          });
        }
      }

      return respond({
        accepted: true,
        customerEmailSent,
        requestId,
        version,
        storeMessageId,
        customerMessageId,
      });
    } catch (error) {
      console.error('Contact processing failed', {
        requestId, version, stage, code: error?.code ?? 'UNKNOWN',
      });
      return respond({ error: '暫時無法確認寄送結果，請勿立即重送；請直接聯絡店家確認。', requestId, version }, 502);
    }
  },
};
