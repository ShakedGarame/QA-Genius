import { Router, Request, Response } from "express";
import path from "path";
import multer from "multer";
import { generateTests, generateApiTests } from "../services/llm.js";
import { parseRawText, parseFileBuffer, parseSwaggerBuffer, parseSwaggerText } from "../services/parser.js";
import { GenerateTestsRequest, FeatureMeta } from "../types/index.js";
import { getUserSettings, saveGeneratedTest, upsertFeatureMeta } from "../db.js";
import type { DbUser } from "../db.js";

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

function deriveTestFileName(prdFileName?: string, prdText?: string): string {
  if (prdFileName) {
    const base = path.basename(prdFileName).replace(/\.[^.]+$/, "");
    return `${base.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()}.spec.ts`;
  }
  const snippet = (prdText ?? "generated").slice(0, 30).replace(/[^a-zA-Z0-9 ]/g, "").trim();
  return `${snippet.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}.spec.ts`;
}

router.post(
  "/generate-tests",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const userId = (req.user as DbUser).id;

    const {
      featureName,
      inputType = "prd",
      prdText,
      swaggerContent,
      fileName,
    } = req.body as GenerateTestsRequest & { swaggerContent?: string };

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
    const llmOptions = { openaiKey: userSettings?.openai_api_key ?? undefined };

    try {
      if (inputType === "swagger") {
        let swagger;
        if (req.file) {
          swagger = await parseSwaggerBuffer(req.file.buffer, req.file.originalname);
        } else if (swaggerContent) {
          swagger = parseSwaggerText(swaggerContent);
        } else {
          return res.status(400).json({ error: "Provide swagger file or swaggerContent text" });
        }

        const result = await generateApiTests(swagger, featureName.trim(), llmOptions);
        const specFileName = deriveTestFileName(req.file?.originalname ?? fileName, `${swagger.title}_api`);

        const meta: FeatureMeta = {
          featureName: featureName.trim(),
          slug: featureSlug,
          inputType: "swagger",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          description: `${swagger.title} v${swagger.version} — ${swagger.endpoints.length} endpoints`,
        };

        await upsertFeatureMeta(userId, meta);
        await saveGeneratedTest(userId, featureSlug, specFileName, result.code);

        return res.json({
          success: true,
          data: result,
          featureName: featureName.trim(),
          featureSlug,
          savedAs: specFileName,
        });
      }

      let parsedPrd;
      if (req.file) {
        parsedPrd = await parseFileBuffer(req.file.buffer, req.file.originalname);
      } else if (prdText) {
        parsedPrd = parseRawText(prdText);
      } else {
        return res.status(400).json({ error: "Provide prd file or prdText" });
      }

      const result = await generateTests(parsedPrd.rawText, parsedPrd.userStories, llmOptions);
      const specFileName = deriveTestFileName(req.file?.originalname ?? fileName, parsedPrd.rawText);

      const meta: FeatureMeta = {
        featureName: featureName.trim(),
        slug: featureSlug,
        inputType: "prd",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        prdText: parsedPrd.rawText.slice(0, 300),
        description: parsedPrd.userStories.map((s) => s.title).join("; ").slice(0, 200),
      };

      await upsertFeatureMeta(userId, meta);
      await saveGeneratedTest(userId, featureSlug, specFileName, result.code);

      return res.json({
        success: true,
        data: { ...result, userStories: parsedPrd.userStories },
        featureName: featureName.trim(),
        featureSlug,
        savedAs: specFileName,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      console.error("[generate-tests]", message);
      return res.status(500).json({ error: message });
    }
  }
);

export default router;
