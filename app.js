const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
