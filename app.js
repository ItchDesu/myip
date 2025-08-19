const express = require('express');
const jwt = require("jsonwebtoken");
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const ipaddr = require('ipaddr.js');

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

// Usa la IP más a la izquierda de la cadena de proxies
function getClientIPs(req) {
  // req.ip ya respeta X-Forwarded-For cuando trust proxy = true
  const candidate = (req.ips && req.ips.length ? req.ips[0] : req.ip) || req.socket.remoteAddress || '';
  let ipv4 = null, ipv6 = null;
  if (candidate.startsWith('::ffff:')) ipv4 = candidate.slice(7);
  else if (candidate.includes(':')) ipv6 = candidate;
  else ipv4 = candidate;
  return { ipv4, ipv6 };
}

async function getGeoLocation(ip) {
  try {
    const addr = ipaddr.parse(ip);
    const isV4 = addr.kind() === 'ipv4';
    const dir = path.join(__dirname, 'registry', 'data', isV4 ? 'inetnum' : 'inet6num');

    const files = await fs.promises.readdir(dir);

    // 1) Encuentra todos los ficheros que cubren la IP y elige el más específico
    let best = null; // { file, cidr, plen }
    for (const rawName of files) {
      const file = rawName.trim();
      const [start, prefix] = file.split('_');
      if (!start || !prefix) continue;
      const cidr = `${start}/${prefix}`;
      let parsed;
      try { parsed = ipaddr.parseCIDR(cidr); } catch { continue; }
      if (!addr.match(parsed)) continue;

      const plen = parsed[1];
      if (!best || plen > best.plen) best = { file, cidr, plen };
    }

    if (!best) return null;

    // 2) Lee el registro ganador y saca el geofeed
    const content = await fs.promises.readFile(path.join(dir, best.file), 'utf8');
    const m = content.match(/geofeed:\s*(\S+)/i);
    if (!m) return null;
    const url = m[1];

    // 3) Descarga y busca la línea del geofeed que cubre la IP (también el match más específico)
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) return null;

    let text = await resp.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // quita BOM

    let bestFeed = null; // { cols, plen }
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const cols = line.split(',').map(s => s.trim());
      const prefixLine = cols[0];
      if (!prefixLine) continue;

      let parsed;
      try { parsed = ipaddr.parseCIDR(prefixLine); } catch { continue; }
      if (!addr.match(parsed)) continue;

      const plen = parsed[1];
      if (!bestFeed || plen > bestFeed.plen) bestFeed = { cols, plen };
    }

    if (!bestFeed) return null;

    // RFC 8805: country, region, city, postal…
    const parts = bestFeed.cols.slice(1).filter(Boolean);
    return parts.join(', ') || null;

  } catch (err) {
    console.error('Geo lookup error', err);
    return null;
  }
}

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/api/ip', async (req, res) => {
  const ips = getClientIPs(req);
  const ipv4Location = ips.ipv4 ? await getGeoLocation(ips.ipv4) : null;
  const ipv6Location = ips.ipv6 ? await getGeoLocation(ips.ipv6) : null;
  res.json({ ...ips, ipv4Location, ipv6Location });
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
