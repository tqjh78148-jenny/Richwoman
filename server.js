const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;
const STOCKS = [
  '2330', '2454', '2317', '3017', '2383', '2382', '6669', '3661',
  '3231', '2345', '2603', '3443', '2308', '3037', '2408', '2356'
];
const chList = STOCKS.map(s => 'tse_' + s + '.tw').join('|');
const twseUrl = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=' + encodeURIComponent(chList) + '&json=1&delay=0';

let cachedQuotes = null;
let lastFetchTime = 0;

function fetchTWSE(callback) {
  const now = Date.now();
  // 快取 2 秒避免被證交所防爬蟲鎖 IP
  if (cachedQuotes && now - lastFetchTime < 2000) {
    return callback(null, cachedQuotes);
  }

  https.get(twseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(raw);
        cachedQuotes = json;
        lastFetchTime = Date.now();
        callback(null, json);
      } catch (e) {
        callback(e);
      }
    });
  }).on('error', (err) => callback(err));
}

const server = http.createServer((req, res) => {
  // 開放 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

  // 即時 API 路由：提供 16 檔台股真實撮合五檔與現價
  if (parsedUrl.pathname === '/api/quotes') {
    fetchTWSE((err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
      }
    });
    return;
  }

  // 靜態網頁託管
  let reqPath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
  let filePath = path.join(__dirname, reqPath);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain; charset=utf-8' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log('================================================================');
  console.log(`🚀 台灣證券交易所 (TWSE) 即時行情即時伺服器已啟動！`);
  console.log(`🌐 本機看盤網址: http://localhost:${PORT}`);
  console.log(`📡 每 2~3 秒自動從 TWSE 抓取 16 檔權值股最新真實成交價與五檔盤口`);
  console.log('================================================================');

  // 自動在 Windows 預設瀏覽器中開啟
  if (process.platform === 'win32') {
    exec(`start http://localhost:${PORT}`);
  }
});
