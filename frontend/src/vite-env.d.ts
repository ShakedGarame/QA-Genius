/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_GITHUB_ACTIONS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
