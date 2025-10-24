/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly [key: string]: string | undefined;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
