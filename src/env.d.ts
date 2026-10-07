interface ImportMetaEnv {
  /** YouTube Data API v3 key (set it in .env.local or in the hosting provider). */
  readonly VITE_YOUTUBE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
