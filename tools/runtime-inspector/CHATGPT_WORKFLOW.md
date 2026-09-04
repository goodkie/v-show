# ChatGPT Diagnostic & Repair Workflow

When an issue or unexpected runtime behavior occurs during testing:

```
[1. Open Web App] ──> [2. Open RI Extension Popup] ──> [3. Start Recording]
                                                              │
                                                              ▼
[6. Export Diagnostic] <── [5. Click 'Mark Problem'] <── [4. Reproduce Defect]
         │
         ▼
[7. Upload summary.txt & diagnostic.json to ChatGPT]
         │
         ▼
[8. ChatGPT identifies FIRST_FAILED_STAGE and issues single-shot repair commit]
```

## Step-by-Step Procedure

1. **Start Recording**: Click **Start Recording** in the Runtime Inspector popup.
2. **Reproduce**: Perform the exact user actions leading to the defect (e.g., clicking "Apply to Active Booth" or uploading photos).
3. **Mark Problem**: The moment the defect occurs (e.g. screen goes black or white), click **Mark Problem Here** and type an optional note.
4. **Capture & Export**: Click **Export Diagnostic**. This saves:
   - `summary.txt`: Plain-text, high-signal breakdown for immediate chat prompt inclusion.
   - `diagnostic.json`: Full redacted telemetry bundle with network traces, errors, canvas pixel distribution, and adapter probes.
5. **Paste into ChatGPT**: Paste `summary.txt` or upload the ZIP. ChatGPT receives unambiguous, grounded runtime evidence rather than guesses.
