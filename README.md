# VersionPlugin
- 为实现vuecli脚手架打包后，项目可以通过手动切换版本号来控制客户端具体展示页面，这在当前端页面出错，服务器上直接修改静态资源版本号来还原/回滚到之前代码。而不需要重新编译！
- 为解决vuecli项目中直接引用public中的static资源打包后无法正确展示的问题。

# 更新日志
### v2.2.0
- from 参数默认文件名，移除前缀“index-”
- from 参数可以传递数组，实现多个来源合并。
- 生成的配置文件内容自动用(function(){...})包裹
### v2.1.7
- 修复css 独立打包且在相对路径下对静态资源的引用的bug

### v2.1.6
- 修复没有配置cdn时运行报错的bug
# 参数
名称|类型|说明|默认值
---|---|---|--
publicStaticFolderName|string|public文件夹下静态资源目录文件夹名。若有嵌套则需要将父文件夹名也带上，如：'project/static'|static
merge|boolean|public文件夹下静态资源是否与assets打包后的文件合并。不合并则单独存放一个文件夹，文件夹结构和名称与public中一致。 |true
versionControl|boolean|开启版本控制开启，开启后会自动复制指定路径上的config文件到public中，同时生成sourcMap文件，关闭htmlplugin的inject功能， |true 
to|string|config 配置文件将要拷贝的路径。在versionControl为true时起作用 |public/config/index.js
from|string/Array|config 配置文件的来源路径。在versionControl为true时起作用。可以配置多个来源文件路径|config/${args.config \|\|process.env.NODE_ENV}.js  **args为脚本命令中的参数对象**
dynamicPublicPath |boolean| 通过配置，动态设置publicPath,<br/> 开启后 vue.config文件中不要设置publicPath。<br/> 在mian.js中添加 ```if (window.SITE_CONFIG["publicPath"]__webpack_public_path__ = window.SITE_CONFIG["publicPath"]```<br/> config 文件中添加   ```  window.SITE_CONFIG["publicPath"]配置```<br/>  **注意：当设置了dynamicPublicPath为true时，不要在css文件中应用publich中的静态资源。<br/>js，vue文件中使用必须手动加上window.SITE_CONFIG["publicPath"]**<br/>|false
# 使用方式
- 在vue.config.js中引入VersionPlugin

- 获取变量VersionPlugin,VersionCode,

- VersionPlugin 直接在configureWebpack中添加到插件中。 config.plugins.push(new VersionPlugin());

- VersionCode 赋值给 assetsDir，也可以在前面拼接自定义名称或文件夹名 assetsDir: VersionCode 或 'static/'+VersionCode

- 最后在public中的index.html模板文件中引入config文件

- 若htmlplugin中的option设置了cdn，则会对cdn中的所有绝对引用路径与js，css做相同处理。同时对绝对引用路径支持动态指定publicPath

# 不同环境配置
-  默认取当前NODE_ENV值
 "scripts": {
    "serve": "vue-cli-service serve", 
    "build": "vue-cli-service build --report"
  },
 - 指定配置文件名称 ,根目录下的config文件夹中需要存在local.js和test.js文件，若没有会自动建立
 "scripts": {
    "local": "vue-cli-service serve --config local",  
    "test": "vue-cli-service serve --config test"
  },
# 注意事项
- terser-webpack-plugin 版本需要4.x以上

- vuecli 4.x 对应的htmlWebpackPlugin也必须是4.x

```javascript
config
|-index-development.js
|-index-production.js
|-index-qa.js

// vue.config.js
const { VersionPlugin, VersionCode } = require("./vue-cli-version-static-plugin/index");
const cdn = {
  css: ["/static/plugins/pageoffice-5.2.0.6/pageoffice.css"],
  js: [
    "/static/plugins/pageoffice-5.2.0.6/pageoffice.js",
    "/static/plugins/echarts-4.9.0/echarts.common.min.js",
    "https://gw.alipayobjects.com/os/antv/pkg/_antv.hierarchy-0.4.0/build/hierarchy.js",
    "https://api.map.baidu.com/api?v=2.0&ak=28209425e505ba8c3c4ade607ca46fd7&__ec_v__=20190126"
  ]
};
module.exports = {
publicPath: '/',//dynamicPublicPath为true时不设置任何值
assetsDir: VersionCode,
chainWebpack: (config) => {
  config.plugin("html").tap((args) => {
      args[0].minify = false;
      args[0].cdn = cdn
      return args;
    });
 },
configureWebpack: (config) => {
    config.plugins.push(new VersionPlugin());
}
}
//package.json
// 通过config适配不同配置,默认为当前process.env.NODE_ENV值，对应config 文件夹下的index-{name}文件
 "scripts": {
    "serve": "vue-cli-service serve --open",
    "build": "vue-cli-service build --no-clean --report",
    "qa": "vue-cli-service build --no-clean --report --config qa"
  }
//main.js dynamicPublicPath设置true时
if (window.SITE_CONFIG["publicPath"])
  __webpack_public_path__ = window.SITE_CONFIG["publicPath"]
```