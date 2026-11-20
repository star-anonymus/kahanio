// Types for build-guides.mjs (used by the tests).
export type Guide = { slug: string; query: string; title: string; description: string; h1: string; question: string; answer: string; preset: string; sections: { h2: string; list?: string[]; p?: string }[]; faq: [string, string][] };
export declare const GUIDES: Guide[];
