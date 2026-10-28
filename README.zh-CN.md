# legacy-firmware-reversing（经典固件黑盒逆向）

**一套经过 26 版真机实战检验的 Agent Skill + DSH 插件：黑盒老设备的固件逆向、全量汉化与安全刷写方法论。**

提炼自对 2004 年夏普 MP-B300（SigmaTel STMP3560 主控 · Motorola DSP56004 核心 · Sanyo LV24002 调谐器）
的多 Agent 协同攻坚——一台没有源码、没有公开刷机资料、厂商早已退场的设备。

[English](./README.md) · [致谢（实名）](./CREDITS.md) · [许可：MIT](./LICENSE)

---

## 仓库结构

```
├── SKILL.md                  Agent Skill 入口（开放 Agent-Skills frontmatter 格式）
├── references/               五大支柱深度指南
│   ├── protocol_and_safe_flashing.md        BOT 短包陷阱、扇区尾标完整性、零变砖闸门
│   ├── font_and_resource_injection.md       24-bit 资源树、私有字形字典、GB2312 全量注入
│   ├── dsp_and_jit_emulation.md             DSP56004 反汇编、替身桩、外设模拟、全内存 Diff
│   ├── hardware_vs_software_falsification.md  单变量证伪、do-a0 陷阱、软硬件边界四步判定法
│   └── multi_agent_collaboration_protocol.md  PROJECT-STATE.md 单一事实源纪律
├── templates/
│   ├── PROJECT-STATE.template.md   多 Agent 单一事实源模板
│   ├── EXPERIMENTS.template.md     证伪实验登记纪律
│   ├── safe_flasher.py             零变砖刷写骨架（碰设备之前先过全部断言）
│   └── surrogate_stub.S            DSP56300 桩模板（除法/消息记录/rts 毯）+ 已知暗坑清单
├── dsh-plugin/               DSH (DeepSeek Harness) cordis 插件，零依赖
│   ├── lib/core.js           安全闸门 / 双镜像 Diff / 实验格式化（纯函数）
│   ├── lib/index.js          cordis service 注册
│   └── bin/cli.js            独立 CLI：fw-recon check|diff|log
├── case-studies/MP-B300.md   本方法论来源的完整战役
└── CREDITS.md                实名致谢（见下）
```

## 一分钟介绍

https://github.com/Gladess1102/legacy-firmware-reversing/releases/download/v0.1.0/intro.mp4

*（或直接看仓库内的 `docs/assets/intro.mp4` —— 中英双语字幕，1080p）*

## 五大支柱

1. **零变砖的协议逆向**——厂商 SCSI 命令、USB BOT 短包终止陷阱、扇区尾标白名单、
   保护页断言，以及"每次刷机前就预设好"的回滚链。
2. **私有资源树重建与全量汉化**——24-bit 二进制描述符、视觉锚点恢复字形映射、
   零膨胀全字符集注入（6,763 个 GB2312 字形原位注入日文字库，**镜像总大小一个字节不变**）。
3. **异构 DSP 反汇编 + PC JIT 仿真替身桩**——不逆向整个内核，只桩掉调用点，把剥离的模块放到
   [xemu-project/dsp56300](https://github.com/xemu-project/dsp56300) 上跑，
   再对两个临界输入（89.9 vs 90.0 MHz）做全内存 Diff——一个字节定乾坤。
4. **证伪优先于推断**——26 版固件、每个假设都靠单变量修改 + 人耳观测裁决；
   这是区分"断崖移动了"和"断崖是物理的"的唯一纪律。
5. **多 Agent 抗漂移协同**——PROJECT-STATE.md 单一事实源 + 否证矩阵，
   让三个异构 AI（DeepSeek、Gemini、GLM）接力同一战役而不重复踩坑。

## 使用方式

### 作为 Agent Skill（Claude / ZCode / 任何兼容 Agent-Skills 的宿主）

把本仓库放进 skills 目录（或软链），或在面对黑盒固件任务时把 `SKILL.md` 作为上下文喂给 Agent。
references 按需加载。

### 作为 DSH 插件

```bash
ln -s "$PWD/dsh-plugin" ~/.dsh/profiles/desktop/local-packages/dsh-fw-recon
# 在 cordis.patch.yml 的 insert 列表登记后重启 DSH
```

### 作为独立 CLI（不需要 DSH）

```bash
# 刷前安全闸门——断言尺寸 / 保护页 / 扇区尾标白名单
fw-recon check  --img new.bin --baseline factory.bin

# 双镜像 Diff，剥离扇区尾标让代码 diff 干净
fw-recon diff   v10.bin v27.bin --strip

# 证伪实验登记（强制"先写预期、后记观测"）
fw-recon log    --id E27 --hypothesis "上限校验控制静音" \
                --action "NOP 0x16b03/0x16b2d 两处 jlt" \
                --expected "断崖移到 108 以上" \
                --observed "断崖仍在 90.0，开机正常" \
                --verdict falsified
```

## 本方法论在 MP-B300 上交付过的成果

- 全量中文本地化（280 条 UI 字符串 + 6,763 字 GB2312 字库，镜像零增长）
- 1GB NAND 全盘 dump、431MB 用户音库恢复
- 完整的 SCSI 厂商命令协议、3-wire 调谐器引脚映射、调谐公式与 AFC 机制模型
- 终局裁决：90MHz 断崖的 handler 存在于**运行时构造的 RAM 表**——任何静态补丁不可达，
  并给出硬件路线图

完整战役记录见 `case-studies/MP-B300.md`。

## 致谢

本项目站在真实的人的肩膀上：[mborgerson](https://github.com/xemu-project/dsp56300)
（DSP56300 JIT 模拟器）、[Ivan Zupan](https://github.com/Rockbox/rockbox/blob/master/firmware/drivers/tuner/lv24020lp.c)
（Rockbox LV24020LP 驱动）、Rockbox 社区（托管三洋 AN2400S04 应用笔记）、
SigmaTel/Sanyo 公开文档，以及三个 AI Agent（DSH/DeepSeek、Antigravity/Gemini、ZCode/GLM）
和执行了全部实验的人类操作员。
**实名致谢见 [CREDITS.md](./CREDITS.md)**——fork 时请保留。

## 作者

**gladess（小G）** — 设备持有人、战役发起人、全部 26 次刷机的真机操作员
（[GitHub: Gladess1102](https://github.com/Gladess1102)）。三个 AI Agent（DSH/DeepSeek、
Antigravity/Gemini、ZCode/GLM）负责分析，每一个变砖风险的决断和每一次听测都是他完成的。
完整团队致谢见 [CREDITS.md](./CREDITS.md)。

## 许可

MIT — 见 [LICENSE](./LICENSE)。与 Sharp、SigmaTel/Freescale、Sanyo 无隶属关系；
厂商文档仅作文献引用，不在本仓库分发。
