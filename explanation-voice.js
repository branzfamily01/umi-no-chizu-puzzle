(() => {
  'use strict';

  const STORAGE_KEY = 'umi-no-chizu-puzzle-v2';
  const $ = (s, r = document) => r.querySelector(s);
  const clean = text => String(text || '').replace(/\s+/g, ' ').replace(/。+/g, '。').trim();
  const stripEnd = text => clean(text).replace(/[。．.!！?？]+$/g, '');

  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').settings || {};
    } catch {
      return {};
    }
  }

  function voiceEnabled() {
    return getSettings().voice !== false;
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

  function spokenExplanation(item, { placement = false } = {}) {
    if (!item) return '';
    const facts = (item.facts || []).filter(Boolean).map(stripEnd).slice(0, 3);
    const history = stripEnd(item.history || '');
    const exam = stripEnd((item.exam || [])[0] || '');
    const parts = [];

    parts.push(`${item.name}について、いっしょに覚えよう。読み方は、${item.kana}だよ`);
    if (facts[0]) parts.push(`まず、いちばん大事なのは、${facts[0]}ということ`);
    if (facts[1]) parts.push(`それから、${facts[1]}`);
    if (facts[2]) parts.push(`もうひとつ、${facts[2]}`);
    if (history) parts.push(`ちなみに、歴史や背景では、${history}`);
    if (exam) parts.push(`入試では、${exam}、という形で聞かれることがあるよ`);
    parts.push(placement ? 'じゃあ、今の説明を思い出しながら、地図のどこにあるか置いてみよう' : '名前だけじゃなく、場所といっしょに覚えると強いよ');
    return parts.join('。') + '。';
  }

  function spokenReadClues(item) {
    const clues = [...document.querySelectorAll('#readClues .clue')]
      .map(el => clean(el.textContent).replace(/^ヒント\d+\s*/, ''))
      .filter(Boolean);
    if (!clues.length) return '';
    const parts = ['ヒントを聞いて、どの地形か考えてみよう'];
    clues.forEach((clue, i) => parts.push(`${i + 1}つ目のヒントは、${stripEnd(clue)}`));
    parts.push('さて、どれかな');
    return parts.join('。') + '。';
  }

  function cloneUtterance(source, text) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = source.lang || 'ja-JP';
    u.rate = Math.min(source.rate || 0.88, 0.86);
    u.pitch = source.pitch || 1.05;
    u.volume = source.volume ?? Math.max(0.15, Number(getSettings().volume ?? 0.7));
    if (source.voice) u.voice = source.voice;
    return u;
  }

  let nativeSpeak = null;
  function installSpeechInterceptor() {
    if (!('speechSynthesis' in window) || window.__umiExplanationInterceptor) return;
    window.__umiExplanationInterceptor = true;
    nativeSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);

    window.speechSynthesis.speak = function(utterance) {
      try {
        if (!voiceEnabled() || !utterance) return nativeSpeak(utterance);
        const item = currentItem();
        if (!item) return nativeSpeak(utterance);
        const text = clean(utterance.text);
        const mode = currentMode();

        // 正解直後の短い名前読みはテンポを守るため、そのまま。
        if (text === item.kana && isSuccessShowing()) return nativeSpeak(utterance);

        // マスターテストは解説を出さず、場所を自力で思い出す。
        if (mode === 'マスターテスト') return nativeSpeak(utterance);

        // 通常の「答えだけ読み上げ」を、話し言葉の解説に置き換える。
        if (text === item.kana) {
          return nativeSpeak(cloneUtterance(utterance, spokenExplanation(item)));
        }

        // よみとくで正解後、「地図に置いて」に移るときは解説も一緒に読む。
        const compact = text.replace(/\s+/g, '');
        if (mode === 'よみとく' && compact === `${item.kana}を地図においてください`) {
          return nativeSpeak(cloneUtterance(utterance, spokenExplanation(item, { placement: true })));
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
    const settings = getSettings();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 0.84;
    u.pitch = 1.04;
    u.volume = Math.max(0.15, Number(settings.volume ?? 0.7));
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
      button.textContent = '🔊 話し言葉で解説';
      button.setAttribute('aria-label', '覚えるポイント、歴史、入試での問われ方を話し言葉で読み上げる');
      button.addEventListener('click', () => {
        const item = currentItem();
        if (item) speakDirect(spokenExplanation(item, { placement: currentMode() === 'よみとく' }));
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
        const item = currentItem();
        const text = spokenReadClues(item);
        if (text) speakDirect(text);
      });
      readHead.appendChild(button);
    }
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
      @media (max-width:520px){.knowledge-title .explanation-speak-button{width:100%;margin-left:0;text-align:center;padding:10px 12px}.read-head .clue-speak-button{margin-left:0}}
    `;
    document.head.appendChild(style);
  }

  function init() {
    installSpeechInterceptor();
    injectStyles();
    injectButtons();

    // 以前の「解説自動読み上げ」個別設定は廃止し、通常の読み上げON/OFFに統一。
    localStorage.removeItem('umi-no-chizu-explanation-auto-v1');
    $('#explanationVoiceToggle')?.closest('.setting-row')?.remove();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
