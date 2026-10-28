# CREDITS — 站在谁的肩膀上

本项目是一场多 Agent 协作真机逆向攻坚的直接产物。没有下面这些人和项目，这套方法论不会存在。
按贡献顺序实名致谢（拼写与署名均以其公开身份为准）。

---

## 开源项目与个人

### mborgerson — [xemu-project/dsp56300](https://github.com/xemu-project/dsp56300)
本项目 PC 端仿真的绝对基座。其 Cranelift-JIT DSP56300 模拟器（经与真硅差分测试验证）与反汇编器，
让我们在不用真机的情况下单步执行了从夏普固件中剥离的 tuner 驱动模块（CID 22/26），
并完成了 89.9MHz vs 90.0MHz 的 80 万周期全内存 Diff——断崖机制模型的关键证据即来源于此。
本项目**未分发其任何代码**，仅作为外部工具引用；模拟器包装层源码见 [`case-studies/`](./case-studies/) 中的引用说明。

### Ivan Zupan — Rockbox `lv24020lp.c` 驱动作者
Rockbox 固件中的 Sanyo LV24020LP 调谐器驱动是理解 LV2400x 家族"软件调谐"架构的钥匙：
CAP/OSC 双寄存器闭环、set & measure 算法、3-wire 时序。我们对夏普私有 3-wire 位流的全部解读，
都以这份驱动（GPLv2，[Rockbox 仓库](https://github.com/Rockbox/rockbox/blob/master/firmware/drivers/tuner/lv24020lp.c)）为对照系。
本项目未分发其代码；寄存器地址与位定义本身出自 Sanyo 公开文档（见下）。

### Rockbox 项目 — [rockbox.org](https://www.rockbox.org)
除上述驱动外，Rockbox wiki 的 DataSheets 库托管了 Sanyo AN2400S04 官方应用笔记，
使我们在不拆机的情况下拿到了 LV2400x 的完整软件调谐规范。

## 厂商公开技术文档

- **Sanyo Electric Semiconductor** — `AN2400S04`（LV24000/01/02 软件调谐应用笔记, V0.4）、
  `LV24002` / `LV24020LP` datasheet。本文所有 LV2400x 寄存器语义、扫描算法、负逻辑换算公式的权威出处。
- **SigmaTel / Freescale Semiconductor** — `STMP35xx D-Major™ Audio SoC Datasheet`（5-35xx-D1-1.04）第 29 章
  （Bootloader 命令格式 / 加密 / Boot 模式表）、`SigmaTel SDK 2.4xx Customization Guide`（5-3xxx-HG13）
  第 11.7 节 FM Tuner、第 20.2 节 GROUP6 厂商 SCSI 命令。MP-B300 的整个刷写协议建立在这些公开资料之上。

## Agent 攻坚团队（多机协同，按出场顺序）

这场持续数周、26 个固件版本的攻坚由三个异构 Agent 在同一台真机上接力完成，
彼此之间通过共享状态文件对抗假设漂移（方法论见
[`references/multi_agent_collaboration_protocol.md`](./references/multi_agent_collaboration_protocol.md)）：

| Agent | 模型/平台 | 核心贡献 |
|---|---|---|
| **DSH** (DeepSeek Harness) | DeepSeek V4.1 Flash (`deepseek-flash`) | 首创 USB MSC 厂商扩展命令（C0/C1）逆向；拿到 NAND 全盘 dump；写出第一版刷写通道 |
| **Antigravity** | Google Gemini | 字库/资源树结构解析、全量 GB2312 汉化流水线、大量合成器版本与 UI 修复 |
| **ZCode** (Z.ai) | GLM | DSP56004 指令级逆向（3-wire 引脚映射、调谐公式、AFC 机制）、PC JIT 仿真与替身桩、单变量证伪实验矩阵、本 Skill 的整理与提炼 |

三个 Agent 对同一问题多次得出相互矛盾的结论（例如 v9 与 v24 对同一钳位地址的不同判断），
最终全部通过真机单变量实验裁决——这也是本 Skill 把"证伪优先于推断"立为核心支柱的原因。

## 人类

**gladess（小G）** — 设备持有人、项目发起人、唯一的真机操作员。
全部 26 次刷机、每次断崖位置的人工听测、拆机风险评估与"奉陪到底"的决策都是他完成的。
本项目的实验设计约束（真机单次实验成本极高、观测靠人耳）直接塑造了方法论中
"实验必须可证伪、状态必须可恢复"的原则。

## 工具与生态

- **[Agent Skills 开放格式](https://github.com/anthropics/skills)**（Anthropic）— 本 Skill 的 `SKILL.md` frontmatter 结构遵循该开放规范。
- **DeepSeek Harness (DSH)** — cordis 插件系统；`dsh-plugin/` 的插件形态参考其本地插件约定（`dsh-web-search-tavily`、`session-archive-manager` 等社区插件的结构示范）。
- **libusb / pyusb** — macOS 上 SCSI Pass-Through 与 USB Bulk 传输的底层通道。
- **Homebrew** — libusb 等依赖的构建环境。
- **kakaku.com クチコミ掲示板** 与 **5bcl.com** — 拆机报告与珠三角 FM 频率表等社区资料。

## 引用本项目

若本项目或其方法论对你的工作有帮助，欢迎引用：

```bibtex
@misc{legacy-firmware-reversing-2026,
  author       = {gladess and the MP-B300 multi-agent team (DSH/DeepSeek, Antigravity/Gemini, ZCode/GLM)},
  title        = {legacy-firmware-reversing: a field-tested methodology for black-box
                  legacy firmware reverse engineering (SigmaTel STMP35xx case study)},
  year         = {2026},
  howpublished = {\url{https://github.com/TODO/legacy-firmware-reversing}},
  note         = {Agent Skills package + DSH plugin; case study: Sharp MP-B300}
}
```

---

*License: MIT — 见 [LICENSE](./LICENSE)。本项目与 Rockbox（GPLv2）、xemu（见其仓库声明）无代码级派生关系；
所有厂商文档版权归原厂商所有，此处仅作文献引用。*
