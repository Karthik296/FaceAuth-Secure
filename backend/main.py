from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
import database
import face_engine

app = FastAPI(title="Face Authentication API", version="1.0.0")

# Setup CORS to allow React frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database on startup
@app.on_event("startup")
def startup_event():
    database.init_db()

# Pydantic schemas for request validation
class RegisterRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    image: str # Base64 encoded image string

class LoginRequest(BaseModel):
    image: str # Base64 encoded image string

class VerifyFaceRequest(BaseModel):
    image: str # Base64 encoded image string

class PasswordLoginRequest(BaseModel):
    email: EmailStr
    password: str

@app.post("/api/verify-face")
def verify_face(payload: VerifyFaceRequest):
    # 1. Decode base64 image
    img = face_engine.decode_base64_image(payload.image)
    if img is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to process image data. Please capture again."
        )
    
    # 2. Extract embedding from verification picture
    embedding, err = face_engine.extract_face_embedding(img)
    if err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err
        )
        
    # 3. Check if this face is already registered
    users = database.get_all_users()
    SFACE_THRESHOLD = 0.363
    for user in users:
        score = face_engine.get_cosine_similarity(embedding, user["face_embedding"])
        if score >= SFACE_THRESHOLD:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This face is already registered. Please go to the Login page to sign in."
            )
            
    return {"status": "success", "message": "Face template verified and available."}

@app.post("/api/register")
def register(payload: RegisterRequest):
    # 1. Check if email already exists
    if database.email_exists(payload.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )
    
    # 2. Decode the base64 image
    img = face_engine.decode_base64_image(payload.image)
    if img is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to process image data. Please capture again."
        )
    
    # 3. Extract the face embedding
    embedding, err = face_engine.extract_face_embedding(img)
    if err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err
        )
        
    # 3b. Check if this face is already registered to another user
    users = database.get_all_users()
    SFACE_THRESHOLD = 0.363
    for user in users:
        score = face_engine.get_cosine_similarity(embedding, user["face_embedding"])
        if score >= SFACE_THRESHOLD:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This face is already registered. Please go to the Login page to sign in."
            )
    
    # 4. Save user details to DB
    success = database.register_user(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        face_embedding=embedding,
        password=payload.password
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save registration details in the database."
        )
        
    return {"status": "success", "message": "User registered successfully!"}

@app.post("/api/login")
def login(payload: LoginRequest):
    # 1. Decode base64 image
    img = face_engine.decode_base64_image(payload.image)
    if img is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to process image data."
        )
    
    # 2. Extract embedding from login picture
    login_embedding, err = face_engine.extract_face_embedding(img)
    if err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err
        )
    
    # 3. Retrieve all users from database
    users = database.get_all_users()
    if not users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No registered users found. Please register first."
        )
    
    # 4. Compare login embedding with all users
    best_score = -1.0
    matched_user = None
    
    # SFace cosine similarity threshold is typically 0.363
    SFACE_THRESHOLD = 0.363
    
    for user in users:
        score = face_engine.get_cosine_similarity(login_embedding, user["face_embedding"])
        if score > best_score:
            best_score = score
            matched_user = user
            
    print(f"Login attempt: best similarity score is {best_score:.4f} with user {matched_user['email'] if matched_user else 'None'}")
    
    if matched_user is not None and best_score >= SFACE_THRESHOLD:
        database.log_auth_attempt(matched_user["email"], "face", best_score, "success")
        return {
            "status": "success",
            "message": "Login successful!",
            "user": {
                "first_name": matched_user["first_name"],
                "last_name": matched_user["last_name"],
                "email": matched_user["email"]
            },
            "similarity_score": best_score
        }
    else:
        email_to_log = matched_user["email"] if matched_user else "unknown"
        database.log_auth_attempt(email_to_log, "face", best_score if best_score >= 0 else 0.0, "failure")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Face doesn't match any registered user. Please try again."
        )

@app.post("/api/login-password")
def login_password(payload: PasswordLoginRequest):
    # 1. Retrieve user by email
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT first_name, last_name, email, password FROM users WHERE email = ?", (payload.email.lower().strip(),))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        database.log_auth_attempt(payload.email, "password", None, "failure")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
    
    # 2. Check password
    stored_password = row["password"]
    if not stored_password:
        database.log_auth_attempt(payload.email, "password", None, "failure")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account does not have a password set. Please register again."
        )
        
    hashed_input = database.hash_password(payload.password)
    if hashed_input != stored_password:
        database.log_auth_attempt(payload.email, "password", None, "failure")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
        
    database.log_auth_attempt(payload.email, "password", None, "success")
    return {
        "status": "success",
        "message": "Login successful!",
        "user": {
            "first_name": row["first_name"],
            "last_name": row["last_name"],
            "email": row["email"]
        }
    }

@app.get("/api/accuracy-stats")
def accuracy_stats():
    return database.get_accuracy_stats()

@app.get("/api/users")
def get_users():
    data = database.get_users_list()
    return {
        "status": "success",
        "users": data["users"],
        "successful_logins": data["successful_logins"],
        "failed_logins": data["failed_logins"],
        "active_logins": data["active_logins"]
    }

@app.get("/api/users/{email}/logs")
def get_user_logs(email: str):
    logs = database.get_user_logs(email)
    return {"status": "success", "logs": logs}

@app.delete("/api/users/{email}")
def delete_user(email: str):
    success = database.delete_user(email)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete user {email}."
        )
    return {"status": "success", "message": f"User {email} deleted successfully."}

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

