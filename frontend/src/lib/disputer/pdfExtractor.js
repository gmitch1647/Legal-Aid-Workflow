/**
 * PDF text extraction using pdfjs-dist.
 * Preserves spatial layout for credit reports with tables/columns.
 */

let pdfjsLib = null;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  return pdfjsLib;
}

/**
 * Extract text from a PDF preserving spatial layout.
 * Uses text item positions to reconstruct rows/columns so that
 * credit report tables (account details, payment histories) remain readable.
 *
 * @param {File} file — PDF file from input or drag-and-drop
 * @returns {Promise<{text: string, pages: number, isScanned: boolean}>}
 */
export async function extractTextFromPDF(file) {
  const pdfjs = await loadPdfJs();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  let layoutText = '';
  let simpleText = '';
  const pageCount = pdf.numPages;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Method 1: Layout-preserving extraction
    try {
      const pageLayout = extractWithLayout(content.items, page.getViewport({ scale: 1.0 }));
      layoutText += pageLayout + '\n\n--- PAGE BREAK ---\n\n';
    } catch {}

    // Method 2: Simple concatenation (fallback)
    const pageSimple = content.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s{3,}/g, '\t')
      .replace(/\s+/g, ' ')
      .trim();
    simpleText += pageSimple + '\n\n';
  }

  // Use layout version if it produced substantial content, otherwise use simple
  const layoutClean = layoutText.replace(/[\s\-|_PAGE BREAK]/g, '').length;
  const simpleClean = simpleText.replace(/\s/g, '').length;

  let finalText;
  if (layoutClean > simpleClean * 0.7) {
    finalText = layoutText;
  } else {
    // Layout extraction lost too much — use simple text
    finalText = simpleText;
  }

  // If both methods produced very little, combine them
  if (layoutClean < 500 && simpleClean < 500 && pageCount > 0) {
    finalText = layoutText + '\n\n=== ALTERNATE EXTRACTION ===\n\n' + simpleText;
  }

  const isScanned = Math.max(layoutClean, simpleClean) < 100 && pageCount > 0;

  return {
    text: finalText.trim(),
    pages: pageCount,
    isScanned,
  };
}

/**
 * Reconstruct text layout from positioned PDF text items.
 * Groups items into lines by Y-coordinate, then sorts left-to-right.
 * Inserts spacing/tabs between columns based on X gaps.
 */
function extractWithLayout(items, viewport) {
  if (!items || items.length === 0) return '';

  // Get page height for coordinate flip (PDF Y is bottom-up)
  const pageHeight = viewport.height;

  // Transform items to have consistent top-down Y
  const positioned = items
    .filter(item => item.str && item.str.trim())
    .map(item => {
      const tx = item.transform;
      // transform is [scaleX, skewX, skewY, scaleY, translateX, translateY]
      const x = tx[4];
      const y = pageHeight - tx[5]; // flip Y to top-down
      return { text: item.str, x: Math.round(x), y: Math.round(y), width: item.width || 0 };
    });

  if (positioned.length === 0) return '';

  // Group items into lines by Y-coordinate (items within 5px are same line)
  // Equifax reports have tighter spacing than TransUnion/Experian
  const lineThreshold = 5;
  const lines = [];
  let currentLine = [positioned[0]];
  let currentY = positioned[0].y;

  // Sort by Y first (top to bottom), then X (left to right)
  positioned.sort((a, b) => a.y - b.y || a.x - b.x);

  for (let i = 1; i < positioned.length; i++) {
    const item = positioned[i];
    if (Math.abs(item.y - currentY) <= lineThreshold) {
      currentLine.push(item);
    } else {
      lines.push(currentLine);
      currentLine = [item];
      currentY = item.y;
    }
  }
  lines.push(currentLine);

  // Build text for each line, preserving column spacing
  const textLines = lines.map(lineItems => {
    // Sort items left to right within the line
    lineItems.sort((a, b) => a.x - b.x);

    let lineText = '';
    let lastX = 0;

    for (const item of lineItems) {
      // Calculate gap between this item and the previous one
      const gap = item.x - lastX;

      if (lastX > 0) {
        if (gap > 50) {
          // Large gap = likely a new column — use tab
          lineText += '\t';
        } else if (gap > 15) {
          // Medium gap = space between words/fields
          lineText += '  ';
        } else if (gap > 3) {
          lineText += ' ';
        }
      }

      lineText += item.text;
      lastX = item.x + (item.width || item.text.length * 5);
    }

    return lineText;
  });

  return textLines.join('\n');
}
