import { CalendarDays, ClipboardList, Download, Eye, FlaskConical, Layers, Share2, Trash2 } from "lucide-react";
import type { ManualStdRecord } from "../../types";
import { Badge, IconButton, SecondaryButton, type BadgeTone } from "../ui/layout";
import { formatAbsoluteDate, formatRelativeDate } from "../../lib/formatDuration";

const DOMAINS: Record<string, { label: string; tone: BadgeTone }> = {
  fintech: { label: "FinTech-Adaptive", tone: "accent" },
  auth: { label: "Auth-Adaptive", tone: "info" },
  gaming: { label: "Gaming-Adaptive", tone: "pink" },
  general: { label: "General", tone: "neutral" },
};

/** Saved Manual STD row — shared by Test Repository and History. */
export default function ManualStdCard({
  std,
  onView,
  onDownload,
  onDelete,
  onShare,
  isDownloading,
}: {
  std: ManualStdRecord;
  onView: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onShare?: () => void;
  isDownloading: boolean;
}) {
  const caseCount = std.test_cases.length;
  return (
    <article className="group rounded-xl border border-surface-700 bg-surface-800/50 transition-colors hover:border-surface-600">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 p-4 sm:p-5">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-teal-500/10 border border-teal-500/20">
            <ClipboardList className="w-5 h-5 text-teal-400" aria-hidden />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-sm font-semibold text-slate-100 truncate max-w-full sm:max-w-[320px] mr-0.5" title={std.feature_name}>
                {std.feature_name}
              </h3>
              <Badge tone="teal">Manual STD</Badge>
              {std.is_mock && <Badge tone="warning" icon={FlaskConical}>Sample</Badge>}
              {std.domain.split("+").map((d) => {
                const domain = DOMAINS[d] ?? { label: d, tone: "neutral" as const };
                return <Badge key={d} tone={domain.tone}>{domain.label}</Badge>;
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5" title={formatAbsoluteDate(std.created_at)}>
                <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                {formatRelativeDate(std.created_at)}
              </span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Layers className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                {caseCount} test case{caseCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-1 flex-shrink-0">
          <IconButton icon={Trash2} label={`Delete ${std.feature_name}`} tone="danger" onClick={onDelete} />
          <IconButton icon={Download} label="Download PDF" onClick={onDownload} loading={isDownloading} />
          {onShare && <IconButton icon={Share2} label="Share showcase link" tone="accent" onClick={onShare} />}
          <SecondaryButton onClick={onView} className="ml-1">
            <Eye className="w-3.5 h-3.5" aria-hidden />
            View
          </SecondaryButton>
        </div>
      </div>
    </article>
  );
}
