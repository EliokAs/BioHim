// ═══════════════════════════════════════════════
// lazylibs.js — ленивая загрузка тяжёлых библиотек
//
// Вместо загрузки ~800 КБ при каждом старте,
// библиотеки подгружаются только когда реально нужны.
//
// Использование:
//   await LazyLibs.chartjs();    → гарантирует window.Chart
//   await LazyLibs.pdf();        → гарантирует window.jspdf + window.html2canvas
//   await LazyLibs.mammoth();    → гарантирует window.mammoth
// ═══════════════════════════════════════════════

const LazyLibs = (() => {

  // Кэш промисов — каждая библиотека грузится строго один раз
  const _cache = {};

  /**
   * Загружает внешний скрипт и возвращает промис.
   * Повторные вызовы с тем же src сразу резолвятся из кэша.
   */
  function _load(src) {
    if (_cache[src]) return _cache[src];

    _cache[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload  = resolve;
      s.onerror = () => reject(new Error('LazyLibs: не удалось загрузить ' + src));
      document.head.appendChild(s);
    });

    return _cache[src];
  }

  // ── Публичное API ──────────────────────────────────────────────

  return {

    /**
     * Chart.js 4 — используется в:
     *   drawProgressChart()          (страница ученика / прогресс)
     *   renderAnalytics()            (страница аналитики — 3 графика)
     *   _renderAnalyticsTopicChart() (аналитика — темы)
     */
    chartjs() {
      if (typeof window.Chart !== 'undefined') return Promise.resolve();
      return _load('https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js');
    },

    /**
     * jsPDF + html2canvas — используются вместе только при экспорте PDF.
     * html2canvas (~280 КБ) + jsPDF (~280 КБ) = ~560 КБ суммарно.
     */
    pdf() {
      const needCanvas = typeof window.html2canvas === 'undefined';
      const needJspdf  = typeof window.jspdf       === 'undefined';

      if (!needCanvas && !needJspdf) return Promise.resolve();

      const tasks = [];
      if (needCanvas) tasks.push(_load(
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
      ));
      if (needJspdf) tasks.push(_load(
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
      ));

      return Promise.all(tasks);
    },

    /**
     * mammoth.js (~220 КБ) — используется только при импорте .docx файла
     * в конструкторе тестов/ДЗ (extractTextFromDocx).
     */
    mammoth() {
      if (typeof window.mammoth !== 'undefined') return Promise.resolve();
      return _load(
        'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
      );
    },

    /**
     * docx.js (~500 КБ) — используется при экспорте тестов/ДЗ/пробников в Word.
     * Версия 7.8.2 — стабильный UMD-бандл с поддержкой браузера.
     */
    docx() {
      if (typeof window.docx !== 'undefined') return Promise.resolve();
      return _load(
        'https://cdnjs.cloudflare.com/ajax/libs/docx/7.8.2/docx.js'
      );
    },

  };

})();

// ── Экспортируем глобально ──
window.LazyLibs = LazyLibs;
