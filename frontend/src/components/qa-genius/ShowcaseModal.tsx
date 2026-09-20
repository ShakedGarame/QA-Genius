import { useEffect, useRef, useState } from "react";
import { Share2, Loader2, Ban, ExternalLink } from "lucide-react";
import { ShowcaseLinkRecord } from "../../types";
import { CopyButton } from "../ui/FullscreenModal";
import Modal from "../ui/Modal";

export type ShowcasePublishRequest =
  | { artifactType: "manual_std"; sourceId: string }
  | { artifactType: "feature_test"; featureSlug: string; fileName: string };

interface ShowcaseModalProps {
  /** Display name shown in the confirmation copy — the STD's or feature's name. */
  title: string;
  publish: ShowcasePublishRequest;
  onClose: () => void;
}

/** Publishes (or reuses) a public, no-login showcase link for a Manual STD or a
 * generated test file — a "case study" URL anyone can open without signing into
 * the app. */
export default function ShowcaseModal({ title, publish, onClose }: ShowcaseModalProps) {
  const [link, setLink] = useState<ShowcaseLinkRecord | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // POST /api/showcase isn't idempotent — a duplicate call publishes a second,
  // orphaned link. hasFiredRef guards against React StrictMode's dev-only
  // double-invoke of the effect below, so the fetch fires exactly once ever.
  //
  // isMountedRef (tracked by its own effect, not tied to this one's cleanup)
  // is what the fetch's .then/.catch/.finally check before calling setState.
  // A naive per-invocation `cancelled` closure doesn't work together with
  // hasFiredRef: StrictMode's phantom mount→cleanup→remount runs synchronously,
  // so if hasFiredRef blocks the second invocation, the FIRST invocation's
  // cleanup still fires (marking its own `cancelled` true) — permanently
  // suppressing the one real fetch's result even though the request itself
  // succeeded server-side. isMountedRef sidesteps this: it's flipped back to
  // true by the second (phantom-remount) invocation of the mount-tracking
  // effect well before any real network response can arrive, and only stays
  // false after a genuine, lasting unmount (e.g. the user closes the modal).
  const hasFiredRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (hasFiredRef.current) return;
    hasFiredRef.current = true;
    setIsPublishing(true);
    setError(null);
    fetch("/api/showcase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(publish),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to publish showcase link");
        if (isMountedRef.current) setLink(json.showcaseLink as ShowcaseLinkRecord);
      })
      .catch((e) => {
        if (isMountedRef.current) setError(e instanceof Error ? e.message : "Failed to publish showcase link");
      })
      .finally(() => {
        if (isMountedRef.current) setIsPublishing(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `publish` is a fresh object each render; the fire-once ref above is the real guard.
  }, []);

  const handleRevoke = async () => {
    if (!link) return;
    setIsRevoking(true);
    try {
      const res = await fetch(`/api/showcase/${encodeURIComponent(link.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to revoke link");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke link");
    } finally {
      setIsRevoking(false);
    }
  };

  const publicUrl = link ? `${window.location.origin}/showcase/${link.slug}` : "";

  // The publish POST above isn't idempotent — closing (Escape, backdrop
  // click, or the header's X, all of which route through Modal's onClose)
  // while it's still in flight would unmount this component, and reopening
  // the dialog fires a second POST, publishing an orphaned duplicate link.
  const handleClose = () => {
    if (isPublishing) return;
    onClose();
  };

  return (
    <Modal open onClose={handleClose} title="Share Showcase Link" icon={Share2}>
      <p className="text-xs text-slate-400 leading-relaxed">
        Anyone with this link can view a read-only page of <span className="text-slate-200">{title}</span>{" "}
        — no login required. They won't see any other data in your account.
      </p>

      {isPublishing && (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Publishing…
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {link && !isPublishing && (
        <>
          <div className="flex items-center gap-2 bg-surface-900 border border-surface-600 rounded-lg px-3 py-2.5">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-0 truncate text-sm font-mono text-sky-400 hover:text-sky-300"
            >
              {publicUrl}
            </a>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in new tab"
              className="p-1 rounded text-slate-400 hover:text-slate-200 flex-shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <CopyButton text={publicUrl} />
          </div>

          <button
            type="button"
            onClick={handleRevoke}
            disabled={isRevoking}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
          >
            {isRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
            Revoke this link
          </button>
        </>
      )}
    </Modal>
  );
}
