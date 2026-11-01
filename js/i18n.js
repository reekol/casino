// UI translations are fetched only when selected. Requests deliberately bypass browser caches.
(() => {
  const picker = document.getElementById('languagePickerWrap');
  const trigger = document.getElementById('languagePickerTrigger');
  const currentLabel = document.getElementById('languagePickerCurrent');
  const menu = document.getElementById('languagePickerMenu');
  const localeFiles = { en: './locales/ui_en.json', fr: './locales/ui_fr.json', ru: './locales/ui_ru.json', bg: './locales/ui_bg.json' };
  const languageNames = { en: 'English', fr: 'Français', ru: 'Русский', bg: 'Български' };
  const options = menu ? [...menu.querySelectorAll('[data-language-value]')] : [];
  let currentMessages = {};

  function translate(key, fallback = '') {
    return Object.prototype.hasOwnProperty.call(currentMessages, key) ? currentMessages[key] : fallback;
  }

  function setMenuOpen(open, focusOption = false) {
    if (!picker || !trigger || !menu) return;
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    picker.classList.toggle('is-open', open);
    if (open && focusOption) {
      (options.find(option => option.getAttribute('aria-selected') === 'true') || options[0])?.focus();
    }
  }

  function updatePicker(language) {
    if (!picker || !trigger || !currentLabel || !menu) return;
    currentLabel.textContent = translate(`language_${({ en: 'english', fr: 'french', ru: 'russian', bg: 'bulgarian' })[language] || 'english'}`, languageNames[language] || 'English');
    options.forEach(option => {
      const selected = option.dataset.languageValue === language;
      option.setAttribute('aria-selected', String(selected));
      option.tabIndex = selected ? 0 : -1;
      option.classList.toggle('is-selected', selected);
    });
  }

  function applyTranslations(messages, language) {
    currentMessages = messages;
    document.documentElement.lang = language;
    document.title = translate('royal_reels_casino_lobby', document.title);

    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const value = translate(key, element.textContent);
      if (element.tagName === 'TITLE') document.title = value;
      else element.textContent = value;
    });

    ['aria-label', 'title', 'placeholder'].forEach(attribute => {
      document.querySelectorAll(`[data-i18n-${attribute}]`).forEach(element => {
        const key = element.getAttribute(`data-i18n-${attribute}`);
        const value = translate(key, '');
        if (value) element.setAttribute(attribute, value);
      });
    });

    document.querySelectorAll('[data-i18n]').forEach(element => {
      if (element.tagName !== 'OPTION') element.setAttribute('data-i18n-applied', language);
    });
    updatePicker(language);
  }

  async function loadLanguage(language) {
    const code = localeFiles[language] ? language : 'en';
    const response = await fetch(localeFiles[code], { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to load locale ${code} (${response.status})`);
    const messages = await response.json();
    if (!messages || typeof messages !== 'object' || Array.isArray(messages)) {
      throw new Error(`Locale ${code} has an invalid JSON structure`);
    }
    applyTranslations(messages, code);
    window.currentLanguage = code;
    document.dispatchEvent(new CustomEvent('royalreels:languagechange', { detail: { language: code } }));
    return messages;
  }

  window.t = translate;
  window.loadLanguage = loadLanguage;
  window.i18nReady = loadLanguage('en').catch(error => {
    console.error('Unable to initialize translations:', error);
    updatePicker('en');
    return {};
  });


  function syncFrameLanguage(frame) {
    const language = window.currentLanguage || 'en';
    try {
      // The iframe initializes its first locale from rr_lang in its URL.
      // Do not echo that same locale back as a message: it can race the
      // iframe's own DOMContentLoaded initialization and cause a second fetch.
      const frameUrl = new URL(frame.src, document.baseURI);
      if (frameUrl.origin === location.origin && frameUrl.searchParams.get('rr_lang') === language) {
        return;
      }
      frame.contentWindow?.postMessage({ type: 'royalreels:set-language', language }, '*');
    } catch (error) {
      console.warn('Unable to sync iframe language:', error);
    }
  }

  function syncAllFrames() {
    document.querySelectorAll('iframe').forEach(syncFrameLanguage);
  }

  document.addEventListener('royalreels:languagechange', syncAllFrames);
  const frameObserver = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === 'IFRAME') {
        node.addEventListener('load', () => syncFrameLanguage(node));
      }
      node.querySelectorAll?.('iframe').forEach(frame => {
        frame.addEventListener('load', () => syncFrameLanguage(frame));
      });
    }));
  });
  frameObserver.observe(document.documentElement, { childList: true, subtree: true });

  trigger?.addEventListener('click', () => setMenuOpen(menu.hidden, menu.hidden));
  options.forEach((option, index) => {
    option.addEventListener('click', async () => {
      const language = option.dataset.languageValue;
      options.forEach(item => { item.disabled = true; });
      try {
        await loadLanguage(language);
        setMenuOpen(false);
        trigger?.focus();
      } catch (error) {
        console.error('Unable to change language:', error);
        updatePicker(window.currentLanguage || 'en');
      } finally {
        options.forEach(item => { item.disabled = false; });
      }
    });
    option.addEventListener('keydown', event => {
      let nextIndex = index;
      if (event.key === 'ArrowDown') nextIndex = (index + 1) % options.length;
      else if (event.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = options.length - 1;
      else if (event.key === 'Escape') {
        event.preventDefault(); setMenuOpen(false); trigger?.focus(); return;
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); option.click(); return;
      } else return;
      event.preventDefault(); options[nextIndex].focus();
    });
  });
  document.addEventListener('pointerdown', event => {
    if (picker && !picker.contains(event.target)) setMenuOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu && !menu.hidden) {
      setMenuOpen(false); trigger?.focus();
    }
  });
})();
