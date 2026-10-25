module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/test/*.js"],
  transform: {
    "^.+\\.[t|j]sx?$": [
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
        plugins: ["@babel/plugin-transform-spread"],
      },
    ],
  },
};
