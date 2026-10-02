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
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

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

    # Schema migration: Ensure classroom_pin column exists in existing databases
    cursor.execute("PRAGMA table_info(teachers)")
    columns = [col['name'] for col in cursor.fetchall()]
    if 'classroom_pin' not in columns:
        cursor.execute("ALTER TABLE teachers ADD COLUMN classroom_pin TEXT")
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
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    )
    """)

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
            "Ano ang paborito mong asignatura?",
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

def regenerate_teacher_pin(teacher_id):
    """
    Generates and saves a brand new 6-digit classroom PIN for the teacher.
    Instantly invalidates the previous PIN so old students cannot re-enter.
    """
    new_pin = generate_unique_pin()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE teachers SET classroom_pin = ? WHERE id = ?", (new_pin, teacher_id))
        conn.commit()
        return {"success": True, "classroom_pin": new_pin}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def verify_classroom_pin(pin):
    """
    Validates a student-entered PIN against active teachers.
    Returns teacher information and their currently active assessment passages.
    """
    if not pin:
        return {"success": False, "error": "Please enter a 6-digit Classroom PIN."}
    
    clean_pin = str(pin).strip()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, name, username FROM teachers WHERE classroom_pin = ?", (clean_pin,))
        teacher = cursor.fetchone()
        if not teacher:
            return {
                "success": False,
                "error": "Invalid Classroom PIN. Please ask your teacher for today's active PIN."
            }
        
        teacher_id = teacher['id']
        teacher_name = teacher['name']
        passages = get_active_passages(teacher_id)
        
        return {
            "success": True,
            "teacher": {
                "id": teacher_id,
                "name": teacher_name,
                "username": teacher['username']
            },
            "passages": passages
        }
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
        cursor.execute("""
            UPDATE custom_passages
            SET title = ?, content = ?, grade_level = ?, timer_seconds = ?
            WHERE id = ? AND teacher_id = ?
        """, (title.strip(), content.strip(), grade_level.strip(), int(timer_seconds), passage_id, teacher_id))
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
                        errors_detected, stutter_words=None, trace_json=None):
    """Saves a student evaluation record into the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        stutters_str = json.dumps(stutter_words or [])
        trace_str = json.dumps(trace_json or [])

        local_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            INSERT INTO student_results (
                teacher_id, passage_id, student_name, passage_title,
                accuracy_rate, wcpm, composite_score, reading_level,
                duration_seconds, correct_words, total_target_words,
                errors_detected, stutter_words, trace_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            teacher_id, passage_id, student_name.strip(), passage_title.strip(),
            round(float(accuracy_rate), 2), round(float(wcpm), 2), round(float(composite_score), 2),
            reading_level.strip(), round(float(duration_seconds), 2), int(correct_words),
            int(total_target_words), int(errors_detected), stutters_str, trace_str, local_now
        ))
        conn.commit()
        return {"success": True, "result_id": cursor.lastrowid}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()

def get_teacher_student_results(teacher_id, search_query=None):
    """Retrieves all assessment results for the teacher, with optional student name search."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if search_query and search_query.strip():
            cursor.execute("""
                SELECT * FROM student_results
                WHERE teacher_id = ? AND student_name LIKE ?
                ORDER BY timestamp DESC
            """, (teacher_id, f"%{search_query.strip()}%"))
        else:
            cursor.execute("""
                SELECT * FROM student_results
                WHERE teacher_id = ?
                ORDER BY timestamp DESC
            """, (teacher_id,))
        
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

def export_teacher_results_to_csv(teacher_id):
    """Exports all student results for a teacher as an in-memory CSV string."""
    results = get_teacher_student_results(teacher_id)
    output = io.StringIO()
    writer = csv.writer(output)

    # Header Row
    writer.writerow([
        "Record ID",
        "Timestamp",
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

def clear_teacher_student_results(teacher_id):
    """Clears all student result records for a given teacher."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM student_results WHERE teacher_id = ?", (int(teacher_id),))
        conn.commit()
        return {"success": True, "deleted_count": cursor.rowcount}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        conn.close()
