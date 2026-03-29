export function bumpVersion(v: string): string {
    // accepts "v1.0" or "1.0"
    const raw = (v || '').trim().replace(/^v/i, '');
    const [majS, minS] = raw.split('.');
    const maj = Number(majS || 1);
    const min = Number(minS || 0);
    if (Number.isNaN(maj) || Number.isNaN(min)) return 'v1.0';
    return `v${maj}.${min + 1}`;
  }
  
  export function buildTocFromHtml(html: string): { id: string; text: string; level: 2|3 }[] {
    const container = document.createElement('div');
    container.innerHTML = html || '';
  
    const items: { id: string; text: string; level: 2|3 }[] = [];
    const headings = Array.from(container.querySelectorAll('h2, h3')) as HTMLElement[];
  
    headings.forEach((h, idx) => {
      const level = h.tagName.toLowerCase() === 'h2' ? 2 : 3;
      const text = (h.textContent || '').trim();
      if (!text) return;
      const id = h.id || `sec-${level}-${idx}-${slug(text)}`;
      h.id = id;
      items.push({ id, text, level });
    });
  
    return items;
  
    function slug(s: string) {
      return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
  }
  
  export function downloadCsv(filename: string, rows: Record<string, any>[]) {
    const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
    const escape = (v: any) => {
      const s = String(v ?? '');
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
  
    const csv = [
      cols.join(','),
      ...rows.map(r => cols.map(c => escape(r[c])).join(','))
    ].join('\n');
  
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
  
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  
    URL.revokeObjectURL(url);
  }
  