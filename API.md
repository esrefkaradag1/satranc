# Sunucu API Sözleşmesi

Uygulama sunucuda çalışıp öğrenciler farklı cihaz/şehirden giriş yapacaksa, **VITE_API_URL** ortam değişkeni tanımlanmalı. Frontend aşağıdaki endpoint'leri çağırır.

Temel adres: `VITE_API_URL` (örn. `https://api.ornek.com`), sondaki `/` olmadan.

---

## 1. Veli / Öğrenci girişi

**POST** `/api/auth/parent`

**Body (JSON):**
```json
{
  "phoneOrStudentId": "5551234567",
  "pin": "1234"
}
```

- `phoneOrStudentId`: Öğrenci no, kullanıcı adı, öğrenci id veya veli telefonu
- `pin`: Öğrenci kayıt şifresi, veli PIN veya telefon son 4 hane

**Başarı (200):**
```json
{
  "studentId": "uuid-veya-1",
  "student": {
    "id": "1",
    "name": "Ahmet Ensar Kızılarslan",
    "group": "Alt Yapı A",
    "parentPhone": "5551234567",
    "birthDate": "2012-05-15",
    "registrationDate": "2024-09-01",
    "paymentStatus": "Paid",
    "level": "Orta",
    "elo": 1433,
    "ukd": 1520,
    "lastAttendance": "2026-02-20",
    "branch": "Merkez",
    "branchOffice": null,
    "parentName": "Mehmet Kızılarslan",
    "tcNo": null,
    "status": "active"
  },
  "token": "opsiyonel-jwt"
}
```

**Hata (4xx):** Body'de hata mesajı; frontend girişi reddeder.

---

## 2. Öğrenciye atanmış ödevler

**GET** `/api/students/:studentId/homeworks?group=Alt%20Yap%C4%B1%20A`

- `studentId`: URL path (öğrenci id)
- `group`: Query parametresi (öğrencinin grubu)

**Başarı (200):** JSON array, her eleman ödev objesi:

```json
[
  {
    "id": "hw-uuid",
    "title": "deneme",
    "dueDate": "2026-03-12",
    "due_date": "2026-03-12",
    "puzzles": ["puzzle-id-1"],
    "assignedTo": ["group:Alt Yapı A"],
    "assigned_to": ["group:Alt Yapı A"],
    "groupName": "Alt Yapı A",
    "group_name": "Alt Yapı A",
    "timeLimitMinutes": 60,
    "time_limit_minutes": 60,
    "description": null,
    "branch": null
  }
]
```

Frontend hem `dueDate` hem `due_date` (snake_case) kabul eder. Veritabanı için `homework_assignments_sql.sql` ve `fn_homework_list_for_student` kullanılabilir.

---

## 3. Öğrencinin ders programı (haftalık)

**GET** `/api/students/:studentId/schedule?week=11&year=2026&group=Alt%20Yap%C4%B1%20A`

- `studentId`: URL path
- `week`: Hafta numarası (1–53)
- `year`: Yıl
- `group`: Öğrencinin grubu

**Başarı (200):** JSON array, haftalık ders hücreleri:

```json
[
  {
    "id": "entry-uuid",
    "week": 11,
    "year": 2026,
    "dayOfWeek": 1,
    "day_of_week": 1,
    "slotIndex": 1,
    "slot_index": 1,
    "group": "Alt Yapı A",
    "topic": "Açılış Taktikleri",
    "status": "yapildi",
    "studentId": null,
    "student_id": null
  }
]
```

`schedule_entries_sql.sql` ve müfredat tablosu ile uyumlu olmalı.

---

## Özet

| Endpoint | Açıklama |
|--------|----------|
| `POST /api/auth/parent` | Veli/öğrenci girişi; `studentId` + `student` döner |
| `GET /api/students/:id/homeworks?group=` | Öğrenciye atanmış ödevler |
| `GET /api/students/:id/schedule?week=&year=&group=` | Öğrencinin haftalık ders programı |

**VITE_API_URL** boş veya tanımsızsa uygulama yerel modda çalışır (localStorage, tek tarayıcı).
