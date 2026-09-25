import os
import sys
import glob
import json
import sqlite3
import time

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

def decode_varint(data, i):
    val, shift = 0, 0
    while True:
        b = data[i]; i += 1
        val |= (b & 0x7f) << shift
        shift += 7
        if not (b & 0x80): break
    return val, i

def encode_varint(val):
    res = bytearray()
    while True:
        b = val & 0x7f; val >>= 7
        if val: res.append(b | 0x80)
        else: res.append(b); break
    return bytes(res)

def replace_in_proto(data, replacements):
    i = 0
    out = bytearray()
    while i < len(data):
        key_start = i
        key, i = decode_varint(data, i)
        field_num = key >> 3
        wire_type = key & 7
        if wire_type == 0:
            val, i = decode_varint(data, i)
            out.extend(data[key_start:i])
        elif wire_type == 1:
            out.extend(data[key_start:i+8]); i += 8
        elif wire_type == 5:
            out.extend(data[key_start:i+4]); i += 4
        elif wire_type == 2:
            length, i = decode_varint(data, i)
            chunk = data[i:i+length]; i += length
            replaced = False
            for old_b, new_b in replacements:
                if old_b in chunk:
                    try:
                        new_chunk = replace_in_proto(chunk, replacements)
                        if new_chunk != chunk:
                            out.extend(encode_varint((field_num << 3) | 2))
                            out.extend(encode_varint(len(new_chunk)))
                            out.extend(new_chunk)
                            replaced = True; break
                    except Exception: pass
                    new_chunk = chunk.replace(old_b, new_b)
                    out.extend(encode_varint((field_num << 3) | 2))
                    out.extend(encode_varint(len(new_chunk)))
                    out.extend(new_chunk)
                    replaced = True; break
            if not replaced:
                try:
                    new_chunk = replace_in_proto(chunk, replacements)
                    if new_chunk != chunk:
                        out.extend(encode_varint((field_num << 3) | 2))
                        out.extend(encode_varint(len(new_chunk)))
                        out.extend(new_chunk)
                        replaced = True
                except Exception: pass
            if not replaced:
                out.extend(encode_varint((field_num << 3) | 2))
                out.extend(encode_varint(length))
                out.extend(chunk)
        else:
            out.extend(data[key_start:]); break
    return bytes(out)

def remap_agy_root(agy_root, target_dir):
    print(f"[*] Processing AGY root: {agy_root}")
    # WAL / SHM 파일은 SQLite 동시성 제어용이므로 실행 중 삭제하지 않음 (SQLite WAL 안전 모드)
    conv_dir = os.path.join(agy_root, "conversations")

    # 1. Build Universal URI list
    norm_target = target_dir.replace("\\", "/")
    drive = norm_target[0]
    rest = norm_target[2:]
    universal_uris = [
        f"file:///{drive.upper()}%3A{rest}/v-show-stage2-fast-track",
        f"file:///{drive.upper()}:{rest}/v-show-stage2-fast-track",
        f"file:///{drive.lower()}%3A{rest}/v-show-stage2-fast-track",
        f"file:///{drive.lower()}:{rest}/v-show-stage2-fast-track",
        f"file:///{drive.upper()}%3A{rest}/v-show",
        f"file:///{drive.upper()}:{rest}/v-show",
        f"file:///{drive.lower()}%3A{rest}/v-show",
        f"file:///{drive.lower()}:{rest}/v-show",
        f"file:///{drive.upper()}%3A{rest}",
        f"file:///{drive.lower()}%3A{rest}",
        f"file:///{drive.upper()}:{rest}",
        f"file:///{drive.lower()}:{rest}",
        # Known cross-machine fallbacks
        "file:///C%3A/Users/server4/ai/v-show-stage2-fast-track",
        "file:///C:/Users/server4/ai/v-show-stage2-fast-track",
        "file:///c%3A/Users/server4/ai/v-show-stage2-fast-track",
        "file:///c:/Users/server4/ai/v-show-stage2-fast-track",
        "file:///C%3A/Users/server4/ai/v-show",
        "file:///C:/Users/server4/ai/v-show",
        "file:///c%3A/Users/server4/ai/v-show",
        "file:///c:/Users/server4/ai/v-show",
        "file:///C%3A/Users/server4/ai",
        "file:///c%3A/Users/server4/ai",
        "file:///C:/Users/server4/ai",
        "file:///c:/Users/server4/ai",
        "file:///E%3A/vivpr/ai/v-show-stage2-fast-track",
        "file:///e%3A/vivpr/ai/v-show-stage2-fast-track",
        "file:///e:/vivpr/ai/v-show-stage2-fast-track",
        "file:///E:/vivpr/ai/v-show-stage2-fast-track",
        "file:///E%3A/vivpr/ai/v-show",
        "file:///e%3A/vivpr/ai/v-show",
        "file:///E:/vivpr/ai/v-show",
        "file:///e:/vivpr/ai/v-show",
        "file:///E%3A/vivpr/ai",
        "file:///e%3A/vivpr/ai",
        "file:///E:/vivpr/ai",
        "file:///e:/vivpr/ai",
        "file:///C%3A/Users/oPus/ai/v-show-stage2-fast-track",
        "file:///C:/Users/oPus/ai/v-show-stage2-fast-track",
        "file:///c%3A/Users/oPus/ai/v-show-stage2-fast-track",
        "file:///c:/Users/oPus/ai/v-show-stage2-fast-track",
        "file:///C%3A/Users/oPus/ai",
        "file:///c%3A/Users/oPus/ai",
        "file:///c%3A/Users/server1/ai"
    ]

    # 3. Synchronize conversation_summaries.db
    sum_db = os.path.join(agy_root, "conversation_summaries.db")
    if os.path.exists(sum_db):
        try:
            conn = sqlite3.connect(sum_db, timeout=30.0)
            c = conn.cursor()
            c.execute("PRAGMA busy_timeout = 30000;")
            
            # Discover all conversations from disk
            existing_cids = set(r[0] for r in c.execute("SELECT conversation_id FROM conversation_summaries").fetchall())
            disk_dbs = glob.glob(os.path.join(conv_dir, "*.db"))
            added_count = 0
            for ddb in disk_dbs:
                cid = os.path.splitext(os.path.basename(ddb))[0]
                if cid not in existing_cids:
                    title = f"Conversation {cid[:8]}"
                    # Try reading title from transcript
                    t_log = os.path.join(agy_root, "brain", cid, ".system_generated", "logs", "transcript.jsonl")
                    if os.path.exists(t_log):
                        try:
                            with open(t_log, "r", encoding="utf-8", errors="ignore") as tf:
                                for line in tf:
                                    obj = json.loads(line)
                                    if obj.get("type") == "USER_INPUT":
                                        txt = obj.get("content", "").strip().replace("\n", " ")
                                        if txt:
                                            title = txt[:40]
                                            break
                        except Exception: pass
                    c.execute("""
                        INSERT OR REPLACE INTO conversation_summaries (
                            conversation_id, title, preview, step_count, last_modified_time,
                            workspace_uris, status, source, app_data_dir, not_fully_idle, killed,
                            last_user_input_time, last_user_input_step_index
                        ) VALUES (
                            ?, ?, ?, 10, datetime('now'),
                            ?, 'CASCADE_RUN_STATUS_IDLE', 'USER', '', 0, 0,
                            datetime('now'), 0
                        )
                    """, (cid, title, title, json.dumps(universal_uris)))
                    added_count += 1
                    print(f"  + Added missing conversation {cid} ({title})")
            
            # Update workspace_uris on all rows
            rows = c.execute("SELECT conversation_id, workspace_uris FROM conversation_summaries").fetchall()
            updated_sum = 0
            for cid, uris_str in rows:
                try:
                    uris = json.loads(uris_str) if uris_str else []
                    new_uris = list(uris)
                    for u in universal_uris:
                        if u not in new_uris:
                            new_uris.append(u)
                    if new_uris != uris:
                        c.execute("UPDATE conversation_summaries SET workspace_uris = ?, killed = 0, not_fully_idle = 0 WHERE conversation_id = ?", (json.dumps(new_uris), cid))
                        updated_sum += 1
                except Exception: pass
            conn.commit()
            conn.close()
            print(f"  ✓ conversation_summaries.db updated: {updated_sum} rows updated, {added_count} discovered")
        except Exception as e:
            print(f"  ! Warning updating conversation_summaries.db: {e}")

    # 4. Unlock steps and remap trajectory_metadata_blob in each conversation DB
    local_target_sub = f"{norm_target}/v-show-stage2-fast-track"
    reps = [
        (b"c:/Users/server4/ai/v-show-stage2-fast-track", local_target_sub.encode("utf-8")),
        (b"C:/Users/server4/ai/v-show-stage2-fast-track", local_target_sub.encode("utf-8")),
        (b"c%3A/Users/server4/ai/v-show-stage2-fast-track", f"{drive.lower()}%3A{rest}/v-show-stage2-fast-track".encode("utf-8")),
        (b"C%3A/Users/server4/ai/v-show-stage2-fast-track", f"{drive.upper()}%3A{rest}/v-show-stage2-fast-track".encode("utf-8")),
        (b"c:/Users/server1/ai", norm_target.encode("utf-8")),
        (b"c%3A/Users/server1/ai", f"{drive.lower()}%3A{rest}".encode("utf-8"))
    ]

    total_unlocked = 0
    total_blobs_remapped = 0
    now_ts = time.time()
    if os.path.exists(conv_dir):
        for ddb in glob.glob(os.path.join(conv_dir, "*.db")):
            try:
                # 활성 상태인 최근 대화 세션은 충돌 방지를 위해 건너뜁니다
                try:
                    mtime = os.path.getmtime(ddb)
                    if now_ts - mtime < 60:
                        continue
                except Exception: pass

                conn = sqlite3.connect(ddb, timeout=10.0)
                c = conn.cursor()
                c.execute("PRAGMA busy_timeout = 10000;")
                tables = [t[0] for t in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
                
                # Unlock pending steps (removes forbidden 🚫 symbol)
                if "steps" in tables:
                    c.execute("UPDATE steps SET status = 3 WHERE status = 2")
                    total_unlocked += c.rowcount
                
                # Remap trajectory_metadata_blob
                if "trajectory_metadata_blob" in tables:
                    row = c.execute("SELECT id, data FROM trajectory_metadata_blob").fetchone()
                    if row and row[1]:
                        blob_id, old_data = row[0], row[1]
                        new_data = replace_in_proto(old_data, reps)
                        if new_data != old_data:
                            c.execute("UPDATE trajectory_metadata_blob SET data = ? WHERE id = ?", (new_data, blob_id))
                            total_blobs_remapped += 1
                
                conn.commit()
                conn.close()
            except Exception as e:
                print(f"  ! Error in {os.path.basename(ddb)}: {e}")

    print(f"  ✓ Conversations checked: {total_unlocked} steps unlocked (forbidden 🚫 removed), {total_blobs_remapped} blobs remapped")

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\server4\ai"
    home = os.path.expanduser("~")
    for r in [os.path.join(home, ".gemini", "antigravity-ide"), os.path.join(home, ".gemini", "antigravity")]:
        if os.path.exists(r):
            remap_agy_root(r, target)
