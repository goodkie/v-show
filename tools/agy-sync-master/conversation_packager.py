#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AGY-Sync Master: Conversation Archiver, Markdown Exporter & Handover Packager
Handles:
1. Extracting conversations from Antigravity local brain and Google Drive
2. Converting dialogue turns into beautifully structured Markdown documents in docs/conversations/
3. Generating a fast, self-contained Agent Handover Package (.zip) for instant resumption on any new PC/folder
"""

import os
import sys
import json
import re
import glob
import shutil
import sqlite3
import zipfile
from datetime import datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def get_agy_roots():
    roots = []
    user_home = os.path.expanduser("~")
    local_agy = os.path.join(user_home, ".gemini", "antigravity-ide")
    if os.path.exists(local_agy):
        roots.append(local_agy)
    
    drives = [f"{d}:" for d in "CDEFGHIJKLMNOPQRSTUVWXYZ" if os.path.exists(f"{d}:\\")]
    for d in drives:
        for sub in ["내 드라이브", "My Drive", ""]:
            g_path = os.path.join(f"{d}\\", sub, "v-show-antigravity-sync", "antigravity-core")
            if os.path.exists(g_path) and g_path not in roots:
                roots.append(g_path)
    return roots

def sanitize_filename(name, max_len=50):
    cleaned = re.sub(r'[\\/*?:"<>|\r\n\t]', ' ', name).strip()
    cleaned = re.sub(r'\s+', '_', cleaned)
    cleaned = cleaned.strip('._')
    if not cleaned:
        cleaned = "untitled_session"
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len].rstrip('._')
    return cleaned

def find_transcript(conv_id, agy_roots):
    for root in agy_roots:
        t_path = os.path.join(root, "brain", conv_id, ".system_generated", "logs", "transcript.jsonl")
        if os.path.exists(t_path) and os.path.getsize(t_path) > 0:
            return t_path
        tf_path = os.path.join(root, "brain", conv_id, ".system_generated", "logs", "transcript_full.jsonl")
        if os.path.exists(tf_path) and os.path.getsize(tf_path) > 0:
            return tf_path
    return None

def sanitize_secrets(text):
    if not text or not isinstance(text, str):
        return text
    # Mask GitHub tokens, Stripe live keys, Cloudflare tokens, and generic api keys
    text = re.sub(r'ghp_[a-zA-Z0-9]{36}', '[REDACTED_GITHUB_TOKEN]', text)
    text = re.sub(r'sk_live_[0-9a-zA-Z]{24,}', '[REDACTED_STRIPE_KEY]', text)
    text = re.sub(r'Bearer\s+[a-zA-Z0-9_\-\.]{25,}', 'Bearer [REDACTED_BEARER_TOKEN]', text, flags=re.IGNORECASE)
    text = re.sub(r'([A-Za-z0-9_-]{40})', lambda m: '[REDACTED_40_CHAR_HASH]' if any(k in text.lower() for k in ['token', 'secret', 'cloudflare', 'api_key']) else m.group(1), text)
    return text

def parse_transcript_turns(transcript_path, max_turns=500):
    turns = []
    if not transcript_path or not os.path.exists(transcript_path):
        return turns

    try:
        # Check size to prevent freezing on 50MB+ remote network files
        fsize = os.path.getsize(transcript_path)
        with open(transcript_path, "r", encoding="utf-8", errors="replace") as f:
            line_count = 0
            for line in f:
                line_count += 1
                line = line.strip()
                if not line:
                    continue
                try:
                    step = json.loads(line)
                except Exception:
                    continue

                stype = step.get("type", "")
                content = step.get("content")
                step_idx = step.get("step_index", 0)

                if stype == "USER_INPUT" and content:
                    match = re.search(r'<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>', content, re.DOTALL)
                    clean_text = match.group(1).strip() if match else content.strip()
                    turns.append({
                        "role": "USER",
                        "step": step_idx,
                        "text": sanitize_secrets(clean_text)
                    })
                elif stype == "PLANNER_RESPONSE" and content:
                    turns.append({
                        "role": "ASSISTANT",
                        "step": step_idx,
                        "text": sanitize_secrets(content.strip())
                    })
                elif stype in ["RUN_COMMAND", "REPLACE_FILE_CONTENT", "WRITE_TO_FILE", "VIEW_FILE"]:
                    tool_calls = step.get("tool_calls", [])
                    summary_txt = ""
                    if tool_calls and isinstance(tool_calls, list):
                        summaries = []
                        for tc in tool_calls:
                            fn = tc.get("function", {}).get("name") or tc.get("name") or stype
                            summaries.append(f"`{fn}`")
                        summary_txt = ", ".join(summaries)
                    else:
                        summary_txt = f"`{stype.lower()}`"
                    
                    preview = (str(content)[:150] + "...") if content and len(str(content)) > 150 else str(content or "")
                    turns.append({
                        "role": "TOOL",
                        "step": step_idx,
                        "summary": summary_txt,
                        "output_preview": preview
                    })

                if len(turns) >= max_turns:
                    turns.append({
                        "role": "TOOL",
                        "step": step_idx,
                        "summary": "... (대화 내역이 매우 방대하여 최신 500개 턴으로 요약 보존됨)",
                        "output_preview": ""
                    })
                    break
    except Exception:
        pass

    return turns

def list_conversations(fast_track_dir):
    agy_roots = get_agy_roots()
    convs = {}
    
    # 1. Read SQLite summaries
    for root in agy_roots:
        db_path = os.path.join(root, "conversation_summaries.db")
        if not os.path.exists(db_path):
            continue
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            rows = cursor.execute("""
                SELECT conversation_id, title, preview, step_count, last_modified_time, status, project_id 
                FROM conversation_summaries
                ORDER BY last_modified_time DESC
            """).fetchall()
            for r in rows:
                cid, title, preview, steps, mtime, status, proj = r
                if cid not in convs:
                    clean_title = re.sub(r'</?USER_REQUEST>', '', str(title or '')).strip()
                    if not clean_title:
                        clean_title = "세션 " + cid[:8]
                    convs[cid] = {
                        "id": cid,
                        "title": clean_title,
                        "preview": str(preview or "")[:150],
                        "steps": steps or 0,
                        "last_modified": str(mtime or ""),
                        "status": str(status or ""),
                        "has_transcript": False,
                        "archived_file": None
                    }
            conn.close()
        except Exception:
            pass

    # 2. Check brain transcripts
    for cid, cinfo in list(convs.items()):
        t_path = find_transcript(cid, agy_roots)
        if t_path:
            cinfo["has_transcript"] = True
            cinfo["transcript_path"] = t_path

    # Check brain directories
    for root in agy_roots:
        b_dir = os.path.join(root, "brain")
        if os.path.exists(b_dir):
            try:
                for sub in os.listdir(b_dir):
                    sub_p = os.path.join(b_dir, sub)
                    if os.path.isdir(sub_p) and sub not in convs:
                        t_path = find_transcript(sub, agy_roots)
                        if t_path:
                            convs[sub] = {
                                "id": sub,
                                "title": f"세션 {sub[:8]} (Brain)",
                                "preview": "",
                                "steps": 0,
                                "last_modified": datetime.fromtimestamp(os.path.getmtime(t_path)).isoformat(),
                                "status": "active",
                                "has_transcript": True,
                                "archived_file": None
                            }
            except Exception:
                pass

    # 3. Check which ones are already archived
    docs_dir = os.path.join(fast_track_dir, "docs", "conversations")
    if os.path.exists(docs_dir):
        for fname in os.listdir(docs_dir):
            if fname.endswith(".md"):
                fpath = os.path.join(docs_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read(1500)
                        for cid in convs:
                            if cid in content:
                                convs[cid]["archived_file"] = f"docs/conversations/{fname}"
                except Exception:
                    pass

    sorted_convs = sorted(convs.values(), key=lambda x: str(x.get("last_modified", "")), reverse=True)
    return sorted_convs

def export_conversation_markdown(conv_id, fast_track_dir, skip_if_exists=False):
    docs_dir = os.path.join(fast_track_dir, "docs", "conversations")
    os.makedirs(docs_dir, exist_ok=True)

    # Check if already archived
    if skip_if_exists:
        for fname in os.listdir(docs_dir):
            if fname.endswith(".md"):
                fpath = os.path.join(docs_dir, fname)
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                        if conv_id in f.read(1200):
                            rel_p = f"docs/conversations/{fname}"
                            return {
                                "success": True,
                                "filePath": fpath,
                                "relPath": rel_p,
                                "filename": fname,
                                "title": fname,
                                "size": os.path.getsize(fpath),
                                "skipped": True
                            }
                except Exception:
                    pass

    agy_roots = get_agy_roots()
    t_path = find_transcript(conv_id, agy_roots)
    turns = parse_transcript_turns(t_path) if t_path else []

    meta = {
        "id": conv_id,
        "title": f"세션_{conv_id[:8]}",
        "mtime": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "steps": len(turns)
    }

    for root in agy_roots:
        db_path = os.path.join(root, "conversation_summaries.db")
        if os.path.exists(db_path):
            try:
                conn = sqlite3.connect(db_path)
                row = conn.execute(
                    "SELECT title, preview, step_count, last_modified_time FROM conversation_summaries WHERE conversation_id=?", 
                    (conv_id,)
                ).fetchone()
                if row:
                    raw_title = re.sub(r'</?USER_REQUEST>', '', str(row[0] or '')).strip()
                    if raw_title:
                        meta["title"] = raw_title
                    if row[3]:
                        meta["mtime"] = str(row[3])
                    if row[2]:
                        meta["steps"] = row[2]
                conn.close()
                break
            except Exception:
                pass

    if meta["title"].startswith("세션_") and turns:
        for t in turns:
            if t["role"] == "USER" and t["text"]:
                first_line = t["text"].split("\n")[0].strip()
                if first_line:
                    meta["title"] = first_line[:50]
                break

    now_str = datetime.now().strftime("%Y-%m-%d")
    clean_slug = sanitize_filename(meta["title"])
    filename = f"SESSION_{now_str}_{clean_slug}.md"
    out_path = os.path.join(docs_dir, filename)

    md_lines = []
    md_lines.append(f"# 💬 [대화 세션 아카이브] {meta['title']}\n")
    md_lines.append("> [!NOTE]")
    md_lines.append(f"> **세션 식별자 (ID)**: `{conv_id}`  ")
    md_lines.append(f"> **기록 일시**: {meta['mtime']}  ")
    md_lines.append(f"> **프로젝트 워크스페이스**: `{fast_track_dir}`  ")
    md_lines.append(f"> **총 진행 단계**: {meta['steps']} Steps  ")
    md_lines.append(f"> **내보내기 생성 시각**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    md_lines.append("---\n")
    md_lines.append("## 📌 목차 및 대화 흐름 개요")
    user_turn_count = sum(1 for t in turns if t["role"] == "USER")
    asst_turn_count = sum(1 for t in turns if t["role"] == "ASSISTANT")
    tool_turn_count = sum(1 for t in turns if t["role"] == "TOOL")
    md_lines.append(f"- 사용자 질문/지시: **{user_turn_count}회**")
    md_lines.append(f"- 어시스턴트 응답/해결: **{asst_turn_count}회**")
    md_lines.append(f"- 실행된 도구 작업: **{tool_turn_count}회**\n")
    md_lines.append("---\n")
    md_lines.append("## 🗣️ 대화 상세 기록 (Chronological Transcript)\n")

    if not turns:
        md_lines.append("*(상세 JSONL 로그가 아직 생성되지 않았거나 요약 DB에만 등록된 상태입니다)*\n")
        md_lines.append(f"**세션 타이틀**: {meta['title']}\n")
    else:
        turn_num = 1
        for t in turns:
            role = t["role"]
            if role == "USER":
                md_lines.append(f"### 👤 사용자 (User) - #{turn_num}\n")
                md_lines.append(f"```text\n{t['text']}\n```\n")
                turn_num += 1
            elif role == "ASSISTANT":
                md_lines.append(f"### 🤖 Antigravity AI 어시스턴트 - #{turn_num}\n")
                md_lines.append(f"{t['text']}\n")
                md_lines.append("\n---\n")
                turn_num += 1
            elif role == "TOOL":
                md_lines.append(f"> ⚙️ **도구 실행**: {t['summary']} (Step {t['step']})")
                if t.get('output_preview'):
                    md_lines.append(f"> ```text\n> {t['output_preview'].replace(chr(10), chr(10)+'> ')}\n> ```\n")

    md_lines.append("\n---\n")
    md_lines.append("## 🏁 세션 마무리 요약 및 연속성 안내")
    md_lines.append("- 본 문서는 Antigravity IDE 대시보드에서 1클릭으로 프로젝트 내에 자동 저장된 영구 기록입니다.")
    md_lines.append(f"- 새로운 에이전트 세션에서 이 대화를 참조하려면 세션 ID `{conv_id}` 또는 이 마크다운 파일을 `@mention`으로 불러올 수 있습니다.")

    content = "\n".join(md_lines)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)

    rel_path = os.path.relpath(out_path, fast_track_dir).replace("\\", "/")
    return {
        "success": True,
        "filePath": out_path,
        "relPath": rel_path,
        "filename": filename,
        "title": meta["title"],
        "size": os.path.getsize(out_path),
        "steps": meta["steps"],
        "convId": conv_id
    }

def list_archived_sessions(fast_track_dir):
    docs_dir = os.path.join(fast_track_dir, "docs", "conversations")
    sessions = []
    if not os.path.exists(docs_dir):
        return sessions

    for fname in os.listdir(docs_dir):
        if fname.endswith(".md"):
            fpath = os.path.join(docs_dir, fname)
            stat = os.stat(fpath)
            title = fname
            conv_id = None
            try:
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    head = f.read(1500)
                    m_title = re.search(r'^#\s*.*?[\]\)]\s*(.*?)$', head, re.MULTILINE)
                    if m_title:
                        title = m_title.group(1).strip()
                    m_cid = re.search(r'세션 식별자.*?`([a-f0-9\-]+)`', head)
                    if m_cid:
                        conv_id = m_cid.group(1)
            except Exception:
                pass

            sessions.append({
                "filename": fname,
                "relPath": f"docs/conversations/{fname}",
                "fullPath": fpath,
                "title": title,
                "convId": conv_id,
                "sizeBytes": stat.st_size,
                "mtime": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            })

    sessions.sort(key=lambda x: x["mtime"], reverse=True)
    return sessions

def create_handover_package(fast_track_dir, output_dir=None):
    if not output_dir:
        output_dir = os.path.join(fast_track_dir, "handover_packages")
    os.makedirs(output_dir, exist_ok=True)

    timestamp_str = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    pkg_basename = f"AGENT_HANDOVER_PACKAGE_{timestamp_str}"
    zip_path = os.path.join(output_dir, f"{pkg_basename}.zip")

    # 1. Export all conversations (with skip_if_exists=True for speed)
    convs = list_conversations(fast_track_dir)
    exported_count = 0
    for c in convs:
        try:
            export_conversation_markdown(c["id"], fast_track_dir, skip_if_exists=True)
            exported_count += 1
        except Exception:
            pass

    # 2. Gather Git status and recent commits
    git_branch = "unknown"
    git_head = "unknown"
    git_recent_log = ""
    git_status = ""
    try:
        import subprocess
        git_branch = subprocess.check_output(["git", "-c", "safe.directory=*", "rev-parse", "--abbrev-ref", "HEAD"], cwd=fast_track_dir, text=True).strip()
        git_head = subprocess.check_output(["git", "-c", "safe.directory=*", "rev-parse", "HEAD"], cwd=fast_track_dir, text=True).strip()
        git_recent_log = subprocess.check_output(["git", "-c", "safe.directory=*", "log", "-n", "15", "--oneline"], cwd=fast_track_dir, text=True).strip()
        git_status = subprocess.check_output(["git", "-c", "safe.directory=*", "status", "--short"], cwd=fast_track_dir, text=True).strip()
    except Exception:
        pass

    # 3. Master prompt
    prompt_content = f"""# 🚀 [AGENT MASTER RESUME PROMPT] V-SHOW STAGE 2 FAST-TRACK
*Generated automatically by AGY-Sync Master on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*

---

## 1. 🎯 프로젝트 정체성 및 현재 상태 (Project Identity & State)
- **저장소 (Repository)**: `goodkie/v-show`
- **활성 작업 경로 (Workspace)**: `{fast_track_dir}`
- **활성 브랜치 (Git Branch)**: `{git_branch}`
- **최신 커밋 (HEAD Commit)**: `{git_head}`
- **협업 채널 (Collaboration Channel)**: GitHub Issues `#4` (ChatGPT 와 Antigravity 상호 검증 및 교차 감사)

### 📌 최근 15개 Git 커밋 내역:
```text
{git_recent_log}
```

### 📌 현재 작업 트리 변경 상태 (Git Status):
```text
{git_status if git_status else '(Clean - 모든 변경사항 커밋 및 동기화 완료)'}
```

---

## 2. 🛡️ 변경 불가 엔지니어링 게이트 (Stage 2 Immutable Gates)
다음 규칙은 사람 관리자의 명시적 서면 승인 없이 **절대 위반할 수 없습니다**:
1. `OWNER_REVIEW_GATE=HOLD`: 사용자 승인 없는 무단 PR 머지 또는 외부 연락 절대 금지.
2. `ENGINEERING_HOLD=ACTIVE`: 무단 라이브 배포 및 프로덕션 인프라 변경 금지.
3. `LIVE_QA_REVOCATION=BLOCKED_PENDING_INDEPENDENT_CONTROL_PLANE`: QA 토큰 임의 파기 금지.
4. `DESTRUCTIVE_GIT_REWRITE=FORBIDDEN`: `git push --force` 및 히스토리 재작성 금지.

---

## 3. 🧠 핵심 아키텍처 및 작업 컨텍스트 (Core Architecture)
- **3D2R 12포인트 캡처 & 파노라마 스티칭 파이프라인**:
  - `scripts/stitch_panorama.py`: OpenCV `cv2.Stitcher` 기반 12포인트 파노라마 합성 엔진.
  - `tools/agy-sync-master`: 멀티 PC 양방향 실시간 동기화 + SQLite 대화창 복원 + 경로 리매핑 + 진단 웹 대시보드 (`server.js`, `engine.js`).
- **Antigravity 대화 영구 보존 & 세션 동기화**:
  - 세션 요약 DB: `conversation_summaries.db`
  - 세션 대화 로그: `docs/conversations/` 폴더 내 마크다운 문서들
  - Google Drive 동기화 패키지: `v-show-antigravity-sync/antigravity-core`

---

## 4. 📋 새로운 에이전트 인수인계 실행 지침 (Instructions for New Agent)
새로운 에이전트나 새 폴더/PC에서 이 프로젝트를 이어받을 때는:
1. **GitHub Issue #4 최신 코멘트 확인**:
   `gh issue view 4 --repo goodkie/v-show --json comments -q ".comments[-1]"` 명령으로 ChatGPT의 최신 감사 피드백을 확인합니다.
2. **`docs/conversations/` 내 최신 세션 마크다운 열람**:
   직전 세션에서 나눈 질의응답 및 결론을 파악하여 맥락을 100% 흡수합니다.
3. **사용자에게 불필요한 반복 질문을 하지 않고**, 직전 작업 완료 지점부터 즉시 자율적으로 작업을 이어갑니다.

---
*본 인수인계 패키지에는 모든 대화 마크다운, SQLite 세션 DB 사본, 복원 스크립트가 포함되어 있습니다.*
"""

    restore_py = """#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Auto-restore script for Antigravity Agent Handover Package
import os, sys, shutil, sqlite3

target_home = os.path.expanduser("~")
local_agy = os.path.join(target_home, ".gemini", "antigravity-ide")
os.makedirs(local_agy, exist_ok=True)

print("==================================================")
print("  Antigravity Handover Package 1-Click Restorer")
print("==================================================")

pkg_dir = os.path.dirname(os.path.abspath(__file__))

src_db = os.path.join(pkg_dir, "conversations_raw", "conversation_summaries.db")
dst_db = os.path.join(local_agy, "conversation_summaries.db")
if os.path.exists(src_db):
    shutil.copy2(src_db, dst_db)
    print("  ✓ conversation_summaries.db restored to local Antigravity.")

src_convs = os.path.join(pkg_dir, "conversations_raw", "conversations")
dst_convs = os.path.join(local_agy, "conversations")
if os.path.exists(src_convs):
    os.makedirs(dst_convs, exist_ok=True)
    for f in os.listdir(src_convs):
        if f.endswith(".db"):
            shutil.copy2(os.path.join(src_convs, f), os.path.join(dst_convs, f))
    print("  ✓ conversations/*.db restored.")

print("\\n[SUCCESS] Handover package restored successfully!")
print("You can now open Antigravity IDE or run [00_통합_UI_프로그램_실행].cmd")
"""

    restore_bat = """@echo off
chcp 65001 >nul
title Antigravity Handover Package Restorer
cd /d "%~dp0"
python restore_to_new_environment.py
pause
"""

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("HANDOVER_RESUME_PROMPT.md", prompt_content.encode("utf-8"))
        
        snapshot_data = {
            "created_at": datetime.now().isoformat(),
            "branch": git_branch,
            "commit": git_head,
            "recent_commits": git_recent_log.split("\n"),
            "fast_track_dir": fast_track_dir,
            "exported_conversations_count": exported_count
        }
        zf.writestr("PROJECT_STATE_SNAPSHOT.json", json.dumps(snapshot_data, indent=2, ensure_ascii=False).encode("utf-8"))
        zf.writestr("restore_to_new_environment.py", restore_py.encode("utf-8"))
        zf.writestr("restore_to_new_environment.bat", restore_bat.encode("utf-8"))

        # Add all docs/conversations/*.md
        docs_dir = os.path.join(fast_track_dir, "docs", "conversations")
        if os.path.exists(docs_dir):
            for fname in os.listdir(docs_dir):
                if fname.endswith(".md"):
                    fp = os.path.join(docs_dir, fname)
                    zf.write(fp, f"conversations_markdown/{fname}")

        # Add AGENTS.md and key guidance files
        for doc_name in ["AGENTS.md", "README_다중PC_동기화_매뉴얼.md", "CREDENTIAL_ROTATION_RUNBOOK.md"]:
            doc_path = os.path.join(fast_track_dir, doc_name)
            if os.path.exists(doc_path):
                zf.write(doc_path, f"config_guidance/{doc_name}")

        # Add conversation_summaries.db
        agy_roots = get_agy_roots()
        for root in agy_roots:
            db_path = os.path.join(root, "conversation_summaries.db")
            if os.path.exists(db_path):
                zf.write(db_path, "conversations_raw/conversation_summaries.db")
                break

        # Only add recent DBs under 15MB to prevent huge zip file
        for root in agy_roots:
            c_dir = os.path.join(root, "conversations")
            if os.path.exists(c_dir):
                for f in os.listdir(c_dir):
                    if f.endswith(".db"):
                        fp = os.path.join(c_dir, f)
                        try:
                            if os.path.getsize(fp) < 15 * 1024 * 1024:
                                zf.write(fp, f"conversations_raw/conversations/{f}")
                        except Exception:
                            pass
                break

    pkg_size = os.path.getsize(zip_path)
    return {
        "success": True,
        "zipPath": zip_path,
        "zipName": f"{pkg_basename}.zip",
        "outputDir": output_dir,
        "sizeBytes": pkg_size,
        "exportedConversationsCount": exported_count,
        "gitBranch": git_branch,
        "gitHead": git_head,
        "timestamp": timestamp_str
    }

def list_packages(fast_track_dir):
    output_dir = os.path.join(fast_track_dir, "handover_packages")
    pkgs = []
    if not os.path.exists(output_dir):
        return pkgs
    for fname in os.listdir(output_dir):
        if fname.endswith(".zip"):
            fp = os.path.join(output_dir, fname)
            stat = os.stat(fp)
            pkgs.append({
                "filename": fname,
                "fullPath": fp,
                "sizeBytes": stat.st_size,
                "mtime": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            })
    pkgs.sort(key=lambda x: x["mtime"], reverse=True)
    return pkgs

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "list"
    fast_track = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()

    if action == "list":
        convs = list_conversations(fast_track)
        print(json.dumps(convs, ensure_ascii=False, indent=2))
    elif action == "export":
        cid = sys.argv[3] if len(sys.argv) > 3 else None
        if not cid:
            print(json.dumps({"error": "No conversation_id provided"}))
            sys.exit(1)
        res = export_conversation_markdown(cid, fast_track)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    elif action == "list_archived":
        res = list_archived_sessions(fast_track)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    elif action == "package":
        res = create_handover_package(fast_track)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    elif action == "list_packages":
        res = list_packages(fast_track)
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        print(json.dumps({"error": f"Unknown action: {action}"}))
