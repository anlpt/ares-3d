# ARES 3D

Trang giới thiệu 3D tương tác cho ARES, gộp nội dung của hai repo:

- [blm2006/ARES](https://github.com/blm2006/ARES): hệ thống thật (camera + YOLO đếm người theo vùng, đèn PWM, điều hòa pre-cooling, MQTT/ESP32, học chủ động, retrain đêm).
- [namly2610-prog/web-ares](https://github.com/namly2610-prog/web-ares): trang sản phẩm (thông điệp, mô hình tòa nhà, gói giá).

## Chạy

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # kiểm tra phần mô phỏng (vitest)
npm run build    # bản tĩnh trong dist/
```

## Cấu trúc

```
src/sim/      Port các công thức trong ares/formulas.py + bộ điều khiển đèn/điều hòa rút gọn + mô hình phòng giả định
src/scene/    Three.js: tòa nhà, phòng P101, người, camera/YOLO, vùng, bộ đệm, điều hòa, vòng học chủ động, MQTT
src/story/    Kịch bản 11 chương (vị trí máy quay, lớp hiển thị, trạng thái mô phỏng) và đạo diễn chuyển cảnh
src/ui/       HUD, biểu đồ pre-cooling, bàn điều khiển mô phỏng
src/styles/   Token màu/chữ và CSS từng phần
```

Số tiết kiệm điện trên trang lấy từ mô phỏng trong `ARES_UPGRADE.md` của repo ARES, không phải số đo thực tế.
Mô hình vật lý phòng trong `src/sim/world.js` cũng là giả định, chỉ để minh họa logic điều khiển.
