import type { ManualStdTestCase, StdCoverageRow } from "../types";

function csvEscape(value: string): string {
  const needsQuoting = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

function downloadBlob(content: BlobPart, mimeType: string, fileName: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const CSV_HEADERS = [
  "ID",
  "Test Type",
  "Test Scenario",
  "Pre-requisites",
  "Execution Steps",
  "Expected Result",
  "Validation Method",
  "Risk Level",
  "Risk Impact",
];

/** Groups ALL rows sharing a category together (even if the model interleaved them out of
 * order), ordered by first appearance, so a module never repeats as a second block further
 * down the document. Rows within a group are sorted by their numeric TC id for sequential order. */
function groupByCategory(testCases: ManualStdTestCase[]): { title: string; rows: ManualStdTestCase[] }[] {
  const order: string[] = [];
  const rowsByTitle = new Map<string, ManualStdTestCase[]>();
  for (const tc of testCases) {
    if (!rowsByTitle.has(tc.category)) {
      order.push(tc.category);
      rowsByTitle.set(tc.category, []);
    }
    rowsByTitle.get(tc.category)!.push(tc);
  }
  const idNumberOf = (id: string): number => {
    const m = id.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };
  return order.map((title) => ({
    title,
    rows: [...rowsByTitle.get(title)!].sort((a, b) => idNumberOf(a.id) - idNumberOf(b.id)),
  }));
}

/** Column order matches TestRail/Jira Xray manual-test-case import expectations. */
export function exportStdToCsv(testCases: ManualStdTestCase[], featureName: string): void {
  const lines: string[][] = [CSV_HEADERS];

  for (const group of groupByCategory(testCases)) {
    lines.push([`## ${group.title}`]);
    for (const tc of group.rows) {
      lines.push([
        tc.id,
        tc.testType,
        tc.scenario,
        tc.preconditions.join("; "),
        tc.steps.map((s, i) => `${i + 1}. ${s}`).join(" | "),
        tc.expectedResult,
        tc.validationMethod,
        tc.riskLevel,
        tc.riskImpact,
      ]);
    }
  }

  const csv = lines.map((row) => row.map((cell) => csvEscape(String(cell))).join(",")).join("\r\n");

  const slug = featureName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 50) || "std";
  downloadBlob(csv, "text/csv;charset=utf-8", `STD_${slug}_${Date.now()}.csv`);
}

const RISK_COLORS: Record<string, [number, number, number]> = {
  P0: [192, 57, 43],
  P1: [230, 126, 34],
  P2: [241, 196, 15],
  P3: [39, 174, 96],
};

const DOMAIN_LABELS: Record<string, string> = {
  fintech: "FinTech-Adaptive",
  auth: "Auth-Adaptive",
  gaming: "Gaming-Adaptive",
  general: "General",
};

function formatDomainLabel(domain: string): string {
  return domain
    .split("+")
    .map((d) => DOMAIN_LABELS[d] ?? d)
    .join(" + ");
}

export async function exportStdToPdf(
  testCases: ManualStdTestCase[],
  coverage: StdCoverageRow[],
  featureName: string,
  domain: string
): Promise<void> {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(16);
  doc.text(`Standard Test Documentation — ${featureName}`, 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `Generated ${new Date().toLocaleString()} · ${testCases.length} test cases · Domain: ${formatDomainLabel(domain)}`,
    40,
    58
  );

  const PAGE_MARGIN = 40;
  const TABLE_HEAD = [["ID", "Type", "Scenario", "Pre-requisites", "Steps", "Expected Result", "Validation", "Risk"]];
  const TABLE_FONT_SIZE = 7.5;
  const TABLE_CELL_PADDING = 4;
  const STEPS_COL_WIDTH = 140;

  // "Steps" is the tallest, most variable column (multi-line, concrete params/SQL/status
  // codes per the STD generation contract), so its wrapped line count drives the estimate.
  // Used as a look-ahead: a group's table is never started so close to the bottom of a page
  // that its title bar would fit but its first data row wouldn't — avoiding an orphaned title
  // bar with its rows pushed onto the next page.
  function estimateGroupBlockHeight(firstRow: ManualStdTestCase | undefined): number {
    const lineHeight = TABLE_FONT_SIZE * 1.15;
    const headerBarHeight = lineHeight + TABLE_CELL_PADDING * 2;
    if (!firstRow) return headerBarHeight;
    doc.setFontSize(TABLE_FONT_SIZE);
    const stepsText = firstRow.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
    const lines = doc.splitTextToSize(stepsText, STEPS_COL_WIDTH - TABLE_CELL_PADDING * 2);
    const rowHeight = lines.length * lineHeight + TABLE_CELL_PADDING * 2;
    return headerBarHeight + rowHeight;
  }

  let cursorY = 75;
  for (const group of groupByCategory(testCases)) {
    const pageHeight = doc.internal.pageSize.getHeight();
    const requiredBlockHeight = estimateGroupBlockHeight(group.rows[0]) + 10;
    if (cursorY + requiredBlockHeight > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      cursorY = PAGE_MARGIN;
    }

    const body: (string | { content: string; colSpan: number; styles: Record<string, unknown> })[][] = [
      [
        {
          content: group.title,
          colSpan: 8,
          styles: { fillColor: [230, 233, 237], textColor: [44, 62, 80], fontStyle: "bold", halign: "left" },
        },
      ],
    ];
    for (const tc of group.rows) {
      body.push([
        tc.id,
        tc.testType,
        tc.scenario,
        tc.preconditions.join("; "),
        tc.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
        tc.expectedResult,
        tc.validationMethod,
        tc.riskLevel,
      ]);
    }

    autoTable(doc, {
      startY: cursorY,
      head: TABLE_HEAD,
      body,
      margin: { top: PAGE_MARGIN, bottom: PAGE_MARGIN },
      // Repeat the column header row on every page this group's rows spill onto.
      showHead: "everyPage",
      // Never let a single row's content be cut mid-way across a page boundary.
      rowPageBreak: "avoid",
      styles: { fontSize: 7.5, cellPadding: 4, valign: "top" },
      headStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 45 },
        2: { cellWidth: 110 },
        4: { cellWidth: 140 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 7) {
          const level = String(data.cell.raw);
          const color = RISK_COLORS[level];
          if (color) {
            data.cell.styles.fillColor = color;
            data.cell.styles.textColor = 255;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });

    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  if (coverage.length > 0) {
    doc.addPage();
    doc.setFontSize(13);
    doc.setTextColor(0);
    doc.text("Coverage Summary", 40, 40);
    autoTable(doc, {
      startY: 55,
      head: [["Requirement", "Covered By"]],
      body: coverage.map((c) => [c.requirement, c.testCaseIds.join(", ")]),
      styles: { fontSize: 8.5, cellPadding: 5 },
      headStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: "bold" },
    });
  }

  const slug = featureName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 50) || "std";
  doc.save(`STD_${slug}_${Date.now()}.pdf`);
}
