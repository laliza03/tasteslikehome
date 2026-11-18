// Apply the shared-link language or the visitor's saved preference before rendering.
(() => {
  const supported = ['fr', 'en', 'ar'];
  const requested = new URLSearchParams(location.search).get('lang');
  let saved;
  try { saved = localStorage.getItem('tasteslikehome-language'); } catch {}
  const preferred = (navigator.languages || [navigator.language || 'en'])
    .map(language => language.split('-')[0]).find(language => supported.includes(language));
  const language = supported.includes(requested) ? requested : supported.includes(saved) ? saved : preferred || 'en';
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
})();
