/**
 * Builds a small, valid PDF in memory so tests don't need fixture files.
 * Each item in `pages` is an array of text lines for that page.
 * Pass an empty array for a page with no text (like a scanned image page).
 */
function makePdf(pages) {
  const escape = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length; // object number
  };

  const catalog = add(null); // filled in once we know the pages object
  const pagesObj = add(null);
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const pageNumbers = pages.map((lines) => {
    const content = lines.length
      ? "BT /F1 11 Tf 40 800 Td 14 TL " +
        lines.map((line) => `(${escape(line)}) Tj T*`).join(" ") +
        " ET"
      : "0 0 0 rg 50 50 300 300 re f"; // just a filled box, no text
    const stream = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    return add(
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`
    );
  });

  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] =
    `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNumbers.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf);
}

module.exports = { makePdf };