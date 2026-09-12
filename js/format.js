// Number formatting helpers for the UI.
(function (root) {
  'use strict';

  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  function trim(n) {
    if (n < 10) return n.toFixed(2);
    if (n < 100) return n.toFixed(1);
    return n.toFixed(0);
  }

  function fmt(n) {
    if (!isFinite(n)) return '∞';
    const neg = n < 0 ? '-' : '';
    n = Math.abs(n);
    if (n < 999.5) return neg + trim(n);
    let i = 0;
    while (n >= 999.5 && i < SUFFIXES.length - 1) { n /= 1000; i++; }
    return neg + trim(n) + SUFFIXES[i];
  }

  function fmtInt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 1000) return Math.floor(n).toString();
    return fmt(n);
  }

  // Whole socks show as integers; fractional click yields keep one or two decimals.
  function fmtSocks(n) {
    if (!isFinite(n)) return '∞';
    if (n < 1000 && !Number.isInteger(n)) return trim(n).replace(/\.?0+$/, '');
    return fmtInt(n);
  }

  function money(n) {
    if (!isFinite(n)) return '$∞';
    if (n < 100) return '$' + n.toFixed(2);
    if (n < 1000) return '$' + Math.floor(n);
    return '$' + fmt(n);
  }

  function fmtTime(seconds) {
    seconds = Math.floor(seconds);
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function pct(n) {
    return Math.round(n * 100) + '%';
  }

  const api = { fmt, fmtInt, fmtSocks, money, fmtTime, pct };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Fmt = api;
})(this);
