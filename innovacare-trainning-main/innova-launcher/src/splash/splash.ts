// src/splash/splash.ts
//
// Renders in the splash window's page context (sandboxed, contextIsolation
// on) — the ONLY thing it can reach outside the DOM is `window.innovaLauncherChrome`,
// the narrow bridge exposed by splash/preload.ts. Compiled as an ES module
// under its own rootDir (tsconfig.splash.json), so the cross-process types
// below are intentionally duplicated (a handful of small interfaces) rather
// than imported from src/shared — that keeps this bundle self-contained
// instead of pulling all of src/shared into the splash rootDir.
export {}; // forces module context so `declare global` below is valid

interface KnownEnvironment {
  envId: string;
  label: string;
  tier: 'production' | 'train' | 'test';
}

type SplashStatus =
  | 'checking-for-updates'
  | 'downloading-update'
  | 'verifying-configuration'
  | 'opening'
  | 'authenticating'
  | 'error';

interface SplashStatusUpdate {
  status: SplashStatus;
  detail?: string;
}

interface SplashErrorPayload {
  message: string;
  code: string;
  correlationId: string;
}

interface ChromeInitResult {
  knownEnvironments: KnownEnvironment[];
  lastSelectedEnvId: string | null;
  autoSelectedEnvId: string | null;
}

interface InnovaLauncherChromeApi {
  init(): Promise<ChromeInitResult>;
  selectEnvironment(envId: string): Promise<void>;
  unlock(): Promise<void>;
  cancel(): Promise<void>;
  onStatus(cb: (update: SplashStatusUpdate) => void): () => void;
  onError(cb: (error: SplashErrorPayload) => void): () => void;
  onLocked(cb: () => void): () => void;
}

declare global {
  interface Window {
    innovaLauncherChrome: InnovaLauncherChromeApi;
  }
}

const STATUS_LABELS: Record<SplashStatusUpdate['status'], string> = {
  'checking-for-updates': 'Checking for updates…',
  'downloading-update': 'Downloading update…',
  'verifying-configuration': 'Verifying configuration…',
  opening: 'Opening…',
  authenticating: 'Authenticating…',
  error: 'Something went wrong'
};

type ViewName = 'picker' | 'status' | 'lock' | 'error';

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`splash: missing #${id}`);
  }
  return el as T;
}

function showView(name: ViewName): void {
  for (const view of ['picker-view', 'status-view', 'lock-view', 'error-view']) {
    byId(view).hidden = view !== `${name}-view`;
  }
}

function applyRibbon(tier: KnownEnvironment['tier'] | undefined): void {
  const ribbon = byId<HTMLDivElement>('warning-ribbon');
  ribbon.classList.remove('tier-train', 'tier-test');
  if (!tier || tier === 'production') {
    ribbon.hidden = true;
    return;
  }
  ribbon.hidden = false;
  ribbon.textContent =
    tier === 'train' ? 'TRAINING ENVIRONMENT — not for patient care' : 'TEST ENVIRONMENT — not for patient care';
  ribbon.classList.add(tier === 'test' ? 'tier-test' : 'tier-train');
}

async function runLockMode(chrome: InnovaLauncherChromeApi): Promise<void> {
  showView('lock');
  byId<HTMLButtonElement>('unlock-button').addEventListener('click', () => {
    void chrome.unlock();
  });
}

async function runPickerMode(chrome: InnovaLauncherChromeApi): Promise<void> {
  chrome.onStatus((update) => {
    showView('status');
    byId('status-line').textContent = update.detail ?? STATUS_LABELS[update.status];
  });

  chrome.onError((error) => {
    showView('error');
    byId('error-message').textContent = error.message;
    byId('error-code').textContent = error.code;
    byId('correlation-id').textContent = error.correlationId;
  });

  byId<HTMLButtonElement>('copy-error-button').addEventListener('click', () => {
    const text = `${byId('error-code').textContent} / ${byId('correlation-id').textContent}`;
    void navigator.clipboard.writeText(text);
  });
  byId<HTMLButtonElement>('retry-button').addEventListener('click', () => showView('picker'));

  const init = await chrome.init();

  const select = byId<HTMLSelectElement>('env-select');
  select.innerHTML = '';
  for (const env of init.knownEnvironments) {
    const option = document.createElement('option');
    option.value = env.envId;
    option.textContent = env.label;
    select.appendChild(option);
  }
  const preferred = init.autoSelectedEnvId ?? init.lastSelectedEnvId;
  if (preferred) {
    select.value = preferred;
  }

  const updateRibbon = () => {
    const selected = init.knownEnvironments.find((env) => env.envId === select.value);
    applyRibbon(selected?.tier);
  };
  select.addEventListener('change', updateRibbon);
  updateRibbon();

  const connect = async () => {
    showView('status');
    byId('status-line').textContent = STATUS_LABELS['checking-for-updates'];
    try {
      await chrome.selectEnvironment(select.value);
    } catch {
      // Failures surface via chrome.onError push events, not this rejection.
    }
  };

  byId<HTMLButtonElement>('connect-button').addEventListener('click', () => void connect());

  if (init.autoSelectedEnvId) {
    void connect();
  } else {
    showView('picker');
  }
}

async function main(): Promise<void> {
  const chrome = window.innovaLauncherChrome;
  const mode = new URLSearchParams(location.search).get('mode');

  if (mode === 'lock') {
    await runLockMode(chrome);
  } else {
    await runPickerMode(chrome);
  }
}

void main();
