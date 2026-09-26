/// <reference types="vite/client" />
import type { SakaiApi } from '../../preload'
declare global { interface Window { sakai: SakaiApi } }
export {}
