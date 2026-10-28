#!/usr/bin/env python3
"""
safe_flasher.py — 零变砖刷写脚本骨架（SigmaTel STMP35xx 家族实测范式）

本骨架提炼自 Sharp MP-B300 真机 26 次刷写实战，要点：
  1. BOT 短包终止：数据相永远按 512B 整数倍请求，靠 Short Packet 自然截断
  2. CSW 解析：csw[3]=status, csw[2]=residue（勿颠倒）
  3. 存活探活用 TEST UNIT READY（INQUIRY 在状态切换期会失聪）
  4. 刷前断言：尺寸 / 保护页 / 扇区尾标白名单，任何一条不过立即拒绝执行
  5. 回滚链：baseline 文件与刷写命令同目录预设

用法：
  python3 safe_flasher.py check  --img NEW.bin --baseline BASELINE.bin
  python3 safe_flasher.py flash  --img NEW.bin --baseline BASELINE.bin --execute
  （不带 --execute 时 flash 子命令只做校验，不碰设备）

依赖：pyusb (`pip install pyusb`)，macOS 需 sudo claim interface。
适配其他 SigmaTel 设备时，改 DEVICE_VIDPID / PAGE_SIZE / PROTECTED_PAGES 三个常量。
"""
import argparse
import hashlib
import sys

# ── 设备常量（按目标设备修改）────────────────────────────────────────────
DEVICE_VIDPID   = (0x04DD, 0x90C8)   # Sharp MP-B300 正常模式
PAGE_SIZE       = 2048               # 物理页
SECTOR_SIZE     = 512                # 物理扇区 = 页/4
SECTOR_DATA     = 510                # 有效负载；末 2 字节为尾标
IMAGESIZE       = 896 * PAGE_SIZE    # 1,835,008
PROTECTED_PAGES = set(range(876, 896))  # 物理尾部校准/配置页，绝对禁改
# 尾标白名单之外的值视为"特殊数据尾标"，必须与 baseline 逐字节一致
FILLER_TAILS = {b"\xde\xde", b"\xff\xff"}

# SCSI 厂商命令（STMP35xx GROUP6: C0=READ C1=WRITE + Updater Command ID）
OP_VENDOR_READ  = 0xC0
OP_VENDOR_WRITE = 0xC1
CMD_READ_PAGE   = 0x13   # C0 13 <target> <page u64 BE> <count u32 BE>
CMD_ERASE_LOGIC = 0x2F   # C1 2F <target>
CMD_WRITE_PAGE  = 0x23   # C1 23 <target> <page u64 BE> <count u32 BE> + data
CMD_RESET       = 0x31   # C1 31


def md5(b: bytes) -> str:
    return hashlib.md5(b).hexdigest()


def check_image(img: bytes, baseline: bytes) -> list[str]:
    """刷前安全断言。返回问题列表；空列表 = 可以刷。"""
    problems = []
    if len(img) != IMAGESIZE:
        problems.append(f"尺寸不合法：{len(img)} != {IMAGESIZE}（1 字节不能多，1 字节不能少）")
        return problems
    if len(baseline) != IMAGESIZE:
        problems.append(f"baseline 尺寸异常：{len(baseline)}")
        return problems

    # 1) 保护页：逐字节必须与 baseline 一致
    for page in sorted(PROTECTED_PAGES):
        s, e = page * PAGE_SIZE, (page + 1) * PAGE_SIZE
        if img[s:e] != baseline[s:e]:
            problems.append(f"保护页 {page} 被修改（{s:#x}-{e:#x}）—— 绝对禁止")

    # 2) 扇区尾标：非填充尾标必须与 baseline 一致
    n_sectors = len(img) // SECTOR_SIZE
    for sec in range(n_sectors):
        tail_off = sec * SECTOR_SIZE + SECTOR_DATA
        tail = img[tail_off : sec * SECTOR_SIZE + SECTOR_SIZE]
        orig = baseline[tail_off : sec * SECTOR_SIZE + SECTOR_SIZE]
        if tail in FILLER_TAILS:
            continue  # 填充尾标，允许随数据变化
        if tail != orig:
            problems.append(
                f"扇区 {sec}（页 {sec // 4}）特殊尾标 {orig.hex()} → {tail.hex()} 被篡改"
            )

    # 3) 改动摘要（给人看的最后一道视觉确认）
    diffs = sum(1 for a, b in zip(img, baseline) if a != b)
    if diffs == 0:
        problems.append("镜像与 baseline 完全相同，无刷写意义")
    else:
        changed_pages = sorted({
            p for p in range(IMAGESIZE // PAGE_SIZE)
            if img[p*PAGE_SIZE:(p+1)*PAGE_SIZE] != baseline[p*PAGE_SIZE:(p+1)*PAGE_SIZE]
        })
        print(f"[i] 与 baseline 差异 {diffs} 字节，落在 {len(changed_pages)} 页: "
              f"{changed_pages[:20]}{'...' if len(changed_pages) > 20 else ''}")
    return problems


def open_device():
    """claim USB interface。返回 (dev, ep_in, ep_out)。macOS 需 sudo。"""
    import usb.core  # pyusb
    dev = usb.core.find(idVendor=DEVICE_VIDPID[0], idProduct=DEVICE_VIDPID[1])
    if dev is None:
        sys.exit("[!] 未找到设备。插好 USB，确认设备处于 LINK 状态。")
    try:
        dev.set_configuration()
    except Exception:
        pass
    itf = dev.get_active_configuration()[(0, 0)]
    ep_in = next(e for e in itf if e.bEndpointAddress & 0x80)
    ep_out = next(e for e in itf if not (e.bEndpointAddress & 0x80))
    try:
        dev.clear_halt(ep_in)
        dev.clear_halt(ep_out)
    except Exception:
        pass
    return dev, ep_in, ep_out


def scsi_cmd(dev, ep_in, ep_out, cdb: bytes, data_len: int, data: bytes | None = None):
    """BOT 封装。读相固定 512B 分块（短包终止陷阱！），写相 512B 分块。"""
    import struct
    import usb.core
    TAG = [0x1234]
    TAG[0] += 1
    cbw = struct.pack("<IIIBBB", 0x43425355, TAG[0], data_len,
                      0x80 if (data is None and data_len) else 0x00, 0, len(cdb))
    cbw += cdb.ljust(16, b"\x00")[:16]
    dev.write(ep_out, cbw, 5000)
    got, chunks = 0, b""
    if data is None and data_len:
        while got < data_len:
            try:
                chunk = bytes(dev.read(ep_in, 512, 5000))  # ← 永远 512！
            except usb.core.USBError:
                break
            if len(chunk) < 512:
                chunks += chunk
                break  # Short Packet = 数据相结束
            chunks += chunk
            got += len(chunk)
        data_ret = chunks
    elif data is not None:
        for off in range(0, len(data), 512):
            dev.write(ep_out, data[off:off + 512], 5000)
        data_ret = b""
    else:
        data_ret = b""
    csw = bytes(dev.read(ep_in, 13, 5000))
    status = csw[12] if len(csw) >= 13 else -1
    return status, data_ret


def do_flash(img: bytes):
    dev, ep_in, ep_out = open_device()
    target = 0x08  # 资源分区（按设备修改）
    # 探活：TEST UNIT READY（INQUIRY 在部分状态下失聪）
    st, _ = scsi_cmd(dev, ep_in, ep_out, b"\x00" * 16, 0)
    print(f"[i] TEST UNIT READY status={st}")
    # 整盘擦除
    st, _ = scsi_cmd(dev, ep_in, ep_out, bytes([OP_VENDOR_WRITE, CMD_ERASE_LOGIC, target]) + b"\x00" * 13, 0)
    print(f"[i] erase status={st}")
    # 逐页写入（512B 分块 + 逐页 CSW）
    n_pages = len(img) // PAGE_SIZE
    for page in range(n_pages):
        pdata = img[page * PAGE_SIZE:(page + 1) * PAGE_SIZE]
        cdb = bytes([OP_VENDOR_WRITE, CMD_WRITE_PAGE, target]) + \
              page.to_bytes(8, "big") + (1).to_bytes(4, "big") + b"\x00"
        st, _ = scsi_cmd(dev, ep_in, ep_out, cdb, len(pdata), data=pdata)
        if st != 0:
            sys.exit(f"[!] page {page} 写入失败 status={st}，立即停止并回滚")
        if page % 100 == 0:
            print(f"    page {page}/{n_pages}")
    # 提交 + 复位
    scsi_cmd(dev, ep_in, ep_out, bytes([OP_VENDOR_WRITE, CMD_RESET]) + b"\x00" * 14, 0)
    print("[+] 完成。拔 USB、重启设备验证；异常则立即刷回 baseline。")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["check", "flash"])
    ap.add_argument("--img", required=True)
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--execute", action="store_true")
    a = ap.parse_args()

    img = open(a.img, "rb").read()
    baseline = open(a.baseline, "rb").read()
    print(f"[i] img md5={md5(img)[:12]}  baseline md5={md5(baseline)[:12]}")
    problems = check_image(img, baseline)
    if problems:
        print("\n[!] 安全断言未通过：")
        for p in problems[:20]:
            print("   -", p)
        sys.exit(1)
    print("[+] 安全断言全部通过")
    if a.action == "flash":
        if not a.execute:
            print("[i] dry-run 通过。加 --execute 真写。")
            return
        do_flash(img)


if __name__ == "__main__":
    main()
