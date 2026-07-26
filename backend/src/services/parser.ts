import fs from "fs";
import path from "path";
import { ParsedPrd, UserStory, ParsedSwagger, SwaggerEndpoint } from "../types/index.js";
import { v4 as uuidv4 } from "uuid";

// ─── PRD / Text parsers ───────────────────────────────────────────────────────

async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      disableFontFace: true,
    }).promise;

    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      text += `${pageText}\n`;
    }
    return text;
  } catch (err) {
    console.error("[parsePdfBuffer]", err instanceof Error ? err.message : err);
    throw new Error("Failed to parse PDF file. Ensure it is not encrypted or corrupted.");
  }
}

async function parsePdf(filePath: string): Promise<string> {
  return parsePdfBuffer(fs.readFileSync(filePath));
}

async function parseDocxBuffer(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch {
    throw new Error("Failed to parse DOCX file.");
  }
}

async function parseDocx(filePath: string): Promise<string> {
  return parseDocxBuffer(fs.readFileSync(filePath));
}

function parseMd(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

function parseTxtFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

export async function parseFileBuffer(
  buffer: Buffer,
  originalName: string
): Promise<ParsedPrd> {
  const ext = path.extname(originalName).toLowerCase().replace(".", "") as
    | "pdf" | "docx" | "md" | "txt";

  let rawText = "";

  switch (ext) {
    case "pdf":
      rawText = await parsePdfBuffer(buffer);
      break;
    case "docx":
      rawText = await parseDocxBuffer(buffer);
      break;
    case "md":
    default:
      rawText = buffer.toString("utf-8");
  }

  return {
    rawText,
    fileName: originalName,
    format: ext === "docx" ? "docx" : ext === "pdf" ? "pdf" : ext === "md" ? "md" : "txt",
    userStories: extractUserStories(rawText),
  };
}

export async function parseFile(
  filePath: string,
  originalName: string
): Promise<ParsedPrd> {
  return parseFileBuffer(fs.readFileSync(filePath), originalName);
}

export function parseRawText(text: string): ParsedPrd {
  return {
    rawText: text,
    fileName: "pasted-text.txt",
    format: "txt",
    userStories: extractUserStories(text),
  };
}

function extractUserStories(text: string): UserStory[] {
  const stories: UserStory[] = [];

  const asAPattern =
    /As (?:a|an) ([^\n,]+?),\s*I want to? ((?:(?!so that)[^\n])+?)(?:\s+so that\s+([^\n]+?))?[.\n]?$/gim;
  let match;

  while ((match = asAPattern.exec(text)) !== null) {
    const role = match[1].trim();
    const action = match[2].trim();
    const benefit = match[3]?.trim();
    stories.push({
      id: uuidv4(),
      title: `As a ${role}, I want to ${action}`,
      steps: [`Navigate to the relevant page`, `Perform action: ${action}`],
      acceptanceCriteria: benefit ? [`So that ${benefit}`] : ["Feature works as described"],
    });
  }

  const headingPattern = /^#{1,3}\s+(.+)$/gm;
  while ((match = headingPattern.exec(text)) !== null) {
    const heading = match[1].trim();
    if (stories.length < 8 && !stories.find((s) => s.title.toLowerCase().includes(heading.toLowerCase()))) {
      stories.push({
        id: uuidv4(),
        title: heading,
        steps: [`Verify "${heading}" is accessible`, `Interact with the feature`, `Assert expected outcome`],
        acceptanceCriteria: ["Feature meets acceptance criteria"],
      });
    }
  }

  if (stories.length === 0) {
    stories.push({
      id: uuidv4(),
      title: "Feature Under Test",
      steps: ["Navigate to the application", "Interact with the described feature", "Validate the expected outcome"],
      acceptanceCriteria: ["All described functionality works correctly"],
    });
  }

  return stories.slice(0, 6);
}

// ─── Swagger / OpenAPI parser ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

export async function parseSwaggerBuffer(
  buffer: Buffer,
  originalName: string
): Promise<ParsedSwagger> {
  const ext = path.extname(originalName).toLowerCase();
  const raw = buffer.toString("utf-8");

  let spec: AnyObj;

  if (ext === ".yaml" || ext === ".yml") {
    try {
      const yaml = await import("js-yaml");
      spec = yaml.load(raw) as AnyObj;
    } catch {
      throw new Error("Invalid YAML in Swagger file.");
    }
  } else {
    try {
      spec = JSON.parse(raw);
    } catch {
      throw new Error("Invalid JSON in Swagger file.");
    }
  }

  return extractSwaggerEndpoints(spec);
}

export async function parseSwaggerFile(filePath: string, originalName: string): Promise<ParsedSwagger> {
  return parseSwaggerBuffer(fs.readFileSync(filePath), originalName);
}

export function parseSwaggerText(raw: string): ParsedSwagger {
  let spec: AnyObj;
  const trimmed = raw.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      spec = JSON.parse(raw);
    } catch {
      throw new Error("Invalid JSON format. Please paste valid OpenAPI JSON.");
    }
  } else {
    // Try YAML synchronously using basic heuristics
    try {
      // Dynamic import not possible in sync context — use simple YAML->JSON converter
      // For now parse as JSON with a clear error message
      spec = JSON.parse(raw);
    } catch {
      throw new Error("Paste valid OpenAPI JSON. For YAML files, use the file uploader.");
    }
  }

  return extractSwaggerEndpoints(spec);
}

function extractSwaggerEndpoints(spec: AnyObj): ParsedSwagger {
  const isOpenApi3 = !!spec.openapi;
  const isSwagger2 = !!spec.swagger;

  if (!isOpenApi3 && !isSwagger2) {
    throw new Error("Not a valid OpenAPI/Swagger specification. Missing 'openapi' or 'swagger' field.");
  }

  const title: string = spec.info?.title ?? "API";
  const version: string = spec.info?.version ?? "1.0.0";

  let baseUrl = "";
  if (isOpenApi3) {
    baseUrl = spec.servers?.[0]?.url ?? "";
  } else {
    const host = spec.host ?? "localhost";
    const basePath = spec.basePath ?? "/";
    const scheme = (spec.schemes as string[])?.[0] ?? "https";
    baseUrl = `${scheme}://${host}${basePath}`;
  }

  const paths: AnyObj = spec.paths ?? {};
  const endpoints: SwaggerEndpoint[] = [];

  const HTTP_METHODS = ["get", "post", "put", "delete", "patch"] as const;

  for (const [apiPath, pathItem] of Object.entries(paths)) {
    if (typeof pathItem !== "object" || !pathItem) continue;

    for (const method of HTTP_METHODS) {
      const op = (pathItem as AnyObj)[method] as AnyObj | undefined;
      if (!op) continue;

      const parameters = (op.parameters as AnyObj[] | undefined)?.map((p: AnyObj) => ({
        name: p.name,
        in: p.in,
        required: !!p.required,
      })) ?? [];

      let requestBodySchema: object | undefined;
      if (isOpenApi3 && op.requestBody) {
        const content = op.requestBody.content as AnyObj | undefined;
        const jsonContent = content?.["application/json"];
        requestBodySchema = jsonContent?.schema;
      } else if (isSwagger2) {
        const bodyParam = parameters.find((p) => p.in === "body");
        if (bodyParam) {
          requestBodySchema = ((op.parameters as AnyObj[] | undefined)?.find((p: AnyObj) => p.in === "body") as AnyObj)?.schema;
        }
      }

      let responseSchema: object | undefined;
      const successResponse = (op.responses as AnyObj)?.[200] ?? (op.responses as AnyObj)?.[201];
      if (successResponse) {
        if (isOpenApi3) {
          responseSchema = successResponse.content?.["application/json"]?.schema;
        } else {
          responseSchema = successResponse.schema;
        }
      }

      endpoints.push({
        method: method.toUpperCase() as SwaggerEndpoint["method"],
        path: apiPath,
        operationId: op.operationId,
        summary: op.summary,
        requestBodySchema,
        responseSchema,
        parameters,
        tags: op.tags as string[] | undefined,
      });

      if (endpoints.length >= 20) break; // cap at 20 for prompting
    }
    if (endpoints.length >= 20) break;
  }

  return { title, version, baseUrl, endpoints, rawJson: spec };
}
