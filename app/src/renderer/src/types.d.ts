/// <reference types="vite/client" />
import type { SakaiApi } from '../../preload'
declare global { interface Window { sakai: SakaiApi } }
declare module '*.svg?raw' { const src: string; export default src }
declare module '*.png' { const src: string; export default src }
export {}
