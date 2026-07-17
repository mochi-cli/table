const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const nodeExternals = require('webpack-node-externals');

module.exports = function (options, webpack) {
  return {
    ...options,
    entry: {
      'mochi-local': ['webpack/hot/poll?100', options.entry],
    },
    output: {
      path: path.join(__dirname, 'dist'),
      filename: '[name].js',
    },
    mode: 'development',
    devtool: 'source-map',
    externals: [
      nodeExternals({
        allowlist: ['webpack/hot/poll?100'],
      }),
    ],
    watchOptions: {
      ignored: ['**/test/**', '**/*.spec.ts', '**/node_modules/**', '**/i18n.generated.ts'],
      poll: 1000,
    },
    module: {
      rules: [
        {
          test: /\.ts?$/,
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            happyPackMode: true,
          },
          exclude: [/node_modules/, /.e2e-spec.ts$/],
        },
      ],
    },
    cache: {
      type: 'filesystem',
      name: 'mochi-local',
      allowCollectingMemory: true,
      buildDependencies: {
        config: [__filename],
      },
    },
    plugins: [
      ...options.plugins.filter((plugin) => !(plugin instanceof ForkTsCheckerWebpackPlugin)),
      new webpack.HotModuleReplacementPlugin(),
      new ForkTsCheckerWebpackPlugin({
        typescript: {
          configFile: 'tsconfig.mochi.json',
          memoryLimit: 1024,
        },
      }),
    ],
  };
};
