import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const candidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const executablePath = candidates.find(existsSync);
if (!executablePath) throw new Error('No installed Chromium browser found for WebCodecs QA.');

const server = await createServer({
  server: { host: '127.0.0.1', port: 4179, strictPort: true, fs: { allow: ['..'] } },
  logLevel: 'error',
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  const audioPath = process.env.QA_AUDIO;
  const query = new URLSearchParams();
  if (audioPath) query.set('audio', `/@fs/${audioPath.replaceAll('\\', '/')}`);
  if (process.env.QA_DURATION) query.set('duration', process.env.QA_DURATION);
  if (process.env.QA_WIDTH) query.set('width', process.env.QA_WIDTH);
  if (process.env.QA_HEIGHT) query.set('height', process.env.QA_HEIGHT);
  if (process.env.QA_FPS) query.set('fps', process.env.QA_FPS);
  await page.goto(`http://127.0.0.1:4179/qa-export.html?${query}`);
  await page.waitForFunction(() => document.title === 'PASS' || document.title === 'FAIL' || document.title === 'ERROR', null, { timeout: 1_800_000 });
  const text = await page.locator('#result').textContent();
  const result = JSON.parse(text ?? '{}');
  if (consoleErrors.length) result.consoleErrors = consoleErrors;
  console.log(JSON.stringify(result));
  if (result.status !== 'PASS') process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
