(() => {
  'use strict';

  const STORAGE_KEY = 'umi-no-chizu-puzzle-v2';
  const AUTO_KEY = 'umi-no-chizu-explanation-auto-v1';
  const $ = (s, r = document) => r.querySelector(s);

  function getAppSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').settings || {};
    } catch {
      return {};
    }
  }

  function voiceEnabled() {
    const settings = getAppSettings();
    return settings.voice !== false;
  }

  function autoEnabled() {
    return localStorage.getItem(AUTO_KEY) !== '0';
  }

  function setAutoEnabled(value) {
    localStorage.setItem(AUTO_KEY, value ? '1' : '0');
  }

  function clean(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/。+/g, '。')
      .trim();
  }

  function explanationText() {
    const name = clean($('#promptName')?.textContent);
    const kana = clean($('#promptKana')?.textContent);
    const facts = [...document.querySelectorAll('#factList li')]
      .map(li => clean(li.textContent))
      .filter(Boolean);
    const historyVisible = $('#historyBox') && !$('#historyBox').hidden;
    const history = historyVisible ? clean($('#historyText')?.textContent) : '';
    const exam = clean($('#examText')?.textContent);

    const parts = [];
    if (name) parts.push(`${name}。${kana ? `読み方は、${kana}。` : ''}`);
    if (facts.length) parts.push(`覚えるポイント。${facts.join('。')}。`);
    if (history) parts.push(`歴史や背景。${history}。`);
    if (exam) parts.push(`入試での典型的な問われ方。${exam}。`);
    return clean(parts.join(' '));
  }

  function speakExplanation({ auto = false } = {}) {
    if (!voiceEnabled() || !('speechSynthesis' in window)) return;
    if (auto && !autoEnabled()) return;

    const text = explanationText();
    if (!text) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const settings = getAppSettings();
    utterance.lang = 'ja-JP';
    utterance.rate = 0.84;
    utterance.pitch = 1.04;
    utterance.volume = Math.max(0.15, Number(settings.volume ?? 0.7));

    const voices = window.speechSynthesis.getVoices();
    const ja = voices.find(v => /^ja/i.test(v.lang));
    if (ja) utterance.voice = ja;

    const button = $('#explanationSpeakBtn');
    if (button) {
      button.classList.add('is-speaking');
      button.textContent = '⏹ 読み上げ中';
    }
    const restore = () => {
      if (button) {
        button.classList.remove('is-speaking');
        button.textContent = '🔊 解説をきく';
      }
    };
    utterance.onend = restore;
    utterance.onerror = restore;
    window.speechSynthesis.speak(utterance);
  }

  function stopExplanation() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const button = $('#explanationSpeakBtn');
    if (button) {
      button.classList.remove('is-speaking');
      button.textContent = '🔊 解説をきく';
    }
  }

  function injectButton() {
    const title = $('.knowledge-title');
    if (!title || $('#explanationSpeakBtn')) return;
    const button = document.createElement('button');
    button.id = 'explanationSpeakBtn';
    button.className = 'explanation-speak-button';
    button.type = 'button';
    button.textContent = '🔊 解説をきく';
    button.setAttribute('aria-label', '覚えるポイント、歴史、入試での問われ方を読み上げる');
    button.addEventListener('click', () => {
      if (button.classList.contains('is-speaking')) stopExplanation();
      else speakExplanation();
    });
    title.appendChild(button);
  }

  function injectSettings() {
    const voiceToggle = $('#voiceToggle')?.closest('.setting-row');
    if (!voiceToggle || $('#explanationVoiceToggle')) return;
    const row = document.createElement('label');
    row.className = 'setting-row';
    row.innerHTML = '<span>📚 解説も自動読み上げ</span><input type="checkbox" id="explanationVoiceToggle">';
    voiceToggle.insertAdjacentElement('afterend', row);
    const toggle = $('#explanationVoiceToggle');
    toggle.checked = autoEnabled();
    toggle.addEventListener('change', e => setAutoEnabled(e.target.checked));
  }

  function injectStyles() {
    if ($('#explanationVoiceStyle')) return;
    const style = document.createElement('style');
    style.id = 'explanationVoiceStyle';
    style.textContent = `
      .knowledge-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .explanation-speak-button{margin-left:auto;border:0;border-radius:999px;padding:8px 12px;background:linear-gradient(180deg,#ffffff,#e9fbff);box-shadow:0 4px 12px rgba(41,130,160,.16);font:inherit;font-weight:800;color:#24697f;cursor:pointer;touch-action:manipulation}
      .explanation-speak-button.is-speaking{background:linear-gradient(180deg,#fff6cf,#ffe29a);color:#7d5c16}
      @media (max-width:520px){.explanation-speak-button{width:100%;margin-left:0;text-align:center;padding:10px 12px}}
    `;
    document.head.appendChild(style);
  }

  let autoTimer = null;
  function scheduleAutoForLearn() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      const mode = clean($('#gameModeLabel')?.textContent);
      const cardVisible = $('#knowledgeCard') && getComputedStyle($('#knowledgeCard')).display !== 'none';
      if (mode === 'おぼえる' && cardVisible) speakExplanation({ auto: true });
    }, 650);
  }

  function scheduleAutoForReadReveal() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      const mode = clean($('#gameModeLabel')?.textContent);
      const cardVisible = $('#knowledgeCard') && getComputedStyle($('#knowledgeCard')).display !== 'none';
      const readHidden = $('#readPanel')?.hidden === true;
      if (mode === 'よみとく' && cardVisible && readHidden) speakExplanation({ auto: true });
    }, 1050);
  }

  function observeKnowledge() {
    const factList = $('#factList');
    if (factList) {
      new MutationObserver(() => {
        stopExplanation();
        scheduleAutoForLearn();
      }).observe(factList, { childList: true, subtree: true, characterData: true });
    }

    const knowledgeCard = $('#knowledgeCard');
    if (knowledgeCard) {
      new MutationObserver(() => {
        if (getComputedStyle(knowledgeCard).display !== 'none') scheduleAutoForReadReveal();
      }).observe(knowledgeCard, { attributes: true, attributeFilter: ['style', 'hidden', 'class'] });
    }
  }

  function init() {
    injectStyles();
    injectButton();
    injectSettings();
    observeKnowledge();
    scheduleAutoForLearn();

    document.querySelectorAll('[data-back], #skipBtn, #againBtn, #homeBtnFromResult').forEach(el => {
      el.addEventListener('click', stopExplanation, { capture: true });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
