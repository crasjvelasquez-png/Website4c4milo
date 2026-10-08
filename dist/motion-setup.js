// Start one short page fade before CSS parses. Content stays visible if this
// script or the application module fails, and reduced-motion users skip it.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('entrance-fade-ready');
}
