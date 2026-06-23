import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import clsx from "clsx";
import { ParsedPrd } from "../../types";

interface Props {
  onParsed: (result: ParsedPrd) => void;
  isLoading: boolean;
}

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/markdown": [".md"],
  "text/plain": [".txt"],
};

export default function PrdUploader({ onParsed, isLoading }: Props) {
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [tab, setTab] = useState<"upload" | "paste">("upload");

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploadedFile(file);
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/upload-prd", { method: "POST", body: formData });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        onParsed(json.data as ParsedPrd);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        setUploadedFile(null);
      }
    },
    [onParsed]
  );

  const handlePasteSubmit = useCallback(async () => {
    if (!rawText.trim()) return;
    setError(null);

    try {
      const res = await fetch("/api/upload-prd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Parse failed");
      onParsed(json.data as ParsedPrd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
    }
  }, [rawText, onParsed]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDrop: (accepted, rejected) => {
      if (rejected.length > 0) {
        setError(rejected[0].errors[0]?.message ?? "Invalid file");
        return;
      }
      if (accepted[0]) uploadFile(accepted[0]);
    },
  });

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-surface-700 rounded-lg w-fit">
        {(["upload", "paste"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              tab === t
                ? "bg-surface-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            {t === "upload" ? "Upload File" : "Paste Text"}
          </button>
        ))}
      </div>

      {tab === "upload" ? (
        <div
          {...getRootProps()}
          className={clsx(
            "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all",
            isDragActive
              ? "border-sky-500 bg-sky-500/10"
              : "border-surface-500 hover:border-surface-400 bg-surface-800/50"
          )}
        >
          <input {...getInputProps()} />
          {isLoading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-sky-400 animate-spin" />
              <p className="text-slate-300 text-sm">Parsing document…</p>
            </div>
          ) : uploadedFile ? (
            <div className="flex flex-col items-center gap-3">
              <FileText className="w-10 h-10 text-sky-400" />
              <p className="text-white font-medium">{uploadedFile.name}</p>
              <button
                onClick={(e) => { e.stopPropagation(); setUploadedFile(null); }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" /> Remove
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-surface-700 flex items-center justify-center">
                <Upload className="w-6 h-6 text-slate-400" />
              </div>
              <div>
                <p className="text-white font-medium">
                  {isDragActive ? "Drop it here!" : "Drag & drop your PRD"}
                </p>
                <p className="text-slate-400 text-sm mt-1">
                  or click to browse — PDF, DOCX, MD, TXT (max 10 MB)
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`Paste your PRD here…\n\nExample:\nAs a user, I want to log in with email and password\nSo that I can access my account securely.\n\nAcceptance Criteria:\n- Valid credentials show the dashboard\n- Invalid credentials show an error message`}
            rows={12}
            className="w-full bg-surface-800 border border-surface-600 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 resize-none font-mono"
          />
          <button
            onClick={handlePasteSubmit}
            disabled={!rawText.trim() || isLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Parse PRD
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <X className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
