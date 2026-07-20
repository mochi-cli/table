const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = function (options, webpack) {
  return {
    ...options,
    entry: {
      'mochi-local': options.entry,
    },
    output: {
      path: path.join(__dirname, 'dist'),
      filename: '[name].js',
    },
    mode: 'production',
    target: 'node',
    externals: [],
    module: {
      rules: [
        {
          test: /\.ts?$/,
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            happyPackMode: true,
            configFile: 'tsconfig.mochi.json',
          },
          exclude: [/node_modules/, /.e2e-spec.ts$/],
        },
      ],
    },
    optimization: {
      minimize: false,
    },
    plugins: [
      ...options.plugins.filter((plugin) => !(plugin instanceof ForkTsCheckerWebpackPlugin)),
      new webpack.IgnorePlugin({
        resourceRegExp: /^@nestjs\/microservices/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^@nestjs\/platform-socket.io/,
      }),
      new CopyPlugin({
        patterns: [{ from: '../../packages/mochi-sqlite', to: 'mochi-sqlite' }],
      }),
    ],
  };
};
