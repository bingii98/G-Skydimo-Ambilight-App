# Sniff DIY mode — MELK / Honeycomb triangle

Hướng dẫn bắt protocol **tô từng panel/LED** từ app mobile để bật custom animation thật trên PC.

> **Quan trọng:** MELK-OA21 (strip) **không** có DIY per-LED. Cần thiết bị **tam giác / honeycomb** và app gốc có mode vẽ.

## App Lotus — không có chế độ vẽ

Nhiều thiết bị **Lotus / MELK-OA21 (strip)** chỉ có app với:

- Chọn **màu cố định**
- Chọn **effect có sẵn** (animation firmware — đã hỗ trợ trên PC)
- **Không** có DIY / canvas / tô từng panel

→ **Không thể sniff per-LED** qua app Lotus. Đây là giới hạn app + phần cứng, không phải lỗi PC-Skydimo.

### Nếu bạn chỉ có strip OA21 (Lotus)

| Mục tiêu | Khả thi? |
|----------|----------|
| Effect firmware (rainbow, fire…) | ✅ Đã chạy — tab Animation trên PC |
| Custom animation từng LED | ❌ Strip single-zone |
| Custom màu “breath/pulse” cả dải | ⚠️ Có thể làm trên PC (app render → 1 RGB), chưa bật UI |

### Hướng sniff thay thế (khi không có DIY)

1. **Sniff đổi màu + đổi effect** trong app Lotus (nRF Connect log `fff3`):
   - Baseline: chọn đỏ → lưu frame `05 03`
   - Chọn effect “Fire” → lưu frame `03 [mode]`
   - Giúp xác nhận protocol, **không** mở per-LED

2. **Thử app generic ELK-BLEDOM** (Magic Home / SunHome / “LED BLE”):
   - Cùng chip BLE, đôi khi có thêm tính năng — hiếm có vẽ từng LED trên strip

3. **Panel tam giác thật** (Nanoleaf-style, tên BLE kiểu `HONEYCOMB` / `TRIANGULAR`):
   - App khác (MELK honeycomb, không phải Lotus strip) — mới có thể có DIY
   - Hoặc sniff Wireshark + nRF dongle khi đổi scene trên app panel

4. **Brute-force trên PC** (đã thử OA21):
   ```bash
   node scripts/ble-honeycomb-led-probe.js --device-id=<id>
   ```
   OA21: cả strip một màu → không có per-LED qua candidate hiện tại.


| Công cụ | Mục đích |
|---------|----------|
| **nRF Connect** (Android/iOS) | Log write characteristic `fff3` |
| PC + repo này | Parse + replay frame |
| Panel tam giác | Thiết bị mục tiêu |

1. Cài [nRF Connect](https://www.nordicsemi.com/Products/Development-tools/nRF-Connect-for-mobile).
2. Ghi lại **tên BLE** chính xác (vd. `MELK-OAxx`, `HONEYCOMB…`).
3. Trong app gốc, tìm mode **DIY / Canvas / Vẽ / Custom scene** (không phải tab Animation có sẵn).

## Quy trình sniff (nRF Connect)

### Bước 1 — Baseline

1. Mở nRF Connect → Scan → Connect panel.
2. Mở service `0000fff0-…` → characteristic **`0000fff3`** (Write).
3. Bật **Log** / ghi lại mọi write (nếu app có macro log).
4. Trong app gốc: bật đèn, chọn **một màu đỏ cả panel** → lưu frame baseline (`05 03` single RGB).

### Bước 2 — Vẽ 1 panel/LED

1. **Thoát app gốc khỏi BLE** trên phone (disconnect trong nRF Connect nếu app đang giữ connection).
2. Vào **DIY paint** trong app gốc.
3. Tô **một góc / LED duy nhất** màu xanh dương, phần còn lại đỏ.
4. Trong nRF Connect, copy **toàn bộ hex write** ngay sau thao tác tô (thường 1–N frame).

### Bước 3 — Lặp với index khác

Lặp lại với **LED/panel khác** (vd. index 3 màu xanh lá). Ghi chú rõ từng frame.

### Bước 4 — Lưu capture

Tạo file `scripts/captures/my-panel.json`:

```json
{
  "deviceName": "MELK-XXXX",
  "frames": [
    { "note": "baseline all red", "hex": "7e 00 05 03 ff 00 00 00 ef" },
    { "note": "led 0 blue", "hex": "7e 07 05 06 00 00 00 ff ef" },
    { "note": "led 3 green", "hex": "7e 07 05 06 03 00 ff 00 ef" }
  ]
}
```

Hoặc file `.txt` (mỗi dòng một frame + ghi chú):

```
7e 00 05 03 ff 00 00 00 ef  # baseline all red
7e 07 05 06 00 00 00 ff ef  # led 0 blue
7e 07 05 06 03 00 ff 00 ef  # led 3 green
```

## Phân tích trên PC

```bash
node scripts/ble-diy-parse.js scripts/captures/my-panel.json
```

Script sẽ:

- Phân loại frame (single RGB / effect / DIY candidate)
- So sánh frame có ghi chú `led 0` vs `led 3` → **đoán byte index**
- In gợi ý patch cho `buildHoneycombLedColorCommand`

## Replay để xác nhận

1. **Disconnect app mobile** hoàn toàn.
2. Chạy:

```bash
node scripts/ble-diy-replay.js scripts/captures/my-panel.json --device-id=<ble-id>
```

3. Quan sát panel: từng panel/LED có đổi màu riêng không?

Nếu **đúng** → gửi file capture; cập nhật `multiPixelVerified: true` trong `HONEYCOMB_TRI` profile.

Nếu **sai** (cả chuỗi 1 màu) → thử capture thêm:
- Frame **vào/ra DIY mode** (enter/commit)
- Frame khi tô **2 LED cùng lúc**
- Characteristic khác ngoài `fff3`

## Wireshark (tùy chọn, chính xác hơn)

Nếu có **nRF52840 dongle**, xem [elkbledom sniffing guide](https://github.com/dave-code-ruiz/elkbledom/blob/main/sniffing_ble_device.md) — bắt over-the-air trong khi phone + app đang dùng (không cần disconnect).

## Kết quả probe OA21 (strip) — 2026-05-28

Candidate `7e 07 05 06 [index] R G B ef` trên **MELK-OA21**:

- Lệnh được accept, nhưng **cả strip một màu** → strip single-zone.

## Frame ELK tham khảo

| Loại | Pattern |
|------|---------|
| Single RGB | `7e .. 05 03 R G B .. ef` |
| Firmware effect | `7e .. 03 [mode] .. ef` |
| DIY (candidate) | `7e .. 05 06 [index] R G B ef` |

## Scripts liên quan

| Script | Việc làm |
|--------|----------|
| `ble-diy-parse.js` | Phân tích capture |
| `ble-diy-replay.js` | Gửi lại lên hardware |
| `ble-honeycomb-led-probe.js` | Thử variant khi chưa có sniff |
| `ble-honeycomb-pixel-test.js` | Test `setPixels` sau khi verify |

## Sau khi sniff thành công

1. Cập nhật `services/lotusLampProtocol.js` — builder đúng format.
2. `HONEYCOMB_TRI.multiPixelVerified = true` trong `elkBleProfiles.js`.
3. App PC gửi per-LED thật → custom animation (Skydimo render từng LED) có thể bật dần (chú ý BLE ~100ms/frame).
