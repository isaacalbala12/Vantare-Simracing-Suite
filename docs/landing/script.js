/**
 * Vantare Overlays — Landing Page Script
 * Minimal smooth-scroll + navigation interactions.
 */

(function () {
  'use strict';

  // --- Smooth scroll for nav links ---
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId === '#') return;

      var target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();

      var navHeight = 72;
      var targetPos = target.getBoundingClientRect().top + window.pageYOffset - navHeight;

      window.scrollTo({
        top: targetPos,
        behavior: 'smooth',
      });
    });
  });

  // --- Nav background opacity on scroll ---
  var nav = document.querySelector('.nav');
  if (nav) {
    var checkScroll = function () {
      if (window.scrollY > 50) {
        nav.style.background = 'rgba(7, 7, 13, 0.95)';
      } else {
        nav.style.background = 'rgba(7, 7, 13, 0.85)';
      }
    };

    window.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
  }
})();
