# -*- coding: utf-8 -*-
"""
AGY-Sync Master: SQLite Conversation Summaries Intelligent Merger
양방향 무손실 스마트 병합기:
1. 미존재 대화(cid): INSERT하여 타 PC 신규 대화 보존
2. 기소유 대화(cid): src의 step_count나 last_modified_time이 더 최신인 경우 필드 전체 업데이트
3. workspace_uris: 양쪽 PC의 경로를 합집합(Union)으로 병합하여 어느 PC에서 열어도 열림 보장
4. 상태 정상화: status='CASCADE_RUN_STATUS_IDLE', not_fully_idle=0, killed=0 으로 입력창 🚫 금지표시 방지
"""

import sys
import os
import json
import sqlite3

def merge_databases(src_path, dst_path):
    if not os.path.exists(src_path):
        print(f"ERROR: Source file does not exist: {src_path}")
        return False

    os.makedirs(os.path.dirname(os.path.abspath(dst_path)), exist_ok=True)
    if not os.path.exists(dst_path):
        import shutil
        shutil.copy2(src_path, dst_path)
        print("Copied fresh destination database")
        return True

    sc = sqlite3.connect(src_path, timeout=30.0)
    dc = sqlite3.connect(dst_path, timeout=30.0)
    sc.execute("PRAGMA busy_timeout = 30000;")
    dc.execute("PRAGMA busy_timeout = 30000;")

    try:
        # Check if conversation_summaries table exists in destination
        dt = [r[0] for r in dc.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        if "conversation_summaries" not in dt:
            sk = sc.execute("SELECT sql FROM sqlite_master WHERE name='conversation_summaries'").fetchone()
            if sk:
                dc.execute(sk[0])

        rows = sc.execute("SELECT * FROM conversation_summaries").fetchall()
        cols = [d[0] for d in sc.execute("SELECT * FROM conversation_summaries LIMIT 0").description]
        col_map = {name: idx for idx, name in enumerate(cols)}

        ec_data = {}
        for r in dc.execute("SELECT conversation_id, step_count, last_modified_time, workspace_uris FROM conversation_summaries").fetchall():
            ec_data[r[0]] = (r[1] or 0, str(r[2] or ""), r[3] or "[]")

        added = 0
        updated = 0
        skipped = 0

        for row in rows:
            cid = row[col_map["conversation_id"]]
            if cid not in ec_data:
                # 신규 대화 삽입
                placeholders = ",".join(["?"] * len(cols))
                dc.execute(f"INSERT INTO conversation_summaries VALUES ({placeholders})", row)
                added += 1
            else:
                dst_steps, dst_mtime, dst_uris = ec_data[cid]
                src_steps = row[col_map.get("step_count", 0)] or 0
                src_mtime = str(row[col_map.get("last_modified_time", 0)] or "")

                # workspace_uris 합집합 병합
                src_uris = row[col_map.get("workspace_uris", 0)] or "[]"
                try:
                    u1 = json.loads(dst_uris) if dst_uris else []
                    u2 = json.loads(src_uris) if src_uris else []
                    merged_uris_list = list(dict.fromkeys(u1 + u2))
                    merged_uris = json.dumps(merged_uris_list)
                except Exception:
                    merged_uris = dst_uris or src_uris

                if src_steps > dst_steps or src_mtime > dst_mtime:
                    # 소스 내용이 더 최신이면 필드 업데이트
                    set_clauses = []
                    vals = []
                    for col in cols:
                        if col == "conversation_id":
                            continue
                        if col == "workspace_uris":
                            set_clauses.append("workspace_uris=?")
                            vals.append(merged_uris)
                        elif col == "status":
                            set_clauses.append("status='CASCADE_RUN_STATUS_IDLE'")
                        elif col in ("not_fully_idle", "killed"):
                            set_clauses.append(f"{col}=0")
                        else:
                            set_clauses.append(f"{col}=?")
                            vals.append(row[col_map[col]])
                    vals.append(cid)
                    dc.execute(f"UPDATE conversation_summaries SET {','.join(set_clauses)} WHERE conversation_id=?", vals)
                    updated += 1
                else:
                    # 목적지 내용이 더 최신이더라도 workspace_uris 및 상태는 안전하게 유지
                    dc.execute("UPDATE conversation_summaries SET workspace_uris=?, status='CASCADE_RUN_STATUS_IDLE', not_fully_idle=0, killed=0 WHERE conversation_id=?", (merged_uris, cid))
                    skipped += 1

        dc.commit()
        print(f"SUCCESS: added={added}, updated={updated}, preserved={skipped}")
        return True
    finally:
        sc.close()
        dc.close()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python merge_summaries.py <src_db> <dst_db>")
        sys.exit(1)
    src = sys.argv[1]
    dst = sys.argv[2]
    ok = merge_databases(src, dst)
    sys.exit(0 if ok else 1)
