const express = require('express');
const jwt = require("jsonwebtoken");
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

const SECRET = "0x4AAAAAABs22k14XcjDyB0xrkvKpfZG8ec";

function getClientIPs(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  let ip = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
  ip = ip ? ip.split(',')[0] : req.socket.remoteAddress;

  let ipv4 = null;
  let ipv6 = null;

  if (ip) {
    if (ip.startsWith('::ffff:')) {
      ipv4 = ip.replace('::ffff:', '');
    } else if (ip.includes(':')) {
      ipv6 = ip;
    } else {
      ipv4 = ip;
    }
  }

  return { ipv4, ipv6 };
}

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/api/ip', (req, res) => {
  const { ipv4, ipv6 } = getClientIPs(req);
  res.json({ ipv4, ipv6 });
});

// Genera token captcha
// Genera token captcha con delay aleatorio 5-10s
app.post("/captcha/generate", (req, res) => {
  const payload = {
    ip: req.ip,
    ua: req.headers["user-agent"],
    ts: Date.now(),
  };

  const token = jwt.sign(payload, SECRET, { expiresIn: "60s" }); // válido 60 seg

  const delay = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000;

  setTimeout(() => {
    let score = 0.9;
    if (!req.headers["user-agent"] || !req.headers["user-agent"].includes("Mozilla")) {
    }

    res.json({ token, score });
  }, delay);
});

// Verificación
app.post("/verify", (req, res) => {
  const token = req.body.captcha_token;

  try {
    const decoded = jwt.verify(token, SECRET);
    // Aquí podrías meter lógica de "score" (simple heurística, UA raro, ip sospechosa...)
    res.cookie("antiddos_ok", "1", { httpOnly: true, secure: false, maxAge: 3600 * 1000 });
    return res.redirect("/");
  } catch (err) {
    return res.status(403).send("❌ Captcha inválido o expirado.");
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
