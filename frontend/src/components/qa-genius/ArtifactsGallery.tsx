import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, ImageIcon, Loader2, Package, RefreshCw, X, ZoomIn } from "lucide-react";
import clsx from "clsx";
import { fetchRunArtifacts } from "../../lib/artifacts";
import type { RunArtifactGallery } from "../../types";

// ── Lightbox ──────────────────────────────────────────────────────────────────

interface LightboxProps {
  src: string;
  name: string;
  onClose: () => void;
}

function Lightbox({ src, name, onClose }: LightboxProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      {/* Stop click from propagating so clicking the image itself doesn't close */}
      <div
        className="relative max-w-4xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 flex items-center gap-1.5 text-slate-300 hover:text-white text-sm transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
          <span>Close</span>
        </button>

        {/* Screenshot filename */}
        <p className="absolute -top-10 left-0 text-slate-400 text-xs font-mono truncate max-w-[70%]">
          {name}
        </p>

        {/* Full-res image */}
        <img
          src={src}
          alt={name}
          className="w-full h-auto rounded-lg shadow-2xl border border-white/10"
        />
      </div>
    </div>,
    document.body
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ArtifactsGalleryProps {
  cloudRunId?: number;
  htmlUrl?: string;
  enabled: boolean;
  /** "col" = full-height panel beside terminal (Repository), "row" = compact strip below terminal (Generator) */
  layout?: "col" | "row";
}

export default function ArtifactsGallery({
  cloudRunId,
  htmlUrl,
  enabled,
  layout = "col",
}: ArtifactsGalleryProps) {
  const [gallery, setGallery] = useState<RunArtifactGallery | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedShot, setSelectedShot] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!cloudRunId) return;
    console.log("[ArtifactsGallery] Fetching artifacts for cloudRunId:", cloudRunId);
    setLoading(true);
    const data = await fetchRunArtifacts(cloudRunId);
    console.log("[ArtifactsGallery] Result:", data);
    setGallery(data);
    setSelectedShot((prev) => prev ?? data?.screenshots[0]?.dataUrl ?? null);
    setLoading(false);
  }, [cloudRunId]);

  // Auto-retry every 10 s up to 6 attempts (≈1 minute) while no screenshots found
  useEffect(() => {
    if (!enabled || !cloudRunId) {
      setGallery(null);
      setSelectedShot(null);
      setLightbox(null);
      setAttempt(0);
      return;
    }

    void load();

    const schedule = (n: number) => {
      if (n >= 6) return;
      timerRef.current = setTimeout(async () => {
        const data = await fetchRunArtifacts(cloudRunId);
        setGallery((prev) => {
          if (prev?.screenshots.length) return prev;
          setSelectedShot(data?.screenshots[0]?.dataUrl ?? null);
          return data;
        });
        setAttempt(n + 1);
        if (!data?.screenshots.length) schedule(n + 1);
      }, 10_000);
    };

    schedule(0);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, cloudRunId, load]);

  if (!enabled) return null;

  const hasScreenshots = (gallery?.screenshots.length ?? 0) > 0;
  const hasArtifacts = (gallery?.artifacts.length ?? 0) > 0;

  const openLightbox = (src: string, name: string) => setLightbox({ src, name });
  const closeLightbox = () => setLightbox(null);

  // ── Row layout (below terminal in Generator) ────────────────────────────────
  if (layout === "row") {
    return (
      <>
        {lightbox && <Lightbox src={lightbox.src} name={lightbox.name} onClose={closeLightbox} />}

        <div className="rounded-xl border border-surface-600 bg-surface-800/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-surface-700 bg-surface-800">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                Artifacts &amp; Gallery
              </span>
              {loading && <Loader2 className="w-3 h-3 animate-spin text-slate-500" />}
              {!hasScreenshots && !loading && attempt > 0 && (
                <span className="text-[10px] text-slate-600">({attempt}/6 checks)</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {htmlUrl && (
                <a
                  href={htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300"
                >
                  GitHub run <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                type="button"
                onClick={() => void load()}
                className="p-1 rounded hover:bg-surface-700 text-slate-500 hover:text-slate-300 transition-colors"
                title="Refresh artifacts"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="p-3">
            {!hasScreenshots && !loading && (
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <Package className="w-5 h-5 opacity-30 flex-shrink-0" />
                <span>
                  {hasArtifacts
                    ? "Artifact found but contains no PNG screenshots yet — GitHub may still be zipping."
                    : "Artifacts not uploaded yet — GitHub Actions uploads them ~10-30s after failure."}
                </span>
              </div>
            )}

            {hasArtifacts && !hasScreenshots && (
              <ul className="mt-2 space-y-1">
                {gallery!.artifacts.map((a) => (
                  <li key={a.id} className="text-[10px] font-mono text-slate-500 truncate">
                    📦 {a.name} · {(a.sizeBytes / 1024).toFixed(1)} KB
                  </li>
                ))}
              </ul>
            )}

            {hasScreenshots && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {gallery!.screenshots.map((shot) => (
                  <button
                    key={shot.name}
                    type="button"
                    onClick={() => openLightbox(shot.dataUrl, shot.name)}
                    className={clsx(
                      "group relative flex-shrink-0 rounded-lg border overflow-hidden transition-all cursor-zoom-in",
                      "w-40 h-28 bg-surface-950",
                      "border-surface-600 hover:border-violet-500/70 hover:ring-1 hover:ring-violet-500/30"
                    )}
                    title={`Click to enlarge: ${shot.name}`}
                  >
                    <img
                      src={shot.dataUrl}
                      alt={shot.name}
                      className="w-full h-full object-contain bg-black/30"
                    />
                    {/* Zoom hint overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                      <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ── Col layout (side panel in Repository) ───────────────────────────────────
  return (
    <>
      {lightbox && <Lightbox src={lightbox.src} name={lightbox.name} onClose={closeLightbox} />}

      <div className="flex flex-col h-full border-l border-surface-600 bg-surface-900/60 min-w-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-surface-700 bg-surface-800/40">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
              Artifacts &amp; Gallery
            </span>
            {loading && <Loader2 className="w-3 h-3 animate-spin text-slate-600" />}
          </div>
          <div className="flex items-center gap-2">
            {htmlUrl && (
              <a
                href={htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300"
              >
                GitHub run <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              type="button"
              onClick={() => void load()}
              className="p-1 rounded hover:bg-surface-700 text-slate-600 hover:text-slate-300"
              title="Refresh"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-3">
          {loading && !hasScreenshots && (
            <div className="flex items-center justify-center py-8 text-slate-500 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching failure artifacts…
            </div>
          )}

          {!loading && !hasScreenshots && (
            <div className="flex flex-col items-center justify-center py-6 text-slate-600 text-xs gap-2 text-center px-2">
              <Package className="w-8 h-8 opacity-30" />
              <p>No failure screenshots yet.</p>
              <p className="text-[10px]">
                {hasArtifacts
                  ? "Artifact found — still extracting PNGs…"
                  : `GitHub uploads artifacts ~10-30s after failure. Auto-checking (${attempt}/6)…`}
              </p>
              {hasArtifacts && (
                <ul className="mt-1 space-y-0.5 text-left w-full">
                  {gallery!.artifacts.map((a) => (
                    <li key={a.id} className="text-[10px] font-mono text-slate-500 truncate">
                      📦 {a.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Main selected screenshot — clickable to open lightbox */}
          {selectedShot && (
            <button
              type="button"
              onClick={() => {
                const shot = gallery?.screenshots.find((s) => s.dataUrl === selectedShot);
                openLightbox(selectedShot, shot?.name ?? "screenshot");
              }}
              className="group relative w-full rounded-lg border border-surface-600 overflow-hidden bg-surface-950 cursor-zoom-in hover:border-violet-500/50 transition-colors"
            >
              <img
                src={selectedShot}
                alt="Failure screenshot"
                className="w-full h-auto max-h-[220px] object-contain bg-black/40"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                <ZoomIn className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
            </button>
          )}

          {/* Thumbnails strip for multiple screenshots */}
          {hasScreenshots && gallery!.screenshots.length > 1 && (
            <div className="grid grid-cols-3 gap-2">
              {gallery!.screenshots.map((shot) => (
                <button
                  key={shot.name}
                  type="button"
                  onClick={() => {
                    setSelectedShot(shot.dataUrl);
                    openLightbox(shot.dataUrl, shot.name);
                  }}
                  className={clsx(
                    "group relative rounded border overflow-hidden aspect-video bg-surface-950",
                    "hover:border-violet-500/50 transition-colors cursor-zoom-in",
                    selectedShot === shot.dataUrl
                      ? "border-violet-500 ring-1 ring-violet-500/40"
                      : "border-surface-600"
                  )}
                  title={shot.name}
                >
                  <img src={shot.dataUrl} alt={shot.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                    <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {hasArtifacts && (
            <div className="pt-2 border-t border-surface-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Uploaded bundles</p>
              <ul className="space-y-1">
                {gallery!.artifacts.map((a) => (
                  <li key={a.id} className="text-[10px] font-mono text-slate-400 truncate">
                    {a.name} · {(a.sizeBytes / 1024).toFixed(1)} KB
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
