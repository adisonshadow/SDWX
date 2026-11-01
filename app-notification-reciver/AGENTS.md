# 异常呼叫通知程序

Windows 7 及以上的托盘程序。新呼叫出现在屏幕右上角：先是简要信息，点开后面板变高，可以看到全文并处理。关掉单条只是本机不再弹，托盘「显示面板」仍能看到未结束的呼叫。

## 设置

托盘右键和测量适配程序一样：显示面板、设置、窗口始终居于最上、版本、退出。齿轮也打开设置。

设置项：

- 接口地址。填 IPS 前端访问地址，开发环境一般是 `http://127.0.0.1:6082`。程序从这里访问 `/api/ips/...` 和 `/auth/me`。
- 登录。打开浏览器的 `/auth/notify-app`。登录成功后点「打开通知APP」，页面用 `notify-receiver://login?token=...` 把令牌交回本程序。令牌写在程序旁边的 `config.json`，不保存密码。
- 开机自启动。写当前用户的 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，值名 `app-notification-reciver`。
- 播放声音。关掉后，呼叫类型即使 `soundEnabled` 为真也不出声。
- 新通知出现时闪动 3 下。

窗口是否置顶由托盘菜单切换，并写入 `config.json` 的 `alwaysOnTop`。

## 接收

每 4 秒读取呼叫类型、未结束的流水和当前用户角色。类型上的 `roleIds` 与用户角色有交集才出现。`soundEnabled` 为真时按 `soundKey` 播放 `beep`、`alarm` 或 `chime`。

已接受写入 `acceptedBy`、`acceptedAt`，并把 `isResponded` 设为 true。处理完成写入 `completedAt`，同样把 `isResponded` 设为 true。已取消只改状态。

程序刚启动时，已经存在的呼叫不响、不闪，用托盘「显示面板」查看。这次登录交接到程序之后，当前仍是已发出的呼叫会弹出来。
