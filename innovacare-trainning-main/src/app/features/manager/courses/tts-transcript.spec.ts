import { buildLessonTranscript, stripHtmlToText } from './tts-transcript';

describe('TTS transcript helpers', () => {
  it('strips HTML and normalizes entities', () => {
    expect(stripHtmlToText('<p>Hello&nbsp;<strong>team</strong> &amp; nurses.</p>')).toBe(
      'Hello team & nurses.'
    );
  });

  it('uses an existing manual transcript before generated lesson text', () => {
    const transcript = buildLessonTranscript({
      title: 'Lesson',
      blocks: [
        { type: 'heading', text: 'Ignored heading' },
        { type: 'audio', transcript: 'Manual narration text.' },
        { type: 'text', html: '<p>Ignored body</p>' },
      ],
    });

    expect(transcript).toBe('Manual narration text.');
  });

  it('builds clean transcript text from heading, text, callout, and slides', () => {
    const transcript = buildLessonTranscript({
      blocks: [
        { type: 'heading', text: 'Wound care overview' },
        { type: 'text', html: '<p>Assess the wound bed.</p>' },
        { type: 'callout', html: '<p>Document drainage.</p>' },
        {
          type: 'slideDeck',
          slides: [{ title: 'Slide 1', notesHtml: '<p>Wash hands before dressing changes.</p>' }],
        },
      ],
    });

    expect(transcript).toBe(
      'Wound care overview. Assess the wound bed. Document drainage. Slide 1. Wash hands before dressing changes.'
    );
  });

  it('omits quiz choices unless explicitly enabled', () => {
    const lesson = {
      blocks: [
        {
          type: 'quiz',
          question: 'What should you do first?',
          choices: [{ text: 'Wash hands' }, { text: 'Skip PPE' }],
        },
      ],
    };

    expect(buildLessonTranscript(lesson)).toBe('What should you do first?');
    expect(buildLessonTranscript(lesson, { includeQuizChoices: true })).toContain('Wash hands');
  });
});
