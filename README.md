# QA-Genius — AI-Powered Test Generator & Observability Tool

> A production-grade portfolio project for a QA Automation Engineer.

**Live app:** [https://project-bh2e7.vercel.app](https://project-bh2e7.vercel.app)  
**Repository:** [https://github.com/ShakedGarame/QA-Genius](https://github.com/ShakedGarame/QA-Genius)

## What it does

| Feature | Description |
|---------|-------------|
| **PRD Ingestion** | Upload `.pdf`, `.docx`, `.md`, or paste raw text |
| **AI Test Generation** | Generates robust Playwright (TypeScript) tests using Page Object Model & `getByRole` locators |
| **Live Test Execution** | Runs the generated script and streams real-time console output |
| **Explain Failure (MCP)** | On failure, fetches simulated Coralogix logs via MCP protocol and asks AI for a plain-English root cause |
| **SpotiShak** | Original music-guessing game, preserved as a second portfolio piece |

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Monaco Editor
- **Backend:** Node.js + Express + TypeScript
- **AI:** OpenAI GPT-4o (with smart mock fallback when no key is provided)
- **Testing:** Playwright (TypeScript)
- **Observability:** Simulated MCP server mimicking Coralogix API

## Quick Start

```bash
# 1. Clone / enter project
cd qa-genius-portfolio

# 2. Copy env file
cp .env.example .env
# Optionally add your OPENAI_API_KEY for real AI responses

# 3. Install all dependencies
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 4. Start both servers
npm run dev
```

Frontend → http://localhost:5173  
Backend API → http://localhost:3001

## Mock Mode

If `OPENAI_API_KEY` is not set, the system automatically falls back to a **highly realistic mock** that simulates:
- AI-generated Playwright tests (Page Object Model pattern)
- Playwright test execution with pass/fail output
- Coralogix log retrieval via MCP
- AI root-cause analysis explanation

This means the app is fully demoable on GitHub Pages / Vercel without any API keys.

## Project Structure

```
qa-genius-portfolio/
├── backend/            Express + TypeScript API server
│   └── src/
│       ├── routes/     API route handlers
│       ├── services/   LLM, parser, runner, MCP client
│       └── mcp/        Simulated MCP Coralogix server
└── frontend/           Vite + React dashboard
    └── src/
        ├── components/ Reusable UI components
        ├── pages/      QA-Genius & SpotiShak pages
        └── hooks/      Data-fetching hooks
```
