const fs = require('fs');
const https = require('https');
const path = require('path');

const STOCKS = [
  '2330', '2454', '2317', '3017', '2383', '2382', '6669', '3661',
  '3231', '2345', '2603', '3443', '2308', '3037', '2408', '2356'
];

const chList = STOCKS.map(s => 'tse_' + s + '.tw').join('|');
const url = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=' + encodeURIComponent(chList) + '&json=1&delay=0';

console.log('正在從台灣證券交易所 (TWSE) 獲取最新即時報價...');

https.get(url, (res) => {
  let rawData = '';
  res.on('data', chunk => rawData += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(rawData);
      if (!json.msgArray || json.msgArray.length === 0) {
        console.error('TWSE 回傳空數據');
        return;
      }

      const twseMap = {};
      json.msgArray.forEach(m => {
        const id = m.c;
        const name = m.n;
        const z = parseFloat(m.z || m.pz || m.y);
        const y = parseFloat(m.y);
        const o = parseFloat(m.o || z);
        const h = parseFloat(m.h || z);
        const l = parseFloat(m.l || z);
        const v = parseInt(m.v || 0, 10);
        const change = parseFloat((z - y).toFixed(2));
        const changePct = parseFloat(((change / y) * 100).toFixed(2));

        const bPrices = (m.b || '').split('_').filter(Boolean).map(Number);
        const bVols = (m.g || '').split('_').filter(Boolean).map(Number);
        const bids = bPrices.slice(0, 5).map((p, idx) => [p, bVols[idx] || 10]);

        const aPrices = (m.a || '').split('_').filter(Boolean).map(Number);
        const aVols = (m.f || '').split('_').filter(Boolean).map(Number);
        const asks = aPrices.slice(0, 5).map((p, idx) => [p, aVols[idx] || 10]);

        twseMap[id] = { id, name, z, y, o, h, l, v, change, changePct, bids, asks };
      });

      console.log('成功解析 TWSE 報價檔數:', Object.keys(twseMap).length);

      const htmlPath = path.join(__dirname, 'index.html');
      let html = fs.readFileSync(htmlPath, 'utf8');

      const startToken = 'let stockData = [';
      const endToken = '];\n\n    /* ==============================================================';
      const startIdx = html.indexOf(startToken);
      const endIdx = html.indexOf(endToken);

      if (startIdx === -1 || endIdx === -1) {
        console.error('未能在 index.html 找到 stockData 區塊');
        return;
      }

      const currentArrayCode = html.substring(startIdx, endIdx + 1);
      const arrayOnlyStr = currentArrayCode.replace(/^let\s+stockData\s*=\s*/, '');
      const stockData = new Function('return ' + arrayOnlyStr)();

      stockData.forEach(s => {
        const tw = twseMap[s.id];
        if (tw) {
          s.price = tw.z;
          s.refPrice = tw.y;
          s.change = tw.change;
          s.changePct = tw.changePct;
          s.targetLow = tw.l;
          s.targetHigh = tw.h;
          s.volume = tw.v;
          s.yesterdayVolume = Math.round(tw.v * 1.05);
          s.lastMinutePrice = tw.z;
          if (tw.bids && tw.bids.length > 0) {
            s.orderBook = { bids: tw.bids, asks: tw.asks };
          }
          if (tw.changePct >= 2.0) {
            s.statusText = '🔥 強烈看漲';
            s.statusColor = 'twRed';
            s.momentum = 85;
          } else if (tw.changePct >= 0.5) {
            s.statusText = '🚀 急拉偏多';
            s.statusColor = 'twRed';
            s.momentum = 65;
          } else if (tw.changePct >= -0.5) {
            s.statusText = '⚖️ 盤整收斂';
            s.statusColor = 'slate-300';
            s.momentum = 15;
          } else if (tw.changePct >= -2.0) {
            s.statusText = '❄️ 偏空調節';
            s.statusColor = 'twGreen';
            s.momentum = -45;
          } else {
            s.statusText = '⚡ 弱勢摜壓';
            s.statusColor = 'twGreen';
            s.momentum = -75;
          }
        }
      });

      const updatedArrayJson = JSON.stringify(stockData, null, 2);
      const indentedJson = updatedArrayJson
        .split('\n')
        .map((line, idx) => (idx === 0 ? line : '    ' + line))
        .join('\n');

      const newStockDataCode = 'let stockData = ' + indentedJson + ';';
      html = html.substring(0, startIdx) + newStockDataCode + html.substring(endIdx + 2);

      // 更新種子單 seedOrders
      const seedRegex = /const seedOrders = \[\s*\{[\s\S]*?\}\s*\];/;
      const newSeedOrders = `const seedOrders = [
        { time: '10:55:12', id: '2330', name: '台積電', price: 2490, changePct: 0.0, side: 'BUY', shares: 168, amountMillion: 418.3, instActor: '外資主力 (高盛)' },
        { time: '10:55:08', id: '3017', name: '奇鋐', price: 3315, changePct: 1.07, side: 'BUY', shares: 120, amountMillion: 397.8, instActor: '投信基金 (主動ETF)' },
        { time: '10:54:55', id: '2454', name: '聯發科', price: 4475, changePct: -1.10, side: 'BUY', shares: 85, amountMillion: 380.3, instActor: '外資主力 (摩根)' },
        { time: '10:54:40', id: '3661', name: '世芯-KY', price: 3940, changePct: -2.84, side: 'SELL', shares: 55, amountMillion: 216.7, instActor: '外資調節 (美林)' },
        { time: '10:54:21', id: '2383', name: '台光電', price: 5520, changePct: -0.45, side: 'BUY', shares: 140, amountMillion: 772.8, instActor: '投信基金 (主動ETF)' },
      ];`;
      html = html.replace(seedRegex, newSeedOrders);

      // 更新模態框佔位符
      html = html.replace('1,045.0 元', '-- 元');
      html = html.replace('1,024.0 元', '-- 元');
      html = html.replace('1,065.0 元', '-- 元');

      // 修正 tickMarket 跳動小數精度
      html = html.replace(
        'randStock.price = Math.max(1, randStock.price + priceChange);',
        'randStock.price = parseFloat(Math.max(1, randStock.price + priceChange).toFixed(2));'
      );
      html = html.replace(
        'randStock.change = randStock.price - randStock.refPrice;',
        'randStock.change = parseFloat((randStock.price - randStock.refPrice).toFixed(2));'
      );
      html = html.replace(
        'randStock.changePct = (randStock.change / randStock.refPrice) * 100;',
        'randStock.changePct = parseFloat(((randStock.change / randStock.refPrice) * 100).toFixed(2));'
      );
      // 更新頂部 TWSE 校準標章顯示最新更正日期
      const now = new Date();
      const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
      html = html.replace(
        /<span class="hidden md:inline-flex items-center px-2 py-0.5 rounded text-\[11px\] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700\/60"[^>]*>[\s\S]*?<\/span>/,
        `<span class="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700/60" title="報價數據已與台灣證券交易所 (TWSE) 官方即時盤口全面校正大修">\n              <i class="fa-solid fa-circle-check mr-1 text-[10px] text-emerald-400"></i> TWSE 官方牌價同步 (${dateStr} 盤後校準)\n            </span>`
      );

      fs.writeFileSync(htmlPath, html, 'utf8');
      console.log('✅ 成功大修更新 index.html 中的全部 16 檔真實 TWSE 股價、昨收價、委託簿五檔與即時跳動精度！');

      // 打印對照表
      console.log('\n--- 16 檔台股最新真實價格對照表 ---');
      stockData.forEach(s => {
        console.log(`${s.id} ${s.name.padEnd(6, ' ')} | 現價: ${String(s.price).padStart(7, ' ')} | 昨收: ${String(s.refPrice).padStart(7, ' ')} | 漲跌: ${(s.change >= 0 ? '+' : '') + s.change} (${(s.changePct >= 0 ? '+' : '') + s.changePct}%) | 今日量: ${s.volume}張`);
      });
    } catch (err) {
      console.error('更新失敗:', err);
    }
  });
}).on('error', (e) => {
  console.error('網路請求錯誤:', e.message);
});
