# CUSTOMER COMMUNICATIONS HUB SPECIFICATION
**Virtual Trade Show Commercial V1 — In-App Messaging & Broadcast Center**

---

## 1. 개요 (Overview)
- **목적**: 유료 이메일 SaaS 도입 없이 플랫폼 오너와 참가사(전시자) 및 행사 주최사(오거나이저) 간의 안전하고 구조화된 인앱 커뮤니케이션 지원.
- **아키텍처**: In-App Asynchronous Threading (`platformMessages` 컬렉션 기반).

---

## 2. 메시지 모델 (Data Model)
```json
{
  "id": "msg-9a8b7c6d",
  "conversationId": "conv-12345678",
  "senderUserId": "user-platform-owner",
  "senderRole": "platform_owner",
  "senderName": "Platform Master Owner",
  "targetType": "single",
  "targetOrganizationIds": ["org-exhibitor-4351986b"],
  "targetEnvironment": "SYNTHETIC_TEST",
  "category": "reconstruction",
  "subject": "AUREX 60-View Synthetic Dataset Verified",
  "body": "Your 60-view deterministic 3D booth dataset passed Capture QA.",
  "status": "sent",
  "createdAt": "2026-08-16T19:57:36.000Z",
  "readBy": [{ "userId": "user-03b0027f", "orgId": "org-exhibitor-4351986b", "readAt": "2026-08-16T19:57:37.000Z" }],
  "replies": [
    {
      "id": "rep-11223344",
      "senderUserId": "user-03b0027f",
      "senderRole": "exhibitor_admin",
      "senderName": "AUREX Admin",
      "body": "Thank you Platform Team. Ready for COLMAP SfM registration test.",
      "createdAt": "2026-08-16T19:57:38.000Z"
    }
  ]
}
```

---

## 3. 브로드캐스트 안전 절차 (Broadcast Safety Protocol)
1. **타깃 스코핑**: All Exhibitors, All Organizers, Global Broadcast 중 선택.
2. **데이터 환경 격리**: `REAL`, `TEST`, `SYNTHETIC_TEST` 중 대상 환경 지정 (테스트 공지가 실제 고객에게 발송되지 않도록 방지).
3. **확인 모달 (Safety Modal)**: 발송 전 경고 배너 및 대상 조직 수 확인 필수.
