declare const __API_BASE_URL__: string;
declare const __USE_MOCK_API__: boolean;
declare const __PLATFORM__: "mp-weixin" | "h5" | "app" | string;
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_PUBLISHABLE_KEY__: string;

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
