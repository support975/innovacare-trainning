import { CourseMaterial } from '../../../../data/models';

export type MaterialKind = 'pdf' | 'image' | 'video' | 'audio' | 'doc' | 'sheet' | 'slides' | 'file';

const EXT_KIND: Record<string, MaterialKind> = {
  pdf: 'pdf',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  mp4: 'video', webm: 'video', mov: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc', txt: 'doc',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', ods: 'sheet',
  ppt: 'slides', pptx: 'slides', odp: 'slides',
};

const KIND_BADGE: Record<MaterialKind, string> = {
  pdf: 'PDF',
  image: 'IMG',
  video: 'VID',
  audio: 'AUD',
  doc: 'DOC',
  sheet: 'XLS',
  slides: 'PPT',
  file: 'FILE',
};

/** Hosts we allow to load inside the in-player preview frame. */
const PREVIEW_HOSTS = ['firebasestorage.googleapis.com', 'storage.googleapis.com'];

function extensionOf(value: string | undefined): string {
  if (!value) return '';
  const clean = value.split('?')[0].split('#')[0];
  const decoded = (() => {
    try {
      return decodeURIComponent(clean);
    } catch {
      return clean;
    }
  })();
  const dot = decoded.lastIndexOf('.');
  return dot >= 0 ? decoded.slice(dot + 1).toLowerCase() : '';
}

export function materialKind(m: Pick<CourseMaterial, 'fileType' | 'name' | 'url'>): MaterialKind {
  const type = (m.fileType ?? '').toLowerCase();
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.includes('wordprocessing') || type === 'application/msword' || type.startsWith('text/')) return 'doc';
  if (type.includes('spreadsheet') || type === 'application/vnd.ms-excel') return 'sheet';
  if (type.includes('presentation') || type === 'application/vnd.ms-powerpoint') return 'slides';
  return EXT_KIND[extensionOf(m.name)] ?? EXT_KIND[extensionOf(m.url)] ?? 'file';
}

export function materialBadge(kind: MaterialKind): string {
  return KIND_BADGE[kind];
}

export function materialTitle(m: Pick<CourseMaterial, 'title' | 'name'>): string {
  const title = (m.title ?? '').trim();
  if (title) return title;
  return (m.name ?? '').replace(/^\d{10,}_/, '').trim() || 'Document';
}

export function isMaterialDownloadable(m: Pick<CourseMaterial, 'downloadable'>): boolean {
  return m.downloadable !== false;
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isMaterialInLesson(m: Pick<CourseMaterial, 'lessonIds'>, lessonId: string | null | undefined): boolean {
  return !!lessonId && Array.isArray(m.lessonIds) && m.lessonIds.includes(lessonId);
}

/**
 * Materials to show for a lesson: those linked to it first, then course-wide
 * resources (no lessonIds). Materials linked only to other lessons are hidden.
 */
export function materialsForLesson(all: CourseMaterial[], lessonId: string | null | undefined): CourseMaterial[] {
  const valid = (all ?? []).filter((m) => !!m?.id && !!m?.url);
  const linked = valid.filter((m) => isMaterialInLesson(m, lessonId));
  const general = valid.filter((m) => !Array.isArray(m.lessonIds) || m.lessonIds.length === 0);
  return [...linked, ...general.filter((m) => !linked.includes(m))];
}

/** True when the URL is an https Firebase/Cloud Storage URL safe to embed for preview. */
export function isPreviewableUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return PREVIEW_HOSTS.includes(host) || host.endsWith('.firebasestorage.app');
  } catch {
    return false;
  }
}

/** True for http(s) URLs only — guards links we open or download. */
export function isSafeHttpUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * If a click landed on an inline material link inside lesson content, returns
 * the material id. Supports `href="material:ID"` (also after Angular prefixes
 * it with `unsafe:`) and `data-material-id="ID"`.
 */
export function materialIdFromClickTarget(target: EventTarget | null): string | null {
  const el = target instanceof Element ? target : null;
  if (!el) return null;
  const link = el.closest('[data-material-id], a[href]');
  if (!link) return null;

  const dataId = link.getAttribute('data-material-id');
  if (dataId?.trim()) return dataId.trim();

  const href = (link.getAttribute('href') ?? '').trim();
  const match = /^(?:unsafe:)?material:(.+)$/i.exec(href);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return match[1].trim() || null;
  }
}
