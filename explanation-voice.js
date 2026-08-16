(() => {
  'use strict';

  const STORAGE_KEY = 'umi-no-chizu-puzzle-v2';
  const DEFAULT_RATE = 1.15;
  const $ = (s, r = document) => r.querySelector(s);
  const clean = text => String(text || '').replace(/\s+/g, ' ').replace(/。+/g, '。').trim();
  const stripEnd = text => clean(text).replace(/[。．.!！?？]+$/g, '');

  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  function getSettings() {
    return readStore().settings || {};
  }

  function setSetting(key, value) {
    const store = readStore();
    store.settings = Object.assign({}, store.settings || {}, { [key]: value });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function voiceEnabled() {
    return getSettings().voice !== false;
  }

  function speechRate() {
    const value = Number(getSettings().speechRate ?? DEFAULT_RATE);
    return Math.max(0.75, Math.min(1.65, Number.isFinite(value) ? value : DEFAULT_RATE));
  }

  function currentItem() {
    const name = clean($('#promptName')?.textContent);
    const data = window.GEO_DATA;
    if (!name || !data) return null;
    return [...(data.mountains || []), ...(data.rivers || [])].find(item => item.name === name) || null;
  }

  function currentMode() {
    return clean($('#gameModeLabel')?.textContent);
  }

  function isSuccessShowing() {
    return !!$('#overlaySvg .success-path');
  }

  function normalizeForCompare(text) {
    return stripEnd(text)
      .replace(/[、,\s]/g, '')
      .replace(/この地形|この川|この山地|この山脈/g, '')
      .toLowerCase();
  }

  const GENERIC_PATTERNS = [
    /名前.*場所.*覚/,
    /場所.*名前.*覚/,
    /地図.*位置.*覚/,
    /位置.*地図.*覚/,
    /位置から特定/,
    /位置で特定/,
    /地図上.*特定/,
    /位置関係.*覚/,
    /白地図.*覚/
  ];

  function isGeneric(text) {
    const t = stripEnd(text);
    return !t || GENERIC_PATTERNS.some(re => re.test(t));
  }

  function uniqueUseful(list) {
    const seen = new Set();
    return (list || []).filter(Boolean).map(stripEnd).filter(text => {
      if (isGeneric(text)) return false;
      const key = normalizeForCompare(text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function overlaps(a, b) {
    const x = normalizeForCompare(a), y = normalizeForCompare(b);
    if (!x || !y) return false;
    return x.includes(y) || y.includes(x);
  }

  function spokenExplanation(item) {
    if (!item) return '';
    const facts = uniqueUseful(item.facts).slice(0, 3);
    const history = isGeneric(item.history || '') ? '' : stripEnd(item.history || '');
    let exam = isGeneric((item.exam || [])[0] || '') ? '' : stripEnd((item.exam || [])[0] || '');

    // 同じ内容を「特徴」と「出題」で二度読まない。
    if (exam && facts.some(f => overlaps(f, exam))) exam = '';

    const parts = [item.name];
    parts.push(...facts);
    if (history && !facts.some(f => overlaps(f, history))) parts.push(history);
    if (exam) parts.push(`出題ポイント。${exam}`);
    return parts.filter(Boolean).map(stripEnd).join('。') + '。';
  }

  function spokenReadClues() {
    const clues = [...document.querySelectorAll('#readClues .clue')]
      .map(el => clean(el.textContent).replace(/^ヒント\d+\s*/, ''))
      .filter(Boolean)
      .map(stripEnd);
    if (!clues.length) return '';
    return clues.map((clue, i) => `ヒント${i + 1}。${clue}`).join('。') + '。';
  }

  function applyVoiceSettings(utterance) {
    const settings = getSettings();
    utterance.lang = utterance.lang || 'ja-JP';
    utterance.rate = speechRate();
    utterance.volume = Math.max(0.15, Number(settings.volume ?? 0.7));
    return utterance;
  }

  function cloneUtterance(source, text) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = source.lang || 'ja-JP';
    u.pitch = source.pitch || 1.05;
    u.volume = source.volume ?? Math.max(0.15, Number(getSettings().volume ?? 0.7));
    if (source.voice) u.voice = source.voice;
    return applyVoiceSettings(u);
  }

  let nativeSpeak = null;
  function installSpeechInterceptor() {
    if (!('speechSynthesis' in window) || window.__umiExplanationInterceptor) return;
    window.__umiExplanationInterceptor = true;
    nativeSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);

    window.speechSynthesis.speak = function(utterance) {
      try {
        if (!utterance) return nativeSpeak(utterance);
        applyVoiceSettings(utterance);
        if (!voiceEnabled()) return nativeSpeak(utterance);

        const item = currentItem();
        if (!item) return nativeSpeak(utterance);
        const text = clean(utterance.text);
        const mode = currentMode();

        // 正解直後の短い名前読みはテンポを優先。
        if (text === item.kana && isSuccessShowing()) return nativeSpeak(utterance);

        // マスターテストでは余計な解説を読まない。
        if (mode === 'マスターテスト') return nativeSpeak(utterance);

        // 通常の名前読みを、短い要点解説に置き換える。
        if (text === item.kana) {
          return nativeSpeak(cloneUtterance(utterance, spokenExplanation(item)));
        }

        // よみとくで正解後は、要点だけ読んでから配置へ。
        const compact = text.replace(/\s+/g, '');
        if (mode === 'よみとく' && compact === `${item.kana}を地図においてください`) {
          const explanation = spokenExplanation(item);
          const finalText = explanation ? `${explanation}地図に置いてください。` : `${item.kana}を地図に置いてください。`;
          return nativeSpeak(cloneUtterance(utterance, finalText));
        }

        return nativeSpeak(utterance);
      } catch {
        return nativeSpeak(utterance);
      }
    };
  }

  function speakDirect(text) {
    if (!voiceEnabled() || !('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = applyVoiceSettings(new SpeechSynthesisUtterance(text));
    u.lang = 'ja-JP';
    u.pitch = 1.02;
    const ja = window.speechSynthesis.getVoices().find(v => /^ja/i.test(v.lang));
    if (ja) u.voice = ja;
    (nativeSpeak || window.speechSynthesis.speak.bind(window.speechSynthesis))(u);
  }

  function injectButtons() {
    const title = $('.knowledge-title');
    if (title && !$('#explanationSpeakBtn')) {
      const button = document.createElement('button');
      button.id = 'explanationSpeakBtn';
      button.className = 'explanation-speak-button';
      button.type = 'button';
      button.textContent = '🔊 解説をきく';
      button.setAttribute('aria-label', '重要ポイントを読み上げる');
      button.addEventListener('click', () => {
        const item = currentItem();
        if (item) speakDirect(spokenExplanation(item));
      });
      title.appendChild(button);
    }

    const readHead = $('.read-head');
    if (readHead && !$('#readClueSpeakBtn')) {
      const button = document.createElement('button');
      button.id = 'readClueSpeakBtn';
      button.className = 'explanation-speak-button clue-speak-button';
      button.type = 'button';
      button.textContent = '🔊 ヒントをきく';
      button.addEventListener('click', () => {
        const text = spokenReadClues();
        if (text) speakDirect(text);
      });
      readHead.appendChild(button);
    }
  }

  function injectSpeedControl() {
    if ($('#speechRateRange')) return;
    const volume = $('#volumeRange')?.closest('.setting-column');
    if (!volume) return;

    const row = document.createElement('label');
    row.className = 'setting-column speech-rate-setting';
    row.innerHTML = `
      <span class="speech-rate-head"><span>🗣️ 読み上げ速度</span><b id="speechRateValue">${speechRate().toFixed(2)}×</b></span>
      <input type="range" id="speechRateRange" min="0.75" max="1.65" step="0.05" value="${speechRate()}">
      <small class="speech-rate-scale"><span>ゆっくり</span><span>標準 1.00×</span><span>速い</span></small>
    `;
    volume.insertAdjacentElement('afterend', row);

    const range = $('#speechRateRange');
    const value = $('#speechRateValue');
    range.addEventListener('input', e => {
      const rate = Number(e.target.value);
      value.textContent = `${rate.toFixed(2)}×`;
      setSetting('speechRate', rate);
    });
    range.addEventListener('change', () => speakDirect('読み上げ速度を変更しました。'));
  }

  function injectStyles() {
    if ($('#explanationVoiceStyle')) return;
    const style = document.createElement('style');
    style.id = 'explanationVoiceStyle';
    style.textContent = `
      .knowledge-title,.read-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .explanation-speak-button{margin-left:auto;border:0;border-radius:999px;padding:9px 13px;background:linear-gradient(180deg,#fff,#e8fbff);box-shadow:0 4px 12px rgba(41,130,160,.16);font:inherit;font-weight:800;color:#24697f;cursor:pointer;touch-action:manipulation}
      .explanation-speak-button:active{transform:translateY(1px)}
      .clue-speak-button{background:linear-gradient(180deg,#fffaf0,#fff0c9);color:#7a5b18}
      .speech-rate-head,.speech-rate-scale{display:flex;justify-content:space-between;gap:10px;align-items:center;width:100%}
      .speech-rate-head b{color:#24697f;font-variant-numeric:tabular-nums}
      .speech-rate-scale{font-size:11px;opacity:.62;margin-top:2px}
      .speech-rate-setting input[type="range"]{width:100%}
      @media (max-width:520px){.knowledge-title .explanation-speak-button{width:100%;margin-left:0;text-align:center;padding:10px 12px}.read-head .clue-speak-button{margin-left:0}}
    `;
    document.head.appendChild(style);
  }

  function init() {
    installSpeechInterceptor();
    injectStyles();
    injectButtons();
    injectSpeedControl();
    localStorage.removeItem('umi-no-chizu-explanation-auto-v1');
    $('#explanationVoiceToggle')?.closest('.setting-row')?.remove();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
