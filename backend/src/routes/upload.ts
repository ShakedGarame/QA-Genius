import { Router, Request, Response } from "express";
import multer from "multer";
import { parseFileBuffer, parseRawText } from "../services/parser.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".md", ".txt"];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(", ")}`));
  },
});

router.post("/upload-prd", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (req.file) {
      const parsed = await parseFileBuffer(req.file.buffer, req.file.originalname);
      return res.json({ success: true, data: parsed });
    }

    if (typeof req.body?.text === "string" && req.body.text.trim()) {
      const parsed = parseRawText(req.body.text);
      return res.json({ success: true, data: parsed });
    }

    return res.status(400).json({ error: "No file or text provided" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to parse file";
    return res.status(422).json({ error: message });
  }
});

export default router;
