const LEVEL_ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  none: 99,
};

function normalizeLevel(value) {
  const candidate = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVEL_ORDER, candidate) ? candidate : null;
}

function getDefaultLevel() {
  return import.meta.env.PROD ? 'error' : 'debug';
}

const CURRENT_LEVEL = normalizeLevel(import.meta.env.VITE_LOG_LEVEL) || getDefaultLevel();

function isEnabled(level) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[CURRENT_LEVEL];
}

export const logger = {
  level: CURRENT_LEVEL,
  isEnabled,
  debug(...args) {
    if (isEnabled('debug')) console.debug(...args);
  },
  info(...args) {
    if (isEnabled('info')) console.info(...args);
  },
  warn(...args) {
    if (isEnabled('warn')) console.warn(...args);
  },
  error(...args) {
    if (isEnabled('error')) console.error(...args);
  },
};
