import { Fragment, useState } from "react";
import { Download, FileSpreadsheet, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";
import type { ManualStdTestCase, StdCoverageRow, StdDomain, StdRiskLevel, StdTestType } from "../../types";
import { exportStdToCsv, exportStdToPdf } from "../../lib/exportStd";
import { SecondaryButton } from "../ui/layout";

const RISK_STYLES: Record<StdRiskLevel, string> = {
  P0: "bg-red-500/15 text-red-400 border-red-500/40",
  P1: "bg-orange-500/15 text-orange-400 border-orange-500/40",
  P2: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  P3: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
};

const TEST_TYPE_STYLES: Record<StdTestType, string> = {
  UI: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  Functional: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
  "Security/RBAC": "bg-red-500/10 text-red-400 border-red-500/30",
  "Data Integrity": "bg-violet-500/10 text-violet-400 border-violet-500/30",
  API: "bg-teal-500/10 text-teal-400 border-teal-500/30",
  Negative: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  Accessibility: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30",
  Integration: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  Concurrency: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  Performance: "bg-lime-500/10 text-lime-400 border-lime-500/30",
};

const DOMAIN_LABELS: Record<string, string> = {
  fintech: "FinTech-Adaptive",
  auth: "Auth-Adaptive",
  gaming: "Gaming-Adaptive",
  general: "General",
};

const DOMAIN_STYLES: Record<string, string> = {
  fintech: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  auth: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  gaming: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  general: "bg-slate-500/10 text-slate-400 border-slate-500/30",
};

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

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap", className)}>
      {children}
    </span>
  );
}

interface ManualStdTableProps {
  testCases: ManualStdTestCase[];
  coverage: StdCoverageRow[];
  featureName: string;
  domain: StdDomain;
  model: string;
  isMock: boolean;
}

export default function ManualStdTable({ testCases, coverage, featureName, domain, model, isMock }: ManualStdTableProps) {
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const handleExportCsv = () => {
    setExporting("csv");
    try {
      exportStdToCsv(testCases, featureName);
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    setExporting("pdf");
    try {
      await exportStdToPdf(testCases, coverage, featureName, domain);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-xs text-slate-400">Standard Test Documentation</span>
          <Pill className={isMock ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}>
            {isMock ? "MOCK" : model}
          </Pill>
          {domain.split("+").map((d) => (
            <Pill key={d} className={DOMAIN_STYLES[d] ?? DOMAIN_STYLES.general}>
              {DOMAIN_LABELS[d] ?? d}
            </Pill>
          ))}
          <span className="text-[11px] text-slate-500">{testCases.length} test cases</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SecondaryButton onClick={handleExportCsv} disabled={exporting !== null}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
          </SecondaryButton>
          <SecondaryButton onClick={handleExportPdf} disabled={exporting !== null}>
            <Download className="w-3.5 h-3.5" /> {exporting === "pdf" ? "Rendering…" : "Export PDF"}
          </SecondaryButton>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-surface-600 bg-surface-800/50">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-700 text-slate-300">
            <tr>
              {["ID", "Test Type", "Test Scenario", "Pre-requisites", "Execution Steps", "Expected Result", "Validation Method", "Risk"].map((h) => (
                <th key={h} className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2 border-b border-surface-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupByCategory(testCases).map((group) => (
              <Fragment key={group.title}>
                <tr>
                  <td colSpan={8} className="px-3 py-1.5 bg-surface-700/60 text-slate-300 font-semibold text-[11px] uppercase tracking-wide border-b border-surface-500">
                    {group.title}
                  </td>
                </tr>
                {group.rows.map((tc, i) => (
                  <tr key={tc.id} className={clsx("align-top border-b border-surface-700/60", i % 2 === 1 && "bg-surface-900/30")}>
                    <td className="px-3 py-2.5 font-mono font-semibold text-slate-200 whitespace-nowrap">{tc.id}</td>
                    <td className="px-3 py-2.5"><Pill className={TEST_TYPE_STYLES[tc.testType]}>{tc.testType}</Pill></td>
                    <td className="px-3 py-2.5 text-slate-200 min-w-[180px]">{tc.scenario}</td>
                    <td className="px-3 py-2.5 text-slate-400 min-w-[160px]">
                      <ul className="list-disc list-inside space-y-0.5">
                        {tc.preconditions.map((p, idx) => <li key={idx}>{p}</li>)}
                      </ul>
                    </td>
                    <td className="px-3 py-2.5 text-slate-300 min-w-[220px]">
                      <ol className="list-decimal list-inside space-y-0.5">
                        {tc.steps.map((s, idx) => <li key={idx}>{s}</li>)}
                      </ol>
                    </td>
                    <td className="px-3 py-2.5 text-slate-300 min-w-[180px]">{tc.expectedResult}</td>
                    <td className="px-3 py-2.5 text-slate-400 italic whitespace-nowrap">{tc.validationMethod}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1 items-start">
                        <Pill className={RISK_STYLES[tc.riskLevel]}>{tc.riskLevel}</Pill>
                        <span className="text-[10px] text-slate-500 max-w-[140px] leading-snug">{tc.riskImpact}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {coverage.length > 0 && (
        <div className="flex-shrink-0 rounded-xl border border-surface-600 bg-surface-800/50 overflow-hidden">
          <button
            type="button"
            onClick={() => setCoverageOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-surface-700/50 transition-colors"
          >
            <span>Coverage Summary ({coverage.length} requirements)</span>
            {coverageOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {coverageOpen && (
            <div className="max-h-48 overflow-y-auto border-t border-surface-600">
              <table className="w-full text-xs">
                <tbody>
                  {coverage.map((row, i) => (
                    <tr key={i} className="border-b border-surface-700/60 last:border-b-0">
                      <td className="px-4 py-2 text-slate-300">{row.requirement}</td>
                      <td className="px-4 py-2 text-slate-500 font-mono whitespace-nowrap">{row.testCaseIds.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
