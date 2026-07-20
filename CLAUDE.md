@AGENTS.md

---
# InterviewHub AI — Project Instructions

## Bối cảnh
Project cá nhân cho CV, xây trong 1 tháng. Người dùng làm theo hướng vibe coding —
để Claude Code viết code trực tiếp — nhưng bắt buộc phải TỰ HIỂU workflow và logic,
không chỉ cần code chạy được, vì sẽ phải giải thích project khi phỏng vấn xin việc.

## Nguyên tắc làm việc bắt buộc
- ĐƯỢC PHÉP viết code trực tiếp (không cần bắt người dùng tự gõ) — đây là vibe coding có chủ đích.
- Nhưng TRƯỚC khi viết mỗi phần việc mới (mỗi story/feature), giải thích ngắn gọn:
  cách tiếp cận là gì, vì sao chọn cách đó, có phương án khác không.
- SAU khi viết xong mỗi phần, tóm tắt lại bằng ngôn ngữ thường (không phải liệt kê code):
  phần này làm gì, luồng dữ liệu đi như thế nào, điểm nào dễ gây lỗi nếu sửa sai.
- Với các đoạn logic không hiển nhiên (VD: xử lý JSON parsing, quản lý ngữ cảnh hội thoại AI,
  RLS policy) — PHẢI giải thích rõ "vì sao phải làm vậy", không chỉ "làm gì".
- Cuối mỗi story, đưa ra 2-3 câu hỏi kiểu phỏng vấn thực tế có thể bị hỏi về phần vừa làm
  (VD: "Nếu AI trả JSON sai định dạng thì điều gì xảy ra?") để người dùng tự kiểm tra
  mình có giải thích được không — không cần trả lời ngay, chỉ cần biết trước để tự ôn.
- Nếu người dùng hỏi "tại sao lại làm vậy" ở bất kỳ đoạn code nào, dừng mọi việc khác lại
  và giải thích cặn kẽ trước khi tiếp tục.

## Cách giao tiếp bằng tiếng Anh
- Khi trò chuyện/giải thích bằng tiếng Anh với người dùng, dùng từ vựng đơn giản,
  câu ngắn, cấu trúc câu dễ hiểu — tránh thuật ngữ hoa mỹ hoặc câu phức tạp không cần thiết.
- Ưu tiên câu chủ động, tránh câu bị động dài dòng.
- Nếu cần dùng thuật ngữ kỹ thuật (technical term) không tránh được, giải thích ngắn gọn
  ngay sau đó bằng từ ngữ đơn giản hơn.
- Mục tiêu: người dùng đang học tiếng Anh kỹ thuật, câu trả lời phải dễ đọc, không phải
  văn phong học thuật hay quá trang trọng.

## Tech stack (không tự ý đổi)
Next.js (App Router, bản mới nhất) + TypeScript + Tailwind + Supabase + Anthropic API.
Không thêm NestJS/Redis/Docker — đã cố tình loại bỏ để giữ đơn giản.

## Quy ước code
- Kebab-case cho file/folder, PascalCase cho component
- Mọi gọi AI đi qua lib/ai/, không rải rác trong route
- Mọi API route có try/catch, trả { error } rõ ràng
- Không hardcode secret — luôn qua process.env

## Lệnh thường dùng
- npm run dev — chạy local
- npm run build — build production trước khi deploy

## Việc không được làm
- Không lưu file resume gốc (chỉ lưu text đã parse)
- Không thêm tiêu chí chấm điểm ngoài 3 tiêu chí đã chốt (kỹ thuật, giải quyết vấn đề, giao tiếp)
- Không thêm voice/real-time streaming — nằm ngoài scope MVP
