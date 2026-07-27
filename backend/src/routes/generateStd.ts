import { Router, Request, Response } from "express";
import path from "path";
import multer from "multer";
import { generateManualStd } from "../services/llm.js";
import { parseRawText, parseFileBuffer, parseSwaggerBuffer, parseSwaggerText } from "../services/parser.js";
import { GenerateManualStdRequest } from "../types/index.js";
import { getUserSettings, saveManualStd, listManualStds, getManualStdById, deleteManualStd } from "../db.js";
import type { DbUser } from "../db.js";
import { resolveOpenAIKeySource } from "../lib/requestKeys.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".md", ".txt", ".json", ".yaml", ".yml"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${ext}`));
  },
});

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
}

router.post(
  "/generate-std",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const userId = (req.user as DbUser).id;

    const {
      featureName,
      inputType = "prd",
      prdText,
      swaggerContent,
    } = req.body as GenerateManualStdRequest & { swaggerContent?: string };

    if (!featureName || !featureName.trim()) {
      return res.status(400).json({ error: "featureName is required" });
    }

    const validInputTypes = ["prd", "swagger"];
    if (!validInputTypes.includes(inputType as string)) {
      return res.status(400).json({ error: `inputType must be one of: ${validInputTypes.join(", ")}` });
    }

    const featureSlug = toSlug(featureName.trim());
    if (!featureSlug) {
      return res.status(400).json({ error: "featureName must contain at least one letter or number" });
    }

    const userSettings = await getUserSettings(userId);
    const { key: openaiKey, source: keySource } = resolveOpenAIKeySource(req, userSettings);
    const llmOptions = { openaiKey };

    try {
      let rawText: string;

      if (inputType === "swagger") {
        let swagger;
        if (req.file) {
          swagger = await parseSwaggerBuffer(req.file.buffer, req.file.originalname);
        } else if (swaggerContent) {
          swagger = parseSwaggerText(swaggerContent);
        } else {
          return res.status(400).json({ error: "Provide swagger file or swaggerContent text" });
        }
        rawText = JSON.stringify(swagger.rawJson);
      } else {
        let parsedPrd;
        if (req.file) {
          parsedPrd = await parseFileBuffer(req.file.buffer, req.file.originalname);
        } else if (prdText) {
          parsedPrd = parseRawText(prdText);
        } else {
          return res.status(400).json({ error: "Provide prd file or prdText" });
        }
        rawText = parsedPrd.rawText;
      }

      const result = await generateManualStd(rawText, featureName.trim(), llmOptions);

      const saved = await saveManualStd(userId, {
        featureName: featureName.trim(),
        slug: featureSlug,
        inputType: inputType as "prd" | "swagger",
        domain: result.domain,
        testCases: result.testCases,
        coverage: result.coverage,
        model: result.model,
        isMock: result.isMock,
      });

      return res.json({
        success: true,
        data: result,
        featureName: featureName.trim(),
        featureSlug,
        stdId: saved.id,
        keySource,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "STD generation failed";
      console.error("[generate-std]", message);
      return res.status(500).json({ error: message });
    }
  }
);

router.get("/manual-std", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  try {
    const stds = await listManualStds(userId);
    return res.json({ success: true, stds });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list STDs" });
  }
});

router.get("/manual-std/:id", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const { id } = req.params;
  try {
    const std = await getManualStdById(userId, id);
    if (!std) return res.status(404).json({ error: "STD not found" });
    return res.json({ success: true, std });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load STD" });
  }
});

router.delete("/manual-std/:id", async (req: Request, res: Response) => {
  const userId = (req.user as DbUser).id;
  const { id } = req.params;
  try {
    const deleted = await deleteManualStd(userId, id);
    if (!deleted) return res.status(404).json({ error: "STD not found" });
    return res.json({ success: true, message: "STD deleted" });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete STD" });
  }
});

export default router;
