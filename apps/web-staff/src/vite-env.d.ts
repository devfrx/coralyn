/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Origin dell'app web-customer, per il deep-link all'anteprima informativa (5.6a). */
  readonly VITE_WEB_CUSTOMER_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
