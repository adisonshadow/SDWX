/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_SSO_EADAF_FRONTEND: string;
  readonly VITE_SSO_APPLICATION_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
