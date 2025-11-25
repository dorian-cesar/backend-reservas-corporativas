module.exports = {
    preset: 'ts-jest',
    testTimeout: 30000,
    testEnvironment: 'node',
    testMatch: [
        "**/tests/**/*.test.ts",
        "**/?(*.)+(spec|test).ts"
    ],
    moduleFileExtensions: ['ts', 'js', 'json', 'node'],
    transform: {
        '^.+\\.ts$': 'ts-jest'
    }
};
