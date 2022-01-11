const path = require("path");

module.exports = {
    entry: path.resolve(__dirname, "./src/index.ts"),
    output: {
        path: path.resolve(__dirname, "./dist")
    },
    mode: 'development',
    module: {
        rules: [{
            test: /\.ts(x?)$/,
            use: [{
                loader: "ts-loader",
                options: {
                    experimentalWatchApi: true,
                    transpileOnly: true
                }
            }]
        }, {
            test: /\.worker\.js$/,
            use: { loader: "worker-loader" },
        }]
    },
    resolve: {
        extensions: [".js", ".ts", ".tsx"]
    },
    devServer: {
        static: {
            directory: path.join(__dirname, 'dist'),
        },
        compress: true,
        port: 9000,
    },
}