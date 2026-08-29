# 08. MANUAL REVIEW QUEUE & OPERATIONAL PROTOCOL

## 1. Trigger Conditions
- Person occluding protected brand logo or product display.
- Low-confidence optical character recognition on fine text.
- Severe perspective distortion on custom booth geometry.

## 2. Operator Actions
- `APPROVE` -> Proceed to publish QA.
- `REQUEST_REPLACEMENT` -> Prompt customer for clean angle without data loss.
- `REPROCESS` -> Adjust crop bounding box and re-run mastering.
