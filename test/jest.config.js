/** @type {Partial<import("@jest/types").Config.DefaultOptions>} */
module.exports = {
    testMatch: ["**/*.test.ts"],
    testEnvironment: "node",
    testRunner: "jest-circus/runner",
    preset: "ts-jest",
    transform: {
        "^.+\\.tsx?$": ["ts-jest", {

            tsconfig: "<rootDir>/tsconfig.json",
        }],
    }
}
