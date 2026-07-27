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

/** Groups rows by their category (module title) while preserving first-seen order. */
function groupByCategory(testCases: ManualStdTestCase[]): { title: string; rows: ManualStdTestCase[] }[] {
  const groups: { title: string; rows: ManualStdTestCase[] }[] = [];
  for (const tc of testCases) {
    const last = groups[groups.length - 1];
    if (last && last.title === tc.category) {
      last.rows.push(tc);
    } else {
      groups.push({ title: tc.category, rows: [tc] });
    }
  }
  return groups;
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

  const body: (string | { content: string; colSpan: number; styles: Record<string, unknown> })[][] = [];
  for (const group of groupByCategory(testCases)) {
    body.push([
      {
        content: group.title,
        colSpan: 8,
        styles: { fillColor: [230, 233, 237], textColor: [44, 62, 80], fontStyle: "bold", halign: "left" },
      },
    ]);
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
  }

  autoTable(doc, {
    startY: 75,
    head: [["ID", "Type", "Scenario", "Pre-requisites", "Steps", "Expected Result", "Validation", "Risk"]],
    body,
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
