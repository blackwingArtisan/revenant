export declare const FORBIDDEN: ReadonlyArray<readonly [RegExp, string]>;
export declare function stripCommentsAndStrings(source: string): string;
export declare function engineViolations(source: string): string[];
export declare function isEnginePath(path: unknown): boolean;
