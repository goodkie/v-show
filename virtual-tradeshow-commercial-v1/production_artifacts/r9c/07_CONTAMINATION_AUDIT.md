# 07_CONTAMINATION_AUDIT — 인공지능/합성 자산 및 오염 감사 보고서

---

## 1. 전수 포렌식 결과 (100% Contamination Detected)

업로드된 71장의 이미지 전체에 대한 시각 및 메타데이터 포렌식 결과:

1. **파일 01 ~ 20 (`ChatGPT Image *.jpg`)**:
   - OpenAI ChatGPT DALL-E 3 생성물.
   - 메타데이터: EXIF 전무.
   - 해상도: 1024x1024.
   - 판정: **`REJECTED_SYNTHETIC (AI Generated)`**

2. **파일 21 ~ 71 (`booth01_a1_*.jpg` ~ `booth18_a1_*.jpg`)**:
   - Midjourney / Flux / DALL-E 등의 다각도 생성(Multi-view Generation) 프롬프트 출력물.
   - 관찰된 AI 전형적 결함:
     - 안내판 텍스트 외계어/오타 (`Welcome for Bay What Energy`, `Pioneering for You for adapting live`, `WILD`)
     - 인물의 손가락/얼굴/신체 왜곡
     - 프레임별 천장 트러스 조명 배선 및 펌프 내부 구조의 임의적 형상 변형
     - EXIF 카메라 센서 정보 및 광학 메타데이터 전무 (1024x1024 정사각형)
   - 판정: **`REJECTED_SYNTHETIC (AI Generated / Multi-angle Inconsistent)`**

---

## 2. 오염 파일 목록 (Total 71 / 71)

- `ChatGPT Image 2026 8 17 03_58_23_1.jpg` ~ `20.jpg` (20 files)
- `booth01_a1_1787070019183.jpg` ~ `booth18_a1_1787074134093.jpg` (51 files)
