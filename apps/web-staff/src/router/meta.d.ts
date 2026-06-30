import 'vue-router';
import type { Role } from '@coralyn/contracts';
declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    subtitle?: string;
    public?: boolean;
    bare?: boolean;
    role?: Role;
  }
}
