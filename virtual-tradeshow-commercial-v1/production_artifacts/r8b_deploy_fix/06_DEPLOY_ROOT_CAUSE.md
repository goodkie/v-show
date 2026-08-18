# 06_DEPLOY_ROOT_CAUSE — Railway 프로덕션 배포 지연 및 원인 분석 보고서

---

## 1. 커밋 및 상태 식별

- **EXPECTED_COMMIT**: `f83e96f`
- **ACTUAL_DEPLOYED_COMMIT**: `669555d` (배포 ID: `23a251d9-36e2-4dcf-b1d5-1d30f2a5737b`, 06:06:13 UTC-4)
- **ROOT_CAUSE**: Railway 프로젝트 서비스(`v-show-commercial-v1`)가 GitHub Push Webhook 자동 배포 방식이 아니라 **Railway CLI 직접 업로드(`railway up`) 배포 방식**으로 구성되어 있어, Git 푸시(`git push origin master`) 시 Railway에 새로운 빌드/배포가 자동 트리거되지 않고 이전 06:06 배포본을 계속해서 서빙하고 있었음.
- **FIX_REQUIRED**: Railway CLI를 통해 `virtual-tradeshow-commercial-v1/app_build` 소스를 직접 Railway에 업로드 배포(`railway up`)하여 최신 클린 코드(`f83e96f`)를 실시간으로 반영함.
