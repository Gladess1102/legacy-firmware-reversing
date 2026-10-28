---
name: legacy-firmware-reversing
description: >
  A complete, field-tested methodology for reverse engineering, localizing, and
  modifying legacy embedded firmware on black-box hardware (e.g., SigmaTel STMP,
  Motorola DSP56k, proprietary RTOS). Covers zero-brick SCSI/USB protocol
  reverse engineering, Flash sector tail integrity, proprietary font & resource
  tree reconstruction (full GB2312 injection), heterogeneous DSP disassembly &
  PC JIT emulation with surrogate stubs, rigorous single-variable falsification
  to distinguish software locks from physical hardware boundaries, and multi-agent
  anti-drift collaboration.
---

# 经典嵌入式设备黑盒逆向与固件重构方法论 (Legacy Firmware Reverse Engineering)

本 Skill 提炼自多位 Agent 针对 2004 年夏普 MP-B300（SigmaTel STMP3560 主控 + Motorola DSP56004/56300 核心 + Sanyo LV24002 调谐芯片）长达数十轮真机实战攻坚全记录。它提供了一套完整的黑盒工程方法论，用于指导在**无官方源码、无官方调试器、存在高砖机风险与物理硬件约束**的极限环境下开展逆向与重构。

---

## 核心方法论五大支柱 (Five Core Pillars)

```
┌────────────────────────────────────────────────────────────────────────┐
│                      嵌入式黑盒固件逆向工程体系                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌─────────────────┬─────────────┴───┬─────────────────┬──────────────┐
    ▼                 ▼                 ▼                 ▼              ▼
1. 协议与安全      2. 资源与字库     3. 异构 DSP 仿真   4. 假说证伪     5. 多 Agent
   零砖刷写          全量汉化注入       PC JIT 替身桩     软硬件边界判定   协同抗漂移
[BOT 短包/尾标]    [视觉锚点/槽位置换] [除法/消息桩/Diff] [do a0陷阱/LC] [PROJECT-STATE]
```

### 支柱一：协议逆向与安全刷写（底线：绝对零变砖）
- **USB Bulk-Only Transport (BOT) 短包终止陷阱**：读取数据相始终请求固定 512 字节分块，依靠 Short Packet 机制自然截断，严禁按残余字节随意请求导致操作系统 USB 驱动挂起。
- **物理扇区尾标（Sector Tail）完整性**：深入 NAND 物理扇区结构（如 510B 负载 + 2B 尾标），建立尾标白名单，杜绝全盘机械填充 `0xDEDE` 损坏特殊数据扇区。
- **受保护页硬断言与安全心跳**：脚本层锁死引导扇区（Bootloader）与校准页，用 `TEST UNIT READY` 替代易失效的 `INQUIRY` 作为存活判据。
- 详见详细指南：[protocol_and_safe_flashing.md](./references/protocol_and_safe_flashing.md)

### 支柱二：私有二进制资源树与全量汉化注入（零膨胀注入）
- **24-bit 二进制描述符逆向**：解析 `ID(3B) + Length(3B) + Type(3B)` 统一资源容器结构，识别字符串、字模与位图。
- **破解字符映射悖论**：打破对 ASCII / Shift-JIS / Unicode 的盲目假设，运用“全量提取转图 + 视觉锚点识别 + 字符频度反推”建立私有 GID（Glyph ID）字典。
- **零尺寸膨胀的全量 GB2312 注入**：利用未引用槽位与罕见字空间，原位替换 6,763 个汉字位图，保证固件镜像字节大小与扇区对齐 100% 不变。
- **像素级 UI 掩码修复**：分离静态背景位图与动态渲染文本，针对性消除背景遮罩上的残留线条与方括号瑕疵。
- 详见详细指南：[font_and_resource_injection.md](./references/font_and_resource_injection.md)

### 支柱三：专有架构反汇编与 PC 端 JIT 仿真（替身桩技术）
- **Motorola DSP56k 24-bit 架构处理**：处理独立的 P/X/Y 内存空间、并行数据传输指令与定标除法。
- **替身桩架构（Surrogate Stubbing）**：放弃逆向庞大复杂的未知常驻操作系统内核，针对调用点手写极简汇编桩（如除法桩 `$6A4C`、消息记录桩 `$68FD`），实现驱动模块在 PC 端的毫秒级独立执行。
- **协议级外设模拟（Peripheral Mocking）**：构建虚拟 3-Wire / I2C 寄存器状态机，闭环应答状态查询，让复杂调谐与音量控制流程自动走通。
- **全内存 Diff 法**：对仅差一个临界步进的两组输入（如 89.9MHz vs 90.0MHz）分别运行 80 万周期，全量对比 X/Y 内存镜像，瞬间定位核心分支变量与数组索引。
- 详见详细指南：[dsp_and_jit_emulation.md](./references/dsp_and_jit_emulation.md)

### 支柱四：假说证伪与软硬件物理边界判定
- **单变量修改与对偶对称原则**：对互逆映射系统（如 `CounterToFreq` 乘数与 `FreqToCounter` 除数），改动必须成对同步，防止虚假刻度位移误导判断。
- **DSP 硬件循环暗坑（`do a0` 陷阱）**：在硬件循环计数架构中，禁止盲目将带符号差值判断（`jle`）替换为 `NOP`，否则会导致计数器下溢为 $2^{24}$ 次死循环，引发白屏假死。
- **软硬件边界四步判定法**：
  1. 软件闸门放开 $\to$ 依旧无信号；
  2. 射频电容参数扰动 $\to$ 全频段无响应；
  3. 强行改变硬件换算常数 $\to$ 全频段失配与台位错乱；
  4. 结合 LC 谐振公式 $f = \frac{1}{2\pi \sqrt{LC}}$ 与本土市场 BOM 选料求证。
  四步闭环即可终局确证为物理硬件物料极限，果断停止软件死磕，收官最佳版本。
- 详见详细指南：[hardware_vs_software_falsification.md](./references/hardware_vs_software_falsification.md)

### 支柱五：多 Agent 跨会话协同抗漂移协议（Single Source of Truth）
- **`PROJECT-STATE.md` 规范**：统一维护“硬件事实”、“已否证清单”、“实验矩阵”与“黄金基线”。
- **杜绝假说失忆**：任何实验必须记录真机观测与深层归因，禁止后序 Agent 换汤不换药重复踩坑。
- **累加式基线演进**：新版本必须明确声明继承自哪一版有效成果，严禁在尝试新功能时意外回退已修好的字模或界面。
- 详见详细指南：[multi_agent_collaboration_protocol.md](./references/multi_agent_collaboration_protocol.md)

---

## 逆向攻坚决策树 (Actionable Decision Tree)

```
面对黑盒嵌入式设备需求
│
├── 需求 1: 刷机/读写固件
│   ├── 设备经常超时挂起？ ──► 检查 BOT 请求是否为 512B 整数倍；检查 CSW 解析
│   └── 刷入后无法开机？   ──► 检查物理扇区末 2 字节（尾标）；检查受保护页
│
├── 需求 2: 汉化与字库替换
│   ├── 字符编码全对不上？ ──► 提取全量位图转 PNG，找数字/字母锚点推导 GID
│   ├── 空间不足无法扩容？ ──► 盘点日文冷门字槽位，现代字体栅格化原位覆盖
│   └── 屏幕有残留遮罩杠？ ──► 定位背景 UI 位图，执行局部区域 Bit-clear
│
├── 需求 3: 破解功能/参数限制
│   ├── 静态代码分支看不懂？ ──► 提取模块，编写除法/系统调用桩，上 PC JIT 仿真
│   ├── 找不到具体判断点？   ──► 输入临界值 A 与 B，运行相同周期后 Diff 全内存
│   ├── 改了跳转后直接白屏？ ──► 检查是否跳过了硬件循环 (do a0) 的安全保护
│   └── 改了某参数断崖移动？ ──► 检查是否只改了单边乘除数；核验是否全频段失配
│
└── 需求 4: 判定是软件 Bug 还是硬件极限
    └── 按照【软硬件物理边界四步判定法】推演，四步闭环即确定硬件上限，交付稳定版。
```

---

## 快速查阅清单

- [安全刷写与协议规范 (protocol_and_safe_flashing.md)](./references/protocol_and_safe_flashing.md)
- [字模提取与全量注入 (font_and_resource_injection.md)](./references/font_and_resource_injection.md)
- [DSP 仿真与替身桩技术 (dsp_and_jit_emulation.md)](./references/dsp_and_jit_emulation.md)
- [假说证伪与硬件边界判定 (hardware_vs_software_falsification.md)](./references/hardware_vs_software_falsification.md)
- [多 Agent 协同规范 (multi_agent_collaboration_protocol.md)](./references/multi_agent_collaboration_protocol.md)

---

## 配套工具与模板 (Companion Tools & Templates)

| 资源 | 用途 | 何时加载 |
|---|---|---|
| [templates/PROJECT-STATE.template.md](./templates/PROJECT-STATE.template.md) | 多 Agent 单一事实源骨架 | **战役开始时立即建**，此后每会话首读 |
| [templates/EXPERIMENTS.template.md](./templates/EXPERIMENTS.template.md) | 证伪实验登记纪律（先预期后观测） | 每次真机/仿真实验前 |
| [templates/safe_flasher.py](./templates/safe_flasher.py) | 零变砖刷写骨架（尺寸/保护页/尾标三重断言） | 任何刷写动作之前 |
| [templates/surrogate_stub.S](./templates/surrogate_stub.S) | DSP56300 替身桩模板 + 已知暗坑（do-a0、JIT 缓存、位序） | 需要 PC 端仿真模块时 |
| [dsh-plugin/](./dsh-plugin/) | DSH 插件 + 独立 CLI：`fw-recon check/diff/log` | 有 node 环境时优先用 CLI 过闸门 |
| [case-studies/MP-B300.md](./case-studies/MP-B300.md) | 完整战役案例（SigmaTel/DSP56004/Sanyo LV24002） | 需要参照同类设备时 |

**CLI 速查**（零依赖，node >= 18）：

```bash
fw-recon check  --img new.bin --baseline factory.bin   # 刷前三重安全闸门
fw-recon diff   a.bin b.bin --strip                    # 剥尾标的双镜像 Diff
fw-recon log    --id E1 --hypothesis H --action A \
                --expected E --observed O --verdict falsified
```

## 出处与致谢 (Provenance & Attribution)

本 Skill 的每个技术结论都出自一次真实实验，且大量借助了开源社区的公开成果——
**DSP56300 JIT 仿真器出自 [mborgerson 的 xemu-project/dsp56300](https://github.com/xemu-project/dsp56300)；
LV2400x 调谐器寄存器语义的对照基准出自 [Ivan Zupan 为 Rockbox 编写的 lv24020lp 驱动](https://github.com/Rockbox/rockbox/blob/master/firmware/drivers/tuner/lv24020lp.c)；
三洋 AN2400S04 应用笔记经由 [Rockbox 社区的 DataSheets 库](https://www.rockbox.org/wiki/DataSheets) 获取；
STMP35xx datasheet 与 SigmaTel SDK 手册为 SigmaTel/Freescale 公开文档。**

攻坚由三个异构 AI Agent（DSH/DeepSeek、Antigravity/Gemini、ZCode/GLM）与一位人类操作员
（设备持有人 gladess/小G，全部真机实验的执行者与裁决者）接力完成。

**完整实名致谢与引用格式：[CREDITS.md](./CREDITS.md)——fork 与再分发时请保留。**
许可：[MIT](./LICENSE)。与 Sharp / SigmaTel / Sanyo 无隶属关系；厂商文档仅作引用、不随本仓库分发。
