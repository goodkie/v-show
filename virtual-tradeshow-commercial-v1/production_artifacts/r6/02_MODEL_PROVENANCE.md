# 02_MODEL_PROVENANCE — REAL_WILO_GAUSSIAN_FINAL.spz 기원 추적 보고서
(Phase 10.7N-R6 Forensic Provenance Audit)

---

## 1. 모델 파일 검증 (Local & Production Hash Identity)

- **타깃 파일**: `app_build/client/assets/demo/wilo/models/REAL_WILO_GAUSSIAN_FINAL.spz`
- **파일 크기**: `111,539,801 Bytes (106.37 MB)`
- **SHA-256 해시**: `FC80E5192CE1C79196E51414E0739524C9E191092C1719829AB414D0E73A32EE`

---

## 2. 역추적 결과 (Provenance Trace Chain)

```
[Phase 9.5 Synthetic Pilot Studio]
   ├── Scene Source: phase9_5-synthetic-pilot/booth/scene/studio.js
   │     └── Visual Geometry: "SMART FACTORY PLATFORM / AUTONOMOUS LOGISTICS · DIGITAL TWIN AI"
   ├── Render Dataset: 60-view synthetic camera trajectory (camera_path.json)
   └── Downstream Target: AUREX Automation Technologies / Nova Robotics

[Phase 10.7N Wilo Reconstruction Attempt 02]
   ├── Workspace: C:\Users\vivPR\vshow-reconstruction\wilo-real-recon-02\
   ├── Studio Builder Script: wilo-real-recon-02\scene\build_studio.py
   │     └── Line 7: Read single_studio.html from phase9_5-synthetic-pilot
   │     └── Replaced text textures with 'WILO ISH FRANKFURT 2026', 'Pioneering for You'
   ├── Render Raws: 60 images (wilo_60_001.jpg ~ wilo_60_060.jpg)
   ├── COLMAP SfM: 60/60 registered (54,800 sparse points)
   └── Splatfacto / Open3D Export: 526,941 Gaussian Splats PLY (130,682,925 Bytes)
         └── Gzip Compression -> REAL_WILO_GAUSSIAN_FINAL.spz (111,539,801 Bytes)
```

---

## 3. 포렌식 판정 (Forensic Determination)

1. `REAL_WILO_GAUSSIAN_FINAL.spz`는 실제 **526,941개의 3D Gaussian Splatting 정밀 데이터**로 구성되어 있습니다.
2. 하지만 해당 Gaussian Splat의 시각적 원천(Source)은 실제 프랑크푸르트 ISH 현장 실사 사진 12장이 아니라, **Phase 9.5 Synthetic Studio (`build_studio.py` / `studio.js`) 기반의 60-View 합성 3D 가상 스튜디오 씬에서 생성된 가우시안 재구성물**입니다.
3. 따라서 브라우저에서 렌더링 시 Wilo 텍스처와 함께 스마트 팩토리 계열의 가상 구조물이 나타납니다.

---

## 4. 최종 판정

```text
MODEL_PROVENANCE=IDENTIFIED_SYNTHETIC_STUDIO_SOURCE
SPZ_DECODE_SUCCESS=true
GAUSSIAN_COUNT=526941
```
