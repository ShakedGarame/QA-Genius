import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { useDropzone } from "react-dropzone";
import {
  Play, Loader2, Sparkles, FileCode2, AlertCircle,
  CheckCircle2, RotateCcw, Save, Upload, FileText,
  Code2, Globe, Tag, X, Square, Bot, Pencil, Check,
  ClipboardList, ChevronUp, ClipboardPaste,
} from "lucide-react";
import clsx from "clsx";
import StoryPanel from "../../components/qa-genius/StoryPanel";
import ExecutionConsole from "../../components/qa-genius/ExecutionConsole";
import ArtifactsGallery from "../../components/qa-genius/ArtifactsGallery";
import FailureAnalyzer from "../../components/qa-genius/FailureAnalyzer";
import ManualStdTable from "../../components/qa-genius/ManualStdTable";
import { useTestRunner } from "../../hooks/useTestRunner";
import { useAuth } from "../../hooks/useAuth";
import { buildOpenAIKeyHeaders, readOpenAIKeyForRequest } from "../../lib/apiKeys";
import { routeFailureLogsToAnalyzer, getActionableFailureLogs, readPendingGeneratorRun, type RunInGeneratorPayload } from "../../lib/cloudRunner";
import SelfHealModal from "../../components/qa-genius/SelfHealModal";
import { ParsedPrd, GenerateTestsResult, UserStory, InputType, GenerateManualStdResult } from "../../types";
import { MOCK_CODE_MAP } from "../../data/mockData";
import {
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  IconButton,
  SegmentedControl,
  FormInput,
  FormTextarea,
  Badge,
  Skeleton,
  FOCUS_RING,
} from "../../components/ui/layout";

const FIELD_LABEL = "flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5";

// Monaco is the single heaviest dependency in the app and is only needed once a
// test has actually been generated — lazy-load it so it never ships in the
// initial bundle for users who haven't reached this point yet.
const TestEditor = lazy(() => import("../../components/qa-genius/TestEditor"));

// ─── Feature Name Input ───────────────────────────────────────────────────────

const FEATURE_SUGGESTIONS = [
  "Authentication", "Shopping Cart", "Payment Gateway",
  "User Profile", "Search & Filters", "Checkout Flow",
  "Product Catalog", "Order History", "Admin Dashboard",
];

function FeatureNameInput({
  value, onChange, onSave, isSaved, error,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  isSaved: boolean;
  error?: string;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const filtered = FEATURE_SUGGESTIONS.filter(
    (s) => s.toLowerCase().includes(value.toLowerCase()) && s !== value
  );

  return (
    <div className="relative">
      <label htmlFor="feature-name" className={FIELD_LABEL}>
        <Tag className="w-3 h-3" aria-hidden /> Feature Name <span className="text-red-400/80" aria-hidden>*</span>
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <FormInput
          id="feature-name"
          name="feature-name"
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          value={value}
          onChange={(e) => { onChange(e.target.value); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && onSave()}
          placeholder="e.g. Authentication, Shopping Cart…"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? "feature-name-error" : "feature-name-hint"}
          className={clsx(
            "flex-1",
            error ? "!border-red-500/60" : isSaved && "!border-emerald-500/40"
          )}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={!value.trim() || isSaved}
          title={isSaved ? "Feature name saved" : "Save feature name"}
          className={clsx(
            "pressable flex-shrink-0 flex items-center justify-center gap-1.5 h-10 sm:h-9 px-3.5 rounded-lg text-xs font-medium w-full sm:w-auto border",
            FOCUS_RING,
            isSaved
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 cursor-default"
              : "bg-sky-600 hover:bg-sky-500 border-transparent disabled:opacity-40 disabled:cursor-not-allowed text-white"
          )}
        >
          {isSaved
            ? <><CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> Saved</>
            : <><Save className="w-3.5 h-3.5" aria-hidden /> Save</>
          }
        </button>
      </div>
      {error && <p id="feature-name-error" role="alert" className="text-xs text-red-400 mt-1.5">{error}</p>}
      {!isSaved && !error && (
        <p id="feature-name-hint" className="text-[11px] text-slate-500 mt-1.5">
          Save the feature name before configuring inputs
        </p>
      )}
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full sm:w-[calc(100%-5.5rem)] bg-surface-800 border border-surface-600 rounded-lg shadow-xl shadow-black/40 overflow-hidden p-1 origin-top animate-pop-in">
          {filtered.slice(0, 5).map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={() => { onChange(s); }}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-sm text-slate-300 hover:bg-surface-700 hover:text-white transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Generator Mode Toggle (Playwright Automation vs Manual STD) ─────────────

type GeneratorMode = "playwright" | "manual-std";

function GeneratorModeToggle({
  value, onChange,
}: {
  value: GeneratorMode;
  onChange: (v: GeneratorMode) => void;
}) {
  return (
    <div>
      <p className={FIELD_LABEL}>
        <Sparkles className="w-3 h-3" aria-hidden /> Generator Mode
      </p>
      <SegmentedControl<GeneratorMode>
        ariaLabel="Generator mode"
        value={value}
        onChange={onChange}
        fullWidth
        options={[
          { id: "playwright", label: "Automation", icon: Bot, activeClassName: "bg-sky-600 text-white shadow-sm shadow-black/30" },
          { id: "manual-std", label: "Manual STD", icon: ClipboardList, activeClassName: "bg-emerald-600 text-white shadow-sm shadow-black/30" },
        ]}
      />
    </div>
  );
}

// ─── Input Type Toggle ────────────────────────────────────────────────────────

function InputTypeToggle({
  value, onChange,
}: {
  value: InputType;
  onChange: (v: InputType) => void;
}) {
  return (
    <div>
      <p className={FIELD_LABEL}>
        <Code2 className="w-3 h-3" aria-hidden /> Test Type
      </p>
      <SegmentedControl<InputType>
        ariaLabel="Test type"
        value={value}
        onChange={onChange}
        fullWidth
        options={[
          { id: "prd", label: "UI (PRD)", icon: FileText, activeClassName: "bg-sky-600 text-white shadow-sm shadow-black/30" },
          { id: "swagger", label: "API (Swagger)", icon: Globe, activeClassName: "bg-violet-600 text-white shadow-sm shadow-black/30" },
        ]}
      />
      <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
        {value === "prd"
          ? "Generates Playwright UI tests with Page Object Model + getByRole locators"
          : "Generates Playwright API tests using request.get/post with status & payload assertions"}
      </p>
    </div>
  );
}

// ─── PRD / Swagger Input Area ─────────────────────────────────────────────────

const PRD_ACCEPTED = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/markdown": [".md"],
  "text/plain": [".txt"],
};
const SWAGGER_ACCEPTED = {
  "application/json": [".json"],
  "application/yaml": [".yaml", ".yml"],
  "text/plain": [".txt"],
};

interface InputAreaProps {
  inputType: InputType;
  onReady: (data: { prdText?: string; swaggerContent?: string; file?: File; userStories?: UserStory[] }) => void;
  isLoading: boolean;
}

function InputArea({ inputType, onReady, isLoading }: InputAreaProps) {
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [pasteSaved, setPasteSaved] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const accept = inputType === "swagger" ? SWAGGER_ACCEPTED : PRD_ACCEPTED;
  const formats = inputType === "swagger" ? "JSON, YAML" : "PDF, DOCX, MD, TXT";
  const placeholder = inputType === "swagger"
    ? `Paste your OpenAPI JSON here…\n\n{\n  "openapi": "3.0.0",\n  "info": { "title": "My API", "version": "1.0" },\n  "paths": {\n    "/users": {\n      "get": { "summary": "List users", ... }\n    }\n  }\n}`
    : `Paste your PRD here…\n\nAs a user, I want to log in with email and password\nSo that I can access my account securely.\n\nAcceptance Criteria:\n- Valid credentials show the dashboard\n- Invalid credentials show an error message`;

  const handlePasteSubmit = () => {
    if (!pasteText.trim()) return;
    if (inputType === "swagger") {
      onReady({ swaggerContent: pasteText });
    } else {
      onReady({ prdText: pasteText });
    }
    setPasteSaved(true);
  };

  const onDrop = useCallback((accepted: File[], rejected: { errors: readonly { message: string }[] }[]) => {
    setFileError(null);
    if (rejected.length > 0) {
      setFileError(rejected[0].errors[0]?.message ?? "Invalid file");
      return;
    }
    if (accepted[0]) {
      setUploadedFile(accepted[0]);
      onReady({ file: accepted[0] });
    }
  }, [onReady]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDrop,
  });

  useEffect(() => {
    setPasteSaved(false);
  }, [inputType, tab]);

  return (
    <div className="space-y-3">
      <SegmentedControl<"upload" | "paste">
        ariaLabel="Input method"
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { id: "upload", label: `Upload ${formats}`, icon: Upload },
          { id: "paste", label: "Paste Text", icon: ClipboardPaste },
        ]}
      />

      {tab === "upload" ? (
        <div
          {...getRootProps()}
          className={clsx(
            "border border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors duration-150",
            FOCUS_RING,
            isDragActive
              ? inputType === "swagger" ? "border-violet-500/70 bg-violet-500/10" : "border-sky-500/70 bg-sky-500/10"
              : uploadedFile
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-surface-500 hover:border-slate-500 hover:bg-surface-800/70 bg-surface-900/40"
          )}
        >
          <input {...getInputProps()} />
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
              <p className="text-xs text-slate-300">Parsing…</p>
            </div>
          ) : uploadedFile ? (
            <div className="flex items-center justify-center gap-2 min-w-0 animate-fade-in">
              <FileText className="w-5 h-5 text-emerald-400 flex-shrink-0" aria-hidden />
              <span className="max-w-[220px] truncate font-mono text-xs text-white" title={uploadedFile.name}>
                {uploadedFile.name}
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">{(uploadedFile.size / 1024).toFixed(1)} KB</span>
              <IconButton
                icon={X}
                label="Remove file"
                size="sm"
                tone="danger"
                onClick={(e) => { e.stopPropagation(); setUploadedFile(null); }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className={clsx("w-6 h-6 transition-colors", isDragActive ? "text-sky-400" : "text-slate-500")} aria-hidden />
              <p className="text-sm text-slate-300">
                {isDragActive ? "Drop to upload" : `Drag & drop ${formats}`}
              </p>
              <p className="text-xs text-slate-500">or click to browse · max 10 MB</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <FormTextarea
            aria-label={inputType === "swagger" ? "OpenAPI spec" : "PRD text"}
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              if (pasteSaved) setPasteSaved(false);
            }}
            placeholder={placeholder}
            rows={8}
            className={clsx("px-3 py-2.5", pasteSaved && "!border-emerald-500/40")}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim() || isLoading || pasteSaved}
              className={clsx(
                "pressable flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-medium border",
                FOCUS_RING,
                pasteSaved
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 cursor-default"
                  : "bg-sky-600 hover:bg-sky-500 border-transparent disabled:opacity-50 disabled:cursor-not-allowed text-white"
              )}
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : pasteSaved ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              {isLoading ? "Parsing…" : pasteSaved ? "Saved" : "Parse"}
            </button>
            {pasteSaved && (
              <span className="text-[11px] text-emerald-400/90 animate-fade-in">
                Text saved — ready for Generate
              </span>
            )}
          </div>
        </div>
      )}

      {fileError && (
        <p role="alert" className="text-xs text-red-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> {fileError}
        </p>
      )}
    </div>
  );
}

// ─── Loading placeholders ─────────────────────────────────────────────────────

/** Editor-shaped placeholder so the code pane lands in place instead of
 * replacing a centered spinner. */
function EditorSkeleton() {
  const widths = [38, 62, 0, 24, 70, 56, 44, 0, 30, 66, 50, 58, 20];
  return (
    <div className="h-[70vh] min-h-[420px] rounded-lg border border-surface-700 bg-surface-900 overflow-hidden" aria-hidden>
      <div className="h-9 border-b border-surface-700 bg-surface-800/60 flex items-center px-3">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="p-4 space-y-2.5">
        {widths.map((w, i) => (
          <div key={i} className="flex items-center gap-4">
            <span className="w-5 text-right text-[11px] font-mono text-slate-700 tabular-nums">{i + 1}</span>
            {w > 0 && <Skeleton className="h-3" style={{ width: `${w}%` }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function GeneratingStatus({
  tone,
  title,
  detail,
  children,
}: {
  tone: "sky" | "violet" | "emerald";
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  const toneClass = {
    sky: "bg-sky-500/10 border-sky-500/20 text-sky-400",
    violet: "bg-violet-500/10 border-violet-500/20 text-violet-400",
    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  }[tone];
  return (
    <div className="space-y-4 animate-fade-in" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className={clsx("w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0", toneClass)}>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          <p className="text-xs text-slate-500 truncate">{detail}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

interface GenerateResult extends GenerateTestsResult {
  savedAs?: string;
  featureSlug?: string;
}

type Stage = "configure" | "generated" | "executed";

export default function TestGeneratorTab() {
  const [featureName, setFeatureName] = useState("");
  const [featureNameSaved, setFeatureNameSaved] = useState(false);
  const [featureNameError, setFeatureNameError] = useState("");
  const [inputType, setInputType] = useState<InputType>("prd");
  const [generatorMode, setGeneratorMode] = useState<GeneratorMode>("playwright");
  const [stdResult, setStdResult] = useState<GenerateManualStdResult | null>(null);
  const [isGeneratingStd, setIsGeneratingStd] = useState(false);
  const [stdError, setStdError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("configure");
  const [editedCode, setEditedCode] = useState("");
  const [savedAs, setSavedAs] = useState<string | null>(null);
  const [featureSlug, setFeatureSlug] = useState<string | null>(null);
  const [userStories, setUserStories] = useState<UserStory[]>([]);
  const [activeStoryId, setActiveStoryId] = useState<string | undefined>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [formKey, setFormKey] = useState(0);

  // Pending input data
  const [pendingInput, setPendingInput] = useState<{
    prdText?: string;
    swaggerContent?: string;
    file?: File;
  } | null>(null);

  const {
    isRunning, output, progress, statusMessage, result: runResult,
    runTest, stopTest, resetExecutionState, isAnalyzing, mcpSteps, analysis, analyzeFailure,
  } = useTestRunner();
  const { user } = useAuth();
  const lastAppliedRunTs = useRef(0);
  const [selfHealOpen, setSelfHealOpen] = useState(false);
  const failureRef = useRef<HTMLDivElement>(null);

  const applyRunPayload = useCallback(
    async (detail: RunInGeneratorPayload) => {
      if (detail.ts <= lastAppliedRunTs.current) return;
      lastAppliedRunTs.current = detail.ts;

      const { file, isMock, inputType: incomingType, autoRun = true } = detail;
      let code = detail.code;

      if (!code) {
        if (isMock) {
          code = MOCK_CODE_MAP[file.relativePath];
        } else {
          try {
            const res = await fetch(
              `/api/tests/${encodeURIComponent(file.featureSlug)}/${encodeURIComponent(file.fileName)}`,
              { credentials: "include" }
            );
            const json = await res.json();
            code = json.code ?? "";
          } catch {
            code = "";
          }
        }
      }

      if (!code?.trim()) return;

      setFeatureName(file.featureName);
      setFeatureNameSaved(true);
      setFeatureNameError("");
      if (incomingType) setInputType(incomingType);
      setEditedCode(code);
      setSavedAs(file.fileName);
      setFeatureSlug(file.featureSlug);
      setGenResult({
        code,
        userStories: [],
        model: "repository",
        isMock: isMock ?? false,
        savedAs: file.fileName,
        featureSlug: file.featureSlug,
      });
      setGenError(null);
      setStage("generated");

      if (autoRun) {
        await runTest({ code, relativePath: file.relativePath });
        setStage("executed");
      }
    },
    [runTest]
  );

  useEffect(() => {
    const pending = readPendingGeneratorRun();
    if (pending) void applyRunPayload(pending);
  }, [applyRunPayload]);

  useEffect(() => {
    const onRunInGenerator = (event: Event) => {
      const detail = (event as CustomEvent<RunInGeneratorPayload>).detail;
      if (detail?.file) void applyRunPayload(detail);
    };
    window.addEventListener("qa-genius:run-test-in-generator", onRunInGenerator);
    return () => window.removeEventListener("qa-genius:run-test-in-generator", onRunInGenerator);
  }, [applyRunPayload]);

  const handleSaveFeatureName = () => {
    if (!featureName.trim()) {
      setFeatureNameError("Feature Name is required");
      return;
    }
    setFeatureNameError("");
    setFeatureNameSaved(true);
  };

  const handleFeatureNameChange = (v: string) => {
    setFeatureName(v);
    setFeatureNameSaved(false);
  };

  const handleInputReady = (data: {
    prdText?: string;
    swaggerContent?: string;
    file?: File;
    userStories?: UserStory[];
  }) => {
    setPendingInput(data);
    if (data.userStories?.length) {
      setUserStories(data.userStories);
      setActiveStoryId(data.userStories[0]?.id);
    }
  };

  const handleGenerate = async () => {
    if (!featureName.trim()) {
      setFeatureNameError("Feature Name is required");
      return;
    }
    if (!featureNameSaved) {
      setFeatureNameError("Please save the Feature Name first");
      return;
    }
    setFeatureNameError("");

    const userKey = readOpenAIKeyForRequest();
    if (!userKey && !user?.hasOpenAI) {
      setGenError("OpenAI API key missing. Open Settings, paste your sk-… key (it saves automatically), then try again.");
      return;
    }

    if (!pendingInput && !editedCode) {
      setGenError("Please provide a PRD or Swagger file / text first");
      return;
    }

    // New generation — discard previous run output, artifacts, and failure analysis
    resetExecutionState();
    setStage("generated");
    setConfigCollapsed(true);

    setIsGenerating(true);
    setGenError(null);

    try {
      const formData = new FormData();
      formData.append("featureName", featureName.trim());
      formData.append("inputType", inputType);

      if (pendingInput?.file) {
        formData.append("file", pendingInput.file);
      } else if (inputType === "swagger" && pendingInput?.swaggerContent) {
        formData.append("swaggerContent", pendingInput.swaggerContent);
      } else if (pendingInput?.prdText) {
        formData.append("prdText", pendingInput.prdText);
      } else {
        setGenError("Please provide input first");
        return;
      }

      const userKey = readOpenAIKeyForRequest();
      if (userKey) formData.append("openaiApiKey", userKey);

      const res = await fetch("/api/generate-tests", {
        method: "POST",
        credentials: "include",
        headers: buildOpenAIKeyHeaders(),
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");

      if (json.data?.isMock) {
        throw new Error("Server returned demo mode — your API key was not received. Re-paste it in Settings and try again.");
      }

      const r: GenerateResult = {
        ...(json.data as GenerateTestsResult),
        savedAs: json.savedAs,
        featureSlug: json.featureSlug,
      };
      setGenResult(r);
      setEditedCode(r.code);
      setSavedAs(json.savedAs ?? null);
      setFeatureSlug(json.featureSlug ?? null);

      if (r.userStories?.length) {
        setUserStories(r.userStories);
        setActiveStoryId(r.userStories[0]?.id);
      }

      setStage("generated");
      window.dispatchEvent(new CustomEvent("qa-genius:repository-changed"));
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateStd = async () => {
    if (!featureName.trim()) {
      setFeatureNameError("Feature Name is required");
      return;
    }
    if (!featureNameSaved) {
      setFeatureNameError("Please save the Feature Name first");
      return;
    }
    setFeatureNameError("");

    const userKey = readOpenAIKeyForRequest();
    if (!userKey && !user?.hasOpenAI) {
      setStdError("OpenAI API key missing. Open Settings, paste your sk-… key (it saves automatically), then try again.");
      return;
    }

    if (!pendingInput) {
      setStdError("Please provide a PRD or Swagger file / text first");
      return;
    }

    setStage("generated");
    setConfigCollapsed(true);
    setIsGeneratingStd(true);
    setStdError(null);

    try {
      const formData = new FormData();
      formData.append("featureName", featureName.trim());
      formData.append("inputType", inputType);

      if (pendingInput.file) {
        formData.append("file", pendingInput.file);
      } else if (inputType === "swagger" && pendingInput.swaggerContent) {
        formData.append("swaggerContent", pendingInput.swaggerContent);
      } else if (pendingInput.prdText) {
        formData.append("prdText", pendingInput.prdText);
      } else {
        setStdError("Please provide input first");
        return;
      }

      if (userKey) formData.append("openaiApiKey", userKey);

      const res = await fetch("/api/generate-std", {
        method: "POST",
        credentials: "include",
        headers: buildOpenAIKeyHeaders(),
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "STD generation failed");

      if (json.data?.isMock) {
        throw new Error("Server returned demo mode — your API key was not received. Re-paste it in Settings and try again.");
      }

      setStdResult(json.data as GenerateManualStdResult);
      setStage("generated");
      window.dispatchEvent(new CustomEvent("qa-genius:manual-std-changed"));
    } catch (e) {
      setStdError(e instanceof Error ? e.message : "STD generation failed");
    } finally {
      setIsGeneratingStd(false);
    }
  };

  const handleRun = async () => {
    const code = editedCode || genResult?.code || "";
    if (!code) return;
    const relativePath =
      featureSlug && savedAs ? `${featureSlug}/${savedAs}` : undefined;
    await runTest(relativePath ? { code, relativePath } : code);
    setStage("executed");
  };

  const handleAnalyze = async () => {
    const code = editedCode || genResult?.code || "";
    const err = runResult?.errorDetails ?? runResult?.rawLogs ?? output;
    await analyzeFailure(code, err, featureName.trim() || undefined);
  };

  const handleAnalyzeWithGitHubLogs = () => {
    const logs = getActionableFailureLogs(runResult, output);
    routeFailureLogsToAnalyzer(logs, "playwright", {
      testCode: editedCode,
      featureSlug: featureSlug ?? undefined,
      fileName: savedAs ?? undefined,
      featureName: featureName.trim() || undefined,
    });
  };

  const handleSelfHeal = useCallback(() => {
    setSelfHealOpen(true);
  }, []);

  const handleOpenSettingsFromFailure = () => {
    window.dispatchEvent(new CustomEvent("qa-genius:navigate-tab", { detail: { tab: "settings" } }));
  };

  const handleReset = () => {
    resetExecutionState();
    setStage("configure");
    setEditedCode("");
    setSavedAs(null);
    setFeatureSlug(null);
    setGenResult(null);
    setGenError(null);
    setStdResult(null);
    setStdError(null);
    setPendingInput(null);
    setUserStories([]);
    setActiveStoryId(undefined);
    setFeatureName("");
    setFeatureNameSaved(false);
    setFeatureNameError("");
    setInputType("prd");
    setGeneratorMode("playwright");
    setConfigCollapsed(false);
    setFormKey((k) => k + 1);
    setTimeout(() => document.getElementById("feature-name")?.focus(), 80);
  };

  const showExecutionPanel = stage === "executed" || isRunning;
  // Broader than a strict `status === "failed"` check on purpose: a run that
  // ends via a non-clean path (network hiccup, malformed stream, backend
  // error event) never gets a populated result, but the terminal has already
  // moved past "running" — the banner still needs to show rather than
  // silently vanish, so anything short of a genuine "passed" counts.
  // "error" = the run never started (infrastructure), so there is no test failure to analyze.
  const showFailureAnalyzer =
    stage === "executed" && !isRunning && runResult?.status !== "passed" && runResult?.status !== "error";

  useEffect(() => {
    if (showFailureAnalyzer) {
      failureRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showFailureAnalyzer]);

  const stageList: Stage[] = generatorMode === "manual-std" ? ["configure", "generated"] : ["configure", "generated", "executed"];
  const stageIdx = stageList.indexOf(stage);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto w-full pb-24">
      {/* ── Top: compact config card (collapses to a sticky summary once generation starts) ── */}
      <div className={clsx("flex-shrink-0 p-4 sm:p-6 pb-4", configCollapsed && "sticky top-0 z-10 bg-surface-900")}>
        {configCollapsed ? (
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap bg-surface-800/80 backdrop-blur-sm border border-surface-700 rounded-xl pl-4 pr-2 py-2 text-xs animate-fade-in">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="text-slate-500">Feature</span>
              <span className="font-medium text-slate-200 truncate max-w-[200px]">{featureName}</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              {generatorMode === "manual-std"
                ? <><ClipboardList className="w-3.5 h-3.5 text-emerald-400" aria-hidden /> Manual STD</>
                : <><Bot className="w-3.5 h-3.5 text-sky-400" aria-hidden /> Automation</>}
            </span>
            {pendingInput?.file?.name && (
              <span className="flex items-center gap-1.5 min-w-0">
                <FileText className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" aria-hidden />
                <span className="truncate max-w-[180px] font-mono text-slate-400" title={pendingInput.file.name}>
                  {pendingInput.file.name}
                </span>
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
              <SecondaryButton onClick={handleReset} title="Clear the form and start a new test" className="bg-transparent">
                <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                New test
              </SecondaryButton>
              <SecondaryButton onClick={() => setConfigCollapsed(false)}>
                <Pencil className="w-3.5 h-3.5" aria-hidden />
                Edit configuration
              </SecondaryButton>
            </div>
          </div>
        ) : (
        <div className="bg-surface-800/50 border border-surface-700 rounded-xl p-4 sm:p-5 space-y-5">
          {/* Stage stepper */}
          <div className="flex items-center justify-between gap-2">
            <ol className="flex items-center gap-2" aria-label="Progress">
              {stageList.map((s, i) => {
                const done = i < stageIdx;
                const current = stage === s;
                return (
                  <li key={s} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
                    {i > 0 && <span className={clsx("w-5 h-px", done || current ? "bg-sky-500/40" : "bg-surface-600")} aria-hidden />}
                    <span className={clsx(
                      "flex items-center gap-1.5 text-[11px] font-medium transition-colors",
                      current ? "text-sky-300" : done ? "text-emerald-400" : "text-slate-500"
                    )}>
                      <span className={clsx(
                        "w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-semibold border tabular-nums",
                        current ? "border-sky-500/50 bg-sky-500/15" : done ? "border-emerald-500/40 bg-emerald-500/15" : "border-surface-500"
                      )}>
                        {done ? <Check className="w-2.5 h-2.5" aria-hidden /> : i + 1}
                      </span>
                      {s === "configure" ? "Configure" : s === "generated" ? "Generate" : "Execute"}
                    </span>
                  </li>
                );
              })}
            </ol>
            {(genResult || stdResult) && (
              <SecondaryButton
                onClick={() => setConfigCollapsed(true)}
                title="Minimize back into the summary bar"
                className="bg-transparent border-transparent"
              >
                <ChevronUp className="w-3.5 h-3.5" aria-hidden />
                <span className="hidden sm:inline">Collapse</span>
              </SecondaryButton>
            )}
          </div>

          {/* Feature Name + Mode Toggle */}
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="w-full sm:max-w-md min-w-0">
              <FeatureNameInput
                value={featureName}
                onChange={handleFeatureNameChange}
                onSave={handleSaveFeatureName}
                isSaved={featureNameSaved}
                error={featureNameError}
              />
            </div>
            {featureNameSaved && (
              <div className="w-full lg:w-72 flex-shrink-0">
                <GeneratorModeToggle
                  value={generatorMode}
                  onChange={(v) => {
                    setGeneratorMode(v);
                    setGenResult(null);
                    setStdResult(null);
                    setGenError(null);
                    setStdError(null);
                    setStage("configure");
                    setConfigCollapsed(false);
                    resetExecutionState();
                  }}
                />
              </div>
            )}
          </div>

          {/* Input Type + Dropzone — only show once feature name is saved */}
          {featureNameSaved && (
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="w-full lg:w-56 flex-shrink-0">
                <InputTypeToggle value={inputType} onChange={(v) => { setInputType(v); setPendingInput(null); setUserStories([]); }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={FIELD_LABEL}>
                  <Upload className="w-3 h-3" aria-hidden />
                  {inputType === "swagger" ? "Swagger / OpenAPI Spec" : "PRD Document"}
                </p>
                <InputArea
                  key={formKey}
                  inputType={inputType}
                  onReady={handleInputReady}
                  isLoading={false}
                />
              </div>
            </div>
          )}

          {/* User stories preview (PRD mode) */}
          {featureNameSaved && inputType === "prd" && userStories.length > 0 && (
            <div>
              <p className={FIELD_LABEL}>
                Detected Stories <span className="tabular-nums text-slate-500">({userStories.length})</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {userStories.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveStoryId(s.id)}
                    title={s.title}
                    aria-pressed={activeStoryId === s.id}
                    className={clsx(
                      "pressable text-left text-xs px-2.5 py-1.5 rounded-lg border truncate max-w-[220px]",
                      FOCUS_RING,
                      activeStoryId === s.id
                        ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                        : "border-surface-600 bg-surface-800 text-slate-400 hover:text-slate-200 hover:border-surface-500"
                    )}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Generate button — only show once feature name is saved */}
          {featureNameSaved && (
            <div className="pt-4 border-t border-surface-700 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {savedAs && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 h-8 flex-shrink-0">
                    <Save className="w-3 h-3 flex-shrink-0" aria-hidden />
                    <span className="max-w-[200px] truncate font-mono" title={`${featureSlug}/${savedAs}`}>{featureSlug}/{savedAs}</span>
                  </div>
                )}
                <div className="flex gap-2 flex-1">
                  {generatorMode === "manual-std" ? (
                    <PrimaryButton
                      onClick={handleGenerateStd}
                      loading={isGeneratingStd}
                      icon={ClipboardList}
                      accent="emerald"
                      className="flex-1 sm:flex-none"
                    >
                      {isGeneratingStd ? "Generating STD…" : "Generate Manual STD"}
                    </PrimaryButton>
                  ) : (
                    <PrimaryButton
                      onClick={handleGenerate}
                      loading={isGenerating}
                      icon={Sparkles}
                      accent={inputType === "swagger" ? "violet" : "sky"}
                      className="flex-1 sm:flex-none"
                    >
                      {isGenerating ? "Generating…" : inputType === "swagger" ? "Generate API Tests" : "Generate UI Tests"}
                    </PrimaryButton>
                  )}
                  <SecondaryButton
                    onClick={handleReset}
                    title="Clear the form and start a new test"
                    aria-label="New test"
                    className="h-10 px-3.5 flex-shrink-0"
                  >
                    <RotateCcw className="w-4 h-4" aria-hidden />
                    <span className="hidden sm:inline">New Test</span>
                  </SecondaryButton>
                </div>
              </div>
              {(generatorMode === "manual-std" ? stdError : genError) && (
                <p role="alert" className="text-xs text-red-400 flex items-start gap-1.5 animate-fade-in">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden /> {generatorMode === "manual-std" ? stdError : genError}
                </p>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {/* ── Bottom: full-width results canvas ── */}
      <div className="qa-main-pane overflow-visible p-4 sm:p-6 pt-0 pb-20 gap-4 flex flex-col min-w-0">
        {generatorMode === "manual-std" ? (
          <>
            {!stdResult && !isGeneratingStd && (
              <EmptyState
                icon={ClipboardList}
                accent="emerald"
                title="No STD generated yet"
                description="Enter a feature name, provide a PRD or Swagger spec, and click Generate Manual STD to create an STD table."
                hint="Follow the steps above: Configure → Generate."
              />
            )}

            {isGeneratingStd && (
              <GeneratingStatus
                tone="emerald"
                title="Generating Manual STD…"
                detail="Detecting hidden requirements · Applying mandatory category coverage · Domain adaptation"
              >
                <div className="rounded-xl border border-surface-700 overflow-hidden">
                  <div className="flex gap-4 px-4 py-3 bg-surface-800/60 border-b border-surface-700">
                    {[10, 28, 18, 30, 14].map((w, i) => <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />)}
                  </div>
                  {Array.from({ length: 5 }).map((_, r) => (
                    <div key={r} className="flex gap-4 px-4 py-3.5 border-b border-surface-700/60 last:border-0" style={{ opacity: 1 - r * 0.15 }}>
                      {[10, 28, 18, 30, 14].map((w, i) => <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />)}
                    </div>
                  ))}
                </div>
              </GeneratingStatus>
            )}

            {stdResult && !isGeneratingStd && (
              <ManualStdTable
                testCases={stdResult.testCases}
                coverage={stdResult.coverage}
                featureName={featureName.trim() || "feature"}
                domain={stdResult.domain}
                model={stdResult.model}
                isMock={stdResult.isMock}
              />
            )}
          </>
        ) : (
        <>
        {!genResult && !isGenerating && (
          <EmptyState
            icon={FileCode2}
            accent="sky"
            title="No tests generated yet"
            description={
              inputType === "swagger"
                ? "Provide an OpenAPI spec and click Generate API Tests to create integration tests."
                : "Enter a feature name, upload a PRD, and click Generate UI Tests to create Playwright tests."
            }
            hint="Follow the steps above: Configure → Generate → Execute."
          />
        )}

        {isGenerating && (
          <GeneratingStatus
            tone={inputType === "swagger" ? "violet" : "sky"}
            title={inputType === "swagger" ? "Generating API integration tests…" : "Generating UI tests…"}
            detail={inputType === "swagger"
              ? "Parsing endpoints · Creating request/response assertions"
              : "Applying Page Object Model · industry-standard locators"}
          >
            <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4">
              <EditorSkeleton />
              <div className="hidden lg:block h-[70vh] min-h-[420px] rounded-lg border border-dashed border-surface-700 bg-surface-900/40" />
            </div>
          </GeneratingStatus>
        )}

        {genResult && !isGenerating && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h2 className="text-sm font-semibold text-slate-100 mr-1">Generated Tests</h2>
                <Badge tone={inputType === "swagger" ? "accent" : "info"}>{inputType === "swagger" ? "API" : "UI"}</Badge>
                {genResult.isMock
                  ? <Badge tone="warning">Mock</Badge>
                  : <Badge tone="neutral" className="normal-case font-mono tracking-normal">{genResult.model}</Badge>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 self-start sm:self-auto">
                {isRunning ? (
                  <>
                    <span role="status" className="flex items-center gap-2 h-9 px-4 bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-sm font-medium select-none">
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                      Running…
                    </span>
                    <IconButton
                      icon={Square}
                      label="Stop run"
                      tone="danger"
                      onClick={stopTest}
                      className="w-9 h-9 text-red-400 bg-red-500/10 border border-red-500/25"
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleRun}
                    className={clsx("pressable flex items-center gap-2 h-9 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium shadow-sm shadow-black/30 ring-1 ring-inset ring-white/10", FOCUS_RING)}
                  >
                    <Play className="w-4 h-4 fill-white" aria-hidden />
                    Run Test
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4 pb-6">
              <div className="h-[70vh] min-h-[420px]">
                <Suspense
                  fallback={<EditorSkeleton />}
                >
                  <TestEditor
                    code={editedCode}
                    onChange={setEditedCode}
                    fileName={savedAs ?? "generated.spec.ts"}
                  />
                </Suspense>
              </div>
              <div className="flex flex-col gap-3">
                {showExecutionPanel ? (
                  <>
                    <div className="h-[70vh] min-h-[420px]">
                      <ExecutionConsole
                        output={output}
                        result={runResult}
                        isRunning={isRunning}
                        progress={progress}
                        statusMessage={statusMessage}
                      />
                    </div>
                    {runResult?.status === "failed" && !isRunning && Boolean(runResult?.cloudRunId) && (
                      <div className="flex-shrink-0 max-h-[260px]">
                        <ArtifactsGallery
                          key={runResult.cloudRunId}
                          cloudRunId={runResult.cloudRunId}
                          htmlUrl={runResult.htmlUrl}
                          enabled={true}
                          layout="row"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-[70vh] min-h-[420px] flex items-center justify-center rounded-lg border border-dashed border-surface-700 bg-surface-900/40 px-6">
                    <EmptyState
                      icon={Play}
                      accent="emerald"
                      title="Ready to run"
                      description="Your new tests are generated. Click Run Test above to execute them and see live output here."
                      compact
                    />
                  </div>
                )}
              </div>
            </div>

            {showFailureAnalyzer && (
              <div ref={failureRef}>
                <FailureAnalyzer
                  errorDetails={runResult?.errorDetails ?? ""}
                  failureLog={getActionableFailureLogs(runResult, output)}
                  testCode={editedCode}
                  hasCoralogix={!!user?.hasCoralogix}
                  onAnalyze={handleAnalyze}
                  onAnalyzeWithGitHubLogs={handleAnalyzeWithGitHubLogs}
                  onOpenSettings={handleOpenSettingsFromFailure}
                  onSelfHeal={handleSelfHeal}
                  isAnalyzing={isAnalyzing}
                  mcpSteps={mcpSteps}
                  analysis={analysis}
                />
              </div>
            )}
          </>
        )}
        </>
        )}
      </div>

      <SelfHealModal
        open={selfHealOpen}
        onClose={() => setSelfHealOpen(false)}
        testCode={editedCode}
        errorOutput={getActionableFailureLogs(runResult, output)}
        rootCause={analysis?.rootCause}
        suggestedFix={analysis?.suggestedFix}
        featureSlug={featureSlug ?? undefined}
        fileName={savedAs ?? undefined}
        onSaved={() => setSelfHealOpen(false)}
      />
    </div>
  );
}
