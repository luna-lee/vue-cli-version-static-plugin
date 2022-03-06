const cssnano = require("cssnano");
const postcss = require("postcss");
const isProd =
  process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "production";
try {
  // vuecli4.0
  const OptimizeCssnanoPlugin = require("@intervolga/optimize-cssnano-plugin");

  if (OptimizeCssnanoPlugin)
    // 修改OptimizeCssnanoPlugin的prototype
    OptimizeCssnanoPlugin.prototype.apply = function (compiler) {
      const self = this;
      compiler.hooks.emit.tapAsync(
        "OptimizeCssnanoPlugin",
        function (compilation, callback) {
          // Search for CSS assets
          const assetsNames = Object.keys(compilation.assets).filter(
            (assetName) => {
              return /\.css$/i.test(assetName);
            }
          );

          let hasErrors = false;
          const promises = [];
          // Generate promises for each minification
          assetsNames.forEach((assetName) => {
            // Original CSS
            const asset = compilation.assets[assetName];
            const originalCss = asset.source();

            // Options for particalar cssnano call
            const postCssOptions = {
              from: assetName,
              to: assetName,
              map: false,
            };
            const cssnanoOptions = self.options.cssnanoOptions;

            // Extract or remove previous map
            const mapName = assetName + ".map";
            if (self.options.sourceMap) {
              // Use previous map if exist...
              if (compilation.assets[mapName]) {
                const mapObject = JSON.parse(
                  compilation.assets[mapName].source()
                );

                // ... and not empty
                if (
                  mapObject.sources.length > 0 ||
                  mapObject.mappings.length > 0
                ) {
                  postCssOptions.map = Object.assign(
                    {
                      prev: compilation.assets[mapName].source(),
                    },
                    self.options.sourceMap
                  );
                } else {
                  postCssOptions.map = Object.assign(
                    {},
                    self.options.sourceMap
                  );
                }
              }
            } else {
              delete compilation.assets[mapName];
            }

            // Run minification
            const promise = postcss([cssnano(cssnanoOptions)])
              .process(originalCss, postCssOptions)
              .then((result) => {
                if (hasErrors) {
                  return;
                }
                /* 对所有css中，绝对路径引用静态文件路径前面加上 publicPath和版本 */
                // Extract CSS back to assets
                let reg = new RegExp(process.env.RegExpStr, "g");
                const processedCss = isProd
                  ? result.css.replace(reg, process.env.JsCssStaticReplaceDir)
                  : result.css;
                compilation.assets[assetName] = {
                  source: function () {
                    return processedCss;
                  },
                  size: function () {
                    return processedCss.length;
                  },
                };

                // Extract map back to assets
                if (result.map) {
                  const processedMap = result.map.toString();

                  compilation.assets[mapName] = {
                    source: function () {
                      return processedMap;
                    },
                    size: function () {
                      return processedMap.length;
                    },
                  };
                }
              })
              .catch(function (err) {
                hasErrors = true;
                throw new Error(
                  "CSS minification error: " +
                    err.message +
                    ". File: " +
                    assetName
                );
              });
            promises.push(promise);
          });

          Promise.all(promises)
            .then(function () {
              callback();
            })
            .catch(callback);
        }
      );
    };
} catch (error) {
  // vuecli 5.0,css文件中中不能目前不能引用绝对路径，需要写成内联样式才行
}
