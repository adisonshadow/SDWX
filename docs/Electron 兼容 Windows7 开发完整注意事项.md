# Electron兼容Windows7开发完整注意事项
> **官方硬规则：Electron 23+ 彻底不再支持Win7，完全无法运行。Electron **22.x** 是**官方最后一个声明支持Win7**的大版本（Chromium109），2023‑05‑30停止安全维护，不再接收安全补丁。**
> ⚠️ Electron22只是**声明能跑Win7**，实际Win7机器必须打补丁、装运行库，否则闪退、报`无法定位程序输入点`、0xc0000142错误。

## 1、版本锁定（package.json强制写死，不能用^波浪号）
### 推荐组合（最稳妥，Electron22最新patch）
```json
{
  "devDependencies": {
    "electron": "22.3.27",
    "electron-builder": "23.6.0"
  }
}
```
- **Electron：严格固定 `22.3.27`（22分支最终补丁版），禁止>=23**
- **electron‑builder最高锁23.6.0**；builder24+会生成Win7不可识别安装包
- 开发本机Node版本：**Node.js 16.x LTS**（Node18+不兼容Electron22）
> 不要用 ^22.3.27，避免npm意外安装23版本。

> 备选降级方案：如果22在部分精简Ghost Win7大量崩溃，退到 **electron@11.5.0**，但Chromium版本更低，部分现代JS/CSS特性缺失，**必须关闭沙箱 `app.enableSandbox = false`**。

## 2、主进程必须配置（main.js第一行，app ready之前）
```javascript
// 必须写在所有electron API调用之前！
const { app } = require('electron')

// Electron22在Win7上强烈建议关闭沙箱，否则部分精简系统直接崩溃
app.enableSandbox = false;

// 关闭GPU硬件加速，很多老旧Win7显卡驱动会导致白屏/闪退
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('--disable‑gpu');
```
> Electron11及以下兼容Win7也必须设置`app.enableSandbox = false`，关闭会带来安全风险，业务上要评估风险。

## 3、Windows7目标机器系统硬性依赖（客户环境必须具备）
缺少下面任意一项大概率闪退，**没有任何报错，进程直接消失**：
1. Windows7 **必须安装 Service Pack1 SP1**，原版未打SP1完全跑不了
2. 系统关键补丁 **KB2533623**（提供新的系统API，报错`无法定位程序输入点KERNEL32.dll`就是缺这个补丁）
3. **VC++ 2015‑2022 Redistributable x86/x64运行库**，很多Ghost版Win7缺失，报0xc0000142错误
4. .NET Framework 4.8（部分原生模块需要）

> 交付给客户文档必须写明前置依赖，打包安装包可以把VC++运行库作为前置依赖，electron‑builder可以配置安装时自动检测安装。

## 4、打包配置(electron‑builder)重点坑
```json
"build": {
  "win": {
    // 同时输出ia32(32位) + x64，很多工控Win7是32位系统
    "target": [
      {
        "target": "nsis",
        "arch": ["ia32", "x64"]
      }
    ],
    "artifactName": "${productName}-${version}-${arch}.exe"
  },
  "nsis": {
    // 把VC++运行库打包进安装包，安装阶段自动安装
    "include": "build/installer.nsh"
  }
}
```
- **务必打ia32（32位包）：大量工控Win7是32位系统，只有64位包无法安装运行**
- 不要开启高压缩`compression:maximum`，部分精简Win7解压异常，建议`compression:normal`
- asar可以正常开启；极少数原生模块异常才关闭asar。
- **不要使用electron‑builder24+**，24开始不再生成兼容Win7的安装程序。

## 5、业务代码、前端限制
1. **前端浏览器内核是Chromium109（electron22）**：
   - ES6+大部分支持，但部分较新JS API、CSS新特性不可用；不要用非常新的web API。
   - 不能用Chrome110+才支持的JS语法。
2. **npm依赖包不能用过高版本**：
   - 原生C++模块：全部要用`electron‑rebuild --version=22.3.27`重新编译，**不能直接使用node预编译二进制包**，否则Win7直接崩溃。
   - axios、vue/react可以用，但不要追求最新大版本；高版本框架会依赖更高JS特性。
3. 网络：TLS版本，Win7默认TLS1.0/1.1，服务端如果只开放TLS1.3，会请求失败，服务端需要兼容TLS1.2。
4. 不要使用Electron23之后新增的API，写代码注意API文档版本。

## 6、重大风险，一定要提前告知客户
1. Electron22 **已经停止官方安全更新，存在已知安全漏洞，不会修复**，仅适合内网工控业务；公网业务强烈建议尽量升级Win10/11。
2. 网上大量Ghost精简版Win7，会裁剪系统dll，即使打全补丁，也会随机崩溃，这属于系统本身问题，程序无法规避。
3. 显卡驱动老旧机器，即使关闭硬件加速，仍会偶发白屏、卡顿。

## 7、测试建议
- 搭建纯净原版Win7 SP1测试机（不要用网上精简Ghost镜像），分别测试32位、64位环境。
- 复现客户真实环境：不联网、内网环境，确认所有补丁、运行库缺失时的表现。
- 崩溃排查：Win7事件查看器 → Windows日志‑应用程序，查看程序崩溃异常模块。

## 常见报错速查
|报错现象|根因|
|---|---|
|无法定位程序输入点xxx KERNEL32.dll|缺少KB2533623补丁，或electron>=23|
|0xc0000142启动失败|缺少VC++运行库|
|双击exe无反应，进程一闪消失|未关闭沙箱、未关闭GPU加速，或者系统是无SP1原版Win7|
|不是有效的Win32应用程序|运行electron23+，或者在32位Win7跑64位exe包|

### 备选方案思考
如果后期业务安全要求高，不希望使用停止维护的Electron22：可以把应用做成web网页，Win7用Chrome109浏览器打开，不需要Electron桌面壳。

如果你需要，我可以给你完整最小可运行demo的main.js、完整electron‑builder配置以及nsis脚本模板（自动安装VC++运行库）。
