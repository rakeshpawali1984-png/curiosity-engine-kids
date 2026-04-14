import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function runStaticChecks() {
  const envExample = read('.env.example');
  assert(!envExample.includes('VITE_OPENAI_API_KEY'), '.env.example must not contain VITE_OPENAI_API_KEY');

  const clientScreen = read('src/components/CuriousScreen.jsx');
  assert(clientScreen.includes('PROMPT_KEY_FAST'), 'Client should use server prompt template keys');
  assert(!clientScreen.includes('const CREATOR_FAST'), 'Client must not include raw prompt template text');

  const sparkApi = read('api/spark.js');
  assert(sparkApi.includes('rawBody.promptTemplateKey'), 'API must accept promptTemplateKey payload');
  assert(sparkApi.includes('resolvePromptTemplate'), 'API must resolve prompt template server-side');
}

async function runResolverChecks() {
  process.env.PROMPTS_DB_MODE = 'disabled';
  process.env.PROMPTS_DB_ENABLED = 'false';
  process.env.PROMPT_TEMPLATE_CACHE_TTL_MS = '3600000';

  const modulePath = path.join(root, 'api', 'promptTemplates.js');
  const { resolvePromptTemplate } = await import(modulePath);

  const fast = await resolvePromptTemplate('creator_fast');
  const deep = await resolvePromptTemplate('creator_deep');
  const bouncer = await resolvePromptTemplate('bouncer_system');
  const unknown = await resolvePromptTemplate('unknown_template');

  assert(typeof fast === 'string' && fast.length > 0, 'creator_fast prompt must resolve locally');
  assert(typeof deep === 'string' && deep.length > 0, 'creator_deep prompt must resolve locally');
  assert(typeof bouncer === 'string' && bouncer.length > 0, 'bouncer_system prompt must resolve locally');
  assert(fast.includes('Return ONLY this JSON'), 'creator_fast content shape must be present');
  assert(unknown === null, 'Unknown template key should return null');
}

async function main() {
  runStaticChecks();
  await runResolverChecks();
  console.log('Smoke checks passed: prompt security wiring and local resolver behavior are healthy.');
}

main().catch((error) => {
  console.error('Smoke checks failed.');
  console.error(error?.stack || String(error));
  process.exit(1);
});
