# COMMERCIAL UNIT ECONOMICS & PRICING ANALYSIS (Phase 9)

## 1. 실제 측정 기반 원가 분석 (Measured Direct Unit Costs)

Virtual Trade Show Commercial V1의 실제 측정된 부스당 직접 원가는 다음과 같습니다:

| 원가 항목 (Cost Item) | 기준 단위 (Unit) | 실측 비용 (Measured Cost) | 비고 |
| :--- | :---: | :---: | :--- |
| **Modal L4 GPU 연산 (Splatfacto 7k)** | 부스 1개 (72장) | **~$0.18 USD** | 4.2분 연산 @ $2.50/hr (L4) |
| **SPZ 고효율 스토리지 (Storage)** | 부스 1개 (6.84 MB) | **~$0.0001 USD / 월** | Cloudflare R2 / S3 기준 |
| **웹 대역폭 트래픽 (Egress Bandwidth)**| 바이어 1,000회 방문 | **~$0.00 USD** | R2 무과금 / Railway 기본 제공 |
| **서버 호스팅 (Railway Hobby)** | 플랫폼 전체 | **$5.00 USD / 월** | 월 10~20개 부스 동시 수용 |
| **합계 부스당 직접 원가 (Direct Cost)** | **부스 1개당** | **~$0.20 ~ $0.50 USD** | **극저비용 고수익 구조** |

---

## 2. 규모별 스토리지 및 인프라 예측 (Scaling Forecast)

| 참가사 규모 (Scale) | 총 스토리지 (Storage) | 예상 월 인프라 원가 | 추천 아키텍처 |
| :---: | :---: | :---: | :--- |
| **3 ~ 10 파일럿 참가사** | ~0.5 GB ~ 1.0 GB | **$5.00 USD** (Railway Hobby 단일) | 현재 아키텍처 유지 |
| **50 참가사 (중형 전시회)** | ~3.5 GB | **~$8.00 USD** | Railway + Cloudflare R2 스토리지 |
| **100 참가사 (대형 전시회)** | ~7.0 GB | **~$15.00 USD** | Railway + R2 + Managed Postgres |

---

## 3. 상용 B2B 가격 모델 시나리오 (Draft Pricing Model)

> [!NOTE]
> 본 가격 모델은 원가 분석에 기반한 상용 패키지 제안(Draft)이며, 실제 결제 연동은 인간 승인 후 진행됩니다.

| 패키지 (Tier) | 대상 (Target) | 제안 가격 (Proposed Price) | 포함 기능 (Features) |
| :--- | :--- | :---: | :--- |
| **Starter Booth** | 단독 가상 부스 참가사 | **$199 / 부스** | Photo Preview 부스, 10개 제품, 리드/RFQ 수신 |
| **3D Precision Spatial** | 프리미엄 3D 부스 참가사 | **$499 / 부스** | **3D Gaussian Splatting 정밀 부스**, 30개 제품, 3D 핫스팟, 실시간 화상 상담 |
| **Organizer Enterprise** | 가상 박람회 주최사 | **$2,999 / 행사** | 최대 50개 부스 개설, 주최사 관리자 콘솔, 통합 데이터 엑셀 내보내기 |

- **마진율 (Gross Margin)**: 직접 원가 대비 **95% 이상의 압도적인 매출 총이익률** 달성 가능.
