import { isAllowedIframeSrc, sanitizeRichHtml } from './rich-html-sanitizer';

describe('sanitizeRichHtml', () => {
  it('removes scripts and inline event handlers', () => {
    const out = sanitizeRichHtml('<p onclick="steal()">Hi</p><script>steal()</script><img src="x" onerror="steal()">');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onerror');
    expect(out).toContain('<p>Hi</p>');
  });

  it('removes javascript: links', () => {
    const out = sanitizeRichHtml('<a href="javascript:steal()">Click</a>');
    expect(out).not.toContain('javascript:');
  });

  it('keeps the formatting authors rely on', () => {
    const html = '<div class="hero" style="color:#234a84" data-track-interaction="true"><h2 id="intro">Title</h2>'
      + '<button type="button">Start</button><video controls><source src="https://example.com/a.mp4"></video></div>';
    const out = sanitizeRichHtml(html);
    expect(out).toContain('class="hero"');
    expect(out).toContain('style="color:#234a84"');
    expect(out).toContain('data-track-interaction="true"');
    expect(out).toContain('id="intro"');
    expect(out).toContain('<button type="button">Start</button>');
    expect(out).toContain('<video controls');
  });

  it('keeps YouTube and Vimeo players and drops other iframes', () => {
    const yt = sanitizeRichHtml('<iframe src="https://www.youtube.com/embed/abc" allowfullscreen></iframe>');
    expect(yt).toContain('https://www.youtube.com/embed/abc');
    const vimeo = sanitizeRichHtml('<iframe src="https://player.vimeo.com/video/1"></iframe>');
    expect(vimeo).toContain('player.vimeo.com');
    const evil = sanitizeRichHtml('<p>a</p><iframe src="https://evil.example/phish"></iframe>');
    expect(evil).not.toContain('<iframe');
    expect(evil).toContain('<p>a</p>');
  });

  it('drops forms that could collect credentials', () => {
    const out = sanitizeRichHtml('<form action="https://evil.example"><input name="password"></form>');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('<input');
  });

  it('adds rel=noopener to links opening a new tab', () => {
    const out = sanitizeRichHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeRichHtml(null)).toBe('');
    expect(sanitizeRichHtml('')).toBe('');
  });
});

describe('isAllowedIframeSrc', () => {
  it('accepts only https players from the allowed hosts', () => {
    expect(isAllowedIframeSrc('https://www.youtube-nocookie.com/embed/x')).toBeTrue();
    expect(isAllowedIframeSrc('http://www.youtube.com/embed/x')).toBeFalse();
    expect(isAllowedIframeSrc('https://youtube.com.evil.example/embed/x')).toBeFalse();
    expect(isAllowedIframeSrc('not a url')).toBeFalse();
  });
});
