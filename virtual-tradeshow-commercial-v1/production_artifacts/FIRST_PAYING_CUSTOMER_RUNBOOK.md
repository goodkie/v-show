# FIRST PAYING CUSTOMER ONBOARDING RUNBOOK
**Virtual Trade Show Commercial V1 — Production Commercial Operations Guide**

---

## 1. 개요 (Overview)
본 문서는 플랫폼 런칭 후 **최초의 실제 유료 고객(First Paying Customer)**을 유치하고 온보딩할 때 운영진이 준수해야 할 표준 운영 절차(SOP)입니다.

---

## 2. 5단계 온보딩 절차 (5-Step Lifecycle)

```
[1. 고객 초대 및 Free 계정 생성]
  - 주최사(Organizer)가 오거나이저 콘솔에서 '참가사 초대' 실행
  - 임시 비밀번호가 담긴 안전한 초대 링크 발송
  - 고객 첫 로그인 시 강력한 비밀번호로 변경 필수

[2. 카탈로그 및 60뷰 부스 사진 촬영 가이드 전달]
  - 50~100장 다각도 부스 촬영 가이드라인 전달
  - 제품 5~25종 및 주요 스펙/단가 입력 지원
  - Photo Preview 모드로 가상 부스 사전 검토

[3. Stripe Live Checkout 및 결제]
  - 참가사 관리자 콘솔 [요금제 & 빌링] 이동
  - '💎 PRO 플랜 구독 ($299/월)' 클릭
  - Stripe Checkout 호스팅 결제창에서 법인카드 결제 진행
  - 결제 완료 즉시 Webhook 동기화 -> PRO 활성화 및 영수증 자동 발급

[4. 3DGS 재구성 요청 및 2중 승인 (Double-Gate)]
  - 고객이 3D 가우스 스플래팅 재구성 요청 제출 (상태: awaiting_approval)
  - 플랫폼 운영팀이 Grand Control에서 촬영 품질(Capture QA) 최종 검토
  - 운영진 'Approve Reconstruction' 버튼 클릭 -> Modal GPU 워커 가동 (~3분 소요)
  - SPZ / PLY 3D 모델 생성 완료 및 부스 자동 배포

[5. 1:1 바이어 상담 및 실시간 모니터링]
  - 바이어 명함 접수, 견적(RFQ) 요청 실시간 알림
  - 전담 기술 지원 채널 운영 (Grand Control Communications Hub)
```
