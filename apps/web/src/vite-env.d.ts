/// <reference types="vite/client" />

// Vite の ImportMetaEnv は index signature が any なので、使う環境変数を明示して型を付ける。
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}
