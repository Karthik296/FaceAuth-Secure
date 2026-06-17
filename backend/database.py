import sqlite3
import json
import os
import hashlib

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT,
            face_embedding TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    
    # Schema migration: check if password column exists, add if not
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN password TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists
        
    # Create auth_logs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS auth_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT,
            attempt_type TEXT NOT NULL, -- 'face' or 'password'
            similarity_score REAL,
            status TEXT NOT NULL, -- 'success' or 'failure'
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
    print("Database initialized successfully.")

def email_exists(email: str) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM users WHERE email = ?", (email.lower().strip(),))
    exists = cursor.fetchone() is not None
    conn.close()
    return exists

def register_user(first_name: str, last_name: str, email: str, face_embedding: list[float], password: str = None) -> bool:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        embedding_str = json.dumps(face_embedding)
        hashed_pw = hash_password(password) if password else None
        cursor.execute(
            "INSERT INTO users (first_name, last_name, email, password, face_embedding) VALUES (?, ?, ?, ?, ?)",
            (first_name.strip(), last_name.strip(), email.lower().strip(), hashed_pw, embedding_str)
        )
        conn.commit()
        conn.close()
        return True
    except sqlite3.IntegrityError:
        return False
    except Exception as e:
        print(f"Database error during registration: {e}")
        return False

def get_all_users() -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, first_name, last_name, email, password, face_embedding FROM users")
    rows = cursor.fetchall()
    conn.close()
    
    users = []
    for row in rows:
        try:
            embedding = json.loads(row["face_embedding"])
            users.append({
                "id": row["id"],
                "first_name": row["first_name"],
                "last_name": row["last_name"],
                "email": row["email"],
                "password": row["password"],
                "face_embedding": embedding
            })
        except Exception as e:
            print(f"Error parsing embedding for user {row['email']}: {e}")
            continue
            
    return users

def log_auth_attempt(email: str, attempt_type: str, similarity_score: float, status: str) -> bool:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO auth_logs (email, attempt_type, similarity_score, status) VALUES (?, ?, ?, ?)",
            (email.lower().strip() if email else None, attempt_type, similarity_score, status)
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Database error logging authentication attempt: {e}")
        return False

def get_accuracy_stats() -> dict:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # 1. Total face attempts vs password attempts
        cursor.execute("SELECT COUNT(*) FROM auth_logs WHERE attempt_type = 'face'")
        total_face = cursor.fetchone()[0] or 0
        
        cursor.execute("SELECT COUNT(*) FROM auth_logs WHERE attempt_type = 'password'")
        total_password = cursor.fetchone()[0] or 0
        
        # 2. Face success rate
        cursor.execute("SELECT COUNT(*) FROM auth_logs WHERE attempt_type = 'face' AND status = 'success'")
        success_face = cursor.fetchone()[0] or 0
        
        # 3. Avg similarity score for success/failure
        cursor.execute("SELECT AVG(similarity_score) FROM auth_logs WHERE attempt_type = 'face' AND status = 'success' AND similarity_score IS NOT NULL")
        avg_sim_success = cursor.fetchone()[0]
        
        cursor.execute("SELECT AVG(similarity_score) FROM auth_logs WHERE attempt_type = 'face' AND status = 'failure' AND similarity_score IS NOT NULL")
        avg_sim_failure = cursor.fetchone()[0]
        
        # 4. Recent history (last 10 attempts)
        cursor.execute("SELECT email, attempt_type, similarity_score, status, timestamp FROM auth_logs ORDER BY id DESC LIMIT 10")
        rows = cursor.fetchall()
        
        history = []
        for r in rows:
            history.append({
                "email": r["email"],
                "attempt_type": r["attempt_type"],
                "similarity_score": r["similarity_score"],
                "status": r["status"],
                "timestamp": r["timestamp"]
            })
            
        conn.close()
        
        return {
            "total_face_attempts": total_face,
            "total_password_attempts": total_password,
            "face_success_count": success_face,
            "face_success_rate": round((success_face / total_face * 100), 2) if total_face > 0 else 0.0,
            "avg_similarity_success": round(avg_sim_success, 4) if avg_sim_success is not None else 0.0,
            "avg_similarity_failure": round(avg_sim_failure, 4) if avg_sim_failure is not None else 0.0,
            "recent_history": history
        }
    except Exception as e:
        print(f"Error getting accuracy stats: {e}")
        return {
            "total_face_attempts": 0,
            "total_password_attempts": 0,
            "face_success_count": 0,
            "face_success_rate": 0.0,
            "avg_similarity_success": 0.0,
            "avg_similarity_failure": 0.0,
            "recent_history": []
        }

def get_users_list() -> dict:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, first_name, last_name, email, created_at FROM users ORDER BY created_at DESC")
        rows = cursor.fetchall()
        
        # Successful logins count
        cursor.execute("SELECT COUNT(*) FROM auth_logs WHERE status = 'success'")
        success_count = cursor.fetchone()[0] or 0
        
        # Failed logins count
        cursor.execute("SELECT COUNT(*) FROM auth_logs WHERE status = 'failure'")
        fail_count = cursor.fetchone()[0] or 0
        
        # Active logins count (unique users who successfully logged in within the last 15 minutes)
        cursor.execute("SELECT COUNT(DISTINCT email) FROM auth_logs WHERE status = 'success' AND timestamp >= datetime('now', '-15 minutes')")
        active_count = cursor.fetchone()[0] or 0
        
        conn.close()
        
        users = []
        for row in rows:
            users.append({
                "id": row["id"],
                "first_name": row["first_name"],
                "last_name": row["last_name"],
                "email": row["email"],
                "created_at": row["created_at"]
            })
        return {
            "users": users,
            "successful_logins": success_count,
            "failed_logins": fail_count,
            "active_logins": active_count
        }
    except Exception as e:
        print(f"Database error getting users list: {e}")
        return {"users": [], "successful_logins": 0, "failed_logins": 0, "active_logins": 0}

def get_user_logs(email: str) -> list[dict]:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT attempt_type, similarity_score, status, timestamp FROM auth_logs WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) ORDER BY id DESC",
            (email,)
        )
        rows = cursor.fetchall()
        conn.close()
        
        logs = []
        for r in rows:
            logs.append({
                "attempt_type": r["attempt_type"],
                "similarity_score": r["similarity_score"],
                "status": r["status"],
                "timestamp": r["timestamp"]
            })
        return logs
    except Exception as e:
        print(f"Database error getting logs for user {email}: {e}")
        return []

def delete_user(email: str) -> bool:
    try:
        conn = get_connection()
        cursor = conn.cursor()
        # Delete user logs
        cursor.execute("DELETE FROM auth_logs WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))", (email,))
        # Delete user
        cursor.execute("DELETE FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))", (email,))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Database error deleting user {email}: {e}")
        return False

# Automatically initialize database when database.py is imported or run
if __name__ != "__main__":
    init_db()

