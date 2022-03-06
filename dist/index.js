/**
 * @author 闰月飞鸟
 * @description 版本控制插件，
 *  */
const fs = require("fs-extra");
const path = require("path");
const isProd = process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "production";
//版本号
module.exports.VersionCode = generatorVersionCode();

// 重写css压缩插件
require("./AddCssSataticDir.js");
// 重写js压缩插件
const AddJsStaticDirTerserPlugin = require("./AddJsStaticDir.js");
module.exports.VersionPlugin = class VersionPlugin {
  constructor(option = {}) {
    /**
     * option 属性
     * @publicStaticFolderName default static
     * @merge  default false
     * @versionControl 版本控制开启，开启后会自动复制指定路径上的config文件到public中，同时生成sourcMap文件，关闭htmlplugin的inject功能
     * @terserOptions  terser 压缩参数
     * @to  config 配置文件将要拷贝的路径。默认public/config/index.js
     * @from config 配置文件的来源路径。默认config/index-${process.env.NODE_ENV}.js
     */
    this.option = {
      publicStaticFolderName: "static",
      merge: true,
      versionControl: true,
      to: "public/config/index.js",
      from: `config/index-${process.env.NODE_ENV}.js`,
      ...option
    };
  }
  apply(compiler) {
    const vueConfig = getVueConfig();
    process.env.PublicPath = compiler.options.output.publicPath;
    process.env.StaticAssetsDir = vueConfig.assetsDir || "";
    process.env.VersionPluginOption = this.option;
    // js css 中对静态文件路径替换规则
    process.env.RegExpStr = `(?<=['"\`(])\\s*/${this.option.publicStaticFolderName}/`;
    // js css 中对静态文件路径替换的目标路径
    process.env.JsCssStaticReplaceDir = path.join("/", process.env.PublicPath, process.env.StaticAssetsDir, this.option.merge ? "" : this.option.publicStaticFolderName, "/").replace(/\\/g, "/");
    // 拷贝配置文件,生产环境直接将配置文件打包到outputDir目录中，开发环境，则复制到public上
    if (this.option.versionControl)
      copyConfigFile({
        to: isProd ? this.option.to.replace("public", vueConfig.outputDir || "dist") : this.option.to,
        from: this.option.from
      });
    //生产环境加载
    // 修改CopyPlugin 对public中的publicStaticFolderName文件拷贝到对应StaticAssetsDir目录下

    compiler.hooks.afterPlugins.tap("updateCopyPluginAndHtmlPlugin", (compiler) => {
      // 当开启版本控制时，对public中的配置文件不做默认复制.依靠copyConfigFile复制
      compiler.options.plugins.forEach((pluginClass) => {
        if (pluginClass.constructor.name == "CopyPlugin" && isProd) {
          let patterns = pluginClass.patterns;
          // 对public中的资源目录不进行默认方式拷贝。而是将其拷贝到assets输出目录StaticAssetsDir，
          patterns[0].ignore.push(path.join(this.option.publicStaticFolderName, "**", "*").replace(/\\/g, "/"));
          patterns.push({
            from: path.join("public", this.option.publicStaticFolderName).replace(/\\/g, "/"),
            to: path.join(process.env.StaticAssetsDir, this.option.merge ? "" : this.option.publicStaticFolderName).replace(/\\/g, "/"),
            toType: "dir"
          });
          //开启版本控制， 对public中的配置文件不做复制，直接通过copyConfigFile复制
          if (this.option.versionControl) patterns[0].ignore.push(path.relative("public", this.option.to));
        }
        // 设置 HtmlPlugin的inject为false
        if (pluginClass.constructor.name == "HtmlWebpackPlugin") {
          if (this.option.versionControl && isProd) pluginClass.options.inject = false;
          // 生成环境,若HtmlPlugin中有cdn配置，则将里面的所有的绝对路径的引用资源路径上，加上/public+StaticAssetsDir
          if (pluginClass.options.cdn && isProd) {
            let reg = new RegExp(process.env.RegExpStr, "g");
            pluginClass.options.cdn = JSON.parse(JSON.stringify(pluginClass.options.cdn).replace(reg, process.env.JsCssStaticReplaceDir));
          }
        }
      });
    });
    if (isProd) {
      // 替换js压缩工具，js压缩时将所有的绝对路径的引用资源路径上，加上/public+StaticAssetsDir
      compiler.options.optimization.minimizer = [AddJsStaticDirTerserPlugin(this.option.terserOptions || {})];
      if (this.option.versionControl)
        // 将打包后的js，css 生成动态script，保存到对应assetsDir文件目录下souceMap.js中。
        compiler.hooks.compilation.tap("VersionPlugin", (compilation) => {
          //老版本
          /*  compilation.plugin(
             "html-webpack-plugin-before-html-processing",
             function (htmlPluginData) {
                saveFile(  htmlPluginData.assets);
             }
           ); */
          compilation.hooks[methodName].tap(methodName, (htmlPluginData) => {
            saveFile(compiler.outputPath, {
              head: htmlPluginData.head,
              body: htmlPluginData.body
            });
          });
        });
    }
  }
};
// 版本号生成器 - 年月日时分秒
function generatorVersionCode() {
  if (isProd) {
    var d = new Date();
    var yy = d.getFullYear().toString().slice(2);
    var MM = d.getMonth() + 1 >= 10 ? d.getMonth() + 1 : "0" + (d.getMonth() + 1);
    var DD = d.getDate() >= 10 ? d.getDate() : "0" + d.getDate();
    var h = d.getHours() >= 10 ? d.getHours() : "0" + d.getHours();
    var mm = d.getMinutes() >= 10 ? d.getMinutes() : "0" + d.getMinutes();
    var ss = d.getSeconds() >= 10 ? d.getSeconds() : "0" + d.getSeconds();
    return yy + MM + DD + h + mm + ss;
  } else return "";
}
// 获取vue.config.js文件中的配置信息
function getVueConfig() {
  const vueConfigFilePath = path.resolve(process.cwd(), "vue.config.js");
  if (fs.existsSync(vueConfigFilePath)) {
    const config = require(vueConfigFilePath);
    return config;
  }
  return {};
}
//生成sourceMap文件
function saveFile(outputDir, assets) {
  let sourceMapFilePath = path.join(outputDir, process.env.StaticAssetsDir, "/sourceMap.js");
  let loadSource = `
     var sourceMap= ${JSON.stringify(assets)};
    window.onload = function () {
      sourceMap.head.forEach(function (tag) {
        createHtmlTag(tag, "head");
      });
      sourceMap.body.forEach(function (tag) {
        createHtmlTag(tag, "body");
      });
    };
    function createHtmlTag(tagDefinition, position) {
      let tag = document.createElement(tagDefinition.tagName);
      Object.keys(tagDefinition.attributes || {}).forEach(function (attr) {
        tag.setAttribute(attr, tagDefinition.attributes[attr]);
      });
      document.getElementsByTagName(position)[0].appendChild(tag);
    }
  `;
  fs.ensureFile(sourceMapFilePath).then(() => {
    fs.writeFileSync(sourceMapFilePath, loadSource);
  });
}
// 将文webpackConfig/config中对应当前模式的配置文件拷贝到public中，
function copyConfigFile({ to, from }) {
  const PackageConfigFile = path.resolve(from);
  const ConfigFile = path.resolve(to);
  fs.ensureFile(PackageConfigFile).then(() => {
    var data = fs.readFileSync(PackageConfigFile);
    if (isProd) {
      data =
        data.toString() +
        `
  // 版本号(年月日时分) 打包时会自动加上
  window.SITE_CONFIG['version'] = '${process.env.StaticAssetsDir}'
  //生产环境可以通过 window.SITE_CONFIG['version']加载指定版本项目
  var script = document.createElement('script')
  script.src = window.SITE_CONFIG['version'] + "/sourceMap.js"
  document.getElementsByTagName('head')[0].appendChild(script)`;
    }
    fs.ensureFile(ConfigFile).then(() => {
      fs.writeFileSync(ConfigFile, data);
    });
  });
}
