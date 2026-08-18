# 05_AUTHENTIC_RECONSTRUCTION_PIPELINE — 실사 카메라 기반 정품 가우시안 재구성 파이프라인
(Authentic Physical Capture -> 3D Gaussian Reconstruction Specification)

---

## 1. 파이프라인 흐름도 (End-to-End Workflow)

```
[1. 현장 실사 촬영]
     │ (80-120장 원본 사진 / 70-80% 중첩률 / EXIF 보존)
     ▼
[2. 인제스트 & 사전 검증 (Preflight)]
     │ (data/capture-ingest/wilo/incoming/ -> validate_real_capture_dataset.js)
     ▼
[3. 출처 인증 (Human Provenance Gate)]
     │ (합성/AI/스크린샷 배제 승인 -> accepted/ 폴더 이동)
     ▼
[4. COLMAP Structure-from-Motion (SfM)]
     │ (특징점 추출, 매칭, 카메라 포즈 추정, Sparse Point Cloud 생성)
     │ (합격 기준: 등록률 >= 85%, Sparse Points >= 40,000)
     ▼
[5. Splatfacto 3D Gaussian Splatting Training]
     │ (Modal L4/A100 GPU 클라우드 학습 / 30,000 iterations)
     ▼
[6. 정밀 모델 내보내기 (Unambiguous Naming)]
     │ (WILO_AUTHENTIC_RECON_01.ply -> WILO_AUTHENTIC_RECON_01.spz)
     │ (SHA-256 무결성 해시 매니페스트 생성)
     ▼
[7. 격리 진단 뷰어 시각 검증 (Isolated Model-Only Viewer)]
     │ (/diagnostics/wilo-spz-only.html 에서 5-View 궤도 캡처)
     ▼
[8. 소유자 육안 최종 승인 (Owner Visual Approval Gate)]
     │ (콘택트 시트 육안 확인 및 최종 배포 승인)
     ▼
[9. 프로덕션 공식 서빙 (Production Deployment)]
```

---

## 2. 엄격 원칙 (Strict Pipeline Principles)

1. **합성 데이터 오염 방지**:
   - 파이프라인 전 과정에서 합성 가상 스튜디오 스크립트나 AI 생성 이미지가 인입되지 않도록 파일 해시 및 메타데이터 추적 보장.
2. **소유자 검증 선행**:
   - 격리 뷰어에서 육안으로 실제 Wilo 부스 형태와 디테일이 완벽히 식별되기 전까지는 `wilo-demo.html`의 3D 모드를 절대 활성화하지 않음.
