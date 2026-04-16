function escapeCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportCsvFile(filename, rows) {
  const csv = rows.map((columns) => columns.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(filename, blob);
}

export function exportExcelFile(filename, rows, worksheetName = "Report") {
  const xmlRows = rows
    .map(
      (columns) =>
        `<Row>${columns
          .map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`)
          .join("")}</Row>`,
    )
    .join("");

  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="${escapeXml(worksheetName)}">
    <Table>${xmlRows}</Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8;" });
  downloadBlob(filename, blob);
}
