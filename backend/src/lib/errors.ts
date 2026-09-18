import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import type { Request, Response } from "express";
import type { DbUser } from "../db.js";

/** Thrown intentionally by route logic when the message is already safe to show the client. */
export class AppError extends Error {
  statusCode: number;
  safeMessage: string;

  constructor(statusCode: number, safeMessage: string) {
    super(safeMessage);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.safeMessage = safeMessage;
  }
}

interface NormalizedError {
  status: number;
  safeMessage: string;
  errorType: string;
}

function isSdkErrorShape(err: unknown): err is { status?: number; code?: string } {
  return typeof err === "object" && err !== null && ("status" in err || "code" in err);
}

/** Maps any thrown value to a status code + client-safe message. Never returns the raw
 * internal error message for Prisma/unknown errors — only AppError and Zod messages
 * (already user-facing) pass through as-is. */
export function normalizeError(err: unknown): NormalizedError {
  if (err instanceof AppError) {
    return { status: err.statusCode, safeMessage: err.safeMessage, errorType: "AppError" };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      safeMessage: err.issues.map((issue) => issue.message).join(", "),
      errorType: "ZodError",
    };
  }
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientValidationError
  ) {
    return { status: 500, safeMessage: "Database error, please try again", errorType: "PrismaError" };
  }
  if (isSdkErrorShape(err) && typeof err.status === "number") {
    const isRateLimited = err.status === 429;
    return {
      status: isRateLimited ? 429 : 502,
      safeMessage: "AI service temporarily unavailable, please try again",
      errorType: "LlmSdkError",
    };
  }
  return { status: 500, safeMessage: "Internal server error", errorType: "UnknownError" };
}

/** Writes one structured JSON log line with the full (server-side-only) error detail,
 * keyed by the request's correlation id. */
export function logError(req: Request, err: unknown, errorType?: string): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const userId = (req.user as DbUser | undefined)?.id;
  console.error(
    JSON.stringify({
      requestId: req.id,
      method: req.method,
      path: req.path,
      userId,
      errorType: errorType ?? normalizeError(err).errorType,
      message,
      stack,
    })
  );
}

/** Logs the full error and sends the client a safe JSON error response.
 * Pass `overrides` to keep an existing route's specific status/message (e.g. a 422 for
 * a bad file upload) while still gaining structured logging + a requestId in the response. */
export function sendError(
  res: Response,
  req: Request,
  err: unknown,
  overrides?: { status?: number; safeMessage?: string; errorType?: string }
): void {
  const normalized = normalizeError(err);
  const status = overrides?.status ?? normalized.status;
  const safeMessage = overrides?.safeMessage ?? normalized.safeMessage;
  logError(req, err, overrides?.errorType ?? normalized.errorType);
  res.status(status).json({ error: safeMessage, requestId: req.id });
}
