import DOMPurify from 'dompurify';

/**
 * Hosts whose players may be embedded in author content. Anything else in an
 * <iframe> is removed, so a course, policy or article author cannot frame an
 * arbitrary page inside the learner's session.
 */
const IFRAME_HOSTS = new Set([
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
]);

const CONFIG = {
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'target', 'loading', 'referrerpolicy', 'playsinline'],
  FORBID_TAGS: ['form', 'input', 'textarea', 'select', 'object', 'embed', 'base', 'meta', 'link', 'style'],
};

let hooksInstalled = false;

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName !== 'iframe') return;
    const el = node as Element;
    if (!isAllowedIframeSrc(el.getAttribute('src'))) {
      el.parentNode?.removeChild(el);
    }
  });

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    if (el.tagName === 'A' && el.getAttribute('target') === '_blank') {
      el.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

export function isAllowedIframeSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  try {
    const url = new URL(src);
    return url.protocol === 'https:' && IFRAME_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Cleans HTML written by authors (courses, policies, articles) before it is
 * handed to Angular as trusted HTML. Removes scripts, event handlers,
 * javascript: links and unknown iframes, and keeps the formatting authors use:
 * styles, classes, data attributes, images, video and audio.
 */
export function sanitizeRichHtml(html: string | null | undefined): string {
  if (!html) return '';
  installHooks();
  return DOMPurify.sanitize(String(html), CONFIG) as string;
}
