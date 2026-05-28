// 後端位址管理：遊玩模式需要 Socket.IO 後端。
// 在本機（npm start）時後端就是同源，base 留空即可。
// 部署在 GitHub Pages 等靜態託管時，需指定外部後端網址：
//   - 透過網址參數 ?server=https://your-backend  （會記住）
//   - 或在「需要後端」畫面輸入後端網址
export function getBackend() {
  const fromQuery = new URLSearchParams(location.search).get('server');
  if (fromQuery) {
    localStorage.setItem('ww_backend', fromQuery.replace(/\/$/, ''));
    return fromQuery.replace(/\/$/, '');
  }
  return (localStorage.getItem('ww_backend') || '').replace(/\/$/, '');
}

export function setBackend(url) {
  if (url) localStorage.setItem('ww_backend', url.replace(/\/$/, ''));
  else localStorage.removeItem('ww_backend');
}

// 判斷是否「可能沒有同源後端」（靜態託管，例如 *.github.io）
export function looksStaticHost() {
  return /github\.io$/.test(location.hostname) || location.protocol === 'file:';
}

// 動態載入 socket.io client，回傳 window.io
export function loadSocketIO(base) {
  return new Promise((resolve, reject) => {
    if (window.io) return resolve(window.io);
    const s = document.createElement('script');
    s.src = (base || '') + '/socket.io/socket.io.js';
    s.onload = () => (window.io ? resolve(window.io) : reject(new Error('socket.io 載入失敗')));
    s.onerror = () => reject(new Error('無法連線到後端伺服器'));
    document.head.appendChild(s);
    setTimeout(() => { if (!window.io) reject(new Error('連線逾時')); }, 8000);
  });
}
