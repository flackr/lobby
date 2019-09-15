const path = require('path');

function getCommonConfig() {
  return {
    entry: ['babel-polyfill', 'whatwg-fetch'],
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader"
          }
        }
      ]
    },
  };
}

function createTarget(entries, outputPath, outputFile) {
  let config = getCommonConfig();
  for (var i = 0; i < entries.length; i++)
    config.entry.push(entries[i]);
  config.output = {
    path: path.resolve(__dirname, outputPath),
    filename: outputFile
  }
  return config;
}

const lobbyConfig = createTarget(['./src/lobby.js'], 'build', 'lobby.min.js');
const demoChatConfig = createTarget(['./demo/chat/src/ui.js'], 'demo/chat/build', 'bundle.js');

module.exports = [lobbyConfig, demoChatConfig];
