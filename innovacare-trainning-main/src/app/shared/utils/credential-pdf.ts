/** Renders a DOM element (e.g. a credential card) to a downloadable PDF file. */
export async function downloadElementAsPdf(element: HTMLElement, fileName: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, {
    scale: 3,
    backgroundColor: '#ffffff',
    useCORS: true,
  });

  const imgData = canvas.toDataURL('image/png');
  const widthMm = canvas.width * 0.264583 / 3;
  const heightMm = canvas.height * 0.264583 / 3;

  const pdf = new jsPDF({
    orientation: widthMm > heightMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [widthMm, heightMm],
  });

  pdf.addImage(imgData, 'PNG', 0, 0, widthMm, heightMm);
  pdf.save(fileName);
}
