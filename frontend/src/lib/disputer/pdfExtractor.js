/**
 * PDF text extraction using pdfjs-dist.
 * Runs entirely client-side — no credit report data is sent to a server.
 */

let pdfjsLib = null;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  // Use the bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  return pdfjsLib;
}

/**
 * Extract all text from a PDF file.
 * @param {File} file — PDF file from input or drag-and-drop
 * @returns {Promise<{text: string, pages: number, isScanned: boolean}>}
 */
export async function extractTextFromPDF(file) {
  const pdfjs = await loadPdfJs();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  const pageCount = pdf.numPages;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    fullText += pageText + '\n\n';
  }

  // Detect if PDF is scanned (image-based)
  const isScanned = fullText.replace(/\s/g, '').length < 100 && pageCount > 0;

  return {
    text: fullText.trim(),
    pages: pageCount,
    isScanned,
  };
}
