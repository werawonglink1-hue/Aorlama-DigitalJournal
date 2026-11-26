# Cloud-only policy (SOP)

This project follows a strict cloud-only rule set, provided by the project owner.
Original Thai text is kept verbatim at the bottom for reference; the summary below is
what every contributor (human or AI) must follow when touching this repo.

## Rules

1. **Dev environment**: GitHub private repository + a cloud development workspace
   (GitHub Codespaces, or another approved remote environment). No cloning this repo,
   and no project files or user data, to the project owner's own computer.
2. **Storage**: database, files, documents, SOP/history, and all trading data live only
   in cloud services (this project uses Supabase Postgres). Nothing touches local disk.
3. **Secrets**: API keys and credentials live only in a cloud secret manager (Supabase
   Edge Function secrets / Vault). Never in frontend code, source code, prompts, logs,
   or the repository itself.
4. **Browser storage**: no `localStorage`, `sessionStorage`, `IndexedDB`, browser cache,
   downloaded files, or any local database on the client. Data may exist in memory only
   for the duration of use, and is discarded on logout / session end.
5. **Transport**: HTTPS only. No caching of personal or trading data.
6. **Hard stop**: if a task would require saving data locally, or there is no compliant
   cloud workspace available, **stop and notify the project owner immediately** rather
   than falling back to local storage.
7. **Asking questions**: check the repo and existing data first. Ask only for what's
   genuinely missing and needed for a real connection, permissions, cloud storage, or
   SOP decisions — and say briefly why it's needed. Never guess endpoints, credentials,
   SOP steps, or account details. Independent work can continue while waiting for an
   answer, with the blocked parts clearly marked (see `OPEN_QUESTIONS.md`).

## Original (as provided by the project owner)

> ## ข้อกำหนด cloud-only
> - ใช้ GitHub private repository และ cloud development workspace เช่น Codespaces
>   หรือสภาพแวดล้อมพัฒนาระยะไกลที่ได้รับอนุมัติ
> - ห้าม clone repository หรือเก็บไฟล์โปรเจกต์และข้อมูลผู้ใช้ลงเครื่องคอมพิวเตอร์ของฉัน
> - เก็บฐานข้อมูล ไฟล์ เอกสาร SOP ประวัติงาน และข้อมูลการเทรด ไว้ในบริการคลาวด์เท่านั้น
> - เก็บรหัสผ่าน API key และ credentials ใน cloud secret manager ห้ามใส่ใน frontend,
>   source code, prompt, log หรือ repository
> - ห้ามบันทึกข้อมูลลง localStorage, sessionStorage, IndexedDB, browser cache,
>   ไฟล์ดาวน์โหลด หรือฐานข้อมูลในเครื่อง
> - อนุญาตให้ข้อมูลอยู่ในหน่วยความจำชั่วคราวระหว่างใช้งานเท่านั้น และล้างข้อมูลเมื่อ
>   ออกจากระบบหรือหมด session
> - ตั้งค่าไม่ให้ cache ข้อมูลส่วนตัวหรือข้อมูลการเทรด และส่งข้อมูลผ่าน HTTPS เท่านั้น
> - หากการทำงานจำเป็นต้องบันทึกข้อมูลลงเครื่อง หรือไม่มี cloud workspace ที่ทำตาม
>   ข้อกำหนดนี้ได้ ให้หยุดและแจ้งฉันทันที ห้ามทำต่อด้วยวิธีบันทึกลงเครื่องแทน
