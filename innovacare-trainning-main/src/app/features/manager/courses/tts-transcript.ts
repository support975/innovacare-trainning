export interface TranscriptChoice {
  text?: string | null;
}

export interface TranscriptSlide {
  title?: string | null;
  transcript?: string | null;
  notesHtml?: string | null;
}

export interface TranscriptBlock {
  type?: string | null;
  level?: number | null;
  text?: string | null;
  html?: string | null;
  transcript?: string | null;
  question?: string | null;
  choices?: TranscriptChoice[] | null;
  slides?: TranscriptSlide[] | null;
}

export interface TranscriptLesson {
  title?: string | null;
  blocks?: TranscriptBlock[] | null;
}

export interface BuildLessonTranscriptOptions {
  includeQuizChoices?: boolean;
}

const BASIC_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function stripHtmlToText(value: string | null | undefined): string {
  const withoutTags = String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

  return normalizeTranscriptText(
    withoutTags.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (_, entity: string) => {
      const key = entity.toLowerCase();
      if (key.startsWith('#x')) {
        return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
      }
      if (key.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
      }
      return BASIC_ENTITIES[key] ?? ' ';
    })
  );
}

export function normalizeTranscriptText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildLessonTranscript(
  lesson: TranscriptLesson,
  options: BuildLessonTranscriptOptions = {}
): string {
  const blocks = lesson.blocks ?? [];
  const manual = findManualTranscript(blocks);
  if (manual) return manual;

  const parts: string[] = [];

  for (const block of blocks) {
    const type = block.type ?? '';

    if (type === 'heading') {
      parts.push(normalizeTranscriptText(block.text));
      continue;
    }

    if (type === 'text' || type === 'callout') {
      parts.push(stripHtmlToText(block.html));
      continue;
    }

    if (type === 'slideDeck' || type === 'narratedSlides') {
      for (const slide of block.slides ?? []) {
        parts.push(normalizeTranscriptText(slide.title));
        parts.push(stripHtmlToText(slide.notesHtml));
      }
      continue;
    }

    if (type === 'quiz') {
      parts.push(normalizeTranscriptText(block.question));
      if (options.includeQuizChoices) {
        parts.push(...(block.choices ?? []).map(choice => normalizeTranscriptText(choice.text)));
      }
    }
  }

  return joinTranscriptParts(parts);
}

function findManualTranscript(blocks: TranscriptBlock[]): string {
  for (const block of blocks) {
    const blockTranscript = normalizeTranscriptText(block.transcript);
    if (blockTranscript) return blockTranscript;

    for (const slide of block.slides ?? []) {
      const slideTranscript = normalizeTranscriptText(slide.transcript);
      if (slideTranscript) return slideTranscript;
    }
  }

  return '';
}

function joinTranscriptParts(parts: string[]): string {
  return normalizeTranscriptText(
    parts
      .map(part => normalizeTranscriptText(part))
      .filter(Boolean)
      .map(part => (/[.!?]$/.test(part) ? part : `${part}.`))
      .join(' ')
  );
}
