/**
 * @author 闰月飞鸟
 * @description 版本控制插件，
 *  */
 const fs = require("fs-extra");
 const path = require("path");
 const HtmlWebpackPlugin = require("html-webpack-plugin");
 
 const isProd = process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "production";
 //版本号
 module.exports.VersionCode = generatorVersionCode();
 
 // 重写css压缩插件,vuecli 4.x的时候才加载因为5.x后css中不在支持直接使用静态资源
 if (!require("@vue/cli-service").defineConfig) require("./AddCssSataticDir.js");
 
 module.exports.VersionPlugin = class VersionPlugin {
   constructor(option = {}) {
     /**
      * option 属性
      * @publicStaticFolderName default static
      * @merge  default false 将public中指定的静态资源，以合并的方式复制到指定打包目录下，还是整个文件夹拷贝
      * @versionControl 版本控制开启，开启后会自动复制指定路径上的config文件到public中，同时生成sourcMap文件，关闭htmlplugin的inject功能
      * @terserOptions  terser 压缩参数
      * @dynamicPublicPath  通过配置，动态设置publicPath  ，true/false。 vue.config文件中不要设置publicPath。在mian.js中添加if (window.SITE_CONFIG["publicPath"])__webpack_public_path__ = window.SITE_CONFIG["publicPath"]
      * @to  config 配置文件将要拷贝的路径。默认public/config/index.js
      * @from config 配置文件的来源路径。默认config/index-${args.config || process.env.NODE_ENV}.js  若指定mode则取对应mode名对应的配置文件，否则取NODE_ENV对应的配置文件
      */
     const rawArgv = process.argv.slice(2)
     const args = require('minimist')(rawArgv, {
       boolean: [
         // build
         'modern',
         'report',
         'report-json',
         'inline-vue',
         'watch',
         // serve
         'open',
         'copy',
         'https',
         // inspect
         'verbose'
       ]
     })
     this.option = {
       publicStaticFolderName: "static",
       merge: true,
       versionControl: true,
       dynamicPublicPath: false,
       to: "public/config/index.js",
       from: `config/index-${args.config || process.env.NODE_ENV}.js`,
       ...option
     };
   }
   apply(compiler) {
     const vueConfig = getVueConfig();
     let cdnStatic = { js: [], css: [] }
     process.env.PublicPath = compiler.options.output.publicPath;
     process.env.StaticAssetsDir = vueConfig.assetsDir || "";
     process.env.dynamicPublicPath = !!this.option.dynamicPublicPath || false
     // js css 中对静态文件路径替换规则
     process.env.RegExpStr = `(?<=['"\`(])\\s*/${this.option.publicStaticFolderName}/`;
     // js css 中对静态文件路径替换的目标路径
     process.env.JsCssStaticReplaceDir = path.join(process.env.PublicPath, process.env.StaticAssetsDir, this.option.merge ? "" : this.option.publicStaticFolderName, "/").replace(/\\/g, "/");
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
           // 版本10.2.4
           if (patterns[0].globOptions)
             // 对public中的资源目录不进行默认方式拷贝。而是将其拷贝到assets输出目录StaticAssetsDir，
             patterns[0].globOptions.ignore.push(path.join(path.resolve("public"), this.option.publicStaticFolderName, "**", "*").replace(/\\/g, "/"));
           // 版本 5.1.2
           else patterns[0].ignore.push(path.join(this.option.publicStaticFolderName, "**", "*").replace(/\\/g, "/"));
           // 为了适应vuecli的多打包规则(会打包两份)不在copy里复制，不然兼容版本文件夹里没有静态文件
           /*   patterns.push({
                 from: path
                   .join("public", this.option.publicStaticFolderName)
                   .replace(/\\/g, "/"),
                 to: path
                   .join(
                     process.env.StaticAssetsDir,
                     this.option.merge ? "" : this.option.publicStaticFolderName
                   )
                   .replace(/\\/g, "/"),
                 toType: "dir",
               }); */
           //开启版本控制， 对public中的配置文件不做复制，直接通过copyConfigFile复制
           if (this.option.versionControl) {
             patterns[0].globOptions && patterns[0].globOptions.ignore.push(path.resolve(this.option.to).replace(/\\/g, "/"));
             patterns[0].ignore && patterns[0].ignore.push(path.relative("public", this.option.to));
           }
         }
         // 设置 HtmlPlugin的inject为false,对cdn中的内容进行配置
         if (pluginClass.constructor.name == "HtmlWebpackPlugin" && isProd) {
           // vuecli 4 vuecli 5
           let options = pluginClass.options || pluginClass.userOptions
           if (this.option.versionControl) {
             options.inject = false;
           }
           let reg = new RegExp(process.env.RegExpStr, "g");
           // 若开启了dynamicPublicPath，则需要把cdn里static目录下的文件提取出来，放入souceMap中，通过js动态导入
           if (this.option.dynamicPublicPath) {
             let cdnObj = options.cdn
             let httpCdn = {}
             cdnStatic = Object.keys(cdnObj).reduce((obj, key) => {
               cdnObj[key].forEach(item => {
                 if (reg.test(JSON.stringify(item))) {
                   item = JSON.parse(JSON.stringify(item).replace(reg, process.env.JsCssStaticReplaceDir))
                   if (!obj[key]) obj[key] = []
                   if (key == 'css') {
                     obj[key].push({
                       tagName: 'link',
                       attributes: {
                         type: "text/css",
                         rel:"stylesheet",
                         href: item
                       }
                     })
                   }
                   if (key == 'js') {
                     obj[key].push({
                       tagName: 'script',
                       attributes: {
                         type: 'text/javascript',
                         src: item,
                       }
                     })
                   }
                 } else {
                   if (!httpCdn[key]) httpCdn[key] = []
                   httpCdn[key].push(item)
                 }
               })
               return obj
             }, { css: [], js: [] })
             options.cdn = httpCdn
           } else {
             options.cdn = JSON.parse(JSON.stringify(options.cdn).replace(reg, process.env.JsCssStaticReplaceDir));
           }
         }
       });
     });
     if (isProd) {
       // 替换js压缩工具，js压缩时将所有的绝对路径的引用资源路径上，加上/public+StaticAssetsDir
       compiler.options.optimization.minimizer = [require("./AddJsStaticDir.js")(this.option.terserOptions || {})];
       compiler.hooks.compilation.tap("VersionPlugin", (compilation) => {
         copyStaticDir(
           path.join("public", this.option.publicStaticFolderName).replace(/\\/g, "/"),
           path.join(compiler.outputPath, process.env.StaticAssetsDir, this.option.merge ? "" : this.option.publicStaticFolderName).replace(/\\/g, "/")
         );
         // 将打包后的js，css 生成动态script，保存到对应assetsDir文件目录下souceMap.js中。
         if (this.option.versionControl) {
           if (HtmlWebpackPlugin.version > 4)
             HtmlWebpackPlugin.getHooks(compilation).alterAssetTagGroups.tap("alterAssetTagGroups ", (htmlPluginData) => {
               saveFile(compiler.outputPath, {
                 head: [...cdnStatic.css, ...htmlPluginData.headTags],
                 body: [...cdnStatic.js, ...htmlPluginData.bodyTags]
               });
             });
           else
             compilation.hooks.htmlWebpackPluginAlterAssetTags &&
               compilation.hooks.htmlWebpackPluginAlterAssetTags.tap("htmlWebpackPluginAlterAssetTags", (htmlPluginData) => {
                 saveFile(compiler.outputPath, {
                   head: [...cdnStatic.css, ...htmlPluginData.head],
                   body: [...cdnStatic.js, ...htmlPluginData.body]
                 });
               });
         }
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
   let addDynamicPublicPath = '';
   if (process.env.dynamicPublicPath == 'true')
     addDynamicPublicPath = `
      if(window.SITE_CONFIG["publicPath"]&&(attr=='href'||attr=='src')) {
        tagDefinition.attributes[attr]= window.SITE_CONFIG["publicPath"] +tagDefinition.attributes[attr]
        tagDefinition.attributes[attr]=tagDefinition.attributes[attr].replace(new RegExp("//", "g"),"/")
    }
  `
   let loadSource = `
         var sourceMap= ${JSON.stringify(assets)};
         (function () {
          sourceMap.head.forEach(function (tag) {
            createHtmlTag(tag, "head");
          });
          LoadBodySource()
          document.onreadystatechange = function () {
            LoadBodySource()
          }
          /* 加载资源 */
          function LoadBodySource() {
            if (document.readyState === 'complete') {
              sourceMap.body.forEach(function (tag) {
                createHtmlTag(tag, "body");
              });
            }
          }
          function createHtmlTag(tagDefinition, position) {
            let tag = document.createElement(tagDefinition.tagName);
            Object.keys(tagDefinition.attributes || {}).forEach(function (attr) {
             ${addDynamicPublicPath}
              tag.setAttribute(attr, tagDefinition.attributes[attr]);
            });
            document.getElementsByTagName(position)[0].appendChild(tag);
          }
        })();`;
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
       let SITE_CONFIG = "";
       if (!/window\.SITE_CONFIG/.test(data.toString())) {
         SITE_CONFIG = "window.SITE_CONFIG={}";
       }
       data = `
      ${data.toString()}
      ${SITE_CONFIG}
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
 // 拷贝静态static文件
 function copyStaticDir(src, dest) {
   fs.pathExists(src).then((exists) => {
     if (exists) {
       fs.ensureDir(dest).then(() => {
         fs.copy(src, dest, function () { });
       });
     }
   });
 }
 