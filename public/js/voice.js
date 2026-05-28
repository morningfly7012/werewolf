// 語音引導：使用瀏覽器內建 Web Speech API（zh-TW），免外部服務。
let enabled = true;
let preferredVoice = null;

function pickVoice() {
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  // 偏好繁體中文 / 中文語音
  preferredVoice =
    voices.find((v) => /zh[-_]TW/i.test(v.lang)) ||
    voices.find((v) => /zh[-_]HK/i.test(v.lang)) ||
    voices.find((v) => /^zh/i.test(v.lang)) ||
    voices.find((v) => /Chinese/i.test(v.name)) ||
    null;
}
if (window.speechSynthesis) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export function setVoiceEnabled(on) {
  enabled = on;
  if (!on && window.speechSynthesis) speechSynthesis.cancel();
}
export function isVoiceEnabled() {
  return enabled;
}

export function speak(text, { interrupt = true } = {}) {
  if (!enabled || !text || !window.speechSynthesis) return;
  try {
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    if (preferredVoice) u.voice = preferredVoice;
    u.rate = 0.95;
    u.pitch = 1.0;
    speechSynthesis.speak(u);
  } catch (e) {
    /* 忽略不支援語音的環境 */
  }
}

// 某些瀏覽器需要使用者互動後才能播放語音
export function warmup() {
  if (!window.speechSynthesis) return;
  try {
    const u = new SpeechSynthesisUtterance('');
    speechSynthesis.speak(u);
  } catch (e) {}
}
