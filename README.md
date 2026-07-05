# Luyện đề & Thi thử — App local

Ứng dụng chạy hoàn toàn trên máy cá nhân (không cần internet, không cần tài khoản).
Bạn bỏ đề (file `.txt`) vào thư mục `data/`, mở trình duyệt, chọn đề và làm bài —
theo chế độ **Luyện tập** (xem đáp án ngay) hoặc **Thi thử** (làm như thi thật, có giờ,
chỉ xem đáp án sau khi nộp bài).

---

## 1. Chạy app

Yêu cầu duy nhất: máy đã cài **Python 3** (không cần cài thêm thư viện nào khác —
server chỉ dùng thư viện chuẩn của Python).

```bash
cd exam-app
python3 server.py
```

Terminal sẽ hiện:

```
Ứng dụng đang chạy tại: http://localhost:3939
```

Mở link đó bằng trình duyệt (Chrome, Edge, Firefox...) là dùng được. Để tắt app,
quay lại terminal và nhấn `Ctrl + C`.

> Nếu máy báo `Address already in use`, đổi số `PORT = 3939` ở đầu file `server.py`
> sang một số khác (ví dụ 4000) rồi chạy lại.

---

## 2. Cấu trúc thư mục

```
exam-app/
├── server.py           ← server local, chạy bằng "python3 server.py"
├── scores.json          ← tự động tạo ra, lưu điểm cao nhất từng đề
├── public/               ← giao diện (không cần đụng vào)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── data/                 ← ĐÂY LÀ NƠI BỎ ĐỀ VÀO
    ├── Toán/
    │   ├── Đề 1.txt
    │   └── Đề 2.txt
    └── Tin học/
        └── Đề 1.txt
```

Cấu trúc `data/<Tên môn học>/<Tên đề>.txt` đúng như bạn mô tả — mỗi thư mục con
trong `data/` là một môn học, mỗi file `.txt` bên trong là một đề. Ứng dụng đã kèm
sẵn 3 đề mẫu (2 đề Toán, 1 đề Tin học) để bạn xem thử định dạng và test thử app.

**Để thêm đề mới:** chỉ cần copy file `.txt` (đúng định dạng ở mục 3) vào đúng thư
mục môn học trong `data/` (tạo thư mục môn học mới nếu chưa có), rồi tải lại trang
web (F5). Không cần khởi động lại server.

---

## 3. Format file đề (`.txt`)

### Khung tổng quát

```
#TIME: 45

#Q1 [SC4]
Nội dung câu hỏi...
A. Phương án 1
B. Phương án 2
C. Phương án 3
D. Phương án 4
#ANSWER: B
#EXPLAIN: Giải thích vì sao B đúng (có thể để trống hoặc bỏ dòng này).

#Q2 [TF]
Một phát biểu đúng hoặc sai...
#ANSWER: Đúng
#EXPLAIN:
```

- `#TIME: <số phút>` — **không bắt buộc**. Nếu có, chế độ **Thi thử** sẽ đếm ngược
  đúng số phút này; hết giờ tự động nộp bài. Nếu không ghi dòng này (hoặc xoá đi),
  đề không giới hạn thời gian.
- Mỗi câu hỏi bắt đầu bằng `#Q<id> [LOẠI]` — `<id>` chỉ là nhãn (1, 2, 2b... đều
  được), thứ tự câu hỏi trong bài lấy theo **thứ tự xuất hiện trong file**, không
  phải theo số trong `<id>`.
- Các dòng ngay sau là **nội dung câu hỏi** (có thể nhiều dòng).
- Các dòng bắt đầu bằng `A.` `B.` `C.` `D.` (`E.` `F.` với đề 6 đáp án) là **phương
  án trả lời** — chỉ cần cho loại câu có đáp án trắc nghiệm.
- `#ANSWER:` — đáp án đúng.
- `#EXPLAIN:` — lời giải thích (không bắt buộc, có thể để trống hoặc bỏ hẳn dòng
  này; có thể viết nhiều dòng, chỉ cần không bắt đầu dòng mới bằng `#Q...`).

### 6 loại câu hỏi (`[LOẠI]`)

| Mã trong file | Loại câu hỏi                       | Viết `#ANSWER:` như thế nào |
|---------------|-------------------------------------|------------------------------|
| `TF`          | Đúng / Sai                          | `Đúng` hoặc `Sai` |
| `SC4`         | 4 đáp án, chọn **1** đáp án đúng     | 1 chữ cái, ví dụ `B` |
| `MC4`         | 4 đáp án, chọn **nhiều** đáp án đúng | các chữ cái cách nhau bằng dấu phẩy, ví dụ `A,C` |
| `SC6`         | 6 đáp án, chọn **1** đáp án đúng     | 1 chữ cái, ví dụ `E` |
| `MC6`         | 6 đáp án, chọn **nhiều** đáp án đúng | ví dụ `B,D,F` |
| `ESSAY`       | Điền câu trả lời tự luận            | đáp án dạng chữ/số, ví dụ `25` hoặc `def` |

Ghi chú cách chấm:
- Câu chọn nhiều (`MC4`/`MC6`) chỉ đúng khi chọn **chính xác đầy đủ** các đáp án
  đúng — không có điểm cho chọn đúng một phần.
- Câu `ESSAY` được so đúng/sai **không phân biệt hoa/thường** và bỏ khoảng trắng
  thừa ở đầu/cuối, nhưng vẫn phải khớp chính xác nội dung (đúng như đề bạn yêu cầu
  "check phải đúng y hệt answer").
- `TF` cũng so không phân biệt hoa/thường (`đúng` = `Đúng`).

### Ví dụ đầy đủ 6 loại (xem thêm trong `data/Toán/Đề 1.txt`)

```
#TIME: 45

#Q1 [SC4]
Trong mặt phẳng Oxy, đường thẳng d: 2x - y + 1 = 0 có hệ số góc bằng bao nhiêu?
A. -2
B. 2
C. 1/2
D. -1/2
#ANSWER: B
#EXPLAIN: Đưa về dạng y = 2x + 1, suy ra hệ số góc k = 2.

#Q2 [TF]
Hàm số y = x^2 - 4x + 3 đạt giá trị nhỏ nhất tại x = 2.
#ANSWER: Đúng
#EXPLAIN: Đỉnh parabol tại x = -b/2a = 2, và a > 0 nên đây là giá trị nhỏ nhất.

#Q3 [MC4]
Trong các số sau, số nào là số nguyên tố?
A. 21
B. 17
C. 9
D. 23
#ANSWER: B,D
#EXPLAIN: 17 và 23 chỉ chia hết cho 1 và chính nó.

#Q4 [SC6]
Cho tam giác ABC vuông tại A, AB = 3, AC = 4. Độ dài BC bằng bao nhiêu?
A. 5
B. 6
C. 7
D. 4
E. 3
F. 8
#ANSWER: A
#EXPLAIN: Pythagoras: BC = căn(3^2+4^2) = 5.

#Q5 [MC6]
Trong các phân số sau, phân số nào lớn hơn 1/2?
A. 1/3
B. 2/3
C. 1/4
D. 3/5
E. 1/2
F. 5/6
#ANSWER: B,D,F
#EXPLAIN:

#Q6 [ESSAY]
Tính giá trị của biểu thức 3^2 + 4^2.
#ANSWER: 25
#EXPLAIN: 9 + 16 = 25.
```

Lưu file với đuôi `.txt`, khuyến khích lưu bằng **UTF-8** để hiển thị đúng tiếng
Việt (mặc định khi lưu bằng VS Code, Notepad++ v.v. đều là UTF-8; Notepad cũ trên
Windows đôi khi lưu sai bảng mã, nên tránh dùng Notepad mặc định để soạn đề).

---

## 4. Cách dùng app

### Trang danh sách đề
Cột trái là danh sách môn học (theo các thư mục con trong `data/`), bên phải là
danh sách đề của môn đang chọn — mỗi đề hiển thị số câu, thời gian (nếu có), điểm
cao nhất từng đạt (nếu đã từng làm), và 2 nút **Luyện tập** / **Thi thử**.

### Giao diện làm đề (chung)
- **Cột trái (30%)**: lưới ô vuông đánh số theo từng câu (5 ô/hàng). Bấm vào ô để
  nhảy nhanh tới câu đó.
- **Cột phải (70%)**: nội dung câu hỏi đang làm, có 3 nút **Back / Check / Next**
  phía trên.
- **Góc trên bên phải**: nút **Kết thúc bài làm**.

### Chế độ Luyện tập
- Chọn đáp án → ô mục lục chuyển màu **xanh lam** (đã làm).
- Bấm **Check** → hiện đáp án đúng (xanh lá) / sai (đỏ) ngay tại câu đó, ô mục lục
  đổi màu theo, và hiện phần giải thích (nếu đề có). Sau khi Check, câu đó bị khoá,
  không sửa lại được nữa — dùng Back/Next để xem lại các câu đã Check.
- Bấm **Kết thúc bài làm** → xác nhận → quay về danh sách đề; điểm được tính trên
  số câu đã Check đúng / tổng số câu, và cập nhật điểm cao nhất nếu vượt kỷ lục cũ.

### Chế độ Thi thử
- Không có nút Check, không hiện đúng/sai trong lúc làm — ô mục lục chỉ có
  **xám** (chưa làm) / **xanh lam** (đã làm).
- Nếu đề có `#TIME`, đồng hồ đếm ngược hiện ở góc trên phải; hết giờ tự động nộp
  bài và chuyển sang màn hình đáp án.
- Bấm **Kết thúc bài làm** → xác nhận → chấm điểm toàn bộ đề, cập nhật điểm cao
  nhất nếu vượt kỷ lục cũ, và chuyển sang **màn hình đáp án**.

### Màn hình đáp án (sau khi Thi thử)
- Hiện điểm đạt được (thang 10) và số câu đúng/tổng số câu.
- Ô mục lục chỉ còn 3 màu: **xám** (không làm) / **đỏ** (sai) / **xanh lá** (đúng).
- Chỉ có Back / Next / Kết thúc bài làm — không sửa lại được câu trả lời.
- Bấm **Kết thúc bài làm** → quay về danh sách đề.

---

## 5. Vài quy ước ngầm định (bạn có thể đổi trong code nếu muốn khác)

- **Thang điểm**: 10 điểm, tính theo tỉ lệ số câu đúng / tổng số câu, làm tròn 2
  chữ số thập phân. Câu bỏ trống khi nộp bài được tính là sai.
- **Điểm cao nhất** được lưu theo từng đề (tính theo cặp môn học + tên file), lưu
  trong `scores.json` ở thư mục gốc — xoá file này nếu muốn reset toàn bộ kỷ lục.
  Cả chế độ Luyện tập lẫn Thi thử đều cập nhật điểm cao nhất khi kết thúc bài.
- Vì đây là app chạy local chỉ cho một mình bạn dùng, dữ liệu đáp án được gửi kèm
  ngay khi tải đề (không ẩn ở tầng server) — tránh mở tab DevTools khi đang Thi thử
  nếu không muốn vô tình thấy đáp án.

Chúc bạn luyện đề hiệu quả!
