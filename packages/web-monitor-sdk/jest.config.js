module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/test/*.js"],
  transform: {
    "^.+\\.[tj]sx?$": [
      "babel-jest",
      {
        presets: [
          [
            "@babel/preset-env",
            {
              targets: {
                node: "current",
              },
            },
          ],
          "@babel/preset-typescript",
        ],
      },
    ],
  },
};
