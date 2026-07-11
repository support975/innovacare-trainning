import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function note(message) {
  notes.push(message);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full));
    } else {
      out.push(full);
    }
  }

  return out;
}

function parseBudgetSize(value) {
  const match = /^(\d+(?:\.\d+)?)(kb|mb|b)$/i.exec(String(value).trim());
  if (!match) return Number.POSITIVE_INFINITY;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'mb') return amount * 1024 * 1024;
  if (unit === 'kb') return amount * 1024;
  return amount;
}

async function auditSourceGuards() {
  const sourceFiles = (await walk(path.join(root, 'src')))
    .filter((file) => /\.(ts|html|css)$/.test(file));

  for (const file of sourceFiles) {
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    const text = await readFile(file, 'utf8');

    if (text.includes("import '@angular/compiler'")) {
      fail(`${relative}: runtime @angular/compiler import detected.`);
    }

    if (text.includes('max-width: 1200%') || text.includes('box-sizing: boder-box')) {
      fail(`${relative}: mobile layout typo or oversized fixed style detected.`);
    }

    if (text.includes('localStorage') && relative !== 'src/app/shared/services/safe-storage.ts') {
      fail(`${relative}: direct localStorage access should go through SafeStorageService.`);
    }
  }

  const appConfig = await readText('src/app/app.config.ts');
  const env = await readText('src/enviroments/enviroment.ts');
  if (!appConfig.includes('if (emulator.enabled)')) {
    fail('src/app/app.config.ts: Functions emulator must be guarded by environment.functions.emulator.enabled.');
  }
  if (!/enabled:\s*false/.test(env)) {
    fail('src/enviroments/enviroment.ts: Functions emulator should default to enabled: false.');
  }
}

async function auditAngularBudgets() {
  const angularConfig = JSON.parse(await readText('angular.json'));
  const budgets =
    angularConfig.projects?.myapp?.architect?.build?.configurations?.production?.budgets ?? [];
  const initial = budgets.find((budget) => budget.type === 'initial');
  const componentStyle = budgets.find((budget) => budget.type === 'anyComponentStyle');

  if (!initial) {
    fail('angular.json: missing production initial budget.');
    return;
  }

  if (parseBudgetSize(initial.maximumWarning) > 950 * 1024) {
    fail(`angular.json: initial maximumWarning is too loose (${initial.maximumWarning}).`);
  }

  if (parseBudgetSize(initial.maximumError) > 1300 * 1024) {
    fail(`angular.json: initial maximumError is too loose (${initial.maximumError}).`);
  }

  if (!componentStyle || parseBudgetSize(componentStyle.maximumError) > 64 * 1024) {
    fail('angular.json: anyComponentStyle maximumError should stay under 64kB.');
  }
}

async function auditBuildOutput() {
  const browserDir = path.join(root, 'dist', 'myapp', 'browser');
  const indexPath = path.join(browserDir, 'index.html');

  if (!(await fileExists(indexPath))) {
    note('dist/myapp/browser/index.html not found; run npm run build before full bundle audit.');
    return;
  }

  const indexHtml = await readFile(indexPath, 'utf8');
  const assetNames = new Set(
    Array.from(indexHtml.matchAll(/(?:href|src)="([^"]+\.(?:js|css))"/g), (match) => match[1])
      .filter((asset) => !asset.startsWith('http'))
      .map((asset) => asset.replace(/^\//, ''))
  );

  let initialBytes = (await stat(indexPath)).size;
  for (const asset of assetNames) {
    const file = path.join(browserDir, asset);
    if (await fileExists(file)) {
      initialBytes += (await stat(file)).size;
    }
  }

  if (initialBytes > 950 * 1024) {
    fail(`dist initial assets are ${(initialBytes / 1024).toFixed(1)}kB; keep under 950kB.`);
  } else {
    note(`dist initial assets: ${(initialBytes / 1024).toFixed(1)}kB.`);
  }

  const jsFiles = (await readdir(browserDir))
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(browserDir, name));

  for (const file of jsFiles) {
    const text = await readFile(file, 'utf8');
    if (
      text.includes('Formez vos équipes de santé') ||
      text.includes('Formez vos \\u00e9quipes') ||
      text.includes('Formez vos \\xE9quipes')
    ) {
      const size = (await stat(file)).size;
      if (size > 110 * 1024) {
        fail(`${path.basename(file)} contains the landing page and is ${(size / 1024).toFixed(1)}kB.`);
      } else {
        note(`landing chunk: ${(size / 1024).toFixed(1)}kB.`);
      }
      return;
    }
  }

  note('landing chunk was not identified in dist; source guards still ran.');
}

async function optionalBrowserSmoke() {
  const baseUrl = process.env.MOBILE_AUDIT_URL;
  if (!baseUrl) {
    note('browser viewport smoke skipped; set MOBILE_AUDIT_URL with Playwright installed to run 390x844 checks.');
    return;
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    fail('MOBILE_AUDIT_URL was set, but Playwright is not installed.');
    return;
  }

  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, isMobile: true });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(new URL('/home', baseUrl).toString(), {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      const metrics = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));

      if (metrics.scrollWidth > metrics.clientWidth + 1) {
        fail(`/home overflows horizontally at ${viewport.width}x${viewport.height}.`);
      }

      if (errors.length) {
        fail(`/home console/page errors at ${viewport.width}x${viewport.height}: ${errors.join(' | ')}`);
      }

      await page.close();
    }
  } finally {
    await browser.close();
  }
}

await auditSourceGuards();
await auditAngularBudgets();
await auditBuildOutput();
await optionalBrowserSmoke();

for (const message of notes) {
  console.log(`mobile-audit: ${message}`);
}

if (failures.length) {
  for (const message of failures) {
    console.error(`mobile-audit: ${message}`);
  }
  process.exit(1);
}

console.log('mobile-audit: ok');
