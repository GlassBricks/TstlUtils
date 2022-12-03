/// <reference types="@typescript-to-lua/language-extensions" />

declare function newLuaSet<T extends AnyNotNil>(...values: T[]): LuaSet<T>

declare function assume<T>(value: unknown): asserts value is T

declare function keys<T>(): Array<keyof T>

declare function keySet<T>(): LuaSet<keyof T>

declare function getProjectFilesMatchingRegex(regex: string): string[]

declare const nil: undefined
