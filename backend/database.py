"""
database.py - SQLite Database Manager for ReadFil Classroom Mode & Teacher Portal
Zero-configuration, 100% offline-first local persistence using Python's built-in sqlite3.
"""

import os
import sqlite3
import json
import io
import csv
import random
import secrets
import hashlib
import time
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'readfil.db')

def get_db_connection():
    """Returns a SQLite connection with row factory enabled for dict-like access."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def generate_unique_pin():
    """Generates a random unique 6-digit numeric PIN for classroom access."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        for _ in range(100):
            pin = f"{random.randint(100000, 999999)}"
            cursor.execute("SELECT id FROM teachers WHERE classroom_pin = ?", (pin,))
            if not cursor.fetchone():
                return pin
        return f"{random.randint(100000, 999999)}"
    finally:
        conn.close()

def init_db():
    """Initializes SQLite database tables and seeds a default teacher + passage if empty."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Teachers Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT NOT NULL,
        security_question TEXT NOT NULL,
        security_answer_hash TEXT NOT NULL,
        classroom_pin TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Schema migration: Ensure classroom_pin and settings_json columns exist in existing databases
    cursor.execute("PRAGMA table_info(teachers)")
    columns = [col['name'] for col in cursor.fetchall()]
    if 'classroom_pin' not in columns:
        cursor.execute("ALTER TABLE teachers ADD COLUMN classroom_pin TEXT")
        conn.commit()
    if 'settings_json' not in columns:
        cursor.execute("ALTER TABLE teachers ADD COLUMN settings_json TEXT DEFAULT '{}'")
        conn.commit()

    # 2. Custom Passages Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS custom_passages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        grade_level TEXT DEFAULT 'General',
        timer_seconds INTEGER DEFAULT 60,
        is_active INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    )
    """)

    # 3. Student Results Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER NOT NULL,
        passage_id INTEGER,
        student_name TEXT NOT NULL,
        passage_title TEXT NOT NULL,
        accuracy_rate REAL NOT NULL,
        wcpm REAL NOT NULL,
        composite_score REAL NOT NULL,
        reading_level TEXT NOT NULL,
        duration_seconds REAL NOT NULL,
        correct_words INTEGER NOT NULL,
        total_target_words INTEGER NOT NULL,
        errors_detected INTEGER NOT NULL,
        stutter_words TEXT,
        trace_json TEXT,
        classroom_pin TEXT,
        folder_name TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    )
    """)

    # 3.1 Classroom PIN Folders Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS classroom_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacher_id INTEGER NOT NULL,
        pin TEXT NOT NULL,
        folder_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_archived INTEGER DEFAULT 0,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    )
    """)

    # Schema migration: Ensure classroom_pin and folder_name exist in student_results
    cursor.execute("PRAGMA table_info(student_results)")
    sr_cols = [col['name'] for col in cursor.fetchall()]
    if 'classroom_pin' not in sr_cols:
        cursor.execute("ALTER TABLE student_results ADD COLUMN classroom_pin TEXT")
        conn.commit()
    if 'folder_name' not in sr_cols:
        cursor.execute("ALTER TABLE student_results ADD COLUMN folder_name TEXT")
        conn.commit()

    # 4. Super Admin Solo Account Table (id=1 Singleton Constraint)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_account (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        username TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        recovery_code_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 5. Admin Sessions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
    )
    """)

    # 6. Admin OTP Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_otp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
    )
    """)

    # 7. Dynamic NLP & Phonetic Correction Rules Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS nlp_corrections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spoken_phrase TEXT NOT NULL,
        replacement_phrase TEXT NOT NULL,
        rule_type TEXT DEFAULT 'exact',
        is_active INTEGER DEFAULT 1,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 8. System Settings Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """)

    # 9. Admin Audit Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()

    # Seed default NLP correction rules if table is empty
    cursor.execute("SELECT COUNT(*) AS count FROM nlp_corrections")
    if cursor.fetchone()['count'] == 0:
        default_rules = [
            ("tiago", "Tiyago", "exact", "Common phonetic variation of proper name Tiyago"),
            ("athinas", "Atenas", "exact", "Acoustic variant of historical location Atenas"),
            ("atinas", "Atenas", "exact", "Acoustic variant of historical location Atenas"),
            ("sinta", "sintas", "exact", "Acoustic correction for shoelace context"),
            ("manga", "mga", "exact", "Standard Tagalog grammatical pluralizer normalization"),
        ]
        cursor.executemany("""
            INSERT INTO nlp_corrections (spoken_phrase, replacement_phrase, rule_type, notes)
            VALUES (?, ?, ?, ?)
        """, default_rules)
        conn.commit()

    # Seed default system settings if table is empty
    cursor.execute("SELECT COUNT(*) AS count FROM system_settings")
    if cursor.fetchone()['count'] == 0:
        default_settings = [
            ("stt_mode", "HYBRID_CLOUD_LOCAL"),
            ("wcpm_target", "150"),
            ("trim_top_db", "26"),
            ("silence_inactivity_ms", "2300"),
            ("allow_teacher_registration", "true")
        ]
        cursor.executemany("""
            INSERT INTO system_settings (key, value) VALUES (?, ?)
        """, default_settings)
        conn.commit()

    # Seed initial default teacher and active passage if database is fresh
    cursor.execute("SELECT COUNT(*) AS count FROM teachers")
    if cursor.fetchone()['count'] == 0:
        default_pwd_hash = generate_password_hash("teacher123")
        default_sec_ans_hash = generate_password_hash("filipino")
        cursor.execute("""
            INSERT INTO teachers (name, username, password_hash, email, security_question, security_answer_hash, classroom_pin)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            "Guro Maria Santos",
            "teacher",
            default_pwd_hash,
            "readfilcertificate@gmail.com",
            "Ano ang unang paaralan kung saan ka nagturo?",
            default_sec_ans_hash,
            "849201"
        ))
        teacher_id = cursor.lastrowid

        # Seed sample active passage
        sample_passage = (
            "Si Tiyago ay isang masipag na magsasaka sa aming baryo. "
            "Tuwing umaga ay maaga siyang gumigising upang alagaan ang kaniyang mga tanim na gulay. "
            "Masaya siyang nagtatrabaho kasama ang kaniyang pamilya."
        )
        cursor.execute("""
            INSERT INTO custom_passages (teacher_id, title, content, grade_level, timer_seconds, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
        """, (
            teacher_id,
            "Ang Masipag na Magsasaka",
            sample_passage,
            "Grade 4",
            60
        ))
        conn.commit()
    else:
        # Ensure any pre-existing teachers without a classroom_pin get assigned one
        cursor.execute("SELECT id FROM teachers WHERE classroom_pin IS NULL OR classroom_pin = ''")
        teachers_without_pin = cursor.fetchall()
        for t in teachers_without_pin:
            pin = "849201" if t['id'] == 1 else f"{random.randint(100000, 999999)}"
            cursor.execute("UPDATE teachers SET classroom_pin = ? WHERE id = ?", (pin, t['id']))
        conn.commit()

    # Backfill student_results with teacher's classroom_pin if null
    cursor.execute("""
        UPDATE student_results
        SET classroom_pin = (SELECT classroom_pin FROM teachers WHERE teachers.id = student_results.teacher_id),
            folder_name = 'Initial Class Session'
        WHERE classroom_pin IS NULL OR classroom_pin = ''
    """)
    conn.commit()

    # Ensure all teachers have an active folder entry in classroom_folders for their current PIN
    cursor.execute("SELECT id, classroom_pin FROM teachers WHERE classroom_pin IS NOT NULL AND classroom_pin != ''")
    for t in cursor.fetchall():
        t_id = t['id']
        t_pin = str(t['classroom_pin']).strip()
        cursor.execute("SELECT id FROM classroom_folders WHERE teacher_id = ? AND pin = ?", (t_id, t_pin))
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO classroom_folders (teacher_id, pin, folder_name, is_archived)
                VALUES (?, ?, ?, 0)
            """, (t_id, t_pin, f"Class Session (PIN: {t_pin})"))
    conn.commit()

    conn.close()

# =================================================================
# TEACHER AUTHENTICATION & RECOVERY
# =================================================================

def register_teacher(name, username, password, email, security_question, security_answer):
    """Registers a new teacher with hashed credentials and a unique classroom PIN."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        pwd_hash = generate_password_hash(password)
        ans_hash = generate_password_hash(security_answer.strip().lower())
        new_pin = generate_unique_pin()
        cursor.execute("""
            INSERT INTO teachers (name, username, password_hash, email, security_question, security_answer_hash, classroom_pin)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (name.strip(), username.strip().lower(), pwd_hash, email.strip().lower(), security_question.strip(), ans_hash, new_pin))
        conn.commit()
        teacher_id = cursor.lastrowid
        return {"success": True, "teacher_id": teacher_id, "username": username, "classroom_pin": new_pin}
    except sqlite3.IntegrityError:
        return {"success": False, "error": "Username already exists. Please choose another username."}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def authenticate_teacher(username, password):
    """Verifies username and password, returning teacher profile info including classroom PIN."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM teachers WHERE username = ?", (username.strip().lower(),))
        teacher = cursor.fetchone()
        if not teacher:
            return {"success": False, "error": "Username not found."}
        
        if not check_password_hash(teacher['password_hash'], password):
            return {"success": False, "error": "Invalid password."}

        # If existing teacher has no pin, generate one now
        pin = teacher['classroom_pin']
        if not pin:
            pin = generate_unique_pin()
            cursor.execute("UPDATE teachers SET classroom_pin = ? WHERE id = ?", (pin, teacher['id']))
            conn.commit()

        return {
            "success": True,
            "teacher": {
                "id": teacher['id'],
                "name": teacher['name'],
                "username": teacher['username'],
                "email": teacher['email'],
                "security_question": teacher['security_question'],
                "classroom_pin": pin
            }
        }
    finally:
        conn.close()

def get_teacher_pin(teacher_id):
    """Fetches the current active PIN for a teacher."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT classroom_pin FROM teachers WHERE id = ?", (teacher_id,))
        row = cursor.fetchone()
        return row['classroom_pin'] if row else None
    finally:
        conn.close()

def regenerate_teacher_pin(teacher_id, archive_folder_name=None):
    """
    Generates and saves a brand new 6-digit classroom PIN for the teacher.
    Archives the previous PIN and its session folder so past records are neatly organized.
    Instantly invalidates the previous PIN so old students cannot re-enter.
    """
    new_pin = generate_unique_pin()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # 1. Fetch current active PIN
        cursor.execute("SELECT classroom_pin FROM teachers WHERE id = ?", (teacher_id,))
        t_row = cursor.fetchone()
        old_pin = str(t_row['classroom_pin']).strip() if t_row and t_row['classroom_pin'] else None

        # 2. If old PIN exists, ensure it is archived in classroom_folders with the specified name
        if old_pin:
            cursor.execute("SELECT id, folder_name FROM classroom_folders WHERE teacher_id = ? AND pin = ?", (teacher_id, old_pin))
            existing_folder = cursor.fetchone()

            resolved_archive_name = (archive_folder_name or '').strip()
            if not resolved_archive_name:
                resolved_archive_name = existing_folder['folder_name'] if existing_folder else f"Class Session (PIN: {old_pin})"

            if existing_folder:
                cursor.execute("""
                    UPDATE classroom_folders
                    SET folder_name = ?, is_archived = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                """, (resolved_archive_name, existing_folder['id']))
            else:
                cursor.execute("""
                    INSERT INTO classroom_folders (teacher_id, pin, folder_name, is_archived)
                    VALUES (?, ?, ?, 1)
                """, (teacher_id, old_pin, resolved_archive_name))

            # Also sync folder_name in student_results
            cursor.execute("""
                UPDATE student_results
                SET folder_name = ?
                WHERE teacher_id = ? AND classroom_pin = ?
            """, (resolved_archive_name, teacher_id, old_pin))

        # 3. Create active folder for the new PIN
        cursor.execute("""
            INSERT INTO classroom_folders (teacher_id, pin, folder_name, is_archived)
            VALUES (?, ?, ?, 0)
        """, (teacher_id, new_pin, f"Class Session (PIN: {new_pin})"))

        # 4. Update teacher's current PIN
        cursor.execute("UPDATE teachers SET classroom_pin = ? WHERE id = ?", (new_pin, teacher_id))
        conn.commit()
        return {"success": True, "classroom_pin": new_pin, "archived_pin": old_pin}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

DEFAULT_TEACHER_SETTINGS = {
    "timer_duration": 60,
    "auto_continue": True,
    "auto_continue_countdown": 4,
    "shuffle_passages": False,
    "show_waveform": True,
    "play_chime": True,
    "immediate_stutter_alerts": True,
    "allow_retake_current": False,
    "auto_send_email": False
}

def get_teacher_settings(teacher_id):
    """Fetches teacher classroom settings dictionary with default fallbacks."""
    if not teacher_id:
        return dict(DEFAULT_TEACHER_SETTINGS)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT settings_json FROM teachers WHERE id = ?", (teacher_id,))
        row = cursor.fetchone()
        if not row or not row['settings_json']:
            return dict(DEFAULT_TEACHER_SETTINGS)
        try:
            stored = json.loads(row['settings_json'])
            merged = dict(DEFAULT_TEACHER_SETTINGS)
            merged.update(stored)
            return merged
        except Exception:
            return dict(DEFAULT_TEACHER_SETTINGS)
    finally:
        conn.close()

def update_teacher_settings(teacher_id, new_settings):
    """Updates settings_json for the specified teacher and syncs timer to custom passages."""
    if not teacher_id:
        return {"success": False, "error": "teacher_id required"}
    current = get_teacher_settings(teacher_id)
    if isinstance(new_settings, dict):
        if 'settings' in new_settings and isinstance(new_settings['settings'], dict):
            current.update(new_settings['settings'])
        else:
            current.update(new_settings)

    
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE teachers SET settings_json = ? WHERE id = ?", (json.dumps(current), teacher_id))
        if isinstance(new_settings, dict) and 'timer_duration' in new_settings:
            try:
                t_sec = max(5, int(new_settings['timer_duration']))
                cursor.execute("UPDATE custom_passages SET timer_seconds = ? WHERE teacher_id = ?", (t_sec, int(teacher_id)))
            except Exception:
                pass
        conn.commit()
        return {"success": True, "settings": current}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def verify_classroom_pin(pin):
    """
    Validates a student-entered PIN against active teachers.
    Returns teacher information, active assessment passages, and classroom settings.
    """
    if not pin:
        return {"success": False, "error": "Please enter a 6-digit Classroom PIN."}
    
    clean_pin = str(pin).strip()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name, username, email FROM teachers WHERE classroom_pin = ?", (clean_pin,))
        teacher = cursor.fetchone()
        if not teacher:
            return {
                "success": False,
                "error": "Invalid Classroom PIN. Please ask your teacher for today's active PIN."
            }
        
        teacher_id = teacher['id']
        teacher_name = teacher['name']
        teacher_email = teacher['email'] if 'email' in teacher.keys() else ''
        passages = get_active_passages(teacher_id)
        settings = get_teacher_settings(teacher_id)
        
        return {
            "success": True,
            "teacher": {
                "id": teacher_id,
                "name": teacher_name,
                "username": teacher['username'],
                "email": teacher_email
            },
            "passages": passages,
            "settings": settings
        }
    finally:
        conn.close()

def get_teacher_email(teacher_id):
    """Returns the email address of the teacher."""
    if not teacher_id:
        return None
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT email FROM teachers WHERE id = ?", (teacher_id,))
        row = cursor.fetchone()
        return row['email'] if row and 'email' in row.keys() else None
    finally:
        conn.close()

def get_teacher_security_question(username):
    """Returns the registered security question for password recovery."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT security_question FROM teachers WHERE username = ?", (username.strip().lower(),))
        row = cursor.fetchone()
        if not row:
            return {"success": False, "error": "Username not found."}
        return {"success": True, "security_question": row['security_question']}
    finally:
        conn.close()

def verify_and_reset_password(username, security_answer, new_password):
    """Verifies security answer and updates password."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, security_answer_hash FROM teachers WHERE username = ?", (username.strip().lower(),))
        teacher = cursor.fetchone()
        if not teacher:
            return {"success": False, "error": "Username not found."}

        if not check_password_hash(teacher['security_answer_hash'], security_answer.strip().lower()):
            return {"success": False, "error": "Security answer is incorrect."}

        new_hash = generate_password_hash(new_password)
        cursor.execute("UPDATE teachers SET password_hash = ? WHERE id = ?", (new_hash, teacher['id']))
        conn.commit()
        return {"success": True, "message": "Password reset successfully. You can now log in."}
    finally:
        conn.close()

# =================================================================
# CUSTOM PASSAGES MANAGEMENT
# =================================================================

def get_teacher_passages(teacher_id):
    """Returns all custom passages created by the specified teacher."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, teacher_id, title, content, grade_level, timer_seconds, is_active, created_at
            FROM custom_passages
            WHERE teacher_id = ?
            ORDER BY created_at DESC
        """, (teacher_id,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

def create_passage(teacher_id, title, content, grade_level="General", timer_seconds=60, is_active=False):
    """Creates a new custom reading passage."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if is_active:
            # Only one passage active per teacher
            cursor.execute("UPDATE custom_passages SET is_active = 0 WHERE teacher_id = ?", (teacher_id,))

        local_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            INSERT INTO custom_passages (teacher_id, title, content, grade_level, timer_seconds, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (teacher_id, title.strip(), content.strip(), grade_level.strip(), int(timer_seconds), 1 if is_active else 0, local_now))
        conn.commit()
        return {"success": True, "passage_id": cursor.lastrowid}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def update_passage(passage_id, teacher_id, title, content, grade_level, timer_seconds):
    """Updates an existing custom passage."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        p_id = int(passage_id)
        t_sec = max(5, int(timer_seconds))
        t_id = int(teacher_id) if teacher_id else None

        if t_id is not None:
            cursor.execute("""
                UPDATE custom_passages
                SET title = ?, content = ?, grade_level = ?, timer_seconds = ?
                WHERE id = ? AND teacher_id = ?
            """, (title.strip(), content.strip(), grade_level.strip(), t_sec, p_id, t_id))
            conn.commit()

        if t_id is None or cursor.rowcount == 0:
            cursor.execute("""
                UPDATE custom_passages
                SET title = ?, content = ?, grade_level = ?, timer_seconds = ?
                WHERE id = ?
            """, (title.strip(), content.strip(), grade_level.strip(), t_sec, p_id))
            conn.commit()

        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def delete_passage(passage_id, teacher_id):
    """Deletes a custom passage."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM custom_passages WHERE id = ? AND teacher_id = ?", (passage_id, teacher_id))
        conn.commit()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def activate_passage(passage_id, teacher_id):
    """Sets the designated passage as the active assignment for the class."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Deactivate all passages for this teacher first
        cursor.execute("UPDATE custom_passages SET is_active = 0 WHERE teacher_id = ?", (teacher_id,))
        # Activate target passage
        cursor.execute("UPDATE custom_passages SET is_active = 1 WHERE id = ? AND teacher_id = ?", (passage_id, teacher_id))
        conn.commit()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def toggle_passage_active(passage_id, teacher_id):
    """Toggles active state of a passage for the class assessment set."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE custom_passages
            SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END
            WHERE id = ? AND teacher_id = ?
        """, (passage_id, teacher_id))
        conn.commit()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def set_active_passages(teacher_id, passage_ids):
    """Sets a specific list of passage IDs as the active assessment set."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE custom_passages SET is_active = 0 WHERE teacher_id = ?", (teacher_id,))
        if passage_ids:
            clean_ids = [int(pid) for pid in passage_ids]
            placeholders = ','.join(['?'] * len(clean_ids))
            cursor.execute(f"""
                UPDATE custom_passages
                SET is_active = 1
                WHERE teacher_id = ? AND id IN ({placeholders})
            """, [teacher_id] + clean_ids)
        conn.commit()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def update_all_passages_timer(teacher_id, timer_seconds):
    """Sets the timer duration for all passages owned by the teacher."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE custom_passages
            SET timer_seconds = ?
            WHERE teacher_id = ?
        """, (int(timer_seconds), int(teacher_id)))
        conn.commit()
        return {"success": True, "updated_count": cursor.rowcount}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def get_active_passages(teacher_id=None):
    """
    Returns all currently active passages for the classroom assessment set.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if teacher_id:
            cursor.execute("""
                SELECT p.*, t.name as teacher_name
                FROM custom_passages p
                JOIN teachers t ON p.teacher_id = t.id
                WHERE p.teacher_id = ? AND p.is_active = 1
                ORDER BY p.id ASC
            """, (teacher_id,))
            rows = cursor.fetchall()
            # Strictly return only this teacher's active passages; never fall back to another teacher
            return [dict(r) for r in rows] if rows else []
        else:
            cursor.execute("""
                SELECT p.*, t.name as teacher_name
                FROM custom_passages p
                JOIN teachers t ON p.teacher_id = t.id
                WHERE p.is_active = 1
                ORDER BY p.id ASC
            """)
            rows = cursor.fetchall()
            if rows:
                return [dict(r) for r in rows]

            # If no teacher specified and none marked active, fallback to the latest passage
            cursor.execute("""
                SELECT p.*, t.name as teacher_name
                FROM custom_passages p
                JOIN teachers t ON p.teacher_id = t.id
                ORDER BY p.id DESC
                LIMIT 1
            """)
            fallback_row = cursor.fetchone()
            return [dict(fallback_row)] if fallback_row else []
    finally:
        conn.close()

def get_active_passage(teacher_id=None):
    """
    Returns the currently active passage (or the first in the active set).
    """
    passages = get_active_passages(teacher_id)
    return passages[0] if passages else None

# =================================================================
# STUDENT RESULTS LOGGING & MONITORING
# =================================================================

def save_student_result(teacher_id, passage_id, student_name, passage_title,
                        accuracy_rate, wcpm, composite_score, reading_level,
                        duration_seconds, correct_words, total_target_words,
                        errors_detected, stutter_words=None, trace_json=None,
                        classroom_pin=None, folder_name=None):
    """Saves a student evaluation record into the database associated with classroom PIN & folder."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        stutters_str = json.dumps(stutter_words or [])
        trace_str = json.dumps(trace_json or [])

        # If classroom_pin is provided, find or create the matching folder
        clean_pin = str(classroom_pin).strip() if classroom_pin else None
        clean_folder = (folder_name or '').strip()

        if clean_pin:
            cursor.execute("SELECT folder_name FROM classroom_folders WHERE teacher_id = ? AND pin = ?", (teacher_id, clean_pin))
            f_row = cursor.fetchone()
            if f_row:
                clean_folder = f_row['folder_name']
            else:
                if not clean_folder:
                    clean_folder = f"Class Session (PIN: {clean_pin})"
                cursor.execute("""
                    INSERT INTO classroom_folders (teacher_id, pin, folder_name, is_archived)
                    VALUES (?, ?, ?, 0)
                """, (teacher_id, clean_pin, clean_folder))

        local_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            INSERT INTO student_results (
                teacher_id, passage_id, student_name, passage_title,
                accuracy_rate, wcpm, composite_score, reading_level,
                duration_seconds, correct_words, total_target_words,
                errors_detected, stutter_words, trace_json, timestamp,
                classroom_pin, folder_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            teacher_id, passage_id, student_name.strip(), passage_title.strip(),
            round(float(accuracy_rate), 2), round(float(wcpm), 2), round(float(composite_score), 2),
            reading_level.strip(), round(float(duration_seconds), 2), int(correct_words),
            int(total_target_words), int(errors_detected), stutters_str, trace_str, local_now,
            clean_pin, clean_folder
        ))
        conn.commit()
        return {"success": True, "result_id": cursor.lastrowid, "pin": clean_pin, "folder_name": clean_folder}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def get_teacher_student_results(teacher_id, search_query=None, pin=None):
    """Retrieves assessment results for the teacher, with optional search and PIN/folder filter."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = "SELECT * FROM student_results WHERE teacher_id = ?"
        params = [teacher_id]

        if pin and str(pin).strip().lower() != 'all':
            query += " AND classroom_pin = ?"
            params.append(str(pin).strip())

        if search_query and search_query.strip():
            query += " AND student_name LIKE ?"
            params.append(f"%{search_query.strip()}%")

        query += " ORDER BY timestamp DESC"
        cursor.execute(query, tuple(params))
        
        rows = cursor.fetchall()
        results = []
        for r in rows:
            d = dict(r)
            try:
                d['stutter_words'] = json.loads(d['stutter_words']) if d['stutter_words'] else []
            except:
                d['stutter_words'] = []
            try:
                d['trace_json'] = json.loads(d['trace_json']) if d['trace_json'] else []
            except:
                d['trace_json'] = []
            results.append(d)
        return results
    finally:
        conn.close()

def get_teacher_folders(teacher_id):
    """
    Returns all class folders/PIN sessions for a teacher with aggregate statistics.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Get teacher's current active PIN
        cursor.execute("SELECT classroom_pin FROM teachers WHERE id = ?", (teacher_id,))
        t_row = cursor.fetchone()
        current_pin = str(t_row['classroom_pin']).strip() if t_row and t_row['classroom_pin'] else ''

        # Auto-create active folder if not exists
        if current_pin:
            cursor.execute("SELECT id FROM classroom_folders WHERE teacher_id = ? AND pin = ?", (teacher_id, current_pin))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO classroom_folders (teacher_id, pin, folder_name, is_archived)
                    VALUES (?, ?, ?, 0)
                """, (teacher_id, current_pin, f"Class Session (PIN: {current_pin})"))
                conn.commit()

        # Query all folders
        cursor.execute("""
            SELECT * FROM classroom_folders
            WHERE teacher_id = ?
            ORDER BY is_archived ASC, created_at DESC
        """, (teacher_id,))
        folder_rows = cursor.fetchall()

        folders = []
        seen_pins = set()

        for f in folder_rows:
            f_dict = dict(f)
            pin = f_dict['pin']
            seen_pins.add(pin)
            is_active = (pin == current_pin)
            f_dict['is_active'] = is_active

            # Aggregate stats from student_results for this folder/pin
            cursor.execute("""
                SELECT 
                    COUNT(id) as student_count,
                    ROUND(AVG(accuracy_rate), 1) as avg_accuracy,
                    ROUND(AVG(wcpm), 1) as avg_wcpm,
                    SUM(CASE WHEN reading_level = 'Independent' THEN 1 ELSE 0 END) as independent_count,
                    SUM(CASE WHEN reading_level = 'Instructional' THEN 1 ELSE 0 END) as instructional_count,
                    SUM(CASE WHEN reading_level = 'Frustration' THEN 1 ELSE 0 END) as frustration_count,
                    MAX(timestamp) as last_activity
                FROM student_results
                WHERE teacher_id = ? AND classroom_pin = ?
            """, (teacher_id, pin))
            stats = dict(cursor.fetchone() or {})

            f_dict['student_count'] = stats.get('student_count') or 0
            f_dict['avg_accuracy'] = stats.get('avg_accuracy') or 0.0
            f_dict['avg_wcpm'] = stats.get('avg_wcpm') or 0.0
            f_dict['independent_count'] = stats.get('independent_count') or 0
            f_dict['instructional_count'] = stats.get('instructional_count') or 0
            f_dict['frustration_count'] = stats.get('frustration_count') or 0
            f_dict['last_activity'] = stats.get('last_activity')
            folders.append(f_dict)

        # Check if there are any orphaned student_results with a pin not in classroom_folders
        cursor.execute("""
            SELECT DISTINCT classroom_pin, folder_name
            FROM student_results
            WHERE teacher_id = ? AND classroom_pin IS NOT NULL AND classroom_pin != ''
        """, (teacher_id,))
        orphans = cursor.fetchall()
        need_recheck = False
        for orphan in orphans:
            o_pin = orphan['classroom_pin']
            if o_pin not in seen_pins:
                o_name = orphan['folder_name'] or f"Class Session (PIN: {o_pin})"
                cursor.execute("""
                    INSERT INTO classroom_folders (teacher_id, pin, folder_name, is_archived)
                    VALUES (?, ?, ?, 1)
                """, (teacher_id, o_pin, o_name))
                seen_pins.add(o_pin)
                need_recheck = True
        if need_recheck:
            conn.commit()
            return get_teacher_folders(teacher_id)

        # Sort so active is first, then by last_activity or created_at desc
        folders.sort(key=lambda x: (0 if x['is_active'] else 1, x.get('last_activity') or x['created_at']), reverse=False)

        return {
            "success": True,
            "current_pin": current_pin,
            "folders": folders
        }
    finally:
        conn.close()

def create_or_rename_folder(teacher_id, pin, folder_name):
    """Creates or renames a class session folder for a teacher."""
    clean_pin = str(pin).strip()
    clean_name = folder_name.strip()
    if not clean_pin or not clean_name:
        return {"success": False, "error": "PIN and Folder Name are required."}

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM classroom_folders WHERE teacher_id = ? AND pin = ?", (teacher_id, clean_pin))
        row = cursor.fetchone()
        if row:
            cursor.execute("""
                UPDATE classroom_folders
                SET folder_name = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (clean_name, row['id']))
        else:
            cursor.execute("""
                INSERT INTO classroom_folders (teacher_id, pin, folder_name, is_archived)
                VALUES (?, ?, ?, 0)
            """, (teacher_id, clean_pin, clean_name))

        # Sync folder name in student_results
        cursor.execute("""
            UPDATE student_results
            SET folder_name = ?
            WHERE teacher_id = ? AND classroom_pin = ?
        """, (clean_name, teacher_id, clean_pin))

        conn.commit()
        return {"success": True, "pin": clean_pin, "folder_name": clean_name}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def delete_teacher_folder(teacher_id, pin):
    """Deletes a class folder and its associated student results."""
    clean_pin = str(pin).strip()
    if not clean_pin:
        return {"success": False, "error": "PIN is required."}

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Check if this is the active PIN
        cursor.execute("SELECT classroom_pin FROM teachers WHERE id = ?", (teacher_id,))
        t_row = cursor.fetchone()
        if t_row and str(t_row['classroom_pin']).strip() == clean_pin:
            # Generate a new PIN for the teacher so they aren't left without an active PIN
            new_pin = generate_unique_pin()
            cursor.execute("UPDATE teachers SET classroom_pin = ? WHERE id = ?", (new_pin, teacher_id))
            cursor.execute("""
                INSERT INTO classroom_folders (teacher_id, pin, folder_name, is_archived)
                VALUES (?, ?, ?, 0)
            """, (teacher_id, new_pin, f"Class Session (PIN: {new_pin})"))

        cursor.execute("DELETE FROM classroom_folders WHERE teacher_id = ? AND pin = ?", (teacher_id, clean_pin))
        cursor.execute("DELETE FROM student_results WHERE teacher_id = ? AND classroom_pin = ?", (teacher_id, clean_pin))
        conn.commit()
        return {"success": True, "deleted_pin": clean_pin}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def export_teacher_results_to_csv(teacher_id, pin=None):
    """Exports student results for a teacher as an in-memory CSV string."""
    results = get_teacher_student_results(teacher_id, pin=pin)
    output = io.StringIO()
    writer = csv.writer(output)

    # Header Row
    writer.writerow([
        "Record ID",
        "Timestamp",
        "Classroom PIN",
        "Folder / Section",
        "Student Name",
        "Passage Title",
        "Reading Level (Phil-IRI)",
        "Reading Accuracy Rate (%)",
        "WCPM (Words/Min)",
        "Composite Score",
        "Duration (Seconds)",
        "Correct Words",
        "Total Words",
        "Errors Detected"
    ])

    for r in results:
        writer.writerow([
            r['id'],
            r['timestamp'],
            r.get('classroom_pin') or 'N/A',
            r.get('folder_name') or 'General',
            r['student_name'],
            r['passage_title'],
            r['reading_level'],
            r['accuracy_rate'],
            r['wcpm'],
            r['composite_score'],
            r['duration_seconds'],
            r['correct_words'],
            r['total_target_words'],
            r['errors_detected']
        ])

    output.seek(0)
    return output.getvalue()

def delete_student_result(teacher_id, record_id):
    """Deletes a specific student result record owned by the teacher."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM student_results WHERE id = ? AND teacher_id = ?", (int(record_id), int(teacher_id)))
        conn.commit()
        if cursor.rowcount > 0:
            return {"success": True, "deleted_count": cursor.rowcount}
        else:
            return {"success": False, "error": "Record not found or not owned by this teacher."}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def clear_teacher_student_results(teacher_id, pin=None):
    """Clears all student result records for a given teacher, or for a specific PIN folder."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if pin and str(pin).strip().lower() != 'all':
            cursor.execute("DELETE FROM student_results WHERE teacher_id = ? AND classroom_pin = ?", (int(teacher_id), str(pin).strip()))
        else:
            cursor.execute("DELETE FROM student_results WHERE teacher_id = ?", (int(teacher_id),))
        conn.commit()
        return {"success": True, "deleted_count": cursor.rowcount}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

# =================================================================
# 10. SCHOOL SUPER-ADMINISTRATOR AUTHENTICATION & MULTI-FACTOR ENGINE
# =================================================================

def get_admin_status():
    """Checks whether the solo master administrator account is initialized."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, username, email, created_at FROM admin_account WHERE id = 1")
        row = cursor.fetchone()
        if not row:
            return {"is_setup": False}
        email = row['email']
        parts = email.split('@')
        masked = f"{parts[0][:2]}***@{parts[1]}" if len(parts) == 2 and len(parts[0]) > 2 else email
        return {
            "is_setup": True,
            "username": row['username'],
            "masked_email": masked,
            "created_at": row['created_at']
        }
    finally:
        conn.close()

def setup_initial_admin(username, email, password, pin):
    """
    Sets up the singleton Master Administrator account.
    Generates a secure emergency 16-character recovery key and stores hashed credentials.
    """
    if not username or not email or not password or not pin:
        return {"success": False, "error": "Username, email, password, and 6-digit PIN are required."}
    
    clean_username = username.strip()
    clean_email = email.strip().lower()
    clean_pin = str(pin).strip()

    if len(clean_pin) != 6 or not clean_pin.isdigit():
        return {"success": False, "error": "Admin master PIN must be exactly 6 digits."}

    # Generate offline emergency recovery key (e.g. RF-A9B2-7C4E-8D1F)
    raw_recovery_key = f"RF-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"
    
    pwd_hash = generate_password_hash(password)
    pin_hash = generate_password_hash(clean_pin)
    recovery_hash = generate_password_hash(raw_recovery_key)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Check if already setup
        cursor.execute("SELECT id FROM admin_account WHERE id = 1")
        if cursor.fetchone():
            return {"success": False, "error": "Administrator account is already initialized. Cannot run setup again."}

        cursor.execute("""
            INSERT INTO admin_account (id, username, email, password_hash, pin_hash, recovery_code_hash)
            VALUES (1, ?, ?, ?, ?, ?)
        """, (clean_username, clean_email, pwd_hash, pin_hash, recovery_hash))
        conn.commit()

        log_admin_audit("INITIAL_SETUP", f"Master administrator account created for {clean_username} ({clean_email})")

        return {
            "success": True,
            "username": clean_username,
            "email": clean_email,
            "recovery_key": raw_recovery_key
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def verify_admin_password(username_or_email, password):
    """Step 1: Validates administrator username/email and password."""
    if not username_or_email or not password:
        return {"success": False, "error": "Username and password required."}
    
    ident = username_or_email.strip().lower()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM admin_account WHERE id = 1")
        admin = cursor.fetchone()
        if not admin:
            return {"success": False, "error": "Administrator account has not been set up yet."}
        
        matches_username = admin['username'].lower() == ident
        matches_email = admin['email'].lower() == ident

        if not (matches_username or matches_email):
            return {"success": False, "error": "Invalid administrator credentials."}

        if not check_password_hash(admin['password_hash'], password):
            return {"success": False, "error": "Invalid administrator password."}

        # Mask email for step 2/3
        parts = admin['email'].split('@')
        masked = f"{parts[0][:2]}***@{parts[1]}" if len(parts) == 2 and len(parts[0]) > 2 else admin['email']

        return {
            "success": True,
            "step": "pin_required",
            "username": admin['username'],
            "masked_email": masked,
            "email": admin['email']
        }
    finally:
        conn.close()

def verify_admin_pin(pin):
    """Step 2: Validates the master 6-digit PIN."""
    if not pin:
        return {"success": False, "error": "6-digit Master PIN is required."}
    
    clean_pin = str(pin).strip()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM admin_account WHERE id = 1")
        admin = cursor.fetchone()
        if not admin:
            return {"success": False, "error": "Administrator account not configured."}

        if not check_password_hash(admin['pin_hash'], clean_pin):
            return {"success": False, "error": "Invalid 6-digit Master PIN."}

        return {"success": True, "email": admin['email'], "username": admin['username']}
    finally:
        conn.close()

def verify_admin_recovery_code(code):
    """Emergency fallback: verifies 16-character recovery key and generates a session."""
    if not code:
        return {"success": False, "error": "Recovery key required."}
    
    clean_code = code.strip().upper()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM admin_account WHERE id = 1")
        admin = cursor.fetchone()
        if not admin:
            return {"success": False, "error": "Administrator account not configured."}

        if not check_password_hash(admin['recovery_code_hash'], clean_code):
            return {"success": False, "error": "Invalid emergency recovery key."}

        # Issue session
        session = create_admin_session()
        log_admin_audit("EMERGENCY_RECOVERY_LOGIN", "Admin logged in using offline recovery key")
        return {"success": True, "token": session['token'], "expires_at": session['expires_at']}
    finally:
        conn.close()

def create_admin_otp(email):
    """Generates a 6-digit OTP code, stores hash with 10-minute expiry, and returns raw code."""
    otp_code = f"{random.randint(100000, 999999)}"
    code_hash = generate_password_hash(otp_code)
    expires_at = (datetime.utcnow() + timedelta(minutes=10)).strftime('%Y-%m-%d %H:%M:%S')

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM admin_otp WHERE email = ?", (email,))
        cursor.execute("""
            INSERT INTO admin_otp (email, code_hash, expires_at)
            VALUES (?, ?, ?)
        """, (email, code_hash, expires_at))
        conn.commit()
        return {"success": True, "otp_code": otp_code, "expires_at": expires_at}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def verify_admin_otp(email, user_code):
    """Step 3: Verifies the 6-digit email OTP and issues an admin session token."""
    if not user_code:
        return {"success": False, "error": "Please enter the 6-digit verification code."}
    
    clean_code = str(user_code).strip()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT * FROM admin_otp WHERE email = ? ORDER BY id DESC LIMIT 1
        """, (email,))
        row = cursor.fetchone()
        if not row:
            return {"success": False, "error": "No verification code pending. Please request a new code."}

        # Check expiration
        now_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        if row['expires_at'] < now_str:
            return {"success": False, "error": "Verification code has expired. Please request a new code."}

        if not check_password_hash(row['code_hash'], clean_code):
            cursor.execute("UPDATE admin_otp SET attempts = attempts + 1 WHERE id = ?", (row['id'],))
            conn.commit()
            return {"success": False, "error": "Incorrect verification code. Please check your email."}

        # Consumed
        cursor.execute("DELETE FROM admin_otp WHERE email = ?", (email,))
        conn.commit()

        session = create_admin_session()
        log_admin_audit("ADMIN_LOGIN_SUCCESS", f"Administrator logged in successfully via 2FA ({email})")

        return {
            "success": True,
            "token": session['token'],
            "expires_at": session['expires_at']
        }
    finally:
        conn.close()

def create_admin_session():
    """Issues a 64-char cryptographic admin session token valid for 8 hours."""
    token = secrets.token_hex(32)
    expires_at = (datetime.utcnow() + timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Prune expired sessions
        now_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("DELETE FROM admin_sessions WHERE expires_at < ?", (now_str,))
        
        cursor.execute("""
            INSERT INTO admin_sessions (token, expires_at)
            VALUES (?, ?)
        """, (token, expires_at))
        conn.commit()
        return {"token": token, "expires_at": expires_at}
    finally:
        conn.close()

def validate_admin_session(token):
    """Validates an active admin session token."""
    if not token:
        return False
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        now_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute("""
            SELECT * FROM admin_sessions WHERE token = ? AND expires_at > ?
        """, (token.strip(), now_str))
        return bool(cursor.fetchone())
    finally:
        conn.close()

def destroy_admin_session(token):
    """Revokes an admin session token (logout)."""
    if not token:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM admin_sessions WHERE token = ?", (token.strip(),))
        conn.commit()
        log_admin_audit("ADMIN_LOGOUT", "Admin logged out successfully")
    finally:
        conn.close()

# =================================================================
# 11. DYNAMIC NLP & PHONETIC CORRECTION RULES ENGINE (ZERO-CODE)
# =================================================================

def get_nlp_corrections(search=None):
    """Fetches all custom NLP and phonetic substitution rules."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if search:
            q = f"%{search.strip().lower()}%"
            cursor.execute("""
                SELECT * FROM nlp_corrections
                WHERE LOWER(spoken_phrase) LIKE ? OR LOWER(replacement_phrase) LIKE ? OR LOWER(notes) LIKE ?
                ORDER BY id DESC
            """, (q, q, q))
        else:
            cursor.execute("SELECT * FROM nlp_corrections ORDER BY id DESC")
        
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()

def get_active_nlp_corrections():
    """Returns active (spoken_phrase, replacement_phrase, rule_type) for evaluation pipeline."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT spoken_phrase, replacement_phrase, rule_type
            FROM nlp_corrections
            WHERE is_active = 1
            ORDER BY LENGTH(spoken_phrase) DESC
        """)
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()

def add_nlp_correction(spoken_phrase, replacement_phrase, rule_type='exact', notes=''):
    """Adds a new dynamic NLP word or phonetic substitution rule."""
    if not spoken_phrase or not replacement_phrase:
        return {"success": False, "error": "Both spoken phrase and replacement phrase are required."}
    
    clean_spoken = spoken_phrase.strip().lower()
    clean_replacement = replacement_phrase.strip()
    clean_type = rule_type if rule_type in ['exact', 'regex', 'phonetic'] else 'exact'

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO nlp_corrections (spoken_phrase, replacement_phrase, rule_type, is_active, notes)
            VALUES (?, ?, ?, 1, ?)
        """, (clean_spoken, clean_replacement, clean_type, notes.strip()))
        conn.commit()
        rule_id = cursor.lastrowid
        log_admin_audit("NLP_RULE_ADDED", f"Added rule: '{clean_spoken}' -> '{clean_replacement}' ({clean_type})")
        return {"success": True, "id": rule_id}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def update_nlp_correction(rule_id, spoken_phrase, replacement_phrase, rule_type='exact', is_active=1, notes=''):
    """Updates an existing dynamic NLP substitution rule."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE nlp_corrections
            SET spoken_phrase = ?, replacement_phrase = ?, rule_type = ?, is_active = ?, notes = ?
            WHERE id = ?
        """, (spoken_phrase.strip().lower(), replacement_phrase.strip(), rule_type, int(is_active), notes.strip(), int(rule_id)))
        conn.commit()
        log_admin_audit("NLP_RULE_UPDATED", f"Updated rule #{rule_id}: '{spoken_phrase}' -> '{replacement_phrase}'")
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def toggle_nlp_correction(rule_id, is_active=None):
    """Enables, disables, or inverts an NLP rule."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if is_active is None:
            cursor.execute("SELECT is_active FROM nlp_corrections WHERE id = ?", (int(rule_id),))
            row = cursor.fetchone()
            if not row:
                return {"success": False, "error": "Rule not found"}
            new_state = 0 if row['is_active'] else 1
        else:
            new_state = 1 if is_active else 0

        cursor.execute("UPDATE nlp_corrections SET is_active = ? WHERE id = ?", (new_state, int(rule_id)))
        conn.commit()
        return {"success": True, "is_active": bool(new_state)}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def delete_nlp_correction(rule_id):
    """Deletes an NLP substitution rule."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM nlp_corrections WHERE id = ?", (int(rule_id),))
        conn.commit()
        log_admin_audit("NLP_RULE_DELETED", f"Deleted rule #{rule_id}")
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

# =================================================================
# 12. SYSTEM CONFIGURATION & ENGINE SETTINGS (STORED IN SQLITE)
# =================================================================

def get_system_settings():
    """Retrieves all global system configuration key-value pairs."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT key, value FROM system_settings")
        settings = {row['key']: row['value'] for row in cursor.fetchall()}
        return settings
    finally:
        conn.close()

def update_system_settings(settings_dict):
    """Updates global system configuration key-value pairs."""
    if not isinstance(settings_dict, dict):
        return {"success": False, "error": "Dictionary required"}
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        for k, v in settings_dict.items():
            cursor.execute("""
                INSERT INTO system_settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """, (str(k), str(v)))
        conn.commit()
        log_admin_audit("SYSTEM_SETTINGS_UPDATED", f"Updated settings: {list(settings_dict.keys())}")
        return {"success": True, "settings": get_system_settings()}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

# =================================================================
# 13. USER & TEACHER GOVERNANCE FOR ADMINISTRATORS
# =================================================================

def get_all_teachers_admin(search=None):
    """
    Returns full list of teachers with student evaluation counts,
    active passages, and classroom PINs for administrative monitoring.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            SELECT 
                t.id, t.name, t.name AS full_name, t.username, t.email, t.classroom_pin, t.created_at,
                COUNT(DISTINCT p.id) AS total_passages,
                COUNT(DISTINCT r.id) AS total_evaluations
            FROM teachers t
            LEFT JOIN custom_passages p ON p.teacher_id = t.id
            LEFT JOIN student_results r ON r.teacher_id = t.id
        """
        params = []
        if search:
            q = f"%{search.strip().lower()}%"
            query += " WHERE LOWER(t.name) LIKE ? OR LOWER(t.username) LIKE ? OR LOWER(t.email) LIKE ? OR t.classroom_pin LIKE ?"
            params.extend([q, q, q, q])
        
        query += " GROUP BY t.id ORDER BY t.id DESC"
        cursor.execute(query, params)
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()

def admin_create_teacher(data):
    """Allows administrator to create a teacher account directly."""
    name = (data.get('name') or data.get('full_name') or '').strip()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    email = data.get('email', '').strip().lower()
    security_question = data.get('security_question', 'Ano ang unang paaralan kung saan ka nagturo?').strip()
    security_answer = data.get('security_answer', 'filipino').strip().lower()
    provided_pin = str(data.get('classroom_pin') or data.get('pin') or '').strip()

    if not name or not username or not password or not email:
        return {"success": False, "error": "All fields (name, username, password, email) are required."}

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM teachers WHERE LOWER(username) = ?", (username.lower(),))
        if cursor.fetchone():
            return {"success": False, "error": f"Username '{username}' is already taken."}

        pin = provided_pin if len(provided_pin) == 6 and provided_pin.isdigit() else generate_unique_pin()
        pwd_hash = generate_password_hash(password)
        ans_hash = generate_password_hash(security_answer)

        cursor.execute("""
            INSERT INTO teachers (name, username, password_hash, email, security_question, security_answer_hash, classroom_pin)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (name, username, pwd_hash, email, security_question, ans_hash, pin))
        conn.commit()
        new_id = cursor.lastrowid
        log_admin_audit("TEACHER_CREATED", f"Admin created teacher {name} (@{username}) with PIN {pin}")
        return {"success": True, "id": new_id, "teacher_id": new_id, "pin": pin, "classroom_pin": pin}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def admin_reset_teacher_password(teacher_id, new_password):
    """Allows administrator to reset a teacher's password without knowing their security question."""
    if not new_password or len(new_password) < 6:
        return {"success": False, "error": "New password must be at least 6 characters."}
    
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT name, username FROM teachers WHERE id = ?", (int(teacher_id),))
        teacher = cursor.fetchone()
        if not teacher:
            return {"success": False, "error": "Teacher not found."}

        pwd_hash = generate_password_hash(new_password)
        cursor.execute("UPDATE teachers SET password_hash = ? WHERE id = ?", (pwd_hash, int(teacher_id)))
        conn.commit()
        log_admin_audit("TEACHER_PWD_RESET", f"Admin reset password for teacher {teacher['name']} (@{teacher['username']})")
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def admin_delete_teacher(teacher_id):
    """Allows administrator to remove a teacher and cascade delete their custom passages and results."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT name, username FROM teachers WHERE id = ?", (int(teacher_id),))
        teacher = cursor.fetchone()
        if not teacher:
            return {"success": False, "error": "Teacher not found."}

        cursor.execute("DELETE FROM teachers WHERE id = ?", (int(teacher_id),))
        conn.commit()
        log_admin_audit("TEACHER_DELETED", f"Admin deleted teacher {teacher['name']} (@{teacher['username']})")
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

# =================================================================
# 14. SCHOOL-WIDE STUDENT RESULTS GOVERNANCE
# =================================================================

def get_all_student_records_admin(search=None, teacher_id=None, limit=500):
    """Fetches school-wide student assessment records across all teachers."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            SELECT 
                r.*, t.name AS teacher_name, t.username AS teacher_username
            FROM student_results r
            JOIN teachers t ON r.teacher_id = t.id
        """
        conditions = []
        params = []

        if teacher_id:
            conditions.append("r.teacher_id = ?")
            params.append(int(teacher_id))

        if search:
            q = f"%{search.strip().lower()}%"
            conditions.append("(LOWER(r.student_name) LIKE ? OR LOWER(r.passage_title) LIKE ? OR LOWER(t.name) LIKE ?)")
            params.extend([q, q, q])

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY r.timestamp DESC LIMIT ?"
        params.append(int(limit))

        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

def admin_delete_student_results_batch(record_ids):
    """Deletes multiple student result records in batch."""
    if not record_ids or not isinstance(record_ids, list):
        return {"success": False, "error": "Record IDs list required"}
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        placeholders = ",".join(["?"] * len(record_ids))
        cursor.execute(f"DELETE FROM student_results WHERE id IN ({placeholders})", record_ids)
        conn.commit()
        deleted = cursor.rowcount
        log_admin_audit("RECORDS_DELETED_BATCH", f"Admin deleted {deleted} student evaluation records")
        return {"success": True, "deleted_count": deleted}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

# =================================================================
# 15. DATABASE MAINTENANCE, BACKUP, & AUDIT LOGS
# =================================================================

def get_database_stats():
    """Gathers SQLite storage size and table statistics."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        stats = {}
        # File size
        if os.path.exists(DB_PATH):
            stats['db_size_mb'] = round(os.path.getsize(DB_PATH) / (1024 * 1024), 2)
        else:
            stats['db_size_mb'] = 0.0

        for table in ['teachers', 'custom_passages', 'student_results', 'nlp_corrections', 'admin_audit_logs']:
            try:
                cursor.execute(f"SELECT COUNT(*) AS c FROM {table}")
                stats[table] = cursor.fetchone()['c']
            except Exception:
                stats[table] = 0

        return stats
    finally:
        conn.close()

def log_admin_audit(action, details=None, ip_address=None):
    """Records an administrative action in the audit trail."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO admin_audit_logs (action, details, ip_address)
            VALUES (?, ?, ?)
        """, (str(action), str(details) if details else None, str(ip_address) if ip_address else None))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[AUDIT LOG ERROR] Could not write audit log: {e}")

def get_admin_audit_logs(limit=100):
    """Retrieves recent audit log entries."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT ?", (int(limit),))
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()

