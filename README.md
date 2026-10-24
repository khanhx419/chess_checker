# Chess Checker Pro

Ứng dụng React/TypeScript để chơi với Stockfish, nhập PGN, phân tích ván đấu và thử các nhánh khác nhau.

## Chạy dự án

```sh
npm ci
npm run dev
```

```sh
npm run lint
npm run build
npm run preview
npm test
```

`npm test` mở Chrome headless bằng Puppeteer và chạy kiểm tra hồi quy với Stockfish thật, worker giả lập, giao diện và bản build production. Nếu máy chưa có Chrome của Puppeteer, chạy `npx puppeteer browsers install chrome`.

## Engine và phân tích

- Engine dùng gói `stockfish` **19.0.1** ([Stockfish.js chính thức](https://github.com/nmrugg/stockfish.js)). Mặc định là **Stockfish 19 Lite NNUE** (~1,9 MB). Chọn **Stockfish 19 NNUE đầy đủ** (~99 MB tải lần đầu) trong bảng phân tích để dùng mô hình mạnh hơn; bản này không được tải khi đang chọn Lite. Bản Lite có JavaScript dự phòng; bản đầy đủ báo lỗi rõ ràng thay vì âm thầm hạ xuống Lite.
- `npm ci` / `npm run dev` / `npm run build` tự đồng bộ JS/WASM từ dependency vào `public/stockfish/` bằng `scripts/sync-engine.mjs`. Các tệp engine sinh ra được bỏ qua trong Git. Triển khai cả thư mục `dist` sau khi build, gồm các JS/WASM tương ứng và giấy phép.
- Các đường dẫn engine tuân theo `base` của Vite, hỗ trợ triển khai dưới đường dẫn như `/chess/`.
- Tìm kiếm nhanh nhắm depth 20, giới hạn 900 ms mỗi thế cờ. Nước đáng nghi hoặc điểm chưa ổn định được kiểm tra lại với mục tiêu depth 24, tối đa 2 giây cho lượt tìm kiếm gốc. Độ sâu thực tế được hiển thị; giới hạn thời gian có thể kết thúc trước độ sâu mục tiêu.
- Mỗi worker xử lý tuần tự. Khi chuyển nhánh, tìm kiếm cũ được hủy và chờ `bestmove` trước khi gửi thế cờ mới. Kết quả luôn gắn với FEN, điểm số quy về phía Trắng.
- Bộ nhớ đệm giữ tối đa 1.000 thế cờ trong phiên để điều hướng nhanh. Đổi engine xóa kết quả cũ, giữ nguyên ván/nhánh và hủy tác vụ đang chạy. Full Review luôn tính mới bằng tối đa hai worker Lite hoặc một worker đầy đủ để giới hạn RAM. Hủy giữa chừng giữ kết quả mới đã hoàn tất, những nước còn lại chưa được gắn nhãn.
- Khi chấm nước đi, tìm kiếm `searchmoves` kiểm tra nước đã chơi từ cùng thế cờ gốc với nước ưu tiên, thay vì chỉ trừ điểm của hai lượt tìm kiếm độc lập. Kết quả giới hạn nước đi không được đưa vào cache thế cờ thông thường. Nhãn là ngưỡng CP của ứng dụng, không phải tỷ lệ thắng được hiệu chỉnh hay bản sao thuật toán chess.com.
- Stockfish mới chuẩn hóa CP theo lượng quân. Chênh lệch CP giữa FEN trước/sau không tự làm nước đi thành “chưa chắc chắn”; chỉ giữ nhãn trung tính nếu tìm kiếm cùng gốc vẫn thiếu độ sâu hoặc chưa ổn định sau kiểm tra lại.
- Nhãn **Thiên tài (!!)** là quy tắc riêng của ứng dụng: tìm sâu xác nhận nước thí Tượng/Mã/Xe/Hậu gần tối ưu, có biến hợp lệ chứng minh mất quân thật (không chỉ đổi/ăn lại quân), vẫn giữ thế cờ tốt. Tìm kiếm riêng tất cả nước khác kiểm tra việc thế cờ có vốn đã thắng dễ hay không. Cần kết quả cùng gốc ổn định ở depth ≥16; không gắn nhãn chỉ vì trùng bestmove. Quy tắc này thận trọng và chưa bao phủ mọi nước thí dài hạn; không tuyên bố giống hệt thuật toán Chess.com.
- `engineBestMove`/`pvLine` thuộc thế cờ **trước** nước đi, dùng cho giải thích. `positionEvaluation` thuộc thế cờ **sau** nước đi, dùng cho thanh đánh giá và gợi ý trên bàn cờ.
- Màn hình tác vụ vừa viewport; bàn cờ tự thu theo chiều cao/rộng và lịch sử có vùng cuộn riêng. Thông tin nước đang chọn không bị chôn dưới danh sách nước đi.
- Trong màn hình chơi với máy, **Review ván đấu** chuyển trực tiếp sang Full Review mà giữ nguyên các nước đã chơi. Menu **Xuất** tải cả ván/nhánh đang chọn dưới dạng PGN hoặc ảnh bàn cờ hiện tại dưới dạng PNG, kể cả khi ván vừa kết thúc.
- PGN dùng thế cờ xuất phát tùy chỉnh được giữ khi quay về đầu và tạo nhánh. Lịch sử nước đi được phát lại để nhận biết lặp lại ba lần.

Stockfish được cung cấp bởi gói `stockfish` 19.0.1; giấy phép GPL-3.0 nằm trong `public/stockfish/Copying.txt`. Nguồn engine: [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js), [Stockfish](https://github.com/official-stockfish/Stockfish).
