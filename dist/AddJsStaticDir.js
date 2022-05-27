const TerserPlugin = require('terser-webpack-plugin');
module.exports = function (terserOptions = {}) {
    return new TerserPlugin({
        terserOptions: {
            compress: {
                drop_console: true, //console
                drop_debugger: false,
                pure_funcs: ['console.log']
            },
            ...terserOptions
        },
        ...(TerserPlugin.terserMinify && TerserPlugin.terserMinify.getMinimizerVersion() > '4' ? {} : { cache: false }),

        minify: async (file, sourceMap, minimizerOptions) => {
            const extractedComments = [];
            const { minify: terserMinify } = require('terser');
            const result = await terserMinify(file, minimizerOptions);
            const isProd = process.env.NODE_ENV === 'prod' || process.env.NODE_ENV === 'production';
            if (isProd) {
                let reg = new RegExp(process.env.RegExpStr, 'g');
                result.code = result.code.replace(reg, process.env.JsStaticReplaceDir);
            }
            return { ...result, extractedComments };
        }
    });
};
