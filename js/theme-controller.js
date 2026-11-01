// Custom theme selector and theme persistence.

(() => {
  const picker = document.getElementById('themePickerWrap');
  const trigger = document.getElementById('themePickerTrigger');
  const currentLabel = document.getElementById('themePickerCurrent');
  const menu = document.getElementById('themePickerMenu');

  if (!picker || !trigger || !currentLabel || !menu) return;

  const validThemes = new Map([
    ['dark', 'Dark'],
    ['light', 'Light'],
    ['neon', 'Neon'],
    ['clear', 'Clear'],
    ['granite', 'Granite'],
    ['sunset', 'Sunset'],
    ['waterfall', 'Waterfall'],
  ]);
  const options = [...menu.querySelectorAll('[data-theme-value]')];

  function setMenuOpen(open) {
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    picker.classList.toggle('is-open', open);
    if (open) {
      const selected = options.find(option => option.getAttribute('aria-selected') === 'true') || options[0];
      selected?.focus();
    }
  }

  function applyTheme(name) {
    const theme = validThemes.has(name) ? name : 'dark';
    document.body.dataset.theme = theme;
    currentLabel.textContent = window.t ? window.t(theme, validThemes.get(theme)) : validThemes.get(theme);

    options.forEach(option => {
      const selected = option.dataset.themeValue === theme;
      option.setAttribute('aria-selected', String(selected));
      option.tabIndex = selected ? 0 : -1;
      option.classList.toggle('is-selected', selected);
    });

    try {
      localStorage.setItem('royalReelsTheme', theme);
    } catch (_error) {
      // Theme selection still works when storage is unavailable.
    }

    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  }

  let savedTheme = 'dark';
  try {
    savedTheme = localStorage.getItem('royalReelsTheme') || 'dark';
  } catch (_error) {
    // Use the default theme when storage is unavailable.
  }
  applyTheme(savedTheme);

  trigger.addEventListener('click', () => {
    setMenuOpen(menu.hidden);
  });

  options.forEach((option, index) => {
    option.addEventListener('click', () => {
      applyTheme(option.dataset.themeValue);
      setMenuOpen(false);
      trigger.focus();
    });

    option.addEventListener('keydown', event => {
      let nextIndex = index;
      if (event.key === 'ArrowDown') nextIndex = (index + 1) % options.length;
      else if (event.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = options.length - 1;
      else if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        trigger.focus();
        return;
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        option.click();
        return;
      } else {
        return;
      }
      event.preventDefault();
      options[nextIndex].focus();
    });
  });

  document.addEventListener('pointerdown', event => {
    if (!picker.contains(event.target)) setMenuOpen(false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      setMenuOpen(false);
      trigger.focus();
    }
  });
})();
