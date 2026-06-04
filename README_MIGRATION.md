# GitNote migration: InfinityFree → Vercel + Supabase

App này đã được chuyển từ backend `api.php` PHP/MySQL sang Vercel Serverless Function + Supabase.

## Cấu trúc chính

- `index.html`: giữ lại giao diện cũ.
- `api/api.js`: backend mới thay cho `api.php`.
- `vercel.json`: rewrite `/api.php` sang `/api/api`, và rewrite link chia sẻ `/tab/{slug}` về `index.html`.
- `db/supabase_import_private.sql`: file SQL import dữ liệu cũ sang Supabase.

## Các bước triển khai

### 1. Tạo Supabase project

Vào Supabase, tạo project mới.

### 2. Import dữ liệu

Vào **SQL Editor** trong Supabase và chạy nội dung file:

```text
db/supabase_import_private.sql
```

File này sẽ tạo:

- bảng `config`
- bảng `notes`
- bucket Storage public tên `uploads`
- import 2 dòng config và 11 ghi chú từ database cũ

⚠️ File này có chứa tài khoản đăng nhập app cũ. Không commit file này lên GitHub.

### 3. Lấy API key Supabase

Trong Supabase Project Settings → API, lấy:

- `Project URL`
- `service_role` key hoặc secret server key

### 4. Deploy lên Vercel

1. Tạo GitHub repo mới.
2. Upload source code này lên repo.
3. Vào Vercel → Add New Project → Import repo.
4. Vào Settings → Environment Variables, thêm:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-key
```

5. Redeploy project.

### 5. Đăng nhập thử

Sau khi deploy xong, mở domain Vercel và đăng nhập bằng tài khoản cũ từ database.
Nên đổi mật khẩu ngay trong phần Cài đặt của app.

## Lưu ý về ảnh upload cũ

Trong file zip bạn gửi, thư mục `uploads/` đang trống. Vì vậy mình chưa thể migrate các ảnh đã upload cũ từ InfinityFree sang Supabase Storage.

Các ảnh cũ trong ghi chú hiện vẫn đang trỏ đến URL cũ. Nếu bạn muốn chuyển toàn bộ ảnh, cần tải đầy đủ thư mục `uploads` từ InfinityFree rồi upload lại sang Supabase Storage và replace URL trong `notes.content`.

## Lưu ý bảo mật

- Không đưa `SUPABASE_SERVICE_ROLE_KEY` vào frontend hoặc `index.html`.
- Chỉ lưu key này trong Vercel Environment Variables.
- Sau khi migrate, nên đổi mật khẩu app.
- Nên xoá hoặc không public file SQL import sau khi chạy xong.
