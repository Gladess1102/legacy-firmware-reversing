# 协议逆向与安全刷写方法论 (Safe Flashing & Protocol Harness)

在对无官方源码的老旧嵌入式设备（如 MP3、收音机、录音笔、工控机等）进行固件逆向与注入时，**底线是绝对不能变砖（Zero-Brick Policy）**。本指南总结了在黑盒环境下探测通信通道、规避传输挂起、保护物理扇区结构与安全写入固件的完整工程范式。

---

## 1. 通信协议探测与厂商扩展命令 (Vendor SCSI / USB)

许多 USB 嵌入式设备在正常模式下枚举为标准大容量存储（USB Mass Storage Class, MSC），但在深层驱动中保留了厂商私有调试/刷写通道。

### 1.1 协议层探测原则
- **优先寻找“厂商扩展（Vendor Specific）”命令**：
  - SCSI 标准定义了 Group 6 / Group 7 厂商自定命令（如 OpCode `0xC0` 读、`0xC1` 写、`0xC2` 起客户自定）。
  - 通过 SCSI Pass-Through（CDB 16 字节构造）直接下发命令，绕过操作系统标准文件系统层。
- **只读探活先行**：
  - 在尝试写入前，穷举只读探测命令（如 `C0 01`, `C0 12 GetTargetInfo`, `C0 13 ReadTargetPage`）。
  - 确认设备是否返回合理的芯片 ID、Flash 布局、目标分区（Target ID）信息。
- **不要迷信“格式化”假象**：
  - 当一个写类命令（如 `C1 23`）因为参数格式错误导致设备挂起或文件系统损坏时，切勿轻易断定“该命令是格式化命令”。很可能是由于参数打包错误导致固件内部状态机崩溃的副作用。

---

## 2. USB Bulk-Only Transport (BOT) 的“短包终止陷阱”

这是导致设备频繁挂起（`no_csw` / 超时）、被误认为“硬件断开”的最常见根因。

### 2.1 陷阱机制
USB Bulk 传输规范中，主机请求数据传输时，如果请求的长度不是端点包大小（通常为 512 字节）的整数倍，且设备返回的数据长度少于请求长度，USB 底层栈（如 macOS / Linux 的 libusb）会持续等待后续数据包直到超时。

### 2.2 规范准则
1. **统一按 512 字节分块请求**：
   - 无论设备实际返回是 56 字节（如 INQUIRY）、64 字节还是 2048 字节，主机读取数据相时**始终固定请求 512 字节的整数倍**，依靠 USB Short Packet（小于 512 字节的包或空包）作为自然的事务终止标志。
2. **每条命令必读 CSW**：
   - 严格遵循 `CBW (Command Block Wrapper) -> Data Phase -> CSW (Command Status Wrapper)` 状态机。
   - CSW 状态判定：`csw[3]` 为 Status（0x00 为成功），`csw[2]` 为 Data Residue（剩余未传输字节），不可颠倒。
3. **探活代替 INQUIRY**：
   - 部分老旧固件在挂载状态切换期间会忽略标准 `INQUIRY`，但依然响应 `TEST UNIT READY`（OpCode `0x00`）。应将 `TEST UNIT READY` 作为第一存活心跳。

---

## 3. Flash 物理扇区与尾标保护机制 (Sector Tail Integrity)

老旧 NAND Flash 控制器（如 SigmaTel STMP35xx 系列）并非纯净的线性存储介质，其物理页扇区内混杂了硬件 ECC、逻辑标记与校验尾标。

### 3.1 扇区物理布局识别
- 典型布局：以 2048 字节页为例，通常划分为 4 个 512 字节的物理扇区。
- **扇区有效负载（Payload）与尾标（Tail）**：
  - 前 510 字节为代码/资源数据。
  - 末 2 字节为硬件/分区尾标（例如 `0xDE 0xDE`）。
  - 亦存在部分扇区末 2 字节为合法的数据/指令（如 `0x01 0x01` 或 `0x27 0xE4`）。

### 3.2 黄金安全法则
1. **绝对禁止全量硬编码填充尾标**：
   - 逆向脚本切忌机械地将所有扇区的末 2 字节盲目写死为 `0xDE 0xDE`。
   - 必须对比原厂备份 Dump，建立扇区尾标白名单。除确认为填充标记的扇区外，保留所有原始数据。
2. **受保护扇区与尾部页锁死**：
   - 识别出引导区（Bootloader, Target 05）、校准与序列号区（如最后的 20 页，876-895 页）后，在刷写脚本中加入硬断言（Assert），一旦修改范围触碰保护页立即抛出异常并终止。
3. **全镜像尺寸严格校验**：
   - 输出镜像必须严格等于物理 Flash 分区的原始字节大小（例如严格 $896 \times 2048 = 1,835,008$ 字节），1 字节不可多，1 字节不可少。

---

## 4. 安全刷写与回滚工程化脚本设计

一个合格的刷写脚本必须具备完整的安全屏障：

```python
# 标准安全流水线参考模式
class SafeFlasher:
    def verify_image(self, img_data, baseline_dump):
        assert len(img_data) == 1835008, "尺寸不合法！"
        
        # 保护尾部页（例如硬件校准与系统配置）
        protected_start = 876 * 2048
        assert img_data[protected_start:] == baseline_dump[protected_start:], \
            "危险：尝试修改受保护的物理尾部页！"
            
        # 校验扇区尾标分布
        for s in range(len(img_data) // 512):
            tail = img_data[s*512+510 : (s+1)*512]
            orig_tail = baseline_dump[s*512+510 : (s+1)*512]
            # 确保非 0xDEDE 的关键数据扇区尾部未被破坏
            if orig_tail not in (b'\xde\xde', b'\xff\xff'):
                assert tail == orig_tail, f"扇区 {s} 特殊尾标被意外篡改！"

    def execute_flash(self, img_data):
        # 1. 探活 (TEST UNIT READY)
        # 2. 擦除逻辑驱动器 (C1 2F <target>)
        # 3. 按页写入 (C1 23 <target> <page> <count>) 配合 512B 分块发送
        # 4. 提交并复位芯片 (C1 31)
        pass
```

### 4.1 随时就绪的回滚链
在执行任何新固件实验前，必须保证回滚基线文件就在本地同一目录下，且命令已预设完毕：
```bash
# 紧急回滚标准命令格式
sudo python3 flash_tool.py --execute --img artifacts/firmware_verified_baseline.bin
```
任何实验失败后，第一优先级永远是原路恢复基线，确认设备物理心跳完好，再开展下一轮离线分析。
