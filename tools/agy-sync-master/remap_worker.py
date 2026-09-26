import os
import sys
import glob
import json
import sqlite3
import time
import re
import base64

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
    norm_target = target_dir.replace("\\", "/").rstrip("/")
    if norm_target.lower().endswith("/v-show-stage2-fast-track"):
        base_parent = norm_target[:-len("/v-show-stage2-fast-track")]
    elif norm_target.lower().endswith("/v-show"):
        base_parent = norm_target[:-len("/v-show")]
    else:
        base_parent = norm_target

    drive = base_parent[0]
    rest = base_parent[2:]
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
    try:
        conn = sqlite3.connect(sum_db, timeout=30.0)
        c = conn.cursor()
        c.execute("PRAGMA busy_timeout = 30000;")
        c.execute("""
            CREATE TABLE IF NOT EXISTS conversation_summaries (
                conversation_id TEXT PRIMARY KEY,
                title TEXT,
                preview TEXT,
                step_count INTEGER,
                last_modified_time TEXT,
                workspace_uris TEXT,
                status TEXT,
                source TEXT,
                app_data_dir TEXT,
                not_fully_idle INTEGER,
                killed INTEGER,
                last_user_input_time TEXT,
                last_user_input_step_index INTEGER,
                raw_summary BLOB
            )
        """)
        existing_cids = set(r[0] for r in c.execute("SELECT conversation_id FROM conversation_summaries").fetchall())
        
        # If DB is empty, bootstrap directly from Google Drive package
        if len(existing_cids) == 0:
            for dl in "CDEFGHIJKLMNOPQRSTUVWXYZ":
                for sub in ["내 드라이브", "My Drive", ""]:
                    g_sum = os.path.join(f"{dl}:\\", sub, "v-show-antigravity-sync", "antigravity-core", "state", "conversation_summaries.db")
                    if os.path.exists(g_sum):
                        try:
                            g_conn = sqlite3.connect(g_sum)
                            g_rows = g_conn.cursor().execute("SELECT * FROM conversation_summaries").fetchall()
                            cols = [d[0] for d in g_conn.cursor().execute("SELECT * FROM conversation_summaries LIMIT 0").description]
                            placeholders = ",".join(["?"] * len(cols))
                            c.executemany(f"INSERT OR REPLACE INTO conversation_summaries VALUES ({placeholders})", g_rows)
                            conn.commit()
                            g_conn.close()
                            existing_cids = set(r[0] for r in c.execute("SELECT conversation_id FROM conversation_summaries").fetchall())
                            print(f"  ✓ Initialized {len(existing_cids)} conversations from Google Drive: {g_sum}")
                            break
                        except Exception as e:
                            print(f"  ! Google Drive bootstrap note: {e}")
                if len(existing_cids) > 0:
                    break

        # Discover all conversations from disk
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
        
        # Update workspace_uris and raw_summary on all rows
        rows = c.execute("SELECT conversation_id, title, workspace_uris, raw_summary FROM conversation_summaries").fetchall()
        updated_sum = 0
        synthesized_count = 0

        # Fetch proto template for raw_summary synthesis
        t_row = c.execute("SELECT raw_summary FROM conversation_summaries WHERE raw_summary IS NOT NULL AND length(raw_summary) > 100 LIMIT 1").fetchone()
        proto_template = t_row[0] if t_row else None

        primary_ws_uri = f"file:///{drive.upper()}%3A{rest}/v-show-stage2-fast-track"
        norm_ws_uri = f"file:///{drive.lower()}:{rest}/v-show-stage2-fast-track"

        proto_reps = [
            (b"file:///c%3A/Users/server4/ai/v-show-stage2-fast-track", primary_ws_uri.encode("utf-8")),
            (b"file:///C%3A/Users/server4/ai/v-show-stage2-fast-track", primary_ws_uri.encode("utf-8")),
            (b"file:///c:/Users/server4/ai/v-show-stage2-fast-track", norm_ws_uri.encode("utf-8")),
            (b"file:///C:/Users/server4/ai/v-show-stage2-fast-track", norm_ws_uri.encode("utf-8")),
            (b"file:///e:/vivpr/ai/v-show", norm_ws_uri.encode("utf-8")),
            (b"file:///e%3A/vivpr/ai/v-show", primary_ws_uri.encode("utf-8")),
            (b"c:/Users/server4/ai/v-show-stage2-fast-track", f"{drive.lower()}:{rest}/v-show-stage2-fast-track".encode("utf-8")),
            (b"C:/Users/server4/ai/v-show-stage2-fast-track", f"{drive.upper()}:{rest}/v-show-stage2-fast-track".encode("utf-8")),
            (b"c%3A/Users/server4/ai/v-show-stage2-fast-track", f"{drive.lower()}%3A{rest}/v-show-stage2-fast-track".encode("utf-8")),
            (b"C%3A/Users/server4/ai/v-show-stage2-fast-track", f"{drive.upper()}%3A{rest}/v-show-stage2-fast-track".encode("utf-8")),
            (b"c:/Users/server1/ai", norm_target.encode("utf-8")),
            (b"c%3A/Users/server1/ai", f"{drive.lower()}%3A{rest}".encode("utf-8"))
        ]

        for cid, title, uris_str, raw_summary in rows:
            row_changed = False
            new_uris_str = uris_str
            new_raw_summary = raw_summary

            try:
                uris = json.loads(uris_str) if uris_str else []
                new_uris = list(uris)
                for u in universal_uris:
                    if u not in new_uris:
                        new_uris.append(u)
                if new_uris != uris:
                    new_uris_str = json.dumps(new_uris)
                    row_changed = True
            except Exception: pass

            if new_raw_summary is None and proto_template is not None:
                try:
                    title_b = (title or f"Conversation {cid[:8]}").encode("utf-8", errors="ignore")
                    cid_b = cid.encode("utf-8")
                    synth_reps = [
                        (b"Product 3D State Synchronization", title_b),
                        (b"9be325ed-943b-4fbd-abb3-c393fe5bab35", cid_b),
                        (b"file:///e:/vivpr/ai/v-show", norm_ws_uri.encode("utf-8"))
                    ]
                    new_raw_summary = replace_in_proto(proto_template, synth_reps)
                    synthesized_count += 1
                    row_changed = True
                except Exception: pass
            elif new_raw_summary is not None:
                try:
                    updated_proto = replace_in_proto(new_raw_summary, proto_reps)
                    if updated_proto != new_raw_summary:
                        new_raw_summary = updated_proto
                        row_changed = True
                except Exception: pass

            if row_changed:
                c.execute("""
                    UPDATE conversation_summaries 
                    SET workspace_uris = ?, raw_summary = ?, status = 'CASCADE_RUN_STATUS_IDLE', killed = 0, not_fully_idle = 0 
                    WHERE conversation_id = ?
                """, (new_uris_str, new_raw_summary, cid))
                updated_sum += 1

        conn.commit()
        conn.close()
        print(f"  ✓ conversation_summaries.db updated: {updated_sum} rows updated ({synthesized_count} proto synthesized), {added_count} discovered (Total: {len(rows) + added_count})")
    except Exception as e:
        print(f"  ! Warning updating conversation_summaries.db: {e}")

    # 4. Unlock steps and remap trajectory_metadata_blob in each conversation DB
    local_target_sub = f"{base_parent}/v-show-stage2-fast-track"
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

def remap_ide_ui_state(target_dir):
    appdata = os.environ.get('APPDATA', '')
    home = os.path.expanduser('~')
    norm_target = target_dir.replace("\\", "/").rstrip("/")
    if norm_target.lower().endswith("/v-show-stage2-fast-track"):
        base_parent = norm_target[:-len("/v-show-stage2-fast-track")]
    elif norm_target.lower().endswith("/v-show"):
        base_parent = norm_target[:-len("/v-show")]
    else:
        base_parent = norm_target

    drive = base_parent[0]
    rest = base_parent[2:]

    primary_ws_uri = f"file:///{drive.upper()}%3A{rest}/v-show-stage2-fast-track"
    norm_ws_uri = f"file:///{drive.lower()}:{rest}/v-show-stage2-fast-track"

    reps = [
        (b"file:///c%3A/Users/server4/ai/v-show-stage2-fast-track", primary_ws_uri.encode("utf-8")),
        (b"file:///C%3A/Users/server4/ai/v-show-stage2-fast-track", primary_ws_uri.encode("utf-8")),
        (b"file:///c:/Users/server4/ai/v-show-stage2-fast-track", norm_ws_uri.encode("utf-8")),
        (b"file:///C:/Users/server4/ai/v-show-stage2-fast-track", norm_ws_uri.encode("utf-8")),
        (b"c:/Users/server4/ai/v-show-stage2-fast-track", f"{drive.lower()}:{rest}/v-show-stage2-fast-track".encode("utf-8")),
        (b"C:/Users/server4/ai/v-show-stage2-fast-track", f"{drive.upper()}:{rest}/v-show-stage2-fast-track".encode("utf-8")),
        (b"c%3A/Users/server4/ai/v-show-stage2-fast-track", f"{drive.lower()}%3A{rest}/v-show-stage2-fast-track".encode("utf-8")),
        (b"C%3A/Users/server4/ai/v-show-stage2-fast-track", f"{drive.upper()}%3A{rest}/v-show-stage2-fast-track".encode("utf-8")),
        (b"c:/Users/server1/ai", norm_target.encode("utf-8")),
        (b"c%3A/Users/server1/ai", f"{drive.lower()}%3A{rest}".encode("utf-8")),
        (b"Users/server4", f"Users/{os.path.basename(home)}".encode("utf-8"))
    ]

    config_roots = [
        os.path.join(appdata, 'Antigravity IDE'),
        os.path.join(appdata, 'Antigravity')
    ]

    for c_root in config_roots:
        if not os.path.exists(c_root):
            continue
        user_dir = os.path.join(c_root, 'User')
        global_storage = os.path.join(user_dir, 'globalStorage')
        os.makedirs(global_storage, exist_ok=True)

        # 1. state.vscdb
        vscdb = os.path.join(global_storage, 'state.vscdb')
        if os.path.exists(vscdb):
            try:
                conn = sqlite3.connect(vscdb, timeout=10.0)
                cur = conn.cursor()
                cur.execute("PRAGMA busy_timeout = 10000;")
                cur.execute("SELECT key, value FROM ItemTable WHERE key IN (?, ?)",
                            ('antigravityUnifiedStateSync.sidebarWorkspaces', 'antigravityUnifiedStateSync.trajectorySummaries'))
                rows = cur.fetchall()
                for key, val in rows:
                    try:
                        raw = base64.b64decode(val)
                        new_raw = replace_in_proto(raw, reps)
                        if new_raw != raw:
                            new_b64 = base64.b64encode(new_raw).decode('utf-8')
                            cur.execute("UPDATE ItemTable SET value = ? WHERE key = ?", (new_b64, key))
                    except Exception: pass

                # 1b. Inject all conversations from conversation_summaries.db into trajectorySummaries
                try:
                    all_raw_summaries = {}
                    for r_root in [os.path.join(home, ".gemini", "antigravity-ide"), os.path.join(home, ".gemini", "antigravity")]:
                        s_db = os.path.join(r_root, "conversation_summaries.db")
                        if os.path.exists(s_db):
                            try:
                                s_conn = sqlite3.connect(s_db, timeout=10.0)
                                s_cur = s_conn.cursor()
                                for cid, r_sum in s_cur.execute("SELECT conversation_id, raw_summary FROM conversation_summaries WHERE raw_summary IS NOT NULL"):
                                    if r_sum and cid not in all_raw_summaries:
                                        all_raw_summaries[cid] = r_sum
                                s_conn.close()
                            except Exception: pass

                    if all_raw_summaries:
                        def enc_varint(v):
                            res = bytearray()
                            while True:
                                b = v & 0x7f; v >>= 7
                                if v: res.append(b | 0x80)
                                else: res.append(b); break
                            return bytes(res)

                        ts_out = bytearray()
                        for c_id, raw_bytes in all_raw_summaries.items():
                            b64_raw = base64.b64encode(raw_bytes)
                            f1 = bytes([10]) + enc_varint(len(b64_raw)) + b64_raw
                            f2 = bytes([18]) + enc_varint(len(f1)) + f1
                            cid_bytes = c_id.encode('utf-8')
                            f_cid = bytes([10]) + enc_varint(len(cid_bytes)) + cid_bytes
                            entry = f_cid + f2
                            ts_out.extend(bytes([10]) + enc_varint(len(entry)) + entry)

                        ts_b64 = base64.b64encode(bytes(ts_out)).decode('utf-8')
                        cur.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
                                    ('antigravityUnifiedStateSync.trajectorySummaries', ts_b64))
                        print(f"  ✓ Injected {len(all_raw_summaries)} past conversations into trajectorySummaries ({os.path.basename(c_root)})")
                except Exception as e_ts:
                    print(f"  ! trajectorySummaries injection note: {e_ts}")

                conn.commit()
                conn.close()
                print(f"  ✓ Remapped UI state.vscdb in {os.path.basename(c_root)}")
            except Exception as e:
                print(f"  ! state.vscdb note: {e}")

        # 2. storage.json
        storage_file = os.path.join(global_storage, 'storage.json')
        if os.path.exists(storage_file):
            try:
                raw_txt = open(storage_file, 'r', encoding='utf-8').read()
                raw_txt = re.sub(r'\\Users\\([^\\\s"]+)\\\\', r'\\\\Users\\\\\1\\\\', raw_txt)
                try:
                    data = json.loads(raw_txt)
                except Exception:
                    data = json.loads(re.sub(r'\\(?![/"\\bfnrtu])', r'\\\\', raw_txt))

                if 'backupWorkspaces' not in data: data['backupWorkspaces'] = {}
                data['backupWorkspaces']['folders'] = [{'folderUri': primary_ws_uri}]
                if 'windowsState' not in data: data['windowsState'] = {}
                if 'lastActiveWindow' not in data['windowsState']: data['windowsState']['lastActiveWindow'] = {}
                data['windowsState']['lastActiveWindow']['folder'] = primary_ws_uri

                if 'profileAssociations' not in data: data['profileAssociations'] = {}
                if 'workspaces' not in data['profileAssociations']: data['profileAssociations']['workspaces'] = {}
                data['profileAssociations']['workspaces'][primary_ws_uri] = "__default__profile__"

                with open(storage_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=4)
                print(f"  ✓ Configured storage.json in {os.path.basename(c_root)} -> {primary_ws_uri}")
            except Exception as e:
                print(f"  ! storage.json note: {e}")

        # 3. workspaceStorage
        ws_storage = os.path.join(user_dir, 'workspaceStorage')
        if os.path.exists(ws_storage):
            for ws_dir in os.listdir(ws_storage):
                ws_json = os.path.join(ws_storage, ws_dir, 'workspace.json')
                if os.path.exists(ws_json):
                    try:
                        with open(ws_json, 'r', encoding='utf-8') as f:
                            ws_data = json.load(f)
                        if 'folder' in ws_data:
                            ws_data['folder'] = primary_ws_uri
                            with open(ws_json, 'w', encoding='utf-8') as f:
                                json.dump(ws_data, f, indent=2)
                    except Exception: pass

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\server4\ai"
    home = os.path.expanduser("~")
    for r in [os.path.join(home, ".gemini", "antigravity-ide"), os.path.join(home, ".gemini", "antigravity")]:
        if os.path.exists(r):
            remap_agy_root(r, target)
    remap_ide_ui_state(target)
