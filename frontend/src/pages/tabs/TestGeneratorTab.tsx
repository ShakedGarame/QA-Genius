import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Play, Loader2, Sparkles, FileCode2, AlertCircle,
  CheckCircle2, RotateCcw, Save, Upload, FileText,
  Code2, Globe, Tag, X,
} from "lucide-react";
import clsx from "clsx";
import StoryPanel from "../../components/qa-genius/StoryPanel";
import TestEditor from "../../components/qa-genius/TestEditor";
import ExecutionConsole from "../../components/qa-genius/ExecutionConsole";
import FailureAnalyzer from "../../components/qa-genius/FailureAnalyzer";
import { useTestRunner } from "../../hooks/useTestRunner";
import { buildOpenAIKeyHeaders } from "../../lib/apiKeys";
import { ParsedPrd, GenerateTestsResult, UserStory, InputType } from "../../types";

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
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        <Tag className="w-3 h-3" /> Feature Name *
      </label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && onSave()}
          placeholder="e.g. Authentication, Shopping Cart…"
          className={clsx(
            "flex-1 bg-surface-700 border rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500",
            "focus:outline-none focus:ring-1 focus:ring-sky-500",
            error ? "border-red-500/60" : isSaved ? "border-emerald-500/50" : "border-surface-500 focus:border-sky-500"
          )}
        />
        <button
          onClick={onSave}
          disabled={!value.trim() || isSaved}
          title={isSaved ? "Feature name saved" : "Save feature name"}
          className={clsx(
            "flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
            isSaved
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
              : "bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
          )}
        >
          {isSaved
            ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</>
            : <><Save className="w-3.5 h-3.5" /> Save</>
          }
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      {!isSaved && (
        <p className="text-[10px] text-slate-600 mt-1">
          Save the feature name before configuring inputs
        </p>
      )}
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-surface-700 border border-surface-500 rounded-lg shadow-xl overflow-hidden">
          {filtered.slice(0, 5).map((s) => (
            <button
              key={s}
              onMouseDown={() => { onChange(s); }}
              className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-surface-600 hover:text-white transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
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
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        <Code2 className="w-3 h-3" /> Test Type
      </label>
      <div className="flex gap-1 p-1 bg-surface-700 rounded-lg">
        <button
          onClick={() => onChange("prd")}
          className={clsx(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all",
            value === "prd"
              ? "bg-sky-600 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <FileText className="w-3.5 h-3.5" /> UI Tests (PRD)
        </button>
        <button
          onClick={() => onChange("swagger")}
          className={clsx(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all",
            value === "swagger"
              ? "bg-violet-600 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Globe className="w-3.5 h-3.5" /> API Tests (Swagger)
        </button>
      </div>
      <p className="text-[10px] text-slate-600 mt-1">
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
      // Parse user stories client-side for immediate display
      onReady({ prdText: pasteText });
    }
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

  return (
    <div className="space-y-3">
      <div className="flex gap-1 p-0.5 bg-surface-700 rounded-lg w-fit">
        {(["upload", "paste"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-3 py-1 rounded-md text-xs font-medium transition-all",
              tab === t ? "bg-surface-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
            )}
          >
            {t === "upload" ? `Upload ${formats}` : "Paste Text"}
          </button>
        ))}
      </div>

      {tab === "upload" ? (
        <div
          {...getRootProps()}
          className={clsx(
            "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
            isDragActive
              ? inputType === "swagger" ? "border-violet-500 bg-violet-500/10" : "border-sky-500 bg-sky-500/10"
              : "border-surface-500 hover:border-surface-400 bg-surface-800/50"
          )}
        >
          <input {...getInputProps()} />
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
              <p className="text-xs text-slate-300">Parsing…</p>
            </div>
          ) : uploadedFile ? (
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              <p className="text-sm text-white">{uploadedFile.name}</p>
              <button
                onClick={(e) => { e.stopPropagation(); setUploadedFile(null); }}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-7 h-7 text-slate-500" />
              <p className="text-sm text-slate-400">
                {isDragActive ? "Drop it!" : `Drag & drop ${formats}`}
              </p>
              <p className="text-xs text-slate-600">or click to browse · max 10 MB</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={placeholder}
            rows={8}
            className="w-full bg-surface-800 border border-surface-600 rounded-lg px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono resize-none"
          />
          <button
            onClick={handlePasteSubmit}
            disabled={!pasteText.trim() || isLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            Parse
          </button>
        </div>
      )}

      {fileError && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <X className="w-3.5 h-3.5" /> {fileError}
        </p>
      )}
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
  const [stage, setStage] = useState<Stage>("configure");
  const [editedCode, setEditedCode] = useState("");
  const [savedAs, setSavedAs] = useState<string | null>(null);
  const [featureSlug, setFeatureSlug] = useState<string | null>(null);
  const [userStories, setUserStories] = useState<UserStory[]>([]);
  const [activeStoryId, setActiveStoryId] = useState<string | undefined>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  // Pending input data
  const [pendingInput, setPendingInput] = useState<{
    prdText?: string;
    swaggerContent?: string;
    file?: File;
  } | null>(null);

  const {
    isRunning, output, progress, statusMessage, result: runResult,
    runTest, isAnalyzing, mcpSteps, analysis, analyzeFailure,
  } = useTestRunner();

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

    if (!pendingInput && !editedCode) {
      setGenError("Please provide a PRD or Swagger file / text first");
      return;
    }

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

      const res = await fetch("/api/generate-tests", {
        method: "POST",
        credentials: "include",
        headers: buildOpenAIKeyHeaders(),
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Generation failed");

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

  const handleRun = async () => {
    const code = editedCode || genResult?.code || "";
    if (!code) return;
    await runTest(code);
    setStage("executed");
  };

  const handleAnalyze = async () => {
    const code = editedCode || genResult?.code || "";
    const err = runResult?.errorDetails ?? output;
    await analyzeFailure(code, err);
  };

  const handleReset = () => {
    setStage("configure");
    setEditedCode("");
    setSavedAs(null);
    setFeatureSlug(null);
    setGenResult(null);
    setGenError(null);
    setPendingInput(null);
    setUserStories([]);
    setFeatureName("");
    setFeatureNameSaved(false);
    setFeatureNameError("");
  };

  const showFailureAnalyzer = stage === "executed" && runResult?.status === "failed" && !isRunning;

  const stageList: Stage[] = ["configure", "generated", "executed"];
  const stageIdx = stageList.indexOf(stage);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Left config panel ── */}
      <div className="w-80 flex-shrink-0 border-r border-surface-600 flex flex-col bg-surface-800/30">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Stage breadcrumb */}
          <div className="flex items-center gap-1">
            {stageList.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                {i > 0 && <div className="w-3 h-px bg-surface-500" />}
                <span className={clsx(
                  "text-[10px] px-1.5 py-0.5 rounded",
                  stage === s ? "bg-sky-500/20 text-sky-300" : i < stageIdx ? "text-emerald-400" : "text-slate-600"
                )}>
                  {i < stageIdx && <CheckCircle2 className="w-2.5 h-2.5 inline mr-0.5" />}
                  {s === "configure" ? "1.Configure" : s === "generated" ? "2.Generate" : "3.Execute"}
                </span>
              </div>
            ))}
          </div>

          {/* Feature Name */}
          <FeatureNameInput
            value={featureName}
            onChange={handleFeatureNameChange}
            onSave={handleSaveFeatureName}
            isSaved={featureNameSaved}
            error={featureNameError}
          />

          {/* Input Type — only show once feature name is saved */}
          {featureNameSaved && (
          <InputTypeToggle value={inputType} onChange={(v) => { setInputType(v); setPendingInput(null); setUserStories([]); }} />
          )}

          {/* Input area — only show once feature name is saved */}
          {featureNameSaved && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              <Upload className="w-3 h-3" />
              {inputType === "swagger" ? "Swagger / OpenAPI Spec" : "PRD Document"}
            </label>
            <InputArea
              inputType={inputType}
              onReady={handleInputReady}
              isLoading={false}
            />
          </div>
          )}

          {/* User stories preview (PRD mode) */}
          {featureNameSaved && inputType === "prd" && userStories.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Detected Stories ({userStories.length})
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {userStories.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveStoryId(s.id)}
                    className={clsx(
                      "w-full text-left text-xs px-2 py-1.5 rounded border transition-all truncate",
                      activeStoryId === s.id
                        ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                        : "border-surface-600 bg-surface-800 text-slate-400 hover:text-slate-200"
                    )}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Generate button — only show once feature name is saved */}
        {featureNameSaved && <div className="p-4 border-t border-surface-600 space-y-2 flex-shrink-0">
          {savedAs && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2.5 py-1.5">
              <Save className="w-3 h-3 flex-shrink-0" />
              <span className="truncate font-mono">{featureSlug}/{savedAs}</span>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={clsx(
                "flex-1 flex items-center justify-center gap-2 py-2.5 text-white rounded-lg text-sm font-medium shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                inputType === "swagger"
                  ? "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500"
                  : "bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500"
              )}
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGenerating ? "Generating…" : inputType === "swagger" ? "Generate API Tests" : "Generate UI Tests"}
            </button>
            {genResult && (
              <button
                onClick={handleReset}
                title="Start over"
                className="p-2.5 bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
          {genError && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {genError}
            </p>
          )}
        </div>}
      </div>

      {/* ── Right area: editor + console ── */}
      <div className="flex-1 min-w-0 flex flex-col p-4 gap-4 overflow-auto">
        {!genResult && !isGenerating && (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-600 space-y-3">
            <FileCode2 className="w-14 h-14 opacity-20" />
            <div>
              <p className="text-slate-500 font-medium">No tests generated yet</p>
              <p className="text-sm mt-1">
                {inputType === "swagger"
                  ? "Provide an OpenAPI spec and click Generate API Tests"
                  : "Enter a Feature Name, upload a PRD, and click Generate UI Tests"}
              </p>
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
            <div className={clsx(
              "w-14 h-14 rounded-full border flex items-center justify-center",
              inputType === "swagger" ? "bg-violet-500/10 border-violet-500/20" : "bg-sky-500/10 border-sky-500/20"
            )}>
              <Sparkles className={clsx("w-6 h-6 animate-pulse", inputType === "swagger" ? "text-violet-400" : "text-sky-400")} />
            </div>
            <div>
              <p className="text-slate-200 font-medium">
                {inputType === "swagger" ? "Generating API integration tests…" : "Generating UI tests…"}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {inputType === "swagger"
                  ? "Parsing endpoints · Creating request/response assertions"
                  : "Applying Page Object Model · industry-standard locators"}
              </p>
            </div>
          </div>
        )}

        {genResult && !isGenerating && (
          <>
            <div className="flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Generated Tests</span>
                <span className={clsx(
                  "text-[10px] px-2 py-0.5 rounded-full border font-mono",
                  genResult.isMock
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                )}>
                  {genResult.isMock ? "MOCK" : genResult.model}
                </span>
                <span className={clsx(
                  "text-[10px] px-2 py-0.5 rounded-full border",
                  inputType === "swagger"
                    ? "bg-violet-500/10 text-violet-400 border-violet-500/30"
                    : "bg-sky-500/10 text-sky-400 border-sky-500/30"
                )}>
                  {inputType === "swagger" ? "API" : "UI"}
                </span>
              </div>
              <button
                onClick={handleRun}
                disabled={isRunning}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                {isRunning ? "Running…" : "Run Test"}
              </button>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-2 gap-4" style={{ minHeight: "400px" }}>
              <TestEditor
                code={editedCode}
                onChange={setEditedCode}
                fileName={savedAs ?? "generated.spec.ts"}
              />
              <ExecutionConsole
                output={output}
                result={runResult}
                isRunning={isRunning}
                progress={progress}
                statusMessage={statusMessage}
              />
            </div>

            {showFailureAnalyzer && (
              <FailureAnalyzer
                errorDetails={runResult?.errorDetails ?? ""}
                testCode={editedCode}
                onAnalyze={handleAnalyze}
                isAnalyzing={isAnalyzing}
                mcpSteps={mcpSteps}
                analysis={analysis}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
