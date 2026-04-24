import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let cachedLocalEnv = null;

function parseDotEnv(content) {
  const map = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function loadLocalEnv() {
  if (cachedLocalEnv) return cachedLocalEnv;

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(moduleDir, '..');
  const candidates = [];

  const pushEnvCandidates = (dirPath) => {
    candidates.push(path.join(dirPath, '.env.development.local'));
    candidates.push(path.join(dirPath, '.env.local'));
    candidates.push(path.join(dirPath, '.env'));
  };

  const walkUpDirs = (startDir) => {
    let current = path.resolve(startDir);
    while (true) {
      pushEnvCandidates(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  };

  walkUpDirs(repoRoot);
  walkUpDirs(process.cwd());

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      cachedLocalEnv = parseDotEnv(content);
      return cachedLocalEnv;
    } catch {
      // Ignore local env parsing errors and keep process.env fallback only.
    }
  }

  cachedLocalEnv = {};
  return cachedLocalEnv;
}

export function getEnvVar(key, fallback = '') {
  const fromProcess = String(process.env[key] || '').trim();
  if (fromProcess) return fromProcess;

  const localMap = loadLocalEnv();
  const fromLocal = String(localMap[key] || '').trim();
  if (fromLocal) return fromLocal;

  return fallback;
}
