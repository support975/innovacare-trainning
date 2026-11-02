import {
  formatBytes,
  isPreviewableUrl,
  isSafeHttpUrl,
  materialIdFromClickTarget,
  materialKind,
  materialTitle,
  materialsForLesson,
} from './player-materials';
import { CourseMaterial } from '../../../../data/models';

describe('player-materials', () => {
  const mat = (id: string, lessonIds?: string[]): CourseMaterial => ({ id, name: `${id}.pdf`, url: 'https://firebasestorage.googleapis.com/x', lessonIds });

  it('detects the file kind from mime type or extension', () => {
    expect(materialKind({ fileType: 'application/pdf', name: '', url: '' })).toBe('pdf');
    expect(materialKind({ name: 'Form.DOCX', url: '' })).toBe('doc');
    expect(materialKind({ name: 'x', url: 'https://firebasestorage.googleapis.com/o/a%2Fchart.pdf?alt=media' })).toBe('pdf');
    expect(materialKind({ name: 'notes', url: '' })).toBe('file');
  });

  it('prefers the display title and strips upload timestamps from file names', () => {
    expect(materialTitle({ name: '1730000000000_Braden.pdf' })).toBe('Braden.pdf');
    expect(materialTitle({ name: 'x.pdf', title: '  Braden form ' })).toBe('Braden form');
  });

  it('formats sizes', () => {
    expect(formatBytes(348160)).toBe('340 KB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(formatBytes(undefined)).toBe('');
  });

  it('lists lesson materials first, then course-wide ones, hiding other lessons’ files', () => {
    const all = [mat('a', ['L2']), mat('b'), mat('c', ['L9']), mat('d', [])];
    expect(materialsForLesson(all, 'L2').map((m) => m.id)).toEqual(['a', 'b', 'd']);
    expect(materialsForLesson(all, null).map((m) => m.id)).toEqual(['b', 'd']);
  });

  it('only embeds Firebase / Cloud Storage https URLs', () => {
    expect(isPreviewableUrl('https://firebasestorage.googleapis.com/v0/b/x')).toBeTrue();
    expect(isPreviewableUrl('https://my-app.firebasestorage.app/x')).toBeTrue();
    expect(isPreviewableUrl('https://example.com/x.pdf')).toBeFalse();
    expect(isPreviewableUrl('javascript:alert(1)')).toBeFalse();
    expect(isSafeHttpUrl('javascript:alert(1)')).toBeFalse();
  });

  it('reads inline material links from lesson content', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<a id="a" href="material:mat-1"><span id="inner">Chart</span></a>' +
      '<a id="b" href="unsafe:material:mat-2">Form</a>' +
      '<button id="c" data-material-id="mat-3">Policy</button>' +
      '<a id="d" href="https://example.com">Site</a>';
    expect(materialIdFromClickTarget(host.querySelector('#inner'))).toBe('mat-1');
    expect(materialIdFromClickTarget(host.querySelector('#b'))).toBe('mat-2');
    expect(materialIdFromClickTarget(host.querySelector('#c'))).toBe('mat-3');
    expect(materialIdFromClickTarget(host.querySelector('#d'))).toBeNull();
    expect(materialIdFromClickTarget(null)).toBeNull();
  });
});
