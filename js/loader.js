// loader.js — loading screen

function renderLoader() {
  return '<div class="loader-wrap">'
    + '<div class="loader-spinner"></div>'
    + '<div class="loader-phrases">'
    + '<div class="ld-phrase" style="animation-delay:0s">Loading roadmap data\u2026</div>'
    + '<div class="ld-phrase" style="animation-delay:3s">Crunching the numbers\u2026</div>'
    + '<div class="ld-phrase" style="animation-delay:6s">Almost there\u2026</div>'
    + '</div>'
    + '</div>';
}
